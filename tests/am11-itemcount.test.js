// A list line counts its items (copied from fwdloop v0.37.0, M19 am11 P1, fwd 872e01f3, tests bd563c72): a `~` rule that counts list items, on a line with item fields, is the shape part's own item count
// (minItems / maxItems) on its own [you] row; code's own per-input count on that line is Not checked; the worker is told the count as signed. $0, no AI.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CheckBlock } from '../src/checkblock.js';
import { buildShapes } from '../src/shapebuild.js';
import { shapeRowsOf, shapeCountWords } from '../src/shaperows.js';
import { lineBriefs, rubricStepShapeReds } from '../src/rubricstep.js';
import { createRubric, checkStep } from 'bareguard';
import { shapeItemCheck } from '../src/shaperows.js';

const NR = { max: 128, forbidden: ['.', ':', '[', ']'], reserved: null };
const TEXT = 'Resume of Ada. Skills: python, sql. Resume of Alan. Skills: logic.';
const f = (/** @type {any} */ o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const NOTE = 'your rule on this line sets the item count';
function blockOf(/** @type {string[]} */ rules, /** @type {any[]} */ fields, /** @type {string[]} */ per) {
  const LN = [{ n: 1, text: 'Write one summary per page', rules }];
  const b = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks: false, split: true });
  b.fromJob(LN);
  b.setGuards(['changed-from-seed'], ['output/']);
  b.reconcile();
  b.setShape(buildShapes({ lines: LN, labels: ['page'], suggestions: [{ line: 1, fields, extraFields: [], itemCountFrom: per }], nameRules: NR }));
  b.reconcile();
  const close = b.build();
  const part = close.parts.find((/** @type {any} */ p) => p.class === 'shape');
  return { b, part, close, LN, row: (/** @type {string} */ k) => b.rows.find((r) => r.key === k) };
}
const blurb = f({ name: 'blurb', kind: 'text', bounds: { maxWords: 59 }, fromRule: 1 });

test('am11 item 1: "exactly 4 list items" is the shape part\'s minItems and maxItems 4, on its own [you] row, built, no pick', () => {
  const x = blockOf(['the blurb is under 60 words', 'exactly 4 list items'], [blurb], []);
  assert.ok(x.part, 'the line has a shape part');
  assert.deepEqual([x.part.minItems, x.part.maxItems], [4, 4]);
  assert.deepEqual(x.part.rules, [1, 2]);
  const r = x.row('L1.~2');
  assert.deepEqual([r?.by, r?.kind, r?.from, r?.state], ['you', 'rule', 'rule', 'built']);
  assert.equal(x.close.parts.some((/** @type {any} */ p) => p.class === 'countable' && p.check !== 'cited'), false, 'no pick part');
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [x.part] }, 'trial'), []);
});

test('am11 item 1: "at least 3 list items" is minItems 3 and no maxItems; "at most 5 list items" is maxItems 5 and no minItems', async () => {
  const lo = blockOf(['the blurb is under 60 words', 'at least 3 list items'], [blurb], []);
  assert.equal(lo.part.minItems, 3);
  assert.equal(Object.hasOwn(lo.part, 'maxItems'), false);
  const hi = blockOf(['the blurb is under 60 words', 'at most 5 list items'], [blurb], []);
  assert.equal(hi.part.maxItems, 5);
  assert.equal(Object.hasOwn(hi.part, 'minItems'), false);
  const rubric = createRubric({ schema: 1, goal: 'g', inputs: [], checkpoints: { 1: { gating: false, checks: [shapeItemCheck(hi.part, 'p1')] } } });
  const run = async (/** @type {number} */ n) => (await checkStep(rubric, '1', { results: Array.from({ length: n }, () => ({ blurb: 'ok' })) }, { inputs: {} })).verdict;
  assert.equal(await run(5), 'green');
  assert.equal(await run(6), 'red');
});

test('am11 item 2: a rule\'s count beside code\'s per-input count: the rule is the one count, code\'s own count is Not checked with the signed reason', () => {
  const x = blockOf(['the blurb is under 60 words', 'exactly 4 list items'], [blurb], ['page']);
  assert.deepEqual([x.part.minItems, x.part.maxItems], [4, 4]);
  const def = x.row('L1.$shape');
  assert.equal(def?.state, 'not-checked');
  assert.equal(def?.reason, NOTE);
  assert.equal(x.row('L1.~2')?.state, 'built');
});

test('am11 item 2: with no count rule, code\'s per-input count is checked as it was (default row built, minItems = maxItems = 1)', () => {
  const x = blockOf(['the blurb is under 60 words'], [blurb], ['page']);
  assert.deepEqual([x.part.minItems, x.part.maxItems], [1, 1]);
  assert.equal(x.row('L1.$shape')?.state, 'built');
});

test('am11 (Must-fail 6): a text line with no item fields still counts its text: "exactly 3 list items" stays a pick, not an item count', () => {
  const LN = [{ n: 1, text: 'Write one summary', rules: ['exactly 3 list items'] }];
  const b = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks: false, split: true });
  b.fromJob(LN); b.setGuards(['changed-from-seed'], ['output/']); b.reconcile();
  assert.equal(b.isShapeLine(1), false);
  assert.equal(b.rows.find((r) => r.key === 'L1.~1')?.can?.how, 'pick');
});

test('am11 item 3: the worker is told the count as signed: exactly N items, at least N items, at most N items', () => {
  const fields = [{ name: 'title', spec: { kind: 'text', required: true, minChars: 1 } }];
  const brief = (/** @type {any} */ c) => lineBriefs({ stages: [{ kind: 'rubric-step', params: { step: 2, parts: [{ class: 'shape', text: 't', fields, ...c }] } }] })[0].text;
  assert.match(brief({ minItems: 4, maxItems: 4 }), /One object per item: exactly 4 items\./);
  assert.match(brief({ minItems: 3 }), /One object per item: at least 3 items\./);
  assert.match(brief({ maxItems: 5 }), /One object per item: at most 5 items\./);
  assert.match(brief({}), /one item for every one you find/);
});

test('am11: the signed close reads the count rule as its own [you] row (shapeCountWords), and draws no [default] count row beside it', () => {
  const x = blockOf(['the blurb is under 60 words', 'exactly 4 list items'], [blurb], []);
  assert.equal(shapeCountWords({ minItems: 3 }), 'the answer lists at least 3 items');
  assert.equal(shapeCountWords({ maxItems: 5 }), 'the answer lists at most 5 items');
  const rows = shapeRowsOf({ stages: x.close.stages, list: x.b.rows.map((r) => ({ key: r.key, state: r.state })) }, x.LN);
  assert.deepEqual(rows.filter((r) => r.rule === 2).map((r) => [r.by, r.key, r.text]), [['you', 'L1.~2', 'the answer lists exactly 4 items']]);
  assert.equal(rows.some((r) => r.by === 'default'), false);
});

// ---- am11 P2 (fwd 2295cd22, tests 4a5c81b8): a count red lands on the row of the `~` rule that set the count (rowResultsOf, bareloop's own, with fwd's count-row change)
import { rowResultsOf } from '../src/rowresults.js';
import { buildShapePart } from '../src/shaperows.js';

const P2PART = buildShapePart({ text: 't', fields: [{ name: 'title', spec: { kind: 'text', required: true, minChars: 1 }, rule: 1, by: 'you' }], itemCount: { min: 3, max: 5 }, countRules: [2, 3] });
const P2LIST = [
  { key: 'L1.~1', line: 1, kind: 'rule', rule: 1, by: 'you', state: 'built', part: { line: 1, part: 0 } },
  { key: 'L1.~2', line: 1, kind: 'rule', rule: 2, by: 'you', state: 'built', part: { line: 1, part: 0 } },
  { key: 'L1.~3', line: 1, kind: 'rule', rule: 3, by: 'you', state: 'built', part: { line: 1, part: 0 } },
];
const gap = (/** @type {string} */ kind, /** @type {number} */ measured, /** @type {number} */ limit) => ({ id: 'p1-shape', check: 'itemShape', kind, measured, limit });
const byKey = (/** @type {any} */ r) => Object.fromEntries(r.rows.map((/** @type {any} */ x) => [x.key, x.result]));

test('am11 item 4: one count rule: a count red is on that rule\'s row, and on no field row', () => {
  const part = buildShapePart({ text: 't', fields: [{ name: 'title', spec: { kind: 'text', required: true, minChars: 1 }, rule: 1, by: 'you' }], itemCount: { min: 4, max: 4 }, countRules: [2] });
  const res = rowResultsOf(P2LIST.slice(0, 2), { step: 1, parts: [part] }, { rawGaps: [gap('count-over', 5, 4)], detail: {} });
  assert.deepEqual(byKey(res), { 'L1.~1': 'passed', 'L1.~2': 'failed' });
  assert.deepEqual(res.unclaimed, []);
});

test('am11 item 4: two count rules (at least 3, at most 5): the red lands on the rule whose bound it is (ruleCounts), never on a guessed row', () => {
  const ruleCounts = { 2: { min: 3 }, 3: { max: 5 } };
  const params = { step: 1, parts: [P2PART] };
  assert.deepEqual(byKey(rowResultsOf(P2LIST, params, { rawGaps: [gap('count-under', 2, 3)], detail: {}, ruleCounts })), { 'L1.~1': 'passed', 'L1.~2': 'failed', 'L1.~3': 'passed' });
  assert.deepEqual(byKey(rowResultsOf(P2LIST, params, { rawGaps: [gap('count-over', 6, 5)], detail: {}, ruleCounts })), { 'L1.~1': 'passed', 'L1.~2': 'passed', 'L1.~3': 'failed' });
  const none = rowResultsOf(P2LIST, params, { rawGaps: [gap('count-over', 6, 5)], detail: {} });
  assert.deepEqual(byKey(none), { 'L1.~1': 'passed', 'L1.~2': 'passed', 'L1.~3': 'passed' }, 'no bound known: no row is guessed');
  assert.equal(none.unclaimed.length, 1);
});
