// PART 1b item 6 — the PLAN CARD for required facts: one code-worded row per fact under the line, read by the ONE reader
// (`checksOfClose` / `partSentence`) the confirm card, the Job tab and the sign-time invariant share. Real readers; the close is a
// real fact-step declaration over this repo's CHANGELOG headings. No model, no files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';
import { checksOfClose, planMatchesClose, reconcileRubricPlan, withFactBindings, ruleNotChecked } from '../src/rubricstep.js';
import { factRows } from '../src/facts.js';

const FACT = {
  text: 'list the last 3 releases', class: 'fact', source: 'Changelog', rules: [1],
  facts: [{ name: 'version', shape: 'text', anchor: '## [', until: ']' }, { name: 'released', shape: 'date', rule: { op: 'gte', value: '2026-10-01' } }],
  count: { min: 3, max: 3 }, covers: [1],
};
const JOB_LINES = [
  { n: 1, text: 'List the last 3 releases', rule: 'released on or after 2026-10-01; the cheapest one', rules: ['released on or after 2026-10-01', 'the cheapest one'] },
  { n: 2, text: 'Summarize them', rule: 'under 100 words', rules: ['under 100 words'] },
];
const closeDecl = () => withFactBindings({
  genre: 'text', lang: 'rubric-files',
  stages: [
    { name: 'changed-from-seed', kind: 'files-changed', params: {} },
    { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [FACT] } },
    { name: 'line-2', kind: 'rubric-step', fromLine: [2], params: { step: 2, parts: [{ text: 'under 100 words', class: 'countable', check: 'maxWords', value: 100, rules: [1] }] } },
  ],
  refused: [{ line: 1, rule: 2, reason: 'a "cheapest" cannot be told from one release' }],
});
const spec = () => ({ goal: 'g', verdictType: 'soft-green', jobLines: JOB_LINES, closeDecl: closeDecl() });

test('the rows under line 1 are the fact rows then line 2\'s own checks and its number tie', () => {
  const rows = checksOfClose(closeDecl());
  assert.deepEqual(rows.filter((r) => r.line === 1).map((r) => r.text), factRows(FACT));
  assert.deepEqual(rows.filter((r) => r.line === 1).map((r) => r.text), [
    'fact · version — text, the words after "## [" up to "]", quoted from "Changelog"',
    'fact · released — date, at least 2026-10-01, quoted from "Changelog"',
    'fact · results — exactly 3 results, each quoted from "Changelog"',
  ]);
  assert.deepEqual(rows.filter((r) => r.line === 2).map((r) => r.text), ['the text is at most 100 words', 'every number in the text is in a quote checked on line 1']);
});

test('the Job tab reads the same rows: a rubric-step stage is shown as the checks it RUNS, a ~ rule left unchecked reads in the person\'s words, and the prose step says what it does not check', () => {
  const plan = planFromSpec(spec());
  assert.deepEqual(plan.lines[0].checks.map((c) => c.name), checksOfClose(closeDecl()).filter((r) => r.line === 1).map((r) => r.text));
  assert.ok(plan.lines[0].checks.every((c) => c.cls === 'machine check'));
  assert.deepEqual(plan.lines[1].checks.map((c) => c.name), ['the text is at most 100 words', 'every number in the text is in a quote checked on line 1']);
  assert.deepEqual(plan.lines[0].refused, ['"the cheapest one" — a "cheapest" cannot be told from one release']);
  assert.deepEqual(plan.alwaysOn, ['changed-from-seed']);
  assert.deepEqual(plan.notChecked, ['line 2: what the text says — you judge it at Accept']);
});

test('the card after drafting: checks are the close\'s own rows, Not checked holds the prose line and the rule the drafter listed, in the person\'s words; sign == run', () => {
  const rec = reconcileRubricPlan({ confirmed: [{ text: 'lists 3 releases', fromLine: [1] }], notChecked: ['a good pick'], closeDecl: closeDecl(), jobLines: JOB_LINES });
  assert.deepEqual(rec.notChecked, [
    'a good pick',
    'line 2: what the text says — you judge it at Accept',
    'line 1: "the cheapest one" — a "cheapest" cannot be told from one release',
  ]);
  assert.deepEqual(rec.moved, []);
  assert.deepEqual(planMatchesClose(rec.checkItems, closeDecl()), { ok: true });
  const plan = planFromConfirm(JOB_LINES, { checkItems: rec.checkItems, notChecked: rec.notChecked, protections: [] });
  assert.equal(plan.lines[0].checks.length, 3);
  assert.equal(plan.lines[1].checks.length, 2);
});

test('sign == run covers facts: a row the person was not shown, a row dropped, and a changed fact are each a refusal', () => {
  const shown = checksOfClose(closeDecl()).map((c) => ({ text: c.text, fromLine: [c.line] }));
  assert.deepEqual(planMatchesClose(shown, closeDecl()), { ok: true });
  assert.equal(planMatchesClose(shown.filter((c) => !c.text.includes('results')), closeDecl()).ok, false, 'a row the close runs but the card did not show');
  const changed = closeDecl();
  changed.stages[1].params.parts[0].facts[1].rule = { op: 'gte', value: '2020-01-01' };
  const r = planMatchesClose(shown, changed);
  assert.equal(r.ok, false);
  assert.match(String(r.ok === false && r.error), /at least 2020-01-01|at least 2026-10-01/);
});

test('ruleNotChecked names a rule without a job line as "rule N"; whole-line refusals are not rule lines', () => {
  assert.deepEqual(ruleNotChecked({ refused: [{ line: 4, rule: 2, reason: 'no' }, { line: 1, reason: 'whole line' }] }, null), ['line 4: rule 2 — no']);
  assert.deepEqual(ruleNotChecked({}, JOB_LINES), []);
});
