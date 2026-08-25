// The read-shim Phase 2 BATTERY DRIVER's arithmetic and readers.
//
// This is an INSTRUMENT, and instruments in this programme fail silently: the arm that
// ran was not the arm that was recorded, the spend reader missed a writer, the ceiling
// gate started a row it could not fund, a casualty was counted as a red. Each of those
// has happened here before, so each one has a test below.
//
// The spend and tool-share readers are exercised against the REAL archived spines and
// gate audits on this machine wherever they exist — a fixture I authored to contain
// the answer can only confirm it. The synthetic cases below exist for the shapes the
// archive does not contain (a `judge-round`-style unaccounted writer, an echo record,
// an unpriced round); they are constructed so they COULD show no effect, and the tests
// assert on the numbers, not on "it returned something".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readShimArm } from '../src/readshim.js';
import {
  ARMS, ARM_CLI, rowPlan, ceilingGate, readSpend, readToolShare, armStats, isCasualty, median,
  ACCOUNTED_ROUND_TYPES, ECHO_ROUND_TYPES, UNRESOLVED_NOTICE,
  isSpineFile, rowSettled,
} from '../scripts/readshim-battery.mjs';

const ARCHIVE = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u-bareloop';

// ── ARM MAPPING ────────────────────────────────────────────────────────────
test('each arm maps to the readShim value the prereg names, resolved by the library', () => {
  const byName = Object.fromEntries(ARMS.map((a) => [a.name, a.flag]));
  assert.equal(byName.A0, false, 'A0 is shim OFF — byte-identical to today');
  assert.equal(byName.A1, 'cap');
  assert.equal(byName.A2, 'diff');
  assert.equal(byName.A3, true);

  // and the LEVERS each one carries, off src/readshim.js — the battery must not hold
  // its own opinion about what an arm is
  assert.deepEqual(readShimArm(byName.A0), { on: false, cap: false, pointer: false, diff: false, g1: false });
  assert.deepEqual(readShimArm(byName.A1), { on: true, cap: true, pointer: true, diff: false, g1: true });
  assert.deepEqual(readShimArm(byName.A2), { on: true, cap: false, pointer: false, diff: true, g1: false });
  assert.deepEqual(readShimArm(byName.A3), { on: true, cap: true, pointer: true, diff: true, g1: true });
});

test('the CLI spelling of every arm is accepted by run-u.mjs', () => {
  // the map run-u.mjs keys on, read out of its source rather than restated here: a
  // driver that spawns `--read-shim A2` against a runner that has never heard of "A2"
  // dies at row 3, after two paid rows.
  const src = readFileSync(new URL('../scripts/run-u.mjs', import.meta.url), 'utf8');
  const block = /const READ_SHIM_ARM_NAMES = [\s\S]*?\}\);/.exec(src);
  assert.ok(block, 'run-u.mjs must declare READ_SHIM_ARM_NAMES');
  for (const a of ARMS) {
    const cli = ARM_CLI[a.name];
    assert.ok(new RegExp(`(^|[\\s,{])${cli}:`, 'm').test(block[0]), `run-u.mjs --read-shim must accept ${cli}`);
  }
  // and the value it maps to is the arm's own flag
  assert.match(block[0], /A0: false/);
  assert.match(block[0], /A1: 'cap'/);
  assert.match(block[0], /A2: 'diff'/);
  assert.match(block[0], /A3: true/);
});

// ── RUN ORDER ──────────────────────────────────────────────────────────────
test('the row plan interleaves the arms and never blocks them', () => {
  const plan = rowPlan(ARMS, 3);
  assert.equal(plan.length, 12);
  assert.deepEqual(plan.map((r) => r.arm), ['A0', 'A1', 'A2', 'A3', 'A0', 'A1', 'A2', 'A3', 'A0', 'A1', 'A2', 'A3']);
  // no two adjacent rows share an arm — provider drift must spread across all four
  for (let i = 1; i < plan.length; i += 1) assert.notEqual(plan[i].arm, plan[i - 1].arm, `rows ${i} and ${i + 1} are the same arm`);
  // every arm gets exactly n
  for (const a of ARMS) assert.equal(plan.filter((r) => r.arm === a.name).length, 3);
  // row numbers are 1..12 in order
  assert.deepEqual(plan.map((r) => r.row), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('rowPlan refuses a non-positive n rather than silently planning nothing', () => {
  assert.throws(() => rowPlan(ARMS, 0), /positive integer/);
  assert.throws(() => rowPlan(ARMS, 2.5), /positive integer/);
});

// ── CEILING ────────────────────────────────────────────────────────────────
test('the ceiling folds prior spend in and is checked on the worst case, not an average', () => {
  // 11 rows of the real $5 budget already committed: the 12th is exactly fundable
  const ok = ceilingGate({ ceilingUsd: 60, priorUsd: 0, spentUsd: 55, rowBudgetUsd: 5 });
  assert.equal(ok.ok, true);
  assert.equal(ok.projected, 60);
  assert.equal(ok.headroom, 5);

  // one cent over and the row does NOT start
  const no = ceilingGate({ ceilingUsd: 60, priorUsd: 0, spentUsd: 55.01, rowBudgetUsd: 5 });
  assert.equal(no.ok, false, 'a row that could cross the ceiling must never be started');
  assert.equal(no.projected, 60.01);

  // prior spend from an earlier invocation folds IN — a re-invocation gets no fresh allowance
  const folded = ceilingGate({ ceilingUsd: 60, priorUsd: 56, spentUsd: 0, rowBudgetUsd: 5 });
  assert.equal(folded.ok, false);
  assert.equal(folded.committed, 56);

  // and cheap real rows do NOT buy an extra row: the gate reads the budget, not the average
  const cheap = ceilingGate({ ceilingUsd: 60, priorUsd: 0, spentUsd: 2 * 1.9, rowBudgetUsd: 5 });
  assert.equal(cheap.ok, true);
  assert.equal(cheap.headroom, 56.2);
});

// ── SPEND ACCOUNTING ───────────────────────────────────────────────────────
test('spend accounting sums the accounted round type and EXCLUDES the attempt-level echoes', () => {
  // worker-result / worker-plan are attempt TOTALS of the same rounds (src/run.js says
  // so in its own comment). Counting them would double the run.
  const events = [
    { type: 'job-start' },
    { type: 'worker-round', costUsd: 1 },
    { type: 'worker-round', costUsd: 0.5 },
    { type: 'worker-result', costUsd: 1.5 },
    { type: 'worker-plan', costUsd: 1.5 },
    { type: 'job-end', outcome: 'green', spentUsd: 1.5, spendComplete: true },
  ];
  const s = readSpend(events);
  assert.equal(s.accountedUsd, 1.5, 'the echoes must not be summed');
  assert.equal(s.accountedRounds, 2);
  assert.deepEqual(s.echoes, { 'worker-result': 1, 'worker-plan': 1 }, 'the echoes are NAMED as skipped, not silently invisible');
  assert.equal(s.spendUsd, 1.5);
  assert.equal(s.divergenceUsd, 0);
  assert.equal(s.unaccountedUsd, 0);
});

test('a NEW money-carrying record type is reported UNACCOUNTED and still counted', () => {
  // The F45 class: an instrument that misses a writer. This test was originally written
  // with `judge-round` as its hypothetical — and then judge-round actually LANDED with the
  // softgreen rung, which is the whole point: the property under test is that an unknown
  // money writer is reported and counted, so the example has to be a type that is genuinely
  // not accounted TODAY. Swapped rather than deleted; deleting it would retire the guard at
  // the exact moment it proved it works.
  const events = [
    { type: 'worker-round', costUsd: 2 },
    { type: 'audit-round', costUsd: 0.25 },
    { type: 'audit-round', costUsd: 0.25 },
    { type: 'job-end', outcome: 'green', spentUsd: 2, spendComplete: true },
  ];
  const s = readSpend(events);
  assert.equal(s.accountedUsd, 2);
  assert.deepEqual(s.unaccounted, [{ type: 'audit-round', count: 2, sumUsd: 0.5 }]);
  assert.equal(s.unaccountedUsd, 0.5);
  // counted into the row, so the ceiling can never under-read the battery
  assert.equal(s.spendUsd, 2.5);
  // and the divergence from the library's own ledger is visible, not swallowed
  assert.equal(s.divergenceUsd, 0.5);
});

test('judge-round is now ACCOUNTED, not an unaccounted writer — the close has spend of its own', () => {
  const events = [
    { type: 'worker-round', costUsd: 2 },
    { type: 'judge-round', costUsd: 0.25 },
    { type: 'job-end', outcome: 'green', spentUsd: 2.25, spendComplete: true },
  ];
  const s = readSpend(events);
  assert.equal(s.accountedUsd, 2.25, 'the judged floor is the run\'s money like any other round');
  assert.equal(s.accountedRounds, 2);
  assert.deepEqual(s.unaccounted, []);
  assert.equal(s.divergenceUsd, 0, 'and it agrees with the library ledger that now sums it too');
});

test('an unpriced round is an UNKNOWN, never $0 (F6)', () => {
  const s = readSpend([
    { type: 'worker-round', costUsd: 1 },
    { type: 'worker-round', costUsd: null },
    { type: 'job-end', outcome: 'green', spentUsd: 1, spendComplete: true },
  ]);
  assert.equal(s.unpricedRounds, 1);
  assert.equal(s.accountedRounds, 2);
  assert.equal(s.accountedUsd, 1, 'the null must not accumulate as zero');
});

test('a floor stays a floor across the reader (spendComplete:false)', () => {
  const s = readSpend([
    { type: 'worker-round', costUsd: 1 },
    { type: 'job-end', outcome: 'provider-red', spentUsd: 1, spendComplete: false },
  ]);
  assert.equal(s.spendComplete, false);
  const noEnd = readSpend([{ type: 'worker-round', costUsd: 1 }]);
  assert.equal(noEnd.spendComplete, false, 'a run with no job-end has no complete-spend claim');
  assert.equal(noEnd.outcome, null);
});

test('F116 — a RESUMED leg reads the LEG figure, not the chain', () => {
  // Synthetic mirror of the real archived case (u-mt7ugedk, resumed from mt7gk7oy):
  // job-start carries the prior leg's spend, this leg's own rounds sum to $1.60, and
  // job-end honestly reports BOTH the chain total ($3.00) and this leg alone
  // (engagementSpentUsd, $1.60). The reader can only ever see this one spine, so its
  // round sum agrees with the LEG figure, never the chain.
  const events = [
    { type: 'job-start', priorSpentUsd: 1.4, priorSpendComplete: false, priorWallMs: 261692 },
    { type: 'worker-round', costUsd: 1.0 },
    { type: 'worker-round', costUsd: 0.6 },
    { type: 'job-end', outcome: 'green', spentUsd: 3.0, spendComplete: false, engagementSpentUsd: 1.6 },
  ];
  const s = readSpend(events);
  assert.equal(s.accountedUsd, 1.6, 'this spine\'s own rounds sum to the leg, not the chain');
  assert.equal(s.ledgerUsd, 1.6, 'ledgerUsd reads the LEG figure (engagementSpentUsd)');
  assert.equal(s.chainUsd, 3.0, 'chainUsd is exposed honestly — the full chain total');
  assert.equal(s.priorUsd, 1.4, 'priorUsd is the earlier leg\'s spend, read off job-start');
  assert.ok(Math.abs(s.divergenceUsd) < 1e-9, 'the leg-local reader agrees with the leg-local ledger');
  assert.equal(s.spendUsd, 1.6, 'spendUsd stays leg-local too — never the chain figure');
  assert.ok(Math.abs(s.priorUsd + s.ledgerUsd - s.chainUsd) < 1e-9, 'prior + leg = chain, exactly — nothing is mis-metered');
});

test('a COLD run (no engagementSpentUsd) has no leg/chain split — spentUsd already IS the leg', () => {
  const events = [
    { type: 'job-start' },
    { type: 'worker-round', costUsd: 2.0 },
    { type: 'job-end', outcome: 'green', spentUsd: 2.0, spendComplete: true },
  ];
  const s = readSpend(events);
  assert.equal(s.ledgerUsd, 2.0, 'ledgerUsd falls back to spentUsd when there is no engagementSpentUsd');
  assert.equal(s.chainUsd, 2.0, 'chainUsd is the same number for a cold run — there is no chain to fold');
  assert.equal(s.priorUsd, 0, 'no prior leg means priorUsd is 0, not null — a cold run truly has none');
  assert.equal(s.divergenceUsd, 0);
});

test('the spend reader runs on REAL archived spines and agrees with each run\'s own job-end', { skip: !existsSync(ARCHIVE) && 'no archive on this machine' }, () => {
  const files = readdirSync(ARCHIVE).filter((f) => /^u-[^/]+\.jsonl$/.test(f) && !f.includes('gate-audit'));
  assert.ok(files.length >= 3, `expected real archived spines in ${ARCHIVE}, found ${files.length}`);
  let withLedger = 0;
  for (const f of files) {
    const events = readFileSync(join(ARCHIVE, f), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const s = readSpend(events);
    if (s.ledgerUsd === null) continue;
    withLedger += 1;
    // the reader and src/run.js's own ledger must not disagree on a real run. They read
    // the same records, so any gap is a slicing bug in one of them.
    assert.ok(Math.abs(s.divergenceUsd) < 1e-6, `${f}: reader $${s.accountedUsd} vs job-end $${s.ledgerUsd}`);
    assert.ok(s.accountedRounds > 0, `${f}: a real run with a ledger must have accounted rounds`);
    // and nothing in the real archive is an unreported money writer
    assert.deepEqual(s.unaccounted, [], `${f}: an unaccounted money writer appeared`);
  }
  assert.ok(withLedger >= 3, `expected >=3 archived runs carrying a job-end ledger, got ${withLedger}`);
});

test('the accounted/echo sets are the ones src/run.js documents', async () => {
  // The battery re-spells the accounted set instead of importing it (that module is pure
  // arithmetic and must not drag the runner behind it), so THIS is the seam that stops the
  // two spellings drifting. It has already earned its keep once: it is what caught
  // `judge-round` arriving with the softgreen rung, where a silent miss would have been the
  // F45 unaccounted-writer class in an instrument built to prevent exactly that.
  const { ACCOUNTED_ROUND_TYPES: libraryTypes } = await import('../src/run.js');
  assert.deepEqual([...ACCOUNTED_ROUND_TYPES], [...libraryTypes],
    'the battery reader and src/run.js must account the SAME record types');
  assert.deepEqual([...ACCOUNTED_ROUND_TYPES], ['worker-round', 'judge-round']);
  assert.deepEqual([...ECHO_ROUND_TYPES], ['worker-result', 'worker-plan']);
  const run = readFileSync(new URL('../src/run.js', import.meta.url), 'utf8');
  assert.match(run, /worker-result[\s\S]{0,120}deliberately NOT accounted/, 'src/run.js still documents the echoes as excluded');
});

// ── TOOL SHARE ─────────────────────────────────────────────────────────────
test('tool share counts tool calls only — llm rounds and governance rows are excluded and reported', () => {
  const rows = [
    { action: { type: 'llm', args: {} } },
    { action: { type: 'read', args: { tool: 'shell_read' } } },
    { action: { type: 'read', args: { tool: 'ctx_recall' } } },
    { action: { type: 'read', args: { tool: 'ctx_get' } } },
    { action: { type: 'edit' } },
    { action: null, phase: 'halt' },
  ];
  const t = readToolShare(rows);
  assert.equal(t.total, 4, 'four tool calls: shell_read, ctx_recall, ctx_get, edit');
  assert.equal(t.retrieval, 2);
  assert.equal(t.share, 0.5);
  assert.equal(t.llmRows, 1);
  assert.equal(t.governanceRows, 1);
  assert.deepEqual(t.byTool, { shell_read: 1, ctx_recall: 1, ctx_get: 1, edit: 1 });
});

test('an empty audit reports an honest null share, never 0%', () => {
  assert.equal(readToolShare([]).share, null);
  assert.equal(readToolShare([{ action: { type: 'llm' } }]).share, null);
});

test('tool share runs on a REAL archived gate audit and finds the retrieval pair', { skip: !existsSync(ARCHIVE) && 'no archive on this machine' }, () => {
  const audits = readdirSync(ARCHIVE).filter((f) => f.endsWith('-gate-audit.jsonl'));
  assert.ok(audits.length >= 1, 'expected a real gate audit');
  let sawRetrieval = 0;
  for (const f of audits) {
    const rows = readFileSync(join(ARCHIVE, f), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const t = readToolShare(rows);
    assert.ok(t.total > 0, `${f}: a real audit must contain tool calls`);
    assert.ok(t.share >= 0 && t.share <= 1);
    // the llm rows are the majority-adjacent population and must NOT be in the denominator
    assert.equal(t.total + t.llmRows + t.governanceRows, rows.length, `${f}: every audited row must be classified exactly once`);
    if (t.retrieval > 0) sawRetrieval += 1;
  }
  assert.ok(sawRetrieval >= 1, 'at least one real archived run used ctx_recall/ctx_get — otherwise the SECONDARY axis reads zero for a reason that is not the treatment');
});

// ── CASUALTIES ─────────────────────────────────────────────────────────────
test('provider-class failures are casualties; worker failures are evidence', () => {
  for (const o of ['provider-red', 'pricing-red', 'smoke-red', 'branch-red', 'launch-failed', 'no-spine', 'no-job-end', 'driver-timeout', 'ceiling-stop']) {
    assert.equal(isCasualty(o), true, `${o} must be a casualty`);
  }
  for (const o of ['green', 'step-red', 'close-red', 'cap-halt', 'wall-halt', 'escalated', 'step-stalled']) {
    assert.equal(isCasualty(o), false, `${o} is a RESULT — a cap-halt is the worker failing inside its allowance, which is exactly what the VETO protects`);
  }
  assert.equal(isCasualty(null), true, 'a run with no job-end is a missing row, not a result');
});

test('casualties are excluded from every arm number — not counted as a red, not counted as an n', () => {
  const rows = [
    { arm: 'A0', outcome: 'green', spendUsd: 2.0, spendComplete: true, share: 0.2 },
    { arm: 'A0', outcome: 'green', spendUsd: 2.4, spendComplete: true, share: 0.3 },
    { arm: 'A0', outcome: 'provider-red', spendUsd: 0.1, spendComplete: false, share: 0 },
    { arm: 'A1', outcome: 'green', spendUsd: 1.0, spendComplete: true, share: 0.6 },
    { arm: 'A1', outcome: 'step-red', spendUsd: 1.4, spendComplete: true, share: 0.5 },
    { arm: 'A2', outcome: 'provider-red', spendUsd: 0.0, spendComplete: false, share: null },
    { arm: 'A3', outcome: 'green', spendUsd: 1.2, spendComplete: true, share: 0.4 },
  ];
  const s = armStats(rows, ARMS);
  const a0 = s.find((x) => x.arm === 'A0');
  assert.equal(a0.n, 2, 'the casualty is not an n');
  assert.equal(a0.casualties, 1);
  assert.equal(a0.greens, 2);
  assert.equal(a0.greenRate, 1, 'a casualty must not drag the green rate down — it is not a failure');
  assert.equal(a0.medianUsd, 2.2, 'the casualty\'s $0.10 must not enter the median');
  assert.equal(a0.spendComplete, true, 'the casualty\'s floor must not make the arm a floor');

  const a1 = s.find((x) => x.arm === 'A1');
  assert.equal(a1.n, 2);
  assert.equal(a1.greenRate, 0.5, 'a step-red IS evidence and does lower the green rate');

  const a2 = s.find((x) => x.arm === 'A2');
  assert.equal(a2.n, 0);
  assert.equal(a2.greenRate, null, 'an empty arm reports unknown, never 0% (which would read as tried-and-failed)');
  assert.equal(a2.medianUsd, null);
  assert.deepEqual(a2.casualtyOutcomes, ['provider-red']);
});

test('median is the median, including on even counts', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

// ── THE PRE-REGISTERED NOTICE ──────────────────────────────────────────────
test('the readout carries the A2/A3 UNRESOLVED notice verbatim and unconditionally', () => {
  assert.match(UNRESOLVED_NOTICE, /A2\/A3 COST IS UNRESOLVED AT n=3/);
  assert.match(UNRESOLVED_NOTICE, /1\.4-2\.2 points/);
  assert.match(UNRESOLVED_NOTICE, /including if/);
  assert.match(UNRESOLVED_NOTICE, /NOT evidence of an effect in either direction/);
  // and the driver prints it with no condition around it
  const src = readFileSync(new URL('../scripts/run-battery-readshim.mjs', import.meta.url), 'utf8');
  const readoutBody = src.slice(src.indexOf('const readout ='), src.indexOf('// ── DRY RUN'));
  const line = readoutBody.split('\n').find((l) => l.includes('UNRESOLVED_NOTICE'));
  assert.ok(line, 'the readout must print the notice');
  assert.ok(!/\bif\b|\?|&&/.test(line), `the notice must be unconditional, got: ${line.trim()}`);
});

// ── SPINE FILE DETECTION ───────────────────────────────────────────────────
test('a run spine is distinguished from the sidecars that live beside it', () => {
  // found by the dry run: run-u.mjs writes u-<runid>.jsonl.lag.jsonl in the SAME
  // directory, and it ends in .jsonl. The driver detects a row's spine as "the new
  // .jsonl that appeared", so a matching sidecar makes every launch look like two new
  // spines and aborts the row it just paid to start.
  assert.equal(isSpineFile('u-ms7flkok.jsonl'), true);
  assert.equal(isSpineFile('u-ms7flkok.jsonl.lag.jsonl'), false, 'the lag sidecar is not a spine');
  assert.equal(isSpineFile('u-ms7flkok-gate-audit.jsonl'), false, 'the gate audit is not a spine');
  assert.equal(isSpineFile('u-ms7flkok.jsonl.watchdog.json'), false);
  assert.equal(isSpineFile('readshim-battery-abc.json'), false);
  assert.equal(isSpineFile('bridge-aurora-u-spawner-types-ms2c0ls7.json'), false);
});

test('the spine predicate finds exactly the real spines in the real archive', { skip: !existsSync(ARCHIVE) && 'no archive on this machine' }, () => {
  const found = readdirSync(ARCHIVE).filter(isSpineFile);
  assert.ok(found.length >= 3, `expected the real archived spines, got ${found.length}`);
  // every one it picked is a real spine: it parses and carries a job-start
  for (const f of found) {
    const first = readFileSync(join(ARCHIVE, f), 'utf8').split('\n').find(Boolean);
    assert.equal(JSON.parse(first).type, 'job-start', `${f} is not a run spine`);
  }
  // and it picked NOTHING that is a sidecar
  for (const f of found) assert.ok(!f.includes('lag') && !f.includes('gate-audit'), f);
});


// ── CONTINUATION / RELAUNCH BOOKKEEPING ────────────────────────────────────
test('a casualty row granted its one relaunch is NOT settled — it must be re-run', () => {
  // The bug this test exists for: the class ledger is written at the moment the grant
  // is made, so "has this class been relaunched?" reads TRUE for the very row the
  // grant was made FOR. That marks the row settled, it never re-runs, and the arm ends
  // at n-1 with nothing saying so.
  const rows = [{ row: 2, arm: 'A1', outcome: 'provider-red', relaunchGranted: true }];
  assert.equal(rowSettled(rows, 2), false, 'a granted relaunch means the row is still owed a run');
});

test('a casualty row DENIED its relaunch is settled, and the arm ends short', () => {
  const rows = [
    { row: 2, arm: 'A1', outcome: 'provider-red', relaunchGranted: true },
    { row: 2, arm: 'A1', outcome: 'provider-red', relaunchGranted: false },
  ];
  assert.equal(rowSettled(rows, 2), true, 'the class spent its one relaunch — a class that repeats is a condition');
  // and the arm's n reflects it: two casualties, zero valid rows
  const s = armStats(rows.map((r) => ({ ...r, spendUsd: 0, spendComplete: false, share: null })), ARMS);
  assert.equal(s.find((x) => x.arm === 'A1').n, 0);
  assert.equal(s.find((x) => x.arm === 'A1').casualties, 2);
});

test('a row that produced a result is settled, casualty attempts before it notwithstanding', () => {
  assert.equal(rowSettled([{ row: 1, arm: 'A0', outcome: 'green' }], 1), true);
  assert.equal(rowSettled([
    { row: 1, arm: 'A0', outcome: 'provider-red', relaunchGranted: true },
    { row: 1, arm: 'A0', outcome: 'step-red' },
  ], 1), true, 'a step-red IS a result — the relaunch was used and produced one');
  assert.equal(rowSettled([], 1), false, 'a row that never ran is never settled');
});
