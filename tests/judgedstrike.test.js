// F192 (e) item 4 — the close-trend strike governor was blind to a JUDGED stage failing the same way.
// REAL sequences: the ladder records of run mv13ery3 (docs-judged-floor red 4x: value null, comparable false,
// noProgress stayed 0 until the wall) and of run mv117wde (numeric/unstaged regression: noProgress 0,0,1,1,2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTrend, FIX_STRIKE_LIMIT } from '../src/trend.js';
import { closeGrade } from '../src/declaredclose.js';
import { runStage } from '../src/kinds.js';
import { JUDGE_MODEL } from '../src/judged.js';

// the signed close's stage order, from mv13ery3's resolved spec (stageIndex 6 and 7 below)
const ORDER = ['changed-from-seed', 'typecheck-src-errors', 'typecheck-outside-src-errors', 'tests-executed-kept',
  'suite-green', 'suite-no-failures', 'no-suppressions', 'docs-judged-floor'];
const UNSURE = 'bin/pulselog.js|unsure|locate found nothing in the artifact — unsure, and unsure is red';

/** mv13ery3's real ladder: [iteration, stage, value]; iterations 2-5 are the same judged stage */
const MV13 = [[1, 'no-suppressions', null], [2, 'docs-judged-floor', null], [3, 'docs-judged-floor', null],
  [4, 'docs-judged-floor', null], [5, 'docs-judged-floor', null]];

/** the opening grade `planrun` records before the loop (the ladder shows iteration 1 already advancing from an earlier stage) */
const open = (t) => t.record({ stage: 'suite-green', value: null });

test('mv13ery3 replay WITHOUT the red set: the governor never strikes (the live defect, reproduced)', () => {
  const t = createTrend({ stageOrder: ORDER, limit: FIX_STRIKE_LIMIT });
  open(t);
  const out = MV13.map(([, stage, value]) => t.record({ stage, value }));
  assert.deepEqual(out.map((o) => o.comparable), [true, true, false, false, false]);
  assert.deepEqual(out.map((o) => o.noProgress), [0, 0, 0, 0, 0]);
  assert.equal(t.struckOut(), false);
});

test('mv13ery3 replay WITH the identical red set (1 distinct red = value 1): strikes after 2 no-progress iterations (iteration 4 of the real run, not the wall)', () => {
  const t = createTrend({ stageOrder: ORDER, limit: FIX_STRIKE_LIMIT });
  open(t);
  const out = MV13.map(([, stage, value]) => t.record({ stage, value: stage === 'docs-judged-floor' ? 1 : value }));
  assert.deepEqual(out.map((o) => o.noProgress), [0, 0, 1, 2, 3]);
  assert.equal(out[2].comparable, true);
  assert.equal(out[2].improved, false);
  const t2 = createTrend({ stageOrder: ORDER, limit: FIX_STRIKE_LIMIT });
  open(t2);
  const struckAt = MV13.findIndex(([, stage, value]) => {
    t2.record({ stage, value: stage === 'docs-judged-floor' ? 1 : value });
    return t2.struckOut();
  });
  assert.equal(MV13[struckAt][0], 4);
});

/** feed a judged stage's red COUNTS; returns per-reading {improved, comparable, noProgress} */
const feed = (counts) => {
  const t = createTrend({ stageOrder: ORDER });
  return counts.map((value) => { const r = t.record({ stage: 'docs-judged-floor', value }); return [r.comparable, r.improved, r.noProgress]; });
};

test('judged red COUNT vs best-so-far: 5,3,4,3,2 = uncomparable, progress, strike, strike, progress (reset)', () => {
  assert.deepEqual(feed([5, 3, 4, 3, 2]), [[false, false, 0], [true, true, 0], [true, false, 1], [true, false, 2], [true, true, 0]]);
});

test('judged flip-flop A,B,A,B (1 red each) strikes; a GROWING set (1 then 3) strikes', () => {
  assert.deepEqual(feed([1, 1, 1, 1]).map((r) => r[2]), [0, 1, 2, 3]);
  assert.deepEqual(feed([1, 3]), [[false, false, 0], [true, false, 1]]);
});

test('numeric behaviour unchanged: mv117wde\'s real ladder (stage/value pairs) still reads noProgress 0,0,1,1,2', () => {
  const MV117 = [[null, 2], ['no-suppressions', null], [null, 2], ['no-suppressions', null], [null, 2]];
  const t = createTrend({ stageOrder: ORDER, limit: FIX_STRIKE_LIMIT });
  const out = MV117.map(([stage, value]) => t.record({ stage, value }));
  assert.deepEqual(out.map((o) => o.noProgress), [0, 0, 1, 1, 2]);
  assert.equal(t.struckOut(), true);
});

test('END TO END: a real judged stage that is unsure twice yields the same redSet, a count of 1 through closeGrade, and strikes', async () => {
  const wd = mkdtempSync(join(tmpdir(), 'judgedstrike-'));
  mkdirSync(join(wd, 'bin'), { recursive: true });
  writeFileSync(join(wd, 'bin', 'pulselog.js'), '#!/usr/bin/env node\nconsole.log("hi");\n');
  const card = { items: [{ rule: 'has-doc', text: 'A doc comment sits directly above the function.' }] };
  const st = { name: 'docs-judged-floor', kind: 'judged-floor', params: { card, paths: ['bin/pulselog.js'] } };
  const judgeLoop = () => ({ run: async () => ({ text: JSON.stringify({ functions: [] }), stopReason: 'end_turn', error: null, metrics: { costUsd: 0.0004, unpricedRounds: 0 } }) });
  const t = createTrend({ stageOrder: ['docs-judged-floor'] });
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    const r = await runStage(st, { workdir: wd, seedRef: 'HEAD', gapKeep: 'close: ', judgeModel: JUDGE_MODEL, judgeLoop });
    assert.equal(r.verdict, 'red');
    assert.ok(Array.isArray(r.detail.redSet) && r.detail.redSet.length === 1, JSON.stringify(r.detail.redSet));
    seen.push(r.detail.redSet);
    t.record(closeGrade({ declared: true, gap: 'g', stage: st.name, trendValue: new Set(r.detail.redSet).size }));
  }
  assert.deepEqual(seen[0], seen[3]);
  assert.match(seen[0][0], /^bin\/pulselog\.js\|unsure\|/);
  assert.equal(t.struckOut(), true);
  assert.deepEqual(closeGrade({ declared: true, gap: 'g', stage: 's', trendValue: 3 }), { gap: 'g', stage: 's', value: 3 });
});
