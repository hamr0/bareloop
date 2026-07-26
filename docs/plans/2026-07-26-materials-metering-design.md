# Design record — materials & metering (T + A), and the choose-don't-describe correction

**Status: DRAFT for hamr's sign-off. Nothing here is built.** Written 2026-07-26 against
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

## 6. Open for hamr

1. **`maxWallMs` default** — or is time always explicitly operator-set, with no default at all?
   (A default is a silent second ceiling; the F45 lesson argues for none.)
2. **The variance threshold that triggers a replan** — a fraction of remaining time/money. I'd
   start at 50% of a step's declared allocation with exits unmoved, and treat the number as
   provisional until a real run reads it.
3. **Does the agent see money, time, or both?** Both is the honest bill. One argument for time
   only: money is the arbiter's most sensitive axis, and F60 shows the planner spends toward
   whatever it is shown.
