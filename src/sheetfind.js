// S1 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-17"; fwdloop M10 piece 5, item 7): when a job's word is not a column of the sheet, CODE finds the column that passes the same test
// the page words pass - a value of the right kind in the rows - and builds the ask. The model names a word and nothing else; it never names a column to offer and
// never decides an ask (tests/sheet-find.test.js, tests/sheet-ask.test.js).
// Copied from fwdloop src/sheetfind.js@v0.35.0 (F71 Test 3, C1-C4, $0).
//   A column FITS when a plain number fills at least FIT_RATIO of the rows (F71 (b)). A plain number is the whole cell: optional sign, digits, thousands commas,
//   optional decimals. One fitting column with the most rows is the one ask. Two or more fitting columns with equal rows offer nothing (F71 C2, hamr 2026-10-19).
// Throws away: every column but the winner, the cells' values, and everything but the header and the count of number cells.
import { parseCsv } from './csv.js';
import { wordForms } from './factwords.js';

/** a column fits when a plain number fills at least this share of the rows (F71 (b)) */
export const FIT_RATIO = 0.9;
const PLAIN_NUMBER = /^[-+]?\d[\d,]*(\.\d+)?$/;

/** @param {string} h @returns {string} a header as it is compared: trimmed, white space made one space, lower case */
const norm = (h) => String(h ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * @typedef {{kind: 'header', column: string}} FoundHeader the word IS a column (nothing to ask)
 * @typedef {{kind: 'ask', column: string, numbers: number, rows: number}} FoundAsk exactly one column fits: the one ask
 * @typedef {{kind: 'tie', columns: string[], rows: number}} FoundTie two or more columns fit equally: no ask
 * @typedef {{kind: 'none', rows: number}} FoundNone no column fits: no ask
 */

/**
 * Where a job word lands in a sheet's columns.
 * @param {string} csvText the sheet's text @param {string} word the job's word
 * @returns {FoundHeader|FoundAsk|FoundTie|FoundNone}
 */
export function findColumn(csvText, word) {
  const { header, rows } = parseCsv(csvText);
  const hit = header.find((h) => norm(h) === norm(word) && norm(h) !== '') ?? header.find((h) => norm(h) !== '' && wordForms(word).includes(norm(h)));
  if (hit !== undefined) return { kind: 'header', column: hit };
  const n = rows.length;
  const cols = header.map((h) => ({ h, n: rows.filter((r) => PLAIN_NUMBER.test(String(r.byName[h] ?? '').trim())).length }));
  const fit = cols.filter((c) => n > 0 && c.n / n >= FIT_RATIO);
  if (fit.length === 0) return { kind: 'none', rows: n };
  const best = Math.max(...fit.map((c) => c.n));
  const top = fit.filter((c) => c.n === best);
  if (top.length > 1) return { kind: 'tie', columns: top.map((c) => c.h), rows: n };
  return { kind: 'ask', column: top[0].h, numbers: top[0].n, rows: n };
}

/**
 * The question, as the person reads it: `no column 'Price'; 'Amount' has numbers in 40 of 40 rows. Use it? (your answer replaces that ~ rule on line N).`
 * @param {string} word @param {FoundAsk} found @param {number} line @param {boolean} [tied] the question is about one of the person's `~` rules @returns {string}
 */
export const columnQuestion = (word, found, line, tied = false) => `no column '${word}'; '${found.column}' has numbers in ${found.numbers} of ${found.rows} rows. Use it?${columnTail(line, tied)}`;
/** @param {number} line @param {boolean} [tied] the question is about one of the person's `~` rules (the answer replaces that rule: bareloop's one rule in, one rule out); a word of the line's own prose has no rule to replace (F196 fault 3) @returns {string} */
export const columnTail = (line, tied = false) => (tied ? ` (your answer replaces that ~ rule on line ${line}).` : ` (your answer becomes the agent's check on line ${line}).`);

/**
 * The question for a tie (hamr 2026-11-17: a tie asks, it never goes Not checked): the real count, the columns in sheet order, then the tail of a `~` rule's question.
 * @param {string} word @param {string[]} columns @param {number} line @returns {string}
 */
export const columnTieQuestion = (word, columns, line) => `I found ${columns.length} columns matching '${word}': ${columns.join(', ')}. Choose one.${columnTail(line, true)}`;
