// S1 (ported from fwdloop v0.35.0 test/m10-sheetask, m10-sheet-own-word, m17-f196-aging-ask; the .docx parts are not ported): the sheet's look - the model names the job's word for each rule
// (one call), CODE keeps a word only if it is a real column, and finds the column to offer when it is not. The asks are decided by code from the kept words (never from a model field).
// $0, synthetic sheets and the saved fixtures.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { sheetPrompt, parseSheetAnswer, applySheetWords, lookAtSheet, columnRuleWords, SHEET_MARK } from '../src/sheetlook.js';
import { dropRows, dropLine } from '../src/pagedropwords.js';
import { lineRules } from '../src/rubricstep.js';

/** the Not-checked lines of a look's drops, as the card writes them */
const notChecked = (/** @type {any[]} */ dropped, /** @type {any[]} */ jobLines) => dropRows(dropped).filter((r) => r.full).map((r) => dropLine(r, jobLines, lineRules));
const fixture = (/** @type {string} */ n) => readFileSync(new URL(`./fixtures/sheets/${n}`, import.meta.url), 'utf8');

const rowsOf = (/** @type {number} */ n, /** @type {number} */ amountRows, /** @type {number} */ taxRows) => Array.from({ length: n }, (_, i) => `2026-09-${String((i % 28) + 1).padStart(2, '0')},Office item ${i + 1},${i < amountRows ? `${101 + i}.50` : ''},${i < taxRows ? `${i + 1}.25` : ''}`);
const SHEET = (n = 40, a = 40, t = 10) => `${['Date,Description,Amount,Tax', ...rowsOf(n, a, t)].join('\n')}\n`;
const JOB = [{ n: 1, text: 'Add up the price of every invoice', rule: 'under 5000; matches the ledger', rules: ['under 5000', 'matches the ledger'] }];
const ans = (/** @type {any[]} */ facts) => JSON.stringify({ facts });
const W = (/** @type {string} */ word, from = 'line 1 rule 1', kind = 'number') => ({ from, word, kind });
const ASK_Q = "no column 'Price'; 'Amount' has numbers in 40 of 40 rows. Use it? (your answer replaces that ~ rule on line 1).";

test('the prompt carries the job, the header, the first rows, and the sheet mark the test provider recognises', () => {
  const p = sheetPrompt({ jobLines: JOB, label: 'aging', text: SHEET() });
  assert.ok(p.includes(SHEET_MARK));
  assert.ok(p.includes('LINE 1: Add up the price of every invoice') && p.includes('~ rule 1: under 5000') && p.includes('~ rule 2: matches the ledger'));
  assert.ok(p.includes('Date | Description | Amount | Tax'));
  assert.ok(p.includes('Office item 1') && !p.includes('Office item 30'), 'only the first rows');
});

test('parse: strict - a fact needs from, word and a kind; anything else is unreadable (no repair)', () => {
  assert.equal(parseSheetAnswer(ans([W('Price')])).ok, true);
  assert.equal(parseSheetAnswer('sure!').ok, false);
  assert.equal(parseSheetAnswer(ans([W('', 'line 1')])).ok, false);
  assert.equal(parseSheetAnswer(ans([W('Price', 'line 1', 'money')])).ok, false);
  assert.equal(parseSheetAnswer(ans([{ from: 'line 1', kind: 'number' }])).ok, false);
  assert.equal(parseSheetAnswer(JSON.stringify({ facts: 'x' })).ok, false);
});

test('a word that is a real column is kept; no ask, no drop', () => {
  const said = [{ n: 1, text: 'Add up the price of every invoice', rules: ['amount under 5000', 'matches the ledger'] }];
  const r = applySheetWords(SHEET(), [W('amount')], said, 'aging');
  assert.deepEqual(r.asks, []);
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(r.facts.map((f) => [f.line, f.forRule, f.column, f.source]), [[1, 1, 'Amount', 'aging']]);
});

test('a word that is not a column asks once, naming the column and the true count; the answer replaces that rule', () => {
  const r = applySheetWords(SHEET(), [W('Price')], JOB, 'aging');
  assert.equal(r.asks.length, 1);
  assert.deepEqual(r.asks[0], {
    line: 1, rule: 1, source: 'look', ask: 'reading', ruleText: 'under 5000', question: ASK_Q,
    reading: columnRuleWords('Price', 'Amount'), word: 'Price', column: 'Amount',
  });
  assert.deepEqual(r.facts, []);
});

test('the rule\'s own word is rewritten in place: "Price over 500" reads "Amount over 500" (a plural or another case of the word too)', () => {
  const job = (/** @type {string} */ rule) => [{ n: 2, text: 'list every expense over 500', rule, rules: [rule] }];
  const a = applySheetWords(fixture('expenses.csv'), [W('Price', 'line 2 rule 1')], job('Price over 500'), 'expenses');
  assert.equal(a.asks.length, 1);
  assert.equal(a.asks[0].reading, 'Amount over 500');
  const b = applySheetWords(fixture('expenses.csv'), [W('price', 'line 2 rule 1')], job('the Prices are over 500'), 'expenses');
  assert.equal(b.asks[0].reading, 'the Amount are over 500', 'the form the rule really says is the one replaced');
});

test('the same word twice for one rule is one ask', () => {
  assert.equal(applySheetWords(SHEET(), [W('Price'), W('Price')], JOB, 'aging').asks.length, 1);
});

test('two columns fit equally, or none fits, or the word is not a number: no ask, and a Not-checked line that says why', () => {
  const tie = applySheetWords(SHEET(40, 40, 40), [W('Price')], JOB, 'aging');
  assert.deepEqual(tie.asks, []);
  assert.deepEqual(notChecked(tie.dropped, JOB), ["line 1: \"under 5000\" — two columns fit 'Price' equally"]);
  const none = applySheetWords('Date,Note\n2026-09-01,a\n2026-09-02,b\n', [W('Price')], JOB, 'aging');
  assert.deepEqual(none.asks, []);
  assert.deepEqual(notChecked(none.dropped, JOB), ["line 1: \"under 5000\" — no column fits 'Price'"]);
  const other = applySheetWords(SHEET(), [W('Customer', 'line 1 rule 1', 'other')], JOB, 'aging');
  assert.deepEqual(other.asks, []);
  assert.deepEqual(notChecked(other.dropped, JOB), ["line 1: \"under 5000\" — there is no column 'Customer'"]);
});

test('the person already named the column in another rule of the line: the word is that column, nothing is asked again', () => {
  const lines = [{ n: 1, text: 'Add up the price of every invoice', rules: ['under 5000', "use the column 'Amount' for 'price'"] }];
  const r = applySheetWords(SHEET(), [W('price')], lines, 'aging');
  assert.deepEqual(r.asks, []);
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(r.facts.map((f) => [f.line, f.forRule, f.column]), [[1, 1, 'Amount']]);
});

test('a word with no rule (the job line itself) is asked about with the line as its text, and says the answer becomes the agent\'s check', () => {
  const r = applySheetWords(SHEET(), [W('Price', 'line 1')], JOB, 'aging');
  assert.equal(r.asks.length, 1);
  assert.equal(r.asks[0].rule, null);
  assert.equal(r.asks[0].ruleText, 'Add up the price of every invoice');
  assert.match(r.asks[0].question, /\(your answer becomes the agent's check on line 1\)\.$/);
});

test('lookAtSheet: one call; an unreadable answer is retried once, then it stops with the plain words', async () => {
  let n = 0;
  /** @type {number[]} */ const calls = [];
  const callModel = async (/** @type {string} */ _c, /** @type {number} */ attempt) => { calls.push(attempt); n += 1; return n === 1 ? { text: 'not json' } : { text: ans([W('Price')]) }; };
  const ok = await lookAtSheet({ label: 'aging', text: SHEET(), jobLines: JOB, callModel });
  assert.equal(ok.ok, true);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(ok.ok && ok.asks.length, 1);
  const bad = await lookAtSheet({ label: 'aging', text: SHEET(), jobLines: JOB, callModel: async () => ({ text: 'nope' }) });
  assert.equal(bad.ok, false);
  assert.match(String(bad.ok === false && bad.reason), /not readable twice/);
  assert.match(String(bad.ok === false && bad.reason), /about the sheet/);
  const cut = await lookAtSheet({ label: 'aging', text: SHEET(), jobLines: JOB, callModel: async () => ({ text: '{"facts":[', cutOff: true }) });
  assert.equal(cut.ok, false);
  const err = await lookAtSheet({ label: 'aging', text: SHEET(), jobLines: JOB, callModel: async () => ({ error: 'boom' }) });
  assert.match(String(err.ok === false && err.reason), /failed: boom/);
});

test('static: the ask is built from the kept word, the rule and the sheet only - code reads no other model field, and no column the model names', () => {
  const src = readFileSync(new URL('../src/sheetlook.js', import.meta.url), 'utf8');
  const parse = src.slice(src.indexOf('export function parseSheetAnswer'), src.indexOf('export function applySheetWords'));
  for (const k of ['from', 'word', 'kind']) assert.ok(parse.includes(`.${k}`), `parse reads ${k}`);
  assert.ok(!/\b(column|ask|question|reading)\b/.test(parse.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'the parser reads no column, ask, question or reading field');
});

test('after the answer the rule names the column, so the next look keeps it and asks nothing', () => {
  const asked = applySheetWords(SHEET(), [W('Price')], JOB, 'aging');
  const again = [{ n: 1, text: JOB[0].text, rules: ['under 5000', 'matches the ledger', asked.asks[0].reading] }];
  const next = applySheetWords(SHEET(), [W('Price')], again, 'aging');
  assert.deepEqual([next.asks.length, next.dropped.length, next.facts.map((f) => f.column)], [0, 0, ['Amount']]);
});

// F180 (live walk 2026-11-12): the word's OWN rule already names the column (the answer the person gave, added as a rule): asked no more.
const AR = `${['Customer,Amount', ...Array.from({ length: 8 }, (_, i) => `C${i + 1},${100 + i}.50`)].join('\n')}\n`;
const AR_RULES = ['every customer appears exactly once', 'total the balance due'];
const arJob = (/** @type {string[]} */ rules) => [{ n: 1, text: 'Read the aging report' }, { n: 2, text: 'Total the balance due per customer', rules }];
const arWords = (/** @type {any[]} */ more) => [W('customer', 'line 2 rule 1', 'other'), W('balance due', 'line 2 rule 2'), ...more];

test('F180: a rule that itself names the column answers its own word - no ask, and the column is a fact of that rule', () => {
  const rules = [...AR_RULES, "use the column 'Amount' for 'balance due'"];
  const r = applySheetWords(AR, arWords([W('Amount', 'line 2 rule 3'), W('balance due', 'line 2 rule 3')]), arJob(rules), 'aging');
  assert.deepEqual(r.asks, []);
  assert.ok(r.facts.some((f) => f.forRule === 3 && /amount/i.test(JSON.stringify(f))), JSON.stringify(r.facts));
});

test('F180: a rule that does NOT name the column still asks (rule 2 alone, rule 3 absent)', () => {
  const r = applySheetWords(AR, arWords([]), arJob(AR_RULES), 'aging');
  assert.deepEqual(r.asks.map((a) => [a.rule, a.word, a.column]), [[2, 'balance due', 'Amount']]);
});

// the live walk of 2026-10-21 (fwdloop flows/m10-walk-csv): the rule `Price over 500`, the header `Date,Description,Amount,Tax`
const EXP = fixture('expenses.csv');
const EXP_JOB = [{ n: 1, text: 'Read the expenses sheet' }, { n: 2, text: 'list every expense over 500', rules: ['Price over 500'] }];

test('own word: the look named "Amount" for the rule "Price over 500" - not a word of the job, so it is NOT kept; Not checked says why', () => {
  const r = applySheetWords(EXP, [W('Amount', 'line 2 rule 1')], EXP_JOB, 'expenses');
  assert.deepEqual(r.facts, [], 'the model\'s word is not kept as a column');
  assert.deepEqual(r.asks, []);
  assert.deepEqual(notChecked(r.dropped, EXP_JOB), ["line 2: \"Price over 500\" — the sheet look named 'Amount', which is not a word in your job, so it was not used."]);
});

test('own word: the person\'s own word "Price" (named by the look) asks once', () => {
  const r = applySheetWords(EXP, [W('Price', 'line 2 rule 1')], EXP_JOB, 'expenses');
  assert.equal(r.asks.length, 1);
  assert.match(r.asks[0].question, /^no column 'Price'; 'Amount' has numbers in 40 of 40 rows\. Use it\?/);
});

test('own word: a header the person did say is kept, case aside, with no ask', () => {
  const lines = [{ n: 2, text: 'list every expense over 500', rules: ['amount over 500'] }];
  const r = applySheetWords(EXP, [W('Amount', 'line 2 rule 1')], lines, 'expenses');
  assert.deepEqual([r.asks.length, r.dropped.length, r.facts.map((f) => f.column)], [0, 0, ['Amount']]);
});

test('own word: a plural of the person\'s header counts (F196: "amounts" is "Amount")', () => {
  const lines = [{ n: 2, text: 'list every expense over 500', rules: ['amounts over 500'] }];
  const r = applySheetWords(EXP, [W('amounts', 'line 2 rule 1')], lines, 'expenses');
  assert.deepEqual([r.asks.length, r.dropped.length, r.facts.map((f) => f.column)], [0, 0, ['Amount']]);
});

test('own word: the prompt asks for the job\'s own word as the job writes it, and no longer invites the model to copy a column name in its place', () => {
  const p = sheetPrompt({ jobLines: EXP_JOB, label: 'expenses', text: EXP });
  assert.ok(!p.includes("copy that column's name"), p);
  assert.match(p, /exactly as the job writes it/);
});

test('own word, through the look: a model that answers "Amount" gets no fact and no ask, but a Not-checked line', async () => {
  const r = await lookAtSheet({ label: 'expenses', text: EXP, jobLines: EXP_JOB, callModel: async () => ({ text: ans([W('Amount', 'line 2 rule 1')]) }) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && [r.facts.length, r.asks.length, r.dropped.length], [0, 0, 1]);
});

// F196 live bug (practice walk): line 2 of the aging job has the prose word "days past due" and a `~` rule 3 that names 'Due date'
const AGING = fixture('ar-aging.csv');
const AG_JOB = [
  { n: 1, text: 'Read the aging report' },
  { n: 2, text: 'For each invoice, work out the days past due as of 2026-10-11 and put it in its bucket: Current, 1-30, 31-60, 61-90, 90+', rules: ['every invoice appears exactly once', 'each invoice is in one bucket', "days past due = days since 'Due date' as of 2026-10-11"] },
];
const AG_WORDS = [
  W('invoice', 'line 2', 'other'), W('invoice', 'line 2 rule 1', 'other'), W('Due date', 'line 2 rule 3', 'other'),
  W('days past due', 'line 2'), W('days past due', 'line 2 rule 3'),
];

test('F196: a rule that names a header settles its words, and the prose word of that line is not asked either (no question at all)', () => {
  const r = applySheetWords(AGING, AG_WORDS, AG_JOB, 'aging');
  assert.deepEqual(r.asks, [], 'rule 3 names Due date: nothing is asked about days past due, from the rule or the prose');
  assert.deepEqual(r.facts.map((f) => [f.line, f.forRule, f.column]), [[2, 3, 'Due date']]);
});

test('F196 fault 2: with no header in the rule, a word in a rule and in the prose is asked once, by the rule (it replaces that rule)', () => {
  const job = [AG_JOB[0], { ...AG_JOB[1], rules: ['days past due is under 30'] }];
  const r = applySheetWords(AGING, [AG_WORDS[3], W('days past due', 'line 2 rule 1')], job, 'aging');
  assert.equal(r.asks.length, 1);
  assert.equal(r.asks[0].rule, 1);
  assert.match(r.asks[0].question, /your answer replaces that ~ rule on line 2\)\.$/);
  assert.equal(r.asks[0].reading, `${r.asks[0].column} is under 30`, 'the rule\'s own words, the word replaced by the column');
});

test('F196 fault 3: the prose word alone (no ~ rule) says the answer becomes the agent\'s check', () => {
  const job = [AG_JOB[0], { ...AG_JOB[1], rules: undefined }];
  const r = applySheetWords(AGING, [AG_WORDS[3]], job, 'aging');
  assert.equal(r.asks.length, 1);
  assert.equal(r.asks[0].rule, null);
  assert.match(r.asks[0].question, /\(your answer becomes the agent's check on line 2\)\.$/);
  assert.ok(!r.asks[0].question.includes('added as a new'));
});

test('F196: a rule with no column in its words and no such header is asked once, replacing that rule', () => {
  const csv = 'Date,Description,Amount,Tax\n2026-09-01,A,600.50,\n2026-09-02,B,700.50,\n';
  const job = [{ n: 2, text: 'list every expense over 500', rules: ['Price over 500'] }];
  const r = applySheetWords(csv, [W('Price', 'line 2 rule 1')], job, 'expenses');
  assert.equal(r.asks.length, 1);
  assert.match(r.asks[0].question, /\(your answer replaces that ~ rule on line 2\)\.$/);
});

test('F196 re-walk: the look returned no word "Due date" (only the prose and rule-3 asks) - rule 3 names the header, so code ties it: nothing is asked', () => {
  assert.deepEqual(applySheetWords(AGING, [AG_WORDS[3], AG_WORDS[4]], AG_JOB, 'aging').asks, []);
});

test('F196 panel walk: the look returned ONLY the prose ask for "days past due"; rule 3 says that word and names the header Due date - nothing is asked', () => {
  assert.deepEqual(applySheetWords(AGING, [AG_WORDS[3]], AG_JOB, 'aging').asks, []);
});

test('F196 panel walk control: a prose word no tied rule says is still asked (rule 3 names Due date but not "balance")', () => {
  assert.equal(applySheetWords(AGING, [W('balance', 'line 2')], AG_JOB, 'aging').asks.length, 1);
});
