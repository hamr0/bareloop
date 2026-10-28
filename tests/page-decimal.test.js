// The decimal mark of a money fact is picked by CODE from how the page writes the amounts the fact's signs touch (hamr, 2026-10-27, live Dell drafting:
// the page-map AI named no decimal on "1.058,47 €" and the fact was dropped as unreadable). Dell lines are copied from the real capture
// (tests/fixtures/pageforms/dell-de.txt). All $0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPageRules } from '../src/pagerules.js';
import { dryReadMoney } from '../src/pagedry.js';
import { dropSentence } from '../src/pagedropwords.js';

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

// ── a price form that reads no amount is dropped BEFORE R1L (hamr, 2026-10-27, session smvqxvtrl36vc: unit "ohne MwSt." sits alone on its own line) ──
test('reads-no-amount: Dell\'s exact AI fact (unit "ohne MwSt.") keeps "€", drops "ohne MwSt." by name, and dry-reads its prices', async () => {
  const r = run(dell, fact({ unit: ['ohne MwSt.'], lang: 'de', decimal: ',' }));
  assert.equal(r.facts.length, 1);
  assert.deepEqual([...(r.facts[0].unit ?? []), ...(r.facts[0].currency ?? [])], ['€'], 'the page writes "1.058,47 €" (spaced), so "€" is kept, filed as the unit');
  const d = r.dropped.filter((x) => x.word === 'ohne MwSt.');
  assert.deepEqual(d.map((x) => x.reason), ['reads-no-amount']);
  assert.match(dropSentence(d[0]), /never shows an amount next to "ohne MwSt\."/);
  const dry = await dryReadMoney(dell, r.facts);
  assert.deepEqual(dry.dropped, []);
});

test('reads-no-amount: a unit that DOES read ("490 total") is unchanged, and when no form reads anything nothing is dropped by this rule', () => {
  const page = '  - StaticText "Preis" [ref=1]\n  - StaticText "490 total" [ref=2]\n  - StaticText "Preis" [ref=3]\n  - StaticText "12 total" [ref=4]';
  const r = run(page, fact({ words: ['Preis'], currency: [], unit: ['total'] }));
  assert.deepEqual(r.facts[0].unit, ['total']);
  assert.ok(!r.dropped.some((x) => x.reason === 'reads-no-amount'));
  const none = run('  - StaticText "Preis" [ref=1]\n  - StaticText "ohne MwSt." [ref=2]', fact({ words: ['Preis'], currency: [], unit: ['ohne MwSt.'] }));
  assert.ok(!none.dropped.some((x) => x.reason === 'reads-no-amount'));
});
