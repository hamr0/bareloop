// Fixture for the piece-12 tests (src/prcheckout.js): a LOCAL bare repo that plays GitHub's base repo and serves `refs/pull/1/head`, plus a "person's repo" whose
// remote is written as the GitHub address (https://github.com/octo/widgets.git) and rewritten to the local bare repo by git's own `insteadOf`. No network anywhere.
// The PR head is FORK-SHAPED: a commit on no branch of the base repo, reachable only through the pull ref.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitInPatient, initPatientRepo } from './helpers.js';
import { addWorktree, worktreePath } from '../src/worktree.js';

export const OWNER = 'octo';
export const REPO = 'widgets';
export const ADDRESS = `https://github.com/${OWNER}/${REPO}/pull/1`;
export const BIG = Array.from({ length: 200 }, (_, i) => `export const line${i} = ${i}; // padding so the file is well over 2 KB`).join('\n') + '\n';

/** @param {import('node:test').TestContext} t */
export function makeWorld(t) {
  const root = mkdtempSync(join(tmpdir(), 'pr-checkout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bare = join(root, 'base.git');
  mkdirSync(bare);
  gitInPatient(bare, ['init', '-q', '--bare', '-b', 'main']);

  // the person's repo: main has a.js and gone-on-pr.js
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  initPatientRepo(repo);
  writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'src', 'gone-on-pr.js'), 'export const gone = 1;\n');
  gitInPatient(repo, ['add', '-A']);
  gitInPatient(repo, ['commit', '-q', '-m', 'main files']);
  const baseSha = gitInPatient(repo, ['rev-parse', 'HEAD']).trim();
  gitInPatient(repo, ['push', '-q', bare, 'main']); // fixture setup only (the product never pushes)

  // the PR head: a commit that exists on no branch, served as refs/pull/1/head
  const scratch = join(root, 'scratch');
  gitInPatient(root, ['clone', '-q', bare, scratch]);
  writeFileSync(join(scratch, 'src', 'only-on-pr.js'), BIG);
  gitInPatient(scratch, ['rm', '-q', 'src/gone-on-pr.js']);
  gitInPatient(scratch, ['add', '-A']);
  gitInPatient(scratch, ['commit', '-q', '-m', 'the pull request']);
  const prSha = gitInPatient(scratch, ['rev-parse', 'HEAD']).trim();
  gitInPatient(scratch, ['push', '-q', bare, `${prSha}:refs/pull/1/head`]);
  // a second head, as if the PR was pushed again
  writeFileSync(join(scratch, 'src', 'later.js'), 'export const later = 1;\n');
  gitInPatient(scratch, ['add', '-A']);
  gitInPatient(scratch, ['commit', '-q', '-m', 'pushed again']);
  const laterSha = gitInPatient(scratch, ['rev-parse', 'HEAD']).trim();
  gitInPatient(scratch, ['push', '-q', bare, `${laterSha}:refs/pull/2/head`]);

  // the person's remote reads as GitHub; git itself rewrites it to the local bare repo
  setRemote(repo, 'origin', `https://github.com/${OWNER}/${REPO}.git`, bare);
  const wt = worktreePath(repo, 'r1');
  addWorktree(repo, wt);
  return { root, bare, repo, wt, baseSha, prSha, laterSha };
}

/** a remote named `name`, written as `address`, that git fetches from `target` @param {string} repo @param {string} name @param {string} address @param {string} target */
export function setRemote(repo, name, address, target) {
  gitInPatient(repo, ['remote', 'add', name, address]);
  gitInPatient(repo, ['config', `url.${target}.insteadOf`, address]);
}

/** a frozen PR record the way the checkout reads it (GitHub's own field names) @param {string} head @param {string} base */
export const record = (head, base) => ({ number: 1, head: { sha: head, ref: 'feature' }, base: { ref: 'main', sha: base } });

/** git output in a dir, trimmed @param {string} dir @param {string[]} args */
export const out = (dir, args) => gitInPatient(dir, args).trim();
