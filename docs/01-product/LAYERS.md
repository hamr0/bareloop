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

| verb | what it does |
|---|---|
| `read` | open a file |
| `grep` | search the tree for a string/pattern |
| `write` | change a file (inside the fenced write-scope only) |
| `recall` | ask the project's index "where does X live?" — returns **pointers**, not bodies |
| `get` | trade one pointer for exactly one chunk of code (the function + its doc comment) |
| `run` | **LOCKED, forever.** A worker that can run commands can run its own judge and grade its own exam |

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
Layer 3   INHERITANCE    the road survives runs, with receipts; self-heals    (not built — N3)
Layer 2   MICRO-WHEELS   the road itself: locate → understand → write → verify (designed — plan-v1)
Layer R   THE ROOT       memory that survives attempts inside one run          (built — armed-and-inert, F41)
Layer 1   ONE WHEEL      a single loop over the whole task                     (built; first real firing NOW)
```

### Layer 1 — one wheel
One loop over the entire job: attempt → judge → gap → retry, under one budget. This is the
engine every higher layer is made of. **Status: built; the wheel has turned mechanically
(F32 rerun: gaps delivered across attempts) but CONVERSION — an attempt measurably better
BECAUSE of the gap — has never been observed.** Delivery and conversion are separate axes
(F32); the TESTGEN battery (job #4) is the first conversion firing.

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

> **⚠ Layer 2 TODO — decide the Layer R default.** Layer 2's narrow micro-wheel steps are
> the expected pressure point that finally produces natural fixation (a stuck run). The
> day a Layer 2 job records `root-injected`, run the pre-registered ON-vs-OFF acceptance
> read on it. **That result decides whether the `layerRoot` default flips to `true`
> (ON helps → keep it on) or stays `false` (no lift → keep it off).** Until then the
> default is provisional, not settled. (A cheaper alternative that does NOT need Layer 2:
> a manufactured-fixation probe — force a real worker to repeat and measure whether the
> note breaks the loop; caveat F41 — strong models resist fixating, so the probe may
> struggle to produce its own precondition honestly.)

### Layer 2 — micro-wheels (the road)
The workflow becomes a **sequence of small wheels**, each with one goal and only the verbs
that goal needs (locate gets `grep`/`recall`; write gets `write`; nobody gets `run`). The
agent drafts this road per job; a validator gates the draft before any tokens burn.

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
itself before mom looks — that is Layer 2's job, and it is the one piece of the thesis
not yet observed working.

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
   default (`layerRoot: false`); the field read defers to the first `root-injected`
   spine event. Role stays as F39 sharpened it: continuity, never the semantic-stall fix.
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
   the runJob dispatch — 503 tests, TDD, mutation-spot-checked. Scripted-provider
   evidence only so far: **the rung's acceptance gate is the real-model battery (job #4,
   same close, same frozen 45 bar, read against F39's baseline), which has NOT yet run.**
   **Also owns the Layer R default decision:** the first Layer 2 job that produces natural
   fixation runs the ON-vs-OFF acceptance read, and that result flips `layerRoot` to `true`
   (ON helps) or keeps it `false` (no lift) — see the Layer R ⚠ note above.
   Also carries (F40 latent, PRD v1.18): **each step declares its own deliverable
   target** — today one target path threads to every text-mode step (fine for
   successive gates over one artifact, the only shape job-v1 can express; a clobber
   the day two steps carry distinct deliverables).
4. **Build Layer 3** — inheritance with ledger attribution (N3, kill-switch: rules must
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

---

## Appendix — the ONE place implementation names appear

| product word | implemented by |
|---|---|
| the worker loop (wheel) | `bare-agent` |
| the fence / gate / redaction | `bareguard` |
| `read` / `grep` / `write` | `bare-agent` shell tools |
| `recall` / `get` (the index) | `litectx` |
| the judge (close) | `spawnSync` of the spec's argv — plain child process, exit code = truth |

Everywhere else in this repo's docs, the product word is used. If a doc says `recall`, it
means the verb; if it means the package, it says the package name.
