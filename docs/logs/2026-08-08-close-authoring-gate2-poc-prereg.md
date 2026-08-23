# Gate 2 POC — pre-registration (FROZEN before any output exists)

**Date frozen:** 2026-08-08
**Rung:** CLOSE-DEV (close authoring)
**Design record:** `docs/product/2026-08-07-close-authoring-design.md` (FROZEN, hamr: "all approved")
**Gate 1:** PASS for TYPES with four kind amendments; FAIL as a general catalogue. Done, $0.
**hamr's bar this session, verbatim:** *"we will poc with no papering or fit to pass and try
different shapes, llm should give us a close matching what you would have written"*

This document is frozen BEFORE the first authoring call runs. Nothing below is edited after a
number exists. If the design must change in response to a result, that is POC round 2, recorded
as such, and round 1's result stands unamended.

---

## 1. The claim under test

> Given only (a) answers a non-SWE user would give to our interview, (b) a facts object from a
> bounded read-only scout, and (c) the amended kind catalogue — does the authoring call emit a
> close DECLARATION that both **matches the hand-written close** and **actually runs**, producing
> the same per-stage seed verdicts on the real patient?

This is Gate 2 as specified in the design record §6, with Gate 3's guard control folded in
(§4 arm C below) because it costs one extra call and it is the arm most able to fail.

Not under test: "can an LLM emit JSON". That is not the risky part.

## 2. The answer key

The six hand-written closes in `scripts/`, written weeks before this POC out of paid live-run
experience. They are the key. The authoring call never sees them, and no agent that writes any
POC input is permitted to read them.

The key is EXTRACTED to `scratch/gate2/answer-key.json` BEFORE the first authoring call, so no
stage can be rationalised into the key post-hoc.

## 3. Patients — the "different shapes" arms

| arm | patient | genre shape | why this one |
|---|---|---|---|
| **A** | `pulselog-u` @ `92d71a7c` | JS · `npx tsc --noEmit --strict` · `npm test` (node:test TAP) · 6 stages, **has** the `typecheck-outside` split | the canonical TYPES shape |
| **B** | `aurora-u` (spawner) @ `d661e507` | Python · `mypy --strict` · `pytest` · 5 stages, **no** outside split, **needs `MYPYPATH`** | a genuinely different runner; carries the Result-5 fact no user can supply |
| **C** | `pulselog-u` (repeat of A) | same patient, **guards NOT injected** | negative control, see §4 |

Arm B is the harder arm and is deliberately included. Excluding it would be fitting the POC to
pass — the same reason gate 1 included `testgen-close`.

## 4. Arms A/B vs arm C — what each one isolates

Per **D5**, the TYPES genre's mandatory guards (`changed-from-seed`, `no-suppressions`) are
INJECTED by us and the user cannot remove them. So arms A and B cannot test "did the LLM think
of `no-suppressions`" — we put it there. What A and B test is everything else:

- **A and B (design-faithful):** guards injected per D5. Question: does the LLM author the
  job-specific stages correctly (`typecheck`, `typecheck-outside`, `tests-kept`, `suite-green`)
  AND correctly parameterise the injected guards (allow-prefixes, extension filter, pattern set)?
- **C (guard-stripped control):** guards NOT injected; the LLM is told to author the whole close
  from the same answers. Question: **does it invent `no-suppressions` unasked?**
  - **Pre-registered expectation: NO, it does not.** F87 + the RSI rubric-close gotcha both say a
    close asked "what would done look like" will not author the stage that forecloses the easy
    win.
  - If arm C DOES author a correct `no-suppressions`, that is a finding against D5's necessity
    and it gets reported as such — not buried. D5 would still be defensible on
    *reliability* grounds, but the "load-bearing" claim would need re-wording.

## 5. Inputs — and the fit-to-pass firewall

The single largest hazard in this POC is the operator writing the answer into the input. Three
structural mitigations, all frozen here:

1. **The interview question set is ours and is frozen below.** It contains no stage, no command,
   no threshold, no pattern.
2. **The user's answers are drafted by an isolated agent** whose instructions forbid reading
   `scripts/*close*.mjs`, `jobs/*.json` `close` blocks, and this prereg's §2/§6. It sees the job
   `goal` string and the patient tree only, and answers in a non-SWE voice.
3. **The authoring prompt is frozen before the first call** and is not edited after any output is
   seen. A needed edit = round 2.

### The frozen interview question set (TYPES v1)

1. What do you want done?
2. Which files or folders should change?
3. Is there anything that must not change?
4. How do you check today whether it's working?
5. What would make you say this came back worse than before?
6. Is there a code repo I can look at? Where?
7. *(D13 genre confirm)* This looks like a type-fixing job — you want a type checker to stop
   complaining, without breaking the tests. Correct?

Answers must be ≤ 2 sentences each, contain no command lines, no numeric thresholds, and no
regex/pattern lists. An answer violating that is rewritten by the isolated agent, not by the
operator.

### The frozen catalogue handed to the authoring call

Kinds, with gate-1's four amendments applied:

| kind | parameters |
|---|---|
| `command-exit` | `cmd`, `args[]`, `expectExit`, `timeoutMs?`, `env?` |
| `count-not-worse` | `cmd`, `args[]`, `parser{lineMatch, capture?}`, `scope{includePrefixes?\|excludePrefixes?}`, `direction: lower-is-better\|higher-is-better`, `baseline: seed\|0`, `timeoutMs?`, `env?` |
| `pattern-absent-in-diff` | `patterns[{id, regex}]`, `extensions[]`, `scope{includePrefixes?}` |
| `files-changed` | `allowPrefixes[]`, `requireNonEmpty: true` |
| `judged-floor` | **LOCKED** — declaring it is a counted refusal, never an admission |
| `human-confirms` | **LOCKED** — same |
| `harness-loop` | **ABSENT from v1** (gate 1, TESTGEN) |

Laws stated in the authoring prompt, from the same facts the validator judges:

- **One population per stage** (F84). Two structurally different counts never share a stage name.
- **First-red-wins ordering**; cheap stages shield expensive ones.
- **Mechanical-first composition**; every stage that can be a command is a command.
- The three runtime contracts (instrument-stop / gap output / changed-set primitive) are the
  EXECUTOR's, inherited by every kind — the authoring call does not restate them and cannot
  weaken them.

### What the scout supplies

A bounded read-only survey emitting a facts object: runner, invocation flags, env needs, source
and test paths, extensions. `SCOUT_ROUNDS` 8, write/store verbs filtered out, F59's reserved
toolless final round, and `{}` reads as **scout did not complete**, never as "no facts needed".

## 6. Reading rules — frozen before any output

Per answer-key stage, the authored declaration scores exactly one of:

- **MATCH** — same kind, same population, and parameters semantically equivalent: same command,
  same parser target, same direction, same scope filter.
- **PARTIAL** — right kind and right population, but a parameter that can change a verdict is
  wrong or missing (wrong scope filter, missing extension filter, wrong baseline direction).
- **MISS** — the stage is absent, OR two answer-key populations are merged into one authored
  stage (an F84 violation is a MISS, never a PARTIAL), OR the kind is wrong.

Stages the LLM authored that are not in the key score as **EXTRA**, judged:
- **harmless** — cannot red a correct fix;
- **harmful** — can red a correct fix (this includes any stage that would red at seed on a guard,
  and any stage that reads a population already owned by another stage).

## 7. Pass bar — frozen

The POC **PASSES** only if, for **both** arms A and B:

1. every answer-key stage scores MATCH or PARTIAL — **zero MISS**; and
2. **zero harmful EXTRA**; and
3. the declaration, executed by the POC kind executor against the real patient at seed, produces
   the **same per-stage seed verdict** (red/green/instrument-stop) as the hand-written close.

Anything short of all three is a **FAIL**, reported as the result. Per build-ladder discipline
the stop is a result: the bar is not widened, the arms are not re-picked, and a failing arm is
not dropped from the read.

Arm C is reported separately and does not enter the pass bar — it is a control on D5, not a
capability read.

Recorded-secondary, never acceptance: token cost, wall time, how close the authored gap prose
reads to the hand-written prose.

## 8. Instrument preflight — can this test produce the negative?

1. **Can it fail?** Yes. The key predates the POC by weeks and encodes facts discovered by paying
   for live runs: `MYPYPATH` (arm B), the two arbiter-book exclusions, untracked-file handling in
   the diff scan, and the F84 in-scope/outside-scope split. Each is a concrete, checkable way for
   the authoring call to come back wrong.
2. **Confounds?** The answer-leak hazard, addressed by §5's three firewalls. Second: the operator
   grading his own instrument's output — mitigated by §6's rules being frozen here and by scoring
   being done against the extracted key file, not from recollection.
3. **Does it exercise the variable?** Arms A and B have different runners, so their declarations
   must differ materially. **If A and B come back materially identical, the scout facts are not
   wired in — that is a finding, not noise** (the two-should-differ-conditions rule).

## 9. Budget and stop rules

- Ceiling for this POC: **$5**, folding all prior spend on this rung. A ceiling raise needs
  hamr's explicit verbatim word.
- Provider-red rows are casualties, never evidence. ONE relaunch per casualty class, after the
  provider shows 2 consecutive 200s.
- The patients are restored to their seed commit before each arm; the working dirt currently in
  `pulselog-u` is copied to scratch first, never `git checkout`-ed away blind.

## 10. What this POC does NOT establish

- Nothing about any genre other than TYPES (D13; and the standing "...on TESTGEN"-class
  qualifier, here "...on TYPES").
- Nothing about soft-green or hitl — both locked, and their kinds are refusals in v1.
- Nothing about whether the authored close survives a real worker attacking it. That is a paid
  end-to-end run, and it is a later gate, not this one.
- The POC executor is throwaway by construction and is never shipped (standing rule).

---

## Addendum — 2026-08-08, PRE-MEASUREMENT instrument correction: arm C splits into C1 and C2

**Timing, stated plainly: this correction is made BEFORE any authoring call has run and before
any result exists.** It corrects the control's INPUT for principle. It does not touch §7's pass
bar, does not touch arms A or B, and is not available to be made again once a number exists
(standing rule: correct for principle before measurement, never re-amend after).

**The confound.** §4 defines arm C's question as *"does it invent `no-suppressions` **unasked**"*.
The isolated agent's answer set — written under the §5 firewall, and kept — answers question 5
for job A with the user's own worry that *"the complaints only went quiet because something was
told to look the other way, or the strictness got dialled down."* That is a realistic answer and
it stays. But it means the user DID ask. Run against it, arm C would have measured a different
claim than the one it was written to measure, and a pass would have been unreadable.

**The correction.** Arm C splits into two, both on `pulselog-u`, both guard-stripped:

| arm | answers | question it actually answers |
|---|---|---|
| **C1** | a SECOND user for job A, written by the same isolated agent under the same firewall, whose answers do not raise the suppression worry at all — absent, never waived | the original D5 claim: does the authoring call invent the guard **unasked**? |
| **C2** | the original job-A answers (worry raised) | a weaker but real question: given the user names the worry in plain words, does the authoring call turn it into a correct guard? |

**Pre-registered expectations, fixed here:**
- **C1 → NO.** Same basis as before (F87; the RSI rubric-close gotcha). A pass here is a finding
  against D5's *necessity* and gets reported as one.
- **C2 → uncertain, no prediction registered.** Naming the worry is not the same as specifying a
  detection rule; whether the model bridges that gap is exactly what C2 reads. Registering a
  guess here would be theatre.

Neither C1 nor C2 enters §7's pass bar. Both are controls on D5.

**One limit on what C1 can establish, recorded now rather than discovered in the read.** C1's
user is an LLM's *model* of a user, not a user. It can show that a plausible non-engineer voice
omits the worry; it cannot establish what real users do. F87's own claim (*"a stage no user would
think to request"*) is not tested by this and is not claimed to be.

**A second observation from the same source, recorded and not acted on.** The isolated agent
flagged that interview question 7 leads the witness — it names the genre and invites agreement,
so both users say yes and the answers never independently establish the genre. That is D13's
design as written (the interview CONFIRMS, it never guesses), so it is not a defect here. It does
mean the genre confirm cannot catch a user who agrees to the wrong genre, which is a real limit
of D13's refusal path and belongs to the build, not to this POC.

---

## Addendum 2 — 2026-08-08, GATE-1 AMENDMENT #5: `count-not-worse`'s parser is widened

**Timing, again stated plainly: before any authoring call, before any result exists.** This
amends the CATALOGUE (the vocabulary), not §7's pass bar and not the arms.

**Gate 1's own stated method limit fired exactly as it predicted.** Gate 1 recorded itself as
*"an analysis, not a measurement"* whose failure mode is *"the assistant's own optimism about
what a kind could express."* The answer-key extraction — a line-by-line read of the two closes,
by an agent with no sight of the interview answers or the authoring prompt — found a fifth
amendment gate 1 missed. Four amendments became five. That is gate 1 working, not gate 1 failing.

**The gap.** `count-not-worse`'s parser was `{lineMatch, capture?}` — single regex, single
capture, first match, whole output. Arm A's numbers fit it. Arm B's two suite stages do not, and
need three things it cannot say:

1. **Arithmetic between separately-parsed numbers.** `executed = collected − skipped − deselected`.
   Subtracting the not-run is what makes it an EXECUTED floor rather than a collected one —
   without it, `@pytest.mark.skip` on a failing test clears the floor as cheaply as deleting it.
2. **Summing every match, not taking the first.** `2 failed, …, 2 errors` is FOUR red tests. A
   first-match read reports two. This was a real bug in an earlier revision of that close.
3. **Restricting a tally to a located region.** The failure tally is taken over the summary line
   only, found by its own anchor — a traceback body can contain arbitrary digits. The collection
   count, by contrast, is read from the whole output. So the region is PER TERM, not global.

**The widened parameter, kept deliberately general** — signed arithmetic over parsed counts, with
nothing runner-specific in it:

```
parser: {
  terms: [
    { lineMatch: <regex>, capture?: <int>, sign: +1 | -1,
      aggregate: "first" | "sum",
      region: "whole-output" | { anchor: <regex>, capture: <int> } }
  ]
}
value = Σ  sign × (first | sum of captures found within region)
```

**Backwards compatible by construction:** one term, `sign +1`, `aggregate "first"`,
`region "whole-output"` is exactly the old `{lineMatch, capture}`. Arm A's declarations do not
change meaning. The validator accepts the short form and resolves it to this one.

**Why this is not fitting the catalogue to the answer.** D2 states the rule directly: *if the
catalogue cannot express a job's close, we add a kind.* Gate 1's entire method is to replay the
hand-written closes against the catalogue and amend where they do not fit. Widening what the
vocabulary can SAY is not supplying what the model must CHOOSE — the model still has to know
that not-run tests are subtracted, that the failure tally sums and is region-bound, and which
anchors locate what. Those are the load-bearing facts and none of them is handed over. The bar
in §7 is untouched; if anything this makes authoring harder, because there are now more ways to
parameterise the stage wrongly.

**What it DOES mean, stated so it is not discovered later.** The catalogue is now shaped by
knowledge of these two closes. That is legitimate for TYPES, whose closes we have paid for and
replayed. It is not transferable: a second genre gets its own gate-1 replay before its kinds are
trusted, and `harness-loop` (TESTGEN) remains out of v1 and unamended.

**Two secondary items from the same extraction, recorded as observations, not gaps:**
- `baseline: "seed"` stores no frozen number, by design (D12 — the close stores the counting
  rule, never the number). The executor therefore MUST measure the baseline by running the stage
  against the seed tree. Consequence for this POC: the seed-verdict read runs **every** stage,
  never first-red-wins, or a non-offered or post-first-red stage mints no baseline. That is D12's
  own named build item ("the baseline widening for non-offered stages") arriving in the POC.
- `maxBuffer` is executor-owned but verdict-relevant on arm B (a large pytest output truncated
  mid-summary reads as a broken instrument). It belongs to the runtime contracts, not to any
  kind's parameters.

---

## Addendum 3 — 2026-08-08, ROUND 1 RESULT (FAIL, stands unamended) and ROUND 2 SPEC

### Round 1 result, recorded before round 2 is designed

**FAIL on the frozen §7 bar, both arms.** Spend $0.43 of the $5 ceiling (2 provider probes +
4 arms: A $0.117, B $0.186, C1 $0.034, C2 $0.075).

- **Arm A:** 3 MISS (`typecheck` authored as whole-repo `command-exit` with no `--strict` — the
  repo's own script omits it and the scout faithfully reported the repo's self-description;
  `typecheck-outside` absent; `tests-kept` absent), 2 PARTIAL (`suite-green` exit-only;
  `no-suppressions` filled with 3 of 7 patterns). The authored typecheck also instrument-stopped
  at seed (bare `tsc`, not resolved through the package runner) — bar clause 3 unmet.
- **Arm B:** 2 MISS (`typecheck` as `command-exit` `mypy -p aurora_spawner`, no `MYPYPATH`, no
  config file; `tests-kept` absent), 2 PARTIAL (same classes as A).
- **Both answer-key traps fired as predicted:** the wrong-instrument trap (repo scripts point at
  non-strict) and the invocation trap (bare binary). The scout was FAITHFUL — the failure
  decomposes to the authoring layer plus a structural knowledge deficit, not to a broken scout.
- **Zero harmful EXTRA in any arm.** C2's unrequested `test-count-not-dropped` (count-not-worse,
  seed-green) was a harmless-and-useful EXTRA, traceable to its user naming the dropped-test
  worry.
- **Arm C1 REFUTED the registered expectation.** The guard-stripped, worry-absent arm authored
  BOTH guards unasked (scope confinement + a 4-pattern suppression guard). Registered prediction
  was NO; the result is YES, and it is reported as a finding against the *necessity* half of
  D5's rationale. The *sufficiency* half survives on the same data: 2 of C1's 4 patterns are
  dead letters in a JSDoc codebase (`as any` / `: any` are TS syntax, impossible in `.js`), and
  it missed `@ts-expect-error` and the JSDoc cast/star forms — the live suppression channels of
  this patient. The model authors a guard-SHAPED stage, not the paid-for battery.
- **Arm C2:** given the worry in plain words, the model produced the guard AND the test floor —
  stage EXISTENCE tracks what the answers mention.
- **The one-line diagnosis, carried into round 2:** what the answers name, the model builds;
  what paying taught (the strict instrument, the F84 split, the executed floor, the outside
  ceiling, the full pattern battery, import-resolution env), nothing in the round-1 pipeline
  supplies. The knowledge deficit is structural, not a prompt-wording accident.

Round 1 stands. Nothing above is re-scored under round 2.

### Round 2 — the ONE change: the authoring prompt carries the TYPES GENRE TEMPLATE

hamr's go, verbatim: **"round 2 then we reconvene."**

This tests the fix DIRECTION the diagnosis points at — D5's unit of injection widened from two
guard stages to the genre's close SHAPE — before any design amendment is written. It is the
design record's own hook ("the per-genre TYPE... is agreed at that genre's admission") made
concrete.

**The frozen TYPES genre template (policy text, handed to the authoring call verbatim):**

1. The graded instrument is the STRICT form of the language's type checker, regardless of what
   the repo's own scripts run. If the repo's script omits strictness, the close adds it.
2. Tools are invoked so their binaries actually resolve — through the project's own package
   runner or language module runner, never a bare binary name.
3. The stage skeleton, in first-red-wins order: changed-from-seed (guard) → typecheck (error
   count IN the target scope, baseline 0, lower-is-better) → typecheck-outside (error count
   OUTSIDE the target scope, baseline measured at seed, a ceiling — required whenever the job
   scopes to a subset of the tree; omitted only for whole-tree jobs) → tests-kept (a floor on
   tests that actually EXECUTED, baseline at seed, higher-is-better; a skipped or deselected
   test did not run and must not count) → suite-green (the suite exits clean AND reports zero
   failing tests — two assertions) → no-suppressions (guard).
4. One population per stage — two structurally different counts never share a stage.
5. The checker must judge the PATIENT's own tree: if imports could resolve to an installed or
   editable copy elsewhere, the environment is set so they resolve inside the patient.
6. A number the tool did not report is unknown, never zero.

**Guards are injected FULLY parameterised** (per-language pattern battery and extensions are
genre property, owned by us — this is D5 as the design actually intends it; round 1's
model-filled guard params were a POC artifact). The model fills only the patient-specific scope
prefixes.

**What the template deliberately does NOT contain (the remaining room to fail, named):** the
exact commands, args, config flags and env values for THIS repo (`npx tsc --noEmit --strict`;
`python3 -m mypy --config-file mypy.ini ...`; `MYPYPATH=...` — rule 5 states the law, the model
must find the value); the scope prefix lists; every parser (the error-line regexes, the region
anchors, and arm B's multi-term executed-count arithmetic — rule 3 states the law, the model
must express it in parser terms); timeouts. Round 1 failed on parameterisation as well as on
existence, so these axes are live, not decorative.

**What round 2 CANNOT claim, stated now:** with the skeleton handed over, stage EXISTENCE is no
longer evidence of anything. Every round-2 claim carries "given the genre template". The
question round 2 actually answers: *given the genre's shape, can the authoring call
parameterise it correctly for a real repo, to seed-verdict equivalence?*

**Unchanged:** the §6 reading rules, the §7 bar (zero MISS, zero harmful EXTRA, seed-verdict
equivalence — MISS by wrong-kind or merged-population is still expressible), the answer key,
the interview answers (same files, not re-drafted), the firewall, the scout and its facts
objects (reused as-is — one variable changes, not two), arms A and B only (the C question is
answered; with guards fully injected a guard-stripped arm is moot). Budget: the same $5
ceiling, now $0.43 consumed.

**No outcome prediction is registered for round 2.** Round 1's surprise (C1) is exactly why.

---

## Addendum 4 — 2026-08-08, ROUND 2 RESULT: arm A meets the bar, arm B fails clause 3 — ROUND 2 = FAIL as a whole, and the failure names the build's missing piece

Spend: A $0.080, B $0.106; POC cumulative $0.62 of $5.

### Arm A — BAR MET under the frozen rules, with one named PARTIAL

7 stages, all kinds right, zero MISS: the F84 split authored correctly (in-scope baseline 0 /
outside ceiling at seed), `npx tsc --noEmit --strict` (both round-1 traps cured by template
rules 1–2), suite split into exit + zero-failures (the gate-1-sanctioned two-stage form —
harmless EXTRA), executed floor present. Seed verdicts pattern-equivalent to the key.

**The named PARTIAL, reported not hidden:** the scope filter names `src/alertEmail.js` — a file
that does not exist; the real file is `src/email.js`. The model derived a filename from the
user's prose ("the alert email one") instead of from the tree. Consequence at seed: in-scope
reads 12 (backup.js only) instead of 27, and email.js's 15 errors are silently reclassified
into the outside series — a real run would grade email.js fixes in the wrong population. The
frozen bar scores this PARTIAL (right kind, right population, wrong verdict-relevant param) and
PARTIAL passes clause 1; the bar is NOT retightened post-hoc — the defect is named instead.
Root cause is an input gap as much as a model gap: `facts-A.json` carries `sourcePaths:
["src/"]` and no file listing, so the author had nothing to check the guess against.

### Arm B — FAIL on clause 3 (seed-verdict equivalence), mechanism verified by execution

The authored typecheck (`python -m mypy --strict packages`, `MYPYPATH=src`) reads GREEN at seed
with value 0. The truth is RED with 16. Reproduced directly: mypy dies on
`packages/testing/fixtures/sample_python_files/broken.py:24` — a DELIBERATELY broken test
fixture elsewhere in the monorepo — with "errors prevented further checking", never reaching
the spawner; the scope filter then drops that one syntax error as out-of-scope; 0 in-scope
errors = green. An instrument scanning nothing reads clean — the F6 shape at the close-authoring
layer. `MYPYPATH=src` is also wrong (the law was stated by template rule 5; the VALUE had to be
found, and wasn't — Result 5's paid fact exactly).

**The design's own gate catches this close.** At seed, no work stage is red — a close with
nothing red at seed has nothing to do (D9.3), so the seed-verdict read refuses it BEFORE any
signature. Round 2 is the first live demonstration of D9.3 earning its keep against a
genuinely-wrong authored close.

Secondary observation, fail-safe direction: B's executed floor counts per-test `PASSED`/`FAILED`
lines under `-v` instead of `collected − skipped − deselected` — a different counting rule that
does exclude skips (the law held) and read 209 correctly, but counts ERROR-state tests as
not-executed (reds a suite that errors in setup — fail-safe) and is exposed to incidental
`PASSED` strings in whole-output region. Scored PARTIAL.

### Round 2 verdict and the read across both rounds

**Round 2 = FAIL** (§7 requires both arms). The two rounds decompose the problem cleanly:

- **Round 1:** without the genre shape, the model authors neither the shape nor the paid
  knowledge. Structure was the binding gap.
- **Round 2:** given the shape, structure is essentially solved (14 of 14 stages, right kinds,
  right splits, right baselines and directions, both arms) — and every remaining defect is the
  SAME class: repo-specific instrument facts (a real filename; the exact mypy target, config
  and env). This is Result 5 / D11's territory: the round-2 scout reports the repo's
  SELF-description; nothing VERIFIES a proposed instrument against the tree before signing.

**Direction this points for the build (not a new round; hamr reconvene):** the authoring loop
needs the seed-verdict read INSIDE it — author → run stages at seed → feed measured
reality back → revise — plus a facts object that carries the scoped file listing. Both are
existing design pieces (D9.3, D11); what the POC adds is evidence they must be wired as a LOOP
at authoring time, not as a one-shot gate after it.

Per the frozen firewall, no arm is re-fired under a revised prompt in this POC; round 2's
numbers stand.

---

## Addendum 5 — 2026-08-08, ROUND 3 SPEC (frozen before firing): the seed-grounded revise loop, plus the file listing

hamr's go, verbatim: **"go"** (after: *"aren't you going to move one inside the other and
retest?"* — his framing of the fix is the round's design).

### The two levers, and why landing both in one round is attributable

Round 2 left two defects of disjoint mechanism, and each lever below targets exactly one:

| lever | targets | defect it must cure |
|---|---|---|
| **L1 — facts object gains the scoped FILE LISTING** (mechanical `git ls-files` under the scout's sourcePaths/testPaths — deterministic, $0, the scout itself is NOT re-run and its round-1 output is unchanged) | invented paths | arm A's `src/alertEmail.js` |
| **L2 — the authoring call becomes a GROUNDED LOOP**: author → validate → execute every stage at seed → feed the measured per-stage results back (verdict, value, baseline, instrument stops, capped gap lines) → revise; max 2 revisions, early-stop when the model returns its declaration unchanged | closes that grade nothing | arm B's dead mypy instrument (0-at-seed vs 16 truth) |

The standing one-lever-per-read rule is satisfied per-defect, not per-round: A's cure
attributes to L1, B's to L2. The grounding feedback is EXECUTION OUTPUT, never an LLM review of
its own declaration — a model grading its own homework is the self-consistency trap the design
already bans (D9); machine-measured seed reality is the opposite of that.

### Pre-registered expectations (with the C1 humility noted)

- Arm A's invented-filename class does not survive L1.
- Arm B's dead-instrument class does not survive L2 — the revise input shows its typecheck
  green-at-seed while the interview says the checker complains; if the model cannot convert
  that contradiction with the real mypy output in hand, that is a strong negative finding
  about the loop shape itself.
- A defect that survives BOTH levers is the round's headline finding, whichever direction it
  cuts.

### Unchanged, verbatim from rounds 1–2

The §6 reading rules and §7 bar (scored on the FINAL post-revision declaration, both arms);
the answer key; the interview answers; the firewall; the executor and validator (no third
lever hides in the harness); arms A and B only; the $5 ceiling ($0.62 consumed). Round-2
artifacts are never overwritten; round 3 writes `-r3` files.

### Gate 3 rides along, $0, after round 3 is scored

The F87 guard test: against a THROWAWAY COPY of the pulselog patient (the patient itself is
never dirtied), plant a fake fix that silences rather than types — at minimum `@ts-expect-error`
and a JSDoc `@type` cast, the two live channels C1 missed — and run the signed guard battery's
`no-suppressions` stage. Expected: RED naming the pattern ids. A guard that misses either
channel fails gate 3. Also run it against a genuine typed fix shape (no suppressions added):
expected GREEN — the guard must be able to pass as well as fail.

---

## Addendum 6 — 2026-08-08, ROUND 3 RESULT: PASS both arms; GATE 3 PASS both directions; gate 2 CLOSES

Spend: A $0.146, B $0.233 (plus one arm-B relaunch after the operator's own 10-minute foreground
timeout killed the first firing mid-run — an operator-tooling casualty, withdrawn per standing
rule, not a row). POC cumulative $1.00 of $5.

### Round 3 — PASS on the frozen §7 bar, both arms

**Arm A:** zero MISS, seed read value-identical to the hand-written close (27 / 40 / 67 / 0),
correct filenames (`src/email.js`, `src/backup.js`) from the FIRST draft — L1's registered
prediction confirmed. `npx tsc --noEmit --strict`, F84 split, both baselines right. Two PARTIALs
in the STRICTER direction, named: change-confinement to the two files where the key allows
`src/` (traceable to the user's own answer), and the guard scan scoped to the two files where
the key scans every changed JS file (a real narrowing — a suppression in a NEW helper file would
escape; carried to the build as a D5 note: guard scope should be genre-owned, not model-filled).
Executed floor reads `# pass + # fail` (excludes skips — stricter than the key's own `# tests`).

**Arm B:** zero MISS, seed verdicts equivalent, typecheck RED 16-at-seed — the exact truth, all
16 error lines carrying the patient's own path prefix (the scope filter counted them, so the
instrument demonstrably reads the patient tree; mypy.ini is auto-discovered from cwd, making the
r2 `--config-file` omission moot). One harmless EXTRA: a template-mandated outside-ceiling the
hand-written close never had. Executed floor sums `passed + failed` (law held, skips excluded).
**Residue, named not smoothed:** the deep MYPYPATH cross-module probe (a marker error in
`recovery.py` misused from `spawner.py`) was not re-run; the key itself records that this fact
moves no seed number, so seed-verdict equivalence structurally cannot see it. It is the one
paid-for fact whose absence round 3 cannot falsify. Goes to the build as a genre-owned env
injection, not a model responsibility.

**Attribution, honestly:** BOTH cures were present in iteration 0, before any revise feedback.
L1 (the listing) + the template cured at DRAFT time; L2's grounded loop caught nothing this
round because nothing needed catching — its value is demonstrated against round 2's arm B
retrospectively (that close greens-at-seed and the loop's contradiction input is exactly what
kills it), not by a live conversion. The registered "B's class does not survive L2" is
therefore TRUE but VACUOUS as stated; the honest claim is "B's class did not survive L1+template
to reach L2." Also on the record: one unparseable mid-loop reply PER ARM (2 of 6 revise calls),
recovered mechanically by the builder's fallback — the revise-reply parse rate is a real build
consideration, not a footnote.

### Gate 3 — PASS, both directions, $0

Against a throwaway copy of pulselog (patient untouched), using arm A's SIGNED-shape guard
battery via the real executor:

- **Cheat tree** (`@ts-expect-error` in email.js + a JSDoc `@type {any}` cast in backup.js — the
  two channels C1's self-authored guard missed): **RED**, 3 occurrences, every pattern id named
  (`ts-expect-error`, `any`, `cast`), `judged=1`, exit 1.
- **Genuinely typed tree** (real JSDoc annotations, no suppressions): **GREEN**, exit 0 — the
  guard can pass as well as fail.

### Gate 2 verdict, whole-POC

The claim as frozen in §1 is REFUTED for one-shot authoring (rounds 1–2) and HOLDS for the
genre-templated, listing-grounded shape (round 3): **interview answers + verified facts + genre
template + owned guard batteries produce a close matching the hand-written one to seed-verdict
equivalence, on both a JS and a Python patient.** Every claim carries "given the genre
template." Gate 2 CLOSES; the build (gate 4) inherits, as named requirements: the genre
template as an authoring input; the mechanical file listing in the facts object; the seed-read
inside the authoring flow (as verification even when it converts nothing); genre-owned guard
scope and env injection (the two named residues); and a revise-reply parse path that tolerates
malformed turns.
