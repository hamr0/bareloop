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

/** the stages of the shipped scope-typechecked u-closes, in the order runStages
 * runs them. Six since the F84 stage split (2026-08-05): `typecheck-outside` and
 * `tests-kept` carry the second population each of `typecheck` and `suite-green`
 * used to red on under one name — see tests/close-stages.test.js, which is where
 * that law is guarded. Here it is only an ORDERING fixture. */
const STAGES = ['changed-from-seed', 'typecheck', 'typecheck-outside', 'tests-kept', 'suite-green', 'no-suppressions'];

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
  // The first grade reds at typecheck; the next reds at no-suppressions, four stages
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

test('BLIND BACKSTOP PIN: a blind-from-birth run strikes out on exactly the iteration the retired count bought it, at every cap', () => {
  // The live-validated path, pinned before the streak rule was written so the rework
  // could not shift it by one. `blindCap` iterations PAST the baseline, so the bound
  // fires on reading cap+1 — never earlier (a strike minted on the baseline) and
  // never later (a free iteration the retired count never bought).
  for (const cap of [1, 2, 3]) {
    const tr = createTrend({ stageOrder: STAGES, blindCap: cap });
    const fired = [];
    for (let i = 0; i < cap + 2; i += 1) {
      tr.record({ gap: gapOf('verdict', `FAILED close: no count anywhere, attempt ${'abcde'[i]}`) });
      fired.push(tr.struckOut());
    }
    assert.deepEqual(fired, [...Array(cap).fill(false), true, true],
      `blindCap ${cap}: the bound must fire on reading ${cap + 1} exactly`);
  }
});

test('BLIND BACKSTOP bounds a STREAK, not a birth: one stage advance must not disarm the bound for the rest of the run', () => {
  // The 27-iteration repro. The blind arm used to hang off `comparableEver`, a
  // one-way latch — and a stage ADVANCE flips it on essentially every run that does
  // any work (verdict() says exactly that about itself). After the flip, a close
  // whose reds carry no number — the shipped aurora TESTGEN `verdict` stage — accrued
  // neither a strike nor a blind tick, and the fix loop ran bounded by money alone.
  const tr = createTrend({ stageOrder: STAGES, blindCap: 2 });
  tr.record({ gap: gapOf('changed-from-seed', 'red: the tree is identical to the seed') });
  const adv = tr.record({ gap: gapOf('typecheck', 'FAILED, no count') });
  assert.equal(adv.comparable, true, 'the advance really is the reading that used to latch the flag — otherwise this proves nothing');
  const fired = [];
  for (let i = 0; i < 5; i += 1) {
    tr.record({ gap: gapOf('typecheck', `TESTGEN red: the suite is still not green — ${'abcde'[i]}`) });
    fired.push(tr.struckOut());
  }
  assert.deepEqual(fired, [false, false, true, true, true], 'a blind streak binds at the same length a blind birth does');
  assert.equal(tr.report().strikes, 0, 'and it binds without minting a strike out of ignorance — the bound is the retired count, not a verdict (F6)');
  assert.equal(tr.report().blind, true, 'the books say WHICH bound ended it: the terminal prose branches on this field');
});

test('BLIND BACKSTOP never fires while the instrument is READING: a comparable-throughout run outlives the cap by any margin', () => {
  const tr = createTrend({ stageOrder: STAGES, blindCap: 1, seed: [{ stage: 'typecheck', value: 40 }] });
  for (const n of [30, 22, 17, 11, 9, 7, 4, 2, 1]) {
    tr.record({ gap: gapOf('typecheck', `red: ${n} error(s)`) });
    assert.equal(tr.struckOut(), false, 'nine converging readings under a cap of 1 — the count is retired wherever the instrument can see');
  }
  assert.equal(tr.report().blind, false);
});

test('BLIND BACKSTOP: a streak the instrument RECOVERS from resets — a blind patch mid-run never bounds a run that reads again', () => {
  const tr = createTrend({ stageOrder: STAGES, blindCap: 2 });
  tr.record({ gap: gapOf('typecheck', 'red: 9 error(s)') });
  tr.record({ gap: gapOf('typecheck', 'red: 4 error(s)') });
  tr.record({ gap: gapOf('typecheck', 'FAILED, the close crashed') });
  tr.record({ gap: gapOf('typecheck', 'FAILED, the close crashed again') });
  assert.equal(tr.struckOut(), false, 'two blind readings is the streak\'s own baseline plus one, not the bound');
  tr.record({ gap: gapOf('typecheck', 'red: 2 error(s)') });
  assert.equal(tr.struckOut(), false, 'the streak is CONSECUTIVE — a recovered instrument does not carry the dead run forward');
  assert.equal(tr.report().blind, false, 'and the books stop calling it blind the moment it compares something again');
  tr.record({ gap: gapOf('typecheck', 'FAILED, blind once more') });
  tr.record({ gap: gapOf('typecheck', 'FAILED, and again') });
  assert.equal(tr.struckOut(), false, 'the new streak starts from its own baseline');
  tr.record({ gap: gapOf('typecheck', 'FAILED, and again after that') });
  assert.equal(tr.struckOut(), true, 'and binds at the same length the first one would have');
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

test('SEED CONTROL: an empty seed reads identically to no seed — and a NON-empty one does not, which is what makes that a control', () => {
  // The equality half alone proves nothing: `seed` DEFAULTS to `[]`, so both arms hold
  // the same value and no change to the seed logic could ever separate them — a test
  // that cannot fail. The positive arm below is the half that can: same recordings,
  // same options, one real seed, and the verdicts must DIFFER.
  const record = (/** @type {any} */ tr) => {
    tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
    tr.record({ gap: gapOf('typecheck', 'red: 5 error(s)') });
    return tr;
  };
  const cold = record(createTrend({ stageOrder: STAGES, blindCap: 2 }));
  const empty = record(createTrend({ stageOrder: STAGES, blindCap: 2, seed: [] }));
  assert.deepEqual(empty.report(), cold.report());
  assert.deepEqual(empty.verdict(), cold.verdict());
  assert.equal(empty.struckOut(), cold.struckOut());

  const seeded = record(createTrend({ stageOrder: STAGES, blindCap: 2, seed: SEED }));
  assert.notDeepEqual(seeded.verdict(), cold.verdict(), 'a real seed MUST move the readout — if it does not, the parameter is not wired in and the equality above is vacuous');
  assert.equal(cold.verdict().trend, 'flat', 'the cold leg measured nothing but two identical readings');
  assert.equal(seeded.verdict().trend, 'converging', 'the seeded one reads the CHAIN: 12 → 5 before the halt, then 5 here');
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

// ── DIRECTION: the close declares which way is better, per stage (2026-08-31) ─
//
// hamr's option A: the close signs a `direction` field per stage — 'up' for a
// rate of good things caught, 'down' (the default, unchanged) for a count of bad
// things remaining. No inference, no LLM — createTrend is handed a plain
// stage → direction map built straight off the signed spec.

test('DIRECTION up: a climbing rate mints ZERO strikes and reads CONVERGING — the live regression from run u-mtgr1qnu (TESTGEN fault-detection rate 15 → 37.5 → 42.5, bar 45)', () => {
  const tr = createTrend({ stageOrder: ['verdict'], directions: { verdict: 'up' } });
  const r1 = tr.record({ stage: 'verdict', value: 15 });
  assert.equal(r1.noProgress, 0, 'the baseline never strikes');
  const r2 = tr.record({ stage: 'verdict', value: 37.5 });
  assert.equal(r2.improved, true, 'a HIGHER rate is progress under direction:up');
  assert.equal(r2.noProgress, 0);
  const r3 = tr.record({ stage: 'verdict', value: 42.5 });
  assert.equal(r3.improved, true);
  assert.equal(r3.noProgress, 0);
  assert.equal(tr.struckOut(), false, 'the run that actually killed u-mtgr1qnu at 2 strikes must mint none once direction is declared');
  assert.equal(tr.verdict().trend, 'converging');
});

test('DIRECTION up, mirror defect: a COLLAPSING rate mints strikes and must NOT reset them — a falling rate is not progress just because the number is smaller', () => {
  const tr = createTrend({ stageOrder: ['verdict'], directions: { verdict: 'up' } });
  tr.record({ stage: 'verdict', value: 42.5 });
  const r2 = tr.record({ stage: 'verdict', value: 20 });
  assert.equal(r2.improved, false, 'a lower rate is a regression under direction:up, never an improvement');
  assert.equal(r2.noProgress, 1);
  const r3 = tr.record({ stage: 'verdict', value: 10 });
  assert.equal(r3.improved, false);
  assert.equal(r3.noProgress, 2);
  assert.equal(tr.struckOut(), true, 'a collapsing rate must strike the loop out, not fund another regression round');
  assert.equal(tr.verdict().trend, 'flat');
});

test('DIRECTION down (default, unchanged): a falling count behaves exactly as before direction existed — the pre-existing characterization', () => {
  const tr = createTrend({ stageOrder: ['typecheck'] });
  const r1 = tr.record({ stage: 'typecheck', value: 12 });
  assert.equal(r1.noProgress, 0);
  const r2 = tr.record({ stage: 'typecheck', value: 5 });
  assert.equal(r2.improved, true, 'a LOWER count is progress under the default direction:down');
  assert.equal(r2.noProgress, 0);
  const r3 = tr.record({ stage: 'typecheck', value: 8 });
  assert.equal(r3.improved, false, 'a rise back up is not progress under direction:down');
  assert.equal(r3.noProgress, 1);
  assert.equal(tr.verdict().trend, 'converging', '12 → 5 → 8 still nets a fall from where it started');
});

test('DIRECTION mixed close: one up stage and one down stage are each graded against their OWN direction', () => {
  const tr = createTrend({ stageOrder: ['typecheck', 'verdict'], directions: { verdict: 'up' } });
  // typecheck (down): 9 → 4 is an improvement
  tr.record({ stage: 'typecheck', value: 9 });
  const tcImproved = tr.record({ stage: 'typecheck', value: 4 });
  assert.equal(tcImproved.improved, true);
  // verdict (up): 15 → 5 is a REGRESSION, not an improvement, despite the smaller number
  tr.record({ stage: 'verdict', value: 15 });
  const vRegressed = tr.record({ stage: 'verdict', value: 5 });
  assert.equal(vRegressed.improved, false, 'a smaller number on an up-stage is a regression, never progress');
  const v = tr.verdict();
  assert.equal(v.trend, 'converging', 'the down-stage alone made net progress, which is enough to headline converging');
});
