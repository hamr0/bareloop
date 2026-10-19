import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRubric, checkStep, renderGaps, numbersInQuote } from 'bareguard';
import { dropRows, dropLine } from './pagedropwords.js';
import { factPartOf, factShapeReds, factDecides, factClaims, factRows, plainFactItem, factBrief } from './facts.js';

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
    'A job line the brief below marks as a FACTS line is different: its file holds ONLY {"results": [{"quote": "...", "values":',
    '{"<fact>": "<value>"}}]} — one result per thing found, one quote copied exactly from the text of that one result, the values written as the quote',
    'writes them; no "text" and no "cites". A line the brief marks as a TEXT line keeps "text" (free words), and every number in it',
    'must be copied from a quote of an earlier facts line.',
    'Write nothing outside output/, and never edit the files under input/. The file must be complete, valid JSON: a file cut',
    'off before its closing brace counts as not written.',
  ].join('\n');
}

/**
 * What the worker is told about each line, from the close that will grade it (PART 1b item 7): a FACTS line gets its
 * facts and its count; a TEXT line that follows a facts line is told its numbers come from that line's quotes. Written by code from
 * the signed parts, never by a model. A line with no rubric-step stage gets nothing here.
 * @param {any} closeDecl @returns {{line: number, text: string}[]}
 */
export function lineBriefs(closeDecl) {
  const stages = isRec(closeDecl) && Array.isArray(closeDecl.stages) ? closeDecl.stages : [];
  /** @type {{line: number, text: string}[]} */
  const out = [];
  for (const st of stages) {
    if (!(isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts) && Number.isInteger(st.params.step))) continue;
    const n = st.params.step;
    const fp = factPartOf(st.params);
    if (fp) {
      const c = isRec(fp.count) ? fp.count : null;
      const count = !c ? 'one result for every one you find' : c.min !== undefined && c.max !== undefined
        ? (c.min === c.max ? `exactly ${c.min} result${c.min === 1 ? '' : 's'}` : `${c.min} to ${c.max} results`)
        : c.min !== undefined ? `at least ${c.min} results` : `at most ${c.max} results`;
      out.push({
        line: n,
        text: [
          `Job line ${n} is a FACTS line. Write ${stepFileRel(n)} as {"results": [{"quote": "...", "values": {...}}]} and nothing else — no "text", no "cites".`,
          `  One result per thing you find in the input "${fp.source}": ${count}.`,
          '  "quote": ONE quote per result, copied exactly from that result\'s own text in the input (at most 4000 characters) — never joined from two results.',
          '  "values": one entry per fact below, written exactly as the quote writes it (for example "9:27 AM", not "09:27"; "389", not "389.00").',
          ...fp.facts.map((/** @type {any} */ f) => `    - ${factBrief(f)}`),
        ].join('\n'),
      });
      continue;
    }
    const tie = st.params.parts.find((/** @type {any} */ x) => isRec(x) && x.class === 'countable' && x.check === 'numbersFromFacts');
    if (tie) {
      out.push({
        line: n,
        text: `Job line ${n} is a TEXT line. Write ${stepFileRel(n)} as {"text": "..."}. Your words are free, but every number in the text must be copied exactly as it is written in a quote you wrote for job line ${tie.from.join(', ')} — use no other number.`,
      });
    }
  }
  return out;
}

/**
 * The worker's goal for a rubric job on local files — written by code from the person's own numbered lines, never by a
 * model. It states everything the close will judge about the FORM of the answer (the file, the keys, the quotes); what
 * each line asks for stays in the person's own words, with its `~` rules beneath it.
 * @param {{jobLines: {n: number, text: string, rule: string}[], files: {label: string, rel: string}[], confirmedGoal?: string|null, closeDecl?: any}} o
 *   `confirmedGoal` — the one goal sentence the person confirmed in the confirm turn, kept as the plan line
 *   `closeDecl` — the drafted close: with it, each line is briefed by what its stage checks (a facts line or a text line, `lineBriefs`)
 * @returns {string}
 */
export function rubricGoal({ jobLines, files, confirmedGoal = null, closeDecl = null }) {
  const inputs = files.map((f) => `  - ${f.label}: ${f.rel}`).join('\n');
  const lines = jobLines.map((l) => `${l.n}. ${l.text}${l.rule ? `\n   rule: ${l.rule}` : ''}`).join('\n');
  return [
    RUBRIC_GOAL_HEAD,
    `The input files (label: file):\n${inputs}`,
    stepFileContract(),
    `The job, line by line:\n${lines}`,
    ...(closeDecl ? lineBriefs(closeDecl).map((b) => b.text) : []),
    ...(confirmedGoal ? [`${CONFIRMED_GOAL_PREFIX}${confirmedGoal}`] : []),
  ].join('\n\n');
}

/**
 * What a rubric job's goal text is: the worker brief `rubricGoal` builds. The Job tab's "AI's summary" is only the one
 * sentence the person confirmed, never this brief, so the first line and the confirmed-sentence prefix have ONE spelling.
 */
export const RUBRIC_GOAL_HEAD = 'Do the job below from the input files, then write one JSON file per numbered line.';
const CONFIRMED_GOAL_PREFIX = 'The plan the person confirmed: ';

/**
 * The sentence the person confirmed, out of a goal text: for a rubric brief the rest of the `CONFIRMED_GOAL_PREFIX` line,
 * or null when the brief has none; any other goal (a code job's) comes back unchanged.
 * @param {string} goal
 * @returns {string|null}
 */
export function confirmedGoalOf(goal) {
  if (!goal.startsWith(RUBRIC_GOAL_HEAD)) return goal;
  const line = goal.split('\n').find((l) => l.startsWith(CONFIRMED_GOAL_PREFIX));
  const sentence = line ? line.slice(CONFIRMED_GOAL_PREFIX.length).trim() : '';
  return sentence || null;
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
export const PART_CLASSES = Object.freeze(['countable', 'fact', 'judged', 'guard', 'none']);
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
  // PART 1b: put on every prose step by CODE (`withFactBindings`) when an earlier line is a fact step — every number in the text
  // must be in a checked quote of those lines. The model never writes it; bareguard's `numbersInQuote` reads it (gradeStep).
  numbersFromFacts: Object.freeze(['from']),
});
/** every field a part may carry, whatever its class */
const PART_FIELDS = Object.freeze(['text', 'class', 'check', 'value', 'names', 'wordsPerSection', 'source', 'domains', 'covers', 'rules', 'from', 'record', 'facts', 'count', 'tested', 'sample']);

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
    if (Object.hasOwn(part, 'rules') && !(Array.isArray(part.rules) && part.rules.length > 0 && new Set(part.rules).size === part.rules.length
      && part.rules.every((/** @type {unknown} */ x) => Number.isInteger(x) && /** @type {number} */ (x) >= 1))) {
      red('invalid-value', `${w}.rules`, 'the numbers of the line\'s ~ rules this part carries out (distinct integers, 1 or more)');
    }
    if (part.class === 'fact') { factShapeReds(part, w, (c, path, d) => red(c, path, d)); return; }
    if (part.class === 'guard') {
      if (!nameList(part.domains)) red('invalid-value', `${w}.domains`, 'a non-empty array of web domains the rule is about');
      return;
    }
    if (part.class !== 'countable') return;
    if (!Object.hasOwn(COUNT_CHECKS, part.check)) { red('invalid-value', `${w}.check`, `one of ${Object.keys(COUNT_CHECKS).join(' | ')}`); return; }
    for (const f of COUNT_CHECKS[part.check]) {
      const ok = f === 'value' || f === 'wordsPerSection' ? Number.isInteger(part[f]) && part[f] >= 1
        : f === 'names' ? nameList(part.names)
          : f === 'from' ? Array.isArray(part.from) && part.from.length > 0 && new Set(part.from).size === part.from.length && part.from.every((/** @type {unknown} */ x) => Number.isInteger(x) && /** @type {number} */ (x) >= 1)
            : nonEmpty(part.source) && part.source.length <= 128;
      if (!ok) {
        red('invalid-value', `${w}.${f}`, f === 'names' ? 'a non-empty array of section names'
          : f === 'source' ? 'the label of the input a quote must come from'
            : f === 'from' ? 'the numbers of the earlier fact lines whose checked quotes the text\'s numbers come from (distinct integers, 1 or more)'
              : 'an integer, 1 or more');
      }
    }
  });
  return reds;
}

/** the labels of the inputs a step's `cited` parts name (each once, in order) @param {any} params @returns {string[]} */
export function citedLabels(params) {
  const parts = Array.isArray(params?.parts) ? params.parts : [];
  return [...new Set(parts.filter((/** @type {any} */ x) => isRec(x) && ((x.class === 'countable' && x.check === 'cited') || x.class === 'fact')).map((/** @type {any} */ x) => String(x.source)))];
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
  const checks = factPartOf(params) ? [] : [{ id: 'text-present', rule: 'nonEmpty', field: 'text' }];
  params.parts.forEach((part, i) => {
    if (part.class === 'fact') {
      // ONE bareguard `cited` check per fact part: the quote is in the frozen input, every value is in the quote and meets its rule
      checks.push({ id: `p${i + 1}-facts`, rule: 'cited', claims: `cites:${part.source}`, source: part.source, decides: factDecides(part) });
      if (part.count?.min !== undefined) checks.push({ id: `p${i + 1}-count-min`, rule: 'min', field: `claims:${part.source}`, value: part.count.min });
      if (part.count?.max !== undefined) checks.push({ id: `p${i + 1}-count-max`, rule: 'max', field: `claims:${part.source}`, value: part.count.max });
      return;
    }
    if (part.class !== 'countable') return;
    const id = `p${i + 1}-${part.check}`;
    switch (part.check) {
      case 'maxWords': case 'minWords': case 'maxLines': checks.push({ id, rule: part.check, field: 'text', value: part.value }); break;
      case 'sections': checks.push({ id, rule: 'sections', field: 'text', names: [...part.names] }); break;
      case 'sectionWords': checks.push({ id, rule: 'sectionWords', field: 'text', names: [...part.names], wordsPerSection: part.wordsPerSection }); break;
      case 'cited': checks.push({ id, rule: 'cited', claims: `cites:${part.source}`, source: part.source }); break;
      case 'minClaims': checks.push({ id, rule: 'min', field: `claims:${part.source}`, value: part.value }); break;
      case 'maxClaims': checks.push({ id, rule: 'max', field: `claims:${part.source}`, value: part.value }); break;
      case 'numbersFromFacts': break; // read in gradeStep from the earlier lines' step files (bareguard's numbersInQuote), not a rubric rule
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
 * The files one named check READS, tree-relative: a `rubric-step` stage's own step file (`output/steps/N.json`). Any other kind reads
 * none that a try's output can be told by, so `[]`. From the signed declaration, never guessed.
 * @param {any} closeDecl @param {string|null|undefined} checkName
 * @returns {string[]}
 */
export function judgedFilesOf(closeDecl, checkName) {
  const stages = Array.isArray(closeDecl?.stages) ? closeDecl.stages : [];
  const st = stages.find((/** @type {any} */ x) => x && x.name === checkName && x.kind === 'rubric-step');
  return st && Number.isInteger(st.params?.step) ? [stepFileRel(st.params.step)] : [];
}

/**
 * PRD v1.106 Part 5: what each file a try's `check-passes` checks read looked like WHEN it was judged: `{path, bytes, sha256}`. The step
 * file is overwritten by the next try, so the spine's `output-judged` record is the only trace; the content itself is never written (hard
 * line). A missing, non-regular or over-size file is skipped — nothing was judged there.
 * @param {any} closeDecl @param {string} workdir @param {Array<{type?: string, name?: string}>} exits a step's declared exits
 * @returns {Promise<Array<{path: string, bytes: number, sha256: string}>>}
 */
export async function outputJudgedRecords(closeDecl, workdir, exits) {
  /** @type {Array<{path: string, bytes: number, sha256: string}>} */
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(exits) ? exits : []) {
    if (!e || e.type !== 'check-passes') continue;
    for (const rel of judgedFilesOf(closeDecl, e.name)) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      try {
        const abs = join(workdir, rel);
        const ls = await lstat(abs);
        if (!ls.isFile() || ls.size > STEP_MAX_BYTES) continue;
        const buf = await readFile(abs);
        out.push({ path: rel, bytes: buf.length, sha256: sha256Of(buf) });
      } catch { /* not there: nothing was judged */ }
    }
  }
  return out;
}

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
 * @param {any} [factPart] the step's `fact` part: its `results` become claims (text built by code) under `cites:<source>`
 * @returns {Record<string, any>}
 */
export function flattenStep(obj, countLabels = [], factPart = null) {
  /** @type {Record<string, any>} */
  const fields = {};
  // the number of claims listed under each label a claim-count check names (0 when the label is absent): counted HERE, by
  // code, from the file's own list — the worker never writes a number the check trusts
  for (const label of countLabels) {
    const list = isRec(obj.cites) && Object.hasOwn(obj.cites, label) ? obj.cites[label] : null;
    fields[`claims:${label}`] = Array.isArray(list) ? list.length : 0;
  }
  if (factPart) {
    const claims = factClaims(factPart, obj.results);
    fields[`claims:${factPart.source}`] = claims.length;
    fields[`cites:${factPart.source}`] = claims;
  }
  // a missing or non-string `text` is read as empty, so the one red a worker sees is "text is missing or empty"
  fields.text = typeof obj.text === 'string' ? obj.text : '';
  if (isRec(obj.cites) && !factPart) for (const [label, list] of Object.entries(obj.cites)) fields[`cites:${label}`] = list;
  return fields;
}

/**
 * One bareguard gap as a sentence the worker can act on. The numbers and names are bareguard's own measurements and the
 * person's signed limits, never anything this module infers; a gap this table does not know falls back to bareguard's own
 * rendering, so nothing is ever dropped.
 * @param {number} step @param {string} why why there was no object, when there was none
 * @param {any} g a bareguard gap
 * @param {any} [params] the stage's parameters (a fact step words its gaps by fact)
 * @returns {string}
 */
export function plainStepGap(step, why, g, params = null) {
  const file = stepFileRel(step);
  const at = `line ${step}`;
  const fact = params ? factPartOf(params) : null;
  if (fact && g.check === 'cited') {
    if (g.kind === 'missing' || g.kind === 'no-claims') return `${at}: ${file} has no results — add one result per thing you found: {"quote": ..., "values": {...}}`;
    if (g.kind === 'unsupported') return (g.items ?? []).map((/** @type {string} */ it) => `${at}: ${plainFactItem(it, fact)}`).join('\n');
    if (g.kind === 'too-many') return `${at}: the results hold too many different quotes to check (${g.measured} against a limit of ${g.limit})`;
    return `${at}: the results cannot be checked (${g.kind})`;
  }
  if (fact && (g.check === 'min' || g.check === 'max') && String(g.field ?? '').startsWith('claims:')) {
    return g.check === 'min' ? `${at}: ${g.measured ?? 0} result(s) are listed, at least ${g.limit} are required` : `${at}: ${g.measured} results are listed, at most ${g.limit} are allowed`;
  }
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
 * @param {{params: {step: number, parts: any[]}, bytes: string|null, outputBytes: string|null, inputs: Record<string, string>,
 *   factQuotes?: Record<number, string[]>, factMissing?: number[]}} o
 *   `factQuotes` maps an earlier fact line's number to the quotes its (already checked) step file holds — what a prose step's numbers are tied to
 *   `factMissing` lists the earlier fact lines whose step file is not there (yet): a normal red, never an instrument fault
 *   `inputs` maps each cited label to its frozen TEXT; its sha256 is taken here from that text, and bareguard compares it to
 *   the manifest's recorded sha via `inputShas`.
 * @param {Record<string, string>} inputShas the manifest's recorded sha256 per cited label
 * @returns {Promise<{verdict: 'green'|'red'|'stopped', gapLines: string[], fault: string|null, detail: Record<string, any>}>}
 */
export async function gradeStep({ params, bytes, outputBytes, inputs, factQuotes = {}, factMissing = [] }, inputShas) {
  let rubric;
  try { rubric = createRubric(buildStepSpec(params, inputShas)); } catch (e) {
    return { verdict: 'stopped', gapLines: [], fault: `the rubric for job line ${params.step} could not be built: ${/** @type {Error} */ (e).message}`, detail: {} };
  }
  const parsed = parseStepFile(bytes);
  const countLabels = [...new Set(params.parts.filter((/** @type {any} */ x) => x.class === 'countable' && (x.check === 'minClaims' || x.check === 'maxClaims')).map((/** @type {any} */ x) => String(x.source)))];
  const r = await checkStep(rubric, String(params.step), parsed.obj === null ? null : flattenStep(parsed.obj, countLabels, factPartOf(params)), {
    inputs, ...(outputBytes === null ? {} : { outputBytes }),
  });
  // PART 1b: a prose step's numbers are tied to the checked facts of earlier lines (bareguard's `numbersInQuote`: token match on the
  // numbers, not a canonical compare — a documented limit). Words are free; a number that no checked quote holds is a red.
  /** @type {string[]} */
  const extra = [];
  let extraCount = 0;
  const tie = params.parts.find((/** @type {any} */ x) => isRec(x) && x.class === 'countable' && x.check === 'numbersFromFacts');
  if (tie) {
    for (const n of factMissing) {
      extraCount += 1;
      extra.push(`line ${n}'s answer is not there yet (${stepFileRel(n)}), so the numbers in line ${params.step}'s text cannot be tied to it`);
    }
  }
  if (tie && parsed.obj !== null && typeof parsed.obj.text === 'string') {
    const quotes = tie.from.flatMap((/** @type {number} */ n) => factQuotes[n] ?? []);
    const t = numbersInQuote(parsed.obj.text, quotes.join('\n'));
    if (!t.ok) {
      extraCount = t.missing.length || 1;
      extra.push(`line ${params.step}: "text" has number(s) ${t.missing.join(', ')} that no checked quote of line ${tie.from.join(', ')} holds — use only numbers from those quotes, written as they write them`);
    }
  }
  // the stage's ONE trend number for the fix-loop governor (F192 e, mirrored): failing CLAIMS under a `cited` check (bareguard's
  // own `measured` count of unsupported quotes), plus 1 for every other failing check — lower is better, compared to the
  // best so far through the same `closeGrade` {stage, value} path numeric stages use
  const redCount = extraCount + r.full.gaps.reduce((/** @type {number} */ n, /** @type {any} */ g) => n + (g.check === 'cited' && g.kind === 'unsupported' && typeof g.measured === 'number' ? g.measured : 1), 0);
  const detail = { step: params.step, rubricSha: r.rubricSha, outputSha: r.outputSha, why: parsed.why, gaps: r.full.gaps.length, ...(r.verdict === 'red' || extra.length > 0 ? { redCount } : {}) };
  if (r.verdict === 'stopped') return { verdict: 'stopped', gapLines: [], fault: r.fault ? `${r.fault.kind}: ${r.fault.detail}` : 'the rubric stopped', detail };
  if (r.verdict === 'green' && extra.length === 0) return { verdict: 'green', gapLines: [], fault: null, detail };
  return { verdict: 'red', gapLines: [...extra, ...r.gaps.flatMap((g) => plainStepGap(params.step, parsed.why ?? 'empty', g, params).split('\n'))], fault: null, detail };
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
  /** the stage index of each fact line (PART 1b: a prose step ties its numbers to fact lines that are checked BEFORE it) @type {Map<number, number>} */
  const factAt = new Map();
  stages.forEach((st, i) => {
    if (isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Number.isInteger(st.params.step) && factPartOf(st.params)) factAt.set(st.params.step, i);
  });
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
    const factLine = p.parts.some((/** @type {any} */ x) => isRec(x) && x.class === 'fact');
    if (!factLine) {
      const wantFrom = [...factAt].filter(([, idx]) => idx < i).map(([n]) => n);
      const tied = p.parts.find((/** @type {any} */ x) => isRec(x) && x.class === 'countable' && x.check === 'numbersFromFacts');
      if (wantFrom.length > 0 && !(tied && Array.isArray(tied.from) && wantFrom.every((n) => tied.from.includes(n)))) {
        red('rubric-numbers-unbound', `${at}.params.parts`, `line ${line}: this text step comes after the fact line(s) ${wantFrom.join(', ')}, so every number in its text must be tied to their checked quotes. Nothing spent.`, { line: step, stage: label });
      }
    }
    p.parts.forEach((/** @type {any} */ part, /** @type {number} */ j) => {
      if (!isRec(part)) return;
      const w = `${at}.params.parts[${j}]`;
      const said = sayText(part.text ?? '');
      if (part.class === 'none') {
        red('rubric-part-unsortable', w, `line ${line}: '${said}' can't be counted or checked against a quote. Say it as a count (words, sections, rows) or as something a quote must show.` + (factLine ? ' This line lists facts: a limit you can say as a time, number, date or money fact goes INSIDE its fact part (add the fact, list the rule\'s number in that part\'s "rules"); anything else goes in "refused", never a part of its own.' : ''), { line: step, stage: label });
      } else if (part.class === 'judged') {
        red('rubric-part-judged', w, `line ${line}: this rule needs the judge, which arrives in the next build. Nothing spent.` + (factLine ? ' This line lists facts: a limit you can say as a time, number, date or money fact goes INSIDE its fact part (add the fact, list the rule\'s number in that part\'s "rules"); anything else goes in "refused", never a part of its own.' : ''), { line: step, stage: label });
      } else if (part.class === 'guard') {
        red('rubric-part-guard', w, `line ${line}: '${said}' is about web sources, and this job has no web input. Nothing spent.`, { line: step, stage: label });
      } else if (part.class === 'fact') {
        if (Array.isArray(inputLabels) && !inputLabels.includes(part.source)) {
          red('rubric-part-source', `${w}.source`, `line ${line}: '${said}' asks for quotes from "${sayText(part.source ?? '')}", but the job's inputs are ${inputLabels.map((l) => `"${l}"`).join(', ')}.`, { line: step, stage: label });
        }
        if (p.parts.filter((/** @type {any} */ x) => isRec(x) && x.class === 'fact').length > 1) {
          red('rubric-fact-twice', w, `line ${line}: '${said}' is a second fact list on the same line. One line has one list of facts; put them all in one. Nothing spent.`, { line: step, stage: label });
        }
      } else if (part.class === 'countable') {
        if (part.check === 'numbersFromFacts') {
          const bad = Array.isArray(part.from) ? part.from.filter((/** @type {number} */ n) => !(factAt.has(n) && /** @type {number} */ (factAt.get(n)) < i)) : [];
          if (factLine || bad.length > 0) {
            red('rubric-numbers-source', `${w}.from`, `line ${line}: the numbers in the text are tied to line(s) ${bad.length ? bad.join(', ') : part.from}, which are not fact lines checked before this one. Nothing spent.`, { line: step, stage: label });
          }
          return;
        }
        if (factLine) {
          red('rubric-fact-text', w, `line ${line}: '${said}' counts or quotes free text, but this line lists facts and has no text. Say it as a fact (a shape and a rule) or remove it. Nothing spent.`, { line: step, stage: label });
          return;
        }
        if (part.check === 'cited' && Array.isArray(inputLabels) && !inputLabels.includes(part.source)) {
          red('rubric-part-source', `${w}.source`, `line ${line}: '${said}' asks for a quote from "${sayText(part.source ?? '')}", but the job's inputs are ${inputLabels.map((l) => `"${l}"`).join(', ')}.`, { line: step, stage: label });
        }
        const range = wordRange(part);
        if (range) ranges.push({ part, range });
      }
    });
    if (factLine && rubricStepShapeReds(p, at).length === 0) {
      // bareguard is the judge of whether a fact list is SIGNABLE (anchors, units, bounds): ask it at drafting, at $0, so a list
      // it would refuse at run time is a red the drafter can fix now
      try { createRubric(buildStepSpec(/** @type {{step: number, parts: any[]}} */ (p), Object.fromEntries(citedLabels(p).map((l) => [l, '0'.repeat(64)])))); } catch (e) {
        red('rubric-fact-invalid', `${at}.params.parts`, `line ${line}: the facts cannot be signed: ${/** @type {Error} */ (e).message}`, { line: step, stage: label });
      }
    }
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

/** the ~ rules of one job line, one string each (`rules` when the line has the array, else the joined `rule` split on "; ") @param {any} l @returns {string[]} */
export function lineRules(l) {
  if (isRec(l) && Array.isArray(l.rules)) return l.rules.filter((/** @type {unknown} */ r) => typeof r === 'string' && r);
  return isRec(l) && typeof l.rule === 'string' && l.rule ? l.rule.split('; ').filter(Boolean) : [];
}

/** @param {unknown} b @returns {string[]} the spellings a rule bound can have in the person's own words */
const boundSpellings = (b) => {
  const s = String(b);
  return [s, s.replace(/^0+(?=\d)/, ''), s.replace(/\.0+$/, '')];
};

/**
 * Is this rule bound in the words the person wrote? The ONE test for "a number the AI made" (`rubric-fact-unmarked`, the L3 settle, and
 * the early ask of PRD v1.107 Part 5b all read it; never a second spelling).
 * @param {unknown} b @param {string} said @returns {boolean}
 */
export const boundInWords = (b, said) => boundSpellings(b).some((sp) => said.includes(sp));

/** @param {any} jl one job line @returns {string} the words the person wrote on it: the line and its `~` rules */
export const wordsSaidOn = (jl) => `${jl.text ?? ''} ${lineRules(jl).join(' ')}`;

/**
 * PART 1b, RF16 + RF17 — the rules that need the person's own job lines. Only a close built for REQUIRED FACTS is held to them (a
 * close with a fact part, or any part that says which `~` rules it carries out): an older Part 1a close is left as it was signed.
 *   - every `~` rule of every job line is carried out by a part (its number in the part's `rules`), or is listed in `refused` with
 *     its `rule` number, or its whole line is refused: a rule that is none of those was silently dropped, and that is a red;
 *   - a number the AI made out of the person's words (a bound the person did not write) must be marked `aiProposal`, and a time
 *     limit the AI proposes must be a range (`between`), never one-sided — "not a red-eye" must not let a 10 PM flight through.
 * @param {any[]} stages @param {{jobLines?: any[]|null, refused?: any, red: (code: string, path: string, detail: string, extra?: object) => void}} o
 */
export function checkRubricRules(stages, { jobLines = null, refused = null, red }) {
  const rubric = stages.map((st, i) => ({ st, i })).filter(({ st }) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts));
  const anyTag = rubric.some(({ st }) => st.params.parts.some((/** @type {any} */ x) => isRec(x) && (x.class === 'fact' || Object.hasOwn(x, 'rules'))));
  if (!anyTag || !Array.isArray(jobLines)) return;
  const refusedList = Array.isArray(refused) ? refused.filter(isRec) : [];
  for (const l of jobLines) {
    if (!isRec(l) || !Number.isInteger(l.n)) continue;
    const rules = lineRules(l);
    const wholeLine = refusedList.some((r) => r.line === l.n && !Object.hasOwn(r, 'rule'));
    const carried = new Set(rubric.filter(({ st }) => st.params.step === l.n).flatMap(({ st }) => st.params.parts.flatMap((/** @type {any} */ x) => (isRec(x) && Array.isArray(x.rules) ? x.rules : []))));
    rules.forEach((text, k) => {
      const n = k + 1;
      if (wholeLine || carried.has(n) || refusedList.some((r) => r.line === l.n && r.rule === n)) return;
      red('rubric-rule-dropped', `jobLines[${l.n - 1}].rules[${k}]`, `line ${l.n}: your rule "${sayText(text)}" is neither checked nor listed under Not checked. Make it a check (list ${n} in the part's "rules") or list it in "refused" as {"line": ${l.n}, "rule": ${n}, "reason": "..."}. Nothing spent.`, { line: l.n, rule: n });
    });
  }
  for (const { st, i } of rubric) {
    const fp = factPartOf(st.params);
    if (!fp || !Array.isArray(fp.facts)) continue;
    const jl = jobLines.find((l) => isRec(l) && l.n === st.params.step);
    const said = jl ? wordsSaidOn(jl) : null;
    fp.facts.forEach((/** @type {any} */ f, /** @type {number} */ j) => {
      if (!isRec(f) || !isRec(f.rule)) return;
      const w = `stages[${i}].params.parts[${st.params.parts.indexOf(fp)}].facts[${j}]`;
      const bounds = f.rule.op === 'between' ? [f.rule.lo, f.rule.hi] : [f.rule.value];
      if (said !== null && !f.aiProposal && bounds.some((b) => !boundInWords(b, said))) {
        red('rubric-fact-unmarked', w, `line ${st.params.step}: the limit on fact "${f.name}" (${bounds.join(' to ')}) is not in the words the person wrote, so it is the AI's own number. Set "aiProposal": true on that fact so the card says "AI's proposal — check it". Nothing spent.`, { line: st.params.step });
      }
      if (f.aiProposal && f.shape === 'time' && f.rule.op !== 'between') {
        red('rubric-fact-onesided', w, `line ${st.params.step}: fact "${f.name}" is a time limit the AI made up, and a one-sided limit lets the other end through (a 10 PM flight passes "not a red-eye"). Use a range: "op": "between" with "lo" and "hi". Nothing spent.`, { line: st.params.step });
      }
    });
  }
}

/** a clock time as a person writes it: 7:00, 07:00, 7:00 AM, 11 PM is not matched (no minutes) */
const CLOCK = '\\d{1,2}:\\d{2}(?:\\s?[AaPp][Mm])?';
const TIME_RANGE_RE = new RegExp(`\\b(?:between|from)\\s+(${CLOCK})\\s+(?:and|to|-)\\s+(${CLOCK})`, 'i');
const NEGATING_RE = /\b(?:not|no|never|outside|except|before|after|without)\b/i;

/**
 * PART 1c L3 - the person's own words win over the AI's reading of them, settled by CODE before anything is validated or signed:
 *   - a limit on a fact whose bounds are all in the words the person wrote (the line, its `~` rules, an answer they gave) is the
 *     person's, so it is NOT marked "AI's proposal" (smv710w8c3wdh: the plan called the person's own range the AI's);
 *   - a time range the AI proposed while the person wrote ONE explicit positive time range ("between 07:00 and 23:00") on that line
 *     is replaced by exactly that range (smv710w8c3wdh: the plan said 5:00 AM). Only when it is unambiguous: one such range in the
 *     line's rules and one AI-proposed `between` time fact on the line; a rule with a negation ("not between ...") is never read as a range;
 *   - a `~` rule is a check or under Not checked, never both: a `refused` entry for a rule that a part of its own line carries is dropped.
 * Pure; returns a new declaration, the input untouched. The model is told the same in the brief; this makes it true either way.
 * @param {any} declaration @param {any[]|null|undefined} jobLines @returns {any}
 */
export function settlePersonsWords(declaration, jobLines) {
  if (!isRec(declaration) || !Array.isArray(declaration.stages) || !Array.isArray(jobLines)) return declaration;
  const stages = declaration.stages.map((/** @type {any} */ st) => {
    if (!(isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts))) return st;
    const fp = factPartOf(st.params);
    const jl = jobLines.find((l) => isRec(l) && l.n === st.params.step);
    if (!fp || !Array.isArray(fp.facts) || !jl) return st;
    const rules = lineRules(jl);
    const said = wordsSaidOn(jl);
    const ranges = rules.filter((r) => !NEGATING_RE.test(r)).map((r) => TIME_RANGE_RE.exec(r)).filter((m) => m !== null);
    const proposed = fp.facts.filter((/** @type {any} */ f) => isRec(f) && f.aiProposal === true && f.shape === 'time' && isRec(f.rule) && f.rule.op === 'between');
    const facts = fp.facts.map((/** @type {any} */ f) => {
      if (!isRec(f) || !isRec(f.rule) || f.aiProposal !== true) return f;
      const own = (/** @type {unknown[]} */ bounds) => bounds.every((b) => boundInWords(b, said));
      const bounds = f.rule.op === 'between' ? [f.rule.lo, f.rule.hi] : [f.rule.value];
      const { aiProposal: _drop, ...rest } = f;
      if (own(bounds)) return rest;
      if (ranges.length === 1 && proposed.length === 1 && proposed[0] === f) {
        const m = /** @type {RegExpExecArray} */ (ranges[0]);
        return { ...rest, rule: { op: 'between', lo: m[1], hi: m[2] } };
      }
      return f;
    });
    const parts = st.params.parts.map((/** @type {any} */ x) => (x === fp ? { ...x, facts } : x));
    return { ...st, params: { ...st.params, parts } };
  });
  const carried = (/** @type {number} */ line, /** @type {number} */ n) => stages.some((/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && st.params.step === line
    && Array.isArray(st.params.parts) && st.params.parts.some((/** @type {any} */ x) => isRec(x) && Array.isArray(x.rules) && x.rules.includes(n)));
  /** @type {any} */
  const out = { ...declaration, stages };
  if (Array.isArray(declaration.refused)) out.refused = declaration.refused.filter((/** @type {any} */ r) => !(isRec(r) && Number.isInteger(r.line) && Number.isInteger(r.rule) && carried(r.line, r.rule)));
  return out;
}

/**
 * PART 1b — put the number tie on every prose step. A rubric-step stage with no fact part that comes AFTER one or more fact
 * stages gets exactly one `numbersFromFacts` part naming those lines; one the model wrote is replaced. Pure; returns a new
 * declaration (the input is untouched). The model never writes this part: it is code's, so a draft cannot omit it.
 * @param {any} declaration @returns {any}
 */
export function withFactBindings(declaration) {
  if (!isRec(declaration) || !Array.isArray(declaration.stages)) return declaration;
  /** @type {number[]} */
  const seen = [];
  const stages = declaration.stages.map((/** @type {any} */ st) => {
    if (!(isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts))) return st;
    if (factPartOf(st.params)) { if (Number.isInteger(st.params.step)) seen.push(st.params.step); return st; }
    const rest = st.params.parts.filter((/** @type {any} */ x) => !(isRec(x) && x.class === 'countable' && x.check === 'numbersFromFacts'));
    if (seen.length === 0) return rest.length === st.params.parts.length ? st : { ...st, params: { ...st.params, parts: rest } };
    const from = [...seen];
    return { ...st, params: { ...st.params, parts: [...rest, { text: `every number in the text is in a quote checked on line ${from.join(', ')}`, class: 'countable', check: 'numbersFromFacts', from }] } };
  });
  return { ...declaration, stages };
}

/**
 * NO SILENT DROP (idea A core, spec 4.4): code writes the Not checked rows for what the page rules removed, before the declaration is validated.
 *   - a dropped FACT that carries a `~` rule no part carries and no `refused` entry names -> `closeDecl.refused` gets {line, rule, reason}
 *     (shown under that line in the person's own rule words by {@link ruleNotChecked});
 *   - any other drop (a fact from the job line itself, a rule another fact carries, a word dropped from a fact that is still checked, so a
 *     narrower check is still said) -> one line in `closeDecl.notes`, shown as Not checked (the AI's own reading).
 * Never a line-level `refused` entry without `rule` (that would silence every other rule red on the line). A rule the drafter already listed
 * itself is never listed twice, and running this twice adds nothing. Pure; the input is untouched.
 * @param {any} declaration @param {import('./pagerules.js').Dropped[]|null|undefined} dropped @param {any[]|null|undefined} jobLines @returns {any}
 */
export function withDropNotes(declaration, dropped, jobLines) {
  if (!isRec(declaration) || !Array.isArray(dropped) || dropped.length === 0) return declaration;
  const stages = Array.isArray(declaration.stages) ? declaration.stages : [];
  const carried = (/** @type {number} */ line, /** @type {number} */ n) => stages.some((/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && st.params.step === line
    && Array.isArray(st.params.parts) && st.params.parts.some((/** @type {any} */ x) => isRec(x) && Array.isArray(x.rules) && x.rules.includes(n)));
  const refused = Array.isArray(declaration.refused) ? [...declaration.refused] : [];
  const notes = Array.isArray(declaration.notes) ? [...declaration.notes] : [];
  for (const row of dropRows(dropped)) {
    const named = row.rule !== undefined && refused.some((/** @type {any} */ r) => isRec(r) && r.line === row.line && r.rule === row.rule);
    if (named) continue;
    if (row.full && row.rule !== undefined && !carried(row.line, row.rule)) {
      refused.push({ line: row.line, rule: row.rule, reason: row.sentences.join(' ') });
      continue;
    }
    const text = dropLine(row, jobLines, lineRules);
    if (!notes.includes(text)) notes.push(text);
  }
  return { ...declaration, ...(refused.length ? { refused } : {}), ...(notes.length ? { notes } : {}) };
}

/**
 * The ~ rules the drafter listed under Not checked (`refused` entries that name a `rule`), each as one line in the person's own
 * words: `line N: "<the rule as written>" — <the drafter's reason>` (PART 1b, RF6 / RF16).
 * @param {any} closeDecl @param {any[]|null|undefined} jobLines @returns {string[]}
 */
export function ruleNotChecked(closeDecl, jobLines) {
  const refused = isRec(closeDecl) && Array.isArray(closeDecl.refused) ? closeDecl.refused : [];
  return refused.filter((/** @type {any} */ r) => isRec(r) && Number.isInteger(r.line) && Number.isInteger(r.rule) && typeof r.reason === 'string').map((/** @type {any} */ r) => {
    const text = lineRules((jobLines ?? []).find((/** @type {any} */ l) => isRec(l) && l.n === r.line))[r.rule - 1];
    return `line ${r.line}: ${text ? `"${text}"` : `rule ${r.rule}`} — ${r.reason}`;
  });
}

/**
 * The Not-checked lines code owns for the rubric-step stages of a close: a prose step's CONTENT is judged by the person at
 * Accept, and the card says so (PART 1b, RF5). One line per prose step (a stage with no fact part).
 * @param {any} closeDecl @returns {string[]}
 */
export function proseNotChecked(closeDecl) {
  return proseNotCheckedItems(closeDecl).map((i) => i.text);
}

/** the same items as {@link proseNotChecked} with the job line each belongs to (the stage's own `step`) @param {any} closeDecl @returns {{line: number, text: string}[]} */
export function proseNotCheckedItems(closeDecl) {
  const stages = isRec(closeDecl) && Array.isArray(closeDecl.stages) ? closeDecl.stages : [];
  return stages.filter((/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts) && !factPartOf(st.params))
    .map((/** @type {any} */ st) => ({ line: st.params.step, text: `line ${st.params.step}: what the text says — you judge it at Accept` }));
}

// ── the sign-vs-run invariant: the checks the person is SHOWN are the checks the signed close RUNS ───────────────────

/**
 * One countable part as a plain sentence, written by code from the part's signed fields (never from the model's words), so the
 * plan card and the close are one thing seen twice.
 * @param {any} part @returns {string}
 */
export function partSentence(part) {
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.map((x) => String(x)).join(', ') : '');
  const n = (/** @type {unknown} */ v, /** @type {string} */ unit) => `${v} ${unit}${v === 1 ? '' : 's'}`;
  switch (part.check) {
    case 'maxWords': return `the text is at most ${n(part.value, 'word')}`;
    case 'minWords': return `the text is at least ${n(part.value, 'word')}`;
    case 'maxLines': return `the text is at most ${n(part.value, 'line')}`;
    case 'sections': return `the text has the section(s): ${list(part.names)}`;
    case 'sectionWords': return `each section (${list(part.names)}) is about ${part.wordsPerSection} words`;
    case 'cited': return `every claim is backed by a quote copied from "${part.source}"`;
    case 'minClaims': return `at least ${part.value} claim(s) are listed under "${part.source}"`;
    case 'maxClaims': return `at most ${part.value} claim(s) are listed under "${part.source}"`;
    case 'numbersFromFacts': return `every number in the text is in a quote checked on line ${list(part.from)}`;
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
    ? st.params.parts.filter((/** @type {any} */ p) => isRec(p) && (p.class === 'countable' || p.class === 'fact')).flatMap((/** @type {any} */ p) => {
      const covers = Array.isArray(p.covers) ? p.covers.filter(Number.isInteger) : [];
      // a fact part is one plan row per fact (and one for its count): the person signs the rows, the close runs the same list
      return (p.class === 'fact' ? factRows(p) : [partSentence(p)]).map((/** @type {string} */ text) => ({ line: st.params.step, text, covers }));
    })
    : []));
}

/**
 * Reconcile the CONFIRMED plan with the close the composer actually wrote. The plan card after drafting shows exactly
 * the close's own checks (`checksOfClose`); every confirmed check that no part carries out (no part lists its number in
 * `covers`) is moved to Not checked, in the person's words, with the reason. A check can therefore never be shown and then
 * silently dropped (run mv5bk400: "lists 3 releases" was confirmed, then left out of the signed close without a word).
 * @param {{confirmed: {text: string, fromLine: number[]|null}[], notChecked: string[], closeDecl: any, jobLines?: any[]|null}} o
 *   `jobLines` — the person's numbered lines, so a ~ rule the drafter listed as Not checked reads in the person's own words
 * @returns {{checkItems: {text: string, fromLine: number[]}[], notChecked: string[], moved: {text: string, fromLine: number[]|null}[]}}
 */
export function reconcileRubricPlan({ confirmed, notChecked, closeDecl, jobLines = null }) {
  const real = checksOfClose(closeDecl);
  const covered = new Set(real.flatMap((c) => c.covers));
  const moved = confirmed.filter((_, i) => !covered.has(i + 1));
  return {
    checkItems: real.map((c) => ({ text: c.text, fromLine: [c.line] })),
    notChecked: [
      ...notChecked,
      ...proseNotChecked(closeDecl),
      ...ruleNotChecked(closeDecl, jobLines),
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

/**
 * The frozen TEXT of the named inputs, read the way the runner reads them: the source door's record (`source.json`, one level
 * above the tree) names each input's file and sha256, and a file whose bytes no longer match is not returned. Used at DRAFTING
 * (the drafter reads the input, the early tests run on it) and at run start (the backstop). Never throws.
 * @param {string} workdir the frozen tree @param {string[]} labels
 * @returns {Promise<{ok: true, texts: Record<string, string>}|{ok: false, why: string}>}
 */
export async function readFrozenInputs(workdir, labels) {
  /** @type {any} */
  let manifest;
  try { manifest = JSON.parse(await readFile(join(dirname(workdir), 'source.json'), 'utf8')); } catch (e) {
    return { ok: false, why: `the source record could not be read: ${/** @type {Error} */ (e).message}` };
  }
  const recorded = Array.isArray(manifest?.inputs) ? manifest.inputs : [];
  /** @type {Record<string, string>} */
  const texts = {};
  for (const label of labels) {
    const row = recorded.find((/** @type {any} */ r) => r && r.label === label);
    if (!row || typeof row.rel !== 'string' || typeof row.sha256 !== 'string') return { ok: false, why: `the source record has no input labelled "${label}"` };
    let buf;
    try { buf = await readFile(join(workdir, row.rel)); } catch (e) { return { ok: false, why: `input "${label}" could not be read: ${/** @type {Error} */ (e).message}` }; }
    if (sha256Of(buf) !== row.sha256) return { ok: false, why: `input "${label}" no longer matches the bytes frozen at the source door` };
    texts[label] = buf.toString('utf8');
  }
  return { ok: true, texts };
}
