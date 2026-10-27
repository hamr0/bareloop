// The decimal mark of a money fact is picked by CODE from how the page writes the amounts the fact's signs touch (hamr, 2026-10-27, live Dell drafting:
// the page-map AI named no decimal on "1.058,47 €" and the fact was dropped as unreadable). Dell lines are copied from the real capture
// (tests/fixtures/pageforms/dell-de.txt). All $0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPageRules } from '../src/pagerules.js';
import { dryReadMoney } from '../src/pagedry.js';

const dell = readFileSync(new URL('./fixtures/pageforms/dell-de.txt', import.meta.url), 'utf8');
const jobLines = [{ n: 1, text: 'List every laptop on the page with its name and price.', rules: ['price is under 1500 euros'] }];
const fact = (/** @type {any} */ extra = {}) => ({ name: 'price label', from: 'line 1', shape: 'money', words: ['Preis', 'AB'], currency: ['€'], unit: [], reading: { op: 'lt', value: 1500 }, ...extra });
const run = (/** @type {string} */ text, /** @type {any} */ f) => applyPageRules(text, { facts: [f] }, jobLines);
const lines = (/** @type {string[]} */ prices) => '  - StaticText "Preis" [ref=3]\n' + prices.map((p) => `  - StaticText "AB" [ref=1]\n  - StaticText "${p}" [ref=2]`).join('\n');

test('decimal: Dell\'s exact AI fact (no decimal) is kept with decimal "," and dry-reads its prices', async () => {
  const r = run(dell, fact());
  assert.deepEqual(r.dropped.filter((d) => d.reason !== 'r1' && d.reason !== 'no-value'), []);
  assert.equal(r.facts.length, 1);
  assert.equal(r.facts[0].decimal, ',');
  const d = await dryReadMoney(dell, r.facts);
  assert.deepEqual(d.dropped, []);
});

test('decimal: an AI "." on a clear-comma page is overridden to ","', () => {
  assert.equal(run(dell, fact({ decimal: '.' })).facts[0].decimal, ',');
});

test('decimal: only ambiguous 3-digit amounts ("1,299", "1.299") keep what the AI signed', () => {
  const t = lines(['1,299 €', '2.499 €']);
  assert.equal(run(t, fact()).facts[0].decimal, undefined);
  assert.equal(run(t, fact({ decimal: '.' })).facts[0].decimal, '.');
});

test('decimal: a page mixing clear comma and clear dot amounts keeps what the AI signed', () => {
  const t = lines(['1.058,47 €', '29.99 €']);
  assert.equal(run(t, fact()).facts[0].decimal, undefined);
  assert.equal(run(t, fact({ decimal: '.' })).facts[0].decimal, '.');
});

test('decimal: a clear-dot page is unchanged', () => {
  const t = lines(['€29.99', '€1,058.47']);
  assert.equal(run(t, fact()).facts[0].decimal, undefined);
  assert.equal(run(t, fact({ decimal: '.' })).facts[0].decimal, '.');
});
