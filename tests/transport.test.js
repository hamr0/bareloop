// F115 — the classifier that decides whether hamr's one-retry ruling applies:
// TRUE only for a transport-class throw (fetch itself failing, no HTTP
// response), FALSE for an HTTP response (4xx/5xx/429) or an explicit
// `retryable:false`. The Loop-seam wiring itself is covered live in
// tests/run.test.js (a real runJob through the scripted provider); this file
// is the pure-function boundary the wiring depends on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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

// BA-25 (bare-agent 0.42.0): guardResponseSettles's own transport-classified
// ProviderError shape — a body cut after headers, before 'end' fired.
test('isTransportFailure: TRUE for a BA-25 ProviderError (context.bound:"transport")', () => {
  const err = {
    name: 'ProviderError',
    code: 'PROVIDER_ERROR',
    retryable: true,
    message: '[AnthropicProvider] response stream aborted before the body completed',
    context: { bound: 'transport', event: 'aborted' },
  };
  assert.equal(isTransportFailure(err), true);
});

test('isTransportFailure: FALSE when an HTTP status accompanies context.bound:"transport" — status wins', () => {
  const err = { status: 502, retryable: true, context: { bound: 'transport', event: 'error' } };
  assert.equal(isTransportFailure(err), false);
});

test('isTransportFailure: FALSE when retryable:false accompanies context.bound:"transport" — explicit false wins', () => {
  const err = { retryable: false, context: { bound: 'transport', event: 'close' } };
  assert.equal(isTransportFailure(err), false);
});

test('isTransportFailure: FALSE for context.bound:"idle" alone — only "transport" qualifies by bound', () => {
  const err = { context: { bound: 'idle' } };
  assert.equal(isTransportFailure(err), false);
});

// Real BA-25 error: a local server that writes headers, a partial body, then
// destroys the socket — the exact shape guardResponseSettles guards against.
test('isTransportFailure: TRUE for the real BA-25 rejection from AnthropicProvider.generate', async () => {
  const { AnthropicProvider } = await import('bare-agent/providers');

  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"partial":');
    setImmediate(() => req.socket.destroy());
  });
  srv.unref();

  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();

  try {
    const provider = new AnthropicProvider({ apiKey: 'x', model: 'm', baseUrl: `http://127.0.0.1:${port}` });
    await assert.rejects(
      () => provider.generate([{ role: 'user', content: 'hi' }], [], { maxTokens: 10 }),
      (err) => {
        assert.equal(isTransportFailure(err), true, 'the real BA-25 rejection must classify as a transport failure');
        assert.match(String(err.message), /aborted before the body completed/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
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
