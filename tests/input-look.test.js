// PART 1c item (c) - THE LOOK (src/inputlook.js pure parts, src/authorscout.js `runInputLook`, wired in src/authorjob.js): a read-only,
// bounded, paid look at the person's frozen input text. The model is a scripted provider through the REAL bare-agent Loop; nothing
// reaches the network. Real data: a copy of this repo's CHANGELOG.md frozen by the real source door.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookReadTools, lookReportSchema, lookPrompt, verifyLookReport, renderLookReport, labelListsOf, lookLines, LOOK_REPORT_TOOL } from '../src/inputlook.js';
import { runInputLook, LOOK_ROUNDS, LOOK_RECOVERY_PROMPT } from '../src/authorscout.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { scriptedProvider } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'input-look-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

const NN = ' ';
const flight = (n, price, dep, arr) => [
  `- link "From ${price} US dollars. Nonstop flight with Alpha Air. Leaves First City International Airport at ${dep} on Thursday, March 5 and arrives at Second City International Airport at ${arr} on Thursday, March 5. Total duration 1 hr 30 min. Select flight" [ref=${n}49]`,
  `  - generic "Departure time: ${dep}." [ref=${n}97]`,
].join('\n');
const FLIGHTS = [flight(1, 43, `9:09${NN}AM`, `10:41${NN}AM`), flight(2, 59, `12:00${NN}PM`, `1:28${NN}PM`), flight(3, 71, `6:00${NN}AM`, `7:30${NN}AM`)].join('\n');
const JOB = [{ n: 1, text: 'List 3 flights from First City to Second City', rule: 'under $450; nonstop', rules: ['under $450', 'nonstop'] }];
const TEXTS = { Flights: FLIGHTS };

test('the grant is read-only by construction: the tools are search and read over in-memory text, the answer form is the only other tool, and none can write', async () => {
  const tools = lookReadTools(TEXTS);
  assert.deepEqual(tools.map((t) => t.name), ['search_input', 'read_input']);
  const search = tools[0];
  const hit = await search.execute({ text: 'departure time: 9:09 am' });
  assert.equal(hit.total, 1, 'case-insensitive and white-space blind (U+202F before AM)');
  assert.equal(hit.hits[0].line, 2);
  assert.doesNotMatch(JSON.stringify(hit), /ref=/, 'the page reader\'s one-time ids are never shown');
  const read = await tools[1].execute({ line: 1, count: 2 });
  assert.equal(read.lines.length, 2);
  assert.equal((await search.execute({ input: 'Nope', text: 'x' }).catch(() => null))?.input ?? 'Flights', 'Flights', 'one input: the name is optional');
  const two = lookReadTools({ A: 'alpha beta', B: 'gamma' });
  assert.match((await two[0].execute({ text: 'alpha' })).error, /name the input: A, B/);
  assert.equal((await two[0].execute({ input: 'B', text: 'gamma' })).total, 1);
  assert.deepEqual(lookLines(`a${NN}b [ref=1] c`), ['a b c']);
});

test('the answer form is a strict schema: every field named, nothing extra allowed, the shapes a closed list', () => {
  const s = lookReportSchema();
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required, ['facts', 'prose', 'notFound']);
  assert.equal(s.properties.facts.items.additionalProperties, false);
  assert.deepEqual(s.properties.facts.items.properties.shape.enum, ['money', 'number', 'date', 'time', 'phrase', 'text']);
  assert.match(lookPrompt({ jobLines: JOB, labels: ['Flights'], lists: { Flights: 'LIST' } }), /~ 1\. under \$450[\s\S]*Report only through report_look/);
});

test('verifyLookReport: a label is carried only if it is ON THE LIST (an id is resolved to its words); one that is not is moved to notFound, named', () => {
  const { scans } = labelListsOf(TEXTS);
  const dep = scans.Flights.time.find((r) => r.label === 'Departure time:');
  const raw = {
    facts: [
      { line: 1, name: 'price', shape: 'money', source: 'Flights', label: 'From', example: '43 US dollars', rule: { op: 'lt', value: 450 } },
      { line: 1, name: 'departs', shape: 'time', source: 'Flights', label: dep.id, example: '9:09 AM', aiProposal: true },
      { line: 1, name: 'origin', shape: 'phrase', source: 'Flights', label: 'Leaves', value: 'First City International Airport', example: 'First City International Airport' },
      { line: 1, name: 'typed', shape: 'time', source: 'Flights', label: 'Where from?', example: '9:09 AM' },
      { line: 1, name: 'job words', shape: 'text', source: 'Flights', label: 'from', example: 'First City' },
      { line: 1, name: 'x', shape: 'colour', source: 'Flights', example: '1' },
      { line: 1, name: 'y', shape: 'time', source: 'Elsewhere', example: '1' },
      { line: 9, name: 'z', shape: 'time', source: 'Flights', example: '1' },
    ],
    prose: [{ line: 1, text: 'a written summary' }, { line: 7 }],
    notFound: [{ line: 1, rule: 2, words: 'direct', why: 'the input says Nonstop' }, { line: 1, why: 'bad' }, { line: 4, why: 'no such line' }],
  };
  const r = verifyLookReport(raw, { scans, jobLines: JOB });
  assert.deepEqual(r.facts.map((f) => f.name), ['price', 'departs', 'origin']);
  assert.equal(r.facts[1].label, 'Departure time:', 'the id is resolved to the exact words');
  assert.equal(r.facts[2].phrase, 'Leaves First City International Airport', 'a phrase fact is label + value, built by code');
  assert.equal(r.facts[1].aiProposal, true);
  const why = r.notFound.map((n) => n.why).join(' | ');
  assert.match(why, /the label "Where from\?" for "typed" is not one of the labels found in "Flights"/);
  assert.match(why, /the label "from" for "job words" is not one of the labels found in "Flights"/, 'the job\'s own words are not a label unless the source holds them');
  assert.match(why, /shape \(colour\) that does not exist/);
  assert.match(why, /input \(Elsewhere\) that is not one of yours/);
  assert.match(why, /job line that does not exist/);
  assert.deepEqual(r.prose, [{ line: 1, text: 'a written summary' }], 'a prose line that does not exist is dropped');
  assert.deepEqual(r.notFound.filter((n) => n.rule === 2).map((n) => n.words), ['direct']);
  // a time label is not a money label
  const wrong = verifyLookReport({ facts: [{ line: 1, name: 'p', shape: 'money', source: 'Flights', label: 'Departure time:', example: '1' }], prose: [], notFound: [] }, { scans, jobLines: JOB });
  assert.equal(wrong.facts.length, 0);
  // a non-object report is an empty one, never a throw
  assert.deepEqual(verifyLookReport('nonsense', { scans, jobLines: JOB }), { facts: [], prose: [], notFound: [] });
});

test('verifyLookReport: a phrase the source does not hold is refused when the caller proves it (the found-in-source hook)', () => {
  const { scans } = labelListsOf(TEXTS);
  const r = verifyLookReport({ facts: [{ line: 1, name: 'origin', shape: 'phrase', source: 'Flights', label: 'Leaves', value: 'Nowhere Airport', example: 'x' }], prose: [], notFound: [] },
    { scans, jobLines: JOB, prove: (src, phrase) => (FLIGHTS.includes(phrase) ? 1 : 0) });
  assert.equal(r.facts.length, 0);
  assert.match(r.notFound[0].why, /"Leaves Nowhere Airport" is not in the input "Flights"/);
});

test('renderLookReport: the drafter reads one block per line - what can be checked with the exact words, the written lines, and what was not found', () => {
  const { scans } = labelListsOf(TEXTS);
  const r = verifyLookReport({
    facts: [{ line: 1, name: 'price', shape: 'money', source: 'Flights', label: 'From', example: '43 US dollars' }, { line: 1, name: 'origin', shape: 'phrase', source: 'Flights', label: 'Leaves', value: 'First City International Airport', example: 'e' }],
    prose: [], notFound: [{ line: 1, rule: 2, words: 'direct', why: 'not in the input' }],
  }, { scans, jobLines: JOB });
  const out = renderLookReport(r);
  assert.match(out, /^WHAT THE LOOK AT THE INPUTS FOUND/);
  assert.match(out, /CAN CHECK: price - money, from "Flights", label "From"/);
  assert.match(out, /the quote must say "Leaves First City International Airport"/);
  assert.match(out, /NOT FOUND \(rule 2\): "direct" - not in the input/);
});

// ── the paid loop, with a scripted model through the real Loop ────────────────────────────────────────────────────────────────
const REPORT = {
  facts: [
    { line: 1, name: 'price', shape: 'money', source: 'Flights', label: 'From', example: '43 US dollars', rule: { op: 'lt', value: 450 } },
    { line: 1, name: 'origin', shape: 'phrase', source: 'Flights', label: 'Leaves', value: 'First City International Airport', example: 'First City International Airport' },
  ],
  prose: [], notFound: [{ line: 1, rule: 2, words: 'nonstop', why: 'the input says Nonstop - not looked for' }],
};
const call = (id, name, args) => ({ id, name, arguments: args });
const INPUTS = [{ n: 1, label: 'Flights' }];

test('runInputLook: search, read, then the strict report - a PRESENT survey carrying the verified report, the spend metered per call into `calls`, nothing written', async () => {
  const provider = scriptedProvider([
    { toolCalls: [call('a', 'search_input', { text: 'Leaves' })], costUsd: 0.01 },
    { toolCalls: [call('b', 'read_input', { line: 1, count: 2 })], costUsd: 0.01 },
    { toolCalls: [call('c', LOOK_REPORT_TOOL, REPORT)], costUsd: 0.01 },
  ]);
  /** @type {any[]} */
  const reported = [];
  const s = await runInputLook({ texts: TEXTS, inputs: INPUTS, jobLines: JOB, provider, onCall: (c) => reported.push(c) });
  assert.equal(s.state, 'PRESENT', JSON.stringify(s.reason));
  assert.equal(s.facts.rubricFiles, true);
  assert.deepEqual(s.facts.inputs, INPUTS);
  assert.deepEqual(s.facts.look.facts.map((f) => f.name), ['price', 'origin']);
  assert.equal(s.facts.look.facts[1].phrase, 'Leaves First City International Airport');
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].label, 'input-look');
  assert.equal(s.calls[0].costUsd, 0.03, 'the whole look is one metered call: three priced rounds');
  assert.deepEqual(reported.map((c) => c.label), ['input-look'], 'the shell is told at the same instant');
  assert.deepEqual(provider.toolsOffered[0].sort(), ['read_input', LOOK_REPORT_TOOL, 'search_input'].sort());
  for (const offered of provider.toolsOffered) for (const n of offered) assert.doesNotMatch(n, /write|edit|run|shell/);
  assert.match(provider.messagesLog[0].map((m) => m.content).join('\n'), /LABELS IN THE INPUT "Flights"/, 'the model is shown the picked-from list');
});

test('runInputLook: the round bound is hard - a model that only keeps searching is cut at LOOK_ROUNDS and the reserved final round offers the answer form ALONE', async () => {
  // a script whose first N replies are all searches: rounds = 2 means the third turn never happens
  const searching = scriptedProvider([
    { toolCalls: [call('a', 'search_input', { text: 'Leaves' })], costUsd: 0.01 },
    { toolCalls: [call('b', 'search_input', { text: 'From' })], costUsd: 0.01 },
    { toolCalls: [call('d', LOOK_REPORT_TOOL, REPORT)], costUsd: 0.01 },
  ]);
  const s = await runInputLook({ texts: TEXTS, inputs: INPUTS, jobLines: JOB, provider: searching, rounds: 2 });
  assert.equal(s.state, 'PRESENT', JSON.stringify(s.reason));
  assert.equal(s.meta.bounded, true);
  assert.equal(s.calls.length, 2, 'the look and its reserved final round');
  assert.deepEqual(s.calls.map((c) => c.label), ['input-look', 'input-look-recovery']);
  assert.deepEqual(searching.toolsOffered.at(-1), [LOOK_REPORT_TOOL], 'the final round cannot look any more');
  assert.equal(searching.calls.at(-1), LOOK_RECOVERY_PROMPT);
  assert.equal(LOOK_ROUNDS, 8);
});

test('runInputLook: no report at all is an ABSENT look saying so; a spent ceiling stops before the reserved round and says it was the ceiling', async () => {
  const mute = scriptedProvider([{ text: 'I looked but will not report', costUsd: 0.01 }]);
  const none = await runInputLook({ texts: TEXTS, inputs: INPUTS, jobLines: JOB, provider: mute });
  assert.equal(none.state, 'ABSENT');
  assert.match(none.reason, /ended without a report/);
  assert.equal(none.budgetStop, null);
  const dear = scriptedProvider([{ text: 'nothing', costUsd: 0.5 }]);
  const capped = await runInputLook({ texts: TEXTS, inputs: INPUTS, jobLines: JOB, provider: dear, ceilingUsd: 0.1 });
  assert.equal(capped.state, 'ABSENT');
  assert.equal(capped.budgetStop, 'cap-halt');
  assert.equal(dear.calls.length, 1, 'the reserved round was not paid for');
  const never = await runInputLook({ texts: TEXTS, inputs: INPUTS, jobLines: JOB, provider: dear, ceilingUsd: 0 });
  assert.equal(never.budgetStop, 'cap-halt');
  assert.equal(never.calls.length, 0);
});

test('runInputLook: a failed call is an ABSENT look with the provider\'s reason, never an empty PRESENT one', async () => {
  const dead = { async generate() { return { text: '', toolCalls: [], error: 'provider-red: 503', usage: {}, cost: null }; } };
  const s = await runInputLook({ texts: TEXTS, inputs: INPUTS, jobLines: JOB, provider: dead });
  assert.equal(s.state, 'ABSENT');
  assert.match(String(s.reason), /look call failed|ended without a report/);
});

// ── wired into the drafting pipeline ──────────────────────────────────────────────────────────────────────────────────────────
test('authorCloseForJob on a rubric job: the look runs ONCE on the frozen input text before drafting, its survey reaches the drafter, and its calls travel as drafting spend; lookFn null keeps the plain numbered-inputs survey', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  /** @type {any} */
  let lookArgs = null;
  /** @type {any} */
  let seen = null;
  /** @type {string[]} */
  const phases = [];
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [{ label: 'input-look', costUsd: 0.02, unpricedRounds: 0 }], raws: [],
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } };
  const base = {
    answers: { 1: '1. Summarize the unreleased changes' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: [{ n: 1, text: 'Summarize the unreleased changes' }], inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'],
    provider: { fake: true }, ceilingUsd: 1, onPhase: (p) => phases.push(p),
    generate: async () => { throw new Error('no model call in this test'); },
    authorFn: async (o) => { seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }], notes: [] }, genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  };
  const r = await authorCloseForJob({ ...base, lookFn: async (a) => { lookArgs = a; return survey; } });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.deepEqual(Object.keys(lookArgs.texts), ['Changelog']);
  assert.equal(lookArgs.texts.Changelog, readFileSync(file, 'utf8'), 'the look reads the FROZEN input text');
  assert.deepEqual(lookArgs.jobLines, base.jobLines);
  assert.equal(lookArgs.ceilingUsd, 1);
  assert.equal(seen.scout, survey, 'the drafter is handed the look as its survey (its calls are absorbed there as drafting spend)');
  assert.deepEqual(phases.filter((p) => p.startsWith('look')), ['look', 'look-done']);
  // lookFn null: the survey is the numbered inputs only
  seen = null;
  const plain = await authorCloseForJob({ ...base, lookFn: null });
  assert.equal(plain.ok, true);
  assert.deepEqual(seen.scout.facts, { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] });
  // an ABSENT look is handed to the drafting loop as it is: authorClose's own $0 preflight refuses on it (scout-absent), naming why
  seen = null;
  await authorCloseForJob({ ...base, lookFn: async () => ({ state: 'ABSENT', reason: 'the look ended without a report', cause: 'empty', budgetStop: null, calls: [], raws: [], facts: null }) });
  assert.equal(seen.scout.state, 'ABSENT');
  assert.equal(seen.scout.reason, 'the look ended without a report');
});
