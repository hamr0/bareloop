// PART 1c live fix L3 - the plan card keeps the person's words (panel session smv710w8c3wdh). The shapes below are the real refused/drafted
// declarations of that session (an AI window "5:00 AM - 11:59 PM" marked AI's proposal while the person had answered "between 07:00 and
// 23:00"; "not a red-eye" both carried by the fact part and listed under refused). settlePersonsWords, which repaired an AI-written declaration, is deleted: on the check block the person's own words
// are read by code FIRST (readLimit, ruling A), the AI's reading edit only fills a rule code cannot read, and a rule is ONE row that is built or Not checked, never both.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardOfClose } from '../src/rubricstep.js';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { verifyLookReport, lookPrompt, renderLookReport } from '../src/inputlook.js';
import { scanLabels, labelOnList } from '../src/labelscan.js';
import { authorClose, GREEN_QUESTIONS } from '../src/authorflow.js';
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
const timeFact = (/** @type {any} */ d) => d.stages[0].params.parts[0].facts.find((/** @type {any} */ f) => f.shape === 'time');
const TEXT = readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8');
const LOOK = [
  { line: 1, name: 'Origin', shape: 'phrase', source: 'Flights', words: ['Leaves San Francisco International Airport'] },
  { line: 1, name: 'Price', shape: 'money', source: 'Flights', words: ['From'], unit: ['US dollars'], forRule: 1, reading: { op: 'lt', value: 450 } },
];
const departure = (/** @type {number} */ rule) => ({ line: 1, name: 'Departure time', shape: 'time', source: 'Flights', words: ['Departure time:'], forRule: rule });
/** @param {string[]} rules @param {any[]} facts @returns {{block: CheckBlock, close: any}} */
function build(rules, facts, edits = /** @type {any[]} */ ([])) {
  const block = new CheckBlock({ texts: { Flights: TEXT }, labels: ['Flights'], asks: false });
  block.fromJob([{ ...LINE, rules, rule: rules.join('; ') }]);
  block.addLook(facts, []);
  if (edits.length) block.applyDelta({ edits });
  return { block, close: block.reconcile() };
}
const cardOf = (/** @type {CheckBlock} */ block, /** @type {any} */ close, /** @type {any} */ line) => cardOfClose({ closeDecl: { genre: 'text', lang: 'text', stages: close.stages, list: block.signedRows(), refused: block.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => ({ line: r.line, rule: r.rule, reason: String(r.reason) })) }, jobLines: [line] });

test('L3: the person wrote "between 07:00 and 23:00" - the check uses exactly that range even when the AI\'s reading edit says 5:00 AM, and is NOT marked AI\'s proposal', () => {
  const aiEdit = { op: 'reading', line: 1, rules: [3], fact: 'Departure time', reading: { op: 'between', lo: '05:00', hi: '23:59' } };
  const { block, close } = build([RULES[2]], [...LOOK.slice(0, 1), departure(1)], [{ ...aiEdit, rules: [1] }]);
  const f = timeFact({ stages: [close.stages[0]] });
  assert.deepEqual(f.rule, { op: 'between', lo: '07:00', hi: '23:00' });
  assert.equal(Object.hasOwn(f, 'aiProposal'), false);
  assert.equal(block.rows.find((r) => r.kind === 'rule')?.can.readBy, 'your words');
  // and the plan row the person reads says the range and no "AI's proposal" mark
  const rows = cardOf(block, close, { ...LINE, rules: [RULES[2]] }).checkItems.map((c) => c.text).join('\n');
  assert.match(rows, /Departure time/);
  assert.doesNotMatch(rows, /AI's proposal/);
  assert.doesNotMatch(rows, /5:00/);
});

test('L3: a negated rule ("not between 00:00 and 06:00") is never read as the person\'s range; the AI\'s own window then stands, marked AI\'s proposal, for the person to check', () => {
  const { close } = build([RULES[1]], [departure(1)], [{ op: 'reading', line: 1, rules: [1], fact: 'Departure time', reading: { op: 'between', lo: '06:00', hi: '23:59' } }]);
  const f = timeFact({ stages: [close.stages[0]] });
  assert.equal(f.aiProposal, true);
  assert.deepEqual(f.rule, { op: 'between', lo: '06:00', hi: '23:59' });
  // an unmarked AI number cannot exist: the AI sends a reading, code marks it (the old rubric-fact-unmarked red is the second look and never fires on a block-built plan)
});

test('L3: a ~ rule is a check or under Not checked, never both - a built rule is not listed under Not checked; a rule no check carries is, once', () => {
  const { block, close } = build([RULES[0], 'one per week'], [LOOK[1], LOOK[0]]);
  const card = cardOf(block, close, { ...LINE, rules: [RULES[0], 'one per week'] });
  const notChecked = card.notChecked.join('\n');
  assert.equal(block.rows.find((r) => r.rule === 1)?.state, 'built');
  assert.doesNotMatch(notChecked, /under \$450/);
  assert.match(notChecked, /one per week/);
  assert.equal(block.rows.find((r) => r.rule === 2)?.state, 'not-checked');
  assert.equal((notChecked.match(/one per week/g) ?? []).length, 1);
});

test('L3 through the drafting loop: the real page, the person\'s range rule and the look\'s window: the window is signed as the person\'s range, the rule only a check (never also refused), no AI proposal mark', async () => {
  const URL1 = 'https://www.google.com/travel/flights?q=sfo-lax';
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into: join(tmp(), 'seed'), fetchUrl: async (url) => ({ ok: true, text: readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8'), url }) });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const prep = proved.prep;
  const line = { ...LINE, rules: [RULES[0], RULES[2]], rule: `${RULES[0]}; ${RULES[2]}` };
  const look = { facts: [LOOK[0], LOOK[1], departure(2)], dropped: [], prose: [], notFound: [] };
  const block = new CheckBlock({ texts: { Flights: TEXT }, labels: ['Flights'], asks: false });
  block.fromJob([line]);
  block.addLook(look.facts, look.dropped);
  block.reconcile();
  const generate = async (/** @type {any} */ _m, /** @type {any} */ tools) => {
    await tools.find((/** @type {any} */ t) => t.name === ROW_EDIT_TOOL).execute({ edits: [{ op: 'reading', line: 1, rules: [2], fact: 'Departure time', reading: { op: 'between', lo: '05:00', hi: '23:59' } }] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List 3 flights' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [line], inputs: [{ n: 1, label: 'Flights', value: URL1 }], block,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const t = timeFact({ stages: [r.declaration.stages[1]] });
  assert.deepEqual(t.rule, { op: 'between', lo: '07:00', hi: '23:00' });
  assert.equal(Object.hasOwn(t, 'aiProposal'), false);
  assert.equal((r.declaration.refused ?? []).some((/** @type {any} */ x) => x.rule === 2), false);
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
