// REVIEW THE CODE, clean build item 9 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)", decided by hamr 2026-11-20 Q1 A): a red for a file name that is not tracked (or a file over 5 MB) is OWNED BY THE CITE ROW: that row reads `failed` with the plain-words reason,
// never every row `passed` beside a red verdict (the red rode `extraReds`, which no row owned: POC A5, pre-existing). A quote that is not found word for word is the cite row's too, not the item fields'; a failing item field is that field's own row. $0: the real runner on a real repo.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runStage } from '../src/kinds.js';
import { CheckBlock } from '../src/checkblock.js';
import { buildShapes } from '../src/shapebuild.js';
import { defaultsOf } from '../src/sourcedefaults.js';
import { repo, cleanup } from './review-world.mjs';

after(cleanup);
const PLAIN = { n: 1, text: 'List the slow code in src/' };
const good = { file: 'src/slow.js', quote: 'return list.filter((x) => x.ok)', why: 'it sorts on every call' };

/** the signed rows and the stage of a repo-source review, as the drafter makes them */
function signed() {
  const b = new CheckBlock({ texts: { repo: 'src/slow.js' }, labels: ['repo'], asks: false, split: true, source: 'repo' });
  b.fromJob([PLAIN]); b.setGuards([], ['output/']); b.reconcile();
  b.setShape(buildShapes({ lines: [PLAIN], labels: ['repo'], suggestions: [], defaultFields: defaultsOf('repo').fields })); b.reconcile();
  return { stage: { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: b.build().stages[0].params }, list: b.signedRows() };
}

/** run the stage on a worktree holding `items`; the per-row results the runner records */
async function rowsOf(/** @type {any[]} */ items) {
  const dir = repo();
  mkdirSync(path.join(dir, 'output', 'steps'), { recursive: true });
  writeFileSync(path.join(dir, 'output', 'steps', '1.json'), JSON.stringify({ results: items }));
  const { stage, list } = signed();
  const r = await runStage(stage, { workdir: dir, seedRef: 'HEAD', gapKeep: 'close: ', gapCap: 20, list, source: 'repo' });
  const byKey = Object.fromEntries((r.detail?.rows ?? []).map((/** @type {any} */ x) => [x.key, x]));
  return { r, byKey, unclaimed: r.detail?.unclaimed ?? [] };
}
const resultsOf = (/** @type {Record<string, any>} */ byKey) => Object.fromEntries(Object.entries(byKey).map(([k, v]) => [k, v.result]));

test('a real answer: every row passed', async () => {
  const { r, byKey } = await rowsOf([good]);
  assert.equal(r.verdict, 'green', JSON.stringify(r.gapLines));
  assert.ok(Object.keys(byKey).includes('L1.$cited'));
  assert.ok(Object.values(byKey).every((x) => x.result === 'passed'), JSON.stringify(resultsOf(byKey)));
});

test('an item whose file is not tracked: the CITE row reads failed with the plain-words reason, the item-field rows pass, nothing is left unowned', async () => {
  const { r, byKey, unclaimed } = await rowsOf([good, { ...good, file: 'src/not-a-tracked-file.js' }]);
  assert.equal(r.verdict, 'red');
  assert.equal(byKey['L1.$cited'].result, 'failed', JSON.stringify(resultsOf(byKey)));
  assert.match(byKey['L1.$cited'].why, /item 2: "file" names no file of the repo \("src\/not-a-tracked-file\.js"\); write the path of one tracked file as the repo lists it/);
  for (const k of ['L1.shape.file', 'L1.shape.quote', 'L1.shape.why']) assert.equal(byKey[k]?.result ?? 'passed', 'passed', k);
  assert.deepEqual(unclaimed, []);
});

test('one changed word of a quote: the CITE row fails (not the item-field rows) with the item named', async () => {
  const { r, byKey } = await rowsOf([{ ...good, quote: 'return list.filter((x) => x.okzq)' }]);
  assert.equal(r.verdict, 'red');
  assert.equal(byKey['L1.$cited'].result, 'failed');
  assert.match(byKey['L1.$cited'].why, /item 1: its quote is not found word for word/);
  for (const k of ['L1.shape.file', 'L1.shape.quote', 'L1.shape.why']) assert.equal(byKey[k]?.result ?? 'passed', 'passed', `${k} is not the cite's`);
});

test('an empty `why`: that field\'s own row fails in plain words; the cite row passes', async () => {
  const { r, byKey } = await rowsOf([{ ...good, why: '' }]);
  assert.equal(r.verdict, 'red');
  assert.equal(byKey['L1.shape.why'].result, 'failed');
  assert.match(byKey['L1.shape.why'].why, /too short/);
  assert.equal(byKey['L1.$cited'].result, 'passed');
});
