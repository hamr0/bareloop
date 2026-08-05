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
import { createClock, isWallTimeout, MIN_CALL_TIMEOUT_MS, PROVIDER_TIMEOUT_MS, TIMEOUT_CODE, DEADLINE_CODE } from '../src/clock.js';

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

// ─── W5: the overshoot is PER STAGE ───

test('W5: a STAGED close multiplies the overshoot — every stage runs under the full closeTimeoutMs (runStages), so a 4-stage close is 4 of them, not 1', () => {
  // the U shape as jobs/aurora-u-spawner-types.json ran it when this was written: a
  // 30-minute cap, a 4-stage close, a 900s per-stage timeout (the close has since
  // grown a stage — the arithmetic below is the claim, not the count).
  // Quoting 45 minutes against a 90-minute worst case is
  // F6 in a time coat — the same arithmetic the U runner's outside watchdog
  // already does (CLOSE_TIMEOUT_MS * spec.close.length).
  const c = createClock({ maxWallMs: 1_800_000, closeStages: 4, now: fakeNow().now });
  assert.equal(c.closeStages, 4);
  assert.equal(c.requestedMs, 1_800_000, '30 minutes, what the operator asked for');
  assert.equal(c.enforcedMs(900_000), 5_400_000, '90 minutes, what can actually happen — never 45');
});

test('W5: a single-stage close is unchanged — one stage, one close timeout (the object-form/predicate regression)', () => {
  const one = createClock({ maxWallMs: 1_800_000, closeStages: 1, now: fakeNow().now });
  const dflt = createClock({ maxWallMs: 1_800_000, now: fakeNow().now });
  assert.equal(one.enforcedMs(900_000), 2_700_000);
  assert.equal(dflt.closeStages, 1, 'an omitted stage count is the single predicate close, never zero');
  assert.equal(dflt.enforcedMs(900_000), 2_700_000, 'the default must not have moved');
});

test('W5: the stage count is belted — a garbage count can never quote an enforced number BELOW the cap it enforces', () => {
  for (const bad of [0, -3, NaN, Infinity, null, undefined, '4']) {
    const c = createClock({ maxWallMs: 1_800_000, closeStages: /** @type {any} */ (bad), now: fakeNow().now });
    assert.equal(c.closeStages, 1, `closeStages ${String(bad)} must floor at one close`);
    assert.equal(c.enforcedMs(900_000), 2_700_000);
  }
  assert.equal(createClock({ maxWallMs: 1_800_000, closeStages: 2.7, now: fakeNow().now }).closeStages, 2, 'a fractional count floors to whole stages');
});

test('W5: the ADVERTISED record equals the ENFORCED computation from the same inputs — one arithmetic, never two', () => {
  const c = createClock({ maxWallMs: 1_800_000, closeStages: 4, now: fakeNow().now });
  assert.equal(c.report(900_000).enforcedMs, c.enforcedMs(900_000));
  assert.equal(c.report(900_000).enforcedMs, c.requestedMs + c.closeStages * 900_000);
  const un = createClock({ closeStages: 4, now: fakeNow().now });
  assert.equal(un.report(900_000).enforcedMs, un.enforcedMs(900_000), 'unbounded: null both ways — no stage count invents a ceiling');
  assert.equal(un.enforcedMs(900_000), null);
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
    bounded: true, requestedMs: 600_000, closeStages: 1, enforcedMs: 720_000, elapsedMs: 60_000, remainingMs: 540_000,
  });
  const un = createClock({ now: fakeNow().now });
  assert.deepEqual(un.report(120_000), {
    bounded: false, requestedMs: null, closeStages: 1, enforcedMs: null, elapsedMs: 0, remainingMs: null,
  });
});

test('report() renders unbounded remaining as null, NOT Infinity — Infinity does not survive JSON.stringify and would land in the append-only spine as the literal null anyway, or worse as 0 downstream', () => {
  const c = createClock({ now: fakeNow().now });
  assert.equal(JSON.parse(JSON.stringify(c.report(120_000))).remainingMs, null);
});

// ─── F64: telling the run's own deadline apart from a dead socket ───

const etimedout = () => Object.assign(new Error('request timed out'), { code: TIMEOUT_CODE });

test('isWallTimeout: a provider timeout on a BOUNDED, EXPIRED clock is the run\'s own deadline — the derived call bound came from the wall, so this is governance, not transport', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(600_000);
  assert.equal(isWallTimeout(etimedout(), c), true);
});

test('isWallTimeout: the SAME error with time still on the clock is transport — a real dead socket must never be laundered into a governance stop', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(599_999);
  assert.equal(isWallTimeout(etimedout(), c), false, 'one millisecond short of the cap is still a transport failure');
});

test('isWallTimeout: an UNBOUNDED run can never produce one — with no cap there is no wall for a timeout to be derived from', () => {
  const f = fakeNow();
  const c = createClock({ now: f.now });
  f.at(99_000_000);
  assert.equal(isWallTimeout(etimedout(), c), false);
});

test('isWallTimeout: only the provider timeout code counts — every other transport failure stays transport even past the cap', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(700_000);
  assert.equal(isWallTimeout(Object.assign(new Error('reset'), { code: 'ECONNRESET' }), c), false);
  assert.equal(isWallTimeout(Object.assign(new Error('pipe'), { code: 'EPIPE' }), c), false);
  assert.equal(isWallTimeout(new Error('no code at all'), c), false);
  assert.equal(isWallTimeout(null, c), false, 'a null throw must not crash the classifier — it is on the escalation path');
  assert.equal(isWallTimeout(undefined, c), false);
});

test('isWallTimeout: the code is bare-agent\'s own (BA-18) — pinned, because a rename upstream silently reopens F64', () => {
  assert.equal(TIMEOUT_CODE, 'ETIMEDOUT');
});

// ─── BA-19: the TOTAL-call-duration deadline (F72 park D) ───
//
// BA-18's `timeoutMs` is an IDLE bound — `req.setTimeout`, reset by every byte — so a
// response that trickles forever never trips it (F66's 274-minute call; bare-agent's own
// provider-http.js:82 says the same). BA-19 adds an absolute ceiling that no byte resets.
//
// It is DISABLED by default upstream (`resolveTimeoutMs(..., 0, 'deadlineMs')`,
// provider-http.js:45-56), and it stays disabled here whenever the operator set no wall:
// a deadline picked out of the air is a silent second ceiling, which is exactly what
// `maxWallMs` having no default exists to prevent (F45). So the ONLY source of this number
// is the wall's own remainder — which is also what makes a trip a governance stop rather
// than a casualty (F64).

const edeadline = () => Object.assign(new Error('[AnthropicProvider] request exceeded its total deadline of 600000ms'), { code: DEADLINE_CODE, retryable: false, context: { bound: 'deadline' } });

test('callDeadlineMs: an UNBOUNDED run gets NO deadline at all — null, never a number, because a defaulted cap is a silent second ceiling (F45)', () => {
  const f = fakeNow();
  const c = createClock({ now: f.now });
  assert.equal(c.callDeadlineMs(), null);
  f.at(10 * 60 * 60_000);
  assert.equal(c.callDeadlineMs(), null, 'ten hours in, still no invented ceiling — the operator chose unbounded');
});

test('callDeadlineMs: the deadline is the REMAINING wall read at call time, not at run start — a constant would bound the last call by the first call\'s budget', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 3_600_000, now: f.now });
  assert.equal(c.callDeadlineMs(), 3_600_000, 'at t=0 the whole wall is still ahead');
  f.at(600_000);
  assert.equal(c.callDeadlineMs(), 3_000_000, 'ten minutes in, the ceiling has shrunk by exactly that');
  f.at(3_000_000);
  assert.equal(c.callDeadlineMs(), 600_000);
});

test('callDeadlineMs is NOT clamped to the provider default the way callTimeoutMs is — the idle bound above its own default would be inert, a total-duration ceiling above it is the whole point', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 3_600_000, now: f.now });
  assert.equal(c.callTimeoutMs(), PROVIDER_TIMEOUT_MS, 'the idle bound saturates at 10 min');
  assert.ok(c.callDeadlineMs() > PROVIDER_TIMEOUT_MS, 'the deadline does not — a trickling stream must still be bounded at the wall');
});

test('callDeadlineMs floors at MIN_CALL_TIMEOUT_MS, exactly as the call timeout does — a 50ms ceiling is certain to trip and 0 would DISABLE the bound upstream (provider-http.js: `if (!(deadlineMs > 0)) return`)', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(599_950);
  assert.equal(c.callDeadlineMs(), MIN_CALL_TIMEOUT_MS);
  f.at(700_000);
  assert.equal(c.callDeadlineMs(), MIN_CALL_TIMEOUT_MS, 'past the deadline it is still a usable positive number — never 0, which upstream reads as "no bound"');
});

test('isWallTimeout: a DEADLINE trip past the cap is the run\'s own wall coming back — the value was derived from it, so it is governance, never a casualty (F64 class, new code)', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(600_000);
  assert.equal(isWallTimeout(edeadline(), c), true);
});

test('isWallTimeout control: a DEADLINE trip with time still on the clock stays transport — the discriminator is the WALL, never the error code, so a foreign deadline (a provider constructed with its own) can never be laundered into a governance stop', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, now: f.now });
  f.at(599_999);
  assert.equal(isWallTimeout(edeadline(), c), false);
  const un = createClock({ now: fakeNow().now });
  assert.equal(isWallTimeout(edeadline(), un), false, 'and an unbounded run has no wall to attribute it to at all');
});

test('isWallTimeout: the deadline code is bare-agent\'s own (BA-19) — pinned beside BA-18\'s, because a rename upstream silently reopens F64 on the new bound', () => {
  assert.equal(DEADLINE_CODE, 'EDEADLINE');
  assert.notEqual(DEADLINE_CODE, TIMEOUT_CODE, 'two bounds, two codes — upstream splits them so a consumer can tell which timer fired');
});

// ─── the RESUMED leg: prior elapsed folds in (module C, resume-after-kill) ───
//
// hamr's checkpoint ruling: a run killed mid-try restarts THAT try under the
// REMAINDER of its signed per-try numbers — "a budget ceiling folds in prior spend
// so re-invoking cannot silently widen it", and the wall is the same ruling in a
// time coat. The signed cap is NEVER edited (that would be a new spec version and a
// new hash); what changes is that the clock starts already partly spent.

test('resume: priorElapsedMs folds into the clock — the SIGNED cap is unchanged and the remainder is what is left of it', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, priorElapsedMs: 400_000, now: f.now });
  assert.equal(c.requestedMs, 600_000, 'the cap the operator signed is the cap reported — a resume never rewrites it');
  assert.equal(c.elapsedMs(), 400_000, 'the dead attempt\'s time is already consumed');
  assert.equal(c.remainingMs(), 200_000);
  assert.equal(c.expired(), false);
  f.at(200_000);
  assert.equal(c.expired(), true, 'the fold is what makes the remainder bind — a fresh allotment would widen the signed worst case');
  assert.equal(c.report(120_000).elapsedMs, 400_000 + 200_000, 'the record states the try\'s WHOLE elapsed, both attempts');
});

test('resume: a prior fold BEYOND the cap expires the clock immediately — it can never read as a fresh allotment', () => {
  const f = fakeNow();
  const c = createClock({ maxWallMs: 600_000, priorElapsedMs: 900_000, now: f.now });
  assert.equal(c.expired(), true);
  assert.equal(c.remainingMs(), 0, 'floored at 0, never negative');
});

test('resume: a garbage or absent prior fold is 0, never a silent shift of the deadline', () => {
  const f = fakeNow();
  for (const bad of [undefined, null, NaN, -5, 'lots', Infinity]) {
    const c = createClock({ maxWallMs: 600_000, priorElapsedMs: /** @type {any} */ (bad), now: f.now });
    assert.equal(c.elapsedMs(), 0, `priorElapsedMs ${String(bad)} must not move the clock`);
  }
});
