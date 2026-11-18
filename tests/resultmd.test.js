// MD1 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-18 (c)"): `renderStepMd`, the plain-text file written beside a delivered step file. Cases ported from fwdloop v0.35.1
// test/m15-send-md.test.js (renderSentMd), re-pointed at bareloop's step-file shapes (FACTS / SHEET / TEXT), plus a replay over real archived step files kept under tests/fixtures/resultmd.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStepMd, stepClaimWords } from '../src/resultmd.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'resultmd');
const readJson = (f) => JSON.parse(readFileSync(join(FX, f), 'utf8'));
const NO_MARKS = (s) => assert.ok(!/[{}[\]✓✗]/.test(s.replace(/from the page: ".*"$/gm, '').replace(/^.*(?:computed by code).*$/gm, '')), `no JSON braces or check marks in: ${s}`);

const FLIGHTS = {
  results: [
    { quote: 'Q1 words', values: { price: '$120', airline: 'Acme', departure: '08:00' } },
    { quote: 'Q2 words', values: { price: '$99', airline: 'Bolt', departure: '09:30' } },
  ],
};

test('TEXT line: {text} alone is the text exactly, no JSON, no check marks; cites are not written', () => {
  const text = '- one\n- two\n\n  "quoted" {braces} ok';
  assert.equal(renderStepMd({ text }), text);
  assert.equal(renderStepMd({ text, cites: [{ quote: 'q', line: 3 }] }), text);
  for (const t of ['', 'a\nb', '{"x":1} ✓ expenseTotal.value: 1']) assert.equal(renderStepMd({ text: t }), t);
});

test('nothing writable is null: not an object, no text and no results', () => {
  for (const v of [null, undefined, 'x', 3, [], {}, { cites: [] }, { claims: { a: { value: 1 } } }, { results: [] }]) assert.equal(renderStepMd(/** @type {any} */ (v)), null);
});

test('FACTS line: one "## Result k" block per result, values in order, then the quote as a last line, byte for byte', () => {
  const got = renderStepMd(FLIGHTS);
  assert.equal(got, '## Result 1\nPrice: $120\nAirline: Acme\nDeparture: 08:00\nfrom the page: "Q1 words"\n\n## Result 2\nPrice: $99\nAirline: Bolt\nDeparture: 09:30\nfrom the page: "Q2 words"');
  NO_MARKS(got);
  const quote = 'From 39 US dollars.\nSelect "flight" {x} \\ ✓';
  assert.equal(renderStepMd({ results: [{ quote, values: { price: 39 } }, { quote: 'two', values: { price: 40 } }] }),
    `## Result 1\nPrice: 39\nfrom the page: "${quote}"\n\n## Result 2\nPrice: 40\nfrom the page: "two"`);
});

test('names as words: a label with a space, camelCase, nested value/rows dropped, ID stays one word', () => {
  assert.equal(renderStepMd({ results: [{ quote: 'q', values: { 'departure time': '12:12 PM', expenseTotal: { value: 12719.59 }, ID: 'x', user_name: 'a', 'first-seen': 'b' } }] }),
    '## Result 1\nDeparture time: 12:12 PM\nExpense total: 12719.59\nId: x\nUser name: a\nFirst seen: b\nfrom the page: "q"');
  assert.equal(renderStepMd({ results: [{ quote: 'q', values: { expenseRows: { rows: [3, 6, 9] } } }] }), '## Result 1\nExpense rows: 3, 6, 9\nfrom the page: "q"');
});

test('two lines with the same words both keep the a.b form, judged per block', () => {
  const got = renderStepMd({ results: [{ quote: 'q', values: { a: { value: 1 }, A: 2 } }, { quote: 'q', values: { a: { value: 1 } } }] });
  assert.equal(got, '## Result 1\na.value: 1\nA: 2\nfrom the page: "q"\n\n## Result 2\nA: 1\nfrom the page: "q"');
});

test('a file with text AND results writes the text, a blank line, then the blocks', () => {
  assert.equal(renderStepMd({ results: FLIGHTS.results.slice(0, 1), text: 'My answer.' }), 'My answer.\n\n## Result 1\nPrice: $120\nAirline: Acme\nDeparture: 08:00\nfrom the page: "Q1 words"');
});

test('SHEET line: the text, a blank line, then every claim named with the check sentence, never the rule id', () => {
  const obj = readJson('expenses.step.json');
  const got = renderStepMd(obj, stepClaimWords(readJson('expenses.closeDecl.json'), 1));
  assert.equal(got, `${obj.text}\n\nRows where Amount > 500: ${obj.claims.l1r1.rows.join(', ')}`);
  assert.ok(!/l1r1/.test(got), 'no rule id');
  assert.ok(!/[{}[\]]/.test(got.slice(obj.text.length)), 'no JSON in the claim part');
  assert.ok(got.startsWith('18 expenses have an Amount over 500;'));
});

test('SHEET line, maps and values: a days / bands map writes one line per row, a value claim one line', () => {
  const obj = readJson('aging.step.json');
  const words = stepClaimWords(readJson('aging.closeDecl.json'), 1);
  const lines = renderStepMd(obj, words).slice(obj.text.length + 2).split('\n');
  assert.ok(!lines.some((l) => /l1r\d/.test(l)), 'no rule id on any line');
  assert.equal(lines.length, 8 + 1 + 8, '8 days rows, one value, 8 band rows');
  assert.match(lines[0], /^Days since Due.*, row 2: 269$/);
  assert.match(lines[8], /: 8$/);
  assert.match(lines[16], /, row 9: 31-60$/);
});

test('a claim id no check carries keeps fwd\'s friendlyName of the key', () => {
  assert.equal(renderStepMd({ text: 'T', claims: { expenseTotal: { value: 5 }, odd_rows: { rows: [1, 2] } } }, {}), 'T\n\nExpense total: 5\nOdd rows: 1, 2');
  assert.equal(renderStepMd({ text: 'T', claims: { expenseTotal: { value: 5 } } }), 'T\n\nExpense total: 5');
});

test('stepClaimWords: the FIRST check of the step that carries a claim id names it; other steps do not leak in', () => {
  const w = stepClaimWords(readJson('expenses.closeDecl.json'), 1);
  assert.deepEqual(w, { l1r1: 'rows where Amount > 500' });
  assert.deepEqual(stepClaimWords(readJson('expenses.closeDecl.json'), 2), {});
  assert.deepEqual(stepClaimWords(null, 1), {});
});

test('replay over every real archived step file: no value lost or changed, no braces or marks', () => {
  // facts file (real worker output, run mve5y8fa)
  const flights = readJson('flights.step.json');
  const got = renderStepMd(flights);
  for (const r of flights.results) {
    assert.ok(got.includes(`from the page: "${r.quote}"`), 'quote byte-exact');
    for (const v of Object.values(r.values)) assert.ok(got.includes(`: ${v}\n`), `value ${v} kept`);
  }
  assert.deepEqual(got.match(/^## Result \d+$/gm), flights.results.map((_, i) => `## Result ${i + 1}`));
  // sheet files: the delivered text is kept exactly, every named row is kept in order
  for (const n of ['expenses', 'aging']) {
    const obj = readJson(`${n}.step.json`);
    const md = renderStepMd(obj, stepClaimWords(readJson(`${n}.closeDecl.json`), 1));
    assert.ok(md.startsWith(obj.text), `${n}: text first, exactly`);
    NO_MARKS(md.slice(obj.text.length));
  }
  const exp = readJson('expenses.step.json');
  assert.ok(renderStepMd(exp, stepClaimWords(readJson('expenses.closeDecl.json'), 1)).endsWith(exp.claims.l1r1.rows.join(', ')), 'rows in the order the worker wrote them');
});

test('every value is present, in order, none changed (fwd am2 (5), ported)', () => {
  const content = { results: [{ quote: 'q1', values: { price: 5, tags: ['a', 'b'], seatMap: { rows: [1, 2] }, gone: null } }] };
  const lines = renderStepMd(content).split('\n').filter((l) => !l.startsWith('## ') && !l.startsWith('from the page'));
  assert.deepEqual(lines.map((l) => l.replace(/^[^:]*: ?/, '')), ['5', 'a, b', '1, 2', '']);
});
