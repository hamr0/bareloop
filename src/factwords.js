// THE FOUND-ONCE CHECK (PART 1c, docs/product/ITEM33-BUILD.md "3. The look", PRD item 33 RF20): code proves, at $0, that every word a fact
// check depends on is really in the person's source - ONCE is enough - and that every label (anchor) is one PICKED from the list code
// made from that source (src/labelscan.js), never typed. A word that is not found is a red naming the word and the input. Nothing is
// graded here and no model is involved: the AI proposes the words, code proves they are there.
//
// Compared WHITE-SPACE BLIND: any run of white space (U+202F and U+00A0 included - Google writes U+202F before AM/PM, 259 times in one
// page) is one space on both sides.

import { labelOnList, normLabel, scanLabels } from './labelscan.js';

const WS = /[\s   ]+/g;
const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @param {string} t @returns {string} the source with every run of white space made one space */
export const squash = (t) => String(t ?? '').replace(WS, ' ');
/** @param {string} t @returns {string} lower case, markdown marks dropped, white space squashed - how a phrase or unit is compared */
const loose = (t) => squash(t).replace(/[*_`]/g, '').trim().toLowerCase();

/**
 * How many times exact words occur in a source, white space blind. Zero for empty words.
 * @param {string} source the raw source text @param {string} words
 * @returns {number}
 */
export function countExact(source, words) {
  const w = squash(words).trim();
  if (w === '') return 0;
  const hay = squash(source);
  let n = 0;
  for (let i = hay.indexOf(w); i !== -1; i = hay.indexOf(w, i + w.length)) n += 1;
  return n;
}

/**
 * How many times a phrase or unit occurs as WHOLE words, case and spacing aside ("SFO" is not found inside "sfocus").
 * @param {string} source @param {string} words @returns {number}
 */
export function countPhrase(source, words) {
  const w = loose(words);
  if (w === '') return 0;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}(?=$|[^\\p{L}\\p{N}])`, 'gu');
  let n = 0;
  for (const _m of loose(source).matchAll(re)) n += 1;
  return n;
}

/** @param {string} shape @returns {'money'|'number'|'date'|'time'|'text'} the label list a fact's anchor is picked from */
const listOf = (shape) => /** @type {any} */ (['money', 'number', 'date', 'time'].includes(shape) ? shape : 'text');

/**
 * The reds for ONE fact part against its frozen source text.
 * @param {{part: any, text: string, line: number|string, scan?: import('./labelscan.js').LabelScan}} o
 * @returns {{code: string, detail: string}[]}
 */
export function checkFactWords({ part, text, line, scan = scanLabels(text) }) {
  /** @type {{code: string, detail: string}[]} */
  const reds = [];
  const src = part.source;
  const red = (/** @type {string} */ code, /** @type {string} */ msg) => reds.push({ code, detail: `line ${line}: ${msg} Nothing was signed.` });
  for (const f of Array.isArray(part.facts) ? part.facts : []) {
    const who = `fact "${f.name}"`;
    if (f.anchor !== undefined && f.shape !== 'phrase') {
      const list = listOf(f.shape);
      const row = labelOnList(scan, list, f.anchor);
      if (!row) {
        const some = scan[list].slice(0, 12).map((r) => JSON.stringify(r.label)).join(', ');
        red('rubric-fact-label-off-list', `${who}: the label ${JSON.stringify(normLabel(String(f.anchor)))} is not one of the labels the input "${src}" holds before a ${f.shape === 'text' ? 'text value' : f.shape}. A label is picked from that list, never typed${some ? `: ${some}` : ' (the list is empty - leave the label out)'}.`);
      } else if (countExact(text, row.label) < 1) {
        red('rubric-fact-word-missing', `${who}: the label ${JSON.stringify(row.label)} is not in the input "${src}".`);
      } else if (Number.isInteger(part.count?.min) && row.count < part.count.min) {
        // M1: a label that starts each result must repeat as often as results were asked for; one that sits once on the page
        // (a sort tab, a switch) is in no result, so no one-result quote can hold it
        const n = part.count.min;
        red('rubric-fact-label-rare', `${who}: the label ${JSON.stringify(row.label)} is in the input "${src}" only ${row.count} time${row.count === 1 ? '' : 's'}, but this line asks for ${n} results, so a label that sits in each result must be there at least ${n} times. Pick a label from the list that is counted ${n} or more times.`);
      }
    }
    if (f.until !== undefined && countExact(text, f.until) < 1) red('rubric-fact-word-missing', `${who}: ${JSON.stringify(f.until)} is not in the input "${src}". Copy the closing words from the input, or leave them out.`);
    if (f.shape === 'phrase' && typeof f.phrase === 'string' && countPhrase(text, f.phrase) < 1) red('rubric-fact-word-missing', `${who}: ${JSON.stringify(f.phrase)} is not in the input "${src}". Copy the words the input really uses, or remove the check.`);
    if (typeof f.unit === 'string' && countPhrase(text, f.unit) < 1) red('rubric-fact-word-missing', `${who}: the unit ${JSON.stringify(f.unit)} is not in the input "${src}". Copy the words the input really uses.`);
  }
  return reds;
}

/**
 * The reds for every fact part of a declaration. A fact part whose input text is not at hand is a red: a check whose words were never
 * proved against the source is never signed.
 * @param {any} declaration @param {Record<string, string>|null} texts label -> frozen text
 * @returns {{code: string, path: string, detail: string}[]}
 */
export function checkDeclarationWords(declaration, texts) {
  /** @type {{code: string, path: string, detail: string}[]} */
  const reds = [];
  if (!declaration || !Array.isArray(declaration.stages)) return reds;
  /** @type {Map<string, import('./labelscan.js').LabelScan>} */
  const scans = new Map();
  declaration.stages.forEach((/** @type {any} */ st, /** @type {number} */ i) => {
    const parts = st?.kind === 'rubric-step' && Array.isArray(st.params?.parts) ? st.params.parts : [];
    parts.forEach((/** @type {any} */ p, /** @type {number} */ k) => {
      if (p?.class !== 'fact') return;
      const at = `stages[${i}].params.parts[${k}]`;
      const text = texts ? texts[p.source] : undefined;
      /** @param {string} code @param {string} detail */
      const red = (code, detail) => reds.push({ code, path: at, detail });
      if (typeof text !== 'string') {
        red('rubric-fact-unread', `line ${st.params.step}: the input "${p.source}" could not be read here to prove the words against it. Nothing was signed.`);
        return;
      }
      if (!scans.has(p.source)) scans.set(p.source, scanLabels(text));
      for (const r of checkFactWords({ part: p, text, line: st.params.step, scan: scans.get(p.source) })) reds.push({ code: r.code, path: at, detail: r.detail });
    });
  });
  return reds;
}

/**
 * The look's own proof hook: how often a phrase the look built is in an input.
 * @param {Record<string, string>} texts @returns {(source: string, phrase: string) => number}
 */
export function proverOf(texts) {
  return (source, phrase) => (typeof texts[source] === 'string' ? countPhrase(texts[source], phrase) : 0);
}
