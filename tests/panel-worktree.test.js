// P6 item 1 — the panel's drafting session makes a worktree in the person's own repo at drafting start. REAL git in a scratch
// repo, the real source door; the session is driven only as far as the install-needed wait (no model call is ever made).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSession } from '../src/panel/authorsession.js';

/** @type {string[]} */
const tmpDirs = [];
test.after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (/** @type {string} */ prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); tmpDirs.push(d); return d; };

const ID = ['-c', 'user.name=pw-test', '-c', 'user.email=pw@test', '-c', 'commit.gpgsign=false'];
const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', [...ID, '-C', dir, ...args], { encoding: 'utf8' }).trim();

/** a repo whose package.json DECLARES a dependency with no node_modules: the session stops at install-needed, after the worktree is made */
function makeRepo() {
  const dir = tmp('pw-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { lodash: '^4.0.0' } }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}

function keysHome() {
  const d = tmp('pw-home-');
  writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  return d;
}

const card = (/** @type {string} */ source) => ({
  checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'pw-job', jobText: 'fix things\n~ no new deps\ntsc clean', inputs: `repo: ${source}`, destination: 'src/',
  capUsd: 2,
});

async function untilInstallNeeded(/** @type {any} */ session) {
  const t0 = Date.now();
  while (session.state.phase !== 'install-needed' && !['refused', 'error'].includes(session.state.phase) && Date.now() - t0 < 5000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  assert.equal(session.state.phase, 'install-needed', `${session.state.phase} / ${session.state.error}`);
}

const start = (/** @type {string} */ repo) => createSession(card(repo), {
  env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('pw-sess-'),
});

test('createSession: a repo source gets a worktree IN the repo at drafting start, hidden from git status, no hidden copy', async () => {
  const repo = makeRepo();
  const head = git(repo, ['rev-parse', 'HEAD']);
  const session = start(repo);
  await untilInstallNeeded(session);
  const wt = join(repo, '.bareloop', 'wt', session.id);
  assert.equal(session.state.pendingAsk.tree, wt, 'the install wait points at the worktree');
  assert.ok(existsSync(join(wt, 'package.json')));
  assert.equal(git(wt, ['rev-parse', 'HEAD']), head, 'it starts from the repo\'s current commit');
  assert.match(git(repo, ['worktree', 'list']), new RegExp(session.id));
  assert.equal(existsSync(join(session.state.outDir, 'source-seed', 'tree')), false, 'no hidden copy for a repo');
  const manifest = JSON.parse(readFileSync(join(session.state.outDir, 'source-seed', 'source.json'), 'utf8'));
  assert.equal(manifest.worktree, wt);
  assert.equal(manifest.seed, head);
  assert.equal(git(repo, ['status', '--porcelain']), '', 'the person\'s own git status shows nothing of it');
  assert.equal(existsSync(join(repo, '.gitignore')), false, 'their tracked .gitignore is never touched');
  const step = session.state.steps.find((/** @type {any} */ x) => x.id === 'install');
  assert.ok(step && step.detail.includes(wt), 'the install line names the worktree folder');
});

test('createSession: uncommitted changes in the repo get a progress notice (not a refusal) and are not in the worktree', async () => {
  const repo = makeRepo();
  const head = git(repo, ['rev-parse', '--short', 'HEAD']);
  writeFileSync(join(repo, 'src', 'mod.js'), '// edited, not committed\n');
  writeFileSync(join(repo, 'src', 'new.js'), '// untracked\n');
  const session = start(repo);
  await untilInstallNeeded(session);
  const copy = session.state.steps.find((/** @type {any} */ x) => x.id === 'copy');
  assert.equal(copy.detail, `2 uncommitted change(s) in your repo are not in this job — it starts from commit ${head}.`);
  const wt = session.state.pendingAsk.tree;
  assert.equal(readFileSync(join(wt, 'src', 'mod.js'), 'utf8'), '// nothing yet\n');
  assert.equal(existsSync(join(wt, 'src', 'new.js')), false);
});

test('createSession: a clean repo gets no uncommitted notice', async () => {
  const repo = makeRepo();
  const session = start(repo);
  await untilInstallNeeded(session);
  assert.equal(session.state.steps.find((/** @type {any} */ x) => x.id === 'copy').detail, '');
});

test('createSession: abandoning a drafting session that never ran removes its worktree', async () => {
  const repo = makeRepo();
  const session = start(repo);
  await untilInstallNeeded(session);
  const wt = session.state.pendingAsk.tree;
  assert.ok(existsSync(wt));
  assert.equal(session.abandon().ok, true);
  assert.equal(existsSync(wt), false, 'the folder is gone');
  assert.doesNotMatch(git(repo, ['worktree', 'list']), new RegExp(session.id));
  assert.equal(git(repo, ['branch', '--list']).replace(/[* ]/g, ''), 'main', 'a detached worktree leaves no branch behind');
});
