// T's wall clock — the shell's time instrument (PRD v1.27/v1.29; materials
// design record 2026-07-26, addenda 1 and 3).
//
// Time is arbiter territory with exactly `budgetUsd`'s status: operator input,
// the agent may tighten and never widen, never self-raised. The agent has no time
// field in the plan vocabulary at all (addendum 2), so nothing here is reachable
// from an agent-authored document — this module is read by the runner only.
//
// Three measured facts shape it, none of them assumed:
//
//   1. `loop.stop()` CANNOT cut an in-flight call. Measured (F61/C1): fired at
//      500ms against a 4,000ms hanging generate(), run() returned at 4,018ms.
//      bare-agent reads the flag at the round boundary (loop.js:661) and between
//      tool calls (:916). So a wall deadline is a BETWEEN-ROUND check, and
//      enforcement is `maxWallMs + closeTimeoutMs` — reported, never rounded down
//      to the requested number (F6 in a time coat).
//   2. BA-18's provider timeout is the only instrument that fires on the ABSENCE
//      of events. Measured (F61/C2): 1,259ms against a socket that accepts and
//      never answers; without it the bound is the OS TCP timeout (~2h). Deriving
//      it from the remaining budget is what stops the LAST round outliving the run.
//   3. ~90% accuracy is the bar, by hamr's ruling (addendum 3). This module does
//      not chase precision; it reports honestly at the precision it has.
//
// Unbounded is a REAL state, not a large number: hamr ruled `maxWallMs` has no
// default, so a run without one is time-unbounded by explicit operator choice and
// says so (F45 — a defaulted cap is a silent second ceiling).

/** BA-18's default request/idle timeout (`AnthropicProvider.timeoutMs`), the
 * ceiling every derived per-call timeout starts from. Kept in sync deliberately:
 * a value ABOVE the provider's own default would be inert. */
export const PROVIDER_TIMEOUT_MS = 600_000;

/**
 * The floor for a derived per-call timeout. Below this a call cannot plausibly
 * succeed, and a timeout that is certain to trip manufactures a `provider-red`
 * out of a time budget — a transport CASUALTY, which is never evidence
 * (F45/F48). The deadline check is what must stop a run out of time; the per-call
 * timeout exists to bound a HANG, not to enforce the budget's last second.
 */
export const MIN_CALL_TIMEOUT_MS = 30_000;

/** bare-agent's rejection code when its request/idle timeout trips (BA-18,
 * `provider-http.js` → `TimeoutError`). The error carries a `code` and NO
 * `category`, so every consumer that defaults an uncategorised throw would file
 * it as transport. */
export const TIMEOUT_CODE = 'ETIMEDOUT';

/**
 * F64 — is this throw the run's OWN deadline coming back dressed as a provider
 * error? `callTimeoutMs()` hands the provider a bound derived from the wall, so
 * when the wall is what shrank that bound, the resulting `TimeoutError` is a
 * GOVERNANCE stop, not a casualty. Filing it as `provider-red` would discard it
 * (a casualty is never evidence, F45/F48) and attach the F44
 * `spendComplete:false` floor to a run that simply ran out of time.
 *
 * The discriminator is the wall itself, not the derived number: on a bounded
 * clock a trip can only precede expiry when the bound came from the provider's
 * own default (`remainingMs() > PROVIDER_TIMEOUT_MS`), and that case is transport
 * by construction. So "already expired" IS the wall-derived set. An unbounded run
 * can never produce one, and needs no separate `bounded` term to say so —
 * `expired()` is false by construction with no cap. (A mutation run proved the
 * extra term inert; the unbounded case is guarded by its own test instead, which
 * is where that invariant belongs.)
 *
 * A genuine dead socket on a run whose wall has ALSO passed reads as a wall-halt.
 * That is deliberate and honest: the run is out of time either way, the remedy is
 * the same (raise `maxWallMs`), and the alternative — calling a governance stop
 * transport on the chance that it was — is the failure this closes.
 *
 * @param {any} err the throw as caught
 * @param {Clock} clock the run's clock
 * @returns {boolean}
 */
export function isWallTimeout(err, clock) {
  return !!err && err.code === TIMEOUT_CODE && clock.expired();
}

/**
 * @typedef {object} Clock
 * @property {boolean} bounded whether the operator set a cap at all
 * @property {number|null} requestedMs the operator's number; `null` when unbounded
 * @property {() => number} elapsedMs wall time since the clock was created
 * @property {() => number} remainingMs what is left, floored at 0; `Infinity` when unbounded
 * @property {() => boolean} expired whether the deadline has passed (always false when unbounded)
 * @property {(closeTimeoutMs: number) => number|null} enforcedMs the HONEST worst case
 * @property {(providerDefaultMs?: number) => number} callTimeoutMs the derived per-call bound
 * @property {(closeTimeoutMs: number) => object} report one spine-safe shape carrying both numbers
 */

/**
 * Start a wall clock for one run.
 * @param {{ maxWallMs?: number|null, now?: () => number }} [opts] `maxWallMs`:
 *   the signed operator cap, or absent/null for an honestly unbounded run.
 *   `now`: injected for tests — the default is the real clock.
 * @returns {Clock}
 */
export function createClock({ maxWallMs = null, now = () => Date.now() } = {}) {
  const startedAt = now();
  // A cap is only a cap if it is a usable positive number. validateJob already
  // reds anything else, so this is the belt (a caller that hand-builds a spec
  // must not be able to turn a garbage value into a silent unbounded run OR a
  // silent instant expiry).
  const bounded = typeof maxWallMs === 'number' && Number.isFinite(maxWallMs) && maxWallMs > 0;
  const cap = bounded ? maxWallMs : null;

  const elapsedMs = () => now() - startedAt;
  const remainingMs = () => (cap === null ? Infinity : Math.max(0, cap - elapsedMs()));
  // Inclusive: AT the deadline is out of budget. A run resumes to cap, and the
  // stop IS the checkpoint (v1.12) — so stopping one round early is correct and
  // stopping one round late is the overshoot addendum 1 quantifies.
  const expired = () => cap !== null && elapsedMs() >= cap;

  return {
    bounded,
    requestedMs: cap,
    elapsedMs,
    remainingMs,
    expired,
    enforcedMs: (closeTimeoutMs) => (cap === null ? null : cap + closeTimeoutMs),
    callTimeoutMs: (providerDefaultMs = PROVIDER_TIMEOUT_MS) => {
      if (cap === null) return providerDefaultMs;
      // Clamped BOTH ways. Upper: never above the provider's own default, which
      // would be inert. Lower: never below MIN_CALL_TIMEOUT_MS, and in
      // particular never 0 — `0` DISABLES the provider timeout entirely
      // (provider-anthropic.js), which is the exact opposite of the intent and
      // would restore the ~2h OS-TCP hang on the last round of a tight budget.
      return Math.min(providerDefaultMs, Math.max(MIN_CALL_TIMEOUT_MS, remainingMs()));
    },
    report: (closeTimeoutMs) => ({
      bounded,
      requestedMs: cap,
      enforcedMs: cap === null ? null : cap + closeTimeoutMs,
      elapsedMs: elapsedMs(),
      // null, not Infinity: JSON.stringify turns Infinity into null anyway, and
      // an append-only record must not depend on that coincidence — worse, a
      // downstream `?? 0` on an Infinity would read as "no time left" (F6 class).
      remainingMs: cap === null ? null : remainingMs(),
    }),
  };
}
