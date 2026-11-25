// F399: the two readers (src/runread.js). Spines are REAL archived runs (tests/fixtures: audit-grid mvtatlxw, final-close mwue75ih, already-green-result mwvwcxvy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksOf, outputOf, fileState } from '../src/runread.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (/** @type {string} */ f) => readFileSync(join(FX, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const GRID = load('audit-grid/u-mvtatlxw.jsonl');
const MWUE = load('final-close/u-mwue75ih.jsonl');
const GREEN = load('already-green-result/u-mwvwcxvy.jsonl');
const GREEN_SPEC = JSON.parse(readFileSync(join(FX, 'already-green-result/mwvwcxvy.resolved-spec.json'), 'utf8'));

test('checksOf reads the CURRENT leg only: an already-green leg 2 names its own satisfied precheck, never leg 1\'s red close', () => {
  const c = checksOf(GRID, null);
  assert.equal(c.source, 'close-precheck');
  assert.equal(c.verdict, 'satisfied');
  assert.equal(c.closeReached, true);
  assert.equal(c.failingStage, null);
  assert.ok(c.stages.length > 0 && [...c.stageVerdict.values()].every((v) => v === 'passed'));
  assert.ok(c.leg.records.includes(c.close));
});

test('checksOf on a resumed already-green run (mwue75ih, mwvwcxvy): close reached, no failing stage', () => {
  for (const spine of [MWUE, GREEN]) {
    const c = checksOf(spine, null);
    assert.equal(c.closeReached, true);
    assert.equal(c.failingStage, null);
    assert.equal(c.outcome, 'already-green');
  }
});

test('checksOf rows: the final close\'s own per-row record, with the stage fork table keyed by the signed stage kind', () => {
  const c = checksOf(GREEN, null, { spec: GREEN_SPEC });
  assert.ok(c.rows.size >= 1);
  for (const [k, v] of c.rows) assert.equal(v.result, 'passed', k);
  assert.deepEqual(c.notReached, []);
});

test('checksOf: an empty spine reads null, a spine with no close says closeReached false', () => {
  assert.equal(checksOf([], null), null);
  const c = checksOf([{ seq: 1, type: 'job-start' }, { seq: 2, type: 'job-end', outcome: 'cap-halt' }], null);
  assert.equal(c.closeReached, false);
  assert.equal(c.source, null);
  assert.equal(c.failingStage, null);
});

test('checksOf.fence: a `fence` record per leg is summed over every leg; none -> the old-run fallback, none of those -> null', () => {
  const base = [{ type: 'job-start' }, { type: 'fence', held: true, blocked: 2 }, { type: 'job-end', outcome: 'escalated' }, { type: 'leg-resume' }, { type: 'job-start' }, { type: 'fence', held: true, blocked: 3 }, { type: 'job-end', outcome: 'green' }];
  assert.deepEqual(checksOf(base, null).fence, { held: true, blocked: 5 });
  const none = [{ type: 'job-start' }, { type: 'job-end', outcome: 'green' }];
  assert.equal(checksOf(none, null).fence, null);
  assert.deepEqual(checksOf(none, null, { auditBlocked: () => 4 }).fence, { held: true, blocked: 4 });
  assert.equal(checksOf(none, null, { auditBlocked: () => null }).fence, null);
  assert.deepEqual(checksOf(base, null, { auditBlocked: () => 99 }).fence, { held: true, blocked: 5 }, 'a record wins over the sidecar');
});

test('outputOf reads the WHOLE run: files and edits from an earlier leg stay; an Accept replaces the staged name', () => {
  const sp = [
    { type: 'job-start' }, { type: 'attempt-diff', step: 's1', files: [{ path: 'a.js', diff: '+x' }] }, { type: 'report-staged', path: '/x/out/r.md', bytes: 3, sha256: 'aa' }, { type: 'job-end', outcome: 'green' },
    { type: 'leg-resume' }, { type: 'job-start' }, { type: 'attempt-diff', step: 's2', files: [{ path: 'b.js', diff: '-y' }], binary: ['c.png'] },
    { type: 'destination-written', path: '/dest/r-2026-11-25.md', staged: '/x/out/r.md', bytes: 3, sha256: 'aa' }, { type: 'job-end', outcome: 'green' },
  ];
  const o = outputOf(sp, null);
  assert.deepEqual(o.changed, ['a.js', 'b.js', 'c.png']);
  assert.equal(o.diffs.length, 2);
  assert.deepEqual(o.files.map((f) => `${f.role}:${f.path}`), ['delivered:/dest/r-2026-11-25.md']);
  assert.equal(o.files[0].replaces, '/x/out/r.md');
  assert.equal(o.kind, 'files');
});

test('outputOf.landing: the work-committed record wins over nothing; the work branch alone reads folderKept null', () => {
  const only = outputOf([{ type: 'job-start' }, { type: 'work-branch', branch: 'bl/x', base: 'abcdef1234' }, { type: 'job-end', outcome: 'green' }], null);
  assert.equal(only.landing.branch, 'bl/x');
  assert.equal(only.landing.commit, null);
  assert.equal(only.landing.folderKept, null);
  const both = outputOf([{ type: 'job-start' }, { type: 'work-branch', branch: 'bl/x', base: 'abcdef1234' }, { type: 'work-committed', branch: 'bl/x', commit: 'deadbeef', folderKept: true }, { type: 'job-end', outcome: 'green' }], null);
  assert.equal(both.landing.commit, 'deadbeef');
  assert.equal(both.landing.folderKept, true);
});

test('fileState: ok / gone / changed, and stale bytes are never returned', () => {
  const d = mkdtempSync(join(tmpdir(), 'runread-'));
  try {
    const p = join(d, 'f.json');
    writeFileSync(p, 'hello');
    const sha = createHash('sha256').update('hello').digest('hex');
    assert.equal(fileState({ path: p, sha256: sha }).state, 'ok');
    assert.equal(fileState({ path: join(d, 'nope'), sha256: sha }).state, 'gone');
    const ch = fileState({ path: p, sha256: 'bad' });
    assert.equal(ch.state, 'changed');
    assert.equal(ch.buf, null);
    assert.equal(outputOf([{ type: 'job-start' }, { type: 'destination-written', path: p, bytes: 5, sha256: sha }], null, { read: true }).files[0].content.toString(), 'hello');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
