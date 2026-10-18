// IDEA A CORE (docs/product/ITEM33-BUILD.md "Addendum 2026-10-18 — Idea A core: build spec", section 4.2): the plain code rules that
// keep or drop each page word the AI's map named. The AI never grades: it names words, code keeps only what the saved page proves.
// Pure - no I/O, no clock, no model. The rule bodies are PORTED from the frozen POC (.claude/scratch/idea-a-v2/rules.mjs and
// rules-v3-candidate.mjs; sha256 recorded in commit 0bcc5fe), with the OUT branches (R2, R2a, R2b, R2c, R3, R3U, V4, pageClaims) deleted.

import { lineRules } from './rubricstep.js';
import { countExact, countPhrase, squash } from './factwords.js';
import { normLabel } from './labelscan.js';

/**
 * @typedef {{name: string, from?: string, shape: string, words?: string[], currency?: string[], unit?: string[]}} MapFact the AI's map, one fact
 * @typedef {{facts: MapFact[]}} PageMap
 * @typedef {{line: number, name: string, shape: string, from: string, words: string[], unit?: string[], currency?: string[], forRule?: number}} KeptFact
 *   `words` = what the page proves: the labels of a money/number/time fact, or the alternative phrases of a phrase fact (a place is a phrase)
 * @typedef {{line: number, rule?: number, fact: string, word?: string, reason: string}} Dropped
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRec = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Which job line, and which `~` rule under it, a map fact carries out. The map writes `from` as "line N", "line N rule M", "rule M" or
 * "job line"; anything else is the first job line.
 * @param {unknown} from @param {{n: number, text?: string, rule?: string, rules?: string[]}[]} jobLines
 * @returns {{line: number, rule?: number}}
 */
export function tieOf(from, jobLines) {
  const s = String(from ?? '');
  const lineM = /line\s*(\d+)/i.exec(s);
  const ruleM = /rule\s*(\d+)/i.exec(s);
  const first = jobLines[0]?.n ?? 1;
  let line = lineM && jobLines.some((l) => l.n === Number(lineM[1])) ? Number(lineM[1]) : null;
  const rule = ruleM ? Number(ruleM[1]) : undefined;
  if (line === null && rule !== undefined) line = jobLines.find((l) => lineRules(l).length >= rule)?.n ?? null;
  const out = { line: line ?? first };
  if (rule !== undefined && lineRules(jobLines.find((l) => l.n === out.line)).length >= rule) return { ...out, rule };
  return out;
}

/** @param {string} text @returns {string[]} the page's lines, white space squashed (the unit every per-line rule counts in) */
export const linesOf = (text) => text.split('\n').map(squash);

/**
 * How many times a label occurs inside ONE page line, at most (plain indexOf on squashed lines, non-overlapping): the N2 measure.
 * @param {string[]} lines @param {string} phrase @returns {number}
 */
function maxPerLine(lines, phrase) {
  const p = squash(phrase).trim();
  if (!p) return 0;
  let max = 0;
  for (const ln of lines) {
    let n = 0;
    for (let i = ln.indexOf(p); i !== -1; i = ln.indexOf(p, i + p.length)) n += 1;
    if (n > max) max = n;
  }
  return max;
}

/** the value each shape reads right after a label: a money or number is digits (a sign may come first), a time is h:mm and AM/PM */
const READ = {
  money: /^\s*[$€£]?\s*(\d[\d,]*(?:\.\d+)?)/,
  time: /^\s*(\d{1,2}:\d{2}[\s\u202f\u00a0]?[AaPp][Mm])/,
  number: /^\s*(\d[\d,]*(?:\.\d+)?)/,
};

/**
 * R1 reader: the set of values of a fact's shape written right after each occurrence of a label on the page.
 * @param {string[]} lines @param {string} label @param {'money'|'time'|'number'} shape @returns {Set<string>}
 */
function valueSet(lines, label, shape) {
  /** @type {Set<string>} */
  const s = new Set();
  const p = squash(label).trim();
  if (!p) return s;
  for (const ln of lines) {
    for (let i = ln.indexOf(p); i !== -1; i = ln.indexOf(p, i + p.length)) {
      const m = READ[shape].exec(ln.slice(i + p.length));
      if (m) s.add(m[1]);
    }
  }
  return s;
}
/** @param {Set<string>} a @param {Set<string>} b @returns {boolean} */
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/** the symbols a currency may be (src/facts.js); a code like "EUR" is a word read after the number, so it is a unit */
const CURRENCY_SYMBOLS = ['$', '€', '£'];
/** the shapes that read a value after a label */
const VALUE_SHAPES = ['money', 'time', 'number'];

/**
 * Apply the rules to the AI's map over one saved page. Returns the kept facts and, for everything a rule removed, one `dropped` entry.
 * The order of the rules is the POC's (apply-v3.mjs): found-on-page, then the rules that read the page. A place is read as a phrase.
 * @param {string} text the frozen page text @param {PageMap} mapping @param {{n: number, text?: string, rule?: string, rules?: string[]}[]} jobLines
 * @returns {{facts: KeptFact[], dropped: Dropped[]}}
 */
export function applyPageRules(text, mapping, jobLines) {
  /** @type {Dropped[]} */
  const dropped = [];
  const list = Array.isArray(mapping?.facts) ? mapping.facts.filter(isRec) : [];
  /** @type {Map<MapFact, {line: number, rule?: number}>} */
  const ties = new Map(list.map((f) => [f, tieOf(f.from, jobLines)]));
  const drop = (/** @type {MapFact} */ f, /** @type {string|undefined} */ word, /** @type {string} */ reason) => {
    const t = /** @type {{line: number, rule?: number}} */ (ties.get(f));
    dropped.push({ line: t.line, ...(t.rule === undefined ? {} : { rule: t.rule }), fact: String(f.name ?? ''), ...(word === undefined ? {} : { word }), reason });
  };

  // ---- found-on-page: the code keeps only words the saved page really holds (count >= 1) ----
  /** @type {{f: MapFact, kept: string[], cur: string[], uni: string[], first?: string|null}[]} */
  const pending = [];
  for (const f of list) {
    const words = (Array.isArray(f.words) ? f.words : []).map((w) => String(w)).filter((w) => w.trim() !== '');
    if (f.shape === 'place' || f.shape === 'phrase') {
      const kept = [];
      for (const w of words) {
        const n = f.shape === 'phrase' ? countPhrase(text, w) : countExact(text, w);
        if (n >= 1) kept.push(w); else drop(f, w, 'not-on-page');
      }
      pending.push({ f, kept, cur: [], uni: [] });
    } else if (VALUE_SHAPES.includes(String(f.shape))) {
      const kept = [];
      for (const w0 of words) {
        const w = normLabel(w0);
        if (countExact(text, w) >= 1) kept.push(w); else drop(f, w0, 'not-on-page');
      }
      const cur = (Array.isArray(f.currency) ? f.currency : []).filter((c) => {
        if (countExact(text, c) < 1) { drop(f, c, 'not-on-page'); return false; }
        if (!CURRENCY_SYMBOLS.includes(c)) { drop(f, c, 'currency-not-symbol'); return false; }
        return true;
      });
      const uni = (Array.isArray(f.unit) ? f.unit : []).filter((u) => {
        if (countPhrase(text, u) < 1) { drop(f, u, 'not-on-page'); return false; }
        return true;
      });
      pending.push({ f, kept, cur, uni, first: words.length ? normLabel(words[0]) : null });
    } else drop(f, undefined, 'bad-shape');
  }

  // ---- R1, same-value: the labels after the AI's FIRST listed one are kept only if they read the same set of values as it does ----
  const lines = linesOf(text);
  for (const p of pending) {
    if (!VALUE_SHAPES.includes(String(p.f.shape))) continue;
    const shape = /** @type {'money'|'time'|'number'} */ (p.f.shape);
    const ref = p.first ? valueSet(lines, p.first, shape) : new Set();
    p.kept = p.kept.filter((w) => {
      if (w === p.first) return true;
      if (sameSet(valueSet(lines, w, shape), ref)) return true;
      drop(p.f, w, 'r1');
      return false;
    });
  }

  // ---- N2, per line: a label written 2+ times inside one page line cannot say which value is meant, so it is unusable. (R2 grow-left is OUT.) ----
  for (const p of pending) {
    if (!VALUE_SHAPES.includes(String(p.f.shape))) continue;
    p.kept = p.kept.filter((w) => {
      if (maxPerLine(lines, w) <= 1) return true;
      drop(p.f, w, 'n2');
      return false;
    });
  }

  // ---- the kept facts, in the POC's order: places, phrases, then values ----
  /** @type {KeptFact[]} */
  const signed = [];
  const make = (/** @type {{f: MapFact, kept: string[], cur: string[], uni: string[]}} */ p) => {
    const t = /** @type {{line: number, rule?: number}} */ (ties.get(p.f));
    /** @type {KeptFact} */
    const out = { line: t.line, name: String(p.f.name), shape: p.f.shape === 'place' ? 'phrase' : String(p.f.shape), from: String(p.f.from ?? ''), words: [...p.kept] };
    if (p.f.shape === 'money') {
      if (p.uni.length) out.unit = [...p.uni];
      if (p.cur.length) out.currency = [...p.cur];
    }
    if (t.rule !== undefined) out.forRule = t.rule;
    return out;
  };
  for (const kind of ['place', 'phrase', 'value']) {
    for (const p of pending) {
      const isValue = VALUE_SHAPES.includes(String(p.f.shape));
      if (kind === 'value' ? !isValue : p.f.shape !== kind) continue;
      // a fact with no label the page holds is dropped; a money fact also needs a currency or a unit the page holds
      if (p.kept.length === 0 || (p.f.shape === 'money' && !p.cur.length && !p.uni.length)) { drop(p.f, undefined, 'no-label'); continue; }
      signed.push(make(p));
    }
  }
  const order = list.map((f) => String(f.name));
  return { facts: signed.sort((a, b) => order.findIndex((n) => a.name.startsWith(n)) - order.findIndex((n) => b.name.startsWith(n))), dropped };
}
