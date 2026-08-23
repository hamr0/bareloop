---
type: reference
title: "Workflow shape & governance"
status: stable
sources: [docs/archive/PRD.md]
---

# Workflow Governance

How bareloop's agent-authored workflow is shaped, bounded, adapted, and retired — plan-v1's shape, the strike/variance/replan machinery, Layer R, the validation gates that police it, the scout's retry rule, and the tool-grant/behavior contract each worker runs under.

## Orchestration is out of scope, on purpose

bareloop is not a runtime orchestrator: an orchestrator confounds many runtime decisions into one outcome bit, destroying the contrast-bit channel credit attribution depends on; it re-derives its workflow every run and compounds nothing; and it has no artifact an arbiter could validate reds-before against (PRD.md:203-226). Orchestration's legitimate regime — one-off/heterogeneous/unknown jobs — is already out of scope. The only admitted convergence path is: orchestrate the first encounter, then crystallize the trace into a config via run-as-executed inheritance, entering only through a pre-registered probe with measurable separation (PRD.md:203-226).

## plan-v1: the current workflow shape

### Why config-v1 died

config-v1 (hooks/slots/knobs bound to lifecycle points) was retired: of its seven drafted knobs, only one (`loop.shape`) could change what a worker experienced on a never-green job — the emergent middle had no live surface. Its `stash` verb was a decoy: it looked like a ratchet but wrote to a table nothing read (PRD.md:627-877). The retiring law, restated verbatim: **"The agent may author anything whose only verbs are gated primitives. It may never author the arbiter: the close, the budget, the fence, the merge."** This restates design law #1 — the danger is in the actions, not the syntax (PRD.md:627-877).

### The plan-v1 flow

A signed job spec (goal, budget, final close, tool ceiling — all human-authored) drives:

1. **Preflight** — a job whose final close isn't a deterministic predicate escalates `decision-ready` with a question ("this is a chat, not a job"); compiling a close from prose is out of scope for v1 (PRD.md:627-877).
2. **SCOUT** — a read-only worker, hard-bounded rounds plus a reserved budget slice, produces a context blob. It never writes and never runs commands (PRD.md:627-877).
3. **PLAN** — one decompose call (`Planner.plan(goal, {info: scoutBlob})`) emits a step DAG. The plan-v1 validator gates it before any tokens burn: each step's verbs must subset the spec's tool ceiling, bounds must fit shell caps, scopes must sit inside the fence, and the arbiter (close/budget/fence/merge) stays structurally inexpressible. The DAG runs strictly sequentially in v1 (fan-out deferred) (PRD.md:627-877).
4. **Per-step micro-loops** — each step is a fresh `ralph()` loop with a fresh Gate/budget; the agent picks its step's exit from a **closed menu of declarative inner exits** the shell evaluates with its own fixed code, never a command: `artifact-written(path, pattern?)`, `tree-changed(scope)`, `json-valid(path)`. `run` stays locked forever — an agent-authored command executed by the shell would launder arbitrary execution through the arbiter (PRD.md:627-877).
5. **Feed-forward** — each step's artifact feeds the next step's prompt, the channel config-v1 never had (PRD.md:627-877).
6. **One replan per run** (mirroring the one-revision rule) — later widened by exactly one bounded, arbiter-granted exception (see Variance below) (PRD.md:627-877).
7. **The human-signed outer close is the only truth.** A green run's plan-as-executed is minted for inheritance; a red run mints nothing (PRD.md:627-877).

Inner exits verify **form, not truth** — a confident-but-wrong artifact satisfies its exit and propagates downstream via feed-forward. Containment is the outer close plus the (bounded) replan; there is exactly one arbiter (PRD.md:627-877).

### Privilege table (who authors what)

Only the operator sets the budget (everyone else may tighten it, never raise it), only the shell runs the close, only the planner authors the plan and its inner exits (from the closed menu), and only the operator merges — forever. The planner sees only the scout's blob, never the repository itself, which is what keeps a plan a plan rather than a second worker (PRD.md:627-877).

### What a step worker never sees

The budget, the close command, the plan validator, other steps' tool grants, and the arbiter's own books (gate audit, spine, `.smoke` store — explicit `fs.deny`) (PRD.md:627-877).

### Layer 2 acceptance (F47) and the two workflow shapes

Layer 2 — the agent authoring bounded steps with operator-signed, agent-composed in-run checks — passed its pre-registered acceptance gate: 3/3 rows converted, 3/3 greened above the 45% bar, and 3/3 times the agent composed `check-passes(clean-run)` itself (PRD.md:1278-1318). This closed the genre chain: mechanical gaps convert (F38) → delivery/state isn't the gap (F39) → an in-run check translates semantic to mechanical, hardwired (F46) → the agent does it itself and clears the bar (F47) (PRD.md:1278-1318).

This did **not**, however, retire the legacy `steps[]` shape on landing as first recorded — that was corrected the next day. plan-v1 admits `green` only and **locks** `soft-green`/`hitl` (declaring either is a request-red); legacy `steps[]` uniquely hosts those two locked verdicts, including the only working human-verdict path (draft-PR/hitl) (PRD.md:1319-1389). The split is a build-order artifact, not a design — nothing about legacy is better for the product's goals; it survives only because rebuilding hitl is not yet needed (non-code jobs are a later goal). **Sunset criteria:** legacy retires only when plan-v1 both admits and implements `hitl` and `soft-green` in the plan flow — the verdict-classes rung, sequenced after Layer 3 — and retirement is a rewrite-deletion of legacy code, never a copy, parked for hamr's explicit go (PRD.md:1319-1389). One consequence of the interim split: Layer R's tee wiring is duplicated across `interpret.js` (legacy) and `planrun.js` (plan-v1), ~60 lines, deliberately not extracted since one copy is scheduled for deletion — accepted cost is a drift window until legacy retires (PRD.md:1319-1389).

### The user authors the destination, never the road

A later addendum sharpens plan-v1's check-authoring model: **a close is declared as an ordered list of named stages**, and the check menu *derives* from those stages — no operator ever hand-authors a check per job. The agent picks which stage gates which step by name, told only the names and the pairing rule, never the command (PRD.md:1663-1744). Evidence audited against the initial worry ("this leaks the close's structure to the agent") found the opposite risk was real: hand-authored checks (job #5) turned out to be a leniency-drifting *re-implementation* of stages the close already ran — derivation removes that divergence class by construction (PRD.md:1663-1744). The close's output still never names the culprit file, checks still decide and mint nothing, and `run` stays locked (PRD.md:1663-1744).

## Steps ending on progress, not on a count

The step loop originally ended on a fixed iteration counter (`capRuns`/`attempts`). Measurement (F77) showed two calibrations died step-red with signed budget still unspent while their own error count was still shrinking — a silent second ceiling inside the shell itself (PRD.md:2598-2678).

**The replacement rule:** a step ends when it stops making progress, not when a counter runs out. A **strike** is a red iteration that repeats an already-seen normalized gap (a seen-set, never last-only) or made no gate-audit writes. **Two strikes end the step.** The strike ceiling is shell-owned, hamr's number (2), inexpressible and untightenable/unraisable by the agent — the same arbiter-territory bound as always (PRD.md:2598-2678). Money and the wall remain the only caps that matter to a run's economics; exactly one bound (exhaustion-by-count) was replaced (PRD.md:2598-2678).

`attempts` retired from the agent's drafting surface (tolerated, never rejected, in already-stored bridge plans — refusing them would invalidate every recipe minted before the change) (PRD.md:2598-2678). The replan brief now names the *mechanism* that ended a step (which shape, the gap trajectory, unspent resources reported as unbounded rather than zero) instead of one flattened sentence that fit both a converging and a stalled step alike (PRD.md:2598-2678). Layer R's verbatim (fourth-iteration) stage retires on the step path — a fixated step strikes out before it can fire — per hamr's ruling: **"so, 2 strikes followed by handing notes on next replan/run"** (PRD.md:2598-2678). The close-fix loop keeps `CAP_RUNS` as its own, unrelated cap (PRD.md:2598-2678).

## Variance, trend, and the replan ceiling

### One trend reader, never two

Two separate instruments (a numeric trend and a byte-comparison `gapTrend`) answering the same convergence question were unified into one reader, `src/trend.js`: where a stage reports a comparable number it decides; where none does, a byte-comparison survives *inside* `unknown` as a `motion` field (`changed`/`unchanged`/`null`), never promoted to a direction ("the close's output changed" is not "the run got better") (PRD.md:2848-3001). hamr's ruling separates two questions that must never merge: the halt readout is the chain-spanning, consolidated money/time view answering "was the run converging" (used for top-up decisions across a resume chain); the strike governor is leg-local/step-local, answering "is this loop out of ideas," and is deliberately **not** seeded from the chain (PRD.md:2848-3001).

A known limit is shipped, not silently parsed around: a stage name is not necessarily one population — a close that reports two structurally different error populations under one stage name donates both to one series and can misread progress. The root fix (splitting the stage in the signed close) is spec-hash territory reserved for hamr; it shipped for the `u-*` closes (all six spec hashes flipped, two stored bridges invalidated pending re-mint) but stays parked for `testgen-close.mjs` and as-is for the frozen `types-close.mjs` (PRD.md:2848-3001).

### The variance meter reports, it never decides

The meter's firing condition — `moneyShare`/`timeShare >= 0.5` on either axis — is unchanged; what changed is what the stop *says*. It previously printed a hardcoded "exits unmoved" string on every stop regardless of what actually happened, once causing a replanner to rebuild an already-clean file. hamr's ruling: **"meter is right but missing a piece ... it should give heads up on money/time + progress for llm to judge."** The stop now carries the measured `trend`/`motion`/`reading`/`series` from the same single `src/trend.js` reader the halts use (PRD.md:3002-3211). A progress term was deliberately kept out of the *trigger* — that would make a governance instrument over an operator-owned allowance into a judge of capability, which is arbiter territory (PRD.md:3002-3211).

### The bounded replan exception (C)

A **second** `step-variance` stop earns exactly one more replan, granted by the arbiter off a mechanical `converging` reading; `flat`/`unknown` stop exactly as before, and a third variance stop is the stop. The grant is a **latch, not a comparison** — spent once, never re-earned, nothing accumulates — narrowing (not repealing) the "unlimited replanning launders thrash as adaptation" law by exactly one case. The agent has no channel to request or influence it (PRD.md:3002-3211). Its one live firing bought nothing measurable (aimed at an already-clean file); it has never yet run under both the trend fix and the replan-gap fix together, so its value is unread at n=1 (PRD.md:3002-3211).

### The replanner gets the close's own gap

A replanner that only saw a trajectory ("typecheck 30 → 15 → 15 → 1") with no location once retargeted an already-clean file. `closeGapBlock()` now hands the replanner the close's own last gap as scrubbed, bounded **text** (never a parsed file list — a model can tell a summary line from a detail line; a regex cannot, and a parser would be one reader per close, breaking the one-reader rule) (PRD.md:3002-3211). A prior "never wrote" advisory that had actually named the wrong (already-clean) file was deleted on hamr's order (PRD.md:3002-3211).

A live rerun under both fixes still died step-red at two remaining strict errors, but for a different, honest reason: the replan correctly targeted the real remaining errors and wrote code, yet the last two errors didn't move across a repeated (struck) gap. That result carries a stated confound — the replanned step ran on `haiku` at a short round bound, below the sonnet floor every baseline was measured on, so it isolates a haiku/tight-bound failure, not a general capability limit (PRD.md:3002-3211).

### The replan premise itself was measured, and corrected

An earlier claim that "replan has fired zero times in this programme" was false — replaying all archived plan-v1 spines found **8 replans had already fired**, all on the exhaustion trigger (PRD.md:1807-1862). A companion threshold (a 50%-of-remaining-money trigger, "move A") was found to have never fired across every archived attempt boundary — built, tested, adding nothing measurable on the only workload with data. Neither observation moved the threshold itself (arbiter territory, hamr's number) — the data was recorded so a future decision is evidence-based rather than a fresh guess. This minted a standing process rule: **a premise cited to justify a build is replayed against the archive before the build** (PRD.md:1807-1862).

## Layer R (self-healing continuity)

Layer R is a shell-authored (never agent-authored) root assembled from the arbiter's own books (write audit + kept-failure lines), fixation-gated (inert until consecutive attempts rewrite the same files without moving the reds), with an escalating summary→verbatim injection (PRD.md:1102-1130). It ships wired but content-blind to the spine (`root-injected` carries counts/paths, never content) and is within-run scratch only — never inherited (PRD.md:1102-1130).

Its default has moved twice on evidence:
- Shipped ON-armed-and-inert, then reversed to **OFF** before release, since fixation was measured extinct (F41) and the doctrine is not to default-enable an unproven lever (PRD.md:1131-1168).
- The deferred ON/OFF read (waiting for "the first Layer 2 job that produces natural fixation") was declared a **dead pointer** once Layer 2's full acceptance battery ran with zero natural fixation appearing — the trigger waited on an event the evidence base said would not occur passively (PRD.md:1390-1418). The default is now **settled false**, and the read is re-homed on a deliberate manufactured-fixation probe instead of a passive trigger (PRD.md:1390-1418).

## Validation gates: ReDoS and structural admissibility

`hasNestedQuantifier` is a validation-gate reject for pathological regex (catastrophic backtracking), guarding against a hang that would block bareloop's own main event loop when an operator-authored pattern runs in-process (the in-process stall fuse cannot fire on a hang inside its own loop) (PRD.md:3676-3764). It was found wired at only one of three sites (the agent's `artifact-written.pattern`) and widened to cover the operator's two regex fields (`judged.pattern`, `gapKeep`) via one shared inventory imported by both `job.js` and `plan.js` (PRD.md:3676-3764). A measured admissibility sweep of all 92 operator regexes across 10 signed specs found zero newly red — no spec-hash churn (PRD.md:3676-3764).

A known blind spot — overlapping-alternation ReDoS shapes like `(a|aa)+$`, which carry no nested quantifier for the scanner to find — was parked to the close-authoring rung rather than chased immediately, since widening detector scope changes which signed specs are admissible (arbiter-adjacent). It was later **closed**: `altBranchesOverlap` was added as a monotonic (rejections-only) widening, measured first against real timing data (PRD.md:3676-3764). `([^])*$` (JS's any-char idiom) is correctly left uncaught — it is linear, not a hazard (PRD.md:3676-3764).

Two further limits were named rather than engineered around:
- The operator-regex sweep originally walked only `jobs/*.json`, missing registry bridges that carry their own signed closes — later closed by widening `validateBridge` to sweep the whole entry through the same detector, widening only *where* it looks, not *what* it rejects (PRD.md:4249-4294).
- The two-process resume guard is a point-in-time liveness check, not a held lock — racy in principle, accepted deliberately for a single-operator tool rather than adding a real lock's own failure mode (PRD.md:4249-4294).

## The scout's retry rule

A live run where the scout's survey emitted unparseable JSON, the close refused at $0 preflight, and no byte of what the model actually said was kept anywhere prompted two fixes (PRD.md:3994-4086):

1. **`SCOUT_ATTEMPTS = 3`, hardcoded, tighten-only**, firing on the *typed* cause of failure only — `unparseable` and `empty` retry (there's a form problem to re-ask about); `call-failed` and `short` do not (routed elsewhere or already instrumented); `non-object`/`empty-object` do not, since re-asking a semantically wrong-but-valid answer just samples the same distribution twice (F38/F39) (PRD.md:3994-4086). The self-healing line is deliberately not crossed: reacting to a survey's *content* would be a designed loop; re-asking for readable *form* is a retry. **No JSON-repair heuristics, ever** — a repairer would decide what the model meant and write it down as though it had said it (PRD.md:3994-4086).
2. **Every raw model emission becomes part of the run's audit**, on the existing trail (`raws` on the returned result, scrubbed through the one secret inventory, bounded, with trims announced) — present even on $0 preflight refusals, since those are exactly the paths whose evidence used to vanish with the process (PRD.md:3994-4086).

An evidence-gated escalation exists if raws show malformation recurring: move the scout to a structure-enforced tool call, removing the class rather than handling it (PRD.md:3994-4086).

## Tool grants and worker behavior rules

Capability is spec territory, never agent territory: a step's middle mode (`text`|`tools`) and its tool menu live in the human-signed job spec and are inexpressible in the drafted workflow config — the same inexpressibility guard as the close (PRD.md:429-450). The menu is read/grep/write only; the close remains the only executor. `run` is locked-but-listed — a spec requesting it reds, and that red is itself the request-red evidence its eventual admission would wait on (PRD.md:429-450). Both middles (single-target text, tool-mode) stay, chosen by step shape; in tool mode, "wrote junk" is the close's verdict rather than an artifact-red (PRD.md:429-450).

A related, later-confirmed doctrine: **capability without strategy is inert, and strategy without enforcement is inert.** A measured calibration found that disclosing a round bound moved a never-writing worker only to a coin-flip rate, and adding an explicit pacing strategy to the spec moved nothing — workflow discipline must be structural (plan-v1's bounded steps with declarative exits), never advisory prose (PRD.md:1017-1041). Budget-class bounds must move together: raising a round bound without the matching dollar budget silently re-bounds money first, so the advertised and enforced bounds are kept at the same numbers on both axes (PRD.md:1017-1041).

## The undeletable-signal doctrine (why these mechanisms are named the way they are)

A cross-cutting design law underlies the whole governance surface: **a system self-heals only at the loops it has — give every subsystem its loop, its named red, and its undeletable signal.** A red that lacks a name gets folded into a neighbor and teaches the wrong loop; a signal an emergent component can summarize can be suppressed (PRD.md:304-361). This minted, among other things, a dedicated `coordination-red` spine category (never folded into worker/interpreter-red), a lintable verdict/cost separation (no function may combine them into one scalar), a standing instrument obligation (every probe ships must-fail fixtures, measured before spend), attenuator manifests for every summarizing point, and a gated rule for amplifier truncation (ranked views never claim exhaustiveness; a declared-partial-view rule waits on its own probe) (PRD.md:304-361). Escalation text still reaches the human byte-identical to what the shell emitted — the pain channel is never summarized (PRD.md:304-361).

## An always-available future lever: the harness tightness audit

Docs-only, unfired, unbuilt (PRD.md:5018-5124). Distinct from the model-bump dead-weight replay (which fires only on a tier change), the tightness audit asks whether a rule is too tight or too loose **today**, at the tier already in use, in three steps: (1) a $0 archive sweep over enforced rules, producing "never fired" (dead-weight candidate) and "fired repeatedly on runs that later greened anyway" (friction candidate) lists — the too-loose side is deliberately not duplicated here since it already has three standing instruments; (2) a paired rule-ON/OFF contrast, fireable only on hamr's approval per candidate; (3) a separate tier contrast (sonnet vs opus, rules held identical) that must never be toggled in the same arm as step 2's rule toggle (PRD.md:5018-5124). The restated arbiter law: probes only propose, hamr parks or retires; no run ever adjusts its own harness in flight; self-healing is the sensor this audit reads offline, and the two must never merge — a loop that could relax the rule it keeps hitting has authored its own arbiter (PRD.md:5018-5124).
