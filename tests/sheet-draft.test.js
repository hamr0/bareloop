// S1 at the drafting door (ported from fwdloop v0.35.0 test/m10-draft-sheet, minus the .docx parts): a CSV input with a `~` rule gets ONE sheet-word call (src/sheetlook.js) in place of the page-word
// map; a `~` rule whose word is no column asks once, at $0 in these tests (fake provider), and Agree rewrites that rule's own words in place - no line is added. A job with no CSV is byte-identical to before.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { runPageMap } from '../src/pagemap.js';
import { isSheetInput } from '../src/inputlook.js';
import { SHEET_MARK } from '../src/sheetlook.js';
import { reply } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'sheet-draft-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const sheetCopy = (/** @type {string} */ name) => { const f = join(tmp(), name); copyFileSync(join(HERE, 'fixtures', 'sheets', name), f); return f; };

/** the expenses sheet of the live walk (fwdloop flows/m10-walk-csv): an amount on every row, a tax on three, so one column fits. (The saved tests/fixtures/sheets/expenses.csv has a tax on every row: a tie, asked nothing.) */
const walkSheet = () => {
  const f = join(tmp(), 'expenses.csv');
  writeFileSync(f, `${['Date,Description,Amount,Tax', ...Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')},Item ${i + 1},${600 + i}.50,${i < 3 ? `${i + 1}.25` : ''}`)].join('\n')}\n`);
  return f;
};
const W = (/** @type {string} */ word, from = 'line 2 rule 1', kind = 'number') => ({ from, word, kind });
const sheetReply = (/** @type {any[]} */ ...facts) => reply({ text: JSON.stringify({ facts }), costUsd: 0.002 });
const jobOf = (/** @type {string[]} */ rules) => [
  { n: 1, text: 'Read the expenses sheet', rule: '', rules: [] },
  { n: 2, text: 'list every expense over 500', rule: rules.join('; '), rules },
];
const EXPENSES_ASK = "no column 'Price'; 'Amount' has numbers in 12 of 12 rows. Use it? (your answer replaces that ~ rule on line 2).";

/**
 * One drafting run of authorCloseForJob over `file`, a fake provider that answers from `answers`, the real default look, a fake draft (authorFn) and a fake asker.
 * @param {{file: string, label: string, rules: string[], answers: any[], choose?: (q: any) => {choice: string, text?: string}, look?: Function}} o
 */
async function draftOver({ file, label, rules, answers, choose = () => ({ choice: 'agree' }), look }) {
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label, value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) throw new Error('unreachable');
  /** @type {any[]} */ const sent = [];
  let at = 0;
  const provider = { async generate(/** @type {any} */ messages) { sent.push(messages); const a = answers[Math.min(at, answers.length - 1)]; at += 1; return a; } };
  /** @type {any} */ let asked = null;
  /** @type {any} */ let seen = null;
  /** @type {any[]} */ const calls = [];
  const jobLines = jobOf(rules);
  const r = await authorCloseForJob({
    answers: { 1: `1. Read the expenses sheet\n2. list every expense over 500\n   ~ ${rules.join('\n   ~ ')}` }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(jobLines)), inputs: [{ n: 1, label, value: file }], writeScope: ['output/'], provider, ceilingUsd: 1, onCall: (/** @type {any} */ c) => calls.push(c),
    ...(look ? { lookFn: look } : {}),
    answerQuestions: async (o) => { asked = o; return { jobLines: JSON.parse(JSON.stringify(jobLines)), answers: { 1: 'x' }, choices: o.questions.map((q) => ({ key: q.key, ...choose(q) })) }; },
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (o) => { seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [], notes: [] }, genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  return { r, sent, asked, seen, calls };
}

test('isSheetInput: a file or URL input whose value ends .csv (any case) is a sheet; nothing else is', () => {
  assert.equal(isSheetInput({ n: 1, label: 'x', value: '/a/b/Expenses.CSV' }), true);
  assert.equal(isSheetInput({ n: 1, label: 'x', value: 'https://example.test/a.csv' }), true);
  assert.equal(isSheetInput({ n: 1, label: 'x', value: '/a/b/notes.txt' }), false);
  assert.equal(isSheetInput({ n: 1, label: 'x', value: '/a/b/csv' }), false);
  assert.equal(isSheetInput({ n: 1, label: 'x' }), false);
});

// DONE WHEN (spec S1): a draft with expenses.csv and `~ Price over 500` asks one column question at $0 and, after Agree, the rule reads `Amount over 500` with no added line.
test('a CSV with `~ Price over 500`: one sheet call, one column question, and Agree rewrites the rule in place - no line added', async () => {
  const file = walkSheet();
  const { r, sent, asked, seen } = await draftOver({ file, label: 'Expenses', rules: ['Price over 500'], answers: [sheetReply(W('Price'))] });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(sent.length, 1, 'one AI call for the one CSV');
  assert.ok(JSON.stringify(sent[0]).includes(SHEET_MARK), 'it is the sheet call, not the page map');
  assert.equal(asked.questions.length, 1);
  assert.deepEqual([asked.questions[0].line, asked.questions[0].rule, asked.questions[0].source, asked.questions[0].ask], [2, 1, 'look', 'reading']);
  assert.equal(asked.questions[0].question, EXPENSES_ASK);
  assert.equal(asked.questions[0].reading, 'Amount over 500');
  assert.deepEqual(seen.jobLines.map((/** @type {any} */ l) => l.n), [1, 2], 'no line was added');
  assert.deepEqual(seen.jobLines[1].rules, ['Amount over 500'], 'the rule reads the column, in place');
  assert.equal(seen.jobLines[1].text, 'list every expense over 500');
  assert.match(seen.answers[1], /Amount over 500/);
  assert.ok(!/Price over 500/.test(seen.answers[1]));
});

test('the sheet call is booked like the page call: onCall hears it once, labelled and priced, and the drafting book keeps its raw answer', async () => {
  const { calls } = await draftOver({ file: walkSheet(), label: 'Expenses', rules: ['Price over 500'], answers: [sheetReply(W('Price'))] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].label, 'sheet-map');
  assert.equal(calls[0].costUsd, 0.002);
  assert.match(calls[0].raw, /"word":"Price"/);
});

test('Drop it leaves the rule as written (Not checked); own words replace the rule one for one', async () => {
  const dropped = await draftOver({ file: walkSheet(), label: 'Expenses', rules: ['Price over 500'], answers: [sheetReply(W('Price'))], choose: () => ({ choice: 'drop' }) });
  assert.deepEqual(dropped.seen.jobLines[1].rules, ['Price over 500']);
  const own = await draftOver({ file: walkSheet(), label: 'Expenses', rules: ['Price over 500'], answers: [sheetReply(W('Price'))], choose: () => ({ choice: 'rule', text: 'Tax over 500' }) });
  assert.deepEqual(own.seen.jobLines[1].rules, ['Tax over 500']);
  assert.deepEqual(own.seen.jobLines.map((/** @type {any} */ l) => l.n), [1, 2]);
});

test('a `~` rule that already names a real header asks nothing', async () => {
  const { r, sent, asked } = await draftOver({ file: walkSheet(), label: 'Expenses', rules: ['Amount over 500'], answers: [sheetReply(W('Amount'))] });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(sent.length, 1);
  assert.equal(asked, null, 'nothing was asked');
});

const tieAsk = async (/** @type {(q: any) => {choice: string, text?: string}} */ choose, rules = ['Price over 500']) => draftOver({ file: sheetCopy('expenses.csv'), label: 'Expenses', rules, answers: [sheetReply(...rules.map((_, i) => W('Price', `line 2 rule ${i + 1}`)))], choose });

test('the REAL expenses.csv (an amount and a tax on every row): `~ Price over 500` asks ONE tie question with the columns [Amount, Tax]; nothing is Not checked', async () => {
  const { r, asked, sent } = await tieAsk(() => ({ choice: 'drop' }));
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(sent.length, 1);
  assert.equal(asked.questions.length, 1);
  const q = asked.questions[0];
  assert.deepEqual([q.line, q.rule, q.source, q.ask], [2, 1, 'look', 'reading']);
  assert.equal(q.question, "I found 2 columns matching 'Price': Amount, Tax. Choose one. (your answer replaces that ~ rule on line 2).");
  assert.deepEqual(q.columns, ['Amount', 'Tax']);
  assert.equal(q.reading, undefined, 'a tie has no single reading to Agree to');
});

test('tie: picking Amount gives [\'Amount over 500\'], picking Tax gives [\'Tax over 500\'], the lines are unchanged', async () => {
  for (const col of ['Amount', 'Tax']) {
    const { seen } = await tieAsk(() => ({ choice: 'column', text: col }));
    assert.deepEqual(seen.jobLines.map((/** @type {any} */ l) => l.n), [1, 2], 'no line added');
    assert.deepEqual(seen.jobLines[1].rules, [`${col} over 500`]);
    assert.equal(seen.jobLines[1].text, 'list every expense over 500');
  }
});

test('tie: another rule of the line naming Tax does NOT decide for Price - code asks (hamr 2026-11-17): `~ Tax under 50` + `~ Price over 500` asks one tie question for Price; picking Amount leaves rule 1 alone', async () => {
  const rules = ['Tax under 50', 'Price over 500'];
  const run = (/** @type {string} */ col) => draftOver({ file: sheetCopy('expenses.csv'), label: 'Expenses', rules, answers: [sheetReply(W('Price', 'line 2 rule 2'))], choose: () => ({ choice: 'column', text: col }) });
  const { asked, seen } = await run('Amount');
  assert.equal(asked.questions.length, 1);
  assert.deepEqual([asked.questions[0].line, asked.questions[0].rule], [2, 2]);
  assert.deepEqual(asked.questions[0].columns, ['Amount', 'Tax']);
  assert.deepEqual(seen.jobLines[1].rules, ['Tax under 50', 'Amount over 500']);
  assert.deepEqual((await run('Tax')).seen.jobLines[1].rules, ['Tax under 50', 'Tax over 500']);
});

test('tie: Drop it leaves the rule as written (Not checked); the block refuses own words for a tie and the rule stays as written', async () => {
  assert.deepEqual((await tieAsk(() => ({ choice: 'drop' }))).seen.jobLines[1].rules, ['Price over 500']);
  assert.deepEqual((await tieAsk(() => ({ choice: 'rule', text: 'Amount plus Tax over 500' }))).seen.jobLines[1].rules, ['Price over 500']);
});

test('tie: a column that is not one of the tied columns is refused by the block and the question stays open', async () => {
  const { CheckBlock } = await import('../src/checkblock.js');
  const { applySheetWords } = await import('../src/sheetlook.js');
  const { questionsOfBlock, applyChoices } = await import('../src/blockasks.js');
  const text = readFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), 'utf8');
  const jl = [{ n: 2, text: 'list every expense over 500', rule: 'Price over 500', rules: ['Price over 500'] }];
  const block = new CheckBlock({ texts: { Expenses: text }, labels: ['Expenses'], asks: true, split: true });
  block.fromJob(jl);
  block.addSheetAsks(applySheetWords(text, [W('Price')], jl, 'Expenses').asks);
  block.reconcile();
  const [q] = questionsOfBlock(block);
  const refused = applyChoices(block, [{ key: q.key, choice: 'column', text: 'Date' }]);
  assert.equal(refused.length, 1);
  assert.match(refused[0].why, /not one of the columns/);
  assert.match(applyChoices(block, [{ key: q.key, choice: 'rule', text: 'Amount over 500' }])[0].why, /not one of the choices/);
  assert.equal(block.open.length, 1, 'still asked');
  assert.deepEqual(applyChoices(block, [{ key: q.key, choice: 'agree' }]).map((x) => x.key), [q.key], 'there is no single reading to Agree to');
});

test('tie: it counts toward the 3-ask cap like any ask - four tie questions stop with the list at $0', async () => {
  const rules = ['Price over 500', 'Cost over 500', 'Fee over 500', 'Total over 500'];
  const { r, sent } = await draftOver({ file: sheetCopy('expenses.csv'), label: 'Expenses', rules, answers: [sheetReply(W('Price', 'line 2 rule 1'), W('Cost', 'line 2 rule 2'), W('Fee', 'line 2 rule 3'), W('Total', 'line 2 rule 4'))] });
  assert.equal(sent.length, 1);
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'look-asks-too-many');
});

test('tie of five columns: a column pick reaches any of them (the box lists all five in its picker, see tests/sheet-tie-box.test.js)', async () => {
  const f = join(tmp(), 'five.csv');
  writeFileSync(f, `${['A,B,C,D,E', ...Array.from({ length: 5 }, (_, i) => `${i + 1},${i + 2},${i + 3},${i + 4},${i + 5}`)].join('\n')}\n`);
  const { asked, seen } = await draftOver({ file: f, label: 'Five', rules: ['Price over 500'], answers: [sheetReply(W('Price'))], choose: () => ({ choice: 'column', text: 'E' }) });
  assert.deepEqual(asked.questions[0].columns, ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(seen.jobLines[1].rules, ['E over 500']);
});

test('a word that is no column and no fit is Not checked with its reason, nothing asked', async () => {
  const csv = join(tmp(), 'notes.csv');
  writeFileSync(csv, 'Date,Note\n2026-09-01,a\n2026-09-02,b\n');
  const { r, asked } = await draftOver({ file: csv, label: 'Notes', rules: ['Price over 500'], answers: [sheetReply(W('Price'))] });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(asked, null);
});

test('a job whose ONLY input is a CSV takes the sheet look even with no `~` rule on any line (hamr 2026-11-17: every line of a sheet-only job is a sheet line)', async () => {
  const file = walkSheet();
  const { sent } = await draftOver({ file, label: 'Expenses', rules: [], answers: [reply({ text: JSON.stringify({ facts: [] }) })] });
  assert.equal(sent.length, 1);
  assert.ok(JSON.stringify(sent[0]).includes(SHEET_MARK), 'the sheet call');
});

test('a job with NO csv input behaves byte-identically to the page map alone: same calls, same drafter hand-off, same result', async () => {
  const page = join(tmp(), 'page.txt');
  writeFileSync(page, 'Flight A\nPrice $410\nFlight B\nPrice $520\n');
  const mapReply = () => reply({ text: JSON.stringify({ facts: [{ name: 'price', from: 'line 2 rule 1', shape: 'money', words: ['Price'], currency: ['$'] }] }), costUsd: 0.003 });
  const viaDefault = await draftOver({ file: page, label: 'Page', rules: ['under $450'], answers: [mapReply()], choose: () => ({ choice: 'agree' }) });
  const viaPageMap = await draftOver({ file: page, label: 'Page', rules: ['under $450'], answers: [mapReply()], choose: () => ({ choice: 'agree' }), look: runPageMap });
  assert.ok(viaDefault.sent.length >= 1);
  // the two runs seed their own scratch tree: only that path (and the seed commit's id) may differ
  const same = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x).replace(/[^"]*sheet-draft-[A-Za-z0-9]+/g, 'TMP').replace(/"seedRef":"[0-9a-f]+"/g, '"seedRef":"SEED"'));
  assert.deepEqual(viaDefault.sent, viaPageMap.sent, 'the provider saw the same requests');
  assert.ok(viaDefault.sent.every((m) => !JSON.stringify(m).includes(SHEET_MARK)));
  assert.deepEqual(same(viaDefault.seen), same(viaPageMap.seen), 'the drafter was handed the same thing');
  assert.deepEqual(same(viaDefault.asked), same(viaPageMap.asked));
  assert.deepEqual(same(viaDefault.r), same(viaPageMap.r));
  assert.deepEqual(viaDefault.calls, viaPageMap.calls, 'the same calls were booked');
});
