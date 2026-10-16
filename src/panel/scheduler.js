// T Part 5 (PANEL-BUILD.md T addendum, C.5): the panel's scheduler. The panel server runs the clock and the folder watch
// while it is up; with the panel off nothing fires (T6), and slots missed collapse to ONE catch-up when it comes back.
//
// ONE `tick()` does the sync work; the tests call it by hand with an injected clock and await what it returns (the fires
// it started). The real timer only calls it.
//   - 500 ms: the folder watch needs a file's size and mtime to hold for STABLE_POLLS (2) polls, so a drop is seen about
//     1.5 s after it stops changing. Poll only, never fs.watch (EMFILE on hamr's machine, and it misses atomic renames).
//   - the timer is unref'd, `start`/`stop` are idempotent, the server's close calls `stop`.
//   - with no schedule on disk a tick is one readdir and nothing else (no runs.jsonl read).
// What a tick does for one job with a signed schedule:
//   1. arm it if it is not armed under this signing (a crash between the sign and the arm);
//   2. clock kinds: `due`; a due slot goes to `door.fire` and is NOT consumed up front: the starter's `beforeSpawn` writes
//      the `fire` row only after busy, monthly, wouldAccept and the session all said yes, so a refused slot retries;
//   3. file kinds: `poll`; each file taken is recorded `arrived` (THIS is the only writer of `arrived` rows), then the
//      queue runs: busy tells each queued file once and waits; free, the head is looked at again (deleted or changed is
//      dropped with a reason, the next head is tried) and goes through `door.fire`; `ran` is written by `beforeSpawn` only.
// One job's exception is written once as a `refused` row and never stops the others (fwd scheduler.js:94-110).
// BUSY IS CHEAP (T19): the run list is read at most ONCE per tick, and only when a fire or a queued head needs it.
// Rewritten from fwdloop src/panel/scheduler.js.
import { due } from '../triggerclock.js';
import { isClockTrigger, isFileTrigger } from '../trigger.js';
import { appendRow, readLedger } from '../triggerledger.js';
import {
  createFileTrigger, queueOf, readSeen, recheck, recordArrived, recordDropped, recordRan,
} from '../triggerfiles.js';
import { recordFire } from '../triggerclock.js';

/**
 * @param {{ door: ReturnType<typeof import('./schedules.js').createScheduleDoor>, now?: () => number, intervalMs?: number }} opts
 *   `intervalMs` 0 = no timer (a test drives `tick`).
 */
export function createScheduler(opts) {
  const { door, now = Date.now, intervalMs = 500 } = opts;
  /** @type {Map<string, ReturnType<typeof createFileTrigger>>} */
  const watchers = new Map();
  /** `job|sig` keys already armed this process @type {Set<string>} */
  const armedKeys = new Set();
  /** jobs with a fire still awaiting its start (a headless prepare can take minutes): never fired a second time meanwhile @type {Set<string>} */
  const inflight = new Set();
  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null;

  /**
   * The queue of a file trigger (arrived minus ran minus dropped, oldest first).
   * @param {string} job @param {string} ledger @param {string} sig @param {number} nowMs @param {() => boolean} isBusy @param {Promise<unknown>[]} pending
   */
  function runQueue(job, ledger, sig, nowMs, isBusy, pending) {
    let queue = queueOf(readSeen(ledger));
    if (queue.length === 0 || inflight.has(job)) return;
    const busy = isBusy();
    if (busy) {
      // every queued file is told ONCE (`busy`, once per sha) and waits
      for (const q of queue) pending.push(door.fire(job, { kind: 'file', path: q.path, sha: q.sha, size: q.size }, { busy: true }));
      return;
    }
    while (queue.length > 0) {
      const q = queue[0];
      const seen = recheck(q);
      if (seen.state !== 'ok') {
        const why = seen.state === 'deleted' ? 'deleted' : 'changed';
        recordDropped(ledger, q, why, nowMs, sig);
        appendRow(ledger, {
          kind: why, sig, at: nowMs, sha: q.sha, file: q.path,
          say: seen.state === 'deleted' ? `${q.name} did not run: ${seen.say}.` : `${q.name} did not run: it changed before its turn; the new version arrives again.`,
        });
        queue = queue.slice(1);
        continue;
      }
      const item = { path: seen.path, sha: seen.sha, size: seen.size };
      pending.push(startFire(job, { kind: 'file', ...item }, { busy: false, beforeSpawn: () => { recordRan(ledger, item, nowMs, sig); } }, sig));
      return;
    }
  }

  /**
   * Fire and remember it is in flight until it settles. A throw is written once and never escapes.
   * @param {string} job @param {Parameters<ReturnType<typeof import('./schedules.js').createScheduleDoor>['fire']>[1]} cause
   * @param {{busy?: boolean, beforeSpawn?: () => void}} hooks @param {string} sig
   */
  function startFire(job, cause, hooks, sig) {
    inflight.add(job);
    return door.fire(job, cause, hooks)
      .catch((e) => { door.tellOnce(job, sig, `fire|${/** @type {Error} */ (e).message}`, `The run could not start: ${/** @type {Error} */ (e).message}`); })
      .finally(() => { inflight.delete(job); });
  }

  /** @returns {Promise<void>} resolves when every fire this tick started has settled */
  function tick() {
    const jobs = door.scan();
    if (jobs.length === 0) { watchers.clear(); armedKeys.clear(); return Promise.resolve(); }
    const nowMs = now();
    /** @type {Promise<unknown>[]} */
    const pending = [];
    /** the ONE read of the run list this tick, taken the first time a job needs it @type {Map<string, boolean>} */
    const busyMemo = new Map();
    const live = new Set();
    for (const { job, schedule } of jobs) {
      const sig = schedule.specHash;
      const key = `${job}|${sig}`;
      live.add(key);
      const isBusy = () => {
        if (!busyMemo.has(job)) busyMemo.set(job, door.busy(job));
        return /** @type {boolean} */ (busyMemo.get(job));
      };
      try {
        if (!armedKeys.has(key)) { door.armFor(job, schedule); armedKeys.add(key); }
        const ledger = door.ledgerOf(job);
        const { trigger } = schedule;
        if (isFileTrigger(trigger)) {
          let w = watchers.get(key);
          if (!w) {
            w = createFileTrigger({
              mode: trigger.kind === 'new-file' ? 'new' : 'updated', target: trigger.kind === 'new-file' ? trigger.folder : trigger.path, ledger, sig, now,
            });
            watchers.set(key, w);
          }
          const { arrived, refused } = w.poll();
          for (const r of refused) door.tellOnce(job, sig, `refused|${r.path}|${r.why}`, `${r.path}: ${r.why}`);
          // THE writer of `arrived`: the arrival time is this clock, never the file's mtime
          for (const f of arrived) recordArrived(ledger, f, nowMs, sig);
          // RULED 2026-10-15: a schedule that gave up is paused (read from the ledger): files still queue as `arrived`, none runs
          if (!door.paused(job)) runQueue(job, ledger, sig, nowMs, isBusy, pending);
        } else if (isClockTrigger(trigger)) {
          if (inflight.has(job) || door.paused(job)) continue;
          const d = due(trigger, readLedger(ledger).rows, nowMs);
          if (d.fire) {
            pending.push(startFire(job, { kind: 'clock', slot: /** @type {number} */ (d.slot), catchUp: d.catchUp, missed: d.missed },
              { busy: isBusy(), beforeSpawn: () => { recordFire(ledger, d, nowMs, sig); } }, sig));
          }
        }
      } catch (e) {
        const why = /** @type {Error} */ (e).message;
        try { door.tellOnce(job, sig, `tick|${why}`, why); } catch { /* the ledger itself is unwritable: nothing more to do for this job */ }
      }
    }
    for (const k of [...watchers.keys()]) if (!live.has(k)) watchers.delete(k);
    for (const k of [...armedKeys]) if (!live.has(k)) armedKeys.delete(k);
    return Promise.all(pending).then(() => undefined);
  }

  return {
    tick,
    /** Start the real timer (idempotent). */
    start() {
      if (intervalMs <= 0 || timer !== null) return;
      timer = setInterval(() => { tick().catch(() => { /* one bad tick never stops the next */ }); }, intervalMs);
      timer.unref();
    },
    /** Stop it (idempotent). The server's close calls this. */
    stop() {
      if (timer !== null) { clearInterval(timer); timer = null; }
    },
    /** whether the real timer is running (a test reads this) */
    get running() { return timer !== null; },
  };
}
