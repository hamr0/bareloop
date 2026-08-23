# SCALING_AGENTS_PRIMITIVES

The five layers every agent system needs before it can be trusted in production, written
in bareloop's terms — what we already have, what we deliberately refuse, and the three
things we are missing.

Started 2026-08-23 from two AI Engineer talks (Bhaumik/Databricks on production agents;
Druga/Sakana on memory harnesses; transcripts in `~/Downloads/pro.txt`). The layer
structure is theirs; the wording, the mapping and the verdicts are ours.

Status: reference note. Nothing here changes doctrine. Items marked **PROPOSED** or
**PARKED** are not decisions. Companion worklist: `02-features/2026-08-23-behavioral-wrinkles.md`.

---

## The one law behind all five

Models get picked LAST. You build the ruler before you build the thing it measures,
because a system you cannot measure cannot be improved and cannot be trusted. bareloop
already lives this — the close exists before the worker runs — so this document is mostly
a crosswalk, not a to-do list.

---

## Layer 1 — Evaluation: the ruler

**What it is.** Success stated as a number before any code exists, real test cases drawn
from real work, grading that runs by itself, and three kinds of check stacked cheapest-first.

### 1a. Define success with numbers, up front

**We have this, harder.** We don't set targets, we *freeze rules* — pre-registered decision
rules committed before any number exists, with VETOs declared in advance and arms declared
underpowered ahead of the data. A frozen rule never loosens after the fact.

### 1b. Test cases from real work

**Partial.** Our only frozen case set is the softgreen judge calibration (10 cases, floor
10-of-10, `src/judged.js`). Jobs and patients are invented per battery and retired.
→ **Gap. See FEATURE 1 (the bench).**

### 1c. Automated grading

**We have this.** The close IS automated grading, and only the close is truth. A step
passing its own in-run check is never a verdict.

### 1d. The three check layers

| Layer | Theirs | Ours |
|---|---|---|
| **Deterministic** | regex, schema, format checks | the close — mechanical stages, `src/declaredclose.js`. Cheapest, runs first, first-red-wins |
| **Semantic** | LLM-as-judge scores the answer | softgreen (`src/judged.js`). **Ours is stricter:** the judge only extracts facts and quotes; a deterministic `decide()` renders the verdict; unsure = RED. A model never says pass/fail here |
| **Behavioral** | is the agent looping? calling the same tool twice? | scattered across `stall.js`, `trend.js`, `readshim.js`, Layer R — no single surface, two of them default OFF. **This is our weakest layer** |

The composition law we already run — mechanical first, judge minimal, human last,
first-red-wins, and a picked verdict class is a promise the composition can never exceed —
is a stronger statement than "stack three layers."

**Their own warning, which lands on us:** the behavioral layer is the one everybody skips.
We skipped most of it too. → **FEATURE 2, plus `2026-08-23-behavioral-wrinkles.md`.**

---

## Layer 2 — Observability: the replay

**What it is.** Every decision the agent made, recoverable after the fact. Their test is
blunt and good: **if you cannot replay a failed run in under five minutes, you are not
production ready.**

**We have the data, not the replay.** The spine (`src/spine.js`) is an append-only event
log; the gate audit records every action's allow/deny decision, run-scoped; the ledger
(`src/ledger.js`) meters money per round. Everything needed is on disk.

But there is **no generic replay tool**. `scripts/` holds per-battery readouts
(`u-readout.mjs`, `author-readout.mjs`) and one-off graders. Reconstructing an arbitrary
failed run means hand-slicing JSONL. That is not five minutes.

→ **Real gap, newly named. FEATURE 2 is the cheap first half of it.**

Their span chain, and ours:

| Theirs | Ours |
|---|---|
| user input | the signed goal |
| intent classification | draft / plan (`src/plan.js`) |
| tool calls (accounts, policy docs) | worker rounds, each gate-audited |
| reasoning chain | round transcripts |
| guardrail check | the close, stage by stage |

Two places we are ahead: the worker is explicitly **denied read** on the arbiter's own books
(gate audit, spine, `.smoke`), so the thing being logged cannot read its own log; and
`Retry` on transport failure is deliberately **unwired**, because a timeout may already have
been processed and a retry could pay twice. Their layer auto-retries; ours halts on purpose.

---

## Layer 3 — Data foundation: what the agent reads, and what it leaves behind

**What it is.** Two different data problems that get confused with each other.

**Question data** — what the agent reads to do the job. Ours: the patient repo (always a
copy, never the original), the litectx index, and the scout's facts (`src/authorscout.js`).

Their line is right and we learned it the expensive way: *agents don't forgive bad data —
they answer confidently and wrong.* Our F59 is exactly that — the scout returned nothing on
15 of 18 runs and the planner drafted blind for ~12% of every run's budget.

**Known hole:** nothing checks whether the litectx index is older than the tree. A stale
index manufactures phantom defects, and flipping `embeddings` on an existing index computes
no vectors at all — both fail silently, as a clean answer rather than an error. Their one
real production incident was this exact class: policy updated, embeddings never recomputed,
agent answered confidently from stale content, caught only by users complaining.
→ **Logged as W4 in the wrinkles doc.**

**Tracking data** — what the run leaves behind. Ours is mature: spine, gate audit, ledger,
147+ archived runs. This is the asset that makes $0 archive replay possible, which is why
"no paid fire before the archive read" is doctrine.

---

## Layer 4 — Orchestration: who tells whom what to do

**Orchestrator-worker.** One coordinator breaks the job down, specialists execute, results
come back, everything routes through the centre so there is one place to look when it
breaks. **This is bareloop.** Planner drafts, worker executes under a fenced verb menu,
arbiter closes.

**Choreography.** Independent agents on a shared message bus, subscribing to events, running
in parallel, lower latency. **REJECTED, permanently.** Peer-to-peer agents mean no single
un-gameable outer gate. The arbiter is central by law, not by preference. Recorded here so
it is not re-proposed.

**Human-in-the-loop above a confidence threshold.** **BUILT, RAN LIVE, RETIRED.** A
probabilistic confidence score is not a verdict. In our live hitl run the mechanical stages
carried everything and the human step was a near-rubber-stamp — green dressed up as hitl.
Replaced by softgreen (a judged floor with a deterministic decision) plus a structural
review door on every run, which never changes the minted verdict. Merge stays human forever;
that is the real HITL, and it is at the end, not in the middle.

---

## Layer 5 — Governance: what happens when it goes wrong

**Audit trails.** We have them (Layer 2), plus the fence that keeps the agent out of them.

**PII prevalidation.** **Not applicable.** Their 47-breach catch was customer data. Our
patients are local repo copies; the one secret-shape inventory scrubs at capture in the
shell primitive, never at the spine layer. Recorded so it is not re-proposed as a gap.

**Prompt versioning as change management.** We have signed job specs: edit one and its
signature hash flips, and the runner refuses until re-approved. Stronger than theirs — ours
refuses to run, not just to explain.

Their extra, which we lack: a prompt commit must record **what failure caused the change,
what it addresses, what it corrects.** Our drafter prompt registers in `src/` change under
ordinary narrative commits with no required fields. → **PROPOSED, cheap:** a commit-message
shape for prompt-register changes only. Gates nothing, so not arbiter territory.

**Model change management.** Their rule: never trust a vendor's benchmark; re-test an
upgraded model on your own cases. Ours today is a note in a memory file, and notes get
missed. → **FEATURE 3.**

**Incident playbook: detect → diagnose → contain → fix.**

| Stage | Ours |
|---|---|
| detect | the close; named terminals (`cap-halt`, `wall-halt`, `step-red`, `broken-close`, `worker-crash`, `door-accept-red`) |
| diagnose | spine + gate audit + ledger; $0 archive replay |
| contain | halts, not rollbacks — money cap, wall, strike governor, resumable pause (60-day TTL), merge stays human |
| fix | a FINDINGS entry plus a regression test |

Their fix step ends one beat later than ours: *the failure becomes a permanent row in the
eval set, so it cannot recur silently.* We do this for code bugs. We do not do it for jobs —
which is FEATURE 1 again, and why "a frozen rule without a wired detector is prose" keeps
biting.

Useful vocabulary from their containment patterns, for things we already do:
**compensation** ≈ the worker's honest undo of its own suppressions (F99); **circuit
breaker** ≈ a repeating casualty class is a CONDITION, not a casualty — stop the battery
and re-probe.

---

# The three features

## FEATURE 1 — The bench (Layer 1b)

A bench, with one difference from a normal benchmark: **we freeze the expected OUTCOME, not
a score.** Four jobs, never changed, each answering a different question.

| Job | Expected | The question |
|---|---|---|
| G1 mechanical gap | greens | does the loop still convert at all? |
| G2 semantic gap | **stalls** | is the hard case still hard? |
| G3 suppression genre | worker cheats, close catches it | does the close still catch cheating? |
| G4 cap-halt → replan | halts, then greens | does recovery still work? |

**The problem it solves:** nothing today can tell us the system got worse. Every job is
invented fresh, so "it greened" means "this new thing worked once," never "we did not
regress." F33's 7-of-7 greens looked like strength and were one saturated genre — found out
later, by accident.

**A row freezes the CONFIG, never just the job.** `aurora-testgen` never greens (0 of 43)
while `aurora-testgen-l2accept` — the same job under the Layer-2 shape — greened 3 times. A
row naming only a job carries no information, because "it greened" could not be read.

**G2 is the load-bearing row.** If the known-unwinnable job suddenly greens, that is a
question, not a win: either the model improved or our ruler broke. A bench where everything
passes teaches nothing.

**Every row carries the F-number that minted it** — same doctrine as every inherited rule
carrying the green that minted it. The set grows: a real failure that gets fixed earns a
row, so it cannot recur silently. It needs a named owner, or a growing set rots.

**When it runs:** worker/judge model change; close-authoring or validation-gate change;
before a release. Not per commit.

**Tiering** (their lesson, 34:54 — behavioral evals get expensive as the set grows):

| Tier | What | When |
|---|---|---|
| 0 | $0 archive replay | every change, always first |
| 1 | G1 only | anything touching the loop |
| 2 | all four | model swap, close-authoring change, release |

Tier 0 first, every time — if the replay cannot see the thing, the ruler is blind and we
learn that before spending anything.

**Cost: unmeasured.** Archived greens have run ~$1.21 (F83), but that is one run in one
genre. Tier 2's price gets derived from the archive before anyone quotes it.

**Status:** approved by hamr 2026-08-23 to be built. Design first, per build-ladder
discipline. Job selection needs hamr — patients are a real choice, not a detail.

## FEATURE 2 — The run behavior summary (Layers 1d + 2)

One report-only block at the end of every run, built entirely from the spine. Gates nothing,
changes no verdict, mints no red.

```
94 tool calls · 61 read, 28 grep, 5 recall
17 exact repeats (~18%)
```

**The problem it solves:** we can see what a run cost, not what it wasted. The ledger says
`$1.21`; it never says how much of that was the same grep nine times. The data is already
on disk — nobody adds it up.

**Why it is the best-value of the three:** free, safe, and it makes the other holes
self-reporting. Right now it takes a whole document to say "nobody watches duplicate greps."
With this, the number just appears. It is also the cheap first half of Layer 2's
five-minute-replay test.

**Status:** PROPOSED. Report-only, so not arbiter territory.

## FEATURE 3 — Model names in the signed spec (Layer 5)

Put the worker and judge model names in the signed spec, beside everything else already
signed. Change a name → the hash flips → the runner refuses until re-signed. Same lever
that exists today, one more field.

**The problem it solves:** a model swap is currently invisible. "Re-test when the model
changes" is a memory note, and notes get missed — so a run under sonnet-5 and a run under
its successor look identical in the record. That is the F109 shape exactly: every round
stamped `priced` while the price was a guess, and a guess and a real number looked the same
for months.

**Status:** PARKED. This changes what the runner accepts — arbiter territory, hamr's call.

**The three chain:** FEATURE 3 notices the change → FEATURE 1 is what you run → FEATURE 2
is how you read it.

---

## What else this structure surfaces — and what it doesn't

Checked layer by layer. Three things we were missing, one already listed:

1. **The five-minute replay test** (Layer 2) — genuinely new, and we fail it today. There is
   no generic "replay run X" tool, only per-battery readouts. Named here; FEATURE 2 is the
   first slice, a full replay tool is not yet proposed.
2. **A required shape for prompt commits** (Layer 5) — new, cheap, gates nothing.
3. **The stale-index check** (Layer 3) — their one real incident, our known unwatched bug.
   Already logged as W4.

Everything else in their structure we either have, have in a stricter form, or have
deliberately refused with a reason on record. No filler items were added to round the list
out.

## Outside corroboration (the second talk)

Druga's memory-harness work at Sakana, on different models (Qwen 27B, DeepSeek V4 flash),
different tasks, different team, independently reproduces two of our findings:

- **"When the task fits in context, memory adds no capability — same performance with and
  without, and it only added cost."** That is our F88 and the 0-of-147-overflow reading.
  Our decision to build no recall harness holds.
- **Her oracle condition did not reach max.** Handing the model exactly the right memory did
  not make it use it — it still retrieved the wrong thing or ignored it. **That is F39, the
  Wizard-of-Oz semantic-stall probe, reproduced by another group.** Delivery and conversion
  are separate axes; we now have outside evidence, not only our own.

One thing we have not tested: she found a *ranked* recall ledger beat *gating* recall by
asking the model whether it needed memory. Our version of that question — does the agent
choose retrieval well? — is measured (recall drafted 1.4% vs read 99.3%) and unaddressed.
Her result hints the direction is ranking, not asking. Noted, not proposed; logged as W7.

**Net:** the second talk changes no plan. It converts two internal findings into externally
corroborated ones, which is a reason NOT to revisit them.
