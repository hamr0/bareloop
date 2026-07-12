# Upstream asks — bare suite gaps found while building bareloop

Exercising the suite (bareagent, bareguard, litectx, barebrowse, baremobile) and fixing
what's missing upstream is an explicit secondary goal (design record §"one paragraph").
This is a **fix queue, not a log**: we own the suite, so a gap gets fixed at the repo that
owns the primitive and consumed here by version bump — never a local shim in bareloop.

Only **upstream-gap reds** (primitive missing or broken) land here. A *locked-but-exists*
request-red resolves in-loop by registry admission and never becomes an entry — the two
reds have different resolutions and must not be collapsed (PRD addendum v1.1 §3).

Format per entry: **which package · what's missing/broken · the run/finding that surfaced
it · the fix (upstream commit/PR) · the version bareloop consumed.**

## WITHDRAWN (2026-07-12) — bareguard secret redaction is already exported

Filed then withdrawn same day after reading bareguard's source. bareguard **already
exports `redact`** (BG-1 default-on: `Bearer …`/`sk-…` value patterns + key-aware
blanking), which is exactly what the spine-source scrub needs — `src/interpret.js` now
consumes it directly (`ralph.js` scrubs close output at capture; F5). No upstream change
was needed. The two "vocabularies" are a deliberate split, not drift: **validators keep
their own tuned `SECRET_RE`** because DETECTION (redding a whole spec) needs a low false-
positive rate, while **redaction tolerates false-positives** (masking a package name in a
failure log blocks nothing). bareguard's own `sk-[\w-]{16,}` has the same missing-left-
boundary the validator fix corrected — one more reason the validator does not bind it.

*(No open asks from this repo.)*
