// THE ONE CHECK LIST of a rubric job: made once, before the drafter's first try, then frozen. Every check the job can have is a row here.
//   `~` rows  the person's own rules (by: you; a settled pick builds the rule's check)
//   `!` rows  checks the agent suggests once, only from what it sees in the inputs (by: agent): the look's kept facts that carry no `~` rule, plus the call's own
//             proposals (count, phrase). Code proves a word-bearing `!` row against the input text, else drops it with a reason. A `~` always wins over a `!` on the same thing.
//   `$` rows  default checks code adds itself (by: default): every claim quotes the input (a text line with one input), the numbers tie (a text line after a fact line);
//             the mechanical floor (file exists, text not empty) is shown as a `$` row but is never counted as a check.
// Nothing here decides a verdict; the list says what the drafter may build, and code builds the rest.
import { askStructured, makeCostBook } from './authorflow.js';
import { countExact, countPhrase } from './factwords.js';
import { settleRules, plainWords } from './checkpick.js';
import { lineRules, defaultCitedText } from './rubricstep.js';
import { SIGNED_ROW_FIELDS, SIGNED_STATES } from './declaredclose.js';

/** at most this many `!` checks come from the call */
export const MAX_BANG = 3;
/** the reason a part with no row on the list goes under Not checked, in the person's words */
export const OFF_LIST_WORDS = 'Not on the list of checks made before the draft, so you judge it at Accept.';
/** the reason a check on a version or a date goes under Not checked: it is true only for the input as it is today */
export const WEEK_ONLY_WORDS = 'It names a version or a date from the input, true only for the input as it is today, so you judge it at Accept.';
/** the label of the list call, as the drafting book and the draft log see it */
export const LEDGER_LABEL = 'ledger-suggest';
export const LEDGER_TOOL = 'suggest_extra_checks';
/** how much of each input the call is shown */
const SHOWN_CHARS = 8000;
/** the reason the empty list is logged with */
export const EMPTY_LIST_WORDS = 'empty list: nothing to check';

/**
 * A check that needs exact words from the input is true only while the input stays as it is when those words hold a VERSION-like token (1.2 or 1.2.3, not after a currency sign or before
 * a percent) or a DATE-like token (2026-11-04, 04/11/2026, "Nov 4, 2026", "4 November 2026", "November 2026"). Code refuses it; a `~` rule is the person's own and is never refused by this.
 * @param {unknown} t @returns {boolean}
 */
export function weekOnly(t) {
  const s = String(t ?? '');
  const M = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  return /(?<![\d.$€£])\d+\.\d+(?:\.\d+)*(?![\d.]*%)/.test(s)
    || /\b\d{4}-\d{2}-\d{2}\b/.test(s)
    || /\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/.test(s)
    || new RegExp(`\\b${M}\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b`, 'i').test(s)
    || new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)? ${M}\\.?(?: \\d{4})?\\b`, 'i').test(s)
    || new RegExp(`\\b${M}\\.? \\d{4}\\b`, 'i').test(s);
}

const norm = (/** @type {unknown} */ t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const wordSet = (/** @type {unknown} */ t) => new Set(norm(t).match(/[\p{L}\p{N}]+/gu) ?? []);
const proved = (/** @type {string} */ text, /** @type {string} */ w) => countExact(text, w) > 0 || countPhrase(text, w) > 0;

/**
 * @typedef {{key: string, line: number, kind: 'rule'|'fact'|'cited'|'count'|'phrase'|'numbers'|'floor', from: 'rule'|'pick'|'look'|'agent'|'default', by: 'you'|'agent'|'default',
 *   words: string[], text?: string, rule?: number, part?: {line: number, part: number}, source?: string, name?: string, min?: number, max?: number, pick?: string, after?: number[],
 *   state: 'listed'|'built'|'not-checked'|'dropped', reason: string|null}} Row
 */

/**
 * Build the list. Pure.
 * @param {{jobLines: {n: number, text: string, rules?: string[], rule?: string}[], checkPicks?: {rules: any[], picks: any[], left: any[]}|null, look?: any, texts?: Record<string, string>|null,
 *   extra?: any[], inputLabels?: string[]}} o
 * @returns {Row[]}
 */
export function buildLedger({ jobLines, checkPicks = null, look = null, texts = null, extra = [], inputLabels = [] }) {
  /** @type {Row[]} */
  const rows = [];
  const seen = new Map();
  const keyOf = (/** @type {string} */ base) => { const n = (seen.get(base) ?? 0) + 1; seen.set(base, n); return n === 1 ? base : `${base}#${n}`; };
  const settled = checkPicks ? settleRules(checkPicks.rules, checkPicks.picks, checkPicks.left, jobLines) : null;
  const sole = texts && Object.keys(texts).length === 1 ? Object.keys(texts)[0] : null;
  const textOf = (/** @type {string|undefined} */ src) => (texts ? (texts[src ?? sole ?? ''] ?? null) : null);
  /** the `~` rule texts per line, for the ~-wins rule @type {Map<number, string[]>} */
  const rulesByLine = new Map();
  // 1. the person's rules, and the check a settled pick builds for each
  for (const l of jobLines) {
    const rs = lineRules(l);
    rulesByLine.set(l.n, rs);
    rs.forEach((t, i) => {
      const pick = settled?.checks.find((c) => c.line === l.n && c.rules.includes(i + 1));
      rows.push({ key: keyOf(`L${l.n}.~${i + 1}`), line: l.n, kind: 'rule', from: pick ? 'pick' : 'rule', by: 'you', words: [], text: t, rule: i + 1, ...(pick ? { pick: plainWords(/** @type {any} */ (pick.check)) } : {}), state: 'listed', reason: null });
    });
  }
  const ruleWins = (/** @type {number} */ line, /** @type {string} */ words) => {
    const t = wordSet(words);
    if (t.size === 0) return null;
    for (const [i, r] of (rulesByLine.get(line) ?? []).entries()) { const rt = wordSet(r); if ([...t].every((w) => rt.has(w))) return i + 1; }
    return null;
  };
  // 2. the look's kept facts that carry no `~` rule
  for (const f of Array.isArray(look?.facts) ? look.facts : []) {
    if (!f || typeof f.name !== 'string') continue;
    const words = (Array.isArray(f.words) ? f.words : []).filter((/** @type {unknown} */ w) => typeof w === 'string' && w.trim() !== '');
    const base = { key: keyOf(`L${f.line}.fact.${norm(f.name)}`), line: Number(f.line), kind: /** @type {'fact'} */ ('fact'), from: /** @type {'look'} */ ('look'), by: /** @type {'agent'} */ ('agent'), name: f.name, words, ...(typeof f.source === 'string' ? { source: f.source } : {}) };
    if (Number.isInteger(f.forRule)) { rows.push({ ...base, state: 'dropped', reason: `a ~ rule wins: line ${f.line} rule ${f.forRule} carries it` }); continue; }
    const text = textOf(f.source);
    const missing = text === null ? [] : words.filter((w) => !proved(text, w));
    if (words.some(weekOnly)) { rows.push({ ...base, state: 'dropped', reason: WEEK_ONLY_WORDS }); continue; }
    if (missing.length) rows.push({ ...base, state: 'dropped', reason: `the words ${missing.map((w) => `"${w}"`).join(', ')} are not in the input` });
    else rows.push({ ...base, state: 'listed', reason: null });
  }
  // 3. the checks the call proposed (count, phrase)
  let kept = 0;
  for (const e of Array.isArray(extra) ? extra : []) {
    if (!e || typeof e !== 'object') continue;
    const line = Number.isInteger(e.line) ? e.line : 1;
    const kind = ['cited', 'count', 'phrase'].includes(e.kind) ? e.kind : null;
    if (kind === null) continue;
    const words = kind === 'phrase' && typeof e.phrase === 'string' ? [e.phrase] : [];
    const base = { key: keyOf(`L${line}.${kind}.${norm(kind === 'count' ? `${e.min ?? ''}-${e.max ?? ''}` : (words[0] ?? e.source ?? ''))}`), line, kind, from: /** @type {'agent'} */ ('agent'), by: /** @type {'agent'} */ ('agent'), words, ...(typeof e.source === 'string' ? { source: e.source } : {}), ...(kind === 'count' ? { min: e.min, max: e.max } : {}) };
    const drop = (/** @type {string} */ reason) => rows.push({ ...base, state: 'dropped', reason });
    if (kept >= MAX_BANG) { drop(`more than ${MAX_BANG} checks proposed`); continue; }
    if (kind === 'cited') { drop('already on the list: every claim quoting the input is a $ default check'); continue; }
    if (kind !== 'count' && typeof e.source === 'string' && inputLabels.length && !inputLabels.includes(e.source)) { drop(`"${e.source}" is not one of the inputs`); continue; }
    if (kind === 'phrase') {
      const text = textOf(e.source);
      if (words.length === 0) { drop('no words given'); continue; }
      if (text !== null && !proved(text, words[0])) { drop(`the words "${words[0]}" are not in the input`); continue; }
      if (weekOnly(words[0])) { drop(WEEK_ONLY_WORDS); continue; }
      const w = ruleWins(line, words[0]);
      if (w !== null) { drop(`a ~ rule wins: line ${line} rule ${w} says it`); continue; }
    }
    if (kind === 'count') {
      if (!Number.isInteger(e.min) && !Number.isInteger(e.max)) { drop('no number given'); continue; }
      const nums = [e.min, e.max].filter((x) => Number.isInteger(x)).map(String);
      const w = (rulesByLine.get(line) ?? []).findIndex((r) => nums.some((n) => new RegExp(`(?<![\\d.])${n}(?![\\d.])`).test(r)));
      if (w >= 0) { drop(`a ~ rule wins: line ${line} rule ${w + 1} names the number`); continue; }
    }
    if (rows.some((r) => r.state === 'listed' && r.kind === kind && r.line === line && norm(r.words[0] ?? '') === norm(words[0] ?? ''))) { drop('already on the list'); continue; }
    rows.push({ ...base, state: 'listed', reason: null });
    kept += 1;
  }
  // 4. the `$` default rows: the floor, the cited rule on a text line, the numbers tie on a text line after a fact line.
  // A fact line = a line with a fact or phrase row that stands; a line whose facts were all dropped is a text line like any other.
  const factLines = new Set(rows.filter((r) => (r.kind === 'fact' || r.kind === 'phrase') && r.state !== 'dropped').map((r) => r.line));
  const labels = texts ? Object.keys(texts) : [];
  /** @type {number[]} */
  const earlierFacts = [];
  for (const l of jobLines) {
    const dflt = { line: l.n, from: /** @type {'default'} */ ('default'), by: /** @type {'default'} */ ('default'), words: /** @type {string[]} */ ([]) };
    rows.push({ ...dflt, key: keyOf(`L${l.n}.$floor`), kind: 'floor', text: 'the file exists and its text is not empty (code\'s own floor, never counted as a check)', state: 'built', reason: null });
    if (!factLines.has(l.n)) {
      if (labels.length === 1) rows.push({ ...dflt, key: keyOf(`L${l.n}.$cited`), kind: 'cited', source: labels[0], state: 'listed', reason: null });
      else if (labels.length > 1) rows.push({ ...dflt, key: keyOf(`L${l.n}.$cited`), kind: 'cited', state: 'not-checked', reason: 'the job has more than one input and code cannot pick which one the claims quote' });
      if (earlierFacts.length) rows.push({ ...dflt, key: keyOf(`L${l.n}.$numbers`), kind: 'numbers', after: [...earlierFacts], state: 'listed', reason: null });
    } else earlierFacts.push(l.n);
  }
  return rows;
}

/** an empty list (no row that stands but the floor) is said so, never left as no record at all @param {Row[]} rows @returns {boolean} */
export const isEmptyList = (rows) => !rows.some((r) => r.kind !== 'floor' && r.state !== 'dropped');

/** the record the draft log keeps, one object per row (key, line, rowKind, from, by, words, state, reason), plus ONE explicit record when nothing stands @param {Row[]} rows */
export const ledgerRecord = (rows) => [
  ...rows.map((r) => ({ key: r.key, line: r.line, rowKind: r.kind, from: r.from, by: r.by, words: r.kind === 'rule' ? [r.text ?? ''] : r.words, state: r.state, reason: r.reason })),
  ...(isEmptyList(rows) ? [{ key: 'empty', line: 0, rowKind: 'empty', from: 'default', by: 'default', words: [], state: 'empty', reason: EMPTY_LIST_WORDS }] : []),
];

// ---- after each try -------------------------------------------------------------------------------------------------------------------------
const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const say = (/** @type {unknown} */ t) => String(t ?? '').replace(/\s+/g, ' ').trim();
/** the rows that stand (a `~` row, or a `!`/`$` row that survived the proofs) @param {Row[]} rows */
const standing = (rows) => rows.filter((r) => r.state !== 'dropped');
/** @param {any} st @returns {boolean} */
const isRubricStep = (st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts);
/** code's one default cited part for a one-input job @param {string} label */
const citedPart = (label) => ({ text: defaultCitedText(label), class: 'countable', check: 'cited', source: label });

/**
 * Move every part (or fact, or count) of the drafted declaration that has no row on the list to Not checked. Pure.
 * A part carrying a `~` rule number is on the list by that rule; a fact is on the list when its name or phrase matches a `!` fact/phrase row; a claims-count part needs a `!` count row;
 * a fact's own result count rides with its fact while a fact of that part stands. A fact whose phrase/anchor/until holds a version or a date is refused as week-only (a `~` rule excepted).
 * On a one-input text stage the drafter's own `cited` parts are replaced by code's one default. Other classes are untouched.
 * @param {any} declaration @param {Row[]} rows @param {{labels?: string[]}} [o] `labels` the job's input labels
 * @returns {{declaration: any, units: number, refused: {line: number, kind: string, words: string, reason: string}[]}}
 */
export function applyLedger(declaration, rows, { labels = [] } = {}) {
  if (!isRec(declaration) || !Array.isArray(declaration.stages)) return { declaration, units: 0, refused: [] };
  const live = standing(rows);
  /** @type {{line: number, kind: string, words: string, reason: string}[]} */
  const refused = [];
  let units = 0;
  const stages = declaration.stages.map((/** @type {any} */ st) => {
    if (!isRubricStep(st)) return st;
    const line = st.params.step;
    const ruleCount = live.filter((r) => r.line === line && r.kind === 'rule').length;
    const onRule = (/** @type {any} */ p) => Array.isArray(p.rules) && p.rules.some((n) => Number.isInteger(n) && n >= 1 && n <= ruleCount);
    const factRow = (/** @type {any} */ f) => live.some((r) => r.line === line && (r.kind === 'fact' || r.kind === 'phrase')
      && ((r.name !== undefined && norm(r.name) === norm(f?.name)) || (typeof f?.phrase === 'string' && r.words.some((w) => norm(w) === norm(f.phrase)))));
    const textStage = !st.params.parts.some((/** @type {any} */ x) => isRec(x) && x.class === 'fact');
    const parts = [];
    for (const p of st.params.parts) {
      if (!isRec(p) || (p.class !== 'fact' && p.class !== 'countable')) { parts.push(p); continue; }
      // the drafter's own cited parts on a text stage: the `$` default (added below) replaces them
      if (p.class === 'countable' && p.check === 'cited' && textStage && labels.length === 1) continue;
      if (p.class === 'fact') {
        const fs = Array.isArray(p.facts) ? p.facts : [];
        const ruled = onRule(p);
        const week = (/** @type {any} */ f) => !ruled && [f?.phrase, f?.anchor, f?.until].some(weekOnly);
        const keptFacts = fs.filter((f) => !week(f) && (ruled || factRow(f)));
        units += fs.length;
        for (const f of fs.filter((x) => !keptFacts.includes(x))) refused.push({ line, kind: 'fact', words: say(f?.name) || say(p.text), reason: week(f) ? 'week-only' : 'not on the list' });
        let np = p;
        if (keptFacts.length !== fs.length) np = { ...p, facts: keptFacts };
        if (isRec(p.count)) {
          units += 1;
          if (!ruled && keptFacts.length === 0 && !live.some((r) => r.line === line && r.kind === 'count')) {
            refused.push({ line, kind: 'count', words: `results ${JSON.stringify(p.count)}`, reason: 'not on the list' });
            const { count: _dropped, ...rest } = np;
            np = rest;
          }
        }
        if (keptFacts.length === 0) continue;
        parts.push(np);
        continue;
      }
      // countable: a part carrying a ~ rule (a pick, code's own) stays; the claims counts need a `!` count row
      units += 1;
      if (onRule(p)) { parts.push(p); continue; }
      if ((p.check === 'minClaims' || p.check === 'maxClaims') && live.some((r) => r.line === line && r.kind === 'count')) { parts.push(p); continue; }
      refused.push({ line, kind: String(p.check ?? 'countable'), words: say(p.text), reason: 'not on the list' });
    }
    // a stage with no fact part left once the off-list ones are gone is a text stage: it carries the default cited check (a one-input job)
    const textNow = !parts.some((/** @type {any} */ x) => isRec(x) && x.class === 'fact');
    if (textNow && labels.length === 1 && !parts.some((/** @type {any} */ x) => isRec(x) && x.class === 'countable' && x.check === 'cited')) parts.push(citedPart(labels[0]));
    return { ...st, params: { ...st.params, parts } };
  });
  if (refused.length === 0) return { declaration: { ...declaration, stages }, units, refused };
  const notes = Array.isArray(declaration.notes) ? [...declaration.notes] : [];
  for (const r of refused) {
    const t = `line ${r.line}: "${r.words}" \u2014 ${r.reason === 'week-only' ? WEEK_ONLY_WORDS : OFF_LIST_WORDS}`;
    if (!notes.includes(t)) notes.push(t);
  }
  return { declaration: { ...declaration, stages, notes }, units, refused };
}

/**
 * The `$ cited` default decided AFTER the build has settled (whatever dropped, refused or never built the facts, the last-try drop included): a rubric step whose parts hold no fact part
 * gets code's one default `cited` part (a one-input job only), the drafter's own `cited` parts on it replaced by it. Pure; a step that still holds a fact part is untouched.
 * @param {any} declaration @param {string[]} labels the job's input labels @returns {any}
 */
export function ensureCited(declaration, labels = []) {
  if (!isRec(declaration) || !Array.isArray(declaration.stages) || labels.length !== 1) return declaration;
  const stages = declaration.stages.map((/** @type {any} */ st) => {
    if (!isRubricStep(st) || st.params.parts.some((/** @type {any} */ x) => isRec(x) && x.class === 'fact')) return st;
    const rest = st.params.parts.filter((/** @type {any} */ x) => !(isRec(x) && x.class === 'countable' && x.check === 'cited'));
    return { ...st, params: { ...st.params, parts: [...rest, citedPart(labels[0])] } };
  });
  return { ...declaration, stages };
}

/**
 * Every row's final state against the declaration the draft ended with. A `~` row is built when a part (or a pick) carries its number, else not-checked (`refused` names why, or "the plan
 * did not carry it"); a `!` row is built when a part matches it, else not-checked ("the plan did not build it"). A dropped row stays dropped with its reason. A default check code put on a
 * line the list did not foresee gets its row here, so no check in the plan is off the list.
 * @param {Row[]} rows @param {any} declaration @returns {Row[]}
 */
export function resolveLedger(rows, declaration) {
  const steps = (isRec(declaration) && Array.isArray(declaration.stages) ? declaration.stages : []).filter(isRubricStep);
  const partsOf = (/** @type {number} */ line) => steps.filter((st) => st.params.step === line).flatMap((st) => st.params.parts).filter(isRec);
  const refused = Array.isArray(declaration?.refused) ? declaration.refused : [];
  /** @type {(r: Row) => Row} */
  const settle = (r) => {
    if (r.state === 'dropped') return r;
    const ps = partsOf(r.line);
    /** @param {number} [i] the index of the part (among this line's parts) that carries the row */
    const built = (i) => ({ ...r, state: /** @type {const} */ ('built'), reason: null, ...(i !== undefined && i >= 0 ? { part: { line: r.line, part: i } } : {}) });
    const not = (/** @type {string} */ reason) => ({ ...r, state: /** @type {const} */ ('not-checked'), reason });
    if (r.kind === 'floor') return built();
    if (r.kind === 'cited' || r.kind === 'numbers') {
      const ci = ps.findIndex((p) => p.class === 'countable' && p.check === (r.kind === 'cited' ? 'cited' : 'numbersFromFacts'));
      if (ci >= 0) return built(ci);
      if (r.state === 'not-checked' && r.reason) return r;
      return not(ps.some((p) => p.class === 'fact') ? 'this line finds facts, so it has no text to quote' : 'the plan did not build it');
    }
    if (r.kind === 'rule') {
      const ri = ps.findIndex((p) => Array.isArray(p.rules) && p.rules.includes(r.rule));
      if (ri >= 0) return built(ri);
      const x = refused.find((q) => isRec(q) && q.line === r.line && q.rule === r.rule);
      return not(x ? say(x.reason) : 'the plan did not carry it');
    }
    const hi = r.kind === 'fact' || r.kind === 'phrase'
      ? ps.findIndex((p) => p.class === 'fact' && Array.isArray(p.facts) && p.facts.some((/** @type {any} */ f) => (r.name !== undefined && norm(f?.name) === norm(r.name)) || (typeof f?.phrase === 'string' && r.words.some((w) => norm(w) === norm(f.phrase)))))
      : ps.findIndex((p) => (p.class === 'countable' && (p.check === 'minClaims' || p.check === 'maxClaims')) || (p.class === 'fact' && isRec(p.count)));
    return hi >= 0 ? built(hi) : not('the plan did not build it');
  };
  const out = rows.map(settle);
  for (const st of steps) {
    for (const p of st.params.parts) {
      if (!isRec(p) || p.class !== 'countable' || (p.check !== 'cited' && p.check !== 'numbersFromFacts')) continue;
      const kind = p.check === 'cited' ? 'cited' : 'numbers';
      const line = st.params.step;
      if (out.some((r) => r.line === line && r.kind === kind)) continue;
      out.push({ key: `L${line}.$${kind}`, line, kind, from: 'default', by: 'default', words: [], ...(kind === 'cited' ? { source: String(p.source ?? '') } : { after: Array.isArray(p.from) ? p.from : [] }), state: 'built', reason: null, part: { line, part: partsOf(line).indexOf(p) } });
    }
  }
  return out;
}

export { SIGNED_ROW_FIELDS, SIGNED_STATES };

/**
 * The rows as the signed close carries them (`closeDecl.list`): line, key, from, by, kind, state, rule, part (where a built row points inside the close) and reason, and nothing else.
 * Only a row that ended built, not-checked or dropped is carried (a row still `listed` never reached the close). Pure; the same rows give the same bytes.
 * @param {Row[]} rows @returns {Record<string, any>[]}
 */
export function signedRows(rows) {
  return rows.filter((r) => SIGNED_STATES.includes(r.state)).map((r) => {
    const x = /** @type {Record<string, any>} */ (r);
    return Object.fromEntries(SIGNED_ROW_FIELDS.filter((f) => x[f] !== undefined && x[f] !== null).map((f) => [f, x[f]]));
  });
}

/**
 * The block the drafter reads, code-written from the rows that stand. Used only for a rubric job that has a list.
 * @param {Row[]} rows @returns {string}
 */
export function ledgerBlock(rows) {
  const lines = standing(rows).map((r) => {
    if (r.kind === 'rule') return `- line ${r.line}, ~ rule ${r.rule}: "${r.text}"${r.pick ? " (code builds this check from the person's pick; write no part for it)" : ' (carry it with a part whose "rules" lists its number, or list it in "refused")'}`;
    if (r.kind === 'fact') return `- line ${r.line}, ! fact "${r.name}"${r.words.length ? ` with the words ${r.words.map((w) => `"${w}"`).join(', ')}` : ''}`;
    if (r.kind === 'phrase') return `- line ${r.line}, ! phrase "${r.words[0]}"${r.source ? ` from "${r.source}"` : ''}`;
    if (r.kind === 'count') return `- line ${r.line}, ! result count${r.min ? ` min ${r.min}` : ''}${r.max ? ` max ${r.max}` : ''}`;
    if (r.kind === 'floor') return `- line ${r.line}, $ floor: ${r.text} (code's; write no part for it)`;
    if (r.kind === 'numbers') return `- line ${r.line}, $ default: every number in the text is in a quote checked on line ${(r.after ?? []).join(', ')} (code adds it; write no part for it)`;
    return `- line ${r.line}, $ default: every claim is backed by a quote copied from "${r.source ?? 'the input'}" (code adds it; write no part for it)`;
  });
  return 'THE LIST OF CHECKS - made once before this draft and frozen\n\n'
    + "These rows are every check this job has. A \"~\" row is the person's own rule. A \"!\" row is a check proposed from the inputs and proven against them by code. A \"$\" row is a default check code adds itself.\n"
    + (lines.length ? `\n${lines.join('\n')}\n` : '\n(the list has no check rows)\n')
    + '\nBuild a part only for a row on this list: a fact part uses the name and words of its "!" fact row exactly; a count part only where a "!" count row is listed or it counts a listed fact. '
    + `A part with no row on this list is moved to Not checked ("${OFF_LIST_WORDS}"). Do not add checks of your own.`;
}

// ---- the one paid call ---------------------------------------------------------------------------------------------------------------------
/** the list call's own system text (model-facing; used only by the list call of a rubric job with input text) */
export const LEDGER_SYSTEM = `You look at the inputs of a job and name checks the inputs themselves support, beyond the guardrails the person wrote.
Call ${LEDGER_TOOL} once with up to ${MAX_BANG} entries, or with an empty list.
- kind "count": how many results the input shows or the job asks for (min and/or max, whole numbers).
- kind "phrase": fixed words copied verbatim from an input (phrase, and source = that input's label).
Use only what you can see in the inputs. Do not repeat a guardrail the person wrote. If the inputs support none, send an empty list.`;

export const LEDGER_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    extra: {
      type: 'array', maxItems: MAX_BANG,
      items: {
        type: 'object',
        properties: {
          line: { type: 'integer', minimum: 1, description: 'the job line number' },
          kind: { enum: ['count', 'phrase'] },
          source: { type: 'string', description: 'the label of the input' },
          phrase: { type: 'string', description: 'phrase only: words copied verbatim from the input' },
          min: { type: 'integer', minimum: 1 },
          max: { type: 'integer', minimum: 1 },
        },
        required: ['line', 'kind'],
        additionalProperties: false,
      },
    },
  },
  required: ['extra'],
  additionalProperties: false,
});

const ledgerChannel = () => ({
  name: LEDGER_TOOL,
  instruction: `Your reply did not deliver exactly one ${LEDGER_TOOL} call. Call ${LEDGER_TOOL} exactly once. Do not write the answer as text.`,
  textPath: 'extra',
  tool: (/** @type {{calls: any[]}} */ box) => ({
    name: LEDGER_TOOL,
    description: 'Deliver the extra checks the inputs support (or an empty list). Call this exactly once.',
    parameters: LEDGER_SCHEMA,
    execute: async (/** @type {any} */ args) => { box.calls.push(args); return 'received'; },
  }),
});

/** @param {{n: number, text: string, rules?: string[], rule?: string}[]} jobLines @param {Record<string, string>} texts @returns {string} */
export function ledgerUserText(jobLines, texts) {
  const out = ['The job:'];
  for (const l of jobLines) {
    out.push(`${l.n}. ${l.text}`);
    lineRules(l).forEach((r, i) => out.push(`   g${i + 1}: ${r}`));
  }
  for (const [label, t] of Object.entries(texts)) out.push('', `Input "${label}":`, String(t).slice(0, SHOWN_CHARS));
  return out.join('\n');
}

/**
 * The one paid call; its spend is booked like the look's. An unusable answer is NOT a guessed list: it yields no `!` proposals and says why.
 * @param {{jobLines: any[], texts: Record<string, string>, generate: Function, ceilingUsd?: number|null, onCall?: (c: any) => void, priorCalls?: any[], priorRaws?: any[]}} o
 * @returns {Promise<{extra: any[], reason: string|null, calls: any[], raws: any[]}>}
 */
export async function runLedgerSuggest({ jobLines, texts, generate, ceilingUsd = null, onCall = () => {}, priorCalls = [], priorRaws = [] }) {
  const book = makeCostBook({ ceilingUsd, onCall });
  book.absorb(priorCalls, priorRaws);
  const before = book.report().calls.length;
  const beforeRaws = book.raws().length;
  const r = await askStructured({ messages: [{ role: 'user', content: ledgerUserText(jobLines, texts) }], generate, mode: 'tool', retries: 1, label: LEDGER_LABEL, book, channel: ledgerChannel() });
  const extra = r.artifact && Array.isArray(r.artifact.extra) ? r.artifact.extra : [];
  const reason = r.artifact ? null : (r.budget ? 'the spend ceiling was reached' : (r.providerError ?? r.red?.detail ?? 'the answer could not be read'));
  return { extra, reason, calls: book.report().calls.slice(before), raws: book.raws().slice(beforeRaws) };
}
