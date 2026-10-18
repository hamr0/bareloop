// IDEA A CORE items 2-6 (docs/product/ITEM33-BUILD.md "Addendum 2026-10-18 — Idea A core: build spec", sections 3, 7, 8): the plain code rules
// that keep or drop each word of the AI's page-word map (src/pagerules.js). Every page is a REAL barebrowse capture and every map the AI's
// REAL saved answer (tests/fixtures/idea-a, sha256-pinned); a mapping built here changes ONE thing in a real map and says so. All $0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPageRules, tieOf } from '../src/pagerules.js';
import { loadFixture, JOBS } from './idea-a-fixtures.js';

const sfo = loadFixture('sfo1');
/** @param {any} map @param {string} name */
const factOf = (map, name) => map.facts.find((/** @type {any} */ f) => f.name === name);
/** the dropped entries as `fact|word|reason` strings, to read at a glance */
const said = (/** @type {any[]} */ d) => d.map((x) => `${x.fact}|${x.word ?? '(fact)'}|${x.reason}`).sort();

// ── item 2: found-on-page ────────────────────────────────────────────────────────────────────────────────────────────────────

test('found-on-page: a word the AI named that is NOT written on the page is dropped, named, and a word that is written is kept', () => {
  const map = { facts: [{ name: 'origin', from: 'line 1', shape: 'place', words: ['San Francisco', 'Boston Logan Airport', 'SFO'] }] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts[0].words, ['San Francisco', 'SFO']);
  assert.deepEqual(said(r.dropped), ['origin|Boston Logan Airport|not-on-page']);
  assert.equal(r.dropped[0].line, 1);
});

test('found-on-page: a place is matched exactly (case counts); a phrase as whole words, case and spacing aside', () => {
  const map = { facts: [
    { name: 'origin', from: 'line 1', shape: 'place', words: ['san francisco'] },
    { name: 'stops', from: 'rule 3', shape: 'phrase', words: ['nonstop', 'Nonstopper'] },
  ] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts.map((f) => [f.name, f.words]), [['stops', ['nonstop']]], 'the lower-case place is not written on the page');
  assert.deepEqual(said(r.dropped), ['origin|(fact)|no-label', 'origin|san francisco|not-on-page', 'stops|Nonstopper|not-on-page']);
});

test('found-on-page: a money fact keeps the labels, currency signs and units the page holds; a code like "EUR" read as a currency is dropped as not a sign', () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From', 'Total price'], currency: ['$', '€', 'US dollars'], unit: ['US dollars', 'zorkmids'] }] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  const f = r.facts[0];
  assert.deepEqual(f.words, ['From']);
  assert.deepEqual(f.currency, ['$']);
  assert.deepEqual(f.unit, ['US dollars']);
  assert.deepEqual(said(r.dropped), ['price|Total price|not-on-page', 'price|US dollars|currency-not-symbol', 'price|zorkmids|not-on-page', 'price|€|not-on-page'].sort());
});

test('found-on-page: a fact with NO word the page holds is not kept and says so once, as a fact-level drop (no word)', () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['Gesamtpreis'], currency: ['$'] }, { name: 'tail', from: 'line 1', shape: 'phrase', words: ['xyzzy'] }] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts, []);
  assert.deepEqual(said(r.dropped), ['price|(fact)|no-label', 'price|Gesamtpreis|not-on-page', 'tail|(fact)|no-label', 'tail|xyzzy|not-on-page']);
});

test('found-on-page: a money fact whose page holds no currency sign and no unit is not kept; a shape the map may not use is dropped by name', () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From'], currency: ['€'] }, { name: 'colour', from: 'line 1', shape: 'colour', words: ['red'] }] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts, []);
  assert.deepEqual(said(r.dropped), ['colour|(fact)|bad-shape', 'price|(fact)|no-label', 'price|€|not-on-page']);
});

test('tieOf: a fact is tied to its job line and `~` rule from the map\'s own `from` words', () => {
  const lines = [{ n: 1, text: 'a', rules: ['r1'] }, { n: 2, text: 'b', rules: ['x', 'y'] }];
  assert.deepEqual(tieOf('line 2 rule 2', lines), { line: 2, rule: 2 });
  assert.deepEqual(tieOf('line 2', lines), { line: 2 });
  assert.deepEqual(tieOf('job line', lines), { line: 1 });
  assert.deepEqual(tieOf('rule 2', lines), { line: 2, rule: 2 }, 'a bare rule number finds the first line that has that many rules');
  assert.deepEqual(tieOf('line 1 rule 5', lines), { line: 1 }, 'a rule number the line does not have is no rule');
  assert.deepEqual(tieOf(undefined, lines), { line: 1 });
});

test('found-on-page on the eight REAL saved maps: every word the code kept is written on its page (recounted here without the product counters)', () => {
  for (const k of ['sfo1', 'sfo2', 'ord-den', 'jfk-lax', 'lax-jfk', 'bos-ord', 'airbnb-lisbon', 'airbnb-porto']) {
    const fx = loadFixture(k);
    const squash = (/** @type {string} */ t) => t.replace(/[\s  ]+/g, ' ');
    const page = squash(fx.page);
    const r = applyPageRules(fx.page, fx.map, k.startsWith('airbnb') ? JOBS.airbnb : JOBS.flights);
    assert.ok(r.facts.length > 0, k);
    for (const f of r.facts) for (const w of [...f.words, ...(f.unit ?? []), ...(f.currency ?? [])]) {
      assert.ok(page.toLowerCase().includes(squash(w).trim().toLowerCase()), `${k}: "${w}" of "${f.name}" is not on the page`);
    }
  }
});
