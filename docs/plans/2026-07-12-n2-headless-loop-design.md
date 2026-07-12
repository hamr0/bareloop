# N2 — single-job headless loop: design record

**Date:** 2026-07-12 · **Status:** designed (interview complete; POC next)
**Inputs:** PRD §6/§7/§8/§10, N1 design record (+ its "explicitly out" queue), F2/F4/F5,
interview with hamr 2026-07-12 (four decisions below). Amend with dated addenda, never
rewrite.

## What N2 is

The first token-burning rung: `runJob()` takes a **human-approved** job spec and executes
job #1 end-to-end on the real litectx repo — the worker drafts its workflow config (gated
reds-before-tokens), each step runs as its own outer-shell loop under one budget, the
draft PR is the escalation artifact, merge stays human forever. N3's inheritance reads
the spines these runs write; nothing here mints rules yet.

## Interview decisions (hamr, 2026-07-12)

1. **Entry point is `runJob()` only — no CLI until N5.** The scheduler rung is what
   starts runs automatically (cadence is validated but unconsumed until then); at N2 a
   human starts a run by calling the exported function from a script. A CLI minted now
   would fix a contract before the scheduler exists to inform it (library-first,
   LIBRARY_CONVENTIONS).
2. **Sequential loops, one per step; shared single budget; a step-red stops the job.**
   Each step is its own ralph loop with its own close. All steps draw down the ONE
   `budgetUsd` (N1 decision #2 — no per-step slices). A step that cannot green stops the
   job at that step; the stop is a result (ladder discipline applied to steps), and the
   decision-ready escalation names which step died and why. Rejected alternative: one
   composite close for the whole chain — gap attribution couldn't name the failing step,
   and the `hitl` PR step doesn't fit an automated retry loop.
3. **The agent drafts the workflow config on every run; `validateConfig` gates it.**
   Orchestrate-first-encounter (PRD v1.3): the worker drafts a workflow config from the
   job spec; the validator rejects anything illegal before real work starts; the
   run-as-executed record (`config-final`) is what N3 will inherit from. Rejected
   alternative: hand-seeded config at N2 — it would defer the product's central claim
   AND force N3 to land authoring and inheritance at once.
4. **Real litectx from day one; PRs are drafts.** The write fence, the budget cap, and
   human-gated merge ARE the containment — trust them now. Nothing merges without hamr;
   draft PRs are reversible. (The sandbox-first alternative was declined: faster real
   signal on the actual measurement bed outweighs the insurance, given the fence has
   three review rounds and an enforcement belt behind it.)

## Defaults taken (stated, not silent)

- **`checkApproval` gates everything.** `runJob` refuses an unapproved spec before any
  provider call — its own named outcome (`unapproved-spec`), not a generic red. Approval
  records load from a file OUTSIDE the spec (shell/human territory, N1 decision #1).
- **Config drafting is one sealed shot** (the extract.js pattern): one provider call
  drafts the config; reds are fed back for **one** redraft; a second red is a
  `config-red` stop — decision-ready, zero further tokens. No draft-until-green loop
  (that would let the drafter grind the budget).
- **Budget threading:** the runner owns a cumulative spend ledger; each step's interpret
  call receives `min(job.budgetUsd − spent, shell cap)` as its ceiling. Ceiling chain
  unchanged: `workflow ≤ job ≤ shell`; cap-not-estimate.
- **`predicate` cmd → argv without a shell:** whitespace split only; quoting is
  inexpressible at N2 (a cmd containing quote characters reds at validation — honest
  refusal beats silent misparse). Revisit only if job #1 needs it.
- **The `hitl` step runs no loop.** Its middle does the work (open the draft PR via
  `gh pr create --draft`), then the run emits the decision-ready escalation carrying the
  spec's prompt and the PR URL, and ends `escalated` — by design, not failure. The human
  merge happens outside the run, always.
- **N2-queue items land on this rung** (filed F2/F4/N1): close **timeout** → ralph
  options (120s is currently hardcoded); **tail-biased gap bound** (ralph head-truncates
  at 2000 chars; the useful error is usually at the tail); **artifact-red** category +
  fence-robust extraction; **primitive-smoke** known-answer checks before tokens (the A3
  silently-degrading-primitive detector, PRD v1.5 §4); the **upstream-ledger reader**
  (rewrite against `docs/plans/2026-07-11-upstream-ledger-design.md`; the POC stays
  adaptlearn-side); test-helper consolidation (stub providers, spine read-back, fixture
  loaders).
- **V7 armed:** `coordination-red` gets its first real surfaces here — the pre-registered
  prediction fires or falsifies on job #1's runs. Vocabulary exists (N1); machinery only
  if a real one appears.

## POC (aim at the riskiest assumptions, ~15min each)

1. **Composition (token-free):** a scripted-stub run of a 2-step job through
   draft→validate→sequential interpret calls with the shared-budget ledger, on a
   throwaway fixture repo. Proves: per-step task/close derivation, budget threading,
   step-red stops the job with the right escalation, spine tells the whole story.
2. **Drafting (one real shot, ≤ $0.10):** can a frontier model, given the job spec and
   the workflow schema, draft a config that validates green? This is the central-claim
   risk (decision #3). One call, measured, red or green is the finding. If it reds
   reliably, the redraft-once default gets its evidence — or the rung stops, and the
   stop is a result.

## Module plan (build order, TDD — tests first, watch them fail)

1. `src/ralph.js` — options: `closeTimeoutMs`, tail-biased gap bound (queue items; small,
   self-contained, unblocks everything).
2. `src/run.js` — `runJob(spec, { approvals, workdir, provider, shellCapUsd, emit })` →
   outcome. Approval gate → primitive-smoke → draft(+one redraft) → per-step interpret
   with budget ledger → hitl escalation. New spine vocabulary: `job-start`, `step-start`,
   `step-end`, `job-end`, `unapproved-spec`, `smoke-red`.
3. `src/extract.js` — artifact-red category + fence-robust extraction (F2 requirement).
4. Upstream-ledger reader (`src/ledger.js` per the 2026-07-11 design; reads spines, never
   writes them).
5. `src/index.js` exports · `bareloop.context.md` · test-helper consolidation.

## Exit (rung discipline)

Job #1 runs end-to-end on the real litectx checkout: review→fix→draft PR, hard greens
only, under cap, approval enforced, spine complete and secrets-clean · suite + typecheck
green (mutation pass on new guards) · context doc current · CHANGELOG (0.3.0 on release)
· findings logged (the drafting-probe result is a finding either way). A rung that cannot
meet its exit stops the ladder; the stop is a result.

## Explicitly out of N2

Inheritance + contrast-bit extractor live (N3) · soft/HITL minting (N4) · scheduler +
cadence consumption + CLI (N5) · panel (N6) · request-red registry (~N3/N4) ·
per-step budget slices (future tightening, N1 decision #2).

---

## Addendum 2026-07-12a — POC results (both green) + the pricing-red rule (F6)

POC #1 (composition, token-free): **holds**, six scenarios against the real modules;
budget exhaustion has TWO stop points (drafting gate and per-step re-validation), both
before tokens. POC #2 (drafting, real tokens): **GREEN on one shot** — claude-sonnet-5
drafted a fully legal config from the schema description alone (no example to copy);
decision #3's central-claim risk is retired for N2; one-shot + one-redraft stands.

New default minted by F6 (the probe's own harness confound): **unpriced is never free.**
`runJob`'s ledger halts decision-ready (`pricing-red`) on a worker-result whose
`costUsd` is null/undefined instead of accumulating $0 — otherwise the hard cap is
gameable by any unpriced provider path. Drafting calls route through the same
accounting, never around it.
