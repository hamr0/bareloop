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
import { checkHumanGuard } from './authorroutes.js';
import { checkMonthlyRoom, monthlyRefusalText } from '../monthly.js';
import { ConfigError } from '../config.js';
import { keysForDoor } from '../keysfile.js';
import { jobSpecHash } from '../job.js';
import { stopFilePath } from '../legs.js';

/** the tail of an engine log shown to the person when the engine refuses at start (bytes) */
const LOG_TAIL_BYTES = 4000;

/** how long a resume waits for an early engine exit before reporting "started" (ms) */
export const DEFAULT_SETTLE_MS = 6000;

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
 * The run routes' handler. `getResumeContext(runid)` is the server's own reader (the same
 * `resumePlanFor` the Ended block uses, so the page never offers what this refuses):
 * `null` = no such run, else `{row, plan}`.
 * @param {{ port: number, token: string, env?: Record<string,string|undefined>, home?: string,
 *   spawnFn?: typeof realSpawn, bareloopBin?: string, settleMs?: number,
 *   getResumeContext: (runid: string) => ({row: any, plan: any}|null),
 *   getStopContext?: (runid: string) => ({row: any, live: boolean, spineExists: boolean}|null) }} opts
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
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} pathname
   * @param {any} body
   * @returns {boolean}
   */
  function handle(req, res, pathname, body) {
    const stopM = /^\/api\/runs\/([A-Za-z0-9._~-]+)\/stop$/.exec(pathname);
    const m = /^\/api\/runs\/([A-Za-z0-9._~-]+)\/resume$/.exec(pathname);
    if (!m && !stopM) return false;
    const send = (/** @type {number} */ code, /** @type {any} */ obj) => {
      const text = JSON.stringify(obj);
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    };
    if (stopM) return handleStop(req, send, stopM[1]);
    if (!m) return false;
    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }
    if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }

    const ctx = opts.getResumeContext(m[1]);
    if (!ctx) { send(404, { ok: false, error: 'no such run' }); return true; }
    const { plan } = ctx;
    if (!plan.ok) { send(409, { ok: false, error: `Resume is not available for this run (${plan.why}).` }); return true; }

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
          finish(409, { ok: false, error: readLogTail(logFile) || `the engine refused to resume (exit ${code}) and left no message`, log: logFile });
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
