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
    '  In each claim, copy every number, time and price exactly as the input writes it (for example "9:27 AM", not "09:27"),',
    '  because the check matches the numbers in your claim against your quote.',
    'Write nothing outside output/, and never edit the files under input/. The file must be complete, valid JSON: a file cut',
    'off before its closing brace counts as not written.',
  ].join('\n');
}

/**
 * The worker's goal for a rubric job on local files — written by code from the person's own numbered lines, never by a
 * model. It states everything the close will judge about the FORM of the answer (the file, the keys, the quotes); what
 * each line asks for stays in the person's own words, with its `~` rules beneath it.
 * @param {{jobLines: {n: number, text: string, rule: string}[], files: {label: string, rel: string}[], confirmedGoal?: string|null}} o
 *   `confirmedGoal` — the one goal sentence the person confirmed in the confirm turn, kept as the plan line
 * @returns {string}
 */
export function rubricGoal({ jobLines, files, confirmedGoal = null }) {
  const inputs = files.map((f) => `  - ${f.label}: ${f.rel}`).join('\n');
  const lines = jobLines.map((l) => `${l.n}. ${l.text}${l.rule ? `\n   rule: ${l.rule}` : ''}`).join('\n');
  return [
    'Do the job below from the input files, then write one JSON file per numbered line.',
    `The input files (label: file):\n${inputs}`,
    stepFileContract(),
    `The job, line by line:\n${lines}`,
    ...(confirmedGoal ? [`The plan the person confirmed: ${confirmedGoal}`] : []),
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
  // a COUNT of the claims listed under an input: the code counts the list (flattenStep), bareguard's own min/max compares it
  minClaims: Object.freeze(['value', 'source']),
  maxClaims: Object.freeze(['value', 'source']),
});
/** every field a part may carry, whatever its class */
const PART_FIELDS = Object.freeze(['text', 'class', 'check', 'value', 'names', 'wordsPerSection', 'source', 'domains', 'covers']);

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
    if (Object.hasOwn(part, 'covers') && !(Array.isArray(part.covers) && part.covers.length > 0 && new Set(part.covers).size === part.covers.length
      && part.covers.every((/** @type {unknown} */ x) => Number.isInteger(x) && /** @type {number} */ (x) >= 1))) {
      red('invalid-value', `${w}.covers`, 'the numbers of the confirmed checks this part carries out (distinct integers, 1 or more)');
    }
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
      case 'minClaims': checks.push({ id, rule: 'min', field: `claims:${part.source}`, value: part.value }); break;
      case 'maxClaims': checks.push({ id, rule: 'max', field: `claims:${part.source}`, value: part.value }); break;
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
 * @param {string[]} [countLabels] labels whose claim COUNT a minClaims/maxClaims part reads
 * @returns {Record<string, any>}
 */
export function flattenStep(obj, countLabels = []) {
  /** @type {Record<string, any>} */
  const fields = {};
  // the number of claims listed under each label a claim-count check names (0 when the label is absent): counted HERE, by
  // code, from the file's own list — the worker never writes a number the check trusts
  for (const label of countLabels) {
    const list = isRec(obj.cites) && Object.hasOwn(obj.cites, label) ? obj.cites[label] : null;
    fields[`claims:${label}`] = Array.isArray(list) ? list.length : 0;
  }
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
  if ((g.check === 'min' || g.check === 'max') && String(g.field ?? '').startsWith('claims:')) {
    const label = String(g.field).slice('claims:'.length);
    return g.check === 'min'
      ? `${at}: only ${g.measured ?? 0} claim(s) are listed under "${label}" in "cites", at least ${g.limit} are required`
      : `${at}: ${g.measured} claims are listed under "${label}" in "cites", at most ${g.limit} are allowed`;
  }
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
  const countLabels = [...new Set(params.parts.filter((/** @type {any} */ x) => x.class === 'countable' && (x.check === 'minClaims' || x.check === 'maxClaims')).map((/** @type {any} */ x) => String(x.source)))];
  const r = await checkStep(rubric, String(params.step), parsed.obj === null ? null : flattenStep(parsed.obj, countLabels), {
    inputs, ...(outputBytes === null ? {} : { outputBytes }),
  });
  // the stage's ONE trend number for the fix-loop governor (F192 e, mirrored): failing CLAIMS under a `cited` check (bareguard's
  // own `measured` count of unsupported quotes), plus 1 for every other failing check — lower is better, compared to the
  // best so far through the same `closeGrade` {stage, value} path numeric stages use
  const redCount = r.full.gaps.reduce((/** @type {number} */ n, /** @type {any} */ g) => n + (g.check === 'cited' && g.kind === 'unsupported' && typeof g.measured === 'number' ? g.measured : 1), 0);
  const detail = { step: params.step, rubricSha: r.rubricSha, outputSha: r.outputSha, why: parsed.why, gaps: r.full.gaps.length, ...(r.verdict === 'red' ? { redCount } : {}) };
  if (r.verdict === 'stopped') return { verdict: 'stopped', gapLines: [], fault: r.fault ? `${r.fault.kind}: ${r.fault.detail}` : 'the rubric stopped', detail };
  if (r.verdict === 'green') return { verdict: 'green', gapLines: [], fault: null, detail };
  return { verdict: 'red', gapLines: r.gaps.map((g) => plainStepGap(params.step, parsed.why ?? 'empty', g)), fault: null, detail };
}

// ── R11: the sorting rules, applied at DRAFTING ──────────────────────────────────────────────────────────────────────

/**
 * The labels of a job's numbered inputs, or null when it carries none (a caller that has no inputs in hand skips the label rule).
 * @param {unknown} inputs @returns {string[]|null}
 */
export function inputLabelsOf(inputs) {
  if (!Array.isArray(inputs)) return null;
  const labels = inputs.map((i) => (isRec(i) ? i.label : null)).filter((l) => typeof l === 'string');
  return labels.length > 0 ? labels : null;
}

/** @param {string} text @returns {string} a person's own words, one line, bounded for a message */
const sayText = (text) => {
  const one = String(text).replace(/\s+/g, ' ').trim();
  return one.length > 80 ? `${one.slice(0, 80)}…` : one;
};

/**
 * The word range a part allows, as `[min, max]` (null = no bound on that side), read off its check. `sectionWords` allows
 * each of its sections 80-120% of its asked words (bareguard's own band), so the whole text must hold at least
 * `names x ceil(0.8 x asked)` words — and at most `names x floor(1.2 x asked)` for the sections alone.
 * @param {any} part @returns {{min: number|null, max: number|null, say: string}|null}
 */
function wordRange(part) {
  if (part.check === 'maxWords') return { min: null, max: part.value, say: `at most ${part.value} words` };
  if (part.check === 'minWords') return { min: part.value, max: null, say: `at least ${part.value} words` };
  if (part.check === 'sectionWords') {
    const lo = Math.ceil(part.wordsPerSection * 0.8);
    const hi = Math.floor(part.wordsPerSection * 1.2);
    return { min: part.names.length * lo, max: null, say: `${part.names.length} section(s) of ${lo}-${hi} words each, so at least ${part.names.length * lo} words` };
  }
  return null;
}

/**
 * R11 — the drafting-time rules for the `rubric-step` stages of a declaration, each a red in the person's plain words that
 * names the job line and ends "Nothing spent." where nothing was. Pure; never throws. Judged parts are RED in this build
 * (the judge arrives in the next one): the sorting is still asked for, so a part that needs the judge is named as such
 * instead of being approximated by a count.
 *   - a stage serves exactly the one job line it names (`step` = its only `fromLine`), and no line has two stages;
 *   - a part with no class (`none`) cannot be counted or checked against a quote;
 *   - a `judged` part needs the judge; a `guard` part is about web sources and the job has no web input;
 *   - two countable parts of ONE line that no text can satisfy together (a minimum above a maximum) are a contradiction,
 *     naming both parts and both numbers;
 *   - a `cited` part names a label the person's inputs do not have.
 * @param {any[]} stages the declaration's stages
 * @param {{inputLabels?: string[]|null, red: (code: string, path: string, detail: string, extra?: object) => void}} o
 *   `inputLabels` absent = the label rule is not run (a caller with no inputs in hand)
 */
export function checkRubricParts(stages, { inputLabels = null, red }) {
  /** @type {Map<number, string>} */
  const owner = new Map();
  stages.forEach((st, i) => {
    if (!isRec(st) || st.kind !== 'rubric-step' || !isRec(st.params)) return;
    const at = `stages[${i}]`;
    const p = st.params;
    const step = p.step;
    const label = nonEmpty(st.name) ? st.name : at;
    const line = Number.isInteger(step) ? step : '?';
    if (Array.isArray(st.fromLine) && !(st.fromLine.length === 1 && st.fromLine[0] === step)) {
      red('rubric-step-line', `${at}.fromLine`, `line ${line}: stage "${label}" reads the file for job line ${line} but says it serves line(s) ${st.fromLine.join(', ')}. One rubric-step stage serves exactly its own line.`, { stage: label });
    }
    if (Number.isInteger(step)) {
      const twin = owner.get(step);
      if (twin !== undefined) red('rubric-step-twice', `${at}.params.step`, `line ${line}: stages "${twin}" and "${label}" both read the file for job line ${line}. Give each job line one stage.`, { stage: label, twin });
      else owner.set(step, label);
    }
    if (!Array.isArray(p.parts)) return;
    /** @type {{part: any, range: {min: number|null, max: number|null, say: string}}[]} */
    const ranges = [];
    p.parts.forEach((/** @type {any} */ part, /** @type {number} */ j) => {
      if (!isRec(part)) return;
      const w = `${at}.params.parts[${j}]`;
      const said = sayText(part.text ?? '');
      if (part.class === 'none') {
        red('rubric-part-unsortable', w, `line ${line}: '${said}' can't be counted or checked against a quote. Say it as a count (words, sections, rows) or as something a quote must show.`, { line: step, stage: label });
      } else if (part.class === 'judged') {
        red('rubric-part-judged', w, `line ${line}: this rule needs the judge, which arrives in the next build. Nothing spent.`, { line: step, stage: label });
      } else if (part.class === 'guard') {
        red('rubric-part-guard', w, `line ${line}: '${said}' is about web sources, and this job has no web input. Nothing spent.`, { line: step, stage: label });
      } else if (part.class === 'countable') {
        if (part.check === 'cited' && Array.isArray(inputLabels) && !inputLabels.includes(part.source)) {
          red('rubric-part-source', `${w}.source`, `line ${line}: '${said}' asks for a quote from "${sayText(part.source ?? '')}", but the job's inputs are ${inputLabels.map((l) => `"${l}"`).join(', ')}.`, { line: step, stage: label });
        }
        const range = wordRange(part);
        if (range) ranges.push({ part, range });
      }
    });
    for (let a = 0; a < ranges.length; a += 1) {
      for (let b = a + 1; b < ranges.length; b += 1) {
        const [x, y] = [ranges[a], ranges[b]];
        const lo = Math.max(x.range.min ?? -Infinity, y.range.min ?? -Infinity);
        const hi = Math.min(x.range.max ?? Infinity, y.range.max ?? Infinity);
        if (lo > hi) {
          red('rubric-contradiction', `${at}.params.parts`, `line ${line}: '${sayText(x.part.text)}' (${x.range.say}) and '${sayText(y.part.text)}' (${y.range.say}) cannot both be met — no text has between ${lo} and ${hi} words. Change one of them. Nothing spent.`, { line: step, stage: label });
        }
      }
    }
  });
}

// ── the sign-vs-run invariant: the checks the person is SHOWN are the checks the signed close RUNS ───────────────────

/**
 * One countable part as a plain sentence, written by code from the part's signed fields (never from the model's words), so the
 * plan card and the close are one thing seen twice.
 * @param {any} part @returns {string}
 */
export function partSentence(part) {
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.map((x) => String(x)).join(', ') : '');
  switch (part.check) {
    case 'maxWords': return `the text is at most ${part.value} words`;
    case 'minWords': return `the text is at least ${part.value} words`;
    case 'maxLines': return `the text is at most ${part.value} lines`;
    case 'sections': return `the text has the section(s): ${list(part.names)}`;
    case 'sectionWords': return `each section (${list(part.names)}) is about ${part.wordsPerSection} words`;
    case 'cited': return `every claim is backed by a quote copied from "${part.source}"`;
    case 'minClaims': return `at least ${part.value} claim(s) are listed under "${part.source}"`;
    case 'maxClaims': return `at most ${part.value} claim(s) are listed under "${part.source}"`;
    default: return String(part.text ?? part.check);
  }
}

/**
 * The checks a signed close actually runs, per job line, in plain code-written sentences: one per countable part of every
 * rubric-step stage. This is the ONE reader both the plan card and the sign-time invariant use.
 * @param {any} closeDecl
 * @returns {{line: number, text: string, covers: number[]}[]}
 */
export function checksOfClose(closeDecl) {
  const stages = isRec(closeDecl) && Array.isArray(closeDecl.stages) ? closeDecl.stages : [];
  return stages.flatMap((/** @type {any} */ st) => (isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts)
    ? st.params.parts.filter((/** @type {any} */ p) => isRec(p) && p.class === 'countable').map((/** @type {any} */ p) => ({
      line: st.params.step, text: partSentence(p), covers: Array.isArray(p.covers) ? p.covers.filter(Number.isInteger) : [],
    }))
    : []));
}

/**
 * Reconcile the CONFIRMED plan with the close the composer actually wrote. The plan card after drafting shows exactly
 * the close's own checks (`checksOfClose`); every confirmed check that no part carries out (no part lists its number in
 * `covers`) is moved to Not checked, in the person's words, with the reason. A check can therefore never be shown and then
 * silently dropped (run mv5bk400: "lists 3 releases" was confirmed, then left out of the signed close without a word).
 * @param {{confirmed: {text: string, fromLine: number[]|null}[], notChecked: string[], closeDecl: any}} o
 * @returns {{checkItems: {text: string, fromLine: number[]}[], notChecked: string[], moved: {text: string, fromLine: number[]|null}[]}}
 */
export function reconcileRubricPlan({ confirmed, notChecked, closeDecl }) {
  const real = checksOfClose(closeDecl);
  const covered = new Set(real.flatMap((c) => c.covers));
  const moved = confirmed.filter((_, i) => !covered.has(i + 1));
  return {
    checkItems: real.map((c) => ({ text: c.text, fromLine: [c.line] })),
    notChecked: [
      ...notChecked,
      ...moved.map((m) => `${m.fromLine && m.fromLine.length ? `line ${m.fromLine.join(', ')}: ` : ''}${m.text} — nothing in this close counts it or checks it against a quote`),
    ],
    moved,
  };
}

/**
 * The sign-time invariant: the checks the person was shown (`shown`, from the plan card) are exactly the checks the signed
 * close runs (`checksOfClose`), per line. Pure.
 * @param {{text: string, fromLine: number[]|null}[]} shown @param {any} closeDecl
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function planMatchesClose(shown, closeDecl) {
  const key = (/** @type {number|null|undefined} */ line, /** @type {string} */ text) => `line ${line ?? '?'}: ${text}`;
  const ran = checksOfClose(closeDecl).map((c) => key(c.line, c.text));
  const saw = shown.map((c) => key(Array.isArray(c.fromLine) ? c.fromLine[0] : null, c.text));
  const onlyShown = saw.filter((k) => !ran.includes(k));
  const onlyRan = ran.filter((k) => !saw.includes(k));
  if (onlyShown.length === 0 && onlyRan.length === 0 && saw.length === ran.length) return { ok: true };
  const parts = [];
  if (onlyShown.length) parts.push(`shown to you but not in the signed close: ${onlyShown.join('; ')}`);
  if (onlyRan.length) parts.push(`in the signed close but not shown to you: ${onlyRan.join('; ')}`);
  return { ok: false, error: `The checks you were shown do not match the checks the signed close would run (${parts.join(' | ')}). Nothing was signed — draft again.` };
}
