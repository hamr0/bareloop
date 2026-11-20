// REVIEW THE CODE, clean build item 5 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): delivery, ONE step with a row per source. `files` delivers every file under output/ plus the report to the person's folder OUTSIDE the tree (unchanged); `repo` writes ONLY the report
// into `<worktree>/<Destination>` (copyOut's in-repo door: a real containment proof, never the worker's scratch under output/) and the run's normal green commit carries it, `output/` left out of that commit (the source table's commitExclude).
// One commit on the work branch, no second commit, no containment bypass. $0: the real runner, a real worktree, a scripted worker.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { copyOut } from '../src/source.js';
import { commitWork } from '../src/worktree.js';
import { defaultsOf } from '../src/sourcedefaults.js';
import { runReview, repo, tmp, git, cleanup } from './review-world.mjs';

after(cleanup);

/** a worktree with a worker's scratch under output/ (the answer file and a stray note) */
function treeWithOutput() {
  const tree = repo();
  mkdirSync(path.join(tree, 'output', 'steps'), { recursive: true });
  writeFileSync(path.join(tree, 'output', 'steps', '1.json'), JSON.stringify({ results: [{ file: 'src/slow.js', quote: 'return list.filter((x) => x.ok)', why: 'it sorts on every call' }] }));
  writeFileSync(path.join(tree, 'output', 'draft-notes.md'), 'scratch thoughts\n');
  return tree;
}
const report = () => ({ name: 'review-job', render: (/** @type {any[]} */ files) => `# report\n${files.map((f) => f.rel).join(',')}\n` });

test('the source table: a repo delivers its report inside the repo and leaves output/ out of the commit; files delivers outside and excludes nothing', () => {
  assert.equal(defaultsOf('repo').reportInRepo, true);
  assert.deepEqual([...defaultsOf('repo').commitExclude], ['output']);
  assert.equal(defaultsOf('files').reportInRepo, false);
  assert.deepEqual([...defaultsOf('files').commitExclude], []);
});

test('copyOut in-repo door: ONLY the report is written, at Destination inside the repo; the worker\'s scratch under output/ is never delivered', async () => {
  const tree = treeWithOutput();
  const co = await copyOut({ tree, destination: 'docs/', inRepo: true, report: report() });
  assert.equal(co.stop, null, JSON.stringify(co));
  assert.equal(co.files.length, 1);
  assert.match(path.relative(tree, co.files[0].path), /^docs\/review-job-\d{4}-\d{2}-\d{2}\.md$/);
  assert.equal(readFileSync(co.files[0].path, 'utf8'), '# report\nsteps/1.json\n', 'rendered from the step files, which are read and never copied');
  assert.deepEqual(readdirSync(path.join(tree, 'docs')).sort(), ['keep.md', path.basename(co.files[0].path)]);
  assert.equal(existsSync(path.join(tree, 'docs', 'draft-notes.md')), false);
  assert.equal(existsSync(path.join(tree, 'docs', 'steps')), false);
  const again = await copyOut({ tree, destination: 'docs/', inRepo: true, report: report() });
  assert.match(path.basename(again.files[0].path), /-2\.md$/, 'never overwrites: the next free same-day name');
});

test('copyOut in-repo door: a Destination that is not inside the repo, a place the run keeps, or a link out is refused in plain words and writes nothing', async () => {
  const tree = treeWithOutput();
  const outside = tmp('outside-');
  symlinkSync(outside, path.join(tree, 'docs', 'escape'));
  /** @type {[string, RegExp][]} */
  const cases = [['/etc', /not a path inside the repo/], ['../elsewhere', /leaves the repo/], ['docs/../../x', /leaves the repo/], ['.git', /place the run keeps for itself \(\.git\/\)/], ['output/', /\(output\/\)/], ['.bareloop/wt', /\(\.bareloop\/\)/], ['docs/escape', /reaches outside the repo through a link/], ['docs/keep.md', /is a file; Destination for a review is the FOLDER/], ['', /no Destination/]];
  for (const [dest, re] of cases) {
    const co = await copyOut({ tree, destination: dest, inRepo: true, report: report() });
    assert.notEqual(co.stop, null, dest);
    assert.match(String(co.stop), re, dest);
  }
  assert.deepEqual(readdirSync(outside), [], 'nothing was written outside the repo');
  const noAnswer = repo();
  const none = await copyOut({ tree: noAnswer, destination: 'docs/', inRepo: true, report: report() });
  assert.match(String(none.stop), /no non-empty file exists under/);
});

test('a Destination that does not exist yet is made inside the repo (the report lands in a new folder), still contained', async () => {
  const tree = treeWithOutput();
  const co = await copyOut({ tree, destination: 'docs/reviews', inRepo: true, report: report() });
  assert.equal(co.stop, null, JSON.stringify(co));
  assert.match(path.relative(tree, co.files[0].path), /^docs\/reviews\/review-job-/);
});

test('commitWork can leave a path out: the commit holds the report and not the scratch; the default (no exclusion) is untouched', async () => {
  const tree = treeWithOutput();
  await copyOut({ tree, destination: 'docs/', inRepo: true, report: report() });
  const fin = commitWork(tree, 'review', { exclude: [...defaultsOf('repo').commitExclude] });
  assert.equal(fin.committed, true);
  const files = git(tree, ['show', '--name-only', '--pretty=', 'HEAD']).trim().split('\n');
  assert.equal(files.length, 1);
  assert.match(files[0], /^docs\/review-job-/);
  assert.equal(git(tree, ['rev-list', '--count', 'HEAD']).trim(), '2', 'one commit on top of the seed');
  const t2 = treeWithOutput();
  commitWork(t2, 'plain');
  assert.ok(git(t2, ['show', '--name-only', '--pretty=', 'HEAD']).includes('output/draft-notes.md'));
});

test('RUN: a green review commits ONE commit on the work branch holding exactly the report, which is at Destination inside the repo', async () => {
  const { rc, text, src, branch } = await runReview();
  assert.equal(rc, 0, text);
  assert.match(text, /outcome\s+green/, text);
  assert.match(text, /DESTINATION  written in the repo - /, text);
  assert.ok(branch, text);
  const files = git(src, ['diff', '--name-only', `main..${branch}`]).trim().split('\n').filter(Boolean);
  assert.equal(files.length, 1, `the branch holds exactly the report: ${files}`);
  assert.match(files[0], /^docs\/review-job-\d{4}-\d{2}-\d{2}\.md$/);
  assert.equal(git(src, ['rev-list', '--count', `main..${branch}`]).trim(), '1', 'ONE commit on the work branch, no second commit');
  assert.match(git(src, ['show', `${branch}:${files[0]}`]), /slow\.js|slow code|List the slow code/);
});
