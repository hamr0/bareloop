// Addendum 2026-11-14 (c) piece 4: each row of a line gets its OWN pass or fail. Real code path: the check block builds the list and the stages, the REAL gradeStep (bareguard) grades a step file, and
// `rowResultsOf` maps bareguard's own gaps to rows. The step files are the real shapes (a good file, a fabricated quote, a changed value, a missing fact, a cut-off file, too many words, a number no quote holds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock } from '../src/checkblock.js';
import { gradeStep, sha256Of } from '../src/rubricstep.js';
import * as RR from '../src/rowresults.js';

const PAGE = 'Flights\nBoston Logan International Airport\nFrom $389 US dollars\nBoston Logan International Airport\nFrom $412 US dollars\n';
const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false });
b.fromJob([{ n: 1, text: 'List 2 flights', rules: ['under $450'] }, { n: 2, text: 'Say which is cheaper', rules: ['at most 20 words'] }]);
b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.', forRule: 1 }, { line: 1, name: 'airport', shape: 'phrase', source: 'flights', words: ['Boston Logan International Airport'] }], []);
const close = b.reconcile();
const LIST = b.signedRows();
const sha = sha256Of(PAGE);
const QUOTE = 'Boston Logan International Airport\nFrom $389 US dollars';

/** grade a step file of line `n` and read it as rows */
async function rows(/** @type {number} */ n, /** @type {any} */ obj, /** @type {any} */ extra = {}) {
  const st = close.stages.find((/** @type {any} */ s) => s.params.step === n);
  const bytes = typeof obj === 'string' ? obj : JSON.stringify(obj);
  const graded = await gradeStep({ params: st.params, bytes, outputBytes: bytes, inputs: { flights: PAGE }, ...extra }, { flights: sha });
  const res = RR.rowResultsOf(LIST, st.params, graded);
  return { graded, ...res, by: Object.fromEntries(res.rows.map((r) => [r.key, r.result])) };
}
const GOOD1 = { text: 'x', results: [{ quote: QUOTE, values: { price: '389' } }] };
const GOOD2 = { text: 'one two', cites: { flights: [{ claim: 'c', quote: 'From $389 US dollars' }] } };
const TIE = { factQuotes: { 1: ['From $389 US dollars'] } };

test('a good file: every row of the line passed, nothing unclaimed (the rows are the line\'s built rows)', async () => {
  const r = await rows(1, GOOD1);
  assert.equal(r.graded.verdict, 'green');
  assert.deepEqual(r.by, { 'L1.~1': 'passed', 'L1.$floor': 'passed', 'L1.fact.airport': 'passed' });
  assert.deepEqual(r.unclaimed, []);
  const t = await rows(2, GOOD2, TIE);
  assert.deepEqual(t.by, { 'L2.~1': 'passed', 'L2.$floor': 'passed', 'L2.$cited': 'passed', 'L2.$numbers': 'passed' });
});

test('a changed value fails ONLY the row that built that fact, with the plain reason; the other fact and the floor pass', async () => {
  const r = await rows(1, { ...GOOD1, results: [{ quote: QUOTE, values: { price: '999' } }] });
  assert.equal(r.graded.verdict, 'red');
  assert.deepEqual(r.by, { 'L1.~1': 'failed', 'L1.$floor': 'passed', 'L1.fact.airport': 'passed' });
  assert.match(String(r.rows.find((x) => x.key === 'L1.~1')?.why), /result 1, fact "price": the value is not what the quote holds/);
  assert.deepEqual(r.unclaimed, []);
});

test('a quote that does not say the other fact fails that fact\'s row alone', async () => {
  const r = await rows(1, { ...GOOD1, results: [{ quote: 'From $389 US dollars', values: { price: '389' } }] });
  assert.deepEqual(r.by, { 'L1.~1': 'passed', 'L1.$floor': 'passed', 'L1.fact.airport': 'failed' });
});

test('a fabricated quote is a quote-level gap with no fact index: it is NOT spread over the fact rows, it is returned unclaimed in plain words (line red, no row red)', async () => {
  const r = await rows(1, { ...GOOD1, results: [{ quote: 'invented words', values: { price: '389' } }] });
  assert.equal(r.graded.verdict, 'red');
  assert.deepEqual(r.by, { 'L1.~1': 'passed', 'L1.$floor': 'passed', 'L1.fact.airport': 'passed' });
  assert.equal(r.unclaimed.length, 1);
  assert.match(r.unclaimed[0], /result 1: the quote is not found word for word in "flights"/);
});

test('a cut-off file fails the floor row; the line\'s other rows were not looked at and read unread, never passed', async () => {
  const r = await rows(1, '{"results": [');
  assert.deepEqual(r.by, { 'L1.~1': 'unread', 'L1.$floor': 'failed', 'L1.fact.airport': 'unread' });
  assert.match(String(r.rows.find((x) => x.key === 'L1.$floor')?.why), /output\/steps\/1\.json/);
});

test('a text line: too many words fails the `~` rule row that carries the count; a made-up quote fails the cited row; a number no quote holds fails the numbers row', async () => {
  const words = await rows(2, { ...GOOD2, text: 'a b c d e f g h i j k l m n o p q r s t u v' }, TIE);
  assert.deepEqual(words.by, { 'L2.~1': 'failed', 'L2.$floor': 'passed', 'L2.$cited': 'passed', 'L2.$numbers': 'passed' });
  const cite = await rows(2, { ...GOOD2, cites: { flights: [{ claim: 'c', quote: 'made up' }] } }, TIE);
  assert.deepEqual(cite.by, { 'L2.~1': 'passed', 'L2.$floor': 'passed', 'L2.$cited': 'failed', 'L2.$numbers': 'passed' });
  const num = await rows(2, { ...GOOD2, text: 'costs 777 dollars' }, TIE);
  assert.deepEqual(num.by, { 'L2.~1': 'passed', 'L2.$floor': 'passed', 'L2.$cited': 'passed', 'L2.$numbers': 'failed' });
  assert.match(String(num.rows.find((x) => x.key === 'L2.$numbers')?.why), /777/);
});

test('every gap is claimed by one row or returned unclaimed: no gap vanishes (the verdict red always shows a red row or an unclaimed item)', async () => {
  for (const o of [{ ...GOOD1, results: [] }, { results: [{ quote: '', values: { price: '389' } }] }, { ...GOOD1, results: [{ quote: QUOTE, values: {} }] }]) {
    const r = await rows(1, o);
    assert.equal(r.graded.verdict, 'red');
    assert.ok(r.rows.some((x) => x.result === 'failed') || r.unclaimed.length > 0, JSON.stringify(o));
  }
});
