# Aurora battery (job #3) — pre-registration (FROZEN 2026-07-16)

**Status: FROZEN** — enumeration and per-plant verification by agent; decision rules
approved by hamr in-chat 2026-07-16 ("cont from here and cont with the next test,
approved", given against the verbatim freeze proposal) and transcribed below before any
battery number exists. Same anti-fit-to-pass discipline
as `BATTERY-PREREG.md`: every site and its evidence is recorded before any rule exists, so
no plant is ever selected to make a rule pass. Direction set by hamr in-session
("harder patient — copy aurora, inspect soar for bugs"; battery composition
"choose something" delegated after the F33 saturation verdict).

---

## Patient

- **Repo:** `aurora` (hamr's own, local archive) → analysis copy at
  `~/PycharmProjects/bareloop-patients/aurora-soar` via local `git clone` (never the
  working repo, never a network clone).
- **Frozen commit:** `d661e50` ("chore: default-deny dot-dir gitignore…").
- **Environment:** repo-local `.venv` (Python 3.14.6), all 11 workspace packages
  installed editable in Makefile order. `.venv`/`__pycache__` are git-ignored; the tree
  stays clean through test runs (verified).
- **Close:** `.venv/bin/python -m pytest packages -p no:cacheprovider --no-cov -q -m
  "not slow and not ml and not real_api"` — **2,691 passed, 3 skipped, green at HEAD,
  deterministic (3× stable), ~6.5 min per run.** The 3 skips are annotated "MemoryStore
  has known bug" in aurora itself (real acknowledged bugs, excluded from the close's
  judgment since they never run).
- **Close latency is a feature, not a bug:** at ~6.5 min/close, a thrashing worker pays
  real wall-clock for every wasted swing — production-like pressure mailproof's 25s close
  never applied. (Money cost of the close is zero — local compute.)
- Candidate judged floor for the job spec: pattern `(\d+) passed`, min **2600** (a legit
  single-plant red still passes ≥2600; a collection crash matches nothing → judged red).
  Candidate `gapKeep`: `^FAILED ` (pytest names failing tests on FAILED lines).
  writeScope must enumerate `packages/<pkg>/src/**` prefixes — a bare `packages/**` would
  let the worker edit tests.

## Method (mechanical, mailproof-compatible)

1. One instrumented full-suite run with per-test coverage contexts
   (`--cov-context=test`) → for every source file, the set of test FILES that execute it.
2. Legality rule carried over frozen from `JOB2-PREREG.md`: a plant site is legal iff no
   covering/failing test file name-maps to the culprit file; verified per plant by the
   probe (apply the one-line edit alone → run → record every failing test verbatim →
   attribute → revert). Explosion rule carried over: >15 fails rejects the plant.
3. Every accepted plant additionally verified against the FULL close (complete failing
   set, not just the covering files). **Full-close verification COMPLETE for all 4:**
   each plant reds exactly its probe set and nothing else (A1: 1 fail / 2,690 pass;
   A2: 1 fail; A3: 1 fail; A4: 2 fails), no explosion, tree clean after every revert.
   A red-run close takes ~4.5 min. Side benefit of the verification harness: A2's first
   anchor attempt matched TWICE (the sequential path duplicates the preceding lines) and
   the exactly-once assert refused to plant — the drift discipline works; the recorded
   anchor below is the corrected 5-line form.

## Accepted plants (probe-verified; full-close failing sets pending completion)

### A1 — `packages/soar/src/aurora_soar/discovery_adapter.py:89` — the role→name mapping
- **Edit:** `name=discovery_agent.role,` → `name=discovery_agent.id,`
- **Contract (docstring, verbatim):** *"role -> name (role becomes the agent name)"*.
- **Probe:** exactly-once anchor; fails **1** test:
  `packages/soar/tests/test_agent_registry_deprecation.py::TestAgentRegistryDeprecation::test_registry_and_discovery_equivalent_results`
- **Name-map:** failing file maps to `agent_registry.py`, NOT the culprit. The symptom
  says "registry/discovery equivalence broke"; the obvious suspect is `agent_registry.py`.
- **Predicted difficulty: easy–medium.** The failing test imports `convert_agent_info`
  from the culprit module directly — one navigation hop once the test file is read.

### A2 — `packages/soar/src/aurora_soar/phases/collect.py:634` — the parallel failure guard
- **Edit:** `if spawn_result.success:` → `if spawn_result is not None:` (parallel site
  only). **Anchor (exactly-once verified — shorter anchors match the sequential path
  too):** the 5-line block `agent = agent_map[idx]` / blank / `duration_ms = int(...)` /
  blank / `if spawn_result.success:`.
- **Contract (comment at the else, verbatim):** *"Handle partial failures gracefully"*.
- **Probe:** fails **1** test, in a DIFFERENT package:
  `packages/cli/tests/test_commands/test_soar_parallel.py::TestSoarParallelResearch::test_parallel_execution_handles_failures_gracefully`
- **Name-map:** `test_soar_parallel.py` does not map to `collect.py`. Cross-package
  symptom (cli) vs culprit (soar) — the only cross-package cell in the battery.
- **Predicted difficulty: medium.** The failing test imports `_execute_parallel_subgoals`
  from the culprit module; the culprit file is 1,050 lines and the same guard exists
  twice (parallel + sequential) — the worker must fix the RIGHT copy (an `edit` with an
  ambiguous anchor gets a multi-match refusal).

### A3 — `packages/cli/src/aurora_cli/planning/core.py:600` — the already-archived guard
- **Edit:** `if plan.status == PlanStatus.ARCHIVED:` → `if plan.status ==
  PlanStatus.ARCHIVED and _force:` (exactly-once; reads like a plausible force-bypass)
- **Contract (comment, verbatim):** *"Check if already archived"*.
- **Probe:** fails **1** test:
  `packages/cli/tests/unit/test_plan_commands.py::TestArchivePlan::test_archive_already_archived`
- **Name-map:** `test_plan_commands.py` does not map to `core.py`. Decoys en route: a
  sibling `commands/` module named for archiving, and a DUPLICATED `aurora_planning`
  package carrying parallel parser code (though not the archive messages — verified).
- **Predicted difficulty: medium.** Direct import in the test file, but the culprit file
  is 2,233 lines and shares its name with nothing the failing test says.

### A4 — `packages/cli/src/aurora_cli/planning/core.py:497` — the wrong-location hint
- **Edit:** `if other_matches:` → `if not other_matches:` (exactly-once)
- **Contract (code intent):** when a plan id exists in the OTHER location (archive vs
  active), tell the user which flag to use; the inversion shows the hint exactly when
  it is false.
- **Probe:** fails **2** tests, same file:
  `test_plan_commands.py::TestShowPlan::test_show_plan_not_found` and
  `::TestShowPlan::test_show_wrong_location_hint`
- **Name-map:** clean (as A3). **A3/A4 form ONE within-file replication cell** (same
  culprit file, same failing test file, adjacent difficulty band) — analysis treats them
  as one difficulty sample with n=2, mirroring mailproof's P2/P3/P4 rule.
- **Predicted difficulty: medium** (as A3; different function — `show_plan` vs
  `archive_plan`).

## Rejected candidates (kept legible — every green probe is recorded)

| id | site | edit | why rejected |
|---|---|---|---|
| R-models-case | `agent_discovery/models.py:175` | drop `.lower()` from category normalization | **greens the full covering set** — every fixture uses lowercase categories |
| R-models-alias | `models.py:193` | bypass the alias map (`dev`→ENG etc.) | **greens** — no fixture uses an alias |
| R-models-strlist | `models.py:221` | single-string skills → `[]` | **greens** — no fixture passes a single-string list field |
| R-bm25-boundary | `commands/memory.py:1871` | `>= 0.5` → `> 0.5` (strong-overlap boundary) | **greens** — no test hits the exact-50% boundary |
| R-schema-version | `core/store/schema.py:165` | `INSERT OR REPLACE` → `INSERT` | **greens** — no covering test re-initializes a database |
| R-modelutils-path | `context-code/semantic/model_utils.py:180` | `replace("/", "--")` → `replace("/", "-")` | **greens** — covering tests exercise only the no-ML path, never the cache path |
| (site family) | `commands/memory.py` explanation helpers | — | covered lines are click decorators + helpers whose tests import the culprit module directly by name (`from aurora_cli.commands.memory import _explain_bm25_score`) — no misdirection value beyond A1's level, and the only probe-able boundary greened |
| (site family) | `core/store/connection_pool.py` | — | covered lines are pool-clearing/singleton — plants are either invisible (perf/leak class) or explosion class |

## What this patient can and cannot yield (honest limits — read before freezing rules)

- **The P7-analog layered seam did NOT survive probing.** The one structural candidate
  (embedding tests import `embedding_provider`, which internally uses `model_utils`) has
  its behavioral branches unexercised — the plant greened. In every ACCEPTED plant, the
  covering test imports the culprit module directly: a worker whose first move is "read
  the failing test file" finds the culprit's name in an import line. Aurora's tested
  regions contain **zero** seams where an architectural layer stands between the test and
  the culprit.
- **The difficulty axes this patient actually offers:** repo scale (281 source files,
  34× mailproof's search space; grep/recall noise is real), file scale (1,050- and
  2,233-line culprits — finding the LINE is work even when the file is known), close
  latency (6.5 min/close — thrash costs real wall-clock), a same-line decoy (A2's guard
  exists twice; anchor discipline is tested), and a new close genre (pytest, first
  non-TAP patient). NOT deep causal misdirection.
- **The hard tier aurora actually contains is unusable by construction:** the SOAR
  orchestrator (2,455 lines, the P7-pattern jackpot — it precomputes everything the
  phases consume) is executed by NOTHING in the repo's suite (6% line coverage =
  imports). Same for `record.py`'s logic, `collect.py`'s non-parallel orchestration, and
  `retrieve.py`'s error paths. A plant there greens the close. **This is the benchmark
  paradox, now measured in a second repo: a bug a test can see is a bug whose home the
  test names or imports; a bug nobody sees cannot gate a benchmark.** The escaped-bug
  middle (visible symptom, obscured cause) exists only where a tested architectural seam
  hides the culprit — mailproof had exactly one (P7); aurora's tested regions have none.
- **Supply:** 4 verified plants across 3 files / 3 packages (one cross-package cell, one
  within-file replication cell). No hard-tier row. If the loop tier fails to appear here
  too, the next lever is close latency + scale, not plant depth.

## Aurora-owner findings (not battery material — real, for hamr)

1. **`orchestrator.py` (2,455 lines, SOAR's spine) is tested by nothing, in any
   package.** A real bug there ships silently.
2. Three core tests are SKIPPED with the literal annotation "MemoryStore has known
   bug(s)" (`access_history` / activation dict initialization) — acknowledged real bugs
   in the tree.
3. `aurora_cli.planning` and `aurora_planning` carry duplicated parser code (two
   `parsers/markdown.py`, two `parsers/requirements.py`) — drift risk, and it confused
   even the coverage attribution here until disambiguated.

---

## Pre-freeze instrument audit (2026-07-16, token-free — run BEFORE the rules below)

The freeze proposal's retrieval condition rested on F33's mechanism story ("litectx's
recency boost ranks the freshly-planted chunk into the hook's hits"). Audited against
litectx source before freezing: **the recency boost does not exist.** Recall ranking is
BM25 + 1-hop import-spreading only; gitsig is "grounding, never scored"; chunk
localization is term overlap. Measured on the mailproof patient (probe, three
conditions, same job-query recall):

| condition | top-8 code hits |
|---|---|
| clean repo, incremental index | identical set, culprit chunk at rank 7 |
| P5 planted, incremental index | identical (culprit score 0.7780→0.7782, rank unchanged) |
| P5 planted, FRESH index | identical |

So: the plant never moved the ranking; P5's pre-round-1 culprit delivery (F33) was the
generic job query's plain BM25/spread relevance — a per-plant lottery that exists on the
CLEAN repo too, not a harness-manufactured recency assist. A fresh index is a ranking
NO-OP. Full correction recorded as F35.

**Aurora pre-read (recorded before any run, prediction not post-hoc):** fresh index
(3.2s), job-query recall on the clean patient — **zero culprit chunks in the top-20**
(the top-8 the hook would hand the worker is generic CLI noise: init_helpers, errors,
init, memory display). Per the invariance above, this one clean-repo read predicts every
run: on this patient the hook recall provides NO aim assist for any plant, fresh index
or not. The find must come from the gap's failing-test names.

## Decision rules — FROZEN by hamr 2026-07-16

- **Composition & order:** A1 → A2 → A3 → A4, all four; A3+A4 read as ONE
  within-file replication cell (one difficulty sample, n=2).
- **Per plant:** $3.00 budget (`budgetUsd` — advertised == enforced), 3 attempts
  (`capRuns` default), worker model `claude-sonnet-5`, tool menu
  `read/grep/write/edit/recall/get` (the pass-2 menu; `run` stays locked).
- **Battery hard stop:** $10 cumulative (frozen; the stop is a result).
- **Fresh litectx index per run:** the runner deletes the patient's `.litectx` before
  each run; `runJob`'s own `lc.index()` rebuilds (3.2s measured). Rationale as
  corrected by the audit above: NOT an aim-assist kill (there is none to kill) — it
  wipes the written-memory store so no `remember`→`recall` channel carries answers
  across runs (row independence; F33's key-collision made this ~true by accident, this
  makes it true by construction) and each run's `recall_log` starts clean for forensics.
- **Close (arbiter-owned, quote-inexpressibility carrier):** job-v1 `close.cmd` splits
  on whitespace with no shell, so the `-m` marker expression cannot ride inline. The
  spec's `cmd` is the absolute path of an operator-owned wrapper script OUTSIDE the
  patient tree (`../aurora-soar-bareloop/close.sh`, alongside the spines) carrying the
  frozen invocation verbatim:
  `.venv/bin/python -m pytest packages -p no:cacheprovider --no-cov -q -m "not slow and
  not ml and not real_api"`. The worker's readScope is the workdir — it can never read
  or edit the wrapper.
- **Judged floor:** pattern `(\d+) passed[^\n]* in [0-9.]+s`, min **2600**. The
  prereg's candidate `(\d+) passed` is first-match and could read a stray "N passed"
  inside a failing test's captured output (aurora's `testing` package runs pytest in
  subprocesses); requiring the same-line ` in <seconds>s` tail pins it to pytest's final
  summary line on both bands ("2691 passed, 3 skipped in 390s" green; "1 failed, 2690
  passed, 3 skipped in 274s" red). Residual risk (a failing test whose captured output
  embeds a full nested pytest summary line) routes as `crashed` → F32 worker-crash, a
  non-terminal — noted, accepted.
- **gapKeep:** `^FAILED ` (pytest names failing tests on FAILED lines; the close names
  tests, never the culprit file).
- **closeTimeoutMs:** 900,000 (15 min) — shell territory; the green close runs ~6.5
  min, a red ~4.5 min; the 120s default would kill every close.
- **writeScope:** all 11 `packages/<pkg>/src/**` prefixes, enumerated (cli,
  context-code, context-doc, core, implement, lsp, planning, reasoning, soar, spawner,
  testing) — tests are unwritable.
- **Stop rules (carried from BATTERY-PREREG):** per-plant sanity close must reproduce
  the prereg's recorded failing set exactly — drift = STOP; autopsy-before-label on any
  cap-red; a validation rerun is never a battery row; frozen rules are never loosened
  post-hoc.
- **Tier rules (carried):** attempt-1 green = easy; attempt-2/3 green = loop tier (THE
  thesis); cap-red = ratchet-grade candidate; all single-pass labels provisional at n=1.
- **Pass = green only:** worker fixes source through gated verbs and the FULL close
  exits 0 above the judged floor. `already-green` is never `green`.
- **Amendment 2026-07-16a (after A1, before any A2 number — instrument fix, not a rule
  change):** the first battery launch STOPPED at A2's sanity with the close killed at
  the 15-min clock. Autopsy (frozen drift rule honored — investigated before further
  spend): the A2 plant was innocent; the expected failing test fails correctly in 0.16s.
  The hang is `aur init`'s memory-indexing step doing an online HuggingFace
  model-freshness check with NO timeout inside an UNMARKED integration test
  (`test_init_tool_selection.py` — `-m "not ml"` does not deselect it); when the hub
  edge stops answering (huggingface.co itself was 200/0.12s; a deeper hub/CDN call
  accepted TLS and never sent headers, faulthandler-verified), the whole close hangs.
  Measured: online >15 min, `HF_HUB_OFFLINE=1` 12.8s, model locally cached. Two fixes,
  both operator-territory: (1) `close.sh` exports `HF_HUB_OFFLINE=1` — the close's
  determinism must not depend on a third party's uptime; the cached model is the frozen
  dependency; (2) the runner's sanity instrument now labels a clock-kill
  `sanity-timeout`, never `sanity-drift` (a killed close renders no failing set — the
  first launch conflated the two). A1's green (judged by the pre-amendment close while
  the hub was answering) stands: the env flag cannot change any test's verdict, only
  remove the network wait. The battery resumes `--only A2,A3,A4` under the amended
  close after a green-band revalidation. Aurora-owner finding: an integration test that
  phones home with no timeout is a CI outage waiting to happen.
- **Pre-registered reads (before any number):** (1) the F32 delivery/conversion split
  on any multi-attempt row — did the gap reach the worker, and did the worker act on
  it; (2) the close-exploitation audit on every green (judged floor, write locations,
  no test edits), where finding nothing is itself checked; (3) if all four plants green
  attempt-1 UNDER the measured no-assist condition, the conclusion is that the loop
  tier does not exist at planted-bug difficulty on this patient class — a result, not a
  failure of the battery.

---

- **Amendment 2026-07-19 (post-battery; instrument fix, no rule loosened — F40):** the
  frozen close's judged pattern counted tests **PASSED**, not tests **EXECUTED**
  (`(\d+) passed[^\n]* in [0-9.]+s`, min 2600, recorded above in "Decision rules"). That
  conflates *"did the close render judgment?"* with *"did the tests pass?"* — and this job
  is only ever pointed at a RED tree. A bug failing more than ~91 tests drops the passed
  count below 2600, so `runClose` returns `crashed`, and at the **precheck** (structurally
  pre-worker) that routes `close-crashed` → `step-red` before the worker it hired is ever
  started. The job that exists to fix a red suite refuses to run *because* the suite is
  red, and it presents as broken equipment rather than a spec defect. Found by branch
  review, not by a run.
  **Why no pattern edit could fix it, and what changed instead.** The frozen invocation
  used `-q`, and quiet mode prints NO executed-count line at all — only
  `120 failed, 2580 passed in 45.3s`, whose executed count is a SUM that one capture group
  cannot express (and the schema now reds patterns with more than one group, F40). So the
  operator-owned wrapper changed: **`-q` → `-ra`**. Dropping `-q` restores the collection
  line; `-ra` is REQUIRED, not cosmetic — without it the short-summary section disappears
  and this job's `gapKeep "^FAILED "` loses every line it carries to the worker. New
  judged pattern: **`collected (\d+) items`**, floor **2600 unchanged**. The wrapper stays
  outside the patient tree and outside the worker's readScope; `HF_HUB_OFFLINE=1` (amendment
  2026-07-16a) is untouched.
  **Measured against the REAL instrument, because the first proposal was refuted by it.**
  A candidate `^collected (\d+) items`, verified only against a hand-authored 3-test
  directory, is WRONG on this suite two ways: the real line is
  `collecting ... collected 2712 items / 18 deselected / 2694 selected`, so the `^` anchor
  never matches (the line opens with the progress prefix), and the `-m` marker expression
  adds a deselection clause the toy fixture could not produce. A fixture cannot validate a
  check; only the instrument can. Full-close measurement (green band, 175s):
  collected 2712 / 18 deselected / 2694 selected, 2691 passed, 3 skipped.
  **The nested-subprocess hazard (raised above for the passed-count pattern) does not
  transfer.** aurora's `testing` package runs pytest in subprocesses, so captured output
  can embed a nested summary — which is why the old pattern needed its ` in <seconds>s`
  tail. Measured on a full green close: **exactly ONE line in the entire output matches
  `collected`** (line 8), the parent's own. Structurally it cannot lose even on the red
  band: `exec` returns the FIRST match, and the parent emits its collection line before any
  test — and therefore before any nested output — exists. Residual risk (a red-band run was
  not measured) is bounded by that ordering, and a genuine collection failure still reads
  `crashed`, which is the fake-green case the floor exists for.
  **Standing on prior results:** the clean tree reports 2691 passed, above the 2600 floor,
  so the pre-amendment pattern only misfired past ~91 failures. Job #3's recorded 4/4
  attempt-1 greens were judged correctly and stand unchanged.
  **Durability note (not a rule):** `bareloop-patients` is not a git repo, so this
  amendment is the only versioned record of the wrapper's contents. A patient rebuild that
  restores `close.sh` from anywhere else silently reinstates the precheck defect — re-apply
  `-ra` from here.
