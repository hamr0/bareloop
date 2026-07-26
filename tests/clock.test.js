// T's instrument (PRD v1.27/v1.29; materials design record addenda 1 & 3).
//
// The clock is the shell's, never the agent's: it reports elapsed/remaining wall
// time, decides when a between-round deadline has passed, and derives the
// per-call provider timeout. Three properties are load-bearing and each has a
// measured or ruled reason behind it:
//
//   - UNBOUNDED IS A REAL STATE, not a big number. hamr ruled maxWallMs has NO
//     default, so a run without one must be honestly time-unbounded rather than
//     silently capped (F45: a defaulted cap is a silent second ceiling).
//   - ADVERTISED != ENFORCED, and both are reported. Addendum 1 measured that
//     loop.stop() cannot cut an in-flight call, so a deadline is read BETWEEN
//     rounds and enforcement is maxWallMs + closeTimeoutMs. Quoting only the
//     requested number would be F6 in a time coat.
//   - THE PER-CALL TIMEOUT IS DERIVED, not fixed. BA-18's provider timeout is the
//     only instrument that fires on the ABSENCE of events (measured: 1,259ms on a
//     socket that accepts and never answers), so the last round must not be able
//     to outlive the budget.
//
// Time is injected, so every test is deterministic — no sleeps, no flake.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, MIN_CALL_TIMEOUT_MS, PROVIDER_TIMEOUT_MS } from '../src/clock.js';

/** a controllable clock: `at(ms)` moves it, so elapsed time is exact */
function fakeNow(start = 1_000_000) {
  let t = start;
  return { now: () => t, at: (ms) => { t = start + ms; } };
}

// ─── unbounded: the honest absence of a cap ───

test('with no maxWallMs the run is UNBOUNDED: remaining is Infinity, it never expires, and the absence is reported as absence (never a defaulted number)', () => {
  const f = fakeNow();
  const c = createClock({ now: f.now });
  assert.equal(c.bounded, false);
  assert.equal(c.requestedMs, null, 'null is the honest "no cap", not 0 and not a default');
  assert.equal(c.remainingMs(), Infinity);
  assert.equal(c.expired(), false);
  f.at(10 * 60 * 60_000); // ten hours later
  assert.equal(c.expired(), false, 'unbounded means unbounded — no hidden ceiling');
  assert.equal(c.remainingMs(), Infinity);
});

test('unbounded: the per-call timeout is the provider default, unchanged (BA-18 still bounds a hang even with no run budget)', () => {
  const c = createClock({ now: fakeNow().now });
  assert.equal(c.callTimeoutMs(), PROVIDER_TIMEOUT_MS);
});

test('unbounded: enforcedMs is null too — there is no enforced number to advertise', () => {
  const c = createClock({ now: fakeNow().now });
  assert.equal(c.enforcedMs(120_000), null);
});

// ─── bounded: elapsed, remaining, expiry ───

test('bounded: elapsed and remaining track real time against the cap', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  assert.equal(c.bounded, true);
  assert.equal(c.requestedMs, 600_000);
  assert.equal(c.elapsedMs(), 0);
  assert.equal(c.remainingMs(), 600_000);
  f.at(150_000);
  assert.equal(c.elapsedMs(), 150_000);
  assert.equal(c.remainingMs(), 450_000);
});

test('bounded: expired() flips exactly AT the deadline and remaining floors at 0 (never negative — a negative budget would arithmetically re-open a closed cap)', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(599_999);
  assert.equal(c.expired(), false);
  f.at(600_000);
  assert.equal(c.expired(), true, 'the deadline is inclusive — at the cap is out of budget');
  f.at(900_000);
  assert.equal(c.expired(), true);
  assert.equal(c.remainingMs(), 0, 'floored, not -300000');
});

test('bounded: enforcedMs reports the HONEST number — requested plus one close timeout (addendum 1), so advertised and enforced are both on the record', () => {
  const c = createClock({ maxWallMs: 2_700_000, now: fakeNow().now });
  assert.equal(c.requestedMs, 2_700_000, '45 minutes, what the operator asked for');
  assert.equal(c.enforcedMs(120_000), 2_820_000, '47 minutes, what can actually happen');
});

// ─── the derived per-call timeout ───

test('the per-call timeout is min(provider default, remaining): early in a long run it is the provider default', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 3_600_000, now: f.now });
  assert.equal(c.callTimeoutMs(), PROVIDER_TIMEOUT_MS, 'an hour left — the provider default binds first');
});

test('the per-call timeout SHRINKS as the budget drains, so the last round cannot outlive the run budget', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(300_000); // 5 min left, under the 10 min provider default
  assert.equal(c.callTimeoutMs(), 300_000);
});

test('the per-call timeout never drops below MIN_CALL_TIMEOUT_MS: a 50ms timeout guarantees a TimeoutError, and a manufactured transport casualty is never evidence (F45/F48) — the deadline stops the run, not a fake provider-red', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(599_950); // 50ms left
  assert.equal(c.callTimeoutMs(), MIN_CALL_TIMEOUT_MS);
  f.at(700_000); // fully expired
  assert.equal(c.callTimeoutMs(), MIN_CALL_TIMEOUT_MS, 'even past the deadline it is a usable number, never 0 or negative (0 DISABLES the provider timeout — the opposite of the intent)');
});

// ─── the record ───

test('report() carries both numbers and the bounded flag — one shape for the spine, so a reader never has to infer whether a cap existed', () => {
  const f = fakeNow();
  const bounded = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(60_000);
  assert.deepEqual(bounded.report(120_000), {
    bounded: true, requestedMs: 600_000, enforcedMs: 720_000, elapsedMs: 60_000, remainingMs: 540_000,
  });
  const un = createClock({ now: fakeNow().now });
  assert.deepEqual(un.report(120_000), {
    bounded: false, requestedMs: null, enforcedMs: null, elapsedMs: 0, remainingMs: null,
  });
});

test('report() renders unbounded remaining as null, NOT Infinity — Infinity does not survive JSON.stringify and would land in the append-only spine as the literal null anyway, or worse as 0 downstream', () => {
  const c = createClock({ now: fakeNow().now });
  assert.equal(JSON.parse(JSON.stringify(c.report(120_000))).remainingMs, null);
});
