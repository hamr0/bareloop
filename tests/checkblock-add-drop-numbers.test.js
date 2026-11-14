// Add a Suggested fact on a fact-free line, then Drop it: a later text line's `$numbers` default must not stay "built" with no fact line behind it (found by reading, at fwd's Add-then-Drop question).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock } from '../src/checkblock.js';

const page = readFileSync(new URL('./fixtures/card-drafts/flights-A.txt', import.meta.url), 'utf8');
const mk = () => {
  const b = new CheckBlock({ texts: { flights: page }, labels: ['flights'], split: true });
  b.fromJob([{ n: 1, text: 'Open the flights page', rules: [] }, { n: 3, text: 'Check the flights', rules: [] }, { n: 5, text: 'Write a short summary', rules: [] }, { n: 7, text: 'Write a closing note', rules: [] }]);
  b.addLook([], []); b.reconcile();
  b.applyDelta({ label: 'pre:ledger-suggest', pre: true, edits: [{ op: 'add', kind: 'phrase', line: 3, name: 'Nonstop', words: ['Nonstop'], source: 'flights' }] });
  b.reconcile();
  return b;
};
const row = (/** @type {any} */ b, /** @type {string} */ k) => b.rows.find((/** @type {any} */ r) => r.key === k);
const view = (/** @type {any} */ b) => ({ rows: ['L5.$numbers', 'L7.$numbers'].map((k) => { const r = row(b, k); return r && { k, state: r.state, reason: r.reason, part: r.part }; }), card: b.card().filter((/** @type {any} */ c) => /\$numbers/.test(c.key)).map((/** @type {any} */ c) => `${c.key}|${c.state}`), stageParts: b.reconcile().parts.filter((/** @type {any} */ p) => p.check === 'numbersFromFacts').length, signed: b.signedRows().filter((/** @type {any} */ r) => r.kind === 'numbers').map((/** @type {any} */ r) => `${r.key}|${r.state}|${JSON.stringify(r.part)}`) });

test('Add builds the later lines\' $numbers; Drop leaves them Not checked, with no part, no stage part and no built signed row (reset in buildLine, src/checkblock.js:366)', () => {
  const b = mk();
  assert.equal(b.rowChoice('L3.phrase.nonstop', 'add').ok, true);
  let v = view(b);
  assert.deepEqual(v.rows.map((r) => r && r.state), ['built', 'built']);
  assert.equal(v.stageParts, 2);
  assert.equal(b.rowChoice('L3.phrase.nonstop', 'drop').ok, true);
  v = view(b);
  assert.deepEqual(v.rows.map((r) => r && [r.state, r.part]), [['not-checked', null], ['not-checked', null]]);
  assert.deepEqual(v.card, ['L5.$numbers|not-checked', 'L7.$numbers|not-checked']);
  assert.equal(v.stageParts, 0, 'no numbersFromFacts part is in the close');
  assert.deepEqual(v.signed, ['L5.$numbers|not-checked|undefined', 'L7.$numbers|not-checked|undefined']);
});
