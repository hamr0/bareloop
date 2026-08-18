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
import { STALL_MS } from '../src/stall.js';
import { readSpine, scriptedProvider, initPatientRepo, mockWallClock } from './helpers.js';

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
  // a real patient is a git checkout: the WORK BRANCH hard rule (PRD v1.57 §3) makes
  // one a precondition of running a job at all
  initPatientRepo(workdir);
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

// W1: the stall case that is NOT terminal. src/stall.js abandons a hung call and
// REISSUES it (self-heal is hamr's ruling), and stall.js says outright that the
// abandoned call may already have been billed — so a run that absorbs a stall and
// then ends green states a priced sum that is a FLOOR, not the total. Only the
// terminal `step-stalled` carried that unknown; the healed run — the common case —
// reported an exact-looking total. F6 in a self-heal coat.
test('a SELF-HEALED stall makes the green job-end money a FLOOR: spendComplete false, spentUsd still the real sum (W1)', async (t) => {
  // the whole point of `stall` is a call that outlives its window, so the window
  // is what gets mocked — the watchdog, the meter and the plan flow are all real
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the missing test.', tools: ['write'], rounds: 6,
      target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  /** one arm: `stall` hangs the scout's FIRST issue, the control hangs nothing */
  const arm = async (/** @type {string} */ name, /** @type {boolean} */ hangFirst) => {
    const wd = makePlanWork(name);
    const job = planJob();
    const scripted = scriptedProvider([
      { text: 'no tests exist yet' },
      { text: plan },
      { toolCalls: [tcall2('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
      { text: 'wrote it' },
    ]);
    let issues = 0;
    const provider = {
      calls: scripted.calls,
      async generate(/** @type {any} */ messages, /** @type {any} */ tools) {
        // a socket that stays alive and completes no ROUND — the one shape
        // bare-agent's idle timeout cannot see (F66). It never settles: the
        // reissue is what answers, exactly as the abandoned call's corpse does.
        // It never reaches `scripted.generate`, so the tape does not advance.
        if (hangFirst && ++issues === 1) return new Promise(() => {});
        return scripted.generate(messages, tools);
      },
    };
    const file = join(wd, 'spine.jsonl');
    const running = runJob(job, {
      approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
      workdir: wd, provider, emit: makeSpine(file),
    });
    if (hangFirst) {
      // yield real event-loop turns (the smoke and the close precheck are real
      // I/O, ~1s of it) until the watchdog has armed on the hung call, then
      // expire the window. setImmediate is deliberately NOT mocked, and the
      // deadline is wall-clock: a fixed turn COUNT races the child process.
      const t0 = Date.now();
      while (issues === 0 && Date.now() - t0 < 30_000) await new Promise((r) => setImmediate(r));
      assert.equal(issues, 1, 'the scout call was issued and is hanging');
      t.mock.timers.tick(STALL_MS);
    }
    return { outcome: await running, events: readSpine(file) };
  };

  const healed = await arm('plan-healed-stall', true);
  assert.equal(healed.outcome, 'green', 'the stall SELF-HEALED — the run finished, nobody was told to retry');
  assert.ok(healed.events.some((e) => e.type === 'stall'), 'the watchdog really fired: a stall passed through the meter');
  const end = healed.events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'green');
  assert.ok(end.spentUsd > 0, 'the priced sum still rides out — a floor is a real number, not a blank');
  assert.equal(end.spendComplete, false, 'an abandoned call may already have been billed: the sum is a FLOOR and says so');

  // the control: the same job, the same tape, no stall — the money is EXACT, so
  // the flag tracks the stall and not merely "this run ended"
  const clean = await arm('plan-no-stall', false);
  assert.equal(clean.outcome, 'green');
  assert.ok(!clean.events.some((e) => e.type === 'stall'));
  const cleanEnd = clean.events.find((e) => e.type === 'job-end');
  assert.equal(cleanEnd.spendComplete, true, 'nothing was abandoned — the total is exact');
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

// ── F64 at the job-end: `wall-halt` is TWO stops wearing one name, and only one of
// them states an exact figure. A deadline read BETWEEN rounds (or between attempts,
// W-2) stops a run with nothing in flight — every round it counted came back and was
// billed, so the sum IS the total. A deadline that landed INSIDE a call comes back as
// the provider's own timeout, and that call returned no usage at all: it may already
// have been billed and will never say so. Same unknown as the transport floor and the
// self-healed stall above, so the same honest answer — and the discriminator is the
// wall-halt record's own `cutMidCall`, never the outcome (keying on the outcome would
// floor the exact stop too, which is the same dishonesty pointing the other way).
//
// The wall is mocked at its time SOURCE (`mockWallClock`, tests/helpers.js), the one
// seam a runJob-level test has: `maxWallMs` has a two-minute floor (MIN_WALL_MS — a cap
// under one close cannot fund its own close), so a real-time test would have to run for
// two minutes to read a deadline. That source is `performance.now` since the clock went
// monotonic (hamr, 2026-08-15: suspended minutes never charge a signed wall), pinned to
// a mocked `Date` so one tick still moves both. Nothing else is mocked; setTimeout, the
// spawned close and the real plan flow are untouched.

/** the plan-shape job with the operator's time cap set at its floor */
const wallJob = () => ({ ...planJob(), maxWallMs: 120_000 });

const etimedout = () => Object.assign(new Error('[AnthropicProvider] request timed out'), { code: 'ETIMEDOUT' });

test('a MID-CALL wall-halt states spendComplete:false — the cut call returned no usage, so the priced sum is a FLOOR (F64/F6)', async (t) => {
  const wd = makePlanWork('wall-mid-call');
  const job = wallJob();
  mockWallClock(t);
  let n = 0;
  const provider = {
    calls: [],
    async generate() {
      n += 1;
      provider.calls.push(n);
      // the scout answers and is billed; the DRAFTING call is the one the wall lands
      // inside, and it rejects with exactly the timeout clock.callTimeoutMs() asked for
      if (n === 2) { t.mock.timers.tick(200_000); throw etimedout(); }
      return { text: 'no tests exist yet', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file), capRuns: 2 });

  assert.equal(outcome, 'wall-halt', 'the run\'s own deadline is a governance stop, never a transport casualty (F64)');
  const events = readSpine(file);
  assert.equal(events.find((e) => e.type === 'wall-halt').cutMidCall, true,
    'the discriminator is ON the record — the meter reads the field, it does not re-derive the reading');
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'wall-halt');
  assert.ok(end.spentUsd > 0, 'the priced sum still rides out — a floor is a real number, not a blank');
  assert.equal(end.spendComplete, false, 'the cut call may already have been billed and never told us: the sum is a FLOOR and says so');
});

test('CONTROL: a BETWEEN-ATTEMPTS wall-halt keeps spendComplete:true — nothing was in flight, so the exact total must not be dressed up as a floor', async (t) => {
  const wd = makePlanWork('wall-between-attempts');
  const job = wallJob();
  mockWallClock(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the missing test.', tools: ['write'], rounds: 6,
      target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  let n = 0;
  const provider = {
    calls: [],
    async generate() {
      n += 1;
      provider.calls.push(n);
      const scripted = [{ text: 'no tests exist yet' }, { text: plan }][n - 1] ?? { text: 'a step attempt that must never be bought' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const file = join(wd, 'spine.jsonl');
  // the wall passes once the plan is ACCEPTED — the run's own state, never a call
  // count, so the trigger cannot silently retarget if the number of calls changes
  const spine = makeSpine(file);
  const emit = (/** @type {string} */ type, /** @type {any} */ data) => {
    const e = spine(type, data);
    if (type === 'plan-accepted') t.mock.timers.tick(200_000);
    return e;
  };
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit, capRuns: 2 });

  assert.equal(outcome, 'wall-halt', 'the first step would begin past the deadline, so it is never funded (W-2 at the step site)');
  const events = readSpine(file);
  assert.equal(events.find((e) => e.type === 'wall-halt').cutMidCall, false, 'read between attempts, with no call in flight');
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'wall-halt');
  assert.ok(end.spentUsd > 0, 'the scout and the draft were bought and billed');
  assert.equal(end.spendComplete, true,
    'every round this sum counted came back priced — the flag tracks the mid-call cut, not merely "a wall-halt happened"');
});

// ─── the RESUMED attempt: prior spend and prior wall FOLD IN (module C) ───
//
// hamr's checkpoint ruling: a run killed mid-try restarts THAT try under the
// REMAINDER of its signed per-try numbers — "a budget ceiling folds in prior spend
// so re-invoking cannot silently widen it". The seam is the FOLD, never a rewritten
// cap: `budgetUsd`/`maxWallMs` are in the spec hash, so tightening them would be a
// new spec version the operator has to re-sign, and a resume would then need a
// signature nobody typed. The signed numbers stay exactly as signed; the restarted
// attempt simply starts with part of them already consumed.

test('resume: priorSpentUsd folds into the ONE ledger — the restarted attempt spends the REMAINDER of the signed budget, and job-end states the try\'s WHOLE spend', async () => {
  // two workdirs on purpose: the cold arm WRITES the file the close reads, so re-running
  // the resumed arm in the same tree would grade `already-green` and compare two
  // different runs' spend (the control has to be the same work, not the same directory)
  const wd = makePlanWork('plan-prior-spend-cold');
  const wd2 = makePlanWork('plan-prior-spend-resumed');
  const job = planJob();
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the missing test.', tools: ['write'], rounds: 6,
      target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }],
    }],
  });
  const script = (/** @type {string} */ dir) => [
    { text: 'no tests exist yet' },
    { text: plan },
    { toolCalls: [tcall2('t1', 'shell_write', { path: join(dir, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote it' },
  ];
  const approvals = [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];

  const coldFile = join(wd, 'spine-cold.jsonl');
  await runJob(job, { approvals, workdir: wd, provider: scriptedProvider(script(wd)), emit: makeSpine(coldFile) });
  const coldSpend = readSpine(coldFile).find((e) => e.type === 'job-end').spentUsd;
  assert.ok(coldSpend > 0);

  const file = join(wd2, 'spine-resumed.jsonl');
  await runJob(job, {
    approvals, workdir: wd2, provider: scriptedProvider(script(wd2)), emit: makeSpine(file),
    priorSpentUsd: 0.5,
  });
  const end = readSpine(file).find((e) => e.type === 'job-end');
  assert.ok(Math.abs(end.spentUsd - (0.5 + coldSpend)) < 1e-9,
    `the dead attempt's spend is never laundered to $0: ${end.spentUsd} vs ${0.5 + coldSpend}`);
});

test('resume: a prior fold DRAINS the wallet the run is handed — the planner reads the remainder, never a fresh allotment', async () => {
  // the seam where "no fresh allotment" is observable: the balance the drafter is handed
  // is the LIVE wallet (`remainingUsd()`), so a fold that consumed the budget shows up as
  // a drained balance rather than the signed total. (Refusing to LAUNCH an unfundable
  // restart at all is the reuse runner's job, one level up — a run that got this far has
  // already been judged fundable; this test only pins that the money folded in.)
  const wd = makePlanWork('plan-prior-exhausted');
  const job = planJob(); // budgetUsd 1.5
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'plan' }]);
  const file = join(wd, 'spine.jsonl');
  await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider, emit: makeSpine(file),
    priorSpentUsd: 1.4,
  });
  const events = readSpine(file);
  const materials = events.find((e) => e.type === 'materials');
  assert.ok(materials.balanceUsd < 0.1, `the drafter is told what is LEFT (${materials.balanceUsd}), not the signed 1.5`);
  assert.ok(events.find((e) => e.type === 'job-end').spentUsd >= 1.4, 'and the dead attempt\'s money is still on the terminal record — never laundered to $0');
});

test('resume: priorWallMs folds into the run clock — the signed wall is reported unchanged, the remainder is what is left', async () => {
  const wd = makePlanWork('plan-prior-wall');
  const job = { ...planJob(), maxWallMs: 600_000 };
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'plan' }]);
  const file = join(wd, 'spine.jsonl');
  await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider, emit: makeSpine(file),
    priorWallMs: 500_000,
  });
  const wc = readSpine(file).find((e) => e.type === 'wall-clock');
  assert.equal(wc.requestedMs, 600_000, 'the SIGNED cap is what is reported — a resume never edits it');
  assert.ok(wc.elapsedMs >= 500_000, `the dead attempt's time is already consumed: ${wc.elapsedMs}`);
  assert.ok(wc.remainingMs <= 100_000, `only the remainder is left: ${wc.remainingMs}`);
});

test('§3 resume: job-start DECLARES the fold it inherited — a chain of resumes is accounted from the record, never re-derived from the file', async () => {
  // The `try-start` precedent, one level down. `readResume` reads a resumed run's
  // prior spend off the record that DECLARES it, because re-deriving from a whole
  // spine would bill an abandoned attempt twice. A direct runJob spine had no such
  // record at all, so the second resume of a cap-halted run would have folded in
  // only its own rounds and silently widened the ceiling by everything before them.
  const wd = makePlanWork('plan-declared-fold');
  const job = planJob();
  const approvals = [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];
  const file = join(wd, 'spine.jsonl');
  await runJob(job, {
    approvals, workdir: wd, provider: scriptedProvider([{ text: 'scout' }, { text: 'plan' }]),
    emit: makeSpine(file), priorSpentUsd: 0.75, priorWallMs: 90_000,
  });
  const start = readSpine(file).find((e) => e.type === 'job-start');
  assert.equal(start.priorSpentUsd, 0.75, 'the money the dead attempt spent is ON the record a resume reads');
  assert.equal(start.priorWallMs, 90_000, 'and so is the wall it burned');
  assert.equal(start.priorSpendComplete, true);
});

test('§3 CONTROL: a COLD run\'s job-start carries no fold fields at all — an absent fold is absent, never a decorative zero', async () => {
  const wd = makePlanWork('plan-no-fold');
  const job = planJob();
  const file = join(wd, 'spine.jsonl');
  await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider: scriptedProvider([{ text: 'scout' }, { text: 'plan' }]), emit: makeSpine(file),
  });
  const start = readSpine(file).find((e) => e.type === 'job-start');
  assert.equal('priorSpentUsd' in start, false);
  assert.equal('priorWallMs' in start, false);
});

test('§3 resume: a FLOOR fold stays a floor — a dead run whose spend was only partly priced cannot come back as an exact total (F6)', async () => {
  // The fold is the dead run's own figure, and `readResume` marks it
  // `priorSpendComplete: false` when any round in it came back unpriced. Declaring
  // it `true` here would launder an unknown into an exact number at the one record
  // a human reads the money off — F6 wearing a resume's coat.
  const wd = makePlanWork('plan-floor-fold');
  const job = planJob();
  const file = join(wd, 'spine.jsonl');
  await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider: scriptedProvider([{ text: 'scout' }, { text: 'plan' }]),
    emit: makeSpine(file), priorSpentUsd: 0.5, priorSpendComplete: false,
  });
  const events = readSpine(file);
  assert.equal(events.find((e) => e.type === 'job-start').priorSpendComplete, false,
    'the declaration carries the floor, so a resume OF this resume inherits the unknown');
  const end = events.find((e) => e.type === 'job-end');
  assert.ok(end.spentUsd >= 0.5, 'the floor is a real number and still rides out');
  assert.equal(end.spendComplete, false,
    'and the TOTAL is a floor too — every round of this attempt being priced does not repair the one before it');
});

test('§3 resume: a fold of $0 that is NOT exact is still a floor — an unpriced dead leg does not become exact by having spent nothing countable', async () => {
  // The degenerate fold, and the one the money conjunct got wrong: a leg killed with
  // EVERY round unpriced sums to 0 and reports `spendComplete: false`. The figure is a
  // floor of zero, not an exact zero — the dead leg bought rounds nobody could price.
  // Keying the carry on `spentUsd > 0` read that as "no fold to qualify" and handed
  // the resumed terminal an exact-looking total over a predecessor that said otherwise.
  const wd = makePlanWork('plan-zero-floor-fold');
  const job = planJob();
  const file = join(wd, 'spine.jsonl');
  await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: wd, provider: scriptedProvider([{ text: 'scout' }, { text: 'plan' }]),
    emit: makeSpine(file), priorSpentUsd: 0, priorSpendComplete: false,
  });
  const events = readSpine(file);
  const start = events.find((e) => e.type === 'job-start');
  assert.equal(start.priorSpendComplete, false,
    'the declaration is emitted for the unknown ALONE — a resume of this resume must inherit it, and there is no money field to carry it');
  assert.equal(events.find((e) => e.type === 'job-end').spendComplete, false,
    'the unknown rides one-way onto the terminal, exactly as a non-zero floor fold does');
});
