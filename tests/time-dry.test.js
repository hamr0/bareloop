// TIME DRY READ (docs/logs/time-dryread-poc-PREREG.md, F236/F237): a kept time fact whose label has no time the run's REAL checker (gradeStep) can
// read after it is dropped as `reads-no-time` and shown under Not checked. Real pages only: the JFK-LAX capture (F236) and the three Data C
// pages of the POC (tests/fixtures/time-dry, sha256 in each meta json); the checker is never stubbed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dryReadTimes, dryReadMoney } from '../src/pagedry.js';
import { runPageMap } from '../src/pagemap.js';
import { dropSentence, dropRows, dropLine } from '../src/pagedropwords.js';
import { withDropNotes, lineRules } from '../src/rubricstep.js';
import { reply } from './helpers.js';
import { loadFixture } from './idea-a-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @param {string} k @returns {string} */
function pageC(k) {
  const text = readFileSync(join(HERE, 'fixtures/time-dry', `${k}.page.txt`), 'utf8');
  const meta = JSON.parse(readFileSync(join(HERE, 'fixtures/time-dry', `${k}.meta.json`), 'utf8'));
  assert.equal(createHash('sha256').update(readFileSync(join(HERE, 'fixtures/time-dry', `${k}.page.txt`))).digest('hex'), meta.sha256, `${k} fixture changed`);
  assert.match(meta.url, /^https:\/\//);
  return text;
}
/** @param {string[]} words @param {string} [name] @returns {any} */
const timeFact = (words, name = 'departure time') => ({ line: 1, name, shape: 'time', from: 'rule 2', words, forRule: 2 });

const jfk = loadFixture('jfk-lax').page;

test('F236: JFK-LAX "Departure time" (no colon) reads no time on any line and is dropped as reads-no-time', async () => {
  const r = await dryReadTimes(jfk, [timeFact(['Departure time'])]);
  assert.deepEqual(r.facts, []);
  assert.equal(r.dropped.length, 1);
  assert.deepEqual(r.dropped[0], { line: 1, rule: 2, fact: 'departure time', other: 'Departure time', reason: 'reads-no-time' });
  assert.ok(r.results['departure time'] > 0, 'the loose finder found candidate lines');
  assert.equal(r.reads['departure time'], 0);
});

test('F236: JFK-LAX "Departure time:" (with the colon) reads every candidate line and is kept', async () => {
  const f = timeFact(['Departure time:']);
  const r = await dryReadTimes(jfk, [f]);
  assert.deepEqual(r.facts, [f]);
  assert.deepEqual(r.dropped, []);
  assert.ok(r.reads['departure time'] > 0);
  assert.equal(r.reads['departure time'], r.results['departure time']);
});

test('Data C cinema: the label "3:30 PM" has no time after it on any line, so it is dropped', async () => {
  const r = await dryReadTimes(pageC('cinema'), [timeFact(['3:30 PM'], 'showtime')]);
  assert.deepEqual(r.facts, []);
  assert.equal(r.dropped[0].reason, 'reads-no-time');
  assert.equal(r.results.showtime, 0);
});

test('Data C train: the label "Departure" reads on its candidate lines and is kept', async () => {
  const f = timeFact(['Departure']);
  const r = await dryReadTimes(pageC('train'), [f]);
  assert.deepEqual(r.facts, [f]);
  assert.deepEqual(r.dropped, []);
  assert.ok(r.reads['departure time'] > 0);
});

test('Data C events: the label "kick off" reads on its candidate lines and is kept', async () => {
  const f = timeFact(['kick off'], 'kick off');
  const r = await dryReadTimes(pageC('events'), [f]);
  assert.deepEqual(r.facts, [f]);
  assert.deepEqual(r.dropped, []);
  assert.ok(r.reads['kick off'] > 0);
});

test('a fact of another shape passes through untouched, and so does a time fact with no label', async () => {
  const money = { line: 1, name: 'price', shape: 'money', from: 'rule 1', words: ['From'], unit: ['US dollars'] };
  const place = { line: 1, name: 'origin', shape: 'phrase', from: 'job line', words: ['Departure time'] };
  const noLabel = { line: 1, name: 'when', shape: 'time', from: 'rule 2', words: [] };
  const r = await dryReadTimes(jfk, [money, place, noLabel]);
  assert.deepEqual(r.facts, [money, place, noLabel]);
  assert.deepEqual(r.dropped, []);
});

test('the Not checked sentence and the whole rendered line', async () => {
  const r = await dryReadTimes(jfk, [timeFact(['Departure time'])]);
  assert.equal(dropSentence(r.dropped[0]), 'the page never shows a time right after "Departure time", so it is not checked.');
  const jobLines = [{ n: 1, text: 'List 3 flights', rules: ['under $450', 'leaves between 05:00 and 21:59'] }];
  assert.equal(dropLine(dropRows(r.dropped)[0], jobLines, lineRules),
    'line 1: "leaves between 05:00 and 21:59" — the page never shows a time right after "Departure time", so it is not checked.');
});

test('withDropNotes: the drop is never silent - an unmet rule goes to refused in the person\'s rule words', async () => {
  const r = await dryReadTimes(jfk, [timeFact(['Departure time'])]);
  const jobLines = [{ n: 1, text: 'List 3 flights', rules: ['under $450', 'leaves between 05:00 and 21:59'] }];
  const out = withDropNotes({ stages: [] }, r.dropped, jobLines);
  assert.deepEqual(out.refused, [{ line: 1, rule: 2, reason: 'the page never shows a time right after "Departure time", so it is not checked.' }]);
});

test('runPageMap (the real saved JFK-LAX map): the time fact is dropped, the other facts are kept, and the Not checked line renders', async () => {
  const fx = loadFixture('jfk-lax');
  const jobLines = [{ n: 1, text: 'List 3 flights from New York to Los Angeles', rules: ['under $450', 'leaves between 05:00 and 21:59', 'nonstop'] }];
  const provider = { async generate() { return reply({ text: fx.mapText, costUsd: 0.002 }); } };
  const r = await runPageMap({ texts: { Flights: fx.page }, inputs: [{ n: 1, label: 'Flights' }], jobLines, provider, onCall: () => {}, sleep: async () => {} });
  assert.equal(r.state, 'PRESENT');
  const look = /** @type {any} */ (r.facts).look;
  assert.ok(!look.facts.some((/** @type {any} */ f) => f.name === 'departure time'), 'the time fact is not signed');
  assert.ok(look.facts.some((/** @type {any} */ f) => f.name === 'price'), 'the price fact is kept');
  const d = look.dropped.filter((/** @type {any} */ x) => x.reason === 'reads-no-time');
  assert.equal(d.length, 1);
  assert.equal(dropLine(dropRows(d)[0], jobLines, lineRules),
    'line 1: "leaves between 05:00 and 21:59" — the page never shows a time right after "Departure time", so it is not checked.');
  // the money dry read is unaffected
  assert.ok((await dryReadMoney(fx.page, look.facts)).facts.some((/** @type {any} */ f) => f.name === 'price'));
});
