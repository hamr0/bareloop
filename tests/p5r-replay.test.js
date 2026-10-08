// P5-R — `replayRun` (the report the CLI and the panel read) on a ONE-FILE, MULTI-LEG run. The two-leg fixture: money counts leg 1 ONCE (never rounds + the declared fold), time excludes the gap
// between legs, the outcome is the LAST leg's, and an old single-leg spine reads exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayRun } from '../src/replay.js';

const T = (h, m, s = 0) => `2026-10-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`;
const MIN = 60_000;

/** leg 1: 10:00 -> 10:20, spends $3, cap-halts. The person comes back at 14:00. leg 2: 14:00 -> 14:10 spends $2.
 * `leg2` selects how leg 2 ends: 'green' | 'died' | 'cap-halt'. The 3h40 between 10:20 and 14:00 is the gap. */
function twoLeg({ leg2 = 'green' } = {}) {
  const plan = { schema: 'plan-v1', steps: [{ id: 's1' }] };
  const ev = [
    { type: 'job-start', job: 'j', specHash: 'h1', budgetUsd: 8, shape: 'plan', goal: 'g', ts: T(10, 0), seq: 1 },
    { type: 'plan-accepted', plan, ts: T(10, 1), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 3, ts: T(10, 5), seq: 3 },
    { type: 'step-start', step: 's1', ts: T(10, 6), seq: 4 },
    { type: 'step-end', step: 's1', outcome: 'green', ts: T(10, 10), seq: 5 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 3, engagementSpentUsd: 3, spendComplete: true, ts: T(10, 20), seq: 6 },
    { type: 'leg-resume', leg: 2, after: 'cap-halt', at: T(14, 0), ts: T(14, 0), seq: 7 },
    { type: 'job-start', job: 'j', specHash: 'h2', budgetUsd: 10, shape: 'plan', goal: 'g', priorSpentUsd: 3, priorSpendComplete: true, priorWallMs: 20 * MIN, ts: T(14, 0), seq: 8 },
    { type: 'plan-accepted', plan, ts: T(14, 1), seq: 9 },
    { type: 'resume-seed', phase: 'close', completed: ['s1'], skipping: 1, ts: T(14, 1), seq: 10 },
    { type: 'worker-round', kind: 'turn', costUsd: 2, ts: T(14, 5), seq: 11 },
  ];
  if (leg2 === 'green') ev.push({ type: 'job-end', outcome: 'green', spentUsd: 5, engagementSpentUsd: 2, spendComplete: true, ts: T(14, 10), seq: 12 });
  if (leg2 === 'cap-halt') ev.push({ type: 'job-end', outcome: 'cap-halt', spentUsd: 5, engagementSpentUsd: 2, spendComplete: true, ts: T(14, 10), seq: 12 });
  return ev;
}

test('P5-R replayRun: outcome is the LAST leg\'s; money is each leg\'s own spend summed once; wall excludes the gap; legs are reported in order', () => {
  const s = replayRun(twoLeg({ leg2: 'green' }), [], { runId: 'r1' });
  assert.equal(s.outcome, 'green');
  assert.equal(s.spentUsd, 5, '$3 + $2 on ONE basis — never the terminal\'s chain total on top of the earlier leg');
  assert.equal(s.spendComplete, true);
  assert.equal(s.wallMs, 30 * MIN, '20min + 10min; the 3h40 gap is excluded');
  assert.equal(s.resumed, true);
  assert.equal(s.budgetUsd, 10, 'the caps the latest leg ran under');
  assert.equal(s.specHash, 'h2');
  assert.deepEqual(s.legs.map((l) => [l.leg, l.after, l.outcome]), [[1, null, 'cap-halt'], [2, 'cap-halt', 'green']]);
  assert.equal(s.thisFileSpend.value, 5, 'the file\'s own rounds, summed');
  assert.equal(s.spendMismatch, null);
});

test('P5-R replayRun: a run whose LATEST leg died has no outcome (it is not leg 1\'s cap-halt) and an unknown wall, never a guess', () => {
  const s = replayRun(twoLeg({ leg2: 'died' }), [], { runId: 'r1' });
  assert.equal(s.outcome, null);
  assert.equal(s.spentUsd, null);
  assert.equal(s.wallMs, null);
  assert.equal(s.legs.length, 2);
});

test('P5-R replayRun: the gate-audit sidecar is scoped per leg — a row another run wrote into the gap is not this run\'s', () => {
  const a = (iso, tool) => ({ ts: iso, decision: 'allow', action: { type: tool, path: '/x' } });
  const audit = [a(T(10, 5), 'read'), a(T(12, 0), 'read'), a(T(14, 5), 'read')];
  const s = replayRun(twoLeg({ leg2: 'green' }), audit, { runId: 'r1' });
  assert.equal(s.behaviour.totalCalls, 2, 'the 12:00 row sits in the gap between the legs');
});

test('P5-R replayRun: an old single-leg spine is unchanged — one leg, the terminal\'s own chain total, this-file text', () => {
  const old = twoLeg({ leg2: 'green' }).slice(7); // leg 2 alone with its priorSpentUsd (an old split file)
  const s = replayRun(old, [], { runId: 'r2' });
  assert.equal(s.legs.length, 1);
  assert.equal(s.resumed, true, 'priorSpentUsd on its job-start still reads as resumed');
  assert.equal(s.spentUsd, 5, 'the terminal\'s own chain total, as ever');
  assert.equal(s.wallMs, 10 * MIN);
});

// hamr 2026-10-08 (B): a leg that ended `escalated` on a money-halt / wall-halt reads CAPPED on every surface — fixed at
// the one source (the step's stopReason), so the part cards follow the run card's word.
test('B: a step cut off by a leg that ended `escalated` + money-halt / wall-halt carries stopReason money cap / time cap, and partStatusFor reads capped; a strikes-only escalation stays failed', async () => {
  const { partStatusFor } = await import('../src/panel/status.js');
  const legTwo = (end) => {
    const ev = twoLeg({ leg2: 'died' });
    ev.push({ type: 'step-start', step: 's2', ts: T(14, 6), seq: 12 });
    ev.push(...end);
    return ev;
  };
  const esc = (category) => ({ type: 'escalation', category, decisionReady: true, ts: T(14, 9), seq: 14 });
  const jobEnd = { type: 'job-end', outcome: 'escalated', spentUsd: 5, engagementSpentUsd: 2, spendComplete: true, ts: T(14, 10), seq: 15 };
  const reasonOf = (events) => {
    const s = replayRun(events, [], { runId: 'r1' });
    const step = s.steps.find((x) => x.id === 's2' || x.step === 's2' || x.label === 's2');
    assert.ok(step, `step s2 in the report — ${JSON.stringify(s.steps.map((x) => Object.keys(x)))}`);
    return { reason: step.stopReason, key: partStatusFor({ kind: 'step', outcome: null, stopReason: step.stopReason }).key };
  };
  assert.deepEqual(reasonOf(legTwo([{ type: 'money-halt', ts: T(14, 8), seq: 13 }, esc('cap-halt'), jobEnd])), { reason: 'money cap', key: 'capped' });
  assert.deepEqual(reasonOf(legTwo([esc('wall-halt'), jobEnd])), { reason: 'time cap', key: 'capped' });
  assert.equal(reasonOf(legTwo([esc('cap-halt'), jobEnd])).key, 'failed', 'a strike-ladder cap-halt (no money-halt record) is not the money cap');
});
