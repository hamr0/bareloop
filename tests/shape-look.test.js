// Shape jobs (itemShape), clause 1 "Offer" as hamr ruled 2026-11-18 (2a): the shape is proposed by a pre-call LOOK before the asks (src/shapelook.js, the sibling of the sheet look), built by code (src/shapebuild.js) in
// authorCloseForJob before `askRounds`, so "the rules or the shape could both fit" is one of the counted asks. The row-edit turn proposes no shape. Fake provider, $0, no bareguard itemShape (OFF unless shapeAvailable()).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shapeLookPrompt, parseShapeAnswer, runShapeLook, runLookWithShape, shapeMenuLines, SHAPE_CALL_LABEL } from '../src/shapelook.js';
import { PROMPT_REGISTERS } from '../src/promptregisters.js';
import { SHAPE_KINDS } from '../src/shapemenu.js';
import { rowEditChannel } from '../src/rowedit.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { reply } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'shape-look-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

const JOB = [{ n: 1, text: 'List the flights', rule: 'each flight has a price under 450; the flight is nonstop', rules: ['each flight has a price under 450', 'the flight is nonstop'] }];
const f = (/** @type {any} */ o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const SHAPES = [{ line: 1, fields: [f({ name: 'price', kind: 'number', bounds: { lt: 450 }, fromRule: 1 }), f({ name: 'nonstop', kind: 'boolean', bounds: { equals: true }, fromRule: 2 })], extraFields: [], itemCountFrom: [], alsoFitsRules: false }];
const ans = (/** @type {any} */ shapes) => JSON.stringify({ shapes });
const prov = (/** @type {any[]} */ script, /** @type {any[]} */ seen = []) => { let i = 0; return { async generate(/** @type {any} */ m) { seen.push(m); const e = script[Math.min(i, script.length - 1)]; i += 1; if (e instanceof Error) throw e; return e; } }; };
const good = () => reply({ text: ans(SHAPES), costUsd: 0.002 });
const run = (/** @type {any} */ provider, /** @type {any} */ extra = {}) => runShapeLook({ texts: { Flights: 'SFO to LAX 07:30 $199 nonstop' }, inputs: [{ n: 1, label: 'Flights' }], jobLines: JOB, lineNums: [1], provider, sleep: async () => {}, ...extra });

test('the prompt carries the job with its numbered rules, the bounded inputs, the one menu (boolean/equals) and the answer form', () => {
  const p = shapeLookPrompt({ jobLines: JOB, lineNums: [1], texts: { Flights: 'x'.repeat(9000) } });
  assert.match(p, /LINE 1: List the flights\n~ rule 1: each flight has a price under 450\n~ rule 2: the flight is nonstop/);
  assert.match(p, /first 8000 of 9000 characters/);
  assert.ok(p.includes('  boolean: bounds equals'));
  assert.equal(shapeMenuLines().length, Object.keys(SHAPE_KINDS).length);
  assert.match(p, /The lines a shape can be offered for: 1\./);
  assert.match(p, /code drops every bound the person did not write/);
});

test('parse: strict, no repair; what a field means is code\'s to judge', () => {
  assert.equal(parseShapeAnswer(ans(SHAPES)).ok, true);
  assert.equal(parseShapeAnswer(ans([])).ok, true);
  assert.equal(parseShapeAnswer('sure!').ok, false);
  assert.equal(parseShapeAnswer(JSON.stringify({ shapes: [{ fields: [] }] })).ok, false, 'a shape needs a whole line');
  assert.equal(parseShapeAnswer(JSON.stringify({ shapes: [{ line: 1, fields: 'x' }] })).ok, false);
  assert.equal(parseShapeAnswer(JSON.stringify({ facts: [] })).ok, false);
});

test('one call for the job: booked as shape-map with its cost; an unreadable answer twice is a stop; a transport failure is retried once, booked unpriced; the cap is checked before the call', async () => {
  const r = await run(prov([good()]));
  assert.equal(r.state, 'PRESENT');
  assert.deepEqual(r.calls.map((c) => [c.label, c.costUsd]), [[SHAPE_CALL_LABEL, 0.002]]);
  assert.equal(r.shapes.length, 1);
  const bad = await run(prov([reply({ text: 'no' }), reply({ text: 'still no' })]));
  assert.equal(bad.state, 'ABSENT');
  assert.match(String(bad.reason), /about the shape of the answer was not readable twice/);
  assert.equal(bad.calls.length, 2);
  const boom = () => Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
  const ok = await run(prov([boom(), good()]));
  assert.deepEqual(ok.calls.map((c) => c.costUsd), [null, 0.002]);
  const seen = /** @type {any[]} */ ([]);
  const capped = await run(prov([good()], seen), { ceilingUsd: 0.01, priorCalls: [{ costUsd: 0.01, unpricedRounds: 0 }] });
  assert.equal(capped.budgetStop, 'cap-halt');
  assert.equal(seen.length, 0);
});

test('the look door: OFF (`shape: false`) is runLook\'s own answer and makes no shape call; ON by default now (bareguard 0.37 carries itemShape); forced on, the shapes ride the look and the spend adds up', async () => {
  const seen = /** @type {any[]} */ ([]);
  const args = { texts: { Flights: 'SFO to LAX 07:30 $199 nonstop' }, inputs: [{ n: 1, label: 'Flights' }], jobLines: JOB, sleep: async () => {} };
  const off = await runLookWithShape({ ...args, shape: false, provider: prov([reply({ text: JSON.stringify({ facts: [] }), costUsd: 0.003 })], seen) });
  assert.equal(Object.hasOwn(off.facts.look, 'shapes'), false);
  assert.equal(seen.length, 1, 'the page map only');
  const on = await runLookWithShape({ ...args, shape: true, provider: prov([reply({ text: JSON.stringify({ facts: [] }), costUsd: 0.003 }), good()]) });
  assert.deepEqual(on.calls.map((c) => c.label).slice(-1), [SHAPE_CALL_LABEL]);
  assert.equal(on.facts.look.shapes.length, 1);
  assert.ok(on.calls.length >= 2);
  const sheet = await runLookWithShape({ ...args, shape: true, sheets: ['Flights'], provider: prov([reply({ text: JSON.stringify({ facts: [] }), costUsd: 0.003 })]) });
  assert.equal(Object.hasOwn(sheet.facts?.look ?? {}, 'shapes'), false, 'a job with a CSV is a sheet job: no shape look');
});

test('soft fail (hamr 2026-11-18): an unreadable, failed or capped shape look does not stop the draft: PRESENT, no shapes, the spend still booked, the reason on the look', async () => {
  const args = { texts: { Flights: 'SFO to LAX 07:30 $199 nonstop' }, inputs: [{ n: 1, label: 'Flights' }], jobLines: JOB, sleep: async () => {}, shape: true };
  const pm = () => reply({ text: JSON.stringify({ facts: [] }), costUsd: 0.003 });
  const unreadable = await runLookWithShape({ ...args, provider: prov([pm(), reply({ text: 'no', costUsd: 0.002 }), reply({ text: 'no', costUsd: 0.002 })]) });
  assert.equal(unreadable.state, 'PRESENT');
  assert.equal(Object.hasOwn(unreadable.facts.look, 'shapes'), false);
  assert.match(unreadable.facts.look.shapeSkipped, /not readable twice/);
  assert.deepEqual(unreadable.calls.map((c) => c.label).slice(-2), [SHAPE_CALL_LABEL, SHAPE_CALL_LABEL], 'both attempts stay booked');
  const capped = await runLookWithShape({ ...args, ceilingUsd: 0.003, provider: prov([pm()]) });
  assert.equal(capped.state, 'PRESENT');
  assert.match(capped.facts.look.shapeSkipped, /ceiling was already spent/);
  assert.equal(capped.calls.length, 1, 'the page map\'s spend is kept, no shape call was made');
});

test('the row-edit turn proposes no shape (one path only), and the look\'s words are a registered prompt register', () => {
  assert.equal(Object.hasOwn(rowEditChannel(false).tool({ calls: [] }).parameters.properties, 'itemShape'), false);
  assert.equal(rowEditChannel.length <= 2, true);
  assert.ok(PROMPT_REGISTERS.some((e) => e.file === 'src/shapelook.js'));
  assert.ok(!PROMPT_REGISTERS.some((e) => e.file === 'src/shapeoffer.js'));
});

test('authorCloseForJob: the shape is built BEFORE the asks; "rules or shape could both fit" is ONE counted ask; Agree keeps the shape; the draft gets a block that holds the shape rows', async () => {
  const file = join(tmp(), 'flights.txt');
  copyFileSync(join(HERE, 'fixtures', 'page-partial.txt'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  /** @type {string[]} */ const order = [];
  /** @type {any} */ let asked = null;
  /** @type {any} */ let seen = null;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look: { facts: [], prose: [], notFound: [], dropped: [], shapes: [{ ...SHAPES[0], alsoFitsRules: true }] } } };
  const r = await authorCloseForJob({
    answers: { 1: '1. List the flights' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(JOB)), inputs: [{ n: 1, label: 'Flights', value: file }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1, onPhase: (p) => order.push(p),
    lookFn: async () => survey,
    answerQuestions: async (o) => { order.push('ask'); asked = o; return { jobLines: JSON.parse(JSON.stringify(JOB)), answers: { 1: 'x' }, choices: o.questions.map((/** @type {any} */ q) => ({ key: q.key, choice: 'agree', text: '' })) }; },
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (o) => { order.push('authorFn'); seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }] }, seedRead: [], iterations: [], reds: [], cost: { calls: [] }, raws: [], stop: 'accepted' }; },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.deepEqual(order.filter((x) => ['shape-built', 'ask', 'authorFn'].includes(x)), ['shape-built', 'ask', 'authorFn']);
  assert.equal(asked.questions.length, 1);
  assert.equal(asked.questions[0].counted, true, 'costs one of the 3');
  assert.match(asked.questions[0].question, /list of items with the fields price, nonstop/);
  const block = seen.block;
  assert.equal(block.isShapeLine(1), true);
  assert.deepEqual(block.rows.filter((/** @type {any} */ x) => x.kind === 'rule').map((/** @type {any} */ x) => x.state), ['built', 'built']);
  assert.equal(Object.hasOwn(seen, 'carriedShapeDropped'), false, 'the draft is not told about shapes: the block already holds them');
});

test('authorCloseForJob: a look that skipped the shape says so as a phase (the draft log line), asks nothing and the rules take the usual path', async () => {
  const file = join(tmp(), 'flights.txt');
  copyFileSync(join(HERE, 'fixtures', 'page-partial.txt'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('inputs');
  /** @type {any[]} */ const phases = [];
  /** @type {any} */ let seen = null;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look: { facts: [], prose: [], notFound: [], dropped: [], shapeSkipped: 'the call about the shape of the answer failed: boom' } } };
  const r = await authorCloseForJob({
    answers: { 1: '1. List the flights' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(JOB)), inputs: [{ n: 1, label: 'Flights', value: file }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1, onPhase: (/** @type {string} */ p, /** @type {any} */ d) => phases.push([p, d]),
    lookFn: async () => survey, answerQuestions: async () => { throw new Error('nothing to ask'); }, generate: async () => { throw new Error('no model call'); },
    authorFn: async (o) => { seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }] }, seedRead: [], iterations: [], reds: [], cost: { calls: [] }, raws: [], stop: 'accepted' }; },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.deepEqual(phases.find(([p]) => p === 'shape-skipped')?.[1], { reason: 'the call about the shape of the answer failed: boom' });
  assert.equal(phases.some(([p]) => p === 'shape-built'), false);
  assert.equal(seen.block.isShapeLine(1), false);
  assert.equal(seen.block.rows.some((/** @type {any} */ x) => x.kind === 'shape'), false);
  const { phaseLine } = await import('../src/authorreadout.js');
  assert.equal(phaseLine('shape-skipped', { reason: 'boom' }), '· the shape look did not complete: boom; going on without a shape');
});
