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
theater by a 33-char-body hang), extended after a follow-up review that caught a false
negative in the flat-only scan (redundant-wrapper forms like `((a+))+` slipped through and
still hang >8s) — closed monotonically by propagating an inner repeat up through the
wrapping group, the fail-safe direction that only ever adds rejections. After v0.5.1, the ONLY legacy-unique surface left is the two
locked verdicts above — so the sunset gate is exactly (1)+(2).

**Parked (medium review #2, 2026-07-24): the Layer R tee wiring is duplicated across
`interpret.js` (legacy) and `planrun.js` (plan-v1)** — `fileHash` / `teeingTranslator` /
the deny-discard `policy` wrapper / `onToolOutcome` (the Finding 6/7 settle logic), ~60
lines, currently faithful (no live defect). NOT extracted into a shared helper, deliberately:
legacy is a scheduled **rewrite-deletion** at the verdict-classes rung (above), so one of the
two copies is *deleted*, not refactored — extracting shared arbiter-adjacent wiring out of code
slated for deletion is negative-value, and reconciling the two shapes (interpret gates on
`mode === 'tools'`; planrun is tool-only) risks reintroducing the blind-instrument class the tee
guards against (a future write-class verb bypassing the tee). Accepted cost: a **drift window**
until legacy retires — any Finding-6/7 change or new write-class verb must be applied to BOTH
files. The clean resolution is the legacy deletion itself; revisit only if legacy outlives
Layer 3 or the tee logic starts changing often.

## Addendum v1.24 — 2026-07-24 (Layer R default SETTLED OFF: the passive trigger was a dead pointer — cleanup before opening Layer 3, hamr)

**What changed.** The Layer R default-flip decision (`layerRoot`), left "provisional" since
v1.20, is now **settled OFF** and the passive trigger is retired. No disposition of Layer R
itself changes — the default was already `false` in code and stays there; what is removed is
a **dangling dependency** that would otherwise trail into Layer 3.

**Why it was a dead pointer.** v1.20 (as superseded 2026-07-21) deferred the ON-vs-OFF
default-flip read to "the first Layer 2 job that produces natural fixation," naming Layer 2's
narrow micro-wheel steps as the expected pressure point. Layer 2 is now ACCEPTED (F47,
v0.5.0) — those exact steps ran their full acceptance battery and **no natural fixation
appeared**. Fixation is extinct on every job shape this repo owns (F41). So the trigger waits
on an event the whole evidence base says will not occur passively: it can never fire on its
own, which is the blind-instrument / papering-over class in a scheduling coat.

**The settled disposition.** (1) `layerRoot` defaults **false**, settled — doctrine forbids
default-enabling a lever that has never won its own A/B, and there is now positive evidence
(all of Layer 2's runs) that the disease it treats does not occur on current jobs. (2) The
pre-registered ON-vs-OFF read is **not cancelled** — it is de-coupled from the dead passive
trigger and re-homed on a **deliberate manufactured-fixation probe**: force a real worker to
repeat, measure whether the note breaks the loop. Caveat F41 stands — strong models resist
fixating, so the probe may struggle to produce its own precondition honestly, and that
difficulty is itself evidence OFF is correct. (3) The Layer R wiring stays as F50 left it
(armed, correct, on the accepted surface); this is a decision-cleanup, not a code change.

**Scope note.** This is within-lane: Layer R is *within-run scratch*, not the arbiter (close
/ budget / fence / merge), and the settled value is the status-quo conservative direction
(OFF). Recorded here so Layer 3 opens with no Layer-R dependency dangling.

## Addendum v1.25 — 2026-07-25 (the N3 pre-probe programme reports: workflow generation is at ceiling; Layer 3's shape and test programme revised — F51/F52/F53, hamr)

**What ran.** Adoption 3 (v1.21) gated the agent-readable-lineage arm behind "a cheap
pre-probe … if the drafted plans are identical, the arm dies for under a dollar." That gate
has now RUN — three frozen screens, 55 real drafts of the SHIPPED plan drafter, **$1.80
total** — and it returns a more useful answer than the binary it was designed for.

**The three results.**
1. **F51 — lineage on a clear ask:** the positive control PASSED (the drafter does read
   lineage), but the movement is SHAPE MIMICRY: subtract the one lineage-named structural
   feature and the arms collapse (4.00 vs 3.86). No aim improvement; `memoHits` 0/8.
2. **F52 — method withheld:** the model WRITES THE STRATEGY BACK IN, near-verbatim, 8/8.
   You cannot manufacture a strategy gap by withholding strategy.
3. **F53 — target withheld:** aim does not degrade either; the vague arm even adds a
   discovery step more often. Mechanism audit: both arms simply cover EVERYTHING (A0 names
   15/15 functions in every plan), so this holds only on a small target surface.

**The load-bearing conclusion: plan-v1's workflow generation is at CEILING on every clarity
axis we can manipulate.** Clear ask, method withheld, target withheld — the drafted workflow
stays good. That is a strong PRODUCT result for the "Automate this job — I don't know the
best workflow" pitch: the pitch holds, unaided, today. It is simultaneously a hard constraint
on Layer 3, because **inheritance cannot lift an axis that is already maxed.** F51's ceiling
was not an artifact of how job #4 was written (F52 refuted that); it is a property of the
genre and the model.

**Where inheritance could still earn its keep — the revised hypothesis set.** Everything
tested so far is GENERAL METHOD, which lives in the weights, and memory reliably loses to ICL
on general capability (CL-BENCH). The remaining candidates are knowledge that is absent from
BOTH the spec AND the weights:
- **(i) Patient-specific facts** — "this repo's conftest fakes are sync-only", "that fixture
  is required", "the last attempt died on X". Local, undiscoverable from weights, only
  partly visible to a bounded scout. **This is the strongest remaining candidate and it is
  untested.** CL-BENCH's verdict does not reach it, because it is not capability.
- **(ii) A WRONG default** — the model's obvious strategy structurally fails, so notes must
  OVERRIDE a confident prior rather than fill a void. A different mechanism from anything
  tested; needs patient engineering.
- **(iii) Variance and efficiency, not mean quality** — F53's unregistered observation
  (0/16 invalid first drafts WITH lineage vs 7/39 WITHOUT) is a HYPOTHESIS, confounded and
  not minted; if it survives a frozen test, inheritance's value is fewer malformed drafts and
  lower spend-to-green, NOT better plans. Cost and capability stay separate axes (F51
  doctrine) — but a real cost win is still a win for "repeated, long" jobs.

**Adoption 3 status: NOT promoted, NOT killed — narrowed.** The arm does not enter the
battery on the strength of plan-shape movement, which mechanical reuse reproduces
deterministically for $0. It re-enters only if (i) or (ii) shows room in its own frozen
screen. Default prediction stays NO lift.

**Layer 3's revised shape.** Mechanical inheritance is the PRIMARY arm (it delivers the only
thing that demonstrably transfers — the plan skeleton — without a model reading anything).
Its own marginal value is small at the planning layer (cold drafting already scores 4.14/5)
and remains UNPROVEN on outcome. What mechanical reuse carries across NON-identical jobs is a
design question the probes answered incidentally: the SHAPE, never the content.

**The test programme (revised, ordered, with gates).**
- *Phase 0 — cheap planning gates (~$1 each, decide which arms are alive).* T1 clear-ask
  ✅F51 · T2 method-withheld ✅F52 · T3 target-withheld ✅F53 · **T4 patient-quirk lineage
  (candidate (i)) — next, highest value** · T5 wrong-default (candidate (ii)) — costliest,
  lowest priority.
- *Phase 1 — build + guards.* **T6 `drift-red`** (Adoption 1) with MUST-FAIL fixtures before
  trust, threshold from a MEASURED base rate never guessed · **T7 bound-pressure ledger fold**
  (Adoption 2) — feasibility CONFIRMED at $0: 115 archived spines carry 79 `attempt-bounded`
  + 63 `cap-halt` events, so its acceptance (surface the F37/16g rounds-vs-money bind) has
  real data and can proceed independently of the inheritance verdict · **T8 mechanical
  inheritance** (carry the skeleton).
- *Phase 2 — the verdict.* **T9 the paired battery**: ON-mechanical vs OFF (plus ON-lineage
  only if Phase 0 revives it), non-identical job set, judged on FAULTS CAUGHT — never plan
  shape — with **spend-to-green pre-registered as a secondary axis**, and the memorization
  audit at mint time.

**Two gaps named, not papered over.** (1) **Patient inventory**: a non-identical battery
wants ≥3 distinct jobs; we own 2 (orchestrator, assess.py). Either build more patients or
state the limitation in the acceptance. (2) **A FLAT battery is a live possibility** — with
cold planning already near-ceiling, both arms may fail to beat OFF on outcome. Per
build-ladder discipline that is a legitimate rung STOP and the stop is a result; it is
pre-registered here so it cannot be rationalised later.

**Method note minted by this programme (added to the standing pre-flight list).** Before
firing any arm, ask **"is the CONTROL arm below ceiling on the outcome-relevant axis?"** —
distinct from "can the test show the negative?", and the check that would have caught F51's
design before it spent. A ceiling in the control makes every treatment arm unreadable.

## Addendum v1.26 — 2026-07-25 (Layer 3 probe programme closes: readable-lineage dead on four axes, plan surface tiny — but ALL findings are GENRE-BOUND; rung PARKED, next move is a full-cycle e2e on a second genre — hamr)

**The programme.** Five pre-registered experiments, $2.29 total, each frozen before any
number: F51 (lineage on a clear ask) · F52 (method withheld) · F53 (target withheld) · F54
(real prior-run failures — the scout-unreachable class) · F55 ($0 archival plan-share).

**What they establish.** The readable-lineage arm is DEAD on every axis the programme could
construct. The positive control PASSED (lineage transmits fine), so the blocker was never
delivery — **there was nothing left to transmit**: the cold planner already supplies the
method (F52, 8/8), already finds the targets (F53), and already does what the prior run's
failures would have taught (F54, control at 1.00). F55 then removed the fallback
justifications for the MECHANICAL arm: on completed runs, producing the plan is **~1–2% of
spend** and caused **0 of 15** terminations, with a 4% first-draft redraft rate — so
inheritance cannot pay for itself on planning cost or planning reliability.

**What they do NOT establish — three limits, stated so they cannot be quietly dropped.**
1. **Plan-level only.** Every arm measured the DRAFTED PLAN. No experiment ran a job to
   completion with vs without inheritance. "No difference in solving" is UNPROVEN; what is
   shown is "no difference in planning". Only the outcome battery can close this.
2. **Production cost ≠ leverage (F55).** Execution is 80.87% of spend and the plan steers it.
   A cheap-to-produce artifact can still be highly leveraged.
3. **GENRE-BOUND — the binding limitation, caught by hamr 2026-07-25.** Every experiment in
   this programme, AND Layer 2's entire acceptance (F47), ran on ONE job genre: TESTGEN
   (write pytest tests to kill mutants) on one patient family. Nine of ten job specs in
   `jobs/` are `aurora-testgen-*`. **"The planner is at ceiling" may simply mean "the model
   knows pytest test-writing cold."** On a genre the model does not know well, planning may
   NOT be at ceiling — and inheritance may matter there. Every F51–F55 claim carries an
   unstated "…on TESTGEN", and that qualifier is now explicit.

**Disposition: Layer 3 is PARKED, not stopped.** The evidence against the readable arm is
real and was cheaply bought, but it is visibly genre-bound, so a STOP would be minted on one
genre's evidence — the same over-reach this repo's doctrine exists to prevent. The
pre-registered STOP branch (v1.25) stays available and is NOT exercised yet.

**The product claim that is actually untested.** bareloop's pitch is "Automate this job — I
don't know the best workflow", and the agent-authors-its-own-workflow claim is DEMONSTRATED
ON ONE GENRE ONLY. The library itself is real and shipped (v0.5.1 on npm: ~4,750 lines across
14 modules, 393 tests; Layers 1/R/2 built, Layer 3 unbuilt by design) — but its central claim
has never been exercised outside TESTGEN.

**Next move (agreed with hamr): a FULL-CYCLE e2e run on a SECOND GENRE.** Not a memory
experiment — a product test. It answers three things at once: (a) can the agent author a
complete, workable workflow for a job that is not TESTGEN; (b) is "planner at ceiling"
general or genre-specific; (c) if the ceiling does not hold on a new genre, the inheritance
question reopens with a second genre to test it on. Candidate specs already in `jobs/` and
unused: `aurora-fix.json` (bug-fix genre) and `litectx-maintainer.json`. Design, patient
choice, and close must be frozen before firing, as every rung has been.

**Method notes minted this programme (standing).**
- **Is the CONTROL below ceiling on the outcome-relevant axis?** — a pre-flight distinct from
  "can the test show the negative"; a ceiling in the control makes every treatment unreadable.
- **A pre-flight must use the SAME metric the treatment will be judged by**, capturing the
  functional construct, not a prose shadow of it (F54: the pre-flight passed at ~72% while
  the real behaviour sat at 1.00, green-lighting an already-unreadable experiment).
- **Measure the SURFACE before building the feature** — F55 cost $0 from data already on
  disk and retired two comfortable justifications before a line was written.
- **Audit a phase-share denominator for populations that lack the phase** (F55: 59% of
  archived spend belonged to a code path that structurally cannot have a plan).

---
## Addendum v1.27 — 2026-07-26 (course correction: TIME is a cap, replan is time-relative, the four-component palette comes back, and acceptance becomes ONE green end-to-end that graduates a reusable bridge — hamr)

**Why this addendum exists.** hamr stopped job #5 mid-programme and challenged the build's
direction: *"is the agent still handed a problem and a set of primitives to choose from to
build its own bridge, or have we deviated?"* The audit (F56) says the direction is intact but
the surface has narrowed without anyone deciding to narrow it. This addendum is the
correction, and it supersedes v1.26's "next move" only in sequencing — the second-genre e2e
survives, as move **U** below.

**The premise behind all of it, stated by hamr:** *an LLM given open-ended scope exhausts it;
given bounds it uses all of them.* Every cap in this system is therefore also a steering
input, not merely a safety limit — which is why a missing cap (time) is a missing design
decision, not a missing guardrail.

### The four moves

**T — TIME is a first-class cap, alongside money.** A run carries a wall-clock bound. The
agent is TOLD its time budget at plan time exactly as it is told its round bound, and plans
against it. A run that cannot fit is a stop, and the stop is the result (build-ladder
discipline, unchanged). Shell/arbiter territory: operator-set, agent may only tighten, never
self-raised — identical to money (`budgetUsd`). Eventual, explicitly NOT v1: auto-sizing the
time cap from query complexity; v1 is operator-set so the first reads are clean.
**The read T buys:** given an explicit time budget, does the agent RUSH (front-load, shallow
steps, thin exits) or does it BUILD A BRIDGE THAT CARRIES IT (decompose to fit, spend the
budget it was given)? That question is unanswerable today because the variable does not exist.

**A — replan becomes TIME-relative, not exhaustion-only.** Today replan fires only when a
step exhausts its attempts, and an instrument stop is not exhaustion — so a replan has fired
**zero times in this programme** (F56). Retrigger it on time evidence: a step consuming a
declared share of the run's REMAINING time with its exits unmoved. The hard cap on replan
count stays (unlimited replanning launders thrash as adaptation, v1.12) — this changes the
trigger, never the ceiling.

**P — the primitive palette returns to what was agreed.** The build offers the agent
**write · select · compress · isolate**, each with its own verb list, and the agent chooses
per step as it sees fit. This is not new design: adaptlearn's F1 ruled "consume, don't build",
litectx ships all twelve verbs today, and the PRD's primitive-menu section already binds the
catalog — plan-v1 simply never re-expressed it after F22 killed config-v1 (F56). Two
corrections ride with it:
- **These are WORKER/STEP primitives the agent selects, not shell-invoked config hooks.**
  Hooks at fixed points is what F22 correctly killed; per-step selection is a different
  mechanism and the vocabulary-hygiene split (hook verbs vs worker tools) is retired in favour
  of one plan-level palette.
- **The step vocabulary widens beyond six fields** (`src/plan.js:43`) to admit what the agent
  needs to shape work: per-step model tier / effort, per-step attempt cap (tightening only),
  and per-step scope narrowing. Standing goal, hamr: *"offer it a library with everything it
  may need"* — the agent may always tighten, never widen, and the menu itself stays signed.
- **Unchanged and non-negotiable:** the arbiter is still inexpressible. Budget, close, fence,
  merge are never in the plan vocabulary. `run` stays locked forever. Widening the MENU
  remains an operator act requiring a fresh signature.

**U — one full-cycle e2e in USER MODE.** One sentence of problem statement, the way a user
would say it. A budget. A time cap. One close. No operator hand-solve, no arms, no genre
screen, no 400-word goal enumerating the grader's requirements. This is v1.26's second-genre
e2e with the operator scaffolding stripped, and it is the first run that tests the product
rather than the atom.

### The revised acceptance definition (hamr, this session)

**A workflow does not have to green everything. It has to green ONE job end to end.** That
one green graduates the bridge; the bridge is then REUSED on the following job of the same
shape and improves from there. The assumption, stated plainly: *if you have a problem and
want a workflow for it, one pass proves the bridge carries — the same bridge then serves the
same job again and gets enhanced.*

This replaces "prove it statistically before anything inherits" as the gate, and it makes
Layer 3's test dramatically cheaper: **the reuse run IS the inheritance-ON arm, and a
from-scratch run on the same job IS the OFF arm** — the paired control (v1.21 requirement b)
falls out of normal operation instead of needing a bespoke battery.

**Two conditions the operator proposes and hamr has NOT yet ruled on** (recorded here so
they cannot be quietly assumed):
1. **Graduation is to CANDIDATE, and reuse is the replication.** n=1 on a nondeterministic
   worker is this repo's own hard-won anecdote rule (F24 was withdrawn on exactly it). One
   green graduating a bridge is fine — provided a bridge that fails to carry the next job is
   DEMOTED, not defended. This costs nothing and adds no gate; it only names what the second
   run means.
2. **"The same job" must mean the same SHAPE, not the same instance.** A bridge reused only
   on a byte-identical job is a lookup table, and the memorization audit (v1.15) kills it.
   The value — and the only thing that can honestly be called learning — is transfer to a
   non-identical job of the same genre.

### Sequencing

**T and A first** (both small, both shell-side, both answer the live complaints: hours, and
never adapts) → **U** (the product test, now readable because time is bounded) → **P** sized
by what U shows the agent pressing against. P before U would widen the palette with no
baseline to attribute the widening to — the F22 mistake in the opposite direction.

**Prerequisite, not optional:** BA-18 (the provider has no request/idle timeout and
`withRetry` has no call sites) is filed upstream this session. The harness guard works, so it
does not block T/A/U, but every long run on that surface is a coin flip until it lands.

---
## Addendum v1.28 — 2026-07-26 (the user authors the DESTINATION, never the road: the check menu DERIVES from the close, and the close becomes declared stages — hamr)

**Approval.** Arbiter-shape change, approved by hamr in-turn this session; his words, verbatim:
*"i have no idea what ypu're talking about"* → after the kid/mom explanation and the evidence
audit → *"ok, whats next? #2 update docs"*, following *"agreed to all"* on v1.27's moves. The
challenge that forced it, verbatim: **"there shouldn't be user authoring anywhere, that defies
the point of bareloop."**

### The principle

**The user authors the destination. Never the road.** *"I don't know the best workflow"* is
not the same statement as *"I don't know what done looks like."* A user who is oblivious to
the method can still say what success is — `tsc --strict is clean and the tests pass`. That
one statement is the whole legitimate user input. Steps, order, verbs, bounds, and checks are
all road, and the agent authors all of them.

This does NOT relax the arbiter rule. The close is still operator/user territory and can
never be agent-authored — a judge the agent writes is self-consistency in a judge's coat
(v1.15, the RSI ceiling finding). What changes is that the destination is the ONLY thing
authored by hand, and everything downstream of it is derived.

### The decision

1. **A close is declared as an ordered list of NAMED STAGES**, not one opaque command:
   `close: [{name, cmd, ...}, ...]`. The shell runs them in order as the close; it can also
   run any single stage alone.
2. **The check menu DERIVES from those stages.** No operator authors checks per job, ever.
   The agent picks which stage gates which step, by name, exactly as today
   (`check-passes(name)`) — it is told the names and the pairing rule, never the command.
3. **A stage that cannot stand alone is simply not in the menu.** A partial menu is an
   acceptable case, not a failure. *(Corrected 2026-07-26 by U0(a)/F58: the example given here
   in the first draft — job #5's D1 gaming audit — turned out to BE standalone-runnable, since
   it re-derives its own diff from the frozen seed ref. The real non-borrowable classes are
   instrument preconditions and stages that consume an earlier stage's build output.)*
4. **Unchanged:** checks decide nothing and mint nothing; the close is the only truth; `run`
   stays locked; the close's OUTPUT still never names the culprit file (v1.12/F28 — that rule
   governs the failure message, not the checklist).

### Why this is with the grain, not against it — the evidence audit

The hazard the operator raised ("it leaks the close's structure to the agent") is not
supported by this repo's own record, and was withdrawn:

- **F46** — the in-run operator-signed check IS the mechanism that works. The exact failure
  fatal 3/3 in F39 converted 2/2 times it occurred once the worker could run mom's own ruler
  mid-build. The check was a piece of the close (a clean pytest run).
- **F47** — the planner composed `tree-changed ∧ check-passes(clean-run)` **itself, 3/3**,
  told only the NAMES and the pairing rule; the step check-loop alone drove 55–67.5% and the
  outer grader's fix loop never fired.
- **The green-side audits** (F33, F47) chased close exploitation under the standing rule that
  finding nothing is suspicious, and found none — job #4's 22–27 of 40 mutants killed on
  pristine source is behaviour the worker could not have faked.

**And the hand-authored alternative is the MORE dangerous one.** Job #5's three operator
checks (`typecheck-clean`, `suite-green`, `no-suppressions`) were re-implementations of three
stages the close already ran (tsc, the suite, the D1 audit) in a separate file. A hand-carved
copy can drift LENIENT — the worker passes the operator's ruler and fails the real inspection.
Derivation removes that divergence class by construction.

### The three real fit-to-pass risks, and where each is defended

Naming them so the withdrawn one is not confused with the live ones:
1. **A check that measures the wrong thing** ("a file exists" standing in for "the tests
   catch bugs") — defended by the close's own anti-gaming stages (D1–D5), which is precisely
   why deriving from the close beats authoring beside it.
2. **A subjective close** — a rubric self-checked by the worker IS self-consistency (v1.15
   gotcha). Applies to `soft-green`, which is declared-but-locked and unbuilt. A deterministic
   exit code cannot be argued with.
3. **Handing over the ANSWER** — "the third wall is crooked" vs "walls must be straight". The
   existing rule (the close's output never names the culprit) already governs this, and is
   untouched here.

**Not a risk, withdrawn:** the worker knowing WHICH requirements exist. Passing every stage of
the close is passing the close — that is succeeding, not gaming.

### Consequence for U

U (v1.27's user-mode e2e) can now run with **zero operator-authored checks**. Whether job
#5's existing close actually decomposes into stages is the free half of probe U0 — a code
question, answerable before any spend.

---
## Addendum v1.29 — 2026-07-26 (a budget is a BALANCE, never a per-round rate; and T's hang motivation is retired — hamr)

**Approval.** hamr in-turn this session. The correction, verbatim: *"why would you tell it every
round that you have x time per round? what if there is a heavier round? why don't you tell it same
like cost, you have x left from cost/time instead of making it race against time?"* — and on the
resulting shape, *"yeah, we can try that."* Evidence: **F61**; detail in the materials design record,
addendum 2.

### What v1.27's T said, and what is now narrowed

v1.27 justified **T** on two complaints and stated that the agent *"is TOLD its time budget at plan
time exactly as it is told its round bound, and plans against it."* Both halves are corrected:

1. **The hang motivation is retired.** *"Nothing bounds TIME"* was true when v1.27 was written and is
   no longer: BA-18's inactivity timeout shipped in bare-agent 0.34.0, was consumed in `2bd46bb`, and
   F61/C2 measured it firing (1,259 ms on a socket that accepts and never answers; without it the
   bound is the OS TCP timeout, ~2 h). A wall-clock cap does not fix hanging. **T's remaining value is
   time as a material and a metering unit** — the backstop is kept but stays deliberately rough and
   earns no further build effort.
2. **"Exactly as it is told its round bound" was never true of money, and will not be true of time.**
   F61's source read: the shipped plan prompt (`src/planrun.js:76-109`) **never mentions money at
   all**. Money is enforced by ralph every round and never spoken. Time now works the same way.

### The rule this mints

> **A budget is told as a remaining BALANCE. It is never told as a per-round rate, a per-round
> allowance, or a derived round count.**

Binding on money, time, and any future material. Three reasons, and the first is measured:

- **A rate is a fiction at the round level.** F57: verification gaps span **3.8 s → 561 s (150×)**;
  execute rounds spread 1.6× of median. A per-round constant describes almost no real round, so a
  heavy round breaks the agent's arithmetic and nothing tells it.
- **A balance is self-correcting.** After a heavy round the number is simply lower. The agent never
  models round weight, and there is no fiction to get wrong.
- **A rate is a stopwatch.** Racing a clock gives a worker the incentive to rush or fake — precisely
  what the v1.12 §5 prompt contract exists to remove. The balance is stated to the *planner*, never
  to the worker, and the worker stays blind (unchanged).

### Consequence, accepted deliberately

At draft nothing has run, so the balance *is* the total and **the agent cannot size its steps in
time**. It plans in rounds, as today, and may draft a plan that does not fit. This is not fixed: the
only way to size time at draft is the rate, which is the fiction just removed. **A plan that does not
fit is what the meter is for** — it trips, the balance and the variance return to the planner, and it
re-allocates. That is the adaptation channel, and it has fired zero times in the programme (F56).

### What this costs the record

**F60's +62% allocation result is withdrawn as a prediction.** It was produced under the rate framing
and does not transfer to the balance framing. The surviving claim is framing-independent and weaker:
*hand the planner a stated bound and it plans against it.* Cited that way from here.

### Still open, and not assumed

Where a real run's hours actually go is **unmeasured**. Model rounds are already bounded by money at
F57's rate; check/close gaps cost $0 and are therefore invisible to the money cap, and F57 measured
them as high as 561 s each. The archived spines carry timestamps and answer this for $0. If the hours
are in check gaps, the unit needing a bound is **check invocations, not the wall clock** — which
would narrow T a third time.

---
## Addendum v1.30 — 2026-07-26 (correction: move A's premise was false, and A's chosen threshold is inert on every run we have — F63)

**This addendum corrects v1.27, not on taste but on evidence.** It is written the same day the
move it corrects was built, because the check that produced it (*is the thing I just built
reachable?*) was run before any live spend.

### What v1.27 claimed, and what is true

v1.27's move **A** opens: *"Today replan fires only when a step exhausts its attempts, and an
instrument stop is not exhaustion — so a replan has fired **zero times in this programme** (F56)."*

**That is false.** F63 replayed all 18 archived plan-v1 spines: **8 replans fired**, each an
accepted `phase: 'replan'` plan, all on the exhaustion trigger, in the L2 acceptance battery
(2026-07-22) and the clipipe rows (2026-07-23) — four days before F56 asserted zero. F56's
evidence was two job #5 rows that died `provider-red`, generalised without replaying the archive.

So **the adaptation channel already existed and already fired.** "The agent adapts its workflow as
it goes" has 8 observations, not none.

### And A's threshold does not fire

Replayed against every archived attempt boundary — the exact point the meter reads — **no step in
54 (24 of them multi-attempt) ever consumed 50% of the run's remaining money with a further
attempt pending.** Near misses: 0.35 · 0.35 · 0.40 · 0.45. The zero was audited before being
believed: 18/18 spines carry `budgetUsd`, 1,212/1,213 rounds are priced, 101 judged attempts exist.

A is therefore **built, tested, and adding nothing measurable** on the only workload with data —
which is the F22 class this PRD already names: a live-looking knob with zero effect.

### What is decided, and what is not

- **T stands unchanged.** The clock, `wall-halt`, and the balance-at-draft never depended on the
  replan premise. v1.29's balance rule is likewise untouched.
- **A's 50% threshold is NOT changed here.** It is arbiter territory and hamr's number; and
  lowering it to 0.35 because that is where those four points sit would be fitting the threshold to
  the data, against the standing no-fit-to-pass rule. The distribution is on the record so the
  decision can be made on evidence rather than on a fresh guess.
- **A's motivation is re-stated honestly:** it is a guard against a step that eats the run, and no
  archived step has done that. Whether that makes it inert or merely untriggered is not decided by
  this addendum.

### The question this re-opens, and it is now cheap

v1.27 sequenced U partly to make adaptation observable. It already is. **Does replanning help?** is
answerable from data that exists: replanned runs greened 2 of 8, non-replan runs 1 of 5 valid rows.
**Unreadable at that n with unmatched rows** — different jobs, two provider surfaces, months apart —
so nothing is claimed. But it is a $0 archive question, not a battery.

### The process rule this mints

**A premise cited to justify a build is replayed against the archive BEFORE the build.** F56's
Finding 4 cost a design decision, a signed record section, and a day of implementation, while the
disconfirming evidence sat in eight files. "Would this ever fire?" is cheap while it is still a
question about code and expensive once it is a claim about a feature.

---
## Addendum v1.31 — 2026-07-26 (hamr's two calls: keep 0.5, and a wall stop is never a network failure)

**Approval.** hamr in-turn, verbatim: *"fix F64 and keep 0.5, then build the staged close"* — given
after v1.30 put A's inertness and F64's mislabel in front of him. Both items were arbiter territory
and both were parked for exactly this.

### 1. A's variance threshold stays 0.5

Decided **with the inertness on the table**, which is the only way this number was ever going to be
legitimate. F63 measured that 0.5 would have fired 0 times across 18 archived spines / 54 steps,
with near misses at 0.35 · 0.35 · 0.40 · 0.45. hamr kept 0.5 anyway.

That fixes A's meaning: it is a **guard set above the observed population**, not a tuned trigger.
The alternative — moving it to 0.35 because that is where those four points sit — is fitting the
threshold to the data, which this PRD prohibits. So A's honest description is *"no archived step has
ever eaten half of what was left; if one does, the planner re-allocates instead of the step
finishing the run"*. It is not evidence of adaptation and is not counted as such; **the eight
replans F63 found are the programme's adaptation observations, and they came from the exhaustion
trigger.** The provisional-by-construction status is discharged: it survived being examined, rather
than surviving unexamined.

### 2. F64 — a wall-derived call timeout routes `wall-halt`, not `provider-red`

`clock.callTimeoutMs()` bounds each provider call by what is left of the wall, so on a tight run the
deadline arrives as bare-agent's own `TimeoutError` — which carries a code and no category, and the
plan runner defaulted every uncategorised throw to `provider-red`. A `provider-red` is a **casualty**
by standing doctrine (never evidence, retry, F44 `spendComplete:false` floor), so a run that ran out
of the operator's *time* was being discarded as a *network* failure, and the human was handed
"fix the provider binding" as the remedy.

**Fixed, and the fix is one decision made in one place** (`isWallTimeout` + a single `categorize` in
the runner, so the worker seam, the scout/drafting relay, the step loop and the close-fix loop cannot
drift apart):

- an uncategorised `ETIMEDOUT` on an **expired** clock → `wall-halt`, with the run-level time record
  (`requestedMs`/`enforcedMs`/`elapsedMs`) and a `cutMidCall` flag distinguishing a deadline that
  landed inside a call from one read between steps;
- the same error with **time still on the clock** → `provider-red`, unchanged. A real dead socket is
  never laundered into a governance stop, and this direction is a pre-registered control test;
- an **unbounded** run can never produce a `wall-halt` — with no cap the provider's own default is
  what tripped, and that is transport;
- a thrower that named its own category keeps it (the typed-attribution rule is untouched — this
  classifies only the UNNAMED throw).

**A deliberate, stated limit:** a genuine transport hang on a run whose wall has *also* passed reads
as a `wall-halt`. The run is out of time either way and the remedy is identical (raise the cap), so
the ambiguity is resolved toward the governance reading. Resolving it the other way is the failure
being closed.

### Why this belongs in the PRD rather than a changelog line

The two verdict classes carry different downstream rights: a casualty is excluded from evidence and
retried, a governance stop is a checkpoint the operator resumes from. A defect that moves rows
between those classes is an **arbiter** defect, which is why it was parked rather than fixed on
sight, and why the fix ships with a control test in the direction that must NOT change.

---
## Addendum v1.32 — 2026-07-26 (the legacy `steps[]` path is DELETED now, not after Layer 3 — hamr)

**Approval.** hamr in-turn, after being shown what the deletion costs: *"i just want to get rid of
it"*, then — on the question of what happens to the two verdicts it carries — *"when we get to layer
3, we will decide how hitl and softgreen will evolve, does that work?"*, and on the record entry:
*"that's fine, log it in prd"*. This SUPERSEDES v1.23's park (*"legacy retires at the
verdict-classes rung, post-Layer-3"*).

### What is being deleted, and why now

`steps[]` is the shape where the **operator hand-writes the workflow steps**. It is the exact thing
the product exists to remove — *"there shouldn't be user authoring anywhere"* (v1.28) — and it has
been co-existing scaffolding since Layer 2 landed. Keeping it costs a second shape in every
schema decision downstream: the staged close (v1.28, the next build) would have had to accept both
spellings, and the confusion is not hypothetical — it derailed this session's design checkpoint
before either of us noticed we were talking about two different "old shapes".

The park's stated reason was that legacy is the ONLY implementation of `hitl` and `soft-green`.
That reason does not survive the repo's own doctrine: **graduation between rungs is a REWRITE,
never a copy.** Keeping ~1,360 lines alive so a later rung can decline to copy them is preserving
code for a use that will never happen.

### What it costs, stated plainly and not minimised

**`hitl` is not dead code — it has run.** `jobs/litectx-maintainer.json` (keep litectx green, then
open a draft PR for human review) executed **6 times** in the archive, and one run opened a **real
draft PR**. It is the only job in the repo that produces the product's actual end state — a change
for a human to merge — rather than a benchmark grade. **That job goes dark** until the plan shape
implements hitl.

The other 7 legacy specs are archived experiment records; they stop being runnable and stay
readable. `soft-green` was never implemented beyond its declaration, so nothing is lost there.

### What it does NOT decide

**How `hitl` and `soft-green` come back is deferred to Layer 3, deliberately undecided here**
(hamr's *"we will decide how they evolve"*). Not "port the old design" — decide. Two things are
already known to constrain that decision and are recorded so the rung inherits them, not so they
pre-empt it: a rubric close judged by the worker is self-consistency in a judge's coat, so
`soft-green` needs the RSI judged-floor analog first (v1.15); and merge stays human, forever,
which is a hard line no verdict design may touch.

Until then the plan path admits `green` only, and declaring `soft-green`/`hitl` stays a
`request-red` — an admission the ledger counts, which is the honest record of the gap.

### Consequences carried by this addendum

- **Breaking change** — `interpret`, `validateConfig`, and `extractRules` are published API in the
  adopter contract. Version bump, CHANGELOG entry, `bareloop.context.md` rewritten to one shape.
- **config-v1 is fully gone**, not merely declared dead (F22 declared it; this removes it). The
  drafted-workflow-config surface, its knobs (`loop.shape`, slots, `remember` kinds), and the
  rules extractor built on it go with the path that consumed them.
- **What stays** is the machinery the plan path imports and would otherwise have to re-grow: the
  fence and secret primitives (`globToPrefix`, `scopeContained`, `sweepSecretLiterals`,
  `SECRET_PATTERNS`) and the worker tool menu (`TOOL_BY_VERB`, the ctx tools, the personas and
  strategy lines). Those are not legacy; they were housed in legacy files.
- **Landed as its own change, before the staged close** (hamr chose the sequencing): two levers in
  one diff make any resulting delta unattributable to either — the standing rule.

---
## Addendum v1.33 — 2026-07-26 (two calls inside the staged close: the ratchet's red-set is the
FAILING STAGE's, and the grader is not lendable — hamr)

**Approval.** hamr in-turn, verbatim: *"agreed on both, validate your claims"* — given after
both proposals, with their measured grounds, were put in front of him during the staged-close
build (PRD v1.28). Both are arbiter territory (Layer R's detector; the check menu the agent is
handed) and both are recorded here rather than folded silently into the build.

### 1. Layer R's red-set under a staged close is the STAGE that rendered the verdict, per attempt

A staged close has N `gapKeep` patterns, one per stage, and the stage that renders the verdict
varies attempt to attempt (whichever one reds first). The build's own WIP had stubbed this as
"the first stage that carries a `gapKeep`" — wrong, and wrong in a way the suite could not see
because nothing exercised two stages with different patterns.

**What shipped:** `createRoot().observe()` (`src/root.js`) now accepts `redStage`/`redKeep`
alongside `gap`/`writes`, and the detector **refuses to compare red-sets across a stage
change** — a different wall of the close is a different failure, so repetition is not
provable. This is the same bucket the detector already used for one-known-one-UNKNOWN, and for
the same reason: MOVEMENT, never a fire, when the comparison cannot be trusted. `root-injected`
gains an optional `redStage` field carrying which stage produced the compared red-set.

**The rejected alternative, and why it was rejected on MEASURED grounds, not taste:** one union
`gapKeep` pattern fixed for the whole run, so every stage's failures fed one comparable set.
Its safety rests on an assumption — that the stages' kept lines are distinguishable from each
other — which the real corpus does not support: job #4's two close stages are near-clones of
one grader, and **7 of their 12 kept-line templates are byte-identical** (measured over
`l2poc-check-close.mjs` and `testgen-close.mjs`, including the shared `TESTGEN | <suite line>`
family). A test built from those real shared lines **fired under the union rule** before the
per-stage guard landed — a false positive across a stage change, exactly what "inert when not
stuck" (the standing armed-and-inert doctrine) forbids. This is the opposite direction from the
hazard the union approach was meant to avoid (going silent); that account was wrong and is
withdrawn.

**Deviation from what was described when hamr agreed — flagged to him, not folded in silently.**
The rule was put to him as *"a changed stage means the red-set is not comparable, so say
can't-tell and fall back to the weaker signal: did the worker touch the same file again."* What
shipped is **stricter**: a changed stage never fires at all. The looser version was wrong in the
same direction as the union pattern — in the measured case (the worker clears one wall and hits
the next while rewriting the same file), write-overlap alone would still have carried a fire, so
the fallback would have produced exactly the false positive the guard exists to prevent.
Reversing this to the version as described is a one-line change and remains hamr's call.

**Cost:** callers with a single red-set source — the per-step exit evaluator, which was never
staged — pass neither `redStage` nor `redKeep` and are unaffected; only the close-fix loop
(the one seam a staged close reaches) carries the new fields. Both directions are
mutation-proven: restoring the old stub reds the plan-runner's own test; deleting the
stage-change guard reds the root test built against the shared-template case above.

### 2. The grading stage is not lendable

All four shipped specs set `offer: false` on their final stage (named `verdict`), so the
close's own grade never appears in the derived check menu the agent is handed mid-build — it
can borrow every EARLIER stage as a ruler, never the stage that renders the verdict itself.
This is kept as a **per-spec flag**, not a schema rule enforced by the validator: "the last
stage is the grade" holds in all four specs that exist today and is not proven true in
general (a future close could legitimately name its grading stage first, or run several
independent hard gates with no ordering significance). Because it is a convention and not a
structural guarantee, a forgotten flag on a fifth spec would be silent **except** that
`check-menu` preflight always announces the full derived menu on the spine regardless — so a
grading stage left lendable is visible in the run's own record even when the schema does not
forbid it. A test (`tests/staged-close.test.js`) now reads every spec in `jobs/` and reds if
any of them offers its own last stage; it is proven able to fail (flipping aurora's `verdict`
stage to `offer: true` reds it, naming the menu).

### What this does not change

Both items are refinements inside the staged close (v1.28) itself, not a new arbiter-shape
decision: the close is still the only truth, `checks[]` is still retired, and the check menu
still derives from the close's own stages. Neither item touches money, time, or the merge
line.

### Scripted-provider caveat, stated where it matters

Everything above — the staged close itself, both decisions in this addendum, and every
supporting number — comes from scripted-provider tests. **The staged close has not yet run
against a real model.** That run is the next real-model evidence this rung needs, same as
every other build in this programme before its battery.

---
## Addendum v1.34 — 2026-07-27 (workflow REUSE: the goal stated, the missing machinery inventoried, the design deferred to its rung — hamr)

**Approval.** hamr in-turn, verbatim: *"spill out missing specs and add it to later module as part
of prd. goal is user can choose workflow for similar job and it would reuse the same plan and
self-heal insteaf of starting from scratch"*, and on the design itself: *"speccs will be addressed
when its turn"*. **This addendum NAMES the gap and parks it. It designs nothing** — the machinery
below is deliberately left unspecified until the rung that builds it, which opens under Layer 3's
own procedure (interview → design-freeze → sub-dollar lineage pre-probe BEFORE any machinery).

### The goal, in the user's terms

> A user picks a workflow for a **similar** job; the system **reuses that plan and self-heals**
> instead of starting from scratch.

This is the product's founding claim restated operationally (§2: bareloop learns a JOB — the plan
is a persistent, ledger-attributed artifact; a bareloop that discards the plan each run IS
relayfact and should be archived). What v1.27 added is that the reuse run doubles as Layer 3's
inheritance-ON arm and a from-scratch run as the OFF arm, so the paired control falls out of
normal operation.

### What EXISTS today (2026-07-27, U's first green)

- A green run emits its accepted plan on the spine, and the U runner persists it as
  `bridge-<job>.json` with the spec hash and the green that minted it. **A file, not a mechanism:
  nothing reads it back.**
- Self-healing WITHIN a run is built and observed: a step that fails its own derived check gets
  the gap and retries under bound (U run 1, step 2), and the outer close-fix loop catches a
  close-level red. Layer R adds within-run repetition detection (default OFF).
- Self-healing ACROSS runs does not exist in any form. A reused plan would either work or the run
  would stop; nothing revises a bridge that failed.

### The missing machinery — an INVENTORY, not a design

Each line is a question the building rung must answer; none is answered here.

1. **Storage.** Where a bridge lives, what it contains beyond the plan, and its relationship to
   the ledger (every inherited rule carries the green that minted it and the contrast that
   attributed it — §2).
2. **Keying and matching.** What makes a job "similar" enough to offer a bridge. This is the
   whole weight of the user's sentence and the hardest item: v1.27's unruled condition 2 says
   same SHAPE, never same instance, or the bridge is a lookup table the memorization audit kills.
3. **Selection.** Whether the USER picks the workflow (hamr's phrasing: *"user can choose"*),
   the agent proposes, or the shell matches — and what the user is shown in order to choose.
4. **Loading and re-validation.** A stored plan is never executed unchecked: it re-enters the
   same validator (scopes, bounds, verbs, exits, check names derived from THIS job's close), and
   a bridge that no longer validates is a distinct outcome, not a crash.
5. **Adaptation — the self-heal.** What the agent may change in an inherited plan and when: after
   a failed step, after a red close, before starting. The arbiter stays inexpressible either way;
   unlimited revision launders thrash as adaptation (the v1.22 replan ceiling exists for exactly
   this reason and must not be quietly reopened here).
6. **Demotion.** v1.27's unruled condition 1: a green graduates a bridge to CANDIDATE, and a
   bridge that fails to carry the next job is demoted, not defended.
7. **Attribution.** What the ledger counts so reuse can be read as a lift and not a story —
   the ON/OFF contrast on cost, wall time, rounds and outcome.
8. **The scout under reuse.** The scout is load-bearing when planning cold (F60). Whether a
   reused bridge still scouts, scouts less, or skips it, is unmeasured and unassumed.

### The two conditions still awaiting hamr's ruling

v1.27 recorded them so they could not be quietly assumed; they remain unruled and they gate the
build, because they decide what the second run MEANS:

1. graduation is to CANDIDATE, reuse is the replication, failure demotes;
2. "the same job" means the same SHAPE, never the same instance.

### Evidence this addendum rests on, and its limits

U run 1 greened this job cold ($2.21 of $5, 8.9 min of 30) with a three-step plan the agent
composed itself, and saved the first bridge. U run 2 (same job, same seed) drafted a **materially
different** plan and was killed mid-flight by an operator tooling limit, not by the product — it
is UNREAD, and no comparison may be drawn from it. That a second draft differs is expected of a
probabilistic worker and is not evidence that one plan is worse; **more than one valid bridge
almost certainly exists for a given job**, which is itself an input to items 2, 3 and 6 above.

## Addendum v1.35 — 2026-07-30 (T·A·P·U closes: P read complete, the palette is inert where feedback names the target, and the mailbox rule joins the validation laws — F69)

**This addendum closes the v1.27 programme.** All four moves are landed and read; the plan's
paper trail: v1.27 (the programme), the materials design record (2026-07-26, T+A), the P design
record (2026-07-28), FINDINGS F59–F69, and this addendum. No other document carries T·A·P·U
status.

### Where each move ended

- **T** — shipped and live in every U run: `maxWallMs` (operator-set, no default), `src/clock.js`,
  and the materials block (balance, never a rate — v1.29).
- **A** — built; the variance trigger stays UNSET (v1.30/F63: it would have fired zero times in
  the whole archive). The replan that actually pays fires on attempt-exhaustion, and it converted
  a cap-halt to green on the F68 run.
- **U** — the surface everything above was read on: five litectx-u cold runs this cycle plus the
  F68 green; user-mode e2e is routine now, including casualty routing (one `truncated:max_tokens`
  provider-red absorbed per doctrine).
- **P** — built (design record 2026-07-28: 14-verb catalog, step vocabulary model/attempts/scope,
  wired-or-refused); read under the signed hash `25d8c5ee…` at n=3 cold + 2 post-rule runs (F69).

### What the P read established (one genre, one job — the qualifier travels)

1. **The widened palette was never touched**: six drafted plans, zero new-verb selections —
   while the step VOCABULARY (model tiering, attempts, scope) was adopted immediately and
   everywhere. F19 recurs at the draft layer: a menu without a draft-time reason is inventory,
   not capability.
2. **The read is genre-bound by construction**: TYPES feedback (tsc's error list) names every
   target file:line, so navigation verbs have nothing to sell on this job. "Inert on litectx-u
   TYPES" is minted; "inert" is not. A job where FINDING is the bottleneck is the discriminating
   instrument, if the question is ever worth its spend.
3. **The load-bearing find was plan SHAPE, not palette**: 4 of 4 pre-rule plans authored a
   read-only "verify" step holding every `check-passes` — the check's gap re-delivers to that
   step's own worker, which cannot act (the mailbox with no hands). The one prior green (F68)
   had escaped only via a lucky replan relocating the check.

### The mailbox rule (shipped, d447665)

`validatePlan` reds `check-passes` on any step without a write-class tool — the complement of
the F17 pairing rule; the drafter prompt states the same law. Post-rule: first-draft compliance
twice (the validator never fired — the stated law redirected the habit), and the first
no-replan green in this job's history (`ms5uxhej`, $4.29/23.9min vs the F68 baseline's
$5.77/37min-with-replan; direction recorded, n=1 unminted). The check-loop converted live at
the exact step shape that had stalled both pre-rule runs.

### Standing after v1.35

Layer 2's road is finished. Open, in order, all gated on hamr: aurora-u re-sign under the
widened menu (P design decision 4); the REUSE rung (v1.34's eight questions — four bridges now
exist, including the first from an un-replanned cold plan); the parked mechanics (spawnSync
async close-runner, deadlineMs wiring, branch merge). LC-4 (stash/peek/compress intent
divergence with litectx's contract) remains an unfiled candidate ask.

## Addendum v1.36 — 2026-07-30 (the tier floor: the plan is authored at sonnet or above — hamr)

One decision, evidence-first: aurora-u run whole-job on haiku died plan-red at $0.05 —
draft 1 authored the mailbox trap (F69's rule fired in production for the first time and
blocked it), draft 2 repeated the violation verbatim after a red that named the step, the
rule, and the fix. The same job, same signed spec, greened under sonnet the same day
($1.86, 11.2min). The capability edge is at PLANNING, before any execution spend.

**The lock (hamr, in-turn):** the drafter and the default worker tier floor is **sonnet
(medium tier)**. Unchanged by this lock: the per-step `model` menu still offers `haiku`
(economy tiering of mechanical steps under a sonnet-authored plan — a haiku step has
greened); `opus`/top tiers stay absent from the plan menu (hamr-assigned only); the
runner's `--model` flag remains an explicit operator probe knob — running below the floor
is an operator act, never a default, and its rows are probes, not battery evidence.

## Addendum v1.37 — 2026-07-30 (tier policy is a product surface: provider-agnostic tier names, per-provider auto-detection, and user-chosen tier pairs at the UI — hamr)

Direction recorded from hamr's words, design deferred to its rung (the reuse rung for the
bridge half; the panel rung N6 for the UI half):

1. **Tier names are product vocabulary, not model ids.** The plan schema already encodes
   this (`STEP_MODELS` offers tiers; the tier→model mapping is the runner's, per provider).
   The vocabulary generalizes to **low / medium / high**: today low=haiku, medium=sonnet,
   high=opus-class (absent from the plan menu, operator-assigned only — unchanged).
2. **Per-provider auto-detection.** When a provider beyond Anthropic is wired (e.g. an
   OpenAI-compatible API), the runner should DETECT the provider's small/medium/high
   models from the provider's own catalog rather than hardcoding ids — the tier menu
   stays identical for the agent; only the runner's mapping table is provider-aware.
   (Detection is runner/operator territory; the agent still only ever names a tier.)
3. **The efficiency goal, stated:** a BRIDGE gets the best of the models — authored at
   medium-or-above (v1.36 floor), executed as cheaply as the evidence allows. Tier
   demotion of proven bridge steps is evidence-gated and operator-signed (carried to the
   Layer 3 interview agenda), the escalation path on drift being the existing
   exhaustion→replan route, which the floor already keeps at medium+.
4. **User choice at the UI (later):** the signing card offers tier PAIRS —
   planning/execution — e.g. **medium/low · medium/medium · medium/high · high/high**;
   the planning side never drops below the v1.36 floor, and high tiers remain an explicit
   user choice (cost-visible), never a default.

## Addendum v1.38 — 2026-07-30 (the branch closes: hardened, reviewed, every validated finding fixed — and two arbiter changes made only on hamr's explicit word)

**This addendum closes the `staged-close-wip` branch, not a design question.** v1.35 recorded
that Layer 2's road was finished; this records that it is now hardened, reviewed and
release-ready. No decision here reopens anything above it.

### What landed after v1.37

A hardening pass first (15 tests, every one fail-proven by sabotage): the mailbox rule's
edges, a casualty grid covering all five provider-consuming phases, and the cold-store
guarantee — a leak hunt proving litectx persists only under `.litectx/`, plus a tripwire on
the runner's reset line, because an uncleaned store leaks run N's memory into run N+1's
"cold" baseline and quietly poisons the reuse rung's OFF arm before it is ever built. One
in-scope fix travelled with it: the mailbox law now fires only on a PARSED `tools` grant —
one defect, one red.

Then an opus MEDIUM whole-branch review: 6 MED + 9 LOW. Every validated finding is fixed;
the full record is **F70**, and the two headline defects were in the guards themselves —
F66's stall fuse disarmable by its own zombie reissue, F67's watchdog killable-by-design
mid-close and aimable at a recycled pid. Neither was reachable from the feature side.

### The two arbiter-territory changes, and the words that released them

Standing doctrine parks verdict routing and close semantics for hamr's explicit go. Both
were parked, and both were released in-turn:

1. **Verdict routing.** The hardening pass found the close-fix loop laundering a transport
   casualty into a flat `escalated` (F11/F44 class) and parked it. hamr: *"fix both then
   /code-review medium…"* — which fixed it and launched the review. The review then found
   the second half in the same routine, MED-4: the shell spells attempt-exhaustion and a
   money-gate halt with one category, so only the wallet can split them, and the fix
   worker's gate is built with the wallet at its most drained — the exact place a money cut
   masquerades as a capability read (F45). Both halves now mirror the step loop.
2. **Close execution.** hamr: *"validate all errors and fix what passes"* — which set the
   closing batch's contract (validate each finding before touching it, fix only what
   survives) and released **F68's parked async close runner**. `runClose`/`runStages` await a
   plain `spawn`; the close no longer freezes the host loop it reports to, and every close
   semantic is byte-identical. Resolution recorded in F68's own block.

That contract earned its keep immediately: one proposed fix (renumbering the retrieval
verbs' line output) was REFUTED by measurement before it shipped — it would have broken a
working one-handle-space contract to document it (F70).

### Standing

The branch is **release-ready at 31 commits** vs `main`: full gate green, typecheck clean,
no parked defect left in the shipped path. Two BREAKING changes are on it — `runClose` /
`runStages` returning Promises (adopters), and `check-passes` requiring a write-class verb
on the same step (plan authors) — so **the next release is recommended as a MINOR with
explicit breaking notes (0.6.0)**, pre-1.0 SemVer as this repo already applies it. The
version itself is hamr's call, as is the merge; nothing here authorizes either.

**Next rung: Layer 3, the REUSE rung** — opened in the order LAYERS.md §4 states (interview
→ design-freeze → a sub-dollar lineage pre-probe BEFORE any inheritance machinery), and
gated as always on hamr.

### One record correction (append-only, so it is stated here rather than edited above)

This PRD's status header cites adaptlearn's closed record as **FINDINGS F1–F20**; the copied
record in `docs/00-context/FINDINGS.md` runs to **F23** (F21–F23 are the three bareloop
de-risk probes: menu breadth, menu disclosure, declared truncation). The range is the only
thing wrong — no claim built on that record changes.

## Addendum v1.39 — 2026-07-30 (release-gate fixes land; two future items parked on hamr's order)

The 0.6.0 release gate (fresh full /ship + /security + /diff-review, opus) confirmed no
Critical/High and produced two fix batches, all validated-then-fixed TDD under hamr's
"solve all that don't need my review" bar, plus an approved arbiter batch (resolved-spec
signing so an omitted `tools` pins WHICH menu was signed; spend/time honesty on self-healed
stalls and staged closes; the `step-scope-escape` pair check; the ONE `stageClose` staging;
the stall watchdog consulting the wall; the activity-aware outside watchdog; the 64KB store
note cap — threshold hamr's, verbatim in-turn). Full record in the branch log and F-series.

### Parked as FUTURE work (hamr: "add it to prd future when it's time" / "i assume they come later")

1. **`MIN_WALL_MS` stage-awareness.** The 120s wall floor is a one-stage-era number: a spec
   with a 2-minute wall and a 4×900s staged close validates while its enforced worst case is
   ~62 minutes (31× its own cap). Since W5 the clock REPORTS the honest total; making the
   floor scale with the staged close is a threshold change reserved for hamr, deferred to a
   future release. Not a defect: advertised = enforced holds; the floor is just permissive.

2. **Pair-coherence sweep (the W3 class, named).** Two individually-legal fields can be
   jointly incoherent — the validator's healthy precedent is `close-hierarchy`
   (verdictType × close class); W3 (`scope` × `target`/exit paths) is the second member,
   found only after it shipped. Future lens, verified candidates (2026-07-30 source pass):
   `target` × exit paths (unlinked today — judge whether auxiliary artifacts are design or
   drift); `attempts` × per-step rounds × remaining budget (validation never cross-checks;
   confirm the runtime meter's ownership is sufficient rather than duplicating it);
   operator-side `providerFor` factories gating provider params per tier (the library
   correctly never touches params — a tier with no factory is an interpreter-red STOP —
   so the coherence burden sits in scripts). Standing rule stays: menus first; a pair
   check is for what menus cannot express.

## Addendum v1.40 — 2026-07-31 (the wall PAUSES the run: the close is never bounded, the stop is the checkpoint, and the outside kill needs evidence — hamr, rulings given 2026-07-30)

Three rulings on TIME, all given while W-2/W-3 were being built. None of them touches the
arbiter's ownership: the agent still never authors, adjusts or reads its own wall.

### 1. The close is never bounded by the wall, and never counts against it

A deadline that stops grading leaves the run **unreadable after the money is already
spent** — the F45 class (a money cap binding mid-attempt killed the row before it could be
graded, and 4 such rows were counted as evidence) generalized from money to time. So the
wall bounds the *work*, never the *judgement*: a close already in flight when the deadline
trips runs to completion, and the run's enforced worst case is stated honestly as
`maxWallMs + closeStages × closeTimeoutMs` (W5 — a staged close hands EVERY stage the full
timeout) rather than quoting the one-stage number the code used to advertise.

### 2. The wall PAUSES; it does not cut the grade — resume-to-cap, extended from money to time

hamr, verbatim: *"when time is up, keep the grade we already have and stop"* — and
*"run tests (free) and when done if original time is past due, pause and ask user to increase
time or adjust prompt"*. Past the deadline no NEW work starts: the close-fix loop opens no
further iteration and a step that would begin already expired does not begin. The run stops
on the verdict the last close minted, and nothing after the deadline may change it.

This is v1.12's resume-to-cap with time in money's place: **the stop IS the checkpoint.** The
human holds two levers and they point opposite ways — raise `maxWallMs` and resume, or revise
the goal so the work fits the time — so the stop is decision-ready and carries a progress
TREND (`moving` | `stalled` | `unknown`, read off the last two close gaps) that says which one
fits. Both levers are **spec edits**: a new hash, re-signed before the run is allowed to
resume. The trend is a READING for the human, never a gate — nothing routes on it, and one
grade alone reports `unknown` rather than rounding up to `stalled` (F6's rule, applied to a
trend instead of a number).

### 3. The outside kill requires EVIDENCE of death, not a clock — and the marker is spine bytes

hamr, verbatim: *"the kill from outside should check for activity/bytes or other markers for
activity, not a silent kill"*. The out-of-process watchdog (F67) may kill on its deadline only
when the spine has ALSO been flat for a full stall-fuse window; past-deadline-but-still-writing
is logged loud on every poll and never killed — the in-process fuses and the money cap own
bounding a run that is *alive*, this guard owns processes that are *dead*. Every kill states
the trigger, the deadline arithmetic and the marker's value and age before the signal goes out.

ONE marker, and the second was deleted rather than kept as decoration: a CPU-liveness marker
(`/proc` utime+stime) measured broken in BOTH directions — a live close read DEAD (child ticks
are credited only at reap) and a wedged run read ALIVE (the runner's own lag sampler ticks the
parent), with its kill tests passing only three orders of magnitude below production
constants. hamr: *"keep what is simpler/available"* — the spine, which is the marker that
actually distinguishes progress from silence.

### What this does not decide

`MIN_WALL_MS` stays a one-stage floor (parked in v1.39): advertised = enforced holds, the
floor is merely permissive. Nothing here changes the money path, the verdict classes, or who
may author a bound — budgets and walls remain operator territory, permanently.

## Addendum v1.41 — 2026-07-31 (the close child stops carrying the operator's credentials — and the threat model says plainly what that does NOT buy)

hamr's ruling on a MEDIUM review finding, verbatim: ***"strip it when unnecessary, minimize
unneeded exposure."*** One change, one honest note about its limits.

### 1. The finding: the arbiter's child ran with the operator's keys in reach

`runClose` built the close child's environment as `{...process.env}`, deleting only
`NODE_TEST_CONTEXT`. Everything else went through — `ANTHROPIC_API_KEY` included. That child
is not an ordinary subprocess: it runs **worker-authored code**. `npm test`, `pytest`, `tsc`
execute whatever the worker wrote into the tree during the attempt it is about to judge, with
network available. Nothing in that set needs a model-provider credential to decide whether a
tree passes, so the exposure bought exactly nothing and is removed.

### 2. The rule: a literal denylist is a chase, so a NAME-SHAPE rule bounds it

`CLOSE_ENV_DENY` (src/ralph.js, exported) strips from the child's env copy:

- **the knowns** — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
  `ANTHROPIC_AUTH_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `NPM_TOKEN`, and the whole `AWS_*` prefix;
- **the shape** — any variable whose NAME ends in `_API_KEY`, `_SECRET`, `_TOKEN`, `_PASSWORD`,
  or `_CREDENTIAL(S)`, case-insensitive.

Both are kept on purpose, and the second is the load-bearing one. A literal list is a chase —
every new provider mints a new variable name — so it exists only for names the shape rule
cannot see (`AWS_ACCESS_KEY_ID`). The shape rule is what makes the guard hold for credentials
nobody here has heard of. It follows the SECRET_PATTERNS discipline: one inventory, named,
with the rule stated where it is enforced.

Placement is deliberate. The strip lives in `runClose`, which is the single close-spawn seam
in the library: `runStages` runs each stage through it, and `check-passes` → `runCheck` →
`runStages` lands there too, so every derived check inherits the same blinding — one
instrument, never two (the F9 two-transforms class applied to the arbiter). The strip is on a
COPY: the host process keeps its key, because bare-agent needs it every round. The `scripts/`
close wrappers are unaffected — those that build a frozen allowlist (`PATH`/`HOME` + offline
flags) were already tighter, and those that re-spread `process.env` are spreading the
already-stripped child env, so the blinding propagates to their grandchildren. It is arbiter
territory like everything else in that file: no drafted plan or config can express, widen, or
opt out of it.

### 3. The residual truth: this is exposure reduction, NOT a sandbox

Stated plainly, because a guard described as more than it is becomes the next false green:

- bareloop runs **locally**, on the operator's machine, as the operator's OS user;
- the operator's own process **necessarily holds the API key** — bare-agent cannot call the
  provider without it, and no strip changes that;
- worker-authored code executed by the close still runs **with network access** and **with the
  operator's full OS user permissions**: it can read any file that user can read (including
  credential files on disk, `~/.aws`, `~/.netrc`, a `pass` store, the shell profile that
  exports the very variables just stripped), and it can reach the network.

So the strip removes credential **environment variables** from the child. A local worker
remains **inside the operator's trust boundary**. Real containment — a container, a user
namespace, a network-denied cgroup — is a different mechanism, unbuilt, and is not claimed
anywhere. What IS claimed is the ruling: where the exposure is unnecessary, it is stripped.

**2026-07-31 — `names` extended, operator-ruled "add" on delta-review finding L1.** The
shape rule needs a `_`-bounded suffix, so a MEASURED set of real credential spellings was
reaching the close child untouched: `PGPASSWORD`, `PGPASSFILE`, `PGSSLKEY`, `MYSQL_PWD`,
`REDISCLI_AUTH`, `STRIPE_KEY`, `STRIPE_SECRET_KEY`, `SSH_PRIVATE_KEY`, `PRIVATE_KEY`,
`SECRET_KEY`, and the bare `TOKEN`/`SECRET`/`API_KEY`/`PASSWORD`/`PASSWD`. All are added to
`names` (documented tool variables only — `PGPASS` is NOT one: libpq names the file with
`PGPASSFILE`). The shape regex is deliberately NOT loosened: widening it to `*_KEY$` would
strip ordinary config, and exact-name matching is what keeps `PGHOST`/`SECRETS_DIR`/
`TOKENIZERS_PARALLELISM` alive — a second over-strip control now asserts exactly that.

## Addendum v1.42 — 2026-08-01 (Layer 3 REUSE rung: interview complete, design FROZEN, pre-probe pre-registered — hamr)

**Signature, hamr in-turn, verbatim: *"all agreed, lock in and we will validate with pocs
these assumptions and change as needed"*.**

**v1.34's inventory is now ANSWERED, decision by decision.** All eight items — storage,
keying/matching, selection, loading and re-validation, adaptation, demotion, attribution, and
the scout under reuse — plus the reuse envelope and what gates the build, are ruled in the
design record: **`docs/plans/2026-08-01-layer-3-reuse-design.md`** (R1, R2, D1–D9). That
record holds the decisions and the learning each leans on; this addendum does not duplicate
them.

**The two conditions v1.27 left unruled are RULED:**

1. **Graduation and demotion (R1 / D6):** only a green writes the box — an adapted run that
   greens becomes the bridge's next version (run-as-executed, prior versions kept); a red
   leaves the bridge untouched and takes a demotion mark. Status is coarse: CANDIDATE = 1
   green, PROVEN = greens on ≥2 distinct patients, a red on a proven drops it to candidate;
   entry bar is at least one green, and there is deliberately **no probability score** (n=1 is
   an anecdote either way; a % from 2–3 runs is fake precision — any future threshold is
   hamr's, from a measured base rate).
2. **"The same job" (R2):** the same **SHAPE**, never the same instance — v1 concrete, two jobs
   match when their close stages are the same kind of inspection, never when they merely share
   a patient. Otherwise the registry is a lookup table the memorization audit kills.

**The pre-probe is pre-registered and GATES the machinery.** Requirement (b)'s gate is frozen
at **`docs/02-experiments/REUSE-PREPROBE-PREREG.md`** — draft-only, three arms (cold /
readable lineage / mechanical start), n=3 each, sonnet, scout ON, **$1 hard cap**, on the
cross-patient TYPES pair (aurora bridge → litectx job). **No inheritance machinery is built
before it reads.** A limited-budget real execution run is the second instrument, fired only if
the drafts differ, and only on hamr's word.

**"Change as needed" is amendment discipline, not licence:** POC and pre-probe results amend
the design record by **dated addendum**, never by silent rewrite, and a frozen rule is never
loosened after a number exists.

## Addendum v1.43 — 2026-08-02 (the circuit breaker closes A–D, and resume becomes an ECONOMIC contract: every paid unit is paid once, the checkpoint is a completed step, and the signature covers the tries — hamr)

F72 parked four pieces (A liveness contract, B kill-checks-before-kill, C resume-after-kill,
D unpark BA-19's `deadlineMs`). All four are now answered. **None of them touches who owns a
bound:** budgets, walls, caps and verdicts remain operator territory, permanently.

### 1. Where the four landed — including the one that is a PROCEDURE, not a mechanism

| | landed as | where |
|---|---|---|
| **A — liveness contract** | **an operator PROCEDURE, surfaced by the runner, not an in-code assertion.** No process can assert that the machine under it will stay awake, and a harness that grabs a system lock nobody asked for is the wrong side of the line — so the runner PRINTS the `systemd-inhibit --what=idle:sleep` launch line on every dry-run and launch and never shells out to it. Stated plainly rather than dressed as a mechanism. | `scripts/run-reuse.mjs` |
| **B — kill checks before it kills** | the watchdog's pre-kill report extended with `pidAlive` / `pollMs` / `termGraceMs`, written atomically (temp+rename) so a **report failure can never defeat the kill** (F70's class), the `SIGKILL` escalation announced, kill tests run at PRODUCTION window:poll ratios | `4278ad6` |
| **C — resume after kill** | `--resume <runid\|spine-path>` — §2 below | `c04cdcf` |
| **D — BA-19's `deadlineMs` unparked** | a per-call total-duration deadline derived from the **remaining wall at call time**; **no `maxWallMs` → no deadline** (an unbounded run stays a visible operator choice, never clamped to the idle default), floored at `MIN_CALL_TIMEOUT_MS`; `EDEADLINE` routed by the clock discriminator — **expired → wall-halt, time-left → provider-red** — with F64's control pinned by a must-not-change test. Native has no HTTP seam to arm; said, not papered over. | `4278ad6` |

### 2. Resume is an economics contract: every paid unit is paid once

hamr's two rulings, verbatim and in order given:

> *"money, signature and checkpoint (starts from where it stopped) if mid loop, restart that
> loop"*

> *"even if it gets killed by outside, it should allow resume and start last step instead from
> the beginning, why would i want to waste more money on something i already started, our goal
> is to find ways to save money and time"*

The second **supersedes the try-level reading of the first**, on measured evidence (F76): a
try-level restart re-paid $0.25 then $0.40 of scout across two resumes and left the third leg
structurally unable to finish — $1.42 and 2m 50s to redo three steps that had just cost $7.82.

- **The checkpoint is a COMPLETED STEP's exit** — the finest unit the spine can PROVE finished
  and the tree can show. A half-executed step is not a checkpoint and a worker transcript is
  not a checkpoint. The try-restart survives for exactly one case: death before a plan was
  accepted, where nothing durable exists to resume to.
- **Restarts are funded from the REMAINDER, never a fresh allotment.** Prior spend and prior
  wall fold into the run's own ledger and clock (`priorSpentUsd` / `priorWallMs` /
  `priorElapsedMs`). The signed caps are untouched — tightening the spec would flip the signed
  hash, which is structurally impossible without forging a signature — so *advertised =
  enforced* survives a kill, and a kill cannot widen the signed worst case one kill at a time.
  If the remainder cannot fund the restart the run caps honestly, having launched nothing.
- **What resume does not buy back, named rather than discovered later:** a call killed before
  it returned wrote no event, so money it may already have been billed for is not on the spine
  and cannot be folded. The fold is a FLOOR in exactly the case `spendComplete: false` already
  marks (F6). Likewise a lost R1 registry write is reported as LOST (`r1Missing`) and never
  re-derived — a green's version must be the plan as executed, and the resume reader is not
  where that is decided.
- **A resume never resets the patient**, and never resumes a live pid. The dirty tree is the
  dead legs' real progress; only HEAD moving off the seed (operator intervention) stops it.

### 3. The signature covers the TRIES — hamr: *"fold tries into the hash"*

A reuse run's total authorized exposure is `perTryBudgetUsd × (bridgeTries + 1)`, so a
signature taken over the per-try spec alone signs a fraction of the money and the same hash
prints for `--tries 2` and `--tries 9`. The **signed artifact is the wrapper**
`{ schema: 'reuse-v1', spec, bridgeTries }`, hashed by `reuseSpecHash` — composed from the ONE
`jobSpecHash` so MED-1's resolved-tools pinning is inherited and no second canonicalizer
exists. The `reuse-v1` prefix is domain separation: a reuse approval can never collide with a
bare job approval. The loop bound, the reported `triesAuthorized` and the exhaustion message
all read the SAME resolved object the hash covers — no parallel bookkeeping.

Consequences, accepted deliberately: **signatures taken before the fold are refused**, naming
the scheme change, with both hashes printed side by side; there is no legacy acceptance path,
and re-signing once is the whole migration. A **resume must match the hash both ways** — the
current arguments AND the dead run's own `reuse-start` record — because a resume continues one
signed run, never any run.

Putting `bridgeTries` on the job spec itself was **refuted by test, not by preference**:
`validateJob` reds unknown fields, so that shape would have job-red'd every try.

## Addendum v1.44 — 2026-08-02 (the product is the EXPORTED artifact: the local UI is a workbench, the bundle is an enclosed CLI, and the arbiter travels with it — hamr, interview this session)

This addendum records hamr's answers on what bareloop SHIPS to a user. It changes no doctrine;
it names the delivery form that the doctrine has to survive.

### 1. The local app is a workbench; the product is what leaves it

The UI is where a user **experiments** with a job, **graduates** a workflow (a green mints a
bridge; a green on a second distinct patient proves it — D6), and then **exports** it. The
value the user keeps is the exported artifact, not the session that produced it.

### 2. The export bundle — a dependency, never a code generator

The bundle is: **the signed spec + the bridge + the close scripts + a thin runner that has
bareloop as a dependency** (and pulls bare-agent / bareguard / litectx transitively). It runs
**headless, as an enclosed CLI**.

**It surfaces the SAME operator questions at the CLI that it would in the UI** — the approval
hash, the envelope, the verdict class. The questions do not disappear because the UI did; they
change surface. A bundle that ran without asking them would be a different product.

### 3. Export is not EJECT — and the reason is the arbiter

**bareloop never generates standalone loop code.** An ejected loop is a **forked arbiter**: a
downstream copy of the close, the budget and the fence that can drift from the one the library
ships and can be edited by whoever holds the copy. That is the hard line (§3: the agent never
authors its arbiter; merge stays human forever) defeated by distribution instead of by
authorship.

So **the arbiter RELOCATES with the bundle and never disappears.** Wherever the bundle runs,
budgets, caps, verdicts and merge live outside the emergent part, in the dependency, exactly as
they do locally.

### 4. Verdict classes: declared in the contract, green-only until built

The export contract **declares** the verdict class, but v1 admits **green only**. `soft-green`
and `hitl` were deleted with the legacy `steps[]` path (v1.32) and their return is the
verdict-classes rung; `soft-green` still needs the RSI judged-floor analog before it can gate
anything. Declaring the field now keeps the bundle's shape stable across that rung instead of
forcing a contract change later.

### 5. Sequencing update

**soft-green + hitl come IMMEDIATELY after Layer 3 closes — ahead of genre-widening and ahead
of the UI.** This sharpens v1.23/v1.32 (which placed the verdict-classes rung post-Layer-3
without ordering it against the other candidates) rather than reversing them. Genre-widening
(the second-genre question F51–F55 left open) and the workbench UI both queue behind it.

## Addendum v1.45 — 2026-08-03 (a step is bounded by PROGRESS, not by a count: the shell owns a strike ceiling, `attempts` retires, and the replan brief names the mechanism — hamr)

The step loop's exhaustion rule was a fixed number of check-iterations (`capRuns`). F77 measured
what that cost: two lift-contrast calibrations died as `step-red` with the signed envelope
unspent — one of them still shrinking its own error count on every iteration (30 → 22 → 17 → 11,
cut with $1.30 and ~6 minutes left) — and F73's try 1 had done the same a patient earlier. It is
the silent-second-ceiling class (F37/16g) inside our own shell. hamr opened it directly:

> *"if workflow fails in dense jobs then it failed at planning and self healing. why not fix
> that?"*

### 1. The rule, and who owns it

**A step ends when it stops making progress, not when a counter runs out.** A *strike* is a red
iteration that REPEATS an already-seen normalized gap (a seen-set, never last-only) or made no
gate-audit writes (the F32 record-count instrument — never git status, never a tree diff). Two
strikes end the step.

**Ownership is unchanged and is the whole point of the shape.** The strike ceiling sits
shell-side exactly where the count sat: the runner sets it, **the agent cannot express it, and
no step may tighten or raise it** — arbiter territory, permanently, like every other bound. The
number itself is hamr's (2), set before F78's threshold sweep independently landed on it; a
threshold is never picked by the agent from a small observed sample.

**The signed resource caps remain the only caps that matter to a run's economics:** money and
the wall. The wallet, the wall (v1.40's W-2), the variance meter and the stall fuse are
untouched and each still ends a step on its own authority. Exactly one bound was replaced —
exhaustion-by-count — so a converging step now runs on the money and time the operator signed
for it, and a thrashing one ends the same iteration or one earlier (F78, 110 archived ladders).

### 2. `attempts` retires from the agent's surface — and is tolerated, never rejected

A step's `attempts` field could only ever TIGHTEN below the shell's number, so the correct heal
for a converging step was inexpressible and drafters measurably tightened it anyway (3, then 2
on replan). It is **removed from the drafting menu and ignored by the runner**. It is
deliberately **not redded**: stored bridge plans carry it, and refusing them would invalidate
every recipe minted before today and break a frozen contrast mid-programme. Shape still checked,
upper bound gone with the cap it named — a plan stored under one runner's number must never red
under another's.

### 3. The replan brief is a MECHANISM brief

*"It ran N attempts and its exits were still red"* described a bound that no longer exists and
named no mechanism — the same sentence for a converging step and a stalled one, handed to the
one component whose job is to respond to it. The brief now carries which shape ended the step,
the gap trajectory, and what the stop left unspent (with time reported UNBOUNDED, never zero —
F6 extended to time). It names no culprit file; the ladder's inputs are counts and iteration
numbers, so naming one is inexpressible (F28).

### 4. Layer R's VERBATIM stage retires on the step path — hamr's ruling

Fixation IS a repeat, so a fixated step strikes out before Layer R's fourth-iteration VERBATIM
note can be injected. hamr confirmed **summary-only on the step path** (the stage stays
reachable in the close-fix loop, keeps full unit coverage, and Layer R still ships OFF by
default per v1.24/F41), and confirmed the resulting flow verbatim:

> *"so, 2 strikes followed by handing notes on next replan/run"*

The two alternatives are invalidated on evidence, not preference: raising the ceiling pays an
extra stuck iteration on every thrash loop for a feature that ships OFF (F78's sweep), and
exempting the post-ratchet iteration buys a louder note to a stuck worker — the one thing
measured dead twice (F32/F39 delivery ≠ conversion) — through a guard-hole of exactly the F70
class. **The notes moved recipient, not volume:** from the stuck worker (semantic genre, does
not convert) to the replanner (mechanical genre, converts — F38/F46).

### 5. The close-fix loop keeps its count — recorded, not overlooked

`CAP_RUNS` is now the CLOSE-FIX loop's cap and nothing else. Its replay evidence does not exist
(F78's corpus is step ladders), and converting it on another population's numbers is the move
this programme keeps refusing. **A recorded follow-up: its own $0 replay over close-verdict gaps
comes first.**

### 6. Consequence for the lift-contrast programme

The admission screen was **inverted** by this defect: two of three candidates were rejected for
the harness's ceiling rather than their own hardness, and the screen was reporting workflow
failure as patient hardness (F77). With the fix landed the screen is un-inverted — candidates
are no longer pre-filtered by a harness defect — and the frozen prereg's clauses are otherwise
unchanged. The rejected candidates are not retroactively admitted: a re-run on the fixed code is
a new calibration row, judged by the same frozen screen.

## Addendum v1.46 — 2026-08-04 (the shape lottery closes at the gate, and money gets the W-2 treatment: an accurate halt-note, a continue button, and the fix-loop's count retires — hamr)

### 1. The two shape-lottery gate rules (SHIPPED, commit `28ee95f`; validated live, F81)

The $0 archive sweep settled the bareagent-u deaths as shape-selection, not capability:
per-file decomposition carrying the whole-goal check on an early step has 0 honest greens
ever; the wide closing step (the RLM shape) greens 7/7 whenever rolled. Two mechanical rules
make the losing shapes inexpressible — neither asks any model to judge "is this job small":

- **Rule A-v2 (`check-placement`)** — a check whose recorded PREFLIGHT verdict was red may
  only gate the plan's FINAL write step. Green-at-seed checks (guards) stay free mid-plan.
- **Rule B (`check-shed`)** — a replan may not drop a `check-passes` its predecessor carried;
  it may move one, never shed it (the u-msdsmkid form-only fake green).

Both laws are STATED in the drafting prompt from the same facts object the validator judges.
Resume revalidation is exempt by design (a paid plan is never refused over a law minted after
its draft). Live read (`u-msew1uy5`, F81): the drafter rolled the RLM shape on the FIRST
draft, both goal files edited from attempt 1, first honest step-green in the patient's
four-run history. Rule B still awaits a live replan for its live read.

### 2. A MONEY halt becomes what W-2 made of a TIME halt (hamr: "money cap should halt and
feedback… and needs to be accurate")

A money cap-halt keeps its last minted verdict and pauses DECISION-READY, with a verdict on
the run's own trend: **cut-while-CONVERGING** ("still progressing: errors 12→5, ~$/iteration
— a top-up likely finishes it") or **cut-while-FLAT** ("nothing moved in the last N verdicts
— more money is waste; revise the goal/prompt"). Accuracy law: the verdict is computed from
the close's own graded numbers, PER STAGE — never across axes (the operator's own sweep
instrument misread the typecheck/suppressions see-saw as "worse" by mixing them; the shipped
readout must not repeat it), and never model prose. No extractable number → "can't tell",
stated (F6). Levers, W-2-symmetric: top-up & resume (a re-sign) / revise the spec / abandon.

### 3. Cap-halt RESUME on the U path (the missing third leg of hamr's resume rulings)

Kill-resume existed (module C), wall-halt pauses decision-ready (W-2); a MONEY cap-halt —
the case the original "why would I waste money on something I already started" ruling was
about — fell between them: run-u has no resume and hard-resets the patient, and the resume
reader classes a landed `job-end` as complete. The gap is closed as wiring, not new
machinery: `--resume` on run-u skips the seed reset, folds the dead run's spend in as
`priorSpentUsd` (the ceiling never silently widens), skips the completed plan prefix, and
re-enters at the outer close + fix loop. The top-up itself remains a spec re-sign.

### 4. The close-fix loop's count retires for the SAME strike rule (v1.45 §5's recorded
replay: RUN, clean)

The pre-registered $0 replay over every archived fix-loop (8 runs) came back clean both
directions: **0 greens harmed** (all 3 historical fix-loop greens converted in ≤2 verdicts)
and **1 real waste case caught** (`reuse-msc6w93z`: dead flat at 2 errors for 7 consecutive
fix verdicts until the wall killed it; the 2-strike rule stops it at verdict 4).
`CAP_RUNS` retires as the fix loop's governor; the ladder's 2-strike no-progress rule
(per-stage series, same accuracy law as §2) replaces it. Money and wall keep every bit of
their authority; the design intent, hamr verbatim: internal loops "catch a dead end instead
of capping" — a run should die when it is out of ideas, not out of money mid-convergence.
The money cap stays the hard outer line and is never self-adjusted (unchanged hard line).

### 5. Evidence base and sequencing

Money-cut deaths in the entire archive: 8 — seven the F45 clipipe casualty class (born
unreadable), one `u-msew1uy5` (converging at the cut). The feedback features matter FORWARD:
the gate rules now carry runs deep enough to reach the money line while still working, a
depth no prior run reached. Build order: §2+§3+§4 next (opus-delegated, session as
orchestrator/validator), before the bareagent-u top-up decision consumes them; the lift-
contrast (§ v1.42) remains the north star behind the rules decisions in flight.
