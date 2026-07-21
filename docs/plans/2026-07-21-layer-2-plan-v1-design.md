# Layer 2 — plan-v1 micro-wheels: design record

2026-07-21 · interview with hamr, decisions LOCKED · status: **POC PASSED (F46) — build
design is next; build not started.** Amend with dated addenda, never rewrite.

> **Addendum 2026-07-21 (same day): POC verdict — PREMISE HOLDS.** The decision-3 POC
> ran on `anthropic-api` (prereg amendments 2026-07-21a–d; clipipe firing 1 was VOID,
> F45, and spawned upstream ask BA-16). Result: 3/3 acting rows cleared the clean wall
> the F39 baseline died at 3/3; two rows hit the exact F39 death mid-run and converted
> it via the check's mechanical gap; kill-rate 3/3 UP (27.5/40/37.5 vs 15 seed, 0 at
> the 45 bar — recorded, not acceptance). $5.24 of $30. Full record: FINDINGS F46.
> **Step 2 of the build order below is GO: design the step schema + plan-v1 validator +
> checks menu properly. The POC harness ships nothing.**

## Role (fixed by measurement — do not relitigate)

Layer 2 is **the semantic converter** (F38/F39): bounded steps whose exits verify
correctness in-run turn a quality ask ("strengthen assertions") into the mechanical
genre the wheel demonstrably converts (counts, named walls). The measured mechanism:
the worker authors tests it can never execute (no `run` verb — the hard line stands),
so its first contact with reality is the close that ends the attempt; every F39 acting
row died at that clean wall. Layer 2's job is to give it a wall it can push on
mid-plan — without ever letting it author the pusher.

**"Notes + self-check succeeds" is the thesis's single untested claim.** This rung
exists to test it.

## Already locked before this interview (anchors, not new doctrine)

- **Shape** (PRD v1.12): PREFLIGHT → SCOUT (read-only, hard-bounded, reserved budget
  slice) → PLAN (`Planner.plan(goal, {info: scoutBlob})`; the planner never sees the
  repo) → plan-v1 VALIDATOR gates before tokens burn (verbs ⊆ spec ceiling, bounds ≤
  shell caps, scopes in fence, arbiter inexpressible at every depth) → EXECUTE (fresh
  Loop + fresh Gate per step; `maxTurns` IS the step bound; flat DAG, strictly
  sequential) → ONE replan per run → the operator's close is the only truth.
- **Feed-forward prompt contract** (v1.12 §5): absolute repo root, gap/close output,
  prior step artifacts labeled by id, cut-off notice; NEVER the budget, the close
  command, the validator, other steps' grants, or the arbiter's books.
- **Inner exits verify FORM, not truth** — progress gates; containment is the outer
  close + the one replan; there is exactly ONE arbiter.
- **Stage verdicts** (v1.13): own eval where one exists, else inherit the parent
  wheel's verdict chain; learning credit mints only at an honest close.
- **Per-step deliverable targets** (v1.18 req 1): each step declares its own target
  path — lands in the step schema at this rung.
- **No `spawn_child`/recursion; config-v1 archives when plan-v1 lands; two docs, two
  validators, NO schema v2** (the job doc and the plan doc never merge).

## Decisions (locked 2026-07-21)

1. **The self-check exit: operator-signed named checks (Q1 = a).** The human-signed
   job spec carries a small menu of NAMED check commands (e.g.
   `clean-run: <cmd>, expect 0`). The plan may REFERENCE a named check as a step's
   inner exit — the closed exit menu gains one form, `check-passes(name)` — but the
   agent can never author, edit, or compose one: a check the spec doesn't sign does
   not exist. The shell executes a referenced check under the full runClose machinery
   (forbidden zone, judged floor, redaction, metered rounds/cost). Same grant model as
   the tool menu: the human authors the list, the agent selects from it; `run` stays
   structurally inexpressible. Exposure note: a check executes worker-authored test
   files — the outer TESTGEN close already does exactly that; what changes is only
   WHEN, not the exposure class.
   **Checks decide nothing and mint nothing.** Passing every check confers zero
   credit; only the one signed close mints green. A check result is a progress gate
   and a gap source, nothing more.
2. **First firing target: job #4 (TESTGEN)** — same job, same close, same frozen 45%
   bar, read against F39's baseline (0 conversion; 3/3 acting rows died at the clean
   wall; 1 stall). SUPERSEDES the 2026-07-14 lock ("first experiment stays job #1"),
   which predates F34 (job #1 undiscriminating), F38, and F39.
3. **POC-first, aimed at the thesis, not the machinery.** "Can the model emit a valid
   DAG" was proven shot-1 in the config-v1 era and is not the risk. The riskiest
   assumption is F39's fix direction itself: does an in-run clean-run check convert
   the clean-wall death? POC: hand-authored plan (no Planner, no validator —
   throwaway harness, never shipped), one WRITE step whose inner loop feeds the
   clean-run result back as a gap, on job #4. Read: clean-wall deaths among acting
   rows vs F39's 3/3 baseline. If the premise doesn't move, the rung's design is
   wrong and we learn it for a few dollars before building the schema. POC read
   rules freeze in a commit BEFORE any number exists (standing discipline).
4. **Money: one wallet per run (Q4).** One `budgetUsd` (operator-signed,
   cap-not-estimate), ONE ledger metering per round across all gates (F12). Steps get
   ROUND bounds only — planner proposes, validator enforces ≤ shell caps. The scout's
   reserved slice is carved first (v1.12). No per-step money slices; money binding
   mid-plan stops the run — the stop is the checkpoint (resume-to-cap). Sizing rule
   rides along (F39/16g, twice-paid): the budget must fund the attempts PLUS every
   check execution PLUS the close, or the instrument eats the experiment.
5. **The spec shape fits ALL verdict classes from day one (hamr).** The job spec's
   surface is four explicit, separate, never-inferred fields:
   - **goal** (text)
   - **verdictType** — declared, radio-style: `green` | `soft-green` | `hitl`
   - **close** — the command, for green (exit code = truth)
   - **checks[]** — the named quick-check menu (decision 1)
   v1 ADMITS ONLY `green`: declaring soft-green/hitl gets a clear
   "not at this rung" red, never silent acceptance (disclosure ≠ admission —
   locked-but-listed, same as the tool menu). PREFLIGHT flips from inferring the
   job's class to VALIDATING the declaration: declared green + no runnable
   deterministic close = named validation red before any token burns. The non-code
   rung later fills a declared slot instead of reshaping the schema. All four fields
   live in the human-signed doc; the plan doc can express none of them.

## Addendum 2026-07-21 — build-design interview (schema-level decisions, LOCKED)

Second interview of the rung (step 2 of the build order). Four decisions, all locked:

6. **Job shape: exclusive shapes inside job-v1, staged sunset (hamr).** job-v1 gains
   `goal` / `verdictType` / `checks[]`. A spec declares EITHER the four-field plan shape
   (goal + verdictType + close + checks[]) OR the legacy operator-authored `steps[]`
   chain — both present is a named red; existing job specs keep validating unchanged
   DURING the rung only. **`steps[]` is co-existing scaffolding, not a permanent second
   shape: the day the Layer 2 path closes green end-to-end (the rung's battery),
   `steps[]` archives alongside config-v1** (the same "not before: the suite still runs
   through it today" precedent, PRD v1.12) — hamr: "co-exist until the new proves
   itself then sunset, i don't need multiple shapes that won't get used." The non-code
   rung later fills the declared `verdictType` slot without reshaping the schema
   (decision 5's intent).
7. **Plan step schema: ordered array, NO `dependsOn`.** v1 is strictly sequential, so
   array order IS the execution order; `dependsOn` would be a live-looking knob with
   zero effect (the F16/inert-op class the config validator itself reds). Step fields:
   `id` (kebab slug, unique) · `action` (task text) · `tools` (⊆ the spec grant) ·
   `rounds` (≤ shell cap) · `target` (v1.18 deliverable path, inside the fence;
   required on write-class steps) · `exit` (decision 8).
8. **Exit composition: AND-only array, max 2.** `exit: [tree-changed(scope),
   check-passes(name)]` — ALL listed exits must pass; no OR, no NOT (disjunction would
   let a weak arm launder the exit). This makes the POC's winning composition
   expressible and closes the F17 already-green trap a lone `check-passes` on a WRITE
   step would re-open (the seed tree is green). The plan-as-executed spine record
   states the real exit — nothing hardwired in shell code.
9. **Red taxonomy: reuse the shipped vocabulary + 3 plan-specific codes.** Same
   `{code, path, detail}` shape; `unknown-field`/`invalid-value`/`bounds`/
   `scope-escape`/etc. reused as-is; new codes `verb-escape` (step tools beyond the
   spec ceiling — distinct from `request-red`: the ceiling exists, the plan
   overreached), `exit-illegal` (exit not in the closed menu, or an illegal
   composition), `check-unknown` (`check-passes` names a check the spec never signed).
   The ledger keys on codes (the request-red precedent), so each class it should count
   separately gets its own code.

**Stated default (flag to change): a check's schema reuses the predicate-close shape** —
`{name, cmd, expect, judged?, gapKeep?}` — validated by the same rules and executed
under the same `runClose` machinery (decision 1 already requires the machinery; a
second command shape would be the F9 two-transforms class one level up).

## Build order within the rung

1. **POC** (decision 3) — throwaway; freezes its read rules first; answers "does the
   premise hold" on job #4.
2. Premise holds → design the step schema + plan-v1 validator properly (POC-first
   rule: never ship the POC); premise fails → STOP, the stop is the result, findings
   entry, redesign with hamr.
3. Build carries: per-step targets (v1.18), spine events (plan-as-executed + per-step
   ledger), config-v1 archived on landing.

## Riding items (owned by this rung, not part of the POC)

- **Layer R default-flip read** (LAYERS.md ⚠): the first Layer 2 job that records
  `root-injected` runs the pre-registered ON-vs-OFF acceptance read; that result
  flips `layerRoot` to `true` or keeps `false`.
- **F38's designed test** becomes runnable the day the rung lands: same job #4, same
  close, same frozen bar — the direct falsification of "notes + self-check succeeds".

## Deferred, explicitly NOT this rung

- Soft-green/hitl execution (non-code rung; declared-but-locked here).
- Genre-aware artifact extraction (v1.18 req 2 — non-code rung).
- Fan-out / parallel DAG execution (v1.12: strictly sequential in v1).
- N3 inheritance of minted plans (Layer 3; this rung only writes plan-as-executed to
  the spine).
