// ReDoS guard (/branch-review at 383fea3): pageDecimal's "number before a sign" read and the comma-decimal page check were quadratic on a long
// run of digits / digit groups, and drafting runs on one event loop. Each test drives applyPageRules with one hostile line; the bound is 20x
// the fixed time on this machine and far under the old time (40,000 digits ~2 s, 80,000 groups ~2 s). All $0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPageRules } from '../src/pagerules.js';

const BOUND_MS = 500;
const jobLines = [{ n: 1, text: 'List every laptop on the page with its price.', rules: ['price is under 1500 euros'] }];
const fact = (/** @type {any} */ extra = {}) => ({ name: 'price label', from: 'line 1', shape: 'money', words: ['Preis'], currency: ['€'], unit: [], reading: { op: 'lt', value: 1500 }, ...extra });
const timed = (/** @type {string} */ text, /** @type {any} */ f) => {
  const t0 = performance.now();
  const r = applyPageRules(text, { facts: [f] }, jobLines);
  return { ms: performance.now() - t0, r };
};

test('redos: a 40,000-digit run before a sign is read in linear time (pageDecimal, number before)', () => {
  const { ms } = timed('Preis ' + '1'.repeat(40000) + 'x€', fact());
  assert.ok(ms < BOUND_MS, `took ${Math.round(ms)} ms`);
});

test('redos: a 40,000-mark run inside the number after a sign is read in linear time (pageDecimal, trailing marks)', () => {
  const { ms } = timed('Preis €1' + '.'.repeat(40000) + '1', fact());
  assert.ok(ms < BOUND_MS, `took ${Math.round(ms)} ms`);
});

test('redos: 20,000 digit groups with no comma-decimal amount are checked in linear time (COMMA_DECIMAL)', () => {
  const { ms, r } = timed('Preis € ' + ' 111'.repeat(20000), fact({ decimal: ',' }));
  assert.ok(ms < BOUND_MS, `took ${Math.round(ms)} ms`);
  assert.deepEqual(r.dropped.map((d) => d.reason), ['decimal-not-on-page']);
});

test('redos: a comma-decimal amount after a long run of groups is still found', () => {
  const { r } = timed('Preis € ' + ' 111'.repeat(20000) + ' 1.234,56 €', fact({ decimal: ',' }));
  assert.ok(!r.dropped.some((d) => d.reason === 'decimal-not-on-page'));
});
