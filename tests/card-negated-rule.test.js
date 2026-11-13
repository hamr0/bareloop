// F-a (live drafts 2026-11-13, session smwelw0jrax5c): "~ nonstop is not mandatory" got the check `must say "Nonstop"`, the opposite of the rule. A `~` rule whose words carry a negation can never
// give a phrase bound; it is Not checked in plain words. A `!` row whose words are in that rule is refused alone, naming the rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftBlock } from './card-drafts-helper.js';

const phrases = (/** @type {any} */ block) => block.reconcile().parts.flatMap((/** @type {any} */ p) => p.facts ?? []).filter((/** @type {any} */ f) => f.shape === 'phrase').map((/** @type {any} */ f) => f.phrase);

test('draft B: the negated rule builds no "must say Nonstop"; it is Not checked: it says what is not needed', async () => {
  const { block } = await draftBlock('B');
  assert.ok(!phrases(block).some((p) => /nonstop/i.test(p)), `a phrase from the negated rule was built: ${JSON.stringify(phrases(block))}`);
  const rule = block.rows.find((r) => r.key === 'L1.~3');
  assert.equal(rule.state, 'not-checked');
  assert.equal(rule.reason, 'it says what is not needed, so there is nothing to check');
});

test('draft B: an untied look fact (the `!` row "stops": Nonstop) is refused alone, naming the rule; the other rows stand', async () => {
  // the look's fact reaches the list as a `!` row (not tied to the rule): the way a look fact with no rule number arrives
  const { block } = await draftBlock('B', { untie: 'stops' });
  const row = block.rows.find((r) => r.key === 'L1.fact.stops');
  assert.equal(row.state, 'not-checked');
  assert.match(row.reason, /your rule 3 says it is not needed/);
  assert.equal(block.rows.find((r) => r.key === 'L1.~1').state, 'built');
  assert.ok(!phrases(block).some((p) => /nonstop/i.test(p)));
});

test('draft A (no rule 3): a Nonstop phrase is not refused for negation', async () => {
  const { block } = await draftBlock('A');
  const row = block.rows.find((r) => r.key === 'L1.phrase.nonstop');
  assert.ok(row, 'draft A has the ledger phrase Nonstop');
  assert.doesNotMatch(String(row.reason), /not needed/);
});
