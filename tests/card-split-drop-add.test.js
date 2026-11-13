// N-1 / N-2 (hamr ruling 2026-11-13, live drafts smwelq2l6srdb = A and smwelw0jrax5c = B): code splits the `!` rows into job-derived (built, Drop) and suggested (held out, Add), only ever offering what code
// has already proved it can build; Drop and Add are row edits through the block ($0, no AI), every one reconciled, and a Revise keeps them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftBlock } from './card-drafts-helper.js';
import { CheckBlock } from '../src/checkblock.js';

const row = (/** @type {any} */ b, /** @type {string} */ key) => b.rows.find((/** @type {any} */ r) => r.key === key);
const facts = (/** @type {any} */ b) => b.reconcile().parts.flatMap((/** @type {any} */ p) => p.facts ?? []);

test('A: origin, destination and the count are in the job (built, [agent]); Nonstop is not, so it is Suggested with code\'s own sentence and is not in the close', async () => {
  const { block } = await draftBlock('A');
  for (const k of ['L1.fact.origin', 'L1.fact.destination', 'L1.count.3-3']) { assert.equal(row(block, k).state, 'built', k); assert.equal(row(block, k).by, 'agent'); }
  const n = row(block, 'L1.phrase.nonstop');
  assert.equal(n.state, 'suggested');
  assert.deepEqual(block.suggestedView().map((x) => x.key), ['L1.phrase.nonstop']);
  assert.match(block.suggestedView()[0].text, /must say "Nonstop"/);
  assert.ok(!facts(block).some((f) => f.phrase === 'Nonstop'), 'a suggestion is not checked');
});

test('B: Nonstop is in the job (rule 3) but negated, so it is refused; the suggestion code cannot build ("12 results returned.") is hidden, never on the card, and is one plain Audit sentence', async () => {
  const { block } = await draftBlock('B');
  assert.deepEqual(block.suggestedView(), []);
  const bad = row(block, 'L1.phrase.12 results returned.');
  assert.equal(bad.hidden, true);
  assert.ok(!block.card().some((c) => /12 results/.test(c.text)), 'not on the card');
  const sentence = block.unbuiltSuggestions().map((x) => x.text).join('\n');
  assert.match(sentence, /A suggested check was not built \(phrase "12 results returned\."\)/);
  assert.doesNotMatch(sentence, /Nothing was signed|code could not build/);
  // the person's own rule 3 still shows, as Not checked with the plain reason
  assert.equal(row(block, 'L1.~3').state, 'not-checked');
  assert.ok(block.card().some((c) => c.key === 'L1.~3' && c.state === 'not-checked'));
});

test('every row offered under Suggested builds on Add (a row that did not would be a defect)', async () => {
  const { block } = await draftBlock('A', { extra: [{ op: 'add', kind: 'phrase', line: 1, name: 'Nonstop', words: ['Nonstop'], source: 'flights' }, { op: 'add', kind: 'phrase', line: 1, name: 'American', words: ['American'], source: 'flights' }, { op: 'add', kind: 'count', line: 1, min: 3, max: 3 }] });
  const offered = block.suggestedView();
  assert.ok(offered.length >= 2, JSON.stringify(offered));
  for (const o of offered) { assert.deepEqual(block.rowChoice(o.key, 'add'), { ok: true }, o.key); assert.equal(row(block, o.key).state, 'built', o.key); }
});

test('Drop removes a job-derived row; Add switches a suggestion on; both go through reconcile; the close and the signed rows follow', async () => {
  const { block } = await draftBlock('A');
  assert.deepEqual(block.rowChoice('L1.fact.origin', 'drop'), { ok: true });
  assert.equal(row(block, 'L1.fact.origin').state, 'suggested');
  assert.ok(!facts(block).some((f) => f.name === 'origin'));
  assert.deepEqual(block.rowChoice('L1.phrase.nonstop', 'add'), { ok: true });
  assert.equal(row(block, 'L1.phrase.nonstop').state, 'built');
  assert.ok(facts(block).some((f) => f.phrase === 'Nonstop'));
  assert.deepEqual(block.suggestedView().map((x) => x.key), ['L1.fact.origin'], 'the dropped row waits under Suggested (live draft 3)');
  const signed = block.signedRows();
  assert.equal(signed.find((r) => r.key === 'L1.fact.origin')?.state, 'dropped');
  assert.equal(signed.find((r) => r.key === 'L1.phrase.nonstop')?.state, 'built');
  assert.deepEqual(signed.find((r) => r.key === 'L1.phrase.nonstop')?.facts, ['Nonstop']);
});

test('refusals in plain words: an unknown row, a [you] row, a default row, a drop of what is not on the card, an add of what is not offered', async () => {
  const { block } = await draftBlock('A');
  assert.deepEqual(block.rowChoice('L9.nothing', 'drop'), { ok: false, why: 'there is no such check on the list' });
  assert.match(String(/** @type {any} */ (block.rowChoice('L1.~1', 'drop')).why), /comes from a rule you wrote/);
  assert.match(String(/** @type {any} */ (block.rowChoice('L1.$cited', 'drop')).why), /code's own/);
  assert.match(String(/** @type {any} */ (block.rowChoice('L1.phrase.nonstop', 'drop')).why), /only a check that is on the card/);
  assert.match(String(/** @type {any} */ (block.rowChoice('L1.fact.origin', 'add')).why), /only a suggested check/);
  assert.equal(block.rows.some((r) => r.choice), false, 'a refusal changes nothing');
});

test('Revise keeps the choices (same line words, same row), and code still judges them', async () => {
  const a = await draftBlock('A');
  a.block.rowChoice('L1.fact.origin', 'drop'); a.block.rowChoice('L1.phrase.nonstop', 'add');
  const rec = JSON.parse(JSON.stringify(a.block.choicesRecord()));
  assert.equal(rec.length, 2);
  const again = await draftBlock('A');
  again.block.carryChoices(rec); again.block.reconcile();
  assert.equal(row(again.block, 'L1.fact.origin').state, 'suggested');
  assert.equal(row(again.block, 'L1.phrase.nonstop').state, 'built');
  // an Add carried onto a draft where the row no longer exists is simply not applied
  const b = await draftBlock('B');
  b.block.carryChoices(rec); b.block.reconcile();
  assert.equal(row(b.block, 'L1.phrase.nonstop'), undefined);
});

test('with split off (an older caller) every `!` row is built as before', async () => {
  const { block } = await draftBlock('A', { split: false });
  assert.equal(row(block, 'L1.phrase.nonstop').state, 'built');
  assert.deepEqual(block.suggestedView(), []);
  assert.ok(block instanceof CheckBlock);
});
