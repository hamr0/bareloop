// Module 1 of the staged close (PRD v1.28): the close is an ordered list of
// NAMED STAGES, and the check menu DERIVES from it — no operator authors checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateJob, checkMenu } from '../src/job.js';

const JOB = (over = {}) => ({
  schema: 'job-v1',
  job: 'staged',
  description: 'a job whose close is a list of named stages',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Make the suite pass under strict types.',
  verdictType: 'green',
  close: [
    { name: 'seed-present', cmd: 'git rev-parse SEED', expect: 0, offer: false },
    { name: 'typecheck', cmd: 'npx tsc --noEmit', expect: 0, gapKeep: '^src/' },
    { name: 'declarations', cmd: 'npm run build:types', expect: 0 },
    { name: 'api-superset', cmd: 'node check-api.mjs', expect: 0, needs: ['declarations'] },
  ],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});
const mut = (fn) => { const j = JSON.parse(JSON.stringify(JOB())); fn(j); return j; };

test('a staged close validates green and the stages keep their order', () => {
  const r = validateJob(JOB());
  assert.deepEqual(r.reds, []);
  assert.deepEqual(r.job.close.map((s) => s.name), ['seed-present', 'typecheck', 'declarations', 'api-superset']);
});

test('the check menu DERIVES from the close: offerable stages only, each with the chain that must run first', () => {
  const menu = checkMenu(JOB().close);
  assert.deepEqual(menu.map((m) => m.name), ['typecheck', 'declarations', 'api-superset'],
    'a stage marked offer:false is not a ruler — it is a precondition, and it never reaches the agent');
  assert.deepEqual(menu.find((m) => m.name === 'typecheck').run.map((s) => s.name), ['typecheck'],
    'a standalone stage runs alone');
  assert.deepEqual(menu.find((m) => m.name === 'api-superset').run.map((s) => s.name), ['declarations', 'api-superset'],
    'a dependent stage runs its prerequisite FIRST — alone it would red for a reason that has nothing to do with the work');
});

test('a job may not hand-author checks — the field is gone, and naming it reds by name (hamr: no user authoring anywhere)', () => {
  const r = validateJob(mut((j) => { j.checks = [{ name: 'mine', cmd: 'npm test', expect: 0 }]; }));
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'checks-derived' && x.path === 'checks'),
    `expected checks-derived:checks, got ${JSON.stringify(r.reds)}`);
});

const RED = [
  ['an empty close', (j) => { j.close = []; }, 'missing-required:close'],
  ['a stage without a name', (j) => { delete j.close[1].name; }, 'invalid-value:close.1.name'],
  ['a non-slug stage name', (j) => { j.close[1].name = 'Type Check'; }, 'invalid-value:close.1.name'],
  // rename a stage NOTHING depends on: renaming `declarations` would also break
  // `api-superset`'s needs, and a case that trips two reds cannot pin either one
  ['duplicate stage names (check-passes would be ambiguous)', (j) => { j.close[1].name = 'seed-present'; }, 'duplicate-id:close.1.name'],
  ['a stage without a cmd', (j) => { delete j.close[1].cmd; }, 'missing-required:close.1.cmd'],
  ['a stage without an expect', (j) => { delete j.close[1].expect; }, 'invalid-value:close.1.expect'],
  ['quotes in a stage cmd (argv is whitespace-split, no shell)', (j) => { j.close[1].cmd = 'node -e "x"'; }, 'invalid-value:close.1.cmd'],
  ['a minting claim on a stage', (j) => { j.close[1].mints = true; }, 'unknown-field:close.1.mints'],
  ['needs naming a stage that does not exist', (j) => { j.close[3].needs = ['nope']; }, 'invalid-value:close.3.needs'],
  ['needs naming a LATER stage (a prerequisite must already have run)', (j) => { j.close[1].needs = ['declarations']; }, 'invalid-value:close.1.needs'],
  ['needs naming itself', (j) => { j.close[3].needs = ['api-superset']; }, 'invalid-value:close.3.needs'],
  ['needs on a stage nobody can pick is meaningless', (j) => { j.close[0].needs = []; }, 'invalid-value:close.0.needs'],
  ['offer that is not a boolean', (j) => { j.close[1].offer = 'yes'; }, 'invalid-value:close.1.offer'],
  ['a secret literal in a stage cmd', (j) => { j.close[1].cmd = 'deploy --token ghp_abcdefghijklmnopqrstuv'; }, 'secret-literal:close.1.cmd'],
];
for (const [name, fn, want] of RED) {
  test(`staged close red: ${name} → ${want}`, () => {
    const r = validateJob(mut(fn));
    assert.equal(r.ok, false, 'must red');
    assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
    assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, want);
  });
}

test('a judged floor and a gapKeep are per STAGE — the stage that judged nothing is the one that says so', () => {
  const r = validateJob(mut((j) => { j.close[1].judged = { pattern: 'found (\\d+) errors', min: 1 }; }));
  assert.deepEqual(r.reds, []);
  const bad = validateJob(mut((j) => { j.close[1].judged = { pattern: 'no group', min: 1 }; }));
  assert.equal(bad.ok, false);
  assert.ok(bad.reds.some((x) => x.path === 'close.1.judged.pattern'));
});

test('every stage of a staged close is a hard-class command — a rubric or hitl stage is inexpressible', () => {
  const r = validateJob(mut((j) => { j.close[1] = { name: 'vibes', type: 'rubric', criteria: 'looks good' }; }));
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path.startsWith('close.1')), 'a non-command stage cannot ride in the list');
});
