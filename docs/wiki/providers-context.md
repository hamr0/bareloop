---
type: reference
title: "Providers, tiers & context economy"
status: stable
sources: [docs/archive/PRD.md]
---

# Providers, Model Tiers & Context Economy

Which providers and model tiers bareloop runs on, why Synthetic and clipipe stay parked/out as evidential peers, and the signed context-economy shape (read shim, litectx selection, pricing honesty) that streamlines the existing baseline without touching the arbiter.

## 1. Model tier floor

The drafter and default worker tier floor is **sonnet (medium tier)**. This was locked after `aurora-u` died plan-red on haiku ($0.05, repeating a mailbox-trap violation verbatim on redraft) while the same signed spec greened on sonnet the same day ($1.86, 11.2min) — the capability edge sits at planning, before execution spend (PRD.md:2186-2203).

At the time of that lock, the per-step `model` menu still offered `haiku` for mechanical steps under a sonnet-authored plan. That was **superseded 2026-08-06**: `STEP_MODELS` became `['sonnet']` and the agent can no longer express a haiku step at all. `opus`/top tiers remain absent from the plan menu (hamr-assigned only), and the runner's `--model` flag stays an explicit operator probe knob — running below the floor is an operator act, its rows are probes, never battery evidence (PRD.md:2186-2203, PRD.md:3212-3485).

### Why haiku came off the agent's menu

hamr's order: *"haiku should be dropped to see if it passes, if it's agent poor work or harness, like always."* A $0 archive read (186 spines, 71 accepted plans, 255 steps) found only 20 steps ever declared a tier at all — haiku: 12 steps, 2 green; sonnet: 8 steps, 5 green (PRD.md:3212-3485).

The change: `STEP_MODELS = ['sonnet']`, with the `model` field/validator branch kept (a plan or bridge declaring `model:"sonnet"` still validates; restoring haiku is a one-token edit). The drafter prompt's `model` line was deleted rather than reduced to a one-item menu. Verified by rendering the real prompt: zero lines match `/model|tier|haiku|sonnet|cheaper/i` in either fresh or replan form. All 10 job spec hashes re-verified unmoved (`jobSpecHash` covers the resolved spec, not `STEP_MODELS`) (PRD.md:3212-3485).

A measured (not controlled) comparison on the same patient and $4/25min envelope:

| | with haiku | sonnet only |
|---|---|---|
| rounds | 120 | 87 |
| wall | 21.8 min | 25.4 min |
| sec/round | 10.9 | 17.5 (1.6x slower) |
| how it ended | struck out at 2 errors, $0.85/~3.2min left | wall-halt at 1 error, $1.44 left |
| reached the outer close? | never | yes, plus 33 fix rounds |

The failure class changed from give-up to still-converging-when-the-clock-ran-out — the binding constraint moved from the ladder to the wall, because better rounds are slower rounds. Stated without gloss: **not a controlled comparison** — the planner picks haiku for steps it judges mechanical, and replanned steps sit on runs already in trouble, confounded in both directions. This is exactly why the tier was removed rather than argued about; it is an attribution probe, not a verdict on haiku, and is reversible in one token (PRD.md:3212-3485).

## 2. Providers

### Anthropic API (baseline)

Every behavioral baseline the programme owns (F39, F46, F47, the batteries, all close-dev gate reads) lives on claude-sonnet via `anthropic-api`. Behavioral/premise experiments must run on the surface where the baselines live — a cheaper or different surface is never conflated with a more capable one (the F48 lesson) (PRD.md:3765-3807).

### Synthetic — parked

Synthetic (synthetic.new) is a flat-rate subscription inference provider ($30/mo, 500 req/5h, 1 concurrent) serving open-source models (Kimi K3, GLM, Qwen, GPT-OSS families) over an OpenAI-compatible API, raised by hamr 2026-08-08 (PRD.md:3765-3807).

**Wiring already exists, no build needed.** bare-agent already ships an `OpenAIProvider` with a custom `baseUrl` option (`provider-openai.js:50`), alongside Anthropic/Gemini/Ollama/clipipe providers; bareloop is provider-agnostic (`runJob` takes the provider as a shell-owned injected binding). Synthetic plugs in with configuration, not a build — an earlier in-session claim that an adapter build was needed was wrong and is corrected here (PRD.md:3765-3807).

**Parked rather than adopted**, per hamr: *"park it to try when all shipped and that we didn't to keep the baseline."* A different model on any evidential run makes the result non-transferable, so the gate-2 POC and everything through ship stays on the baseline provider; the park records the exclusion as deliberate, not an oversight (PRD.md:3765-3807).

Two conditions attached to the future trial, decided now:
1. **Its own provider condition** — like `clipipe-subscription`, a distinct named condition in job-v1's menu; notional cost never pools with `anthropic-api`; budgets do not transfer.
2. **A pricing rule before any governed run** — flat-rate models return no per-token dollar; bareloop halts unpriced rounds (`pricing-red`, F6 — unpriced is never free). A notional $/round or $/token rule must be set before the first governed run, never during one.

It unparks after the product ships; first use is non-evidential by construction (throwaway/volume probing or a cross-model curiosity read), quarantined from findings until hamr rules otherwise (PRD.md:3765-3807).

### clipipe and native sessions

clipipe is its own provider condition, distinct from `anthropic-api`, with no shared budget pool (same rule as Synthetic above) (PRD.md:3765-3807). Notably, the context-economy read model (§3 below) **does not describe native/clipipe runs at all** — no API cache economics apply there; the 11 archived native runs were the worst-fit outliers in the whole replay (actual-vs-predicted ratios 0.03–0.34). If a worker ever routes natively, none of the calibrated context-economy numbers describe it (PRD.md:5401-5635).

## 3. Context economy

Addendum v1.74 frames this as **streamlining an already-healthy base**, not a new rung — hamr's own words: *"i look at it as a streamlining to existing healthy base."* No paid fire was authorized for this package; everything below through §3.6 is a $0 archive read (PRD.md:5401-5635).

### 3.1 Pricing is a guess wearing "priced"'s coat

`claude-sonnet-5` (and `claude-opus-5`) are absent from bare-agent 0.36.1's `COST_PER_1K` table. 7,217 of 7,506 archived priced `worker-round` records match the library's `_default` fallback average to <0.1%; zero match sonnet rates — yet all are stamped `pricing:'priced'`, unknown reading as confident rather than as zero (PRD.md:5401-5635).

hamr's ruling: *"if price not passed in apis (i doubt) we use guesstimate and run but keep user in the know, never refuse."* This mints a third pricing state, **`estimated`**, alongside `priced`/`unpriced`, to surface at the halt readout and job-end; a run is never refused on an unlisted model (PRD.md:5401-5635).

The originally-proposed local mitigation (bareloop setting `sonnet-5`/`opus-5` entries on bare-agent's exported `COST_PER_1K` at startup) is **dead**: `require('bare-agent')` returns undefined for that table and the deep import throws `ERR_PACKAGE_PATH_NOT_EXPORTED` — the strict exports map working as designed. No "proceed independently" path exists; the fix is upstream ask **BA-21**, or nothing (PRD.md:5401-5635).

A same-day correction replaced the original pricing-error estimate: **sonnet-5 underpricing is ~5.7%, not 2–2.5x.** The 2.0–2.5x figure was clipipe's provider-billed ratio on a different billing surface (F48: never pools with `anthropic-api`) — generalizing it to sonnet-5's own mispricing was the error. Proper repricing over the 7,217-row `_default` population: recorded $219.15 (1.000x); sonnet-5 introductory rate $2/$10 per 1M → $231.72 (**1.057x**); sonnet-5 list rate $3/$15 per 1M → $347.58 (1.586x). The introductory rate runs through 2026-08-31, and the whole archive sits inside that window, so 1.057x is the historically honest ratio — **on 2026-09-01 the honest ratio jumps silently to ~1.586x and nothing in the system detects the change** (PRD.md:5401-5635).

A feasibility survey also found bareloop **cannot mint `estimated` today even with BA-21 unlanded**: `planrun.js` forwards `arg?.pricing` verbatim; upstream's mint is a hardcoded binary (`cost===null?'unpriced':'priced'`), so an estimate would be indistinguishable from a known price — the opposite of "keep the user in the know." The marker needs a new field, not a new value in the existing one; candidate sites are recorded (`run.js:307`, `bridges.js` `HISTORY_FIELDS`, a new non-red `ledger.js` category) but nothing is built (PRD.md:5401-5635).

### 3.2 Where the money goes

Across 7,507 rounds (~$236 archive-wide): **76% of all programme spend is the prompt, not the model working** — cache write 41%, cache read 35%, output 24%, input 0.1%. Every admitted token is re-read 10.5x on average; the lifetime cost of admitting one token runs 2.30x the base input rate. Across 150 runs / 6,775 aligned rounds, `shell_read` + `shell_grep` together are 74% of tool-call spend (not `run`, which is locked and out of scope by construction) — `shell_read` alone is 52.8% of cache-write spend and costs 5.4x what `ctx_get` costs per call (PRD.md:5401-5635).

**Rates are the customer's responsibility (ruled 2026-08-24).** No per-model pricing table is
maintained here — upstream guesstimates on the sonnet rate and stamps a loud `tier`/`default`
source, and a customer who wants exact pricing passes caller rates. The rates-passthrough item
this section's own numbers motivated is DEAD — never re-raised (F113 ruling section).

### 3.3 litectx is unused by selection, not by quality

`ctx_recall` returns **zero zero-hit results** across 2,324 calls, median 5 hits — it indexes, chunks per function, and always finds something. Yet when the agent declares its own tool menu explicitly, it includes a litectx verb only **1.4% of the time** (2 of 148 declarations). The retrieval verbs work; the agent simply does not reach for them unless made to (PRD.md:5401-5635).

### 3.4 The signed shape — four levers plus one mandatory guard

- **L1 POINTER** — a re-read of a file unchanged since last delivery returns a pointer, not bytes. Keys on **what was delivered**, never on the path, so a capped first read cannot let the pointer lie "unchanged" for bytes the worker never actually saw (the L4 collision).
- **L2 DIFF** — a re-read after the worker's own edit returns the diff, not the whole file.
- **L3 SIZES** — directory listings carry byte size + token estimate (today `kind\tname` only); without this, no "read only files under X" rule is followable.
- **L4 CAP+STEER** — `shell_read` over **~24KB** returns head + a steer notice to `ctx_recall`/`ctx_get`, mirroring the shipped native `NATIVE_READ_CAP` pattern (native has this at `planrun.js:1589`; the API path never got it). A mechanical 256KB cap already exists and is simply never reached — lowering it is a parameter change, not new machinery.
- **G1 MANDATORY GUARD** — a step granting `read` must also grant `recall` and `get`. Capping raw reads while leaving no retrieval verb would reproduce BA-17 read-blinding on purpose; enforced the same way as the mailbox rule (validatePlan-enforced, not a prose ask) (PRD.md:5401-5635).

### 3.5 Phase 1 result — $0 archive replay

Instrument: position-aware replay over 153 runs / 733 transcript segments off the real gate-audit read sequences. The model initially predicted $135 of read-driven spend against a measured band of ~$85–100 (~1.4x hot); tuning was deliberately stopped rather than fitted, since ratios (not dollars) are the reportable quantity and are robust to a uniform scale error:

| arm | with amplification | tokens-only |
|---|---|---|
| A1 cap + pointer | 77.0% | 71.8% |
| A2 diff only | 3.2% | 4.8% |
| A3 all combined | 78.4% | 74.0% |

Cap alone (63.9%/60.8%) beats pointer alone (46.3%/36.2%) — an earlier read to hamr had this backwards, corrected here. A3 buys only 1.4–2.2 points over A1: diff is nearly redundant on cost once cap+pointer ship, but it must not be killed on cost alone, since this model measures money only and a diff may still help the worker more than a whole file. Money translation, stated as a band: reads drive ~$85–100 of the archive's ~$236; removing 74–78% of that is ~$63–78, roughly 27–33% of everything the programme has ever spent (PRD.md:5401-5635).

**Same-day correction (validation only, nothing built or fired):** the ~1.4x hot residual was explained, not just narrowed — the model implied an 18.7x re-read amplification rate against the 10.5x actually measured archive-wide, a 1.78x-hot error concentrated in that one term (root cause: transcript segmentation missed some resets). The calibrated numbers became the central estimate:

| arm | calibrated (central) | original bracket |
|---|---|---|
| A1 cap + pointer | 75.8% | 71.8–77.0% |
| A2 diff only | 3.6% | 3.2–4.8% |
| A3 all combined | 77.3% | 74.0–78.4% |
| cap alone | 63.1% | 60.8–63.9% |
| pointer alone | 43.9% | 36.2–46.3% |

The finding is the **stability**, not the calibration itself — the conclusion (cap dominates, A3 barely beats A1, diff is cheap-but-not-worthless) is unchanged across a 3x swing in the most uncertain parameter, and survives even at zero amplification (cap still wins 60.8% vs pointer's 36.2%) (PRD.md:5401-5635).

Three named candidates were checked and closed out: "early-run caching-off (F18)" — **refuted** (0 of 147 archived runs lack cache tiers); "worker-side maxBytes" — **unverifiable** from this archive (gate audit records only `{tool}`, not byte counts); "reads admitted whole" — **holds** on the API surface (actual-vs-predicted ratio median 2.00–2.01, under-1 in only 7/125 API runs, explained by file-grew-since-read on TYPES-genre jobs) (PRD.md:5401-5635).

### 3.6 Frozen test design (Phase 2, unfired)

Arms: **A0** (baseline) / **A1** (cap+mechanics: L1+L3+L4+G1) / **A2** (diff only: L2) / **A3** (all combined). Reading stays staged even if code lands together — two levers landing in one pass makes the delta unattributable (standing rule).

- **PRIMARY** — median spend per run, per arm.
- **VETO** — green rate must not drop (cost and capability are separate axes).
- **SECONDARY** — `ctx_recall`/`ctx_get` share of tool calls (did steering actually steer).
- **DISCARD** — provider-red rows are casualties, never evidence.
- **n≥3 per arm** — n=1 on a nondeterministic worker is an anecdote.

**Phase 2 (paid) is not approved.** Budget and patient await hamr's explicit word (PRD.md:5401-5635).

### 3.7 Memory-harness verdict: no build

Zero context-overflow events across 147 archived runs. A conference-talk ranked-decision-ledger idea solves a problem bareloop has never had (corroborates F39/F88 from outside data). The only live borrow: a context-headroom meter (peak prompt tokens per run + a named overflow terminal, never laundered into `provider-red`) (PRD.md:5401-5635).

### 3.8 Standing rules from this package

- **Sequencing:** this package lands after the softgreen rung (v1.71–v1.73), which adds a new spend record type, `judge-round` (`ACCOUNTED_ROUND_TYPES` in `src/run.js`) — mandatory in every future spend-slicing instrument from this point forward, or it becomes the F45 unaccounted-writer class again.
- **Summarize-before-admit is a quality lever, never a cost lever.** Admitting N tokens costs 2.30N over its life; a sonnet summarizer to N/10 nets 0.67N saved, haiku ~1.32N saved; a free slice saves the full 2.07N at zero cost — slicing always beats summarizing on cost; summarizing is justified only where a slice would cut meaning the worker actually needs.
- **Not claimed:** no paid run has fired; no claim the four levers work in practice (the veto has not been read on a single live arm); no new threshold beyond the ~24KB cap already in the signed shape; the arbiter does not move — L4's cap is a tighten-only operator bound, G1 is a validation-gate rule (not agent-authorable), nothing touches budgets, the fence, or merge (PRD.md:5401-5635).

### 3.9 MEMORY-CACHE: the shim's readout (2026-08-24)

Live u-run `mt7g7b68` (F114) closed the question of whether the read shim leaves any trace of
its own: it does not. The gate audit's read rows carry only `args:{tool:'shell_read'}`, and no
spine record type existed for a pointer served, a slice capped, or a re-read refused — the arm
itself (A0/A1/A2/A3) lived only in the driver log, not the spine. hamr's ruling: the shim never
needs to print its **savings** — that question is answered only by the Phase 2 ON/OFF
contrast (§3.6) — but it can report what it **withheld**, for debugging the worker's reading,
at zero marginal cost since the data already rides the existing gate-audit read row
(`bytes`, `served`).

**The record.** One report-only `memory-cache` spine record per armed run — none when the
shim is off; absence is never a fabricated zero, it means the shim was not armed. Fields:

- **re-reads answered from memory** — count of reads served as a pointer (L1) rather than
  bytes, because the file was unchanged since last delivery.
- **reads capped** — count of reads that hit the ~24KB cap (L4) and were steered toward
  `ctx_recall`/`ctx_get`.
- **KB withheld** — bytes not sent to the worker across both classes above.
- **approxTokens** — `bytes / 4`, an **ESTIMATE by name**, never a metered token count; do not
  read it as priced.

**Exactness rule.** A pointer withholds the FULL held size of the unchanged file (the whole
thing was already delivered once, so the whole thing counts as withheld on the re-read). A cap
withholds only the UNSENT TAIL — the head that shipped is not counted as withheld. The diff
lever (L2) is not counted in this record at all; it changes what is sent, not what is
withheld, and folding it in would double-count against the cap/pointer figures.

**Where it prints.** The `run-u.mjs` tail, alongside the `BEHAVIOUR` block, and via
`scripts/behaviour-readout.mjs <audit> [run_id] [spine]` for archived runs.

**The savings rule, restated:** dollars saved are measured only by an ON/OFF contrast of the
same job (§3.6, Phase 2) — this counter says what was withheld, never what was saved. Reading
"KB withheld" as a dollar figure is the exact class of instrument error this programme's
measurement discipline exists to catch.

## 4. Related doctrine surfaced by these addenda

- **The goal must state everything the close will judge.** A run where the worker suppressed a type checker instead of fixing code traced not to agent cheating but to a specification gap: the drafter's exit-slot ceiling (`MAX_EXITS_PER_STEP = 2`, mandatory `tree-changed` pairing) leaves exactly one check slot per step, and the original goal named fewer constraints than the close actually judged. The close still caught every suppressed version mechanically — nothing green was ever minted mid-run — so the doctrine is that a loose goal is a **cost hazard**, never a correctness hazard: an unstated close stage is invisible until a run discovers it at the tail, wallet already spent (PRD.md:3212-3485).
- **Direction, not built:** hamr wants goal/close alignment surfaced in the UI as two split fields ("what you want" / "what done means"), the second visibly derived from the close's own stages — recorded as product direction only, unscheduled (PRD.md:3212-3485).
