// S3: the stage, claims in the step file, the frozen sheet, the judge (ported from fwdloop v0.35.0 test/m10b-sheet-run, adapted to bareloop's frozen tree + source.json; docs/product/ITEM33-BUILD.md "Addendum 2026-11-17", S3).
// REAL data and the REAL seam: tests/fixtures/sheets/expenses.csv frozen by the real source door, the step file hand-written, graded by `runStage` and bareguard's real `checkStep` (no stub of the library seam). $0, no model.
// The truth (which rows are over 500) is computed here by a small quote-aware split, never by src/csv.js or bareguard.
// Imports of the S3 modules are dynamic so each test is its own red before the modules exist.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runStage, EXIT_RED, EXIT_GREEN, EXIT_STOP } from '../src/kinds.js';
import { proveRubricInputs } from '../src/source.js';
import { stepFileRel, rubricStepShapeReds, checkRubricParts, rubricGoal, lineBriefs, gradeStep, buildStepSpec, flattenStep, stepFileContract } from '../src/rubricstep.js';
import { jobSpecHash } from '../src/job.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEETS = join(HERE, 'fixtures', 'sheets');
const EXPENSES = join(SHEETS, 'expenses.csv');
const AGING = join(SHEETS, 'aging.csv');
const sheetrun = () => import('../src/sheetrun.js');
const sheetclaims = () => import('../src/sheetclaims.js');

/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'sheet-run-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

// ---- the truth, computed here: a quote-aware split of the fixture's lines ----
function cellsOf(/** @type {string} */ line) {
  const out = []; let cell = ''; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cell); cell = ''; } else cell += ch; }
  out.push(cell);
  return out;
}
const linesOf = (/** @type {string} */ file) => readFileSync(file, 'utf8').split('\n').filter((l) => l !== '').map(cellsOf);
const amount = (/** @type {string[]} */ c) => Number(c[2].replaceAll(',', ''));
/** the sheet row numbers (header is row 1) whose Amount is over 500, and their sum */
const OVER = linesOf(EXPENSES).map((c, i) => [i + 1, amount(c)]).slice(1).filter(([, v]) => v > 500).map(([r]) => r);
const OVER_SUM = Math.round(linesOf(EXPENSES).slice(1).filter((c) => amount(c) > 500).reduce((s, c) => s + amount(c), 0) * 100) / 100;
const WHERE = [{ column: 'Amount', cmp: 'gt', value: 500 }];
/** the three checks a person's "rows over 500, their count and total" builds: a rows check (rule row) plus a sumIf and a countIf of the SAME condition, each its own [agent] row */
const EXP_CHECKS = () => [
  { id: 'l1r1', rule: 'cells', table: 'expenses', claim: 'l1r1', op: 'rows', where: WHERE, covers: [1] },
  { id: 'l1a1', rule: 'cells', table: 'expenses', claim: 'l1a1', op: 'sumIf', column: 'Amount', where: WHERE, covers: [], row: 'agent' },
  { id: 'l1a2', rule: 'cells', table: 'expenses', claim: 'l1a2', op: 'countIf', where: WHERE, covers: [], row: 'agent' },
];
const part = async (/** @type {any[]} */ checks) => (await sheetclaims()).buildSheetPart({ text: 'rows over 500, their count and total', checks });
const stageOf = (/** @type {any} */ p, step = 1) => ({ name: `line-${step}`, kind: 'rubric-step', params: { step, parts: [p] } });

/** the real expenses.csv frozen by the real door as the input "expenses"; then the run-start sheet freeze */
async function world(/** @type {any[]} */ checks = EXP_CHECKS(), file = EXPENSES) {
  const into = join(tmp(), 'seed');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: file }], into });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  const stage = stageOf(await part(checks));
  const closeDecl = { stages: [stage] };
  const frozen = await (await sheetrun()).freezeSheets({ into, closeDecl });
  return { into, tree: r.prep.tree, stage, closeDecl, frozen };
}
const ctxOf = (/** @type {any} */ w) => ({ workdir: w.tree, seedRef: w.frozen?.seed ?? w.seed, gapKeep: '' });
const writeStep = (/** @type {any} */ w, /** @type {number} */ n, /** @type {any} */ body) => {
  mkdirSync(join(w.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(w.tree, stepFileRel(n)), typeof body === 'string' ? body : JSON.stringify(body));
};
const honest = () => ({ text: 'The rows over 500.', claims: { l1r1: { rows: OVER } } });

// ---- the lock and the run-start freeze ----
test('run start freeze: the tableSha of the FROZEN csv is recorded once on the sheet input of source.json, and on no other input', async () => {
  const w = await world();
  assert.equal(w.frozen.ok, true, JSON.stringify(w.frozen));
  const { tableSha } = await import('bareguard');
  const { parseCsv, sheetTable } = await import('../src/csv.js');
  const m = JSON.parse(readFileSync(join(w.into, 'source.json'), 'utf8'));
  const want = tableSha(sheetTable(parseCsv(readFileSync(join(w.tree, 'input', 'expenses.csv'), 'utf8'))));
  assert.match(want, /^[0-9a-f]{64}$/);
  assert.equal(m.inputs.find((/** @type {any} */ i) => i.label === 'expenses').tableSha, want, 'recorded from the FROZEN copy');
  // an input no sheet part names gets none
  const into = join(tmp(), 'seed2');
  const notes = join(tmp(), 'notes.csv');
  writeFileSync(notes, 'a,b\n1,2\n');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: EXPENSES }, { n: 2, label: 'notes', value: notes }], into });
  assert.equal(r.ok, true);
  const f = await (await sheetrun()).freezeSheets({ into, closeDecl: { stages: [stageOf(await part(EXP_CHECKS()))] } });
  assert.equal(f.ok, true);
  const m2 = JSON.parse(readFileSync(join(into, 'source.json'), 'utf8'));
  assert.equal('tableSha' in m2.inputs.find((/** @type {any} */ i) => i.label === 'notes'), false);
});

test('run start freeze: a sheet bareguard cannot read as a table (a ragged row) refuses at start, naming the input, $0, nothing written', async () => {
  const dir = tmp();
  const ragged = join(dir, 'ragged.csv');
  writeFileSync(ragged, `${readFileSync(EXPENSES, 'utf8')}2026-10-01,short row\n`);
  const into = join(dir, 'seed');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: ragged }], into });
  assert.equal(r.ok, true);
  const before = readFileSync(join(into, 'source.json'), 'utf8');
  const f = await (await sheetrun()).freezeSheets({ into, closeDecl: { stages: [stageOf(await part(EXP_CHECKS()))] } });
  assert.equal(f.ok, false);
  assert.match(f.error, /Input "expenses"/);
  assert.match(f.error, /cannot be read as a table/);
  assert.match(f.error, /Nothing spent\.$/);
  assert.equal(readFileSync(join(into, 'source.json'), 'utf8'), before, 'the record is untouched');
});

test('the numbered view: input/expenses.rows.txt is one line per CSV line, "row N: <line exactly as in the CSV>", header = row 1; no check text, no claim name', async () => {
  const w = await world();
  const view = join(w.tree, 'input', 'expenses.rows.txt');
  assert.equal(existsSync(view), true);
  const csv = readFileSync(EXPENSES, 'utf8').split('\n').filter((l) => l !== '');
  const want = `${csv.map((l, i) => `row ${i + 1}: ${l}`).join('\n')}\n`;
  assert.equal(readFileSync(view, 'utf8'), want);
  const text = readFileSync(view, 'utf8');
  for (const secret of ['l1r1', 'l1a1', 'l1a2', 'sumIf', 'countIf', 'rows', 'where', 'cmp', '> 500', 'claim']) {
    // "rows" only appears as the label word of the line prefix "row N:", never as a claim box name
    if (secret === 'rows') assert.equal(/\brows\b/.test(text.replace(/^row \d+:/gm, '')), false);
    else assert.equal(text.includes(secret), false, `the view carries "${secret}"`);
  }
  assert.equal(JSON.parse(readFileSync(join(w.into, 'source.json'), 'utf8')).inputs[0].view, 'input/expenses.rows.txt', 'recorded beside the input');
});

test('the numbered view keeps the real row number across a blank line, and a line break inside a quoted cell is a continuation, not a row', async () => {
  const dir = tmp();
  const f = join(dir, 'gaps.csv');
  writeFileSync(f, 'Date,Description,Amount,Tax\n2026-09-01,a,600,1\n\n2026-09-02,"two\nlines",700,2\n2026-09-03,c,10,3\n');
  const into = join(dir, 'seed');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: f }], into });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  const fz = await (await sheetrun()).freezeSheets({ into, closeDecl: { stages: [stageOf(await part(EXP_CHECKS()))] } });
  assert.equal(fz.ok, true, JSON.stringify(fz));
  const lines = readFileSync(join(r.prep.tree, 'input', 'gaps.rows.txt'), 'utf8').split('\n');
  assert.equal(lines[0], 'row 1: Date,Description,Amount,Tax');
  assert.equal(lines[1], 'row 2: 2026-09-01,a,600,1');
  assert.equal(lines.some((l) => l.startsWith('row 3:')), false, 'the blank line 3 is no row, and no row is renumbered');
  assert.equal(lines.includes('row 4: 2026-09-02,"two'), true, 'the record starts on line 4');
  assert.equal(lines.some((l) => l.startsWith('row 5:')), false, 'the continuation line is not a row');
  assert.equal(lines.some((l) => l.includes('lines",700,2') && !l.startsWith('row')), true);
  assert.equal(lines.includes('row 6: 2026-09-03,c,10,3'), true);
});

test('the freeze commits the view into the seed (it is never read as a worker write) and returns the new seed', async () => {
  const w = await world();
  assert.match(w.frozen.seed, /^[0-9a-f]{40}$/);
  const head = execFileSync('git', ['-C', w.tree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(head, w.frozen.seed);
  assert.equal(execFileSync('git', ['-C', w.tree, 'status', '--porcelain'], { encoding: 'utf8' }), '');
  assert.equal(JSON.parse(readFileSync(join(w.into, 'source.json'), 'utf8')).seed, w.frozen.seed);
});

test('a job with no sheet part freezes nothing: the record and the tree are byte-identical', async () => {
  const dir = tmp();
  const into = join(dir, 'seed');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: EXPENSES }], into });
  assert.equal(r.ok, true);
  const before = readFileSync(join(into, 'source.json'), 'utf8');
  const f = await (await sheetrun()).freezeSheets({ into, closeDecl: { stages: [stageOf({ text: 'nonEmpty', class: 'countable', check: 'nonEmpty' })] } });
  assert.deepEqual({ ok: f.ok, seed: f.seed }, { ok: true, seed: null });
  assert.equal(readFileSync(join(into, 'source.json'), 'utf8'), before);
});

// ---- the judge ----
test('DONE WHEN: on expenses.csv a hand-written step file with the right rows grades green, with the real checkStep; the sum and count checks need no number from the worker', async () => {
  assert.ok(OVER.length > 10, 'the truth is not trivial');
  const w = await world();
  writeStep(w, 1, honest());
  const r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.verdict, 'green', r.gapLines.join('\n'));
  assert.equal(r.exitCode, EXIT_GREEN);
});

test('DONE WHEN: a claim with one row too many (18 where the truth is 17) grades red naming the row; one row missing names the missing row; no cell text', async () => {
  const w = await world();
  const extra = linesOf(EXPENSES).map((c, i) => [i + 1, amount(c)]).slice(1).find(([, v]) => v <= 500)?.[0];
  assert.ok(typeof extra === 'number');
  writeStep(w, 1, { text: 'x', claims: { l1r1: { rows: [...OVER, extra].sort((a, b) => a - b) } } });
  let r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.verdict, 'red');
  assert.equal(r.exitCode, EXIT_RED);
  assert.match(r.gapLines.join('\n'), new RegExp(`do not qualify: ${extra}\\b`));
  writeStep(w, 1, { text: 'x', claims: { l1r1: { rows: OVER.slice(1) } } });
  r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines.join('\n'), new RegExp(`omits rows: ${OVER[0]}\\b`));
  for (const cell of ['Office', 'item 0', 'supplies']) assert.equal(r.gapLines.join('\n').includes(cell), false, 'no cell text in a red');
  assert.equal(typeof r.detail.redCount, 'number', 'the stage\'s trend number is its failing checks');
});

test('rows named as strings are red claim-malformed, never green', async () => {
  const w = await world();
  writeStep(w, 1, { text: 'x', claims: { l1r1: { rows: OVER.map(String) } } });
  const r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines.join('\n'), /l1r1/);
});

test('the worker\'s own number is not graded: a wrong total and count in the text and extra boxes with the right rows is green (code does the math)', async () => {
  const w = await world();
  writeStep(w, 1, { text: 'Total 999999.99 over 18 rows', claims: { l1r1: { rows: OVER }, l1a1: { value: 1 }, l1a2: { value: 3 } } });
  const r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.verdict, 'green', r.gapLines.join('\n'));
});

test('a step with a sheet part and no "claims" key is red "answer the claim boxes", never a crash', async () => {
  const w = await world();
  writeStep(w, 1, { text: 'I did the job' });
  const r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.verdict, 'red');
  assert.equal(r.exitCode, EXIT_RED);
  assert.match(r.gapLines.join('\n'), /answer the claim boxes/);
  assert.equal(r.gapLines.filter((l) => /answer the claim boxes/.test(l)).length, 1, 'said once, not once per check');
});

test('the signed Negative: one cell of the frozen sheet changed after the run started stops the check ($0, exit 97), naming the input', async () => {
  const w = await world();
  writeStep(w, 1, honest());
  const f = join(w.tree, 'input', 'expenses.csv');
  writeFileSync(f, readFileSync(f, 'utf8').replace('item 0,336.19', 'item 0,336.20'));
  const r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.exitCode, EXIT_STOP);
  assert.match(r.gapLines.join('\n'), /input "expenses"/);
  assert.notEqual(r.verdict, 'green');
});

test('a run that recorded no table fingerprint for the sheet is a stop naming the input, never green', async () => {
  const dir = tmp();
  const into = join(dir, 'seed');
  const r0 = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: EXPENSES }], into });
  assert.equal(r0.ok, true);
  if (!r0.ok) throw new Error('unreachable');
  const w = { tree: r0.prep.tree, seed: r0.prep.manifest.seed, stage: stageOf(await part(EXP_CHECKS())) };
  writeStep(w, 1, honest());
  const r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.exitCode, EXIT_STOP);
  assert.match(r.gapLines.join('\n'), /input "expenses": this run recorded no table fingerprint/);
});

test('the view is never graded: rewriting input/expenses.rows.txt changes no verdict', async () => {
  const w = await world();
  writeStep(w, 1, honest());
  writeFileSync(join(w.tree, 'input', 'expenses.rows.txt'), 'row 2: tampered\n');
  const r = await runStage(w.stage, ctxOf(w));
  assert.equal(r.verdict, 'green');
});

test('aging: days and bands boxes (daysSince + band) and a table check grade green with the right answer, red naming one wrong band row', async () => {
  const dir = tmp();
  const into = join(dir, 'seed');
  const r0 = await proveRubricInputs({ inputs: [{ n: 1, label: 'aging', value: AGING }], into });
  assert.equal(r0.ok, true);
  if (!r0.ok) throw new Error('unreachable');
  const ISO = [{ column: 'Due date', format: 'YYYY-MM-DD' }];
  const BANDS = [{ name: 'Current', lte: 0 }, { name: '1-30', gte: 1, lte: 30 }, { name: '31-60', gte: 31, lte: 60 }, { name: '61-90', gte: 61, lte: 90 }, { name: '90+', gt: 90 }];
  const AS_OF = '2026-10-11';
  const checks = [
    { id: 'l2r1', rule: 'cells', table: 'aging', claim: 'ageDays', op: 'daysSince', column: 'Due date', asOf: AS_OF, dateFormats: ISO, covers: [1] },
    { id: 'l2r2', rule: 'cells', table: 'aging', claim: 'bucket', op: 'band', column: 'Due date', asOf: AS_OF, dateFormats: ISO, bands: BANDS, covers: [2] },
    { id: 'l2a1', rule: 'table', table: 'aging', op: 'noDuplicates', column: 'Invoice #', covers: [], row: 'agent' },
  ];
  const stage = stageOf(await part(checks), 2);
  assert.equal((await (await sheetrun()).freezeSheets({ into, closeDecl: { stages: [stage] } })).ok, true);
  const dayDiff = (/** @type {string} */ from, /** @type {string} */ to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  const bandOf = (/** @type {number} */ d) => (d <= 0 ? 'Current' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+');
  const rows = linesOf(AGING).map((c, i) => [i + 1, c[2]]).slice(1);
  const days = Object.fromEntries(rows.map(([r, d]) => [String(r), dayDiff(String(d), AS_OF)]));
  const bands = Object.fromEntries(Object.entries(days).map(([r, d]) => [r, bandOf(d)]));
  const w = { tree: r0.prep.tree, seed: r0.prep.manifest.seed };
  writeStep(w, 2, { text: 'aged', claims: { ageDays: { days }, bucket: { bands } } });
  let res = await runStage(stage, ctxOf(w));
  assert.equal(res.verdict, 'green', res.gapLines.join('\n'));
  writeStep(w, 2, { text: 'aged', claims: { ageDays: { days }, bucket: { bands: { ...bands, 3: 'Current' } } } });
  res = await runStage(stage, ctxOf(w));
  assert.equal(res.verdict, 'red');
  assert.match(res.gapLines.join('\n'), /: 3\b/);
});

// ---- stage shape (the validator) ----
test('stage shape: a table-only sheet part is red (it judges the sheet itself and leaves the step nothing to answer)', async () => {
  const bad = { text: 't', class: 'sheet', checks: [{ id: 'l1a1', rule: 'table', table: 'aging', op: 'noDuplicates', column: 'Invoice #' }] };
  const reds = rubricStepShapeReds({ step: 1, parts: [bad] }, 'stages[0].params');
  assert.ok(reds.some((r) => /table check/.test(r.detail) && /nothing to answer/.test(r.detail)), JSON.stringify(reds));
});

test('(i) a claim named like a box type (rows, value, days, bands) is a stage-shape red; "ageDays" is fine', async () => {
  for (const name of ['rows', 'value', 'days', 'bands']) {
    const p = { text: 't', class: 'sheet', checks: [{ id: 'l1r1', rule: 'cells', table: 'aging', claim: name, op: 'rows', where: WHERE }] };
    const reds = rubricStepShapeReds({ step: 1, parts: [p] }, 'stages[0].params');
    assert.ok(reds.some((r) => r.path.endsWith('.claim') && r.detail.includes(name)), `${name}: ${JSON.stringify(reds)}`);
  }
  const ok = { text: 't', class: 'sheet', checks: [{ id: 'l1r1', rule: 'cells', table: 'aging', claim: 'ageDays', op: 'daysSince', column: 'Due date', asOf: '2026-10-11', dateFormats: [{ column: 'Due date', format: 'YYYY-MM-DD' }] }] };
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [ok] }, 'stages[0].params'), []);
  const { BOX_TYPES } = await sheetclaims();
  for (const name of ['rows', 'value', 'days', 'bands']) assert.ok(BOX_TYPES.includes(name), `bareguard's boxes include ${name}`);
});

test('stage shape: a claim named "text" is red (it would overwrite the step\'s text); two sheet parts, a sheet and a fact on one line, an unknown check field, a sheet that is also quoted are each red', async () => {
  const mk = (/** @type {any} */ over) => ({ text: 't', class: 'sheet', checks: [{ id: 'l1r1', rule: 'cells', table: 'expenses', claim: 'l1r1', op: 'rows', where: WHERE, ...over }] });
  assert.ok(rubricStepShapeReds({ step: 1, parts: [mk({ claim: 'text' })] }, 'p').some((r) => r.path.endsWith('.claim')));
  assert.ok(rubricStepShapeReds({ step: 1, parts: [mk({}), mk({ id: 'l1r2', claim: 'l1r2' })] }, 'p').some((r) => /one sheet part/.test(r.detail)));
  const fact = { text: 'f', class: 'fact', source: 'expenses', facts: [{ name: 'x', shape: 'phrase', phrase: 'y' }] };
  assert.ok(rubricStepShapeReds({ step: 1, parts: [mk({}), fact] }, 'p').some((r) => /facts line/.test(r.detail)));
  assert.ok(rubricStepShapeReds({ step: 1, parts: [mk({ bogusField: 1 })] }, 'p').some((r) => r.path.endsWith('.bogusField')));
  const cited = { text: 'c', class: 'countable', check: 'cited', source: 'expenses' };
  assert.ok(rubricStepShapeReds({ step: 1, parts: [mk({}), cited] }, 'p').some((r) => /quoted/.test(r.detail)));
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [mk({})] }, 'p'), []);
});

test('drafting rule: a sheet part naming an input the job does not have is a red naming the labels', async () => {
  /** @type {any[]} */
  const reds = [];
  const stages = [stageOf({ text: 't', class: 'sheet', checks: [{ id: 'l1r1', rule: 'cells', table: 'nowhere', claim: 'l1r1', op: 'rows', where: WHERE }] })];
  checkRubricParts(stages, { inputLabels: ['expenses'], red: (code, path, detail) => reds.push({ code, path, detail }) });
  assert.ok(reds.some((r) => r.code === 'rubric-part-source' && /"nowhere"/.test(r.detail) && /"expenses"/.test(r.detail)), JSON.stringify(reds));
});

// ---- the worker's brief: the box, never the check ----
test('request construction: the worker brief carries each box\'s worked example and the claim names, and NOTHING of the checks (no op, condition, bound or column)', async () => {
  const dir = tmp();
  const checks = [
    ...EXP_CHECKS(),
    { id: 'l1a3', rule: 'cells', table: 'expenses', claim: 'ageDays', op: 'daysSince', column: 'Date', asOf: '2026-10-11', dateFormats: [{ column: 'Date', format: 'YYYY-MM-DD' }], covers: [], row: 'agent' },
    { id: 'l1a4', rule: 'table', table: 'expenses', op: 'noDuplicates', column: 'Description', covers: [], row: 'agent' },
  ];
  const p = await part(checks);
  const closeDecl = { stages: [stageOf(p)] };
  const goal = rubricGoal({ jobLines: [{ n: 1, text: 'List the big expenses and what they add up to', rule: '' }], files: [{ label: 'expenses', rel: 'input/expenses.csv' }], confirmedGoal: null, closeDecl });
  void dir;
  const { rubricVocabulary } = await import('bareguard');
  const ex = rubricVocabulary.rules.cells.ops;
  // the boxes: one per claim name; the rows box is the worked example of the rows op, as bareguard has it
  assert.ok(goal.includes(JSON.stringify(ex.rows.example.output.answer)), 'the rows box example');
  assert.ok(goal.includes(JSON.stringify(ex.daysSince.example.output.answer)), 'the days box example');
  assert.ok(goal.includes('"l1r1"') && goal.includes('"ageDays"'), 'the claim names');
  assert.ok(goal.includes('never a cell reference and never a formula'));
  assert.ok(goal.includes('input/expenses.rows.txt'), 'the numbered view is listed as the second input, with the words to read it for row numbers');
  assert.match(goal, /numbered by its sheet row/);
  // the sum and count claims are the SAME rows box as the rows check (one condition): one field, not three
  assert.equal(goal.includes('"l1a1"'), false);
  assert.equal(goal.includes('"l1a2"'), false);
  for (const secret of ['sumIf', 'countIf', 'daysSince', 'noDuplicates', 'where', 'cmp', '500', 'Amount', 'Tax', 'asOf', '2026-10-11', 'dateFormats', 'YYYY-MM-DD', 'gt', 'lte', 'tolerance', 'op']) {
    // the person's own line words and the example values of bareguard are the only text; a check's own field never appears
    const hit = secret === '500' || secret === 'op' ? new RegExp(`\\b${secret}\\b`).test(goal.replace(/\{"rows":\[2,3\]\}/g, '')) : goal.includes(secret);
    assert.equal(hit, false, `the worker brief carries "${secret}"`);
  }
  const sheetLine = lineBriefs(closeDecl).find((b) => b.line === 1);
  assert.ok(sheetLine && /SHEET line/.test(sheetLine.text) && /"claims"/.test(sheetLine.text) && /no "cites"/.test(sheetLine.text));
});

test('a job with no sum or count check is not told that code adds up; one with sumIf or countIf is told to name the rows and not to add up', async () => {
  const noMath = await part([EXP_CHECKS()[0]]);
  const withMath = await part(EXP_CHECKS());
  const t1 = lineBriefs({ stages: [stageOf(noMath)] })[0].text;
  const t2 = lineBriefs({ stages: [stageOf(withMath)] })[0].text;
  assert.equal(/code adds|code does/.test(t1), false);
  assert.match(t2, /code does that/);
});

test('the sum and count of one condition share the rows box: buildSheetPart makes their claim the rows check\'s claim, keeps every id, and the part keeps the checks as signed data', async () => {
  const p = await part(EXP_CHECKS());
  assert.equal(p.class, 'sheet');
  assert.deepEqual(p.checks.map((/** @type {any} */ c) => [c.id, c.claim]), [['l1r1', 'l1r1'], ['l1a1', 'l1r1'], ['l1a2', 'l1r1']]);
  assert.deepEqual(p.checks.map((/** @type {any} */ c) => c.op), ['rows', 'sumIf', 'countIf'], 'the signed ops are what the person was shown');
  const { gradedChecks, sheetClaims } = await sheetclaims();
  const g = gradedChecks(p.checks);
  assert.deepEqual(g.map((/** @type {any} */ c) => c.op), ['rows'], 'graded: one rows check; the sum and count ride on its rows');
  assert.deepEqual(sheetClaims(p.checks).map((/** @type {any} */ c) => c.claim), ['l1r1']);
});

// ---- (iii) code does the math ----
test('(iii) the delivered report carries code\'s total and count from the rows named, never the worker\'s number', async () => {
  const w = await world();
  writeStep(w, 1, { text: 'The total is 12345.67 over 99 rows', claims: { l1r1: { rows: OVER }, l1a1: { value: 12345.67 }, l1a2: { value: 99 } } });
  const wrote = await (await sheetrun()).writeSheetTotals({ workdir: w.tree, closeDecl: w.closeDecl });
  assert.equal(wrote.ok, true, JSON.stringify(wrote));
  const file = join(w.tree, 'output', 'steps', '1.total.txt');
  const text = readFileSync(file, 'utf8');
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.ok(text.includes(`Total of rows ${OVER.join(', ')}: ${fmt(OVER_SUM)} (computed by code from the rows named)`), text);
  assert.ok(text.includes(`Count of rows ${OVER.join(', ')}: ${OVER.length} (computed by code from the rows named)`), text);
  assert.equal(text.includes('12345.67'), false, 'the worker\'s total never reaches the report');
  assert.equal(/\b99\b/.test(text), false, 'the worker\'s count never reaches the report');
});

test('(iii) code\'s figures equal the truth for the rows named, computed from the frozen table (not from a worker box): a row the worker names that is not a row of the sheet adds nothing', async () => {
  const w = await world();
  writeStep(w, 1, { text: 'x', claims: { l1r1: { rows: [...OVER, 9999, OVER[0]] } } });
  const wrote = await (await sheetrun()).writeSheetTotals({ workdir: w.tree, closeDecl: w.closeDecl });
  assert.equal(wrote.ok, true);
  const text = readFileSync(join(w.tree, 'output', 'steps', '1.total.txt'), 'utf8');
  assert.ok(text.includes(`: ${OVER_SUM.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (computed`), text);
  assert.equal(text.includes('9999'), false);
});

test('(iii) a named row whose summed cell holds no number is "not computed", naming the row number and the column, never a guessed figure; a blank cell is skipped', async () => {
  const dir = tmp();
  const f = join(dir, 'expenses.csv');
  writeFileSync(f, 'Date,Description,Amount,Tax\n2026-09-01,a,600,1\n2026-09-02,b,n/a,2\n2026-09-03,c,,3\n2026-09-04,d,700,4\n');
  const w = await world(EXP_CHECKS(), f);
  writeStep(w, 1, { text: 'x', claims: { l1r1: { rows: [2, 3] } } });
  let wrote = await (await sheetrun()).writeSheetTotals({ workdir: w.tree, closeDecl: w.closeDecl });
  assert.equal(wrote.ok, true);
  let text = readFileSync(join(w.tree, 'output', 'steps', '1.total.txt'), 'utf8');
  assert.match(text, /Total of rows 2, 3: not computed \(row 3 has no number in the column "Amount"\)/);
  writeStep(w, 1, { text: 'x', claims: { l1r1: { rows: [2, 4, 5] } } });
  wrote = await (await sheetrun()).writeSheetTotals({ workdir: w.tree, closeDecl: w.closeDecl });
  text = readFileSync(join(w.tree, 'output', 'steps', '1.total.txt'), 'utf8');
  assert.match(text, /Total of rows 2, 4, 5: 1,300 \(computed by code/);
});

test('(iii) a step with no sum or count check writes no total file; copyOut would deliver only what exists', async () => {
  const w = await world([EXP_CHECKS()[0]]);
  writeStep(w, 1, honest());
  const wrote = await (await sheetrun()).writeSheetTotals({ workdir: w.tree, closeDecl: w.closeDecl });
  assert.equal(wrote.ok, true);
  assert.equal(existsSync(join(w.tree, 'output', 'steps', '1.total.txt')), false);
});

// ---- old specs are untouched; a sheet part is a new hash ----
test('byte-diff gate: an old signed spec (no sheet part) grades, builds its rubric and briefs the worker byte-identically to the pre-S3 golden', async () => {
  const golden = JSON.parse(readFileSync(join(SHEETS, 'old-spec.golden.json'), 'utf8'));
  const FX = join(HERE, 'fixtures', 'part5');
  const SPEC = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
  const STAGE = SPEC.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const PAGE = readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8');
  const STEP = readFileSync(join(FX, 'mve5y8fa.step-1-2026-10-18.json'), 'utf8');
  const { createHash } = await import('node:crypto');
  const sha = (/** @type {string} */ t) => createHash('sha256').update(t).digest('hex');
  const label = STAGE.params.parts[0].source;
  const shas = { [label]: sha(PAGE) };
  /** @type {Record<string, any>} */
  const out = {};
  const grade = async (/** @type {string} */ name, /** @type {any} */ params, /** @type {string|null} */ bytes, /** @type {any} */ inputs = { [label]: PAGE }, /** @type {any} */ is = shas) => {
    out[name] = JSON.parse(JSON.stringify(await gradeStep({ params, bytes, outputBytes: bytes, inputs }, is)));
  };
  await grade('facts-green', STAGE.params, STEP);
  await grade('facts-missing-file', STAGE.params, null);
  await grade('facts-notjson', STAGE.params, '{"results": [');
  const obj = JSON.parse(STEP); obj.results = obj.results.slice(0, 1);
  await grade('facts-one-result', STAGE.params, JSON.stringify(obj));
  const prose = { step: 1, parts: [{ text: 'at most 5 words', class: 'countable', check: 'maxWords', value: 5 }, { text: 'a list', class: 'countable', check: 'maxListItems', value: 2 }] };
  await grade('prose-green', prose, JSON.stringify({ text: 'short answer here' }), {}, {});
  await grade('prose-red', prose, JSON.stringify({ text: 'this answer has far too many words in it' }), {}, {});
  await grade('prose-notobject', prose, '["x"]', {}, {});
  out.spec = buildStepSpec(STAGE.params, shas);
  out.flat = flattenStep(JSON.parse(STEP), [], STAGE.params.parts[0], []);
  out.flat2 = flattenStep({ text: 'x', cites: { a: [{ claim: 'c', quote: 'q' }] } }, ['a']);
  out.briefs = lineBriefs(SPEC.closeDecl);
  out.goal = rubricGoal({ jobLines: [{ n: 1, text: 'find the flights', rule: '' }], files: [{ label, rel: 'input/flights.txt' }], confirmedGoal: 'x', closeDecl: SPEC.closeDecl });
  out.contract = stepFileContract();
  assert.equal(JSON.stringify(out, null, 2), JSON.stringify(golden, null, 2));
});

test('a spec with a sheet part signs to a different hash than the same spec without it', async () => {
  const FX = join(HERE, 'fixtures', 'part5');
  const SPEC = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
  const withPart = structuredClone(SPEC);
  const st = withPart.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  st.params.parts.push(await part(EXP_CHECKS()));
  assert.notEqual(jobSpecHash(withPart), jobSpecHash(SPEC));
  assert.equal(jobSpecHash(structuredClone(SPEC)), jobSpecHash(SPEC), 'and the old spec still hashes the same as itself');
});
