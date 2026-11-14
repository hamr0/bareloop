// fwdloop live run walk-m16-flights run-1 (a flights job on a euro page, Madrid to Rome): two check-block defects found (this file: A) in code copied from bareloop.
// A: a `!` phrase "Rome" that is on the page (search box, "Track prices" toggles) but in no result row was built, so every run was red.
// B: "under $150" against a euro price fact fell back to the look's AI reading (lt 150) and checked 150 euros.
// Real CheckBlock, real saved page (tests/fixtures/card-drafts/flights-madrid-rome-eur.txt, fwd's draft page, copied in); no mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock } from '../src/checkblock.js';
import { dryReadPhrases, phraseInNoResult } from '../src/pagedry.js';

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

test('A: a `!` phrase on the page but in no result row is Not checked, with the look\'s own sentence', () => {
  const { b, allFacts } = make([], [price({ forRule: undefined, reading: undefined })], [add('Rome')]);
  const row = b.rows.find((r) => r.key === 'L2.phrase.rome');
  assert.equal(row?.state, 'not-checked');
  assert.equal(row?.reason, '"Rome" is on the page but in none of its results, so it is not checked.');
  assert.equal(allFacts.some((f) => f.phrase === 'Rome'), false);
});

test('A good case: a `!` phrase that IS in a result row still builds', () => {
  const { b, allFacts } = make([], [price({ forRule: undefined, reading: undefined })], [add('Nonstop')]);
  assert.equal(b.rows.find((r) => r.key === 'L2.phrase.nonstop')?.state, 'built');
  assert.equal(allFacts.some((f) => f.phrase === 'Nonstop'), true);
});

test('A good case: with no money fact on the line the result rows are unknown, so nothing is guessed and Rome builds', () => {
  const { b } = make([], [], [add('Rome')]);
  assert.equal(b.rows.find((r) => r.key === 'L2.phrase.rome')?.state, 'built');
});

test('A one owner: the sync read agrees with the look\'s own dry read (the real grader) on both the refused and the good phrase', async () => {
  const money = [price({ forRule: undefined, reading: undefined })];
  for (const w of ['Rome', 'Nonstop']) {
    const dry = await dryReadPhrases(TEXT, [...money, { line: 2, name: w, shape: 'phrase', words: [w], source: 'flights' }]);
    assert.equal(phraseInNoResult(TEXT, money, w), dry.dropped.length === 1, w);
  }
});

test('A Drop then Add: a ledger-suggested "Rome" re-Added from Suggested stays Not checked in the row, the card, signedRows() and the close', () => {
  const b = new CheckBlock({ texts: { flights: TEXT }, labels: ['flights'], asks: false });
  b.fromJob([{ n: 1, text: 'Read the flights page', rules: [] }, { n: 2, text: 'list 3 flights from Madrid to Rome', rules: [] }]);
  b.addLook([price({ forRule: undefined, reading: undefined })], []);
  b.reconcile();
  b.applyDelta({ label: 'pre:ledger-suggest', pre: true, edits: [{ op: 'add', line: 2, kind: 'phrase', name: 'Rome', words: ['Rome'], source: 'flights' }] });
  b.reconcile();
  b.rowChoice('L2.phrase.rome', 'drop');
  b.reconcile();
  b.rowChoice('L2.phrase.rome', 'add');
  const close = b.reconcile();
  const sentence = '"Rome" is on the page but in none of its results, so it is not checked.';
  const row = b.rows.find((r) => r.key === 'L2.phrase.rome');
  assert.equal(row?.state, 'not-checked');
  assert.equal(row?.reason, sentence);
  assert.equal(b.card().some((c) => c.key === 'L2.phrase.rome' && c.state === 'built'), false);
  const signed = b.signedRows().filter((r) => r.key === 'L2.phrase.rome');
  assert.equal(signed.some((r) => r.state === 'built'), false);
  assert.equal(close.parts.flatMap((/** @type {any} */ p) => p.facts ?? []).some((/** @type {any} */ f) => f.phrase === 'Rome'), false);
});
