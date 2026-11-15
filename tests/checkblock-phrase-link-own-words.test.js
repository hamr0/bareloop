// Live run mwi76vh8 (draft session smwi75mbqjjbs): the look tied the phrase "Select flight" to the rule "be friendly"; it was on the page, so the rule was signed as a check.
// A phrase or place link counts only when the person's own rule words name it; else the rule is Not checked.
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

test('"be friendly" with a look phrase "Select flight" is Not checked, never a signed phrase check', () => {
  assert.ok(PAGE.includes('Select flight'));
  const r = ruleRow('be friendly', 'Select flight');
  assert.equal(r?.state, 'not-checked');
  assert.equal(r?.can?.ok, false);
});

test('the unnamed phrase is not thrown away: it is an ordinary ! [agent] row, placed by the existing split/inJob path (here job-derived, because the AI named the fact "friendly", a word of the rule)', () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false, split: true });
  b.fromJob([{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: ['be friendly'] }]);
  b.addLook([{ line: 1, name: 'friendly', shape: 'phrase', source: 'flights', words: ['Select flight'], forRule: 1 }]);
  b.reconcile();
  assert.equal(b.rows.find((x) => x.kind === 'rule')?.state, 'not-checked');
  const bang = b.rows.find((x) => x.key === 'L1.fact.friendly');
  assert.equal(bang?.by, 'agent');
  assert.equal(bang?.derived, true);
});

test('a phrase the rule names in the person\'s own words still builds (case-blind)', () => {
  const r = ruleRow('must say select flight', 'Select flight');
  assert.equal(r?.state, 'built');
  assert.equal(r?.can?.how, 'fact');
});
