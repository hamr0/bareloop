// fwdloop run m10-walk-flights-3 (run-1, $0.20, red after 4 tries): the phrase fact "destination city" = "Rome" passed the phrase-rare check
// ("Rome" is on the page 3 times) but only inside "Track prices from Madrid to Rome" switches, in 0 of the 18 result lines, so no result could
// ever say it. A kept phrase fact is dry-read against the result lines of the job's kept money facts, with the real gradeStep.
// The page fixture has the live shape (18 'link "From N US dollars ..."' result lines + 3 switch lines); it is small and authored to that shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dryReadMoney, dryReadPhrases, moneyResultLines } from '../src/pagedry.js';
import { dropSentence, dropRows, dropLine, isReadNote } from '../src/pagedropwords.js';
import { lineRules } from '../src/rubricstep.js';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/phrase/mad-bcn.page.txt'), 'utf8');
/** @type {any} */
const price = { line: 1, name: 'price', shape: 'money', from: 'rule 1', words: ['From'], unit: ['US dollars'] };
/** @param {string} name @param {string} word @returns {any} */
const phrase = (name, word) => ({ line: 1, name, shape: 'phrase', from: '', words: [word] });

test('fixture shape: 18 result lines, "Rome" only on 3 switch lines', () => {
  assert.equal(page.split('\n').filter((l) => /From \d+ US dollars/.test(l)).length, 18);
  assert.equal(page.split('\n').filter((l) => l.includes('Rome')).length, 3);
  assert.equal(page.split('\n').filter((l) => l.includes('Rome') && /From \d+ US dollars/.test(l)).length, 0);
});

test('a phrase found only outside the result lines is dropped as a whole fact, in plain words, and stays Not checked', async () => {
  const money = await dryReadMoney(page, [price, phrase('destination city', 'Rome')]);
  assert.equal(money.reads.price, 18);
  const r = await dryReadPhrases(page, money.facts);
  assert.deepEqual(r.facts.map((f) => f.name), ['price']);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].reason, 'phrase-no-result');
  assert.equal(r.dropped[0].fact, 'destination city');
  assert.equal(r.reads['destination city'], 0);
  assert.equal(dropSentence(r.dropped[0]), '"Rome" is on the page but in none of its results, so it is not checked.');
  const row = dropRows(r.dropped)[0];
  assert.equal(row.full, true);
  assert.equal(isReadNote(dropLine(row, [{ n: 1, text: 'x', rule: '' }], lineRules), ['price']), false, 'stays under Not checked');
});

test('a phrase that IS in the result lines is kept', async () => {
  const r = await dryReadPhrases(page, [price, phrase('origin city', 'Madrid')]);
  assert.deepEqual(r.facts.map((f) => f.name), ['price', 'origin city']);
  assert.deepEqual(r.dropped, []);
  assert.equal(r.reads['origin city'], 18);
});

test('no kept money fact: the result lines are unknown, so a phrase fact passes through untouched', async () => {
  const r = await dryReadPhrases(page, [phrase('destination city', 'Rome')]);
  assert.deepEqual(r.facts.map((f) => f.name), ['destination city']);
  assert.deepEqual(r.dropped, []);
});

test('moneyResultLines reads the number before a unit in linear time: a 20000 x "1," line then "x EUR" returns well under a second (the backtracking regex took seconds)', () => {
  const fact = { line: 1, name: 'price', shape: 'money', from: 'rule 1', words: [], unit: ['EUR'] };
  const t0 = performance.now();
  assert.deepEqual(moneyResultLines('1,'.repeat(20000) + 'x EUR', fact), []);
  assert.deepEqual(moneyResultLines('Total 1,234.50 EUR', fact).map((r) => r.value), ['1234.50']);
  assert.ok(performance.now() - t0 < 1000, `took ${performance.now() - t0} ms`);
});
