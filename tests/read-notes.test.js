// Run mvij7kuk (flight-c1): the plan card listed code's notes about written forms it did not use under "Not checked (the AI's own reading)",
// although the price WAS checked. A drop of one word whose fact is kept is a note ("How the page was read"); a whole fact left out stays Not checked.
// The data is the notes that run's signed spec really carried (session smvij5q3rx96z).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReadNote, splitReadNotes, dropLine, dropRows } from '../src/pagedropwords.js';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';
import { lineRules } from '../src/rubricstep.js';

const PRICE = 'line 1: "price label" — "US dollars" was listed twice, as a unit and as a currency; it is used once, as the first way to write the price. "$" does not show the same amounts as "US dollars", so it was not used as a second way to write the price. "from" does not show the same values as "From", so it was not used as a second way to read it.';
const DEPART = 'line 1: "departure time label" — "Leaves" does not show the same values as "Departure time:", so it was not used as a second way to read it.';
const MODEL = 'Which 3 flights are listed is not checked: the person did not say how to choose among the page\'s flights, and choice is not a shape a fact can carry.';
const WHOLE = 'line 2: "Stops" — The page never shows a number right after or right before "StaticText". No word on this page reads "Stops" safely.';
const DRY = 'line 1: "MaxPrice" — the price rule could not read a price in the page\'s results, so it is not checked.';

test('a note about a second written form of a kept fact is a read note; a whole fact left out, a dry read and the model\'s own words are not', () => {
  assert.equal(isReadNote(PRICE), true);
  assert.equal(isReadNote(DEPART), true);
  assert.equal(isReadNote(MODEL), false);
  assert.equal(isReadNote(WHOLE), false, 'a word note on a fact that also lost its label stays Not checked');
  assert.equal(isReadNote(DRY), false);
  assert.deepEqual(splitReadNotes([MODEL, PRICE, WHOLE, DEPART, DRY]), { notChecked: [MODEL, WHOLE, DRY], readNotes: [PRICE, DEPART] });
});

test('every word-level sentence the drop table writes is a read note, built through dropLine from real drops', () => {
  const jobLines = [{ n: 1, text: 'x', rule: '' }];
  for (const reason of ['not-on-page', 'no-value', 'n2', 'r1', 'sign-twice', 'r1l', 'limit-currency', 'limit-unit', 'unit-too-long']) {
    const row = dropRows([{ line: 1, fact: 'Price', word: 'US dollars', reason, other: 'From' }])[0];
    assert.equal(isReadNote(dropLine(row, jobLines, lineRules)), true, reason);
  }
  const whole = dropRows([{ line: 1, fact: 'Price', reason: 'reads-no-result' }])[0];
  assert.equal(isReadNote(dropLine(whole, jobLines, lineRules)), false);
});

test('planFromSpec: the signed notes split - the price notes leave Not checked, the model\'s gap stays', () => {
  const spec = { jobLines: [{ n: 1, text: 'Find flights', rule: '' }], closeDecl: { notes: [MODEL, PRICE, DEPART], stages: [] }, close: [] };
  const plan = planFromSpec(spec);
  assert.deepEqual(plan.notChecked, [MODEL]);
  assert.deepEqual(plan.readNotes, [PRICE, DEPART]);
});

test('planFromConfirm: the confirm card splits the same way', () => {
  const plan = planFromConfirm([{ n: 1, text: 'x', rule: '' }], { notChecked: [PRICE, WHOLE], checks: [] });
  assert.deepEqual(plan.notChecked, [WHOLE]);
  assert.deepEqual(plan.readNotes, [PRICE]);
});
