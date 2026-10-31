// The carry note's store (M1, F258): the run-level record behind src/carrynote.js. It captures the worker's read-class tool
// calls AT THE SOURCE (the same seam the handoff note uses: the worker's tool objects, result SUMMARIES only, never file
// content), reads the run's edits from the WORKING TREE (git diff against the run's start commit, never the spine), renders
// the note and persists its state under `<workdir>/.smoke/carry/state.json` (an arbiter book: the worker's fs.deny covers
// `.smoke`, so it cannot read it; the gate audit, spine and bridges live there too). The switch is `carryNote` in
// config.json (absent = on; only `false` turns it off), read once per run by the engine's caller.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { SMOKE_STORE } from './kinds.js';
import { isHandoffExcluded } from './handoff.js';
import { redactSecrets } from './validate.js';
import { render, HUNK_LINES } from './carrynote.js';
import { readConfig } from './config.js';

const exec = promisify(execFile);
export const CARRY_DIR = 'carry';
/** the retry marker the next prompt of a retried step / fix try carries; kept as a pinned fact about the prompts, no longer read to decide an outcome */
export const RED_MARKER = /Previous attempt failed (this step's checks|the verification):/;

/**
 * The ONE setting: `carryNote` in config.json, read exactly like `learningHints` (src/learnstore.js `learningHintsOn`).
 * Absent = on; only an explicit `false` turns it off. An unreadable config reads as OFF (the safe side).
 * @param {string} [home]
 * @returns {boolean}
 */
export function carryNoteOn(home) {
  const c = readConfig({ home });
  return c.problem === null && c.config.carryNote !== false;
}

const lineCount = (/** @type {string} */ s) => (s === '' ? 0 : s.split('\n').length - (s.endsWith('\n') ? 1 : 0));
const clip = (/** @type {unknown} */ s, n = 200) => redactSecrets(String(s ?? '')).slice(0, n);

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
      if (isHandoffExcluded(p)) continue;
      const { stdout } = await g(['diff', '-U1', '--no-color', '--no-ext-diff', base, '--', `:(literal)${p}`]);
      if (/^(Binary files .* differ|GIT binary patch)$/m.test(stdout)) { out.push({ path: p, lines: 0, hunks: ['(binary file changed)'] }); continue; }
      const body = stdout.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(l));
      out.push({ path: p, lines: body.filter((l) => /^[+-]/.test(l)).length, hunks: body.slice(0, HUNK_LINES * 2) });
    }
    const { stdout: un } = await g(['ls-files', '--others', '--exclude-standard', '-z']);
    for (const p of un.split('\0').filter(Boolean)) {
      if (isHandoffExcluded(p)) continue;
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
 * @param {{workdir: string, emit: (type: string, rec: any) => void, strikeLimit?: number, resume?: boolean}} o
 */
export function createCarryStore({ workdir, emit, strikeLimit, resume = false }) {
  workdir = resolve(workdir);
  const dir = join(workdir, SMOKE_STORE, CARRY_DIR);
  const stateFile = join(dir, 'state.json');
  /** @type {string|null} */
  let base = null;
  let n = 0;
  /** @type {any[]} */ let events = [];
  /** @type {any[]} one per WORK ask (step/fix): {n, kind, step, iteration, bounded, red, changed, startSnap} */
  let asks = [];
  let loaded = false;
  if (resume && existsSync(stateFile)) {
    try { const s = JSON.parse(readFileSync(stateFile, 'utf8')); n = s.n ?? 0; events = s.events ?? []; asks = s.asks ?? []; base = s.base ?? null; loaded = true; } catch { /* a bad file starts empty */ }
  }
  const save = () => {
    try { mkdirSync(dir, { recursive: true }); writeFileSync(stateFile, JSON.stringify({ n, base, events, asks })); } catch { /* a record, never a verdict: a failed save never breaks a run */ }
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
   * @param {{phase: string, iteration: number|string|undefined, prompt: string}} o
   */
  const beginAsk = async ({ phase, iteration, prompt }) => {
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
    const notes = {
      lastTry: lt ? { step: lt.step, kind: lt.kind, n: lt.iteration, of: lt.kind === 'step' ? strikeLimit : undefined, ended: endedOf(lt), changed: lt.changed } : null,
      lastCheck: null, // the failed check's text is already in the prompt today; one copy
      events: events.map((e) => ({ ...e })),
      edits: orderEditsByRecency(edits, settled),
      // every failed check's whole text, oldest first, the NEWEST left out (the prompt already carries it, one copy)
      failures: settled.filter((a) => a.failure).slice(0, -1).map((a) => ({ label: tryLabel(a), text: a.failure })),
      earlier: settled.slice(0, -1).map((a) => `${tryLabel(a)}: ${endedOf(a)} ${a.changed.length ? `Changed ${a.changed.join(', ')}.` : 'Changed nothing.'}`),
      lastAsk: lt ? lt.n : undefined,
    };
    asks.push({ n, kind, step, iteration, startSnap: snapOf(edits) });
    const hasAny = notes.events.length || edits.length || notes.earlier.length || notes.failures.length || notes.lastTry;
    if (!hasAny) { save(); return ''; }
    const r = render(/** @type {any} */ (notes));
    emit('carry-note', { phase, iteration, chars: r.text.length, capped: r.capped, sections: r.sections }); // counts only
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

  return { wrapTools, beginAsk, endAsk, settleAsk, setBase: (/** @type {string|null|undefined} */ b) => { if (!base && b) base = b; }, loaded: () => loaded, _state: () => ({ n, events, asks, base }) };
}
