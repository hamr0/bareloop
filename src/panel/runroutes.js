// PANEL-BUILD.md P5 — the run-level write routes. Item 2: `POST /api/runs/:runid/resume`.
//
// Layering: this is one more CALLER of the same engine the CLI drives (`bareloop run-u
// --resume`); the panel adds no logic of its own beyond reading two caps off a form and
// spawning. Every route here sits behind `checkHumanGuard` (token + own address), the
// same guard `/api/author/*` has: the click IS the signature, the chat can never reach it.
//
// A resume under RAISED caps is a re-signed spec (budgetUsd/maxWallMs are in the hash —
// that is how a top-up works, src/userrun.js "THE TOP-UP ITSELF IS NOT HERE"). The new spec
// is written beside the original as `resolved-spec-r<k>.json`; the signed spec the run
// started under is NEVER overwritten. Prior spend stays folded by the engine, so the
// ceiling cannot silently widen.

import { spawn as realSpawn } from 'node:child_process';
import {
  openSync, closeSync, writeFileSync, readFileSync, readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { checkHumanGuard, OLD_JOB_ACCEPT_WORDS, OLD_JOB_RESUME_WORDS } from './authorroutes.js';
import { checkMonthlyRoom, monthlyRefusalText } from '../monthly.js';
import { ConfigError } from '../config.js';
import { keysForDoor } from '../keysfile.js';
import { jobSpecHash, validateJob } from '../job.js';
import { stopFilePath } from '../legs.js';
import { appendNeedsRemoved } from '../runlist.js';

/** the tail of an engine log shown to the person when the engine refuses at start (bytes) */
const LOG_TAIL_BYTES = 4000;

/** how long a resume waits for an early engine exit before reporting "started" (ms) */
export const DEFAULT_SETTLE_MS = 6000;

/** how long an Accept waits for the engine's answer (it re-runs the mechanical close stages) before saying it is still checking (ms) */
export const DEFAULT_ACCEPT_WAIT_MS = 5 * 60_000;

/**
 * The next free `resolved-spec-r<k>.json` name in `dir` (k from 1) — never an existing one.
 * @param {string} dir
 * @returns {string}
 */
function nextRevisionName(dir) {
  let max = 0;
  for (const n of readdirSync(dir)) {
    const m = /^resolved-spec-r(\d+)\.json$/.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `resolved-spec-r${max + 1}.json`;
}

/**
 * The tail of the engine's own log — its refusal text, verbatim.
 * @param {string} file
 * @returns {string}
 */
function readLogTail(file) {
  try {
    const text = readFileSync(file, 'utf8');
    return text.slice(Math.max(0, text.length - LOG_TAIL_BYTES)).trim();
  } catch { return ''; }
}

/**
 * RULED 2026-10-16: the person never sees raw engine output. Of the engine's log tail, only a line it
 * owns as a plain sentence passes through (a `Nothing spent.` / `Nothing was spent.` refusal, `DOOR REFUSED (...) — nothing was
 * recorded...`, `CHECKPOINT EXPIRED — ...`); anything else (validator reds, exit statuses, stack traces, argv) becomes ONE fixed
 * sentence naming the log. The one owner for the Resume and Accept routes.
 * @param {string} tail the log tail
 * @param {'resume'|'accept'} kind
 * @param {string} logFile
 * @param {(stage: string) => string|null} [questionOf] stage name to the panel's plain question (`null` = none)
 * @returns {string}
 */
export function engineRefusalWords(tail, kind, logFile, questionOf = () => null) {
  const known = /(?:\bNothing (?:was )?spent\.|^DOOR REFUSED \(.*\) — nothing was recorded|^CHECKPOINT EXPIRED — )/;
  const raw = /validateJob|red\(s\)|exit status|node-\d|\bat \S+:\d+|\s--[a-z]|^\s*at |Error:/;
  for (const line of String(tail ?? '').split('\n').map((l) => l.trim())) {
    if (line !== '' && known.test(line) && !raw.test(line)) {
      // RULED 2026-10-16 (A): a refused Accept names each failed check by the panel's own plain question
      const asked = kind === 'accept' ? doorRedStages(tail).map((n) => questionOf(n)).filter((q) => typeof q === 'string' && q !== '') : [];
      if (asked.length > 0) {
        const shown = asked.slice(0, 3).map((q) => `"${q}"`).join('; ');
        const more = asked.length > 3 ? ` and ${asked.length - 3} more` : '';
        return `Accept did not go through: the check ${shown}${more} said no. Nothing was recorded.`;
      }
      return line;
    }
  }
  return kind === 'resume'
    ? `Resume did not start. Nothing was spent on it. The details are in ${logFile}.`
    : `Accept did not go through. Nothing was recorded. The details are in ${logFile}.`;
}

/**
 * The stage names a door-accept-red refusal failed on, read from the engine's own refusal lines (src/userrun.js):
 * the `door-accept-red:stage.<name> — ...` line and the `<name>  <verdict>` lines of "the mechanical re-run, stage by stage"
 * whose verdict is not `satisfied`. Names only — the caller maps them to the panel's plain questions.
 * @param {string} tail
 * @returns {string[]}
 */
function doorRedStages(tail) {
  /** @type {string[]} */
  const names = [];
  let inList = false;
  for (const line of String(tail ?? '').split('\n')) {
    const red = /^\s*door-accept-red:stage\.(.+?) — /.exec(line);
    if (red) { names.push(red[1]); continue; }
    if (/^\s*the mechanical re-run, stage by stage:/.test(line)) { inList = true; continue; }
    const row = inList ? /^\s{4}(\S.*?)\s{2,}(\S+)\s*$/.exec(line) : null;
    if (row && row[2] !== 'satisfied') names.push(row[1]);
  }
  return [...new Set(names)];
}

/**
 * The run routes' handler. `getResumeContext(runid)` is the server's own reader (the same
 * `resumePlanFor` the Ended block uses, so the page never offers what this refuses):
 * `null` = no such run, else `{row, plan}`.
 * @param {{ port: number, token: string, env?: Record<string,string|undefined>, home?: string,
 *   spawnFn?: typeof realSpawn, bareloopBin?: string, settleMs?: number,
 *   getResumeContext: (runid: string) => ({row: any, plan: any}|null),
 *   getStopContext?: (runid: string) => ({row: any, live: boolean, spineExists: boolean}|null),
 *   getNeedsContext?: (runid: string) => ({row: any, needs: 'Accept'|'Resume'|null}|null),
 *   getAcceptContext?: (runid: string) => ({row: any, live: boolean, waiting: boolean, specPath: string|null, specHash: string|null}|null),
 *   stageQuestionsOfSpec?: (spec: any) => Map<string, string|null>,
 *   acceptWaitMs?: number }} opts
 */
export function createRunRoutes(opts) {
  const envNow = () => keysForDoor({ env: opts.env, keysHome: opts.home }).env;
  const spawnFn = opts.spawnFn ?? realSpawn;
  const bareloopBin = opts.bareloopBin ?? new URL('../../bin/bareloop.mjs', import.meta.url).pathname;
  const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS;

  /**
   * P5 item 5 — `POST /api/runs/:runid/stop`. The click writes the run's STOP REQUEST file (`<spine>.stop`,
   * `stopFilePath`); the ENGINE reads it at its round boundary (the seam where the money cap binds) and ends the leg `stopped` (resumable). The
   * route never signals or kills anything. Refused (409) unless the run's LATEST leg is live — a stop request for
   * a run that is not running would sit on disk and could be misread by a later leg (the engine also clears a
   * stale one at leg start, but a button that cannot do anything is not offered or accepted).
   * @param {import('node:http').IncomingMessage} req
   * @param {(code: number, obj: any) => void} send
   * @param {string} runid
   * @returns {boolean}
   */
  function handleStop(req, send, runid) {
    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }
    if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }
    const ctx = opts.getStopContext ? opts.getStopContext(runid) : null;
    if (!ctx) { send(404, { ok: false, error: 'no such run' }); return true; }
    if (!ctx.live) { send(409, { ok: false, error: 'This run is not running, so there is nothing to stop.' }); return true; }
    if (!ctx.spineExists) { send(409, { ok: false, error: 'The run is still starting — it has not written its log yet. Try again in a moment.' }); return true; }
    const file = stopFilePath(ctx.row.spine);
    try { writeFileSync(file, `${new Date().toISOString()}\n`); } catch (e) {
      send(500, { ok: false, error: `could not write the stop request: ${/** @type {Error} */ (e).message}` });
      return true;
    }
    send(200, { ok: true, runid, stopping: true });
    return true;
  }

  /**
   * T Part 8 — `POST /api/runs/:runid/accept`. The person's Accept of a run waiting at its REVIEW DOOR, recorded through the
   * library's own door path and nothing else: `run-u --spec <signed spec> --door <runid> --decide accept --approve <hash>`
   * (src/userrun.js, `answerReviewDoor`, src/reviewdoor.js). The panel invents no verdict path: the engine re-runs the MECHANICAL
   * stages against the tree as it stands, a red there is `door-accept-red` and refuses, and only then is the disposition written
   * to the run's own spine. The verdict the run minted is untouched. The engine's own words are what the page shows.
   * @param {import('node:http').IncomingMessage} req
   * @param {(code: number, obj: any) => void} send
   * @param {string} runid
   * @returns {boolean}
   */
  function handleAccept(req, send, runid) {
    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }
    if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }
    const ctx = opts.getAcceptContext ? opts.getAcceptContext(runid) : null;
    if (!ctx) { send(404, { ok: false, error: 'no such run' }); return true; }
    if (ctx.live) { send(409, { ok: false, error: 'This run is still running, so there is nothing to accept yet.' }); return true; }
    if (!ctx.waiting) { send(409, { ok: false, error: 'This run is not waiting for your Accept (it opened no review door, the door was already answered, or it has expired).' }); return true; }
    if (!ctx.specPath || !ctx.specHash) { send(409, { ok: false, error: "The signed job this run was judged by cannot be found on disk, so its door cannot be answered from here. Nothing was recorded." }); return true; }
    // RULED 2026-10-15: an old run whose saved job fails today's checks is refused at $0 in plain words, before any spawn
    /** @type {any} */
    let signed = null;
    try { signed = JSON.parse(readFileSync(ctx.specPath, 'utf8')); } catch { signed = null; }
    if (signed !== null) {
      let jv;
      try { jv = validateJob(signed, { shellCapUsd: signed.budgetUsd }); } catch { jv = { ok: false, reds: [] }; }
      if (!jv.ok) { send(409, { ok: false, error: OLD_JOB_ACCEPT_WORDS, reds: jv.reds.map((r) => `${r.code} at ${r.path}`) }); return true; }
    }
    const questionOf = (/** @type {string} */ n) => (signed !== null && opts.stageQuestionsOfSpec ? opts.stageQuestionsOfSpec(signed).get(n) ?? null : null);
    const dir = dirname(ctx.specPath);
    const logFile = join(dir, `accept-${runid}-${Date.now()}.log`);
    const args = [
      '--wait', 'systemd-inhibit', '--why=bareloop panel accept',
      process.execPath, bareloopBin,
      'run-u', '--spec', ctx.specPath, '--door', runid, '--decide', 'accept', '--approve', ctx.specHash,
    ];
    /** @type {number|null} */
    let logFd = null;
    try { logFd = openSync(logFile, 'a'); } catch { logFd = null; }
    const child = spawnFn('setsid', args, { detached: true, stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'], env: envNow() });
    if (logFd !== null) { try { closeSync(logFd); } catch { /* the child holds its own copy */ } }
    if (typeof child?.unref === 'function') child.unref();
    let done = false;
    const finish = (/** @type {number} */ code, /** @type {any} */ obj) => { if (!done) { done = true; send(code, obj); } };
    // an accept that outlasts the wait is still going: say so (202), never claim it passed
    const timer = setTimeout(() => finish(202, { ok: true, pending: true, runid, log: logFile }), opts.acceptWaitMs ?? DEFAULT_ACCEPT_WAIT_MS);
    if (typeof timer.unref === 'function') timer.unref();
    if (typeof child?.once === 'function') {
      child.once('exit', (/** @type {number|null} */ code) => {
        clearTimeout(timer);
        if (code === 0) finish(200, { ok: true, accepted: true, runid, log: logFile });
        else finish(409, { ok: false, error: engineRefusalWords(readLogTail(logFile), 'accept', logFile, questionOf), log: logFile });
      });
      child.once('error', (/** @type {Error} */ e) => {
        clearTimeout(timer);
        finish(500, { ok: false, error: `could not start the engine: ${e.message}` });
      });
    }
    return true;
  }

  /**
   * RULED 2026-10-15 — `POST /api/runs/:runid/needs-remove`. Takes a stopped run's card out of Needs you and does nothing else: ONE
   * `needs-removed` row appended to runs.jsonl (status, the run's row, Resume and Reuse workflow are untouched). Refused (409) unless the run
   * is in Needs you with the Resume tag right now; a run waiting for the person's Accept is never removable. A second click finds it already out.
   * @param {import('node:http').IncomingMessage} req
   * @param {(code: number, obj: any) => void} send
   * @param {string} runid
   * @returns {boolean}
   */
  function handleNeedsRemove(req, send, runid) {
    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }
    if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }
    const ctx = opts.getNeedsContext ? opts.getNeedsContext(runid) : null;
    if (!ctx) { send(404, { ok: false, error: 'no such run' }); return true; }
    if (ctx.needs === 'Accept') { send(409, { ok: false, error: 'This run is waiting for your Accept, so it stays in Needs you until you answer it.' }); return true; }
    if (ctx.needs !== 'Resume') { send(409, { ok: false, error: 'This run is not in Needs you, so there is nothing to remove.' }); return true; }
    try { appendNeedsRemoved(runid, { home: opts.home }); } catch (e) {
      send(500, { ok: false, error: `could not record it: ${/** @type {Error} */ (e).message}` });
      return true;
    }
    send(200, { ok: true, runid, removed: true });
    return true;
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} pathname
   * @param {any} body
   * @returns {boolean}
   */
  function handle(req, res, pathname, body) {
    const stopM = /^\/api\/runs\/([A-Za-z0-9._~-]+)\/stop$/.exec(pathname);
    const m = /^\/api\/runs\/([A-Za-z0-9._~-]+)\/resume$/.exec(pathname);
    const acceptM = /^\/api\/runs\/([A-Za-z0-9._~-]+)\/accept$/.exec(pathname);
    const needsM = /^\/api\/runs\/([A-Za-z0-9._~-]+)\/needs-remove$/.exec(pathname);
    if (!m && !stopM && !acceptM && !needsM) return false;
    const send = (/** @type {number} */ code, /** @type {any} */ obj) => {
      const text = JSON.stringify(obj);
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    };
    if (stopM) return handleStop(req, send, stopM[1]);
    if (acceptM) return handleAccept(req, send, acceptM[1]);
    if (needsM) return handleNeedsRemove(req, send, needsM[1]);
    if (!m) return false;
    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }
    if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }

    const ctx = opts.getResumeContext(m[1]);
    if (!ctx) { send(404, { ok: false, error: 'no such run' }); return true; }
    const { plan } = ctx;
    if (!plan.ok) { send(409, { ok: false, error: `Resume is not available for this run (${plan.why}).` }); return true; }

    // RULED 2026-10-16: like Accept, an old run whose saved job fails today's checks is refused at $0 in plain words, before any spawn
    {
      let jv;
      try { jv = validateJob(plan.spec, { shellCapUsd: plan.spec.budgetUsd }); } catch { jv = { ok: false, reds: [] }; }
      if (!jv.ok) { send(409, { ok: false, error: OLD_JOB_RESUME_WORDS, reds: jv.reds.map((r) => `${r.code} at ${r.path}`) }); return true; }
    }

    // the caps: blank/absent = the signed ones. A raised (or lowered) cap is a new spec.
    /** @type {any} */
    const spec = { ...plan.spec };
    const wantBudget = body?.budgetUsd === undefined || body?.budgetUsd === null || body?.budgetUsd === '' ? spec.budgetUsd : Number(body.budgetUsd);
    if (typeof wantBudget !== 'number' || !Number.isFinite(wantBudget) || wantBudget <= 0) {
      send(400, { ok: false, error: 'the money cap must be a number above 0' });
      return true;
    }
    spec.budgetUsd = wantBudget;
    if (typeof plan.spec.maxWallMs === 'number') {
      const wantMin = body?.maxWallMin === undefined || body?.maxWallMin === null || body?.maxWallMin === '' ? plan.spec.maxWallMs / 60000 : Number(body.maxWallMin);
      if (!Number.isFinite(wantMin) || wantMin <= 0) { send(400, { ok: false, error: 'the time cap must be a number of minutes above 0' }); return true; }
      spec.maxWallMs = Math.round(wantMin * 60000);
    }
    // tighten-only: a cap at or below what the run has ALREADY used buys an immediate re-halt
    // (the engine only warns), so it is refused here at $0, before anything is written or spawned
    if (typeof plan.spentUsd === 'number' && spec.budgetUsd <= plan.spentUsd) {
      send(400, { ok: false, error: `The money cap must be above what is already spent (${plan.spendComplete ? '' : 'at least '}$${plan.spentUsd.toFixed(2)}) — raise it, then Resume.` });
      return true;
    }
    if (typeof plan.wallUsedMs === 'number' && typeof spec.maxWallMs === 'number' && spec.maxWallMs <= plan.wallUsedMs) {
      send(400, { ok: false, error: `The time cap must be above the time already used (${Math.ceil(plan.wallUsedMs / 60000)} min) — raise it, then Resume.` });
      return true;
    }
    const changed = spec.budgetUsd !== plan.spec.budgetUsd || spec.maxWallMs !== plan.spec.maxWallMs;

    // the monthly $ limit refuses here too, before anything is spawned — same library call
    // and text as the run-start seam and Sign & run
    try {
      const refusal = monthlyRefusalText(checkMonthlyRoom({ capUsd: Number(spec.budgetUsd), home: opts.home }));
      if (refusal !== null) { send(400, { ok: false, error: refusal }); return true; }
    } catch (e) {
      if (e instanceof ConfigError) { send(400, { ok: false, error: `${e.message} — refusing rather than guess the monthly limit` }); return true; }
      throw e;
    }

    const dir = dirname(plan.specPath);
    let specPath = plan.specPath;
    let specHash = plan.specHash;
    if (changed) {
      specPath = join(dir, nextRevisionName(dir));
      specHash = jobSpecHash(spec);
      writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, { flag: 'wx' });
    }

    const logFile = join(dir, `resume-${m[1]}-${Date.now()}.log`);
    const args = [
      '--wait', 'systemd-inhibit', '--why=bareloop panel resume',
      process.execPath, bareloopBin,
      'run-u', '--spec', specPath, '--resume', m[1], '--approve', specHash,
      // an older spec that names no model runs on the Settings line the person picks at resume (hash untouched, run-u's own rule)
      ...(typeof body?.model === 'string' && body.model !== '' ? ['--model', body.model] : []),
      ...(typeof body?.provider === 'string' && body.provider !== '' ? ['--provider', body.provider] : []),
      // the drafting fold rides every leg of the chain (a leg that dropped it would widen the ceiling)
      ...(plan.draftSpentUsd !== null ? ['--draft-spent-usd', String(plan.draftSpentUsd), ...(plan.draftSpendComplete === false ? ['--draft-spend-incomplete'] : [])] : []),
    ];
    /** @type {number|null} */
    let logFd = null;
    try { logFd = openSync(logFile, 'a'); } catch { logFd = null; }
    const child = spawnFn('setsid', args, {
      detached: true, stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'], env: envNow(),
    });
    if (logFd !== null) { try { closeSync(logFd); } catch { /* the child holds its own copy */ } }
    if (typeof child?.unref === 'function') child.unref();

    // `setsid --wait` hands back the engine's own exit code, so an early non-zero exit IS
    // the engine's refusal: its own text (the log) goes to the page, never a paraphrase.
    // A run that is really going does not exit inside the window.
    let done = false;
    const finish = (/** @type {number} */ code, /** @type {any} */ obj) => { if (!done) { done = true; send(code, obj); } };
    const timer = setTimeout(() => finish(200, {
      ok: true, runid: m[1], specHash, capsChanged: changed, log: logFile,
    }), settleMs);
    if (typeof timer.unref === 'function') timer.unref();
    if (typeof child?.once === 'function') {
      child.once('exit', (/** @type {number|null} */ code) => {
        clearTimeout(timer);
        if (code === 0) {
          finish(200, {
            ok: true, runid: m[1], specHash, capsChanged: changed, log: logFile,
          });
        } else {
          finish(409, { ok: false, error: engineRefusalWords(readLogTail(logFile), 'resume', logFile), log: logFile });
        }
      });
      child.once('error', (/** @type {Error} */ e) => {
        clearTimeout(timer);
        finish(500, { ok: false, error: `could not start the engine: ${e.message}` });
      });
    }
    return true;
  }

  return { handle };
}
