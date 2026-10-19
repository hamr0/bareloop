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
  and a ledger with per-run rows. The panel is a pure observer of the spine — superseded, see
  Addendum v1.84. Secrets load from the
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

### §8a Deferred — unproven need

Work gets built when the PRD calls for it or a LIVE failure produced it. A defect found by
reading source, with no run ever hitting it, gets logged and parked — never built on the
strength of the reading alone.

- **F184** — a spine record for a malformed worker-path tool call. Found by reading
  `src/planrun.js` while closing out F179/F180, no run has ever produced it. Shipped before this
  rule existed; left in place as inert, visibility-only (`docs/logs/FINDINGS.md` F184).
- **F188** — the no-suppressions cast guard misses an unchecked cast written as a typed callback
  parameter rather than a value cast. Widening the detector is arbiter-adjacent (it changes what
  a signed spec can admit) — parked to the close-authoring rung (`docs/logs/FINDINGS.md` F188).
- **F189** — a URL-userinfo secret-redaction pattern. Invented work: no live failure ever hit the
  gap it closed, and its own follow-on fix existed only to patch a side effect (refusing 5 of 44
  local repos) that a live run never caught either. Both commits reverted 2026-09-16
  (`docs/logs/FINDINGS.md` F189).
- **F183's guard-description wording** — the confirm turn's "ALREADY COVERED" block undersells
  `no-suppressions` (3 items shown, 7 for `js`/5 for `python` actually enforced) and is
  language-blind. Measured live and by a paid ON/OFF probe to be the root cause of one surviving
  false `notChecked` claim. Not built pending hamr's word (`docs/logs/FINDINGS.md` F183).
- **F183's write-fence wording** — same shape of problem, not safely fixable by wording alone:
  whether tests are covered by the fence depends on where they live relative to it, so a generic
  wording claim would overclaim for some repo shapes (`docs/logs/FINDINGS.md` F183).
- **Jev (bare-agent's `JevProvider`)** — PARKED candidate for the soft-green judge's DECIDE half
  only (locate stays an LLM); typed output + a measurable confidence, not money. Blocked by F192,
  arbiter-signed threshold, same 10/10 calibration floor, new-vendor probe rule; deterministic
  closes excluded. Build trigger: a live rubric-job failure it would fix (hamr, ruling A,
  2026-09-28; also relayed to fwdloop as a HITL-triage idea, not bareloop's lane).
- **Skill injection** (TDD/QA/debrief/branch-review text given to the agent) — PARKED; test after
  P3 ships with a cheap planner-only ON/OFF probe (drafter drafts the same job with/without the
  skill text, ~$0.10–0.30): identical plan shapes closes "no", different triggers a pre-registered
  full-loop contrast. Targets the planner, not the worker — a worker self-review is never a
  verdict (hamr, ruling A, 2026-09-28).
- **Read/write fence re-check with the first rubric plain-folder live run** — bareloop already
  fences the worker with bareguard's own `fs.readScope`/`fs.writeScope`/`fs.deny` (worker on a
  hidden-git copy, arbiter books denied, destination copied out only on a minted green, never
  overwritten). Not a sandbox (local-trust ruling stands). The plain-folder rubric path has never
  had a full live run, so its fence is test-proven only. Trigger: that first live run — verify the
  fence end-to-end then, and review bareguard 0.13.0 → 0.19.0 (6 minors behind) for newer path
  primitives before building anything (hamr, 2026-09-28).

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
   **2026-09-05 — CLOSED, not pursued** (hamr): the retry (F119) and provider-red resume are
   the product's answer; a run that hits the condition more than twice stops and returns to
   hamr rather than chasing it. The cause stays unproven and unchased.
6. ~~Generic run replay~~ — **BUILT 2026-08-25** (F117): `replayRun`/`formatReplay`
   (`src/replay.js`) + `scripts/run-replay.mjs`, report-only, reuses `runBehaviour`/
   MEMORY-CACHE; the pre-declared 5-minute test passed on 3 unseen failed runs and found 3
   defects (escalation detail hidden, `--all` name-matched only, a replanned step merged by
   id), all fixed.
7. **The bench** — Q1, Q3–Q6 **ANSWERED 2026-08-30** (v1.81 below; Q10 answered v1.78);
   Prereg **FROZEN 2026-08-30** (`docs/logs/BENCH-PREREG.md`; litectx row re-baselined
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
    `null` today (F110). **2026-09-05 (hamr: agreed):** not a build — the signature is minted at
    run time by `scripts/run-u.mjs`, so it clears itself the next time aurora fires under
    hamr's in-turn sign. Nothing to schedule.

    > **2026-09-13 — pointer:** see item 34's L13 — REMOVED, not a task.
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
18. ~~**Flake-name capture**~~ — held until the peer says "load window open" verbatim.

    > **2026-09-13 — pointer:** see item 34's L14 — the peer hold is void, run once at $0.

    > **2026-09-13 — CLOSED:** run once under ~4x CPU load on `tests/watchdog.test.js`,
    > `tests/ralph.test.js`, `tests/stall.test.js` — flake not reproduced (13/13 runs clean,
    > 95 pass / 0 fail each). `docs/logs/FINDINGS.md` F172.
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
    **CLOSED by ruling 2026-09-08** (hamr, fwdloop interview): (b) — keep it admitted. The
    human stage is not deleted; it is COPIED (never imported) into the sibling product
    `fwdloop` as its mid-flow `ask` step. bareloop keeps `human-confirms` as the end-of-close
    pause it already is. No code change here.

    > **2026-09-13 — pointer, supersedes the "so the class can be reopened later" wording
    > above:** hamr — `hitl` is removed from the gate, no revival plans, code kept for reuse
    > only, never shown anywhere customer-facing (item 34's L19).
22. **LIBRARY_CONVENTIONS gap — DONE 2026-08-30**: 26/36 rules already met, 8 N/A; this
    branch adds context.md §Which-mode/§Extension-contract/§Threat-model, per-dependency
    justification in CLAUDE.md, `.env.example`. PARKED with reason: `src/types.js` central
    typedefs (doc says preferred; per-file `@typedef` already generates 1:1 `.d.ts` and
    typechecks clean — moving 23 files' typedefs is churn with no adopter benefit).

23. **G3/G4 scoping** — unscoped, hamr's answers recorded 2026-08-31: G3 = a real planted-cheat
    bench row the close must catch; G4 = any halt→replan→green (not narrowly a money cap-halt).
    Neither built or scheduled. Detail: `docs/logs/G2-SCOPING.md` §"G3/G4 scoping". G3 swap
    plan (hamr's "agreed, lower cap, plan a swap"): once G3 establishes, G2 leaves the bench,
    $24 ceiling untouched — `docs/logs/BENCH-PREREG.md` amendment, `docs/logs/G2-SCOPING.md`
    §"G3 swap plan". G3 itself scoped 2026-09-01, not frozen, no hash, no run:
    `docs/logs/G3-SCOPING.md`. G3 frozen 2026-09-01 (hash 64d56137…), established
    2026-09-01 — establish run `u-mties136` read non-green as pre-registered
    (step-red, $2.98/$4), F125.
    **G4 SCOPED 2026-09-05 ($0, F127):** `docs/logs/G4-SCOPING.md`. Proposed as a READING
    of the litectx bench row (replans 6/14 on its own; `u-mtfywb55` is a halt → replan →
    green instance at the row's PREVIOUS hash — corrected same day), $0 marginal, no fifth
    row, no hash change; a planted-fixable-dead-end row kept as the second act. **hamr: "A"
    (2026-09-05)** — BENCH-PREREG amendment signed. First deliberate test pass `u-mtotxw1z`:
    cold green $6.18, G4 DID NOT FIRE (0 of 2 at the frozen hash). **Counting rule (hamr):
    ride the bench's own litectx passes, count replanned/runs, tripwire at 0 / 4 → scope
    the planted row.** Candidate rail stays named, not built (v1.83). Next: export (item 25
    priority 2).

24. ~~**Harness streamline (convergence-per-dollar levers)**~~ — **CLOSED 2026-09-05** (lever (a) dropped F123, build line closed F124, lever (3) scout contrast measured F126; lever (b) reuse-lift lives on under item 25 priority 3). Original text follows. hamr's ruling 2026-08-31: next
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

    **2026-09-05 — lever (3) scout ON/OFF UNPARKED and SCOPED** (hamr: "let's measure
    scout"): G3 is established, so the park lifts. Scoping, pre-registered frozen rules, the
    small switch build (`--scout on|off`, runner territory, hash-unaffected) and the two-arm
    design on `aurora-u-spawner-types` ($10 ceiling): `docs/logs/SCOUT-CONTRAST.md`.
    **Same day — MEASURED, lever (3) CLOSED** (F126): both arms green, OFF cost $0.37 MORE
    (inside the $0.40 noise band, wrong direction for a saving); the scout is not dead
    weight; nothing to build, no default flip. Switch shipped in v0.20.0.
    Spend $6.72. Item 24 now has no open lever; next per item 25's amended order: G4.

25. **Priority order** (hamr, 2026-08-31): (1) harness streamline (item 24) → (2) export (the
    product: spec+bridge+close+runner, relocatable — export is never eject, the arbiter
    relocates, never disappears) → (3) reuse lift proof. G3/G4 (item 23) slot alongside as bench
    work; the ceiling question stays parked.

    **2026-09-05 — order amended** (hamr): item 24 lever (3) scout contrast
    (`docs/logs/SCOUT-CONTRAST.md`) → G4 (item 23) → the rest of this list in its own
    order. Export and the reuse-lift proof come after; item 5 closed and item 12 clarified
    today, above.
    **2026-09-05, later:** after export comes item 27 (close-bytes signature), then the
    reuse-lift proof.
    **2026-09-06 — order amended again** (hamr): item 28 (provider-agnostic runners) slots
    in after item 27 and before the reuse-lift proof — see item 28 below. Order now:
    harness streamline → export → item 27 → item 28 → reuse-lift proof.
    **2026-09-08 — order amended** (hamr: "openloop interview then item 28 + a quick start
    guide and ui will come after"): the fwdloop interview is DONE (item 29) → **item 28 +
    a cold-adopter quickstart** (one page a stranger can follow to job #1) → the panel (N6)
    after, arriving as fwdloop's inbox UI first. Reuse-lift proof stays after item 28.
    **2026-09-09 — order amended, SUPERSEDES the line above** (hamr): item 28's open half is
    carried as **item 31**; order is now item 31 (retire hitl, two shapes, full bare-agent adapter,
    judge-key, first-ever calibration fire)
    → **the panel (N6) — built HERE, shaped against fwdloop's UI PRD so one build fits both**
    → the reuse-lift proof LAST. See item 31.
    **2026-09-10 — order amended, SUPERSEDES the line above** (hamr: "all comes after the
    interview and non repo and it will determine the final shape of bareloop and fwdloop").
    Order now: (0) ship `feat/item-31` — items 31/32 code, with 31.4/31.5's proof fires carried
    → (1) the item 33 interview → (2) item 33 written and the bareloop/fwdloop split ruled →
    (3) item 33 built → (4) proof fires: 31.5 calibration on a real bar, 31.4 on gemini →
    (5) the panel (N6), shaped by 1–3 → (6) the reuse-lift proof LAST. See item 33.

    **2026-09-13 — (3) detailed:** item 33 build continues as: fix branch for item 34 → M3 →
    M3b → M4 → M5 → M6 → M7 proof fires → (5) the panel → (6) reuse-lift proof last.

    **2026-09-13 — (4) amended** (hamr): 31.4's proof runs on DeepSeek (`deepseek-flash`),
    not gemini.

    **2026-09-13 — M3 piece 4 (the confirm turn) open decisions ruled** (D5=A, D6=A, D1-D4/D7
    defaults taken) — see `docs/product/ITEM33-BUILD.md` M3 ruling 5's addendum for detail.

    **2026-09-14 — D6 = A, "replace it"**: `TYPES_GENRE_TEMPLATE` (`src/authoring.js`)
    rewritten so its WORK-stage skeleton and STRICT-checker mandate compose only for a
    confirmed check — see `docs/product/ITEM33-BUILD.md` M3's dated addendum for the new
    frozen block (supersedes the prereg's addendum 3 for the product; that closed record is
    never edited).

    **2026-09-14 — next round starts with the M3 close-out:** this branch
    (`fix/item34-loose-ends`) stops here and goes to `/branch-review` → `/release`; the fresh
    branch after it opens with the M3 close-out list below, before M3b. See
    `docs/product/ITEM33-BUILD.md` M3's dated pointer for detail on each row.
    - [x] Ruling 7 (a repo job works end to end) not yet met — the one live fire ended
      broken-close, blocked by L24/F176. — F176 fixed in code (commit 5a83507: the revise
      ladder falls back to the newest sound iteration), not yet proven live. **2026-09-15:**
      signed run `mu2p83go` went green end to end (F185–F188); needs a developer hand-step to
      run (F185, open) — still left UNTICKED, hamr decides. **2026-09-16 (hamr's word):** ticked
      — run `mu2p83go` went green end to end, and F185's developer hand-step is closed by
      `scripts/run-u.mjs --spec` (commit 110263a).
    - [ ] Ruling 5's round-2 open-question path — see item 34's L23/F175 (not duplicated here).
      — fixed in code (commit 245437c), not yet proven live.
    - [x] Release-order deviation: M3 pieces were built on the fix branch instead of after its
      release, per item 34's own line below. — settled: v0.26.0 shipped.
    - [x] L17 ("authoring provider selectable") is provider-selectable but not DeepSeek-reachable
      from the form — `scripts/run-interview.mjs` never asks for or writes `baseUrl`. — fixed:
      `--base-url` flag (commit e91e37f). **2026-09-15: proven live**, runs `mu2js0c0`,
      `mu2qmept` (FINDINGS).
    - [ ] `prepareSource` freezes tracked files only — a repo job's toolchain (e.g.
      `node_modules`) is absent from the prepared tree, undocumented in the interview/hand-off.
      — fixed: `$0` stop names the install command (commit 941cf7d), not yet proven live —
      plus F177 (commit 496bb54) and F178: a signed fence can no longer name `.git` or
      `node_modules`, and writes into a nested `node_modules` are denied (commits 0720a66,
      3fda3a0, b884c3e), not yet proven live. — live: the install command named at $0 (person
      runs 2026-09-15, both interviews ended "Not offered — the copy still has no installed
      packages" — stash `2026-09-15-live-person-run-ba27.md` item 3, run `mu2bjmed`'s out dir);
      the install-gap PAUSE itself (F182 fix), run `mu2qmept` (F182); F177 (installed packages
      not counted as worker writes) — `npm ci` in the copy left `git status` at 0 lines (stash
      item 3, tree `source-mu2bglzc`), and signed run `mu2p83go` then recorded only
      `src/checks.js` as changed (F185–F188). Still owed: F178 (`.git`/`node_modules`
      write-fence denial) never exercised live. **2026-09-16:** F178 CLOSED as unreachable-by-
      construction (docs/logs/FINDINGS.md F178) — never exercised live, and never will be.
    - [x] The real person path (`run-interview` → spawned `run-author` reading the keyboard) has
      never run live — ruling 9's proof is still owed. **2026-09-15: proven live**, run
      `mu2qmept` (F182).
    - [ ] The plain-folder confirm turn (D5) and soft-green jobs through the confirm turn are
      stub-tested only, never run live. **2026-09-16:** both the plain-folder run and the
      soft-green run fired live; both produced defects rather than a pass, so this row stays
      UNTICKED. The soft-green run (`mu4hec9u`, `deepseek-flash`) is F190
      (`docs/logs/FINDINGS.md`): the calibration gate's judge provider was built without the
      job's `baseUrl`, sending a DeepSeek key to `openai-api`'s default host — fixed in code
      (tests only, not yet re-proven live), plus a second, separate, unfixed defect logged in
      the same entry (a failed judge `locate` call leaves no cause on the spine). The
      plain-folder run's defect is not detailed here — see its own record for that.
      **2026-09-21:** the plain-folder run's defect is F191 (`docs/logs/FINDINGS.md`) — the
      confirm turn crashed on a plain folder's `lang: 'none-detected'` (`classGuards` has no
      language to key off). Fixed in code: the confirm turn over a plain folder is now gone
      entirely (D5 amended, see `docs/product/ITEM33-BUILD.md`) — the stop fires immediately at
      $0. F190 also fixed properly this pass, routed through `buildRunnerProviders` rather than
      the hand-copied conditional. Both fail-first proven in tests, neither re-proven live.
    - [ ] Soft-green calibration: refused on every live run so far — OPEN, has-doc fix built but not
      re-proven live, see FINDINGS F192 (hamr rulings B 2026-09-21, A 2026-10-08).
    - [x] `bareloop.context.md` does not describe commit 2b45f09's change (`classGuards` +
      write-fence protections, the model's `notChecked` list). — fixed in the v0.26.0 docs follow-up
    - [x] `src/authoring.js` (`TYPES_GENRE_TEMPLATE`) is model-facing prompt text not yet listed
      in `src/promptregisters.js`'s `PROMPT_REGISTERS` — decide whether to add it. — added,
      commit 3761644.

    **2026-09-21 — order amended, SUPERSEDES both lines above** (hamr: "we need to finish what
    we have at hand, close the branch and start immediately on ui, and everything else that was
    previously planned should come after ui and most likely will be solved while we are doing
    ui, i expect a lot would surface with ui" — reason: "i can't see and i can't feel what you
    are saying and it takes a mental effort to imagine"). This supersedes the **2026-09-10**
    order above ("(5) the panel (N6), shaped by 1–3 → (6) the reuse-lift proof LAST") and the
    **2026-09-13** detailing of it ("fix branch for item 34 → M3 → M3b → M4 → M5 → M6 → M7 proof
    fires → (5) the panel → (6) reuse-lift proof last"). New order: close `fix/m3-closeout` →
    the panel (N6) → M3b–M7 (and the reuse-lift proof) after, most of which is expected to
    surface WHILE building the panel rather than needing to be planned first. Item 33's
    interview and non-repo split are already done and signed, which is what the 2026-09-10
    order's own reason for putting the panel last was conditioned on.

27. **Close-bytes signature — the job signature must cover the close scripts' CONTENT, not
    only their path** (hamr, 2026-09-05: "next in line after export"). Found by the export
    POC's negative scenario N4 (`docs/product/EXPORT-BUILD.md`): `jobSpecHash` covers
    `close[].cmd` (the path), so a swapped close script keeps the signature valid and the
    close-first precheck (F17) reads a fake "already-green" at $0 — no model called, no work
    done, reported green. Export v1 closes it for BUNDLES with a manifest hash over the
    script bytes, verified before the precheck. This rung closes it for bareloop itself: a
    per-stage content fingerprint inside the spec (signed with the job), verified by the
    close runner on EVERY close run, precheck included; mismatch = refuse at $0. Re-hashes
    every job → bench rows re-sign and re-baseline (hamr's call which way). Arbiter
    territory; scoped after export v1 ships. Order (item 25 amended): export → this →
    reuse-lift proof.
    **2026-09-06 (hamr: "that should come with next in prd … both are related"):** the rung
    widens to CLOSE INTEGRITY — the close must be exactly what was signed (bytes, above) AND
    must judge exactly the tree it was given (cwd). F129 (`docs/logs/FINDINGS.md`): 9 of 10
    hand-authored close scripts bake in an absolute patient path and ignore the cwd the
    runner passes (F8's return one layer up); the exported aurora close judged the ORIGINAL
    patient and read `already-green` at $0 on a fresh worktree. Item 27 would have signed
    that bug in happily — different hole, same instrument. Export v1 ships the wall for
    bundles (`close-absolute-path` refuses at export) and the aurora close now reads
    `process.cwd()` (hamr: "change it"). This rung finishes it: (a) the remaining 8
    `scripts/*-close.mjs` read `process.cwd()` (behaviour-preserving for run-u, whose cwd
    IS the patient); (b) the pinned `../bareloop-close` worktree re-pins to a main that
    carries the fix; (c) when close authoring becomes a rung, its template starts from
    `process.cwd()` and the `close-absolute-path` rule moves from export-time to the
    validation gate so a baked-in path is inexpressible for every job, not only bundles.

    **export v1 validated 2026-09-06, see EXPORT-BUILD.md.**

    **shipped in v0.22.0, 2026-09-07 — see CLOSE-INTEGRITY-BUILD.md.**
    **2026-09-07 (hamr: "do all the above"):** bench rows re-signed at v0.22.0; two M3
    rulings landed (`'explicit'` tier stays test-only; review-door timing timeout must
    refuse as `close-timing-red`, door-refuse fix queued) — see CLOSE-INTEGRITY-BUILD.md.
    **2026-09-06, later (hamr: "both, ui is coming. it's autoset and can be override, same
    like api pricing"):** the close timeout joins this rung. Today `closeTimeoutMs` is a
    caller-passed library parameter defaulting to 120s (`src/ralph.js`), which run-u
    overrides at 900s and the bundle CLI does not pass at all — a defaulted cap is a silent
    second ceiling (the same defect the wall's no-default rule already forbids), and a suite
    slower than the ceiling can never be judged, only close-red. Ruling: AUTOSET from the
    measured $0 seed close (the precheck already times every stage) under a rule hamr signs
    once, printed on every run as `estimated`, with an explicit signed OVERRIDE in the spec —
    the pricing shape (guesstimate + loud sign + customer override), never a hidden knob.
    "Mirror run-u's 900s" is moot under this ruling. Rule constants (multiplier, floor) are
    arbiter territory: hamr sets them at build, never the agent. Also folded: the bundle CLI's
    escalation tail must stop naming `--resume` (v1 has none; F130).
    **2026-09-06, later: (b) re-pin to branch tip done (`8b209a9`); main re-pin after merge.
    Post-bless no-approve run live-proven (`mtpo9rxy`, green).**
    **2026-09-06, later still:** build spec frozen at `docs/product/CLOSE-INTEGRITY-BUILD.md`
    (facts, three milestones cwd/gate-rule/timeout, POC result, pre-registered validation).
    Not started; `K`/`FLOOR_MS` remain `TBD (hamr)`. Also carries F131 (the archive/direct
    timing measurement behind the M3 autoset design) — see `docs/logs/FINDINGS.md`.
    **2026-09-07 — M3 shipped** (hamr's arbiter constants: floor 120,000ms, K = 5):
    close timeout autoset ($0 seed timing pass, `max(FLOOR, K × slowest)`) + signed
    `closeTimeoutMs` override, and `BARELOOP_CLOSE_DIR` (the close's own books directory,
    threaded by both runners, refusing `close-dir-required` at $0 for a script that needs
    one and gets none). Item 27 (close integrity) is now fully shipped across all three
    milestones — see `CLOSE-INTEGRITY-BUILD.md`'s status line for detail and named
    divergences.

28. **Provider-agnostic runners** (hamr, 2026-09-06: "the whole point of bareloop is to be
    LLM agnostic … Anthropic and OpenAI shaped, this could come next … shouldn't come as a
    surprise"). Continue on Anthropic until item 27 is done; scoped now so the shape isn't a
    surprise later. Facts: `src/job.js`'s `PROVIDERS` menu (`Object.freeze(['anthropic-api',
    'clipipe-subscription'])`, line 135) has no OpenAI-shaped member; `clipipe-subscription`
    stays OUT as a peer (F48) — this item does not touch it. Both runners construct
    `AnthropicProvider` BY NAME (`src/cli.js:61-73`'s `buildProviders`; `scripts/run-u.mjs:41`)
    rather than through a factory. `bare-agent` already ships `src/provider-openai.js` with a
    constructor `baseUrl` option (default `https://api.openai.com/v1`), so an OpenAI-compatible
    endpoint (including a local one) is reachable without a new production dependency. The judge
    is pinned today (`src/judged.js`'s `JUDGE_MODEL = 'claude-haiku-4-5'`), calibrated 10-of-10
    (softgreen doctrine: a judge-model bump requires recalibration). Pricing for an unrecognized
    model already falls to guesstimate + a loud `estimated` state (rates passthrough is dead,
    F113 — the customer's responsibility, never a bareloop rate table).

    Shape: (1) the `provider` menu gains `openai-api` (+ optional `baseUrl`); a new provider
    FACTORY (`src/providers.js`) maps provider name → constructor + the env-key name it reads
    (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`), holding per-provider tier tables and
    provider-specific param gating behind one seam (e.g. sonnet-5's `output_config.effort`
    guard, currently ungated per-provider) rather than scattering `if (provider === …)` across
    both runners; (2) the judge becomes a signed `judge: { provider, model }` field with a
    calibration record keyed by `(provider, model)` — a judge with no recorded 10-of-10 run
    refuses judged closes at $0, never silently substitutes an uncalibrated model; (3) one paid
    PROBE per newly admitted provider proves it end-to-end — no battery, no bench row, until a
    provider earns one the way Anthropic did.

    Order (item 25 amended, 2026-09-06): harness streamline → export → item 27 (close
    integrity) → **item 28 (provider-agnostic runners)** → the reuse-lift proof. Continue on
    Anthropic-only work until item 27 ships.
    **2026-09-08 — POC done (F139), $0.24, hamr's OpenAI key.** The loop holds on the OpenAI
    shape end to end with no code change (scout → draft → validator → steps → gate-audited
    edits → honest halt). Facts that shape the build: `gpt-4.1-mini` fails the plan validator
    at draft (ignores the stated 2-exit cap twice → `plan-red`, $0.07); `gpt-4.1` drafts
    legally on the redraft, greens five analyze steps, edits two files (strict errors 21 → 5),
    then dies to an OpenAI **429 TPM limit** the runner has no policy for (`provider-red`,
    resumable, $0.17 floor); the GPT-5 family is closed until BA-24 (upstream `max_tokens` →
    `max_completion_tokens`) lands. **Parked for hamr (arbiter, a retry rule):** on an HTTP 429
    carrying a retry-after ≤ 60 s, (a) keep today's contract — `provider-red` + human resume —
    or (b) one bounded wait-and-retry honouring the vendor's own delay, tighten-only, spend
    floored like F115's retry. Build plan unchanged: `src/providers.js` factory (name → ctor +
    env-key + tier table), `openai-api` (+`baseUrl`) on the `provider` menu, signed
    `judge:{provider,model}` with a per-pair calibration record, one paid probe per admitted
    provider at `gpt-4.1` or better. Evidence: `../bareloop-patients/spines-poc-openai/`.
    **2026-09-08, later — synthetic.new (F140, BA-25), $0.44.** All five open models answer
    tool calls correctly on BOTH API shapes through bare-agent's `baseUrl`. GLM-5.2 gave one
    honest `provider-red` (gateway 524) and one SILENT DEATH (spine stops at the draft phase,
    no `job-end`). A $0 harness proved the class in bare-agent's request code, both providers:
    a body cut short after headers never settles `generate()`; the process drains. Filed
    upstream as BA-25. **Two more parked rulings for hamr:** (c) a runner `beforeExit` backstop
    minting `runner-drained` + non-zero exit when no `job-end` exists (a new terminal word —
    arbiter territory); (d) whether gateway-fronted endpoints (`baseUrl`) are admitted in v1 of
    `openai-api` at all, or only the vendor's own host until BA-25 lands. Recommendation: (c)
    yes, small and honest; (d) admit `baseUrl` but the probe rule stands — no endpoint is in the
    menu without its own paid probe, and today none of them has a clean one.
    **2026-09-09 — hamr's rulings (c) and (d), both GO.** (c) built on `chore/bare-agent-0.42`: a
    `beforeExit` backstop in `runJob` mints `job-end {outcome:'runner-drained', spendComplete:false}`
    + non-zero exit when the process drains with no `job-end`; not in the resumable set. (d) DECIDED:
    `baseUrl` IS admitted in v1 of `openai-api`; the probe rule stands — no endpoint enters the
    `provider` menu without its own clean paid probe, and the code lands with the provider factory
    (the item 28 build), not before. Also on the branch: **F147** — the Qwen `HTTP 400` F146 left
    unexplained was OURS: the F59 summary round sent the persona twice (bareloop re-fed a transcript
    bare-agent had already system-prepended); real OpenAI tolerates it, vLLM-class backends reject it.
    Fixed at `askFrom`; an item-28 blocker for ANY strict OpenAI-compatible backend, cleared.
    **2026-09-09, later — F149/F150, $3.91 across the three runs plus ~$0.05 of probes.** F147 holds live (Qwen 400→200 A/B on the captured
    request; full Qwen run drafts a legal plan, cap-halts at $1). **`deepseek-chat` GREENS the job**
    ($1.89 floor / 11.2 min, six stages satisfied, one caught suppression) — the first non-Anthropic
    green and the item 28 probe for its first admitted provider. Hazard: DeepSeek silently ignores
    `max_completion_tokens` (F149) — the tier table carries the request-key choice per model.

29. **fwdloop — the sibling product** (hamr, 2026-09-08). Human-in-the-loop flows (trigger →
    gather → derive → ask → send), non-repo, accepted once then rerun daily, are NOT a bareloop
    rung: they are a separate repo, `../fwdloop` (github.com/hamr0/fwdloop), which borrows
    bareloop's solved problems by COPY, never import. The interview and the preliminary PRD
    (v0.3, unsigned) live at `../fwdloop/docs/product/PRD.md`; the bareloop-side record is
    `docs/product/FWDLOOP-PRD-DRAFT.md`. Consequences here: item 21 closed by ruling (above);
    item 26 unchanged (doc-genre stays dropped in bareloop — it lives in fwdloop instead);
    the panel (N6) arrives as fwdloop's inbox UI before any bareloop-only panel.

30. **Item 28 close-out ledger** (hamr, 2026-09-09: "make a list in prd for outstanding things
    … and close them out properly, no review before you close all above and validate it"). Every
    row below is closed with its own validation before `chore/bare-agent-0.42` goes to review.
    Tick = closed, with the instrument that closed it. **All ten rows closed 2026-09-09** — what
    remains is named in 30.9's status line (item 28 part (2)) and carried as its own work, not as
    an unclosed row here.

    | # | Outstanding | Close criterion | Status |
    |---|---|---|---|
    | 30.1 | Second double-system site: `src/authorscout.js` recovery round re-feeds a system-prepended transcript (F147's twin) | strip + red/green test | CLOSED 79f3478 — two sites (recovery, re-ask) stripped; real-Loop test red 2≠1 → green |
    | 30.2 | 429 retry (F143) never fired live | a real vendor 429 absorbed by `rate-limit-retry` on a paid run (gpt-4.1 429s deterministically, F139) | CLOSED F151 — live 429 on gpt-4.1: parsed 9.47 s, waited 9.72 s, one retry, refused again, honest provider-red $0.12 |
    | 30.3 | `runner-drained` (c) proven only in-process | a real child process through `bin/`/runner against a real HTTP endpoint that goes silent drains and mints the record + non-zero exit | CLOSED F152 — impossible live by construction (open socket never drains; settled-socket drops now reject, F141); backstop stays child-process-proven; the live hazard is a HANG → 30.4 widened to every unbounded provider call |
    | 30.4 | Judge AND authoring-scout provider calls carry no deadline (F148, F152) | every `Loop.run` bareloop makes carries the worker's `callBounds()` deadline; a silent endpoint rejects into an honest terminal; test | CLOSED F154 — seven sites bounded (judge, calibration, scout ×3, declaration boundary, bridge picker); real silent-server tests; a swallow-everything first pass caught by the existing relay test |
    | 30.5 | `exposeErrorBody` parked (F146): provider error sentence discarded | body passes through the ONE secret scrub before any record; test proves a key in the body is redacted | CLOSED F153 — exposeErrorBody on all 24 sites, body redacted via validate.js and capped at 600 chars in categorize(); tests prove the key is found raw then absent from the spine |
    | 30.6 | fwd not told the Qwen cause | message sent | CLOSED — sent 2026-09-09 (cause + DeepSeek max_tokens note) |
    | 30.7 | Kimi drafter-prompt test (worked example + up-front relative-path rule) never run | ~$0.10 Kimi draft with the candidate prompt; ship ONLY if Kimi drafts AND a Sonnet run stays green, else close as "model" | CLOSED by ruling (hamr, 2026-09-09: "settle on one secondary/replacement for claude … don't pickpocket random models") — secondary is `deepseek-chat` (F150), which drafts on the current prompt; Kimi is not a candidate, experiment killed at $0.02, prompt untouched |
    | 30.8 | `decide()` completeness hole (softgreen judge grades only the functions locate reported) | a function the card names but locate omitted → RED; test | CLOSED F155 — completeness diff against the artifact; ONE FN_SHAPES inventory drives both the prompt prose and the detector (the hand-typed regex already disagreed on 4 shapes); red→green captured twice |
    | 30.9 | Item 28 build: provider factory, `openai-api` (+`baseUrl`, per-model request-key) on the menu, tier table with `deepseek-chat` as THE secondary (hamr's ruling, one replacement, no menu of half-tested models), signed `judge:{provider,model}` + calibration record, `stopReason` on worker-round | built + one paid probe through the SHIPPED runner on DeepSeek | CLOSED F156+F157 — factory built (one table, unknown name throws, per-model request-key gating, baseUrl admitted); probe GREEN through scripts/run-u.mjs (run mtu12vks, $1.64/$4, 10.3min, bridge minted). REMAINS OPEN as item 28 part (2) — DEFERRED by **item 31** below (the judge seam has 0 uses in 167 runs; signing a provider field for it is dead weight until a rubric job exists). The judge-key half is carried as item 31.4 |
    | 30.10 | Docs drift: CHANGELOG lacked F147; PRD spend figure wrong ($5.94 → $3.91) | corrected | CLOSED 487320d |

26. **Doc-genre roadmap tracking ends** — hamr's ruling 2026-08-31: doc-genre jobs rode the
    hitl/soft-judged ladder (`docs/product/2026-08-17-softgreen-review-door-design.md`;
    `docs/logs/FINDINGS.md`), and hitl is retired (v1.71; item 21 above). Dropped from tracking,
    not scheduled, as of today — not a deletion of any closed prose, an appended closure only.
    Softgreen (the judged floor) itself remains shipped and unaffected; only the doc-genre
    roadmap item ends.
    **2026-09-10 — re-opened for discussion by item 33** (hamr: non-repo jobs are "more common
    than you think"; the interview decides what stays here and what goes to fwdloop).
    **2026-09-10 — answered by item 33's interview:** a non-code job a machine or a judge can
    close with no human stays in bareloop; fwdloop owns jobs with humans in them. See item 33.

31. **Item 31 — two shapes, one adapter, and the gate nobody has ever fired** (hamr,
    2026-09-09). Supersedes the first draft of this item, which was written from a STALE
    SOURCE COMMENT and got the central fact backwards. **The correction, established at $0 by
    running the real code, not reading it:** `LOCKED_CLASSES` is EMPTY (`src/authoring.js:107`),
    so `runInterview` admits all three classes — `green`, `soft-green` AND `hitl` — with
    `ok=true, refusal=none, reds=0` for each. soft-green was never locked. The comment at
    `src/authorjob.js:38` (*"v1 STILL ADMITS ONLY `green`"*) is FALSE, and the refusal text at
    `src/authorjob.js:293` still offers hitl as a live alternative. Calibration has therefore
    never run for the ordinary reason: **0 calibrations and 0 `judged-locate` rounds across 167
    archived runs, because nobody ever authored a soft-green job** — not because anything
    blocked one. Read this before touching the verdict-class code; a comment in this area has
    already sent one build in the wrong direction.

    | # | Item | What "done" means | Validation |
    |---|---|---|---|
    | 31.1 | `hitl` is retired (v1.71 ruling; the class moved to fwdloop, item 29) but is still LIVE in the authoring menu | **CLOSED `e27a83e`.** Written as "moves into `LOCKED_CLASSES`"; built as a THIRD list instead, because locking it took its code with it. `LIVE_CLASSES` also gates `validateCloseDecl` (`src/declaredclose.js:306`) and the guard battery (`:489`), so a lock made a hitl close unvalidatable — **61 suite failures**, 57 even with the lock scoped to authoring. The three facts are now distinct: `LOCKED_CLASSES` (no battery exists — empty today), `UNLISTED_CLASSES` (`['hitl']` — built, validates, RUNS, simply never OFFERED), `MENU_CLASSES` (live minus unlisted). Read by the AUTHORING surface only, which is what keeps hitl's code alive and under test. The refusals differ by reason: locked says "wait for the rung", unlisted points at fwdloop — "wait for the rung" would be a lie for a class already built with no rung left | `runInterview({verdictType:'hitl'})` refuses; green and soft-green still `ok:true`; `tests/unlisted-classes.test.js` (13 tests, mutation-proven); hitl's own runtime suites still 37 pass |
    | 31.2 | Stale prose asserts a green-only v1 that the code does not implement | **CLOSED `437b4e4`+`724eb56`.** `src/authorjob.js:38` and `:293` rewritten to the two-shape truth (`green` deterministic + `soft-green` rubric); every other green-only claim swept | grep proves no surviving green-only assertion; fwdloop's quoted text no longer contradicts the source |
    | 31.3 | The provider table is a curated two-entry menu while `bare-agent` ships more adapter shapes than bareloop admits | **CLOSED `a48c24b`+ this commit, with a correction.** The item was written as "bare-agent ships SEVEN adapter shapes". That was a FILENAME COUNT of `node_modules/bare-agent/src/` dressed up as a fact. The EXPORT list is the truth: four real HTTP backends (`AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`, `OllamaProvider`) plus `CLIPipeProvider` (already admitted) and the `FallbackProvider` composite; `provider-http.js` is a shared timeout helper and `provider-stop-reason`/`-temperature`/`-usage` are helpers too. So this item admits **one** provider, not five. hamr's ruling (2026-09-09): *"anthropic, openai, gemini drop ollama for now"*. Built: `gemini-api` on `PROVIDERS` with `GEMINI_API_KEY` and two real tiers (`gemini-2.5-pro`/`gemini-2.5-flash`); `PROBE_STATUS` + `probeWarningLines` as the machine-readable probe debt, read to WARN and never to REFUSE (refusing would be a second ruling nobody made) — the probe rule STANDS and gemini owes its fire. The endpoint half of hamr's "api + api shape + endpoint" does NOT generalize: bare-agent's constructors read it from different option names (`baseUrl` for anthropic/openai/gemini, **`url`** for Ollama) and none validate unknown option names. Measured live: `new OllamaProvider({baseUrl:X}).url` → `http://localhost:11434`, X dropped, no error — the F149 class exactly. So each table entry declares its own `endpointKey` and `makeProvider` routes through it; the job spec keeps ONE field name (`baseUrl`) and translation happens once. Ollama stays out beyond the ruling: no key, no bill, so every round prices at $0 through machinery that trusts a price | a `gemini-api` spec validates; each provider's `endpointKey` checked against the REAL constructor, plus the Ollama silent-drop measured on the dependency itself; the token-key flag exercised per backend; the launch marker tested through `probeWarningLines` (4 mutations, all caught); full suite green |
    | 31.4 | `scripts/run-u.mjs:1107` hard-exits on a missing `ANTHROPIC_API_KEY` even for a job that never judges — a green DeepSeek run still demands an Anthropic key | a job whose `verdictType` is `green` runs with only its own provider's key; a judged job still refuses honestly and BY NAME when the judge's key is absent | both paths tested; the green-on-DeepSeek path proven with `ANTHROPIC_API_KEY` unset — **2026-09-10: OPEN, carried to item 33 step 4** (one green run on `gemini-api` with `ANTHROPIC_API_KEY` unset; also pays gemini's first-run debt from 31.3) |
    | 31.5 | The calibration gate (`src/calibrate.js`) is built, unit-tested and **has never executed once** — 0 of 167 runs | UNTOUCHED by this item (hamr: it is correct, it has simply never been exercised). Proven by USE, not by edit: a real soft-green job is authored and FIRED on DeepSeek so calibration runs end to end for the first time | one paid soft-green run; the calibration record exists in the spine with its 10-of-10 floor read; defects found on first real use are logged as findings, not papered over — **2026-09-10: authoring half RAN** (run `mtv8jihy`, $0.87): first calibration ever, refused 1/10 — the rulebook is doc-comments only, so the bar compiled onto the wrong rules (F159). The fire is **carried to item 33 step 4**, on a bar the widened rulebook can express |

    **The judge stays pinned to `anthropic-api`/`JUDGE_MODEL` — arbiter territory, unchanged by
    this item.** A soft-green job therefore legitimately needs BOTH keys (the worker's and the
    judge's); 31.4 removes the demand only where no judge can run. The first draft's
    "signed `judge:{provider,model}` + per-pair calibration" was DEFERRED here as dead weight
    for a seam with 0 uses in 167 runs — **that deferral is LIFTED by item 32 below** (hamr,
    2026-09-10), which un-pins the judge before the seam's first-ever firing rather than
    after it. Item 28 part (2) is closed by item 32, not by this item.

    **31.1–31.3 shipped in v0.24.0, 2026-09-10.** 31.4 and 31.5 stay OPEN, carried to item 33
    step 4.

32. **Item 32 — the judge stops being a Claude judge** (hamr, 2026-09-10: *"what i care about
    is that judge becomes llm agnostic and not set to one model or provider"*). Item 28 pinned
    the judge to `anthropic-api`/`JUDGE_MODEL` as arbiter territory and item 31 left it there.
    That pin is now the last place bareloop requires an Anthropic account: after 31.4 a green
    job runs on its own provider's key alone, and a JUDGED job still cannot.

    **A correction this item is written to fix.** This session first assessed the un-pinning as
    *"threaded through 7 shipped modules, baked into the signed hash, arbiter territory, its own
    build"*. That was answered from memory, and hamr said so (*"i know you answered from memory
    rather than grounded"*). Read against source, it is wrong in the half that mattered — the
    judge MACHINERY is already provider-agnostic by construction:

    - `src/calibrate.js:50`, in its own words: *"IT OWNS NO PROVIDER. The judge seam arrives as
      `judgeLoop`"* — an absent one is a wiring-gap STOP, never a silent skip.
    - `defaultJudgeLoop({provider, system})` (`src/judged.js:677`) builds a bare-agent `Loop`
      over WHATEVER provider object it is handed. Nothing Anthropic-shaped is assumed.
    - `runJudgedFloor` (`src/kinds.js:1786`) reads the seam from `ctx.judgeLoop`, injected by
      the caller.
    - The signed calibration record ALREADY carries the judge identity per spec —
      `foldJudgedArtifacts` writes `closeDecl.calibration.judgeModel` (`src/cardauthor.js:396`),
      so `jobSpecHash` covers it by construction and no new signed field is needed.
    - The recalibration refusal ALREADY exists: `src/kinds.js:1739` refuses to grade when the
      stored judge model is not the one about to grade, naming both, degrading in neither
      direction.

    So the hash, the record and the guard are built. **Only two things are actually pinned:**
    (a) three sites construct the judge with `new AnthropicProvider(...)` directly
    (`scripts/run-u.mjs:1214`, `scripts/run-author.mjs:442`, `src/cli.js:88`), bypassing the
    provider factory item 31.3 built; (b) `JUDGE_MODEL` (`src/judged.js:92`) is a GLOBAL
    CONSTANT standing in for "what will grade this", where everything downstream already
    reads it as data.

    | # | Item | What "done" means | Validation |
    |---|---|---|---|
    | 32.1 | The judge identity is a constant, not a resolved value | **CLOSED `c7b400d`.** `resolveJudge({specJudge, workerProvider, workerModel})` (`src/judged.js`) resolves per job: the spec's signed `judge` override if it names one, else the worker's own provider+model — deliberately **no library fall-back**; neither nameable throws. `JUDGE_MODEL` stays exported (pre-item-32 pin, minor-survives-import) but is read by **no grading path** any more. The resolved identity threads as `judgeModel` on `Ctx` (`src/kinds.js`); its absence is a wiring-gap STOP checked BEFORE the judge seam runs and before the calibration stamp — this is the same stop the item's own text promised, not a new one. Two real defects surfaced by the mutation pass and fixed in-branch (not merely found): `src/declaredclose.js` accepted `judgeLoop` but never forwarded `judgeModel` onto ctx, so every judged run would have hit the wiring-gap stop regardless of what the caller resolved; `src/calibrate.js` had the mandatory-`judgeModel` throw ahead of the `judgeLoop`-absent check, making the documented graceful stop unreachable through its own real caller path | a spec naming no judge resolves to the worker's provider/model; a spec naming one resolves to that; both reach `runJudgedFloor` and the calibration record (`foldJudgedArtifacts` stamps `closeDecl.calibration.judgeModel`, so `jobSpecHash` covers it with no new signed field); mutation-proven (7 mutations, all caught, per the source commit). Honest limitation: none of this has run live — `gemini-api` has 0 runs and `src/calibrate.js` has never executed once (0 of 167 archived runs) — item 32 is proven by tests only, and a real share of that proof is source-text regex (`tests/judge-key-demand.test.js`: 8 of 10 assertions are `assert.match(src, …)`) rather than behaviour; `tests/judge-model-pin.test.js` (9 tests) is real behaviour |
    | 32.2 | Three sites hardcode `AnthropicProvider` for the judge | **CLOSED `c7b400d`.** All three (`scripts/run-u.mjs`, `scripts/run-author.mjs`, `src/cli.js`) construct the judge through the provider factory instead of `new AnthropicProvider(...)` directly. `src/providers.js`'s `buildRunnerProviders` gained `judgeProviderName` (defaults to `providerName`) and `judgeBaseUrl`, and **reuses the worker provider instance** when provider+model+key+baseUrl all match — a second instance would be a second prompt-cache prefix, and cache writes are ~41% of the bill (MEMORY.md). `src/cli.js`'s bundle-runner key contract stays a separate, deliberate `ANTHROPIC_API_KEY`-only refusal, decided explicitly rather than swept: it refuses by name for **both** the worker and the judge when either resolves to a provider reading a different env key — but the judge half of that refusal had **no behavioural test** until this commit (`tests/cli.test.js`, GAP B) | no `new AnthropicProvider` survives for a judge; a judge on each admitted provider constructs; the worker-provider-reuse path and the judge-side ANTHROPIC_API_KEY-only refusal are both now exercised through the real CLI. Live limitation carries over from 32.1: `gemini-api` (the provider this refusal is now proven against) has 0 real runs |
    | 32.3 | The names say Claude | **CLOSED `c7b400d`+`808f6c3`.** Renamed to role-based names now that the moving parts are few. `JUDGE_API_KEY` (landed in 31.4 with an `ANTHROPIC_API_KEY` fallback) now follows the RESOLVED judge provider's own `envKey`, with that fallback kept for the anthropic case. `bareloop.context.md` (the adopter contract that SHIPS in the tarball) had five stale statements asserting the judge stays pinned to `anthropic-api`/`JUDGE_MODEL` — all five corrected to the resolved-identity contract, a `judge` row added beside `model` in the job-spec table, and CHANGELOG's Unreleased section gained item 32 with an explicit BREAKING note: `runCalibration`, `foldJudgedArtifacts`, `prepareSigning`, and `authorCloseForJob` now require the resolved `judgeModel` and throw without it | every name reachable by an adopter is role-named, not vendor-named; grep proves no surviving vendor-named judge reference in the shipped contract doc |
    | 32.4 | Nothing proves any of it | **CLOSED `c7b400d`.** The recalibration guard (`src/kinds.js:1739`, pre-existing) is now exercised across a judge **PROVIDER** change, not only a model bump — `tests/judge-model-pin.test.js` (9 tests, real behaviour, expanded from a prior model-only-bump suite) proves a spec calibrated on judge A refuses to grade on judge B, by name, in both directions | a red that names both identities; mutation-proven (recalibration-mismatch-neutralized mutation caught 2 of 9). What did NOT move: the judge still renders no verdict — it locates facts and quotes; a deterministic `decide()` renders the verdict; unsure is RED; `CALIBRATION_SIZE` stays 10 with a 10-of-10 floor and no partial credit; composition stays mechanical-first/judge-minimal/human-last/first-red-wins. Un-pinning the judge's provider moved no threshold |

    **What does NOT change, and is not up for negotiation in this item:** the judge still never
    says pass/fail — it extracts facts and quotes, and a deterministic `decide()` renders the
    verdict; unsure is RED; `CALIBRATION_SIZE` is 10 with a 10-of-10 floor and no partial
    credit; the composition law is mechanical-first, judge-minimal, human-last, first-red-wins.
    Un-pinning the judge's PROVIDER is not a licence to move any threshold, and no threshold
    moves here.

    **The self-grading question, answered by measurement rather than doctrine.** Defaulting the
    judge to the worker's own LLM means a model's output is read by its own family, which is a
    real correlated-blind-spot hazard. Two things already contain it: the judge renders no
    verdict (it locates facts; `decide()` is deterministic), and the calibration gate is
    exactly the instrument that catches a judge which cannot see failures — its frozen set
    contains cases that MUST fail, and the floor is all ten with no partial credit. So the
    pairing is licensed empirically, per job, by a gate that already refuses. If a
    worker-family judge cannot pass its own calibration, that IS the finding.

    **Ordering (hamr, 2026-09-10, and he is right).** This lands BEFORE 31.5's first-ever
    calibration fire, not after. The session first argued for firing 31.5 on the pinned haiku
    judge first, on the "land levers one at a time" rule — but that rule protects a BASELINE,
    and there is none: 0 calibrations across 167 runs. A pinned-haiku fire would preserve
    nothing and be invalidated immediately, since changing the judge forces a recalibration by
    the guard above. Named hedge: with both the mechanism and the judge unfired, a red has two
    candidate causes (mechanism broken vs. judge unfit). Locate+decide is ~$0.002–0.004/call,
    so re-running the same set against a second judge disambiguates for cents — cheap enough
    that it is not a reason to reorder.

    **Arbiter line, held.** This changes WHICH model grades, never WHO decides: the agent still
    never authors its close, its budget, its fence or its merge, and cannot name its own judge
    — `judge:{provider,model}` is a SIGNED spec field the human signs, exactly like the rest of
    the hash, never a drafter-selectable knob.

    **shipped in v0.24.0, 2026-09-10.**

33. **Item 33 — jobs that are not code, and a judge that can read more than doc comments**
    (hamr, 2026-09-10). **Interview first; nothing here is locked.** It re-opens item 26's
    2026-08-31 ruling, and its answers decide the final line between bareloop and fwdloop.

    **Amended 2026-10-14 (v1.99, SIGNED): a signed bareloop job may now repeat on a clock or a queue. Still no human mid-run, no sending, no booking. See "Triggers" in v1.99 below.**

    **Why now.** The first soft-green job ever authored (run `mtv8jihy`, F159) showed the judge
    can grade exactly one thing: whether JS functions have good doc comments. Its rulebook is
    `has-doc`/`params`/`returns` (`src/judged.js:391`). hamr's bar was about error messages, so it
    was compiled onto doc-comment rules, and calibration refused (1/10). And hamr's point: green
    means "a machine can check it", not "code" — a CSV cleaned to a row count is green; a resume
    turned into a 500-word profile in 3 sections is soft-green. Both are common.

    **Calibration, in plain words** (so the interview starts from the same place): before a
    judge grades real work, it takes a test — 10 examples the signer marked pass/fail, plus 5
    trick files that try to fool it. It must get all 10 right and resist all 5, or the job
    cannot be signed. It checks the ruler, not the work.

    **The holes** — each is a missing feature, never a workaround (hamr: "i don't want a hack";
    a job that cannot run cleanly is logged as a hole):

    | # | Hole | Blocks today |
    |---|---|---|
    | H0 | The judge's rulebook is doc-comments only | any soft-green bar that is not about JS doc comments — in a repo or out |
    | H1 | Input must be a git repo with a commit | a plain folder (a CSV, a resume) |
    | H2 | Judged paths must exist at the seed | an output file the run creates |
    | H3 | Checks are code-only (the TYPES genre, `src/authoring.js:516`) | word count, headings, CSV rows/columns, schema |
    | H4 | Mandatory guards are code-shaped (`no-suppressions`) | a guard like "the input was left untouched" |
    | H5 | Authoring asks for a code language (`js`/`python`) | a job with no language |
    | H6 | Worker verbs touch files only | outside-world input, e.g. searching flights (parked; booking is fwdloop) |

    Also from `mtv8jihy`: the TYPES genre put a `tsc --strict` work stage (142 errors at seed)
    into a close whose goal never asked for typing — the genre must never add a stage the goal
    does not state.

    **Example jobs to shape it** (hamr's): resume → 500 words in 3 sections (technical
    competencies, soft skills, experience summary); CSV in → cleaned CSV out; flight search
    under $500, no red-eye, judged against the stated criteria.

    **The interview must settle:** which holes are bareloop's and which are fwdloop's; the
    shape of "folder in, file out" (git as hidden plumbing or not); which judge rules to own
    first; the non-code check and guard catalogue; whether H6 is in scope at all.

    **Arbiter line.** The rulebook, the check catalogue and the guards are arbiter territory:
    widening them is additive, hamr's go, and never agent-authored.

    **2026-09-10 — the interview, answered (hamr). Step (1) of item 25's order is DONE.**
    hamr's answers are the rulings below. The build (step 3) has not started.

    **The line between bareloop and fwdloop (RULED).** bareloop = `green`/`soft-green`, repo OR
    plain folder, no human mid-run, one-shot jobs run once or now and then with a fixed shape,
    self-healing by retry; the review door at the end (accept / rerun) stays as it is. fwdloop =
    humans in the job: daily-grind automation of parts of a person's work, hitl windows, chat and
    multi-turn, daily/monthly budgets, prose + guardrails, escalates to a person more than it
    retries (it may carry some deterministic/rubric steps). Item 26's "doc-genre goes to fwdloop"
    is superseded: a non-code job a machine or a judge can close with no human is bareloop's.

    **The intake form (RULED) — the same for green and soft-green:**

    | Field | Holds | Replaces |
    |---|---|---|
    | Goal | what you want to achieve | Q1 |
    | Source | a local folder, subfolder or file, OR one URL the machine can reach (no login, no setup) | Q2 (read half) |
    | Destination | a LOCAL DIRECTORY the run may write into (never a filename); may already exist, as long as nothing has been written into it yet; same directory as Source = changes permitted there and nowhere else; the run may produce more than one file, and it names them itself, meaningfully and timestamped — see 2026-09-12 addendum below | Q2 (change half) |
    | What success looks like | checks a machine can count | Q4 |
    | Guardrails | what must not happen or change | Q3, Q5 |
    | Judge examples | one pass, one fail, and why — multi-line, its own space, shown ONLY when soft-green is selected | Q6, Q7 |

    The code only checks each answer is non-empty and hands it on verbatim
    (`src/authorjob.js:298`), so the re-shape changes wording, not machinery. For a repo
    source, the confirm turn asks Q5's "what counts as worse than before" — **retired
    2026-09-28** (hamr's ruling, session mul5fofw): it was optional, and an empty answer
    already meant "nothing beyond Guardrails", so it never earned its own turn; `worseThanBefore`
    now always resolves to `''`, byte-identical to what an empty answer always produced.

    **The confirm turn (RULED).** After the form, the AI reads the source and answers once:
    "here is what I understood" — the checks it will make, and any questions. The person
    confirms or fixes. **2 rounds max**, then it drafts; signing is unchanged. The cap is what
    keeps this one-shot and not fwdloop's chat.

    **Calibration (RULED).** The AI generates the cases (hamr: a person writing them is "a huge
    ask for automation"), built from the person's judge examples AND the job's REAL input —
    never invented material (F159's cases were invented functions). **Size stays 10**, floor
    10-of-10 (the session's call, on hamr's delegation: the AI writes them and they cost pennies,
    and a judge right 9 times in 10 passes a 5-case test ~59% of the time vs ~35% for 10). The 5
    injection styles stay built in. Worked example — resume → `profile.md`, 500 words, 3 sections:
    word count and headings are GREEN checks, never shown to the judge; the judge's cases are
    real-resume variants (clean and traced = pass; an invented skill = fail; "10 years" when the
    resume shows 4 = fail; soft-skills section repeating tech skills = fail; heavy rewording
    still traced = pass).

    **Two base rules, always on, never written by the person (RULED).**
    1. **Output rule** — the destination file exists and is not empty. Every plain-folder job,
       green or soft-green; repo jobs keep their `files-changed` equivalent.
    2. **Citation rule** — every claim in the output points to a line in the input; code checks
       the quoted line really is in the input; no line or a fake line = RED. Every soft-green
       job. Honest ceiling: code proves the line EXISTS, not that it supports the claim — that
       part is the judge's, and is what calibration tests.
    Both are new; neither exists in code today.

    **Checks and guards (RULED).** First checks: output exists and non-empty; word / line / row
    count (min, max, exact); named sections or headings present; CSV has named columns; JSON
    matches a shape. Guards, always on: the input was left untouched; nothing written outside
    the destination. File types: only what bareloop already reads (`.txt`, `.md`, `.csv`,
    `.json`, code) — no new libraries for special files yet.

    **Holes → rulings:**

    | # | Ruling |
    |---|---|
    | H0 | Rulebook widens with the citation rule first (above); doc-comment rules stay |
    | H1 | **Hidden git** — bareloop copies the source to a private scratch spot and runs git there itself; the person never sees it; seed, diff, undo and resume keep working; the original is never touched |
    | H2 | The destination is created by the run — judged paths must be allowed to not exist at the seed |
    | H3 | The non-code check catalogue above |
    | H4 | The two guards above; code guards stay for repo jobs |
    | H5 | No language question — the form has none |
    | H6 | **IN SCOPE** — a barebrowse verb that can read, type and click to search; never submits a payment or booking form (booking is fwdloop's) |
    | H7 | NEW — PDF and Word input need a text reader bareloop lacks; logged, not built |

    Also RULED as a fix: a genre never adds a close stage the goal does not state (the TYPES
    genre's `tsc --strict` stage in `mtv8jihy`).

    **Also RULED (hamr, same day, closing the two proposals):**
    - **Source and destination are proven at job start, mechanically, $0** — a URL is fetched
      once, a local folder or file is read, and the destination is proven writable, all before
      any tokens spend; the fetched bytes are frozen into the hidden-git copy, so the run and the
      close judge the same bytes. A source that cannot be read or a destination that cannot be
      written refuses there, by name.
    - **Web-search evidence is the arbiter's own record** of what barebrowse returned; the close
      checks the output against that record, never against a worker-written file.
    - **Everything lands in the audit output that already exists** — the form, the confirm-turn
      questions and the accepted answers ride in the same signed/spine records the interview
      answers do today; no new record format.

    **Signed by hamr, 2026-09-10** ("prd reads fine, signed"). Next per item 25: step (3), the
    build, on its own branch.

    **2026-09-12 — Destination corrected (RULED, hamr).** The Destination row above originally
    read "the output file, written LOCALLY" — that line was the root cause of the M2/M2b door
    validating a single file path. Corrected: Destination is always a DIRECTORY, never a
    filename; it may already exist (it is a spot nothing has been written into yet); if it is
    the same directory as Source, changes are permitted inside that directory and nowhere else;
    a job may produce more than one file (e.g. a flight search writing one sheet for "SFO→LAX
    red-eye" and another for "SFO under $700"); the agent names the output files itself,
    meaningfully and timestamped, so a new write never overwrites an old one. Source and
    Destination are always asked, for green and soft-green, repo and non-repo alike; Source may
    be a subdirectory or a single file. Repo jobs are unchanged by this: `writeScope`
    (`src/job.js:363`) already IS the destination for a repo job — a list of globs, so "you may
    write `/src/` and `/tests/`" is already expressible; repo runs stand on a work branch
    (`prepareWorkBranch`, `src/planrun.js:1922`), never a worktree, and a patient with no branch
    is the named stop `branch-red`. A PR-review job is a repo job whose output lands in the repo
    at the destination path. Non-repo jobs keep the same shape, on a fresh folder with hidden
    git bareloop owns. Rework owed on the M2/M2b non-repo door is tracked in
    `docs/product/ITEM33-BUILD.md`, not started, awaiting hamr's go.

    **2026-09-12 — build progress.** M1 (citation POC), M2 (source front door) and M2b
    (review fixes) landed — `docs/product/ITEM33-BUILD.md`. The repo-source path is **OPEN,
    pending rework**: it does not hold on a real JS repo today (F161–F166,
    `docs/product/ITEM33-BUILD.md`'s "REWORK OWED" section). M3–M7 not started.

    > **2026-09-13 — pointer:** F164/F165 CLOSED 2026-09-12 by the D1 rework —
    > `docs/product/ITEM33-BUILD.md` "Destination model corrected" section and its D4
    > measurement. The line above is left as the record of what the build stood at that day.

    **2026-09-13 — M3 detailed** (hamr; `docs/product/ITEM33-BUILD.md` "M3 — the intake form
    and confirm turn", DETAILED, not started). Rulings 1–9: (1) form lives in
    `scripts/run-interview.mjs`, `src/authorflow.js` stays the one question-set source; (2)
    Source/Destination replace `--patient`, proven $0 at entry, Destination feeds `writeScope`
    for repo jobs; (3) language is DETECTED from the repo (`package.json`/`pyproject.toml`/
    `setup.py`), never asked, replacing `--lang`; (4) the confirm turn is paid, inside the
    authoring budget, reusing the scout's survey; (5) 2-round cap, drafts anyway, open
    questions shown at signing; (6) no check the goal didn't ask for — a prompt register plus
    a pre-draft listing, never a prose matcher; (7) M3 ships a working repo job, a plain-folder
    job gets an honest named stop (checks come in M4); (8) hitl stays out of the form and all
    customer-facing text; (9) proof is one live DeepSeek (`deepseek-flash`) interview,
    depending on item 34's L17.

    **2026-09-13 — signed goal** (hamr): the separate goal question is dropped; the confirm
    turn drafts the signed goal from Goal + What success looks like, and the person signs
    after the 2-round conversation — docs/product/ITEM33-BUILD.md M3.

    **2026-10-06 — rubric job shape. DRAFT: not ruled, not signed** (hamr + session tree-ab,
    fwd consulted). A list of rough recommendations to pick up when the rubric (soft-green)
    work starts, to be tuned with hamr first. The reasoning, worked examples and doubts are in
    `docs/logs/RUBRIC-LEARNINGS.md` (cited below as RL with line ranges). Where a point would
    change an item 33 ruling above, it says so; the ruling stands until hamr rules otherwise.

    | # | Draft spec | Changes | Why (RL) |
    |---|---|---|---|
    | R0 | **Scope.** Rubric is for research and search jobs (web fetch, local sources), not code jobs. A judge checks each step; one human accepts or reruns at the end. A human needed mid-flow → fwdloop. | narrows item 33's "repo OR plain folder" for soft-green; the doc-comment rules stay, but unused | L114–144, L145–168 |
    | R1 | **Happened check, built in, before any judge**: output exists, not empty, not cut off. A failed step never reaches the judge. | extends base rule 1 (output) from the destination to every step | L145–168 |
    | R2 | **Cited check, built in, universal**: no verbatim quote, no fact; no fact, red. `unquoted()` becomes a stage-level check, not a per-rule helper. | = base rule 2 (citation), made per step | L20–32 |
    | R3 | **Frozen check, built in**: every source and every fetched page is frozen with a sha256 at the moment it is read; the judge quotes only the frozen copy, never worker-written text. | matches the ruled "web-search evidence is the arbiter's own record"; adds the per-fetch hash | L145–168, L169–200 |
    | R4 | **Clean check, built in**: crash, unparseable and unpriced judge calls are red, never green. | mostly built (`artifact-red`, `pricing-red`); write down in one place | L145–168 |
    | R5 | **Calibration by mutation**: one deterministic edit of a real artifact per `~` line, the expected answer known by construction. Model-drafted cases at most as extras. Size 10 and the 5 injection styles stay. | changes "the AI generates the cases" (Calibration, RULED) | L33–87 |
    | R6 | **Repetition.** At calibration: grade each case N times, all must be right. On live runs: read twice; disagreement → unsure → red (the agreement check). Never opens a mid-run question. | new | L88–101 |
    | R7 | **Human at the end only**: the existing review door (accept / rerun). Accept binds the output's hash, as fwdloop's does. No asks in a rubric job. | none, consistent with the bareloop/fwdloop line | L145–168 |
    | R8 | **A miss is fixed by a new `~` line + a mutation case + a re-sign**, never a smarter judge. | none (existing doctrine) | L20–32 |
    | R9 | **Intake: the rubric radio changes the form** to **Job › Source › Destination › Guardrails**. No Success field: every step carries its own checks, and job-wide checks go on the last step's `~` or are built in. | changes the ruled intake form (Goal, What success looks like); see open Q1 on Judge examples | L169–200 |
    | R10 | **Job editor**: steps and `~` lines strictly alternate, 1 › ~ › 2 › ~. Numbers and `~` sit in a gutter outside the text box and appear on their own (as fwdloop's do); the person types words only. A step is one continuous line until Enter; Enter → `~`; Enter → next number. One `~` line per step, holding comma-separated checks. Every step needs a `~`: an empty `~` turns red and drafting is refused with an error; a step with no check is merged into its neighbour. | new | L169–200 |
    | R11 | **Each `~` part is sorted at authoring**: countable (code checks it — word, section, row counts) or cited (the judge quotes, code checks). A part that is neither is red. A card that contradicts itself (e.g. 600 words vs 3 × 250) is caught before signing. | builds on the ruled non-code check catalogue (H3) | L169–200 |
    | R12 | **Source: several, named**, one per gutter-numbered line, `name: value`. A value is a local file, a fixed URL (only that page), or `search` (the worker may search and follow results; Guardrails can limit domains). Steps refer to sources by name; a step naming a source that does not exist is flagged. `.docx` reads through fwdloop's `src/docx.js`, reused. | changes "one URL"; uses H6 (barebrowse search, in scope); re-opens H7 / L11 (Word input) because a real job needs it | L169–200 |
    | R13 | **Where checks show**: a locked legend under the Job box; chips per step in the Run tab — `(happened) (cited) (frozen) (clean) (agreement)` + the `~` checks, green/red, legend at the top of the step list; the proof in Audit / logs — each judge call as a row with quote, source and the source's sha (from the existing `judge-round` records). | new (panel) | L201–220 |
    | R14 | **Promote it as "research you don't have to fact-check"**, strongest as recurring watch jobs on the existing `cadence` field — silent until something matches. | positioning | L114–144 |

    **Open questions for the tuning session:**
    1. Judge examples (the ruled softgreen field): kept beside the `~` lines, or replaced by them
       plus mutation of the real source?
    2. Repetition: N at calibration (3?), and its cost ceiling as a share of the job budget.
    3. Which judge rule comes first — a general "a quoted value meets a condition" rule, or one
       per job kind?
    4. fwd's "a correct red on a clean input counts as a catch, not a miss" — what it means for
       scoring calibration (RL L145–168).
    5. Does the worker report a typed `done` boolean per step (fwdloop has one), or does the

    **2026-10-12 — rubric job shape RULED** (hamr, interview this session; supersedes the
    draft above where they differ; the draft stays as written).

    | # | Ruling |
    |---|---|
    | R0 | A rubric job is for research and search jobs only (local files, web pages). Code jobs stay deterministic. Narrows item 33's "repo OR plain folder" for soft-green. |
    | R12 | A source is one of three: a local file; a fixed URL (only that page); `search` (the worker may search and follow results; `~` rules can limit domains). Within H6: read, type, click; never pays or books. |
    | R1–R4 | Four built-in checks run on EVERY step before any judge: happened (output exists, not empty, not cut off; a failed one never reaches the judge), cited (no word-for-word quote → red), frozen (every file/page saved with sha256 at the moment it is read; the judge quotes only the frozen copy), clean (crashed, unparseable or unpriced judge call → red). |
    | R5 | Practice cases are made by code breaking a real output on purpose, one exact change per `~` rule, answer known by construction; model-written cases only as extras. A new job's first run has no real output yet and falls back to the ruled model-written cases. Changes the ruled "the AI generates the cases" (Calibration). |
    | R6 + Q2 | The judge checks twice. Calibration: each case graded 3 times, all must be right. Live run: each step read twice; disagreement = unsure = red. Never opens a mid-run question. |
    | R11 | Each `~` rule is sorted at drafting as countable (code checks) or cited (judge quotes, code checks). A rule that is neither, or a self-contradicting card, is red and the job does not sign. |
    | R13 | Run tab shows chips per step — (happened)(cited)(frozen)(clean)(agreement) plus the `~` rules, green/red, legend at top; Audit shows one row per judge call with quote, source and the source's sha. |
    | Q1 / R9 / R10 | Already settled by the P7 job block (2026-10-10): the form is The job + Inputs; numbered lines with `~` rules; judge examples are `~ PASS:` / `~ FAIL:` lines. |
    | Q3 | The first judge rule is one general rule: "a quoted value meets a condition" (e.g. price ≤ X, date in range, count). |
    | Q4 | In calibration, a red on the untouched (clean) case is a MISS: calibration fails with a plain-words reason. fwd's "counts as a catch" is not adopted. |
    | Q5 | No worker `done` flag; the happened check reads the output alone (only the close is truth). |
    | R7, R8 | Unchanged (existing doctrine). R14 (positioning): not ruled, not needed for the build. |
       happened check rest on the output alone?

    **2026-10-12 — required facts RULED** (hamr; supersedes Part 1a's worker-chosen `cites` list where they differ)

    | # | Ruling |
    |---|---|
    | RF1 | Check what the person asked for, not what the worker chose to write. At drafting the AI turns each job line and its `~` rules into REQUIRED FACTS (name, shape, rule when asked, source input); facts named in the job line itself ("SFO to LAX") become rows with no `~` line. The list shows on the plan card, one row per fact under its line, and is signed with the job; the AI never changes it after signing. |
    | RF2 | Shapes: money, number, date, time (rules `<` `<=` `>` `>=` between) and phrase (the quote must contain it). Checked in code by bareguard 0.22.0 `cited` + `decides` + typed `values` (needs the bump `^0.21.0` → `^0.22.0`, peer range checked in a clean install). No AI in the check. |
    | RF3 | EVERY answer is quoted word-for-word and shape-checked, even a fact with no rule; a rule only adds a condition. A red names the fact and why, and goes to the fix loop. |
    | RF4 | Fact step (find, list, look up): the output is the filled facts only, nothing unchecked is part of the answer; "N results" = N filled copies, the count a rule code checks. |
    | RF5 | Prose step (report, summary): free text, shape-checked (size, sections); content is "Not checked" on the card and judged by the person at Accept. Every number in prose must equal a checked fact value from an earlier step (same canonical compare). |
    | RF6 | Superlatives ("cheapest", "the last 3") are Not checked for now (later piece). A rule the AI cannot express as shape + rule goes to Not checked in the person's words, never a vague check. |
    | RF7 | F223 (`docs/wiki/FINDINGS.md`) is closed by design once this is built. |
    | RF8 | Later piece, its own build AFTER required facts: **rerun from line N** at the end gate of a GREEN run only. Lines before N keep their checked outputs byte-for-byte (not redone, not edited); the person's words go to line N and everything from N is redone; money and time already spent stay folded in (tighten-only, never a fresh budget). Changes the end gate (accept / rerun / pause). |
    | RF9 | One quote per result: each result (e.g. one flight) is ONE claim with ONE quote holding all its facts (bareguard's typed claim binding: values d0, d1… each canonically equal to what the quote holds). Separate quotes per fact would let a worker mix facts from different results (price from flight A, time from flight B) into a result that does not exist. |
    | RF10 | Two bareguard additions asked (hamr chose A: ask bareguard, never patch locally): (a) a shape-only value decide — no condition, only "the value is in the quote" (needed for RF3's facts with no rule); (b) a `text` shape — the value appears in the quote as a whole word, case/space-insensitive, otherwise exact (versions "0.41.0", flight numbers "MS791", names). Asked of the guard session 2026-10-12; the build waits for the published version. |
    | RF11 | Honest limit of the text shape: code proves the value is a word in the result's quote, not that it is the RIGHT word for that fact ("Nonstop" as airline would pass). Accepted: the quote is one result row and the person sees the answers at Accept. |
    | RF12 | Three layers, the same for every job: (1) is the answer real — every value sits in a real quote from ONE record, code, always (bareguard bind-only membership + `text`); (2) does it meet the rule — code, only when the value's role is certain: one value of its kind in the quote, or a label from the source right before it (anchor); (3) did it pick the right thing — the person at Accept, listed under Not checked. Not flight-specific: records commonly carry several values of one kind (leaves/lands, subtotal/total, min/max) and use their own words. |
    | RF13 | Look first, fail early (hamr, 2026-10-12): every word a check depends on (phrase, label/anchor, unit) is searched for in the real source AT DRAFTING, before signing. Local files: read at $0. Web search: the drafter runs one real search at drafting (small spend, booked to drafting spend under the one cap) and checks against what it found. A word not found stops drafting in plain words naming the word and the input ("'SFO' is not in the input 'Flights' — change the rule to the words the source uses, or remove it; nothing was signed"). Code never decides two different words mean the same thing. Backstop: the run re-checks on the first page it reads (pages change) and stops early in plain words. |
    | RF14 | When a word is missing, the drafter may SUGGEST a real line from the source ("the input has 'San Francisco International Airport' — use that?"); the person decides; code only proves the chosen words are really in the source. Labels/anchors the drafter takes from the source are shown on the card and signed. |
    | RF15 | Three early tests, at drafting, on the real source (files at $0; web search on the one drafting search), before any check can be signed. Code splits the source into records (one per flight / release / row) and runs each check: (1) FOUND — the label/word/value exists in each record, count shown ("found 44/44"); 0 found stops drafting in plain words ("No flight on this page leaves SFO — wrong page or wrong direction?"); (2) ONE PER RECORD — where a rule needs a value, exactly one per record, else "ambiguous — add a label"; (3) TELLS RIGHT FROM WRONG — code breaks a real record on purpose (changed price, AM/PM swap, arrival as departure) and the check must go red, else "this check can't tell right from wrong here"; and the rule's split over the real records is shown ("39 pass, 5 fail"; a rule passing every record is flagged). A check failing any test cannot be signed: the person changes or removes it. Same principle as code jobs' seed-red and the ruled code-made practice cases (R5). |
    | RF16 | Every `~` rule must become a check or appear under Not checked in the person's words; code refuses a draft that silently drops one (same honesty rule as the sign==run fix). |
    | RF17 | A rule the AI turns into a number (e.g. "not a red-eye" → departs between 06:00 and 21:00) is marked on the card "AI's proposal — check it"; "not a red-eye" must use a between range, never a one-sided bound. A `text` fact may carry a label (anchor) so "from SFO" means the word after the departure label, which makes route direction checkable — asked of the guard session 2026-10-12 (correction to loop's earlier "no anchor on text in v1"). |

    **2026-10-13 — look, then say what I can check RULED** (hamr; after the first live Part 1b drafts failed on record cutting, sessions smv6jhano7ba3, smv6k6l8dxkzs, smv6lyypleng8; supersedes RF15 and the record parts of RF12/RF13)

    | # | Ruling |
    |---|---|
    | RF18 | Drafting does not grade. It only checks that each fact CAN be checked: a label with a value of the fact's shape (or the phrase itself) is found at least once in the real source. No record cutting, no per-record tests, no broken-copy test at drafting. Finding and grading are the run's and the close's job (the close is code, so a weak check costs a fix try, never a false green). Supersedes RF15. |
    | RF19 | The drafting look is a read-only search of the input, done by the AI with tools (like the repo scout, read-only by construction, bounded rounds, spend booked to drafting): it searches the person's words AND other words that mean the same ("nonstop" / "direct", "San Francisco" / "SFO"), reads the spots it finds, and uses what it knows ("not a red-eye" → a night window, marked AI's proposal, RF17). It reports "I can check these facts", one line each with the label and value it saw. What it cannot find goes to Not checked, or becomes a question only the person can answer. |
    | RF20 | Code proves every label and phrase the AI reports is really in the source (once is enough). Code never decides two words mean the same: the AI proposes the words, code proves they are there, the card shows the exact words used. |
    | RF21 | Web input from the start: an input line may be a URL the person pastes (a results page). bareloop fetches it with barebrowse, read only: once at drafting for the look, and again at run start. A search the AI runs itself (no URL) is a later piece. |
    | RF22 | The close grades against the page the RUN fetched: code saves it at run start as the run's frozen input, before the worker reads it; the worker cannot change it; every quote is checked against that copy. The drafting copy is only for the look (prices change). |

34. **Item 34 — loose ends housed** (hamr, 2026-09-13: every open end gets fix / keep /
    backlog / remove).

    | L | Item | Ruling | Where |
    |---|---|---|---|
    | L1 | `src/source.js` folder/repo sources read each file twice (scan, then `copyFile`) | FIX — freeze must write the exact bytes that were secret-scanned | bdedbaa |
    | L2 | `scripts/run-u.mjs` `SCOUT_LABEL` prints "(default)" even when `--scout on` was passed explicitly | FIX | 15732bc |
    | L3 | `closeScriptCandidateToken` (`src/validate.js:124`) treats an `npx @scope/pkg` token as a script path, so such a close can never be signed | KEEP as a documented limit — fails safe, no job uses it | f0eaffc |
    | L4 | F167's guard class: `tests/index.test.js`'s documented-exports list is hand-typed | FIX — read the names from `bareloop.context.md` instead | 262ed56 + 56bfe16 |
    | L5 | F169 — local AGENT_RULES.md copy changed with no known writer | FIX — closed: the local copy updates often and `.claude/` is gitignored, not a mystery | this commit |
    | L6 | Stale OPEN markers for F164/F165 | FIX — dated pointers | this commit |
    | L7 | F130 bundle-runner knob mirroring: `bareloop run` defaults `capRuns`/`closeTimeoutMs` to the library's 3 / 120_000ms instead of the operator-set 4 / 900_000ms | DEFERRED to the backlog with L8–L10 — `closeTimeoutMs` is already built and signed (`src/closetimeout.js` `resolveCloseTimeoutMs`: slowest seed-check time ×5, never below 120s, a signed number wins outright). `capRuns` is the most work rounds a run may do, owned by the runner on purpose (`src/job.js:221` treats it as shell-domain, inexpressible in the job spec), and it is only the last backup behind 2 strikes (`STRIKE_LIMIT=2`, `src/ladder.js:47`), the money budget, and the time limit — `scripts/run-u.mjs` uses 4, the bundle runner (`src/run.js:245`) uses 3, which can only stop earlier. Whether `capRuns` belongs in the signed job is the deferred question. | |
    | L8 | Context-headroom meter | BACKLOG (undecided, not immediate) — never built, 0 overflows in 147 runs | |
    | L9 | Read compaction — bare-agent has the primitive (`Loop({trim})`, `node_modules/bare-agent/src/loop.js`), bareloop never wired it | BACKLOG (undecided, not immediate) — trimming breaks the prompt-cache prefix, saving unmeasured | |
    | L10 | Counting stale-slice serves — the stale-serve itself is BUILT and stays (`src/readshim.js`) | BACKLOG (undecided, not immediate) — only the measurement is backlog | |
    | L11 | H7 PDF/Word input | KEEP parked — re-open when a real job needs it | |
    | L12 | G4 tripwire (item 23; 0 of 4 litectx passes → scope the planted row) | KEEP | |
    | L13 | Item 12 (aurora run-time signature) | REMOVED — not a task; it clears itself at aurora's next run | |
    | L14 | Item 18 flake-name capture | DONE — the peer hold is void; run once at $0 under ~4x CPU load on `tests/watchdog.test.js`, `tests/ralph.test.js`, `tests/stall.test.js`; flake not reproduced (13/13 runs clean); item 18 closed. See FINDINGS F172. | |
    | L15 | Model-output truncation classification | KEEP, RULED — stays `provider-red` under F122's frozen "2A" tripwire (2nd paid occurrence → `effort:'low'` for sonnet + bring reclassification to hamr); not an open question | |
    | L16 | DeepSeek pricing default (F113) | KEEP as the estimated default, no rate tables of our own. MODEL SWAP: `deepseek-chat` is no longer served — pick V4.1 = `deepseek-flash` | 3374747, see F171 |
    | L17 | Job authoring still pinned to Anthropic: `scripts/run-author.mjs` hardcodes `PROVIDER_NAME = 'anthropic-api'` (line 77) for the scout and the drafter, and `scripts/run-interview.mjs` writes `provider: 'anthropic-api'` (line 281) into every draft | FIX, option A landed — authoring takes its provider from the job file (`draft.provider`, required, no default); `scripts/run-interview.mjs` requires `--provider` with no default (different from item 32, which freed only the judge) | 34ea54b |
    | L18 | Proof runs | KEEP — M7, plus M3's DeepSeek proof | |
    | L19 | hitl still shows to customers: `bareloop.context.md` (34 mentions), and the usage text of `scripts/run-author.mjs` / `scripts/run-interview.mjs` | FIX — remove from all customer-facing text; code stays | 314f0ca (+ 384f4ad test update) |
    | L20 | `src/index.js` exported 255 names; the test's marker check credited 86 as documented. Of the other 169, 91 were already described in the doc's prose but lacked a marker, and 78 were mentioned nowhere. | FIX, option A — document the names a user of the package needs; stop exporting the rest, so the public list is what the doc covers. Breaking change for anyone importing a removed name. | `6189eff` — 91 names got markers, 78 dropped from the root export (255 → 177), `tests/index.test.js` now guards both ways (every export documented, every documented name exported). |
    | L21 | 2026-09-13: an untracked/ignored subfolder inside a repo froze as `kind: 'repo'` holding none of Source's own files | FIX — refused as `source-untracked-in-repo` for now (ruling A, 2026-09-13); revisit option B (freeze it as a plain folder on hidden git) once M4 gives plain-folder jobs their own checks | 95c1948 |
    | L22 | First live confirm-turn fire: the model-invented "protection" it showed a person was one the close cannot check | FIX — protections now render from `classGuards`, never the model; the model returns `notChecked` instead | 2b45f09, see F174 |
    | L23 | Same live fire: a `questions` ambiguity the model raised honestly can be confirmed away on round 1 with no forced resolution, and the signed goal can drop a check both source answers asked for | PARTIAL FIX — the model's own `questions` now reach `accepted.openQuestions` on every accepting path (a related ledger bug fixed too), so the question is no longer silently dropped from the signed record; the confirm menu still lets "Confirm" bypass an unresolved question without forcing it (that half stays open). Fixed in code with tests, not yet proven live. | see F175 |
    | L24 | Same live fire: the revise ladder can keep a later revision that is structurally worse (a broken parser field) than the sound one it replaced | FIX — falls back to the newest measured-sound iteration (a real red/green verdict, never an instrument-stop) when the last one is unsound; `stop` unchanged; the swap is named in a new `fellBack` return field and shown at the readout. Fixed in code with tests, not yet proven live. | see F176 |
    | L25 | Exported bundles will be run on the same or a different repo: the resume / refusal wording for a bundle (`RAISE maxWallMs … that is a spec edit` and the preview's `RAISE the number(s) … first`, `src/userrun.js`) and what can change on an exported job | BACKLOG — designed when bundles are run that way; no code change now | |
    | L26 | Thinking per phase. TODAY (2026-10-16): the "Thinking on" tick covers the drafter and the judge only (off unless ticked); the run's scout, planner, steps and fixes send no thinking field, so deepseek-flash thinks on all of them. POC: all-off run mvao31e3 ended plan-red (two invalid plans); split run mvaoagnq (planner thinks, scout/steps/fixes off) went green at about half the cost and time of the thinking-on greens. A pre-registered 16-run SPLIT vs ON contrast (`docs/logs/2026-10-16-run-thinking-split-contrast-prereg.md`) decides the split; it also records strikes, fix rounds, replans and first-try vs retry output tokens (report only). | BACKLOG — "thinking on for retries" (first try off, a strike or fix retry on; code decides, never the model; the signed cap never moves): test only if the contrast shows split runs retry or fail more. RULED 2026-10-16: if the split is built, the "Thinking on" tick stays as an override escape hatch that turns thinking on for every part of the run. Both tested 2026-10-16 (F230 SPLIT, F231 RETRY): frozen rule said NO BUILD both times; thinking stays as today. Medium code jobs 2026-10-16 (F232): RETRY met the frozen faster-or-cheaper rule on both jobs → RECOMMENDED as the default for code jobs only (RULED 2026-10-16, option A; see v1.105 item 1) (tick = think everywhere); build waits for hamr's go after the release. | — |

    Fix branch: L1, L2, L3 (doc note), L4, L16 (model swap), L17, L19, L20 — one branch,
    reviewed and released on its own, BEFORE the M3 build.

Parked pending measurement: read compaction; stale-slice usage; context-headroom meter;
bundle-runner knob mirroring — now item 34's L7 (deferred), L8–L10 above.
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


### The rails-versus-freedom optimization principle (v1.83 — 2026-09-05)

hamr's ruling, recorded as doctrine for every future "should we add a rule" decision. The
goal is always to improve wherever there is an opportunity — with one standing caveat: in
bareloop, too many rules become a straitjacket. Every rule is a deterministic rail laid over
a probabilistic worker, and each rail removes one thing the model could have worked out for
itself. The product's value is in letting that probabilistic nature show inside a small set
of un-gameable rails (the arbiter), not in scripting the worker. Diminishing returns sit
right beside the straitjacket: the tenth rail buys less than the first and costs the same
freedom.

**The weighing, applied every time:**

1. **Measure the payoff first, $0.** A rule earns its place only against a measured dollar
   or colour figure (an archive read, a bench pass) — never against a plausible story about
   what the model "keeps doing." A phase's or habit's share is the CEILING of what a rule
   can buy, never the buy itself (F126).
2. **Price the freedom it removes.** Ask what the rail forbids that was sometimes right. A
   rail cannot tell a dumb instance from a smart one; the model can. If the forbidden shape
   is ever the correct move, the rail is a tax on every run to fix some runs.
3. **Prefer watching over ruling when an instrument exists.** If the bench or the loop can
   show whether the worker recovers on its own, run that first; building the rail first
   spends the instrument before it reads anything.
4. **Stop at diminishing returns.** When the next rail's measured payoff is smaller than the
   last one's, stop — the remaining spend belongs to the probabilistic side.

**Where it binds today.** G4 (item 23, `docs/logs/G4-SCOPING.md`): a candidate rail —
reject a plan that drafts a check-only step before any write step has run — is NAMED and
NOT BUILT. Payoff unmeasured beyond "3 of 6 litectx replans, on one job" and F123's 3.3%
gate-red-recovery share; the rail would forbid a sometimes-right cheap probe; and G4 is the
instrument that reads whether the loop recovers without it. It is re-weighed on G4's own
number, not before. This principle sits beside, not above, §3's design laws: the arbiter's
rails (close, budget, fence, merge) are never on this scale — they are the floor, not an
optimization.


### The panel starts and runs workflows; §4's "pure observer" is superseded (v1.84 — 2026-09-23)

hamr's scope interview for the panel (N6), recorded in full at
`.claude/stash/2026-09-22-panel-design-settled.md`: the panel is where he runs and starts
workflows, his management panel and observability surface — fills a job's requirements,
watches it live, replays at $0, browses previous runs, imports a run view-only, and holds
Settings. **§4's line "the panel is a pure observer of the spine" is SUPERSEDED.** The panel
starts and runs workflows, authors jobs through the interview, and holds settings. It is still
never an arbiter — it never signs, never accepts, never changes a budget; only hamr's own
click signs, merge stays human, and every budget/verdict check still runs inside the library
exactly as it does for the CLI today (`docs/product/PANEL-BUILD.md` §5, "the arbiter's hard
lines"). A pointer is added inline at §4's own line; the original prose stands otherwise
untouched.

**Ollama is re-admitted** to the provider table, reversing item 31.3's 2026-09-09 ruling
("anthropic, openai, gemini — drop ollama for now"). Item 31.3's own closed text is left
untouched; the reversal lives here. Re-admission answers item 31.3's own named hazard — Ollama
has no key and no bill, so every round through it prices at $0 through machinery that trusts a
price — by requiring Ollama's price always show as **estimated, never $0** in the panel's
Settings/providers table (the same estimated-price sign the panel already gives any provider
with no live price feed).

**The UI wording ruling** (`docs/product/PANEL-BUILD.md` §6, from the 2026-09-22/23 mockup
sessions): a run's check type is shown as `Check type` with value `deterministic` (internal
hard green) or `rubric` (internal soft green); a run's result is shown ONLY as a glyph —
`[✓]` passed, `[✗]` failed, `[▶]` running, `[·]` waiting. The internal colour words
green/red/soft-green are never shown anywhere in the panel.

**The keys file:** provider API keys live at `~/.config/bareloop/.env`, outside any repo
tree, with a chmod 600 warning shown in Settings. The panel's server reads this file; the page
itself only ever sees key variable NAMES and a found/not-set state, never a value — a job
spec's "key variable" field is a dropdown populated from the names in that file, never free
text. This is the panel's form of the standing secrets hard line (§1: secrets load from the
environment; they never enter the tree, the spine, the configs, or the ledger).

**The layering law:** panel HTTP handlers call the same `src/` library functions
`src/cli.js` commands call — one source, each layer calls the next inward, the panel adds no
logic of its own. The panel is built per `docs/product/PANEL-BUILD.md`, which holds the
measured gap between today's code and a panel and the rung-by-rung build plan (each rung its
own exit condition, per the build-ladder discipline this PRD already holds at §1).

### One runner: `bareloop run <bundle>` is a door to the run-u engine (v1.85 — 2026-09-29)

The exported-bundle runner no longer has a second execution path: `src/bundlerun.js` does the
bundle-specific $0 checks and hands the run to `src/userrun.js`, the engine `run-u` and the panel
already use, so keys, providers, the monthly limit, the watchdog and the readout are defined once.
Rulings (hamr, 2026-09-29): the watchdog ships in `src/` (F205); one close-fix cap (run-u's 4) for
every caller; a missing key is the engine's exit-2 refusal; a bundle green mints no bridge file;
`--door/--decide/--review-door` are not exposed on `run`; bundles resume
(`bareloop run <bundle> --resume <runid>`). The arbiter rules are unchanged (tighten-only
`--budget/--wall`, merge stays human, the bundleHash is the human signature). Detail: `CHANGELOG.md`
Unreleased, `bareloop.context.md` "The CLI".

### Customer-set price per key row (v1.86 — 2026-09-30)

hamr amends the "rates are the customer's responsibility / no passthrough" ruling (v1.80 item 1):
- The customer sets their own price on the key's row in `config.json`
  (`keys.<ENV NAME>.priceInPerM` / `priceOutPerM`), always per 1M tokens, in and out; both or neither;
  a bad value refuses the run at $0. There is still no built-in price list.
- No price set = the built-in guess, unchanged. A priced round is stamped `caller`.
- The price sets what the cap means; Settings advises entering the HIGHER bracket when a vendor
  lists two prices. The Settings field is deferred to the next UI part.
- Detail: `docs/logs/FINDINGS.md` F206, `CHANGELOG.md` Unreleased, `bareloop.context.md` "Settings".

### Panel P5: one way to start a run (v1.87 — 2026-10-02)

- Import is read only: a folder or bundle is viewed, never run in place; its one action is Start from this.
- Start from this replaces rerun: same job = only the source changed, no drafting, same hash; anything else is a new job.
- The "same job" track record comes from the runs the panel already lists; plan handover stays parked.
- One Stop ends a run as the resumable outcome `stopped` (arbiter-adjacent, ruled by hamr 2026-10-02).
- Resume is in the panel; a raised cap is a re-signed hash, prior spend stays folded.
- Every run shows an Ended block: a code-owned reason, the next step, and only the buttons the engine would accept.
- A resumed run is the same run: one id, one file (P5-R).
- Detail: `docs/product/PANEL-BUILD.md` addendum P5 and P5-R.

### Panel: Reuse workflow replaces "Start from this" (v1.88 — 2026-10-03)

- Reuse workflow is the same signed job on a new source: green runs and imported jobs only, five open boxes (Source, Destination, Model, $ cap, Time cap — Model opened 2026-10-04), the rest locked and refused by the server, never drafted. (SUPERSEDED 2026-10-15 by v1.101.)
- Same-job identity is `workflowKey` (the signed spec without source, fence, caps and the worker's provider/baseUrl/model); the signature hash is unchanged (it still covers all of them) and the person signs the new one.
- Detail: `docs/product/PANEL-BUILD.md` addendum 2026-10-03 and the 2026-10-04 Model ruling.

### Panel P6: repo jobs on a worktree, bareloop installs, Settings price, run names (v1.89 — 2026-10-05)

- A panel repo job runs on a worktree in the person's own repo (`.bareloop/wt/<runid>`), made at drafting start from the current commit; uncommitted edits are named, never included. Green leaves a branch to merge by hand.
- Secrets already in the person's repo are masked wherever bareloop records them, never a reason to refuse the repo (hard line #3 reworded).
- bareloop runs `npm ci --ignore-scripts` itself before any token; the agent never installs.
- Link login (cookie) was DROPPED by hamr 2026-10-06: the token stays in the page, as before.
- Settings: price in / price out per key row (per 1M tokens), and an Open keys folder button in place of the path.
- Runs of one job are named `run-N` (oldest first, one server-owned number); a panel-authored run shows its drafting as the first part of its views.
- Detail: `docs/product/PANEL-BUILD.md` addendum 2026-10-05 P6.

### Panel: the run page — Edit in chat, Resume on the Chat card, read-only Job tab (v1.90 — 2026-10-08)

- Edit in chat is offered on every ending that is not a real green; it opens the Chat card filled from the signed job, every box open, drafting as a new job.
- Resume moved from the run's Job tab to the left Chat card (RESUME mode, only the two caps open); the Job tab is read-only on every run.
- A stopped run wears `[■]`; failed and capped stay `[✗]`, died stays `[?]`.
- Only a run that earned its green is a reuse source: `already-green` offers Edit in chat, the Reuse picker lists real greens only, and the server refuses a reuse of any other run.
- One cap rule (`capKindOf`) reads capped on every surface, including a leg that ended `escalated` on a money or wall halt.
- Detail: `docs/product/PANEL-BUILD.md` addendum 2026-10-08 run page.

### Drafter thinking off; next panel part — Settings providers list (v1.91 — 2026-10-11)

- Drafter thinking is OFF by default for every drafting call (panel and CLI); worker and judge unchanged. Decided by the pre-registered contrast (`docs/logs/2026-10-10-drafter-thinking-contrast-prereg.md`). A drafter try cut off at the output cap counts as a failed try for the try-3 question gate.
- NEXT panel part, Settings providers list: one line per API key per model, filled from the provider's free list-models call, with a Refresh button; a typed name when the list call fails.
- A "Use" tick per model; ticking REQUIRES both prices (in/out per 1M tokens); an unticked model may have none; a local model may be priced 0/0, typed explicitly. Prices move from per-key to per-model (an existing per-key price carries over to that key's current model, ticked).
- Only ticked models appear in the Chat Model dropdown, named "provider · model". The Claude-named tiers (sonnet/haiku) leave the model choice; ticking Opus in Settings is the person assigning it, the agent never picks a model.
- "Thinking on" is a per-run tick box in CHAT, default off, a knob for extra-hard jobs; NOT in Settings; drafting only for now (hamr correction 2026-10-11). The per-shape on/off translation belongs to bare-agent (`docs/product/UPSTREAM-ASKS.md`, BA-28); bareloop only asks on/off. Until bare-agent ships it the box works for deepseek-flash and shows "can't change this for this model" otherwise, never pretends. bare-agent's `thinkingSupport(provider, model)` decides the box: false → greyed out, true → works, 'unverified' → allowed, bare-agent fails loudly if the model refuses (BA-28).
- Settings is the only place for available providers, prices and the model list; no hardcoded base URLs, vendor-by-host rules or per-model lists in code (hamr 2026-10-11, confirmed for bareloop).
- Supersedes, for the panel: "no price → run as estimated" (a ticked model is always priced). Key values never reach the page.
- Work order after the job-block release: (1) providers list, (2) file readers (.docx, .xlsx), (3) rubric on plain folders (+ flight search); the judge false-red classes from the JSDoc rubric run stay parked until (3).
- The spec for (1) is written and shown to hamr before any build.

### Settings > Providers from fwdloop, Thinking on tick, no hardcoded vendors (v1.92 — 2026-10-11)

- Built per `docs/product/PANEL-BUILD.md` "Addendum 2026-10-11 — P8" (all open questions ruled by hamr 2026-10-11): the Providers page is rewritten from fwdloop's layout; config holds per-key `{shape, baseUrl, legacyMaxTokens}` and per-key model lines `{model, use, inPerM, outPerM}`; Balance is removed.
- A job carries its own model; a run works on a ticked, priced Settings line; a key is its row's own variable name; an older spec names its line at run start with `--model` (hash untouched).
- "Thinking on" is a signed per-job tick (drafting and the rubric judge; never the worker); bare-agent owns what each model can switch.
- Code names no provider, model, address or price (grep test with a reasoned allow-list); `JUDGE_MODEL` is no longer exported.


### Stay public; work order; the CLI runs exported jobs only (v1.93 — 2026-10-12)

- bareloop and fwdloop stay PUBLIC (Apache-2.0, npm). hamr: "i think i will keep it public".
- Work order (supersedes the 2026-10-11 "Work order after the job-block release" line above, which stays as written): (1) ship P8 Settings > Providers (`feat/settings-providers`, `docs/product/PANEL-BUILD.md` P8); (2) rubric on plain folders + flight search: first an interview with hamr to RULE the R0–R12 rubric job shape (still DRAFT, above), then the barebrowse search step (H6: read, type, click; never submits a payment or booking), then a flight-search job run green on DeepSeek; file readers (.docx/.xlsx) are built only when a job needs them; (3) Export in the UI + the CLI shrink.
- The CLI is a runner for EXPORTED jobs, not a second door. hamr: "cli is meant to run an exported job, you create in ui, export it … and then you can run it without ui, can add more time/money if it stops and look into logs, further than that you import it, meant to run repeatable shape jobs on cli where you can only change inputs/destination, cap and time."
  - CLI = panel launcher + run a bundle (change only inputs/destination, $ cap, time cap) + resume with more money/time + logs. No CLI/UI parity; anything else = import into the UI.
  - CLI drafting (interview / author / run-author) is removed in part (3).
  - PROPOSED, not ruled: the bench moves out of the shipped package to `scripts/` (to be confirmed in part (3)'s interview).
  - UI Export is MISSING today (panel Import is read-only; export is CLI-only) and is built in part (3). It mirrors the Reuse workflow card (the same four open boxes).
  - A bundle names its model; the CLI finds the key through the Settings rows; a missing row stops at $0 in plain words.
- [ ] Open: the Export UI shape (interview before spec). [ ] Open: the bench move.
- Rulings: memory (stay public; work order; CLI runs exported jobs).

### Rubric job shape ruled (v1.94 — 2026-10-12)

- The R0–R14 draft and its 5 open questions are ruled; the rulings are in item 33, "2026-10-12 — rubric job shape RULED". Next in work order (2): the build spec for the rubric job + the barebrowse search step, shown to hamr before any build, then a flight-search job run green on DeepSeek.

### Rubric gate and backlog (v1.95 — 2026-10-12)

- Rubric jobs read, search and write; they never act on the world. The browse gate (bareguard primitives) refuses clicks/presses on pay/book/buy/checkout/purchase/reserve/confirm and on send/submit/sign up/post, and typing into card fields; the only form left is a search box (hamr, 2026-10-12). Sending, booking and anything needing a person mid-job is fwdloop's; booking runs in fwdloop from a bareloop green.
- bareloop requires Node 22 (barebrowse needs it; Node 20 is end-of-life).
- README rewritten to the deterministic / rubric split and the bareloop / fwdloop line (hamr-approved text).
- Backlog: scheduled watch jobs. The spec's `cadence` field (hour/day/week) exists, but nothing runs a job on a schedule yet; price and news watch jobs need it. → replaced by v1.99 Triggers (below).
- Backlog, needs its own ruling: jobs that need the person's login or cookies (bank pages, members-only prices). Out of scope until ruled.

### Required facts for rubric jobs (v1.96 — 2026-10-12)

- A rubric job's checks come from required facts drafted from the job line and `~` rules and signed on the card; every answer is quoted and shape-checked in code (bareguard `^0.22.0` `cited` + `decides`), not chosen by the worker. Rulings RF1–RF17 are in item 33, "2026-10-12 — required facts RULED"; this closes F223 by design once built.
- Prose steps stay free text, shape-checked, content "Not checked" and judged at Accept; numbers in prose must equal an earlier checked fact. Superlatives and inexpressible rules go to Not checked in the person's words.
- Facts of one result share one quote; a shape-only check and a `text` shape are asked of bareguard, the build waits for them.
- Every word a check depends on is found in the real source at drafting (files at $0, web search with one small drafting search) or drafting stops and asks the person to change or remove the rule.
- Before signing, every check is tried on the real source: found in each record, one value per record, and red on a code-broken copy; a check failing any of the three cannot be signed.
- Later piece, its own build after required facts: "rerun from line N" on green runs only (earlier outputs byte-for-byte kept, spend folded, tighten-only).

### Look, then say what I can check (v1.97 — 2026-10-13)

- Drafting no longer grades: it checks each fact CAN be checked (label + value of its shape, or the phrase, found once in the real source). Record cutting and the three early tests are dropped (RF15 superseded). Rulings RF18–RF22 in item 33, "2026-10-13 — look, then say what I can check RULED".
- The AI looks with read-only search tools, using the person's words, words that mean the same, and what it knows; code proves every word it reports is really in the source.
- A rubric input may be a pasted URL, fetched with barebrowse at drafting (for the look) and again at run start; the close grades against the run's own saved copy.
- Work order (hamr, 2026-10-13; supersedes the order above where they differ): (1) finish Part 1c on `feat/rubric-search` (`docs/product/ITEM33-BUILD.md` Part 1c), live proof, /code-review, /release; (2) NEXT: P9 one runs list (`docs/product/PANEL-BUILD.md` P9, mockup `design/runs-list-mock.html`) on its own branch, built only after (1) is released; (3) then "rerun from line N" (RF8), then the remaining items of the order above.

### Page words, site reach, money forms (v1.98 — 2026-10-14)

- A rubric flights run failed on two drafting picks: a money form the page does not use ("$" where the page writes "US dollars") and a time label that repeats inside one record ("at"). See F228 and `docs/product/ITEM33-BUILD.md` (Part 1c, idea A addendum).
- bareguard ^0.24.0 is adopted (money currency and unit may be lists, ruling #65). bareloop facts still carry one form; allowing lists in facts is a schema change and hamr's call. OPEN. See F228.
- Idea A (DRAFT, not signed): the AI maps each job line and `~` rule to THIS page's own words; code keeps only words found on the page and decides; the AI never grades. The frozen code rules held on an unseen Google Flights page; a "number then marker" price layout is not read yet. See F226 and the `ITEM33-BUILD.md` idea A addendum.
- hamr ruling 2026-10-14: no per-page patches; test idea A on the most-used sites only.
- Site reach: most of the busiest travel and shopping sites block barebrowse. A barebrowse matter, not patched in bareloop. See F227.
- Work order (hamr, 2026-10-14; supersedes the order above where they differ): release `feat/rubric-search` as is (self-review, then branch-review, then release); then P9 runs list on its own branch; then idea A on its own branch after its spec is signed.

### Triggers: jobs that start by themselves (v1.99 — 2026-10-14) — copied from fwdloop M9 — SIGNED 2026-10-14

Status: SIGNED 2026-10-14. Nothing here is built. Rulings are marked RULED (hamr, 2026-10-14). Pointers are to fwdloop v0.19.1 (main 845b955), `docs/wiki/the-module-ladder.md` (M9, lines 2217-2273; M11 am3, line 2315) and its `src/`. Copy is by rewrite, never import (item 29). Amends item 33 (dated pointer added there); item 33's text is not rewritten.

**Why (hamr, in his words).** "Helpful for deterministic issues to fix, or monitoring a queue to fix issues in a certain repo, for rubric, research on something or monitoring something everyday."

**Work order (RULED).** P9 runs list, then triggers in full, then rubric work.

**The line stays.** A signed job may repeat on a clock or a queue. No human mid-run. No sending, no booking. Asks and sends stay fwdloop's.

T1. **Kinds (RULED).** Clock: daily, weekdays, one weekday, each at HH:MM local. Typed data, never cron text (fwdloop `src/trigger-line.js:29`, `src/trigger-clock.js:33`). Queue (a): a folder, new file arrives, or a file is updated (`src/trigger-files.js:128`, `docs/wiki/the-module-ladder.md:2233`). Queue (b): tickets, see T20, a later piece.
T2. **One field (RULED, decided after reading code).** The spec already carries `cadence` `{unit, every}`: required by the validator (`src/job.js:281-289`, `JOB_FIELDS` at `src/job.js:171`), filled with a default day/1 by the panel (`src/panel/authorsession.js:948`) and the interview (`src/interviewrun.js:693`). Nothing reads it; nothing ever ran on it. It is REPLACED by `trigger` (null = by hand). RULED (hamr, 2026-10-14): old jobs keep `cadence` and read as "by hand"; new jobs write `trigger` instead; old signed specs never re-hash or need re-signing. One field, not two. The validator stops requiring `cadence`; an old signed spec that still carries it reads as by hand and is never written again.
T3. **Gate (RULED).** A job takes a trigger only after one green run (fwdloop item 1, line 2228). A rubric job must have been ACCEPTED once at the review door first (`src/reviewdoor.js:48`, `doorRecordOf`). Cancel is never refused (RULED, copied from fwdloop).
T4. **Signed (RULED).** The trigger is part of the signed hash. The agent never sets it. Changing or cancelling it is two clicks, $0, no drafter, the same plan re-signed (fwdloop item 2 and am5, lines 2229, 2257-2261; `src/panel/authortrigger.js:246`).
T5. **Edit clears it (RULED).** Editing the job clears its trigger back to by hand. It can be set again only after the new job has a green run (fwdloop am1, line 2241). (SUPERSEDED 2026-10-15 by v1.100.)
T6. **Only while the panel is open (RULED).** (added 2026-10-14 from fwd lessons: the page's visibilitychange catch-up tick is the PAGE poll, not the scheduler; provider-red retries for a fired run: none unless hamr rules, open choice 6.) Nothing fires when it is closed. Missed slots collapse to ONE catch-up run, marked catch-up in history; a run more than 2 minutes late is a catch-up (fwdloop item 3, am2: `src/trigger-clock.js:24`, `:94`, lines 2230, 2242-2245).
T7. **One live run at a time per job (RULED).** (added 2026-10-14 from fwd lessons: with the door not counting as busy, a folder of N files starts N runs back to back, all waiting at the door, and only the monthly limit stops them. Asked of hamr; see the build spec, open choice 7.) A fire while a live run exists starts nothing and writes a `busy` row. A rubric run waiting at the review door is NOT live: the next run starts anyway (differs from fwdloop, where a waiting ask blocks, `src/panel/authortrigger.js:308`).
T8. **Money (RULED, hamr: "you set cap with schedule run and it uses that, don't complicate it").** The person sets the $ cap and time cap when scheduling. Every fire uses exactly those. Every fire is checked against the monthly $ limit like a hand run (`src/monthly.js:369`, `checkMonthlyRoom`; same check as `signRun`, `src/panel/authorroutes.js:374-394`). If the month cannot fund the cap: a `monthly-exhausted` row, nothing starts. No per-day counts. No new refusal of estimated prices beyond what a hand run already does.
T9. **Source and Destination (RULED).** Set when the schedule is set, like Reuse's open fields (`src/panel/authorsession.js:233`, `REUSE_OPEN_FIELDS`). A scheduled run may read from a different source path than the green run. The destination may be the same. Delivered files keep the dated, never-overwrite name. For a folder queue, the arriving file is the input.
T10. **Learning stays quarantined (RULED).** A scheduled green counts toward Reuse and learning only after the person's Accept, like today's rubric greens. Reuse's green check (`src/panel/authorroutes.js:265-269`) is unchanged.
T11. **Files (copied).** (added 2026-10-14 from fwd lessons: "Any content whose sha256 was in the folder at arm never runs, under any name." "A dropped queued file MAY re-arrive; only a RAN sha (and a baseline sha) is blocked for good." A poll watcher, never `fs.watch` (EMFILE on hamr's machine).) File updated: runs when the sha256 changes, using the new version. New file: each new file runs once with that file as input. A sha that already ran never runs again. A file still being written waits until its size and mtime stop changing for 2 polls (`src/trigger-files.js:27`). What is there when the trigger is set never runs (fwdloop am2 item 2, line 2245). Baseline blocks by sha only, for good, on New file (`src/trigger-files.js:58`).
T12. **Queue (copied).** (added 2026-10-14 from fwd lessons: ONE append-only ledger per job, every row carrying the signature hash, never a new folder per re-sign. A re-sign that CHANGES the folder or the kind does not carry the queue: it is written as dropped-with-reason. It is carried over only when folder and kind are unchanged. The scheduler is the only writer of arrived/ran rows.) Arrived files queue, oldest first, one run at a time. A file arriving while busy gets ONE `busy` row and waits. The ledger is on disk, so a restart keeps the queue. A queued file deleted or changed before its turn is dropped with a reason (fwdloop am3, lines 2246-2253; `src/trigger-files.js:64-82`).
T13. **Kept fwdloop v0.19.1 fixes.** (added 2026-10-14 from fwd lessons: told once = "once per sha|outcome|why"; last outcome = "only rows under the current signature hash".) Content-hash only baseline. A refusal is told once per key sha|outcome|why (`src/panel/scheduler.js:46`). The last outcome counts only the current signing (fwdloop lines 2269-2272).
T14. **Panel (RULED).** (added 2026-10-14 from fwd lessons, found by hamr clicking: after a sign there is no Run / Run now button or invite; the two-click Sign / Confirm shows a visible change on each click and the card clears after click 2; a spawning fired run shows [▶] starting, never [?]; a used-up month turns NEXT red; the button placement and words are copied exactly, see PANEL-BUILD.md addendum 2026-10-14 T, Part 7.3.) A `Scheduled (N)` section after Needs you in the runs list (signed design: the Scheduled section in `design/runs-list-mock-v2.html`; P9 leaves the empty slot; fwdloop `src/panel/data.js:1229`, `listScheduled`). A `Schedule run` button on the Run tab that becomes `Cancel / modify schedule` (M11 am3 item 1, line 2315). A SCHEDULED / NEXT block at the top of the run page (`src/summary-words.js:35`, `:89`, `:111`). All words come from code, never the model.
T15. **Fire order (copied).** busy, then monthly, then refused (an input, the keys or the model is missing), then started through the one start path (`src/panel/authortrigger.js:291-337`). Each outcome is one row. A refused fire says why in plain words and spends nothing.

**Built-in fixes. These are fwdloop bugs, not to be copied (RULED).** Each has a name in the fwdloop fix ledger, `.claude/remember/fix-ledger.md:31-46`.
T16. (added 2026-10-14 from fwd lessons: "the ran row is written only after the starter accepts; a refused start writes no ran row and at most one told row per key".) Write the `ran` row only after the starter says it would accept, never before. fwdloop wrote it first (`src/panel/scheduler.js`, `beforeStart`; ladder line 2273), so a refused start marked the file run; its fix was reverted because a persistently refused start wrote about 7,200 rows an hour.
T17. Skip a torn ledger line AND start each append on a fresh line, in ONE commit. Either alone is wrong: skip-only lets a torn line glue the next `ran` row and run a file twice (`src/trigger-clock.js:118-127`, `src/trigger-files.js:30-39`).
T18. A trigger re-sign carries its queue over. fwdloop opened a new ledger folder per re-sign and orphaned waiting files (`src/panel/authortrigger.js:51`).
T19. (added 2026-10-14 from fwd lessons: a pid check must guard against pid reuse, by process start time or a heartbeat.) The busy check is cheap per tick: read the live pid in `runs.jsonl`, do not build a run context per run (fwdloop measured about 2 s of work per tick at 100 runs, `src/panel/scheduler.js:50`). "Since this signing" is keyed by the signature hash, never wall-clock (`src/panel/authortrigger.js:350`).

T20. **Tickets, e.g. GitHub issues (NEW, not in fwdloop; its own later piece; OPEN).** Not designed here. Questions for hamr:
 a. How are issues read: the tracker's API, or a barebrowse page?
 b. Which ones: all open, a label, an assignee?
 c. One run per issue, or one per batch?
 d. What marks an issue done: a green run, the issue closing, a label?
 e. Network and auth: a token from the environment only, never in the tree, spine or ledger (Hard lines).
 f. Write-back to the tracker (comment, label, close): none unless hamr rules it. Default is none.
 g. Where the fix lands: a work branch, as repo jobs do today. Merge stays human.

**Tests (to build).** Mirror fwdloop's `test/m9-*.test.js` by name: `m9-trigger-grammar`, `m9-clock`, `m9-files`, `m9-trigger-set`, `m9-trigger-fire`, `m9-trigger-ledger-fixes`, `m9-am3-queue`, `m9-am5-schedule-buttons`, `m9-summary-words`, `m9-summary-card`. Plus two new: (1) a persistently refused start writes a bounded number of rows; (2) a torn line is skipped and the next append does not glue. Each must fail first.

**Exit.** Self-review and branch-review run BEFORE any exit signature (fwdloop skipped them; ladder line 2266). Then a live walk on hamr's real panel: a clock fire, a folder file fire, a duplicate file ignored, busy, a monthly refusal, a catch-up, queue order, cancel. A rubric job walked through Accept, then scheduled. Not claimed done until hamr clicks through it himself.

**Open for hamr's word.** (1) T2: drop `cadence` from the validator, so old specs re-hash? Proposed: tolerate and ignore. (2) T20 answers a-g, later. (3) T7: confirm a job waiting at the door lets the next scheduled run start while the earlier accept is still open.

### Edit makes a new workflow; edit never clears a schedule (v1.100 — 2026-10-15) — RULED

Replaces T5 ("Edit clears it"). Same model as fwdloop M6 am5 (signed 2026-10-15). hamr's word: "go A".

1. Editing a job NEVER clears its schedule. The old workflow's runs and schedule are untouched; old `edited` ledger rows still read, new ones are never written.
2. Edit in chat opens the Job name box as `<origin-name>-N`, N the next free number from 2 (free = no run-list job of that name and not taken in the jobs dir). The box stays editable. An origin that already ends in `-<digits>` still gets the suffix appended (`x-2` becomes `x-2-2`); the base is never guessed. (SUPERSEDED 2026-10-15 by v1.101.)
3. At sign, if the signed spec's workflow key (with the job name set back to the origin's) equals the origin's, the run signs under the ORIGIN name, a new run of the same workflow. If the keys differ it signs under the card's name, a new workflow. A card name already used by another panel job, or the origin's own name on a different workflow, is refused at $0 in plain words ("A job named "x" already exists and is a different job. Pick another name."). (SUPERSEDED 2026-10-15 by v1.101.)
4. A new workflow is not schedulable until its own first green: the T3 gate (`greenFor`) is per job name, so nothing is built for it.
5. Reuse workflow (green runs) is unchanged and the two doors are not merged. (SUPERSEDED 2026-10-15 by v1.101.)

Two doors stay: Reuse on green ($0, no drafting, proven plan), Edit on non-green (drafts again). (SUPERSEDED 2026-10-15 by v1.101.)

### One door: Reuse workflow on every run (v1.101 — 2026-10-15) — RULED

Replaces v1.88's "five open boxes, the rest locked and refused by the server" and v1.100's Edit-in-chat door and key-compare fold. hamr's word: "go". Same model as fwdloop M6 am5; fwdloop told 2026-10-15 to align.

1. ONE button on every run's Run tab action row, **Reuse workflow**. It replaces both the green-only Reuse workflow and Edit in chat. Edit in chat is removed from the page, the server and every code-owned word.
2. It opens the Chat card with EVERY box open and prefilled from that run (job lines, `~` rules, check type, judge examples, thinking, inputs, destination, model, $ cap, time cap). Nothing is locked; the server no longer refuses a changed job box.
3. The path is decided by comparing the CARD's job boxes with the origin run's, never the drafted spec. Job boxes = job text (numbered lines, `~` rules, `~ PASS`/`~ FAIL`), check type, thinking. Run boxes = inputs, destination, model, $ cap, time cap (they never decide it).
4. Green origin and no job box changed: today's Reuse exactly (signed plan verbatim, no drafting, $0 before the run), signed under the ORIGIN name, a new run of the same workflow.
5. Any job box changed (green or red origin): drafting runs, a NEW workflow named by the Job name box. Red origin and no job box changed: drafting runs (an unproven plan is never reused), signed under the ORIGIN name (another try of the same job).
6. The Job name box shows the origin name while no job box is changed; the moment one changes it switches to the next free `<base>-N` (renamable); changing back restores the origin name. Base: when the origin ends in `-<digits>` and the part before is itself a job (run list or jobs/), that part (`x-2` suggests `x-3`, never `x-2-2`); else the origin. A name owned by a different job, or the origin's own name on a changed job, is refused at $0 in plain words. A name typed while nothing is changed is ignored: the origin name is forced.
7. The cost shows before the click: the one main button reads **Sign & run** while the Reuse path applies and **Start drafting** otherwise, flipping live as the person types. The origin line says where the card came from ("Reuse: <job> (run-N)").
8. A new workflow still has no schedule until its own first green (`greenFor`); a schedule is never cleared by any of this. An imported job counts as a green origin (Import stays read-only, its one action is Reuse workflow). The schedule card alone keeps its job boxes locked.
9. Already-green counts as green for Reuse (RULED 2026-10-15).
10. Schedule run and Cancel / modify schedule never start a run; they only set or adjust the schedule (RULED 2026-10-15).

### Schedule shown on Run, Job and Audit (v1.102 — 2026-10-15) — RULED

Items 1-4 copied from fwdloop M9 am6 (signed 2026-10-15); item 5 is bareloop's one block. Aligned with fwdloop M9 am7 (signed 2026-10-15): the formats below are am7's.

1. Job tab, **Started** row under Model: `By hand · 10/15 13:46`, `By the schedule: every day at 08:15 · catch-up, 10 min late · 10/15 13:46`, `By a new file: 8een.md · …`, `By a file update: aging.csv · …` (the run's local start time last), read from the run's own `trigger.json`.
2. Job tab, **Schedule** row under Started: the job's schedule now and what it is bound to (`every day at 08:15 · from run-7 · deepseek-flash · ~/bareloop-out`, or `none`). Its first part is the Run tab's SCHEDULE line from the same word owner (`scheduledWords`), so they cannot disagree.
3. Audit, first row of a run a schedule started: `started by the schedule · every day at 08:15 · slot 08:15 · from run-7` (+ ` · catch-up`), or `… · new file 8een.md · from run-3`. A hand run has none. (SUPERSEDED 2026-10-15 by v1.104.)
4. Audit of the run the schedule was set from: a folded `▸ schedule (k)` group above drafting, the last 7 fires that started nothing (busy, month used up, refused), newest first, local `MM/DD HH:MM` and plain words. Scope: rows of every signing whose `signed` ledger row names this run as its origin (plus the current schedule's own origin). (SUPERSEDED 2026-10-15 by v1.104.)
5. Run tab: ONE summary block, the same shape every time. `ENDED  MM/DD HH:MM · <outcome word> · <reason>` and `NEXT` (a finished run only), then `SCHEDULE`: line 1 the schedule words or `By hand`; line 2 (scheduled only) `last <MM/DD HH:MM> · run-N · <outcome>` (+ ` · catch-up`) `· next <Day MM/DD HH:MM>` (clock) or `· next: waiting for a new file`. A running run still shows SCHEDULE. The old SCHEDULED/NEXT twin block and the "why this run started" note are gone.
6. A problem (the schedule's last fire started nothing: busy, month used up, refused) turns the SCHEDULE row (label and both lines) AND the block frame red, existing red token, both themes; line 2 becomes `last <MM/DD HH:MM> · <reason> · next: fix it in Cancel / modify schedule`. The next good start puts it back to normal.
7. (hamr "yes to all", 2026-10-15) SCHEDULE line 2 also says ` · waiting for your Accept (the next run does not wait)` after the `last` part when a run of the job waits for Accept (not red); month used up reads `last … · month used up: $0.01 left, needs $0.50 · next: raise the limit in Settings, or it starts on the 1st` (red). Busy is NOT a problem (`last … · busy: a run of this job was still going · next …`, normal colours). While the install back-off is still retrying the row is not red and ends `next: tries again in N min`. Only a refusal that is not retrying (`next: fix it in Cancel / modify schedule`), the 60-minute give-up and a used-up month are red; a later good start clears it. This supersedes item 6's "busy" in the problem list.
8. Month used up is red only in the month it happened (RULED 2026-10-15).
9. Busy says still working; before the first fire `no run yet`; unarmed ends `next: not armed yet` (matches fwdloop M9 am8, RULED 2026-10-15).

### Remove from Needs you (v1.103 — 2026-10-15) — RULED

Matches fwdloop DRAFT M11 am11 items 3-5 (bareloop keeps the Accept tag; no Reopen: an expired door cannot be reopened).

1. A run in Needs you with the Resume tag shows **Remove from Needs you**, last in its Run tab action row; a run waiting for Accept never shows it; Check cards are unchanged.
2. The click only takes the card out of Needs you (status, the runs-list row, Resume and Reuse workflow stay); one click, no confirm; it appends ONE `{runid, type:'needs-removed', at}` row to runs.jsonl that every reader ignores (run list, monthly accounting, scheduler busy, run counter); a second click or a stale page writes nothing.
3. Audit says `removed from Needs you by you · MM/DD HH:MM` (local); the 7-day auto-leave stays and its Audit line is `removed from Needs you after 7 days`.
4. A removal covers only the ending it was made on: a NEW stop after it brings the run back into Needs you.
5. `POST /api/runs/<id>/needs-remove` behind the same human/token guard as the other run routes; 409 in plain words when the run is not in Needs you or waits for Accept.

### Audit schedule section; names in the small lists (v1.104 — 2026-10-15) — RULED

1. The schedule is its own section at the top of the Audit of EVERY run of a job that has a schedule now, same look as the drafting and step sections, always folded when the page opens: `▸ schedule  [sign] new file in ~/bareloop-inbox · from run-1 · 2 tries started nothing` (the tail only when tries > 0). Unfolded: `this run  10/15 20:43  started by the schedule · new file litectx.md` (a hand run: `by hand.`; the origin run: `by hand. The schedule was set from this run.`; catch-up keeps ` · catch-up, N min late`) and `tries`, the schedule's fires that started nothing (busy, month used up, refused) of ALL signings of the job, newest first, at most 7, or `tries  none`. The head sign is [▶] only while a run of the job is running, [✗] when the SCHEDULE row is red, else [·] (one small rule, hamr may adjust). A job with no schedule now has no section; a run a cancelled schedule started keeps its one old `started by the schedule` line. Replaces items 3-4 of v1.102.
2. In Running now, Needs you and Scheduled only, a run's name reads `change2 · run-2` (job, middle dot, run-N); the Jobs list, Run tab title, Resume/Reuse text and search are unchanged.

3. Stopped [■] is grey: you stopped it, it did not fail (matches fwdloop; supersedes 2026-10-08 red).
4. Blink = running or waiting for your Accept; steady = resting (matches fwdloop glyphPulses; relayed from hamr via fwd 2026-10-15). The `schedule` head [·] is steady.
5. An old run whose saved job fails today's checks gets plain words on Reuse and Accept, never raw validator text (RULED 2026-10-15).
6. Stopped run's Run tab frame is grey too (RULED 2026-10-16).
7. Resume and Accept never show raw engine output: a known engine sentence or a fixed plain sentence with the log path (RULED 2026-10-16).
8. An Accept refused by its final checks names each failed check by its plain question (RULED 2026-10-16).
9. A replan answer cut off at its length limit is a bounded failed attempt in plain words, never "the model provider failed" and not resumable as provider-red; a cut answer is treated like a bad one on both tries (the first cut feeds the redraft one plain red, a cut redraft ends the run in the cut words); scout and the first draft are unchanged (RULED 2026-10-16, F229).


fwdloop asked to match (2026-10-15).

### Next after this release (v1.105 — 2026-10-16) — RULED, PARKED until v0.4x ships

These three items are the next work after the feat/runs-list release; none is built on this branch.

1. **Thinking on retries as the default (from F230–F233).** Spec:
   - Per model call, the engine decides from what it already knows (phase, attempt), at the worker Loop call sites in `src/planrun.js` (`mkWorker` ask/askFrom), passing bare-agent's per-call `thinkingMode`: planner (draft, redraft, replan) = no field (thinks); scout = 'off'; step attempt 1 = 'off'; step attempt 2+ = no field (thinks); close-fix = no field (thinks). Judge and drafter keep their own existing settings (off; the job's tick turns them on).
   - The job's "Thinking on" tick = think everywhere (an override escape hatch for hard jobs; RULED 2026-10-16).
   - Every call writes its decision to the spine (`thinking-decision {phase, iteration, mode}`), so a run's record shows what was sent; one test per phase/attempt plus a dropped-and-retried call.
   - Default applies to CODE jobs only (RULED 2026-10-16, option A), not every job: gain is measured on the longer code jobs. On the changelog job (change2) RETRY's median wall was 1.76 min vs ON 1.46 (ratio 1.20, over the 1.10 limit) with 17.5 turns vs 12, so the faster-or-cheaper rule says no there; the first rule (cheaper-only) had already failed on change2 in F231 before the 10%-tolerance rule was written (forking paths, named in the prereg and F233 §4). Other job kinds stay as today until measured.
   - Proven only on DeepSeek deepseek-flash (n=4 per arm, 4 jobs). Other provider shapes (Anthropic, OpenAI reasoning_effort, Gemini) are untested: say so in the build and check each shape's off-value in bare-agent's thinking-mode ladder before claiming it.
   - The POC lives in the throwaway copy `.claude/scratch/poc-engine` (src/planrun.js +14/-2): a graduation is a REWRITE in the product, not a copy.
   - Evidence: F230 (SPLIT, no build), F231 (RETRY on changelog, no build), F232 (RETRY on medium code jobs, frozen rule met), F233 (full record, turns). Pointer: PRD item 34 L26.
2. **Run tab summary shows the run's time.** The summary line `passed · $0.0047` becomes `passed · $0.0047 · 1m56s` (outcome · money · wall time of the run). Same time rule as elsewhere in the panel; an unknown time is shown as unknown, never 0. (hamr wrote "passed · $0.0047 1m56s"; the middle dot before the time follows the line's own separator — confirm with hamr when it is built.)
3. **A filter/search for the Scheduled list.** The Scheduled list gets its own filter/search box, like the Runs search (P9 v2), so a person with many schedules can find one. Exact matching rules are designed at build time with hamr (interview first).

### One branch: thinking on retries, Scheduled search (v1.106 — 2026-10-17) — RULED

Branch `feat/thinking-retries`, one branch, two parts, built in this order. Supersedes v1.105 items 1-3 where they differ.

**Part 1 — thinking on retries, for every job (RULED 2026-10-17: one rule for all, replaces option A of 2026-10-16).**
- Why one rule: thinking pays on hard calls, not every step; the planner is the hard part of a run, steps and fixes are mostly mechanical. One rule is simpler to explain and fwdloop can copy it.
- What it costs, said plainly: on the short changelog rubric job (change2) RETRY was 1.76 min vs 1.46 (20% slower) and $0.0178 vs $0.0171, at equal greens (4/4); the frozen rule said no there. hamr chose one rule anyway (2026-10-17). On the two medium code jobs RETRY met the rule (F232). n=4 per arm, DeepSeek deepseek-flash only.
- Per model call, decided in code from phase and attempt (never the model), at the worker Loop call sites in `src/planrun.js` (`mkWorker` ask/askFrom):
  - planner (draft, redraft, replan): thinks
  - run scout: off
  - step attempt 1: off
  - step attempt 2 and later: thinks
  - close-fix: thinks
  - drafter (drafting, before the run) and rubric judge: unchanged, off unless ticked
- The job's "Thinking on" tick = think on EVERY call above, drafter and judge included (the escape hatch for hard jobs, RULED 2026-10-16).
- Every call sends an explicit on or off through `src/thinking.js` (the one owner), the same mechanism drafting uses (RULED earlier, P8): bare-agent does its best to switch thinking per shape, and its `thinkingStatus` (applied | unsupported | ignored | unknown) is recorded per round, as drafting rounds record it. Only DeepSeek deepseek-flash is measured; other shapes say so through that status.
- Every worker call writes `thinking-decision {phase, iteration, mode}` to the spine before the call, so a run's record shows what was sent.
- An iteration that is not a whole number on a step or fix call is a thrown operator error, never a silent guess (closes the ledger idea on the POC's `roundIteration === 1`).
- Tests: one per phase and attempt, the tick, a model that cannot switch, a dropped-and-retried call (the retry carries the same decision), the non-number iteration.
- Out of scope: the planner plan-red rate (3 of 12 change2 plans, F230/F233) is measured, not fixed here; it stays an open ledger idea.
- Graduation is a REWRITE of the POC in `.claude/scratch/poc-engine`, never a copy.
- Proof: one live green code run and one live green rubric run on deepseek-flash, with their spine `thinking-decision` lines read back.

**Part 2 — run time on the Run tab top line: DROPPED (hamr 2026-10-17, B).** The SUMMARY headline already shows the run's time after its money (`passed · deterministic · $0.0047 · 1m56s`); bareloop keeps its own wording (`unknown`, `running 3m12s`), unlike fwdloop am21/am22.

**Part 2 — Scheduled is searched by the one search box, plus a ◷ chip (fwdloop M11 am17-am20, signed 2026-10-17).**
- Order top to bottom: Running now, Needs you, then the faint line, search box and chips, then Scheduled, then Jobs and the quiet fold. Only never-filtered sections sit above the search box.
- No separate Scheduled search box. The one search box narrows Scheduled cards by job name, along with Jobs; a run number or date narrows Jobs only.
- The result chips and the 7d/30d/all chips never touch Scheduled.
- New chip `◷` (hover and aria-label `scheduled jobs only`), the same size as ✓ and ✗: pressed, the list shows only Scheduled (Jobs and the quiet fold hide), the search narrows only Scheduled, and the count line says `showing N scheduled job(s)`; pressed again, back to normal.
- Running now and Needs you are never filtered or searched.
- Scheduled with no matching card draws nothing, header included; with ◷ pressed and no match, the list says `no scheduled job matches`.
- The faint line above the search box reads `search also finds Scheduled; ◷ shows only Scheduled`.
- Must fail when: a separate Scheduled search box is drawn; a Scheduled card shows above the search box; a job-name search leaves a non-matching Scheduled card; a result or time chip hides a Scheduled card; ◷ leaves Jobs shown; ◷ pressed and the count line still counts runs; ◷ smaller than the other chip symbols; a search or chip hides a Running now or Needs you card; ◷ with no match shows an empty list with nothing said.
- Check the words fit at 320 px (hamr's DevTools; barebrowse cannot emulate phone width).

**Part 3 — thinking shown in the Audit tab and the Job tab (RULED 2026-10-18).**
- Each attempt line inside an Audit part says the thinking it was sent, e.g. `attempt 2 [✗] · thinking on`; a part with one call (plan, scout) says it on its header line.
- The words are drafting's own (`thinkingRowText`, src/thinking.js, the one owner): `thinking on` / `thinking off`, and when bare-agent was not sure `thinking on (this model can't change it)`, `thinking off (the model thought anyway)`, `thinking off (not confirmed)`. Read from the run's `thinking-decision` and `thinking-status` spine records, never guessed.
- The Job tab gets a row `Thinking: on retries` (the default) or `Thinking: on everywhere (ticked)`.
- A run from before this branch has no thinking records and shows no thinking words.
- Must fail when: an attempt line shows a mode its spine did not record; a run without records shows any thinking word; the words differ from drafting's.

**Part 4 — the Audit schedule header matches the other part headers (RULED 2026-10-18).**
- Today: `▾ schedule [✗] when a new file arrives in ~/bareloop-inbox/ · from run-1 · 5 tries started nothing`.
- Becomes: `▾ [✗] failed schedule · when a new file arrives in ~/bareloop-inbox/ · from run-1 · 5 tries started nothing` (sign, word, name, then `·` parts), the word from the one status table (src/panel/status.js), never typed.
- Must fail when: the sign or word sits after the name; the word is not the status table's.

**Amendments (RULED 2026-10-18, hamr's click-through; F237, F238).**
- Part 3 amended: the Job tab shows Model and Thinking on one row like the caps, always shown: `on retries` or `always on` (the signed tick) for a run whose spine recorded `thinking-decision`, `—` for a run from before the thinking rule, never a guess from the tick (same as fwd M4d am28). The Audit tab still shows no thinking word for such a run.
- Part 4 amended: the Audit schedule header uses the part headers' dot and bold word (the one status table).
- The Job tab's "AI's summary" shows only the sentence the person confirmed, never the worker brief (`confirmedGoalOf`, src/rubricstep.js); a rubric brief with no confirmed sentence shows no summary row.
- Idea A RULED CORE ONLY: the AI page-word map, code keeps only page words, N2, R1, U1/R1L, S1, currency and unit lists, and every drop shown as Not checked with a plain reason. V4, R2/R2a-c, R3/R3U and page-level checks (pageClaims) are left out of the build, kept as frozen records. Build spec in ITEM33-BUILD.md (signed 2026-10-18, built on this branch); see F237, F238.

**Done when:** all parts built with tests; `npm test`, typecheck and build:types exit 0; the two live runs above green; hamr's click-through of Parts 2-4; then /self-review, /branch-review, /release.

**Part 5 — fwdloop's Audit tries and rounds (C), Run summary lines (F), one-line step cards (G), plus three gaps hamr raised (RULED 2026-10-18; SIGNED by hamr 2026-10-18, all 14 design choices as recommended).**

hamr's words: "copy fwd's C, F and G onto this branch — fit it in and adapt, what we have is good, cover the gaps, only the way they showed each try and calls was cleaner and other things on run summary, run cards below map." Source: fwd's `audit-rounds-lab` mock (A, B, D, E not picked). bareloop KEEPS its Audit/Run tab where it is good (part headers, status table, attempt thinking words, the Audit filter chips, legs, the schedule section, the drafting part). It ADOPTS: per-try lines with their checks and the files judged (C), two Run summary rows (F), a marker and one line on each step card (G). Words are bareloop's own: `src/panel/status.js` words and signs, `rubric`/`deterministic`, check questions from `stageQuestionText` (src/panel/server.js), thinking words from `thinkingRowText` (src/thinking.js). Real runs used below, read only: `mvdg1xo3` (red, flights-bos-ord, 71 model calls, 8 graded tries over two plan steps) and `mve5y8fa` (green, flight-idea1). Previews are drawn from the real code and spines (the panel server's own `getRunDetail`/`getRunRounds` output), not mocked.

*Defects found in today's code while drawing BEFORE (to fix in this part; they are not in the plan):*
- (D1) The Audit of a plan step with several tries prints every declared check as `· not run`, although the checks ran. `fullStageList` (src/panel/index.html, `buildAttemptsList`) zips `attempt.declaredStages` against `attempt.stages`, and for a plan step `stages` is always `null` (src/replay.js:1324 builds the attempt from `exitEvalDetail` only). So a try that ran both checks reads `#1 did it change any file? · not run`, `#2 line 1 — does its output pass the line's checks? · not run`. That is a false statement. Fixed by the per-try checks below.
- (D2) The ninth try of `mvdg1xo3` (second occurrence, iteration 4) began (`iteration-start` seq 173) and was cut off by the wall before any check ran. The Audit lists only 3 attempts for that occurrence, but its 34 calls include the 4th try's calls. After this part the try is listed as `try 4 · cut off before its checks ran`.
- (D3) The Run summary money reads `$0.18 (<$0.01 drafting)` and the run.log `spent $0.0054 ($0.0035 drafting)`: the bracket reads as "included", but the run's figure EXCLUDES drafting (run $0.0054 + drafting $0.0035 = $0.0089 in runs.jsonl, run `mve5y8fa`). See Q4.

### C — each try, its checks, and the files judged (Audit tab)

BEFORE (today, `mvdg1xo3`, step 1; Audit tab, part expanded; the CSS dot is shown as ●):
```
▾ ● failed  1 · write-flight-facts · 32 calls · 43 tools · 4m28s · $0.06 · ✗✗✗✗✗
  grep 22 · read 16 · write 5
  ▸ attempt 1 ✗ · thinking off
  ▸ attempt 2 ✗ · thinking on
  ▸ attempt 3 ✗ · thinking on
  ▸ attempt 4 ✗
  ▸ attempt 5 ✗
 (attempt 1 opened:)
  #1 did it change any file? · not run                  <- D1: false
  #2 line 1 — does its output pass the line's checks? · not run
  Round | Action     | Path             | Decision                   | Time
  5     | model call | —                | <$0.01 · 1006 tokens · 1.4s | 06:28:22
  5     | read       | input/flights.txt| allow                       | 06:28:22
  5     | read       | input            | allow                       | 06:28:22
  6     | model call | —                | <$0.01 · 3817 tokens · 1.1s | 06:28:23
  6     | read       | input/flights.txt| allow                       | 06:28:23
  7     | model call | —                | <$0.01 · 3378 tokens · 2.9s | 06:28:26
  7     | write      | output/steps/1.json | allow                    | 06:28:26
  8     | model call | —                | <$0.01 · 539 tokens · 2.2s  | 06:28:29
  showing 1–4 of 4
  check: red — check "line-1-flight-facts" red: close stage "line-1-flight-facts" failed:
  close: line-1-flight-facts: line 1: result 1, fact "DepartureWindow": the label "Departure time:" is not in the quote
  close: … (8 more lines of the same kind, all printed raw)
```
AFTER (adapted; rows marked `+` are new, everything above is still shown):
```
▾ ● failed  1 · write-flight-facts · 32 calls · 43 tools · 4m28s · $0.06 · ✗✗✗✗✗   [model]
  grep 22 · read 16 · write 5
+ tools: read 16 · grep 22 · write 5 · denied 0
  try 1 ✗ · thinking off · result 1, fact "DepartureWindow": the label "Departure time:" is not in the quote (+8 more)
+   1 ✓ did it change any file?  (1 file(s) changed under output/**)
+   2 ✗ line 1 — does its output pass the line's checks?  (9 reasons)  · from line 1 ~ under $450; not a red-eye; nonstop
+      ▸ the 9 reasons (the raw lines, one per row, wrapped)
+   output judged: output/steps/1.json · <size> · sha256 <first 4>…<last 2>     (new runs only)
  try 2 ✗ · thinking on · result 1, fact "Stops": the label "StaticText" is in the quote more than once (+8 more)
    …same shape (tries 3-5 folded alike)
  Round | Try | Action          | Path                | Decision                    | Time
  1     | 1   | model call      | —                   | <$0.01 · 1006 tokens · 1.4s | 06:28:22
  1     | 1   | model · read    | input/flights.txt   | allow                       | 06:28:22
  1     | 1   | model · read    | input               | allow                       | 06:28:22
  2     | 1   | model call      | —                   | <$0.01 · 3817 tokens · 1.1s | 06:28:23
  2     | 1   | model · read    | input/flights.txt   | allow                       | 06:28:23
  3     | 1   | model call      | —                   | <$0.01 · 3378 tokens · 2.9s | 06:28:26
  3     | 1   | model · write   | output/steps/1.json | allow                       | 06:28:26
  4     | 1   | model call      | —                   | <$0.01 · 539 tokens · 2.2s  | 06:28:29
  —     | 1   | check           | output/steps/1.json | ✗ 1 failed, 1 passed        | 06:28:29
  5     | 2   | model call      | …
  showing 1–20 of 80   [load more]
```
Green (`mve5y8fa`, step 1; one try, so no Try column noise is lost):
```
▾ ● passed  1 · write-line-1-flights-facts · 6 calls · 6 tools · 12.0s · <$0.01 · ✓   [model]
  grep 2 · read 2 · write 2
+ tools: read 2 · grep 2 · write 2 · denied 0
  try 1 ✓ · thinking off
+   1 ✓ did it change any file?  (1 file(s) changed under output/**)
+   2 ✓ line 1 — does its output pass the line's checks?  · from line 1
+   output judged: output/steps/1.json · <size> · sha256 <first 4>…<last 2>     (new runs only)
  Round | Try | Action ... (6 model calls, 6 tool rows, 1 check row = 13 rows: showing 1–13 of 13)
```
Human rows (a run with a review door, `mve5y8fa` ends at one): a last fold `▾ ● passed door · waiting for you   [human · ask]` whose rows are `—|—|human|output/steps/1.json|paused for you|20:33:32` and, once decided, `you accepted`, or `you said rerun: "<text>"`, or `paused`. There is no `you cancelled`: cancel is deleted (doctrine). The words are code-owned, one table.

*Data: what is already recorded, what is new.*
- Already recorded and used as is: model calls and their cost/tokens/seconds (`worker-round`, gate-audit `llm` rows), tool calls and allow/deny (gate-audit sidecar, `getRunAudit`), thinking per try (`thinking-decision`/`thinking-status`, Part 3), each try's checks as they ran (`exit-eval {step, iteration, results:[{type, pass, detail}]}`, src/planrun.js:3443, detail already scrubbed), which check ran (`check-run {name, verdict}`, src/planrun.js:2206), the full reasons text (the `detail` of the failing `check-passes` result, one `close: …` line per reason), the job line a check serves (`fromLine` in the signed `closeDecl`, read by the server from the resolved spec like `declaredStages`), the question words (`stageQuestionText`), the tool/denied totals (`behaviour`), the door (`review-door`, `door-decision`, `door-rerun`).
- Joined, not new: a try's checks = its `exit-eval` results in the order they ran; a `check-passes` result is named by the `check-run` record just before it (same iteration); a `tree-changed` result gets the code-owned words `did it change any file?` (the same words as the `files-changed` stage). The try line's gap = the first failing reason with its `close: <stage>: ` prefix removed (one function, `gapOneLine`, beside `stageQuestionText` in src/panel/server.js) plus `(+N more)`; the full list stays one click away, nothing dropped (today's raw `check: red — …` block moves under the failing check).
- NEW, to record: `output-judged {step, iteration, path, bytes, sha256}`. Emitted in `src/planrun.js` in the step's `judge()` right before the `exit-eval` emit (line 3443), once per file the try's `check-passes` check reads (for a rubric stage the one file `output/steps/N.json`, path from `STEP_DIR`/`stepFileRel`, src/rubricstep.js); `sha256` over the bytes as the check read them, `createHash` as in src/bundle.js. The file is overwritten by later tries, so it cannot be recovered afterwards. Content is never written to the spine (hard line). One place owns the words: a new `judgedFileLine()` in src/panel/server.js.
- NEW, derived from existing records but not shown today: the check row of the Round table (time and counts from `exit-eval`); the `cut off before its checks ran` try (an `iteration-start` with no `exit-eval`, D2); Try column and per-step round numbers.
- Old runs: no `output-judged` record means no `output judged:` line at all, never a guess; no gate-audit sidecar means the tool rows say `tool calls: no log saved` as today. Per-try checks work on every old run that has `exit-eval` (it is old), so `mvdg1xo3` and `mve5y8fa` render the check lines; only the judged-file line is new-run-only.

*Call sites.* `attemptsFor`/`enrichPartsWithStageKind` (src/panel/server.js) add `tries[]` with `checks[]` to each step part; `getRunRounds` (src/panel/server.js:1908) returns rows for the whole step with `try`, a step-local round number, a `check` row and `human` rows, 20 per page; `buildAttemptsList` and `renderRoundsPage` (src/panel/index.html) draw them; `renderAuditGroups` adds the `[model]`/`[human · ask]` marker and the tools tally row.

### F — two Run summary rows

BEFORE (today, `mvdg1xo3`, the SUMMARY box):
```
● failed · rubric · $0.18 (<$0.01 drafting) · 12m52s
model:   deepseek-flash (openai-api)
steps:   0 of 2 done · 1 replan
why:     step-variance — A step consumed a large share of the run … (full sentence)
close:   none — the run ended before any close ran
tools:   91 calls — grep 54 · read 28 · write 9
cache:   5 re-reads answered from memory · 34.7 KB not re-sent
```
AFTER:
```
● failed · rubric · $0.18 (<$0.01 drafting) · 12m52s
model:   deepseek-flash (openai-api)
steps:   0 of 2 done · 1 replan
why:     …unchanged…
close:   none — the run ended before any close ran
tools:   91 calls — grep 54 · read 28 · write 9
+ calls:  71 model · 91 tool · 0 denied
+ checks: 16 run · 8 passed · 8 failed (write-flight-facts tries 1-5, then tries 1-3)
cache:   5 re-reads answered from memory · 34.7 KB not re-sent
```
Green (`mve5y8fa`): `calls: 10 model · 9 tool · 0 denied` and `checks: 4 run · 4 passed · 0 failed` (two step checks, two outer-close stages). Nothing is removed: `tools:` stays (it names the tool kinds; `calls:` adds the model count and the denied count, which `tools:` never showed). `calls` counts spend-record rounds of the run's parts (`worker-round`, `judge-round`), not drafting. `checks` counts every `exit-eval` result plus every graded `outer-close` stage; the parenthesis names the steps and try ranges that failed, from the same `tries[]`. The old "checks N/M" headline stays withdrawn: this row says counts of what ran, passed and failed, never a fraction. Data: all already recorded; no new event. Call site: `renderRun` summary box (src/panel/index.html, the `box.innerHTML` block) fed by new `detail.callsLine`/`detail.checksLine` words made in `getRunDetailBody` (src/panel/server.js). Old runs without `exit-eval` show `checks: not recorded`.

### G — one more line on each step card (Run tab, under the map)

BEFORE (card of step 1 and step 2, `mvdg1xo3`):
```
1 · write-flight-facts   ● failed
32 calls · 43 tools · 4m28s · $0.06 · ✗✗✗✗✗
grep 22 · read 16 · write 5

2 · write-flight-facts (try 2)   ● failed
34 calls · 44 tools · 7m46s · $0.11 · ✗✗✗
grep 31 · read 9 · write 4
```
AFTER:
```
1 · write-flight-facts   ● failed   [model]
32 calls · 43 tools · 4m28s · $0.06 · check #2 line 1 — does its output pass the line's checks? · ✗✗✗✗✗
grep 22 · read 16 · write 5
+ 5 tries · last try: 1 check passed, 1 failed

2 · write-flight-facts (try 2)   ● failed   [model]
34 calls · 44 tools · 7m46s · $0.11 · check #2 line 1 — does its output pass the line's checks? · ✗✗✗
grep 31 · read 9 · write 4
+ 4 tries (the 4th cut off before its checks ran) · last try: no checks ran
```
Green: `1 · write-line-1-flights-facts  ● passed  [model]` / `6 calls · 6 tools · 12.0s · <$0.01 · ✓` / `grep 2 · read 2 · write 2` / `+ 1 try · last try: 2 checks passed`. The door card, when a door is open: `door · waiting for you   [human · ask]` / `last answer: none yet`, then `last answer: you accepted · 20:33`. fwd's `checks on the last try p/n` is NOT copied as a fraction (see the withdrawn "checks N/M" above); the words say passed and failed. The existing headline words already printed on line 1 (`check #2 …`) come from `attemptChecksLine`; today they are empty for a plan step because `stages` is `null` (D1), and they fill in once the attempt carries the per-try checks. Data: already recorded plus the C joins; no new event. Call site: `renderRun` card builder (src/panel/index.html, `listEl` loop) reading `part.tries`.

### Q1 — the confirm-card questions and answers are recorded and shown

What is true today: the questions the confirm model raises are answered one by one in `forceAnsweredQuestions` (src/authorflow.js:2380), handed to the drafter as `answeredQuestions` (`confirmedBlock`, line 1201) and written to `authored.json` `confirmed.answeredQuestions`, shown only by the CLI signing readout (`answeredQuestionLines`, src/authorreadout.js:138). They are NOT in the panel's `draft-log.jsonl`, so the Audit drafting part cannot show them (hamr's "recorded nowhere" is right for the panel and the log, wrong for `authored.json`). The try-3 answers (`answerQuestions`, src/panel/authorsession.js:1026) become `~` rules on their job line and are already signed in `jobLines` (`signedJobLines`), but the log keeps only `questions-dropped`.

Change:
- New draft-log events, `appendDraftLog` (src/draftspend.js): `human {no, kind:'human', question, answer, at, source:'confirm'|'try-3', line?}`, one per answered question, appended from the `ask` seam for `kind:'answer'` in src/panel/authorsession.js (the one place both paths pass) with the answer already redacted (`redactSecrets`). `readDraftSteps` folds them into the step's `humans[]`; `draftingTableHtml` (src/panel/index.html) draws a row per question under its drafting step: `you · <question>` and `you said: <answer>`. Wording code-owned, wraps (see phone).
- BEFORE (Audit drafting part, `mve5y8fa`): `confirm · 1 call …`, no trace of the two questions. AFTER adds under the `confirm` row: `you were asked: <question 1>` / `you said: <answer 1>` / `you were asked: <question 2>` / `you said: <answer 2>`.
- "you confirmed" on a fact: today a fact is marked `— AI's proposal — check it` when its number is the AI's (`aiProposal`, src/facts.js:215) and the mark is dropped by `settlePersonsWords` (src/rubricstep.js:636) only when every bound is in the person's line or `~` rules (its doc says "an answer they gave", but its code reads the line and rules only). A confirm answer is not passed to it. A confirm answer only counts for a fact if code can tie them: the model's `questions` are free strings with no fact name. So Q1 needs (a) the confirm schema's `questions` to carry an optional `forFact` (fact name) and `line` like `inputlook`'s `forRule`, validated by code against the facts, and (b) `settlePersonsWords` receiving the confirm answers as words the person said. A bound found in such an answer then loses the AI mark, and the fact row says `— you confirmed`. Two ways to carry the word (Design choice 4): a new signed fact field, or no new field.
- Hash: verified order. The declaration is settled by `settlePersonsWords` inside the authoring loop (src/authorflow.js:2953) BEFORE validation, the spec is assembled from the settled declaration, and `prepareSigning` computes `specHash` over that spec (src/panel/authorsession.js ~900, `state.specHash = signing.specHash`). So the confirm answers already change what the person signs before hashing, and a settle that now reads them changes the signed fact BEFORE the hash, never after. The draft-log rows are NOT part of the spec and do not touch the hash. A new signed `confirmed` field on a fact (option 4a) changes the spec shape: `FACT_FIELDS` (src/facts.js:21) gains a field, specs signed before cannot carry it and verify as before (absent field), specs after hash differently by design; that is a schema change and hamr's call. Try-3 answers are already in the hash as `~` rules.
- Must fail when: the drafting part shows a question with no answer or an answer with no question; an answer containing a secret shape is stored or shown unmasked; a fact is marked `you confirmed` when no recorded answer contains its bound; a fact whose bound only the AI made still reads `you confirmed`; an old session with no `human` rows shows any question row.

### Q2 — "fetching the page…" while the run starts

Today: Sign & run spawns `run-u` (src/panel/authorroutes.js:502); the runner lists its row (src/userrun.js:1572) and only then re-fetches each web input (`refreezeUrlInputs`, src/userrun.js:2606, src/source.js:1351; the commit message is "run start - fresh copy of the web inputs", line 1371) before the spine exists. During that 3-5 s the chat shows `signed hash` and the Run tab shows `starting… the run has not written its log yet` (`startingStub`, src/panel/server.js:694; index.html `renderRun`), saying nothing about the fetch.
Change (words owned by code, one table beside `STEP_LABELS`, src/panel/authorsession.js:71):
- Right after the sign, the progress list gets a step `fetching the page…` (pushed next to the `signed` step in src/panel/authorroutes.js:522), only when the signed copy has a web input (`source.json` `inputs[].url`).
- The Run tab `starting` state says `fetching the page…` instead of the bare `starting…` while the same condition holds and `source.json` has no `refrozenAt` at or after the row's `at` (`refreezeUrlInputs` writes `refrozenAt` last, src/source.js:1388). The server decides the word in `startingStub`; the page prints it. A job without web inputs keeps `starting…`.
- No new spine event (the spine does not exist yet). A refused fetch keeps its plain `The run did not start. Nothing spent.` text.
- BEFORE: `starting… the run has not written its log yet`. AFTER: `fetching the page… the run has not started yet`, then the normal Run tab.
- Must fail when: a file-only job says fetching; `fetching the page…` stays after `refrozenAt` is written; the words are typed in the page instead of coming from the server.

### Q3 — the early "ask about intent" is dead; code forces it

Verified: since idea A core, `lookFromMap` returns `look.notFound: []` always (src/pagemap.js:170) and the early question path (`ruleQuestions`, src/authorjob.js:653-654) reads only `look.notFound`, so it can never fire. The two questions in `mve5y8fa` came from the confirm model choosing to ask (`forceAnsweredQuestions`), not from code, and the model mostly does not ask (fwd/F218: 0/40, 0/8). So a guardrail can pass unasked into a signed check.
Change: code asks BEFORE paid drafting, from the look's own result, through the existing question gate (`answerQuestions`: answer required, no skip, the answer becomes a `~` rule on its line, `normalizeQuestions` cap):
- T1 = every fact the AI made a number for (`aiProposal` true, src/facts.js:215). Words (code-owned, one function): `Your line N says "<guardrail>". I turned it into: <factSentence words, e.g. departure between 5:00 AM and 10:00 PM>. Is that right?` Options: `yes` / `change the numbers` (the person types them; they become the `~` rule) / `leave it Not checked`.
- T2 = every `~` guardrail the map could not tie to a kept page word (the map's `from` ties and its `dropped` list, src/pagemap.js/applyPageRules): `Your line N says "<guardrail>". I found no word on the page for it. Check it how? ` Options: `change the numbers`/`say it another way` (typed) / `leave it Not checked`.
- Answers are recorded exactly as Q1 (draft-log `human` rows, `source:'look'`), so the Audit shows them and a `yes` on a T1 fact is what makes it read `you confirmed`.
- Try-3 stays as the late backup (unchanged).
- Call site: src/authorjob.js:653-654 replaces the `look.notFound` source with `askableFromLook(look, jobLines)`, a new pure function in src/pagemap.js; `answerQuestions` is the existing gate.
- Must fail when: a fact with `aiProposal` raises no question; a `~` rule tied to a kept page word raises one; more than the cap are asked; `yes` leaves the AI mark; the same guardrail is asked twice; a run with no AI-made number and no untied guardrail asks nothing.

### Q4 — the money wording

The run.log line `spent $0.0054 ($0.0035 drafting)` (src/userrun.js:2057 via `moneyWithDraft`, src/replay.js:1615; the panel keeps a second spelling, `panelMoneyWithDraft`, src/panel/index.html:2231, printing `$0.18 (<$0.01 drafting)`) reads as if drafting were inside the first figure. The first figure is the run alone; drafting is on top; the total is their sum (run `mve5y8fa`: run $0.0054, drafting $0.0035, total $0.0089 in runs.jsonl). Fix, one line of words: `$0.0054 run + $0.0035 drafting = $0.0089 of $1.00` (floors keep `at least`); `moneyWithDraft` stays the one owner of the string and the panel reads it from the server instead of keeping its own copy. Must fail when: the sum is not the run plus drafting; a floor loses its `at least`; the two spellings differ.

### Tests (real spines as fixtures)
- Fixtures: copies of `u-mvdg1xo3.jsonl` (+ its gate-audit) and `u-mve5y8fa.jsonl` committed under `test/fixtures/`, never authored ones; the new `output-judged` is tested on a spine written by a live run on deepseek-flash after the build (a hand-written spine would prove nothing about the real shape).
- Each assertion shown failing first (mutate, then restore from a scratch copy, never `git checkout`): D1 (`mvdg1xo3` attempt 1 lists check 2 as failed with 9 reasons, and is never `not run`); a try line names the first reason and `(+8 more)`; an `iteration-start` with no `exit-eval` reads `cut off`; the Round table has 80 rows for step 1 with page 20; step-local round numbers start at 1; `calls:`/`checks:` on both runs equal the counts from the raw spine; the card's last-try line equals the last try's checks; old spine without `output-judged` has no judged-file line; the `[model]`/`[human · ask]` marker; the Q1-Q4 "must fail when" lists above.
- Gate: `npm test` (hermetic), typecheck, build:types, each exit code quoted; the live check is a real panel run, then hamr's click-through (a builder's report is not the sign-off).

### Phone width
Every new block is text in the existing flow with `overflow-wrap:anywhere` (the same rule `audit-started` uses): try lines, check lines and `output judged:` wrap to the next line; the numbered check rows wrap under their number; the Run summary rows already wrap (`sum-val`); the step-card line is plain text. The Round table keeps today's `audit-table-scroll` wrapper (its Time cell is already short, fix 2026-09-28) and gains one narrow Try column; hamr did not pick fwd's phone variants D/E, so no card layout. No page-level horizontal scroll is the rule; the 320 px check is hamr's own DevTools, barebrowse cannot emulate phone width.

### Design choices for hamr (recommended answer first)
1. Where do the two Run summary rows sit? After `tools:` (recommended; `calls:` sits beside the tool count and `checks:` before `cache:`), or at the end after `cache:`.
2. Round numbers: per step from 1 with a Try column (recommended, as fwd and as the mock), or keep bareloop's run-wide numbers (5-8 today) so a number matches the flat view. If per step, the flat Audit view keeps run-wide numbers (two numberings; say so on screen).
3. Round table page size: 20 rows, as fwd (recommended; `showing 1–20 of 80`, load more), or keep today's 50 rounds.
4. How Q1's answers make a fact read `you confirmed`: (a) a new signed fact field set only by code (robust in the Job tab and every reuse, but a schema change that adds a hash-visible field: your call), or (b, recommended for now) no new field: the mark `AI's proposal` is dropped when a recorded answer holds the bound, the Job tab shows a plain fact, and `you confirmed` shows only where the session's draft-log still exists (the Audit drafting rows).
5. How Q1's answers appear in the Audit: as `you were asked …` / `you said: …` rows under their drafting step in the drafting table (recommended), or as a separate `you` fold.
6. Check numbering inside a step try: the order the exits ran in that try (recommended; nothing guessed, but it differs between runs: check-passes first in `mvdg1xo3`, tree-changed first in `mve5y8fa`), or the declared close position as the fix-loop attempts use (`declaredPosition`).
7. Reason lines: show the first reason on the try line plus `(+N more)` and all reasons folded under the failing check (recommended), or all reasons always open.
8. `checks on the last try`: reworded as `last try: 1 check passed, 1 failed` (recommended; "N/M" stays withdrawn), or fwd's `p/n ✓|✗`.
9. Human rows and card: an Audit fold and a Run card for the review door only (recommended: it is the only human step bareloop has; no `you cancelled`), or no human row at all.
10. The cut-off try (D2): listed as `try N · cut off before its checks ran` (recommended), or left unlisted as today.
11. Q3 cap: the existing `MAX_QUESTIONS = 2` (src/authorflow.js:121) for T1 and T2 together (recommended, T1 first), or a higher cap for a job with several AI-made numbers (the questions after the cap stay `AI's proposal — check it` on the card, never silent).
12. Q3 T3 = a page label whose meaning may differ ("From" = the starting fare, not the booked price): out until a live run needs it (recommended), or in.
13. Q4 wording: `$0.0054 run + $0.0035 drafting = $0.0089 of $1.00` (recommended), or keep the bracket and add the sum after it.
14. `output judged:` size and hash shown as `2.1 KB · sha256 674b…30` (recommended), or the path only with no hash.

**Part 5 done when:** built with the tests above on this branch; D1-D3 fixed; one live deepseek-flash run with web input shows `fetching the page…` and the new `output-judged` lines, and a run with a confirm question shows its Q and answer in the Audit drafting part; hamr's click-through (mobile by his DevTools); then /self-review, /branch-review, /release.

**Part 5b — the look reads, code asks (v1.107 — 2026-10-18; RULED by hamr: cap 3, more than 3 = rewrite the job, build now on this branch before Part 6; SIGNED by hamr 2026-10-18, all 3 design choices as recommended).**

hamr's words: "we need to inject an ask to agent when checks/guardrails are not verifiable, and the ask would be around the spirit of can't check this, drop (yes/no) or propose vs or i can enhance this guardrail/or i understand redeye as... agree yes/no or propose." And: "more than 3 you need to redraft, agent may even suggest that." Replaces Part 5 Q3 T1, which the builder could not build (the look carried no number; the number was made later by the confirm model and the drafter, `src/inputlook.js:166`). Real run, read only: `mve5y8fa` (flight-idea1): the look tied `not a red-eye` to fact `departure time` with no bound (draft-log `page-map` raw); the confirm model chose to propose 06:00–21:00 and the person agreed. Nothing in code made that ask.

**Shape.** The page map (src/pagemap.js `mapPrompt`/`parseMapAnswer`, the only look path, src/authorjob.js:475) sorts every `~` rule into one of three kinds, and code asks about two of them:
- **page**: a kept page word carries the rule (`nonstop` → `Nonstop`). No ask (today's T2 tie, unchanged).
- **reading**: the rule needs a reading the page cannot hold (`not a red-eye`). The map returns it ON the fact: optional `reading: {op, value | lo, hi}` on a `time` or `money` fact, the same `op` set as a signed fact rule (src/facts.js `ruleWords`). Code asks only when a bound is NOT in the words the person wrote (the same test as `rubric-fact-unmarked`, src/rubricstep.js:650, one shared function, never a second spelling).
- **can't check**: no kept page word and no reading (today's T2).

**The asks** (code-owned words, one function each in src/pagemap.js beside `askableFromLook`; through the existing gate `answerQuestions`, answer required, no skip):
- reading: `Your line N says "<rule>". I read it as: <ruleWords of the reading, e.g. departure time between 06:00 and 21:00>. Agree?` Answers: `agree`, or the person types their own (`propose`). `agree` writes the reading as a `~` rule on that line in plain words (`departure time between 06:00 and 21:00`), so the bound is now in the person's own words: the drafter is told it, `rubric-fact-unmarked` stays quiet, and the fact signs plain (no `AI's proposal` mark). A typed answer becomes the `~` rule instead.
- can't check: `Your line N says "<rule>". I can't check this on the page. Drop it?` Answers: `drop it` (today's `leave it Not checked` path: the rule goes on `look.dropped`, reason `person-left`, shows as Not checked), or the person types how to check it (`propose`), which becomes the `~` rule.
- Answers are recorded as Part 5 Q1 (draft-log `human` rows, `source:'look'`); the Audit drafting rows show them.

**Cap and rewrite.** `MAX_QUESTIONS` goes from 2 to 3 (src/authorflow.js:121; the try-3 questions share it). More than 3 asks: nothing is asked, nothing more is spent, and drafting stops before the confirm turn with code-owned words listing EVERY ask and its reading as the suggestion: `Your job has N rules I can't check or had to guess. Please rewrite it so each one says what to look for. My readings: line 1 "not a red-eye" → departure time between 06:00 and 21:00; …`. That list IS the agent's suggestion; no extra paid call. The person edits the job and drafts again.

**Unchanged.** The confirm model's own questions (`forceAnsweredQuestions`) stay; try-3 stays the late backup; a bound the drafter still makes unasked keeps today's `AI's proposal — check it` mark (rubricstep.js:650 forces it).

**Call site.** src/authorjob.js:653-654: `askableFromLook(look, jobLines)` returns both kinds, reading first in line order; the count check (>3 → stop) sits before `normalizeQuestions`. `lookFactOf`/`KeptFact` (src/pagerules.js:14) carry `reading` through so the ask and the confirm card see it.

**Must fail when:** a reading whose bound is not in the person's words raises no ask; a reading whose bound IS in their words raises one; a page-tied rule raises one; `agree` leaves the `AI's proposal` mark or does not add the `~` rule; `drop it` adds a rule or leaves it checked; 4 asks ask anything or spend past the look; the stop words miss an ask or its reading; the same rule is asked twice; the map answer with a malformed `reading` is accepted (it is a malformed answer, no repair).

**Tests.** The real `mve5y8fa` look and job as fixture (tests/fixtures/part5/), with the map answer re-shaped to carry the reading (the real one predates the field; say so in the test); each assertion shown failing first. Gate: npm test (hermetic), typecheck, build:types, exit codes quoted. Live: the flight-idea1 job on deepseek-flash, $0.50 / 20 min (hamr's go), must show the red-eye ask, the agreed `~` rule, and a plain signed fact.

**Design choices for hamr (recommended first).**
1. Agreed reading is stored as a `~` rule in plain words (recommended: no new signed field, the hash sees it as the person's words), or a new signed `confirmed` field on the fact.
2. More than 3: stop with the list (recommended, $0), or one paid call that rewrites the job for the person to edit.
3. The confirm model's own free questions: keep (recommended, unchanged), or turn off now that code asks.

**Part 5b done when:** built and gated on this branch, the live run above shows the ask, hamr signs off; then Part 6.

**Part 6 — the Result tab, rubric jobs only (v1.107 — 2026-10-18; design RULED by hamr in a live-canvas session 2026-10-18, mock `design/result-tab-mock.html` variant F; SIGNED by hamr 2026-10-18: choices 1, 3, 4 as recommended; choice 2 = the bareguard ask (BG-2, UPSTREAM-ASKS.md), hamr: "ask it first and you will build everything until it delivers").**

hamr's rulings (live-canvas, 2026-10-18): variant F = B's table + E's green ✓ chips; the proof (the page's words, checked words highlighted) folded per row; tab order `Run · Audit / logs · Job · Result`; Accept / Rerun with my words / Pause / Download live on Result; rubric jobs only. Real run, read only: `mve5y8fa` (flight-idea1, green, waiting at the Accept door; fixtures in tests/fixtures/part5/).

*Found while citing (today's code, not in the mock):*
- (R1) The panel has ONLY Accept. No Rerun-with-my-words, no Pause button anywhere (src/panel/index.html:2552-2554). The engine has both: `answerReviewDoor` (src/reviewdoor.js:145, `text` required for rerun, :131/:157) and `run-u --door <id> --decide rerun --text "…"` / `--decide pause` (src/userrun.js:626-640). No panel route calls them (src/panel/runroutes.js has only stop/resume/accept/needs-remove).
- (R2) No Download route exists (src/panel/server.js serves JSON/text/HTML only). The delivered file IS recorded: spine `destination-written {path, declared, bytes, sha256}` (src/userrun.js:2184-2207; `mve5y8fa` seq 48: `.../live-flights/out/steps/1-2026-10-18.json`, 1473 bytes), but `getRunDetailBody` (server.js:1189-1495) does not expose it.
- (R3) Nothing returns which page words a check read: bareguard's `decideQuote`/`locateAnchor` compute positions internally (node_modules/bareguard/src/primitives/rubric-locate.js ~618, 808) but neither is exported.

### The tab
- A fourth right tab `Result` after `Job`: button `#tab-result` (`data-testid="right-tab-result"`) in `.rp-tabrow` (index.html:877-881), section `#panel-result` placed AFTER `#panel-details` (never between `#panel-audit` and `#panel-details`: tests/trigger-schedule-buttons-page.test.js:57 slices there), id added to `wireTabs` (index.html:1085). Shown only when `detail.checkType === 'rubric'` (server.js:1360) AND the spec has a `rubric-step` stage; otherwise the button is absent (not disabled).
- Opens on the Run tab as today; when a run is waiting at the Accept door, a line on the Run tab says `the result is on the Result tab` with a link that clicks `#tab-result`.

### What it shows (top to bottom, as mock F)
1. Head: the status sign + word, `rubric`, run name (existing `stateDotHTML`/`.st-word`, never a new mark), then money (Part 5 Q4 words from `moneyWithDraft`) and time.
2. Per job line, in line order: the numbered line text and its `~` rules (from the signed spec, `lineRules`, rubricstep.js:605).
   - FACTS line: a table, one row per result in the delivered file (`results[]`): `#`, one column per VALUE fact (name = the fact's `name`), one column per PHRASE fact group, a `checks` column `N of N ✓`. Each cell is the value as the quote writes it, in a chip, with `✓`. A fact's ✓ means the line's check passed (the step's `exit-eval` passed); the tab never re-decides and never shows a ✓ on a red run (a red run shows the rows with no ✓ and the step's own gap words from the Audit's try line).
   - Under each row a fold `▸ proof — the page's own words`: the result's quote, with the anchor words, the value and every phrase highlighted (see choice 2).
   - Under the table: `✓ = code checked it against the saved page. The rules: <factSentence of each fact>` (src/facts.js:201, one owner), with `(you confirmed)` on a fact whose bound came from a Part 5b answer.
   - TEXT line: the text in a box, `▸ quotes from <input> (N)` fold with each claim and quote, and `Not checked: …` from the signed plan (`planFromSpec(spec).notChecked`, src/panel/jobplan.js ~51-105, the same list the Job tab shows).
3. The door (only when `detail.accept === true`): `waiting for you — the checks passed; is this what you wanted?` and three buttons, in this order: `Accept` (primary, today's handler, index.html:2600-2612, same route), `Rerun with my words` (opens a textarea, required, then `Rerun`), `Pause`.
4. `saved to: <path>` for each `destination-written` record, and `Download <file name>` per file (+ `Download all (zip)` only if choice 3 says so).

### New server pieces
- `getRunDetailBody` adds `delivered: [{path, bytes, sha256}]` from the run's `destination-written` records (pattern of server.js:673-677, `findLast` → `filter`).
- `GET /api/runs/:id/result`: the signed line plan (lines, rules, facts per line from `closeDecl.stages[].params.parts`, `factPartOf`, src/facts.js:49) plus each delivered step file's parsed JSON. It reads ONLY paths in that run's own `destination-written` records, re-checks each file's sha256 against the record, and on a mismatch or missing file says in words `the saved file changed after the run` / `the saved file is gone`, never shows stale content.
- `GET /api/runs/:id/download?i=<index>`: streams delivered file `i` (index into `delivered`), sha-checked as above, `Content-Disposition: attachment`. No path ever comes from the request; Host guard as today.
- `POST /api/runs/:id/rerun {text}` and `POST /api/runs/:id/pause`: spawn the existing CLI door exactly as `handleAccept` does (runroutes.js:172-221, `run-u --spec … --door <id> --decide rerun --text … --approve <hash>` / `--decide pause`), refusals worded by `engineRefusalWords`. Empty rerun text is refused in the page AND by the engine.

### Must fail when
- the Result button shows on a deterministic run or a rubric run with no `rubric-step` stage;
- a ✓ shows on a red run, or the tab re-runs a decide;
- the table's rows differ from the delivered file's `results[]`, or a column name is not a signed fact name;
- `/result` or `/download` reads a path not in that run's `destination-written` records, or serves a file whose sha256 no longer matches;
- Rerun posts with empty text; Pause or Rerun shows when `detail.accept` is not true; the button order is not Accept < Rerun < Pause (and today's Resume < Accept < Reuse order in the Run action bar stays, tests/trigger-accept.test.js:247-252);
- the Not checked list differs from the Job tab's;
- a new id duplicates one (tests/panel-page.test.js:2446).

### Tests
Real `mve5y8fa` spine, spec and delivered step file as fixtures (the step file is copied from the real run's destination, sha-checked against seq 48); a red rubric spine (`mvdg1xo3`) for the no-✓ case. Each assertion shown failing first on a scratch copy. Gate: npm test (hermetic), typecheck, build:types, exit codes quoted. Then a live flight-idea1 run on deepseek-flash ($0.50 / 20 min, hamr's go) and hamr's click-through: Accept, Rerun with words, Pause, Download, phone width by his DevTools (barebrowse cannot emulate it).

### Phone width
Text in the existing flow with `overflow-wrap:anywhere`; the results table sits in the existing `audit-table-scroll` wrapper (scrolls inside itself, never the page); the four right tabs may wrap at `.rp-tabrow`'s narrow rules (index.html:126, 686), which is allowed; buttons keep 44 px height.

### Design choices for hamr (recommended first)
1. Rerun / Pause: build the two panel routes now, on Result only (recommended; the engine has them, R1), or Accept only for now.
2. Proof highlight (R3): RULED = the bareguard ask BG-2 (spans returned by the check). A panel-side substring search was rejected: real pages repeat anchors (`Departure time:` 27 times on `mve5y8fa`'s page), so it can highlight the wrong spot. Until BG-2 lands the proof fold shows the quote with NO highlight; the highlight is its own commit with the bareguard bump. Must fail when: any highlight is drawn from a panel-side search.
3. Download: one button per delivered file (recommended; no zip code, no new dependency), or also `Download all (zip)` (needs a zip writer: stdlib has none for zip archives).
4. The Run-tab pointer `the result is on the Result tab` when waiting at the door: yes (recommended), or no.

**Part 6 done when:** built and gated on this branch, the live run shows the table and proof, hamr's click-through passes; then /self-review, /branch-review, /release.

**Part 6 amendment (2026-10-19) — the look: SIGNED by hamr ("signed B").** hamr clicked the first build (change2 run-1): the tab sat loose on grey, unlike the boxed Run/Job/Audit tabs; "1Find" (number glued to text); the line text cut ("what chang"); Not checked as one run-on blob mixed with drafter notes; "the saved file is gone" four times. The signed look is `design/result-tab-mock-v2.html` VARIATION B, built with the panel's own CSS: every part in a `.job-card` (Result · Line N · Your call · Saved), `.field`/`label`/`.ro-value` boxes; each result its own box (`Result N` + `N of N ✓`, one small box per fact with ✓, places joined `BOS → ORD`, money as the page writes it `$144`), the proof folded under each result with the words the checks read highlighted from bareguard 0.25.0 `full.evidence` (`matched` spans only; until it lands, no highlight); Not checked as a list under its own line; one "gone" per file in Saved. Variation A (one table) not picked. Mock v1 (`design/result-tab-mock.html`) stays the content reference only; its CSS is not the panel's.
