// S2: the ONE builder of the sheet checks of a line (ported from fwdloop v0.35.0 test/m17-p4-sheet-build and test/m17-am7-table-row, plus test/m10b-sheet-checks' forced cases, F194).
// The AI only sends typed suggestions; code refuses or builds every one on bareguard and names every check itself. Fake data only: tests/fixtures/sheets/aging.csv, $0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, sheetTable } from '../src/csv.js';
import { buildSheetLine, buildSheetChecks, toSuggestion, NO_VALUE_WHY } from '../src/sheetbuild.js';
import { columnRuleWords } from '../src/sheetlook.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLES = { aging: sheetTable(parseCsv(readFileSync(join(HERE, 'fixtures', 'sheets', 'aging.csv'), 'utf8'))) };
const GUARD = 'every invoice appears exactly once, all 8 of them; flag amounts over 500';
const LINE = { n: 2, text: 'Put each invoice in its overdue bucket as of 2026-10-11', rule: GUARD, rules: GUARD.split('; ') };
const ROWS = { id: 'x', rule: 'cells', table: 'aging', claim: 'x', op: 'rows', where: [{ column: 'Amount', cmp: 'gt', value: 500 }] };
const COUNT = { rule: 'cells', table: 'aging', claim: 'c', op: 'countIf', where: [{ column: 'Amount', cmp: 'gt', value: 500 }] };
const NODUP = { id: 'nodup', rule: 'table', table: 'aging', op: 'noDuplicates', column: 'Invoice #' };
const ROWCOUNT = { rule: 'table', table: 'aging', op: 'rowCount', n: 8, covers: [1] };
const OVER = { rule: 'cells', table: 'aging', claim: 'over', op: 'rows', where: [{ column: 'Amount', cmp: 'gt', value: 500 }], covers: [2] };
const build = (/** @type {any[]} */ suggestions, tables = TABLES) => buildSheetLine({ line: LINE, tables, suggestions });
const LINE1 = { n: 2, text: 'Put each invoice in its overdue bucket as of 2026-10-11', rule: 'every invoice appears exactly once; flag amounts over 500', rules: ['every invoice appears exactly once', 'flag amounts over 500'] };
const build1 = (/** @type {any[]} */ suggestions, tables = TABLES) => buildSheetLine({ line: LINE1, tables, suggestions });

// DONE WHEN (spec S2): on aging.csv a scripted reply of 4 suggestions builds 4 checks with code ids; each forced bad suggestion is refused with a reason naming the helper.
test('DONE WHEN: four suggestions on aging.csv build four checks with code ids', async () => {
  const r = await build([ROWCOUNT, OVER, NODUP, { ...COUNT, covers: [] }]);
  assert.equal(r.checks.length, 4);
  assert.equal(r.refused.length, 0);
  assert.deepEqual(r.checks.map((c) => c.id), ['l2r2', 'l2a1', 'l2a2', 'l2a3'], 'the cells check on rule 2 is its rule row; the others are [agent] rows, answer checks first, then in the order sent');
  assert.deepEqual(r.checks.filter((c) => c.rule === 'cells').map((c) => c.claim), ['l2r2', 'l2a1'], 'the claim is the id');
});

test('each forced bad suggestion is refused with a reason naming the helper; its rule is Not checked with that reason', async () => {
  const dup = { aging: sheetTable(parseCsv('Invoice #,Customer,Due date,Amount\nINV-1,A,2026-01-01,5\nINV-2,A,2026-01-02,6\n')) };
  const cases = /** @type {[any, string, any][]} */ ([
    [{ rule: 'cells', table: 'aging', op: 'nope', covers: [2] }, 'vocabulary', TABLES],
    [{ ...ROWS, table: 'elsewhere', covers: [2] }, 'tables', TABLES],
    [{ ...ROWS, bogusField: 1, covers: [2] }, 'schema', TABLES],
    [{ ...ROWS, where: [{ column: 'Price', cmp: 'gt', value: 500 }], covers: [2] }, 'columnAt', TABLES],
    [{ ...ROWS, where: [{ column: 'Amount', cmp: 'gt', value: 777 }], covers: [2] }, 'groundedLiterals', TABLES],
    [{ rule: 'table', table: 'aging', op: 'noDuplicates', column: 'Customer', covers: [2] }, 'runTableChecks', dup],
  ]);
  for (const [s, helper, tables] of cases) {
    const r = await build1([s], tables);
    assert.equal(r.checks.length, 0, helper);
    assert.equal(r.refused[0].helper, helper, JSON.stringify(r.refused));
    assert.equal(r.rows[1].state, 'not-checked');
    assert.ok(/** @type {string} */ (r.rows[1].reason).startsWith(`suggestion refused: ${helper}:`), String(r.rows[1].reason));
  }
});

test('a number not in the person\'s words is refused (F194), a date not in their words too; one that is, builds', async () => {
  const r = await build1([{ ...ROWS, where: [{ column: 'Amount', cmp: 'gt', value: 9999 }], covers: [2] }]);
  assert.match(r.refused[0].why, /number 9999 .* is not in your words/);
  const d = await build1([{ ...ROWS, where: [{ column: 'Due date', cmp: 'after', value: '2026-02-02' }], dateFormats: [{ column: 'Due date', format: 'YYYY-MM-DD' }], covers: [2] }]);
  assert.match(d.refused[0].why, /date "2026-02-02" .* is not in your words/);
  assert.equal((await build1([{ ...ROWS, covers: [2] }])).checks.length, 1, '500 is the person\'s own');
});

test('a non-header column is refused for the column of a table check too, and a table check already failing on the sheet is refused at build', async () => {
  const c = await build1([{ ...NODUP, column: 'Invoice', covers: [] }]);
  assert.equal(c.refused[0].helper, 'columnAt');
  const dup = { aging: sheetTable(parseCsv(readFileSync(join(HERE, 'fixtures', 'sheets', 'aging-dup.csv'), 'utf8'))) };
  const f = await build1([{ ...NODUP, covers: [1] }], dup);
  assert.deepEqual(f.refused, [{ helper: 'runTableChecks', why: 'the table check already fails on the sheet' }]);
  assert.equal(f.checks.length, 0);
});

test('the AI writes no sheet check: its id, claim and text are dropped; the build holds only what code named', async () => {
  const r = await build1([{ ...ROWS, id: 'AI-NAME', claim: 'AI-CLAIM', text: 'AI wrote this', covers: [2] }]);
  assert.deepEqual(r.checks.map((c) => [c.id, c.claim, c.text]), [['l2r2', 'l2r2', undefined]]);
  assert.deepEqual(toSuggestion({ id: 'a', claim: 'b', text: 'c', covers: [1], op: 'rows' }), { covers: [1], fields: { op: 'rows' } });
  assert.deepEqual(toSuggestion('not an object'), { covers: [], fields: {} });
});

test('am3 forced case: a second check on a rule a rule row holds becomes its own [agent] row, whichever came first', async () => {
  for (const order of [[{ ...NODUP, covers: [1] }, { ...COUNT, covers: [1] }], [{ ...COUNT, covers: [1] }, { ...NODUP, covers: [1] }]]) {
    const r = await build1(order);
    assert.deepEqual(r.ruleRows.map((x) => [x.check.rule, x.check.covers]), [['cells', [1]]]);
    assert.deepEqual(r.agentRows.map((x) => [x.check.rule, x.check.covers]), [['table', []]]);
    assert.equal(r.refused.length, 0, 'nothing is hidden');
  }
  const two = await build1([{ ...COUNT, covers: [2] }, { ...ROWS, covers: [2] }]);
  assert.deepEqual(two.ruleRows.map((x) => x.check.op), ['countIf']);
  assert.deepEqual(two.agentRows.map((x) => x.check.op), ['rows']);
});

test('am3: a rule row never holds two checks, no rule is on two rule rows, built + refused = suggested, and every check has its own code id', async () => {
  const sug = [{ ...COUNT, covers: [2] }, { ...ROWS, covers: [2] }, { ...NODUP, covers: [1] }, { rule: 'table', table: 'aging', op: 'noEmpty', column: 'Amount', covers: [] }, { ...ROWS, covers: [1, 2] }];
  const r = await build1(sug);
  const held = r.ruleRows.flatMap((x) => x.covers);
  assert.equal(new Set(held).size, held.length);
  assert.equal(r.ruleRows.length + r.agentRows.length, sug.length - r.refused.length);
  assert.equal(new Set(r.checks.map((c) => c.id)).size, r.checks.length);
  assert.ok(r.checks.every((c) => /^l2[ra]/.test(c.id)));
  for (const a of r.agentRows) assert.equal(a.check.row, 'agent');
  for (const a of r.ruleRows) assert.equal('row' in a.check, false);
});

test('am7: a table check is never a rule row: an [agent] row that covers no rule, and the rule it named is Not checked with the no-pick sentence', async () => {
  const r = await build([ROWCOUNT]);
  assert.deepEqual(r.ruleRows, []);
  assert.deepEqual(r.agentRows.map((x) => [x.check.rule, x.check.row, x.check.covers]), [['table', 'agent', []]]);
  assert.deepEqual(r.rows.map((x) => [x.rule, x.state]), [[1, 'not-checked'], [2, 'not-checked']]);
  assert.equal(r.rows[0].reason, NO_VALUE_WHY);
  assert.equal(NO_VALUE_WHY, 'No check was picked for it, so you judge it at Accept.', 'hamr\'s ruling: judged at Accept, not at an Ask');
  const both = await build([ROWCOUNT, OVER]);
  assert.deepEqual(both.ruleRows.map((x) => [x.check.rule, x.check.covers]), [['cells', [2]]]);
  assert.deepEqual(both.rows.map((x) => x.state), ['not-checked', 'built']);
});

test('am7(c): a rule whose check was refused keeps the refusal as its reason, never the no-pick sentence', async () => {
  const r = await build([{ ...ROWCOUNT, n: 99 }, OVER]);
  assert.ok(String(r.rows[0].reason).includes('suggestion refused: '), String(r.rows[0].reason));
  assert.equal(String(r.rows[0].reason).includes(NO_VALUE_WHY), false);
});

test('F195 edge: a multi-rule suggestion one of whose rules a rule row holds is an [agent] row that shows the other rule only, once', async () => {
  const r = await build1([{ ...COUNT, covers: [1] }, { ...ROWS, covers: [1, 2] }, { ...NODUP, covers: [2] }]);
  assert.deepEqual(r.rows.map((x) => [x.state, x.id]), [['built', 'l2r1'], ['agent-row', 'l2a1']]);
  assert.deepEqual([r.agentRows[0].check.row, r.agentRows[0].check.covers], ['agent', [2]]);
  assert.deepEqual(r.agentRows[1].check.covers, []);
});

test('an agreed-column rule is not a rule to cover: it is state "column", and a suggestion that names it covers nothing', async () => {
  const line = { n: 2, text: 'List every invoice over 500 by its price', rule: columnRuleWords('price', 'Amount'), rules: [columnRuleWords('price', 'Amount')] };
  const r = await buildSheetLine({ line, tables: TABLES, suggestions: [{ ...ROWS, covers: [1] }] });
  assert.equal(r.rows[0].state, 'column');
  assert.deepEqual(r.checks.map((c) => [c.id, c.covers]), [['l2a1', []]]);
});

test('reds name rows and counts, never cell text: a failing table check\'s refusal carries no cell', async () => {
  const dup = { aging: sheetTable(parseCsv(readFileSync(join(HERE, 'fixtures', 'sheets', 'aging-dup.csv'), 'utf8'))) };
  const f = await build1([{ ...NODUP, covers: [] }], dup);
  assert.equal(JSON.stringify(f).includes('INV-100'), false);
});

test('buildSheetChecks: suggestions are grouped by their job line, every sheet line gets a result, a line that is no sheet line is a refusal', async () => {
  const lines = [LINE1, { n: 5, text: 'Sum it', rule: 'total over 500', rules: ['total over 500'] }];
  const out = await buildSheetChecks({ lines, tables: TABLES, suggestions: [{ ...ROWS, line: 2, covers: [2] }, { ...COUNT, line: 5, where: [{ column: 'Amount', cmp: 'gt', value: 500 }], covers: [1] }, { ...ROWS, line: 9, covers: [] }, 'junk'] });
  assert.deepEqual(out.checks.map((c) => c.id), ['l2r2', 'l5r1']);
  assert.deepEqual(Object.keys(out.built), ['2', '5']);
  assert.deepEqual(out.refused.map((x) => [x.line, x.helper]), [[9, 'line'], [null, 'schema']]);
  assert.equal(out.refused[0].why, 'line 9 is not a sheet line');
  assert.equal(out.refused[1].why, 'a suggestion is not an object');
  assert.deepEqual(out.notChecked, { 'line 2: "every invoice appears exactly once"': NO_VALUE_WHY });
});

test('buildSheetChecks: no suggestions at all is a result with every rule Not checked in plain words, never a silent empty', async () => {
  const out = await buildSheetChecks({ lines: [LINE1], tables: TABLES, suggestions: [] });
  assert.deepEqual(out.checks, []);
  assert.deepEqual(out.notChecked, { 'line 2: "every invoice appears exactly once"': NO_VALUE_WHY, 'line 2: "flag amounts over 500"': NO_VALUE_WHY });
});
