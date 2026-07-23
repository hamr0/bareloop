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
- **Cheaper worker surfaces as API substitutes** → RESOLVED for clipipe (F48): only the
  `anthropic-api` surface is guaranteed. The `clipipe-subscription` (Claude CLI) surface is
  capable at the step level but did not carry job #4 to a grade in 2 rows (0/2 vs API 3/3),
  and a 3.5× budget raise ($8→$28) was REFUTED — it escalated on the F39 semantic-stall at
  $7 of $28, not on money. It buys $0-marginal billing at a permanent tax (~2.5–3× notional
  effort, always slower, no resume, same F39 ceiling): IN only as a babysat fallback, never a
  peer. Local LLMs remain deferred and UNMEASURED — no local surface exists; the reasoned
  (unproven) expectation is the same or worse F39 ceiling plus tool-call-fidelity risk.

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
   > **Retired 2026-07-12 (adaptlearn F23, bareloop F3):** the poisoning mechanism failed
   > replication under the fixed instrument (single contaminated cell); narrow-arm
   > failure is hunting, not dismissal. The admission conclusion stands, re-grounded:
   > structural-exhaustive verbs earn admission by delivering the whole constraint set at
   > once (convergence@1, wide 6/6 vs narrow 0/9 pooled) — not by preventing
   > misattribution.
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

## Addendum v1.6 — 2026-07-12 (the self-healing map: every loop gets its named red and an undeletable signal, hamr via the cybernetics frame)

Frame registered in `docs/00-context/CYBERNETICS.md` ("The self-healing map", V7/V8). The
one-sentence law: **a system self-heals only at the loops it has; give every subsystem its
loop, its named red, and its undeletable signal** — a red that lacks a name gets folded
into a neighbor and teaches the wrong loop; a signal an emergent component can summarize
can be suppressed. This addendum is the audit of bareloop against that law: four of the
five loops were already committed piecewise (v1.4/v1.5 + design laws); what's new is the
completeness criterion itself, one spine category, one lint rule, and two documentation
obligations.

**The five loops — where each lives (audit result, cites only):**

| Loop | Heals | Already committed | Spine signal |
|---|---|---|---|
| 1. Within-run | S1 heals itself | M5 revision (§4); artifact-red (v1.4 §5, N2); primitive-smoke (v1.5 §4, ~N2/N3) | revision, artifact-red, `primitive-smoke` |
| 2. Across-run | S4 heals the harness | laws #2/#3/#4; one-knob mutation | `config-final` (live at N0) + ≥1 contrast bit per knob (V2) |
| 3. Menu | S4 heals capability | registry, gate MET (v1.4, F2); ~N3/N4 | `request-red` with op + iteration (frequency = need weight) |
| 4. Lib | the human heals the substrate | upstream ledger (v1.5); filing stays human | ledger rows derived from spines |
| 5. Instrument | the probes heal the probe | **new — committed below** | must-fail fixtures, measured before spend |

**New commitments:**

1. **`coordination-red` joins the spine vocabulary (V7).** Coordination failures — write-
   scope contention, step-order violations, store races — get their own category, never
   folded into worker/interpreter-red: a coordination failure logged as a worker failure
   teaches the wrong loop to heal. Lands with the N1 schema / N2 loop, where the first
   real coordination surfaces appear. (N0's category set has no coordination name — that
   is correct for one process per run with no steps; it stops being correct at N2.)
2. **The verdict/cost separation becomes lintable (V8).** Law #4 was doctrine; now it's
   structure: verdict and cost are separate values end-to-end, and **no function in the
   tree combines them into one scalar** — no fitness score can exist even by accident.
   Token-free static check; rides CI from N1 (the rung already touching the validator API).
3. **Instrument obligation (loop 5, promoted from dev rule to product doctrine):** every
   probe and every analytics instrument ships with must-fail fixtures, and machinery
   negatives are measured **before** spend. The menu-probe session caught A3, a results-
   clobber, and a regex bug this way — before any of them could contaminate a readout.
   Applies to every pre-registered probe bareloop consumes and every N3+ extractor/ledger
   analytic.
4. **Attenuator manifests.** Every summarizing point — extractor, ledger fold, gap slice,
   escalation path — documents what it keeps, what it drops, and why nothing downstream
   needs the dropped part. The upstream-ledger design doc is the template; the manifest is
   part of each component's definition-of-done as it lands (extractor at N3, ledger fold
   at N2+, escalation at N2).
5. **Amplifier truncation — floor committed, full rule gated on a probe.** The floor is
   evidence-backed now (F21: partial retrieval poisons gap attribution): **ranked views
   never claim exhaustiveness; exhaustive views (impact) may.** The full rule — every
   partial view injected into a worker declares itself partial ("top-k of unknown total")
   — enters only if the **declared-truncation probe** shows the declaration restores
   honest gap attribution: adaptlearn-side, pre-registered first, same track and bar as
   F21/F22 (the v1.2 assignment pattern), findings consumed back here.

Standing rule going forward: any new subsystem answers the three-fold audit question at
design time — which loop owns it, what is its red called, where does its signal land on
the spine. Unchanged and re-affirmed structural: escalation text reaches the human
byte-identical to what the shell emitted (law #7/V4 — the pain channel is never
summarized). No rung changes; §10 stands.

## Addendum v1.7 — 2026-07-12 (reconciliation with the seed's §11 checklist — v1.6 was written from the session summary; the seed is the fuller statement)

The adaptlearn seed draft gained §11 ("the PRD-spine checklist") after the repo cut;
audited against v1.6 per §11's own rule — place every item or strike it deliberately, no
silent drops. Four corrections; everything else in v1.6 stands as written. The CYBERNETICS
registration (same-day) is updated in place to match; this addendum is the change record.

1. **V7 upgraded: from category-commitment to pre-registered probe (supersedes v1.6 #1's
   framing; the category and its N1/N2 landing stand).** Coordination is the ONE subsystem
   adaptlearn structurally could not test (one process, one S1, sequential runs — nothing
   to coordinate), so V7 ships as prediction, not proven mechanism. **Prediction:** the
   first multi-step job surfaces ≥1 red that attributes to no single unit (S2-class).
   **Falsifier:** if every job-#1 red attributes cleanly to a single unit under §5b
   contrast, V7 over-predicted — note it, keep `coordination-red` as a named-but-empty
   bin, move on. **Build gate:** until the probe fires, no S2 machinery beyond the named
   category is built — the category IS the instrument that makes S2 reds visible;
   schedulers before an observed coordination red would be cargo-cult coordination.
2. **Loop-5 obligation gains two paid-for clauses (extends v1.6 #3):** (a) machinery
   negatives drive the REAL code path, never a replica — the F22 run-1 clobber survived a
   replica-based negative; (b) **provider failures are instrument, not verdict** — retry
   once, then a provider red, excluded from every analytic read (§5b's spirit). Partially
   embodied at N0 (`src/extract.js` reds `provider-error` and never throws); retry-once
   and the spine-level category land with N2's real loop.
3. **Amplifier truncation — gate polarity corrected (supersedes v1.6 #5).** v1.6 gated the
   declaration rule's existence on the probe; the seed's framing is right: the declaration
   ships regardless — a near-free honesty marker, the injection-side twin of the ledger's
   "ABSENT, not fabricated." Every ranked/partial view injected into a worker says so in
   the injection itself ("top-k of an unknown total — may be incomplete"). What the
   **declared-truncation probe — adaptlearn F23, number reserved, prereg pending** —
   decides is the rule's *status*: load-bearing (review blocker) vs hygiene. The floor is
   unchanged either way: ranked views never claim exhaustiveness; exhaustive views may.
   > **ANSWERED 2026-07-12 (adaptlearn F23, v0.11.5, evidence
   > `truncation-declared-E1wCrp`): status = HYGIENE.** Pre-registered NULL, falsifier
   > clean: attribution@2 was 3/3 in BOTH arms, because F21's attribution-poisoning
   > mechanism itself failed replication under the fixed instrument (its evidence lived
   > in the stripFences-contaminated iterations; narrow-arm failure is
   > hunting/oscillation, not dismissal — workers adopt the gap evidence by iteration 2,
   > then break passing conventions while fixing others under the partial view). So: the
   > declaration ships as the honesty marker above, is never a review blocker, and is
   > never relied on for attribution — that fix stays structural (exhaustive verbs,
   > admission; F21's WIRED-IN headline replicated again, narrow 0/9 pooled vs wide
   > green@1 6/6). Side yield: **artifact-red revalidated** — prose + UNFENCED code
   > defeats any extraction heuristic (v1.4 §5 commitment reaffirmed for N2).
4. **Attenuator manifest sharpened (extends v1.6 #4):** the manifest is per-field (the
   ledger design doc's field table is the template), and an attenuation point without one
   is a **review blocker**, not merely unfinished.

## Addendum v1.8 — 2026-07-12 (pricing-red: unpriced is never free — F6, N2 commitment)

Minted by F6: the N2 drafting probe reported `spent=$0.0000` for a real API call because
an unpriced `costUsd` was `?? 0`-coerced — a harness confound that named a real hole in
§10's budget discipline. **Cap-not-estimate must close over pricing:** a ledger that
counts an unpriced result as $0 makes the hard cap gameable by any unpriced model or
provider path. This is pricing-red's product-level filing, same tier as its sibling
artifact-red (v1.4 §5); it answers the v1.6 standing rule — loop 1 (within-run), red
named `pricing-red`, signal on the spine as a decision-ready halt.

1. **The honest null:** cost is `number|null` end-to-end; null means "spend unknown,"
   never $0. No `?? cost` / `?? 0` fallback may launder it — a transport failure's spend
   is unknown, not zero.
2. **The runner halts `pricing-red`** on a null cost OR `unpricedRounds > 0` (a
   partially-unpriced run — finite but under-counted — is also never free). Drafting
   calls route through the same accounting, never around it.
3. **The class is real, not theoretical:** within one day of minting, the rule caught
   three silent $0 launderings in shipped code (interpret's cost emit; two in extract.js,
   including a transport throw reported as $0) — F6 addenda hold the evidence.

## Addendum v1.9 — 2026-07-13 (the tool grant: capability is spec territory — N2 module 2b, hamr interview)

Job #1's find-and-fix work spans many files; the single-target text middle cannot carry
it. The tool-mode middle (design record: N2 addendum 2026-07-12b, POC 6/6) lands with
three product-level commitments:

1. **The agent never authors its own capabilities (hard-line corollary).** A step's
   middle mode (`text`|`tools`) and its tool menu live in the JOB SPEC — human territory,
   validated — and are inexpressible in the drafted workflow config, same guard as
   close/provider (inexpressibility, both directions). The runner threads the grant
   verbatim.
2. **The menu is read/grep/write only; the close remains the ONLY executor.**
   `run`-command is locked-but-listed: a spec requesting it reds, and that red is the
   request-red evidence its admission waits on — the product's own curation doctrine
   (F2 rules) applied to its own toolbox. No executor enters the fence on intuition.
3. **Both middles stay, chosen by step shape.** Single-target steps keep the text middle
   and artifact-red (the v1.4 §5 commitment holds there). In tool mode artifact-red
   genuinely does not exist — the tools write directly under per-call fence checks
   (write scope AND read scope), and "wrote junk" is the close's verdict. The hitl
   step's PR mechanics (branch/commit/draft PR) are deterministic runner code; the model
   never sees a git surface, and a PR failure can never swallow the escalation (law #7).

## Addendum v1.10 — 2026-07-13 (the Boolean floor: five gate-level borrows, things to try — hamr assignment)

Registered in CYBERNETICS (§"The Boolean floor", V9–V13, both repos): digital logic is the
solved instance of this product's problem — reliable systems from unreliable components —
and five of its disciplines port as candidate experiments. Borrows are architectural
(restoration, clocking, fault models, design-for-test), never boolean-composing LLM calls.
None is a build commitment; each fires on its named trigger, and a null is a result.

Things to try, in nominated order:

1. **V9 — instrument BIST (NOMINATED FIRST; adaptlearn-sandbox POC, token-free).**
   Stuck-at catalog over the real instrument components (close stuck-at-green/-red/broken,
   spine dropping events / freezing seq / mis-stamping ts, validator stuck-at-green,
   escalation channel summarizing detail) + one detection vector per fault, run as a
   pre-flight before any probe's results are trusted. Control: zero false positives on the
   good instrument. Falsifier: each vector, sabotaged, must MISS its fault
   (mutation-validated, F4 pattern). Motivation: F23's contaminated cell was an undetected
   instrument fault found only after tokens burned. Consumption: upstream-ledger pattern —
   POC stays in adaptlearn `poc/`, bareloop rewrites against the spec and checks against
   the POC.
   **ANSWERED 2026-07-13 (adaptlearn F24, 0.11.6): GREEN** — control 7/7, 7/7 faults
   detected by their own assertions, falsifier 8/8 sabotaged vectors miss; run 1's control
   arm caught a real fixture bug (`node --test <dir>` = entry-file red) before anything
   trusted the instrument. Spec carried to
   `docs/plans/2026-07-13-instrument-bist-spec.md`; the pre-flight rewrite lands with
   N-ladder instrument hygiene, timing owned by this repo's session.
2. **V10 — forbidden-zone audit (per close, lands with N-ladder close work).** Each close
   enumerates outcomes that are neither clean green nor clean red (F5 validate-then-crash
   class, unparseable artifacts, partial suites); each maps to a named red/escalation;
   coercing one to a verdict is itself the instrument fault. Kin to v1.6's named-red map:
   this names the *gap between* verdicts.
   **ANSWERED 2026-07-13 (adaptlearn F25, 0.11.7): GAP** — audited against adaptlearn's
   real close chain (control 2/2, falsifier 6/6 classifiers flip): one live coercion
   (signal-killed close read as `needs_revision exitCode=null`, then retried to cap —
   broken-close-must-escalate violated in behavior), one collapse (timeout pooled into
   broken-close), one coercion INVISIBLE at the seam (crash-at-load ≡ honest red by exit
   code; no mapping can separate them). Three build rules carried to
   `docs/plans/2026-07-13-forbidden-zone-audit-spec.md`: `close-killed`, `close-timeout`,
   and a judgment-rendered signal (executed-test count / structured verdict) so
   `close-crashed` is auditable at all; they land with the N-ladder close work, timing
   owned by this repo's session.
3. **V11 — transparent-path lint (any claim instrument).** The declared-condition list
   marks every information path as clocked (advances only at run boundary, write-enabled
   by verdict) or metered; an unmetered continuous path is the F18 revision-confound named
   before tokens burn. Design law #6 made checkable.
4. **V12 — restoration boundary (stage seams).** No analog value (rubric score,
   confidence, partial-pass fraction) crosses a stage boundary as an input to any
   decision; only quantized verdicts travel. V8's sibling: V8 bans combining two clean
   signals; V12 bans propagating an unclean one.
5. **V13 — toggle coverage (ledger, post-N4).** Per config knob: ≥1 observed contrast
   toggle in the ledger, or the knob is flagged unwired-until-proven. Extends the F2
   contrast-bit minting rule into an ongoing coverage metric.
   **ANSWERED 2026-07-13 (adaptlearn F26, 0.11.8): metric VALIDATED, archive INSUFFICIENT** —
   control exact, all three comparison rules falsifier-proven, `hooks.on-green` flagged
   UNWIRED in every world, F15's lock found toggle-visible. But the clean tier (one-knob
   sibling cells at a fixed task) is **barren across the whole archive**: toggle coverage is
   a ledger *design* requirement, not a post-hoc query, and a "toggle" across a re-authoring
   boundary can carry the **wrong sign** (demonstrated live: −episode reading as an
   improvement). Spec carried to `docs/plans/2026-07-13-toggle-coverage-spec.md`; binds the
   N3/N4 ledger shape. Folded into doctrine in **Addendum v1.11**.

> **All three consumed 2026-07-13 — see Addendum v1.11.** With V9, V10 and V13 answered and
> V11/V12 transferred as registered build rules, adaptlearn's sandbox is **closed**.
   **ANSWERED 2026-07-13 (adaptlearn F26, 0.11.8): METRIC VALIDATED, ARCHIVE
   INSUFFICIENT** — the metric passes as an instrument (control exact; all three comparison
   rules falsifier-proven; `hooks.on-green` flagged UNWIRED in every archived world; F15's
   lock found toggle-visible), but adaptlearn's ledgers could not support clean attribution:
   the unconfounded tier (sibling cells one knob apart at the same task/gen/arm) was BARREN
   everywhere, and a re-authored pair's "toggle" was caught carrying the WRONG SIGN. Build
   rules carried to `docs/plans/2026-07-13-toggle-coverage-spec.md`: coverage is a ledger
   **design** requirement (cohorts must emit one-knob sibling cells), never count a toggle
   across a re-authoring boundary (require `knobMutated`), ship the UNWIRED default, keep
   the three proven comparison rules. Lands with the ledger/selection work.

**Boolean-floor track complete (2026-07-13).** All five items resolved: V9 answered GREEN
(F24), V10 answered GAP (F25), V13 answered (F26) — each with its spec in `docs/plans/`;
V11 (transparent-path lint) and V12 (restoration boundary) stand as registered build rules
here, firing when the N-ladder builds the seams they constrain. adaptlearn's sandbox is
closed with nothing structurally hostable left; further probes ride bareloop's own jobs.

---

## Addendum v1.11 — 2026-07-13 (the Boolean floor CONSUMED: three adaptlearn specs land as doctrine — hamr)

The three sandbox probes registered in v1.10 have all read out, and their specs are carried into
this repo (`docs/plans/2026-07-13-{instrument-bist,forbidden-zone-audit,toggle-coverage}-spec.md`).
adaptlearn's sandbox is now **closed**: every Boolean-floor V-item is either answered (V9, V10,
V13) or transferred here as a registered build rule (V11, V12). This addendum folds what they
bought into doctrine. Where a rule was *corrected* by contact with real code in this repo, the
correction is named — the spec travels, but it does not outrank the evidence.

### The forbidden zone (V10 / adaptlearn F25 / this repo's F17) — design law #8, generalized

Law #8 says reds are evidence, never verdicts, and cap-halt is its own category. The forbidden
zone is the same law applied to **the gap between the bands**:

> **A close that rendered NO JUDGMENT produced NO VERDICT — in either direction.** The two clean
> bands are green (exit == the signed `expect`, judgment rendered) and red (exit != `expect`,
> judgment rendered). Every other outcome gets its own name, its own escalation, and its own
> human decision — and is NEVER retried. Coercing one into a verdict *is* the instrument fault.

Named, never pooled: **`broken-close`** (cannot run) · **`close-timeout`** (ran, never finished
judging) · **`close-killed`** (died by signal) · **`close-crashed`** (ran, exited, judged nothing).
`close-timeout` is split out of `broken-close` because "raise the timeout" and "fix the argv" are
different human answers, and an escalation exists to carry exactly that distinction.

**The judgment-rendered signal.** Exit code alone cannot separate a crash-at-load from an honest
red — they are byte-identical at the seam. So a close may declare, in the **signed job spec**, how
it evidences that judgment occurred (`close.judged: {pattern, min}` — one integer extracted from
its own output, against a declared floor). Three things about it are doctrine:

1. **It is a FLOOR, not a zero-check.** adaptlearn's rule 3 ("exit nonzero ∧ *zero* tests executed")
   is **not buildable** — against `node --test` a crashed file is reported as one failing test, so
   the count is never zero. The spec was corrected against a real runner (F17). *A rule validated
   only against a fixture is a rule that has not met its instrument.*
2. **It is checked on the GREEN band too.** This goes beyond what adaptlearn found, and it earned
   its place immediately: pointed at a tree with no test suite (the F8 wrong-repository class),
   `node --test` **exits 0** and the shipped arbiter returned **`satisfied`** — a fake green,
   law #8's only real failure, live. A red-side-only guard cannot see it.
3. **It is arbiter territory, and it is optional.** The agent-drafted config cannot express it
   (inexpressibility, both directions). A close with nothing to count — a linter, a `hitl` close
   where a human *is* the judgment — stays writable, and its absence is stamped `unaudited` and
   announced on the spine. **A blind spot is named, never assumed away.**

**Inexpressibility is only as deep as its unknown-field check** (F17, minted here). The workflow
validator guarded unknown fields at the top level only; every nested block (`gate`, `loop`,
`memory`, `escalation`) accepted arbitrary keys. Nothing consumed them — but "the arbiter split is
guarded both directions by inexpressibility" was, as written, false below depth one. The guard is
now per-section. **Any claim of inexpressibility must name the depth at which it is enforced.**

### Instrument BIST (V9 / adaptlearn F24) — a pre-flight, before any instrument is trusted

READOUT GREEN (control 7/7, 7/7 faults detected, falsifier 8/8 sabotaged vectors miss). The spec
(`instrument-bist-spec.md`) carries a stuck-at fault catalog + one detection vector per fault over
the real components (`runClose`/`ralph`, `makeSpine`, `validateConfig`). It lands with N-ladder
instrument hygiene, and it lands as a **rewrite against this repo's components — never a copy**
(graduation is always a rewrite). Two rules ride with it, both paid for:

- **One shared read-back function against good AND faulted components** — a replica check is a
  second instrument, and two instruments that disagree about the same seam are the fault itself.
- **Keep the falsifier arm.** A vector whose sabotage still "detects" was detecting a crash, not
  asserting anything; it is not load-bearing and must not ship. (V9's own run 1 proved this on
  itself: its control arm caught a real fixture bug — a `node --test <dir>` argv redding every
  close — *before* any probe trusted the instrument. The mechanism worked one level early.)

### Toggle coverage (V13 / adaptlearn F26) — the metric is valid; the LEDGER must be designed for it

READOUT: the metric works and discriminates (control exact; all three comparison rules
falsifier-proven; `hooks.on-green` flagged UNWIRED in every archived world; F15's lock found
toggle-visible) — **but adaptlearn's archived ledgers cannot support clean attribution**, and that
is the lesson bareloop inherits. This binds N3/N4 (the ledger and the extractor), not N2:

1. **Toggle coverage is a ledger DESIGN requirement, not a post-hoc query.** The clean tier
   (sibling cells at the same task/generation/arm, configs one knob apart) was **barren in every
   archived world** — sibling lineages had divergent mutation histories, so they virtually never
   differed by exactly one knob. **bareloop's cohorts must deliberately EMIT one-knob sibling
   cells.** Retrofitting the metric onto a ledger not designed for it yields a barren clean tier
   and a confounded one. *This is a constraint on how runs are scheduled, and it must be settled
   before the ledger's shape is locked — not after.*
2. **Never count a toggle across a re-authoring boundary.** A lineage pair is one-knob only if the
   ledger says it *was* a mutation step (`knobMutated` set). Demonstrated live and unpleasantly: a
   re-authored pair produced a "toggle" attributing improvement to **removing** episode-recall —
   **the wrong sign**, against the strongest result the project has. An arm that re-authors between
   generations silently breaks the one-knob semantics.
3. **Ship the UNWIRED-until-proven flag.** Zero observed toggles ⇒ the knob is unwired-until-proven,
   by default. `hooks.on-green` is the worked example: an axis in the schema, in the mutation
   catalog, and in every config, with **zero ledger evidence it ever changed an outcome**.
4. **Keep all three comparison rules** — each is falsifier-proven load-bearing: single-knob
   strictness, outcome-class sensitivity, and kinds-as-sets with mirror coupling.

This extends design law #3 (*verdict admits, contrast attributes*) with its ongoing coverage
counterpart: **a knob with no observed toggle has no standing to be claimed load-bearing** — and
the ledger only produces toggles if it was built to.

---

## Addendum v1.12 — 2026-07-14 (config-v1 retired, plan-v1 replaces it — the pivot record; hamr interview)

The N2 loop was made to actually loop (F20: nothing had bounded a tool-mode attempt, so the
close had never run, in any arm ever), and with it looping it repeated itself byte-for-byte
three times (F21) because the drafted config had no channel from attempt N to attempt N+1 on a
run that never greens. F22 named the deeper problem: of the drafted config's seven knobs,
exactly one (`loop.shape`) can change what the worker experiences on a never-green job — **the
emergent middle, as shipped, has no live surface, and "the agent authors its workflow" was
near-empty.** This addendum records the pivot the evidence forces. It amends §3–§4 and §10; it
does not touch the design laws' intent — it makes the middle finally express something the laws
permit.

### The law, restated (hamr-confirmed, verbatim)

> **The agent may author anything whose only verbs are gated primitives. It may never author
> the arbiter: the close, the budget, the fence, the merge.**

This **RESTATES** §3 law #1's constrained-config rule — it does not repeal it. The danger was
always in the ACTIONS, not the syntax: the inexpressibility guard (two docs, two validators,
the arbiter unreachable at every depth — F17/v1.11) stays exactly as it is. config-v1 was too
inert to be dangerous *and* too inert to be useful; plan-v1 gives the agent a real surface
whose every verb still bottoms out in a gated primitive.

### config-v1 is RETIRED

The hooks/slots/knobs schema (`recall`/`compress`/`stash`/`remember` bound to
`before-attempt`/`after-red`/`on-green`) is retired on the evidence of F21/F22. **Its code
moves to an archive when plan-v1 lands — not before:** the suite still runs through it today,
and a rung is never left un-runnable. `stash` in particular is a **decoy verb** (F21) — it
looks like a ratchet and an agent drafts it every time, but it writes to a table nothing reads.

### plan-v1 — the replacement shape

Signed job spec (goal, budget, final close, tool ceiling — **all human, unchanged**) → the loop:

1. **Preflight.** v1: a job whose final close is not a deterministic predicate escalates
   **decision-ready** with a question — *"this is a chat, not a job"*. (A close compiling from
   prose is N4, not now.)
2. **SCOUT** — a read-only worker, **hard-bounded rounds + a reserved budget slice**, produces
   a context blob. It cannot write; it cannot run.
3. **PLAN** — `bareagent Planner.plan(goal, {info: scoutBlob})`, the decompose LLM call,
   emitting a step DAG. A **new plan-v1 validator** gates it before tokens burn: each step's
   verbs ⊆ the spec's tool ceiling; each step's bounds ≤ the shell caps; each scope inside the
   fence; the arbiter untouchable and inexpressible (the F17 depth rule, carried). **The DAG is
   executed in topological order, STRICTLY SEQUENTIALLY in v1** (fan-out is deferred — see
   below).
4. **Per-step micro-loops** — `ralph()` with the judge generalized to a **shell-owned seam**:
   the outer close is the human's `runClose` (unchanged, the only truth). For a *step*, the
   agent picks from a **CLOSED MENU of declarative inner exits the shell evaluates with its own
   fixed code, never a command**: `artifact-written(path, pattern?)`, `tree-changed(scope)`,
   `json-valid(path)`. `run` stays locked — an agent-authored command executed by the shell
   would be arbitrary execution laundered through the arbiter, so it is **structurally
   inexpressible**, not merely disallowed.
5. **Feed-forward.** Each step's artifact feeds the next step's prompt (the bareagent BA-9
   `withContext` shape) — this is the F21 wire: the channel from step to step that config-v1
   never had.
6. **ONE replan per run** — mirrors the one-revision rule (v1.9 / M5). Unlimited replanning
   would launder thrash as adaptation.
7. **The human-signed outer close is the only truth.** plan-AS-EXECUTED + a per-step ledger are
   written to the spine; a **GREEN run's plan is minted for inheritance** (verdict-gated,
   doctrine untouched — law #2/#3), a red run's is not. **N3's kill-switch now has a real
   subject: does a minted plan transmit to a non-identical run?**

### The plan-v1 run, end to end

Written for someone who was not in the interview. Nothing here is new doctrine — it is the
above, spelled out at the level of one run.

#### 1. The flow

```
OPERATOR signs the job spec:
   goal · budgetUsd (tighten-only below) · the final close (a command,
   exit code = truth) · tool ceiling [read,grep,write,recall,get] · cadence
        │
        ▼
0. PREFLIGHT — "does this job close deterministically?"
   yes → proceed. no/unsure → decision-ready escalation WITH A QUESTION
   (it's a chat). v1 never compiles a close from prose (N4).
        │
        ▼
1. SCOUT — one read-only worker, hard-bounded (own rounds cap + reserved
   budget slice, same pattern as the draft reserve). Output: a context
   blob (repo layout, failing tests, best cause hypothesis). Never writes.
        │
        ▼
2. PLAN — one decompose LLM call: Planner.plan(goal, {info: scoutBlob}).
   Returns a step DAG [{id, action, dependsOn}]. The plan-v1 VALIDATOR
   then enforces: per-step verbs ⊆ the spec's tool ceiling · per-step
   bounds ≤ shell caps · scopes inside the job fence · inner exits from
   the closed menu only · the arbiter (close/budget/fence/merge) is
   INEXPRESSIBLE in the plan vocabulary. DAG executed in topological
   order, strictly sequentially in v1.
        │
        ▼
3. EXECUTE — each step is a micro-loop (the same ralph(), judge injected):
     while inner-exit red and under step-bound:
         worker(step.action, step's narrowed tools, gap)
   · fresh Loop + fresh Gate per step — the Gate's maxTurns IS the step
     bound (per-attempt bounding is native, no stop() machinery)
   · the step's ARTIFACT (its final text / named file) feeds forward:
     the next step's prompt opens with "Working context (read-only):"
     + goal + repo root + close output + all prior steps' artifacts,
     labeled by step id. No step starts blind. (The F21 wire.)
   · a step that exhausts its bound → ONE replan per run
     (Planner again, {info: scoutBlob + artifacts + what failed});
     still red after the replanned steps → escalate. The stop is a result.
        │
        ▼
4. THE CLOSE — the operator's signed command runs (shell territory,
   unchanged from today: runClose, forbidden zone, judged floor, redaction).
   exit==expect → green. red → the gap feeds one bounded fix loop.
   still red → decision-ready escalation.
        │
        ▼
5. FEED-FORWARD ACROSS RUNS (what makes this bareloop, not relayfact):
   plan-AS-EXECUTED + per-step ledger (cost, rounds, exit outcome,
   replans) → the spine. GREEN run → the plan is MINTED for inheritance
   (verdict-gated, unchanged doctrine); next cadenced run starts from the
   minted plan and may revise (prune a step that never helped, tighten a
   bound never hit — self-heal). RED run → nothing minted; only the
   decision-ready escalation survives.
```

#### 2. Privileges — who may author what, who may see what

| | shell (`ralph`/`runJob`, code, no LLM) | scout | planner (the decompose call) | step workers | operator (human) |
|---|---|---|---|---|---|
| **runs the close** | **yes — only here** | no | no | no | no (they *sign* it) |
| **sets the budget** | enforces it | may only tighten | may only tighten | may only tighten | **yes — only here** |
| **sees the repository** | no | yes, via gated tools | **no — only the scout blob** | yes, via gated tools (step's narrowed grant) | yes |
| **writes files** | no | no | no | **WRITE steps only, inside the fence** | yes |
| **authors the plan** | validates it | no | **yes — only here** | no | reads it |
| **authors inner exits** | evaluates them | no | **yes — closed menu only** | no | reads them |
| **authors the arbiter** (close/budget/fence/merge) | **NOBODY** — structurally inexpressible in the plan vocabulary | | | | signs it out-of-band |
| **merges** | no | no | no | no | **yes — forever** |

The row that matters: **no self-adjusted budgets, ever** (§8). Everything below the operator may
TIGHTEN `budgetUsd`, never raise it. And the planner never touches the repository — it sees the
scout's blob and nothing else, which is what keeps the plan a *plan* and not a second worker.

#### 3. The inner-exit closed menu

A step's exit is picked from three declarative checks, **evaluated by the shell with its own
fixed code — never a command**:

| exit | means | typical step |
|---|---|---|
| `artifact-written(path, pattern?)` | the named file exists, and (optionally) matches the pattern | ISOLATE / diagnose |
| `tree-changed(scope)` | the working tree changed inside `scope` | WRITE |
| `json-valid(path)` | the named file parses as JSON | structured hand-off |

**`run` stays locked forever.** An agent-authored command executed by the shell would be
arbitrary execution laundered through the arbiter, so it is not merely disallowed — it is
**structurally inexpressible in the plan vocabulary**, the same both-directions inexpressibility
guard as the two-validator split (F17 / v1.11).

`tree-changed` as a WRITE step's exit makes **"the attempt wrote nothing" a NAMED red by
construction** — the F21 null-attempt hole, closed. Three attempts that read for 72 rounds and
wrote nothing would now red at the step, not drift to the cap.

**The known bound, stated plainly:** inner exits verify **FORM, not TRUTH**. A confident-but-wrong
step artifact satisfies its exit and then propagates downstream through feed-forward. The
containment is the **outer close plus the one replan**. Inner exits are **progress gates**; there
is exactly **ONE arbiter, and it is the operator's close**.

#### 4. Worked example

> **Job:** "memory loading in gitdone is slow — make the load benchmark pass."
> **Signed close:** `node bench/load.test.js`, expect exit 0.

| step | verb | tools | inner exit | bound | what flows |
|---|---|---|---|---|---|
| s1 | ISOLATE | `recall`, `get` | `artifact-written(cause.md)` — must name a path and a symbol | 6 rounds | hands forward: *"src/memory/loader.ts: `loadIndex()` reads 400 blobs serially, no index"* |
| s2 | WRITE | `get`, `write` | `tree-changed(src/**)` | 10 rounds | opens with s1's artifact in its working context — it does **not** re-derive the cause |
| s3 | CLOSE | — (shell) | the operator's signed command | — | `node bench/load.test.js` → exit 0 → **green** |
| s4 | PR | deterministic git | hitl close | — | **merge stays human, forever** |

**The contrast with config-v1 is the point.** Under config-v1 this same job **could not even
START**: a diagnosis goal has no predicate close, so it lands `close-unsupported` at validation.
And if it had started, its worker would have been handed all five tools at once, with no plan, no
step boundary, and **no wire between attempts** (F21) — which is precisely the run we measured
three times.

#### 5. What each attempt sees — the prompt contract

F10, F13 and F21 all lived here, so it is stated precisely. A step worker's prompt contains:

- **the step's action** — the task, and only this step's task;
- **the ABSOLUTE repository root** — F10: bare-agent's shell tools resolve relative paths against
  the *process* cwd, so a worker not told the root works blind (and, once, closed in bareloop's
  own directory);
- **the close's current output on the tree, or the gap from the previous attempt** — F13: a worker
  asked to fix a failure it cannot see is a worker guessing;
- **the "Working context (read-only)" block** — every prior step's artifact, labeled by step id.
  This is F21's wire: the channel from attempt N to attempt N+1, and from step to step, that
  config-v1 structurally lacked;
- **a cut-off notice** if the previous attempt hit its bound (F20).

And what it **NEVER** sees: the **budget**; the **close command**; the **plan validator**; **other
steps' tool grants**; and the arbiter's own books — the **gate audit**, the **spine**, the
**`.smoke` store** (explicit `fs.deny`, unchanged). **The emergent middle does not read the
arbiter's books.**

### Doctrine that rides with plan-v1

- **Per-step Gate.** Each step gets a **fresh Gate**, so `limits.maxTurns` IS the step bound
  natively — this **retires the F20 `loop.stop()`/`stoppedByBound` workaround (BA-3)** at the
  bareloop layer. The one run ledger still meters per round across gates (F12 stays).
- **`tree-changed` as a WRITE step's exit makes "the attempt wrote nothing" a named red by
  construction** — the F21 null-attempt problem becomes a structural red, not a silent
  non-event.
- **Verdict classes, restated for plan-v1:** **green** (predicate closed) / **soft-green**
  (only advisory/rubric checks passed — NAMED now, executed at N4; rule adopted verbatim from
  the sibling repo relayfact: *a rubric can OPEN a question, it can never CLOSE the loop*) /
  **hitl**.
- **Known bound, stated plainly:** inner exits verify **FORM, not truth** — a confident wrong
  step artifact poisons downstream steps via feed-forward. Containment is the **outer close +
  the one replan**; inner exits are **progress gates**, and there is **exactly one arbiter**.

### Differentiation vs relayfact (sibling repo) — recorded so we don't rebuild it

relayfact solves a task **once and discards the plan**. bareloop learns a **JOB** — the plan is
the **persistent, improving, ledger-attributed artifact** across cadenced runs. **If bareloop
threw the plan away each run it would BE relayfact and should be archived.** The persistent,
minted, contrast-attributed plan is the whole reason this repo exists.

### Deliberately NOT adopted in v1 (bareagent surfaces held back)

- `recurse()`'s `spawn_child` self-recursion and forced fan-out — **a worker that spawns
  children is a worker whose bound we cannot yet reason about (the F20 class)**. Planner's flat
  DAG only, executed sequentially.
- `refineLeaf`'s lesson **IS** adopted as doctrine: the fed-back gap critique is the primary
  correction lever (adaptlearn F14, re-confirmed).

### Decisions locked by interview 2026-07-14

1. **config-v1 dies; plan-v1 replaces it.**
2. **One replan per run** (mirrors one-revision).
3. **The first experiment stays job #1** (litectx planted bug), with a **scratch POC of
   Planner + feed-forward BEFORE the rewrite** — prove the wire moves the outcome before
   building the schema around it (POC-first; the F19/F20 lesson that a fixed mechanism need not
   move the outcome applies directly).

No rung is renumbered: plan-v1 is what N2 becomes, N3 keeps its kill-switch (now with a real
subject), §10 stands.

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
## Addendum v1.13 — 2026-07-15 (the layer map + the stage-verdict rule; hamr)

**`docs/01-product/LAYERS.md` is the canonical plain-language map** — the flow, the wheel,
the verbs, the verdicts, and the four layers, stated without package names (primitive vs
implementation was a real source of confusion; the map's appendix is the ONE place the
mapping appears). It renames nothing and adds no doctrine beyond the one decision below;
where it and the PRD could ever disagree, the PRD wins and the map gets fixed.

**Stage verdicts for micro-wheels (decided 2026-07-15):** a micro-wheel (a plan-v1 step's
inner loop) validates against **its own eval where one exists** — a mechanical check the
stage cannot game; where none exists it **inherits judgment from the parent wheel's verdict
chain** (green / soft-green / hitl). Learning credit mints only at an honest close: a stage
may declare itself settled to move on, but it cannot mint inheritance from its own say-so.
(This closes the open question the layer map calls "the hard one" — who judges a stage that
has no exit code.)

**Build order confirmed:** fire Layer 1 end-to-end on the job #2 patient (first real turn of
the wheel) → Layer R, the within-run root/ratchet (the F21 fix; within-run scratch and
across-run inheritance are different scopes, now formally separated) → Layer 2, plan-v1
micro-wheels → Layer 3, N3 inheritance.

---
## Addendum v1.14 — 2026-07-15 (worker-crash attribution: one carve-out from the forbidden zone; approved by hamr)

**The rule (F32, measured need in F31: 4 of 7 battery rows).** A `crashed` close verdict is
still not a verdict (v1.11 stands) — but it no longer always escalates. When the arbiter's
own books prove the worker wrote files this run (the gate audit's allow-decision write/edit
lines, run_id-scoped) and the precheck proved the close judged at baseline (a crash at
precheck still stops for zero tokens), the crash is attributed to the worker's edit and
routed as the DISTINCT verdict **`worker-crash`**: non-terminal, fed back as a gap naming
the files, retried under the unchanged caps. Instrument crashes — crash at precheck, crash
with zero writes, or an unreadable audit — keep their forbidden-zone names and never retry.
The attribution seam is injected into the dumb shell like the redactor: ralph consults it,
never reads the audit itself, and the fail mode is always the OLD behavior (escalate).

**Why this does not weaken the arbiter split:** nothing emergent touches the routing — the
seam is wired by the interpreter from the gate's own audit, the verdict vocabulary is shell
territory, and the worker gains no new capability, only information about its own effect on
the tree. The verdict stays distinct (never plain `crashed`, never `needs_revision`) so no
contrast downstream can confuse "the suite failed" with "the worker broke the suite".
Validated live the day it landed: P3 rerun routed all three crashes, fed back the file list
each time, and stopped at an honest cap-halt — pass 1's same plant died at attempt 1 with
the worker never told. Feedback DELIVERY is now proven; feedback CONVERSION is battery
pass 2's question, pre-registered as a separate axis (F32 lesson).

---
## Addendum v1.15 — 2026-07-15 (external field evidence folded in; two SURE learnings highlighted — hamr assignment)

**Source:** `docs/00-context/RSI-LEARNINGS.md` — the thersibook/Recursive corpus (12
sources, June 2026), read and folded against this PRD as watch-for / validate / learn /
gotcha items. This addendum records only what changes standing expectations; the full
fold lives in the context doc.

**SURE learning 1 → §3 law #1 (the arbiter split).** Every system in the corpus that let
optimization pressure meet a fixed verifier got gamed (Recursive: reward hacking on all 3
benchmarks; Meta-Agent Challenge: label extraction; PostTrainBench: spontaneous test-set
training). The split is confirmed as the founding constraint — AND the corpus adds the
standing expectation the one-time F17 fix did not: **verifier hardening never ends.**
Every battery pass carries a "did the worker exploit the close?" audit line, expected to
occasionally find something. A pass that never finds anything is a pass whose audit
should be re-read, not a clean bill.

**SURE learning 2 → §1/§2 premise (scaffolding, not weights).** The field's biggest
result (LIFE-HARNESS: 88.5% avg relative gain across 116/126 settings with weights
FROZEN; the harness evolved on one cheap 4B model transferring to 17 others) is this
PRD's premise measured at scale — and its stated method ("the failure taxonomy is what
makes the method work": classify each failure by lifecycle position, fix that layer,
keep edits auditable and revertible) is this repo's FINDINGS discipline under another
name. Consequences confirmed: keep paying for findings — they are the product; cheap
workers + evolved harness is the correct spend shape (the model rule holds).

**Pre-registered adoptions (validated at their rungs, not now):** N3 acceptance becomes a
CL-BENCH-style paired control — inheritance-ON vs inheritance-OFF on the same
non-identical job set, only the normalized difference counts as learning ("a learning
claim is just a capability claim wearing a memory costume"); Layer R takes the
rejected-edit-buffer shape (failed rules retained as negative feedback, never silently
retried); rule minting at N3 gains a memorization audit (general rule vs memorized
answer) before anything inherits. GOTCHA on the soft-green ladder: a rubric close is
self-consistency in disguise (Agent0: breaks on non-checkable tasks) — it needs its own
judged-floor analog before it can gate anything.

---
*Seed written 2026-07-10 in adaptlearn (v0.11.0). Named `bareloop` 2026-07-11 (npm-free at
check time; suite-family name chosen deliberately — the product is the bare suite's flagship
consumer, and "bare loop" states the §8 minimalism: no swarm, no orchestrator, one process
per run). Bloat-audited and locked v1 2026-07-11: the seed was already lean — the audit's
changes were the §6→§9 dedup, the §4 secrets invariant, and the §5 mobile mandate. §3's
citations stay: every parenthetical is a load-bearing F-ref. Amendments from here are dated
addenda, not rewrites.*

## Addendum v1.16 — 2026-07-16 (F37: strategy-as-prose is inert — plan-v1's premise measured before plan-v1 exists; hamr go on the bound package)

The TESTGEN calibration curve (F37, TESTGEN-PREREG amendments 2026-07-16d/e) read out
three prompt levers against the same 24-round attempt bound: disclosing the bound moved a
never-writing worker to writes-in-3-of-7 (a coin flip, not a fix); adding an explicit
pacing strategy in the spec description moved nothing (0/6 wrote, the mandate violated
every run); no prompt condition produced a graded row.

Two consequences land in doctrine:

1. **F19 gets its mirror: capability without strategy is inert, and strategy without
   ENFORCEMENT is inert.** A persona/strategy line can activate a verb; it cannot install
   a workflow. Workflow discipline (write-early, buffer-on-disk, bounded reading) must be
   structural — plan-v1's bounded steps with declarative form-check exits, the RLM
   buffer + refine-leaf shape (design record 2026-07-16) — never advisory prose. This is
   Layer 2's load-bearing premise, now measured (cheaply, at calibration) rather than
   assumed.
2. **Budget-class bounds move together or they lie.** Raising the round bound without the
   dollar budget would have re-bound money at ~round 38 (measured ~$0.033/round) — the
   same constraint-decomposition lesson as v1→v2, run forward. hamr's approved package:
   `TURNS_PER_ATTEMPT` 24→40 (one hoisted constant now feeds the Gate's `maxTurns` and
   the per-attempt cutoff), spec v4 with the disclosure sentence saying 40 and
   `budgetUsd` $2.00, calibration stop $12. The advertised bound and the enforced bound
   stay the same numbers on both axes.

## Addendum v1.17 — 2026-07-18 (F38 + F39: the wheel is real, gap GENRE is the boundary, and Layer 2 inherits a measured requirement)

The TESTGEN battery (F38, first conversion ever observed in this program) and the
semantic-stall probe (F39, a Wizard-of-Oz Layer R) close Layer 1's qualification
question and mint three doctrine points:

1. **Feedback buys improvement — for feedback that names a wall.** Mechanical gaps
   (counts, named forbidden patterns, form floors) converted 3/3 in battery rows with
   attempts left. This is the load-bearing validation of the entire loop premise: the
   attempt after the gap was better BECAUSE of the gap.
2. **Semantic gaps do not convert, and it is not a memory problem.** "Strengthen
   assertions on these functions" produced inaction (B4 att-3; probe P4) or
   well-aimed tests asserting imagined behavior (probe: 3/3 acting rows died at the
   clean wall, F27's fingerprint). The probe hand-delivered everything a Layer R
   notebook would carry — state, score, bar, per-function scoreboard — and no row
   lifted kill-rate above baseline. The scoreboard fixes AIM completely (14–18 of 18
   named functions targeted); it does not fix verification. Structural cause: the
   worker authors tests it can never execute (no `run` verb — the hard line stands),
   so its first contact with reality is the close that ends the attempt.
3. **Layer roles, sharpened by measurement.** Layer R = continuity (attempts stop
   repeating themselves, F21/F38) — justified, but measured NOT to be the semantic
   fix. Layer 2 = the semantic fix's shape: bounded steps with in-run verifiable
   exits (e.g. clean-run-passes as a form check) that convert a quality ask into the
   mechanical genre the wheel demonstrably handles. "Notes + self-check succeeds" is
   now the single untested claim of the thesis — it becomes testable the day Layer 2
   exists, and its test is already designed (same job, same close, same frozen bar).

Cost note for future harnesses (16g reproduced on the probe): budgets must fund the
attempt PLUS its close — 3 of 7 probe launches died at the money cap rounds 33–39,
before grading, turning $5.82 into unreadable rows.

## Addendum v1.18 — 2026-07-19 (two F40 latents become named future-rung requirements; the tripwire fix refuted by the suite's own rows — hamr review)

F40 left two text-mode defects parked. hamr's challenge ("which is it?") forced both
into a named destination, and checking the first proposed fix against the real code
killed it — the same class as F40 item 1, caught before landing this time:

1. **Per-step deliverable targets — a Layer 2 (plan-v1) step-schema requirement.**
   Today ONE `opts.target` threads to every text-mode step — **by design**: successive
   steps are gates refining the SAME artifact (fix→style under suite-then-lint; §6's
   review→fix is this shape), and six passing run rows — including the pre-registered
   cap-not-estimate test — deliberately use it. So the proposed validator tripwire
   (red on ≥2 text-mode predicate steps) was REFUTED before landing: it would invert
   tested, designed behavior. The clobber is a defect only when two steps carry
   DISTINCT deliverables — which job-v1 cannot even express. The capability and the
   fix are the same thing and land together: **plan-v1 steps declare their own target
   path**, killing the clobber class and enabling multi-deliverable jobs.
2. **Genre-aware extraction — a non-code-rung requirement (hamr's framing).** The
   artifact parser must key on the job's close class: green/predicate → tool mode,
   nothing parsed; soft-green → mixed (text + gated tool calls); hitl/document → the
   WHOLE reply is the deliverable — no fence hunt at all. This is where the F40
   preamble-fence defect (a helper fence in the 5-line window mistaken for the
   artifact) gets fixed — designed against REAL document-job replies, never imagined
   shapes (the F40 `collected`-pattern lesson: a rule validated only against a
   fixture is wrong against the instrument).

Neither ships code now; both are requirements at the rung that builds them, recorded
here and in LAYERS.md so no one has to remember this conversation.

---
## Addendum v1.19 — 2026-07-19 (Layer R design locked by interview; built same day; acceptance pre-registered)

**Interview decisions (hamr, 2026-07-19; full record + POC results in
`docs/plans/2026-07-19-layer-r-design.md`):** the root is (1) SHELL-authored — assembled
mechanically from the arbiter's own books (F32 write audit + kept-failure lines), the
worker authors nothing and gains no verb; (2) FIXATION-GATED — inert until consecutive
attempts rewrite the same files without moving the reds (RSI §3.3: cost-neutral when
inert, the lift is a fixation phenomenon); (3) ESCALATING summary→verbatim — both stages
field-tested, per-stage attribution pre-registered (stages fire on different attempts),
with a revert path to whichever stage the battery proves is the lever; (4) accepted by a
REPETITION-DROP read, ON vs OFF, on job #4 — green-rate recorded but never the bar
(F39: Layer R's claim is continuity, not conversion).

**Built (`src/root.js`, wired in `interpret`/`runJob` as `layerRoot`, default OFF —
2026-07-21; ON is unproven while fixation is extinct (F41), so the field read defers to
Layer 2 before the default flips):**
detection compares normalized kept-failure lines (POC-measured: spec-reporter lines are
never byte-stable — duration stamps; normalization is comparison-only, the delivered gap
untouched) plus per-attempt write-sets from the allow-decision audit (a denied write is
never counted). Verbatim content is teed at the translator seam memory-only, scrubbed,
capped, trims announced; spine event `root-injected` carries counts and paths, NEVER
content (append-only law). Within-run scratch only: state dies with the run, inheritance
stays verdict-gated (v1.13 scope separation unchanged).

**The rung is NOT closed by the build.** It closes at the pre-registered acceptance
battery (repetition metric + read rules frozen in a commit before any number exists).
LAYERS.md's Layer R status line moves only then.

---
## Addendum v1.20 — 2026-07-20 (F41: fixation in remission; Layer R ships armed-and-inert, field read deferred — supersedes v1.19's battery plan)

**The measured fact (F41 + follow-up).** Before v1.19's ON/OFF battery spent a dollar,
base-rate reads asked whether the disease Layer R treats still exists: the $0 archive
sweep (109 spines, jobs #2/#4, all structurally OFF-arm) read 0 fixated in 10 red→red
pairs; probe 1 (job #1 rebuilt, F18-era plant) read INCOMPLETE — 2/3 attempt-1 greens
plus a $1.50 budget that funded exactly one judged attempt; probe 2 (hamr-ordered
"harder close": THREE stacked plants across three subsystems, budgetUsd re-signed to
$4.50) read CONCLUSIVE — 4 eligible pairs, 0 fixated, all 4 different-file. The worker
cleared roughly one subsystem per judged attempt and never repeated itself. Total
evidence spend: $10.12.

**The interpretation, bounded.** F21's fixation was a symptom of the broken-loop era —
no attempt bound (F20), no gap channel (F21), no edit verb (BA-13), 4096-token output
truncation (F30). Curing the loop cured the repetition, on every job shape this repo
owns. This does NOT validate the ratchet's effect (nothing fired); it validates its
COST: zero injections, zero tokens, zero interference across every probe run — the
design condition "inert when not stuck" observed in the field.

**Disposition (per the frozen decision table, operator-accepted).** Layer R ships ON by
default, armed-and-inert. The pre-registered repetition-drop ON/OFF read is DEFERRED —
not cancelled — to the first run whose spine records `root-injected` (expected pressure
point: Layer 2's narrow micro-wheel steps, where per-step scopes concentrate rewrites).

> **SUPERSEDED 2026-07-21 (default flipped to OFF).** On review before release, the
> "ships ON" call was reversed: since fixation is extinct (F41), ON has never won its own
> A/B, and the doctrine is not to default-enable an unproven lever. `layerRoot` now
> defaults `false` (armed but off; `true` is the ON arm). The deferred ON/OFF read is
> unchanged AND now also decides the default: the first Layer 2 job that produces natural
> fixation runs it, and the result flips the default to `true` (ON helps) or keeps it
> `false` (no lift). See `docs/01-product/LAYERS.md` (Layer R note). F43 also split the
> detector (intent) from the note (outcome) in the same review cycle.
The rung mints no learning claim; v1.19's job #4 battery plan is superseded (its
patient's failure genre is inaction/semantic-stall, which the ratchet deliberately does
not treat — F38/F39). Spec change recorded: `litectx-maintainer` `budgetUsd` 1.5 → 4.5
(re-signed) — the advertised budget must fund the attempts the cap promises; $1.50
funded one judged attempt and made across-attempt evidence structurally impossible.

## Addendum v1.21 — 2026-07-21 (external PRD review folded: four adoptions placed at their rungs, six rejections recorded with reasons — hamr assignment)

**Source:** an external model's assessment of this PRD (10 claimed gaps, framed as "safe
config-inheritance vs self-healing agent"). Fold rule as v1.15: record only what changes
standing expectations. The review's structural reading was sharp; its evidence reading was
blind — most proposals re-request capabilities this program already measured inert (F39:
hand-delivered state bought zero conversion; F22: agent-authored knobs were decoration)
or re-propose what a design law exists to prevent (law #4). Four items survive; each is
placed at its rung below **so the rung knows what to test and what to look for**. The
rejections are recorded WITH reasons so the next reviewer doesn't re-find them.

### Adoption 1 — drift detector + `drift-red` (rung: N3, lands with inheritance)

The review's one genuine hole: it beat the PRD with its own rule. v1.6's standing law
says every loop gets its named red and its undeletable signal — but loop 2 (across-run)
has an **admission** gate only; nothing watches a MINTED plan degrade after admission.
§9's fit-to-pass-drift handle said "measure retention/drift on job #1's real timeline"
and named no instrument. v1.15's "verifier hardening never ends" makes the gap sharper:
a plan can rot because the environment moved while the plan stood still.

**Shape (arbiter-side, agent-inexpressible):** a ledger fold comparing trailing-window
green-rate against the plan's mint-time baseline; a trip emits spine event `drift-red`
and FLAGS on the trust surface. Rollback to last-known-good is merge-class — **human,
never automatic**; the detector detects, the human decides.

**What to test at the rung (v1.6 instrument obligation):** ships with must-fail
fixtures — a synthetic ledger with real degradation MUST fire it; a noise-only ledger
MUST NOT. The trip threshold is derived from the measured green base rate at that time,
never guessed (F24/F41 discipline: a drift alarm over n=3 runs is an anecdote — the
detector stays silent below the n its own fixture battery proves readable). Arbiter
territory: the build lands only with hamr's explicit go at N3; this addendum scopes it.

### Adoption 2 — bound-pressure reporting on the trust surface (fold: N3+; surface: N6)

The legal form of the review's "budget proposal" ask. The hard line stands and includes
proposal channels: **a proposal channel is a negotiation channel** (§8, agenticSeek
smell) — the agent gets no verb. Instead the ledger's per-step cost rows fold into a
trust-surface view: "step X hit its bound in M of N runs"; the human decides re-signing.
Same information, zero agent capability.

**What to test at the rung:** backtest against archived spines — the view MUST make the
TESTGEN rounds-vs-money whack-a-mole (F37/16g: money cap binding at ~round 38 behind an
advertised 40-round bound) visible from the rows we already have. A bound-pressure view
that cannot surface a known historical bind fails its acceptance.

### Adoption 3 — lineage-read as a pre-registered THIRD ARM of the N3 control (not a feature)

The review asks for an agent-readable lineage API and assumes it helps. F39 measured the
within-run version of that assumption dead: hand-delivering full state fixed AIM
completely and moved conversion zero. The across-run version is a different claim — so
it enters as an **arm of the v1.15 paired control**, never as a shipped capability:
inheritance-ON+mechanical vs inheritance-ON+agent-readable-lineage (vs OFF). Read-only,
attenuated, arbiter's books still denied; the lineage view is a summarizing point and
carries its own attenuator manifest (v1.6 commitment #4).

**Gate before any build:** a cheap pre-probe — the same planning prompt with and without
lineage context in hand; if the drafted plans are identical, the variable isn't wired
and the arm dies for under a dollar (two should-differ conditions matching is a finding).
**Default prediction: NO lift** (F39, CL-BENCH). The arm exists to measure the claim,
not to deliver the feature; a real normalized delta is the only thing that promotes it.

### Adoption 4 — HITL protocol pins (rung: N6 panel; pinned now so the ladder inherits them)

Two rules the soft-green/hitl ladder needs that no addendum had written down:

1. **Confirm timeout = NO-MINT.** A soft-green awaiting HITL confirmation that times out
   keeps its run verdict but mints nothing — silence is never consent; there is no
   default-green path.
2. **The human MAY edit a proposed plan before minting — but an edited plan is a
   re-authoring boundary** (v1.11 rule #2): its toggle coverage resets and no contrast
   bit may be counted across the edit. Human improvement is welcome; laundering it into
   the lineage's attribution is not.

### §8 clarification (recorded here; §8 stands as written)

The review correctly observed the PRD never states whether "the agent builds its own
workflows" means configuring or inventing. It means **configuring**: the agent proposes
step DAGs, bounds, and tool selections from the closed, gated, admitted menu; it never
invents primitives and never authors freeform scaffolding. This is a deliberate position
paid for in F22 (of seven agent-authored knobs, one was live) and law #1 — not an
oversight. Stated here so future reviewers read position, not omission.

### Rejections (recorded with reasons — do not re-litigate without new evidence)

1. **Scalar value function** — proposes exactly what law #4 forbids and v1.6 made
   lintable (no function in the tree combines verdict and cost; CI-checked). A "learned"
   value fit on single-digit greens per lineage is noise wearing a regression costume.
   Cost already ranks among greens; that is the whole legal optimization surface.
2. **Agent-driven reflection phase** — the extractor IS the between-run consolidation;
   making it agent-driven is precisely the capability claim the N3 paired control exists
   to measure, and its output is the semantic genre F38/F39 showed does not convert.
3. **MCP bridge** — an arbitrary MCP tool is an untyped verb the gate cannot judge;
   admitting one reopens the `run` lock (the danger is in the ACTIONS). Interop would
   require per-tool action typing through the gate first — a real, separate, later
   project, not a v1 gap.
4. **Plan mutation/crossover search** — no readable base rate exists to score variants
   against (F24/F41 discipline), and unlimited variant generation launders thrash as
   adaptation (plan-v1's one-replan law). One-knob mutation IS the search operator until
   Layer 2 makes greens cheap and frequent enough to read a delta.
5. **closeProposer** — an agent proposing the judge it will be graded by is
   judge-is-ceiling (v1.15 SURE #1) in its purest form. The proposing-vs-authoring
   distinction is real and the request-red ladder is its shape; PARKED for hamr,
   not before deterministic closes are boring.
6. **Cross-job pattern transfer** — correctly observed as structurally prevented; that
   is the founding attribution constraint working. The bridge already exists in
   doctrine: a rule the N3 memorization audit certifies as GENERAL (not a memorized
   answer) is the transfer candidate, and the lineage key already supports per-task-family
   splits (§9/V3). Post-N3, evidence-gated.

## Addendum v1.22 — 2026-07-22 (Layer 2 ACCEPTED: the agent authors a workflow that clears the bar — F47)

The Layer 2 rung passed its pre-registered acceptance gate (TESTGEN-PREREG §2026-07-22a/b,
FINDINGS F47). Job #4 ran through the REAL plan flow — the agent surveys, **drafts the
plan itself**, the validator gates it against the signed spec, per-step check-loops run,
the operator's grader closes — on `anthropic-api` / claude-sonnet-5, read against F39's
0-conversion baseline and the F46 hardwired POC.

**Result (frozen n=3, valid acting rows only):** 3/3 L2-CONVERT (≥2/3 bar → accepted);
3/3 green above the 45% bar (67.5/55/55, surpassing the POC's 27.5/40/37.5 with 0 at 45);
**3/3 the agent composed the `check-passes(clean-run)` exit itself** — the build-specific
claim the POC (which hardwired the composition) could not test. The step check-loop alone
drove every green (no grader fix loop fired). All writes fenced, source frozen, secrets
clean; the F45 spend guard stopped an unpriced casualty; 7 provider-red casualties across
an Overloaded window (never evidence), $27.36 of $30.

**What this settles.** The thesis's single untested claim — "notes + self-check succeeds"
(F38/F39) — holds on the emergent flow, not just a hardwired one: the agent authors the
workflow structure (a plan of bounded steps, each with an operator-signed self-check it
selects but cannot author) under an inexpressible arbiter, and that structure converts a
job the same worker failed 4/4 in F39 AND reaches the owned bar. The genre chain closes:
F38 (mechanical converts) → F39 (delivery/state is not the gap) → F46 (an in-run check
translates semantic→mechanical, hardwired) → **F47 (the agent does it itself, and clears
the bar).**

**What it does NOT claim.** n=3 is existence + direction, never a rate; the delta over the
POC's 0/45 is an unminted rounds-vs-decomposition confound (the real flow gives far more
total rounds AND per-step structure). Acceptance is the conversion read; the 45-bar greens
are the recorded secondary.

**Consequences (landing).** The "Layer 2 path closes green end-to-end" milestone is met, so
**`steps[]` and config-v1 sunset on landing** (design record decision 6 / §110). No row
recorded `root-injected` → Layer R's ON/OFF flip did not trigger; `layerRoot` stays OFF,
decision unchanged (F41 consistent). Next rung: **N3 — executed inheritance** (the workflow
persists and improves across runs; the paired inheritance-ON/OFF kill-switch, v1.15). Two
gaps named by this battery, carried forward: **within-run resume** from a transport-hit
plan (the plan-as-executed spine already holds the checkpoint; not yet wired), and a
**separate clipipe-subscription battery** to validate the native surface (module 4d) on its
own baseline. Process note (F47): run 1 fired without the frozen pre-fire health probe (4
casualties), and a single-message liveness probe is not a sustained-load throughput check.

## Addendum v1.23 — 2026-07-23 (the two workflow shapes: plan-v1 is the target for ALL verdicts; legacy `steps[]` sunsets at the verdict-classes rung, not at Layer 2 landing — F49/F50, hamr)

**Corrects v1.22.** v1.22 recorded "`steps[]` and config-v1 sunset on landing." That was
premature for `steps[]` (config-v1 is genuinely dead — F22). Layer 2 landed for the **green
verdict only**: plan-v1 v1 admits `green` and LOCKS `soft-green`/`hitl` (`LOCKED_VERDICTS` —
declaring one is a `request-red`). So the legacy `steps[]` path could NOT retire at landing —
it uniquely hosts the two locked verdicts, and one of them (`hitl`) is the only *working*
human-verdict path (the draft-PR flow, `run.js` `openDraftPr`).

**The mapping today (honest, no papering over):**

| verdict | shape it runs on | status |
|---|---|---|
| `green` | **plan-v1** (`planrun.js`, agent-authored plan) | shipped v0.5.0, ACCEPTED (F47) |
| `soft-green` (rubric) | legacy `steps[]` (`interpret.js`, operator-authored) | locked in plan-v1 |
| `hitl` (draft-PR) | legacy `steps[]` (`interpret.js`) | locked in plan-v1 |

**Is the split principled? No — it is a build-order artifact, not a design.** There is no
reason `soft-green`/`hitl` "belong" on the old shape; plan-v1 is the go-forward home for ALL
three verdicts. The new way is better on the product's own thesis — **the agent authors the
workflow** (validator-gated before tokens, one wallet, in-run self-checks F46/F47, and now
Layer R F50). Legacy is operator-HARDCODED steps: a human writes the workflow, the exact
thing bareloop exists to not require ("automate this — I don't know the best workflow"). If
you already know the steps you do not need the emergence; that is relayfact's job, not
bareloop's (§8). **Nothing about legacy is better for the product's goals.** The one real
reason it stays is pragmatic sequencing: its hitl middle is working code today, and hitl is
not needed until the non-code-jobs goal (§8 later-goal) — keeping it is cheaper than
rebuilding hitl before it is wanted, NOT a reason to preserve the split.

**Sunset criteria (the honest gate — supersedes v1.22's "on landing"):** legacy `steps[]`
retires when plan-v1 **admits AND implements** both locked verdicts:
1. **`hitl` in the plan flow** — the draft-PR / human-verdict path ported onto `planrun.js`
   (the door to non-code jobs: resume/LinkedIn, §8 later-goal).
2. **`soft-green` in the plan flow** — a rubric close, WITH its RSI caveat first: a rubric
   close is self-consistency in disguise and needs a judged-floor analog before it can gate
   anything (RSI-LEARNINGS / v1.21).

That is the **verdict-classes rung**, sequenced after Layer 3 (the soft-green/hitl ladder
follows the deterministic-close infra, §8/§10). Retirement is a **rewrite-deletion** (the
`run.js` legacy for-loop, `interpret.js`'s legacy dispatch, `job.js`'s `steps[]` validation,
`interpret.test.js`) done in one deliberate gated pass — never a copy (graduation is a
rewrite). It is a **product-shape decision parked for hamr's explicit go**, not shipped
unilaterally.

**This session (F49/F50), landing in v0.5.1.** Layer R was wired onto plan-v1 — one root per
EXECUTE step (red-set = the exit evaluator's own gap) and one in the outer close-fix loop
(red-set = the close's own `gapKeep`) — moving the **last capability that was stranded on
legacy** onto the go-forward surface (so it does not retire with legacy). A plan-flow job can
now emit `root-injected`, making the pre-registered ON-vs-OFF default-flip read (v1.20)
possible on the accepted surface; default stays OFF until that evidence lands (F41). F49
hardened the agent-authored `artifact-written` exit regex — a nested-quantifier ReDoS reject
at the validation gate (LOW self-DoS, no arbiter compromise; input-bounding refuted as
theater by a 33-char-body hang). After v0.5.1, the ONLY legacy-unique surface left is the two
locked verdicts above — so the sunset gate is exactly (1)+(2).
