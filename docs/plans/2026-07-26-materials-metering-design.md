# Design record — materials & metering (T + A), and the choose-don't-describe correction

**Status: SIGNED by hamr 2026-07-26 (§6 answered below). Nothing here is built yet.** Written 2026-07-26 against
measured numbers (F57, F60), not estimates — the probes ran first precisely so this record
would record a shape rather than guess one. Frozen once signed; amend by dated addendum.

Authorising context: PRD v1.27 (the T·A·P·U course correction) and hamr's framing —
*"handing agent params for building upfront and ralph loop counts that and informs/controls…
it's like giving agent cement, water, bricks, iron rods and ask it to build a bridge with it
to cross to the other side."*

---

## 1. The problem this solves

Two complaints opened the realignment, and they are the same complaint:

- **"couple of hours just hanging"** — nothing in the system bounds TIME (F56). Money, rounds
  and attempts are capped; wall-clock is not, and the worst case job #5's own plan authorised
  was ~630 worker turns.
- **"why isn't it adapting"** — a replan has fired **zero times in the programme** (F56),
  because only step exhaustion triggers one and an instrument stop is not exhaustion.

The unifying frame: the agent is handed materials, allocates them across the bridge it
designs, and the loop meters actual consumption against that declaration and tells it. T and A
are therefore **one mechanism**, not two features — the replan trigger is a variance threshold
on the allocation.

## 2. What the probes settled (so this is not designed on vibes)

| # | measured | consequence for this design |
|---|---|---|
| F57 | execute round = **$0.019 / 5.4s** median, spread 1.6× and 1.2× of median | a rate is quotable: **~53 rounds/$1, ~11 rounds/min** |
| F57 | check/close gaps run **3.8s median to 561s max** | a STATIC rate would be wrong — the meter must run **live** |
| F57 | a hung `generate()` emits **nothing** | a deadline is the only instrument that fires on the *absence* of events |
| F60 | given a budget + rate, the planner drafted **+62%** (262 vs 161 rounds) | the variable is wired in; the "inform" arm proceeds |
| F60 | its reds were `bounds:steps.N.rounds` | told it had materials, it over-allocated per step — **the cap is load-bearing** |
| F60 | scout ON carries **~15×** more repo specifics, and **triples** declared work | the survey is an input to allocation, not a formality |

**The premise itself is now observed, not assumed:** with no budget stated the planner asked
for 161 rounds; handed one, it asked for 262 and pushed individual steps past the per-step
ceiling. *Give it bounds and it uses them* is a measured property of this planner.

## 3. The design

### 3.1 Materials (what the agent is handed)

At plan time the agent receives a **bill of materials** and allocates it:

- **money** — the signed `budgetUsd`
- **time** — a new `maxWallMs`, operator-set
- **rounds** — as today (`maxStepRounds` per step)
- **the exchange rate** — the live per-round cost and duration, so the units mean something

The rate is the load-bearing part. The agent can count rounds; it cannot feel a dollar or a
minute. Without conversion, money and time are units it has never experienced and the bill is
decoration (the F22 failure mode in a new costume).

### 3.2 Metering (what the loop counts, and who it tells)

The loop meters consumption per step against the declared allocation and reports **variance**.
Three possible recipients, and they are not equal:

| recipient | gets what | why |
|---|---|---|
| planner at draft | the materials + the rate | it is designing the bridge |
| planner at **replan** | consumption vs its own plan, and what is left | **this is the adaptation channel** — the one that has never fired |
| worker mid-step | **nothing** | unchanged. A worker that knows money is running out has an incentive to rush or fake, and the v1.12 §5 prompt contract forbids it |

The worker stays blind. The whole mechanism is reachable without touching the arbiter rule.

### 3.3 Control vs inform

- The **operator's** caps are the outer wall — control, unchanged, never self-raised.
- The **agent's own** per-step allocation is a **hard sub-cap it may not exceed**. Otherwise
  "allocation" is a suggestion and the knobs are inert again. F60 shows this is not theoretical:
  handed materials, it wrote steps past the ceiling.
- **Variance is informed**, at replan. That is the agent re-allocating what remains across what
  is left — the bridge being redesigned mid-build.

### 3.4 A (replan) falls out of T

Replan trigger becomes: **a step consuming a declared share of the run's remaining time or
money with its exits unmoved.** The hard ceiling on replan count is unchanged (unlimited
replanning launders thrash as adaptation, v1.12). This changes the *trigger*, never the ceiling.

Stop semantics are unchanged: a run that cannot fit its time budget **stops**, and the stop is
the result. Resume-to-cap still applies — the stop is the checkpoint.

### 3.5 Time is arbiter territory

`maxWallMs` is operator input with exactly the same status as `budgetUsd`: the agent may
**tighten**, never widen; it never self-raises. Auto-sizing the cap from query complexity is
explicitly **out of scope for v1** (hamr: "later we could have this auto detected") — v1 is
operator-set so the first reads are clean.

## 4. The choose-don't-describe correction (hamr, this session)

F60's incidental finding: **13 of 18 validator reds are one class.** The agent writes
`{"type":"tree-changed","scope":"src/*.js"}`; the grammar accepts only a trailing `/*` or `/**`;
each red costs a redraft call.

My first two proposals were *state the rule in the prompt* or *widen the grammar*. hamr's
question — *"did agent choose from a list or not?"* — exposed that both keep the agent
**authoring a free-text string and guessing its shape**. The exit *type* is a menu of four; the
scope is not a menu at all.

**Decision: enumerate the legal scopes from the signed `writeScope` and let the agent pick
one.** An illegal scope becomes inexpressible rather than rejected-after-the-fact; no rule needs
teaching; ~72% of drafting friction disappears.

`globToPrefix` is **not** changed. It is the fence's containment function — arbiter territory,
and its normalization order is already flagged high-risk. This changes what the agent is
*offered*, never what the fence *enforces*.

**The generalisation, which is the same defect as F56 one size down:** wherever the plan
schema takes a free-text value that only a closed set of values can satisfy, the agent should
be handed the set. Audit the remaining fields against this before building (`target`, exit
`path`, check `name` — the last is already a menu and is the model to copy).

## 5. What this record does NOT decide

- **Whether materials improve an OUTCOME.** F60 is the plan surface only. It shows allocation
  responds; it cannot show the run gets better. That is U's job.
- **Whether the scout's tripled allocation is *right*.** A bigger plan is not a better plan.
- **P (the palette).** Sequenced after U so the widening has a baseline to be attributed
  against — though F60 moved it from "does it even reach?" (2 of 3 did) to a menu question.
- **Auto-sizing the time cap.** Out of scope, named for later.

## 6. Answered by hamr, 2026-07-26 — these three are DECIDED

1. **`maxWallMs` has NO default.** Time is always explicitly operator-set. hamr: *"no default."*
   A defaulted cap is a silent second ceiling, which is the F45 failure (a money rule with no
   wired detector let 4 cut rows be classed as evidence). A run with no `maxWallMs` is therefore
   time-unbounded **by explicit operator choice**, never by an unnoticed fallback — and the
   absence must be visible in the spine, not inferred.
2. **Replan variance threshold = 50%** of a step's declared allocation with its exits unmoved.
   hamr: *"50% is fine."* Recorded as **provisional-by-construction**: it is a first number, not
   a measured one, and the first real run that trips (or fails to trip) it is the read that
   settles it. It must not harden into doctrine by surviving unexamined.
3. **The agent sees BOTH money and time.** hamr: *"both money and time."* The counter-argument
   is on the record and is not dismissed — F60 measured this planner allocating +62% toward
   whatever bound it is shown, so showing it money predicts it will plan toward the money. That
   is the behaviour the experiment exists to read, and the per-step cap plus the operator's
   outer wall are what keep it honest while we read it.

---

## Addendum 1 — 2026-07-26: `maxWallMs` is a between-round deadline, and its overshoot is a quotable number

**Pre-build spike, $0, two conditions both able to fail.** Run before writing any T code because
the design above assumes a wall-clock cap is enforceable and never says by what seam.

| condition | instrument | measured |
|---|---|---|
| C1 — can `loop.stop()` cut an in-flight `generate()`? | fake provider hanging 4,000 ms; `stop()` fired at 500 ms | **NO.** `run()` returned at **4,018 ms**, 1 call. `stop()` is read at the round boundary (`loop.js:661`) and between tool calls (`:916`) — never mid-request |
| C2 — does BA-18's provider timeout fire on the ABSENCE of events? | real `AnthropicProvider`, `timeoutMs: 1200`, against a local socket that accepts and never answers | **YES.** Rejected at **1,259 ms**, `TimeoutError code=ETIMEDOUT` |

C2 could genuinely have failed: without BA-18 the socket is bounded only by the OS TCP timeout
(~2 h) and the spike would have hung. The 59 ms overshoot is timer granularity — negligible at
minute scale.

### What this settles

**A deadline alone is not enforcement.** Checked between rounds, `maxWallMs` overshoots by one
whole round, and a *hung* round is bounded only by the provider default (600,000 ms = 10 min,
which bareloop never overrides). Enforcement therefore needs BOTH seams:

- the **deadline**, checked at the round boundary — bounds a run that is progressing;
- the **per-call provider timeout**, derived as `min(600_000, remainingWallMs)` — bounds the one
  round that is *not* progressing, the F57 hang shape that emits nothing.

`loop.run`'s third argument is forwarded verbatim to `provider.generate` (`loop.js:732`), so the
derived timeout threads through the three existing call sites (`planrun.js:418, 488, 498`) with
no new machinery.

### The honest number, which must be reported and not rounded

With both seams wired, worst case is a close/check already in flight when the deadline trips:

> **enforced ≈ `maxWallMs` + `closeTimeoutMs`** (default 120,000 ms = 2 min, `ralph.js:75`).

Without the derived provider timeout it is `maxWallMs` + 10 min + 2 min. Either way the advertised
number is not the enforced number, and **§3.5's "identical to money" is therefore not quite true**:
`budgetUsd` binds between rounds too, but a round's cost is bounded by `maxTokens`, whereas a
round's *duration* had no bound at all before BA-18. Both numbers go in the spine. Quoting only the
requested one would be F6 in a time coat — the honest null for time.

### Consequence for what T is worth

The *"couple of hours just hanging"* complaint is **already fixed**, by BA-18's 10-minute provider
timeout consumed in `2bd46bb` — not by anything in this record. `maxWallMs` answers the different
complaint: a run that is making progress and will still take hours. Its value is therefore
overwhelmingly §3.1 — **time as a material the planner allocates against** — with the deadline as a
backstop carrying a 2-minute tolerance. That reframing does not change the design; it changes which
half of it the first read should be aimed at.

---

## Addendum 2 — 2026-07-26: time is a BALANCE, not a rate; and it is a METERING signal before it is a drafting material

**Authorised by hamr in-turn, this session** — his correction, verbatim: *"why would you tell it
every round that you have x time per round? what if there is a heavier round? why don't you tell it
same like cost, you have x left from cost/time instead of making it race against time?"* and, on the
shape below, *"yeah, we can try that."*

Evidence: **F61**. This addendum supersedes the rate framing used in F60's T2B arm and narrows §3.1.

### What changes

**§3.1's "exchange rate" is withdrawn as a planner input.** The rate stays a real measured quantity
(F57) and stays useful to the *shell* for deriving the per-call provider timeout (addendum 1) — but
it is never handed to the agent, and the agent is never given a per-round quota to pace against.

Three reasons, in order of weight:

1. **A rate is a fiction at the round level.** F57 measured a 150× spread on the verification gaps
   (3.8 s → 561 s) and 1.6× on execute rounds. "5.4 s per round" describes almost no actual round, so
   a heavy round breaks the planner's arithmetic and nothing tells it.
2. **A balance is self-correcting.** After a heavy round the remaining number is simply lower. The
   agent never models round weight; there is no fiction to get wrong.
3. **A rate is a stopwatch.** Racing a clock gives a worker the incentive to rush or fake — the exact
   thing the v1.12 §5 prompt contract exists to remove.

### The shape we will try

| recipient | what it is told | when |
|---|---|---|
| planner at **draft** | the totals as **scale only** — *"$10 and 45 minutes for the whole run"*. No rate, no derived round count, no instruction to allocate time | once |
| planner at **replan** | the **balance and its own progress** — *"$6.40 and 22 minutes left; step 2 of 6; this step has used 60% of what you allocated it"* | when the meter trips |
| worker | **nothing** | never — unchanged, §3.2 stands |

**No per-round quota anywhere, for money or for time.** This also brings time into line with what
money already does: F61's source read found the shipped plan prompt (`src/planrun.js:76-109`) never
mentions money at all — it is enforced by ralph every round and never spoken. Time now works the same
way, with the balance added at replan because that is the adaptation channel being built.

### The consequence we accept, deliberately

At draft nothing has run, so the balance *is* the total and the agent **cannot size its steps in
time**. It plans in rounds, as today, and may well draft a plan that does not fit.

**We are choosing not to fix that.** Sizing time at draft requires the rate, and the rate is the
fiction we just removed — it would be fake precision bought with the exact instrument F61 discarded.
A plan that does not fit is what the meter is *for*: it trips, the balance and the variance go back
to the planner, and it re-allocates. That is the adaptation channel, and it has fired zero times in
this programme (F56). Letting the first draft be wrong is how we get to read it.

### What this costs the record

**F60's +62% is withdrawn as a prediction.** It was measured under the rate framing and does not
transfer to the balance framing. The surviving claim is the weaker, framing-independent one: *hand
the planner a stated bound and it plans against it.* §2's table and §3.1's "the rate is the
load-bearing part" are corrected accordingly — the load-bearing part is the **balance**, and the rate
is shell-side arithmetic the agent never sees.

### Also narrowed: what T is worth (from addendum 1)

The *"hours just hanging"* motivation in §1 is dead — BA-18 fixed it in `2bd46bb` and F61/C2 measured
it firing. `maxWallMs` therefore earns its place as a **material and a metering unit**, not as a
safety backstop. The backstop is kept, deliberately rough (addendum 1's ±`closeTimeoutMs`), and gets
no further build effort.

### Still open, and NOT assumed by this addendum

Where a real run's hours actually go is unmeasured. Model rounds are already bounded by money at
F57's rate; check/close gaps cost $0 and are invisible to the money cap. The archived spines carry
timestamps and answer it for $0. If the hours turn out to be in check gaps, the unit that needs
bounding is check invocations, not the wall clock — and this addendum would need a third.

---

## Addendum 3 — 2026-07-26: time reporting is a ~90% approximation, by ruling

**hamr, in-turn:** *"time in general has to be relatively good reporting, doesn't need to be 100%
accurate, but 90% good approximation."*

This settles the accuracy bar for every time number the system produces — the balance shown to the
planner at replan, the variance the meter computes, and the `maxWallMs` backstop.

**What it licenses:**

- **Addendum 1's rough backstop is accepted as final.** Enforced ≈ `maxWallMs` + `closeTimeoutMs`
  (a ±2-minute tolerance on a 45-minute budget is ~96%). No further build effort goes into
  tightening it, and the per-call provider timeout derived from the remaining wall budget is
  worth wiring precisely because it is cheap, not because precision is required.
- **Gap-attribution timing is good enough for the meter.** F62's method — attribute each gap to the
  event that ends it, keep a residual — landed at a **0.6% residual** over 124 runs. That is inside
  the bar by a wide margin and needs no per-call instrumentation.
- **The LLM-vs-tools split stays unbuilt.** F62 could not separate the model's own time from its tool
  executions without new instrumentation. Under this ruling it does not need to be: both are the
  agent's own consumption, and lumping them is well inside 90%.

**What it does NOT license.** The bar applies to the *precision* of a time number, never to its
*honesty*. An unknown duration is still reported as unknown, never as zero — F6's rule is unchanged
and is not an accuracy question. Likewise the advertised-vs-enforced pair from addendum 1 stays two
reported numbers; approximation is not permission to quote only the requested one.

---

## Addendum 4 — 2026-07-26: the choose-don't-describe audit of the remaining free-text fields

§4 required the other free-text plan fields to be audited against the same rule before building.
Done; the result is that **`tree-changed.scope` was the only enumerable one**, and the reason is
worth recording so the generalisation is not misapplied later.

| field | enumerable? | verdict |
|---|---|---|
| `exit.tree-changed.scope` | **yes** | a scope names an EXISTING container. The closed set is the fence plus the directories under it — **built** (`legalScopes`) |
| `steps[].target` | **no** | a target names the file the step is about to CREATE. It does not exist yet, so there is nothing to enumerate; a menu would forbid the deliverable |
| `exit.artifact-written.path` / `json-valid.path` | **no** | same reason — the path is the step's own output |
| `exit.check-passes.name` | already a menu | the model §4 said to copy; unchanged |
| `exit.artifact-written.pattern` | **no** | a regex over content the step has not written. F49's static shape reject is the right instrument here, and it stays |

**The rule, stated precisely enough to reuse:** a field is enumerable when its legal values name
something that **already exists** at draft time. A field naming something the run is about to
*produce* cannot be a menu, and forcing one would forbid the work. So `target` and the two exit
paths keep validated free text — containment-checked against the fence exactly as before, which is
`scope-escape`/`invalid-value` territory and unchanged by this build.

This narrows §4's generalisation from *"wherever the plan schema takes free text that only a closed
set can satisfy"* to the operational test above. The looser wording would have pointed at `target`,
and a `target` menu would have broken every write step.
