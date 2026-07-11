# bareloop — PRD (v1)

> Status: **v1 — LOCKED 2026-07-11** (naming pass + bloat audit applied). Seed written
> 2026-07-10 in the adaptlearn repo; now lives in bareloop's own repo. Ground truth
> it consumes: `docs/plans/2026-07-10-agentic-automation-successor-design.md` (validated
> interview + all amendments, this repo), adaptlearn FINDINGS F1–F20 and CYBERNETICS.md
> (closed records, copied to `docs/00-context/`), and — linked, not copied — adaptlearn
> PRD v1.5.5 plus the evidence archive and analysis lenses (`docs/archive/evidence/`,
> `poc/analyze-grid.mjs`, `poc/analyze-contrast-bits.mjs` in adaptlearn v0.11.1: the science
> behind it). Nothing here reopens the adaptlearn record.

## §1 What it is

**"Automate this job — I don't know the best workflow."** bareloop is a system for tasks that are
**repeated, long, and verifiable**: the operator describes the job and its checkpoints; an
agent authors the workflow scaffolding (a constrained, validated config — never freeform
code); runs execute under an un-gameable outer gate; and the scaffolding *improves across
runs* through verdict-gated, run-as-executed inheritance with ledger-counted attribution.
One-off or small jobs are explicitly out of scope (that's a CLI session).

The pitch in one line: **workflows that earn their own design, with receipts** — every
inherited rule carries the green that minted it and the contrast that attributed it.

## §2 Why it's buildable now (the science this stands on — settled, not re-proven)

| Mechanism | Evidence | Status |
|---|---|---|
| Agents author valid harness configs at hand-written parity | adaptlearn M4 (F10) | proven |
| Mid-run revision recovers stuck runs | M5 (F11: 3/3 vs 1/3) | proven |
| Verdict-gated inheritance beats ungated on pass/fail | F19: gated late 1.00 vs ungated 0.13, valid instrument | proven |
| Run-as-executed inheritance transmits in-run learning | F20: 6/6 lineages across the credit-death boundary, ~½ cost | proven (kill-switch passed) |
| Which-knob attribution is countable from the ledger | V2: contrast bit present 16/16 gens, perfect separation | proven |
| Where memory pays: regularities outside the worker's prior | F17/F18: notes-only conventions → feedforward green@1 at ~8× under acquisition cost | proven |
| API worker seam under the gate | SP-2 smoke | proven |
| Lineages are keyed per (job × declared channel conditions) | SP-2 addendum n=3, V3 | proven |

Open (product measures, not assumes): rule generalization across runs of one real job;
soft-green minting policy; long-horizon gate value under executed inheritance (F20 deferred
it); local-LLM providers. Each open question's pre-registered handle lives in §9.

## §3 Design laws (inherited doctrine — each one was paid for; see F-refs)

1. **The agent authors its workflow; it NEVER authors its arbiter.** Closes, budgets, caps,
   merge/publish decisions live outside the emergent part, permanently. (adaptlearn §2; the
   no-breach record held through every cohort.)
2. **Inherit the run-as-executed, never the run-as-authored.** What a run learned mid-flight
   is lineage property — verdict-gated on admission. (F18 law, F20 proof.)
3. **Verdict admits, contrast attributes.** The extractor reads the ledger (sibling/history
   standing), claims a knob only with ≥1 contrast bit, and every inherited rule carries its
   minting evidence. Bare greens admit nothing into the rules. (F16 gap, V2 validation.)
4. **Green gates, cost ranks — never one fitness score.** Cost pressure is the legal
   optimizer only because the arbiter is outside. (adaptlearn §2/§5.)
5. **Every information path into the worker is a declared job condition** — close verbosity,
   provider path, task framing, scaffold. Channel change = environment change = lineage key
   dimension. (§4b learned twice, SP-2, V3.)
6. **Any claim instrument meters or disables in-run revision** — the fast loop shadows the
   slow loop (F18/Ashby). Product analytics that read "did the lineage learn?" must classify
   greens by mechanism (feedforward vs acquired, V6), not by count.
7. **Escalations travel a channel no emergent component summarizes** — byte-identical from
   shell to human. (V4/Beer's algedonic rule.)
8. **Reds are evidence, never verdicts; cap-halt is its own category; the only real failure
   is a confident fake green.** (§5b, unchanged.)
9. **Mutation/search operators are pre-flighted for reachability against the config space.**
   (V5; the kinds-axis lesson, F13's mirror — twice.)
10. **Consume the bare suite; never paper over a lib gap** — request-reds double as upstream
    findings. (adaptlearn §3.5, unchanged.)

## §4 The shape (three layers, product form)

- **Outer shell (dumb, permanent):** per-run budget cap (bareguard), retry cap, verdict
  collection, escalation routing. Stateless across runs; nothing inside negotiates with it.
- **Emergent middle:** the authored workflow config — steps, per-step verdict class, memory
  binding, hook ops, write scopes — schema-validated, config-red before tokens burn.
  Mid-run revision allowed in production runs (it recovers runs and its learning is captured
  by law #2); disabled in claim/analytics cohorts (law #6).
- **Floor:** append-only JSONL spine (single source for every UI), litectx store per job,
  ledger with per-run rows. The panel is a pure observer of the spine. Secrets load from
  the environment and never enter the spine, configs, or ledger — an append-only record
  that captures a key captures it forever.

**Verdict classes, gated per step** (interview decision #2):
- **Hard green** — predicate/exit-code truth. Mints inheritance automatically.
- **Soft green** — rubric/assessment. Passes the run; mints only with HITL confirm or N
  consistent repeats (policy picked after job #1 data).
- **HITL green** — a human is the close (PR merge, "publish"). Mints. Merge stays human
  forever.

**Primitive menu, MCP-disclosure style** (decision #3): full bare-suite surface listed to the
author; only admitted verbs callable; locked-primitive need → structured request-red →
explicit registry admission; removal is first-class mutation.

## §5 The product surface

The **panel** is the face (decision #7): define a job (description, checkpoints + verdict
classes, budget, cadence, worker/provider), watch runs (chat incl. HITL prompts; grid by
generation × verdict; detail = spine stream), and the trust surface: **"what has this lineage
learned"** — current rules, each with minting green + contrast evidence. API-first providers
(SP-2); local LLMs deferred. Web UI deferred until the loop closes headless (spine-first, so
the UI is always a pure observer); when it lands it is mobile-responsive by default — HITL
confirms and run-watching happen from a phone as much as a desktop (house rule).

## §6 Job #1 — auto-maintainer on litectx (decision #5)

review → fix → branch → PR → **human-gated merge, forever**. Hard greens: litectx's own
suite + lint; bareguard write scopes cap the diff; the PR is the escalation artifact. The
store seeds from CLAUDE.md/AGENT_RULES; what the lineage learns is per-repo folklore — which
F17/F18 showed is exactly the regularity class where memory pays (outside the worker's
prior). Job #1 doubles as the measurement bed for the §2 open questions (handles: §9).

## §7 What must be built that the experiment never had

Close-authoring UX (job description → honest per-step close chain; predicate > GOLD arbiter >
rubric-advisory); job/schedule model (bareagent Scheduler + per-run bareguard budget);
the contrast-bit extractor (V2 rule, ledger-reading); the request-red registry; per-job
channel declarations; the panel. Ports near-verbatim from adaptlearn (~600 lines + test
semantics): ralph.js, validate.js, interpret.js (with config-final), extract.js pattern,
spine.js, cohort-ledger shape.

## §8 Non-goals

No swarm, no orchestrator frameworks, one process per run. No freeform code as scaffolding.
No self-adjusted budgets — ever (the agenticSeek smell). No UI before the headless loop
closes on job #1. No local-LLM work until the API path earns it. Not a general agent — a
place where *repeated, verifiable* jobs get better at themselves.

## §9 Risks & their pre-registered handles

- **Rules don't generalize across non-identical runs** → job #1's first measurement; if
  transmission needs per-task-family lineages, the lineage key already supports it (V3).
- **Fit-to-pass drift under executed inheritance at long horizons** (F20 deferred) → keep the
  gate on admission; measure retention/drift on job #1's real timeline before relaxing.
- **Soft greens minting junk** → default to HITL-confirm minting until N-consistent has data.
- **The close chain is wrong/gameable for a real job** → close-authoring hierarchy + the §4b
  channel declaration; a close the operator can't explain is a close the product shouldn't
  trust.

## §10 Build order (module ladder, sketch — each rung POCs its riskiest assumption)

N0 port + shell + spine (token-free) → N1 job/close schema + validator → N2 single-job
headless loop (job #1 minimal: review→fix→PR on litectx, hard greens only) → N3 executed
inheritance + contrast-bit extractor live on job #1 (kill-switch: rules must transmit across
non-identical runs — the §2 open question) → N4 verdict classes complete (soft/HITL minting)
→ N5 scheduler + budget ops → N6 panel. A rung that cannot meet its exit stops the ladder;
the stop is a result. Budget discipline unchanged: hard cap per run, cap-not-estimate.

---

## Addendum v1.1 — 2026-07-11 (post-lock interview with hamr)

1. **Panel layout decided; spec: Appendix A below.** Left chat (+ command bar);
   right = progress/cost/step over results cards; context-graph reserved as a third view
   consuming litectx's `ContextGraph` + the spine (visual only, eventual). Mobile stacks.
   Timing unchanged: headless first, UI when the spine is good (N6).
2. **Web CLI = the panel's command bar**, speaking the exact verbs of the headless CLI —
   one implementation, panel as passthrough. It may not disturb the two-pane layout.
3. **§4 primitive menu, strengthened:** the FULL surface of all five bare-suite packages
   (bareagent, bareguard, litectx, barebrowse, baremobile) is disclosed from day 1 —
   disclosure ≠ admission (design decision #3 was already this shape); per-job admission
   gates what's callable, so job #1 admits litectx/bareguard/bareagent verbs while
   barebrowse/baremobile stay listed-but-locked. Disclosure is cheap, not free: every
   listed primitive is a line in the author's context and a surface it can request-red
   against — and that cost buys a diagnostic (a request-red against barebrowse on a repo
   job is real signal: CI-checking instinct, or confusion — either is worth seeing).
   **Two blocked-reds, never collapsed** (different resolutions):
   - *locked-but-exists* → request-red → registry admission. Purely in-loop, no upstream PR.
   - *missing/broken* → upstream-gap red → fixed in baresuite (we own the suite:
     fix-and-consume in the same session, version bump in bareloop) — **never a local shim
     in bareloop**. `docs/UPSTREAM-ASKS.md` queues this red only.
   Collapsing the two would let "I want browser access" masquerade as "the browser
   primitive is broken."
4. **New open question (joins §2/§9): graduated disclosure.** Base admitted set (the
   "spine primitives") always on; extras disclosed for fine-tuning once the workflow
   greens. Verified 2026-07-11 against adaptlearn (schema-v1 design + PRD): never
   exercised — the experiment ran a fixed hardcoded 4-verb subset with no registry;
   mutation could swap ops within the catalog but never admit a primitive, and the
   v2-candidate verbs were explicitly excluded. The idea is latent in decision #3's
   admitted-vs-listed split but has zero evidence. The archive stays closed (decision #4);
   the probe belongs in bareloop, pre-registered with M3 discipline on the new axis:
   **minimal-menu vs menu+1-plausibly-load-bearing-extra, opposed configs on one job —
   measurable separation required BEFORE the request-red registry is built.** No
   separation → graduated disclosure is decoration and the registry complexity dies
   unbuilt.

## Addendum v1.2 — 2026-07-11 (probe assignment, hamr)

Supersedes v1.1 §4's placement only: **the menu-breadth (graduated-disclosure) probe runs
in adaptlearn** — successor-POC track, like F19/F20: post-archive use of the experiment's
machinery that does not reopen the archived verdict — **and comes back to bareloop as
findings.** Design and gate unchanged: M3 discipline, minimal-menu vs
menu+1-plausibly-load-bearing-extra, measurable separation required BEFORE bareloop builds
the request-red registry (no separation → the registry dies unbuilt). bareloop consumes
the probe's findings exactly the way §2 consumes F1–F20 — settled upstream, not re-proven
here.

## Addendum v1.3 — 2026-07-11 (orchestration position, hamr's question)

Asked and answered against the full F1–F20 record; frame registered in
`docs/00-context/CYBERNETICS.md` ("Orchestration vs self-healing workflows", O1–O5). Summary:

**Orchestration is not a second runtime modality for bareloop — §8's "no swarm, no
orchestrator frameworks" is now grounded in the record, not just taste.** Three reasons:
(a) *credit attribution* — an orchestrator confounds dozens of runtime decisions into one
outcome bit, destroying the contrast-bit channel the extractor depends on (design law #3;
V2's 16/16); (b) *accumulation* — an orchestrator re-derives its workflow every run and
compounds nothing, while earned workflows compound on cost and first-try with receipts
(F17 ~10× post-lock, F20 ~½ cohort cost); (c) *the arbiter* — runtime-emergent coordination
has no artifact to validate reds-before-tokens (design law #1).

**Honest bound:** on the bare verdict axis, frontier models make orchestration mostly work
(F15/F18 saturation) — its legitimate regime is one-off/heterogeneous/unknown jobs, already
out of scope (§1). bareloop's axis is trust + compounding cost, not greens.

**Convergence path (if ever wanted):** orchestrate the *first* encounter with a job, then
crystallize the trace into a config via run-as-executed inheritance (F20 is the bridge) and
let the loop own it — the M5 revisor is already orchestration's caged form. Admission rule
unchanged: any such modality enters only through a pre-registered probe with measurable
separation before machinery is built (the registry precedent). No rung changes; §10 stands.

## Addendum v1.4 — 2026-07-11 (the menu probes return; graduated-disclosure question RESOLVED)

The v1.2 assignment concluded: adaptlearn F21 (menu breadth) + F22 (menu disclosure), both
pre-registered, consumed as bareloop F2. The v1.1 §4 open question closes as follows:

1. **The registry gate is MET — the request-red registry builds (~N3/N4).** F21: the menu
   axis is wired-in, categorically (one admitted verb flipped 0/3 cap-halt → 3/3 green@1
   where it had purchase; inert where not). F22 P4: the admission chain — author reads
   menu → selects → dispatch injects → green@1 — proved end-to-end through the authored
   path. Full disclosure (decision #3, v1.1 §3) stands, now evidence-backed; the §4b
   catalog-leak concern is unsupported (listing-without-capability never helped).
2. **Author selection carries ZERO need signal — curation is never by agent appetite.**
   The selection asymmetry (F2): zero false negatives, total false positives — picks are a
   superset of need. Safe because the bias points the friendly way: over-grabbing is cheap
   and self-corrects under cost-ranking; under-grabbing was fatal (0/3 at cap). The menu's
   value lives on the COST axis (first-try certainty, ~4× iterations) — exactly where
   design law #4 reads it.
3. **Curation rules (replaces "provisional" tiering intuition with evidence):** secondary
   tier locked by default; admission steered by within-run request-red frequency (a locked-
   but-selected op fires every iteration — free, structured, stronger than authoring-time
   asks, which did not replicate as need-weighted) plus outcome contrast (green@1 vs grind
   vs cap); post-green menu expansion is an across-runs one-knob mutation; removal
   symmetric. Re-admission is by finding, never by widening (unchanged).
4. **New mechanism doctrine (F21):** partial retrieval poisons gap attribution — ranked
   top-k induces false completeness and the worker discards real close evidence.
   Structural-exhaustive verbs earn admission by preventing evidence misattribution, not
   by adding context. The worker-side rhyme of design law #3.
5. **N2 requirements filed (F21 instrument caveat):** an **artifact-red** category (a
   non-code artifact reds on its own axis, never corrupts the close signal) and
   fence-robust artifact extraction. N0's `interpret.js` deliberately carries the
   reference bound until then.

## Addendum v1.5 — 2026-07-11 (the upstream ledger: auto-detected upstream fixes + workflow debugging, hamr)

New feature, spec'd and reference-implemented upstream (adaptlearn, house POC rules:
`docs/plans/2026-07-11-upstream-ledger-design.md` + `poc/upstream-ledger.mjs`, selftest
8/8 incl. two must-produce-nothing negatives; validated by re-deriving the menu-probe
session's real incidents — provider crashes ×3 as one row, a distinct timeout kept
separate, capability-gap: impact ×3, request-red: impact ×15 frequency-ranked, **zero
false positives from ~100 close reds**). Consumed here as product commitment:

1. **The upstream ledger — the runs already confess everything; this is the stenographer.**
   A pure, derived, reconstructible reader over the spines (which stay ground truth and
   never change shape for it). It classifies lib-relevant events into **8 incident
   classes** (provider crashed · primitive threw · primitive silently lied · requested-
   but-locked · capability gap, asked-and-died-at-cap · retention failed · config/vocab
   drift · broken close), dedupes by `lib:verb:class:normalized-signature` (same bug
   across 50 runs = one row with a count; two bugs in one verb stay two rows), and
   appends to one JSONL — current state is a fold, never a rewrite.
2. **Deliberately excluded: test failures and plain budget halts.** Those are workflow
   stories; they can never pollute the upstream queue. This is the two-red routing rule
   (v1.1 §3) made mechanical: the ledger auto-detects the upstream-gap red and
   frequency-ranks the request-red — the same evidence stream F2's curation rules read.
   It also catches the worst case: workflows that went GREEN while a lib quietly
   degraded — the bug that otherwise ships invisible.
3. **Two audiences, one file.** The panel (N6) renders it as *workflow health* — users
   debug "the toolbox was broken here" separately from "your workflow failed here". The
   maintainer reads it as a pre-drafted upstream to-do: each row carries a suggested ask
   and spine-line evidence pointers (world/cell@seq). Fix lifecycle is human-appended
   (open → filed → fixed → consumed, the A1/A2/A3 pattern); **the tool drafts, never
   files** — filing and fixing stay human, per law #1's spirit. `docs/UPSTREAM-ASKS.md`
   becomes the ledger's filed-state view rather than a hand-maintained queue.
4. **New obligation on admission (lands with the registry, ~N2/N3): per-job known-answer
   smokes.** Each admitted primitive gets a known-answer check emitted as a
   `primitive-smoke` spine event before the loop spends — the only detector for the
   silent-degradation class, because silent bugs throw nothing (adaptlearn A3; F21's
   "impact must return 8/8" is the template).

Ladder placement: ledger reader consumes spines from N2's first real runs; smoke
obligation rides the admission machinery (~N2/N3); panel surface at N6. No rung changes.

---

## Appendix A — Panel spec (provisional)

> v0.1, from the 2026-07-11 PRD interview (hamr); folded in from `PANEL.md` 2026-07-11 —
> one product doc. Unlike the locked core, this appendix is **provisional**: change or
> simplify as development teaches us; changes from real use get dated notes here. Build
> stays deferred until the spine is good (§10, N6). Two standing invariants: the panel is
> a **pure observer of the spine plus a command passthrough** — it can never do something
> the CLI can't — and it is **dead simple**.

### Layout — two panes

- **Left: chat.** System↔operator conversation, HITL prompts and confirms, and result
  announcements (each announcement links into the results pane; results never live only in
  scrollback). At the bottom of the pane: the **command bar** — a web CLI speaking the
  exact verbs of the headless CLI (create job, run, pause, show rules, tail spine). One
  implementation; the panel passes commands through. The bar must not disturb the two-pane
  layout.
- **Right, top: progress.** Current step, cost so far vs the run's hard cap, run/generation
  state.
- **Right, bottom: results.** Artifact cards, newest first. Job #1: PR link + diff stat +
  suite verdict. A posting job: the posted URL. Whatever the job's closes produce.
- **Mobile** (house rule — responsive by default): stacks to progress strip → chat →
  results behind a tap.

### Primitive menu presentation

The menu breaks primitives under **recall / compress / stash / remember** for easy
categorization — the adaptlearn-proven spine set, one verb per litectx primitive
(Select → recall, Compress → compress, Isolate → stash, Write → remember). Explicitly
provisional: change or simplify as development teaches us. Open detail (not decided):
where non-CE verbs (barebrowse, baremobile, bareagent, bareguard surfaces) sit — by
package until this scheme evolves. Locked-but-listed primitives render visibly distinct
from admitted ones (disclosure ≠ admission, addendum v1.1 §3).

### Context-graph — third view, eventual

litectx already ships the primitive: `ContextGraph` (`litectx/src/contextgraph.js`) — an
`observe()` proxy records every CE verb call live; `.json()` / `.mermaid()` out;
visualization is explicitly a consumer concern. The panel's third view is that consumer,
fed by ContextGraph traces + the spine, drawing the whole workflow: runs, retries,
verdicts, rule lineage. Visual only, not load-bearing, not first — the slot is reserved
and nothing in the two-pane layout may squat on it.

### Timing

Headless first. UI when the spine is good — no early read-only viewer unless the spine
earns it sooner. When the panel lands, everything above is the starting layout.

---
*Seed written 2026-07-10 in adaptlearn (v0.11.0). Named `bareloop` 2026-07-11 (npm-free at
check time; suite-family name chosen deliberately — the product is the bare suite's flagship
consumer, and "bare loop" states the §8 minimalism: no swarm, no orchestrator, one process
per run). Bloat-audited and locked v1 2026-07-11: the seed was already lean — the audit's
changes were the §6→§9 dedup, the §4 secrets invariant, and the §5 mobile mandate. §3's
citations stay: every parenthetical is a load-bearing F-ref. Amendments from here are dated
addenda, not rewrites.*
