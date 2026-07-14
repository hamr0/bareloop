# Upstream fixes — handoff spec

> **What this is.** Defects/gaps in the bare suite, found by running bareloop's job #1 against a
> real repository with a real model. Each one is stated with the evidence that found it, the
> exact change, and **acceptance criteria that can fail**. Hand the relevant section to the repo
> that owns the primitive.
>
> **Why they're here and not fixed locally:** design law #10 — *consume the bare suite; never
> paper over a lib gap.* A gap gets fixed at the repo that owns the primitive and is consumed
> by version bump. bareloop binds its own provider and could have shimmed BA-1 in ten minutes;
> it must not.
>
> **Owner split (statuses updated 2026-07-14 — see the banners on each entry):**
> - **litectx** — LC-1 **CLOSED** (decline confirmed by our own trace; the chunk fetch shipped
>   in 0.29.1 and is consumed), LC-2 **WITHDRAWN** (our error — a stale-index phantom)
> - **bare-agent** — **BA-4 (OPEN, CRITICAL)**, **BA-1 (OPEN)**, **BA-5 (OPEN — supersedes
>   BA-3)**; BA-2 **WITHDRAWN** (misfiled — the ranged read is litectx's `get`, which shipped)
>
> **Also checked and NOT filed** (see `UPSTREAM-ASKS.md`): bareguard's `limits.maxTurns` /
> `maxToolRounds` semantics (documented in its own source; **we misread the API**) and the
> planner's budget blindness (`Planner` already takes `onLlmResult`; **we never wired it**).
> Both were **our** errors. Nothing to hand upstream — recorded because a misfiled ask is itself
> a finding in this repo (BA-2, LC-2).
>
> **Ground evidence** (bareloop `docs/FINDINGS.md` F8–F22): nine+ real-model runs of job #1 —
> fix a planted one-character regression in litectx's `tokenize.js` (a `>= 3` → `> 3` in
> `keywords()`, which reds 3 recall tests), $1.50 budget, `claude-sonnet-5`. The worker
> **reads half the repository and runs out of money before it writes a fix.** BA-4 and BA-5 come
> from a later POC run of the same job on a `claude-haiku-4-5` worker. Every number below is
> measured, not estimated.

---

# litectx

## LC-2 [WITHDRAWN 2026-07-14] — chunk bodies drop the docstring above the symbol

> **WITHDRAWN — our error, not a litectx defect. Do NOT hand this section to litectx.** The
> missing docstrings were a **phantom from a stale index that had never re-chunked**:
> docstring attachment had been fixed upstream long before this was filed. Root cause is a
> live footgun in OUR environment — hamr's global `~/.claude/settings.json` `SessionStart`
> hook warm-indexes every repo with a **globally-installed litectx v0.5.0** while repos import
> their own node_modules copy (bareloop: 0.29.1), a 24-version skew that re-poisons the index
> at every session start. 0.29.1 self-heals on read; the local fix is `npm i -g
> litectx@0.29.1`. The spec below stays legible for the record (same status + grounds as
> `UPSTREAM-ASKS.md`): a stale index manufactures phantom defects.

**File:** `src/chunker.js` · **Severity: high** — it silently strips the reasoning from every
chunk in the index.

### The defect

A chunk's `body` starts at the code. Tree-sitter's `function_declaration` node begins at the
`function` keyword, so an **immediately-preceding doc comment is dropped at index time**.

Verified against a live index of bareloop:

```
recall('runClose') → body[0]:   export function runClose(close, redact = (s) => s, …) {

immediately above it in source (NOT in the chunk):
    * signal cannot be "zero judged"; it must be a FLOOR against a declared
    * baseline: litectx runs ~390 tests, and a run claiming it judged 1 did not judge…
```

### Why it matters

In a codebase where the *reasoning* lives in the docblock, recall returns **what the code does
with none of why**. A consumer handed `runClose` without its docblock cannot know that `cwd` is
load-bearing, that a timeout is not a `broken-close`, or why the judgment floor exists — the
comment **is** the load-bearing part, and it is exactly what gets cut. Confirmed on the
`function_declaration` path; **please audit every `nodeType` the chunker emits**, not just this
one.

### The fix

When a symbol chunk is emitted, extend its range **upward** through an immediately-preceding
comment block and include it in `body` (and in `startLine`).

- Attach only if the comment block is **adjacent** — no blank line, or at most one — so a
  file-header banner is not glued onto the first function.
- Cover every format the chunker handles: JSDoc `/** … */`, a `//` run, a `#` run. (A Python
  docstring is already *inside* the body — leave it.)
- A comment block already claimed as a `preamble` chunk must not be double-counted.

### Acceptance criteria (must be able to fail)

1. Index a file with `/** doc */\nexport function f() {}`. The `f` chunk's `body` **starts with
   `/**`**, and `startLine` points at the comment, not at `export`.
2. **Negative control:** a function with **no** preceding comment is byte-identical to today —
   no leading blank lines, no drift.
3. **Separation control:** a file-header banner followed by a blank line and then `function g`
   is **not** absorbed into `g`.
4. One test per supported `format`/`nodeType` the chunker emits.
5. Re-index a real repo: no chunk's `body` gains content that isn't a comment.

---

## LC-1 [CLOSED 2026-07-14] — a hit cannot be triaged, and a chunk body cannot be fetched

> **CLOSED — part 2 shipped, part 1 declined and the decline is confirmed by our own trace.**
> litectx 0.29.1 ships `get(path, {startLine, endLine})` — one content-hash-gated chunk —
> and bareloop consumes it (F19 `ctx_get`). The snippet ask litectx declined on measurement,
> with an un-defer condition (>2 wrong fetches per recall); our trace answers it: **0.2
> fetches per recall** — triage is not the bottleneck. Full record in `UPSTREAM-ASKS.md`.

**File:** `src/store.js` + the recall/get surface · **Severity: high** — bareloop's worker
retrieval is blocked on this.

> **Note on this ask (kept deliberately).** Its first draft asked recall to return **full
> bodies for every hit.** That was wrong and would have re-created the very bloat this whole
> finding is about: measured against bareloop's index, a `recall(n=5)` hitting the fat tail
> would dump **61,402 B ≈ 15,350 tokens** into context *unbidden* (chunk sizes: median 295 B,
> p90 1.9 KB, **max 18.8 KB**). **A search index returns pointers; the caller decides what to
> pay for.** litectx's design was right. Two bounded additions are what's actually needed.

### 1. Put a snippet on the hit

Today a hit carries `path · kind · format · score · git · chunk{symbol, nodeType, startLine,
endLine}`. There is **no signature and no prose**, so a caller looking at five hits cannot tell
which one to fetch — it must fetch to find out, which is the cost we're trying to avoid.

**Add a bounded `snippet`: the head of the chunk** (suggest ~400 bytes / ~8 lines, capped and
documented).

**This is where LC-2 pays for itself twice:** once LC-2 lands, the head of a chunk **is** the
docstring + signature. One fix buys both — implement LC-2 first and this becomes a slice.

### 2. Let ONE chunk's body be fetched

`get(id)` takes a path and reads **the whole file fresh from disk**. There is no way to say
*"give me just `keywords` from `tokenize.js`"* — even though the body is **already sitting in
SQLite**:

```sql
nodes(id, path, kind, format, symbol, node_type, start_line, end_line, body TEXT NOT NULL)
```

**Add `get({path, symbol})`** (or by node id) returning that single chunk's body. **This is
exposure, not new capability** — the data is indexed, ranked and stored today.

### Why (measured)

The worker needed `keywords()` — 7 lines in a 3.4 KB file. Unable to ask for it, it read
`src/store.js` (117 KB) **nine times** and `src/index.js` (90 KB) three times: **1.37 MB of
source** dragged through context to find a one-character bug. Recall *already knew* the answer
was at `tokenize.js:66-72`. It just couldn't hand it over.

### Acceptance criteria (must be able to fail)

1. `recall(q)` hits carry `snippet`; it is **≤ the documented cap** for every hit on a real
   repo index (assert the cap — a fat-tail chunk must be truncated, not passed through).
2. After LC-2: the `snippet` of a documented function **contains its docstring**.
3. `get({path, symbol})` returns **only** that chunk's body — assert `length(body) <
   length(whole file)` for a symbol in a large file, and assert it equals `nodes.body`.
4. `get({path, symbol})` for an unknown symbol returns a **named miss**, never the whole file
   as a fallback. (A silent fallback to the full file would reintroduce the bug invisibly.)
5. Existing `get(path)` behaviour is unchanged (whole file) — this is additive.
6. **Bloat guard:** a `recall(n=5)` response over a real repo stays under a documented byte
   ceiling. Test with the fat tail present, or the test cannot fail.

---

# bare-agent

## BA-4 — `shell_write` silently truncates a file to ZERO BYTES when `content` is missing

**File:** `tools/shell.js`, `writeFile` · **Severity: CRITICAL.** Silent data loss, on the
happy path, with a success message — and a consumer's gate **structurally cannot see it**.

### The defect

`path` is guarded. `content` is not.

```js
async function writeFile({ path: rawPath, content = '', append = false, maxBytes }) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new Error('shell_write requires a non-empty "path" string');   // ← guarded
  }
  const text = content == null ? '' : String(content);                    // ← NOT guarded
```

**The asymmetry is the whole bug.** An empty or non-string `path` throws. An **absent or `null`
`content`** quietly becomes `''` — so a tool call that omits `content` **overwrites the target
with nothing** and returns `"wrote 0 bytes to <path>"`. A destructive no-op is reported as a
successful write, and there is no way for a caller to tell the two apart.

### Evidence (observed live, real model)

A `claude-haiku-4-5` worker was asked to rewrite a **1789-line** file. It hit its **output-token
cap** mid-generation; the tool call arrived with `content` **absent**; `shell_write` **emptied
the file**:

```
src/store.js | 1789 ------------------------------------------------------
```

The repo's test suite went from **3 failures to 41**. This is not an adversarial input — a
truncated generation on a long file is the **ordinary** way to produce it.

**And the gate allowed every one of them.** Gate audit for that run: **14 write records, 10 at
`bytes=0`, all `decision=allow`.** That is correct behaviour: a 0-byte write is a **legal**
write, and bareguard's `fs` primitive judges `{type:'write', path}` — it never inspects the
body. **No policy can catch this.** It is not a governance gap; it is a **missing precondition in
the primitive.**

### Why it matters to adopters

Every bare-agent consumer that grants the write tool carries a **silent data-loss path its gate
is blind to**. bareloop's tool mode grants `write` **today** — this is live in shipped code, in
the suite's own flagship consumer.

### The fix

`shell_write` must **reject** a call whose `content` is **absent, `null`, or a non-string** — the
same guard `path` already gets. Keep the empty write **expressible**, but only via an explicit,
unambiguous opt-in:

- `content: ""` passed **deliberately** succeeds (it is a string; the caller meant it), **or**
- an explicit `truncate: true` flag, if you'd rather make emptiness impossible to reach by
  accident at all.

What must **not** survive is `content` **defaulting** to `''` on a missing argument.

### Acceptance criteria (must be able to fail)

1. `shell_write({path: '/tmp/x.js'})` — **no `content` arg** → **THROWS**; `/tmp/x.js` is
   **byte-identical** afterwards.
2. `shell_write({path: '/tmp/x.js', content: null})` → **THROWS**; file unchanged.
3. `shell_write({path: '/tmp/x.js', content: ''})` → **still succeeds**; the file is 0 bytes.
   *(This is the criterion that stops the fix from over-shooting into "you can never empty a
   file".)*
4. A pre-existing **1000-byte** file survives (1) and (2) **with its content intact** — assert
   **disk state**, not the return string. A test that only asserts "it threw" would pass even if
   the truncation happened first.

---

## BA-1 — a tool loop cannot cache its transcript on Anthropic (it re-buys it every round)

**File:** `src/provider-anthropic.js` · **Severity: the most expensive defect found so far.**
Not a bareloop bug — it taxes **every** tool-loop agent built on the suite.

### The defect

Anthropic does **not** auto-cache — bare-agent's own JSDoc says so:

> `cacheSystem` — *"Opt-in prompt caching… **Anthropic does NOT auto-cache, so without this its
> cache tiers are always 0.**"*

But `cache_control` can only be placed on **`system`**. The `messages` array never gets a
breakpoint, and `_toAnthropicMessage()` **rebuilds** `role: 'tool'` messages into fresh
`tool_result` blocks, discarding anything a caller attached. In a tool loop the transcript *is*
the tool results, and it always **ends** on one — so **no caller-side seam can reach it**,
`assemble` included. `cacheSystem` doesn't help: a system prompt is typically a short persona,
below Anthropic's ~1024-token cache minimum, so it silently never caches.

**Result: the loop re-sends its entire growing transcript as fresh, full-price input, every
round.**

### Evidence — measured on the real API, one knob apart

Real job #1 control run: **754,836 fresh input tokens, 0 cached, $1.55**, cap-halt, never wrote
a fix.

A direct spike (real transcript: a 117 KB file read + follow-ups), identical calls, the *only*
difference being one `cache_control` block:

| | round 1 | round 2 | round 3 | round 4 |
|---|---|---|---|---|
| today (no breakpoint) | $0.1524 | $0.1525 | $0.1525 | $0.1526 |
| with breakpoint | $0.1903 *(writes cache)* | **$0.0162** | **$0.0162** | **$0.0163** |

**9.4× cheaper per round in steady state**; the 1.25× cache write is paid once. *The flat line
in row 1 is the bug — the same 50,484 tokens, re-bought forever.*

End to end on job #1 with the fix patched in, the same $1.50 budget bought **~4× the context
throughput** (754k full-price tokens → 2.3–2.9M cache-read tokens), the last round fell from
**$0.25 → $0.04**, and the job **greened for the first time**.

*(Honest limit: 1 of 2 reps. Caching is **necessary, not sufficient** — the worker still
thrashes, which is BA-2/LC-1's problem, not this one.)*

### The fix (~6 lines)

At body-build time in `generate()`, place a rolling `cache_control` breakpoint on the **last
content block of the last message**. Anthropic caches the whole prefix up to the mark; rolling
it forward each round keeps the growing transcript cached as it grows.

```js
// before: const body = { model, max_tokens, messages: msgs, … }
if (cacheMessages && msgs.length > 0) {
  const last = msgs[msgs.length - 1];
  if (Array.isArray(last.content) && last.content.length > 0) {
    last.content[last.content.length - 1].cache_control = { type: 'ephemeral' };
  } else if (typeof last.content === 'string') {
    last.content = [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }];
  }
}
```

**Please default it ON for tool loops.** The failure mode of *not* caching is a silent 5–10×
bill with no error and no signal — exactly the class of bug that only surfaces when someone
decomposes their token ledger, which almost nobody does. If it must be opt-in, mirror
`cacheSystem` (`cacheMessages`), and **say so loudly in the README**, because today's default is
a footgun.

Anthropic allows up to 4 breakpoints; a single rolling mark is enough for the tool-loop case
and is what was measured. Note the interaction with `trim`/compaction: destructively editing
the *prefix* invalidates the cache, so folds should keep the head stable.

### Acceptance criteria (must be able to fail)

1. Two-round integration test against the real API: round 2's
   `usage.cache_read_input_tokens > 0`. **Without the fix this is 0** — that's the failing test.
2. Round 1 reports `cache_creation_input_tokens > 0`.
3. The provider's `Usage` maps both tiers (it already does — `provider-anthropic.js:124-125`).
4. **Negative control:** with the flag off (if opt-in), cache tiers are 0 — proving the test
   reads the flag and not the weather.
5. A transcript **below** the cache minimum still succeeds (Anthropic silently doesn't cache;
   must not error).
6. Tool-result-terminated transcripts are covered — that's the shape that matters, and the one
   `_toAnthropicMessage` rebuilds.

---

## BA-5 — every governance halt/deny path DISCARDS the worker's text *(supersedes BA-3)*

**File:** `src/loop.js` · **Severity: high.** **Supersedes BA-3**, which was filed narrowly
against `loop.stop()` (`UPSTREAM-ASKS.md`). The defect is **general** — it is not the stop path,
it is **every** path where a bound fires. Implement this; BA-3 is a sub-case of it.

### The defect

Three separate returns, all substituting `text: ''`:

```js
line 620:  return { text: '', toolCalls: [], usage: lastUsage, cost: totalCost, error: err.message, msgs, metrics: finalizeMetrics() };
line 782:  return { text: '', …, error: denyTag, … };         // deny streak
line 843:  return { text: '', …, error: `halt:${rule}`, … };   // limits / budget halt
```

When a bound fires — **budget halt, deny streak, `maxTurns`** — the model's **already-produced
text is thrown away** and replaced with `''`. The `error` tag survives. The work does not.

### Why it matters

In a ralph-style loop — `while close-red and under-cap: run the worker` — **a bound firing is
NORMAL operation, not an exception.** It is how a bounded attempt is *supposed* to end. And the
worker's summary of what it did and what it ruled out is the **only** channel from attempt N to
attempt N+1.

So this line silently deletes the loop's ratchet: **a bounded attempt teaches its successor
nothing.** (bareloop already found the other half of this — a never-green run has no legal
memory channel at all, `docs/FINDINGS.md` F21. This is the last one.)

### Evidence (observed live)

With a step bound implemented as a gate limit, **every step returned an empty artifact**, and the
artifact-feed-forward channel — **the entire variable under test in that experiment** — carried
empty strings between steps. The run was **unreadable** until we worked around it by making the
gate's `humanChannel` return `deny` instead of `terminate`. That workaround is a shim around a
lib that throws away the thing the caller came for.

### The fix

A halt / deny / stop must **preserve the text the model already produced**. Return the
accumulated text alongside the `error`/rule tag — the caller decides what a partial result is
worth; the library must not decide it is worth nothing. Do **not** substitute `''`.

Additionally (**BA-3's original ask, now a sub-case**): a **caller-initiated `loop.stop()` must
return `error: null`**. A deliberate stop is not a fault, and reporting it as one
(indistinguishable from a runaway hard-limit) forces every caller to keep a `stoppedByBound` flag
to un-lie the return value.

### Acceptance criteria (must be able to fail)

1. A scripted Loop whose model **emits text** and then trips a `limits.maxTurns` halt returns
   `{ error: 'halt:limits.maxTurns', text: <the non-empty text the model produced> }` — `text` is
   **NOT** `''`.
2. The same for a **deny-streak** termination (line 782) and a **budget halt** (line 620). All
   three paths, not one.
3. A Loop stopped via `loop.stop()` returns `error: null` **and** non-empty `text`.
4. **Negative control:** a Loop that halts **before the model ever produced text** still returns
   `text: ''` — there is nothing to preserve. Without this criterion the suite cannot distinguish
   *"preserved the text"* from *"always returns something non-empty"*, and a fix that stuffs a
   placeholder into `text` would pass.

---

## BA-2 [WITHDRAWN 2026-07-14] — no ranged-read primitive: a pointer the worker cannot act on

> **WITHDRAWN — MISFILED. Do NOT hand this section to bare-agent.** The ranged read was never
> `shell_read`'s job: it is **litectx's `get(path, {startLine, endLine})`**, which shipped in
> 0.29.1 — one content-hash-gated chunk, refusing any non-chunk-boundary range, so it cannot
> be widened into a whole-file read. bareloop consumes it as the F19 `ctx_get` tool
> (`litectx ^0.29.1`); read-only by construction, the `run` lock untouched. The misfiling is
> itself the finding — **aim the ask at the right package** — so the spec below stays legible
> for the record (same status + grounds as `UPSTREAM-ASKS.md`).

**File:** `tools/shell.js` · **Severity: critical.** Everything in the retrieval story is
downstream of this one.

### The defect

`shell_read`'s only sizing knob is **`maxBytes`** — a cap measured from **byte zero**. There is
**no `offset`, no line range**. So an agent can hold a perfect pointer — *"the bug is in
`tokenize.js:66-72`"*, which litectx `recall` **already returns** — and have **no way to act on
it**. Its only move is to swallow the whole file.

### Why it cannot be worked around downstream (and why that's correct)

There *is* one way to read lines 66-72 today: `sed -n '66,72p'` — which needs `shell_run`. And
bareloop **locks `run` on purpose**: a worker that can run commands can run its own close, and
the close is the arbiter (design law #1 — *the agent never authors its arbiter*). So the worker
is caught between a fence we **want** and a primitive we **never built**.

This is the routing rule at its cleanest: a **missing primitive → fix upstream.** It is
emphatically **not** an argument for admitting `run`.

### Evidence

The worker read `src/store.js` (117 KB) **nine times** and `src/index.js` (90 KB) three times —
**1.37 MB of source** through context, to fix a one-character bug in a 3.4 KB function. It was
not being stupid: **it was trying to page through a file with a tool that has no pager.** With
BA-1's caching wired it simply thrashes *longer* — the failing rep re-read the same 7 files
**42 of 49 reads (86%)**.

### The fix

Add a range to `shell_read`. **`startLine`/`endLine` is the better unit** for source (1-based,
inclusive) — it's what litectx indexes in, what stack traces speak, and what a model reasons
about. `offset`/`limit` in bytes is acceptable; lines are what the ecosystem actually uses.

- Return the requested range **only**, and report the file's true total length so the caller
  knows what it did *not* read.
- Out-of-range start → a named miss, never a silent whole-file read.
- Keep `maxBytes` working (additive, non-breaking).

### Acceptance criteria (must be able to fail)

1. `shell_read({path, startLine: 66, endLine: 72})` on a 117 KB file returns **only** those
   lines — assert the returned length is **orders of magnitude smaller** than the file.
2. **Negative control:** the same call without a range returns the whole file (today's
   behaviour, unchanged).
3. `startLine` past EOF → a named miss, **not** a full read (a silent fallback would rebuild
   the bug invisibly).
4. `endLine` past EOF clamps to EOF and says so.
5. Range + `maxBytes` together behave predictably and are documented.
6. Directory reads are unaffected.

---

# Order, and what unblocks what (updated 2026-07-14 — the retrieval track is RESOLVED)

```
BA-4 (shell_write zeroes files)  ──►  LAND FIRST. Data loss in shipped code; no gate can catch it.
                                       Small, self-contained, no design question to settle.
BA-1 (transcript caching)        ──►  independent; proven necessary; land whenever
BA-5 (halts discard text)        ──►  independent; unblocks the ratchet (supersedes BA-3)

resolved, no longer routed through:
  LC-2  withdrawn  (stale-index phantom — our error, not a defect)
  LC-1  closed     (litectx 0.29.1 get(range) shipped + consumed; snippet decline confirmed by trace)
  BA-2  withdrawn  (misfiled — the ranged read is litectx's get, which shipped)
  BA-3  superseded (by BA-5 — the discard is general, not the stop path)

checked and NOT filed (our errors — see UPSTREAM-ASKS.md):
  bareguard limits.maxTurns/maxToolRounds semantics · planner budget blindness (onLlmResult exists)
```

- **Three open handoffs, all to bare-agent, all independent of one another.** **BA-4 goes first**
  — it is the only one that is losing data today, and the fix is a four-line precondition.
- The old diagram routed bareloop's retrieval POC through LC-2 → LC-1 and BA-2. That path is
  gone: **the retrieval verbs landed (litectx 0.29.1, consumed as `ctx_recall`/`ctx_get`, F19)
  and were run.** Retrieval works exactly as designed — whole-file reads 41→11, re-reads 42→7 —
  **and moved the outcome zero** (still cap-halt, zero writes). The bottleneck was never the
  primitives: the close had never run (F20) and the loop has no ratchet (F21) — of which **BA-5
  is the library-side half.**

**Where bareloop stands:** control **0/2**, caching alone **1/2**, retrieval **0/1**,
bounded+retrieval **0/1**. The rung-exit stop stands; the next move is plan-v1 (PRD Addendum
v1.12), not another primitive.

**bareloop's own debt from the same run** — the planner-metering hole, the per-run cap that binds
only *between* steps (measured $1.21 against a $1.00 cap), keyword-inferred per-step tools, and
the **N2-exit blocker** that BA-4 is live in bareloop's write path — is tracked under *"OUR
SIDE"* in [`UPSTREAM-ASKS.md`](UPSTREAM-ASKS.md). It is **not** part of this handoff.
