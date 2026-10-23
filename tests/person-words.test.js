// PART 1c live fix L3 - the plan card keeps the person's words (panel session smv710w8c3wdh). The shapes below are the real refused/drafted
// declarations of that session (an AI window "5:00 AM - 11:59 PM" marked AI's proposal while the person had answered "between 07:00 and
// 23:00"; "not a red-eye" both carried by the fact part and listed under refused). A scripted model can only DELIVER a declaration.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settlePersonsWords, checkRubricRules, reconcileRubricPlan } from '../src/rubricstep.js';
import { verifyLookReport, lookPrompt, renderLookReport } from '../src/inputlook.js';
import { scanLabels, labelOnList } from '../src/labelscan.js';
import { authorClose, DECLARATION_TOOL_NAME, GREEN_QUESTIONS } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'person-words-')); made.push(d); return d; };

const RULES = ['under $450', 'not between 00:00 and 06:00', 'between 07:00 and 23:00'];
const LINE = { n: 1, text: 'List 3 flights from San Francisco to Los Angeles', rule: RULES.join('; '), rules: RULES };
const price = { name: 'Price', shape: 'money', anchor: 'generic', unit: 'US dollars', rule: { op: 'lt', value: 450 } };
const window = (rule, extra = {}) => ({ name: 'Departure time', shape: 'time', anchor: 'Departure time:', rule, ...extra });
const decl = (facts, { rules = [1, 2, 3], refused = [] } = {}) => ({
  stages: [{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'list 3 flights', class: 'fact', source: 'Flights', rules, covers: [1], facts, count: { min: 3, max: 3 } }] } }],
  refused,
});
const timeFact = (d) => d.stages[0].params.parts[0].facts.find((f) => f.shape === 'time');

test('L3: the person answered "between 07:00 and 23:00" - the check uses exactly that range, not the AI\'s 5:00 AM, and is NOT marked AI\'s proposal', () => {
  const asDrafted = decl([price, window({ op: 'between', lo: '5:00 AM', hi: '11:59 PM' }, { aiProposal: true })]);
  const settled = settlePersonsWords(asDrafted, [LINE]);
  assert.deepEqual(timeFact(settled).rule, { op: 'between', lo: '07:00', hi: '23:00' });
  assert.equal(Object.hasOwn(timeFact(settled), 'aiProposal'), false);
  assert.equal(timeFact(asDrafted).rule.lo, '5:00 AM', 'the input declaration is untouched');
  // the person's range, already used by the AI, is simply unmarked (their number is not the AI's)
  const used = settlePersonsWords(decl([price, window({ op: 'between', lo: '07:00', hi: '23:00' }, { aiProposal: true })]), [LINE]);
  assert.equal(Object.hasOwn(timeFact(used), 'aiProposal'), false);
  // and the plan row the person reads says the range and no "AI's proposal" mark
  const rows = reconcileRubricPlan({ confirmed: [], notChecked: [], closeDecl: settled, jobLines: [LINE] }).checkItems.map((c) => c.text).join('\n');
  assert.match(rows, /Departure time/);
  assert.doesNotMatch(rows, /AI's proposal/);
  assert.doesNotMatch(rows, /5:00 AM/);
});

test('L3: a negated rule ("not between 00:00 and 06:00") is never read as the person\'s range; with no positive range the AI\'s own window stays marked AI\'s proposal', () => {
  const line = { ...LINE, rule: RULES.slice(0, 2).join('; '), rules: RULES.slice(0, 2) };
  const settled = settlePersonsWords(decl([price, window({ op: 'between', lo: '06:00', hi: '23:59' }, { aiProposal: true })]), [line]);
  assert.equal(timeFact(settled).aiProposal, true);
  assert.deepEqual(timeFact(settled).rule, { op: 'between', lo: '06:00', hi: '23:59' });
  // two AI time windows on one line = ambiguous: nothing is replaced
  const two = settlePersonsWords(decl([price, window({ op: 'between', lo: '5:00 AM', hi: '11:59 PM' }, { aiProposal: true }), { ...window({ op: 'between', lo: '6:00 AM', hi: '9:00 PM' }, { aiProposal: true }), name: 'Arrival time', anchor: 'Arrival time:' }]), [LINE]);
  assert.equal(two.stages[0].params.parts[0].facts[1].rule.lo, '5:00 AM');
  // the existing red still stands for an unmarked AI number
  const reds = [];
  checkRubricRules(settlePersonsWords(decl([price, window({ op: 'between', lo: '06:30', hi: '22:00' })]), [line]).stages, { jobLines: [line], refused: [], red: (code) => reds.push(code) });
  assert.deepEqual(reds, ['rubric-fact-unmarked']);
});

test('L3: a ~ rule is a check or under Not checked, never both - a refusal of a rule a part of its line carries is dropped; a refusal of an uncarried rule stays', () => {
  const both = decl([price, window({ op: 'between', lo: '07:00', hi: '23:00' })], { rules: [1, 2, 3], refused: [{ line: 1, rule: 2, reason: 'a red-eye cannot be told' }, { line: 1, reason: 'which flights' }] });
  const settled = settlePersonsWords(both, [LINE]);
  assert.deepEqual(settled.refused, [{ line: 1, reason: 'which flights' }], 'the whole-line note is kept; the carried rule is not also refused');
  const partial = settlePersonsWords(decl([price], { rules: [1], refused: [{ line: 1, rule: 2, reason: 'x' }] }), [LINE]);
  assert.equal(partial.refused.length, 1, 'an uncarried rule stays under Not checked');
  const notChecked = reconcileRubricPlan({ confirmed: [], notChecked: [], closeDecl: settled, jobLines: [LINE] }).notChecked.join('\n');
  assert.doesNotMatch(notChecked, /not between 00:00/);
});

test('L3 through the drafting loop: the real drafted shape (AI window + the same rule refused) is signed as the person\'s range with the rule only a check', async () => {
  const URL1 = 'https://www.google.com/travel/flights?q=sfo-lax';
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into: join(tmp(), 'seed'), fetchUrl: async (url) => ({ ok: true, text: readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8'), url }) });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const prep = proved.prep;
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  const drafted = decl([
    { name: 'Origin', shape: 'phrase', phrase: 'Leaves San Francisco International Airport' },
    { name: 'Price', shape: 'money', anchor: 'generic', unit: 'US dollars', rule: { op: 'lt', value: 450 } },
    window({ op: 'between', lo: '5:00 AM', hi: '11:59 PM' }, { aiProposal: true }),
  ], { rules: [1, 2, 3], refused: [{ line: 1, rule: 2, reason: 'not a red-eye: the 5:00 AM window stands in for it' }] });
  const generate = async (_m, tools) => {
    await tools.find((t) => t.name === DECLARATION_TOOL_NAME).execute({ stages: [guard, ...drafted.stages], refused: drafted.refused });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List 3 flights' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [LINE], inputs: [{ n: 1, label: 'Flights', value: URL1 }],
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const t = timeFact({ stages: [r.declaration.stages[1]] });
  assert.deepEqual(t.rule, { op: 'between', lo: '07:00', hi: '23:00' });
  assert.equal(Object.hasOwn(t, 'aiProposal'), false);
  assert.equal((r.declaration.refused ?? []).some((x) => x.rule === 2), false);
});

test('L3: a rule the AI can turn into a number from its own knowledge ("not a red-eye") is carried by a look fact (forRule) with aiProposal and is NOT asked; one it cannot know still is', () => {
  const text = readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8');
  const scans = { Flights: scanLabels(text) };
  const line = { n: 1, text: 'List 3 flights', rule: 'not a red-eye; one per week', rules: ['not a red-eye', 'one per week'] };
  const label = 'Departure time:';
  assert.ok(labelOnList(scans.Flights, 'time', label), 'the label is on the real page\'s list for time');
  const raw = {
    facts: [{ line: 1, name: 'Departure window', shape: 'time', source: 'Flights', label, example: '9:27 AM', rule: { op: 'between', lo: '07:00', hi: '23:00' }, aiProposal: true, forRule: 1 }],
    prose: [],
    notFound: [{ line: 1, rule: 1, words: 'not a red-eye', why: 'no such word' }, { line: 1, rule: 2, words: 'one per week', why: 'no weekly grouping' }],
  };
  const rep = verifyLookReport(raw, { scans, jobLines: [line] });
  assert.equal(rep.facts.length, 1, JSON.stringify(rep));
  assert.equal(rep.facts[0].forRule, 1);
  assert.deepEqual(rep.notFound.map((n) => n.rule), [2], 'rule 1 is checked, so it is not also not-found');
  assert.match(renderLookReport(rep), /carries ~ rule 1/);
  const prompt = lookPrompt({ jobLines: [line], labels: ['Flights'], lists: { Flights: 'LIST' } });
  assert.match(prompt, /is NOT something to ask the person about and NOT "notFound"/);
  assert.match(prompt, /forRule/);
});
