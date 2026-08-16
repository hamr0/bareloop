# Agentic-surface field evidence — Anthropic's harness talk folded against the record

*2026-08-15. Source: **"The evolution of agentic surfaces"**, Gagan Bhat & Isabella Kai He
(Anthropic Applied AI — Claude Managed Agents), YouTube `K0X9QDRkIdg`. This is a CONTEXT
document on the RSI-LEARNINGS pattern: it records what an outside team found and where each
item lands on bareloop's map — as a convergence already paid for, a gotcha to recognise, a
practice to adopt, or a thing deliberately skipped. It changes no doctrine by itself; the one
adopted practice goes through the PRD as a dated addendum (v1.69). Numbers attributed to the
talk are the talk's; numbers attributed to this repo are its own findings.*

## The source

| What it is | What it covers |
|---|---|
| A talk from the team that builds Anthropic's **Managed Agents** — server-hosted agents with a managed sandbox — describing how their harness changed as models got stronger | Harness-as-scaffolding and its decay; **"Outcomes"** (developer rubric + parallel grader agent + retry-until-pass); a durable session log with the context window as a temporary view; a deterministic session state machine with resume; credential vaulting; brain/hands decoupling; **"Dreaming"** (offline batch distillation of session logs into agent memory) |

The interest is that they are a different team, on a different product, with a different
customer — and most of what they describe is the shape this repo arrived at by paying for
findings. Convergence from an independent direction is worth recording; it is not new
evidence for anything bareloop has already measured, and it is not evidence at all for the
things they assert without a control.

## The fold

Legend: **CONVERGES** = they landed independently on something already paid for here; no
doctrine moves. **GOTCHA** = a failure shape their frame does not guard, which this repo's
own findings do. **ADOPT** = a practice taken, with its trigger named. **SKIP** = named and
deliberately not taken, with the reason.

| # | Item (theirs) | Status | Where it lands |
|---|---|---|---|
| 1 | **Harness encodes what the model can't do — and workarounds become dead weight as models improve.** Their case: Sonnet 4.5 "context anxiety" reset logic, which on Opus 4.5 was pure added latency and a cache-killer. | **CONVERGES → ADOPT** | **F41** is the same result from the other end: Layer R's fixation guard was extinct on every current job *before it shipped*, and ships OFF by default. The F40-park retirement is the same move made once by hand (a park whose risk measurement had retired). The adopted practice below turns that into a triggered habit. |
| 2 | **"Outcomes" — outcome-based convergence over step-by-step instructions**: a developer-supplied rubric, a parallel grader agent, retry until it passes. | **CONVERGES** (with a GOTCHA on the rubric, #7) | The close/gap/retry spine, exactly. Also the **Aug-4 shape lottery**: one step over the whole territory with a real check and iterate = 7/7 greens across the archive; per-file decomposition with an early whole-goal check = 0 honest greens ever. Outcome-shaped beats step-shaped, measured here before it was said there. |
| 3 | **The durable session log is ground truth; the context window is a temporary view of it.** | **CONVERGES** | The spine + the append-only ledger. Same sentence, different words. |
| 4 | **A deterministic session state machine** (Idle / Running / Rescheduling / Terminated) **with resume from the log.** | **CONVERGES — bareloop goes further** | Stop-is-the-checkpoint, STEP-level resume, and N4's pause terminals (`hitl-pause` / `hitl-cancel`). The further step is fiscal, not mechanical: **resume folds prior spend and prior time**, so re-invoking can never silently widen a signed cap. A state machine that resumes without folding the wallet is a widening surface. |
| 5 | **Credential vaulting** — the model never sees raw credentials; decryption happens only at execution. | **CONVERGES** | The env-only secrets law, scrub-at-capture inside the shell primitive, and never-argv. Same threat model, arrived at independently. |
| 6 | **Brain/hands decoupling for fault isolation** — the reasoning process and the executing process fail separately. | **CONVERGES (cousin)** | **F67**: a guard inside the process it guards shares that process's fate — hence the outside watchdog. And **F32**: a worker crash *after* gate-audited writes routes as a non-terminal, not as a run-ending instrument stop. Their motivation is fault isolation for latency and reliability; ours is that a shared fate makes a guard useless. |
| 7 | **Rubric-graded Outcomes** — the grader is an agent reading a developer's rubric. | **GOTCHA** | This is the RSI corpus's gotcha verbatim (RSI-LEARNINGS #10): **a rubric close is self-consistency in disguise**, closer to a model agreeing with itself than to an exit code. It needs a **judged floor** — a frozen calibration set, graded correctly first, with itemized reds — before it can gate anything. bareloop's posture is unchanged: deterministic closes first; the judged and human verdict classes are declared-but-locked until that floor exists. |
| 8 | **"Dreaming"** — offline batch distillation of session logs into agent memory; the agent "returns measurably smarter". | **GOTCHA (evidence), CONVERGES (ambition)** | **No control is named.** CL-BENCH's read stands: memory systems LOSE to plain in-context learning once base capability is subtracted — *"a learning claim is just a capability claim wearing a memory costume."* bareloop's Layer 3 kill-switch (paired inheritance-ON vs OFF on the same non-identical job set, plus a memorization audit before any rule inherits) is the bar Dreaming would have to clear. It validates the **ambition** — and the confirmed product goal of the ledger/logs as a cross-workflow trend instrument — never the evidence. |
| 9 | **Retry until satisfied.** | **GOTCHA** | No budget discipline is named around it. This repo's counters are all paid for: **ONE replan** (unlimited replanning launders thrash as adaptation), hard caps that fund the attempt **plus its close** (F45 — a cap binding mid-attempt kills the row before grading), and gap **GENRE** as the thing that actually decides conversion (F38/F39 — mechanical gaps convert, semantic ones stall). "Retry" without those three is a spend surface, not a loop. |
| 10 | **Re-inject historical slices into context** on later turns. | **GOTCHA** | **F36/F39** measured this directly: hand-delivered context buys **zero** conversion — the F39 probe carried the whole notebook by hand and the stall reproduced; hook-fed recall carried the culprit chunk 0/4. What works is worker-INITIATED retrieval from a name the failure itself gave it. Retrieval is navigation, never gifts. |

## The one adopted practice — the model-bump dead-weight replay

**What it is.** On every **worker-model tier change**, run a **$0 archive replay** asking one
question: *which guards, rules and prompt registers in this repo were built for failure modes
the new model no longer produces?* Each candidate is named with the finding that minted it and
the evidence that would retire it, and then **parked for hamr's word** — never deleted on
assertion, and never deleted because a talk said models got better.

**Why it is worth adopting.** Their Sonnet-4.5-to-Opus-4.5 case is the general form of F41: a
guard built against a real, measured failure becomes latency, cost and cache damage once the
failure stops happening — and nothing in a healthy system ever *tells* you it stopped. F41
found it by accident (an archive sweep run for another purpose); this makes it a triggered
habit rather than luck. bareloop carries plenty of candidates by construction: the fixation
detector already ships OFF, the strike ladder was tuned on archived ladders, the mailbox rule
and the exit-freedom law were both minted against specific model behaviours.

**What it costs.** Nothing. The trigger is the **bump**, not a build — the replay reads
archived spines, gate audits and ladders, calls no model, and its mechanics are the standing
no-paid-fire-before-archive-read rule's. The current pin is `claude-sonnet-5` as the worker
tier; the next time that moves, this runs before the first paid row.

**What it is NOT.** Not a licence to delete a guard because a model looks stronger. A guard
retires on a measurement or on hamr's word, in that order — the same bar the F40 park's
retirement met (900 spiked cases, 0 divergences, the comparison itself proven divergeable).

## Skipped, with reasons

- **Brain/hands latency parallelism.** Their split buys overlap between reasoning and
  execution. bareloop runs are token-dominated — process startup is noise against a round —
  so the parallelism has nothing to hide here. The *fault-isolation* half is already held by
  F67 and F32 (#6 above); only the latency motivation is skipped.
- **Sandbox / VPC machinery.** bareloop is local-trust by explicit ruling, with the
  limitations documented rather than papered: worker code keeps network and OS-user
  permissions; the blast radius is a copied patient on a work branch, not a container. Their
  managed sandbox solves a multi-tenant problem this product does not have.
- **Managed Agents as infrastructure.** bareloop **is** the arbiter layer. Outsourcing loop
  governance — who retries, who stops, who holds the wallet — outsources the product. The
  hard line is unchanged: the agent authors its workflow and never its arbiter.

## Second read — 2026-08-16 (the full transcript, and what the first pass did not carry)

*The fold above was written from the talk's first read. This section records a second pass over
the **full transcript** (`evolution_of_agentic_surfaces_transcript_and_guide.txt`, the same talk).
It adds two rows, and then states plainly that the rest of the transcript is already accounted
for — so the second read is visibly **complete**, not another partial slice. The rules do not
change: nothing here is evidence, and nothing here moves a bar by itself. One new legend entry:
**ADOPT-LATER** = worth taking, but the rung that would consume it is not open — recorded with the
rung named, not scheduled and not built.*

| # | Item (theirs) | Status | Where it lands |
|---|---|---|---|
| 11 | **An outbound network allow-list on their Environment primitive.** Their sandbox is configured to run "with the networking limited and allowed hosts only" — the single allowed host being the MCP server it must reach — and the stated purpose is that the environment "effectively stops Claude from doing things that you didn't intend." | **ADOPT-LATER — assess at the EXPORT-ARTIFACT rung** | This is the **network mirror of bareloop's write fence**: the fence bounds what a run may write, an allow-list bounds where it may talk. **Locally it is irrelevant by standing ruling** — bareloop is local-trust, the blast radius is a copied patient on a work branch, and worker code keeps network and OS-user permissions with that limitation documented rather than papered. It stops being irrelevant at **export**: a bundle running headless on a foreign machine, under an operator who did not author the job, is a different threat model from a workbench run on hamr's own box. Recorded as a **question for the export rung** — *should the exported bundle's environment carry an outbound allow-list?* — not as a decision, not as work, and not as a change to the local posture. |
| 12 | **Organizational-scale memory**, named as a third memory tier beyond per-user memory and Dreaming's self-improvement: a store that "illustrates and stores the team's runbooks and details", which they call an initial direction rather than a shipped thing. | **CONVERGES — no action** | Straight confirmation of bareloop's already-signed product goal: the **ledger and logs as a cross-workflow trend instrument**. Nothing to adopt and nothing to change — it is the same destination, named by a team that has not arrived at it either. The Layer 3 kill-switch bar governs it exactly as it governs Dreaming (#8): paired ON/OFF on the same non-identical job set, plus a memorization audit, before anything inherits. |

**Everything else in the full transcript is already accounted for.** The just-in-time sandbox
spin-up, the P95/P99 time-to-first-token latency case for decoupling, MCP tunnels (private-network
MCP servers reached over outbound-only connections), reusable environment and agent definitions as
durable resources, the session observability dashboard, and the closing framing that harnesses
"have become the limiting factor to what models can achieve" — each is either already folded above
(#1–#10) or falls under a standing skip: **latency parallelism** (skipped — bareloop runs are
token-dominated, process startup is noise against a round), **sandbox/VPC machinery** (skipped —
local-trust by explicit ruling), and **managed agents as infrastructure** (skipped — bareloop *is*
the arbiter layer). The sandbox skip stands for the container machinery; #11 deliberately splits
its **network-boundary half** out of that skip and sends it to the export rung, because that half
survives the local-trust ruling where the container half does not. No other line of the transcript
earned a row.

## What this does NOT tell you

- **It is a talk, not a paper.** No numbers here were replicated, none carry an n, and the
  Dreaming claim carries no control at all. Nothing in this document is admissible as evidence
  for a bareloop decision; the convergences are corroboration of doctrine already paid for,
  and the gotchas are this repo's own findings recognised in someone else's frame.
- **Nothing here belongs in FINDINGS.** Findings in this repo are grounded in its own runs and
  logs. This is external context, on the precedent RSI-LEARNINGS set.
- **The adopted practice is unfired.** The model-bump replay has a trigger and no result. When
  it first runs, what it finds is a finding — and belongs there, not here.
- **The ADOPT-LATER item is undecided, not deferred-and-agreed.** #11 records a question for the
  export rung; whether an exported bundle gets a network fence is hamr's call at that rung, and
  the local posture (local-trust, documented limitations) is unchanged by recording it.
