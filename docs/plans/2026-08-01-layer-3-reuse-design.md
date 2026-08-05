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

---

## Addendum — 2026-08-01 (D2 SPLIT: the load gate checks SHAPE; the full validator checks the TWEAKED DRAFT — hamr; plus the execution probe GO)

**hamr's ruling, verbatim, 2026-08-01 in-turn: *"agreed to all cont"*** — agreeing to (a) the
D2 gate split recorded below, (b) the operator's anti-gloss reporting procedure, and (c)
firing the execution probe before the machinery build.

### What forced this

The pre-probe's **$0 deterministic** finding (pre-fire addendum §5(a) of
`docs/02-experiments/REUSE-PREPROBE-PREREG.md`): **a bridge storing instance paths reds
`validatePlan` against ANY other patient.** On the aurora→litectx pair the count is **6 reds**
— *invalid-value* on both scope fields, and *scope-escape* on both targets and both
`tree-changed` exit scopes.

**D2 as frozen — *"legal to load only if it validates against THIS job"* — would therefore
refuse EVERY cross-patient bridge.** The gate as written kills all reuse at the door. And it
would do so while the same probe showed **the drafter handles instance-path replacement
itself**: all three arm-C drafts were **legal after tweak** (3/3, `validatorOk: true`, zero
reds). The gate was rejecting exactly the material the drafter then fixed unaided.

### The RULED shape (hamr, 2026-08-01)

**D2 splits into two questions, asked at two times.**

1. **LOAD-TIME — the shape-compatibility gate.** A bridge is legal to LOAD if:
   **verdict type matches**; **close-stage KINDS match**; and **the bridge's verbs fit within
   THIS job's signed tool menu**. **Nothing about paths, scopes, or targets** — those are
   instance-bound and are **expected to red**. A bridge that fails the load gate is the
   **"recipe-stale / wrong kind"** outcome: **refused at the door, cold drafting offered.**
2. **DRAFT-TIME — the full validator, unchanged.** The **tweaked** plan passes **the SAME
   `validatePlan` every cold draft passes**. **No second, looser path exists for an inherited
   plan** (D4, unchanged).

**Nothing executes without full validation.** Only **WHEN** each class of check applies moved.
**The arbiter is untouched: both halves are code; the agent authors neither.**

### The kid-version framing, recorded because it is how the ruling was explained and agreed

> *"Is this the right KIND of recipe?"* is answerable **at the box**. *"Does it name today's
> bricks?"* is only meaningfully asked of **the finished, tweaked plan** — **every recipe from
> a different day names yesterday's bricks, and that is what a recipe IS, not a flaw.**

### Operator procedure hamr agreed to (binding on READS, not on the library)

Every experiment read gets an **adversarial self-audit before reporting**:

- **construct check** — what was MEASURED vs what was CLAIMED to motivate it;
- **deviation × axis interaction sweep** — every implementation deviation crossed against every
  read axis;
- **power statement in the headline sentence** — n and its qualifier travel with the claim, not
  a footnote;
- **refute-your-own-headline pass** — the read must attempt to kill its own conclusion before
  it is reported.

This binds the operator's reporting. **It changes no library code and no arbiter behaviour.**

### The execution probe: GO

D9's second instrument — the limited-budget real execution run — was **not authorized by this
record** (§6, owner: hamr, at the point the draft read lands). **hamr's *"agreed to all cont"*
is that authorization**, and it fires **BEFORE the machinery build** (§5's step 2→3 boundary,
*"only on hamr's word"* — that word is now on record). Full pre-registration:
`docs/02-experiments/REUSE-PREPROBE-PREREG.md`, addendum *EXECUTION PROBE PREREG*, frozen
before firing.

*Leans on:* the amendment discipline of §7 (dated addendum, never silent rewrite); D4 (the
bridge is a starting draft, not a contract — now the gate agrees with it); the arbiter split
(validators are code either side of the move); "a frozen rule is corrected for principle
BEFORE measurement, never re-amended after one" — the pre-probe fact that forced this is $0
and deterministic, established by the validator, not by a paid measurement anyone is fitting
to.

---

## Addendum — 2026-08-02 (the machinery runs end to end: the D2-split gate LIVE, the first proven bridge, two false-proven doors closed, the circuit breaker, and hamr's two rulings this session)

**This addendum records what the paid runs and the review did to the frozen record. It amends;
it rewrites nothing above. Where a decision is unchanged it is not restated.**

### 1. The D2-split load gate, live

The split ruled the day before was exercised for real on `reuse-msarycnt.jsonl` (2026-08-01),
and it behaved as the ruling intended in the hardest available case.

- **At the door**, the gate admitted `aurora-u-spawner-types` for a litectx job: same verdict
  type, same close-stage kinds (`changed-from-seed` → `typecheck` → `suite-green` →
  `no-suppressions`), verbs inside the signed menu. It asked **nothing** about paths, scopes or
  targets — which is the whole point, because the stored plan names
  `packages/spawner/src/aurora_spawner/*.py` and the patient is a JavaScript repo.
- **At draft time**, the tweaked plan named `src/impact.js` and `src/tsalias.js` and passed the
  ordinary `validatePlan`. No second path, no looser path.
- The kid-version framing held literally: *every recipe from a different day names yesterday's
  bricks.* On this run they were yesterday's bricks **in another language**, and the drafter
  replaced them unaided.

### 2. What the validation run returned — and the one number that is NOT claimed

Full read: **F73** in `docs/FINDINGS.md`. In one line each, so this record is self-contained:

- **Try 1** picked the same-repo `litectx-u-types` ("a direct match"), used its one replan, and
  **cap-halted on attempts with the close never reached** — $4.7442 / 222 rounds / 27.4 min,
  `closeReached false`, `capBound false`, `wallBound false`. The envelope was never the binding
  constraint; the plan's own attempt ladder was.
- **Try 2** picked the cross-language `aurora-u-spawner-types` ("same kind of work… despite the
  language/tool difference") and **greened** — $1.3971 / 52 rounds / 14.65 min, one outer
  fix-loop conversion off a `no-suppressions` red.
- `reuse-end green`, `triesUsed 2/2`, **$6.1467**, writes `appendCasualty litectx-u-types` +
  `appendGreen aurora-u-spawner-types`.
- **`aurora-u-spawner-types` is now `proven`** — greens on `aurora-u` and `litectx-u`, the
  programme's first entry to clear D6's two-distinct-patients bar.
- **No cost lift is claimed.** The whole run cost more than both cold litectx greens ($4.2942 /
  $5.7655), and the per-try comparison is unusable: the runner deliberately does not reset the
  patient between tries, so try 2 ran on the tree try 1 left after $4.74 of edits — its own
  close names suppressions in files it never targeted. D9's second instrument answered
  *"does the machinery work end to end"*, not *"is reuse cheaper"*.

### 3. Amendments to the locked decisions

| decision | as frozen | as built, and why |
|---|---|---|
| **D6 — demotion** | *"A red on a PROVEN entry drops it to CANDIDATE."* | Built as **a GRADED red**: only the literal `escalated` outcome demotes. A try whose close never rendered a verdict **judged nothing**, so it demotes nothing — it is written as a **casualty row** carrying its own outcome string (`step-red:<step>`) plus honest cost/wall/rounds, and it **IS shown at selection**. Live proof both ways: try 1's casualty row left `litectx-u-types` undemoted, and the next day's selector read that row and cited it verbatim (*"despite its last run ending red"*) before picking the bridge anyway. |
| **D1 — storage / attribution** | an entry carries the patient the green ran against | The two writers had drifted to **two spellings of one patient** (`consolidate-bridges.mjs` wrote the spine-dir `litectx-u-bareloop`; `run-reuse.mjs` writes the workdir `litectx-u`), and D6 counts distinct patient STRINGS — the live registry was **one green away from a false `proven`**. Canonical slug = the patient workdir basename; consolidation now derives it from the `<patient>-bareloop` convention and **refuses** a directory that does not carry it. Migration applied to the live registry (`bd04ade`). Full read: **F74**. |
| **D1 / D6 — the cold leg's write** | *(not decided — the record did not anticipate two closes under one job slug)* | **New rule:** a cold green may append to an entry of the job's name only when the entry's close is the **same shape**, checked with the load gate's own predicate. A mismatch **forks** to a deterministic `<job>-<sha256(stages)[0:8]>` with the fork on the write record — never appended onto the wrong close, never discarded (`33b104e`). |
| **D7 — the envelope** | three operator numbers, signed before the run | The signature now covers **all three**, via the wrapper `{schema:'reuse-v1', spec, bridgeTries}` hashed by `reuseSpecHash` — see §4. Signed live at `$10 / 45 min / ×2`, larger than the record's illustrative `$5 / 30 min / ×2`. |

### 4. hamr's two rulings this session, verbatim

**(a) The try count is part of the signature.**

> *"fold tries into the hash"*

A reuse run authorizes `perTryBudgetUsd × (bridgeTries + 1)`, so signing the per-try spec alone
signs a fraction of the money and prints the same hash for `--tries 2` and `--tries 9`. The
signed artifact became the wrapper `{ schema: 'reuse-v1', spec, bridgeTries }`
(`reuseSpecHash`, composed from the one `jobSpecHash` — MED-1's resolved-tools pinning
inherited, no second canonicalizer). Pre-fold signatures are refused naming the scheme change;
there is no legacy acceptance path. Putting `bridgeTries` on the job spec was **refuted by
test** — `validateJob` reds unknown fields, so it would have job-red'd every try. (`f44526e`)

**(b) Resume restarts the STEP, not the try.**

> *"even if it gets killed by outside, it should allow resume and start last step instead from
> the beginning, why would i want to waste more money on something i already started, our goal
> is to find ways to save money and time"*

This supersedes the try-level reading of the earlier checkpoint ruling (*"money, signature and
checkpoint (starts from where it stopped) if mid loop, restart that loop"*), on measured
evidence from the live three-kill validation: $0.25 then $0.40 of scout re-paid across two
resumes, and a third leg left structurally unable to finish. The checkpoint is a **completed
step's exit** — the finest unit the spine can prove and the tree can show; try-restart survives
only for death before a plan was accepted. Full read: **F75** (the external-stop class) and
**F76** (the granularity measurement).

### 5. The circuit breaker, and where each piece landed

F72's four parked pieces, closed this session:

| | landed | commit |
|---|---|---|
| **A** liveness contract | an operator PROCEDURE the runner PRINTS (`systemd-inhibit --what=idle:sleep`), never shelled out to — no process can assert its machine will stay awake, and a harness taking a system lock nobody asked for is the wrong side of the line | `scripts/run-reuse.mjs` |
| **B** kill checks before it kills | watchdog pre-kill report extended (`pidAlive`/`pollMs`/`termGraceMs`, atomic write, report failure can never defeat the kill, `SIGKILL` escalation announced), kill tests at production window:poll ratios | `4278ad6` |
| **C** resume after kill | `--resume` reading the dead run's own spine; remainder-funded, signature-gated both ways, liveness-gated, patient never reset | `c04cdcf` (try-level) → step-level per §4(b) |
| **D** BA-19 `deadlineMs` unparked | per-call deadline from the REMAINING wall; no `maxWallMs` → no deadline; `EDEADLINE` split expired→wall-halt / time-left→provider-red, F64's control pinned by a must-not-change test | `4278ad6` |

### 6. What this addendum does NOT decide

Unchanged from §6 above, plus one item the paid runs put on the table and deliberately left
there: **the selector's stated reason was a poor predictor at n=1** (it called the failing
bridge a *"direct match"* and the winning one a *"same-kind analog"*). That is the exact axis an
auto-matcher would be built on, and D2's "no similarity engine in v1" stands — a matcher fitted
to two picks is a threshold fitted to n=2, which is hamr's territory and nobody else's.

---

## Addendum — 2026-08-05 (D6's rules are now ENFORCED and one of them was never written down; D7's "gap trend" is superseded by one instrument; the build order absorbed unplanned governance work)

Three commits since the last addendum touch this record: `ae417ae` (the money-halt package),
`12d997f` (trend unification + the resume seed) and `f2be2b6` (the whole-branch review round).
Reads: **F82**, **F83**, **F84**; PRD addenda **v1.46–v1.49**. None of them reopens a locked
decision — this addendum records where the record has fallen behind the code, and one rule the
code has always had that the record never stated.

### 1. D6 — the graded-red amendment is now ENFORCED, and the RE-PROMOTION rule is stated here for the first time

The 2026-08-02 addendum amended D6 so that only a literal `escalated` outcome demotes; a
casualty judged nothing and demotes nothing. **That amendment had no test that could fail it
until 2026-08-05.** F84's review found the hole by mutation: a widening of `REUSE_GRADED_RED`
— the set whose members demote a proven entry — survived the entire suite. It is now pinned
outcome by outcome (`escalated` demotes; `step-red`, `cap-halt`, `wall-halt`, `provider-red`,
`close-red`, `step-stalled` and `pricing-red` are casualties, and proven stays proven). The
decision is unchanged; what changed is that it is now protected rather than merely documented.

**Never stated in this record, and it should have been:** `deriveStatus` treats a demotion as
**clearing the distinct-patient set**, not as a one-notch step down. A demoted entry is
therefore re-promoted only by **two fresh greens on two distinct patients** — the earlier
greens do not count again. That is the strict direction and matches D6's own reasoning (a
status is a claim about transmission across non-identical runs, and a red is evidence against
the claim as it stood), but it was implementation-only until now. Recorded, not changed.

Two smaller D6/D1 facts the code carries and the record did not: an unattributable green (no
patient string) cannot prove a second instance and is skipped for status; and `reds` in the
listing counts the literal `red` outcome only — a casualty is not a red in the count for the
same reason it is not one in the ladder.

### 2. D7 — "the gap trend" in the decision-ready return is superseded by ONE instrument

D7 promises that each red returns decision-ready with *"which bridge, which stage rendered the
red, the gap trend, and spend/time reported honestly per F6"*. The promise stands; the
instrument behind the middle clause has been replaced twice since:

- `gapTrend` — byte-equality of the last two close gaps — is **deleted** (`12d997f`). Both
  governance halts now read the run's own per-stage numeric trend (`src/trend.js`); the byte
  comparison survives only INSIDE `unknown` as a `motion` field and is never promoted to a
  direction.
- The decision-ready return is no longer only a try row: a run cut by its wallet emits a
  `money-halt` record (kept verdict, `budgetUsd`, `remainingUsd` **with its own
  `spendComplete`**, trend + reading + series, three levers), mirroring `wall-halt` (PRD v1.46
  §2 / v1.49 §1).
- A resumed leg's readout **spans the chain** — hamr's ruling, PRD v1.49 §2: the halt readout
  is the consolidated money/time view across the chain, the strike governor stays leg-local,
  and the two are never mixed.

**D7's "never widened mid-run" also got a launch-side edge** (F84): a per-try wall remainder of
zero now REFUSES the launch at both runners and at the outside watchdog, rather than launching
under a guard that silently defaulted an unarmed deadline. Two zeros, two levers — a burned
restart wall wants `--wall`, a run whose authorized attempts have all run wants `--tries` —
and both are in the approval hash, so either is a new signature. The envelope decision is
unchanged; this is the refusal it always implied.

### 3. §5's build order — the sequence, and the two requirements still outstanding

The order as written stands. What it no longer describes is the actual sequence: between step 3
(the machinery) and step 4, the rung absorbed governance work this record did not anticipate —
the money-halt package and the close-fix loop's progress governor (PRD v1.46), step-level
resume, the step strike ladder replacing the fixed iteration count (PRD v1.45), and the trend
unification and its resume seed (v1.49). None of it changes a locked decision here; all of it
had to land before a reuse run's reds could honestly be called decision-ready.

**Still outstanding, unstarted, and unchanged in ownership:** requirement (c), the
bound-pressure ledger fold, and requirement (a), `drift-red` — which still needs a population
of reuse runs before a base rate can be measured at all, and whose threshold is still hamr's.

### 4. What this addendum does NOT decide

Unchanged from §6 and from the 2026-08-02 addendum's §6. Added to the list: **the close-stage
AXIS SPLIT** — one close stage can red on two structurally different populations under one
name, which the trend's per-stage bucketing cannot see. It ships as a documented KNOWN LIMIT;
the root fix is a stage split in the shipped closes, which changes stage names inside signed
specs and is therefore **hamr's to sign** (F84; PRD v1.49 §4).
