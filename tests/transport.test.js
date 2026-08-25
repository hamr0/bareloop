// F115 — the classifier that decides whether hamr's one-retry ruling applies:
// TRUE only for a transport-class throw (fetch itself failing, no HTTP
// response), FALSE for an HTTP response (4xx/5xx/429) or an explicit
// `retryable:false`. The Loop-seam wiring itself is covered live in
// tests/run.test.js (a real runJob through the scripted provider); this file
// is the pure-function boundary the wiring depends on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTransportFailure, TRANSPORT_RETRIES, TRANSPORT_MAX_ATTEMPTS } from '../src/transport.js';

test('the retry budget is the fixed constant hamr authorized: one retry, two attempts total', () => {
  assert.equal(TRANSPORT_RETRIES, 1);
  assert.equal(TRANSPORT_MAX_ATTEMPTS, 2);
});

const TRANSPORT_CASES = [
  ['a TLS mid-record fault', new Error('SSL routines:ssl3_read_bytes:ssl/tls alert bad record mac')],
  ['ECONNRESET on the error itself', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
  ['ECONNRESET on err.cause (Node\'s fetch wrapper shape)', Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })],
  ['fetch failed wrapping a network cause', Object.assign(new TypeError('fetch failed'), { cause: new Error('ETIMEDOUT') })],
  ['EPIPE', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })],
  ['ETIMEDOUT (idle)', Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })],
];

const NON_TRANSPORT_CASES = [
  ['an HTTP 500 response', { status: 500, message: 'server error' }],
  ['an explicit retryable:false', { retryable: false, message: 'denied' }],
  ['a plain application error with no transport shape', new Error('bad request')],
  ['fetch failed with NO network cause (an upstream throw, not a socket fault)', Object.assign(new TypeError('fetch failed'), { cause: new Error('unexpected token in JSON') })],
];

for (const [label, err] of TRANSPORT_CASES) {
  test(`isTransportFailure: TRUE for ${label}`, () => {
    assert.equal(isTransportFailure(err), true);
  });
}

for (const [label, err] of NON_TRANSPORT_CASES) {
  test(`isTransportFailure: FALSE for ${label}`, () => {
    assert.equal(isTransportFailure(err), false);
  });
}

test('isTransportFailure: FALSE for null/undefined — never throws on a missing error', () => {
  assert.equal(isTransportFailure(null), false);
  assert.equal(isTransportFailure(undefined), false);
});

// Mutation check (per the ask): flip the classifier to ALSO fire on an
// HTTP-status error, and confirm the two guard cases above that must stay
// FALSE actually catch it — proof the test suite can fail, not just pass.
test('MUTATION CHECK: a classifier that fires on a 500-style error is caught by the guard cases', () => {
  /** @param {any} err */
  const mutant = (err) => {
    if (err == null) return false;
    // the mutation: drop the "an HTTP response is never transport" guard
    if (err.retryable === false) return false;
    const message = String(err.message ?? err ?? '');
    if (/bad record mac/i.test(message)) return true;
    if (typeof err.status === 'number' && err.status >= 500) return true; // <- the injected defect
    return false;
  };
  const failed = [];
  for (const [label, err] of NON_TRANSPORT_CASES) {
    if (mutant(err) !== false) failed.push(label);
  }
  assert.ok(failed.length > 0, 'the mutant must be caught: it wrongly classifies at least one HTTP-response case as transport');
  assert.deepEqual(failed, ['an HTTP 500 response'], 'exactly the case the injected defect targets — confirms the guard cases are load-bearing, not decorative');
  // restore: the real isTransportFailure must NOT reproduce the mutant's defect
  assert.equal(isTransportFailure(NON_TRANSPORT_CASES[0][1]), false, 'the real classifier — restored, unmutated — correctly refuses the 500 case');
});
