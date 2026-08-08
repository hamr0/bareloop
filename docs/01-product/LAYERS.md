# bareloop — the layer map (plain language)

> The PRD is the contract; this is the map. One page that states the overarching idea, the
> flow a user experiences, the verbs, the verdicts, and the layers — in the product's own
> words. **No package names in the body** (they blur primitive vs implementation); the one
> place implementation names appear is the table at the very end.
> Written 2026-07-15; pointed to by PRD addendum v1.13.

---

## The idea in one paragraph

The user hands over a **job** and a **budget**: *"automate this — I don't know the best
workflow."* The agent designs the workflow **while doing the work** — it builds the road
underneath itself as it walks. An outer judge the agent can never touch decides what counts
as done. A workflow that reaches green **survives to the next run**, with receipts for which
part earned it; when the ground shifts (the repo changes, a verb stops being enough), the
road **self-heals** — it requests more, or sheds what it no longer needs.

---

## The flow (what the product feels like)

```
USER: "I have a problem with X in this repo. Budget: $N. Go."
        │
        ▼
AGENT drafts the road as it walks it:
        │
  ┌─ small loop: LOCATE ───── find the culprit ──────────────── settled? → next
  ├─ small loop: UNDERSTAND ─ read what the code promises ───── settled? → next
  ├─ small loop: WRITE ────── change it; judge reds; retry ──── settled? → next
  └─ small loop: VERIFY ───── the OUTER judge: green / soft-green / hitl
        │
        ▼
escalate ONLY what the agent truly cannot decide
("I can't verify this", "budget half gone, here's where I am — top up or stop?")
        │
        ▼
DELIVER (a proposed change for human merge — merge is human, forever).
NEXT RUN: the road that greened is inherited, keeps improving, self-heals.
```

---

## The wheel — the one unit everything is made of

Every box above is the same machine, a **wheel** (internally: a *ralph*):

```
        ┌──────────── attempt (worker does work with its granted verbs)
        │
        ▼
      judge  ──── green ──→ done, move on
        │
       red
        │
        ▼
      gap (what failed, verbatim) ──→ fed to the next attempt ──→ retry
        │
      …until green, or the cap stops it (a stop at cap IS a result)
```

Four parts, and who owns them:

| part | what it is | owned by |
|---|---|---|
| **worker** | does the work using only the verbs it was granted | the agent (emergent) |
| **judge** (the *close*) | a command whose exit code is the truth; the worker can never run it or author it | the operator / the spec (fixed) |
| **gap** | the judge's failure output, fed back to the next attempt | the shell (fixed) |
| **cap** | the budget; operator-set, the agent may only tighten it | the operator (fixed) |

That split — *the agent authors its workflow, never its judge* — is the product's one
non-negotiable, at every scale.

---

## The verbs (worker primitives)

Granted **per job by the signed spec** — the agent never widens its own menu. If a locked
verb blocks the work, the worker files a *request-red* and a human decides.

> **Model tiers (v1.36, 2026-07-30; narrowed 2026-08-06):** the PLAN is authored at the
> medium tier (sonnet) or above — a small-tier drafter died at the validation gate twice on
> the same rejection (measured). Steps could once be tiered DOWN to the economy tier by the
> planner (`model` field); since 2026-08-06 the agent-selectable menu is **`sonnet` only**
> *(F87 — a reversible attribution probe, not a verdict on the small tier; see the Layer 2
> inventory below)*. Running a whole job below the floor remains an explicit OPERATOR probe
> (`--model haiku`), never a default and never the agent's to choose.

| verb | what it does |
|---|---|
| `read` | open a file |
| `grep` | search the tree for a string/pattern |
| `write` | change a file (inside the fenced write-scope only) |
| `recall` | ask the project's index "where does X live?" — returns **pointers**, not bodies |
| `get` | trade one pointer for exactly one chunk of code (the function + its doc comment) |
| `run` | **LOCKED, forever.** A worker that can run commands can run its own judge and grade its own exam |

> **⚠ RESOLVED by move P (2026-07-28, F69): the menu is now the full four-component
> catalog — 14 verbs (`read·grep·write·edit` / `recall·get·impact·related·recent` /
> `compress·peek` / `stash·remember·forget`), all signed into both job specs. The table
> above shows the original six for history.** Original note (F56, 2026-07-26): The agreed
> vocabulary is four components — **write · select · compress · isolate** — each with its own
> verb list, which the agent picks from as it sees fit. Those twelve verbs ship upstream today
> and were bound by the PRD's primitive-menu section; they were lost as collateral when
> config-v1 died (F22 measured them inert — on a loop that never greened and a store that was
> empty, conditions that have since lifted). Restoring them is move **P** of the v1.27 course
> correction. The hard line is unchanged either way: the agent may pick and tighten, never
> widen; the menu is signed; `run` stays locked.

---

## The verdicts

| verdict | meaning |
|---|---|
| **green** | hard proof — the judge's exit code says pass; the only thing that mints learning |
| **soft-green** | a rubric judged it acceptable — weaker credit, kept distinct |
| **hitl** | a human rendered the verdict |
| **red** | failed; the gap feeds the next attempt |
| **already-green** | was green before any work happened — mints **nothing** (credit for work not done poisons inheritance) |

---

## The layers

```
Layer 3   INHERITANCE    the road survives runs, with receipts; self-heals    (not built — N3, the NEXT rung)
Layer 2   MICRO-WHEELS   the road itself: locate → understand → write → verify (built + ACCEPTED — F47, v0.5.0;
                                                                                road finished by T·A·P·U, v1.35)
Layer R   THE ROOT       memory that survives attempts inside one run          (built — armed-and-inert, F41)
Layer 1   ONE WHEEL      a single loop over the whole task                     (built; fired — F38)
```

### Layer 1 — one wheel
One loop over the entire job: attempt → judge → gap → retry, under one budget. This is the
engine every higher layer is made of. **Status: built and FIRED.** The wheel turns
mechanically (F32 rerun: gaps delivered across attempts), and CONVERSION — an attempt
measurably better BECAUSE of the gap — was first observed on the TESTGEN battery (F38:
ladder conversion 3/5, on gaps that name a wall). Delivery and conversion are separate
axes (F32), and the split holds by gap GENRE: mechanical gaps convert, semantic ones
stall (F38/F39) — which is what Layer 2's in-run checks exist to translate.

### Layer R — the root (the ratchet)
Today, each attempt starts as a **fresh conversation**; the only thing that crosses attempts
is the last failure text. An attempt cannot tell the next one *"I already tried Y and it
didn't move the reds — do not try Y again."* That is why a never-green run repeats itself
(F21). The root fixes it: **one persistent state that survives attempts** — the plan, what
was tried, what it changed, what greened — while worker conversations stay disposable. (This
is the shape borrowed from recursive-LM designs: a durable root; cheap, throwaway
sub-contexts.) Verdict-gated inheritance is untouched: the root is *within-run scratch*, a
different scope from *across-run memory*, and only a green mints the latter.

**Status: built 2026-07-19 (design record `docs/plans/2026-07-19-layer-r-design.md`),
armed-and-inert, default OFF.** The shell detects fixation from its own books (same-file
rewrites with the kept-failure set unmoved) and injects escalating feedback — a capped
summary, then the worker's own failed edits verbatim. Detector and note read separate
axes: the detector keys off INTENT (what the worker reached for), the note off OUTCOME
(what actually reached the file) — F43. But two frozen probes (F41, $10.12) found the
disease in REMISSION: 0 fixated pairs in 14 across jobs #1/#2/#4, even against a
three-plant tree the worker had to grind through in three judged attempts — F21's
repetition was a broken-loop symptom, cured by the F20/F21/F30/BA-13 fixes.

**Default OFF (decided 2026-07-21).** Because fixation is extinct on every current job,
ON has never won its own A/B — so the ratchet ships armed and correct but NOT
default-enabled (`layerRoot: false`; pass `true` for the ON/experimental arm). Its field
read (repetition drop, ON vs OFF) DEFERS to the first run whose spine records
`root-injected`.

**Wired into the plan-v1 flow (2026-07-23, F50).** Until then the ratchet was wired only
into the legacy `steps[]` path (`interpret.js`); the accepted plan flow silently ignored
`layerRoot`, so it could never emit `root-injected`. Now `runPlan` engages one root per
EXECUTE step (each micro-wheel is the Layer-1 atom; red-set = the exit evaluator's own gap,
`gapKeep '\S'`, the whole normalized complaint — since a check's `^`-anchored gapKeep does
not survive the exit wrapper `check "x" red: …`) AND one in the outer close-fix loop (red-set
= the close's own `gapKeep`, the raw close output where the anchor works). The write-tee is
wired so same-path target rewrites are visible to the detector (the cumulative audit dedups
by path and cannot see them alone). Excluded on native/clipipe (no `onToolResult` seam; F48
fallback surface, not the experiment surface).

> **Layer R default — SETTLED OFF (2026-07-24).** The wiring EXISTS on the accepted surface
> (F50), armed and correct; the default is `layerRoot: false` and is now **settled, not
> provisional**. The old passive trigger ("the first plan-flow job that records
> `root-injected` flips the default") was a **dead pointer**: Layer 2's narrow micro-wheel
> steps were the exact predicted pressure point, and across ALL of Layer 2's accepted
> acceptance runs (F47) natural fixation never appeared — fixation is extinct on every job
> shape this repo owns (F41), and doctrine forbids default-enabling a lever that has never
> won its own A/B. So the default does not wait on an event the evidence says won't occur
> passively. **Reconsidering ON is now a DELIBERATE act, not a passive wait:** run a
> manufactured-fixation probe (force a real worker to repeat, measure whether the note
> breaks the loop) and read the pre-registered ON-vs-OFF result. Caveat F41 — strong models
> resist fixating, so the probe may struggle to produce its own precondition honestly; that
> difficulty is itself current evidence that OFF is correct. The pre-registered ON/OFF read
> is not cancelled — it is simply no longer a passive dependency dangling into Layer 3.

### Layer 2 — micro-wheels (the road)
The workflow becomes a **sequence of small wheels**, each with one goal and only the verbs
that goal needs (locate gets `grep`/`recall`; write gets `write`; nobody gets `run`). The
agent drafts this road per job; a validator gates the draft before any tokens burn.

**Status: built + ACCEPTED 2026-07-22 (F47), shipped v0.5.0.** The real plan flow
(SCOUT → PLAN → per-step micro-loops judged by the exit evaluator → one replan → the
operator's close) converts job #4 3/3 and clears the 45 bar 3/3 on the API surface; the
in-run operator-signed check TRANSLATES the semantic ask into the mechanical genre (F46).
Cross-surface (clipipe) reads OUT-as-peer (F48): only the API is a guaranteed surface. The
follow-up F49 (bound the agent-authored exit regex) is RESOLVED — a static nested-quantifier
reject at the validation gate, widened monotonically in v0.5.1.

**The road is FINISHED (2026-07-30, PRD v1.35).** T·A·P·U landed on top of the accepted
core: a wall clock and materials the planner is told as a balance (T), the variance replan
axis (A, at 0.5 — inert across the archive, live since 2026-08-06), the 14-verb palette and
the step vocabulary (P), and
user-mode e2e as routine — both U jobs green end to end with bridges minted (F68, F69).
The P read's load-bearing find became a validation law: a `check-passes` step must hold a
write-class verb, so the mailbox-with-no-hands plan shape is now inexpressible. **Closed out
2026-07-30** with a hardening pass (mailbox edges, the five-phase casualty grid, the
cold-store guarantee) and a whole-branch review whose every validated finding is fixed —
including F68's parked close runner, now async, so a running close no longer freezes the
loop it reports to. The branch is release-ready.

**Stage verdicts (decided 2026-07-15, hamr):** a micro-wheel validates against **its own
eval** where one exists — a mechanical check the stage cannot game; where none exists, it
**inherits judgment from its parent wheel's verdict chain** (green / soft-green / hitl).
Either way, *learning credit mints only at an honest close* — a stage may declare itself
settled to move on, but it cannot mint inheritance from its own say-so.

### Layer 3 — inheritance (self-healing across runs)
A road that greened is carried to the next run — **as executed, not as drafted** — and every
inherited rule carries the green that minted it and the contrast that attributed it (the
ledger). When the floor moves: a verb that keeps hitting locked doors becomes a standing
request; a verb that never earns its keep is shed. Merge stays human; budgets never
self-raise.

---

## The close-authoring rung — the close becomes DECLARED, never written

**Not a layer.** It changes who owns the **judge**, not who arranges the wheels. Until now the
close — the definition of done — was hand-written JavaScript, one script per patient, written
by the assistant. That is *"there shouldn't be user authoring anywhere"* broken from the one
side nothing else broke it from: the check menu is derived, the plan is drafted, and the layer
that decides green was the last place a human wrote code. This rung makes the close
**declared**. Design record `docs/plans/2026-08-07-close-authoring-design.md` (FROZEN
2026-08-07).

**Status: M1–M4 BUILT and live-validated on one real run (2026-08-08, $0.25, a JS patient) —
"SIGNING PREPARED, NOT SIGNED". Under whole-branch review; NOT shipped.**

The flow, end to end:

```
7 plain interview questions (no code, no paths typed by hand)
 → a bounded READ-ONLY scout lists what is really in the repo (runner, flags, env, paths)
 → a model fills a TYPED FORM: a declaration over a fixed catalogue of stage KINDS whose
   implementations bareloop owns — the schema is DERIVED from the catalogue and emitted as a
   tool call, prose is never parsed, and a locked kind is INEXPRESSIBLE, not rejected late
 → validator + the genre's GUARD BATTERY (mandatory, un-removable — the stages no user would
   think to ask for: "I'm also checking you didn't silence the type checker")
 → every declared stage runs ONCE against the untouched seed, proving each ruler measures
   something real before anyone trusts it
 → the resolved spec + its hash land on the operator's desk for SIGNATURE.
```

Everything from the signature onward is untouched — **mom still signs, and mom never gives up
the pen.** The agent that later drafts the plan never sees the close; it sees stage NAMES,
through the derived check menu, one hop, one direction.

> **⚠ UNDER WHOLE-BRANCH REVIEW (2026-08-08).** Six review lenses returned **3 serious
> findings** — model-declared `cmd`/`args` have no command floor; the python genre-env
> re-validation rejects the arbiter's OWN injection; a worktree-cleanup throw can discard an
> already-minted verdict — plus mediums (unscrubbed subprocess output reaching the authoring
> model; a crashed counter reading as zero, i.e. green). Fixes pending. **Nothing ships until
> they land.**

**verdictType is a USER CHOICE again (2026-08-08, hamr).** ~~D4 — derived from the answers,
never picked~~ is **SUPERSEDED**. The green / soft-green / hitl radio of the 2026-07-21 Layer 2
locked design returns as the user's own answer (v1 still admits only `green`). The user is the
one who knows whether their "done" is machine-checkable (green), needs judgment (soft-green),
or needs a person (hitl) — and that choice DRIVES the close authoring rather than falling out
of it.

**The interview re-keys from GENRE to VERDICT CLASS (2026-08-08, hamr).** Three frozen question
sets — green / soft-green / hitl — cover every job, instead of one set per genre. Genres are a
fat long tail that cannot be enumerated (TYPES was the first specimen, not the pattern), so
genre understanding moves into the LLM's COMPOSITION over the catalogue, where it already
belongs. **Open design question, recorded rather than smoothed:** the mandatory guard battery
is genre-keyed data today and needs a new home under class-keyed interviews — most likely per
catalogue KIND, so a guard rides the ruler it belongs to.

**A safety floor under declared commands (2026-08-08, hamr's ruling).** A declaration names
commands, so a deny-floor of dangerous commands (the `rm -rf` class) is required: a straight
block or a human gate, **never silently allowed**. The fence is the natural home — today
close-stage commands bypass it entirely. If the fence has no seam for it, that is an UPSTREAM
ASK, never a local shim. Alongside it: a job edits on a **work branch by default, never main**.

**The timer rule (2026-08-08, hamr's ruling) — the money rule applied to time.** The operator's
stage-timeout ceiling always wins; a model-declared `timeoutMs` may only TIGHTEN it, never
widen it, exactly as the agent may only tighten `budgetUsd`. And a measuring command that
CRASHES must fail **loudly, as could-not-run** — never as a zero, because a zero reads as green
(F6's honest-null in the shape that matters most: an unrun ruler is not a passing one).

---

## What lives where now (2026-08-06 flow update — second pass)

The layers above are the map; this is the current inventory — every mechanic that has
landed (or is in build) and which box it belongs to. Details and evidence live in the PRD
addenda (v1.36–v1.50); this list is deliberately one line each.

**The shell (judge + gap + cap — not a layer; governance lands here):**
- **Money:** hard cap per run, metered per round. A money cap-halt is what W-2 made of a
  time halt *(built, v1.46/v1.47)*: keep the last minted verdict, pause decision-ready with
  an ACCURATE trend note — cut-while-converging / cut-while-flat / can't-tell, computed per
  stage from the close's own graded numbers, never across STAGES, never model prose — and the
  three levers: top up & resume (a re-sign) / revise / abandon. Both governance halts read
  that ONE instrument *(v1.49; byte-motion survives only inside `can't-tell`, never promoted
  to a direction)*, and a resumed leg's readout spans the CHAIN while the strike governor
  stays leg-local — hamr's ruling, never mixed. **One population per stage** is the law for
  close authors: every mixed `u-*` stage is now SPLIT *(v1.49 §4; six spec hashes re-signed,
  two bridges expired by the load gate)* — the class survives only in `testgen-close`'s
  `verdict` stage *(parked)* and in the frozen screen infra *(as-run)*.
- **Time:** the wall cap (W-2: "when time is up, keep the grade we already have and stop";
  the close is never bounded and never counts against the wall); the outside watchdog
  whose kill requires deadline passed AND a flat spine (W-3 — never a silent kill); the
  in-run stall fuse.
- **The variance meter (A):** a step that has eaten ≥ 0.5 of the run's REMAINING money or
  time — either axis — is pre-empted at the head of its next attempt so the planner
  re-allocates. That share is the WHOLE trigger and stays it: the meter **reports**
  progress and decides nothing on it *(F85)* — a progress term in the condition would let
  a governance instrument over an operator-owned allowance judge capability. What it
  reports is the same reading the two halts carry (`trend`/`motion`/`reading`/`series`),
  read off the SAME `src/trend.js` instance they read, on the `variance` spine record and
  in the escalation detail the replan brief quotes. **No longer inert:** it fires on real
  runs, and its old fixed sentence — "with its exits unmoved", printed on every variance
  stop whatever had happened — is DELETED; it was false the first time it was read.
- **Resume:** step-level, "the stop is the checkpoint" — kill-resume exists, and money/wall
  cap-halt resume on the user path is *built and LIVE-VALIDATED* (F83: a signed top-up
  resumed bareagent-u's cap-halt at the close checkpoint and greened for $1.21/12.8min)
  (`run-u --resume`: the patient is continued, spend and wall fold in as prior, the ceiling
  never silently widens; the top-up itself is a spec re-sign).
- **Signing:** the resolved spec hash pins the tool menu that was signed (MED-1); tries,
  budgets, and reuse envelopes fold into the hash — any widening forces a re-sign.
- **Close hygiene:** env-strip on the close's environment; the close runs async; the
  arbiter's own books are never read by the worker and never red the close.
- **Close AUTHORING** *(in build, under review — 2026-08-08; see the rung section above)*: the
  close stops being hand-written JavaScript and becomes a DECLARATION over owned stage kinds —
  7 interview questions + a read-only scout + a typed form, through the genre's mandatory guard
  battery, every stage seed-verified, signed by the user as a resolved hash. Governance is
  unchanged by construction (the signature and everything after it is untouched). Two gaps it
  opens and owes: declared commands need a deny-floor (**they bypass the fence today**), and a
  declared `timeoutMs` may only TIGHTEN the operator's ceiling.

**Layer 1 — the wheel (the atom): unchanged.** attempt → judge → gap → retry; crash-by-cause
routing (a crash after real writes feeds back, an instrument crash escalates); provider
casualties are never evidence.

**Layer R — the notebook: unchanged.** Continuity only, armed and OFF; under a staged close
its red-set reads the stage that rendered the verdict and refuses to compare across a
stage change.

**Layer 2 — the road (where most of the recent work landed):**
- **Draft-gate laws (losing shapes made inexpressible, never judged):** a `check-passes`
  step must hold a write-class verb (the mailbox rule); a seed-red check may only gate the
  FINAL write step (check-placement, Rule A-v2); a replan may not shed a predecessor's
  check (check-shed, Rule B); nested-quantifier exit patterns are rejected statically.
  Each law is also STATED in the drafting prompt from the same facts the validator judges.
- **The exit-slot ceiling (a property of the gate, load-bearing and easy to miss):** a step
  may carry at most **2** exits (`MAX_EXITS_PER_STEP`), ANDed, and a `check-passes` on a
  write-granted step must be paired with a `tree-changed` exit — so **a step has exactly ONE
  check slot and cannot carry two checks**. Stated plainly: a job whose close judges N stages
  can have at most ONE of them enforced *during* a step; the other N−1 are enforced only at
  the close, at the end of the run. That is a cost shape, not a hole — the close still refuses
  a tree that fails any stage — but the run pays full price before it learns.
- **Prompt laws:** a step carrying a check is free to edit every file that check can
  report on (exit-freedom).
- **The step ladder:** fixed attempt counts are gone — 2 strikes of no progress (per-stage
  series, write-delta aware) force the replan, and the mechanism note goes to the
  REPLANNER, the channel that converts.
- **The replan ceiling:** one replan per run, on any of the three triggers (exhaustion,
  variance, stall) — **plus exactly ONE more** when a SECOND `step-variance` stop finds the
  run mechanically `converging` *(F85)*. The arbiter grants it off the same trend reader,
  bounded by a latch and not by a counter compared against a limit, so the ceiling cannot
  creep; `flat` and `unknown` stop as before, a third variance stop is the stop however
  well it is going, and exhaustion or stall past the ceiling is unchanged. The agent never
  asks for it, is never offered it, and has no channel to it.
- **The replan brief (the only channel the redrafting planner adapts to):** the mechanism
  that ended the step, the measured trend reading, what the stop left unspent — and the
  **close's own last output, verbatim** *(F86)*, scrubbed through the one secret inventory
  and bounded by the close path's own envelope, never a second truncation scheme. Handed
  over as TEXT and never as a parsed file list: a summary line naming every file in scope
  and a detail line naming the culprit are indistinguishable to a regex, and the parsed
  `never wrote` advisory that used to sit beside it resolved to the already-clean file on
  the run that killed it — deleted, sole caller and all. No gap → no block, byte-identical
  to the brief before it.
- **The close-fix loop:** its fixed iteration count retired for the SAME 2-strike
  no-progress rule *(built, v1.46/v1.47)* — a run should die when it is out of ideas, not
  out of money mid-convergence; the count survives only as the bound for a close that
  reports no number at all; money and wall keep full authority.
- **Materials:** money and time handed to the planner as balances; the scout is
  load-bearing (measured, not assumed); the staged close derives the check menu; the
  drafting floor is the medium tier.
- **The per-step tier menu, narrowed to `sonnet` only** *(F87)* — the agent can no longer
  tier a step down, and the `model` line is gone from the drafting prompt. A REVERSIBLE
  ATTRIBUTION PROBE, not a verdict on the tier: the archive's tier column is confounded both
  ways (the planner picks the cheap tier for steps it judges mechanical, and those steps sit
  on runs already in trouble), so the tier comes off and the next failure attributes to agent
  or harness instead. The field and its validator branch STAY — a one-entry menu still
  validates `model: "sonnet"`, stored bridges still load, restoring the tier is one token.
  **Only what the AGENT may express narrowed:** `--model haiku` is still the OPERATOR's probe
  knob (PRD v1.36) and the runner's tier map is deliberately wider than the plan's menu.

**Layer 3 — the recipe box (machinery built; the lift contrast RETIRED, the rung PARKED — F88 / PRD v1.52):**
- A green run graduates its road (bridge) to CANDIDATE; demotion only on escalation —
  a red never demotes, a casualty NEVER demotes; re-promotion is strict.
- "Same job" means same SHAPE, never same instance (else the box is a lookup table).
- One reuse green proves safe-and-legal, never beneficial — and the frozen ON-vs-cold lift
  contrast was RETIRED unrun (F88): the shape-lottery gate rules (`28ee95f`) now hand every
  cold run the winning plan shape for free (losing shape 10/14 → 0/10 across the archive),
  so the contrast would have paid $15–25 to measure a difference a $0 validation rule
  already erased. Selection/promotion/demotion are PARKED on `layer-3-reuse`; kept in the
  critical path: storage + pin (the user re-runs a stored workflow by name).
- The one reuse hypothesis still standing is TEMPLATE-ONLY reuse (strip the patient prose,
  carry rounds/tools/scope/attempts/tier and the iterate sentence) — specified in v1.52 §4,
  frozen, awaiting hamr. Next rung instead: close-authoring (the frozen 2026-08-07 design
  record), then softgreen + hitl on that surface.
- A tightened reuse envelope changes the resolved hash → re-sign.

---

## The kid version (start here whenever the map stops making sense)

A kid builds a LEGO castle. Mom pays for the bricks and decides if it goes on the shelf.
That part never changes — mom is the **shell** (judge + cap + merge).

- **Layer 1 — trying.** Kid builds, mom looks, says "the tower is crooked," kid tries
  again. Try → check → hear what's wrong → try again. That's the wheel — the smallest
  piece of the whole story.
- **Layer R — the notebook.** Without it the kid has goldfish memory: each try, they only
  remember mom's last "it's crooked," so they glue the same wrong piece three times. The
  notebook says *"already tried the blue piece — didn't work."* It lasts one day, then
  it's thrown away.
- **Layer 2 — the plan.** Instead of one giant build, the kid writes steps first: find
  pieces → sort → walls → tower. Each step is its own little try-check-retry loop. The
  kid writes the plan; mom still does all the checking.
- **Layer 3 — the recipe box.** A finished castle's plan goes in the box; tomorrow starts
  from the recipe, not from zero. Failed plans never go in the box.

**The ruler (what a *check* is, decided 2026-07-26 — PRD v1.28).** Mom inspects at the end,
so the kid can build for hours before finding out a wall is crooked. A **check** is a ruler
the kid may use on its own, mid-build, to test one wall before mom ever looks. It settles
nothing — mom's inspection is still the only verdict — it just turns "make it sturdier" into
"this wall is 2cm short", which is the kind of thing the kid can actually act on (F46: the
failure that was fatal 3/3 converted 2/2 once the ruler was in the kid's hands; F47: the kid
picked which ruler to use at which step, itself, 3/3).

**Where the rulers come from: mom's own checklist, not carved by hand.** Mom's inspection is
already a list of things she looks at. The kid borrows one item off THAT list — nobody carves
a custom ruler per castle. Two consequences worth stating plainly:
- **The kid knowing what's on mom's list is not cheating.** Passing every item IS a good
  castle. What would be cheating is mom saying *"the third wall from the left is crooked"* —
  that hands over the answer, and the rule against it (the close's output never names the
  culprit) is unchanged.
- **A hand-carved ruler is the more dangerous option.** A copy whittled beside the real
  inspection can drift softer than mom's eye, so the kid passes the copy and fails her. Job
  #5's three hand-written checks were re-implementations of three stages the close already
  ran. Borrowing removes that whole class.

For mom to lend an item, she has to say her checklist out loud as numbered items instead of
keeping it in her head — that is the one mechanical change (`close: [{name, cmd}, …]`). Items
that cannot stand alone ("does the whole thing hold together") stay mom-only; a partial ruler
menu is the expected case.

**And who says what "done" means at all?** The user — that is the ONE thing authored by hand.
*"I don't know the best workflow"* is not *"I don't know what done looks like."* The user
points at the far bank; the agent builds every pier.

**The customer, and the front-desk helper (2026-08-08 — the close-authoring rung).** Still
true that the user says what done means. No longer true that anyone writes it by hand. A new
character walks in: the **customer** — a grown-up who wants a castle and cannot write mom's
checklist, because writing checklists was never their job. So a **front-desk helper** asks them
a short list of plain questions, goes and looks in the real toy box to see which bricks are
actually in there, and then fills out **mom's pre-printed checklist form** — ticking boxes off
a fixed menu, never writing instructions in its own handwriting. Some items go on the form
whether the customer asked for them or not, because they are mom's house rules and a customer
would not know to ask ("and no gluing the bricks together to make the tower stand"). Then every
item on the checklist is tried once against the untouched castle, so nobody trusts a ruler
before seeing it measure something. **Mom still signs the checklist, and nothing gets built
until she does.** *(The customer also says up front which KIND of done they want — one mom can
check with a ruler, one that needs someone's judgment, or one only a person can call. v1 builds
the first; the other two get an honest "we can't do that yet" that is counted, never dropped.)*

Nucleus to the outside — note the layers are numbered by build order, not by position:

```
EVERY DAY, FOREVER ──────────── keep recipes that worked        = Layer 3
 └─ TODAY (one run) ─────────── one notebook for the whole day  = Layer R
     └─ the plan: step→step→step ─ order of work                = Layer 2
         └─ each step: try→check→try again ─ THE ATOM           = Layer 1
mom (checks everything, holds the money, owns the shelf)         = the shell
```

Each layer answers one kid-question: **How do I try?** (1) · **What do I remember
today?** (R) · **What order do I work in?** (2) · **What do I keep for tomorrow?** (3).
A notebook is useless if trying doesn't work; a plan is useless if you forget what you
tried; a recipe box is useless if the plans in it never worked. That is the build order,
and it is why everything currently waited on one question about the atom: **when mom says
what's wrong, does the kid fix THAT THING — or just start over the same way?** (The
battery. Delivery vs conversion, F32.)

That question now has a measured answer (F38 + F39). When mom names a **thing** ("there
are no tests", "that piece is banned"), the kid fixes THAT THING — every time it has
tries left. When mom names a **quality** ("make it sturdier, these walls are weak"), the
kid either freezes or runs at the right walls with braces that don't fit — because the
kid is never allowed to push on a wall to test a brace before mom inspects (and mom's
inspection ends the try). Even pinning the full note to the castle — score, target, every
weak wall — didn't change that (the F39 probe). So: the notebook (R) keeps the kid from
repeating itself; but turning "make it sturdier" into small walls the kid can push on
itself before mom looks — that is Layer 2's job, and it is now **observed working**
(F46 at POC tier, F47 at acceptance: the kid picks its own ruler, mid-build, and the
failure that was fatal every time converts).

## The shell vs the layers — who has what

The **shell** is the fixed frame around every wheel: **judge + gap + cap** (plus the fence,
the ledger, and escalation-to-human). It is not a layer. Every wheel at every layer runs
inside it, and no layer ever changes it. **Layers are build stages of the product, not an
escalation ladder inside a run and not a menu of modes** — a red at cap escalates to the
HUMAN at every layer, never "up a layer," and users never pick a layer. The finished
product is all four composed into one machine: a run inherits the last green road (3),
walks it as small wheels (2), remembers what it tried as it goes (R), and every wheel is
the same engine (1) — inside the same shell. The user hands a job and a budget; that is
the whole interface. What each layer changes is only: who arranges the wheels, and what
survives.

| layer | wheels | arranged by | survives attempts (within one run) | survives runs |
|---|---|---|---|---|
| **1** | one | human | the gap text + the tree (files written stay on disk) | **nothing** |
| **R** | one | human | + **the root**: the plan, what was tried, what it changed | nothing |
| **2** | many small (the road) | **the agent** (validator-gated draft) | root + each step's artifact feeds the next | nothing yet |
| **3** | many small | the agent | same as Layer 2 | **the road that greened**, with receipts |

## Worked example — the same job at every layer

Job: *"fix aurora — some tests fail."* Budget $N. What carries, layer by layer:

**Layer 1 (today):**
```
attempt 1 → judge: 6 pass, 1 fail → red
   what attempt 2 gets: the GAP (judge's failure text, verbatim)
                        + the TREE (files attempt 1 wrote are still on disk)
                        and NOTHING else — fresh conversation; it does not know
                        what attempt 1 read, tried, or ruled out
… retry until green or cap.
red at cap → escalate to the human: top up or stop. Top-up resumes THIS run
             (the stop is the checkpoint) — it does not change layers.
green      → done; and the job is below the value line (one wheel sufficed).
NEXT RUN: starts from zero either way.
```

**Layer R adds the root (fixes F21 — runs that repeat themselves):**
```
same one wheel, but a root survives attempts:
attempt 2 also gets: "tried Y; the reds did not move — do not retry Y."
NEXT RUN: still from zero. The root is within-run scratch, never across-run memory.
```

**Layer 2 adds the road (the agent designs, THEN walks — one replan allowed):**
```
scout (read-only, bounded) → agent DRAFTS the road: locate → understand → write → verify
→ validator gates the draft BEFORE execution tokens burn
→ walk it: one small wheel per step, each step's artifact feeds the next
→ mid-run, at most ONE replan (unlimited replanning launders thrash as adaptation)
red at cap → still escalates to the human.
NEXT RUN: drafts a fresh road from zero.
```

**Layer 3 adds inheritance (the first thing that survives a run):**
```
the road that GREENED is carried to the next run — as executed, with receipts
(which green minted each rule, which contrast attributed it).
run 2 starts from run 1's road and improves it; a red run inherits nothing.
```

## Hard lines (unchanged, restated)

- The agent authors its **workflow**, never its **judge** — at every layer.
- **Merge is human, forever.** No self-adjusted budgets, ever.
- **Secrets never enter the tree, the logs, or the memory** — an append-only log that
  captures a key captures it forever.
- **A stop at cap is a result**, never something to paper over.

---

## Where we are, and the build order

1. **Fire Layer 1 once, for real** — ✅ **FIRED 2026-07-16 (F38)**. Job #4 (TESTGEN:
   write a killing test suite for an untested 2,455-line module; the judge is mutation
   kill-rate) manufactured the guaranteed attempt-1 red (23/23 one-shots red, F37) after
   jobs #2/#3 could not host the firing (discarded / saturated at attempt-1 greens, F34).
   The battery read: **the wheel turns — ladder conversion 3/5 on mechanical gaps**
   (counts and named walls convert every time attempts remain); **kill-rate conversion
   0/5** — the semantic gap ("strengthen assertions on these functions") stalled. The
   follow-up probe (F39) hand-delivered the notebook's content in the description and
   measured the stall is NOT a memory problem: aim becomes perfect (14–18 of 18 named
   functions targeted) but every acting row died at the clean wall, authoring tests it
   cannot execute — and one row stalled anyway. No green at the 45% bar exists yet.
2. **Build Layer R** — ✅ **BUILT 2026-07-19, armed-and-inert (F41), default OFF
   (2026-07-21)**. The root's fixation detector + escalating rejected-edit feedback
   landed (design record 2026-07-19); two frozen probes then found the disease it treats
   in REMISSION — 0 fixated pairs in 14 across every job we own, including a three-plant
   tree that forced three judged red rounds. F21's repetition was a broken-loop symptom,
   already cured by the F20/F21/F30/BA-13 fixes. F43 split its two axes (detector reads
   intent, note reads outcome). Because ON has never won its own A/B, it ships OFF by
   default (`layerRoot: false`) — SETTLED OFF (2026-07-24), not provisional: revisiting ON
   is a deliberate manufactured-fixation probe, never a passive wait on `root-injected`.
   Role stays as F39 sharpened it: continuity, never the semantic-stall fix.
3. **Build Layer 2** — the micro-wheel road (plan-v1), with the stage-verdict rule above.
   Now carries a MEASURED requirement (F39): steps whose exits verify test correctness
   in-run (e.g. "your new tests pass on untouched source" as a form-checkable exit),
   converting the semantic ask into F38's convertible mechanical genre. **The premise is
   POC-VALIDATED (F46, 2026-07-21): with an operator-signed in-run clean-run check as
   the step exit, 3/3 rows cleared the wall F39's baseline died at 3/3 — two converted
   the exact F39 death mid-run — and kill-rate rose 3/3 (no 45-green yet; that question
   belongs to the build's battery). "Notes + self-check succeeds" is now observed at POC
   tier; the build designs it properly (design record 2026-07-21).**
   **Build core LANDED 2026-07-21 (branch `layer-2-plan-v1`, second interview locked
   decisions 6–9):** the four-field job shape (goal/verdictType/close/checks[], exclusive
   with `steps[]` under a staged sunset), the plan-v1 validator (`verb-escape` /
   `exit-illegal` / `check-unknown`, F17 pairing law), the exit evaluator (outcome-reading
   snapshots, fault propagation), ralph's judge seam, the plan executor (scout → validated
   plan → micro-loops with check-gap feedback → one replan → close + one fix loop), and
   the runJob dispatch — 503 tests, TDD, mutation-spot-checked. **The rung's acceptance
   gate — the real-model battery (job #4, same close, same frozen 45 bar, read against
   F39's baseline) — RAN and PASSED: 3/3 conversions, all 3 over the bar, every green
   driven by the agent's own composed check exit (F47, accepted 2026-07-22, v0.5.0).**
   **Also owns the Layer R default decision:** the first Layer 2 job that produces natural
   fixation runs the ON-vs-OFF acceptance read, and that result flips `layerRoot` to `true`
   (ON helps) or keeps it `false` (no lift) — see the Layer R ⚠ note above.
   Also carries (F40 latent, PRD v1.18): **each step declares its own deliverable
   target** — today one target path threads to every text-mode step (fine for
   successive gates over one artifact, the only shape job-v1 can express; a clobber
   the day two steps carry distinct deliverables).
4. **COURSE CORRECTION — T · A · P · U** (PRD v1.27, 2026-07-26, hamr). Inserted ahead of
   Layer 3 after job #5's realignment audit (F56) found the build had narrowed without a
   decision: the agent's whole authorship surface is six fields, the four-component palette
   was never re-expressed after config-v1 died, nothing in the system bounds TIME, and a
   replan has fired ~~**zero times in the programme**~~ — **that fourth premise is FALSE and
   is CORRECTED by F63: eight replans had already fired** (2026-07-22/23, four days before F56
   was written), all on the exhaustion trigger. A's motivation is retired; the other three
   divergences stand, and T is undamaged (it never depended on the replan premise).
   - **T — time is a cap, like money. ✅ BUILT** (2026-07-26, `maxWallMs` + `src/clock.js` +
     the materials block). A run-level wall-clock bound the agent is told at plan
     time and plans against; operator-set, tighten-only, never self-raised. A run that cannot
     fit is a stop (`wall-halt`; the stop is the checkpoint). The read it buys — given a time
     budget, does the agent RUSH or build a bridge that carries it? — is **still unmade: no
     real run has executed under a clock.** (Auto-sizing from complexity is later; v1 is
     operator-set.) Time is handed over as a BALANCE, never a rate (PRD v1.29).
   - **A — replan on TIME, not exhaustion only. ✅ BUILT; LIVE since 2026-08-06.** A step
     burning a declared share of remaining money or time triggers the replan. **F63 replayed
     it across 18 spines / 54 steps: it would have fired 0 times at hamr's 0.5** (near misses
     0.35 · 0.35 · 0.40 · 0.45). Not lowered to fit those four points. **DECIDED 2026-07-26
     (hamr, *"keep 0.5"*, PRD v1.31) with the inertness on the table** — a guard set above the
     observed population.
     **2026-08-06 — it fired, and the meter's NOTES were the defect (F85).** The threshold
     was right: it stopped a step that was eating the run. What it then told the replanner
     was a hardcoded *"with its exits unmoved"*, printed on every variance stop whatever had
     happened — and on its first real firing it was flatly false (the close had gone
     30 → 24 → 15 → 14 with the ladder recording zero strikes). Two instruments on one run
     and only one of them right; the replanner, told it had achieved nothing, threw the
     convergence away and re-targeted a file that was already clean. hamr's ruling, verbatim:
     *"meter is right but missing a piece … it should give heads up on money/time + progress
     for llm to judge."* Landed as three parts:
     **(A) the meter REPORTS, it does not decide** — the firing condition is byte-identical
     (`moneyShare`/`timeShare` ≥ 0.5, both axes, same threshold), because a progress term in
     the TRIGGER would make a governance instrument over an operator's allowance judge
     capability. The `variance` record and the escalation gain `trend`/`motion`/`reading`/
     `series`, read off the SAME `src/trend.js` instance the money and wall halts read — no
     second reader, since two readers of one question is the defect being fixed.
     **(B) the false sentence is DELETED** and replaced by that measured reading; the
     materials `progress` line keeps its structural half (steps done) and gains the close
     trend. **(C) a SECOND variance stop earns ONE more replan** — see the ceiling entry in
     the inventory above.
     Prerequisite found en route: the trend reader was blind to step-level progress (fed only
     the close precheck and the outer fix loop) and read the WRAPPED gap, whose
     `check "x" red:` line carries no number — both folds corrected, plus a preflight seed so
     the counter has a baseline.
   - **P — restore the palette** (write · select · compress · isolate, per-step and
     agent-selected, not shell hooks) and widen the step vocabulary past six fields
     (model tier / effort, attempt cap, scope narrowing). The arbiter stays inexpressible.
   - **U — one full-cycle e2e in USER MODE:** one sentence of problem, a budget, a time cap,
     one close, no operator hand-solve or arms. This is v1.26's second-genre e2e with the
     scaffolding stripped — the first run that tests the product rather than the atom.
   - **Acceptance is redefined (hamr):** a workflow need not green everything — it must green
     **ONE job end to end**, which graduates the bridge; the bridge is then reused on the next
     job of the same shape and improves. This makes Layer 3's paired control fall out of normal
     operation (reuse = the ON arm, from-scratch = the OFF arm) instead of needing a battery.
   - Order: **T + A → the staged close (v1.28) → U → P**. P last so the widening has a
     baseline to be attributed against. The **staged close** is the one build between A and U:
     a close declared as an ordered list of NAMED STAGES, with the check menu DERIVED from
     those stages, so U runs with **zero operator-authored checks** (hamr: *"there shouldn't be
     user authoring anywhere, that defies the point of bareloop"*). Designed and signed in PRD
     v1.28. **✅ BUILT 2026-07-26** (branch `staged-close-wip`): `close: [{name, cmd, expect,
     judged?, gapKeep?, offer?, needs?}]` replaces the single close object for `verdictType:
     green`; `checks[]` is retired outright (`checks-derived` red by name, not merely
     discouraged); `checkMenu(close)` derives the offerable menu, with a hidden/non-borrowable
     stage (`offer:false`) or a prerequisite chain (`needs`) both expressible. Two further
     decisions landed the same build (hamr, 2026-07-26, PRD v1.33): Layer R's red-set under a
     staged close reads the STAGE that actually rendered the verdict that attempt, and refuses
     to compare across a stage change rather than risk a false fire; and the grading stage is
     kept off the derived menu in all four shipped specs (`offer:false`, a per-spec convention
     guarded by a test, not a schema rule). **Status 2026-07-30: T·A·P·U is COMPLETE (PRD v1.35).** T built and live in
     every U run; A built-and-inert at 0.5 (the paying replans fire on exhaustion — *superseded
     2026-08-06: A now fires, see the A bullet above*); the
     staged close has run real-model many times over; U is routine (litectx-u and aurora-u
     both green end-to-end, bridges minted, casualties routed per doctrine); P built and
     read under signed hashes (F69: the widened palette went unselected on both TYPES jobs
     while the step vocabulary — model tier, attempts, scope — was adopted immediately; the
     load-bearing find was the mailbox-with-no-hands plan shape, now a validation law).
     Both job specs are signed on the 14-verb menu.
5. **Build Layer 3** — inheritance with ledger attribution (N3, kill-switch: rules must
   transmit across non-identical runs). Carries three v1.21 requirements (external-review
   fold, 2026-07-21): **(a) the drift detector** — arbiter-side trailing green-rate vs
   mint-time baseline, named red `drift-red`, flag-not-rollback (rollback is merge-class,
   human), must-fail fixtures before trust, threshold from measured base rate never
   guessed; **(b) the N3 control gains a third arm** — inheritance-ON+agent-readable
   lineage vs ON-mechanical vs OFF, gated by a sub-dollar pre-probe (identical plans
   with/without lineage in hand kills the arm), default prediction NO lift (F39);
   **(c) bound-pressure ledger fold** — "step X capped M of N runs" for the trust
   surface; acceptance = it can surface the F37/16g rounds-vs-money bind from archived
   spines.
   **This is the NEXT rung (2026-07-30).** Layer 2's road is finished, hardened and
   reviewed; the branch is release-ready. Layer 3 is the REUSE rung — the bridges the
   U runs have already minted get reused instead of redrawn, which makes the paired
   control fall out of normal operation (reuse = the ON arm, from-scratch = the OFF arm)
   rather than needing a battery. **How it opens, in order:** interview hamr → freeze the
   design → a sub-dollar PRE-PROBE before any inheritance machinery is built (requirement
   (b)'s gate: identical plans with and without lineage in hand, and if lineage does not
   move the outcome the arm is dead). That order is not ceremony — CL-BENCH's read is that
   memory systems LOSE to plain in-context learning once base capability is subtracted, so
   the cheap instrument runs before the expensive build.
   **Status 2026-08-01: the opening interview is COMPLETE and the design is FROZEN** (hamr,
   2026-07-31 → 2026-08-01, verbatim *"all agreed, lock in and we will validate with pocs
   these assumptions and change as needed"*) — design record
   `docs/plans/2026-08-01-layer-3-reuse-design.md` (R1/R2/D1–D9, answering PRD v1.34's
   inventory; PRD v1.42). **The pre-probe is pre-registered and gates the machinery:**
   `docs/02-experiments/REUSE-PREPROBE-PREREG.md` — draft-only, three arms, $1 hard cap, on
   the cross-patient TYPES pair. Nothing is built before it reads.
6. **Build CLOSE-AUTHORING — the close becomes declared** (design record 2026-08-07, FROZEN;
   M1–M4 built 2026-08-08). **This is the rung in flight**, sequenced after Layer 3's park
   (F88 / PRD v1.52) and BEFORE soft-green + hitl, which stand on it: a hitl close IS a
   declaration, and there is no declaration surface until this exists. It also unblocks the
   `litectx-maintainer` job, dark since `507adbb`. Gate 1 (the $0 expressiveness replay over
   the six hand-written closes) read **PASS for the TYPES genre with four kind amendments,
   FAIL as a general catalogue** — `harness-loop` (TESTGEN) recorded as known-missing rather
   than discovered later; gate 2's POC closed 2026-08-08. **Status: built, live-validated once
   ($0.25, "signing prepared, not signed"), UNDER WHOLE-BRANCH REVIEW with 3 serious findings
   open — see the rung section above for those, and for the four 2026-08-08 rulings (verdict
   class back to a user choice, verdict-class-keyed interviews, the command deny-floor +
   work-branch default, the tighten-only timer).**

---

## Appendix — the ONE place implementation names appear

| product word | implemented by |
|---|---|
| the worker loop (wheel) | `bare-agent` |
| the fence / gate / redaction | `bareguard` |
| `read` / `grep` / `write` | `bare-agent` shell tools |
| `recall` / `get` (the index) | `litectx` |
| the judge (close) | an awaited `spawn` of the spec's argv — plain child process, exit code = truth (async since 2026-07-30, F68: a running close no longer freezes the host loop; every close semantic unchanged). **A DECLARED close (close-authoring, in build) spawns the same way but through bareloop's own kind executor instead of a per-patient script — same exit-code truth, and a SECOND gap renderer whose trim marker every reader must know about (F90)** |

Everywhere else in this repo's docs, the product word is used. If a doc says `recall`, it
means the verb; if it means the package, it says the package name.
