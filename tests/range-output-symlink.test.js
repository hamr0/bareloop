// Pre-beta safety fix (ITEM33-BUILD Addendum 2026-11-27d, item 2): a review must never write through a symlinked `output` / `output/review-diff`.
// REAL git on scratch repos. Refused at DRAFT START ($0, `draftRefusal`, reading the range end's tracked modes) and again by `writeRangeDiffs` (the net, lstat on the worktree).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftRefusal, writeRangeDiffs } from '../src/rangereview.js';
import { gitInPatient, initPatientRepo } from './helpers.js';

const lines = (/** @type {string} */ text) => [{ n: 1, text }];

/** a repo whose tracked tree holds `link` ('output' or 'output/review-diff') as a symlink to an empty outside dir; or no link at all */
function world(/** @type {import('node:test').TestContext} */ t, /** @type {string|null} */ link) {
  const root = mkdtempSync(join(tmpdir(), 'outlink-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'); const outside = join(root, 'outside');
  mkdirSync(repo); mkdirSync(outside);
  initPatientRepo(repo);
  writeFileSync(join(repo, 'f.txt'), 'one\n');
  gitInPatient(repo, ['add', '-A']); gitInPatient(repo, ['commit', '-q', '-m', 'c0']);
  const a = gitInPatient(repo, ['rev-parse', 'HEAD']).trim();
  writeFileSync(join(repo, 'f.txt'), 'two\n');
  if (link !== null) {
    if (link.includes('/')) mkdirSync(join(repo, 'output'));
    symlinkSync(outside, join(repo, link));
  }
  gitInPatient(repo, ['add', '-A']); gitInPatient(repo, ['commit', '-q', '-m', 'c1']);
  const b = gitInPatient(repo, ['rev-parse', 'HEAD']).trim();
  const wt = join(root, 'wt');
  gitInPatient(repo, ['worktree', 'add', '-q', '--detach', wt, b]);
  return { repo, outside, wt, a, b };
}

for (const link of ['output', 'output/review-diff']) {
  test(`a tracked "${link}" symlink: the draft is refused at the start ($0) and writeRangeDiffs writes nothing outside`, async (t) => {
    const w = world(t, link);
    const refusal = await draftRefusal({ repo: w.repo, jobLines: lines(`Review range: ${w.a}..${w.b} for bugs`) });
    assert.equal(refusal, `This repo has "${link}" as a symlink, so a review would write its diffs outside the run's folder. Take the link out of the repo (or review another repo). Nothing spent.`);
    const res = await writeRangeDiffs({ repo: w.repo, worktree: w.wt, a: w.a, b: w.b });
    assert.equal(res.ok, false);
    assert.match(String(/** @type {any} */ (res).error), /as a symlink/);
    assert.deepEqual(readdirSync(w.outside), [], 'nothing landed outside the worktree');
  });
}

test('a branch review is refused by the late (review: true) call too; a change job\'s branch is not asked', async (t) => {
  const w = world(t, 'output');
  gitInPatient(w.repo, ['branch', 'feat', w.b]);
  assert.match(String(await draftRefusal({ repo: w.repo, jobLines: lines('Review branch: feat for bugs'), review: true })).split('. ')[0], /output" as a symlink/);
  assert.equal(await draftRefusal({ repo: w.repo, jobLines: lines('Fix branch: feat please') }), null);
});

test('a normal repo is unchanged: no refusal, the diffs are written in the worktree', async (t) => {
  const w = world(t, null);
  assert.equal(await draftRefusal({ repo: w.repo, jobLines: lines(`Review range: ${w.a}..${w.b} for bugs`) }), null);
  const res = await writeRangeDiffs({ repo: w.repo, worktree: w.wt, a: w.a, b: w.b });
  assert.deepEqual(res, { ok: true, files: ['f.txt'] });
  assert.deepEqual(readdirSync(join(w.wt, 'output', 'review-diff')).sort(), ['f.txt.diff', 'files.txt']);
  assert.deepEqual(readdirSync(w.outside), []);
});
