// The runner — the shell's top layer. It owns everything the emergent parts
// must never touch: the approval gate (human-signs-always), the primitive
// smoke, the ONE budget ledger (cap-not-estimate; unpriced is never free, F6),
// and the decision-ready stops. It composes the plan flow below it and
// interprets nothing itself.
// Design record: docs/plans/2026-07-12-n2-headless-loop-design.md.
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

/** @typedef {{code: string, path: string, detail?: string}} Red */


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
    const lc = new LiteCtx({ root: join(workdir, '.smoke') });
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
 * @param {number} [opts.capRuns] shell-owned per-step attempt cap
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
 * @param {number} [opts.priorWallMs=0] RESUME — the same ruling in a time coat: wall
 *   time the killed attempt already consumed, folded into the run clock so the
 *   restart gets the remainder of the SIGNED wall, never a fresh allotment.
 * @param {boolean} [opts.layerRoot=false] Layer R (within-run ratchet) — shell
 *        territory, threaded to the plan flow. Defaults OFF
 *        (decided 2026-07-21): fixation is extinct on every current job (F41), so
 *        ON has never won its own A/B — the acceptance read defers to Layer 2 (or
 *        a manufactured-fixation probe). `true` is the ON/experimental arm; the
 *        default is the OFF arm. (Shell-owned seam, same doctrine as the provider
 *        binding.)
 * @returns {Promise<string>} outcome: 'green' | 'already-green' | 'escalated' |
 *   'unapproved-spec' | 'job-red' | 'smoke-red' | 'plan-red' | 'check-red' |
 *   'close-red' | 'close-unsupported' | 'recipe-stale' | 'pricing-red' | 'provider-red' |
 *   'interpreter-red' | 'cap-halt' | 'wall-halt' | 'step-stalled' | `step-red:<id>`
 */
export async function runJob(rawSpec, { approvals, workdir, provider, nativeProvider, providerFor, emit, capRuns = 3, shellCapUsd = 2, closeTimeoutMs, layerRoot = false, bridge = null, priorSpentUsd = 0, priorWallMs = 0 }) {
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
  let unpriced = false;
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
  // The money on the terminal record, and whether the money is EXACT. `spentUsd`
  // is the accumulated sum of PRICED rounds ONLY — never an estimate derived
  // from tokens or averages (cap-not-estimate). When any round came back
  // unpriced (F6) that sum is a FLOOR, not the total, and `spendComplete: false`
  // says so machine-readably instead of dressing a floor up as exact. Emitted on
  // EVERY job-end (true when everything was priced) so no consumer ever has to
  // branch on field presence.
  const spend = () => ({ spentUsd, spendComplete: !unpriced && !stalled && !cutMidCall });
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
  emit('job-start', {
    job: job.job, specHash: jobSpecHash(job), budgetUsd: job.budgetUsd,
    shape: 'plan', goal: job.goal,
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
    if (type === 'worker-round') account(/** @type {any} */ (data)?.costUsd);
    // W1: a `stall` is the plan flow announcing it ABANDONED a call and reissued
    // it. The abandoned call's spend is unknowable from here (billed or not,
    // indistinguishable), so from this point the priced sum is a floor no matter
    // how the run ends — the flag is one-way and read by `spend()`.
    if (type === 'stall') stalled = true;
    // F64: the plan flow's own TIME record says which of the two wall stops this was.
    // One-way, and read by `spend()` — the run ends on this record either way, but the
    // between-rounds stop must keep its exact figure rather than inheriting a floor.
    if (type === 'wall-halt' && /** @type {any} */ (data)?.cutMidCall === true) cutMidCall = true;
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
      workdir, provider, nativeProvider, providerFor, emit: meter, capRuns, closeTimeoutMs, layerRoot, bridge, priorWallMs,
      remainingUsd: () => Math.min(shellCapUsd, job.budgetUsd - spentUsd),
      isUnpriced: () => unpriced, // F6: let the plan flow bail in-flight, not just after it returns
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
