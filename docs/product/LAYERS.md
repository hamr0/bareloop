# bareloop — the layer map (plain language)

> What this page is: one short map of the flow, the layers, and what happens when things go wrong. Rewritten 2026-10-08. Updated 2026-10-24: cross-run learnings, the thinking rule,
> rubric jobs on pages (page-word map, fit check, asks, Result tab), the launcher.
> The PRD is the contract; this is the map. Status diaries live in the PRD and `docs/logs/FINDINGS.md`, not here.

---

## The idea

You hand over a **job** and a **budget**: *"automate this — I don't know the best workflow."*
The agent designs the workflow **while doing the work**, building the road as it walks it. An
outer judge the agent can never touch decides what counts as done. A workflow that reaches
green is **carried to the next run**, with receipts for which part earned it.

---

## The flow

```
YOU (the panel, started with `bareloop start`; or the CLI)
  │  describe the job in Chat; the drafter asks a few questions
  ▼
JOB CARD: goal · source · destination · check type · $ cap · time cap · model
  │  check type = Deterministic (a command decides) / Rubric (a judge model reads,
  │  code decides). Reuse workflow is a button on every run, not a check type.
  │  a web page can be an input: it is fetched at drafting and again at run start
  │  rubric on a page: the AI maps the page's own words, code keeps only words really
  │  on the page; a fit check asks one question if the page lacks something the job asks;
  │  up to 3 more questions when a rule can't be tied to the page (never a NO)
  ▼
bareloop checks everything at $0, before any token:
  source and destination are real · the check runs · rubric: the judge must pass its
  10-case test (calibration) · secrets refused or masked · the monthly $ limit has room
  anything dropped from a rubric job shows as "Not checked", never silently
  │
  ▼
YOU SIGN  (the hash covers the job, the check and the caps; any change = sign again)
  │
  ▼
THE RUN, on a copy: a worktree in your repo, or a hidden-git copy of a plain folder
  scout → plan (steps) → each step is a wheel: try → check → gap → retry
     two strikes on a step → replan · the worker never sees money or time
     thinking is set by code: planner on · scout off · first try of a step off ·
     retries on · close-fix on (the job's "Thinking on" tick turns every call on)
     learnings ON: the planner (draft + first replan only) reads earlier lessons
  → THE CLOSE: the signed check, run by bareloop, never by the agent
  │
  ▼
ENDED:  passed · failed · capped · stopped · died
  every run, at $0 and with no model: its lessons go into the ledger (see Learnings)
  passed           → your branch has the work (you merge, always) · Reuse workflow
                     (a plain folder gets a dated file in its destination instead)
  not passed       → Reuse workflow (change the job or not, sign again)
  capped / stopped → Resume (only the $ and time caps can change)
  died             → Resume, if it can
  │
  ▼
NEXT TIME: Reuse workflow, the one button on every run: a green run with the same job
           runs its proven plan again with no drafting; anything else drafts · Export runs it
           anywhere · Schedule run only sets a schedule, it never runs
```

---

## The architecture: a shell, four layers and a ledger of lessons

### The shell (not a layer)

The fixed frame around every wheel: the **judge** (the close), the **gap** (the judge's failure
text, fed to the next try), the **cap**, the **fence**, the **ledger**, and **escalation to the
human**. The agent can never touch it. Every layer runs inside it.

### Layer 1 — one wheel (the Ralph loop)

- **Built on:** the "Ralph Wiggum loop": attempt → judge → gap → retry until green or the cap.
- **Does:** one try, one check, the failure fed back verbatim. The unit everything else is made of.
- **Survives:** the gap text and the files on disk. Each attempt starts a fresh conversation.
- **Status:** built, in use.

### Layer R — the root (the notebook)

- **Built on:** the durable root of recursive-LM designs: one persistent state, throwaway sub-contexts.
- **Does:** remembers inside one run what was tried and what it changed, so a try is not repeated.
- **Survives:** the run only; never across runs.
- **Status:** built, **off by default**. Repeating itself has not shown up on any job we measured, so it never won its own on/off test.

### Layer 2 — the road (micro-wheels)

- **Built on:** a depth-1 RLM (recursive language model shape). **Scout** = the root's bounded peek. **Plan** = the decomposition. Each **step** = a leaf call with fresh context, its own small wheel. **Replan** = bounded refinement.
- **Does:** turns one big ask into small steps, each with only the verbs it needs and a mid-run check it can use.
- **Survives:** within a run, each step's output feeds the next. Nothing across runs.
- **The arbiter keeps the control flow:** leaves never spawn leaves, and step bounds and budgets are enforced by the validator, never by the agent.
- **Status:** built and accepted.

### Layer 3 — inheritance (reuse)

- **Built on:** the green record. A road that went green is stored as it was executed, not as it was drafted.
- **Does:** the next run starts from that road (Reuse workflow, or an exported bundle run elsewhere). Reuse workflow is the one door on every run; what it does depends on the run and on whether the job changed:

- **Survives:** runs. Green only; a red run inherits nothing, and an already-green run mints nothing.
- **Status:** built and proven safe. Whether reuse actually saves money or time is **not yet proven**.

| Run | Job | Result | Drafts a new plan? |
|---|---|---|---|
| red | changed | new workflow `<name>-N` | yes |
| red | same | run-N | yes, the old plan failed |
| green | changed | new workflow `<name>-N` | yes |
| green | same | run-N | no, it reuses that run's proven plan |

"Job" = the job lines, ~ rules, ~ PASS/~ FAIL, check type, thinking. The run boxes (source/inputs,
destination, model, $ cap, time cap) never make a new workflow. An already-green run counts as
green. The button reads Sign & run only in the green+same row, Start drafting otherwise. Editing
never clears a schedule; a new workflow has no schedule until its own first green. Schedule run /
Cancel / modify schedule only set or adjust a schedule, never run.

### Learnings — lessons across runs (beside Layer 3)

- **Built on:** the run's own record. Layer 3 carries a whole green road; this carries small lessons, red or green: a check that went red and was later fixed (with what the fixing try changed), or one still red at the end.
- **Does:** at the end of every run, plain code (no model anywhere) turns the run's record into cards and folds cards that are the same lesson (same job, same check, same kind of error, mostly the same flagged words) into one row of one ledger. A lesson seen again counts up; seen in 3 jobs on one place it climbs to that place, in 3 places to you. A rubric run's lessons count at run end like any other; its reuse credit still waits for your Accept.
- **Survives:** runs. The ledger keeps every row and deletes none; what gets read is filtered at read time (nothing older than 56 days, nothing from another signed version of the job).
- **Who hears it:** only the planner, at the draft and the first replan, never the worker, and only if `learningHints` is on in `config.json`. It ships **off**; off still keeps the tally. The Audit tab shows exactly what the planner was told.
- **Status:** built, off by default. Whether the hints help is **not yet proven** (an on/off contrast is the test).

| layer | wheels | arranged by | survives attempts (within one run) | survives runs |
|---|---|---|---|---|
| **1** | one | human | the gap text + the files on disk | nothing |
| **R** | one | human | + the root: what was tried, what it changed | nothing |
| **2** | many small (the road) | the agent (validator-gated) | root + each step's output feeds the next | nothing |
| **3** | many small | the agent | same as Layer 2 | the road that went green, with receipts |
| **learnings** | (beside 3) | plain code | nothing | lessons from any run, counted, only if the planner is allowed to hear them |

Layers are build stages, not modes. A user never picks one. The finished product composes all
four, plus the ledger, inside the one shell.

---

## When something goes wrong

| what happened | what bareloop does | what you see | who decides |
|---|---|---|---|
| a step's check is red | feeds the gap to the next try | running | nobody; the wheel turns |
| two strikes on one step | replans once (a second only if the run is clearly converging) | running | the shell |
| replan cannot help, or no more strikes | stops, keeps the work on disk | failed | you: Reuse workflow, or Resume if offered |
| the signed check is red at the end | a bounded fix loop against the real check | running, then passed or failed | the shell, then you |
| the check itself cannot run (`close-red`) | stops; an instrument fault, not a verdict on the work | failed | you: fix the check, sign again |
| the check ran and said no (`plan-red`) | a judged no from a working check | failed | you |
| money cap | stops; spend so far stays visible | capped | you: Resume with a higher cap (re-sign) |
| time cap | stops; keeps the grade already earned | capped | you: Resume with a higher cap (re-sign) |
| you pressed Stop | stops at the next round boundary; nothing discarded | stopped | you: Resume |
| provider failure, or the model stalls | retries once; a stall outside a step stops | failed | you: retry or Resume |
| the worker crashes | before any write: stops. After writes: counts as a try, the loop goes on | running, or failed | the shell |
| the process is gone | nothing to do | died | you: Resume if offered |

When money and time both run out, the money cap wins. A resume appends to the same run; the
gap between legs is not counted as time.

**A red at the cap goes to the HUMAN, never "up a layer".**

---

## The verdicts

| verdict | meaning |
|---|---|
| **green** | the signed check passed. The only thing that mints reuse. |
| **soft-green** | a rubric job. The judge only extracts facts and quotes; code decides pass or fail. Unsure is red. Held out of reuse until you accept at the review door. The Result tab shows each fact with the page words its check read. |
| **already-green** | passed before any work. Mints nothing and is not reusable. |
| **red** | failed; the gap feeds the next try. |

The review door at the end of a green run (accept, rerun, pause) never changes the verdict.
`hitl` (a human as the verdict) was retired 2026-08-17.

---

## The kid version

A kid builds a LEGO castle. Mom pays for the bricks and decides if it goes on the shelf.
That never changes. Mom is the **shell**.

- **Layer 1 — trying.** Kid builds, mom says "the tower is crooked," kid tries again.
- **Layer R — the notebook.** *"Already tried the blue piece; didn't work."* It lasts one day.
- **Layer 2 — the plan.** Find pieces, sort, walls, tower. Each step is its own try-check-retry. The kid writes the plan; mom does all the checking.
- **Layer 3 — the recipe box.** A finished castle's plan goes in the box. Failed plans never do.

- **The sticky-note board.** After each build, mom jots what went wrong and what fixed it. Before planning the next one, the kid may read the board (if mom turned that on). Only the planner reads it, never the builder.

Two more characters. The **ruler** is a check the kid may use mid-build on one wall. It settles
nothing; mom's inspection is still the only verdict. For rubric jobs, mom has a **reader** who
only points at what the castle says and where, and mom's rulebook decides pass or fail.

The customer says what "done" means. A front-desk helper asks plain questions and fills mom's
pre-printed checklist. Mom signs it. Nothing is built until she does.

---

## Hard lines

- The agent authors its **workflow**, never its **judge**, at every layer.
- **Merge is human, forever.** No self-adjusted budgets, ever. A cap can only be tightened by the agent.
- **Secrets never enter the tree, the logs, or the memory.**
- **A stop at cap is a result**, never something to paper over.
- `run` stays locked: a worker that can run commands can run its own check.

---

## Pointers

| for | read |
|---|---|
| the contract | `docs/product/PRD.md` |
| how to use it | `bareloop.context.md` |
| what we learned | `docs/logs/FINDINGS.md` |
| why it is shaped this way | `docs/product/2026-07-10-agentic-automation-successor-design.md` |
| the panel | `docs/product/PANEL-BUILD.md` |
| the launcher (`bareloop start\|stop\|status\|install`) | `src/launcher.js` |

The one place implementation names appear:

| layer or part | where it lives |
|---|---|
| the wheel (Layer 1) | `src/ralph.js`, `src/ladder.js` (strikes) |
| the road (Layer 2) | `src/plan.js` (the plan's shape), `src/planrun.js` (scout, steps, replan, close) |
| the root (Layer R) | `src/root.js` |
| reuse (Layer 3) | `src/bridges.js`, `src/reuse.js`; export in `src/bundle.js` |
| learnings | `src/learn.js` (cards, fold, climb, hints), `src/learnstore.js` (the ledger, the `learningHints` setting) |
| thinking | `src/thinking.js` |
| the page-word map, fit check | `src/pagemap.js`, `src/pagerules.js`, `src/fitcheck.js` |
| web-page inputs | `src/pagefetch.js` |
| the worker loop, the gate (fence, budget) | `bare-agent`, `bareguard` |
| `recall` / `get` | `litectx` |
