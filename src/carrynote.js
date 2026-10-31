// The carry note: a code-written, facts-only note handed to the next step or fix worker of the SAME run (M1, F258).
// It says where earlier workers looked, what they searched, what they changed (with the diff hunks) and how earlier tries
// ended. Never file content, never a worker's own words. PURE render: no I/O; the store that feeds it is src/carrystore.js.
// Reuses `jaccard` (src/learn.js, the learnings fold rule), `redactSecrets` (src/validate.js, the one secret-shape
// inventory) and `isHandoffExcluded` (src/handoff.js: arbiter books, .git, .bareloop, outside the root).
import { jaccard, JACCARD_MIN } from './learn.js';
import { redactSecrets } from './validate.js';
import { isHandoffExcluded } from './handoff.js';

export const CAP = 12000;
export const HUNK_LINES = 40;
export const HUNK_SHOW = 12;
export const GAP_LINES = 8;
export const GAP_CHARS = 600;
export const MATCH_SHOW = 3;
export const PREFIX_MIN = 6;
export const CONTAINS_MIN = 4;
export const HEADING = '== What earlier workers in this run did (facts from the record, written by code) ==';
export const NO_FIX_MIN_READS = 3;
export const NO_FIX = ' · looked here, no fix made';

/**
 * One record per tool call (no content, no worker words).
 * @typedef {object} Ev
 * @property {number} ask
 * @property {'read'|'get'|'grep'|'recall'} tool
 * @property {string} [path]
 * @property {number|null} [lines]
 * @property {boolean} [dir]
 * @property {boolean} [linesStale]
 * @property {[number,number]|null} [range]
 * @property {string} [pattern]
 * @property {string} [scope]
 * @property {number} [matches]
 * @property {string[]} [firstMatches]
 * @property {string} [query]
 * @property {string[]} [hitPaths]
 * @property {string[]} [hitRanges]
 * @property {boolean} [noFix]   the try that made this call ended with no change and a red check
 */

/** token set, same tokenisation as src/learn.js flaggedTokens: lowercase [a-z0-9_]{2,} */
export function tokens(s) { const t = new Set(); for (const m of String(s).toLowerCase().matchAll(/[a-z0-9_]{2,}/g)) t.add(m[0]); return [...t].sort(); }

/**
 * Files that are neither source nor test: manifests, lockfiles, docs, config. Dropped from "where looked" unless edited.
 * @param {string} p repo-relative path
 */
export function isNonSource(p) {
  const base = p.split('/').pop() ?? p;
  if (/^(package(-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.(toml|lock)|go\.(mod|sum)|Pipfile(\.lock)?|poetry\.lock|requirements.*\.txt|LICENSE.*|NOTICE.*|CHANGELOG.*|Makefile|Dockerfile)$/i.test(base)) return true;
  if (/\.(md|markdown|mdx|txt|rst|lock|json|jsonc|ya?ml|toml|ini|cfg|conf|env|properties)$/i.test(base)) return true;
  if (/^\.[^/]*(rc|ignore|attributes|editorconfig|nvmrc)$/i.test(base)) return true;
  if (/^(tsconfig|jsconfig|eslint|prettier|babel|jest|vitest|rollup|webpack|vite)[^/]*\.(js|cjs|mjs|ts|json)$/i.test(base) || /\.config\.(js|cjs|mjs|ts)$/i.test(base)) return true;
  return false;
}

/**
 * Fold rule for two search keys (added beside Jaccard): same string prefix of >= PREFIX_MIN chars, or one
 * contains the other (shorter side >= CONTAINS_MIN chars so "a" cannot swallow everything). Case-insensitive.
 * @param {string|undefined} a @param {string|undefined} b
 */
export function similarName(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase(); const y = b.toLowerCase();
  if (x === y) return true;
  let n = 0; while (n < x.length && n < y.length && x[n] === y[n]) n++;
  if (n >= PREFIX_MIN) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= CONTAINS_MIN && l.includes(s);
}

/**
 * Group items (newest first). An item joins the first group whose representative (the newest member) matches:
 * Jaccard >= JACCARD_MIN on key tokens (the learnings rule), or `near(rep, item)`.
 * @template T @param {T[]} items @param {(x:T)=>string} keyOf @param {(a:T,b:T)=>boolean} [near]
 * @returns {{rep:T, members:T[]}[]}
 */
export function fold(items, keyOf, near) {
  /** @type {{rep:T, members:T[], tk:string[]}[]} */
  const groups = [];
  for (const it of items) {
    const tk = tokens(keyOf(it));
    const g = groups.find((x) => jaccard(x.tk, tk) >= JACCARD_MIN || (!x.tk.length && !tk.length && keyOf(x.rep) === keyOf(it)) || (near ? near(x.rep, it) : false));
    if (g) g.members.push(it); else groups.push({ rep: it, members: [it], tk });
  }
  return groups.map(({ rep, members }) => ({ rep, members }));
}

const q = (v) => (v === undefined || v === null ? '?' : String(v));
const ok = (p) => p != null && !isHandoffExcluded(p);

/** merge overlapping / adjacent [a,b] line ranges, ascending; returns 'a-b' strings */
export function mergeRanges(rs) {
  const s = rs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) { const l = out[out.length - 1]; if (l && a <= l[1] + 1) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out.map(([a, b]) => `${a}-${b}`);
}

/**
 * @typedef {object} Entry
 * @property {string} text
 * @property {string[]} keys
 * @property {0|1|2} tier     0 = last try's own fact, 1 = edited file, 2 = the rest
 * @property {number} count   times read / searched
 * @property {number} recency index of the newest call
 */

/** @param {Ev[]} events @param {Set<string>} editedPaths @param {number|undefined} lastAsk */
function filesSection(events, editedPaths, lastAsk) {
  /** @type {Map<string, {es: Ev[], last: number}>} */
  const byPath = new Map();
  let dropped = 0;
  /** @type {Set<string>} */
  const summarized = new Set();
  events.forEach((e, i) => {
    if (!(e.tool === 'read' || e.tool === 'get') || !ok(e.path)) return;
    const p = /** @type {string} */ (e.path);
    if (e.dir || (isNonSource(p) && !editedPaths.has(p))) { dropped++; summarized.add(`F\0${p}`); return; }
    const g = byPath.get(p) ?? { es: [], last: -1 };
    g.es.push(e); g.last = i; byPath.set(p, g);
  });
  /** @type {Entry[]} */
  const entries = [];
  for (const [p, { es, last }] of byPath) {
    const newest = es[es.length - 1];
    const ranges = mergeRanges(es.filter((e) => e.tool === 'get' && e.range).map((e) => /** @type {[number,number]} */ (e.range)));
    const lc = newest.lines == null ? '' : ` (${newest.lines} lines${newest.linesStale ? ' at run start' : ''})`;
    const edited = editedPaths.has(p);
    const noFix = !edited && es.length >= NO_FIX_MIN_READS && es.some((e) => e.noFix); // hamr: only a file read 3+ times
    const text = `- ${p}${lc} · read ${es.length}x${ranges.length ? ` · lines ${ranges.join(', ')}` : ''}${noFix ? NO_FIX : ''}`;
    const inLast = lastAsk !== undefined && es.some((e) => e.ask === lastAsk);
    entries.push({ text, keys: [`F\0${p}`], tier: inLast ? 0 : edited ? 1 : 2, count: es.length, recency: last });
  }
  entries.sort(rank);
  return { entries, dropped, summarized };
}

/** @param {Entry} a @param {Entry} b */
function rank(a, b) { return b.count - a.count || b.recency - a.recency; }

/** @param {Ev[]} events @param {number|undefined} lastAsk */
function searchSection(events, lastAsk) {
  /** @type {Entry[]} */
  const out = [];
  const idx = new Map(events.map((e, i) => [e, i]));
  const newestFirst = (/** @type {string} */ t) => events.filter((e) => e.tool === t).reverse();
  const greps = newestFirst('grep').filter((e) => ok(e.scope));
  for (const g of fold(greps, (e) => `${e.scope} ${e.pattern ?? ''}`, (a, b) => a.scope === b.scope && similarName(a.pattern, b.pattern))) {
    const r = g.rep; const k = g.members.length;
    const fm = r.firstMatches === undefined ? '?' : (r.firstMatches.slice(0, MATCH_SHOW).join(', ') + (r.firstMatches.length > MATCH_SHOW ? ` (+${r.firstMatches.length - MATCH_SHOW})` : '')) || 'none';
    out.push({ text: `- grep "${q(r.pattern)}" in ${r.scope} → ${q(r.matches)} matches: ${fm}${k > 1 ? ` · ${k - 1} similar` : ''}`, keys: [`G\0${r.scope}`], tier: lastAsk !== undefined && g.members.some((m) => m.ask === lastAsk) ? 0 : 2, count: k, recency: /** @type {number} */ (idx.get(r)) });
  }
  const recs = newestFirst('recall').filter((e) => e.query != null);
  for (const g of fold(recs, (e) => /** @type {string} */ (e.query), (a, b) => similarName(a.query, b.query))) {
    const r = g.rep; const k = g.members.length;
    const hp = (r.hitPaths ?? []).filter(ok);
    const hr = r.hitRanges === undefined ? '' : ` (${r.hitRanges.slice(0, MATCH_SHOW).join(', ')})`;
    out.push({ text: `- recall "${r.query}" → ${hp.length ? hp.slice(0, 4).join(', ') + (hp.length > 4 ? ` (+${hp.length - 4})` : '') : 'no hits'}${r.hitRanges === undefined && hp.length ? ' · hit ranges ?' : hr}${k > 1 ? ` · ${k - 1} similar` : ''}`, keys: [`Q\0${r.query}`], tier: lastAsk !== undefined && g.members.some((m) => m.ask === lastAsk) ? 0 : 2, count: k, recency: /** @type {number} */ (idx.get(r)) });
  }
  return out.sort(rank);
}

function editLines(e, hunkCap) {
  const head = `- ${e.path}: ${e.lines} lines changed`;
  const hs = e.hunks ?? [];
  const h = hs.slice(0, hunkCap).map((l) => '    ' + l);
  const more = hs.length > hunkCap ? [`    (+${hs.length - hunkCap} more diff lines)`] : [];
  return [head, ...(hunkCap > 0 ? h : []), ...(hunkCap > 0 ? more : [])].join('\n');
}

/**
 * Render the carry note. PURE.
 * @param {{lastTry?: {step:string|null, kind:'step'|'fix', n:number|string|undefined, of?:number, ended:string, changed:string[]}|null,
 *   lastCheck?: string|null, events: Ev[], edits?: {path:string, lines:number, hunks:string[]}[],
 *   earlier?: string[], lastAsk?: number}} notes
 * @param {number} [cap]
 */
export function render(notes, cap = CAP) {
  const events = (notes.events ?? []).filter((e) => e);
  const edits = (notes.edits ?? []).filter((e) => ok(e.path)).slice().reverse(); // newest first
  const editedPaths = new Set(edits.map((e) => e.path));
  const { entries: files, dropped, summarized } = filesSection(events, editedPaths, notes.lastAsk);
  const searches = searchSection(events, notes.lastAsk);
  const earlierG = fold((notes.earlier ?? []).slice().reverse(), (s) => s);
  /** @type {Entry[]} */
  const earlier = earlierG.map((g, i) => ({ text: '- ' + g.rep + (g.members.length > 1 ? ` · ${g.members.length - 1} similar` : ''), keys: [], tier: 2, count: 0, recency: -i }));
  // failed checks' whole texts, oldest first in; folded newest first with the SAME rule, the newest member represents its group
  const failG = fold((notes.failures ?? []).slice().reverse(), (f) => f.text);
  /** @type {Entry[]} */
  const failures = failG.map((g, i) => ({ text: `- ${g.rep.label}${g.members.length > 1 ? ` · ${g.members.length - 1} similar` : ''}:\n` + String(g.rep.text).split('\n').map((l) => '    ' + l).join('\n'), keys: [], tier: 2, count: 0, recency: -i }));
  const rawEntries = events.filter((e) => ['read', 'get', 'grep', 'recall'].includes(e.tool)).length + edits.length + (notes.earlier ?? []).length + (notes.failures ?? []).length;
  const foldedEntries = files.length + searches.length + edits.length + earlier.length + failures.length + (dropped ? 1 : 0);

  const lt = notes.lastTry;
  const head = [HEADING];
  if (lt) head.push(`Last try: ${lt.kind === 'fix' ? 'fix loop' : `step "${lt.step}"`}, try ${lt.n}${lt.of ? ` of ${lt.of}` : ''}. ${lt.ended} ${lt.changed.length ? `Changed: ${lt.changed.join(', ')}.` : 'Changed nothing.'}`);
  const gapFull = notes.lastCheck ? notes.lastCheck.split('\n').slice(0, GAP_LINES).join('\n') : null;

  // Cap order (hamr, 2026-10-30): diffs matter most, so they are cut LAST.
  // 1 file lines (edited files protected, dropped last in the section), 2 search lines, 3 earlier tries oldest first,
  // 3b earlier failures, the OLDEST group first (whole group), then
  // 4 diff hunks, one edit at a time oldest first: to HUNK_SHOW lines each, then to 0 each (newest edit's hunk is the last thing cut).
  // `notes.edits` must be ordered oldest to newest (the store does this: orderEditsByRecency in carrystore.js).
  // The last-try line and the heading are never dropped.
  const dropOrder = (/** @type {Entry[]} */ arr, /** @type {(e: Entry) => boolean} */ protect = () => false) =>
    arr.slice().sort((a, b) => Number(protect(a)) - Number(protect(b)) || b.tier - a.tier || a.count - b.count || a.recency - b.recency);
  const isEditedFile = (/** @type {Entry} */ e) => e.keys.some((k) => k.startsWith('F\0') && editedPaths.has(k.slice(2)));
  /** @type {Set<Entry>} */
  const gone = new Set();
  const goneEdits = new Set();
  const hunkCaps = edits.map(() => HUNK_LINES); let gapCap = GAP_CHARS;
  const gapText = () => (gapFull ? 'Last check said: ' + (gapFull.length > gapCap ? gapFull.slice(0, gapCap) + '…' : gapFull) : null);
  const build = () => {
    const L = [...head];
    const g = gapText(); if (g) L.push(g);
    const kept = (/** @type {Entry[]} */ arr) => arr.filter((x) => !gone.has(x));
    const sec = (/** @type {string} */ title, /** @type {Entry[]} */ arr, /** @type {string[]} */ extra = []) => {
      const k = kept(arr);
      if (!k.length && !extra.length) return;
      L.push(title); k.forEach((x) => L.push(x.text)); extra.forEach((x) => L.push(x));
      if (k.length < arr.length) L.push(`- (+${arr.length - k.length} lower-ranked not shown)`);
    };
    sec(`Where earlier workers looked (${files.length} file${files.length === 1 ? '' : 's'}):`, files, dropped ? [`- +${dropped} listings/config reads not shown`] : []);
    sec('Searches and what they matched:', searches);
    const ke = edits.filter((_, i) => !goneEdits.has(i));
    if (edits.length) { L.push('Edits made in this run:'); edits.forEach((e, i) => { if (!goneEdits.has(i)) L.push(editLines(e, hunkCaps[i])); }); if (ke.length < edits.length) L.push(`- (+${edits.length - ke.length} older not shown)`); } else L.push('Edits made in this run: none');
    sec('Earlier tries (folded):', earlier);
    sec('Earlier failures (folded):', failures);
    return L.join('\n');
  };
  let text = build();
  const rawChars = text.length;
  let capped = false;
  /** @type {(() => void)[]} */
  const steps = [
    ...dropOrder(files, isEditedFile).map((e) => () => { gone.add(e); }),
    ...dropOrder(searches).map((e) => () => { gone.add(e); }),
    ...dropOrder(earlier).map((e) => () => { gone.add(e); }),
    ...dropOrder(failures).map((e) => () => { gone.add(e); }),
    // 4: one edit at a time, oldest first (edits[] is newest first, so walk from the end): to HUNK_SHOW, then every edit to 0
    ...edits.map((_, i) => i).reverse().map((i) => () => { hunkCaps[i] = Math.min(hunkCaps[i], HUNK_SHOW); }),
    ...edits.map((_, i) => i).reverse().map((i) => () => { hunkCaps[i] = 0; }), // oldest edit first, newest last
    () => { gapCap = 300; },
    ...edits.map((_, i) => i).reverse().map((i) => () => { goneEdits.add(i); }),
  ];
  let si = 0;
  while (text.length > cap) {
    capped = true;
    if (si >= steps.length) break;
    steps[si++]();
    text = build();
  }
  if (text.length > cap) text = text.slice(0, cap - 1) + '…';
  text = redactSecrets(text);

  const named = new Set();
  files.filter((x) => !gone.has(x)).forEach((x) => x.keys.forEach((k) => named.add(k)));
  searches.filter((x) => !gone.has(x)).forEach((x) => x.keys.forEach((k) => named.add(k)));
  edits.filter((_, i) => !goneEdits.has(i)).forEach((e) => named.add(`F\0${e.path}`));
  const sections = {
    reads: files.filter((x) => !gone.has(x)).length,
    searches: searches.filter((x) => !gone.has(x)).length,
    edits: edits.length - goneEdits.size,
    earlier: earlier.filter((x) => !gone.has(x)).length,
    failures: failures.filter((x) => !gone.has(x)).length,
  };
  return { text, capped, rawChars, rawEntries, foldedEntries, named, summarized, sections };
}
