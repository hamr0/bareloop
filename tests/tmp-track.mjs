// Test helper: remove a temp dir the test made when the test process exits, so a suite run leaves nothing in the tmp dir.
// `track(mkdtempSync(...))` returns the dir; one exit handler removes every tracked dir (sync, recursive, force).
import { rmSync } from 'node:fs';

/** @type {string[]} */
const dirs = [];
let hooked = false;

/** @param {string} dir @returns {string} */
export function track(dir) {
  dirs.push(dir);
  if (!hooked) {
    hooked = true;
    process.on('exit', () => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });
  }
  return dir;
}
