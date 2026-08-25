// F118 (the run→code direction, parked half landed 2026-08-25): a run's
// spine never recorded which version of bareloop's code it ran under.
// `codeVersion()` is a pure, $0, no-shell report-only reader — these tests
// prove it reads the REAL package.json/`.git` of this checkout (never a
// hand-authored fixture standing in for them) and never throws on an absent
// package root.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeVersion, shortSha } from '../src/codeversion.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

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
  assert.ok(m, 'precondition: HEAD is a symbolic ref (not detached) on this checkout');
  const refPath = join(REPO_ROOT, '.git', m[1]);
  let expectedSha;
  if (existsSync(refPath)) {
    expectedSha = readFileSync(refPath, 'utf8').trim();
  } else {
    // packed ref — read packed-refs independently, same fallback codeVersion() uses
    const packed = readFileSync(join(REPO_ROOT, '.git', 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(' ' + m[1]));
    assert.ok(line, 'precondition: the branch is resolvable via packed-refs when not a loose ref');
    expectedSha = line.split(' ')[0];
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
