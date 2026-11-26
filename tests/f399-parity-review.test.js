// F399 parity pins, Review (D review) (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Review").
// Fixture: the trimmed REAL spine of the live walk-branch review (tests/fixtures/result-a: mwqnkvx5, a green repo review with 4 findings, its report landed under docs/).
// No real run holds a report still STAGED under output/ (the archived one landed at once), so the staged -> landed pair is the real spine plus PLANTED report-staged and destination-written records,
// and the report's bytes are planted files in the real shape. Expected values are the records' own fields by a plain scan (tests/f399-raw.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRunResult } from '../src/panel/server.js';
import { outputOf } from '../src/runread.js';
import { deliveredReporter } from '../src/resultmd.js';
import { makeReviewWorld } from './result-a-world.mjs';
import { spineAt, specAt } from './f399-raw.mjs';

const RANGE = { range: { a: 'fc56e1f39aaa469df09129edb8714d55c59a783c', b: 'c30cab1c2ed21827bd938675c4fd8dae42725f7d' } };
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');

test('review-covers-parity: "covers A..B · N files changed" is the signed range token and the files count of the run\'s review-findings record (real mwqnkvx5)', () => {
  const raw = spineAt('result-a/u-mwqnkvx5-findings.jsonl').find((r) => r.type === 'review-findings');
  assert.equal(raw.files, 56);
  const w = makeReviewWorld({ spine: 'u-mwqnkvx5-findings.jsonl', manifest: RANGE });
  const r = getRunResult(w.runid, { home: w.home });
  assert.equal(r.covers, `covers main..chore/barebrowse-031 · ${raw.files} files changed`);
  // "How it ran": the step and try counts of the spine's own records
  const rec = spineAt('result-a/u-mwqnkvx5-findings.jsonl');
  const steps = new Set(rec.filter((x) => x.type === 'step-start').map((x) => x.step ?? x.id ?? x.name)).size;
  const tries = rec.filter((x) => x.type === 'iteration-start').length;
  assert.equal(r.ran.line, `${steps} step${steps === 1 ? '' : 's'} · ${tries} ${tries === 1 ? 'try' : 'tries'}`);
  assert.equal(outputOf(spineAt('result-a/u-mwqnkvx5-findings.jsonl').map((r) => (r.type === 'review-findings' ? { ...r, files: 1 } : r)), null)?.findings?.files, 1);
});

test('review-report-staged-landed-parity: a report is staged under output/ until an honoured Accept, which REPLACES the staged name with the landed one; the landed record is the real one (real mwqnkvx5 destination-written; planted staged record)', () => {
  const recs = spineAt('result-a/u-mwqnkvx5-findings.jsonl');
  const landed = recs.find((r) => r.type === 'destination-written');
  const real = outputOf(recs, null);
  assert.deepEqual(real?.files.map((f) => [f.role, f.path, f.bytes, f.sha256]), [['delivered', landed.path, landed.bytes, landed.sha256]]);
  const staged = { type: 'report-staged', path: '/repo/output/walk-branch-2026-11-21.md', bytes: 3989, sha256: landed.sha256 };
  const before = recs.filter((r) => r.type !== 'destination-written').flatMap((r) => (r.type === 'job-end' ? [staged, r] : [r]));
  const o = outputOf(before, null);
  assert.deepEqual(o?.files.map((f) => [f.role, f.path]), [['staged', staged.path]]);
  assert.equal(o?.kind, 'review');
  const after = [...before, { ...landed, staged: staged.path }];
  assert.deepEqual(outputOf(after, null)?.files.map((f) => [f.role, f.path]), [['delivered', landed.path]], 'the Accept replaces the staged name');
});

test('review-report-content-parity: the report text the reader returns is the landed file\'s bytes while its sha256 still matches; edited or removed it is a STATE, never stale bytes (planted report file)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f399rv-'));
  try {
    const body = '# j — run-1\nPassed · 1 Nov 2026\n\n## 1. Review\n\n#### Item 1 · src/a.js\n';
    const path = join(dir, 'walk-branch-2026-11-21.md');
    writeFileSync(path, body);
    const recs = spineAt('result-a/u-mwqnkvx5-findings.jsonl').map((r) => (r.type === 'destination-written' ? { ...r, path, bytes: Buffer.byteLength(body), sha256: sha(body) } : r));
    const ok = outputOf(recs, null, { read: true })?.files[0];
    assert.equal(ok?.state, 'ok');
    assert.equal(ok?.content?.toString('utf8'), body);
    writeFileSync(path, `${body}edited`);
    const changed = outputOf(recs, null, { read: true })?.files[0];
    assert.deepEqual([changed?.state, changed?.content], ['changed', null]);
    rmSync(path);
    assert.deepEqual([outputOf(recs, null, { read: true })?.files[0].state, outputOf(recs, null, { read: true })?.files[0].content], ['gone', null]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('review-report-writer-words: the report the run writes keeps its code-owned words: "Checked by code" bullet, the AI\'s answer unchecked heading, "Not checked" line (real specs of mwqnkvx5 and mv5e1ktb, step files planted in their real shape)', () => {
  const review = specAt('result-a/mwqnkvx5.resolved-spec.json');
  const buf = Buffer.from(JSON.stringify({ results: [{ file: 'src/a.js', quote: 'x', why: 'y' }] }));
  const md = deliveredReporter({ closeDecl: review.closeDecl, jobLines: review.jobLines, job: 'j', runNo: 1, now: new Date('2026-11-01T00:00:00Z') })([{ rel: 'steps/1.json', orig: buf, delivered: buf }]);
  assert.ok(md?.includes('Checked by code: each quote below is found word for word in the file its item names (1 item).'), md ?? '');
  assert.ok(md?.includes('Not checked: whether each one is true (you judge it at Accept)'));
  assert.ok(md?.includes('**Why:** y') && md.includes('> x'));
  const text = specAt('f399/mv5e1ktb/resolved-spec.json');
  const t = Buffer.from(JSON.stringify({ text: 'v0.3.1', cites: {} }));
  const md2 = deliveredReporter({ closeDecl: text.closeDecl, jobLines: text.jobLines, job: 'j', runNo: 1, now: new Date('2026-11-01T00:00:00Z') })([{ rel: 'steps/1.json', orig: t, delivered: t }]);
  assert.ok(md2?.includes("### The AI's answer (not checked — you judge it at Accept)\nv0.3.1"), md2 ?? '');
});
