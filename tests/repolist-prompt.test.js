// Addendum 2026-11-15 (d) piece 3: the drafter is told about the fence claim in the SAME change that code starts to use it (a rule the drafter is not told about fails every draft), with ONE legal example;
// guardLines is no longer offered to a new draft (code cannot prove a guard keeps a rule, so it is Not checked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobLineTagBlock, declarationSchema } from '../src/authorflow.js';
import { classGuards } from '../src/authoring.js';

const names = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => g.name);

test('the tag block tells the drafter the fence claim, once, with a legal example, and says code proves it', () => {
  const b = jobLineTagBlock(2, names);
  assert.match(b, /fenceKept/);
  assert.equal((b.match(/"fenceKept": \[/g) ?? []).length, 1, 'exactly one legal example');
  assert.match(b, /OUTSIDE the write scope/);
  assert.match(b, /code checks it/);
  assert.match(b, /needs no stage/, 'a ~ rule needs no stage and no refusal');
});

test('guardLines is not offered to a new draft: not in the prompt, not in the declaration schema', () => {
  assert.doesNotMatch(jobLineTagBlock(2, names), /guardLines/);
  const props = declarationSchema(undefined, { verdictType: 'green' }).properties;
  assert.equal('guardLines' in props, false);
  assert.ok('fenceKept' in props);
  assert.deepEqual(props.fenceKept.items.required, ['line', 'rule', 'path']);
});

test('a caller with no guards (an old caller) sees no fence paragraph: byte-identical', () => {
  assert.doesNotMatch(jobLineTagBlock(2), /fenceKept/);
});
