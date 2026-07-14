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

## OPEN (2026-07-14) — BA-1: bare-agent cannot cache a tool loop's transcript on Anthropic

**Package:** bare-agent (`src/provider-anthropic.js`) · **Severity: the biggest gap this
repo has found.** It is not a bareloop bug; it taxes *every* tool-loop agent in the suite.

**What's missing.** Anthropic does **not** auto-cache — bare-agent's own JSDoc says so
(`cacheSystem`: *"Anthropic does NOT auto-cache, so without this its cache tiers are always
0"*). But `cache_control` can only be placed on **`system`**. The `messages` array never
gets a breakpoint, and `_toAnthropicMessage()` **rebuilds** `role: 'tool'` messages into
fresh `tool_result` blocks, discarding anything a caller attached. In a tool loop the
transcript *is* the tool results (file contents from `shell_read`), and it always **ends**
on one — so there is no seam (`assemble` included) through which a caller can mark the
prefix. `cacheSystem` doesn't help: the system prompt is the ~200-token persona, below
Anthropic's ~1024-token cache minimum.

**Consequence: the loop re-buys its entire transcript at full input price, every round.**
Measured on job #1 (real litectx, real model, F18): **754,836 fresh input tokens, 0 cached,
$1.55 — and the job died at the cap without ever writing a fix.**

**The fix (≈6 lines).** Place a rolling `cache_control: {type:'ephemeral'}` on the last
content block of the last message at body-build time (Anthropic caches the whole prefix up
to the mark; rolling it forward each round keeps the growing transcript cached). Ideally
behind an opt-in flag mirroring `cacheSystem` (e.g. `cacheMessages`), defaulting **on** for
tool loops — the failure mode of *not* caching is a silent 5–10× bill.

**Evidence, measured against the real API, one knob apart** (spike:
`poc/`-class, never shipped; provider patched in a scratch COPY, `node_modules` untouched):

| | round 1 | round 2 | round 3 | round 4 |
|---|---|---|---|---|
| today (no breakpoint) | $0.1524 | $0.1525 | $0.1525 | $0.1526 |
| with breakpoint | $0.1903 *(cache write)* | **$0.0162** | **$0.0162** | **$0.0163** |

Steady-state **9.4× cheaper per round**; the cache write (1.25×) is paid once. End to end on
job #1 the same budget bought **~4× the context throughput** (754k full-price tokens → 2.9M
cache-read tokens) and the job **greened for the first time** (1 of 2 reps; caching is
necessary, not sufficient — see BA-2).

**Fix upstream + version bump. No local shim** (design law #10): the provider is a
shell-owned binding, so bareloop *could* bind a patched copy — and must not.

## OPEN (2026-07-14) — BA-2: `shell_read` cannot seek, so a worker cannot navigate a large file

**Package:** bare-agent (`tools/shell.js`) · surfaced by the same job #1 runs (F18).

**What's missing.** `shell_read`'s only sizing knob is **`maxBytes`** — a cap measured from
**byte zero**. There is no `offset`/`start` (nor a line range). A worker facing a 117 KB file
has exactly two moves: swallow it whole, or re-read the same prefix. It cannot look at the
middle.

**Consequence.** The real worker read `src/store.js` (117 KB) **nine times** in one run and
`src/index.js` (90 KB) three times — pulling **1.37 MB** of source through context to find a
one-character bug in a 3.4 KB file. It was not being stupid: it was trying to page through a
file with a tool that has no pager. With caching wired (BA-1) it simply thrashes *longer* —
the failing rep re-read the same 7 files **42 of 49 reads (86%)**.

**The fix.** Add `offset` (bytes or lines) to `shell_read`, so a range read is expressible.
Related, and worth considering together: bare-agent already ships `liteCtxMcpBridgeConfig`
(`recall · get · impact · recent`, read-only) — chunk retrieval is the *other* half of this,
and is the standing candidate for bareloop's worker toolbox once granted.

*(No other open asks from this repo.)*
