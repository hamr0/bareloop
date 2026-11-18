// borrowed-from: fwdloop src/send.js@v0.35.1 (M15 items 3, am1, am2: `leaves`, `words`, `friendlyName`, `blockLines`, `isResultList`, `renderSentMd`), docs/product/ITEM33-BUILD.md "Addendum 2026-11-18 (c)", MD1.
// Rewritten for bareloop's step files: one JSON file per job line (FACTS `{results:[{quote, values}]}` + optional `text`, SHEET `{text, claims}`, TEXT `{text, cites}`), turned into the plain text file written beside it.
// What this throws away: `cites` (hamr's answer 4), a result's keys other than `quote` and `values`, any key of the file other than `text`, `results` and `claims`. Pure: no I/O.
import { sheetChecksOf, ROW_MATH_OPS } from './sheetclaims.js';
import { sheetCheckSentence } from './sheetchecks.js';

const SCALAR = ['string', 'number', 'boolean'];
const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** one value as leaf lines `{parts, text}`: parts are the names on the way in; a string as it is, a number or boolean written out; a list of plain values joined by ", "; null as empty */
/** @param {string[]} parts @param {any} v @returns {{parts: string[], text: string}[]} */
function leaves(parts, v) {
  if (v === null || v === undefined) return [{ parts, text: '' }];
  if (SCALAR.includes(typeof v)) return [{ parts, text: `${v}` }];
  if (Array.isArray(v) && v.every((x) => x === null || SCALAR.includes(typeof x))) return [{ parts, text: v.join(', ') }];
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves([...parts, `${i + 1}`], x));
  return Object.entries(v).flatMap(([k, x]) => leaves([...parts, k], x));
}

/** @param {string} name split only at a lowercase-to-capital boundary, `_`, `-` and spaces, so `ID` stays one word */
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[_\-\s]+/).filter(Boolean);

/** the names as plain words; a last name of `value` or `rows` is left out; the first letter capital, the later words lowercase @param {string[]} parts */
function friendlyName(parts) {
  const p = parts.length > 1 && (parts[parts.length - 1] === 'value' || parts[parts.length - 1] === 'rows') ? parts.slice(0, -1) : parts;
  const w = p.flatMap(words).map((x) => x.toLowerCase());
  if (!w.length) return parts.join('.');
  return w[0][0].toUpperCase() + w[0].slice(1) + (w.length > 1 ? ` ${w.slice(1).join(' ')}` : '');
}

/** the lines of one block; two lines with the same words both keep the `a.b` form @param {{parts: string[], text: string}[]} ls */
function blockLines(ls) {
  const f = ls.map((l) => friendlyName(l.parts));
  /** @type {Record<string, number>} */
  const n = {};
  for (const x of f) n[x] = (n[x] || 0) + 1;
  return ls.map((l, i) => `${n[f[i]] > 1 ? l.parts.join('.') : f[i]}: ${l.text}`);
}

/** a list of results: every item an object holding a `values` object @param {any} v */
const isResultList = (v) => Array.isArray(v) && v.length > 0 && v.every((r) => isRec(r) && isRec(r.values));

/** the box keys that only say what the box holds (a sheet claim's `rows`, `value`, ...): left out of a line's name */
const BOX_KEYS = ['value', 'rows', 'keys', 'values', 'totals'];
/** a box that maps a row number to its value */
const ROW_MAPS = ['days', 'bands'];

/** @param {string} s */
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The claim lines of a SHEET step file. A claim id a check carries is named with that check's own plain sentence (`claimWords`, from {@link stepClaimWords}); an id no check carries is left out. A map of rows (`days`, `bands`) writes one line per row.
 * @param {Record<string, any>} claims @param {Record<string, string|null>} claimWords @returns {string[]}
 */
function claimLines(claims, claimWords) {
  /** @type {string[]} */
  const out = [];
  for (const [id, box] of Object.entries(claims)) {
    if (Object.hasOwn(claimWords, id) && claimWords[id] === null) continue; // a number code computes itself: the worker's is never read, so never printed
    const label = Object.hasOwn(claimWords, id) ? cap(/** @type {string} */ (claimWords[id])) : null;
    const ls = leaves([], box);
    if (label === null) continue; // a claim box no check carries is left out (hamr 2026-11-18)
    for (const l of ls) {
      let p = l.parts;
      if (p.length === 2 && ROW_MAPS.includes(p[0])) { out.push(`${label}, row ${p[1]}: ${l.text}`); continue; }
      if (p.length > 0 && BOX_KEYS.includes(p[p.length - 1])) p = p.slice(0, -1);
      out.push(`${p.length ? `${label}, ${p.flatMap(words).map((x) => x.toLowerCase()).join(' ')}` : label}: ${l.text}`);
    }
  }
  return out;
}

/**
 * The plain-text file for one delivered step file. `text` first, exactly; then one `## Result k` block per result (a line per value, in the order the file holds them, then `from the page: "<quote>"`);
 * then, for a sheet line, one line per claim. Never JSON braces, never check marks. Null when there is nothing writable: not an object, or neither `text` nor `results`.
 * @param {unknown} obj the parsed step file @param {Record<string, string|null>} [claimWords] claim id -> the check's plain sentence, or null for a claim that is not written ({@link stepClaimWords}) @returns {string|null}
 */
export function renderStepMd(obj, claimWords = {}) {
  if (!isRec(obj)) return null;
  const o = /** @type {Record<string, any>} */ (obj);
  const hasText = typeof o.text === 'string';
  const hasResults = isResultList(o.results);
  if (!hasText && !hasResults) return null;
  /** @type {string[]} */
  const parts = [];
  if (hasText) parts.push(o.text);
  if (hasResults) {
    o.results.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const lines = blockLines(Object.entries(r.values).flatMap(([n, x]) => leaves([n], x)));
      if (typeof r.quote === 'string') lines.push(`from the page: "${r.quote}"`);
      parts.push([`## Result ${i + 1}`, ...lines].join('\n'));
    });
  }
  if (isRec(o.claims)) {
    const lines = claimLines(o.claims, claimWords);
    if (lines.length) parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * claim id -> the plain sentence of the FIRST check of job line `n`'s rubric-step that carries it (`sheetCheckSentence`, the words the Result tab and Audit use). One claim box is often shared
 * by a rows, a countIf and a sumIf check; the first names it. A claim that only sumIf / countIf checks carry is `null` (not written): code computes that number from the rows named and never reads the
 * worker's, so the file must not print it. `{}` when the line has no sheet checks.
 * @param {any} closeDecl the signed close declaration @param {number} n the job line @returns {Record<string, string|null>}
 */
export function stepClaimWords(closeDecl, n) {
  /** @type {Record<string, string|null>} */
  const out = {};
  /** @type {Record<string, boolean>} */
  const onlyMath = {};
  for (const st of Array.isArray(closeDecl?.stages) ? closeDecl.stages : []) {
    if (!isRec(st) || st.kind !== 'rubric-step' || !isRec(st.params) || st.params.step !== n) continue;
    for (const c of sheetChecksOf(st.params)) {
      if (typeof c.claim !== 'string') continue;
      onlyMath[c.claim] = (onlyMath[c.claim] ?? true) && c.rule === 'cells' && ROW_MATH_OPS.includes(c.op);
      if (!Object.hasOwn(out, c.claim)) out[c.claim] = sheetCheckSentence(c);
    }
  }
  for (const id of Object.keys(out)) if (onlyMath[id]) out[id] = null;
  return out;
}

/**
 * `copyOut`'s `alsoText` hook for a signed close: `(rel under output/, delivered bytes) => text|null`. Only a step file whose job line has a rubric-step stage is written (a rubric job's file); a file that is not a
 * JSON object, or has nothing writable, is null. Reads the bytes it is given; touches no file.
 * @param {any} closeDecl @returns {(rel: string, buf: Buffer) => string|null}
 */
export function deliveredTexter(closeDecl) {
  const stages = Array.isArray(closeDecl?.stages) ? closeDecl.stages : [];
  return (rel, buf) => {
    const m = /^steps\/(\d+)\.json$/.exec(rel);
    if (!m) return null;
    const n = Number(m[1]);
    if (!stages.some((/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && st.params.step === n)) return null;
    /** @type {unknown} */
    let obj;
    try { obj = JSON.parse(buf.toString('utf8')); } catch { return null; }
    return renderStepMd(obj, stepClaimWords(closeDecl, n));
  };
}
