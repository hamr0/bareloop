// F399 (Addendum 2026-11-25d): the TWO readers every view asks about a run, so no view scans spine records on its own.
//
//  - `checksOf(spine, runDir, opts)`: what the run CHECKED and how each check came out. It reads the run's CURRENT leg (one exception, said where it
//    happens: `fence`, which sums every leg because the Audit's fence row always did).
//  - `outputOf(spine, runDir, opts)`: what the run MADE (files delivered or staged, edits, findings, the work branch). It reads the WHOLE run, every
//    leg: the edits and files of a run pile up on its work branch.
//
// Job kinds fork in ONE table per reader: STAGE_ROWS (checksOf, by close-stage kind) and OUTPUT (outputOf, by record type). Both are REPORT readers:
// no verdict, no budget, no close path reads anything from here (the arbiter's own reads, the close-trend governor and the resume checkpoint reader in
// src/reuse.js, stay where they are; tests/runread-guard.test.js lists every other spine scan that is allowed and why).
//
// Pure except for: file reads of the run's own saved files (`fileState`, `judgedFile`), the one `git rev-parse` of the work branch, and the optional
// `opts.spec` (else `runDir/resolved-spec.json`).
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, isAbsolute, sep } from 'node:path';
import { currentLegView, finalCloseOf } from './legs.js';
import { rowResultsOf } from './rowresults.js';
import { shapePartOf } from './shaperows.js';
import { shapeItemOfPlain } from './shapewords.js';
import { stepFileRel } from './rubricstep.js';
import { placeRuleLines } from './placerule.js';
import { replayRun } from './replay.js';

/** @param {string} p @returns {any} */
const jsonOf = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// ── one saved file, read honestly ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One saved file: it must still be a regular file at the recorded path whose sha256 equals the record's. A mismatch or a missing file is a STATE, never
 * content: stale bytes are never returned.
 * @param {{path: string, sha256?: string|null}} rec
 * @returns {{state: 'ok', buf: Buffer}|{state: 'gone'|'changed', buf: null}}
 */
export function fileState(rec) {
  let st;
  try { st = lstatSync(rec.path); } catch { return { state: 'gone', buf: null }; }
  if (!st.isFile()) return { state: 'gone', buf: null };
  let buf;
  try { buf = readFileSync(rec.path); } catch { return { state: 'gone', buf: null }; }
  if (typeof rec.sha256 !== 'string' || createHash('sha256').update(buf).digest('hex') !== rec.sha256) return { state: 'changed', buf: null };
  return { state: 'ok', buf };
}

/**
 * The file the LAST check judged for job line `n` (a red run's rows), from the run's own `output-judged` record `{step, iteration, path, bytes, sha256}`.
 * The line is matched by the path the signed close judges (`stepFileRel(n)`), never by a path from a request. It is resolved against the run's own tree
 * root, must stay inside it, and must still match the record's sha256. `none` = no such record (an old spine, or a try that never reached its check).
 * @param {any[]} records @param {number} n @param {string|null} root
 * @returns {{state: 'ok', buf: Buffer}|{state: 'gone'|'changed'|'none', buf: null}}
 */
export function judgedFile(records, n, root) {
  const rel = stepFileRel(n);
  const rec = records.findLast((r) => r && r.type === 'output-judged' && r.path === rel && typeof r.sha256 === 'string');
  if (!rec) return { state: 'none', buf: null };
  if (root === null || root === undefined) return { state: 'gone', buf: null };
  let abs;
  try {
    abs = realpathSync(join(root, rel));
    const base = realpathSync(root);
    if (!abs.startsWith(base + sep)) return { state: 'gone', buf: null };
  } catch { return { state: 'gone', buf: null }; }
  const got = fileState({ path: abs, sha256: rec.sha256 });
  return got.state === 'ok' ? got : { state: got.state, buf: null };
}

// ── checksOf ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** @param {any} spec @returns {any[]} the signed close's rubric-step stages, in declared order */
export function rubricStagesOf(spec) {
  const stages = Array.isArray(spec?.closeDecl?.stages) ? spec.closeDecl.stages : [];
  return stages.filter((/** @type {any} */ s) => s && s.kind === 'rubric-step' && s.params && Number.isInteger(s.params.step));
}

/**
 * A red run's shape item reds for one stage (raw `#<i>:<path>:<reason>` strings, names and counts only), in the order of what is recorded:
 * the final close's own stage `items`; else the run's `shape-items` record for that stage (written at the moment the red happened); else, for a run
 * recorded before that record existed, our own gap sentences read back (src/shapewords.js `shapeItemOfPlain`).
 * @param {any[]} legRecords the current leg's records @param {any|null} close the final close @param {string} stageName @param {number|null} line
 * @returns {string[]}
 */
function shapeItemsOf(legRecords, close, stageName, line) {
  const st = close ? (close.stages ?? []).find((/** @type {any} */ x) => x && x.name === stageName) : null;
  if (st && Array.isArray(st.items)) return st.items.filter((/** @type {unknown} */ x) => typeof x === 'string');
  const rec = legRecords.findLast((r) => r && r.type === 'shape-items' && r.step === stageName && Array.isArray(r.items));
  if (rec) return rec.items.filter((/** @type {unknown} */ x) => typeof x === 'string');
  const gapRec = legRecords.findLast((r) => r && r.type === 'close-verdict' && typeof r.gap === 'string' && r.gap.includes(': item ')) ?? null;
  if (!gapRec || line === null) return [];
  return [...new Set(String(gapRec.gap).split('\n').flatMap((/** @type {string} */ l) => { const m = new RegExp(`line ${line}: (item \\d+.*)$`).exec(l); const red = m ? shapeItemOfPlain(m[1]) : null; return red ? [red] : []; }))];
}

/**
 * THE fork table of checksOf: how one signed close-stage kind turns what the run recorded into per-row results. A kind not listed reads as `plain`:
 * the rows its stage entry recorded (a guard stage's own row), nothing more.
 * `got.fallback` rows are what a red run can still say (read BEFORE the final close's own rows, which win).
 * @type {Record<string, (st: any, ctx: {spec: any, legRecords: any[], close: any|null}) => {rows: {key: string, result: string, why?: string}[], unclaimed: string[], items: string[]|null}>}
 */
const STAGE_ROWS = {
  'rubric-step': (st, ctx) => {
    const list = Array.isArray(ctx.spec?.closeDecl?.list) ? ctx.spec.closeDecl.list : null;
    const recorded = ctx.close?.stages?.find((/** @type {any} */ x) => x && x.name === st.name);
    const items = shapeItemsOf(ctx.legRecords, ctx.close, st.name, st.params.step);
    if (list === null || !shapePartOf(st.params) || (recorded && Array.isArray(recorded.rows) && recorded.rows.length) || items.length === 0) return { rows: [], unclaimed: [], items: items.length ? items : null };
    const per = rowResultsOf(list, st.params, { rawGaps: [{ id: 'p1-shape', check: 'itemShape', kind: 'item-shape', items }], detail: {} });
    return { rows: per.rows.map((r) => ({ key: r.key, result: r.result, ...(typeof r.why === 'string' ? { why: r.why } : {}) })), unclaimed: per.unclaimed, items };
  },
  plain: () => ({ rows: [], unclaimed: [], items: null }),
};

/**
 * What a run CHECKED and how each check came out (the run's current leg). `null` for an empty spine.
 * @param {any[]} spine parsed records @param {string|null} runDir the folder holding resolved-spec.json
 * @param {{spec?: any, auditBlocked?: (() => number|null)|null}} [opts] `spec`: the signed spec already in hand (else read from `runDir`); `auditBlocked`: the OLD-RUN fallback for the fence (the gate-audit sidecar scoped by the run's windows), asked only when no leg wrote a `fence` record
 */
export function checksOf(spine, runDir, opts = {}) {
  const leg = currentLegView(spine);
  if (!leg) return null;
  const spec = opts.spec !== undefined ? opts.spec : (runDir ? jsonOf(join(runDir, 'resolved-spec.json')) : null);
  const close = finalCloseOf(spine);
  const legRecords = leg.records;
  /** @type {any[]} */
  const stages = close ? (Array.isArray(close.stages) ? close.stages : []).filter((/** @type {any} */ s) => s && typeof s.name === 'string') : [];
  /** @type {Map<string, 'passed'|'failed'>} stage name -> its verdict in the FINAL close */
  const stageVerdict = new Map(stages.map((/** @type {any} */ s) => [s.name, s.verdict === 'satisfied' ? 'passed' : 'failed']));
  const declared = Array.isArray(spec?.closeDecl?.stages) ? spec.closeDecl.stages : [];
  /** @type {Map<string, {result: string, why?: string}>} */
  const rows = new Map();
  /** @type {Map<number, string[]>} */
  const unclaimed = new Map();
  /** @type {Map<string, string[]>} stage name -> raw shape item reds */
  const shapeItems = new Map();
  const ctx = { spec, legRecords, close };
  // 1. what a red run can still say about a shape line: read first, so the final close's own rows (below) win
  for (const st of rubricStagesOf(spec)) {
    const got = (STAGE_ROWS[st.kind] ?? STAGE_ROWS.plain)(st, ctx);
    if (got.items) shapeItems.set(st.name, got.items);
    for (const r of got.rows) rows.set(r.key, { result: r.result, ...(typeof r.why === 'string' ? { why: r.why } : {}) });
    if (got.unclaimed.length) unclaimed.set(st.params.step, got.unclaimed);
  }
  // 2. the final close's own per-row record (a stage of any kind; `unclaimed` belongs to a rubric stage's job line)
  const lineOf = new Map(rubricStagesOf(spec).map((/** @type {any} */ s) => [s.name, s.params.step]));
  for (const st of stages) {
    for (const r of Array.isArray(st.rows) ? st.rows : []) {
      if (r && typeof r.key === 'string' && typeof r.result === 'string') rows.set(r.key, { result: r.result, ...(typeof r.why === 'string' ? { why: r.why } : {}) });
    }
    const line = lineOf.get(st.name);
    if (line !== undefined && Array.isArray(st.unclaimed) && st.unclaimed.length) unclaimed.set(line, st.unclaimed.filter((/** @type {unknown} */ u) => typeof u === 'string'));
  }
  // a stage the signed close declares but the final close never reached (it stops at its first red)
  const notReached = close ? declared.filter((/** @type {any} */ x) => x && typeof x.name === 'string' && !stageVerdict.has(x.name)).map((/** @type {any} */ x) => x.name) : [];
  // the write fence: the gate held it, and how many writes it blocked. THE ONE read past the current leg: every leg's `fence` record counts, as the Audit's fence row always summed every leg's window
  const fenceRecs = spine.filter((r) => r && r.type === 'fence');
  /** @type {{held: true, blocked: number}|null} */
  let fence = null;
  if (fenceRecs.length) fence = { held: true, blocked: fenceRecs.reduce((a, r) => a + (Number.isInteger(r.blocked) ? r.blocked : 0), 0) };
  else if (typeof opts.auditBlocked === 'function') { const b = opts.auditBlocked(); if (b !== null && b !== undefined) fence = { held: true, blocked: b }; }
  return {
    leg,
    source: close?.type ?? null,
    verdict: close?.verdict ?? null,
    iteration: typeof close?.iteration === 'number' ? close.iteration : null,
    closeReached: close !== null,
    /** the stage that rendered the final close's verdict (a satisfied close names none) */
    failingStage: typeof close?.stage === 'string' && close.stage !== '' ? close.stage : null,
    close,
    stages,
    stageVerdict,
    notReached,
    rows,
    unclaimed,
    shapeItems,
    fence,
    placeRules: placeRuleLines(spine),
    outcome: leg.outcome,
    /** the LAST failing `check-passes` a step's exit check recorded, anywhere in the run (a red run's first gap line, GAP-1: its `detail` words), or null */
    redCheck: (() => { const ev = spine.findLast((r) => r && r.type === 'exit-eval' && Array.isArray(r.results) && r.results.some((/** @type {any} */ x) => x && x.type === 'check-passes' && x.pass === false)); return ev ? ev.results.find((/** @type {any} */ x) => x && x.type === 'check-passes' && x.pass === false) : null; })(),
    /** a run the close never reached: the steps' own checks, as the replay parts of THIS leg's records (never the whole spine: an earlier leg's tries do not leak in). `null` when there is a close or none could be built */
    stepParts: () => { if (close) return null; try { return replayRun(legRecords).parts ?? null; } catch { return null; } },
    /** the file a check judged for job line `n`, read honestly (GAP-3) @param {number} n @param {string|null} root */
    judged: (n, root) => judgedFile(spine, n, root),
    /** what the line's check read (GAP-4): the run's LAST `rubric-evidence` record for job line `n`, or null @param {number} n */
    evidence: (n) => spine.findLast((r) => r && r.type === 'rubric-evidence' && r.step === n && Array.isArray(r.evidence)) ?? null,
  };
}

// ── outputOf ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE fork table of outputOf: one entry per kind of output record, each handing its record to the part of the answer it feeds.
 * @type {Record<string, (r: any, acc: any) => void>}
 */
const OUTPUT = {
  // files copied out to Destination (R) / a review report landing at Accept (D review): one per path, the last record of a path winning
  'destination-written': (r, acc) => {
    if (typeof r.path !== 'string' || !isAbsolute(r.path)) return;
    if (typeof r.staged === 'string') acc.made.delete(r.staged); // an Accept replaces the staged name
    acc.made.set(r.path, { role: 'delivered', path: r.path, bytes: typeof r.bytes === 'number' ? r.bytes : null, sha256: typeof r.sha256 === 'string' ? r.sha256 : null, ...(typeof r.pairedTaken === 'string' && r.pairedTaken ? { pairedTaken: r.pairedTaken } : {}), ...(typeof r.staged === 'string' ? { replaces: r.staged } : {}) });
  },
  // a review's report, under output/ until an honoured Accept
  'report-staged': (r, acc) => {
    if (typeof r.path !== 'string' || !isAbsolute(r.path)) return;
    acc.made.set(r.path, { role: 'staged', path: r.path, bytes: typeof r.bytes === 'number' ? r.bytes : null, sha256: typeof r.sha256 === 'string' ? r.sha256 : null, ...(typeof r.pairedTaken === 'string' && r.pairedTaken ? { pairedTaken: r.pairedTaken } : {}) });
  },
  // D change: the edits (the spine's own copy survives a deleted branch)
  'attempt-diff': (r, acc) => { if (Array.isArray(r.files)) acc.diffRecs.push(r); },
  'work-branch': (r, acc) => { if (typeof r.branch === 'string') acc.workBranch = r; },
  'work-committed': (r, acc) => { acc.committed = r; },
  'review-findings': (r, acc) => { if (Number.isInteger(r.line) && Array.isArray(r.items)) acc.findingsByLine.set(r.line, r); if (Number.isInteger(r.files)) acc.findingsFiles = r.files; },
};

/**
 * What a run MADE, over the WHOLE run (every leg). `null` for an empty spine.
 *  - `files`: delivered / staged files (role, path, bytes, sha256, replaces, pairedTaken), one per path; with `opts.read` each also carries `state`
 *    (ok / gone / changed) and `content` (the bytes, only when ok): stale bytes are never returned (GAP-2, GAP-5).
 *  - `changed`: every path the run edited, in first-seen order. `diffs`: the edit records, one per edit (GAP-7).
 *  - `findings`: a review's `review-findings` per line (GAP-6). `refused`: the current leg's `destination-refused`.
 *  - `landing`: the work branch (from `work-branch`), its final commit (from `work-committed`, else asked of git live), and whether the folder was kept.
 * @param {any[]} spine @param {string|null} _runDir
 * @param {{read?: boolean, repo?: string|null, folder?: string|null}} [opts] `repo`: the person's repo (the one live `git rev-parse` of the branch)
 */
export function outputOf(spine, _runDir, opts = {}) {
  const leg = currentLegView(spine);
  if (!leg) return null;
  const acc = { made: new Map(), diffRecs: /** @type {any[]} */ ([]), workBranch: /** @type {any} */ (null), committed: /** @type {any} */ (null), findingsByLine: new Map(), findingsFiles: /** @type {number|null} */ (null) };
  for (const r of spine) { const f = r && OUTPUT[r.type]; if (f) f(r, acc); }
  /** @type {any[]} */
  const files = [...acc.made.values()].map((f) => { if (opts.read !== true) return f; const got = fileState(f); return { ...f, state: got.state, content: got.buf }; });
  const edits = acc.diffRecs.map((r, i) => ({
    n: i + 1,
    step: typeof r.step === 'string' ? r.step : null,
    files: r.files.filter((/** @type {any} */ f) => f && typeof f.path === 'string').map((/** @type {any} */ f) => ({
      path: f.path, diff: typeof f.diff === 'string' ? f.diff : '',
      cut: f.truncated === true ? (Number.isInteger(f.cutLines) ? f.cutLines : 0) : null,
    })),
    binary: Array.isArray(r.binary) ? r.binary.filter((/** @type {any} */ b) => typeof b === 'string') : [],
  }));
  const changed = [...new Set(edits.flatMap((e) => [...e.files.map((f) => f.path), ...e.binary]))];
  const refused = leg.records.findLast((r) => r && r.type === 'destination-refused') ?? null;
  const wb = acc.workBranch;
  /** @type {string|null} the branch tip, asked of git itself: the ONE git call here */
  let tip = null;
  if (wb && opts.repo) {
    try { tip = execFileSync('git', ['-C', opts.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${wb.branch}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || null; } catch { tip = null; }
  }
  const landing = wb || acc.committed ? {
    branch: typeof acc.committed?.branch === 'string' ? acc.committed.branch : (wb ? wb.branch : null),
    base: typeof wb?.base === 'string' ? wb.base : null,
    commit: typeof acc.committed?.commit === 'string' ? acc.committed.commit : null,
    folderKept: acc.committed ? acc.committed.folderKept === true : null,
    tip,
  } : null;
  const has = (/** @type {string} */ role) => files.some((x) => x.role === role);
  const kind = has('staged') ? 'review' : has('delivered') ? 'files' : changed.length ? 'change' : 'none';
  const findingsLines = [...acc.findingsByLine.keys()].sort((a, b) => a - b);
  return {
    kind,
    files,
    delivered: files,
    changed,
    diffs: edits,
    findings: findingsLines.length ? { byLine: acc.findingsByLine, lines: findingsLines, files: acc.findingsFiles } : (acc.findingsFiles !== null ? { byLine: acc.findingsByLine, lines: [], files: acc.findingsFiles } : null),
    refused,
    landing,
  };
}
