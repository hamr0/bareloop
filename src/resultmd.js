// borrowed-from: fwdloop src/send.js@v0.35.1 (M15 items 3, am1, am2: `leaves`, `words`, `friendlyName`, `blockLines`, `isResultList`), docs/product/ITEM33-BUILD.md "Addendum 2026-11-18 (c)", MD1 and "Ruling 2026-11-18 (later): one markdown report per run".
// Rewritten for bareloop's step files: one JSON file per job line (FACTS `{results:[{quote, values}]}` + optional `text`, SHEET `{text, claims}`, TEXT `{text, cites}`), turned into ONE markdown report for the whole run.
// What this throws away: `cites` (hamr's answer 4), a result's keys other than `quote` and `values`, any key of the file other than `text`, `results` and `claims`. Pure: no I/O.
import { sheetChecksOf, ROW_MATH_OPS } from './sheetclaims.js';
import { sheetCheckSentence } from './sheetchecks.js';
import { proseNotCheckedItems, refusedOf } from './rubricstep.js';
import { lineRules } from './jobline.js';
import { shapePartOfLine } from './shaperows.js';
import { shapeResultModel, shapeMarkdown, citedItemsMarkdown } from './shaperesult.js';

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

/** the lines of one block, each a bullet; two lines with the same words both keep the `a.b` form @param {{parts: string[], text: string}[]} ls */
function blockLines(ls) {
  const f = ls.map((l) => friendlyName(l.parts));
  /** @type {Record<string, number>} */
  const n = {};
  for (const x of f) n[x] = (n[x] || 0) + 1;
  return ls.map((l, i) => `- ${n[f[i]] > 1 ? l.parts.join('.') : f[i]}: ${l.text}`);
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
 * The claim bullets of a SHEET step file. A claim id a check carries is named with the plain sentence of the check that grades that claim's KIND (`claimWords`, from {@link stepClaimWords}); an id no check
 * carries is left out. A map of rows (`days`, `bands`) writes one bullet per row.
 * @param {Record<string, any>} claims @param {Record<string, string|null>} claimWords @returns {string[]}
 */
function claimLines(claims, claimWords) {
  /** @type {string[]} */
  const out = [];
  for (const [id, box] of Object.entries(claims)) {
    if (!Object.hasOwn(claimWords, id) || claimWords[id] === null) continue; // a number code computes itself (the worker's is never read), or a box no check carries: left out
    const label = cap(/** @type {string} */ (claimWords[id]));
    for (const l of leaves([], box)) {
      let p = l.parts;
      if (p.length === 2 && ROW_MAPS.includes(p[0])) { out.push(`- ${label}, row ${p[1]}: ${l.text}`); continue; }
      if (p.length > 0 && BOX_KEYS.includes(p[p.length - 1])) p = p.slice(0, -1);
      out.push(`- ${p.length ? `${label}, ${p.flatMap(words).map((x) => x.toLowerCase()).join(' ')}` : label}: ${l.text}`);
    }
  }
  return out;
}

const COMPUTED = ' (computed by code from the rows named)';

/** code's own report line (`Count of rows 3, 5: 2 (computed by code from the rows named)`) as a bullet `- Count: 2` / `- Total: 1,234.50` @param {string} line */
function reportBullet(line) {
  const m = /^(Count|Total) of [^:]*: (.*)$/.exec(line);
  const rest = (m ? m[2] : line).endsWith(COMPUTED) ? (m ? m[2] : line).slice(0, -COMPUTED.length) : (m ? m[2] : line);
  return m ? `- ${m[1]}: ${rest}` : `- ${rest}`;
}

/**
 * claim id -> the plain sentence of the FIRST check of job line `n`'s rubric-step that carries it and is not a sumIf / countIf (`sheetCheckSentence`, the words the Result tab and Audit use). One claim box is often
 * shared by a countIf, a sumIf and a rows check; the rows check names the box (the box holds the rows). A claim that only sumIf / countIf checks carry is `null` (not written): code computes that number from the rows
 * named and never reads the worker's. `{}` when the line has no sheet checks.
 * @param {any} closeDecl the signed close declaration @param {number} n the job line @returns {Record<string, string|null>}
 */
export function stepClaimWords(closeDecl, n) {
  /** @type {Record<string, string|null>} */
  const out = {};
  /** @type {Set<string>} */
  const seen = new Set();
  for (const st of Array.isArray(closeDecl?.stages) ? closeDecl.stages : []) {
    if (!isRec(st) || st.kind !== 'rubric-step' || !isRec(st.params) || st.params.step !== n) continue;
    for (const c of sheetChecksOf(st.params)) {
      if (typeof c.claim !== 'string') continue;
      seen.add(c.claim);
      if (c.rule === 'cells' && ROW_MATH_OPS.includes(c.op)) continue;
      if (typeof out[c.claim] !== 'string') out[c.claim] = sheetCheckSentence(c);
    }
  }
  for (const id of seen) if (!Object.hasOwn(out, id)) out[id] = null;
  return out;
}

/** the date as plain words, `18 Nov 2026`, in the machine's local day (the day the dated file names use) @param {Date} d */
export function plainDate(d) {
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * One job line's section. `checked` = the bullets code stands behind (fact results, claim rows, code's count and total), `answer` = the worker's own text (report lines stripped) or null. Null when the file holds neither text nor results.
 * @param {unknown} obj the original step file @param {Record<string, string|null>} claimWords @param {string[]} reportLines code's report lines of this file
 * @returns {{checked: string[], answer: string|null}|null}
 */
function stepSection(obj, claimWords, reportLines) {
  if (!isRec(obj)) return null;
  const o = /** @type {Record<string, any>} */ (obj);
  const hasText = typeof o.text === 'string';
  const hasResults = isResultList(o.results);
  if (!hasText && !hasResults) return null;
  /** @type {string[]} */
  const checked = [];
  if (hasResults) {
    o.results.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const lines = blockLines(Object.entries(r.values).flatMap(([n, x]) => leaves([n], x)));
      checked.push([`#### Result ${i + 1}`, ...lines, ...(typeof r.quote === 'string' ? ['', `from the page: "${r.quote}"`] : [])].join('\n'));
    });
  }
  const bullets = [...(isRec(o.claims) ? claimLines(o.claims, claimWords) : []), ...[...reportLines].sort((a, b) => Number(b.startsWith('Count of')) - Number(a.startsWith('Count of'))).map(reportBullet)]; // Count then Total, whatever the signed check order (hamr 2026-11-18)
  if (bullets.length) checked.push(bullets.join('\n'));
  return { checked, answer: hasText && o.text.trim() !== '' ? o.text : null };
}

/** the countable checks that measure the line's own text (its words, lines, sections, list items, phrases, or the numbers in it). `nonEmpty` (the default note) and `cited`/claim counts check no sentence of it @type {Set<string>} */
const TEXT_MEASURES = new Set(['maxWords', 'minWords', 'maxLines', 'sections', 'sectionWords', 'listItems', 'maxListItems', 'minListItems', 'sectionOrder', 'mustCarry', 'blockLines', 'numbersFromFacts']);

/**
 * is the prose of job line `n` Not checked? Copied in rule from fwdloop v0.36.0 `proseCheckedOf` (src/whole-job.js:54): `### The answer` only when code checked the line's OWN text. Not checked when the signed list
 * says so (a Not checked `~` rule row on the line; the `$` prose meaning row alone does not, as fwd), when an older close derives it from its stages, or when no signed part of the line measures its text (only the default note, a quote or a sheet check).
 * Read from the signed close, never a second mapping.
 * @param {any} closeDecl @param {number} n
 */
function proseNotChecked(closeDecl, n) {
  if (proseNotCheckedItems(closeDecl).some((i) => i.line === n) || refusedOf(closeDecl).some((r) => r.line === n && r.kind === 'rule')) return true;
  const stages = isRec(closeDecl) && Array.isArray(closeDecl.stages) ? closeDecl.stages : [];
  const parts = stages.filter((/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && st.params.step === n).flatMap((/** @type {any} */ st) => (Array.isArray(st.params.parts) ? st.params.parts : []));
  return !parts.some((/** @type {any} */ p) => isRec(p) && p.class === 'countable' && TEXT_MEASURES.has(p.check));
}

/**
 * The ONE markdown report of a green run. H1 `<job> — run-N`, `Passed · <date>`, then per delivered step file: `## <n>. <line>`, a `Rule:` line per `~` rule, `### Checked by code` (bullets) and the worker's text under
 * `### The AI's answer (not checked — you judge it at Accept)`, or `### The answer` when the line's prose is checked. Null when no step file is writable. Pure.
 * @param {{job: string, runNo: number|null, now: Date, closeDecl: any, jobLines: any[], steps: {n: number, orig: Buffer, delivered: Buffer}[]}} o
 * @returns {string|null}
 */
export function renderRunMd({ job, runNo, now, closeDecl, jobLines, steps }) {
  /** @type {string[]} */
  const sections = [];
  for (const s of [...steps].sort((a, b) => a.n - b.n)) {
    /** @type {unknown} */
    let obj;
    /** @type {unknown} */
    let sent;
    try { obj = JSON.parse(s.orig.toString('utf8')); sent = JSON.parse(s.delivered.toString('utf8')); } catch { continue; }
    // code's report lines sit at the END of the delivered copy's `text`; the original text is the worker's own
    const textOf = (/** @type {unknown} */ v) => (isRec(v) && typeof (/** @type {Record<string, any>} */ (v)).text === 'string' ? /** @type {string} */ (/** @type {Record<string, any>} */ (v).text) : '');
    const origText = textOf(obj);
    const sentText = textOf(sent);
    const report = sentText.startsWith(origText) ? sentText.slice(origText.length).split('\n').map((l) => l.trim()).filter(Boolean) : [];
    const jl = jobLines.find((/** @type {any} */ l) => isRec(l) && l.n === s.n);
    // a shape line (picked by the line's signed class, never by the key `results`, which a facts line also uses): the signed mock's section (src/shaperesult.js): the shape-checks line, the table, the Not checked line, the Failed list.
    // A report is written for a green run only, so no item is red here; the model takes the reds a caller has.
    const shape = shapePartOfLine(closeDecl, s.n);
    if (shape !== null) {
      const results = isRec(obj) ? /** @type {Record<string, any>} */ (obj).results : null;
      if (!Array.isArray(results) || results.length === 0) continue;
      const head = [`## ${s.n}. ${jl && typeof jl.text === 'string' && jl.text ? jl.text : `Line ${s.n}`}`, ...(jl ? lineRules(jl) : []).map((r) => `Rule: ${r}`)].join('\n');
      // a list whose items are cited (the signed part's `cite`, the source table's): a block per item with the full why and quote, never a clipped table cell
      sections.push([head, typeof shape.cite === 'string' ? citedItemsMarkdown(results) : shapeMarkdown(shapeResultModel({ part: shape, results, rules: jl ? lineRules(jl) : [] }))].join('\n\n'));
      continue;
    }
    const sec = stepSection(obj, stepClaimWords(closeDecl, s.n), report);
    if (sec === null || (sec.checked.length === 0 && sec.answer === null)) continue;
    const lines = [`## ${s.n}. ${jl && typeof jl.text === 'string' && jl.text ? jl.text : `Line ${s.n}`}`];
    for (const r of jl ? lineRules(jl) : []) lines.push(`Rule: ${r}`);
    const parts = [lines.join('\n')];
    if (sec.checked.length) parts.push(['### Checked by code', sec.checked.join('\n\n')].join('\n'));
    if (sec.answer !== null) parts.push([proseNotChecked(closeDecl, s.n) ? '### The AI\'s answer (not checked — you judge it at Accept)' : '### The answer', sec.answer].join('\n'));
    sections.push(parts.join('\n\n'));
  }
  if (sections.length === 0) return null;
  return `${[`# ${job}${runNo === null ? '' : ` — run-${runNo}`}\nPassed · ${plainDate(now)}`, ...sections].join('\n\n')}\n`;
}

/**
 * `copyOut`'s `report` hook for a signed close: `(delivered step files) => markdown|null`, called once with every delivered `steps/<n>.json` (the file as the worker wrote it and the delivered copy with code's report lines).
 * Only a step file whose job line has a rubric-step stage is written. Reads the bytes it is given; touches no file.
 * @param {{closeDecl: any, jobLines: any[]|null|undefined, job: string, runNo: number|null, now?: Date}} o
 * @returns {(files: {rel: string, orig: Buffer, delivered: Buffer}[]) => string|null}
 */
export function deliveredReporter({ closeDecl, jobLines, job, runNo, now }) {
  const stages = Array.isArray(closeDecl?.stages) ? closeDecl.stages : [];
  return (files) => {
    const steps = files.flatMap((f) => {
      const m = /^steps\/(\d+)\.json$/.exec(f.rel);
      if (!m) return [];
      const n = Number(m[1]);
      return stages.some((/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && st.params.step === n) ? [{ n, orig: f.orig, delivered: f.delivered }] : [];
    });
    return renderRunMd({ job, runNo, now: now ?? new Date(), closeDecl, jobLines: Array.isArray(jobLines) ? jobLines : [], steps });
  };
}
