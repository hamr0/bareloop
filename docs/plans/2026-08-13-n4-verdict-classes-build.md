# N4 — the verdict classes: hitl, then softgreen (build plan)

**Opened 2026-08-13.** Status: PLAN. Nothing here is built.

## What this rung is

N4 unlocks the two declared-but-locked verdict classes on the plan flow — **hitl first, then
soft-green** — so that a job whose *done* needs a person, or needs judgement, can run through
the same signed spec, the same agent-authored plan and the same arbiter as a green job.
Nothing is redesigned: this rung BUILDS three frozen records, in order — the **nine
softgreen/hitl rulings (2026-08-07)**, the **D4 supersession restoring the verdict radio
(2026-08-08)**, and the **hitl surface: three buttons, 60-day pause, forward-only quarantine
unlock, lean-rerun default (2026-08-12)** — plus today's two rulings (the proving job and the
calibration set's author, addendum **2026-08-13** on the same record). Where this plan meets a
question those records do not answer, it says **OPEN** and parks it.

---

## Slice 1 — hitl

### 1.1 Admission: the class stops being refused

The refusal is not one flag; it is **six coupled sites**, and moving fewer than all of them
yields a spec that passes one gate and reds at the next.

| site | today | change |
|---|---|---|
| `src/job.js:106` `LOCKED_VERDICTS` | `['soft-green','hitl']` | drops `hitl` — the counted `request-red` at `validatePlanShape` (`src/job.js:534-540`, `lib:'bareloop'`) stops firing for it |
| `src/authoring.js:98` `LOCKED_CLASSES` | `['soft-green','hitl']` | same drop; drives `LIVE_CLASSES` (`:100`). This is the deliberate SECOND copy of the menu (suite-pinned against `VERDICT_TYPES`, never imported — the cycle note at `src/authoring.js:88-93`), so it moves in the same commit |
| `src/declaredclose.js:207` `class-battery-locked` | reds any class outside `LIVE_CLASSES` | falls silent for hitl once the battery below exists |
| `src/authoring.js:616` `CLASS_BATTERIES.hitl` | `{locked:true, guards:null}`; `classGuards` (`:675`) **throws** on it | needs a real hitl guard battery — see OPEN-1 |
| `src/authorflow.js:198` `QUESTION_SETS.hitl` | `{locked:true, questions:null}`; `questionSet` (`:221`) **throws** | needs the frozen hitl question set (three sets total, PRD v1.57 §2) |
| `src/authorflow.js:217` `CLASS_STATEMENTS.hitl` | `null`; `authorPrompt` (`:595-599`) **throws** without a statement | needs the plain composer statement for the class |

**And one more that is easy to miss:** `CLASS_BY_VERDICT` (`src/job.js:110`) maps
`hitl → 'hitl'`, while `CLASS_BY_CLOSE.declared` is `DECLARED_CLOSE_CLASSES = ['hard']`
(`src/declaredclose.js:120`). So today a hitl verdict on an **authored declaration** reds
`close-hierarchy` (`src/job.js:570-576`) unconditionally. `DECLARED_CLOSE_CLASSES` widens to
`['hard','hitl']` — and only when `human-confirms` is genuinely live, or the ceiling rule
(`closeCeiling`, `src/authoring.js:131`) is inert on the wrong side.

`scripts/run-author.mjs` already takes `--verdict green|soft-green|hitl`; no change beyond the
refusal lifting.

**OPEN-1 — RULED (hamr, in-turn, 2026-08-13): hitl inherits the green mechanical guards**
(`changed-from-seed` + `no-suppressions`, `src/authoring.js:617-637`) and adds nothing a human
stage cannot see. D5 makes the battery mandatory, shown-and-fixed and un-removable, and PRD
v1.57 §2 keys it to the CLASS; the mechanical-first composition law makes every hitl close
mostly mechanical anyway, so the green battery is the right floor.

### 1.2 The `human-confirms` kind goes live, `offer:false` BY LAW

- `src/authoring.js:240` — `human-confirms` drops `locked:true` and gains real
  `required`/`optional`/`shape`/`asserts`. That flows into `CATALOGUE_LIVE_KINDS`
  (`:262-268`), which the suite pins **EQUAL** to the executor's `LIVE_KINDS`
  (`src/kinds.js:139`) — so the executor work (§1.3) lands in the same commit or the pin reds.
- `envCapableKind` (`src/authoring.js:257`) keys off `!spec.locked`. A human stage must never
  become env-capable; keeping `env` out of both `required` and `optional` achieves that by
  construction — assert it rather than assume it.
- **`offer:false` by law (ruling 5).** `offer` is a per-stage boolean today and `checkMenu`
  (`src/job.js:438-463`) merely filters `s.offer !== false`. "By law" means a declaration that
  offers a `human-confirms` stage is **a validation RED, never a silent normalization** — the
  signer must not read one thing and have the runner store another. Sites: the declaration
  validator (`validateDeclaration` / `normalizeDeclaration`, where `offer`/`needs` pass through
  untouched — `src/declaredclose.js:131`) plus the composer prompt stating the law.

### 1.3 The executor: a human stage does not RUN, it PAUSES

`RUNNERS` (`src/kinds.js:1327`) maps kind → subprocess runner; an unmapped kind returns an
INSTRUMENT STOP (`runStageIn`, `:1357-1363`). A human stage fits neither shape.

- **A fifth stage outcome.** `StageResult.verdict` is `'green'|'red'|'instrument-stop'|
  'not-reached'` (`src/kinds.js:148`). Add a **pause** outcome that `runDeclaredStages`
  (`src/declaredclose.js`) propagates and `closeGrade` never grades. It is neither green nor
  red: the F17 forbidden-zone rule and the executor's own *"a crash rendered as a red is fake
  evidence"* note (`src/kinds.js:1337-1341`) both apply to a non-verdict.
- **Ruling 8 — skip the seed-verdict read.** `seedRead` (`src/kinds.js:1386`, D12) runs EVERY
  declared stage at the seed. Judged and human stages must be excluded, and the skip **recorded
  by name, never by silence** (F59's absent-is-not-empty rule).
- **The trend reader.** `src/trend.js` reads per-stage numbers. A human stage produces none;
  blind must read as unknown, never as zero (F6).

### 1.4 The pause: a run terminal, not a blocking prompt

**Finding first, because it changes the shape:** there is **no interactive surface anywhere** —
no `readline`, no `createInterface`, no prompt in `src/` or `scripts/` — and paid runs launch
setsid-detached under `systemd-inhibit`. So "three buttons at the terminal" is **a pause plus a
re-invocation**, not a process blocking on stdin. The 2026-08-12 addendum §2 already implies
exactly this by making the pause a checkpoint with a TTL and a resume.

- **New terminal.** `runPlan` returns a terminal string (`src/planrun.js:584-587`); `runJob`
  writes `job-end` with `spend()` (`src/run.js:293-305`). The pause is a new decision-ready
  terminal that must be wired into three readers deliberately:
  - **`src/bridges.js:74`** — demotion grades on `escalated` only. A pause must never demote.
  - **`src/ledger.js:66-94`** `EXCLUDED_ESCALATIONS` — a pause is a checkpoint, not a lib bug.
    The legacy `'hitl-close'` entry (`:84`, *"by design: a human is the close"*) is the
    precedent. **Decide whether to reuse that name or mint a new one, and remember the
    `step-stalled` precedent: `src/run.js` keys the F44 spend floor on OUTCOME NAMES — widen
    which terminals are read as a checkpoint, rename nothing.**
  - **`src/run.js:197`** `spendComplete` — a pause is a clean exit, not an unpriced death.
    It must stay `true` (only `stalled` / `cutMidCall` / an inherited floor set it false).
- **Evidence package (ruling 2)** — before/after changes plus every mechanical stage's result;
  never a bare "approve?". The materials already exist: `changedSet` / `addedLines`
  (`src/kinds.js:405`, `:433`) for the diff half, and `runDeclaredStages`' own per-stage rows
  for the other.
- **The three answers.** `accept` → green · `rerun with editable text` → red, the **text IS the
  gap**, run continues under remaining budget · `cancel` → terminal red, no gap. Delivered as a
  required runner flag (`--decide accept|rerun|cancel`, `--text …`) alongside the existing
  `--approve <specHash>` gate.
- **Signer-only (ruling 4).** The only signer proof this repo has is the spec-hash approval
  (`scripts/run-u.mjs:230`). The decision rides that same gate: a decision without the matching
  hash is refused. No second identity mechanism is invented.
- **Lean-rerun default (2026-08-12 §4).** A required flag has no default, which is the honest
  way to honour a rule written against rubber-stamping. The rule binds the moment any surface
  offers a default — an interactive prompt, or N6 — and is recorded here so that surface
  inherits it rather than re-deciding it.

### 1.5 The gap channel — where the human's text actually goes

The close-fix loop's `middle` (`src/planrun.js:2691-2776`) already assembles the worker's ask
from `post.gap` (*"The verification's output on the tree as it stands"*) and the per-iteration
`gap`. **The human's text enters exactly where `post.gap` does** — same seam, same bound, same
scrub — and the loop then runs under `remainingUsd()` (`src/run.js:287`) with the paused leg's
spend folded in via `priorSpentUsd`. Ruling 3 ("the human is the gap author") is therefore
literal, as the 2026-08-12 addendum insists, and needs no new channel.

### 1.6 Resume, the clock, and the TTL

- **"A resume restarts the LAST STEP from its beginning" is ALREADY BUILT.** `runPlan`'s
  `resumeSeed` contract (`src/planrun.js:503-527`) is that ruling verbatim: satisfied steps
  skipped in prefix order with their own `step-skipped` records, the plan **reloaded and
  re-validated, never redrafted**, the scout not re-run. `readResume` (`src/reuse.js:672`)
  already takes `resumableOutcomes` as a **parameter**, so the pause reads as a checkpoint with
  **no library change** — only `scripts/run-u.mjs:161` `RESUMABLE_HALTS` gains the name.
  A hitl pause happens after the plan's steps, so the resumed leg re-enters at the close/fix
  loop rather than at a step; **the POC must confirm that, not assume it.**
- **The clock stops for free, and that needs a TEST rather than machinery.**
  `RESUME_WALL_MS = WALL_MS − dead.restart.priorWallMs` (`scripts/run-u.mjs:228`) folds only the
  dead leg's OWN elapsed, read off its spine. A clean pause leaves the pause record as the last
  event, so the human's deciding time — hours or days — never enters `priorWallMs`. W-2 holds
  by construction. **One hazard to pin:** `deathAt` prefers the watchdog's kill record when
  present (`scripts/run-u.mjs:211-218`); a pause must not leave a stale watchdog report whose
  `at` post-dates it, or the human's first minutes get billed to the wall.
- **60-day TTL is new.** Nothing expires a checkpoint today; the resume gates
  (`scripts/run-u.mjs:175-224`) check liveness, job identity, terminal, and the tree
  (`resumeTreeGate`, `src/reuse.js:1045`). Add a TTL against the pause record's own timestamp.
  **OPEN-2 — RULED (hamr, in-turn, 2026-08-13): the TTL lives in the LIBRARY**, so the
  exported bundle (headless runner with bareloop as a dependency, PRD v1.44 §2) inherits it
  rather than every runner re-implementing it. A script-only TTL would vanish on export.

### 1.7 Metering

A human stage costs $0 and must not become "free because unknown" (F6): it emits no
`worker-round`, the pause's `job-end` carries `spend()` unchanged with `spendComplete:true`, and
the resumed leg folds `priorSpentUsd`/`priorSpendComplete` on the existing declared-fold
mechanism (`src/run.js:222`, `src/reuse.js:710-712`). Assert all three; none is a new mechanism.

### 1.8 THE POC — aimed at the riskiest assumption

**The riskiest assumption is not the pause; it is the RETURN.** That an operator-authored
end-of-run gap routes through the existing fix-loop machinery unchanged, and that the run
genuinely continues under remaining budget rather than starting a second run wearing a
checkpoint's clothes.

**A $0 scripted-worker POC on the REAL `runPlan`/`runJob` machinery** (no paid provider; `now`
is already injectable — `src/planrun.js:574-577`): force a pause at the final close stage, exit,
then resume with `--decide rerun --text "<human words>"` and assert
(a) the text reaches the fix worker's ask through the same seam `post.gap` uses, bounded and
scrubbed; (b) the fix loop runs at least one iteration under a `remainingUsd()` folded from the
paused leg; (c) the wall folds only the paused leg's elapsed, with days of simulated deciding
time in between; (d) `accept` mints green **without paying a worker round**; (e) `cancel` is
terminal with no gap and never demotes a bridge.

**It must be able to fail.** Negative control: `--decide rerun` with the text dropped — the fix
worker must NOT receive an empty gap and silently re-run as though nothing had been said.

**OPEN-3 — RULED (hamr, in-turn, 2026-08-13): `accept` RE-RUNS the mechanical stages before
green is minted.** The tree can change while a run is paused for up to 60 days
(`resumeTreeGate` exists for exactly that class); re-running commands is cheap, and green is
minted on fresh evidence, never on what the human read days ago. A re-run that reds does not
mint — it is a new red the run handles under the normal rules.

---

## Slice 2 — softgreen (after slice 1 ships)

1. **Class plumbing**, mirroring §1.1 exactly: `LOCKED_VERDICTS`, `LOCKED_CLASSES`,
   `CLASS_BATTERIES['soft-green']`, `QUESTION_SETS['soft-green']`,
   `CLASS_STATEMENTS['soft-green']`, and `DECLARED_CLOSE_CLASSES` gaining `'soft'`.
2. **`judged-floor` goes live** (`src/authoring.js:234`) with a runner in `src/kinds.js`
   `RUNNERS`, under the same `LIVE_KINDS` / `CATALOGUE_LIVE_KINDS` pin.
3. **Wired to bare-agent's `judge` through a METERED provider (ruling 6, F45).** `judge` takes
   `onLlmResult`; route it into the same accounting path `src/run.js:248` `account()` feeds, so
   the close's second term is real money the wallet sees. This is the budget-identity item the
   record's own §6(b) flagged: `budgetUsd` meters worker rounds and the close has cost $0 until
   now — *a budget must fund the attempt PLUS its close*.
   **Naming hazard:** `ralph`'s existing `opts.judge` (`src/ralph.js:486`) is the exit-evaluator
   seam and is a different thing. Do not overload the word at that seam.
4. **`judgeToAnnotation` → `gate.annotate` in the close stage.** The adapter is pure and calls
   no gate; the caller makes the call. bareguard 0.13.0 rejects malformed facts with distinct
   `annotate_malformed` audit rows and redacts `verdict` in audit lines.
5. **The frozen per-job calibration set**, authored per today's ruling 2 (LLM proposes → signer
   fixes and signs → stored enumerated → folds into the spec hash).
6. **The floor gate (ruling 7):** the judge may gate NOTHING until it has graded that set
   correctly. Run `calibrate` at preflight, never mid-run; zero reds required; **name the hash it
   graded** — this is also BA-20's own acceptance execution, which the ask explicitly deferred to
   this rung.
7. **Itemized reds (ruling 7, F38/F39):** named items and counts, never one paragraph — the same
   mechanical genre the count kinds already produce, riding the existing `Gap` bound
   (`src/kinds.js:162`) with the trim ANNOUNCED.
8. **Quarantine (ruling 9 + 2026-08-12 §3):** a softgreen pass mints no bridge and no
   inheritance. A flag on the row in `src/bridges.js` / `src/reuse.js`, never a deletion, and the
   unlock is **forward-only** — nothing walks the ledger backwards to re-mint what a wobbly ruler
   graded.
9. **The judge's TIER — RULED (hamr, in-turn, 2026-08-13): `claude-haiku-4-5`.** The only
   tier with established injection resistance upstream (BA-20); $0 extra calibration. The
   sonnet tier floor (PRD v1.36) governs drafter/worker roles, not the judge. A tier
   deviation later means re-running bare-agent's harness first — a re-signed operator call.

Composition law is already frozen and already partly enforced — mechanical-first, judge minimal,
human last, first-red-wins (2026-08-07 record), with the class ceiling computed by `closeCeiling`
(`src/authoring.js:131`) and `CLASS_BY_CLOSE` / `CLASS_BY_VERDICT` guarding the laundering
directions. **Cited, not redesigned.**

---

## Proving

**hitl:** `litectx-maintainer`, per today's ruling.

- **Status on disk: `jobs/litectx-maintainer.json` does not exist** — deleted (53 lines) in
  `507adbb` with the legacy path. Its last version carries `steps[]`, per-step `close`, a
  `class` field, and **no `goal` and no `verdictType`**; the plan flow can read none of it.
  **Re-authoring is required**, through `scripts/run-author.mjs --verdict hitl`, and hamr signs
  the resulting spec hash.
- The old spec's second half — *open a draft PR for human review* — has **no machinery left**
  (the hitl draft-PR step went with `interpret.js` at `507adbb`). The review surface is the
  terminal evidence package (2026-08-12 §5.2). Merge stays human forever regardless.
- **Patient is a COPY**, at the `bareloop-patients/<name>` convention the run-u target table
  already uses (`scripts/run-u.mjs:34-75`), never the original. The work-branch rule applies:
  `src/workbranch.js` derives `bareloop-<spec.job>` deterministically and `mkWorker` throws
  without a prepared branch.
- **Standing rules bind the fire:** the $0 archive read testing the premise is attached BEFORE
  any paid proposal; the run launches setsid-detached under `systemd-inhibit` with the watchdog;
  a U-run failure comes back to hamr rather than being fixed and re-fired mid-chase.

**softgreen:** proving is deferred with slice 2 and gated on the ruling-7 floor being graded
correctly first — a judge that has not cleared its own calibration set proves nothing about a
job.

---

## Out of scope

- **The panel UI — N6.** N4 ships the terminal surface only (2026-08-12 §5.2); N6 inherits these
  rulings rather than re-deciding them.
- **Concurrent jobs.** One job at a time in v1 (2026-08-12 §5.1); several shipped limits, the
  resume liveness check among them, are sized against exactly that.
- **Genre-widening.** Queued behind this rung by PRD v1.44 §5.
- **The composition law and the class ceiling.** Already law (2026-08-07 record; `closeCeiling`,
  `CLASS_BY_CLOSE`, `CLASS_BY_VERDICT`). Cited above, never redesigned here.

---

## Findings — where the source and the frozen design do not line up

Recorded because they are decisions the build must make, not paperwork.

1. **There are TWO expressions of hitl in the tree, and only one is N4's.** The legacy object
   form survives in the schema — `CLOSE_TYPES` includes `'hitl'` (`src/job.js:23`),
   `CLOSE_FIELDS.hitl = ['type','prompt']` (`:136`), `CLASS_BY_CLOSE.hitl = ['hitl']` (`:33`) —
   and `validateClose` admits it, after which the plan flow refuses it at runtime as
   `close-unsupported` (`src/planrun.js:632-639`, whose option list literally reads *"wait for
   the verdict-classes rung"*). N4's hitl is a **STAGE** (`human-confirms` inside a declaration),
   not a close TYPE. Unlocking the verdict without deciding this leaves two ways to say "a human
   decides", one of which no longer means anything. **Recommendation: the object form stays
   refused and retires once the declaration surface proves out — one hitl expression, not two.**
2. **Unlocking `LOCKED_VERDICTS` alone produces an immediately-red spec.**
   `CLASS_BY_CLOSE.declared` is `['hard']`, so a hitl verdict on an authored declaration reds
   `close-hierarchy` (`src/job.js:570-576`). The six sites in §1.1 plus
   `DECLARED_CLOSE_CLASSES` move together or not at all. Not a contradiction of the design — a
   coupling the design does not mention.
3. **"hitl has no unsolved design question — a human IS the verdict"** (2026-08-07 sequencing
   note) is true of the semantics and not of the surface: **nothing in this repo can prompt.**
   No `readline` exists in `src/` or `scripts/`, and paid runs are launched detached. The
   three-button review is a pause-and-re-invoke, which the 2026-08-12 addendum's own TTL and
   resume already describe. Named here so nobody builds a blocking prompt.
4. **`'hitl-close'` is already in the ledger's excluded-escalation set** (`src/ledger.js:84`), a
   leftover from the legacy path. Reusing that name for the new pause is tempting and is exactly
   where the `step-stalled` lesson applies: outcome NAMES are keyed on by `src/run.js`'s spend
   floor and by the runner's resumable list, so widen what a name means, or mint a new one
   deliberately — never rename in passing.
