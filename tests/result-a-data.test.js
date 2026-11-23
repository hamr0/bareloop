// "Result tab A + Job type everywhere" (docs/product/ITEM33-BUILD.md, hamr 2026-11-21), item 3: the server payload. REAL records: hamr's live walk-branch review (run mwqnkvx5, tests/fixtures/result-a; the findings record is the real
// writer's output on that run's real tree: 4 findings, 56 files) and the archived change run mvkj03w7. A green review lists its findings with NO step file on disk; an older run (no record) falls back to today's tab.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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
  assert.equal(r.findings.items[0].short, 'The `!== undefined` guard means a close that\u2026');
  assert.ok(r.findings.items[0].why.length > r.findings.items[0].short.length && r.findings.items[0].quote.startsWith('  if (closeDecl.source'));
  assert.equal(r.findings.cut, false);
  assert.equal(r.findings.cite, 'each quote found in its file', 'the close\'s own cite row passed');
  assert.equal(r.covers, 'covers main..chore/barebrowse-031 · 56 files changed');
  assert.deepEqual(r.ran, { steps: 1, tries: 1, line: '1 step · 1 try' });
});

test('FINDINGS closed-row words are made in code: the basename, the line the record holds (none on an older record, never guessed), and the first 8 words of the why with a cut mark only when words were cut', () => {
  const w = makeReviewWorld({ spine: 'u-mwqnkvx5-findings.jsonl', manifest: RANGE });
  const old = getRunResult(w.runid, { home: w.home }).findings.items;
  assert.deepEqual(old.map((x) => x.base), ['declaredclose.js', 'reviewpick.js', 'reviewpick.js', 'authorsession.js']);
  assert.deepEqual(old.map((x) => x.at), [null, null, null, null], 'a record written before the line was captured shows the name alone');
  // the same real record with the writer's new `at` on two items, and one short why
  const lines = readFileSync(w.spine, 'utf8').split('\n').map((l) => {
    if (!l.includes('"review-findings"')) return l;
    const rec = JSON.parse(l);
    rec.items[0].at = 88; rec.items[3].at = 12; rec.items[3].why = 'five words are all here';
    return JSON.stringify(rec);
  });
  writeFileSync(w.spine, lines.join('\n'));
  const items = getRunResult(w.runid, { home: w.home }).findings.items;
  assert.deepEqual(items.map((x) => x.at), [88, null, null, 12]);
  assert.equal(items[0].short.split(' ').length, 8);
  assert.ok(items[0].short.endsWith('\u2026') && items[0].why.startsWith(items[0].short.slice(0, -1)));
  assert.equal(items[3].short, 'five words are all here', 'no cut mark when the why is already short');
  assert.equal(items[3].file, 'src/panel/authorsession.js', 'the full path stays for the opened row');
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
