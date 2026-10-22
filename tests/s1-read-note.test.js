// fwdloop run m10-walk-flights-3 (run-1, deepseek-flash): the AI proposed a duplicate fact; S1 dropped the copy and the note showed under
// Not checked although the guardrail IS checked by the other fact. An S1 note whose OTHER fact is still signed is a read note
// ("How the page was read"); with the other fact not signed it stays Not checked. The sentence below is the live shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReadNote, splitReadNotes, dropLine, dropRows } from '../src/pagedropwords.js';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';
import { lineRules } from '../src/rubricstep.js';

const S1 = 'line 1: "nonstop" — "nonstop" would read the same value as "nonstop". The page gives no second label for it.';
const S1_PRICE = 'line 1: "under $450" — "price cap" would read the same value as "price". The page gives no second label for it.';
const WORD = 'line 1: "departure time label" — "Leaves" does not show the same values as "Departure time:", so it was not used as a second way to read it.';

test('S1 note: other fact signed -> read note; other fact not signed (or no list) -> Not checked', () => {
  assert.equal(isReadNote(S1, ['nonstop']), true);
  assert.equal(isReadNote(S1, ['price']), false);
  assert.equal(isReadNote(S1), false, 'no signed list: unchanged');
  assert.equal(isReadNote(S1_PRICE, ['price']), true);
});

test('every sentence must qualify: an S1 sentence with an unsigned other keeps the whole row under Not checked', () => {
  const both = `${S1_PRICE} ${'"a" would read the same value as "ghost". The page gives no second label for it.'}`;
  assert.equal(isReadNote(both, ['price']), false);
  assert.equal(isReadNote(both, ['price', 'ghost']), true);
  const mixed = `line 1: "x" — ${'"a" would read the same value as "price". The page gives no second label for it.'} No word on this page reads "a" safely.`;
  assert.equal(isReadNote(mixed, ['price']), false);
});

test('a row built through dropLine from a real s1 drop classifies the same way', () => {
  const row = dropRows([{ line: 1, fact: 'nonstop', reason: 's1', other: 'nonstop' }])[0];
  const text = dropLine(row, [{ n: 1, text: 'x', rule: '' }], lineRules);
  assert.equal(isReadNote(text, ['nonstop']), true);
  assert.equal(isReadNote(text, []), false);
});

test('splitReadNotes takes the signed names', () => {
  assert.deepEqual(splitReadNotes([S1, WORD], ['nonstop']), { notChecked: [], readNotes: [S1, WORD] });
  assert.deepEqual(splitReadNotes([S1, WORD], ['other']), { notChecked: [S1], readNotes: [WORD] });
});

/** @param {string} name */
const part = (name) => ({ text: 't', class: 'fact', source: 'page', covers: [1], facts: [{ name, shape: 'money', unit: ['US dollars'], anchor: 'From' }] });
const specWith = (/** @type {string[]} */ names) => ({
  jobLines: [{ n: 1, text: 'Find flights', rule: '' }],
  closeDecl: { notes: [S1], stages: [{ name: 's', kind: 'rubric-step', params: { step: 1, parts: names.map(part) } }] }, close: [],
});

test('planFromSpec: the signed spec\'s own fact names decide - older specs too', () => {
  assert.deepEqual(planFromSpec(specWith(['nonstop'])).readNotes, [S1]);
  assert.deepEqual(planFromSpec(specWith(['nonstop'])).notChecked, []);
  assert.deepEqual(planFromSpec(specWith(['price'])).notChecked, [S1]);
});

test('planFromConfirm: the look\'s signed fact names ride on the plan', () => {
  const jl = [{ n: 1, text: 'x', rule: '' }];
  assert.deepEqual(planFromConfirm(jl, { notChecked: [S1], checks: [], signedFacts: ['nonstop'] }).readNotes, [S1]);
  assert.deepEqual(planFromConfirm(jl, { notChecked: [S1], checks: [], signedFacts: ['price'] }).notChecked, [S1]);
  assert.deepEqual(planFromConfirm(jl, { notChecked: [S1], checks: [] }).notChecked, [S1]);
});
