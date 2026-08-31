# BENCH-PREREG — the three-row bench (RE-FROZEN 2026-08-30: model pinned; G2 admitted, ceiling $24)

**RE-FROZEN 2026-08-30 (same day as the first freeze): build-list #3 pinned
`"model": "claude-sonnet-5"` into both specs (`0bf1c26`), re-hashing both rows; both were
re-baselined green at the new hashes the same day (below), and this commit re-freezes the
set. The first-freeze hashes (`c395b716…`, `31733829…`) are retired series. Still true:**
Every fact and decision rule below binds every bench pass from here on. Seeds (`d661e50`,
`96813a4`) and both spec hashes were re-computed at freeze time and match. Rules never loosen
post-hoc; a spec edit re-hashes its row and requires a new freeze.

Source of every fact below: `docs/product/PRD.md` addendum v1.81 (tail of file),
`docs/product/2026-08-23-agreed-build-list.md` Q1/Q3–Q6 (hamr's answers, verbatim source —
nothing here invents beyond them), `jobs/aurora-u-spawner-types.json`,
`jobs/litectx-u-types.json`, and the archived spine files under `../bareloop-patients/`.
Style follows `docs/product/2026-08-18-readshim-phase2-prereg.md` and
`docs/product/AURORA-PREREG.md` — frozen facts, decision rules, what counts, what does not.

---

## Rows — FROZEN facts

Exactly three rows — hamr admitted G2 and raised the ceiling to $24 (his "ok", 2026-08-30).
Two more join only when hamr raises the ceiling again (below).

| job | budgetUsd | maxWallMs | current spec hash |
|---|---|---|---|
| `aurora-u-spawner-types` | 5 | 1,800,000 (30 min) | `5d989ae7be3d46f938d551a39a1e08b1d57ff50b32da22a521cbc0e1ab99107e` |
| `litectx-u-types` | 10 | 2,700,000 (45 min) | `42a7c42704fa007b62c1393275ef218cc43cfeebbfc0f4a79750d26eff7f8de0` |
| `aurora-testgen-cold` (G2, negative) | 8 | 2,700,000 (45 min) | `ec25bb112e8604b26f7f77fe766f29d75bfa4111dacf09c6fe1241b050f1f621` |

Both hashes computed directly from the tracked spec files, not copied from memory:

```
node -e "import('./src/job.js').then(({jobSpecHash})=>
  console.log(jobSpecHash(JSON.parse(require('fs').readFileSync('jobs/aurora-u-spawner-types.json','utf8')))))"
=> 5d989ae7be3d46f938d551a39a1e08b1d57ff50b32da22a521cbc0e1ab99107e

node -e "import('./src/job.js').then(({jobSpecHash})=>
  console.log(jobSpecHash(JSON.parse(require('fs').readFileSync('jobs/litectx-u-types.json','utf8')))))"
=> 42a7c42704fa007b62c1393275ef218cc43cfeebbfc0f4a79750d26eff7f8de0

node -e "import('./src/job.js').then(({jobSpecHash})=>
  console.log(jobSpecHash(JSON.parse(require('fs').readFileSync('jobs/aurora-testgen-cold.json','utf8')))))"
=> ec25bb112e8604b26f7f77fe766f29d75bfa4111dacf09c6fe1241b050f1f621
```

Per-job cap = the job's own `budgetUsd` (5 + 10 + 8 = 23 ≤ 24, the pass ceiling below). A row
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
| `aurora-testgen-cold` | `../bareloop-patients/aurora-soar` | `d661e50` |

Both are existing copies (Q1: hamr's answer is to reuse them, never clone fresh); each carries
its own local git history and is a separate copy of the source repo — never the original.
Both trees are currently dirty from past runs (uncommitted edits left over from prior bench-
adjacent work), which is exactly why the reset rule exists:

**Rule — before every bench run, the copy is reset to its frozen seed commit:**

```
git -C ../bareloop-patients/aurora-u reset --hard d661e50 && git -C ../bareloop-patients/aurora-u clean -fdx
git -C ../bareloop-patients/litectx-u reset --hard 96813a4 && git -C ../bareloop-patients/litectx-u clean -fdx
git -C ../bareloop-patients/aurora-soar reset --hard d661e50 && git -C ../bareloop-patients/aurora-soar clean -fdx
```

This command runs ONLY inside the copy. The seed commit recorded here is the copy's HEAD at
freeze time — if a copy's HEAD has moved by the time this document is frozen, the seed
recorded above is corrected in the freeze commit itself, never silently.

## Money — FROZEN facts

- **$24 per bench pass** — hamr's number ($16 at first freeze, raised to $24 with G2's admission,
  2026-08-30). Adjustable ONLY by hamr's explicit
  word recorded in the PRD; the agent may only TIGHTEN this ceiling, never widen it, per
  standing budget doctrine.
- Per-job cap = the job's own `budgetUsd` (aurora $5, litectx $10, testgen-cold $8; 23 ≤ 24).
- A colour-flip re-run pair (below) is a SEPARATE pass with its own $24 — it does not draw
  against the same ceiling as the pass that detected the flip.

## n — FROZEN facts (decision rule)

- **n = 1 run per job per release.**
- **G2's expected colour is NON-GREEN** (`escalated` baseline). For G2 the flip that matters
  is non-green → green; a green read there is never a win, it is the n=3 trigger and, if the
  majority confirms, the release-blocking question (model improved, or the ruler broke).
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
- **Requirement as designed:** each POSITIVE row must have ≥1 archived green AT ITS FROZEN
  HASH before freeze; the NEGATIVE row (G2) must have its baseline colour established by ≥1
  archived run at its frozen hash (a green would disqualify it as a negative row).
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

- **Re-freeze pre-greens (2026-08-30, model pinned):** each row has exactly one green AT ITS
  RE-FROZEN HASH, minted by the model-pin re-baseline runs (hamr's "do the baseline"):
  `aurora-u-spawner-types` — `u-mtg50j39`, $2.3425 (`spendComplete:true`), 8.3 min;
  `litectx-u-types` — `u-mtg5bwfn`, $7.2051 (`spendComplete:true`), 23.9 min. Both banners
  read `claude-sonnet-5 (spec)` — the pinned model demonstrably reached the run. Both runs
  establish rows; neither is a bench pass. litectx's $7.21 is one run, not a new median.
  History below is the FIRST freeze's audit, kept verbatim:

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

- **G2 baseline (2026-08-30):** run `u-mtg6bwa0` at `ec25bb11…` — **escalated** (cap-halt,
  2/2 strikes), $7.0865 (`spendComplete:true`), 29.8 min, grader `killed=6/40 rate=15%
  threshold=45% clean=green form=unit:18,integ:10`. Cold start confirmed; banner
  `claude-sonnet-5 (spec)`. Establishment details and the named config wrinkle (the borrowed
  accept-shape clean-run stage): `docs/product/G2-SCOPING.md`.

## Amendment, 2026-08-31 — the pass trigger is hamr's CHOICE at a release

hamr's word at the v0.17.0 release: a bench pass fires **on his call**, decided per release
from what the features touched — not automatically on every feature bump. The written
guidance stands: model, close-authoring, or validation-gate changes are the ones worth
firing on; a docs-only release can skip. Everything else in this document (rows, caps,
$24 ceiling, n rules, flip rules) is unchanged.

## Amendment, 2026-08-31 — readShim default flip does not touch this bench's condition

`scripts/run-u.mjs`'s `--read-shim` default flipped from A0 (off) to A1 (cap) the same day
(`2811c6d`, hamr's call — PRD v1.82). All three bench rows were established under A0 — the
driver's default at the time, so those runs passed no flag. From this amendment on, EVERY
bench run MUST pass `--read-shim off` explicitly (the G2 re-establish runs of 2026-08-31
already do), so the frozen baselines keep the condition they were established under
regardless of the driver's default. No re-baseline is required and none was paid for by this
flip. A bench run that omits the flag runs A1 and is NOT a bench row.

## Amendment, 2026-08-31 — G2's hash moved twice; the row is PENDING a clean re-establish

Two same-day spec edits re-hashed `aurora-testgen-cold.json` after the table above was
frozen: (1) the cold-close repoint (dropping the vacuous `changed-from-seed` stage —
`docs/product/G2-SCOPING.md`), then (2) the `direction` field landing on every close stage
(`docs/logs/FINDINGS.md` F120; `docs/product/PRD.md` v1.82). Current hash:

```
64ca31c0c987b47320ca8622eb80a516463656a03144bd469a8323bbe12e35db
```

This retires the `ec25bb11…` row above (its establishing run `u-mtg6bwa0` is history, not
the live bench) per the Signature rule already frozen in this document (a spec edit
re-hashes the row and ends its series). The re-establish attempt that followed,
`u-mtgr1qnu`, is **NOT** accepted as G2's new baseline: its `escalated` outcome was rendered
under the close-fix governor's direction defect (F120) — halted for a rate that was rising
toward the bar, not for a genuine stall. A clean re-establish under the fixed governor is
required before this row can be re-frozen; per the Signature rule, that establishing run has
not yet happened at `64ca31c0…`.

**ENDED, 2026-08-31 — CASUALTY, not a baseline:** run `u-mtgx135x` (hash `64ca31c0…`, read
shim pinned `off`, $8 cap) ended `provider-red` — a `truncated:max_tokens` event mapped by
`src/planrun.js:2386` to the provider-red class ("transport, not logic"). It never reached
the close; no verdict was rendered. Per standing doctrine a casualty is not evidence. G2
stays PENDING a clean re-establish at `64ca31c0…`; none has happened yet. Full account:
`docs/product/G2-SCOPING.md`.

## Results ledger — FROZEN facts

- `docs/logs/BENCH.md`, one row per (job, release tag).
- Columns: release, job, spec hash, seed, outcome, spentUsd (+ spendComplete), wallMs, runid,
  n, notes.
- A colour flip ALSO mints a `docs/logs/FINDINGS.md` entry — a flip is a real finding by
  definition, not just a log line.

## Decision rules — FROZEN

- **PASS of the bench:** every POSITIVE row is green (or its colour is UNCHANGED from the
  previous release's reading — a repeat non-green is not a regression if the previous
  release already read non-green there), AND G2's colour is unchanged NON-GREEN. The
  baselines are: aurora green, litectx green, G2 escalated (the establishing runs above).
- **STOP:** any CONFIRMED flip (majority of the n=3 confirmation runs) is release-blocking —
  a positive row to non-green, OR G2 to green. A confirmed G2 green is never celebrated as a
  pass; it is the "model improved or ruler broke" question, answered by a human before any
  release.
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

Expected pass cost for the three frozen rows: **≈ $13.3** ($2.00 + $4.29 medians + $7.09,
G2's one measured run), **≤ $23 cap** (the sum of the three `budgetUsd` values), inside the
**$24 ceiling**. The 2026-08-30 establishing runs actually cost $2.34 + $7.21 + $7.09 =
$16.64 — singles, not medians.
  *Erratum, 2026-08-30 (same day, /code-review finding): summing the full-precision figures
  ($2.3425 + $7.2051 + $7.0865 = $16.6341) rounds to $16.63; the $16.64 above is the sum of
  the already-rounded addends. One cent; the $24 ceiling is unaffected. Noted, not edited.* hamr's earlier "$1–3 a
run" guess (`2026-08-23-agreed-build-list.md`, Q3 discussion) is explicitly withdrawn per
v1.81 — the table above is the measurement that replaced it.

## Out of scope

- G2 re-author / re-baseline — a separate step, not this bench.
- The 4-row bench (adding `bareagent-u-types` and `aurora-testgen-l2accept`) — joins only on
  hamr's word to raise the ceiling.
- Any scheduler for when a pass fires (N5) — see Open questions.

## Open questions that do NOT block freezing

- ~~Which release cadence triggers a pass~~ — **ANSWERED 2026-08-30 (hamr, same day as the
  freeze): "major releases triggers bench."** Recorded verbatim. Reading at 0.x SemVer: the
  version bump that carries the release's breaking/feature line (0.16 → 0.17), not every patch
  tag — hamr confirms or corrects that reading; the words above are his, the reading is not.
- **Who pays / whose key.** The bench is a REPO instrument, not a library feature: it runs on
  hamr's machine, against local patient copies, with `ANTHROPIC_API_KEY` from his environment
  (`pass`). It never runs in CI (paid) and ships nothing to adopters — an adopter of the
  library brings their own key via the environment, exactly as `bareloop.context.md` says
  for every run. No key is ever provided by bareloop.

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
