// F242 - boundInWords must read the person's words by KIND: a digit inside a time, a date or an amount belongs to that token only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundInWords } from '../src/rubricstep.js';

const SAID = 'List 3 flights under $150; departure time between 05:00 and 23:59; nonstop';

test('numbers: only a bare number or an amount counts, never a piece of a time or amount', () => {
  for (const n of [5, 15, 50]) assert.equal(boundInWords(n, SAID), false, `${n} is only a piece of $150 / 05:00`);
  assert.equal(boundInWords(150, SAID), true);
  assert.equal(boundInWords(3, SAID), true);
});

test('times: equal to a time token, hour leading zero ignored, never a different time', () => {
  assert.equal(boundInWords('05:00', SAID), true);
  assert.equal(boundInWords('5:00', SAID), true);
  assert.equal(boundInWords('23:59', SAID), true);
  assert.equal(boundInWords('5:30', SAID), false);
});

test('dates: equal to a date token, never a piece of it', () => {
  const s = 'flights on 2026-11-20 under 200 US dollars';
  assert.equal(boundInWords('2026-11-20', s), true);
  assert.equal(boundInWords(2026, s), false);
  assert.equal(boundInWords(200, s), true);
  assert.equal(boundInWords(20, s), false);
});
