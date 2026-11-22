// hamr's ruling: ONE Destination record. A repo change job's Destination is the signed spec's writeScope; the manifest's own copy (written at prepare time) goes stale
// when a Destination question changes the answer, so the Job tab must never read it for such a job. A plain-folder job keeps its per-run manifest drop-off.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunJob } from '../src/panel/server.js';
import { keysHome, makeRun, specOf } from './trigger-world.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dest-one-record');
/** a run whose manifest is the fixture file, its signed spec fenced at `writeScope` */
function world(manifestFile, spec) {
  const home = keysHome();
  const run = makeRun(home, { runid: 'r1', spec });
  copyFileSync(join(FIX, manifestFile), join(run.out, 'source-seed', 'source.json'));
  return { home };
}

test('a repo change job whose Destination changed shows the signed fence on the Job tab, not the stale manifest copy', () => {
  const { home } = world('repo-stale-source.json', { ...specOf(), writeScope: ['src/', 'scripts/', 'bin/', 'tests/'] });
  assert.equal(getRunJob('r1', { home }).destination, 'src/, scripts/, bin/, tests/');
});

test('an old-style session (stale manifest `docs/`, signed spec with the real fence) still shows the signed value', () => {
  const { home } = world('repo-stale-source.json', { ...specOf(), writeScope: ['docs/'] });
  assert.equal(getRunJob('r1', { home }).destination, 'docs/');
  const w2 = world('repo-stale-source.json', { ...specOf(), writeScope: ['lib/'] });
  assert.equal(getRunJob('r1', { home: w2.home }).destination, 'lib/', 'the manifest says docs/, the spec says lib/: the spec wins');
});

test('a plain-folder job is unchanged: its per-run manifest drop-off shows (the spec fence is output/)', () => {
  const { home } = world('folder-source.json', { ...specOf({ files: true }), writeScope: ['output/'] });
  assert.equal(getRunJob('r1', { home }).destination, '/tw/out-folder');
});

test('a repo review job (rubric; spec fence is output/) keeps the manifest report path', () => {
  const { home } = world('repo-stale-source.json', { ...specOf({ files: true }), writeScope: ['output/'] });
  assert.equal(getRunJob('r1', { home }).destination, 'docs/');
});
