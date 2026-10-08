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
rows, where the CLI reports its own **provider-billed** cost on a different billing surface —
an accidental control on that surface, and it runs 2.0–2.5x the `_default` guess *there*. *(This
figure does not generalize to sonnet-5's own underpricing ratio on the API surface — that was an
error, corrected in §1.1a below; clipipe cost never pools with `anthropic-api` cost, F48.)* Every
one of these rounds is stamped `pricing:'priced'`. bareloop has no price table of its own; the
Anthropic API returns no dollar cost, only token counts, so local computation is unavoidable
somewhere in the stack.

### 1.1a Correction — 2026-08-18, later same day: sonnet-5 underpricing is ~5.7%, not 2–2.5x,
and it carries an intro-rate cliff

**The 2.0–2.5x figure in §1.1 above was misapplied.** It is a real number, but it belongs to
clipipe's provider-billed rows on clipipe's own billing surface, not to sonnet-5's mispricing on
the `anthropic-api` surface — generalizing from one to the other was the error, and F48 already
established these two billing surfaces never pool.

**Proper repricing**, over the 7,217-row confirmed `_default` population, applying the real
cache-tier multipliers (0.1x for a cache read, 1.25x for a cache write) that `_default` already
implicitly carries:

| pricing basis | total | ratio to `_default`-as-recorded |
|---|---|---|
| `_default`-as-recorded | $219.15 | 1.000x |
| sonnet-5 **INTRODUCTORY** rate ($2/$10 per 1M) | $231.72 | **1.057x** |
| sonnet-5 **LIST** rate ($3/$15 per 1M) | $347.58 | 1.586x |

**Load-bearing:** sonnet-5's introductory rate runs through **2026-08-31**, and the entire
archive (2026-07-15 .. 2026-08-17) sits inside that window — independently verified against the
archive's own date range, not assumed. **1.057x (~5.7% underpriced) is therefore the historically
honest ratio for every round this programme has ever run.**

**Structural warning, recorded because nothing in the system will say it on its own:** on
**2026-09-01** the honest ratio jumps silently to ~1.586x, and no code path detects the rate
change — the `_default` guess does not know an introductory window exists, let alone that it
ends. Small today (~5.7% on the whole archive to date); structural forever until BA-21 lands or
its equivalent local awareness exists.

**Method note:** the repricing exercise turned up a $25.98 gap between the reprice and the
archive-wide total before it was explained — the F45 unaccounted-writer class, caught before it
reached a reported number. Root cause: 24 `kind:"session"` clipipe-native rows carrying real
provider-billed cost, correctly excluded per F48 (a different billing surface, never pooled).

### 1.1b Feasibility survey (new information, not a correction): bareloop cannot mint the ruled
`estimated` pricing state today

With the local `COST_PER_1K` mitigation dead, the question of what actually mints `estimated`
was surveyed directly against the running code, not assumed:

- `planrun.js` forwards `arg?.pricing` **verbatim** from upstream.
- Upstream's mint is a **hardcoded binary**: `cost === null ? 'unpriced' : 'priced'`. There is
  no third branch to forward even if bareloop wanted one.
- Every downstream trust check that consumes this field is a **finite-number boolean** — a
  single choke point in `text.js`, plus sites in `run.js`/`planrun.js`/`reuse.js` — which already
  satisfies "never refuse on an estimate" (a finite guess reads as trustworthy-enough to proceed)
  but makes an estimate **indistinguishable from a known price**. That is the exact opposite of
  "keep the user in the know."
- A local `COST_PER_1K` patch (even setting aside §"Correction" above, that it cannot be reached)
  would make this **worse**, not better: a guessed rate and a real rate both stamp `'priced'`,
  so patching the table produces a more accurate number wearing the identical confident label.

**The conclusion the survey forces:** the `estimated` marker needs a **new field**, not a new
value inside the existing `pricing` field — the existing field's whole downstream contract is a
boolean, and widening its value set breaks that contract silently at every choke point rather
than at one signed edit. Candidate landing sites the lane recorded for a future build: `run.js`
line 307, `bridges.js`'s `HISTORY_FIELDS`, and a new **non-red** category in `ledger.js` so "N
estimated rounds" folds into neither `pricing-red` nor silence. **All of this remains
BA-21-upstream-first; nothing is built.**

### 1.1c What is carried as unverified, not settled

The repricing lane's own list, carried honestly rather than rounded into the headline numbers
above:

- **8 mismatched `worker-result` files** and **55 unattributed rows ($16.97)** remain
  unresolved.
- **No per-row model field exists** — haiku vs sonnet spend is separable only at the file level,
  not the round level.
- **~$2.06 of draft/selection/authored rows** are unrepriceable with the current instrument.
- **`job-end.spentUsd` vs an independent sum** has not been cross-checked.
- **The bridges validator's behaviour on an unknown field** has not been checked — relevant to
  whichever landing site §1.1b's future build picks.

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
  entries, filed as **BA-21** (`docs/product/UPSTREAM-ASKS.md`, already committed on `n4-softgreen` at
  `f2f44af` — not restated here).
- **Local (bareloop):** L1/L2/L4 as API-path seams; G1 as a `validatePlan` rule; the
  context-headroom meter (§4). *(A local `COST_PER_1K` startup patch for `sonnet-5`/`opus-5`
  was proposed as an immediate mitigation in the first pass of this record and is now DEAD —
  see the correction below. The fix is BA-21 upstream, or nothing.)*

### Correction — 2026-08-18, later same day: the "immediate local mitigation" is DEAD

The claim that bareloop "can proceed independently" by patching `COST_PER_1K` at process
startup was **executed and refuted**, not merely reconsidered:

- `require('bare-agent')` → `COST_PER_1K` is **undefined** (`index.js` never re-exports it).
- `require('bare-agent/src/loop')` → `ERR_PACKAGE_PATH_NOT_EXPORTED` — the package's strict
  `exports` map working exactly as designed, blocking the deep import.

The table is reachable **only** via an absolute `node_modules` path with **no semver contract**
behind it — a live-mutable global with the next patch release free to break it silently. That is
not a local mitigation, it is a private hack against another package's internals, and it is
struck as an option. **The fix is BA-21 landing upstream, or nothing.** Any prior "recommended
first" or "can proceed independently" framing attached to this idea is retracted, here and in
PRD Addendum v1.74.

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
