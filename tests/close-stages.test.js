// ONE POPULATION PER STAGE — the law for close AUTHORS (F84, hamr-signed
// 2026-08-05), and the guard that keeps it true of the SHIPPED closes.
//
// src/trend.js buckets a series by stage NAME. A stage name is not an axis, so a
// close that reds on two structurally different measurements under one name
// donates both genres to one series — and the shipped `typecheck` did exactly
// that: `N error(s) in <scope>` (in-scope faults) or `M strict error(s) outside
// them` (a different population, reached only once the first is zero). A run
// crossing that seam read 29 → 4 as CONVERGING and would have recommended a
// top-up on work that had only swapped which wall it was behind. `suite-green`
// had the same shape (an executed-count FLOOR beside a FAILURE COUNT).
//
// The fix is in the CLOSE, never in the reader (the F49 precedent — a per-close
// sharpening is how one reader stops being one reader), so this file guards the
// close from three sides:
//   1. the law itself, over the real close SOURCE — no stage block emits two
//      counted red lines. This is the test that fails on the pre-split source.
//   2. spec ↔ script agreement, by SPAWNING each real close and reading the
//      stage list it declares about itself.
//   3. the trend consequence, driving the real reader with the real new headers
//      and the real new red lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createTrend, readGrade } from '../src/trend.js';
import { validateJob } from '../src/job.js';

/** every shipped u-close, paired with the spec whose close it implements */
const PAIRS = readdirSync('jobs')
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ spec: f, job: JSON.parse(readFileSync(`jobs/${f}`, 'utf8')) }))
  .filter((p) => Array.isArray(p.job.close))
  .map((p) => {
    // the script is READ OFF the spec's own cmd, never hardcoded here: a test
    // that names the pairing itself cannot catch the pairing drifting
    const m = /(\S*u-[a-z]+-close\.mjs)/.exec(p.job.close[0]?.cmd ?? '');
    return m ? { ...p, script: m[1] } : null;
  })
  .filter(Boolean);

test('the sweep found the shipped u-closes (an empty sweep would pass vacuously)', () => {
  assert.ok(PAIRS.length >= 6, `expected every u-close spec, saw ${PAIRS.length}: ${PAIRS.map((p) => p.spec)}`);
});

// ── 1. the law, over the real close source ──────────────────────────────────

/** Every `if (stage === '<name>')` block's own code. Split on the branch opener,
 * so a block runs until the next one — the top-level helpers that sit between
 * blocks (`strictErrors`, `suite`) carry no red line of their own and cannot
 * donate one to a neighbour. */
const stageBlocks = (/** @type {string} */ src) => {
  const parts = src.split(/if \(stage === '/);
  return parts.slice(1).map((p) => ({ name: p.slice(0, p.indexOf("'")), body: p }));
};

/** a red line that reports a MEASUREMENT — `out(`red: … ${x} …`)`. A red with no
 * interpolation (`red: the tree is identical to the seed`) donates no number and
 * is not a population. */
const countedReds = (/** @type {string} */ body) =>
  (body.match(/out\(`red:[^`]*`\)/g) ?? []).filter((l) => l.includes('${'));

for (const { spec, script } of PAIRS) {
  test(`${script}: no stage reds on two populations (F84 — one population per stage)`, () => {
    const blocks = stageBlocks(readFileSync(script, 'utf8'));
    assert.ok(blocks.length >= 5, `${script}: expected the split stage list, saw [${blocks.map((b) => b.name)}]`);
    for (const b of blocks) {
      const reds = countedReds(b.body);
      assert.ok(reds.length <= 1,
        `${script} stage "${b.name}" reports ${reds.length} measured populations under one stage name — split it:\n  ${reds.join('\n  ')}`);
    }
    assert.ok(spec, 'the pair is real');
  });
}

// The instrument's own pre-flight: the check above must be ABLE to fail. The
// pre-split source is the real negative, read straight out of git rather than
// hand-crafted — a fixture written to contain the defect could only confirm it.
test('the one-population check FAILS on the pre-split close source (the defect was real and this test can see it)', () => {
  let before;
  try { before = execFileSync('git', ['show', 'f2be2b6:scripts/u-bareagent-close.mjs'], { encoding: 'utf8' }); }
  catch { return; } // a shallow/exported tree has no history to read; the live checks above still bind
  const mixed = stageBlocks(before).filter((b) => countedReds(b.body).length > 1).map((b) => b.name);
  assert.deepEqual(mixed.sort(), ['suite-green', 'typecheck'],
    'the pre-split close mixed exactly two stages — if this stops holding, the check above is no longer measuring what it claims');
});

// ── 2. spec ↔ script agreement, by spawning the real close ──────────────────

for (const { spec, job, script } of PAIRS) {
  test(`${script} declares exactly ${spec}'s stage list, in order`, () => {
    // an unknown stage is an INSTRUMENT STOP (97), never a verdict — spawnSync,
    // because a non-zero exit is the expected result here, not a harness error
    const r = spawnSync('node', [script, '__not-a-stage__'], { encoding: 'utf8' });
    assert.equal(r.status, 97, `an unknown stage is an instrument stop, not a judgment: ${r.stdout}${r.stderr}`);
    const m = /the close is: (.+)$/m.exec(r.stdout);
    assert.ok(m, `the unknown-stage instrument stop names the close: got ${JSON.stringify(r.stdout)}`);
    assert.deepEqual(m[1].trim().split(', '), job.close.map((s) => s.name),
      'the script and the signed spec must name the same stages in the same order — a stage the spec runs that the script does not know is an instrument stop mid-close');
  });
}

test('every split spec still validates, and the new stages carry their sibling’s exact contract', () => {
  for (const { spec, job } of PAIRS) {
    const v = validateJob(job, { shellCapUsd: job.budgetUsd });
    assert.deepEqual(v.reds, [], `${spec} validates`);
    const by = new Map(job.close.map((s) => [s.name, s]));
    for (const [child, sib] of [['typecheck-outside', 'typecheck'], ['tests-kept', 'suite-green']]) {
      if (!by.has(child)) continue;
      const c = by.get(child), s = by.get(sib);
      assert.deepEqual(c.judged, s.judged, `${spec}: ${child} keeps ${sib}'s judged floor`);
      assert.equal(c.gapKeep, s.gapKeep, `${spec}: ${child} keeps ${sib}'s gapKeep`);
      assert.equal(c.expect, s.expect, `${spec}: ${child} keeps ${sib}'s expect`);
      assert.equal(c.offer, s.offer, `${spec}: ${child} is as lendable as ${sib}`);
    }
    // ORDER is the whole point: first-red-wins must still show in-scope faults
    // before the outside-scope ceiling, and the executed floor before failures
    const names = job.close.map((s) => s.name);
    const at = (/** @type {string} */ n) => names.indexOf(n);
    if (at('typecheck-outside') >= 0) assert.equal(at('typecheck-outside'), at('typecheck') + 1, `${spec}: typecheck-outside runs immediately after typecheck`);
    if (at('tests-kept') >= 0) assert.equal(at('tests-kept'), at('suite-green') - 1, `${spec}: tests-kept runs immediately before suite-green, where the floor branch already ran`);
  }
});

// ── 3. the trend consequence, on the REAL lines ─────────────────────────────

/** a gap exactly as `runStages` builds one */
const gapOf = (/** @type {string} */ stage, /** @type {string} */ body) => `close stage "${stage}" failed:\n${body}`;

// The real emitted lines, pinned to the source that emits them — a hand-typed
// approximation of a close's output is a fixture, not evidence.
const IN_SCOPE_RED = 'BAREAGENT red: tsc --strict reports 29 error(s) in src/recurse.js, src/loop.js';
const OUTSIDE_RED = "BAREAGENT red: 4 strict error(s) outside src/recurse.js, src/loop.js, above the seed's 67 — the target files are clean but new errors were introduced elsewhere, not fixed";
const FLOOR_RED = "BAREAGENT red: 1040 tests executed, below the seed's 1044 — tests were lost, not kept";
const FAIL_RED = 'BAREAGENT red: 3 test(s) now fail — a type annotation must describe what the code already does';

test('the four red lines used below are the ones the shipped close actually emits', () => {
  const src = readFileSync('scripts/u-bareagent-close.mjs', 'utf8');
  for (const frag of [
    'red: tsc --strict reports ${inScope.length} error(s) in ${SCOPE.join(\', \')}',
    'red: ${outside.length} strict error(s) outside ${SCOPE.join(\', \')}, above the seed\'s ${OUTSIDE_MAX}',
    'red: ${s.tests} tests executed, below the seed\'s ${TESTS_MIN}',
    'red: ${s.failed} test(s) now fail',
  ]) assert.ok(src.includes(frag), `the close still emits: ${frag}`);
});

test('THE REPRO: 29 in-scope faults then 4 outside-scope errors land in TWO series and never read "converging"', () => {
  const tr = createTrend({ stageOrder: ['changed-from-seed', 'typecheck', 'typecheck-outside', 'tests-kept', 'suite-green', 'no-suppressions'] });
  tr.record({ gap: gapOf('typecheck', IN_SCOPE_RED) });
  tr.record({ gap: gapOf('typecheck-outside', OUTSIDE_RED) });
  const v = tr.verdict();
  assert.deepEqual(v.series, [{ stage: 'typecheck', values: [29] }, { stage: 'typecheck-outside', values: [4] }],
    'two populations, two buckets — the 29 and the 4 are never compared');
  assert.notEqual(v.trend, 'converging', 'a wall SWAP is not progress, and the top-up lever must not be offered for one');
  assert.equal(v.trend, 'unknown', 'one reading per stage compares nothing — the honest answer (F6), not a direction');
});

test('the SAME two numbers under one stage name DO read "converging" — which is the defect the split retires', () => {
  const tr = createTrend({ stageOrder: ['typecheck'] });
  tr.record({ gap: gapOf('typecheck', IN_SCOPE_RED) });
  tr.record({ gap: gapOf('typecheck', OUTSIDE_RED.replace('BAREAGENT red: 4 strict', 'BAREAGENT red: the target files are clean but 4 strict')) });
  const v = tr.verdict();
  assert.equal(v.trend, 'converging');
  assert.match(v.lever, /top up budgetUsd/,
    'the pre-split close handed hamr this lever on a run that had only swapped walls — the reader is correct, the close was lying to it');
});

test('the suite split: an executed-count FLOOR and a FAILURE COUNT are two series, not a 1040 → 3 collapse', () => {
  const tr = createTrend({ stageOrder: ['changed-from-seed', 'typecheck', 'typecheck-outside', 'tests-kept', 'suite-green', 'no-suppressions'] });
  tr.record({ gap: gapOf('tests-kept', FLOOR_RED) });
  tr.record({ gap: gapOf('suite-green', FAIL_RED) });
  const v = tr.verdict();
  assert.deepEqual(v.series, [{ stage: 'tests-kept', values: [1040] }, { stage: 'suite-green', values: [3] }]);
  assert.notEqual(v.trend, 'converging');
});

test('readGrade reads the COUNT off each new red line, not a path fragment or a reference number', () => {
  assert.deepEqual(readGrade(gapOf('typecheck', IN_SCOPE_RED)), { stage: 'typecheck', value: 29 });
  assert.deepEqual(readGrade(gapOf('typecheck-outside', OUTSIDE_RED)), { stage: 'typecheck-outside', value: 4 },
    "the fault count leads the line; the seed's 67 is a reference and must never be the reading");
  assert.deepEqual(readGrade(gapOf('tests-kept', FLOOR_RED)), { stage: 'tests-kept', value: 1040 });
  assert.deepEqual(readGrade(gapOf('suite-green', FAIL_RED)), { stage: 'suite-green', value: 3 });
});
