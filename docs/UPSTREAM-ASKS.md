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

## OPEN — bareguard: export the secret-token patterns (or a `detect()`)

**Which:** bareguard · **What's missing:** bareguard redacts secret values (internal
`DEFAULT_SECRET_VALUE_PATTERNS`, unexported) while bareloop's validators now red on
secret literals with their own `SECRET_RE` (`src/validate.js`) — two secret vocabularies
in one product that will drift as token shapes get added to one and not the other.
**Surfaced by:** N1 code-review (reuse angle, 2026-07-12; the review also caught the two
regexes already differing in class spelling). **Ask:** export the patterns (or a
`detect(string) → boolean`) so bareloop binds them the way `validate.js` binds litectx's
`WRITE_KINDS` — the adaptlearn-F5 pattern. **Fix:** unfiled. **Consumed:** —
