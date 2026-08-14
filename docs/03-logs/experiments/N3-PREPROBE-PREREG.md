# N3 lineage PRE-PROBE — pre-registration (FROZEN before any number)

**Date frozen:** 2026-07-24 · **Rung:** Layer 3 (N3 inheritance), opening gate ·
**Status:** pre-registered, NOT yet run · **Owner:** hamr sign-off before firing.

Freeze discipline (memory): pre-register patients, arms, reading rules, and decision
rules in a COMMIT before any number exists; frozen rules are never loosened post-hoc.

---

## 1. The decision this probe gates (why it exists)

Layer 3 could give a run three relationships to the last run:

- **OFF** — every run starts from scratch (today; the control).
- **Mechanical** — the scaffolding silently reuses the plan that greened last time; the
  agent reads nothing.
- **Readable** — the agent is *shown* the prior run's lineage as context and is expected
  to reason from it.

This probe tests **only the Readable arm**, cheaply, BEFORE any inheritance machinery is
built. It answers ONE question: **does putting the prior run's lineage in the drafter's
hands change the plan it writes — and change it the right way, as a general lesson rather
than a copied answer?**

- **Probe reads NO lift (predicted):** the Readable arm is DEAD. Layer 3 proceeds
  Mechanical-only + drift-red + bound-pressure fold; the later paired battery compares
  Mechanical-reuse vs OFF. We do NOT build agent-readable lineage.
- **Probe reads lift (general, not memorized):** the Readable arm is LIVE and worth
  building; the three-arm control keeps ON+lineage.

**This probe is triage, not verdict.** It can cheaply KILL the Readable arm. It CANNOT by
itself prove inheritance helps — that needs the full paired ON-vs-OFF battery (the N3
kill-switch) later.

## 2. Hypothesis + FROZEN prediction

- **H0 (predicted, F39/CL-BENCH):** NO lift. Lineage in hand does not move the drafted
  plan toward the winning shape on a non-identical target. "A learning claim is just a
  capability claim wearing a memory costume." F39 already showed hand-delivered full state
  bought zero conversion at the worker; this tests the same at the *planning* layer.
- **H1:** lineage moves the non-identical plan toward the winning shape, generally.

Prediction is registered so a NO-lift result is a confirmation we can act on, not a
disappointment we explain away — and a lift result is a genuine surprise that must survive
the memorization audit before it counts.

## 3. Instrument — the REAL drafter, lineage injected

The probe calls the real plan-drafting prompt `planPrompt()` (`src/planrun.js:71`) — the
same schema-description prompt the shipped system uses — with a **lineage block appended**
the way `failure`/`reds` already append. No toy prompt; we measure the real drafter.

- **Model:** `claude-sonnet-5`, `output_config.effort: 'low'` (memory: sonnet-5 adaptive
  thinking wastes ~$0.40/call returning empty at max_tokens; low ≈ $0.13, same quality of
  draft). Same model/effort/temperature across ALL arms.
- **Output graded:** the drafted plan-v1 JSON (the `steps[]`), nothing downstream. No loop
  runs, no worker, no close. This is a single model call per sample.
- **Shared prefix cached** (schema desc + scout blob) across arms so input cost is near-zero
  after the first sample.

## 4. Patients — source (green) and target (non-identical)

- **Source lineage:** job #4 TESTGEN on aurora's orchestrator — the ACCEPTED job (F47),
  greened traces on hand (67.5 / 55 / 55). Lineage = its as-executed green run.
- **Target (non-identical), NAMED:** the SAME TESTGEN job shape on
  `packages/soar/src/aurora_soar/phases/assess.py` (1,148 lines — Phase-1 complexity
  assessment, class `ComplexityAssessor` with pure scoring methods `_score_lexical`,
  `_detect_critical`, `_calculate_confidence`, `_score_keywords`, … + module fns
  `_assess_tier1_keyword` / `_assess_tier2_llm` / `assess_complexity`). Same
  behavior-asserting genre (exact scores, thresholds, tuple returns, tier routing) but a
  COMPLETELY different function-set from the orchestrator — so a *copied* answer mis-aims
  and the memorization audit is sharp; related domain so a *general method* transfers. The
  probe needs only the target's spec (goal with a survivor scoreboard over assess.py's real
  functions / check NAME `clean-run` / writeScope `tests/testgen_assess/**`) + a read-only
  scout blob (the function inventory) — NOT a runnable close (no loop fires).
- **Source lineage payload:** the greened run `mrvwjrop` (outcome green, $4.73, 6 steps,
  no replan) — its as-executed plan is snapshotted for the harness.
- **Non-identical is mandatory** (N3 kill-switch): lineage must transmit across
  non-identical runs, else it is memorization, not learning.

## 5. Arms (frozen)

Per hamr ("try everything and see how it works"), several lineage payload forms run side by
side — if NONE moves the plan, the Readable-arm-dead verdict is unarguable.

**Stage 1 — the decisive KILL test (sub-dollar, run first):**

| arm | spec drafted for | lineage in hand | role |
|---|---|---|---|
| **A0** | target module | none | OFF base rate (target) |
| **A1** | orchestrator | none | OFF base rate (source) |
| **P** | orchestrator | orchestrator's own green trace (IDENTICAL job) | **positive control** — MUST move vs A1 if the channel is live |
| **T-full** | target module | orchestrator full as-executed trace | fullest non-identical payload |

**Stage 2 — "which notes" (run ONLY if Stage 1 shows movement on T-full):**

| arm | spec drafted for | lineage in hand |
|---|---|---|
| **T-plan** | target module | orchestrator's accepted plan only |
| **T-lesson** | target module | a one-line distilled lesson |
| **T-check** | target module | the winning `check-passes` composition only |

- **n = 8 samples per arm** (worker is nondeterministic; n=1 — red OR green — is an
  anecdote; establish the OFF distribution as the base rate before reading any ON arm).
- Staging rationale (cheap-first doctrine): if the FULLEST payload (T-full) does not even
  move the plan vs A0, lighter payloads cannot, and Stage 2 is skipped — the KILL lands
  under $1. Stage 2 spends more only when there is a signal to localize.

## 6. Budget (frozen, cap-not-estimate)

- **Stage 1 cap: $1.00.** 4 arms × 8 = 32 sonnet-5 low-effort drafts, small JSON output,
  cached prefix ≈ $0.80 expected.
- **Stage 2 cap: +$1.00** (only if triggered). **Total hard cap: $2.00, instrument-stops
  at the cap** (memory: a budget must fund the work; a bind mid-run is a casualty STOP, not
  evidence).
- Provider-red rows (Overloaded / transport) are **casualties, never data** — probe with
  the battery's own model (2 consecutive 200s) before firing; reruns replace only the
  incomplete arm.

## 7. The READ — "better plan" made objective (frozen rubric)

Grading is on the drafted plan JSON only, blind to arm where a human/model judges.

**Gate 1 — does lineage MOVE the plan at all?**
Structural difference between an ON plan and its OFF baseline (same spec): set of
{step ids, tools per step, exit types, check names, target scopes}. If ON ≈ OFF (the
drafter ignores the lineage), the arm is DEAD at Gate 1 — no lift is possible. Cheap,
deterministic, computed from the JSON.

**Gate 2 — does it move the RIGHT way?** (only for arms that pass Gate 1)
Score each plan 0..5 on FROZEN winning-shape features distilled from the F47 greens —
**deterministic parse of the plan JSON** (stronger and more reproducible than a blind
judge; memory: deterministic where possible):

1. composes a `check-passes(clean-run)` step exit;
2. EVERY write step pairs that check with a `tree-changed` exit (the F17 pairing law);
3. sane per-step `rounds` bound (all steps < 40, i.e. not maxed);
4. **aim** — names ≥3 of the target module's survivor functions (string-match against
   assess.py's real function inventory);
5. used the `edit`-to-sharpen move (the winning run's final step).

Lift = ON's winning-shape score distribution is higher than its OFF baseline's, beyond the
OFF sample spread.

**Memorization audit (gates any lift), deterministic:** does an ON-non-identical (TARGET)
plan reference any SOURCE-ONLY function name — orchestrator methods (`_check_soar_cache_hit`,
`execute`, `_phase3_decompose`, `_configure_health_monitoring`, …) that do NOT exist in
assess.py — via string-match? Any such leakage is COPYING, not learning, and that plan is
scored NOT-lift. Only a *general* feature transferring (the method: clean-run pairing, aim
at the target's own functions) counts as lift. (memory: general rule vs memorized answer.)
The grader validated on a self-test: the real green orchestrator plan dropped into a target
slot fires the audit (19 source names); an ideal target plan reads memoHits 0; a degenerate
plan scores winning-shape 0.

**Harness:** `scripts/n3-preprobe.mjs` (collection — the real drafter, lineage appended) +
`scripts/n3-preprobe-grade.mjs` (this read, re-runnable without spend).

## 8. DECISION RULES (frozen, before any number)

Read in this order:

1. **Positive-control readability gate (blind-instrument guard).** If **P does NOT move
   vs A1** (identical-job lineage fails to change the plan), the channel is blind or the
   instrument is dead — a NO-lift reading on the non-identical arms is **UNREADABLE and
   WITHDRAWN**, not a clean negative (memory: an unconnected instrument reading zero is not
   a finding). Fix the instrument, re-run. The probe only reports a lift/no-lift verdict
   when P has moved.
2. **Given P moved — the verdict on the Readable arm:**
   - **No ON-non-identical arm passes Gate 2 with a general (non-memorized) lift** →
     **Readable arm DEAD.** Layer 3 = Mechanical-only + drift-red + bound-pressure.
     (Predicted outcome.)
   - **≥1 ON-non-identical arm shows a general Gate-2 lift** → **Readable arm LIVE.** Build
     agent-readable lineage; keep the three-arm control. Record which payload form(s)
     carried it.
3. **Drift-red and the bound-pressure fold stay PARKED** regardless — built after the
   probe, only if inheritance is worth building at all.

## 9. Must-be-able-to-FAIL / confound checklist (run before believing any number)

- **Can it show the negative?** The OFF arms and the positive control are the frame that
  lets NO-lift be a real reading, not a blind zero (§8 rule 1).
- **Can it show the positive?** P (identical-job lineage) is the arm that SHOULD move; if
  it can't, the whole probe is suspect. This is the pre-flight that the test can succeed.
- **Harness confounds:** same model/effort/temp across arms; ON and OFF plans drafted from
  byte-identical spec except the appended lineage block; grader blind to arm; the read is
  not structurally tied to which arm (guard against the F26 "names the withheld file"
  class).
- **Two should-differ arms producing identical plans** (e.g. T-full ≡ A0) is a FINDING (the
  lineage isn't wired into the drafter's context), not noise — audit before minting.
- **Truncation:** any draft with `stop == max_tokens` or empty text is EXCLUDED from its
  arm's denominator, never counted as a bad plan (memory: truncation ≠ miss).

## 10. What this probe does NOT conclude

- It does not prove inheritance helps (triage only; the paired battery is the verdict).
- It does not test the Mechanical arm (that arm needs no agent reading; it is not gated
  here).
- A NO-lift result does not close Layer 3 — it selects the Mechanical-only shape and saves
  the Readable build.

---

# AMENDMENT — 2026-07-24 (post-run; RESULT + a scope limitation in the frozen design)

The frozen design above was executed as written. Nothing below loosens a frozen rule
retroactively; this records what the run returned and what the design could not see.

## Result (Stage 1, 39 drafts, $1.31 of the $2 cap, 0 errors, 0 truncations)

Full readout: `docs/FINDINGS.md` F51. Evidence archived at
`docs/03-logs/experiments/n3-preprobe-data/` (`stage1-raw.jsonl`, `stage1-grade.txt`,
`source-lineage-plan.json`) — moved out of gitignored scratch so it survives.

- **Positive-control gate (§8 rule 1): PASSED.** P moved vs A1 (winShape 3.00 → 4.00), so
  the channel is live and the reading is VALID — not the unreadable blind-zero case.
- **Movement exists, but it is shape mimicry.** Tfull 4.88 vs A0 4.14; subtract the single
  lineage-named structural feature (`edit`-to-sharpen) and the arms collapse to 4.00 vs 3.86.
  `memoHits 0/8` — structural copying, not nominal copying.
- **Verdict against §8 rule 2:** the clean KILL did not fire (there IS movement), but the
  movement does not support building a readable arm — mechanical plan-reuse reproduces the
  same shape deterministically at $0. **Readable arm DEMOTED, not dead.**

## Scope limitation in this frozen design (logged, not smoothed over)

**§4's patient choice pre-solved the axis under test.** Job #4's spec hands the planner BOTH
the target (the survivor scoreboard) and an obvious strategy (assert exact current behavior).
The OFF arm therefore plans at near-ceiling COLD (aim 1.00, clean-run 1.00) — leaving no room
for lineage to lift the outcome-relevant axis. So this probe answered **"does lineage help
when the operator already knows the strategy?"** (no, only cosmetically) rather than the
question §1 framed. The untested case is bareloop's founding one: operator specifies the
target but NOT the strategy, and the strategy is non-obvious.

**The missing pre-flight.** §9 asked "can the test show the negative?" and that was satisfied.
It did NOT ask **"is there ROOM for the treated variable to move — is the CONTROL arm below
ceiling on the outcome-relevant axis?"** That check is added to the re-aim's freeze and should
be standing practice: a ceiling effect in the control arm makes every treatment arm unreadable.

**Instrument caveat (documented, never a result):** the `aim` rubric string-matches
`assess.py`'s inventory, so it reads 0.00 BY CONSTRUCTION for the source-spec arms (A1/P).
It cancels in the P-vs-A1 difference and is interpretable only on A0/Tfull.

## Stage 2: SUPERSEDED, retired unrun

§5's Stage 2 (payload localization — plan-only / one-line lesson / check-only) is formally
triggered (Tfull moved) and is RETIRED WITHOUT RUNNING: localizing which payload induces
cosmetic shape-copying does not inform the rung when shape-copying is not the deciding axis.
Recorded here rather than left dangling (the dead-pointer class this repo just cleaned out of
the Layer R default). If the re-aimed probe revives the readable arm, payload localization is
re-frozen then.

## Successor instrument (to be frozen separately, NOT authorized by this document)

A **hard-strategy pre-probe**: a job where COLD planning visibly picks the wrong/weak
strategy, plus a related prior run that discovered the right one; control-arm-below-ceiling
verified BEFORE firing. If lineage cannot improve the plan even there, the readable arm dies
cheaply. If it can, only the outcome-judged three-arm battery (ON+lineage / ON-mechanical /
OFF, judged on faults caught) can mint it.

## Execution deviations from the frozen text (logged, not smoothed)

1. **Model effort: §3 specified `output_config.effort:'low'`; the run used the provider
   DEFAULT (adaptive thinking).** The harness never wired the effort param. Impact assessed:
   (a) it is UNIFORM across all four arms, so every between-arm comparison — the entire read —
   is internally valid; (b) it is MORE faithful to the instrument under test, because the
   shipped drafter (`src/planrun.js`) does not set effort either — so §3's line was itself the
   error, imported from a memory about a different (cost-calibration) context; (c) cost impact
   was measured, not assumed: $0.035/call, and Stage 1 landed at $1.31, inside the $2 hard cap.
   No result is withdrawn; the frozen text is what was wrong, and it is corrected here rather
   than quietly conformed to.
2. **A1 ran n=15, not n=8.** The first launch was killed mid-run by a `timeout 600` wrapper
   (a harness-shell artifact, not a provider event: 0 errors, all rows priced and complete),
   leaving A0=8/A1=7; the completion launch re-ran A1 at n=8. All 15 A1 rows are valid drafts
   from an identical prompt and are kept — a larger OFF-source baseline is strictly more
   information, and discarding rows post-hoc to hit a round number is the fit-to-pass move
   this repo forbids. A0/P/Tfull are n=8 as frozen.
3. **No provider-red casualties occurred** (§6's casualty rule never fired): 39/39 drafts
   returned priced, non-truncated responses.

---

# RE-AIM SCREEN — candidate A (FROZEN 2026-07-24, before any number)

F51's scope limitation is the target: job #4's spec hands the planner the STRATEGY, so the
control arm sits at ceiling and no lineage arm is readable. Candidate A withholds the
strategy and asks whether that creates room.

## The manipulation (one variable)

`strippedSpec` = `targetSpec` with the strategy removed and nothing else changed.
**Classification line — what the GRADER MEASURES is kept; HOW TO SUCCEED is stripped.**

- **KEPT (target / arbiter / patient facts):** the goal ("strengthen the suite so it detects
  more faults"), the 15% current / 45 bar, the full survivor scoreboard (WHICH functions),
  the fault-type description (what the grader plants), the fence rules (writeScope, no source
  edits, no env/subprocess), "all existing tests must keep passing", the check/close
  mechanism, and the patient facts (debug flag, pure deterministic scoring, no network).
- **STRIPPED (strategy / method):** (1) "a test detects one by asserting the SPECIFIC current
  behavior: exact scores, tuple return values, threshold boundaries, tier routing"; (2) the
  whole "Testing standards: test behavior, not implementation; smoke asserts … are worthless;
  self-contained and deterministic" paragraph; (3) the prescribed sequence "Read the current
  tests first, then sharpen weak assertions and add behavior-asserting tests …".

This models the founding case: the operator specifies WHAT counts as success (always
operator-owned) but not HOW to get there.

## Screen design (cheap gate, ~$0.30)

- **Arm `S0`** — stripped spec, NO lineage, n=8. **Baseline for comparison = the existing
  `A0` rows (n=7 valid), already collected and paid for**, which used the identical spec WITH
  the strategy. One variable differs.
- Run `S0` ONLY. `Sfull` (stripped + lineage) is NOT run at the screen — it fires only if
  the screen shows room.

## FROZEN read + decision rule (the new pre-flight this run exists to apply)

The pre-flight F51 minted: **is the CONTROL arm below ceiling on the outcome-relevant axis?**

Measured deterministically on the plan JSON, over the concatenated step `action` text:
- **strategyExplicit** — the plan states WHAT to assert, via any of these specificity markers:
  `exact`, `specific`, `precise`, `return value`/`returns`, `boundary`, `threshold`,
  `tuple`, `expected value`. Reported as the rate of plans carrying ≥2 distinct markers.
- **weakStrategy** — the plan shows a known-worthless method: `not None`, `no exception`,
  `smoke`, or generic-only test prose with zero specificity markers.
- Plus the unchanged F51 rubric (winShape, aim, pairing) for continuity.

**Decision (frozen):**
- **S0 ≈ A0** (strategyExplicit still high, aim still ~1.00) → **stripping did NOT create
  room; the ceiling is the MODEL's own competence, not the spec.** Candidate A is DEAD as a
  probe patient. That is a real finding: on this job shape the planner supplies the strategy
  itself, so readable notes have no strategic niche here — escalate to candidate B (a patient
  whose obvious strategy structurally fails).
- **S0 materially below A0** (strategyExplicit drops, or weakStrategy appears) → **room
  exists.** Candidate A is a valid patient; freeze and run `Sfull` vs `S0` as the real ON/OFF
  read.

Budget: screen ≤ $0.50; the follow-on ON/OFF read ≤ $0.50 (both inside the original $2 cap,
of which $1.31 is spent).

## RE-AIM SCREEN — RESULT (2026-07-24): candidate A DEAD, escalate to B

`S0` n=8, 8/8 valid, 0 truncations, $0.26. Full readout: `docs/FINDINGS.md` F52.

**strategyExplicit: A0 1.00 vs S0 1.00 — identical; aim 1.00 in both.** By the frozen rule
that is "S0 ≈ A0" → stripping created NO room → **candidate A DEAD as a probe patient.** The
S0 plans reconstruct the deleted method themselves ("assert exact boolean/int return values",
"precise, exact-value tests (not just range/type checks)", "boundary-straddling cases"), so
the ceiling is the MODEL's competence, not the spec's generosity. `Sfull` is therefore NOT
run — the frozen rule gates it on room existing, and it does not.

**Instrument artifact logged:** `weakStrategy` (A0 0.43 / S0 0.00) is a FALSE POSITIVE — A0's
spec names "smoke asserts" as worthless, so its plans echo the term while prohibiting it, and
substring matching cannot separate prohibition from prescription. Invalid for any spec that
names its own anti-patterns; the primary axis (`strategyExplicit`) carried the decision.

**Spend:** $1.57 of the $2 cap ($1.31 Stage 1 + $0.26 screen). Candidate B needs its own
freeze and its own budget — it is NOT authorized by this document.

---

# VAGUE-ASK SCREEN — target withheld (FROZEN 2026-07-25, before any number)

F52 closed the METHOD axis (the model supplies a withheld method). This closes the other
half of "the ask could/couldn't be clear": the operator knows the BAR but not WHICH parts
are weak — the realistic form of "automate this job, I don't know the workflow".

## Manipulation (one variable)

`vagueSpec` = `targetSpec` minus the **survivor scoreboard** and the "target the functions
where planted faults currently survive" pointer. **The method stays** (F52 settled that
axis; changing two levers at once makes the delta unattributable). Kept, as always: the
15%/45 bar, the close/check mechanism, the fence, the fault-type facts, patient facts —
operator territory, never removable. Baseline = the already-paid `A0` rows.

**Design fact, not a confound:** the scout blob still lists the module's functions, because
a read-only scout is what the REAL flow provides. The withheld knowledge is which functions
are WEAK, not which exist — exactly the real asymmetry.

## FROZEN read

Applying F51's pre-flight (is the CONTROL below ceiling?), measured on the plan JSON:
- **discoversTargets** — names ≥3 real survivor functions (the unchanged aim metric).
- **topSurvivorFocus** — names ≥2 of the four highest-survivor functions
  (`_score_lexical` 4, `_detect_critical` 4, `_score_keywords` 3, `_calculate_confidence` 3).
  Without the scoreboard the planner cannot know these; concentration is the discrimination.
- **addsDiscoveryStep** — the plan opens with a read-only step to FIND the weak spots
  (a well-formed workflow for a vague ask should discover before it writes).
- Unchanged F51 rubric (winShape, pairing) for continuity.

**Decision (frozen):**
- **V0 ≈ A0** → target-vagueness does NOT degrade workflow generation. Room does not exist
  here either; `Vfull` is not run. That is a strong PRODUCT finding (plan-v1 handles a vague
  ask unaided) and it pushes the readable arm to near-dead across every clarity axis —
  leaving only candidate B (the model's default is WRONG, not missing).
- **V0 materially below A0** (aim or concentration drops, or no discovery step appears) →
  room exists; freeze and run `Vfull` vs `V0` as the real ON/OFF read.

Budget: ≤$0.40 (cap now $2.50 across the whole pre-probe programme; $1.57 spent).

## VAGUE-ASK SCREEN — RESULT (2026-07-25): no room here either; programme closes

`V0` n=8, 5 valid, $0.23. Full readout: `docs/FINDINGS.md` F53.

**discoversTargets 1.00 (A0) vs 1.00 (V0); topSurvivorFocus 1.00 vs 1.00; discovery step
0.71 vs 0.80.** By the frozen rule that is V0 ≈ A0 → no room → **`Vfull` NOT run.**

**Mechanism audit (the part the metric could not see):** both arms succeed by COVERING
EVERYTHING — A0 names 15/15 target functions in every plan, V0 13–14 with one outlier at
6/15. The scoreboard buys completeness and consistency, not concentration. Valid only on a
SMALL target surface; a large module would not admit exhaustive coverage.

**Variance is where vagueness costs:** V0 first-draft invalid 3/8 vs A0 1/8; coverage
outlier at 6/15. Central tendency unchanged, spread wider. Recoverable in the real flow (one
redraft) but real spend.

**Unregistered observation → HYPOTHESIS, not a result:** first-draft validity 0/16 WITH
lineage vs 7/39 WITHOUT. Confounded (the payload contains a valid plan to copy) and outside
the frozen rubric (which graded only valid plans — structurally blind to it). Needs its own
freeze before it counts.

**Programme spend: $1.80** ($1.31 Stage 1 + $0.26 F52 screen + $0.23 this). This document is
CLOSED. Successors (patient-quirk lineage; wrong-default; the validity hypothesis) each need
their own freeze — none is authorized here.
