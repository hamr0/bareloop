// The carry note's store (M1, F258): the run-level record behind src/carrynote.js. It captures the worker's read-class tool
// calls AT THE SOURCE (the worker's tool objects, result SUMMARIES only, never file
// content), reads the run's edits from the WORKING TREE (git diff against the run's start commit, never the spine), renders
// the note and persists its state in the ONE run state file (`runStateFile`, hamr 2026-11-24): beside the run's source.json, OUTSIDE the work copy
// (a green run removes the work copy), so drafting's signing gates and the run read and write the same file; outside the worker's readScope, so it
// cannot read it. The same file holds every COMPLETED check command result by (command key, tree fingerprint). There is no switch: the memo is
// always on (hamr 2026-11-01).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { redactSecrets } from './validate.js';
import { render, isCarryExcluded, HUNK_LINES } from './carrynote.js';
import { DIFF_DIR } from './rangereview.js';

const exec = promisify(execFile);
/**
 * THE one path of a run's state file (hamr 2026-11-24, ITEM33 addendum Part A): `dir` is the source door's own directory (`source.json` lives there;
 * the panel's `<session>/source-seed`, a prepared copy's `source-*`), or the spine directory for a bundle / a run with no prepared copy.
 * Drafting reaches it as `prep.into`, the run as its `into`; it is never inside the work tree. @param {string} dir
 */
export const runStateFile = (dir) => join(dir, 'run-state.json');
/** per command, the saved results kept: its first (the seed reading, whenever it was taken) and the newest few; a dropped one only means a rerun */
const KEEP_NEWEST_PER_COMMAND = 3;
/** the retry marker the next prompt of a retried step / fix try carries; kept as a pinned fact about the prompts, no longer read to decide an outcome */
export const RED_MARKER = /Previous attempt failed (this step's checks|the verification):/;

const lineCount = (/** @type {string} */ s) => (s === '' ? 0 : s.split('\n').length - (s.endsWith('\n') ? 1 : 0));
const clip = (/** @type {unknown} */ s, n = 200) => redactSecrets(String(s ?? '')).slice(0, n);

/** a file CODE wrote into the run's tree before any token (a range review's per-file diffs under `output/review-diff/`): an input, never a worker edit. The memo's EDITS owner (`workingEdits`) leaves it out; reads of it are still listed. @param {string} p */
const isCodeWrittenInput = (p) => p === DIFF_DIR || p.startsWith(`${DIFF_DIR}/`);

/**
 * The run's edits from the working tree against the start commit: tracked (git diff) plus untracked (no diff exists).
 * Arbiter books / .git / .bareloop are excluded. Never throws; [] on any git failure.
 * @param {string} workdir @param {string|null} base
 * @returns {Promise<{path: string, lines: number, hunks: string[]}[]>}
 */
export async function workingEdits(workdir, base) {
  if (!base) return [];
  const g = (/** @type {string[]} */ a) => exec('git', ['-c', 'core.quotepath=false', ...a], { cwd: workdir, maxBuffer: 1 << 26 });
  const out = [];
  try {
    const { stdout: names } = await g(['diff', '--name-only', '-z', base]);
    for (const p of names.split('\0').filter(Boolean)) {
      if (isCarryExcluded(p) || isCodeWrittenInput(p)) continue;
      const { stdout } = await g(['diff', '-U1', '--no-color', '--no-ext-diff', base, '--', `:(literal)${p}`]);
      if (/^(Binary files .* differ|GIT binary patch)$/m.test(stdout)) { out.push({ path: p, lines: 0, hunks: ['(binary file changed)'] }); continue; }
      const body = stdout.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(l));
      out.push({ path: p, lines: body.filter((l) => /^[+-]/.test(l)).length, hunks: body.slice(0, HUNK_LINES * 2) });
    }
    const { stdout: un } = await g(['ls-files', '--others', '--exclude-standard', '-z']);
    for (const p of un.split('\0').filter(Boolean)) {
      if (isCarryExcluded(p) || isCodeWrittenInput(p)) continue;
      try {
        const abs = resolve(workdir, p);
        if (!statSync(abs).isFile() || statSync(abs).size > 262144) continue;
        const text = readFileSync(abs, 'utf8');
        if (text.includes('\0')) continue;
        const ls = text.split('\n'); if (ls.at(-1) === '') ls.pop();
        out.push({ path: p, lines: ls.length, hunks: ls.slice(0, HUNK_LINES * 2).map((l) => '+' + l) });
      } catch { /* unreadable: not shown */ }
    }
  } catch { return out; }
  return out;
}

/**
 * Order edits oldest to newest by when they last changed: a file's recency is the latest settled ask whose `changed`
 * list names it; a file in no `changed` list is oldest. Ties keep their incoming (alphabetical) order. PURE.
 * @param {{path: string}[]} edits @param {{changed?: string[]}[]} settled asks settled so far, oldest first
 */
export function orderEditsByRecency(edits, settled) {
  const last = (/** @type {string} */ p) => { for (let i = settled.length - 1; i >= 0; i--) if ((settled[i].changed ?? []).includes(p)) return i; return -1; };
  return edits.map((e, k) => ({ e, k, r: last(e.path) })).sort((a, b) => a.r - b.r || a.k - b.k).map((x) => x.e);
}

/**
 * Run-level store. Asks are sequential, so "the current ask" is one counter.
 * `stateFile` = `runStateFile(dir)`; absent = nothing is written (a library caller that never resumes). The check results are always loaded
 * from it (drafting wrote some); the carry memo only on a resume.
 * @param {{workdir: string, stateFile?: string|null, emit: (type: string, rec: any) => void, strikeLimit?: number, resume?: boolean}} o
 */
export function createCarryStore({ workdir, stateFile = null, emit, strikeLimit, resume = false }) {
  workdir = resolve(workdir);
  /** @type {string|null} */
  let base = null;
  let n = 0;
  /** @type {any[]} */ let events = [];
  /** @type {any[]} one per WORK ask (step/fix): {n, kind, step, iteration, bounded, red, changed, startSnap} */
  let asks = [];
  let loaded = false;
  /** @type {string|null} the job's own count-check text at start (the seed note's body), the oldest entry of the memo's earlier failures */
  let startFailure = null;
  /** @type {Map<string, {key: string, treeId: string, code: number, out: string, ms: number, at: string}>} every COMPLETED check command result, by (command key, tree fingerprint) */
  const checks = new Map();
  const slot = (/** @type {string} */ key, /** @type {string} */ treeId) => `${key}\0${treeId}`;
  /** read the file once: the check results always, the carry memo only on a resume (a bad or missing file starts empty) */
  if (stateFile && existsSync(stateFile)) {
    try {
      const s = JSON.parse(readFileSync(stateFile, 'utf8'));
      for (const c of Array.isArray(s.checks) ? s.checks : []) if (c && typeof c.key === 'string' && typeof c.treeId === 'string' && typeof c.out === 'string') checks.set(slot(c.key, c.treeId), c);
      if (resume) { n = s.n ?? 0; events = s.events ?? []; asks = s.asks ?? []; base = s.base ?? null; startFailure = s.startFailure ?? null; loaded = true; }
    } catch { /* a bad file starts empty */ }
  }
  const save = () => {
    if (!stateFile) return;
    // atomic: a temp file, then a rename (src/learnstore.js does the same); a record, never a verdict: a failed save never breaks a run
    try {
      mkdirSync(dirname(stateFile), { recursive: true });
      const tmp = `${stateFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ n, base, events, asks, startFailure, checks: [...checks.values()] }));
      renameSync(tmp, stateFile);
    } catch { /* see above */ }
  };
  const rel = (/** @type {string} */ p) => (isAbsolute(p) ? relative(workdir, p) : p).split('\\').join('/') || '.';
  const diskLines = (/** @type {string} */ r, /** @type {string|undefined} */ fallback) => { try { return lineCount(readFileSync(resolve(workdir, r), 'utf8')); } catch { return fallback === undefined ? null : lineCount(fallback); } };

  /** Wrap the worker's read-class tools in place; records tool, args and a result SUMMARY - never file content. @param {{name: string, execute: Function}[]} tools */
  const wrapTools = (tools) => {
    for (const t of tools) {
      const inner = t.execute;
      if (t.name === 'shell_read') {
        t.execute = async (/** @type {any} */ args) => {
          const r = await inner(args);
          try {
            if (typeof r === 'string' && typeof args?.path === 'string') {
              const p = rel(args.path);
              const dirRead = /^dir /.test(r);
              events.push({ ask: n, tool: 'read', path: p, ...(dirRead ? { dir: true } : { lines: diskLines(p, r) }) });
            }
          } catch { /* never break the worker */ }
          return r;
        };
      } else if (t.name === 'ctx_get') {
        t.execute = async (/** @type {any} */ args) => {
          const r = await inner(args);
          try {
            if (typeof r === 'string' && typeof args?.path === 'string' && !/^(ctx_get failed|no chunk|stale)/.test(r)) {
              const p = rel(args.path);
              const a = Number(args.startLine); const b = Number(args.endLine);
              events.push({ ask: n, tool: 'get', path: p, lines: diskLines(p, undefined), range: Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null });
            }
          } catch { /* never break the worker */ }
          return r;
        };
      } else if (t.name === 'shell_grep') {
        t.execute = async (/** @type {any} */ args) => {
          const r = await inner(args);
          try {
            const hits = Array.isArray(r?.hits) ? r.hits : null;
            events.push({
              ask: n, tool: 'grep', pattern: clip(args?.pattern), scope: rel(String(args?.path ?? '.')),
              ...(hits ? { matches: hits.length, firstMatches: hits.slice(0, 3).map((/** @type {any} */ h) => `${rel(String(h.file))}:${h.line}`) } : {}),
            });
          } catch { /* never break the worker */ }
          return r;
        };
      } else if (t.name === 'ctx_recall') {
        t.execute = async (/** @type {any} */ args) => {
          const r = await inner(args);
          try {
            if (typeof r === 'string') {
              /** @type {string[]} */ const hitPaths = []; /** @type {string[]} */ const hitRanges = [];
              for (const line of r.split('\n')) {
                const m = /^([^\t]+)\t[^\t]*\t[^\t]*\tlines (\d+-\d+)$/.exec(line);
                if (m) { hitPaths.push(m[1]); hitRanges.push(`${m[1]} ${m[2]}`); }
              }
              events.push({ ask: n, tool: 'recall', query: clip(args?.query), hitPaths: [...new Set(hitPaths)], hitRanges });
            }
          } catch { /* never break the worker */ }
          return r;
        };
      }
    }
  };

  /** the per-entry cap on one file's function ranges, so one huge file cannot eat the memo */
  const FN_CAP = 500;
  /**
   * Function line ranges per read file, from the LiteCtx index's named chunks (`name a-b, ...`). Fresh index only: a node whose
   * last chunk ends past the file's current end is stale, and that file gets no ranges. Never throws.
   * @param {any[]} evs @param {(rel: string) => any} getNode @returns {Record<string, string>}
   */
  const fnRangesOf = (evs, getNode) => {
    /** @type {Record<string, string>} */ const out = {};
    for (const p of new Set(evs.filter((e) => (e.tool === 'read' || e.tool === 'get') && !e.dir && e.path && !isCarryExcluded(e.path)).map((e) => e.path))) {
      let node = null;
      try { node = getNode(p); } catch { node = null; }
      const n = diskLines(p, undefined);
      const named = (node?.chunks ?? []).filter((/** @type {any} */ c) => c.symbol);
      if (n === null || !named.length || !named.every((/** @type {any} */ c) => c.endLine <= n)) continue;
      let map = ''; let more = 0;
      for (let i = 0; i < named.length; i++) {
        const piece = `${named[i].symbol} ${named[i].startLine}-${named[i].endLine}`;
        if ((map ? map.length + 2 : 0) + piece.length > FN_CAP) { more = named.length - i; break; }
        map += (map ? ', ' : '') + piece;
      }
      out[p] = map + (more ? `, +${more} more` : '');
    }
    return out;
  };

  const snapOf = (/** @type {{path: string, lines: number}[]} */ edits) => Object.fromEntries(edits.map((e) => [e.path, e.lines]));
  const tryLabel = (/** @type {any} */ a) => (a.kind === 'fix' ? `fix loop try ${a.iteration}` : `step "${a.step}" try ${a.iteration}`);
  // how the try ended AND what its check said: a bounded try says both (the bound hides nothing)
  const endedOf = (/** @type {any} */ a) => {
    const res = a.result === 'red' ? 'Its check failed.' : a.result === 'green' ? 'Its check passed.' : null;
    if (a.boundedText) return `${a.boundedText} ${res ?? 'Check not run.'}`;
    return res ?? 'No check result was recorded for it.';
  };

  /**
   * Called at the start of EVERY ask (scout and drafter included, so their finds feed the store).
   * Returns the note text for step/fix asks, '' otherwise.
   * `getNode`: the LiteCtx index's node for a path (its `chunks`), for the function ranges; absent = no ranges.
   * @param {{phase: string, iteration: number|string|undefined, prompt: string, getNode?: (rel: string) => any}} o
   */
  const beginAsk = async ({ phase, iteration, prompt, getNode }) => {
    n++;
    const work = phase === 'fix' || phase.startsWith('step:');
    if (!work) { save(); return ''; }
    const edits = await workingEdits(workdir, base);
    const prev = asks[asks.length - 1];
    if (prev && prev.red === undefined) {
      // settle the previous work ask: red = the check result the engine handed to settleAsk (never this prompt's wording);
      // changed = files whose changed-line count moved
      prev.red = prev.result === 'red';
      const now = snapOf(edits);
      prev.changed = [...new Set([...Object.keys(now), ...Object.keys(prev.startSnap)])].filter((p) => now[p] !== prev.startSnap[p]).sort();
      for (const e of events) if (e.ask === prev.n) e.noFix = prev.changed.length === 0 && prev.red;
    }
    const kind = phase === 'fix' ? 'fix' : 'step';
    const step = kind === 'step' ? phase.slice('step:'.length) : null;
    const settled = asks.filter((a) => a.red !== undefined);
    const lt = settled[settled.length - 1];
    // this ask is a retry of the last try only when its prompt carries the retry gap (RED_MARKER); after a replan or on a new step it does not
    const isRetry = typeof prompt === 'string' && RED_MARKER.test(prompt);
    const notes = {
      lastTry: lt ? { step: lt.step, kind: lt.kind, n: lt.iteration, of: lt.kind === 'step' ? strikeLimit : undefined, ended: endedOf(lt), changed: lt.changed } : null,
      lastCheck: null, // the failed check's text is already in the prompt today; one copy
      events: events.map((e) => ({ ...e })),
      edits: orderEditsByRecency(edits, settled),
      // every failed check's whole text, oldest first; the newest is left out only when it belongs to the last settled try
      // AND this ask is a retry of it (its prompt carries the gap, one copy); after a replan the next ask is no retry, so it stays here. A failure from a try that was later passed is in no prompt.
      // plus the start failure, oldest of all: it is never in a prompt gap, so it is never the one left out
      failures: [...(startFailure ? [{ label: 'at start', text: startFailure }] : []), ...settled.filter((a) => a.failure && !(a === lt && isRetry)).map((a) => ({ label: tryLabel(a), text: a.failure }))],
      earlier: settled.slice(0, -1).map((a) => `${tryLabel(a)}: ${endedOf(a)} ${a.changed.length ? `Changed ${a.changed.join(', ')}.` : 'Changed nothing.'}`),
      lastAsk: lt ? lt.n : undefined,
      fnRanges: getNode ? fnRangesOf(events, getNode) : {},
    };
    asks.push({ n, kind, step, iteration, startSnap: snapOf(edits) });
    const hasAny = notes.events.length || edits.length || notes.earlier.length || notes.failures.length || notes.lastTry;
    if (!hasAny) { save(); return ''; }
    const r = render(/** @type {any} */ (notes));
    // counts plus the note text itself (F274, so the Audit can show it where it was handed). `render` masked the whole text with the one
    // inventory; the second pass here is idempotent. `chars` = the length of this saved (masked) text.
    const saved = redactSecrets(r.text);
    emit('carry-note', { phase, iteration, chars: saved.length, capped: r.capped, sections: r.sections, text: saved });
    save();
    return r.text;
  };

  /** Called when the ask returns (finally). @param {{bounded?: {iteration: any, cause: string}|undefined, iteration: any, rounds: number}} o */
  const endAsk = ({ bounded, iteration, rounds }) => {
    const a = asks[asks.length - 1];
    if (!a || a.n !== n) return;
    if (bounded && bounded.iteration === iteration) {
      a.boundedText = bounded.cause === 'rounds' ? `Ran out of calls (${rounds} of ${rounds}).`
        : bounded.cause === 'wall' ? 'Stopped by the wall clock.'
        : bounded.cause === 'denied' ? 'Stopped after repeated denied calls.' : 'Output cut at the token limit.';
    }
    save();
  };

  /**
   * The engine's own check result for the ask that just returned: 'green' (every check passed), 'red' (one failed) or
   * 'unknown' (the check hit an instrument fault, so no honest answer). Only the first result per ask counts.
   * A red also hands over the check's WHOLE failing text (the gap the next prompt carries); it is stored masked, never clipped.
   * @param {'green'|'red'|'unknown'} result @param {string} [text]
   */
  const settleAsk = (result, text) => {
    const a = asks[asks.length - 1];
    if (!a || a.n !== n || a.result !== undefined) return;
    a.result = result;
    if (result === 'red' && typeof text === 'string' && text !== '') a.failure = redactSecrets(text);
    save();
  };

  /** The seed note's body (already secret-masked), set once per run; a resume keeps the one it persisted. @param {string} text */
  const setStartFailure = (text) => { if (!startFailure && text) { startFailure = text; save(); } };

  /** the saved result of this command on exactly these files, or undefined @param {string} key @param {string} treeId */
  const findCheck = (key, treeId) => checks.get(slot(key, treeId));
  /** keep a COMPLETED check command's result under (command key, tree fingerprint); the one scrub of its output happens here @param {{key: string, treeId: string, code: number, out: string, ms: number}} rec */
  const keepCheck = (rec) => {
    try {
      checks.set(slot(rec.key, rec.treeId), { key: rec.key, treeId: rec.treeId, code: rec.code, out: redactSecrets(rec.out), ms: rec.ms, at: new Date().toISOString() });
      const mine = [...checks.entries()].filter(([, c]) => c.key === rec.key);
      for (const [k] of mine.slice(1, Math.max(1, mine.length - KEEP_NEWEST_PER_COMMAND))) checks.delete(k);
      save();
    } catch { /* never breaks a run */ }
  };
  return { wrapTools, beginAsk, setStartFailure, keepCheck, findCheck, endAsk, settleAsk, setBase: (/** @type {string|null|undefined} */ b) => { if (!base && b) base = b; }, loaded: () => loaded, _state: () => ({ n, events, asks, base }) };
}
