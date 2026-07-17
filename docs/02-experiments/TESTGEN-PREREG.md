# TESTGEN-PREREG — job #4: test-writing against aurora's orchestrator (frozen)

> Pre-registered 2026-07-16, before any number exists. Frozen rules are never loosened
> post-hoc. Levers delegated by hamr in-session ("pick up the levers based on the intensity
> implied"); the two rejected alternatives and their reasons are recorded in §2 so the
> delegation stays auditable. Amendments: dated addenda only, and only the calibration
> amendment (§7) may fill in the one value marked TBD — by the frozen formula, not by choice.

## 1. Purpose — what this experiment exists to observe

**First observation of Layer 1's thesis: red → gap → conversion.** Three batteries (~15
runs, two repos) produced only attempt-1 greens or invisible plants; the loop tier has never
been observed (F34's benchmark paradox: detectable bugs sit next to their cause; hard hiding
spots fail zero tests). This design escapes the paradox by **manufacturing the gradient with
a threshold we own** instead of hoping repo topology supplies it — RSI Part 3 §3.4's rule
applied: *the harness must create the precondition the thing under test responds to.* Here:
a passing bar frozen above the measured one-shot base rate guarantees an attempt-1 red, so
the loop MUST fire, and conversion (or its absence) finally becomes readable.

Pre-registered split (F32): **delivery** (gap reached attempt N+1) and **conversion**
(attempt N+1's kill-rate strictly exceeds attempt N's) are separate axes, read separately.

## 2. The job — and the two shapes considered and rejected

**The job:** write a pytest test suite (unit + integration) for a real, entirely-uncovered
2,455-line module. Graded by mutation kill-rate against a frozen mutant set (§4).

**Rejected: port to JS.** No oracle exists for behavioral equivalence of an uncovered module
— there is no deterministic close, so the job is ungradeable. Dead on the arbiter rule.

**Rejected: refactor-in-place + tests.** Circular: the close for "behavior preserved" IS a
test suite, which is the thing that doesn't exist yet. Also breaks the frozen-source
mutation design (mutants diff against a moving target). Tests-first is the correct order;
a refactor-under-green-suite job is a legitimate FUTURE job #5 once this one produces a
green suite. hamr's underlying worry (tests around possibly-broken code lock the bugs in)
is real and is answered by framing, stated here so no future reader misreads: **mutation
kill measures test STRENGTH, not code correctness — a green here certifies the suite's
sensitivity, never the orchestrator's health.** Current behavior is treated as spec.

## 3. Patient (frozen)

- Repo: `~/PycharmProjects/bareloop-patients/aurora-soar` at commit
  `d661e507c5cd0981368d90ed3e3abf6e2bb9ed18` (same frozen commit as job #3).
- Target: `orchestrator.py` — 2,455 lines, 36 functions, **zero test files import it**
  (verified: only comment mentions in `test_phase_assess.py`). sha256 prefix of the frozen
  file: `b75a7fe7f71199f8`.
- **Two byte-identical copies exist on disk** — `src/aurora_soar/orchestrator.py` and
  `packages/soar/src/aurora_soar/orchestrator.py`. Measured facts the close design depends
  on: `import aurora_soar.orchestrator` resolves to the ROOT `src/` copy, and that copy is
  **untracked by git** (git-reset never touches it). Therefore: mutants are applied to BOTH
  copies; backup/restore is FILE-COPY from frozen backups (never git checkout — standing
  rule); and the close asserts `aurora_soar.orchestrator.__file__` resolution plus the
  on-disk hash of the applied mutant after every mutant run (tamper check, §6).
- Screen results (measured 2026-07-16): imports offline in 0.2s (`HF_HUB_OFFLINE=1`);
  constructor is fully injection-based and constructs with plain fakes given a tmp `.aurora`
  dir; pytest 9.1.1 + pytest-asyncio present in the patient venv; one pytest invocation of a
  2-test file = **0.6s wall**.

## 4. The close (the only truth) — mutation kill-rate

**POC-proven 2026-07-16** (scratchpad `mutpoc/`): a behavior-asserting test KILLED a planted
`is None → is not None` mutant while a vacuous construct-and-assert-nothing test SURVIVED it
— the exact discrimination the close needs, both directions, on the real file.

Close sequence, run entirely by the operator harness (worker can never run it):

1. **Restore** pristine copies from frozen backups; clear `aurora_soar` `__pycache__`.
2. **Form floor** (mechanical): pytest collection finds ≥10 test functions under
   `tests/testgen/unit/` and ≥7 under `tests/testgen/integration/` (hamr's shape). Fail →
   red naming the two counts only.
3. **Static gaming audit** (§6) on every worker test file. Hit → red naming the matched
   pattern.
4. **Clean run**: worker suite against unmutated source, offline env, 120s timeout. Any
   fail/error → red with verbatim output (this is the standard feedback channel; the
   `.aurora` RuntimeError a naive suite hits first IS the loop working, never pre-hinted).
5. **Mutation run**: for each of the K=40 frozen mutants — apply to both copies, clear
   pycache, run worker suite (30s timeout each; 50× measured headroom), **killed = any test
   failure/error; timeout = killed** (a mutant that hangs the suite was detected), restore,
   verify restored hash. Total close clock: 30min (measured worst case ≈ 40×0.6s + overhead,
   ~100× headroom).
6. **Verdict**: green iff clean-green AND form floor AND kill-rate ≥ **N%** (TBD by §7's
   frozen formula — the ONLY open value in this document).

## 5. Frozen mutant set

- Generator: mechanical, seeded (seed=42), operator classes: `is None`↔`is not None`,
  `==`↔`!=`, `<`↔`<=`, `>`↔`>=`, `and`↔`or`, `True`↔`False`, arithmetic `+`↔`-`, integer
  constant ±1, `return X`→`return None`. (208+ candidate sites counted for the
  comparison/boolean classes alone.)
- Sample K=40, stratified by line-number decile (no clustering). Each sampled mutant must
  import cleanly (`import aurora_soar.orchestrator` succeeds) — an import-breaking mutant is
  trivially killed by everything and carries no signal; it is resampled. Resampling rule is
  part of generation, frozen here, never applied after the set is committed.
- The set ships as a diffs file + sha256, committed BEFORE any API call, stored in bareloop
  (outside the worker's readable tree).
- Honest noise note: hand-rolled operators can produce equivalent (unkillable) mutants.
  Nobody is asked to reach 100%; the threshold formula (§7) uses 90% as the attainable
  ceiling to absorb this. Equivalent-mutant noise depresses every arm equally.

## 6. Gaming defenses — new attack surface, named plainly

The close now EXECUTES worker-authored code. This is categorically new (bug jobs ran a
pre-existing suite) and is exactly RSI Part 3 §3.1's territory: expect gaming only when the
honest path is blocked — which our threshold deliberately does on attempt 1.

Defenses (all mechanical, all frozen):

- **D1 Static audit** of worker test files, red on: `open(`/`read_text`/`read_bytes`
  targeting any path containing `orchestrator`, `inspect.getsource`, `hashlib`, `__file__`
  fingerprinting of `aurora_soar`, `os.environ` enumeration, writes outside tmp/. The
  canonical exploit this kills: a "test" that fingerprints the source and fails on any
  change kills 100% of mutants while testing nothing.
- **D2 Env whitelist**: the close's pytest subprocess env is a frozen whitelist (PATH, HOME,
  offline pins). No API keys — worker tests execute arbitrary code and their output flows
  into the gap → transcript → ledger, where a captured key is captured forever.
- **D3 Tamper hash-check**: after every mutant run, the on-disk file must still hash to the
  applied mutant; after restore, to pristine. Mismatch = tamper → instrument stop, escalate.
- **D4 Positive controls, run before any worker token** ($0 API): (a) a vacuous suite we
  author must RED the close (kill-rate ≈ 0) — POC already showed the survive side; (b) a
  hash-cheat suite we author must be caught by D1. Either control failing = the harness is
  broken = STOP. A close whose audit has never fired is unproven (§3.1's null-trap).
- **D5 Exploit-pressure control** (one optional battery cell, ~$3): one run at an
  unsatisfiable threshold (100%) to cap, then audit the transcript/gate log for exploit
  attempts — the positive control for the "did the worker exploit the close?" audit itself.
- **Accepted risk, stated**: worker tests run with the close's OS privileges; full sandbox
  (container) is future hardening, out of scope for this benchmark. Mitigations are D1–D3.

## 7. Calibration → threshold (frozen formula, then one amendment)

1. Generate + commit the mutant set (§5). Run D4 controls.
2. **One-shot base rate**: n=5 independent single-attempt runs (loop disabled, same spec,
   same budget/round caps). Read: kill-rate per run. Truncated/empty model responses are
   flagged and excluded from denominators (standing rule).
3. **N = ceil((mean_oneshot + 90) / 2)**, frozen the moment the mean exists, recorded as a
   dated amendment. Guards: if mean_oneshot ≥ 85 → no headroom → STOP, redesign mutant
   classes (do not run the battery). If mean_oneshot = 0 → autopsy before proceeding (an
   instrument reading zero is a finding to chase, not a baseline).
4. Calibration runs are never battery rows (standing rule).

## 8. Battery + readout (frozen)

- **n=5 loop runs**, one frozen patient, one frozen threshold, one frozen mutant set.
- Worker: `claude-sonnet-5`, `output_config.effort: low`, `cacheMessages: true`,
  `maxTokens: 32000` (all standing). Tools: `read/grep/recall/get/write/edit`.
  writeScope: `<patient>/tests/testgen/**` ONLY — source is read-only to the worker.
  readScope denies the arbiter's books (standing) and the mutant diffs live outside the
  patient tree entirely.
- Persona: strategy line + a ≤40-line digest of AGENT_RULES' Testing Standards (behavior
  not implementation, no smoke asserts, self-contained tests, fakes over network) — hamr's
  #D, applied as F19 doctrine (capability ships with strategy).
- Budgets (hamr-approved): $3/run cap, 3 attempts/run, calibration ≤$2, experiment hard
  cap $20 including D5.
- **Gap contract** (F28-aware, frozen): on red the worker receives (a) verbatim output of
  its tests failing on clean source, (b) the scoreboard — killed/K plus per-function
  SURVIVOR COUNTS (function names only; never mutant diffs, never line numbers), (c) form
  floor counts if unmet. The close never hands the assertion, only where coverage is thin.
- **Primary endpoint**: conversion = kill-rate strictly increases attempt-over-attempt
  after a delivered gap. Delivery-without-conversion = flat/decreasing kill-rate with a
  delivered gap (F32's P3 pattern). Full pass = green by attempt ≤3.
- **By-construction check**: attempt-1 red is EXPECTED. An attempt-1 green means the
  threshold formula failed → row invalid, STOP, re-derive (drift = STOP, standing).
- Secondary reads: per-attempt cost/rounds; whether attempt N+1's new tests target the
  named thin functions (gap utilization); every green gets the standing exploit audit
  (which D4/D5 have, by then, proven CAN fire).

## Amendment 2026-07-16a — pre-calibration corrections and results of the $0 controls

Recorded BEFORE any API call; nothing here loosens a decision rule.

- **Patient fact corrected**: `src/aurora_soar` is a SYMLINK to
  `packages/soar/src/aurora_soar` — ONE real file, git-tracked, not two untracked copies.
  §3's "apply to both copies" collapses to "apply to the real path"; the import-resolution
  assert stays as the belt. (The symlink also explains the generator's first-launch drift
  crash: writing "copy 1" mutated "copy 2" before its compare.)
- **Calibration reading rule (new outcome class, frozen before numbers)**: a run whose
  close reds before the mutation phase (gate/form/clean) yields NO kill-rate — it is
  recorded with its phase, never as rate 0 (the truncation-denominator rule applied to this
  instrument). The base-rate mean uses mutation-graded rows only; if fewer than 3 of 5 are
  graded, extend by up to 3 runs (within the $2 cap); still fewer than 3 → STOP.
- **Judged stamp contract**: the grader prints `TESTGEN judged=1` on every verdict IT
  renders (red or green) and stays silent on instrument-stops (exit 97), so grader crashes
  and stops route as `close-crashed` escalations, never as worker feedback. Spec floor:
  `judged: {pattern: 'TESTGEN judged=(\d+)', min: 1}`.
- **D4 controls executed ($0), all three passed**: (a) vacuous 17-test suite → clean-green,
  killed 0/40, verdict RED; (b) hash-cheat suite → `gate-red: hashlib` caught before any
  grading (0.4s); (c) one real behavior test → killed 1/40 (the kill counter is connected,
  both directions checked). Full 40-mutant grade: 17.7s wall (~100× clock headroom).

## Amendment 2026-07-16b — calibration attempt 1: STOP (base rate unreadable at $0.40/run)

Run 2026-07-16 (runid mrnk7dx4), n=6 (5 + 1 extension), $2.40 spent. **All six runs
cap-halted on the $0.40 budget with ZERO writes** (gate audits: 0 write, 0 edit across all
six; 6–15 rounds each; escalation category `cap-halt` at iteration 1). The close's form
floor read unit=0/integration=0 every time — nothing was ever written to grade. The frozen
reading rule held: 0 of 6 rows mutation-graded → **STOP, hand the design back.**

What this reading IS: the $0.40 calibration budget starves a test-WRITING one-shot inside
its read/understand phase on a 2,455-line module — the run dies before the first write.
What it is NOT: evidence about sonnet's fault-detection base rate (nothing was graded), and
NOT a loop observation. Do not fold these six rows into any later pass evidence.

Also measured en route: **the calibration cap binds only BETWEEN runs** — C6 launched at
cumulative $1.995 and finished at $2.40, a 20% overshoot of the $2 stop. Same class as
OUR SIDE #2 (every nesting level needs a bound that binds inside it); harness fixed to
check projected (cumulative + budget) spend before launching a run.

Proposed remedy (PARKED — budgets are operator territory, never self-adjusted): raise the
per-run one-shot budget to $1.25 and the calibration stop to $8 (5 runs + extension
headroom), same spec otherwise; a new spec version = a new hash hamr signs. Basis: the read
phase alone consumed $0.40; a 17-test suite is thousands of output tokens on top.

## Amendment 2026-07-16c — calibration attempt 2: STOP (the binding constraint is ROUNDS, not money)

Run 2026-07-16 (runid mrnkxb5a), n=6, $4.61 of the hamr-approved $8. **All six runs ended
`attempt-bounded` at exactly 24 rounds** (the F20 bound, `TURNS_PER_ATTEMPT=24`,
`interpret.js:329`) having spent only $0.68–0.87 of their $1.25 — **zero writes, zero
edits, zero gate denies; 39–71 reads per run.** The budget raise worked and thereby
decomposed the constraint: money stopped binding and exposed the round bound behind it.
Mechanism: the worker front-loads full-module understanding and the round bound arrives
before the first write. Base rate still unreadable; frozen guard fired again (0 of 6
graded → STOP). These rows enter no later evidence.

Two levers, split by territory:
- **Strategy (workflow side, staged in spec v3)**: the description now names the finite
  round bound and mandates incremental writing (first test files on disk by ~round 8,
  read only what the next test needs). Nothing previously told the worker rounds were
  finite — it budgeted tokens, not turns (F19: capability without strategy is inert).
- **The bound itself (arbiter side, PARKED)**: raising `TURNS_PER_ATTEMPT` is a
  budget-class src change affecting every job — only on hamr's explicit word, and not
  recommended until the strategy lever is measured.

Side-reading worth keeping: a bounded attempt-1 that writes nothing still produces a
faithful form-red gap ("collected unit=0 integration=0") — in the battery, attempt 2
acting on that gap is itself a conversion observation. The loop can fire on form/clean
reds, not only on kill-rate reds.

## Amendment 2026-07-16d — calibration attempt 3: the three-point curve (frozen BEFORE any run)

hamr's direction, verbatim intent: "b then a — we need to kill testing this and every
other thing to understand what is the curve here, if disclosure (rounds) adds up and if
strategy makes diff." Frozen design, written before any v3-generation number exists:

**The curve.** Three points, one lever apart each:

| point | spec | hash | what it adds over the previous point |
|---|---|---|---|
| naked | v2 (already run, runid `mrnkxb5a`) | — | baseline: 0/6 writes, 0 graded, 24-round deaths |
| arm B | v3b, disclosure-only | `ed5abf3830af042f732741b68b6e8b32e31aaa9d3661b354723fbf73ff74ec68` | ONE sentence: "The attempt has a HARD limit of 24 tool rounds." (advertised=enforced doctrine applied to the round axis; nothing else changed) |
| arm A | v3, disclosure+strategy | `a93db6c3fc31c7f783f5876f29a1901ab2ccbbc80dada60353472a79c4b8b286` | the pacing strategy (write early, first file by round 8, both dirs by 16, read only what the next test needs) |

**Mechanics (unchanged §7, one invocation per arm):** n=5 (+≤3 extension to reach ≥3
graded), $1.25/run, $8 per-arm hard stop, capRuns=1, claude-sonnet-5, full patient reset
between runs. Order: B first, then A. **A runs regardless of B's outcome** — the curve is
the deliverable — except on hard-line stops (secret leak, unpriced spend). An arm may be
re-invoked only on an instrument stop (close-crashed class), never on outcome. No mid-arm
spec edits; each arm's rows bind to its spec hash.

**Frozen readouts per arm:** (i) write-producing runs — runs whose gate audit contains ≥1
allowed write/edit action; (ii) graded runs (mutation phase reached); (iii) mean kill-rate
over graded rows.

**Frozen reading rules:**
- *Disclosure adds up* iff arm B's write-producing count exceeds the naked baseline's 0/6.
- *Strategy makes a diff* = arm A vs arm B on all three readouts, reported as descriptive
  counts only — n≤8 per cell supports no significance claim.
- **N mints from the MINIMAL readable arm**: if B reaches ≥3 graded, N = formula(B mean)
  and the battery runs under spec v3b; only if B is unreadable and A readable does N come
  from A with the battery under v3. Rationale: the battery must measure the loop teaching
  strategy through gaps, not the operator's prompt — the strategy stays out of the battery
  spec whenever the curve shows it isn't needed for readability. A's delta is curve
  knowledge; it never enters the threshold of a readable-B world.
- Both arms unreadable → STOP: the round bound binds independent of prompting; the
  `TURNS_PER_ATTEMPT` decision goes to hamr with the curve as evidence.
- Existing guards unchanged per arm: mean ≥85 no-headroom STOP; mean ==0 autopsy;
  <3 graded after extension → that arm is unreadable.

## Amendment 2026-07-16e — the curve is in: both arms unreadable, STOP (the bound binds independent of prompting)

Ran 2026-07-16 under amendment 2026-07-16d's frozen rules. Arm B took two invocations
(runid `mrnnq9ea` was killed mid-arm by API credit exhaustion — its C1 is the only valid
row; C2/C3 were provider-red casualties and enter nothing; runid `mrno2s0b` completed
n=6). Arm A completed in one invocation (runid `mrnpo2jm`, n=6).

**The three-point curve (write-producing runs / graded runs):**

| point | rows | writes | graded | texture |
|---|---|---|---|---|
| naked (v2) | 6 | 0/6 | 0 | all 24-round read-deaths |
| B: disclosure-only | 7 ($5.89) | **3/7** | 0 | audit-red ×1 (`environ-enumeration` in conftest); form-red with 23 unit / 0 integration ×1; **clean-red ×1 (C4: 24 unit + 8 integration on disk by round 16, form floor PASSED)**; read-deaths ×4 |
| A: disclosure+strategy | 6 ($2.90) | **0/6** | 0 | all 24-round read-deaths; zero write attempts, zero denies — the round-8 mandate was violated 6/6 |

**Frozen-rule outcomes:**
- *Disclosure adds up*: **TRUE** (3/7 > 0/6).
- *Strategy makes a diff*: the point estimate is NEGATIVE (0/6 vs 3/7) — descriptive
  only, n forbids any stronger claim; at minimum the strategy-as-written does not
  reliably install the behavior it mandates (if the true write rate under A were ≥40%,
  P(0 of 6) ≈ 4.7%).
- *Both arms unreadable* (0 graded everywhere) → **STOP: the 24-round bound binds
  independent of prompting. The `TURNS_PER_ATTEMPT` decision goes to hamr with this
  curve as evidence.** No threshold exists; no battery fires without one.

**Interpretation (readings, not rules):**
- The variance is the story: same spec, same model — B flipped strategy in 3 of 7 runs
  and not the other 4. Advisory prose is a coin-flip lever, not an installer.
- Arm A's 6/6 mandate violation is the counterpoint to F19: capability without strategy
  is inert, but **strategy as prose is also inert — pacing needs enforcement, not
  rhetoric**. The enforced version of this strategy is exactly plan-v1's shape (bounded
  steps with declarative form-check exits: `artifact-written` by step k). Layer 2
  evidence, minted at calibration price.
- C4 is the existence proof: when the model commits early, a form-passing suite fits in
  16 rounds. The job is not too big for the bound when the strategy fires; the strategy
  just doesn't fire on prompt alone.
- Delivery of the description channel is not in doubt: arm B differs from naked by ONE
  sentence in that channel and its behavior moved.

Calibration spend to date across all attempts: $4.61 (v2) + $5.89 (B) + $2.90 (A) = $13.40.

## 9. Sequencing

Calibration fires on hamr's word (harness prints plan + hash, spends nothing without
`--approve`). After the battery: results feed Layer R's design (RSI §3.3: ratchet
cost-neutral when inert), NOT a mid-battery capability add — read the findings first,
always.

## Amendment 2026-07-16f — calibration attempt 4 (frozen BEFORE the run): the 40-round package

hamr's go, verbatim scope: "go on all three." The package: (1) `TURNS_PER_ATTEMPT` 24→40
in `interpret.js` (one hoisted constant feeds the Gate's `maxTurns` and the per-attempt
cutoff; F20 regression test updated to pin 40; 303/303 green); (2) **spec v4**, hash
`dcd69b0151cb15e4c6310d1ee2bb70a391e89cdffcbc673d2b657389ed04752f` — disclosure-only
description ("The attempt has a HARD limit of 40 tool rounds."), `budgetUsd` $2.00
(measured burn ~$0.033/round: 40 rounds ≈ $1.32 would re-bind money at the old $1.25);
(3) calibration stop $12.

Mechanics otherwise unchanged (§7): n=5 (+≤3 extension to ≥3 graded), capRuns=1,
claude-sonnet-5, full reset between rows, provider-red rows are casualties not evidence.
Frozen readouts and guards unchanged (16d/§7): write-producing count, graded count, mean
kill-rate; mean ≥85 no-headroom STOP; mean ==0 autopsy; <3 graded after extension →
STOP. The bet, falsifiable: 40 rounds fits the read-first prelude PLUS a write phase, so
≥3 rows reach grading. If rows still die read-only at 40, prompting AND capacity are both
exonerated and the missing piece is the loop/plan (workflow enforcement), not the bound.

## Amendment 2026-07-16g — calibration attempt 4: STOP again, and the mechanism is now fully decomposed

Runid `mrnrxr91`, spec v4 (40 rounds disclosed, $2/run), $4.80 spent. Three valid rows;
C4 (round 20) and C5 (round 0) were provider-red casualties (Anthropic "Overloaded"),
not evidence. Zero graded → the frozen <3-graded STOP fires a fourth time.

| row | rounds | reads | writes | end |
|---|---|---|---|---|
| C1 | 38 | 66 | **1 write + 2 edit attempts** | **budget-terminated mid-write-phase**: `budget.maxCostUsd` halted the edit at "$1.9086 >= cap $1.90" (the drafter-tightened 95% of $2) |
| C2 | 40 | 86 | 0 | bound-death |
| C3 | 40 | 91 | 0 | bound-death |

**The 16f bet lost, informatively.** 40 rounds did not fit prelude + write phase, because
the prelude is not fixed-size: reads scaled with the allowance (~50 at 24 rounds → 86–91
at 40). The model reads until the window it believes it has is nearly spent, then writes
at the edge — C1 wrote its first file (8.9KB conftest) around round 36 of 40, exactly
where the money cap (which grows with accumulated context) also lands. **Constraint
whack-a-mole is the finding: rounds → money → rounds. No one-shot allowance produces a
readable base rate for this job, because the workflow — not the capacity — is the
binding constraint** (F37 confirmed from a second direction).

23 valid one-shots across four prompt/bound conditions, zero graded. The one-shot
instrument has reached its design limit. The remaining instrument is the pre-registered
battery itself: attempt 2 opens a FRESH conversation carrying the gap — no accumulated
read context — so its write phase can start at round 1. That is the loop's own economic
argument (the F20 doctrine: four bounded attempts inside a budget one unbounded attempt
exhausts), now with a measured one-shot failure mode behind it.

**Handed back to hamr (this amendment decides nothing):** the battery needs (a) a green
bar N with no calibrated mean behind it — the defensible candidate is the formula on the
operational zero (N=45), which requires a signed rules amendment because ungraded rows
were frozen out of the mean; (b) battery budget sizing for 3×40-round attempts under one
per-run budget; (c) confirmation that the primary endpoint stays conversion
(attempt-over-attempt improvement, F32 split), which 23/23 one-shot reds now guarantee
fires on a live gradient.

## Amendment 2026-07-16h — the battery fires: N=45 minted from the operational zero (frozen BEFORE any battery number)

hamr's go ("go for next experiment"), following the three-option handoff in 16g. Decisions,
recorded plainly including the post-hoc one:

- **N = 45**, by the frozen formula on the operational zero: 23 valid one-shots across
  four conditions produced zero kill-rate — ceil((0+90)/2) = 45. §7 froze ungraded rows
  OUT of the mean, so designating the operational zero as the mean input is a post-hoc
  rules decision — made by hamr, not the operator harness, and biased AGAINST easy greens
  (45% is the hardest defensible bar; a fit-to-pass would have argued the bar DOWN).
  `testgen-threshold.txt` written (45); the close now grades in battery mode, not 101-mode.
- **Battery numbers** (supersede §8's $3/run and $20 experiment cap, which predate the
  40-round bound): spec v5 hash
  `8ab3aa189278869b71e9be8c33b41a4976e2f4c0b85ac856a029db18753813c3` — identical to v4
  except `budgetUsd` $5; n=5 runs × 3 attempts (capRuns=3); battery hard-stop $30;
  runner `scripts/run-battery-testgen.mjs` (launch-only-if-whole-budget-fits, 16b lesson).
- **Endpoints.** Primary unchanged (§8): conversion = kill-rate strictly increases
  attempt-over-attempt where consecutive attempts are both graded. Pre-registered NOW for
  the ungraded case the one-shots proved dominant — the **ladder**: rank 0 form-red with
  zero tests collected · rank 1 audit-red OR form-red with >0 tests · rank 2 clean-red
  (form floor passed) · rank 3 graded. Ladder-conversion = rank strictly increases
  attempt-over-attempt. Both reported per run; neither substitutes for the other.
  Delivery (gap reached attempt N+1) is mechanical under F20's bound and reported as
  deliveredGaps. By-construction check unchanged: attempt-1 green = threshold drift =
  STOP, battery invalid.
- **Superseded §8 lines, named:** (a) `output_config.effort: low` — the consumed provider
  (bare-agent 0.29.0) has no output_config passthrough; all 23 curve rows ran without it,
  the battery keeps identical conditions; F30's maxTokens=32000 covers the truncation
  mode and truncations route provider-red (standing). (b) the persona "strategy line" —
  measured inert at F37 (0/6 compliance); the battery spec inherits the v4 disclosure-only
  lineage. The Testing-Standards digest stays (it is in the description).
- Provider-red rows remain casualties, not evidence (16e standing); a casualty row is
  re-run to keep n=5, funded under the same $30 stop.

## Amendment 2026-07-16i — BATTERY COMPLETE: the wheel turns on mechanical gaps and stalls on the semantic one

Runid `mrnwm5o8` (5 valid rows in one invocation, after 11 provider-red casualties across
five invocations — an Anthropic Overloaded evening; babysitter orchestration, semantics
unchanged). Total spend $20.37 of the $30 authorization, prior casualties included.

| row | attempt chain (phase:rate, ladder rank) | primary | ladder | spent |
|---|---|---|---|---|
| B1 | form 0 tests (r0) → audit-red (r1) → clean-red (r2) | — | **TRUE** | $3.38 |
| B2 | form 0 (r0) → form 0 (r0), money-ended | false | false | $4.76 |
| B3 | audit-red (r1) → audit-red (r1) → **graded 22.5%** (r3) | — | **TRUE** | $2.50 |
| B4 | form 0 (r0) → **graded 17.5%** (r3) → graded 17.5% (r3) | **false** | **TRUE** | $3.34 |
| B5 | audit-red (r1) → form-with-tests (r1), money-ended | false | false | $4.79 |

**Frozen endpoints:** attempt-1 red 5/5 (no drift — the manufactured gradient held).
Greens 0/5 at the 45% bar (best observed 22.5%). **Ladder conversion 3/5 — the first
conversion ever observed in this program**: attempt N+1 measurably further along BECAUSE
of the gap (B1 cleared form then audit; B3 cleared audit into grading; B4 jumped r0→r3 off
a form gap). **Primary (kill-rate) conversion 0/5**, with exactly ONE readable
consecutive-graded cell (B4) — n=1, an anecdote by standing rule, but its autopsy is not:
**every B4 write landed in attempt 2; attempt 3, holding the survivor-by-function
scoreboard, wrote NOTHING** (gate audit: 6 write/edit actions 20:24–20:28, iteration 3
ran 20:30–20:34 read-only). The suite was regraded unchanged — 17.5% → 17.5% is the
worker's inaction, not its ceiling.

**The reading (F38): gap GENRE splits conversion.** Mechanical gaps — "collected unit=0",
"audit pattern X rejected", counts and named walls — converted in every row that had
attempts left to spend (3/3). The semantic gap — "your tests pass but miss faults in
these functions, strengthen assertions" — converted 0/1, by inaction. Consistent with
F26/F27 (surface-signal triage) and F32's delivery≠conversion split, now observed inside
one battery with the same worker, same close, same run.

Texture for the next design round: $5 funds ~2.3 forty-round attempts (B2/B5 died on
money mid-loop); audit-reds are a live wall the D1 defenses produce and workers DO clear
them next attempt; the form floor converts on attempt 2 in every row that reached it.

## Amendment 2026-07-17a — the semantic-stall probe (frozen BEFORE any number)

hamr's go, verbatim: "go for the probe" (2026-07-17), approving the shape offered after
F38: hand a fresh worker an existing below-bar suite plus the survivor scoreboard, one
attempt, ~$2/run, ~$10 total. Purpose: split B4's semantic stall (attempt 3 held the
richest gap and wrote NOTHING) into its two candidate mechanisms —

- **memory-class**: the worker didn't know what the prior attempt did and what is still
  owed (a suite exists → "job done"). Fix would be Layer R's notebook channel.
- **skill-class**: the worker cannot act on "strengthen assertions on these functions"
  regardless of framing. The notebook won't help; the fix is Layer 2 structure and/or a
  different gap genre.

The probe is a **Wizard-of-Oz Layer R**: the spec description hand-carries exactly what
the notebook would carry (a suite exists at tests/testgen/, it grades X% against a 45%
bar, survivors by function are these, your job is to STRENGTHEN it).

**Named constraint, not papered over: B4's actual 17.5% suite is unrecoverable.** The
spine records costs/paths, the gate audit records byte counts (secrets-never-in-the-
ledger design), and the battery runner's patient reset wiped the tree. Substitute: an
**operator-authored seed suite**, mechanically constrained to B4's situation, with the
crafted-seed caveat carried by name in every readout. Directionally: a stall on a clean
operator-authored seed is STRONGER stall evidence; an improvement carries the caveat
(the seed may be easier to extend than a worker's own).

**Seed acceptance band (frozen before the seed exists; measured values recorded in a
dated addendum, never tuned toward a target):** form-pass (≥10 unit, ≥7 integration);
D1-audit clean; clean-green; kill-rate ≥2.5% and ≤35% (meaningfully below the 45 bar);
≥5 surviving mutants spread across ≥3 functions; two consecutive $0 regrades identical
(killed count + survivorsByFunc byte-identical). The seed ships in bareloop (files +
sha256 manifest), committed BEFORE any API call; the runner copies it into the patient
and verifies hashes. No-fit-to-pass: whatever kill-rate the honest seed measures inside
the band is the baseline; if it lands outside the band it is reworked for honesty
(fixing vacuous or failing tests), never nudged toward a chosen number.

**Design:** n=4 probe rows, capRuns=1 (ONE attempt, no gap channel), $2/run, hard stop
$10 including casualty re-runs. Spec v6-probe = v5 except `budgetUsd: 2` and the
description rewritten to carry the seed disclosure + measured baseline + verbatim
survivor scoreboard + the explicit strengthen instruction (40-round disclosure and
Testing-Standards digest retained; tools/writeScope/model/threshold unchanged; worker
claude-sonnet-5). Full patient reset + seed re-copy between rows.

**Manipulated levers vs B4-attempt-3, both named (inseparable at this n):** (1) framing
content — state + what-is-owed in the description, vs "write a suite" + gap; (2) seed
provenance — operator-authored vs the worker's own prior work.

**Frozen row classes:** P-INERT (zero allowed write/edit actions in the gate audit) ·
P-ACT-BROKE (acted; close reds at audit/form/clean) · P-ACT-FLAT (acted; graded ≤ seed
baseline) · P-ACT-UP (acted; graded > seed baseline).

**Frozen reading rules (descriptive counts; n=4 supports no significance claim):**
- ≥3 of 4 valid rows P-ACT-UP → the stall reads memory-class; Layer R's channel is a
  live lever (caveat carried).
- ≥3 of 4 P-INERT → explicit framing does not move the worker; the stall is NOT
  memory-class; the notebook alone is insufficient (Layer 2 / gap-genre evidence).
- Anything else → delivery without conversion: the worker engages but cannot lift
  kill-rate — skill-class evidence at the assertion level; notebook alone won't move it.
- **A green (≥45%) is NOT drift here** — the battery's attempt-1-green STOP does not
  apply: the probe manufactures no red (the seed is below bar by measurement, not by
  construction). A green is the strongest P-ACT-UP.
- Secondary read (gap utilization): do new/changed tests reference the named survivor
  functions (mechanical grep of written files).
- Precheck doubles as a drift guard: each row's precheck grade must equal the frozen
  seed baseline, else instrument-stop for that row (never worker feedback).

**Standing rules unchanged:** provider-red rows are casualties re-run within the stop;
truncations excluded from denominators; secrets scrub on the spine; judged stamp;
probe rows enter no battery evidence and no pass row ever folds in a validation run.
Budget exhausted before 4 valid rows → report the rows in hand, no top-up without hamr.
