// A review repo job's report and the Accept door (live bug, run mwqnj87c): the report used to be written at Destination AFTER the close judged the tree, so Accept's mechanical re-run saw a change outside output/ and refused.
// ONE RULE: bareloop never writes into the judged tree after the close. At green the report is STAGED under output/ (inside the fence); only an honoured Accept lands it at Destination (dated, never overwriting) and commits it. $0: the real runner, a real worktree, a scripted worker.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { main } from '../src/userrun.js';
import { jobSpecHash } from '../src/job.js';
import { deliveredOf } from '../src/panel/server.js';
import { engineRefusalWords } from '../src/panel/runroutes.js';
import { scriptedProvider } from './helpers.js';
import { runReview, tmp, git, cleanup } from './review-world.mjs';

after(cleanup);

const spineRecords = (/** @type {string} */ f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
/** answer the run's door through the real runner */
async function door(/** @type {any} */ w, /** @type {string} */ decision) {
  /** @type {string[]} */ const o = [];
  const rc = await main(['--spec', w.specPath, '--door', w.spine, '--decide', decision, '--approve', jobSpecHash(w.spec)], { provider: scriptedProvider([]), env: {}, out: (/** @type {any} */ s) => o.push(String(s)), err: (/** @type {any} */ s) => o.push(String(s)), runlistHome: w.home });
  return { rc, text: o.join('\n') };
}
const wtOf = (/** @type {any} */ w) => w.prep.tree;
const docs = (/** @type {string} */ tree) => readdirSync(path.join(tree, 'docs')).sort();

test('(a) a green review stages its report under output/: Destination is untouched, nothing is committed for it, and the Result tab reads it from the staged copy', async () => {
  const w = await runReview();
  assert.equal(w.rc, 0, w.text);
  assert.match(w.text, /outcome\s+green/, w.text);
  const tree = wtOf(w);
  assert.deepEqual(docs(tree), ['keep.md'], 'Destination holds only what the repo had');
  assert.ok(existsSync(path.join(tree, 'output', 'review-job.md')), 'the report sits inside the judged output/ fence');
  const recs = spineRecords(w.spine);
  assert.equal(recs.some((r) => r.type === 'destination-written'), false, 'nothing is recorded as written at Destination yet');
  const delivered = deliveredOf(recs);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].path, path.join(tree, 'output', 'review-job.md'));
  assert.equal(git(w.src, ['rev-list', '--count', `main..${w.branch}`]).trim(), '0', 'no commit carries the report before Accept');
});

test('(b) an honoured Accept passes the re-run, lands the report at Destination as name-YYYY-MM-DD.md, commits it on the work branch and records destination-written', async () => {
  const w = await runReview();
  const tree = wtOf(w);
  const a = await door(w, 'accept');
  assert.equal(a.rc, 0, a.text);
  assert.match(a.text, /ACCEPTED/, a.text);
  const landed = docs(tree).filter((f) => /^review-job-\d{4}-\d{2}-\d{2}(-\d+)?\.md$/.test(f));
  assert.equal(landed.length, 1, docs(tree).join(','));
  const files = git(w.src, ['diff', '--name-only', `main..${w.branch}`]).trim().split('\n').filter(Boolean);
  assert.deepEqual(files, [`docs/${landed[0]}`], 'the work branch holds exactly the report');
  assert.equal(git(w.src, ['rev-list', '--count', `main..${w.branch}`]).trim(), '1');
  const rec = spineRecords(w.spine).findLast((r) => r.type === 'destination-written');
  assert.equal(rec.path, path.join(tree, 'docs', landed[0]));
  assert.equal(rec.staged, path.join(tree, 'output', 'review-job.md'));
  const delivered = deliveredOf(spineRecords(w.spine));
  assert.deepEqual(delivered.map((d) => d.path), [rec.path], 'the Result tab now reads the Destination copy, once');
  // F399: the Accept's own commit is on the spine as `work-committed` (the door keeps the folder)
  const wc = spineRecords(w.spine).filter((r) => r.type === 'work-committed');
  assert.equal(wc.length, 2, 'the green run\'s own (nothing to commit: the report was only staged) and the Accept\'s');
  assert.equal(wc[0].commit, null);
  assert.equal(wc[0].folderKept, true);
  assert.equal(wc[1].branch, w.branch);
  assert.equal(wc[1].commit, git(w.src, ['rev-parse', '--short', w.branch]).trim());
  assert.equal(wc[1].folderKept, true);
});

test('(b2) landStagedReport: a same-day name already taken lands as -2, never over a person\'s file', async () => {
  const { landStagedReport } = await import('../src/source.js');
  const tree = tmp('land-');
  mkdirSync(path.join(tree, 'output'), { recursive: true }); mkdirSync(path.join(tree, 'docs'));
  writeFileSync(path.join(tree, 'output', 'r.md'), 'report\n');
  const one = await landStagedReport({ tree, destination: 'docs/', staged: path.join(tree, 'output', 'r.md') });
  assert.equal(one.stop, null, JSON.stringify(one));
  writeFileSync(one.file.path, 'mine\n');
  const two = await landStagedReport({ tree, destination: 'docs/', staged: path.join(tree, 'output', 'r.md') });
  assert.match(path.basename(two.file.path), /^r-\d{4}-\d{2}-\d{2}-2\.md$/);
  assert.equal(readFileSync(one.file.path, 'utf8'), 'mine\n');
  const bad = await landStagedReport({ tree, destination: '../x', staged: path.join(tree, 'output', 'r.md') });
  assert.match(String(bad.stop), /leaves the repo/);
});

test('(c) a refused Accept (the tree moved) and a Pause leave Destination untouched and commit nothing', async () => {
  const w = await runReview();
  const tree = wtOf(w);
  const p = await door(w, 'pause');
  assert.equal(p.rc, 0, p.text);
  assert.deepEqual(docs(tree), ['keep.md']);
  mkdirSync(path.join(tree, 'src'), { recursive: true });
  writeFileSync(path.join(tree, 'src', 'stray.js'), 'export const x = 1;\n'); // a change outside output/ after the green
  const a = await door(w, 'accept');
  assert.notEqual(a.rc, 0, a.text);
  assert.match(a.text, /DOOR REFUSED \(accept\)/, a.text);
  assert.deepEqual(docs(tree), ['keep.md'], 'nothing landed at Destination');
  assert.equal(git(w.src, ['rev-list', '--count', `main..${w.branch}`]).trim(), '0', 'nothing committed');
  assert.equal(spineRecords(w.spine).some((r) => r.type === 'destination-written'), false);
});

test('(d) the refusal words name the real file and reason from the stage\'s own gap, never the stage name', () => {
  const log = (/** @type {string} */ gap) => 'DOOR REFUSED (accept) — nothing was recorded and nothing was released.\n'
    + `  door-accept-red:stage.changed-from-seed — the close's mechanical stage "changed-from-seed" no longer passes on this tree (needs_revision) — the tree moved under you, so the accept is refused rather than applied to work you did not read. close stage "changed-from-seed" failed: ${gap}\n`
    + '  the mechanical re-run, stage by stage:\n    changed-from-seed  needs_revision\n';
  const q = () => 'did it change any file?';
  assert.equal(engineRefusalWords(log('close: changed-from-seed: 1 changed file(s) lie outside output/ close:   docs/walk-range-2026-11-21.md'), 'accept', '/l', q),
    'Accept did not go through: a file changed outside output/: docs/walk-range-2026-11-21.md. Nothing was recorded.');
  assert.equal(engineRefusalWords(log('close: changed-from-seed: 3 changed file(s) lie outside output/ close:   a.md close:   b.md'), 'accept', '/l', q),
    'Accept did not go through: 3 files changed outside output/: a.md, b.md and 1 more. Nothing was recorded.');
  assert.equal(engineRefusalWords(log('close: changed-from-seed: nothing changed against the seed — the changed set is empty'), 'accept', '/l', q),
    'Accept did not go through: the check "did it change any file?" said no. Nothing was recorded.', 'a reason that carries no file keeps the question wording');
});
