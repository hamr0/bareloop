// R7b (2) (F287): a REPO job's Destination must name a folder or file the repo really has (its committed tree), refused at $0 in plain words
// by the ONE Destination check, before any session, copy or model call. A plain-folder job is unchanged. $0: no model, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startDestinationProblem } from '../src/panel/authorsession.js';
import { destinationMissingInRepo } from '../src/source.js';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
function repo(t) {
  const d = mkdtempSync(path.join(tmpdir(), 'destrepo-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  mkdirSync(path.join(d, 'src', 'deep'), { recursive: true });
  mkdirSync(path.join(d, 'docs'));
  mkdirSync(path.join(d, 'untracked-dir'));
  writeFileSync(path.join(d, 'src', 'sum.js'), 'export const sum = (a, b) => a - b;\n');
  writeFileSync(path.join(d, 'src', 'deep', 'x.js'), '//\n');
  writeFileSync(path.join(d, 'docs', 'a.md'), '#\n');
  writeFileSync(path.join(d, 'README.md'), '#\n');
  git(d, ['init', '-q', '-b', 'main']); git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', 'seed']);
  writeFileSync(path.join(d, 'untracked-dir', 'u.js'), '//\n');   // never committed: the job's worktree does not have it
  mkdirSync(path.join(d, 'staged-dir')); writeFileSync(path.join(d, 'staged-dir', 's.js'), '//\n'); git(d, ['add', 'staged-dir']);   // added, not committed: not in the worktree either
  return d;
}
const card = (d, destination, extra = {}) => ({ inputs: `repo: ${d}`, destination, checkType: 'deterministic', ...extra });

test('a Destination the repo has (a folder, a nested folder, a file, several, a glob under a real folder, the repo root) is fine', (t) => {
  const d = repo(t);
  for (const ok of ['src/', 'src', 'src/deep', './src/', 'src/sum.js', 'docs/a.md', 'src/, docs/', 'src/sum.js\ndocs/', 'src/**/*.js', 'src/*.js', '.', './', 'README.md']) {
    assert.equal(startDestinationProblem(card(d, ok)), null, JSON.stringify(ok));
  }
});

test('F287: a Destination the repo does not have is refused in plain words with a fixed hint (the number typed from the Ticket box above it)', (t) => {
  const d = repo(t);
  assert.equal(startDestinationProblem(card(d, '7')), 'Destination `7` is not a folder or file in this repo. Type the folder that holds the files the job should change, like src/.');
  assert.match(startDestinationProblem(card(d, 'src/, nope/')), /^Destination `nope\/` is not a folder or file in this repo\./, 'the first missing one is named');
  for (const bad of ['sr', 'src/missing.js', 'srcx/', 'untracked-dir/', 'staged-dir/', 'lib/**/*.js', '../src']) assert.notEqual(startDestinationProblem(card(d, bad)), null, bad);
});

test('the check reads the COMMITTED tree (what the job copy will hold), not the working folder', (t) => {
  const d = repo(t);
  assert.deepEqual(destinationMissingInRepo(d, 'untracked-dir/'), 'untracked-dir/');
  assert.equal(destinationMissingInRepo(d, 'docs/'), null);
});

test('a plain-folder job (no repo) and a rubric job on files are unchanged; a git failure does not invent a refusal', (t) => {
  const plain = mkdtempSync(path.join(tmpdir(), 'destplain-'));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  writeFileSync(path.join(plain, 'a.txt'), 'x\n');
  assert.equal(startDestinationProblem({ inputs: `src: ${plain}`, destination: '/tmp/out', checkType: 'deterministic' }), null);
  assert.match(startDestinationProblem({ inputs: `src: ${plain}`, destination: 'out', checkType: 'rubric' }), /^Destination must be the full path of a folder/);
  assert.equal(destinationMissingInRepo(path.join(plain, 'nogit'), 'anything'), null, 'an unreadable tree is not this check\'s refusal (the copy step refuses it)');
});

test('absolute path for a repo keeps its own older words (checked first)', (t) => {
  const d = repo(t);
  assert.equal(startDestinationProblem(card(d, '/etc')), 'Destination must be a path inside the repo, like src/digest.js');
});
