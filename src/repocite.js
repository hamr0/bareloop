// REVIEW THE CODE (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)", item 3): where a repo source's quotes are checked. A review's answer is a list of items, each `file`, `quote`, `why`; the signed cite finds each quote word for word in the repo
// files THE ITEMS NAME, read whole from the run's tree (nothing else of the repo is read, so a quote can only be found in a file the worker pointed at).
// This module only BUILDS the text the existing `cited` check reads and the plain-words reds code owns (a file no item can be read from, a text over bareguard's own source cap); it never judges a quote.
// The tracked-file listing serves the drafting looks (paths only): the worker's own tools read the code, the look never does.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIFF_DIR } from './rangereview.js';

/** bareguard's own source cap (its rubric reads one input of at most this many bytes), so the cite text is built within it or the item reds in plain words */
export const CITE_CAP_BYTES = 5 * 1024 * 1024;

/** every path git tracks in `dir`, as git spells them @param {string} dir @returns {string[]} */
export function trackedFiles(dir) {
  return execFileSync('git', ['-C', dir, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).split('\0').filter(Boolean);
}

/**
 * The changed files a range/branch review lists (`output/review-diff/files.txt`, written by code at run start); empty when the run has none.
 * @param {string} dir the run's tree @returns {Set<string>}
 */
function reviewDiffFiles(dir) {
  try { return new Set(readFileSync(join(dir, DIFF_DIR, 'files.txt'), 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
}

/**
 * Is `p` the per-file diff code wrote for a file of this review (`output/review-diff/<path>.diff`, <path> listed in files.txt, written exactly as listed)?
 * @param {string} p @param {Set<string>} listed
 */
const isReviewDiffOf = (p, listed) => p.startsWith(`${DIFF_DIR}/`) && p.endsWith('.diff') && listed.has(p.slice(DIFF_DIR.length + 1, -'.diff'.length));

/** the drafting looks' view of the repo: the tracked paths, one per line (paths only, never file contents) @param {string} dir @returns {string} */
export const repoListingText = (dir) => trackedFiles(dir).join('\n');

/**
 * The path an item's `file` names: written as the repo lists it (a leading `./` and a trailing `:<line>` or `:<line>-<line>` are the only things dropped; nothing else is guessed).
 * @param {unknown} raw @returns {string}
 */
export const itemPath = (raw) => (typeof raw === 'string' ? raw.trim().replace(/^(\.\/)+/, '').replace(/:\d+(?:-\d+)?$/, '') : '');

/**
 * The files the items name and the text the cite reads. Each item's `file` must be ONE tracked, regular file of the repo, or (a range/branch review) the per-file diff `output/review-diff/<path>.diff` of a file listed in files.txt; the text is the whole of each distinct named file, joined. A file that is not tracked, a link, a missing
 * file, or a named-files text over the cap is a plain-words red naming the item, never a throw and never a silent skip.
 * @param {string} dir the run's tree @param {unknown} results the answer's items
 * @returns {{text: string, reds: string[], files: string[]}}
 */
export function namedFilesText(dir, results) {
  const tracked = new Set(trackedFiles(dir));
  const listed = reviewDiffFiles(dir);
  /** @type {string[]} */ const reds = [];
  /** @type {string[]} */ const named = [];
  (Array.isArray(results) ? results : []).forEach((/** @type {any} */ r, /** @type {number} */ i) => {
    const raw = r !== null && typeof r === 'object' && !Array.isArray(r) ? r.file : undefined;
    const path = itemPath(raw);
    if (!tracked.has(path) && isReviewDiffOf(path, listed)) { if (!named.includes(path)) named.push(path); return; } // a per-file diff code wrote for a range/branch review: read like a tracked file, still only when an item names it
    if (path.startsWith(`${DIFF_DIR}/`) && !tracked.has(path)) {
      reds.push(`item ${i + 1}: "file" names no per-file diff of this review ("${path.slice(0, 80)}"); name ${DIFF_DIR}/<path>.diff of a file listed in ${DIFF_DIR}/files.txt, or a tracked file of the repo`);
      return;
    }
    if (!tracked.has(path)) {
      reds.push(`item ${i + 1}: "file" names no file of the repo (${typeof raw !== 'string' || raw.trim() === '' ? 'it is empty' : `"${raw.slice(0, 80)}"`}); write the path of one tracked file as the repo lists it, for example src/example.js`);
      return;
    }
    if (!named.includes(path)) named.push(path);
  });
  /** @type {{f: string, abs: string}[]} */ const readable = [];
  let total = 0;
  for (const f of named) {
    const abs = join(dir, f);
    try {
      const st = lstatSync(abs);
      if (!st.isFile()) { reds.push(`"${f}" is not a regular file (a link or a folder), so its quotes cannot be checked`); continue; }
      total += st.size + 1;
    } catch { reds.push(`"${f}" is listed by the repo but is not there to read, so its quotes cannot be checked`); continue; }
    readable.push({ f, abs });
  }
  if (total > CITE_CAP_BYTES) {
    reds.push(`the files the items name are ${(total / 1048576).toFixed(1)} MB together, over the ${CITE_CAP_BYTES / 1048576} MB the quote check can read; name fewer or smaller files`);
    return { text: '', reds, files: named };
  }
  return { text: readable.map((x) => readFileSync(x.abs, 'utf8')).join('\n'), reds, files: named };
}
