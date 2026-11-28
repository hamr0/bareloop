// One owner for "is this job name taken" (hamr's ruling "A", 2026-11-27, walk draft session smwz2xj6bdnq3): the New job card used to look
// only at jobs/, the Reuse door also at the run list, so a name already in the runs list started drafting and spent money. `jobNameTaken`
// (src/panel/authorsession.js) is the owner; both doors refuse with JOB_NAME_TAKEN_WORDS. Scratch homes only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync as wf } from 'node:fs';
import * as sess from '../src/panel/authorsession.js';
import { keyRows } from '../src/providerrows.js';
import { ANTH_CFG } from './helpers.js';
import { makeRun, panel, specOf, tmp } from './trigger-world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const words = (/** @type {string} */ n) => `A job named "${n}" already exists and is a different job. Pick another name.`;
const card = (/** @type {any} */ over = {}) => ({
  checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'fresh-name', jobText: 'fix things\ntsc clean\n~ keep it small',
  inputs: 'repo: /tmp/does-not-matter', destination: 'src/', capUsd: 2, ...over,
});
function badKeyHome() {
  const d = tmp('jn-home-');
  wf(join(d, '.env'), 'ANTHROPIC_API_KEY=bad key\n', { mode: 0o600 });
  wf(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}

test('New job card over HTTP: a name already in the runs list is refused at $0 with the Reuse words, box name', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'g1', spec: specOf({ job: 'walk-reuse' }), outcome: 'green' });
  const p = await panel({ home });
  const r = await p.post('/api/author/start', card({ jobName: 'walk-reuse' }));
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.equal(r.body.error, words('walk-reuse'));
  assert.equal(r.body.box, 'name');
  assert.equal((await p.get('/api/author/live')).body.sessionId, null, 'nothing was started');
});

test('validateJobCard: a name in runJobNames refuses; in neither place passes; jobs/ still refuses; allowName still passes', () => {
  const jobsDir = tmp('jn-jobs-');
  writeFileSync(join(jobsDir, 'in-jobs.json'), '{}');
  const rows = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: ANTH_CFG });
  const v = (/** @type {string} */ jobName, /** @type {any} */ o = {}) => sess.validateJobCard(card({ jobName }), { jobsDir, rows, ...o });
  const hit = v('in-runs', { runJobNames: ['in-runs'] });
  assert.equal(hit.ok, false);
  assert.equal(/** @type {any} */ (hit).error, words('in-runs'));
  assert.equal(/** @type {any} */ (hit).box, 'name');
  assert.equal(v('in-jobs', { runJobNames: [] }).ok, false, 'jobs/ name still refused');
  assert.equal(/** @type {any} */ (v('in-jobs')).error, words('in-jobs'));
  assert.equal(v('in-runs', { runJobNames: ['in-runs'], allowName: 'in-runs' }).ok, true, 'allowName exempts the origin own name');
  assert.equal(v('in-neither', { runJobNames: ['in-runs'] }).ok, true, 'a name in neither place passes');
  assert.equal(sess.jobNameTaken('in-runs', { jobsDir, runJobNames: new Set(['in-runs']) }), true, 'any iterable');
  assert.equal(sess.jobNameTaken('nobody', { jobsDir, runJobNames: ['in-runs'] }), false);
  assert.equal(sess.jobNameTaken('in-runs', { jobsDir }), false, 'absent runJobNames = today');
});

test('guard: no src file other than authorsession.js compares a card job name against the run-list names', () => {
  const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => {
    for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|html)$/.test(p)) out.push(p); }
    return out;
  };
  const RE = /runJobNames\(\)\s*\.\s*includes\(|\.includes\(\s*card\.jobName\s*\)/;
  const hits = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    readFileSync(file, 'utf8').split('\n').forEach((l, i) => { if (RE.test(l)) hits.push(`${rel}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `ask jobNameTaken (src/panel/authorsession.js) instead: ${hits.join(', ')}`);
});
