// PRD v1.107 Part 6 (fix 1): a RED rubric run shows the rows of the last file its check judged, never a ✓. A red run delivers nothing, so the rows come
// from the run's own `output-judged` spine record {step, iteration, path, bytes, sha256}, resolved against the run's own tree, sha256-checked.
//
// FIXTURE HONESTY: there is NO archived red spine that carries an `output-judged` record (mvdg1xo3 predates the record; mve5y8fa predates it too).
// So the red case below is a RE-SHAPE, not a real red run: the real mve5y8fa spine with its job-end turned step-red, its destination-written records
// dropped, and one `output-judged` record appended whose path/bytes/sha256 are the REAL step file's (tests/fixtures/part5/mve5y8fa.step-1-*.json,
// sha-checked against the real seq 48 record). The record's shape is the one src/planrun.js ~3445 emits.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  copyFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync, rmSync, symlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { createPanelServer } from '../src/panel/server.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'part5');
const STEP = join(FX, 'mve5y8fa.step-1-2026-10-18.json');
const STEP_SHA = 'b4edf688a9109205ec33d6a97c2e917da5b617821fe0ff96e7414e64a5f0b0b6';

async function world({ record = true } = {}) {
  assert.equal(createHash('sha256').update(readFileSync(STEP)).digest('hex'), STEP_SHA, 'the fixture is the real run\'s delivered file');
  const w = makePart5World();
  const spine = w.spine('mve5y8fa');
  const lines = readFileSync(spine, 'utf8').split('\n').filter((l) => l && !l.includes('"type":"destination-written"'));
  const out = lines.map((l) => l.replace('"type":"job-end","outcome":"green"', '"type":"job-end","outcome":"step-red"'));
  assert.ok(out.some((l) => l.includes('"outcome":"step-red"')), 're-shaped: the run is red');
  if (record) out.push(JSON.stringify({ type: 'output-judged', step: 'write-flight-facts', iteration: 1, path: 'output/steps/1.json', bytes: 1473, sha256: STEP_SHA, seq: 9999 }));
  writeFileSync(spine, `${out.join('\n')}\n`);
  // the run's tree: row.patient is null here, so the source-seed `tree/` (server.js treeRootForRun)
  const tree = join(w.out('mve5y8fa'), 'source-seed', 'tree');
  const file = join(tree, 'output', 'steps', '1.json');
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(STEP, file);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  const { port, close } = await createPanelServer({ port: 0, home: w.home, schedulerIntervalMs: 0 });
  test.after(() => close());
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); const t = await r.text(); let body = t; try { body = JSON.parse(t); } catch { /* text */ } return { status: r.status, body, raw: t }; };
  return { ...w, tree, file, get };
}
const line0 = async (w) => (await w.get('/api/runs/mve5y8fa/result')).body.lines[0];

test('red: the rows are the last judged file\'s results[], with no ✓ basis (passed false), judged flagged, nothing delivered', async () => {
  const w = await world();
  const res = (await w.get('/api/runs/mve5y8fa/result')).body;
  const file = JSON.parse(readFileSync(STEP, 'utf8'));
  const l = res.lines[0];
  assert.equal(l.passed, false);
  assert.equal(l.rows.length, file.results.length);
  l.rows.forEach((r, i) => assert.equal(r.quote, file.results[i].quote));
  assert.deepEqual(l.file, { i: null, state: 'ok', words: null, judged: true, note: 'a red run delivers nothing; these rows are the last file the check read' });
  assert.deepEqual(res.delivered, []);
});

test('red: a file changed after the check, or gone, is words and never stale content', async () => {
  const w = await world();
  writeFileSync(w.file, readFileSync(STEP, 'utf8').replace('144', '145'));
  let l = await line0(w);
  assert.equal(l.file.state, 'changed');
  assert.equal(l.file.words, 'the file changed after the check');
  assert.equal(l.rows, null);
  assert.equal(JSON.stringify(l).includes('145'), false);
  rmSync(w.file);
  l = await line0(w);
  assert.equal(l.file.state, 'gone');
  assert.equal(l.file.words, 'the file is gone');
  assert.equal(l.rows, null);
});

test('red: an old spine with no output-judged record keeps "no result saved" (file null, rows null) even if a file sits in the tree', async () => {
  const w = await world({ record: false });
  const l = await line0(w);
  assert.equal(l.file, null);
  assert.equal(l.rows, null);
});

test('red: the path is the signed close\'s step file in the run\'s own tree — a record naming another path, or a tree that escapes by symlink, shows nothing', async () => {
  const w = await world();
  // a record for some other path, same bytes: not the line's file
  const spine = w.spine('mve5y8fa');
  writeFileSync(spine, readFileSync(spine, 'utf8').replace('"path":"output/steps/1.json"', '"path":"../elsewhere/1.json"'));
  assert.equal((await line0(w)).file, null, 'only the signed step file\'s own path is read');
  writeFileSync(spine, readFileSync(spine, 'utf8').replace('"path":"../elsewhere/1.json"', '"path":"output/steps/1.json"'));
  // output/ is now a symlink out of the tree to a dir holding identical bytes
  const outside = join(w.out('mve5y8fa'), 'outside');
  mkdirSync(join(outside, 'steps'), { recursive: true });
  copyFileSync(STEP, join(outside, 'steps', '1.json'));
  rmSync(join(w.tree, 'output'), { recursive: true });
  symlinkSync(outside, join(w.tree, 'output'));
  const l = await line0(w);
  assert.equal(l.file.state, 'gone');
  assert.equal(l.rows, null);
});
