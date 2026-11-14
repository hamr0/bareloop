// Addendum 2026-11-14 (c) piece 5: the try-3 question REPLACES. The drafter tags each question with the rule it is about (`rule`, an existing `~` rule number of that line) or `new`; the machine checks the tag
// (normalizeQuestions): a named rule that exists keeps the question with its rule, `new` keeps it as new, a named rule that does not exist (or no tag, or both) drops it with its reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS_DESCRIPTION, declarationSchema, normalizeQuestions } from '../src/authorflow.js';
import * as QB from '../src/questionbox.js';
import * as AR from '../src/authorrun.js';

const JOB = [{ n: 1, text: 'fix things', rules: ['no new deps'] }, { n: 2, text: 'tidy the tests', rules: [] }, { n: 3, text: 'ship it', rules: ['small diff', 'no jargon'] }];

test('the schema carries `rule` and `new` on a question, and the words naming them still name no number (the machine bounds the count)', () => {
  const props = declarationSchema(undefined, { questions: true }).properties.questions.items.properties;
  assert.equal(props.rule.type, 'integer');
  assert.equal(props.rule.minimum, 1);
  assert.equal(props.new.type, 'boolean');
  assert.match(QUESTIONS_DESCRIPTION, /"rule"/);
  assert.match(QUESTIONS_DESCRIPTION, /"new"/);
  assert.doesNotMatch(QUESTIONS_DESCRIPTION, /\d|\b(one|two|three|four|five|both|single|pair|couple|few|several|up to|at most)\b/i);
});

test('normalizeQuestions: a named rule that exists is kept with its rule; `new` is kept as new', () => {
  const r = normalizeQuestions([{ line: 3, rule: 2, question: 'which words?' }, { line: 2, new: true, question: 'which folder?' }], [1, 2, 3], JOB);
  assert.deepEqual(r.kept, [{ line: 3, question: 'which words?', rule: 2 }, { line: 2, question: 'which folder?', new: true }]);
  assert.deepEqual(r.dropped, []);
});

test('normalizeQuestions: a named rule that does not exist is DROPPED with its reason; so is a question with no tag and one with both', () => {
  const r = normalizeQuestions([
    { line: 1, rule: 2, question: 'q1' }, // line 1 has one rule
    { line: 2, rule: 1, question: 'q2' }, // line 2 has none
    { line: 1, question: 'q3' }, // no tag
    { line: 3, rule: 1, new: true, question: 'q4' }, // both
    { line: 1, rule: 1, question: 'q5' }, // fine
  ], [1, 2, 3], JOB);
  assert.deepEqual(r.kept.map((k) => k.question), ['q5']);
  assert.equal(r.dropped.length, 4);
  assert.match(r.dropped[0].reason, /line 1 has no rule 2/);
  assert.match(r.dropped[1].reason, /line 2 has no rule 1/);
  assert.match(r.dropped[2].reason, /neither a rule nor new/);
  assert.match(r.dropped[3].reason, /both a rule and new/);
});

test('the ask says what the answer does: "This replaces: <old words>" for a rule, "This adds a new rule to line N" for new; the box and the CLI draw the same words', () => {
  assert.equal(QB.answerEffectWords({ replaces: 'no new deps', line: 1 }), 'This replaces: no new deps');
  assert.equal(QB.answerEffectWords({ adds: true, line: 2 }), 'This adds a new rule to line 2');
  assert.equal(QB.answerEffectWords({ line: 2 }), null, 'a question about nothing in particular says nothing');
  const box = QB.boxFor({ kind: 'answer', source: 'try-3', index: 1, total: 2, question: 'which?', line: 1, replaces: 'no new deps' });
  assert.match(String(box?.line), /About job line 1.*This replaces: no new deps/);
  assert.match(String(QB.boxFor({ kind: 'answer', source: 'try-3', index: 1, total: 1, question: 'which?', line: 2, adds: true })?.line), /This adds a new rule to line 2/);
  const cli = AR.answerPromptLines({ kind: 'answer', index: 1, total: 2, question: 'which?', line: 1, replaces: 'no new deps' });
  assert.ok(cli.includes('  This replaces: no new deps'), JSON.stringify(cli));
  assert.ok(AR.answerPromptLines({ kind: 'answer', index: 1, total: 1, question: 'which?', line: 2, adds: true }).includes('  This adds a new rule to line 2'));
  assert.ok(AR.answerPromptLines({ kind: 'answer', index: 1, total: 1, question: 'which?' }).every((l) => !/This (replaces|adds)/.test(l)));
});
