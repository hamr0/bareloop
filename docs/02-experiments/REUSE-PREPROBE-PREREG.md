# REUSE pre-probe — pre-registration (FROZEN before any number)

**Date frozen:** 2026-08-01 · **Rung:** Layer 3 (the REUSE rung), opening gate ·
**Status:** pre-registered, NOT yet run · **Owner:** hamr sign-off before firing.

**Design record:** `docs/plans/2026-08-01-layer-3-reuse-design.md` (D9 authorises exactly
this probe). **Not a continuation of** `N3-PREPROBE-PREREG.md` — that document is the
F51–F55 TESTGEN lineage programme and is CLOSED; it authorises nothing here, and nothing here
reopens it.

Freeze discipline: pre-register patients, arms, reading rules and decision rules in a COMMIT
before any number exists; frozen rules are never loosened post-hoc.

---

## 1. The question

**Does having a same-shape bridge in hand change what gets drafted at all?**

This is v1.21 requirement (b)'s gate: *identical plans with and without lineage in hand kills
the arm*. It runs BEFORE any inheritance machinery is built, because CL-BENCH's read is that
memory systems LOSE to plain in-context learning once base capability is subtracted — the
cheap instrument runs before the expensive build.

**Default prediction, registered so a null is actionable rather than disappointing:**

- **Readable lineage (arm B): NO lift.** F51–F55 measured that lineage transmits (F51 winShape
  3.00 → 4.00) while the cold planner was already at ceiling — and F60 measured the cold
  scout-on planner drafts real, well-aimed work unaided.
- **The mechanical-start arm (C) is where a win is expected**, and it is a different KIND of
  win: **drafting cost saved, structure kept** — not better reasoning.

## 2. Design

**Cross-patient TYPES reuse — the product case, per R2** ("same job" = same SHAPE, never same
instance).

- **Source bridge:** the newest aurora bridge,
  `bareloop-patients/aurora-u-bareloop/bridge-aurora-u-spawner-types-ms7flkok.json`
  (green 2026-07-30, 2 steps, `{job, specHash, runid, greenAt, plan}`).
- **Target job:** `jobs/litectx-u-types.json`.
- **Why this pair is R2-legal:** both specs declare the same four close stages —
  `changed-from-seed` → `typecheck` → `suite-green` → `no-suppressions` — over DIFFERENT
  patients. Same shape, different instance. A bridge that only worked because the patient was
  the same would be a lookup table, and the memorization audit kills it.

**Primary direction:** draft a plan for `litectx-u-types` with the aurora bridge in hand.

### Arms (frozen)

| arm | what the drafter gets |
|---|---|
| **A — cold** | the spec only (today's behaviour; the control) |
| **B — readable lineage** | the spec + the bridge plan as **reading material**, not as the draft |
| **C — mechanical start** | the bridge plan handed as the **starting draft to tweak** (D4's case) |

- **n = 3 drafts per arm.** Plan-family variance is real: two cold greens of the IDENTICAL job
  produced two DIFFERENT working plans (PRD v1.34), so n=1 per arm cannot read "identical vs
  different" — within-arm variance is the yardstick, and it must be measured, not assumed.
- **Drafts ONLY.** No execution, no worker, no close, no writes to any patient. A single model
  call per sample.
- **Model:** sonnet — the drafter tier floor (PRD v1.36), and runs on existing scaffolding use
  sonnet. Same model across all arms.
- **Scout: ON in all arms** (D8), with **identical scout inputs per arm** — the scout is
  load-bearing cold (F60) and turning it off would change two variables at once.

## 3. Frozen read axes

Measured on the drafted plan JSON:

1. **step count**;
2. **verbs used** (the tools each step declares);
3. **targets / scopes named**;
4. **real-file references** — **F60's own metric**, i.e. the same construct the treatment is
   judged by, never a prose shadow of it.

## 4. Frozen read RULE

**Arm A's within-arm spread on those axes is the yardstick.**

- **B "differs" only if the between-arm difference exceeds A's own within-arm spread.** A
  difference smaller than the control's own noise is not a difference.
- **For C, three reads:**
  - does the loaded bridge **pass the D2 mechanical gate** against the cross-patient job
    (verdict type, close-stage kinds, tools within the signed menu)?
  - **fraction of bridge steps kept / modified / dropped**;
  - **drafting cost vs A**.

## 5. Frozen DISCARD rules

1. **B ≈ A** → the **readable-lineage arm is DEAD**; only the mechanical-start path gets built.
2. **C redrafts from scratch** (discards the bridge) → the **bridge-as-starting-draft premise
   fails at draft tier**; recorded, and the decision goes to hamr.
3. **C passes the gate and keeps a majority of bridge structure** → the **mechanical path
   lives**.

## 6. Casualty rules

- **Provider-red rows are casualties, never evidence.** They are replaced, not counted.
- **Truncated responses** (`stop == max_tokens`, or empty text) are **flagged as a distinct
  field and EXCLUDED from the denominator** — a truncation is never counted as a miss.

## 7. Budget (frozen, cap-not-estimate)

- **$1.00 HARD cap, total.** Sizing: ~9 drafts × ~$0.06/draft, the rate MEASURED at F60
  ($1.04 for 18 sonnet drafts).
- **Cap-not-estimate.** If the cap binds before 9 readable drafts land, **the probe STOPS and
  the stop is the result** — a budget that binds mid-work produces casualties, not evidence,
  and widening a cap to manufacture a readable row is the fit-to-pass move this repo forbids.

## 8. What this probe CANNOT read (stated plainly)

- **Anything about execution outcomes.** It reads drafts. Whether a reused plan greens,
  self-heals, costs less end-to-end, or fails at a stage is entirely outside it. That is the
  second instrument (D9), fired only if the drafts differ, and only on hamr's word.
- **Anything about genres other than TYPES.** Both patients are `tsc --strict` migrations. The
  qualifier travels with every sentence of the result: *…on TYPES*. F51–F55's whole programme
  was invalidated as a general claim by exactly this (nine of ten specs were TESTGEN), and the
  same trap is live here.
- **Scout-shrink.** The scout is ON in every arm by design (D8); this probe says nothing about
  whether a reused bridge could scout less.
