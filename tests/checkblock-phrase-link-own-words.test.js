// Live run mwi76vh8 (draft session smwi75mbqjjbs): the look tied the phrase "Select flight" to the rule "be friendly"; it was on the page, so the rule was signed as a check.
// 2026-11-17 (piece 0): the code guard that made such a link count only when the rule's own words named it is withdrawn (hamr: no code word lists for intent); the look prompt (F201) now carries it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock } from '../src/checkblock.js';

const PAGE = readFileSync(new URL('./fixtures/phrase-link/flights.txt', import.meta.url), 'utf8');
function ruleRow(/** @type {string} */ rule, /** @type {string} */ phrase) {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false });
  b.fromJob([{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: [rule] }]);
  b.addLook([{ line: 1, name: 'f', shape: 'phrase', source: 'flights', words: [phrase], forRule: 1 }]);
  b.reconcile();
  return b.rows.find((r) => r.kind === 'rule');
}

test('withdrawn 2026-11-17 (piece 0): the code carve-out is gone; "be friendly" with a look phrase "Select flight" links to the rule row as before 2026-11-15 (the F201 prompt is what keeps the tie from being made; a person still sees it on the card)', () => {
  assert.ok(PAGE.includes('Select flight'));
  const r = ruleRow('be friendly', 'Select flight');
  assert.equal(r?.links?.length, 1);
  assert.equal(r?.links?.[0].name, 'f');
});

test('the tied phrase is a link on the rule, never a second ! [agent] row', () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false, split: true });
  b.fromJob([{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: ['be friendly'] }]);
  b.addLook([{ line: 1, name: 'friendly', shape: 'phrase', source: 'flights', words: ['Select flight'], forRule: 1 }]);
  b.reconcile();
  assert.equal(b.rows.some((x) => x.key === 'L1.fact.friendly'), false);
  assert.equal(b.rows.find((x) => x.kind === 'rule')?.links?.[0].name, 'friendly');
});

test('a phrase the rule names in the person\'s own words still builds (case-blind)', () => {
  const r = ruleRow('must say select flight', 'Select flight');
  assert.equal(r?.state, 'built');
  assert.equal(r?.can?.how, 'fact');
});
