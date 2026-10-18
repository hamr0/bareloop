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

test('found-on-page: a money fact keeps the labels and units the page holds; a form it does not hold is dropped by name', () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From', 'Total price'], currency: ['€'], unit: ['US dollars', 'zorkmids'] }] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts[0].words, ['From']);
  assert.deepEqual(r.facts[0].unit, ['US dollars']);
  assert.equal(r.facts[0].currency, undefined);
  assert.deepEqual(said(r.dropped), ['price|Total price|not-on-page', 'price|zorkmids|not-on-page', 'price|€|not-on-page']);
});

test('found-on-page: a currency that is a WORD ("US dollars") is no currency sign - dropped as such, and with no other form the money fact is not kept', () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['From'], currency: ['US dollars'] }] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts, []);
  assert.deepEqual(said(r.dropped), ['price|(fact)|no-label', 'price|US dollars|currency-not-symbol']);
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

// ── item 3: N2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('N2: the label "at" is written many times inside one line of the real flights page, so it is dropped (and a fact left with no label is not kept); "Departure time:" is written once per line, so it is kept', () => {
  const map = { facts: [
    { name: 'departure', from: 'rule 2', shape: 'time', words: ['Departure time:'] },
    { name: 'leaves at', from: 'rule 2', shape: 'time', words: ['at'] },
  ] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts.map((f) => [f.name, f.words]), [['departure', ['Departure time:']]]);
  assert.deepEqual(said(r.dropped), ['leaves at|(fact)|no-label', 'leaves at|at|n2']);
});

test('N2 reads a LABEL that is followed by a value: a place or a phrase that repeats inside one line is kept (the rule is the value labels\')', () => {
  const rep = sfo.page.split('\n').find((l) => (l.match(/International Airport/g) ?? []).length >= 2);
  assert.ok(rep, 'the real page has a line that says "International Airport" twice (leaves ... arrives at ...)');
  const r = applyPageRules(sfo.page, { facts: [{ name: 'airport', from: 'line 1', shape: 'phrase', words: ['International Airport'] }, { name: 'airport place', from: 'line 1', shape: 'place', words: ['International Airport'] }] }, JOBS.flights);
  assert.deepEqual(r.facts.map((f) => f.words), [['International Airport'], ['International Airport']]);
  assert.deepEqual(r.dropped, []);
});

// ── item 4: R1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('R1 on the REAL saved SFO map: the AI listed "From" and "from " for the price; "from" reads other values on the page, so it is dropped and the first stays', () => {
  const price = { ...factOf(sfo.map, 'price'), currency: [] };
  assert.deepEqual(price.words, ['From', 'from ']);
  const r = applyPageRules(sfo.page, { facts: [price] }, JOBS.flights);
  assert.deepEqual(r.facts[0].words, ['From']);
  assert.deepEqual(said(r.dropped), ['price|from|r1']);
});

test('R1: it is the AI\'s FIRST listed label that stays - listed the other way round, "from" stays and "From" is the one that reads different values', () => {
  const r = applyPageRules(sfo.page, { facts: [{ ...factOf(sfo.map, 'price'), currency: [], words: ['from ', 'From'] }] }, JOBS.flights);
  assert.deepEqual(r.facts[0].words, ['from']);
  assert.deepEqual(said(r.dropped), ['price|From|r1']);
});

test('R1: the same label spelled twice reads the same values, so it is kept; time facts are compared by the times they read', () => {
  const same = applyPageRules(sfo.page, { facts: [{ ...factOf(sfo.map, 'price'), currency: [], words: ['From', 'From'] }] }, JOBS.flights);
  assert.deepEqual(same.facts[0].words, ['From', 'From']);
  assert.deepEqual(same.dropped, []);
  const alt = applyPageRules(sfo.page, { facts: [{ name: 'departure', from: 'rule 2', shape: 'time', words: ['Departure time:', 'Leaves San Francisco International Airport at'] }] }, JOBS.flights);
  assert.equal(alt.facts[0].words.length, 2, 'a second label that reads exactly the same times is a true alternative and is kept');
  assert.deepEqual(alt.dropped, []);
  const dep = applyPageRules(sfo.page, { facts: [{ name: 'departure', from: 'rule 2', shape: 'time', words: ['Departure time:', 'Arrival time:'] }] }, JOBS.flights);
  assert.deepEqual(dep.facts[0].words, ['Departure time:'], 'a label that reads a different set of times than the first is dropped');
  assert.deepEqual(said(dep.dropped), ['departure|Arrival time:|r1']);
});

// ── item 5: U1 + R1L ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const lisbon = loadFixture('airbnb-lisbon');
const price = (/** @type {any} */ over) => ({ name: 'total price', from: 'rule 1', shape: 'money', words: ['total'], currency: ['€'], unit: ['total'], ...over });

test('U1 on the REAL Airbnb page: "total" is written AFTER the number ("€490 total"), so it moves from a label to a unit - and the unit stays in the signed fact', () => {
  assert.match(lisbon.page, /€\d[\d,]* total/);
  const r = applyPageRules(lisbon.page, { facts: [price({ currency: [], unit: [] })] }, JOBS.airbnb);
  assert.deepEqual(r.facts.map((f) => [f.name, f.words, f.unit, f.currency]), [['total price', [], ['total'], undefined]], 'no label left, one unit, and the fact is kept');
  assert.deepEqual(r.dropped, []);
});

test('U1 names no number on either side: a label with no number right before or right after it is dropped ("no-value"); a label with a number after it stays a label', () => {
  const map = { facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: ['Nonstop flight', 'From'], currency: [], unit: ['US dollars'] }] };
  const r = applyPageRules(sfo.page, map, JOBS.flights);
  assert.deepEqual(r.facts[0].words, ['From']);
  assert.deepEqual(said(r.dropped), ['price|Nonstop flight|no-value']);
});

test('U1 touches money and number facts only: a time label with no number beside it is NOT dropped by U1', () => {
  const r = applyPageRules(sfo.page, { facts: [{ name: 'departure', from: 'rule 2', shape: 'time', words: ['Departure time:'] }] }, JOBS.flights);
  assert.deepEqual(r.facts[0].words, ['Departure time:']);
  assert.deepEqual(r.dropped, []);
});

test('R1L on the REAL Airbnb page: the unit "total" is the primary form (units first); the currency "€" reads other numbers than "total" does, so it is dropped', () => {
  const r = applyPageRules(lisbon.page, { facts: [price({})] }, JOBS.airbnb);
  assert.deepEqual(r.facts[0].unit, ['total']);
  assert.equal(r.facts[0].currency, undefined);
  assert.deepEqual(said(r.dropped), ['total price|€|r1l']);
});

test('R1L on a REAL flights page: "$" (read after) and "US dollars" (read before) are not the same numbers, so the second form is dropped and the first (the unit) stays', () => {
  const jfk = loadFixture('jfk-lax');
  const r = applyPageRules(jfk.page, { facts: [factOf(jfk.map, 'price')] }, JOBS.flights);
  assert.deepEqual(r.facts[0].unit, ['US dollars']);
  assert.deepEqual(r.facts[0].currency, ['$'], '"$" reads the same numbers as the unit on this page, so it is a true second form');
  assert.deepEqual(said(r.dropped), ['price|US dollars|r1l'], 'listed again as a currency, the word reads other numbers and is dropped');
});

test('U1/R1L: the TUI-style "282 £ pp" form is not tested - none of the eight real saved pages holds a "£ pp" (reported, never held)', () => {
  for (const k of ['airbnb-lisbon', 'airbnb-porto', 'sfo1', 'bos-ord']) assert.doesNotMatch(loadFixture(k).page, /£\s*pp/);
});
