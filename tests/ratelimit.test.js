// hamr's ruling, verbatim (PRD item 28, parked a/b): "do a/b as a fallback, and
// verify/validate + no regression." A vendor HTTP 429 currently ends the whole
// run as `provider-red`, throwing away all completed work, even though the
// vendor's own response says exactly how long to wait — this is a bounded ONE
// retry that honours that stated delay, a FALLBACK behind the primary answer
// (picking a worker model with adequate rate headroom, F139/F143).
//
// This file mirrors tests/transport.test.js's shape: the pure-function
// boundary (`isRateLimited`/`rateLimitWaitMs`/`statedWaitMs`) first, then the
// seam wiring (src/planrun.js's `withProviderRetries`) driven live through
// `runJob` with a scripted provider — the same instrument tests/run.test.js's
// F115 tests use, since the seam itself is not exported (by design: it wraps
// the ONE Loop-builder factory, nothing else needs a handle on it).
//
// Every 429 message in the seam tests below states a SMALL delay (tens of
// milliseconds) deliberately — real wait times are proven separately, at $0,
// by the pure-function tests against the real verbatim vendor message; the
// seam tests only need to prove the LADDER fires correctly, and a test suite
// should not spend real seconds sleeping to do that.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSpine } from '../src/spine.js';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { readSpine, initPatientRepo, mockWallClock, reply } from './helpers.js';
import {
  isRateLimited, rateLimitWaitMs, statedWaitMs,
  RATE_LIMIT_RETRIES, RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_MAX_WAIT_MS, RATE_LIMIT_DEFAULT_WAIT_MS,
} from '../src/ratelimit.js';

// ─── pure functions ───────────────────────────────────────────────────────

test('the retry budget is the fixed constant hamr authorized: one retry, two attempts total', () => {
  assert.equal(RATE_LIMIT_RETRIES, 1);
  assert.equal(RATE_LIMIT_MAX_ATTEMPTS, 2);
});

test('isRateLimited: TRUE for status:429 and statusCode:429', () => {
  assert.equal(isRateLimited({ status: 429 }), true);
  assert.equal(isRateLimited({ statusCode: 429 }), true);
});

const NOT_RATE_LIMITED = [
  ['a 500', { status: 500, message: 'server error' }],
  ['a 503', { status: 503, message: 'service unavailable' }],
  ['a 524', { status: 524, message: 'timeout' }],
  ['a transport-shaped error with no status', Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })],
  ['a message merely CONTAINING "429" with no status field', { message: 'error code 429 mentioned in passing' }],
];
for (const [label, err] of NOT_RATE_LIMITED) {
  test(`isRateLimited: FALSE for ${label}`, () => {
    assert.equal(isRateLimited(err), false);
  });
}

test('isRateLimited: FALSE for null/undefined — never throws on a missing error', () => {
  assert.equal(isRateLimited(null), false);
  assert.equal(isRateLimited(undefined), false);
});

// the real, verbatim vendor message (run `8ev2sdkn`, 2026-09-08)
const REAL_429_MESSAGE = '[OpenAIProvider] Rate limit reached for gpt-4.1 in organization org-XXXX on tokens per '
  + 'min (TPM): Limit 30000, Used 27001, Requested 8997. Please try again in 11.996s. Visit '
  + 'https://platform.openai.com/account/rate-limits to learn more.';

test('rateLimitWaitMs: the REAL verbatim gpt-4.1 message parses to 11996ms + the 250ms margin', () => {
  assert.equal(statedWaitMs({ status: 429, message: REAL_429_MESSAGE }), 11996);
  assert.equal(rateLimitWaitMs({ status: 429, message: REAL_429_MESSAGE }), 11996 + 250);
});

const SUPPORTED_SHAPES = [
  ['try again in 1.5 seconds', 1500],
  ['try again in 20ms', 20],
  ['retry after 30s', 30000],
  ['retry after 30 seconds', 30000],
  ['TRY AGAIN IN 2S', 2000], // case-insensitive
];
for (const [text, expectedRawMs] of SUPPORTED_SHAPES) {
  test(`rateLimitWaitMs: "${text}" parses to ${expectedRawMs}ms + margin`, () => {
    const err = { status: 429, message: `Rate limited. ${text}.` };
    assert.equal(statedWaitMs(err), expectedRawMs);
    assert.equal(rateLimitWaitMs(err), expectedRawMs + 250);
  });
}

test('rateLimitWaitMs: an unparseable message returns the 5000ms default, statedWaitMs is null', () => {
  const err = { status: 429, message: 'Too many requests.' };
  assert.equal(statedWaitMs(err), null);
  assert.equal(rateLimitWaitMs(err), RATE_LIMIT_DEFAULT_WAIT_MS);
  assert.equal(rateLimitWaitMs(err), 5000);
});

test('rateLimitWaitMs: a stated delay over 60s returns null — not honoured, no retry', () => {
  const err = { status: 429, message: 'try again in 61s' };
  assert.equal(statedWaitMs(err), 61000);
  assert.equal(rateLimitWaitMs(err), null);
});

test('rateLimitWaitMs: the +250ms margin never pushes a parsed value over the cap — clamped, not nulled', () => {
  const err = { status: 429, message: 'try again in 59.9s' }; // 59900ms raw, +250 would be 60150
  assert.equal(rateLimitWaitMs(err), RATE_LIMIT_MAX_WAIT_MS);
  assert.ok(rateLimitWaitMs(err) <= RATE_LIMIT_MAX_WAIT_MS);
});

test('rateLimitWaitMs: a raw delay of EXACTLY the cap is honoured (not ">" the cap), margin clamped to the cap', () => {
  const err = { status: 429, message: 'try again in 60s' };
  assert.equal(rateLimitWaitMs(err), RATE_LIMIT_MAX_WAIT_MS);
});

test('rateLimitWaitMs: a raw delay one tick OVER the cap returns null', () => {
  const err = { status: 429, message: 'try again in 60.001s' };
  assert.equal(rateLimitWaitMs(err), null);
});

test('rateLimitWaitMs: a parsed 0 means retry immediately, never negative/NaN', () => {
  const err = { status: 429, message: 'try again in 0s' };
  assert.equal(rateLimitWaitMs(err), 0);
});

// ─── seam wiring, driven live through runJob (mirrors tests/run.test.js's F115 shape) ───

const base = mkdtempSync(join(tmpdir(), 'ratelimit-test-'));
after(() => rmSync(base, { recursive: true, force: true }));

const PROBE_SOURCE = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) process.exit(0);
console.log('FAILED tests/test_x.mjs missing'); process.exit(1);\n`;
const PROBE_SHA256 = hashCloseScriptBytes(PROBE_SOURCE);

function makePlanWork(name) {
  const workdir = join(base, name);
  mkdirSync(join(workdir, 'tests'), { recursive: true });
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  writeFileSync(join(workdir, 'close.mjs'), PROBE_SOURCE);
  writeFileSync(join(workdir, 'check.mjs'), PROBE_SOURCE);
  initPatientRepo(workdir);
  return workdir;
}

const planJob = () => ({
  schema: 'job-v1',
  job: 'plan-dispatch',
  description: 'plan-shape job through the one runJob entry (ratelimit seam tests)',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs with an ok assertion.',
  verdictType: 'green',
  close: [{ name: 'clean-run', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED', sha256: PROBE_SHA256 }],
  tools: ['read', 'write'],
  escalation: { mode: 'decision-ready' },
});

const approve = (job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];
const tcall = (id, name, args) => ({ id, name, arguments: args });

const fullPlanScript = (wd) => [
  { text: 'no tests exist yet' },
  { text: JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the missing test.', tools: ['write'], rounds: 6,
      target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  }) },
  { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
  { text: 'wrote it' },
];

/** A transport-shaped throw — fetch itself failing, no HTTP response. */
const transportError = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
/** A 429-shaped throw with a small, fast-to-test stated delay. */
const rateLimitError = (text = 'try again in 10ms') => Object.assign(new Error(`Rate limit reached. ${text}.`), { status: 429 });
/** A 500/503-shaped throw — an HTTP response, never transport-, never rate-limit-eligible. */
const httpError = (status) => Object.assign(new Error('server error'), { status, retryable: false });

/**
 * A provider whose first `throwFns.length` calls throw `throwFns[i]()` in
 * order, then falls through to `script` (via the shared `reply` envelope,
 * sticking on the last entry) for every call after.
 * @param {Array<() => Error>} throwFns
 * @param {Array<{text?: string, toolCalls?: object[]}>} script
 */
function providerWithThrows(throwFns, script) {
  const calls = [];
  return {
    calls,
    async generate() {
      calls.push(1);
      if (calls.length <= throwFns.length) throw throwFns[calls.length - 1]();
      const idx = calls.length - throwFns.length - 1;
      return reply(script[Math.min(idx, script.length - 1)]);
    },
  };
}

test('a 429 on the FIRST scout call gets one retry, recovers, and the run finishes green — spendComplete stays TRUE (a 429 is a refusal, never billed)', async () => {
  const wd = makePlanWork('ratelimit-recovered');
  const job = planJob();
  const provider = providerWithThrows([rateLimitError], fullPlanScript(wd));
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file) });

  assert.equal(outcome, 'green', 'the retried attempt recovered — the run proceeds exactly as if the 429 never happened');
  const events = readSpine(file);
  const retries = events.filter((e) => e.type === 'rate-limit-retry');
  assert.equal(retries.length, 1, 'exactly one rate-limit-retry record for the whole run');
  assert.equal(retries[0].phase, 'scout');
  assert.equal(retries[0].attempt, 1);
  assert.equal(retries[0].recovered, true);
  assert.equal(retries[0].statedMs, 10);
  assert.equal(retries[0].waitedMs, 10 + 250);
  assert.equal(typeof retries[0].error, 'string');
  assert.ok(!('costUsd' in retries[0]), 'report-only — no cost field, the ledger is unaffected');
  assert.equal(events.filter((e) => e.type === 'transport-retry').length, 0, 'no transport throw occurred — that ladder never fires');
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'green');
  assert.equal(end.spendComplete, true, 'a 429 is a REFUSAL — the server rejected the request before processing it, so nothing was billed; unlike a transport retry, this must NOT floor spendComplete');
});

test('two consecutive 429s exhaust the one retry — provider-red, one rate-limit-retry record recovered:false', async () => {
  const wd = makePlanWork('ratelimit-exhausted');
  const job = planJob();
  const provider = providerWithThrows([rateLimitError, rateLimitError], []);
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file), capRuns: 2 });

  assert.equal(outcome, 'provider-red');
  assert.equal(provider.calls.length, 2, 'exactly RATE_LIMIT_MAX_ATTEMPTS calls — the retry budget is one extra attempt, not unbounded reissue');
  const events = readSpine(file);
  const retries = events.filter((e) => e.type === 'rate-limit-retry');
  assert.equal(retries.length, 1);
  assert.equal(retries[0].recovered, false);
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'provider-red');
});

test('a 429 whose stated delay exceeds the remaining wall gets NO retry — no sleep, error propagates, no record', async (t) => {
  const wd = makePlanWork('ratelimit-wall-exceeds');
  const job = { ...planJob(), maxWallMs: 120_000 };
  mockWallClock(t);
  let n = 0;
  const provider = {
    calls: [],
    async generate() {
      n += 1;
      provider.calls.push(n);
      t.mock.timers.tick(115_000); // leaves ~5s of the 120s wall
      throw rateLimitError('try again in 10s'); // 10s + margin > 5s remaining
    },
  };
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file), capRuns: 2 });

  assert.equal(outcome, 'provider-red');
  assert.equal(provider.calls.length, 1, 'the wall wins — no retry attempt was ever made');
  const events = readSpine(file);
  assert.equal(events.filter((e) => e.type === 'rate-limit-retry').length, 0, 'nothing to report — the ladder never engaged');
});

test('a transport throw AND a 429 in one call\'s lifetime: BOTH ladders fire, one record each, independently budgeted', async () => {
  const wd = makePlanWork('ratelimit-and-transport');
  const job = planJob();
  const provider = providerWithThrows([transportError, rateLimitError], fullPlanScript(wd));
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file) });

  assert.equal(outcome, 'green', 'both retries were legitimate and the third real attempt succeeded');
  const events = readSpine(file);
  const transportRetries = events.filter((e) => e.type === 'transport-retry');
  const rateLimitRetries = events.filter((e) => e.type === 'rate-limit-retry');
  assert.equal(transportRetries.length, 1, 'the transport budget fired exactly once');
  assert.equal(transportRetries[0].recovered, false, 'the retried attempt itself came back 429, not a success');
  assert.equal(rateLimitRetries.length, 1, 'the rate-limit budget fired exactly once, independently');
  assert.equal(rateLimitRetries[0].recovered, true);
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'green');
  assert.equal(end.spendComplete, false, 'the TRANSPORT retry alone still floors spendComplete (F115, unchanged) — the rate-limit retry riding alongside it changes nothing about that floor');
});

// ─── no regression (F115 unchanged) ───────────────────────────────────────

test('NO REGRESSION: a plain transport throw still gets exactly one retry and emits transport-retry unchanged', async () => {
  const wd = makePlanWork('ratelimit-regression-transport');
  const job = planJob();
  const provider = providerWithThrows([transportError], fullPlanScript(wd));
  const file = join(wd, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file) });

  assert.equal(outcome, 'green');
  const events = readSpine(file);
  assert.equal(events.filter((e) => e.type === 'transport-retry').length, 1);
  assert.equal(events.find((e) => e.type === 'transport-retry').recovered, true);
  assert.equal(events.filter((e) => e.type === 'rate-limit-retry').length, 0);
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.spendComplete, false, 'F115\'s floor is unchanged by this change');
});

for (const status of [500, 503]) {
  test(`NO REGRESSION: an HTTP ${status} is still NOT retried at all by either ladder — provider called exactly once`, async () => {
    const wd = makePlanWork(`ratelimit-regression-${status}`);
    const job = planJob();
    const provider = providerWithThrows([() => httpError(status)], []);
    const file = join(wd, 'spine.jsonl');
    const outcome = await runJob(job, { approvals: approve(job), workdir: wd, provider, emit: makeSpine(file), capRuns: 2 });

    assert.equal(outcome, 'provider-red');
    assert.equal(provider.calls.length, 1, `an HTTP ${status} is neither transport- nor rate-limit-classified — no retry, one call`);
    const events = readSpine(file);
    assert.equal(events.filter((e) => e.type === 'transport-retry').length, 0);
    assert.equal(events.filter((e) => e.type === 'rate-limit-retry').length, 0);
  });
}
