// A label the page writes with a colon right after it ("Departure time: 10:24 AM.") reads the same with or without the colon in the look's words
// (run mwgsl7zx, split-flight3: the first look gave "Departure time:" and was checked; after Revise the look gave "Departure time", the dry read
// dropped it as reads-no-time and asked the person to drop the rule). The page is the real saved page of that run
// (tests/fixtures/time-label-colon, sha256 d58e473d...). The checker (gradeStep) is never stubbed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dryReadTimes, dryReadMoney, timeCandidateLines } from '../src/pagedry.js';
import { gradeStep } from '../src/rubricstep.js';
import { applyPageRules } from '../src/pagerules.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_FILE = join(HERE, 'fixtures/time-label-colon/flights-mwgsl7zx.page.txt');
const page = readFileSync(PAGE_FILE, 'utf8');
const sha = createHash('sha256').update(page).digest('hex');
const JOB = [{ n: 1, text: 'List 3 flights', rules: ['under $450', 'departure time between 05:00 and 21:59'] }];
/** the drafting path: the look's word goes through the page rules, then the dry read. @returns {any} */
const timeFact = (/** @type {string[]} */ words) => ({ name: 'departure time', shape: 'time', from: 'rule 2', words });
const kept = (/** @type {string} */ text, /** @type {any} */ fact) => applyPageRules(text, { facts: [fact] }, JOB).facts;

/** the run's grader on one line of a page, as a signed time fact anchored on `anchor` */
async function graded(/** @type {string} */ text, /** @type {string} */ anchor, /** @type {{quote: string, value: string}} */ line) {
  const fact = { name: 'time', shape: 'time', anchor };
  const params = { step: 1, parts: [{ text: 'run', class: 'fact', source: 'page', covers: [1], facts: [fact] }] };
  const s = createHash('sha256').update(text).digest('hex');
  return (await gradeStep({ params, bytes: JSON.stringify({ results: [{ quote: line.quote, values: { time: line.value } }] }), outputBytes: null, inputs: { page: text } }, { page: s })).verdict;
}

test('the real page writes "Departure time: 10:24 AM." and the fixture is the run page', () => {
  assert.equal(sha, 'd58e473d7247dc93b4fdbbb6d78bec6189c64c3f9757ad6e5c8cec47ba80d7a7');
  assert.match(page, /Departure time: 10:24 AM\./);
});

test('"Departure time" (no colon) reads the times and is not dropped; same reading as "Departure time:"', async () => {
  const without = await dryReadTimes(page, kept(page, timeFact(['Departure time'])));
  const withColon = await dryReadTimes(page, kept(page, timeFact(['Departure time:'])));
  assert.deepEqual(without.dropped, []);
  assert.equal(without.facts.length, 1);
  assert.equal(without.reads['departure time'], withColon.reads['departure time']);
  assert.ok(without.reads['departure time'] > 0);
  assert.equal(without.results['departure time'], withColon.results['departure time']);
  assert.deepEqual(without.facts[0].words, withColon.facts[0].words, 'the signed word is the page\'s own, the same either way');
});

test('the dry read and the run grader agree: the word the dry read keeps is read green by gradeStep on every candidate line', async () => {
  const r = await dryReadTimes(page, kept(page, timeFact(['Departure time'])));
  const anchor = r.facts[0].words[0];
  const lines = timeCandidateLines(page, r.facts[0]);
  assert.ok(lines.length > 0);
  for (const l of lines) assert.equal(await graded(page, anchor, l), 'green', l.quote);
  assert.equal(r.reads['departure time'], lines.length);
});

test('a label followed by other words before the time still does not read, with or without a colon', async () => {
  const text = 'Departure time (local): 10:24 AM.\nDeparture time (local): 1:35 PM.\n';
  const bare = await dryReadTimes(text, kept(text, timeFact(['Departure time'])));
  assert.deepEqual(bare.facts, []);
  assert.equal(bare.dropped[0]?.reason, 'reads-no-time');
  assert.deepEqual(kept(text, timeFact(['Departure time:'])), [], 'the colon word is not on that page');
});

test('money: "Price" on a page that writes "Price: $120" reads the amounts like "Price:"', async () => {
  const text = 'Flight A\nPrice: $120\nFlight B\nPrice: $166\n';
  const money = (/** @type {string[]} */ words) => ({ name: 'price', shape: 'money', from: 'rule 1', words, currency: ['$'] });
  const without = await dryReadMoney(text, kept(text, money(['Price'])));
  const withColon = await dryReadMoney(text, kept(text, money(['Price:'])));
  assert.deepEqual(without.dropped, []);
  assert.equal(without.reads.price, withColon.reads.price);
  assert.ok(without.reads.price > 0);
  assert.deepEqual(without.facts[0].words, withColon.facts[0].words);
});
