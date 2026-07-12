// N1 exit criteria: the job spec (the ARBITER side) is pure declarative data;
// every fit-to-pass surface reds with a pinned code+path before tokens exist.
// Reference semantics: F4's POC (poc/n1-job-schema.mjs) — 20 cases, negatives
// mutation-validated there. Cases are table-driven over inline mutators of the
// REAL job #1 spec (PRD §6): one defect per case, exactly one red — mutators
// over a shared base keep single-defect isolation without a fixture file per
// red. The two-layer checks (job fence vs workflow scope, ceiling chain) live
// here too: they need both documents.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateJob, jobSpecHash, checkApproval, CLASS_BY_CLOSE, CLOSE_TYPES, CLASSES } from '../src/job.js';
import { validateConfig } from '../src/validate.js';

// Job #1 exactly as the PRD §6 defines it — real target, not a fixture
// authored to pass. writeScope is operator law (interview decision #4);
// conditions is the environment label (decision #3, consumed at N3).
const JOB1 = {
  schema: 'job-v1',
  job: 'litectx-maintainer',
  description: 'review -> fix -> branch -> PR on litectx; suite+lint are the hard closes; merge stays human forever',
  provider: 'anthropic-api',
  conditions: { closeVerbosity: 'counts-only' },
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**', 'test/**'],
  steps: [
    { id: 'review', close: { type: 'predicate', cmd: 'npm test', expect: 0 }, class: 'hard' },
    { id: 'fix', close: { type: 'predicate', cmd: 'npm run lint', expect: 0 }, class: 'hard' },
    { id: 'pr', close: { type: 'hitl', prompt: 'PR opened — review and merge?' }, class: 'hitl' },
  ],
  escalation: { mode: 'decision-ready' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const mut = (fn) => { const j = clone(JOB1); fn(j); return j; };

test('job #1 validates green and returns the normalized spec', () => {
  const r = validateJob(JOB1);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.job, JOB1);
});

test('string input single-parses; invalid JSON is a parse-error red, job null', () => {
  const ok = validateJob(JSON.stringify(JOB1));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.job, JOB1);
  const bad = validateJob('{nope');
  assert.equal(bad.ok, false);
  assert.equal(bad.reds[0].code, 'parse-error');
  assert.equal(bad.job, null);
});

test('garbage input types → parse-error red, never a throw', () => {
  for (const garbage of [42, null, true, [], undefined]) {
    const r = validateJob(garbage);
    assert.equal(r.ok, false, `${JSON.stringify(garbage)} must red`);
    assert.equal(r.reds[0].code, 'parse-error');
  }
});

// Each entry is an ATTACK or a defect: [name, mutator, 'code:path'].
// Exactly ONE red — a case that also trips a second red is a table bug, not
// tolerance ("some red somewhere" lets a wrong-reason red fake a pass, F4).
const RED_CASES = [
  // -- the arbiter split, job side (workflow side is tested through validateConfig below) --
  ['hooks (agent-domain) smuggled into the job spec', (j) => { j.hooks = { 'on-green': [{ op: 'remember' }] }; }, 'unknown-field:hooks'],
  ['loop (agent-domain) smuggled into the job spec', (j) => { j.loop = { shape: 'refine' }; }, 'unknown-field:loop'],
  ['minting claim on a close', (j) => { j.steps[1].close.mints = true; }, 'unknown-field:steps.1.close.mints'],
  ['retry cap is shell-owned — inexpressible here', (j) => { j.capRuns = 9; }, 'unknown-field:capRuns'],

  // -- fit-to-pass laundering (the close hierarchy) --
  ['rubric close claiming class hard', (j) => { j.steps[1].close = { type: 'rubric', criteria: 'code looks good' }; j.steps[1].class = 'hard'; }, 'close-hierarchy:steps.1.class'],
  ['hitl class on a predicate close (a human IS the close)', (j) => { j.steps[0].class = 'hitl'; }, 'close-hierarchy:steps.0.class'],
  ['hard class on a hitl close (merge stays human)', (j) => { j.steps[2].class = 'hard'; }, 'close-hierarchy:steps.2.class'],
  ['freeform-code close type', (j) => { j.steps[0].close = { type: 'js', code: 'return true' }; }, 'close-type:steps.0.close.type'],
  ['script field smuggled into a predicate close', (j) => { j.steps[0].close.script = 'exit 0'; }, 'unknown-field:steps.0.close.script'],
  ['gold close with a freeform comparator', (j) => { j.steps[1].close = { type: 'gold', expected: '42', compare: 'my-fuzzy-match' }; }, 'invalid-value:steps.1.close.compare'],

  // -- the budget hard line (ceiling chain: job <= shell) --
  ['budget above the shell cap', (j) => { j.budgetUsd = 50; }, 'bounds:budgetUsd'],
  ['zero budget', (j) => { j.budgetUsd = 0; }, 'bounds:budgetUsd'],

  // -- ungated spend --
  ['step without a close', (j) => { delete j.steps[1].close; }, 'missing-required:steps.1.close'],
  ['empty steps', (j) => { j.steps = []; }, 'missing-required:steps'],
  ['missing escalation (the pain channel is not optional)', (j) => { delete j.escalation; }, 'missing-required:escalation.mode'],
  ['step class missing', (j) => { delete j.steps[0].class; }, 'missing-required:steps.0.class'],
  ['step class outside the menu', (j) => { j.steps[0].class = 'auto'; }, 'invalid-value:steps.0.class'],

  // -- the operator's write fence (same containment law as the workflow layer) --
  ['writeScope missing (the fence is operator law)', (j) => { delete j.writeScope; }, 'missing-required:writeScope'],
  ['fence escaping the run dir', (j) => { j.writeScope = ['../**']; }, 'invalid-value:writeScope'],
  ['fence with a mid-path wildcard (inexpressible in enforcement, F9)', (j) => { j.writeScope = ['src/*/gen/**']; }, 'invalid-value:writeScope'],
  ['absolute fence', (j) => { j.writeScope = ['/etc/**']; }, 'invalid-value:writeScope'],
  ['whole-run-dir fence (the close lives there)', (j) => { j.writeScope = ['./**']; }, 'invalid-value:writeScope'],

  // -- the environment label (declared keys only, V3) --
  ['unknown condition key', (j) => { j.conditions.weather = 'sunny'; }, 'unknown-field:conditions.weather'],
  ['non-string condition value', (j) => { j.conditions.closeVerbosity = 42; }, 'invalid-value:conditions.closeVerbosity'],

  // -- spec hygiene --
  ['wrong schema tag', (j) => { j.schema = 'v1'; }, 'invalid-value:schema'],
  ['non-slug job name', (j) => { j.job = 'My Job!'; }, 'invalid-value:job'],
  ['unknown top-level field', (j) => { j.frequency = 'often'; }, 'unknown-field:frequency'],
  ['duplicate step ids', (j) => { j.steps[1].id = 'review'; }, 'duplicate-id:steps.1.id'],
  ['provider outside the menu', (j) => { j.provider = 'local-llama'; }, 'invalid-value:provider'],
  ['cadence bounds', (j) => { j.cadence.every = 0; }, 'bounds:cadence.every'],
  ['cadence unit outside the menu', (j) => { j.cadence.unit = 'fortnight'; }, 'invalid-value:cadence.unit'],
  ['rubric close without criteria', (j) => { j.steps[1].close = { type: 'rubric' }; j.steps[1].class = 'soft'; }, 'missing-required:steps.1.close.criteria'],
  ['hitl close without a prompt', (j) => { delete j.steps[2].close.prompt; }, 'missing-required:steps.2.close.prompt'],
  ['predicate expect not an exit code', (j) => { j.steps[0].close.expect = 'zero'; }, 'invalid-value:steps.0.close.expect'],

  // -- nested smuggle channels (review F1: every level reds unknown keys, not just some) --
  ['unknown field inside cadence', (j) => { j.cadence.exfil = 'x'; }, 'unknown-field:cadence.exfil'],
  ['unknown field inside escalation', (j) => { j.escalation.webhook = 'http://evil'; }, 'unknown-field:escalation.webhook'],

  // -- secrets (defense-in-depth: known literal shapes; env-only loading stays the hard line) --
  ['inline API key in the description', (j) => { j.description = 'use key sk-ant-api03-abcdefghijklmnop to auth'; }, 'secret-literal:description'],
  ['token smuggled deep in a close cmd', (j) => { j.steps[0].close.cmd = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuv npm test'; }, 'secret-literal:steps.0.close.cmd'],
];

for (const [name, fn, want] of RED_CASES) {
  test(`red: ${name} → ${want}`, () => {
    const r = validateJob(mut(fn));
    assert.equal(r.ok, false, 'must red');
    assert.equal(r.reds.length, 1, `exactly one red, got: ${JSON.stringify(r.reds)}`);
    assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, want);
    assert.equal(r.job, null);
  });
}

test('hyphenated words containing "sk-"/"pat_" shapes do not red (review: SECRET_RE left boundary)', () => {
  const r = validateJob(mut((j) => { j.description = 'migrate the flask-sqlalchemy-based models and task-1234567890abcdefgh queues'; }));
  assert.deepEqual(r.reds, []);
});

test('the returned job is the same reference AND survives a fresh-copy comparison (review: no aliasing tautology)', () => {
  const fresh = clone(JOB1);
  const r = validateJob(JOB1);
  assert.equal(r.job, JOB1, 'reference echo is the contract');
  assert.deepEqual(r.job, fresh, 'validation must not mutate the spec');
});

test('hash follows JSON semantics: a key explicitly set to undefined hashes like its disk round-trip (review: approval survives save/reload)', () => {
  const j = clone(JOB1);
  j.conditions = undefined;
  assert.equal(jobSpecHash(j), jobSpecHash(JSON.parse(JSON.stringify(j))));
});

test('jobSpecHash never throws on JSON-representable garbage; checkApproval never throws on ANY garbage (review: N2 runner gets false, not a crash)', () => {
  assert.match(jobSpecHash(undefined), /^[0-9a-f]{64}$/);
  assert.match(jobSpecHash(null), /^[0-9a-f]{64}$/);
  assert.equal(checkApproval({ a: 1n }, [{ specHash: 'x' }]), false, 'BigInt spec → false, not a serialize throw');
  assert.equal(checkApproval(undefined, [{ specHash: 'x' }]), false);
});

test('the arbiter menus are frozen — verdict-class laundering cannot be enabled by mutation (review)', () => {
  assert.ok(Object.isFrozen(CLASS_BY_CLOSE) && Object.isFrozen(CLASS_BY_CLOSE.rubric) && Object.isFrozen(CLOSE_TYPES) && Object.isFrozen(CLASSES));
  assert.throws(() => { CLASS_BY_CLOSE.rubric.push('hard'); }, TypeError);
  const r = validateJob(mut((j) => { j.steps[1].close = { type: 'rubric', criteria: 'looks good' }; j.steps[1].class = 'hard'; }));
  assert.equal(r.reds[0].code, 'close-hierarchy', 'the hierarchy still holds after the mutation attempt');
});

test('an env REFERENCE in a close cmd does not red — only literals do', () => {
  const r = validateJob(mut((j) => { j.steps[0].close.cmd = 'GITHUB_TOKEN="$GITHUB_TOKEN" npm test'; }));
  assert.deepEqual(r.reds, []);
});

test('the shell cap is the ceiling the shell sets (job 1.5 passes under 2, reds under 1)', () => {
  assert.equal(validateJob(JOB1, { shellCapUsd: 2 }).ok, true);
  const r = validateJob(JOB1, { shellCapUsd: 1 });
  assert.equal(r.ok, false);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'bounds:budgetUsd');
});

// ---- the arbiter split, workflow side: REAL shipped path, not a replica ----

const WF = {
  schema: 'v1',
  loop: { shape: 'refine' },
  memory: { store: 'litectx' },
  gate: { budgetUsd: 1, writeScope: ['src/**'] },
  escalation: { mode: 'decision-ready' },
};

test('workflow config smuggling a close still reds in v1', () => {
  const r = validateConfig({ ...WF, close: { type: 'predicate', cmd: 'true', expect: 0 } });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => `${x.code}:${x.path}` === 'unknown-field:close'));
});

// ---- {ok, reds, config}: the double-parse dies ----

test('validateConfig returns the parsed config on ok, null on red', () => {
  const ok = validateConfig(JSON.stringify(WF));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.config, WF);
  const red = validateConfig({ ...WF, schema: 'v9' });
  assert.equal(red.ok, false);
  assert.equal(red.config, null);
});

// ---- two-layer fence: workflow scope must fit inside the job's (decision #4) ----

test('workflow scope inside the job fence passes; outside reds scope-escape', () => {
  const inside = validateConfig({ ...WF, gate: { budgetUsd: 1, writeScope: ['src/gen/**'] } }, { jobWriteScope: JOB1.writeScope });
  assert.deepEqual(inside.reds, []);
  const equal = validateConfig(WF, { jobWriteScope: JOB1.writeScope });
  assert.deepEqual(equal.reds, []);
  const outside = validateConfig({ ...WF, gate: { budgetUsd: 1, writeScope: ['docs/**'] } }, { jobWriteScope: JOB1.writeScope });
  assert.equal(outside.ok, false);
  assert.equal(`${outside.reds[0].code}:${outside.reds[0].path}`, 'scope-escape:gate.writeScope.0');
});

test('prefix-boundary trap: src2/** is NOT inside src/** (string prefix is not path prefix)', () => {
  const r = validateConfig({ ...WF, gate: { budgetUsd: 1, writeScope: ['src2/**'] } }, { jobWriteScope: ['src/**'] });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'scope-escape');
});

test('leading ./ normalizes across the layers (./src/** fits inside src/**)', () => {
  const r = validateConfig({ ...WF, gate: { budgetUsd: 1, writeScope: ['./src/**'] } }, { jobWriteScope: ['src/**'] });
  assert.deepEqual(r.reds, []);
});

test('without the jobWriteScope opt, behavior is unchanged (N0 shape)', () => {
  const r = validateConfig({ ...WF, gate: { budgetUsd: 1, writeScope: ['docs/**'] } });
  assert.equal(r.ok, true);
});

// ---- signing: hash + approval record (the runner enforces at N2; pure here) ----

test('jobSpecHash is stable under key order and 64-hex', () => {
  const reordered = { escalation: JOB1.escalation, steps: JOB1.steps, writeScope: JOB1.writeScope, budgetUsd: JOB1.budgetUsd, cadence: JOB1.cadence, conditions: JOB1.conditions, provider: JOB1.provider, description: JOB1.description, job: JOB1.job, schema: JOB1.schema };
  assert.equal(jobSpecHash(JOB1), jobSpecHash(reordered));
  assert.match(jobSpecHash(JOB1), /^[0-9a-f]{64}$/);
});

test('any spec change changes the hash (approval binds to the exact version)', () => {
  assert.notEqual(jobSpecHash(JOB1), jobSpecHash(mut((j) => { j.budgetUsd = 1.4; })));
  assert.notEqual(jobSpecHash(JOB1), jobSpecHash(mut((j) => { j.steps[0].close.cmd = 'npm test --silent'; })));
});

test('checkApproval: matching record approves; stale hash, empty, or garbage never do — and never throw', () => {
  const signed = [{ specHash: jobSpecHash(JOB1), signer: 'hamr', ts: '2026-07-12T00:00:00Z' }];
  assert.equal(checkApproval(JOB1, signed), true);
  assert.equal(checkApproval(mut((j) => { j.budgetUsd = 1.4; }), signed), false, 'edited spec must re-approve');
  assert.equal(checkApproval(JOB1, []), false);
  for (const garbage of [undefined, null, 42, 'yes', [{}], [{ specHash: 7 }]]) {
    assert.equal(checkApproval(JOB1, garbage), false, `${JSON.stringify(garbage)} must not approve`);
  }
});
