import { createHash } from 'node:crypto';
import { createRubric, checkStep, renderGaps } from 'bareguard';

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

// ── the `rubric-step` stage: its parameters, and the rubric they build ───────────────────────────────────────────────
//
// A stage serves exactly ONE job line N and reads exactly one file, output/steps/N.json. Its parameters are
//
//     step   N
//     parts  [ { text, class, ... } ]   — the person's constraints on that line, each SORTED by the drafter
//
// A part's class is one of `countable` (a limit a machine counts, or a quote a claim must show), `judged` (needs the
// judge — stored, never run in this build), `guard` (a rule about web sources — needs a web input, none exist yet) or
// `none` (the drafter could not sort it). Only `countable` parts become checks; the others are REDS at drafting
// (src/authoring.js `checkRubricParts`) so no signed stage ever carries one.

/** the closed set of classes a part is sorted into; `none` = "I could not sort this one" (a red, in plain words, never a guess) */
export const PART_CLASSES = Object.freeze(['countable', 'judged', 'guard', 'none']);
/**
 * The counted/quoted checks a `countable` part may name, with the fields each needs — read off bareguard's own rule table
 * (`rubricVocabulary`): the names are bareguard's, so a check this build cannot run is inexpressible, not rejected late.
 * (`max`/`min` need a numeric field the step file does not have, so they are not offered.)
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const COUNT_CHECKS = Object.freeze({
  maxWords: Object.freeze(['value']),
  minWords: Object.freeze(['value']),
  maxLines: Object.freeze(['value']),
  sections: Object.freeze(['names']),
  sectionWords: Object.freeze(['names', 'wordsPerSection']),
  cited: Object.freeze(['source']),
});
/** every field a part may carry, whatever its class */
const PART_FIELDS = Object.freeze(['text', 'class', 'check', 'value', 'names', 'wordsPerSection', 'source', 'domains']);

/** @typedef {{code: string, path: string, detail: string}} ShapeRed */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRec = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {v is string} */
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
/** @param {unknown} v @returns {v is string[]} */
const nameList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => nonEmpty(x) && x.length <= 1000);

/**
 * The SHAPE of a `rubric-step` stage's parameters — what a part may carry — and nothing about which class is allowed in
 * this build (that is `checkRubricParts`, which also sees the whole job). Pure, never throws.
 * @param {unknown} p the stage's `params`
 * @param {string} at the path prefix for reds, e.g. `stages[1].params`
 * @returns {ShapeRed[]}
 */
export function rubricStepShapeReds(p, at) {
  /** @type {ShapeRed[]} */
  const reds = [];
  const red = (/** @type {string} */ code, /** @type {string} */ path, /** @type {string} */ detail) => reds.push({ code, path, detail });
  if (!isRec(p)) { red('invalid-value', at, 'an object {step, parts}'); return reds; }
  if (!(Number.isInteger(p.step) && p.step >= 1)) red('invalid-value', `${at}.step`, 'the number of the job line this stage serves (an integer, 1 or more)');
  if (!Array.isArray(p.parts)) { red('invalid-value', `${at}.parts`, 'an array of {text, class, ...} — one entry per constraint the person put on this line (may be empty)'); return reds; }
  p.parts.forEach((/** @type {any} */ part, /** @type {number} */ i) => {
    const w = `${at}.parts[${i}]`;
    if (!isRec(part)) { red('invalid-value', w, '{text, class, ...}'); return; }
    for (const k of Object.keys(part)) {
      if (!PART_FIELDS.includes(k)) red('invalid-value', `${w}.${k}`, `"${k}" is not a field of a part — fields: ${PART_FIELDS.join(', ')}`);
    }
    if (!nonEmpty(part.text)) red('missing-field', `${w}.text`, 'the part, in the person\'s own words (a non-empty string)');
    if (!PART_CLASSES.includes(part.class)) { red('invalid-value', `${w}.class`, `one of ${PART_CLASSES.join(' | ')}`); return; }
    if (part.class === 'guard') {
      if (!nameList(part.domains)) red('invalid-value', `${w}.domains`, 'a non-empty array of web domains the rule is about');
      return;
    }
    if (part.class !== 'countable') return;
    if (!Object.hasOwn(COUNT_CHECKS, part.check)) { red('invalid-value', `${w}.check`, `one of ${Object.keys(COUNT_CHECKS).join(' | ')}`); return; }
    for (const f of COUNT_CHECKS[part.check]) {
      const ok = f === 'value' || f === 'wordsPerSection' ? Number.isInteger(part[f]) && part[f] >= 1
        : f === 'names' ? nameList(part.names)
          : nonEmpty(part.source) && part.source.length <= 128;
      if (!ok) {
        red('invalid-value', `${w}.${f}`, f === 'names' ? 'a non-empty array of section names'
          : f === 'source' ? 'the label of the input a quote must come from'
            : 'an integer, 1 or more');
      }
    }
  });
  return reds;
}

/** the labels of the inputs a step's `cited` parts name (each once, in order) @param {any} params @returns {string[]} */
export function citedLabels(params) {
  const parts = Array.isArray(params?.parts) ? params.parts : [];
  return [...new Set(parts.filter((/** @type {any} */ x) => isRec(x) && x.class === 'countable' && x.check === 'cited').map((/** @type {any} */ x) => String(x.source)))];
}

/**
 * The rubric spec for ONE step, built from its parameters and the sha256 of each input it cites (taken from the source
 * manifest at run start — a rubric is rebuilt per run because the inputs belong to the run, not to the signed job).
 * `happened` is bareguard's own foundational check; the `text` floor below it stops a step file whose only key is junk
 * from passing a rubric that has no countable part.
 * @param {{step: number, parts: any[]}} params
 * @param {Record<string, string>} inputShas label -> sha256 hex, for every label the step cites
 * @returns {Record<string, any>} a spec for bareguard's `createRubric`
 */
export function buildStepSpec(params, inputShas) {
  /** @type {Record<string, any>[]} */
  const checks = [{ id: 'text-present', rule: 'nonEmpty', field: 'text' }];
  params.parts.forEach((part, i) => {
    if (part.class !== 'countable') return;
    const id = `p${i + 1}-${part.check}`;
    switch (part.check) {
      case 'maxWords': case 'minWords': case 'maxLines': checks.push({ id, rule: part.check, field: 'text', value: part.value }); break;
      case 'sections': checks.push({ id, rule: 'sections', field: 'text', names: [...part.names] }); break;
      case 'sectionWords': checks.push({ id, rule: 'sectionWords', field: 'text', names: [...part.names], wordsPerSection: part.wordsPerSection }); break;
      case 'cited': checks.push({ id, rule: 'cited', claims: `cites:${part.source}`, source: part.source }); break;
      default: throw new Error(`rubric-step: no check named "${part.check}"`);
    }
  });
  return {
    schema: 1,
    goal: `job line ${params.step}`,
    inputs: Object.entries(inputShas).map(([name, sha256]) => ({ name, sha256 })),
    checkpoints: { [String(params.step)]: { gating: false, checks } },
  };
}

/** the sha256 of text, hex @param {string|Buffer} b @returns {string} */
export const sha256Of = (b) => createHash('sha256').update(b).digest('hex');

/**
 * The step file's bytes as the close reads them: the parsed JSON object, or WHY there is none. A file cut off mid-write
 * parses to nothing (reason `not-json`); text cut off INSIDE an otherwise valid JSON object cannot be told from a short
 * answer — that limit is documented, not hidden.
 * @param {string|null} bytes the file's text, or null when it does not exist
 * @returns {{obj: Record<string, any>, why: null}|{obj: null, why: 'missing'|'not-json'|'not-object'}}
 */
export function parseStepFile(bytes) {
  if (bytes === null) return { obj: null, why: 'missing' };
  let v;
  try { v = JSON.parse(bytes); } catch { return { obj: null, why: 'not-json' }; }
  if (!isRec(v)) return { obj: null, why: 'not-object' };
  return { obj: v, why: null };
}

/**
 * The step file as bareguard's rubric reads it: a flat object. `text` stays `text`; each label in `cites` becomes the field
 * `cites:<label>` (the name a `cited` check reads its claims from). Nothing else in the file is read.
 * @param {Record<string, any>} obj
 * @returns {Record<string, any>}
 */
export function flattenStep(obj) {
  /** @type {Record<string, any>} */
  const fields = {};
  // a missing or non-string `text` is read as empty, so the one red a worker sees is "text is missing or empty"
  fields.text = typeof obj.text === 'string' ? obj.text : '';
  if (isRec(obj.cites)) for (const [label, list] of Object.entries(obj.cites)) fields[`cites:${label}`] = list;
  return fields;
}

/**
 * One bareguard gap as a sentence the worker can act on. The numbers and names are bareguard's own measurements and the
 * person's signed limits, never anything this module infers; a gap this table does not know falls back to bareguard's own
 * rendering, so nothing is ever dropped.
 * @param {number} step @param {string} why why there was no object, when there was none
 * @param {any} g a bareguard gap
 * @returns {string}
 */
export function plainStepGap(step, why, g) {
  const file = stepFileRel(step);
  const at = `line ${step}`;
  if (g.check === 'happened' || g.id === 'happened') {
    const reason = why === 'missing' ? 'does not exist' : why === 'not-json' ? 'is not valid JSON (was it cut off?)' : why === 'not-object' ? 'is not a JSON object' : 'is empty';
    return `${at}: ${file} ${reason}`;
  }
  if (g.check === 'nonEmpty') return `${at}: "text" is missing or empty in ${file}`;
  if (g.check === 'maxWords') return `${at}: "text" has ${g.measured} words, at most ${g.limit} are allowed`;
  if (g.check === 'minWords') return `${at}: "text" has ${g.measured} words, at least ${g.limit} are required`;
  if (g.check === 'maxLines') return `${at}: "text" has ${g.measured} lines, at most ${g.limit} are allowed`;
  if (g.check === 'sections') return `${at}: "text" is missing section(s): ${(g.items ?? []).join(', ')}`;
  if (g.check === 'cited') {
    const label = String(g.field ?? '').replace(/^cites:/, '');
    if (g.kind === 'missing') return `${at}: "cites" has nothing under "${label}" — list each claim with a quote copied from that input`;
    if (g.kind === 'no-claims') return `${at}: "cites.${label}" is empty — list each claim with a quote copied from that input`;
    if (g.kind === 'unsupported') return `${at}: ${g.measured} of ${g.limit} quotes under "${label}" are not found word for word in that input, or carry a number the quote lacks: ${(g.items ?? []).join(', ')}`;
    return `${at}: "cites.${label}" cannot be checked (${g.kind})`;
  }
  return `${at}: ${renderGaps([g])}`;
}

/**
 * Grade ONE step: build the rubric, run it over the step file's fields, and say what happened in the close's own terms.
 * Pure of the filesystem (the runner in src/kinds.js reads the files). `stopped` = the instrument failed (never a red).
 * @param {{params: {step: number, parts: any[]}, bytes: string|null, outputBytes: string|null, inputs: Record<string, string>}} o
 *   `inputs` maps each cited label to its frozen TEXT; its sha256 is taken here from that text, and bareguard compares it to
 *   the manifest's recorded sha via `inputShas`.
 * @param {Record<string, string>} inputShas the manifest's recorded sha256 per cited label
 * @returns {Promise<{verdict: 'green'|'red'|'stopped', gapLines: string[], fault: string|null, detail: Record<string, any>}>}
 */
export async function gradeStep({ params, bytes, outputBytes, inputs }, inputShas) {
  let rubric;
  try { rubric = createRubric(buildStepSpec(params, inputShas)); } catch (e) {
    return { verdict: 'stopped', gapLines: [], fault: `the rubric for job line ${params.step} could not be built: ${/** @type {Error} */ (e).message}`, detail: {} };
  }
  const parsed = parseStepFile(bytes);
  const r = await checkStep(rubric, String(params.step), parsed.obj === null ? null : flattenStep(parsed.obj), {
    inputs, ...(outputBytes === null ? {} : { outputBytes }),
  });
  const detail = { step: params.step, rubricSha: r.rubricSha, outputSha: r.outputSha, why: parsed.why, gaps: r.full.gaps.length };
  if (r.verdict === 'stopped') return { verdict: 'stopped', gapLines: [], fault: r.fault ? `${r.fault.kind}: ${r.fault.detail}` : 'the rubric stopped', detail };
  if (r.verdict === 'green') return { verdict: 'green', gapLines: [], fault: null, detail };
  return { verdict: 'red', gapLines: r.gaps.map((g) => plainStepGap(params.step, parsed.why ?? 'empty', g)), fault: null, detail };
}
