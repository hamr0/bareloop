// PLACE RULES (docs/product/ITEM33-BUILD.md, "Place rules build spec (hamr go 2026-11-11)").
//
// A check whose words hold a version or a date ("the newest release is 0.55.0") is true only while the input stays as it is, so code refuses
// it as week-only. A PLACE RULE keeps it: it names WHERE the value sits (the first heading at one level of a changelog) instead of WHAT the
// value is. The signed fact carries the rule; at run start, before any provider call, CODE reads the run's own copy of the input with the rule
// and the value it finds is bound, in memory only, as that fact's phrase for the planner and the close. No model chooses or reads anything here.
//
// This module is the graduation (a REWRITE, never a copy) of the round-3 POC (F321). Pure: no file, no clock, no network.

/** the two rule kinds on the menu: the version in a heading, and the date on the same heading line */
export const PLACE_KINDS = Object.freeze(['headingBetween', 'headingDateAfter']);
/** the end-of-line end mark */
export const EOL = '$EOL';
/** the field a place rule may carry */
export const PLACE_FIELDS = Object.freeze(['kind', 'prefix', 'end', 'shape', 'skip']);
/** the closed list of reasons a read can end not found */
export const PLACE_REASONS = Object.freeze(['mixed-levels', 'no-heading-line', 'first-heading-mismatch', 'end-mark-missing', 'capture-not-shape', 'only-skipped-headings', 'no-date-on-line', 'no-file', 'empty-text']);
/** plain words for each reason, from code (the person never reads a raw code) */
export const PLAIN_REASONS = Object.freeze({
  'mixed-levels': 'the file writes its version headings at more than one level',
  'no-heading-line': 'the file has no heading at the level the rule reads',
  'first-heading-mismatch': 'the newest heading does not start the way the rule says',
  'end-mark-missing': 'the newest heading does not have the mark the rule reads up to',
  'capture-not-shape': 'the newest heading does not carry a version number',
  'only-skipped-headings': 'the file has only an Unreleased heading and no release after it',
  'no-date-on-line': 'the newest heading line carries no date',
  'no-file': 'the input could not be read',
  'empty-text': 'the input is empty',
});

const SHAPES = /** @type {Record<string, RegExp>} */ ({ semver: /^\d+\.\d+\.\d+$/, 'iso-date': /^\d{4}-\d{2}-\d{2}$/ });
const DATE_FIND = /\d{4}-\d{2}-\d{2}/;
const FENCE = /^\s{0,3}(```|~~~)/;
/** a heading carries a semver iff its text starts with an optional "[", an optional "v", then X.Y.Z (token-bounded) */
const SEMVER_HEADING = /^(#{1,6}) \[?v?(\d+\.\d+\.\d+)(?!\d|\.\d)/;

/**
 * @typedef {{kind: 'headingBetween'|'headingDateAfter', prefix: string, end: string, shape: string, skip: string[]}} PlaceRule
 * @typedef {{found: true, value: string, lineIndex: number}|{found: false, reason: string}} PlaceRead
 */

/**
 * Why a rule is not a legal place rule, or null when it is. Pure.
 * @param {unknown} rule @returns {string|null}
 */
export function placeRuleProblem(rule) {
  if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) return 'a place rule is {kind, prefix, end, shape, skip}';
  const r = /** @type {Record<string, any>} */ (rule);
  for (const k of Object.keys(r)) if (!PLACE_FIELDS.includes(k)) return `"${k}" is not a field of a place rule (fields: ${PLACE_FIELDS.join(', ')})`;
  if (!PLACE_KINDS.includes(r.kind)) return `kind is one of ${PLACE_KINDS.join(' | ')}`;
  if (typeof r.prefix !== 'string' || !/^#+ /.test(r.prefix)) return 'prefix starts with # marks and a space';
  if (typeof r.end !== 'string' || r.end === '') return 'end is the mark the value is read up to (or $EOL)';
  if (typeof r.shape !== 'string' || !Object.hasOwn(SHAPES, r.shape)) return `shape is one of ${Object.keys(SHAPES).join(' | ')}`;
  if (!Array.isArray(r.skip) || r.skip.some((/** @type {unknown} */ s) => typeof s !== 'string')) return 'skip is a list of words';
  return null;
}

/**
 * Heading lines at the rule's level: lines outside ``` / ~~~ fences that start with the level mark (for example "## "). Pure.
 * @param {string} text @param {string} prefix @returns {{i: number, line: string}[]}
 */
export function levelLines(text, prefix) {
  const mark = `${/^#+/.exec(prefix)?.[0] ?? '#'} `;
  let fenced = false;
  /** @type {{i: number, line: string}[]} */
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (FENCE.test(line)) { fenced = !fenced; return; }
    if (!fenced && line.startsWith(mark)) out.push({ i, line });
  });
  return out;
}

/**
 * The mixed-level guard: every non-fenced heading line is scanned; semver-carrying headings at MORE THAN ONE level mean mixed. A heading with no
 * semver (a "# Changelog" title, "### Fixed") is ignored. It only ever turns a read into not found, never into a value.
 * @param {string} text @returns {boolean}
 */
export function mixedLevels(text) {
  let fenced = false;
  /** @type {Set<number>} */
  const levels = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = SEMVER_HEADING.exec(line);
    if (m) levels.add(m[1].length);
  }
  return levels.size > 1;
}

/** @param {string} reason @returns {{found: false, reason: string}} */
const nf = (reason) => ({ found: false, reason });

/**
 * The STRICT first-heading read. It reads only the first heading line at the rule's level; it must match prefix + end + shape, else not found, and
 * it never looks further down. One exception: a capture that is exactly a skip word ("Unreleased") moves to the NEXT heading at that level,
 * ONCE (a second skip word is not found). Pure.
 * @param {PlaceRule} rule @param {string} text
 * @returns {{found: true, cap: string, after: string, lineIndex: number}|{found: false, reason: string}}
 */
function selectFirst(rule, text) {
  if (!text || !text.trim()) return nf('empty-text');
  if (mixedLevels(text)) return nf('mixed-levels');
  const hs = levelLines(text, rule.prefix);
  if (!hs.length) return nf('no-heading-line');
  let k = 0;
  let skipped = false;
  for (;;) {
    const { i, line } = hs[k];
    if (!line.startsWith(rule.prefix)) return nf('first-heading-mismatch');
    const rest = line.slice(rule.prefix.length);
    const e = rule.end === EOL ? rest.length : rest.indexOf(rule.end);
    if (e < 0) return nf('end-mark-missing');
    const cap = rest.slice(0, e).trim();
    if (rule.skip.some((s) => s.toLowerCase() === cap.toLowerCase())) {
      if (skipped) return nf('only-skipped-headings');
      skipped = true;
      k += 1;
      if (k >= hs.length) return nf('only-skipped-headings');
      continue;
    }
    if (!SHAPES[rule.shape].test(cap)) return nf('capture-not-shape');
    return { found: true, cap, after: rule.end === EOL ? '' : rest.slice(e + rule.end.length), lineIndex: i };
  }
}

/**
 * Read one rule against one input text: the run-start function, code only. A rule that is not legal throws (the signed spec was validated, so a bad one
 * is a defect, never a read).
 * @param {PlaceRule} rule @param {string} text @returns {PlaceRead}
 */
export function readPlace(rule, text) {
  const bad = placeRuleProblem(rule);
  if (bad !== null) throw new Error(`place rule: ${bad}`);
  const sel = selectFirst(rule, text);
  if (!sel.found) return sel;
  if (rule.kind === 'headingBetween') return { found: true, value: sel.cap, lineIndex: sel.lineIndex };
  const m = DATE_FIND.exec(sel.after);
  if (!m || !SHAPES['iso-date'].test(m[0])) return nf('no-date-on-line');
  return { found: true, value: m[0], lineIndex: sel.lineIndex };
}

// ---- drafting: fit a rule ---------------------------------------------------------------------------------------------------------------

const CANDIDATE_PREFIXES = ['## [', '## v', '## ', '# [', '# v', '# ', '### [', '### v', '### '];
const CANDIDATE_ENDS = [']', ' ', EOL];
/** the frozen candidate list: 9 prefixes crossed with 3 ends, prefix-major (27) */
export const PLACE_CANDIDATES = Object.freeze(CANDIDATE_PREFIXES.flatMap((prefix) => CANDIDATE_ENDS.map((end) => Object.freeze({ prefix, end }))));
/** the one skip word of a fitted rule: an "Unreleased" heading above the newest release */
const FIT_SKIP = Object.freeze(['Unreleased']);

/**
 * Fit a place rule to a fact's own words, by CODE, at drafting. The words must be exactly one version (X.Y.Z) or exactly one ISO date; the frozen
 * candidates are walked in order, and the first whose strict first-heading read on the input's own text returns exactly those words wins. Null =
 * no fit (a version and a date together, any other words, another date form, a mixed-level file, no text, or no candidate reading them): the caller
 * refuses the words as week-only exactly as before. Only the two kinds are handled. Pure.
 * @param {string} words @param {string|null|undefined} text
 * @returns {PlaceRule|null}
 */
export function fitPlaceRule(words, text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const w = String(words ?? '').trim();
  const kind = SHAPES.semver.test(w) ? 'headingBetween' : (SHAPES['iso-date'].test(w) ? 'headingDateAfter' : null);
  if (kind === null) return null;
  for (const c of PLACE_CANDIDATES) {
    /** @type {PlaceRule} */
    const rule = { kind, prefix: c.prefix, end: c.end, shape: 'semver', skip: [...FIT_SKIP] };
    const r = readPlace(rule, text);
    if (r.found && r.value === w) return rule;
  }
  return null;
}

// ---- the facts a spec carries -----------------------------------------------------------------------------------------------------------

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRec = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @typedef {{key: string, name: string, source: string, stage: number, part: number, fact: number, place: PlaceRule, phrase: string}} PlaceFact
 */

/**
 * Every place-rule fact of a spec, in stage / part / fact order. The key is the stage's name and the fact's name (both stable across the runs of one
 * workflow), so an earlier run's record finds the same fact. Pure.
 * @param {any} spec @returns {PlaceFact[]}
 */
export function placeFactsOf(spec) {
  /** @type {PlaceFact[]} */
  const out = [];
  const stages = Array.isArray(spec?.closeDecl?.stages) ? spec.closeDecl.stages : [];
  stages.forEach((/** @type {any} */ st, /** @type {number} */ si) => {
    if (!isRec(st) || st.kind !== 'rubric-step' || !isRec(st.params) || !Array.isArray(st.params.parts)) return;
    st.params.parts.forEach((/** @type {any} */ p, /** @type {number} */ pi) => {
      if (!isRec(p) || p.class !== 'fact' || !Array.isArray(p.facts)) return;
      p.facts.forEach((/** @type {any} */ f, /** @type {number} */ fi) => {
        if (!isRec(f) || f.shape !== 'phrase' || !isRec(f.place)) return;
        out.push({ key: `${String(st.name)}/${String(f.name)}`, name: String(f.name), source: String(p.source), stage: si, part: pi, fact: fi, place: /** @type {PlaceRule} */ (f.place), phrase: String(f.phrase) });
      });
    });
  });
  return out;
}

/**
 * A copy of the spec with each place fact's phrase replaced by the value the run read. The input spec is never touched (the signed spec and its hash
 * stay as signed); the copy is for this run's planner and close only. A key with no value is left as the signed drafting words.
 * @param {any} spec @param {Record<string, string>} values place-fact key to the value read @returns {any}
 */
export function bindPlaceValues(spec, values) {
  const bound = structuredClone(spec);
  for (const f of placeFactsOf(bound)) {
    if (Object.hasOwn(values, f.key)) bound.closeDecl.stages[f.stage].params.parts[f.part].facts[f.fact].phrase = values[f.key];
  }
  return bound;
}

/**
 * The value the drafting words themselves hold for this rule: the first version for headingBetween, the first ISO date for headingDateAfter. Null when
 * the words hold none. Used as "last read" when no earlier run has one.
 * @param {PlaceRule} rule @param {string} words @returns {string|null}
 */
export function valueInWords(rule, words) {
  const m = rule.kind === 'headingBetween' ? /(?<![\d.])\d+\.\d+\.\d+(?!\d|\.\d)/.exec(words) : /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/.exec(words);
  return m === null ? null : m[0];
}

/**
 * Re-read EVERY place fact against the run's own input text, one by one, before any spend. A row is same / new / notfound. Any notfound stops the run;
 * otherwise the run proceeds with the new words.
 * @param {{fact: PlaceFact, text: string|null, was: string|null}[]} items `text` null = the input could not be read
 * @returns {{proceed: boolean, rows: {key: string, name: string, kind: string, found: boolean, value: string|null, was: string|null, reason: string|null}[], values: Record<string, string>}}
 */
export function readPlaceRules(items) {
  const rows = items.map(({ fact, text, was }) => {
    const r = text === null ? /** @type {PlaceRead} */ ({ found: false, reason: 'no-file' }) : readPlace(fact.place, text);
    return r.found
      ? { key: fact.key, name: fact.name, kind: fact.place.kind, found: true, value: r.value, was, reason: null }
      : { key: fact.key, name: fact.name, kind: fact.place.kind, found: false, value: null, was, reason: r.reason };
  });
  /** @type {Record<string, string>} */
  const values = {};
  for (const r of rows) if (r.found && r.value !== null) values[r.key] = r.value;
  return { proceed: rows.every((r) => r.found), rows, values };
}

/**
 * The words of the $0 stop. Placeholder wording of the stop path (P3); the final plain-words text is the next piece.
 * @param {{name: string, found: boolean, reason: string|null}[]} rows @returns {string}
 */
export function stopWords(rows) {
  return `A place rule did not read the input (${rows.filter((r) => !r.found).map((r) => r.name).join(', ')}). The run did not start. Nothing spent.`;
}
