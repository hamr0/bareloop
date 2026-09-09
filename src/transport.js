// hamr's ruling, verbatim: "one retry for transport layer failure and
// reporting with the rest end of gate." (F115, docs/logs/FINDINGS.md.)
//
// A transport failure is fetch THROWING — the request never produced an HTTP
// response at all (a TLS fault mid-record, a reset socket, a DNS/network
// failure) — OR bare-agent's own BA-25 `guardResponseSettles` rejecting a
// response cut after headers but before the body completed (a peer
// `'aborted'`/`'error'`/premature `'close'`), tagged `context.bound:
// 'transport'` (bare-agent 0.42.0, node_modules/bare-agent/src/provider-http.js).
// That is a DIFFERENT unknown from an HTTP response the provider DID send
// (4xx/5xx/429): a response means the provider answered, so bare-agent's own
// retry policy for those stays exactly what it is — this module never widens
// that. Retrying only the no-response case is the whole point: a call that
// dies mid-read may already have been billed (retry can pay twice), so the
// retry budget stays as tight as hamr authorized it — exactly one extra
// attempt, never configurable upward from a job spec or argv (tighten-only
// doctrine).
//
// Scope: this module wires ONE seam — the worker Loop built in
// src/planrun.js's `newLoop` (~line 2239), which is the ONE factory behind
// every scout/drafter/step/fix-worker call. It deliberately does NOT reach
// the judge loops (src/judged.js), the native/CLI loop (src/planrun.js
// ~2089), or the authoring scout (src/authorscout.js) — none of those are in
// scope of hamr's ruling and each has its own transport story.

/** The fixed retry budget: ONE extra attempt after the first transport
 * throw. Never read from a job spec or CLI flag — raising it is arbiter
 * territory (only a code change hamr signs, never a run-time knob). */
export const TRANSPORT_RETRIES = 1;

/** bare-agent's `Retry.call` counts ATTEMPTS, not retries. */
export const TRANSPORT_MAX_ATTEMPTS = TRANSPORT_RETRIES + 1;

/**
 * Is `err` a transport-class failure — the request never produced an HTTP
 * response? True for: a TLS fault mid-record ("bad record mac" and kin), a
 * reset/broken/timed-out socket (ECONNRESET, EPIPE, ETIMEDOUT, ECONNREFUSED,
 * ENETUNREACH — by code on the error itself or on `err.cause`), `fetch
 * failed` wrapping a network `cause`, and — as of bare-agent 0.42.0 (BA-25)
 * — a `ProviderError` whose `err.context.bound === 'transport'`: the
 * response stream ended (`'aborted'`/`'error'`/premature `'close'`) after
 * headers but before the body completed, which bare-agent itself rejects as
 * retryable with no HTTP status. False for anything carrying an HTTP status
 * (`err.status`/`err.statusCode`, 4xx/5xx/429) or an explicit
 * `err.retryable === false` — those are provider RESPONSES, not transport
 * casualties, and bare-agent's own policy governs them unchanged; both
 * guards run BEFORE the `context.bound` check, so a status or an explicit
 * `retryable:false` wins even if `bound` says 'transport'.
 * @param {any} err
 * @returns {boolean}
 */
export function isTransportFailure(err) {
  if (err == null) return false;
  // An explicit HTTP response is never a transport casualty, no matter what
  // its message says — the provider answered.
  const status = err.status ?? err.statusCode;
  if (typeof status === 'number') return false;
  if (err.retryable === false) return false;

  // BA-25 (bare-agent 0.42.0): bare-agent's own transport classification —
  // `guardResponseSettles` tags a body-cut-after-headers rejection with
  // `context.bound: 'transport'`. Only 'transport' qualifies here — a
  // sibling bound like 'idle' (BA-19's deadline-idle guard) already
  // qualifies via its ETIMEDOUT code below, never by bound alone.
  if (err.context && err.context.bound === 'transport') return true;

  const codeOf = (e) => (e && typeof e.code === 'string' ? e.code : null);
  const TRANSPORT_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EAI_AGAIN']);
  const code = codeOf(err) ?? codeOf(err.cause);
  if (code && TRANSPORT_CODES.has(code)) return true;

  const message = String(err.message ?? err ?? '');
  if (/bad record mac/i.test(message)) return true;
  if (TRANSPORT_CODES.has(message.trim())) return true;
  for (const c of TRANSPORT_CODES) if (message.includes(c)) return true;
  if (/fetch failed/i.test(message)) {
    // "fetch failed" alone is Node's generic wrapper — it is only a
    // transport casualty when its cause names a network fault, never on
    // message text alone (a fetch can also fail on a non-network throw
    // upstream, and that must not silently qualify).
    const causeCode = codeOf(err.cause);
    if (causeCode) return true;
    const causeMsg = String(err.cause?.message ?? '');
    if (/bad record mac/i.test(causeMsg) || [...TRANSPORT_CODES].some((c) => causeMsg.includes(c))) return true;
    return false;
  }
  return false;
}
