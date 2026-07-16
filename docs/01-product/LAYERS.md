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
Layer R   THE ROOT       memory that survives attempts inside one run          (not built — next)
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

## Hard lines (unchanged, restated)

- The agent authors its **workflow**, never its **judge** — at every layer.
- **Merge is human, forever.** No self-adjusted budgets, ever.
- **Secrets never enter the tree, the logs, or the memory** — an append-only log that
  captures a key captures it forever.
- **A stop at cap is a result**, never something to paper over.

---

## Where we are, and the build order

1. **Fire Layer 1 once, for real** — job #4 (TESTGEN: write a killing test suite for an
   untested 2,455-line module; the judge is mutation kill-rate). Jobs #2/#3 could not
   host the firing (discarded / saturated at attempt-1 greens, F34); job #4 manufactures
   the guaranteed attempt-1 red (23/23 one-shots red across four conditions, F37). The
   battery = the firing; it reads ONE thing: does kill-rate climb attempt-over-attempt.
2. **Build Layer R** — the root, so attempts stop repeating themselves.
3. **Build Layer 2** — the micro-wheel road (plan-v1), with the stage-verdict rule above.
4. **Build Layer 3** — inheritance with ledger attribution (N3, kill-switch: rules must
   transmit across non-identical runs).

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
