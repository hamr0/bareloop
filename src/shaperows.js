// SHAPE JOBS (itemShape), docs/product/ITEM33-BUILD.md "Addendum 2026-11-18: shape jobs", clause 8 "Views" (and the rows' words of clause 4): the WORDS of the shape rows of the one list and the pure readers of a signed close's shape part.
// Modelled on src/sheetrows.js. The ROWS themselves live in the one owner, src/checkblock.js (`setShape`, `rowChoice`); this file only names them and reads them back, so the confirm card, the signed card, the Job tab, the
// Result tab and the report say the same thing.
// THE PART (what the views read; clause 5 builds the real, bareguard-validated one from the same fields, TODO(clause 5): `rubricStepShapeReds`, `PART_CLASSES`, `buildStepSpec`):
//   { class: 'shape', text, fields: [{ name, spec: {kind, required?, ...bounds}, rule?: <the ~ rule number it comes from>, row?: 'agent' }], minItems?, maxItems?, rules?: [<rule numbers>] }
// Rows of one shape line: a `[you]` row per `~` rule that has a field (the rule's own row, kind `rule`), an `[agent]` row per extra field (kind `shape`, key `L<n>.shape.<name>`), and the line's `[default]` row (key
// `L<n>.$shape`): the answer is a list of items, with the item count when the person's words gave one.
import { lineRules } from './rubricstep.js';

const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** the key of an `[agent]` shape row and of a line's `[default]` shape row @param {number} line @param {string} name */
export const shapeRowKey = (line, name) => `L${line}.shape.${name}`;
/** @param {number} line */
export const shapeDefaultKey = (line) => `L${line}.$shape`;

/** the words of the `[default]` row of a shape line: what code itself guarantees: the answer is a list of items, one object each; with a count the person's words gave @param {{min?: number, max?: number}|null} [count] */
export function shapeDefaultWords(count = null) {
  if (count && Number.isInteger(count.min) && count.min === count.max) return `the answer is a list of exactly ${count.min} item${count.min === 1 ? '' : 's'}, each with the fields below`;
  return 'the answer is a list of items, each with the fields below';
}

/** why the truth of a shape line's items is not checked: the person judges it at Accept (the Not checked row of every shape line) */
export const SHAPE_TRUTH_WORDS = 'whether what each item says is true — you judge it at Accept';

/** @param {unknown} v @returns {string} */
const q = (v) => (typeof v === 'string' ? `"${v}"` : String(v));

/** one bound range as words: `at least 3`, `at most 10`, `above 3`, `below 10` @param {Record<string, any>} s @param {string} unit @returns {string[]} */
function range(s, unit = '') {
  const u = unit ? ` ${unit}` : '';
  return [
    ...(s.min !== undefined ? [`at least ${q(s.min)}${u}`] : []), ...(s.gt !== undefined ? [`above ${q(s.gt)}${u}`] : []),
    ...(s.max !== undefined ? [`at most ${q(s.max)}${u}`] : []), ...(s.lt !== undefined ? [`below ${q(s.lt)}${u}`] : []),
  ];
}

/**
 * A field spec as one plain sentence, written by code from the signed fields. Pure.
 * @param {Record<string, any>} spec `{kind, required?, ...bounds}` @returns {string}
 */
export function shapeFieldSentence(spec) {
  const s = isRec(spec) ? spec : {};
  /** @type {string[]} */
  const parts = [];
  switch (s.kind) {
    case 'text': {
      const c = [...(s.minChars !== undefined ? [`at least ${s.minChars} characters`] : []), ...(s.maxChars !== undefined ? [`at most ${s.maxChars} characters`] : []), ...(s.minWords !== undefined ? [`at least ${s.minWords} words`] : []), ...(s.maxWords !== undefined ? [`at most ${s.maxWords} words`] : [])];
      parts.push(['text', ...c].join(', '));
      break;
    }
    case 'number': parts.push(['a number', ...range(s)].join(', ')); break;
    case 'money': parts.push(['an amount of money', ...range(s)].join(', ')); break;
    case 'date': parts.push(['a date', ...range(s)].join(', ')); break;
    case 'time': parts.push(['a time', ...range(s)].join(', ')); break;
    case 'url': parts.push('a web address'); break;
    case 'oneOf': parts.push(`one of ${(Array.isArray(s.values) ? s.values : []).map(q).join(', ')}`); break;
    case 'boolean': parts.push(s.equals === true ? 'yes' : s.equals === false ? 'no' : 'yes or no'); break;
    case 'list': {
      const c = [...(s.minEntries !== undefined ? [`at least ${s.minEntries} entries`] : []), ...(s.maxEntries !== undefined ? [`at most ${s.maxEntries} entries`] : []), ...(s.unique === true ? ['no repeats'] : [])];
      parts.push([`a list of ${isRec(s.of) ? shapeFieldSentence(s.of) : 'values'}`, ...c].join(', '));
      break;
    }
    default: parts.push(String(s.kind ?? 'a value'));
  }
  return `${parts.join('')}${s.required === true ? ', always present' : ''}`;
}

/**
 * The signed part of ONE shape line, from the fields that stand (the `[you]` rule fields and the `[agent]` fields the person has not dropped or left Suggested).
 * @param {{text: string, fields: {name: string, spec: Record<string, any>, rule?: number|null, by?: 'you'|'agent'}[], itemCount?: {n: number}|null}} o
 * @returns {Record<string, any>}
 */
export function buildShapePart({ text, fields, itemCount = null }) {
  const rules = [...new Set(fields.filter((f) => Number.isInteger(f.rule)).map((f) => /** @type {number} */ (f.rule)))].sort((a, b) => a - b);
  return {
    class: 'shape', text,
    fields: fields.map((f) => ({ name: f.name, spec: f.spec, ...(Number.isInteger(f.rule) ? { rule: f.rule } : {}), ...(f.by === 'agent' ? { row: 'agent' } : {}) })),
    ...(itemCount ? { minItems: itemCount.n, maxItems: itemCount.n } : {}),
    ...(rules.length ? { rules } : {}),
  };
}

/** the shape part of a rubric-step stage's params, or null: picked by the line's signed CLASS, never by a key of the answer file @param {any} params @returns {any} */
export const shapePartOf = (params) => (isRec(params) && Array.isArray(params.parts) ? params.parts.find((/** @type {any} */ p) => isRec(p) && p.class === 'shape' && Array.isArray(p.fields)) ?? null : null);

/** the signed shape part of job line `n` in a close, or null @param {any} closeDecl @param {number} n */
export function shapePartOfLine(closeDecl, n) {
  for (const st of Array.isArray(closeDecl?.stages) ? closeDecl.stages : []) {
    if (!isRec(st) || st.kind !== 'rubric-step' || !isRec(st.params) || st.params.step !== n) continue;
    const p = shapePartOf(st.params);
    if (p) return p;
  }
  return null;
}

/** the words of one signed field row: `name: sentence`, then the rule it covers in the person's own words @param {any} f @param {string[]} rules the line's `~` rules @returns {string} */
export function shapeFieldText(f, rules) {
  const said = Number.isInteger(f.rule) ? rules[f.rule - 1] : undefined;
  return `${f.name}: ${shapeFieldSentence(f.spec)}${said ? ` — covers "${said}"` : ''}`;
}

/**
 * The shape rows of a signed close, read from its shape parts: one per field (a `[you]` rule row's, an `[agent]` row's), then the line's `[default]` row. A close with no shape part has none.
 * `rule` is the rule a `[you]` row is. Text is code's (never a model's).
 * @param {any} closeDecl @param {any[]|null} [jobLines] the person's numbered lines
 * @returns {{line: number, key: string, by: 'you'|'agent'|'default', text: string, name?: string, rule?: number}[]}
 */
export function shapeRowsOf(closeDecl, jobLines = null) {
  const stages = isRec(closeDecl) && Array.isArray(closeDecl.stages) ? closeDecl.stages : [];
  /** @type {{line: number, key: string, by: 'you'|'agent'|'default', text: string, name?: string, rule?: number}[]} */
  const out = [];
  for (const st of stages) {
    if (!isRec(st) || st.kind !== 'rubric-step' || !isRec(st.params)) continue;
    const part = shapePartOf(st.params);
    if (!part) continue;
    const n = st.params.step;
    const rules = lineRules((jobLines ?? []).find((/** @type {any} */ l) => isRec(l) && l.n === n));
    for (const f of part.fields.filter(isRec)) {
      out.push(Number.isInteger(f.rule) && f.row !== 'agent'
        ? { line: n, key: `L${n}.~${f.rule}`, by: 'you', text: shapeFieldText(f, rules), name: String(f.name), rule: f.rule }
        : { line: n, key: shapeRowKey(n, String(f.name)), by: 'agent', text: shapeFieldText(f, rules), name: String(f.name) });
    }
    out.push({ line: n, key: shapeDefaultKey(n), by: 'default', text: shapeDefaultWords(Number.isInteger(part.minItems) ? { min: part.minItems, max: part.maxItems } : null) });
  }
  return out;
}

/** the fields that say what a shape field IS: all but the names code gives it (the row's own key) — two drafts spell the same field alike @param {{name: string, kind: string, required?: boolean, bounds?: Record<string, any>}} f @returns {Record<string, any>} */
export const shapeFieldBody = (f) => ({ name: f.name, kind: f.kind, required: f.required === true, bounds: f.bounds ?? {} });
