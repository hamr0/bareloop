// MONEY BUILD v2 (docs/product/ITEM33-BUILD.md "Addendum 2026-10-21 — money build spec v2"): code SORTS the AI's currency forms into the right
// box (a sign is a currency, anything else a unit), then a $0 dry read asks "can it read": the REAL run-time checker (gradeStep) grades an
// honest claim on every result line of the page; a money fact that reads none goes to Not checked (`reads-no-result`).
// Real data only: F241 is the AI's REAL page-map reply and saved page of session smvh7bxou4win (sha256 pinned; fixtures copied from
// ~/.config/bareloop, read only), bos-den and airbnb-porto are REAL saved pages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPageRules } from '../src/pagerules.js';
import { parseMapAnswer } from '../src/pagemap.js';
import { dryReadMoney } from '../src/pagedry.js';
import { dropSentence } from '../src/pagedropwords.js';
import { loadFixture, JOBS } from './idea-a-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @param {string} rel @param {string} want @returns {string} */
function pinned(rel, want) {
  const buf = readFileSync(join(HERE, rel));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== want) throw new Error(`fixture ${rel} changed: sha256 ${got}, pinned ${want}`);
  return buf.toString('utf8');
}
const f241Page = pinned('fixtures/money/f241.page.txt', '328679f41f68d071b366cfd297254a1cd5bdd40e9bfa88167b46c5bdac5c220d');
const f241Reply = pinned('fixtures/money/f241.map-reply.json', '131fbe3578fdab02ffbbf4f2bb83c69afaeda54b665411b46ba67cee2d80b74e');
const bosDen = pinned('fixtures/fit/bos-den.txt', 'b6b8c6bfd2571a96cdc62f070e78140dd9924b3338859cf32702d4764c62c1e9');
const F241_JOBS = [{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: ['under $450; not a red-eye; nonstop', 'departure time between 05:00 and 21:59'] }];
const said = (/** @type {any[]} */ d) => d.map((x) => `${x.fact}|${x.word ?? '(fact)'}|${x.reason}`).sort();
const priceOf = (/** @type {any} */ r) => r.facts.find((/** @type {any} */ f) => f.shape === 'money');

test('F241 (real reply, real page): "US dollars" listed in currency is MOVED to the unit box, and the fact reads all 16 result lines', async () => {
  const parsed = parseMapAnswer(f241Reply);
  assert.ok(parsed.ok);
  const kept = applyPageRules(f241Page, /** @type {any} */ (parsed).mapping, F241_JOBS);
  const price = priceOf(kept);
  assert.ok(price, 'the price fact is kept');
  assert.ok(price.unit?.includes('US dollars'), `unit: ${JSON.stringify(price.unit)}`);
  assert.ok(!(price.currency ?? []).includes('US dollars'));
  assert.ok(!said(kept.dropped).some((s) => s.includes('currency-not-symbol')));
  const read = await dryReadMoney(f241Page, kept.facts);
  assert.equal(read.reads[price.name], 16, 'every result line reads');
  assert.deepEqual(read.dropped, []);
  assert.ok(priceOf({ facts: read.facts }), 'still signed');
});

test('fwd shape on a real Google Flights page (bos-den): "$" and "US dollars" both listed as currency, label "From" - the word goes to unit and every result reads', async () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From'], currency: ['$', 'US dollars'] }] };
  const kept = applyPageRules(bosDen, map, JOBS.flights);
  const price = priceOf(kept);
  assert.ok(price.unit?.includes('US dollars'), JSON.stringify(price));
  assert.ok(!(price.currency ?? []).includes('US dollars'));
  const read = await dryReadMoney(bosDen, kept.facts);
  const results = bosDen.split('\n').filter((l) => /From \d[\d,]* US dollars/.test(l)).length;
  assert.ok(results > 0);
  assert.equal(read.reads.price, results);
});

test('a sign listed in the UNIT box goes to currency (the box is position, not the AI\'s pick); a word listed in currency goes to unit', () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From'], unit: ['$'], currency: ['US dollars'] }] };
  const price = priceOf(applyPageRules(bosDen, map, JOBS.flights));
  assert.deepEqual(price.unit, ['US dollars']);
  assert.deepEqual(price.currency, ['$']);
});

test('a fact whose forms read no result line is dropped as `reads-no-result` and shows under Not checked', async () => {
  // "bags" is a real word on the page, but no result line writes a price as "<number> bags": the checker reads nothing
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From'], unit: ['bags'] }] };
  const kept = applyPageRules(bosDen, map, JOBS.flights);
  assert.ok(priceOf(kept), 'the page rules alone keep it');
  const read = await dryReadMoney(bosDen, kept.facts);
  assert.equal(priceOf({ facts: read.facts }), undefined);
  assert.deepEqual(said(read.dropped), ['price|(fact)|reads-no-result']);
  assert.equal(read.dropped[0].line, 1);
  assert.equal(dropSentence(read.dropped[0]), "the price rule could not read a price in the page's results, so it is not checked.");
});

test('Airbnb (real porto page): the no-label fact ("€222 total" - a number then a unit) is unchanged by the sort and reads its results', async () => {
  const fx = loadFixture('airbnb-porto');
  const kept = applyPageRules(fx.page, fx.map, JOBS.airbnb);
  assert.deepEqual(priceOf(kept).words, []);
  assert.deepEqual(priceOf(kept).unit, ['total']);
  assert.equal(priceOf(kept).currency, undefined, 'the golden: R1L drops the € behind the unit, as before');
  const read = await dryReadMoney(fx.page, kept.facts);
  assert.ok(read.reads.price > 0);
  assert.deepEqual(read.dropped, []);
  assert.equal(read.facts.length, kept.facts.length);
});

test('the dry read leaves non-money facts alone and never changes a kept money fact', async () => {
  const fx = loadFixture('sfo1');
  const kept = applyPageRules(fx.page, fx.map, JOBS.flights);
  const read = await dryReadMoney(fx.page, kept.facts);
  assert.deepEqual(read.facts, kept.facts);
});

test('runPageMap (the call site): the dry read runs after the page rules - F241\'s real reply keeps the price fact; a fact that reads nothing reaches `dropped` as reads-no-result and not `facts`', async () => {
  const { runPageMap } = await import('../src/pagemap.js');
  const { reply } = await import('./helpers.js');
  const go = (/** @type {string} */ page, /** @type {string} */ text, /** @type {any} */ jobs) => runPageMap({
    texts: { Flights: page }, inputs: [{ n: 1, label: 'Flights' }], jobLines: jobs, sleep: async () => {}, onCall: () => {},
    provider: { async generate() { return reply({ text, costUsd: 0.001 }); } },
  });
  const ok = await go(f241Page, f241Reply, F241_JOBS);
  const price = ok.facts.look.facts.find((/** @type {any} */ f) => f.name === 'price');
  assert.ok(price.unit.includes('US dollars'), JSON.stringify(price));
  assert.ok(!ok.facts.look.dropped.some((/** @type {any} */ d) => d.reason === 'reads-no-result'));
  const none = await go(bosDen, JSON.stringify({ facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From'], unit: ['bags'] }] }), JOBS.flights);
  assert.equal(none.facts.look.facts.find((/** @type {any} */ f) => f.name === 'price'), undefined);
  assert.deepEqual(none.facts.look.dropped.filter((/** @type {any} */ d) => d.reason === 'reads-no-result').map((/** @type {any} */ d) => [d.fact, d.source]), [['price', 'Flights']]);
});
