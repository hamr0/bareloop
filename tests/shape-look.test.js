// Shape jobs (itemShape), clause 1 "Offer" as hamr ruled 2026-11-18 (2a): the shape is proposed by a pre-call LOOK before the asks (src/shapelook.js, the sibling of the sheet look), built by code (src/shapebuild.js) in
// authorCloseForJob before `askRounds`, so "the rules or the shape could both fit" is one of the counted asks. The row-edit turn proposes no shape. Fake provider, $0, no bareguard itemShape (no src file gates the shape look on shapeAvailable(); only tests call it).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shapeLookPrompt, parseShapeAnswer, runShapeLook, shapeMenuLines, SHAPE_CALL_LABEL } from '../src/shapelook.js';
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
const SHAPES = [{ line: 1, fields: [f({ name: 'price', kind: 'number', bounds: { lt: 450 }, fromRule: 1 }), f({ name: 'nonstop', kind: 'boolean', bounds: { equals: true }, fromRule: 2 })], extraFields: [], itemCountFrom: [] }];
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
  assert.match(p, /"bounds" holds only the bounds that kind accepts, taken from that field's own rule/);
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

test('the prompt names the rules still without a check ONLY when there are some, and the menu shows the closed values of an option (money currency is a sign)', () => {
  const plain = shapeLookPrompt({ jobLines: JOB, lineNums: [1], texts: { Flights: 'x' } });
  assert.equal(plain.includes('Only these ~ rules'), false);
  const left = shapeLookPrompt({ jobLines: JOB, lineNums: [1], texts: { Flights: 'x' }, left: [{ line: 1, rules: [2] }] });
  assert.match(left, /Only these ~ rules have no check yet: line 1 rule 2\. Give a field for no other rule\. For each of these, give a field ONLY if that rule's own words give it a limit code can check/);
  assert.ok(left.includes('"Each item has a title" counts: required, with minChars 1.'));
  assert.ok(left.includes('A rule whose words give no limit gets no field; it stays with the person.'));
  assert.ok(left.includes('"equals": true.'));
  assert.equal(left.includes('or false'), false);
  assert.equal(left.includes('one field for each ~ rule'), false);
  assert.match(left, /  money: bounds currency \(one of "\$", "€", "£"\), unit, decimal \(one of "\.", ","\), min, max, gt, lt/);
});

test('the prompt tells the AI to give a field for no rule outside the left list', () => {
  const left = shapeLookPrompt({ jobLines: JOB, lineNums: [1], texts: { Flights: 'x' }, left: [{ line: 1, rules: [2] }] });
  assert.ok(left.includes('Give a field for no other rule. For each of these, give a field ONLY if'));
});

test('the row-edit turn proposes no shape (one path only), and the look\'s words are a registered prompt register', () => {
  assert.equal(Object.hasOwn(rowEditChannel(false).tool({ calls: [] }).parameters.properties, 'itemShape'), false);
  assert.ok(PROMPT_REGISTERS.some((e) => e.file === 'src/shapelook.js'));
});

// ---- the draft: the shape look runs ONLY for rules still Not checked after today's truth checks (hamr's pick B, 2026-11-19) ----
const SHAPE_TWO = [{ line: 1, fields: [f({ name: 'nonstop', kind: 'boolean', bounds: { equals: true }, fromRule: 2 })], extraFields: [], itemCountFrom: [] }];
/** one drafting run over the flights page; `facts` are the look's kept facts, `shapeFn` the shape look's seam (a spy) */
async function draftWith(/** @type {any} */ { facts = [], jobLines = JOB, shapeFn = null, text = 'SFO to LAX 07:30 $199 nonstop\nSFO to LAX 09:10 $210 1 stop\n' }) {
  const file = join(tmp(), 'flights.txt');
  writeFileSync(file, text);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('inputs');
  /** @type {any[]} */ const phases = [];
  /** @type {any} */ let seen = null;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look: { facts, prose: [], notFound: [], dropped: [] } } };
  const r = await authorCloseForJob({
    answers: { 1: '1. List the flights' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(jobLines)), inputs: [{ n: 1, label: 'Flights', value: file }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1, onPhase: (/** @type {string} */ p, /** @type {any} */ d) => phases.push([p, d]),
    lookFn: async () => survey, ...(shapeFn ? { shapeFn } : {}),
    answerQuestions: async (/** @type {any} */ o) => ({ jobLines: JSON.parse(JSON.stringify(jobLines)), answers: { 1: 'x' }, choices: o.questions.map((/** @type {any} */ q) => ({ key: q.key, choice: 'drop' })) }),
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (/** @type {any} */ o) => { seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }] }, seedRead: [], iterations: [], reds: [], cost: { calls: [] }, raws: [], stop: 'accepted' }; },
  });
  return { r, phases, seen, survey };
}
const FACT1 = { line: 1, name: 'price', shape: 'money', words: ['Price'], currency: ['$'], source: 'Flights', forRule: 1, reading: { op: 'lt', value: 450 } };
const TXT = 'Flight A\nPrice $410\nFlight B\nPrice $520\n';

test('every rule has a truth check: NO shape call is made (the shape look is not even asked)', async () => {
  let calls = 0;
  const { r, seen } = await draftWith({ facts: [FACT1], jobLines: [{ n: 1, text: 'List the flights', rule: 'under $450', rules: ['under $450'] }], text: TXT, shapeFn: async () => { calls += 1; return { state: 'PRESENT', shapes: [], reason: null, cause: null, raws: [], calls: [], budgetStop: null }; } });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(calls, 0, 'all rules checkable: no call');
  assert.equal(seen.block.rows.some((/** @type {any} */ x) => x.kind === 'shape' || x.can?.how === 'shape'), false);
});

test('a rule left Not checked makes ONE shape call that names it; code builds the field and the rule takes it, the truth-checked rule keeps its fact (facts + shape)', async () => {
  /** @type {any[]} */ const seenArgs = [];
  const { r, phases, seen } = await draftWith({
    facts: [FACT1], text: TXT,
    jobLines: [{ n: 1, text: 'List the flights', rule: 'under $450; the flight is nonstop', rules: ['under $450', 'the flight is nonstop'] }],
    shapeFn: async (/** @type {any} */ a) => { seenArgs.push(a); return { state: 'PRESENT', shapes: SHAPE_TWO, reason: null, cause: null, raws: [], calls: [{ label: 'shape-map', costUsd: 0.002, unpricedRounds: 0 }], budgetStop: null }; },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(seenArgs.length, 1);
  assert.deepEqual(seenArgs[0].left, [{ line: 1, rules: [2] }], 'only the rule no truth check took is named');
  assert.deepEqual(seenArgs[0].lineNums, [1]);
  assert.deepEqual(seen.block.rows.filter((/** @type {any} */ x) => x.kind === 'rule').map((/** @type {any} */ x) => [x.key, x.can?.how]), [['L1.~1', 'fact'], ['L1.~2', 'shape']]);
  assert.ok(phases.some(([p]) => p === 'shape-built'));
});

test('a negating rule is never a candidate (it stays with the person): no shape call for "not a red-eye"', async () => {
  let calls = 0;
  await draftWith({ text: TXT, jobLines: [{ n: 1, text: 'List the flights', rule: 'not a red-eye', rules: ['not a red-eye'] }], shapeFn: async () => { calls += 1; return { state: 'ABSENT', shapes: [], reason: 'x', cause: 'x', raws: [], calls: [], budgetStop: null }; } });
  assert.equal(calls, 0);
});

test('soft fail: a shape look that did not complete says so as a phase, its spend stays booked, and the rules take the usual path (still Not checked)', async () => {
  const { r, phases, seen, survey } = await draftWith({
    text: TXT, jobLines: [{ n: 1, text: 'List the flights', rule: 'the flight is nonstop', rules: ['the flight is nonstop'] }],
    shapeFn: async () => ({ state: 'ABSENT', shapes: [], reason: 'the call about the shape of the answer failed: boom', cause: 'call-failed', raws: [], calls: [{ label: 'shape-map', costUsd: 0.002, unpricedRounds: 0 }], budgetStop: null }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual(phases.find(([p]) => p === 'shape-skipped')?.[1], { reason: 'the call about the shape of the answer failed: boom' });
  assert.equal(survey.calls.some((/** @type {any} */ c) => c.label === 'shape-map'), true, 'the spend stays booked');
  assert.equal(seen.block.isShapeLine(1), false);
  const { phaseLine } = await import('../src/authorreadout.js');
  assert.equal(phaseLine('shape-skipped', { reason: 'boom' }), '· the shape look did not complete: boom; going on without a shape');
});

test('a caller with its own look (no shapeFn) gets no shape call, and the product default look is the page map alone', async () => {
  const { r, phases } = await draftWith({ text: TXT, jobLines: [{ n: 1, text: 'List the flights', rule: 'the flight is nonstop', rules: ['the flight is nonstop'] }] });
  assert.equal(r.ok, true);
  assert.equal(phases.some(([p]) => p === 'shape-built' || p === 'shape-skipped'), false);
  const { runLook } = await import('../src/sheetlook.js');
  const aj = readFileSync(join(HERE, '..', 'src', 'authorjob.js'), 'utf8');
  assert.match(aj, /lookFn = runLook,/);
  assert.equal(typeof runLook, 'function');
});
