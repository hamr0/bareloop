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

---

## Addendum — 2026-08-01, PRE-FIRE (implementation deviations + one read corrected for principle — BEFORE any paid number exists)

Building the harness (`scripts/reuse-preprobe.mjs`) found **four places the frozen text above
cannot be implemented literally against the REAL instrument**, plus **one read that is
degenerate by construction**. Under the design record's amendment discipline
(`docs/plans/2026-08-01-layer-3-reuse-design.md` §7) this is the allowed direction:
**correction for principle BEFORE measurement.** No paid draft has run; no number from this
probe exists; **nothing here loosens a rule to fit a number.** Every $0 fact recorded below was
established by construction or by the validator — not by the probe's paid measurement.

### 1. §2 "no close" cannot be honoured literally — the close precheck/preflight RUN

The shipped scout is reachable only through `runPlan`, which runs the **close PRECHECK** and the
**check PREFLIGHT** before the scout exists. Both are **$0 and deterministic** (a `git diff`,
then `tsc` + the suite). The only alternative — hand-writing a scout for the probe — is a
**forked instrument**, which the standing real-instrument rule forbids more strongly than this
deviation costs.

**Recorded as executed:** the close precheck and check preflight RUN in every sample; **no
graded close ever does.**

### 2. §2 "no writes to any patient" narrowed to "no writes to any patient SOURCE file"

The shipped scout writes **the arbiter's own books** — `gate-audit.jsonl` and the `.litectx`
store. It cannot be made to write nothing.

The scout's grant **excludes every write-class verb** and its **fence is empty**, so no source
file can be touched. The harness relocates the gate audit beside the results, removes any
`.litectx` store it created, and **ASSERTS the patient's `HEAD` and `git status --porcelain`
are byte-identical before and after** — refusing to write results otherwise.

### 3. §7's sizing did not fund the scout — and the materials block quotes the probe's balance

The scout comes out of **the same $1.00 total cap** (F45's attempt-plus-close lesson applied to
a probe: the cap funds everything, or the row is unreadable). **The cap may therefore bind
earlier than "~9 × $0.06" implies.** The frozen behaviour is unchanged — **the stop is the
result.**

Related, and stated so it travels with every sentence of the read: the materials block quotes
**the probe's ~$1 balance, not the job's $10.** One function feeds both the scout's gate budget
and the drafter's balance line, and **bounding the scout inside the cap wins over prompt
fidelity.** The figure is **CONSTANT across all nine samples**, so it cannot bias a within-arm
or between-arm contrast — but these are **plans drafted against a ~$1 balance**, and every
result sentence carries that.

### 4. New stated precondition: the patient must be CLEAN at its frozen seed (96813a43bbcb)

A **half-solved** tree is not what a real scout surveys. A **fully-solved** tree makes the close
precheck return satisfied → `already-green` → **no scout at all**.

The harness **refuses to run otherwise** and prints the reset command. **The reset is
operator-performed, never harness-performed.**

### 5. Arm C's strict "fraction of bridge steps kept" — corrected for principle: a guaranteed zero by construction

**A read that cannot fail is not a read.** The bridge's targets are **aurora** paths; this job's
fence is `src/**` — so a **VALID** draft can **never** keep a bridge target verbatim, and the
strict target-based fraction is **zero by construction**, whatever the drafter does.

Two **$0 deterministic** facts, established pre-fire:

- **(a)** The bridge **FAILS the D2 mechanical gate** against `litectx-u-types` with **6 reds**:
  *invalid-value* on both scope fields, and *scope-escape* on both targets and both
  `tree-changed` exit scopes. So **discard rule 3's "passes the gate" clause is answered FALSE
  by construction** for any cross-patient bridge carrying instance paths. **That is itself a
  finding the machinery must absorb:** a loaded bridge is a **starting draft** precisely BECAUSE
  the gate reds its instance paths (D4).
- **(b)** Therefore the **PRIMARY** keep/modify/drop read is the **STRUCTURAL** one — ordinal
  tools-set + exit-signature match. The strict target-based read is **retained and recorded as a
  control.**

**Discard rule 3 re-anchors accordingly:** the **mechanical path LIVES** if C's drafts are
**legal** (pass `validatePlan` for THIS job) **and** keep a **majority of bridge structure on
the STRUCTURAL read**. **Rules 1 and 2 are untouched.**

### Implementation clarification — truncation is decided FIRST

bare-agent surfaces an **API truncation** through the **same error field** as a transport
failure (`'truncated:max_tokens'`). The harness therefore **decides truncation FIRST**: a
truncated row is **kept-and-excluded per §6**, **never replaced as a casualty.**

---

The harness (`scripts/reuse-preprobe.mjs`) computes and stores every §3/§4/§5 input but **prints
no verdict language** — the read against the discard rules remains the operator's.

---

## Addendum — 2026-08-01, POST-FIRE READ (the frozen rules applied; verdict per rule, with every qualifier)

Fired 2026-08-01 under the frozen design above (as amended pre-fire, before any number
existed). Primary artifact: `docs/02-experiments/reuse-preprobe-ms9jpjue.json` — the harness
prints no verdict language; the read below is the operator's, against §5's frozen rules.

**Fire facts:** **9/9 readable rows** — **0 truncated**, **0 casualties**, so §6 never fired
and the denominator is the full pre-registered one. **Total spend $0.5107 of the $1.00 hard
cap**; the cap never bound, so §7's "the stop is the result" clause is not in play.

**Capture leg ($0.1934 of the total).** The shipped `runPlan` drove the **close precheck**
(`needs_revision` on `changed-from-seed` — the clean-seed precondition of pre-fire §4, working
as stated), the **check preflight** over the three offered stages, and the **scout**
(**summary 3761 bytes**, non-empty). At the drafter call the harness's **sentinel** aborted and
captured the real prompt (7138 chars). It is recorded as the harness's own
**`probe-capture-stop`**; the escalation router files the run outcome as **`provider-red`** —
that is **the harness's sentinel, not a transport casualty**, and it is not a row. **The one
captured prompt fed all nine drafts**, so the scout input is byte-identical across arms as §2
required.

### Rows (from the JSON; costs are the drafter call only)

| arm | i | costUsd | steps | declaredRounds | distinctVerbs | realRefs | guessedRefs | valid |
|---|---|---|---|---|---|---|---|---|
| A | 1 | $0.0469 | 1 | 30 | 3 | 5 | 20 | yes |
| A | 2 | $0.0271 | 1 | 30 | 3 | 4 | 7 | yes |
| A | 3 | $0.0416 | 1 | 35 | 3 | 21 | 21 | yes |
| B | 1 | $0.0366 | 1 | 30 | 3 | 5 | 19 | yes |
| B | 2 | $0.0224 | 1 | 32 | 3 | 4 | 20 | yes |
| B | 3 | $0.0288 | 1 | 30 | 3 | 4 | 22 | yes |
| C | 1 | $0.0554 | 2 | 45 | 3 | 6 | 21 | yes |
| C | 2 | $0.0295 | 2 | 35 | 3 | 4 | 25 | yes |
| C | 3 | $0.0291 | 2 | 50 | 3 | 5 | 22 | yes |

Nine drafts = $0.3174; plus the capture leg's $0.1934 = the $0.5107 recorded.

### Discard rule 1 — **FIRES: B ≈ A, the readable-lineage arm is DEAD**

Every frozen axis's B-vs-A delta sits **inside arm A's own within-arm spread** (delta | A's
spread):

- **stepCount** 0 | 0 · **declaredRounds** −1 | 5 · **distinctVerbs** 0 | 0
- **realFileRefs** −5.67 | 17 · **guessedFileRefs** +4.33 | 14
- **costUsd** −$0.009 | $0.020
- **verbUnion** between-max 0 | within-max 0 · **targets** between-max 2 | within-max 2 ·
  **checkNames** 0 | 0

Per §4, *a difference smaller than the control's own noise is not a difference* — no axis
clears it. This is **exactly the pre-registered default prediction** (§1; CL-BENCH; F51–F55):
**reading material moved nothing.** Only the mechanical-start path gets built.

### Discard rule 3 (as re-anchored pre-fire) — **FIRES: the mechanical path LIVES**

- **All three C drafts are legal** — they pass the shipped `validatePlan` for THIS job
  (`validatorOk: true`, zero reds), which is the re-anchored legality clause.
- **All three keep 2/2 bridge steps on the STRUCTURAL read** (ordinal tools-set + exit
  signature) — a majority, twice over.
- The **strict** target-based read is **0 kept / 2 modified / 0 dropped in all three** — the
  pre-fire addendum's *guaranteed zero by construction*, landing exactly as predicted and
  recorded here as **the control it now is**, not as a finding.

**Structure genuinely transmitted:** every C draft is a **2-step** plan following the bridge's
shape, while **all six A/B drafts are 1-step** plans. That is the only axis on which any arm
moved.

### One pre-registered expectation **REFUTED**, stated plainly

§1 predicted C's win would be **"drafting cost saved, structure kept."** The cost half **did
not materialize**: mean drafting cost **C $0.0380 vs A $0.0385** — flat, and the delta
(−$0.0006) is two orders inside A's own spread. What C bought **at draft tier** is
**STRUCTURE CARRY-OVER, not cheaper drafting.** Whether the carried structure is worth
anything is an **execution** question, outside this probe (§8).

### Honesty notes

- **Arm A's within-arm spread is WIDE.** Its realFileRefs values are **5 / 4 / 21** (spread
  17) — one draft enumerated the whole `src/` tree, two did not. Plan-family variance was
  pre-registered as the reason for n=3 (§2), but a **wide yardstick makes "B ≈ A" easier to
  conclude**. The null's credibility rests on it ALSO being **the pre-registered default
  prediction**, not a post-hoc reading of a noisy control.
- **n = 3 per arm.** Every sentence above carries: **…on TYPES, at draft tier only, with the
  materials block quoting a ~$1 balance** (pre-fire §3).
- **1-step (A/B) vs 2-step (C): which is BETTER is not readable at draft tier.** The second
  instrument (limited-budget execution, D9) exists for exactly that, and it **fires only on
  hamr's word.**

Per the design record §5, the result selects the build shape: the machinery proceeds
**MECHANICAL-START ONLY** — registry, gate, listing/selection, draft-time tweak path,
envelope, status/history — **with no readable-lineage feature.** The execution probe go/no-go
is hamr's.
