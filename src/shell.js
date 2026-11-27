// THE RUN-A-COMMAND FAMILY — moved verbatim out of src/kinds.js (import-cycle cleanup, batch H2): the spawn primitive `sh`, its process boxes,
// the check limits, the stop-fault vocabulary and `git`. A leaf: it imports nothing from kinds.js, so kinds.js and src/source.js can both reach it.
import { spawn, execFile } from 'node:child_process';
import { CLOSE_ENV_DENY } from './ralph.js';

/**
 * THE one limit for an AI-drafted check (hamr, 2026-11-21): 30 minutes per command, at drafting, at the signing gates and
 * at the run (precheck + final close). Code's own number — not in the draft, not in the signature, never compared to the
 * job's Time cap. The AI no longer writes a limit (F393, hamr 2026-11-24): a `timeoutMs` on an OLD signed spec is ignored (`effectiveTimeoutMs`).
 */
export const CHECK_LIMIT_MS = 1_800_000;
/** the still-running note: first at 5 of the 30 minutes, then every minute (hamr, 2026-11-21) */
export const CHECK_NOTE_AFTER_MS = 300_000;
export const CHECK_NOTE_EVERY_MS = 60_000;
/** used when neither the stage nor the ctx names a bound. A stage that could
 * run forever is not a red — it is a stop, and something must decide when. */
export const DEFAULT_TIMEOUT_MS = CHECK_LIMIT_MS;
/** PER STREAM, like the arbiter's own close runner. An overrun truncates the
 * output mid-summary, so any number read out of it is unknown, not zero. */
export const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * WHICH KIND of instrument stop, in the ARBITER's own four-row vocabulary
 * (`CLOSE_FAULTS`, src/ralph.js). Stamped at the site that OBSERVES the fault —
 * never sniffed out of the stop's prose downstream (the typed-attribution rule:
 * a `lib`/fault field is stamped at the throw site, and prose is a fallback for
 * pre-typed spines only).
 *
 * The rows are kept apart for the reason `CLOSE_FAULTS` keeps them apart: they
 * are DIFFERENT HUMAN DECISIONS. "raise the close timeout", "fix the argv" and
 * "re-run, it was OOM-killed" are three answers, and a declared close that
 * pooled all three into `failed` would hand every one of them the same option
 * list. `failed` is the default because "the close cannot run" is the safe
 * reading of a fault nothing else claimed.
 */
export const STOP_FAULTS = Object.freeze({
  /** the stage cannot RUN at all: spawn failure, a missing seed commit, git refusing */
  FAILED: 'failed',
  /** it ran and never finished judging */
  TIMED_OUT: 'timed-out',
  /** it died by signal — no opinion was ever rendered */
  KILLED: 'killed',
  /** it ran, came back, and judged nothing: unreadable output, a blown buffer,
   * a number that was never reported, a parser that does not normalise */
  CRASHED: 'crashed',
});

// ── the child process: only the WAIT is async (F68) ──────────────────────────

/**
 * The environment a stage's child receives. Two strips, both deliberate:
 *
 *  - `NODE_TEST_CONTEXT`: inherited from a host test runner, a `node --test`
 *    stage silently no-ops — a confident fake green.
 *  - `CLOSE_ENV_DENY` (imported, never re-spelled): a stage runs
 *    worker-authored code, and none of git/tsc/mypy/pytest needs the
 *    operator's provider key to judge a tree.
 *
 * A DECLARED env var whose name is on the deny list is dropped too — the
 * declaration is authored, and an authored close must not be able to hand
 * worker code a credential — and the drop is ANNOUNCED by name (never the
 * value) rather than applied silently.
 * @param {Record<string, string>} [declared]
 * @returns {{env: NodeJS.ProcessEnv, dropped: string[]}}
 */
export function stageEnv(declared = {}) {
  const denied = (/** @type {string} */ name) => CLOSE_ENV_DENY.names.includes(name)
    || CLOSE_ENV_DENY.prefixes.some((p) => name.startsWith(p))
    || CLOSE_ENV_DENY.shape.test(name);
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const name of Object.keys(env)) if (denied(name)) delete env[name];
  // NO_COLOR keeps ANSI escapes out of the text every parser reads. Anything
  // the stage declared rides on top of it and may override it.
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  /** @type {string[]} */
  const dropped = [];
  for (const [name, value] of Object.entries(declared)) {
    if (denied(name)) { dropped.push(name); continue; }
    env[name] = String(value);
  }
  return { env, dropped };
}

// ── THE BOX REGISTRY ─────────────────────────────────────────────────────────────────────────────────
// A check's command runs in its own process group so one kill stops all of it. The price of a separate group is that a ^C or a
// watchdog kill of THIS process no longer reaches the command by itself, so every live box is remembered here and killed when the process
// ends (`exit`) or is signalled (SIGINT/SIGTERM/SIGHUP, installed only while a box is live, then the default end is re-raised).
/** @type {Set<number>} */
const liveBoxes = new Set();
/** SIGKILL every box still running; a box already gone is not an error */
export function killLiveBoxes() {
  for (const pid of liveBoxes) { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } }
  liveBoxes.clear();
}
/** @type {[NodeJS.Signals, () => void][]} */
let boxHooks = [];
const dropBoxHooks = () => {
  for (const [sig, h] of boxHooks) process.removeListener(sig, h);
  process.removeListener('exit', killLiveBoxes);
  boxHooks = [];
};
/** @param {number} pid */
function trackBox(pid) {
  liveBoxes.add(pid);
  if (boxHooks.length > 0) return;
  process.on('exit', killLiveBoxes);
  for (const sig of /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) {
    const h = () => {
      killLiveBoxes();
      dropBoxHooks();
      // our hook only adds the kill: if nobody else handles the signal, it ends the process as it would have without us
      if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
    };
    process.on(sig, h);
    boxHooks.push([sig, h]);
  }
}
/** @param {number} pid */
function untrackBox(pid) {
  liveBoxes.delete(pid);
  if (liveBoxes.size === 0) dropBoxHooks();
}

/**
 * The live members of a box (a process group), read from the process table: every process whose group id is `pgid` and that is not a zombie
 * (a killed process nobody has reaped yet is already gone). Used to CHECK a kill, never to decide one.
 * @param {number} pgid @returns {Promise<number[]>}
 */
export function boxMembers(pgid) {
  return new Promise((resolve) => {
    execFile('ps', ['-A', '-o', 'pid=,pgid=,stat='], { timeout: 5000 }, (err, out) => {
      if (err) {
        // no process table to read: the group itself still answers whether anything is alive in it (its pid is the best name we have)
        try { process.kill(-pgid, 0); resolve([pgid]); } catch { resolve([]); }
        return;
      }
      /** @type {number[]} */
      const pids = [];
      for (const line of String(out).split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)\s+(\S+)/.exec(line);
        if (m && Number(m[2]) === pgid && !m[3].startsWith('Z')) pids.push(Number(m[1]));
      }
      resolve(pids.sort((a, b) => a - b));
    });
  });
}
/**
 * The sentence when a kill left processes running: who, and the one command that stops them. Said only then.
 * @param {number[]} pids @returns {string}
 */
export function survivorsText(pids) {
  return `Some test processes did not stop: pid ${pids.join(', ')}. To stop them: kill ${pids.join(' ')}`;
}
/** after a kill: look for the box to empty, a moment at a time (SIGKILL lands asynchronously); what is still there is a survivor
 * @param {number} pgid @param {(pgid: number) => Promise<number[]>} list @returns {Promise<number[]>} */
async function boxSurvivors(pgid, list) {
  let left = await list(pgid);
  for (let i = 0; i < 8 && left.length > 0; i += 1) {
    await new Promise((res) => { setTimeout(res, 100); });
    left = await list(pgid);
  }
  return left;
}

/**
 * Run a command and read its world. Faithful to `spawnSync`'s observable
 * result — the same `{status, signal, stdout, stderr}`, the same per-stream
 * ceiling, SIGTERM at the deadline — but without freezing the host loop
 * (F68). Every fault comes back as a `stop` STRING; nothing throws, because
 * a throw here would have to be caught and turned back into a stop anyway.
 * @param {string} cmd @param {string[]} args
 * @param {{cwd: string, env?: Record<string,string>, timeoutMs?: number, maxBuffer?: number,
 *   onTick?: ((t: {elapsedMs: number}) => void)|null, tickAfterMs?: number, tickEveryMs?: number,
 *   group?: boolean, signal?: AbortSignal|null, listBox?: (pgid: number) => Promise<number[]>}} o
 *   `group`: run the command in its OWN process group (the box) so one kill stops it and everything it started; `signal`: an abort (Abandon, Stop) kills that box at once
 * @returns {Promise<{stop: string, fault: string, survivors?: number[]}|{stop: null, code: number, out: string, dropped: string[], ms: number}>}
 */
export async function sh(cmd, args, { cwd, env: declared = {}, timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = MAX_BUFFER, onTick = null, tickAfterMs = CHECK_NOTE_AFTER_MS, tickEveryMs = CHECK_NOTE_EVERY_MS, group = false, signal = null, listBox = boxMembers }) {
  const { env, dropped } = stageEnv(declared);
  const t0 = Date.now();
  /** the box's group id, once the command has started (its leader's pid) @type {number|null} */
  let boxPid = null;
  const r = await new Promise((/** @type {(v: {error: (Error & {code?: string})|null, status: number|null, signal: string|null, stdout: string, stderr: string}) => void} */ resolve) => {
    /** @type {import('node:child_process').ChildProcess} */
    let child;
    // a signal already raised never starts the command at all
    if (signal?.aborted) {
      resolve({ error: Object.assign(new Error(`spawn ${cmd} ABORTED`), { code: 'ABORTED' }), status: null, signal: null, stdout: '', stderr: '' });
      return;
    }
    try {
      child = spawn(cmd, args, { cwd, env, ...(group ? { detached: true } : {}) });
    } catch (e) {
      resolve({ error: /** @type {any} */ (e), status: null, signal: null, stdout: '', stderr: '' });
      return;
    }
    /** @type {Buffer[]} */ const outChunks = [];
    /** @type {Buffer[]} */ const errChunks = [];
    let outBytes = 0; let errBytes = 0;
    /** @type {(Error & {code?: string})|null} */
    let error = null;
    /** @type {NodeJS.Timeout|undefined} */ let timer;
    /** @type {NodeJS.Timeout|undefined} */ let killTimer;
    /** @type {NodeJS.Timeout|undefined} */ let tickTimer;
    // REPORT-ONLY: the still-running note. Nothing reads it back; a throwing consumer never touches the run.
    if (typeof onTick === 'function') {
      const fire = () => {
        try { onTick({ elapsedMs: Date.now() - t0 }); } catch { /* a reporting seam never decides */ }
        tickTimer = setTimeout(fire, tickEveryMs);
        tickTimer.unref();
      };
      tickTimer = setTimeout(fire, tickAfterMs);
      tickTimer.unref();
    }
    /** the box: one signal to the command and everything it started (the leader's pid IS the group id). Without a box, the command alone. */
    const killBox = (/** @type {NodeJS.Signals} */ sig) => {
      if (group && typeof child.pid === 'number') { try { process.kill(-child.pid, sig); return; } catch { /* the group is gone, or never formed */ } }
      try { child.kill(sig); } catch { /* already gone */ }
    };
    if (group && typeof child.pid === 'number') { boxPid = child.pid; trackBox(child.pid); }
    // FIRST FAULT WINS: a child that blew the buffer and then hit the
    // deadline is one story, not two.
    const fault = (/** @type {string} */ code) => {
      if (error) return;
      error = Object.assign(new Error(`spawn ${cmd} ${code}`), { code });
      killBox('SIGTERM');
      killTimer = setTimeout(() => killBox('SIGKILL'), 2000);
      killTimer.unref();
    };
    // Abandon / Stop: the same kill, at once. A signal already raised never starts the command's work.
    const onAbort = () => fault('ABORTED');
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    child.stdout?.on('data', (/** @type {Buffer} */ c) => { outBytes += c.length; outChunks.push(c); if (outBytes > maxBuffer) fault('ENOBUFS'); });
    child.stderr?.on('data', (/** @type {Buffer} */ c) => { errBytes += c.length; errChunks.push(c); if (errBytes > maxBuffer) fault('ENOBUFS'); });
    child.on('error', (e) => { if (!error) error = e; });
    child.on('close', (status, exitSignal) => {
      clearTimeout(tickTimer);
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      // the leader is gone, but a child that ignored SIGTERM may still be in the box: after a fault the whole box gets SIGKILL now
      if (error) killBox('SIGKILL');
      if (group && typeof child.pid === 'number') untrackBox(child.pid);
      // Concat-then-decode, never per chunk: a multi-byte character across a
      // chunk boundary must not become two replacement characters in the text
      // every parser reads.
      resolve({ error, status, signal: exitSignal, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8') });
    });
    if (typeof timeoutMs === 'number' && timeoutMs > 0 && Number.isFinite(timeoutMs)) timer = setTimeout(() => fault('ETIMEDOUT'), timeoutMs);
    child.stdin?.on('error', () => {});
    child.stdin?.end();
  });

  const argv = `${cmd}${args.length ? ` ${args.join(' ')}` : ''}`;
  if (r.error) {
    const code = /** @type {any} */ (r.error).code;
    // AFTER A KILL, the box is checked: a process still in it is named in the stop (said only then)
    const left = boxPid !== null && (code === 'ETIMEDOUT' || code === 'ENOBUFS' || code === 'ABORTED') ? await boxSurvivors(boxPid, listBox) : [];
        if (code === 'ABORTED') return { stop: `INSTRUMENT: "${cmd}" was stopped before it finished`, fault: STOP_FAULTS.KILLED, ...(left.length ? { survivors: left } : {}) };
    if (code === 'ETIMEDOUT') return { stop: `INSTRUMENT: "${cmd}" did not finish inside ${timeoutMs}ms`, fault: STOP_FAULTS.TIMED_OUT, ...(left.length ? { survivors: left } : {}) };
    if (code === 'ENOBUFS') return { stop: `INSTRUMENT: "${cmd}" output exceeded the ${maxBuffer}B ceiling — the output is truncated, so any number read from it is unknown, not zero`, fault: STOP_FAULTS.CRASHED, ...(left.length ? { survivors: left } : {}) };
    return { stop: `INSTRUMENT: "${argv}" could not be run (${code ?? String(r.error.message)})`, fault: STOP_FAULTS.FAILED };
  }
  if (r.status === null) return { stop: `INSTRUMENT: "${cmd}" returned a null exit code (killed by ${r.signal ?? 'an unknown signal'})`, fault: STOP_FAULTS.KILLED };
  if (typeof r.stdout !== 'string' || typeof r.stderr !== 'string') return { stop: `INSTRUMENT: "${cmd}" produced unreadable output`, fault: STOP_FAULTS.CRASHED };
  return { stop: null, code: r.status, out: `${r.stdout}${r.stderr}`, dropped, ms: Date.now() - t0 };
}

/**
 * git, in a repository (reads by every caller in this file; `src/source.js`
 * also uses it for the hidden-git seed's `init`/`add`/`commit`). Faults come
 * back as `ok:false` with the stderr — a caller decides whether that is a
 * stop.
 *
 * Exported (PRD item 33/M2, `src/source.js`) so the hidden-git seed a plain
 * folder/file/URL job runs against goes through the SAME spawn primitive as
 * every other git call in this file — a second `spawn('git', …)` for the
 * source front door would be a second instrument with its own timeout and
 * buffer ceiling to keep in sync with this one.
 * @param {string} cwd @param {string[]} args
 */
export async function git(cwd, args) {
  const r = await sh('git', args, { cwd, timeoutMs: 120_000 });
  // git refusing IS "the close cannot run": the changed-set primitive is not an
  // optional enrichment, so a non-zero git carries FAILED rather than inheriting
  // whatever the spawn layer said about the process itself.
  if (r.stop !== null) return { ok: false, out: '', err: r.stop, code: null, fault: r.fault };
  return { ok: r.code === 0, out: r.out, err: r.out, code: r.code, fault: STOP_FAULTS.FAILED };
}
