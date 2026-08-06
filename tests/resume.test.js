// Layer 3 module C — RESUME AFTER KILL, as behaviour tests.
//
// hamr's rulings are the spec, verbatim:
//
//   "the goal is always self heal and killing and coming back is not an option"
//   "money, signature and checkpoint (starts from where it stopped) if mid loop,
//    restart that loop"
//
// So a run that was killed comes back losing as little as possible: the tries that
// COMPLETED are not re-run, the try that was mid-flight is RESTARTED from its
// beginning (it was never graded, so it is not consumed), and it restarts under the
// REMAINDER of its own signed per-try numbers — "a budget ceiling folds in prior
// spend so re-invoking cannot silently widen it". A fresh allotment per kill would
// let a run outlive the worst case the operator signed, one kill at a time.
//
// THE FIXTURES ARE REAL SPINES. Every reconstruction test below runs the actual
// `runReuse` against a real spine file and then TRUNCATES it — a hand-authored
// event list can only contain what the author remembered to write, and the whole
// class this reader has to survive (F45: account for every writer in the window)
// is the writer the author forgot. Truncation is also faithful to the failure being
// modelled: a killed process leaves exactly a prefix of its own log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readResume, runReuse, resolveReuse, reuseSpecHash } from '../src/reuse.js';
import { runPlan } from '../src/planrun.js';
import { runJob } from '../src/run.js';
import { FIX_STRIKE_LIMIT, readGrade } from '../src/trend.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { makeRegistry, saveBridge, loadBridge } from '../src/bridges.js';
import { makeSpine } from '../src/spine.js';
import { readSpine, scriptedProvider } from './helpers.js';

const base = mkdtempSync(join(tmpdir(), 'resume-test-'));
let n = 0;
const freshRegistry = () => makeRegistry(join(base, `reg-${n += 1}`));

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

const PLAN = (id = 'fix-types') => ({
  schema: 'plan-v1',
  steps: [{ id, action: 'Fix the types.', tools: ['read', 'edit'], rounds: 8, target: 'src/x.js', exit: [{ type: 'tree-changed', scope: 'src/**' }] }],
});

const BRIDGE = (name) => ({
  schema: 'bridge-v1',
  name,
  goal: 'Make the package pass tsc --strict without weakening the tests.',
  specHash: 'signed-hash',
  closeStageNames: ['typecheck'],
  toolsUsed: ['read', 'edit'],
  versions: [{ plan: PLAN(), runid: 'ms1', greenAt: '2026-07-27T10:00:00Z', patient: 'aurora-u', costUsd: 2.21, wallMs: 534_000, rounds: 40 }],
  history: [{ at: '2026-07-27T10:00:00Z', runid: 'ms1', patient: 'aurora-u', outcome: 'green', failingStage: null, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 40 }],
});

const seed = (...bridges) => {
  const dir = freshRegistry();
  for (const b of bridges) assert.equal(saveBridge(dir, b).ok, true);
  return dir;
};

const picker = (...answers) => scriptedProvider(answers.map((a) => ({ text: JSON.stringify(a) })));

/** a scripted job runner with runJob's own emission contract (rounds THEN the terminal) */
const scriptedRuns = (script) => {
  let i = 0;
  return async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    const s = script[Math.min(i, script.length - 1)];
    i += 1;
    for (const c of s.rounds ?? [0.25]) opts.emit('worker-round', { kind: 'turn', costUsd: c });
    if (s.plan !== undefined) opts.emit('plan-accepted', { plan: s.plan });
    if (s.closeStage !== undefined) opts.emit('outer-close', { verdict: s.outcome === 'green' ? 'satisfied' : 'red', stage: s.closeStage });
    opts.emit('job-end', { outcome: s.outcome, spentUsd: s.spentUsd ?? 1, spendComplete: s.spendComplete ?? true });
    return s.outcome;
  };
};

/**
 * Run a real reuse run onto a real spine file and hand back its events.
 * @param {object} over @returns {Promise<{file: string, events: any[], result: any}>}
 */
async function spineOf(over = {}) {
  const file = join(base, `spine-${n += 1}.jsonl`);
  const result = await runReuse({
    job: JOB(),
    approvals: [],
    registryDir: over.registryDir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'litectx-u',
    workdir: base,
    provider: picker({ choice: null, reason: 'none' }),
    emit: makeSpine(file),
    runid: 'deadrun',
    ...over,
  });
  return { file, events: readSpine(file), result };
}

/** the prefix of a spine a kill leaves behind: every line UP TO AND INCLUDING the
 * `nth` event matching `pred` @param {any[]} events */
const killedAfter = (events, pred, extra = 0) => {
  const at = events.findIndex(pred);
  assert.notEqual(at, -1, 'the fixture must contain the event the kill is placed after');
  return events.slice(0, at + 1 + extra);
};

// ── the reconstruction ──────────────────────────────────────────────────────

test('reconstruction: completed tries are read back with their outcomes and spend, and are NOT candidates for a re-run', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.5, rounds: [0.5, 0.5, 0.5] },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2, rounds: [1, 1] },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
    ]),
  });
  // killed after the SECOND try finished, before the cold leg produced anything
  const r = readResume(killedAfter(events, (e) => e.type === 'try-end' && e.n === 2));
  assert.equal(r.completed.length, 2);
  assert.deepEqual(r.completed.map((t) => t.bridge), ['alpha', 'beta']);
  assert.deepEqual(r.completed.map((t) => t.runOutcome), ['escalated', 'escalated']);
  assert.deepEqual(r.completed.map((t) => t.spentUsd), [1.5, 2]);
  assert.deepEqual(r.tried, ['alpha', 'beta'], 'both are spent — the resumed run must not offer them again');
  assert.equal(r.restart, null, 'nothing was mid-flight: the kill landed between tries');
  assert.equal(r.ended, false);
});

test('reconstruction: a MID-TRY kill names the try to restart and sums ONLY that try\'s own rounds — the selection call\'s cost is never attributed to a worker (F45)', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.5, rounds: [0.5, 0.5, 0.5] },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2, rounds: [0.75, 0.75] },
      { outcome: 'green', plan: PLAN('cold'), closeStage: 'typecheck', spentUsd: 1 },
    ]),
  });
  // killed INSIDE try 2, after its first worker-round
  const roundsIn2 = events.filter((e) => e.type === 'worker-round').slice(3);
  const cut = events.slice(0, events.indexOf(roundsIn2[0]) + 1);
  const r = readResume(cut);

  assert.equal(r.completed.length, 1, 'try 1 completed and is kept');
  assert.equal(r.restart.n, 2);
  assert.equal(r.restart.mode, 'bridge');
  assert.equal(r.restart.bridge, 'beta');
  assert.equal(r.restart.priorSpentUsd, 0.75, 'the dead attempt\'s ONE round — not try 1\'s rounds, and not the selection calls');
  assert.equal(r.restart.priorSpendComplete, true);
  assert.deepEqual(r.tried, ['alpha', 'beta'], 'the mid-flight bridge is spoken for: the resumed run restarts IT, it never re-picks it');

  // the money the whole dead run spent, decomposed — and the two halves are DIFFERENT
  // numbers on purpose: the restart's prior is folded into the restarted try's own
  // ledger, so seeding it into the run total as well would count it twice
  const selCost = events.filter((e) => e.type === 'selection-result').reduce((a, e) => a + e.costUsd, 0);
  assert.ok(selCost > 0, 'the fixture really did pay for its selection calls');
  assert.ok(Math.abs(r.carrySpentUsd - (1.5 + selCost)) < 1e-9, `carried = completed tries + selection calls: ${r.carrySpentUsd}`);
  assert.ok(Math.abs(r.spentUsd - (1.5 + selCost + 0.75)) < 1e-9, `the dead run's WHOLE spend includes the partial: ${r.spentUsd}`);
});

test('reconstruction: a kill BEFORE the first round of a try restarts it with a $0 prior — an unknown is never invented and a zero is a real zero', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 }]),
  });
  const r = readResume(killedAfter(events, (e) => e.type === 'try-start' && e.n === 1));
  assert.equal(r.completed.length, 0);
  assert.equal(r.restart.n, 1);
  assert.equal(r.restart.bridge, 'alpha');
  assert.equal(r.restart.priorSpentUsd, 0);
  assert.equal(r.restart.priorSpendComplete, true, 'no round happened, so nothing is unknown about what it cost');
});

test('reconstruction: an UNPRICED round in the dead window makes the fold a FLOOR — reported, never rounded to exact (F6)', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.4, null], spentUsd: 1 }]),
  });
  const r = readResume(killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === null));
  assert.equal(r.restart.priorSpentUsd, 0.4, 'the priced sum stands as the floor');
  assert.equal(r.restart.priorSpendComplete, false, 'and it is flagged a floor — an unpriced round is never free');
  assert.equal(r.spendComplete, false, 'the whole figure inherits the floor');
});

test('reconstruction: a try whose runJob RETURNED but whose row never landed is COMPLETE, not restarted — paying twice for a verdict already rendered is the thing resume exists to avoid', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.25, rounds: [0.6] }]),
  });
  // killed after job-end but before the registry write and the try-end row
  const r = readResume(killedAfter(events, (e) => e.type === 'job-end'));
  assert.equal(r.restart, null, 'the close already judged this try — it is graded, not mid-flight');
  assert.equal(r.completed.length, 1);
  assert.equal(r.completed[0].runOutcome, 'escalated');
  assert.equal(r.completed[0].spentUsd, 1.25);
  assert.equal(r.completed[0].failingStage, 'typecheck', 'read with the runner\'s OWN spine reader, not a second one');
  assert.equal(r.r1Missing, true, 'and the registry row the death cost is NAMED, not silently absent');

  // one event later the registry write HAS landed, and the reader says so
  const withWrite = readResume(killedAfter(events, (e) => e.type === 'bridge-write'));
  assert.equal(withWrite.r1Missing, false, 'the dead attempt already wrote its R1 row — a resume must not double-write it');
  assert.equal(withWrite.restart, null);
});

test('reconstruction: the inherited GRADED row\'s wall is measured to the try\'s own terminal, not to the kill that came minutes later', async () => {
  // The try STOPPED when its close had its say; what the process did afterwards is not
  // this try's time. The kill stamp is the only clock a MID-FLIGHT window has, but this
  // branch is reading a window that landed a `job-end` — the precise answer is on the
  // record in hand, and quoting the kill instead inflates a row read against a signed cap.
  const dir = seed(BRIDGE('alpha'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.25, rounds: [0.6] }]),
  });
  const cut = killedAfter(events, (e) => e.type === 'job-end');
  const endedAt = Date.parse(cut.at(-1).ts);
  const r = readResume(cut, { deathAt: endedAt + 600_000 }); // the process lived ten more minutes
  assert.equal(r.completed.length, 1);
  assert.ok(r.completed[0].wallMs < 60_000,
    `the row states the try's own wall (${r.completed[0].wallMs}ms), not the ten minutes the process outlived its verdict`);
});

test('reconstruction: a run that reached its OWN terminal has nothing to resume, and a GREEN one says so by name', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('worked'), closeStage: 'typecheck', spentUsd: 1 }]),
  });
  const r = readResume(events);
  assert.equal(r.ended, true);
  assert.equal(r.endOutcome, 'green');
  assert.equal(r.greened, true);
  assert.equal(r.restart, null);
});

test('reconstruction: the envelope the dead run was SIGNED under is read back off its own spine — a resume verifies it is continuing the same one', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { events, result } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 }]),
  });
  const r = readResume(events);
  assert.equal(r.approvalHash, result.approvalHash, 'the reuse-start event carries the signed hash (f44526e)');
  assert.equal(r.specHash, result.specHash);
  assert.equal(r.bridgeTries, 2);
  assert.equal(r.patient, 'litectx-u');
});

test('reconstruction: a spine with no reuse-start at all is not a reuse run — it refuses rather than guessing', () => {
  const r = readResume([{ type: 'job-start', seq: 1 }, { type: 'job-end', outcome: 'green', seq: 2 }]);
  assert.equal(r.started, false);
  assert.equal(r.restart, null);
  assert.equal(r.completed.length, 0);
});

test('reconstruction: an ABANDONED attempt of the same try is not counted twice — its spend rides in the next attempt\'s declared fold', async () => {
  // the resume-of-a-resume shape: try 2 starts, dies, is restarted (a try-start
  // DECLARING the fold it inherited), and dies again. The second window's prior is the
  // declared fold PLUS its own rounds — adding the first window's rounds again would
  // bill the operator twice for one attempt.
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1, rounds: [1] },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2, rounds: [0.75, 0.75] },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
    ]),
  });
  const dead = killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.75);
  const first = readResume(dead);
  assert.equal(first.restart.priorSpentUsd, 0.75);

  // now the restarted attempt: a try-start carrying the fold, one more round, dead again
  const resumed = [
    ...dead,
    { type: 'try-start', n: 2, mode: 'bridge', bridge: 'beta', priorSpentUsd: 0.75, priorWallMs: 60_000, ts: dead.at(-1).ts, seq: 900 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.5, ts: dead.at(-1).ts, seq: 901 },
  ];
  const second = readResume(resumed);
  assert.equal(second.restart.n, 2);
  assert.equal(second.restart.priorSpentUsd, 1.25, '0.75 already folded + 0.5 of new rounds — never 0.75 counted twice');
  assert.ok(second.restart.priorWallMs >= 60_000, 'and the wall fold accumulates the same way');
  assert.equal(second.completed.length, 1, 'the abandoned window is not a completed try');
});

test('reconstruction: the wall the dead attempt consumed is measured from the spine\'s own timestamps, and a later kill record moves it', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 }]),
  });
  const cut = killedAfter(events, (e) => e.type === 'try-start' && e.n === 1);
  const startedAt = Date.parse(cut.at(-1).ts);

  const bare = readResume(cut);
  assert.ok(bare.restart.priorWallMs >= 0 && bare.restart.priorWallMs < 60_000, 'with no other evidence, the last event IS the last sign of life');

  // the watchdog's kill record is later evidence of how long the process really lived,
  // and it is the honest number to fold (an under-count would hand the restart wall the
  // dead attempt already burned)
  const withKill = readResume(cut, { deathAt: startedAt + 300_000 });
  assert.equal(withKill.restart.priorWallMs, 300_000);
  assert.equal(withKill.deathAtKnown, true);
});

// ── the RESUMED RUN ─────────────────────────────────────────────────────────
//
// "starts from where it stopped; if mid loop, restart that loop" — the completed
// tries are kept, the mid-flight try is restarted from its beginning under the
// REMAINDER of its own signed numbers, and the run carries on into whatever the
// envelope still authorizes.

/** a scripted runner that also RECORDS what each try was handed */
const recordingRuns = (script) => {
  /** @type {any[]} */
  const calls = [];
  let i = 0;
  const fn = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    const s = script[Math.min(i, script.length - 1)];
    i += 1;
    calls.push({ spec, bridge: opts.bridge, priorSpentUsd: opts.priorSpentUsd, priorWallMs: opts.priorWallMs, shellCapUsd: opts.shellCapUsd, resumeGrades: opts.resumeGrades });
    for (const c of s.rounds ?? [0.25]) opts.emit('worker-round', { kind: 'turn', costUsd: c });
    if (s.plan !== undefined) opts.emit('plan-accepted', { plan: s.plan });
    if (s.closeStage !== undefined) opts.emit('outer-close', { verdict: s.outcome === 'green' ? 'satisfied' : 'red', stage: s.closeStage });
    opts.emit('job-end', { outcome: s.outcome, spentUsd: s.spentUsd ?? 1, spendComplete: s.spendComplete ?? true });
    return s.outcome;
  };
  return Object.assign(fn, { calls });
};

/** resume a dead spine onto the SAME file, exactly as the runner does @returns {Promise<any>} */
const resumeOnto = async (file, over = {}) => {
  const dead = readResume(readSpine(file), over.deathAt ? { deathAt: over.deathAt } : {});
  const { deathAt: _drop, ...rest } = over;
  const result = await runReuse({
    job: JOB(),
    approvals: [],
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'litectx-u',
    workdir: base,
    provider: picker({ choice: null, reason: 'none' }),
    emit: makeSpine(file),
    runid: 'deadrun',
    resume: dead,
    ...rest,
  });
  return { dead, result, events: readSpine(file) };
};

/** truncate a spine file to a prefix — the kill @param {string} file @param {any[]} keep */
const truncateTo = (file, keep) => writeFileSync(file, keep.map((e) => `${JSON.stringify(e)}\n`).join(''));

test('resume: a COMPLETED try is never re-run — the resumed leg carries on at the next one, and its bridge stays excluded', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.5 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'try-end' && e.n === 1));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('second'), closeStage: 'typecheck', spentUsd: 2 }]);
  const sel = picker({ choice: 'beta', reason: 'the one left' });
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: sel, runJob: runs });

  assert.equal(result.outcome, 'green');
  assert.equal(runs.calls.length, 1, 'try 1 is NOT paid for twice');
  assert.equal(runs.calls[0].bridge.name, 'beta');
  assert.doesNotMatch(sel.calls[0], /\[alpha\]/, 'the completed try\'s bridge is spoken for and never offered again');
  assert.equal(result.tries.length, 2, 'the readout holds BOTH legs — the dead run\'s row is not lost');
  assert.equal(result.tries[0].inherited, true);
  assert.equal(result.triesUsed, 2, 'and both count against the tries the operator authorized');
});

test('resume: a MID-TRY kill RESTARTS that try — same bridge, no second selection call, and it is not counted as consumed', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.8, 0.8], spentUsd: 2 }]),
  });
  const cut = killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.8);
  truncateTo(file, cut);

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('restarted'), closeStage: 'typecheck', spentUsd: 3 }]);
  const sel = picker({ choice: 'beta', reason: 'must never be asked' });
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: sel, runJob: runs });

  assert.equal(result.outcome, 'green');
  assert.equal(sel.calls.length, 0, 'the pick was already made and paid for — a restart re-runs the TRY, not the decision');
  assert.equal(runs.calls[0].bridge.name, 'alpha', 'the same workflow the dead attempt was running');
  assert.equal(result.tries.length, 1, 'the restarted try is ONE try, not two — it was never graded');
  assert.equal(result.tries[0].n, 1);
  assert.equal(result.tries[0].restarted, true);
});

test('resume: the restart runs under the REMAINDER — prior spend and prior wall fold in, and the SIGNED per-try numbers are never rewritten', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [1.25, 1.25], spentUsd: 3 }]),
  });
  const cut = killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 1.25, 1);
  truncateTo(file, cut);
  const deathAt = Date.parse(cut.at(-1).ts) + 400_000;

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('restarted'), closeStage: 'typecheck', spentUsd: 4.1 }]);
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: runs, deathAt });

  assert.equal(runs.calls[0].priorSpentUsd, 2.5, 'the dead attempt\'s two rounds are folded into the restart\'s wallet');
  assert.ok(runs.calls[0].priorWallMs >= 400_000, `and the wall it burned: ${runs.calls[0].priorWallMs}`);
  assert.equal(runs.calls[0].spec.budgetUsd, 5, 'the SIGNED cap is untouched — rewriting it would be a new spec version needing a signature nobody typed');
  assert.equal(runs.calls[0].spec.maxWallMs, 1_800_000);
  assert.equal(result.tries[0].capUsd, 5, 'the row is still read against the number the operator signed');
  assert.ok(result.tries[0].wallMs >= 400_000, `the ROW states the try's whole wall too (${result.tries[0].wallMs}) — a row quoting only the restart's minutes would read as a try that ran comfortably inside a wall it had nearly exhausted`);
  assert.equal(result.tries[0].spentUsd, 4.1, 'and the try\'s spend is the WHOLE try — both attempts, never the restart alone');
});

test('resume: the restart is HANDED the dead leg\'s close grades, so the halt readout spans the chain rather than restarting at this leg\'s first close', async () => {
  // `readResume` has always COMPUTED `restart.grades` (readGradeSeed) and `runJob`
  // has always accepted `resumeGrades` — the reuse runner was the one forwarder that
  // never delivered them (F50's class: a parameter computed, carried past its consumer,
  // and silently dropped). Without them a restarted leg that re-grades an unchanged tree
  // reports `flat` — "revise the goal" — on a run that was converging when the money ran
  // out. The seam is the HALT READOUT only; no strike and no bound is spent by it.
  const dir = seed(BRIDGE('alpha'));
  const graded = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    opts.emit('worker-round', { kind: 'turn', costUsd: 0.5 });
    opts.emit('plan-accepted', { plan: PLAN('grading') });
    opts.emit('fix-loop', { gapBytes: 120 });
    // the live instrument's own readings — taken verbatim, never re-parsed
    opts.emit('ladder', { governor: 'close-trend', stage: 'typecheck', value: 12, iteration: 1 });
    opts.emit('ladder', { governor: 'close-trend', stage: 'typecheck', value: 5, iteration: 2 });
    opts.emit('job-end', { outcome: 'escalated', spentUsd: 0.5, spendComplete: true });
    return 'escalated';
  };
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: graded,
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'ladder' && e.value === 5));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('restarted'), closeStage: 'typecheck', spentUsd: 1 }]);
  const { dead, events: after } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: runs });

  assert.deepEqual(dead.restart.grades, [{ stage: 'typecheck', value: 12 }, { stage: 'typecheck', value: 5 }],
    'the reader found them (the control: this half already worked)');
  assert.deepEqual(runs.calls[0].resumeGrades, dead.restart.grades,
    'and the restart RECEIVES them — computed-but-undelivered is the readout promising a chain the run never gets');

  const rec = after.find((e) => e.type === 'resume-start');
  assert.equal(rec.restart.gradesInherited, 2, 'the record says HOW MANY baselines crossed the seam');
  assert.doesNotMatch(JSON.stringify(rec), /suppression|FAILED|gap/i,
    'counts and stage names only — a close byte that crosses onto an append-only spine crosses for good');
});

test('CONTROL: a restart with NO grade to inherit hands over nothing and declares nothing — an absent baseline is absent, never a decorative zero', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.8, 0.8], spentUsd: 2 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.8));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('restarted'), closeStage: 'typecheck', spentUsd: 3 }]);
  const { events: after } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: runs });

  assert.equal(runs.calls[0].resumeGrades, undefined, 'the cold path stays byte-identical — no empty array to be read as a baseline');
  assert.equal('gradesInherited' in after.find((e) => e.type === 'resume-start').restart, false);
});

test('resume: the try row\'s ROUNDS fold across both attempts, like its money and its wall — one row, one span', async () => {
  // `spentUsd` and `wallMs` have always folded; `rounds` was leg-only, so a restarted
  // try's registry row quoted the restart's turns against a spend covering both. Three
  // numbers on one row measured over two different spans is the same class of readout
  // defect as an exact-looking floor: each is defensible alone and they cannot all be
  // right together.
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.5, 0.5, 0.5], spentUsd: 1.5 }]),
  });
  const cut = killedAfter(events, (e) => e.type === 'worker-round', 2); // all three bought
  truncateTo(file, cut);
  assert.equal(readResume(readSpine(file)).restart.priorRounds, 3, 'the dead attempt\'s turns are counted');

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('restarted'), closeStage: 'typecheck', rounds: [0.4, 0.4], spentUsd: 2.3 }]);
  const { result, events: after } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: runs });

  assert.equal(result.tries[0].rounds, 5, 'three the dead attempt bought plus two the restart did — the whole try');
  assert.equal(result.tries[0].priorRounds, 3, 'and the row names the fold, so the split is readable rather than inferred');
  assert.equal(after.find((e) => e.type === 'try-start' && e.priorRounds !== undefined).priorRounds, 3,
    'DECLARED on the spine too, so a resume OF this resume folds once instead of re-deriving');
  assert.equal(loadBridge(join(dir, 'alpha.json')).bridge.versions.at(-1).rounds, 5,
    'the minted version inherits the same whole-try figure its cost and wall already do');
});

test('resume: an UNFOLDABLE round count stays null — a leg whose turns cannot be counted never contributes a number it does not have (F6)', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.5], spentUsd: 1 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round'));

  // the restart spends real money and emits no turn signal at all — `readTry` reads that
  // as an UNKNOWN count, and an unknown plus a known is still unknown
  const opaque = async (/** @type {any} */ spec, /** @type {any} */ opts) => {
    opts.emit('plan-accepted', { plan: PLAN('restarted') });
    opts.emit('outer-close', { verdict: 'satisfied', stage: 'typecheck' });
    opts.emit('job-end', { outcome: 'green', spentUsd: 2, spendComplete: true });
    return 'green';
  };
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: opaque });
  assert.equal(result.tries[0].rounds, null, 'not the 1 the fold alone could see — a partial count reads as a whole one');
  assert.equal(result.tries[0].priorRounds, 1, 'the half that IS known is still stated, just never summed into a total');
});

test('resume: a remainder that cannot fund the restart CAPS honestly — nothing is launched and the stop is the checkpoint', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [5], spentUsd: 5 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 5));

  const runs = recordingRuns([{ outcome: 'green' }]);
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: runs });

  assert.equal(result.outcome, 'cap-halt');
  assert.equal(runs.calls.length, 0, 'a try that cannot be funded is never launched — that would widen the signed worst case');
  assert.match(result.decision, /remain/i);
  assert.match(result.options.join(' '), /re-?sign|approve|envelope/i, 'topping up is a re-signed envelope, and the stop says so');
});

test('resume: a remainder below one close timeout is a WALL stop, not an unreadable row (F45 in a time coat)', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.1], spentUsd: 1 }]),
  });
  const cut = killedAfter(events, (e) => e.type === 'worker-round');
  truncateTo(file, cut);

  const runs = recordingRuns([{ outcome: 'green' }]);
  const { result } = await resumeOnto(file, {
    registryDir: dir, selectionProvider: picker(), runJob: runs,
    deathAt: Date.parse(cut.at(-1).ts) + 1_750_000, // 29m10s of a 30m wall gone
  });
  assert.equal(result.outcome, 'wall-halt');
  assert.equal(runs.calls.length, 0, 'a try that cannot fund its own close produces an unreadable row — a casualty, never evidence');
});

test('resume: a seed from a DIFFERENT signed envelope is refused — a resume continues one run, not any run', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'try-start'));
  const dead = readResume(readSpine(file));
  const runs = recordingRuns([{ outcome: 'green' }]);
  const result = await runReuse({
    job: JOB(), approvals: [], registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'litectx-u', workdir: base, provider: picker(), selectionProvider: picker(),
    emit: makeSpine(file), runid: 'deadrun', runJob: runs,
    resume: { ...dead, approvalHash: 'f'.repeat(64) },
  });
  assert.equal(result.outcome, 'resume-red');
  assert.equal(runs.calls.length, 0);
  assert.match(result.detail, /f{8}/, 'both hashes are named — a mismatch is never a silent restart');
});

test('resume: the workflow the dead attempt was running is GONE from the registry — the run stops rather than quietly substituting another', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'try-start'));
  const dead = readResume(readSpine(file));
  const runs = recordingRuns([{ outcome: 'green' }]);
  const result = await runReuse({
    job: JOB(), approvals: [], registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'litectx-u', workdir: base, provider: picker(), selectionProvider: picker(),
    emit: makeSpine(file), runid: 'deadrun', runJob: runs,
    resume: { ...dead, restart: { ...dead.restart, bridge: 'vanished' } },
  });
  assert.equal(result.outcome, 'resume-red');
  assert.equal(runs.calls.length, 0);
  assert.match(result.decision, /vanished/);
});

test('resume: a kill inside the COLD leg restarts the COLD leg only — the spent bridge tries are never re-run', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 1 },
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', rounds: [1], spentUsd: 1 },
      { outcome: 'escalated', closeStage: 'typecheck', rounds: [0.6], spentUsd: 2 },
    ]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.6));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('cold-restart'), closeStage: 'typecheck', spentUsd: 2.5 }]);
  const { result } = await resumeOnto(file, {
    registryDir: dir, selectionProvider: picker(), runJob: runs,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 1 },
  });
  assert.equal(result.outcome, 'green');
  assert.equal(runs.calls.length, 1);
  assert.equal(runs.calls[0].bridge, null, 'the cold leg carries no bridge');
  assert.equal(runs.calls[0].priorSpentUsd, 0.6);
  assert.equal(result.tries.filter((t) => t.mode === 'cold').length, 1, 'exactly one cold attempt exists in the record');
});

test('resume: the resumed readout states TOTAL spend — the dead legs and the resumed one, with the floor travelling (F6)', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.5, spendComplete: false },
      { outcome: 'escalated', closeStage: 'typecheck', rounds: [0.5], spentUsd: 2 },
    ]),
  });
  const cut = killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.5);
  truncateTo(file, cut);
  const dead = readResume(readSpine(file));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('done'), closeStage: 'typecheck', spentUsd: 2.75 }]);
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: runs });

  // 1.5 (dead try 1) + the dead run's selection calls + 2.75 (the restarted try, which
  // already contains the 0.5 the dead attempt spent) — the partial is counted ONCE
  const expected = dead.carrySpentUsd + 2.75;
  assert.ok(Math.abs(result.spentUsd - expected) < 1e-9, `${result.spentUsd} vs ${expected}`);
  assert.equal(result.spendComplete, false, 'the dead run\'s incomplete try makes the whole figure a floor, and the floor survives the resume');
});

test('resume: the resumed leg DECLARES its fold on the spine, so a second kill folds once — not twice', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.4], spentUsd: 1 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.4));

  // resume once, and kill it again mid-try
  const runs = recordingRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.3, 0.3], spentUsd: 1 }]);
  await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: runs });
  const after = readSpine(file);
  truncateTo(file, killedAfter(after, (e) => e.type === 'worker-round' && e.costUsd === 0.3));

  const twice = readResume(readSpine(file));
  assert.equal(twice.restart.n, 1, 'still the same try — two kills, one try, still not consumed');
  assert.ok(Math.abs(twice.restart.priorSpentUsd - 0.7) < 1e-9, `0.4 folded + 0.3 new: ${twice.restart.priorSpentUsd}`);
  assert.ok(twice.restart.priorWallMs >= 0);
});

test('resume: every escalation the resumed path emits is a category the ledger can classify', async () => {
  const { classifyIncidents } = await import('../src/ledger.js');
  /** @type {any[]} */
  const seen = [];
  const emit = (/** @type {string} */ type, /** @type {any} */ data) => { const ev = { type, seq: seen.length, ...(data ?? {}) }; seen.push(ev); return ev; };
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [5], spentUsd: 5 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 5));
  const dead = readResume(readSpine(file));
  // 1. the remainder cannot fund the restart
  await runReuse({
    job: JOB(), approvals: [], registryDir: dir, envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'p', workdir: base, provider: picker(), selectionProvider: picker(), emit, runid: 'x', resume: dead,
    runJob: recordingRuns([{ outcome: 'green' }]),
  });
  // 2. the envelope the seed was signed under is not this one
  await runReuse({
    job: JOB(), approvals: [], registryDir: dir, envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'p', workdir: base, provider: picker(), selectionProvider: picker(), emit, runid: 'x',
    resume: { ...dead, approvalHash: 'f'.repeat(64) }, runJob: recordingRuns([{ outcome: 'green' }]),
  });
  const unclassified = classifyIncidents(seen).filter((o) => o.class === 'runtime-red' && /unclassified escalation/.test(o.detail));
  assert.deepEqual(unclassified, [], `a category outside the ledger's executable excluded-set is COUNTED, never dropped: ${JSON.stringify(seen.filter((e) => e.type === 'escalation').map((e) => e.category))}`);
});

// ── continuing ONE append-only log ──────────────────────────────────────────

test('the resumed process continues the spine\'s own sequence — `seq` is monotonic per SPINE, not per process', () => {
  const file = join(base, `seq-${n += 1}.jsonl`);
  const first = makeSpine(file);
  first('reuse-start', {});
  first('try-start', { n: 1 });
  const dead = readSpine(file);
  const second = makeSpine(file, { startSeq: dead.at(-1).seq });
  second('resume-start', {});
  const all = readSpine(file);
  assert.deepEqual(all.map((e) => e.seq), [1, 2, 3], 'a second series starting at 1 would give one log two rows with the same number');
});

// ── the patient tree under a resume ─────────────────────────────────────────

test('resume tree gate: a DIRTY tree is legitimate mid-run progress, and a moved HEAD is operator intervention', async () => {
  const { resumeTreeGate } = await import('../src/reuse.js');
  const seedSha = 'a'.repeat(40);
  assert.equal(resumeTreeGate({ head: seedSha, seed: seedSha, dirty: '' }).ok, true);
  assert.equal(resumeTreeGate({ head: seedSha, seed: seedSha, dirty: ' M src/x.ts\n' }).ok, true,
    'the dead tries\' work is REAL progress — a resume continues the tree as the run left it and never resets it');
  const moved = resumeTreeGate({ head: 'b'.repeat(40), seed: seedSha, dirty: '' });
  assert.equal(moved.ok, false, 'someone committed or rebased under the run — that is a stop, not a state to inherit');
  assert.match(moved.detail, /HEAD/);
});

// ── the RUNNER's resume gates (scripts/run-reuse.mjs), as a real process ────
//
// Every case below stops at (or immediately after) a gate — no paid run is involved,
// and no API key is read. The gates are the seam that matters: the number the operator
// types is compared HERE, and "is the dead process still alive" is a question only a
// real process can be asked. The full PAID resume path is validated live, exactly as
// run-reuse's own paid path is.

/** the reference runner, spawned, with the API key stripped @param {string[]} args */
const runner = (args, env = {}) => {
  const { ANTHROPIC_API_KEY: _drop, ...clean } = process.env;
  return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/run-reuse.mjs', import.meta.url)), ...args], {
    encoding: 'utf8', env: { ...clean, ...env },
  });
};

const LITECTX = JSON.parse(readFileSync(new URL('../jobs/litectx-u-types.json', import.meta.url), 'utf8'));
const U_ENVELOPE = { perTryBudgetUsd: 10, perTryWallMs: 2_700_000, bridgeTries: 2 };
const uArgs = (/** @type {string} */ dir, tries = '2') => ['--job', 'litectx-types', '--registry', dir, '--budget', '10', '--wall', '45', '--tries', tries];
const U_HASH = reuseSpecHash(resolveReuse(LITECTX, U_ENVELOPE));

/**
 * A dead spine for the REAL litectx job, killed mid-try — built by running the real
 * `runReuse` (so `reuse-start` carries the real signed hash), then truncated.
 * @returns {Promise<{file: string, dir: string}>}
 */
async function deadLitectxRun({ kill = (e) => e.type === 'worker-round', extraEvents = [] } = {}) {
  const dir = seed(BRIDGE('alpha'));
  const file = join(base, `u-spine-${n += 1}.jsonl`);
  await runReuse({
    job: LITECTX, approvals: [], registryDir: dir, envelope: U_ENVELOPE,
    patient: 'litectx-u', workdir: base, provider: picker(), runid: 'deadrun',
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    emit: makeSpine(file),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [1.5], spentUsd: 2 }]),
  });
  const events = readSpine(file);
  truncateTo(file, [...killedAfter(events, kill), ...extraEvents]);
  return { file, dir };
}

test('runner --resume: a spine that does not exist is a refusal, never a fresh run wearing a resume flag', async () => {
  const r = runner([...uArgs(freshRegistry()), '--resume', join(base, 'no-such-spine.jsonl')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no-such-spine\.jsonl/);
});

test('runner --resume: with no --approve it PREVIEWS the reconstruction — what completed, what restarts, on what remainder — and prints the hash to sign', async () => {
  const { file, dir } = await deadLitectxRun();
  const r = runner([...uArgs(dir), '--resume', file]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /RESUME/);
  assert.match(r.stdout, /restart/i);
  assert.match(r.stdout, /alpha/, 'the workflow the dead attempt was part-way through is named');
  assert.match(r.stdout, /\$1\.5/, 'the money already spent on that try is stated, never hidden');
  assert.match(r.stdout, new RegExp(`hash\\s+${U_HASH}`), 'the same one signature the fresh launch prints');
});

test('runner --resume: a hash signed for a DIFFERENT envelope is refused exactly like a stale fresh signature', async () => {
  const { file, dir } = await deadLitectxRun();
  const r = runner([...uArgs(dir), '--resume', file, '--approve', 'a'.repeat(64)]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /REFUSED/);
});

test('runner --resume: a spine signed under a different envelope than THIS one is refused with BOTH hashes printed', async () => {
  const { file, dir } = await deadLitectxRun();
  // the operator resumes with a different try count: the CURRENT hash matches what they
  // typed, but it is not the envelope the dead run was signed under
  const otherHash = reuseSpecHash(resolveReuse(LITECTX, { ...U_ENVELOPE, bridgeTries: 1 }));
  const r = runner([...uArgs(dir, '1'), '--resume', file, '--approve', otherHash]);
  assert.equal(r.status, 2);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, new RegExp(U_HASH), 'the envelope the dead run was signed under');
  assert.match(out, new RegExp(otherHash), 'and the one being offered now');
});

test('runner --resume: a run that reached its own terminal has nothing to resume', async () => {
  const { file, dir } = await deadLitectxRun({ kill: (e) => e.type === 'reuse-end' });
  const r = runner([...uArgs(dir), '--resume', file, '--approve', U_HASH]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nothing to resume|already/i);
});

test('runner --resume: a run whose process is STILL ALIVE is refused — resuming a live run would double-run it', async () => {
  // a real live process whose command line names this runner, so the liveness check is
  // exercised against a real pid rather than a mocked answer
  const live = spawn(process.execPath, ['-e', 'console.log("ready"); setInterval(() => {}, 1000);', 'run-reuse.mjs'], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise((res, rej) => { live.stdout.on('data', (b) => (String(b).includes('ready') ? res(null) : null)); live.on('error', rej); });
    const { file, dir } = await deadLitectxRun({
      extraEvents: [{ type: 'runner-start', pid: live.pid, seq: 9998, ts: new Date().toISOString() }],
    });
    const r = runner([...uArgs(dir), '--resume', file, '--approve', U_HASH]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /still (alive|running)/i);
    assert.match(r.stderr, new RegExp(String(live.pid)));
  } finally {
    live.kill('SIGKILL');
  }
});

test('runner --resume: a DEAD run\'s pid does not block it — the gates pass and the run stops at the missing key, which only a resume that got past every gate reaches', async () => {
  const gone = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  await new Promise((res) => gone.on('exit', res));
  const { file, dir } = await deadLitectxRun({
    extraEvents: [{ type: 'runner-start', pid: gone.pid, seq: 9998, ts: new Date().toISOString() }],
  });
  const r = runner([...uArgs(dir), '--resume', file, '--approve', U_HASH]);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /ANTHROPIC_API_KEY/);
});

test('resume: a killed run that had ALREADY finished its cold leg is EXHAUSTED — the resumed process must not buy a second cold draft', async () => {
  // the narrow but real window: the cold attempt returned and its row landed, and the
  // process died before the run's own terminal. Everything the envelope authorized is
  // spent; re-running the cold leg would pay a whole extra attempt for a run that has
  // no authorization left.
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 1 },
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2 },
    ]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'try-end' && e.mode === 'cold'));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('never'), closeStage: 'typecheck' }]);
  const { result } = await resumeOnto(file, {
    registryDir: dir, selectionProvider: picker(), runJob: runs,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 1 },
  });
  assert.equal(runs.calls.length, 0, 'nothing is authorized: the bridge try and the cold draft both already ran');
  assert.equal(result.outcome, 'escalated', 'the run keeps the verdict the killed run\'s cold leg actually earned');
  assert.equal(result.category, 'reuse-exhausted');
  assert.equal(result.tries.filter((t) => t.mode === 'cold').length, 1);
});

test('resume: a killed run whose cold leg had already GREENED comes back green — never a second paid draft over a finished job', async () => {
  const dir = freshRegistry();
  const { file, events } = await spineOf({
    registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 0 },
    runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('worked'), closeStage: 'typecheck', spentUsd: 2 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'try-end'));
  const runs = recordingRuns([{ outcome: 'green' }]);
  const { result } = await resumeOnto(file, {
    registryDir: dir, selectionProvider: picker(), runJob: runs,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 0 },
  });
  assert.equal(result.outcome, 'green');
  assert.equal(runs.calls.length, 0);
});

test('resume: a RESTART consumes its workflow whatever the seed says — the next try can never be handed the bridge this one is running', async () => {
  // the seed's `tried` list and the restart are two statements of the same fact, and a
  // resume must not depend on them agreeing: the try being restarted IS a spent pick.
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.2], spentUsd: 1 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round'));
  const dead = readResume(readSpine(file));

  const runs = recordingRuns([
    { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
    { outcome: 'green', plan: PLAN('second'), closeStage: 'typecheck', spentUsd: 1 },
  ]);
  const sel = picker({ choice: 'beta', reason: 'the other one' });
  await runReuse({
    job: JOB(), approvals: [], registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'litectx-u', workdir: base, provider: picker(), selectionProvider: sel,
    emit: makeSpine(file), runid: 'deadrun', runJob: runs,
    resume: { ...dead, tried: [] }, // a seed that forgot to say so
  });
  assert.equal(runs.calls[0].bridge.name, 'alpha', 'the restart');
  assert.doesNotMatch(sel.calls[0], /\[alpha\]/, 'and the try after it is never offered the workflow the restart is running');
});

test('resume: a COLD restart never re-opens the bridge loop, even with an untried workflow still on the shelf', async () => {
  // the killed run had already left the loop — by exhausting it or by the model saying
  // none matches — and that decision was made and paid for. Re-entering it would spend a
  // whole extra bridge try the dead run's own sequence had already moved past.
  const dir = seed(BRIDGE('alpha'), BRIDGE('untried'));
  const { file, events } = await spineOf({
    registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: null, reason: 'none of the rest match' }),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
      { outcome: 'escalated', closeStage: 'typecheck', rounds: [0.3], spentUsd: 2 },
    ]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.3));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('cold-restart'), closeStage: 'typecheck', spentUsd: 2 }]);
  const sel = picker({ choice: 'untried', reason: 'must never be asked' });
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: sel, runJob: runs });
  assert.equal(result.outcome, 'green');
  assert.equal(runs.calls.length, 1);
  assert.equal(runs.calls[0].bridge, null, 'the cold restart, and nothing else');
  assert.equal(sel.calls.length, 0, 'no further selection call: the loop was already left');
});

test('resume: when the RESTART cannot say what it spent, the dead attempt\'s known spend survives as a floor (F6)', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.4], spentUsd: 1 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 0.4));
  const dead = readResume(readSpine(file));

  const crash = async () => { throw new Error('the runner itself died again'); };
  const { result } = await resumeOnto(file, { registryDir: dir, selectionProvider: picker(), runJob: crash });
  assert.equal(result.tries[0].spentUsd, null, 'the try itself cannot say — unknown stays unknown');
  assert.equal(result.spendComplete, false);
  assert.ok(result.spentUsd >= dead.carrySpentUsd + 0.4,
    `but the $0.40 the dead attempt is KNOWN to have spent is still in the total (${result.spentUsd}) — dropping a known figure to keep the sum tidy is F6 pointing the other way`);
});

test('runner --resume: the preview counts the attempts the resumed run will ACTUALLY make, and the outside guard is armed from the SAME arithmetic', async () => {
  // caught by RENDERING the preview: the loop is already left when the cold leg is what
  // was killed, so "1 further workflow try of 2" both misstates what the signature buys
  // and (the same arithmetic) arms the guard for attempts that never come — F70's shape,
  // a guard that cannot fire before the run is long dead.
  //
  // The numbers are asserted EXACTLY. A "not obviously huge" assertion passed against
  // three different wrong arithmetics when this test was first written.
  const guardMin = (/** @type {string} */ out) => {
    const m = /armed for (\d+)min/.exec(out);
    assert.ok(m, `the preview must state what the guard is armed for:\n${out}`);
    return Number(m[1]);
  };

  // ── A. a COLD restart, 20 minutes of its wall already burned.
  // TWO tries authorized and only ONE spent, so "the loop was left" is the ONLY reason
  // the further-tries count can be zero — a fixture whose tries happen to be exhausted
  // cannot tell the two apart.
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const file = join(base, `u-cold-${n += 1}.jsonl`);
  await runReuse({
    job: LITECTX, approvals: [], registryDir: dir, envelope: U_ENVELOPE,
    patient: 'litectx-u', workdir: base, provider: picker(), runid: 'deadrun',
    // try 1 runs alpha; at try 2 the model says none of the rest match, so the loop is
    // LEFT with a try still authorized and the run falls through to the cold draft
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: null, reason: 'none of the rest match' }),
    emit: makeSpine(file),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', rounds: [1], spentUsd: 1 },
      { outcome: 'escalated', closeStage: 'typecheck', rounds: [2], spentUsd: 2 },
    ]),
  });
  const events = readSpine(file);
  const cut = killedAfter(events, (e) => e.type === 'worker-round' && e.costUsd === 2);
  truncateTo(file, cut);
  // the watchdog's own kill record: 20 minutes after the last event, which is when the
  // process really stopped — the runner folds THAT, not the last sign of life
  writeFileSync(`${file}.watchdog.json`, `${JSON.stringify({ watchdog: 'u-watchdog', reason: 'stale', killed: true, at: new Date(Date.parse(cut.at(-1).ts) + 20 * 60_000).toISOString() })}\n`);

  const r = runner([...uArgs(dir), '--resume', file]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /restart\s+try \d+ cold/, 'the cold leg is what restarts');
  assert.match(r.stdout, /0 further workflow tries/, 'and NOTHING follows it — the loop was left before the kill');
  assert.equal(guardMin(r.stdout), 25, 'one attempt, and only the 25min REMAINING of its wall — not 45, and not the whole envelope');

  // ── B. a BRIDGE restart with a try still authorized: restart + that try + the cold leg
  const dir2 = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const file2 = join(base, `u-bridge-${n += 1}.jsonl`);
  await runReuse({
    job: LITECTX, approvals: [], registryDir: dir2, envelope: U_ENVELOPE,
    patient: 'litectx-u', workdir: base, provider: picker(), runid: 'deadrun',
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    emit: makeSpine(file2),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [1], spentUsd: 1 }]),
  });
  truncateTo(file2, killedAfter(readSpine(file2), (e) => e.type === 'worker-round' && e.costUsd === 1));
  const r2 = runner([...uArgs(dir2), '--resume', file2]);
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stdout, /1 further workflow try of 2/);
  assert.equal(guardMin(r2.stdout), 135, 'the restart (whose wall is barely touched) + one more try + the cold draft');

  // ── C. the cold leg ALREADY RAN: nothing is authorized, and the guard knows it
  const dir3 = seed(BRIDGE('alpha'));
  const file3 = join(base, `u-done-${n += 1}.jsonl`);
  await runReuse({
    job: LITECTX, approvals: [], registryDir: dir3, envelope: { ...U_ENVELOPE, bridgeTries: 1 },
    patient: 'litectx-u', workdir: base, provider: picker(), runid: 'deadrun',
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    emit: makeSpine(file3),
    runJob: scriptedRuns([
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1 },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2 },
    ]),
  });
  truncateTo(file3, killedAfter(readSpine(file3), (e) => e.type === 'try-end' && e.mode === 'cold'));
  const r3 = runner([...uArgs(dir3, '1'), '--resume', file3]);
  assert.equal(r3.status, 0, r3.stderr);
  assert.match(r3.stdout, /nothing left to authorize/);
  // W-2 on the launch side: zero attempts is NOTHING TO ARM, never "armed for 0min" —
  // and never the wall's lever, because raising --wall buys no attempt here
  assert.match(r3.stdout, /NOTHING TO ARM — no attempt will run/, 'the guard line names the true zero');
  assert.doesNotMatch(r3.stdout, /armed for \d+min/, 'no armed-for banner on a run with nothing to fund');
  assert.doesNotMatch(r3.stdout, /raise --wall/, 'the wall is not the lever when the tries are what ran out');
});

// ── module C v2: the STEP-LEVEL checkpoint ──────────────────────────────────
//
// hamr's ruling supersedes the try-restart reading, verbatim: *"even if it gets killed by
// outside, it should allow resume and start last step instead from the beginning, why
// would i want to waste more money on something i already started, our goal is to find
// ways to save money and time"*.
//
// So the reader answers a finer question than "which try was open": WHERE in that try the
// kill landed. The fixtures below are recordings of the REAL executor — `runPlan`, a real
// spawned close, a scripted provider — replayed inside a real reuse try window and then
// truncated. A hand-authored event list can only contain the vocabulary its author
// remembered; this reader has to survive the vocabulary the executor actually writes.

/** a real patient: the close greens iff every named file exists (real spawned node) */
function patientDir(needs) {
  const wd = join(base, `patient-${n += 1}`);
  mkdirSync(join(wd, 'src'), { recursive: true });
  mkdirSync(join(wd, 'tests'), { recursive: true });
  writeFileSync(join(wd, 'close.mjs'), `import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const missing = ${JSON.stringify(needs)}.filter((p) => !existsSync(join(here, p)));
if (!missing.length) { console.log('all present'); process.exit(0); }
console.log('FAILED missing ' + missing.join(', ')); process.exit(1);
`);
  return wd;
}

const STEPJOB = (over = {}) => ({
  ...JOB(),
  job: 'plan-patient',
  writeScope: ['src/**', 'tests/**'],
  close: [{ name: 'files-present', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
  ...over,
});

const STEP_A = { id: 'seed-src', action: 'Write src/a.mjs.', tools: ['write'], rounds: 4, target: 'src/a.mjs', exit: [{ type: 'artifact-written', path: 'src/a.mjs' }] };
const STEP_B = { id: 'write-test', action: 'Write tests/test_x.mjs with an ok assertion.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] };
const TWO_STEP = { schema: 'plan-v1', steps: [STEP_A, STEP_B] };
const wcall = (id, path, content) => ({ toolCalls: [{ id, name: 'shell_write', arguments: { path, content } }] });

/** record a REAL plan flow: real executor, real spawned close, scripted provider */
async function recordFlow(wd, script, { job = STEPJOB(), capRuns = 3, resumeSeed } = {}) {
  const jv = validateJob(job, { shellCapUsd: job.budgetUsd });
  assert.deepEqual(jv.reds, [], 'the fixture job must be validateJob-green');
  /** @type {any[]} */
  const events = [];
  const outcome = await runPlan(jv.job, {
    workdir: wd,
    provider: scriptedProvider(script),
    emit: (/** @type {string} */ type, /** @type {any} */ data = {}) => { const e = { type, ...data }; events.push(e); return e; },
    remainingUsd: () => 5,
    capRuns,
    ...(resumeSeed ? { resumeSeed } : {}),
  });
  return { events, outcome };
}

/** a runJob stand-in that REPLAYS a recorded real flow into the try's own emitter */
const replayRun = (recorded, outcome) => async (/** @type {any} */ _spec, /** @type {any} */ opts) => {
  for (const { type, ...data } of recorded) opts.emit(type, data);
  opts.emit('job-end', { outcome, spentUsd: 2, spendComplete: true });
  return outcome;
};

/** a full reuse spine whose single COLD try is a recorded real plan flow */
async function spineOfFlow(recorded, outcome = 'green') {
  const file = join(base, `flow-${n += 1}.jsonl`);
  await runReuse({
    job: JOB(), approvals: [], registryDir: seed(BRIDGE('alpha')),
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 0 },
    patient: 'litectx-u', workdir: base, provider: picker(), emit: makeSpine(file), runid: 'deadrun',
    runJob: replayRun(recorded, outcome),
  });
  return { file, events: readSpine(file) };
}

/** the green two-step flow every step-level fixture is cut out of */
const twoStepScript = (wd) => [
  { text: 'src/ is empty and tests/ has nothing yet — two files are needed.' },
  { text: JSON.stringify(TWO_STEP) },
  wcall('a', join(wd, 'src', 'a.mjs'), 'export const a = 1;\n'),
  { text: 'wrote src/a.mjs' },
  wcall('b', join(wd, 'tests', 'test_x.mjs'), 'ok — asserts a\n'),
  { text: 'wrote tests/test_x.mjs' },
];

test('checkpoint: a kill DURING a step reconstructs the accepted plan and the steps that finished — the finest checkpoint the spine can prove, not the try\'s beginning', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  assert.equal(flow.outcome, 'green', 'the fixture must be a real, complete flow before it is cut');
  const { events } = await spineOfFlow(flow.events);

  const r = readResume(killedAfter(events, (e) => e.type === 'step-start' && e.step === 'write-test'));
  assert.ok(r.restart, 'the try was mid-flight');
  const s = r.restart.seed;
  assert.ok(s, 'and it carries a step-level seed — a try-level restart would re-pay the scout, the draft AND step 1');
  assert.equal(s.phase, 'steps');
  assert.deepEqual(s.plan.steps.map((/** @type {any} */ x) => x.id), ['seed-src', 'write-test'], 'the plan is the one the dead run ACCEPTED, read off its own plan-accepted');
  assert.deepEqual(s.completedSteps.map((/** @type {any} */ c) => c.id), ['seed-src']);
  assert.equal(s.completedSteps[0].by, 'step-end');
  const proof = events.find((e) => e.type === 'step-end' && e.step === 'seed-src');
  assert.equal(s.completedSteps[0].seq, proof.seq, 'the seed names the spine event that PROVES the completion');
});

test('checkpoint: a kill BETWEEN two steps counts the one that finished and NOT the one that never started', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const { events } = await spineOfFlow(flow.events);

  const cut = killedAfter(events, (e) => e.type === 'step-end' && e.step === 'seed-src');
  assert.ok(!cut.some((e) => e.type === 'step-start' && e.step === 'write-test'), 'the fixture really is cut between the two steps');
  const s = readResume(cut).restart.seed;
  assert.deepEqual(s.completedSteps.map((/** @type {any} */ c) => c.id), ['seed-src'],
    'a step with no start of its own is not complete — inferring it would skip work nobody did');
  assert.equal(s.phase, 'steps');
});

test('checkpoint: a kill in the CLOSE-FIX loop reports phase close — every step is done, and what remains is the close (which re-runs for no tokens)', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs', 'src/fix.mjs']);
  const flow = await recordFlow(wd, [
    ...twoStepScript(wd),
    wcall('f', join(wd, 'src', 'fix.mjs'), 'export const fixed = true;\n'),
    { text: 'fixed the close' },
  ]);
  assert.equal(flow.outcome, 'green');
  assert.ok(flow.events.some((e) => e.type === 'fix-loop'), 'the fixture really reached the close-fix loop');
  const { events } = await spineOfFlow(flow.events);

  const s = readResume(killedAfter(events, (e) => e.type === 'fix-loop')).restart.seed;
  assert.equal(s.phase, 'close');
  assert.deepEqual(s.completedSteps.map((/** @type {any} */ c) => c.id), ['seed-src', 'write-test'],
    'every step is complete: the resume skips them all and continues fixing');
});

test('checkpoint: a kill BEFORE any plan was accepted has no seed at all — the scout/draft death restarts the try, exactly as it always did', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const { events } = await spineOfFlow(flow.events);

  const cut = killedAfter(events, (e) => e.type === 'scout-result');
  assert.ok(!cut.some((e) => e.type === 'plan-accepted'), 'the fixture is cut before a plan existed');
  const r = readResume(cut);
  assert.ok(r.restart, 'the try still restarts');
  assert.equal(r.restart.seed, null, 'with nothing to reload — no plan was ever accepted, so nothing paid is re-payable');
});

test('checkpoint: a resume OF a resume reads step-skipped as completion evidence — otherwise the second kill re-pays for what the first resume already skipped', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  // the FIRST resume: a real flow driven by a seed, so the spine carries the executor's
  // own `step-skipped` records rather than `step-end` ones for the inherited step
  const resumed = await recordFlow(wd, [
    wcall('b', join(wd, 'tests', 'test_x.mjs'), 'ok\n'),
    { text: 'wrote the test' },
  ], { resumeSeed: { phase: 'steps', plan: TWO_STEP, completedSteps: [{ id: 'seed-src', seq: 11, by: 'step-end' }] } });
  assert.ok(resumed.events.some((e) => e.type === 'step-skipped'), 'the fixture is a real resumed leg');
  const { events } = await spineOfFlow(resumed.events);

  const s = readResume(killedAfter(events, (e) => e.type === 'step-start' && e.step === 'write-test')).restart.seed;
  assert.deepEqual(s.completedSteps.map((/** @type {any} */ c) => c.id), ['seed-src'],
    'a step SKIPPED by the previous resume is still a completed step — reading only step-end would re-run it and pay for it twice');
  assert.equal(s.completedSteps[0].by, 'step-skipped', 'and the evidence names which kind of record proved it');
  assert.deepEqual(s.plan.steps.map((/** @type {any} */ x) => x.id), ['seed-src', 'write-test']);
});

test('checkpoint: after a REPLAN the plan to reload is the LAST accepted one, and the greens under the abandoned plan do not count', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const planB = { schema: 'plan-v1', steps: [{ ...STEP_B, id: 'second-go' }] };
  const flow = await recordFlow(wd, [
    { text: 'scout notes' },
    { text: JSON.stringify(TWO_STEP) },
    wcall('a', join(wd, 'src', 'a.mjs'), 'export const a = 1;\n'),
    { text: 'wrote src/a.mjs' },
    { text: 'attempt 1 — writes nothing' },
    { text: 'attempt 2 — writes nothing' },
    { text: JSON.stringify(planB) },
    wcall('b', join(wd, 'tests', 'test_x.mjs'), 'ok\n'),
    { text: 'wrote the test' },
  ], { capRuns: 2 });
  assert.ok(flow.events.some((e) => e.type === 'replan'), 'the fixture really replanned');
  const { events } = await spineOfFlow(flow.events);

  const s = readResume(killedAfter(events, (e) => e.type === 'step-start' && e.step === 'second-go')).restart.seed;
  assert.deepEqual(s.plan.steps.map((/** @type {any} */ x) => x.id), ['second-go'], 'the LAST accepted plan is the one that was running');
  assert.deepEqual(s.completedSteps, [],
    'and seed-src\'s green belongs to the plan the replan ABANDONED — carrying it over would skip a step of a plan nobody has executed');
});

test('resume end to end: the restarted try RELOADS the plan and re-pays for nothing that finished — not the scout, not the draft, not the completed step (real runJob)', async () => {
  // the whole chain on the real runner: readResume → runReuse → runJob → runPlan. The
  // scripted provider is the one legitimate seam; the close, the plan flow, the ledger
  // and the registry write are all real.
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const job = STEPJOB();
  const envelope = { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 0 };
  const approvals = [{ specHash: jobSpecHash({ ...job, budgetUsd: 5, maxWallMs: 1_800_000 }), signer: 'hamr', ts: '2026-08-02T00:00:00Z' }];
  const dir = freshRegistry();
  const file = join(base, `chain-${n += 1}.jsonl`);

  // ── the run that gets killed: it drafts, finishes step 1, and dies inside step 2
  const cold = scriptedProvider(twoStepScript(wd));
  await runReuse({
    job, approvals, registryDir: dir, envelope, patient: 'litectx-u', workdir: wd,
    provider: cold, emit: makeSpine(file), runid: 'deadrun',
  });
  const full = readSpine(file);
  assert.ok(full.some((e) => e.type === 'try-end' && e.runOutcome === 'green'), `the fixture run must really green: ${full.filter((e) => e.type === 'escalation').map((e) => e.category)}`);
  const paidCold = cold.calls.length;
  assert.ok(paidCold >= 6, `the cold run paid for a scout, a draft and two steps (${paidCold} calls)`);
  truncateTo(file, killedAfter(full, (e) => e.type === 'step-start' && e.step === 'write-test'));
  // the tree as the kill left it: step 1's file landed, step 2's never did
  rmSync(join(wd, 'tests', 'test_x.mjs'));
  assert.equal(existsSync(join(wd, 'src', 'a.mjs')), true, 'the completed step\'s work is on disk — that is what makes skipping it honest');

  // ── the resume
  const dead = readResume(readSpine(file));
  const worker = scriptedProvider([
    wcall('b', join(wd, 'tests', 'test_x.mjs'), 'ok — asserts a\n'),
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const result = await runReuse({
    job, approvals, registryDir: dir, envelope, patient: 'litectx-u', workdir: wd,
    provider: worker, emit: makeSpine(file), runid: 'deadrun', resume: dead,
  });

  assert.equal(result.outcome, 'green');
  assert.equal(worker.calls.length, 2, `the resumed leg paid for ONE step and nothing else (${worker.calls.length} calls vs ${paidCold} cold) — the scout, the draft and step 1 are not re-bought`);
  const resumedLeg = readSpine(file).slice(full.findIndex((e) => e.type === 'step-start' && e.step === 'write-test'));
  assert.ok(!resumedLeg.some((e) => e.type === 'scout-start'), 'no second scout');
  assert.ok(resumedLeg.some((e) => e.type === 'scout-skipped'), 'and the skip is on the record');
  assert.ok(!resumedLeg.some((e) => e.type === 'plan-validate'), 'no second draft');
  assert.deepEqual(resumedLeg.filter((e) => e.type === 'step-skipped').map((e) => e.step), ['seed-src']);
  assert.ok(resumedLeg.some((e) => e.type === 'step-start' && e.step === 'write-test'), 'the in-flight step runs fresh');

  // R1 honesty: the green mints from the plan AS EXECUTED, which on a resumed leg is the
  // RELOADED plan — a leg that greened without emitting one would mint nothing at all
  const write = result.bridgeWrites.at(-1);
  assert.notEqual(write.action, 'none', `the green wrote its bridge version: ${JSON.stringify(write.reds ?? [])}`);
  const minted = JSON.parse(readFileSync(write.file, 'utf8'));
  assert.deepEqual(minted.versions.at(-1).plan.steps.map((/** @type {any} */ s) => s.id), ['seed-src', 'write-test'],
    'and the version it mints is the whole plan the try executed across both legs');

  // and the money is still the WHOLE try, both attempts (unchanged from v1)
  const row = result.tries.at(-1);
  assert.equal(row.restarted, true);
  assert.ok(row.spentUsd >= row.priorSpentUsd, `the row states the try's whole spend (${row.spentUsd}), never the restart's alone`);
});

test('runner --resume: the preview says WHERE it resumes — the step it restarts at, what will NOT be re-paid, and the money left', async () => {
  // caught by RENDERING again: the operator signs a hash that authorizes real dollars,
  // and "resuming try 1" says nothing about whether that means re-drafting from scratch
  // or picking up at the last step. The two cost very different amounts.
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs', 'src/fix.mjs']);
  const flow = await recordFlow(wd, [
    ...twoStepScript(wd),
    wcall('f', join(wd, 'src', 'fix.mjs'), 'export const fixed = true;\n'),
    { text: 'fixed the close' },
  ]);
  assert.equal(flow.outcome, 'green');

  /** the real flow, replayed inside a real litectx-job try window, then cut */
  const deadAt = async (pred) => {
    const dir = seed(BRIDGE('alpha'));
    const file = join(base, `u-steps-${n += 1}.jsonl`);
    await runReuse({
      job: LITECTX, approvals: [], registryDir: dir, envelope: U_ENVELOPE,
      patient: 'litectx-u', workdir: base, provider: picker(), runid: 'deadrun',
      selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
      emit: makeSpine(file), runJob: replayRun(flow.events, 'green'),
    });
    truncateTo(file, killedAfter(readSpine(file), pred));
    return { file, dir };
  };

  // ── A. killed inside step 2 of 2
  const a = await deadAt((e) => e.type === 'step-start' && e.step === 'write-test');
  const ra = runner([...uArgs(a.dir), '--resume', a.file]);
  assert.equal(ra.status, 0, ra.stderr);
  assert.match(ra.stdout, /step 2 of 2 "write-test"/, 'the operator is told the exact step the run picks up at');
  assert.match(ra.stdout, /1 step[^\n]*SKIPPED|SKIPPED[^\n]*1 step/i, 'and that one finished step will not be re-paid');
  assert.match(ra.stdout, /no re-?scout|not re-?scout/i, 'the scout and the draft are named as things this resume does not buy again');
  assert.match(ra.stdout, /\$\d+\.\d+ .*remain/i, 'with the money that is actually left for the try');

  // ── B. killed inside the close-fix loop: every step is done
  const b = await deadAt((e) => e.type === 'fix-loop');
  const rb = runner([...uArgs(b.dir), '--resume', b.file]);
  assert.equal(rb.status, 0, rb.stderr);
  assert.match(rb.stdout, /close/i);
  assert.match(rb.stdout, /2 steps? (are |already )?(done|complete)/i, 'all of them skipped — the close is what remains');
  assert.doesNotMatch(rb.stdout, /step 1 of 2|step 2 of 2/, 'it does not claim to restart at a step when no step is left to run');

  // ── C. killed before a plan existed: the honest reading is the try's beginning
  const c = await deadAt((e) => e.type === 'scout-result');
  const rc = runner([...uArgs(c.dir), '--resume', c.file]);
  assert.equal(rc.status, 0, rc.stderr);
  assert.match(rc.stdout, /beginning of the try/i);
  assert.match(rc.stdout, /no plan was accepted|nothing paid is re-?payable/i, 'and it says why — never a silent full restart dressed as a checkpoint');
});

test('checkpoint: a resume that dies BEFORE accepting its reloaded plan reaches back through the abandoned attempt — the real msc6w93z leg-3 shape', async () => {
  // The real killed run: leg 2 finished all three steps and died in the close-fix loop;
  // leg 3 restarted, spent its close precheck, and died in the redraft. Reading only the
  // OPEN window there says "no plan was accepted" and throws away a checkpoint leg 2
  // paid $8.18 for. The window is abandoned; the WORK it proved is not.
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const { events } = await spineOfFlow(flow.events);
  const dead = killedAfter(events, (e) => e.type === 'step-start' && e.step === 'write-test');
  const ts = dead.at(-1).ts;

  // the next attempt: it declares its fold and dies during the close precheck, before
  // any plan of its own was accepted
  const secondLeg = [
    ...dead,
    { type: 'try-start', n: 1, mode: 'cold', bridge: null, priorSpentUsd: 2, priorWallMs: 60_000, ts, seq: 9001 },
    { type: 'close-precheck', verdict: 'needs_revision', stage: 'files-present', ts, seq: 9002 },
  ];
  const r = readResume(secondLeg);
  assert.ok(r.restart, 'the try is still mid-flight');
  const s = r.restart.seed;
  assert.ok(s, 'the checkpoint survives an attempt that died before it could re-accept the plan');
  assert.deepEqual(s.plan.steps.map((/** @type {any} */ x) => x.id), ['seed-src', 'write-test']);
  assert.deepEqual(s.completedSteps.map((/** @type {any} */ c) => c.id), ['seed-src']);
  const pa = dead.find((e) => e.type === 'plan-accepted');
  assert.equal(s.planSeq, pa.seq, 'and it names the plan-accepted it was read from, so the reach-back is traceable');

  // but only for the SAME try: a checkpoint belongs to the attempt that earned it
  const otherTry = [
    ...dead,
    { type: 'try-start', n: 2, mode: 'cold', bridge: null, ts, seq: 9001 },
  ];
  assert.equal(readResume(otherTry).restart.seed, null,
    'try 2 inherits nothing from try 1 — reaching a plan across tries would run one try\'s workflow as another\'s');
});

test('checkpoint: a step that FAILED its exits is NOT a completed step — only a satisfied exit licenses a skip', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const planB = { schema: 'plan-v1', steps: [{ ...STEP_B, id: 'second-go' }] };
  const flow = await recordFlow(wd, [
    { text: 'scout notes' },
    { text: JSON.stringify(TWO_STEP) },
    wcall('a', join(wd, 'src', 'a.mjs'), 'export const a = 1;\n'),
    { text: 'wrote src/a.mjs' },
    { text: 'attempt 1 — writes nothing' },
    { text: 'attempt 2 — writes nothing' },
    { text: JSON.stringify(planB) },
    wcall('b', join(wd, 'tests', 'test_x.mjs'), 'ok\n'),
    { text: 'wrote the test' },
  ], { capRuns: 2 });
  const { events } = await spineOfFlow(flow.events);

  // the kill lands after the step EXHAUSTED its attempts and before the replan drafted:
  // its step-end is on the spine, and its outcome is not green
  const cut = killedAfter(events, (e) => e.type === 'step-end' && e.step === 'write-test');
  assert.notEqual(cut.at(-1).outcome, 'green', 'the fixture really did record a failed step-end');
  const s = readResume(cut).restart.seed;
  assert.deepEqual(s.completedSteps.map((/** @type {any} */ c) => c.id), ['seed-src'],
    'a step-end is not a completion — a red one names work still to do, and skipping it would hand the close a step nobody finished');
});

// ── tail-review F-1..F-4 (2026-08-03): the cold-completed loop hole and three belts ──

test('resume: a COMPLETED cold leg closes the bridge loop — tries still authorized by COUNT are not bought after it (tail-review F-1)', async () => {
  // the reviewer's repro: --tries 2, the model says none-matches at try 1, so the cold
  // leg runs AS try 1 and completes; the kill lands between its try-end and reuse-end.
  // The dead run left the loop EARLY — by decision, not by count — so a resume that
  // re-derives startN from try numbers alone re-enters the loop and buys a paid bridge
  // try the signed preview said would not happen (and a bridge try AFTER the cold leg is
  // a semantic inversion a fresh run can never produce).
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    selectionProvider: picker({ choice: null, reason: 'none matches' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'try-end' && e.mode === 'cold'));

  const runs = recordingRuns([{ outcome: 'green', plan: PLAN('never'), closeStage: 'typecheck' }]);
  const sel = picker({ choice: 'alpha', reason: 'would buy an unauthorized try' });
  const { result } = await resumeOnto(file, {
    registryDir: dir, selectionProvider: sel, runJob: runs,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
  });
  assert.equal(sel.calls.length, 0, 'no selection call — the dead run already decided cold, and that decision is inherited');
  assert.equal(runs.calls.length, 0, 'nothing is re-run: the cold leg completed, so the run has nothing left to authorize');
  assert.equal(result.category, 'reuse-exhausted');
  assert.equal(result.outcome, 'escalated', 'the run keeps the verdict the killed run\'s cold leg actually earned');
});

test('resume: a seed with NO approval hash is refused — a pre-hash spine never rides through the signature gate (tail-review F-2)', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.2], spentUsd: 1 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'worker-round'));
  const dead = readResume(readSpine(file));

  const runs = recordingRuns([{ outcome: 'green' }]);
  const result = await runReuse({
    job: JOB(), approvals: [], registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'litectx-u', workdir: base, provider: picker(), selectionProvider: picker(),
    emit: makeSpine(file), runid: 'deadrun', runJob: runs,
    resume: { ...dead, approvalHash: null }, // a spine written before the hash scheme
  });
  assert.equal(result.category, 'resume-red', 'a missing hash is a refusal, not a pass — signed specs are never silently re-validated');
  assert.equal(runs.calls.length, 0);
});

test('resume: an inherited try whose wall is UNKNOWN reports wall UNKNOWN — never 0.0min (F6 extends to time; tail-review F-3)', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    selectionProvider: picker({ choice: null, reason: 'none matches' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2 }]),
  });
  truncateTo(file, killedAfter(events, (e) => e.type === 'try-end' && e.mode === 'cold'));
  const dead = readResume(readSpine(file));

  const result = await runReuse({
    job: JOB(), approvals: [], registryDir: dir,
    envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 2 },
    patient: 'litectx-u', workdir: base, provider: picker(), selectionProvider: picker(),
    emit: makeSpine(file), runid: 'deadrun', runJob: recordingRuns([{ outcome: 'green' }]),
    // the graded-but-unrecorded reconstruction hands back wallMs: null when the death
    // instant is unknowable — model that row as the reader would produce it
    resume: { ...dead, completed: dead.completed.map((t) => ({ ...t, wallMs: null })) },
  });
  assert.equal(result.category, 'reuse-exhausted');
  assert.match(result.detail, /wall UNKNOWN/, 'an unknown duration is reported as unknown');
  assert.doesNotMatch(result.detail, /0\.0min of/, 'never rendered as 0 (hamr\'s F6-time ruling)');
});

test('readResume: a NEGATIVE declared fold on the dead spine clamps to $0 — a corrupt prior can never hand the restart a fuller cap than it earned (tail-review F-4)', async () => {
  const dir = seed(BRIDGE('alpha'));
  const { file, events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    runJob: scriptedRuns([{ outcome: 'escalated', closeStage: 'typecheck', rounds: [0.2], spentUsd: 1 }]),
  });
  const cut = killedAfter(events, (e) => e.type === 'worker-round')
    .map((e) => (e.type === 'try-start' ? { ...e, priorSpentUsd: -3, priorWallMs: -60_000 } : e));
  const dead = readResume(cut);
  // the window's own round ($0.20) still counts — the discriminating claim is that the
  // NEGATIVE declared fold contributed $0, not −$3 (pre-fix this read −$2.80 and the
  // remainder arithmetic would have widened the signed cap)
  assert.equal(dead.restart.priorSpentUsd, 0.2, 'a negative declared money fold contributes $0, exactly like the four sibling fold sites');
  assert.ok(dead.restart.priorWallMs >= 0, 'a negative declared wall fold can never drag the measured wall below zero');
});

// ══ PRD v1.46 §3 — CAP-HALT RESUME ON THE DIRECT (U) PATH ════════════════════
//
// Kill-resume existed (module C above) and W-2 gave the wall a decision-ready
// pause, but a MONEY cap-halt — the case hamr's original "why would i want to
// waste more money on something i already started" ruling was actually about —
// fell between them: this reader classed any landed `job-end` as COMPLETE, and a
// direct runJob spine has no try window for it to read at all.
//
// Both gaps close as OPTIONS on the ONE reader, never a second one, and both
// default OFF so the reuse loop's graded-row semantics are byte-unchanged:
//   `direct`             — read a plain runJob spine as a single implicit try.
//   `resumableOutcomes`  — a landed job-end with one of these outcomes is a
//                          RESTART (resumable on a top-up), not a completed row.

/** A DIRECT runJob spine: a REAL recorded plan flow wrapped in the two records
 * run.js itself puts around one. The body is the executor's own vocabulary (the
 * reason this file refuses hand-authored fixtures); only the wrapper is authored,
 * and only because runJob's ledger — not the plan flow — emits it.
 * @param {any[]} flow @param {{outcome: string, spentUsd?: number, prior?: number}} o */
const directSpine = (flow, { outcome, spentUsd = 2.5, prior }) => [
  {
    type: 'job-start', job: 'plan-patient', specHash: 'h1', budgetUsd: 5, shape: 'plan', goal: 'g',
    ...(prior === undefined ? {} : { priorSpentUsd: prior, priorSpendComplete: true }),
    ts: '2026-08-04T10:00:00.000Z', seq: 1,
  },
  ...flow.map((e, i) => ({ ...e, seq: i + 2 })),
  { type: 'job-end', outcome, spentUsd, spendComplete: true, ts: '2026-08-04T10:20:00.000Z', seq: flow.length + 2 },
];

test('§3 a DIRECT runJob spine reads back through the SAME reader — one implicit try, opened at job-start', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const events = directSpine(flow.events, { outcome: 'cap-halt' });
  const r = readResume(events, { direct: true, resumableOutcomes: ['cap-halt'] });
  assert.equal(r.started, true, 'a direct spine is a run this reader can continue');
  assert.ok(r.restart, 'and the money cut left something to continue');
  assert.equal(r.endOutcome, 'cap-halt', 'the terminal it stopped on is named');
});

test('§3 a landed job-end whose outcome is a MONEY cap-halt is RESUMABLE-on-top-up, with the checkpoint the steps already earned', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const r = readResume(directSpine(flow.events, { outcome: 'cap-halt' }), { direct: true, resumableOutcomes: ['cap-halt', 'wall-halt'] });
  assert.equal(r.completed.length, 0, 'a cap-halt is a CHECKPOINT, not a graded row — the run never reached a verdict it was asked for');
  const s = r.restart.seed;
  assert.ok(s, 'the plan it accepted and the steps it finished are the checkpoint');
  assert.equal(s.phase, 'close', 'both steps landed, so the resume re-enters at the close and its fix loop');
  assert.deepEqual(s.completedSteps.map((/** @type {any} */ c) => c.id), ['seed-src', 'write-test']);
});

test('§3 the fold is the dead run\'s OWN priced rounds — the ceiling never silently widens', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const rounds = flow.events.filter((e) => e.type === 'worker-round' && typeof e.costUsd === 'number');
  assert.ok(rounds.length > 0, 'the recorded flow really did buy priced rounds — otherwise this test proves nothing');
  const summed = rounds.reduce((a, e) => a + e.costUsd, 0);
  const r = readResume(directSpine(flow.events, { outcome: 'cap-halt' }), { direct: true, resumableOutcomes: ['cap-halt'] });
  assert.ok(Math.abs(r.restart.priorSpentUsd - summed) < 1e-9, `the fold is the summed worker-rounds (${summed}), never a re-derivation`);
  assert.equal(r.restart.priorSpendComplete, true);
  assert.ok(r.restart.priorWallMs > 0, 'and the wall it already burned rides with it');
});

test('§3 a resume OF a resume adds only its NEW rounds — job-start declares the fold it inherited', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const summed = flow.events.filter((e) => e.type === 'worker-round' && typeof e.costUsd === 'number').reduce((a, e) => a + e.costUsd, 0);
  const r = readResume(directSpine(flow.events, { outcome: 'cap-halt', prior: 3.5 }), { direct: true, resumableOutcomes: ['cap-halt'] });
  assert.ok(Math.abs(r.restart.priorSpentUsd - (3.5 + summed)) < 1e-9,
    're-deriving from the whole file would bill the first attempt twice; the declared fold is what makes a chain of resumes honest');
});

test('§3 a GREEN or ESCALATED job-end stays NON-resumable even under the option — a verdict already rendered is never re-bought', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  for (const outcome of ['green', 'escalated', 'step-red', 'provider-red']) {
    const r = readResume(directSpine(flow.events, { outcome }), { direct: true, resumableOutcomes: ['cap-halt', 'wall-halt'] });
    assert.equal(r.restart, null, `${outcome} must not become a restart`);
    assert.equal(r.completed.length, 1, `${outcome} is a graded row`);
  }
});

test('§3 CONTROL: both options are OFF by default — a bare runJob spine still refuses, and a reuse try graded cap-halt still keeps its row', async () => {
  const wd = patientDir(['src/a.mjs', 'tests/test_x.mjs']);
  const flow = await recordFlow(wd, twoStepScript(wd));
  const bare = readResume(directSpine(flow.events, { outcome: 'cap-halt' }));
  assert.equal(bare.started, false, 'no reuse-start and no opt-in: not a reuse run, and it says so rather than guessing');
  assert.equal(bare.restart, null);
  assert.equal(bare.completed.length, 0);

  // the reuse path itself: a try that cap-halted and whose row landed is COMPLETE,
  // exactly as before — the amendment must not rewrite the reuse loop's semantics
  const { events } = await spineOfFlow(flow.events, 'cap-halt');
  const reuse = readResume(killedAfter(events, (e) => e.type === 'job-end'));
  assert.equal(reuse.restart, null, 'the reuse loop grades a cap-halted try and moves on — unchanged');
  assert.equal(reuse.completed.length, 1);
});

test('§3 the reuse restart hands runJob whether its fold was EXACT — a floor that stops at the seam is F6 laundered one function call later', async () => {
  // `readResume` already computes `restart.priorSpendComplete` and `runReuse` already
  // records it on `try-start`, but it stopped there: the value never reached `runJob`,
  // whose `job-end` is what `readTry` reads the row's own `spendComplete` off. So a
  // restart of an attempt whose spend was only PARTLY priced came back looking exact.
  // The same one-way flag now exists on `runJob`, so the seam is closed rather than
  // recorded-and-dropped.
  const dir = seed(BRIDGE('alpha'));
  const { file } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }),
    // an UNPRICED round inside the try: readResume marks the fold incomplete
    runJob: scriptedRuns([{ outcome: 'green', rounds: [0.4, null], closeStage: 'typecheck' }]),
  });
  const cut = readSpine(file);
  truncateTo(file, cut.slice(0, cut.findIndex((e) => e.type === 'job-end')));
  const dead = readResume(readSpine(file));
  assert.equal(dead.restart?.priorSpendComplete, false, 'the fixture really did leave an unpriced round, or this test proves nothing');

  /** @type {any[]} */
  const seenOpts = [];
  await resumeOnto(file, {
    registryDir: dir,
    selectionProvider: picker({ choice: null, reason: 'none' }),
    runJob: async (/** @type {any} */ _s, /** @type {any} */ opts) => {
      seenOpts.push(opts);
      opts.emit('job-end', { outcome: 'escalated', spentUsd: 1, spendComplete: true });
      return 'escalated';
    },
  });
  assert.ok(seenOpts.length > 0, 'the restart really ran');
  assert.equal(seenOpts[0].priorSpentUsd, dead.restart.priorSpentUsd);
  assert.equal(seenOpts[0].priorSpendComplete, false,
    'the unknown travels WITH the money it qualifies — a fold reported exact one call later is the same F6, just moved');
});

// ══ PRD v1.46 §2+§3 — THE MONEY-PAUSE CYCLE, END TO END ══════════════════════
//
// The two halves above are each tested on their own: §2 gives a drained wallet a
// decision-ready `money-halt` (tests/planrun.test.js), and §3 lets `readResume`
// read a landed cap-halt as a CHECKPOINT rather than a graded row. What neither
// covers is the thing hamr actually asked for — the WHOLE cycle, through the real
// `runJob`:
//
//   leg 1 runs out of money mid-fix-loop and PAUSES on the grade it already has
//     → `readResume` reads that pause off leg 1's own spine
//       → the operator tops up (a re-signed spec) and hands the fold + the
//          checkpoint back to `runJob`
//         → leg 2 re-enters AT the checkpoint and greens, for the remainder.
//
// Everything below is real except the LLM: a real `runJob` (approval gate, smoke,
// the ONE ledger), a real plan flow, real spawned closes, a real spine file read
// back with the shipped reader. The provider is scripted — the shell-owned seam —
// and it PRICES its rounds, because the wallet is the instrument under test: a
// hand-injected `remainingUsd` would prove the readout fires, never that the money
// arithmetic that fires it is right.

/** the cycle's patient: two real close stages over ONE file.
 *  `clean-run` greens on an `ok` assertion (the step's own in-run ruler);
 *  `verdict` counts the requirements still missing, so its red line carries a
 *  NUMBER and the per-stage trend has something to compare. */
function cyclePatient() {
  const wd = join(base, `cycle-${n += 1}`);
  mkdirSync(join(wd, 'tests'), { recursive: true });
  mkdirSync(join(wd, 'src'), { recursive: true });
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  writeFileSync(join(wd, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('suite: 1 passed'); process.exit(0); }
console.log('FAILED red: test file missing or has no ok assertion'); process.exit(1);
`);
  writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
const missing = ['A','B','C'].filter((k) => !t.includes(k));
if (missing.length === 0) process.exit(0);
console.log(\`FAILED red: \${missing.length} requirement(s) missing\`); process.exit(1);
`);
  return wd;
}

const CYCLEJOB = (over = {}) => ({
  schema: 'job-v1',
  job: 'money-cycle',
  description: 'a plan-shape job whose wallet runs out inside the close-fix loop',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs meeting every requirement the verdict names.',
  verdictType: 'green',
  close: [
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' },
  ],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const CYCLE_PLAN = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-test', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 6,
    target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  }],
});

const cwrite = (wd, tag, content, costUsd) => ({
  toolCalls: [{ id: tag, name: 'shell_write', arguments: { path: join(wd, 'tests', 'test_x.mjs'), content } }],
  costUsd,
});
const approveJob = (job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];

/**
 * LEG 1: a real `runJob` whose $1.50 wallet drains INSIDE the close-fix loop, one
 * fix attempt after the close's own number improved (2 requirements missing → 1).
 *
 * The drain is priced, not injected: the fix-1 rounds cost $0.73 each, which lands
 * the ledger exactly on the signed budget, so the NEXT fix worker is built against
 * an empty wallet and its second round trips the gate. The last tape entry is never
 * bought — a tape that could keep answering would leave the stop ambiguous.
 * @param {string} wd @param {object} [over] extra runJob opts (the fold, for a chain)
 */
async function moneyLeg1(wd, over = {}) {
  const job = CYCLEJOB();
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty.', costUsd: 0.01 },  // scout
    { text: CYCLE_PLAN, costUsd: 0.01 },                                  // draft
    cwrite(wd, 't1', 'ok A\n', 0.01),                                     // the STEP
    { text: 'wrote the test', costUsd: 0.01 },
    cwrite(wd, 't2', 'ok A B\n', 0.73),                                   // fix 1: 2 → 1 missing
    { text: 'fix 1', costUsd: 0.73 },
    cwrite(wd, 't3', 'ok A B\n', 0.02),                                   // fix 2: the wallet is empty
    { text: 'never bought', costUsd: 0.5 },
  ]);
  const file = join(wd, 'spine-leg1.jsonl');
  const outcome = await runJob(job, {
    approvals: approveJob(job), workdir: wd, provider, emit: makeSpine(file), ...over,
  });
  return { job, outcome, file, provider, events: readSpine(file) };
}

/** the reader the operator's runner uses on a direct (U-path) spine */
const readPause = (events) => readResume(events, { direct: true, resumableOutcomes: ['cap-halt', 'wall-halt'] });

test('cycle leg 1: the wallet drains INSIDE the fix loop and the run PAUSES decision-ready — the minted verdict is kept, the trend picks the lever, the money is exact', async () => {
  const wd = cyclePatient();
  const { outcome, events, provider } = await moneyLeg1(wd);
  assert.equal(outcome, 'cap-halt', 'a money cut is never a capability read — it is the resume-to-cap checkpoint');
  assert.ok(provider.calls.length < 8, 'the last tape entry was never bought: the stop is the wallet, not the tape running out');

  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh, 'the decision-ready MONEY record exists (v1.46 §2)');
  assert.equal(mh.phase, 'fix', 'the money ran out deepest in the run, on the loop that holds a real grade');
  assert.equal(mh.cutMidCall, false);

  // the LAST verdict the arbiter minted is KEPT, never discarded and never re-derived
  const lastVerdict = events.filter((e) => e.type === 'close-verdict' && e.stage).at(-1);
  assert.equal(mh.verdict, lastVerdict.verdict, 'the kept grade is the one the close actually last rendered');
  assert.equal(mh.verdict, 'needs_revision');
  assert.equal(mh.stage, 'verdict', 'and the stage that rendered it is named');

  // the trend — the whole reason the readout is "accurate" rather than a shrug
  assert.equal(mh.trend, 'converging', 'the close fell on its own stage: this run was still getting somewhere');
  // F76: the series opens at the stage's real SEED (3). The precheck is first-red-wins
  // and stops at an earlier stage, so before this the `verdict` stage's baseline was
  // simply missing from the run's own trend — the reader was under-fed, and a run
  // stopped after one grade of a stage read `unknown` about work that had a direction.
  assert.notEqual(events.find((e) => e.type === 'close-precheck').stage, 'verdict',
    'the precheck never reached `verdict`, which is why its seed comes from the check preflight');
  assert.match(mh.reading, /verdict 3 → 2 → 1/, 'the series it judged is shown, from the seed on, so a human can check the instrument');
  assert.match(mh.lever, /top up/i, 'converging work is what a top-up finishes');

  // the ceiling and what is left of it, honestly
  assert.equal(mh.budgetUsd, 1.5, 'the SIGNED ceiling, never a re-derivation');
  assert.ok(mh.remainingUsd <= 0.001, `the wallet really is empty: ${mh.remainingUsd}`);
  assert.equal(mh.options.length, 3, 'hamr\'s three levers');
  assert.match(mh.options.join(' | '), /top up budgetUsd/i);
  assert.match(mh.options.join(' | '), /revise the goal/i);
  assert.match(mh.options.join(' | '), /abandon/i);
  assert.ok(mh.options.every((/** @type {string} */ o) => !/self|automatic/i.test(o)), 'the library reports a lever; it never pulls one');

  // the money on the terminal, cross-checked against the rounds the ledger summed
  const end = events.find((e) => e.type === 'job-end');
  const rounds = events.filter((e) => e.type === 'worker-round').map((e) => e.costUsd);
  assert.ok(rounds.every((c) => typeof c === 'number'), 'every round came back priced, so the figure can be exact');
  assert.ok(Math.abs(end.spentUsd - rounds.reduce((a, c) => a + c, 0)) < 1e-9,
    `the terminal states the sum of the rounds and nothing else: ${end.spentUsd} vs ${rounds.reduce((a, c) => a + c, 0)}`);
  assert.equal(end.spendComplete, true, 'nothing was in flight and nothing was unpriced — an exact stop is reported exact');
  assert.equal(mh.spendComplete, true, 'and the money RECORD says the same — one run cannot have two answers about its own figure');
});

test('§2 the money-halt\'s "remaining" carries its honest bound: a run whose spend is a FLOOR states a ceiling, and says so (F6)', async () => {
  // `remainingUsd` is `budget − spent`. On a floor spend that is a CEILING, and printing
  // it to four decimals beside two exact-looking levers reads as the number. `emitWallHalt`
  // has carried its honest bound since W-2; the money side had none — the state that
  // answers it lives in the ONE ledger, so the record READS it rather than deriving a
  // second, weaker answer. The floor here is an inherited one (a predecessor that could
  // not price its own rounds), which rides in without moving a single figure of this
  // leg's arithmetic — the cleanest way to see the flag travel and nothing else.
  const wd = cyclePatient();
  const { outcome, events } = await moneyLeg1(wd, { priorSpentUsd: 0, priorSpendComplete: false });
  assert.equal(outcome, 'cap-halt', 'the same stop as the exact arm — only what is KNOWN about its money differs');
  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.equal(mh.spendComplete, false, 'the unknown reaches the readout the operator picks a lever on');
  assert.equal(events.find((e) => e.type === 'job-end').spendComplete, false, 'the terminal and the record agree');
});

// ── PRD v1.46 §3 (#2) — THE RESUMED LEG'S TREND JUDGES THE WHOLE CHAIN ───────
//
// A resumed leg is the same run continuing, so the halt readout it produces must
// span both legs. Without the grade seed, leg 2 restarts the trend at its own first
// close and can only ever report what IT saw — a leg cut after one grade reads
// `unknown` while the run it continues had a measured direction, and a leg that is
// flat on its own evidence reads `flat` on a chain that was converging. `readResume`
// therefore hands the dead leg's recorded per-stage NUMBERS forward: counts and
// stage names, never gap bytes (the spine is append-only forever).

test('§3 grades: the dead leg\'s per-stage numbers come back in order, off its OWN spine, with no close bytes attached', async () => {
  const wd = cyclePatient();
  const leg1 = await moneyLeg1(wd);
  assert.equal(leg1.outcome, 'cap-halt');

  const r = readPause(leg1.events);
  assert.deepEqual(r.restart.grades, [{ stage: 'verdict', value: 2 }, { stage: 'verdict', value: 1 }],
    'the outer close graded 2 requirements missing and the one fix attempt got it to 1 — that IS the chain the resumed leg must be judged against');
  // the whole leg's close output is on the spine; NONE of its bytes may ride the seam
  assert.doesNotMatch(JSON.stringify(r.restart.grades), /requirement|missing|FAILED/,
    'counts and stage names only — a gap that crosses this seam crosses it forever');
});

test('§3 grades: the PRIMARY source is the governor\'s own ladder reading, so nothing is re-parsed that was already read', async () => {
  const wd = cyclePatient();
  const leg1 = await moneyLeg1(wd);
  const ladders = leg1.events.filter((e) => e.type === 'ladder' && e.governor === 'close-trend');
  assert.equal(ladders.length, 1, 'the fix loop recorded exactly one graded iteration — the fixture this test rests on');
  const r = readPause(leg1.events);
  assert.deepEqual(r.restart.grades.at(-1), { stage: ladders[0].stage, value: ladders[0].value },
    'the last grade is the ladder record verbatim: the reading the live instrument already made, never a second parse of the same bytes');
});

/** The plan whose step declares an `artifact-written` exit on a path carrying BOTH a
 * `red` segment and a digit. That is the reachable shape behind the fallback's guard:
 * the exit's failure detail is `tests/red/9.mjs was not written (does not exist)`,
 * whose first (and only) line is red-marked AND carries a standalone 9 — so it parses
 * as a perfectly well-formed close grade that is not a close grade at all. Paths are
 * agent-authored, so this is a plan the drafter is free to write. */
const RETRY_PLAN = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-test', action: 'Write tests/test_x.mjs and the fixture beside it.',
    tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
    // no `check-passes` here: exits are AND-only and bounded at two, and a check on a
    // write-granted step would need the tree-changed conjunct as well (the F17/F46
    // already-green trap). The pair below is all this fixture needs.
    exit: [{ type: 'artifact-written', path: 'tests/red/9.mjs' }, { type: 'tree-changed', scope: 'tests/**' }],
  }],
});

/** LEG 1 with a STEP that fails that exit once before greening. A step's failing exit
 * rides the spine as a `close-verdict` too — ralph emits one per judged iteration, and
 * the step loop is a ralph loop — so a fallback that reads every `close-verdict` on the
 * file would fold a STEP's reading into the run's CLOSE trend, in a bucket the close
 * never named. @param {string} wd */
async function moneyLeg1StepRetry(wd) {
  const job = CYCLEJOB();
  const w = (tag, files, costUsd) => ({
    toolCalls: files.map(([rel, content], i) => ({ id: `${tag}-${i}`, name: 'shell_write', arguments: { path: join(wd, rel), content } })),
    costUsd,
  });
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty.', costUsd: 0.01 },         // scout
    { text: RETRY_PLAN, costUsd: 0.01 },                                        // draft
    w('s1', [['tests/test_x.mjs', 'ok A\n']], 0.01),                            // step try 1: the fixture is missing
    { text: 'wrote the test', costUsd: 0.01 },
    w('s2', [['tests/red/9.mjs', 'fixture\n']], 0.01),                          // step try 2: green
    { text: 'wrote the fixture too', costUsd: 0.01 },
    w('f1', [['tests/test_x.mjs', 'ok A B\n']], 0.72),                          // fix 1: 2 → 1 missing
    { text: 'fix 1', costUsd: 0.72 },
    w('f2', [['tests/test_x.mjs', 'ok A B\n']], 0.02),                          // fix 2: the wallet is empty
    { text: 'never bought', costUsd: 0.5 },
  ]);
  const file = join(wd, 'spine-retry.jsonl');
  const outcome = await runJob(job, { approvals: approveJob(job), workdir: wd, provider, emit: makeSpine(file) });
  return { outcome, events: readSpine(file) };
}

test('§3 grades FALLBACK: a spine predating the governor is read off its close-verdict gaps — and a STEP\'s failing exit is not one of them', async () => {
  const wd = cyclePatient();
  const leg1 = await moneyLeg1StepRetry(wd);
  assert.equal(leg1.outcome, 'cap-halt');
  // the fixture must actually contain the hazard, or this test guards nothing: a step
  // `close-verdict` whose gap READS as a grade under the very same parser
  const stepRed = leg1.events.filter((e) => e.type === 'close-verdict' && /tests\/red\/9\.mjs was not written/.test(String(e.gap ?? '')));
  assert.equal(stepRed.length, 1, 'the step really did red once');
  assert.deepEqual(readGrade(stepRed[0].gap), { stage: null, value: 9 },
    'and its gap parses to a well-formed reading — an unnamed stage carrying a 9, which is exactly what must not reach the run\'s close trend');

  // a pre-governor spine: the fix loop was bounded by the retired count and emitted
  // no `close-trend` ladder record at all
  const old = leg1.events.filter((e) => !(e.type === 'ladder' && e.governor === 'close-trend'));
  const r = readPause(old);
  assert.deepEqual(r.restart.grades, [{ stage: 'verdict', value: 2 }, { stage: 'verdict', value: 1 }],
    'the chain, recovered from the close-verdict gaps the FIX loop left behind — and only those');
  assert.ok(r.restart.grades.every((/** @type {any} */ g) => g.stage !== null),
    'the step\'s reading landed in the unnamed bucket, and merging that into the run\'s close trend is the axis-merging the accuracy law forbids');
});

test('§3 grades: a run killed before any close reported a number seeds NOTHING — an absence is never dressed as a baseline', async () => {
  const wd = cyclePatient();
  const leg1 = await moneyLeg1(wd);
  const early = killedAfter(leg1.events, (e) => e.type === 'plan-accepted');
  const r = readResume(early, { direct: true, resumableOutcomes: ['cap-halt', 'wall-halt'] });
  assert.ok(r.restart, 'killed mid-flight, so there is still a leg to restart');
  assert.deepEqual(r.restart.grades, [],
    'the precheck reded on a numberless line — an unreadable grade donates nothing, exactly as it does inside the instrument (F6)');
});

test('cycle leg 2: the top-up resumes AT THE CHECKPOINT and greens — the finished prefix is skipped, the fold is declared once, and the total is both legs', async () => {
  const wd = cyclePatient();
  const leg1 = await moneyLeg1(wd);
  assert.equal(leg1.outcome, 'cap-halt');
  const leg1Spend = leg1.events.find((e) => e.type === 'job-end').spentUsd;

  // ── the reader, on leg 1's OWN spine ──
  const r = readPause(leg1.events);
  assert.equal(r.started, true);
  assert.equal(r.ended, false, 'a halt is not an ending: there is something left to continue');
  assert.equal(r.endOutcome, 'cap-halt', 'and it is named rather than hidden');
  assert.equal(r.completed.length, 0, 'the run never got the verdict it was asked for, so nothing is graded');
  assert.equal(r.restart.seed.phase, 'close', 'every step landed: the resume re-enters at the close and its fix loop');
  assert.deepEqual(r.restart.seed.completedSteps.map((/** @type {any} */ c) => c.id), ['write-test']);
  assert.ok(Math.abs(r.restart.priorSpentUsd - leg1Spend) < 1e-9,
    `the fold IS leg 1's own spend — two instruments, one number: ${r.restart.priorSpentUsd} vs ${leg1Spend}`);
  assert.equal(r.restart.priorSpendComplete, true);

  // ── the operator's top-up: a NEW spec version, and a NEW signature (never the
  // library's own doing — `budgetUsd` is in the hash, so raising it is a re-sign)
  const topped = CYCLEJOB({ budgetUsd: 2 });
  assert.notEqual(jobSpecHash(topped), jobSpecHash(leg1.job), 'a top-up changes the spec hash: the runner refuses it until it is re-signed');
  const provider2 = scriptedProvider([
    cwrite(wd, 'f1', 'ok A B C\n', 0.05),
    { text: 'the last requirement is in', costUsd: 0.05 },
  ]);
  const file2 = join(wd, 'spine-leg2.jsonl');
  const outcome2 = await runJob(topped, {
    approvals: approveJob(topped), workdir: wd, provider: provider2, emit: makeSpine(file2),
    priorSpentUsd: r.restart.priorSpentUsd,
    priorSpendComplete: r.restart.priorSpendComplete,
    priorWallMs: r.restart.priorWallMs,
    resumeSeed: r.restart.seed,
  });
  assert.equal(outcome2, 'green', 'the topped-up leg finishes the work the money cut off');
  const ev2 = readSpine(file2);

  // it re-entered AT the checkpoint — not from scratch
  assert.equal(ev2.find((e) => e.type === 'close-precheck').verdict, 'needs_revision',
    'the tree was still RED when leg 2 opened, so the green below was earned here and not inherited (never `already-green`)');
  assert.ok(ev2.some((e) => e.type === 'scout-skipped'), 'the survey leg 1 paid for is not re-bought');
  assert.equal(ev2.filter((e) => e.type === 'scout-result').length, 0);
  assert.equal(ev2.find((e) => e.type === 'resume-seed').skipping, 1, 'the completed prefix is skipped by ID, never re-run');
  assert.equal(ev2.find((e) => e.type === 'plan-accepted').phase, 'resume', 'the plan was reloaded, not re-drafted');
  assert.ok(ev2.some((e) => e.type === 'step-skipped' && e.step === 'write-test'));
  assert.equal(ev2.filter((e) => e.type === 'step-start').length, 0, 'no step was paid for twice');

  // the fold is DECLARED once, on the record a chain of resumes reads
  const start2 = ev2.find((e) => e.type === 'job-start');
  assert.ok(Math.abs(start2.priorSpentUsd - leg1Spend) < 1e-9, 'never zero — laundering the dead leg to $0 is what the declaration exists to stop');
  assert.equal(start2.budgetUsd, 2, 'the raised ceiling is the one on the record');

  // the close that was red at the halt now passes, and the total is the SUM
  assert.equal(ev2.filter((e) => e.type === 'close-verdict').at(-1).verdict, 'satisfied');
  const end2 = ev2.find((e) => e.type === 'job-end');
  const leg2Rounds = ev2.filter((e) => e.type === 'worker-round').reduce((a, e) => a + e.costUsd, 0);
  assert.ok(leg2Rounds > 0, 'leg 2 really did buy rounds of its own');
  assert.ok(Math.abs(end2.spentUsd - (leg1Spend + leg2Rounds)) < 1e-9,
    `the try's WHOLE spend across both legs, neither reset nor doubled: ${end2.spentUsd} vs ${leg1Spend + leg2Rounds}`);
  assert.equal(end2.spendComplete, true);
});

test('cycle CONTROL: resuming with the SAME budget buys no second pass — the run re-halts on the wallet it never got', async () => {
  const wd = cyclePatient();
  const leg1 = await moneyLeg1(wd);
  const leg1Spend = leg1.events.find((e) => e.type === 'job-end').spentUsd;
  const before = readFileSync(join(wd, 'tests', 'test_x.mjs'), 'utf8');
  const r = readPause(leg1.events);

  // NO top-up: the same signed spec, so the fold leaves the wallet at or below empty
  const same = CYCLEJOB();
  const provider2 = scriptedProvider([
    cwrite(wd, 'f1', 'ok A B C\n', 0.05),
    { text: 'the last requirement is in', costUsd: 0.05 },
  ]);
  const file2 = join(wd, 'spine-leg2.jsonl');
  const outcome2 = await runJob(same, {
    approvals: approveJob(same), workdir: wd, provider: provider2, emit: makeSpine(file2),
    priorSpentUsd: r.restart.priorSpentUsd, priorSpendComplete: r.restart.priorSpendComplete,
    priorWallMs: r.restart.priorWallMs, resumeSeed: r.restart.seed, resumeGrades: r.restart.grades,
  });
  assert.equal(outcome2, 'cap-halt',
    'no top-up, no second pass: the run re-halts on the same wallet rather than quietly running the work again for free');
  const ev2 = readSpine(file2);
  assert.equal(provider2.calls.length, 1,
    'ONE round: the hard cap binds BETWEEN rounds, so an empty wallet still buys the first and halts before the second');
  assert.equal(ev2.filter((e) => e.type === 'close-verdict').length, 0, 'no fix attempt ever completed — nothing was graded a second time');
  assert.equal(readFileSync(join(wd, 'tests', 'test_x.mjs'), 'utf8'), before,
    'and nothing reached the tree: the halt lands before the round\'s tool calls run');

  const mh2 = ev2.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh2, 'the re-halt is decision-ready too — a second silent stop would be the readout being a coincidence');
  assert.ok(mh2.remainingUsd <= 0.001, `the wallet was already empty when the leg opened: ${mh2.remainingUsd}`);
  // THE CHAIN, and this is the reading the seed exists to make correct. On its own
  // evidence leg 2 is flat: it re-graded the tree leg 1 left and nothing moved,
  // because nothing was bought. But the RUN — which is what the human is deciding
  // about — went 2 → 1 and was cut by an allowance, not by an idea running out.
  // Judging the leg alone would recommend rewriting a goal that was converging.
  assert.equal(mh2.trend, 'converging',
    'the resumed leg judges the WHOLE tree: leg 1\'s 2 → 1 is inherited, so the readout spans the chain rather than the leg');
  const verdictSeries = mh2.series.find((/** @type {any} */ s) => s.stage === 'verdict');
  assert.deepEqual(verdictSeries.values.slice(0, 2), [2, 1],
    'and the inherited prefix is VISIBLE, so a human can check the instrument rather than trust it');
  assert.ok(verdictSeries.values.length > 2, 'leg 2\'s own re-grade of the unchanged tree sits after it, not instead of it');
  assert.match(mh2.lever, /top up/i, 'converging work is what a top-up finishes — the lever follows the chain, not the leg');
  const end2 = ev2.find((e) => e.type === 'job-end');
  assert.equal(end2.outcome, 'cap-halt');
  assert.ok(end2.spentUsd >= leg1Spend, 'the fold still rides the terminal — a re-halt never resets the meter to $0');
});

test('cycle UNSOLVABLE: a topped-up leg that makes no per-stage progress strikes out FLAT instead of burning the wallet', async () => {
  const wd = cyclePatient();
  const leg1 = await moneyLeg1(wd);
  const r = readPause(leg1.events);

  // the operator tops up — and the work turns out to be unreachable: every fix
  // rewrites the file without ever satisfying the requirement the close names
  const topped = CYCLEJOB({ budgetUsd: 2 });
  const provider2 = scriptedProvider([
    cwrite(wd, 'f1', 'ok A B x\n', 0.02), { text: 'fix a', costUsd: 0.02 },
    cwrite(wd, 'f2', 'ok A B y\n', 0.02), { text: 'fix b', costUsd: 0.02 },
    cwrite(wd, 'f3', 'ok A B C\n', 0.02), { text: 'never bought', costUsd: 0.02 },
  ]);
  const file2 = join(wd, 'spine-leg2.jsonl');
  const outcome2 = await runJob(topped, {
    approvals: approveJob(topped), workdir: wd, provider: provider2, emit: makeSpine(file2),
    priorSpentUsd: r.restart.priorSpentUsd, priorSpendComplete: r.restart.priorSpendComplete,
    priorWallMs: r.restart.priorWallMs, resumeSeed: r.restart.seed, resumeGrades: r.restart.grades,
  });
  assert.equal(outcome2, 'escalated', 'the designed "close still red" terminal — the loop ran out of IDEAS, not of money');
  const ev2 = readSpine(file2);

  // the STRIKE stopped it, not the wallet — and the resumed loop still gets its FULL
  // ladder. The seed makes the loop's opening grade comparable against the chain's
  // best, and a reader that struck on that would charge this leg a strike for merely
  // re-grading the tree it inherited: no attempt was made between the two readings,
  // and a strike is a judgment on an attempt. The inherited baselines are what the
  // ATTEMPTS are measured against, never a verdict on the handover itself.
  const reads = ev2.filter((e) => e.type === 'ladder' && e.governor === 'close-trend');
  assert.equal(reads.length, FIX_STRIKE_LIMIT, `exactly ${FIX_STRIKE_LIMIT} no-progress readings and out — never a third paid attempt, and never a second cut short by the handover`);
  assert.ok(r.restart.grades.length > 0, 'the seed really was non-empty — otherwise the sentence above guards nothing');
  assert.deepEqual(reads.map((e) => e.improved), [false, false]);
  assert.equal(ev2.filter((e) => e.type === 'money-halt').length, 0, 'money was never the cut, so no money record is minted');
  const end2 = ev2.find((e) => e.type === 'job-end');
  assert.ok(end2.spentUsd < 2, `the topped-up wallet was NOT burned: $${end2.spentUsd} of a $2 ceiling`);
  assert.ok(provider2.calls.length < 6, 'the third fix — the one that would have greened — was never bought');

  // and the readout is the honest FLAT verdict, with the lever that follows from it
  const esc = ev2.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt', 'ONE exhaustion terminal, two triggers — only the trigger changed');
  assert.match(esc.decision, /no stage improved — verdict 1 → 1 → 1/,
    'the FLAT verdict\'s own prose, series and all — never "still progressing" on a run that never moved a number');
  assert.match(esc.decision, /2\/2 strikes/, 'and it names the rule that fired');
  assert.doesNotMatch(esc.decision, /nothing the instrument can compare/,
    'numbers WERE reported, so "unknown" would be a blind reading of a sighted instrument');
  assert.match(esc.options[0], /revise the goal\/spec/, 'lever one on a flat run: the work, not the wallet');
  assert.match(esc.options.join(' | '), /if the trend above says it was still converging/,
    'the top-up is offered CONDITIONALLY — this trend does not say that');
});

test('cycle F6: a DECLARED floor survives the whole cycle — leg 1\'s unknown rides the fold into leg 2\'s green terminal', async () => {
  const wd = cyclePatient();
  // leg 1 is itself a resume: it inherits a fold that was only PARTLY priced
  const leg1 = await moneyLeg1(wd, { priorSpentUsd: 0.3, priorSpendComplete: false });
  assert.equal(leg1.outcome, 'cap-halt');
  const end1 = leg1.events.find((e) => e.type === 'job-end');
  assert.equal(end1.spendComplete, false, 'every round of THIS leg being priced repairs nothing about the one before it');

  const r = readPause(leg1.events);
  assert.equal(r.restart.priorSpendComplete, false, 'the reader carries the floor forward off the declaration');
  assert.ok(Math.abs(r.restart.priorSpentUsd - end1.spentUsd) < 1e-9, 'and the floor is still a real number, not a blank');

  const topped = CYCLEJOB({ budgetUsd: 2 });
  const provider2 = scriptedProvider([
    cwrite(wd, 'f1', 'ok A B C\n', 0.05),
    { text: 'the last requirement is in', costUsd: 0.05 },
  ]);
  const file2 = join(wd, 'spine-leg2.jsonl');
  const outcome2 = await runJob(topped, {
    approvals: approveJob(topped), workdir: wd, provider: provider2, emit: makeSpine(file2),
    priorSpentUsd: r.restart.priorSpentUsd,
    priorSpendComplete: r.restart.priorSpendComplete,
    priorWallMs: r.restart.priorWallMs, resumeSeed: r.restart.seed,
  });
  assert.equal(outcome2, 'green');
  const ev2 = readSpine(file2);
  assert.equal(ev2.find((e) => e.type === 'job-start').priorSpendComplete, false,
    'the declaration carries the floor, so a THIRD leg would inherit the unknown too');
  assert.ok(ev2.filter((e) => e.type === 'worker-round').every((e) => typeof e.costUsd === 'number'),
    'leg 2 itself bought nothing unpriced — or this test would be proving the wrong mechanism');
  assert.equal(ev2.find((e) => e.type === 'job-end').spendComplete, false,
    'a GREEN total built on a floor is still a floor: reporting it exact is F6 in a resume\'s coat');
});

// ── F83's parked MED: the floor a leg MINTS, not the one it inherited ────────
//
// The test above carries a DECLARED floor across the seam, and it passed before this
// fix — `declaredComplete` is one of the two causes the restart branch already read.
// `runJob` decides the same question from FOUR (src/run.js: `!unpriced && !stalled &&
// !cutMidCall && !priorFloor`), and the two the reader could not see are the two a leg
// mints for itself: a self-healed stall and a wall that cut a call mid-flight. Both
// leave every counted round PRICED, so nothing in the window shows them — the only
// witness is the terminal's own `spendComplete`, which the restart branch ignored while
// `readTry`, the graded branch of the same reader, has always consulted it.
//
// The mechanism here is real, not injected: a real `runJob` on a real patient, a wall
// that expires inside a provider call, and F64's own `cutMidCall` discriminator doing
// the flooring. The money that reaches the resumed leg is what is under test.

/** a provider whose SECOND call burns the wall and then comes back as the provider's
 * own timeout — F64's mid-call cut, the shape that floors a leg nothing else can see.
 * @param {() => void} burnWall advances the mocked clock past the cap */
const wallCutProvider = (burnWall) => {
  const calls = [];
  return {
    calls,
    async generate() {
      calls.push(calls.length + 1);
      if (calls.length === 2) {
        burnWall();
        throw Object.assign(new Error('[AnthropicProvider] request timed out'), { code: 'ETIMEDOUT' });
      }
      return { text: 'src/mod.mjs exports x; tests/ is empty.', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.05, stopReason: 'end_turn' };
    },
  };
};

test('F83: a floor leg 1 MINTED (the wall cut a call mid-flight) reaches the resume seam — the restart fold reads the terminal, not just the rounds it can count', async (t) => {
  const wd = cyclePatient();
  const job = CYCLEJOB({ maxWallMs: 120_000 });
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const provider = wallCutProvider(() => t.mock.timers.tick(200_000));
  const file = join(wd, 'spine-wallcut.jsonl');
  const outcome = await runJob(job, {
    approvals: approveJob(job), workdir: wd, provider, emit: makeSpine(file), capRuns: 2,
  });
  assert.equal(outcome, 'wall-halt', 'the deadline landed INSIDE the call, which is the whole point of the fixture');
  const events = readSpine(file);
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.spendComplete, false, 'leg 1 really did end on a FLOOR — or this test proves nothing');
  assert.ok(events.filter((e) => e.type === 'worker-round').every((e) => typeof e.costUsd === 'number'),
    'and EVERY round it counted came back priced: the floor is invisible to any reader that only sums rounds');

  const r = readPause(events);
  assert.ok(r.restart, 'a wall-halt is a resumable governance stop, so there is a fold to hand on');
  assert.equal(r.restart.priorSpendComplete, false,
    'the unknown does not heal by being carried forward: a fold built on a floor is a floor (F6)');
  assert.equal(r.spendComplete, false,
    'and the reader\'s own top-level figure says the same thing — one rule, not two spellings of it');
  assert.ok(r.restart.priorSpentUsd > 0, 'the floor is still a real number: a known figure is never dropped to keep the sum tidy');
});

test('F83 CONTROL: the ordinary killed-mid-flight restart is UNCHANGED — with no terminal in the window there is nothing to consult, and an EARLIER try\'s floor is not this fold\'s', async () => {
  const dir = seed(BRIDGE('alpha'), BRIDGE('beta'));
  const { events } = await spineOf({
    registryDir: dir,
    selectionProvider: picker({ choice: 'alpha', reason: 'a' }, { choice: 'beta', reason: 'b' }),
    runJob: scriptedRuns([
      // try 1 GRADED and declared a floor of its own — it belongs to the carry, never
      // to the fold the restart is handed
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 1.5, rounds: [0.5, 0.5, 0.5], spendComplete: false },
      { outcome: 'escalated', closeStage: 'typecheck', spentUsd: 2, rounds: [0.75, 0.75] },
      { outcome: 'green', plan: PLAN('cold'), closeStage: 'typecheck', spentUsd: 1 },
    ]),
  });
  // killed INSIDE try 2, after its first worker-round: the module-C shape, no job-end
  const roundsIn2 = events.filter((e) => e.type === 'worker-round').slice(3);
  const r = readResume(events.slice(0, events.indexOf(roundsIn2[0]) + 1));

  assert.equal(r.restart.n, 2);
  assert.equal(r.restart.priorSpentUsd, 0.75, 'the dead attempt\'s own priced round, exactly as before');
  assert.equal(r.restart.priorSpendComplete, true,
    'nothing is unknown about what THIS attempt spent — a resume that starts floor-marking the kills that work today is the fix pointing the wrong way');
  assert.equal(r.completed[0].spendComplete, false, 'try 1\'s floor is read where it belongs: on try 1\'s own row');
  assert.equal(r.spendComplete, false, 'so the RUN total is a floor, while the fold handed to the restart is not');
});
