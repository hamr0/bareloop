// The runner's exit criteria as behaviour tests: the approval gate refuses
// before any token, the primitive smoke runs before tokens, the plan flow runs
// under the ONE ledger through runJob (the single entry), and every terminal
// job-end states the money honestly. Everything real except the LLM (scripted
// provider — shell-owned by design).
//
// The legacy operator-authored steps[] half of this file was deleted with that
// path (PRD v1.32, 2026-07-26): drafting, config-v1, the per-step interpret
// loops and the hitl draft-PR mechanics. Every guard that SURVIVED the deletion
// was re-pointed at the plan shape rather than dropped — the approval gate, the
// smoke, and the four money-contract readings below are ports, not new tests.
// Guards that moved house rather than dying are covered where they now live:
// close-unsupported, broken-close, already-green and the close's cwd in
// tests/planrun.test.js; close-crashed and the close-output scrub in
// tests/ralph.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSpine } from '../src/spine.js';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { readSpine, scriptedProvider } from './helpers.js';

const base = mkdtempSync(join(tmpdir(), 'run-test-'));

// ─── Layer 2 (module 4c): the plan-shape dispatch — runJob() stays the ONE
// entry (N2 lock); a four-field spec routes to the plan executor under the
// same approval gate, smoke, and ledger. Every provider round lands on the
// one ledger; the job-end money contract is unchanged.

const tcall2 = (id, name, args) => ({ id, name, arguments: args });

function makePlanWork(name) {
  const workdir = join(base, name);
  mkdirSync(join(workdir, 'tests'), { recursive: true });
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) process.exit(0);
console.log('FAILED tests/test_x.mjs missing'); process.exit(1);\n`;
  writeFileSync(join(workdir, 'close.mjs'), probe);
  writeFileSync(join(workdir, 'check.mjs'), probe);
  return workdir;
}

const planJob = () => ({
  schema: 'job-v1',
  job: 'plan-dispatch',
  description: 'plan-shape job through the one runJob entry',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs with an ok assertion.',
  verdictType: 'green',
  // the staged close (PRD v1.28): ONE list of named stages, and the check menu
  // derives from it — `clean-run` is a piece of the close, not a copy beside it
  close: [{ name: 'clean-run', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
  tools: ['read', 'write'],
  escalation: { mode: 'decision-ready' },
});

test('plan dispatch: a four-field spec runs SCOUT→PLAN→EXECUTE→close through runJob; job-end money contract intact', async () => {
  const wd = makePlanWork('plan-green');
  const job = planJob();
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the missing test.', tools: ['write'], rounds: 6,
      target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'no tests exist yet' },
    { text: plan },
    { toolCalls: [tcall2('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote it' },
  ]);
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider, emit: makeSpine(file),
  });
  assert.equal(outcome, 'green');
  const events = readSpine(file);
  assert.equal(events.find((e) => e.type === 'job-start').shape, 'plan');
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'green');
  assert.ok(end.spentUsd > 0, 'the plan flow\'s rounds landed on the ONE ledger');
  assert.equal(end.spendComplete, true);
  assert.ok(events.some((e) => e.type === 'plan-executed'));
});

test('plan dispatch: an unapproved plan spec spends zero tokens (the approval gate is shape-agnostic)', async () => {
  const wd = makePlanWork('plan-unapproved');
  const provider = scriptedProvider([{ text: 'never' }]);
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(planJob(), { approvals: [], workdir: wd, provider, emit: makeSpine(file) });
  assert.equal(outcome, 'unapproved-spec');
  assert.equal(provider.calls.length, 0);
});

test('plan dispatch: no opts.target required — the target red is a text-mode-steps rule only', async () => {
  const wd = makePlanWork('plan-no-target');
  const job = planJob();
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: JSON.stringify({ schema: 'plan-v1', steps: [{ id: 's', action: 'write it', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] }] }) },
    { toolCalls: [tcall2('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider, emit: makeSpine(file),
  });
  assert.equal(outcome, 'green', 'a plan job with no opts.target must not red — its steps are tool-mode by construction');
});

test('plan dispatch: a step-red plan outcome lands on job-end as outcome step-red with the step named', async () => {
  const wd = makePlanWork('plan-stepred');
  const job = planJob();
  const stubbornPlan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'never-writes', action: 'do', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] }] });
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: stubbornPlan },
    { text: 'thinking only' }, { text: 'thinking only' },   // plan A exhausts (capRuns 2)
    { text: stubbornPlan },                                  // the one replan: same plan
    { text: 'thinking only' },                               // plan B exhausts too (sticks)
  ]);
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider, emit: makeSpine(file), capRuns: 2,
  });
  assert.match(outcome, /^step-red:/);
  const end = readSpine(file).find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'step-red');
  assert.equal(end.step, 'never-writes');
  assert.equal(typeof end.spentUsd, 'number');
});

test('plan dispatch: a transport-throw provider-red reports spendComplete:false — an unknown floor is never laundered as exact (review #7, F44)', async () => {
  const wd = makePlanWork('plan-provider-red');
  const job = planJob();
  // the close is red at precheck (src/... has no test yet), so the scout RUNS — and the
  // provider throws there: a transport failure that never returned a usage figure.
  const provider = { calls: [], async generate() { this.calls.push(1); throw new Error('ENETUNREACH transport'); } };
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider, emit: makeSpine(file), capRuns: 2,
  });
  assert.equal(outcome, 'provider-red');
  const end = readSpine(file).find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'provider-red');
  assert.equal(end.spendComplete, false, 'the priced sum is a FLOOR, not the total — mirror the legacy providerRed()');
});

// ─── ports from the deleted legacy half: guards that outlived the path they
// were written against. Each is the SAME assertion, re-pointed at the plan
// shape — deleting them with the path would have shrunk coverage silently,
// which is the one thing a deletion must not do.

const approve = (job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];

test('an edited spec is unapproved by construction — approval binds to the exact version, not the job name', async () => {
  const wd = makePlanWork('edited-spec');
  const original = planJob();
  const edited = { ...planJob(), budgetUsd: 1.4 };
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(edited, { approvals: approve(original), workdir: wd, provider, emit: makeSpine(file) });
  assert.equal(outcome, 'unapproved-spec');
  assert.equal(provider.calls.length, 0, 'zero tokens on a spec whose hash was never signed');
});

test('a degraded primitive is a smoke-red stop BEFORE tokens (A3: a silent degradation throws nothing)', async () => {
  const wd = makePlanWork('smoke-red');
  const job = planJob();
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const file = join(wd, 'spine.jsonl');
  // the store's own directory is a FILE — the round-trip cannot succeed, and it
  // degrades WITHOUT throwing, which is the whole point of a known-answer check
  writeFileSync(join(wd, '.smoke'), 'a FILE where the smoke store needs a directory');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file) });
  assert.equal(outcome, 'smoke-red');
  assert.equal(provider.calls.length, 0, 'the smoke runs before the first provider call');
  const events = readSpine(file);
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'smoke-red');
  assert.equal(esc.decisionReady, true);
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'smoke-red');
  assert.equal(end.spentUsd, 0, 'a pre-token stop states a REAL zero');
  assert.equal(end.spendComplete, true, 'and that zero is EXACT — nothing was bought');
});

test('money on the job-end: a pre-spend red states a real zero and is COMPLETE — the field is never simply absent (F12 at the terminal record)', async () => {
  const wd = makePlanWork('money-zero');
  const job = planJob();
  const file = join(wd, 'spine.jsonl');
  await runJob(job, { approvals: [], workdir: wd, provider: scriptedProvider([{ text: 'never' }]), emit: makeSpine(file) });
  const end = readSpine(file).find((e) => e.type === 'job-end');
  assert.equal(end.spentUsd, 0);
  assert.equal(end.spendComplete, true);
  assert.ok('spentUsd' in end && 'spendComplete' in end, 'both fields on every terminal, so no consumer branches on presence');
});

test('money on the job-end: an UNPRICED round halts pricing-red and the priced sum rides out as an incomplete FLOOR (F6 — unpriced is never free)', async () => {
  const wd = makePlanWork('money-unpriced');
  const job = planJob();
  // the scout round comes back with a null cost: honest unknown, never $0
  const provider = {
    name: 'unpriced-scout',
    calls: [],
    async generate() {
      provider.calls.push(1);
      return { text: 'scouted', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: null, pricing: 'unpriced', stopReason: 'end_turn' };
    },
  };
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file) });
  assert.equal(outcome, 'pricing-red', 'a cap cannot govern spend it cannot see');
  const end = readSpine(file).find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'pricing-red');
  assert.equal(end.spendComplete, false, 'the sum is a floor, and says so');
});
