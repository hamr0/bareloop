// MONEY BUILD v2 (docs/product/ITEM33-BUILD.md "Addendum 2026-10-21 — money build spec v2", part 2): "CAN IT READ". After the page rules, a $0 dry
// read asks of each kept money fact whether the REAL run-time checker can read a price on the page's own result lines. For every result line it
// grades an HONEST claim (quote = that line, value = the line's amount) with `gradeStep` (src/rubricstep.js), the one reader the run itself
// uses - no copy of its logic here. A fact that reads no result line is dropped as `reads-no-result` and shows under Not checked.
// No limits, no counts, no pass bar: only "can it read". Async (gradeStep is), so it sits beside applyPageRules, not inside it: the caller is
// src/pagemap.js `runPageMap`. No I/O, no clock, no model.

import { createHash } from 'node:crypto';
import { gradeStep } from './rubricstep.js';
import { linesOf, numberAtEnd } from './pagerules.js';

/** @typedef {import('./pagerules.js').KeptFact} KeptFact @typedef {import('./pagerules.js').Dropped} Dropped */

/** a number as the page writes it, thousands commas allowed */
const NUM = '\\d[\\d,]*(?:\\.\\d+)?';
const AFTER_LABEL = new RegExp(`^\\s*(?:[$€£]\\s*)?(${NUM})`);
/** the label every dry-read claim is made under (the checker only needs one name; the fact's own is not read) */
const CLAIM = 'price';
const SOURCE = 'page';

/**
 * The result lines of a kept money fact: with a label, every page line where a kept label is followed by a number (one sign between allowed);
 * with no label (U1 moved it to a unit, e.g. "€533 total"), every line where a number is followed by a kept unit.
 * @param {string} text @param {KeptFact} k @returns {{quote: string, value: string}[]}
 */
export function moneyResultLines(text, k) {
  const raw = text.split('\n');
  const squashed = linesOf(text);
  /** @type {{quote: string, value: string}[]} */
  const out = [];
  squashed.forEach((ln, i) => {
    /** @type {string|undefined} */
    let amount;
    if (k.words.length) {
      for (const w of k.words) {
        for (let at = ln.indexOf(w); at !== -1 && amount === undefined; at = ln.indexOf(w, at + w.length)) amount = AFTER_LABEL.exec(ln.slice(at + w.length))?.[1];
        if (amount !== undefined) break;
      }
    } else {
      for (const u of k.unit ?? []) {
        for (let at = ln.indexOf(u); at !== -1 && amount === undefined; at = ln.indexOf(u, at + u.length)) amount = numberAtEnd(ln.slice(0, at));
        if (amount !== undefined) break;
      }
    }
    if (amount !== undefined) out.push({ quote: raw[i].trim(), value: amount.replace(/,/g, '') });
  });
  return out;
}

/**
 * The fact as a run would sign it, for the dry read: the primary label is the anchor (none when U1 moved every label), then the kept units and currencies.
 * @param {KeptFact} k @returns {Record<string, any>}
 */
const signedOf = (k) => ({ name: CLAIM, shape: 'money', ...(k.words.length ? { anchor: k.words[0] } : {}), ...(k.currency ? { currency: k.currency } : {}), ...(k.unit ? { unit: k.unit } : {}) });

/**
 * Dry-read every kept money fact; drop (as `reads-no-result`) the ones whose forms read no result line. Other facts pass through untouched.
 * @param {string} text the frozen page text @param {KeptFact[]} facts what applyPageRules kept
 * @returns {Promise<{facts: KeptFact[], dropped: Dropped[], reads: Record<string, number>, results: Record<string, number>}>}
 *   `reads` / `results` = result lines the checker read / lines found, per fact name (for tests and reports; no verdict derives from the numbers)
 */
export async function dryReadMoney(text, facts) {
  const sha = createHash('sha256').update(text).digest('hex');
  /** @type {KeptFact[]} */
  const kept = [];
  /** @type {Dropped[]} */
  const dropped = [];
  /** @type {Record<string, number>} */
  const reads = {};
  /** @type {Record<string, number>} */
  const results = {};
  for (const k of facts) {
    if (k.shape !== 'money') { kept.push(k); continue; }
    const fact = signedOf(k);
    const lines = moneyResultLines(text, k);
    let n = 0;
    for (const r of lines) {
      const params = { step: 1, parts: [{ text: 'dry read', class: 'fact', source: SOURCE, covers: [1], facts: [fact] }] };
      const g = await gradeStep({ params, bytes: JSON.stringify({ results: [{ quote: r.quote, values: { [CLAIM]: r.value } }] }), outputBytes: null, inputs: { [SOURCE]: text } }, { [SOURCE]: sha });
      if (g.verdict === 'green') n += 1;
    }
    reads[k.name] = n;
    results[k.name] = lines.length;
    if (n > 0) { kept.push(k); continue; }
    dropped.push({ line: k.line, ...(k.forRule === undefined ? {} : { rule: k.forRule }), fact: k.name, reason: 'reads-no-result' });
  }
  return { facts: kept, dropped, reads, results };
}

/**
 * The same "can it read" for PHRASE facts (hamr ruled 3a, run m10-walk-flights-3: "Rome" was on the page only in "Track prices from Madrid to
 * Rome" switches, in none of the 18 result lines, so no result could ever say it). A kept phrase fact is read against the page's RESULT LINES =
 * the lines the job's kept money facts read (`moneyResultLines`), each graded as an honest claim by the real `gradeStep` (quote = that line;
 * a phrase has no value to write). A phrase that reads no result line is dropped whole as `phrase-no-result` and shows under Not checked.
 * With no kept money fact the result lines are unknown, so phrase facts pass through untouched (nothing is guessed about what a result is).
 * @param {string} text the frozen page text @param {KeptFact[]} facts what the money dry read kept
 * @returns {Promise<{facts: KeptFact[], dropped: Dropped[], reads: Record<string, number>}>} `reads` = result lines that said the phrase, per fact name
 */
export async function dryReadPhrases(text, facts) {
  const sha = createHash('sha256').update(text).digest('hex');
  /** @type {Map<string, true>} */
  const quotes = new Map();
  for (const k of facts) if (k.shape === 'money') for (const r of moneyResultLines(text, k)) quotes.set(r.quote, true);
  /** @type {KeptFact[]} */
  const kept = [];
  /** @type {Dropped[]} */
  const dropped = [];
  /** @type {Record<string, number>} */
  const reads = {};
  for (const k of facts) {
    if (k.shape !== 'phrase' || quotes.size === 0 || !k.words.length) { kept.push(k); continue; }
    const fact = { name: k.name, shape: 'phrase', phrase: k.words[0] };
    let n = 0;
    for (const quote of quotes.keys()) {
      const params = { step: 1, parts: [{ text: 'dry read', class: 'fact', source: SOURCE, covers: [1], facts: [fact] }] };
      const g = await gradeStep({ params, bytes: JSON.stringify({ results: [{ quote, values: {} }] }), outputBytes: null, inputs: { [SOURCE]: text } }, { [SOURCE]: sha });
      if (g.verdict === 'green') n += 1;
    }
    reads[k.name] = n;
    if (n > 0) { kept.push(k); continue; }
    dropped.push({ line: k.line, ...(k.forRule === undefined ? {} : { rule: k.forRule }), fact: k.name, other: k.words[0], reason: 'phrase-no-result' });
  }
  return { facts: kept, dropped, reads };
}
