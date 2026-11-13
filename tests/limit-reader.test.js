// hamr ruling A, 2026-11-12: when the look tied a money or time fact to a `~` rule but gave no limit, code reads the limit from the person's own words.
// ONE amount or ONE range; every other text is a plain reason (Not checked), never a wrong check. The 42-case table is the frozen POC round-3 B7 table
// (tests/fixtures/checkblock/r3-cases.json), money and time cases both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLimit, holdsManyBounds } from '../src/rubricstep.js';
import { validReading } from '../src/pagerules.js';

const D = JSON.parse(readFileSync(new URL('./fixtures/checkblock/r3-cases.json', import.meta.url), 'utf8'));
const PLAIN_BAD = /[{}[\]]|undefined|null|NaN|=>|\bop\b/;

test('the 42-case B7 table: a readable rule reads exactly its limit, every other text is a plain reason, never a wrong check', () => {
  assert.equal(D.b7.length, 42);
  for (const c of D.b7) {
    const fact = D.facts[c.fact];
    const got = readLimit(fact.shape, c.rule, fact);
    if (c.expect === null) {
      assert.ok('why' in got, `${c.id} "${c.rule}" must not be read, got ${JSON.stringify(got)}`);
      assert.ok(got.why.length >= 15 && !PLAIN_BAD.test(got.why), `${c.id} reason is plain words: ${got.why}`);
    } else {
      assert.ok('reading' in got, `${c.id} "${c.rule}" must be read: ${JSON.stringify(got)}`);
      assert.deepEqual(got.reading, c.expect, c.id);
      assert.ok(validReading(fact.shape, got.reading), `${c.id} is a legal reading`);
    }
  }
});

test('section 5 cases: at least, over, between, a second amount with no sign, one-sided time, am/pm, negated', () => {
  const usd = D.facts.usd, time = D.facts.time;
  assert.deepEqual(readLimit('money', 'at least $200', usd), { reading: { op: 'gte', value: 200 } });
  assert.deepEqual(readLimit('money', 'over $450', usd), { reading: { op: 'gt', value: 450 } });
  assert.deepEqual(readLimit('money', 'between $100 and $300', usd), { reading: { op: 'between', lo: 100, hi: 300 } });
  for (const t of ['between $100 and 300', 'not under $450']) assert.ok('why' in readLimit('money', t, usd), t);
  for (const t of ['after 06:00', 'before 21:00', 'between 5:00 PM and 9:00 PM', 'not between 05:00 and 21:59']) assert.ok('why' in readLimit('time', t, time), t);
});

test('A1: more than one amount or range in the words is one guard (code read and AI reading edit share it)', () => {
  assert.equal(holdsManyBounds('money', 'under $450 or over $900'), true);
  assert.equal(holdsManyBounds('money', 'between $100 and $300'), false);
  assert.equal(holdsManyBounds('money', 'under $450'), false);
  assert.equal(holdsManyBounds('time', 'between 06:00 and 10:00 or between 18:00 and 22:00'), true);
  assert.equal(holdsManyBounds('time', 'between 06:00 and 10:00'), false);
});
