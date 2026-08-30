# REUSE lift contrast — pre-registration (FROZEN before any number)

**Date frozen:** 2026-08-03 · **Rung:** Layer 3 (the REUSE rung) — **this contrast IS the
rung's acceptance read** · **Status:** pre-registered, NOT yet run ·
**Authorization:** hamr, verbatim, 2026-08-02 in-turn: *"go with two small jobs, $40 cap,
freeze the prereg."* The programme envelope is signed; **each new job spec's resolved hash
still requires hamr's explicit approval before any paid run** (calibration included) — the
signature gate is structural and this prereg does not substitute for it.

**Design record:** `docs/product/2026-08-01-layer-3-reuse-design.md`.
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

---

## Addendum — 2026-08-03, $0 STATIC SCREEN (candidates selected; calibration NOT yet fired)

Run after the freeze commit, before any paid number. All figures are $0 measurements with
the real instruments (the repo's own `npx tsc --noEmit --strict`, the repo's own
`npm test` TAP counters).

**Pool swept:** 15 local repos; 7 had the required shape (tsconfig + node-test suite):
bareagent 97 · bareguard 137 · barebrowse 654 · baremobile 407 · mailproof 1 ·
knowless 1 · pulselog 67 whole-repo strict errors. **None lands in [10,30] whole-repo**,
so both jobs use a SCOPED typecheck — precedented by aurora-u itself (mypy scoped to the
spawner package). The stage's green = zero strict errors in the scope files AND
outside-scope errors ≤ the seed's own count (fixing the target can never be bought by
breaking the rest; the ceiling branch was sabotage-tested and fires).

**Admitted to calibration (both pass every $0 clause):**

| job | patient (copied local) | seed | scope | in-scope errs | suite at seed |
|---|---|---|---|---|---|
| A `pulselog-u-types` | `bareloop-patients/pulselog-u` | `92d71a7c1253` | `src/email.js` + `src/backup.js` | **27** | 67/67 green |
| B `baremobile-u-types` | `bareloop-patients/baremobile-u` | `d9b318fac780` | `src/errors.js` + `src/aria.js` | **29** | 321/321 green |

Error classes eyeballed in both scopes: implicit-any params/bindings and
object-property narrowing — in-repo JSDoc typing work, no upstream-dependency wall.
Closes (`scripts/u-pulselog-close.mjs`, `scripts/u-baremobile-close.mjs`) validated at
seed: changed-from-seed red (identical tree), typecheck red naming exactly 27/29,
suite-green green, no-suppressions green — every stage judged, prefixes distinct.

**Registry snapshot frozen** at `bareloop-patients/bridges-snapshot-liftcontrast/`
(copied 2026-08-03 00:28, after msc6w93z's final append and before any programme run):
aurora-u-spawner-types (3 greens, 2 cross-patient) + litectx-u-types. Both are
cross-patient relative to pulselog/baremobile by construction.

**Resolved spec hashes, awaiting hamr's signature (nothing paid fires without it):**

- `pulselog-u-types` → `c1fe83e112a160f8b90b27641b1381d62837d4b6f8a26804dc3316f046a4229b`
- `baremobile-u-types` → `9e4e0b9d3ff6756b01b9909e5818b9bcbc2957173d927700366dbe961c284c49`

Signed by hamr, verbatim, 2026-08-03 in-turn: *"approved, fire calibration on both
hashes"* — covering calibration AND the contrast under the $40.

---

## Addendum — 2026-08-03, CALIBRATION RESULTS + hamr's 5× RULING + job-B replacement

**Calibration outcomes (screen evidence only, never contrast rows):**

- **A `pulselog-u-types` (u-mscwz0e3): GREEN** $1.2922 / 15.1 min / 70 rounds; 2-step
  plan; fix loop fired once (no-suppressions caught, then fixed) — not attempt-1-trivial.
  Green re-audited on the v2 (F-5-fixed) close: all four stages exit 0, zero non-store
  untracked files — unexploited. Drafting (scout $0.1289 + plan $0.0201) = $0.1490;
  execution = $1.1432; **ratio 7.67× — FAILS the frozen 10× clause** as frozen.
- **B `baremobile-u-types`: REJECTED — must-GREEN failed.** Launch 1 (u-mscxqm6q)
  provider-red casualty ≥$0.1282 (scout probed `cp -a`-carried ignored dev junk;
  junk since removed from both patients). The ONE permitted relaunch (u-mscxuziw)
  died step-red $0.8313 / 11.1 min: attempt ladder exhausted at step
  `fix-errors-js-types`, close never judged, money and wall unbound. No further
  relaunch is licensed; the candidate is out.

**Screen design tension, reported to hamr before any ruling:** at sonnet's measured
efficiency (~$0.04/error execution, ~$0.15 drafting overhead) the 10× floor needs ~36+
in-scope errors — OUTSIDE the frozen [10,30] band. The two frozen clauses are jointly
near-unsatisfiable at this job size; threshold changes are arbiter territory.

**hamr's ruling, verbatim, 2026-08-03 in-turn:** *"5x approved, screen the replacement
and fire"* — the execution/drafting floor resets **10× → 5×** (arbiter decision, made
AFTER seeing both calibrations and recorded here before anything further fires; every
other frozen clause unchanged). Consequences:

- **A `pulselog-u-types` is ADMITTED** (7.67× ≥ 5×; every other calibration clause
  already passed). Contrast envelope per §3: budget ≥ 2×$1.2922 and wall ≥ 1.5×15.1min —
  **the signed $4 / 25min spec already satisfies both**; envelope FROZEN as-is, no
  re-sign needed.
- **One replacement candidate is screened for the job-B slot**, per the same frozen
  screen (at the 5× floor).

**Job-B replacement — `bareagent-u-types` — $0 static screen (all real instruments):**

| clause | measured | verdict |
|---|---|---|
| strict errors in scope, [10,30] | `src/recurse.js` 19 + `src/loop.js` 30−19=11 → **30** | PASS (band edge, inclusive) |
| suite green at seed | 1044 tests executed, 0 fail (npm's own exit 0, not a piped `$?`) | PASS |
| errors eyeball-fixable | unknown-`err` narrowing, implicit-any params/vars, index-signature narrowing — in-repo JSDoc work, no upstream wall | PASS |

Patient `bareloop-patients/bareagent-u` copied local from
`~/PycharmProjects/bareagent`, seed `0037182a5a369d380e1635e0e4ab13e3557cfab9`,
porcelain clean; ignored dev junk (`.claude` `.barebrowse` `.idea` `.litectx`
`.mcp-bridge.json` `agnews.csv`) removed per the calibration-B lesson; `node_modules`
kept (the suite needs it). OUTSIDE_MAX 67 (whole-repo 97 − 30 in scope), TESTS_MIN 1044.
Close `scripts/u-bareagent-close.mjs` pattern-copied from the v2 pulselog close WITH the
F-5 untracked sweep; validated at seed: changed-from-seed red exit 1 (identical tree),
typecheck red exit 1 naming exactly 30, suite-green exit 0, no-suppressions exit 0.

**Resolved spec hash:**

- `bareagent-u-types` → `1c35a1eb63190bf520a94dc86281f67e6be5e9a813df7d5ed7608ce84ca68859`

**Signature:** hamr's same in-turn order — *"5x approved, screen the replacement and
fire"* — is recorded as the prospective approval for this hash: it explicitly ordered
the replacement screened and fired without a further pause, the spec is a
pattern-copy of the already-signed pulselog spec (same shape, same $4 / 25min
envelope, scope and patient swapped), and the hash is minted here before the paid
run. Calibration fires on this authority; the contrast fires under the same order
once the calibration passes the (5×-floored) screen.

---

## Addendum — 2026-08-03, bareagent-u-types calibration REJECTED; pool re-swept; second replacement staged

**Calibration (u-msd916dh, cold, on the signed hash): FAILS must-GREEN.** step-red at
`strict-fix-recurse`: $2.7020 / 18.7 min / 82 rounds, 2-step plan, replan fired, attempt
ladder exhausted (cap-halt 3/3 then 2/2), close never judged, money and wall unbound —
the same failure class as baremobile's calibration (the rounds/attempt ladder binds
before dollars, F73 class). step-red is not provider-red: no relaunch is licensed.
**Candidate REJECTED per the frozen screen.** Programme spend now **$7.6557 of $40**
($2.2517 prior + $2.7020).

**Observation, recorded not minted (n=3, one run per candidate — anecdote tier):** the
green calibration's scope had per-file densities 15+12; both reds died on their densest
file (baremobile `errors.js` 16, bareagent `recurse.js` 19). Selection heuristic only —
prefer scopes whose densest file stays well under ~15.

**Pool re-sweep ($0, real instruments) for the job-B slot:**

- `barebrowse` — **OUT at the static screen**: suite NOT green at seed (254 tests,
  1 failing, exit 1) and 6.6 min runtime is a close hazard besides; `bidi.js`/`cdp.js`
  additionally carry a TS7016 `ws` declaration wall (upstream-dependency class).
- `mailproof` / `knowless` — 1 whole-repo error each, below band. OUT.
- `bareguard` — **PASSES every $0 clause** with scope
  `src/primitives/{classify,fs,spawn-rate,defer-rate,bash}.js`: **21 in-scope errors**
  (9+4+3+3+2 — max density 9, well under every observed red), all TS2339/TS7006
  (property-narrowing / implicit-any, in-repo JSDoc work; the repo's `proper-lockfile`
  TS7016 wall sits in `audit.js`/`budget.js`, OUTSIDE the scope); suite at seed
  **238 executed / 0 fail, exit 0** in the patient copy (the original repo shows 239 —
  one test lives in ignored dev junk `notes/…/wire-test.mjs`, stripped from the patient;
  TESTS_MIN is honestly 238). Estimated execution/drafting ratio at sonnet's measured
  efficiency: 21 × ~$0.042 / ~$0.15 ≈ **5.9×** against the 5× floor.
- This is the **last shaped candidate in the local pool** — if its calibration fails,
  the pool is exhausted and the programme stop-and-reports (the one-job-contrast option
  then needs a prereg amendment, hamr's call).

Patient `bareloop-patients/bareguard-u` @ seed
`2ae8fcd37041c186524a6eb5e953b9752cd602fa`, porcelain clean, dev junk stripped
(tracked `harness-code-mode/` was briefly caught by the junk sweep and restored from
git — porcelain re-verified 0). Close `scripts/u-bareguard-close.mjs` (F-5 untracked
sweep included), validated at seed: changed-from-seed red exit 1, typecheck red exit 1
naming exactly 21, suite-green exit 0 (238), no-suppressions exit 0. OUTSIDE_MAX 116.

**Resolved spec hash, AWAITING hamr's signature (nothing paid fires without it):**

- `bareguard-u-types` → `2b8dbdaf68e4c0dac9023d3c1c3816e387c617b91819fd714f67069f72ec387a`

hamr's "screen the replacement and fire" covered ONE replacement (bareagent) — it is
spent. A second replacement's paid calibration is prescribed by this prereg's own
"screening continues until two candidates are admitted or the pool is exhausted", but
the per-hash signature gate is structural and is NOT inferred: this hash waits for
hamr's explicit word.

---

## Addendum — 2026-08-03 (evening), ladder shipped; recal u-msdonzxl = INSTRUMENT CASUALTY; close fixed; one relaunch

Context: hamr diagnosed the two step-red calibrations as OUR defect ("if workflow
fails in dense jobs then it failed at planning and self healing. why not fix that?");
the fixed-count step ladder was replaced by the progress-governed strike ladder
(F77–F79, commit 6c53d3e) with hamr's rulings recorded in F80. He then ordered:
"go build it with opus and you orchestrate and validate it against the last repo
that failed" — bareagent-u.

**Recal u-msdonzxl (fixed ladder, same signed hash 1c35a1eb…): INSTRUMENT CASUALTY,
not a screen row.** wall-halt $2.2119 / 25.6min / 89 rounds. The spine decomposes:
both plan steps greened at iteration 1 (the tree at that point carried 18 added
suppressions — the step check `check-passes(typecheck)` greens on suppressed code BY
DESIGN; `no-suppressions` at the close is the stage built to catch it). The close
never reached it: `changed-from-seed` false-redded on **`gate-audit.jsonl`** — the
ARBITER'S OWN in-flight audit file, which the F-5 untracked sweep did not exclude
(u-msdonzxl was the first run ever to execute the v2 sweep MID-RUN; pulselog's
calibration ran the v1 close, and its v2 re-audit ran post-run, after the audit had
been relocated). The close-fix loop burned 3 iterations on a red the worker can
neither read nor delete (fs-denied, outside writeScope), then the wall expired.
The row mints nothing in any direction. Programme spend **$9.8676 of $40**.

**Fix, validated before any relaunch:** all six close scripts now exclude exactly
TWO named arbiter books from the untracked sweep: `.litectx/` and root
`gate-audit.jsonl` (exact name — a worker-authored `src/gate-audit.jsonl` still
counts). Three-way validation on a clean patient: arbiter-file-only reads
identical-to-seed; worker `src/gate-audit.jsonl` counts as changed; an outside
untracked file still reds. Spec hashes unchanged (close scripts are not part of the
spec hash; the cmd strings did not move).

**Relaunch:** one relaunch of bareagent-u on the fixed instrument completes hamr's
validation order — the casualty was ours, same precedent as calibration B's junk-probe
relaunch. Screen read at the 5× floor per the frozen rules.

---

## Addendum — 2026-08-03 (night), recal u-msdpuaej: honest step-red; bareagent-u REJECTED on a clean instrument; ladder validated live

**Recal u-msdpuaej (fixed close, same signed hash 1c35a1eb…): step-red at
`fix-loop-strict` — FAILS must-GREEN.** $3.0669 / 22.4 min / 105 rounds / 2 plan
attempts (replan fired), spendComplete true. step-red is not provider-red: no further
relaunch is licensed. **Candidate REJECTED per the frozen screen — the rejection now
stands on a clean instrument.** Programme spend **$12.9345 of $40** ($9.8676 + $3.0669).

**The instrument fix HELD.** No arbiter-book false red anywhere in the spine: every
close-verdict gap is real `tsc --strict` output (30→30→19→20, then 21→19→19→19). The
suppression path never materialized either — the worker attempted no suppressions
(`no-suppressions` preflight satisfied, no designed-catch firing needed).

**The strike ladder validated live — every mechanism fired, honestly:**

- Attempt 1: iter 2 repeated iter 1's exit output with **wrote=false** → strike 1
  (the no-write repeat path). Iter 3 moved 30→19 — distinct gap, no new strike,
  strike count STICKY at 1 (by design). Iter 4 went 19→20 (up, but distinct) — no
  strike; movement is movement. The **step-variance meter** then ended the attempt
  (decision-ready, "consumed a large share of the run with its exits still red").
- The replan carried the **mechanism brief** to the replanner (trigger
  `step-variance`, reason verbatim in the spine, seq 118).
- Attempt 2: iters 3 and 4 both repeated iter 2's exit output **while writing**
  (wrote=true, repeatOf 2) → strikes 1 then 2 → **cap-halt 2/2**, decision-ready.
  Both strike genres (no-write repeat, wrote-but-unmoved repeat) observed in one run.

**Root cause of the red — an unsatisfiable step exit, not file coverage, not the
ladder, not the close.** [CORRECTED same night: the first committed version of this
paragraph said the plans "scoped edits to loop.js only" — wrong; the operator's plan
extraction truncated to the first step (the blind-instrument class again). The full
records show both plans carried BOTH files.] Both plans were 2 steps: step 1
`fix-loop-strict` (target src/loop.js, "do not modify any file outside src/loop.js"),
step 2 `fix-recurse-strict` (target src/recurse.js). But step 1's exit was
`check-passes(typecheck)`, and the typecheck check judges BOTH goal files — so step
1's exit is structurally unsatisfiable within step 1's own mandate: the worker
cleared loop.js completely by iteration 3 (gap file list shrank to recurse-only) and
then ground against 19 recurse.js errors it was instructed not to touch. Step 2 —
which would have cleared exactly those errors — NEVER RAN in either attempt. The
replanner, handed the mechanism note and the recurse-naming gap, rebuilt the same
shape (the plan LOOKS correct; the exit/mandate mismatch is invisible unless named).
**Third instance of the mailbox class** (a step whose exit cannot be satisfied by
what the step is allowed to do): (1) check on a read-only step — cured by a gate
rule; (2) haiku's verbatim rebuild — cured by the tier floor; (3) whole-goal check
as a mid-plan single-file step's exit — no gate rule yet. Candidate rule (gate
territory, hamr's call): red any plan where a non-final step's exit check judges
beyond the step's own target; equivalently only the final step may carry the
whole-goal check. Recorded, not built.

**$0 replay of the candidate rule (same night, hamr-approved): REFUTED.** Sweep of
all 325 archived spines (39 with plan records, 59 plans): the categorical rule
("check-passes only on the final step") would have redded 45 plans including **20
non-final steps that actually GREENED** (several in fully-green runs). The rule is
dead as drafted. The red side of the same sweep: **all three step-red calibrations
(bareagent ×2, baremobile) died on the identical shape** — non-final one-file step
gated by the seed-red whole-goal typecheck.

**The differentiator, grounded to the gate audit:** pulselog's GREEN calibration
(u-mscwz0e3) had the same shape — step 0 "annotate-email" (target src/email.js),
exit = whole-goal typecheck — and greened because its worker IGNORED the file
boundary: writes 11× backup.js vs 4× email.js inside step 0, fixing whatever the
check named. bareagent's plan carried an explicit prose prohibition ("Do not modify
any file outside src/loop.js"); its worker OBEYED it and ground to death. The
writeScope fence allowed both files in both runs — **the trap is the plan forbidding
in prose what its own exit requires.** Prose is not machine-validatable, so no hard
gate rule exists for this; the density heuristic above is likely secondary to this
trap.

**Refined remedies (both cheap, both convert-genre per F38, awaiting hamr's go):**
(a) a law line in the drafter AND replanner prompts — a step must be free to edit
everything its exit check judges; never forbid what the exit requires; (b) one
mechanical line in the replan note, computed F32-style from gap-vs-gate-audit —
"the exit failed on files the step never wrote: <list>". (b) touches the
arbiter-authored note template: named, scoped, PARKED for explicit go.
Consequence for the pool: all three rejections are trap-tainted; bareagent-u's
step-red may be curable by (a)+(b) without touching caps or budgets.

---

## Addendum — 2026-08-04, remedies (a)+(b) landed and fired: u-msdsmkid step-red — THIRD rejection; the trap prose is CURED and two deeper mechanisms are now on the record

hamr's go ("1+2 sounds good if you can land them" + "ok" to fire): both remedies
landed TDD (commit 01e41a7, 855/855, sabotage-proven) and bareagent-u re-fired on
the same signed hash. **u-msdsmkid: step-red at `fix-recurse-strict`, $3.5428 /
25.7 min / 102 rounds, replan fired — FAILS must-GREEN. Third rejection, now on
trap-fixed instruments.** Programme spend **$16.4773 of $40**.

**What the fixes measurably changed (n=1 each, mechanism reads not minted rules):**
- **The exit-freedom law CONVERTED the drafting prose.** Zero file-prohibition
  sentences in BOTH plans (vs "Do not modify any file outside src/loop.js" in both
  u-msdpuaej plans); the only prohibitions left are legitimate tsconfig guards.
- **The never-wrote line fired by construction** (the last gap named recurse.js;
  the audit shows loop.js-only writes) — prompts are not spine-recorded, so the
  render is test-proven, not spine-proven.

**Why it still redded — two NEW grounded mechanisms:**
1. **Positive-scope confinement.** With no prohibition anywhere, the action "Edit
   src/loop.js …" still directs all work at one file: the gate audit shows
   **17 writes, all loop.js — recurse.js received ZERO writes across the entire
   run**, both plans. The prose trap was the removable half; the target/action
   framing itself still confines the worker. Plan-1 trajectory 22→20→19→19
   (no-write strike)→19 (repeat strike), cap-halt with both files still red.
2. **Replan CHECK-SHEDDING (new genre).** The redrafted plan dropped
   `check-passes` from BOTH steps — exits became tree-changed + artifact-written,
   form only. Step `fix-loop-strict` then "greened" at iteration 2 **on form
   alone** (unearned; only the outer close could catch it, and wall+money expired
   first at step 2's variance stop). A checkless write step is legal today
   (checks decide nothing by doctrine — but a replan that REMOVES truth coverage
   converts a red step into a fake-green step and burns the wall). Candidate
   rule needs its own $0 replay before any build; recorded for hamr, not built.

**Pool state:** bareagent-u is OUT ×3. `bareguard-u` (hash `2b8dbdaf…`) remains
the last shaped candidate — paid calibration fires only on hamr's explicit
signature; if it fails, the pool is exhausted and the programme stop-and-reports.

**Density observation, still recorded-not-minted (n=4 now):** the run died with 19
errors pinned in `recurse.js` — the densest file, again at/over the ~15 band from the
n=3 observation above.

**Pool state:** bareagent-u is out twice (pre-fix and post-fix). `bareguard-u`
(hash `2b8dbdaf…`) is the LAST shaped candidate, staged and validated at $0 —
nothing paid fires without hamr's explicit signature on that hash.

---

## Addendum — 2026-08-06, POOL RE-OPENED: the three rejections were OLD CODE, not bad patients — re-screen registered BEFORE its numbers

Written and committed **before either re-screen run returned a number.** The screen's
clauses are NOT re-frozen and NOT loosened: the existing §3 clauses (must-GREEN inside the
envelope, accepted plan ≥2 steps, execution ≥ 5× drafting, attempt-1-trivial discards)
govern exactly as written. What changes is the POOL, and only because the instrument the
rejections were measured on no longer exists.

### The finding that re-opened the pool

Every rejection in this prereg predates the fixes that followed it. Same patient, same
signed spec, `bareagent-u`:

| run | date | outcome | spend |
|---|---|---|---|
| u-msd916dh | 2026-08-03 | step-red | $2.7020 |
| u-msdonzxl | 2026-08-03 | wall-halt (our own close bug) | $2.2119 |
| u-msdpuaej | 2026-08-03 | step-red | $3.0669 |
| u-msdsmkid | 2026-08-03 | step-red | $3.5428 |
| u-msew1uy5 | 2026-08-04 | cap-halt | $4.1261 |
| **u-msf70nei** | **2026-08-04** | **GREEN** | **$5.3389** |

Landed between the last rejection and the green: the progress-governed strike ladder, the
`planPrompt` exit-freedom law, the mechanical never-wrote replan line, Rule A-v2
(`check-placement`), Rule B (`check-shed`), the money halt and the close-trend instrument.

**Stated limit, so the green is not over-read:** u-msf70nei ran at **$8/45min** (an
operator top-up) and was a **resume**, not a cold run. It proves `bareagent-u` is
*winnable*; it does **not** satisfy the frozen screen, which requires a cold green inside
$4/25min. That is precisely what the re-screen tests. The four earlier reds stay on the
record as instrument-era rows and are neither deleted nor re-graded.

### Registered reading rule (frozen here, before any number)

- A re-screen GREEN admits the candidate on the §3 clauses as written (5× floor per
  hamr's 2026-08-03 ruling). It does not retroactively convert any prior red into a pass.
- A re-screen RED leaves the candidate OUT and the earlier rejections stand.
- Re-screen rows are **screen evidence only, never contrast rows** (the standing
  validation-run rule).
- Both runs are COLD (`run-u.mjs` hard-resets to seed, `git clean -fd`, and `rmSync`s
  `.litectx` — verified in source, not assumed).

### Authorization (hamr, verbatim, in-turn 2026-08-06)

- *"re-screen bareagent-u and baremobile-u cold at 4/25"*
- *"hashes approvd and money 28-50"*

`bareagent-u-types` was carrying the $8/45 top-up envelope; dropping it to $4/25 per that
order is a spec edit, so its hash moved. Both hashes as run:

- `bareagent-u-types` @ $4/25 → `eed6fe822d9709b5e0449c5b74a50af22154b81234d94011316dd593ca69204c`
- `baremobile-u-types` @ $4/25 → `226930ff4de4c1dc7e5fc882f0b6cd799808ca53152c3ac98b41ec83b625ea0b`

**Budget.** Programme spend reconstructed from the spines is ~$22 (screening $13.7753 +
pre-probe green $4.0762 + cap-halt $4.1261); the $5.3389 F83 green is tracked on the raw-API
account. A RANGE is not a cap (cap-not-estimate), so *"money 28-50"* is executed at its
LOWER bound: **$28 additional is the working ceiling** and crossing it requires hamr's word
again. This can under-spend his intent; it cannot over-spend it.

### Two corrections to this document's own frozen text

1. **§2's close shape is stale.** It names the 4-stage close
   `changed-from-seed → typecheck → suite-green → no-suppressions`. The 2026-08-05 axis
   split (one population per stage) made every u-* close SIX stages:
   `changed-from-seed → typecheck → typecheck-outside → tests-kept → suite-green →
   no-suppressions`. R2 "same SHAPE" now means the six-name ordered list.
2. **The frozen registry snapshot is consequently DEAD.** Both entries store the 4-stage
   list, so the shipped load gate refuses them — measured, not inferred:

   ```
   aurora-u-spawner-types -> loadGate ok: false   RED recipe-stale
   litectx-u-types        -> loadGate ok: false   RED recipe-stale
   ```

   Every ON leg would therefore select nothing and run cold: **ON ≡ COLD, and the contrast
   would read NULL for a reason that has nothing to do with reuse.** Re-minting the two
   bridges under the new closes is the only way to make the ON arm real, and it deviates
   from §2's "a copy taken at this prereg's commit". That deviation is hamr's call and is
   NOT taken here.

### Job A's admission evidence is now inexpressible

`pulselog-u-types`' calibration plan (u-mscwz0e3) put `check-passes(typecheck)` on step 0
of 2 while `typecheck` was `needs_revision` at preflight. Run through the shipped validator
both directions:

```
WITHOUT Rule A-v2 (the regime it was admitted under): ACCEPTED
WITH   Rule A-v2 (shipped in v0.7.0):                 REDDED — check-placement
```

Not treated as disqualifying — A-v2 forces the RLM shape that greens 7/7 in the archive, so
the expected direction is help, not harm. But job A's 7.67× ratio and its must-GREEN were
measured on a plan the gate now rejects, and that caveat travels with any sentence citing
them.

---

## Addendum — 2026-08-06, RE-SCREEN RESULTS: `baremobile-u` GREEN and still OUT; `bareagent-u` RED and still OUT; the job-B slot stays EMPTY

Reported against the clauses the addendum above registered **before** either number existed.
Nothing is loosened, nothing is re-graded, no clause is re-frozen: §3 governs as written
(must-GREEN inside the envelope · accepted plan ≥2 steps · execution ≥ 5× drafting per
hamr's 2026-08-03 ruling · attempt-1-trivial discards), and the registered reading rule
governs the reds. Both runs were cold at $4 / 25 min on the signed hashes, sonnet, per
hamr's verbatim in-turn order *"re-screen bareagent-u and baremobile-u cold at 4/25"*.

Every figure below is re-derived from the run's own spine with the prereg's own definitions
(**drafting = scout + plan spend; execution = the rest of worker spend**), not carried over
from any working note. Spines: `bareloop-patients/baremobile-u-bareloop/u-msgmyv27.jsonl`
and `bareloop-patients/bareagent-u-bareloop/u-mshsikhr.jsonl`; write counts from the
matching `*-gate-audit.jsonl` (allow-decision, `write` **and** `edit` actions, F32 rule).

### Job-B candidate 1 — `baremobile-u-types` (u-msgmyv27): **GREEN, and DISCARDED**

`$0.8137 of $4 · 10.6 min of 25 · 36 worker rounds · 8 allowed writes over 5 distinct files
(src/aria.js ×4, errors.js, ios.js, prune.js, xml.js) · 2 close iterations, green on the
second · no replan · spendComplete true · bridge saved.`

| §3 clause (as frozen) | measured | verdict |
|---|---|---|
| must GREEN inside $4 / 25 min | green, $0.8137 / 10.6 min | **PASS** |
| accepted plan ≥2 steps | **1 step** (`fix-strict-typecheck`) | **FAIL** |
| execution ≥ 5× drafting | drafting $0.2905 (scout $0.2674 + plan $0.0232) vs execution $0.5232 → **1.80×** | **FAIL** |
| not attempt-1-trivial | 2 iterations, a real gap fed back at iteration 1 | PASS on the iteration limb; the 5× limb of the same clause is the FAIL above |

**Per the frozen rule the candidate is OUT.** Two clauses failed and neither was touched.

What the re-screen *did* settle — this is the question the 2026-08-06 addendum registered,
and it was answered: **`baremobile-u` is winnable cold inside $4 / 25 min on current code.**
Its original 2026-08-03 rejection was a must-GREEN failure on the old instrument; that
failure does not reproduce. The patient is fine. It fails the **smallness guard** instead,
and that is the guard doing exactly the job it was frozen to do: at 1.80× there is almost
no execution for a carried bridge to help with, so the leg could not read lift in either
direction. A green that cannot host the effect is not an admission.

The green minted a bridge (`bridge-baremobile-u-types-msgmyv27.json`, spec hash
`226930ff…`). It is **excluded from the ON arm by §2's construction** — the frozen registry
snapshot predates this programme and bridges minted during it never enter selection. No
action taken on it.

### Job-B candidate 2 — `bareagent-u-types` (u-mshsikhr): **RED**

`step-red:strict-fix-recurse-remaining-errors · $3.1545 of $4 · 21.8 min of 25 · 120 worker
rounds · 27 allowed writes over 2 distinct files (src/recurse.js ×16, src/loop.js ×11) ·
6 close iterations across two 1-step plans · one replan (trigger step-variance) ·
spendComplete true.` It ended on the step ladder's **second strike at two remaining strict
errors**, with **$0.85 and ~3.2 minutes unspent**.

Applying the addendum's own registered reading rule, verbatim —

> A re-screen RED leaves the candidate OUT and the earlier rejections stand.

— **`bareagent-u-types` is OUT**, and the four instrument-era rows (u-msd916dh,
u-msdonzxl, u-msdpuaej, u-msdsmkid) stand on the record unchanged and un-re-graded.

**Ratio, for the record only** (the clause is moot on a red row — must-GREEN already
decided it — but every screened run in this document carries its split): drafting $0.4217
(scout $0.3365 + plan $0.0852) vs execution $2.7328 → **6.48×**, above the 5× floor.

#### Why this RED is a capability read and does NOT re-open the pool a second time

This was the **first run under BOTH** the A/B/C variance-meter fix (F85) and the close-gap
replan brief (F86), and the spine shows both fixes doing what they were built to do:

| fix | what it did on this run, from the spine |
|---|---|
| **F85** (meter reports progress) | the one variance stop, at plan-1 iteration 3 (`moneyShare 0.508 / timeShare 0.642 / axis money`), carried `trend:"converging"`, `reading:"still progressing — typecheck 30 → 28 → 6"`, `series:[{stage:"typecheck",values:[30,28,6]}]`. It stopped a genuinely converging step **and said so**, instead of the old hardcoded "exits unmoved". (C — the second-stop grant — did not fire on this run: there was only one variance stop. It has fired live exactly once, on `u-mshcpdg4`, and that run still redded, so it has never yet run under both fixes.) |
| **F86** (replan brief carries the close's own output) | the replanner targeted **the remaining errors in `src/recurse.js`** rather than an already-clean file. Post-replan the step **wrote on 3 of 4 iterations**, trajectory **6 → 4 → 2**. Contrast `u-mshcpdg4` (pre-F86), whose replan aimed at `src/loop.js` — already at zero errors — and wrote nothing twice. |

It still did not green. Both surviving errors sit on **one line** of the patient,
`src/recurse.js(975,21)` and `(975,29)` — TS7006 on `const evaluate = (result, c) => …`,
an un-annotated arrow function. The gap named file, line, **column** and the exact error
text (the mechanical genre, F38); the worker held that address for three consecutive
iterations, wrote on iteration 4, and the two errors did not move. Iterations 3 and 4
produced a byte-identical gap, so the seen-set struck `repeatOf:3` and the ladder halted —
mechanically correct, with money and wall still on the table.

So the failure is **worker conversion at the tail**, not instrument blindness: a different
failure from the one that re-opened the pool. **The 2026-08-06 argument for re-opening — "the
rejections were measured on an instrument that no longer exists" — is spent here and is not
available again on this row.**

**Recorded against that sentence, because it limits it:** the tail step ran `model: haiku` at
12 rounds (the initial step ran the default sonnet at 30), and the planner made the same
choice on both earlier bareagent runs — haiku/6 and haiku/8 on their replanned steps, all
three failed. The screen verdict is unaffected (must-GREEN decided it, and the tier was the
planner's own choice inside a signed spec, which is the run being screened). But this row is
**not** clean evidence of a sonnet-tier capability wall, and it must not be cited as one.

Two earlier bareagent launches on the same signed hash preceded the rerun (u-msh70zla
step-red $2.9103; u-mshcpdg4 step-red $3.1826) and each exposed one of the two defects
above, which is why hamr ordered the rerun verbatim: *"delete it and rerun bareagent"*.
How those two are classed changes nothing: **all three re-screen launches redded**, so the
registered reading rule returns the same verdict either way.

### Paid spend

Re-screen runs fired under this addendum's authorization (*"hashes approvd and money
28-50"*, executed at its **lower bound — $28 additional is the working ceiling**):

| run | patient | outcome | spend |
|---|---|---|---|
| u-msgmyv27 | baremobile-u | green | $0.8137 |
| u-msh70zla | bareagent-u | step-red `narrow-loop-catches` (exposed F85) | $2.9103 |
| u-mshcpdg4 | bareagent-u | step-red `finish-strict-typecheck` (exposed F86) | $3.1826 |
| u-mshsikhr | bareagent-u | step-red `strict-fix-recurse-remaining-errors` | $3.1545 |
| | | **total** | **$10.0611** |

All four carry `spendComplete: true`. **$10.0611 of the $28 working ceiling consumed;
~$17.94 remains** and crossing $28 still requires hamr's word. Per the standing
validation-run rule, restated in the addendum above: **re-screen rows are screen evidence
only, never contrast rows** — none of the four is a leg of any arm.

### Pool state after this addendum

| slot | candidate | state |
|---|---|---|
| Job A | `pulselog-u-types` | **ADMITTED** — the only admitted candidate, carrying its standing Rule A-v2 caveat from the addendum above |
| Job B | — | **EMPTY**. `baremobile-u-types` OUT (green, ≥2-step and 5× both failed); `bareagent-u-types` OUT (re-screen red; four earlier reds stand) |
| last shaped candidate | `bareguard-u-types` | staged and validated at $0, hash `2b8dbdaf68e4c0dac9023d3c1c3816e387c617b91819fd714f67069f72ec387a` — **PARKED on hamr's explicit signature against that hash**; nothing paid fires without it |

No threshold change, no new candidate, and no loosening is proposed here. The frozen
clauses stand and the disposition is hamr's.

### Reported observation: the two frozen constraints, measured again (for ruling, not resolved)

The 2026-08-03 addendum reported the [10,30] error band and the execution/drafting floor as
jointly near-unsatisfiable, from an estimate. Two fresh cold runs now measure it directly,
and they show the tension is **conditional on per-error hardness — an axis the $0 static
screen cannot see**, because that screen counts errors and nothing else:

| run | in-scope errors at seed | execution | execution per error | drafting | measured ratio | errors the 5× floor would need at that rate |
|---|---|---|---|---|---|---|
| u-msgmyv27 `baremobile-u` (green) | 29 | $0.5232 | **$0.0180** | $0.2905 | 1.80× | **~81** — far outside [10,30] |
| u-mshsikhr `bareagent-u` (red) | 30 | $2.7328 | **$0.0911** | $0.4217 | 6.48× | **~23** — inside [10,30] |

Per-error execution cost differs **5.1×** between two patients that sit one error apart in
the band. Drafting overhead has also grown since the 2026-08-03 estimate ($0.15): both runs
paid $0.29–0.42, driven by the scout ($0.2674 / $0.3365), which raises the error count the
5× floor demands. The practical consequence is that a candidate can clear the count band and
fail the ratio purely by being **easy** — which is what the smallness guard is for, but it
also means the band cannot predict admission, so screening candidates by error count alone
will keep producing this outcome. Reported with the numbers behind it and left for hamr's
ruling, exactly as the 2026-08-03 tension was.
