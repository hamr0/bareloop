# G2 — the "never greens" bench row: scoping ($0, 2026-08-30)

**Status: SCOPING. No spec written, no money spent, nothing frozen.** This document answers
"what would it take to establish G2" from the archive and the tree, so hamr can set G2's own
ceiling. Sources: `docs/product/2026-08-23-agreed-build-list.md` §1 + Q2,
`docs/product/PRD.md` v1.78/v1.81, `docs/product/TESTGEN-PREREG.md`,
`jobs/aurora-testgen-l2accept.json`, `scripts/testgen-close.mjs`, `git show 507adbb^:jobs/aurora-testgen.json`.

## What G2 is for

Bench row G2 = "never greens" — *is the hard case still hard?* A sudden green there is a
QUESTION (model improved, or the ruler broke), never a win (build list §1). A bench row
freezes the CONFIG, never just the job.

## What the old G2 was, and why it cannot be reused

- `jobs/aurora-testgen.json` (deleted in `507adbb`): write ≥10 unit + ≥7 integration pytest
  tests for `packages/soar/src/aurora_soar/orchestrator.py` (2,455 lines), patient
  `../bareloop-patients/aurora-soar`, close = mutation-kill against K=40 frozen mutants
  (`scripts/testgen-close.mjs`, TESTGEN-PREREG §4/§6), `budgetUsd: 5`.
- Result: **0 of 43 valid rows green** (F38, 2026-07-16), median spend ~$0.9, range
  $0.23–$4.78. Mechanism NOT established (F38's "semantic stall" is n=1) — it is "the known-
  unwinnable row", not "the semantic row".
- It ran under the legacy operator-authored `steps[]` shape, which `507adbb` deleted. Not
  re-runnable. PRD v1.78: must be re-authored in plan-v1 as a different job with an unknown
  0-rate.

## The fact that changes the shape of the work

**The same job already greens in plan-v1.** `jobs/aurora-testgen-l2accept.json` — same
patient, same mutation-kill close (`testgen-close.sh` → `scripts/testgen-close.mjs`), plan
flow, `budgetUsd: 8` — greened **3 rows** on 2026-07-22 at $4.73–$6.48 (build list Q2).
Its goal differs in one load-bearing way: it starts from an EXISTING suite in
`tests/testgen/` and improves it ("accept" shape). The 0-of-43 row started COLD (no suite).

So the 0-rate is a property of the CONFIG (cold start + legacy steps[]), not of the job. A
plan-v1 cold-start G2 has a genuinely **unknown** 0-rate: it may be hard, or plan-v1 may have
made it winnable. Either answer is a finding; only the first makes it a G2 row.

## What needs building (all $0 until the runs)

1. **A plan-v1 spec `jobs/aurora-testgen-cold.json`** — copy the l2accept spec's plumbing
   (patient, close stages `clean-run` + `verdict`, `gapKeep`, `writeScope tests/testgen/**`,
   tools, escalation) with the COLD goal (the deleted spec's goal text, plan-v1 register).
   Hand-written close, not the authoring interview: the kind catalogue (`src/authoring.js:237`)
   has no mutation-kill kind (`command-exit`, `count-not-worse`, `pattern-absent-in-diff`,
   `files-changed`, `judged-floor`, `human-confirms`), so an interview-authored G2 would lose
   the ruler that made it hard. The `close` path is legal (`close` XOR `closeDecl`); hamr
   signs the hash.
2. **A `run-u.mjs` JOBS row** (`scripts/run-u.mjs:44`) for it — patient `aurora-soar`
   (HEAD `d661e50`, clean), spine dir `aurora-soar-bareloop`. Seed = `d661e50`, the same seed
   TESTGEN-PREREG froze. The patient's `tests/testgen/` must be EMPTY at seed for "cold" to
   be true — verify before signing (the l2accept runs may have left a suite; the reset rule
   `git reset --hard d661e50 && git clean -fdx` handles it if the suite was never committed).
3. **Mutant set:** K=40 frozen mutants under `aurora-soar-bareloop/` (`gen-mutants-testgen.mjs`)
   — confirm they still exist and hash-check, else regenerate at $0 (deterministic).

Riskiest assumption, POC-first: **"cold plan-v1 still never greens."** No $0 read can answer
it — the archive holds zero plan-v1 cold rows. It is answered only by paying.

## How many runs, and what they cost

- Rule proposed (not frozen): **n = 3 runs, all non-green → G2 established** and frozen as a
  row. Any green in the 3 → NOT a G2 row; minted as a FINDING ("cold testgen is winnable in
  plan-v1") and G2 needs a different hard job. Mirrors the bench's own n=3 majority rule and
  the standing "n=1 is an anecdote" doctrine.
- Per-run cap: `budgetUsd: 8` (l2accept's; the cold shape has no measured plan-v1 cost — the
  legacy $0.9 median is a different shape and is NOT a sizing basis). Wall: 45 min (l2accept
  rows ran 20–40 min — check spine before freezing).
- **Ceiling for the whole G2 establishment: 3 × $8 = $24 hard cap; expected $15–$20 if
  spend tracks l2accept ($4.7–$6.5/row).** This is OUTSIDE the $16 bench-pass ceiling by
  design (PRD v1.81) and is hamr's number to set. Authoring cost: $0 (hand close, no
  interview).

## Not in scope

- G3 (worker cheats, close catches it) and G4 (cap-halt → replan → green) — unscoped.
- Widening the kind catalogue with a mutation-kill kind (arbiter-adjacent; not needed here).

## Decisions for hamr

1. Route: hand-written close reusing `testgen-close` (recommended) vs interview-authored.
2. n=3-all-red rule for a negative row (recommended).
3. The G2 ceiling: $24 hard cap proposed.
