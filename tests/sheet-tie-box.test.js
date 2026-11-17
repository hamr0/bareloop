// S1 tie (hamr 2026-11-17: "a column tie must ASK, never go Not checked"): the question box carries the tied columns in ONE choose-one picker (a select listing ALL of them, no cutoff) with Send, beside Drop it and the typed own words.
// The box (src/questionbox.js), the door's refusals and the panel session's send path. Real tests/fixtures/sheets/expenses.csv, fake provider, $0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boxFor, offersOf, refuseChoice, resolveChoice, CHOICE_SAYS } from '../src/questionbox.js';
import { applySheetWords } from '../src/sheetlook.js';
import { createSession } from '../src/panel/authorsession.js';
import { answerPromptLines } from '../src/authorrun.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'tie-box-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const keysHome = () => { const d = tmp('tie-box-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };

/** a look question as the check block hands it to the box, for `columns` tied */
const tieQ = (/** @type {string[]} */ columns) => ({ source: 'look', ask: 'reading', rule: 1, line: 2, question: `I found ${columns.length} columns matching 'Price': ${columns.join(', ')}. Choose one. (your answer replaces that ~ rule on line 2).`, columns });
const stepOf = (/** @type {string[]} */ columns) => ({ kind: 'answer', source: 'look', ask: 'reading', index: 1, total: 1, line: 2, rule: 1, question: tieQ(columns).question, offers: offersOf(tieQ(columns)) });

test('offers: a tie carries its columns, no Agree (there is no single reading), and Drop it', () => {
  assert.deepEqual(offersOf(tieQ(['Amount', 'Tax'])), { agree: false, drop: true, columns: ['Amount', 'Tax'] });
  assert.equal(offersOf({ source: 'look', ask: 'reading', rule: 1, reading: 'Amount over 500' }).columns, undefined, 'an ordinary reading ask has no columns');
});

test('the box: the tied columns are ONE picker (every column, sheet order) with Send; Drop it is the one button; there is NO box to type own words in', () => {
  const b = /** @type {any} */ (boxFor(stepOf(['Amount', 'Tax'])));
  assert.deepEqual(b.columns, ['Amount', 'Tax']);
  assert.deepEqual(b.choices, [{ choice: 'drop', label: 'Drop it' }]);
  assert.equal(b.orLabel, null, 'a closed question: no own-words box');
  assert.equal(b.text, "I found 2 columns matching 'Price': Amount, Tax. Choose one. (your answer replaces that ~ rule on line 2).");
  assert.equal(/** @type {any} */ (boxFor({ kind: 'answer', source: 'look', ask: 'reading', index: 1, total: 1, line: 2, rule: 1, question: 'q', offers: { agree: true, drop: true }, agreeWords: 'x' })).columns, undefined, 'an ordinary reading ask has no picker');
});

test('a 3-column tie lists 3 columns, in the order given', () => {
  assert.deepEqual(/** @type {any} */ (boxFor(stepOf(['Amount', 'Tax', 'Total']))).columns, ['Amount', 'Tax', 'Total']);
});

test('a 5-column tie lists all 5 (no cutoff), and every one is accepted by the door', () => {
  const cols = ['A', 'B', 'C', 'D', 'E'];
  const step = stepOf(cols);
  assert.deepEqual(/** @type {any} */ (boxFor(step)).columns, cols);
  for (const c of cols) assert.equal(refuseChoice(step, 'column', c), null);
  assert.equal(refuseChoice(step, 'rule', 'E over 500'), CHOICE_SAYS.pickColumn, 'own words are refused on a tie');
});

test('the door refuses an unknown column name, a column choice with no name, and a column choice on a question with no columns', () => {
  const step = stepOf(['Amount', 'Tax']);
  assert.equal(refuseChoice(step, 'column', 'Amount'), null);
  assert.equal(refuseChoice(step, 'column', 'Date'), CHOICE_SAYS.pickColumn);
  assert.equal(refuseChoice(step, 'column', ''), CHOICE_SAYS.pickColumn);
  assert.equal(refuseChoice(step, 'column'), CHOICE_SAYS.pickColumn);
  assert.equal(refuseChoice(step, 'rule', 'Amount over 500'), CHOICE_SAYS.pickColumn, 'own words are refused for a tie, in plain words');
  assert.match(CHOICE_SAYS.pickColumn, /pick one of the columns, or Drop it/);
  assert.equal(refuseChoice(step, 'drop'), null);
  assert.equal(refuseChoice(step, 'agree', ''), CHOICE_SAYS.notOffered);
  const plain = { kind: 'answer', source: 'look', ask: 'reading', rule: 1, offers: { agree: true, drop: true } };
  assert.equal(refuseChoice(plain, 'column', 'Amount'), CHOICE_SAYS.notOffered);
  assert.deepEqual(resolveChoice('column', 'Tax'), { value: 'Tax', shown: 'Tax' });
});

test('the CLI prints the tied columns as a numbered list', () => {
  const lines = answerPromptLines({ index: 1, total: 1, question: tieQ(['Amount', 'Tax']).question, line: 2, offers: offersOf(tieQ(['Amount', 'Tax'])) });
  assert.ok(lines.includes('  1. Amount') && lines.includes('  2. Tax'), lines.join('\n'));
  assert.ok(lines.some((l) => /Type the number of the column, or drop it\.$/.test(l)) && !lines.some((l) => /own words/.test(l)), lines.join('\n'));
});

// the panel: the real expenses.csv, the real tie ask from the look's own code, the answer posted as the box's button posts it
const expensesTie = () => {
  const f = join(tmp(), 'expenses.csv');
  copyFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), f);
  return f;
};
async function panelTie(/** @type {(session: any) => any} */ answer) {
  const file = expensesTie();
  const text = (await import('node:fs')).readFileSync(file, 'utf8');
  const jl = [{ n: 1, text: 'Read the expenses sheet', rule: '', rules: [] }, { n: 2, text: 'list every expense over 500', rule: 'Price over 500', rules: ['Price over 500'] }];
  const ask = applySheetWords(text, [{ from: 'line 2 rule 1', word: 'Price', kind: 'number' }], jl, 'Expenses').asks;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [],
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Expenses' }], look: { facts: [], prose: [], notFound: [], dropped: [], sheetAsks: ask } } };
  const PLAN = { goal: 'List expenses.', checks: [{ text: 'expenses are listed', fromLine: [1] }], notChecked: [], questions: [] };
  /** @type {any[]} */ const legs = [];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'tie-job', jobText: '1. Read the expenses sheet\n2. list every expense over 500\n~ Price over 500',
    inputs: `Expenses: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('tie-box-sess-'),
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [{ code: 'x', path: 'p', detail: 'stop after the ask' }] }; },
  });
  const until = async (/** @type {() => any} */ fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  return { session, legs, until, result: answer(session) };
}

test('the panel: the tie box carries the picker (Amount, Tax) and Drop it; an unknown column is refused with the question left open; the Tax button rewrites the rule in place', async () => {
  const { session, legs, until } = await panelTie(() => null);
  const ask = session.state.pendingAsk;
  assert.deepEqual(ask.box.columns, ['Amount', 'Tax']);
  assert.deepEqual(ask.box.choices.map((/** @type {any} */ c) => c.label), ['Drop it']);
  assert.equal(ask.box.text, "I found 2 columns matching 'Price': Amount, Tax. Choose one. (your answer replaces that ~ rule on line 2).");
  assert.equal(legs.length, 0);
  const bad = session.send('Date', 'column');
  assert.equal(bad.ok, false);
  assert.equal(bad.refused, 'bad-choice');
  assert.equal(session.state.pendingAsk?.kind, 'answer', 'the question stays open');
  assert.equal(session.send('', 'agree').ok, false, 'no single reading to agree to');
  const own = session.send('Amount over 500', 'rule');
  assert.equal(own.ok, false, 'own words are refused for a tie');
  assert.equal(own.error, CHOICE_SAYS.pickColumn);
  assert.equal(session.state.pendingAsk?.kind, 'answer');
  assert.equal(session.send('Tax', 'column').ok, true);
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), 'then the plan is confirmed as usual');
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => ['refused', 'error', 'prepared'].includes(session.state.phase)));
  assert.equal(legs.length, 1);
  assert.deepEqual(legs[0].jobLines.map((/** @type {any} */ l) => l.n), [1, 2], 'no line added');
  assert.deepEqual(legs[0].jobLines[1].rules, ['Tax over 500']);
});
