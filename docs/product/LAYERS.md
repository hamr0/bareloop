# bareloop — the layer map (plain language)

> What this page is: one short map of the flow, the layers, and what happens when things go wrong. Rewritten 2026-10-08.
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
YOU (panel, or the CLI)
  │  describe the job in Chat; the drafter asks a few questions
  ▼
JOB CARD: goal · source · destination · check type · $ cap · time cap · model
  │  check type = Deterministic (a command decides) / Rubric (a judge model reads,
  │  code decides) / Reuse workflow (re-run a job that went green before)
  ▼
bareloop checks everything at $0, before any token:
  source and destination are real · the check runs · rubric: the judge must pass its
  10-case test (calibration) · secrets refused or masked · the monthly $ limit has room
  │
  ▼
YOU SIGN  (the hash covers the job, the check and the caps; any change = sign again)
  │
  ▼
THE RUN, on a copy: a worktree in your repo, or a hidden-git copy of a plain folder
  scout → plan (steps) → each step is a wheel: try → check → gap → retry
     two strikes on a step → replan · the worker never sees money or time
  → THE CLOSE: the signed check, run by bareloop, never by the agent
  │
  ▼
ENDED:  passed · failed · capped · stopped · died
  passed           → your branch has the work (you merge, always) · Reuse workflow
                     (a plain folder gets a dated file in its destination instead)
  not passed       → Edit in chat (fix the job, sign again)
  capped / stopped → Resume (only the $ and time caps can change)
  died             → Resume, if it can
  │
  ▼
NEXT TIME: Reuse workflow runs the same plan again · Export runs it anywhere
```

---

## The architecture: a shell and four layers

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
- **Does:** the next run starts from that road (Reuse workflow, or an exported bundle run elsewhere).
- **Survives:** runs. Green only; a red run inherits nothing, and an already-green run mints nothing.
- **Status:** built and proven safe. Whether reuse actually saves money or time is **not yet proven**.

| layer | wheels | arranged by | survives attempts (within one run) | survives runs |
|---|---|---|---|---|
| **1** | one | human | the gap text + the files on disk | nothing |
| **R** | one | human | + the root: what was tried, what it changed | nothing |
| **2** | many small (the road) | the agent (validator-gated) | root + each step's output feeds the next | nothing |
| **3** | many small | the agent | same as Layer 2 | the road that went green, with receipts |

Layers are build stages, not modes. A user never picks one. The finished product composes all
four inside the one shell.

---

## When something goes wrong

| what happened | what bareloop does | what you see | who decides |
|---|---|---|---|
| a step's check is red | feeds the gap to the next try | running | nobody; the wheel turns |
| two strikes on one step | replans once (a second only if the run is clearly converging) | running | the shell |
| replan cannot help, or no more strikes | stops, keeps the work on disk | failed | you: Edit in chat, or Resume if offered |
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
| **soft-green** | a rubric job. The judge only extracts facts and quotes; code decides pass or fail. Unsure is red. Held out of reuse until you accept at the review door. |
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

The one place implementation names appear:

| layer or part | where it lives |
|---|---|
| the wheel (Layer 1) | `src/ralph.js`, `src/ladder.js` (strikes) |
| the road (Layer 2) | `src/plan.js` (the plan's shape), `src/planrun.js` (scout, steps, replan, close) |
| the root (Layer R) | `src/root.js` |
| reuse (Layer 3) | `src/bridges.js`, `src/reuse.js`; export in `src/bundle.js` |
| the worker loop, the gate (fence, budget) | `bare-agent`, `bareguard` |
| `recall` / `get` | `litectx` |
