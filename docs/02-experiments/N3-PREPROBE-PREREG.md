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
`docs/02-experiments/n3-preprobe-data/` (`stage1-raw.jsonl`, `stage1-grade.txt`,
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
