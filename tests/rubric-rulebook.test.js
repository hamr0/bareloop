// PART 1b live fix B1 — ONE rulebook for the drafter: the rules for turning the person's words into checks are said once. They used to be RUBRIC_RULES, interpolated into the confirm step and the drafter's part-writing
// brief (smv6k6l8dxkzs: the confirm step planned a limit the drafter could not carry, and the drafter added an airport code the person never wrote). The part-writing brief and RUBRIC_RULES are deleted with the AI-written
// parts (check block build, hamr 2026-11-12); the same three things are said once in the row-edit prompt (src/rowedit.js ROW_EDIT_SYSTEM), and the confirm note plans no check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUBRIC_CONFIRM_NOTE } from '../src/authorflow.js';
import { ROW_EDIT_SYSTEM } from '../src/rowedit.js';

test('B1: the confirm note plans no check, so it carries no rulebook; the old rulebook constant and part-writing brief are gone from the module', async () => {
  assert.ok(!RUBRIC_CONFIRM_NOTE.includes('THE RULES FOR TURNING'));
  const mod = await import('../src/authorflow.js');
  assert.equal('RUBRIC_RULES' in mod, false);
  assert.equal('REQUIRED_FACTS_BRIEF' in mod, false);
});

test('B1: the row-edit prompt says the three things — a written limit is checkable, a made number is the AI\'s proposal (a range), names and units are the input\'s', () => {
  assert.match(ROW_EDIT_SYSTEM, /A limit the person WROTE \("under \$450"\) is a rule that can be checked/);
  assert.match(ROW_EDIT_SYSTEM, /"not a red-eye".*your proposal.*RANGE \(between\), never one-sided/s);
  assert.match(ROW_EDIT_SYSTEM, /Names, labels and units are the input's own words, copied exactly as the input writes them/);
  assert.match(ROW_EDIT_SYSTEM, /never add a code \(like SFO\) that the person did not write and the input does not hold/);
});

test('B1: no second hand-typed copy — the rulebook\'s sentences appear in the source once, in rowedit.js', () => {
  const rowedit = readFileSync(new URL('../src/rowedit.js', import.meta.url), 'utf8');
  const flow = readFileSync(new URL('../src/authorflow.js', import.meta.url), 'utf8');
  assert.equal(rowedit.split('is your proposal').length - 1, 1, 'the "proposal" sentence is written once');
  assert.equal(flow.split('is your proposal').length - 1, 0);
  assert.equal(rowedit.split('never add a code (like SFO)').length - 1, 1, 'the "input\'s own words" sentence is written once');
  assert.equal(flow.split('never add a code (like SFO)').length - 1, 0, 'and not in authorflow.js any more');
});
