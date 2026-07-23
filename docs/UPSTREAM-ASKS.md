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

> **Absorbed `UPSTREAM-FIXES.md` on 2026-07-15.** The handoff spec (per-implementer evidence +
> acceptance criteria, once a separate file) is folded in here — this is now the single upstream
> record. Every entry keeps its acceptance criteria inline; the resolution/scoreboard the handoff
> carried is folded into the closing section. `docs/UPSTREAM-FIXES.md` is deleted.

## Status at a glance (2026-07-15; updated 2026-07-22)

> **2026-07-22 update:** BA-16 (native `claude-mcp` tool mode) **delivered in
> `bare-agent@0.33.0`** and consumed (module 4d). One follow-up is now **OPEN — BA-17**: the
> native turn bound counts tool-calling turns and did not enforce at real-job scale, blocking
> the clipipe cross-surface battery (F48). Full entry at the end of the queue. The
> 2026-07-15 snapshot below stands for everything prior.

**The queue is EMPTY: BA-13 delivered in `bare-agent@0.29.0`** (same day it was filed) and
consumed by bareloop the same session (TOOL_MENU/TOOL_BY_VERB gain `edit`; F32). Everything
prior was already closed: `bare-agent@0.27.0` and `litectx 0.29.1` cleared the earlier queue.
Delivery **verified by reading the shipped source in `node_modules`** (versions confirmed:
`bare-agent 0.29.0`, `litectx 0.29.1`) and by executing the deterministic acceptance criteria
against the shipped tool — file/line cites below are the acceptance evidence, not a
changelog's word. Withdrawn/superseded entries stay in the record with their reason.

| Ask | Package | Status | Delivered in | Acceptance — how verified |
|---|---|---|---|---|
| **BA-13** `shell_edit` anchored edit verb | bare-agent | **DELIVERED** | 0.29.0 | Anchored exact-once replace with BA-4 param guards, atomic temp+rename (mode preserved, 0o600 window), anchor-miss/multi-match as refusal RESULTS naming the count, compact receipt (`tools/shell.js:134-231`). Criteria 2/3/4/6 executed against the shipped tool (all green); C5 pinned by bareloop's own gate test (audit line `{type:'edit'}` denied by writeScope); C7 by the full suite on 0.29.0. C1 (economy) measured live: 229 vs 12,887 output tokens (56.3×), both bounds pass — see the entry. Consumed: `TOOL_MENU`/`TOOL_BY_VERB` gain `edit`, persona carries the strategy (F32 session). |
| **BA-1** transcript caching | bare-agent | **DELIVERED** | 0.27.0 | `cacheMessages` opt-in rolls `cache_control` onto the last block (`provider-anthropic.js:102-111`). Shipped **opt-in, not default-on as asked** (it changes the wire format); bareloop wires `cacheMessages:true`. Source-verified. |
| **BA-3** stop() bogus error | bare-agent | **SUPERSEDED by BA-5** | — | Mechanism re-verified at 0.26.2; the fix ships as the BA-5 852 sub-case. |
| **BA-4** shell_write zeroes files | bare-agent | **DELIVERED** | 0.27.0 | `content` required-string guard, throws when absent/null/non-string; explicit `content:""` still empties; schema `required:['path','content']` (`tools/shell.js:107-126, :449`). All 4 criteria re-verified locally against the tarball (F27) + source-verified here. |
| **BA-5** halts discard text | bare-agent | **DELIVERED** | 0.27.0 | All five return paths preserve `lastText`; `stop()` returns `error:null` + text (`loop.js:466,694,771,900,974,1010`); negative control (halt before any text) still `''`. Source-verified. |
| **BA-6** truncation reads as finish | bare-agent | **DELIVERED** | 0.27.0 | `stopReason` on `GenerateResult` (`provider-anthropic.js:176`); `isTruncated`→`error:'truncated:max_tokens'` (`loop.js:762,771`); `end_turn`+zero-tools still a clean finish (`:791`). Source-verified incl. negative control. |
| **BA-7** thinking blocks dropped | bare-agent | **DELIVERED** | 0.27.0 | Opt-in `thinking`→`body.thinking` (`provider-anthropic.js:133`); `providerBlocks` preserve/replay thinking verbatim incl. `signature`, model-bound drop on mismatch (`:156,:245`). Source-verified. **Moved no outcome** (its own honesty note). |
| **BA-10** temperature drop | bare-agent | **DELIVERED** | 0.27.0 | `temperatureDropped` surfaced sticky across rounds (`loop.js:430-433`). Found by bare-agent's **own review**, not a bareloop ask. |
| **BA-12** identical-call spin | bare-agent | **DELIVERED** | 0.27.0 | `maxIdenticalToolErrors` spin guard, default 3 (`loop.js:53,261,446`). Found by bare-agent's **own review**. |
| **BA-2** ranged read | bare-agent | **WITHDRAWN — misfiled** | — | Ranged read was never `shell_read`'s job; it is litectx's `get(range)`, shipped 0.29.0 / consumed 0.29.1 (F19 `ctx_get`). |
| **LC-1** hit triage + chunk fetch | litectx | **DELIVERED (part 2); part 1 declined** | 0.29.0 (consumed 0.29.1) | `get(path,{startLine,endLine})` returns one chunk (`store.js:1322`, CHANGELOG 0.29.0). Snippet-on-hit **declined on measurement**; decline confirmed by F19 trace (0.2 fetches/recall — triage is not the bottleneck). |
| **LC-2** dropped docstrings | litectx | **WITHDRAWN — phantom** | — | Stale-index artefact from a global litectx 0.5.0 SessionStart hook; attachment was already fixed upstream. Local fix, not a defect. |
| **BG-1** secret redaction | bareguard | **WITHDRAWN — already exported** | — | `redact` already shipped; `src/interpret.js` consumes it directly (F5). No upstream change needed. |

Also **checked and NOT filed** (our errors, no ask): bareguard `limits.maxTurns`/`maxToolRounds`
semantics (documented in its own source — we misread it) and the planner's budget blindness
(`Planner` already takes `onLlmResult` — we never wired it). Both recorded below.

## DELIVERED in 0.29.0, same day (2026-07-15) — BA-13: bare-agent has no edit verb — changing one line costs a whole-file rewrite (an output-token tax ∝ file size, and the maximal broken-tree surface)

> **Delivery record (2026-07-15).** Shipped in `bare-agent@0.29.0` exactly per the semantics
> below, plus hardening the ask did not require: literal splice (never `String.replace`, so a
> `$` in `newText` cannot corrupt the edit), 0o600 temp before chmod-to-original-mode (no
> world-readable window), `wx` flag (a pre-planted symlink at the temp path fails instead of
> being followed). The anchor-miss/multi-match refusals return as tool RESULTS per the
> interview answer (refine-your-guess is worker feedback; throws stay BA-4 territory) — with
> the documented tradeoff that a byte-identical repeated wrong anchor does not feed the BA-12
> spin guard (bounded by maxTurns/budget instead). Acceptance: criteria 2/3/4 executed
> against the shipped tool 2026-07-15 (refusal wording, mtime/content untouched, all three
> param-guard throws, `newText:""` deletes); 6 verified in source (temp+rename+cleanup-on-throw)
> plus a live mode-preservation check; 5 pinned by bareloop's consumption test (gate audit line
> `{type:'edit'}`, denied by the same writeScope as write, zero bareguard changes); 7 by the
> full bareloop suite green on 0.29.0. **Criterion 1 (the economy claim), MEASURED on the real
> API 2026-07-15** (paired one-line-edit arms, same prompt/model/maxTokens, on the real
> 708-line `ingest.js`, sonnet): `shell_edit` arm **229 output tokens** ($0.0073, change
> landed, file intact); `shell_write` arm **12,887 output tokens** ($0.1855, change landed) —
> **both bounds pass (<500 / >8000), ratio 56.3×**. The write arm's single mutation round was
> 12,695 output tokens: the criterion's whole-file tax, observed directly. One honest note
> from the real battery spines: no ARCHIVED run contains a faithful whole-file rewrite (the
> landed "rewrites" were 150–1900-output-token stubs over 300–700-line files — the
> broken-tree mechanism was partial emission, the risk argument in different clothes).
> Consumed per the plan: `TOOL_MENU`/`TOOL_BY_VERB` gain `edit` (F32 session, suite 303/303).

**Package:** bare-agent (`tools/shell.js`). **Surfaced by:** battery pass 1 (bareloop F30) and
its rerun (F31, pending) — real sonnet runs against real planted bugs.

### The evidence

- The shipped mutation verbs are `shell_read / shell_grep / shell_write / shell_run / shell_exec`
  (`tools/shell.js:408-496`, source-read 2026-07-15). **`shell_write` is whole-file**: to change
  one line of an 800-line file the model must EMIT all 800 lines as tool-call JSON.
- **Battery pass 1 (F30):** with the provider's 4096-token output default, that emission cannot
  fit — the API cut the round, BA-6 (correctly) surfaced `truncated:max_tokens`, doctrine
  (correctly) classed it provider-red, and **3/3 rows died in infra**. Every component to spec;
  the run still dead. bareloop now passes `maxTokens: 32000` — that removes the *ceiling*, not
  the *cost*.
- **The cost that remains:** a one-line edit to `ingest.js` (~30KB) emits ~8–10k output tokens —
  output is the expensive token class, so the tax is ~100× what the edit itself needs (~50–100
  tokens), paid on EVERY revision of a big file.
- **The risk that remains:** a whole-file rewrite is the maximal broken-tree surface. Battery
  reruns P2/P3: a landed rewrite broke test files at load (`close judged 258 of a declared floor
  of 300`), the close crashed, the run escalated. An anchored edit can still write a bad line —
  but it cannot mangle the 790 lines it didn't touch.

### Why this is bare-agent's job (the BA-2 lesson: aim at the right package)

The READ side already split correctly: ranged read = litectx `get` (BA-2 was withdrawn for
exactly that confusion). The WRITE side has no ranged counterpart, and it cannot be litectx's —
litectx owns the index, not the tree mutation. Meanwhile **bareguard is already ahead of the
toolset**: its action vocabulary includes `edit` (`action.type ∈ {read,write,edit,bash}`,
quoted in `tools/shell.js:18`). The fence is ready; the tool was never built.

### The ask — `shell_edit`, anchored exact-string replace

```js
shell_edit({ path, oldText, newText })
```

Semantics — each clause is a lesson already paid for:

1. **Anchored, not line-numbered.** Models mangle line numbers; they quote text reliably (and
   litectx's `get` hands them exact text to quote). `oldText` must occur **exactly once**:
   zero matches → refuse `oldText not found in <path>`; two-plus → refuse naming the count
   (`oldText occurs 3× — widen the anchor`). **The refusal string teaches the retry** (same
   doctrine as `ctx_get`'s stale-pointer message; same class as BA-12's spin guard needing
   distinguishable errors).
2. **BA-4 param guards.** `oldText` required non-empty string; `newText` required string —
   absent params THROW at the tool boundary, never default. Explicit `newText: ""` is a legal
   deletion; absent `newText` is not. (BA-4 was `shell_write` zeroing files on a missing param —
   same class, guarded from birth this time.)
3. **Atomic.** Read → patch in memory → write whole from the patched buffer, or not at all. A
   throw mid-operation leaves the old file intact, never a partial. (0.27.0 already discards
   `toolCalls` on truncated rounds — a test should pin that `shell_edit` stays covered by that
   invariant.)
4. **Gate action `{type: 'edit', path}`** — flows through `wireGate`/actionTranslator exactly
   like `write`; bareguard needs **zero changes** (the vocabulary exists). Consumers that fence
   `write` should get `edit` fenced by the same writeScope with no extra config.
5. **Compact receipt, no echo.** Return `edited <path>: 1 replacement (-1/+1 lines)` — never the
   file body (a body echo rebuilds the context bloat litectx's pointer design exists to prevent).
6. **Same fs discipline as `shell_write`**: utf8, same path resolution/containment, same
   error surfaces.

### Acceptance criteria (all FAIL-able)

1. **The economy claim, measured not asserted:** one-line edit on an 800-line file completes in
   a round whose OUTPUT tokens are **< 500** (whole-file `shell_write` baseline on the same
   file: > 8,000). Measure both on the real API.
2. `oldText` not present → refusal returned as a tool RESULT (loop continues; not a throw, not
   a crash), file mtime unchanged.
3. `oldText` present twice → refusal **names the count**; no write occurs.
4. Missing/empty `oldText`, or missing `newText` → throws (BA-4 class); explicit `newText: ""`
   deletes the anchored text.
5. Path outside the consumer's writeScope → denied by the gate with an audit line carrying
   `{type:'edit', path}` — proven with bareguard as shipped, no bareguard change.
6. Atomicity under injected fs failure: the file afterward is byte-identical to either the old
   or the fully-patched content — never partial.
7. **Negative control:** `shell_write` behavior byte-identical before/after the change; a
   consumer granting only `write` sees no new tool.

### bareloop-side consumption plan (recorded now, executed on version bump)

`TOOL_BY_VERB` gains `edit → shell_edit` (`src/interpret.js`); `toolAction` maps it to
`{type:'edit', path}`; job specs may then grant `"edit"` (operator territory, as ever — the
agent never widens its own menu). The battery becomes the validation bed: criterion 1 gets
measured on P5/P7's `ingest.js` edits, and the P2/P3 broken-tree class gets a direct
before/after comparison across battery passes.

**Priority: economy + risk, not blocker.** With `maxTokens: 32000` the truncation deaths are
gone (battery rerun: P1/P2 green). BA-13 cuts the per-edit output tax ~100× and shrinks the
broken-tree surface — it makes the loop *cheaper and safer*, not merely possible.

---

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

> **Handoff detail folded in (2026-07-15).** The implementer-facing evidence, exact change, and
> fail-able acceptance criteria that once lived in a separate `UPSTREAM-FIXES.md` are now inline
> on each entry below. Withdrawn/closed/superseded entries stay legible here — a misfiled ask is
> itself a finding.

## CLOSED (2026-07-15) — bare-agent 0.27.0 shipped the ENTIRE open queue (BA-1/3/4/5/6/7 + BA-10/12)

**One release closed every open ask below.** `bare-agent@0.27.0` ("Provider Fidelity & Honest
Termination", commit `7372fb1`, published to the registry) landed BA-4, BA-5, BA-3, BA-6, BA-7,
BA-1, plus BA-12/BA-10 found by its own review. bareloop now consumes it (`bare-agent: ^0.27.0`,
`package.json`). The per-ask entries below are kept OPEN-labelled for their evidence and acceptance
criteria — read each with this banner: **status is CLOSED, verified as noted.**

- **BA-4 (the N2 gate) — VERIFIED LOCALLY against the published tarball**, not taken on the
  changelog's word. All four acceptance criteria pass through bareloop's own `node_modules` copy:
  omit-`content` throws + file byte-identical; `content:null` throws + intact; `content:""` still
  empties deliberately; non-string throws + intact. **The N2 rung's hard blocker is cleared** — a
  write-granting tool mode can ship honestly.
- **BA-6 / BA-3 / BA-5 — consumed in `src/interpret.js`** (this session): a `truncated:max_tokens`
  round now escalates as **provider-red** (retry, the F11 transport class), never a scored empty
  attempt or a masquerading `interpreter-red`; `loop.stop()`'s new `error:null`+text contract let
  the `stoppedByBound` shim be **deleted** (it was dead and latently able to swallow a genuine halt);
  the `interpret.js:289` comment (OUR-SIDE §5 doc debt) is now true and corrected. New regression
  test (mutation-checked) covers the truncation path.
- **BA-1 — consumed:** `loop.run(..., { cacheMessages: true })` is wired in `ask()`, the transcript
  cache the job #1 cost wall (F18) needed; provider-routed and safe (bareloop wires no trim fold).
- **BA-7 (thinking blocks) / BA-10 (temperature) / BA-12 (identical-call spin)** — shipped upstream;
  no bareloop consumption needed (BA-7 moved no outcome, per its own honesty note).

Full suite green on 0.27.0 (280/280, typecheck clean). *(Entries below retained verbatim.)*

## OPEN (2026-07-14) — BA-6: a silently TRUNCATED round is indistinguishable from a completed one

**Package:** bare-agent (`src/provider-anthropic.js`, `src/loop.js`) · **Severity: CRITICAL — a
round the API cut off mid-thought is handed to the caller as the model's FINAL ANSWER, with
`error: null`.**

**What's broken — four facts, verified at 0.26.2, innocuous alone and a bug together.**

1. **`max_tokens` defaults to 4096** — `provider-anthropic.js:82`:
   ```js
   max_tokens: options.maxTokens || 4096,
   ```
2. **`stop_reason` is NEVER read.** `grep -rn "stop_reason" src/` → **zero hits**. Not parsed, not
   on `GenerateResult`, not reachable by any caller.
3. **The response parse keeps only `text` and `tool_use`** — `provider-anthropic.js:105-113`. Every
   other block type (including `thinking`) is silently dropped.
4. **Loop treats "no tool calls" as the model's FINAL ANSWER** — `loop.js:670`, whose own comment
   says exactly that:
   ```js
   // No tool calls — LLM gave a final text response
   if (!result.toolCalls || result.toolCalls.length === 0) {   // → clean return at 684, error: null
   ```

**The mechanism.** `claude-sonnet-5` runs **adaptive thinking by DEFAULT** when `thinking` is
omitted from the request — which bare-agent **always** omits (that is BA-7). On a hard prompt the
model thinks **past `max_tokens`** and the API returns `content: [thinking]` — **no text block, no
tool_use block** — with **`stop_reason: 'max_tokens'`**. bare-agent drops the thinking block (3) and
never reads the stop reason (2), so `generate()` yields **`{text: '', toolCalls: []}`**, which Loop
reads as *"the model gave its final answer"* (4) and returns as a **clean finish with `error:
null`**. **A truncation is laundered into a completion.** The attempt ends tidily and contains
nothing.

**Measured (probe against the real API, bare-agent's own body shape):**

| `max_tokens` | `stop_reason` | output tokens | content blocks | text bare-agent yields |
|---|---|---|---|---|
| 1024 | `max_tokens` | 1024 | `[thinking]` | **0 B** |
| **4096 (the default)** | `max_tokens` | 4096 | `[thinking]` | **0 B** |

The default is not a safe harbour — it is the second row.

**Why it matters to adopters.** Any consumer running a **reasoning model** on a non-trivial task can
have a round **silently truncated and reported as a completed turn** — no error, no warning, no
field to detect it by. In bareloop this is, in the logs, **indistinguishable from "the worker chose
to stop without writing a fix"** — the exact outcome we have spent a week diagnosing. It may have
**corrupted an unknown fraction of our prior experimental arms** (`docs/FINDINGS.md` **F25**).

**The fix.** Surface **`stop_reason`** on `GenerateResult`. A round that stopped on **`max_tokens`
with zero tool calls** must **NOT** be treated as a finished turn — it must surface as an **error**
(or an explicit continuation), never a silent completion. Raising the default `max_tokens` for
reasoning models is worth considering, but it is **not** the fix: it moves the cliff, it does not add
the signal. **The load-bearing change is reading `stop_reason`.**

**Acceptance criteria (must be able to fail).**

1. `GenerateResult` carries **`stopReason`** (or equivalent) reflecting the API's `stop_reason`.
2. A Loop round whose response has **`stop_reason: 'max_tokens'` and zero tool calls** does **NOT**
   return as a clean finish with `error: null` — it surfaces as an **error** or a **continuation**.
3. **Negative control:** a round that genuinely ends with **`stop_reason: 'end_turn'` and zero tool
   calls STILL returns as a clean finish** — so the suite distinguishes *truncated* from *finished*,
   and a fix that errors on every zero-tool-call round (breaking every consumer's happy path) fails.
4. **All three must FAIL against 0.26.2.**

## OPEN (2026-07-14) — BA-7: thinking blocks are neither requested nor preserved

**Package:** bare-agent (`src/provider-anthropic.js`, `src/loop.js`) · **Severity: HIGH —
correctness and protocol conformance. NOT performance.**

> **HONESTY NOTE — read before prioritising. We measured this end-to-end and it moved NO outcome.**
> A **raw-SDK harness** with `thinking` **explicitly enabled** and **every block round-tripped
> correctly** (n=2), against **stock bare-agent** (n=2), on the **same model, task and tools**,
> produced **indistinguishable** results: same wrong hypothesis, same files, **zero writes**, in
> both arms. **Fixing this changed nothing we could measure.** It is filed as a **correctness /
> protocol defect** — bare-agent silently violates Anthropic's stated contract and silently loses
> data the API sent it. **We claim NO performance or capability benefit, and we cannot demonstrate
> one.** Do not let anyone — including us — sell it as a fix for agent quality.

**What's broken.** Verified at **0.26.2**. Four holes, no path through any of them:

1. **The request never asks for thinking.** The body built at `provider-anthropic.js:79-93` has **no
   `thinking` key**, and no option can put one there. `grep -rn "thinking" src/` returns **only an
   unrelated Gemini comment** (`provider-gemini.js:148`).
2. **The response discards thinking blocks.** `provider-anthropic.js:105-113` keeps **only** `text`
   and `tool_use`.
3. **The transcript has nowhere to put one.** `loop.js:688-696` rebuilds the assistant turn pushed
   into `msgs` from **`text` + `tool_calls` only** — the OpenAI-shaped `Message` type has **no field
   that COULD carry a thinking block**.
4. **The re-serialiser could not emit one anyway.** `_toAnthropicMessage()`
   (`provider-anthropic.js:142-172`; assistant branch **155-170**) rebuilds an assistant message as
   `text` + `tool_use` blocks. **No path exists** by which a thinking block reaches the next request.

**Confirmed empirically.** POSTing **bare-agent's exact body shape** (no `thinking` param, tools
present, real system + task) returns `stop: tool_use`, `blocks: ["thinking","tool_use"]`,
`thinking_tokens: 13`. **bare-agent retains only `["tool_use"]`** — the block was sent to it, and it
dropped it.

**Why it's a defect.** `claude-sonnet-5` (and Opus 4.7+) run **adaptive thinking by DEFAULT** when
`thinking` is omitted — so bare-agent is receiving thinking blocks **today, every round, on these
models, without asking for them**. Anthropic's contract is that thinking blocks are **echoed back
unchanged, `signature` included**, when continuing an extended-thinking tool-use conversation on the
same model. bare-agent **cannot** do this — it has nowhere to put them. **The loss is SILENT: no
400, no warning.** A library that quietly drops protocol-significant data the API sent it is broken
**regardless** of whether the drop is currently costing accuracy — which, per the honesty note, we
could not show it is.

**The fix.** **(a)** Preserve `thinking` blocks **verbatim — including `signature`** — in the
assistant turn replayed to the API (this needs a transcript field that can hold provider-native
blocks; the OpenAI-shaped `Message` cannot express one today, and that is the real work).
**(b)** Expose an **opt-in `thinking` option** that reaches `body.thinking`.

**Acceptance criteria (must be able to fail).**

1. On `claude-sonnet-5` **with tools**, round **N+1**'s request body contains — inside round N's
   assistant turn — the **byte-identical `thinking` block objects** from round N's response,
   **`signature` included**. Assert on the **serialised body**: the bug is that nothing reaches the
   wire.
2. An opt-in **`thinking: {type: 'adaptive'}`** (or the API's current shape) reaches
   **`body.thinking`**.
3. **Negative control:** with thinking disabled/absent on a model that does not think, the request
   body is **byte-identical to today's** — backward compatible, and the test provably reads the flag
   rather than the weather.
4. **1 and 2 must FAIL against 0.26.2.**

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

**Independently RECONFIRMED live (2026-07-14, the isolation study).** A separate harness, not looking
for this, rediscovered the **852 path** from scratch: `loop.stop()` returned the false
`"[Loop] hit internal safety limit of 100 rounds"` error with **empty text**, observed at **12 and 16
rounds** — reporting a 100-round limit that **never happened**. Same defect, same line, found twice by
two independent harnesses. No change to the ask; the evidence is doubled. *(bareloop's own doc debt
from the same mechanism — a comment that asserts the opposite of what `stop()` returns — is recorded
under "OUR SIDE" §5, not as an upstream ask.)*

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

**5. A comment in `src/interpret.js` asserts the OPPOSITE of what `loop.stop()` actually does.**
`src/interpret.js:289` still says:

> *"`loop.stop()` breaks at the round boundary and **returns the transcript with NO error**, so the
> attempt ends cleanly…"*

**That is FALSE**, and BA-3/BA-5 are the proof: `stop()` falls through to the `HARD_ROUND_LIMIT`
return (`loop.js:852`), which yields `text: ''` carrying the internal-safety-limit **warning** as its
`error`. bareloop survives **only** by special-casing that error string behind the `stoppedByBound`
flag (`src/interpret.js:298`, `:412`) — and the comment 100 lines further down (`:404-411`) describes
the real behaviour **correctly**. The code is right; one comment is a lie. **bareloop's doc debt, not
an upstream ask** — recorded here because a stale comment that contradicts a filed upstream defect is
exactly how a phantom gets re-filed. Fix: correct `:289` to say what `:404-411` already says.

**6. The isolation study EXONERATED bare-agent on the AIM axis — and KILLED two more of our own
suspects.** Recorded because this repo has filed **two phantom asks** (BA-2 misfiled, LC-2 a
stale-index artefact): the suspects we *kill* belong in the record as much as the ones we file.

- **bare-agent is not why the worker aims wrong.** RAW-SDK-with-thinking (every block round-tripped
  correctly) vs **stock bare-agent**, same model/task/tools, **n=2 each: indistinguishable** — same
  wrong hypothesis, same files, zero writes. And a **no-harness single-message probe** shows the
  model **does not nominate the cause file even with everything in front of it**. The aim problem is
  **not in the library.** *(This is BA-7's honesty note, pointed at ourselves.)*
- **S3 — "the summarizer/compaction fold is eating the signal": KILLED. Not a defect.** bareloop
  **wires neither compaction seam** — there is no fold, so there is nothing to eat the signal.
- **S4 — "tool results are mangled in the replayed history": KILLED. Not a defect.** Tool results
  are **replayed verbatim.**

**Instrument ≠ product** (stated so a future reader does not read an inconsistency): the
POC/scratch harness **does** guard `content` and **does** carry a shrink-blocker rail. That is an
**instrument**, not shipped code — it never ships, and without it the worker destroys the patient
and every experimental arm is unreadable. *"Never a local shim" binds shipped `src/`, not the
experimental bench.*

**7. Symlink write-through — the fence's caller contract is OURS to honor, and `toolAction`
doesn't.** (Surfaced by the 2026-07-19 release security review.) bareguard `fs.js` *documents*
its boundary: *"this resolves lexical traversal only — it does NOT follow symlinks … callers
needing symlink-proofing must canonicalise before the gate."* Documented contract on the caller →
two-red routing says **our side, not an ask**. The vector is narrow and latent: no granted verb
can CREATE a symlink (`write`/`edit` produce regular files), so it needs a **pre-existing**
symlink inside the patient's writeScope pointing outside the fence — a `shell_write` to that path
passes lexical containment and writes through to the real target outside. No current patient
ships one; no shipped run was exposed. Fix shape (**the fence is the arbiter's — PARKED for
hamr's explicit go**): canonicalise in `toolAction` before `gate.check` — realpath the deepest
*existing* ancestor of the target (the file itself may not exist yet on a write) and re-run
containment on the canonical path.

---

## BA-14 — `EPIPE` is not in `DEFAULT_RETRY_ON`, and the provider's pooled socket goes stale across multi-minute idle gaps (2026-07-16, job #3 battery)

**Symptom, observed 2/2 times it could occur:** in a battery process that makes provider
calls, then sits idle through a ~2.5-minute close, the NEXT provider call dies with
`write EPIPE` — terminal, routed `provider-red`. Pattern across three launches: every
plant whose draft call was the process's FIRST provider call succeeded (A1, A2, A3);
every draft that followed an earlier plant's calls plus a multi-minute idle gap EPIPE'd
(A3 in launch 2, A4 in launch 3). mailproof never hit this: its close runs ~25s, under
the keep-alive window. The mechanism is a stale pooled keep-alive connection: the server
closed it during the idle close; the client wrote the next request into the dead socket.

**Source read before filing (the BA-2 lesson):**
- `retry.js` `DEFAULT_RETRY_ON` retries `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND` — but not
  `EPIPE`. An EPIPE on a kept-alive socket is the SAME transient class as ECONNRESET
  (the kernel raced our write against the server's FIN); it differs only in which
  syscall surfaced first.
- `loop.js:702` applies retry only when the caller passes `options.retry` (opt-in, fine)
  — but even a wired `Retry` would not retry this failure because of the predicate gap.

**Ask (FAIL-able):** add `EPIPE` to `DEFAULT_RETRY_ON`'s transient codes. Acceptance: a
test that makes `generate()`'s underlying transport throw `{code: 'EPIPE'}` once and
succeed on the second attempt must return the success under a wired `Retry`, and must
rethrow under `retryOn: () => false`. (A fresh-connection retry after EPIPE cannot
double-bill: the request died on WRITE — it never reached the API.)

**Not asked (recorded):** connection-pool keep-alive tuning (agent timeouts) — that is
SDK/undici territory and version-fragile; the retry predicate is the durable fix.

**bareloop's own side:** the drafting path calls `generate()` bare (no `Retry`), so a
transport blip at draft is a full `provider-red` stop. Correct per doctrine (the
escalation's own option — "retry the run" — recovered both cases at $0 lost, the failed
write never reached the API), but once BA-14 lands, wiring a small `Retry` into the
draft call is worth revisiting.

## BA-16 — CLIPipe tool mode should offer a NATIVE path (`claude -p --mcp-config`) beside the envelope emulation (2026-07-21, Layer 2 POC firing 1 / F45)

> **DELIVERED in `bare-agent@0.33.0`** (`toolProtocol:'claude-mcp'`), consumed in bareloop
> module 4d (native clipipe worker surface, commit `2c81b57`). Criteria 1/2/3/5 verified by
> the live 4d smoke. **Criterion 4 (advertised bound == enforced bound) held in the trivial
> smoke but FAILED at real-job scale** — the native `--max-turns` bound counts tool-calling
> turns and did not stop an 8-turn scout at 8. That failure is the follow-up **BA-17 below**.

**Symptom, measured (F45):** the 0.32.0 envelope emulation carries a gated worker
mechanically (smoke: green end-to-end) but is the wrong instrument for real jobs on two
axes at once:
1. **Cost** — each turn re-spawns the CLI and re-sends the whole rendered transcript:
   **$0.25–0.55/round notional** on a real ~40-round job transcript (8–16× the API's
   measured ~$0.033/round), because every turn pays fresh `cache_creation` on the full
   prefix.
2. **Behavior (suggestive, n=2, explicitly unminted)** — on a spec byte-identical to one
   that produced 3/4 acting rows over the native API (F39), both completed emulation rows
   quit after ~5–8 reads with zero writes. A model filling a JSON questionnaire with
   `final_answer` one field away is a different animal from one flying native tool_use;
   0.32.0's own notes document the surface-sensitivity in the weak-model direction.

**The native path exists and was probed live before filing (the BA-2/withdrawn-ask rule;
~$0.20 notional, artifacts in bareloop scratch `mcp-probe/`):** a minimal stdio MCP server
(vanilla node, newline-delimited JSON-RPC) + `claude -p --mcp-config <cfg> --tools ''
--strict-mcp-config --setting-sources '' --allowedTools 'mcp__probe__*'`:
- **A. Native tool_use reaches the caller's handler:** unknowable-info question, one
  `tools/call` in the server log, answer carries the server's value. 2 turns, $0.067.
- **B1. `run` stays structurally absent:** asked to shell out, model answers
  CANNOT-RUN-SHELL and lists exactly the three granted MCP tools; server log empty.
- **B2. Gate-in-handler works:** an out-of-scope `write_file` returned a DENIED tool
  result (file provably never created), the in-scope retry landed — the caller's fence
  (bareguard, in bareloop's case) rides inside the tool handler, denial-as-result.
- **C. Bounds:** `--max-turns 2` stopped a 3-call task after 2 calls with the NAMED stop
  `subtype: error_max_turns` — never a silent success.
- **D. Metering + the cost mechanism:** `--output-format stream-json --verbose` exposes
  per-assistant-message usage (all four cache tiers); an 8-tool-turn session ran at
  **$0.0074/turn** with `cache_creation` ~140–200 tokens/turn after turn 1 — the
  session-incremental caching the emulation structurally cannot have.

**Ask (FAIL-able):** a second CLIPipe tool mode — e.g. `toolProtocol: 'claude-mcp'` —
where the provider (or a sibling adapter) runs ONE CLI session per attempt, exposes the
caller's `tools` to it as an MCP stdio server whose handlers call back into the caller,
strips everything else (`--tools '' --strict-mcp-config`), maps `--max-turns` to the
caller's turn bound, and parses stream-json into per-turn usage/cost. Acceptance, each
independently falsifiable on a live subscription session:
1. A Loop-mounted tool called through the native path executes the CALLER's handler
   (assert on the handler's own side effect, not the model's claim).
2. A denied handler result reaches the model as a tool result and the loop continues
   (no crash, no silent drop).
3. With tools stripped, a shell-out request produces no execution (assert no side
   effect, not just refusal prose).
4. The advertised turn bound and the enforced bound are the same number, and the bound
   stop is a distinct named stop reason, never a clean empty success (the BA-6 class).
5. Per-turn usage including cache tiers lands on the per-round result the caller meters
   (F12/F18: a cost instrument must see cache tiers), and a multi-turn session's
   per-turn cost is measured — not asserted — against the same job shape on the
   emulation path.

**Not asked (recorded):** retiring the envelope emulation — it stays the right tool for
CLIs with no MCP support (the seam 0.32.0 built is exactly where a sibling adapter
slots); and MCP-over-network/HTTP — stdio is sufficient and keeps the fence local.

**bareloop's own side:** loop-ownership semantics shift on the native path (the CLI owns
the inner cycle; bareloop's shell keeps the money cap, per-attempt bound via
`--max-turns`, the gate inside tool handlers, and the close — the arbiter split is
unchanged). bareloop consumes this behind its existing caller-supplied `provider` seam;
no library change expected beyond the provider construction.

## BA-17 — native (`claude-mcp`) `onTurn` fired once per content BLOCK, inflating a caller's turn and token counters ~4–5× (2026-07-22, Layer 2 clipipe cross-surface battery / F48)

> **DELIVERED in `bare-agent@0.33.1`** (commit `bbeba7d`, consumed here 2026-07-23; source-
> verified: adjacent-run `message.id` dedup at `provider-clipipe-mcp.js:330-420`; +34 tests,
> 19 mutations red both directions; bareloop suite 517/517 green on 0.33.1). **The real
> mechanism — and the correction of this ask's own diagnosis:** the claude CLI emits a
> separate `assistant` stream event **per content block**, each repeating the message's
> `usage`. `createSessionStream` fired one `onTurn` per event, so a caller counting LLM turns
> saw **35 events for 8 real turns** (4.4×) and summed the same usage per block (**5.04×**
> token inflation). Our gate net (16) was tripped at ~4 real turns by inflated ticks → on
> native that routed `humanChannel → terminate` → work discarded → the INERT battery.
>
> **Both defects this ask filed were measured FALSE on the wire** (bare-agent probed them
> directly — the BA-2 misfile pattern, owned): `--max-turns` **does enforce** (a 12-step task
> under `--max-turns 4` stopped at 4 with named `error_max_turns`) and **does count assistant
> turns** (12 tool-calls across 2 turns inside `--max-turns 3`). My "16 LLM turns / 26 reads /
> `--max-turns 8` never bound" reading was **counting the inflated per-block events** — a
> confounded instrument (the scout barely reached ~4 real turns before the inflated net killed
> it). Fix also reconciles the TOKEN axis (closing `kind:'session'` event carries the per-tier
> residual → a wired gate's tokens sum to the CLI's own total, live-verified 821) and lands
> BA-5-on-native (a bounded session returns the last turn's text, terminal `stopReason:
> 'max_turns'`). Acceptance re-smoke on our stack folded in below once green.

**Original ask as filed 2026-07-22 (diagnosis since corrected above — kept for the record):**

**Context.** BA-16's native mode (delivered 0.33.0, consumed module 4d) maps the caller's
`maxTurns` to the CLI's `--max-turns`. bare-agent's own record says that bound counts
**tool-calling turns** — `bareagent.context.md:77` ("cap total tool-calling **rounds**"),
`:437` ("`limits.maxTurns` ticks on every `gate.record` — LLM **+ tool**"), and BA-16
criteria C/D (`--max-turns 2` "stopped a 3-**call** task after 2 **calls**"; an
"8-**tool-turn** session"). That unit conflicts with a caller's attempt-bound semantics on
the Loop path, and at real-job scale the flag did not enforce at all.

**Symptom, measured (job #4 TESTGEN native scout, runid `mrwdtjpd`, gate audit
`l2clip-L1-mrwdtjpd-gate-audit.jsonl`).** The scout was built with `maxTurns: 8` →
`--max-turns 8` (bareloop driver forwards it correctly,
`scripts/run-battery-l2accept-clipipe.mjs:89`; `provider-clipipe-mcp.js:449` pushes the
flag). The session then:
- ran **16 LLM/assistant turns** and **26 read tool-calls** before any bound fired;
- **never emitted `error:'max_turns'`** — `--max-turns 8` did not stop it at 8 in ANY unit
  (not 8 tool-calls: 26 reads happened; not 8 assistant turns: 16 happened; 35 `onTurn`
  events total across the whole session);
- what finally stopped it was the CALLER's bareguard net at `maxTurns 16` (`limits.maxTurns`,
  reason `turns 16 >= max 16`) — an `askHuman` halt that on native routes to
  `humanChannel:{decision:'terminate'}`, **discarding the scout's work → INERT**. 6/6 rows,
  $0 graded, a blind-instrument battery.

So BA-16 criterion 4 held in the 3-call smoke and FAILED on a real read-heavy job — the
"smoke misses what a real run finds" class.

**Two coupled defects.**
1. **Enforcement** — `--max-turns N` on a native `claude-mcp` session does not stop the
   session at N when the task naturally exceeds N (real run overran 8 by ~2× before an
   external bound intervened). Root cause is bare-agent's to bisect (flag not honored under
   `-p`/`--strict-mcp-config` MCP mode? a claude-CLI turn unit a single `-p` prompt never
   increments?) — it owns the native seam.
2. **Unit** — even enforced, the bound counts **tool-calling turns**, but a caller's attempt
   bound is an **LLM/assistant-turn** count (bareloop F37: the caller records only
   `type:'llm'` to the gate, precisely so a read-heavy attempt is not guillotined by
   tool-call counting). `maxTurns: N` must mean the same unit on native as on the Loop path,
   or the two surfaces silently disagree.

**Ask (FAIL-able), each independently falsifiable on a live subscription `claude-mcp`
session:**
1. **Enforce at N.** A task that would naturally take ≥ 2N turns, given `maxTurns: N`, stops
   at N — asserted from the session's turn record, not the model's claim. (Today: N=8 → 16
   LLM / 26 tool-calls, unbounded.)
2. **Named stop, work preserved.** The stop surfaces as the distinct named `error:'max_turns'`
   (never a silent success, never a caller-side terminate), so the caller's graceful
   attempt-bounded path fires — bareloop already routes `r.error === 'max_turns'` this way
   (`planrun.js:307`), feeding `lastText` forward.
3. **LLM-turn unit.** A session that makes M tool-calls across N assistant turns (M ≫ N) is
   bounded at **N assistant/LLM turns**, not at the M-th tool-call — matching the Loop path
   where `maxTurns` ticks per LLM round. The provider already streams one `onTurn` per
   assistant turn (`bareagent.context.md:821`); counting THAT is the natural enforcement
   point, independent of the CLI flag's unit.
4. **Parity both surfaces.** With the same caller `maxTurns: N`, the native path and a Loop
   path bound at the same N — the advertised == enforced criterion (BA-16 #4), re-run on a
   non-trivial job, not a 3-call smoke.

**Not asked (recorded).** Removing `--max-turns` — if the provider counts LLM turns to a
named stop, the flag can stay as a coarse CLI-side backstop. And no change to the caller-side
gate net: bareloop's `maxTurns` backstop is correct as a loose LLM-turn net (it counts the
right unit — 16 LLM records ticked, the 26 tool-calls did not, per F37). The bug is that on
native it is currently the ONLY bound and it *terminates* rather than *bounds* — which this
ask fixes at the source by giving native a real named `max_turns`.

**bareloop's own side (interim, not shipped).** Until this lands the native cross-surface
battery is **PARKED**. F47 / the API acceptance is untouched (Loop path, `loop.stop()` in the
LLM-turn unit, byte-identical). No bareloop turn-bounding stopgap will be built
(turn-bounding "should be bareagent"); when the native named `max_turns` ships, bareloop
consumes it with zero code change beyond the version bump. Logged as **F48**.

*(BA-17 is the one open ask from this repo; BA-16 delivered, criterion 4 excepted.)*

---

## RESOLVED — order the queue landed in, and where bareloop stands (folded from UPSTREAM-FIXES.md, 2026-07-15)

The handoff spec carried a dependency diagram — *what unblocks what*. It is now history: **one
release closed it.** `bare-agent@0.27.0` shipped BA-4, BA-6, BA-1, BA-5, BA-7 (plus BA-10/BA-12
from its own review), and litectx 0.29.0/0.29.1 shipped the ranged read the retrieval track needed.

```
bare-agent 0.27.0 ── BA-4  shell_write rejects absent/null/non-string content   [was the N2-exit blocker]
                  ├─ BA-6  reads stop_reason; a truncated round no longer reads as a clean finish
                  ├─ BA-1  cacheMessages breakpoint (opt-in); bareloop wires it true
                  ├─ BA-5  all four discard paths preserve text; stop() → error:null   (supersedes BA-3)
                  └─ BA-7  thinking blocks preserved + replayed (opt-in request); moved no outcome

litectx 0.29.0/0.29.1 ── get(path,{startLine,endLine}) — one chunk, hash-gated   (closed LC-1 pt2 / withdrawn BA-2)

withdrawn/not-a-defect: LC-2 (stale-index phantom) · bareguard limits semantics · planner budget hook (ours)
```

- **BA-4 was the hard N2-exit blocker; it is cleared.** The rung STOPPED on bare-agent by design
  (build-ladder discipline, hamr 2026-07-14 — *no local shim even for a safety bug*); the stop was
  the result, and 0.27.0 is what lifts it. F27 records the version consumed + acceptance re-verified.
- **BA-7 landed last and by its own honesty note moved no outcome** — filed as protocol/correctness,
  not a capability fix.

**Where bareloop stood when the primitives landed** (the scoreboard the handoff carried, kept for
the record): control **0/2**, caching alone **1/2**, retrieval **0/1**, bounded+retrieval **0/1**.
The retrieval verbs landed and were run — whole-file reads 41→11, re-reads 42→7 — and **moved the
outcome zero** (still cap-halt, zero writes). The bottleneck was never the primitives: the close had
never run (F20) and the loop has no ratchet (F21), of which **BA-5 is the library-side half**. The
next move is plan-v1 (PRD Addendum v1.12), **not** another primitive. bareloop's own-side debt from
the same run is tracked under *"OUR SIDE"* above.
