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
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir, userInfo } from 'node:os';
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
import {
  SCHEDULE_WORDS, dateTimeWords, gaveUpDateWords, lateRefusalWords, nextInWords, nextSlotShort, nextTimeWords, scheduledNextFor, scheduledWords, skippedWords,
} from '../schedulewords.js';
import { buildReuseSpec, startDestinationProblem, validateReuseCard } from './authorsession.js';

/** a spawn error after the consuming row releases it at most this many times; then it stays consumed (bounded rows) */
export const MAX_RELEASES = 3;
/** a headless start counts as busy from the fire until runs.jsonl shows a row for the job, or this long */
const STARTING_MS = 120_000;
/** a live pid whose process started more than this after its run row was written is a RECYCLED pid, not that run */
export const PID_REUSE_SLACK_MS = 5000;
/** Linux counts process start time in clock ticks; 100 is the value on every mainstream build (getconf CLK_TCK) */
const CLK_TCK = 100;
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
/** the outcome rows a card's "last outcome" may be (clock and file alike) */
/** the rows that are one FIRE's result (what the SCHEDULE row calls `last`) */
const FIRE_KINDS = ['started', 'busy', 'monthly-exhausted', 'refused'];
const OUTCOME_KINDS = ['started', 'busy', 'monthly-exhausted', 'refused', 'deleted', 'changed', 'gave-up'];
/** RULED 2026-10-15: waits (ms) between consecutive `install-needed` refusals of a job: Fibonacci 1, 2, 3, 5, 8, 13, 21 minutes. A test injects its own via `deps.installRetrySteps`. */
export const INSTALL_RETRY_STEPS_MS = Object.freeze([1, 2, 3, 5, 8, 13, 21].map((m) => m * 60_000));
/** RULED 2026-10-15: the total wait a slot or file gets. A wait that would pass it is not taken: the schedule gives up and pauses (the job waits in Needs you). */
export const INSTALL_GIVE_UP_MS = 60 * 60_000;

/**
 * When a process started, in epoch ms, from `/proc/<pid>/stat` field 22 (clock ticks since boot) and `/proc/stat` btime
 * (whole seconds, so good to about a second). `null` where /proc cannot be read: the caller then trusts `isLiveRunner` alone.
 * @param {number} pid
 * @param {(path: string) => string} [read]
 * @returns {number|null}
 */
export function procStartMs(pid, read = (p) => readFileSync(p, 'utf8')) {
  try {
    const stat = read(`/proc/${pid}/stat`);
    // the command name (field 2) sits in parentheses and may hold spaces or parentheses: count fields after the LAST ")"
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ticks = Number(after[19]); // field 22 = index 19 after the state (field 3)
    const btime = Number((/^btime (\d+)$/m.exec(read('/proc/stat')) ?? [])[1]);
    if (!Number.isFinite(ticks) || !Number.isFinite(btime)) return null;
    return btime * 1000 + (ticks / CLK_TCK) * 1000;
  } catch { return null; }
}

/**
 * Is this listed run's runner alive? `runIsAlive` (the pid is alive AND a bareloop runner) plus the PID REUSE GUARD: a
 * pid whose process started MORE than 5 s after the row was written is a recycled pid, not that run. A resumed run's row
 * keeps its first leg's time while its pid is the latest leg's, so the guard is skipped for it (the cmdline check stands).
 * @param {any} row @param {number} nowMs
 */
export function runnerAlive(row, nowMs) {
  if (!runIsAlive(row, nowMs)) return false;
  if (!Number.isInteger(row.pid) || row.leg !== undefined) return true;
  const at = Date.parse(row.at);
  const started = procStartMs(row.pid);
  if (!Number.isFinite(at) || started === null) return true;
  return started <= at + PID_REUSE_SLACK_MS;
}

/**
 * @typedef {{runid: string, outcome: string|null, spec: any, records: any[]}} JobRun
 * @typedef {{job: string, trigger: import('../trigger.js').Trigger, spec: any, specHash: string, workflowKey: string,
 *   originRunid: string, inputsText: string, destination?: string, signedBy: string, signedAt: string}} Schedule
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
 *   runRows?: () => any[],
 *   installRetrySteps?: readonly number[], installGiveUpMs?: number,
 *   userHome?: string,
 * }} deps `userHome` = the folder shown as `~` in words (default the OS home). `installRetrySteps` (ms) and `installGiveUpMs` = the install-needed back-off (tests inject them). `runRows` = a test seam for the one run-list read the busy check does. `jobRuns(job)` = the job's listed runs, newest first, each with its signed spec when on disk and its terminal
 *   outcome off the spine; `startFrom(runid)` = the panel's `getStartFrom`; `jobOfRun` = the listed run's job name.
 */
export function createScheduleDoor(deps) {
  const { now = Date.now } = deps;
  const userHome = deps.userHome ?? homedir();
  /** @type {ReturnType<typeof import('./schedulestart.js').createStarter>|null} */
  let starter = null;
  /** job -> ms the headless start began: closes the gap between the spawn and the row run-u appends (T19) @type {Map<string, number>} */
  const starting = new Map();
  const installSteps = deps.installRetrySteps ?? INSTALL_RETRY_STEPS_MS;
  const giveUpMs = deps.installGiveUpMs ?? INSTALL_GIVE_UP_MS;
  /** job -> {key, count, firstAt, until, why}: consecutive `install-needed` refusals; the job's fire waits until `until` (RULED 2026-10-15, Fibonacci waits). In memory: a restart begins at the first wait again. @type {Map<string, {key: string, count: number, firstAt: number, until: number, why: string}>} */
  const installWait = new Map();
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
   * @param {string} job @param {string} sig the signature the new rows are written under @param {'schedule-changed'|'schedule-cancelled'} why
   */
  function dropQueue(job, sig, why) {
    const ledger = ledgerOf(job);
    for (const item of queueOf(readSeen(ledger))) {
      recordDropped(ledger, item, why, now(), sig);
      appendRow(ledger, {
        kind: 'changed', sig, at: now(), sha: item.sha, file: item.name, why,
        say: `${item.name} was waiting to run and did not: ${why === 'schedule-changed' ? 'the schedule was changed to watch something else' : 'the schedule was cancelled'}.`,
      });
    }
  }

  /** Remove a job's schedule (a cancel), writing the plain rows first. An edit never does (v1.100); old `edited` rows still read. @param {string} job @param {Schedule} cur */
  function removeSchedule(job, cur) {
    const sig = cur.specHash;
    dropQueue(job, sig, 'schedule-cancelled');
    appendRow(ledgerOf(job), { kind: 'cancelled', sig, at: now(), say: 'The schedule was cancelled. The job is by hand again.' });
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
    // the SAME Destination check the session start runs (never a copy), at both clicks: a fire that would be refused for its
    // Destination is never signed
    const destProblem = startDestinationProblem({ ...card, checkType: pre.spec.verdictType === 'soft-green' ? 'rubric' : 'deterministic' });
    if (destProblem !== null) return reply(400, { refused: 'bad-card', say: `${destProblem.replace(/ Nothing spent\.$/, '')} Nothing was changed.` });
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
    // an absolute Destination (a plain-files job's per-run folder) is not in the spec, so it rides on the schedule and in the hash the
    // two clicks bind: changing it between the clicks is a stale hash. The signature (`hash`) stays the spec's own.
    const destination = typeof card.destination === 'string' && /^(\/|[a-zA-Z]:[\\/])/.test(card.destination.trim()) ? card.destination.trim() : null;
    return {
      ok: /** @type {true} */ (true), cancel: /** @type {false} */ (false), job, trigger, spec, key: green.key, originRunid: green.run.runid,
      inputsText: typeof card.inputs === 'string' ? card.inputs : '', words: scheduledWords(trigger, userHome), hash: jobSpecHash(spec), monthlyNote,
      destination, bind: destination === null ? jobSpecHash(spec) : jobSpecHash({ spec, destination }),
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
   * a run waiting at its review door has ended (its pid is gone), so it is NOT busy (T7). Carries the pid-reuse guard.
   * @param {string} job
   */
  function busy(job) {
    const rows = (deps.runRows ? deps.runRows() : readRunList({ home: deps.home }).rows).filter((r) => r && r.job === job);
    const t = starting.get(job);
    if (t !== undefined) {
      if (now() - t >= STARTING_MS || rows.some((r) => Date.parse(r.at) >= t)) starting.delete(job);
      else return true;
    }
    return rows.some((r) => runnerAlive(r, now()));
  }

  /**
   * The schedule and what the ledger says about it, as DATA: armed under the CURRENT signing, the next slot (clock kinds),
   * the last outcome (rows with `sig` equal to the current signing, never a wall-clock compare, T19). No green gate.
   * @param {string} job
   */
  function stateOf(job) {
    const schedule = readSchedule(job);
    if (!schedule) return { schedule: null, trigger: null, armed: false, armedAt: null, nextSlotMs: null, lastOutcome: null, retryInMs: null, gaveUp: null };
    const rows = withoutReleased(readLedger(ledgerOf(job)).rows).filter((r) => r.sig === schedule.specHash);
    const armed = rows.find((r) => r.kind === 'armed');
    const outcomes = rows.filter((r) => OUTCOME_KINDS.includes(r.kind));
    return {
      schedule, trigger: schedule.trigger, armed: armed !== undefined, armedAt: armed ? armed.at : null,
      nextSlotMs: isClockTrigger(schedule.trigger) && armed ? nextSlot(/** @type {any} */ (schedule.trigger), now()) : null,
      lastOutcome: outcomes.length > 0 ? outcomes[outcomes.length - 1] : null,
      retryInMs: (() => { const w = installWait.get(job); return w && w.until > now() ? w.until - now() : null; })(),
      gaveUp: pausedRow(rows),
    };
  }

  /**
   * RULED 2026-10-15: the `gave-up` row that pauses a schedule, or null. Read from the ledger (a restart does not resume trying): the
   * newest of the `gave-up` / `resumed` rows of the CURRENT signing is a `gave-up`. A re-sign writes `resumed` (so an identical re-sign unpauses too).
   * @param {import('../triggerledger.js').LedgerRow[]} rows the live rows of the current signing
   */
  function pausedRow(rows) {
    const marks = rows.filter((r) => r.kind === 'gave-up' || r.kind === 'resumed');
    const last = marks.length > 0 ? marks[marks.length - 1] : null;
    return last !== null && last.kind === 'gave-up' ? last : null;
  }

  /** Is this job's schedule paused (it gave up)? @param {string} job */
  function paused(job) {
    const schedule = readSchedule(job);
    if (!schedule) return false;
    return pausedRow(withoutReleased(readLedger(ledgerOf(job)).rows).filter((r) => r.sig === schedule.specHash)) !== null;
  }

  /**
   * The newest fire of the CURRENT signing: a `started` row or one that started nothing (`busy`, `monthly-exhausted`, `refused`), or null.
   * @param {string} job @param {Schedule} schedule
   */
  function lastFireRow(job, schedule) {
    const rows = withoutReleased(readLedger(ledgerOf(job)).rows).filter((r) => r.sig === schedule.specHash && FIRE_KINDS.includes(r.kind));
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }

  /** @type {Map<string, {key: string, green: ReturnType<typeof greenFor>}>} */
  const greenMemo = new Map();
  /**
   * `greenFor`, memoised on the job's run-list state (each of its spines' size and mtime), so the Run tab's poll does not
   * re-parse every run of the job each time. A finished run changes its spine, so the key moves and the gate is asked again.
   * @param {string} job
   */
  function cachedGreen(job) {
    const rows = (deps.runRows ? deps.runRows() : readRunList({ home: deps.home }).rows).filter((r) => r && r.job === job);
    const key = rows.map((r) => {
      try { const st = statSync(r.spine); return `${r.runid}:${st.size}:${st.mtimeMs}`; } catch { return `${r.runid}:gone`; }
    }).join('|');
    const hit = greenMemo.get(job);
    if (hit && hit.key === key) return hit.green;
    const green = greenFor(job);
    greenMemo.set(job, { key, green });
    return green;
  }

  return {
    /** The starter is built after the author routes (which need this door), so it is attached here. @param {ReturnType<typeof import('./schedulestart.js').createStarter>} s */
    attachStarter(s) { starter = s; },

    busy,
    paused,

    /**
     * RULED 2026-10-15: the fires that started NOTHING (busy, month used up, refused) of every signing that was made from `originRunid`
     * (a `signed` row names the run it was set from; the CURRENT schedule.json's own originRunid covers a signing made before that row existed).
     * Newest first, at most `limit`. Lines are `MM/DD HH:MM  <words>`.
     * @param {string} job @param {string} originRunid @param {number} [limit]
     * @returns {{at: number, line: string}[]}
     */
    skippedFor(job, originRunid, limit = 7) {
      if (!SLUG_RE.test(job)) return [];
      const rows = withoutReleased(readLedger(ledgerOf(job)).rows);
      const sigs = new Set(rows.filter((r) => r.kind === 'signed' && r.originRunid === originRunid).map((r) => r.sig));
      const cur = readSchedule(job);
      if (cur && cur.originRunid === originRunid) sigs.add(cur.specHash);
      return rows.map((r, i) => ({ r, i }))
        .filter(({ r }) => (r.kind === 'busy' || r.kind === 'monthly-exhausted' || r.kind === 'refused') && sigs.has(/** @type {string} */ (r.sig)))
        .sort((a, b) => (Number(b.r.at) - Number(a.r.at)) || (b.i - a.i))
        .slice(0, limit)
        .map(({ r }) => ({ at: Number(r.at), line: `${dateTimeWords(Number(r.at))}  ${skippedWords(r)}` }));
    },

    /**
     * One fire, in this order (T15): busy, then monthly, then wouldAccept, then the starter (which calls `beforeSpawn`, the
     * ONE consuming row, only after every "no" is behind it). Each outcome is ONE row in ledger.jsonl, told once per
     * `key|outcome|why` (read back from disk, so a restart does not repeat it). RULED 2026-10-14: a busy, monthly or refused
     * fire consumes NOTHING, so the next tick tries again; a spawn error after `beforeSpawn` writes a `released` row (bounded).
     * @param {string} job
     * @param {{kind: 'clock', slot: number, catchUp: boolean, missed: number} | {kind: 'file', path: string, sha: string, size?: number}} cause
     * @param {{beforeSpawn?: () => void, busy?: boolean}} [hooks] `busy` = the scheduler's one read of the run list this tick
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
      if (paused(job)) return { outcome: 'refused', why: 'This schedule gave up and is waiting for you. Nothing started.', told: false };
      if (hooks.busy ?? busy(job)) return told('busy', 'A run of this job is still going. This one starts when it is done.');
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
      // RULED 2026-10-15: inside an install-needed wait nothing is written, no session made, no copy or install run
      const wait = installWait.get(job);
      if (wait && wait.key === key && now() < wait.until) return { outcome: 'refused', why: wait.why, told: false };
      const accept = starter.wouldAccept(job, cause);
      if (!accept.ok) return told('refused', accept.why);
      const beforeSpawn = hooks.beforeSpawn ?? (() => {
        if (cause.kind === 'file') recordRan(ledger, { sha: cause.sha, path: cause.path, size: cause.size ?? 0 }, now(), sig);
        else recordFire(ledger, { fire: true, slot: cause.slot, catchUp: cause.catchUp, missed: cause.missed }, now(), sig);
      });
      starting.set(job, now());
      const r = await starter.start(job, cause, { beforeSpawn });
      if (r.ok) {
        installWait.delete(job);
        appendRow(ledger, { kind: 'started', sig, at: now(), key, ...base, sessionId: r.sessionId, specHash: r.specHash });
        return { outcome: 'started', told: true, sessionId: r.sessionId };
      }
      starting.delete(job);
      /** @type {string|null} set when this refusal is the one that gives up */
      let gaveUpWhy = null;
      if (r.installNeeded === true) {
        const prev = installWait.get(job);
        const count = (prev?.count ?? 0) + 1;
        const firstAt = prev?.firstAt ?? now();
        const step = installSteps[count - 1];
        if (step === undefined || now() + step - firstAt > giveUpMs) { installWait.delete(job); gaveUpWhy = r.why; }
        else installWait.set(job, { key, count, firstAt, until: now() + step, why: r.why });
      }
      if (r.consumed) {
        // a spawn error AFTER the consuming row: release it so the slot or file is retryable, a bounded number of times
        const releases = readLedger(ledger).rows.filter((x) => x.kind === 'released' && x.of === consumeId).length;
        if (releases < MAX_RELEASES) {
          appendRow(ledger, { kind: 'released', of: consumeId, sig, at: now(), why: r.why });
          return told('refused', lateRefusalWords(r.why, releases, MAX_RELEASES));
        }
        return told('refused', lateRefusalWords(r.why, releases, MAX_RELEASES));
      }
      const out = told('refused', r.why);
      // ONE `gave-up` row, written after the refusal row so it is the newest outcome; the paused ledger state is what stops every later fire
      if (gaveUpWhy !== null) appendRow(ledger, { kind: 'gave-up', sig, at: now(), key, ...base, why: gaveUpWhy });
      return out;
    },

    greenFor,
    armFor,
    readSchedule,
    ledgerOf,

    /**
     * A failure the scheduler met on a job (a folder that went away, a file refused), written as ONE `refused` row per
     * `tag`, read back from disk so a restart does not repeat it (T13). Returns whether it wrote.
     * @param {string} job @param {string} sig @param {string} tag @param {string} why
     */
    tellOnce(job, sig, tag, why) {
      const ledger = ledgerOf(job);
      const key = `scheduler|${tag}`;
      if (readLedger(ledger).rows.some((r) => r.told === key)) return false;
      appendRow(ledger, { kind: 'refused', sig, at: now(), told: key, why });
      return true;
    },

    /** Click 1. All $0 checks; signs and writes nothing; returns `{words, hash, monthlyNote}`. @param {any} body */
    prepare(body) {
      const s = inspect(body);
      if (!s.ok) return s.reply;
      return { status: 200, body: { ok: true, job: s.job, words: s.words, hash: s.cancel ? s.hash : s.bind, monthlyNote: s.cancel ? null : s.monthlyNote, cancel: s.cancel } };
    },

    /** Click 2, carrying the hash it was shown. $0: no drafter, no run. @param {any} body */
    set(body) {
      const s = inspect(body);
      if (!s.ok) return s.reply;
      if (typeof body.hash !== 'string' || body.hash !== (s.cancel ? s.hash : s.bind)) return { status: 409, body: { ok: false, refused: 'stale-hash', say: SCHEDULE_WORDS.stale } };
      if (s.cancel) {
        if (s.cur) removeSchedule(s.job, s.cur);
        return { status: 200, body: { ok: true, job: s.job, cancelled: true, words: SCHEDULE_WORDS.cancelWords } };
      }
      const cur = s.cur;
      const keep = sameTarget(cur, s.trigger);
      if (cur && !keep && isFileTrigger(cur.trigger)) dropQueue(s.job, jobSpecHash(s.spec), 'schedule-changed');
      /** @type {Schedule} */
      const schedule = {
        job: s.job, trigger: s.trigger, spec: s.spec, specHash: s.hash, workflowKey: s.key, originRunid: s.originRunid,
        inputsText: s.inputsText, ...(s.destination === null ? {} : { destination: s.destination }), signedBy: userInfo().username, signedAt: new Date(now()).toISOString(),
      };
      writeSchedule(s.job, schedule);
      // RULED 2026-10-15: which run this signing was set from, so the origin run's Audit can find every fire of every signing made from it
      appendRow(ledgerOf(s.job), { kind: 'signed', sig: s.hash, at: now(), originRunid: s.originRunid });
      // a re-sign of a schedule that gave up unpauses it (the same signature included) and starts the install waits over
      if (paused(s.job)) appendRow(ledgerOf(s.job), { kind: 'resumed', sig: s.hash, at: now() });
      installWait.delete(s.job);
      let armed = true; let say = null;
      try { armFor(s.job, schedule, { baseline: !keep }); } catch (e) { armed = false; say = `The schedule is signed but not armed yet: ${/** @type {Error} */ (e).message}.`; }
      return { status: 200, body: { ok: true, job: s.job, words: s.words, hash: s.hash, armed, ...(say ? { say } : {}) } };
    },

    /** Cancel a job's schedule, never refused. @param {string} job @returns {boolean} there was one */
    cancel(job) {
      const cur = SLUG_RE.test(job) ? readSchedule(job) : null;
      installWait.delete(job);
      if (!cur) { rmSync(scheduleFileOf(job), { force: true }); return false; }
      removeSchedule(job, cur);
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
      const green = greenFor(job);
      return { job, hasGreen: green.ok, refusal: green.ok ? null : green.say, ...stateOf(job) };
    },

    stateOf,
    userHome,

    /**
     * What the Run tab shows of a job's schedule (A.12: one read of the schedule files and the ledger; the green gate is
     * memoised per run-list state, so a poll never re-parses every run). The SERVER decides: `scheduled` shows Cancel /
     * modify, else `canSchedule` shows Schedule run, else no button. `fromRunid` = the green run the card opens from. `waitingRunNo` = the job's newest run when it waits
     * for the person's Accept (the next scheduled run does NOT wait for it, T7).
     * @param {string} job @param {{waitingRunNo?: number|null}} [o]
     */
    view(job, o = {}) {
      if (!SLUG_RE.test(job)) return null;
      const st = stateOf(job);
      if (!st.schedule) {
        const g = cachedGreen(job);
        return { scheduled: false, canSchedule: g.ok, words: SCHEDULE_WORDS, ...(g.ok ? { fromRunid: g.run.runid } : {}) };
      }
      const next = scheduledNextFor({
        trigger: st.schedule.trigger, armed: st.armed, nextSlotMs: st.nextSlotMs, lastOutcome: st.lastOutcome, waitingRunNo: o.waitingRunNo ?? null, now: now(), retryInMs: st.retryInMs, gaveUp: st.gaveUp,
      });
      const last = lastFireRow(job, st.schedule);
      const problem = (last !== null && last.kind !== 'started') || st.gaveUp !== null;
      const nextWords = isClockTrigger(st.schedule.trigger)
        ? (st.nextSlotMs === null ? 'next: not armed yet' : `next ${nextSlotShort(st.nextSlotMs)}`)
        : (st.schedule.trigger.kind === 'new-file' ? 'next: waiting for a new file' : 'next: waiting for the file to change');
      return {
        scheduled: true, canSchedule: false, words: SCHEDULE_WORDS, fromRunid: st.schedule.originRunid,
        text: scheduledWords(st.schedule.trigger, userHome), next: next.text, nextRed: next.red,
        // aligned with fwdloop M9 am7: the SCHEDULE row's second line is put together by the server from these
        lastRow: last, problem, nextWords: problem ? SCHEDULE_WORDS.problemNext : nextWords,
      };
    },

    /**
     * The schedule card's data for `start-from?mode=schedule`: the current schedule in the When field's own terms, the
     * words, the refusal that disables the field (a job with no good run and no schedule), and the edit note.
     * Cancel is never refused, so a scheduled job is never disabled here.
     * @param {string} job
     */
    cardFor(job) {
      const st = stateOf(job);
      const green = st.schedule ? null : cachedGreen(job);
      const t = st.schedule ? st.schedule.trigger : null;
      return {
        scheduled: st.schedule !== null, trigger: t, now: t ? scheduledWords(t, userHome) : null,
        refusal: green && !green.ok ? green.say : null,
        words: SCHEDULE_WORDS,
      };
    },

    /**
     * RULED 2026-10-15: the jobs whose schedule gave up, for the runs list's Needs you section (the SERVER decides; the page works out nothing):
     * `[{job, pill: 'Check', words, at: 'MM/DD HH:MM', runId}]`, newest give-up first. `runId` = the job's HEAD run by time. Never ages out.
     * @param {Map<string, string|null>|Record<string, string|null>} heads
     */
    listGaveUp(heads) {
      const headOf = (/** @type {string} */ job) => (heads instanceof Map ? heads.get(job) : heads[job]) ?? null;
      const out = [];
      for (const { job } of this.scan()) {
        try {
          const g = stateOf(job).gaveUp;
          if (!g) continue;
          const at = typeof g.at === 'number' ? g.at : now();
          out.push({ job, pill: SCHEDULE_WORDS.gaveUpPill, words: String(g.why ?? ''), at: gaveUpDateWords(at), runId: headOf(job), _ms: at });
        } catch { /* unreadable: absent */ }
      }
      out.sort((x, y) => y._ms - x._ms || (x.job < y.job ? -1 : 1));
      return out.map(({ _ms, ...rest }) => rest);
    },

    /**
     * The Scheduled section of the runs list: `[{job, at, in, words, runId}]`, soonest first; a file trigger (no clock
     * time) after those that have one, by name. `heads` = job -> its HEAD run id by time (summarizeJobs), so the click
     * opens the job's newest run, never "the first in server order". A job that cannot be read is absent.
     * @param {Map<string, string|null>|Record<string, string|null>} heads
     */
    listScheduled(heads) {
      const nowMs = now();
      const headOf = (/** @type {string} */ job) => (heads instanceof Map ? heads.get(job) : heads[job]) ?? null;
      const out = [];
      for (const { job, schedule } of this.scan()) {
        try {
          const st = stateOf(job);
          const when = st.nextSlotMs;
          out.push({
            job, at: when === null ? null : nextTimeWords(when, nowMs), in: when === null ? null : nextInWords(when, nowMs),
            words: scheduledWords(schedule.trigger, userHome), runId: headOf(job), _ms: when,
          });
        } catch { /* unreadable: absent */ }
      }
      out.sort((x, y) => (x._ms === null ? 1 : 0) - (y._ms === null ? 1 : 0) || (x._ms ?? 0) - (y._ms ?? 0) || (x.job < y.job ? -1 : x.job > y.job ? 1 : 0));
      return out.map(({ _ms, ...rest }) => rest);
    },
  };
}
