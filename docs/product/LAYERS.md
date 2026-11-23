# bareloop — the layer map (plain language)

> What this page is: one short map of the flow, the layers, and what happens when things go wrong. Rewritten 2026-10-08. Updated 2026-10-24: cross-run learnings, the thinking rule,
> rubric jobs on pages (page-word map, fit check, asks, Result tab), the launcher.
> Updated 2026-11-15: the one check list (`~` you, `!` agent, `$` default) for rubric and repo jobs; the fit check and calibration are gone (see "One list, one flow").
> Updated 2026-11-23: shape jobs, review-the-code jobs (by whole repo, git `range:` or `branch:`), the one Destination record, and how a repo's own checks are run (one 30-minute limit, once per pass, shared across signing, precheck and resume).
> The PRD is the contract; this is the map. Status diaries live in the PRD and `docs/wiki/FINDINGS.md`, not here.

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
  │  check type = Deterministic (a command decides; every repo job) / Rubric (a judge model
  │  reads, code decides; pages, sheets, docs, and Tickets). Reuse workflow is a button on
  │  every run, not a check type.
  │  a repo job has a Job type: Change code (edits, the branch has the work) or Review code
  │  (writes one .md report, no code edits); see "Review jobs and repo checks" below
  │  a web page can be an input: it is fetched at drafting and again at run start
  │  every job builds ONE check list (~ you, ! agent, $ default); the AI only points, code
  │  proves it against your own words; what code cannot prove is Not checked, with a reason
  │  a question is buttons only (Agree / Drop it); see "One list, one flow" below
  ▼
bareloop checks everything at $0, before any token:
  source and destination are real · after the scout, code checks the Destination (point and
  fence) · the check runs · secrets refused or masked · the
  monthly $ limit has room · a run needs at least one check
  anything code cannot prove shows as "Not checked", never silently
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
                     (a review's report waits under output/ until you Accept, then lands at Destination)
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

"Job" = the job lines, ~ rules, check type, thinking. The run boxes (source/inputs,
destination, model, $ cap, time cap) never make a new workflow. An already-green run counts as
green. The button reads Sign & run only in the green+same row, Start drafting otherwise. Editing
never clears a schedule; a new workflow has no schedule until its own first green. Schedule run /
Cancel / modify schedule only set or adjust a schedule, never run.

### Learnings — lessons across runs (beside Layer 3)

- **Built on:** the run's own record. Layer 3 carries a whole green road; this carries small lessons, red or green: a check that went red and was later fixed (with what the fixing try changed), or one still red at the end.
- **Does:** at the end of every run, plain code (no model anywhere) turns the run's record into cards and folds cards that are the same lesson (same job, same check, same kind of error, mostly the same flagged words) into one row of one ledger. A lesson seen again counts up; seen in 3 jobs on one place it climbs to that place, in 3 places to you. A rubric run's lessons count at run end like any other; its reuse credit still waits for your Accept.
- **Survives:** runs. The ledger keeps every row and deletes none; what gets read is filtered at read time (nothing older than 56 days, nothing from another signed version of the job).
- **Who hears it:** only the planner, at the draft and the first replan, never the worker, and only if `learningHints` is on in `config.json`. It ships **on** (absent = on; only an explicit `false` turns it off); off still keeps the tally. The Audit tab shows exactly what the planner was told.
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

## Notes to the AI (2026-10-31)

Every extra block the AI is handed besides the job text is a "note". There are 13 (the handoff note was folded into the carry memo, `b4e8021`). They split by **scope** (one try / one run / across runs) and **trigger** (when it is sent). Code cites are `src/planrun.js` unless named.

**To workers (step and fix tries)**

| # | Note | What it carries | Sent when | Switch | Where |
|---|---|---|---|---|---|
| 1 | Carry memo (the old handoff note is folded in, `b4e8021`) | files read WITH function line ranges, searches, edits, earlier failures (folded), the start failure (`at start`) | every new try after the first | always on, no switch (hamr 2026-11-01); the `carryNote` config key and a spec's `handoffNote` are ignored | planrun `withCarry`; `src/carrystore.js`, `src/carrynote.js` |
| 2 | Last failure | "Previous attempt failed this step's checks" plus the check output (fix: the verification output) | the try before was red | always | planrun 3535 (step), 4289 (fix) |
| 3 | Cut-off | ran out of turns, or repeated denied calls (the strike reason) | the try before was bounded | always | `boundedNote` planrun 602; used 3539, 4291 |
| 4 | Numbers trend (fix only) | the close's own numbers so far, oldest first (checks passed, stage values) | fix tries | always | planrun 4275-4290 |
| 5 | Step results | final text of each passed step, up to 2,000 chars (`ARTIFACT_MAX`) | an earlier step passed | always | planrun 279, 3533, 4286 |
| 6 | Layer R note | the escalating fixation note | only when Layer R is on (off by default) | `rootInj` | planrun 3522, 3540; 4262-4269, 4292 |

**To the planner**

| # | Note | What it carries | Sent when | Switch | Where |
|---|---|---|---|---|---|
| 7 | Seed note | the job's own failing check at start | first draft only | `seedNote` (job spec, absent = on) | `seedNoteBlock` planrun 357; 1043, 2221, 3168 |
| 8 | Learnings | lessons from earlier runs | draft + first replan | `learningHints` (config.json, absent=on) | `hintsBlock` planrun 351; 3165 |
| 9 | Budget | money and time | every draft | always | `materialsBlock` planrun 333 |
| 10 | Replan brief | why the step stopped (strikes / meter / stall), last exit state, close gap, steps done, money and time left | replan | always | planrun ~3790-3820; `closeGapBlock` 503 |
| 11 | Trend line | "close trend so far" (numbers going up or down) | replan | always | planrun 3831-3833 |
| 12 | Rerun words | what the person asked at the review door | rerun from Accept | always | `doorNoteBlock` planrun 375 |
| 13 | Starting draft | the old passed plan as a start | Reuse | always | `startingDraftBlock` planrun 401 |

Names we use: carry memo, last failure, cut-off, numbers trend, step results, seed note, learnings, replan brief (plus budget, trend line, rerun words, starting draft, Layer R note).

**The fold is BUILT (hamr ruling 2026-10-31: "carry memo + handoff note become one, learnings separate, last failure separate, we split on scope and trigger"; commit `b4e8021`).**

- The handoff note is part of the carry memo: one block, no switch (always on). The memo's files-read lines carry the function line ranges (` · functions: a 1-5, b 7-9`); at the 12,000-character cap the ranges are dropped FIRST, before search lines, earlier tries, failures and diff hunks.
- A job spec's `handoffNote` is legacy: still accepted and hashed (old signed specs verify), never written by new drafts; it has no effect (the memo is always on).
- The `handoff-note` spine record is no longer written; old spines that carry it replay unchanged (nothing reads it).
- Everything else stays separate. Learnings (across runs, planner only) and last failure (stays in the prompt; the memo leaves the last try's failure out only when that try failed; a failure from a try later passed stays) are unchanged.
- Next: one real run, then the memo proof battery (memo on/off, several jobs, prereg signed first).

2026-11-01 - the fold seen live once (run u-mvxjji5a; Fireworks deepseek-v4p1-flash, bigfile, HEAD e931c39, all note switches at product defaults). Step-red, $0.4795, 5 worker asks, 0 handoff-note records, 5 carry-note records (non-first carried reads 3-5, searches 11-27, failures 1-2, up to 7,465 chars, none capped). Caveat: the files-read lines carrying `functions:` ranges (e.g. `src/gate.js`) come from a re-render of the memo over the persisted state plus the run's index, not the delivered bytes (the text is never persisted); the containing class chunk `Gate 579-2212` still sits in the functions list, as in the old handoff note (not new). One run: it shows the fold runs, not that it helps. The memo proof battery is still to do.

---

## One list, one flow (2026-11-15)

Every job has ONE check list. Nothing a screen shows about checks lives outside it. Three kinds of row, each tagged:

- **`~ [you]`**: a rule you wrote on a job line.
- **`! [agent]`**: a check the AI proposed. Only from what it sees (the page, or the repo's own work stages), and only if code can prove it.
- **`$ [default]`**: code's always-on checks: the guards (once per job) and the write fence.

The plan card, the Job tab, the Audit, the Result tab, the CLI print and the close all read this one list. Each row has its own pass or fail. Owner: `src/checkblock.js`; plain wording of `!` stage rows and `$` guard/fence rows: `src/stagewords.js`.

**Same flow for every job kind, no exceptions** (hamr, 2026-11-15). Rubric jobs (page, sheet, doc, Tickets) and repo jobs (Deterministic) both go through the same CheckBlock. Only the TYPE of check differs:

- rubric: facts, phrases and counts, each quoted from the saved page.
- repo: catalogue commands (the test suite, typecheck), plus the write fence.
- shape: when a `~` rule is left Not checked, the AI may propose a field for it; code checks only the SHAPE of each item (text, number, one-of, money, date, time, url, list, boolean), never its truth. A field covers a rule only with a real bound from the rule's own words ("has a title" = at least one character); a negating rule never takes one. Shape lines show on the Result tab as one row per item that opens to its fields. Truth checks come first; a shape check never replaces one that builds.

Repo jobs had a side path first. It was removed because it broke on real drafts: a rule shown kept AND Not checked, reasons swapped between rules, and a false "fence keeps it" on a leftover copy of a file. The fit check, the calibration test and PASS/FAIL examples are gone for the same reason (one place for all checks).

**The law.** The AI only points. Code proves it against your own words. What code cannot prove is **Not checked**, with a reason from code's one table (`REASON`), and you judge it at Accept. Examples: a repo rule "don't edit test/" is kept by the write fence, because the rule names `test/` and that folder is outside the fence. "Be friendly" is Not checked, because no check can prove it.

**Questions are buttons only.**
- A reading question ("I read 'under 500' as 500 US dollars") offers Agree, Drop it, and a box to type the right reading. A typed correction replaces that rule and code proves it again; words code cannot prove go to Not checked.
- A proposed check offers Agree / Drop it. No box.
- A rule whose only answer would be Drop it is not asked. It goes straight to Not checked. Unasked rules do not count toward the 3-question stop.
- The drafter's own try-3 questions and the Destination question still take typed words.

**Changing the list.** On the card: Drop, Add and Suggested rows; the last check on a line is never dropped. To change a rule's words, use Revise on the final card (2 revises, then Start over). One rule in, one rule out: an answer replaces the rule it is about.

**Hidden from the repo file list:** bareloop's own folders `.bareloop/`, `.smoke/`, `.litectx/` (a leftover worktree copy once made the fence "keep" a rule falsely).

**Built since (2026-11-15/16):**
- When the AI's phrase is not in your rule's words, it becomes its own `! [agent]` check (Drop, or Suggested with Add when the phrase is not in your job text either), and your rule stays Not checked. An AI-written fact name is no proof that a phrase or place came from you.
- fwd's draft readout (v0.34.0) is in the Chat above the signed-ready card, and the CLI prints it under SIGNING PREPARED. Display only: not signed, not in the hash, secrets masked, the same rows as the card. YOUR ANSWERS and the Audit's drafting rows say what was decided (agreed, you wrote, dropped), never the question that quotes a replaced rule's old words.

**Proof, honestly.**
- Seen live on 2026-11-15, repo job: "don't edit test/" kept by the fence in 3 of 3 drafts and again after Revise; "package.json" kept after Revise; run walk-sum3 went green. Rubric job: "be friendly please" came out Not checked; run walk-flight1-2.
- Test-proven only, not seen live: the CLI readout, the reading-question correction box, a rule dropped to Not checked without a question (option A), and phone width of the new cards.


---

## Review jobs and repo checks (2026-11-23)

**Job type.** A repo job is *Change code* or *Review code*, one code-owned line read by the card, the readout, the Job tab, the Result tab and the Audit (absent on a rubric job on files). A review uses the rubric road's rules and writes ONE `.md` report; it never edits code. The report is staged under `output/` when the run goes green and lands at Destination only at an honoured Accept. A passed review line records its findings for the Result tab.

**Only part of the repo.** One line in the job can name `range: a..b` (ends may be commits) or `branch: name` (diffed against main). `range:` is review-only. A Change job's `branch:` starts the work branch from that branch's tip. Code writes one diff file per changed file under `output/review-diff/` (never committed); the worker cannot write there, so a diff cannot be faked, and the planner is told what the review covers. More than one token, or an end that is not there, is refused in plain words at the start, before any spend, by both doors.

**One Destination.** Its one home is the `destination` in `source.json`; the card, Job tab, Reuse prefill, schedule words and the signed fence all read it. After the scout, code checks the Destination point and fence; the AI's "inside yes/no" guess is gone.

**A repo's own checks (tests, typecheck).** One 30-minute limit covers an AI-drafted check at every stage: drafting read, signing gates, run-start precheck, final close. Past 5 minutes the panel says once a minute "Tests are still running (N min so far)". The command runs in its own process group and the whole group is killed at the limit, on Abandon, on Stop, and when its owner dies. A timeout is told in plain words from code; a starting check that timed out stops the draft at once.

Each command runs **once per check pass**, however many stages read it:
- signing tries and drafting reads share one result while the seed is unchanged (a stopped run is never shared);
- the run-start precheck and the preflight share one pass;
- a resumed leg takes the last finished result when the files' fingerprint is unchanged. A saved result is only a reading of the files; it never means "already done";
- the original code's baseline for a count stage is measured once per run, across legs.

---

## Who gets what (2026-11-16)

Four parts touch a job. Each sees a different slice. This is the map, grounded in source.

- **The drafter** (before signing, with the person) gets the job box (the lines and the `~` rules) and the page, sheet or doc. It proposes checks. Code checks them. The person looks, drops, adds and signs. What is left is the **signed record**: the rules, and the labels such as `Departure time:`.
- **The planner** (at run start, and again on each replan) gets the signed brief (written by code from the signed record), the scout's notes, the check names, the money and time limits, the learning hints, and on a replan what failed. It writes the steps in its own words. It does NOT get the memo. (`planPrompt`, `src/planrun.js:713`.)
- **The worker** (each step, each fix try) gets only the planner's step text, the folder and the file to write, the memo (code's note of what earlier workers read, edited and failed), and on a retry the check's failure text. It does NOT get the signed brief. (Step ask `src/planrun.js:3671`; fix ask `src/planrun.js:4425`; worker system text `src/planrun.js:2700`.)
- **The check** (code, no AI) gets the signed record and the worker's file. It says green or red.

The picture:

signed record -> planner (brief + example) -> steps -> worker (steps + memo) -> check (signed record)

**New in this change: the "as seen" example.** The worker never sees the signed brief, so the planner's steps are the only way a rule reaches it. One rule did not reach it: when a fact's label sits on a different line than the result's first line (Google Flights writes the price on one line and `Departure time:` on the next), the worker copied only the first line, and the check could not find the label in the quote. So when this happens, the signed record also keeps one "as seen" example: the exact input lines from drafting, from the result's first line down to the label line. The planner gets it right after the signed brief. Its steps then tell the worker to copy whole lines down to the label line. The worker and the check are unchanged. Old specs have no example and run as before.

Evidence: F337 and a $0.60 POC (3 rounds). Worker-side rounds 1 and 2 failed. Planner round 3 passed: page A 4 of 5 green, page B 5 of 5, against 0 of 5 and 2 of 5 today. One page shape (Google Flights), one model (DeepSeek flash), n=5 per cell.

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
| a check runs past 30 minutes | the command's whole process group is killed; a timeout in plain words | failed (a starting check: the draft stops) | you: fix the check, or Reuse |
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

- **The one checklist.** Mom's checklist has three kinds of line: the ones you wrote (`~`), the ones the helper suggested after looking (`!`), and the ones mom always adds herself (`$`: nobody changes the shelf rules, nobody cheats). It is ONE sheet. Every screen reads that sheet. If mom cannot prove a line, she writes "not checked" and says why, and you look at it yourself at the end.

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
| what we learned | `docs/wiki/FINDINGS.md` |
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
| the page-word map | `src/pagemap.js`, `src/pagerules.js` |
| the one check list (rows, questions) | `src/checkblock.js`, `src/stagewords.js`, `src/questionbox.js` |
| web-page inputs | `src/pagefetch.js` |
| review by range or branch | `src/rangereview.js` |
| the worker loop, the gate (fence, budget) | `bare-agent`, `bareguard` |
| `recall` / `get` | `litectx` |
