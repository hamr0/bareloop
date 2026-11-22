// "Result tab A + Job type everywhere" (docs/product/ITEM33-BUILD.md, hamr 2026-11-21), item 2: when the final close PASSES a review line, code writes ONE report-only `review-findings` spine record
// (line, items {file, quote, why}, plus total/cut and the count of files the range covers), capped like attempt-diff and masked with the run's one scrub; a red line writes none. REAL runner, REAL git
// (tests/range-run-world.mjs), a scripted worker; nothing here is a model or a paid seam.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import path from 'node:path';
import { rangeSession, runIt, cleanup } from './range-run-world.mjs';
import { REVIEW_FINDING_FIELD_MAX, REVIEW_FINDINGS_EVENT_MAX } from '../src/reviewfindings.js';

after(cleanup);

/** the worker's calls: read the file list, then write the answer (the worktree path is a tool argument) */
const script = (/** @type {any} */ f, /** @type {any} */ answer) => [
  { toolCalls: [{ id: 'r1', name: 'shell_read', arguments: { path: path.join(f.prep.tree, 'output', 'review-diff', 'files.txt') } }] },
  { toolCalls: [{ id: 'w1', name: 'shell_write', arguments: { path: path.join(f.prep.tree, 'output', 'steps', '1.json'), content: JSON.stringify(answer) } }] },
  { text: 'wrote' },
];
const ITEM = { file: 'src/a.js', quote: 'export const a = 2;', why: 'the range changed a to 2' };
const recs = (/** @type {any[]} */ spine) => spine.filter((e) => e.type === 'review-findings');
const types = (/** @type {any[]} */ spine) => spine.map((e) => e.type);

test('a green review writes ONE review-findings record for its line: the items as the worker wrote them, the files the range covers, after the verdict and before the door', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review range: v0..v1 for bugs' });
  const r = await runIt(f, { script: script(f, { results: [ITEM] }) });
  assert.match(r.text, /outcome\s+green/, r.text);
  const got = recs(r.spine);
  assert.equal(got.length, 1, 'once per passed review line');
  assert.deepEqual({ line: got[0].line, total: got[0].total, cut: got[0].cut, items: got[0].items, files: got[0].files }, { line: 1, total: 1, cut: false, items: [{ ...ITEM, at: 1 }], files: 3 });
  // `at` = the line the quote starts on in src/a.js (line 1), found by code with the cite's own matcher; the worker never wrote it
  const at = types(r.spine);
  assert.ok(at.indexOf('outer-close') < at.indexOf('review-findings') && at.indexOf('review-findings') < at.indexOf('job-end'), at.join(' '));
  assert.equal(r.spine.findLast((e) => e.type === 'job-end').outcome, 'green', 'the record changed no verdict');
});

test('a secret-shaped value in the worker\'s why is masked by the run\'s one inventory before it reaches the spine', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review range: v0..v1 for bugs' });
  const key = `sk-ant-api03-${'A1b2C3d4'.repeat(6)}`;
  const r = await runIt(f, { script: script(f, { results: [{ ...ITEM, why: `the range hard-codes ${key} in a.js` }] }) });
  assert.match(r.text, /outcome\s+green/, r.text);
  const raw = JSON.stringify(recs(r.spine));
  assert.equal(raw.includes(key), false, 'the key never reaches the record');
  assert.match(recs(r.spine)[0].items[0].why, /^the range hard-codes .* in a\.js$/);
  assert.notEqual(recs(r.spine)[0].items[0].why, `the range hard-codes ${key} in a.js`);
});

test('a field over the cap is cut and many items stop at the event cap, counted in `total`, never silently dropped', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review range: v0..v1 for bugs' });
  const items = Array.from({ length: 12 }, (_, i) => ({ ...ITEM, why: `${i} ${'long words '.repeat(900)}` }));
  const r = await runIt(f, { script: script(f, { results: items }) });
  assert.match(r.text, /outcome\s+green/, r.text);
  const [rec] = recs(r.spine);
  assert.equal(rec.total, 12);
  assert.ok(rec.items.length > 0 && rec.items.length < 12 && rec.cut === true, `${rec.items.length} items kept`);
  for (const it of rec.items) assert.ok(Buffer.byteLength(it.why) <= REVIEW_FINDING_FIELD_MAX && it.why.endsWith('...'));
  assert.ok(Buffer.byteLength(JSON.stringify(rec.items)) <= REVIEW_FINDINGS_EVENT_MAX + 1024);
});

test('a RED review line writes no record: a quote that is not in the file never passes the close', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review range: v0..v1 for bugs' });
  const r = await runIt(f, { script: script(f, { results: [{ ...ITEM, quote: 'this line is not in src/a.js at all' }] }) });
  assert.doesNotMatch(r.text, /outcome\s+green/, r.text);
  assert.equal(recs(r.spine).length, 0);
});
