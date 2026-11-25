// hamr 2026-11-24 (ITEM33 addendum, Part A item 12; POC .claude/scratch/poc-statefile/poc3.mjs): the tree fingerprint counts what is BEHIND an untracked
// symlink, not the link. The seed worktree links node_modules/.venv/venv to the work folder's own, so the unchanged work folder and its seed must get ONE id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { treeIdentity, makeSeedTrees } from '../src/kinds.js';
import { patientGitEnv } from './helpers.js';

const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: patientGitEnv() }).trim();

/** a patient with a tracked file; `ignore` is its committed .gitignore */
function patient(t, ignore) {
  const dir = mkdtempSync(join(tmpdir(), 'tree-fp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'CHANGELOG.md'), 'a\n');
  writeFileSync(join(dir, 'src.js'), 'x\n');
  if (ignore !== null) writeFileSync(join(dir, '.gitignore'), ignore);
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'seed');
  mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
  for (const f of ['a.js', 'pkg/b.js', 'pkg/c.js']) writeFileSync(join(dir, 'node_modules', f), `x${f}`);
  return dir;
}
async function seedOf(t, dir) {
  const st = makeSeedTrees();
  t.after(() => st.cleanup());
  const s = await st.ensure(dir, git(dir, 'rev-parse', 'HEAD'));
  return s.dir;
}

test('1. node_modules ignored: the work folder and its seed worktree (node_modules is a symlink there) get the same id', async (t) => {
  const dir = patient(t, 'node_modules/\n.venv/\n');
  const seed = await seedOf(t, dir);
  const a = await treeIdentity(dir), b = await treeIdentity(seed);
  assert.ok(a && b);
  assert.equal(a, b, 'the seed worktree differs from the work folder only by its link');
});

test('2. node_modules NOT ignored: its files count in the work folder, and the seed link counts the same files at the same path', async (t) => {
  const dir = patient(t, null);
  const seed = await seedOf(t, dir);
  const id = await treeIdentity(dir);
  assert.equal(id, await treeIdentity(seed));
  writeFileSync(join(dir, 'node_modules', 'a.js'), 'CHANGED');
  assert.notEqual(await treeIdentity(dir), id, 'an unignored installed file is content of the tree');
});

test('3. a real .venv directory, ignored: work folder and seed (venv link) agree', async (t) => {
  const dir = patient(t, 'node_modules/\n.venv/\n');
  mkdirSync(join(dir, '.venv', 'lib'), { recursive: true });
  writeFileSync(join(dir, '.venv', 'lib', 'z.py'), 'z');
  const seed = await seedOf(t, dir);
  assert.equal(await treeIdentity(dir), await treeIdentity(seed));
});

test('4. a tracked edit changes the id and reverting it restores it', async (t) => {
  const dir = patient(t, 'node_modules/\n');
  const id0 = await treeIdentity(dir);
  appendFileSync(join(dir, 'CHANGELOG.md'), '\nedit');
  const id1 = await treeIdentity(dir);
  git(dir, 'checkout', '--', 'CHANGELOG.md');
  const id2 = await treeIdentity(dir);
  assert.notEqual(id1, id0);
  assert.equal(id2, id0);
});

test('5. a new untracked, non-ignored file makes the work folder differ from its seed', async (t) => {
  const dir = patient(t, 'node_modules/\n');
  const seed = await seedOf(t, dir);
  writeFileSync(join(dir, 'newfile.txt'), 'hi');
  assert.notEqual(await treeIdentity(dir), await treeIdentity(seed));
});

test('6. an edit inside an ignored node_modules does not change the id', async (t) => {
  const dir = patient(t, 'node_modules/\n');
  const before = await treeIdentity(dir);
  writeFileSync(join(dir, 'node_modules', 'a.js'), 'CHANGED');
  assert.equal(await treeIdentity(dir), before);
});

test('7. a dangling untracked link counts nothing; a link to a non-ignored target counts its content', async (t) => {
  const dir = patient(t, 'node_modules/\n');
  const before = await treeIdentity(dir);
  symlinkSync(join(dir, 'nowhere'), join(dir, 'dangling'));
  assert.equal(await treeIdentity(dir), before, 'a dangling link has nothing behind it');
  const other = mkdtempSync(join(tmpdir(), 'tree-fp-target-'));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  writeFileSync(join(other, 'f.txt'), 'one');
  symlinkSync(other, join(dir, 'linked'));
  const one = await treeIdentity(dir);
  assert.notEqual(one, before);
  writeFileSync(join(other, 'f.txt'), 'two');
  assert.notEqual(await treeIdentity(dir), one, 'the content behind the link is what counts');
});
