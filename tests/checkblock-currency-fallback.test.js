// fwdloop live run walk-m16-flights run-1 (a flights job on a euro page, Madrid to Rome): two check-block defects found (this file: B) in code copied from bareloop.
// A: a `!` phrase "Rome" that is on the page (search box, "Track prices" toggles) but in no result row was built, so every run was red.
// B: "under $150" against a euro price fact fell back to the look's AI reading (lt 150) and checked 150 euros.
// Real CheckBlock, real saved page (tests/fixtures/card-drafts/flights-madrid-rome-eur.txt, fwd's draft page, copied in); no mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock } from '../src/checkblock.js';

const TEXT = readFileSync(new URL('./fixtures/card-drafts/flights-madrid-rome-eur.txt', import.meta.url), 'utf8');
const price = (/** @type {any} */ extra = {}) => ({ line: 2, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['euros'], currency: ['€'], forRule: 1, reading: { op: 'lt', value: 150 }, ...extra });
const make = (/** @type {string[]} */ rules, /** @type {any[]} */ facts, /** @type {any[]} */ edits = []) => {
  const b = new CheckBlock({ texts: { flights: TEXT }, labels: ['flights'], asks: false });
  b.fromJob([{ n: 1, text: 'Read the flights page', rules: [] }, { n: 2, text: 'list 3 flights from Madrid to Rome', rules }]);
  b.addLook(facts, []);
  const rec = edits.length ? b.applyDelta({ label: 'ai', edits }) : null;
  const close = b.reconcile();
  const allFacts = close.parts.flatMap((/** @type {any} */ p) => p.facts ?? []);
  return { b, rec, allFacts };
};
const add = (/** @type {string} */ w) => ({ op: 'add', line: 2, kind: 'phrase', name: w, words: [w] });

test('B: "under $150" against a euro fact is Not checked, never the look\'s reading on euro prices', () => {
  const { b, allFacts } = make(['under $150'], [price()]);
  const row = b.rows.find((r) => r.kind === 'rule' && r.line === 2);
  assert.equal(row?.state, 'not-checked');
  assert.match(row?.reason ?? '', /another currency than the page/);
  assert.equal(allFacts.some((f) => f.name === 'price'), false);
});

test('B good case: a rule in the SAME currency as the fact still builds', () => {
  for (const rule of ['under 150 euros', 'under €150']) {
    const { allFacts } = make([rule], [price()]);
    assert.deepEqual(allFacts.find((f) => f.name === 'price')?.rule, { op: 'lt', value: 150 }, rule);
  }
});
