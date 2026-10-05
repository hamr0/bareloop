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

## Addendum — 2026-10-02: four more harnesses, and why none is chased

*Sources: **Standard Agents spec** (`standardagentspec.org`), **OpenHuman**
(`github.com/tinyhumansai/openhuman`), **Eve** (`eve.dev`), **TrueForge**
(`github.com/truefoundry/trueforge`) — front pages and READMEs read through a summarizer, not
their code. **"The Future Is Domain-Specific Agents"**, Justin Schroeder (StandardAgents), AI
Engineer conference talk, YouTube `spNAUEgq_A8` — folded from a talk summary, not a transcript.
**Claude Managed Agents** — the overview and define-outcomes docs pages read directly; the
budgets page from a search summary only. **AWS Bedrock AgentCore** and **Microsoft Foundry
Agent Service** — search summaries only. Same rules as above: this is a CONTEXT document, not
evidence, not a finding, not a decision, not a schedule and not a build item. "Not on the page"
is not "does not exist".*

### What each page says

| Harness | What the page says | What it names on spend or verdict |
|---|---|---|
| **Standard Agents** | An open spec for packaging one domain-specific agent: six parts — Model, Prompt, Agent Rules, Tools, Hooks, Endpoints — in TypeScript. Defines handoffs (same thread reassigned to another agent) and subagents (a new child thread). AgentBuilder is their hosted implementation. | The spec page names no budget, stop condition, output verification, evaluation or guardrail. |
| **OpenHuman** | A Rust core with a desktop app, browser UI, terminal client and library; in-process core, not a daemon. Sells memory, integrations ("100+ OAuth · 5k+ MCP · 90k+ Skills"), saved typed workflow graphs on schedules or events, pluggable model providers. GPL-3.0. Its own benchmark: marginal cost of about 1,770–1,985 KiB per extra agent in one process at 50/100/500 agents; 500 separate processes cost about 48 MiB each, so one process is "roughly 25 times denser"; cold agent turn 102 ms. | No spend cap or output verdict named. It lists a "Jev decision model" for "calibrated probability" scoring — **not investigated**; it may be judge-like, unknown. |
| **Eve** | Apache-2.0, beta, "filesystem-first" framework for durable backend agents on Vercel or self-hosted; channels, tools, skills, sandboxes, hooks, schedules. | Already covered by rows #6 and #7 above; the page read today adds nothing against them and names no cap or verdict. |
| **TrueForge** (TrueFoundry) | MIT, about 6k GitHub stars. "The runtime layer that turns an LLM into a working agent." Chat UI, HTTP API + TypeScript SDK, embeddable UI SDK. MCP tools with in-chat OAuth; git-backed `SKILL.md` packs loaded on demand; a sandbox (Daytona) provisioned only when needed, "secrets stay in the harness"; context management by subagents, deferred tool loading, Code Mode, large-result offloading and compaction; human checkpoints (tool approval, ask-user-questions). | Its only quality claim is its own benchmark: "same accuracy, lower cost" versus Claude Managed Agents and deepagents. No budget, spend limit or output verification named. |

### The talk's thesis

Schroeder's frame is **"composition over inheritance"**: instead of one agent carrying a big
prompt, 50+ tools, MCP servers, skills and memory, use a **coordinator on a frontier model**
that delegates in plain language to **small domain agents**, each with its own history, loop,
sandboxed file system and code execution. The claimed benefit beyond cost is a **hard
capability ceiling** — a tool that is not in an agent's sandbox cannot be called. The talk's
numbers are theirs, with no control and no n: ">80% token reduction", "up to 137x cheaper
inference", context per call 500–2,000 tokens versus 10k–50k+.

### The fold

Legend as above. Numbering continues from the table at the top (#10).

| # | Item (theirs) | Status | Where it lands |
|---|---|---|---|
| 11 | **Sub-agent spawning; a coordinator delegating to small domain agents.** | **CONVERGES** on the narrow-worker half, **SKIP** on spawning | The planner plus per-step granted verbs and the write fence already give narrow workers with a hard capability ceiling. Row #2 above (the multi-agent pipeline lost to the single agent) is the counter-evidence to the coordinator shape. OpenHuman's density numbers are memory per agent; bareloop's bill is tokens. **One question is open and unmeasured, not scheduled and not ruled:** whether a read-isolating helper cuts cost-to-green. The Gmail / Notion / travel coordinator picture is fwdloop's shape. |
| 12 | **MCP** — thousands of integrations. | **SKIP** | A bag of new verbs. A verb enters only as a signed spec version with an existing implementation behind it (menu-is-inventory). |
| 13 | **User-authored hooks.** | **SKIP** | Code running beside the arbiter. The gate and the close are the hooks. |
| 14 | **Loadable skills** (`SKILL.md` packs, "90k+ Skills"). | **SKIP** | Unconditional prompt bytes — the dead-weight surface this file already names. Genre templates, strategy lines and bridges are the gated form. Gotcha already above: transmission is not benefit. |
| 15 | **A code-execution sandbox per agent.** | **SKIP** | `run` stays locked. |
| 16 | **Human approval mid-run** (TrueForge tool approval, ask-user-questions). | **SKIP** for bareloop | fwdloop's shape. |
| 17 | **Context tricks** — compaction, large-result offloading, deferred tool loading. | **No action** | Aimed at the same bill bareloop measured (tool results are most of the context). Compaction is already parked because clearing breaks the prompt-cache prefix and the net saving is unmeasured. |

## The correction to carry — the platforms do build arbiter pieces

"Nobody builds the arbiter" is true of the four harness pages above and **not true of the
platforms**. What was read:

- **Claude Managed Agents** (beta; Anthropic runs the loop and sandbox; concepts: Agent,
  Environment, Session, Events; built-in bash, file ops, web search/fetch, MCP). **Read
  directly**, define-outcomes page: an Outcome takes a required markdown rubric; "the harness
  automatically provisions a grader"; "the grader uses a separate context window";
  `max_iterations` is optional, default 3, max 20; results are `satisfied`, `needs_revision`,
  `max_iterations_reached`, `failed`, `interrupted`; the grader's reasoning is opaque. **From a
  search summary only**, budgets page: an optional hard per-session spend ceiling
  (`max_list_cost`, in US cents) set at session creation; the session pauses and goes idle with
  stop reason `budget_reached`; the request in flight still finishes, so cost can land a
  fraction past the cap; changing or removing the budget resumes the session.
- **AWS Bedrock AgentCore** (search summary): modular Runtime, Gateway, Memory, Policy,
  Identity, Observability, Evaluations, Browser, Code Interpreter. Policy checks a requested
  action against rules (Cedar) before allowing it. Evaluations has 13 built-in evaluators
  (helpfulness, tool selection, accuracy).
- **Microsoft Foundry Agent Service** (search summary): hosted runtime; content-safety
  guardrails on every prompt and response; network egress controls (preview); tracing,
  evaluations and automated red-team attacks in a control plane.

**Dated pointer.** This dates HARNESS-TALK-LEARNINGS row #9 ("no budget discipline is named"):
as of 2026-10-02 a platform budget is documented, on the strength of a search summary. That
file is a closed record and is not edited here.

**What the pages read do not show:** a deterministic close first; a calibrated floor under the
rubric grader (HARNESS-TALK-LEARNINGS gotcha #7 stands); tighten-only caps with prior spend
folded in — the budget is reported as changeable or removable to resume. Managed Agents runs on
Anthropic's platform with Claude; bareloop runs locally on any provider it supports. AWS and
Microsoft, on what was read, block calls before and score runs after; neither page shows one
gate that both caps and grades each run. Still **SKIP as infrastructure**, for the standing
reason in row #7 above.

## The read, and its limits

*This part is reasoning, not something read.*

- **Sandbox and arbiter answer different questions.** A sandbox bounds what a run can break. An
  arbiter says whether the work was good and whether it stayed in budget. They stack; neither
  replaces the other.
- **The sandbox is a real guarantee that bareloop does not have.** bareloop is local-trust by
  explicit ruling, the worker keeps network and OS-user permissions, and the blast radius is a
  copied patient on a work branch (row #10 above).
- **A likely reason the harnesses lean on sandboxes:** they hand the agent a shell. Once a
  shell is granted, a sandbox is the only fence left. bareloop keeps `run` locked, so it can
  fence per verb.
- **A likely reason no harness ships a general arbiter:** a harness is the same for every job,
  while "was it good" differs per job. bareloop's scope is jobs that are repeated, long and
  verifiable; much of what these harnesses target (open-ended chat, inbox and calendar work)
  has no clean green. That is fwdloop's open question already recorded above ("what is the
  green?").
- **On the pages read, the guardrail pieces that do exist are scattered:** a rule before a tool
  call, a score after a run, a budget elsewhere, plus whatever each team writes in its own
  hooks, CI and review.
- **Evidence limit:** front pages and summaries. "Everyone ships with no cap or guardrails" is
  **not** supported. "The four harness pages read name none, and leave it to the adopter" is.

### What this addendum does NOT tell you

- **Pages, not code.** The four harnesses were read as front pages and READMEs through a
  summarizer; the platforms partly from search summaries only. Not on the page is not absent.
- **Vendor numbers carry no control.** OpenHuman's density figures, TrueForge's "same accuracy,
  lower cost" and the talk's ">80%" / "137x" / token-per-call figures are theirs, with no
  control and no n.
- **Nothing here is evidence, a finding, or scheduled.** It is not a decision and not a build
  item; nothing goes in FINDINGS.
- **Two questions are open.** What OpenHuman's "Jev decision model" is (not investigated; may be
  judge-like, unknown), and whether a read-isolating helper cuts cost-to-green (unmeasured, not
  scheduled, not ruled).
