// THE WORK BRANCH — the hard rule of PRD Addendum v1.57 §3, verbatim:
//
//   "The agent creates a NEW BRANCH before it touches any code — a HARD RULE, no
//    exceptions. Not a default, not a preference: no job edits the branch it was
//    handed, and none edits `main`."
//
// Every test here runs against a REAL throwaway git repository, never a mock: the
// thing under test is what git actually does when handed a dirty tree, a detached
// HEAD, a name that already exists, or no repository at all — and a fake git can
// only ever confirm the story this file was written from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  workBranchName, WORK_BRANCH_PREFIX, WORK_BRANCH_RE, MAX_BRANCH_COLLISIONS, prepareWorkBranch,
} from '../src/workbranch.js';

/** @param {string} dir @param {string[]} args */
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'wb-test', GIT_AUTHOR_EMAIL: 'wb@test',
    GIT_COMMITTER_NAME: 'wb-test', GIT_COMMITTER_EMAIL: 'wb@test',
  },
});

/** a throwaway repo with one commit on `main` — the branch a run is HANDED */
function makeRepo(t, { branch = 'main' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-wb-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', branch]);
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return { dir, head: git(dir, ['rev-parse', 'HEAD']).trim() };
}

const current = (/** @type {string} */ dir) => git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
const branches = (/** @type {string} */ dir) => git(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  .split('\n').map((s) => s.trim()).filter(Boolean);

// ── the NAME: deterministic from the SIGNED spec, never model-authored ───────

test('the name is the bareloop prefix plus the spec\'s own job slug', () => {
  assert.equal(workBranchName({ job: 'typecheck-fix' }), 'bareloop-typecheck-fix');
  assert.equal(workBranchName({ job: 'bareagent-u-types' }), 'bareloop-bareagent-u-types');
});

test('the name is DETERMINISTIC — the same spec always yields the same branch', () => {
  const spec = { job: 'litectx-u-types', goal: 'tighten the types' };
  const a = workBranchName(spec);
  const b = workBranchName({ ...spec, goal: 'a completely different goal, edited later' });
  assert.equal(a, b, 'the goal is not an input: editing prose must not rename the branch');
  assert.equal(a, workBranchName(spec));
});

test('the name is git-ref-safe whatever the field holds', () => {
  for (const raw of ['Types Fix!!', '  ..lock..  ', 'a/b@{c}', '---', 'ünïcødé', 'x'.repeat(400)]) {
    const name = workBranchName({ job: raw });
    assert.match(name, WORK_BRANCH_RE, `${JSON.stringify(raw)} → ${name}`);
    // git's own verdict, not ours: the only authority on what a ref may be called
    assert.doesNotThrow(() => execFileSync('git', ['check-ref-format', '--branch', name], { encoding: 'utf8' }),
      `git refused ${JSON.stringify(name)}`);
  }
});

test('an empty or unusable job field still yields a legal, prefixed name', () => {
  assert.equal(workBranchName({ job: '' }), `${WORK_BRANCH_PREFIX}job`);
  assert.equal(workBranchName({}), `${WORK_BRANCH_PREFIX}job`);
  assert.equal(workBranchName({ job: '///' }), `${WORK_BRANCH_PREFIX}job`);
});

test('the prefix makes main/master INEXPRESSIBLE as a work-branch name', () => {
  for (const handed of ['main', 'master', 'HEAD', 'develop']) {
    assert.notEqual(workBranchName({ job: handed }), handed);
    assert.ok(workBranchName({ job: handed }).startsWith(WORK_BRANCH_PREFIX));
  }
});

// ── CREATION: before anything, on a real repository ──────────────────────────

test('creation switches the tree onto a NEW branch and leaves the handed one where it was', async (t) => {
  const { dir, head } = makeRepo(t);
  const r = await prepareWorkBranch(dir, { name: 'bareloop-typecheck-fix' });
  assert.equal(r.stop, null);
  assert.equal(r.branch, 'bareloop-typecheck-fix');
  assert.equal(r.created, true);
  assert.equal(r.from, 'main', 'the record names the branch the run was HANDED');
  assert.equal(current(dir), 'bareloop-typecheck-fix');
  // the handed branch still exists and still points where it did: nothing the run
  // does from here can move it
  assert.equal(git(dir, ['rev-parse', 'main']).trim(), head);
  assert.equal(git(dir, ['rev-parse', 'HEAD']).trim(), head, 'a new branch at HEAD moves no commit');
});

test('a write after creation lands on the work branch, never on the handed one', async (t) => {
  const { dir, head } = makeRepo(t);
  await prepareWorkBranch(dir, { name: 'bareloop-write-lands-here' });
  // the worker's write, then the only thing that could ever attribute it to a branch
  writeFileSync(join(dir, 'worker.txt'), 'the work\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'worker']);
  assert.notEqual(git(dir, ['rev-parse', 'bareloop-write-lands-here']).trim(), head);
  assert.equal(git(dir, ['rev-parse', 'main']).trim(), head, 'main NEVER moved');
  assert.throws(() => git(dir, ['cat-file', '-e', 'main:worker.txt']), 'the file is absent from the handed branch');
});

test('a DIRTY tree is carried onto the work branch, never refused and never reset', async (t) => {
  const { dir } = makeRepo(t);
  writeFileSync(join(dir, 'seed.txt'), 'edited before the run\n');
  writeFileSync(join(dir, 'untracked.txt'), 'left lying around\n');
  const r = await prepareWorkBranch(dir, { name: 'bareloop-dirty-ok' });
  assert.equal(r.stop, null);
  assert.equal(current(dir), 'bareloop-dirty-ok');
  assert.match(git(dir, ['status', '--porcelain']), /seed\.txt/);
  assert.ok(existsSync(join(dir, 'untracked.txt')));
});

// ── COLLISION: never reuse another run's branch ──────────────────────────────

test('an existing branch of the same name is SUFFIXED, never reused', async (t) => {
  const { dir } = makeRepo(t);
  const a = await prepareWorkBranch(dir, { name: 'bareloop-same-job' });
  const b = await prepareWorkBranch(dir, { name: 'bareloop-same-job' });
  const c = await prepareWorkBranch(dir, { name: 'bareloop-same-job' });
  assert.deepEqual([a.branch, b.branch, c.branch], ['bareloop-same-job', 'bareloop-same-job-2', 'bareloop-same-job-3']);
  assert.deepEqual([a.collided, b.collided, c.collided], [0, 1, 2]);
  assert.equal(current(dir), 'bareloop-same-job-3');
  assert.deepEqual(branches(dir).sort(), ['bareloop-same-job', 'bareloop-same-job-2', 'bareloop-same-job-3', 'main']);
});

test('the collision walk STOPS honestly rather than spinning forever', async (t) => {
  const { dir } = makeRepo(t);
  git(dir, ['branch', 'bareloop-crowded']);
  for (let i = 2; i <= MAX_BRANCH_COLLISIONS; i += 1) git(dir, ['branch', `bareloop-crowded-${i}`]);
  const r = await prepareWorkBranch(dir, { name: 'bareloop-crowded' });
  assert.notEqual(r.stop, null);
  assert.match(String(r.stop), /bareloop-crowded/);
  assert.equal(r.branch, null);
  assert.equal(current(dir), 'main', 'a refused preparation leaves the tree exactly where it was');
});

// ── RESUME: back to ITS OWN branch, never a fresh one ────────────────────────

test('a resume returns to the branch the killed leg recorded, minting nothing', async (t) => {
  const { dir } = makeRepo(t);
  const first = await prepareWorkBranch(dir, { name: 'bareloop-resume-me' });
  // the operator wandered off it between the kill and the resume
  git(dir, ['checkout', '-q', 'main']);
  const again = await prepareWorkBranch(dir, { name: 'bareloop-resume-me', resume: first.branch });
  assert.equal(again.stop, null);
  assert.equal(again.branch, 'bareloop-resume-me');
  assert.equal(again.created, false);
  assert.equal(again.resumed, true);
  assert.equal(current(dir), 'bareloop-resume-me');
  assert.deepEqual(branches(dir).sort(), ['bareloop-resume-me', 'main'], 'no -2 was minted');
});

test('a resume can only ever land on the RECORDED branch — the derived name is not consulted', async (t) => {
  const { dir } = makeRepo(t);
  const first = await prepareWorkBranch(dir, { name: 'bareloop-recorded' });
  git(dir, ['checkout', '-q', 'main']);
  // the derived name is FREE here: a resume that consulted `name` at all would
  // mint it and strand the work on `bareloop-recorded`. hamr's caveat, pinned —
  // "make sure resume is to resume on same branch".
  const again = await prepareWorkBranch(dir, { name: 'bareloop-derived-elsewhere', resume: first.branch });
  assert.equal(again.stop, null);
  assert.equal(again.branch, 'bareloop-recorded', 'the RECORDED branch, never the derived one');
  assert.equal(again.created, false, 'a resume never creates');
  assert.equal(again.resumed, true);
  assert.equal(again.collided, 0, 'and never walks the collision suffixes');
  assert.equal(current(dir), 'bareloop-recorded');
  assert.deepEqual(branches(dir).sort(), ['bareloop-recorded', 'main'], 'the derived name was never minted');
});

test('a resume whose recorded branch is missing STOPS — it never falls back to the derived name', async (t) => {
  const { dir } = makeRepo(t);
  const r = await prepareWorkBranch(dir, { name: 'bareloop-free-and-available', resume: 'bareloop-recorded-but-gone' });
  assert.notEqual(r.stop, null);
  assert.equal(r.branch, null);
  assert.match(String(r.stop), /bareloop-recorded-but-gone/);
  assert.doesNotMatch(String(r.stop), /bareloop-free-and-available/, 'the derived name is not even offered as a consolation');
  assert.deepEqual(branches(dir), ['main'], 'no fresh branch beside work the resume cannot see');
  assert.equal(current(dir), 'main');
});

test('a resume already standing on its own branch is a no-op, not a checkout', async (t) => {
  const { dir } = makeRepo(t);
  const first = await prepareWorkBranch(dir, { name: 'bareloop-still-here' });
  writeFileSync(join(dir, 'in-flight.txt'), 'work the kill interrupted\n');
  const again = await prepareWorkBranch(dir, { name: 'bareloop-still-here', resume: first.branch });
  assert.equal(again.stop, null);
  assert.equal(again.created, false);
  assert.ok(existsSync(join(dir, 'in-flight.txt')), 'the killed leg\'s work is untouched');
});

test('a resume whose branch is GONE stops — it never silently starts a new one', async (t) => {
  const { dir } = makeRepo(t);
  const r = await prepareWorkBranch(dir, { name: 'bareloop-vanished', resume: 'bareloop-deleted-by-a-human' });
  assert.notEqual(r.stop, null);
  assert.match(String(r.stop), /bareloop-deleted-by-a-human/);
  // the ARBITER's own refusal, not git's incidental one further down: a checkout of a
  // missing ref also fails and also names it, so a test that only checks "something
  // stopped" cannot tell a deliberate guard from a lucky error (the existence check
  // survived exactly that mutant until this line was added)
  assert.match(String(r.stop), /no longer exists/);
  assert.match(String(r.stop), /rather than starting a new branch/);
  assert.equal(r.branch, null);
  assert.deepEqual(branches(dir), ['main'], 'nothing was created in its place');
});

// ── FAILURE IS HONEST: an instrument stop, never a fallback ──────────────────

test('a workdir that is not a git repository STOPS', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-wb-nogit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await prepareWorkBranch(dir, { name: 'bareloop-nowhere' });
  assert.notEqual(r.stop, null);
  assert.match(String(r.stop), /git/i);
  assert.equal(r.branch, null);
});

test('a missing workdir STOPS rather than throwing out of the runner', async () => {
  const r = await prepareWorkBranch(join(tmpdir(), 'bareloop-wb-does-not-exist-9c1f'), { name: 'bareloop-nowhere' });
  assert.notEqual(r.stop, null);
  assert.equal(r.branch, null);
});

test('a DETACHED head is attached to a work branch — the blast radius is bounded either way', async (t) => {
  const { dir, head } = makeRepo(t);
  git(dir, ['checkout', '-q', '--detach', 'HEAD']);
  const r = await prepareWorkBranch(dir, { name: 'bareloop-from-detached' });
  assert.equal(r.stop, null);
  assert.equal(r.created, true);
  assert.equal(r.from, null, 'there was no branch to be handed — the record says so rather than inventing one');
  assert.equal(r.base, head);
  assert.equal(current(dir), 'bareloop-from-detached');
});

test('a name outside the bareloop prefix is REFUSED — main is unreachable by construction', async (t) => {
  const { dir } = makeRepo(t);
  for (const name of ['main', 'master', 'not-ours', 'bareloop', '-bareloop-x']) {
    const r = await prepareWorkBranch(dir, { name });
    assert.notEqual(r.stop, null, `${name} must be refused`);
    assert.equal(r.branch, null);
  }
  assert.equal(current(dir), 'main');
  assert.deepEqual(branches(dir), ['main']);
});

test('a resume name outside the prefix is refused on the same rule', async (t) => {
  const { dir } = makeRepo(t);
  const r = await prepareWorkBranch(dir, { name: 'bareloop-ok', resume: 'main' });
  assert.notEqual(r.stop, null);
  assert.equal(current(dir), 'main');
  assert.deepEqual(branches(dir), ['main'], 'the run never checks out, and never works on, the handed branch');
});
