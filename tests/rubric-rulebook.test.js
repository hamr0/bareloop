// PART 1b live fix B1 — ONE rulebook for the confirm step and the drafter: RUBRIC_RULES is interpolated into both prompts, so a rule
// cannot be told to one and not the other (smv6k6l8dxkzs: the confirm step planned a limit the drafter could not carry, and the
// drafter added an airport code the person never wrote).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUBRIC_RULES, RUBRIC_CONFIRM_NOTE, REQUIRED_FACTS_BRIEF } from '../src/authorflow.js';

test('B1: both the confirm note and the drafter brief carry the one rulebook, verbatim, exactly once', () => {
  for (const text of [RUBRIC_CONFIRM_NOTE, REQUIRED_FACTS_BRIEF]) {
    assert.ok(text.includes(RUBRIC_RULES));
    assert.equal(text.split(RUBRIC_RULES).length - 1, 1);
  }
});

test('B1: the rulebook says the three things — a written limit is checkable, a made number is the AI\'s proposal (a range), names and units are the input\'s', () => {
  assert.match(RUBRIC_RULES, /A limit the person WROTE \("under \$450"\) is a rule that can be checked/);
  assert.match(RUBRIC_RULES, /"not a red-eye".*the AI's proposal.*RANGE \(between\), never one-sided/s);
  assert.match(RUBRIC_RULES, /Names, labels and units are the INPUT's own words/);
  assert.match(RUBRIC_RULES, /never add a code \(like SFO\) that the person did not write and the input does not hold/);
});

test('B1: no second hand-typed copy — the rulebook\'s sentences appear in authorflow.js source once, in the constant', () => {
  const src = readFileSync(new URL('../src/authorflow.js', import.meta.url), 'utf8');
  assert.equal(src.split('is your proposal').length - 1, 1, 'the "proposal" sentence is written once');
  assert.equal(src.split('never add a code (like SFO)').length - 1, 1, 'the "input\'s own words" sentence is written once');
});
