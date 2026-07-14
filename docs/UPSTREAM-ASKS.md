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

> **Handoff spec: [`UPSTREAM-FIXES.md`](UPSTREAM-FIXES.md)** — the asks below that are still
> OPEN (BA-1, BA-4, BA-5), written for the implementer: evidence, the exact change, and
> acceptance criteria that can fail. This file stays the fix *queue* (status + the version
> bareloop consumed); that file is what gets handed to each repo. Withdrawn/closed/superseded
> entries stay legible here — a misfiled ask is itself a finding.

## OPEN (2026-07-14) — BA-4: `shell_write` silently truncates a file to ZERO BYTES when `content` is missing

**Package:** bare-agent (`tools/shell.js`, `writeFile`) · **Severity: CRITICAL — silent data
loss, and a consumer's gate structurally cannot see it.**

**What's broken.** `path` is guarded; `content` is not.

```js
async function writeFile({ path: rawPath, content = '', append = false, maxBytes }) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new Error('shell_write requires a non-empty "path" string');
  }
  const text = content == null ? '' : String(content);
```

**The asymmetry IS the defect.** An empty/non-string `path` throws. An **absent or null
`content` defaults to `''`** — so a tool call that omits `content` **overwrites the target file
with nothing** and reports success: `"wrote 0 bytes to <path>"`. A destructive no-op is
indistinguishable from a successful write.

**Observed live (this repo, real model).** A `claude-haiku-4-5` worker asked to rewrite a
1789-line file hit its **output-token cap**; the tool call came back with `content` **absent**;
`shell_write` emptied the file. Diff: `src/store.js | 1789 ------------------`. The suite went
from **3 failures to 41**. Gate audit for the run: **14 write records, 10 of them `bytes=0`,
every one `decision=allow`** — because a 0-byte write is a **legal** write. bareguard's `fs`
primitive judges `{type:'write', path}` and never inspects the body, so **no gate can catch
this**; it is not a policy gap, it is a missing precondition in the primitive.

**Why it matters to adopters.** Any bare-agent consumer that grants the write tool has a silent
data-loss path its gate is structurally blind to — and a truncated output (a long file, a
cut-off generation) is the *normal* way to trigger it, not an adversarial one. bareloop's tool
mode grants `write` **today**, so this is live in shipped code.

**The fix.** `shell_write` must **reject** a call whose `content` is **absent, null, or a
non-string** — the same guard `path` already gets. An empty body must stay expressible only via
an explicit, unambiguous opt-in (`content: ""` passed deliberately, or a `truncate: true` flag)
— never as the default for a missing argument.

**Acceptance criteria (must be able to fail).**

1. `shell_write({path: '/tmp/x.js'})` with **no** `content` arg → **THROWS**; `/tmp/x.js` is
   byte-identical afterwards.
2. `shell_write({path: '/tmp/x.js', content: null})` → **THROWS**; file unchanged.
3. `shell_write({path: '/tmp/x.js', content: ''})` → **still succeeds** (a deliberate empty
   write stays expressible); the file is 0 bytes.
4. A pre-existing **1000-byte** file survives (1) and (2) with its content **intact** — the
   assertion is on disk state, not on the return string.

**Fix upstream + version bump. No local shim** (design law #10) — **decided by hamr 2026-07-14,
and the doctrine holds even for a safety bug.** The consequence is accepted, not worked around:
**BA-4 is a hard N2-exit blocker and the rung STOPS on bare-agent** (see *"OUR SIDE"* §4).

## OPEN (2026-07-14) — BA-5: every governance halt/deny path DISCARDS the worker's text (supersedes BA-3)

**Package:** bare-agent (`src/loop.js`) · **Severity: high.** **This SUPERSEDES BA-3** — *not
because BA-3 was wrong, but because WE under-scoped it.* BA-3 found this defect, by the right
mechanism, on the `loop.stop()` path, and asked for that one path to be fixed. Re-reading
`loop.js` shows the **same** discard on **four** paths. BA-5 does **not** discover text loss; it
**generalizes BA-3's finding from one path to four.** BA-3's original text stays below, legible.

**What's broken.** `Loop.run()` has **five** return points. **Exactly ONE preserves the text.**
Verified at bare-agent **0.26.2**:

```js
line 620:  return { text: '',          …, error: err.message,      … };  // halt (exception)
line 684:  return { text: result.text, …, error: null,             … };  // CLEAN FINISH — the ONLY
                                                                          //   path that keeps text
line 782:  return { text: '',          …, error: denyTag,          … };  // deny streak
line 843:  return { text: '',          …, error: `halt:${rule}`,   … };  // limits / budget halt
line 852:  return { text: '',          …, error: warning,          … };  // loop fall-through — THE
                                                                          //   stop() PATH
```

**Every exit that is not a clean, model-elected finish throws the work away.** The `error`/rule
tag survives; the text does not.

**The 852 path is the one BA-3 named, and its mechanism is confirmed.** `stop()` sets
`this._stopped = true` (line 938); the round loop checks `if (this._stopped) break` (lines 544
and 699) and **falls through past the for-loop** to the return at 852 — which yields `text: ''`
carrying the **`HARD_ROUND_LIMIT` warning** as its `error`. So a caller's **deliberate** stop is
returned as **indistinguishable from a runaway**, *and* its text is discarded. That is precisely
what BA-3 claimed. The other three (620, 782, 843) are the same defect on the paths BA-3 did not
look at.

**Why it matters.** In a ralph-style loop (`while close-red and under-cap: run the worker`), **a
bound firing is NORMAL operation, not an exception.** The worker's summary of what it did and
what it ruled out is the **only** channel from one bounded attempt to the next. Discard it and a
bounded attempt teaches its successor **nothing** — the loop cannot ratchet (cf. F21, where a
never-green run already has no legal channel between attempts; this closes the last one).

**Observed live.** With a step bound implemented as a gate limit, **every step returned an empty
artifact**, and the artifact-feed-forward channel — *the entire variable under test in that
experiment* — carried empty strings between steps. The experiment was **unreadable** until we
worked around it by making the gate's `humanChannel` return `deny` instead of `terminate`.

**The fix.** All four discard paths must **preserve the text the model already produced**: return
the accumulated text alongside the `error`/rule tag and let the caller decide what a partial
result is worth. Do **not** substitute `''`. And — BA-3's original ask, now the **852 sub-case** —
a **caller-initiated `loop.stop()` must return `error: null`**, not the `HARD_ROUND_LIMIT`
warning: a deliberate stop is not a fault and must not be reported as a runaway.

**Acceptance criteria (must be able to fail).**

1. A scripted Loop whose model emits text and then trips a `limits.maxTurns` halt returns
   `{ error: 'halt:limits.maxTurns', text: <the non-empty text the model produced> }` — `text`
   is **NOT** `''`. *(line 843)*
2. Same for a **deny-streak** termination *(line 782)* and a **halt/exception** path *(line
   620)*.
3. **The `stop()` path *(line 852)*:** a Loop stopped via `loop.stop()` **after** the model has
   produced text returns **that text** *and* **`error: null`** — **not** `text: ''`, and **not**
   the `HARD_ROUND_LIMIT` warning string it returns today. Both halves must be asserted: the
   error is the half BA-3 filed, the text is the half BA-5 adds.
4. **Negative control:** a Loop that halts **before** the model ever produced text still returns
   `text: ''` — nothing to preserve. Without this, the suite cannot distinguish *"preserved"*
   from *"always non-empty"*, and a fix that stuffs a placeholder into `text` would pass.
5. **Positive control:** the clean-finish path *(line 684)* is unchanged — it already returns
   `{text: result.text, error: null}`, and this fix must not regress it.

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

## WITHDRAWN (2026-07-14) — BA-2 was MISFILED: the ranged read was never `shell_read`'s job — it is litectx's `get`

> **WITHDRAWN 2026-07-14 — wrong package; the capability exists and bareloop consumed it this
> session.** The ask was filed as "no ranged-read primitive in bare-agent's `shell_read`; the
> only route is `sed` via `shell_run`, which bareloop locks." But the ranged read was never
> `shell_read`'s job: it is **litectx's `get(path, {startLine, endLine})`**, shipped in 0.29.1
> — one content-hash-gated chunk, refusing any non-chunk-boundary range, so it cannot be
> widened into a whole-file read. bareloop consumes it as the F19 `ctx_get` tool
> (`litectx ^0.29.1`); the `run` lock is untouched, because the retrieval verbs are read-only
> by construction. The misfiling itself is the finding — **aim the ask at the right package**
> — so the original ask stays below, legible, for the record. Do NOT hand it to bare-agent.

**Package:** bare-agent (`tools/shell.js`) · job #1 runs (F18) · **the load-bearing ask.**

**What's missing.** `shell_read`'s only sizing knob is **`maxBytes`** — a cap measured from
**byte zero**. There is no `offset`, no line range. So a worker can hold a perfect pointer
("the bug is in `tokenize.js:66-72`") and have **no way to act on it**. Its only move is to
swallow the whole file.

**Why it cannot be worked around here, and why that is correct.** There *is* one way to read
lines 66-72 today: `sed -n '66,72p'` — which needs `shell_run`, and bareloop **locks `run` on
purpose** (a worker that can run commands can run its own close; that is the arbiter, design
law #1). The worker is caught between a fence we *want* and a primitive we never built. This
is two-red routing at its cleanest: a **missing primitive → fix upstream**, emphatically NOT
an argument for admitting `run`.

**Consequence (measured).** The control run read `src/store.js` (117 KB) **nine times** and
`src/index.js` (90 KB) three times — **1.37 MB of source** dragged through context to find a
one-character bug in a 3.4 KB function. It was not being stupid: it was paging through a file
with a tool that has no pager. With caching wired (BA-1) it simply thrashes *longer* — the
failing rep re-read the same 7 files **42 of 49 reads (86%)**.

**The fix.** Add a range to `shell_read` — `offset`/`limit` in bytes, or (better for source)
`startLine`/`endLine`, which is the unit litectx already indexes in. Everything else in the
retrieval story is downstream of this one.

## SUPERSEDED by BA-5 (2026-07-14) — BA-3: `loop.stop()` returns a bogus hard-limit error and discards the run's text

> **SUPERSEDED by [BA-5](#open-2026-07-14--ba-5-every-governance-haltdeny-path-discards-the-workers-text-supersedes-ba-3) — hand that upstream, not this. BA-3 is NOT stale and was NOT wrong.**
> Its mechanism claim was **re-verified line-by-line at bare-agent 0.26.2 and is CORRECT**:
> `stop()` sets `_stopped` (938), the round loop `break`s (544, 699) and falls through past the
> for-loop to the return at **852**, which yields `text: ''` carrying the `HARD_ROUND_LIMIT`
> **warning** as its `error` — a deliberate stop returned as indistinguishable from a runaway,
> with the text discarded. Exactly as filed. BA-3 also **already asked for the text to be
> preserved**; BA-5 does not discover text loss.
>
> **The correction is on US, not on BA-3: we UNDER-SCOPED our own ask.** BA-3 found the right
> defect by the right path, then scoped the fix to *that one path* — the one we happened to be
> standing on. The same discard sits on **four** returns (620, 782, 843, **852** = BA-3's), and
> only the clean finish (684) preserves text. Had bare-agent implemented BA-3 as written, the
> loop would still have been unable to ratchet on **every other** bound — which is the shape that
> actually fires in production. BA-5 is BA-3 **generalized from one path to four**, with BA-3's
> `error: null` ask intact as the 852 sub-case. Original text retained below, unamended.
>
> **The lesson (ours): read the whole failure surface before scoping the ask.** Finding a defect
> on the path you're standing on is not the same as knowing where it lives — the ask we sent was
> narrower than the bug we'd found.

**Package:** bare-agent (`src/loop.js`) · surfaced by the F20 attempt bound · **the wart that
made the fix ugly.**

**What's broken.** A caller that stops the round loop deliberately — `loop.stop()` from an
`onLlmResult` handler — breaks bare-agent's internal `while`, which then **falls through to the
`HARD_ROUND_LIMIT` return path**. So a *deliberate* stop comes back as
`{text: '', error: "[Loop] hit internal safety limit of N rounds"}` — **indistinguishable from
a runaway, and it DISCARDS the worker's text.** bareloop bounds a tool-mode attempt by calling
`stop()` at its per-attempt round bound (F20); read literally, that return escalated
`interpreter-red` and killed the whole run at attempt 1 — the bound would have ended the
attempt and killed the loop in the same breath.

**The workaround (local, in bareloop).** A `stoppedByBound` flag: bareloop KNOWS it stopped the
loop, so it ignores the bogus error and keeps its own accounting. It works, but it is a shim
around a lib that reports a caller's intent as a fault. plan-v1 removes bareloop's need for it
(a fresh Gate per step makes `limits.maxTurns` the native step bound), but the wart still taxes
any other suite consumer that stops a loop on purpose.

**The fix.** A stop requested via `stop()` must return `error: null` and **keep the run's
accumulated text** — a caller-initiated halt is not a safety-limit failure and must not be
reported as one.

**Acceptance criteria (must be able to fail).** A scripted loop stopped via `stop()` at round N
returns `error: null` **and** non-empty `text` (the text produced through round N). Without the
fix, `error` is the hard-limit string and `text` is empty — that is the failing assertion.

**Fix upstream + version bump. No local shim** in the shipped path (design law #10); the
`stoppedByBound` flag is the honest interim and is documented as such (F20).

## CLOSED (2026-07-14) — LC-1 [REVISED]: recall's hit is too thin to triage, and its body is unreachable

> **CLOSED 2026-07-14 — litectx's decline is CONFIRMED by our own trace; triage is not the
> bottleneck.** Part 2 (fetch one chunk) **shipped**: litectx 0.29.1's `get(path, {startLine,
> endLine})` returns exactly one content-hash-gated chunk (code + docstring), refusing any
> non-chunk-boundary range — consumed by bareloop (`litectx ^0.29.1`, F19). Part 1 (a snippet
> on the hit) litectx **declined on measurement** (a 400 B chunk-head snippet costs 2.8× on
> every recall; full bodies 27.9×), setting an un-defer condition: a trace showing the worker
> electing **>2 wrong fetches per recall** (i.e. triage, not action, is the bottleneck). **Our
> F19 trace ANSWERS it and confirms the decline: 0.2 fetches per recall (34 recalls / 10 gets;
> `ctx_get` ok=9, no-chunk=1).** Triage is emphatically not where the run is stuck — the worker
> searched the wrong subsystem entirely (F21), which a fatter hit would not have cured. litectx
> also correctly did NOT ship `get({path, symbol})`: 92% of our code chunks have no symbol
> (arrow functions) and duplicate names would silently return the wrong body — `get` by
> line-range is the right primitive. Entry closes.

**Package:** litectx (`src/store.js`, recall/get surface) · job #1 runs (F18).
**Revised 2026-07-14 after hamr pushed back — the first draft of this ask was wrong**, and
the correction is worth keeping: it asked recall to return **full bodies for every hit**,
which would re-create the exact bloat this whole finding is about. Measured against this
repo's index: a `recall(n=5)` that hit the fat tail would dump **61,402 B ≈ 15,350 tokens**
into context *unbidden* — a whole-file read wearing a different hat. (Chunk sizes: median
295 B, p90 1.9 KB, **max 18.8 KB**.) **A search index returns pointers; the caller decides
what to pay for.** That design was right; my ask was not.

**What's actually missing — two bounded things:**

1. **A snippet on the hit, so it can be triaged without fetching.** Today a hit carries
   `path · symbol · nodeType · startLine · endLine · score` — no signature, no prose. The
   worker cannot tell which of five hits is the one. Return the **head of the chunk** (a few
   hundred bytes): with **LC-2** landed that head *is* the docstring + signature, so this
   costs one fix, not two.
2. **A way to fetch ONE chunk.** `get` takes a path and reads **the whole file fresh from
   disk**. The body is already in SQLite — `nodes(path, kind, symbol, node_type, start_line,
   end_line, **body TEXT NOT NULL**)`. Expose `get({path, symbol})` (or by node id) to return
   that single chunk. This is **exposure, not new capability**.

Together with **BA-2** this closes the loop: `recall` says *where* and *roughly what*, one
`get` (or one ranged read) pulls *just that* — 7 lines instead of 117 KB.

## WITHDRAWN (2026-07-14) — LC-2 was OUR ERROR, not a defect: a stale index, never a dropped docstring

> **WITHDRAWN 2026-07-14 — this was a phantom, and the root cause is a live footgun in OUR
> environment, not litectx.** Docstring attachment had been fixed upstream long before we
> filed this; the missing docstrings we measured came from a **stale index that had never
> re-chunked**. hamr's GLOBAL `~/.claude/settings.json` runs a `SessionStart` hook
> (`.../node_modules/litectx/integrations/claude/warm-index.sh`) against a **globally-installed
> litectx v0.5.0**, while every repo imports its own node_modules copy (bareloop: 0.29.1) — a
> **24-version skew, and the OLD one writes the index in every repo hamr opens.** 0.29.1
> self-heals on read (it stamps a hash of its own source in `PRAGMA user_version` and rebuilds
> when the chunker changes), but the 0.5.0 hook re-poisons the index at every session start.
> Fix is local, not upstream: `npm i -g litectx@0.29.1`. This is the "stale index manufactures
> phantom defects" lesson, paid for with a false high-severity bug report. The defect
> description below is **retained for the record only** — do NOT hand it to litectx.

**Package:** litectx (`src/chunker.js`) · **found by hamr**, confirmed against the index.

**What's broken.** A chunk's `body` starts at the code. Tree-sitter's `function_declaration`
node begins at the `function` keyword, so the **leading doc comment is dropped at index
time**. Verified on this repo:

```
recall('runClose') → body starts:  export function runClose(close, redact = …) {
immediately above it in source:    …the signal cannot be "zero judged"; it must be a FLOOR
                                    against a declared baseline: litectx runs ~390 tests…
```

**Consequence.** In a codebase where the *reasoning* lives in the docblock — which is every
codebase written to these rules — recall returns **what the code does with none of why**. A
worker handed `runClose` without its docblock cannot know that `cwd` is load-bearing (F8),
that a timeout is not a `broken-close` (F17), or why the judgment floor exists. The comment
IS the load-bearing part, and it is exactly what gets cut.

**The fix.** Extend a symbol chunk's range upward through an immediately-preceding comment
block (JSDoc `/** … */`, `//` run, `#` run, Python docstring already inside the body) and
include it in `body`. Same fix serves every `format` the chunker handles.

---

## CHECKED AND **NOT** FILED (2026-07-14) — two candidate asks that were OUR errors

The misfiling is the lesson this repo keeps re-learning (**BA-2** aimed at the wrong package;
**LC-2** a phantom from our own stale index), so the near-misses are recorded, not quietly
dropped. Both of these looked like library defects during the same POC run that produced BA-4
and BA-5. **Neither is a defect. Do not hand either to a suite repo.**

**1. bareguard `limits.maxTurns` / `maxToolRounds` semantics — NOT a bug, we misread the API.**
The primitive **documents itself precisely**, in its own source header
(`bareguard/src/primitives/limits.js:2-3`):

```
//   - maxTurns: halt severity (run-level) — every gate.record ticks
//   - maxToolRounds: halt severity — only ticks on non-"llm" records (v0.4.2)
```

We configured a step bound against the wrong counter and got **half the rounds we intended**,
then went looking for a library bug. The counter did exactly what it says. **Our error** — the
fix is to read the primitive and configure the right knob.

**2. Planner spend invisible to the budget — NOT a bug, we simply never wired the hook.**
`Planner` **already accepts `onLlmResult`** (`bare-agent/src/planner.js:18, 49, 94-95`), and its
own docstring states the exact rationale we were about to file as an ask:

> *"Forwards the planning call's usage to the gate so decomposition spend is visible — without
> it the plan call is invisible to bareguard's budget (the RLM Family-B meter gap)."*

The gap was real; the **owner** was us. **Our bug** — tracked under *"OUR SIDE"* below.

**Also noted (no ask needed):** `Planner` accepts a custom `prompt` override
(`src/planner.js:46` — `this.prompt = options.prompt || PLAN_PROMPT`). plan-v1's richer step
schema (tools / exit / bound per step) therefore needs **no upstream change**: we author our own
planner prompt. This is worth stating explicitly, because "the planner can't express our step
schema" was the third ask that nearly got filed.

*(Rule reaffirmed: **read the library source before filing an upstream ask.** Three candidates
went in, two came out.)*

---

## OUR SIDE — bareloop's own bugs, surfaced by the same run (**not** upstream asks)

Routed here because this file is where the **two-red routing** record lives: a gap that turns out
to be ours is the same finding, pointed the other way. None of these are handed to a suite repo.

**1. The planner-metering hole.** `Planner`'s `onLlmResult` hook exists and we never wired it, so
**decomposition spend is invisible to the gate's budget** — an F6-class hole (*unpriced is never
free*) one level up from the ledger. Fix: pass `onLlmResult` when constructing the planner and
meter the plan call like any other round.

**2. The per-run cap is checked only BETWEEN steps, so a step's own gate budget can overshoot
it.** Measured: **$1.21 against a $1.00 cap — 21% over.** This is the *same class* as the known
"the hard cap binds only BETWEEN rounds" (F8–F16 side findings), one level up: every level of the
nesting needs a bound that binds *inside* it, not only at its seams.

**3. Keyword-inferred per-step tools was never the design.** The interim planner *guesses* a
step's tool grant from keywords in its text. plan-v1's planner must **EMIT `tools` / `exit` /
`bound` per step as structured data, validated** — the tool grant is operator territory (the
signed job-spec grant), and inferring it from prose is exactly the fit-to-pass surface the
arbiter split exists to prevent.

**4. BA-4 exposure — a HARD N2-EXIT BLOCKER. The rung STOPS on bare-agent.**
*(Decided by hamr, 2026-07-14: **option (a) — wait for the upstream fix + version bump. No local
shim in `src/`.** The "never a local shim" doctrine holds **even for a safety bug**; two-red
routing is unamended.)*

Until BA-4 lands upstream, **bareloop's own write path can zero a file inside the write scope**,
and the gate structurally cannot see it (a 0-byte write is a legal write). bareloop **cannot
honestly ship a write-granting tool mode** on that primitive.

**N2 exit therefore requires bare-agent to ship BA-4**, and bareloop to consume the version bump
in `package.json`. This is a **legitimate stop, not a soft blocker and not a workaround-pending**
— build-ladder discipline: *a rung that cannot meet its exit stops the ladder; the stop is a
result.* **BA-5 is HIGH but is NOT an exit blocker**: it degrades the loop's ratchet, it does not
destroy data.

**Instrument ≠ product** (stated so a future reader does not read an inconsistency): the
POC/scratch harness **does** guard `content` and **does** carry a shrink-blocker rail. That is an
**instrument**, not shipped code — it never ships, and without it the worker destroys the patient
and every experimental arm is unreadable. *"Never a local shim" binds shipped `src/`, not the
experimental bench.*

*(No other open asks from this repo.)*
