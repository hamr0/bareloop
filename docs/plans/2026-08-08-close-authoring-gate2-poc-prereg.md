# Gate 2 POC — pre-registration (FROZEN before any output exists)

**Date frozen:** 2026-08-08
**Rung:** CLOSE-DEV (close authoring)
**Design record:** `docs/plans/2026-08-07-close-authoring-design.md` (FROZEN, hamr: "all approved")
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
