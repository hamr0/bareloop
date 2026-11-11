// R10 (fwd am28, "Check 0b", ported by rewrite): the run-time worker brief tells a FACTS+TEXT line the picks the person signed, in plain words code writes.
// $0, no model. Source: the signed close's own record of the person's picks (`closeDecl.picks`), the same record the plan card reads for `by: you`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineBriefs, rubricGoal, toldPicks } from '../src/rubricstep.js';

const FACT = { text: 'list the last 3 releases', class: 'fact', source: 'Changelog', facts: [{ name: 'version', shape: 'text', anchor: '## [', until: ']' }], count: { min: 3, max: 3 } };
const LIST3 = { text: 'exactly 3 bullets', class: 'countable', check: 'listItems', value: 3, rules: [1] };
const WORDS80 = { text: 'under 80 words', class: 'countable', check: 'maxWords', value: 80, rules: [2] };
const decl = (parts, picks) => ({ stages: [{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }], ...(picks ? { picks } : {}) });
const rec = (parts) => parts.map((part) => ({ line: 1, part }));
const JOB = [{ n: 1, text: 'List the last 3 releases', rule: '' }];

test('a facts+text line is told each signed pick, in code-written words, and nothing else', () => {
  const [b] = lineBriefs(decl([FACT, LIST3, WORDS80], rec([LIST3, WORDS80])));
  assert.match(b.text, /Your "text" must have exactly 3 list items; a list item is its own line starting with "1\." or "- " followed by a space and its text\./);
  assert.match(b.text, /Your "text" must have at most 80 words\./);
  assert.deepEqual(toldPicks([LIST3, WORDS80]).length, 2);
  assert.doesNotMatch(b.text, /fail|red|verdict/i);
});

test('a countable part that is not a signed pick (the drafter\'s own) is not told', () => {
  const [b] = lineBriefs(decl([FACT, LIST3, WORDS80], rec([WORDS80])));
  assert.doesNotMatch(b.text, /list items/);
  assert.match(b.text, /at most 80 words/);
});

test('no picks: the brief is byte-identical to a close with no record', () => {
  const a = lineBriefs(decl([FACT, LIST3], null));
  const b = lineBriefs(decl([FACT, LIST3], []));
  assert.deepEqual(a, b);
  assert.doesNotMatch(a[0].text, /Your "text" must/);
  assert.match(rubricGoal({ jobLines: JOB, files: [{ label: 'Changelog', rel: 'input/CHANGELOG.md' }], closeDecl: decl([FACT, LIST3, WORDS80], rec([LIST3])) }), /Your "text" must have exactly 3 list items/);
});

test('a text-only line with picks is NOT told (fwd\'s scope: page-quoting steps only)', () => {
  const textOnly = { stages: [{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [LIST3] } }], picks: rec([LIST3]) };
  assert.deepEqual(lineBriefs(textOnly), []);
});
