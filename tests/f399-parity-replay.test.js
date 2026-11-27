// F399 parity pins, Replay (CLI and panel) (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Replay").
// Fixtures: trimmed REAL spines (tests/fixtures: f399/mv5e1ktb green, audit-grid mvtatlxw fix loop, f399/mwtf8p8s no final close). A red final close WITH an iteration is not in any real spine
// (the red closes are the fix loop's, with no declared stages), so that case is a real spine plus ONE planted close record, said in the test.
// Expected lines are built from the records by a plain scan (tests/f399-raw.mjs), never read back through a reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayRun, formatReplay } from '../src/replay.js';
import { spineAt, rawClose } from './f399-raw.mjs';

const closeSection = (/** @type {any[]} */ recs) => { const t = formatReplay(replayRun(recs)).split('\n'); return t[t.indexOf('CLOSE') + 1]; };
const stageWords = (/** @type {any[]} */ stages) => {
  const red = stages.findIndex((s) => s.verdict !== 'satisfied');
  const ordered = red === -1 ? stages : [stages[red], ...stages.filter((_, i) => i !== red)];
  return ordered.map((s) => (s.verdict !== 'satisfied' ? `✗ ${s.name} FAIL(${s.verdict})` : `${s.name} OK`)).join(' · ');
};

test('replay-close-line-parity (source, verdict, stages): the CLOSE line is the final close record\'s verdict and each stage OK / FAIL (real mv5e1ktb outer-close; real mvtatlxw already-green leg)', () => {
  for (const f of ['f399/mv5e1ktb/u-mv5e1ktb.jsonl', 'audit-grid/u-mvtatlxw.jsonl']) {
    const recs = spineAt(f);
    const c = rawClose(recs);
    assert.equal(closeSection(recs), `  ${c.verdict} · ${c.stages.length} stages: ${stageWords(c.stages)}`, f);
  }
});

test('replay-close-line-words-parity: a close with an iteration says "iteration N ·" first, and a red stage reads FAIL(its verdict) and comes first (planted close-verdict on real mv5e1ktb)', () => {
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl');
  const stages = [{ name: 'changed-from-seed', verdict: 'satisfied' }, { name: 'line-1-releases', verdict: 'needs_revision' }];
  const planted = recs.map((r) => (r.type === 'outer-close' ? { type: 'close-verdict', iteration: 2, verdict: 'needs_revision', stages } : r));
  assert.equal(closeSection(planted), `  iteration 2 · needs_revision · 2 stages: ${stageWords(stages)}`);
  assert.equal(closeSection(planted), '  iteration 2 · needs_revision · 2 stages: ✗ line-1-releases FAIL(needs_revision) · changed-from-seed OK');
  // a timed-out stage keeps ITS OWN verdict word
  const timed = recs.map((r) => (r.type === 'outer-close' ? { ...r, verdict: 'timed-out', stages: [{ name: 'x', verdict: 'timed-out' }] } : r));
  assert.equal(closeSection(timed), '  timed-out · 1 stages: ✗ x FAIL(timed-out)');
});

test('replay-close-none-parity: a run whose last leg ran no staged close says "none — the run ended before any close ran" (real mwtf8p8s: its close timed out at the precheck)', () => {
  const recs = spineAt('f399/mwtf8p8s/u-mwtf8p8s.jsonl');
  assert.equal(rawClose(recs), null);
  assert.equal(closeSection(recs), '  none — the run ended before any close ran');
});

test('replay-iteration-close-line-parity: an iteration row of a loop-shape run carries "close: <verdict> — <failing stage>" from its own close-verdict (HAND-BUILT old-style loop spine: no real fixture has one)', () => {
  let seq = 0;
  const at = (/** @type {number} */ n) => `2026-11-01T08:00:${String(n).padStart(2, '0')}.000Z`;
  const stages = [{ name: 'typecheck', verdict: 'satisfied' }, { name: 'suite-green', verdict: 'needs_revision' }];
  const recs = [
    { type: 'job-start', job: 'j', goal: 'g', ts: at(0) }, { type: 'run-start', ts: at(1) }, { type: 'iteration-start', iteration: 1, ts: at(2) },
    { type: 'worker-round', ts: at(3), usage: {} }, { type: 'middle-done', iteration: 1, ts: at(4) },
    { type: 'close-verdict', iteration: 1, verdict: 'needs_revision', stages, ts: at(5) },
    { type: 'run-end', outcome: 'cap-halt', ts: at(6) }, { type: 'job-end', outcome: 'cap-halt', ts: at(7) },
  ].map((r) => ({ ...r, seq: seq++ }));
  const text = formatReplay(replayRun(recs));
  const failing = stages.filter((s) => s.verdict !== 'satisfied').map((s) => s.name).join(', ');
  assert.ok(text.includes(`     ↳ close: needs_revision — ${failing}`), text);
  // an iteration whose close passed says no failing stage
  const green = recs.map((r) => (r.type === 'close-verdict' ? { ...r, verdict: 'satisfied', stages: stages.map((s) => ({ ...s, verdict: 'satisfied' })) } : r));
  assert.ok(formatReplay(replayRun(green)).includes('↳ close: satisfied'));
});

test('replay-fixloop-sequence-parity: the FIX LOOP line lists the opening precheck and each iteration with ✓ / ✗ (real mvtatlxw: precheck red then 3 red tries; real mv5e1ktb: precheck green)', () => {
  const fixLine = (/** @type {any[]} */ recs) => { const t = formatReplay(replayRun(recs)).split('\n'); return t[t.findIndex((l) => l.startsWith('FIX LOOP')) + 1]; };
  const grid = spineAt('audit-grid/u-mvtatlxw.jsonl');
  const pre = grid.find((r) => r.type === 'outer-close');
  assert.equal(pre.verdict, 'needs_revision');
  assert.equal(fixLine(grid), '  precheck ✗ · iter 1 ✗ · iter 2 ✗ · iter 3 ✗');
  const ok = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl');
  assert.equal(ok.find((r) => r.type === 'outer-close').verdict, 'satisfied');
  assert.equal(fixLine(ok), '  precheck ✓');
});
