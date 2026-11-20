// REVIEW THE CODE, clean build (hamr 3A: for EVERY shape look, files jobs and repo reviews alike, through the same path; hamr 1A: no code word lists for intent): "at least N" gives `minItems N` with NO `maxItems` ONLY when the shape look (the AI) pointed at that ~ rule (`countFromRule`) and no field holds it;
// code checks the number is digits in the rule's own words. No pointing = no count from code. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildShapeLine } from '../src/shapebuild.js';
import { buildShapePart, shapeDefaultWords, shapeItemCheck, shapeRowsOf } from '../src/shaperows.js';
import { rubricStepShapeReds, lineBriefs } from '../src/rubricstep.js';
import { createRubric, checkStep } from 'bareguard';

const NR = { max: 128, forbidden: ['.', ':', '[', ']'], reserved: ['missing', 'wrong-type', 'wrong-value'] };
const f = (o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const LINE = { n: 1, text: 'List the issues', rules: ['each item has a title', 'at least 3 items'] };
const SUGG = { fields: [f({ name: 'title', kind: 'text', bounds: { minChars: 1 }, fromRule: 1 })], extraFields: [], itemCountFrom: [], countFromRule: 2 };

test('"at least N" in the rule the AI pointed at (no field holds it) is the count floor: itemCount {n, atLeast}, which signs minItems N and no maxItems', () => {
  const r = buildShapeLine({ line: LINE, labels: ['repo'], suggestion: SUGG, nameRules: NR });
  assert.deepEqual(r.itemCount, { labels: [], n: 3, atLeast: true, rule: 2 });
  const part = buildShapePart({ text: 't', fields: [{ name: 'title', spec: { kind: 'text', required: true, minChars: 1 }, rule: 1, by: 'you' }], itemCount: r.itemCount });
  assert.equal(part.minItems, 3);
  assert.equal(Object.hasOwn(part, 'maxItems'), false, 'no ceiling was asked for');
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [part] }, 'x'), []);
  assert.equal(shapeDefaultWords({ min: part.minItems, max: part.maxItems }), 'the answer lists at least 3 items');
  assert.deepEqual(shapeRowsOf({ stages: [{ kind: 'rubric-step', params: { step: 1, parts: [part] } }] }, [LINE]).filter((x) => x.by === 'default').map((x) => x.text), ['the answer lists at least 3 items']);
  assert.match(lineBriefs({ stages: [{ kind: 'rubric-step', params: { step: 1, parts: [part] } }] })[0].text, /at least 3 items, one for every one you find/);
});

test('bareguard enforces it: 2 items is red, 3 and 10 are green (no ceiling)', async () => {
  const part = buildShapePart({ text: 't', fields: [{ name: 'title', spec: { kind: 'text', required: true, minChars: 1 }, rule: 1, by: 'you' }], itemCount: { n: 3, atLeast: true } });
  const rubric = createRubric({ schema: 1, goal: 'g', inputs: [], checkpoints: { 1: { gating: false, checks: [shapeItemCheck(part, 'p1')] } } });
  const items = (n) => ({ results: Array.from({ length: n }, (_, i) => ({ title: `t${i}` })) });
  assert.equal((await checkStep(rubric, '1', items(2), { inputs: {} })).verdict, 'red');
  assert.equal((await checkStep(rubric, '1', items(3), { inputs: {} })).verdict, 'green');
  assert.equal((await checkStep(rubric, '1', items(10), { inputs: {} })).verdict, 'green');
});

test('what it is NOT: no pointing = no count (even "at least 3 issues"); a rule the look mapped onto a text field is that field\'s; no digits = refused; "per" counts are unchanged', () => {
  const noPoint = buildShapeLine({ line: { n: 1, text: 'x', rules: ['each item has a title', 'at least 3 issues'] }, labels: [], suggestion: { ...SUGG, countFromRule: null }, nameRules: NR });
  assert.equal(noPoint.itemCount, null, 'the AI did not point at the rule: code does not read words for intent');
  const absent = buildShapeLine({ line: { n: 1, text: 'x', rules: ['each item has a title', 'at least 3 issues'] }, labels: [], suggestion: { fields: SUGG.fields, extraFields: [], itemCountFrom: [] }, nameRules: NR });
  assert.equal(absent.itemCount, null);
  const held = buildShapeLine({ line: { n: 1, text: 'x', rules: ['the summary has at least 20 words'] }, labels: [], suggestion: { fields: [f({ name: 'summary', kind: 'text', bounds: { minWords: 20 }, fromRule: 1 })], extraFields: [], itemCountFrom: [], countFromRule: 1 }, nameRules: NR });
  assert.equal(held.itemCount, null, 'pointed at, but a text field holds that rule: no minItems');
  assert.equal(held.fields[0].bounds.minWords, 20);
  const digits = buildShapeLine({ line: { n: 1, text: 'x', rules: ['each item has a title', 'at least three issues'] }, labels: [], suggestion: SUGG, nameRules: NR });
  assert.equal(digits.itemCount, null);
  assert.ok(digits.refused.some((x) => x.helper === 'itemCount' && /gives no "at least <number>"/.test(x.why)));
  const per = buildShapeLine({ line: { n: 1, text: 'one blurb per resume', rules: ['each item has a title'] }, labels: ['resume-1', 'resume-2'], suggestion: { ...SUGG, itemCountFrom: ['resume-1', 'resume-2'], countFromRule: null }, nameRules: NR });
  assert.deepEqual(per.itemCount, { labels: ['resume-1', 'resume-2'], n: 2 });
  assert.equal(buildShapePart({ text: 't', fields: [{ name: 'title', spec: { kind: 'text' }, rule: 1, by: 'you' }], itemCount: per.itemCount }).maxItems, 2);
});

test('the look is told about countFromRule and its answer may carry it (a non-integer is malformed)', async () => {
  const { shapeLookPrompt, parseShapeAnswer } = await import('../src/shapelook.js');
  const p = shapeLookPrompt({ jobLines: [LINE], lineNums: [1], texts: {} });
  assert.match(p, /"countFromRule": the number of the ~ rule on the line that says how FEW items/);
  assert.equal(parseShapeAnswer(JSON.stringify({ shapes: [{ line: 1, countFromRule: 2 }] })).ok, true);
  assert.equal(parseShapeAnswer(JSON.stringify({ shapes: [{ line: 1, countFromRule: 'two' }] })).ok, false);
});

test('through the check block for a FILES job: the pointed rule is Checked on its own row, the floor rides the signed part (minItems, no maxItems) and the `[default]` count row says it', async () => {
  const { CheckBlock } = await import('../src/checkblock.js');
  const { buildShapes } = await import('../src/shapebuild.js');
  const b = new CheckBlock({ texts: { Notes: 'x' }, labels: ['Notes'], asks: false, split: true });
  b.fromJob([JSON.parse(JSON.stringify({ ...LINE, rule: LINE.rules.join('; ') }))]); b.setGuards([], ['output/']); b.reconcile();
  b.setShape(buildShapes({ lines: [LINE], labels: ['Notes'], suggestions: [{ line: 1, ...SUGG }] })); b.reconcile();
  assert.deepEqual(b.rows.filter((r) => r.kind === 'rule').map((r) => [r.rule, r.state]), [[1, 'built'], [2, 'built']]);
  const part = b.build().stages[0].params.parts.find((p) => p.class === 'shape');
  assert.equal(part.minItems, 3);
  assert.equal(Object.hasOwn(part, 'maxItems'), false);
  assert.deepEqual(part.rules, [1, 2]);
  assert.ok(b.rows.some((r) => r.key === 'L1.$shape'));
});
