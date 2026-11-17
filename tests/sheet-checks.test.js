// S2 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-17", S2): the sheet check vocabulary, words and offer, ported from fwdloop v0.35.0 test/m10b-sheet-checks and test/m16-am4-sheet-bareguard
// (the parts that do not need fwd's declaration validator). Every helper is bareguard's, imported, never copied. $0, the real fixtures in tests/fixtures/sheets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSchema, rubricVocabulary } from 'bareguard';
import { parseCsv, sheetTable } from '../src/csv.js';
import * as sheetchecks from '../src/sheetchecks.js';
import { sheetCheckColumns, sheetCheckSentence, sheetCheckReds, sheetNoClaimReds, bareguardChecks, SHEET_RULES, MAX_SHEET_CHECKS } from '../src/sheetchecks.js';
import * as sheetoffer from '../src/sheetoffer.js';
import { sheetChecksProp, sheetSuggestProp, sheetOfferRules, sheetOpsBrief, isColumnChoiceRule, columnChoiceParts, agreedColumnWords, WHERE_CMPS } from '../src/sheetoffer.js';
import { columnRuleWords, ruleWithColumn } from '../src/sheetlook.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (/** @type {string} */ f) => readFileSync(join(HERE, '..', 'src', f), 'utf8');
const AGING = readFileSync(join(HERE, 'fixtures', 'sheets', 'aging.csv'), 'utf8');
const tablesOf = (csv = AGING) => ({ aging: sheetTable(parseCsv(csv)) });
const ISO = [{ column: 'Due date', format: 'YYYY-MM-DD' }];
const BANDS = [{ name: 'Current', lte: 0 }, { name: '1-30', gte: 1, lte: 30 }, { name: '31-60', gte: 31, lte: 60 }, { name: '61-90', gte: 61, lte: 90 }, { name: '90+', gt: 90 }];
const CHECKS = () => [
  { id: 'over', rule: 'cells', table: 'aging', claim: 'over', op: 'rows', where: [{ column: 'Amount', cmp: 'gt', value: 500 }] },
  { id: 'bands', rule: 'cells', table: 'aging', claim: 'bands', op: 'band', column: 'Due date', asOf: '2026-10-11', dateFormats: ISO, bands: BANDS },
  { id: 'nodup', rule: 'table', table: 'aging', op: 'noDuplicates', column: 'Invoice #' },
];
const redsOf = (/** @type {any[]} */ checks, tables = tablesOf()) => sheetCheckReds(checks, 2, tables).join('\n');

test('the vocabulary: cells and table rules only, at most 20 checks', () => {
  assert.deepEqual([...SHEET_RULES], ['cells', 'table']);
  assert.equal(MAX_SHEET_CHECKS, 20);
});

test('valid sheet checks pass bareguard\'s sign-time test over the real header (rows, band, noDuplicates)', () => {
  assert.deepEqual(sheetCheckReds(CHECKS(), 2, tablesOf()), []);
});

test('a column that is no header of the sheet is refused, naming the line and the column', () => {
  const c = CHECKS(); c[0].where[0].column = 'Total';
  assert.match(redsOf(c), /line 2: 'Total' is not a real column of "aging" \(its columns: 'Invoice #', 'Customer', 'Due date', 'Amount'\)\. Copy a column name exactly\./);
  const n = CHECKS(); n[2].column = 'Invoice';
  assert.match(redsOf(n), /line 2: 'Invoice' is not a real column/);
  const d = CHECKS(); d[1].dateFormats = [{ column: 'Due', format: 'YYYY-MM-DD' }];
  assert.match(redsOf(d), /line 2: 'Due' is not a real column/);
});

test('overlapping bands and a tolerance on countIf are refused by bareguard, naming the line and the check', () => {
  const c = CHECKS(); c[1].bands = [{ name: 'Current', lte: 10 }, { name: '1-30', gte: 5, lte: 30 }, { name: '90+', gt: 30 }];
  const r = redsOf(c);
  assert.match(r, /line 2: bareguard refuses the sheet check 'bands'/);
  assert.match(r, /overlap/i);
  const t = [{ id: 'n', rule: 'cells', table: 'aging', claim: 'n', op: 'countIf', where: [{ column: 'Amount', cmp: 'gt', value: 500 }], tolerance: 1 }];
  assert.match(redsOf(t), /line 2: bareguard refuses the sheet check 'n'/);
});

test('a sheet bareguard cannot read as a table (a ragged row) and a check naming no saved sheet are refused, naming the line and the sheet', () => {
  assert.match(redsOf(CHECKS(), tablesOf(`${AGING}INV-999,Customer 9,2026-03-01\n`)), /line 2: bareguard cannot read "aging" as a table/);
  const zz = { ...CHECKS()[0], table: 'zz' };
  assert.match(redsOf([zz]), /line 2: the sheet check reads "zz", which has no saved copy to test against/);
});

test('the columns of a check are the vocabulary\'s columnAt fields (row math names both columns; a where names its column)', () => {
  const V = /** @type {any} */ (rubricVocabulary);
  const c = { id: 'rm', rule: 'table', table: 't', op: 'rowMath', a: 'Amount', fn: 'add', b: { const: 1 }, result: 'Due' };
  assert.deepEqual(sheetCheckColumns(c).sort(), ['Amount', 'Due']);
  assert.deepEqual(sheetCheckColumns({ id: 'w', rule: 'cells', table: 't', claim: 'c', op: 'countIf', where: [{ column: 'Id', cmp: 'empty' }] }), ['Id']);
  assert.equal(V.rules.cells.fields.where.columnAt, 'each.column');
  assert.deepEqual(sheetCheckColumns('x'), []);
});

test('each check reads as its own plain row, from one function', () => {
  assert.equal(sheetCheckSentence(CHECKS()[0]), 'rows where Amount > 500');
  assert.equal(sheetCheckSentence(CHECKS()[1]), 'band on Due date as of 2026-10-11: Current, 1-30, 31-60, 61-90, 90+');
  assert.equal(sheetCheckSentence(CHECKS()[2]), 'no duplicate Invoice #');
  assert.equal(sheetCheckSentence({ rule: 'table', op: 'rowCount', n: 8 }), 'the sheet has 8 rows');
  assert.equal(sheetCheckSentence(7), 'a check that is not readable');
});

test('code-only fields (covers, row) are cleaned on the way into bareguard, the rest is untouched', () => {
  const c = { ...CHECKS()[0], covers: [1], row: 'agent' };
  const [clean] = bareguardChecks([c]);
  assert.equal('covers' in clean || 'row' in clean, false);
  assert.deepEqual(bareguardChecks([CHECKS()[0]]), [CHECKS()[0]]);
});

test('sheetNoClaimReds: a step whose checks are ALL table checks has nothing to answer, naming the line (a stage-shape red for S3)', () => {
  const all = [{ rule: 'table', op: 'noDuplicates' }, { rule: 'table', op: 'rowCount' }];
  assert.match(sheetNoClaimReds(all, 4)[0], /line 4: every sheet check on this step is a table check/);
  assert.deepEqual(sheetNoClaimReds([...all, { rule: 'cells' }], 4), []);
  assert.deepEqual(sheetNoClaimReds([], 4), []);
});

test('the helpers are imported from bareguard and bareloop keeps no copy of their logic', () => {
  const chk = src('sheetchecks.js');
  assert.match(chk, /import \{[^}]*\bcheckTables\b[^}]*\} from 'bareguard'/);
  for (const gone of ['numbersSaid', 'NUMBER_CMPS', 'DATE_CMPS', 'COLUMN_STRING_FIELDS', 'COLUMN_OPERAND_FIELDS', 'COLUMN_CELL_FIELDS', 'COLUMN_LIST_FIELDS']) assert.equal(chk.includes(gone), false, `sheetchecks.js holds no ${gone}`);
  assert.equal(/^import .*createRubric/m.test(chk), false, 'sheetchecks.js builds no rubric of its own');
  assert.match(chk, /columnAt/, 'sheetCheckColumns reads the vocabulary\'s columnAt');
  const off = src('sheetoffer.js');
  assert.match(off, /import \{[^}]*\bcheckSchema\b[^}]*\} from 'bareguard'/);
  for (const gone of ['function fieldSchema', 'condition-list', 'band-list', 'date-format-list']) assert.equal(off.includes(gone), false, `sheetoffer.js holds no ${gone}`);
  assert.equal(off.includes("'gt', 'gte'"), false, 'WHERE_CMPS is read from the vocabulary, not copied');
  const bld = src('sheetbuild.js');
  assert.match(bld, /import \{[^}]*\bclaimSchema\b[^}]*\bgroundedLiterals\b[^}]*\} from 'bareguard'|import \{[^}]*\bgroundedLiterals\b[^}]*\bclaimSchema\b[^}]*\} from 'bareguard'/);
  assert.match(bld, /\brunTableChecks\b/);
  for (const gone of ['COLUMN_STRING_FIELDS', 'headerUnion']) assert.equal(Object.hasOwn(sheetchecks, gone) || Object.hasOwn(sheetoffer, gone), false, gone);
});

test('the drafter\'s check schema is bareguard\'s checkSchema (plus covers, minus the free-text field)', () => {
  const t = tablesOf();
  const bg = /** @type {any} */ (checkSchema({ rules: ['cells', 'table'], columns: t.aging.header, tables: ['aging'] }));
  const mine = /** @type {any} */ (sheetChecksProp(t)).items;
  assert.deepEqual(Object.keys(mine.properties).sort(), [...Object.keys(bg.properties).filter((k) => k !== 'text'), 'covers'].sort());
  assert.deepEqual(mine.properties.where.items, bg.properties.where.items);
  assert.deepEqual(mine.properties.dateFormats, bg.properties.dateFormats);
  assert.deepEqual(WHERE_CMPS, /** @type {any} */ (rubricVocabulary).rules.cells.fields.where.cmps);
  assert.deepEqual(mine.properties.table.enum, ['aging'], 'the table is picked from the real sheet labels');
  assert.equal(sheetChecksProp({}), null, 'no sheet, no schema');
});

test('sheetSuggestProp: each suggestion names its job line, and that line is an enum of the real sheet lines only', () => {
  const p = /** @type {any} */ (sheetSuggestProp(tablesOf(), [2, 5]));
  assert.deepEqual(p.items.properties.line.enum, [2, 5]);
  assert.ok(p.items.required.includes('line'));
  assert.equal(p.type, 'array');
  assert.equal(p.maxItems, MAX_SHEET_CHECKS);
  assert.equal(/** @type {any} */ (sheetSuggestProp(tablesOf(), [])).items.properties.line.minimum, 1, 'with no line list, any real line number');
});

test('the offer lists every op with bareguard\'s example, and the rules say where numbers and dates must come from', () => {
  const brief = sheetOpsBrief().join('\n');
  for (const op of Object.keys(/** @type {any} */ (rubricVocabulary).rules.cells.ops)) assert.ok(brief.includes(`- ${op}:`), op);
  const rules = sheetOfferRules(['aging'], [2, 5]).join('\n');
  assert.match(rules, /The job's sheet lines are 2, 5/);
  assert.match(rules, /a number the person wrote on that job line/);
  assert.match(rules, /Never make a number or a date up/);
  assert.match(rules, /1 to 20 suggestions/);
  assert.equal(/declaration|close\.sheet|\bAsk\b|step's reads/.test(rules), false, 'no fwd declaration words: bareloop has no such field');
});

test('an agreed column is a ~ rule the code wrote; its words are read back, and nothing else is one', () => {
  const rule = columnRuleWords('price', 'Amount');
  assert.equal(isColumnChoiceRule(rule), true);
  assert.deepEqual(columnChoiceParts(rule), { column: 'Amount', word: 'price' });
  for (const other of ['Amount over 500', "use the column 'Amount'", 'use the column Amount for price', 7]) { assert.equal(isColumnChoiceRule(other), false, String(other)); assert.equal(columnChoiceParts(other), null); }
  assert.equal(agreedColumnWords({ line: 2, word: 'price', column: 'Amount' }), "- The person agreed that on line 2 the word 'price' means the column 'Amount'. If a check on that line needs it, suggest it on that column.");
});

test('swapColumnWord is not copied: S1\'s ruleWithColumn already does that rewrite (and takes a plural)', () => {
  assert.equal('swapColumnWord' in sheetoffer, false);
  assert.equal(ruleWithColumn('Price over 500', 'Price', 'Amount'), 'Amount over 500');
});
