// Layer 2 module 4b — the plan executor — resume seeds, the strike ladder, gap shape, read shim and work-branch fences.
// Split from the former tests/planrun.test.js (hamr 2026-10-11) for parallel runs; tests moved
// verbatim. Shared fixtures: tests/planrun-fixtures.js. Original header: integration-grade — real
// bare-agent Loop, real Gate, real spawned checks and closes, scripted provider (the one legitimate seam).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runPlan, planPrompt, closeGapBlock, rateSourceFields, FORBIDDEN_WRITE_SEGMENT_PATTERN } from '../src/planrun.js';
import { boundGap, GAP_KEEP_TRIM_MARKER } from '../src/ralph.js';
import { validateJob } from '../src/job.js';
import { StallError, MAX_STALLS } from '../src/stall.js';
import { scriptedProvider, scriptedNativeFactory, initPatientRepo, currentBranch, localBranches, reply } from './helpers.js';
import { scanSecrets } from '../src/validate.js';
import { signCloseScripts } from '../src/close-integrity.js';
// F178/F177: the real bareguard Gate, driven with the EXACT fs config shape
// mkWorker builds (src/planrun.js), to prove the runtime belt with no fixture
// standing in for bareguard's own fs primitive.
import { Gate } from 'bareguard';
import { GATE_AUDIT_FILE, ARBITER_BOOK_STORES } from '../src/kinds.js';
// the check gap's ONE ceiling — the backstop test below derives both arms from it
// rather than respelling 12000, so a change to the constant moves the test with it
import { CHECK_GAP_MAX } from '../src/exits.js';
import { tcall, makePatient, JOB, PLAN, collector, go, todos, countRun, fakeClock, strictCloseOverCheck, afterFixLoop, countingClose, stepIterations } from './planrun-fixtures.js';

// ── RESUME, step level (module C v2) ────────────────────────────────────────
//
// hamr's ruling, verbatim: *"even if it gets killed by outside, it should allow resume
// and start last step instead from the beginning, why would i want to waste more money
// on something i already started, our goal is to find ways to save money and time"*.
//
// So the seed is the finest checkpoint the dead run's own spine can PROVE: the plan it
// accepted and the steps that reached their exits. Nothing here re-pays for a paid unit —
// not the scout, not the draft, not a finished step — and nothing here is inferred: a
// skipped step says so on the spine, with the event it relies on.

/** the two-step plan the resume fixtures reload: one step per fenced directory */
const TWO_STEP = (wd) => ({
  schema: 'plan-v1',
  steps: [
    { id: 'seed-src', action: 'Write src/a.mjs.', tools: ['write'], rounds: 4, target: 'src/a.mjs', exit: [{ type: 'artifact-written', path: 'src/a.mjs' }] },
    { id: 'write-test', action: 'Write tests/test_x.mjs with an ok assertion.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] },
  ],
});

/** the job those steps are fenced by — both directories writable */
const TWO_STEP_JOB = (wd) => JOB(wd, { writeScope: ['src/**', 'tests/**'] });


test('resume seed: the accepted plan is RELOADED — no scout, no draft — and the step that already finished is SKIPPED with the evidence it rests on', async (t) => {
  const wd = makePatient(t);
  const plan = TWO_STEP(wd);
  // the only calls this run may make are the REMAINING step's: a scout call or a draft
  // call would consume the first entry and the assertions below would catch it
  const provider = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    resumeSeed: { phase: 'steps', plan, completedSteps: [{ id: 'seed-src', seq: 42, by: 'step-end' }] },
  });

  assert.equal(outcome, 'green');
  assert.equal(provider.calls.length, 2, `only the remaining step was paid for: ${provider.calls.join(' | ').slice(0, 200)}`);
  assert.ok(!events.some((e) => e.type === 'scout-start'), 'the scout is not re-paid');
  assert.ok(events.some((e) => e.type === 'scout-skipped'), 'and its absence is a RECORD, never silence');
  assert.ok(!events.some((e) => e.type === 'plan-validate' && String(e.phase).startsWith('draft')), 'the draft is not re-paid');
  assert.ok(events.some((e) => e.type === 'plan-accepted' && e.phase === 'resume'), 'the reloaded plan is this leg\'s plan-as-executed — R1 reads it back off the spine');

  const skipped = events.filter((e) => e.type === 'step-skipped');
  assert.deepEqual(skipped.map((e) => e.step), ['seed-src']);
  assert.equal(skipped[0].provenSeq, 42, 'the skip names the event that proves it');
  assert.ok(!events.some((e) => e.type === 'step-start' && e.step === 'seed-src'), 'never a fake step-start for a step that did not run');
  assert.ok(!events.some((e) => e.type === 'step-end' && e.step === 'seed-src'), 'and never a fake step-end either');
  assert.ok(events.some((e) => e.type === 'step-start' && e.step === 'write-test'), 'the in-flight step DOES run, fresh');
  const exec = events.find((e) => e.type === 'plan-executed');
  assert.deepEqual(exec.steps, [{ id: 'seed-src', outcome: 'skipped' }, { id: 'write-test', outcome: 'green' }],
    'the plan-as-executed record tells skipped from run — a reader can never mistake one for the other');
  assert.equal(existsSync(join(wd, 'src', 'a.mjs')), false, 'the skipped step is genuinely not re-run');
});


// PRD v1.80 TODO #4 / F115 — provider-red JOINS the resumable set. hamr's ruling
// verbatim: *"joins resume anyways and you decide but you are given an honest
// readout and with 1 retry"*. The classification live (which OUTCOME names count
// as a checkpoint) is scripts/run-u.mjs's RESUMABLE_HALTS / src/reuse.js's
// CHECKPOINT_OUTCOMES — this file's own scope. What THIS test proves is the other
// half of "do not build a second parallel path": `runPlan`'s resume machinery
// (resumeSeed/resumeBranch) does not know or care which terminal minted the
// checkpoint it is handed, so a checkpoint that happened to come from a
// transport casualty composes byte-for-byte like a cap-halt/wall-halt one.
test('resume seed derived from a PROVIDER-RED checkpoint composes exactly like any other governance halt: the accepted plan reloads, the finished step is skipped, and the run finishes on the remaining step alone', async (t) => {
  const wd = makePatient(t);
  const plan = TWO_STEP(wd);
  // LEG 1 (cold): scout, draft, step 'seed-src' finishes green, then step
  // 'write-test' throws a transport-shaped error on every subsequent call. This
  // is the SAME shape src/run.js's F115 tests exercise at the runJob layer (one
  // retry via src/planrun.js's withTransportRetry, then exhausted) — reproduced
  // here so the checkpoint it leaves behind is read straight off real events,
  // not hand-waved.
  const leg1Script = [
    { text: 'surveyed the repo' },
    { text: PLAN(wd, plan.steps) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'a.mjs'), content: 'export const a = 1;\n' })] },
    { text: 'wrote src/a.mjs' },
  ];
  let n1 = 0;
  const leg1Provider = {
    calls: [],
    async generate() {
      n1 += 1; leg1Provider.calls.push(1);
      if (n1 <= leg1Script.length) return reply(leg1Script[n1 - 1]);
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    },
  };
  const leg1 = await go(wd, leg1Provider, { job: TWO_STEP_JOB(wd) });
  assert.equal(leg1.outcome, 'provider-red', 'write-test exhausted its one transport retry (F115) — the same shape src/run.js already covers at the runJob layer');
  assert.ok(leg1.events.some((e) => e.type === 'step-end' && e.step === 'seed-src' && e.outcome === 'green'),
    'seed-src genuinely finished — real work is on disk before the transport casualty landed');
  assert.equal(leg1.events.filter((e) => e.type === 'transport-retry').length, 1, 'exactly one retry was spent, then it gave up');
  const branch1 = leg1.events.find((e) => e.type === 'work-branch')?.branch ?? null;
  assert.equal(typeof branch1, 'string', 'a work branch was created for leg 1\'s write (PRD v1.57 §3) — this is what a resume must return to');

  // LEG 2 (the resume): resumeSeed/resumeBranch here are exactly the shape
  // `readResume` (src/reuse.js) reads back off leg 1's own spine once
  // provider-red is in the caller's resumableOutcomes — this test hands runPlan
  // that same shape directly, precisely because runPlan has no reuse.js import
  // and must not need one: nothing here special-cases where the checkpoint came
  // from.
  const leg2Provider = scriptedProvider([
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const leg2 = await go(wd, leg2Provider, {
    job: TWO_STEP_JOB(wd),
    resumeSeed: { phase: 'steps', plan, completedSteps: [{ id: 'seed-src', seq: 1, by: 'step-end' }] },
    resumeBranch: branch1,
  });
  assert.equal(leg2.outcome, 'green', 'the resume finishes the plan leg 1 accepted, on the step leg 1 never reached');
  assert.equal(leg2Provider.calls.length, 2, 'only write-test is paid for — no re-scout, no re-draft, and seed-src is never re-run');
  assert.ok(!leg2.events.some((e) => e.type === 'scout-start'), 'the scout is not re-paid');
  assert.ok(leg2.events.some((e) => e.type === 'scout-skipped'), 'and its absence is a RECORD, never silence');
  assert.ok(!leg2.events.some((e) => e.type === 'step-start' && e.step === 'seed-src'), 'seed-src is never re-run');
  assert.ok(leg2.events.some((e) => e.type === 'step-skipped' && e.step === 'seed-src'), 'seed-src is SKIPPED, carrying leg 1\'s own evidence forward');
  const exec = leg2.events.find((e) => e.type === 'plan-executed');
  assert.deepEqual(exec.steps, [{ id: 'seed-src', outcome: 'skipped' }, { id: 'write-test', outcome: 'green' }],
    'the plan leg 1 accepted is preserved WHOLE across the transport-red checkpoint, never truncated to the finished step');
  // LEG 2 resumes onto the SAME branch leg 1 created — a fresh one would strand
  // leg 1's finished write (v1.57 §3), exactly the rule a cap-halt/wall-halt
  // resume already relies on.
  const branch2 = leg2.events.find((e) => e.type === 'work-branch');
  assert.equal(branch2.branch, branch1, 'the resume returns to leg 1\'s own branch — never a fresh one that would strand its work');
  assert.equal(branch2.resumed, true);
});


test('resume seed at the CLOSE: every step is skipped and the run goes straight to the close, which re-runs and opens its fix loop', async (t) => {
  const wd = makePatient(t);
  const plan = TWO_STEP(wd);
  const provider = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'fixed' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    resumeSeed: {
      phase: 'close',
      plan,
      completedSteps: [{ id: 'seed-src', seq: 10, by: 'step-end' }, { id: 'write-test', seq: 20, by: 'step-end' }],
    },
  });

  assert.equal(outcome, 'green');
  assert.equal(provider.calls.length, 2, 'the only worker paid for is the fix loop\'s');
  assert.ok(!events.some((e) => e.type === 'scout-start'));
  assert.ok(!events.some((e) => e.type === 'step-start'), 'no step is re-run — the steps were done when the kill landed');
  assert.deepEqual(events.filter((e) => e.type === 'step-skipped').map((e) => e.step), ['seed-src', 'write-test']);
  assert.ok(events.some((e) => e.type === 'outer-close'), 'the close re-runs — it is a command, stateless and free of tokens');
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'and the fix loop continues under the folded remainder');
});


test('resume seed: a stored plan that no longer VALIDATES is refused by name — an invalid plan is never run', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'must never be called' }]);
  const stale = {
    schema: 'plan-v1',
    // `run` has never been in the menu and the signed spec does not grant it: a plan
    // carrying it is the registry/schema-drift case
    steps: [{ id: 'x', action: 'Do it.', tools: ['run'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs' }] }],
  };
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    resumeSeed: { phase: 'steps', plan: stale, completedSteps: [] },
  });

  assert.equal(outcome, 'plan-red');
  assert.equal(provider.calls.length, 0, 'nothing was spent on a plan that cannot legally run');
  const named = events.find((e) => e.type === 'resume-plan-red');
  assert.ok(named, `the refusal is its own record: ${events.map((e) => e.type).join(' ')}`);
  assert.ok(named.reds.length > 0, 'and it carries the reds that refused it');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'plan-red', 'the escalation and the outcome agree (F11)');
  assert.match(esc.decision, /resum/i, 'and the decision says this is the RESUMED plan, not a fresh draft the model got wrong');
  assert.ok(!events.some((e) => e.type === 'step-start'));
});


test('resume seed: a REPLAN after a resume clears the skip set — the new plan\'s steps are not the dead plan\'s steps', async (t) => {
  const wd = makePatient(t);
  const plan = TWO_STEP(wd);
  const replanned = JSON.stringify({
    schema: 'plan-v1',
    steps: [
      { id: 'seed-src', action: 'Write src/a.mjs (same id, NEW plan).', tools: ['write'], rounds: 4, target: 'src/a.mjs', exit: [{ type: 'artifact-written', path: 'src/a.mjs' }] },
      { id: 'second-go', action: 'Write the test properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] },
    ],
  });
  const provider = scriptedProvider([
    { text: 'attempt 1 — writes nothing' },          // resumed step 2, attempt 1 → exit red
    { text: 'attempt 2 — writes nothing' },          // attempt 2 → exhausted, funds left
    { text: replanned },                              // the ONE replan draft
    { toolCalls: [tcall('a', 'shell_write', { path: join(wd, 'src', 'a.mjs'), content: 'export const a = 1;\n' })] },
    { text: 'wrote src/a.mjs' },
    { toolCalls: [tcall('b', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote the test' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    capRuns: 2,
    resumeSeed: { phase: 'steps', plan, completedSteps: [{ id: 'seed-src', seq: 7, by: 'step-end' }] },
  });

  assert.equal(outcome, 'green');
  assert.ok(events.some((e) => e.type === 'replan'), 'the resumed step exhausted its attempts with funds left, so the one replan fired');
  assert.deepEqual(events.filter((e) => e.type === 'step-skipped').map((e) => e.step), ['seed-src'],
    'exactly ONE skip: the dead plan\'s completed step. The new plan re-uses that id and must NOT inherit its green');
  const startsAfterReplan = events.slice(events.findIndex((e) => e.type === 'replan')).filter((e) => e.type === 'step-start');
  assert.deepEqual(startsAfterReplan.map((e) => e.step), ['seed-src', 'second-go'],
    'every step of the new plan runs — a skip set that survived the replan would silently skip work nobody did');
  assert.equal(existsSync(join(wd, 'src', 'a.mjs')), true);
});


test('resume seed: a completed step that does not line up with the reloaded plan is RUN, never skipped on a mismatched id', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { toolCalls: [tcall('a', 'shell_write', { path: join(wd, 'src', 'a.mjs'), content: 'export const a = 1;\n' })] },
    { text: 'wrote src/a.mjs' },
    { toolCalls: [tcall('b', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote the test' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    // a seed naming a step this plan does not have at that position: the skip is a PREFIX
    // match on ids, never a count, so it stops rather than skipping whatever sits there
    resumeSeed: { phase: 'steps', plan: TWO_STEP(wd), completedSteps: [{ id: 'a-step-from-another-plan', seq: 3, by: 'step-end' }] },
  });

  assert.equal(outcome, 'green');
  assert.deepEqual(events.filter((e) => e.type === 'step-skipped').map((e) => e.step), [], 'nothing is skipped on an id that does not match');
  assert.deepEqual(events.filter((e) => e.type === 'step-start').map((e) => e.step), ['seed-src', 'write-test'], 'both steps run — re-doing work is the safe direction, skipping work nobody did is not');
  const seedRec = events.find((e) => e.type === 'resume-seed');
  assert.equal(seedRec.skipping, 0);
  assert.match(seedRec.divergence, /line up/, 'and the divergence is on the record, never a silent discard');
});


// ── THE STEP LADDER (design 2026-08-03). The step loop's exhaustion rule was a
// FIXED COUNT (`capRuns`, 4 in the operator's runner) and it demonstrably cut
// converging work: u-msd916dh went 30 → 22 → 17 → 11 scope errors and was stopped
// with $1.30 and ~6 minutes unspent. It is replaced by a PROGRESS rule — a strike
// per red iteration that repeats a gap or writes nothing, two strikes ends the
// step — with money, wall, variance and the stall fuse keeping every bit of their
// current authority.

/** a patient whose close/check output MOVES with the tree: it counts TODO markers
 * and reports the count, the way a real `tsc` reports an error count. The fixed
 * `FAILED …` line of `makePatient` cannot express a trajectory at all, so a
 * converging run there is inexpressible — the fixture has to be able to show the
 * thing under test. */
function makeConvergingPatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-ladder-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'tests'));
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (!existsSync(p)) { console.log('FAILED: tests/test_x.mjs is missing'); process.exit(1); }
const n = (readFileSync(p, 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('suite: clean'); process.exit(0); }
console.log(\`FAILED: \${n} error(s) remain\`); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), probe);
  writeFileSync(join(wd, 'check.mjs'), probe);
  return wd;
}


/** like makeConvergingPatient, but the check's red line NAMES a file — the
 * mismatch-note tests point it at a file the worker does or does not write */
function makeMismatchPatient(t, gapPath) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-mismatch-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'tests'));
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (!existsSync(p)) { console.log('FAILED: tests/test_x.mjs is missing'); process.exit(1); }
const n = (readFileSync(p, 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('suite: clean'); process.exit(0); }
console.log(\`FAILED: \${n} error(s) remain in ${gapPath}\`); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), probe);
  writeFileSync(join(wd, 'check.mjs'), probe);
  return wd;
}


const LADDER_PLAN = (wd, over = {}) => PLAN(wd, [{
  id: 'shrink-errors', action: 'Remove the TODO markers from tests/test_x.mjs.',
  tools: ['write'], rounds: 4, target: 'tests/test_x.mjs',
  exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  ...over,
}]);


/** one script entry pair per step iteration: a write, then the attempt's summary
 * round. `scriptedProvider` sticks on the last entry, so once the list runs out the
 * worker writes nothing more — which is itself a strike, so nothing can hang. */
const iterWrites = (wd, contents) => contents.flatMap((content, i) => [
  { toolCalls: [tcall(`w${i}`, 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content })] },
  { text: `attempt ${i + 1} done` },
]);


test('LADDER (a) CONVERGING: a step whose gap moves every iteration is NEVER struck out — it runs past the old fixed count and greens', async (t) => {
  const wd = makeConvergingPatient(t);
  // 5 iterations. The old rule (capRuns) would have cut this at 4 with the error
  // count still falling — the exact shape of u-msd916dh.
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO TODO TODO\n', 'TODO TODO TODO\n', 'TODO TODO\n', 'TODO\n', 'clean\n']),
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });

  assert.equal(outcome, 'green');
  assert.equal(stepIterations(events).length, 5,
    'five iterations under a fixed count of four — the count is no longer what bounds a step');
  const reads = events.filter((e) => e.type === 'ladder');
  assert.equal(reads.length, 4, 'one reading per RED iteration; the green one is never read');
  assert.deepEqual(reads.map((e) => e.strike), [false, false, false, false], 'nothing struck: every gap moved and every iteration wrote');
  assert.deepEqual(reads.map((e) => e.wrote), [true, true, true, true]);
  assert.equal(reads.at(-1).distinctGaps, 4);
  assert.equal(events.filter((e) => e.type === 'cap-halt').length, 0,
    'and the gate never halted it either — the per-iteration turn allowance floats with the ladder');
});


test('LADDER (b) OSCILLATION A→B→A→B: the repeat strikes, and the second repeat ends the step', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    // 3 errors → 1 → 3 → 1: iterations 3 and 4 are gaps already seen. A last-only
    // comparison reads every one of these as progress (the gap differs from the one
    // before it every single time) — only a seen-set catches the cycle.
    ...iterWrites(wd, ['TODO TODO TODO\n', 'TODO\n', 'TODO TODO TODO\n', 'TODO\n']),
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'the replanned step writes nothing either' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });

  const reads = events.filter((e) => e.type === 'ladder');
  assert.deepEqual(reads.slice(0, 4).map((e) => e.strike), [false, false, true, true],
    'the oscillation is caught the moment a gap comes BACK, not when it merely repeats the last one');
  assert.deepEqual(reads.slice(0, 4).map((e) => e.wrote), [true, true, true, true],
    'the worker was writing the whole time — the repeat alone did this (the OR is an OR)');
  assert.equal(reads[2].repeatOf, 1, 'and the record names the iteration the gap was first seen at');
  assert.equal(reads[3].repeatOf, 2);
  assert.equal(stepIterations(events).length, 4, 'two strikes ended it');
  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'and the routing is unchanged: exactly one replan');
  assert.match(outcome, /^step-red:/);
});


test('LADDER (c) IDLE: a worker that writes nothing strikes out in two iterations, whatever the fixed count says', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    { text: 'thinking about it' },   // iteration 1: text only
    { text: 'still thinking' },      // iteration 2: text only → two strikes
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'the replanned step is idle too' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });

  assert.equal(stepIterations(events).length, 2,
    'STRIKE_LIMIT bounds it at two, NOT the fixed count of four — an idle worker is not bought three more times');
  const reads = events.filter((e) => e.type === 'ladder').slice(0, 2); // the FIRST step's; the replanned one has its own
  assert.deepEqual(reads.map((e) => [e.wrote, e.strike]), [[false, true], [false, true]]);
  assert.equal(reads[0].repeatOf, null, 'the first gap was novel — it struck on the WRITE signal alone');
  assert.equal(reads[1].strikes, 2);
  assert.equal(events.filter((e) => e.type === 'replan').length, 1);
  assert.match(outcome, /^step-red:/);
});


test('LADDER: the strike-out escalation stays category cap-halt (downstream counts categories) but says STRIKES, never "N/N runs spent"', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    { text: 'writes nothing' },
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'nor does the replanned one' },
  ]);
  const { events } = await go(wd, provider, { capRuns: 4 });
  const esc = events.filter((e) => e.type === 'escalation' && e.category === 'cap-halt');
  assert.ok(esc.length >= 1, 'the category is unchanged — a renamed category is counted as an unclassified escalation downstream');
  assert.match(esc[0].decision, /strike/i, 'the copy names the real trigger');
  assert.doesNotMatch(esc[0].decision, /runs spent/, 'the fixed-count sentence is a lie about what stopped it');
  assert.equal(esc[0].spend.strikeLimit, 2);
  assert.equal(esc[0].spend.strikes, 2);
  const halt = events.filter((e) => e.type === 'cap-halt').at(0);
  assert.equal(halt.strikes, 2);
  assert.equal(halt.strikeLimit, 2);
  assert.equal(halt.capRuns, undefined, 'a step ladder halt never carries a number that no longer bounds it');
});


test('LADDER: the replan brief names the SHAPE that ended the step, its evidence, and what was left on the table', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    // the same content three times: the gap is byte-identical, so iterations 2 and 3
    // are both repeats and the worker wrote on every one of them
    ...iterWrites(wd, ['TODO TODO\n', 'TODO TODO\n', 'TODO TODO\n']),
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'nothing' },
  ]);
  await go(wd, provider, { capRuns: 4, job: JOB(wd, { maxWallMs: 600_000 }) });

  const replanPrompt = provider.calls.find((c) => c.includes('What happened when the previous plan ran'));
  assert.ok(replanPrompt, 'the replan drafted');
  assert.match(replanPrompt, /repeated itself/, 'WHICH shape ended the step');
  assert.match(replanPrompt, /iteration 3 had already been seen at iteration 1/, 'and the evidence for it');
  assert.match(replanPrompt, /1 distinct exit output\(s\) over 3 iteration\(s\)/, 'the gap trajectory, as a fact');
  assert.doesNotMatch(replanPrompt, /stalled/, 'the worker wrote every iteration — the brief must not also claim it stalled');
  assert.doesNotMatch(replanPrompt, /It ran \d+ attempts/, 'the old sentence described a bound that no longer exists');
  assert.match(replanPrompt, /\$\d+\.\d\d and \d+ minute\(s\) of the run were still unspent/,
    'and what the step left on the table — the money and the time a raised count would have bought');
});


test('LADDER: with NO wall set the brief reports the time left as unbounded — never 0 minutes (F6 extends to time)', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO\n', 'TODO TODO\n', 'TODO TODO\n']),
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'nothing' },
  ]);
  await go(wd, provider, { capRuns: 4 }); // the JOB fixture sets no maxWallMs
  const replanPrompt = provider.calls.find((c) => c.includes('What happened when the previous plan ran'));
  assert.match(replanPrompt, /time UNBOUNDED/, 'an unknown/unbounded duration is reported as such, never rendered as a number');
  assert.doesNotMatch(replanPrompt, /0 minute\(s\) of the run were still unspent/);
});


// ---- the prose-prohibition trap (u-msdpuaej, 2026-08-03) ----------------------
// A drafter wrote "Do not modify any file outside src/loop.js" into a step whose
// exit check judges the WHOLE goal; the worker obeyed the prose and ground to
// death against errors in a file it was told to leave alone. Two fixes: the
// planPrompt law (a step must be free to edit everything its check can report),
// and a mechanical line in the replan brief naming the gap-files the step never
// wrote (gap paths vs the F32 write audit — the F38 mechanical genre).

test('planPrompt states the exit-freedom law: a step must be free to edit every file its check can report — forbidding files the exit judges is the u-msdpuaej death', () => {
  const p = planPrompt(JOB('/tmp/x'), 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 });
  assert.match(p, /free to edit every file the check can report/i);
  assert.match(p, /never\s+write an action that forbids/i);
});


// ---- the no-shell law (u-msmt91t3, 2026-08-10) --------------------------------
// Two replans in a row drafted actions opening "Run `npx tsc --strict --noEmit`…"
// against a worker granted read/grep/edit. The scout prompt (src/authorscout.js) and
// the worker persona (src/tools.js) both state the worker has no shell; the DRAFTER
// prompt never did, and the drafter is the one writing the instruction. The worker
// obeyed as best it could and spent 14 rounds hunting the errors by hand, writing
// nothing. Prompt register only: a text regex over the drafted action would false-red
// the operator's OWN signed goal, which legitimately names the command as the
// description of done (the F86 anti-precedent).

test('planPrompt states the NO-SHELL law: the worker cannot run a command, and the named check is the only execution in the run', () => {
  const p = planPrompt(JOB('/tmp/x'), 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 });
  assert.match(p, /NO SHELL/, 'stated in the prompt\'s own voice, not implied by the tool list');
  assert.match(p, /cannot run a command/i, 'the load-bearing prohibition');
  assert.match(p, /ONLY execution in this run/i, 'and what DOES execute — the check the shell runs after each attempt');
  assert.match(p, /Never tell it to run, execute, re-run/i, 'aimed at the drafting act that caused the death');
  assert.match(p, /READING and GREPPING/i, 'and it says what to write instead — a capability without a strategy is inert (F19)');
});


test('planPrompt puts the no-shell law AFTER the exit-freedom law — the check laws read as one block, and execution is explained where check-passes is offered', () => {
  const p = planPrompt(JOB('/tmp/x'), 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 });
  const freedom = p.indexOf('free to edit every file the check can report');
  const noShell = p.indexOf('NO SHELL');
  assert.ok(freedom > 0 && noShell > 0, 'both laws render');
  assert.ok(noShell > freedom, `the no-shell law follows the exit-freedom law (freedom@${freedom}, no-shell@${noShell})`);
});


test('planPrompt: the no-shell law is UNCONDITIONAL — the worker has no shell on any plan, so it renders with or without checkFacts, and on a replan too', () => {
  // Deliberately not plumbed through the facts object: `tools` never contains a verb
  // that runs anything (TOOL_MENU has no `run`, and `run` stays locked forever), so
  // there is no plan shape this law does not apply to. A conditional law is a law the
  // replan — the draft that actually produced the death — can miss.
  const args = [JOB('/tmp/x'), 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 }];
  assert.match(planPrompt(...args, null, {}), /NO SHELL/, 'cold draft, no facts');
  assert.match(planPrompt(...args, null, { seedRed: ['clean-run'] }), /NO SHELL/, 'with Rule A-v2 in play');
  assert.match(planPrompt(...args, null, { priorChecks: ['clean-run'] }), /NO SHELL/, 'and on the replan, which is where u-msmt91t3 lost its rounds');
  const replan = planPrompt(JOB('/tmp/x'), 'scout notes', null, 40, 'the previous plan did not reach its exits', undefined, { balanceUsd: 1.5 });
  assert.match(replan, /NO SHELL/, 'the failure appendix never displaces the law');
});


test('planPrompt: the tools gloss says read/grep are the ONLY way to see the tree — the menu line is where a drafter reads what a step can do', () => {
  const p = planPrompt(JOB('/tmp/x'), 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 });
  const gloss = p.slice(p.indexOf('- "tools"'), p.indexOf('- "rounds"'));
  assert.match(gloss, /ONLY way to see the tree/i, 'stated on the tools line itself');
  assert.match(gloss, /there is no shell/i);
  assert.match(gloss, /write\/edit change the tree/, 'and the pre-existing gloss survives beside it');
});


/** the converging-ladder run, with the clock driven from the test: after provider call
 * `advanceAt` it jumps by `advanceBy`. `go` pins the wallet flat ($1.50 throughout), so
 * the meter here is purely TIME-driven — which is what lets one fixture produce both
 * arms: past the wall (advanceBy > the cap) and short of it (a share over the threshold
 * with time still left). Returns the run PLUS every prompt actually bought, because the
 * drafting call is the thing under test and counting the harness's own invocations is
 * the only way to observe a call that was never made. */
async function ladderWallRun(t, { advanceAt, advanceBy }) {
  const wd = makeConvergingPatient(t);
  const clk = fakeClock();
  const script = [
    { text: 'scout' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO TODO\n', 'TODO TODO\n', 'TODO\n', 'clean\n']),
  ];
  // the replan's draft, offered at the point the meter stops the (still converging)
  // first step. OFFERED, not consumed: whether the run buys it is the claim.
  script.splice(6, 0, { text: LADDER_PLAN(wd, { id: 'second-go' }) });
  /** @type {string[]} every prompt this run actually bought, in order */
  const bought = [];
  const provider = {
    name: 'wall-mid-convergence',
    async generate(/** @type {any[]} */ messages) {
      const s = script[bought.length] ?? { text: 'never bought' };
      bought.push(String(messages.at(-1)?.content ?? ''));
      // the clock jumps right after iteration 2's summary round, with the error
      // count still falling — progress is real and the clock wins anyway
      if (bought.length === advanceAt) clk.advance(advanceBy);
      return { text: s.text ?? '', toolCalls: s.toolCalls ?? [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const run = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 4 });
  return { ...run, bought };
}


/** the DRAFTING calls this run bought, counted off the harness's own record of what
 * reached the provider — never a hardcoded call index, which silently retargets the
 * moment the number of rounds changes (the F37 class) */
const draftCalls = (bought) => bought.filter((p) => p.includes('DRAFT-PLAN'));


test('LADDER (e) WALL beats progress: an expired clock ends a CONVERGING ladder at the STOP ITSELF — the doomed replan is never funded (hamr: past the wall no new step starts)', async (t) => {
  // 700s past a 600s cap: the wall is CROSSED while the step is still converging
  const { outcome, events, bought } = await ladderWallRun(t, { advanceAt: 6, advanceBy: 700_000 });

  assert.equal(outcome, 'wall-halt', 'time ran out — progress does not buy time the operator did not sign');
  const reads = events.filter((e) => e.type === 'ladder');
  assert.deepEqual(reads.map((e) => e.strike), [false, false],
    'the ladder struck NOTHING: every gap moved and every iteration wrote — the clock alone stopped this run');
  assert.equal(events.filter((e) => e.type === 'escalation')[0].category, 'step-variance',
    'a step ALREADY RUNNING when the deadline passes is stopped by the meter, exactly as before');

  // THE CLAIM. The replan draft was offered by the script and never bought: past the
  // deadline the whole cycle is doomed — the redraft is paid for, its first step is
  // refused at its own head, and the run wall-halts anyway (u-msmt91t3 paid for that).
  assert.equal(events.filter((e) => e.type === 'replan').length, 0, 'no replan is funded past the wall');
  assert.equal(events.filter((e) => e.type === 'plan-accepted').length, 1, 'the ONE plan this run drafted is the one it ran');
  assert.equal(draftCalls(bought).length, 1, `the drafter was called ONCE (the original plan) and never again — bought ${bought.length} call(s)`);
  assert.ok(!bought.some((p) => p.includes('What happened when the previous plan ran')),
    'and no replan brief was ever composed, let alone paid for');

  // the wall-halt is minted at the meter's OWN stop now — the same package the D1
  // terminal builds, at the step that was actually running
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.phase, 'step:shrink-errors', 'the step the clock actually stopped, not a successor that never began');
  assert.equal(wh.cutMidCall, false, 'read between attempts with no call in flight — the money figure stays EXACT');
  assert.equal(wh.stepsDone, 0, 'no step of this plan finished');
  assert.equal(wh.capRuns, undefined, 'never a field name meaning something it no longer measures');
  assert.equal(wh.stepAttemptCap, undefined);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt', 'the escalation names the same category the outcome does (F11)');
  assert.match(esc.options.join(' | '), /maxWallMs/, 'and the human is handed the wall\'s own levers');
});


test('LADDER (e) CONTROL: the SAME converging ladder with time on the clock still buys its replan — the gate costs a healthy run nothing', async (t) => {
  // Identical fixture, and the meter fires at the SAME point for the same reason — the
  // clock jumps 400s of a 600s cap, so the step's time share clears the threshold with
  // 200s still on the wall. The one difference is that the deadline is not crossed.
  // Without this arm the guard could be an unconditional "never replan on variance"
  // and nothing above would notice.
  const { outcome, events, bought } = await ladderWallRun(t, { advanceAt: 6, advanceBy: 400_000 });

  const replans = events.filter((e) => e.type === 'replan');
  assert.equal(replans.length, 1, 'the meter still stops the step and the planner still re-allocates');
  assert.equal(replans[0].trigger, 'step-variance');
  assert.equal(draftCalls(bought).length, 2, 'the replan draft IS bought when the run has time to spend it');
  assert.equal(events.filter((e) => e.type === 'plan-accepted').length, 2, 'draft + replan');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'and no time record on a run that never ran out of time');
  assert.equal(outcome, 'green', 'the replanned step ran on the time it had left and the close greened — the doomed-replan guard costs a healthy run nothing');
});


// ---- W-2 EXTENDED to the LADDER's stop (hamr: "extend", 2026-08-10) ------------
// The variance terminal was the trigger measured on u-msmt91t3, but the cap-halt
// trigger — attempt exhaustion with money still on the table — is its exact sibling:
// it too minted `step-red:<id>` whatever the clock said. Same class (a governance
// stop wearing a capability label), same fix, same one emission site.

/** an IDLE-worker run: the worker writes nothing, so the ladder strikes twice and
 * ralph ends the step with the `cap-halt` (exhaustion) trigger — money untouched.
 * The clock jumps after the provider call named by `advanceAt`, which is iteration 2's
 * round: the deadline lands INSIDE the final attempt, so the meter's head check never
 * sees it and the LADDER is what names the stop. */
async function idleLadderRun(t, { advanceAt, advanceBy }) {
  const wd = makeConvergingPatient(t);
  const clk = fakeClock();
  const script = [
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    { text: 'thinking about it' },   // iteration 1: text only → strike 1
    { text: 'still thinking' },      // iteration 2: text only → strike 2, the step ends
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },  // OFFERED; bought only if a replan is funded
    { text: 'the replanned step is idle too' },
  ];
  /** @type {string[]} */
  const bought = [];
  const provider = {
    name: 'idle-ladder',
    async generate(/** @type {any[]} */ messages) {
      const s = script[bought.length] ?? { text: 'never bought' };
      bought.push(String(messages.at(-1)?.content ?? ''));
      if (bought.length === advanceAt) clk.advance(advanceBy);
      return { text: s.text ?? '', toolCalls: s.toolCalls ?? [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const run = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 4 });
  return { ...run, bought };
}


test('W-2 EXTENDED (cap-halt trigger): a step the LADDER ends past the wall is a wall-halt, never a step-red — the sibling of the variance terminal, same class and same emission', async (t) => {
  // the deadline lands during iteration 2, so the ladder — not the meter — names the
  // stop, and the wallet is untouched (this is the money-left arm, the one that minted
  // `step-red` whatever the clock said)
  const { outcome, events, bought } = await idleLadderRun(t, { advanceAt: 4, advanceBy: 700_000 });

  assert.equal(events.filter((e) => e.type === 'variance').length, 0,
    'the METER never fired — otherwise this exercises the variance path and proves nothing about its sibling');
  assert.equal(events.filter((e) => e.type === 'escalation')[0].category, 'cap-halt',
    'ralph named the stop exhaustion (cap-halt), which is the trigger under test');
  assert.equal(outcome, 'wall-halt', 'money was left on the table — what ended this run was the clock');

  assert.equal(events.filter((e) => e.type === 'replan').length, 0, 'no doomed replan is funded past the wall, whichever trigger asked for it');
  assert.equal(draftCalls(bought).length, 1, `the drafter was called ONCE and never again — bought ${bought.length} call(s)`);

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.phase, 'step:shrink-errors');
  assert.equal(wh.cutMidCall, false, 'read with nothing in flight — the money figure stays EXACT');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt', 'the outcome and the escalation name the same category (F11)');
  assert.match(esc.detail, /The ladder ended the step first/, 'the instrument that named the stop first is kept, not discarded by the re-route');
  assert.match(esc.options.join(' | '), /maxWallMs/);
});


test('W-2 EXTENDED CONTROL (cap-halt trigger): the SAME idle ladder with time on the clock still replans and still ends step-red — the extension costs a healthy run nothing', async (t) => {
  const { outcome, events, bought } = await idleLadderRun(t, { advanceAt: 4, advanceBy: 400_000 });

  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'exhaustion with funds and time left still buys the one replan');
  assert.equal(draftCalls(bought).length, 2, 'and the redraft IS bought');
  assert.match(outcome, /^step-red:/, 'the second exhaustion is a capability stop, and with time on the clock it keeps that name');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no time record on a run that never ran out of time');
});


test('W-2 EXTENDED, the PRECEDENCE: both allowances gone at once reports the MONEY cut — the clock is read inside the money-left arm only', async (t) => {
  // The deliberate ordering, pinned because it is a decision and not an accident: the
  // clock re-read lives INSIDE the `remainingUsd() > MONEY_MIN` arm. A drained wallet
  // keeps its own `cap-halt` terminal even past the deadline, because money is the
  // allowance actually blocking that run — a wall-halt readout here would hand the
  // human "raise maxWallMs and rerun" straight into an immediate money cut. Both stops
  // are governance stops and both are resumable; only the LEVERS differ, and the levers
  // are the whole point of a decision-ready halt.
  const wd = makePatient(t);
  const clk = fakeClock();
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
    { text: 'attempt' },
  ]);
  const { events, emit } = collector();
  const job = JOB(wd, { maxWallMs: 600_000 });
  const jv = validateJob(job);
  const startedAt = clk.now();
  let calls = 0;
  // The money-halt fixture, verbatim (ample for scout + drafter construction, drained
  // from the step worker onward) plus the wall: the deadline passes on the read that
  // follows the money gate's own trip, so the run reaches the cap-halt terminal with
  // BOTH allowances gone. Keyed to the wallet's read counter rather than a provider
  // call because the money gate is what this arm is about.
  const remainingUsd = () => { calls += 1; if (calls === 6) clk.advance(700_000); return calls <= 2 ? 1.5 : 0.0001; };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd, now: clk.now });

  assert.ok(clk.now() - startedAt >= job.maxWallMs, 'the fixture really did cross the wall, or this pins nothing');
  assert.equal(outcome, 'cap-halt', 'the drained wallet keeps its own terminal — money is not re-labelled as time');
  const money = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(money, 'and the human gets the MONEY readout');
  assert.match(money.options.join(' | '), /budgetUsd/, 'with the money levers, not the wall\'s');
  assert.equal(events.filter((e) => e.type === 'replan').length, 0, 'no replan against a drained wallet, past the wall or not');
});


test('W-2 NOT extended to the STALL trigger: a stall past the wall keeps its OWN name — re-routing it to wall-halt would drop the F44 spend FLOOR run.js keys on that outcome', async (t) => {
  // The third replan trigger is deliberately NOT in the class. It never minted
  // `step-red` in the first place (it falls to the tail that returns the category
  // verbatim), and `step-stalled` is load-bearing one level up: src/run.js keys
  // `spendComplete: false` on it, because every abandoned-and-reissued call may already
  // have been billed. Calling it a wall-halt would report an exact-looking total for a
  // run whose spend is only a floor — F6 in a self-heal coat.
  const wd = makePatient(t);
  const clk = fakeClock();
  const script = [
    { text: 'scout' },
    { text: PLAN(wd) },
    { text: 'unreachable — the step call stalls' },
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] }]) },
  ];
  /** @type {string[]} */
  const bought = [];
  const provider = {
    name: 'stall-past-wall',
    async generate(/** @type {any[]} */ messages) {
      const s = script[bought.length] ?? { text: 'never bought' };
      bought.push(String(messages.at(-1)?.content ?? ''));
      // the wall passes on the call that then stalls: the fuse gives up past the deadline
      if (bought.length === 3) { clk.advance(700_000); throw Object.assign(new Error('the model stopped producing rounds'), { category: 'step-stalled' }); }
      return { text: s.text ?? '', toolCalls: s.toolCalls ?? [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });

  assert.equal(outcome, 'step-stalled', 'it rides out under its own name — never step-red, and never re-labelled wall-halt');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1).category, 'step-stalled',
    'the outcome and the escalation still agree (F11)');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0,
    'and no wall-halt record is minted for it — the extension stops exactly where the class does');
  // the doomed replan is still not funded, which is the half of the ruling that DOES apply
  assert.equal(events.filter((e) => e.type === 'replan').length, 0, 'past the wall no new step starts, whichever trigger asked');
  assert.equal(draftCalls(bought).length, 1, 'so the redraft was never bought');
});



// ─── the shape-lottery gate rules, WIRED (2026-08-04): preflight verdicts →
// Rule A-v2 at every draft gate; the accepted plan's checks → Rule B at the
// replan gate. The $0 sweep: seed-red-check-on-early-step has 0 honest greens
// ever; the one-wide-closing-step shape greens 7/7. Rules are mechanical
// (recorded verdicts + predecessor exits), never an LLM assessing "small". ───

test('Rule A-v2 WIRED: a draft putting the seed-red check on an EARLY write step reds check-placement, the law rides the prompt, the redraft greens', async (t) => {
  const wd = makePatient(t);
  const badPlan = PLAN(wd, [
    {
      id: 'prep-helper', action: 'Write tests/helper.mjs with shared fixtures.',
      tools: ['write'], rounds: 4, target: 'tests/helper.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    },
    {
      id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    },
  ]);
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty.' },   // scout
    { text: badPlan },                                     // draft 1 — the death shape
    { text: PLAN(wd) },                                    // redraft — the RLM shape
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const { outcome, events } = await go(wd, provider);
  const v1 = events.find((e) => e.type === 'plan-validate' && e.phase === 'draft-1');
  assert.equal(v1?.ok, false, 'the death shape is refused at the gate');
  assert.ok(v1.reds.some((r) => r.code === 'check-placement'), `expected check-placement, got ${JSON.stringify(v1.reds)}`);
  assert.equal(events.find((e) => e.type === 'plan-validate' && e.phase === 'draft-2')?.ok, true);
  assert.equal(outcome, 'green', 'the redraft self-heals into the winning shape and the run greens');
  // the law is STATED, not just enforced (mailbox precedent: gate + prompt) —
  // and it names the seed-red check, which only the preflight wiring can know
  const draftPrompt = provider.calls.find((c) => c.includes('DRAFT-PLAN'));
  assert.ok(draftPrompt, 'a draft prompt exists');
  assert.match(draftPrompt, /FINAL write step/i);
  assert.match(draftPrompt, /"clean-run"/);
});


test('Rule B WIRED: a replan that sheds the inherited check is refused check-shed — a form-only redraft cannot fake a green (u-msdsmkid mechanism b)', async (t) => {
  const wd = makeMismatchPatient(t, 'tests/test_x.mjs');
  const shedPlan = LADDER_PLAN(wd, { id: 'second-go', exit: [{ type: 'tree-changed', scope: 'tests/**' }] });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO\n', 'TODO TODO\n', 'TODO TODO\n']),
    { text: shedPlan },   // replan draft 1 — sheds check-passes(clean-run)
    { text: shedPlan },   // redraft — sheds again (sticks)
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });
  const r1 = events.find((e) => e.type === 'plan-validate' && e.phase === 'replan-1');
  assert.equal(r1?.ok, false, 'the shed redraft is refused at the gate');
  assert.ok(r1.reds.some((r) => r.code === 'check-shed'), `expected check-shed, got ${JSON.stringify(r1.reds)}`);
  assert.equal(outcome, 'plan-red', 'two shed drafts exhaust the redraft — the run stops honestly instead of greening on form');
  const replanPrompt = provider.calls.find((c) => c.includes('What happened when the previous plan ran'));
  assert.ok(replanPrompt, 'the replan drafted');
  assert.match(replanPrompt, /previous plan carried/i, 'Rule B is stated to the replanner, not just enforced');
});


// ══ PRD v1.46 §2 + §4 — the money halt gets the W-2 treatment, and the
// close-fix loop's fixed count retires for the same progress rule ═════════════
//
// §2: a money cut keeps the verdict it already minted and pauses DECISION-READY
// with a trend the human can act on. The accuracy law is PER STAGE (src/trend.js)
// — never across axes, never model prose, and "can't tell" when there is no
// number (F6). The library reports; it never adjusts a budget (hard line).
//
// §4: `capRuns` retires as the fix loop's GOVERNOR. The replacement is the same
// 2-strike no-progress rule the step ladder runs, read off the close's own graded
// numbers. Money and the wall keep every bit of their authority. Replay-validated
// at $0 over all 8 archived fix loops: 0 greens harmed, 1 waste case caught.

/** one fix iteration: the write, then the attempt summary @param {string} wd */
const fixWrite = (wd, content, tag) => [
  { toolCalls: [tcall(tag, 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content })] },
  { text: `fix ${tag}` },
];


test('§4 the close-fix loop is governed by PROGRESS, not the count: a converging close iterates PAST capRuns and greens', async (t) => {
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok A\n', 't1'),          // the STEP: clean-run greens, close reds at 2 missing
    ...fixWrite(wd, 'ok A B\n', 't2'),        // fix 1 → 1 missing   (improved)
    ...fixWrite(wd, 'ok A B extra\n', 't3'),  // fix 2 → 1 missing   (flat, strike 1)
    ...fixWrite(wd, 'ok A B C\n', 't4'),      // fix 3 → GREEN
  ]);
  // capRuns 2 is the RETIRED number: under the old bound fix 3 was never bought.
  const { outcome, events } = await go(wd, provider, { capRuns: 2 });
  assert.equal(outcome, 'green', 'the converging fix loop was allowed to finish — the count no longer governs');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 3,
    'three fix iterations ran under a retired cap of two');
});


test('§4 two consecutive fix grades with NO stage improving ends the loop — under the SAME cap-halt taxonomy the count used', async (t) => {
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B']);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok A\n', 't1'),        // step greens; close reds at 1 missing
    ...fixWrite(wd, 'ok A x\n', 't2'),      // fix 1 → still 1 missing (strike 1)
    ...fixWrite(wd, 'ok A y\n', 't3'),      // fix 2 → still 1 missing (strike 2 → out)
    ...fixWrite(wd, 'ok A B\n', 't4'),      // never bought
  ]);
  // capRuns 9 so the retired count cannot possibly be what stopped it
  const { outcome, events } = await go(wd, provider, { capRuns: 9 });
  assert.equal(outcome, 'escalated', 'the designed "close still red" terminal, unchanged');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 2,
    'exactly two fix iterations: the run stopped when it ran out of IDEAS, not out of money');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt', 'ONE exhaustion terminal, two triggers — only the trigger changed, never the taxonomy');
  assert.match(esc.decision, /2\/2 strike|no progress|stopped making progress/i, 'the decision names the progress rule that fired');
  assert.doesNotMatch(esc.options.join(' | '), /replan/i, 'there is no planner at the close — never offer a lever that does not exist here');
  const reads = events.filter((e) => e.type === 'ladder' && e.governor === 'close-trend');
  assert.equal(reads.length, 2, 'both fix readings are on the spine under their own governor name');
  assert.deepEqual(reads.map((r) => r.improved), [false, false]);
});


test('§4 BLIND CONTROL: a close the trend cannot read keeps the retired count as its bound — never unbounded, never a strike out of ignorance', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd); // its red output carries no count at all
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok but no module use\n', 't1'),
    { text: 'fix attempt — writes nothing' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 3 });
  assert.equal(outcome, 'escalated');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 3,
    'exactly capRuns iterations — the blind fallback is the count it replaced, byte for byte');
  const reads = events.filter((e) => e.type === 'ladder' && e.governor === 'close-trend');
  assert.ok(reads.every((r) => r.comparable === false), 'no reading was comparable, so no reading struck');
});


test('§2 a fix loop cut by a DRAINED wallet emits a decision-ready money-halt: the kept verdict, a per-stage trend, and hamr\'s three levers', async (t) => {
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  // The drain is targeted at the RUN'S OWN STATE — the fix loop has opened AND has
  // graded one attempt — never at a raw `close-verdict` count, which the STEP loop's
  // own micro-loop also emits and which therefore fires long before the fix loop
  // exists (the call-count trigger that silently retargets).
  let fixOpen = false;
  let fixGrades = 0;
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok A\n', 't1'),      // step greens; close reds at 2 missing
    ...fixWrite(wd, 'ok A B\n', 't2'),    // fix 1 → 1 missing (converging), and the wallet drains
    { text: 'never bought' },
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'fix-loop') fixOpen = true;
    if (fixOpen && type === 'close-verdict') fixGrades += 1;
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit: emit2, capRuns: 9,
    remainingUsd: () => (fixGrades >= 1 ? 0.0001 : 1.5),
  });
  assert.equal(outcome, 'cap-halt', 'a money cut is never a capability read — it is the resume-to-cap checkpoint');

  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh, 'the run-level MONEY record exists, exactly as W-2 gave TIME one');
  assert.equal(mh.phase, 'fix');
  assert.equal(mh.verdict, 'needs_revision', 'the verdict already minted is KEPT, never discarded and never re-derived');
  assert.equal(mh.stage, 'verdict', 'and which stage rendered it');
  assert.equal(mh.trend, 'converging', 'the close went 2 → 1 on its own stage: a top-up likely finishes it');
  assert.match(mh.reading, /2 → 1/, 'the reading shows the series it judged, so the human can check the instrument');
  assert.equal(mh.budgetUsd, 1.5);
  assert.match(mh.options.join(' | '), /top up|budgetUsd/i, 'lever one: more money');
  assert.match(mh.options.join(' | '), /revise the goal/i, 'lever two: a different goal — the trend says which');
  assert.match(mh.options.join(' | '), /abandon/i, 'lever three');
  assert.ok(mh.options.every((o) => !/self|automatic/i.test(o)), 'the library reports; it never adjusts a budget');
});


test('§2 CAN\'T TELL: a money cut on a close with no extractable number says so rather than inventing a direction (F6)', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd); // no count in its output, ever
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok but no module use\n', 't1'),
    { text: 'fix attempt' },
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  let fixOpen = false;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'fix-loop') fixOpen = true;
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd: () => (fixOpen ? 0.0001 : 1.5) });
  assert.equal(outcome, 'cap-halt');
  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh, 'the money record still lands — an unknown trend is a reading, not a reason to stay silent');
  assert.equal(mh.trend, 'unknown', 'never "flat": recommending a goal rewrite on no evidence is F6 in a verdict\'s coat');
  assert.match(mh.reading, /unknown|nothing the instrument can compare/i);
});


test('§2 a STEP-loop money cut gets the same record — the readout is symmetric to wall-halt at every site that emits one', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
    { text: 'attempt' },
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  let calls = 0;
  const remainingUsd = () => (++calls <= 2 ? 1.5 : 0.0001);
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd });
  assert.equal(outcome, 'cap-halt');
  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh, 'the step loop\'s money cut is decision-ready too');
  // the STEP site must be the emitter — without this pin, an extra remainingUsd()
  // call added anywhere upstream would silently retarget the cut to the scout/plan
  // site and this test would keep passing while testing nothing (review F2; the
  // call-counting trigger stays, but the run's own state names the site)
  assert.equal(mh.phase, 'step:write-test');
  assert.match(mh.options.join(' | '), /top up|budgetUsd/i);
  assert.equal(typeof mh.trend, 'string');
});


test('§2 the money-halt says whether the SPEND behind it is exact — an unknown-floor run\'s "remaining" is a floor too (F6)', async (t) => {
  // The record states `remainingUsd` to four decimals. That figure is `budget − spent`,
  // so a run whose spend is a FLOOR (a self-healed stall, a mid-call cut, a resumed leg
  // inheriting an unpriced predecessor) has a remaining that is a CEILING — and stating
  // it bare reads as exact. `emitWallHalt` has always carried its honest bound; this is
  // the same duty on the money side. The four causes live in `runJob`'s ledger, so the
  // record reads THAT state rather than deriving a second, weaker answer of its own.
  const run = async (/** @type {(() => boolean)|undefined} */ spendComplete) => {
    const wd = makePatient(t);
    const provider = scriptedProvider([
      { text: 'scout' },
      { text: PLAN(wd) },
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
      { text: 'attempt' },
    ]);
    const { events, emit } = collector();
    const jv = validateJob(JOB(wd));
    let calls = 0;
    const outcome = await runPlan(jv.job, {
      workdir: wd, provider, emit, capRuns: 3,
      remainingUsd: () => (++calls <= 2 ? 1.5 : 0.0001),
      ...(spendComplete ? { spendComplete } : {}),
    });
    assert.equal(outcome, 'cap-halt');
    return events.filter((e) => e.type === 'money-halt').at(-1);
  };
  assert.equal((await run(() => false)).spendComplete, false,
    'a floor spend makes the remaining a bound, and the record says so instead of quoting it as the number');
  assert.equal((await run(() => true)).spendComplete, true, 'and an exact run keeps its exact figure — the honest direction points both ways');
  assert.equal((await run(undefined)).spendComplete, true, 'the field is always present, so no consumer branches on presence');
});


test('§2 CONTROL: a run that never runs out of money emits NO money-halt record — the readout costs the healthy run nothing', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok — asserts x\n', 't1'),
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  assert.equal(events.filter((e) => e.type === 'money-halt').length, 0);
});


// ── F86: the REPLANNER is handed the close's own last output ───────────────────
//
// u-mshcpdg4 is the whole reason this section exists. The run reached ONE
// remaining strict error and died anyway. The close said exactly where it was:
//
//   BAREAGENT red: tsc --strict reports 1 error(s) in src/recurse.js, src/loop.js
//   BAREAGENT | src/recurse.js(978,115): error TS2322: …
//
// The worker saw that every attempt. The REPLANNER — the thing that chooses
// which files the next plan targets — was told only "close trend so far: still
// progressing — typecheck 30 → 15 → 15 → 1". Converging, and silent about WHERE.
// It re-targeted src/loop.js, which was already at zero errors; that step wrote
// nothing, struck out twice, and the run ended with $1.10 and 82 seconds unspent.
//
// The fix hands the gap over as TEXT and nothing else. NOT a parsed file list:
// line 1 of that very gap names every file in SCOPE, only line 2 names the
// culprit, and no regex can tell a summary line from a detail line — the shapes
// differ per close anyway (tsc file:line, pytest test ids, a count close naming
// no file at all). A model reading the artifact can. That is the whole design.

/**
 * A counting patient whose close renders the SHIPPED two-line shape: a summary
 * line naming every file in scope, plus an optional detail line naming the one
 * location actually failing. `makeCountingPatient`'s close emits one line and one
 * file, so it cannot reproduce the summary-vs-detail split that killed u-mshcpdg4.
 * F71: `process.exitCode`, never `process.exit()`.
 * @param {any} t @param {{seed?: number, summary: string, detail?: string|null}} shape
 */
function makeGapShapePatient(t, { seed = 30, summary, detail = null }) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-gapshape-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'recurse.js'), todos(seed));
  // the SECOND in-scope file, clean from the start — the one u-mshcpdg4's
  // replanner re-targeted. Its presence is what makes the summary line honest.
  writeFileSync(join(wd, 'src', 'loop.js'), 'export const y = 2;\n');
  writeFileSync(join(wd, 'count.mjs'), `import { readFileSync } from 'node:fs';
const n = (readFileSync(new URL('./src/recurse.js', import.meta.url), 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('clean'); } else {
  console.log(${JSON.stringify(summary)}.replace('{n}', String(n)));
  ${detail ? `console.log(${JSON.stringify(detail)});` : ''}
  process.exitCode = 1;
}
`);
  return wd;
}


/** the real u-mshcpdg4 detail line, verbatim */
const MSHCPDG4_DETAIL = "| src/recurse.js(978,115): error TS2322: Type 'string | null | undefined' is not assignable to type 'string | null'.";


// PRD item 27/M2: auto-signed against the real count.mjs at `wd`.
const GAP_JOB = (wd, over = {}) => signCloseScripts({
  schema: 'job-v1',
  job: 'gap-shape-patient',
  description: 'the u-mshcpdg4 close shape: a summary line over a detail line',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Make src/recurse.js and src/loop.js pass the typecheck stage.',
  verdictType: 'green',
  // both lines survive the gap bound (F28) — a keep pattern that dropped the
  // detail line would hide the very fact this section is about
  close: [{ name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^(red|\\|)' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
}, wd).spec;


const GAP_PLAN = (steps) => JSON.stringify({
  schema: 'plan-v1',
  steps: steps ?? [{
    id: 'shrink-errors', action: 'Remove TODO markers from src/recurse.js.',
    tools: ['write'], rounds: 6, target: 'src/recurse.js',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }],
  }],
});


/** one worker attempt against the gap-shape patient */
const gapAttempt = (wd, id, body) => [
  { text: `attempt ${id}`, toolCalls: [tcall(id, 'shell_write', { path: join(wd, 'src', 'recurse.js'), content: body })] },
  { text: `attempt ${id} done` },
];


test('F86 unit: closeGapBlock carries the gap VERBATIM, labelled as the step\'s own exit results', () => {
  const gap = 'check "typecheck" red: close stage "typecheck" failed:\nBAREAGENT red: tsc --strict reports 1 error(s) in src/recurse.js, src/loop.js\nBAREAGENT ' + MSHCPDG4_DETAIL + '\nBAREAGENT judged=1\n';
  const block = closeGapBlock(gap);
  assert.ok(block.includes(gap.trim()), 'every byte of the gap reaches the planner — not a summary, not a parse');
  // this assertion used to read `/verification/` and to call the block the close's own
  // output. That was the accuracy defect, not the fix: the block is the join of every
  // failing EXIT detail, so on a step that wrote nothing it leads with the evaluator's
  // own `tree-changed` prose. What must still hold is that it is labelled as the
  // instruments' output rather than as the run's narration of the stop.
  assert.match(block, /exits reported/i, 'labelled as the step\'s exit results, not as the run\'s narration');
  // the same carry for a close that names no file at all — a count close is not a
  // second format to handle, it is the same artifact handed over unchanged
  assert.ok(closeGapBlock('red: unit=0 tests executed, below the seed\'s 12').includes('unit=0 tests executed'),
    'a count close\'s own words survive too — nothing here is tsc-shaped');
});


test('F86 unit CONTROL: no gap → the empty string, so the brief is byte-identical to the pre-F86 one', () => {
  assert.equal(closeGapBlock(undefined), '');
  assert.equal(closeGapBlock(null), '');
  assert.equal(closeGapBlock(''), '');
  assert.equal(closeGapBlock('   \n  '), '', 'whitespace is not an output — an empty block invents a section that says nothing');
});


// Strictly a NEGATIVE control: it passes before this change (there was no block)
// and after it (the block is the gap, and the gap named nothing). That is the
// point — it is the assertion that would catch a parsed file list being
// manufactured, which is the trap this whole design avoids.
test('F86 unit CONTROL: a gap that names NO file invents nothing — no path, no file list, no guess', () => {
  const block = closeGapBlock('red: unit=0 tests executed, below the seed\'s 12');
  assert.doesNotMatch(block, /[\w.-]+\/[\w.-]+/, 'nothing path-shaped is manufactured out of a gap that named no file');
});


test('F86 unit: an ALREADY-BOUNDED gap passes through VERBATIM — the second envelope must not re-trim what the first deliberately rescued', () => {
  // The real shape, not a synthetic one: `runClose` bounds the stage output with the
  // stage's own `gapKeep` (both shipped closes cap at 120 red lines), and `evalExits`
  // wraps THAT in `check "<name>" red: …`. So what reaches this helper has already
  // survived one envelope built to preserve the failing NAMES — the mechanical gap
  // F46's conversion mechanism feeds the worker. A second 400/1500 envelope over it
  // deletes exactly those names again (F28 reintroduced), and src/exits.js states the
  // rule in the same words for the same artifact one seam earlier.
  const errs = Array.from({ length: 120 }, (_, i) => `FAILED tests/test_x.py::case_${String(i).padStart(3, '0')} - AssertionError`);
  const raw = ['red: 120 test(s) now fail', ...errs, 'judged=1'].join('\n');
  const inner = boundGap(raw, '^(FAILED|red)');
  const rescued = errs.filter((e) => inner.includes(e));
  assert.ok(rescued.length > 50, `the first envelope really did rescue a block of names (${rescued.length}) — otherwise this test guards nothing`);

  // and the WORST case runClose can hand over still fits under the backstop, or the
  // shipped path would start being re-bounded again without anything saying so (the
  // blind-instrument class: a headroom claim nothing measures is a claim that rots the
  // day boundGap's own caps move)
  const worst = boundGap(Array.from({ length: 5000 }, (_, i) => `FAILED case_${i} ${'x'.repeat(180)}`).join('\n'), '^FAILED');
  const treeChanged = '0 files changed under src/** — the tree is byte-identical to the step start (an identical re-write is not a change)';
  assert.ok(`${treeChanged}\ncheck "suite-green" red: ${worst}`.length < CHECK_GAP_MAX,
    `the largest gap the close path can produce, joined with its paired exit, still passes VERBATIM: ${worst.length} against a ${CHECK_GAP_MAX} backstop`);

  const block = closeGapBlock(`check "suite-green" red: close stage "suite-green" failed:\n${inner}`);
  const dropped = rescued.filter((e) => !block.includes(e));
  assert.deepEqual(dropped, [],
    'every name the close\'s own bound chose to keep reaches the replanner — a second envelope over a bounded artifact is a fidelity loss with an announcement on it, not a bound');
});


test('F86 unit: an over-long gap is CAPPED and every trim is ANNOUNCED (F28: silent truncation is the disease)', () => {
  // 120 red lines of 200 chars: past boundGap's envelope AND past the keep
  // block's 50-line cap, so BOTH announcements must appear.
  const gap = Array.from({ length: 120 }, (_, i) => `red: error ${i} ${'x'.repeat(190)}`).join('\n');
  const block = closeGapBlock(gap);
  assert.ok(block.length < gap.length, `capped: ${block.length} < ${gap.length}`);
  assert.match(block, /chars truncated/, 'the elision announces itself');
  assert.match(block, new RegExp(GAP_KEEP_TRIM_MARKER), 'and so does the keep-block cap — a cure that truncates silently is the disease');
  assert.match(block, /red: error 0 /, 'the RED lines survive the truncation (gapKeep), which is the point of reusing the bound');
});


test('F86 unit: the backstop sits on exits.js\'s OWN ceiling — under it verbatim, over it bounded, and the number is not respelled here', () => {
  // Both arms are built FROM the shared constant rather than from a literal 12000: a
  // hardcoded copy is a second answer to "how big may a check gap be", and the two
  // seams would drift on exactly the property that matters. The pair also pins that
  // the backstop is neither dead (over the line must still bound) nor an envelope
  // (under it must not touch a byte).
  const line = (/** @type {number} */ i) => `FAILED tests/test_x.py::case_${String(i).padStart(4, '0')} - AssertionError`;
  const build = (/** @type {number} */ target) => {
    let s = '';
    for (let i = 0; s.length <= target; i += 1) s += `${line(i)}\n`;
    return s;
  };
  const under = build(CHECK_GAP_MAX - 200).slice(0, CHECK_GAP_MAX - 100);
  assert.ok(under.length < CHECK_GAP_MAX && under.length > 2000,
    'the under arm is well past boundGap\'s own 2000-char envelope, or it would pass through for the wrong reason');
  assert.ok(closeGapBlock(under).includes(under), 'under the ceiling: every byte, untouched');

  const over = build(CHECK_GAP_MAX * 2);
  const block = closeGapBlock(over);
  assert.ok(block.length < over.length, `over it the backstop still binds: ${block.length} < ${over.length}`);
  assert.match(block, /chars truncated/, 'and says so — a backstop that trimmed silently would be F28 wearing a smaller number');
});


test('F86 unit: the LABEL names the step\'s EXITS, because that is what the block carries — the close\'s output is one of them, not all of it', () => {
  // `res.gap` is `lastGap`: the join of EVERY failing exit's detail, in exit order.
  // With MAX_EXITS_PER_STEP=2 and the mandatory `tree-changed` pairing on a write
  // step, a step that wrote nothing produces exactly this — the evaluator's own
  // prose first, the close's output second. Captured verbatim from a real replan
  // prompt. The payload is right (a replanner very much wants "the step wrote
  // nothing"); it was the LABEL that claimed a single source for it.
  const treeChanged = '0 files changed under src/** — the tree is byte-identical to the step start (an identical re-write is not a change)';
  const checkRed = 'check "typecheck" red: close stage "typecheck" failed:\nBAREAGENT red: tsc --strict reports 1 error(s) in src/recurse.js';
  const block = closeGapBlock([treeChanged, checkRed].join('\n'));

  assert.match(block, /exits?\b/i, 'the label names what is actually under it: this step\'s exit results');
  assert.doesNotMatch(block.split('\n')[1] ?? '', /its own output/,
    'and does not attribute the whole block to the verification — the first line under that claim was ours, not the close\'s');
  assert.match(block, /verbatim/, 'still verbatim: the artifact is handed over as TEXT, and the label must keep saying so (F86)');
  assert.ok(block.includes(treeChanged) && block.includes(checkRed),
    'both details survive — this fixes an accuracy claim, never the payload the replanner needs');
});


test('F86 unit: a secret-shaped string is masked BEFORE the prompt — one inventory, not a second spelling', () => {
  const secret = `sk-${'a'.repeat(30)}`;
  const block = closeGapBlock(`red: auth failed with ${secret} in src/mod.mjs`);
  assert.ok(!block.includes(secret), 'the literal never reaches the prompt');
  assert.deepEqual(scanSecrets(block), [], 'and the ONE inventory agrees it is clean');
});


test('F86: the replan brief carries the close\'s own last output — the u-mshcpdg4 regression', async (t) => {
  const wd = makeGapShapePatient(t, {
    seed: 30,
    summary: 'red: tsc --strict reports {n} error(s) in src/recurse.js, src/loop.js',
    detail: MSHCPDG4_DETAIL,
  });
  const job = GAP_JOB(wd);
  const { events, provider } = await countRun(wd, [
    { text: 'scout' }, { text: GAP_PLAN() },
    ...gapAttempt(wd, '1', todos(15)),
    ...gapAttempt(wd, '2', todos(1)),
    { text: GAP_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/recurse.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...gapAttempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { job });

  assert.ok(events.find((e) => e.type === 'replan'), `the meter must route to a replan — events: ${events.map((e) => e.type).join(' ')}`);
  const brief = provider.calls.find((c) => c.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  // THE regression: the ONE remaining error's location reaches the planner.
  assert.match(brief, /src\/recurse\.js\(978,115\)/,
    'the replanner is told WHERE the remaining work is — u-mshcpdg4 was told only that it was converging, and re-targeted the clean file');
  assert.match(brief, /reports 1 error\(s\) in src\/recurse\.js, src\/loop\.js/,
    'and the summary line rides along verbatim — the planner reads the artifact, the runner does not pre-digest it');
  // …and NOTHING sits beside it telling the planner which file to pick. On this
  // exact gap the deleted never-wrote line resolved to `src/loop.js` — the file
  // that was already CLEAN — because loop.js appears only in the SUMMARY line and
  // the worker had been writing recurse.js. Two readers of one question, the
  // parsed one wrong and phrased as a directive, next to the artifact that says
  // the opposite. Deleted (hamr, 2026-08-05); this assertion is what keeps any
  // future digest from being reintroduced beside the verbatim block.
  assert.doesNotMatch(brief, /never wrote/,
    'the runner hands over the close\'s words and no parsed file claim of its own — a regex cannot tell a summary line from a detail line');
});


test('F86 CONTROL: a gap that names no file leaves the brief naming no file — before and after', async (t) => {
  const wd = makeGapShapePatient(t, { seed: 30, summary: 'red: {n} fault(s) remain, unit=0' });
  const job = GAP_JOB(wd, { close: [{ name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^red' }] });
  const { provider } = await countRun(wd, [
    { text: 'scout' }, { text: GAP_PLAN() },
    ...gapAttempt(wd, '1', todos(15)),
    ...gapAttempt(wd, '2', todos(1)),
    { text: GAP_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/recurse.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...gapAttempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { job });

  const brief = provider.calls.find((c) => c.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  // Strictly NEGATIVE, so it holds before this change and after it: the brief may
  // name the plan's own declared target (the step action and target are the
  // planner's own words), and nothing else file-shaped may appear.
  const carried = brief.slice(brief.indexOf('did not reach its exits')).replace(/src\/recurse\.js/g, '');
  assert.doesNotMatch(carried, /The last exit output names file\(s\)/,
    'the mechanical never-wrote line stays silent when the gap named nothing');
  assert.doesNotMatch(carried, /[\w.-]+\.[a-z]{2,4}\b(?![\w.])/,
    'nothing file-shaped is invented out of a gap that named no file');
});


test('F86 CONTROL: a stall never judged its exits, so the brief carries NO close output — nothing is invented', async (t) => {
  const wd = makePatient(t);
  const base = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'unreachable — the step call stalls' },
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] }]) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const prompts = [];
  let n = 0;
  const provider = {
    calls: base.calls,
    async generate(messages, tools) {
      prompts.push(String(messages.at(-1)?.content ?? ''));
      if (n++ === 2) throw new StallError('no round completed for 300s, 3 times in this step — not reissuing again', MAX_STALLS);
      return base.generate(messages, tools);
    },
  };
  await go(wd, provider);
  const brief = prompts.find((p) => p.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  assert.doesNotMatch(brief, /What the verification/i,
    'a stall produced no close output — a labelled empty section would be a section that says nothing');
});


// ── THE WORK BRANCH (PRD Addendum v1.57 §3) ──────────────────────────────────
//
// hamr's ruling, verbatim: *"The agent creates a NEW BRANCH before it touches any
// code — a HARD RULE, no exceptions. Not a default, not a preference: no job edits
// the branch it was handed, and none edits `main`."*
//
// Every patient below is a real git repository handed to the run on `main`, and
// every assertion is git's own answer, never a spine field standing in for one.

/** git in a patient, carrying the identity `initPatientRepo` uses. A COMMIT needs
 * one, and whatever global config the test machine happens to hold is not a
 * fixture — the same reason the helper pins it there.
 * @param {string} wd @param {string[]} args */
const patientGit = (wd, args) => execFileSync('git', args, {
  cwd: wd,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'bareloop-test', GIT_AUTHOR_EMAIL: 'test@bareloop',
    GIT_COMMITTER_NAME: 'bareloop-test', GIT_COMMITTER_EMAIL: 'test@bareloop',
  },
});


test('the WORK BRANCH exists before the run\'s first PAID call, and every write lands on it', async (t) => {
  const wd = makePatient(t);
  const handedAt = execFileSync('git', ['rev-parse', 'main'], { cwd: wd, encoding: 'utf8' }).trim();
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty.' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');

  const wb = events.find((e) => e.type === 'work-branch');
  assert.ok(wb, 'the run\'s own books say where its work went');
  assert.equal(wb.branch, 'bareloop-plan-patient', 'derived from the SIGNED spec\'s job slug, never model-authored');
  assert.equal(wb.created, true);
  assert.equal(wb.from, 'main', 'the record names the branch the run was HANDED');

  // BEFORE the first paid call: the scout is the run's first provider round, and
  // the branch record precedes it on the spine.
  const at = (/** @type {string} */ type) => events.findIndex((e) => e.type === type);
  assert.ok(at('work-branch') < at('scout-start'), 'the branch precedes the first paid call');
  assert.ok(at('work-branch') < at('worker-round'), 'no token is bought before the branch exists');
  assert.ok(at('work-branch') < at('step-start'), 'and it precedes the write-capable phase by a wide margin');

  // and git agrees: the tree is standing on the work branch, the handed one has not
  // moved, and the worker's file is not reachable from it
  assert.equal(currentBranch(wd), 'bareloop-plan-patient');
  assert.equal(execFileSync('git', ['rev-parse', 'main'], { cwd: wd, encoding: 'utf8' }).trim(), handedAt, 'main NEVER moved');
  assert.throws(() => execFileSync('git', ['cat-file', '-e', 'main:tests/test_x.mjs'], { cwd: wd, encoding: 'utf8', stdio: 'pipe' }),
    'the worker\'s write is not reachable from the branch the run was handed');
});


test('a patient that is not a git repository is a BRANCH-RED instrument stop, before any token', async (t) => {
  const wd = makePatient(t, { git: false });
  const provider = scriptedProvider([{ text: 'scout notes' }, { text: PLAN(wd) }]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'branch-red');
  assert.equal(provider.calls.length, 0, 'the stop costs ZERO tokens — it is an instrument stop, not a run');
  assert.equal(events.filter((e) => e.type === 'worker-round').length, 0);
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'branch-red');
  assert.equal(esc.decisionReady, true);
  assert.match(esc.detail, /git/i);
  assert.equal(events.find((e) => e.type === 'work-branch'), undefined, 'no branch record for a branch that was never made');
  // …and NOTHING ran: no fallback to "just work where we stand" exists anywhere
  assert.equal(events.find((e) => e.type === 'scout-start'), undefined);
});


test('a SECOND cold run of the same spec gets its OWN branch — another run\'s is never reused', async (t) => {
  const wd = makePatient(t);
  const script = () => scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const first = await go(wd, script());
  assert.equal(first.outcome, 'green');
  // the second run starts from a tree the first already greened, so it takes the
  // already-green exit — which is exactly why the branch has to be minted BEFORE
  // that exit is consulted for this test to say anything. Red it again first.
  rmSync(join(wd, 'tests', 'test_x.mjs'));
  const second = await go(wd, script());
  assert.equal(second.outcome, 'green');

  const branches = [first, second].map((r) => r.events.find((e) => e.type === 'work-branch').branch);
  assert.deepEqual(branches, ['bareloop-plan-patient', 'bareloop-plan-patient-2']);
  assert.equal(second.events.find((e) => e.type === 'work-branch').collided, 1);
  assert.deepEqual(localBranches(wd), ['bareloop-plan-patient', 'bareloop-plan-patient-2', 'main']);
});


test('a RESUME returns to the branch its own work is sitting on — no -2 beside it', async (t) => {
  const wd = makePatient(t);
  const script = () => scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const killed = await go(wd, script());
  const own = killed.events.find((e) => e.type === 'work-branch').branch;
  // the operator wandered off it between the kill and the resume
  execFileSync('git', ['checkout', '-q', 'main'], { cwd: wd, encoding: 'utf8' });
  rmSync(join(wd, 'tests', 'test_x.mjs'));

  const resumed = await go(wd, script(), { resumeBranch: own });
  const wb = resumed.events.find((e) => e.type === 'work-branch');
  assert.equal(wb.branch, own, 'back on its OWN branch');
  assert.equal(wb.created, false);
  assert.equal(wb.resumed, true);
  assert.equal(currentBranch(wd), own);
  assert.deepEqual(localBranches(wd), [own, 'main'], 'the collision walk did not fire on the run\'s own branch');
});


test('a RESUME grades the WORK branch, never the ref the operator happened to hand back', async (t) => {
  const wd = makePatient(t);
  // The killed leg's work, on its own branch and COMMITTED there — the two trees
  // have to differ in a way the close can actually SEE, or this test cannot fail.
  patientGit(wd, ['checkout', '-q', '-b', 'bareloop-plan-patient']);
  writeFileSync(join(wd, 'tests', 'test_x.mjs'), 'ok — the killed leg already wrote this\n');
  patientGit(wd, ['add', 'tests/test_x.mjs']);
  patientGit(wd, ['commit', '-q', '-m', 'the work a resume exists to keep']);
  // …and the operator wandered back to the handed branch, where the close is RED
  patientGit(wd, ['checkout', '-q', 'main']);
  assert.ok(!existsSync(join(wd, 'tests', 'test_x.mjs')),
    'the handed branch reds the close — the precondition that makes the two readings distinguishable');

  const provider = scriptedProvider([{ text: 'never reached' }]);
  const { outcome, events } = await go(wd, provider, { resumeBranch: 'bareloop-plan-patient' });

  // the run's OWN reading, off its own books: the $0 instruments measured the work
  // branch, because that is the tree this run is continuing
  assert.equal(events.find((e) => e.type === 'close-precheck')?.verdict, 'satisfied');
  assert.equal(outcome, 'already-green');
  assert.equal(provider.calls.length, 0, 'nothing was bought to discover work that was already done');
  // and it read it by STANDING there, not around a corner
  assert.equal(currentBranch(wd), 'bareloop-plan-patient');
  // an already-green read on a RESUME mints nothing and unwinds nothing: the
  // leave-no-branch-behind clause is about minting, never about a branch that
  // already holds work the operator paid for
  assert.deepEqual(localBranches(wd), ['bareloop-plan-patient', 'main']);
  assert.equal(readFileSync(join(wd, 'tests', 'test_x.mjs'), 'utf8').trim(), 'ok — the killed leg already wrote this');
  const wb = events.find((e) => e.type === 'work-branch');
  assert.equal(wb.resumed, true);
  assert.equal(wb.created, false);
});


test('a resume whose recorded branch is GONE stops rather than starting a new one beside the work', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout notes' }, { text: PLAN(wd) }]);
  const { outcome, events } = await go(wd, provider, { resumeBranch: 'bareloop-deleted-by-a-human' });
  assert.equal(outcome, 'branch-red');
  assert.equal(provider.calls.length, 0);
  const detail = events.find((e) => e.type === 'escalation').detail;
  assert.match(detail, /bareloop-deleted-by-a-human/);
  assert.match(detail, /no longer exists/, 'the arbiter\'s own refusal, not git\'s incidental one');
  assert.deepEqual(localBranches(wd), ['main'], 'nothing was minted in its place');
  // …and it stopped BEFORE the arbiter measured anything. A resume that cannot
  // reach its own branch has no tree to grade, so a precheck reading here could
  // only ever be a reading of the wrong subject.
  assert.equal(events.find((e) => e.type === 'close-precheck'), undefined,
    'nothing was graded before the branch this resume owns was in hand');
  assert.equal(events.find((e) => e.type === 'check-preflight'), undefined);
});


test('an ALREADY-GREEN tree leaves no branch behind — no work, no blast radius to bound', async (t) => {
  const wd = makePatient(t, { closeGreen: true });
  // one stage, and it is the green one — a close is satisfied only when the WHOLE
  // list is (the F17 test above makes the same move for the same reason)
  const { outcome, events } = await go(wd, scriptedProvider([{ text: 'never reached' }]),
    { job: JOB(wd, { close: [{ name: 'verdict', cmd: 'node close.mjs', expect: 0 }] }) });
  assert.equal(outcome, 'already-green');
  assert.equal(events.find((e) => e.type === 'work-branch'), undefined);
  assert.deepEqual(localBranches(wd), ['main']);
  assert.equal(currentBranch(wd), 'main');
});


test('the FIX loop is write-capable too, and it works on the same branch the steps did', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    // the step's exits are form-only, so it greens while the close is still red
    { text: JSON.stringify({ schema: 'plan-v1', steps: [{
      id: 'stub', action: 'Create the test file.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs',
      exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs' }],
    }] }) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nothing useful\n' })] },
    { text: 'stubbed' },
    // the fix loop, judged by the REAL close
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'fixed' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  assert.ok(events.some((e) => e.type === 'worker-round' && String(e.phase) === 'fix'), 'the fix loop actually ran');
  assert.equal(currentBranch(wd), 'bareloop-plan-patient');
  assert.deepEqual(localBranches(wd), ['bareloop-plan-patient', 'main']);
});


// ── THE READ SHIM at its seam (flag-gated, default OFF) ────────────────────
//
// The shim wraps the same `rd.execute` the native cap wraps, and these two tests
// drive it through the REAL runner: real shell tools, real Loop, real gate, the
// scripted provider as the one legitimate seam. What the worker was actually
// handed is observable — `scriptedProvider` records the last message of every
// call, and after a tool round that message IS the tool result.
const BIG_BODY = Array.from({ length: 60 }, (_, i) => `BLOCK-${String(i).padStart(4, '0')} ${'x'.repeat(982)}\n`).join('');


/** the plan the two arms share: one step that reads the big file twice, then writes */
const READ_TWICE = (wd) => JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'read-then-write', action: 'Read src/big.txt, then write tests/test_x.mjs.',
    tools: ['read', 'recall', 'get', 'write'], rounds: 6, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }],
  }],
});


const readTwiceProvider = (wd) => scriptedProvider([
  { text: 'src/big.txt is large; tests/ is empty.' },                            // scout
  { text: READ_TWICE(wd) },                                                       // plan draft
  { toolCalls: [tcall('t1', 'shell_read', { path: join(wd, 'src', 'big.txt') })] },
  { toolCalls: [tcall('t2', 'shell_read', { path: join(wd, 'src', 'big.txt') })] },
  { toolCalls: [tcall('t3', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
  { text: 'done' },
]);


test('read shim ON: the second read of an unchanged big file is the NEXT UNSEEN SLICE, at the real seam', async (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'big.txt'), BIG_BODY);
  const jv = validateJob(JOB(wd, { tools: ['read', 'recall', 'get', 'write', 'edit'] }));
  assert.deepEqual(jv.reds, []);
  const provider = readTwiceProvider(wd);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, readShim: true, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');

  // calls: [scout, plan, step-round-1, after-read-1, after-read-2, after-write]
  const afterFirst = JSON.stringify(provider.calls[3]);
  const afterSecond = JSON.stringify(provider.calls[4]);
  assert.ok(afterFirst.includes('BLOCK-0000'), 'the first read starts the file');
  assert.ok(!afterFirst.includes('BLOCK-0030'), 'and the cap really bound it');
  assert.ok(!/unchanged/.test(afterSecond), 'a partly-seen file is never answered with a pointer (the 250-lie design)');
  assert.ok(afterSecond.includes('BLOCK-0025'), 'the second read carries bytes the worker had not seen');
  assert.match(JSON.stringify(provider.systems.at(-1) ?? ''), /READ LIMIT/, 'and the worker was told the bound exists');
});


// FRESH MODEL MEMORY: every attempt's ask() builds a fresh Loop with a fresh transcript, so the
// shim's "what this worker was handed" ledger must reset with it. Otherwise attempt 2 re-reads a
// file attempt 1 fully received and is told "you already hold all of it" — about bytes its model
// never saw (FINDINGS F252). Within ONE attempt the pointer must still fire.
const SMALL_BODY = 'export const SMALL_MARKER_7731 = 1;\n';
const READ_ACROSS_ATTEMPTS = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'read-then-write', action: 'Read src/small.txt, then write tests/test_x.mjs.',
    tools: ['read', 'recall', 'get', 'write'], rounds: 6, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }],
  }],
});

test('read shim: a LATER ATTEMPT re-read gets the bytes (fresh transcript), while a same-attempt re-read still gets the pointer', async (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'small.txt'), SMALL_BODY);
  const jv = validateJob(JOB(wd, { tools: ['read', 'recall', 'get', 'write', 'edit'] }));
  assert.deepEqual(jv.reds, []);
  const rd = (id) => ({ toolCalls: [tcall(id, 'shell_read', { path: join(wd, 'src', 'small.txt') })] });
  const provider = scriptedProvider([
    { text: 'src/small.txt exists; tests/ is empty.' },   // scout
    { text: READ_ACROSS_ATTEMPTS },                        // plan draft
    rd('a1'),                                              // attempt 1: reads F in full
    { text: 'read it, writing nothing' },                  // attempt 1 ends with no write -> exit red
    rd('b1'),                                              // attempt 2: reads F again (index 5 sees result)
    rd('b2'),                                              // attempt 2: reads F a SECOND time, same attempt
    { toolCalls: [tcall('w', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, readShim: 'cap', remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');

  // calls: 0 scout, 1 plan, 2 a1-ask, 3 after-a1-read, 4 attempt-2 ask, 5 after-b1, 6 after-b2, 7 after-write
  const afterA1 = JSON.stringify(provider.calls[3]);
  const afterB1 = JSON.stringify(provider.calls[5]);
  const afterB2 = JSON.stringify(provider.calls[6]);
  assert.ok(afterA1.includes('SMALL_MARKER_7731'), 'attempt 1 received the file');
  assert.ok(afterB1.includes('SMALL_MARKER_7731'), "attempt 2's first read must carry the bytes: its model never saw attempt 1's transcript");
  assert.ok(!/unchanged since you read it/.test(afterB1), 'and must NOT be told it already holds a file it never received');
  assert.match(afterB2, /unchanged since you read it/, 'a second unchanged read inside ONE attempt still gets the pointer — the shim keeps its purpose');
});


test('read shim OFF (the default): the same run delivers the tool\'s own bytes, twice — the A0 guarantee', async (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'big.txt'), BIG_BODY);
  const jv = validateJob(JOB(wd, { tools: ['read', 'recall', 'get', 'write', 'edit'] }));
  const provider = readTwiceProvider(wd);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');

  for (const i of [3, 4]) {
    const shown = JSON.stringify(provider.calls[i]);
    assert.ok(shown.includes('BLOCK-0000') && shown.includes('BLOCK-0059'), `call ${i}: the whole file, both times`);
    assert.ok(!shown.includes('bareloop:'), `call ${i}: the shim left no mark of any kind`);
  }
  assert.ok(!/READ LIMIT/.test(JSON.stringify(provider.systems)), 'and no strategy line was added to the persona');
});


test("read shim arm 'cap' (A1): capped and continued at the real seam, and the persona states the bound", async (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'big.txt'), BIG_BODY);
  const jv = validateJob(JOB(wd, { tools: ['read', 'recall', 'get', 'write', 'edit'] }));
  const provider = readTwiceProvider(wd);
  const { emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, readShim: 'cap', remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');

  const afterFirst = JSON.stringify(provider.calls[3]);
  const afterSecond = JSON.stringify(provider.calls[4]);
  assert.ok(afterFirst.includes('BLOCK-0000') && !afterFirst.includes('BLOCK-0030'), 'the cap bound the first read');
  assert.ok(afterSecond.includes('BLOCK-0025'), 'and the second read continued into unseen bytes');
  const system = JSON.stringify(provider.systems.at(-1) ?? '');
  assert.match(system, /READ LIMIT/, 'the worker was told the bound exists');
  assert.ok(!/RE-READS/.test(system), 'and was NOT told about a diff this arm never sends');
});


test("read shim arm 'diff' (A2): NO cap at the real seam, and the persona says nothing about a limit", async (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'big.txt'), BIG_BODY);
  const jv = validateJob(JOB(wd, { tools: ['read', 'recall', 'get', 'write', 'edit'] }));
  const provider = readTwiceProvider(wd);
  const { emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, readShim: 'diff', remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');

  for (const i of [3, 4]) {
    const shown = JSON.stringify(provider.calls[i]);
    assert.ok(shown.includes('BLOCK-0000') && shown.includes('BLOCK-0059'), `call ${i}: the whole 60 KB file, uncapped`);
    assert.ok(!shown.includes('bareloop:'), `call ${i}: nothing was capped, so nothing was announced`);
  }
  const system = JSON.stringify(provider.systems.at(-1) ?? '');
  assert.ok(!/READ LIMIT/.test(system), 'a 24KB limit is NOT in force and must not be claimed — that would be a different treatment than the arm names');
  assert.match(system, /RE-READS/, 'the diff, which IS in force, is explained');
});


test('an unrecognised read shim arm is refused at the runner door, before a single provider call', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { tools: ['read', 'recall', 'get', 'write', 'edit'] }));
  const provider = readTwiceProvider(wd);
  const { events, emit } = collector();
  await assert.rejects(
    () => runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, readShim: /** @type {any} */ ('diff '), remainingUsd: () => 1.5 }),
    /unknown arm/,
    'a typo coerced into a truthy shim would run A3 under an A2 label for a whole paid row',
  );
  assert.equal(provider.calls.length, 0, 'and it costs nothing: not one call was made');
  assert.deepEqual(events, [], 'nor one spine record');
});


test('read shim ON, NATIVE surface: the shim OWNS the seam — one cap, one notice, and a continuation on the re-read', async (t) => {
  // The composition decision, asserted rather than described: with the shim on,
  // the F48 native wrapper stands down. Layered, the second read would come back
  // with two truncation notices and — worse — the shim would have ledgered the
  // native wrapper's already-cut text as the whole file.
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'big.txt'), BIG_BODY);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription', tools: ['read', 'recall', 'get', 'write', 'edit'] }));
  assert.deepEqual(jv.reds, []);
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'src/big.txt is large.' }] },
    { turns: [{ text: READ_TWICE(wd) }] },
    {
      turns: [
        { tool: 'shell_read', args: { path: join(wd, 'src', 'big.txt') } },
        { tool: 'shell_read', args: { path: join(wd, 'src', 'big.txt') } },
        { tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' } },
        { text: 'done' },
      ],
    },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 3, readShim: true, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');

  const results = nativeProvider.toolResults ?? [];
  const reads = results.filter((r) => r.name === 'shell_read').map((r) => String(r.result));
  assert.equal(reads.length, 2, 'both reads really ran through the native bridge');
  assert.ok(reads[0].includes('BLOCK-0000') && !reads[0].includes('BLOCK-0030'), 'the first read is capped');
  assert.ok(reads[1].includes('BLOCK-0025'), 'the second read continues instead of repeating or pointing');
  for (const r of reads) {
    assert.equal(r.split('[bareloop:').length - 1, 1, 'exactly ONE notice — the two wrappers never stack');
    assert.ok(!r.includes('file truncated at'), 'and the native wrapper\'s own notice is not among them');
  }
});


// ── BA-21 pricing provenance: the WRITE side ─────────────────────────────────
// `rateSource` rides beside `pricing` on every bare-agent >=0.37 metering payload.
// Both metering callbacks forward it through ONE helper — two sites spelling one
// rule are two instruments (the ripgrep-in-ci.yml-only class).

test('rateSourceFields forwards the provenance VERBATIM — including a value we do not recognise', () => {
  assert.deepEqual(rateSourceFields({ costUsd: 0.02, pricing: 'priced', rateSource: 'tier' }), { rateSource: 'tier' });
  assert.deepEqual(rateSourceFields({ rateSource: 'provider' }), { rateSource: 'provider' });
  // never re-labelled here: the write side reports what upstream said, and the READ
  // side (src/ledger.js) is the one place that decides what counts as a guess
  assert.deepEqual(rateSourceFields({ rateSource: 'marketplace' }), { rateSource: 'marketplace' });
});


test('rateSourceFields keeps an ABSENT provenance absent — a payload that said nothing mints no label', () => {
  // bare-agent <0.37, and every round already in the archive. Emitting `null` here
  // would say "nothing was priced", which is a different fact from "nobody told us"
  // — the reader must see UNKNOWN, not a value we invented.
  assert.deepEqual(rateSourceFields({ costUsd: 0.02, pricing: 'priced' }), {});
  assert.deepEqual(rateSourceFields({}), {});
  assert.deepEqual(rateSourceFields(null), {});
  assert.deepEqual(rateSourceFields(undefined), {});
});


test('rateSourceFields carries an explicit null through — upstream saying "nothing was priced"', () => {
  assert.deepEqual(rateSourceFields({ costUsd: null, pricing: 'unpriced', rateSource: null }), { rateSource: null });
});


test('the API path never invents a provenance: a worker-round carries rateSource only when the provider payload did', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { events } = await go(wd, provider);
  const rounds = events.filter((e) => e.type === 'worker-round');
  assert.ok(rounds.length >= 4, `expected metered rounds, got ${rounds.length}`);
  for (const r of rounds) {
    if (!('rateSource' in r)) continue; // pre-BA-21 bare-agent: absent, and read as UNKNOWN
    assert.ok(
      r.rateSource === null || ['provider', 'caller', 'tier', 'default'].includes(r.rateSource),
      `a forwarded provenance must be bare-agent's own vocabulary, got ${JSON.stringify(r.rateSource)}`,
    );
  }
});


test('NATIVE clipipe: a per-turn event is explicitly unpriced, so its provenance is null — there was no rate to have guessed', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'scout' }], cost: 0.02 },
    { turns: [{ text: PLAN(wd) }], cost: 0.01 },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' } }, { text: 'done' }], cost: 0.03 },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 3, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');
  const turnEvents = events.filter((e) => e.type === 'worker-turn');
  assert.ok(turnEvents.length >= 3, 'per-turn attribution rides the spine as worker-turn');
  // costUsd is null BY DESIGN on this surface (the CLI prices the SESSION), so the
  // provenance says the same thing the cost does — never a guess we did not make
  assert.ok(turnEvents.every((e) => e.costUsd === null && e.rateSource === null),
    'every native per-turn event states null cost AND null provenance');
});


// ── G1's ceiling half, refused at $0 ────────────────────────────────────────
// `validatePlan` reds `read-blind` when a capped step grants `read` without the
// retrieval pair. But a step cannot grant what the SIGNED CEILING does not
// offer, so against a spec whose `tools` lack recall/get, EVERY draft reds
// identically and the drafter is PAID for each doomed cycle. The condition is
// knowable before a token: the arm is the operator's argument, the ceiling is
// already signed. These tests pin the refusal AND its blast radius.

test('a capping arm against a ceiling with no retrieval pair throws before a token is spent', async () => {
  const wd = mkdtempSync(join(tmpdir(), 'g1-ceiling-'));
  initPatientRepo(wd);
  writeFileSync(join(wd, 'check.mjs'), 'process.exit(1)\n');
  writeFileSync(join(wd, 'close.mjs'), 'process.exit(1)\n');
  // the default JOB's ceiling is ['read','write','edit'] — no recall, no get
  const jv = validateJob(JOB(wd));
  assert.deepEqual(jv.reds, [], 'the fixture job must be validateJob-green');
  const { events, emit } = collector();
  // a provider that FAILS THE TEST if the run ever reaches it: the claim is not
  // "it refuses", it is "it refuses without paying", and only a provider that
  // cannot be called silently can prove the second half
  const provider = { generate: async () => { assert.fail('the drafter was called — the guard did not fire at $0'); } };

  await assert.rejects(
    () => runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 1.5, readShim: 'cap' }),
    (/** @type {any} */ err) => {
      assert.ok(err instanceof TypeError, 'an operator param-guard, never a model-output red');
      assert.match(err.message, /recall/, 'names the missing verb');
      assert.match(err.message, /get/, 'names the missing verb');
      assert.match(err.message, /read-blind/, 'names the red every draft would have hit');
      return true;
    },
  );
  assert.deepEqual(events, [], 'a $0 refusal records nothing — no run began');
  rmSync(wd, { recursive: true, force: true });
});


test('the same ceiling is fine with the shim off, and fine under the diff-only arm', async () => {
  // the guard must narrow NOTHING that works. Off caps nothing; the diff arm
  // caps nothing either (g1:false), so neither can be read-blind. Both must get
  // PAST the guard — proven by reaching the provider, which off/diff do and the
  // capping arm above does not.
  for (const arm of [false, 'diff']) {
    const wd = mkdtempSync(join(tmpdir(), 'g1-ok-'));
    initPatientRepo(wd);
    writeFileSync(join(wd, 'check.mjs'), 'process.exit(1)\n');
    writeFileSync(join(wd, 'close.mjs'), 'process.exit(1)\n');
    const jv = validateJob(JOB(wd));
    const { emit } = collector();
    let reached = false;
    const provider = { generate: async () => { reached = true; throw new Error('stop here — past the guard is all this asserts'); } };
    await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 1.5, readShim: arm })
      .catch(() => {});
    assert.ok(reached, `readShim:${JSON.stringify(arm)} must pass the ceiling guard — it caps nothing, so it cannot be read-blind`);
    rmSync(wd, { recursive: true, force: true });
  }
});


test('a ceiling that DOES offer the retrieval pair passes the capping arm', async () => {
  const wd = mkdtempSync(join(tmpdir(), 'g1-pair-'));
  initPatientRepo(wd);
  writeFileSync(join(wd, 'check.mjs'), 'process.exit(1)\n');
  writeFileSync(join(wd, 'close.mjs'), 'process.exit(1)\n');
  const jv = validateJob(JOB(wd, { tools: ['read', 'write', 'edit', 'recall', 'get'] }));
  assert.deepEqual(jv.reds, [], 'the widened fixture job must be validateJob-green');
  const { emit } = collector();
  let reached = false;
  const provider = { generate: async () => { reached = true; throw new Error('stop here'); } };
  await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 1.5, readShim: 'cap' })
    .catch(() => {});
  assert.ok(reached, 'a ceiling offering recall+get satisfies G1 — the guard must not fire');
  rmSync(wd, { recursive: true, force: true });
});


test('F178/F177: the real bareguard Gate denies WRITE/EDIT into .git or a NESTED node_modules, driven by the REAL exported FORBIDDEN_WRITE_SEGMENT_PATTERN — but never blocks a READ of either (the coordinator\'s design correction: fs.deny would have blocked reads too, which was never ruled)', async (t) => {
  const wd = mkdtempSync(join(tmpdir(), 'f178-f177-deny-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'packages', 'api'), { recursive: true });
  const auditPath = join(wd, GATE_AUDIT_FILE);
  // the SAME shape mkWorker builds: fs.deny spells from ARBITER_BOOK_STORES
  // alone (no .git, no node_modules — those are write/edit-only, never a
  // blanket fs deny, which would also block READS); the segment pattern is
  // the write/edit belt, wired through tools.denyArgPatterns.
  //
  // writeScope is the WHOLE workdir here — deliberately. `.git` is NEVER
  // legitimately inside a signed fence (`scopeContained` refuses that at
  // declaration time), so this pattern is a belt for a VALIDATOR REGRESSION;
  // a narrower writeScope (e.g. just 'packages/api') would let fs.writeScope
  // deny the .git path on its own and the test would prove nothing about the
  // denyArgPatterns belt at all. `packages/api/node_modules` is the opposite
  // case — genuinely, legitimately in-fence — so a whole-workdir scope proves
  // that case too, at least as strictly as a narrower one would.
  const gate = new Gate({
    fs: {
      writeScope: [wd],
      readScope: [wd],
      deny: [auditPath, ...ARBITER_BOOK_STORES.map((s) => join(wd, s))],
    },
    tools: { denyArgPatterns: { write: [FORBIDDEN_WRITE_SEGMENT_PATTERN], edit: [FORBIDDEN_WRITE_SEGMENT_PATTERN] } },
    audit: { path: null }, // fileless — this test asserts the DECISION, not the audit file
  });

  // WRITE/EDIT into .git — denied, at any depth
  const gitWrite = await gate.check({ type: 'write', path: join(wd, '.git', 'config') });
  assert.equal(gitWrite.outcome, 'deny', 'a write inside .git must be denied');
  assert.equal(gitWrite.rule, 'tools.denyArgPatterns', 'denied by the denyArgPatterns hook, not fs.deny (fs.deny would also block reads — never ruled)');
  const nestedGitWrite = await gate.check({ type: 'write', path: join(wd, '.git', 'refs', 'heads', 'main') });
  assert.equal(nestedGitWrite.outcome, 'deny', 'a write anywhere UNDER .git must be denied');
  const gitEdit = await gate.check({ type: 'edit', path: join(wd, '.git', 'config'), args: { bytes: 4 } });
  assert.equal(gitEdit.outcome, 'deny', 'an edit inside .git must be denied the same way as a write');

  // WRITE/EDIT into a NESTED node_modules (genuinely inside the signed fence,
  // which fs.writeScope alone cannot stop) — denied
  const nmWrite = await gate.check({ type: 'write', path: join(wd, 'packages', 'api', 'node_modules', 'left-pad', 'index.js') });
  assert.equal(nmWrite.outcome, 'deny', 'a write into a NESTED node_modules must be denied even though the path is genuinely inside the signed fence');
  assert.equal(nmWrite.rule, 'tools.denyArgPatterns');
  const nmEdit = await gate.check({ type: 'edit', path: join(wd, 'packages', 'api', 'node_modules', 'left-pad', 'index.js'), args: { bytes: 4 } });
  assert.equal(nmEdit.outcome, 'deny', 'an edit into node_modules must be denied the same way as a write');

  // READS of the SAME paths are NOT denied — hamr ruled block WRITING, never
  // reading, and fs.deny (which WOULD have blocked these) is deliberately
  // never used for .git/node_modules (see the pattern's own doc comment)
  const gitRead = await gate.check({ type: 'read', path: join(wd, '.git', 'HEAD') });
  assert.equal(gitRead.outcome, 'allow', 'reading .git/HEAD must be allowed — only writing is ruled out');
  const nmRead = await gate.check({ type: 'read', path: join(wd, 'packages', 'api', 'node_modules', 'left-pad', 'index.js') });
  assert.equal(nmRead.outcome, 'allow', 'reading inside node_modules must be allowed — only writing is ruled out');

  // and an ordinary in-fence write, sibling to both, is still allowed — the
  // pattern is additive, it must never narrow the signed fence itself
  const scopedWrite = await gate.check({ type: 'write', path: join(wd, 'packages', 'api', 'src', 'mod.mjs') });
  assert.equal(scopedWrite.outcome, 'allow', 'an ordinary in-fence write outside .git/node_modules must still be allowed');

  // look-alike directory/file names must NOT false-positive (whole-segment match only)
  for (const p of [
    join(wd, 'packages', 'api', '.github', 'workflows', 'ci.yml'),
    join(wd, 'packages', 'api', '.gitignore'),
    join(wd, 'packages', 'api', 'my.git', 'x.js'),
    join(wd, 'packages', 'api', 'node_modules_util', 'x.js'),
  ]) {
    const lookalike = await gate.check({ type: 'write', path: p });
    assert.equal(lookalike.outcome, 'allow', `${p} is a look-alike, not .git/node_modules itself — must stay admitted`);
  }
});


test('LOOP path: a write into a NESTED node_modules is denied through the REAL runPlan/mkWorker wiring, not just the standalone pattern (F177 follow-up to F178)', async (t) => {
  const wd = makePatient(t);
  mkdirSync(join(wd, 'pkg'));
  const job = JOB(wd, { writeScope: ['pkg/**'] });
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const evilPath = join(wd, 'pkg', 'node_modules', 'evil.js');
  // the step's DECLARED target is legal (pkg/mod.mjs) — the worker's ACTUAL
  // tool call is what goes off-script and attempts the node_modules write,
  // exactly the shape the runtime belt exists for (a clean plan, a worker
  // that doesn't stay on its own declared target)
  const provider = scriptedProvider([
    { text: 'pkg/ is empty' },                                                    // scout
    { text: JSON.stringify({ schema: 'plan-v1', steps: [{
      id: 'write-nm', action: 'write pkg/mod.mjs', tools: ['write'], rounds: 6, target: 'pkg/mod.mjs',
      exit: [{ type: 'tree-changed', scope: 'pkg/**' }],
    }] }) },                                                                        // plan draft
    { toolCalls: [tcall('t1', 'shell_write', { path: evilPath, content: 'evil\n' })] }, // off-script attempt
    { text: 'tried to write into node_modules' },
  ]);
  const { events, emit } = collector();
  await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 1, remainingUsd: () => 1.5 }).catch(() => {});
  assert.ok(!existsSync(evilPath), 'the node_modules write was DENIED even though the path is genuinely inside the signed pkg/** fence');
});
