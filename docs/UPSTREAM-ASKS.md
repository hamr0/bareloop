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

*(Empty — nothing filed yet from this repo.)*
