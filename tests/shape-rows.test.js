// Shape jobs, rules first (hamr 2026-11-19, docs/product/ITEM33-BUILD.md "Scope check round 1 FAIL and ruling" and "Facts and shape on one answer: the spec"): the one list holds the shape rows.
// Each `~` rule gets today's truth check first; only a rule that ends with none and no open ask takes the shape field proposed for it; a line can hold facts AND shape; there is no "rules or shape" ask.
// Real CheckBlock, the real shape builder (src/shapebuilder.js is src/shapebuild.js), the real archived cases of tests/fixtures/checkblock/replay-cases.json; $0, no provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock, REASON } from '../src/checkblock.js';
import { buildShapes, NO_BOUND_WHY } from '../src/shapebuild.js';
import { SHAPE_TRUTH_WORDS } from '../src/shaperows.js';
import { questionsOfBlock, applyChoices } from '../src/blockasks.js';
import { cardOfClose, listMatchesClose } from '../src/rubricstep.js';

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

function blockOf(suggest = SUGGEST, { asks = false, lines = LINES, look = /** @type {any[]} */ ([]), texts = { page: TEXT } } = {}) {
  const b = new CheckBlock({ texts, labels: ['page'], asks, split: true });
  b.fromJob(lines);
  b.setGuards(['changed-from-seed'], ['output/']);
  if (look.length) b.addLook(look, []);
  b.reconcile();
  b.setShape(buildShapes({ lines: lines.filter((l) => l.rules.length > 0), labels: ['page'], suggestions: [suggest], nameRules: NR }));
  return b;
}
const row = (/** @type {CheckBlock} */ b, /** @type {string} */ key) => b.rows.find((r) => r.key === key);
const closeOf = (/** @type {CheckBlock} */ b) => { const v = b.closeView(); return { stages: v.stages, list: v.list, picks: v.picks }; };
const parts = (/** @type {CheckBlock} */ b) => b.closeView().stages.flatMap((/** @type {any} */ s) => s.params.parts);

test('a rule no truth check could take takes its shape field: [you] row per rule, [agent] per extra field (job-derived on, no-word Suggested), no [default] row without an item count', () => {
  const b = blockOf();
  assert.equal(b.isShapeLine(1), true);
  assert.equal(b.isShapeLine(2), false);
  assert.deepEqual(b.rows.filter((r) => r.kind === 'rule').map((r) => [r.key, r.by, r.state, r.can?.how]), [['L1.~1', 'you', 'built', 'shape'], ['L1.~2', 'you', 'built', 'shape'], ['L1.~3', 'you', 'built', 'shape']]);
  assert.equal(row(b, 'L1.shape.airline')?.state, 'built', 'a word of the job line: job-derived, on');
  assert.equal(row(b, 'L1.shape.duration')?.state, 'suggested', 'no word of the job: Suggested');
  assert.equal(row(b, 'L1.shape.duration')?.reason, REASON.suggested);
  assert.equal(row(b, 'L1.$shape'), undefined);
  const part = parts(b).find((/** @type {any} */ p) => p.class === 'shape');
  assert.deepEqual(part.fields.map((/** @type {any} */ x) => x.name), ['blurb', 'matching', 'name', 'airline'], 'the Suggested field is held out of the signed shape');
  assert.deepEqual(part.rules, [1, 2, 3]);
});

test('RULES FIRST: a rule with an open truth check (a count pick asked of the person) keeps it and does not take the shape field; the others do; an answer gives the truth check and the shape field stays for the rest', () => {
  const b = blockOf(SUGGEST, { asks: true });
  assert.deepEqual(b.rows.filter((r) => r.kind === 'rule').map((r) => [r.key, r.state, r.can?.how ?? r.can?.ask]), [['L1.~1', 'not-checked', 'check'], ['L1.~2', 'not-checked', 'check'], ['L1.~3', 'built', 'shape']]);
  assert.deepEqual(parts(b).find((/** @type {any} */ p) => p.class === 'shape').fields.map((/** @type {any} */ x) => x.name), ['name', 'airline']);
  const qs = questionsOfBlock(b);
  assert.deepEqual(qs.map((q) => [q.ask, q.counted]), [['check', false], ['check', false]], 'only the truth checks are asked (the shape never asks)');
  assert.deepEqual(applyChoices(b, qs.map((q) => ({ key: q.key, choice: 'agree' }))), []);
  assert.deepEqual(b.rows.filter((r) => r.kind === 'rule').map((r) => [r.state, r.can?.how]), [['built', 'pick'], ['built', 'pick'], ['built', 'shape']]);
  assert.equal(parts(b).filter((/** @type {any} */ p) => p.class === 'countable' && Array.isArray(p.rules)).length, 2);
});

test('FACTS + SHAPE: a rule a look fact checks stays a fact; the rules no truth check took go to the shape part of the same line (parts: fact, then shape); the signed list matches the close', () => {
  const lines = [{ n: 1, text: 'List the flights', rules: ['under $450', 'the flight is nonstop', 'each item has a tag'] }];
  const sg = { line: 1, fields: [f({ name: 'price', kind: 'number', bounds: { lt: 450 }, fromRule: 1 }), f({ name: 'nonstop', kind: 'boolean', bounds: { equals: true }, fromRule: 2 }), f({ name: 'tag', kind: 'text', bounds: { minChars: 1 }, fromRule: 3 })], extraFields: [] };
  const b = blockOf(sg, { lines, texts: { page: 'Flight A\nPrice $410\nFlight B\nPrice $520\n' }, look: [{ line: 1, name: 'price', shape: 'money', words: ['Price'], currency: ['$'], source: 'page', forRule: 1, kind: 'fact', reading: { op: 'lt', value: 450 } }] });
  assert.deepEqual(b.rows.filter((r) => r.kind === 'rule').map((r) => [r.key, r.state, r.can?.how]), [['L1.~1', 'built', 'fact'], ['L1.~2', 'built', 'shape'], ['L1.~3', 'built', 'shape']]);
  assert.deepEqual(parts(b).map((/** @type {any} */ p) => [p.class, (p.facts ?? p.fields).map((/** @type {any} */ x) => x.name)]), [['fact', ['price']], ['shape', ['nonstop', 'tag']]]);
  const prose = b.closeView().list.find((r) => r.kind === 'prose');
  assert.equal(prose?.reason, SHAPE_TRUTH_WORDS, 'the truth of the shape fields is Not checked');
  const v = b.closeView();
  assert.equal(listMatchesClose({ stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }, ...v.stages], list: v.list }).ok, true);
});

test('REAL archived cases (tests/fixtures/checkblock/replay-cases.json): a shape proposed for EVERY rule never replaces a truth check: every rule built in A (no shape) is built the same way in B (shape set)', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/checkblock/replay-cases.json', import.meta.url), 'utf8'));
  const norm = (/** @type {unknown} */ t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const answerer = (/** @type {any} */ c) => (/** @type {any} */ q) => { const h = c.answers.find((/** @type {any} */ a) => a.line === q.line && norm(a.ruleText) === norm(q.ruleText) && a.ask === q.ask); return h ? { choice: h.choice, text: h.text } : null; };
  let checked = 0;
  for (const c of cases) {
    const make = (/** @type {boolean} */ shape) => {
      const b = new CheckBlock({ texts: c.inputs.texts, labels: c.inputs.labels });
      b.fromJob(c.inputs.jobLines);
      b.addLook(c.inputs.lookFacts);
      if (shape) b.setShape(buildShapes({ lines: c.inputs.jobLines.filter((/** @type {any} */ l) => (l.rules ?? []).length), labels: c.inputs.labels, suggestions: c.inputs.jobLines.filter((/** @type {any} */ l) => (l.rules ?? []).length).map((/** @type {any} */ l) => ({ line: l.n, fields: l.rules.map((/** @type {string} */ _r, /** @type {number} */ i) => f({ name: `f${i + 1}`, kind: 'text', fromRule: i + 1 })), extraFields: [] })), nameRules: NR }));
      b.queue.push(...c.deltas.map((/** @type {any} */ d) => ({ ...d, edits: [...d.edits] })));
      b.drive({ answer: answerer(c) });
      b.setGuards(['changed-from-seed'], ['output/']);
      b.reconcile();
      return b;
    };
    const a = make(false);
    const b = make(true);
    for (const r of a.rows.filter((x) => x.kind === 'rule' && x.state === 'built')) {
      const same = b.rows.find((x) => x.key === r.key);
      assert.equal(same?.state, 'built', `${c.id} ${r.key} stays built`);
      assert.equal(same?.can?.how, r.can?.how, `${c.id} ${r.key} keeps its truth check (${r.can?.how})`);
      checked += 1;
    }
    // a case where no rule took a shape field is byte-identical to today's
    if (!b.rows.some((x) => x.kind === 'rule' && x.can?.how === 'shape')) assert.equal(JSON.stringify(closeOf(b)), JSON.stringify(closeOf(a)), `${c.id} is identical to today's`);
  }
  assert.ok(checked >= 10, `${checked} real built rules were compared`);
});

test('a line where no rule took a shape field has no shape rows at all (the extra fields and the [default] row are pruned): the signed list is what it was without a shape', () => {
  const lines = [{ n: 1, text: 'Read each resume and the airline', rules: ['the blurb is under 60 words'] }];
  const sg = { line: 1, fields: [f({ name: 'blurb', kind: 'text', bounds: { maxWords: 59 }, fromRule: 1 })], extraFields: [f({ name: 'airline', kind: 'text', required: false })] };
  const withShape = blockOf(sg, { asks: true, lines });
  const without = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks: true, split: true });
  without.fromJob(lines); without.setGuards(['changed-from-seed'], ['output/']); without.reconcile();
  assert.equal(withShape.rows.some((r) => r.kind === 'shape'), false);
  assert.equal(JSON.stringify(closeOf(withShape)), JSON.stringify(closeOf(without)));
});

test('Drop and Add on an [agent] field cost no AI; a Dropped field is offered under Suggested and can be added back', () => {
  const b = blockOf();
  assert.deepEqual(b.rowChoice('L1.shape.airline', 'drop'), { ok: true });
  assert.equal(row(b, 'L1.shape.airline')?.state, 'suggested');
  assert.equal(row(b, 'L1.shape.airline')?.reason, REASON.dropped);
  assert.ok(b.suggestedView().some((s) => s.key === 'L1.shape.airline' && s.dropped === true));
  assert.ok(!parts(b)[0].fields.some((/** @type {any} */ x) => x.name === 'airline'));
  assert.deepEqual(b.rowChoice('L1.shape.airline', 'add'), { ok: true });
  assert.equal(row(b, 'L1.shape.airline')?.state, 'built');
  assert.deepEqual(b.rowChoice('L1.shape.duration', 'add'), { ok: true });
  assert.ok(parts(b)[0].fields.some((/** @type {any} */ x) => x.name === 'duration'));
});

test('Drop on a rule\'s OWN shape row ([you]): that rule goes Not checked ("You dropped it."), its field leaves the shape; Add is refused (Revise brings it back); the Drop is kept for a Revise by line words and rule number', () => {
  const b = blockOf();
  assert.deepEqual(b.rowChoice('L1.~2', 'drop'), { ok: true });
  assert.equal(row(b, 'L1.~2')?.state, 'not-checked');
  assert.equal(row(b, 'L1.~2')?.reason, REASON.dropped);
  assert.ok(!parts(b)[0].fields.some((/** @type {any} */ x) => x.name === 'matching'));
  assert.deepEqual(parts(b)[0].rules, [1, 3]);
  assert.equal(b.rowChoice('L1.~2', 'add').ok, false);
  assert.match(String(/** @type {any} */ (b.rowChoice('L1.~2', 'add')).why), /Revise/);
  assert.equal(b.rowChoice('L1.~3', 'add').ok, false);
  const rec = b.shapeDroppedRecord();
  assert.deepEqual(rec.map((r) => r.rule), [2]);
  const fresh = blockOf();
  fresh.carryShapeDropped(rec);
  assert.equal(row(fresh, 'L1.~2')?.state, 'not-checked');
  assert.equal(row(fresh, 'L1.~1')?.state, 'built');
  // dropping the last shape rule of the line takes the line's shape rows with it
  for (const k of ['L1.~1', 'L1.~3']) b.rowChoice(k, 'drop');
  assert.equal(b.rows.some((r) => r.kind === 'shape'), false);
  assert.equal(parts(b).some((/** @type {any} */ p) => p.class === 'shape'), false);
});

test('a Drop of an [agent] field survives the shape being built again (a later try) and rides the record to a Revise', () => {
  const b = blockOf();
  b.rowChoice('L1.shape.airline', 'drop');
  const rec = b.shapeDroppedRecord();
  assert.deepEqual(rec.filter((r) => r.name).map((r) => r.name), ['airline']);
  b.setShape(buildShapes({ lines: [LINES[0]], labels: ['page'], suggestions: [SUGGEST], nameRules: NR }));
  assert.equal(row(b, 'L1.shape.airline')?.choice, 'drop');
  const fresh = blockOf();
  fresh.carryShapeDropped(rec);
  assert.equal(row(fresh, 'L1.shape.airline')?.state, 'suggested');
  assert.deepEqual(fresh.choicesRecord(), [], 'the shape\'s choices ride their own record, not the facts record');
});

test('a row edit about a facts+shape line is judged like any other (no shape-line refusal), and the card lists each rule once with the truth of the items Not checked', () => {
  const b = blockOf();
  const res = b.applyDelta({ edits: [{ op: 'add', line: 1, kind: 'phrase', words: ['python'] }] }).edits[0];
  assert.notEqual(res.refusedBecause, 'this line is checked as a list of items with fields, so a row edit about it is not used');
  const c = closeOf(b);
  const card = cardOfClose({ closeDecl: c, jobLines: LINES });
  assert.ok(card.notChecked.some((t) => t.includes(SHAPE_TRUTH_WORDS)));
  assert.deepEqual(card.checkItems.filter((i) => i.fromLine[0] === 1 && i.by === 'you').map((i) => i.key), ['L1.~1', 'L1.~2', 'L1.~3']);
});

test('the shape rows are tagged: the card items carry the shape flag the page turns into [shape]', () => {
  const b = blockOf();
  const card = cardOfClose({ closeDecl: closeOf(b), jobLines: LINES });
  assert.ok(card.checkItems.filter((i) => ['L1.~1', 'L1.~2', 'L1.~3', 'L1.shape.airline'].includes(String(i.key))).every((i) => /** @type {any} */ (i).shape === true));
});

test('the Drop record round-trips through the picks record file (a Revise reads it), beside the sheet\'s; a malformed entry is not read', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { writeRecordPart, readShapeDropped, readSheetDropped } = await import('../src/pickrecord.js');
  const d = mkdtempSync(join(tmpdir(), 'shape-rec-'));
  try {
    const b = blockOf();
    b.rowChoice('L1.shape.airline', 'drop');
    b.rowChoice('L1.~2', 'drop');
    const file = join(d, 'record.json');
    assert.equal(readShapeDropped(file), null);
    writeRecordPart(file, { sheetDropped: [], shapeDropped: b.shapeDroppedRecord() });
    assert.deepEqual(readShapeDropped(file), b.shapeDroppedRecord());
    assert.deepEqual(readSheetDropped(file), []);
    writeRecordPart(file, { shapeDropped: [{ lineWords: 1, occurrence: 'x', name: 3 }, { lineWords: 'a', occurrence: 0, name: 'airline' }, { lineWords: 'a', occurrence: 0, rule: 2 }] });
    assert.deepEqual(readShapeDropped(file), [{ lineWords: 'a', occurrence: 0, name: 'airline' }, { lineWords: 'a', occurrence: 0, rule: 2 }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a block with no shape is exactly what it was (no shape row, no shape line)', () => {
  const b = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks: false, split: true });
  b.fromJob(LINES);
  b.reconcile();
  assert.equal(b.rows.some((r) => r.kind === 'shape'), false);
  assert.equal(b.isShapeLine(1), false);
});

test('REAL flight-nononstop1 raw shape (scope round 2): a rule code marks negating ("not a red-eye", "no nonstop") never takes a shape field; the plain rule keeps its field', () => {
  const RAW = JSON.parse(readFileSync(new URL('./fixtures/shape-scope/round2-raw-shapes.json', import.meta.url), 'utf8')).nonstop;
  const lines = [{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: ['under $450', 'not a red-eye', 'no nonstop'] }];
  const b = blockOf(RAW.rawShape[0], { lines });
  const rule = (/** @type {number} */ n) => b.rows.find((r) => r.kind === 'rule' && r.rule === n);
  assert.equal(b.takesShape(/** @type {any} */ (rule(2))), null, 'not a red-eye stays with the person');
  assert.equal(b.takesShape(/** @type {any} */ (rule(3))), null, 'no nonstop must not become nonstop equals false');
  assert.deepEqual(b.shapeCandidates().map((x) => x.rule).filter((n) => n > 1), [], 'a negating rule is never asked of the shape look');
});

// shape-scope round 3 (real raw answer, tests/fixtures/shape-scope/round3-tracker.json): the AI gave `title` required with NO minChars; code refuses the bound-less field and the row must SAY so (NO_BOUND_WHY), not the truth check's generic "No rule can check this"
test('a rule whose picked field has no limit shows NO_BOUND_WHY, not the generic noRule reason (round 3 tracker)', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/shape-scope/round3-tracker.json', import.meta.url), 'utf8'));
  const lines = fx.jobLines;
  const b = new CheckBlock({ texts: { tracker: 'x' }, labels: ['tracker'], asks: false, split: true });
  b.fromJob(lines);
  b.setGuards(['changed-from-seed'], ['output/']);
  b.reconcile();
  b.setShape(buildShapes({ lines, labels: ['tracker'], suggestions: JSON.parse(fx.rawShape).shapes, nameRules: NR }));
  b.reconcile();
  const r1 = row(b, 'L1.~1');
  assert.equal(r1?.state, 'not-checked');
  assert.equal(r1?.can?.why, NO_BOUND_WHY);
  assert.notEqual(r1?.can?.why, REASON.noRule);
  assert.equal(row(b, 'L1.~3')?.can?.how, 'shape', 'the rule with a real bound still takes its field');
});
