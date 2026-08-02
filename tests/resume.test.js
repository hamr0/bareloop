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
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readResume, runReuse, resolveReuse, reuseSpecHash } from '../src/reuse.js';
import { makeRegistry, saveBridge } from '../src/bridges.js';
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
    calls.push({ spec, bridge: opts.bridge, priorSpentUsd: opts.priorSpentUsd, priorWallMs: opts.priorWallMs, shellCapUsd: opts.shellCapUsd });
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
  const dead = readResume(readSpine(cut ? file : file));

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
  assert.equal(guardMin(r3.stdout), 0, 'no attempt will run, so no attempt is funded');
});
