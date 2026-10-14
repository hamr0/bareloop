// T Part 3 (PANEL-BUILD.md T addendum, C.3): the schedule door. The ONE place a trigger is set or cancelled, and
// the one reader the cards use. Two clicks, both $0 (no drafter, no run, no provider call):
//   prepare(body)  POST /api/author/schedule-prepare   first click: every check, signs and writes nothing, returns {words, hash}
//   set(body)      POST /api/author/schedule           second click: carries the hash; signs, writes schedule.json, arms
//   cancel(body)   (same route, `when: null`)          never refused: reads no green gate, no spec, no keys, no monthly limit
// Files live under `<home>/triggers/<job>/` keyed by JOB NAME (never by signature hash), so a re-sign writes into
// the same folder and a queued file is never orphaned (T18):
//   schedule.json   the CURRENT signed schedule (atomic write; absent = by hand)
//   ledger.jsonl    ONE append-only ledger, every row carrying `sig` (the spec hash it was written under)
// Rewritten from fwdloop src/panel/authortrigger.js (prepare/set/read/armFor/shapeOf); bareloop's gate is `greenFor`.
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { readRunList, runIsAlive, runlistHome } from '../runlist.js';
import { jobSpecHash, validateJob, workflowKey } from '../job.js';
import { parseInputs } from '../jobblock.js';
import { looksLikeRepoSource } from '../source.js';
import { checkMonthlyRoom, monthlyRefusalText } from '../monthly.js';
import { ConfigError } from '../config.js';
import { doorAccepted } from '../reviewdoor.js';
import { findRow } from '../providerrows.js';
import { validateTrigger, isClockTrigger, isFileTrigger } from '../trigger.js';
import { armTrigger, nextSlot, recordFire } from '../triggerclock.js';
import { appendRow, readLedger, withoutReleased } from '../triggerledger.js';
import { checkTarget, createFileTrigger, queueOf, readSeen, recordDropped, recordRan } from '../triggerfiles.js';
import { SCHEDULE_WORDS, scheduledWords } from '../schedulewords.js';
import { buildReuseSpec, validateReuseCard } from './authorsession.js';

/** a spawn error after the consuming row releases it at most this many times; then it stays consumed (bounded rows) */
export const MAX_RELEASES = 3;
/** a headless start counts as busy from the fire until runs.jsonl shows a row for the job, or this long */
const STARTING_MS = 120_000;
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
/** the outcome rows a card's "last outcome" may be (clock and file alike) */
const OUTCOME_KINDS = ['started', 'busy', 'monthly-exhausted', 'refused', 'deleted', 'changed'];

/**
 * @typedef {{runid: string, outcome: string|null, spec: any, records: any[]}} JobRun
 * @typedef {{job: string, trigger: import('../trigger.js').Trigger, spec: any, specHash: string, workflowKey: string,
 *   originRunid: string, inputsText: string, signedBy: string, signedAt: string}} Schedule
 */

/**
 * @param {{
 *   home?: string,
 *   sessionsRoot?: string,
 *   now?: () => number,
 *   jobRuns: (job: string) => JobRun[],
 *   startFrom: (runid: string) => any,
 *   jobOfRun: (runid: string) => string|null,
 *   rowsFor: () => readonly import('../providerrows.js').KeyRow[],
 * }} deps `jobRuns(job)` = the job's listed runs, newest first, each with its signed spec when on disk and its terminal
 *   outcome off the spine; `startFrom(runid)` = the panel's `getStartFrom`; `jobOfRun` = the listed run's job name.
 */
export function createScheduleDoor(deps) {
  const { now = Date.now } = deps;
  /** @type {ReturnType<typeof import('./schedulestart.js').createStarter>|null} */
  let starter = null;
  /** job -> ms the headless start began: closes the gap between the spawn and the row run-u appends (T19) @type {Map<string, number>} */
  const starting = new Map();
  const triggersRoot = join(runlistHome(deps.home), 'triggers');
  /** @param {string} job */
  const dirOf = (job) => {
    if (!SLUG_RE.test(job)) throw new Error(`"${job}" is not a job name`);
    return join(triggersRoot, job);
  };
  /** @param {string} job */
  const ledgerOf = (job) => join(dirOf(job), 'ledger.jsonl');
  /** @param {string} job */
  const scheduleFileOf = (job) => join(dirOf(job), 'schedule.json');

  /** The current signed schedule of a job, or null (absent, unreadable or not an object). @param {string} job @returns {Schedule|null} */
  function readSchedule(job) {
    try {
      const o = JSON.parse(readFileSync(scheduleFileOf(job), 'utf8'));
      return o && typeof o === 'object' && o.trigger && typeof o.specHash === 'string' ? o : null;
    } catch { return null; }
  }

  /** @param {string} job @param {Schedule} schedule */
  function writeSchedule(job, schedule) {
    const file = scheduleFileOf(job);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(schedule, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, file);
  }

  /**
   * THE gate (T3). The job's CURRENT workflow key is the key of its newest listed run whose signed spec is on disk.
   * It passes when a run with THAT key has a real `green` outcome (`already-green` does not count) and, for a rubric
   * job, that run's spine holds an honoured accept. An edited job has a new key, so an older green does not count (T5).
   * @param {string} job
   * @returns {{ok: true, run: JobRun, key: string} | {ok: false, say: string}}
   */
  function greenFor(job) {
    const runs = deps.jobRuns(job);
    const head = runs.find((r) => r.spec);
    if (!head) return { ok: false, say: SCHEDULE_WORDS.notGreen };
    const key = workflowKey(head.spec);
    const hit = runs.find((r) => r.spec && workflowKey(r.spec) === key && r.outcome === 'green'
      && (r.spec.verdictType !== 'soft-green' || doorAccepted(r.records)));
    return hit ? { ok: true, run: hit, key } : { ok: false, say: SCHEDULE_WORDS.notGreen };
  }

  /**
   * The ONE writer of "this schedule was armed". A file kind records what is already there first (it never runs),
   * then the armed row, so a failure between the two leaves it unarmed and the next call finishes it. Idempotent for
   * a signing: a second call with the same sig writes nothing. Throws, naming why, when the target is not usable.
   * @param {string} job @param {Schedule} schedule @param {{baseline?: boolean}} [o] `baseline: false` = a re-sign that kept the same folder/file: its queue and baseline stand
   */
  function armFor(job, schedule, o = {}) {
    const sig = schedule.specHash;
    const ledger = ledgerOf(job);
    if (readLedger(ledger).rows.some((r) => r.kind === 'armed' && r.sig === sig)) return { armed: true, already: true };
    if (isFileTrigger(schedule.trigger) && o.baseline !== false) {
      const t = schedule.trigger;
      createFileTrigger({
        mode: t.kind === 'new-file' ? 'new' : 'updated', target: t.kind === 'new-file' ? t.folder : t.path, ledger, sig, now,
      }).arm();
    }
    armTrigger(ledger, now(), sig);
    return { armed: true, already: false };
  }

  /**
   * Every queued file gets one `dropped` row with its reason and one plain-words outcome row — never silent, never orphaned.
   * @param {string} job @param {string} sig the signature the new rows are written under @param {'schedule-changed'|'schedule-cancelled'|'schedule-edited'} why
   */
  function dropQueue(job, sig, why) {
    const ledger = ledgerOf(job);
    for (const item of queueOf(readSeen(ledger))) {
      recordDropped(ledger, item, why, now(), sig);
      appendRow(ledger, {
        kind: 'changed', sig, at: now(), sha: item.sha, file: item.name, why,
        say: `${item.name} was waiting to run and did not: ${why === 'schedule-changed' ? 'the schedule was changed to watch something else' : why === 'schedule-edited' ? 'the job was edited, which clears its schedule' : 'the schedule was cancelled'}.`,
      });
    }
  }

  /** Remove a job's schedule, writing the plain rows first. @param {string} job @param {Schedule} cur @param {'cancelled'|'edited'} kind */
  function removeSchedule(job, cur, kind) {
    const why = kind === 'edited' ? 'schedule-edited' : 'schedule-cancelled';
    const sig = cur.specHash;
    dropQueue(job, sig, why);
    appendRow(ledgerOf(job), { kind, sig, at: now(), say: kind === 'edited' ? 'The job was edited, so its schedule was cleared. It is by hand again.' : 'The schedule was cancelled. The job is by hand again.' });
    rmSync(scheduleFileOf(job), { force: true });
  }

  /**
   * Every $0 check of a schedule change, shared by both clicks.
   * @param {any} body
   */
  function inspect(body) {
    /** @param {number} status @param {Record<string, any>} b */
    const reply = (status, b) => ({ ok: /** @type {false} */ (false), reply: { status, body: { ok: false, ...b } } });
    const runid = typeof body?.runid === 'string' ? body.runid : '';
    const job = (typeof body?.job === 'string' && SLUG_RE.test(body.job) ? body.job : null) ?? deps.jobOfRun(runid);
    if (!job || !SLUG_RE.test(job)) return reply(400, { refused: 'run', say: 'That run is not in the list. Nothing was changed.' });
    // by hand: a cancel reads nothing else (T3, never refused)
    if (body?.when === null) {
      const cur = readSchedule(job);
      return { ok: /** @type {true} */ (true), cancel: /** @type {true} */ (true), job, cur, words: SCHEDULE_WORDS.cancelWords, hash: cancelHash(job, cur) };
    }
    const green = greenFor(job);
    if (!green.ok) return reply(409, { refused: 'no-green-run', say: green.say });
    const tv = validateTrigger(body?.when);
    if (!tv.ok) return reply(400, { refused: 'bad-trigger', say: `${tv.say}. Nothing was changed.` });
    const { trigger } = tv;
    const pre = deps.startFrom(green.run.runid);
    if (!pre || !pre.ok) return reply(409, { refused: 'no-green-run', say: SCHEDULE_WORDS.notGreen });
    const rows = deps.rowsFor();
    const worker = findRow(rows, { provider: pre.spec.provider, baseUrl: pre.spec.baseUrl, model: pre.spec.model });
    // Model stays the green run's (T9): the card's model is the signed one, never an open box here
    const card = {
      inputs: body?.inputs, destination: body?.destination, capUsd: body?.capUsd, maxWallMs: body?.maxWallMs,
      model: pre.spec.model, ...(worker ? { provider: worker.envName } : {}),
    };
    const rv = validateReuseCard(card, { rows });
    if (!rv.ok) return reply(400, { refused: 'bad-card', say: `${rv.error}. Nothing was changed.` });
    const ip = parseInputs(card.inputs);
    if (isFileTrigger(trigger)) {
      // a repo job's later inputs must be tracked files inside the repo, so an outside file cannot be one (I.3)
      const first = ip.ok ? ip.inputs[0]?.value : '';
      if (pre.spec.verdictType !== 'soft-green' || (first && looksLikeRepoSource(first))) {
        return reply(400, { refused: 'bad-trigger', say: 'A job that works on a repo cannot start when a file arrives. Only a job on your own files can. Nothing was changed.' });
      }
      try {
        checkTarget(trigger.kind === 'new-file' ? 'new' : 'updated', trigger.kind === 'new-file' ? trigger.folder : trigger.path);
        if (trigger.kind === 'file-updated') {
          if (!existsSync(dirname(trigger.path))) throw new Error(`the folder of ${trigger.path} does not exist`);
        }
      } catch (e) {
        return reply(400, { refused: 'bad-trigger', say: `${/** @type {Error} */ (e).message}. Nothing was changed.` });
      }
    }
    const spec = buildReuseSpec(pre.spec, card, rows);
    spec.trigger = trigger;
    const jv = validateJob(spec, { shellCapUsd: spec.budgetUsd });
    if (!jv.ok) return reply(400, { refused: 'bad-spec', say: `The job this would sign is not valid (${jv.reds.map((r) => `${r.code} at ${r.path}`).join('; ')}). Nothing was changed.` });
    if (workflowKey(spec) !== green.key) return reply(400, { refused: 'bad-spec', say: 'The job this would sign is not the one that had the good run. Nothing was changed.' });
    let monthlyNote = null;
    try {
      const room = checkMonthlyRoom({ capUsd: spec.budgetUsd, home: deps.home, sessionsRoot: deps.sessionsRoot });
      const refusal = monthlyRefusalText(room);
      if (refusal) monthlyNote = `${refusal}. Each run is checked against the monthly limit when it starts.`;
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      monthlyNote = /** @type {Error} */ (e).message;
    }
    return {
      ok: /** @type {true} */ (true), cancel: /** @type {false} */ (false), job, trigger, spec, key: green.key, originRunid: green.run.runid,
      inputsText: typeof card.inputs === 'string' ? card.inputs : '', words: scheduledWords(trigger, deps.home), hash: jobSpecHash(spec), monthlyNote,
      cur: readSchedule(job),
    };
  }

  /** the hash a cancel's second click carries: binds the job and the signing it removes @param {string} job @param {Schedule|null} cur */
  function cancelHash(job, cur) {
    return jobSpecHash({ cancel: job, of: cur ? cur.specHash : null });
  }

  /** Does a re-sign keep the same kind and the same folder/file (so the queue is carried over)? @param {Schedule|null} cur @param {import('../trigger.js').Trigger} next */
  function sameTarget(cur, next) {
    const a = cur?.trigger;
    if (!a || !isFileTrigger(a) || !isFileTrigger(next) || a.kind !== next.kind) return false;
    return a.kind === 'new-file' ? a.folder === /** @type {any} */ (next).folder : a.path === /** @type {any} */ (next).path;
  }

  /**
   * Is a run of this job live, or a start in progress? Reads the run list ONCE and asks `runIsAlive` of this job's rows;
   * a run waiting at its review door has ended (its pid is gone), so it is NOT busy (T7). Part 5 adds the pid-reuse guard.
   * @param {string} job
   */
  function busy(job) {
    const rows = readRunList({ home: deps.home }).rows.filter((r) => r && r.job === job);
    const t = starting.get(job);
    if (t !== undefined) {
      if (now() - t >= STARTING_MS || rows.some((r) => Date.parse(r.at) >= t)) starting.delete(job);
      else return true;
    }
    return rows.some((r) => runIsAlive(r, now()));
  }

  return {
    /** The starter is built after the author routes (which need this door), so it is attached here. @param {ReturnType<typeof import('./schedulestart.js').createStarter>} s */
    attachStarter(s) { starter = s; },

    busy,

    /**
     * One fire, in this order (T15): busy, then monthly, then wouldAccept, then the starter (which calls `beforeSpawn`, the
     * ONE consuming row, only after every "no" is behind it). Each outcome is ONE row in ledger.jsonl, told once per
     * `key|outcome|why` (read back from disk, so a restart does not repeat it). RULED 2026-10-14: a busy, monthly or refused
     * fire consumes NOTHING, so the next tick tries again; a spawn error after `beforeSpawn` writes a `released` row (bounded).
     * @param {string} job
     * @param {{kind: 'clock', slot: number, catchUp: boolean, missed: number} | {kind: 'file', path: string, sha: string, size?: number}} cause
     * @param {{beforeSpawn?: () => void}} [hooks]
     * @returns {Promise<{outcome: 'busy'|'monthly-exhausted'|'refused'|'started', why?: string, told: boolean, sessionId?: string}>}
     */
    async fire(job, cause, hooks = {}) {
      const schedule = readSchedule(job);
      if (!schedule || !starter) return { outcome: 'refused', why: 'This job has no schedule any more. Nothing started.', told: false };
      const sig = schedule.specHash;
      const ledger = ledgerOf(job);
      const key = cause.kind === 'file' ? cause.sha : String(cause.slot);
      const consumeId = cause.kind === 'file' ? `ran:${cause.sha}` : `fire:${cause.slot}`;
      const base = cause.kind === 'file' ? { file: cause.path, sha: cause.sha } : { slot: cause.slot, catchUp: cause.catchUp, missed: cause.missed };
      /** @param {'busy'|'monthly-exhausted'|'refused'} outcome @param {string} why @param {Record<string, unknown>} [extra] */
      const told = (outcome, why, extra = {}) => {
        const tag = `${key}|${outcome}|${why}`;
        const seen = readLedger(ledger).rows.some((r) => r.told === tag);
        if (!seen) appendRow(ledger, { kind: outcome, sig, at: now(), told: tag, key, ...base, why, ...extra });
        return { outcome, why, told: !seen };
      };
      if (busy(job)) return told('busy', 'A run of this job is still going. This one starts when it is done.');
      try {
        const room = checkMonthlyRoom({ capUsd: schedule.spec.budgetUsd, home: deps.home, sessionsRoot: deps.sessionsRoot });
        if (!room.ok) {
          return told('monthly-exhausted', 'Not enough money left this month for this run.', { leftUsd: room.leftUsd, needUsd: schedule.spec.budgetUsd, atLeast: room.atLeast === true });
        }
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        return told('refused', `${e.message} — refusing rather than guess the monthly limit. Nothing started.`);
      }
      // already consumed (a live `fire`/`ran` row, e.g. given up on after releases): never start it a second time
      if (readLedger(ledger).rows.length > 0 && withoutReleased(readLedger(ledger).rows).some((r) => r.id === consumeId)) {
        return { outcome: 'refused', why: 'This one was already started or given up on.', told: false };
      }
      const accept = starter.wouldAccept(job, cause);
      if (!accept.ok) return told('refused', accept.why);
      const beforeSpawn = hooks.beforeSpawn ?? (() => {
        if (cause.kind === 'file') recordRan(ledger, { sha: cause.sha, path: cause.path, size: cause.size ?? 0 }, now(), sig);
        else recordFire(ledger, { fire: true, slot: cause.slot, catchUp: cause.catchUp, missed: cause.missed }, now(), sig);
      });
      starting.set(job, now());
      const r = await starter.start(job, cause, { beforeSpawn });
      if (r.ok) {
        appendRow(ledger, { kind: 'started', sig, at: now(), key, ...base, sessionId: r.sessionId, specHash: r.specHash });
        return { outcome: 'started', told: true, sessionId: r.sessionId };
      }
      starting.delete(job);
      if (r.consumed) {
        // a spawn error AFTER the consuming row: release it so the slot or file is retryable, a bounded number of times
        const releases = readLedger(ledger).rows.filter((x) => x.kind === 'released' && x.of === consumeId).length;
        if (releases < MAX_RELEASES) {
          appendRow(ledger, { kind: 'released', of: consumeId, sig, at: now(), why: r.why });
          return told('refused', `${r.why} It will be tried again.`);
        }
        return told('refused', `${r.why} It was tried ${MAX_RELEASES} times and is given up on.`);
      }
      return told('refused', r.why);
    },

    greenFor,
    armFor,
    readSchedule,
    ledgerOf,

    /** Click 1. All $0 checks; signs and writes nothing; returns `{words, hash, monthlyNote}`. @param {any} body */
    prepare(body) {
      const s = inspect(body);
      if (!s.ok) return s.reply;
      return { status: 200, body: { ok: true, job: s.job, words: s.words, hash: s.hash, monthlyNote: s.cancel ? null : s.monthlyNote, cancel: s.cancel } };
    },

    /** Click 2, carrying the hash it was shown. $0: no drafter, no run. @param {any} body */
    set(body) {
      const s = inspect(body);
      if (!s.ok) return s.reply;
      if (typeof body.hash !== 'string' || body.hash !== s.hash) return { status: 409, body: { ok: false, refused: 'stale-hash', say: SCHEDULE_WORDS.stale } };
      if (s.cancel) {
        if (s.cur) removeSchedule(s.job, s.cur, 'cancelled');
        return { status: 200, body: { ok: true, job: s.job, cancelled: true, words: SCHEDULE_WORDS.cancelWords } };
      }
      const cur = s.cur;
      const keep = sameTarget(cur, s.trigger);
      if (cur && !keep && isFileTrigger(cur.trigger)) dropQueue(s.job, jobSpecHash(s.spec), 'schedule-changed');
      /** @type {Schedule} */
      const schedule = {
        job: s.job, trigger: s.trigger, spec: s.spec, specHash: s.hash, workflowKey: s.key, originRunid: s.originRunid,
        inputsText: s.inputsText, signedBy: userInfo().username, signedAt: new Date(now()).toISOString(),
      };
      writeSchedule(s.job, schedule);
      let armed = true; let say = null;
      try { armFor(s.job, schedule, { baseline: !keep }); } catch (e) { armed = false; say = `The schedule is signed but not armed yet: ${/** @type {Error} */ (e).message}.`; }
      return { status: 200, body: { ok: true, job: s.job, words: s.words, hash: s.hash, armed, ...(say ? { say } : {}) } };
    },

    /** Cancel a job's schedule, never refused. @param {string} job @returns {boolean} there was one */
    cancel(job) {
      const cur = SLUG_RE.test(job) ? readSchedule(job) : null;
      if (!cur) { rmSync(scheduleFileOf(job), { force: true }); return false; }
      removeSchedule(job, cur, 'cancelled');
      return true;
    },

    /**
     * The edit rule (T5, D.7): a signed spec whose workflow key differs from the schedule's clears the schedule.
     * A Reuse or a hand run of the same workflow has the same key and clears nothing.
     * @param {string} job @param {string} key @returns {boolean} cleared
     */
    clearIfEdited(job, key) {
      if (!SLUG_RE.test(job)) return false;
      const cur = readSchedule(job);
      if (!cur || cur.workflowKey === key) return false;
      removeSchedule(job, cur, 'edited');
      return true;
    },

    /** Every job with a schedule.json: `{job, dir, schedule}`. One readdir; nothing else read when there is none. */
    scan() {
      /** @type {{job: string, dir: string, schedule: Schedule}[]} */
      const out = [];
      let names = [];
      try { names = readdirSync(triggersRoot); } catch { return out; }
      for (const job of names) {
        if (!SLUG_RE.test(job)) continue;
        const schedule = readSchedule(job);
        if (schedule) out.push({ job, dir: dirOf(job), schedule });
      }
      return out;
    },

    /**
     * What a card shows of a job's schedule, as DATA (no words): the trigger, whether it is armed under the CURRENT
     * signing, the next slot (clock kinds), the last outcome (rows under the current signing only, never a wall-clock
     * compare, T19), whether the job has a green run, and the refusal sentence when it has none.
     * @param {string} job
     */
    read(job) {
      if (!SLUG_RE.test(job)) return null;
      const schedule = readSchedule(job);
      const green = greenFor(job);
      const base = { job, hasGreen: green.ok, refusal: green.ok ? null : green.say };
      if (!schedule) return { ...base, schedule: null, trigger: null, armed: false, armedAt: null, nextSlotMs: null, lastOutcome: null };
      const rows = withoutReleased(readLedger(ledgerOf(job)).rows).filter((r) => r.sig === schedule.specHash);
      const armed = rows.find((r) => r.kind === 'armed');
      const outcomes = rows.filter((r) => OUTCOME_KINDS.includes(r.kind));
      return {
        ...base, schedule, trigger: schedule.trigger, armed: armed !== undefined, armedAt: armed ? armed.at : null,
        nextSlotMs: isClockTrigger(schedule.trigger) && armed ? nextSlot(/** @type {any} */ (schedule.trigger), now()) : null,
        lastOutcome: outcomes.length > 0 ? outcomes[outcomes.length - 1] : null,
      };
    },
  };
}
