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
import { authorClose, GREEN_QUESTIONS, declarationSchema } from '../src/authorflow.js';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL, ROW_EDIT_SYSTEM, ROW_EDIT_REVISE } from '../src/rowedit.js';
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

test('the declaration schema (the gate\'s own shape) can say a fact part; the drafter\'s row-edit prompt says the four edits, one legal example each (the count is an add), no goal, no copy of the list', () => {
  const schema = declarationSchema(KIND_CATALOGUE, { verdictType: 'soft-green', kinds: Object.keys(catalogueForLang(RUBRIC_LANG)) });
  const parts = schema.properties.stages.items.oneOf.find((b) => b.title === 'rubric-step').properties.params.properties.parts.items.properties;
  assert.ok(parts.class.enum.includes('fact'));
  assert.deepEqual(Object.keys(parts.facts.items.properties).sort(), ['aiProposal', 'anchor', 'currency', 'decimal', 'lang', 'name', 'phrase', 'rule', 'shape', 'unit', 'until']);
  assert.ok(parts.count && parts.rules);
  assert.equal(parts.record, undefined, 'no record cutting (Part 1c)');
  assert.deepEqual(Object.keys(schema.properties.refused.items.properties), ['line', 'rule', 'reason']);
  // (the old REQUIRED FACTS brief that told the drafter how to write a part is deleted with the AI-written parts; the row-edit prompt replaces it, ruling 5 of 2026-11-12)
  assert.match(ROW_EDIT_SYSTEM, /the op is exactly one of: add, reading, pick, not-checkable/);
  assert.match(ROW_EDIT_SYSTEM, /A count is an add with "kind":"count"; "count" is never an op/);
  for (const ex of ['{"op":"add","kind":"fact"', '{"op":"add","kind":"phrase"', '{"op":"add","kind":"count"', '{"op":"reading"', '{"op":"pick"', '{"op":"not-checkable"']) assert.ok(ROW_EDIT_SYSTEM.includes(ex), ex);
  assert.match(ROW_EDIT_SYSTEM, /never invent a word the input holds nowhere/);
  assert.match(ROW_EDIT_SYSTEM, /never add a code \(like SFO\) that the person did not write/);
  assert.doesNotMatch(ROW_EDIT_SYSTEM, /"goal"|THE LIST OF CHECKS|the list of checks:/, 'ruling 5: the confirm turn owns the goal; invariant 5: no text restates the list');
  // a limit the person wrote is a rule that can be checked; a number the AI makes is its proposal and a time limit it proposes is a range (this was RUBRIC_RULES, now said on the reading edit)
  assert.match(ROW_EDIT_SYSTEM, /A limit the person WROTE \("under \$450"\) is a rule that can be checked/);
  assert.match(ROW_EDIT_SYSTEM, /a time limit that you propose is a RANGE \(between\), never one-sided/);
});

async function freeze() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { file, prep: r.prep };
}

test('authorClose: an edit that names words the input does not hold is refused ALONE at $0 and the drafter is told the words and the input; the corrected try validates and settles', async () => {
  const { prep, file } = await freeze();
  /** @type {any[]} */
  const seen = [];
  let calls = 0;
  const generate = async (messages, tools) => {
    seen.push(messages);
    calls += 1;
    await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: calls === 1
      ? [{ op: 'add', kind: 'phrase', line: 1, name: 'release number', source: 'Changelog', words: ['Release number:'] }, { op: 'add', kind: 'count', line: 1, min: 2, max: 2 }]
      : [] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const jobLines = [{ n: 1, text: 'List the last 3 releases', rule: 'released on or after 2026-10-01', rules: ['released on or after 2026-10-01'] }];
  const look = { facts: [{ line: 1, name: 'version', shape: 'phrase', source: 'Changelog', words: ['## ['] }], dropped: [], prose: [], notFound: [] };
  const block = new CheckBlock({ texts: { Changelog: readFileSync(file, 'utf8') }, labels: ['Changelog'], asks: false });
  block.fromJob(jobLines);
  block.addLook(look.facts, look.dropped);
  block.reconcile();
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List the last 3 releases' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines, inputs: [{ n: 1, label: 'Changelog', value: file }], block,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.iterations[0].edits.filter((e) => !e.accepted).length, 1, 'one edit refused, the other kept');
  assert.equal(r.iterations[1].edits.length, 0);
  const second = seen[1].map((m) => m.content).join('\n');
  assert.match(second, /edit add: the words "Release number:" are not in the input/);
  assert.ok(second.endsWith(ROW_EDIT_REVISE));
  const part = r.declaration.stages[1].params.parts[0];
  assert.deepEqual(Object.keys(part).sort(), ['class', 'count', 'facts', 'source', 'text'], 'nothing is added to the part by code beyond the rows: no record, no test evidence, no sample');
  // (count 2: the version heading words are in this input only twice, and the draft gate's M1 rule refuses a count above the words' own count: see the build status note)
  assert.deepEqual(part.count, { min: 2, max: 2 });
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
});

test('L4 cause 2: a ~ rule is never a part of its own (the AI writes no parts); the real flights shape builds ONE fact part carrying rules 1 and 2, a red-eye rule read as a time `between` is marked AI\'s proposal, and the nonstop rule is Not checked in code\'s plain words', async () => {
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: 'https://www.google.com/travel/flights?q=sfo-lax' }], into: join(tmp(), 'seed'), fetchUrl: async (url) => ({ ok: true, text: readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8'), url }) });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const prep = proved.prep;
  const page = readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8');
  // the real look of that session, as the look's own facts: the price tied to rule 1, the departure window tied to rule 2 (an AI proposal: 07:00 and 23:00 are not in the person's words)
  const look = { facts: [
    { line: 1, name: 'Origin', shape: 'phrase', source: 'Flights', words: ['Leaves San Francisco International Airport'] },
    { line: 1, name: 'Destination', shape: 'phrase', source: 'Flights', words: ['arrives at Los Angeles International Airport'] },
    { line: 1, name: 'Price', shape: 'money', source: 'Flights', words: ['generic'], unit: ['US dollars'], forRule: 1, reading: { op: 'lt', value: 450 } },
    { line: 1, name: 'Departure time', shape: 'time', source: 'Flights', words: ['Departure time:'], forRule: 2, reading: { op: 'between', lo: '07:00', hi: '23:00' } },
  ], dropped: [], prose: [], notFound: [] };
  const block = new CheckBlock({ texts: { Flights: page }, labels: ['Flights'], asks: false });
  block.fromJob([FLIGHTS_LINE]);
  block.addLook(look.facts, look.dropped);
  block.reconcile();
  const generate = async (/** @type {any} */ _m, /** @type {any} */ tools) => {
    await tools.find((/** @type {any} */ t) => t.name === ROW_EDIT_TOOL).execute({ edits: [{ op: 'not-checkable', line: 1, rule: 3, reason: 'nonstop: the page holds no stop count I can quote' }] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List 3 flights from San Francisco to Los Angeles' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [FLIGHTS_LINE], inputs: [{ n: 1, label: 'Flights', value: 'https://www.google.com/travel/flights?q=sfo-lax' }], block,
  });
  assert.equal(r.iterations[0].validation.ok, true, 'the declaration code built passes its own gate at the first try');
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const parts = r.declaration.stages[1].params.parts;
  const timeFact = parts[0].facts.find((/** @type {any} */ f) => f.shape === 'time');
  assert.equal(timeFact.rule.op, 'between');
  assert.equal(timeFact.aiProposal, true);
  assert.equal(parts.filter((/** @type {any} */ p) => p.class === 'fact').length, 1, 'one fact part: a rule is not a part of its own');
  assert.deepEqual(parts[0].rules, [1, 2]);
  assert.ok(!parts.some((/** @type {any} */ p) => p.class === 'judged' || p.class === 'none'));
  const nonstop = block.rows.find((x) => x.kind === 'rule' && x.rule === 3);
  assert.equal(nonstop?.state, 'not-checked');
  // by design (src/checkblock.js matchRule): on a plain rule with nobody to ask the reason is code's; the AI's own words show only on a typed rule, a tied rule with no limit, or an out-of-scope count rule
  assert.match(String(nonstop?.reason), /judge it at Accept/);
  assert.equal(block.deltaLog.at(-1).edits[0].accepted, true, 'the not-checkable edit itself was judged and kept');
});
