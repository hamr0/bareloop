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
    const gitDir = join(PKG_ROOT, '.git');
    // only a dev checkout carries a `.git` directory at all; an npm-installed
    // copy has none, and this reads that absence as "unknown", never fakes one
    if (existsSync(gitDir) && statSync(gitDir).isDirectory()) {
      const headPath = join(gitDir, 'HEAD');
      const head = readFileSync(headPath, 'utf8').trim();
      const m = /^ref:\s*(\S+)$/.exec(head);
      if (m) {
        sha = resolveRef(gitDir, m[1]);
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
