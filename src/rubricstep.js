// PART 1a (docs/product/ITEM33-BUILD.md, "Addendum 2026-10-12"): the rubric job on LOCAL FILES — what one job line leaves
// behind and how it is told to the worker.
//
// One output per job line: `output/steps/<n>.json`, a JSON object
//
//     { "text": "<the answer for line n>",
//       "cites": { "<input label>": [ { "claim": "<one thing the text relies on>", "quote": "<words copied from that input>" } ] } }
//
// The `rubric-step` close kind (src/kinds.js) grades it with bareguard's rubric primitive; the worker's brief (the goal
// this module writes) and the composer's prompt (src/authorflow.js) both quote the SAME contract text from here, so the
// file the worker is told to write and the file the close reads cannot drift.

/** where the per-line step files live, inside the job's tree; `copyOut` delivers them with the rest of `output/` */
export const STEP_DIR = 'output/steps';
/** a step file's tree-relative path @param {number} n the job line number @returns {string} */
export const stepFileRel = (n) => `${STEP_DIR}/${n}.json`;
/** the largest step file the close reads: a bigger one is a stop, never silently truncated (bareguard's own source cap) */
export const STEP_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The one statement of the step-file shape, in plain words. The worker's goal and the composer's prompt both carry it.
 * @returns {string}
 */
export function stepFileContract() {
  return [
    `For each numbered job line N, write ONE file ${STEP_DIR}/N.json: a JSON object with exactly these keys.`,
    '  "text"  — your answer for that line, as a string.',
    '  "cites" — an object: for each input you drew on, its label as the key and a list of {"claim", "quote"} as the value.',
    '            "claim" is one thing your text relies on; "quote" is words copied EXACTLY from that input (spacing and',
    '            ** or __ marks do not matter). Every number in a claim must also appear in its quote.',
    'Write nothing outside output/, and never edit the files under input/. The file must be complete, valid JSON: a file cut',
    'off before its closing brace counts as not written.',
  ].join('\n');
}

/**
 * The worker's goal for a rubric job on local files — written by code from the person's own numbered lines, never by a
 * model. It states everything the close will judge about the FORM of the answer (the file, the keys, the quotes); what
 * each line asks for stays in the person's own words, with its `~` rules beneath it.
 * @param {{jobLines: {n: number, text: string, rule: string}[], files: {label: string, rel: string}[]}} o
 * @returns {string}
 */
export function rubricGoal({ jobLines, files }) {
  const inputs = files.map((f) => `  - ${f.label}: ${f.rel}`).join('\n');
  const lines = jobLines.map((l) => `${l.n}. ${l.text}${l.rule ? `\n   rule: ${l.rule}` : ''}`).join('\n');
  return [
    'Do the job below from the input files, then write one JSON file per numbered line.',
    `The input files (label: file):\n${inputs}`,
    stepFileContract(),
    `The job, line by line:\n${lines}`,
  ].join('\n\n');
}
