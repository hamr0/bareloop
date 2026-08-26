// F118 (the run→code direction, parked half landed 2026-08-25): a run's
// spine never recorded which version of bareloop's code it ran under.
// `codeVersion()` is a pure, $0, no-shell report-only reader — these tests
// prove it reads the REAL package.json/`.git` of this checkout (never a
// hand-authored fixture standing in for them) and never throws on an absent
// package root.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeVersion, shortSha } from '../src/codeversion.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const tmpDirs = [];
// worktrees are torn down via `git worktree remove`, never a bare rmSync —
// a raw directory delete would leave the main checkout's own
// `.git/worktrees/<name>/` metadata dangling.
const worktreeDirs = [];
after(() => {
  for (const d of worktreeDirs) {
    try { execFileSync('git', ['-C', REPO_ROOT, 'worktree', 'remove', '--force', d]); } catch { /* best-effort cleanup */ }
  }
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

test('codeVersion() reads THIS checkout\'s real package.json version, read independently', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(typeof pkg.version, 'string');
  assert.ok(pkg.version.length > 0, 'precondition: package.json really has a version string');

  const { version } = codeVersion();
  assert.equal(version, pkg.version);
});

test('codeVersion() reads THIS checkout\'s real HEAD sha, resolved independently off .git/HEAD', () => {
  assert.ok(existsSync(join(REPO_ROOT, '.git')), 'precondition: this checkout has a .git directory');
  const head = readFileSync(join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
  const m = /^ref:\s*(\S+)$/.exec(head);
  let expectedSha;
  if (m) {
    const refPath = join(REPO_ROOT, '.git', m[1]);
    if (existsSync(refPath)) {
      expectedSha = readFileSync(refPath, 'utf8').trim();
    } else {
      // packed ref — read packed-refs independently, same fallback codeVersion() uses
      const packed = readFileSync(join(REPO_ROOT, '.git', 'packed-refs'), 'utf8');
      const line = packed.split('\n').find((l) => l.endsWith(' ' + m[1]));
      assert.ok(line, 'precondition: the branch is resolvable via packed-refs when not a loose ref');
      expectedSha = line.split(' ')[0];
    }
  } else {
    // detached HEAD (e.g. a CI PR checkout at the merge commit): .git/HEAD
    // holds a bare 40-hex sha directly, same case codeVersion() itself
    // handles (src/codeversion.js:80-83).
    assert.match(head, /^[0-9a-f]{40}$/, 'precondition: detached HEAD is a bare 40-hex sha');
    expectedSha = head;
  }
  assert.match(expectedSha, /^[0-9a-f]{40}$/, 'precondition: resolved a real 40-hex sha');

  const { sha } = codeVersion();
  assert.equal(sha, expectedSha);
});

test('codeVersion() dirty is always null — unknowable without a shell, never faked as false', () => {
  assert.equal(codeVersion().dirty, null);
});

test('a fake package root with no .git yields sha: null, never a throw', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeversion-nogit-'));
  tmpDirs.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '9.9.9' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'codeversion.js'), readFileSync(join(REPO_ROOT, 'src', 'codeversion.js'), 'utf8'));

  // load the copy so its own import.meta.url resolves inside the fake root
  return import(`file://${join(dir, 'src', 'codeversion.js')}`).then((mod) => {
    const result = mod.codeVersion();
    assert.equal(result.version, '9.9.9');
    assert.equal(result.sha, null);
    assert.equal(result.dirty, null);
  });
});

test('a fake package root with a detached HEAD (bare 40-hex sha in .git/HEAD) resolves that sha', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeversion-detached-'));
  tmpDirs.push(dir);
  const fakeSha = 'abcdef0123456789abcdef0123456789abcdef01';
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'HEAD'), fakeSha + '\n');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'codeversion.js'), readFileSync(join(REPO_ROOT, 'src', 'codeversion.js'), 'utf8'));

  return import(`file://${join(dir, 'src', 'codeversion.js')}`).then((mod) => {
    const result = mod.codeVersion();
    assert.equal(result.version, '1.2.3');
    assert.equal(result.sha, fakeSha);
    assert.equal(result.dirty, null);
  });
});

test('a REAL git worktree (`.git` is a FILE, not a directory) resolves sha correctly — PR #23 review item 3, src/codeversion.js:74', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'codeversion-worktree-')), 'wt');
  worktreeDirs.push(dir);
  // fixture setup is allowed to shell out to git (the module under test never does):
  // a real worktree of THIS repo, detached at the current HEAD.
  execFileSync('git', ['-C', REPO_ROOT, 'worktree', 'add', dir, 'HEAD', '--detach']);

  assert.ok(!statSync(join(dir, '.git')).isDirectory(), 'precondition: a worktree\'s own .git is a FILE, not a directory');
  const gitfile = readFileSync(join(dir, '.git'), 'utf8').trim();
  const m = /^gitdir:\s*(.+)$/.exec(gitfile);
  assert.ok(m, 'precondition: .git is a `gitdir: <path>` pointer file');
  const worktreeGitDir = m[1].trim();
  // independent read of the worktree's OWN HEAD, off its per-worktree git dir
  // (never the module's own resolution) — same detached-HEAD shape codeVersion()
  // already handles, just reached through the worktree indirection this time.
  const expectedSha = readFileSync(join(worktreeGitDir, 'HEAD'), 'utf8').trim();
  assert.match(expectedSha, /^[0-9a-f]{40}$/, 'precondition: the worktree is detached at a real 40-hex sha');

  // point codeVersion() at the worktree root: overwrite its checked-out
  // src/codeversion.js with THIS (uncommitted-fix) copy, same technique the
  // fake-root tests above use, so import.meta.url resolves PKG_ROOT to `dir`.
  writeFileSync(join(dir, 'src', 'codeversion.js'), readFileSync(join(REPO_ROOT, 'src', 'codeversion.js'), 'utf8'));

  return import(`file://${join(dir, 'src', 'codeversion.js')}`).then((mod) => {
    const result = mod.codeVersion();
    assert.equal(result.sha, expectedSha);
  });
});

test('a fake package root with no package.json yields version: null, never a throw', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeversion-nopkg-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'codeversion.js'), readFileSync(join(REPO_ROOT, 'src', 'codeversion.js'), 'utf8'));

  return import(`file://${join(dir, 'src', 'codeversion.js')}`).then((mod) => {
    const result = mod.codeVersion();
    assert.equal(result.version, null);
    assert.equal(result.sha, null);
    assert.equal(result.dirty, null);
  });
});

test('shortSha() returns the first 8 chars, or null', () => {
  assert.equal(shortSha('0123456789abcdef0123456789abcdef01234567'), '01234567');
  assert.equal(shortSha(null), null);
  assert.equal(shortSha(undefined), null);
  assert.equal(shortSha(''), null);
});
