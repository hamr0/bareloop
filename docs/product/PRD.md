---
type: reference
title: "bareloop PRD — core spec"
status: stable
sources: [docs/archive/PRD.md]
---

# bareloop PRD

The current-state reference for bareloop's product spec: what it is, the design laws it will not
relitigate, its three-layer shape, its non-goals, its risks, and where the build ladder actually stands today.

> **This is the living PRD.** New addenda append here, dated, as they always did. The
> v1.1–v1.78 history is split by theme across `docs/wiki/` — see `docs/index.md` for the
> map. The pre-split monolith is preserved byte-identical at `docs/archive/PRD.md` and is
> closed: never edited, only cited.

## §1 What it is

**"Automate this job — I don't know the best workflow."** bareloop is a system for tasks that are
**repeated, long, and verifiable**: the operator describes the job and its checkpoints; an agent
authors the workflow scaffolding (a constrained, validated config — never freeform code); runs
execute under an un-gameable outer gate; and the scaffolding *improves across runs* through
verdict-gated, run-as-executed inheritance with ledger-counted attribution. One-off or small jobs
are explicitly out of scope (that's a CLI session). The pitch: **workflows that earn their own
design, with receipts** — every inherited rule carries the green that minted it and the contrast
that attributed it (PRD.md:12-23).

## §2 Why it's buildable now

The mechanisms below are settled evidence from the adaptlearn predecessor project, not things
bareloop re-proves: agents author valid harness configs at hand-written parity (F10); mid-run
revision recovers stuck runs (F11, 3/3 vs 1/3); verdict-gated inheritance beats ungated on
pass/fail (F19, gated late 1.00 vs ungated 0.13); run-as-executed inheritance transmits in-run
learning (F20, 6/6 lineages across the credit-death boundary at ~½ cost); which-knob attribution is
countable from the ledger (V2, contrast bit present 16/16); memory pays where the regularity sits
outside the worker's prior (F17/F18, notes-only conventions → feedforward green@1 at ~8× under
acquisition cost); the API worker seam holds under the gate (SP-2); and lineages key cleanly per
job × declared channel conditions (SP-2 addendum, V3). Open questions the product measures rather
than assumes: rule generalization across runs of one real job, soft-green minting policy,
long-horizon gate value under executed inheritance, and local-LLM providers — each has a
pre-registered handle in §9 (PRD.md:24-40).

## §3 Design laws

Inherited doctrine, each paid for in the adaptlearn experiment — do not relitigate without new
evidence:

1. **The agent authors its workflow; it NEVER authors its arbiter.** Closes, budgets, caps,
   merge/publish decisions live outside the emergent part, permanently.
2. **Inherit the run-as-executed, never the run-as-authored.** What a run learned mid-flight is
   lineage property, verdict-gated on admission.
3. **Verdict admits, contrast attributes.** A knob is claimed only with ≥1 contrast bit; bare
   greens admit nothing into the rules.
4. **Green gates, cost ranks — never one fitness score.** Cost pressure is the legal optimizer
   only because the arbiter is outside.
5. **Every information path into the worker is a declared job condition** — close verbosity,
   provider path, task framing, scaffold. A channel change is a lineage-key dimension.
6. **Any claim instrument meters or disables in-run revision** — the fast loop shadows the slow
   loop; product reads must classify greens by mechanism (feedforward vs acquired), not by count.
7. **Escalations travel a channel no emergent component summarizes** — byte-identical from shell
   to human.
8. **Reds are evidence, never verdicts; cap-halt is its own category; the only real failure is a
   confident fake green.**
9. **Mutation/search operators are pre-flighted for reachability** against the config space.
10. **Consume the bare suite; never paper over a lib gap** — request-reds double as upstream
    findings (PRD.md:41-67).

## §4 The shape

Three layers, product form:

- **Outer shell (dumb, permanent):** per-run budget cap (bareguard), retry cap, verdict
  collection, escalation routing. Stateless across runs; nothing inside negotiates with it.
- **Emergent middle:** the authored workflow config — steps, per-step verdict class, memory
  binding, hook ops, write scopes — schema-validated, config-red before tokens burn. Mid-run
  revision is allowed in production runs (it recovers runs and its learning is captured by law #2)
  but disabled in claim/analytics cohorts (law #6).
- **Floor:** an append-only JSONL spine (the single source for every UI), a litectx store per job,
  and a ledger with per-run rows. The panel is a pure observer of the spine. Secrets load from the
  environment and never enter the spine, configs, or ledger — an append-only record that captures
  a key captures it forever.

**Verdict classes, gated per step:**
- **Hard green** — predicate/exit-code truth; mints inheritance automatically.
- **Soft green** — rubric/assessment; passes the run, mints only with HITL confirm or N
  consistent repeats.
- **HITL green** — a human is the close (PR merge, "publish"); merge stays human forever.

**Primitive menu (MCP-disclosure style):** the full bare-suite surface is listed to the author;
only admitted verbs are callable; a locked-primitive need becomes a structured request-red →
explicit registry admission; removal is a first-class mutation (PRD.md:68-91).

## §6 Job #1 — auto-maintainer on litectx

The proving job: review → fix → branch → PR → **human-gated merge, forever**. Hard greens are
litectx's own suite plus lint; bareguard write scopes cap the diff; the PR is the escalation
artifact. The store seeds from CLAUDE.md/AGENT_RULES; what the lineage learns is per-repo
folklore — exactly the regularity class F17/F18 showed memory pays for. Job #1 doubles as the
measurement bed for §2's open questions (PRD.md:102-109).

## §8 Non-goals

No swarm, no orchestrator frameworks, one process per run. No freeform code as scaffolding. No
self-adjusted budgets — ever (the agenticSeek smell). No UI before the headless loop closes on
job #1. No local-LLM work until the API path earns it. Not a general agent — a place where
*repeated, verifiable* jobs get better at themselves (PRD.md:119-125).

## §9 Risks and their pre-registered handles

- **Rules don't generalize across non-identical runs** → job #1's first measurement; the lineage
  key already supports per-task-family splits if needed (V3).
- **Fit-to-pass drift under executed inheritance at long horizons** → keep the gate on admission;
  measure retention/drift on job #1's real timeline before relaxing.
- **Soft greens minting junk** → default to HITL-confirm minting until N-consistent has data.
- **The close chain is wrong/gameable** → close-authoring hierarchy + channel declaration; a close
  the operator can't explain is a close the product shouldn't trust.
- **Cheaper worker surfaces as API substitutes** → RESOLVED for clipipe (F48): only the
  `anthropic-api` surface is guaranteed. The `clipipe-subscription` surface is capable at the step
  level but did not carry job #4 to a grade in 2 rows (0/2 vs API 3/3); a 3.5× budget raise
  ($8→$28) was REFUTED — it escalated on an F39 semantic stall at $7 of $28, not on money. It buys
  $0-marginal billing at a permanent tax (~2.5–3× notional effort, always slower, no resume, same
  F39 ceiling): in only as a babysat fallback, never a peer. Local LLMs remain deferred and
  UNMEASURED (PRD.md:126-144).

## §10 Build order — and where it actually stands

The original ladder sketch: N0 port + shell + spine (token-free) → N1 job/close schema + validator
→ N2 single-job headless loop (job #1 minimal, hard greens only) → N3 executed inheritance +
contrast-bit extractor live on job #1 (kill-switch: rules must transmit across non-identical runs)
→ N4 verdict classes complete (soft/HITL minting) → N5 scheduler + budget ops → N6 panel. A rung
that cannot meet its exit stops the ladder; the stop is a result. Budget discipline: hard cap per
run, cap-not-estimate (PRD.md:145-155).

**Current state (Addendum v1.77, 2026-08-23):** N4 is complete — both slices shipped (hitl retired
as a verdict class, softgreen shipped v0.12.0) — and v0.13.0 is live on npm (read shim OFF by
default, G1 at the validation gate, `estimated`/`rateSource` provenance, plus four release-round
fixes; F110 minted: a close's host must have the arbiter's lifetime). But §10's plain N4→N5→N6
reading is stale: two bodies of work now sit ahead of N5, neither a rung. **(a) The pricing
chain** has a deadline of 2026-08-31 — `bare-agent` is pinned `^0.36.0`, the provenance fix shipped
upstream in 0.38.0 and is built-and-inert here; after the deadline the generic fallback
under-prices by a *prospective* 1.586× (observed archive error is 5.7% over 7,507 rounds). **(b)
Generic run replay** is an admitted, unscoped gap — no failed run can be reconstructed in under
five minutes today, though every byte needed is already on disk. Build order from here: pricing
pin bump → `rates` passthrough → run-behaviour summary, then generic replay → the bench → then N5.
The $0, unblocked stale-index preflight (W4) was also agreed this turn (PRD.md:5779-5897) —
**but see the same-day correction below.**

**Corrected same day (Addendum v1.78):** two $0 reads landed hours later and revise v1.77 without
rewriting it. First, the planned four-job bench cannot inherit any archived row: the G2
candidate's spec (`jobs/aurora-testgen.json`, the 0-of-43 row) was deleted in `507adbb` and is not
merely stale but not re-runnable — it must be re-authored in plan-v1 as a different job with an
unknown 0-rate; the G1 candidate's spec was edited the same day the addendum was written,
flipping its hash and invalidating its 2026-08-19 baseline. Commit-count drift is offered only as
a proxy, never proof, for the remaining candidates. The bench's real first bill therefore includes
re-authoring G2 and re-baselining all four rows — no ceiling should be quoted until that is
scoped. Second, the agreed stale-index preflight (W4) is weaker than it looked: the "phantom
defects" motivating story has zero occurrences in this repo's own FINDINGS; this repo holds
disconfirming evidence of its own (F35: a fresh index is a ranking no-op); and every obvious
detector key (mtime vs working tree, mtime vs HEAD) is blind by construction on this project's
fresh-copy patients. The item stays agreed, but the first spend against it should be a $0
measurement of how stale archived indexes actually were at run start — not the build
(PRD.md:5898-5988).

**Addendum v1.80 (2026-08-24) — rulings.** Findings now go to `docs/logs/FINDINGS.md` and the
theme wiki pages, not here; the PRD keeps only the ruling, one paragraph each, and a pointer.

1. **Rates are the customer's responsibility.** Rates are never handrolled: no per-model
   pricing table is maintained here; upstream guesstimates on the sonnet rate and stamps a
   loud `tier`/`default` source; a customer wanting exact pricing passes caller rates.
   Rates-passthrough is DEAD — never re-raised (F113 ruling section).
2. **Run-behaviour summary (TODO item 1) is DONE.** Report-only, computed from the gate
   audit, surface-only — no spine record (a new record type is a new writer every spend
   instrument must account for); ships in the library (F114 §1).
3. **MEMORY-CACHE readout.** The read shim reports what it withheld — re-reads answered from
   memory, reads capped, KB withheld, approx tokens — as one report-only `memory-cache` spine
   record per armed run (none when off; absence is never a fabricated zero), printed at the
   run tail. Savings in dollars are measured only by an ON/OFF contrast of the same job; the
   counter says what was withheld, never what was saved (F114 §3; `docs/wiki/providers-context.md`
   §3.9).
4. **One transport retry.** Exactly one extra attempt, only when the request never produced
   an HTTP response (TLS fault, reset socket, network timeout); HTTP responses (4xx/5xx/429)
   keep upstream's policy unchanged; the count is a fixed constant, never a spec/argv knob
   (tighten-only); a wall-clock timeout is never retried. Any retry makes the run's spend a
   FLOOR (`spendComplete:false` — the first attempt may have been billed). Reported on the
   spine (`transport-retry`) and at the run tail (F115 "Ruled" section; `docs/wiki/money-time.md`
   "Transport retry and the provider-red resume").
5. **provider-red joins the resumable set — BUILT 2026-08-24, LIVE-PROVEN 2026-08-25**
   (F115 addendum 2026-08-25). If the one retry (#4) also
   fails, the run still ends `provider-red`, but `--resume` will re-enter at the recorded step
   with the accepted plan instead of refusing. No cost or step threshold gates the offer — a
   threshold would be a number picked from a small sample (arbiter territory); instead the
   tail prints an honest readout (spend so far as a floor, which step of how many it died in,
   the exact resume command) and hamr decides (`docs/wiki/money-time.md` "Transport retry and
   the provider-red resume").
6. **Live-run validation standard.** "Built" is not "done": a feature's spec includes its
   CALLER (the delivery clause "at the end of every run" names a call site), and the live tail
   print counts as proven only once seen on a real run; until then the PRD tick says so (F114).
7. **The `bad record mac` condition is a FINDING, not a spec change.** Every aurora-u
   provider-red since Aug 19 is one TLS transport error, on every shim arm, cause unproven;
   retry (#4) and resume (#5) are the product's answer — chasing the cause is optional and
   paid (F115).

**TODO (Addendum v1.80 — 2026-08-24):** the standing list (v1.79 folded in); reconciled against
`docs/product/2026-08-23-agreed-build-list.md` and prior stashed open items. Index only.

1. ~~Run-behaviour summary~~ — **DONE 2026-08-24** (`ac24855` + driver wiring + live proof):
   `runBehaviour`/`formatBehaviour` in the library, `scripts/behaviour-readout.mjs` for
   archived runs, and the `BEHAVIOUR` block in `run-u.mjs`'s end-of-run print. Q7 answered
   surface-only, Q8 answered library. Printed live at the tail of u-run `mt7g7b68` (F114).
2. **MEMORY-CACHE readout** — **BUILT 2026-08-24, LIVE-PROVEN 2026-08-25** (F114 §3; F115
   addendum 2026-08-25).
3. ~~One transport retry~~ — **BUILT 2026-08-24, LIVE-PROVEN 2026-08-25** (F119: fired twice
   on u-mt8yk53k, both recovered).
4. **provider-red resumable + honest readout** — **BUILT 2026-08-24, LIVE-PROVEN 2026-08-25**
   (F115 addendum 2026-08-25; ruling #5 above).
5. **Chase the TLS `bad record mac` cause** — optional, paid, hamr's call (F115); the retry
   now absorbs it (F119) — chase stays optional.
6. ~~Generic run replay~~ — **BUILT 2026-08-25** (F117): `replayRun`/`formatReplay`
   (`src/replay.js`) + `scripts/run-replay.mjs`, report-only, reuses `runBehaviour`/
   MEMORY-CACHE; the pre-declared 5-minute test passed on 3 unseen failed runs and found 3
   defects (escalation detail hidden, `--all` name-matched only, a replanned step merged by
   id), all fixed.
7. **The bench** — Q1, Q3–Q6 **ANSWERED 2026-08-30** (v1.81 below; Q10 answered v1.78);
   Prereg **FROZEN 2026-08-30** (`docs/product/BENCH-PREREG.md`; litectx row re-baselined
   green at its hash, run `u-mtfywb55`, $5.72). Cadence answered 2026-08-30 (hamr): major
   releases trigger a pass. Cadence reading confirmed by hamr: 0.16 → 0.17 (feature bump), not
   patch tags. Queue on the SAME branch (`bench-prereg`, no interim release — hamr, 2026-08-30),
   his order: **G2 re-author + re-baseline** ($0 scoping first — the re-author + unknown 0-rate
   sits outside the $16 pass ceiling, so its own ceiling is hamr's word), then **#3 model names
   in the signed spec** (parked → GO given 2026-08-30; note: it re-hashes every spec, so the two
   bench rows must be re-baselined and re-frozen after it — hamr's call which way), then
   generic replay follow-ups if hamr names a gap (it is BUILT, #6 above). The feature bump
   that results (0.17.0) fires the first bench pass. **2026-08-30, complete:** #3 built +
   live-proven; both positive rows re-baselined green at model-pinned hashes; G2
   (`aurora-testgen-cold`) established non-green (u-mtg6bwa0, 15% vs 45% bar, $7.09); hamr
   raised the pass ceiling to **$24** and the bench re-froze as THREE rows (BENCH-PREREG).
   **2026-08-31 (at v0.17.0):** pass trigger amended to hamr's per-release CHOICE (BENCH-PREREG
   amendment); a cheaper-provider experiment is queued for AFTER the build freeze, judged by a
   bench pass under its own re-baselined condition — provider work lands upstream in bare-agent.
8. ~~Prompt-commit shape~~ — **BUILT 2026-08-25** (F118). Q9 ANSWERED 2026-08-25: a check,
   wired into `npm test` (CI untouched until #2b, below). `src/promptregisters.js` (`PROMPT_REGISTERS`,
   `isPromptFile`) is the one inventory; `scripts/prompt-commit-check.mjs` validates
   `Failure:`/`Addresses:`/`Corrects:` labels on any commit touching a prompt-register file,
   skipping (not redding) an unresolvable `--range` baseline. hamr's same-day addition: the
   `Failure:` line must also cite the RUN that caused the change (`run <id>`/`run u-<id>`),
   format-checked only, never verified against a real spine file. **run→code stamp landed
   (F118)** — the parked other half: `codeVersion()` (`src/codeversion.js`) stamps
   `job-start.code: {version, sha}` (report-only, $0, no shell), and `replayRun`/
   `formatReplay` print it right after `model:`. Live-proven on u-mt8yk53k (F118 addendum).
   CI now supplies `PROMPT_COMMIT_RANGE` (`github.event.before..sha`, push events) so a
   linear multi-commit direct push is fully covered (#2b, 2026-08-27). **CI-proven
   2026-08-30**: branch-birth push (40-zero `before`) fell back and checked 5 commits (CI run
   33314883771); the next push used the real range `7e975b3..f0c3199` and checked exactly 1
   (run 33314899690).
9. ~~Model names in the signed spec~~ — **BUILT 2026-08-30** (hamr's GO, `eacaeae` + `0119f19`):
    optional `model` in job-v1 (exact id), in the signed hash; spec wins, a mismatched `--model`
    is refused; judge stays library-pinned (calibration-bound). $0 runner checks passed (old hash
    refused, mismatch refused). Both bench specs pinned `claude-sonnet-5` (`0bf1c26`) — re-baseline
    + re-freeze pending the two paid runs; live `(spec)` banner proof lands with them.
10. ~~F6 halt semantics for all-zeros usage; companion F6 test fix~~ — **CLOSED 2026-08-24**
    by `bare-agent` 0.39.0 (F111).
11. ~~Awaiting ba24 — BA-24 fix candidate~~ — **CLOSED**: validated pre-release, pin bumped
    to `^0.39.0`, post-publish sweep 2050/2050 (F111).
12. **aurora run-time signature** — sign when a run next fires; spec's `approvals` key is
    `null` today (F110).
13. ~~4 `jobs/*.json` stale doc-path strings~~ — **DONE 2026-08-30** (hamr's word): the four
    `description` strings now point at `docs/product/{TESTGEN,TYPES}-PREREG.md`; the two
    `docs/logs/` preregs moved to `docs/product/` beside the other eight (index + live links
    repointed; `docs/archive/` and CHANGELOG history untouched). Four signed hashes flipped —
    each re-signs at its next run (#12's mechanism).
14. ~~**`bareloop.context.md` target-design-first flip**~~ — **DONE 2026-08-30** (hamr: "flip"):
    the header leads with the shipped v0.15.0 contract (green + soft-green, judged floor,
    review door); `hitl` demoted to a LEGACY block — still admitted in code, retired by design.
15. ~~**Accept re-proof wall governance**~~ — **RULED 2026-08-30** (hamr): the door-accept
    re-proof runs UNCLOCKED, on the condition it stays mechanical — `mechanicalStages()` only
    (`src/reviewdoor.js:213`), never a judged floor, never a person, no LLM. A check is never
    bounded (W-2); any future non-mechanical re-proof is a new arbiter question.
16. ~~**Green-class registry hole** (`door-accept` on green refuses `no-row-for-run`) — reuse
    territory, hamr.~~ — **RULED + BUILT 2026-08-30** (hamr): green mints a registry row at
    run end, born released; soft-green unchanged (held → accept releases). Accept on green
    records and releases nothing.
17. ~~**`readShim` default flip**~~ — **DONE 2026-08-31** (`2811c6d`, hamr's explicit call):
    `scripts/run-u.mjs`'s `--read-shim` default flips from A0 (off) to A1 (cap); Phase 2's own
    prereg promise (the experiment never flips its own default) held — the operator flipped it,
    not the experiment. `--read-shim off` restores A0; the three frozen bench rows pin `off`
    explicitly so their baselines keep the condition they were established under — no
    re-baseline required or paid.
18. **Flake-name capture** — held until the peer says "load window open" verbatim.
19. ~~**Housekeeping** — delete branches `bareagent-0381-bump`, `reorg-v2-test`~~ — **DONE
    2026-08-27** (`bareagent-0381-bump` deleted locally; `reorg-v2-test` already gone from
    local and remote); broad-`git add` workflow rule (stage by explicit path while a reorg
    is in flight) stays.
20. ~~`job-start` to carry `verdictType` + worker model~~ — **DONE 2026-08-25** (F117):
    hamr blessed "1" verbatim; both `verdictType` (`src/run.js:303`, always real — a required
    spec field) and `model` (conditional on the provider binding carrying one — `src/planrun.js:76`)
    landed, `src/replay.js` reads both. Live-proven on u-mt8yk53k (F118 addendum).
21. **`hitl` cleanup — decision deferred** (hamr, 2026-08-30). `hitl` is retired by design
    (v1.71) but still admitted in code (`VERDICT_TYPES`, `human-confirms`, `hitl-pause`/
    `hitl-decision-red`); its pause machinery already lives on as the review door. Two ways
    to close: (a) finish the retirement — delete the class, the stage kind, the two terminals,
    migrate any `jobs/*.json` using it — a breaking rung with its own release; or (b) keep it
    admitted so the class can be reopened later. Neither scheduled; hamr's call.
22. **LIBRARY_CONVENTIONS gap — DONE 2026-08-30**: 26/36 rules already met, 8 N/A; this
    branch adds context.md §Which-mode/§Extension-contract/§Threat-model, per-dependency
    justification in CLAUDE.md, `.env.example`. PARKED with reason: `src/types.js` central
    typedefs (doc says preferred; per-file `@typedef` already generates 1:1 `.d.ts` and
    typechecks clean — moving 23 files' typedefs is churn with no adopter benefit).

23. **G3/G4 scoping** — unscoped, hamr's answers recorded 2026-08-31: G3 = a real planted-cheat
    bench row the close must catch; G4 = any halt→replan→green (not narrowly a money cap-halt).
    Neither built or scheduled. Detail: `docs/product/G2-SCOPING.md` §"G3/G4 scoping". G3 swap
    plan (hamr's "agreed, lower cap, plan a swap"): once G3 establishes, G2 leaves the bench,
    $24 ceiling untouched — `docs/product/BENCH-PREREG.md` amendment, `docs/product/G2-SCOPING.md`
    §"G3 swap plan". G3 itself scoped 2026-09-01, not frozen, no hash, no run:
    `docs/product/G3-SCOPING.md`.

24. **Harness streamline (convergence-per-dollar levers)** — hamr's ruling 2026-08-31: next
    after the current release. Two levers, worked ONE AT A TIME (two changes landing in one pass
    make the resulting delta unattributable): (a) close-forbidden-patterns surfaced at draft time
    (a validator/drafter register, like the no-shell law — a prompt register, never a runtime
    regex) so a gate-red replan stops burning the run's remaining money; (b) bridge-reuse cost
    lift — proven safe, never proven cheaper, needs an ON/OFF contrast. Validation protocol
    pre-registered here before any number exists: a $0 archive replay first measures how many
    dollars gate-red-driven replans actually burned across archived runs — if small, the lever is
    dropped (no paid fire before the archive read); only then one live A/B at a frozen job, one
    lever per pass, judged on cost-to-green and fix-loop turns reached; n=1 detects big dents
    only — a small delta at n=1 is noise and must be reported as such. Neither built nor
    scheduled beyond "next."

    **2026-09-01 — lever (a) DROPPED** (F123): the pre-registered $0 archive replay measured
    gate-red recovery at ~3.3% of all priced spend (~6.3% on the testgen genre), below the
    already-minor read-hygiene lever — dropped per the pre-registered rule, not built. Lever
    (b) (bridge-reuse cost lift, ON/OFF contrast) stays open, next streamline candidate.

    **2026-09-01 — item 24 CLOSES as a BUILD target** (F124): a deeper $0 archive read (217
    API runs, $313.48) found harness overhead small (draft 1.9%, scout 8.8% of plan-flow
    spend) and money dying at step execution and in halted runs instead. Ranked levers going
    forward, in order: (1) repeat reads (56% of read-class calls, the largest measured waste)
    — lever already built and flipped (read shim A1 default); only measurement remains, no
    further build; (2) dying runs (plan-flow step-red at median 43% of budget; halts 22.8% of
    all spend) — routed to item 23's G4 (halt→replan→green), not a streamline build; (3) scout
    ON/OFF cost contrast — small paid test, ~11% ceiling, parked until after G3; (4) plan
    drafting cost and money-Parkinson — no action; round-allocation Parkinson is a mild signal
    only, arbiter-adjacent. Priority order (item 25) is unchanged: G3 → export → reuse-lift
    proof. Full numbers: `docs/logs/FINDINGS.md` F124.

    **2026-09-01** — hamr's "why does it read that much, is there a saving" answered from
    F124's own numbers (56% exact-repeat reads, shim A1 already the fix, measured ceiling
    ~10% of spend); tokens-tail and G3-plant orders recorded. Full text:
    `docs/logs/FINDINGS.md` F124 addendum.

25. **Priority order** (hamr, 2026-08-31): (1) harness streamline (item 24) → (2) export (the
    product: spec+bridge+close+runner, relocatable — export is never eject, the arbiter
    relocates, never disappears) → (3) reuse lift proof. G3/G4 (item 23) slot alongside as bench
    work; the ceiling question stays parked.

26. **Doc-genre roadmap tracking ends** — hamr's ruling 2026-08-31: doc-genre jobs rode the
    hitl/soft-judged ladder (`docs/product/2026-08-17-softgreen-review-door-design.md`;
    `docs/logs/FINDINGS.md`), and hitl is retired (v1.71; item 21 above). Dropped from tracking,
    not scheduled, as of today — not a deletion of any closed prose, an appended closure only.
    Softgreen (the judged floor) itself remains shipped and unaffected; only the doc-genre
    roadmap item ends.

Parked pending measurement: read compaction; stale-slice usage; context-headroom meter.
Dead, never re-raise: rates passthrough (F113 ruling), W4 stale-index build (F112, retired on
the build list), refuse-to-price preflight, memory/recall harness.

## History — how the doctrine above was earned

The sections above state current doctrine; the addenda below are the paper trail. Later addenda
supersede earlier ones on overlap — presented here as history, not as standing instruction where
superseded.

### The Boolean floor (v1.10, v1.11 — 2026-07-13)

Five gate-level borrows from digital logic (reliable systems from unreliable components) were
nominated as architectural disciplines, never boolean-composing LLM calls: instrument BIST (V9),
forbidden-zone audit (V10), transparent-path lint (V11), restoration boundary (V12), toggle
coverage (V13) (PRD.md:451-532). All resolved and consumed into doctrine (PRD.md:533-626):

- **The forbidden zone (V10) generalizes law #8**: a close that rendered no judgment produced no
  verdict, in either direction. Named, never pooled: `broken-close`, `close-timeout`,
  `close-killed`, `close-crashed`. A close may declare a `close.judged: {pattern, min}` floor —
  checked on the green band too (it caught a live fake-green on a tree with no test suite), but it
  is arbiter territory and optional; its absence is stamped `unaudited`, never assumed away.
- **Instrument BIST (V9)** read out GREEN (control 7/7, faults detected 7/7, falsifier 8/8) and
  lands as a pre-flight before any instrument is trusted, rewritten against real components, never
  copied.
- **Toggle coverage (V13)**: the metric validated, but adaptlearn's archived ledgers could not
  support clean attribution — the one-knob sibling tier was barren everywhere, and a re-authored
  pair was caught attributing the WRONG SIGN. This binds N3/N4: cohorts must deliberately emit
  one-knob sibling cells, and a toggle never counts across a re-authoring boundary.

### External field evidence (v1.15 — 2026-07-15)

Folded from the RSI-LEARNINGS corpus: **verifier hardening never ends** — every battery pass
carries a "did the worker exploit the close?" audit line, and a pass that never finds anything
should be re-read, not trusted. And the field's largest result (LIFE-HARNESS, 88.5% avg relative
gain with weights frozen) confirms this PRD's premise at scale: scaffolding, not weights, plus a
failure taxonomy under audit is the correct spend shape (PRD.md:973-1016).

### F40 latents named (v1.18 — 2026-07-19)

Two parked text-mode defects got named destinations: per-step deliverable targets became a Layer 2
step-schema requirement after the proposed validator tripwire was checked against real passing
rows and REFUTED (it would have inverted tested, designed behavior); genre-aware extraction — keyed
on the job's close class — became a non-code-rung requirement (PRD.md:1073-1101).

### External PRD review (v1.21 — 2026-07-21)

Four adoptions placed at their rungs, six rejections recorded with reasons so they aren't
re-litigated: adopted were a drift detector (`drift-red`, N3), bound-pressure reporting on the
trust surface (never an agent-facing budget proposal), lineage-read as a pre-registered third arm
of the N3 control (default prediction: no lift, per F39), and two HITL protocol pins (confirm
timeout = no-mint; an edited plan is a re-authoring boundary). Rejected: a scalar value function
(forbidden by law #4), agent-driven reflection (the N3 control already measures this claim), an
MCP bridge (an untyped verb the gate can't judge), plan mutation/crossover search (no readable base
rate to score against), `closeProposer` (an agent proposing its own judge), and cross-job pattern
transfer (already structurally prevented; the real bridge is the N3 memorization audit)
(PRD.md:1169-1277).

### T·A·P·U closes (v1.35 — 2026-07-30)

Closed the v1.27 programme: **T** (time/wall discipline) shipped and live; **A** (the variance
replan trigger) was built but stays unset — it would have fired zero times in the archive, while
attempt-exhaustion replan is what actually converts cap-halts to green; **U** (user-mode e2e) is
routine; **P** (the widened primitive palette) was read at n=3+2 and found genre-bound and
untouched at the palette level — zero new-verb selections across six drafted plans, while the
step vocabulary (model tier/attempts/scope) was adopted immediately. The load-bearing find was
plan SHAPE, not palette: a read-only "verify" step holding every check is a mailbox with no
hands — fixed by the shipped mailbox rule (`validatePlan` reds `check-passes` on any step without
a write-class tool) (PRD.md:2134-2185).

### Four open items ruled (v1.63 — 2026-08-13)

DOCS ONLY: (1) a draft-time wrong-format-parser validator is a **WON'T-BUILD** — it cannot know
which tool a declared command will actually run, and the working defense already exists at the
signing gate ($0, before any signature); (2) D4a's read-side wall-halt derivation is a **permanent
safety net**, never expiring, because it fires only on the spine's own un-forgeable evidence and
is inert on healthy spines; (3) `MAX_EXITS_PER_STEP` **stays 2** — one check per write step is the
design, not an interim value, raised only on a demonstrated starvation case; (4) a resume
**never refills** the replan ceiling — it inherits the spent ledger entire, because a refill would
make every kill buy an allowance (PRD.md:4456-4595).

### Watchdog calendar-time limit (v1.67 — 2026-08-15)

A KNOWN LIMITATION, left as-is on hamr's ruling: the outside watchdog (`scripts/u-watchdog.mjs`)
measures silence in calendar time via `Date.now()`, so a machine suspend can read as spine
silence and kill a healthy run on the first post-wake poll (F72: a run killed 6ms before its
awaited response completed). Left alone because `systemd-inhibit` at launch is the real
mitigation, the runner's own money clock already uses suspend-immune `performance.now()`, the
fail-safe direction (kill on ambiguity) is correct, and a killed run resumes at step granularity
rather than being lost (PRD.md:4799-4873).

### Model-bump dead-weight replay adopted (v1.69 — 2026-08-15)

DOCS ONLY, from an external Anthropic talk. Adopted: on every **worker-model tier change**, a $0
archive replay runs before the first paid row, naming every guard/rule/prompt register that might
have been built for a failure mode the new model no longer produces, PARKED for hamr's word —
nothing deleted on assertion. Converges with this repo's own F41 (Layer R's fixation detector found
extinct on every current job before it ever shipped). Two industry convergences were recorded with
no doctrine moved: "dreaming" (offline distillation into memory) cross-validates Layer 3's ambition
without changing the kill-switch bar; "outcomes" (rubric + parallel grader + retry-until-pass)
cross-validates the close/gap/retry spine without changing the judged-floor requirement
(PRD.md:4949-5017).

### Bench questions answered; green rows, door re-proof, hitl deferral (v1.81 — 2026-08-30)

hamr's answers to the bench (`docs/product/2026-08-23-agreed-build-list.md` Q1, Q3–Q6), as
said: **Q1** reuse the existing patient COPIES under `../bareloop-patients/` (each carries its
own git history and is reset to its frozen seed before every run; originals never touched).
**Q3** n=1 per job per release; a row whose colour flips against the previous release re-runs
twice more (n=3) before it is read. **Q4** money ceiling **$16 per bench pass**, hamr's number,
adjustable at any point by his word only (tighten-only for the agent, as every cap). Measured
against the archive's median green-run cost (aurora-u $2.00, litectx-u-types $4.29,
bareagent-u-types $5.34, aurora-testgen-l2accept $6.46), $16 funds TWO real rows plus one flip
re-run; the other two rows join when the ceiling is raised. The session's earlier "$1–3 a run"
was a guess and is withdrawn — the table above is the measurement. **Q5** the bench is a frozen,
pre-greened set under ONE signature; any spec edit re-freezes and re-signs. **Q6** results live
in `docs/logs/BENCH.md`, one row per (job, release); a colour flip ALSO mints a FINDINGS entry.

Same day, from the open-items list: green-class runs mint a registry row born released (#16);
the door-accept re-proof stays unclocked on the condition it is mechanical only (#15); hitl
cleanup deferred, finish-or-keep is hamr's call (#21); LIBRARY_CONVENTIONS gap closed with
`src/types.js` parked (#22).

### Close-stage direction is a signed field, never inferred (v1.82 — 2026-08-31)

F120 (`docs/logs/FINDINGS.md`): the close-fix governor (`src/trend.js`) assumed lower-is-better
universally — `countImproved = v < priorBest`, `best` tracked the minimum, `verdict()`'s
convergence test was `values[last] < values[0]`. Correct for every close ever built before
today (all count-shaped: typecheck errors, suppressions — down is better), wrong for a
rate-shaped close where up is better. Live consequence on the G2 re-establish run
`u-mtgr1qnu`: a fault-detection rate rising `15% → 37.5% → 42.5%` against a 45% bar read as "no
stage improved", minted 2/2 strikes and cap-halted a run that was converging and 2.5 points
from passing (the `flat` lever in code, "more money is unlikely to help", is backwards for it
too — code-read, not printed live). A mirror defect, equally real: a COLLAPSING rate series satisfies the old
`v < priorBest` test and resets the strike count, funding a regression. Missed because the $0
replay that retired `CAP_RUNS` as the close-fix governor ran over all 8 archived fix loops,
every one count-shaped — a corpus in which lower-is-better is always true cannot falsify a
lower-is-better assumption (the repo's own standing hazard: a clean result across many
experiments can be an artifact of testing one genre — check the population before minting a
general claim). Unreachable until today's other fix (the G2 cold-variant close repoint) let a
fix loop actually iterate and produce the repo's first higher-is-better series; the latent
defect fired on first exposure.

**Ruling (hamr, his option A):** close stages declare their comparison direction as a signed
per-stage field, `direction: 'up'|'down'`; absent means `'down'`. Never inferred from goal
prose and never LLM-judged — the reason nothing LLM-judges the close is that prose the agent
writes must never influence its own halt rule. `isBetter(stage,a,b)` in `src/trend.js` is the
one place direction is consulted, used by `countImproved` and both `best`-tracking sites;
`createTrend` takes a `directions` option; `STAGE_FIELDS` (`src/job.js`) gains `direction` with
an allow-list validator (only `'up'`/`'down'`; anything else is `invalid-value`); wired at both
`runTrend` and `fixTrend` call sites in `src/planrun.js` off one map built from `stagedClose`.
`scripts/run-u.mjs` prints each stage's direction at the close-stage banner — a deliberate
visibility guard, since a silent default is the same shape as the bug just fixed. Verified: 7
new tests (each confirmed failing against the old code, for the right reason, before the fix),
full suite 2176/2176, both production job hashes (`aurora-u-spawner-types.json`,
`litectx-u-types.json`) independently re-computed and unchanged — the default is behaviour- and
hash-identical for every close that predates this field. Commit `5b43d68`.

