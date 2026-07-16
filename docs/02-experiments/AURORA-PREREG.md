# Aurora battery (job #3) — pre-registration (DRAFT 2026-07-16, sites + evidence; decision rules FROZEN only by the operator)

**Status: DRAFT** — enumeration and per-plant verification by agent; the decision rules
section at the bottom stays EMPTY until hamr freezes it. Same anti-fit-to-pass discipline
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

## Decision rules — EMPTY until the operator freezes them

(Composition, order, caps, attempts, model, tier rules, reading rules — hamr's
signature. The agent does not propose values here; precedent lives in
`BATTERY-PREREG.md`.)
