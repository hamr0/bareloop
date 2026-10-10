// F192 (e) item 1 — a judged stage may only judge files the run is allowed to edit.
// REAL spec: run mv13ery3's signed resolved-spec.json. Its judged stage pointed at bin/pulselog.js while the
// job's writeScope was ["src/**"]; the judge was "unsure" four times and the worker could never fix it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCloseDecl } from '../src/declaredclose.js';
import { validateJob } from '../src/job.js';
import { judgedOutsideFence } from '../src/authoring.js';
import { signingReasons } from '../src/authorreadout.js';

const SPEC = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'f192-live-mv13ery3.json'), 'utf8'));
const withPaths = (/** @type {string[]} */ paths) => {
  const c = structuredClone(SPEC);
  c.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'judged-floor').params.paths = paths;
  return c;
};
const codes = (/** @type {any} */ r) => r.reds.map((/** @type {any} */ x) => x.code);

test('the real mv13ery3 declaration reds at the deferred gate: judged path bin/pulselog.js is outside src/**', () => {
  const v = validateCloseDecl(SPEC.closeDecl, { deferListing: true, verdictType: SPEC.verdictType, writeScope: SPEC.writeScope });
  const r = v.reds.find((/** @type {any} */ x) => x.code === 'judged-outside-write-scope');
  assert.ok(r, JSON.stringify(v.reds));
  assert.deepEqual(r.outside, ['bin/pulselog.js']);
  assert.equal(v.ok, false);
});

test('the same spec with the judged path under src/ passes', () => {
  const s = withPaths(['src/backup.js']);
  const v = validateCloseDecl(s.closeDecl, { deferListing: true, verdictType: s.verdictType, writeScope: s.writeScope });
  assert.deepEqual(codes(v), []);
  assert.equal(v.ok, true);
});

test('validateJob (the hand-written / reused door) carries the same rule', () => {
  assert.ok(codes(validateJob(SPEC)).includes('judged-outside-write-scope'));
  assert.ok(!codes(validateJob(withPaths(['src/backup.js']))).includes('judged-outside-write-scope'));
});

test('no fence supplied: the rule is not run (plain-folder deferral)', () => {
  const v = validateCloseDecl(SPEC.closeDecl, { deferListing: true, verdictType: SPEC.verdictType });
  assert.ok(!codes(v).includes('judged-outside-write-scope'));
});

test('matcher: prefix containment, shipped spelling, no look-alike dirs', () => {
  assert.deepEqual(judgedOutsideFence(['src/a.js', 'src/x/b.js', 'src'], ['src/**']), []);
  assert.deepEqual(judgedOutsideFence(['src2/a.js', 'bin/p.js', './src/a.js'], ['src/']), ['src2/a.js', 'bin/p.js']);
  assert.deepEqual(judgedOutsideFence(['a/b.js'], ['src/**', 'a/']), []);
});

test('the plain sentence names the file and the edit area', () => {
  const v = validateCloseDecl(SPEC.closeDecl, { deferListing: true, verdictType: SPEC.verdictType, writeScope: SPEC.writeScope });
  const [s] = signingReasons(v.reds.filter((/** @type {any} */ x) => x.code === 'judged-outside-write-scope'));
  assert.equal(s.sentence, 'The rubric check looks at bin/pulselog.js, but the job may only edit src — so the run could never fix what it finds.');
});
