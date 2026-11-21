// Part 2 item 4 (ITEM33-BUILD "Part 2 build spec"): at RUN START, before the seed is read and before any token, a review's `range:`/`branch:` token puts the run's worktree at the range's END (or the branch tip) through the one
// `checkoutAt`, and code writes `output/review-diff/` (files.txt + one .diff per changed file); a change job's `branch:` starts the work branch at the tip; every refusal settles the row at $0, exit 2. REAL runner, REAL git.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import path from 'node:path';
import { rangeSession, changeSession, runIt, cleanup, ANSWER_AT_END } from './range-run-world.mjs';
import { gitInPatient } from './helpers.js';

after(cleanup);

/** the worker's calls: read the file list and one per-file diff, then write the answer (the worktree path is a tool argument) */
const workerScript = (/** @type {any} */ f, answer) => [
  { toolCalls: [{ id: 'r1', name: 'shell_read', arguments: { path: path.join(f.prep.tree, 'output', 'review-diff', 'files.txt') } }] },
  { toolCalls: [{ id: 'r2', name: 'shell_read', arguments: { path: path.join(f.prep.tree, 'output', 'review-diff', 'src', 'a.js.diff') } }] },
  { toolCalls: [{ id: 'w1', name: 'shell_write', arguments: { path: path.join(f.prep.tree, 'output', 'steps', '1.json'), content: JSON.stringify(answer) } }] },
  { text: 'wrote' },
];
const toolResults = (/** @type {any} */ provider) => JSON.stringify(provider.messagesLog.at(-1));

test('a review range run: the worktree stands at the range END (a quote only the end has is cited), files.txt and the .diff are there before the first token, nothing of output/ is committed', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review range: v0..v1 for bugs' });
  assert.equal(gitInPatient(f.repo, ['rev-parse', 'HEAD']).trim(), f.c0, 'the person\'s HEAD is the start, not the range end');
  const r = await runIt(f, { script: workerScript(f, ANSWER_AT_END) });
  assert.match(r.text, /outcome\s+green/, `${r.text}\n${JSON.stringify(r.spine.filter((e) => /red|plan/.test(e.type)))}`);
  assert.match(r.out, /range review - 3 changed file/);
  const seen = toolResults(r.provider);
  assert.ok(seen.includes('src/a.js') && seen.includes('src/old.js'), 'the worker read files.txt');
  assert.ok(seen.includes('-export const a = 1;') && seen.includes('+export const a = 2;'), 'the worker read the per-file diff: git diff v0..v1 for src/a.js');
  assert.ok(r.branch, r.text);
  const tree = gitInPatient(f.repo, ['ls-tree', '-r', '--name-only', r.branch]).split('\n');
  assert.equal(tree.some((p) => p.startsWith('output/')), false, 'the diffs and the worker\'s scratch are never committed');
  assert.ok(tree.includes('src/new file.js'), 'the branch is built on the range end (c1), not on the person\'s HEAD');
  assert.equal(gitInPatient(f.repo, ['symbolic-ref', '--short', 'HEAD']).trim(), 'main', 'the person\'s checkout never moved');
});

test('a branch review is diffed against main: merge-base(main, feat)..feat-tip (the worktree stands at the tip, the diffs span both feature commits)', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review branch: feat for bugs' });
  const r = await runIt(f, { script: workerScript(f, { results: [{ file: 'src/a.js', quote: 'export const a = 3;', why: 'the branch tip sets a to 3' }] }) });
  assert.match(r.text, /outcome\s+green/, r.text);
  const seen = toolResults(r.provider);
  assert.ok(seen.includes('+export const a = 3;') && seen.includes('-export const a = 1;'), 'the .diff is main..feat tip (a 1 to 3), not the last commit alone');
});

test('refusals at $0, exit 2, in plain words, the provider never called: a missing end, a missing branch, and a range on a change spec', async (t) => {
  const bad = await rangeSession(t, { lineText: 'Review range: v0..v9.9.9 for bugs' });
  const r1 = await runIt(bad, { script: [] });
  assert.equal(r1.rc, 2, r1.text);
  assert.match(r1.err, /"v9\.9\.9" is not a commit, tag or branch of this repo, so the range cannot be reviewed\. Nothing spent\./);
  assert.equal(r1.provider.messagesLog.length, 0);
  const nob = await rangeSession(t, { lineText: 'Review branch: nope for bugs' });
  const r2 = await runIt(nob, { script: [] });
  assert.equal(r2.rc, 2);
  assert.match(r2.err, /This repo has no branch named "nope"\. Nothing spent\./);
  assert.equal(r2.provider.messagesLog.length, 0);
});

test('a CHANGE job with `branch: feat`: the work branch starts at feat\'s tip (the close is already green there, which main is not); a change job with `range:` is refused at $0', async (t) => {
  const f = await changeSession(t, { lineText: 'Make the tests pass on branch: feat' });
  const r = await runIt(f, { script: [] });
  assert.equal(r.rc, 0, r.text);
  assert.match(r.out, /outcome\s+already-green/, 'the close was green on feat\'s tip, which only the checkout provides');
  const clean = /patient reset — clean at ([0-9a-f]{7,})/.exec(r.out);
  assert.ok(clean && f.c2.startsWith(clean[1]), `the patient was reset to feat's tip, not main's HEAD: ${clean?.[1]}`);
  assert.equal(gitInPatient(f.repo, ['rev-parse', 'feat']).trim(), f.c2, 'the branch itself did not move');
  assert.equal(r.provider.messagesLog.length, 0);
  const g = await changeSession(t, { lineText: 'Make the tests pass on range: v0..v1' });
  const rr = await runIt(g, { script: [] });
  assert.equal(rr.rc, 2, rr.text);
  assert.match(rr.err, /Line 1 names a range to review, but this job changes code\. A range can only be reviewed, not changed\. Write it as a review, or take the range out\. Nothing spent\./);
});
