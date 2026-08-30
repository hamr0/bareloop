# BENCH-PREREG — the two-row bench (DRAFT)

**DRAFT — not frozen; frozen only by hamr's word "freeze", which is the commit that locks
this before any number exists.** Nothing below binds a run yet. This document exists so the
facts, hashes, and decision rules are written down and can be checked BEFORE that commit —
not so a bench can fire today.

Source of every fact below: `docs/product/PRD.md` addendum v1.81 (tail of file),
`docs/product/2026-08-23-agreed-build-list.md` Q1/Q3–Q6 (hamr's answers, verbatim source —
nothing here invents beyond them), `jobs/aurora-u-spawner-types.json`,
`jobs/litectx-u-types.json`, and the archived spine files under `../bareloop-patients/`.
Style follows `docs/product/2026-08-18-readshim-phase2-prereg.md` and
`docs/product/AURORA-PREREG.md` — frozen facts, decision rules, what counts, what does not.

---

## Rows — FROZEN facts

Exactly two rows. Two more join only when hamr raises the $16 ceiling (below).

| job | budgetUsd | maxWallMs | current spec hash |
|---|---|---|---|
| `aurora-u-spawner-types` | 5 | 1,800,000 (30 min) | `c395b716b7afdbe8e3b637fb46eb394773332a367dd30e47f9ee7fc3aecd56a3` |
| `litectx-u-types` | 10 | 2,700,000 (45 min) | `31733829fbba925d81bffb0558c0ff92e1199e7700c58dfa5ed73dffa8979598` |

Both hashes computed directly from the tracked spec files, not copied from memory:

```
node -e "import('./src/job.js').then(({jobSpecHash})=>
  console.log(jobSpecHash(JSON.parse(require('fs').readFileSync('jobs/aurora-u-spawner-types.json','utf8')))))"
=> c395b716b7afdbe8e3b637fb46eb394773332a367dd30e47f9ee7fc3aecd56a3

node -e "import('./src/job.js').then(({jobSpecHash})=>
  console.log(jobSpecHash(JSON.parse(require('fs').readFileSync('jobs/litectx-u-types.json','utf8')))))"
=> 31733829fbba925d81bffb0558c0ff92e1199e7700c58dfa5ed73dffa8979598
```

Per-job cap = the job's own `budgetUsd` (5 + 10 = 15 ≤ 16, the pass ceiling below). A row
freezes the CONFIG, not just the job name — either spec file changing re-hashes it, which
ends that row's comparable series (see Signature, below).

**Two more rows join only when hamr raises the ceiling** (PRD v1.81, Q4): `bareagent-u-types`
(archived median green ≈ $5.34) and `aurora-testgen-l2accept` (archived median green ≈
$6.46). Neither is admitted, priced, or hashed here — naming them is scope, not inclusion.

## Patients — FROZEN facts

| job | patient copy | seed commit (frozen at freeze) |
|---|---|---|
| `aurora-u-spawner-types` | `../bareloop-patients/aurora-u` | `d661e50` |
| `litectx-u-types` | `../bareloop-patients/litectx-u` | `96813a4` |

Both are existing copies (Q1: hamr's answer is to reuse them, never clone fresh); each carries
its own local git history and is a separate copy of the source repo — never the original.
Both trees are currently dirty from past runs (uncommitted edits left over from prior bench-
adjacent work), which is exactly why the reset rule exists:

**Rule — before every bench run, the copy is reset to its frozen seed commit:**

```
git -C ../bareloop-patients/aurora-u reset --hard d661e50 && git -C ../bareloop-patients/aurora-u clean -fdx
git -C ../bareloop-patients/litectx-u reset --hard 96813a4 && git -C ../bareloop-patients/litectx-u clean -fdx
```

This command runs ONLY inside the copy. The seed commit recorded here is the copy's HEAD at
freeze time — if a copy's HEAD has moved by the time this document is frozen, the seed
recorded above is corrected in the freeze commit itself, never silently.

## Money — FROZEN facts

- **$16 per bench pass** — hamr's number (PRD v1.81, Q4). Adjustable ONLY by hamr's explicit
  word recorded in the PRD; the agent may only TIGHTEN this ceiling, never widen it, per
  standing budget doctrine.
- Per-job cap = the job's own `budgetUsd` (aurora $5, litectx $10; 15 ≤ 16).
- A colour-flip re-run pair (below) is a SEPARATE pass with its own $16 — it does not draw
  against the same ceiling as the pass that detected the flip.

## n — FROZEN facts (decision rule)

- **n = 1 run per job per release.**
- A row whose colour FLIPS against the previous release's row (green↔non-green) triggers 2
  more runs of that job (bringing it to n = 3) BEFORE the row is read; the read is the
  majority of the 3.
- **Provider-red / casualty rows are NOT colours.** A provider-red is not a flip signal —
  rerun once, and if the provider-red repeats, treat it as a CONDITION per standing doctrine
  (stop the pass, do not keep paying per row on a coin flip); it is not read as a flip and
  does not by itself trigger the n=3 rule.

## Signature — FROZEN facts

- The set (currently 2 rows) is frozen and pre-greened under ONE signature. Any spec edit to
  either job file re-hashes that row and re-freezes/re-signs the set — the OLD rows under the
  old hash stop being comparable to anything that runs after the edit (a hash change ends a
  row's series; the archive under the old hash is history, not the live bench).
- **Requirement as designed:** each row must have ≥1 archived green AT ITS FROZEN HASH before
  freeze.
- **What the archive actually shows, checked directly against spine files under
  `../bareloop-patients/*-bareloop/`, matched job-start `specHash` to job-end `outcome`:**

  | job | total archived greens (any hash, any date) | greens AT the current frozen hash |
  |---|---|---|
  | `aurora-u-spawner-types` | 11 | **2** (`u-mt7ugedk` $3.0026, `u-mt8yk53k` $1.9983) |
  | `litectx-u-types` | 5 (+1 re-baseline, below) | **1** (`u-mtfywb55` $5.7195, 2026-08-30 — the re-baseline run) |

  The "11 greens" / "5 greens" figures are the job's total archive history across every hash
  it has ever run under (config changed repeatedly — verb-menu widening, close-stage axis
  split, close-path repointing). They are cited because they are the number this document was
  asked to carry forward, but **they are not the number the signature rule needs** — a hash
  change ends a row's series, so a green minted under a retired hash cannot pre-green the
  current one.

- **aurora-u-spawner-types satisfies the requirement as designed:** 2 greens exist at the
  current hash (`c395b716b7af…`), both post-dating the two most recent spec edits (`892439f`,
  `4b1bc27` — the close-path repointing to a stable tree).

- **litectx-u-types does NOT satisfy the requirement as designed — flagged plainly, not
  papered over.** Its current hash (`31733829fbba…`) was minted by `4ae9a3c` ("close-stage
  axis split … six specs re-hashed"), and **no archived run of any outcome exists at that
  hash** — checked with `grep -rl "31733829fbba" ../bareloop-patients/`, zero hits anywhere in
  the patient archive. All 5 archived greens for this job sit under two earlier, now-retired
  hashes (`037fa93719a7…`, `25d8c5eeecc2…`). **This means litectx-u-types is not
  pre-greened at its current spec — freezing this row today would freeze an UNPROVEN
  config.** Closing this gap needs one paid green run at the current hash before the freeze
  commit; that run is the row's own re-baseline, not a bench pass (it establishes the row,
  it does not read it as a bench result).

  **Re-baseline done, 2026-08-30 (hamr's "go"):** run `u-mtfywb55` at hash `31733829fbba…`
  — outcome green, $5.7195 (`spendComplete:true`), 14.6 min of 45, 79 rounds, 1 replan after
  a step-variance escalation. Spine:
  `../bareloop-patients/litectx-u-bareloop/u-mtfywb55.jsonl`. This run ESTABLISHES the row;
  it is not a bench pass and is not written to `docs/logs/BENCH.md`. Both rows now satisfy
  the requirement as designed. Note the spend ($5.72) sits above the archived median ($4.29)
  — one run, not a re-estimate of the median.

## Results ledger — FROZEN facts

- `docs/logs/BENCH.md`, one row per (job, release tag).
- Columns: release, job, spec hash, seed, outcome, spentUsd (+ spendComplete), wallMs, runid,
  n, notes.
- A colour flip ALSO mints a `docs/logs/FINDINGS.md` entry — a flip is a real finding by
  definition, not just a log line.

## Decision rules — FROZEN

- **PASS of the bench:** every row is green, OR every row's colour is UNCHANGED from the
  previous release's reading for that job (a repeat non-green is not a regression if the
  previous release already read non-green there — there is currently no such baseline for
  either row, since this is the first freeze).
- **STOP:** any CONFIRMED flip to non-green (i.e. the majority of the n=3 confirmation runs
  reads non-green) is a release-blocking finding.
- **Provider condition:** a repeating provider-red is reported as a provider condition —
  "pass not readable", never rounded up to green and never counted as a flip.
- **Explicit non-claim:** nothing in this bench is a lift claim. The bench detects
  regressions against the frozen baseline; it does not measure improvement, and a pass is
  never read as evidence the system got better.

## Cost sizing — MEASURED, not guessed

PRD v1.81 records the archive's median green-run cost, per job, computed from the same spine
files audited above (not a proxy, not a step-count estimate):

| job | archived median green spend |
|---|---|
| `aurora-u-spawner-types` | ≈ $2.00 |
| `litectx-u-types` | ≈ $4.29 |
| `bareagent-u-types` (not in this bench) | ≈ $5.34 |
| `aurora-testgen-l2accept` (not in this bench) | ≈ $6.46 |

Expected pass cost for the two frozen rows: **≈ $6.3 median** ($2.00 + $4.29), **≤ $15 cap**
(the sum of the two `budgetUsd` values), inside the **$16 ceiling**. hamr's earlier "$1–3 a
run" guess (`2026-08-23-agreed-build-list.md`, Q3 discussion) is explicitly withdrawn per
v1.81 — the table above is the measurement that replaced it.

## Out of scope

- G2 re-author / re-baseline — a separate step, not this bench.
- The 4-row bench (adding `bareagent-u-types` and `aurora-testgen-l2accept`) — joins only on
  hamr's word to raise the ceiling.
- Any scheduler for when a pass fires (N5) — see Open questions.

## Open questions that do NOT block freezing

- Which release cadence triggers a pass — every tag, or only minor releases? Left for hamr;
  not required to lock this document's frozen facts.

## What was left out as underivable, or found rather than assumed

- **The litectx-u-types pre-green gap** (above) was not stated in the source documents this
  prereg was built from — it was found by matching job-start `specHash` to job-end `outcome`
  across every archived spine file for that job and discovering zero rows at the current
  hash. It is the one fact in this document that contradicts a plain reading of "cite the
  archive counts: … litectx-u-types 5 greens" as if that count satisfied the signature rule.
  It does not, and this document says so rather than rounding the 5 up into a pre-green.
- **Release-cadence trigger** (which tag fires a pass) is explicitly left open above, per the
  task's own instruction — not answered here, not invented.
- Nothing else in the stated facts (rows, patients, money, n, signature requirement text,
  results-ledger columns, decision rules, cost figures) required inference beyond the cited
  sources; where a number needed computing (both spec hashes, the greens-at-hash counts) the
  computation and its exact command/method are shown inline above so it can be re-run.
