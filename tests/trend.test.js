// The close TREND instrument (src/trend.js) — the shared core behind the money
// halt's readout (PRD v1.46 §2) and the close-fix loop's strike governor (§4).
// Unit-grade for the same reason the ladder's is: the accuracy law is a PREDICATE
// over a series, and a predicate reachable only through a paid run is a predicate
// nobody can sabotage-test.
//
// The mutants this file exists to kill (each named on its test):
//   1. the per-stage buckets merged into ONE series — the operator's own sweep
//      instrument did exactly this and read a typecheck/suppressions see-saw as
//      "worse"
//   2. the can't-tell branch dropped (an unreadable stage scoring 0) — F6: an
//      unknown rendered as a value, and a strike minted out of ignorance
//   3. best-so-far cut to last-only — an oscillator repays its own strike forever
//   4. the improvement comparison flipped (rising counts read as progress)
//   5. the blind backstop removed — a close the instrument cannot read would run
//      unbounded by anything but money

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrend, readGrade, FIX_STRIKE_LIMIT } from '../src/trend.js';

/** the four stages of every shipped u-close, in the order runStages runs them */
const STAGES = ['changed-from-seed', 'typecheck', 'suite-green', 'no-suppressions'];

/** a gap exactly as `runStages` builds one: its own header, then the close's output */
const gapOf = (stage, body) => `close stage "${stage}" failed:\n${body}`;

// ── readGrade: the extraction half ──────────────────────────────────────────

test('readGrade pulls the stage from runStages\' OWN header and the count from the first red-marked line', () => {
  const g = gapOf('typecheck', 'BAREAGENT red: tsc --strict reports 12 error(s) in src/recurse.js, src/loop.js\nBAREAGENT | src/loop.js(88,3): error TS2345\nBAREAGENT judged=1');
  assert.deepEqual(readGrade(g), { stage: 'typecheck', value: 12 });
});

test('readGrade reads the hyphenated red markers real closes use (gate-red / form-red / clean-red)', () => {
  assert.equal(readGrade(gapOf('verdict', 'TESTGEN form-red: collected unit=0 (need >=8)')).value, 0,
    'a real zero is a real reading — it is the UNREADABLE case that must be null, never a legible 0');
  assert.equal(readGrade(gapOf('verdict', 'TYPES gate-red: 3 suppression(s) added')).value, 3);
});

test('readGrade returns a null value when the red line carries NO number — unknown is never rendered as a value (F6)', () => {
  const g = gapOf('changed-from-seed', 'BAREAGENT red: the tree is identical to the seed — nothing was changed');
  assert.deepEqual(readGrade(g), { stage: 'changed-from-seed', value: null });
});

test('readGrade returns a null value when NO line is red-marked — a close with no count is unreadable, not zero', () => {
  const g = gapOf('verdict', 'FAILED close: the test never imports the module');
  assert.deepEqual(readGrade(g), { stage: 'verdict', value: null });
});

test('readGrade never mistakes the header for the reading — a stage NAMED red does not donate its own line', () => {
  const g = gapOf('red-flags', 'nothing quantified here at all');
  assert.deepEqual(readGrade(g), { stage: 'red-flags', value: null });
});

test('readGrade on a gap with no runStages header still reads the count — the stage is the honest null', () => {
  assert.deepEqual(readGrade('BAR red: 7 error(s) remain'), { stage: null, value: 7 });
});

test('readGrade never reads a digit out of an identifier token — D1a is a rule id, not a count (review F1)', () => {
  // the real types-close.mjs shape: the rule id's own digit sits BEFORE the counts,
  // and taking it donated a constant 1 to the governor — a wrong number, silently
  const g = gapOf('verdict', 'TYPES gate-red: D1a — "@ts-ignore" occurrences in src/foo.ts went 2 → 5');
  assert.equal(readGrade(g).value, 5);
});

test('readGrade on a before→after arrow line reads the AFTER — the current state, not the seed baseline', () => {
  // first-number would read the constant before-value and grade every iteration flat
  assert.equal(readGrade(gapOf('verdict', 'TYPES gate-red: D2b — "as any" occurrences in src/bar.ts went 4 → 3')).value, 3);
});

test('readGrade with ONLY identifier-embedded digits stays null — a wrong number is worse than none (F6)', () => {
  assert.equal(readGrade(gapOf('verdict', 'TYPES gate-red: D1a violated — suppressions were added')).value, null);
});

test('readGrade keeps the FIRST standalone number on the reference-suffixed lines the live fleet emits', () => {
  assert.equal(readGrade(gapOf('suite-green', 'BAREAGENT red: 5 tests executed, below the seed\'s 12 — tests were lost, not kept')).value, 5);
  assert.equal(readGrade(gapOf('verdict', 'red: fault-detection rate 27.5% is below the 45 bar')).value, 27.5);
});

// ── the accuracy law: per stage, never across axes ──────────────────────────

test('PER-STAGE: the u-msew1uy5 see-saw reads CONVERGING — merging the axes into one series reads it as worse', () => {
  // The real trajectory: the fix loop scrubbed suppressions 12 → 5 while the type
  // errors it re-exposed went 2 → 0. Flattened into one series that is 12, 2, 5, 0
  // and the 2 → 5 step reads as a regression. Per stage, both axes fell.
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('no-suppressions', 'red: 12 suppression(s) added') });
  tr.record({ gap: gapOf('typecheck', 'red: tsc --strict reports 2 error(s)') });
  tr.record({ gap: gapOf('no-suppressions', 'red: 5 suppression(s) added') });
  tr.record({ gap: gapOf('typecheck', 'red: tsc --strict reports 0 error(s)') });

  const v = tr.verdict();
  assert.equal(v.trend, 'converging');
  assert.match(v.reading, /no-suppressions 12 → 5/);
  assert.match(v.reading, /typecheck 2 → 0/);
  assert.equal(tr.struckOut(), false, 'a converging run is never struck out by the fix governor');
});

test('PER-STAGE: a run that only ever gets WORSE on its one axis is not converging', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
  tr.record({ gap: gapOf('typecheck', 'red: 8 error(s)') });
  assert.equal(tr.verdict().trend, 'flat', 'only a FALL on some stage is convergence — a rise is not progress');
});

// ── the three verdicts ──────────────────────────────────────────────────────

test('FLAT: the same stage reporting the same number is "nothing moved", and it names the lever hamr asked for', () => {
  // reuse-msc6w93z: dead flat at 2 errors for 7 consecutive fix verdicts until the
  // wall killed it — the waste case the replay caught.
  const tr = createTrend({ stageOrder: STAGES });
  for (let i = 0; i < 3; i += 1) tr.record({ gap: gapOf('typecheck', 'red: 2 error(s)') });
  const v = tr.verdict();
  assert.equal(v.trend, 'flat');
  assert.match(v.reading, /typecheck 2 → 2 → 2/);
  assert.match(v.lever, /revise the goal/i, 'more money is waste — the lever is the spec, not the wallet');
});

test('CONVERGING names the wallet as the lever that fits', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 12 error(s)') });
  tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
  const v = tr.verdict();
  assert.equal(v.trend, 'converging');
  assert.match(v.lever, /top up|budget/i);
});

test('CAN\'T TELL: a stage ADVANCE alone never headlines "converging" — it is true of nearly every run, so it cannot answer "will another dollar finish this"', () => {
  // Caught by the integration test one file over: the close precheck reds at stage 1,
  // the plan fixes stage 1, and the close walks on. That advance happens on
  // essentially every run that does any work, so an ordering-only convergence verdict
  // would recommend a top-up for all of them. It stays an improvement for the STRIKE
  // rule (a different question: did the LAST attempt help), and it rides in the
  // reading as context — it just does not decide.
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'FAILED, no count') });
  const adv = tr.record({ gap: gapOf('no-suppressions', 'FAILED, no count either') });
  assert.equal(adv.improved, true, 'the ordering signal is real and the strike rule uses it');
  assert.equal(tr.verdict().trend, 'unknown');
  assert.match(tr.verdict().reading, /later stage/, 'and the movement is REPORTED, never silently dropped');
});

test('CAN\'T TELL: a close whose output carries no number reads "unknown" and says so — never flat, never converging', () => {
  const tr = createTrend({ stageOrder: STAGES });
  for (let i = 0; i < 4; i += 1) tr.record({ gap: gapOf('verdict', 'FAILED close: the test never imports the module') });
  const v = tr.verdict();
  assert.equal(v.trend, 'unknown');
  assert.match(v.reading, /no .*number|nothing the instrument can compare/i);
  assert.equal(tr.struckOut(), false, 'a strike minted out of ignorance is F6 wearing a governor\'s coat');
});

test('CAN\'T TELL with ONE grade only — a single reading is never a trend', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 12 error(s)') });
  assert.equal(tr.verdict().trend, 'unknown');
});

// ── the strike governor ─────────────────────────────────────────────────────

test('FIX_STRIKE_LIMIT is 2 — the same number the step ladder uses, and hamr\'s', () => {
  assert.equal(FIX_STRIKE_LIMIT, 2);
});

test('two CONSECUTIVE comparable readings with nothing improving strikes the loop out; the first reading is the baseline and never strikes', () => {
  const tr = createTrend({ stageOrder: STAGES });
  const r1 = tr.record({ gap: gapOf('typecheck', 'red: 2 error(s)') });
  assert.equal(r1.noProgress, 0, 'the baseline has nothing to be compared against');
  assert.equal(tr.struckOut(), false);
  const r2 = tr.record({ gap: gapOf('typecheck', 'red: 2 error(s)') });
  assert.equal(r2.noProgress, 1);
  assert.equal(tr.struckOut(), false);
  const r3 = tr.record({ gap: gapOf('typecheck', 'red: 2 error(s)') });
  assert.equal(r3.noProgress, 2);
  assert.equal(tr.struckOut(), true);
});

test('CONSECUTIVE, not sticky: a real improvement between two flats resets the count — the fix loop stops when it is out of IDEAS, not after N failures', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 9 error(s)') });
  assert.equal(tr.record({ gap: gapOf('typecheck', 'red: 9 error(s)') }).noProgress, 1);
  assert.equal(tr.record({ gap: gapOf('typecheck', 'red: 4 error(s)') }).noProgress, 0, 'the improvement repaid the strike');
  assert.equal(tr.record({ gap: gapOf('typecheck', 'red: 4 error(s)') }).noProgress, 1);
  assert.equal(tr.struckOut(), false);
});

test('OSCILLATION 5 → 8 → 5 does NOT repay the strike — the comparison is against the BEST seen, never the last', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
  assert.equal(tr.record({ gap: gapOf('typecheck', 'red: 8 error(s)') }).improved, false);
  const back = tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
  assert.equal(back.improved, false, 'returning to a number already seen is not progress');
  assert.equal(tr.struckOut(), true);
});

test('STAGE ADVANCE is progress: the close getting FURTHER than it ever had is an improvement no per-stage number can see', () => {
  // The first grade reds at typecheck; the next reds at no-suppressions, two stages
  // later. Nothing about the suppressions count says so, but the typecheck wall the
  // run was stuck behind is gone — first-red-wins ordering is the evidence.
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 3 error(s)') });
  const adv = tr.record({ gap: gapOf('no-suppressions', 'red: 11 suppression(s) added') });
  assert.equal(adv.improved, true);
  assert.equal(adv.comparable, true);
  assert.equal(adv.noProgress, 0, 'the strike count is repaid by real forward movement');
});

test('STAGE REGRESSION is not progress, and it is comparable — falling back to an earlier stage strikes', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('no-suppressions', 'red: 4 suppression(s) added') });
  const back = tr.record({ gap: gapOf('changed-from-seed', 'red: the tree is identical to the seed') });
  assert.equal(back.improved, false);
  assert.equal(back.comparable, true, 'the ordering IS the signal — a regression is a reading, not an unknown');
  assert.equal(back.noProgress, 1);
});

test('a stage the close order does not name contributes NO ordering signal — an unknown stage is unknown, not last', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 3 error(s)') });
  const odd = tr.record({ gap: gapOf('some-stage-nobody-declared', 'FAILED, no count') });
  assert.equal(odd.comparable, false);
  assert.equal(odd.noProgress, 0, 'an unreadable reading neither strikes nor repays');
});

// ── the blind backstop ──────────────────────────────────────────────────────

test('BLIND BACKSTOP: while the instrument has never compared anything, the old count still bounds the loop', () => {
  // An instrument that cannot see the variable must not govern (the blind-instrument
  // rule). The honest fallback is the cruder bound it replaced, never "unbounded".
  const tr = createTrend({ stageOrder: STAGES, blindCap: 2 });
  tr.record({ gap: gapOf('verdict', 'FAILED close: no count anywhere') });
  assert.equal(tr.struckOut(), false, 'the baseline reading is not an iteration of the loop');
  tr.record({ gap: gapOf('verdict', 'FAILED close: no count anywhere') });
  assert.equal(tr.struckOut(), false);
  tr.record({ gap: gapOf('verdict', 'FAILED close: no count anywhere') });
  assert.equal(tr.struckOut(), true, 'two blind iterations past the baseline is the retired count, exactly where it was');
});

test('BLIND BACKSTOP lifts the moment the instrument CAN compare — a converging numeric run is not cut by the retired count', () => {
  const tr = createTrend({ stageOrder: STAGES, blindCap: 2 });
  for (const n of [30, 22, 17, 11, 4, 1]) tr.record({ gap: gapOf('typecheck', `red: ${n} error(s)`) });
  assert.equal(tr.struckOut(), false, 'six converging iterations under a cap of 2 — the count is retired as the governor');
  assert.equal(tr.verdict().trend, 'converging');
});

test('report() carries counts and stage names only — never close output, which is the worker\'s bytes', () => {
  const tr = createTrend({ stageOrder: STAGES, blindCap: 3 });
  tr.record({ gap: gapOf('typecheck', 'red: 2 error(s) — SECRETISH sk-abc\n') });
  tr.record({ gap: gapOf('typecheck', 'red: 2 error(s) — SECRETISH sk-abc\n') });
  const rep = tr.report();
  assert.equal(rep.strikes, 1);
  assert.equal(rep.limit, FIX_STRIKE_LIMIT);
  assert.equal(rep.iterations, 2);
  assert.doesNotMatch(JSON.stringify(rep), /SECRETISH/, 'the report holds no close bytes at all');
  assert.doesNotMatch(JSON.stringify(tr.verdict()), /SECRETISH/, 'and neither does the readout');
});

test('an explicit {stage, value} reading is accepted without a gap — the module never requires prose to be parsed', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ stage: 'typecheck', value: 9 });
  assert.equal(tr.record({ stage: 'typecheck', value: 4 }).improved, true);
});

// ── MOTION: the wall halt's byte-equality reading, folded in here ────────────
//
// W-2's `gapTrend` used to answer "was it progressing" from consecutive close
// BYTES, next to this module answering it from per-stage numbers. Two instruments
// for one question is how the two come to disagree, so the byte read moved in — as
// a strictly SUBORDINATE signal. It never becomes a direction: "something changed"
// is not "it got better", and dressing it as one is exactly what F6 forbids.

test('MOTION: with NO comparable number and two byte-IDENTICAL gaps the verdict stays unknown and reports nothing-changed', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('verdict', 'FAILED close: the test never imports the module') });
  tr.record({ gap: gapOf('verdict', 'FAILED close: the test never imports the module') });
  const v = tr.verdict();
  assert.equal(v.trend, 'unknown', 'motion is never promoted to a direction — an unknown stays unknown (F6)');
  assert.equal(v.motion, 'unchanged');
  assert.match(v.reading, /byte-identical/, 'the old "stalled" signal survives in substance, as a reading');
  assert.match(v.lever, /revise the goal/i, 'a frozen close output strongly suggests the goal, not the allowance');
});

test('MOTION: with NO comparable number and DIFFERING gaps the verdict stays unknown and reports something-changed', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('verdict', 'FAILED close: 3 bytes, still no import') });
  tr.record({ gap: gapOf('verdict', 'FAILED close: 21 bytes, still no import') });
  const v = tr.verdict();
  assert.equal(v.trend, 'unknown', 'a changing output is movement, not a measured direction');
  assert.equal(v.motion, 'changed');
  assert.match(v.reading, /still changing/, 'the old "moving" signal survives in substance');
  assert.match(v.lever, /read the last close output/i, 'a changing output makes the raw output the informative thing to read');
});

test('MOTION needs TWO gaps: one grade compares against nothing, so the motion is null rather than a guess', () => {
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('verdict', 'FAILED close: no count anywhere') });
  const v = tr.verdict();
  assert.equal(v.trend, 'unknown');
  assert.equal(v.motion, null, 'never "unchanged" by default — an absent comparison is not a match');
  assert.match(v.reading, /nothing the instrument can compare/);
});

test('MOTION never outranks a NUMBER: two byte-identical gaps that both carry a falling count still read converging', () => {
  // The wall halt's old instrument could only ever have said "stalled" here — the
  // bytes are what it compared. This is the control for the unification's whole
  // point: where numbers exist they decide, and motion is not consulted at all.
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('typecheck', 'red: 9 error(s)') });
  tr.record({ gap: gapOf('typecheck', 'red: 4 error(s)') });
  tr.record({ gap: gapOf('typecheck', 'red: 4 error(s)') }); // byte-identical to the one before
  const v = tr.verdict();
  assert.equal(v.trend, 'converging', 'the per-stage number fell 9 → 4; the last two gaps matching says nothing about that');
  assert.equal(v.motion, null, 'motion is a FALLBACK, and a fallback that fires next to a real reading is a second opinion nobody asked for');
});

test('MOTION holds NO close bytes: the retained gaps live in memory only and never reach report() or verdict()', () => {
  // The retained gap exists for ONE comparison and for nothing else. The spine is
  // append-only forever, so a gap that leaks into an emitted structure leaks for good.
  const tr = createTrend({ stageOrder: STAGES });
  tr.record({ gap: gapOf('verdict', 'FAILED close: SECRETISH sk-abc appears here') });
  tr.record({ gap: gapOf('verdict', 'FAILED close: SECRETISH sk-def appears here') });
  assert.equal(tr.verdict().motion, 'changed', 'the comparison really did run on those bytes');
  assert.doesNotMatch(JSON.stringify(tr.report()), /SECRETISH|sk-/, 'the report holds no close bytes at all');
  assert.doesNotMatch(JSON.stringify(tr.verdict()), /SECRETISH|sk-/, 'and neither does the readout that carries the motion');
});

// ── the SEED: a resumed leg inherits the dead leg's per-stage numbers ────────

/** the shape `readResume` hands over: counts and stage names, never gap bytes */
const SEED = [{ stage: 'typecheck', value: 12 }, { stage: 'typecheck', value: 5 }];

test('SEED folds into the BASELINES only: it counts no iteration, mints no strike, and never sets the instrument sighted on its own', () => {
  const tr = createTrend({ stageOrder: STAGES, limit: 2, blindCap: 2, seed: SEED });
  const rep = tr.report();
  assert.equal(rep.iterations, 0, 'a seed is history, not this leg\'s work — counting it would spend the leg\'s own bound');
  assert.equal(rep.strikes, 0, 'no reading of this leg has failed yet, so there is nothing to strike');
  assert.equal(rep.blind, true, 'the seed is not evidence THIS leg can compare anything — the blind cap still governs a leg that reads nothing');
  assert.equal(tr.struckOut(), false, 'a fresh leg is never born struck out');
});

test('SEED makes the FIRST reading of the resumed leg comparable against the pre-halt best — that is the whole point', () => {
  const tr = createTrend({ stageOrder: STAGES, seed: SEED });
  const r = tr.record({ gap: gapOf('typecheck', 'red: 3 error(s)') });
  assert.equal(r.comparable, true, 'the chain\'s best is a real baseline: 3 against a best of 5 is a comparison, not an unknown');
  assert.equal(r.improved, true);
  const v = tr.verdict();
  assert.equal(v.trend, 'converging');
  assert.match(v.reading, /typecheck 12 → 5 → 3/, 'the readout spans the CHAIN, not just the leg — the money/wall reading hamr asked for');
});

test('SEED against the BEST, not the last: a resumed reading that only beats the dead leg\'s WORST is not progress', () => {
  const tr = createTrend({ stageOrder: STAGES, seed: SEED });
  const r = tr.record({ gap: gapOf('typecheck', 'red: 9 error(s)') });
  assert.equal(r.improved, false, '9 is below the seed\'s first reading and above its best — the oscillator rule spans the seam too');
  assert.equal(r.noProgress, 1);
});

test('SEED is per stage like every other reading: a stage the dead leg never graded starts with no baseline', () => {
  const tr = createTrend({ stageOrder: STAGES, seed: SEED });
  const r = tr.record({ gap: gapOf('suite-green', 'red: 4 test(s) failing') });
  assert.equal(r.comparable, false, 'the accuracy law does not bend for a seed — typecheck\'s history is not suite-green\'s');
});

test('SEED donates NO ordering signal: a dead leg\'s furthest stage is not this leg\'s, so nothing advances on arrival', () => {
  const tr = createTrend({ stageOrder: STAGES, seed: [{ stage: 'no-suppressions', value: 4 }] });
  const r = tr.record({ gap: gapOf('typecheck', 'FAILED, no count') });
  assert.equal(r.comparable, false,
    'a stage REGRESSION against a seeded position would mint a strike for arriving — the seed sets numbers, never places');
});

test('SEED CONTROL: an empty seed (the cold path) reads byte-identically to no seed at all', () => {
  const cold = createTrend({ stageOrder: STAGES, blindCap: 2 });
  const seeded = createTrend({ stageOrder: STAGES, blindCap: 2, seed: [] });
  for (const tr of [cold, seeded]) {
    tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
    tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
  }
  assert.deepEqual(seeded.report(), cold.report());
  assert.deepEqual(seeded.verdict(), cold.verdict());
  assert.equal(seeded.struckOut(), cold.struckOut());
});

test('SEED ignores unreadable entries: a null value donates nothing, exactly as an unreadable gap does (F6)', () => {
  const tr = createTrend({ stageOrder: STAGES, seed: [{ stage: 'typecheck', value: null }, { stage: 'typecheck', value: 5 }] });
  assert.deepEqual(tr.report().stages, [{ stage: 'typecheck', values: [5] }]);
});

test('SEED belongs to ONE reader: a seeded instance reads the CHAIN while an unseeded one on the same grades reads its own leg', () => {
  // The two questions, side by side. The halt readout (seeded) is asked whether the
  // RUN was converging when its allowance cut it; the fix loop's governor (unseeded)
  // is asked whether THIS loop is out of ideas. On a resumed leg that re-grades an
  // unchanged tree the honest answers differ — and a single instance answering both
  // renders "still progressing" inside the terminal of a loop that just struck out.
  const chain = createTrend({ stageOrder: STAGES, seed: SEED });      // 12 → 5 before the halt
  const leg = createTrend({ stageOrder: STAGES });
  for (const tr of [chain, leg]) {
    tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
    tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
  }
  assert.equal(chain.verdict().trend, 'converging', 'the RUN fell 12 → 5 and was cut by an allowance, not by an idea running out');
  assert.equal(leg.verdict().trend, 'flat', 'this LEG moved nothing, and its governor must say so rather than inherit a direction it did not measure');
});
