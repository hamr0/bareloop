# Close authoring — the user declares what done means (design record)

**Status: interview complete 2026-08-07, decisions below are hamr's. NOT frozen — awaiting
his sign-off on this document and on the two items marked ASSISTANT-PROPOSED. Build does not
start until the $0 expressiveness replay (§6, gate 1) has run.**

## 1. The gap this closes

Every close in the programme today is a hand-written `.mjs` script — six of them, in
`scripts/`, written by the assistant, one per patient. They encode the stages, the seed
commit, the ceilings, the suppression patterns.

That contradicts hamr's standing doctrine from the side nothing else does:

> *"there shouldn't be user authoring anywhere, that defies the point of bareloop"*

The check menu was un-authored at PRD v1.28 (checks derive from close stages). The plan was
never authored by the user (the agent drafts it). The close is the one layer left where a
human writes code — and it is the layer that decides green.

hamr's framing of why it matters, verbatim this session:

> *"the premise of bareloop is that user might not and mostly isn't swe to write and bareloop
> solves the whole thing"*

## 2. The decisions (hamr's, this session, in-turn)

### D1 — chat-first. The user answers questions; a repo is optional enrichment

Assembly runs as an interview, not as a picker over a repo tree. hamr's reason: *"sometimes
repo is not available, could be doc, website, something"* — and *"chat also keeps bareloop
promise of NL workflow creation"*.

Where a repo exists, we may inspect it to propose concrete commands and paths and confirm
them in chat. Where none exists, the interview still completes. A repo is never a
precondition.

### D2 — no escape hatch. The catalogue is stage KINDS, not stage names

If the catalogue cannot express a job's close, we add a kind. The user never writes a script.
Doctrine holds and the product is narrower until we widen it — that is the accepted trade.

The catalogue is therefore not a list of named stages (`typecheck`, `suite-green`) but a list
of **kinds** that parameterise. Proposed initial set, subject to gate 1:

| kind | shape | example instance |
|---|---|---|
| `command-exit` | run a command, expect an exit code | `tsc --strict` exits 0 |
| `count-not-worse` | a number parsed from output must not exceed a baseline | strict errors ≤ seed |
| `pattern-absent-in-diff` | a pattern must not appear in ADDED lines vs seed | no `@ts-ignore` added |
| `files-changed` | named paths must differ from seed | the target files moved |
| `judged-floor` | a judged score must clear a floor (softgreen) | *(needs §5)* |
| `human-confirms` | a person renders the verdict (hitl) | *(needs §5)* |

Our six hand-written closes are all instances of the first four. That is the claim gate 1
tests rather than assumes.

### D3 — the authoring LLM emits a DECLARATION over owned kinds, never code

An LLM receives the interview answers plus the catalogue and composes the close. It
parameterises kinds whose implementations we own. It cannot emit a script body, a shell
fragment, or a new kind.

This is the `check-passes(name)` move reapplied: illegal becomes **inexpressible** rather than
rejected after the fact. It also satisfies hamr's law as written — *"The danger is in the
ACTIONS, not the SYNTAX"* — because a declaration over owned kinds cannot take an action we
did not write. `run` stays locked; the authoring call gets no tools at all.

**Separation of authorship from judgment:** the authoring call happens at job creation, in its
own context, before any plan exists. The agent that later drafts the plan and does the work
never influences it and never sees it — it sees stage *names* only, through the derived check
menu. One hop, one direction, unchanged.

### D4 — verdictType is DERIVED from the answers, never picked

hamr's realisation, and the reason it matters:

> *"i also realizing that close may 'close' softgreen/hitl requirements as that's the whole
> diff"*

The verdict class is not a user preference. It is a **consequence** of whether the answers
admit a deterministic close:

- a deterministic close exists → `green`
- it needs judgment → `soft-green`
- it needs a person → `hitl`

This **supersedes** the v1 design in which `verdictType` is a declared radio the preflight
validates (`src/job.js`, "declared radio, never inferred"). The field survives as a structured
record of the derivation; what changes is who decides it.

### D5 — mandatory guards are SHOWN and FIXED

The close carries guards the user did not ask for, drawn from the genre. They are stated
plainly in chat (*"I'm also checking you didn't silence the type checker"*) and the user
cannot remove them.

**This is the load-bearing decision of the whole design.** F87's catch was `no-suppressions` —
a stage no user would think to request, and precisely the stage an LLM asked *"what would done
look like"* would never write, because it forecloses the easy win (the rubric-close /
self-consistency gotcha, RSI fold). Fixed guards are what keep the close from becoming a
mirror of the thing it judges.

### D6 — authored ONCE, at job creation; re-authoring is a spec edit

The close is generated once and frozen. It does not regenerate per run — a signed artefact
that regenerates is unsignable. Re-authoring produces a new hash and needs a new signature,
exactly like every other spec edit.

### D7 — the user signs the whole hash

hamr, verbatim: *"whatever shape it is, user signs the whole hash"*. The arbiter relocates to
the user; it does not disappear. No close runs unsigned.

### D8 — the seed is automatic *(ASSISTANT-PROPOSED — hamr answered "i don't know")*

Seed = HEAD at run start, recorded and shown, never typed. A dirty tree at start is a
preflight red, not a silent baseline. This matches how the runner already behaves.

### D9 — nothing JUDGES the close; three mechanical gates plus a signature

No LLM validates another LLM's close. Validity is established by:

1. **Declaration validator** — schema, kinds, parameters (the `validatePlan` pattern). A
   malformed close never reaches disk.
2. **Close precheck** — every stage runs against the real patient before any tokens spend. A
   stage that cannot run escalates `broken-close`. This guarantee exists today.
3. **Seed-verdict read** — every stage runs at seed and the result is shown to the user: which
   stages are RED at seed (that is the work) and which are GREEN at seed (those are the
   guards). A close where nothing is red at seed has nothing to do; a guard already red at
   seed is unusable. Rule A-v2 already keys on exactly this preflight data.

Then the user signs (D7). This answers *"who/what will validate that close is valid at one
shot?"* — nothing does it in one shot, and nothing needs to.

### D10 — the interview runs INSIDE bareloop

A product feature, not a Claude Code workflow. Confirmed by hamr.

## 3. What this does NOT change

- The close remains the only truth. A step passing its own in-run check is never a verdict.
- The check menu still derives from close stages, one hop, one direction.
- Merge stays human. Budgets stay operator input. The fence is untouched.
- The goal must still state everything the close judges (F87). Under this design that
  becomes structural rather than a discipline: the goal text renders from the same answers
  that produced the close, so drift is inexpressible instead of caught late.

## 4. Revive vs rebuild — what actually sits behind soft-green and hitl

Measured against the tree, not recalled.

**Survives today in `src/job.js`, reusable as-is:**
- `CLOSE_TYPES` (`predicate|gold|rubric|hitl`), `VERDICT_TYPES`, `LOCKED_VERDICTS`
- `CLASS_BY_VERDICT`, `CLASS_BY_CLOSE` and the close-hierarchy laundering guard
  (green-on-a-rubric is a named red)
- the `request-red` admission path — a locked verdict rides as a structured field and the
  ledger keys admission demand on it, never on prose
- `validateClose`'s object form for `gold`/`rubric`/`hitl`, still validated
- the entire staged-close machinery: `gapKeep`, the `judged` floor, `needs`, `offer`

**Gone, and genuinely new work:**
- **the runtime.** The plan flow refuses locked verdicts with `close-unsupported`; the legacy
  execution path was deleted at `507adbb` with `interpret.js` (887 lines) and most of the old
  `run.js` step runner.
- **non-command stage kinds.** A staged close today is an ordered list of stages whose *exit
  code is truth* — `src/job.js:442` states that a rubric or hitl stage is "inexpressible here
  by construction". `judged-floor` and `human-confirms` are a real schema extension to the
  array form, not a revival of the old object form.
- **the human handoff.** Rebuilt in plan-v1 shape; the legacy draft-PR mechanism is not
  ported (graduation is a rewrite, never a copy).

**Design work with no code to revive:** soft-green needs the judged-floor analog the RSI fold
flagged — a rubric close is self-consistency in disguise until a judged floor gates it. That
question is open and is not solved by this record.

**Verdict:** the vocabulary and its guards are revived; the execution and the two new kinds
are built. Roughly a schema extension plus a runtime, not a from-scratch rung.

## 5. Open items (not decided here)

1. The catalogue's initial kind list — proposed in D2, settled by gate 1.
2. The soft-green judged-floor analog (§4). Unresolved, and it gates soft-green only.
3. The hitl handoff shape in plan-v1.
4. Which model tier authors the close, and whether it is pinned separately from the drafter.
5. D8 (the seed) — assistant-proposed, awaiting hamr.

## 6. Build gates — in order, cheapest first

**Gate 1 — the $0 expressiveness replay. Runs BEFORE any build, and before any POC.**
Take the six hand-written closes in `scripts/` and ask, stage by stage, whether the D2 kinds
can express them without loss. Every stage that cannot is either a missing kind or a hole in
the design. This is the standing rule applied to a build instead of a fire: the premise gets
replayed against the archive before it is paid for (F63). If the kinds cannot express what we
already wrote by hand, the catalogue is wrong and no code should exist yet.

**Gate 2 — POC, aimed at the riskiest assumption.** Not "can an LLM emit JSON". The risky
claim is: *given only interview answers and the catalogue, does the authoring call produce a
close that validates, prechecks clean, and shows correct seed verdicts on a real patient?* Run
it against a patient whose hand-written close already exists, and compare. The comparison is
what makes the POC able to fail.

**Gate 3 — the guard test.** Prove D5 is load-bearing: author a close from answers that do
*not* mention suppressions, and confirm the mandatory guard still lands and still catches the
F87 cheat. If the guard can be talked out of existence, the design is broken.

**Gate 4 — build.** TDD, one module at a time, per the standing rules.

## 7. Sequencing

This rung sits after Layer 3's park (PRD v1.52) and before soft-green + hitl, which stand on
it: a hitl close IS an operator declaration, and there is no declaration surface until this
exists. It also unblocks the litectx-maintainer job, dark since `507adbb`.

---

## Addendum — 2026-08-07, GATE 1 RESULT: the catalogue is NOT sufficient as written

**$0 static expressiveness replay over every hand-written close in `scripts/`.** Reading rule
fixed before looking: a stage FITS if a kind plus parameters reproduces its verdict *and* its
gap output; verdict-only reproduction counts as a HOLE, because the gap is what converts
(F38/F39). Holes counted, not a pass rate.

**Method limit, stated plainly:** this is an analysis, not a measurement. Its failure mode is
the assistant's own optimism about what a kind "could" express. Gate 2's POC is what can
actually falsify it.

### Population

| close | genre | shape |
|---|---|---|
| `u-bareagent`, `u-bareguard`, `u-baremobile`, `u-pulselog` | TYPES (JS) | identical modulo constants |
| `u-litectx` | TYPES (JS) | as above, no `typecheck-outside` split |
| `u-spawner` | TYPES (Python) | mypy + pytest instead of tsc + node:test |
| `testgen-close` | TESTGEN | pre-staged single close: mutation kill-rate |
| `types-close` | TYPES (earlier) | superseded by the `u-*` family |

`testgen-close` was deliberately included. Excluding the hardest genre would have been fitting
the replay to pass.

### Result 1 — the six TYPES stage types fit, with four amendments to the kinds

| stage | kind | amendment required |
|---|---|---|
| `changed-from-seed` | `files-changed` | **containment**: the assertion is "the changed set is non-empty AND lies wholly inside an allowed prefix". `files-changed` as written only says "named paths differ". Needs an allow-prefix parameter. |
| `typecheck` | `count-not-worse` | needs a **line parser** (`/error TS\d+/`) and a **scope filter** (in-scope files only), baseline 0. |
| `typecheck-outside` | `count-not-worse` | same kind, complementary filter, baseline from seed. Fits once the above lands. |
| `tests-kept` | `count-not-worse` | needs a **direction** parameter — higher is better here. Parser differs per runner (node `# tests`; pytest `collected - skipped - deselected`). |
| `suite-green` | `command-exit` + `count-not-worse` | genuinely **two assertions** (exit 0 AND failures 0). Either the kind admits a paired assertion or this is two stages. |
| `no-suppressions` | `pattern-absent-in-diff` | needs a pattern list, an extension filter, and **untracked-file handling** (no diff exists, so every line counts as added). |

**One thing works better than expected:** the baselines (`OUTSIDE_MAX 67`, `TESTS_MIN 1044`,
`SEED_ERRORS 63`) never need declaring. D9's seed-verdict read measures them by running every
stage at seed. The user is never asked for a number they could not know.

### Result 2 — TESTGEN does NOT fit. A whole kind is missing

`testgen-close` grades by running a frozen set of 40 mutants: restore source, apply mutant,
run the suite, count kills, threshold the rate. No kind in D2 expresses that. It needs:

- **`harness-loop`** — run N frozen cases, tally per-case outcomes, threshold on the rate.
- a **frozen-artifact anchor check** (a mutant that no longer applies to the pristine source is
  an instrument stop, never a miss)
- a **tamper check** (the worker must not have edited the graded source)

This is the genre most unlike TYPES, and it is where the catalogue breaks. Reported as a hole,
not smoothed: **the catalogue as written covers one genre.**

### Result 3 — three obligations that are NOT kinds, and were missing from this record

These are cross-cutting runtime contracts every stage must honour. The record above never
mentioned them, which was a gap in the design, not in the catalogue:

1. **The instrument-stop contract.** Exit 97 with `judged=1` deliberately NOT emitted, for:
   timeout, null exit code, unreadable output, missing seed commit. This is the
   casualty-vs-evidence split (F45) and the F17 judged floor. A close that reports a broken
   instrument as a red manufactures fake evidence.
2. **The gap output contract.** Every line prefixed with the spec's `gapKeep`; line caps with
   trims **announced, never silent** (F28); no culprit file named beyond what the tool itself
   reports.
3. **The changed-set primitive.** `git diff <seed>` PLUS untracked files, minus two named
   arbiter books (`.litectx/`, `gate-audit.jsonl`). Both exclusions were paid for live - the
   `gate-audit.jsonl` one red-carded the arbiter's own file mid-run (u-msdonzxl) and burned a
   run to the wall. **No user could know to exclude these.** This is D5's principle operating
   below the stage level, inside a shared primitive.

### Result 4 — one LAW the authoring layer must enforce, omitted from this record

**One population per stage** (F84, hamr-signed 2026-08-05). `typecheck` and
`typecheck-outside` are split precisely because two populations under one stage name land in
one trend series, where an in-scope 29 followed by an outside-scope 4 reads as CONVERGING on a
run that merely swapped walls.

An authoring LLM told *"check the types"* writes ONE stage. The split must be enforced
mechanically at authoring - it is not something the model can be trusted to remember, and it
is exactly the class of knowledge D5 exists to inject.

### Result 5 — knowledge that came from paying, which no user can supply

- `MYPYPATH` on the spawner close: without it mypy resolved sibling imports to a *different
  checkout* via an editable install, so fixes were checked against unedited source. Found by
  probe, not by reading.
- pytest `-ra` and `-p no:cacheprovider`; `NO_COLOR`; per-stage timeouts; `maxBuffer`.
- the frozen env whitelist on TESTGEN (worker tests execute as arbitrary code).

Parameterisable, all of it - but nothing in the design DERIVES the need for them. This is the
strongest argument for the repo-inspection enrichment in D1 being more than a convenience.

### Gate 1 verdict

**PASS for the TYPES genre with four kind amendments. FAIL as a general catalogue.**

Not a stop. The build proceeds on the amended kinds, scoped to one genre, with `harness-loop`
recorded as known-missing rather than discovered later. What changes in the plan:

- D2's kind table gains the four amendments and `harness-loop` is listed as OUT of v1.
- The three runtime contracts (Result 3) become part of the kind **executor**, specified
  before any kind is written - they are not optional decoration and every kind inherits them.
- The one-population law (Result 4) becomes an authoring-time validation rule, in the same
  family as Rule A-v2: mechanically enforced, stated in the authoring prompt from the same
  facts object the validator judges.
