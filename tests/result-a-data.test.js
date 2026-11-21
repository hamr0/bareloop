// "Result tab A + Job type everywhere" (docs/product/ITEM33-BUILD.md, hamr 2026-11-21), item 3: the server payload. REAL records: hamr's live walk-branch review (run mwqnkvx5, tests/fixtures/result-a; the findings record is the real
// writer's output on that run's real tree: 4 findings, 56 files) and the archived change run mvkj03w7. A green review lists its findings with NO step file on disk; an older run (no record) falls back to today's tab.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRunResult } from '../src/panel/server.js';
import { makeReviewWorld } from './result-a-world.mjs';
import { makeResultWorld } from './result-tab-world.mjs';

const RANGE = { range: { a: 'fc56e1f39aaa469df09129edb8714d55c59a783c', b: 'c30cab1c2ed21827bd938675c4fd8dae42725f7d' } };

test('a green repo review shows its 4 findings from the spine record, with no step file on disk (the walk-branch defect: "no saved result to show")', () => {
  const w = makeReviewWorld({ spine: 'u-mwqnkvx5-findings.jsonl', manifest: RANGE });
  const r = getRunResult(w.runid, { home: w.home });
  assert.equal(r.lines[0].shape, null, 'the old path has nothing to draw: no delivered step file, no run folder');
  assert.equal(r.findings.total, 4);
  assert.deepEqual(r.findings.items.map((x) => x.file), ['src/declaredclose.js', 'src/reviewpick.js', 'src/reviewpick.js', 'src/panel/authorsession.js']);
  assert.match(r.findings.items[0].first, /^The `!== undefined` guard means a close that carries `source: null`/);
  assert.ok(r.findings.items[0].why.length > r.findings.items[0].first.length - 1 && r.findings.items[0].quote.startsWith('  if (closeDecl.source'));
  assert.equal(r.findings.cut, false);
  assert.equal(r.findings.cite, 'each quote found in its file', 'the close\'s own cite row passed');
  assert.equal(r.covers, 'covers main..chore/barebrowse-031 · 56 files changed');
  assert.deepEqual(r.ran, { steps: 1, tries: 1, line: '1 step · 1 try' });
});

test('an older run (no review-findings record) falls back to today\'s tab: no findings, the same line cards, and the Job type still says Review', () => {
  const w = makeReviewWorld({ manifest: RANGE });
  const r = getRunResult(w.runid, { home: w.home });
  assert.equal(r.findings, undefined);
  assert.equal(r.lines[0].kind, 'shape');
  assert.equal(r.jobType, 'Job type: Review code');
  assert.equal(r.covers, undefined, 'the old tab is drawn as it was: A\'s covers line belongs to a run with the record');
});

test('a change job\'s WHAT CHANGED rows are one per file, +a −r equal to changedOf\'s totals, the diff of the file\'s last edit', () => {
  const w = makeResultWorld(['mvkj03w7']);
  const r = getRunResult('mvkj03w7', { home: w.home });
  const c = r.changed;
  assert.ok(c.byFile.length >= 1 && c.byFile.length === c.files, `${c.byFile.length} rows for ${c.files} files`);
  assert.deepEqual([c.byFile.reduce((a, f) => a + f.plus, 0), c.byFile.reduce((a, f) => a + f.minus, 0)], [c.plus, c.minus]);
  for (const f of c.byFile) assert.ok(c.paths.includes(f.path));
  assert.ok(c.byFile.some((f) => f.diff.includes('@@')), 'a file row carries its diff');
  assert.match(r.ran.line, /^\d+ steps? · \d+ tr(y|ies)$/);
  assert.ok(Array.isArray(r.job.lines));
});
