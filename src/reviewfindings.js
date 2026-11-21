// review-findings — what a PASSED review line's answer said, as a spine record ("Result tab A + Job type everywhere", docs/product/ITEM33-BUILD.md, hamr 2026-11-21). A repo review delivers only its .md report, and the
// worker's answer file (output/steps/<n>.json) lives in a run folder that is cleaned up after Accept; this is the ONE owner of the capture that lets the Result tab list the findings without that folder.
// It is REPORT ONLY: written once per review line the final close passed, after the close's verdict is minted, never read by a verdict, a cap, a fence or a governor, and a red line writes none.
// Capped like attempt-diff (a field cap, an event cap; what does not fit is counted in `total`, never silently dropped) and masked with the run's one `scrub` (the one secret inventory). Every failure is caught: nothing here throws.

import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { sourceOf } from './sourcedefaults.js';
import { stepFileRel, STEP_MAX_BYTES } from './rubricstep.js';
import { shapePartOf } from './shaperows.js';
import { DIFF_DIR } from './rangereview.js';
import { ATTEMPT_DIFF_FILE_MAX, ATTEMPT_DIFF_EVENT_MAX } from './attemptdiff.js';

/** the spine record's type */
export const REVIEW_FINDINGS = 'review-findings';
/** per-field cap in bytes: the attempt-diff's own per-file cap. The event cap is the attempt-diff's per-event cap too. */
export const REVIEW_FINDING_FIELD_MAX = ATTEMPT_DIFF_FILE_MAX;
export const REVIEW_FINDINGS_EVENT_MAX = ATTEMPT_DIFF_EVENT_MAX;

/** @param {string} text @param {number} max a text cut to at most `max` bytes (a character is never split), with a mark when cut */
function capBytes(text, max) {
  if (Buffer.byteLength(text) <= max) return text;
  let out = text.slice(0, max);
  while (Buffer.byteLength(out) > max - 3) out = out.slice(0, -1);
  return `${out}...`;
}

/** the number of files the review covers: the lines of code's own `files.txt` in the run's tree, or null when it is not there @param {string} workdir @returns {Promise<number|null>} */
async function coveredFiles(workdir) {
  try {
    const text = await readFile(join(workdir, DIFF_DIR, 'files.txt'), 'utf8');
    return text.split('\n').filter((l) => l !== '').length;
  } catch { return null; }
}

/**
 * The `review-findings` records of a close that PASSED: one per review line (a rubric-step stage with a shape part, on a repo source) whose stage verdict is `satisfied`, read from the line's answer file in the run's tree.
 * `[]` for any other close (files source, a code close) or a line that did not pass.
 * @param {{closeDecl: any, stages: any[]|undefined, workdir: string, scrub: (s: string) => string}} o `stages` = the passed close verdict's `{name, verdict}` list
 * @returns {Promise<{line: number, total: number, items: {file: string, quote: string, why: string}[], cut: boolean, files: number|null}[]>}
 */
export async function reviewFindingsRecords({ closeDecl, stages, workdir, scrub }) {
  /** @type {{line: number, total: number, items: {file: string, quote: string, why: string}[], cut: boolean, files: number|null}[]} */
  const out = [];
  try {
    if (sourceOf(closeDecl) !== 'repo' || !Array.isArray(stages)) return out;
    const files = await coveredFiles(workdir);
    for (const st of Array.isArray(closeDecl?.stages) ? closeDecl.stages : []) {
      if (!st || st.kind !== 'rubric-step' || !Number.isInteger(st.params?.step) || shapePartOf(st.params) === null) continue;
      if (stages.find((x) => x && x.name === st.name)?.verdict !== 'satisfied') continue;
      const abs = join(workdir, stepFileRel(st.params.step));
      const ls = await lstat(abs);
      if (!ls.isFile() || ls.size > STEP_MAX_BYTES) continue;
      const obj = JSON.parse(await readFile(abs, 'utf8'));
      const results = obj !== null && typeof obj === 'object' && Array.isArray(obj.results) ? obj.results : null;
      if (results === null) continue;
      /** @type {{file: string, quote: string, why: string}[]} */
      const items = [];
      let bytes = 0;
      for (const r of results) {
        if (r === null || typeof r !== 'object' || typeof r.file !== 'string' || typeof r.quote !== 'string' || typeof r.why !== 'string') continue;
        const item = { file: capBytes(scrub(r.file), REVIEW_FINDING_FIELD_MAX), quote: capBytes(scrub(r.quote), REVIEW_FINDING_FIELD_MAX), why: capBytes(scrub(r.why), REVIEW_FINDING_FIELD_MAX) };
        bytes += Buffer.byteLength(JSON.stringify(item));
        if (bytes > REVIEW_FINDINGS_EVENT_MAX) break;
        items.push(item);
      }
      out.push({ line: st.params.step, total: results.length, items, cut: items.length < results.length, files });
    }
  } catch { /* a record, never a verdict: nothing was captured */ }
  return out;
}
