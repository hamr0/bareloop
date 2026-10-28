// PART 1b item 5 — the DRAFTER's side: no silently dropped rule (RF16), the AI's own numbers marked and a time range a range
// (RF17), and the early tests wired into the drafting loop (authorClose, RF13–RF15). Real data: this repo's CHANGELOG.md frozen by
// the real source door; a scripted model boundary that can only DELIVER a declaration.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRubricRules, lineRules, rubricStepShapeReds } from '../src/rubricstep.js';
import { parseJobBlock } from '../src/jobblock.js';
import { validateDeclaration, RUBRIC_LANG, classGuards, catalogueForLang, KIND_CATALOGUE } from '../src/authoring.js';
import { authorClose, DECLARATION_TOOL_NAME, GREEN_QUESTIONS, declarationSchema, REQUIRED_FACTS_BRIEF, RUBRIC_RULES, authorPrompt } from '../src/authorflow.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-rules-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

const FLIGHT_LINE = { n: 1, text: 'Find a flight SFO to LAX', rule: 'under $450; not a red-eye; nonstop', rules: ['under $450', 'not a red-eye', 'nonstop'] };
const fact = (name, shape, extra = {}) => ({ name, shape, ...extra });
const stage = (parts, step = 1) => ({ name: `line-${step}`, kind: 'rubric-step', fromLine: [step], params: { step, parts } });
const factPart = (facts, over = {}) => ({ text: 'find a flight', class: 'fact', source: 'Flights', facts, ...over });
const run = (stages, o) => {
  /** @type {string[]} */
  const out = [];
  checkRubricRules(stages, { red: (code) => out.push(code), ...o });
  return out;
};

test('lineRules reads the line\'s ~ rules, from the array or the joined text', () => {
  assert.deepEqual(lineRules(FLIGHT_LINE), ['under $450', 'not a red-eye', 'nonstop']);
  assert.deepEqual(lineRules({ n: 1, text: 'x', rule: 'a; b' }), ['a', 'b']);
  assert.deepEqual(lineRules({ n: 1, text: 'x', rule: '' }), []);
});

test('RF16: a ~ rule that no part carries out and no refusal lists is a $0 red naming the line and the rule; carried, refused, or the whole line refused all pass', () => {
  const price = fact('price', 'money', { unit: 'US dollars', rule: { op: 'lt', value: 450 } });
  const parts = (rules) => [factPart([price], { rules })];
  assert.deepEqual(run([stage(parts([1]))], { jobLines: [FLIGHT_LINE], refused: [{ line: 1, rule: 2, reason: 'a red-eye cannot be told' }, { line: 1, rule: 3, reason: 'nonstop' }] }), []);
  assert.deepEqual(run([stage(parts([1]))], { jobLines: [FLIGHT_LINE], refused: [] }), ['rubric-rule-dropped', 'rubric-rule-dropped']);
  assert.deepEqual(run([stage(parts([1]))], { jobLines: [FLIGHT_LINE], refused: [{ line: 1, rule: 2, reason: 'x' }] }), ['rubric-rule-dropped']);
  assert.deepEqual(run([stage(parts([1, 2, 3]))], { jobLines: [FLIGHT_LINE], refused: [] }), []);
  assert.deepEqual(run([stage(parts([1]))], { jobLines: [FLIGHT_LINE], refused: [{ line: 1, reason: 'cannot be checked at all' }] }), [], 'a whole-line refusal covers its rules');
  const dropped = [];
  checkRubricRules([stage(parts([1]))], { jobLines: [FLIGHT_LINE], refused: [], red: (code, path, detail) => dropped.push({ code, path, detail }) });
  assert.match(dropped[0].detail, /^line 1: your rule "not a red-eye" is neither checked nor listed under Not checked\./);
  assert.match(dropped[0].detail, /\{"line": 1, "rule": 2, "reason": "\.\.\."\}/);
});

test('a Part 1a close (no fact part, no rules tags) is held to nothing new: what was signed stays valid', () => {
  const old = stage([{ text: 'under 50 words', class: 'countable', check: 'maxWords', value: 50 }]);
  assert.deepEqual(run([old], { jobLines: [FLIGHT_LINE], refused: [] }), []);
  assert.deepEqual(run([old], { jobLines: null, refused: null }), []);
});

test('RF17: a limit the person did not write must be marked "AI\'s proposal"; one they wrote needs no mark; an AI time limit is a range, never one-sided', () => {
  const line = { ...FLIGHT_LINE, rules: ['under $450', 'not a red-eye departing 6am to 9pm'], rule: 'under $450; not a red-eye departing 6am to 9pm' };
  const price = fact('price', 'money', { unit: 'US dollars', rule: { op: 'lt', value: 450 } });
  const departs = (extra) => fact('departs', 'time', { anchor: 'Departure', ...extra });
  const go = (f2) => run([stage([factPart([price, f2], { rules: [1, 2] })])], { jobLines: [line], refused: [] });
  assert.deepEqual(go(departs({ rule: { op: 'between', lo: '06:00', hi: '21:00' } })), ['rubric-fact-unmarked'], '06:00 and 21:00 are not in the person\'s words');
  assert.deepEqual(go(departs({ rule: { op: 'between', lo: '06:00', hi: '21:00' }, aiProposal: true })), []);
  assert.deepEqual(go(departs({ rule: { op: 'gte', value: '06:00' }, aiProposal: true })), ['rubric-fact-onesided']);
  // the person's own number (450) is not an AI proposal; a leading zero or a decimal tail is the same number
  assert.deepEqual(run([stage([factPart([price], { rules: [1, 2] })])], { jobLines: [line], refused: [] }), []);
  assert.deepEqual(run([stage([factPart([fact('price', 'money', { unit: 'US dollars', rule: { op: 'lt', value: 450.0 } })], { rules: [1, 2] })])], { jobLines: [line], refused: [] }), []);
});

test('validateDeclaration runs the rule checks and accepts "refused" with a rule number; a bad rule number is a shape red', () => {
  const guard = classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, allowPrefixes: ['output/'] } }));
  const price = fact('price', 'money', { unit: 'US dollars', rule: { op: 'lt', value: 450 } });
  const decl = (refused) => ({ stages: [...guard, stage([factPart([price], { rules: [1] })])], refused });
  const opts = { catalogue: catalogueForLang(RUBRIC_LANG), guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }), verdictType: 'soft-green', writeScope: ['output/'], jobLines: [FLIGHT_LINE], inputLabels: ['Flights'] };
  const dropped = validateDeclaration(decl([]), opts);
  assert.ok(dropped.reds.some((r) => r.code === 'rubric-rule-dropped'));
  const ok = validateDeclaration(decl([{ line: 1, rule: 2, reason: 'a red-eye cannot be told' }, { line: 1, rule: 3, reason: 'nonstop cannot be told' }]), opts);
  assert.equal(ok.reds.some((r) => r.code === 'rubric-rule-dropped'), false, JSON.stringify(ok.reds));
  const bad = validateDeclaration(decl([{ line: 1, rule: 0, reason: 'x' }]), opts);
  assert.ok(bad.reds.some((r) => r.path === 'refused[0]'));
});

test('the declaration schema the model fills can say a fact part; the composer prompt carries the REQUIRED FACTS brief', () => {
  const schema = declarationSchema(KIND_CATALOGUE, { verdictType: 'soft-green', kinds: Object.keys(catalogueForLang(RUBRIC_LANG)) });
  const parts = schema.properties.stages.items.oneOf.find((b) => b.title === 'rubric-step').properties.params.properties.parts.items.properties;
  assert.ok(parts.class.enum.includes('fact'));
  assert.deepEqual(Object.keys(parts.facts.items.properties).sort(), ['aiProposal', 'anchor', 'currency', 'decimal', 'lang', 'name', 'phrase', 'rule', 'shape', 'unit', 'until']);
  assert.ok(parts.count && parts.rules);
  assert.equal(parts.record, undefined, 'no record cutting (Part 1c)');
  assert.deepEqual(Object.keys(schema.properties.refused.items.properties), ['line', 'rule', 'reason']);
  const prompt = authorPrompt({
    answers: { 1: 'x' }, questions: { 1: GREEN_QUESTIONS[1] }, facts: { rubricFiles: true }, listingBlock: '', lang: RUBRIC_LANG,
    verdictType: 'soft-green', guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }), catalogue: catalogueForLang(RUBRIC_LANG),
  });
  assert.ok(prompt.includes(REQUIRED_FACTS_BRIEF));
  assert.match(REQUIRED_FACTS_BRIEF, /"SFO to LAX" is a from fact and a to fact/);
  assert.match(REQUIRED_FACTS_BRIEF, /never invent a word the input does not hold/);
});

async function freeze() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { file, prep: r.prep };
}

test('authorClose: a label that is not on the input\'s list is refused at $0 and the drafter is told the word and the input; the corrected try (a label picked from the list, no record marker) validates as drafted', async () => {
  const { prep, file } = await freeze();
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  const good = {
    text: 'list the last 3 releases', class: 'fact', source: 'Changelog', rules: [1],
    facts: [{ name: 'version', shape: 'text', anchor: '## [', until: ']' }, { name: 'released', shape: 'date', rule: { op: 'gte', value: '2026-10-01' } }],
    count: { min: 3, max: 3 },
  };
  const bad = { ...good, facts: [{ name: 'version', shape: 'text', anchor: 'Release number:', until: ']' }, good.facts[1]] };
  /** @type {any[]} */
  const seen = [];
  let calls = 0;
  const generate = async (messages, tools) => {
    seen.push(messages);
    calls += 1;
    await tools.find((t) => t.name === DECLARATION_TOOL_NAME).execute({ stages: [guard, stage([calls === 1 ? bad : good])] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const jobLines = [{ n: 1, text: 'List the last 3 releases', rule: 'released on or after 2026-10-01', rules: ['released on or after 2026-10-01'] }];
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List the last 3 releases' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines, inputs: [{ n: 1, label: 'Changelog', value: file }],
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.iterations[0].validation.ok, false, 'the first try was refused, at $0');
  assert.equal(r.iterations[1].validation.ok, true, 'the corrected second try was accepted');
  assert.equal(r.iterations[0].seedRead, null, 'and the refused try was never run');
  const second = seen[1].map((m) => m.content).join('\n');
  assert.match(second, /the label "Release number:" is not one of the labels the input "Changelog" holds before a text value/);
  assert.match(second, /Nothing was signed/);
  assert.match(seen[0].map((m) => m.content).join('\n'), /LABELS IN THE INPUT "Changelog" - pick a label ONLY from this list/, 'the drafter is shown the list it must pick from');
  const part = r.declaration.stages[1].params.parts[0];
  assert.deepEqual(Object.keys(part).sort(), ['class', 'count', 'facts', 'rules', 'source', 'text'], 'nothing is added to the part by code: no record, no test evidence, no sample');
});

// A ~ rule is carried only by a part on ITS OWN step: a part on another step never covers it.
const TWO_LINE_JOB = 'Find the last 3 releases\nSummarize them\n~ under 80 words\n~ one paragraph';
const twoLines = () => {
  const p = parseJobBlock(TWO_LINE_JOB);
  assert.ok(p.ok, 'the two-line job parses');
  return p.lines;
};
const textPart = (rules) => ({ text: 'summarize', class: 'countable', check: 'wordCount', rules });
const redsOf = (stages, o) => {
  /** @type {{code: string, line: number, rule: number}[]} */
  const out = [];
  checkRubricRules(stages, { red: (code, _p, _d, extra) => out.push({ code, ...extra }), ...o });
  return out;
};

test('RF16: a part on step 1 listing rules [1,2] does not cover line 2\'s ~ rules: two reds naming line 2', () => {
  const reds = redsOf([stage([textPart([1, 2])], 1)], { jobLines: twoLines(), refused: [] });
  assert.deepEqual(reds, [{ code: 'rubric-rule-dropped', line: 2, rule: 1 }, { code: 'rubric-rule-dropped', line: 2, rule: 2 }]);
});

test('RF16: a part on step 2 listing rules [1,2] covers line 2\'s ~ rules: no rubric-rule-dropped', () => {
  const reds = redsOf([stage([textPart([1, 2])], 2)], { jobLines: twoLines(), refused: [] });
  assert.deepEqual(reds.filter((r) => r.code === 'rubric-rule-dropped'), []);
});

test('RF16: a refusal for line 1 rule 1 does not cover line 2\'s rule 1: the red for line 2 rule 1 remains', () => {
  const reds = redsOf([stage([textPart([2])], 2)], { jobLines: twoLines(), refused: [{ line: 1, rule: 1, reason: 'x' }] });
  assert.deepEqual(reds, [{ code: 'rubric-rule-dropped', line: 2, rule: 1 }]);
});

// ── L4 (live fix, panel session smv710w8c3wdh, 3 of 3 tries refused on form) ────────────────────────────────────────────────
// The shapes below are the REAL refused declarations from that session's draft-log (parts and facts as the drafter wrote them): try A
// put "covers" on every fact; try B sent "not a red-eye" / "nonstop" as judged parts beside the fact part; try C a "none" part. The
// page is the real 8,801-character fetch of the same session. A scripted model can only DELIVER a declaration.
const FLIGHTS_LINE = { n: 1, text: 'List 3 flights from San Francisco to Los Angeles', rule: 'under $450; not a red-eye; nonstop', rules: ['under $450', 'not a red-eye', 'nonstop'] };
const REAL_FACTS = [
  { name: 'Origin', shape: 'phrase', phrase: 'Leaves San Francisco International Airport' },
  { name: 'Destination', shape: 'phrase', phrase: 'arrives at Los Angeles International Airport' },
  { name: 'Price', shape: 'money', anchor: 'generic', unit: 'US dollars', rule: { op: 'lt', value: 450 } },
  { name: 'Departure time', shape: 'time', anchor: 'Departure time:', rule: { op: 'between', lo: '07:00', hi: '23:00' }, aiProposal: true },
];

test('L4 cause 1: "covers" on a fact (try A of smv710w8c3wdh) is refused with the place it belongs; the same facts with "covers" once on the part validate', () => {
  const withCovers = REAL_FACTS.map((f, i) => ({ ...f, covers: [i + 1] }));
  const reds = [];
  checkRubricRules([stage([factPart(withCovers, { rules: [1, 2] })])], { jobLines: [FLIGHTS_LINE], refused: [{ line: 1, rule: 3, reason: 'nonstop' }], red: (code) => reds.push(code) });
  const shape = [];
  rubricStepShapeReds({ step: 1, parts: [factPart(withCovers, { rules: [1, 2] })] }, 'stages[1].params').forEach((r) => shape.push(r));
  assert.equal(shape.length, 4, 'one red per fact that carries covers');
  assert.match(shape[0].detail, /"covers" is a field of the PART, not of a fact - write the numbers once on the fact part/);
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [factPart(REAL_FACTS, { rules: [1, 2], covers: [1, 2, 3, 4] })] }, 'stages[1].params'), []);
  assert.match(REQUIRED_FACTS_BRIEF, /"covers" and "rules" are fields of the PART, written once on it as a list of numbers\. A fact never has a "covers" or a "rules" field\./);
});

test('L4 cause 2: a ~ rule beside the fact part as a judged / none part (tries 1 and 3 of smv710w8c3wdh) is refused AND told where it goes; a red-eye rule drafted as a time fact with `between`, marked AI\'s proposal, is accepted', async () => {
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: 'https://www.google.com/travel/flights?q=sfo-lax' }], into: join(tmp(), 'seed'), fetchUrl: async (url) => ({ ok: true, text: readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8'), url }) });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const prep = proved.prep;
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  // the REAL refused shape: the fact part holds the departure window, and "not a red-eye" is ALSO a part of its own
  const refusedShape = [factPart(REAL_FACTS, { rules: [1, 2], covers: [1, 2, 3, 4], source: 'Flights' }), { text: 'not a red-eye', class: 'judged', rules: [2] }];
  const fixed = [factPart(REAL_FACTS, { rules: [1, 2], covers: [1, 2, 3, 4], source: 'Flights' })];
  /** @type {any[]} */
  const seen = [];
  let calls = 0;
  const generate = async (/** @type {any} */ messages, /** @type {any} */ tools) => {
    seen.push(messages);
    calls += 1;
    await tools.find((/** @type {any} */ t) => t.name === DECLARATION_TOOL_NAME).execute({ stages: [guard, stage(calls === 1 ? refusedShape : fixed)], refused: [{ line: 1, rule: 3, reason: 'nonstop: the page holds no stop count I can quote' }] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List 3 flights from San Francisco to Los Angeles' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [FLIGHTS_LINE], inputs: [{ n: 1, label: 'Flights', value: 'https://www.google.com/travel/flights?q=sfo-lax' }],
  });
  assert.equal(r.iterations[0].validation.ok, false, 'the real refused shape is refused at $0');
  assert.ok(r.iterations[0].validation.reds.some((/** @type {any} */ x) => x.code === 'rubric-part-judged'));
  const second = seen[1].map((/** @type {any} */ m) => m.content).join('\n');
  assert.match(second, /a limit you can say as a time, number, date or money fact goes INSIDE its fact part/, 'the drafter is told where the rule goes');
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const timeFact = r.declaration.stages[1].params.parts[0].facts.find((/** @type {any} */ f) => f.shape === 'time');
  assert.equal(timeFact.rule.op, 'between');
  assert.equal(timeFact.aiProposal, true);
  assert.equal(r.declaration.stages[1].params.parts.length, 1, 'one part: the rule is not a part of its own');
  assert.match(REQUIRED_FACTS_BRIEF, /"not a red-eye" is a time fact with a between rule\) is carried by the fact part/);
  assert.match(RUBRIC_RULES, /holds no "red-eye"/);
});
