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

**Root cause of the red — planning scope, not the ladder and not the close.** The
spec goal names BOTH files ("Make src/recurse.js and src/loop.js pass tsc --strict")
but both drafted plans scoped the edit step to `src/loop.js` ONLY (34 allowed writes,
1 distinct file). The worker cleared loop.js completely (gap file list shrank from
recurse+loop to recurse-only) then ground against recurse.js errors it was never
scoped to touch. The replanner rebuilt the same single-file scope even with the gap
naming recurse.js in hand — the known "replan cannot heal what the planner doesn't
know" class (rules belong at the validation gate; recorded, not fixed here).

**Density observation, still recorded-not-minted (n=4 now):** the run died with 19
errors pinned in `recurse.js` — the densest file, again at/over the ~15 band from the
n=3 observation above.

**Pool state:** bareagent-u is out twice (pre-fix and post-fix). `bareguard-u`
(hash `2b8dbdaf…`) is the LAST shaped candidate, staged and validated at $0 —
nothing paid fires without hamr's explicit signature on that hash.
