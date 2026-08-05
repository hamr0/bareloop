// The step ladder's governor (src/ladder.js) — the progress rule that replaced
// the fixed attempt count. Unit-grade and deliberately so: the strike decision
// is a PREDICATE over two signals, and a predicate that can only be exercised
// through a paid plan run is a predicate nobody can sabotage-test.
//
// The four mutants this file exists to kill (each named on its test):
//   1. the OR flipped to AND       — a repeat with writes, or a novel gap with
//                                    none, would stop striking
//   2. the seen-set cut to last-only — an A→B→A oscillator would read as progress
//   3. the strikes un-stuck         — a good iteration between two bad ones would
//                                    buy the step an unbounded ladder
//   4. the normalization dropped    — node --test's duration stamps would make
//                                    every repeat look novel

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLadder, normalizeGap, gapKey, STRIKE_LIMIT } from '../src/ladder.js';

/** a write counter that only advances when told — the cumulative gate-audit
 * reading the real ladder consumes, with the tree taken out of the loop */
function counter() {
  let n = 0;
  return { read: () => n, wrote: (k = 1) => { n += k; } };
}

test('STRIKE_LIMIT is 2 — the shell-owned number the fixed count used to be', () => {
  assert.equal(STRIKE_LIMIT, 2);
});

test('a ladder built without a write instrument THROWS — a strike rule with one blind signal is prose', () => {
  // The BA-4 param-guard class: a silently-degraded governor would strike only on
  // repeats and nothing on the record would say the other half was never wired
  // (the F50 blind-instrument class, at construction time).
  assert.throws(() => createLadder({ limit: 2 }), /writeCount/);
});

// ── (a) the converging sequence: the defect this whole change exists to fix
test('CONVERGING: every gap novel and every iteration writing NEVER strikes — the ladder is bounded by money/wall/green alone', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  // the real trajectory off run u-msd916dh: 30 → 22 → 17 → 11 scope errors, cut
  // by the count with $1.30 and ~6min unspent
  for (const [i, errs] of [30, 22, 17, 11, 4, 1].entries()) {
    c.wrote();
    const r = l.record({ iteration: i + 1, gap: `Found ${errs} errors.` });
    assert.equal(r.strike, false, `iteration ${i + 1} struck on a novel gap it had just moved`);
    assert.equal(l.struckOut(), false);
  }
  assert.equal(l.report().strikes, 0);
  assert.equal(l.report().distinctGaps, 6);
});

// ── (b) the oscillator: last-only comparison misses it, a seen-set does not
test('OSCILLATION A→B→A strikes on the repeat — the gap is compared against EVERY gap seen, never just the last', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  c.wrote(); assert.equal(l.record({ iteration: 1, gap: 'A' }).strike, false);
  c.wrote(); assert.equal(l.record({ iteration: 2, gap: 'B' }).strike, false);
  c.wrote();
  const third = l.record({ iteration: 3, gap: 'A' });
  assert.equal(third.strike, true, 'A came back — a last-only comparison would call this progress');
  assert.equal(third.repeatOf, 1, 'and the strike names the iteration the gap was FIRST seen at');
  assert.equal(l.struckOut(), false, 'one strike is not two');
});

// ── (c) the idle worker: a NOVEL gap with no writes is still a strike
test('IDLE: a novel gap with no writes strikes — the OR is an OR, not an AND', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  const r = l.record({ iteration: 1, gap: 'a gap nobody has seen' });
  assert.equal(r.wrote, false);
  assert.equal(r.strike, true, 'no write is its own strike, whatever the gap said');
  assert.deepEqual(l.report().repeats, [], 'and it is NOT recorded as a repeat — the two signals stay separate');
  assert.deepEqual(l.report().idle, [1]);
});

test('and a REPEATED gap with real writes strikes too — the other half of the OR', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  c.wrote(); l.record({ iteration: 1, gap: 'same wall' });
  c.wrote(3);
  const r = l.record({ iteration: 2, gap: 'same wall' });
  assert.equal(r.wrote, true, 'the worker really did write this iteration');
  assert.equal(r.strike, true);
  assert.deepEqual(l.report().idle, [], 'and it is NOT recorded as idle');
});

// ── (d) normalization: the volatile bytes must not manufacture novelty
test('NORMALIZATION: two gaps differing only in node --test duration stamps read as the SAME gap', () => {
  const a = 'not ok 1 - multiplies\n  duration_ms: 1.738291\n  ✖ adds (12.4ms)\n';
  const b = 'not ok 1 - multiplies\n  duration_ms: 9.001122\n  ✖ adds (873.9ms)\n';
  assert.notEqual(a, b, 'the raw bytes really do differ — otherwise this test proves nothing');
  assert.equal(normalizeGap(a), normalizeGap(b));
  assert.equal(gapKey(a), gapKey(b));

  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  c.wrote(); assert.equal(l.record({ iteration: 1, gap: a }).strike, false);
  c.wrote(); assert.equal(l.record({ iteration: 2, gap: b }).strike, true, 'the timing noise was read as progress');
});

test('NORMALIZATION: ISO timestamps and space/tab runs are volatile too; a REAL content change survives it', () => {
  assert.equal(
    normalizeGap('run 2026-08-03T11:22:33.123Z   failed'),
    normalizeGap('run 2026-08-01T00:00:00Z\t\tfailed'),
  );
  // the instrument must be able to return the negative: a changed COUNT is a
  // different gap, and normalizing it away would make every trajectory a repeat
  assert.notEqual(normalizeGap('Found 30 errors.'), normalizeGap('Found 22 errors.'));
  assert.notEqual(gapKey('Found 30 errors.'), gapKey('Found 22 errors.'));
});

// ── stickiness
test('STICKY: a strike is never repaid — strike, progress, strike ends the step at the limit', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  l.record({ iteration: 1, gap: 'first' });                    // no write → strike 1
  assert.equal(l.report().strikes, 1);
  c.wrote(); l.record({ iteration: 2, gap: 'second' });        // novel + wrote → clean
  assert.equal(l.report().strikes, 1, 'a good iteration does not reset the count');
  assert.equal(l.struckOut(), false);
  c.wrote(); l.record({ iteration: 3, gap: 'first' });         // repeat → strike 2
  assert.equal(l.report().strikes, 2);
  assert.equal(l.struckOut(), true);
});

test('the limit is a CEILING, not an equality: struckOut holds once reached', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  l.record({ iteration: 1, gap: 'x' });
  l.record({ iteration: 2, gap: 'y' });
  assert.equal(l.struckOut(), true);
  assert.equal(l.report().strikes, 2);
});

// ── the mechanism brief (the replan's only adaptation channel)
test('the brief names WHICH shape ended the step, with the evidence — repeating itself', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  c.wrote(); l.record({ iteration: 1, gap: 'A' });
  c.wrote(); l.record({ iteration: 2, gap: 'B' });
  c.wrote(); l.record({ iteration: 3, gap: 'A' });
  const b = l.brief();
  assert.match(b, /repeated itself/);
  assert.match(b, /iteration 3 had already been seen at iteration 1/);
  assert.match(b, /2 distinct exit output\(s\) over 3 iteration\(s\)/, 'the trajectory is stated as evidence, not a label');
});

test('the brief names the STALLED shape and the iterations that wrote nothing', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  l.record({ iteration: 1, gap: 'A' });
  c.wrote(); l.record({ iteration: 2, gap: 'B' });
  l.record({ iteration: 3, gap: 'C' });
  const b = l.brief();
  assert.match(b, /stalled/);
  assert.match(b, /iteration\(s\) 1, 3/);
  assert.doesNotMatch(b, /repeated itself/, 'no repeat happened — the brief must not invent one');
});

test('the brief never calls an IDLE strike-out converging — the replanner is not handed a self-contradiction', () => {
  // Both strikes are idleness: the worker wrote nothing, twice. The gaps still
  // differed (a close re-run can move its own bytes), and reading that as progress
  // put "no file was written in iteration(s) 1, 2" and "the step was converging"
  // in one paragraph — handed to the only channel that adapts.
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  l.record({ iteration: 1, gap: '30 errors' });
  l.record({ iteration: 2, gap: '22 errors' });
  assert.equal(l.struckOut(), true, 'idleness alone really is what ended it — otherwise this proves nothing');
  const b = l.brief();
  assert.match(b, /stalled — no file was written in iteration\(s\) 1, 2/);
  assert.match(b, /2 distinct exit output\(s\) over 2 iteration\(s\)/, 'the moving trajectory is still stated, as evidence');
  assert.doesNotMatch(b, /converging/, 'a step that wrote nothing was not converging, whatever its exit bytes did');
});

test('CONTROL: the converging sentence survives where it is true — no repeat and no idle iteration', () => {
  // Unreachable at a strike-out BY CONSTRUCTION, and that is the finding: every
  // strike is a repeat or an idle iteration, so before the gate the sentence could
  // ONLY ever have fired next to the stall line it contradicted. It is read here on
  // a ladder that has not struck out, which is the one path that can still reach it.
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  c.wrote(); l.record({ iteration: 1, gap: '30 errors' });
  c.wrote(); l.record({ iteration: 2, gap: '22 errors' });
  assert.equal(l.struckOut(), false);
  assert.match(l.brief(), /Every attempt moved the exit output/, 'every gap novel and every iteration writing — the one shape the sentence describes');
});

test('the brief never names a file the close did not name — it carries counts and iteration numbers only', () => {
  const c = counter();
  const l = createLadder({ limit: 2, writeCount: c.read });
  l.record({ iteration: 1, gap: 'src/secret-culprit.ts(3,1): error TS2322' });
  l.record({ iteration: 2, gap: 'src/secret-culprit.ts(3,1): error TS2322' });
  assert.doesNotMatch(l.brief(), /secret-culprit/, 'the close names the culprit to the worker; the brief names mechanism (F28)');
});
