# "Agents are just files" — the Eve / Interactions-API talks folded against the record

*2026-09-18. Sources: **"How We Solved Agent Building"**, Andrew Qu (Vercel), YouTube
`gxVZ_1tuuq4`; **"Agents Without Code: Skills, YAML, and Filesystems Replaced Python"**,
Philipp Schmid (Google DeepMind), YouTube `fjF8EKnxKCU`. Folded from talk summaries, not
from full transcripts — a second read may add rows, on the HARNESS-TALK-LEARNINGS precedent.
This is a CONTEXT document: it records what two outside teams found and where each item lands
on bareloop's and fwdloop's map. It changes no doctrine by itself and nothing here is
admissible as evidence for a bareloop decision.*

## The sources

| What | What it covers |
|---|---|
| **Vercel / Eve.** An internal data-science agent ("D0") walked through four architectures — mega-prompt → multi-agent pipeline → single agent with 100 max steps → filesystem agent in a cloud sandbox — then generalised into **Eve**, a convention-based agent framework (`/skills`, `/tools`, `/channels`, `/instructions`) on Vercel Workflows. | Filesystem-as-agent-substrate; eval score **doubling** on the sandbox move; **skill distillation** from successful runs; durability, sandboxing, observability as platform. |
| **Google / Interactions API.** A GitHub PR-review agent refactored three times, deleting code each pass: raw Python loop → framework (ADK) → remote sandbox with `bash` + filesystem + `gh` CLI and behaviour in `agents.md` / `skills.md`. | Step-based timeline instead of user/model turns; credential injection by network proxy; **"build to delete"** — if harness complexity grows as models improve, you are over-engineering. |

## The fold

Legend as in HARNESS-TALK-LEARNINGS: **CONVERGES** = landed independently on something already
paid for here. **GOTCHA** = a failure shape their frame does not guard. **ADOPT** = taken, with
its trigger. **SKIP** = named and deliberately not taken.

| # | Item (theirs) | Status | Where it lands |
|---|---|---|---|
| 1 | **Filesystem + a few atomic tools beats bespoke per-task tools.** Eval scores doubled on the move. | **CONVERGES** | bareloop's menu-is-inventory law and the fixed-kind declaration: a small enumerated verb set over a real tree, not hand-built task tools. Their number is theirs; the shape is the same shape. |
| 2 | **Multi-agent pipeline lost to a single agent** — summaries between stages stripped the details the next stage needed. | **CONVERGES** | The Aug-4 **shape lottery**: per-file decomposition with an early whole-goal check = 0 honest greens ever; one step over the whole territory with a real check and iterate = 7/7. Measured here before it was said there. |
| 3 | **"Build to delete"** — harness complexity that grows as models improve is an anti-pattern. | **CONVERGES → the standing model-bump replay** | F41 and PRD v1.69's dead-weight replay say exactly this, with a trigger attached (a worker-model tier change) rather than as a slogan. The expansion of what it means for bareloop is the section below. |
| 4 | **Behaviour lives in markdown** (`agents.md`, `skills.md`), not in code. | **CONVERGES, with the hard line intact** | bareloop already forbids agent-authored code — the agent emits a constrained, validated **declaration**. The difference is direction: their markdown is *unvalidated* and can say anything; bareloop's declaration is schema-bounded, and locked kinds/verbs/closes are **inexpressible**, not merely rejected. |
| 5 | **Credentials injected by a network proxy; the LLM never sees a key.** | **CONVERGES** | Env-only secrets law, scrub-at-capture in the shell primitive, never-argv. Same threat model. |
| 6 | **Skill distillation** — background jobs read successful runs and write reusable skills. | **GOTCHA (evidence), CONVERGES (ambition)** | See the section below. Their selector is "successful-looking run"; bareloop's is a minted green with ledger attribution. Same gotcha as the harness talk's "Dreaming" (#8 there): **no control is named**, and CL-BENCH's read stands — a learning claim is a capability claim wearing a memory costume. |
| 7 | **Eve as a framework**: durability, sandboxing, observability, connections out of the box. | **SKIP (as infrastructure), WATCH (as competition)** | bareloop **is** the arbiter layer; outsourcing who retries, who stops and who holds the wallet outsources the product. Eve is a way to *build* an agent; it does not say whether the work was good. The two stack; they are not the same product. |
| 8 | **Step-based timeline** (input → reasoning → call → result) instead of user/model turns. | **CONVERGES** | The spine: an append-only event log as ground truth, with the context window a temporary view of it. Their `steps` is bareloop's round record with a different name. |
| 9 | **"Let the model reason, stop micromanaging execution."** | **CONVERGES, with a bound** | Positive-scope confinement and the rails-versus-freedom rule (add rules only while the payoff is measured). The bound they do not state: freedom over *actions* is the thing being loosened — freedom over the **arbiter** is never on that dial. |
| 10 | **Cloud sandbox as the execution environment.** | **SKIP (standing)** | Local-trust by explicit ruling, blast radius = a copied patient on a work branch, limitations documented rather than papered. The network-boundary half of this is already recorded as an export-rung question (HARNESS-TALK-LEARNINGS #11). |

## Expanding the risk — what "build to delete" actually threatens here

The thesis is real, but the first cut of this section got the split wrong, and the correction
matters. The wrong split was "capability scaffolding vs trust scaffolding". The right split is
**always-on bytes vs trigger-gated machinery** — because most of bareloop's reactive machinery
**retires itself** as models improve, without anyone deleting anything.

**Self-retiring — the design already handles this (no action).** The strike/replan ladder fires
on two strikes. The revise ladder fires on a broken close. `SCOUT_ATTEMPTS` fires on a typed
empty result. Layer R's fixation detector ships OFF. The read shim is armed or not. **None of
these run on a healthy loop.** A stronger model trips them less, so their cost falls toward
zero on its own — which was the point of making them reactive rather than unconditional. They
are not dead weight and they do not need a retirement plan. Listing them as decay candidates
was a category error.

**Genuinely always-on — this is the real dead-weight surface.** What costs on *every* run
regardless of model strength is anything unconditional in the draft prompt or draft pipeline:

- **Prompt registers** — the no-shell law register, strategy/persona lines, shape steering.
  Every draft pays these in tokens whether or not the model needed telling.
- **Genre templates** and the **mechanical file listing** at draft time — both built as cures
  for specific authoring failures, both paid unconditionally.

These are the ones the model-bump replay should actually be aimed at: **the bytes a healthy
run still pays for.**

**The second residual — a trigger that fires when it shouldn't.** A reactive guard is free
when idle but not free when wrong. A stronger model that would have solved something on the
third attempt still gets yanked into a replan at two strikes. Every one of these thresholds is
**tighten-only** by law, so nothing loosens on its own as models improve. That is the correct
posture for an arbiter-adjacent number, and it means the false-fire question is **hamr's to
re-ask at a model bump**, never the loop's to relax.

**And the half that never moves at all.** The gate, the money cap, the wall clock, prior-spend
folding, the close and the only-the-close-is-truth law, the write fence, the work-branch rule,
the spec signature, merge-stays-human, verdict-gated inheritance with ledger attribution. These
are not compensating for a weak model. They compensate for the fact that the thing being graded
is also the thing that wants to pass. A better model is not an argument about who holds the
wallet.

**So the honest read:** "build to delete" lands on a much smaller surface here than the talks
imply, because the reactive design already absorbs most of it. What it leaves is two narrow
questions for a model bump — *which unconditional prompt bytes are still earning their keep*,
and *which thresholds now fire too early* — plus the standing failure mode that is worse than
either: **a session adding a rule because a run looked wobbly, with no measurement and no
trigger that would ever retire it.** PRD §8a and the replay are the guards.

## Skill distillation — and why it matters more to fwdloop than to bareloop

**What they do.** Recurring background jobs read successful agent runs, extract common
execution patterns, and write them into a `/skills` folder. New runs start with domain context
instead of from scratch. Vercel reports this as how D0 absorbs thousands of requests a day.

**What bareloop already has.** Layer 3 reuse: verdict-gated, run-as-executed inheritance with
ledger-counted attribution, whole-plan-verbatim bridges, demotion only on `escalated`,
judged/human greens quarantined from credit. The gate on what may inherit is **stricter than
theirs by construction** — theirs selects on a run that looked successful, bareloop's selects
on a green the arbiter minted.

**The three gotchas any distillation must clear**, all already paid for here:

1. **The selector must be a verdict, not a vibe.** A run that did not crash is not a run that
   worked. Only the close is truth.
2. **Transmission is not benefit.** Lineage can arrive intact and add nothing — a cold planner
   may already supply the same method and targets. One green proves reuse *safe and legal*,
   never *beneficial*; a lift claim needs an ON/OFF contrast on the same non-identical job set.
3. **Same job means same SHAPE, never same instance** — otherwise the skills folder is a
   memorization-auditable lookup table wearing a learning costume. A memorization audit comes
   before any rule inherits.

**Why fwdloop is the better home for it.** bareloop's jobs are one-shot shapes with a
deterministic or judged close — its inheritance has a clean gate and a small surface. fwdloop
is the daily grind: humans in the job, chat, multi-turn, the same kind of request arriving
over and over from the same people. That is **exactly the population Vercel's D0 describes**,
and it is where a skills folder pays — the repetition is real, the domain context is stable,
and the marginal cost of re-deriving it every session is paid every day.

The open question fwdloop must answer before building it, in one line: **what is the green?**
bareloop distils from a minted verdict. fwdloop's runs end with a human who either used the
answer or did not. Until there is a signal with that role — an accepted turn, a shipped
artifact, an explicit thumbs-up, something with a *record* — fwdloop's distillation would be
selecting on vibes, which is gotcha #1 verbatim. **Recorded as a question for fwdloop's design,
not as work and not as a decision.**

## What this does NOT tell you

- **These are talks, not papers.** No n, no control, nothing replicated. The eval-doubling and
  the distillation claim both carry zero control. Corroboration of doctrine already paid for —
  never evidence.
- **Nothing here belongs in FINDINGS.** External context, on the RSI-LEARNINGS /
  HARNESS-TALK-LEARNINGS precedent.
- **Nothing here is scheduled.** The dead-weight candidate list above is a list, parked for
  hamr; a guard retires on a measurement or on his word, in that order. The fwdloop question is
  a question.
- **Folded from summaries.** A full-transcript second read may add rows, as it did for the
  harness talk.
