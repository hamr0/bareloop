// Part 2 (review by git range or branch): a REAL git repo with history, built by real git (never an authored diff). main has c0; branch `feat` adds c1 (edit a.js, delete old.js, add new.js) and c2 (edit a.js again).
// Also a tag `v1` at c1, and a no-main twin. Every commit forces a neutral identity (tests/helpers.js).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitInPatient, initPatientRepo } from './helpers.js';

export const out = (/** @type {string} */ dir, /** @type {string[]} */ args) => gitInPatient(dir, args).trim();

/** @param {import('node:test').TestContext} t @returns {{root: string, repo: string, c0: string, c1: string, c2: string, wt: string}} */
export function makeRangeWorld(t) {
  const root = mkdtempSync(join(tmpdir(), 'range-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  initPatientRepo(repo);
  writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 1;\nexport const slow = () => { for (;;) break; };\n');
  writeFileSync(join(repo, 'src', 'old.js'), 'export const old = 1;\n');
  gitInPatient(repo, ['add', '-A']);
  gitInPatient(repo, ['commit', '-q', '-m', 'c0']);
  const c0 = out(repo, ['rev-parse', 'HEAD']);
  gitInPatient(repo, ['checkout', '-q', '-b', 'feat']);
  writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 2;\n');
  gitInPatient(repo, ['rm', '-q', 'src/old.js']);
  writeFileSync(join(repo, 'src', 'new file.js'), 'export const added = true;\n');
  gitInPatient(repo, ['add', '-A']);
  gitInPatient(repo, ['commit', '-q', '-m', 'c1']);
  const c1 = out(repo, ['rev-parse', 'HEAD']);
  gitInPatient(repo, ['tag', 'v1']);
  writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 3;\n');
  gitInPatient(repo, ['add', '-A']);
  gitInPatient(repo, ['commit', '-q', '-m', 'c2']);
  const c2 = out(repo, ['rev-parse', 'HEAD']);
  gitInPatient(repo, ['checkout', '-q', 'main']);
  // the run's own worktree, detached at main (as a run's worktree starts at the person's HEAD)
  const wt = join(root, 'wt');
  gitInPatient(repo, ['worktree', 'add', '-q', '--detach', wt, 'main']);
  return { root, repo, c0, c1, c2, wt };
}
