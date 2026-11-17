// S2 call site: the row-edit turn of a rubric job (src/rowedit.js, drafted by authorClose in src/authorflow.js). With a CSV input the turn also shows the sheet lines and offers the optional `sheetChecks`
// property; the reply's suggestions go to buildSheetChecks and its result rides the draft's result as `sheetBuilt`. A job with no CSV is shown today's turn BYTE FOR BYTE (the golden files
// tests/fixtures/sheets/turn-*.golden.json were taken from the unchanged source before S2). Fake provider, $0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rowEditChannel, ROW_EDIT_SYSTEM } from '../src/rowedit.js';
import { sheetSuggestProp } from '../src/sheetoffer.js';
import { parseCsv, sheetTable } from '../src/csv.js';
import { turnOver, cleanup, HERE } from './sheetturn-harness.mjs';

after(cleanup);
const AGING = readFileSync(join(HERE, 'fixtures', 'sheets', 'aging.csv'), 'utf8');
const TABLES = { Aging: sheetTable(parseCsv(AGING)) };
const golden = (/** @type {string} */ n) => JSON.parse(readFileSync(join(HERE, 'fixtures', 'sheets', `turn-${n}.golden.json`), 'utf8'));
const PAGE = { label: 'Flights', value: 'https://www.google.com/travel/flights?q=sfo-lax' };
const PAGE_LINE = { n: 1, text: 'List the flights', rule: 'only priority P1 tickets', rules: ['only priority P1 tickets'] };
const GUARD = ['every invoice appears exactly once, all 8 of them', 'flag amounts over 500'];
const SHEET_LINES = [
  { n: 1, text: 'Read the aging sheet', rule: '', rules: [] },
  { n: 2, text: 'Put each invoice in its overdue bucket as of 2026-10-11', rule: GUARD.join('; '), rules: GUARD },
];
const OVER = { line: 2, rule: 'cells', table: 'Aging', claim: 'over', op: 'rows', where: [{ column: 'Amount', cmp: 'gt', value: 500 }], covers: [2] };
const NODUP = { line: 2, rule: 'table', table: 'Aging', op: 'noDuplicates', column: 'Invoice #', covers: [] };
const ROWCOUNT = { line: 2, rule: 'table', table: 'Aging', op: 'rowCount', n: 8, covers: [1] };
const COUNT = { line: 2, rule: 'cells', table: 'Aging', claim: 'c', op: 'countIf', where: [{ column: 'Amount', cmp: 'gt', value: 500 }], covers: [] };
const sheetTurn = (/** @type {any[]} */ replies, jobLines = SHEET_LINES) => turnOver({ input: { label: 'Aging', value: '' }, csv: 'aging.csv', jobLines, replies });

test('byte-diff gate: a job with no CSV is shown today\'s row-edit turn byte for byte (messages and tools), plain and Tickets', async () => {
  for (const ticket of [false, true]) {
    const { sent, tools, r } = await turnOver({ input: PAGE, jobLines: [PAGE_LINE], replies: [{ edits: [] }], ticket });
    assert.equal(r.ok, true);
    const g = golden(ticket ? 'ticket' : 'plain');
    assert.equal(JSON.stringify({ sent, tools }, null, 1), JSON.stringify(g, null, 1), `ticket=${ticket}`);
    assert.equal(Object.hasOwn(r, 'sheetBuilt'), false, 'no sheet result on a job with no sheet');
  }
});

test('schema: the reply\'s sheetChecks is optional, absent for non-CSV jobs, and offered (with the real line enum) only when given', () => {
  const plain = rowEditChannel(false).tool({ calls: [] }).parameters;
  assert.equal(Object.hasOwn(plain.properties, 'sheetChecks'), false);
  assert.equal(JSON.stringify(plain), JSON.stringify(rowEditChannel(false, null).tool({ calls: [] }).parameters), 'a null sheet property is no property');
  const prop = sheetSuggestProp(TABLES, [2]);
  const sheet = rowEditChannel(false, prop).tool({ calls: [] }).parameters;
  assert.deepEqual(sheet.required, ['edits'], 'optional: only the edits list is required');
  assert.equal(sheet.additionalProperties, false);
  assert.deepEqual(sheet.properties.sheetChecks.items.properties.line.enum, [2]);
  assert.deepEqual(Object.keys(sheet.properties), ['edits', 'sheetChecks']);
  assert.equal(typeof ROW_EDIT_SYSTEM, 'string');
});

test('a CSV job: the turn shows the sheet block and the sheet, offers sheetChecks with the real sheet lines, and a plain job\'s sibling text is unchanged', async () => {
  const { sent, tools, r } = await sheetTurn([{ edits: [] }]);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const text = sent[0].map((/** @type {any} */ m) => m.content).join('\n');
  assert.match(text, /^THE JOB/);
  assert.match(text, /THE SHEET CHECKS\n- The job's sheet lines are 2 /);
  assert.ok(text.includes('INPUT "Aging"') && text.includes('INV-100'), 'the sheet itself is shown');
  const params = tools[0].find((/** @type {any} */ t) => t.name === 'submit_edits').parameters;
  assert.deepEqual(params.properties.sheetChecks.items.properties.line.enum, [2], 'a line with no ~ rule is no sheet line');
  assert.deepEqual(params.properties.sheetChecks.items.properties.table.enum, ['Aging']);
  assert.deepEqual(params.required, ['edits']);
});

test('the reply\'s sheetChecks go to buildSheetChecks: four suggestions build four checks with code ids on the draft result, none of them in the declaration', async () => {
  const { r } = await sheetTurn([{ edits: [], sheetChecks: [ROWCOUNT, OVER, NODUP, COUNT] }]);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual(r.sheetBuilt.checks.map((/** @type {any} */ c) => c.id), ['l2r2', 'l2a1', 'l2a2', 'l2a3']);
  assert.equal(JSON.stringify(r.declaration).includes('l2r2'), false, 'the declaration is assembled from the rows alone; S3 puts these in the stage');
  assert.equal(Object.hasOwn(r.declaration, 'sheetChecks'), false);
});

test('a refused suggestion is kept with its helper on the draft result and on the iteration record; the rule it named is Not checked with the reason', async () => {
  const bad = { ...OVER, where: [{ column: 'Price', cmp: 'gt', value: 500 }] };
  const { r } = await sheetTurn([{ edits: [], sheetChecks: [bad] }]);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.sheetBuilt.checks.length, 0);
  assert.equal(r.sheetBuilt.refused[0].helper, 'columnAt');
  assert.match(r.sheetBuilt.notChecked['line 2: "flag amounts over 500"'], /^suggestion refused: columnAt: /);
  assert.equal(r.iterations[0].sheetRefused[0].helper, 'columnAt');
});

test('a CSV job whose reply carries no sheetChecks still gets a result: every rule Not checked in plain words (nothing dropped silently)', async () => {
  const { r } = await sheetTurn([{ edits: [] }]);
  assert.deepEqual(r.sheetBuilt.checks, []);
  assert.equal(Object.keys(r.sheetBuilt.notChecked).length, 2);
});

test('sheetChecks changed between tries is not "an identical declaration": the second try is judged, the last reply wins', async () => {
  const { r, calls } = await sheetTurn([{ edits: [], sheetChecks: [OVER] }, { edits: [], sheetChecks: [OVER, NODUP] }]);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.ok(calls >= 1);
  assert.ok(r.sheetBuilt.checks.length >= 1);
});

test('an agreed-column rule on a line is told to the AI again, from the rule\'s own words', async () => {
  const lines = [{ n: 1, text: 'Read it', rule: '', rules: [] }, { n: 2, text: 'List every invoice over 500 by its price', rule: "use the column 'Amount' for 'price'", rules: ["use the column 'Amount' for 'price'"] }];
  const { sent } = await sheetTurn([{ edits: [] }], lines);
  assert.ok(sent[0].map((/** @type {any} */ m) => m.content).join('\n').includes("- The person agreed that on line 2 the word 'price' means the column 'Amount'."));
});

test('a CSV with no ~ rule on any line has no sheet turn: no block, no property', async () => {
  const { sent, tools, r } = await sheetTurn([{ edits: [] }], [{ n: 1, text: 'Read the aging sheet', rule: '', rules: [] }]);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(sent[0].map((/** @type {any} */ m) => m.content).join('\n').includes('THE SHEET CHECKS'), false);
  assert.equal(Object.hasOwn(tools[0].find((/** @type {any} */ t) => t.name === 'submit_edits').parameters.properties, 'sheetChecks'), false);
  assert.equal(Object.hasOwn(r, 'sheetBuilt'), false);
});
