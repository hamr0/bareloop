// S4 item 5 (hamr 2026-11-17, option 1): a job word in the LINE'S OWN PROSE (no `~` rule) that is no column goes through the SAME flow as a `~` rule word: one ask (one fitting column: Agree / Drop it / own words; a tie: the
// closed column picker), the answer SWAPS the word in the line's text in place (no added line, no added `~` rule), it counts toward the 3-ask cap, and a word left alone is a visible Not checked line, never silent.
// Real tests/fixtures/sheets/expenses.csv, fake provider, the real sheet look and check block, $0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { reply } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'sheet-prose-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const realSheet = () => { const f = join(tmp(), 'expenses.csv'); copyFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), f); return f; };
/** an amount on every row, a tax on three: one column fits */
const oneFitSheet = () => { const f = join(tmp(), 'expenses.csv'); writeFileSync(f, `${['Date,Description,Amount,Tax', ...Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')},Item ${i + 1},${600 + i}.50,${i < 3 ? `${i + 1}.25` : ''}`)].join('\n')}\n`); return f; };
const W = (/** @type {string} */ word, from = 'line 1') => ({ from, word, kind: 'number' });
const TEXT = 'List the prices over 500';
const jobOf = (text = TEXT) => [{ n: 1, text, rule: '', rules: [] }, { n: 2, text: 'Keep the small ones', rule: 'Amount under 100', rules: ['Amount under 100'] }];

/** @param {{file: string, words: any[], text?: string, choose?: (q: any) => {choice: string, text?: string}|null, noAsker?: boolean}} o */
async function run({ file, words, text = TEXT, choose = () => ({ choice: 'agree' }), noAsker = false }) {
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Expenses', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  const provider = { async generate() { return reply({ text: JSON.stringify({ facts: words }), costUsd: 0.002 }); } };
  /** @type {any} */ let asked = null;
  /** @type {any} */ let seen = null;
  const jobLines = jobOf(text);
  const r = await authorCloseForJob({
    answers: { 1: `1. ${text}\n2. Keep the small ones\n   ~ Amount under 100` }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(jobLines)), inputs: [{ n: 1, label: 'Expenses', value: file }], writeScope: ['output/'], provider, ceilingUsd: 1,
    ...(noAsker ? {} : { answerQuestions: async (/** @type {any} */ o) => { asked = o; return { jobLines: JSON.parse(JSON.stringify(jobLines)), answers: { 1: 'x' }, choices: o.questions.map((/** @type {any} */ q) => ({ key: q.key, ...(choose(q) ?? { choice: 'drop' }) })) }; } }),
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (/** @type {any} */ o) => { seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [], notes: [] }, genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  return { r, asked, seen };
}

test('one fitting column: ONE ask in the rule-word shape, and Agree swaps the word in the line - no line added, no `~` rule added', async () => {
  const { r, asked, seen } = await run({ file: oneFitSheet(), words: [W('prices')] });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(asked.questions.length, 1);
  assert.equal(asked.questions[0].question, "no column 'prices'; 'Amount' has numbers in 12 of 12 rows. Use it? (your answer replaces that word on line 1).");
  assert.equal(asked.questions[0].line, 1);
  assert.deepEqual(seen.jobLines.map((/** @type {any} */ l) => l.n), [1, 2]);
  assert.equal(seen.jobLines[0].text, 'List the Amount over 500');
  assert.deepEqual(seen.jobLines[0].rules, [], 'no ~ rule added');
  assert.deepEqual(seen.jobLines[1].rules, ['Amount under 100']);
  assert.match(seen.answers[1], /1\. List the Amount over 500/);
});

test('a tie in the line\'s own prose: the closed column picker, picking Tax swaps the word (Amount likewise)', async () => {
  for (const col of ['Tax', 'Amount']) {
    const { asked, seen } = await run({ file: realSheet(), words: [W('prices')], choose: () => ({ choice: 'column', text: col }) });
    assert.equal(asked.questions.length, 1);
    assert.equal(asked.questions[0].question, "I found 2 columns matching 'prices': Amount, Tax. Choose one. (your answer replaces that word on line 1).");
    assert.deepEqual(asked.questions[0].columns, ['Amount', 'Tax']);
    assert.equal(seen.jobLines[0].text, `List the ${col} over 500`);
    assert.deepEqual(seen.jobLines.map((/** @type {any} */ l) => l.n), [1, 2]);
    assert.deepEqual(seen.jobLines[0].rules, []);
  }
});

test('Drop it leaves the line as written and the word shown Not checked with its reason (never silent)', async () => {
  const { seen } = await run({ file: oneFitSheet(), words: [W('prices')], choose: () => ({ choice: 'drop' }) });
  assert.equal(seen.jobLines[0].text, TEXT);
  const row = seen.block.rows.find((/** @type {any} */ x) => x.key === 'L1.fact.prices');
  assert.ok(row, 'a row of its own');
  assert.equal(row.state, 'not-checked');
  assert.equal(row.reason, 'You chose to leave it Not checked, so you judge it at Accept.');
});

test('no silent drop: a prose word the line does not say, and a prose word with nobody to ask, are each a visible Not checked row', async () => {
  const absent = await run({ file: oneFitSheet(), words: [W('balance')] });
  assert.equal(absent.asked, null, 'nothing to swap, nothing asked');
  const a = absent.seen.block.rows.find((/** @type {any} */ x) => x.line === 1 && x.kind === 'fact');
  assert.ok(a && a.state === 'not-checked' && String(a.reason).length > 10, JSON.stringify(a));
  const nobody = await run({ file: oneFitSheet(), words: [W('prices')], noAsker: true });
  const b = nobody.seen.block.rows.find((/** @type {any} */ x) => x.key === 'L1.fact.prices');
  assert.ok(b && b.state === 'not-checked' && /no column of the sheet/.test(String(b.reason)), JSON.stringify(b));
  assert.equal(nobody.seen.jobLines[0].text, TEXT);
});

test('a prose ask counts toward the 3-ask cap: four prose words stop the draft with the list, nothing asked', async () => {
  const text = 'List the prices costs totals sums over 500';
  const { r, asked } = await run({ file: oneFitSheet(), text, words: ['prices', 'costs', 'totals', 'sums'].map((w) => W(w)) });
  assert.equal(asked, null);
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'look-asks-too-many');
});

test('two prose words on ONE line: both answers land (the second swap is made on the line as the first left it), neither is lost', async () => {
  const { seen, asked } = await run({ file: oneFitSheet(), text: 'List the prices and costs over 500', words: [W('prices'), W('costs')] });
  assert.equal(asked.questions.length, 2);
  assert.equal(seen.jobLines[0].text, 'List the Amount and Amount over 500');
});
