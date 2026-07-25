# Job #5 — TYPES: pre-registration (FROZEN)

**Status:** FROZEN 2026-07-25, before any model token is spent on this job.
**Rung:** second-genre e2e (PRD v1.26). Not a memory experiment — a PRODUCT test.
**Authorisation:** hamr, 2026-07-25: *"go, provided that this is a hard one"*. Hardness is
therefore a FROZEN ADMISSION REQUIREMENT (§6), not a hope; an arm that fails it is
DISCARDED, and the discard is reported as the result.

---

## 1. The question this job exists to answer

Every experiment in this programme — F51–F55 — **and the entirety of Layer 2's acceptance
(F47)** ran on ONE job genre: TESTGEN (write pytest tests to kill mutants) on one patient
family. Nine of ten specs in `jobs/` are `aurora-testgen-*`. The product claim — *"Automate
this job — I don't know the best workflow"*, the agent authors its own workflow — is
**demonstrated on one genre only**.

Three things this job answers, in priority order:

- **(a) PRIMARY — can the agent author a complete, workable workflow for a job that is not
  TESTGEN?** This is the product claim, on new ground.
- **(b) SECONDARY — is "the planner is at ceiling" (F51–F54) general, or genre-specific?**
  If the ceiling does not hold here, every F51–F55 conclusion narrows further.
- **(c) CONDITIONAL — if (b) shows headroom, the Layer 3 inheritance question REOPENS with a
  second genre to test it on.** Layer 3 stays PARKED either way until (b) reads.

**Out of scope, stated so it cannot be quietly claimed later:** this job does NOT re-test
inheritance, does NOT run an ON/OFF lineage arm, and does NOT close the F55 plan-leverage
limit. It is a single-genre capability read.

---

## 2. Genre and why the two shelf specs were rejected

**Chosen genre: TYPE-TIGHTENING MIGRATION.** Take a shipped JS+JSDoc library from its
current strictness to full `tsc --strict`, without weakening the type system and without
changing behaviour.

Why this and not the two unused specs already in `jobs/`:

- `aurora-fix.json` and `litectx-maintainer.json` are both **legacy `steps[]`** specs (no
  `goal`/`verdictType`/`checks[]`); neither can run the plan-v1 flow without a rewrite, and
  `litectx-maintainer` additionally carries a `hitl` step plan-v1 does not admit.
- More decisively, both are the **"make a red suite green" bug-fix genre** — jobs #1/#2/#3.
  That genre is **SATURATED**: F33 (7/7) and F36 (4/4) went attempt-1 green with zero
  loop-tier rows, and F34 explains the mechanism (a planted bug covered by an importing test
  needs no loop). A one-step attempt-1 green would satisfy "second genre" on a technicality
  while leaving the workflow-authoring claim untested.

Why TYPE-TIGHTENING is a genuine second genre:

| axis | TESTGEN (job #4) | TYPES (job #5) |
|---|---|---|
| artifact written | new test files | edits across existing source |
| oracle | mutation kill-rate (owned threshold) | compiler exit code (external, unowned) |
| failure mode | weak assertions | wrong/insufficient types |
| second gate | — | the suite must STAY green |
| writeScope | a fresh dir (`tests/testgen/**`) | the library's own `src/**` |

The oracle property matters: job #4's bar (45%) was **manufactured and owned** by this repo
(F34). `tsc --strict` exit 0 is a **third-party, binary, un-negotiable** oracle. Nothing here
is tuned to produce a gradient.

---

## 3. Patient (frozen)

- **Repo:** `/home/hamr/PycharmProjects/bareloop-patients/litectx-types`
- **Provenance:** local copy of `~/PycharmProjects/litectx` @ `cb70f26` (v0.30.0). Copied
  locally, never cloned from the internet (frozen patient rule).
- **Seed commit:** `master` branch, `ca1af8a` *"seed: litectx v0.30.0 + @types/better-sqlite3
  (dev)"*. The devDep was added by the OPERATOR before freezing so that `TS7016`
  (better-sqlite3 has no declaration file) is not an unwinnable error inside the patient; it
  is setup, not assistance.
- **Seed state, MEASURED 2026-07-25 (all $0):**
  - `npx tsc --noEmit` (shipped strictness: `checkJs` + `strictNullChecks`) → **0 errors**.
  - `npx tsc --noEmit --strict` → **63 errors across 10 files**.
  - `npm test` → **410 tests, 409 pass, 0 fail, 1 skipped**, ~56s.
  - `npm run build:types` → exit 0.
- **Seed error distribution (frozen record):** `chunker.js` 30 · `store.js` 10 · `edges.js` 8
  · `tsalias.js` 3 · `index.js` 3 · `impact.js` 3 · `assemble.js` 3 · `docparse.js` 2 ·
  `langdef.js` 1 · `indexer.js` 1.
  By code: TS7006 ×47 · TS7053 ×4 · TS2339 ×4 · TS7034 ×2 · TS7005 ×2 · TS7023 ×1 ·
  TS7022 ×1 · TS2551 ×1 · TS2345 ×1.
- **Why litectx and not mailproof:** mailproof-job2 under `--strict` yields **1 error**. No
  surface, no job. Measured, not assumed.

### 3.1 Patient disclosure (stated, not hidden)

litectx is **this operator's own library** and is also **bareloop's search engine**. Two
consequences, recorded up front:

1. The worker model may have latent familiarity with litectx's shape. This cuts AGAINST the
   hardness claim, never for it — it can only make the job easier than a neutral patient.
2. The patient copy is INERT: nothing in the run consumes `litectx-types` as a search engine.
   The `.litectx` index inside the copy is stale seed data and is `fs.deny`-ed (§5.3).

---

## 4. Winnability proof (OPERATOR, $0, completed BEFORE freezing)

The riskiest assumption for this job is **"is it winnable at all"** — an unwinnable job burns
a battery and returns an unreadable stop. Proven by hand, not asserted:

- Branch `winnability-proof` in the patient takes the seed from **63 → 0** strict errors.
- `npm test` after: **410 tests, 409 pass, 0 fail** — behaviour preserved.
- `npm run build:types` under `--strict`: exit 0.
- Pattern audit: `@ts-ignore` 2→2, `@ts-expect-error` 0→0, `@ts-nocheck` 0→0, brace-`any`
  20→20. **Zero suppressions and zero new `any` were needed.** The job is winnable *within*
  the D1 fence, not merely winnable.
- Diff size: 10 files, +146 / −17.

### 4.1 Difficulty record from the proof (the hardness evidence)

The operator's own solve path, measured round by round:

| round | action | errors after |
|---|---|---|
| 0 | seed | 63 |
| 1 | annotate `edges.js` + `tsalias.js` helpers | 54 |
| 2 | wire `SyntaxNode` typedef through `chunker.js` | 39 |
| 3 | null-guard the cascade round 2 created | 24 |
| 4 | `Record<string,string>` on 4 lookup tables + tsalias narrowing | 18 |
| 5 | `RecallFilter` typedef + remaining annotations | 3 |
| 6 | fix the cascade round 5 created | **0** |

**Three separate cascades were observed — a correct fix CREATED new errors elsewhere:**

1. Annotating `parseJsonLoose` → `unknown` produced a NEW `TS2339` at `tsalias.js:38`.
2. Typing `chunker.js` nodes as `SyntaxNode` cleared 15 implicit-any errors and produced
   **13 new `TS18047` null-safety errors**, because a correctly-typed `namedChild()` returns
   `SyntaxNode | null`. Rounds 2→3 are entirely this.
3. Typing `tokOf`'s parameter produced `TS18048`; hoisting `RecallFilter` into a class body
   produced `TS2694` (a typedef inside a class is not module-exported).

**The error count is not monotone under correct work.** This is the load-bearing hardness
property, and it is severe for this worker specifically: **the worker has no `run` verb**
(TOOL_MENU locks `run` forever — a worker that can run commands can run its own close), so
it **cannot run `tsc` and fixes blind**, learning the new error set only at the next close.

The job also required non-mechanical decisions: discovering that `web-tree-sitter` ships a
`SyntaxNode` type at all; designing a shared `RecallFilter` typedef and placing it at module
scope; and handling nulls behaviour-preservingly under a green suite with no `!` available
(LIBRARY_CONVENTIONS forbids `!`, `as any`, `@ts-ignore`).

**Honest limit on this evidence:** operator difficulty is not model difficulty. §6 is the
instrument that decides hardness; §4.1 only establishes that the job is winnable, non-trivial
in structure, and cascading. It does NOT establish that the model will find it hard.

---

## 5. The close (the only truth) and the check menu

### 5.1 Close — operator-owned, worker can never run or author it

`scripts/types-close.mjs`, invoked via a thin wrapper in the spine dir. Sequence, frozen:

1. **D1 static gaming audit** (§5.2). Any hit → red, `judged=1`, gap names the pattern class.
2. **Scope audit** — any changed file outside `src/**` → red. (writeScope already fences
   this; the close does not trust the fence alone.)
3. **`npx tsc --noEmit --strict`** → must exit 0.
4. **`npm test`** → must report `# fail 0` AND `# tests` ≥ **410** (executed-count floor, not
   a passed-count floor — a red tree must never hide under a passed count; F40).
5. **`npx tsc --strict`** (declaration emit) → must exit 0. The shipped `.d.ts` must still
   build; this is a real product requirement (LIBRARY_CONVENTIONS §2), and it was MEASURED to
   add no new error class on the seed (63 either way), so it cannot make the job unwinnable.

Green = all five pass. Every grader verdict — green or red — prints `TYPES judged=1`;
instrument stops (exit 97) deliberately do NOT, so a grader crash routes as
`close-crashed`/escalation and never as worker feedback (F17 floor, F32 routing).

- `judged`: `{ pattern: "TYPES judged=(\\d+)", min: 1 }`
- `gapKeep`: `^TYPES `
- Gap line cap: 120 lines, **trim announced, never silent** (F28).

### 5.2 D1 — gaming defenses (frozen pattern list)

All D1 checks are **DIFF-BASED against the seed commit**, because the seed already legitimately
contains `any` (20 brace-occurrences) and `@ts-ignore` (2). Absolute counts would false-red the
seed itself. Per-file counts must not INCREASE vs seed for:

| id | pattern | why |
|---|---|---|
| D1a | `@ts-ignore` | suppression, not a type |
| D1b | `@ts-expect-error` | suppression |
| D1c | `@ts-nocheck` | whole-file suppression |
| D1d | `any` inside a JSDoc brace type — frozen as `/\{[^}]*\bany\b[^}]*\}/` | the escape hatch that satisfies `noImplicitAny` while typing nothing |
| D1e | `{*}` / `{ * }` JSDoc wildcard | same escape, different spelling |

Brace-scoping (D1d/D1e) is deliberate: it is prose-immune (the word "any" appears 75× in
seed comments) while still catching every type-position use. `unknown` is NOT forbidden — it
is a real type that forces narrowing at use sites, which is the opposite of an escape.

Further defenses:

- **D2 — config weakening:** `tsconfig.json`, `package.json`, `test/**` are outside
  writeScope AND re-checked by the close's scope audit. The strictness cannot be negotiated.
- **D3 — deletion:** the emitted `.d.ts` exported-symbol set must remain a SUPERSET of the
  seed's. Removing code to remove errors is caught even when the suite stays green.
- **D4 — behaviour:** the suite is the behaviour oracle (step 4). Types must not be bought
  with semantics.
- **D5 — must-fail controls, run at $0 BEFORE any model money** (§8). A close that has never
  been watched failing is not an instrument.

### 5.3 Read fence

The worker is told the absolute repository root and is `fs.deny`-ed from: the spine dir (the
arbiter's books — gate audit, close log), `.litectx/`, `node_modules/`, `poc/` (849MB), and
`types/`. It must never read the arbiter's books (standing doctrine).

### 5.4 Operator-signed named checks (the agent composes; it never authors)

The agent may reference these by name in its plan via `check-passes(<name>)`. Checks decide
nothing and mint nothing — the close stays the only truth.

| name | command | exit 0 iff |
|---|---|---|
| `typecheck-clean` | `tsc --noEmit --strict` | zero strict errors |
| `suite-green` | `node --test` | `# fail 0` and `# tests` ≥ 410 |
| `no-suppressions` | D1 audit | no D1a–D1e increase vs seed |

**Which checks the agent attaches to which steps IS the workflow-authoring behaviour under
test.** The menu is offered; the composition is not prescribed.

---

## 6. HARDNESS GATE (frozen admission requirement)

hamr's condition. Screened at n=1 per arm BEFORE the battery, on the real plan flow.

- **H1 — not one-shot.** An arm whose FIRST attempt reaches a green close is **DISCARDED as
  saturated**. Rationale: jobs #1–#3 died exactly here (F33/F36) and taught nothing about the
  loop.
- **H2 — readable gradient.** An arm must show the strict-error count **strictly decrease
  across at least two successive closes**. An arm that never moves the count is DISCARDED as
  unreadable (the worker cannot act on the channel).
- **H3 — winnable within the fence.** Already SATISFIED at $0 by §4. Recorded, not re-run.

### 6.1 The verbosity arms (the only screened variable)

The close's gap channel is the worker's sole feedback. Two frozen arms:

- **Arm C — `counts-only`:** the gap names per-file error COUNTS and the error-CODE
  distribution. No line numbers, no message text. Follows this repo's standing doctrine
  (*"the close output must never NAME the culprit file — the worker finds it itself"*) as far
  as it can while remaining actionable.
- **Arm F — `full-errors`:** the gap carries the verbatim `tsc` error lines (file, line,
  code, message), capped at 120 with trim announced.

**Selection rule, frozen before any number:**

1. Any arm failing H1 or H2 is DISCARDED.
2. If both survive → the battery runs **Arm C** (harder channel, and the one consistent with
   standing gap doctrine). Arm F's screen row is reported as a recorded-secondary contrast.
3. If exactly one survives → the battery runs that arm.
4. **If NEITHER survives → job #5 is DISCARDED and the stop IS the result.** No widening of
   the cap, no loosening of H1/H2, no third arm invented after seeing the numbers. Build-ladder
   discipline: a rung that cannot meet its exit stops the ladder.

Screen budget: **$4/row cap, 2 rows, $8 ceiling.** Provider-red rows are casualties, never
evidence; during provider instability, probe with the battery's OWN model (2 consecutive
200s) before firing.

---

## 7. Battery (fires only if §6 admits an arm)

- **N = 3** valid acting rows on the admitted arm, $8/row, **$30 pass cap**.
- **Worker model:** `claude-sonnet-5` (frozen model rule: runs on existing scaffolding use
  sonnet/haiku).
- **Row validity:** a row is VALID iff the plan validated and at least one worker write-class
  action was gate-allowed. Provider-reds, money-cut rows, and instrument stops are
  CASUALTIES — excluded from the denominator and counted separately. A frozen rule without a
  wired detector is prose (F45): the money-cut detector is wired in the battery driver before
  the first launch.
- **Drift = STOP.** Autopsy before label.

### 7.1 Primary readout (a)

**L2-CONVERT-TYPES:** the fraction of valid acting rows whose run reaches a **green close**
via the agent's OWN composed plan. Layer 2's acceptance bar was ≥2/3; the same bar applies.

### 7.2 Secondary readout (b) — the ceiling question

Scored on the DRAFTED PLAN of every valid row, using the F51–F54 metric family so the numbers
are comparable to the TESTGEN reads:

- `strategyExplicit` — does the plan state a method without the spec supplying one?
- `discoversTargets` — does the plan name the error-bearing files/classes?
- `firstDraftValid` — did the plan pass the validator on draft 1?
- `stepCount`, `planShare` (F55's phase-share, plan-v1 restricted denominator).

**Frozen reading rule:** F51–F54 read the TESTGEN control at CEILING (1.00) on
`strategyExplicit` / `discoversTargets`. If the TYPES control also reads 1.00 on both, the
ceiling claim GENERALISES to a second genre and Layer 3's STOP branch becomes available. If
either reads **below 1.00**, the ceiling claim is GENRE-BOUND, Layer 3 stays PARKED, and the
inheritance question reopens on this genre. **This rule is frozen now, before the numbers.**

### 7.3 Pre-registered limits (so they cannot be dropped later)

1. **One genre added, not "genres in general."** Every claim from this job carries an
   explicit "…on TYPES", exactly as F51–F55 now carry "…on TESTGEN". Two genres is two, not
   universal.
2. **n=1 screen rows are anecdotes** (standing rule: a RED at n=1 is exactly as much an
   anecdote as a green). The screen decides ADMISSION only; it never mints a finding about
   capability.
3. **Patient familiarity** (§3.1) biases toward easy, so a hardness read survives it while an
   easiness read does not.
4. **This job does not measure inheritance.** (b) is a ceiling read, not an ON/OFF control.

---

## 8. Must-fail controls (D5) — run at $0 before any model money

Each is a hand-built tree state; the close must return the stated verdict. A close that has
not been watched failing is not an instrument.

| id | tree state | required verdict |
|---|---|---|
| V1 | seed, untouched | RED (63 errors), gap readable |
| V2 | `// @ts-nocheck` added to `chunker.js` | RED on **D1c** |
| V3 | every error annotated `{any}` | RED on **D1d** |
| V4 | `tsconfig.json` strictness loosened | RED on **D2 scope audit** |
| V5 | an exported function deleted to shed errors | RED on **D3** |
| V6 | a comparison flipped in `src/` (types fine) | RED on **suite** |
| V7 | the operator's round-1 partial fix | RED, count **54 < 63** (gradient readable) |
| V8 | branch `winnability-proof` (full fix) | **GREEN** |

V8 is the fake-green guard's mirror: a close that cannot return green on a genuinely correct
tree would make every red unreadable (check both REDS and GREENS — a red-side-only guard is
structurally incapable of catching a fake green).

---

## 9. Amendment log

*(Amendments are dated addenda. Frozen rules are never loosened post-hoc, even when another
axis looks good.)*

- 2026-07-25 — frozen.
- 2026-07-25a — **corrections and instrument fixes from the $0 D5 control battery.** None
  of these loosen a decision rule; the H1/H2 gates and the §6.1 selection rule are untouched.

  **Record corrections (transcription, not re-measurement):**
  - §3's per-file seed distribution listed `store.js` at 10 and summed to 64. That figure
    predated the `@types/better-sqlite3` devDep, which removes the `TS7016` in `store.js:6`.
    The correct frozen distribution is `chunker.js` 30 · `store.js` **9** · `edges.js` 8 ·
    `tsalias.js` 3 · `index.js` 3 · `impact.js` 3 · `assemble.js` 3 · `docparse.js` 2 ·
    `indexer.js` 1 · `langdef.js` 1 = **63**. The 63 total was always right.
  - §8's V7 was written as "count 54"; the control as run applies the `edges.js` fix only
    and reads **55**. The frozen requirement was `< 63` and is met. Recorded as run.

  **A control caught a fake-green channel in the close's own API guard (D3).**
  V5 — drop `ftsMatch` from `index.js`'s public re-export on an otherwise-green tree —
  returned **GREEN**. D3 collected exported symbols from *every* `.d.ts` in the tree, so a
  genuinely shrunken public API still read as intact because `ftsMatch` remained declared in
  `tokenize.d.ts`. D3 is now scoped to the package's declared `types` entry point
  (`types/index.d.ts`, which lists names explicitly — no `export *`), and the frozen baseline
  was regenerated from that entry: **31 symbols**, down from the 83 the tree-wide version
  produced. Remedy tested as hard as the defect: V5 now RED (`missing-export ftsMatch`) and
  V8 still GREEN. This is the red-side-only-guard lesson landing on the green side, and it is
  exactly why controls run before money.

  **The check menu leaked around the screened variable.** `typecheck-clean` emitted verbatim
  `tsc` error lines regardless of arm, so an agent composing that check under ARM C would
  have received full error text inside a counts-only run — a second, wider feedback path the
  arm never authorised, silently destroying the §6.1 contrast. Checks now take the arm as
  argv[3] and render counts-only or full to match the close.

  **The screen was blind to its own gate variable.** Checks logged nothing, so if an arm did
  most of its iterating through `check-passes(typecheck-clean)` the error-count trajectory —
  the H2 variable — would have been invisible in the close log. Checks now append to
  `types-check-log.jsonl` (arbiter's book, worker-denied), and H2 reads the trajectory from
  the close grades AND the composed checks, in order.

  **Spec slugs** renamed `screenC`/`screenF` → `screen-c`/`screen-f`; the job-v1 validator
  rejected the capitalised form as a non-kebab slug. Both specs now validate.

  **D5 controls, all eight passing as run:** V1 RED(63) · V2 RED(D1c) · V3 RED(D1d) ·
  V4 RED(scope) · V5 RED(D3, after fix) · V6 RED(suite, names the failing test) ·
  V7 RED(55<63) · V8 GREEN(410 tests, 0 fails, 31 exports).
