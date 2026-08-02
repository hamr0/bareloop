# REUSE lift contrast — pre-registration (FROZEN before any number)

**Date frozen:** 2026-08-03 · **Rung:** Layer 3 (the REUSE rung) — **this contrast IS the
rung's acceptance read** · **Status:** pre-registered, NOT yet run ·
**Authorization:** hamr, verbatim, 2026-08-02 in-turn: *"go with two small jobs, $40 cap,
freeze the prereg."* The programme envelope is signed; **each new job spec's resolved hash
still requires hamr's explicit approval before any paid run** (calibration included) — the
signature gate is structural and this prereg does not substitute for it.

**Design record:** `docs/plans/2026-08-01-layer-3-reuse-design.md`.
**Predecessor instruments, both read:** `REUSE-PREPROBE-PREREG.md` (draft tier: readable
lineage DEAD, mechanical-start structure transmits, drafting cost flat) and its execution
addendum (kill-gate CLEARED on an audited green, n=1, no lift mintable).

Freeze discipline: patients-by-rule, arms, envelopes-by-rule, reading rules, decision rules,
and casualty rules are all in this COMMIT before any number exists; frozen rules are never
loosened post-hoc.

---

## 1. The question

**Does a proven cross-patient bridge, handed as the mechanical starting draft, change
EXECUTION outcomes versus a cold start — on small, same-shape TYPES jobs?**

The open hypothesis (never tested): **carried STRUCTURE makes execution converge faster.**
What is already known and NOT re-litigated here:

- structure transmits at draft tier; drafting cost does not move (pre-probe, frozen read);
- the mechanical path cleared its execution kill-gate once, audited, at n=1 (no lift claim);
- planning is a small share of spend (~7% measured, F55), so any lift must show up in
  EXECUTION convergence, not drafting;
- the one warm-vs-cold comparison on record ($6.15 warm vs $4.29/$5.77 cold) is UNUSABLE
  (F73's shared-workdir confound) and mints nothing in either direction.

**Registered default prediction, so a null is actionable:** per CL-BENCH ("a learning claim
is just a capability claim wearing a memory costume") and four consecutive planner-at-ceiling
reads, **the honest prior is NO lift**. A null here is a real acceptance verdict, not a
failed experiment.

## 2. Design

Two NEW small jobs, each a `tsc --strict` migration (TYPES genre) on a patient repo that is
**neither aurora nor litectx**, each declaring the SAME four-stage close shape —
`changed-from-seed` → `typecheck` → `suite-green` → `no-suppressions` — so the existing
proven bridge inventory is R2-legal (same SHAPE, different instance) and **any selected
bridge is cross-patient by construction** (the memorization audit passes structurally: no
same-patient bridge can exist in the frozen snapshot).

### Arms (frozen)

| arm | what a leg is |
|---|---|
| **ON (reuse)** | `run-reuse --tries 1` against a **frozen registry snapshot** (fresh copy per leg); the REAL selection call picks the bridge; bridge handed as mechanical starting draft (the shipped D4 path) |
| **COLD** | the identical spec through the cold path (no registry, no bridge); the shipped cold flow |

- **`--tries 1` on ON legs:** one bridge try is one row. The try ladder's roll-to-cold is
  the product's resilience feature; inside a measurement it would blend arms.
- **n = 6 legs per arm per job (target), 24 legs total.** Hard floor for a readable
  contrast: **4 per arm per job**. If the $40 cap binds before the floor, **the stop is the
  result** — no widening.
- **Worker/drafter model: claude-sonnet-5** (standing tier rules), identical across arms.
- **Scout ON in both arms** (D8) — turning it off would change two variables at once.

### Per-leg protocol (frozen — every clause is a named confound kill)

1. Reset the patient to its frozen seed; assert `git status --porcelain` empty and HEAD at
   seed, refuse otherwise (**F73's shared-workdir confound**).
2. `rmSync` the patient's `.litectx` store **in BOTH arms every leg** — cold-baseline
   doctrine on COLD legs, and index-warmth symmetry on ON legs (a warm index is not the
   bridge's credit).
3. Legs alternate ON, COLD, ON, COLD … within each job; **one leg at a time**, never
   parallel (provider-load and workdir isolation).
4. Identical envelope, spec, signed hash, model, and registry snapshot across all legs of a
   job.
5. Launch pattern: key via shell env-assignment prefix, **never `env KEY=` argv**
   (process-listing leak, this session); setsid-detached + inhibitor per F75 discipline.

### Registry snapshot (frozen)

The ON arm's registry is a **copy taken at this prereg's commit** (the consolidated
`../bareloop-patients/bridges`, 2 entries as of freeze). Bridges minted DURING this
programme — by calibration greens or by contrast greens — are **excluded by construction**
(the snapshot predates them; each leg gets a fresh copy so R1 writes to a leg's copy never
leak forward). Same-patient bridges therefore cannot enter selection.

## 3. Admission screen (frozen BEFORE any candidate number exists)

Candidate patients come from LOCAL repos only (copied, never cloned). Per candidate, in
order — a $0 static screen, then ONE paid cold calibration run:

**$0 static screen:**
- `tsc --strict` error count at seed in **[10, 30]** (target ~15–20);
- the suite passes at seed (`suite-green` needs a green baseline);
- errors are in-repo fixable on eyeball (no upstream-dependency error wall).

**Paid calibration (1 cold run per candidate; envelope $4 / 25 min; a provider-red
casualty earns exactly one relaunch):**
- must **GREEN within the calibration envelope** — winnability proven by the instrument
  itself, not hand-asserted;
- the accepted plan must be **multi-step (≥2 steps)**;
- **execution spend ≥ 10× the run's own drafting overhead** (drafting = scout + draft
  spend read from the spine; execution = the rest of worker spend) — the smallness guard
  that still leaves something for a bridge to help with;
- a green that is **attempt-1-trivial** — single iteration, no gap ever fed back, or the
  10× floor missed — **DISCARDS the candidate** (F34 benchmark-paradox guard).

Screening continues until **two candidates are admitted** or the pool is exhausted
(stop-and-report). **Calibration rows are screen evidence only — never contrast rows**
(the validation-run rule).

**Contrast envelope set FROM calibration, then frozen:** per job, budget ≥ 2× the
calibration green's spend and wall ≥ 1.5× its wall (rounded up to operator-clean numbers),
identical across arms, frozen before the first contrast leg, never revised mid-contrast
(F45: the envelope must fund the attempt plus its close, sized from the real job shape —
never from a floor-shaped smoke).

## 4. Primary metrics (ALL pre-named; nothing else mints)

1. **cost-to-green** — `spentUsd` on green rows (F6: `spendComplete` travels; a
   `spendComplete:false` green is flagged and reported as a floor);
2. **wall-to-green** — wall ms on green rows;
3. **green-rate-per-try** — greens / valid legs, per arm per job.

**Secondary, recorded, never headline:** rounds; iterations per step; replan fired;
failing stage on red rows; which bridge selection picked; drafting-vs-execution spend
split.

## 5. Frozen read RULE (the acceptance read)

Per job, per primary metric: compare arm medians; **the yardstick is the COLD arm's own
within-arm spread (min–max range) on that metric in that job** — the pre-probe's yardstick
discipline. Then:

- **LIFT mints** only if ON beats COLD beyond the yardstick on ≥1 primary metric **in the
  same direction in BOTH jobs**.
- **NEGATIVE lift mints symmetrically** (ON worse beyond the yardstick, both jobs) — reuse
  being a cost is as real a verdict as reuse being a win.
- **Anything else is NULL**: "no measurable execution lift on TYPES at this job size,
  n=⟨actual⟩" — and per §1's registered prior, a null is the expected, actionable verdict.
- Green-rate-per-try at n≤6 per cell supports **no proportion inference**; it is read
  descriptively, and only a 0-vs-majority split across BOTH jobs may be called a
  difference.

**Whatever mints, the verdict is Layer 3's acceptance read.** The rung's disposition on a
NULL or NEGATIVE (keep reuse as a resilience/continuity feature? demote it? park it?) is
**hamr's decision, not this document's.**

## 6. Casualty rules (frozen)

- **provider-red = casualty**, replaced, never counted; **max 2 replacements per arm per
  job**, then stop-and-report.
- **External kill (F75 class) = casualty**, **replaced, never resumed inside the
  contrast** — C v2 resume folds prior spend and would unread the cost row; resume is a
  production feature, not a measurement instrument.
- **Truncation** routes per the shipped loop (provider-red).
- **wall-halt / cap-halt = VALID RED rows** — they count in green-rate's denominator; the
  stop is the result (W-2).
- **All spend counts against the $40** — casualties, calibration, screening included.
  Cap-not-estimate: the cap binding IS a result.

## 7. Budget (frozen, cap-not-estimate)

**$40.00 HARD total** for the whole programme: calibration + all contrast legs + casualty
relaunches. Sizing (stated, not promised): 2 calibration greens ≈ $3–4; 24 legs at a
$1–2/run target ≈ $24–48 — **the cap may bind before n=6/arm/job**; the frozen floor and
stop rule in §2 govern. No number here authorizes exceeding $40; only hamr's explicit
verbatim word raises a budget.

## 8. Power honesty (stated up front, travels with every result sentence)

n=6 per arm per job resolves only effects **larger than the cold arm's own within-arm
spread** — plan-family variance is real (two cold greens of one identical job produced two
different plans) and cold spreads have measured wide. Smaller real effects WILL read NULL.
This is accepted: the contrast is sized to answer "does carried structure buy a LARGE,
consistent execution win on small TYPES jobs?", nothing finer.

## 9. What this contrast CANNOT read (stated plainly)

- **Anything beyond TYPES.** Both jobs are `tsc --strict` migrations. Every sentence
  carries *…on TYPES*.
- **Anything beyond small jobs.** A bridge's value may scale with job size; this reads the
  small end only.
- **Drafting-cost effects** — already read flat at draft tier (pre-probe).
- **Other models, other verdict types, soft-green/hitl territory** — out of scope.
- **Long-horizon inheritance** (rules accreting across many generations) — this is one
  bridge, one hop.
