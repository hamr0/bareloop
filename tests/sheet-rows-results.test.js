// S4 item 3: per-row results (src/rowresults.js) for a sheet line: each gap of a sheet check lands on its OWN row, never in the unclaimed list. Real gradeStep (real bareguard checkStep over the
// frozen expenses table), real CheckBlock rows, $0. Reds name rows and counts, never a cell's text (the planted description below must never appear).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tableSha } from 'bareguard';
import { CheckBlock } from '../src/checkblock.js';
import { buildSheetChecks } from '../src/sheetbuild.js';
import { parseCsv, sheetTable } from '../src/csv.js';
import { gradeStep } from '../src/rubricstep.js';
import { rowResultsOf } from '../src/rowresults.js';

const CSV = readFileSync(new URL('./fixtures/sheets/expenses.csv', import.meta.url), 'utf8');
const TABLE = sheetTable(parseCsv(CSV));
const W500 = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const LINE = { n: 1, text: 'List every expense over 500, what they add up to, and flag a repeated date', rule: 'Amount over 500', rules: ['Amount over 500'] };
const SUGG = [
  { line: 1, rule: 'cells', table: 'Expenses', claim: 'over', op: 'rows', where: W500, covers: [1] },
  { line: 1, rule: 'cells', table: 'Expenses', claim: 'n', op: 'countIf', where: [{ column: 'Amount', cmp: 'gt', value: 500 }], covers: [] },
  { line: 1, rule: 'cells', table: 'Expenses', claim: 'small', op: 'rows', where: [{ column: 'Amount', cmp: 'lte', value: 500 }], covers: [] },
];
const cellsOf = (/** @type {string} */ l) => { const out = []; let c = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(c); c = ''; } else c += ch; } out.push(c); return out; };
const rowsOf = (/** @type {(a: number) => boolean} */ f) => CSV.split('\n').filter((l) => l !== '').map(cellsOf).map((c, i) => ({ row: i + 1, a: Number(c[2].replaceAll(',', '')) })).slice(1).filter((d) => f(d.a)).map((d) => d.row);
const BIG = rowsOf((a) => a > 500);
const SMALL = rowsOf((a) => a <= 500);

async function closeOver() {
  const b = new CheckBlock({ texts: { Expenses: CSV }, labels: ['Expenses'], asks: false, split: true });
  b.fromJob([LINE]);
  b.setGuards(['changed-from-seed'], ['output/']);
  b.setSheetLines([1]);
  b.reconcile();
  b.setSheet(await buildSheetChecks({ lines: [LINE], tables: { Expenses: TABLE }, suggestions: SUGG }));
  const v = b.closeView();
  const stage = v.stages.find((/** @type {any} */ s) => s.params.step === 1);
  return { params: stage.params, list: v.list };
}
const grade = (/** @type {any} */ params, /** @type {any} */ claims) => {
  const bytes = JSON.stringify({ text: 'x', claims });
  return gradeStep({ params, bytes, outputBytes: bytes, inputs: {}, tables: { Expenses: TABLE } }, { Expenses: /** @type {string} */ (tableSha(TABLE)) });
};

test('a right answer: every row of the sheet line passes and nothing is unclaimed', async () => {
  const { params, list } = await closeOver();
  const g = await grade(params, { l1r1: { rows: BIG }, l1a2: { rows: SMALL } });
  assert.equal(g.verdict, 'green', JSON.stringify(g.gapLines));
  const r = rowResultsOf(list, params, g);
  assert.deepEqual(r.unclaimed, []);
  assert.ok(r.rows.length >= 3);
  assert.ok(r.rows.every((x) => x.result === 'passed'), JSON.stringify(r.rows));
});

test('a wrong rows claim fails the row that owns that check - the [you] rule row for the rule\'s check, the [agent] row for an agent check - and names the row number, never a cell', async () => {
  const { params, list } = await closeOver();
  const wrongBig = await grade(params, { l1r1: { rows: [...BIG, 2] }, l1a2: { rows: SMALL } });
  assert.equal(wrongBig.verdict, 'red');
  const r1 = rowResultsOf(list, params, wrongBig);
  assert.deepEqual(r1.unclaimed, [], JSON.stringify(r1));
  assert.deepEqual(r1.rows.filter((x) => x.result === 'failed').map((x) => x.key), ['L1.~1']);
  assert.match(String(r1.rows.find((x) => x.key === 'L1.~1')?.why), /\b2\b/);
  assert.equal(JSON.stringify(r1).includes('item 0'), false, 'no cell text');
  const wrongSmall = await grade(params, { l1r1: { rows: BIG }, l1a2: { rows: SMALL.slice(1) } });
  const r2 = rowResultsOf(list, params, wrongSmall);
  assert.deepEqual(r2.unclaimed, []);
  assert.deepEqual(r2.rows.filter((x) => x.result === 'failed').map((x) => x.key), ['L1.sheet.l1a2']);
});

test('claim boxes missing: the line says so once in unclaimed (it names no single row); the file that cannot be read leaves the other rows unread, never passed', async () => {
  const { params, list } = await closeOver();
  const bytes = JSON.stringify({ text: 'x' });
  const g = await gradeStep({ params, bytes, outputBytes: bytes, inputs: {}, tables: { Expenses: TABLE } }, { Expenses: /** @type {string} */ (tableSha(TABLE)) });
  assert.equal(g.verdict, 'red');
  const r = rowResultsOf(list, params, g);
  assert.equal(r.unclaimed.length, 1);
  assert.match(r.unclaimed[0], /claim boxes/);
  const bad = await gradeStep({ params, bytes: null, outputBytes: null, inputs: {}, tables: { Expenses: TABLE } }, { Expenses: /** @type {string} */ (tableSha(TABLE)) });
  const u = rowResultsOf(list, params, { ...bad, rawGaps: [{ id: 'happened', check: 'happened', kind: 'wrong-type' }], detail: { ...bad.detail, why: 'not-object' } });
  assert.ok(u.rows.some((x) => x.result === 'unread'), JSON.stringify(u.rows));
});
