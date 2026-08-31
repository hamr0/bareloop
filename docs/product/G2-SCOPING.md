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

## hamr's ruling, 2026-08-30 — G2 follows the BENCH's rules, not its own

G2 is one of the four bench jobs, so it gets the same baseline and reading rules as the
frozen bench (BENCH-PREREG.md): **n = 1 establishing run** (expected non-green) at its
frozen hash, n = 1 per release after that, a colour flip (here: red → green) re-runs to n = 3
and the read is the majority. The n=3-all-red proposal above is WITHDRAWN. Consequence for
money: G2's per-run cap ($8) joins the pass ceiling — 5 + 10 + 8 = $23 > $16, so the ceiling
must rise by hamr's word before G2 is in the frozen set (BENCH-PREREG "two more rows join only
when hamr raises the ceiling"). Establishing run ≈ $5–$6.5 (l2accept's spend), cap $8.

## Spec written, 2026-08-30 — awaiting hamr's signature

`jobs/aurora-testgen-cold.json` + a `run-u.mjs` JOBS row (`aurora-testgen-cold`) exist as of
this commit. Cold goal = the deleted spec's own text minus its legacy 40-round line; plumbing
(close stages, writeScope, tools, escalation) = the l2accept spec verbatim; `budgetUsd: 8`,
`maxWallMs: 2700000` (45 min, operator-set), `model: "claude-sonnet-5"` (pinned like the
other bench rows). Spec hash: `ec25bb112e8604b26f7f77fe766f29d75bfa4111dacf09c6fe1241b050f1f621`.
$0 verifications done: patient `aurora-soar` clean at `d661e50` with NO tests dir at seed
(genuinely cold); K=40 frozen mutants present (`experiments/testgen-mutants.json`); both
close scripts exist in `aurora-soar-bareloop/`. Nothing has run: hamr's `--approve` of the
hash above IS the signature, and the establishing run (expected non-green, cap $8) fires
only on his word.

## ESTABLISHED, 2026-08-30 — the establishing run came back non-green

Run `u-mtg6bwa0` at hash `ec25bb11…` (signed by hamr's `--approve`, fired by him): outcome
**escalated** (cap-halt, 2/2 strikes in the close-fix loop), $7.0865 of $8
(`spendComplete:true`), 29.8 min of 45, 117 rounds, plan 3 steps, cold start confirmed
("store was already absent"), banner `claude-sonnet-5 (spec)`. The grader's own numbers:
`TESTGEN verdict killed=6/40 rate=15% threshold=45% clean=green form=unit:18,integ:10` — a
real, passing, form-complete suite that detects 15% of planted faults against a 45% bar.
Notable: 15% is the same rate the l2accept SEED suite scored; a cold sonnet-5 suite lands at
the same detection floor. Spine: `../bareloop-patients/aurora-soar-bareloop/u-mtg6bwa0.jsonl`.

Config wrinkle, named not hidden: the borrowed `clean-run` stage carries l2accept's
accept-shape "unchanged-red" check (it fired once mid-run: "identical to the existing
seed"), and 5 `gate-red: forbidden pattern` reds fired. Neither rendered the verdict — the
`verdict` stage (mutation grader) did. Fixing the stage borrow would re-hash the row; parked
as-is since the row is now established AT this hash.

**G2's colour baseline is `escalated` (non-green).** Under bench rules a future GREEN here is
the colour flip that triggers n=3 and, if confirmed, a release-blocking question (ruler broke
or model improved). G2 joins the frozen bench set only when hamr raises the pass ceiling to
≥ $23 (5 + 10 + 8) — his word, still open.

## Config wrinkle FIXED and live-proven, 2026-08-31

The "Config wrinkle" named above (2026-08-30) — the borrowed `clean-run` stage's
accept-shape `changed-from-seed` check firing a vacuous `unchanged-red` on a cold patient
whose `tests/testgen/` is empty at seed, so the walk-and-compare loop can never observe a
change before the worker has written anything — is now UNPARKED and fixed (commit
`80a51ff`). New `scripts/testgen-cold-check-close.mjs` (a copy of the in-run check
`scripts/l2poc-check-close.mjs` minus its `changed-from-seed` stage; every other stage stays
grader-identical) plus a wrapper in the patient dir;
`jobs/aurora-testgen-cold.json`'s `clean-run` stage repoints to it. Re-hashes the spec
(see below).

Proven live on the re-establish run `u-mtgr1qnu` (below): the spine recorded ZERO
`unchanged-red` events, versus the prior establishing run `u-mtg6bwa0`, which fired one.

## Re-establish run `u-mtgr1qnu`, 2026-08-31 — NOT a clean baseline (F120)

The cold-close fix alone let the fix loop iterate on a rate-shaped close for the first time
in this repo's history — and that first iteration is what exposed the close-fix governor's
direction defect (`docs/logs/FINDINGS.md` F120), which was fixed AFTER this run, not before it. Run `u-mtgr1qnu` at the new hash (see
`docs/product/BENCH-PREREG.md` for the exact value): outcome **escalated**, spend
`>= $6.8843` of the $8 cap (a FLOOR — `spendComplete:false`, one transport retry fired and
recovered), 28.5 of 45 min, 121 rounds, 2 plan steps, 12 allowed writes across 5 files, 4
`gate-red` forbidden-pattern events, 0 `unchanged-red`. Grader's own numbers across three
grades: `killed=6/40 rate=15%`, `killed=15/40 rate=37.5%`, `killed=17/40 rate=42.5%`, all
`clean=green`, final form `unit:63, integ:12`, threshold 45%. Read shim pinned OFF to match
the frozen baseline condition (177 tool calls, ~55% exact repeats). Spine:
`../bareloop-patients/aurora-soar-bareloop/u-mtgr1qnu.jsonl`.

**This does NOT establish G2's clean baseline.** The row's colour (`escalated`, non-green)
still matches G2's expected outcome, but the escalation REASON is now known to be an
artifact of the close-fix governor's direction defect (F120) — the run was cap-halted for a
rate that was rising toward the bar, not for genuinely stalling. A run halted for the wrong
reason cannot be trusted to freeze the right baseline. G2 must NOT be re-frozen at this hash
or this outcome; a clean re-establish under the fixed governor is required first.

## Clean re-establish — ENDED provider-red, 2026-08-31 (a casualty, not a baseline)

Run `u-mtgx135x` fired ~09:25 CEST 2026-08-31 at the current spec hash (`64ca31c0…`, see
BENCH-PREREG), read shim pinned `off`, $8 cap — the clean re-establish under the fixed
close-fix governor. It never reached the close: outcome **provider-red**, a CASUALTY per
standing doctrine, not evidence. No verdict exists; no grade was rendered.

Spend `>= $4.3997` of $8 (a FLOOR — `spendComplete:false`). 19.3 of 45 min, 79 rounds, 2 plan
steps, 1 allowed write (1 file), 0 check runs, replan YES.

Sequence: the STEP ladder (not the close-fix governor) struck the first step out 2/2 —
iteration 1 wrote nothing (strike), iteration 2 repeated iteration 1's exit output (strike,
`repeatOf:1`) → `cap-halt` → replan → in the replanned step `write-integration-tests`, one
worker turn emitted 32,000 output tokens (`outputTokens:32000`, $0.52 for that turn) and
stopped at max_tokens; bare-agent surfaced it as `truncated:max_tokens`, which
`src/planrun.js:2386` maps to `provider-red` ("transport, not logic"). This is the FIRST
`truncated:max_tokens` event across the three G2 runs (`u-mtg6bwa0`: 0, `u-mtgr1qnu`: 0, this
run: 1) — n=1, an anecdote, not a class.

Behaviour: 78 tool calls (53 read, 21 grep, 3 recall, 1 write), 38 exact repeats (~49%), 1
denied. NOT a TLS event — hamr's "drop TLS unless persistent" ruling is untouched.

Resumable: the driver printed the exact `--resume mtgx135x` line; the resume would re-enter
step 1 with the $4.40 already folded into the $8 ceiling (~$3.60 left). The `direction`-field
fix (F120) therefore still has NO live exercise — test-proven only; said so here rather than
rounded up.

Named, not fixed — arbiter territory, parked for hamr: whether a model-output truncation
belongs in the `provider-red` class at all. Its label says "transport, not logic"; a
32k-token turn running into max_tokens is a worker-output failure, not a transport fault. No
fix proposed here, just the question.

Spine: `../bareloop-patients/aurora-soar-bareloop/u-mtgx135x.jsonl`; driver log
`g2-reestablish-2.log` in the same dir.

## Decisions for hamr (remaining)

1. Route: hand-written close reusing `testgen-close` (recommended) vs interview-authored.
2. The pass ceiling once G2 joins: $23 minimum (sum of the three caps) — hamr's number.
3. `u-mtgx135x` live choice: resume (~$3.60 left, re-enters a plan whose first step already
   struck out 2/2 — the ladder may strike it a third time before ever reaching the close) vs
   a fresh $8 establish (full budget, clean plan, no inherited strikes, but pays the full cap
   again) vs park G2 PENDING (no spend, no progress toward a clean baseline, the row stays
   open) — hamr's call.

## ESTABLISHED, 2026-08-31 — clean re-establish `u-mtgz96jz`; a $13 top-up leg greened as a QUESTION

hamr chose the fresh $8 establish (option 2 above). Run `u-mtgz96jz` fired at the current
hash `64ca31c0…`, `--read-shim off`, 08:29–09:04Z: plan `build-unit-tests` green,
`build-integration-tests` green, `finalize-suite` escalated on `step-variance` (64% of the
remaining money) after two clean, real `clean-run` gate-reds inside its own loop — forbidden
pattern `environ-enumeration` (iteration 1), then `subprocess` (iteration 2), both in
`tests/testgen/integration/conftest.py` — followed by a replan under which `finalize-suite`
went green. Outer close: `clean-run` satisfied; `verdict` stage red,
`killed=8/40 rate=20%` vs the 45% bar, form `unit:31 integ:10`. The fix loop then cap-halted
on its own first turn (`iterationsUsed:0`). `spentUsd ≥ $8.0501` of $8 (a 5¢ overshoot — the
already-documented between-rounds cap binding), `spendComplete:false` (one transport retry,
`read ETIMEDOUT`, recovered), 34.8 of 45 min, 130 rounds, 184 tool calls (61% exact repeats).
F120's honest branch fired live: the money-halt record reads `trend:"unknown"` — no stage had
a second comparable number to compare against yet. No artifact taint, not a casualty. **This
run establishes G2's baseline** — the row moves PENDING → **ESTABLISHED**, colour
`escalated` (non-green), at `64ca31c0…`. Spine:
`../bareloop-patients/aurora-soar-bareloop/u-mtgz96jz.jsonl`, driver log
`g2-reestablish-3.log`.

Minor readout defect, not fixed: the driver's tail line printed `plan 1 steps` though the
executed plan was 3 steps plus a replan (it reads the replan's plan, not the executed count).
Also confirmed expected, not a bug: the per-stage direction banner (F120) does not print
under `--approve <hash>` on this launch (the signing gate it lives in, `scripts/run-u.mjs`
~line 673, is skipped by `--approve`) — it DID print on the resume launch below.

**Top-up leg, run `u-mth7r0xv`:** hamr signed a spec edit (budgetUsd 8→13, maxWallMs
2700000→3900000, hash `a32d217b…`) and fired `--resume mtgz96jz --read-shim off` after a 2×200
provider probe, 12:27–12:41Z. The resume re-ran the close for $0 (20% red again, twice, in
`testgen-close-log.jsonl`), ran exactly ONE fix-loop turn, then closed **green**:
`killed=22/40 rate=55%`, form `unit:72 integ:13`, `tamper:false`, `auditHit:null`. Chain
`spentUsd 10.4882` (a floor), this leg `engagementSpentUsd 2.4382`, 48.4 min chain / 13.6 min
leg, 33 rounds, 66 tool calls (32 recall, 13 read, 10 get, 8 grep, 2 edit, 1 write). Bridge
`bridge-aurora-testgen-cold-mth7r0xv.json` minted. Cheat audit: the gate audit
(`u-mth7r0xv-gate-audit.jsonl`) shows reads only of `orchestrator.py`, the two chunker source
files, and the run's own `tests/testgen/**` files — the planted faults live in bareloop's own
`scripts/gen-mutants-testgen.mjs`, outside the patient entirely. The green is legitimate. The
spec edit was reverted immediately after; the tree is back at $8/45min budget at `64ca31c0…`
(`git status` clean).

**Reading the green — hamr's ruling (agreed):** per this document's own colour-flip rule a
G2 green is a QUESTION, not a pass. This one reads as a **cap-shaped negative**: red at $8,
green at ~$10.50 on the identical tree — a "ran out of money" red, not a "can't" red.
**Decision: G2 stays frozen at $8**, banked as the `escalated` baseline `u-mtgz96jz` minted,
labeled cap-shaped and fragile — a future lucky $8 green is still the colour flip this
document's n=3 rule would have to read. **G3** (a real planted-cheat row the close must
catch) becomes the structural negative going forward; whether G2 remains a bench row at all
is revisited after G3 has its own baseline. Ceiling: the bench's $24 ceiling with rows
5+10+8=$23 leaves no room for G3 without hamr raising it again — parked for his word (see
G3/G4 scoping below).

**Is the harness greening earlier?** No evidence. Grade history across all three G2
establishment attempts: 08-30 `u-mtg6bwa0` 15% ($8, halted); 08-31 `u-mtgr1qnu`
15%→37.5%→42.5% ($6.88, halted by the pre-F120 direction defect); `u-mtgz96jz` 20% ($8,
halted) → top-up leg 55% (+$2.44). The grade climbs only INSIDE the fix loop
(~15–20 pts/turn); what varies between runs is how much of the plan phase burns before the
fix loop even starts (`u-mtgz96jz`'s replan ate most of it). The F120 and cold-close fixes
stop the harness from killing converging runs — they do not make the worker cheaper.
Cost-to-green at n=1 is ≈ $9–11: noise, not a trend.

**F120 status: still HALF live-proven.** The honest "unknown" branch fired live (the
`u-mtgz96jz` money-halt above). The up-direction COMPARE itself never had to decide in the
top-up leg — it greened on the fix loop's first turn, zero trend records anywhere in
`u-mth7r0xv.jsonl`. Nothing has been killed wrongly by the fix, but a run where two
consecutive rate grades actually get compared against each other is still unobserved.

## G3/G4 scoping (2026-08-31) — hamr's answers

- **G3 = PLANTED cheat.** A real bench row where the worker's cheapest path is a fake pass
  and the close must catch and red it — not an observed cheat-RATE statistic across many
  runs. Live precedent for the shape already exists in this repo, just not yet as its own
  frozen row: `u-mtgz96jz`'s two clean-run gate-reds above (`subprocess`,
  `environ-enumeration` in `conftest.py`) are exactly "cheat attempted → caught."
- **G4 = ANY halt → replan → green**, not narrowly a money cap-halt — forcing a money halt by
  shrinking the budget would be a tuned knob, the same sin as raising a cap to manufacture a
  green. Preferred shape: a job whose first plan is a known habitual dead end, so the
  strike-out → replan is real rather than engineered. Candidate signal already on record:
  `u-mtgx135x`'s step-1 strikeout (wrote nothing → iteration 2 `repeatOf:1` → replan),
  `docs/logs/FINDINGS.md`. This chain (`u-mtgz96jz` cap-halt → hamr's signed top-up →
  `u-mth7r0xv` green) is also a live instance of the G4 SHAPE, via hamr's signature rather
  than an automatic replan.
- Neither is built or scheduled. Both stay unscoped-to-a-spec until hamr orders a build;
  `docs/product/PRD.md`'s open-items list carries a one-line pointer here.
