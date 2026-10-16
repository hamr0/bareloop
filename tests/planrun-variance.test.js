// Layer 2 module 4b — the plan executor — variance trigger and replan grants, wall-halts, resume ceilings, per-step scope/model, truncation routing.
// Split from the former tests/planrun.test.js (hamr 2026-10-11) for parallel runs; tests moved
// verbatim. Shared fixtures: tests/planrun-fixtures.js. Original header: integration-grade — real
// bare-agent Loop, real Gate, real spawned checks and closes, scripted provider (the one legitimate seam).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { ralph } from '../src/ralph.js';
import { validateJob } from '../src/job.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';
import { tcall, makePatient, JOB, PLAN, collector, go, todos, COUNT_JOB, countRun, fakeClock, dyingAt, stepIterations } from './planrun-fixtures.js';

test('A: the variance trigger FIRES — a step that eats over half the run\'s remaining money with its exits still red gets no further attempt, and the planner re-allocates (the trigger exhaustion-only could never reach, F56)', async (t) => {
  const wd = makePatient(t);
  // Attempt 1 writes a NON-ok file: tree-changed passes, clean-run reds, so attempt 2
  // is scheduled. The wallet is drained past the 50% threshold DURING attempt 1, so
  // the meter must stop the step at the head of attempt 2 rather than fund it.
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
    { text: 'attempt 1 done' },
    // the replan: a fresh plan whose one step greens
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] }]) },
    { text: 'writing', toolCalls: [tcall('2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  // The drain is driven by the RUN'S OWN progress, not a call count: once the first
  // step has been judged once, the wallet reports 40% of what the step started with
  // (a 60% share, over the 50% threshold). Deterministic, and it cannot silently
  // retarget if the number of wallet reads changes.
  let judged = 0;
  let balance = 1.5;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data) => {
    if (type === 'exit-eval') { judged += 1; if (judged === 1) balance = 0.6; }
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd: () => balance,
  });

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, `the meter must fire — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(variance.axis, 'money');
  assert.ok(variance.moneyShare >= 0.5, `share ${variance.moneyShare} must be at or over the threshold`);
  assert.equal(variance.threshold, 0.5, 'hamr\'s number, provisional by construction');
  assert.equal(variance.timeShare, null, 'no maxWallMs set — the time axis is null, never a fabricated 0');
  assert.equal(variance.iteration, 2, 'stopped at the HEAD of attempt 2, so attempt 1\'s work is not discarded');

  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, 'the variance routes to a REPLAN, not a stop — this is the adaptation channel (F56: zero replans in the programme)');
  assert.equal(replan.trigger, 'step-variance');
  assert.match(replan.reason, /consuming the run/);

  // the escalation ralph emitted must NOT claim something broke
  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'step-variance');
  assert.ok(esc, 'the category rides out by name');
  assert.doesNotMatch(esc.decision, /broke/i, 'a metered stop is not a fault — the record must not say the middle broke');

  // and the replan drafter was handed the DRAINED balance, not the original
  const replanMaterials = events.filter((e) => e.type === 'materials').at(-1);
  assert.equal(replanMaterials.phase, 'replan');
  assert.equal(replanMaterials.balanceUsd, 0.6, 'the balance is read LIVE at the replan — a stale snapshot would let it plan against money already spent');
  assert.match(replanMaterials.progress, /step 1 of 1/, 'the progress line is the other half of the adaptation channel');
});


test('A: the variance check NEVER fires on attempt 1 — the share is 0 by construction, so a first attempt can never be pre-empted', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  // a wallet that reports almost nothing left from the very start
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 0.002 });
  assert.equal(events.filter((e) => e.type === 'variance').length, 0, 'no variance event on a single-attempt step');
  assert.equal(outcome, 'green');
});


/**
 * A patient whose close reports a real NUMBER the worker can move: `typecheck`
 * counts the TODO markers left in src/mod.mjs and reds with the same shape the
 * live u-* closes use (`red: … reports N error(s) in …`). `makePatient`'s close
 * reports no number at all, so it can only ever read `unknown` — which makes it
 * the right control and the wrong instrument for reading a trajectory.
 *
 * F71: `process.exitCode`, never `process.exit()` — a close that prints and then
 * exits can drop its own queued stdout and read as a clean short close.
 */
function makeCountingPatient(t, seed = 30, pad = '') {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-count-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd); // the work branch is a precondition of running a job (v1.57 §3)
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), todos(seed, pad));
  writeFileSync(join(wd, 'count.mjs'), `import { readFileSync } from 'node:fs';
const n = (readFileSync(new URL('./src/mod.mjs', import.meta.url), 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('clean'); } else {
  console.log('red: tsc --strict reports ' + n + ' error(s) in src/mod.mjs');
  process.exitCode = 1;
}
`);
  return wd;
}


const COUNT_PLAN = (steps) => JSON.stringify({
  schema: 'plan-v1',
  steps: steps ?? [{
    id: 'shrink-errors', action: 'Remove TODO markers from src/mod.mjs.',
    tools: ['write'], rounds: 6, target: 'src/mod.mjs',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }],
  }],
});


/** one worker attempt: a write round, then the summary round */
const attempt = (wd, id, body) => [
  { text: `attempt ${id}`, toolCalls: [tcall(id, 'shell_write', { path: join(wd, 'src', 'mod.mjs'), content: body })] },
  { text: `attempt ${id} done` },
];


test('F85-A: the meter still fires on a CONVERGING step — and the variance record now carries the trajectory it used to be silent about', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),
    // the replan's fresh plan, which finishes the job
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 });

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, `the meter must fire — events: ${events.map((e) => e.type).join(' ')}`);
  // THE TRIGGER IS UNCHANGED. A converging step that eats the run is still
  // stopped: the meter is a governance instrument and must not judge capability.
  assert.equal(variance.threshold, 0.5, 'the threshold is untouched');
  assert.ok(variance.moneyShare >= 0.5, `share ${variance.moneyShare} is what fired it, and nothing else`);
  assert.equal(variance.axis, 'money');
  assert.equal(variance.iteration, 3, 'stopped at the HEAD of attempt 3 — attempts 1 and 2 keep their work');
  // …and the READOUT is the new half.
  assert.equal(variance.trend, 'converging', `the run WAS converging — reading: ${variance.reading}`);
  assert.match(variance.reading, /typecheck .*24 → 15/, 'the real per-stage trajectory, from the run trend');
  assert.ok(variance.series.find((s) => s.stage === 'typecheck')?.values.includes(24), 'the series rides on the record');

  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'step-variance');
  assert.ok(esc, 'the category rides out by name');
  assert.match(esc.detail, /consumed \d+%/, 'the share sentence is unchanged');
  assert.match(esc.detail, /24 → 15/, 'and the detail now states what the step actually achieved');
});


test('F85-A control: the meter fires identically on a FLAT expensive step, and reads it as flat — the reading can produce the negative, so this is not a silent disarm', async (t) => {
  // Same money story, same fire — but the worker rewrites the file with the SAME
  // error count (whitespace only), so tree-changed passes and the number does not
  // move. If `converging` were the only reachable reading the instrument would be
  // unfalsifiable and every later assertion on it would be worthless.
  const wd = makeCountingPatient(t, 24);
  const { events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24, ' ')),
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '2', todos(0)),
  ], { 1: 0.5 });

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, `the meter fires exactly as before — events: ${events.map((e) => e.type).join(' ')}`);
  assert.ok(variance.moneyShare >= 0.5);
  assert.equal(variance.trend, 'flat', `a run that moved no number reads flat — reading: ${variance.reading}`);
  assert.match(variance.reading, /no stage improved/);
  const replan = events.find((e) => e.type === 'replan');
  assert.doesNotMatch(replan.reason, /still progressing/, 'and the replan brief says so too');
});


test('F85-A: the trigger gained no progress term — a converging step UNDER the threshold is not stopped', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(0)),
  ], { 1: 1.2 }); // a 20% share — under 0.5, so nothing fires

  assert.equal(events.filter((e) => e.type === 'variance').length, 0, 'share is the only gate; progress never fires the meter by itself');
  assert.equal(events.filter((e) => e.type === 'replan').length, 0);
  assert.equal(outcome, 'green');
});


/**
 * The SHIPPED close shape: a `changed-from-seed` guard in front of the numeric
 * stage. It matters because `runStages` is first-red-wins — on a cold tree the
 * PRECHECK reds on the guard and never reaches the counter at all, so the numeric
 * stage's baseline exists only in the check PREFLIGHT. Every live u-* close is
 * built this way, which is why the seed fold is not a detail.
 */
function makeSeedGuardPatient(t, seed = 30) {
  const wd = makeCountingPatient(t, seed);
  writeFileSync(join(wd, 'seed.txt'), todos(seed));
  writeFileSync(join(wd, 'changed.mjs'), `import { readFileSync } from 'node:fs';
const now = readFileSync(new URL('./src/mod.mjs', import.meta.url), 'utf8');
const seed = readFileSync(new URL('./seed.txt', import.meta.url), 'utf8');
if (now !== seed) { console.log('changed'); } else {
  console.log('red: the tree is identical to the seed — nothing was changed');
  process.exitCode = 1;
}
`);
  return wd;
}


const GUARD_CLOSE = [
  { name: 'changed-from-seed', cmd: 'node changed.mjs', expect: 0, gapKeep: '^red' },
  { name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^red' },
];


test('F85-A: the numeric stage\'s SEED comes from the check preflight — so the commonest stop of all, a meter firing on attempt 2, is readable instead of "unknown"', async (t) => {
  // The precheck is first-red-wins and stops at `changed-from-seed`, exactly as every
  // shipped close does on a cold tree. Without the preflight seed the `typecheck`
  // series holds ONE value when the meter fires, and one value is not a comparison —
  // the readout would say "the direction is unknown" about a step that had just taken
  // 30 errors to 24. That is the blind-instrument class, not a conservative answer.
  const wd = makeSeedGuardPatient(t, 30);
  const job = COUNT_JOB(wd, { close: GUARD_CLOSE });
  const { events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '2', todos(0)),
  ], { 1: 0.5 }, { job });

  assert.equal(events.find((e) => e.type === 'close-precheck').stage, 'changed-from-seed',
    'the precheck never reached the counter — otherwise this fixture proves nothing');
  const variance = events.find((e) => e.type === 'variance');
  assert.equal(variance.iteration, 2, 'ONE step grade in hand: the commonest variance stop there is');
  assert.equal(variance.trend, 'converging', `30 → 24 is a comparison, and it exists only because the preflight seeded it — reading: ${variance.reading}`);
  assert.match(variance.reading, /typecheck 30 → 24/);
});


test('F85-B: the replan brief carries the MEASURED trajectory and never the hardcoded "unmoved" — the u-msh70zla regression', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { events, provider } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 });

  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, 'the variance still routes to a replan');
  assert.equal(replan.trigger, 'step-variance');
  assert.doesNotMatch(replan.reason, /unmoved/, 'the fixed false statement is gone — the exits MOVED, 24 → 15');
  assert.match(replan.reason, /24 → 15/, 'and the reason states the measured trajectory instead');

  // the materials keep the structural sentence AND gain the measured one
  const mat = events.filter((e) => e.type === 'materials').at(-1);
  assert.equal(mat.phase, 'replan');
  assert.match(mat.progress, /step 1 of 1/, 'the structural sentence survives');
  assert.match(mat.progress, /24 → 15/, 'and the outcome the run actually achieved rides beside it');

  // the brief is the channel that converts (F38/F39) — it must carry it too
  const brief = provider.calls.find((c) => c.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  assert.match(brief, /24 → 15/, 'the replanner is told what the stopped step achieved');
  assert.doesNotMatch(brief, /unmoved/);
  assert.match(brief, /where the run got to.*24 → 15/s, 'and the materials block states it as well');
});


test('F85-C: a SECOND variance stop on a converging run earns ONE more replan — granted by the arbiter off a mechanical trend reading', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const step = (id) => COUNT_PLAN([{ id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1 at the head of attempt 3
    { text: step('plan-b') },
    ...attempt(wd, '3', todos(10)),   // fire #2 at the head of attempt 2 → the GRANT
    { text: step('plan-c') },
    ...attempt(wd, '4', todos(0)),
  ], { 2: 0.5, 3: 0.16 });

  const replans = events.filter((e) => e.type === 'replan');
  assert.equal(replans.length, 2, `the converging run earns the second replan — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(replans[0].granted, undefined, 'the first replan is the ordinary ceiling, not a grant');
  assert.equal(replans[1].granted, 'converging', 'the second is granted BY THE ARBITER off the trend reading — the agent never asks for it');
  assert.equal(replans[1].trigger, 'step-variance', 'and only a variance stop can earn it');
  assert.equal(outcome, 'green');
  // the extra replan must not open a hole in Rule B: the check the plan carried is
  // still carried after the SECOND redraft (a shed would let a plan green on form)
  const accepted = events.filter((e) => e.type === 'plan-accepted');
  assert.equal(accepted.length, 3, 'draft + two replans');
  assert.ok(accepted.at(-1).plan.steps.every((s) => s.exit.some((e) => e.type === 'check-passes' && e.name === 'typecheck')),
    'the truth check survives the granted redraft — Rule B chains across both replans');
});


test('F85-C: the grant is BOUNDED — a THIRD variance stop is the stop, exactly as before', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const step = (id) => COUNT_PLAN([{ id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1
    { text: step('plan-b') },
    ...attempt(wd, '3', todos(10)),   // fire #2 → grant
    { text: step('plan-c') },
    ...attempt(wd, '4', todos(8)),    // fire #3 → STOP (unlimited replanning launders thrash as adaptation)
  ], { 2: 0.5, 3: 0.16, 4: 0.05 });

  assert.equal(events.filter((e) => e.type === 'replan').length, 2, 'two replans and no more, however well the run is converging');
  assert.equal(events.filter((e) => e.type === 'variance').length, 3, 'the third stop was still metered and recorded');
  assert.equal(outcome, 'step-red:plan-c', 'the stop rides out as a step-red, never as a new top-level outcome');
});


test('W-2: a THIRD variance stop PAST THE WALL is a wall-halt, never a step-red — the terminal re-reads the clock like its cap-halt sibling (u-msmt91t3)', async (t) => {
  // The sibling test above is this one's control: same three variance stops, same
  // spent grant, and with time on the clock it rides out `step-red:plan-c`. The only
  // difference here is that the wall passes before the third stop — and on the real
  // run u-msmt91t3 that stop was minted as `step-red` 9.9 seconds after the run's own
  // `wall-bounded` record. hamr's W-2 ruling names it: when time is up, keep the grade
  // we already have and stop. A `step-red` says the work failed; the clock ran out.
  const wd = makeCountingPatient(t, 30);
  const clk = fakeClock();
  // every number below is DERIVED from the spec the test builds — a hardcoded budget
  // or wall silently reds this suite the day an operator edits the shipped defaults
  const job = COUNT_JOB(wd, { maxWallMs: 600_000 });
  const b = job.budgetUsd;
  const step = (id) => COUNT_PLAN([{ id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1
    { text: step('plan-b') },
    ...attempt(wd, '3', todos(10)),   // fire #2 → the arbiter's one grant
    { text: step('plan-c') },
    ...attempt(wd, '4', todos(8)),    // fire #3 → the terminal under test
  ], { 2: b * 0.34, 3: b * 0.11, 4: b * 0.033 }, {
    job,
    start: b,
    over: { now: clk.now },
    // the wall passes AFTER the fourth judged exit and before the meter reads the head
    // of plan-c's second attempt: the step was already running when the deadline landed,
    // which is exactly the case the meter (never the head-of-attempt check) catches
    onJudged: (n) => { if (n === 4) clk.advance(job.maxWallMs + 100_000); },
  });

  assert.equal(events.filter((e) => e.type === 'variance').length, 3, 'the third stop was still metered and recorded — the meter is unchanged');
  assert.equal(events.filter((e) => e.type === 'replan').length, 2, 'and the replan ceiling is still spent, so this really is the terminal branch');
  assert.equal(outcome, 'wall-halt', 'the clock had passed — a time stop is never filed as a capability read');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the run-level TIME record reaches the spine, as it does at every other wall stop');
  assert.equal(wh.phase, 'step:plan-c');
  assert.equal(wh.cutMidCall, false, 'read between attempts with no call in flight — the money figure stays EXACT');
  assert.equal(wh.requestedMs, job.maxWallMs, 'the operator\'s own signed cap, not a re-derived one');
  assert.ok(wh.elapsedMs >= job.maxWallMs, 'the honest elapsed figure, overshoot included');
  assert.match(wh.meaning, /not "can't"/, 'a time stop is not a capability read');

  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt', 'the escalation names the same category the outcome does (F11)');
  assert.equal(esc.decisionReady, true);
  // Deliberately NOT a fourth literal copy of the lever list: this file already pins
  // WALL_OPTIONS once, and against ralph's own emission rather than against text (the
  // two lists drifted to two-vs-three levers the first time precisely because every
  // pin was literal-vs-literal). What this asserts is that THIS site hands over the
  // one shared list — the same object every other wall stop in this run would emit.
  assert.equal(esc.options.length, 3, 'one category, one option list — three levers, not a shorter list at this seam');
  assert.match(esc.options.join(' | '), /maxWallMs/, 'lever one: more time (a spec edit)');
  assert.doesNotMatch(esc.options.join(' | '), /budgetUsd/, 'and never the money levers — this run did not run out of money');
  assert.match(esc.detail, /The meter stopped the step first/, 'the meter\'s own sentence is kept, never discarded by the re-route');
});


test('W-2 CONTROL: the same third variance stop with TIME LEFT is still `step-red` — the re-read must not launder a real capability stop into a governance one', async (t) => {
  // The mirror of F64's own control. The wall is SET (so `clock.bounded` is true and
  // the time axis is live) and simply never passes: nothing about this run changed.
  const wd = makeCountingPatient(t, 30);
  const clk = fakeClock();
  const job = COUNT_JOB(wd, { maxWallMs: 600_000 });
  const b = job.budgetUsd;
  const step = (id) => COUNT_PLAN([{ id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),
    { text: step('plan-b') },
    ...attempt(wd, '3', todos(10)),
    { text: step('plan-c') },
    ...attempt(wd, '4', todos(8)),
  ], { 2: b * 0.34, 3: b * 0.11, 4: b * 0.033 }, { job, start: b, over: { now: clk.now } });

  assert.equal(events.filter((e) => e.type === 'variance').length, 3);
  assert.equal(outcome, 'step-red:plan-c', 'the stop rides out as a step-red, exactly as it does today');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no time record on a run that never ran out of time');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1).category, 'step-variance', 'and the meter\'s own escalation is the last word');
});


test('F85-C: a second variance stop on a FLAT run stops exactly as it does today — the grant is earned, never given', async (t) => {
  const wd = makeCountingPatient(t, 24);
  const step = (id) => COUNT_PLAN([{ id, action: 'Rewrite src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24, ' ')),   // fire #1
    { text: step('plan-b') },
    ...attempt(wd, '2', todos(24, '  ')),  // fire #2 — nothing has moved
  ], { 1: 0.5, 2: 0.16 });

  const variances = events.filter((e) => e.type === 'variance');
  assert.equal(variances.length, 2);
  assert.equal(variances[1].trend, 'flat', 'the reading the grant is refused on');
  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'one replan, exactly as before this change');
  assert.equal(outcome, 'step-red:plan-b');
});


// ── THE REPLAN CEILING IS THE RUN'S, AND A RUN CAN SPAN LEGS ─────────────────
//
// `replanned`/`varianceGrantUsed`/`replans` are locals in `runPlan`, so before this
// they were reborn on every call — and a resume IS another call. Measured on the
// counting patient: leg 1 spent both replans and step-redded; leg 2, driven with the
// checkpoint leg 1 left behind, replanned twice MORE. Two replans became four by
// being killed once, which is the exact creep the latch exists to make impossible
// ("unlimited replanning launders thrash as adaptation", PRD v1.12).
//
// The precedent copied is `resumeGrades` (the trend's baselines), and the reason the
// two seeds differ is worth stating: src/trend.js deliberately does NOT seed the fix
// loop's ITERATIONS from history, "because the leg's own bounds must not be spent by
// history". A leg's attempt allowance is a LEG bound. The replan ceiling is not — it
// is a RUN bound by doctrine, the same span the halt readout already asks about, so
// the history is exactly what must be spent.
const RESUMED_STEP = (id) => JSON.parse(COUNT_PLAN([{
  id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs',
  exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }],
}]));

/** a resumed leg picking up `id` with nothing yet finished — the shape `readResume`
 * returns when the kill landed inside the first step of the plan it had accepted */
const resumedAt = (id) => ({ phase: 'step', plan: RESUMED_STEP(id), completedSteps: [], planSeq: 1 });


test('resume: a leg whose predecessor SPENT the ceiling does not replan — the bound spans the chain (v1.12)', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { outcome, events } = await countRun(wd, [
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // the meter fires at the head of attempt 3
  ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 2, grantUsed: true } } });

  // the meter DID fire — the refusal has to be the ceiling's, not a stop that never
  // reached the decision (a negative for the wrong reason proves nothing)
  assert.equal(events.filter((e) => e.type === 'variance').length, 1, 'the variance stop happened, so the replan decision really was reached');
  assert.equal(events.filter((e) => e.type === 'replan').length, 0,
    'the dead leg already spent both replans — a kill must not buy a fresh allowance');
  assert.equal(outcome, 'step-red:plan-c', 'the stop rides out as the same step-red a third variance stop produces cold');
});


test('resume: a leg whose predecessor left the ceiling UNSPENT replans normally — the seed inherits a ledger, it does not disarm the mechanism', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { outcome, events } = await countRun(wd, [
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1 → the ORDINARY replan, untouched by the seed
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 0, grantUsed: false } } });

  assert.equal(events.filter((e) => e.type === 'replan').length, 1,
    'a resumed leg with the ceiling unspent replans exactly as a cold one does — this is the arm that can produce the negative');
  assert.equal(outcome, 'green');
});


test('resume: the F85-C grant cannot be RE-EARNED by a resumed leg — the latch travels beside the count', async (t) => {
  // Both arms inherit the ORDINARY ceiling as spent and hit the SAME converging
  // variance stop, so they differ in exactly one bit: whether the dead leg had
  // already been granted its one extra. Without the latch travelling, the two arms
  // are indistinguishable and the grant is re-earnable once per kill.
  const arm = async (/** @type {boolean} */ grantUsed) => {
    const wd = makeCountingPatient(t, 30);
    return countRun(wd, [
      ...attempt(wd, '1', todos(24)),
      ...attempt(wd, '2', todos(15)),   // the meter fires at the head of attempt 3
    ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 1, grantUsed } } });
  };

  const unused = await arm(false);
  assert.equal(unused.events.filter((e) => e.type === 'replan').length, 1,
    'the grant is still there to be earned — the control that proves this test can produce both answers');
  assert.equal(unused.events.find((e) => e.type === 'replan').granted, 'converging', 'and it is the arbiter\'s grant, not the ordinary ceiling');

  const used = await arm(true);
  assert.equal(used.events.filter((e) => e.type === 'variance').length, 1, 'the same stop, so the arms differ only in the inherited latch');
  assert.equal(used.events.filter((e) => e.type === 'replan').length, 0,
    'a leg cannot re-earn an extra its predecessor already spent — the ONE grant is the RUN\'s');
  assert.equal(used.outcome, 'step-red:plan-c');
});


test('resume: plan-executed.replans is the CHAIN total, so a reader can see a ceiling no single leg spent', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { events } = await countRun(wd, [
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1 on this leg → the ARBITER GRANT (the ordinary one is spent)
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 1, grantUsed: false } } });

  const replans = events.filter((e) => e.type === 'replan');
  assert.equal(replans.length, 1, 'this leg drafted one replan — the leg count stays readable as the number of records');
  assert.equal(replans[0].granted, 'converging', 'and it is the GRANT, because the ordinary ceiling was spent by the leg before it');
  assert.equal(replans[0].replan, 2, 'the record numbers it within the RUN, not within the leg');
  assert.equal(events.findLast((e) => e.type === 'plan-executed').replans, 2,
    'and the chain total is on the record — otherwise every leg reports 1 and the run\'s two are invisible');
});


/** bare-agent's TimeoutError shape (BA-18): a code, and NO category */
const timeoutError = () => Object.assign(new Error('[AnthropicProvider] request timed out after 120000ms of socket inactivity'), { code: 'ETIMEDOUT' });


test('F64: a wall-derived call timeout is a wall-halt, NOT a provider-red — the operator\'s governance stop is never filed as a network failure', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  // Call 3 is the worker's first round. The wall passes DURING it and the provider
  // rejects with bare-agent's own timeout — which is exactly what clock.callTimeoutMs()
  // asked it to do. That is the run's deadline coming back as a provider error.
  let n = 0;
  const provider = {
    name: 'wall-timeout',
    async generate() {
      n += 1;
      if (n === 3) { clk.advance(700_000); throw timeoutError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'wall-halt', 'time ran out — that is a governance stop, not a casualty');
  const cats = events.filter((e) => e.type === 'escalation').map((e) => e.category);
  assert.ok(cats.includes('wall-halt'), `the escalation names the same category the outcome does (F11) — saw ${cats.join(', ')}`);
  assert.ok(!cats.includes('provider-red'), 'nothing on the spine may call this a transport failure');
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the run-level record carries the clock\'s numbers, not just ralph\'s escalation');
  assert.equal(wh.requestedMs, 600_000);
  assert.equal(wh.enforcedMs, 840_000, 'both numbers, always (addendum 1) — and the enforced one counts every stage of this job\'s two-stage close (W5)');
  assert.ok(wh.elapsedMs >= 600_000, 'the honest elapsed figure, overshoot included');
  assert.equal(wh.cutMidCall, true, 'distinguishes a deadline that landed INSIDE a call from one read between steps');
  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'wall-halt');
  assert.match(esc.options.join(' '), /maxWallMs/, 'the decision-ready option is raise-the-cap, not retry-the-provider');
  assert.doesNotMatch(esc.decision, /transport|network|socket/i, 'the human must not be sent to debug the provider binding');
});


test('F64 control: the SAME timeout with time still on the clock stays a provider-red — the fix must not launder a real dead socket into a governance stop', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'dead-socket',
    async generate() {
      n += 1;
      // identical rejection, identical call position — the ONLY difference is that
      // the clock is NOT expired, so the wall cannot have been what bound this call.
      // A genuinely dead socket does not heal between attempts, so it throws on the
      // transport RETRY too (F115): the casualty must survive the one extra attempt.
      if (n >= 3) { clk.advance(1_000); throw timeoutError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'provider-red', 'a hang with time left is a transport casualty and must stay one');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no wall-halt record on a run that never ran out of time');
});


test('F64: an unbounded run can never produce a wall-halt — with no cap there is no deadline for a timeout to be derived from', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'unbounded-timeout',
    async generate() {
      n += 1;
      // throws on the transport retry too — a dead socket does not heal (F115)
      if (n >= 3) { clk.advance(9_000_000); throw timeoutError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { now: clk.now }); // JOB() sets no maxWallMs
  assert.equal(outcome, 'provider-red', 'the provider\'s own default timeout tripped — that is transport, and no clock claims it');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0);
});


test('F64: a wall-derived timeout during PLAN DRAFTING is a wall-halt too — the relay path is not a second, blinder route', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'draft-timeout',
    async generate() {
      n += 1;
      if (n === 2) { clk.advance(700_000); throw timeoutError(); } // the drafting call
      return { text: 'scout', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });
  assert.equal(outcome, 'wall-halt');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt');
  assert.equal(esc.phase, 'plan', 'the phase says where the clock ran out');
  assert.ok(events.find((e) => e.type === 'wall-halt'), 'the clock\'s numbers reach the spine on the drafting path too');
  // This file's OWN option list (WALL_OPTIONS), pinned — the only test that reads it.
  // Nothing used to, so it silently drifted to two levers while ralph's entry for the
  // same category offered three: one category, one option list, whichever site read
  // the clock. Both levers are spec edits, so each names its re-approval.
  assert.deepEqual(esc.options, [
    'raise maxWallMs and rerun (resume-to-cap; a spec edit, so the new hash needs re-approval)',
    'revise the goal/spec so the work fits the time (same re-approval)',
    'abandon the task',
  ]);
});


test('W-2: the wall-halt option list is ONE list — planrun\'s WALL_OPTIONS and ralph\'s DECISIONS entry pinned against EACH OTHER, not each against a literal', async (t) => {
  // The two lists are declared byte-identical in both files' comments, and the pin
  // above only holds planrun's side to a copy of the text. A literal-vs-literal pin
  // is one-sided: edit ralph's entry and nothing here fails, which is exactly how the
  // lists drifted to two-vs-three levers the first time. This reads BOTH sites'
  // real emissions and compares them to each other, so an edit to EITHER breaks.
  // Behavioural, not by import: neither list is exported (WALL_OPTIONS is a runPlan
  // local, ralph's DECISIONS a per-throw local), and the escalation's `options` is
  // the observable that actually reaches a human either way.
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'draft-timeout',
    async generate() {
      n += 1;
      if (n === 2) { clk.advance(700_000); throw timeoutError(); } // the drafting call — planrun's own WALL_OPTIONS site
      return { text: 'scout', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });
  const planrunOptions = events.filter((e) => e.type === 'escalation').at(-1)?.options;

  // ralph's side: a middle that throws the SAME category, so its DECISIONS table
  // renders the entry the same human would read from the other site
  const { events: ralphEvents, emit } = collector();
  await ralph({
    middle: () => { throw Object.assign(new Error('the wall passed'), { category: 'wall-halt' }); },
    judge: async () => ({ verdict: 'satisfied' }),
    capRuns: 1,
    emit,
  });
  const ralphEsc = ralphEvents.find((e) => e.type === 'escalation');
  assert.equal(ralphEsc?.category, 'wall-halt', 'ralph really routed the category — a different one and this compares the wrong list');

  assert.equal(planrunOptions?.length, 3, 'three levers: more time, a smaller goal, stop');
  assert.deepEqual(planrunOptions, ralphEsc.options,
    'ONE category, ONE option list — which site read the clock is an implementation detail');
});


test('T: the between-steps wall terminal — a run whose clock expires after a green step STOPS, and the stop is the checkpoint', async (t) => {
  // NOT closeGreen: an already-green close short-circuits the whole run at the
  // precheck, so the terminal under test would never be reached (a green patient
  // here reads `already-green` and proves nothing).
  const wd = makePatient(t);
  const clk = fakeClock();
  const twoSteps = [
    { id: 'one', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] },
    { id: 'two', action: 'Write tests/test_y.mjs.', tools: ['write'], rounds: 4, target: 'tests/test_y.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] },
  ];
  let n = 0;
  const provider = {
    name: 'slow-step',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd, twoSteps) },
        { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
        { text: 'step one done' },
      ][n - 1] ?? { text: 'done' };
      if (n === 4) clk.advance(700_000); // step one greened, and the clock is now spent
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });
  assert.equal(outcome, 'wall-halt', 'step two is never started — starting a step the run cannot fund is the F45 class');
  const wh = events.find((e) => e.type === 'wall-halt');
  assert.equal(wh.stepsDone, 1);
  assert.equal(wh.stepsPlanned, 2);
  assert.equal(wh.cutMidCall, false, 'read BETWEEN steps, not inside a call');
  assert.match(wh.meaning, /not "can't"/, 'a time stop is not a capability read');
});


test('a HIDDEN precondition never becomes a ruler, and a dependent stage is picked WITH its chain — through the real plan flow', async (t) => {
  const wd = makePatient(t);
  // Both stage classes v1.28 names, in one close, exercised end to end — the
  // unit tests cover checkMenu and runStages, but nothing had run either class
  // through preflight and the check-passes seam, where the menu and the chain
  // are actually consumed.
  writeFileSync(join(wd, 'seed.mjs'), 'process.exit(0);\n');                       // a precondition: always true, teaches nothing
  writeFileSync(join(wd, 'build.mjs'), `import { writeFileSync as w } from 'node:fs';
w(new URL('./built.txt', import.meta.url), 'x'); process.exit(0);\n`);
  // `api` judges what `build` produced: alone it reds for a reason that has
  // nothing to do with the worker's edit, which is what `needs` exists to prevent
  // it CONSUMES the artifact, so the chain must re-run `build` every single time:
  // a persistent artifact would let a chainless `api` pass on the leftovers from
  // preflight, and the test would go green while proving nothing
  writeFileSync(join(wd, 'api.mjs'), `import { existsSync, rmSync } from 'node:fs';
const built = new URL('./built.txt', import.meta.url);
if (!existsSync(built)) { console.log('FAILED: nothing was built'); process.exit(1); }
rmSync(built); process.exit(0);\n`);
  const job = JOB(wd, { close: [
    { name: 'seed-present', cmd: 'node seed.mjs', expect: 0, offer: false },
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'build', cmd: 'node build.mjs', expect: 0 },
    { name: 'api', cmd: 'node api.mjs', expect: 0, needs: ['build'] },
  ] });
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
    tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'api' }],
  }] });
  const provider = scriptedProvider([
    { text: 'scout' }, { text: plan },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] }, { text: 'wrote it' },
  ]);
  const { outcome, events } = await go(wd, provider, { job });

  const menu = events.find((e) => e.type === 'check-menu');
  assert.deepEqual(menu.offered, ['clean-run', 'build', 'api'], 'the derived menu, and the precondition is not in it');
  assert.deepEqual(menu.hidden, ['seed-present'], 'what was withheld is on the record, not silently dropped');
  assert.deepEqual(events.filter((e) => e.type === 'check-preflight').map((e) => e.name), ['clean-run', 'build', 'api'],
    'preflight runs the MENU — a hidden precondition is never preflighted as a ruler');
  assert.deepEqual(events.find((e) => e.type === 'check-preflight' && e.name === 'api').chain, ['build', 'api'],
    'and the dependent stage preflights as its chain');

  // the plan named `api`; picking it must have run `build` first, or api reds on
  // a phantom and the step could never green
  assert.equal(events.find((e) => e.type === 'check-run' && e.name === 'api')?.verdict, 'satisfied',
    'the chain ran, so the ruler judged the real thing');
  assert.equal(outcome, 'green');
});


// ---- P: the widened step vocabulary is WIRED, not just validated (F50 class) ----

test('P: a per-step scope NARROWS the live fence — a write the job fence allows is denied by the step scope', async (t) => {
  const wd = makePatient(t);
  const job = JOB(wd, { writeScope: ['tests/**', 'src/**'] });
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test; do not touch src.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', scope: 'tests/**',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: plan },
    // one round, two writes: src/ is INSIDE the signed fence but OUTSIDE the step scope
    { toolCalls: [
      tcall('t1', 'shell_write', { path: join(wd, 'src', 'hack.mjs'), content: 'nope\n' }),
      tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' }),
    ] },
    { text: 'wrote the test' },
  ]);
  const { outcome } = await go(wd, provider, { job });
  assert.equal(outcome, 'green');
  assert.ok(existsSync(join(wd, 'tests', 'test_x.mjs')), 'the in-scope write landed');
  assert.ok(!existsSync(join(wd, 'src', 'hack.mjs')), 'the out-of-step-scope write was denied by the NARROWED fence');
});


test('P: step.attempts is TOLERATED-INERT at the runner too — a stored bridge plan validates and the field bounds nothing', async (t) => {
  // It used to tighten the shell's fixed per-step cap, and this test read exactly
  // one iteration off it. The cap is gone: the step ladder governs iterations by
  // progress, and a field that could only ever TIGHTEN is the wrong shape for that
  // (drafters measurably tightened it to 3, then to 2 on replan). It is still
  // ACCEPTED because the frozen bridge registry's stored plans carry it — refusing
  // them would ruin a frozen contrast experiment.
  const wd = makePatient(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test.',
      tools: ['write'], rounds: 3, target: 'tests/test_x.mjs', attempts: 1,
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: plan },
    // the write lands but its content never satisfies the check → exit red, and the
    // gap is byte-identical every iteration, so the ladder strikes out at two
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'not the magic word\n' })] },
    { text: 'wrote it (wrong)' },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'still not it\n' })] },
    { text: 'wrote it (wrong again)' },
    // the replan drafter fires next (cap-halt + funds left) — feed it junk so the
    // run ends; this test reads the ITERATION count, not the ending
    { text: 'not a plan' },
  ]);
  const { events } = await go(wd, provider);
  assert.equal(events.find((e) => e.type === 'plan-validate').ok, true, 'a plan carrying attempts is accepted');
  // cut at the STEP boundaries: the close precheck and the fix loop emit the same event
  // type, so an unscoped filter can read a fix-loop iteration as the step's second one
  assert.equal(stepIterations(events).filter((e) => e.iteration === 2).length >= 1, true,
    'attempts: 1 bounded nothing — a second iteration ran under a step that declared one');
});


test('P: step.model routes the worker through providerFor(tier); the drafter stays on the default', async (t) => {
  const wd = makePatient(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', model: 'sonnet',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const main = scriptedProvider([
    { text: 'scout notes' },
    { text: plan },
  ]);
  const tiered = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote the test' },
  ]);
  /** @type {string[]} */
  const asked = [];
  const { outcome } = await go(wd, main, { providerFor: (tier) => { asked.push(tier); return tiered; } });
  assert.equal(outcome, 'green');
  assert.deepEqual(asked, ['sonnet'], 'the factory is asked for exactly the planned tier');
  assert.equal(main.calls.length, 2, 'scout + plan ran on the default provider');
  assert.ok(tiered.calls.length >= 1, 'the step worker ran on the tier provider');
});


test('P: step.model with NO providerFor is a STOP, never a silent default-tier run', async (t) => {
  const wd = makePatient(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', model: 'sonnet',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }],
    }],
  });
  const provider = scriptedProvider([{ text: 'scout notes' }, { text: plan }]);
  const { outcome, events } = await go(wd, provider);
  assert.notEqual(outcome, 'green');
  assert.ok(events.some((e) => e.type === 'escalation' && /providerFor/.test(`${e.decision ?? ''} ${e.detail ?? ''}`)),
    `the missing wiring is NAMED in the escalation — got ${JSON.stringify(events.filter((e) => e.type === 'escalation'))}`);
});


const roundCost = (events) => events.filter((e) => e.type === 'worker-round').reduce((n, e) => n + (e.costUsd ?? 0), 0);


test('WORKER truncation (F122 2A b): a step round cut at max_tokens is a FAILED ATTEMPT, never provider-red — the step continues and can go green', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'half a thou', stopReason: 'max_tokens', costUsd: 0.05 },   // attempt 1: cut round
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },  // attempt 2
    { text: 'wrote it' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green', 'the cut round cost an attempt, not the run');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'provider-red').length, 0);
  const b = events.filter((e) => e.type === 'attempt-bounded');
  assert.equal(b.length, 1);
  assert.equal(b[0].reason, 'output cut at the token limit (max_tokens)', 'the spine says WHY');
  assert.ok(events.some((e) => e.type === 'worker-round' && e.costUsd === 0.05), 'the cut round is booked, never forgiven');
  assert.ok(roundCost(events) >= 0.05);
  assert.match(provider.calls.find((c) => c.includes('CUT OFF: output cut')) ?? '', /output cut at the token limit \(max_tokens\)/, 'the next attempt is told what fired');
});


test('WORKER truncation (F122 2A b): truncated on EVERY attempt stops by the strike ladder (step-red / strike cap-halt), never provider-red', async (t) => {
  const wd = makePatient(t);
  const cut = { text: 'cut', stopReason: 'max_tokens', costUsd: 0.02 };
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    cut, cut,                                  // two strikes end the step
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] }]) },
    cut, cut,
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });
  assert.match(outcome, /^step-red:/, 'the ladder ended it');
  assert.notEqual(outcome, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'provider-red').length, 0);
  assert.equal(events.filter((e) => e.type === 'attempt-bounded' && /max_tokens/.test(e.reason ?? '')).length >= 2, true);
  assert.ok(events.filter((e) => e.type === 'ladder').some((e) => e.strike === true), 'the cut attempts consumed strikes');
  assert.ok(roundCost(events) >= 0.08 - 1e-9, 'every cut round is in the books');
});


/** a close stricter than the step's check: the step greens, the close reds once, the fix loop opens @param {string} wd */
const strictCloseFixture = (wd) => writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('ok') && t.includes('import')) process.exit(0);
console.log('FAILED close: the test never imports the module'); process.exit(1);\n`);


test('FIX truncation (F122 2A b, hamr ruling A): a fix-loop round cut at max_tokens is a FAILED fix round, never provider-red — the loop continues and can go green', async (t) => {
  const wd = makePatient(t);
  strictCloseFixture(wd);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },                                          // step greens; close reds
    { text: 'half a fix', stopReason: 'max_tokens', costUsd: 0.05 }, // fix iteration 1: cut round
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: "import { x } from '../src/mod.mjs'; // ok\n" })] }, // fix iteration 2
    { text: 'added the import' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green', 'the cut fix round cost one fix iteration, not the run');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'provider-red').length, 0);
  const b = events.filter((e) => e.type === 'attempt-bounded' && e.phase === 'fix');
  assert.equal(b.length, 1);
  assert.equal(b[0].reason, 'output cut at the token limit (max_tokens)', 'the spine says WHY');
  assert.ok(events.some((e) => e.type === 'worker-round' && e.costUsd === 0.05), 'the cut round is booked, never forgiven');
});


test('FIX truncation (F122 2A b): the NEXT fix prompt carries the cut-off note', async (t) => {
  const wd = makePatient(t);
  strictCloseFixture(wd);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },
    { text: 'half a fix', stopReason: 'max_tokens' },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: "import { x } from '../src/mod.mjs'; // ok\n" })] },
    { text: 'added the import' },
  ]);
  await go(wd, provider);
  const noted = provider.calls.filter((c) => c.includes('CUT OFF: output cut at the token limit (max_tokens)'));
  assert.equal(noted.length, 1, 'exactly the next fix attempt is told what fired');
  assert.match(noted[0], /final verification is failing/, 'and it is the fix prompt');
});


test('SCOUT truncation (F122 2A b stays step+fix only): a scout round cut at max_tokens is still provider-red', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'half a scout', stopReason: 'max_tokens' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'attempt-bounded').length, 0, 'no bounded attempt outside step/fix');
});


test('WORKER transport throw mid-step is STILL provider-red (F122 2A b touches truncation only)', async (t) => {
  const wd = makePatient(t);
  const provider = dyingAt([{ text: 'scout notes' }, { text: PLAN(wd) }], 2);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1).category, 'provider-red');
});


test('DRAFTER truncation: a plan-draft call cut off at the output cap is provider-red, never plan-red — a truncated draft is a casualty, and there is no redraft on truncation', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: 'a plan that never fini', stopReason: 'max_tokens' },  // the DRAFT call
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red', 'the drafter was cut off by the provider — that is not a bad plan');
  assert.equal(events.filter((e) => e.type === 'plan-validate').length, 0,
    'the truncated text is never validated: judging a half-emitted artifact would mint a plan-red the drafter never earned');
  assert.equal(events.filter((e) => e.type === 'plan-red').length, 0, 'and no plan-red rides out');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.equal(esc.phase, 'plan', 'the escalation says WHICH call died — the relay path is not a blinder route (F64 class)');
  assert.match(esc.detail ?? '', /truncated:max_tokens/);
});


test('REPLAN truncation (hamr 2026-10-16, run mv9gm796): a replan call cut off at max_tokens is a BOUNDED failed attempt in plain words, never provider-red', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'thinking about it' },   // attempt 1: no write
    { text: 'still thinking' },      // attempt 2: no write -> exhaustion -> the one replan
    { text: 'a replan that never fini', stopReason: 'max_tokens', costUsd: 0.05 }, // the REPLAN call, cut off
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 2 });
  assert.equal(outcome, 'plan-red', 'a cut-off replan is a failed attempt, not the provider failing');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'provider-red').length, 0);
  const b = events.filter((e) => e.type === 'attempt-bounded' && e.cause === undefined && /max_tokens/.test(e.reason ?? ''));
  assert.equal(b.length, 1, 'the spine records the bounded attempt');
  assert.equal(events.filter((e) => e.type === 'plan-validate' && /^replan/.test(e.phase ?? '')).length, 0, 'half an artifact is never validated');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'plan-red');
  assert.equal(esc.phase, 'replan');
  assert.equal(esc.cause, 'truncated');
  assert.match(esc.decision, /replan answer was cut off at its length limit/);
  assert.ok(events.some((e) => e.type === 'worker-round' && e.costUsd === 0.05), 'the cut round is booked');
  assert.ok(events.find((e) => e.type === 'plan-executed'), 'plan-as-executed record never dangles');
});


test('REPLAN-DRAFTER casualty: a transport death during the replan draft is provider-red, and the spine still records that the replan was ATTEMPTED', async (t) => {
  const wd = makePatient(t);
  // Same fixture as the ONE-replan test: plan A's step writes nothing, so
  // tree-changed reds every attempt → cap-halt with funds left → the one replan.
  // Call 4 is the replan draft, and it dies on the wire.
  const provider = dyingAt([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'thinking about it' },   // attempt 1: no write
    { text: 'still thinking' },      // attempt 2: no write → exhaustion
  ], 4);
  const { outcome, events } = await go(wd, provider, { capRuns: 2 });
  assert.equal(outcome, 'provider-red', 'the replan drafter is a provider consumer like any other — its casualty is a casualty');
  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, 'the replan is on the record even though its draft never came back — a phase that spent must not vanish');
  assert.equal(replan.trigger, 'cap-halt');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red', 'the returned outcome and the last escalation agree (F11)');
  assert.equal(esc.phase, 'replan');
  assert.ok(events.find((e) => e.type === 'plan-executed'), 'the plan-as-executed record never dangles, even on a casualty exit (design law #2)');
});
