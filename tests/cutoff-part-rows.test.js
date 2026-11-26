// One row per leg for a part that spans legs (ITEM33-BUILD Addendum 2026-11-26i, hamr ruling "1" + "A"). A scout the person stopped (run mwue75ih leg 1)
// and a fix try the provider killed (run mwuxqx4f leg 5) used to sit inside a LATER leg's row, so their own leg read empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayRun } from '../src/replay.js';
import { partStatusFor } from '../src/panel/status.js';

const T = (m, s = 0) => `2026-11-26T10:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`;
let seq = 0;
/** @param {Record<string, any>[]} list */
function stamp(list) {
  seq = 0;
  return list.map((e, i) => ({ ts: T(Math.floor(i / 6), (i % 6) * 5), ...e, seq: (seq += 1) }));
}
const plan = { schema: 'plan-v1', steps: [{ id: 's1' }] };
const round = (phase, cost = 0.01) => ({ type: 'worker-round', phase, iteration: 1, kind: 'turn', costUsd: cost, pricing: 'priced', tokens: 10 });

// the mwue75ih shape: leg 1 = scout round, stop; leg 2 = more scout rounds, plan, step, green
function stoppedScout() {
  return stamp([
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' },
    { type: 'scout-start', rounds: 8 },
    round('scout', 0.0004),
    { type: 'stop-requested', phase: 'scout' },
    { type: 'escalation', category: 'stopped', decisionReady: true, phase: 'scout', decision: 'You stopped the run during scout.' },
    { type: 'job-end', outcome: 'stopped', spentUsd: 0.0004, spendComplete: true, engagementSpentUsd: 0.0004 },
    { type: 'leg-resume', leg: 2, after: 'stopped' },
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' },
    round('scout'), round('scout'), round('scout'),
    round('plan'),
    { type: 'plan-accepted', plan },
    { type: 'step-start', step: 's1' },
    { type: 'step-end', step: 's1', outcome: 'green' },
    { type: 'job-end', outcome: 'green', spentUsd: 0.05, spendComplete: true, engagementSpentUsd: 0.05 },
  ]);
}

// a fix loop over three legs: each leg runs a precheck (outer-close) then one fix iteration; the middle leg ends on a provider failure
function fixAcrossLegs() {
  const oc = { type: 'outer-close', verdict: 'needs_revision', gap: 'close stage "x" failed:\nclose: x: no' };
  const iter = [
    { type: 'fix-loop', gapBytes: 10 },
    { type: 'iteration-start', iteration: 1 },
    round('fix', 0.02),
  ];
  return stamp([
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' },
    { type: 'plan-accepted', plan },
    { type: 'step-start', step: 's1' },
    { type: 'step-end', step: 's1', outcome: 'green' },
    oc, ...iter,
    { type: 'close-verdict', iteration: 1, verdict: 'needs_revision', stages: [], gap: 'close: x: no' },
    { type: 'escalation', category: 'cap-halt', decisionReady: true, decision: 'cap' },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 0.03, spendComplete: true, engagementSpentUsd: 0.03 },
    { type: 'leg-resume', leg: 2, after: 'cap-halt' },
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' },
    oc, ...iter,
    { type: 'escalation', category: 'provider-red', decisionReady: true, decision: 'The provider path failed mid-run.' },
    { type: 'run-end', outcome: 'escalated', iterations: 1 },
    { type: 'job-end', outcome: 'provider-red', spentUsd: 0.05, spendComplete: true, engagementSpentUsd: 0.02 },
    { type: 'leg-resume', leg: 3, after: 'provider-red' },
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' },
    oc, ...iter,
    { type: 'close-verdict', iteration: 1, verdict: 'satisfied', stages: [] },
    { type: 'run-end', outcome: 'green', iterations: 1 },
    { type: 'job-end', outcome: 'green', spentUsd: 0.07, spendComplete: true, engagementSpentUsd: 0.02 },
  ]);
}

test('a scout the person stopped is its own leg-1 row: stopped, 1 call, its cost; the rest of the scout is leg 2', () => {
  const s = replayRun(stoppedScout(), [], { runId: 'r1' });
  const scouts = s.parts.filter((p) => p.kind === 'scout');
  assert.equal(scouts.length, 2, 'one scout row per leg');
  assert.deepEqual(scouts.map((p) => p.leg), [1, 2]);
  assert.equal(scouts[0].rounds, 1);
  assert.equal(scouts[0].spentUsd, 0.0004);
  assert.equal(scouts[0].stopReason, 'you stopped it');
  assert.equal(partStatusFor(scouts[0]).key, 'stopped');
  assert.equal(scouts[1].rounds, 3);
  assert.equal(scouts[1].stopReason, undefined, 'the last piece ended on its own, nothing cut it');
  assert.equal(scouts[0].rounds + scouts[1].rounds, 4, 'the pieces add up to the old row');
  assert.equal(scouts[0].resumedNext, true, 'the leg ends on its last part');
});

test('a fix part over three legs is one row per leg; each row\'s attempts read 1..n in time order, and the provider-red leg says so', () => {
  const s = replayRun(fixAcrossLegs(), [], { runId: 'r2' });
  const fixes = s.parts.filter((p) => p.kind === 'fix');
  assert.equal(fixes.length, 3);
  assert.deepEqual(fixes.map((p) => p.leg), [1, 2, 3]);
  for (const f of fixes) {
    assert.deepEqual(f.attempts.map((a) => a.n), [1, 2], 'numbered 1..n inside the piece');
    assert.deepEqual(f.attempts.map((a) => a.source), ['outer-close', 'iteration'], 'in time order: the precheck, then the fix try');
  }
  assert.equal(fixes[1].stopReason, 'provider failed');
  assert.equal(partStatusFor(fixes[1]).key, 'failed');
  assert.equal(fixes[0].rounds + fixes[1].rounds + fixes[2].rounds, s.fixLoop.rounds, 'the pieces add up to the old row (the run-level fix loop, unchanged)');
});

test('a single-leg run keeps one row per part (no :L ids) and a stopped step still adds no extra row', () => {
  const one = stamp([
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' },
    round('scout'), round('plan'),
    { type: 'plan-accepted', plan },
    { type: 'step-start', step: 's1' },
    { type: 'step-end', step: 's1', outcome: 'green' },
    { type: 'job-end', outcome: 'green', spentUsd: 0.03, spendComplete: true },
  ]);
  assert.deepEqual(replayRun(one, [], { runId: 'r3' }).parts.map((p) => p.id), ['scout', 'plan', 'step:s1:1']);
  const stoppedStep = stamp([
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' },
    round('scout'), round('plan'),
    { type: 'plan-accepted', plan },
    { type: 'step-start', step: 's1' },
    { type: 'stop-requested' },
    { type: 'escalation', category: 'stopped', decisionReady: true, decision: 'stopped' },
    { type: 'run-end', outcome: 'escalated', iterations: 1 },
    { type: 'step-end', step: 's1', outcome: 'escalated' },
    { type: 'job-end', outcome: 'stopped', spentUsd: 0.02, spendComplete: true },
  ]);
  assert.deepEqual(replayRun(stoppedStep, [], { runId: 'r4' }).parts.map((p) => p.id), ['scout', 'plan', 'step:s1:1']);
});
