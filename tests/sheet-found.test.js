// S5 words: the found-words of a passed sheet check (fwdloop's `sheetFoundWords`, as they are) on the real aging fixture's checks, and the page's drawing of them. A string claim (a looked-up cell) says nothing:
// a cell's text is never repeated; the planted string below must appear in no line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sheetFoundWords, sheetFoundLine } from '../src/sheetrows.js';

const JOBS = JSON.parse(readFileSync(new URL('./fixtures/sheets/jobs.json', import.meta.url), 'utf8'));
const [DAYS, BANDS, DUP] = JOBS.aging.checks;
const PLANTED = 'PLANTED-CELL-STRING-9X';
const CLAIMS = { ageDays: { days: { 2: 269, 3: 238 } }, ageBand: { bands: { 2: '90+', 3: PLANTED } }, str: { value: PLANTED } };

test('found words: a count of rows, a number, yes or no; a table check and a string claim say nothing; the planted cell never appears', () => {
  assert.equal(sheetFoundWords(DAYS, CLAIMS), '2 rows');
  assert.equal(sheetFoundWords(BANDS, CLAIMS), '2 rows');
  assert.equal(sheetFoundWords(DUP, CLAIMS), null, 'a table check has no claim');
  assert.equal(sheetFoundWords({ claim: 'str', op: 'lookup' }, CLAIMS), null, 'a string claim is cell text');
  assert.equal(sheetFoundWords({ claim: 'n' }, { n: { value: 17 } }), '17');
  assert.equal(sheetFoundWords({ claim: 'n' }, { n: { rows: [5] } }), '1 row');
  assert.equal(sheetFoundWords({ claim: 'n' }, { n: { totals: [] } }), '0 groups');
  assert.equal(sheetFoundLine(DAYS, CLAIMS), 'date checked — 2 rows');
  assert.equal(sheetFoundLine(DUP, CLAIMS), 'no duplicate Invoice # checked');
  for (const c of [DAYS, BANDS, DUP, { claim: 'str', op: 'lookup' }]) assert.equal(sheetFoundLine(c, CLAIMS).includes(PLANTED), false);
});

const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
const fnSrc = (/** @type {string} */ n) => { const i = PAGE.indexOf(`function ${n}(`); let d = 0; let j = PAGE.indexOf('{', i); for (let k = j; k < PAGE.length; k += 1) { if (PAGE[k] === '{') d += 1; else if (PAGE[k] === '}') { d -= 1; if (d === 0) return PAGE.slice(i, k + 1); } } return ''; };

test('Result tab page: a passed row draws its found words after the check; a row without any draws as before', () => {
  const draw = new Function(`${fnSrc('escapeXml')}\n${fnSrc('byTagOf')}\n${fnSrc('resultField')}\n${fnSrc('resultCheckRowsHtml')}\nreturn resultCheckRowsHtml;`)();
  const html = draw({ checkRows: [{ text: 'rows — rows where Amount > 500', by: 'you', result: 'passed', found: 'rows checked — 17 rows' }, { text: 'plain', by: 'default', result: 'passed' }], unclaimed: [] });
  assert.match(html, /rows checked — 17 rows/);
  assert.match(html, /data-result="passed"[^]*rows checked[^]*data-result="passed"[^]*plain/);
  assert.equal((html.match(/checked/g) ?? []).length, 1);
});
