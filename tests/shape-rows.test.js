// Shape jobs (itemShape), clause 4 "Rows" and clause 3 "Ask": the one list holds the shape rows. Real CheckBlock and the real shape builder (src/shapebuild.js) on fixtures written here; $0, no provider, no bareguard itemShape
// (the part is built from the pure fields: validating it with bareguard is clause 5). Drop and Add are row edits on the block and call no AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock, REASON } from '../src/checkblock.js';
import { buildShapes } from '../src/shapebuild.js';
import { SHAPE_TRUTH_WORDS } from '../src/shaperows.js';
import { questionsOfBlock, applyChoices } from '../src/blockasks.js';
import { cardOfClose } from '../src/rubricstep.js';

const NR = { max: 128, forbidden: ['.', ':', '[', ']'], reserved: null };
const TEXT = 'Resume of Ada. Skills: python, sql. Resume of Alan. Skills: logic.';
const LINES = [
  { n: 1, text: 'Read each resume against the job description and the airline', rules: ['the blurb is under 60 words', 'matching words is a list of at most 5 words', 'the candidate has a name'] },
  { n: 2, text: 'Find the lowest price', rules: [] },
];
const f = (/** @type {any} */ o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const SUGGEST = {
  line: 1,
  fields: [
    f({ name: 'blurb', kind: 'text', bounds: { maxWords: 59 }, fromRule: 1 }),
    f({ name: 'matching', kind: 'list', bounds: { of: 'text', maxEntries: 5 }, fromRule: 2 }),
    f({ name: 'name', kind: 'text', bounds: { minChars: 1 }, fromRule: 3 }),
  ],
  extraFields: [f({ name: 'airline', kind: 'text', required: false }), f({ name: 'duration', kind: 'text', required: false })],
  itemCountFrom: null,
};

function blockOf(suggest = SUGGEST, { asks = true } = {}) {
  const b = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks, split: true });
  b.fromJob(LINES);
  b.setGuards(['changed-from-seed'], ['output/']);
  b.reconcile();
  b.setShape(buildShapes({ lines: [LINES[0]], labels: ['page'], suggestions: [suggest], nameRules: NR }));
  return b;
}
const row = (/** @type {CheckBlock} */ b, /** @type {string} */ key) => b.rows.find((r) => r.key === key);
const closeOf = (/** @type {CheckBlock} */ b) => { const v = b.closeView(); return { stages: v.stages, list: v.list, picks: v.picks }; };

test('rows: [you] per ~ field rule (the rule\'s own row), [agent] per extra field, one [default]; job-derived on, no-word Suggested', () => {
  const b = blockOf();
  assert.equal(b.isShapeLine(1), true);
  assert.equal(b.isShapeLine(2), false);
  assert.deepEqual(b.rows.filter((r) => r.kind === 'rule').map((r) => [r.key, r.by, r.state]), [['L1.~1', 'you', 'built'], ['L1.~2', 'you', 'built'], ['L1.~3', 'you', 'built']]);
  assert.equal(row(b, 'L1.shape.airline')?.state, 'built', 'a word of the job line: job-derived, on');
  assert.equal(row(b, 'L1.shape.airline')?.by, 'agent');
  assert.equal(row(b, 'L1.shape.duration')?.state, 'suggested', 'no word of the job: Suggested');
  assert.equal(row(b, 'L1.shape.duration')?.reason, REASON.suggested);
  assert.equal(row(b, 'L1.$shape')?.state, 'built');
  const part = b.closeView().stages[0].params.parts.find((/** @type {any} */ p) => p.class === 'shape');
  assert.deepEqual(part.fields.map((/** @type {any} */ x) => x.name), ['blurb', 'matching', 'name', 'airline'], 'the Suggested field is held out of the signed shape');
  assert.deepEqual(part.rules, [1, 2, 3]);
});

test('Drop and Add on an [agent] field cost no AI; a [you] row cannot be dropped; a Dropped field is offered under Suggested and can be added back', () => {
  const b = blockOf();
  assert.deepEqual(b.rowChoice('L1.shape.airline', 'drop'), { ok: true });
  assert.equal(row(b, 'L1.shape.airline')?.state, 'suggested');
  assert.equal(row(b, 'L1.shape.airline')?.reason, REASON.dropped);
  assert.ok(b.suggestedView().some((s) => s.key === 'L1.shape.airline' && s.dropped === true));
  assert.ok(!b.closeView().stages[0].params.parts[0].fields.some((/** @type {any} */ x) => x.name === 'airline'));
  assert.deepEqual(b.rowChoice('L1.shape.airline', 'add'), { ok: true });
  assert.equal(row(b, 'L1.shape.airline')?.state, 'built');
  assert.deepEqual(b.rowChoice('L1.shape.duration', 'add'), { ok: true });
  assert.ok(b.closeView().stages[0].params.parts[0].fields.some((/** @type {any} */ x) => x.name === 'duration'));
  assert.equal(b.rowChoice('L1.~1', 'drop').ok, false);
  assert.match(String(/** @type {any} */ (b.rowChoice('L1.~1', 'drop')).why), /comes from a rule you wrote/);
  assert.equal(b.rowChoice('L1.$shape', 'drop').ok, false, 'the default row stays');
});

test('a Drop survives the shape being built again (a later try), by line and name; the record carries it to a Revise', () => {
  const b = blockOf();
  b.rowChoice('L1.shape.airline', 'drop');
  const rec = b.shapeDroppedRecord();
  assert.deepEqual(rec.map((r) => r.name), ['airline']);
  b.setShape(buildShapes({ lines: [LINES[0]], labels: ['page'], suggestions: [SUGGEST], nameRules: NR }));
  assert.equal(row(b, 'L1.shape.airline')?.choice, 'drop');
  const fresh = blockOf();
  fresh.carryShapeDropped(rec);
  assert.equal(row(fresh, 'L1.shape.airline')?.state, 'suggested');
  assert.equal(row(fresh, 'L1.shape.airline')?.keptFromLast, true);
  assert.deepEqual(fresh.choicesRecord(), [], 'the shape\'s choices ride their own record, not the facts record');
});

test('line-class exclusion: a page fact on a shape line is Not checked; no cited default; a row edit about the line is refused; the other line is unaffected', () => {
  const b = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks: false, split: true });
  b.fromJob(LINES);
  b.addLook([{ line: 1, name: 'price', shape: 'money', words: ['python'], source: 'page', kind: 'fact' }], []);
  b.reconcile();
  b.setShape(buildShapes({ lines: [LINES[0]], labels: ['page'], suggestions: [SUGGEST], nameRules: NR }));
  const facts = b.rows.filter((r) => r.line === 1 && (r.kind === 'fact' || r.kind === 'phrase'));
  for (const r of facts) { assert.equal(r.state === 'not-checked' || r.state === 'suggested' || r.state === 'dropped', true); }
  assert.equal(b.rows.some((r) => r.line === 1 && r.kind === 'cited'), false, 'a shape line quotes nothing');
  assert.equal(b.applyDelta({ edits: [{ op: 'add', line: 1, kind: 'phrase', words: ['python'] }] }).edits[0].refusedBecause, REASON.shapeLine);
  assert.equal(b.rows.some((r) => r.line === 2 && r.kind === 'cited'), true, 'a facts line keeps its defaults');
});

test('the truth of the items is Not checked on the card, in plain words; the card lists each field once', () => {
  const b = blockOf();
  const c = closeOf(b);
  const prose = c.list.find((r) => r.kind === 'prose' && r.line === 1);
  assert.equal(prose?.state, 'not-checked');
  assert.equal(prose?.reason, SHAPE_TRUTH_WORDS);
  const card = cardOfClose({ closeDecl: { ...c, stages: c.stages }, jobLines: LINES });
  assert.ok(card.notChecked.some((t) => t.includes(SHAPE_TRUTH_WORDS)));
  assert.deepEqual(card.checkItems.filter((i) => i.fromLine[0] === 1).map((i) => i.key), ['L1.~1', 'L1.~2', 'L1.~3', 'L1.shape.airline', 'L1.$shape', 'L1.$floor']);
});

test('a rule no field holds is Not checked with its reason; a line left with no [you] field is no shape line', () => {
  const b = blockOf({ line: 1, fields: [f({ name: 'blurb', kind: 'text', bounds: { maxWords: 59 }, fromRule: 1 })] });
  assert.equal(row(b, 'L1.~2')?.state, 'not-checked');
  assert.match(String(row(b, 'L1.~2')?.reason), /No field was picked/);
  const none = blockOf({ line: 1, fields: [f({ name: 'blurb', kind: 'enum', fromRule: 1 })] });
  assert.equal(none.isShapeLine(1), false, 'the build refused the only field: the rules go the usual way');
  assert.equal(none.rows.some((r) => r.kind === 'shape'), false);
});

test('clause 3: "rules or shape could both fit" is ONE counted reading-style ask; Agree keeps the shape; Drop it leaves that rule and its field Not checked', () => {
  const b = blockOf({ ...SUGGEST, alsoFitsRules: true });
  const qs = questionsOfBlock(b);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].ask, 'reading');
  assert.equal(qs[0].counted, true, 'costs one of the 3 asks');
  assert.equal(qs[0].line, 1);
  assert.match(qs[0].question, /^Line 1: .* list of items with the fields blurb, matching, name/);
  assert.equal(row(b, 'L1.~1')?.state, 'not-checked', 'waiting for the answer');
  assert.deepEqual(applyChoices(b, [{ key: qs[0].key, choice: 'agree' }]), []);
  assert.equal(questionsOfBlock(b).length, 0);
  assert.equal(row(b, 'L1.~1')?.state, 'built');
  assert.equal(row(b, 'L1.~1')?.text, 'the blurb is under 60 words', 'the rule\'s own words are untouched by Agree');

  const d = blockOf({ ...SUGGEST, alsoFitsRules: true });
  applyChoices(d, [{ key: questionsOfBlock(d)[0].key, choice: 'drop' }]);
  assert.equal(row(d, 'L1.~1')?.state, 'not-checked');
  assert.equal(row(d, 'L1.~1')?.reason, REASON.left);
  assert.ok(!d.closeView().stages[0].params.parts[0].fields.some((/** @type {any} */ x) => x.name === 'blurb'));
  assert.equal(row(d, 'L1.~2')?.state, 'built');
});

test('no ask when the AI did not say both fit, or when nobody can be asked', () => {
  assert.equal(questionsOfBlock(blockOf()).length, 0);
  assert.equal(questionsOfBlock(blockOf({ ...SUGGEST, alsoFitsRules: true }, { asks: false })).length, 0);
});

test('a block with no shape is exactly what it was (no shape row, no shape line)', () => {
  const b = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks: false, split: true });
  b.fromJob(LINES);
  b.reconcile();
  assert.equal(b.rows.some((r) => r.kind === 'shape'), false);
  assert.equal(b.isShapeLine(1), false);
});

test('the Drop record round-trips through the picks record file (a Revise reads it), beside the sheet\'s', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { writeRecordPart, readShapeDropped, readSheetDropped } = await import('../src/pickrecord.js');
  const d = mkdtempSync(join(tmpdir(), 'shape-rec-'));
  try {
    const b = blockOf();
    b.rowChoice('L1.shape.airline', 'drop');
    const file = join(d, 'record.json');
    assert.equal(readShapeDropped(file), null, 'no record, no entries');
    writeRecordPart(file, { sheetDropped: [], shapeDropped: b.shapeDroppedRecord() });
    assert.deepEqual(readShapeDropped(file), b.shapeDroppedRecord());
    assert.deepEqual(readSheetDropped(file), []);
    writeRecordPart(file, { shapeDropped: [{ lineWords: 1, occurrence: 'x', name: 3 }, { lineWords: 'a', occurrence: 0, name: 'airline' }] });
    assert.deepEqual(readShapeDropped(file), [{ lineWords: 'a', occurrence: 0, name: 'airline' }], 'a malformed entry is not read');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
