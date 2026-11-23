// Part 2 item 8 (ITEM33-BUILD "Part 2 build spec"): the cite of a repo-source review may read `output/review-diff/<path>.diff` (the per-file diff code wrote for a range/branch review) when an item names it and <path> is in files.txt.
// The cite still reads only the files the items name (5 MB cap unchanged). A removed line is quotable through its .diff; one changed word reds. REAL git (tests/range-world.mjs), the real stage runner and CheckBlock rows (as review-cite-row).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runStage } from '../src/kinds.js';
import { CheckBlock } from '../src/checkblock.js';
import { buildShapes } from '../src/shapebuild.js';
import { defaultsOf } from '../src/sourcedefaults.js';
import { writeRangeDiffs } from '../src/rangereview.js';
import { makeRangeWorld } from './range-world.mjs';
import { gitInPatient } from './helpers.js';

const PLAIN = { n: 1, text: 'Review range: v1..v2 for bugs' };
const D = 'output/review-diff';

function signed() {
  const b = new CheckBlock({ texts: { repo: 'src/a.js' }, labels: ['repo'], asks: false, split: true, source: 'repo' });
  b.fromJob([PLAIN]); b.setGuards([], ['output/']); b.reconcile();
  b.setShape(buildShapes({ lines: [PLAIN], labels: ['repo'], suggestions: [], defaultFields: defaultsOf('repo').fields })); b.reconcile();
  return { stage: { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: b.build().stages[0].params }, list: b.signedRows() };
}

/** a real run tree at the range end c1 with the diffs of c0..c1 written; the worker's answer file holds `items` */
async function rowsOf(/** @type {import('node:test').TestContext} */ t, /** @type {any[]} */ items, { diffs = true } = {}) {
  const w = makeRangeWorld(t);
  gitInPatient(w.wt, ['checkout', '-q', '--detach', w.c1]);
  if (diffs) assert.equal((await writeRangeDiffs({ repo: w.repo, worktree: w.wt, a: w.c0, b: w.c1 })).ok, true);
  mkdirSync(path.join(w.wt, 'output', 'steps'), { recursive: true });
  writeFileSync(path.join(w.wt, 'output', 'steps', '1.json'), JSON.stringify({ results: items }));
  const { stage, list } = signed();
  const r = await runStage(stage, { workdir: w.wt, seedRef: 'HEAD', gapKeep: 'close: ', gapCap: 20, list, source: 'repo' });
  const byKey = Object.fromEntries((r.detail?.rows ?? []).map((/** @type {any} */ x) => [x.key, x]));
  return { r, byKey };
}
const REMOVED = { file: `${D}/src/old.js.diff`, quote: 'export const old = 1;', why: 'the range deleted this file' };
const ADDED = { file: `${D}/src/a.js.diff`, quote: '+export const a = 2;', why: 'a changed from 1 to 2' };

test('a REMOVED line (gone from the end state, so only the diff can serve it) is cited through its .diff; an added line too', async (t) => {
  const { r, byKey } = await rowsOf(t, [REMOVED, ADDED]);
  assert.equal(r.verdict, 'green', JSON.stringify(r.gapLines));
  assert.equal(byKey['L1.$cited'].result, 'passed');
});

test('the same removed-line quote against the REPO file reds (it is not in the end state): the diff is what makes it checkable', async (t) => {
  const { r, byKey } = await rowsOf(t, [{ ...ADDED, file: 'src/a.js', quote: 'export const slow = () => { for (;;) break; };' }]);
  assert.equal(r.verdict, 'red');
  assert.match(byKey['L1.$cited'].why, /item 1: its quote is not found word for word/);
});

test('one changed word of a quote taken from a .diff reds on the CITE row with the item named', async (t) => {
  const { r, byKey } = await rowsOf(t, [{ ...REMOVED, quote: 'export const old = 2;' }]);
  assert.equal(r.verdict, 'red');
  assert.equal(byKey['L1.$cited'].result, 'failed');
  assert.match(byKey['L1.$cited'].why, /item 1: its quote is not found word for word/);
});

test('only a .diff of a file in files.txt is nameable: a diff of an unlisted file, files.txt itself, a `..` path and any diff on a run with no diffs are all red in plain words', async (t) => {
  for (const file of [`${D}/src/not-in-range.js.diff`, `${D}/files.txt`, `${D}/../../src/a.js.diff`, `${D}/src/../src/a.js.diff`]) {
    const { r, byKey } = await rowsOf(t, [{ ...ADDED, file }]);
    assert.equal(r.verdict, 'red', file);
    assert.match(byKey['L1.$cited'].why, /item 1: "file" names no per-file diff of this review/, file);
  }
  const none = await rowsOf(t, [ADDED], { diffs: false });
  assert.equal(none.r.verdict, 'red');
  assert.match(none.byKey['L1.$cited'].why, /item 1: "file" names no per-file diff of this review/);
});

test('the cite reads only what the items name: a .diff nobody names does not feed a quote', async (t) => {
  const { r } = await rowsOf(t, [{ ...ADDED, file: 'src/a.js', quote: 'export const slow = () => { for (;;) break; };' }]);
  assert.equal(r.verdict, 'red', 'the removed line sits in src/a.js.diff, which no item names');
});
