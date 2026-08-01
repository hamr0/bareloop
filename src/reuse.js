// Layer 3 — the D7 ENVELOPE and the REUSE RUNNER (design record
// docs/plans/2026-08-01-layer-3-reuse-design.md, D3/D5/D6/D7 + R1).
//
// hamr's sentence is the whole specification of this file, verbatim:
//
//   *"part of reuse we ask user for cost/time and how many workflows to try before
//   starting new like $5 and 30 mins x2 then start anew if both red"*
//
// So: three operator numbers signed up front, N tries at a stored workflow, then a cold
// draft — and every stop decision-ready. This module COMPOSES; it decides nothing the
// arbiter owns. The envelope is operator input, selection never edits a spec, and a
// bridge is minted only by this runner's own graded green.
//
// Four rules are structural here rather than conventional:
//
//  - **The envelope may only TIGHTEN.** The advertised budget and the enforced budget are
//    the same number, and the agent never widens its own cap. An envelope whose per-try
//    numbers exceed the SIGNED spec's is a validation red — never a silent raise. And
//    because tightening produces a genuinely different spec, it produces a different
//    spec HASH: the tightened run is a new spec VERSION and the approval gate refuses it
//    until the operator signs that version. This module cannot forge that signature and
//    deliberately has no way to try (it hands `approvals` straight through).
//  - **No defaults, anywhere in the envelope.** All three numbers are required and
//    explicit, for `maxWallMs`'s reason: a defaulted cap is a silent second ceiling, and
//    an unbounded run must be a VISIBLE operator choice.
//  - **R1 — only a green writes the box.** A green appends a VERSION (the plan AS
//    EXECUTED, read from the run's own spine) plus a history row. A graded red appends a
//    history row and nothing else: the recipe that greened stays exactly as it greened.
//    A CASUALTY is not a red — it keeps its own outcome name, and `deriveStatus` already
//    refuses to demote on anything but a literal `'red'`.
//  - **D3 — the operator's pick is the operator's.** A pin does not skip the selection
//    call, it enters it; a model that will not use the pin must refuse it by name, and
//    the run then STOPS and hands the decision back. Neither side gets to override the
//    other silently.
//
// **F45, stated because it cannot be enforced from here:** a try's budget must fund the
// attempt PLUS its close, and nothing in this process can know what a close costs — the
// close is an operator command whose price is its own. So no threshold is invented (a
// threshold is arbiter territory, set from a measured base rate, never fitted to the
// sample in hand). What this module does instead is make the bind VISIBLE: every try row
// carries `spentUsd` against `capUsd`, `wallMs` against `wallCapMs`, `capBound`, and
// `closeReached` — a try whose money ran out before the close ever rendered a verdict is
// a fact on the row, not an inference the reader has to make.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadRegistry, saveBridge, appendGreen, appendRed, mintBridge, registryExists } from './bridges.js';
import { renderListing, selectionPrompt } from './selection.js';
import { stageClose } from './plan.js';
import { MIN_WALL_MS, jobSpecHash } from './job.js';
import { isObj, isNonEmptyString } from './validate.js';
import { extractArtifact, priceOf } from './text.js';
import { runJob as shippedRunJob } from './run.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** @typedef {{code: string, path: string, detail?: string}} Red */

/**
 * The GRADED-RED set: the runJob outcomes in which the operator's close actually
 * rendered a verdict on the tree and that verdict was RED. Only these demote (D6).
 *
 * `escalated` is the one. It is the terminal runPlan returns when the close judged the
 * tree, the bounded fix loop ran its attempts with money still on the table, and the
 * close was still red — i.e. the recipe was graded by the job's own truth and failed.
 *
 * Everything else non-green is a CASUALTY and keeps its own name:
 *  - `cap-halt` / `wall-halt` — governance stops. A money cut is never a capability read
 *    (F45) and the wall keeps the verdict already minted (W-2).
 *  - `provider-red` / `step-stalled` / `pricing-red` — transport and metering.
 *  - `close-red` / `close-unsupported` — the close FAULTED (broken, timed out, killed,
 *    crashed). It rendered no judgment, so its exit says nothing about the tree.
 *  - `recipe-stale` — the load gate refused the recipe at the door, $0 spent.
 *  - `plan-red` / `step-red:<id>` / `check-red` — the plan flow stopped before the close
 *    ever judged. Read as evidence about the RECIPE these would be a guess; they are
 *    recorded in full on the history row, which is where D6 puts the detail a human
 *    reads, and the coarse status ladder is left alone.
 *  - `unapproved-spec` / `job-red` / `smoke-red` / `interpreter-red` — the run never
 *    started.
 */
export const REUSE_GRADED_RED = Object.freeze(['escalated']);

/** the selection call's token ceiling. The answer is one small JSON object, but the cap
 * is sized for the drafter's reason, not the answer's: an adaptive-thinking model can
 * think past a tight budget and return EMPTY text at `stop=max_tokens` (measured, ~$0.40
 * wasted per call), and F30 is the same class one step down. Same number the plan drafter
 * uses — one spelling, so the two cannot drift. */
const SELECTION_MAX_TOKENS = 32_000;

// ── D7: the envelope ────────────────────────────────────────────────────────

/**
 * Validate the reuse envelope — the three numbers the operator signs before the run.
 *
 * `{ perTryBudgetUsd, perTryWallMs, bridgeTries }`, all REQUIRED and explicit. There is
 * no default for any of them and there will not be one: hamr's ruling on `maxWallMs`
 * generalises — a defaulted cap is a silent second ceiling, and a cap the operator did
 * not state is a cap nobody chose.
 *
 * `bridgeTries: 0` is legal and means FORCE COLD: zero stored workflows are tried, the
 * run drafts from scratch, and no selection call is made (nothing to select among).
 *
 * With a `job`, the composition rule is enforced: the per-try numbers may only TIGHTEN
 * the signed spec. A per-try budget above `job.budgetUsd`, or a per-try wall above
 * `job.maxWallMs`, is `envelope-widens` — the runner may narrow the operator's cap, never
 * widen it. A spec that sets NO `maxWallMs` is time-unbounded by explicit choice, so any
 * wall is a tightening of it.
 *
 * @param {unknown} input the operator's envelope
 * @param {{job?: unknown}} [opts] the SIGNED spec, when the composition is being checked
 * @returns {{ ok: boolean, reds: Red[], envelope: any }}
 */
export function validateEnvelope(input, { job } = {}) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };
  if (!isObj(input)) {
    return { ok: false, reds: [{ code: 'invalid-value', path: '$', detail: 'the reuse envelope is an object { perTryBudgetUsd, perTryWallMs, bridgeTries }' }], envelope: null };
  }
  const e = /** @type {Record<string, any>} */ (input);
  for (const key of Object.keys(e)) {
    if (!['perTryBudgetUsd', 'perTryWallMs', 'bridgeTries'].includes(key)) red('unknown-field', key, 'fields: perTryBudgetUsd, perTryWallMs, bridgeTries');
  }

  // Each number is checked for PRESENCE first and separately: an absent cap and an
  // out-of-bounds one are different operator mistakes, and collapsing them would let a
  // missing number be reported as if a number had been read.
  if (e.perTryBudgetUsd === undefined) red('missing-required', 'perTryBudgetUsd', 'the per-try money cap, in USD — explicit, never defaulted');
  else if (!(typeof e.perTryBudgetUsd === 'number' && Number.isFinite(e.perTryBudgetUsd) && e.perTryBudgetUsd > 0)) {
    red('bounds', 'perTryBudgetUsd', 'a number greater than 0 (cap-not-estimate)');
  }

  if (e.perTryWallMs === undefined) red('missing-required', 'perTryWallMs', 'the per-try wall-clock cap, in ms — explicit, never defaulted');
  else if (!(typeof e.perTryWallMs === 'number' && Number.isInteger(e.perTryWallMs) && e.perTryWallMs >= MIN_WALL_MS)) {
    red('bounds', 'perTryWallMs', `integer milliseconds >= ${MIN_WALL_MS} (one close timeout — a try that cannot fund its own close produces an unreadable row, and an unreadable row is a casualty, not evidence: F45)`);
  }

  if (e.bridgeTries === undefined) red('missing-required', 'bridgeTries', 'how many stored workflows to try before drafting cold — 0 means force-cold');
  else if (!(typeof e.bridgeTries === 'number' && Number.isInteger(e.bridgeTries) && e.bridgeTries >= 0)) {
    red('bounds', 'bridgeTries', 'a non-negative integer (0 = force-cold)');
  }

  // the composition with the SIGNED spec — tighten only, in both dimensions
  if (isObj(job)) {
    const j = /** @type {Record<string, any>} */ (job);
    if (typeof e.perTryBudgetUsd === 'number' && typeof j.budgetUsd === 'number' && e.perTryBudgetUsd > j.budgetUsd) {
      red('envelope-widens', 'perTryBudgetUsd', `${e.perTryBudgetUsd} exceeds the signed budget ${j.budgetUsd} — the envelope may only TIGHTEN a signed cap; raising one is a spec edit the operator signs, never a runner's silent raise`);
    }
    // an ABSENT maxWallMs is time-unbounded by explicit operator choice, so every wall
    // tightens it — the only widening direction that exists is a bigger number over a
    // stated one
    if (typeof e.perTryWallMs === 'number' && typeof j.maxWallMs === 'number' && e.perTryWallMs > j.maxWallMs) {
      red('envelope-widens', 'perTryWallMs', `${e.perTryWallMs} exceeds the signed wall ${j.maxWallMs} — the envelope may only TIGHTEN a signed cap`);
    }
  }

  return reds.length === 0
    ? { ok: true, reds: [], envelope: { perTryBudgetUsd: e.perTryBudgetUsd, perTryWallMs: e.perTryWallMs, bridgeTries: e.bridgeTries } }
    : { ok: false, reds, envelope: null };
}

/**
 * The PER-TRY spec: the signed job with the envelope's caps written onto it. Pure — the
 * input spec is never mutated.
 *
 * This is what every try actually runs, cold leg included, so "$5 and 30 mins x2 then
 * start anew" means the same numbers all the way down.
 *
 * **It is a spec VERSION, not a spec edit made behind the operator's back.** When the
 * envelope equals the spec's own numbers the result is hash-IDENTICAL and the existing
 * approval covers it. When it tightens, the hash MOVES — and `runJob`'s approval gate
 * refuses the run until the operator has signed that hash. That refusal is the feature:
 * the tightened numbers are the ones enforced, so they are the ones signed.
 *
 * @param {object} job the signed spec
 * @param {{perTryBudgetUsd: number, perTryWallMs: number}} envelope a validated envelope
 * @returns {object} the per-try spec
 */
export function resolveTrySpec(job, envelope) {
  return { ...job, budgetUsd: envelope.perTryBudgetUsd, maxWallMs: envelope.perTryWallMs };
}

// ── D3: the selection call ──────────────────────────────────────────────────

/**
 * Ask the model which stored workflow (if any) this run should start from — ONE call, on
 * the drafter-tier provider the CALLER hands in. No provider is constructed here: the
 * provider binding is shell territory, exactly as it is for every other call in this
 * repo.
 *
 * The three operator overrides ride into the same call rather than around it:
 *  - `forceCold` skips everything ($0, no tokens) — the operator has already decided.
 *  - `shortlist` restricts the LISTING to those names, so the model chooses among the
 *    operator's set and cannot reach past it.
 *  - `pinned` does NOT bypass the call. D3: the model may refuse a pin only EXPLICITLY,
 *    with a reason. So the pin is stated in the prompt, and if the answer names anything
 *    other than the pin the result is `{refused: true}` — the substitute is NOT adopted,
 *    and the decision goes back to the operator. Neither direction is silent.
 *
 * An EMPTY candidate set also skips the call: paying a model to pick from an empty
 * listing buys nothing, and "there is nothing to reuse" is not a judgment call.
 *
 * The answer is parsed with the repo's ONE model-output parser (`extractArtifact`) and
 * then strictly: an object with a `choice` that is null or a name FROM THE LISTING, plus
 * a `reason`. A name that is not on the listing is a named red, never used — a picker
 * that can name a workflow nobody offered is a picker that can reach outside the
 * operator's set.
 *
 * Cost is metered and reported (F6): `costUsd` is the priced figure or an explicit null,
 * and `spendComplete` says whether that figure is exact. A skipped call is a real 0.
 *
 * @param {object} opts
 * @param {unknown} opts.registry `loadRegistry`'s result, or a bare array of entries
 * @param {object} opts.job the job this run is signed against (only its goal is used here)
 * @param {string} opts.ask the ask, in the operator's own words
 * @param {any} opts.provider the drafter-tier provider binding (caller-owned)
 * @param {string|null} [opts.pinned] the operator's pin
 * @param {string[]|null} [opts.shortlist] the operator's shortlist
 * @param {boolean} [opts.forceCold]
 * @param {string[]} [opts.exclude] names already tried this run
 * @returns {Promise<any>} `{ choice, reason, called, refused, forcedCold, red, costUsd,
 *   spendComplete, candidates, listing }`
 */
export async function selectBridge({ registry, job, ask, provider, pinned = null, shortlist = null, forceCold = false, exclude = [] }) {
  const r = /** @type {any} */ (registry);
  const all = (Array.isArray(r) ? r : (Array.isArray(r?.bridges) ? r.bridges : [])).filter(isObj);
  const skipReds = Array.isArray(r?.reds) ? r.reds : [];
  const excluded = new Set(exclude);
  const shortSet = Array.isArray(shortlist) ? new Set(shortlist) : null;
  const candidates = all.filter((/** @type {any} */ b) => !excluded.has(b.name) && (!shortSet || shortSet.has(b.name)));

  /** the shape every return here holds, so a caller never branches on field presence */
  const base = { choice: null, reason: '', called: false, refused: false, forcedCold: false, red: null, costUsd: 0, spendComplete: true, candidates: candidates.map((/** @type {any} */ b) => b.name), listing: null, pinned };

  if (forceCold) {
    return { ...base, forcedCold: true, reason: 'the operator forced a cold draft — no workflow was offered and no selection call was made' };
  }
  if (candidates.length === 0) {
    return { ...base, reason: exclude.length || shortSet ? 'no workflow remains to offer (every candidate was excluded or outside the shortlist)' : 'the registry holds no reusable workflow' };
  }

  // the listing the MODEL reads is the listing a human reads — same function, same text,
  // and the skip reds travel with it so a picker is never handed a set shorter than the
  // directory without being told
  const listing = renderListing({ ok: skipReds.length === 0, reds: skipReds, bridges: candidates });
  const prompt = selectionPrompt(listing, ask, pinned);

  let result;
  try {
    const loop = new Loop({ provider });
    result = await loop.run([{ role: 'user', content: prompt }], [], { maxTokens: SELECTION_MAX_TOKENS });
  } catch (e) {
    // a throw out of the selection call is TRANSPORT — a casualty, and the run stops on
    // it rather than quietly drafting cold on a decision that was never made
    return { ...base, called: true, listing, costUsd: null, spendComplete: false, red: { code: 'provider-red', path: 'selection', detail: String(/** @type {Error} */ (e)?.message ?? e) } };
  }
  const { costUsd, unpricedRounds } = priceOf(result);
  const met = { called: true, listing, costUsd, spendComplete: costUsd !== null && unpricedRounds === 0 };

  if (result?.error) {
    // bare-agent short-circuits an API-truncated round into `error` — provider-red by
    // standing doctrine (never a config-red blaming the picker)
    return { ...base, ...met, red: { code: 'provider-red', path: 'selection', detail: String(result.error) } };
  }

  const { code } = extractArtifact(result?.text);
  let parsed;
  try { parsed = JSON.parse(code ?? ''); } catch (e) {
    return { ...base, ...met, red: { code: 'selection-unparseable', path: 'selection', detail: `the answer was not the one JSON object the prompt asks for: ${String(/** @type {Error} */ (e)?.message ?? e)}` } };
  }
  if (!isObj(parsed)) {
    return { ...base, ...met, red: { code: 'selection-unparseable', path: 'selection', detail: 'the answer parsed to something other than a JSON object' } };
  }
  const p = /** @type {Record<string, any>} */ (parsed);
  const reason = isNonEmptyString(p.reason) ? p.reason : '(no reason given)';
  if (p.choice !== null && !isNonEmptyString(p.choice)) {
    return { ...base, ...met, reason, red: { code: 'selection-invalid', path: 'choice', detail: 'choice must be an exact name from the listing, or null' } };
  }
  if (p.choice !== null && !base.candidates.includes(p.choice)) {
    return { ...base, ...met, reason, red: { code: 'selection-invalid', path: 'choice', detail: `"${p.choice}" is not on the listing it was given — a pick outside the offered set is never used` } };
  }

  // D3's pin rule, both directions. The pin is honoured when confirmed; when it is not,
  // the ANSWER is not adopted — a refusal is a decision for the operator, and adopting
  // the model's substitute would be exactly the silent override the rule forbids.
  if (pinned && p.choice !== pinned) {
    return { ...base, ...met, refused: true, reason };
  }
  return { ...base, ...met, choice: p.choice, reason };
}

// ── the try loop ────────────────────────────────────────────────────────────

/** what the run's own spine says about a try, read back after it returns
 * @param {any[]} events @returns {any} */
function readTry(events) {
  const last = (/** @type {string} */ t) => events.filter((e) => e.type === t).at(-1) ?? null;
  const je = last('job-end');
  const oc = last('outer-close');
  const pa = last('plan-accepted');
  return {
    // F6: a job-end that never landed is an UNKNOWN spend, not a zero. `spentUsd` is
    // read as a number or explicit null, and `spendComplete` can never be true without
    // a figure to complete.
    spentUsd: typeof je?.spentUsd === 'number' && Number.isFinite(je.spentUsd) ? je.spentUsd : null,
    spendComplete: typeof je?.spentUsd === 'number' && je?.spendComplete === true,
    // the plan AS EXECUTED (R1): the last accepted plan is the one that ran — a replan
    // emits its own `plan-accepted`, and it is the post-replan artifact that inherits
    plan: pa?.plan ?? null,
    rounds: events.filter((e) => e.type === 'worker-round' && e.kind === 'turn').length,
    // which stage rendered the verdict, and whether the close was reached AT ALL — the
    // second is F45's visible half: a try whose cap bound before any grading is a
    // casualty by shape, and the row says so instead of leaving it to be inferred
    failingStage: isNonEmptyString(oc?.stage) ? oc.stage : null,
    closeReached: oc !== null,
  };
}

/**
 * Run a job under the reuse envelope: select a stored workflow, try it, and — if the
 * envelope pre-authorized it — try the next one, then draft cold.
 *
 * The shape, end to end:
 *
 * 1. **Envelope** validated against the SIGNED spec (tighten-only). A red stops here,
 *    before the registry is read and before anything is spent.
 * 2. **Registry** loaded from the operator-supplied directory (never a default location).
 *    A missing directory is a named red; a malformed ENTRY is skipped, reported, and
 *    carried into the listing so the picker is never handed a silently shorter set.
 * 3. **Up to `bridgeTries` tries.** Each try re-runs selection against a FRESHLY RELOADED
 *    registry with the already-tried names excluded — so the next pick sees the row the
 *    last try just wrote, and cannot re-pick a workflow this run already spent money on.
 *    The chosen entry rides into `runJob`, whose own load gate is the D2 shape check; a
 *    gate refusal (`recipe-stale`) costs $0 and simply moves to the next candidate.
 * 4. **After each try the box is written (R1)** — green appends a version + a row, a
 *    graded red appends a row, a casualty appends a row under its own name. Saved
 *    atomically, one write per try.
 * 5. **A green ENDS the loop.** The job is done; there is nothing left to try.
 * 6. **Tries exhausted → the cold leg**, under the SAME per-try numbers ("then start
 *    anew"). Its green mints a NEW bridge named for the job slug — or appends to the
 *    entry of that name if one already exists, because clobbering a green is exactly the
 *    thing R1 exists to prevent.
 *
 * Fallthrough is automatic ONLY because the envelope pre-authorized it (D7) — that is
 * what makes it not a per-failure nag, and it is also why nothing else here is automatic:
 * a refused pin, an unreadable selection answer and a missing registry all STOP and hand
 * the decision back.
 *
 * @param {object} opts
 * @param {object} opts.job the signed job spec
 * @param {unknown} opts.approvals approval records — passed straight through to `runJob`;
 *   this module never mints one (a tightened envelope makes a NEW spec version, and the
 *   operator signs it)
 * @param {string} opts.registryDir the operator-supplied bridge registry
 * @param {unknown} opts.envelope `{ perTryBudgetUsd, perTryWallMs, bridgeTries }`
 * @param {string} opts.patient the instance this run works on — the distinct-patient
 *   count IS the status ladder (D6/R2), so it is required and never guessed from a path
 * @param {string} opts.workdir the run directory
 * @param {any} opts.provider the worker provider binding
 * @param {any} [opts.selectionProvider] the drafter-tier provider for the selection call
 *   (defaults to `provider`)
 * @param {(type: string, data?: object) => object} opts.emit spine emitter
 * @param {string} [opts.ask] the ask in the operator's words (defaults to the job's goal)
 * @param {string|null} [opts.pinned]
 * @param {string[]|null} [opts.shortlist]
 * @param {boolean} [opts.forceCold]
 * @param {string} [opts.runid] the run id the bridge rows point back at (defaults to a
 *   fresh one); the operator runner passes its own so a row names its spine file
 * @param {any} [opts.providerFor] per-step model-tier factory, forwarded
 * @param {any} [opts.nativeProvider] native provider factory, forwarded
 * @param {number} [opts.capRuns] forwarded
 * @param {number} [opts.closeTimeoutMs] forwarded
 * @param {boolean} [opts.layerRoot] forwarded
 * @param {typeof shippedRunJob} [opts.runJob] the job runner. An injected seam of the
 *   same class as `provider`: a try is a real paid run, and the loop's own logic —
 *   selection order, exclusion, minting, exhaustion — is not testable against one.
 * @param {() => number} [opts.now] the clock, injected (per-try wall measurement)
 * @returns {Promise<any>} `{ outcome, tries, selection, spentUsd, spendComplete,
 *   bridgeWrites, decision, options, reds, triesAuthorized, triesUsed, envelope, specHash }`
 */
export async function runReuse(opts) {
  const {
    job, approvals, registryDir, patient, workdir, provider, selectionProvider,
    emit, ask, pinned = null, shortlist = null, forceCold = false,
    providerFor, nativeProvider, capRuns, closeTimeoutMs, layerRoot,
    runJob = shippedRunJob, now = () => Date.now(),
  } = opts;
  const runid = opts.runid ?? Date.now().toString(36);

  /** @type {any[]} */
  const tries = [];
  /** @type {any[]} */
  const selection = [];
  /** @type {any[]} */
  const bridgeWrites = [];

  /** the whole run's money, F6-honest: the sum of PRICED figures only, with a one-way
   * floor flag. A try that could not say what it spent makes the total a floor, and a
   * floor that reads as exact is F6 in an honest coat. */
  let spentUsd = 0;
  let spendComplete = true;
  /** @param {number|null} c @param {boolean} complete */
  const account = (c, complete) => {
    if (typeof c === 'number' && Number.isFinite(c)) spentUsd += c; else spendComplete = false;
    if (!complete) spendComplete = false;
  };

  /** every terminal goes through here, so a caller reads ONE shape whatever stopped it
   * @param {string} outcome @param {object} [extra] */
  const done = (outcome, extra = {}) => {
    const out = {
      outcome, tries, selection, spentUsd, spendComplete, bridgeWrites,
      triesAuthorized: isObj(opts.envelope) ? /** @type {any} */ (opts.envelope).bridgeTries : null,
      triesUsed: tries.filter((t) => t.mode === 'bridge').length,
      envelope: env?.envelope ?? null, specHash: trySpecHash, reds: [], decision: null, options: [], category: null,
      ...extra,
    };
    emit('reuse-end', { outcome: out.outcome, triesUsed: out.triesUsed, triesAuthorized: out.triesAuthorized, spentUsd: out.spentUsd, spendComplete: out.spendComplete, bridgeWrites: bridgeWrites.map((w) => `${w.action} ${w.name}`) });
    if (out.decision) {
      // the escalation's CATEGORY names the REUSE-level stop, not the last try's outcome:
      // each try already escalated under its own name from inside `runJob`, and repeating
      // that name here would file the envelope's story under the run's. Every category
      // this emits is in the ledger's executable excluded-set — an unmapped one would be
      // COUNTED as an unclassified lib bug, which is the point of that set.
      emit('escalation', { category: out.category ?? out.outcome, decisionReady: true, decision: out.decision, options: out.options, detail: out.detail ?? undefined });
    }
    return out;
  };

  // ── 1. the envelope, before anything is read or spent
  let trySpecHash = null;
  const env = validateEnvelope(opts.envelope, { job });
  if (!env.ok) {
    emit('envelope-red', { reds: env.reds });
    return done('envelope-red', {
      reds: env.reds,
      decision: 'The reuse envelope does not compose with the signed job spec, so no run was started.',
      options: ['correct the envelope (it may only TIGHTEN the signed caps)', 'raise the spec\'s own caps — a spec edit, whose new hash needs re-approval'],
      detail: env.reds.map((r) => `${r.code}:${r.path}${r.detail ? ` — ${r.detail}` : ''}`).join('\n'),
    });
  }
  const envelope = env.envelope;
  const trySpec = resolveTrySpec(job, envelope);
  trySpecHash = jobSpecHash(trySpec);
  emit('reuse-start', {
    job: job.job, patient, registryDir, specHash: trySpecHash,
    perTryBudgetUsd: envelope.perTryBudgetUsd, perTryWallMs: envelope.perTryWallMs, bridgeTries: envelope.bridgeTries,
    pinned, shortlist, forceCold,
  });

  // ── 2. the registry. Its path is operator-supplied and never conjured — a run that
  // would mint into a directory nobody created is a typo, not a decision.
  if (!registryExists(registryDir)) {
    return done('registry-red', {
      reds: [{ code: 'registry-missing', path: String(registryDir), detail: 'the registry path is operator-supplied and is never conjured' }],
      decision: `The bridge registry ${JSON.stringify(registryDir)} does not exist, so no workflow could be offered and no green could be recorded.`,
      options: ['create the registry directory', 'point --registry at the right one'],
    });
  }

  const askText = isNonEmptyString(ask) ? ask : job.goal;
  /** @type {Set<string>} names this run has already spent a try on */
  const tried = new Set();

  /** the shared per-try execution: run the job, read the spine, write the box (R1).
   * @param {any|null} bridge @param {number} n @returns {Promise<any>} the try row */
  const runTry = async (bridge, n) => {
    const mode = bridge ? 'bridge' : 'cold';
    const name = bridge ? bridge.name : null;
    emit('try-start', { n, mode, bridge: name, capUsd: envelope.perTryBudgetUsd, wallCapMs: envelope.perTryWallMs });
    /** @type {any[]} the try's OWN slice of the spine — the caller's emitter still sees
     * every event; this is a tap, never a replacement (the run's books stay one book) */
    const seen = [];
    const tap = (/** @type {string} */ type, /** @type {object} */ data) => { seen.push({ type, ...(data ?? {}) }); return emit(type, data); };
    const started = now();
    let outcome;
    try {
      outcome = await runJob(trySpec, {
        approvals, workdir, provider, nativeProvider, providerFor, emit: tap,
        shellCapUsd: envelope.perTryBudgetUsd,
        ...(capRuns !== undefined ? { capRuns } : {}),
        ...(closeTimeoutMs !== undefined ? { closeTimeoutMs } : {}),
        ...(layerRoot !== undefined ? { layerRoot } : {}),
        bridge,
      });
    } catch (e) {
      // runJob is contracted not to throw, so a throw here is the runner itself dying.
      // It is a casualty with an UNKNOWN spend — the one thing it must not do is report
      // a zero that reads as exact.
      outcome = 'runner-crashed';
      seen.push({ type: 'runner-crashed', detail: String(/** @type {Error} */ (e)?.message ?? e) });
    }
    const read = readTry(seen);
    const wallMs = now() - started;
    const verdictClass = outcome === 'green' || outcome === 'already-green' ? 'green'
      : REUSE_GRADED_RED.includes(outcome) ? 'red' : 'casualty';
    const row = /** @type {Record<string, any>} */ ({
      n, mode, bridge: name, runOutcome: outcome, verdictClass,
      failingStage: read.failingStage, closeReached: read.closeReached,
      spentUsd: read.spentUsd, spendComplete: read.spendComplete, capUsd: envelope.perTryBudgetUsd,
      // `capBound` is the row's own reading of the money bind, and it is the OUTCOME that
      // says so — never a comparison of spend against cap, which cannot tell a run that
      // finished at its cap from one the cap cut off.
      capBound: outcome === 'cap-halt',
      wallMs, wallCapMs: envelope.perTryWallMs, wallBound: outcome === 'wall-halt',
      rounds: read.rounds, plan: read.plan, bridgeWrite: null,
    });
    account(read.spentUsd, read.spendComplete);

    // ── R1: the box. A green mints the next version FROM THE PLAN AS EXECUTED; anything
    // else writes a history row and leaves the recipe untouched.
    const record = {
      runid: `${runid}-t${n}`, patient, at: new Date(now()).toISOString(),
      costUsd: read.spentUsd, spendComplete: read.spendComplete, wallMs, rounds: read.rounds,
      ...(trySpecHash ? { specHash: trySpecHash } : {}),
    };
    if (verdictClass === 'green' && read.plan === null) {
      // a green with no plan on the spine cannot mint a version — the artifact that
      // inherits is the one that RAN, and there is nothing here to inherit. Reported,
      // never faked with a placeholder.
      bridgeWrites.push({ name, action: 'none', file: null, reds: [{ code: 'no-plan-executed', path: 'plan', detail: 'the run greened but emitted no accepted plan — nothing to mint (R1: the artifact that inherits is the one that ran)' }] });
    } else if (verdictClass === 'green') {
      const meta = {
        name: name ?? job.job,
        goal: job.goal,
        specHash: trySpecHash,
        closeStageNames: (stageClose(job.close) ?? []).map((/** @type {any} */ s) => s.name),
        toolsUsed: [...new Set((read.plan.steps ?? []).flatMap((/** @type {any} */ s) => s.tools ?? []))],
      };
      row.bridgeWrite = writeGreen(bridge, meta, { ...record, plan: read.plan });
    } else if (bridge) {
      // R1: the recipe is NOT edited by a red. `outcome` rides in verbatim — a casualty
      // keeps its own name, and only the literal 'red' demotes (D6).
      const r = appendRed(bridge, { ...record, outcome: verdictClass === 'red' ? 'red' : outcome, failingStage: read.failingStage });
      row.bridgeWrite = commit(r, name, verdictClass === 'red' ? 'appendRed' : 'appendCasualty');
    }
    // a cold RED writes nothing at all: the entry bar is a green (D6), so a failed plan
    // never enters the registry — that is also the clutter control
    emit('try-end', { ...row, plan: undefined });
    tries.push(row);
    return row;
  };

  /** save a bridge result and record the write, whatever produced it
   * @param {{ok: boolean, reds: any[], bridge: any}} r @param {string|null} name @param {string} action */
  const commit = (r, name, action) => {
    if (!r.ok) {
      const w = { name, action: 'none', file: null, reds: r.reds };
      bridgeWrites.push(w);
      emit('bridge-write', w);
      return w;
    }
    const s = saveBridge(registryDir, r.bridge);
    const w = { name: r.bridge.name, action: s.ok ? action : 'none', file: s.file, reds: s.reds };
    bridgeWrites.push(w);
    emit('bridge-write', w);
    return w;
  };

  /**
   * KNOWN LIMIT, named rather than discovered later: `appendGreen` carries the entry's
   * LABEL (`goal`, `closeStageNames`, `toolsUsed`) forward untouched, so a new version
   * whose plan uses a verb the founding green did not is not reflected in `toolsUsed`.
   * The load gate reads that field, so the gate's verb check goes slightly stale across
   * versions. It is not a safety hole — the gate only ever gets more permissive there,
   * and the TWEAKED plan still passes the full `validatePlan` against the job's signed
   * menu at draft time, which is the check that actually decides. Fixing it properly
   * means `appendGreen` taking a label update, which is module 1's contract and hamr's
   * call, not something to change from the caller.
   * @param {any|null} bridge @param {any} meta @param {any} record
   */
  function writeGreen(bridge, meta, record) {
    if (bridge) return commit(appendGreen(bridge, record), bridge.name, 'appendGreen');
    // the COLD leg's green. `mintBridge` is for a name nobody holds; a name that already
    // holds greens APPENDS, because a cold run of a job that already has a bridge is
    // another version of that workflow, and overwriting it would destroy the green that
    // minted it.
    const existing = loadRegistry(registryDir).bridges.find((/** @type {any} */ b) => b.name === meta.name);
    if (existing) return commit(appendGreen(existing, record), meta.name, 'appendGreen');
    // A file of that name that `loadRegistry` could not READ is not an absent entry — it
    // is an entry nobody can see, and minting over it destroys whatever greens it held.
    // `loadRegistry` skips-and-reports for that reason; the mint must not undo the skip.
    if (existsSync(join(registryDir, `${meta.name}.json`))) {
      const w = { name: meta.name, action: 'none', file: null, reds: [{ code: 'mint-collision', path: `${meta.name}.json`, detail: 'a file of this name exists but could not be read as a bridge — refusing to mint over it, because whatever greens it holds are not recoverable once overwritten. Repair or move it, then re-run.' }] };
      bridgeWrites.push(w);
      emit('bridge-write', w);
      return w;
    }
    return commit(mintBridge(meta, record), meta.name, 'mint');
  }

  /**
   * The stops no further try can change. A spec nobody signed, a spec that will not
   * validate, and a degraded primitive are properties of the RUN, not of the recipe — the
   * next try would reproduce them for $0 apiece and then the cold leg would too, filling
   * the readout with rows that all say the same thing and burying the one fact the
   * operator needs. The envelope pre-authorized SPENDING on further attempts; it did not
   * authorize repeating an answer already known.
   * @param {any} row @returns {any|null} the terminal, or null to carry on
   */
  const hardStop = (row) => {
    const decisions = {
      'unapproved-spec': {
        decision: `No approval record matches the per-try spec (hash ${trySpecHash}). Tightening the caps with an envelope makes a NEW spec version, and a new version is signed, not inherited — nothing was run.`,
        options: [`sign this version: --approve ${trySpecHash}`, 'use an envelope equal to the spec\'s own caps, which is hash-identical and already signed'],
      },
      'job-red': {
        decision: 'The per-try spec did not validate, so no try can run — every further attempt would reproduce this exact refusal.',
        options: ['fix the job spec', 'check the envelope: it writes budgetUsd/maxWallMs onto the spec, and both have bounds'],
      },
      'smoke-red': {
        decision: 'The litectx primitive failed its known-answer check. No run verdict is trustworthy on a degraded primitive, and a second try would be judged by the same degraded one.',
        options: ['fix the primitive/store', 'abandon the run'],
      },
    };
    const d = decisions[row.runOutcome];
    // the category IS the outcome here: each of these names its own story exactly, and
    // all three are in the ledger's excluded set (operator input and a degraded
    // primitive, never a library failing)
    return d ? done(row.runOutcome, { category: row.runOutcome, ...d }) : null;
  };

  // ── 3. the tries
  for (let n = 1; n <= envelope.bridgeTries; n += 1) {
    // reloaded per try: the row the LAST try just wrote is part of what the next pick
    // reads, and a registry read once at the top would hand every later selection a
    // history that stopped at the start of the run
    const registry = loadRegistry(registryDir);
    const sel = await selectBridge({
      registry, job, ask: askText, provider: selectionProvider ?? provider,
      pinned, shortlist, forceCold, exclude: [...tried],
    });
    selection.push({ n, ...sel, listing: undefined });
    account(sel.costUsd, sel.spendComplete);
    emit('selection-result', { n, choice: sel.choice, reason: sel.reason, called: sel.called, refused: sel.refused, costUsd: sel.costUsd, candidates: sel.candidates });

    if (sel.refused) {
      return done('selection-refused', {
        decision: `The workflow you pinned (${JSON.stringify(pinned)}) was refused: ${sel.reason}. Nothing was run — which workflow this job starts from is your call, not the runner's.`,
        options: [`run it anyway by re-pinning ${JSON.stringify(pinned)} after reading the reason`, 'pin a different workflow', 'run cold (--force-cold)'],
      });
    }
    if (sel.red) {
      return done('selection-red', {
        reds: [sel.red],
        decision: `The selection call did not produce a usable answer (${sel.red.code}), so no workflow was chosen and no run was started. Falling back to a cold draft would be spending a run's budget on a decision nobody made.`,
        options: ['rerun the selection', 'pin a workflow explicitly', 'run cold (--force-cold)'],
        detail: sel.red.detail,
      });
    }
    if (sel.choice === null) break; // "none matches" / force-cold / nothing to offer → cold

    const entry = loadRegistry(registryDir).bridges.find((/** @type {any} */ b) => b.name === sel.choice);
    if (!entry) break; // the listing named it and the directory no longer holds it — cold
    tried.add(sel.choice);
    const row = await runTry(entry, n);
    if (row.verdictClass === 'green') {
      return done('green', { decision: null });
    }
    const stop = hardStop(row);
    if (stop) return stop;
  }

  // ── 4. "then start anew" — the cold leg, under the SAME per-try numbers
  const cold = await runTry(null, tries.length + 1);
  if (cold.verdictClass === 'green') return done('green');
  const coldStop = hardStop(cold);
  if (coldStop) return coldStop;
  return done(cold.runOutcome, {
    category: 'reuse-exhausted',
    decision: `Every authorized attempt is spent: ${tries.filter((t) => t.mode === 'bridge').length} workflow ${tries.filter((t) => t.mode === 'bridge').length === 1 ? 'try' : 'tries'} of ${envelope.bridgeTries}, then a cold draft, and the job's own verification is still not satisfied. The envelope pre-authorized exactly this much and no more.`,
    options: [
      'raise the envelope (more tries, or a bigger per-try budget/wall) and rerun — resume-to-cap, the stop IS the checkpoint',
      'revise the goal or the close — a spec edit, whose new hash needs re-approval',
      'abandon the run',
    ],
    detail: tries.map((t) => `try ${t.n} (${t.mode}${t.bridge ? ` "${t.bridge}"` : ''}): ${t.runOutcome}`
      + `${t.failingStage ? ` at stage "${t.failingStage}"` : ''}`
      + ` — ${t.spentUsd === null ? 'spend UNKNOWN' : `${t.spendComplete ? '' : '≥'}$${t.spentUsd.toFixed(4)}`} of $${t.capUsd},`
      + ` ${(t.wallMs / 60000).toFixed(1)}min of ${(t.wallCapMs / 60000).toFixed(1)}min,`
      + ` close ${t.closeReached ? 'reached' : 'NEVER REACHED'}`).join('\n'),
  });
}
