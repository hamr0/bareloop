// THE ONE CHECK LIST of a rubric job: made once, before the drafter's first try, then frozen. Every check the job can have is a row here.
//   `~` rows  the person's own rules (by: you; a settled pick builds the rule's check)
//   `!` rows  checks the agent suggests once, only from what it sees in the inputs (by: agent): the look's kept facts that carry no `~` rule, plus the call's own
//             proposals (count, phrase). Code proves a word-bearing `!` row against the input text, else drops it with a reason. A `~` always wins over a `!` on the same thing.
//   `$` rows  default checks code adds itself (by: default): every claim quotes the input (a text line with one input), the numbers tie (a text line after a fact line);
//             the mechanical floor (file exists, text not empty) is shown as a `$` row but is never counted as a check.
// Nothing here decides a verdict; the list says what the drafter may build, and code builds the rest.
import { countExact, countPhrase } from './factwords.js';
import { settleRules, plainWords } from './checkpick.js';
import { lineRules } from './rubricstep.js';

/** at most this many `!` checks come from the call */
export const MAX_BANG = 3;
/** the reason a check on a version or a date goes under Not checked: it is true only for the input as it is today */
export const WEEK_ONLY_WORDS = 'It names a version or a date from the input, true only for the input as it is today, so you judge it at Accept.';
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
 *   words: string[], text?: string, rule?: number, source?: string, name?: string, min?: number, max?: number, pick?: string, after?: number[],
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
