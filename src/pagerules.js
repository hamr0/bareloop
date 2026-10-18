// IDEA A CORE (docs/product/ITEM33-BUILD.md "Addendum 2026-10-18 — Idea A core: build spec", section 4.2): the plain code rules that
// keep or drop each page word the AI's map named. The AI never grades: it names words, code keeps only what the saved page proves.
// Pure - no I/O, no clock, no model. The rule bodies are PORTED from the frozen POC (.claude/scratch/idea-a-v2/rules.mjs and
// rules-v3-candidate.mjs; sha256 recorded in commit 0bcc5fe), with the OUT branches (R2, R2a, R2b, R2c, R3, R3U, V4, pageClaims) deleted.

import { lineRules } from './rubricstep.js';

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

/**
 * Apply the rules to the AI's map over one saved page. Returns the kept facts and, for everything a rule removed, one `dropped` entry.
 * @param {string} text the frozen page text @param {PageMap} mapping @param {{n: number, text?: string, rule?: string, rules?: string[]}[]} jobLines
 * @returns {{facts: KeptFact[], dropped: Dropped[]}}
 */
export function applyPageRules(text, mapping, jobLines) {
  /** @type {Dropped[]} */
  const dropped = [];
  const list = Array.isArray(mapping?.facts) ? mapping.facts : [];
  /** @type {KeptFact[]} */
  const facts = list.filter(isRec).map((f) => {
    const tie = tieOf(f.from, jobLines);
    /** @type {KeptFact} */
    const out = { line: tie.line, name: String(f.name ?? ''), shape: f.shape === 'place' ? 'phrase' : String(f.shape), from: String(f.from ?? ''), words: (Array.isArray(f.words) ? f.words : []).map(String) };
    if (Array.isArray(f.unit) && f.unit.length) out.unit = f.unit.map(String);
    if (Array.isArray(f.currency) && f.currency.length) out.currency = f.currency.map(String);
    if (tie.rule !== undefined) out.forRule = tie.rule;
    return out;
  });
  void text;
  return { facts, dropped };
}
