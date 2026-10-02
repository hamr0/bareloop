// P5-R — the resume reader, the age gate, `deathAtOf` and the spend helpers read a ONE-FILE, MULTI-LEG run through
// `legsOf`. One two-leg fixture goes through each: money counts leg 1 ONCE (never rounds + the declared fold), time excludes the gap
// between legs, the outcome is the LAST leg's, and an old single-leg spine reads exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readResume, checkpointAgeGate, CHECKPOINT_OUTCOMES } from '../src/reuse.js';
import { deathAtOf } from '../src/u-readout.js';
import { legSpend, runSpend, chainSpend } from '../src/ledger.js';

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

test('P5-R readResume: the checkpoint is the LATEST leg\'s — money counts leg 1 once (its declared fold + this leg\'s rounds), time excludes the gap', () => {
  const r = readResume(twoLeg({ leg2: 'died' }), { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES, deathAt: Date.parse(T(14, 10)) });
  assert.equal(r.started, true);
  assert.ok(r.restart, 'leg 2 has no terminal: it is the open attempt a resume continues');
  assert.equal(r.restart.priorSpentUsd, 5, '$3 declared by leg 2\'s job-start + $2 of its own rounds — NOT $3 + $3 + $2');
  assert.equal(r.restart.priorWallMs, 30 * MIN, '20min declared + 10min of leg 2\'s own window — the 3h40 gap is nobody\'s');
  assert.equal(r.specHash, 'h2', 'and the spec the latest leg ran under');
  assert.ok(r.restart.seed, 'the plan reloads from the latest leg\'s own record');
});

test('P5-R readResume: a halted LATEST leg is a checkpoint again (resume #2), its outcome the last leg\'s — never leg 1\'s', () => {
  const r = readResume(twoLeg({ leg2: 'cap-halt' }), { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES });
  assert.equal(r.endOutcome, 'cap-halt');
  assert.equal(r.ended, false, 'a cap-halt is a checkpoint');
  assert.equal(r.restart.priorSpentUsd, 5);
  const g = readResume(twoLeg({ leg2: 'green' }), { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES });
  assert.equal(g.greened, true, 'a green last leg is a green run — there is nothing to resume');
  assert.equal(g.endOutcome, 'green');
  assert.equal(g.ended, true);
});

test('P5-R readResume: a spine with NO marker reads exactly as it always did (one leg, no windowing)', () => {
  const one = twoLeg({ leg2: 'died' }).slice(0, 6).slice(0, 5); // leg 1 only, no terminal
  const r = readResume(one, { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES, deathAt: Date.parse(T(10, 20)) });
  assert.equal(r.restart.priorSpentUsd, 3);
  assert.equal(r.restart.priorWallMs, 20 * MIN);
});

test('P5-R checkpointAgeGate: only the LATEST leg can be the pause — an earlier leg\'s answered pause is not a checkpoint', () => {
  const ev = [
    { type: 'job-start', ts: T(10, 0) },
    { type: 'hitl-pause', ts: '2026-01-01T00:00:00.000Z' },
    { type: 'job-end', outcome: 'hitl-pause', ts: '2026-01-01T00:00:01.000Z' },
    { type: 'leg-resume', leg: 2, ts: T(10, 0) },
    { type: 'job-start', ts: T(10, 1) },
  ];
  const g = checkpointAgeGate(ev, { now: () => Date.parse(T(11, 0)) });
  assert.equal(g.applies, false, 'leg 2 is not waiting on a decision; leg 1\'s 9-month-old pause was answered');
  assert.equal(g.ok, true);
});

test('P5-R deathAtOf: a run ended by an EARLIER leg\'s job-end is not "ended" — only the latest leg\'s terminal is; a watchdog note from before this leg is another leg\'s', () => {
  const ev = twoLeg({ leg2: 'died' });
  const note = T(14, 12);
  assert.equal(deathAtOf({ watchdogAt: note, events: ev }), Date.parse(note), 'leg 2 died: the watchdog dates it, despite leg 1\'s job-end on the same file');
  assert.equal(deathAtOf({ watchdogAt: T(10, 25), events: ev }), null, 'a note dated before leg 2 began is leg 1\'s');
  assert.equal(deathAtOf({ watchdogAt: note, events: twoLeg({ leg2: 'green' }) }), null, 'a leg that ended itself dates itself');
  assert.equal(deathAtOf({ watchdogAt: note, events: ev.slice(0, 5) }), Date.parse(note), 'one leg, no terminal: unchanged');
});

test('P5-R legSpend/runSpend/chainSpend: leg 1 once, never the fold on top; one leg keeps its terminal\'s chain total', () => {
  const ev = twoLeg({ leg2: 'green' });
  assert.deepEqual(runSpend(ev, { withDraft: false }), { usd: 5, complete: true, lastLegUsd: 2 });
  assert.deepEqual(chainSpend(ev), { usd: 5, complete: true });
  // a first leg that inherited a fold from ANOTHER run (a door rerun) keeps it, once
  const rerun = ev.map((e, i) => (i === 0 ? { ...e, priorSpentUsd: 1 } : e));
  assert.deepEqual(chainSpend(rerun), { usd: 6, complete: true });
  // a dead earlier leg is a floor: the chain is not complete
  const died = ev.filter((e) => e.type !== 'job-end' || e.outcome !== 'cap-halt');
  assert.equal(chainSpend(died).complete, false);
  // one leg: the terminal's chain total, as every door has always read
  assert.deepEqual(chainSpend(ev.slice(7)), { usd: 5, complete: true });
  assert.deepEqual(legSpend(ev.slice(7)), { usd: 2, complete: true }, 'a single leg is its engagement figure');
});
