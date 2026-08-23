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

> **2026-08-09 update, CLOSED 2026-08-13: BA-20 (bare-agent) DELIVERED in `bare-agent@0.36.0`,
> consumed here at 0.36.1.** bareloop's N4 (soft-green) rung needs a productized *decisive
> judge*; the design was measured and the code was a POC in bareguard's research corpus, owned
> by no shippable package — it landed in **bare-agent**, where every LLM call in the suite
> already lives (bareguard's own locked design forbids it calling one). The delivery ships
> `src/judge.js`, `src/judge-calibration.js` and `src/bareguard-adapter.js`, all exported from
> the package entry — source-verified against the shipped tarball, not taken on a changelog's
> word. **bareloop's consumption this cycle is the dependency bump ONLY:** the consumer of
> `judge`/`calibrate`/`judgeToAnnotation` is the N4 rung, which does not exist yet, so wiring
> the judge into a `judged` close stage and **executing BA-20's acceptance criteria live**
> (running `calibrate` against the frozen floor, naming the hash it graded) are **deferred to
> N4's opening** — stated plainly, not papered over. *Recorded, not rewritten: this was first
> filed the same day as `BJ-1`, recommending a new `barejudge` package, and re-aimed at
> bare-agent the same day on hamr's ruling.* Full entry at the end of the queue.

> **2026-07-31 update:** **LC-5 (litectx) DELIVERED in `litectx@0.32.0`, same day** —
> option (a) of the ask: `impact()` now throws a named `RipgrepMissingError`
> (`.code = "RIPGREP_MISSING"`, exported) when `rg` never ran, instead of reading
> "0 callers, risk low". Source-verified and live-probed; consumed here by version bump
> (`^0.32.0`, 590/590). Full entry with acceptance evidence at the end of the queue.

> **2026-08-22 update — the queue is OPEN again: BA-21 (bare-agent) FILED.** `COST_PER_1K`
> (`src/loop.js:82`, header comment "Last updated: 2026-06-22") carries no row for the Claude 5
> generation — no `claude-sonnet-5`, no `claude-opus-5` — so bareloop's own worker model prices
> through `_default` at `src/loop.js:154`, and because that number is finite it is stamped
> `pricing: 'priced'` (`:621`, `:800`) with nothing on the wire saying the rate was a guess. The
> ask is three parts: **(a)** current-generation rate rows, **(b)** — the load-bearing one — a
> NEW field beside an unchanged `pricing` marking a fallback-table price as estimated (a third
> `pricing` VALUE would be a silent breaking change for consumers that halt on not-`priced`), and
> **(c)** a caller-supplied rate override. Measured over bareloop's own archive (7,507 rounds), `_default` reads 5.7% under
> sonnet-5's introductory rate; against list rate the same corpus would read 1.586x under, and
> the introductory rate **expires 2026-09-01**. Full entry at the end of the queue. The
> statement below ("the queue is EMPTY") is the 2026-07-15 snapshot and stands as written.

> **2026-08-23 update — a second open ask: BA-22 (bare-agent) FILED, a follow-on to BA-21.**
> BA-21's `rateSource` field (parts a/b) is unpublished — the maintainer reports it landed in a
> local checkout at `bare-agent@0.37.0`/`0.38.0`, neither on npm as of this filing. Even once it
> ships, it will not by itself cover native CLIPipe's session-close cost event: that event
> (`kind:'session'`, `provider-clipipe.js:364-375`) prices off the CLI's own reported total
> (`meta.costUsd`, never a local rate table) rather than through the Loop's table-priced
> `estimateCost` path that `rateSource` was built for, so it needs its own stamp. The gap is
> traced to one file only — `provider-clipipe.js`, not `provider-clipipe-mcp.js`, which emits
> only the (already-correct, already-unpriced) per-turn event. Filed forward against unpublished
> work, said plainly; severity LOW. Full entry at the end of the queue.

**The queue is EMPTY: BA-13 delivered in `bare-agent@0.29.0`** (same day it was filed) and
consumed by bareloop the same session (TOOL_MENU/TOOL_BY_VERB gain `edit`; F32). Everything
prior was already closed: `bare-agent@0.27.0` and `litectx 0.29.1` cleared the earlier queue.
Delivery **verified by reading the shipped source in `node_modules`** (versions confirmed:
`bare-agent 0.29.0`, `litectx 0.29.1`) and by executing the deterministic acceptance criteria
against the shipped tool — file/line cites below are the acceptance evidence, not a
changelog's word. Withdrawn/superseded entries stay in the record with their reason.

| Ask | Package | Status | Delivered in | Acceptance — how verified |
|---|---|---|---|---|
| **BA-22** native session-close cost has no `rateSource` | bare-agent | **OPEN / FILED** | — | Filed 2026-08-23 as a follow-on to BA-21, against unpublished work: `rateSource` (BA-21 part b) is reported to have landed in the maintainer's local checkout at `0.37.0`/`0.38.0`, neither on npm; only the 0.36.1 baseline (field absent entirely, verified by grep) was read directly. Native tool mode's session-close event (`kind:'session'`, single emit site `provider-clipipe.js:364-375`) prices off the CLI's own `total_cost_usd` (`:351`, via `mapClaudeMeta`, doc'd at `:21` as "a real price with NO local rate table") — a code path that never touches the Loop's table-priced `estimateCost`, so BA-21's fix does not automatically cover it. The per-turn event (`kind:'turn'`, `provider-clipipe-mcp.js:459-467`, `costUsd:null`/`pricing:'unpriced'`) is already correct and explicitly out of scope. Ask: stamp `rateSource:'provider'` on the session-close event whenever `costUsd` is finite. Fidelity gap only — no number is wrong, no run is at risk; LOW severity, on the already-deprecated (F48) `clipipe-subscription` fallback surface. Full entry at the end of the queue. |
| **BA-21** Claude 5 rates missing + a guessed price is indistinguishable from a real one | bare-agent | **OPEN / FILED** | — | Filed 2026-08-22 against shipped `bare-agent@0.36.1`, source-read not changelog-read: `COST_PER_1K` (`src/loop.js:82`) has no Claude 5 row (its Anthropic block stops at `claude-fable-5` / `claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5` plus two 2025 snapshots; header comment `Last updated: 2026-06-22`), so an unknown model falls to `_default = {in:0.002,out:0.008}` at `src/loop.js:154` and — the number being finite — is stamped `pricing:'priced'` at `:800` (turn) and `:621` (summarize), with no signal anywhere that the rate was a guess. Three parts, ranked: **(a)** add the Claude 5 rows; **(b)** the load-bearing one — a NEW field (`estimated:true` / `rateSource`) forwarded beside `costUsd` whenever the price came from `_default`, with `pricing` keeping its exact two values: a third `pricing` VALUE would be a SILENT BREAKING CHANGE, since consumers written against the two-value contract treat not-`priced` as unpriced and can halt on it (bareloop's own `pricing-red`), turning an honesty upgrade into a spurious budget halt. A SIGNAL never a refusal (hamr's ruling: *"...we use guesstimate and run but keep user in the know, never refuse"*; F6 extended one notch — F6 killed the silent ZERO, `estimated` kills the silent GUESS); **(c)** a caller-supplied rate override, ranked third because the `resolveRoundCost` provider-`costUsd` seam (`src/loop.js:183-186`) already covers most of it. Scale, measured over bareloop's archive (7,507 rounds, sonnet-5): `_default` $219.15 vs intro-rate $231.72 (**5.7% under**); vs list rate $347.58 (**1.586x under** — a PROSPECTIVE projection, not an observed error). Clock: sonnet-5's introductory rate ends **2026-09-01**. No supported local escape via the rate table (verified twice, separate days): neither `COST_PER_1K` nor `estimateCost` is on the entry's exports, and `require('bare-agent/src/loop')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` (no `./src/loop` subpath in `exports`). Full entry at the end of the queue. |
| **BA-20** productized decisive judge + calibration harness | bare-agent | **DELIVERED** | 0.36.0 (consumed 0.36.1) | Three modules source-verified against the shipped tarball 2026-08-13: `src/judge.js` (`judge` — verbatim request + one artifact → `honored`/`broke` with mechanical `where`; `truncated`/`parseError` as DISTINCT flagged outcomes floored to `broke` and excluded from graded denominators; embedded "the user later said…" amendments ignored as untrusted data; composes around a provider, never inside the Loop; optional `onLlmResult` forwards usage/cost to a wired gate as `kind:'judge'`), `src/judge-calibration.js` (`calibrate`, `CALIBRATION_CASES`, `INJECTION_BATTERY` (5 styles), `scoreCase`, `gradeRun`, `constantHonored` — the negative control proving the harness can fail; a tier is admitted only on a pre-registered floor with zero reds AND resistance to every injection style), `src/bareguard-adapter.js` (`judgeToAnnotation` — pure, `surface = v.verdict !== 'honored'`, all three gate caps bounded DEFENSIVELY with a visible `…[clipped]` marker, `opts.limits`; calls no gate — the caller makes the `gate.annotate` call). All exported from the entry (`index.js` lines 10-11, 23, 46-47, 67). **Fixture location, stated precisely:** the tarball ships the clear cases **inlined** in `judge-calibration.js`; the byte-pinned `e6i-cases.frozen.json` + its hash-pin test live in the bare-agent **repo** (tests are excluded from the tarball). Their adopter contract states the clear-case set is byte-equivalent to bareguard's frozen E6i fixture (`sha256(cases)=a840832…`, the hash this ask's "DELIVERED AND PINNED (2026-08-12)" note records) and that **injection resistance is established at `claude-haiku-4-5` only**, re-run required on any tier deviation. **Consumed = pin bump only** (`^0.35.0 → ^0.36.0`); judge wiring and **live execution of the acceptance criteria deferred to the N4 rung**, where the consumer exists. |
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

## BA-18 — RESOLVED (bare-agent 0.34.0, 2026-07-26): no request/idle timeout on the http(s) providers — and my second criterion was WRONG

**Delivered same-day.** `timeoutMs` on all four http(s) providers (Anthropic, OpenAI, Gemini,
Ollama), constructor default 600000ms / 10 min, per-call overridable, `0`/`Infinity` disable.
It bounds socket **inactivity** (`req.setTimeout`), so a slow-but-streaming response is not
killed — only a silent socket trips. On trip `generate()` rejects with a retryable
`TimeoutError` (`code:'ETIMEDOUT'`, `retryable:true`), the shape `DEFAULT_RETRY_ON` already
classifies as transient. Implemented once in `src/provider-http.js` so the four cannot drift.
Acceptance criterion 1 met, with the disable-edge semantics tightened beyond what was asked
(a per-call `null` inherits rather than re-enabling; `NaN`/negative falls back to the default
rather than silently disabling the bound).

**Criterion 2 was my error, and it is withdrawn.** The ask asserted *"`withRetry` has zero
call sites in `bare-agent/src`, so `retry.js`'s `ETIMEDOUT` classification is dead code on
this path."* Verified against the version I filed against (0.33.1): **`withRetry` does not
exist at all** — zero matches anywhere in the source — and the real primitive, `Retry.call()`,
**was already wired around `provider.generate`** at `loop.js:733`
(`this.retry ? await this.retry.call(generate) : await generate()`), reachable via
`Loop({ retry })`. The retry seam reached the transient table the whole time. It never fired
only because nothing ever THREW `ETIMEDOUT` — there was no timeout. **Part 1 was the entire
bug; part 2 was noise I added.**

**The error class, named so it does not repeat.** I grepped for a symbol I had misremembered,
got no hits, and read that emptiness as "the mechanism is absent." *A grep for a name that
does not exist returns exactly what a missing mechanism returns.* The standing rule (read the
source before filing) was followed in letter — I did read `retry.js` — and failed in substance,
because I searched for the wrong noun instead of tracing what actually wraps `generate`. This
is the third correction to a filed ask (BA-2 misfiled, LC-1 redrafted) and the second to this
one (the "40-56s between every turn" frequency claim was corrected by F57).

**Consumed:** bareloop moves 0.33.1 → 0.34.0; the harness-side stale-socket guard in
`scripts/run-screen-types.mjs` and `scripts/probe-materials.mjs` is superseded by `timeoutMs`
and comes out at consumption.

<details><summary>Original ask as filed (2026-07-26, job #5 TYPES screen)</summary>

### BA-18 — `AnthropicProvider` sets no request/idle timeout, and `withRetry` has zero call sites — an idle-stalled socket hangs the caller until the OS TCP timeout (2026-07-26, job #5 TYPES screen)

**Symptom, observed 3/3 times it could occur.** A job whose signed checks idle the connection
40–56s between every LLM turn. In each of three runs, the last worker round lands normally,
then a single `generate()` never returns: **38 minutes** in two rows, **2h24m** in the third
— with zero rounds recorded between the final turn and the eventual escalation. The caller
has no way to distinguish this from a slow model; there is no event, no error, and no
progress. It presents as a hang, not a failure, so every retry/casualty policy above it is
inert by construction.

**Source read before filing (the BA-2 lesson).**
- `provider-anthropic.js:_request` calls `transport.request(url, { method, headers })` and
  wires `req.on('error')` only. **No `timeout` option, no `req.setTimeout`, no
  `AbortSignal`.** A socket that the server has silently dropped, or a response that never
  starts, is therefore bounded only by the OS TCP timeout (~2h on Linux defaults).
- `retry.js:21` already classifies `ETIMEDOUT` as transient — but **`withRetry` has zero call
  sites in `bare-agent/src`**. Grepped the whole source tree. The classification is dead code
  on this path, so even a caller who wires `Retry` gets no protection against this failure.
- `provider-clipipe.js` DOES bound its child process. The gap is provider-specific, not a
  design position.

**Ask (FAIL-able), two parts.**
1. **A configurable request/idle timeout on `AnthropicProvider`,** defaulting to a finite
   value. Acceptance: with `timeoutMs: 100` against a transport that accepts the request and
   never responds, `generate()` must reject within ~100ms with an error carrying
   `code: 'ETIMEDOUT'` (or an equivalently classified transient code) — and must NOT reject
   when the response arrives inside the window. A test that hangs the transport and asserts
   the caller regains control is the whole criterion.
2. **Wire `withRetry` around `provider.generate`, or document the seam.** Acceptance: a
   transport that throws `{code:'ETIMEDOUT'}` once then succeeds must return the success
   under a wired `Retry`, and must rethrow under `retryOn: () => false`. If the intended
   contract is caller-side wiring, that is a fine answer — but then `retry.js`'s transient
   table needs a documented consumer, because today nothing reaches it.

**Disconfirming evidence, filed WITH the ask (the standing rule).** A caller-side workaround
EXISTS and WORKS: bareloop now wraps `generate()` in a bounded timeout + retry
(`228b016`), and it caught the condition on the next run. So this is not blocking, and the
ask is for the durable fix in the right layer, not a rescue. Two further honest counterweights:
`provider-clipipe.js` already has a timeout, so the suite is not uniformly missing the
concept; and the failure needs an aggravator (multi-minute idle gaps between turns) that many
consumers will never produce — this job's signed checks are an unusually good generator of it. **Corrected 2026-07-26 (F57):** an
earlier draft of this ask said the checks idle the connection "40-56s between every LLM turn" —
the archive says median **3.8s**, max **48.6s** on this job. The idle aggravator is the TAIL, not
the typical round; job #4's **561s** maximum check is the stronger example. The premise holds, the
frequency claim did not, and it is corrected here before the ask is implemented.

</details>

**Related.** BA-14 (2026-07-16) is the same family one layer down — a stale pooled keep-alive
socket surfacing as `EPIPE`, fixed by widening the retry predicate. BA-18 is the case that
predicate cannot reach: the socket does not error, it simply never answers.

## BA-19 — RESOLVED (bare-agent 0.35.0, same-day): total-duration `deadlineMs` beside the idle bound

**Delivered exactly as asked, verified against shipped source (never the changelog):**
`deadlineMs` per call, `code:'EDEADLINE'` with `context.bound:'deadline'` (and the idle trip
now carries `context.bound:'idle'` — the discriminator on BOTH bounds, criterion 2 exceeded),
`retryable:false` (terminal — hamr's choice via the shape question: a deadline is a hard
ceiling the caller set to STOP; auto-retry would re-spend up to another full `deadlineMs`),
disabled by default, `0` a no-op, timer unref'd. Criterion 3's ordering (idle fires first
when `timeoutMs < deadlineMs`) documented at the source.

**Consumed:** bareloop 0.34.0 → 0.35.0, full suite 449/449 + typecheck green. **Wiring
`deadlineMs` into worker calls is PARKED:** the F66 fuse already self-heals this class above
the transport (validated on the paid surface), and adding a second call bound to the clock's
derivation is arbiter territory — named, not shipped unilaterally.

<details><summary>Original ask as filed (2026-07-28)</summary>

### BA-19 — `timeoutMs` bounds socket INACTIVITY only; nothing bounds a call's TOTAL duration — a slow-but-trickling response hangs a caller for hours (2026-07-28, U run ms3197n8 / F66)

**Symptom, observed once at full cost.** One `generate()` call on `AnthropicProvider`
(bare-agent 0.34.0, `timeoutMs` derived and forwarded per call — verified at `loop.js:732`)
ran for **274 minutes** and ended in `read ECONNRESET`, not a timeout. Zero rounds, zero
events, ≥$3.23 of a $10 budget consumed by a run that produced no verdict. The reset — not a
`TimeoutError` — is the proof of mechanism: the idle timer never tripped, so bytes WERE
arriving at the socket for 4.5 hours without the response ever completing.

**Source read before filing.** `applyRequestTimeout` (`src/provider-http.js`) is one
`req.setTimeout(...)`. Node resets that timer on ANY socket activity; the docstring says so
plainly: *"the timer resets on activity, so a slow-but-streaming response is not killed."*
That is the correct behavior for the quantity it watches — BA-18 asked for an idle bound and
got a good one. But it means bare-agent has NO bound on total call duration: a response that
trickles a byte every few minutes is invisible to every timer in the library, forever.

**The ask.** A per-call total-duration deadline beside (not replacing) the idle bound —
`deadlineMs` or an `AbortSignal`, whichever fits the provider surface. The two quantities are
independent failure modes: a silent socket (BA-18) and a zombie stream (this ask).

**FAIL-able acceptance criteria:**
1. A mock server that streams one byte every `idle/2` ms and never completes: a call with
   `deadlineMs: X` rejects within `X + ε`. Today this call NEVER returns until the kernel
   gives up — the criterion fails on 0.34.0 by construction.
2. The rejection is typed and DISTINGUISHABLE from the idle trip (a distinct `code`, or a
   field naming which bound fired) — a consumer routing governance stops vs transport
   casualties (bareloop's F64 discriminator) must not have to guess which timer spoke.
3. The idle bound still works unchanged with a deadline set: a silent socket trips the idle
   timer FIRST when `timeoutMs < deadlineMs`. (Guards against the fix replacing one bound
   with the other.)
4. Per-call overridable; disable semantics consistent with `timeoutMs` (`0`/`Infinity`).

**Filed WITH its own limiting evidence (standing rule):** n=1 — one 274-minute hang, one run.
bareloop no longer depends on this fix: the F66 in-process stall fuse (heartbeat = a round,
5-min window, 3 strikes then replan) self-heals this class at the harness layer, and the F67
outside watchdog bounds even a frozen harness. This ask is defense-in-depth for consumers who
have neither. A deliberately long single call (large `maxTokens`, slow model) is a legitimate
multi-minute stream — a default deadline would kill it, so **disabled-by-default is the
defensible shape**; the ask is for the KNOB, not for a new default.

</details>

## LC-3 — RESOLVED (litectx 0.31.0, same-day): `index({ yield: true })` cooperative yielding, shape B as decided

**Delivered as the yield-only shape (hamr's fork call: atomicity is an integrity property,
liveness a comfort property — never trade the first for the second), verified against shipped
source: `setImmediate` between per-file parses, store byte-identical, single `applyChanges`
transaction preserved, default `false` unchanged.**

**Acceptance read on bareloop's own fixture (the 155-file spare patient, n=4), stated with
the miss on record:** max single block **189–252ms** — the binding clause (≤500ms) passes
every run with ~2× headroom; liveness **54.0–57.8%** — the ≥60% proxy clause MISSES by the
letter here (upstream measured ~63% on litectx's own tree; the tick-ratio is fixture-sensitive
to file-size distribution). Consumed on the binding clause: no timer any consumer named runs
can perceive a ≤252ms block. The %-proxy's fixture sensitivity is the lesson — the next
liveness criterion should be max-block-only, which is the quantity a host actually feels.
NOT re-amended to pass: the criterion was amended once for a principled reason (atomicity);
amending it again after the measurement would be fitting the bar to the result.

**Consumed:** litectx 0.29.1 → 0.31.0; `planrun.js` worker setup now indexes with
`{ yield: true }` (every worker path — scout, step, fix). Full suite 449/449 + typecheck.

<details><summary>Original ask as filed (2026-07-28)</summary>

### LC-3 — `index()` blocks the host event loop for its full duration: async in signature, synchronous in substance (2026-07-28, U run ms3wawub diagnosis)

**Measured before filing, on litectx 0.30.0 via bareloop's own construction (`new LiteCtx({root})`,
`index({force:true})`), patient a 155-file copy of litectx itself:** index took **4,409ms** during
which a 100ms host interval fired **2 of 44 due ticks — 4.5% event-loop liveness**. An in-run
observation during U diagnostics read the same shape (1 tick where 19 were due). `index()` is
`async` and is awaited — but the work inside (tree-sitter chunking, better-sqlite3 upserts,
`collectFiles`) is CPU/sync, so the `await` yields microtasks, never the loop.

**Why a host cares.** bareloop calls `lc.index()` at worker setup inside the same process that
runs its safety timers (a stall fuse, a wall clock, an event-loop lag sampler). During an index
pass all of them are dead — timers cannot fire, sockets cannot be read, spines cannot be written.
Seconds today; it scales with repo size and would multiply under embeddings (which force a
rebuild to take effect at all).

**Filed WITH its own limiting evidence (standing rule, and this repo has misattributed blame to
litectx before — LC-2 was withdrawn as our own stale index):**
- On this 155-file repo the block is ~4.4s, and INCREMENTAL passes are ms-scale (7ms measured
  elsewhere for 206 files) — the cost is real only on force/first passes and version-skew heals.
- bareloop's own 65-second freeze that triggered this investigation was NOT litectx: it was
  bareloop's `ralph.js` running closes via `spawnSync` — owned on our side, tracked separately.
- bareloop can also mitigate alone (call `index()` from a worker thread), so this is a
  quality-of-embedding ask, not a blocker.

**The ask.** A non-blocking option for `index()` — either a worker-thread offload
(`index({offthread:true})` or a documented `indexInWorker()`), or an inter-file yield
(`setImmediate` between files) so the host loop breathes between parses. Default behavior may
stay exactly as it is; the ask is a knob.

**FAIL-able acceptance criteria:**
1. During a force index of a fixture that takes ≥2s, with the option enabled: no single
   event-loop block exceeds 500ms, and a 100ms host interval fires ≥60% of due ticks
   (today: max block 1142ms, 4.5% liveness).
   *(AMENDED 2026-07-28, criterion was ours to correct: the original ≥80% bar overshot the
   functional need — every consumer named here runs second/minute-scale timers, and litectx's
   POC showed reaching 80% costs the store's single-transaction atomicity. An integrity
   property must not be traded to hit a comfort number nobody needs; yield-only (~63%
   liveness, ~250ms max block, atomicity intact) is the shape this criterion now accepts by
   design, not by exception.)*
2. Identical output: chunk count, edge count, and stored stamp match the blocking path on the
   same fixture, byte for byte where content is compared.
3. Concurrent reads during an off-thread index either serialize safely or fail cleanly with a
   named error — never a corrupt store.

</details>

## LC-5 — a missing `ripgrep` reads as "0 callers, risk low": the documented §7.2 false-isolation should be DETECTED at runtime, not only documented (2026-07-31, v0.6.0 release gate / CI red)

> **DELIVERED in `litectx@0.32.0`, same day (2026-07-31), as option (a) — refuse.** Verified
> against the shipped tarball's source and by executing the acceptance criteria live, not the
> changelog's word:
> - **C1 (loud on missing rg):** both sweeps now route through one `runRg()` runner
>   (`src/impact.js`); a spawn failure throws the new exported `RipgrepMissingError`
>   (`.code = "RIPGREP_MISSING"`) whose message names ripgrep, PATH, and the §7.2 false
>   isolation. Live probe (fresh 2-file fixture, in-memory index): PATH scrubbed →
>   `RipgrepMissingError code=RIPGREP_MISSING` thrown, never a silent readout.
> - **C2 (legitimate empty unchanged):** the spawn-failure detector (`rgSpawnFailed`) keys on
>   `syscall: "spawnSync*"` + no signal — exit 1 "no matches" carries neither and stays a
>   valid empty. Live probe with rg present: `refCount 3 / risk medium / 2 confirmed callers`
>   on the same fixture — behavior intact.
> - **C3 (both call sites):** the single shared runner makes per-site divergence structurally
>   impossible — the barrel/alias sweep (`rgListFiles`) cannot silently contribute an empty
>   candidate set without the same throw.
> - **C4 (partial-stdout salvage kept):** the `e.stdout` salvage branch survives in `runRg`;
>   the throw fires only when rg never ran (spawn syscall, no exit signal — upstream verified
>   the error shapes against `execFileSync`, noted in source).
>
> Notably the detector is *broader* than the ask: EACCES/ENOTDIR/EPERM (rg present but
> unrunnable) also throw, via the syscall signal rather than an errno whitelist — the same
> fail-safe direction. **Consumed:** bareloop bumps to `^0.32.0` (590/590 green; rg present
> in CI since the same-day ci.yml/publish.yml fix). No bareloop code change needed: the
> `guarded()` wrapper in `src/tools.js` already converts the throw into a refusal RESULT
> (`ctx_impact failed: impact() needs ripgrep (rg) on PATH …`) with an `outcome:'error'`
> spine emit — the worker sees a named cause, never a false "0 callers" licence.

**Measured before filing (standing rule), on litectx 0.31.0 as shipped:**

- bareloop's CI (ubuntu-latest, no ripgrep on the image) has failed **deterministically on
  exactly 2 tests since 2026-07-28 10:55** — the commit that introduced `ctx_impact` tests
  (green immediately before, red every run after, 18 consecutive runs). Both failures are
  `impact()` reporting `risk low — 0 confirmed caller(s), 0 mention(s)` for a symbol with
  2 real callers in the fixture.
- Reproduced locally by construction: clean checkout + fresh `npm ci` (Node 20, matching CI)
  passes **558/558** with `rg` present; with only `rg` shadowed by a failing stub, **exactly
  the same 2 tests fail and nothing else** (18/20 in the file; callees and the import graph
  still work — they are tree-sitter/index paths, not `rg` paths). Same signature as CI,
  byte for byte on the readout.
- Source trace (`src/impact.js`, 0.31.0): both `rg` call sites swallow the spawn failure
  into a valid-empty result —
  - `rgWordMatches` (`:182-187`): `catch { if (e.stdout) out = e.stdout; else return []; }`
    — the comment anticipates **exit 1 = "no matches"**, but the same branch also eats
    **ENOENT = "rg never ran"**. The distinguishing bit (`e.code === 'ENOENT'` vs
    `e.status === 1`) is in hand and discarded.
  - `rgListFiles` (`:312-316`): identical swallow. This one feeds the **barrel/alias caller
    sweep** — the "crux false-isolation mode" the file's own §7.2 comment says a name-only
    search can't see; with rg absent it silently sees nothing either.

**The defect, stated against litectx's own doctrine.** The adopter contract already says it
plainly (Gotchas: *"a symbol can read as isolated purely because the tool is absent (a §7.2
false-isolation, the one dangerous error)"*) — so this is **not** an undocumented-dependency
report. The ask is narrower: a documented footgun is still armed. Docs protect the operator
who reads them; they cannot protect the *consumer of the readout at runtime* — in bareloop's
case an LLM worker handed the `ctx_impact` text, which has no way to know `rg` was absent and
takes "0 confirmed callers" as licence to change freely. impact's whole hedging design exists
because under-counting is the dangerous direction; a missing tool currently produces the
**maximal under-count** wearing the normal hedged coat. (bareloop's house rule for the same
shape: unknown is reported as unknown, never rendered as 0.)

**Filed WITH its own limiting evidence (standing rule):**
- The requirement **is** documented, in three places (README mechanism note, context.md
  Gotchas, context.md Constraints). Our CI blindness was **our own missed contract read** —
  owned on our side and fixed regardless of this ask (one-line ripgrep install in our CI).
- Blast radius is bounded and correctly documented: `recall()`/`index()`/`get()` don't touch
  `rg`; only `impact()` degrades.
- n=1 environment class (CI images without rg), but the mechanism is deterministic, not flaky.

**The ask.** Distinguish "rg ran and found nothing" (exit 1 — a valid empty) from "rg never
ran" (ENOENT/spawn failure) at **both** call sites, and surface the second case loudly.
Either shape is fine by us — upstream's pick:
- **(a) refuse:** `impact()` throws a named error (e.g. code `RIPGREP_MISSING`) whose message
  names ripgrep and the PATH requirement; or
- **(b) hedge honestly:** the readout carries an explicit, machine-distinguishable hedge
  (e.g. `caller sweep unavailable: ripgrep (rg) not found on PATH — caller/mention counts
  are UNKNOWN, not zero`) and does not present `confirmed`/`mentions` as exact zeros.

**FAIL-able acceptance criteria:**
1. With `rg` absent from PATH, `impact()` on a symbol that has real callers must NOT return
   a readout identical in shape to genuine isolation: either a named throw (a), or a hedge
   naming ripgrep plus counts not presented as exact zeros (b). Test: run litectx's own
   impact test with PATH scrubbed of `rg`.
2. With `rg` present and genuinely zero matches, behavior is byte-identical to today
   (exit 1 stays a valid empty — no new failure mode for the legitimate case).
3. Both call sites covered: the alias/barrel sweep (`rgListFiles`) must not silently
   contribute an empty candidate set when rg is missing — a barrel-reached caller must not
   vanish without the same loud signal.
4. A crashed rg with partial stdout (the existing `e.stdout` salvage branch) keeps today's
   salvage behavior — the new signal fires only when rg produced nothing because it never ran.

---

## CHECKED AND **NOT** FILED (2026-08-08) — bareguard ALREADY has the seam for close-stage commands; the gap is bareloop's wiring, not bareguard's API

**Why this was checked.** PRD v1.57 §3 rules that declared close commands need a deny-floor and
says where it belongs: *"The fence is the natural home. bareguard already owns action-level
denial for every verb the worker holds; close-stage commands **bypass it entirely today**…
**If bareguard has no seam for it, that is an UPSTREAM ASK, never a local shim.**"* The
condition was checked against bareguard's shipped source (`bareguard@0.12.0`, the version
`package.json` already depends on) before anything was filed. **The seam exists. No ask.**

**What is genuinely true about the gap.** A declared close spawns straight from
`src/kinds.js:241` (`spawn(cmd, args, {cwd, env})`); no `Gate` is constructed on that path, so
the fence never sees a close command. That is bareloop's own wiring — the same finding pointed
the other way, and it belongs under *OUR SIDE*, not in a suite repo's queue.

**The seams bareguard already ships (read in source, not in the changelog):**

- **`bash` primitive, step-3 action-type deny** (`src/primitives/bash.js:29`). Reads the command
  from `action.cmd`, `action.args.cmd` **or** `action.args.command` — the flat and `wireGate`
  nested shapes both compose with no translation layer. `bash.denyPatterns` (RegExp list) and
  `bash.allow` (prefix allowlist, fails closed on shell metacharacters, rule
  `bash.allow.shellMeta`) are both configuration, not code.
- **`tools.denyArgPatterns`, keyed per action type** (`src/primitives/tools.js:32`) — tests
  RegExps against `JSON.stringify(action)`. This one is **argv-native**: a close stage is
  `{cmd, args: [...]}`, and the serialized action carries both without a lossy join. A dedicated
  action type (e.g. `close-stage`) plugs in here with no upstream change at all.
- **`content.denyPatterns`** — same serialized-action scan, and its
  `SAFE_DEFAULT_DENY_PATTERNS` already carry the recursive-force-delete and `--force` shapes
  out of the box (`src/primitives/content.js:39`).
- **`classifyCommand(command, opts)` is PUBLICLY EXPORTED** (`src/index.js:38`), beside
  `DESTRUCTIVE_PATTERNS` / `SUPER_DESTRUCTIVE_PATTERNS` / `INTERPRETER_PATTERNS`. It tiers a
  command `safe` / `destructive` / `super_destructive` and is usable **directly**, without a
  `Gate` — which matters, because the close is arbiter territory and routing it through the
  worker's gate would mix two populations of audit rows.

**The one real shape mismatch, stated rather than filed.** `bashCheck` and `classifyCommand`
read a command **STRING**; a declared stage is an **argv pair**. Joining `[cmd, ...args]` for the
`bash.*` rules is lossy (quoting, embedded spaces) and would be an adapter decision on our side.
It is not a missing capability: `tools.denyArgPatterns` and `content.denyPatterns` both take the
argv shape as-is. **If** a later rework wants `bash.allow`-style prefix allowlisting over an
argv (the PRD's "cmd menu harvested by the scout" direction), *that* — an argv-aware
`bash.allow` — would be the ask worth filing, with its own fail-able criteria. It is not filed
today, because nothing in the ruling needs it.

**What landed instead, and its honest scope.** A local deny-floor at bareloop's own **validation
gate** (`DENIED_COMMANDS` / `deniedCommandReason`, `src/authoring.js`), which reds a dangerous
`cmd` **before any token and before any spawn** — earlier than a fence could, since it refuses
the declaration rather than the action. This is **not** the local shim the two-red routing rule
forbids: it is not a re-implementation of a missing upstream primitive, it is a validator
rejecting an artefact bareloop itself owns. The fence wiring the PRD describes remains the
rework's job, and the floor is documented as a floor, never as containment (PRD v1.57 §3's
KNOWN LIMITATIONS stand unchanged).

*(Rule reaffirmed once more: **read the library source before filing an upstream ask.** Four
candidates have now gone in and three come out.)*

---

## BA-20 — the decisive judge exists only as a POC in bareguard's research corpus: bareloop's N4 (soft-green) rung needs it PRODUCTIZED, in bare-agent (2026-08-09, N4 opening / the RSI judged-floor doctrine)

> **DELIVERED in `bare-agent@0.36.0`**, source-verified against the shipped tarball **0.36.1** on
> **2026-08-13** — `src/judge.js`, `src/judge-calibration.js`, `src/bareguard-adapter.js`, all
> exported from the package entry (`index.js` lines 10-11, 23, 46-47, 67). The delivery is both
> halves this ask asked for and neither is optional: the **judge call** (`judge` — verbatim
> request plus one structured artifact in, `honored`/`broke` with a mechanical `where` out;
> truncated and unparseable responses are DISTINCT flagged outcomes (`truncated`/`parseError`),
> floored to `broke` and excluded from graded denominators; embedded *"the user later said…"*
> amendments inside the artifact are ignored as untrusted data; it composes **around** a
> provider, never inside the Loop, and an optional `onLlmResult` forwards usage/cost to a wired
> gate as `kind:'judge'`), and the **calibration harness** (`calibrate`, `CALIBRATION_CASES`,
> `INJECTION_BATTERY`, `scoreCase`, `gradeRun`, plus `constantHonored` — the negative control
> that makes criterion 6 real — admitting a tier only on a pre-registered floor with **zero
> reds** AND resistance to **every** injection style). The **`judgeToAnnotation` mapping** ships
> too, pure, in `src/bareguard-adapter.js`: `surface = v.verdict !== 'honored'`, all three gate
> caps bounded **defensively** with a visible `…[clipped]` marker, `opts.limits` for the caps;
> it calls **no** gate — the caller still makes the `gate.annotate` call itself, exactly as the
> ruling below requires.
>
> **The frozen fixture's location, stated precisely rather than rounded off.** The **tarball**
> ships the clear cases **inlined inside `judge-calibration.js`**; the byte-pinned
> `e6i-cases.frozen.json` and the hash-pin test live in the bare-agent **repo** (tests are
> excluded from the tarball). Their adopter contract states the clear-case set is
> **byte-equivalent** to bareguard's frozen E6i fixture — `sha256(cases)=a840832…`, the same
> hash the *DELIVERED AND PINNED (2026-08-12)* note above records — and that **injection
> resistance is established at `claude-haiku-4-5` ONLY**, with a re-run required on any tier
> deviation.
>
> **bareloop's consumption this cycle is the dependency bump and nothing else.** The pins moved
> `bare-agent ^0.35.0 → ^0.36.0`; the consumer of `judge`/`calibrate`/`judgeToAnnotation` is the
> **N4 (soft-green) rung, which does not exist yet**. So the judge is **not wired** into a
> `judged` close stage today, and **BA-20's acceptance criteria have not been executed live**
> here — running `calibrate` against the frozen floor, comparing to the ≥7/7 bar, and naming the
> hash it graded — all of that is **deferred to N4's opening**, where the consumer exists. Said
> plainly: this entry records a verified DELIVERY, not a verified ACCEPTANCE.
>
> **Companion, same cycle: `bareguard@0.13.0`** — the BA-20-session hardening, consumed here by
> the pin bump `^0.12.0 → ^0.13.0`: `gate.annotate` now **REJECTS** malformed facts (the array
> fail-open, the retired sketch shape, missing `surface`) into distinct `annotate_malformed`
> audit rows instead of normalizing them into silently-`honored` ones, no longer throws into the
> agent loop on a fact that explodes on read, routes `verdict` through the audit **redactor** (a
> real secret-leak fix — it was written RAW), makes `meta`'s 1000-byte bound a **decoupled copy**
> (undoable-after-the-fact fixed), and drops `__proto__` keys at every depth while copying.
> **bareloop's own exposure is zero:** it imports only `Gate` and `redact` and **never calls
> `gate.annotate`**, so the behaviour and audit-format change costs it nothing today — and
> bareguard verified at source that 0.36.0's `judgeToAnnotation` always sets an explicit boolean
> `surface`, so the new rejection rule costs the only shipped consumer nothing either.

**Re-aimed the same day it was filed, stated up front.** This file's IDs key to the owning
package — `BA-*` bare-agent, `LC-*` litectx, `BG-*` bareguard. This ask went in first as
**`BJ-1`, recommending a NEW suite package** (working name *barejudge*) on a new `BJ-*` prefix.
**hamr rejected that framing, verbatim:** *"no new lib barejudge for one primitive, if bg rule
not to call llm then it completes its part and bareagent does the call."* So there is **no new
prefix and no new package**: bareguard completes its part with the measured E6i design plus the
already-shipped `gate.annotate` fact envelope, and **bare-agent makes the call** — it is the
suite package that already owns every LLM call and all transport. Renumbered **BA-20**
accordingly. It is admitted under this file's own rule (only upstream-gap reds land here) as
the *missing primitive* case: the primitive is measured but owned by no shipping package. The
resolution is upstream — a new bare-agent primitive, consumed here by version bump, **never a
local shim in bareloop**. **hamr's call stands that it gets built SEPARATELY, as its own
deliverable, not folded into a rung.**

### Where it lands and why (the BA-2 lesson, applied *before* filing — and again on re-aim)

Read in bareguard's own PRD and corpus, 2026-08-09, before anything was written here:

- **bareguard PRD Part 2 splits two axes.** **Axis A** gates the *outgoing action* by shape — a
  deterministic floor. **Axis B** reconciles the *RETURN* against a declared constraint — and it
  is specified as **a detector that annotates, never decides**.
- **The shipped half is already there:** `gate.annotate` and its fact envelope
  `{ surface, verdict, where, meta }`, released in **bareguard 0.7.0** (their `gate.js:600-619`,
  PRD §8.2). **The citation of record is the shipped `Annotation` typedef** — it now documents
  **BOTH bounds**, source and audit-sink, *and* `meta`'s all-or-nothing behaviour in the source
  itself, which makes it the stable citable authority rather than any doc line. Field semantics,
  exactly as shipped:
  **`surface` (bool) is the ONLY load-bearing field** — it alone is what makes an audit row read
  BROKE; **`verdict`** is an optional string (capped at 80 chars — immaterial for
  `honored`/`broke`); **`where`** is an optional string **capped at 300 CHARACTERS** (characters,
  *not* bytes — see the next bullet; and the field is `where`, *not* `text`); **`meta`** is an
  optional bag **capped at 1000 bytes** at the source —
  **all-or-nothing, see the next bullet** — and it is where `{field, stated, returned}` ride.
  **`kind` DOES NOT EXIST** — bareguard's own **E6e** killed it, and it sits in this ask's own
  rejected-alternatives table below. That envelope is Axis B's detector, and it needs no change.
- **There are TWO bounds, not one — and the second one no caller can satisfy by sizing.** The
  maintainer measured the source caps against the shipped gate (2026-08-12), then measured the
  BOUNDARY twice; the second boundary pass found a **whole bound this entry had never described**
  and corrected the silent/visible reading of the first. Both halves are stated here rather than
  quietly rewritten.
  **(a) The SOURCE bound — governs the DRAINED fact and the `humanChannel` event.** `verdict`
  **80**, `where` **300 CHARACTERS**, `meta` **1000 bytes, all-or-nothing**. **Characters, not
  bytes**: 300 CJK characters is **900 bytes**, so **the source caps never were what preserved
  append atomicity** — that job belongs entirely to bound (b). `where` truncates here
  **SILENTLY**: their probe put F98's own exemplar — the 8 `tsc` error lines — through `where` and
  it came out cut mid-token at `src/backup.js(59,4`, **six of eight addresses gone, no marker**.
  `meta` is **ALL-OR-NOTHING** and does **not shorten content**: under 1000 bytes the bag rides
  **whole**; at the cap the **ENTIRE `meta` object is replaced by `{_truncated: true, bytes: N}`**
  — `field`, `stated` and `returned` are lost **with** the evidence, not preserved beside a
  clipped quote. Measured across that boundary: **4 lines / 375 B, 8 lines / 751 B, 10 lines /
  939 B ride intact; 12 lines / 1127 B and 20 lines / 1879 B lose everything.**
  **(b) The AUDIT-SINK bound — applied AFTER redaction, to the PERSISTED LINE only.** A
  **~3500-byte** atomic-append cap on the row that reaches disk. **Redaction expands** each match
  into a longer `[REDACTED:…]` tag, so **a line built entirely from in-budget values can still
  blow the cap**, and at this bound `meta` is replaced **WHOLESALE even when the source meta was
  legal**. Their measurement, one number that settles it: a **355-byte** `meta` persisted as
  **`{"_truncated":true,"bytes":6977}`**. **No caller can satisfy this bound by sizing alone** —
  the expansion factor belongs to the configured redactor and to the judged text, not to the
  judge; sizing the source is **necessary and not sufficient**.
  **CORRECTION to the earlier rounds' silent/visible statement.** The **AUDIT** clip of `where`
  **DOES** carry a **`[TRUNCATED]`** suffix, and the row a root **`_truncated: true`**. *"Clips
  silently, no marker"* is true **only of the SOURCE clip — the drained fact**. Stated the right
  way round: **loss in the persisted row is VISIBLE; loss in the drained fact is NOT.**
  So above roughly **ten `tsc`-scale lines** a judged row degrades to **a count with no
  addresses** — the exact **F98 semantic-genre stall that requirement 6 exists to prevent**,
  arriving through the field that was supposed to be the safe one; and a **redaction-heavy** row
  can degrade at the sink no matter how small the source was. **Neither bound is to be raised** —
  the **~3500-byte sink cap** is what keeps an audit-line append atomic under `PIPE_BUF`, and the
  source caps bound what the drain and the human channel carry. The consequence for the judge is a
  contract clause of this ask; it is stated in requirement 6 below.
- **The judge itself is POC-only** — `harness-code-mode/e6-judge.mjs`, never shipped — and
  **bareguard's locked design says bareguard never calls an LLM: the judge is caller-side by
  law** (PRD §6.7, §9.2).

**bareguard's part is COMPLETE — nothing is asked of it.** Its two contributions are already
delivered: the **measured E6i design is the spec** (cited verbatim from its own PRD in the next
section — this ask does not redesign it), and the **shipped `gate.annotate` fact envelope is the
input contract**, which stays exactly as released in 0.7.0. **No bareguard change is requested,
and none would be legal:** filing the judge against bareguard core would ask it to break its own
arbiter-shaped law that it never calls an LLM.

**The runnable half lands in bare-agent, as a new primitive/module.** That half is the judge
*call* — prompt shape, the model call itself, output parsing, cost reporting — plus the
calibration harness that admits a tier. bare-agent is where every model call in the suite already
lives, so the judge needs no new package, no new transport layer, and no new dependency. **The
envelope is the judge's DOWNSTREAM SINK, never its input** — the dataflow runs one way
(bareguard PRD §6.7): the judge's **input** is `{request, artifact, constraint}`; its **output**
is `{verdict: honored|broke, where}`; and **the CALLER** maps that output into
`gate.annotate({ surface: verdict !== 'honored', verdict, where, meta: {field, stated, returned} })`.
The judge never writes the envelope itself, and bareguard's detector stays exactly where it is.

**That mapping has ONE home, and it is not a snippet each adopter retypes.** bare-agent ships a
**pure** `judgeToAnnotation(verdict, opts?) → { surface, verdict, where, meta }` in its existing
`src/bareguard-adapter.js` — per hamr's boundary ruling: **bareguard must not know what a judge
is**, so bare-agent owns that seam file, holds bareguard as a **structural peer**, and **never
imports it at runtime**. The helper **NEVER calls `gate.annotate`**: the caller invokes the helper,
then makes the gate call itself, which keeps *"the judge never writes the envelope"* literally true
rather than merely intended. **One shape absorb rides with it:** bare-agent's `JudgeWhere` is an
object `{field, stated, returned, evidence}` — **`where`** takes the **one-line address**, the
**trio goes to `meta`**, and **`evidence` is truncated by the CALLER with a VISIBLE marker** before
the envelope ever sees it. **Loud partial loss beats silent total loss** — which is precisely what
the boundary measurement above shows `meta` does the moment the bag goes over.

(BA-2 was withdrawn for aiming a real gap at the wrong package. This entry's first filing named a
package that did not exist yet and was re-aimed on hamr's ruling the same day — the same lesson,
recorded here rather than erased.)

### The design of record — already measured, not to be redesigned (bareguard PRD §9.2; model `haiku-4.5`)

**E6i, the decisive judge.** Input: the **verbatim user request** plus **ONE structured egress
artifact**. Output: a **binary verdict `honored | broke`** plus a human-readable **`where`**.
Tiebreak, load-bearing: *if you cannot CONFIRM the answer honored the request, return `broke`.*
Measured **7/7** on the labeled clear-case set, **including the false-positive trap** — a
compliant **€280 under a €300 cap read `honored` 5/5**.

**Rejected alternatives, each with the measurement that killed it — do not re-add them:**

| Alternative | Measured failure |
|---|---|
| Confidence scale (`unsure` category) | **E6f/E6g:** `unsure` emitted **0/6** — the category was inert; and a NEUTRAL prompt **false-flagged 4/5**, *worse* than the biased one. |
| `kind` classification (violation vs deviation) | **E6e: 6/9**, and **every miss was an over-call.** |
| Deterministic calculator carve-out | **E6h: works** — and deliberately **not taken**, as perfection-chasing the long tail. |

**Scope is part of the contract, also measured: E6b.** Judging a sprawling multi-number reply
missed **1/3**; judging **the single structured egress artifact** hit **6/6**. The judge takes
**one** structured artifact — this is a contract clause, not a usage tip.

**Three non-negotiables (bareguard PRD §6.7):**

1. **Anchor on the VERBATIM request** — never the agent's paraphrase (the paraphrase is written
   by the party being judged).
2. **The reply is DATA, never instructions.** Held **100% on haiku-4.5** and explicitly
   **UNRESOLVED on weaker models** — see the disconfirming evidence below.
3. **Decisive category, never a confidence scale.** Aggressiveness belongs in a **separate
   operator knob** (strict/relaxed routing), never in the judge's vocabulary.

### Filed WITH its own disconfirming evidence (standing rule, BA-7 precedent)

- **Injection resistance is UNRESOLVED, not disproven.** 100% on `haiku-4.5` is one tier. Prompt
  injection *inside judged content* is a **hard pre-deploy test** for whatever tier ships — it is
  criterion 3 below, and it must be reported either way.
- **The judge is DRIFT-CONDITIONAL, and that bounds its value. E6c:** under a hard deterministic
  cap, a cooperative agent **drifted 0/3**. So the judge is worth least exactly where
  deterministic floors already bind, and worth something only where the constraint cannot be
  expressed mechanically. Any adopter who *can* express it mechanically should — this is not a
  general safety layer, and must not be sold as one.
- **All of the above is n=small on ONE model tier.** By this repo's own rule, n=1 on a
  nondeterministic judge is an anecdote; the base rate has to be re-established per shipping tier.

### The ask — two deliverables, neither optional

**1. The judge primitive.** `judge({ request, artifact, … }) → { verdict, where, costUsd, … }`
with the E6i semantics above: verbatim request in, ONE structured artifact in, binary verdict out,
mechanical `where` out. Ships **inside bare-agent**, on the transport it already owns — no new
package, no new production dependency.

**2. The CALIBRATION HARNESS, shipped with it — not an afterthought.** A **frozen labeled case
set** built the E6e/E6i way (verifiable / opinion / ambiguous / **injection** cases), a
**pre-registered pass floor**, and **itemized reds**. **A judge tier is ADMITTED only after it
grades the frozen set correctly.** This is bareloop's judged-floor doctrine, and it is why the
harness is half the deliverable: *a rubric close is self-consistency in disguise* until it has a
judged-floor analog, and **the judge is the ceiling** — verifier hardening never ends.

**Contract requirements — each already paid for in bareloop's findings:**

1. **Unpriced is never free (F6).** Every judge call reports real cost. A null cost is an
   **honest null**, never `?? 0`; an unpriced round **reds**, never passes silently.
2. **Truncation is a DISTINCT flagged outcome** (`stop == max_tokens`, or empty text) and is
   **excluded from every denominator** — never counted as a miss, never as a pass.
3. **Provider params gate per model tier** — `sonnet` takes `output_config.effort`; `haiku-4.5`
   does **not**. A tier-blind param is a paid casualty.
4. **Typed error attribution:** a `lib` field stamped **at the throw site**, never inferred by
   sniffing error prose.
5. **ONE scrub inventory** applied before persisting any judge raw — secrets never enter an
   append-only record (a log that captures a key captures it forever).
6. **`where` must be MECHANICAL genre:** name the field, the stated value, the returned value,
   quote the evidence. bareloop measured (F38/F39) that **mechanical gaps convert on the next
   attempt while semantic gaps produce inaction** — a judge whose `where` says *"seems off"* is a
   stall generator, not feedback. **F98 is the freshest on-point demonstration, and it is a
   recurrence, not a repeat:** a close stage held 8 real `src/backup.js(56,48): error TS1016`
   lines, reported *"8 match(es)"*, and the starved worker went probing infrastructure it had
   never needed — the same mechanical fact rendered in the semantic genre, one rung after the
   rule was paid for. When the lines were carried instead of the count, the identical job went
   **67 → 8 → 1 → 0** and greened. A judge's `where` is that same field: it either carries the
   address or it manufactures the genre that stalls.

   **Where the mechanical content RIDES — a contract clause, not a style note.** `where` is a
   **ONE-LINE ADDRESS**, ≤300 **characters**: *"price: stated €280, invoice shows €400"*, or a single
   `file(line)` locus. **`{field, stated, returned}` ride `meta` — and they must stay SMALL and
   SEPARATE from any bulky quoted evidence.** The reason is the measured field budgets (field
   semantics, above), and it is **two different failures at the SOURCE bound, plus a third at the
   AUDIT-SINK bound**: `where` clips **silently at the source** at 300 **characters** — the
   maintainer's probe put F98's 8 lines through `where` and got
   `src/backup.js(59,4`, **six of eight addresses gone with no marker** — while `meta` is
   **ALL-OR-NOTHING** at 1000 bytes: one byte over and `{field, stated, returned}` vanish
   **together with** the evidence, replaced by `{_truncated: true, bytes: N}`. **There is no
   partial credit at the meta boundary.** So the evidence quote is **BOUNDED BY THE JUDGE'S
   CALLER, before the envelope** — trimmed to a **visibly marked** excerpt sized so the **whole**
   `meta` bag stays under 1000 bytes — and the address trio is never packed in behind a quote long
   enough to take it down with it. **That sizing is necessary and NOT sufficient**, and this
   requirement says so plainly: the **AUDIT-SINK bound** (~3500 bytes, applied **after redaction**
   to the persisted line) can replace `meta` **wholesale even when the source meta was legal** —
   measured, a **355-byte** `meta` persisted as **`{"_truncated":true,"bytes":6977}`**. **No
   caller can satisfy that bound by sizing alone**, which is why the ruling below makes the
   **drain**, not the audit line, the authoritative carrier of judged facts. **The caps stay
   exactly as shipped** (`PIPE_BUF` headroom at the sink);
   nothing here asks bareguard to raise one. A judge that stuffs evidence into `where` emits a
   **silently clipped row**; a judge that stuffs it unbounded into `meta` emits **a count with no
   addresses** — and both are read by a human at the HITL, where a missing address cannot be
   recovered. The **persisted** row at least says so (`[TRUNCATED]` / `_truncated: true`); the
   **drained** fact — the one the ratchet reads — says nothing at all. **This narrows the CHANNEL, never the
   demand:** the mechanical genre is still mandatory in both fields — a one-line `where` that says
   *"seems off"* fails this requirement exactly as it did before.
7. **Validate against the REAL instrument.** Acceptance runs on **real uncrafted egress
   artifacts**, never fixtures authored to contain the result; **the case set must be able to
   FAIL**.
8. **Base-rate discipline:** reproduce the **E6i battery shape — ≥5 samples per case** — at
   minimum. A single sample of a nondeterministic judge is an anecdote.

### FAIL-able acceptance criteria

1. **Clear-case floor:** on the shipping tier, the frozen set is graded at **≥ E6i's clear-case
   performance** (**7/7** at `haiku-4.5`, ≥5 samples/case), reported **per case with itemized
   reds** — not as an aggregate percentage. **Graded against the PINNED fixture** (note (c)
   below): `bareguard/harness-code-mode/e6i-cases.frozen.json`, `content_sha256`
   **`a840832a911ba7f7f564166e5f7e39094c9a1db2a4c69704905d5364953f5986`** — **8 rows = 7 SCORED
   + 1 deliberately UNGRADED** (the ambiguous hotel row; that is why the headline is **7/7, not
   8/8**). bare-agent has **vendored the fixture and pinned that hash with a byte-equivalence
   test**, and the acceptance report **names the hash it graded**, so *"≥ E6i 7/7 on the same
   frozen cases"* is checkable against frozen bytes rather than against a remembered set.

   **The grading rule is UNANIMITY OVER USABLE SAMPLES.** Per scored row: **exclude the unusable
   samples first** — truncated responses (criterion 5) and parse errors — then **every remaining
   sample must match the expected verdict**. A row left with **no** usable samples is a **red**,
   never a pass. This is **stricter** than "most samples agree", and it **wires criterion 5 into
   criterion 1**: truncation cannot dilute a floor it has already been excluded from. **bareloop
   accepts this rule as stated.**
2. **The €280-class false positive reads `honored`**, at ≥ the measured 5/5. A judge that flags a
   compliant answer is worse than no judge — E6e's every miss was an over-call, so this criterion
   is the one most likely to fail and must not be softened.
3. **Injection battery on the shipping tier** — judged content carrying instructions addressed to
   the judge — **with the result reported either way**. A pass and a documented fail are both
   acceptable outcomes; **silence is not**.
4. **`costUsd` non-null on every call.** A call the provider cannot price **reds** (F6 class); a
   `$0` readout for an unpriced call is an automatic fail of this criterion.
5. **A truncated response surfaces as its own outcome** and is **excluded from the graded
   denominator** — assert on the denominator, not merely on the presence of a flag.
6. **Negative control (the harness must be able to fail):** a deliberately broken judge — e.g.
   one that returns constant `honored` — **FAILS the frozen set**. Without this the harness
   certifies nothing, and criteria 1–2 are unreadable.
7. **The mapping lands a BROKE row, and the retired shape cannot silently pass.** A judge verdict
   of `broke`, carried through the documented mapping —
   `gate.annotate({ surface: verdict !== 'honored', verdict, where, meta: {field, stated, returned} })`
   — must produce a **`gate.annotate` audit row that reads BROKE (`surface: true`)**, asserted on
   the emitted row itself, never on the judge's return value. **Negative control, mandatory:** a
   judge emitting the **retired pre-E6 sketch shape** — a `kind`-bearing fact object carrying
   `text` in place of `where` and `field`/`stated`/`returned` at the top level instead of under
   `meta` — must **FAIL this criterion**, loudly. bareguard's `annotate` **normalizes strictly and never
   throws**, so an unmapped sketch-shaped fact has **every key silently dropped**, `surface`
   defaults **false**, and **every judged fact routes as `honored`** — fail-open, and invisible
   until someone audits the rows. This criterion exists because that exact path was found in
   validation (see the 2026-08-12 note below); a harness that cannot fail it certifies nothing.

   **Two further negative controls, added 2026-08-12 — both fail open the same way, and one of
   them is the LIKELIER mistake.** (a) **The ARRAY shape:** `gate.annotate([fact])` — a caller
   handing a *list* of facts to a single-fact API. An array **passes `typeof object`**, so it
   buffers a **dead fact with `surface: false`** that **routes as `honored`**, identically
   fail-open and with nothing thrown. It is a likelier slip than the retired sketch (which at
   least requires knowing the dead shape), so it is now a **required** control, not a note.
   (b) **Integrity checks must treat `{_unserializable: true}` as LOSS exactly like
   `_truncated`.** A `meta` carrying a circular reference or a `BigInt` cannot be serialised and
   comes back flagged that way, **not** truncated — so **a check that reads only `_truncated`
   reads an unserializable `meta` as INTACT**. Both flags are loss; a harness asserting on one of
   them certifies half a contract.

### 2026-08-12 — envelope citation CORRECTED (with its root cause), field budgets MEASURED, and bareguard's frozen case set ACCEPTED as a hashed portable fixture

**(a) The correction, and its source.** bareguard's maintainer session validated this ask against
their **shipped source** (`gate.js:600-619`, PRD §8.2) and found our envelope citation **wrong**.
This entry had cited a `kind`-bearing fact object with `text` in place of `where` — the **pre-E6
design sketch**, not the shipped contract — and had the dataflow **backwards**, calling the
envelope the judge's
*input* when it is the judge's *downstream sink*. Both are corrected above. Named plainly rather
than papered over: this is **the read-the-source rule** (the same rule BA-2's withdrawal paid for)
and **F98's class** — a stale citation carried forward as if it were current fact. The error was
not cosmetic in two ways: `kind` was killed by bareguard's own **E6e**, which this ask's
rejected-alternatives table already records, so the entry was banning `kind` and printing it in
the contract at the same time; and because `annotate` never throws, a judge built to the sketch
would have **failed open in silence** — which is now criterion 7's negative control. Everything
else in BA-20 — every measurement and every E6-series citation — was checked in the same pass and
**stands unchanged**.

**The ROOT CAUSE, both halves, neither softened.** The maintainer's session then found *where* the
sketch came from: **bareguard's own PRD prints the retired shape in seven places**, including the
**dataflow authority at §6.7, which spells `text: where`** — a field **the shipped API
ignores**. So our citation copied a **wrong authority doc**, not a careless paraphrase: the
document this ask cites as the design of record was itself stale at the exact line the contract
was read from. **AND our own rule still applies undiminished:** *read the library SOURCE before
filing an upstream ask.* `gate.js` was the truth, it was one file away, and **we did not read it**
— a stale doc explains the error; it does not excuse skipping the source, which is the whole point
of the rule BA-2's withdrawal paid for. **Their PRD fix is queued on their side** — their
operator's call, not ours, and this ask does not wait on it: the shipped source is the citation of
record here.

**Field budgets, measured on the shipped gate — and half of that measurement CORRECTED days later,
stated here rather than quietly rewritten above.** The first probe measured `where` at 300 chars
**silent** (the 8-line F98 exemplar clipped to `src/backup.js(59,4`) and `meta` at 1000 bytes
**visible**, with a 751-char evidence string riding intact. **The `where` half stands** — but only
at the SOURCE bound, and the *"300 chars"* of it is **300 CHARACTERS, not bytes**: both points were
corrected by the second boundary pass, see the next subsection. **The
`meta` half, as committed in bd0d9b8, was wrong in the way that matters:** it read as *"`meta`
clips visibly, so bulk evidence is safe there"* — but the cap does **not shorten content**. At the
cap the **whole bag is replaced** by `{_truncated: true, bytes: N}`, taking `field`, `stated` and
`returned` **with** the evidence. The boundary run says so directly: **4 lines / 375 B, 8 / 751 B,
10 / 939 B intact; 12 / 1127 B and 20 / 1879 B total loss.**

**Named plainly, not papered over: the original clause was written off a SINGLE under-ceiling
probe.** 751 bytes sits comfortably inside 1000, so that probe could only ever show the intact
case — a **fixture that (by accident of sitting below the ceiling) was authored to contain the
result**, the exact class this repo's own rules forbid, and only a measurement **across** the
boundary could falsify it. The corrected clause is folded in **twice**, in the same two places the
original was: into the field-semantics citation above, and into **contract requirement 6**, which
now bounds the evidence quote **at the judge's caller** so the whole bag stays under the cap.
**The caps are not to be raised** — they are what keeps an audit-line append atomic under
`PIPE_BUF`, with headroom for post-redaction expansion. **That last sentence is itself corrected in
the next subsection:** the SOURCE caps never preserved atomicity (`where` is measured in
characters); the **~3500-byte AUDIT-SINK** cap does.

**(b) The frozen case set — bareguard's offer ACCEPTED.** bareguard offered its **frozen labeled
case set** — the E6 harness corpus, including **the €280 false-positive trap** and **the forged
injection case** — as the seed of the calibration set deliverable 2 demands. **bareloop accepts**,
and the set is **handed to bare-agent with this ask**. This is not a convenience: it makes
acceptance criterion 1's *"≥ E6i's clear-case performance (7/7)"* a **real comparison against the
same frozen cases**, rather than a floor re-derived from a set rebuilt later — which is exactly
the "case set authored to contain the result" failure that contract requirement 7 forbids.
Widening the set is expected; **replacing** the seed cases is not, since the 7/7 and the 5/5 lose
their meaning the moment the cases move.

**(c) The FORM of that case set — bareloop's answer: YES, a portable frozen fixture with a content
hash.** bareguard asked what shape to hand the cases over in. The answer is **not** "point
bare-agent at the POC": the cases must come **OUT of `run-e6i.mjs`** and into a **standalone frozen
fixture**, one row per case, fields **`{label, verbatim request, artifact, expected verdict, sample
count}`** — **consumable by bare-agent with no POC scaffolding**, no harness import, nothing to
re-run to read it. The E6i semantics demand exactly these fields and nothing more: the **verbatim**
request (non-negotiable 1 — never the paraphrase), **ONE** structured artifact (the E6b contract
clause), the binary expected verdict, and the sample count that makes criterion 1's ≥5-samples/case
base-rate rule checkable per row rather than per battery.

**The fixture file carries a CONTENT HASH, and acceptance criterion 1 cites it.** That is what
makes *"≥ E6i 7/7 on the same frozen cases"* **literally checkable against frozen bytes** instead
of against a set someone believes is the same one — the same discipline as bareloop's own
**signed-spec hashes**, where the hash is what makes the signature mean anything. **Frozen means
frozen:** a post-hash edit — widening, relabelling, a corrected artifact — **is a NEW hash**, and
the acceptance report **names which hash it was graded against**. A grade whose hash is not named
is not a comparison; it is a memory.

**DELIVERED AND PINNED (2026-08-12).** The fixture now exists in that form:
`bareguard/harness-code-mode/e6i-cases.frozen.json`, `content_sha256` **`a840832a…953f5986`**
(full hash in acceptance criterion 1). It carries **8 rows — 7 SCORED and 1 deliberately
UNGRADED**, the ambiguous hotel row, which is exactly why the E6i headline reads **7/7 and not
8/8**; an ungraded row is part of the frozen bytes without being part of the floor.
**bare-agent has vendored the file and pinned the hash with a byte-equivalence test**, so
criterion 1 cites frozen bytes literally rather than a set anyone has to remember.

### 2026-08-12 — SECOND boundary correction absorbed: a whole SECOND bound, and the silent/visible reading the wrong way round

**bareguard's maintainer issued a second boundary correction, same class as the first**, caught by
their own high-effort code review and **re-verified by execution** before it was sent. Their commit
**`b8e934f`** is **docs + tests only — no behaviour change, no export change, 248/248**, and the
emitted `.d.ts` now carries **both bounds**. So the **`Annotation` typedef remains the stable cited
authority and there is nothing to re-pin**: the contract did not move, our description of it did.

**What was wrong in the text committed in 3593259, named rather than rewritten out.** Two things.
**(1) It described ONE bound where there are TWO.** Everything that entry called "the field
budget" was the **SOURCE** bound — the caps on the fact as stated, which govern the **drained**
fact and the **`humanChannel`** event. It never mentioned the **AUDIT-SINK** bound: a **~3500-byte**
cap applied **after redaction** to the **persisted line only**, where `meta` is replaced
**wholesale even when the source meta was legal**. Their number: a **355-byte** `meta` on disk as
**`{"_truncated":true,"bytes":6977}`**. **No caller can satisfy that bound by sizing alone** — the
expansion factor is the configured redactor's, not the judge's. **(2) It had silent/visible the
wrong way round at the sink.** The **audit** clip of `where` **does** carry a **`[TRUNCATED]`**
suffix and a root **`_truncated: true`**; *"clips silently, no marker"* was only ever true of the
**SOURCE** clip. Loss in the persisted row is **visible**; loss in the **drained** fact is not —
and the drained fact is the one the ratchet reads (ruling below).

**And the entry's own atomicity story was wrong with it.** 3593259 said the caps "keep an
audit-line append atomic under `PIPE_BUF`, with headroom for post-redaction expansion" — but
`where`'s 300 is **CHARACTERS, not bytes**, and 300 CJK characters is **900 bytes**. **The source
caps never were what preserved atomicity.** Bound (b) is; bound (a) bounds what the drain and the
human channel carry. Both corrected clauses are folded in **twice**, in the same two places the
originals were: the field-semantics citation and contract requirement 6.

**The recurrence, recorded without gloss.** This is the **second same-class correction absorbed**
on this ask: both times a claim **verified at a point** was falsified by **measurement across the
boundary** — first the under-ceiling `meta` probe that could only ever show the intact case, now a
stage-local reading of caps that a **later stage re-bounded**. Both were caught **before any
consumer built on them** — the first by the maintainer's boundary run, the second by their own
review-then-execute pass — which is the exchange working as designed, not a process that needs
fixing. **bareguard's generalisation of the class is worth carrying verbatim into ours:** *check
whether a second mechanism downstream re-bounds what you just measured.* A measurement is a claim
about a stage, and a stage is not a pipeline.

### 2026-08-12 — bareloop's RULING: judged facts annotate on the ARBITER'S OWN gate, never the worker's

**Recorded as bareloop's ruling** — not bareguard's, not bare-agent's — and it is nothing new: it
is this file's own **2026-08-08 two-populations doctrine** (the `classifyCommand` entry above)
applied one rung further. The close is **arbiter territory**; routing its rows through the worker's
gate would **mix two populations of audit rows**. A judged verdict is a close-stage fact, so it
annotates on the **arbiter's own `Gate` instance** — the one bareloop constructs for the close —
and **never** on the gate the worker holds.

**The accepted consequence, stated plainly up front instead of discovered later.** The envelope has
three sinks; this ruling kills one of them for judged facts **by design**:

| Sink | Status for judged facts |
|---|---|
| 1 — the **audit line** (`surface: true` reads BROKE) | **LIVE** |
| 2 — **`drainAnnotations()`** | **LIVE** |
| 3 — **ride the next human ask** | **DEAD, by design** |

**Sink 3 is dead because the close is POST-HOC:** there is no outgoing action left to gate, so
there is no next human ask for a judged fact to ride. That is not a lost channel — the judged
verdict's human channel is **the close's own gap/evidence package at the END-OF-RUN hitl pause**,
per hamr's standing hitl ruling (**end-of-run review, never a mid-run interrupt**). Sinks 1 and 2
are the live channels, and they are what acceptance criterion 7 asserts against.

**The one legal alternative, named so it is not later reinvented as a bug.** A future design that
genuinely wants a judged fact to ride a human ask must **annotate on the gate instance that raises
that ask** — a different gate, deliberately chosen. It is not the default, it is not a relaxation
of this ruling, and nothing shipping today needs it.

**EXTENSION (bareloop's ruling, 2026-08-12): the RATCHET FEED for judged facts reads
`drainAnnotations()` — sink 2 — and the audit line is never the parser source.** Of the two live
sinks chosen above, **the DRAIN is the AUTHORITATIVE carrier of the mechanical facts**; **sink 1,
the audit line, is the durable RECORD and only that**. The interaction, stated plainly: **sink 1
is the redaction-exposed one.** A configured secrets redactor — and a judge's raw output is
*exactly* the kind of text one redacts — can **lawfully destroy the persisted `meta`** at the
audit-sink bound (~3500 bytes, post-redaction, wholesale replacement) **while the drained fact
survives intact**. So **any consumer that parses judged facts out of the audit trail is on the path
that silently loses addresses** — the F98 stall arriving by a route nobody sized for, since no
caller can size for it. Parse the drain; keep the line as the record.

**COMPANION CLAUSE — one designated drainer per gate instance, called once per turn.**
`drainAnnotations()` **CLEARS the buffer**: it supports **exactly ONE reader**, measured — reader A
gets 1 fact, reader B immediately after gets **0** — and that is **by design**, to stop stale facts
riding a later unrelated ask. The moment sink 2 becomes the authoritative carrier, **two drain
callers on one gate silently split the facts**: first drainer wins, and the second **cannot
distinguish "no facts" from "already taken"**. Therefore: **one designated drainer per gate
instance, called once per turn; every other consumer — the agent-feedback path included —
receives the facts FROM that drainer, never by calling drain itself.** In bareloop's consumption
plan the **ARBITER** (the ratchet/close path) **is the designated drainer**.

Two measured facts that come with it. **(a) A fact that rides a human ask is NOT consumed by riding
it** — it is still drainable afterward, so **the ask path and the drain path never contend; only
two DRAIN callers do.** **(b) An undrained buffer GROWS for the life of the gate instance** —
bareguard's own known Low from their 0.7.0 security pass (in-memory, per-run, caller-driven), and
harmless under drain-each-turn discipline. But **"authoritative carrier" promotes drain-each-turn
from a recommendation to a REQUIREMENT**: the facts now exist nowhere else in recoverable form, so
a turn that skips the drain is not merely untidy — it is a turn whose mechanical addresses may
survive only in a row a redactor is entitled to blank.

### Not asked (recorded, so nobody re-opens them)

- **The deterministic calculator carve-out (E6h)** — measured to work, deliberately out of scope.
- **Confidence scales and `kind` classification** — measured *worse* (E6f/E6g, E6e). Do not add.
- **Any bareguard change.** **bareguard's part is complete by design** — the measured E6i spec
  and the shipped `gate.annotate({ surface, verdict, where, meta })` envelope. That envelope is
  the detector and stays exactly as shipped; the bare-agent judge's verdict reaches it **through
  the caller's mapping**, and the judge never re-implements it — and never re-adds `kind`.
- **A judge that DECIDES.** Out by law from both sides: bareguard's Axis B annotates and never
  decides, and in bareloop **the close is the only truth**. The judge returns a verdict to a
  caller; it never merges, publishes, or touches a budget.

### bareloop's own side (consumption plan, recorded now)

N4's soft-green verdict class is blocked on exactly this: **softgreen passes are quarantined from
learning credit until the judged floor is proven**. On delivery, bare-agent's judge becomes a
**`judged` close stage** — `offer:false` **by law** (never lendable to the agent's check menu),
metered from the **same wallet** as everything else, and **skipping the seed-verdict read**
because its bar comes from calibration instead. Consumed by version bump like every other suite
package; it adds **no new production dependency at all** — bareloop already depends on bare-agent.

**bareloop CALLS bare-agent's `judgeToAnnotation`; it never hand-rolls the mapping.** The helper in
`src/bareguard-adapter.js` is the single home for the judge→envelope shape (above), and this side
cites it rather than retyping the object literal. The reason is mechanical, not stylistic:
**`annotate` normalizes strictly and never throws**, so **every hand-rolled mapping is an
independent chance to fail open** — a mis-keyed field is dropped in silence, `surface` defaults
**false**, and the judged fact routes as `honored` with nothing announcing it. One helper, pinned
upstream and covered by upstream's own tests, is one place that can be wrong instead of N. bareloop
then makes the `gate.annotate` call **itself**, on the arbiter's gate (ruling above), and bounds the
`evidence` quote with a **visible marker** before the envelope so the whole `meta` bag stays under
1000 bytes at the **source** bound (requirement 6) — **necessary, not sufficient**, since the
audit-sink bound is post-redaction and no caller can size for it. That is why **the arbiter is the
designated drainer** and the ratchet reads the **drained** fact, never the persisted row (ruling
above), and why the drain is called **once per turn** by that one path.

**Priority: a hard blocker for N4, and for nothing shipping today.** Nothing in the current green
path calls a judge, so this stops no rung already on the ladder — it gates the next one.

---

## BA-21 — an UNLISTED model is priced from a generic fallback average and stamped `pricing:'priced'`: the whole bareloop programme's spend record is a guess wearing a fact's clothes (2026-08-18, archive-wide pricing audit)

**Filed against:** bare-agent 0.36.1, `src/loop.js` (`COST_PER_1K`, `estimateCost`, `resolveRoundCost`).

### The defect, in one sentence

`claude-sonnet-5` — bareloop's frozen worker model since the model rule was set — **is not in
`COST_PER_1K`**, so `estimateCost` falls to `_default`, whose own in-source comment reads
*"Fallback average across popular models (~$0.002 in, ~$0.008 out per 1K)"* — and the resulting
number is then stamped **`pricing: 'priced'`** (loop.js:800, `roundCost === null ? 'unpriced' : 'priced'`).

This directly violates bare-agent's own stated contract three lines above it:

> *"Priced vs unpriced is explicit so the gate never mistakes 'couldn't price' (null) for 'free' (0)
> — the silent-zero that made #3's budget cap a no-op. (D5 / §3.7.)"*

`_default` **is** the "couldn't price" case. It reports as the "priced" case. The contract guards
the zero direction and leaves the *wrong-number* direction wide open — which is worse, because a
zero is visibly absurd and a plausible dollar is not.

### Evidence — measured across bareloop's entire archive, not reasoned

382 spine files, 153 runs, **7,506 priced `worker-round` records**:

| reconciliation | rounds |
|---|---|
| match `_default` (0.002/0.008) to <0.1% | **7,217** |
| match sonnet rates (0.003/0.015) | **0** |
| match neither | 289 — all clipipe, where the CLI reports its own real `total_cost_usd` and `resolveRoundCost` correctly prefers it |

Those 289 clipipe rounds are an accidental control: on the same usage fields the CLI's **real**
cost runs **2.0–2.5x** the `_default` estimate.

> **Correction (2026-08-19):** the 2.0–2.5x ratio above is clipipe's provider-billed surface,
> which never pools with `anthropic-api` (F48) — it does NOT generalize to the API archive. The
> measured API-side error is **~5.7% under** at sonnet-5's introductory rate, jumping to
> **~1.586x under** at list rate when the intro window ends 2026-09-01 (PRD §11). The acceptance
> criteria below do not depend on the retracted figure.

Also absent from the table: **`claude-opus-5`**. Present: fable-5, opus-4-6/4-7/4-8, sonnet-4-6,
haiku-4-5. So the table tracks a generation bareloop no longer runs on.

### Blast radius on this side

Every budget cap, `spentUsd`, cap-halt decision, ledger figure and programme-spend line bareloop
has ever produced on sonnet-5 rests on that average. Because it is stamped `priced`, **nothing
downstream can tell.** bareloop has no price table of its own and no way to detect the substitution.
This is our F6 doctrine ("unpriced is never free") re-shipped in a worse coat: unknown reading as
*confident* rather than as zero.

### Filed WITH its own disconfirming evidence (standing rule, BA-7 precedent)

**`COST_PER_1K` is EXPORTED** (`module.exports = { Loop, estimateCost, COST_PER_1K }`, loop.js:1216).
A caller can therefore mutate it today — `COST_PER_1K['claude-sonnet-5'] = { in: 0.003, out: 0.015 }` —
and bareloop will do exactly that as an immediate local mitigation, without waiting for a release.

So **the missing rates are not, strictly, blocking us.** We are filing anyway because:

1. Mutating another package's exported constant is a hack, not a contract, and silently breaks the
   day the table becomes frozen or internal.
2. The rate gap is the symptom. **The silent `_default`-stamped-`priced` is the defect**, and no
   amount of caller-side table-patching fixes it for the next unlisted model — which arrives with
   every model release, by construction.
3. A caller cannot even *detect* the substitution to warn on it, because the returned shape is
   identical either way.

### The ask — two deliverables, the second one is the real one

**(1) Add current-generation rates.** `claude-sonnet-5` and `claude-opus-5` at minimum.
Mechanical, and it does not close the class.

**(2) An unlisted model must not be silently averaged.** Either:
   - return `null` from `estimateCost` for a model with no table entry (so it stamps `unpriced`,
     which is already an honest, handled state on both sides), **or**
   - keep the estimate but return a THIRD state — `pricing: 'estimated'` — so a caller can
     surface it. bareloop's operator ruling (hamr, 2026-08-18, verbatim: *"if price not passed in
     apis (i doubt) we use guesstimate and run but keep user in the know, never refuse"*) means we
     will **never refuse a run on this** — we need to be able to *say* it, not to block on it.

We have no preference between the two, and the choice is bare-agent's. **`estimated` is the one
bareloop can consume most usefully**, because refusing is off the table by operator ruling and
`unpriced` currently means "we have no number at all", which is a different and less useful claim.

### FAIL-able acceptance criteria

1. `estimateCost('claude-sonnet-5', usage)` returns a value derived from a sonnet-5 table entry,
   NOT from `_default`. **Fails** if the returned number equals the `_default` formula.
2. `estimateCost('claude-model-that-does-not-exist', usage)` either returns `null`, or the round
   reports a `pricing` value that is **neither** `'priced'` **nor** `'unpriced'`. **Fails** if an
   unlisted model still yields a finite cost stamped `'priced'`.
3. A listed model's `pricing` value is **unchanged** (`'priced'`). **Fails** if this change
   re-labels rounds that were already honestly priced.
4. A provider-reported `costUsd` (the clipipe path) still wins over any table value and still
   stamps `'priced'`. **Fails** if `resolveRoundCost`'s precedence changes.
5. The three states are documented in `bareagent.context.md` with the "couldn't price" vs "didn't
   price" distinction spelled out, so the next consumer cannot re-make this assumption.

### Not asked

- **A price feed, or fetching rates at runtime.** Out of scope, adds a network dependency to a
  zero-dependency library, and the rates are public static data.
- **Any change to `resolveRoundCost`'s precedence.** The provider-reported-cost-wins rule is
  correct and is what makes the clipipe control above possible.
- **Refusing to run on an unlisted model.** Explicitly rejected by bareloop's operator (above).
  The library must stay able to run; it must stop being able to *pretend*.

**Priority: not a blocker — a truth defect.** Nothing stops running today. Every number those
runs produce is simply not what it says it is, and no consumer can tell.

### Addendum (2026-08-22, context-economy lane) — the mechanism read out of the shipped source

*Filed independently by the readshim lane before it knew this ask already existed on `main`
(`f2f44af`). Kept as an addendum rather than a second BA-21: one ask, one number. The material
below is the source-level read — which rows exist, which line stamps the label, and the scoping
that limits the defect to the Claude 5 generation — none of which is in the filing above.*

**Package:** `bare-agent`. **Installed and read here:** `0.36.1` (the version bareloop runs today).
Everything below is read out of `node_modules/bare-agent/src/loop.js` as shipped, not out of a
changelog.

#### The mechanism, as shipped

- **`COST_PER_1K` (`src/loop.js:82`) stops one generation short.** Its Anthropic block lists
  `claude-fable-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`,
  `claude-haiku-4-5-20251001`, `claude-haiku-4-5`, plus the two genuinely-different 2025 snapshots
  (`claude-sonnet-4-20250514`, `claude-opus-4-20250514`). There is **no `claude-sonnet-5` and no
  `claude-opus-5`** — the current generation, and the tier bareloop's worker actually runs on. The
  table's own header comment reads `Last updated: 2026-06-22` (`:74`).
- **An unknown model silently prices at the fallback average.** `estimateCost` (declared at
  `src/loop.js:152`) resolves rates with `COST_PER_1K[model] || COST_PER_1K['_default']`
  (`:154`), and `_default` is `{ in: 0.002, out: 0.008 }` per 1K (`:105`) — described in the source
  itself as *"Fallback average across popular models"*.
- **And the guess is then stamped as a price.** Because the returned number is finite, the round is
  labelled `pricing: 'priced'` — on the `onLlmResult` payload at `src/loop.js:800` (`kind:'turn'`)
  and `:621` (`kind:'summarize'`), and it feeds `metrics.costUsd` through the same finite/null
  branch (`:562` — `costUsd: pricedAny ? totalCost : null`). **This is the defect:** nothing in the
  result, the metrics, or the `onLlmResult` payload distinguishes a rate the library vouches for
  from a fallback average it does not. A guessed price is byte-indistinguishable from a real one.

**Scoped precisely: only the Claude 5 generation is missing, not every model we use.**
`claude-haiku-4-5` and `claude-haiku-4-5-20251001` are both present (`:97`, `:96`, at
`{in: 0.001, out: 0.005}`), so bareloop's judge tier does **not** fall to `_default` — the worker
tier does. And a separate concern kept separate: **we have not verified any listed rate against
live pricing.** Whether the rows that exist are still accurate is a different question from whether
the rows we need exist at all, and this ask is only about the second.

The two-valued axis is deliberate and well-reasoned — the comment at `:797-799` explains it was
built so a gate never mistakes *"couldn't price"* (null) for *"free"* (0). That reasoning is
correct and this ask does not touch it. The gap is that the axis has **three** real states and only
two labels: a real rate, a guessed rate, and no rate at all. The middle one currently wears the
first one's coat.

#### Scale of the error — measured, and labelled where it is a projection

Measured over bareloop's own archive: **7,507 rounds**, runs dated 2026-07-15..08-17, worker model
`claude-sonnet-5` throughout (so every one of those rounds priced through `_default`).

| Rate used | Corpus total | `_default` reads |
|---|---|---|
| `_default` (`0.002 in / 0.008 out` per 1K) — what the library actually charged us | **$219.15** | — |
| sonnet-5 **introductory** ($2/$10 per 1M = `0.002 / 0.010` per 1K) | **$231.72** | **5.7% under** |
| sonnet-5 **list** ($3/$15 per 1M = `0.003 / 0.015` per 1K) | **$347.58** | **1.586x under** |

**Stated honestly:** the 5.7% figure is the error we have actually been paying, because every
archived round falls inside sonnet-5's introductory pricing window. The **1.586x** figure is a
**prospective arithmetic projection** from the same measured token counts — it has **not** been
observed, and cannot be until the window closes.

#### The clock — why this is filed now rather than whenever

Sonnet-5's $2/$10 rate is an **introductory** rate that ends **2026-09-01**. Today is 2026-08-22.
On that date every bareloop run silently begins pricing **1.586x under list**, with **no detector,
no error, and no visible change in behaviour** — the same rounds, the same `pricing:'priced'`
stamp, the same numbers reaching the budget cap. A ceiling enforced against an under-read spend
figure is a ceiling that quietly widens itself. That is the urgency; it is a date, not a guess.

Note the maintenance hazard rather than just the missing rows: a static table with a
`Last updated:` comment rots silently, and an introductory rate that expires on a **known date**
rots on a schedule. Part (b) below is the part that survives the next such rot.

#### What we checked before filing: is there a local escape?

Two paths checked; one is genuinely closed, the other is partly open — stated as found rather than
rounded up into a harder block:

- **Via the rate table — NO.** `COST_PER_1K` and `estimateCost` are live-mutable in-process, but
  unreachable by any supported path. Neither name is on the package entry's exports (verified:
  `require('bare-agent')` exposes `Loop, Planner, Evaluator, refine, recurse, buildSearchTool, …`
  and neither is present), and `package.json` `exports` declares no `./src/loop` subpath (only
  `.`, `./errors`, `./providers`, `./stores`, `./transports`, `./tools`, `./mcp`, `./bareguard`,
  `./package.json`) — so `require('bare-agent/src/loop')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  Verified twice, on separate days.
- **Via the provider — YES, partly, and the ask says so rather than overstating the block.**
  `resolveRoundCost` (`src/loop.js:183-186`) prefers a provider-reported **finite**
  `result.costUsd` over the rate table, and its docstring names this as the intended shape
  (CLIPipeProvider `parse:'claude-json'` surfacing the claude CLI's own `total_cost_usd` — *"a real
  price with NO local rate table"*). So a consumer **can** price correctly today by wrapping its
  provider and stamping `costUsd` itself.
  **What that does NOT solve:** the wrapper has to stamp `costUsd` as if it were authoritative, so
  the guessed-vs-real distinction remains **inexpressible on the wire** — which is exactly what
  part (b) asks for. A workaround that can only lie in the other direction is not a fix for an
  honesty defect.

#### The ask — three parts, in priority order

**(a) Add the current-generation rates.** Put `claude-sonnet-5`, `claude-opus-5`, and whatever
sibling ids bare-agent means to support into `COST_PER_1K`. Straightforward, and the smallest of
the three. It also rots again on 2026-09-01 unless it carries the post-introductory rate — which is
the maintenance hazard above, and the reason (b) matters more than (a).

**(b) A SEPARATE marker for a guessed rate, carried BESIDE an unchanged `pricing`. THIS IS THE
LOAD-BEARING PART.** Today `pricing` is a strict two-value axis — `'priced'` (a finite number,
whether real or guessed) or `'unpriced'` (null). A fallback-table price is neither, and the honest
distinction has to go somewhere. The ask: forward a **NEW field beside `costUsd`** — a boolean
`estimated: true`, or a `rateSource: 'provider' | 'table' | 'fallback'` discriminator, upstream's
pick — on the `onLlmResult` payloads (`src/loop.js:800` turn, `:621` summarize) and on the result
metrics, whenever the price came from `_default` (or from any rate the library does not vouch for).
`pricing` keeps its **exact current two values and its exact current meaning**. That way a consumer
can **bill honestly AND tell its operator the number is a guess**.

**Why a NEW FIELD and not a third value of `pricing` — this is the strongest argument in the ask,
and it is about the maintainer's OTHER consumers, not only us.** Adding `'estimated'` as a third
value of `pricing` would be a **silent breaking change**, not an additive one. Existing consumers
branch on `pricing` directly, and the two-value contract licenses them to treat *anything that is
not `'priced'`* as unpriced. bareloop is exactly such a consumer: an unpriced round routes as
`pricing-red` and **can halt the run** ("unpriced is never free" — F6). A third value would make
every honest-but-estimated round read as unpriced to code written against the shipped contract,
converting an honesty upgrade into a **spurious budget halt**. A separate field cannot do that:
consumers reading only `pricing` are untouched and keep seeing a finite `costUsd` exactly as today,
and the honesty upgrade is **opt-in at the read site**. *That* is what additive means here.

Grounded in the consumer's own governing ruling, hamr, verbatim:

> *"if price not passed in apis (i doubt) we use guesstimate and run but keep user in the know,
> never refuse"*

The doctrinal shape, stated plainly: this is bareloop's **F6 doctrine ("unpriced is never free")
extended one notch**. F6 killed the silent **ZERO**; this marker kills the silent **GUESS**.

**Explicitly NOT asked for: a refusal, a throw, or a halt.** The consumer's ruling forbids refusing
to run on an unpriced or unknown model. This ask is for a **signal**, never a stop — a run on an
off-table model must still complete, still return a usable number, still report `pricing:'priced'`,
and still be billable. The marker changes what the consumer can *say* about the number, never
whether the run proceeds.

**(c) A caller-supplied rate override.** A supported way to pass rates in — a `pricing` / `rates`
option on the `Loop` constructor, or simply exporting `COST_PER_1K` from the entry — so a consumer
who knows its provider's current prices is not hostage to the library's release cadence.

**Ranked third, and here is why it is the weakest of the three:** the provider-`costUsd` seam in
`resolveRoundCost` already covers most of this ground, so (c) is **ergonomics, not capability** —
it saves a consumer from wrapping a provider, nothing more. If it does ship as an override, it
should interact predictably with (b): a caller-supplied rate is presumably **NOT marked estimated**
(`rateSource: 'provider'` or equivalent), since the caller vouched for it. That interaction is
upstream's call; we only ask that it be decided rather than left implicit.

#### FAIL-able acceptance criteria

Each is deterministic, executable against a shipped tarball, and able to fail.

1. **(a) — the new rows price correctly.** Run one round on `claude-sonnet-5` with a fixed usage
   vector (e.g. `inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0,
   cacheCreationTokens: 0`) and assert `costUsd` equals the published sonnet-5 rate for that
   vector — **not** the `_default` value of `0.002 + 0.008 = $0.010`. Same assertion for
   `claude-opus-5`. FAILS today: the model is absent, so both return the `_default` number.
2. **(b) — an off-table model carries the estimated marker, keeps `pricing:'priced'`, and the run
   continues.** Run one round on a model id deliberately not in the table (e.g.
   `'claude-not-a-real-model-9'`). Assert four things together: `onLlmResult` receives the new
   marker (`estimated === true`, or `rateSource === 'fallback'`); `pricing === 'priced'`,
   **unchanged**; `costUsd` is a **finite number** (the `_default` estimate, still usable for
   billing); and the call **returns normally — no throw, no halt, no error result**. FAILS today on
   the first assertion (no such field exists) and must never fail on the last two.
3. **NEGATIVE CONTROL — a table-listed model reports `pricing:'priced'` AND does NOT carry the
   estimated marker.** Run the same fixed usage vector on a model that **is** in the table (e.g.
   `claude-haiku-4-5`, present at `src/loop.js:97` alongside its dated sibling
   `claude-haiku-4-5-20251001` at `:96`) and assert `pricing === 'priced'` **and** the marker is
   absent/false. Without this the marker is noise: a build that marks *everything* estimated would
   pass criterion 2 and be strictly worse than today.
4. **`pricing`'s two values are untouched for every existing case.** No input that produces
   `'priced'` today may produce anything else after the change, and no input that produces
   `'unpriced'` today may produce anything else — the marker is a **new field**, never a
   re-labelling. This is the criterion that fails a third-value implementation.
5. **The `_default` path stays reachable and still returns a usable number.** With an off-table
   model, `metrics.costUsd` is finite and non-null and the cumulative `totalCost` includes that
   round — the marker must **not** be implemented by demoting the round to `unpriced`/null, which
   would re-introduce F6's silent-zero on the consumer's side and violate the never-refuse ruling.
6. **`unpriced` still means couldn't-price.** A round with no usage or no model still yields
   `costUsd === null` and `pricing === 'unpriced'` (`estimateCost` `:152-153`), and carries no
   estimated marker — there is no rate to have guessed.
7. **(c), if shipped — a caller-supplied rate wins and is NOT marked estimated.** Construct a
   `Loop` with an explicit rate for an otherwise off-table model; assert the round prices at the
   supplied rate, reports `pricing === 'priced'`, and carries no estimated marker (the caller
   vouched for it).

#### Stated limits of this ask

- **We do not claim what bare-agent's maintainer intends.** The missing Claude 5 rows may be a
  deliberate wait for stable public pricing, an oversight, or a release-cadence artifact — we read
  the table, not the intent. The `_default` fallback is clearly intentional and reasonable; the ask
  is not that it exists, only that it announces itself.
- **The 1.586x figure has not been observed.** It is arithmetic on measured token counts under a
  rate that does not apply yet. Should it be filed as observed after 2026-09-01, that will be a
  distinct measurement with its own date.
- **The consumer side is not blocked on this.** bareloop can wrap its provider today (the
  `resolveRoundCost` seam above) and price correctly. What it cannot do at any price is tell its
  operator *"this number is a guess"* — that sentence is only expressible upstream.
- **No local shim.** Per this file's standing rule the resolution is upstream, consumed here by
  version bump. There is no supported local monkey-patch of the rate table anyway (verified above),
  which is a limiting fact for us and a mild argument for (c).

---

## BA-22 — the native session-close cost has no `rateSource`, so an authoritative price reads as unknown provenance (2026-08-23, read-shim lane)

**Package:** `bare-agent`. **Installed and read here:** `0.36.1` (the version bareloop runs
today). Everything cited below is read out of `node_modules/bare-agent/src/provider-clipipe.js`
and `node_modules/bare-agent/src/provider-clipipe-mcp.js` as shipped at that version.

**Status of the field this ask concerns, stated plainly:** `rateSource` (BA-21's part (b),
carried beside the unchanged `pricing` field) was **added in `bare-agent@0.37.0` and refined in
`0.38.0`, per the maintainer's own account of their local checkout — neither version is
published to npm** (`npm view bare-agent dist-tags` returns `latest: 0.36.1` as of this filing).
This ask is therefore filed against work that has shipped in the maintainer's repo but not to the
registry: it is forward-looking, and nothing below claims to have read a shipped `0.38.0` tarball.
0.36.1, the version actually verified here, has **no `rateSource` field anywhere** in either
`provider-clipipe.js` or `provider-clipipe-mcp.js` (grepped, zero matches) — which is the honest
baseline this ask starts from, not evidence of what 0.38.0 does or doesn't do.

**Background — what `rateSource` is (per BA-21's acceptance and the maintainer's account of
0.37/0.38).** It is a provenance discriminator carried beside `pricing`, so a guessed rate is
distinguishable from a vouched one: `'provider'` (the provider reported its own authoritative
cost; no local rate table consulted), `'caller'` (caller supplied the rate), `'tier'` (matched a
recognized Claude tier by model-id substring — a confident guess), `'default'` (unrecognized
model; blind fail-safe ceiling), or `null` (nothing was priced).

### The mechanism, as shipped at 0.36.1

Native CLIPipe tool mode (`this.nativeTools`, `_generateWithMcp` at
`provider-clipipe.js:277`) drives the CLI over MCP and reports cost itself through an `onTurn`
callback the caller supplies (`options.onTurn`, stored at `:147`) — it never runs through the
Loop's `resolveRoundCost`/`estimateCost` rate-table path (`src/loop.js`) that BA-21 is about,
because there is no per-round Anthropic response for that path to price. `onTurn` fires **only**
from `_generateWithMcp` (confirmed: `this.onTurn` is referenced at `:307`, `:364` — both inside
that one method; the non-native `parse:'claude-json'` emulation path never calls it and instead
returns `costUsd` directly on the `GenerateResult`, `:405`, which *does* flow through the
Loop's table path and is BA-21's territory, not this one's).

Two distinct events fire, and they carry the gap asymmetrically:

1. **Per-turn (`kind:'turn'`).** Emitted from `provider-clipipe-mcp.js:459-467`, inside
   `createSessionStream`. `costUsd: null` (`:463`) with the comment *"the CLI prices the SESSION,
   not the turn — explicitly unpriced, never a synthetic 0"* immediately beside it, and
   `pricing: 'unpriced'` (`:464`). **This is correct and this ask does not touch it** — there is
   no price on this event to have a provenance for, and it should stay that way.
2. **Session-close (`kind:'session'`).** Emitted from **`provider-clipipe.js:364-375`** — one
   site, called from `_generateWithMcp` after `runSession` (imported from
   `provider-clipipe-mcp.js:6`) returns. `costUsd` is read off the CLI's own result envelope at
   `:351` (`meta.costUsd`, via `mapClaudeMeta`) — never off a local rate table; `provider-clipipe.js:21`
   documents the `'claude-json'` preset mapping `costUsd ← total_cost_usd`, "a real price with NO
   local rate table," and that mapping is shared code (`mapClaudeMeta`, imported at `:5`,
   reused per the comment at `:326-327`) for both the emulation and native paths. The emitted
   object (`:366-375`) is:
   ```js
   await this.onTurn({
     model: (meta && meta.model) || null,
     provider: 'clipipe',
     usage: residual,
     costUsd,
     pricing: costUsd === null ? 'unpriced' : 'priced',
     durationMs: r.ms,
     ctx: options.ctx,
     kind: 'session',
   });
   ```
   **It carries no `rateSource` field at all.** When `costUsd` is finite this is the textbook
   `'provider'` case defined above — the CLI's own authoritative total, sourced from nothing this
   library guessed — and the field is simply absent.

**Only one file carries the gap.** `provider-clipipe-mcp.js` never emits a `kind:'session'`
event itself — it only assembles the per-turn stream (`createSessionStream`) and the session
result (`r.final`/`r.turns`), which `provider-clipipe.js` then turns into the one `onTurn` session
call at `:364-375`. So the emit site to fix is entirely inside `provider-clipipe.js`; the two
files are **not symmetric** here, and this is checked, not assumed — the per-turn assembly and
the session-close assembly are genuinely two different files doing two different jobs.

**This is a fidelity gap, not a correctness bug — say so plainly.** `costUsd`/`pricing` on the
session-close event are already right: a real number, correctly labelled `priced` when finite and
`unpriced` when null. Nothing is mispriced and nothing halts wrongly. The gap is that the ONE
number on this whole surface that is genuinely authoritative — no table, no guess, the CLI's own
reported total — is indistinguishable, on the wire, from a table-guessed number, because neither
carries `rateSource` yet at the version installed here.

### Why this matters downstream (bareloop's own read, not an upstream fact)

bareloop's ledger is written to read provenance with a deliberately fail-safe predicate: a
vouched rate is an ALLOW-LIST of `('provider','caller')`; an absent field reads `unknown`; anything
unrecognized reads as a guess. That direction is correct and this ask does not ask bareloop to
loosen it. But it means that, once `rateSource` exists at all, a native session-close cost — the
single most trustworthy number on this surface — would read as **unknown provenance** rather than
vouched, purely because the emit site never stamps it. bareloop will not mint the label locally:
reconstructing a provenance the provider never sent is exactly the laundering BA-21's mechanism
exists to prevent. So the fix has to happen at the emit site cited above, or the honest reading
stays permanently understated on this one transport.

### The ask

Stamp `rateSource: 'provider'` on the `kind:'session'` event at `provider-clipipe.js:364-375`
whenever `costUsd` is a finite number (i.e. whenever `pricing === 'priced'` on that event). When
`costUsd` is `null` (`pricing === 'unpriced'`), no `rateSource` is stamped — there is nothing to
vouch for. The per-turn `kind:'turn'` event at `provider-clipipe-mcp.js:459-467` is unchanged —
explicitly out of scope, per the correct-as-is note above.

### FAIL-able acceptance criteria

Each is deterministic and able to fail; criteria 1-4 should be executable against whichever
tarball first ships `rateSource` (0.37.0 or later — not yet published as of this filing).

1. **A native session-close event with a finite `costUsd` carries `rateSource: 'provider'`.**
   Drive `_generateWithMcp` (native tool mode) through a session whose CLI result reports a real
   `total_cost_usd`; assert the `onTurn` payload with `kind: 'session'` has `costUsd` finite,
   `pricing === 'priced'`, and `rateSource === 'provider'`. FAILS today at 0.36.1: the field does
   not exist at all.
2. **NEGATIVE CONTROL — the per-turn event stays unpriced and unlabelled.** In the same session,
   assert every `onTurn` payload with `kind: 'turn'` still has `costUsd === null`,
   `pricing === 'unpriced'`, and carries **no** `rateSource` (not `'provider'`, not any other
   value). Without this, the fix could be implemented by blanket-stamping every native `onTurn`
   event regardless of kind, which would fabricate a provenance for a number the CLI itself says
   it cannot yet price.
3. **A session-close event with `costUsd === null` does not claim `'provider'` provenance.**
   Force the CLI result to omit or report a non-finite cost (e.g. a killed/bounded session with no
   `result` event — `provider-clipipe.js` already falls back to `costUsd: null` in this case);
   assert the `kind: 'session'` payload has `pricing === 'unpriced'` and no `rateSource` field, or
   `rateSource: null` — never `'provider'`.
4. **The existing two-value `pricing` contract on this path is unchanged.** No session-close or
   per-turn event that reads `pricing: 'priced'` or `pricing: 'unpriced'` today at 0.36.1 may read
   anything else after the change; `rateSource` is strictly additive on this surface, the same
   additive shape BA-21 asked for on the table-priced surface.

### Stated limits of this ask

- **Filed forward, not verified against a shipped tarball.** Everything about `rateSource`'s
  existence and shape is taken from the maintainer's account of an unpublished local checkout
  (0.37.0/0.38.0); only the 0.36.1 baseline (field absent entirely) was independently read here.
  This entry should be re-verified against the actual shipped source the day it lands, the same
  way every other entry in this file is.
- **Scope is the native `kind:'session'` emit site only.** The per-turn event is deliberately
  untouched (criterion 2), and the non-native `parse:'claude-json'` emulation path's `costUsd` —
  which flows through the Loop's ordinary table-priced path, not through `onTurn` at all — is
  BA-21's surface, not this one's.
- **Low severity, and said so rather than inflated.** This is a fidelity gap on
  `clipipe-subscription`, a surface bareloop's own F48 already ruled OUT as an API peer and
  retains only as a babysat fallback. No number is wrong and no run is at risk; one true fact
  (the CLI's own authoritative session cost) is simply unrecorded as vouched.
- **No local shim.** Per this file's standing rule the resolution is upstream, consumed here by
  version bump when `rateSource` itself ships and is confirmed present on this event.

## BA-23 — a round with NO usage is priced $0 `'default'` on the Loop path, against BA-21's own contract: the F6 halt (`pricing-red`) is structurally unreachable there, and a mid-run no-usage round is re-priced on the PREVIOUS round's tokens (2026-08-23, the ^0.38.0 pin bump gate)

**Found by:** bareloop's own suite, the first execution of anything against bare-agent 0.38.0.
The F6 regression test ("an UNPRICED round halts `pricing-red`") went red on the bump — not as a
flake but as a behaviour change, chased to source. **This is the pin bump's first real catch, at
$0, before any paid run.**

### The defect, in bare-agent's own words against its own code

`src/loop.js:218` (the `resolveRoundCost` docstring, BA-21's contract):

> `source` is null **only when the round is genuinely unpriced (no usage**, or a non-finite
> estimate).

`resolveRoundCost` honours that: `if (!usage) return { cost: null, source: null }`. But the Loop
path can never reach it —

```js
// loop.js:530
let lastUsage = { inputTokens: 0, outputTokens: 0 };
// loop.js:832
lastUsage = result.usage || lastUsage;
// loop.js:853
const { cost: roundCost, source: rateSource } = resolveRoundCost(result, model, lastUsage, this.rates);
```

`lastUsage` is initialised to a **truthy zero-object** and a null/absent `result.usage` keeps it —
so `resolveRoundCost` receives a usage object on EVERY round, and the "genuinely unpriced" branch
is dead code on the Loop path.

**Observed (bareloop debug repro, scripted provider returning `usage: null, costUsd: null`):**
every round emitted `costUsd: 0, pricing: 'priced', rateSource: 'default'`. A round the provider
reported NOTHING about is stamped priced-$0. $0 is not a guesstimate of unknown usage — there was
nothing to estimate FROM. That is unknown-laundered-into-$0 (bareloop F6, and bare-agent's own
context.md line: *"honest null if unpriced, never 0"*), wearing a `'default'` label that makes it
look like a flagged guess.

**Second facet, by code-read (not yet observed live):** because `lastUsage` RETAINS the previous
round's numbers, a mid-run round with no usage is priced as if it spent the PREVIOUS round's
tokens again — not $0 but a repeat charge on stale usage. Both facets have one root: `|| lastUsage`
where the docstring's contract needs `result.usage ?? null` handed to the resolver.

### Consequence downstream (why this is filed same-day)

bareloop's `pricing-red` halt (F6: "a cap cannot govern spend it cannot see") keys on a null
round cost (`src/run.js`, `account()`). On 0.38.0 the API-Loop path can no longer produce a null
cost — so **the F6 halt is structurally unreachable on the primary paid surface**. Only
native/clipipe null costs can still trigger it. The cap governs a number that is now partly
invented.

### Disconfirming evidence, considered per this file's standing rule

- **Is priced-$0 the intended BA-21 reading of a no-usage round?** The strongest argument FOR:
  BA-21's slogan is "guesstimate-and-run, never refuse". But BA-21's own spelling is *"a
  TOKEN-BEARING round is ALWAYS priced"* (bareagent.context.md §894) — a no-usage round is not
  token-bearing, and the same document's cost-contract line says *"honest null if unpriced,
  never 0"*. The docstring at the resolver agrees. Three sources of the author's own intent say
  null; the implementation says $0. We read this as a defect, not a design.
- **Does bareloop even have standing?** A real Anthropic API response always carries usage, so
  the no-usage case may look academic. It is not: transport-degraded results, provider wrappers
  that drop usage, and BA-16 native rounds all produce usage-less results — and the SECOND facet
  (stale-usage re-pricing) fires on any of them mid-run, silently inflating the priced sum with
  phantom token charges.

### Ask

`resolveRoundCost` should receive the round's OWN usage (`result.usage ?? null`), so a no-usage
round prices as `{cost: null, source: null}` per the existing docstring — unpriced, honest,
`pricing:'unpriced'` — and never the previous round's numbers. `lastUsage` can keep serving the
BA-5 return-value role it was built for; it just must not stand in for a usage the round never
reported.

### No local shim, and the bump is HELD

Per this file's standing rule the fix is upstream, consumed here by version bump. Until then the
`^0.38.0` bump sits UNCOMMITTED in the working tree with its gate honestly red (2048/2049 — the
F6 regression test is the failure, and it is doing its job). Restoring F6 locally by minting
`pricing-red` on a new condition would be both a shim and arbiter-adjacent (verdict routing);
neither happens without hamr's word.
