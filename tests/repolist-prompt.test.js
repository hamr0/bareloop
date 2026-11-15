// hamr 2026-11-15 (the repo job runs the rubric flow): the drafter no longer writes `fenceKept` or a rule-level `refused`; code decides what the write fence keeps and asks about the rest;
// guardLines is no longer offered to a new draft (code cannot prove a guard keeps a rule, so it is Not checked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobLineTagBlock, declarationSchema } from '../src/authorflow.js';
import { classGuards } from '../src/authoring.js';

const names = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => g.name);

test('the tag block no longer has the drafter state a fence claim or list a rule as refused: code decides, from the person\'s own words', () => {
  const b = jobLineTagBlock(2, names);
  assert.doesNotMatch(b, /fenceKept/);
  assert.match(b, /needs no stage and no refusal/, 'a ~ rule needs no stage and no refusal');
  assert.match(b, /you never list one in "refused"/);
});

test('guardLines is not offered to a new draft, and neither is a fence claim or a rule-level refusal: not in the prompt, not in the declaration schema', () => {
  assert.doesNotMatch(jobLineTagBlock(2, names), /guardLines/);
  const props = declarationSchema(undefined, { verdictType: 'green' }).properties;
  assert.equal('guardLines' in props, false);
  assert.equal('fenceKept' in props, false);
  assert.deepEqual(Object.keys(props.refused.items.properties), ['line', 'reason'], 'a refusal is a whole job line; a rule is never the drafter\'s to refuse');
});

test('a caller with no guards (an old caller) sees no always-on paragraph: byte-identical', () => {
  assert.doesNotMatch(jobLineTagBlock(2), /fenceKept|never list one/);
});
