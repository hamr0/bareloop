---
type: reference
title: "Product surface — panel, CLI, export"
status: stable
sources: [docs/archive/PRD.md]
---

# Product Surface

The panel, web CLI, primitive menu disclosure, tier policy UI, and the exported artifact —
what a user sees, drives, and ultimately takes away from bareloop.

## The panel

The panel is the face of the product (decision #7): define a job (description, checkpoints +
verdict classes, budget, cadence, worker/provider), watch runs (chat including HITL prompts;
a grid by generation × verdict; a detail view backed by the spine stream), and see the trust
surface — "what has this lineage learned" — current rules, each carrying the minting green
plus the contrast evidence that attributed it (PRD.md:92-101).

API-first providers ship first; local LLMs are deferred (PRD.md:92-101).

### Timing: headless first

The web UI is deferred until the loop closes headless — spine-first, so the UI is always a
pure observer of the spine plus a command passthrough, never a component the CLI can't
match (PRD.md:92-101, 878-885, 921-926). "Headless first, UI when the spine is good" was
fixed at N6 as of the earliest interview and has not moved since (PRD.md:156-161, 921-926).
When it lands it is mobile-responsive by default: HITL confirms and run-watching happen from
a phone as much as a desktop (house rule) (PRD.md:92-101, 899-901).

### Layout — two panes

- **Left: chat.** System↔operator conversation, HITL prompts/confirms, and result
  announcements — each announcement links into the results pane; results never live only in
  scrollback. At the bottom sits the **command bar**, the web CLI (below) (PRD.md:158-163,
  889-894).
- **Right, top: progress.** Current step, cost so far vs. the run's hard cap, run/generation
  state (PRD.md:895-896).
- **Right, bottom: results.** Artifact cards, newest first — e.g. job #1's PR link + diff
  stat + suite verdict, or a posting job's posted URL: whatever the job's closes produce
  (PRD.md:897-898).
- **Mobile** stacks: progress strip → chat → results behind a tap (PRD.md:899-901).
- A third view — the **context-graph** — is reserved but eventual: litectx already ships the
  primitive (`ContextGraph`, `litectx/src/contextgraph.js`), whose `observe()` proxy records
  every CE verb call live, with `.json()`/`.mermaid()` output. The panel's third view
  consumes those traces plus the spine to draw the whole workflow (runs, retries, verdicts,
  rule lineage) — visual only, not load-bearing, and the slot may not be squatted on by
  anything in the two-pane layout (PRD.md:158-161, 912-919).

Two standing invariants govern the whole panel: it is a **pure observer of the spine plus a
command passthrough** (it can never do something the CLI can't), and it is **dead simple**.
Unlike the locked PRD core, the panel spec is explicitly provisional — it may change or
simplify as development teaches, with dated notes recording real-use changes
(PRD.md:878-885).

## Web CLI

The web CLI is the panel's command bar: it speaks the exact verbs of the headless CLI (create
job, run, pause, show rules, tail spine) as one implementation, with the panel acting as a
passthrough. It must not disturb the two-pane layout (PRD.md:158-163, 889-894).

## Primitive menu disclosure

**Full disclosure from day 1, per-job admission gates what's callable.** The full surface of
all five bare-suite packages (bareagent, bareguard, litectx, barebrowse, baremobile) is
disclosed from day 1 — disclosure ≠ admission. Per-job admission then gates what's callable:
job #1 admits litectx/bareguard/bareagent verbs while barebrowse/baremobile stay
listed-but-locked. Disclosure is cheap, not free — every listed primitive is a line in the
author's context and a surface it can request-red against, and that cost buys a diagnostic
signal (a request-red against barebrowse on a repo job reveals CI-checking instinct or
confusion) (PRD.md:164-171).

Two blocked-red categories are never collapsed, since they resolve differently:
- **locked-but-exists** → request-red → registry admission, purely in-loop, no upstream PR.
- **missing/broken** → upstream-gap red → fixed in the bare suite itself (fix-and-consume in
  the same session, version bump in bareloop), never a local shim in bareloop;
  `docs/UPSTREAM-ASKS.md` queues this red only (PRD.md:172-178).

### Graduated disclosure — resolved

An open question at v1.1 — whether a base "spine primitives" set stays always-on with extras
disclosed for fine-tuning once a workflow greens — was assigned out to adaptlearn as a
successor-POC probe (M3 discipline: minimal-menu vs. menu+1-plausibly-load-bearing-extra,
measurable separation required before bareloop builds the request-red registry)
(PRD.md:179-190, 192-201).

The probe returned and the question is **RESOLVED** (adaptlearn F21 menu-breadth + F22 menu-
disclosure, consumed as bareloop F2):

1. **The request-red registry gate is MET and builds (~N3/N4).** F21 showed the menu axis is
   wired-in categorically (one admitted verb flipped 0/3 cap-halt → 3/3 green@1 where it had
   purchase, inert where not); F22 P4 proved the admission chain end-to-end (author reads menu
   → selects → dispatch injects → green@1). Full disclosure stands, now evidence-backed; the
   catalog-leak concern is unsupported (PRD.md:227-237).
2. **Author selection carries zero need signal — curation is never by agent appetite.** The
   selection asymmetry (F2) is zero false negatives, total false positives: picks are a
   superset of need. This is safe because the bias points the friendly way — over-grabbing is
   cheap and self-corrects under cost-ranking, while under-grabbing was fatal (0/3 at cap).
   The menu's value lives on the cost axis (first-try certainty, ~4× iterations)
   (PRD.md:238-243).
3. **Curation rules.** Secondary tier is locked by default; admission is steered by within-run
   request-red frequency (a locked-but-selected op fires every iteration — free, structured,
   stronger than authoring-time asks, which did not replicate as need-weighted) plus outcome
   contrast (green@1 vs. grind vs. cap). Post-green menu expansion is an across-runs one-knob
   mutation; removal is symmetric. Re-admission is by finding, never by widening
   (PRD.md:244-249).
4. A companion mechanism claim (F21: partial retrieval poisons gap attribution) was **retired
   2026-07-12** (adaptlearn F23, bareloop F3) after failing replication under the fixed
   instrument. The admission conclusion itself survives, re-grounded: structural-exhaustive
   verbs earn admission by delivering the whole constraint set at once (convergence@1, wide
   6/6 vs. narrow 0/9 pooled), not by preventing misattribution (PRD.md:250-259).
5. N2 filed two instrument requirements from the F21 probe: an **artifact-red** category (a
   non-code artifact reds on its own axis, never corrupting the close signal) and
   fence-robust artifact extraction; until then N0's `interpret.js` deliberately carries the
   reference bound (PRD.md:260-263).

### Menu presentation in the panel

The menu breaks primitives under **recall / compress / stash / remember** — the
adaptlearn-proven spine set, one verb per litectx primitive (Select → recall, Compress →
compress, Isolate → stash, Write → remember) — for easy categorization. This is explicitly
provisional. Where non-CE verbs (barebrowse, baremobile, bareagent, bareguard surfaces) sit is
an open detail, by package until the scheme evolves. Locked-but-listed primitives render
visibly distinct from admitted ones (PRD.md:902-910).

## Tier policy UI

Tier policy is itself a product surface (direction recorded, design deferred to its rung — the
reuse rung for the bridge half, panel rung N6 for the UI half) (PRD.md:2204-2207).

- **Tier names are product vocabulary, not model ids.** The plan schema's `STEP_MODELS`
  already offers tiers; the tier→model mapping is the runner's, per provider. Vocabulary is
  low/medium/high (today low=haiku, medium=sonnet, high=opus-class, operator-assigned only).
  As of a later addendum (v1.51 §1, 2026-08-06) the agent-selectable menu narrowed to medium
  only, as a reversible attribution probe — the tier vocabulary itself is unaffected, only
  which tiers the menu currently offers (PRD.md:2209-2215).
- **Per-provider auto-detection.** When a provider beyond Anthropic is wired, the runner
  should detect that provider's small/medium/high models from its own catalog rather than
  hardcoding ids; the tier menu stays identical for the agent, only the runner's mapping table
  is provider-aware (detection is runner/operator territory — the agent still only ever names
  a tier) (PRD.md:2216-2220).
- **The efficiency goal:** a bridge is authored at medium-or-above (the v1.36 floor) and
  executed as cheaply as the evidence allows. Tier demotion of proven bridge steps is
  evidence-gated and operator-signed; escalation on drift follows the existing
  exhaustion→replan route (PRD.md:2221-2225).
- **User choice at the UI (later):** the signing card offers tier PAIRS — planning/execution,
  e.g. medium/low · medium/medium · medium/high · high/high. The planning side never drops
  below the v1.36 floor, and high tiers remain an explicit, cost-visible user choice, never a
  default (PRD.md:2226-2230).

## The exported artifact

hamr's answers on what bareloop ships to a user (recorded 2026-08-02): this changes no
doctrine, only names the delivery form the doctrine has to survive (PRD.md:2550-2553).

### The local app is a workbench; the product is what leaves it

The UI is where a user experiments with a job, graduates a workflow (a green mints a bridge; a
green on a second distinct patient proves it — D6), and then exports it. The value the user
keeps is the exported artifact, not the session that produced it (PRD.md:2555-2559).

### The export bundle is a dependency, never a code generator

The bundle is: the signed spec + the bridge + the close scripts + a thin runner that has
bareloop as a dependency (pulling bare-agent/bareguard/litectx transitively). It runs
headless, as an enclosed CLI, and surfaces the SAME operator questions at the CLI that it
would in the UI — the approval hash, the envelope, the verdict class. The questions don't
disappear because the UI did; they change surface. A bundle that ran without asking them would
be a different product (PRD.md:2561-2569).

### Export is not eject — because of the arbiter

bareloop never generates standalone loop code. An ejected loop would be a forked arbiter: a
downstream copy of the close, budget and fence that can drift from the library's own and can
be edited by whoever holds the copy — defeating the hard line (the agent never authors its
arbiter; merge stays human forever) by distribution instead of by authorship. So the arbiter
**relocates with the bundle and never disappears**: wherever the bundle runs, budgets, caps,
verdicts and merge live outside the emergent part, in the dependency, exactly as they do
locally (PRD.md:2571-2581).

### Verdict classes: declared now, green-only until built

The export contract declares the verdict class, but v1 admits green only. `soft-green` and
`hitl` were deleted with the legacy `steps[]` path (v1.32); their return is the verdict-classes
rung, and `soft-green` still needs the RSI judged-floor analog before it can gate anything.
Declaring the field now keeps the bundle's shape stable across that rung rather than forcing a
later contract change (PRD.md:2583-2589).

### Sequencing

soft-green + hitl come immediately after Layer 3 closes — ahead of genre-widening and ahead of
the UI. Genre-widening (the second-genre question, F51–F55) and the workbench UI both queue
behind the verdict-classes rung (PRD.md:2591-2596).

## Adjacent surface: the CLI-subscription lane (named, not built)

A related but distinct surface was named 2026-08-14 as a **docs-only** experiment, sequenced
next round after N4 — nothing built, nothing fired, no verdict reversed (PRD.md:4707-4711).

**The trigger was a market read** (Scape, a closed-source macOS orchestrator driving the
operator's own installed CLI binaries as subprocesses): driving the official CLI binary is a
legal, truthful subscription-riding path, the same shape bareloop had already built and parked
as clipipe (PRD.md:4713-4720).

**The premise, stated so it can be wrong:** F48 (2026-07-23) demoted clipipe from API peer to
babysat $0-marginal fallback on three grounds, replayed here as half-stale:
- Read-blinding was fixed the same week (`NATIVE_READ_CAP`: 24KB slice + steering notice;
  writes went 0→7 on the affected patient) — not an open ground (PRD.md:4726-4730).
- The 0/2-vs-3/3 acting-row gap was the F39 semantic stall, and every cure for it (Layer 2
  check-loops, strike ladder, mailbox rule, exit-freedom law, shape-lottery gates) landed
  after F48 on the API surface only — the native lane has never run with any of them. This
  half of F48 is a verdict on machinery that no longer exists (PRD.md:4731-4735).
- No within-run resume, no session reliability, ~2.5–5× slower remain **still true** — a
  governance/throughput ground that survives the experiment either way (PRD.md:4736-4738).

**The experiment itself** pairs `anthropic-api` vs. `clipipe-subscription` on the same job,
small N, gated by the standing no-paid-fire rule: a $0 archive read replays every archived
native casualty's actual recorded cause against the since-landed fix list first, and can kill
or reshape the experiment at $0 — the same instrument that already retired two builds (F63,
F88). Notional cost governs like billed cost ("cost is cost"); `clipipe-subscription` remains
a distinct provider condition whose budget never pools with `anthropic-api`
(PRD.md:4740-4752).

**Step zero** is profile hygiene via `CLAUDE_CONFIG_DIR` — a dedicated, frozen bareloop
profile isolates the worker from the operator's own hooks/memory/settings (the LC-2 phantom's
confound class), is pinnable/hashable into resolved-spec signing, allows parallel workers, and
leaves the operator's real `~/.claude` untouched. Its limit is unpapered: this fixes only the
config half — the binary's own harness (system prompt, compaction, turn caps, result
truncation, unpriced rounds) is untouched, so F48's reliability grounds stand regardless. No
upstream ask is filed by this addendum (PRD.md:4754-4770).

**Sequencing** puts this next round, after N4, on three grounds: one lever at a time (N4 is
mid-flight with a green POC); N4 itself produces the ideal hitl-class, re-runnable test bed;
and the $0 gate needs no round slot, costing the experiment only calendar time
(PRD.md:4772-4785).

**Not decided:** no revival verdict is pre-judged (re-confirming F48 is a valid, wanted
outcome); no budget is set (funding is arbiter territory, signed only when it fires); and
Scape's own design (its watchdog auto-approvals let an agent author its own arbiter, with no
close and no learning loop) is context, not adopted — only the mechanism read transfers
(PRD.md:4786-4795).
