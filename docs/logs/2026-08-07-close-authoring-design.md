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

---

## Addendum — 2026-08-07, D11–D13 (the second-pass gaps, closed) + softgreen/hitl forward-compat

Second adversarial pass over this record found three inconsistencies BETWEEN decisions (none
reversing one). hamr approved all three proposals in-turn (*"yes, write d11-d13"*).

**This addendum was then re-derived against source**, and the first drafting was wrong in three
places, each corrected below and named where it sits: the seed-verdict read is already a per-run
step rather than becoming one (D12); the LOCKED_VERDICTS pattern refuses at VALIDATION, not at
runtime (point 2); and MED-1's resolved-spec rule does **not** make a catalogue widening flip an
enumerated close's hash — it bites on the opposite shape (point 3).

### D11 — the scout looks, the author writes, neither acts

Resolves the D3 ↔ Gate-1-Result-5 contradiction: D3 says *"the authoring call gets no tools at
all"*, yet Result 5's facts are load-bearing and none of them is derivable from an interview
answer — `MYPYPATH` on the spawner close (`u-spawner-close.mjs:119-130`, without which mypy
resolved sibling imports to a *different checkout* and fixes were graded against unedited
source), pytest `-ra` and `-p no:cacheprovider` (`:150`), `NO_COLOR`, per-stage timeouts,
`maxBuffer`.

**Resolution.** A separate bounded READ-ONLY scout inspects the repo first and emits a **facts
object** (runner, flags, env needs, paths, counts). The authoring call receives that object and
stays toolless. One looks, one writes, neither acts.

**What transfers from the plan scout, by name** (`src/planrun.js:41-62`, `src/job.js:537-541`):
a hard round bound (`SCOUT_ROUNDS` 8); write-class and store-class verbs filtered out of the
menu, so the survey is read-only by construction and not by promise; an output cap
(`SCOUT_BLOB_MAX`); F59's reserved toolless final round (a scout that spends every round on
tools otherwise returns nothing); and `SCOUT_MIN_BYTES`, below which a survey is treated as
**ABSENT, not empty**.

**What does NOT transfer, stated rather than assumed.** The plan scout derives its menu from a
*signed* `tools` ceiling and runs inside a fenced workdir. The authoring scout runs at job
creation, before any spec exists — there is no signed ceiling and no fence to derive from, so
its grant is fixed by us and is not spec-authorable. That is the same arbiter line as everywhere
else, arriving one step earlier than usual.

**F59 restated in the facts-object shape, because this is where it bites hardest.** An empty
`{}` must read as *"the scout did not complete"*, never as *"no special facts are needed"*. The
plan scout's version of that mistake cost a survey; this one lands in a SIGNED artefact — a
missing `MYPYPATH` becomes a close that grades the wrong checkout, signed by a user who could
not have known. The catch is D9.3: the seed-verdict read runs the authored stages against the
real patient before the signature, and a close built on absent facts does not survive it.

Where no repo exists the scout is skipped and the facts object is **empty by declaration** — a
distinct state from empty-by-failure. The interview still completes (D1); what such a job can
actually close is D13.

### D12 — the close stores the COUNTING RULE, never the number

Resolves the D8 ↔ repeated-jobs contradiction. bareloop's premise is repeated tasks; HEAD moves
between runs, so a baseline frozen at signing judges run 5 against run 1's tree. The hand-written
closes are explicit about this: `u-bareagent-close.mjs` hardcodes `SEED_REF` (`:27`),
`OUTSIDE_MAX 67` (`:30`) and `TESTS_MIN 1044` (`:31`). They are one-experiment closes and that
shape is what D12 retires.

**The close declares *how to measure* — "count executed tests; must not drop from this run's
seed" — and every run measures fresh at its own seed.** What is signed and frozen is the RULE.

**Correction to the first drafting: the seed-verdict read does not "become" a per-run step. It
already is one.** `runPlan` runs the close precheck (`0a`, `close-precheck`) and then preflights
every offered stage against the unchanged tree (`0b`, `check-preflight` — *"$0, deterministic"*,
before any tokens), and Rule A-v2's `seedRed` fact is read from exactly that preflight
(`src/planrun.js:734-793`, `src/plan.js:281-284`). What D12 changes is the DIRECTION of the
number: the preflight stops merely reading a verdict against a frozen constant and starts
**minting the baseline the run is later graded against**.

**One concrete requirement today's preflight does not meet, named here so it is designed rather
than discovered.** `checkMenu` filters `offer:false` (`src/job.js:412-415`), and the grading
stage is `offer:false` per spec — so a non-offered stage is never preflighted and would mint no
baseline. The precheck alone cannot supply the gap: it is first-red-wins and every shipped close
opens with `changed-from-seed`, which is red at its own seed by construction (the runner says so
in as many words at `planrun.js:771-777`). So D12's baseline read must cover EVERY stage, offered
or not — a widening of `0b`, not a reuse of it.

**F6 shape holds unchanged.** A baseline that cannot be measured is an instrument stop — exit 97
with `judged` deliberately withheld, the contract the hand-written closes already implement
(`u-bareagent-close.mjs:48-50`) — never a defaulted 0.

D12 does **not** close D8 (§5 item 5 stands, still ASSISTANT-PROPOSED). It removes what made D8
risky: whatever the seed turns out to be, the numbers are derived from it rather than asserted
against it.

### D13 — v1 has ONE genre, confirmed, with honest refusal

Resolves the D5 dependency on undesigned genre detection. v1 supports exactly one genre (TYPES).
The interview **CONFIRMS** it (*"this looks like a type-fixing job, correct?"*) — it never
guesses. Any other answer gets *"we can't run this kind yet"* and stops, on the `request-red`
admission path, so every refusal is counted demand evidence and never a silent drop. A genre
classifier is designed when a second genre exists to classify.

**One thing the refusal path needs before it is used this way.** `request-red` exists and carries
a structured `verb` the ledger keys on rather than prose (`src/job.js:126`, `:490`;
`src/ledger.js:162-165`) — that half is sound. But `classifyIncidents` files every request-red
under `lib: 'bare-agent'`, and the `ASKS` template renders it as an upstream-ask seed
(`src/ledger.js:122`). A genre refusal, a locked verdict class, or a locked kind is demand
against **bareloop's own catalogue**, not a bare-suite gap; filing it against bare-agent is the
BA-2 misattribution the typed-`lib`-at-the-throw-site rule exists to prevent, and it contradicts
`UPSTREAM-ASKS.md`'s own opening rule that a locked-but-exists request-red never becomes an entry.
The defect is already live for `LOCKED_VERDICTS` today. Named here, not fixed here: the
close-authoring refusal stamps its own `lib` at the emit site.

**Non-repo jobs, stated rather than implied — and sharper than "cannot run the precheck".** D1's
*"a repo is never a precondition"* holds for the INTERVIEW. It does not hold for D9's validity
gates, all three of which rest on a runnable patient with a git seed: the precheck spawns commands
in a workdir, and the changed-set primitive (Result 3.3) is `git diff <seed>` plus untracked
files. A doc or website job has no seed and no changed set, so nothing deterministic can be
measured against it — it is softgreen/hitl territory, OUT of v1, refused on the same request-red
path.

### Forward-compat for softgreen/hitl (decided now because it is cheap now)

1. **The D4 classifier ships IN v1**, even though v1 admits only green. It must be able to say
   "this is a softgreen/hitl job" and refuse honestly — misclassifying one as green would author
   a fake-deterministic close, which is precisely what the two laundering guards already in the
   tree exist to stop (`CLASS_BY_CLOSE` and `CLASS_BY_VERDICT`, `src/job.js:28`, `:96`,
   `:506-509`: a rubric can never claim hard). A classifier that resolves a judgment job to a
   command close defeats those guards from ABOVE, by never letting the illegal pair be formed.
   Refusals ride the `request-red` path and are the admission evidence for building the class.

2. **`judged-floor` and `human-confirms` enter the catalogue now as declared-but-locked kinds** —
   the `LOCKED_VERDICTS` pattern, which refuses at **VALIDATION, before any tokens**
   (`src/job.js:486-491`), not at runtime. (`close-unsupported` at `src/planrun.js:470-489` is the
   *other* refusal and belongs to close TYPES; the first drafting conflated the two.) Disclosure ≠
   admission: the kind is a named menu entry, so declaring it is counted demand rather than an
   unknown-kind typo.

   **With one structural constraint, or this point costs more than it buys.** Today a non-command
   stage is inexpressible in `close[]` by SHAPE — `validateStagedClose` runs `predicateBody` over
   every stage, and the source states the consequence directly: *"a rubric or hitl stage is
   inexpressible here by construction, which is the hierarchy enforced by shape rather than by a
   check"* (`src/job.js:442-444`). Admitting the two kinds must not trade that for a named red.
   So the locked kinds live in the **authoring catalogue** — refused at authoring time, counted as
   demand — while `close[]` on disk stays predicate-only and shape-enforced. Inexpressibility
   where it is already free; a named red only where it is not.

3. **Widening the kind menu is a re-sign event only where the close does not enumerate.**
   Correction to the first drafting, which had this backwards. MED-1 hashes the RESOLVED spec
   because an *omitted* `tools` means "whatever the menu currently holds", so a menu widening
   silently grows an unchanged spec's ceiling; hashing the resolved form pins WHICH menu was
   signed (`src/job.js:573-601`). A spec that named its ceiling explicitly is untouched by a
   widening — deliberately, because its meaning did not move. The same holds for a close that
   ENUMERATES its kinds: adding `harness-loop` to the catalogue must not, and does not, invalidate
   a signature over a close that never referenced it.

   **The rule that does transfer is the inverse, and it bites on D5.** The mandatory guards are
   exactly the field a declaration is tempted to leave implicit ("the genre's guard set"). That is
   the omitted-`tools` shape precisely: widening the guard set would then change what runs without
   changing what was signed. So the authored close stores its guards **enumerated**, and if any
   field of the declaration is ever omittable-with-a-default, the hash is taken over the RESOLVED
   form. Re-authoring remains a new hash and a new signature under D6 regardless.

4. **A hitl stage needs its own casualty split**: a human who has not answered is PENDING, never
   red — F45's casualty-vs-evidence rule extended to people. There is already a home for it:
   `hitl-close` is a named exclusion in the incident classifier, *"by design: a human is the
   close"* (`src/ledger.js:80`, `:134`), so a waiting human classifies to nothing rather than to a
   bareloop bug. PENDING must also be distinct from the run's own outcomes: it is a pause with a
   checkpoint — the wall-halt shape (PRD v1.40 §2, the stop IS the checkpoint) — never a red and
   never a casualty.

5. **A judged stage's gap must be itemized and mechanical** (named items, counts), never one prose
   paragraph — F38/F39: mechanical gaps convert, semantic gaps stall. A judged stage inherits the
   gap output contract (Result 3.2) like every other kind: `gapKeep`-prefixed lines, trims
   announced never silent, no culprit named beyond what the instrument itself reports. This
   constrains the judged-floor design before it exists.

6. **A judged or human stage is not a free command — and two things this record currently assumes
   rest on the close being free.** *(ARBITER TERRITORY — named here, PARKED for hamr, not
   decided.)*

   **(a) It breaks the seed-verdict read.** D9's whole validity story works because a stage is a
   $0 deterministic command run against the unchanged tree — the runner says exactly that at the
   preflight (`planrun.js:745-747`). A `judged-floor` stage at seed spends tokens and returns a
   nondeterministic number, so "is this stage red at seed" has no stable answer; a
   `human-confirms` stage at seed would have to ask a person at signing time. Whatever answers
   D9.3 for those two kinds is undesigned, and D9.3 is also where Rule A-v2's `seedRed` fact and
   (under D12) every baseline come from.

   **(b) It breaks the budget identity.** `budgetUsd` meters worker rounds; nothing meters the
   close, because until now the close cost nothing. Both time rulings are built on that: the wall
   bounds the work and never the judgement, and hamr's own words when he gave the ruling were
   *"run tests (free)"* (PRD v1.40 §1-2). F45's rule — a budget must fund the attempt PLUS its
   close — was written when the close's half of that sum was zero. A judged close spends provider
   money the wallet does not see, which lands directly on the advertised-equals-enforced line.

   Both halves are budget and close semantics, so neither is settled here. Stating them now is
   what keeps the softgreen rung from opening on a discovery.

**Sequencing.** Unchanged from PRD v1.52 §6: close-authoring v1 (green) is the next rung and
softgreen + hitl follow it.

**Within that follow-on rung, hitl lands BEFORE softgreen** *(ASSISTANT-PROPOSED — the PRD orders
the rungs, not their internals; this ordering is not hamr's ruling)*. hitl has no unsolved design
question — a human IS the verdict — and it unblocks the `litectx-maintainer` job, dark since
`507adbb`. softgreen still needs the RSI judged-floor analog (§4, §5 item 2), and now also owes
answers to point 6.

---

## Addendum — 2026-08-07, the record CLOSES: nine softgreen/hitl rulings, two canonical examples, the mechanical-first composition law

**Status change: FROZEN. hamr, verbatim, in-turn: "all approved, fix ledger now (assign to
opus and validate), close the record and review".** The nine questions were put as plain
decisions with proposals; all nine proposals are now rulings. D8 (automatic seed) stands as
proposed and unobjected, with D12 defining its direction. The ledger `request-red`
misattribution fix was ordered in the same turn and lands as code on this branch, not in this
record.

### The nine rulings (proposal = ruling for all nine)

**hitl:**
1. **Ask shape** — the run pauses decision-ready (the wall-halt shape: checkpoint, evidence,
   wait at the terminal). The clock does not run while a human is deciding — W-2's "the close
   never counts against the wall" extended to people.
2. **Evidence package** — the human sees the before/after changes plus every mechanical
   stage's result. A bare "approve?" is never presented.
3. **A human red** — the human's stated reason becomes the gap the worker converts (the human
   is the gap author, said out loud); the run continues under remaining budget.
4. **Who answers** — the spec signer only. One signer, one judge.
5. **Never mid-run** — judged and human stages are `offer:false` by law: the agent can never
   use a person (or a paid judge) as an in-run check ruler.

**softgreen:**
6. **The judge is metered** — judge spend comes from the same wallet; the close stops being
   assumed free and `budgetUsd` meters it (F45's "fund the attempt plus its close" now has a
   non-zero second term; advertised = enforced holds).
7. **The judged floor** — a judge must first correctly grade a frozen calibration set of
   known-good and known-bad examples, fixed at signing time, before it may gate anything.
   A judged red always carries an itemized list (named items, counts), never one paragraph
   (F38/F39).
8. **No seed baseline for judged/human stages** — they skip the seed-verdict read (a judged
   number at seed is unstable; a human at seed is an interview, not a measurement). Their bar
   comes from ruling 7's calibration, not from the seed.
9. **Quarantine** — a softgreen pass mints NO learning credit: no bridges, no inheritance,
   until the ruling-7 floor is proven against real runs. A wobbly ruler must not mint
   permanent credit.

### Two canonical examples (hamr's, confirmed with one sharpening each)

- **softgreen — "book a flight from London to SFO under $400".** Correct genre, with the
  composition made explicit: most of this close is MECHANICAL — a confirmation artifact
  exists and parses, price ≤ 400, route and dates match the ask. The judged stage covers only
  what cannot be mechanized ("is this artifact a genuine booking confirmation"). And the
  irreversible step — paying — carries a hitl gate regardless of genre: an outward,
  hard-to-reverse action confirms first. A softgreen job may therefore contain a hitl stage;
  the verdict class is the CEILING of its stages' classes, which is exactly `CLASS_BY_CLOSE`'s
  existing hierarchy read top-down.
- **hitl — "improve my resume".** Correct genre: "improved" has no floor a machine can hold;
  the owner's taste IS the verdict. Judged stages may pre-screen (typos, length, itemized
  rubric counts) so the human is never the first filter — but the human is the only door.

### The mechanical-first composition law (hamr: bareguard-inspired validations)

For every softgreen/hitl close: **deterministic stages first, judge minimal, human last.**
Every stage that CAN be a command IS a command (the bareguard pattern — fences and validators
that red mechanically before anything expensive runs); the judged stage covers only the
residue no command can hold; the human, where present, is the final stage only. First-red-wins
ordering makes the cheap stages shield the expensive ones — a form-red never reaches the
judge, a judge-red never reaches the human. The per-genre TYPE (which mechanical validations a
genre carries) is agreed at that genre's admission, per D13's one-genre-at-a-time law.

### What remains open after this freeze (complete list, nothing else)

1. `harness-loop` kind (TESTGEN genre) — out of v1, recorded at gate 1.
2. The D12 baseline widening for non-offered stages — a BUILD item (gate 4), not a design gap.
3. The exit-slot ceiling (`MAX_EXITS_PER_STEP` = 2) — PARKED, arbiter territory, hamr's call.
4. Preflight surfacing of the close's stage list to the operator (F87's UI direction, PRD
   v1.51 §5) — lands with the close-authoring interview UI, not before.

---

## Addendum — 2026-08-08, D4 is SUPERSEDED: the verdict class is the user's answer again

**hamr's ruling, this session.** `verdictType` is a **USER CHOICE**, not a derivation. The
green / soft-green / hitl radio of the 2026-07-21 Layer 2 locked design is restored: the user
picks the verdict class as part of the job, and that choice **drives** the close authoring
rather than falling out of it. The user is the one who knows whether their *done* is
machine-checkable, needs judgment, or needs a person; D4 inferred that from answers given
before the question was asked.

**D4 (§2, *"verdictType is DERIVED from the answers, never picked"*) is superseded in full.**
The field returns to what `src/job.js` already calls it — a declared radio the preflight
validates, never inferred. Nothing else in D4's paragraph survives; the rest of the record
stands unaltered.

**v1 is unchanged: `green` only.** A soft-green or hitl selection returns the honest counted
refusal on the `request-red` admission path (D13), which now carries demand for a verdict class.
The nine softgreen/hitl rulings of the closing addendum are untouched — they describe what those
classes MEAN, not who selects them.

**D13's genre-CONFIRM interview slot goes with it.** The interview no longer asks the user to
confirm a genre; the refusal MOVES to the composer — a job the catalogue cannot measure refuses
there, on the same `request-red` path, still counted as demand. D13's one-genre-at-a-time law
and its refusal mechanics stand; only the question slot is superseded.

**Recorded in the PRD register as Addendum v1.57 — 2026-08-08 §1**, alongside four further
rulings from the same turn that belong to the rung rather than to this record: the interview
re-keys from genre to verdict class; the D5 guard battery keys off that same verdict class
(tool-specific fills still resolve at composition time); declared commands get a deny-floor
under a mandatory named work branch; and the close is never time-bounded — a declared
`timeoutMs` is a stuck-backstop the model may only tighten.

---

## Addendum — 2026-08-12, N4's hitl SURFACE: three buttons, a 60-day pause, a forward-only unlock, the rubber-stamp rate that sets the default — and the rung's three scope answers

**hamr's interview answers, given 2026-08-10**, when N4 was opened alongside the sign-and-run
round rather than after it. The nine rulings of the 2026-08-07 closing addendum say what the
hitl class MEANS; §1–§4 below say how a human actually meets it, and §5 records the three scope
answers from the same interview. **Nothing in the frozen record is reopened** — ruling 1 (pause
decision-ready, clock stopped), ruling 2 (evidence package, never a bare "approve?"), ruling 3
(the human's stated reason IS the gap) and ruling 9 (quarantine) all stand exactly as written;
what follows is their surface.

### 1. The ask is three buttons, and two of them are red

hitl is an **END-OF-RUN review**. The human is offered exactly three doors:

- **accept** — green.
- **rerun with editable text** — red. **The edited text itself IS the gap** — the human types
  into the same channel the worker converts from, so ruling 3's "the human is the gap author"
  is literal, not a paraphrase step. The run continues under remaining budget.
- **cancel** — red, and **terminal**. No gap, no continuation.

No fourth door, and no free-text-only variant: a red that is not one of these two is not a
ruling the run can act on.

### 2. Pause TTL is 60 days; a resume restarts the LAST STEP from its beginning

A hitl pause is a wall-halt-shaped checkpoint with the clock stopped (ruling 1), and it keeps
that checkpoint for **60 days**. On resume the run **restarts from the beginning of the last
step** — not mid-step, not from the run's start. This is the step-level resume contract already
in force (*"why would i want to waste more money on something i already started"*), applied to
a stop whose cause is a person rather than a cap.

### 3. Quarantine unlock is FORWARD-ONLY

Ruling 9 withholds learning credit from a softgreen pass until the judged floor is proven. The
unlock, when the floor is proven, is **forward-only and never reversible**: passes minted after
the unlock may carry credit; quarantined passes minted before it stay quarantined permanently
and are never retro-credited. Nothing walks the ledger backwards to re-mint what a wobbly ruler
graded.

### 4. The rubber-stamping datum sets the DEFAULT: lean "rerun", never "accept"

**~40% auto-approve rate observed in the wild** — human reviewers approving without reading, at
roughly two in five. That number is a design input, not a curiosity: **the hitl UI's default
must lean toward "rerun", never toward "accept".** A default that costs one extra cycle when
wrong is cheap; a default that mints a green nobody read is the failure mode the whole class
exists to prevent. This binds whatever surface ships — per §5.2 that is the terminal prompt
now, and the panel (N6) when it lands.

### 5. Three scope answers from the same interview

**5.1 — One job at a time, in v1.** N4 runs a single job; concurrent jobs are not a v1 shape.
This is a scope bound, not a capability claim, and it is the assumption several shipped limits
are sized against — the resume guard's point-in-time liveness check (PRD v1.60 §2) is accepted
precisely because one operator drives one run.

**5.2 — Terminal-first; the UI is deferred to N6.** N4 ships the hitl surface at the
**terminal**, in the wall-halt shape the run already pauses in. The panel is N6's work and does
not gate N4. Everything in §1–§4 is therefore a description of a terminal prompt first: three
buttons means three answers the terminal accepts, and §4's "lean rerun" default is a terminal
default today. When N6 lands, it inherits these rulings rather than re-deciding them.

**5.3 — The verdict class is FIXED per signed spec.** A job's `green` / `soft-green` / `hitl`
choice is part of the spec the signer signs (v1.57's restored radio), and it is **fixed there**:
**a class change is a re-signed spec edit, never a runtime switch.** Nothing in a run — not a
replan, not a resume, not a fix loop, not an operator mid-flight — may move a job between
classes. This is the same law every other signed field runs under (a changed field flips the
hash and the runner refuses until re-approved), and it is what makes the picked class an
honest PROMISE: composition stays at or below the class the signature covers, and exceeding it
is an honest red rather than a silent upgrade.

---

## Addendum — 2026-08-13, N4 OPENS: the proving job and the calibration set's author

**hamr's interview answers, given this session, as the N4 rung opens.** Two blanks the frozen
record deliberately left — *which job proves hitl* and *who authors softgreen's calibration set*
— are now filled. **Nothing in the frozen record is reopened**: the nine rulings (2026-08-07),
the D4 supersession (2026-08-08) and the hitl surface (2026-08-12) all stand exactly as written.

### 1. The proving job for hitl is `litectx-maintainer`

**hitl is proven when `litectx-maintainer` runs end-to-end through the plan flow with the
three-button terminal review** (2026-08-12 §1) — not by a synthetic job built to exercise a
pause.

**Why that job.** It is the one the programme already owes a debt to: *"keep litectx green"* ran
under the legacy `steps[]` path as a predicate suite step followed by a `close.type: 'hitl'`
draft-PR review, and it went **dark at `507adbb`** when that path was deleted (PRD v1.32). The
closing addendum's own sequencing note named it as what hitl unblocks, and PRD v1.44 §5 put
softgreen + hitl ahead of genre-widening and ahead of the UI for exactly that reason. A rung
that lands with the job it was sequenced to rescue still dark has proven the machinery and not
the claim.

**What is actually on disk, stated plainly: `jobs/litectx-maintainer.json` DOES NOT EXIST.** It
was deleted (53 lines) in `507adbb`. Its last version is pure legacy shape — `steps[]`, a
per-step `close`, a `class` field, no `goal`, no `verdictType` — so **every field the plan flow
reads is absent**, and the draft-PR machinery its second step named was deleted in the same
commit. **The job must be RE-AUTHORED as a plan-v1 spec** (`goal` / `verdictType: "hitl"` /
close) through the close-authoring interview and signed fresh. That is the standing
graduation rule — a rewrite, never a copy — and the review surface is the terminal evidence
package (2026-08-12 §5.2), because no draft-PR code survives to inherit.

### 2. Softgreen's calibration set is authored on the D5 shown-and-fixed pattern

Ruling 7 froze *that* the judged floor's calibration set is fixed at signing time and left
**who writes it** open. Ruled now: **the authoring LLM PROPOSES the known-good and known-bad
examples during the close-authoring interview; the signer reviews them, fixes them, and SIGNS
them; they are stored ENUMERATED and fold into the spec hash.**

This is D5's guard battery mechanism applied to a second artifact, and it satisfies both
standing doctrines at once:

- **No user hand-authoring.** The human edits and signs; he never composes a calibration set
  from a blank page. *"There shouldn't be user authoring anywhere, that defies the point of
  bareloop"* (PRD v1.28) holds here exactly as it holds for checks and for guards.
- **No silent LLM authority.** Nothing LLM-judges the close (D9). The model's proposal is a
  DRAFT with no force; **the signature is what freezes the set**, which is the same thing that
  makes a guard un-removable and a close hash meaningful.
- **Enumerated storage, per D13 forward-compat point 3.** Stored spelled out and hashed
  resolved, so a later catalogue or harness widening cannot silently change what was signed.
  Re-authoring a set is a re-signed spec edit, like every other signed field.

### 3. The external unblock: BA-20 is DELIVERED

`bare-agent@0.36.0` ships the productized decisive judge — `judge`, `calibrate`,
`CALIBRATION_CASES`, `INJECTION_BATTERY`, `constantHonored` (the negative control), and the pure
`judgeToAnnotation` mapping — consumed here at **0.36.1** today (`bc6ebd4`), alongside
`bareguard@0.13.0`'s `gate.annotate` hardening. Ruling 7's floor now has a shipped harness
instead of a research POC. Two things ride with it, unpapered: BA-20's **live acceptance
execution was explicitly deferred to this rung** (running `calibrate` against the frozen floor
and naming the hash it graded is N4's work, not a delivery already banked), and **injection
resistance is established at `claude-haiku-4-5` ONLY** — running the judge on any other tier
requires re-running their harness first, which is an operator call and money.
