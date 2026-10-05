// The ONE spelling of "a run's tree is a git worktree inside the person's own repo"
// (`<repo>/.bareloop/wt/<id>`, detached at the repo's HEAD). Two doors make that tree: the bundle runner
// (`src/bundlerun.js`) and the panel's drafting session (`src/panel/authorsession.js`, through the source
// door's `worktree` option). Neither carries its own copy of the `git worktree add` call.
//
// Plain git, no dependency. Every helper takes the repo ROOT (the directory whose `.git` is the real
// repository), never a subfolder.

import { execFileSync } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** the line that hides bareloop's own folder from the person's `git status` (anchored at the repo root) */
export const EXCLUDE_LINE = '/.bareloop/';

/** where a run's worktree lives in the person's repo @param {string} repo @param {string} id */
export function worktreePath(repo, id) {
  return join(repo, '.bareloop', 'wt', id);
}

/**
 * `git worktree add --detach <dir> HEAD` in `repo`, creating `dir`'s parent first. Throws
 * `Error('git worktree add failed: …')` — a caller decides whether that is a stop or a refusal.
 * @param {string} repo @param {string} dir
 */
export function addWorktree(repo, dir) {
  mkdirSync(dirname(dir), { recursive: true });
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', dir, 'HEAD'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`git worktree add failed: ${/** @type {Error} */ (e).message}`);
  }
}

/**
 * How many paths `git status --porcelain` lists in `repo` (tracked edits AND untracked files); 0 for a clean
 * tree. A repo git cannot read counts as 0 — this feeds a notice, never a refusal.
 * @param {string} repo @returns {number}
 */
export function uncommittedCount(repo) {
  try {
    const out = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter((l) => l.trim() !== '').length;
  } catch { return 0; }
}

/** the short sha of `repo`'s HEAD, or null @param {string} repo @returns {string|null} */
export function shortHead(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch { return null; }
}

/**
 * Hide `.bareloop/` from the person's own `git status` through the repo's PRIVATE exclude file
 * (`<common-git-dir>/info/exclude`), never their tracked `.gitignore`. The common dir, not `.git`: in a linked
 * worktree `.git` is a file and the shared `info/exclude` lives in the main repository's git dir. Idempotent —
 * the line is never written twice.
 * @param {string} repo
 * @returns {boolean} true when the line was added now
 */
export function hideBareloopDir(repo) {
  const common = execFileSync('git', ['-C', repo, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const exclude = join(resolve(repo, common), 'info', 'exclude');
  mkdirSync(dirname(exclude), { recursive: true });
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (text.split('\n').some((l) => l.trim() === EXCLUDE_LINE)) return false;
  if (text === '') writeFileSync(exclude, `${EXCLUDE_LINE}\n`);
  else appendFileSync(exclude, `${text.endsWith('\n') ? '' : '\n'}${EXCLUDE_LINE}\n`);
  return true;
}

/**
 * Remove a run's worktree folder from `repo` (`git worktree remove --force`: the folder may hold untracked
 * scratch — a `.litectx/` index, the gate-audit file — and what matters is on the branch by now). Never throws.
 * @param {string} repo @param {string} dir
 * @returns {boolean} true when the folder is gone afterwards
 */
export function removeWorktree(repo, dir) {
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* fall through: report what is on disk */ }
  return !existsSync(dir);
}
