// F118 (parked half) — the run→code direction. The commit→run direction
// (prompt-commit-check's `Failure:` line citing a run id) landed same-day;
// this is the other half: a run's own spine never recorded which version of
// bareloop's code it ran under, so a replay could not tell which prompts
// were in force. Report-only, $0, no shell — same posture as the F117
// verdictType/model stamp this rides beside (src/run.js:303).
//
// NEVER shells out to git: `run` is the one locked verb (hamr's law), and a
// library growing a shell seam just to read a report field is exactly the
// kind of capability creep that doctrine exists to block. Everything below
// is a plain file read of `.git`'s own on-disk layout.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// this module lives at <pkgRoot>/src/codeversion.js
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `.git` at a package root can be a FILE, not a directory — `git worktree
 * add` makes every worktree's own `.git` a one-line pointer file
 * (`gitdir: <path>`, absolute or relative to the worktree root) at the
 * per-worktree git dir living under the main checkout's `.git/worktrees/
 * <name>/` (measured directly: `git worktree add <tmp> HEAD --detach`
 * against this repo). Resolves that file to the real per-worktree git dir;
 * returns the plain `.git` directory path unchanged when it already is one,
 * and `null` when `.git` is absent (an npm install) or the pointer file
 * can't be read/parsed.
 * @param {string} pkgRoot
 * @returns {string|null}
 */
function resolveGitDir(pkgRoot) {
  const dotGit = join(pkgRoot, '.git');
  if (!existsSync(dotGit)) return null;
  const st = statSync(dotGit);
  if (st.isDirectory()) return dotGit;
  if (!st.isFile()) return null;
  const contents = readFileSync(dotGit, 'utf8').trim();
  const m = /^gitdir:\s*(.+)$/.exec(contents);
  if (!m) return null;
  const target = m[1].trim();
  return target.startsWith('/') ? target : join(pkgRoot, target);
}

/**
 * A worktree's own git dir (from {@link resolveGitDir}) holds HEAD but never
 * refs — branches/`packed-refs` are shared, and live in the MAIN checkout's
 * `.git`, whose path is this worktree git dir's own `commondir` file (one
 * line, a path RELATIVE TO THIS GIT DIR — measured directly: this repo's own
 * worktree fixture wrote `../..`, which from `.git/worktrees/<name>/`
 * resolves back to the repo's real `.git`). A normal (non-worktree) git dir
 * carries no `commondir` file at all and IS already the common dir.
 * @param {string} gitDir
 * @returns {string}
 */
function resolveCommonDir(gitDir) {
  const commondirPath = join(gitDir, 'commondir');
  if (!existsSync(commondirPath)) return gitDir;
  try {
    const rel = readFileSync(commondirPath, 'utf8').trim();
    if (!rel) return gitDir;
    return rel.startsWith('/') ? rel : join(gitDir, rel);
  } catch {
    return gitDir;
  }
}

/**
 * Resolve a ref name (e.g. "refs/heads/main") to a sha by reading the loose
 * ref file, falling back to `packed-refs` when the branch has been packed
 * (measured: this repo's own `.git/packed-refs` carries `main` but not every
 * branch — a loose ref can legitimately be absent while the branch is real).
 * @param {string} gitDir
 * @param {string} refName
 * @returns {string|null}
 */
function resolveRef(gitDir, refName) {
  const loose = join(gitDir, refName);
  if (existsSync(loose)) {
    try {
      const sha = readFileSync(loose, 'utf8').trim();
      return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
    } catch {
      return null;
    }
  }
  const packed = join(gitDir, 'packed-refs');
  if (!existsSync(packed)) return null;
  try {
    const lines = readFileSync(packed, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const [sha, ref] = line.trim().split(' ');
      if (ref === refName && sha && /^[0-9a-f]{40}$/.test(sha)) return sha;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Report-only stamp of the bareloop code this process is running as. Never
 * throws — an unreadable package.json or absent `.git` reads as `null`,
 * honestly, rather than crashing a caller over a report field.
 * @returns {{ version: string|null, sha: string|null, dirty: null }}
 */
export function codeVersion() {
  let version = null;
  try {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
    version = typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    version = null;
  }

  let sha = null;
  try {
    // only a dev checkout carries a `.git` at all (directory OR the
    // `gitdir:` pointer file a worktree checkout leaves instead) — an
    // npm-installed copy has neither, and this reads that absence as
    // "unknown", never fakes one
    const gitDir = resolveGitDir(PKG_ROOT);
    if (gitDir !== null) {
      const headPath = join(gitDir, 'HEAD');
      const head = readFileSync(headPath, 'utf8').trim();
      const m = /^ref:\s*(\S+)$/.exec(head);
      if (m) {
        // branches/packed-refs are shared across worktrees and live in the
        // COMMON git dir, never the per-worktree one HEAD itself came from
        sha = resolveRef(resolveCommonDir(gitDir), m[1]);
      } else if (/^[0-9a-f]{40}$/.test(head)) {
        // detached HEAD: a bare 40-hex sha directly in the file
        sha = head;
      }
    }
  } catch {
    sha = null;
  }

  // dirty: uncommitted-changes state cannot be known without a shell
  // (`git status`/`git diff`) — reported as unknown, never faked as false.
  return { version, sha, dirty: null };
}

/**
 * First 8 characters of a sha, or null. Mirrors the short-sha convention
 * `replay.js` already uses for `specHash` (`s.specHash.slice(0, 8)`).
 * @param {string|null|undefined} sha
 * @returns {string|null}
 */
export function shortSha(sha) {
  return typeof sha === 'string' && sha.length > 0 ? sha.slice(0, 8) : null;
}
