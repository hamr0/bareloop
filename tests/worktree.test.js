// src/worktree.js — the ONE spelling of "a run's tree is a worktree in the person's own repo". REAL git in a scratch
// repo, no stubbed git; every commit forces a neutral identity (CI has no global gitconfig).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  addWorktree, hideBareloopDir, uncommittedCount, removeWorktree, worktreePath, shortHead, EXCLUDE_LINE, NODE_MODULES_LINE,
} from '../src/worktree.js';

/** @type {string[]} */
const tmpDirs = [];
test.after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

const ID = ['-c', 'user.name=wt-test', '-c', 'user.email=wt@test', '-c', 'commit.gpgsign=false'];
const git = (dir, args) => execFileSync('git', [...ID, '-C', dir, ...args], { encoding: 'utf8' });

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'worktree-repo-'));
  tmpDirs.push(dir);
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}

test('addWorktree: a detached worktree at HEAD under <repo>/.bareloop/wt/<id>', () => {
  const repo = makeRepo();
  const wt = worktreePath(repo, 'r1');
  assert.equal(wt, join(repo, '.bareloop', 'wt', 'r1'));
  addWorktree(repo, wt);
  assert.ok(existsSync(join(wt, 'a.txt')));
  assert.equal(git(wt, ['rev-parse', 'HEAD']).trim(), git(repo, ['rev-parse', 'HEAD']).trim());
});

test('addWorktree: a detached HEAD (no branch)', () => {
  const repo = makeRepo();
  const wt = worktreePath(repo, 'r2');
  addWorktree(repo, wt);
  assert.throws(() => git(wt, ['symbolic-ref', '--quiet', 'HEAD']), 'a detached worktree has no symbolic HEAD');
});

test('addWorktree: a second add at the same path throws the wrapped error', () => {
  const repo = makeRepo();
  const wt = worktreePath(repo, 'r3');
  addWorktree(repo, wt);
  assert.throws(() => addWorktree(repo, wt), /^Error: git worktree add failed:/);
});

test('hideBareloopDir: .bareloop/ leaves the person\'s own git status, tracked .gitignore untouched, never duplicated', () => {
  const repo = makeRepo();
  addWorktree(repo, worktreePath(repo, 'r4'));
  assert.match(git(repo, ['status', '--porcelain']), /\.bareloop/, 'before: the folder shows in git status');
  assert.equal(hideBareloopDir(repo), true);
  assert.equal(hideBareloopDir(repo), false, 'second call adds nothing');
  assert.equal(git(repo, ['status', '--porcelain']).trim(), '', 'after: git status is clean');
  const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(exclude.split('\n').filter((l) => l === EXCLUDE_LINE).length, 1);
  assert.equal(existsSync(join(repo, '.gitignore')), false, 'the tracked .gitignore is never created or touched');
});

test('hideBareloopDir: keeps what the exclude file already held (no trailing newline case)', () => {
  const repo = makeRepo();
  const f = join(repo, '.git', 'info', 'exclude');
  mkdirSync(join(repo, '.git', 'info'), { recursive: true });
  writeFileSync(f, '*.log');
  hideBareloopDir(repo);
  assert.equal(readFileSync(f, 'utf8'), `*.log\n${EXCLUDE_LINE}\n${NODE_MODULES_LINE}\n`);
});

test('hideBareloopDir: a repo that is itself a linked worktree writes the COMMON dir\'s exclude', () => {
  const repo = makeRepo();
  const linked = join(repo, '..', `${repo.split('/').pop()}-linked`);
  tmpDirs.push(linked);
  git(repo, ['worktree', 'add', '-q', '--detach', linked, 'HEAD']);
  assert.ok(existsSync(join(linked, '.git')) && !existsSync(join(linked, '.git', 'info')), '.git is a FILE in a linked worktree');
  hideBareloopDir(linked);
  assert.match(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8'), /^\/\.bareloop\/$/m);
});

test('uncommittedCount: 0 clean, counts tracked edits and untracked files', () => {
  const repo = makeRepo();
  assert.equal(uncommittedCount(repo), 0);
  writeFileSync(join(repo, 'a.txt'), 'two\n');
  writeFileSync(join(repo, 'b.txt'), 'new\n');
  assert.equal(uncommittedCount(repo), 2);
  assert.equal(uncommittedCount(join(tmpdir(), 'no-such-dir-xyz')), 0, 'unreadable = 0, a notice never a refusal');
});

test('shortHead: the short sha, null off a repo', () => {
  const repo = makeRepo();
  assert.equal(shortHead(repo), git(repo, ['rev-parse', '--short', 'HEAD']).trim());
  assert.equal(shortHead(join(tmpdir(), 'no-such-dir-xyz')), null);
});

test('removeWorktree: the folder is gone, even with untracked scratch in it; the repo keeps its branch work', () => {
  const repo = makeRepo();
  const wt = worktreePath(repo, 'r5');
  addWorktree(repo, wt);
  git(wt, ['checkout', '-q', '-b', 'bareloop-x']);
  writeFileSync(join(wt, 'a.txt'), 'edited\n');
  git(wt, ['commit', '-q', '-am', 'work']);
  writeFileSync(join(wt, 'scratch.tmp'), 'x');
  assert.equal(removeWorktree(repo, wt), true);
  assert.equal(existsSync(wt), false);
  assert.equal(git(repo, ['show', 'bareloop-x:a.txt']), 'edited\n', 'the branch stays');
  assert.doesNotMatch(git(repo, ['worktree', 'list']), /r5/);
});

test('hideBareloopDir: node_modules/ is hidden too (any depth) with no node_modules in the tracked .gitignore; each line checked separately', () => {
  const repo = makeRepo();
  const wt = worktreePath(repo, 'r6');
  assert.equal(hideBareloopDir(repo), true);
  addWorktree(repo, wt);
  mkdirSync(join(wt, 'node_modules', 'p'), { recursive: true });
  writeFileSync(join(wt, 'node_modules', 'p', 'i.js'), 'x');
  mkdirSync(join(wt, 'sub', 'node_modules'), { recursive: true });
  writeFileSync(join(wt, 'sub', 'node_modules', 'j.js'), 'x');
  assert.equal(git(wt, ['status', '--porcelain']).trim(), '', 'installed packages never read as worker writes');
  assert.equal(existsSync(join(repo, '.gitignore')), false, 'the tracked .gitignore is never touched');
  // idempotent per line: a file holding only the first line gets only the missing one
  const f = join(repo, '.git', 'info', 'exclude');
  writeFileSync(f, `${EXCLUDE_LINE}\n`);
  assert.equal(hideBareloopDir(repo), true);
  assert.equal(hideBareloopDir(repo), false);
  const lines = readFileSync(f, 'utf8').split('\n');
  assert.equal(lines.filter((l) => l === EXCLUDE_LINE).length, 1);
  assert.equal(lines.filter((l) => l === NODE_MODULES_LINE).length, 1);
});

test('addWorktree: the person\'s git hooks never run (post-checkout writes a marker; it must not exist)', () => {
  const repo = makeRepo();
  const marker = join(repo, 'hook-ran.marker');
  const hook = join(repo, '.git', 'hooks', 'post-checkout');
  mkdirSync(join(repo, '.git', 'hooks'), { recursive: true });
  writeFileSync(hook, `#!/bin/sh\necho ran > '${marker}'\n`, { mode: 0o755 });
  // the instrument can fail: plain git does run this hook on `worktree add`
  git(repo, ['worktree', 'add', '-q', '--detach', join(repo, '..', `${repo.split('/').pop()}-probe`), 'HEAD']);
  tmpDirs.push(join(repo, '..', `${repo.split('/').pop()}-probe`));
  assert.equal(existsSync(marker), true, 'control: the hook is live under plain git');
  rmSync(marker);
  addWorktree(repo, worktreePath(repo, 'r7'));
  assert.equal(existsSync(marker), false, 'bareloop\'s worktree add runs none of the person\'s hooks');
});
