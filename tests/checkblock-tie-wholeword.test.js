// A look phrase ties a `~` rule only when its word is a WHOLE word of the rule: "Fri" is no part of "be friendly please".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock } from '../src/checkblock.js';

const PAGE = 'Flights\nFri 12 Dec  Boston to Chicago\nNonstop 3h 10m\n';
function build(/** @type {string} */ rule, /** @type {string} */ word) {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false, split: true });
  b.fromJob([{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: [rule] }]);
  b.addLook([{ line: 1, name: 'x', shape: 'phrase', source: 'flights', words: [word], forRule: 1 }]);
  b.reconcile();
  return b;
}

test('"Fri" does not tie "be friendly please": no link on the ~ rule, the fact is an ordinary ! row', () => {
  const b = build('be friendly please', 'Fri');
  const rule = b.rows.find((r) => r.kind === 'rule');
  assert.equal(rule?.links?.length ?? 0, 0);
  assert.equal(rule?.state, 'not-checked');
  const bang = b.rows.find((r) => r.key === 'L1.fact.x');
  assert.equal(bang?.by, 'agent');
});

test('a whole word of the rule still ties', () => {
  const b = build('must mention Nonstop', 'Nonstop');
  const rule = b.rows.find((r) => r.kind === 'rule');
  assert.deepEqual(rule?.links?.[0]?.words, ['Nonstop']);
  assert.equal(b.rows.find((r) => r.key === 'L1.fact.x'), undefined);
});
