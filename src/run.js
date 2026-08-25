// The runner — the shell's top layer. It owns everything the emergent parts
// must never touch: the approval gate (human-signs-always), the primitive
// smoke, the ONE budget ledger (cap-not-estimate; unpriced is never free, F6),
// and the decision-ready stops. It composes the plan flow below it and
// interprets nothing itself.
// Design record: docs/product/2026-07-12-n2-headless-loop-design.md.
//
// The legacy operator-authored `steps[]` path was DELETED 2026-07-26 (PRD
// v1.32): the drafting call, config-v1, the per-step interpret loops and the
// hitl draft-PR step went with it. runJob is now approval → smoke → ledger →
// runPlan, and `hitl`/`soft-green` return as a Layer 3 decision, rebuilt in the
// plan shape rather than ported.

import { join } from 'node:path';
import { LiteCtx } from 'litectx';
import { validateJob, jobSpecHash, checkApproval } from './job.js';
import { runPlan } from './planrun.js';
import { SMOKE_STORE, resolveHumanRuling } from './kinds.js';
import { readShimArm } from './readshim.js';

/** @typedef {{code: string, path: string, detail?: string}} Red */

/**
 * THE ROUND RECORDS THE ONE LEDGER SUMS — as data, because two of them now exist
 * and a hand-spelled condition per record is how a paid call comes to be free.
 *
 * `worker-round` is the attempt's own spend, metered per ROUND rather than per
 * attempt-return (F12: a halted attempt's spend was invisible by 300×).
 * `judge-round` is the CLOSE's, and it is the first spend a close has ever had:
 * the judged floor (softgreen) buys a pinned locate call per artifact, and the
 * budget-identity rule is that a budget funds the attempt PLUS its close. Both
 * carry the honest `costUsd` — a null lands as `unpriced` and halts, never as $0.
 *
 * What is deliberately NOT here: `worker-result` / `worker-plan`, which are
 * attempt TOTALS of the same rounds and would double-count.
 */
export const ACCOUNTED_ROUND_TYPES = Object.freeze(['worker-round', 'judge-round']);


/**
 * Known-answer smoke on the primitive the run is about to trust (PRD v1.5 §4,
 * adaptlearn A3): a silently-degraded store throws nothing — only a
 * remember→recall round-trip with a KNOWN answer can red it, and it must run
 * BEFORE tokens. Scratch namespace under the workdir so the real lineage store
 * is never polluted with probe facts.
 * @param {string} workdir
 */
async function primitiveSmoke(workdir) {
  try {
    const lc = new LiteCtx({ root: join(workdir, SMOKE_STORE) });
    await lc.remember('smoke-known-answer', 'bareloop primitive smoke: the answer is 42', { kind: 'fact' });
    const hits = await lc.recall('bareloop primitive smoke known answer', { kind: 'fact', n: 5, body: true });
    const ok = hits.some((h) => String(h.body ?? '').includes('the answer is 42'));
    return { ok, primitive: 'litectx', detail: ok ? `round-trip returned the known answer (${hits.length} hit(s))` : 'remember→recall round-trip lost the known answer' };
  } catch (e) {
    return { ok: false, primitive: 'litectx', detail: String(/** @type {Error} */ (e)?.message || e) };
  }
}


/**
 * Run an approved job end to end: approval gate → primitive smoke → sequential
 * per-step interpret loops under the one ledger → the hitl step opens the draft
 * PR (deterministic git, never model tools) and becomes the decision-ready
 * escalation. Every predicate step runs its close FIRST (close-first skip,
 * resume model): already-green skips the step for zero tokens as a distinct
 * spine record, so a stopped run reruns from where it died — the workdir plus
 * the closes are the checkpoint. The sealed config draft (one shot + one
 * redraft) is deferred to the first step that actually needs a worker; a clean
 * rerun pays zero provider calls.
 *
 * N2 bounds (honest, documented): text-mode steps write a single `target`
 * artifact; tool-mode steps (2b) work multi-file through the gated shell tools,
 * granted per step by the SPEC (mode/tools — the drafted config cannot express
 * either); `gold`/`rubric` closes refuse `close-unsupported` (execution lands
 * with the verdict classes, N4); the pricing-red halt lands at the step
 * boundary — the Gate still caps within a step, but an unpriced result cannot
 * be summed, so the run stops rather than counting it $0 (F6).
 *
 * EVERY terminal `job-end` states the money: `spentUsd` (the sum of PRICED
 * rounds only — never an estimate; a real 0 on the pre-token reds) plus
 * `spendComplete`, false when any round came back unpriced and the figure is
 * therefore a FLOOR, not the total. Both are always present, so a consumer
 * never branches on field presence nor launders a blank into $0.
 *
 * @param {object|string} rawSpec the job spec (job-v1), text or parsed
 * @param {object} opts
 * @param {unknown} opts.approvals `{ specHash, signer, ts }` records (from OUTSIDE the spec)
 * @param {string} opts.workdir the run directory (the fence's root)
 * @param {any} opts.provider shell-owned LLM binding (never the config's; the Loop path)
 * @param {(o: {policy: Function, onTurn?: Function, maxTurns: number, hasTools: boolean}) => any} [opts.nativeProvider]
 *   native clipipe provider factory (BA-16), required for a `clipipe-subscription` plan-shape job —
 *   threaded to runPlan, which builds one per worker (native tool mode when `hasTools`, else a
 *   metered claude-json text provider for the toolless drafter); ignored on every Loop-driven provider
 * @param {(type: string, data?: object) => object} opts.emit spine emitter
 * @param {(tier: string) => any} [opts.providerFor] P: per-step model-tier provider factory (forwarded to the plan flow)
 * @param {any} [opts.judgeProvider] SOFTGREEN — the provider a JUDGED close stage runs its
 *   locate call through, wired by the operator and PINNED to `JUDGE_MODEL` (src/judged.js:
 *   the only tier with established injection resistance upstream). Forwarded to the plan
 *   flow. It is its own seam and not `provider`/`providerFor`, because the judge tier is
 *   never a step knob and never agent-selectable; absent, a judged stage instrument-stops as
 *   a wiring gap rather than grading on whatever binding happened to be at hand. Its spend
 *   lands on this ledger as `judge-round` (see `ACCOUNTED_ROUND_TYPES`).
 * @param {number} [opts.capRuns] shell-owned iteration cap for the plan flow's
 *   CLOSE-FIX loop (a plan STEP runs under the strike ladder instead)
 * @param {number} [opts.strikeLimit] shell-owned strike ceiling for a plan step's ladder
 * @param {number} [opts.shellCapUsd] the shell's hard USD ceiling
 * @param {number} [opts.closeTimeoutMs] close wall-clock cap (shell territory)
 * @param {unknown} [opts.bridge] Layer 3 — a bridge-v1 entry to reuse as the drafter's
 *   STARTING DRAFT (design record 2026-08-01, D4), forwarded to the plan flow. Omitted is
 *   the cold path and is byte-identical to a pre-Layer-3 run. WHICH entry (the listing, an
 *   operator pin, the LLM's pick) is the caller's decision, and so is what to do when the
 *   load gate refuses one: a refusal returns the distinct `recipe-stale` outcome with zero
 *   spend rather than silently drafting cold, because starting a paid run on a decision
 *   nobody made is the same class of error as widening a cap to manufacture a green.
 * @param {number} [opts.priorSpentUsd=0] RESUME (module C) — money a PREVIOUS, killed
 *   attempt of this same try already spent. It seeds the ledger, so the restarted
 *   attempt runs under the REMAINDER of the signed `budgetUsd` and the terminal
 *   `job-end` states the try's WHOLE spend across both attempts. hamr's ruling: "a
 *   budget ceiling folds in prior spend so re-invoking cannot silently widen it" —
 *   the fold is the seam precisely because the CAP is in the spec hash, so
 *   tightening the cap instead would make a new spec version needing a signature
 *   nobody typed. The caller reconstructs the figure from the dead run's own spine.
 * @param {boolean} [opts.priorSpendComplete=true] RESUME — was that fold EXACT?
 *   `readResume` reports false when any round inside the dead attempt came back
 *   unpriced, which makes the fold a FLOOR. The unknown does not heal by being carried
 *   forward, so it rides one-way onto every `job-end` this run emits: a total built on
 *   a floor is a floor, and reporting it as exact is F6 in a resume's coat.
 * @param {number} [opts.priorWallMs=0] RESUME — the same ruling in a time coat: wall
 *   time the killed attempt already consumed, folded into the run clock so the
 *   restart gets the remainder of the SIGNED wall, never a fresh allotment.
 * @param {any} [opts.resumeSeed] RESUME (module C v2) — WHERE inside the killed attempt
 *   the kill landed, read off its own spine by `readResume`: the plan it accepted and the
 *   steps that reached their exits. Forwarded verbatim to the plan flow, which reloads
 *   the plan instead of re-scouting and re-drafting, and skips the finished steps.
 *   hamr's ruling: *"start last step instead from the beginning, why would i want to
 *   waste more money on something i already started"*. Absent is the ordinary path.
 * @param {{stage?: string|null, value?: number|null}[]} [opts.resumeGrades] RESUME — the
 *   close grades the killed leg recorded (`readResume`'s `restart.grades`), forwarded to
 *   the plan flow as the trend's BASELINES. A resumed run's halt readout judges the whole
 *   chain, not just the leg: without them a leg that re-grades an unchanged tree reports
 *   `flat` — "revise the goal" — on a run that was converging when the money ran out.
 *   Counts and stage names only; no close bytes cross this seam. Absent is the cold path.
 * @param {{count?: number, grantUsed?: boolean}|null} [opts.resumeReplans] RESUME — the
 *   replan LEDGER the chain has already spent (`readResume`'s `restart.replans` /
 *   `restart.replanGrantUsed`), forwarded to the plan flow, which seeds its ceiling with
 *   it. Its sibling above feeds a READOUT; this one feeds a BOUND, and that is the whole
 *   difference: `replanned`/`varianceGrantUsed` are locals in `runPlan`, so without this
 *   every kill hands the next leg a fresh allowance of an allowance PRD v1.12 makes the
 *   RUN's ("unlimited replanning launders thrash as adaptation"). It also rides onto this
 *   run's `job-start` as `priorReplans`, the declared-fold precedent `priorSpentUsd`
 *   already sets, so a resume OF a resume folds once. Absent is the cold path.
 * @param {string|null} [opts.resumeBranch] RESUME — the WORK BRANCH the killed attempt
 *   created and recorded on its own spine (`readResume`'s `restart.branch`). The branch
 *   name is DERIVED from the signed spec and is therefore identical on every leg, so
 *   without this the restart would collide with its own predecessor's branch and the
 *   collision walk would mint a `-2` beside the work the resume exists to continue. The
 *   fold's precedent exactly: the chain's state is DECLARED, never re-derived. Forwarded
 *   verbatim to the plan flow; absent is the cold path.
 * @param {boolean|'cap'|'diff'} [opts.readShim=false] THE READ SHIM (src/readshim.js) —
 *        WHICH ARM to run, threaded to the plan flow. The Phase 2 pre-registration's four:
 *          `false`  A0 — off (the default)
 *          `'cap'`  A1 — cap + pointer + next-unseen-slice + G1, no diff
 *          `'diff'` A2 — the diff lever alone: no cap, no pointer, no G1
 *          `true`   A3 — every lever
 *        Anything else THROWS below, before a token is spent: a mis-spelled arm coerced
 *        by truthiness into A3 would run one treatment under another's label and be
 *        invisible in the results afterwards.
 *        OFF is byte-identical to the pre-shim run in every observable (G1 included): the
 *        frozen A0 baseline arm has to be exactly today, so a guard firing under a disabled
 *        shim would make the baseline a treatment arm. The default-flip belongs to a
 *        paid contrast nobody has approved yet (the `layerRoot` precedent, F41).
 * @param {boolean} [opts.layerRoot=false] Layer R (within-run ratchet) — shell
 *        territory, threaded to the plan flow. Defaults OFF
 *        (decided 2026-07-21): fixation is extinct on every current job (F41), so
 *        ON has never won its own A/B — the acceptance read defers to Layer 2 (or
 *        a manufactured-fixation probe). `true` is the ON/experimental arm; the
 *        default is the OFF arm. (Shell-owned seam, same doctrine as the provider
 *        binding.)
 * @param {{decision: string, text?: string}|null} [opts.humanRuling] N4 — the SIGNER's
 *   answer at a hitl pause (accept | rerun <text> | pause), carried by the leg that
 *   RESUMES a paused run and forwarded verbatim to the plan flow. Absent on every
 *   ordinary run; never authored and never defaulted (a defaulted answer to "is this
 *   done?" is the rubber-stamp the class exists to prevent, 2026-08-12 §4).
 * @param {{decision: string, text?: string|null, receivedAt?: string|null}|null} [opts.heldRuling]
 *   F102 — the answer the CHECKPOINT holds (`readResume`'s `restart.pendingDecision`):
 *   a decision a person already gave on a leg that stopped before a single round was
 *   bought for it. Forwarded verbatim; the plan flow applies it exactly as a fresh one
 *   and refuses a leg handed both. It is also what decides whether the TIME fold this
 *   run declares is the chain's or this engagement's (F103).
 * @param {boolean|null} [opts.reviewDoor] MODULE 8 — does this run END at the review
 *   door (PRD v1.71 §3)? Forwarded verbatim to the plan flow, which owns the class
 *   default. It changes what the run RECORDS and never what it returns: the door is a
 *   disposition and the loop's verdict is not the door's to touch.
 * @param {{text: string, fromRunid?: string|null, receivedAt?: string|null}|null} [opts.doorRerun]
 *   MODULE 8 — this leg IS the fresh engagement a signer commissioned at a previous
 *   run's review door, carrying their words. Forwarded verbatim.
 * @returns {Promise<string>} outcome: 'green' | 'already-green' | 'escalated' |
 *   'unapproved-spec' | 'job-red' | 'smoke-red' | 'plan-red' | 'check-red' |
 *   'close-red' | 'close-unsupported' | 'recipe-stale' | 'branch-red' | 'pricing-red' | 'provider-red' |
 *   'interpreter-red' | 'cap-halt' | 'wall-halt' | 'step-stalled' |
 *   'hitl-pause' | 'hitl-decision-red' | `step-red:<id>`
 */
export async function runJob(rawSpec, { approvals, workdir, provider, nativeProvider, providerFor, judgeProvider = null, emit, capRuns = 3, strikeLimit, shellCapUsd = 2, closeTimeoutMs, layerRoot = false, readShim = false, bridge = null, priorSpentUsd = 0, priorSpendComplete = true, priorWallMs = 0, resumeSeed = null, resumeGrades = [], resumeReplans = null, resumeBranch = null, humanRuling = null, heldRuling = null, reviewDoor = null, doorRerun = null }) {
  // THE READ SHIM's ARM, resolved at the door — the FIRST thing this entry does,
  // before the ledger, before the approval gate, before a byte of the spec is read.
  // An unrecognised spelling throws here at zero cost instead of being coerced by
  // truthiness into A3 and running a whole paid battery row under an arm label it
  // never executed — a wrong result that looks like a fine one, which is the exact
  // blind-instrument failure this programme keeps logging. Only the guard runs
  // here; the flag itself is threaded onward to the plan flow as written.
  readShimArm(readShim);
  // 0. the ledger's counters, declared FIRST so that every job-end — including
  // the pre-token reds below — can state a real figure. An omitted `spentUsd` is
  // not a zero: a consumer reads `undefined` and either crashes or launders it
  // into $0 (F12's class, at the terminal record instead of mid-attempt).
  //
  // It starts at the RESUME fold rather than at 0 when a killed attempt of this
  // same try already spent money (see `priorSpentUsd`). Belted like every other
  // number that enters the arbiter's arithmetic: a garbage fold is 0, never a NaN
  // that would poison every later comparison into "no cap".
  let spentUsd = typeof priorSpentUsd === 'number' && Number.isFinite(priorSpentUsd) && priorSpentUsd > 0 ? priorSpentUsd : 0;
  /** F103's money half — the CHAIN's fold, kept as its own figure so `spentUsd`
   * (the chain total, what a person reads and what the ceiling governs) and THIS
   * ENGAGEMENT's spend can be stated side by side on every terminal. Two things
   * counted by one number will eventually be asked to disagree. */
  const chainFoldUsd = spentUsd;
  let unpriced = false;
  // RESUME (v1.46 §3): was the FOLD itself exact? `readResume` marks it false when any
  // round inside the dead attempt came back unpriced, and that unknown does not heal by
  // being carried forward — every round of THIS attempt being priced repairs nothing
  // about the one before it. One-way, like `stalled` and `cutMidCall`, and read by
  // `spend()`, so the terminal states a floor instead of an exact-looking total (F6).
  // Read off the FLAG alone, never conjoined with the money: a leg killed with every
  // round unpriced folds $0 and still says `false`, and that is a floor OF zero, not an
  // exact zero. Gating on `spentUsd > 0` dropped exactly that predecessor's unknown and
  // handed the resumed terminal an exact-looking total. The param defaults `true`, so a
  // run nobody resumed is unchanged.
  const priorFloor = priorSpendComplete === false;
  // W1: did this run ABSORB a stall? The terminal `step-stalled` is the rare case;
  // the common one self-heals (src/stall.js abandons the hung call and reissues),
  // and an abandoned call may already have been billed — a reissue can pay twice
  // and the provider never told us. So a run that stalls and then ends green (or
  // escalated, or at the cap) also holds a FLOOR, not a total.
  let stalled = false;
  // F64: did the wall cut this run from INSIDE a provider call? A `wall-halt` is two
  // stops wearing one name. Read between rounds (or between attempts, W-2) it is the
  // cleanest terminal there is — nothing was in flight, every round the sum counted
  // came back priced, and the figure is exact. But the deadline can also land inside a
  // call and come back as the provider's own timeout, and THAT call returned no usage
  // at all: it may already have been billed and will never say so. Same unknown as the
  // transport floor and the self-healed stall, so the same honest answer.
  // The discriminator is the wall-halt record's own `cutMidCall` field, never the
  // outcome — keying on the outcome would floor the exact stop too, which is the same
  // dishonesty pointing the other way.
  let cutMidCall = false;
  // F115 — did any worker call in this run absorb a transport-class retry
  // (hamr's ruling: one retry, transport-only, planrun.js `withTransportRetry`)?
  // The FIRST attempt of a retried call may already have been billed and threw
  // before returning any usage figure — the same unknown a self-healed stall
  // and a mid-call wall cut carry, so the same one-way floor applies even when
  // the retry recovered and the run finishes green. Read off the `transport-retry`
  // spine record's presence alone, never its `recovered` field: a recovered
  // retry still hides the first attempt's possible spend.
  let transportRetried = false;
  // The money on the terminal record, and whether the money is EXACT. `spentUsd`
  // is the accumulated sum of PRICED rounds ONLY — never an estimate derived
  // from tokens or averages (cap-not-estimate). When any round came back
  // unpriced (F6) that sum is a FLOOR, not the total, and `spendComplete: false`
  // says so machine-readably instead of dressing a floor up as exact. Emitted on
  // EVERY job-end (true when everything was priced) so no consumer ever has to
  // branch on field presence.
  // ONE spelling of the four causes, so the terminal and the in-flight money readout can
  // never disagree about whether the same run's figure is exact.
  const spendComplete = () => !unpriced && !stalled && !cutMidCall && !priorFloor && !transportRetried;
  const spend = () => ({
    spentUsd,
    spendComplete: spendComplete(),
    // F103's second counter, on every terminal beside the chain total it is NOT.
    // `spentUsd` is cumulative-so-far (this job, across engagements) and governs the
    // ceiling; this is what THIS engagement spent. Always emitted, never conditional
    // on there being a fold: a consumer that has to branch on field presence is a
    // consumer that will read absence as zero.
    engagementSpentUsd: Math.max(0, spentUsd - chainFoldUsd),
  });
  // 1. human-signs-always — before ANY provider call (N1 decision #1)
  if (!checkApproval(rawSpec, approvals)) {
    emit('job-end', { outcome: 'unapproved-spec', detail: 'no approval record matches this exact spec version', ...spend() });
    return 'unapproved-spec';
  }
  const jv = validateJob(rawSpec, { shellCapUsd });
  if (!jv.ok) {
    for (const r of jv.reds) emit('job-red', r);
    emit('job-end', { outcome: 'job-red', ...spend() });
    return 'job-red';
  }
  const job = /** @type {any} */ (jv.job);
  /** F103 — the two TIME figures, resolved once here and read the same way by
   * `runPlan`'s clock. An unreadable ruling resolves to `fresh: false` and folds as
   * it always did; `runPlan` is where it is refused, so this never has to. */
  const chainWallMs = typeof priorWallMs === 'number' && Number.isFinite(priorWallMs) && priorWallMs > 0 ? priorWallMs : 0;
  const wallFold = resolveHumanRuling(humanRuling, heldRuling, doorRerun).fresh ? 0 : chainWallMs;
  emit('job-start', {
    job: job.job, specHash: jobSpecHash(job), budgetUsd: job.budgetUsd,
    shape: 'plan', goal: job.goal,
    // RESUME (v1.46 §3) — the DECLARED fold, the `try-start` precedent one level
    // down. A reader reconstructing a chain of resumes must add only each attempt's
    // OWN new rounds; without this record the second resume of a halted run would
    // re-derive from its own file alone and silently widen the ceiling by everything
    // spent before it. Emitted only when there IS a fold: an absent fold is absent,
    // and a decorative `0` would be indistinguishable from a run nobody folded.
    // A fold of $0 that is NOT exact is still a fold — the unknown is the whole of what
    // it inherited, and it is the only field that can carry it forward.
    ...(spentUsd > 0 || priorFloor ? { priorSpentUsd: spentUsd, priorSpendComplete: !priorFloor } : {}),
    // …and the TIME fold, which F103 splits in two. `priorWallMs` is what the next
    // reader ADDS to (the bound), and it is engagement-scoped: a rerun opens a fresh
    // engagement, so the minutes the person did not commission are not a bound on
    // anybody. `chainWallMs` is the cumulative view and is declared whenever there is
    // one, so nothing is lost — the readout keeps spanning the chain (the halt readout
    // and the leg's own governor answer different questions and are never mixed).
    // The `fresh` reading comes from the ONE resolver `runPlan`'s clock reads, never a
    // second spelling of "is this a rerun" (that is how a record and a clock come to
    // disagree about the same leg).
    ...(wallFold > 0 ? { priorWallMs: wallFold } : {}),
    ...(chainWallMs > 0 && chainWallMs !== wallFold ? { chainWallMs } : {}),
    // the REPLAN ledger, on the same declaration and for the same reason — a chain of
    // resumes must fold once. This is the DIRECT-spine half of it: `readResume`'s
    // `direct` mode opens its one implicit window on `job-start` and reads the fold off
    // these very fields, so a U-path run resumed twice inherits leg 1's replans rather
    // than restarting the ceiling at leg 2's window (PRD v1.12). Emitted only when there
    // is one — a decorative `0` is indistinguishable from a run nobody folded, and the
    // grant latch travels beside the count rather than being derived from it.
    ...(typeof resumeReplans?.count === 'number' && Number.isFinite(resumeReplans.count) && resumeReplans.count > 0
      ? { priorReplans: Math.floor(resumeReplans.count), priorReplanGrantUsed: resumeReplans.grantUsed === true }
      : {}),
  });

  // 2. known-answer smoke before tokens (A3: silent degradation throws nothing)
  const smoke = await primitiveSmoke(workdir);
  emit('primitive-smoke', smoke);
  if (!smoke.ok) {
    emit('escalation', { category: 'smoke-red', decisionReady: true, decision: `The ${smoke.primitive} primitive failed its known-answer check — no run verdict is trustworthy on a degraded primitive.`, options: ['fix the primitive/store', 'abandon the run'], detail: smoke.detail });
    emit('job-end', { outcome: 'smoke-red', ...spend() });
    return 'smoke-red';
  }

  // 3. the ONE ledger. Unpriced is never free (F6): a null cost can't be
  // summed, so it flags a stop instead of accumulating $0.
  /** @param {number|null|undefined} c */
  const account = (c) => { if (typeof c === 'number' && Number.isFinite(c)) spentUsd += c; else unpriced = true; };
  /** @type {(type: string, data?: object) => object} */
  const meter = (type, data) => {
    // The ledger counts ROUNDS, not attempts (F12). `worker-round` fires as each
    // round is bought — including the round that trips the gate — so an attempt
    // that HALTS mid-flight (loop.run never returns, no worker-result, no
    // worker-plan) still lands its real spend here. Accounting the attempt-level
    // events instead made the real run report $0.0048 of a $1.4375 spend.
    // Round-level is also the ONLY level that cannot double-count: worker-result
    // and worker-plan are attempt TOTALS of these same rounds — they stay on the
    // spine for display and are deliberately NOT accounted.
    // `account` reds the run on ANY unpriced round (a null cost is the honest
    // unknown, never $0 — F6): per-round metering means a partially-unpriced run
    // is caught natively, round by round, with no separate unpricedRounds tally.
    // …and the CLOSE's own rounds sum into the same wallet the moment a close can
    // spend at all (the judged floor): one ledger, never a second arithmetic.
    if (ACCOUNTED_ROUND_TYPES.includes(type)) account(/** @type {any} */ (data)?.costUsd);
    // W1: a `stall` is the plan flow announcing it ABANDONED a call and reissued
    // it. The abandoned call's spend is unknowable from here (billed or not,
    // indistinguishable), so from this point the priced sum is a floor no matter
    // how the run ends — the flag is one-way and read by `spend()`.
    if (type === 'stall') stalled = true;
    // F64: the plan flow's own TIME record says which of the two wall stops this was.
    // One-way, and read by `spend()` — the run ends on this record either way, but the
    // between-rounds stop must keep its exact figure rather than inheriting a floor.
    if (type === 'wall-halt' && /** @type {any} */ (data)?.cutMidCall === true) cutMidCall = true;
    // F115 — one-way, same lane as `stall`/`cutMidCall`: a transport retry's
    // FIRST attempt threw before any usage figure came back, so the priced sum
    // is a floor for the rest of the run regardless of `recovered`.
    if (type === 'transport-retry') transportRetried = true;
    return emit(type, data);
  };
  const pricingRed = () => {
    emit('escalation', { category: 'pricing-red', decisionReady: true, decision: 'A provider result carried no priced cost — the hard cap cannot govern spend it cannot see (unpriced is never free, F6).', options: ['bind a priced provider/model', 'abandon the run'], spentUsd });
    emit('job-end', { outcome: 'pricing-red', ...spend() });
    return 'pricing-red';
  };

  // ── the plan flow (SCOUT → PLAN → EXECUTE → close) under the approval gate,
  // the smoke and the ledger above — runJob stays the one entry (N2 lock).
  // runPlan emits every provider round as worker-round, so the metered emit
  // accounts it natively (F12) and the job-end money contract is unchanged.
  {
    const outcome = await runPlan(job, {
      workdir, provider, nativeProvider, providerFor, judgeProvider, emit: meter, capRuns, ...(strikeLimit !== undefined ? { strikeLimit } : {}), closeTimeoutMs, layerRoot, readShim, bridge, priorWallMs: chainWallMs, resumeSeed, resumeGrades, resumeReplans, resumeBranch, humanRuling, heldRuling, reviewDoor, doorRerun, priorSpentUsd: chainFoldUsd,
      remainingUsd: () => Math.min(shellCapUsd, job.budgetUsd - spentUsd),
      isUnpriced: () => unpriced, // F6: let the plan flow bail in-flight, not just after it returns
      spendComplete, // …and let its money-halt readout say whether the remaining it quotes is exact
    });
    if (unpriced) return pricingRed();
    if (outcome.startsWith('step-red:')) {
      emit('job-end', { outcome: 'step-red', step: outcome.slice('step-red:'.length), ...spend() });
    } else if (outcome === 'provider-red' || outcome === 'step-stalled') {
      // F44: a transport-throw provider-red never returned a usage figure for the
      // failed call, so the priced sum is a FLOOR, not the total — spendComplete
      // false, never an exact-looking total.
      // F66: `step-stalled` carries the same unknown. Every abandoned call MAY
      // already have been billed by the provider before it went quiet — that is
      // the known cost of self-heal — and an unbilled reissue is indistinguishable
      // from a billed one from here. Reporting the priced sum as exact would be F6
      // in a self-heal coat.
      emit('job-end', { outcome, ...spend(), spendComplete: false });
    } else {
      emit('job-end', { outcome, ...spend() });
    }
    return outcome;
  }
}
