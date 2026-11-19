// A row the person dropped (a `~` rule's own shape row, "You dropped it.") gets an Add back button (live walk, research-5): the inverse of the Drop, $0, same row edit, no new store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock, REASON } from '../src/checkblock.js';
import { buildShapes } from '../src/shapebuild.js';
import { planFromConfirm } from '../src/panel/jobplan.js';
import { readFileSync } from 'node:fs';

const NR = { max: 128, forbidden: ['.', ':', '[', ']'], reserved: null };
const TEXT = 'Resume of Ada. Skills: python, sql. Resume of Alan. Skills: logic.';
const LINES = [{ n: 1, text: 'Read each resume against the job description', rules: ['the blurb is under 60 words', 'matching words is a list of at most 5 words', 'the candidate has a name'] }];
const f = (/** @type {any} */ o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const SUGGEST = { line: 1, fields: [
  f({ name: 'blurb', kind: 'text', bounds: { maxWords: 59 }, fromRule: 1 }),
  f({ name: 'matching', kind: 'list', bounds: { of: 'text', maxEntries: 5 }, fromRule: 2 }),
  f({ name: 'name', kind: 'text', bounds: { minChars: 1 }, fromRule: 3 }),
], extraFields: [], itemCountFrom: null };
function blockOf() {
  const b = new CheckBlock({ texts: { page: TEXT }, labels: ['page'], asks: false, split: true });
  b.fromJob(LINES); b.setGuards(['changed-from-seed'], ['output/']); b.reconcile();
  b.setShape(buildShapes({ lines: LINES, labels: ['page'], suggestions: [SUGGEST], nameRules: NR }));
  return b;
}
const row = (/** @type {CheckBlock} */ b, /** @type {string} */ k) => b.rows.find((r) => r.key === k);
const fieldNames = (/** @type {CheckBlock} */ b) => b.rows.filter((r) => r.kind === 'shape').map((r) => r.key).sort();

test('Drop then Add back returns the [you] shape row to Checked exactly as before, and the drop leaves the record', () => {
  const b = blockOf();
  const before = JSON.stringify({ r: row(b, 'L1.~2'), f: fieldNames(b) });
  assert.deepEqual(b.rowChoice('L1.~2', 'drop'), { ok: true });
  assert.equal(row(b, 'L1.~2')?.reason, REASON.dropped);
  assert.deepEqual(b.droppedRulesView().map((x) => x.key), ['L1.~2']);
  assert.deepEqual(b.rowChoice('L1.~2', 'add'), { ok: true });
  assert.equal(row(b, 'L1.~2')?.state, 'built');
  assert.equal(JSON.stringify({ r: row(b, 'L1.~2'), f: fieldNames(b) }), before);
  assert.deepEqual(b.shapeDroppedRecord(), []);
  assert.deepEqual(b.droppedRulesView(), []);
});

test('a Revise after Add back does not re-drop it; a Revise after a plain Drop still does', () => {
  const b = blockOf();
  b.rowChoice('L1.~2', 'drop');
  const kept = b.shapeDroppedRecord();
  b.rowChoice('L1.~2', 'add');
  const fresh = blockOf();
  fresh.carryShapeDropped(b.shapeDroppedRecord());
  assert.equal(row(fresh, 'L1.~2')?.state, 'built');
  const still = blockOf();
  still.carryShapeDropped(kept);
  assert.equal(row(still, 'L1.~2')?.state, 'not-checked');
});

test('Add back exists only on a person-dropped row: a rule not dropped is refused, and the plan card marks only the dropped one', () => {
  const b = blockOf();
  assert.equal(b.rowChoice('L1.~3', 'add').ok, false);
  assert.deepEqual(b.droppedRulesView(), []);
  b.rowChoice('L1.~2', 'drop');
  const view = b.droppedRulesView();
  assert.equal(view.length, 1);
  const plan = planFromConfirm(LINES.map((l) => ({ n: l.n, text: l.text, rule: l.rules.join('; '), rules: l.rules })), {
    checkItems: [], notChecked: [`line 1: "${view[0].text}" — ${REASON.dropped}`, 'line 1: "the candidate has a name" — something else'], editable: true, restorable: view,
  });
  const marked = (plan.ncRows ?? []).filter((r) => r.addBack !== undefined);
  assert.deepEqual(marked.map((r) => r.addBack), ['L1.~2']);
  const none = planFromConfirm(LINES.map((l) => ({ n: l.n, text: l.text, rule: l.rules.join('; '), rules: l.rules })), { checkItems: [], notChecked: [`line 1: "${view[0].text}" — ${REASON.dropped}`] });
  assert.ok((none.ncRows ?? []).every((r) => r.addBack === undefined), 'a card with no restorable list (Audit, readout, signed Job tab) has no Add back');
});

test('the panel page draws "Add back" only through the confirm card control (ctl), never in the read-only drawing', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.match(html, /right: ctl && r\.addBack \? ctl\("add", r\.addBack, "Add back"\)/);
  assert.equal((html.match(/Add back/g) ?? []).length, 1);
});
