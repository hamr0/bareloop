// S1 at the drafting door (ported from fwdloop v0.35.0 test/m10-draft-sheet, minus the .docx parts): a CSV input with a `~` rule gets ONE sheet-word call (src/sheetlook.js) in place of the page-word
// map; a `~` rule whose word is no column asks once, at $0 in these tests (fake provider), and Agree rewrites that rule's own words in place - no line is added. A job with no CSV is byte-identical to before.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
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

const W = (/** @type {string} */ word, from = 'line 2 rule 1', kind = 'number') => ({ from, word, kind });
const sheetReply = (/** @type {any[]} */ ...facts) => reply({ text: JSON.stringify({ facts }), costUsd: 0.002 });
const jobOf = (/** @type {string[]} */ rules) => [
  { n: 1, text: 'Read the expenses sheet', rule: '', rules: [] },
  { n: 2, text: 'list every expense over 500', rule: rules.join('; '), rules },
];
const EXPENSES_ASK = "no column 'Price'; 'Amount' has numbers in 40 of 40 rows. Use it? (your answer replaces that ~ rule on line 2).";

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
  const file = sheetCopy('expenses.csv');
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
  const { calls } = await draftOver({ file: sheetCopy('expenses.csv'), label: 'Expenses', rules: ['Price over 500'], answers: [sheetReply(W('Price'))] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].label, 'sheet-map');
  assert.equal(calls[0].costUsd, 0.002);
  assert.match(calls[0].raw, /"word":"Price"/);
});

test('Drop it leaves the rule as written (Not checked); own words replace the rule one for one', async () => {
  const dropped = await draftOver({ file: sheetCopy('expenses.csv'), label: 'Expenses', rules: ['Price over 500'], answers: [sheetReply(W('Price'))], choose: () => ({ choice: 'drop' }) });
  assert.deepEqual(dropped.seen.jobLines[1].rules, ['Price over 500']);
  const own = await draftOver({ file: sheetCopy('expenses.csv'), label: 'Expenses', rules: ['Price over 500'], answers: [sheetReply(W('Price'))], choose: () => ({ choice: 'rule', text: 'Tax over 500' }) });
  assert.deepEqual(own.seen.jobLines[1].rules, ['Tax over 500']);
  assert.deepEqual(own.seen.jobLines.map((/** @type {any} */ l) => l.n), [1, 2]);
});

test('a `~` rule that already names a real header asks nothing', async () => {
  const { r, sent, asked } = await draftOver({ file: sheetCopy('expenses.csv'), label: 'Expenses', rules: ['Amount over 500'], answers: [sheetReply(W('Amount'))] });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(sent.length, 1);
  assert.equal(asked, null, 'nothing was asked');
});

test('a word that is no column and no fit is Not checked with its reason, nothing asked', async () => {
  const csv = join(tmp(), 'notes.csv');
  writeFileSync(csv, 'Date,Note\n2026-09-01,a\n2026-09-02,b\n');
  const { r, asked } = await draftOver({ file: csv, label: 'Notes', rules: ['Price over 500'], answers: [sheetReply(W('Price'))] });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(asked, null);
});

test('a CSV input with no `~` rule on any line takes the page-word map as before (no sheet call)', async () => {
  const file = sheetCopy('expenses.csv');
  const { sent } = await draftOver({ file, label: 'Expenses', rules: [], answers: [reply({ text: JSON.stringify({ facts: [], cannot: [] }) })] });
  assert.ok(sent.length >= 1);
  assert.ok(sent.every((m) => !JSON.stringify(m).includes(SHEET_MARK)), 'no sheet call');
});

test('a job with NO csv input behaves byte-identically to the page map alone: same calls, same drafter hand-off, same result', async () => {
  const page = join(tmp(), 'page.txt');
  writeFileSync(page, 'Flight A\nPrice $410\nFlight B\nPrice $520\n');
  const mapReply = () => reply({ text: JSON.stringify({ facts: [{ name: 'price', from: 'line 2 rule 1', shape: 'money', words: ['Price'], currency: ['$'] }] }), costUsd: 0.003 });
  const viaDefault = await draftOver({ file: page, label: 'Page', rules: ['under $450'], answers: [mapReply()], choose: () => ({ choice: 'agree' }) });
  const viaPageMap = await draftOver({ file: page, label: 'Page', rules: ['under $450'], answers: [mapReply()], choose: () => ({ choice: 'agree' }), look: runPageMap });
  assert.ok(viaDefault.sent.length >= 1);
  assert.deepEqual(viaDefault.sent, viaPageMap.sent, 'the provider saw the same requests');
  assert.ok(viaDefault.sent.every((m) => !JSON.stringify(m).includes(SHEET_MARK)));
  assert.deepEqual(JSON.parse(JSON.stringify(viaDefault.seen)), JSON.parse(JSON.stringify(viaPageMap.seen)), 'the drafter was handed the same thing');
  assert.deepEqual(JSON.parse(JSON.stringify(viaDefault.asked)), JSON.parse(JSON.stringify(viaPageMap.asked)));
  assert.deepEqual(JSON.parse(JSON.stringify(viaDefault.r)), JSON.parse(JSON.stringify(viaPageMap.r)));
});
