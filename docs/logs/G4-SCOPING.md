# G4 — the halt → replan → green bench row: scoping ($0, 2026-09-05)

Status line at the bottom. Pre-registered before any G4-labelled number exists. hamr's
definition (2026-08-31, verbatim in `docs/logs/G2-SCOPING.md` §"G3/G4 scoping"): **G4 =
ANY halt → replan → green, not narrowly a money cap-halt.** Forcing a halt by shrinking a
budget is a tuned knob — the same sin as raising a cap to manufacture a green. Preferred
shape: a job whose first plan is a known habitual dead end, so the strike-out → replan is
real rather than engineered.

## What G4 is for

G1–G3 grade the close and the wall. G4 grades the LOOP: when the arbiter stops a step (the
strike ladder, or the variance meter), does the replanner turn that stop into a green? F124
measured why this matters — dying runs are where the money goes (plan-flow step-red at a
median 43% of budget, halts 22.8% of all spend). G4 is the bench's instrument for "the
system recovers," which nothing else on the bench measures.

## The $0 archive read (F127 — every archived spine, 2026-09-05)

| measure | value |
|---|---|
| spines with a `job-start` and `job-end` | 290 |
| runs with ≥1 `replan` record | 25 |
| of those: green | **4** (16%) |
| of those: step-red | 17 |
| of those: cap-halt / wall-halt / provider-red | 2 / 1 / 1 |
| replan trigger classes seen | `strikes` ("step exhausted its attempts with exits still red", 16 runs) and `variance` ("the meter stopped a step…", 11 records) |

The variance meter (T/A, live since 2026-08-03) and the strike ladder are the two halts that
lead to a replan today. Both are arbiter-side stops. Both count as "any halt" under hamr's
definition; neither is money-tuned.

**Per job** (runs / replanned / replan→green / cold→green):

| job | runs | replanned | replan→green | cold→green |
|---|---|---|---|---|
| `litectx-u-types` (bench row) | 14 | 6 | **2** | 3 |
| `aurora-testgen-l2accept` (legacy $8 battery) | 13 | 6 | 2 | 1 |
| `bareagent-u-types` | 12 | 6 | 0 | 2 |
| `aurora-u-spawner-types` (bench row) | 24 | 0 | 0 | 14 |
| `aurora-testgen-cold` (G2) | 5 | 2 | 0 | 1 |
| `pulselog-g3-types` (G3) | 1 | 1 | 0 | 0 |

The aurora spawner row has NEVER replanned in 24 runs — it is the wrong host for G4. The
litectx row replans in 6 of 14 runs on its own, and 2 of those 6 greened — including its
run `u-mtfywb55` ($5.72, 2026-08-30): variance halt on `make-src-strict-clean` ("still
progressing — typecheck 63 → 29 → 5") → replan → green. **Correction (2026-09-05, after
checking `job-start.specHash`):** that run is at the row's PREVIOUS hash `31733829…`, before
the model-pin re-hash — same worker model, same patient, so the same condition in behaviour,
but not the frozen signature `42a7c427…`. At the frozen hash the row has 0 G4 instances in
2 runs (`u-mtg5bwfn`, `u-mtotxw1z`, both cold greens). The archive evidence for the habit
(6/14 replans) spans both hashes.

**The habitual dead end, named from the archive.** litectx's replans fire on a check-only
"verify strict typecheck" step that cannot pass on its own (`verify-strict-typecheck` ×2,
`final-strict-verify`, `fix-index-catch-typing`), or on the variance meter stopping one big
fix step. This is the shape-lottery pattern already on record (per-file decomposition with an
early whole-goal check almost never greens): the first plan habitually puts a whole-goal
check where the work is not yet done. It is not engineered; it is what sonnet-5 drafts for
this goal, measured across 14 runs.

## Design — G4 as a READING of the litectx row, not a fifth row

- **Host:** `litectx-u-types`, unchanged — hash `42a7c427…`, $10 / 45 min, patient
  `../bareloop-patients/litectx-u` @ `96813a4`, `--read-shim off`, `claude-sonnet-5`
  (`docs/logs/BENCH-PREREG.md`). No spec edit, no re-sign, no budget change in either
  direction.
- **What a G4 instance IS (mechanical, from the spine, no judgment):** in one run, in
  order, (1) a halt record (`ladder` strike-out or `variance`) on a step, (2) a `replan`
  record naming that step, (3) `plan-accepted` for the replanned plan, (4) `job-end
  outcome:"green"` with the close's stages satisfied AFTER the replanned plan executed. All
  four on one spine or it is not an instance.
- **A cold green** (no replan) on the litectx row is a normal G1-class green and **NOT a G4
  reading** — neither pass nor fail; G4 simply did not fire that pass. Never re-fire to
  "get" a replan: that would be paying for a coin flip (6/14 base rate).
- **A replan → non-green** on the litectx row IS a G4 red — the loop was exercised and did
  not recover. Recorded honestly, n=1, no re-budget.
- **Cost:** $0 marginal. G4 rides every litectx bench pass hamr already chooses to fire;
  the per-pass ceiling ($19 after the G3 swap, $24 hard) is untouched and no fifth-row
  ceiling question opens.
- **Baseline:** `u-mtfywb55` is G4's first instance at the PREVIOUS hash (correction
  above). G4 needs no establish fire — it is a reading, and reads fire only when a replan
  happens; a cold green is not a miss.

## A named candidate rail — NOT built (PRD v1.83 principle)

Half of litectx's replans (3 of 6) fired on a check-only "verify strict" step drafted before
the work was done. A validation-gate rule could reject that plan shape outright. It is NOT
built, by hamr's rails-versus-freedom principle (`docs/product/PRD.md` v1.83): the payoff
is unmeasured beyond one job's half-dozen replans and F123's 3.3% gate-red share; the rail
would forbid a cheap probe that is sometimes the right move; and G4 is exactly the
instrument that reads whether the loop recovers without it. Re-weighed after G4 has read
one or two litectx passes: if replans keep failing there, that number earns the rail.

## Alternatives considered, and why not first

- **A planted dead end that IS fixable after replan** (a G3-shaped plant whose honest path
  exists once the trap is recognised — e.g. a misleading test title, the misdiagnosis
  mechanism measured across models). Structurally clean, but it is a NEW row: its own
  patient, its own $0 unwinnable/winnable proofs, its own signature, its own establish
  fire, and the parked fifth-row ceiling question. Kept as G4's second act if the reading
  above proves too sparse (a replan fires in ~43% of litectx passes; if three consecutive
  passes go cold, revisit).
- **A shrunk budget or wall to force the halt** — ruled out by hamr, verbatim.
- **`aurora-testgen-l2accept`** (2 replan→greens) — legacy $8 battery shape, not a bench
  row, patient never frozen under the bench signature; its 55-run sibling never greened.

## Frozen rules (pre-registered now)

- G4 is read ONLY from the four-record chain above; no prose judgment of "did it recover."
- A cold green is "G4 did not fire," never a G4 pass and never a reason to re-fire.
- A replan → non-green is a G4 red at n=1; a colour flip across passes follows the bench's
  own n=3 rule (`docs/logs/BENCH-PREREG.md`).
- No budget/wall change to the litectx row in either direction on G4's account.
- Nothing here changes any signed hash; nothing is built. If a detector is ever wanted, it
  is a REPORT-ONLY reader over the spine (the replay tool's class), never a runtime change.

## Open / not yet

- hamr's word on the design: G4 as a reading of the litectx row ($0, banked instance
  exists) vs a planted fixable dead end as its own row (new patient + fifth-row ceiling).
- If "reading": a one-line BENCH-PREREG amendment naming the G4 chain and `u-mtfywb55` as
  its first instance — docs only, hamr's word.

## First deliberate test pass (2026-09-05)

`u-mtotxw1z` at `42a7c427…`: green, $6.18, 14.5 min, 1 step, no replan. The mechanical
reader (scratchpad `g4-read.mjs`, checked first against a known instance, a known cold
green and a known replan-red) says **G4 DID NOT FIRE**. Not a pass, not a fail, no re-fire.
Tally at the frozen hash: 2 runs, 0 replans. The 6/14 archive rate spans older hashes and
July-era plans; whether the model-pinned condition replans as often is now an open
question the next passes answer for free.

## Counting rule (hamr, 2026-09-05: "A, count the free passes")

G4 is read off every litectx pass hamr fires for the bench anyway — no G4-only fires. The
count at the frozen hash `42a7c427…` is kept here and in BENCH.md: **replanned / runs**.
Today: 0 / 2. **Tripwire:** three consecutive cold passes at the frozen hash (i.e. the
count reaching 0 / 4 with no replan) means the habit did not survive the model-pin
condition; then G4's second act — the planted, hand-provable fixable dead end — gets
scoped as its own row. Until the tripwire, nothing is built and nothing is fired for G4.

**Status line: SIGNED as a reading (hamr "A"). Frozen-hash count 0 / 2. Tripwire at 0 / 4.
No build, no G4-only fire.**
