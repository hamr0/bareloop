// SHAPE JOBS (itemShape), docs/product/ITEM33-BUILD.md "Addendum 2026-11-18: shape jobs (itemShape)": THE ONE PLACE the kind menu is named. The offer (src/shapeoffer.js), the builder (src/shapebuild.js)
// and the tests read this table, never a copy of it.
// Where it comes from: bareguard's `itemShape` (ruling #83) kinds and the options each kind lists. The pinned bareguard (^0.36.0) does not carry `itemShape` yet, so the table is bareloop's own for now and
// `shapeAvailable()` is false: the offer, the builder's wiring and every row stay OFF, and a job drafts byte-identically to a job without this addendum. TODO(clause 5, the pin bump): read the kinds and the
// name rules from `rubricVocabulary.rules.itemShape.fields.fields` (it carries `reservedNames`, `nameForbiddenChars`, `nameMaxLength` once released) and delete this table.
// Not offered: the `object` kind (nested field specs, depth 2). The builder refuses it in plain words; a shape job with a nested object is not built yet.
import { rubricVocabulary } from 'bareguard';

const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** kind -> the options (bounds and modifiers) the kind accepts. `of` and `minEntries`/`maxEntries`/`unique` are the list's; `equals` is the boolean's (bareguard f712769). */
export const SHAPE_KINDS = Object.freeze({
  text: Object.freeze(['minChars', 'maxChars', 'minWords', 'maxWords']),
  number: Object.freeze(['min', 'max', 'gt', 'lt', 'fromText']),
  oneOf: Object.freeze(['values', 'ignoreCase']),
  money: Object.freeze(['currency', 'unit', 'decimal', 'min', 'max', 'gt', 'lt']),
  date: Object.freeze(['lang', 'months', 'min', 'max', 'gt', 'lt']),
  time: Object.freeze(['min', 'max', 'gt', 'lt']),
  url: Object.freeze([]),
  boolean: Object.freeze(['equals']),
  list: Object.freeze(['of', 'minEntries', 'maxEntries', 'unique']),
});

/** the kinds a list entry (`of`) may be: every scalar kind (never `list`, never `object`) */
export const ENTRY_KINDS = Object.freeze(Object.keys(SHAPE_KINDS).filter((k) => k !== 'list'));

/** the options that are BOUNDS: each must appear in the person's own words (the same law as `groundedLiterals`, src/sheetbuild.js). The other options only say how a value is read (currency, unit, of, fromText ...). `equals` has its own rule (R5). */
export const GROUNDED_BOUNDS = Object.freeze(['minChars', 'maxChars', 'minWords', 'maxWords', 'min', 'max', 'gt', 'lt', 'values', 'minEntries', 'maxEntries']);

/** the upper bounds: "under 60 words" may sign 59, and "under 450" 449.99, so the number the person wrote, one more and its ceiling are the candidates */
export const UPPER_BOUNDS = Object.freeze(['max', 'maxChars', 'maxWords', 'maxEntries']);

/** the bounds that count characters, words or entries: whole numbers, 0 or more */
export const COUNT_BOUNDS = Object.freeze(['minChars', 'maxChars', 'minWords', 'maxWords', 'minEntries', 'maxEntries']);

/** a field name is at most this long (bareguard's `nameMaxLength`) */
export const NAME_MAX_CHARS = 128;
/** a field name holds none of these (they separate the path in a red item: bareguard's `nameForbiddenChars`) */
export const NAME_FORBIDDEN = Object.freeze(['.', ':', '[', ']']);

/**
 * Does the bareguard this package runs carry `itemShape`? Until the release that does is pinned this is false, and the whole shape path stays off. Read from the vocabulary at call time, never assumed.
 * @returns {boolean}
 */
export function shapeAvailable() {
  const V = /** @type {any} */ (rubricVocabulary);
  return isRec(V?.rules?.itemShape);
}

/**
 * The name rules of a signed field: the characters and the length bareguard enforces, and (when this bareguard carries them) its own reserved reason words, read at runtime. A bareguard without the
 * reserved list gives `reserved: null`: the reserved-word refusal is then OFF and the builder says so in its result (`reservedChecked`), never silently. TODO(clause 5): the release carries them.
 * @returns {{max: number, forbidden: string[], reserved: string[]|null}}
 */
export function shapeNameRules() {
  const f = /** @type {any} */ (rubricVocabulary)?.rules?.itemShape?.fields?.fields;
  return {
    max: Number.isInteger(f?.nameMaxLength) ? f.nameMaxLength : NAME_MAX_CHARS,
    forbidden: Array.isArray(f?.nameForbiddenChars) ? f.nameForbiddenChars.map(String) : [...NAME_FORBIDDEN],
    reserved: Array.isArray(f?.reservedNames) ? f.reservedNames.map(String) : null,
  };
}

/**
 * Is `name` a legal signed field name? Null when it is, else the plain reason.
 * @param {unknown} name @param {{max: number, forbidden: string[], reserved: string[]|null}} [rules]
 * @returns {string|null}
 */
export function nameWhy(name, rules = shapeNameRules()) {
  if (typeof name !== 'string' || name.trim() === '') return 'a field name is needed';
  if (name.length > rules.max) return `a field name is at most ${rules.max} characters`;
  const bad = rules.forbidden.find((c) => name.includes(c));
  if (bad !== undefined) return `a field name cannot hold "${bad}"`;
  if (rules.reserved !== null && rules.reserved.includes(name)) return `"${name}" is a word the checker uses for its own gaps, so it cannot name a field`;
  return null;
}
