// An IMPORTED job's Run tab reads like a normal run page: the latest GREEN run in the bundle, rendered by the same
// summary / map / audit code a run uses. Where that run comes from, in order:
//   1. `<bundle>/runs/<runid>/spine.jsonl` (what `bareloop run <bundle>` writes) — the newest one that ended green.
//      The panel reads it through the ordinary `/api/runs/<id>` routes (the run's id there is `<importId>~<runid>`).
//   2. else the bundle's bridge (`bridges/*.json`): the plan's steps and the numbers the bridge carries, as a run
//      detail with every field it does not carry left null (the page says "not recorded", never 0).
//   3. else nothing: "no green run in this bundle".
// READ ONLY, and the bundle is untrusted input: nothing is ever written into it; every path is built from a checked
// name and `lstat`ed (a link is never followed), reads are size-bounded, a parse failure reads as "not recorded".

import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { replayOne, parseJsonl } from '../replayio.js';
import { statusFor } from './status.js';

/** the most run folders one bundle is searched through (newest first) */
export const MAX_RUN_DIRS = 40;
/** the biggest spine / tool-log file that is read (bytes) */
export const MAX_RUN_FILE_BYTES = 32 * 1024 * 1024;
const RUN_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const IMPORTED_RUN_RE = /^([0-9a-f]{12})~([A-Za-z0-9_-]{1,64})$/;

/** @param {string} p @returns {import('node:fs').Stats|null} */
function lst(p) { try { return lstatSync(p); } catch { return null; } }

/** the id an imported run has in `/api/runs/<id>` @param {string} importId @param {string} runid */
export function importedRunId(importId, runid) { return `${importId}~${runid}`; }

/** @param {string} id @returns {{importId: string, runid: string}|null} */
export function parseImportedRunId(id) {
  const m = IMPORTED_RUN_RE.exec(id);
  return m ? { importId: m[1], runid: m[2] } : null;
}

/**
 * The spine path of `<dir>/runs/<runid>`, or null when it is not a plain, bounded file in plain folders: `runs/` and
 * the run folder must be real directories (a link is refused), the spine a regular file under the size bound, and a
 * tool log beside it (either spelling the replay reader looks for) must not be a link or oversize either.
 * @param {string} dir the bundle folder
 * @param {string} runid
 * @returns {string|null}
 */
export function safeSpinePath(dir, runid) {
  if (typeof runid !== 'string' || !RUN_NAME_RE.test(runid)) return null;
  const runDir = join(dir, 'runs', runid);
  for (const p of [join(dir, 'runs'), runDir]) {
    const s = lst(p);
    if (!s || !s.isDirectory()) return null;
  }
  const spine = join(runDir, 'spine.jsonl');
  const ss = lst(spine);
  if (!ss || !ss.isFile() || ss.size > MAX_RUN_FILE_BYTES) return null;
  for (const name of ['gate-audit.jsonl', 'spine-gate-audit.jsonl']) {
    const s = lst(join(runDir, name));
    if (s && (!s.isFile() || s.size > MAX_RUN_FILE_BYTES)) return null;
  }
  return spine;
}

/**
 * The run folders of a bundle that hold a readable spine, newest spine first (bounded).
 * @param {string} dir
 * @returns {{runid: string, spine: string, mtimeMs: number}[]}
 */
export function bundleRuns(dir) {
  let names;
  try { names = readdirSync(join(dir, 'runs'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
  /** @type {{runid: string, spine: string, mtimeMs: number}[]} */
  const out = [];
  for (const runid of names) {
    const spine = safeSpinePath(dir, runid);
    const s = spine ? lst(spine) : null;
    if (spine && s) out.push({ runid, spine, mtimeMs: s.mtimeMs });
  }
  out.sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.runid.localeCompare(b.runid));
  return out.slice(0, MAX_RUN_DIRS);
}

/**
 * When the run started: its `job-start` record's `ts`, else the spine file's mtime (an ISO string). Never throws.
 * @param {string} spine
 * @returns {string}
 */
export function spineStartedAt(spine) {
  try {
    const first = parseJsonl(spine).records.find((r) => r && r.type === 'job-start' && typeof r.ts === 'string' && Number.isFinite(Date.parse(r.ts)));
    if (first) return first.ts;
  } catch { /* falls back to the file's own time */ }
  const s = lst(spine);
  return new Date(s ? s.mtimeMs : 0).toISOString();
}

/**
 * The newest run in the bundle whose spine ended green (`green` / `already-green`, the same two the run page's Ended
 * block calls green). A spine that cannot be read is skipped, never fatal.
 * @param {string} dir
 * @returns {{runid: string, spine: string, at: string}|null}
 */
export function latestGreenRun(dir) {
  for (const r of bundleRuns(dir)) {
    let outcome = null;
    try { outcome = replayOne(r.spine, { skipAudit: true }).outcome; } catch { continue; }
    if (outcome === 'green' || outcome === 'already-green') return { runid: r.runid, spine: r.spine, at: spineStartedAt(r.spine) };
  }
  return null;
}

/**
 * The newest green version across a bundle's bridges (by `greenAt`), with the history row of the same run (it
 * carries whether the spend figure is complete). A malformed bridge or version is skipped.
 * @param {any[]} bridges
 * @returns {{bridge: any, version: any, historyRow: any|null}|null}
 */
export function latestBridgeGreen(bridges) {
  /** @type {{bridge: any, version: any, at: number}|null} */
  let best = null;
  for (const b of Array.isArray(bridges) ? bridges : []) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.versions)) continue;
    for (const v of b.versions) {
      if (!v || typeof v !== 'object' || typeof v.greenAt !== 'string') continue;
      const at = Date.parse(v.greenAt);
      if (!Number.isFinite(at)) continue;
      if (!best || at > best.at) best = { bridge: b, version: v, at };
    }
  }
  if (!best) return null;
  const hist = Array.isArray(best.bridge.history) ? best.bridge.history : [];
  const historyRow = typeof best.version.runid === 'string'
    ? (hist.find((/** @type {any} */ h) => h && h.runid === best.version.runid && h.outcome === 'green') ?? null) : null;
  return { bridge: best.bridge, version: best.version, historyRow };
}

/** @param {unknown} v @returns {number|null} */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
/** @param {unknown} v @returns {string[]} */
const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0).slice(0, 100) : []);

/**
 * The run detail of the bridge's green version, in the SAME shape `getRunDetail` returns (so the page's one run
 * renderer paints it), plus `fromBridge: true`. Only what the bridge carries is filled; every other field is null
 * ("not recorded" on the page), never 0: no tool counts, no cache, no per-step figures, no close stages' numbers.
 * @param {{bridge: any, version: any, historyRow: any|null}} g
 * @param {{job: string, checkType: string, checkTypeTitle: string|null, model: string|null, budgetUsd: number|null}} facts
 * @returns {any}
 */
export function bridgeRunDetail(g, facts) {
  const v = g.version;
  const steps = Array.isArray(v.plan?.steps) ? v.plan.steps.filter((/** @type {any} */ s) => s && typeof s.id === 'string').slice(0, 200) : [];
  const parts = steps.map((/** @type {any} */ s) => ({
    kind: 'step', label: s.id, occurrence: 1, tryNumber: 1, continued: false, resumedNext: false, outcome: null, stopReason: null,
    attempts: [], blocked: 0, rounds: null, toolCalls: null, wallMs: null, spentUsd: null, unpricedRounds: 0, byTool: null,
  }));
  const stageNames = strs(g.bridge.closeStageNames);
  return {
    fromBridge: true,
    runid: typeof v.runid === 'string' ? v.runid : null,
    job: facts.job,
    goal: null,
    checkType: facts.checkType,
    checkTypeTitle: facts.checkTypeTitle,
    model: facts.model,
    provider: null,
    judgeModel: null,
    budgetUsd: facts.budgetUsd,
    glyph: '✓',
    status: statusFor({ outcome: 'green' }),
    outcome: 'green',
    died: false,
    stopReason: 'not recorded',
    ended: null,
    live: false,
    stopping: false,
    legs: [],
    legDividers: [],
    resumedCount: 0,
    resume: null,
    spentUsd: num(v.costUsd),
    spendComplete: g.historyRow ? g.historyRow.spendComplete === true : null,
    draftSpentUsd: null,
    draftSpendComplete: null,
    spendFloorUsd: null,
    wallFloorMs: null,
    wallMs: num(v.wallMs),
    rounds: num(v.rounds),
    timelineKind: 'plan',
    steps: parts.map((/** @type {any} */ p) => ({
      id: p.label, occurrence: 1, outcome: null, state: 'done', rounds: null, toolCalls: null, wallMs: null, spentUsd: null,
      unpricedRounds: 0, checks: null, treeChanged: null, tripped: null, attempts: [],
    })),
    scoutPlan: null,
    fixLoop: null,
    parts,
    replans: null,
    close: stageNames.length > 0 ? { verdict: `satisfied — ${stageNames.join(' · ')}` } : null,
    branch: null,
    date: typeof v.greenAt === 'string' ? v.greenAt.slice(0, 10) : null,
    at: v.greenAt,
    via: 'import',
    behaviour: null,
    memoryCache: null,
    toolsUsed: strs(g.bridge.toolsUsed),
  };
}
