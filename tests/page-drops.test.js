// IDEA A CORE item 8 (docs/product/ITEM33-BUILD.md "Addendum 2026-10-18 — Idea A core: build spec", sections 4.3-4.6, 7, 8 tests 3, 4, 6, 8): NO SILENT DROP.
// Every word, fact or `~` rule a page rule removes is shown as Not checked with a plain reason from ONE table (src/pagedropwords.js), and a
// dropped word cannot come back through the drafter. The real data: the BOS-ORD page and the five labels run mvdg1xo3 really signed (F237/F238,
// its resolved spec is a pinned fixture). The model is a scripted provider at the `provider.generate` seam; nothing is paid, nothing is stubbed
// below it: the REAL runPageMap, applyPageRules, checkDeclarationWords, checkRubricParts (real bareguard), planFromSpec and runConfirmTurn.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPageMap } from '../src/pagemap.js';
import { applyPageRules } from '../src/pagerules.js';
import { dropRows, dropLine, dropSentence } from '../src/pagedropwords.js';
import { ruleNotChecked, checkRubricRules, checkRubricParts, lineRules, readFrozenInputs } from '../src/rubricstep.js';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';
import { checkDeclarationWords } from '../src/factwords.js';
import { renderLookReport, lookFactOf } from '../src/inputlook.js';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';
import { runConfirmTurn, CONFIRM_TOOL_NAME, GREEN_QUESTIONS, FIELD_LABELS, makeCostBook, authorClose } from '../src/authorflow.js';
import { reply } from './helpers.js';
import { loadFixture } from './idea-a-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_FILE = join(HERE, 'fixtures', 'idea-a', 'mvdg1xo3.resolved-spec.json');
const spec = (() => {
  const buf = readFileSync(SPEC_FILE);
  assert.equal(createHash('sha256').update(buf).digest('hex'), '2310565260cd6be37942c32429e56b7c05e5ac24956164b4c957a6d275638b71', 'a fixture is never edited');
  return JSON.parse(buf.toString('utf8'));
})();
const bos = loadFixture('bos-ord');
const JOB = spec.jobLines;

/** the five labels run mvdg1xo3 signed (F237), as the AI's page-word map names them; the unit is what that run's price fact carried */
const FIVE = {
  facts: [
    { name: 'MaxPrice', from: 'line 1 rule 1', shape: 'money', words: ['From'], unit: ['US dollars'] },
    { name: 'DepartureWindow', from: 'line 1 rule 2', shape: 'time', words: ['Departure time:'] },
    { name: 'Stops', from: 'line 1 rule 3', shape: 'number', words: ['StaticText'] },
    { name: 'LeaveAirport', from: 'line 1', shape: 'phrase', words: ['Leaves'] },
    { name: 'ArriveAirport', from: 'line 1', shape: 'phrase', words: ['O'] },
  ],
};

/** the look report exactly as the drafting pipeline receives it: the rules over the AI's map (a `number` shape is read by the rules though the map form lists four) */
async function lookOf(/** @type {any} */ map, page = bos.page) {
  const kept = applyPageRules(page, map, JOB);
  return { facts: kept.facts.map((f) => lookFactOf(f, 'flights')), prose: [], notFound: [], dropped: kept.dropped.map((d) => ({ ...d, source: 'flights' })) };
}
const said = (/** @type {any[]} */ d) => d.map((x) => `${x.fact}|${x.word ?? '(fact)'}|${x.reason}`).sort();

test('run mvdg1xo3 (F237/F238): every label the rules remove has a dropped entry with a reason - "StaticText" reads no number either side, so the "Stops" fact and the "nonstop" rule are Not checked', async () => {
  const look = await lookOf(FIVE);
  const stops = look.dropped.filter((/** @type {any} */ d) => d.fact === 'Stops');
  assert.deepEqual(said(stops), ['Stops|(fact)|no-label', 'Stops|StaticText|no-value']);
  assert.equal(look.facts.some((/** @type {any} */ f) => f.name === 'Stops'), false, 'the junk fact is not offered to the drafter');
  assert.equal(stops[0].rule, 3, 'it is tied to rule 3, "nonstop"');
  // every label that is not in a kept fact appears in a dropped entry (no silent drop)
  const kept = new Set(look.facts.flatMap((/** @type {any} */ f) => [...f.words, ...(f.unit ?? []), ...(f.currency ?? [])]));
  const offered = FIVE.facts.flatMap((f) => [...f.words, ...(f.unit ?? []), ...(f.currency ?? [])]);
  for (const w of offered) assert.ok(kept.has(w) || look.dropped.some((/** @type {any} */ d) => d.word === w), `"${w}" vanished without a trace`);
});

test('block rows: the dropped rule becomes a Not checked ROW with the plain sentence from the one table, never silent and never a line-level refusal (the old withDropNotes is deleted; the same data)', async () => {
  const look = await lookOf(FIVE);
  const block = new CheckBlock({ texts: { flights: bos.page }, labels: ['flights'], asks: false });
  block.fromJob(JOB);
  block.addLook(look.facts, look.dropped);
  block.reconcile();
  const nonstop = block.rows.find((r) => r.kind === 'rule' && r.rule === 3);
  assert.equal(nonstop?.state, 'not-checked');
  assert.match(String(nonstop?.reason), /^The page never shows a number right after or right before "StaticText"\. No word on this page reads "Stops" safely\.$/);
  // the signed rows and the declaration's refusal carry it (a rule, not a line)
  assert.equal(block.signedRows().find((r) => r.key === nonstop?.key)?.reason, nonstop?.reason);
});

test('a dropped word cannot return through the drafter: the REAL checkDeclarationWords reds a signed label that the map dropped (rubric-fact-word-dropped), with the drop\'s reason', async () => {
  const look = await lookOf(FIVE);
  const decl = (/** @type {any[]} */ facts) => ({ stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'fact', source: 'flights', facts, count: { min: 3, max: 3 } }] } }] });
  const bad = checkDeclarationWords(decl([{ name: 'Stops', shape: 'number', anchor: 'StaticText', rule: { op: 'lte', value: 0 } }]), { flights: bos.page }, look);
  assert.deepEqual(bad.map((r) => r.code), ['rubric-fact-word-dropped']);
  assert.match(bad[0].detail, /the label "StaticText" cannot be used\. The page never shows a number right after or right before "StaticText"\./);
  // a unit and a currency the map dropped come back the same way; a kept one does not
  const price = (/** @type {any} */ over) => decl([{ name: 'p', shape: 'money', anchor: 'From', ...over }]);
  const lookP = await lookOf({ facts: [{ name: 'price', from: 'line 1 rule 1', shape: 'money', words: ['From'], unit: ['US dollars', 'zorkmids'], currency: ['$', '€'] }] });
  assert.deepEqual(checkDeclarationWords(price({ unit: ['US dollars'] }), { flights: bos.page }, lookP), []);
  assert.deepEqual(checkDeclarationWords(price({ unit: ['zorkmids'] }), { flights: bos.page }, lookP).map((r) => r.code), ['rubric-fact-word-dropped', 'rubric-fact-word-missing']);
  assert.deepEqual(checkDeclarationWords(price({ currency: ['€'] }), { flights: bos.page }, lookP).map((r) => r.code), ['rubric-fact-word-dropped', 'rubric-fact-word-missing']);
  // a label the map never offered at all is the existing off-list red, now against the KEPT labels
  const off = checkDeclarationWords(decl([{ name: 'p', shape: 'money', anchor: 'Fare', unit: 'US dollars' }]), { flights: bos.page }, lookP);
  assert.deepEqual(off.map((r) => r.code), ['rubric-fact-label-off-list']);
  assert.match(off[0].detail, /not one of the labels the page words for "flights" kept.*"From"/);
});

test('the kept label passes the real proof; a kept label that is a marker after a number ("total") needs no code-made list; without a map the old list proof still applies', async () => {
  const lisbon = loadFixture('airbnb-lisbon');
  const jobs = [{ n: 1, text: 'List 3 stays in Lisbon', rules: ['under €400 total'] }];
  const provider = { async generate() { return reply({ text: JSON.stringify({ facts: [{ name: 'total price', from: 'line 1 rule 1', shape: 'money', words: ['total'], unit: ['total'], currency: ['€'] }] }) }); } };
  const r = await runPageMap({ texts: { Page: lisbon.page }, inputs: [{ n: 1, label: 'Page' }], jobLines: jobs, provider });
  const fact = r.facts.look.facts[0];
  assert.deepEqual([fact.words, fact.unit, fact.currency], [[], ['total'], undefined]);
  const decl = { stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'fact', source: 'Page', facts: [{ name: 'total price', shape: 'money', unit: ['total'], rule: { op: 'lt', value: 400 } }], count: { min: 3, max: 3 } }] } }] };
  assert.deepEqual(checkDeclarationWords(decl, { Page: lisbon.page }, r.facts.look), []);
  // the same with the REAL bareguard signing the part (no stub): the list spec the map produced is signable
  /** @type {string[]} */
  const out = [];
  checkRubricParts([{ kind: 'rubric-step', name: 's', params: decl.stages[0].params, fromLine: [1] }], { inputLabels: ['Page'], red: (code) => out.push(code) });
  assert.deepEqual(out, []);
  // no map (null look): the label is proved against the list code made, as before
  const noMap = checkDeclarationWords({ stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'fact', source: 'Page', facts: [{ name: 'p', shape: 'money', anchor: 'Nope', unit: 'total' }] }] } }] }, { Page: lisbon.page }, null);
  assert.deepEqual(noMap.map((x) => x.code), ['rubric-fact-label-off-list']);
});

test('the drafter reads the drops: renderLookReport prints NOT CHECKED (rule n) for a dropped fact and LEFT OUT for a narrowing, so neither is written back as a check', async () => {
  const look = await lookOf(FIVE);
  const out = renderLookReport(look);
  assert.match(out, /NOT CHECKED \(rule 3\): "Stops" - The page never shows a number right after or right before "StaticText"\. No word on this page reads "Stops" safely\./);
  assert.match(out, /CAN CHECK: MaxPrice - money, from "flights", label "From", unit "US dollars"/);
  assert.match(out, /CAN CHECK: LeaveAirport - phrase, from "flights", the quote must say this page word: "Leaves"/);
  const narrow = renderLookReport(await lookOf({ facts: [{ name: 'price', from: 'line 1 rule 1', shape: 'money', words: ['From', 'from '], unit: ['US dollars'] }] }));
  assert.match(narrow, /LEFT OUT of "price" \(the rest is still checked\): "from" does not show the same values as "From"/);
});

test('plan card words: planFromSpec shows the refused rule and the notes; planFromConfirm shows the drop lines - all from the one table', async () => {
  const look = await lookOf(FIVE);
  const block = new CheckBlock({ texts: { flights: bos.page }, labels: ['flights'], asks: false });
  block.fromJob(JOB);
  block.addLook(look.facts, look.dropped);
  const built = block.reconcile();
  const closeDecl = { genre: 'text', lang: 'text', stages: built.stages, refused: block.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => ({ line: r.line, rule: r.rule, reason: String(r.reason) })), list: block.signedRows() };
  const signedPlan = planFromSpec({ ...spec, closeDecl });
  const refused = signedPlan.lines[0].refused.join('\n');
  assert.match(refused, /"nonstop" — The page never shows a number right after or right before "StaticText"\./);
  // the confirm card: the drop lines are appended to plan.notChecked by code before drafting is paid for (the REAL runConfirmTurn)
  const plan = { checks: [{ text: 'price under 450', fromLine: [1] }], goal: 'List 3 flights.', questions: [], notChecked: ['my own gap'] };
  const generate = async (/** @type {any[]} */ _m, /** @type {any[]} */ tools) => { await tools.find((/** @type {any} */ t) => t.name === CONFIRM_TOOL_NAME).execute(plan); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; };
  /** @type {any} */
  let card = null;
  const r = await runConfirmTurn({
    verdictType: 'green', answers: { 1: 'x' }, questions: GREEN_QUESTIONS, labels: FIELD_LABELS, facts: { rubricFiles: true, look }, listing: null, writeScope: null,
    isRepo: false, lang: 'js', generate, book: makeCostBook({ ceilingUsd: null }), ask: async (/** @type {any} */ step) => { card = step.plan ?? card; return 'confirm'; }, jobLines: JOB,
  });
  assert.equal(r.ok, true);
  assert.ok(r.accepted.notChecked.includes('my own gap'));
  const dropLines = r.accepted.notChecked.filter((/** @type {string} */ n) => n.startsWith('line 1: "nonstop" — '));
  assert.equal(dropLines.length, 1, JSON.stringify(r.accepted.notChecked));
  const shown = planFromConfirm(JOB, card).notChecked;
  assert.ok(shown.includes(dropLines[0]), 'the confirm card shows exactly the same words');
});

test('ONE table: no source file but src/pagedropwords.js writes a drop sentence', () => {
  const fragments = [
    'is not written on the page', 'The page never shows a number right after or right before', 'is written more than once inside one line of the page',
    'does not show the same values as', 'does not show the same amounts as', 'One result is one record; ask for N results instead',
    'would read the same value as', 'The page gives no second label for it', 'No word on this page reads', 'Only the first 3 currencies are used',
    'Only the first 10 units are used', 'is longer than 100 characters', 'could not read a price in the page', 'that a check cannot read',
  ];
  const own = readFileSync(join(HERE, '..', 'src', 'pagedropwords.js'), 'utf8');
  for (const f of fragments) assert.ok(own.includes(f), `the table lacks: ${f}`);
  /** @type {string[]} */
  const files = [];
  const walk = (/** @type {string} */ d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs|html)$/.test(n)) files.push(p); } };
  walk(join(HERE, '..', 'src'));
  for (const p of files.filter((f) => !f.endsWith('pagedropwords.js'))) {
    const body = readFileSync(p, 'utf8');
    for (const f of fragments) assert.ok(!body.includes(f), `${p} writes a drop sentence of its own: ${f}`);
  }
});

test('dropSentence / dropRows / dropLine: a fact\'s own sentence reads last; one row per fact; the rule words are the person\'s own', () => {
  const d = [
    { line: 1, rule: 1, fact: 'price', reason: 'no-label' },
    { line: 1, rule: 1, fact: 'price', word: 'Total', reason: 'not-on-page' },
    { line: 1, rule: 1, fact: 'price', word: 'x', reason: 'r1', other: 'From' },
  ];
  const rows = dropRows(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].full, true);
  assert.deepEqual(rows[0].sentences, ['"Total" is not written on the page.', '"x" does not show the same values as "From", so it was not used as a second way to read it.', 'No word on this page reads "price" safely.']);
  assert.equal(dropLine(rows[0], JOB, lineRules), 'line 1: "under $450" — "Total" is not written on the page. "x" does not show the same values as "From", so it was not used as a second way to read it. No word on this page reads "price" safely.');
  assert.equal(dropSentence({ line: 1, fact: 'f', reason: 'zzz-unknown', word: 'w' }), '"w" was left out.', 'an unknown code still says something plain');
});

// ── the call sites: the drafting loop (authorClose) is what makes the engine the feature ─────────────────────────────────────

async function frozenFlights() {
  const dir = mkdtempSync(join(tmpdir(), 'page-drops-'));
  made.push(dir);
  const file = join(dir, 'flights.txt');
  writeFileSync(file, bos.page);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'flights', value: file }], into: join(dir, 'seed') });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) throw new Error('unreachable');
  const frozen = await readFrozenInputs(r.prep.tree, ['flights']);
  assert.equal(frozen.ok, true);
  if (!frozen.ok) throw new Error('unreachable');
  const look = await lookOf(FIVE, frozen.texts.flights);
  return { prep: r.prep, file, look };
}
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const READ_DEPART = { op: 'reading', line: 1, rules: [2], fact: 'DepartureWindow', reading: { op: 'between', lo: '05:00', hi: '22:00' } };

test('authorClose (the real drafting loop): the junk "Stops" fact is NOT built and the dropped "nonstop" rule is NOT refused as dropped by the gate - code lists it under Not checked from the block\'s row; the drafter is told in the look block it reads', async () => {
  const { prep, file, look } = await frozenFlights();
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const block = new CheckBlock({ texts: { flights: readFileSync(file, 'utf8') }, labels: ['flights'], asks: false });
  block.fromJob(JOB);
  block.addLook(look.facts, look.dropped);
  block.reconcile();
  /** @type {any[]} */
  const seen = [];
  const generate = async (/** @type {any[]} */ messages, /** @type {any[]} */ tools) => {
    seen.push(messages.map((m) => m.content).join('\n'));
    await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [READ_DEPART] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List 3 flights from Boston to Chicago' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'flights' }], look }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: JOB, inputs: [{ n: 1, label: 'flights', value: file }], block,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.iterations[0].validation.ok, true, JSON.stringify(r.iterations[0].validation));
  assert.deepEqual(r.declaration.refused.map((/** @type {any} */ x) => [x.line, x.rule]), [[1, 3]]);
  assert.match(ruleNotChecked(r.declaration, JOB)[0], /^line 1: "nonstop" — The page never shows a number right after or right before "StaticText"/);
  assert.match(seen[0], /NOT CHECKED \(rule 3\): "Stops"/, 'the drafter was told in the look block it reads');
  assert.ok(!r.declaration.stages[1].params.parts[0].facts.some((/** @type {any} */ f) => f.name === 'Stops'));
});

test('a dropped word cannot return through the drafter: an `add` of the "StaticText" label the page rules dropped is Not checked in the drop\'s own words (never a plan-red); the corrected try (no add) settles', async () => {
  const { prep, file, look } = await frozenFlights();
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const block = new CheckBlock({ texts: { flights: readFileSync(file, 'utf8') }, labels: ['flights'], asks: false });
  block.fromJob(JOB);
  block.addLook(look.facts, look.dropped);
  block.reconcile();
  let calls = 0;
  const generate = async (/** @type {any[]} */ _m, /** @type {any[]} */ tools) => {
    calls += 1;
    await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: calls === 1 ? [{ op: 'add', kind: 'fact', line: 1, name: 'Stops', shape: 'number', words: ['StaticText'], source: 'flights' }] : [] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List 3 flights from Boston to Chicago' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'flights' }], look }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: JOB, inputs: [{ n: 1, label: 'flights', value: file }], block,
  });
  assert.equal(r.ok, true, `${r.stop} ${JSON.stringify(r.reds)}`);
  assert.notEqual(r.stop, 'plan-red');
  assert.equal(r.iterations[0].validation.ok, true, 'the plan code built passes its own gate at the first try');
  const stops = block.rows.find((x) => x.name === 'Stops');
  assert.equal(stops?.state, 'not-checked');
  assert.match(String(stops?.reason), /the label "StaticText" cannot be used\. The page never shows a number right after or right before "StaticText"/);
  assert.ok(!r.declaration.stages[1].params.parts[0].facts.some((/** @type {any} */ f) => f.name === 'Stops'));
});

// (deleted: "the drafter is TOLD the drop rules in the same change: a NOT CHECKED / LEFT OUT word is never used" pinned REQUIRED_FACTS_BRIEF wording; the rule is code's now (src/checkblock.js factsOf runs
// checkFactWords, tested above), and the look block the drafter reads still prints NOT CHECKED / LEFT OUT, tested in "the drafter reads the drops".)
