// PART 1b item 5 — the DRAFTER's side: no silently dropped rule (RF16), the AI's own numbers marked and a time range a range
// (RF17), and the early tests wired into the drafting loop (authorClose, RF13–RF15). Real data: this repo's CHANGELOG.md frozen by
// the real source door; a scripted model boundary that can only DELIVER a declaration.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRubricRules, lineRules } from '../src/rubricstep.js';
import { validateDeclaration, RUBRIC_LANG, classGuards, catalogueForLang, KIND_CATALOGUE } from '../src/authoring.js';
import { sampleOf } from '../src/facts.js';
import { readFileSync } from 'node:fs';
import { authorClose, DECLARATION_TOOL_NAME, GREEN_QUESTIONS, declarationSchema, REQUIRED_FACTS_BRIEF, authorPrompt } from '../src/authorflow.js';
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
const factPart = (facts, over = {}) => ({ text: 'find a flight', class: 'fact', source: 'Flights', record: { start: 'Departure' }, facts, ...over });
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
  assert.deepEqual(Object.keys(parts.facts.items.properties).sort(), ['aiProposal', 'anchor', 'currency', 'name', 'phrase', 'rule', 'shape', 'unit', 'until']);
  assert.ok(parts.record && parts.count && parts.rules);
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

test('authorClose: a fact list with a word the input does not hold is refused at $0 and the drafter is told; the corrected try validates with its `tested` evidence filled in by code', async () => {
  const { prep, file } = await freeze();
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  const good = {
    text: 'list the last 3 releases', class: 'fact', source: 'Changelog', record: { start: '## [', end: '\n' }, rules: [1],
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
  assert.match(second, /'Release number:' is not in the input "Changelog"/);
  assert.match(second, /Nothing was signed/);
  const part = r.declaration.stages[1].params.parts[0];
  assert.equal(part.tested.facts[0].name, 'version');
  assert.equal(part.tested.facts[0].found, part.tested.records);
  assert.match(part.tested.facts[1].caught, /^5\/5$/);
  assert.equal(part.sample, sampleOf(readFileSync(join(HERE, '..', 'CHANGELOG.md'), 'utf8')).note, 'the real changelog is cut for the drafter, and the cut is said on the card');
});
