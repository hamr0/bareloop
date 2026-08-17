// Layer 3 modules 4+5 — the D7 ENVELOPE and the REUSE RUNNER, as behaviour tests.
//
// What is under test is the COMPOSITION, and the four rulings it must not be able to
// break:
//
//  - **D7** — three explicit operator numbers, no defaults (a defaulted cap is a silent
//    second ceiling), and the envelope may only TIGHTEN a signed cap. An envelope that
//    widens `budgetUsd`/`maxWallMs` is a validation red, never a silent raise.
//  - **R1** — only a green writes the box. A green appends a VERSION (the plan as
//    executed); a graded red appends a HISTORY ROW only; a casualty is not a red.
//  - **D3** — a pinned workflow is refused only EXPLICITLY, and the decision then goes
//    back to the operator. The picker can never silently substitute another one, and it
//    can never silently be overridden either.
//  - **F6/F45** — spend and time are reported honestly per try (unknown is unknown), and
//    the row says whether the close was ever reached, so a cap that could not fund
//    attempt+close is VISIBLE rather than inferred.
//
// The job runner is injected (`runJob`), exactly as the provider is: a try is a real
// paid run, and the loop's own logic — selection order, exclusion, minting, exhaustion —
// is what these tests are for. ONE test at the bottom wires the REAL `runJob` through
// `runReuse`, because a scripted fake cannot prove the composition itself works (the
// standing lesson: a fake that never reaches the real seam masks the bug that lives
// there).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateEnvelope, resolveTrySpec, resolveReuse, reuseSpecHash, selectBridge, runReuse, REUSE_GRADED_RED, CHECKPOINT_OUTCOMES } from '../src/reuse.js';
import { HUMAN_CHECKPOINTS } from '../src/declaredclose.js';
import { makeRegistry, saveBridge, loadRegistry, loadBridge, deriveStatus } from '../src/bridges.js';
import { jobSpecHash, validateJob } from '../src/job.js';
import { classifyIncidents } from '../src/ledger.js';
import { runJob } from '../src/run.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

const base = mkdtempSync(join(tmpdir(), 'reuse-test-'));
let n = 0;
const freshRegistry = () => makeRegistry(join(base, `reg-${n += 1}`));

// ── fixtures ────────────────────────────────────────────────────────────────
const JOB = (over = {}) => ({
  schema: 'job-v1',
  job: 'types-migration',
  description: 'a plan-shape job with a staged close',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 5,
  maxWallMs: 1_800_000,
  writeScope: ['src/**'],
  goal: 'Make the package pass tsc --strict without weakening the tests.',
  verdictType: 'green',
  close: [{ name: 'typecheck', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const ENVELOPE = (over = {}) => ({ perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2, ...over });

const PLAN = (id = 'fix-types') => ({
  schema: 'plan-v1',
  steps: [{ id, action: 'Fix the types.', tools: ['read', 'edit'], rounds: 8, target: 'src/x.js', exit: [{ type: 'tree-changed', scope: 'src/**' }] }],
});

const BRIDGE = (name, over = {}) => ({
  schema: 'bridge-v1',
  name,
  goal: 'Make the package pass tsc --strict without weakening the tests.',
  specHash: 'signed-hash',
  closeStageNames: ['typecheck'],
  toolsUsed: ['read', 'edit'],
  versions: [{ plan: PLAN(), runid: 'ms1', greenAt: '2026-07-27T10:00:00Z', patient: 'aurora-u', costUsd: 2.21, wallMs: 534_000, rounds: 40 }],
  history: [{ at: '2026-07-27T10:00:00Z', runid: 'ms1', patient: 'aurora-u', outcome: 'green', failingStage: null, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 40 }],
  ...over,
});

/** a registry directory seeded with the given entries */
const seed = (...bridges) => {
  const dir = freshRegistry();
  for (const b of bridges) {
    const r = saveBridge(dir, b);
    assert.equal(r.ok, true, `fixture bridge must be valid: ${JSON.stringify(r.reds)}`);
  }
  return dir;
};

/** a selection provider that answers with one JSON pick (the real answer shape) */
const picker = (...answers) => scriptedProvider(answers.map((a) => ({ text: typeof a === 'string' ? a : JSON.stringify(a) })));

/**
 * A scripted JOB RUNNER with runJob's own emission contract: every entry emits the
 * events the reuse runner reads back (job-end money, plan-accepted, outer-close,
 * worker-round) and returns runJob's outcome string. The seam is the same class as the
 * provider — a try is a real paid run, and nothing about the loop's logic needs one.
 */
const scriptedRuns = (script) => {
  /** @type {any[]} */
  const calls = [];
  let i = 0;
  const fn = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    const s = script[Math.min(i, script.length - 1)];
    i += 1;
    calls.push({ spec, bridge: opts.bridge, shellCapUsd: opts.shellCapUsd, workdir: opts.workdir });
    opts.emit('worker-round', { kind: 'turn', costUsd: s.costUsd ?? 0.5 });
    if (s.plan !== undefined) opts.emit('plan-accepted', { plan: s.plan });
    if (s.closeStage !== undefined) opts.emit('outer-close', { verdict: s.outcome === 'green' ? 'satisfied' : 'red', stage: s.closeStage });
    opts.emit('job-end', { outcome: s.outcome, spentUsd: s.spentUsd ?? 1, spendComplete: s.spendComplete ?? true });
    return s.outcome;
  };
  return Object.assign(fn, { calls });
};

const runOpts = (over = {}) => ({
  job: JOB(),
  approvals: [],
  registryDir: null,
  envelope: ENVELOPE(),
  patient: 'litectx-u',
  workdir: base,
  provider: picker({ choice: null, reason: 'none' }),
  selectionProvider: picker({ choice: null, reason: 'none' }),
  emit: () => ({}),
  ...over,
});

// ── D7: the envelope ────────────────────────────────────────────────────────

test('envelope: all three numbers are REQUIRED and explicit — no defaults', () => {
  for (const missing of ['perTryBudgetUsd', 'perTryWallMs', 'bridgeTries']) {
    const env = ENVELOPE();
    delete env[missing];
    const v = validateEnvelope(env, { job: JOB() });
    assert.equal(v.ok, false, `${missing} must be required`);
    assert.ok(v.reds.some((r) => r.path === missing && r.code === 'missing-required'), JSON.stringify(v.reds));
  }
});

test('envelope: bridgeTries 0 is LEGAL (force-cold); a negative or fractional count is not', () => {
  assert.equal(validateEnvelope(ENVELOPE({ bridgeTries: 0 }), { job: JOB() }).ok, true);
  assert.equal(validateEnvelope(ENVELOPE({ bridgeTries: -1 }), { job: JOB() }).ok, false);
  assert.equal(validateEnvelope(ENVELOPE({ bridgeTries: 1.5 }), { job: JOB() }).ok, false);
});

test('envelope: an envelope that WIDENS the signed budget is a red, never a silent raise', () => {
  const v = validateEnvelope(ENVELOPE({ perTryBudgetUsd: 9 }), { job: JOB() }); // spec says 5
  assert.equal(v.ok, false);
  assert.ok(v.reds.some((r) => r.code === 'envelope-widens' && r.path === 'perTryBudgetUsd'), JSON.stringify(v.reds));
});

test('envelope: an envelope that WIDENS the signed wall is a red', () => {
  const v = validateEnvelope(ENVELOPE({ perTryWallMs: 3_600_000 }), { job: JOB() }); // spec says 1_800_000
  assert.equal(v.ok, false);
  assert.ok(v.reds.some((r) => r.code === 'envelope-widens' && r.path === 'perTryWallMs'), JSON.stringify(v.reds));
});

test('envelope: TIGHTENING is legal in both directions, and a time-unbounded spec can always be bounded', () => {
  assert.equal(validateEnvelope(ENVELOPE({ perTryBudgetUsd: 2, perTryWallMs: 600_000 }), { job: JOB() }).ok, true);
  const unbounded = JOB();
  delete unbounded.maxWallMs;
  assert.equal(validateEnvelope(ENVELOPE({ perTryWallMs: 3_600_000 }), { job: unbounded }).ok, true,
    'a spec with no wall is unbounded — ANY wall is a tightening');
});

test('resolveTrySpec: the per-try numbers ride on the spec, and an unchanged envelope is HASH-IDENTICAL', () => {
  const job = JOB();
  const same = resolveTrySpec(job, ENVELOPE());
  assert.equal(jobSpecHash(same), jobSpecHash(job), 'an envelope equal to the spec needs no new signature');
  const tighter = resolveTrySpec(job, ENVELOPE({ perTryBudgetUsd: 2, perTryWallMs: 600_000 }));
  assert.equal(tighter.budgetUsd, 2);
  assert.equal(tighter.maxWallMs, 600_000);
  assert.notEqual(jobSpecHash(tighter), jobSpecHash(job), 'a tightened spec is a NEW spec version and must be re-signed');
});

// ── the SIGNED artifact: all three envelope numbers, one hash ───────────────
//
// The envelope is THREE operator numbers and the worst case is
// `perTryBudgetUsd × (bridgeTries + 1)`, so a signature covering only the per-try budget
// and wall leaves the MULTIPLIER unsigned: `--tries 0` and `--tries 9` would print the
// same hash while authorizing ten times the spend. The resolved artifact the operator
// signs is therefore the WRAPPER `{ spec, bridgeTries }`, not the per-try spec alone —
// `validateJob` reds an unknown field, so `bridgeTries` cannot ride ON the spec without
// making every try a `job-red` (asserted below, so nobody "simplifies" it back).

test('the approval hash pins ALL THREE envelope numbers — changing only the try count flips it', () => {
  const job = JOB();
  const two = reuseSpecHash(resolveReuse(job, ENVELOPE({ bridgeTries: 2 })));
  const three = reuseSpecHash(resolveReuse(job, ENVELOPE({ bridgeTries: 3 })));
  assert.notEqual(two, three, 'tries is the spend MULTIPLIER — a signature blind to it signs an unknown worst case');
  // and the other two still bite, through the per-try spec they resolve onto
  assert.notEqual(two, reuseSpecHash(resolveReuse(job, ENVELOPE({ bridgeTries: 2, perTryBudgetUsd: 2 }))));
  assert.notEqual(two, reuseSpecHash(resolveReuse(job, ENVELOPE({ bridgeTries: 2, perTryWallMs: 600_000 }))));
});

test('the approval hash is STABLE: the same three numbers hash the same, from either key order', () => {
  const job = JOB();
  const a = reuseSpecHash(resolveReuse(job, { perTryBudgetUsd: 3, perTryWallMs: 900_000, bridgeTries: 1 }));
  const b = reuseSpecHash(resolveReuse(JOB(), { bridgeTries: 1, perTryWallMs: 900_000, perTryBudgetUsd: 3 }));
  assert.equal(a, b, 'a signature must survive a re-run of the same envelope');
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('the signed artifact WRAPS the per-try spec — tries on the spec itself would job-red every try', () => {
  const job = JOB();
  const resolved = resolveReuse(job, ENVELOPE({ bridgeTries: 2 }));
  // the half runJob executes is a valid job spec, unchanged in kind
  assert.equal(validateJob(resolved.spec, { shellCapUsd: 100 }).ok, true, JSON.stringify(validateJob(resolved.spec, { shellCapUsd: 100 }).reds));
  assert.equal(resolved.bridgeTries, 2);
  assert.equal(resolved.spec.bridgeTries, undefined, 'the count never rides ON the spec');
  // the evidence for that choice, as a guard: validateJob reds any unknown field
  const onSpec = validateJob({ ...resolved.spec, bridgeTries: 2 }, { shellCapUsd: 100 });
  assert.equal(onSpec.ok, false);
  assert.ok(onSpec.reds.some((r) => r.code === 'unknown-field' && r.path === 'bridgeTries'));
});

// ── D3: selection ───────────────────────────────────────────────────────────

test('selection: the model picks a name from the listing, and the choice + reason come back', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const registry = loadRegistry(dir);
  const provider = picker({ choice: 'beta', reason: 'same kind of migration' });
  const sel = await selectBridge({ registry, job: JOB(), ask: 'tighten the types', provider });
  assert.equal(sel.choice, 'beta');
  assert.match(sel.reason, /same kind/);
  assert.equal(sel.called, true);
  assert.equal(typeof sel.costUsd, 'number', 'the selection call is metered (F6)');
  assert.match(provider.calls[0], /SELECT-WORKFLOW/);
  assert.match(provider.calls[0], /\[alpha\]/);
});

test('selection: "none matches" is a first-class answer and carries its reason', async () => {
  const dir = seed(BRIDGE('alpha'));
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider: picker({ choice: null, reason: 'different kind of work' }) });
  assert.equal(sel.choice, null);
  assert.match(sel.reason, /different kind/);
});

test('selection: a name that is NOT in the listing is a red, never used', async () => {
  const dir = seed(BRIDGE('alpha'));
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider: picker({ choice: 'invented', reason: 'made it up' }) });
  assert.equal(sel.choice, null);
  assert.ok(sel.red, 'a hallucinated name is a named red');
  assert.equal(sel.red.code, 'selection-invalid');
});

test('selection: unparseable output is a red, not a silent cold fall-back', async () => {
  const dir = seed(BRIDGE('alpha'));
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider: picker('I think alpha looks good, honestly.') });
  assert.equal(sel.choice, null);
  assert.ok(sel.red);
});

test('selection: a PIN is stated in the call and CONFIRMED — not bypassed', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const provider = picker({ choice: 'beta', reason: 'the pin fits' });
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider, pinned: 'beta' });
  assert.equal(sel.called, true, 'a pin still runs the call — the model may refuse it (D3)');
  assert.match(provider.calls[0], /beta/);
  assert.match(provider.calls[0].toLowerCase(), /pin/);
  assert.equal(sel.choice, 'beta');
  assert.notEqual(sel.refused, true);
});

test('selection: a pin the model declines comes back REFUSED with the reason — never silently substituted', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider: picker({ choice: 'alpha', reason: 'beta greened on a different close' }), pinned: 'beta' });
  assert.equal(sel.refused, true);
  assert.equal(sel.choice, null, 'the substitute is NOT adopted — the decision goes back to the operator');
  assert.match(sel.reason, /different close/);
});

test('selection: a shortlist restricts the listing to those names', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'), BRIDGE('gamma'));
  const provider = picker({ choice: 'gamma', reason: 'ok' });
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider, shortlist: ['beta', 'gamma'] });
  assert.doesNotMatch(provider.calls[0], /\[alpha\]/, 'a name outside the shortlist is not offered');
  assert.match(provider.calls[0], /\[gamma\]/);
  assert.equal(sel.choice, 'gamma');
});

test('selection: forceCold and an EMPTY registry both skip the call entirely — $0, no tokens', async () => {
  const provider = picker({ choice: 'alpha', reason: 'x' });
  const cold = await selectBridge({ registry: loadRegistry(seed(BRIDGE('alpha'))), job: JOB(), ask: 'x', provider, forceCold: true });
  assert.equal(cold.called, false);
  assert.equal(cold.choice, null);
  assert.equal(cold.costUsd, 0);
  const empty = await selectBridge({ registry: loadRegistry(freshRegistry()), job: JOB(), ask: 'x', provider });
  assert.equal(empty.called, false);
  assert.equal(empty.choice, null);
  assert.equal(provider.calls.length, 0, 'neither path spent a token');
});

// ── the try loop ────────────────────────────────────────────────────────────

test('try loop: a GREEN on the first try ENDS the loop — the job is done', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const runs = scriptedRuns([{ outcome: 'green', plan: PLAN('as-executed'), closeStage: 'typecheck' }]);
  const r = await runReuse(runOpts({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: runs,
  }));
  assert.equal(r.outcome, 'green');
  assert.equal(runs.calls.length, 1, 'a green must not fall through to a second try or to the cold leg');
  assert.equal(r.tries.length, 1);
});

test('R1: a green appends a VERSION carrying the plan AS EXECUTED, and the box is saved', async () => {
  const dir = seed(BRIDGE('alpha'));
  const r = await runReuse(runOpts({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('as-executed'), closeStage: 'typecheck', spentUsd: 1.75 }]),
  }));
  assert.equal(r.outcome, 'green');
  const saved = loadBridge(join(dir, 'alpha.json'));
  assert.equal(saved.ok, true, JSON.stringify(saved.reds));
  assert.equal(saved.bridge.versions.length, 2, 'the green minted the NEXT version');
  assert.equal(saved.bridge.versions.at(-1).plan.steps[0].id, 'as-executed', 'the plan that RAN is what inherits');
  assert.equal(saved.bridge.versions.at(-1).patient, 'litectx-u');
  assert.equal(saved.bridge.versions.at(-1).costUsd, 1.75);
  assert.equal(saved.bridge.history.at(-1).outcome, 'green');
  assert.equal(deriveStatus(saved.bridge.history), 'proven', 'greens on two distinct patients');
});

test('R1: a GRADED RED writes a history row ONLY — the recipe is never edited by a red', async () => {
  const dir = seed(BRIDGE('alpha'));
  const before = loadBridge(join(dir, 'alpha.json')).bridge;
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 1 }),
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', plan: PLAN('tried'), spentUsd: 2 },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2 }, // the cold leg
    ]),
  }));
  assert.notEqual(r.outcome, 'green');
  const after = loadBridge(join(dir, 'alpha.json')).bridge;
  assert.deepEqual(after.versions, before.versions, 'a red mints NO version');
  assert.equal(after.history.length, before.history.length + 1);
  assert.equal(after.history.at(-1).outcome, 'red');
  assert.equal(after.history.at(-1).failingStage, 'typecheck', 'the row names the stage that rendered the red');
  assert.ok(REUSE_GRADED_RED.includes('escalated'));
});

test('the row names the stage that rendered the LAST verdict — `outer-close` is only the pre-fix-loop reading', async () => {
  // FAITHFUL to planrun's real emission order (the point of this test): `outer-close`
  // fires ONCE, BEFORE the close-fix loop; every later verdict arrives as ralph's
  // `close-verdict`. `escalated` — the only outcome that demotes — is decided AFTER that
  // loop, so a row read from `outer-close` names a stale stage whenever the fix loop
  // moved the wall. A step's own exit-loop verdict carries NO stage and must not count.
  const job = JOB({
    close: [
      { name: 'stage-a', cmd: 'node a.mjs', expect: 0, gapKeep: '^FAILED' },
      { name: 'stage-b', cmd: 'node b.mjs', expect: 0, gapKeep: '^FAILED' },
    ],
  });
  const dir = seed(BRIDGE('alpha', { closeStageNames: ['stage-a', 'stage-b'] }));
  const runs = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    opts.emit('worker-round', { kind: 'turn', costUsd: 0.5 });
    opts.emit('plan-accepted', { plan: PLAN('tried') });
    opts.emit('close-verdict', { iteration: 1, verdict: 'needs_revision' }); // a STEP's exit loop — no stage
    opts.emit('outer-close', { verdict: 'needs_revision', stage: 'stage-a' });
    opts.emit('fix-loop', { gapBytes: 120 });
    opts.emit('close-verdict', { iteration: 1, verdict: 'needs_revision', stage: 'stage-a' });
    opts.emit('close-verdict', { iteration: 2, verdict: 'needs_revision', stage: 'stage-b' }); // stage-a fixed; stage-b is the wall now
    opts.emit('job-end', { outcome: 'escalated', spentUsd: 1, spendComplete: true });
    return 'escalated';
  };
  const r = await runReuse(runOpts({
    job,
    envelope: ENVELOPE({ bridgeTries: 1 }),
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: runs,
  }));
  assert.equal(r.tries[0].failingStage, 'stage-b', 'the stage the close actually ended at, not the one it opened at');
  assert.equal(loadBridge(join(dir, 'alpha.json')).bridge.history.at(-1).failingStage, 'stage-b', 'and that is what the demoting row records');

  // …and the FALLBACK: when the fix loop dies before rendering a verdict of its own, the
  // only close reading that exists is `outer-close`'s — and a STEP's stage-less verdict
  // (the exit evaluator's, sitting later in no slice but earlier in this one) must not
  // blank it out.
  const dir2 = seed(BRIDGE('alpha', { closeStageNames: ['stage-a', 'stage-b'] }));
  const died = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    opts.emit('worker-round', { kind: 'turn', costUsd: 0.5 });
    opts.emit('close-verdict', { iteration: 1, verdict: 'needs_revision' }); // a step exit loop — no stage
    opts.emit('outer-close', { verdict: 'needs_revision', stage: 'stage-a' });
    opts.emit('fix-loop', { gapBytes: 90 });
    opts.emit('job-end', { outcome: 'provider-red', spentUsd: 0.6, spendComplete: false });
    return 'provider-red'; // the fix worker's transport died before any close-verdict
  };
  const r2 = await runReuse(runOpts({
    job,
    envelope: ENVELOPE({ bridgeTries: 1 }),
    registryDir: dir2,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: died,
  }));
  assert.equal(r2.tries[0].failingStage, 'stage-a', 'no later close verdict exists, so outer-close stands — a stage-less step verdict never overrides it');
});

test('R1: a CASUALTY is recorded under its own outcome and does NOT demote', async () => {
  // a PROVEN entry (greens on two distinct patients) — the only status a red can drop
  const proven = BRIDGE('alpha', {
    versions: [
      { plan: PLAN(), runid: 'ms1', greenAt: '2026-07-27T10:00:00Z', patient: 'aurora-u', costUsd: 1, wallMs: 1000, rounds: 4 },
      { plan: PLAN(), runid: 'ms2', greenAt: '2026-07-28T10:00:00Z', patient: 'litectx-u', costUsd: 1, wallMs: 1000, rounds: 4 },
    ],
    history: [
      { at: '2026-07-27T10:00:00Z', runid: 'ms1', patient: 'aurora-u', outcome: 'green', failingStage: null, costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 4 },
      { at: '2026-07-28T10:00:00Z', runid: 'ms2', patient: 'litectx-u', outcome: 'green', failingStage: null, costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 4 },
    ],
  });
  const dir = seed(proven);
  assert.equal(deriveStatus(proven.history), 'proven');
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 1 }),
    registryDir: dir,
    patient: 'third-patient',
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: scriptedRuns([
      { outcome: 'provider-red', spentUsd: 0.4, spendComplete: false },
      { outcome: 'provider-red', spentUsd: 0.4, spendComplete: false },
    ]),
  }));
  assert.equal(r.tries[0].verdictClass, 'casualty');
  const after = loadBridge(join(dir, 'alpha.json')).bridge;
  assert.equal(after.history.at(-1).outcome, 'provider-red', 'the casualty keeps its OWN name');
  assert.equal(deriveStatus(after.history), 'proven', 'a casualty is never evidence — it cannot demote');
  assert.equal(after.history.at(-1).spendComplete, false, 'the floor travels with the spend (F44)');
});

/** a PROVEN entry: greens on two distinct patients — the only status a red can drop */
const PROVEN = () => BRIDGE('alpha', {
  versions: [
    { plan: PLAN(), runid: 'ms1', greenAt: '2026-07-27T10:00:00Z', patient: 'aurora-u', costUsd: 1, wallMs: 1000, rounds: 4 },
    { plan: PLAN(), runid: 'ms2', greenAt: '2026-07-28T10:00:00Z', patient: 'litectx-u', costUsd: 1, wallMs: 1000, rounds: 4 },
  ],
  history: [
    { at: '2026-07-27T10:00:00Z', runid: 'ms1', patient: 'aurora-u', outcome: 'green', failingStage: null, costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 4 },
    { at: '2026-07-28T10:00:00Z', runid: 'ms2', patient: 'litectx-u', outcome: 'green', failingStage: null, costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 4 },
  ],
});

test('R1/D6 DEMOTION TABLE: `escalated` demotes a PROVEN entry; every other non-green outcome keeps its own name and leaves the status alone', async () => {
  // The rule had ONE guard — `REUSE_GRADED_RED.includes('escalated')` — which is
  // one-directional: it says the set CONTAINS the demoting outcome and nothing about what
  // it must not contain. A widened set (`['escalated','step-red','cap-halt']`) survived
  // the whole suite. This is the other direction, run through the real loop rather than
  // asserted against the constant: what the registry actually records, and what the
  // status ladder actually does, per outcome.
  const run = async (/** @type {string} */ outcome) => {
    const dir = seed(PROVEN());
    assert.equal(deriveStatus(PROVEN().history), 'proven', 'the fixture starts proven, so a demotion is visible');
    const r = await runReuse(runOpts({
      envelope: ENVELOPE({ bridgeTries: 1 }),
      registryDir: dir,
      patient: 'third-patient',
      selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
      runJob: scriptedRuns([{ outcome, closeStage: 'typecheck', spentUsd: 0.4 }]),
    }));
    const after = loadBridge(join(dir, 'alpha.json')).bridge;
    return { row: r.tries[0], last: after.history.at(-1), status: deriveStatus(after.history), versions: after.versions.length };
  };

  // the ONE graded red: the close judged the tree and the tree failed
  const esc = await run('escalated');
  assert.equal(esc.row.verdictClass, 'red');
  assert.equal(esc.last.outcome, 'red', 'a graded red is recorded as the literal `red` the status ladder reads');
  assert.notEqual(esc.status, 'proven', 'and it DEMOTES — that is the whole point of the set');
  assert.equal(esc.versions, 2, 'a red still mints no version');

  // everything else: a stop, a fault or a transport death. None of them is the close
  // saying anything about this recipe, so none may cost the recipe its status.
  // `step-red` appears in BOTH spellings on purpose: runJob RETURNS `step-red:<id>` but
  // writes the BARE `step-red` onto job-end, and the resume reconstruction classifies
  // from that record — so both strings genuinely reach the classifier.
  for (const outcome of ['step-red:write-test', 'step-red', 'cap-halt', 'wall-halt', 'provider-red', 'close-red', 'step-stalled', 'pricing-red']) {
    const c = await run(outcome);
    assert.equal(c.row.verdictClass, 'casualty', `${outcome}: a casualty is never evidence (F45)`);
    assert.equal(c.last.outcome, outcome, `${outcome}: the row keeps its OWN name, never flattened to 'red'`);
    assert.equal(c.status, 'proven', `${outcome}: a proven recipe survives a stop that never graded it`);
    assert.equal(c.versions, 2, `${outcome}: and nothing is minted either`);
  }
});

test('N4: a HUMAN CHECKPOINT stops the loop dead — no further try, no cold leg, and nothing written to the box', async () => {
  // hamr's ruling: a run waiting on a PERSON is a pause, not a casualty and not a retry
  // trigger. It used to be neither — `hitl-pause` fell past the graded-red set into
  // `casualty`, `hardStop` had no entry for it, and a null there means CARRY ON: the run
  // bought another paid bridge try (and then the cold leg) while a human decision on the
  // first one was still outstanding, and filed the pause on the bridge as an
  // `appendCasualty` row.
  //
  // The loop is over the LIBRARY's own list, not a spelling of it: a fifth human
  // checkpoint minted in `declaredclose.js` is covered by this test the day it is added,
  // and a rename of any of them cannot leave a hand-typed copy behind.
  for (const outcome of HUMAN_CHECKPOINTS) {
    const dir = seed(PROVEN(), BRIDGE('beta'));
    const runs = scriptedRuns([{ outcome, closeStage: 'human-review', spentUsd: 0.4 }, { outcome: 'green', plan: PLAN(), spentUsd: 0.4 }]);
    const r = await runReuse(runOpts({
      envelope: ENVELOPE({ bridgeTries: 2 }),
      registryDir: dir,
      patient: 'third-patient',
      selectionProvider: picker({ choice: 'alpha', reason: 'fits' }, { choice: 'beta', reason: 'next' }),
      runJob: runs,
    }));

    assert.equal(runs.calls.length, 1, `${outcome}: exactly ONE run — the second try and the cold leg are never bought while a person is deciding`);
    assert.equal(r.tries.length, 1, `${outcome}: and the readout holds that one try only`);
    assert.equal(r.outcome, outcome, `${outcome}: the pause is the run's own terminal, surfaced verbatim`);
    // …and the ROW says what it is. A pause used to fall past the graded-red set into
    // `casualty`, which reads as a run that died — the one thing it is not: nothing
    // failed, nothing is lost, and the answer it is waiting for is a person's.
    assert.equal(r.tries[0].verdictClass, 'checkpoint', `${outcome}: a pause is a checkpoint, never a casualty`);
    assert.ok(r.decision, `${outcome}: and it comes back decision-ready, so the operator knows a human answer is owed`);

    const after = loadBridge(join(dir, 'alpha.json')).bridge;
    assert.deepEqual(after.history, PROVEN().history, `${outcome}: the box is untouched — a pause is not a casualty row`);
    assert.equal(after.versions.length, 2, `${outcome}: and nothing is minted`);
    assert.equal(deriveStatus(after.history), 'proven', `${outcome}: a pause can never demote`);
    assert.ok(!r.bridgeWrites.some((w) => w.action === 'appendCasualty' || w.action === 'appendRed'),
      `${outcome}: no history write of any kind: ${JSON.stringify(r.bridgeWrites)}`);
  }
});

test('N4: the human-checkpoint set is the PAUSE half of CHECKPOINT_OUTCOMES — the allowance halts are not in it', () => {
  // the other direction, for `REUSE_GRADED_RED`'s reason (a set guarded only by what it
  // CONTAINS survives being widened). `CHECKPOINT_OUTCOMES` is the RESUME list — every
  // stop that left work on disk and an allowance unspent — and three of its four members
  // are governance stops whose carry-on the demotion-table test above asserts
  // deliberately. Folding the hard stop onto that list would silently end a run at its
  // first cap-halt.
  assert.ok(HUMAN_CHECKPOINTS.length > 0, 'an empty set would make the stop above unreachable');
  for (const o of HUMAN_CHECKPOINTS) assert.ok(CHECKPOINT_OUTCOMES.includes(o), `${o}: a human checkpoint is still a resumable checkpoint`);
  for (const o of ['cap-halt', 'wall-halt', 'step-stalled']) {
    assert.ok(!HUMAN_CHECKPOINTS.includes(o), `${o}: an allowance halt is not a person deciding — its carry-on is asserted above`);
  }
});

test('an ALREADY-GREEN tree ends the loop but mints NOTHING — no unearned learning credit', async () => {
  const dir = seed(BRIDGE('alpha'));
  const runs = scriptedRuns([{ outcome: 'already-green' }]); // no plan-accepted: nothing was drafted
  const r = await runReuse(runOpts({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: runs,
  }));
  assert.equal(runs.calls.length, 1, 'the job is done — there is nothing to try');
  const after = loadBridge(join(dir, 'alpha.json')).bridge;
  assert.equal(after.versions.length, 1, 'nothing inherits from a green that predates the run');
  assert.equal(r.bridgeWrites[0].action, 'none');
  assert.equal(r.bridgeWrites[0].reds[0].code, 'green-predates-run');
});

test('…and it mints nothing even with a PLAN on the spine — the guard is the TERMINAL, not the absence of a plan', async () => {
  // N4's shape, and the reason this needed a wired guard rather than an accident:
  // a hitl try that PAUSED and then came back with the signer's `accept` lands
  // `already-green` (the close was satisfied before that leg did anything) with
  // its predecessor's `plan-accepted` sitting in the very same try window. Read
  // by the old rule — "green with no plan mints nothing" — that plan WOULD have
  // minted a version for a green nobody's plan produced.
  const dir = seed(BRIDGE('alpha'));
  const runs = scriptedRuns([{ outcome: 'already-green', plan: PLAN('from-the-paused-leg'), closeStage: 'typecheck' }]);
  const r = await runReuse(runOpts({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: runs,
  }));
  const after = loadBridge(join(dir, 'alpha.json')).bridge;
  assert.equal(after.versions.length, 1, 'no version minted');
  assert.equal(r.bridgeWrites[0].action, 'none');
  assert.equal(r.bridgeWrites[0].reds[0].code, 'green-predates-run');
  // the CONTROL, byte-identical but for the terminal: a real green DOES mint
  const dir2 = seed(BRIDGE('alpha'));
  await runReuse(runOpts({
    registryDir: dir2,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('from-the-paused-leg'), closeStage: 'typecheck' }]),
  }));
  assert.equal(loadBridge(join(dir2, 'alpha.json')).bridge.versions.length, 2, 'the two arms must differ');
});

test('try loop: after a red the NEXT try re-runs selection with the failed bridge EXCLUDED', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const provider = picker({ choice: 'alpha', reason: 'first' }, { choice: 'beta', reason: 'second' });
  const runs = scriptedRuns([
    { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
    { outcome: 'green', plan: PLAN('second-try'), closeStage: 'typecheck', spentUsd: 1 },
  ]);
  const r = await runReuse(runOpts({ registryDir: dir, selectionProvider: provider, runJob: runs }));
  assert.equal(r.outcome, 'green');
  assert.equal(runs.calls.length, 2);
  assert.equal(runs.calls[0].bridge.name, 'alpha');
  assert.equal(runs.calls[1].bridge.name, 'beta');
  assert.doesNotMatch(provider.calls[1], /\[alpha\]/, 'the failed bridge is not offered again');
  assert.match(provider.calls[1], /\[beta\]/);
});

test('try loop: the registry is RE-READ before each try, so the next pick sees rows written since the run began', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('gamma'));
  const provider = picker({ choice: 'alpha', reason: 'first' }, { choice: 'gamma', reason: 'second' });
  // between selection 1 and selection 2 the registry changes on disk (here: gamma takes a
  // red, exactly as the runner's own R1 write does for the bridge it just tried). A
  // listing built from a registry read ONCE at the top would still show gamma at 0 reds.
  const runs = async (spec, opts) => {
    const g = loadBridge(join(dir, 'gamma.json')).bridge;
    if (g.history.length === 1) {
      const next = JSON.parse(readFileSync(join(dir, 'gamma.json'), 'utf8'));
      next.history.push({ at: null, runid: 'external', patient: 'somewhere-else', outcome: 'red', failingStage: 'typecheck', costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 3 });
      assert.equal(saveBridge(dir, next).ok, true);
    }
    opts.emit('job-end', { outcome: 'escalated', spentUsd: 1, spendComplete: true });
    opts.emit('outer-close', { verdict: 'red', stage: 'typecheck' });
    return 'escalated';
  };
  await runReuse(runOpts({ registryDir: dir, selectionProvider: provider, runJob: runs }));
  assert.match(provider.calls[1], /\[gamma\][\s\S]*?1 green · 1 red/, 'the second listing carries the row written after the first selection');
});

test('try loop: a load-gate refusal costs nothing, is recorded, and moves to the next candidate', async () => {
  const stale = BRIDGE('stale', { closeStageNames: ['some-other-stage'] });
  const dir = seed(stale, BRIDGE('beta'));
  const runs = scriptedRuns([
    { outcome: 'recipe-stale', spentUsd: 0 },
    { outcome: 'green', plan: PLAN('beta-ran'), closeStage: 'typecheck', spentUsd: 1 },
  ]);
  const r = await runReuse(runOpts({
    registryDir: dir,
    selectionProvider: picker({ choice: 'stale', reason: 'looks close' }, { choice: 'beta', reason: 'next' }),
    runJob: runs,
  }));
  assert.equal(r.outcome, 'green');
  assert.equal(r.tries[0].runOutcome, 'recipe-stale');
  assert.equal(r.tries[0].spentUsd, 0, 'a gate refusal is $0');
  assert.equal(runs.calls[1].bridge.name, 'beta');
});

test('try loop: tries EXHAUSTED falls through to a COLD run under the SAME per-try numbers', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const runs = scriptedRuns([
    { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
    { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
    { outcome: 'green', plan: PLAN('cold-plan'), closeStage: 'typecheck', spentUsd: 1 },
  ]);
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 2, perTryBudgetUsd: 3, perTryWallMs: 900_000 }),
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: runs,
  }));
  assert.equal(r.outcome, 'green');
  assert.equal(runs.calls.length, 3);
  assert.equal(runs.calls[2].bridge, null, 'the cold leg carries NO bridge');
  for (const c of runs.calls) {
    assert.equal(c.spec.budgetUsd, 3, 'every try — cold included — runs under the per-try budget');
    assert.equal(c.spec.maxWallMs, 900_000);
    assert.equal(c.shellCapUsd, 3, 'advertised == enforced');
  }
  assert.equal(r.tries.at(-1).mode, 'cold');
});

test('R1: a COLD green MINTS a new bridge named for the job slug', async () => {
  const dir = freshRegistry();
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 0 }),
    registryDir: dir,
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('cold-plan'), closeStage: 'typecheck', spentUsd: 2.5 }]),
  }));
  assert.equal(r.outcome, 'green');
  const minted = loadBridge(join(dir, 'types-migration.json'));
  assert.equal(minted.ok, true, JSON.stringify(minted.reds));
  assert.equal(minted.bridge.goal, JOB().goal);
  assert.deepEqual(minted.bridge.closeStageNames, ['typecheck']);
  assert.deepEqual(minted.bridge.toolsUsed.sort(), ['edit', 'read']);
  assert.equal(minted.bridge.versions[0].plan.steps[0].id, 'cold-plan');
  assert.equal(deriveStatus(minted.bridge.history), 'candidate');
});

test('R1: a cold green on a job that ALREADY has a bridge of that name appends, never clobbers', async () => {
  const dir = seed(BRIDGE('types-migration'));
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 0 }),
    registryDir: dir,
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('cold-plan'), closeStage: 'typecheck' }]),
  }));
  assert.equal(r.outcome, 'green');
  const after = loadBridge(join(dir, 'types-migration.json')).bridge;
  assert.equal(after.versions.length, 2, 'the founding green survived');
});

test('R1: a cold green NEVER appends across close SHAPES — it forks under a derived name, and the fork is visible', async () => {
  // the entry on disk greened on close [typecheck]; the job's close has since been
  // re-signed to [lint, suite]. Appending would promote an old-shape entry to `proven`
  // on the strength of a green that a DIFFERENT close rendered — and would hand the
  // old-shape load gate a plan that never satisfied it.
  const dir = seed(BRIDGE('types-migration'));
  const before = loadBridge(join(dir, 'types-migration.json')).bridge;
  const job = JOB({
    close: [
      { name: 'lint', cmd: 'node lint.mjs', expect: 0, gapKeep: '^FAILED' },
      { name: 'suite', cmd: 'node suite.mjs', expect: 0, gapKeep: '^FAILED' },
    ],
  });
  const cold = () => runReuse(runOpts({
    job,
    envelope: ENVELOPE({ bridgeTries: 0 }),
    registryDir: dir,
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('new-shape-plan'), closeStage: 'suite', spentUsd: 1 }]),
  }));

  const r = await cold();
  assert.equal(r.outcome, 'green');
  const after = loadBridge(join(dir, 'types-migration.json')).bridge;
  assert.deepEqual(after, before, 'the old-shape entry is untouched — a green another close rendered is not its green');
  assert.equal(deriveStatus(after.history), 'candidate', 'no false promotion across two different close shapes');

  const forked = `types-migration-${createHash('sha256').update(['lint', 'suite'].join('\n')).digest('hex').slice(0, 8)}`;
  const minted = loadBridge(join(dir, `${forked}.json`));
  assert.equal(minted.ok, true, `the green is PRESERVED under the derived name: ${JSON.stringify(minted.reds)}`);
  assert.deepEqual(minted.bridge.closeStageNames, ['lint', 'suite']);
  assert.equal(minted.bridge.versions[0].plan.steps[0].id, 'new-shape-plan');
  const w = r.bridgeWrites.at(-1);
  assert.equal(w.name, forked, 'the record names the file that was actually written');
  assert.match(w.action, /shape-forked/, 'a reader must SEE it was forked, not silently filed');
  assert.equal(w.shapeForked, true);

  // and the fork is a real home: a second green of the same shape APPENDS to it
  const r2 = await cold();
  assert.equal(r2.outcome, 'green');
  assert.equal(loadBridge(join(dir, `${forked}.json`)).bridge.versions.length, 2, 'the derived name is stable — the second green appends, never a third file');
  assert.match(r2.bridgeWrites.at(-1).action, /^appendGreen-shape-forked$/);
});

test('R1: a derived name held by a DIFFERENT shape is refused, never appended to blind', async () => {
  // the derived name is derived FROM the shape, so this only happens if the file was
  // repurposed by hand — and the answer is the same one the mint-collision guard gives:
  // refuse, name it, and leave whatever greens are there alone.
  const dir = seed(BRIDGE('types-migration'));
  const job = JOB({
    close: [
      { name: 'lint', cmd: 'node lint.mjs', expect: 0, gapKeep: '^FAILED' },
      { name: 'suite', cmd: 'node suite.mjs', expect: 0, gapKeep: '^FAILED' },
    ],
  });
  const forked = `types-migration-${createHash('sha256').update(['lint', 'suite'].join('\n')).digest('hex').slice(0, 8)}`;
  assert.equal(saveBridge(dir, BRIDGE(forked, { closeStageNames: ['someone-elses-stage'] })).ok, true);
  const held = readFileSync(join(dir, `${forked}.json`), 'utf8');
  const r = await runReuse(runOpts({
    job,
    envelope: ENVELOPE({ bridgeTries: 0 }),
    registryDir: dir,
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('new-shape-plan'), closeStage: 'suite', spentUsd: 1 }]),
  }));
  assert.equal(r.outcome, 'green', 'the JOB still greened — the registry write is a separate fact');
  assert.equal(r.bridgeWrites.at(-1).action, 'none');
  assert.equal(r.bridgeWrites.at(-1).reds[0].code, 'shape-fork-collision');
  assert.equal(readFileSync(join(dir, `${forked}.json`), 'utf8'), held, 'the entry that was there is untouched');
});

test('R1: the same stages in a DIFFERENT ORDER are a different shape too — the load gate\'s own rule, not a looser one', async () => {
  // `loadGate` rule 2: "same names in the same ORDER is v1's definition of the same
  // kinds". A cold green must hold the entry to exactly that, or it files a green the
  // gate would never let anyone reuse — and inflates the entry's status doing it.
  const dir = seed(BRIDGE('types-migration', { closeStageNames: ['lint', 'suite'] }));
  const job = JOB({
    close: [
      { name: 'suite', cmd: 'node suite.mjs', expect: 0, gapKeep: '^FAILED' },
      { name: 'lint', cmd: 'node lint.mjs', expect: 0, gapKeep: '^FAILED' },
    ],
  });
  const r = await runReuse(runOpts({
    job,
    envelope: ENVELOPE({ bridgeTries: 0 }),
    registryDir: dir,
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('reordered'), closeStage: 'lint', spentUsd: 1 }]),
  }));
  assert.equal(r.outcome, 'green');
  assert.equal(loadBridge(join(dir, 'types-migration.json')).bridge.versions.length, 1, 'the reversed close is NOT the same recipe kind');
  const forked = `types-migration-${createHash('sha256').update(['suite', 'lint'].join('\n')).digest('hex').slice(0, 8)}`;
  assert.equal(loadBridge(join(dir, `${forked}.json`)).ok, true, 'the green lands under the shape it actually greened');
});

test('R1: a cold green REFUSES to mint over a file it could not read — an unreadable entry is not an absent one', async () => {
  const dir = freshRegistry();
  // `loadRegistry` skips-and-reports this file; minting over it would destroy whatever
  // greens it holds, and they are not recoverable once overwritten
  writeFileSync(join(dir, 'types-migration.json'), '{ this is not a bridge');
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 0 }),
    registryDir: dir,
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('cold-plan'), closeStage: 'typecheck' }]),
  }));
  assert.equal(r.outcome, 'green', 'the JOB still greened — the registry write is a separate fact');
  assert.equal(r.bridgeWrites[0].action, 'none');
  assert.equal(r.bridgeWrites[0].reds[0].code, 'mint-collision');
  assert.equal(readFileSync(join(dir, 'types-migration.json'), 'utf8'), '{ this is not a bridge', 'the file is untouched');
});

test('R1: a cold RED writes nothing — the entry bar is a green (failed plans never enter the registry)', async () => {
  const dir = freshRegistry();
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 0 }),
    registryDir: dir,
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck' }]),
  }));
  assert.notEqual(r.outcome, 'green');
  assert.equal(loadRegistry(dir).bridges.length, 0);
  assert.equal(r.bridgeWrites.length, 0);
});

test('selection saying "none matches" goes straight to cold without burning a try', async () => {
  const dir = seed(BRIDGE('alpha'));
  const runs = scriptedRuns([{ outcome: 'green', plan: PLAN('cold'), closeStage: 'typecheck' }]);
  const r = await runReuse(runOpts({
    registryDir: dir,
    selectionProvider: picker({ choice: null, reason: 'a different kind of job entirely' }),
    runJob: runs,
  }));
  assert.equal(r.outcome, 'green');
  assert.equal(runs.calls.length, 1);
  assert.equal(runs.calls[0].bridge, null);
  assert.equal(r.selection.at(-1).choice, null);
});

test('D3: a refused PIN stops the run and hands the decision back — nothing is run cold behind the operator', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const runs = scriptedRuns([{ outcome: 'green' }]);
  const r = await runReuse(runOpts({
    registryDir: dir,
    pinned: 'beta',
    selectionProvider: picker({ choice: 'alpha', reason: 'beta is the wrong kind' }),
    runJob: runs,
  }));
  assert.equal(r.outcome, 'selection-refused');
  assert.equal(runs.calls.length, 0, 'no run is started on a decision nobody made');
  assert.match(r.decision, /beta/);
  // the terminal's own claim, locked: a refusal can only ever land with ZERO paid tries,
  // because the pin stops travelling the moment it has had one (see the test above). That
  // is what makes "Nothing was run" a true sentence rather than an assumption.
  assert.equal(r.triesUsed, 0);
  assert.match(r.decision, /Nothing was run/);
});

test('D3: once the PIN has had its paid try, the next try proceeds unpinned — a spent pin never kills the envelope', async () => {
  // the pin is honoured, runs, and reds. Its name is now in `exclude`, so it is OFF the
  // listing — restating it as the pin makes EVERY possible answer a refusal, and the run
  // would die as "nothing was run" with a paid try behind it and a try still authorized.
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const provider = picker({ choice: 'alpha', reason: 'the pin fits' }, { choice: 'beta', reason: 'next best' });
  const runs = scriptedRuns([
    { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
    { outcome: 'green', plan: PLAN('second-try'), closeStage: 'typecheck', spentUsd: 1 },
  ]);
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 2 }),
    registryDir: dir,
    pinned: 'alpha',
    selectionProvider: provider,
    runJob: runs,
  }));
  assert.equal(r.outcome, 'green');
  assert.equal(runs.calls.length, 2, 'the second authorized try actually ran');
  assert.equal(runs.calls[1].bridge.name, 'beta');
  assert.match(provider.calls[0], /PINNED the workflow "alpha"/, 'try 1 states the pin — D3, the pin enters the call');
  assert.doesNotMatch(provider.calls[1], /PINNED the workflow/, 'try 2 states no pin: the pinned name has had its try and is off the listing');
  assert.ok(!r.decision || !/Nothing was run/.test(r.decision), 'no terminal may claim nothing ran once a try has been paid for');
});

// ── the decision-ready readout (D7 / F6 / F45) ──────────────────────────────

test('every row is decision-ready: bridge, stage, spend vs cap, time vs cap, and whether the close was reached', async () => {
  const dir = seed(BRIDGE('alpha'));
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 1, perTryBudgetUsd: 4, perTryWallMs: 600_000 }),
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 3.9 },
      { outcome: 'cap-halt', spentUsd: 4, spendComplete: true }, // the cold leg, cap-bound with no close
    ]),
  }));
  const [t0, t1] = r.tries;
  assert.equal(t0.bridge, 'alpha');
  assert.equal(t0.failingStage, 'typecheck');
  assert.equal(t0.spentUsd, 3.9);
  assert.equal(t0.capUsd, 4, 'the cap the row is read against travels WITH the row (F45)');
  assert.equal(t0.wallCapMs, 600_000);
  assert.equal(typeof t0.wallMs, 'number');
  assert.equal(t0.closeReached, true);
  assert.equal(t1.closeReached, false, 'a try whose budget never funded a close is VISIBLE, not inferred (F45)');
  assert.equal(t1.capBound, true);
  assert.equal(r.triesAuthorized, 1);
  assert.equal(r.triesUsed, 1);
  assert.ok(r.decision, 'a non-green return is decision-ready');
});

test('F6: a NATIVE try counts its real turns, and a slice with no turn signal reports UNKNOWN, never 0', async () => {
  // the native worker surface meters differently: one `worker-turn` per turn (cost null
  // by design) and ONE `worker-round` of kind 'session' carrying the authoritative cost.
  // Counting only `worker-round`+kind:'turn' reads every native try as 0 rounds — a
  // count that reads as exact while the work is invisible (F6).
  const dir = freshRegistry();
  const native = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    for (let i = 0; i < 3; i += 1) opts.emit('worker-turn', { kind: 'turn', costUsd: null, pricing: null });
    opts.emit('worker-round', { kind: 'session', costUsd: 0.9, pricing: 'session' });
    opts.emit('plan-accepted', { plan: PLAN('native-plan') });
    opts.emit('outer-close', { verdict: 'satisfied' });
    opts.emit('job-end', { outcome: 'green', spentUsd: 0.9, spendComplete: true });
    return 'green';
  };
  const r = await runReuse(runOpts({ envelope: ENVELOPE({ bridgeTries: 0 }), registryDir: dir, runJob: native }));
  assert.equal(r.outcome, 'green');
  assert.equal(r.tries[0].rounds, 3, 'the native turns are the try\'s real turn count');
  assert.equal(loadBridge(join(dir, 'types-migration.json')).bridge.versions[0].rounds, 3, 'and that is what the minted version records');

  // priced work with NO turn signal at all: the instrument cannot see the count, so it
  // says so. A zero here would read as "the worker did nothing" for money that was spent.
  const dir2 = freshRegistry();
  const blind = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    opts.emit('plan-accepted', { plan: PLAN('blind-plan') });
    opts.emit('outer-close', { verdict: 'satisfied' });
    opts.emit('job-end', { outcome: 'green', spentUsd: 1.5, spendComplete: true });
    return 'green';
  };
  const r2 = await runReuse(runOpts({ envelope: ENVELOPE({ bridgeTries: 0 }), registryDir: dir2, runJob: blind }));
  assert.equal(r2.tries[0].rounds, null, 'unknown is unknown — never a zero that reads as exact');
  assert.equal(loadBridge(join(dir2, 'types-migration.json')).bridge.versions[0].rounds, null);
});

test('F6: reuse spend is the SUM of every try plus the selection calls, and a floor stays a floor', async () => {
  const dir = seed(BRIDGE('alpha'));
  const r = await runReuse(runOpts({
    envelope: ENVELOPE({ bridgeTries: 1 }),
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.25 },
      { outcome: 'provider-red', spentUsd: 0.5, spendComplete: false },
    ]),
  }));
  const selCost = r.selection.reduce((a, s) => a + (s.costUsd ?? 0), 0);
  assert.ok(Math.abs(r.spentUsd - (1.75 + selCost)) < 1e-9, `${r.spentUsd} vs ${1.75 + selCost}`);
  assert.equal(r.spendComplete, false, 'one incomplete try makes the whole figure a FLOOR');
});

test('F6: a try whose job-end never landed reports UNKNOWN cost, never $0', async () => {
  const dir = freshRegistry();
  const crash = async () => { throw new Error('the runner itself died'); };
  const r = await runReuse(runOpts({ envelope: ENVELOPE({ bridgeTries: 0 }), registryDir: dir, runJob: crash }));
  assert.equal(r.tries[0].spentUsd, null, 'unknown is unknown — never a zero that reads as exact');
  assert.equal(r.tries[0].spendComplete, false);
  assert.equal(r.spendComplete, false);
});

test('a missing registry directory is a named red before anything is spent', async () => {
  const r = await runReuse(runOpts({ registryDir: join(base, 'no-such-registry') }));
  assert.equal(r.outcome, 'registry-red');
  assert.equal(r.tries.length, 0);
});

test('an invalid envelope stops before the registry is even read', async () => {
  const r = await runReuse(runOpts({ envelope: ENVELOPE({ perTryBudgetUsd: 99 }) }));
  assert.equal(r.outcome, 'envelope-red');
  assert.ok(r.reds.some((x) => x.code === 'envelope-widens'));
});

test('a stop no further try could change (unsigned spec) ends the run on the FIRST try, not after all of them', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const runs = scriptedRuns([{ outcome: 'unapproved-spec', spentUsd: 0 }]);
  const r = await runReuse(runOpts({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: runs,
  }));
  assert.equal(r.outcome, 'unapproved-spec');
  assert.equal(runs.calls.length, 1, 'the answer is already known — a second try and a cold leg would only repeat it');
  assert.match(r.decision, /new spec version/i);
  // the hash handed over is the one the operator TYPES at `--approve`, which covers all
  // three envelope numbers — handing over the per-try spec's inner hash would send them
  // to sign a version that leaves the try count unsigned
  assert.match(r.options.join(' '), new RegExp(r.approvalHash), 'the decision hands over the approval hash to sign');
  assert.match(r.options.join(' '), /tries/i, 'and says the signature covers the try count');
  assert.notEqual(r.approvalHash, r.specHash, 'the approval hash is not the per-try spec hash');
});

test('a run-level WIRING fault ends the run on the first try — it never burns the envelope on innocent bridges', async () => {
  // Both are $0 deterministic terminals runPlan returns before (or independently of) any
  // recipe: a close the plan flow cannot execute, and a missing provider factory. Every
  // further try — and the cold leg — would reproduce them verbatim, filling the readout
  // with rows that all say the same thing and burying the one fact the operator needs.
  for (const [outcome, names] of [['close-unsupported', /close/i], ['interpreter-red', /wiring|interpreter/i]]) {
    const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
    const runs = scriptedRuns([{ outcome, spentUsd: 0 }]);
    const r = await runReuse(runOpts({
      envelope: ENVELOPE({ bridgeTries: 2 }),
      registryDir: dir,
      selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
      runJob: runs,
    }));
    assert.equal(r.outcome, outcome);
    assert.equal(r.category, outcome, 'the stop keeps its own name — never the misleading `reuse-exhausted`');
    assert.equal(runs.calls.length, 1, `${outcome}: try 2 and the cold leg would only repeat the answer`);
    assert.ok(r.decision, 'the stop is decision-ready');
    assert.match(r.decision, names, 'the decision names the fault as a spec/wiring one, not a recipe verdict');
    assert.match(r.decision, /not|never/i);
    assert.equal(loadBridge(join(dir, 'beta.json')).bridge.history.length, 1, 'the bridge never tried is untouched');
    assert.equal(deriveStatus(loadBridge(join(dir, 'alpha.json')).bridge.history), 'candidate', 'a wiring casualty is not evidence about the recipe');
  }
});

test('the hard stop the LEDGER classifies is not re-filed — one wiring fault is one incident, never two', async () => {
  // `interpreter-red` is not in the ledger's excluded set: it is CLASSIFIED, and aims a
  // runtime-red at a library. runJob already files it at the fault's own site with its
  // typed `lib`, so a reuse-level copy would count one fault twice against an upstream
  // package — the step-stalled lesson. (`close-unsupported` is excluded, so its
  // reuse-level escalation is free, exactly like `smoke-red`'s.)
  /** @type {any[]} */
  const events = [];
  const emit = (/** @type {string} */ type, /** @type {any} */ data) => { const ev = { type, seq: events.length, ...(data ?? {}) }; events.push(ev); return ev; };
  const dir = seed(BRIDGE('alpha'));
  const runs = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    // planrun's own emission for a missing native provider factory, verbatim in shape
    opts.emit('escalation', { category: 'interpreter-red', decisionReady: true, decision: 'no native provider factory was wired into the runner.', options: ['wire it'] });
    opts.emit('job-end', { outcome: 'interpreter-red', spentUsd: 0, spendComplete: true });
    return 'interpreter-red';
  };
  const r = await runReuse(runOpts({
    emit, envelope: ENVELOPE({ bridgeTries: 1 }), registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }), runJob: runs,
  }));
  assert.equal(r.outcome, 'interpreter-red');
  assert.ok(r.decision, 'the stop is still decision-ready in the RETURN value');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'interpreter-red').length, 1,
    'exactly one escalation for one fault — the reuse runner does not re-file the fault site\'s own');
  assert.equal(classifyIncidents(events).filter((o) => o.class === 'runtime-red' || o.class === 'provider-red').length, 1,
    'and therefore exactly one ledger incident against an upstream package');
});

test('every escalation this runner emits is a category the ledger can classify — no unmapped class', async () => {
  /** @type {any[]} */
  const events = [];
  const emit = (type, data) => { const ev = { type, seq: events.length, ...(data ?? {}) }; events.push(ev); return ev; };
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));

  // 1. the envelope refuses to compose
  await runReuse(runOpts({ emit, envelope: ENVELOPE({ perTryBudgetUsd: 99 }) }));
  // 2. the registry path does not exist
  await runReuse(runOpts({ emit, registryDir: join(base, 'nope') }));
  // 3. the model refuses a pin
  await runReuse(runOpts({ emit, registryDir: dir, pinned: 'beta', selectionProvider: picker({ choice: 'alpha', reason: 'wrong kind' }), runJob: scriptedRuns([{ outcome: 'green' }]) }));
  // 4. the selection answer is unusable
  await runReuse(runOpts({ emit, registryDir: dir, selectionProvider: picker('not json at all'), runJob: scriptedRuns([{ outcome: 'green' }]) }));
  // 5. every authorized attempt spent
  await runReuse(runOpts({
    emit, registryDir: dir, envelope: ENVELOPE({ bridgeTries: 1 }),
    selectionProvider: picker({ choice: 'alpha', reason: 'fits' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck' }]),
  }));

  const cats = events.filter((e) => e.type === 'escalation').map((e) => e.category);
  assert.deepEqual([...new Set(cats)].sort(), ['envelope-red', 'registry-red', 'reuse-exhausted', 'selection-red', 'selection-refused']);
  const unclassified = classifyIncidents(events).filter((o) => o.class === 'runtime-red' && /unclassified escalation/.test(o.detail));
  assert.deepEqual(unclassified, [], 'a category outside the ledger\'s executable excluded-set is COUNTED, never silently dropped — these must all be in it');
});

// ── the composition, through the REAL runJob ────────────────────────────────

test('REAL runJob: a cold green through runReuse mints a bridge the registry can read back', async () => {
  const workdir = join(base, 'real-run');
  mkdirSync(join(workdir, 'src'), { recursive: true });
  initPatientRepo(workdir); // v1.57 §3: a job runs on its own branch, so the patient is a repo
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  // the close: green only once the worker has written the file
  writeFileSync(join(workdir, 'close.mjs'), `import { existsSync } from 'node:fs';
if (existsSync(new URL('./src/typed.mjs', import.meta.url).pathname)) process.exit(0);
console.log('FAILED src/typed.mjs missing'); process.exit(1);\n`);

  const job = JOB({
    job: 'real-types',
    budgetUsd: 1.5,
    maxWallMs: undefined,
    writeScope: ['src/**'],
    goal: 'Create src/typed.mjs.',
    close: [{ name: 'typed-exists', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
    tools: ['read', 'write'],
  });
  delete job.maxWallMs;
  const envelope = { perTryBudgetUsd: 1.5, perTryWallMs: 600_000, bridgeTries: 0 };
  const trySpec = resolveTrySpec(job, envelope);
  const approvals = [{ specHash: jobSpecHash(trySpec), signer: 'test', ts: 'now' }];

  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-typed', action: 'Create the file.', tools: ['write'], rounds: 4,
      target: 'src/typed.mjs',
      exit: [{ type: 'tree-changed', scope: 'src/**' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'src/ holds one module' },              // scout
    { text: plan },                                  // draft
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(workdir, 'src/typed.mjs'), content: 'export const y = 2;\n' } }] },
    { text: 'done' },
  ]);

  const dir = freshRegistry();
  const r = await runReuse({
    job, approvals, registryDir: dir, envelope, patient: 'real-patient',
    workdir, provider, selectionProvider: provider,
    emit: () => ({}), capRuns: 2, closeTimeoutMs: 30_000,
  });
  assert.equal(r.outcome, 'green', JSON.stringify(r.tries));
  const minted = loadBridge(join(dir, 'real-types.json'));
  assert.equal(minted.ok, true, JSON.stringify(minted.reds));
  assert.equal(minted.bridge.versions[0].plan.steps[0].id, 'write-typed');
  assert.deepEqual(minted.bridge.closeStageNames, ['typed-exists']);
  assert.equal(minted.bridge.versions[0].patient, 'real-patient');
  assert.ok(existsSync(join(workdir, 'src', 'typed.mjs')));
  assert.equal(typeof minted.bridge.versions[0].costUsd, 'number', 'the real run priced its rounds');
});

test('REAL runJob: an unsigned per-try spec is refused by the approval gate — the envelope cannot forge a signature', async () => {
  const workdir = join(base, 'real-unsigned');
  mkdirSync(workdir, { recursive: true });
  initPatientRepo(workdir);
  writeFileSync(join(workdir, 'close.mjs'), 'process.exit(1);\n');
  const job = JOB({ job: 'unsigned-types', budgetUsd: 1.5, close: [{ name: 's', cmd: 'node close.mjs', expect: 0, gapKeep: '^F' }] });
  // signed at the SPEC's numbers; the envelope tightens them, so the run is a NEW version
  const approvals = [{ specHash: jobSpecHash(job), signer: 'test', ts: 'now' }];
  const r = await runReuse({
    job, approvals, registryDir: freshRegistry(),
    envelope: { perTryBudgetUsd: 1, perTryWallMs: 300_000, bridgeTries: 0 },
    patient: 'p', workdir, provider: scriptedProvider([{ text: 'x' }]), selectionProvider: scriptedProvider([{ text: 'x' }]),
    emit: () => ({}),
  });
  assert.equal(r.tries[0].runOutcome, 'unapproved-spec');
  assert.equal(r.tries[0].spentUsd, 0);
});

// ── the RUNNER's approval gate (scripts/run-reuse.mjs) ──────────────────────
//
// The gate itself, at the seam where the operator meets it: the script's own hash
// arithmetic and its refusal, exercised as a process. No paid run is involved — every
// case below stops at (or immediately after) the comparison, before an API key is even
// read. This is the seam that matters, because the number the operator types is compared
// HERE, and a library-level hash that nothing prints is not a signature.

/** run the reference runner and return `{ status, stdout, stderr }` — never a paid run:
 * every case here stops at the approval gate or at the missing-key refusal right after it
 * @param {string[]} args @param {Record<string,string>} [env] */
const runner = (args, env = {}) => {
  const { ANTHROPIC_API_KEY: _drop, ...clean } = process.env;
  return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/run-reuse.mjs', import.meta.url)), ...args], {
    encoding: 'utf8', env: { ...clean, ...env },
  });
};

test('the runner PRINTS a hash that moves with --tries, and refuses one signed for a different count', () => {
  const dir = freshRegistry();
  const base2 = ['--job', 'litectx-types', '--registry', dir, '--budget', '10', '--wall', '45'];
  const hashOf = (/** @type {string} */ tries) => {
    const r = runner([...base2, '--tries', tries]);
    assert.equal(r.status, 0, r.stderr);
    const m = r.stdout.match(/hash\s+([0-9a-f]{64})/);
    assert.ok(m, `the gate must print the hash to sign:\n${r.stdout}`);
    return m[1];
  };
  const two = hashOf('2');
  const nine = hashOf('9');
  assert.notEqual(two, nine, 'the printed hash covers the try count — the spend multiplier is signed');

  // the operator holds the hash for 2 tries and asks for 9: REFUSED
  const wrong = runner([...base2, '--tries', '9', '--approve', two]);
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /REFUSED/);
  assert.match(`${wrong.stdout}${wrong.stderr}`, /tries/i, 'the refusal says the hash now covers the try count, so a stale one is explained');

  // and the matching hash PASSES the gate — the next refusal is the missing key, which
  // only a run that got past the signature ever reaches
  const right = runner([...base2, '--tries', '2', '--approve', two]);
  assert.equal(right.status, 2, right.stdout);
  assert.match(right.stderr, /ANTHROPIC_API_KEY/);
});

test('the runner\'s printed hash IS the library\'s — one arithmetic, not two', () => {
  const dir = freshRegistry();
  const r = runner(['--job', 'litectx-types', '--registry', dir, '--budget', '10', '--wall', '45', '--tries', '2']);
  assert.equal(r.status, 0, r.stderr);
  const spec = JSON.parse(readFileSync(new URL('../jobs/litectx-u-types.json', import.meta.url), 'utf8'));
  const expected = reuseSpecHash(resolveReuse(spec, { perTryBudgetUsd: 10, perTryWallMs: 2_700_000, bridgeTries: 2 }));
  assert.match(r.stdout, new RegExp(`hash\\s+${expected}`), 'a runner computing its own hash is a second signature scheme');
});
