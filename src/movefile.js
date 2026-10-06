// Move a file between two paths that may sit on DIFFERENT filesystems.
// `renameSync` cannot cross a device (EXDEV): a worktree inside the person's own repo can be on /tmp or
// another drive while the spine / output dir stays under ~/.config. EXDEV only falls back to copy + unlink;
// every other error rethrows untouched. Renames inside one directory (atomic tmp -> final writes) don't need this.
import { renameSync, copyFileSync, unlinkSync } from 'node:fs';

/**
 * @param {string} src
 * @param {string} dst
 * @param {{ rename?: (a: string, b: string) => void }} [deps] test seam: the rename to try first
 * @returns {void}
 */
export function moveFile(src, dst, deps = {}) {
  const rename = deps.rename ?? renameSync;
  try {
    rename(src, dst);
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e)?.code !== 'EXDEV') throw e;
    copyFileSync(src, dst);
    unlinkSync(src);
  }
}
