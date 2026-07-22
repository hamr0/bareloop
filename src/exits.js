// Layer 2: the exit evaluator — the SHELL's own fixed code for the closed
// exit menu (PRD v1.12 §3). An exit is declarative data; nothing here ever
// executes agent-authored text. Doctrine wired in, not promised:
//
//   - exits verify FORM, not truth: progress gates only; the operator's close
//     stays the one arbiter (checks decide nothing, mint nothing).
//   - `tree-changed` reads OUTCOME — real bytes vs a pre-step snapshot taken
//     by `snapshotScope` — never git status (always shows the planted bug,
//     F45) and never gate intent (the F43 identical-refire trap: an allowed
//     write that lands the same bytes is NOT a change).
//   - a failing exit's detail is a MECHANICAL gap (a named wall, a count) —
//     the genre that converts (F38/F46); details carry names and counts only,
//     never file bodies (they ride the spine, which is append-only forever).
//   - `check-passes` delegates through the `runCheck` seam the runner wires
//     to the full runClose machinery; the evaluator itself never spawns. An
//     unwired or throwing check fails CLOSED (the broken-close class: an
//     unrunnable check is a stop, never a silent pass).

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { globToPrefix } from './validate.js';

/** The check gap is ALREADY bounded upstream by runClose's boundGap (head +
 * gapKeep block ≤ 8192 + tail ≈ 10KB, with the failing-test NAMES preserved).
 * The evaluator must NOT re-truncate it: a 400-char clamp deletes exactly those
 * `not ok`/`FAILED` names — the mechanical gap the F46 conversion mechanism
 * feeds the worker (F28 reintroduced). This cap is a defensive backstop above
 * boundGap's own envelope: a normal bounded gap passes through intact, and only
 * a pathological seam that returned an unbounded gap would ever be trimmed. */
const CHECK_GAP_MAX = 12000;

/** @typedef {{ type: string, pass: boolean, detail?: string, fault?: string }} ExitResult
 * `fault` present means the INSTRUMENT could not judge (unwired snapshot/seam,
 * a check in runClose's forbidden zone) — it carries the runClose verdict name
 * ('failed'|'timed-out'|'killed'|'crashed') so the micro-loop escalates through
 * the same CLOSE_FAULTS taxonomy instead of feeding a fake gap to the worker.
 * A plain pass:false with no fault is honest worker feedback. */

/**
 * Snapshot the file state under a scope prefix — the "before" side of
 * `tree-changed`. Content hashes, not mtimes: only real bytes count as
 * outcome. A scope directory that does not exist yet snapshots empty (the
 * step creating it IS the change). Never throws on a missing dir.
 * @param {string} dir absolute workdir (the run directory)
 * @param {string} scope a validated scope glob (e.g. `tests/**`)
 * @returns {Promise<Map<string, string>>} relative path → sha256
 */
export async function snapshotScope(dir, scope) {
  const prefix = globToPrefix(scope);
  /** @type {Map<string, string>} */
  const snap = new Map();
  /** @type {string[]} */
  let entries;
  try {
    entries = /** @type {string[]} */ (await readdir(join(dir, prefix), { recursive: true, encoding: 'utf8' }));
  } catch {
    return snap; // missing scope dir = empty snapshot, never a throw
  }
  for (const rel of entries) {
    const full = join(dir, prefix, rel);
    let body;
    try { body = await readFile(full); } catch { continue; } // directories and vanished files skip
    snap.set(`${prefix}/${rel.replaceAll('\\', '/')}`, createHash('sha256').update(body).digest('hex'));
  }
  return snap;
}

/**
 * Evaluate a step's exits — AND-only (decision 8): the step passes iff EVERY
 * listed exit passes. All exits are evaluated (never short-circuit): the gap
 * must name every wall, not the first one hit.
 * @param {Array<Record<string, any>>} exits validated exit items
 * @param {{ dir: string, snapshot?: Map<string, string>, runCheck?: (name: string) => Promise<{pass: boolean, gap?: string}> }} ctx
 *   `dir`: the run directory; `snapshot`: the pre-step `snapshotScope` result
 *   (required by tree-changed — absent fails closed); `runCheck`: the runner's
 *   runClose-backed seam (required by check-passes — absent fails closed).
 * @returns {Promise<{ pass: boolean, results: ExitResult[] }>}
 */
export async function evalExits(exits, { dir, snapshot, runCheck }) {
  /** @type {ExitResult[]} */
  const results = [];
  for (const e of exits) {
    results.push(await evalOne(e, { dir, snapshot, runCheck }));
  }
  return { pass: results.every((r) => r.pass), results };
}

/**
 * @param {Record<string, any>} e
 * @param {{ dir: string, snapshot?: Map<string, string>, runCheck?: (name: string) => Promise<{pass: boolean, gap?: string}> }} ctx
 * @returns {Promise<ExitResult>}
 */
async function evalOne(e, { dir, snapshot, runCheck }) {
  if (e.type === 'artifact-written') {
    let body;
    try { body = await readFile(join(dir, e.path), 'utf8'); } catch {
      return { type: e.type, pass: false, detail: `${e.path} was not written (does not exist)` };
    }
    if (body.length === 0) return { type: e.type, pass: false, detail: `${e.path} is empty — a zero-byte artifact is not progress` };
    if (e.pattern !== undefined && !new RegExp(e.pattern, 'm').test(body)) {
      return { type: e.type, pass: false, detail: `${e.path} exists but does not match the declared pattern ${e.pattern}` };
    }
    return { type: e.type, pass: true };
  }

  if (e.type === 'tree-changed') {
    if (!(snapshot instanceof Map)) {
      // fail CLOSED as a FAULT: without the before-side this instrument is
      // blind — it must never read "changed" (F45) and never feed the miss to
      // the worker as if it were inaction
      return { type: e.type, pass: false, fault: 'failed', detail: `no pre-step snapshot for ${e.scope} — the tree-changed instrument is unwired (instrument fault, not worker inaction)` };
    }
    const now = await snapshotScope(dir, e.scope);
    let changed = 0;
    for (const [path, hash] of now) if (snapshot.get(path) !== hash) changed++;
    for (const path of snapshot.keys()) if (!now.has(path)) changed++; // deletions are real changes
    if (changed === 0) {
      return { type: e.type, pass: false, detail: `0 files changed under ${e.scope} — the tree is byte-identical to the step start (an identical re-write is not a change)` };
    }
    return { type: e.type, pass: true, detail: `${changed} file(s) changed under ${e.scope}` };
  }

  if (e.type === 'json-valid') {
    let body;
    try { body = await readFile(join(dir, e.path), 'utf8'); } catch {
      return { type: e.type, pass: false, detail: `${e.path} was not written (does not exist)` };
    }
    try { JSON.parse(body); } catch (err) {
      return { type: e.type, pass: false, detail: `${e.path} is not valid JSON: ${String(/** @type {Error} */ (err).message).slice(0, 200)}` };
    }
    return { type: e.type, pass: true };
  }

  if (e.type === 'check-passes') {
    if (typeof runCheck !== 'function') {
      return { type: e.type, pass: false, fault: 'failed', detail: `check "${e.name}" cannot run — runCheck is not wired (instrument fault: an unrunnable check is a stop, never a silent pass)` };
    }
    try {
      const r = await runCheck(e.name);
      if (r.pass) return { type: e.type, pass: true };
      // the seam's fault (a runClose forbidden-zone verdict) rides through by
      // NAME: 'crashed' keeps its F32 routing (worker-crash after writes —
      // the F46 broken-test mechanism), 'timed-out' keeps its own decision
      if (typeof (/** @type {any} */ (r).fault) === 'string') {
        return { type: e.type, pass: false, fault: /** @type {any} */ (r).fault, detail: `check "${e.name}": ${(r.gap ?? '').slice(0, CHECK_GAP_MAX)}` };
      }
      return { type: e.type, pass: false, detail: `check "${e.name}" red: ${(r.gap ?? '').slice(0, CHECK_GAP_MAX)}` };
    } catch (err) {
      return { type: e.type, pass: false, fault: 'failed', detail: `check "${e.name}" crashed the seam: ${String(/** @type {Error} */ (err).message).slice(0, 200)}` };
    }
  }

  // belt — the validator already reds unknown types; the evaluator must not
  // silently pass what it cannot judge
  return { type: String(e.type), pass: false, fault: 'failed', detail: `unknown exit type "${e.type}" — the evaluator cannot judge it (fail closed)` };
}
