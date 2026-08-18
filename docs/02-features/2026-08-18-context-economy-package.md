# Context economy — streamlining a healthy base (plan record)

**Status: shape signed by hamr 2026-08-18. NOTHING IS BUILT. NO PAID FIRE IS AUTHORIZED.** This
is not a new rung — hamr's own framing, verbatim: *"i look at it as a streamlining to existing
healthy base."* PRD Addendum v1.74 carries the ruling ledger; this record carries the numbers
and the plan.

**Provenance:** the investigation opened as a review of an outside conference talk about
context/memory harnesses. The pricing finding below was an unasked-for detour and hamr flagged
it as drift, in-turn. The findings survived his challenge on their own evidence and he signed
both the four-lever shape and the test design. Source ledger (full working detail, self-audits,
peer review):
`/tmp/claude-1000/-home-hamr-PycharmProjects-bareloop/759964c7-5c50-4b95-a88a-35b0997bb833/scratchpad/handoff-ledger.md`
(session-local scratch, not a repo path — this doc is the durable copy of what matters from it).

---

## 1. What was found

### 1.1 Pricing is a guess stamped as fact (F6's class, again)

`claude-sonnet-5` is absent from bare-agent 0.36.1's `COST_PER_1K` table (`src/loop.js:82-105`);
`estimateCost` falls to `_default` (documented in-source as "fallback average across popular
models," $0.002/1K in, $0.008/1K out). 7,217 of 7,506 archived priced `worker-round` records
match `_default` to <0.1%; zero match sonnet's real rates. The 289 non-matches are all clipipe
rows, where the CLI reports its own real cost — an accidental control, and it runs 2.0–2.5x the
`_default` guess. Every one of these rounds is stamped `pricing:'priced'`. bareloop has no price
table of its own; the Anthropic API returns no dollar cost, only token counts, so local
computation is unavoidable somewhere in the stack.

### 1.2 Where the money goes (7,507 rounds, ~$236 estimated archive-wide)

cache WRITE 41% ($97.66) · cache READ 35% ($81.74) · output 24% ($56.21) · input 0.1%. **76% of
all spend is the prompt, not the model working.** Read amplification: every admitted token gets
re-read 10.5x on average; lifetime cost of admitting one token is 2.30x the base input rate. In
150 runs / 6,775 aligned rounds, the tool breakdown:

| tool | calls | spend | share | $/call |
|---|---|---|---|---|
| `shell_read` | 3,559 | $47.57 | 52.8% | $0.0134 |
| `shell_grep` | 2,212 | $19.17 | 21.3% | $0.0087 |
| `ctx_recall` | 1,955 | $3.83 | 4.2% | $0.0020 |
| `ctx_get` | 1,057 | $2.60 | 2.9% | $0.0025 |
| model text (no tool) | 561 | $12.19 | 13.5% | — |

Not `run` (locked, out of scope). Plain file reads and greps are 74% of tool-call spend
together. `shell_read` costs 5.4x per call what `ctx_get` costs — the retrieval verbs are
already cheap; they are simply underused (§1.3).

### 1.3 litectx is unused by selection, not by quality (F19 at the draft layer)

`ctx_recall`: 2,324 calls, **zero zero-hit results**, median 5 hits. It indexes, it chunks per
function, it always finds something. When the agent declares its own tool menu explicitly, it
includes a litectx verb **1.4% of the time** (2 of 148 declarations). This is not a capability
gap — it is a draft-time selection gap, the same shape F19 already named for granted-but-unused
verbs.

---

## 2. The signed shape — four levers + one mandatory guard

| lever | what it does | owner |
|---|---|---|
| **L1 POINTER** | a re-read of a file unchanged since last delivery returns a pointer, not bytes. Keys on **what was delivered**, never on the path (a capped first read must not let the pointer falsely claim "unchanged" for bytes it never saw — the L4 collision). | local (bareloop) |
| **L2 DIFF** | a re-read after the worker's own edit returns the diff, not the whole file. | local (bareloop) |
| **L3 SIZES** | directory listings carry byte size + token estimate; today they are `kind\tname` only, so no "read only files under X" rule is followable without this. | **upstream** (bare-agent's listing implementation) |
| **L4 CAP+STEER** | `shell_read` over **~24KB** (the ledger's number) returns head + a steer notice to `ctx_recall`/`ctx_get`, mirroring the shipped native `NATIVE_READ_CAP` pattern already at `planrun.js:1589` for the native surface. The API path never got it. A mechanical 256KB cap already exists and is simply never reached — lowering it is a parameter, not new machinery. | local (bareloop, API-path seam) |
| **G1 GUARD (mandatory)** | a step granting `read` **must also grant `recall` and `get`**. Measured: explicit tool declarations include a litectx verb 1.4% of the time (2/148) — capping raw reads on a worker with no retrieval verb reproduces BA-17 read-blinding on purpose. Same shape as the standing mailbox rule: enforced at the validation gate, not a prompt ask. | local (bareloop, `validatePlan`) |

### Upstream vs local

- **Upstream (bare-agent):** L3 (listing sizes — the worker cannot know a file's size before
  paying for it without this); the pricing `estimated` state and current-gen `COST_PER_1K`
  entries, filed as **BA-21** (`docs/UPSTREAM-ASKS.md`, already committed on `n4-softgreen` at
  `f2f44af` — not restated here).
- **Local (bareloop):** L1/L2/L4 as API-path seams; G1 as a `validatePlan` rule; an immediate
  `COST_PER_1K` startup patch for `sonnet-5`/`opus-5` (the table is exported by bare-agent,
  mutable by a caller today, independent of BA-21 landing); the context-headroom meter (§4).

---

## 3. Phase 1 — $0 archive replay result

Instrument: position-aware replay over 153 runs / 733 transcript segments, built from the gate
audit's real read sequences, segmented at spine transcript resets (a fresh Loop per
step/attempt). A token admitted at round `r` of `R` costs `1.25 (write) + 0.1*(R-r)` (re-reads).

**Model honesty — read before quoting any dollar.** The instrument predicted $135 of read-driven
spend against a measured band of ~$85–100: it ran **~1.4x hot**. *(This was the open state when
first measured. It is EXPLAINED and superseded by the calibrated read in §3a below — read this
paragraph as history, not as the current uncertainty.)* **Tuning was stopped here, not fitted to
a target.** Conclusion: report ratios, not dollars — ratios are robust to a uniform scale error,
and every arm runs through the same model.

| arm | with amplification | tokens-only |
|---|---|---|
| A1 cap + pointer | 77.0% | 71.8% |
| A2 diff only | 3.2% | 4.8% |
| A3 all combined | 78.4% | 74.0% |
| — pointer alone | 46.3% | 36.2% |
| — cap alone | 63.9% | 60.8% |

A2 sensitivity: flat across diff sizes of 2%/5%/10%/20% of file — not a knob that matters.

**Two self-corrections, carried honestly rather than smoothed over:**
1. **Diff is small.** Told to hamr earlier as ~15%/~$13; it is actually 3–5%. The earlier
   number used a flat 2.30x amplification; post-edit re-reads happen late in a segment and
   barely amplify.
2. **Cap beats pointer.** Told to hamr earlier as pointer being the biggest lever; cap alone
   (61–64%) beats pointer alone (36–46%). Big files are read early and amplify hugely — the cap
   is what catches them.

A3 buys only 1.4–2.2 points over A1: diff is nearly redundant on cost once cap+pointer ship.
**It must not be killed on cost alone** — this model measures money only, and a diff may still
be more useful to the worker than a whole file.

**Money translation, stated as a band, not a point estimate:** reads drive ~$85–100 of the
archive's ~$236 measured spend. Removing 74–78% of that is ~$63–78 ≈ **27–33% of everything the
programme has ever spent.**

### 3a. Correction — 2026-08-18, later the same day (VALIDATION ONLY — hamr's explicit
instruction in the neighbouring session was "only validate, no building"; nothing built, nothing
fired)

**The ~1.4x hot residual is explained — it was in the amplification term, not read sizes.** The
model implied an 18.7x re-read amplification rate against 10.5x actually measured archive-wide
(total cacheRead/cacheWrite) — a 1.78x-hot error concentrated in that one term. Root cause:
transcript segmentation missed some resets; the tell was a single 272-round segment that should
have been split into several.

**Candidate cleanup**, resolving the "named, unconfirmed candidates" list this section used to
carry:
- **Early-run caching-off (F18) — REFUTED.** 0 of 147 archived runs lack cache tiers.
- **Worker-side maxBytes — UNVERIFIABLE from this archive.** The gate audit records only
  `{tool}`, no byte counts, so this candidate cannot be checked directly; it is superseded by
  the effect-level check below, which settles the practical question without it.
- **"Reads admitted whole" — HOLDS on the API surface.** Actual-vs-predicted ratio median
  2.00–2.01; under-1 in only 7/125 API runs, and those 7 trace to file-grew-since-read on
  TYPES-genre jobs — a real accounted-for effect, not instrument noise.

**The calibrated column is now the central estimate** (10.5/18.7 applied to the re-read term
only, one global calibration factor, no per-arm tuning). §3's original table stands as the
outer bracket, not as a wrong number to discard:

| arm | calibrated (central) | original bracket |
|---|---|---|
| A1 cap + pointer | 75.8% | 71.8–77.0% |
| A2 diff only | 3.6% | 3.2–4.8% |
| A3 all combined | 77.3% | 74.0–78.4% |
| — cap alone | 63.1% | 60.8–63.9% |
| — pointer alone | 43.9% | 36.2–46.3% |

**The finding is the stability, not the calibration.** The conclusion — cap dominates, A3 barely
beats A1, diff is cheap but not worthless — is unchanged across a 3x swing in the most uncertain
parameter. Dollars remain unquotable; ratios only, unchanged from §3.

**Bias-direction check, not assumed.** Over-stating amplification flattered EARLY reads, which
flattered the cap (the cap is what catches large early files) — so §3's original "cap beats
pointer" was read off a model biased in the direction of its own conclusion. That was checked
rather than waved through: at ZERO amplification, cap still wins, 60.8% vs pointer's 36.2%. The
conclusion survives its own worst case.

**New caveat — the read model does not describe native/clipipe runs.** No API cache economics
apply there. The 11 archived native runs were the worst-fit outliers in the whole replay,
actual-vs-predicted ratios 0.03–0.34. If a worker ever routes natively, none of the arm numbers
above — original or calibrated — describe it.

---

## 4. Memory-harness talk verdict — no build

Zero context-overflow events across 147 archived runs. The ranked-decision-ledger idea from the
conference talk solves a problem bareloop has never had — corroborates F39 and F88 from outside
data. The only live borrow: a **context-headroom meter** — peak prompt tokens per run, plus a
NAMED overflow terminal, never laundered into `provider-red`. Local (bareloop).

---

## 5. Frozen test design (hamr: test separately, then combine, compare all)

- **Arms:** A0 baseline (as-is) / A1 cap+mechanics (L1+L3+L4+G1) / A2 diff only (L2) / A3 all
  combined.
- **Staged reading, even if code lands together** — two levers landing in one pass makes the
  delta unattributable (standing rule).
- **PRIMARY:** median spend per run, per arm.
- **VETO:** green rate must not drop. Cost is the headline only if greens hold (cost and
  capability are separate axes — measured 3x already in this programme).
- **SECONDARY:** `ctx_recall`/`ctx_get` share of tool calls — did steering actually steer.
- **DISCARD:** provider-red rows are casualties, never evidence.
- **n≥3 per arm** — n=1 on a nondeterministic worker is an anecdote (standing rule).

---

## 6. Explicitly NOT approved

- **Phase 2 (any paid run).** Budget and patient are open items (§7).
- **Any threshold not already fixed in the ledger.** Where the ledger has a number (the ~24KB
  L4 cap), it is cited as the ledger's own number. Where it does not, this doc picks nothing —
  operator territory, unset.
- **Building the memory-harness idea.** §4 is a no-build verdict, not a deferred build.
- **Killing L2 (diff) on cost grounds.** Its near-redundancy on cost (§3) is not evidence it is
  worthless — usefulness is a separate, unmeasured axis.

---

## 7. Open items awaiting hamr

- **Phase 2 budget + patient.** Green runs archive-wide: median $1.21, but high-churn greened
  patients run $4.73–$12.66. Proposed direction (unapproved): exact per-arm token math off real
  read sequences first (still $0), then paid runs only for the greens veto — but the number and
  the patient are his call, not picked here.
- **Arm count / n per arm** beyond the frozen "n≥3" floor — whether Phase 2 runs exactly 3 or
  more per arm is unset.

---

## 8. Standing instrument rule this package inherits (peer review, accepted)

The softgreen rung (PRD v1.71–v1.73, still in flight) adds a new spend record type,
**`judge-round`** (`ACCOUNTED_ROUND_TYPES` in `src/run.js`). Any spend-slicing instrument built
for Phase 2 or later **must** include it, or it repeats the F45 unaccounted-writer class. Phase
1 above is unaffected — no archived spine carries `judge-round` yet, since the softgreen rung
had not landed at the time of the replay. This was independently verified by peer review: a
full sweep of every archive record type carrying non-zero `costUsd` found `worker-round`
(7,506 records, $261.52), `worker-result` (82 records, $61.89 — verified as an attempt-level
echo of its own worker-rounds in 57/65 runs, correctly excluded), and `draft-result` (90
records, $0.64, also excluded) — Phase 1's denominator stands.
