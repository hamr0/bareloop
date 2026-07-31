# Layer 3 — the REUSE rung (design record)

**Status: interview complete, design FROZEN (hamr, 2026-07-31 → 2026-08-01, in-turn).
Signature, verbatim: *"all agreed, lock in and we will validate with pocs these assumptions
and change as needed"*. Supersedes nothing — this ANSWERS PRD v1.34's inventory, which
named the gap and deliberately designed nothing. Build follows this record; deviations and
POC results amend it by dated addendum, never by silent rewrite.**

## 1. The goal, in the user's terms

PRD v1.34 recorded hamr's standing approval and the goal sentence, verbatim:

> *"spill out missing specs and add it to later module as part of prd. goal is user can
> choose workflow for similar job and it would reuse the same plan and self-heal insteaf of
> starting from scratch"*

That is the founding claim restated operationally (PRD §2: bareloop learns a JOB — the plan
is a persistent, ledger-attributed artifact; a bareloop that discards the plan each run IS
relayfact and should be archived). This record decides HOW.

## 2. Interview provenance

The interview ran point-by-point over v1.34's 8-item inventory plus the two conditions v1.27
left unruled, 2026-07-31 → 2026-08-01. Nothing below was designed by the assistant; each
item is hamr's ruling, recorded with the learning it leans on.

| v1.34 inventory item | ruled by |
|---|---|
| 1. Storage | **D1** |
| 2. Keying and matching | **R2** (the "same job" law) + **D2** (mechanical gate vs LLM judgment) |
| 3. Selection | **D3** |
| 4. Loading and re-validation | **D2** (mechanical gate) + **D4** (the bridge is a draft, not a contract) |
| 5. Adaptation — the self-heal | **R1** + **D4** + **D5** |
| 6. Demotion | **D6** |
| 7. Attribution | **D1** (what an entry carries) + **D6** (per-run history) + v1.21 requirement (c) |
| 8. The scout under reuse | **D8** |
| unruled condition 1 — graduation/demotion | **R1** + **D6** |
| unruled condition 2 — "same job" | **R2** |
| (new, hamr-raised) the reuse envelope | **D7** |
| (new, hamr-raised) what gates the build | **D9** |

### What exists today, restated so the build knows its starting point

Five real bridges are already minted on disk, by `scripts/run-u.mjs` (lines 255–271), one
file per green:

- `bareloop-patients/aurora-u-bareloop/bridge-aurora-u-spawner-types-{ms7flkok,ms2ddxjc,ms2c0ls7}.json`
- `bareloop-patients/litectx-u-bareloop/bridge-litectx-u-types-{ms5uxhej,ms3wawub}.json`

Each carries `{job, specHash, runid, greenAt, plan}`. All five are the TYPES genre
(`tsc --strict` migration). **They are files, not a mechanism: nothing reads them back.**
Both job specs (`jobs/aurora-u-spawner-types.json`, `jobs/litectx-u-types.json`) declare the
same four close stages — `changed-from-seed` → `typecheck` → `suite-green` →
`no-suppressions` — over different patients. That is exactly the R2-legal reuse pair, and it
is the pre-probe's material.

## 3. The locked decisions

### R1 — self-heal placement: adaptation happens at REUSE, and only a green writes the box

Within-run adaptation of a reused bridge uses the **existing machinery only** — the per-step
check-gap retries and the one replan. **The bridge file is never edited in place by a red.**

- If an adapted run **GREENS**, the plan AS EXECUTED becomes the bridge's next **version**;
  prior versions are kept in its history. That is run-as-executed inheritance (PRD §2): the
  artifact that inherits is the one that actually ran, not the one that was proposed.
- If the run ends **RED**, the bridge is **untouched** and takes a demotion mark (D6).
- **No healing at minting.** Healing happens at reuse; only a green writes the box.

*Leans on:* run-as-executed inheritance (PRD §2 / §3 design laws); "first green mints" as
already practised by `run-u.mjs`; the general rule that a red mints nothing (an already-green
step records `already-green`, never `green`, for the same reason — unearned credit poisons
the N3 evidence).

### R2 — "same job" means the same SHAPE, never the same instance

This settles v1.27's unruled condition 2. If a bridge could be offered because two runs share
a *patient*, the registry becomes a lookup table and the N3 memorization audit kills it.

**v1 concrete rule:** two jobs match when their **close stages are the same kind of
inspection** — never when they merely share a patient.

*Leans on:* the N3 kill-switch (rules must transmit across NON-identical runs); the
memorization audit (general rule vs memorized answer); PRD v1.34 item 2.

### D1 — storage: a `bridges/` registry of plain files

A registry of plain files. No database, no new dependency (one-production-dependency bar;
vanilla → stdlib → external).

Each entry carries:

- the plan **as executed** (post-replan — the run-as-executed artifact, per R1);
- the **spec hash** that was signed when it greened;
- the **green that minted it**, and that green's **cost / time / rounds**;
- the **per-run history** (D6).

Consolidating today's per-patient spine-dir bridge files (the five above) into the registry
is **part of the build** — they are the registry's seed data, not legacy to abandon.

Storage LAYOUT stays housekeeping and stays minimal until something reads it back — hamr's
earlier correction stands: housekeeping must not be dressed as a design tension while nothing
consumes it.

*Leans on:* PRD §2 (every inherited rule carries the green that minted it and the contrast
that attributed it); F6 (cost/time recorded honestly — an unknown is recorded unknown, never
0); the dependency hierarchy.

### D2 — matching, split in two: an exact mechanical GATE (code) and a similarity JUDGMENT (LLM)

The two halves are deliberately not the same mechanism.

- **The MECHANICAL gate is exact, and it is code.** A bridge is legal to load only if it
  **validates against THIS job**: verdict type, close-stage kinds, and tools within the signed
  menu. This is the v1.34 item-4 rule made concrete — a stored plan is never executed
  unchecked, and a bridge that no longer validates is a distinct outcome, not a crash.
- **The SIMILARITY judgment — "close enough to be worth starting from" — is the LLM's call at
  selection time** (D3).

**NO similarity engine in v1.** Auto-matching is a later rung, **after humans have been
watched matching**. Building a matcher now would mean inventing a threshold from n=2 — and a
threshold is never picked by the agent from a small observed sample; threshold-setting is
arbiter territory, reserved for hamr's explicit call.

*Leans on:* PRD v1.34 item 4; the arbiter split (validators are code, judgment is not);
"a budget/threshold number is never fitted to a small sample" (F63's non-fitted 0.5).

### D3 — selection: a named LISTING the user can always inspect; the LLM picks by default

hamr, verbatim:

> *"i think there should be a listing for workflows names that user can choose or auto-choose,
> or do we want llm to always decide (we still need to keep a way for user to inspect and view
> existing workflows, maybe even as an option to select multiple but llm can override and say
> none matches the ask and that agent has to create a new one, this way we keep both options
> while deferring to llm to choose)"*

The listing shows, per bridge: **name**, the **job sentence it greened**, **status**
(candidate / proven), **greens / reds**, and the **cost / time of its greens**.

- **Default flow:** the LLM reads the ask and the listing and **picks** — or declares *"none
  matches, drafting new."*
- **The user may override:** pin one bridge; shortlist several for the LLM to choose among; or
  force cold.
- **The LLM may refuse a pinned bridge only EXPLICITLY, with a reason** — never silently
  ignore the user's pick.

**Choosing is not authoring,** so the standing doctrine holds unbroken (hamr, PRD v1.28:
*"there shouldn't be user authoring anywhere, that defies the point of bareloop"*). The user
selects among workflows the agent authored and greens minted; the user never writes a step, a
check, or a plan.

### D4 — the bridge is a STARTING DRAFT, not a contract

hamr, verbatim:

> *"what if a picked chosen workflow is 80% identical and agent can tweak, that would save
> time and efforts, first green mints rule stays the same with reused bridges"*

At **draft time** the agent tweaks the loaded bridge freely — reorder steps, swap verbs,
narrow scopes. The tweaked plan then passes **the SAME validator as any fresh draft**: no
second, looser path exists for an inherited plan.

**First-green-mints is unchanged:** a tweaked bridge that greens is minted **as executed**, as
that bridge's next version (R1).

*Leans on:* the drafter is the author (PRD §3 — the agent authors its workflow); one
validator, never two (the two-transforms class); R1's run-as-executed rule.

### D5 — mid-run revision bound: exactly the cold plan's one-replan ceiling

A reused plan gets **exactly** the cold plan's one-replan ceiling. **No extra revision
allowance because "it's healing a recipe."**

- **Draft-time tweaking: unlimited** (D4 — it costs one draft and is validated like any other).
- **Run-time revision: the same ceiling as today** — one replan.

*Leans on:* v1.22, verbatim law — unlimited revision launders thrash as adaptation; PRD v1.34
item 5 explicitly warned this ceiling must not be quietly reopened by the reuse rung. It is
not reopened.

### D6 — status, demotion, and the deliberate ABSENCE of a score

hamr on the entry bar, verbatim:

> *"i think list has to contain any workflow that greened at least once to nominate being
> added to the bridges/plans list to avoid clutter"*

**Status is coarse and mechanical:**

- **CANDIDATE** — 1 green.
- **PROVEN** — greened on **≥2 distinct patients**.
- **A red on a PROVEN entry drops it to CANDIDATE.**

**Entry bar: at least one green.** Failed plans never enter the registry — that is also the
clutter control (hamr's point above).

**Full per-run history is recorded and SHOWN at selection:** green/red, cost, time, rounds,
outcome, and **which stage rendered the red**.

**NO probability / likely-to-succeed score, on purpose:**

- last-run-only makes one bad day demote a good recipe — **n=1 is an anecdote in either
  direction** (F24's withdrawal minted exactly this: a RED at n=1 is as much an anecdote as a
  green);
- a percentage from 2–3 runs is fake precision;
- **if a score ever earns its way in, its threshold is hamr's**, set from a measured base rate
  — never fitted to the sample in hand.

**Demoted-out entries stay in the record, with the red that demoted them** — the ledger runs
both directions (PRD §2's attribution law: the green that minted it AND the contrast that
attributed it).

**drift-red** (v1.21 requirement (a)) is the **arbiter-side** watcher for staleness:
flag-not-rollback (rollback is merge-class, human), must-fail fixtures before it is trusted,
threshold from a measured base rate. Built later in this rung (§5).

### D7 — the reuse ENVELOPE: operator-signed up front, never widened mid-run

hamr, verbatim:

> *"part of reuse we ask user for cost/time and how many workflows to try before starting new
> like $5 and 30 mins x2 then start anew if both red"*

The envelope is signed by the operator **before the run**, and carries three numbers:

1. **per-try budget** (hamr's example: $5);
2. **per-try wall** (30 min);
3. **how many bridges to try before going cold** (×2, then start anew).

**The agent never widens it mid-run** — the advertised budget and the enforced budget are the
same number, and the agent may only tighten (PRD doctrine; `maxWallMs` is always explicitly
operator-set, never defaulted, so a cap is never a silent second ceiling).

**Each red returns DECISION-READY:** which bridge, which stage rendered the red, the gap
trend, and spend/time reported honestly per F6 (unknown is unknown, never rendered as 0).

**Fallthrough** to the next bridge, or to cold, is automatic **only because it was
pre-authorized in the envelope** — merge stays human forever, without per-failure nagging.

**F45 guard, restated for each try:** a try's budget must fund **the attempt PLUS its close**.
A cap that dies mid-grading produces an unreadable row, and an unreadable row is a casualty,
not evidence.

### D8 — the scout stays ON under reuse in v1

The recipe came from a **different patient**, and F60 measured that the scout is load-bearing
cold: scout-on plans carry ~15× more real-file references (vs guessed nulls) and declare ~3×
more work. A reused plan that has never seen this patient's files is exactly the case that
needs it.

**Whether a reused bridge can scout LESS is measured later, not assumed** (§4).

### D9 — the PRE-PROBE gates the build (v1.21 requirement (b))

Draft-only, three arms, **sub-dollar**, fired **BEFORE any inheritance machinery is built**.
Full pre-registration: **`docs/02-experiments/REUSE-PREPROBE-PREREG.md`** (frozen the same
day; it does not collide with the F51–F55 `N3-PREPROBE-PREREG.md`, which is CLOSED).

**A limited-budget real EXECUTION run is the SECOND instrument**, fired only if the drafts
differ — and that is **hamr's call at that point**, not a standing authorization.

*Leans on:* CL-BENCH (memory systems LOSE to plain ICL once base capability is subtracted) —
so the cheap instrument runs before the expensive build; F51–F55 (lineage transmits, F51
winShape 3.00 → 4.00, but the cold planner was already at ceiling on TESTGEN and every finding
was genre-bound); "build the CHEAP instrument first"; "measure the surface before building a
feature."

## 4. The three carried v1.21 requirements, and where they land in this rung

| requirement | lands |
|---|---|
| **(a) `drift-red` detector** — arbiter-side trailing green-rate vs mint-time baseline, flag-not-rollback, must-fail fixtures, threshold from a measured base rate | **after** the registry and reuse path exist (D6 names it as the staleness watcher). It needs a population of reuse runs before a base rate can be measured at all. |
| **(b) three-arm control** — ON+lineage / ON-mechanical / OFF, gated by a sub-dollar pre-probe | **the pre-probe is D9**, and it is the FIRST thing this rung fires. The three-arm control itself falls out of normal operation (reuse = ON, from-scratch = OFF) per PRD v1.27's redefined acceptance. |
| **(c) bound-pressure ledger fold** — "step X capped M of N runs"; acceptance = it can surface the F37/16g rounds-vs-money bind from archived spines | **with the ledger work in D1/D6** — the per-run history it needs is the same history the listing shows. |

## 5. Build order within the rung

1. **Pre-probe (D9)** — draft-only, three arms, $1 hard cap. Nothing is built first.
2. **Read the pre-probe against its frozen discard rules.** The result selects the shape:
   - readable-lineage arm dead → build the **mechanical-start** path only;
   - mechanical-start arm dead at draft tier → recorded, decision to hamr;
   - mechanical path lives → proceed.
3. **Then the machinery, per that result** — registry (D1) with the five existing bridges
   consolidated, mechanical gate (D2), listing + selection (D3), draft-time tweak path (D4),
   envelope (D7), status/history/demotion (D6).
4. **Then requirement (c)** (bound-pressure fold) on the history the registry now holds.
5. **Then requirement (a)** (`drift-red`) once a measured base rate exists.

The execution probe (D9's second instrument) fires between 2 and 3 **only on hamr's word**.

## 6. What this record deliberately does NOT decide

Named here so none of it can be quietly assumed later — each with its owner.

| not decided | owner |
|---|---|
| **The similarity engine / auto-matching threshold.** No matcher in v1 (D2). It is a later rung, after humans have been watched matching. | hamr — a threshold is arbiter territory, set from a measured base rate, never fitted to n=2. |
| **Scout-shrink under reuse.** The scout stays ON in v1 (D8); whether a reused bridge can scout less is a MEASUREMENT, not an assumption. | a later measurement in this rung; nothing may assume it. |
| **Any probability / likely-to-succeed score, and its threshold.** Deliberately absent (D6). | hamr, from a measured base rate, if it ever earns its way in. |
| **The execution-probe GO.** The limited-budget real execution run is the second instrument and is not authorized by this record (D9). | hamr, at the point the draft read lands. |
| **`drift-red`'s threshold.** Named in D6, unset here. | hamr, from a measured base rate; must-fail fixtures before trust. |

## 7. Amendment discipline

hamr's signature includes *"and change as needed"*. That means POC and pre-probe results
**may amend this record — by DATED ADDENDUM, never by silent rewrite.** The design record
convention holds: closed records are amended, never rewritten; a frozen rule is never loosened
post-hoc to convert a miss into a pass; an acceptance criterion may be corrected for principle
BEFORE measurement, never re-amended after one.
