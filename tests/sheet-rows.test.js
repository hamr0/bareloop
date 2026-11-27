// S4: the one list holds the sheet rows (ported from fwdloop v0.35.0 m16-am4-sheet-rows, m16-tags-origin sheet parts, m17-p4-f196, m17-am7-table-row, adapted to bareloop's CheckBlock).
// Real CheckBlock, real buildSheetChecks (bareguard), the real aging.csv fixture, $0, no provider anywhere: Drop and Add are row edits on the block and call no AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CheckBlock, REASON } from '../src/checkblock.js';
import { buildSheetChecks, NO_VALUE_WHY, NO_CHECK_FITS_WHY } from '../src/sheetbuild.js';
import { parseCsv, sheetTable } from '../src/csv.js';
import { cardOfClose, listMatchesClose, checksOfClose } from '../src/rubricstep.js';
import { lineRules } from '../src/jobline.js';
import { sheetRowsOf } from '../src/sheetrows.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const AGING = readFileSync(join(HERE, 'fixtures', 'sheets', 'aging.csv'), 'utf8');
const TABLES = { Aging: sheetTable(parseCsv(AGING)) };
const GUARD = ['every invoice appears exactly once, all 8 of them', 'flag amounts over 500'];
const LINES = [
  { n: 1, text: 'Read the aging sheet', rule: '', rules: [] },
  { n: 2, text: 'Put each invoice in its overdue bucket as of 2026-10-11', rule: GUARD.join('; '), rules: GUARD },
];
const W500 = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const OVER = { line: 2, rule: 'cells', table: 'Aging', claim: 'over', op: 'rows', where: W500, covers: [2] };
const SECOND = { line: 2, rule: 'cells', table: 'Aging', claim: 'second', op: 'rows', where: [{ column: 'Amount', cmp: 'lte', value: 500 }], covers: [1, 2] };
const NODUP = { line: 2, rule: 'table', table: 'Aging', op: 'noDuplicates', column: 'Invoice #', covers: [] };
const ROWCOUNT = { line: 2, rule: 'table', table: 'Aging', op: 'rowCount', n: 8, covers: [1] };
const COUNT = { line: 2, rule: 'cells', table: 'Aging', claim: 'c', op: 'countIf', where: W500, covers: [] };

/** a block over the aging sheet with the sheet checks built from `suggestions` (the real builder) */
async function sheetBlock(/** @type {any[]} */ suggestions, lines = LINES) {
  const b = new CheckBlock({ texts: { Aging: AGING }, labels: ['Aging'], asks: false, split: true });
  b.fromJob(lines);
  b.setGuards(['changed-from-seed'], ['output/']);
  b.setSheetLines(lines.filter((l) => lineRules(l).length > 0).map((l) => l.n));
  b.reconcile();
  const built = await buildSheetChecks({ lines: lines.filter((l) => lineRules(l).length > 0), tables: TABLES, suggestions });
  b.setSheet(built);
  return { b, built };
}
const closeOf = (/** @type {CheckBlock} */ b) => { const v = b.closeView(); return { genre: 'rubric-files', lang: 'rubric-files', stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }, ...v.stages], list: v.list, picks: v.picks }; };
const cardOf = (/** @type {CheckBlock} */ b) => cardOfClose({ closeDecl: closeOf(b), jobLines: LINES });
const sheetPart = (/** @type {CheckBlock} */ b) => closeOf(b).stages.flatMap((/** @type {any} */ s) => s.params?.parts ?? []).find((/** @type {any} */ p) => p.class === 'sheet');

test('every (line, rule) shows once: a built rule on its [you] row, a rule only a table check named Not checked once, and no rule has two rows', async () => {
  const { b } = await sheetBlock([ROWCOUNT, OVER, NODUP, COUNT]);
  const card = cardOf(b);
  for (const rule of GUARD) {
    const shown = card.checkItems.filter((c) => c.text.includes(`"${rule}"`)).length + card.notChecked.filter((t) => t.includes(`"${rule}"`)).length;
    assert.equal(shown, 1, `${rule}: ${JSON.stringify({ items: card.checkItems.map((c) => c.text), nc: card.notChecked })}`);
  }
  const you = card.checkItems.filter((c) => c.by === 'you');
  assert.deepEqual(you.map((c) => c.key), ['L2.~2']);
  assert.ok(you[0].text.includes('covers "flag amounts over 500"'));
  assert.equal(b.rows.filter((r) => r.kind === 'rule' && r.line === 2).length, 2, 'one rule row per ~ rule, never a second');
  assert.equal(listMatchesClose(closeOf(b)).ok, true, JSON.stringify(listMatchesClose(closeOf(b))));
});

test('tags: the AI\'s other checks are their own [agent] rows (a table check never sits on a rule\'s row), code\'s defaults are [default]', async () => {
  const { b } = await sheetBlock([ROWCOUNT, OVER, NODUP, COUNT]);
  const items = cardOf(b).checkItems.filter((c) => c.fromLine[0] === 2);
  const agent = items.filter((c) => c.by === 'agent');
  assert.equal(agent.length, 3, JSON.stringify(items.map((c) => [c.by, c.key, c.text])));
  assert.ok(agent.every((c) => /^L2\.sheet\.l2a\d$/.test(String(c.key))));
  assert.ok(agent.every((c) => !c.text.includes(' covers ')), 'a table check covers no rule; the count covers none');
  assert.ok(items.some((c) => c.by === 'default' && c.key === 'L2.$sheet'), 'the [default] row of a sheet line');
  const signed = closeOf(b).list.filter((r) => r.line === 2 && r.kind === 'sheet');
  assert.deepEqual(signed.map((r) => [r.by, r.state]).sort(), [['agent', 'built'], ['agent', 'built'], ['agent', 'built'], ['default', 'built']]);
  assert.ok(signed.every((r) => r.from === (r.by === 'agent' ? 'agent' : 'default')));
});

test('no `$cited` default and no numbers tie on a sheet line (a cited part next to a sheet part is a stage-shape red); the line\'s sheet part is the one part that carries the checks', async () => {
  const { b } = await sheetBlock([OVER]);
  assert.equal(b.rows.some((r) => r.line === 2 && (r.kind === 'cited' || r.kind === 'numbers')), false);
  const stage = closeOf(b).stages.find((/** @type {any} */ s) => s.params?.step === 2);
  assert.deepEqual(stage.params.parts.map((/** @type {any} */ p) => p.class), ['sheet']);
  // line 1 has no `~` rule: it is no sheet line and keeps its `$cited` default exactly as today
  assert.equal(b.rows.some((r) => r.line === 1 && r.kind === 'cited'), true);
});

test('the sheet part keeps the built checks as data, with the rule numbers they carry', async () => {
  const { b, built } = await sheetBlock([ROWCOUNT, OVER, NODUP, COUNT]);
  const part = sheetPart(b);
  assert.equal(part.class, 'sheet');
  assert.deepEqual(part.checks.map((/** @type {any} */ c) => c.id), built.checks.map((/** @type {any} */ c) => c.id));
  assert.deepEqual(part.rules, [2]);
});

test('Drop on an [agent] row and Add round-trip to the very same list and stages; the dropped check shows under Suggested; no provider exists to be called', async () => {
  const { b } = await sheetBlock([ROWCOUNT, OVER, NODUP, COUNT]);
  const before = JSON.stringify(closeOf(b));
  const key = cardOf(b).checkItems.find((c) => c.by === 'agent' && /row count/.test(c.text))?.key;
  assert.ok(key, 'the row-count table check has a row key');
  assert.deepEqual(b.rowChoice(String(key), 'drop'), { ok: true });
  const mid = closeOf(b);
  assert.equal(sheetPart(b).checks.some((/** @type {any} */ c) => c.op === 'rowCount'), false, 'the check left the part');
  assert.equal(mid.list.find((r) => r.key === key).state, 'dropped');
  assert.equal(b.suggestedView().length, 1);
  assert.match(b.suggestedView()[0].text, /row count/);
  assert.equal(cardOf(b).checkItems.some((c) => c.key === key), false);
  assert.deepEqual(b.rowChoice(String(key), 'add'), { ok: true });
  assert.equal(JSON.stringify(closeOf(b)), before, 'Drop + Add is the identity');
  assert.deepEqual(b.suggestedView(), []);
  // only an agent row can be dropped; a [you] row and a [default] row say why
  assert.deepEqual(b.rowChoice('L2.~2', 'drop'), { ok: false, why: 'that check comes from a rule you wrote; edit the job to change it' });
  assert.equal(b.rowChoice('L2.$sheet', 'drop').ok, false);
  assert.equal(b.rowChoice('L2.sheet.nope', 'drop').ok, false);
  assert.equal(b.rowChoice(String(key), 'add').ok, false, 'only a dropped check can be added');
});

test('a rule an [agent] row shows is shown once; dropping that row leaves the rule Not checked once, and Add brings the row back', async () => {
  const { b } = await sheetBlock([OVER, SECOND]);
  const agent = cardOf(b).checkItems.find((c) => c.by === 'agent' && c.fromLine[0] === 2);
  assert.ok(agent && agent.text.includes('covers "every invoice appears exactly once, all 8 of them"'), JSON.stringify(cardOf(b).checkItems.map((c) => [c.by, c.text])));
  const shownOnce = () => { const c = cardOf(b); return c.checkItems.filter((x) => x.text.includes(`"${GUARD[0]}"`)).length + c.notChecked.filter((t) => t.includes(`"${GUARD[0]}"`)).length; };
  assert.equal(shownOnce(), 1);
  assert.deepEqual(b.rowChoice(String(agent.key), 'drop'), { ok: true });
  assert.equal(shownOnce(), 1);
  assert.ok(cardOf(b).notChecked.some((t) => t.includes(`"${GUARD[0]}"`) && t.endsWith(REASON.dropped)), JSON.stringify(cardOf(b).notChecked));
  assert.deepEqual(b.rowChoice(String(agent.key), 'add'), { ok: true });
  assert.equal(shownOnce(), 1);
  assert.equal(cardOf(b).notChecked.some((t) => t.includes(`"${GUARD[0]}"`)), false);
});

test('the two am7 sentences, each exact: a table check was picked but cannot check the rule; no check picked; a refusal keeps its own reason', async () => {
  assert.equal(NO_CHECK_FITS_WHY, 'A check was picked, but it cannot check this rule, so you judge it at Accept.');
  assert.equal(NO_VALUE_WHY, 'No check was picked for it, so you judge it at Accept.');
  assert.equal(REASON.noPick, NO_VALUE_WHY);
  const { b } = await sheetBlock([ROWCOUNT]);
  const nc = cardOf(b).notChecked;
  assert.ok(nc.includes(`line 2: "${GUARD[0]}" — ${NO_CHECK_FITS_WHY}`), JSON.stringify(nc));
  assert.ok(nc.includes(`line 2: "${GUARD[1]}" — ${NO_VALUE_WHY}`), JSON.stringify(nc));
  const refused = await sheetBlock([{ ...OVER, where: [{ column: 'Price', cmp: 'gt', value: 500 }] }]);
  assert.ok(cardOf(refused.b).notChecked.some((t) => t.startsWith(`line 2: "${GUARD[1]}" — suggestion refused: columnAt: `)));
  const all = JSON.stringify([cardOf(b), closeOf(b).list]);
  assert.equal(/at the Ask|no sheet check covers it/.test(all), false);
});

test('a rule has never two rows: a row edit the AI sends about a rule of a sheet line is refused alone with a plain reason, whatever its kind', async () => {
  const { b } = await sheetBlock([OVER]);
  const rec = b.applyDelta({ label: 'author', edits: [
    { op: 'not-checkable', line: 2, rule: 1, reason: 'cannot be checked' },
    { op: 'add', kind: 'phrase', line: 2, name: 'p', words: ['INV-100'], source: 'Aging' },
    { op: 'pick', line: 2, rules: [2], check: { check: 'maxWords', value: 80 } },
    { op: 'reading', line: 2, rules: [2], fact: 'Amount', reading: { op: 'gt', value: 500 } },
  ] });
  assert.ok(rec.edits.every((/** @type {any} */ e) => e.accepted === false && /sheet/.test(e.refusedBecause)), JSON.stringify(rec.edits));
  b.reconcile();
  assert.equal(b.rows.filter((r) => r.kind === 'rule' && r.line === 2).length, 2);
  assert.equal(b.rows.filter((r) => r.line === 2 && (r.kind === 'phrase' || r.kind === 'fact' || r.kind === 'count')).length, 0);
});

test('a counting rule on a sheet line is asked no question: the sheet decides it (Not checked with the no-pick sentence), never a second pick path', async () => {
  const lines = [LINES[0], { n: 2, text: LINES[1].text, rule: 'at most 80 words; flag amounts over 500', rules: ['at most 80 words', 'flag amounts over 500'] }];
  const b = new CheckBlock({ texts: { Aging: AGING }, labels: ['Aging'], asks: true, split: true, countScope: () => true });
  b.fromJob(lines);
  b.setSheetLines([2]);
  b.reconcile();
  assert.deepEqual(b.open, [], 'no pick question for a rule of a sheet line');
  const row = b.rows.find((r) => r.line === 2 && r.rule === 1);
  assert.equal(row.state, 'not-checked');
  assert.equal(row.reason, NO_VALUE_WHY);
});

test('F196: a look drop of a word inside a `~` rule makes no line of its own (its reason rides the rule row); sheetRowsOf names the keys the signed list uses', async () => {
  const { b } = await sheetBlock([OVER]);
  const before = b.rows.length;
  b.addLook([], [{ line: 2, rule: 1, fact: 'invoice', source: 'Aging', reason: 'no-column' }]);
  b.reconcile();
  assert.equal(b.rows.length, before, 'no row of its own');
  assert.equal(b.rows.some((r) => r.key.startsWith('L2.fact.')), false);
  const rows = sheetRowsOf(closeOf(b), LINES);
  assert.ok(rows.some((r) => r.key === 'L2.$sheet' && r.by === 'default'));
});

test('Revise keeps a Drop of the very same check: the record carries the dropped check\'s own fields, and a new draft with the same suggestion drops it again; a different check is not dropped', async () => {
  const { b } = await sheetBlock([ROWCOUNT, OVER, NODUP]);
  const key = String(cardOf(b).checkItems.find((c) => c.by === 'agent' && /no duplicate/.test(c.text))?.key);
  assert.deepEqual(b.rowChoice(key, 'drop'), { ok: true });
  const rec = b.sheetDroppedRecord();
  assert.equal(rec.length, 1);
  assert.ok(typeof rec[0].lineWords === 'string' && rec[0].check.op === 'noDuplicates');
  // a fresh block (the next draft), the suggestions come back in another order so the ids differ
  const next = await sheetBlock([NODUP, OVER, ROWCOUNT]);
  next.b.carrySheetDropped(JSON.parse(JSON.stringify(rec)));
  const dropped = next.b.rows.filter((r) => r.kind === 'sheet' && r.choice === 'drop');
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].check.op, 'noDuplicates');
  assert.equal(sheetPart(next.b).checks.some((/** @type {any} */ c) => c.op === 'noDuplicates'), false);
  assert.equal(sheetPart(next.b).checks.some((/** @type {any} */ c) => c.op === 'rowCount'), true);
  const other = await sheetBlock([ROWCOUNT, OVER]);
  other.b.carrySheetDropped(JSON.parse(JSON.stringify(rec)));
  assert.equal(other.b.rows.some((r) => r.choice === 'drop'), false, 'the dropped check is not in this draft: nothing is dropped');
});

test('checksOfClose and the signed list agree: the card is read from the signed close alone (planMatchesClose reads the same items)', async () => {
  const { b } = await sheetBlock([ROWCOUNT, OVER, NODUP, COUNT]);
  const close = closeOf(b);
  const items = checksOfClose(close, LINES).filter((c) => c.line === 2);
  const sheetItems = items.filter((c) => c.key !== undefined && /^L2\.(sheet\.|~|\$sheet)/.test(c.key));
  assert.equal(sheetItems.length, 5, JSON.stringify(items.map((c) => [c.by, c.key])));
  assert.ok(items.some((c) => c.key === 'L2.$floor'), 'the floor is still there');
});

test('the op names table names every op bareguard has in its cells and table rules (a new bareguard op fails here, never reads as an unnamed card line)', async () => {
  const { vocabularyOps, SHEET_OP_NAMES } = await import('../src/sheetrows.js');
  const missing = vocabularyOps().filter((op) => !Object.hasOwn(SHEET_OP_NAMES, op));
  assert.deepEqual(missing, []);
});
