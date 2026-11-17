// S1: `runSheetLook` / `runLook` (src/sheetlook.js) - the sheet look's call, book, retry and spend plumbing is the page map's own (src/pagemap.js `runPageMap`), one call per CSV. Fake provider, $0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSheetLook, runLook, SHEET_MARK } from '../src/sheetlook.js';
import { reply } from './helpers.js';

const CSV = `${['Date,Description,Amount,Tax', ...Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')},Item ${i + 1},${600 + i}.50,${i < 3 ? `${i + 1}.25` : ''}`)].join('\n')}\n`;
const JOB = [{ n: 1, text: 'Read it', rule: '', rules: [] }, { n: 2, text: 'list every expense over 500', rule: 'Price over 500', rules: ['Price over 500'] }];
const INPUTS = [{ n: 1, label: 'Expenses' }];
const good = () => reply({ text: JSON.stringify({ facts: [{ from: 'line 2 rule 1', word: 'Price', kind: 'number' }] }), costUsd: 0.002 });
const prov = (/** @type {any[]} */ script, /** @type {any[]} */ seen = []) => { let i = 0; return { async generate(/** @type {any} */ m) { seen.push(m); const e = script[Math.min(i, script.length - 1)]; i += 1; if (e instanceof Error) throw e; return e; } }; };
const run = (/** @type {any} */ provider, /** @type {any} */ extra = {}) => runSheetLook({ texts: { Expenses: CSV }, inputs: INPUTS, jobLines: JOB, provider, sleep: async () => {}, ...extra });

test('one call for one CSV: booked as sheet-map with its cost, the ask carried on the look, the drop and ask of the word kept apart', async () => {
  const calls = /** @type {any[]} */ ([]);
  const r = await run(prov([good()]), { onCall: (/** @type {any} */ c) => calls.push(c) });
  assert.equal(r.state, 'PRESENT');
  assert.deepEqual(r.calls.map((c) => [c.label, c.costUsd]), [['sheet-map', 0.002]]);
  assert.equal(calls.length, 1);
  assert.equal(r.facts.look.sheetAsks.length, 1);
  assert.deepEqual(r.facts.look.facts, []);
});

test('an unreadable answer twice is a stop in plain words about the sheet, both calls booked', async () => {
  const r = await run(prov([reply({ text: 'no' }), reply({ text: 'still no' })]));
  assert.equal(r.state, 'ABSENT');
  assert.match(String(r.reason), /about the sheet was not readable twice/);
  assert.equal(r.calls.length, 2);
});

test('a transport failure is retried once and the failed attempt is booked UNPRICED; a second one is a stop', async () => {
  const boom = () => Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
  const ok = await run(prov([boom(), good()]));
  assert.equal(ok.state, 'PRESENT');
  assert.deepEqual(ok.calls.map((c) => c.costUsd), [null, 0.002]);
  const bad = await run(prov([boom(), boom()]));
  assert.equal(bad.state, 'ABSENT');
  assert.match(String(bad.reason), /the call about the sheet failed/);
});

test('the cap is checked BEFORE the call: spend already at the ceiling (the page map\'s, as priorCalls) means no call is made', async () => {
  const seen = /** @type {any[]} */ ([]);
  const r = await run(prov([good()], seen), { ceilingUsd: 0.01, priorCalls: [{ costUsd: 0.01, unpricedRounds: 0 }] });
  assert.equal(r.state, 'ABSENT');
  assert.equal(r.budgetStop, 'cap-halt');
  assert.equal(seen.length, 0);
});

test('runLook: a CSV with a ~ rule gets the sheet call only; the page map is not asked about it', async () => {
  const seen = /** @type {any[]} */ ([]);
  const r = await runLook({ texts: { Expenses: CSV }, inputs: INPUTS, jobLines: JOB, provider: prov([good()], seen), sheets: ['Expenses'], sleep: async () => {} });
  assert.equal(r.state, 'PRESENT');
  assert.equal(seen.length, 1);
  assert.ok(JSON.stringify(seen[0]).includes(SHEET_MARK));
});

test('runLook: a job with a CSV and a page runs the page map on the page and the sheet look on the CSV, and merges what each kept and dropped', async () => {
  const seen = /** @type {any[]} */ ([]);
  const pageMap = reply({ text: JSON.stringify({ facts: [{ name: 'price', from: 'line 2', shape: 'money', words: ['Price'], currency: ['$'] }] }), costUsd: 0.003 });
  const r = await runLook({
    texts: { Page: 'Flight A\nPrice $410\nFlight B\nPrice $520\n', Expenses: CSV }, inputs: [{ n: 1, label: 'Page' }, { n: 2, label: 'Expenses' }], jobLines: JOB,
    provider: prov([pageMap, good()], seen), sheets: ['Expenses'], sleep: async () => {},
  });
  assert.equal(r.state, 'PRESENT');
  assert.equal(seen.length, 2);
  assert.ok(!JSON.stringify(seen[0]).includes(SHEET_MARK) && JSON.stringify(seen[1]).includes(SHEET_MARK));
  assert.deepEqual(r.calls.map((c) => c.label), ['page-map', 'sheet-map']);
  assert.equal(r.facts.look.facts.length, 1, 'the page fact is kept');
  assert.equal(r.facts.look.sheetAsks.length, 1);
  assert.deepEqual(r.facts.inputs.map((/** @type {any} */ i) => i.label), ['Page', 'Expenses']);
});

test('runLook: with no sheet, or (a page input beside the CSV and) no ~ rule on any line, it is runPageMap and nothing else; a CSV-only job with no rule takes the sheet look', async () => {
  const seen = /** @type {any[]} */ ([]);
  const map = reply({ text: JSON.stringify({ facts: [] }) });
  await runLook({ texts: { Expenses: CSV }, inputs: INPUTS, jobLines: JOB, provider: prov([map], seen), sleep: async () => {} });
  const MIXED = [...INPUTS, { n: 2, label: 'Page' }];
  await runLook({ texts: { Expenses: CSV, Page: 'Flight A\nPrice $410\n' }, inputs: MIXED, jobLines: [{ n: 1, text: 'x', rule: '', rules: [] }], provider: prov([map], seen), sheets: ['Expenses'], sleep: async () => {} });
  assert.ok(seen.length >= 2);
  assert.ok(seen.every((m) => !JSON.stringify(m).includes(SHEET_MARK)));
  const only = /** @type {any[]} */ ([]);
  await runLook({ texts: { Expenses: CSV }, inputs: INPUTS, jobLines: [{ n: 1, text: 'x', rule: '', rules: [] }], provider: prov([map], only), sheets: ['Expenses'], sleep: async () => {} });
  assert.ok(only.some((m) => JSON.stringify(m).includes(SHEET_MARK)), 'CSV only: the sheet look');
});
