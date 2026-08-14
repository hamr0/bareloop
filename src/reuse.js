// Layer 3 — the D7 ENVELOPE and the REUSE RUNNER (design record
// docs/02-features/2026-08-01-layer-3-reuse-design.md, D3/D5/D6/D7 + R1).
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
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRegistry, saveBridge, appendGreen, appendRed, mintBridge, registryExists } from './bridges.js';
import { renderListing, selectionPrompt } from './selection.js';
import { closeStagesOf } from './plan.js';
import { MIN_WALL_MS, jobSpecHash } from './job.js';
import { isObj, isNonEmptyString } from './validate.js';
import { readGrade } from './trend.js';

/** the paused-run TERMINAL and its spine record share one name (`runPlan` returns
 * it and `runJob` writes it onto `job-end`), spelled once here so the checkpoint
 * list and the TTL gate below cannot drift from each other */
const HITL_PAUSE = 'hitl-pause';
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

/**
 * WHICH TERMINALS ARE A CHECKPOINT — the list a runner hands `readResume` as
 * `resumableOutcomes`, minted HERE rather than in whichever script happens to
 * launch a run.
 *
 * `readResume` deliberately takes it as a parameter and defaults to empty, and
 * that stays true: the reuse loop's own semantics depend on the empty default.
 * What did not exist was a canonical ANSWER, so `scripts/run-u.mjs` kept its own
 * copy — and the exported bundle (PRD v1.44 §2: a thin runner with bareloop as a
 * dependency) would have had to keep a third. The same reasoning that put the
 * pause TTL in the library (OPEN-2, hamr, 2026-08-13) puts this here.
 *
 * Every entry is a stop that left WORK ON DISK and an allowance unspent — money,
 * time, a self-healed stall, and now a person who has not answered yet. A verdict
 * already rendered is never on this list: `hitl-cancel` is the signer's own
 * terminal and `green`/`escalated` are graded rows, and re-buying any of them
 * would pay twice for an answer already in hand.
 */
export const CHECKPOINT_OUTCOMES = Object.freeze(['cap-halt', 'wall-halt', 'step-stalled', HITL_PAUSE]);

/**
 * v1's definition of "the same KIND of recipe" — and it is the LOAD GATE's own: the
 * close-stage names, in the same order (`bridges.loadGate` rule 2). One predicate,
 * shared with the gate rather than spelled a second time here: a cold green appending
 * to an entry the gate would refuse at the door is the two-transforms class pointed
 * at the registry.
 * @param {any} entry a registry entry @param {string[]} stageNames this job's close
 */
function sameCloseShape(entry, stageNames) {
  const stored = Array.isArray(entry?.closeStageNames) ? entry.closeStageNames : null;
  return !!stored && stored.length === stageNames.length
    && stored.every((/** @type {unknown} */ s, /** @type {number} */ i) => s === stageNames[i]);
}

/**
 * The name a cold green FORKS to when the entry of the job's own name greened a
 * different close. Derived from the shape itself, so it is deterministic: the same
 * close always lands in the same file, and the next green of that shape appends there
 * instead of minting a third entry.
 *
 * The separator is a HYPHEN, not the `~` first proposed: the registry name IS the
 * filename and `validateBridge` holds it to the same kebab alphabet the job validator
 * uses (`^[a-z0-9][a-z0-9-]*$`), so a `~` name would be refused by the entry's own
 * validator and the green would be lost — which is the exact failure this fork exists
 * to prevent.
 * @param {string} name @param {string[]} stageNames @returns {string}
 */
function shapeForkName(name, stageNames) {
  return `${name}-${createHash('sha256').update(stageNames.join('\n')).digest('hex').slice(0, 8)}`;
}

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

/**
 * The RESOLVED REUSE ARTIFACT — the thing the operator actually signs.
 *
 * The envelope is THREE numbers, and the third one is a MULTIPLIER: the worst case a
 * reuse run authorizes is `perTryBudgetUsd × (bridgeTries + 1)`. A signature taken over
 * the per-try spec alone covers only two of the three — `--tries 0` and `--tries 9` hash
 * identically while authorizing ten times the spend. So the signed artifact is this
 * WRAPPER, and `reuseSpecHash` is what an approval gate prints and compares.
 *
 * It is a wrapper rather than a field on the spec because `validateJob` reds every
 * unknown top-level field: a `bridgeTries` written onto the per-try spec would flip the
 * hash and then make every try a `job-red`. The spec half stays exactly the spec `runJob`
 * executes, unchanged in kind.
 *
 * `bridgeTries` is READ ONCE, here, and the run's loop bound is read back off this same
 * object — the number enforced and the number signed are the same number from the same
 * place, never two reads of the envelope that a later edit could separate.
 *
 * @param {object} job the signed spec
 * @param {{perTryBudgetUsd: number, perTryWallMs: number, bridgeTries: number}} envelope
 * @returns {{schema: string, spec: any, bridgeTries: number}}
 */
export function resolveReuse(job, envelope) {
  return { schema: 'reuse-v1', spec: resolveTrySpec(job, envelope), bridgeTries: envelope.bridgeTries };
}

/**
 * The APPROVAL HASH: one number covering all three envelope numbers.
 *
 * Composed from the repo's ONE spec hasher rather than re-canonizing the wrapper, so the
 * per-try spec half is hashed exactly as `jobSpecHash` hashes it — MED-1's resolved-`tools`
 * pinning included, and with no second canonicalizer that could drift from it. The
 * `reuse-v1` prefix is domain separation: a reuse approval can never collide with a bare
 * job approval.
 *
 * **This is a signing-SCHEME change, and it invalidates every hash signed before it — by
 * design.** A signature that did not cover the try count never covered the run's worst
 * case, so it is not carried forward: there is no legacy acceptance path, and re-signing
 * once is the whole migration.
 *
 * @param {{spec: any, bridgeTries: number}} resolved a `resolveReuse` artifact
 * @returns {string} sha256 hex
 */
export function reuseSpecHash(resolved) {
  return createHash('sha256')
    .update(`reuse-v1\nspec:${jobSpecHash(resolved.spec)}\nbridgeTries:${JSON.stringify(resolved.bridgeTries)}\n`)
    .digest('hex');
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
  // The stage that rendered the LAST verdict. `outer-close` is emitted ONCE, BEFORE the
  // close-fix loop — and `escalated`, the only outcome that demotes, is decided AFTER
  // it — so reading the stage from `outer-close` names a stale wall whenever the fix
  // loop moved it. Every later verdict arrives as ralph's `close-verdict`; a STEP's
  // exit-loop verdict comes through the same event type but carries no stage (its judge
  // is the form evaluator, not the close), which is exactly what disqualifies it here.
  const cv = events.filter((e) => e.type === 'close-verdict' && isNonEmptyString(e.stage)).at(-1) ?? null;
  const stage = cv ?? oc;
  const turns = events.filter((e) => (e.type === 'worker-round' && e.kind === 'turn') || e.type === 'worker-turn').length;
  const pricedWork = events.some((e) => e.type === 'worker-round' || e.type === 'worker-turn')
    || (typeof je?.spentUsd === 'number' && je.spentUsd > 0);
  return {
    // F6: a job-end that never landed is an UNKNOWN spend, not a zero. `spentUsd` is
    // read as a number or explicit null, and `spendComplete` can never be true without
    // a figure to complete.
    spentUsd: typeof je?.spentUsd === 'number' && Number.isFinite(je.spentUsd) ? je.spentUsd : null,
    spendComplete: typeof je?.spentUsd === 'number' && je?.spendComplete === true,
    // the plan AS EXECUTED (R1): the last accepted plan is the one that ran — a replan
    // emits its own `plan-accepted`, and it is the post-replan artifact that inherits
    plan: pa?.plan ?? null,
    // The worker's turn count, across BOTH metering surfaces. The Loop path emits one
    // `worker-round` of kind 'turn' per turn; the NATIVE path emits `worker-turn` per
    // turn plus ONE `worker-round` of kind 'session' carrying the authoritative cost —
    // so counting only the first spelling reads every native try as 0. And a slice that
    // shows priced work with no turn signal at all is an UNKNOWN count, never a zero:
    // a zero there reads as "the worker did nothing" for money that was spent (F6).
    rounds: turns > 0 ? turns : (pricedWork ? null : 0),
    // which stage rendered the verdict, and whether the close was reached AT ALL — the
    // second is F45's visible half: a try whose cap bound before any grading is a
    // casualty by shape, and the row says so instead of leaving it to be inferred
    failingStage: isNonEmptyString(stage?.stage) ? stage.stage : null,
    closeReached: oc !== null,
  };
}

/** the three-way verdict read of a runJob outcome, in ONE place: a green, the one
 * GRADED red that demotes (D6), or a casualty that keeps its own name. Both the live
 * try loop and the resume reader classify through this — two spellings of "what kind
 * of answer was that" is how a casualty ends up demoting a recipe.
 * @param {string} outcome @returns {'green'|'red'|'casualty'} */
function verdictClassOf(outcome) {
  if (outcome === 'green' || outcome === 'already-green') return 'green';
  return REUSE_GRADED_RED.includes(outcome) ? 'red' : 'casualty';
}

// ── module C: RESUME AFTER KILL ─────────────────────────────────────────────

/**
 * The STEP-LEVEL checkpoint inside a killed try's window — the ONE reader, so the seed
 * is derived from the spine and from nothing else (no parallel bookkeeping).
 *
 * hamr's ruling supersedes the try-restart reading, verbatim: *"even if it gets killed by
 * outside, it should allow resume and start last step instead from the beginning, why
 * would i want to waste more money on something i already started, our goal is to find
 * ways to save money and time"*. A try-level restart re-pays for the scout, the draft and
 * every step that had already finished; this reads the FINEST checkpoint the spine can
 * actually prove, and refuses to guess past it.
 *
 * Three readings, and each is grounded in one event the executor emits:
 *
 *  - **No `plan-accepted` in the window** → `null`. The kill landed in the scout or the
 *    draft, nothing durable was produced, and the existing try-restart is already right.
 *  - **`plan-accepted` and no `outer-close` after it** → `phase: 'steps'`. The plan is the
 *    LAST accepted one (a replan emits its own, and it is the post-replan plan that was
 *    executing), and the completed steps are the ones judged after it.
 *  - **`outer-close` after it** → `phase: 'close'`. Every step finished; what remains is
 *    the close and its fix loop. The close re-runs for no tokens — it is a command over
 *    the tree, stateless by construction.
 *
 * **Completion is `step-end{outcome:'green'}` OR `step-skipped`.** The second is not a
 * detail: a resumed leg records its inherited steps as skips, so a reader that counted
 * only `step-end` would make every resume-of-a-resume re-run and re-pay for exactly the
 * work the previous resume correctly skipped. Both carry the `seq` of the record they
 * rest on, so a skip can always be traced to the event that licensed it.
 *
 * A green under a plan the run later REPLANNED away is deliberately not counted: the
 * executor resets its own index and artifacts at a replan, so those greens belong to a
 * plan nobody is executing any more.
 *
 * @param {any[]} seen the open try's own events, in file order
 * @returns {{phase: string, plan: any, completedSteps: {id: string, seq: number|null, by: string}[], planSeq: number|null}|null}
 */
function readStepCheckpoint(seen) {
  let at = -1;
  for (let i = 0; i < seen.length; i += 1) if (seen[i].type === 'plan-accepted') at = i;
  if (at === -1) return null;
  const plan = seen[at].plan;
  // A plan-accepted whose plan is unreadable cannot be reloaded — and a HALF plan is
  // worse than none, because the steps read against it would skip by index into
  // something nobody validated. No seed is the honest answer, and it degrades to
  // exactly the try-restart this run already had.
  //
  // UNREACHABLE through the runner today and deliberately kept (the `runCheck` precedent):
  // a kill mid-append leaves a truncated final LINE, which the runner drops before
  // parsing, so a partial plan-accepted never reaches this reader from a real spine. It is
  // defence against a second caller, not a live path.
  if (!isObj(plan) || !Array.isArray(/** @type {any} */ (plan).steps)) return null;
  const after = seen.slice(at + 1);
  /** @type {{id: string, seq: number|null, by: string}[]} */
  const completedSteps = [];
  for (const e of after) {
    const done = (e.type === 'step-end' && e.outcome === 'green') || e.type === 'step-skipped';
    if (done && isNonEmptyString(e.step)) {
      completedSteps.push({ id: e.step, seq: typeof e.seq === 'number' ? e.seq : null, by: e.type });
    }
  }
  return {
    phase: after.some((e) => e.type === 'outer-close') ? 'close' : 'steps',
    plan,
    completedSteps,
    // the record this reading rests on, so a reach-back is traceable to its own evidence
    planSeq: typeof seen[at].seq === 'number' ? seen[at].seq : null,
  };
}

/**
 * The WORK BRANCH the dead leg created (PRD v1.57 §3), read off its own `work-branch`
 * record — the one place the runner writes it down.
 *
 * It is read rather than re-derived, and that is the whole point. `workBranchName` is
 * deterministic from the signed spec, so a restart computing it fresh would get the very
 * name its predecessor already took and the collision walk would hand it
 * `<name>-2` — a brand-new branch standing beside the work the resume exists to
 * continue. The declared-fold precedent (`priorSpentUsd`, `priorReplans`): what the
 * chain already did is DECLARED on the spine and inherited, never recomputed.
 *
 * The LAST record wins. A leg emits exactly one, but a window can reach back through an
 * abandoned attempt of the same try, and the newest is the branch the work is actually
 * sitting on.
 * @param {any[]} seen the window's own events, in file order
 * @returns {string|null} null on a spine older than the record, or a kill before 0c
 */
function readWorkBranch(seen) {
  for (let i = seen.length - 1; i >= 0; i -= 1) {
    if (seen[i].type === 'work-branch' && isNonEmptyString(seen[i].branch)) return String(seen[i].branch);
  }
  return null;
}

/**
 * The dead leg's CLOSE GRADES, in order — the trend baselines a resumed leg
 * inherits (PRD v1.46 §3, and hamr's approved #2: *a resumed run's trend judges the
 * whole tree*).
 *
 * Without this, a resumed leg's halt readout restarts the trend at its own first
 * close: a leg cut after one grade reads `unknown` while the run it continues had a
 * measured direction, and a leg that is flat on its own evidence reads `flat` on a
 * chain that was converging — which recommends rewriting a goal that was working.
 *
 * WHAT COUNTS AS A CLOSE GRADE is exactly what the live reader counts (planrun's
 * `runTrend` is fed at `judgeClose`, from every RED verdict the arbiter renders):
 * the precheck, the outer close, and each of the fix loop's own closes. Nothing
 * else. Read from the four records the executor already emits, in file order:
 *
 *  - `close-precheck` / `outer-close` — the two closes that ride under their own
 *    record types. `needs_revision` only: a green ends the run, and a close FAULT
 *    rendered no judgment at all, so folding either would put a non-grade in the
 *    series (the same rule `judgeClose` applies).
 *  - `ladder` with `governor: 'close-trend'` — the PRIMARY source for the fix loop.
 *    It carries `{stage, value}` already read by the live instrument, so nothing is
 *    parsed twice and the seam cannot disagree with the reading it inherits.
 *  - `close-verdict` — the FALLBACK, for a spine written before that governor
 *    existed (the fix loop was bounded by the retired count and emitted no ladder
 *    reading at all). Used only when the spine carries no `close-trend` record.
 *
 * THE FALLBACK IS GUARDED, and the guard is the whole difficulty. `close-verdict` is
 * ralph's record, and the STEP loop is a ralph loop too — a step's failing exit
 * emits one, with a detail spelled `check "clean-run" red: …`. Parsed blind that
 * line donates a number that is not a close grade at all, into a bucket the close
 * never named: precisely the axis-merging src/trend.js's accuracy law forbids. So
 * the fallback reads only records AFTER the `fix-loop` marker, which is exactly the
 * population the primary source covers — the two sources are substitutable rather
 * than merely similar.
 *
 * KNOWN LIMIT, stated rather than discovered later. This reads ONE spine, so a
 * resume of a resume inherits leg 2's grades and not leg 1's: the seeded prefix is
 * not re-emitted onto the new spine (it is history, not this leg's evidence, and a
 * leg that re-emitted its inheritance would double-count it on the next read). The
 * chain therefore shortens by one leg per resume. Fail-safe in the direction that
 * matters: a shorter chain can only ever under-claim a direction.
 *
 * @param {any[]} seen the open window's own events, in file order
 * @returns {{stage: string|null, value: number}[]} counts and stage names ONLY —
 *   never a gap byte. The spine is append-only forever, so a close byte that
 *   crosses this seam crosses it for good.
 */
function readGradeSeed(seen) {
  const hasGovernor = seen.some((e) => e.type === 'ladder' && e.governor === 'close-trend');
  /** @type {{stage: string|null, value: number}[]} */
  const out = [];
  let inFixLoop = false;
  for (const e of seen) {
    if (e.type === 'fix-loop') { inFixLoop = true; continue; }
    /** @type {{stage: string|null, value: number|null}|null} */
    let read = null;
    if (e.type === 'close-precheck' || e.type === 'outer-close') {
      if (e.verdict === 'needs_revision') read = readGrade(e.gap);
    } else if (e.type === 'ladder' && e.governor === 'close-trend') {
      // already read by the live instrument — taken verbatim, never re-parsed
      read = { stage: isNonEmptyString(e.stage) ? e.stage : null, value: typeof e.value === 'number' ? e.value : null };
    } else if (!hasGovernor && inFixLoop && e.type === 'close-verdict' && e.verdict === 'needs_revision') {
      read = readGrade(e.gap);
    }
    // an unreadable grade donates NOTHING — not a zero, not a placeholder (F6)
    if (read && typeof read.value === 'number' && Number.isFinite(read.value)) out.push({ stage: read.stage, value: read.value });
  }
  return out;
}

/**
 * Read a killed reuse run's OWN SPINE back into the state a resume continues from.
 *
 * hamr's checkpoint ruling is the whole contract: *"money, signature and checkpoint
 * (starts from where it stopped) if mid loop, restart that loop"*. So this reader
 * answers exactly four questions, and nothing else:
 *
 *  1. **Which tries COMPLETED** — they are never re-run, and their bridges stay
 *     spoken for exactly as if the loop had carried on.
 *  2. **Was the process mid-try** — a `try-start` with no matching `try-end`. That
 *     try was never graded, so it is not consumed: it RESTARTS from its beginning.
 *  3. **What that dead attempt already spent, in money and in wall time** — folded
 *     into the restart so it runs under the REMAINDER of its signed per-try numbers.
 *  4. **Which envelope this spine belongs to** — the `reuse-start` record's own
 *     approval hash, so a resume can prove it is continuing the SAME signed run.
 *
 * **F45 governs the arithmetic here.** A window's spend is summed from `worker-round`
 * ONLY — the same event `runJob`'s own ledger accounts, no other. The selection calls
 * are real money and are counted, but as the RUN's cost and never as a try's: a
 * picker's tokens are not a worker's, and attributing them to a try would misstate
 * both the fold and the row. `worker-turn` (native attribution, cost null by design)
 * is deliberately not summed, exactly as the live ledger does not sum it.
 *
 * **The declared fold, not a re-derivation.** A restarted try's own `try-start`
 * carries the fold it inherited (`priorSpentUsd`/`priorWallMs`), so a resume OF a
 * resume adds only its own new rounds. Re-deriving from the whole file would bill an
 * abandoned attempt twice. The REPLAN ledger (`priorReplans`/`priorReplanGrantUsed`)
 * folds on this same mechanism and deliberately not on `readGradeSeed`'s: a grade seed
 * feeds a readout, so its documented one-leg-per-resume shortening can only under-claim
 * a direction, while an under-claimed CEILING is a refilled allowance and every kill
 * would buy one (PRD v1.12 — the replan bound is the RUN's).
 *
 * **KNOWN LIMIT, stated rather than discovered later.** A call that was killed BEFORE it
 * returned left no event at all — no `worker-round`, no `selection-result` — so money it
 * may already have been billed for is not on the spine and cannot be folded. This reader
 * can only account writers that WROTE (the same limit the runner's own guards have: a
 * hung `generate()` leaves zero trace). The fold is therefore a floor in exactly the case
 * `priorSpendComplete` already marks, and one lost selection call is re-paid by the
 * resumed pick rather than silently attributed to a try.
 *
 * **A try whose `job-end` landed is COMPLETE, not mid-flight.** The close already
 * rendered its verdict; restarting would pay a second time for an answer already in
 * hand. When the death fell between that verdict and the registry write, the row that
 * was lost is NAMED (`r1Missing`) rather than silently absent — and never re-derived,
 * because a green's version has to be the plan AS EXECUTED and this reader is not
 * where that is decided.
 *
 * **THE HALT AMENDMENT (PRD v1.46 §3).** "A landed `job-end` is COMPLETE" is true of
 * a VERDICT, and a governance halt is not one: a money cap-halt (and, W-2-symmetric,
 * a wall-halt) means the run ran out of an operator-owned allowance with its work on
 * disk and its plan on the spine — the exact case hamr's ruling was about ("why would
 * i want to waste more money on something i already started"). `resumableOutcomes`
 * names which terminals get read that way. It is EMPTY by default, so the reuse
 * loop's own semantics are byte-unchanged: there, a cap-halted try was graded, its
 * registry row was written, and turning it into a restart would re-run a try whose
 * fold leaves it no money at all and duplicate its row. Green and every red stay
 * non-resumable under any setting — a verdict already rendered is never re-bought.
 *
 * **DIRECT SPINES (`direct`).** A `runJob` spine has no `reuse-start` and no try
 * windows, so this reader saw one as "not a reuse run" and every priced round in it
 * as a STRAY. Opted in, the run itself is read as ONE implicit try opened at
 * `job-start` — the same window machinery, never a second reader, because the whole
 * failure class this reader exists to survive (F45) is the writer nobody modelled.
 * The fold it declares comes off `job-start`'s own `priorSpentUsd`, exactly as a
 * restarted try's comes off its `try-start`: re-deriving from the file would bill an
 * abandoned attempt twice in a chain of resumes.
 *
 * @param {any[]} events the dead spine's events, parsed, in file order
 * @param {{deathAt?: number|null, direct?: boolean, resumableOutcomes?: string[]}} [opts]
 *   `deathAt`: when the process is judged to have died (the watchdog's kill record,
 *   which is later and better evidence than the last event). Defaults to the last
 *   event's own timestamp — the last sign of life there is.
 * @returns {any} `{ started, approvalHash, specHash, patient, job, bridgeTries,
 *   perTryBudgetUsd, perTryWallMs, ended, endOutcome, wallDerivedHalt, greened, completed, tried,
 *   selectionCostUsd, selectionComplete, strayRounds, r1Missing, restart, deathAtKnown,
 *   spentUsd, spendComplete, carrySpentUsd, carrySpendComplete }`
 */
export function readResume(events, { deathAt = null, direct = false, resumableOutcomes = [] } = {}) {
  const list = Array.isArray(events) ? events.filter(isObj) : [];
  /** which landed terminals are a CHECKPOINT rather than a graded row */
  const resumableHalt = new Set(Array.isArray(resumableOutcomes) ? resumableOutcomes : []);
  // the FIRST reuse-start is the envelope this spine was opened under. A resumed spine
  // holds one per process; the signature gate compares against the ORIGINAL, because
  // that is the run being continued.
  const head = list.find((e) => e.type === 'reuse-start') ?? null;
  const end = list.filter((e) => e.type === 'reuse-end').at(-1) ?? null;
  /** A DIRECT spine is one runJob with no envelope around it. It is read as a single
   * implicit try ONLY when the caller asked for that AND there is genuinely no reuse
   * envelope on the file — never inferred from the absence alone, because "this spine
   * carries no reuse-start" is also the honest refusal a reuse runner needs. */
  const directRun = direct && head === null && !list.some((e) => e.type === 'try-start');

  /** @type {any[]} */
  const completed = [];
  /** @type {string[]} */
  const tried = [];
  let selectionCostUsd = 0;
  let selectionComplete = true;
  let strayRounds = 0;
  let strayCostUsd = 0;
  /** @type {any} the try currently open: a `try-start` with no `try-end` yet */
  let open = null;
  /** @type {{n: any, seen: any[]}[]} windows a kill abandoned, oldest first — kept ONLY
   * so a checkpoint can be reached back through an attempt that died before re-accepting
   * its own plan. Their money is never re-read from here (the restart declares its fold). */
  const abandoned = [];

  /** @param {any} ev */
  const openTry = (ev) => ({
    n: ev.n, mode: ev.mode, bridge: ev.bridge ?? null,
    startedAtMs: Date.parse(String(ev.ts)),
    // the fold this attempt was ALREADY carrying (a restart declares it on its own
    // try-start) — never re-derived from the file
    // `> 0` belt matches the four sibling fold sites (tail-review F-4): a negative
    // declared fold on a corrupt spine must never cancel real rounds and widen the cap
    declaredSpentUsd: typeof ev.priorSpentUsd === 'number' && Number.isFinite(ev.priorSpentUsd) && ev.priorSpentUsd > 0 ? ev.priorSpentUsd : 0,
    declaredWallMs: typeof ev.priorWallMs === 'number' && Number.isFinite(ev.priorWallMs) && ev.priorWallMs > 0 ? ev.priorWallMs : 0,
    declaredComplete: ev.priorSpendComplete !== false,
    // the ROUND fold, and the one field where absence and zero are different answers.
    // A declared `null` is the predecessor saying it could not count its own turns, and
    // it stays unknown forever after (F6); a MISSING field is a spine written before the
    // declaration existed, or a try nobody resumed — both are honestly zero.
    declaredRounds: !('priorRounds' in ev) ? 0
      : (typeof ev.priorRounds === 'number' && Number.isFinite(ev.priorRounds) && ev.priorRounds >= 0 ? ev.priorRounds : null),
    // the REPLAN ledger this attempt was already carrying, on the same declared-fold
    // mechanism and with the same `> 0` belt as the money. It has to fold this way
    // rather than the grade seed's way: `readGradeSeed`'s chain shortens by one leg
    // per resume, which under-claims — harmless for a readout, and for a CEILING an
    // under-claim IS a refilled allowance, one per kill (PRD v1.12).
    declaredReplans: typeof ev.priorReplans === 'number' && Number.isFinite(ev.priorReplans) && ev.priorReplans > 0 ? Math.floor(ev.priorReplans) : 0,
    // the F85-C latch rides BESIDE the count, never derived from it: a chain can have
    // spent the ordinary ceiling with the arbiter's one extra still unearned, and
    // deriving one from the other would collapse those two states into one
    declaredGrantUsed: ev.priorReplanGrantUsed === true,
    // this window's OWN replans, counted from the records the runner emits — the same
    // `replan` event a human reads, so the ledger and the log cannot disagree
    windowReplans: 0, windowGrantUsed: false,
    roundsUsd: 0, roundsComplete: true, r1Written: false, jobEnd: null,
    /** @type {any[]} the window's own events, so the SAME `readTry` the live loop uses
     * reads a graded-but-unrecorded try — never a second reader spelling it differently */
    seen: [],
  });

  for (const ev of list) {
    if (ev.type === 'selection-result') {
      if (typeof ev.costUsd === 'number' && Number.isFinite(ev.costUsd)) selectionCostUsd += ev.costUsd;
      else selectionComplete = false;
      continue;
    }
    if (ev.type === 'try-start') {
      // a new try-start while one is OPEN means the open one was abandoned (a kill, and
      // this is the restart). Its spend is not added here: the restart's own try-start
      // declares the fold it inherited, so counting the window again would double-bill.
      //
      // Its CHECKPOINT is kept, though. Measured on the real killed run: leg 3 restarted,
      // spent its close precheck and died in the redraft, so its own window carries no
      // plan-accepted at all — reading only the open window there discards a checkpoint
      // leg 2 paid $8.18 to reach. The window is abandoned; the work it proved is not.
      if (open) {
        if (open.bridge) tried.push(open.bridge);
        abandoned.push({ n: open.n, seen: open.seen });
      }
      open = openTry(ev);
      continue;
    }
    // A DIRECT spine's `job-start` opens the one implicit window, through the SAME
    // constructor a `try-start` uses — the run IS the try. `n: 1` and `mode: 'direct'`
    // are what it is: one attempt, no bridge, no envelope leg. The fold rides on the
    // same three declared fields, so a chain of resumes is accounted identically.
    if (directRun && !open && ev.type === 'job-start') {
      open = openTry({ ...ev, n: 1, mode: 'direct', bridge: null });
      open.seen.push(ev);
      continue;
    }
    if (!open) {
      // a priced worker round outside every try window: nothing in this runner emits
      // one, so it is a writer this reader does not model. It is COUNTED and reported
      // rather than dropped — the blind-instrument class is what F45 is about.
      if (ev.type === 'worker-round') {
        strayRounds += 1;
        if (typeof ev.costUsd === 'number' && Number.isFinite(ev.costUsd)) strayCostUsd += ev.costUsd;
        else selectionComplete = false;
      }
      continue;
    }
    open.seen.push(ev);
    if (ev.type === 'worker-round') {
      // the ONE event the live ledger accounts (src/run.js) — same rule, same spelling
      if (typeof ev.costUsd === 'number' && Number.isFinite(ev.costUsd)) open.roundsUsd += ev.costUsd;
      else open.roundsComplete = false;
    } else if (ev.type === 'job-end') {
      open.jobEnd = ev;
    } else if (ev.type === 'bridge-write') {
      open.r1Written = true;
    } else if (ev.type === 'replan') {
      // ONE record per replan the runner drafts, so counting them IS the leg's ledger
      // — never re-derived from `plan-accepted` (a resumed leg emits one of those for a
      // plan it RELOADED, which would read as a redraft nobody paid for).
      open.windowReplans += 1;
      // the arbiter stamps `granted` only on the extra it granted past the ordinary
      // ceiling, and stamps nothing on the ordinary one — so PRESENCE is the whole
      // signal, and reading it by presence keeps this reader honest about a reading it
      // does not itself make (never re-deciding whether the trend deserved it).
      if (ev.granted !== undefined) open.windowGrantUsed = true;
    } else if (ev.type === 'try-end') {
      completed.push({ ...ev, seq: undefined, ts: undefined, inherited: true });
      if (open.bridge) tried.push(open.bridge);
      open = null;
    }
  }

  const lastTs = list.length ? Date.parse(String(list.at(-1).ts)) : NaN;
  const died = typeof deathAt === 'number' && Number.isFinite(deathAt) ? deathAt : lastTs;
  const deathAtKnown = Number.isFinite(died);

  /** @type {any} */
  let restart = null;
  let r1Missing = false;
  /** v1.46 §3 — a landed terminal that is a governance HALT rather than a verdict.
   * The close never got the say it was asked for: the run ran out of an operator-owned
   * allowance with its work on disk and its plan on the spine, so the window is a
   * CHECKPOINT and re-entering it is the ruling, not a second payment for an answer
   * already in hand. Empty by default, which is what keeps the reuse loop's own
   * graded-row semantics exactly where they were. */
  const recordedOutcome = open?.jobEnd ? String(open.jobEnd.outcome) : null;
  /** D4a — the MISLABELLED wall stop, derived from the run's own primary records.
   *
   * `step-red` is a verdict-shaped terminal and stays non-resumable: a red is an
   * answer. But on u-msmt91t3 the runner minted one 9.9 seconds AFTER its own
   * `wall-bounded` record — a governance stop wearing a capability label, because the
   * step-variance terminal did not re-read the clock (fixed at the source, src/planrun.js).
   * Spines already written under the defect are not re-runnable and cannot be edited (a
   * spine is append-only forever), so the READER derives the truth the file already
   * holds: a run whose own record says the wall was crossed BEFORE it ended is a wall
   * stop, and W-2's ruling applies — it keeps the grades it minted and pauses.
   *
   * Three constraints, each of them load-bearing:
   *   * a DERIVATION, never an override. The evidence is the run's own `wall-bounded`
   *     event, emitted by the runner at the round seam; no caller can assert this.
   *   * `step-red` ONLY, and only when `wall-halt` is itself resumable for this caller.
   *     Every other outcome — green, escalated, provider-red, a step-red with no wall
   *     record — is untouched, so "a red is an answer" survives intact.
   *   * it touches NO close verdict. `step-red` here is a GOVERNANCE stop label; the
   *     grades the close rendered are exactly what they were, and the resume seeds
   *     from them.
   * @param {any[]} seen @param {any} jobEnd */
  const wallCrossedBefore = (seen, jobEnd) => {
    // strictly BEFORE the terminal: a record written after the run ended could not have
    // been what stopped it. `indexOf` on the window's own array is the ordering there is
    // (the reader never re-sorts), and a jobEnd somehow absent from it reads nothing.
    const end = seen.indexOf(jobEnd);
    if (end < 0) return false;
    for (let i = 0; i < end; i += 1) {
      const e = seen[i];
      if (!isObj(e) || e.type !== 'wall-bounded' || e.bounded !== true) continue;
      // the clock's OWN two spellings of "the deadline passed", both off `clock.report`.
      // Never a re-derivation from timestamps: a second arithmetic for one question is
      // how two instruments come to disagree.
      if (e.remainingMs === 0) return true;
      if (typeof e.elapsedMs === 'number' && typeof e.requestedMs === 'number' && e.elapsedMs >= e.requestedMs) return true;
    }
    return false;
  };
  const wallDerivedHalt = recordedOutcome === 'step-red'
    && resumableHalt.has('wall-halt')
    && wallCrossedBefore(open.seen, open.jobEnd);
  const haltedResumable = recordedOutcome !== null
    && (resumableHalt.has(recordedOutcome) || wallDerivedHalt);
  if (open) {
    if (open.jobEnd && !haltedResumable) {
      // GRADED: runJob returned and the close had its say. Not a restart — the row is
      // reconstructed with the live loop's own reader, and the registry write that the
      // death may have cost is named.
      const read = readTry(open.seen);
      // the try STOPPED at its own terminal, not at the kill — the process may have gone
      // on for minutes afterwards writing the box it never finished. The precise answer
      // is on the record this branch is reading, so the kill time is the FALLBACK for a
      // terminal whose stamp cannot be parsed, never the first reading.
      const endedAt = Date.parse(String(open.jobEnd.ts));
      const stoppedAt = Number.isFinite(endedAt) ? endedAt : died;
      completed.push({
        n: open.n, mode: open.mode, bridge: open.bridge,
        runOutcome: open.jobEnd.outcome, verdictClass: verdictClassOf(String(open.jobEnd.outcome)),
        failingStage: read.failingStage, closeReached: read.closeReached,
        spentUsd: read.spentUsd, spendComplete: read.spendComplete,
        capUsd: head?.perTryBudgetUsd ?? null,
        wallMs: Number.isFinite(stoppedAt) && Number.isFinite(open.startedAtMs) ? open.declaredWallMs + (stoppedAt - open.startedAtMs) : null,
        wallCapMs: head?.perTryWallMs ?? null,
        rounds: read.rounds, inherited: true, rowLostToKill: true,
      });
      if (open.bridge) tried.push(open.bridge);
      r1Missing = !open.r1Written;
    } else {
      const windowRounds = readTry(open.seen).rounds;
      restart = {
        n: open.n, mode: open.mode, bridge: open.bridge,
        // WHERE inside the try the kill landed — the plan it accepted and the steps it
        // finished, or null when it died before a plan existed (hamr: "start last step
        // instead from the beginning"). Money and signature are unchanged by it.
        //
        // Read from THIS window first, and only then from the newest abandoned window of
        // the SAME try: an attempt that died before re-accepting the plan (the real leg-3
        // shape) still has its predecessor's checkpoint standing behind it, and the work
        // that checkpoint proves is on disk either way. Never across tries — a plan
        // belongs to the try that earned it, and running one try's workflow as another's
        // is the substitution D3 forbids at the selection seam.
        seed: readStepCheckpoint(open.seen)
          ?? abandoned.filter((w) => w.n === open.n).map((w) => readStepCheckpoint(w.seen)).filter(Boolean).at(-1)
          ?? null,
        // the CLOSE GRADES this leg recorded, so the resumed leg's halt readout spans
        // the chain rather than restarting at its own first close (readGradeSeed).
        // Read from THIS window only, never the abandoned ones: a plan checkpoint
        // survives an abandoned attempt because the work it proves is on disk, but a
        // grade is a reading of a tree at a moment, and the abandoned attempt's own
        // restart already re-graded that tree. Counting both would enter the same
        // reading twice and flatten a chain that moved.
        grades: readGradeSeed(open.seen),
        // the WORK BRANCH this leg's uncommitted work is sitting on (v1.57 §3). Read
        // from THIS window first and then from the newest abandoned window of the same
        // try, on the checkpoint's own rule and for the checkpoint's own reason: the
        // branch — like the plan — is a fact about the TREE, and the tree survives an
        // attempt that died before recording anything of its own. Null is the honest
        // answer for a leg killed before 0c (or a spine older than the record); the
        // resume then takes the cold path and creates one, which is correct, because a
        // leg that never branched has no work to strand.
        branch: readWorkBranch(open.seen)
          ?? abandoned.filter((w) => w.n === open.n).map((w) => readWorkBranch(w.seen)).filter(Boolean).at(-1)
          ?? null,
        // the REPLAN ledger, folded like the money one line below and deliberately
        // NOT like the grades one line above. A grade seed feeds a READOUT and its
        // documented shortening chain can only under-claim a direction; this feeds a
        // BOUND, where under-claiming is a refilled allowance and every kill would buy
        // one (PRD v1.12: unlimited replanning launders thrash as adaptation). So it
        // reads the declared fold plus THIS window's own records — the same arithmetic
        // as `priorSpentUsd`, which is what makes a resume of a resume inherit leg 1.
        //
        // The abandoned windows are not read, for the money's exact reason: the
        // restart DECLARED what it inherited, so counting the window it abandoned
        // would charge the chain twice for one leg's replans.
        replans: open.declaredReplans + open.windowReplans,
        replanGrantUsed: open.declaredGrantUsed || open.windowGrantUsed,
        priorSpentUsd: open.declaredSpentUsd + open.roundsUsd,
        // F83 — was that fold EXACT? Three sources, because `runJob` decides the same
        // question from more than this window can see (src/run.js: `!unpriced &&
        // !stalled && !cutMidCall && !priorFloor`):
        //   - what the attempt DECLARED it inherited (`priorFloor`, one resume back),
        //   - the rounds this reader can count (`unpriced`), and
        //   - the attempt's OWN terminal, when it landed one.
        // The third is what closes the seam. A `stalled` or `cutMidCall` floor leaves
        // every counted round PRICED, so the first two read exact and the fold came
        // back exact — a leg that honestly said `spendComplete: false` was laundered
        // into an exact total one function call later (F6). `readTry`, the GRADED
        // branch of this same reader, has always consulted the terminal; only this one
        // skipped it, and the asymmetry was the tell.
        //
        // Read only where a terminal EXISTS — the resumable-halt shape. The ordinary
        // killed-mid-flight restart has no `job-end` in its window at all and is
        // unchanged by construction: nothing to consult is not an unknown, it is the
        // same two sources as before. `!== false` matches `declaredComplete` above,
        // the sibling fold field on the same object: `runJob` emits the flag on EVERY
        // terminal precisely so no consumer branches on presence, so absence means a
        // spine older than the flag, never a floor being hidden.
        priorSpendComplete: open.declaredComplete && open.roundsComplete
          && (open.jobEnd ? open.jobEnd.spendComplete !== false : true),
        priorWallMs: deathAtKnown && Number.isFinite(open.startedAtMs)
          ? open.declaredWallMs + Math.max(0, died - open.startedAtMs)
          : open.declaredWallMs,
        // the ROUNDS the dead attempt bought, so the restarted try's row is read against
        // the same span its money and its wall already are. Counted with `readTry` — the
        // one turn-counting rule this file has — never a second arithmetic. Null when
        // either half is unknown: a fold that cannot be established honestly is not
        // folded, and the row states the unknown rather than a number it invented (F6).
        priorRounds: open.declaredRounds !== null && typeof windowRounds === 'number'
          ? open.declaredRounds + windowRounds
          : null,
      };
      if (open.bridge) tried.push(open.bridge);
    }
  }

  // the money, in two figures that are deliberately NOT the same one:
  //  - `carry*` is what a resumed run seeds its own ledger with. The restart's fold is
  //    excluded, because it is handed to `runJob` as `priorSpentUsd` and comes back
  //    inside the restarted try's own terminal — seeding it here too would count it twice.
  //  - `spentUsd` is everything the dead run spent, which is what a human reads.
  let carrySpentUsd = selectionCostUsd + strayCostUsd;
  let carrySpendComplete = selectionComplete;
  for (const t of completed) {
    if (typeof t.spentUsd === 'number' && Number.isFinite(t.spentUsd)) carrySpentUsd += t.spentUsd;
    else carrySpendComplete = false;
    if (t.spendComplete !== true) carrySpendComplete = false;
  }
  const spentUsd = carrySpentUsd + (restart ? restart.priorSpentUsd : 0);
  const spendComplete = carrySpendComplete && (!restart || restart.priorSpendComplete);

  /** the terminal a DIRECT spine landed on, which is its `job-end` — there is no
   * `reuse-end` on a run nobody wrapped in an envelope. A resumable halt is
   * deliberately NOT "ended": the caller's refusal gate reads that field to mean
   * "there is nothing left to continue", and the whole amendment is that on a halt
   * there is. `endOutcome` names it either way, so nothing is hidden. */
  const directEnd = directRun ? open?.jobEnd ?? null : null;
  /** a direct spine's own head record — `job-start` carries the identity fields the
   * envelope would otherwise supply (which job, which spec version, what ceiling) */
  const directHead = directRun ? list.find((e) => e.type === 'job-start') ?? null : null;
  return {
    started: head !== null || directHead !== null,
    approvalHash: head?.approvalHash ?? null,
    specHash: head?.specHash ?? directHead?.specHash ?? null,
    patient: head?.patient ?? null,
    job: head?.job ?? directHead?.job ?? null,
    bridgeTries: typeof head?.bridgeTries === 'number' ? head.bridgeTries : null,
    perTryBudgetUsd: head?.perTryBudgetUsd ?? directHead?.budgetUsd ?? null,
    perTryWallMs: head?.perTryWallMs ?? null,
    ended: end !== null || (directEnd !== null && !haltedResumable),
    // the RECORDED terminal, always — the derivation below never rewrites what the run
    // said about itself, it only says how this reader read it
    endOutcome: end?.outcome ?? directEnd?.outcome ?? null,
    /** D4a — true when a recorded `step-red` was re-read as a wall-halt off this run's
     * OWN `wall-bounded` record. Surfaced rather than silent: an operator resuming a
     * run whose spine says `step-red` must be told which record turned it into a
     * checkpoint, or the gate looks like it simply stopped refusing. */
    wallDerivedHalt,
    greened: completed.some((t) => t.verdictClass === 'green'),
    completed,
    tried,
    selectionCostUsd, selectionComplete, strayRounds,
    r1Missing, restart, deathAtKnown,
    spentUsd, spendComplete, carrySpentUsd, carrySpendComplete,
  };
}

/**
 * THE PAUSE TTL (2026-08-12 §2): a hitl checkpoint is kept for 60 days.
 *
 * OPEN-2, RULED (hamr, in-turn, 2026-08-13): **the TTL lives in the LIBRARY**, so
 * the exported bundle (a headless runner with bareloop as a dependency, PRD v1.44
 * §2) inherits it instead of every runner re-implementing it. A script-only TTL
 * would vanish on export — the one place the rule is most needed and least
 * likely to be re-typed.
 */
export const PAUSE_TTL_MS = 60 * 24 * 60 * 60_000;

/**
 * The AGE gate for a paused checkpoint — the sibling of `resumeTreeGate`, and it
 * asks the other question a 60-day-old checkpoint raises. The tree gate asks
 * *is this still the tree the run left?*; this asks *is this still a decision
 * anyone is waiting on?*
 *
 * THREE things it deliberately does NOT do:
 *
 *  - it does not widen any other resume rule. The 2026-08-12 ruling is about a
 *    person deciding, so `applies: false` on every other terminal: a cap-halt
 *    checkpoint is a different stop under a different allowance, and quietly
 *    ageing it out would be a governance change nobody ruled.
 *  - it does not treat an unreadable stamp as young (F6). A checkpoint that
 *    cannot say WHEN it paused has an unknown age, and unknown is refused rather
 *    than rounded down to fresh — the direction that fails safe.
 *  - it does not skip silently. An expired checkpoint comes back as a refusal
 *    that NAMES the age and the TTL, because the operator's next move (start
 *    fresh) depends on knowing which of the two it hit.
 *
 * The clock is injected for the same reason `runPlan`'s is: a rule measured in
 * months cannot otherwise be tested at all.
 *
 * @param {any[]} events the paused run's own spine, parsed, in file order
 * @param {{now?: () => number, ttlMs?: number}} [opts]
 * @returns {{ok: boolean, applies: boolean, ageMs: number|null, ttlMs: number, pausedAt: string|null, detail: string|null}}
 */
export function checkpointAgeGate(events, { now = Date.now, ttlMs = PAUSE_TTL_MS } = {}) {
  const list = Array.isArray(events) ? events.filter(isObj) : [];
  const end = list.filter((e) => e.type === 'job-end').at(-1) ?? null;
  const base = { applies: false, ageMs: null, ttlMs, pausedAt: null, detail: null };
  if (end?.outcome !== HITL_PAUSE) return { ...base, ok: true };

  // the PAUSE RECORD's own timestamp, and its terminal's as the fallback: the
  // pause is what the human is answering, so its stamp is when the waiting began
  const pause = list.filter((e) => e.type === HITL_PAUSE).at(-1) ?? end;
  const pausedAt = typeof pause.ts === 'string' ? pause.ts : null;
  const atMs = pausedAt === null ? NaN : Date.parse(pausedAt);
  if (!Number.isFinite(atMs)) {
    return {
      ...base,
      ok: false,
      applies: true,
      detail: 'this checkpoint does not record when it paused, so its age is unknown — and an unknown age is not a '
        + `young one (F6). The TTL is ${Math.round(ttlMs / 86_400_000)} days; start a fresh run rather than resuming a `
        + 'checkpoint nothing can date.',
    };
  }
  const ageMs = Math.max(0, now() - atMs);
  const days = (/** @type {number} */ ms) => Math.floor(ms / 86_400_000);
  if (ageMs > ttlMs) {
    return {
      ...base,
      ok: false,
      applies: true,
      ageMs,
      pausedAt,
      detail: `this run paused ${days(ageMs)} days ago and the pause TTL is ${days(ttlMs)} days — the tree, the `
        + 'toolchain and the job itself have had two months to move, so the evidence the signer would be answering '
        + 'about is no longer the evidence the run produced. Start a fresh run.',
    };
  }
  return { ...base, ok: true, applies: true, ageMs, pausedAt };
}

/**
 * The PATIENT gate for a resume, which is deliberately NOT the fresh-launch one.
 *
 * A fresh reuse run refuses a dirty tree: a run that inherits the previous run's edits
 * measures the wrong thing. A RESUME is the opposite case — the dead tries' work is real
 * progress this run already paid for, the tries share one workdir by design, and the tree
 * is reset between RUNS by the operator, never by the harness. So a dirty tree is exactly
 * what a resume expects to find, and it is continued as the run left it: not reset, not
 * refused.
 *
 * What IS refused is HEAD moving off the seed. That is not the run's own work — nothing
 * in the flow commits — so it means a human committed, rebased or checked something out
 * under the dead run. The reconstruction's premise (this tree is where try N left it) no
 * longer holds, and that decision comes back to the operator.
 *
 * @param {{head: string, seed: string, dirty: string}} state as `git rev-parse HEAD` and
 *   `git status --porcelain` report it
 * @returns {{ok: boolean, detail: string|null}}
 */
export function resumeTreeGate({ head, seed, dirty }) {
  if (head !== seed) {
    return {
      ok: false,
      detail: `HEAD is ${String(head).slice(0, 12)}, not the frozen seed ${String(seed).slice(0, 12)} — something COMMITTED or rebased under the dead run. Nothing in a run does that, so this is operator intervention and the resume stops rather than continuing on a tree it cannot vouch for.`,
    };
  }
  // `dirty` is not even read for a verdict: it is the expected state. Named in the return
  // so a caller can report what it is continuing on top of.
  return { ok: true, detail: dirty ? `continuing a WORKING tree (${dirty.trimEnd().split('\n').length} changed paths) — the dead tries' progress is kept, never reset` : null };
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
 * **RESUME (module C).** With `resume` — a `readResume` reading of the dead run's own
 * spine — the same loop picks up where a killed run stopped: the completed tries are
 * seeded in (never re-run, their bridges never re-offered), a try that was mid-flight is
 * RESTARTED from its beginning against the SAME workflow and with NO second selection
 * call (the pick was made and paid for), and it runs under the REMAINDER of its own
 * signed per-try numbers. The remainder is expressed as a FOLD of the dead attempt's
 * spend and wall — never as tightened caps — because the caps are in the spec hash and
 * rewriting them would need a signature nobody typed. If the remainder cannot fund the
 * restart the run caps honestly, having launched nothing.
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
 * @param {number} [opts.strikeLimit] forwarded (a plan step's strike ceiling)
 * @param {number} [opts.closeTimeoutMs] forwarded
 * @param {boolean} [opts.layerRoot] forwarded
 * @param {any} [opts.resume] RESUME (module C) — a `readResume` reading of the KILLED
 *   run's own spine. Its `approvalHash` must match this run's, or the run refuses:
 *   a resume continues ONE signed run, not any run.
 * @param {typeof shippedRunJob} [opts.runJob] the job runner. An injected seam of the
 *   same class as `provider`: a try is a real paid run, and the loop's own logic —
 *   selection order, exclusion, minting, exhaustion — is not testable against one.
 * @param {() => number} [opts.now] the clock, injected (per-try wall measurement)
 * @returns {Promise<any>} `{ outcome, tries, selection, spentUsd, spendComplete,
 *   bridgeWrites, decision, options, reds, triesAuthorized, triesUsed, envelope, specHash,
 *   approvalHash }` — `specHash` is the per-try spec's (what `runJob`'s own gate reads);
 *   `approvalHash` is the OPERATOR's, covering all three envelope numbers
 */
export async function runReuse(opts) {
  const {
    job, approvals, registryDir, patient, workdir, provider, selectionProvider,
    emit, ask, pinned = null, shortlist = null, forceCold = false,
    providerFor, nativeProvider, capRuns, strikeLimit, closeTimeoutMs, layerRoot,
    runJob = shippedRunJob, now = () => Date.now(),
  } = opts;
  const runid = opts.runid ?? Date.now().toString(36);
  const resume = isObj(opts.resume) ? /** @type {any} */ (opts.resume) : null;
  /** a try that inherits nothing: the ordinary, non-resumed attempt */
  const NO_PRIOR = { spentUsd: 0, wallMs: 0, spendComplete: true, rounds: /** @type {number|null} */ (0), grades: /** @type {any[]} */ ([]), replans: 0, replanGrantUsed: false };

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
   * @param {string} outcome @param {object} [extra]
   * @param {boolean} [escalate] emit the reuse-level escalation. False for the ONE stop
   *   whose category the ledger CLASSIFIES (`interpreter-red`): runJob already filed it
   *   from the fault's own site with its typed `lib`, and a second copy would count one
   *   wiring fault twice against an upstream package. The terminal stays decision-ready
   *   in the RETURN value either way. */
  const done = (outcome, extra = {}, escalate = true) => {
    const out = {
      outcome, tries, selection, spentUsd, spendComplete, bridgeWrites,
      // read off the SIGNED artifact once one exists — the count reported IS the count
      // enforced IS the count hashed. The raw echo covers the envelope-red case only,
      // where nothing resolved and nothing ran.
      triesAuthorized: resolved ? resolved.bridgeTries : (isObj(opts.envelope) ? /** @type {any} */ (opts.envelope).bridgeTries : null),
      triesUsed: tries.filter((t) => t.mode === 'bridge').length,
      envelope: env?.envelope ?? null, specHash: trySpecHash, approvalHash, reds: [], decision: null, options: [], category: null,
      ...extra,
    };
    emit('reuse-end', { outcome: out.outcome, triesUsed: out.triesUsed, triesAuthorized: out.triesAuthorized, spentUsd: out.spentUsd, spendComplete: out.spendComplete, bridgeWrites: bridgeWrites.map((w) => `${w.action} ${w.name}`) });
    if (out.decision && escalate) {
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
  /** the operator-facing signature: all three envelope numbers, one hash */
  let approvalHash = null;
  /** @type {{schema: string, spec: any, bridgeTries: number}|null} the SIGNED artifact —
   * every number this run enforces is read back off it, never off the raw envelope */
  let resolved = null;
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
  // the signed artifact, resolved ONCE: the per-try spec `runJob` executes plus the try
  // count, hashed together so the signature covers the run's whole worst case
  resolved = resolveReuse(job, envelope);
  const trySpec = resolved.spec;
  trySpecHash = jobSpecHash(trySpec);
  approvalHash = reuseSpecHash(resolved);
  emit('reuse-start', {
    job: job.job, patient, registryDir, specHash: trySpecHash, approvalHash,
    perTryBudgetUsd: envelope.perTryBudgetUsd, perTryWallMs: envelope.perTryWallMs, bridgeTries: resolved.bridgeTries,
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
   * @param {any|null} bridge @param {number} n
   * @param {{spentUsd: number, wallMs: number, spendComplete: boolean, rounds: number|null, grades: any[], replans: number, replanGrantUsed: boolean}} [prior]
   *   RESUME — what a KILLED attempt of this same try already consumed, and what it
   *   already measured. Money and wall are FOLDED into the attempt (`runJob`'s own ledger
   *   and clock start partly spent) rather than shrinking the caps, so the signed per-try
   *   numbers stay the numbers hashed and the numbers reported. `rounds` folds the same
   *   way but on the ROW alone (nothing enforces a round bound here), and `null` — an
   *   attempt whose turns could not be counted — is reported, never folded. `grades` are
   *   the close readings that leg recorded, handed on as the run trend's BASELINES: they
   *   feed the HALT READOUT alone and spend none of this attempt's bounds. `replans` /
   *   `replanGrantUsed` are the opposite kind of inheritance and sit here for that
   *   contrast: they SPEND a bound (the plan flow's replan ceiling), because that ceiling
   *   is the RUN's by doctrine and a fresh one per kill is the creep v1.12 forbids.
   * @param {any} [seed] RESUME (v2) — WHERE that attempt was killed (`readResume`'s
   *   `restart.seed`): the plan it accepted and the steps it finished. The fold says how
   *   much of the try's allowance is gone; this says how much of its WORK is done, so the
   *   restart re-pays for neither the scout, the draft, nor a finished step. Null is the
   *   scout/draft death, where nothing paid is re-payable and the try simply restarts.
   * @param {string|null} [branch] RESUME (v1.57 §3) — the WORK BRANCH that attempt's work
   *   is sitting on (`readResume`'s `restart.branch`). The name is derived from the SIGNED
   *   spec and is therefore the same on every leg, so a restart that recomputed it would
   *   collide with its own predecessor and be handed a fresh `-2` beside the work it came
   *   back for. Declared and inherited, exactly like the money and the replan ledger. Null
   *   is the cold path, and also the leg killed before it ever branched.
   * @returns {Promise<any>} the try row */
  const runTry = async (bridge, n, prior = NO_PRIOR, seed = null, branch = null) => {
    const mode = bridge ? 'bridge' : 'cold';
    const name = bridge ? bridge.name : null;
    const resumed = prior.spentUsd > 0 || prior.wallMs > 0;
    emit('try-start', {
      n, mode, bridge: name, capUsd: envelope.perTryBudgetUsd, wallCapMs: envelope.perTryWallMs,
      // DECLARED on the spine, and only when there is one — a non-resumed run's spine
      // stays byte-identical. The declaration is what makes a resume OF a resume fold
      // once: the next reader adds this attempt's own rounds to the number stated here
      // instead of re-deriving the whole history and double-billing an abandoned attempt.
      // `priorRounds` rides in that same declaration, INCLUDING when it is null: absence
      // means "a spine older than this field", and a reader that cannot tell that from a
      // predecessor's honest unknown would launder the unknown into a zero (F6).
      ...(resumed ? { priorSpentUsd: prior.spentUsd, priorWallMs: prior.wallMs, priorSpendComplete: prior.spendComplete, priorRounds: prior.rounds, resumedFrom: resume?.fromRunid ?? runid } : {}),
      // the REPLAN ledger, declared on the same record and for the same reason as the
      // money: the next reader adds only its own window's `replan` records to this
      // number, so a chain of resumes folds once instead of restarting the ceiling at
      // whichever leg it happens to be reading (PRD v1.12 — the bound is the RUN's).
      // Declared independently of `resumed`, which is a MONEY/WALL test: a leg can
      // replan without buying a round the fold would notice, and gating the ledger on
      // the wallet would drop it exactly there. Only when there is one to state — a
      // decorative zero is indistinguishable from a leg nobody folded.
      ...(prior.replans > 0 ? { priorReplans: prior.replans, priorReplanGrantUsed: prior.replanGrantUsed } : {}),
      // WHERE it picks up, on the row's own record: a try that restarts at step 3 of 4 is
      // a materially different attempt from one that restarts at its beginning, and a
      // reader must not have to infer which happened from the absence of a scout.
      ...(seed ? { resumedAt: { phase: seed.phase, stepsDone: seed.completedSteps.length, stepsPlanned: seed.plan?.steps?.length ?? null } } : {}),
    });
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
        ...(strikeLimit !== undefined ? { strikeLimit } : {}),
        ...(closeTimeoutMs !== undefined ? { closeTimeoutMs } : {}),
        ...(layerRoot !== undefined ? { layerRoot } : {}),
        // the fold, and whether the fold is EXACT. `priorSpendComplete` used to stop at
        // the `try-start` record: it was computed, written down, and then not handed to
        // the one component whose `job-end` the row's own `spendComplete` is read off —
        // so a restart of a partly-unpriced attempt came back looking exact. The unknown
        // travels WITH the money it qualifies (F6).
        ...(resumed ? { priorSpentUsd: prior.spentUsd, priorWallMs: prior.wallMs, priorSpendComplete: prior.spendComplete } : {}),
        // the dead leg's close grades, as the run trend's BASELINES. Same class of
        // omission the fold above was: computed by `readResume`, declared on the record,
        // and then not handed to the component whose halt readout is read off it — a
        // restarted leg would report `flat` on a run that was converging. Only when there
        // ARE grades: an empty array is the cold path, and the cold path stays identical.
        ...(prior.grades.length ? { resumeGrades: prior.grades } : {}),
        // and the replan LEDGER. Same omission class as the two above, with a sharper
        // cost: a grade seam that never arrives makes a readout say `flat`, while a
        // ceiling that never arrives is spent by the dead leg and fresh in this one —
        // a bound the operator signed, widened by a kill (PRD v1.12).
        ...(prior.replans > 0 ? { resumeReplans: { count: prior.replans, grantUsed: prior.replanGrantUsed } } : {}),
        ...(seed ? { resumeSeed: seed } : {}),
        // …and WHERE its work is. Same omission class as the three folds above, with its
        // own cost: a branch that never arrives is not a wrong number but a SECOND branch,
        // and the leg would carry on beside the tree it was resumed to continue.
        ...(branch ? { resumeBranch: branch } : {}),
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
    // the try's WHOLE wall, both attempts: the fold is time this try already consumed,
    // and a row quoting only the restart's minutes against the signed cap would read as
    // a try that ran comfortably inside a wall it had in fact nearly exhausted
    const wallMs = prior.wallMs + (now() - started);
    // and the try's WHOLE round count, on the same fold and the same reason — a row
    // reading "$8.59 / 20 rounds" for 113 rounds bought states two numbers measured over
    // different spans. Unknown on either side stays unknown: an unfoldable count is
    // reported as null, never as the half of it this leg happens to be able to see (F6).
    // Cold, `prior.rounds` is 0 and this is exactly `read.rounds`.
    const rounds = typeof read.rounds === 'number' && typeof prior.rounds === 'number' ? prior.rounds + read.rounds : null;
    const verdictClass = verdictClassOf(outcome);
    const row = /** @type {Record<string, any>} */ ({
      n, mode, bridge: name, runOutcome: outcome, verdictClass,
      failingStage: read.failingStage, closeReached: read.closeReached,
      // `spentUsd` is the try's WHOLE spend: `runJob`'s ledger started at the fold, so
      // its terminal already states both attempts. The dead attempt's money is never
      // laundered into $0 by a restart (F6/F12).
      spentUsd: read.spentUsd, spendComplete: read.spendComplete, capUsd: envelope.perTryBudgetUsd,
      // `capBound` is the row's own reading of the money bind, and it is the OUTCOME that
      // says so — never a comparison of spend against cap, which cannot tell a run that
      // finished at its cap from one the cap cut off.
      capBound: outcome === 'cap-halt',
      wallMs, wallCapMs: envelope.perTryWallMs, wallBound: outcome === 'wall-halt',
      rounds, plan: read.plan, bridgeWrite: null,
      ...(resumed ? { restarted: true, priorSpentUsd: prior.spentUsd, priorWallMs: prior.wallMs, priorRounds: prior.rounds } : {}),
    });
    // F6 on the resumed row: when the restart could not say what it spent, the fold is
    // still a KNOWN floor and is kept as one — dropping it would report less money than
    // the run is already known to have spent.
    if (read.spentUsd === null && prior.spentUsd > 0) account(prior.spentUsd, false);
    else account(read.spentUsd, read.spendComplete);

    // ── R1: the box. A green mints the next version FROM THE PLAN AS EXECUTED; anything
    // else writes a history row and leaves the recipe untouched.
    const record = {
      runid: `${runid}-t${n}`, patient, at: new Date(now()).toISOString(),
      costUsd: read.spentUsd, spendComplete: read.spendComplete, wallMs, rounds,
      ...(trySpecHash ? { specHash: trySpecHash } : {}),
    };
    if (outcome === 'already-green') {
      // A GREEN THAT PREDATES THE RUN mints nothing, and the guard keys on the
      // TERMINAL rather than on the absence of a plan. `already-green` means the
      // close was satisfied at the precheck — before this leg wrote a byte — so
      // whatever plan is on the spine did not produce it, and minting a version
      // from one would be learning credit for work that did not happen.
      //
      // It used to be covered by accident: a cold already-green never drafts, so
      // `read.plan` was null and the branch below caught it. N4 broke that
      // accident — a hitl try that PAUSED and came back with the signer's
      // `accept` lands `already-green` with its predecessor's `plan-accepted`
      // sitting in the same try window. A rule with no wired detector is prose.
      bridgeWrites.push({
        name,
        action: 'none',
        file: null,
        reds: [{
          code: 'green-predates-run',
          path: 'outcome',
          detail: 'the close was already satisfied before this run did anything (already-green) — nothing here earned '
            + 'a version, and a plan on the spine did not produce this green',
        }],
      });
    } else if (verdictClass === 'green' && read.plan === null) {
      // a green with no plan on the spine cannot mint a version — the artifact that
      // inherits is the one that RAN, and there is nothing here to inherit. Reported,
      // never faked with a placeholder.
      bridgeWrites.push({ name, action: 'none', file: null, reds: [{ code: 'no-plan-executed', path: 'plan', detail: 'the run greened but emitted no accepted plan — nothing to mint (R1: the artifact that inherits is the one that ran)' }] });
    } else if (verdictClass === 'green') {
      const meta = {
        name: name ?? job.job,
        goal: job.goal,
        specHash: trySpecHash,
        closeStageNames: (closeStagesOf(job) ?? []).map((/** @type {any} */ s) => s.name),
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
   * @param {{ok: boolean, reds: any[], bridge: any}} r @param {string|null} name @param {string} action
   * @param {object} [extra] fields that make the write's own story visible on the record */
  const commit = (r, name, action, extra = {}) => {
    if (!r.ok) {
      const w = { name, action: 'none', file: null, reds: r.reds, ...extra };
      bridgeWrites.push(w);
      emit('bridge-write', w);
      return w;
    }
    const s = saveBridge(registryDir, r.bridge);
    const w = { name: r.bridge.name, action: s.ok ? action : 'none', file: s.file, reds: s.reds, ...extra };
    bridgeWrites.push(w);
    emit('bridge-write', w);
    return w;
  };

  /** a refused write, recorded exactly like a committed one so a reader never has to
   * branch on presence @param {string} name @param {any} red @param {object} [extra] */
  const refuseWrite = (name, red, extra = {}) => {
    const w = { name, action: 'none', file: null, reds: [red], ...extra };
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
    // the BRIDGE leg needs no shape check: `runJob`'s own load gate already proved this
    // entry is the same kind of recipe as this job, at the door, before a token was spent
    // (a mismatch never gets here — it returns `recipe-stale`).
    if (bridge) return commit(appendGreen(bridge, record), bridge.name, 'appendGreen');

    // the COLD leg's green. `mintBridge` is for a name nobody holds; a name that already
    // holds greens APPENDS, because a cold run of a job that already has a bridge is
    // another version of that workflow, and overwriting it would destroy the green that
    // minted it.
    //
    // But the name is the JOB's slug, and a job's CLOSE can be re-signed under that same
    // slug. Appending across two close shapes does two wrong things at once: it counts a
    // green another close rendered toward this entry's distinct-patient status (a false
    // `proven`), and it hands the load gate — which matches on exactly these stage names
    // — a plan that satisfied a different verification. So the shape is checked here with
    // the gate's own predicate, and a mismatch neither appends NOR discards the green: it
    // forks to a deterministic derived name, with the fork ON the record.
    const stageNames = Array.isArray(meta.closeStageNames) ? meta.closeStageNames : [];
    const entries = loadRegistry(registryDir).bridges;
    const existing = entries.find((/** @type {any} */ b) => b.name === meta.name);
    if (existing && sameCloseShape(existing, stageNames)) return commit(appendGreen(existing, record), meta.name, 'appendGreen');

    const forked = existing !== undefined;
    const target = forked ? shapeForkName(meta.name, stageNames) : meta.name;
    /** the fork's own story, carried on every write record it produces */
    const mark = forked ? { shapeForked: true, forkedFrom: meta.name, closeStageNames: [...stageNames] } : {};
    const held = forked ? entries.find((/** @type {any} */ b) => b.name === target) : undefined;
    if (held) {
      // the derived name is derived FROM the shape, so a readable entry there matches by
      // construction; a mismatch would mean two different closes hashed the same, and
      // that is refused rather than appended blind
      return sameCloseShape(held, stageNames)
        ? commit(appendGreen(held, record), target, 'appendGreen-shape-forked', mark)
        : refuseWrite(target, { code: 'shape-fork-collision', path: `${target}.json`, detail: `the derived name for close [${stageNames.join(' → ')}] is already held by an entry of a different shape — refusing to append this green to a recipe another close greened` }, mark);
    }
    // A file of that name that `loadRegistry` could not READ is not an absent entry — it
    // is an entry nobody can see, and minting over it destroys whatever greens it held.
    // `loadRegistry` skips-and-reports for that reason; the mint must not undo the skip.
    if (existsSync(join(registryDir, `${target}.json`))) {
      return refuseWrite(target, { code: 'mint-collision', path: `${target}.json`, detail: 'a file of this name exists but could not be read as a bridge — refusing to mint over it, because whatever greens it holds are not recoverable once overwritten. Repair or move it, then re-run.' }, mark);
    }
    return commit(mintBridge({ ...meta, name: target }, record), target, forked ? 'mint-shape-forked' : 'mint', mark);
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
        options: [
          // the approval hash, never the per-try spec's: the number an operator TYPES
          // covers all three envelope numbers, and handing over the inner one would send
          // them to sign a version that leaves the try count unsigned
          `sign this envelope: --approve ${approvalHash} (the approval hash covers all three numbers — per-try budget, per-try wall AND ${resolved ? resolved.bridgeTries : 'the'} tries)`,
          'use an envelope equal to the spec\'s own caps, which leaves the per-try spec hash-identical',
        ],
      },
      'job-red': {
        decision: 'The per-try spec did not validate, so no try can run — every further attempt would reproduce this exact refusal.',
        options: ['fix the job spec', 'check the envelope: it writes budgetUsd/maxWallMs onto the spec, and both have bounds'],
      },
      'smoke-red': {
        decision: 'The litectx primitive failed its known-answer check. No run verdict is trustworthy on a degraded primitive, and a second try would be judged by the same degraded one.',
        options: ['fix the primitive/store', 'abandon the run'],
      },
      'close-unsupported': {
        decision: 'The plan flow cannot execute this job\'s close — it runs commands whose exit codes are truth. Nothing was judged, and no workflow can be graded by a close that will not run, so the next try and the cold leg would refuse identically for $0 apiece.',
        options: ['restate the close as a staged (or single predicate) close — a spec edit, whose new hash needs re-approval', 'wait for the verdict-classes rung'],
      },
      'branch-red': {
        // NOT re-filed, for `interpreter-red`'s reason plus one of its own: the runner
        // already escalated it at the fault's own site, and the fault is the OPERATOR's
        // state (a patient that is not a git checkout, a crowded branch namespace),
        // never a library failing — the ledger excludes it for exactly that.
        refile: false,
        decision: 'The run could not create its own work branch, and no job runs on the branch it was handed (PRD v1.57 §3). That is a property of the PATIENT, not of any stored workflow: every further try and the cold leg would refuse identically, for $0 apiece.',
        options: [
          'make the patient a git checkout with at least one commit',
          'free the work-branch name (delete or rename the stale branches this run collided with)',
          'abandon the run',
        ],
      },
      'interpreter-red': {
        // NOT re-filed as an escalation. `interpreter-red` is one of the categories the
        // ledger CLASSIFIES — it aims a runtime-red at a library — and runJob already
        // emitted it at the fault's own site with its typed `lib`. A second copy from
        // here would count ONE wiring fault twice against an upstream package, which is
        // the step-stalled lesson exactly. The stop is still decision-ready in the
        // return value, and the spine still carries the fault's own escalation.
        refile: false,
        decision: 'The run stopped on a wiring/interpreter fault — the runner or a primitive it was handed is not correctly bound. That is a property of the RUN, not of any stored workflow: every further try would reproduce it, and so would the cold leg.',
        options: ['fix the wiring the escalation names (provider factory, store binding)', 'abandon the run'],
      },
    };
    const d = decisions[row.runOutcome];
    if (!d) return null;
    // the category IS the outcome here: each of these names its own story exactly. All
    // but one are in the ledger's excluded set (operator input, a degraded primitive, a
    // close the flow cannot run — never a library failing); the one that is not is the
    // one that does not re-file.
    const { refile = true, ...decision } = d;
    return done(row.runOutcome, { category: row.runOutcome, ...decision }, refile);
  };

  /** what to do once a try has returned: a green ends the run, and the stops no further
   * try could change end it too. Shared by the loop and by a resumed RESTART, which is
   * the same event happening at a different point in the same sequence.
   * @param {any} row @returns {any|null} the terminal, or null to carry on */
  const afterTry = (row) => (row.verdictClass === 'green' ? done('green', { decision: null }) : hardStop(row));

  // ── 3. RESUME (module C): pick up where the killed run stopped
  //
  // Three things are seeded and one is restarted. The completed tries come back as rows
  // (so the readout is the whole run, not the last leg of it) and their bridges come back
  // as SPENT (so no workflow this run already paid for is offered again); the money comes
  // back as the carried figure — deliberately WITHOUT any mid-try fold, which travels
  // into the restarted try's own ledger instead and would otherwise be counted twice.
  /** the cold leg's fold, when the kill landed inside the COLD attempt @type {any} */
  let coldRestart = null;
  let startN = 1;
  if (resume) {
    // the signature half of hamr's ruling: a resume continues ONE signed run. The
    // envelope is re-validated and re-hashed above from the CURRENT arguments, so a
    // mismatch here means the seed came from a different envelope than the one this
    // process is about to enforce — refused with both hashes named, exactly like a
    // fresh launch under a stale signature.
    // a seed with NO hash (a pre-hash-scheme spine) is a refusal, not a pass — the
    // strict comparison catches null/undefined too (tail-review F-2); signed specs are
    // never silently re-validated, and a missing signature is the least valid of all
    if (resume.approvalHash !== approvalHash) {
      return done('resume-red', {
        category: 'resume-red',
        decision: 'The run being resumed was signed under a DIFFERENT envelope than this one, so nothing was run — a resume continues one signed run, never any run.',
        options: ['resume with the envelope the dead run was signed under', 'start a fresh run under this envelope (the dead run\'s tries are then not inherited)'],
        detail: `dead run's approval hash ${resume.approvalHash}\nthis envelope's approval hash ${approvalHash}`,
      });
    }
    for (const t of Array.isArray(resume.completed) ? resume.completed : []) {
      tries.push({ ...t, inherited: true });
      if (typeof t.n === 'number' && t.n >= startN) startN = t.n + 1;
    }
    for (const name of Array.isArray(resume.tried) ? resume.tried : []) if (isNonEmptyString(name)) tried.add(name);
    // seeded through the SAME accountant the live legs use, so the floor rules are one
    // rule: a carried figure that is not a finite number, or that arrived flagged
    // incomplete, makes the resumed run's total a floor too.
    account(typeof resume.carrySpentUsd === 'number' ? resume.carrySpentUsd : null, resume.carrySpendComplete !== false);

    const rs = isObj(resume.restart) ? /** @type {any} */ (resume.restart) : null;
    const prior = rs
      ? {
        spentUsd: typeof rs.priorSpentUsd === 'number' && Number.isFinite(rs.priorSpentUsd) && rs.priorSpentUsd > 0 ? rs.priorSpentUsd : 0,
        wallMs: typeof rs.priorWallMs === 'number' && Number.isFinite(rs.priorWallMs) && rs.priorWallMs > 0 ? rs.priorWallMs : 0,
        spendComplete: rs.priorSpendComplete !== false,
        // the ROUNDS that attempt bought — folded like the wall so the row spans the same
        // legs its money already does. `null` is the honest unknown and is NOT folded.
        rounds: typeof rs.priorRounds === 'number' && Number.isFinite(rs.priorRounds) && rs.priorRounds >= 0 ? rs.priorRounds : null,
        // the dead leg's close GRADES, carried to the restart's halt readout so it
        // judges the chain and not just its own leg (readGradeSeed). Baselines only:
        // `runJob` seeds the RUN trend with them and never the strike governor — "did
        // this run make progress" and "is this loop out of ideas" are two questions,
        // and one instrument answering both is how they come to disagree.
        grades: Array.isArray(rs.grades) ? rs.grades : [],
        // the replan LEDGER the chain has spent — belted like the money and NOT like
        // the grades, because this one seeds a BOUND: a garbage or negative figure
        // that read through as a widening is the ceiling being refilled by a corrupt
        // spine (PRD v1.12). The latch rides beside the count, never derived from it.
        replans: typeof rs.replans === 'number' && Number.isFinite(rs.replans) && rs.replans > 0 ? Math.floor(rs.replans) : 0,
        replanGrantUsed: rs.replanGrantUsed === true,
      }
      : NO_PRIOR;
    const remainingCapUsd = envelope.perTryBudgetUsd - prior.spentUsd;
    const remainingWallMs = envelope.perTryWallMs - prior.wallMs;
    emit('resume-start', {
      fromRunid: resume.fromRunid ?? null, approvalHash,
      triesCompleted: tries.map((t) => ({ n: t.n, mode: t.mode, bridge: t.bridge, runOutcome: t.runOutcome })),
      tried: [...tried],
      carriedUsd: resume.carrySpentUsd ?? null, carriedComplete: resume.carrySpendComplete !== false,
      r1Missing: resume.r1Missing === true,
      // `gradesInherited` is a COUNT, and only when there is one to state: the seam
      // carries stage names and numbers, never a close byte — the spine is append-only,
      // so a gap that crosses here crosses for good.
      restart: rs ? { n: rs.n, mode: rs.mode, bridge: rs.bridge ?? null, priorSpentUsd: prior.spentUsd, priorWallMs: prior.wallMs, priorSpendComplete: prior.spendComplete, remainingCapUsd, remainingWallMs, resumedAt: rs.seed ? { phase: rs.seed.phase, stepsDone: rs.seed.completedSteps.length, stepsPlanned: rs.seed.plan?.steps?.length ?? null } : null, ...(prior.grades.length ? { gradesInherited: prior.grades.length } : {}),
        // WHERE it comes back to (v1.57 §3), stated before anything is spent rather than
        // discovered from the restarted leg's own `work-branch` record afterwards
        ...(rs.branch ? { branch: rs.branch } : {}) } : null,
      nextTry: rs ? null : startN,
    });

    if (rs) {
      // "if mid loop, restart that loop" — under the REMAINDER, and only if the
      // remainder can actually fund an attempt PLUS its close. It cannot be topped up
      // from here: raising a per-try number is a spec edit whose new hash the operator
      // signs (D7), so an unfundable restart STOPS, having launched nothing. The stop IS
      // the checkpoint — everything already earned is on the spine and in the box.
      const unfundable = remainingCapUsd <= 0
        ? {
          outcome: 'cap-halt',
          decision: `Try ${rs.n} was killed with ${prior.spendComplete ? '' : 'at least '}$${prior.spentUsd.toFixed(4)} of its $${envelope.perTryBudgetUsd} already spent, so no money remains to restart it. Prior spend folds into the ceiling — a kill can never buy a fresh allotment — so the run stops here with everything earned so far kept.`,
          detail: `remaining for try ${rs.n}: $${remainingCapUsd.toFixed(4)} of $${envelope.perTryBudgetUsd}`,
        }
        : remainingWallMs < MIN_WALL_MS
          ? {
            outcome: 'wall-halt',
            decision: `Try ${rs.n} was killed with ${(prior.wallMs / 60000).toFixed(1)}min of its ${(envelope.perTryWallMs / 60000).toFixed(1)}min already spent, leaving less than one close timeout. A try that cannot fund its own close produces an unreadable row, and an unreadable row is a casualty rather than evidence (F45), so nothing was launched.`,
            detail: `remaining for try ${rs.n}: ${remainingWallMs}ms, below the ${MIN_WALL_MS}ms floor (one close timeout)`,
          }
          : null;
      if (unfundable) {
        return done(unfundable.outcome, {
          category: unfundable.outcome,
          decision: unfundable.decision,
          detail: unfundable.detail,
          options: [
            'raise the envelope (a bigger per-try budget/wall) and resume again — that is a NEW envelope, so it needs a new signature (--approve the printed hash)',
            'revise the goal or the close — a spec edit, whose new hash needs re-approval',
            'abandon the run',
          ],
        });
      }
      if (rs.mode === 'cold') {
        // every bridge try was already spent before the cold leg started: the loop below
        // has nothing left to authorize, and the restart IS the cold attempt
        coldRestart = { n: typeof rs.n === 'number' ? rs.n : tries.length + 1, prior, seed: rs.seed ?? null, branch: rs.branch ?? null };
        startN = resolved.bridgeTries + 1;
      } else {
        const entry = loadRegistry(registryDir).bridges.find((/** @type {any} */ b) => b.name === rs.bridge);
        if (!entry) {
          // the pick was the operator's and the model's, made and paid for. Substituting
          // another workflow — or falling to cold — would be the runner overriding a
          // decision it did not make (D3's rule, at the resume seam).
          return done('resume-red', {
            category: 'resume-red',
            decision: `The workflow the killed run was part-way through (${JSON.stringify(rs.bridge)}) is no longer in the registry, so try ${rs.n} cannot be restarted and nothing was run. Which workflow this run continues from is not the runner's to change.`,
            options: [`restore ${JSON.stringify(rs.bridge)} to the registry and resume again`, 'start a fresh run (the completed tries are then not inherited)'],
            detail: `registry ${registryDir}`,
          });
        }
        tried.add(entry.name);
        const stop = afterTry(await runTry(entry, rs.n, prior, rs.seed ?? null, rs.branch ?? null));
        if (stop) return stop;
        startN = rs.n + 1;
      }
    }
    // tail-review F-1: a dead run that had already RUN its cold leg left the bridge loop
    // by DECISION (the model said none-matches), not by count — re-deriving startN from
    // try numbers alone re-enters the loop and buys a paid bridge try the signed preview
    // said would not happen, running it AFTER the cold leg (an order no fresh run can
    // produce). One predicate, mirroring the runner's own coldAlreadyRun arithmetic.
    if (!coldRestart && tries.some((t) => t.mode === 'cold' && t.inherited)) startN = resolved.bridgeTries + 1;
  }

  // ── 4. the tries
  // the bound is read off the SIGNED artifact, not the raw envelope: the count that
  // authorizes spend here is the count the operator's signature covers
  for (let n = startN; n <= resolved.bridgeTries; n += 1) {
    // reloaded per try: the row the LAST try just wrote is part of what the next pick
    // reads, and a registry read once at the top would hand every later selection a
    // history that stopped at the start of the run
    const registry = loadRegistry(registryDir);
    // The pin travels only until it has had its try. Once its name is in `tried` it is
    // EXCLUDED from the listing, so restating it as the pin makes every answer the model
    // can legally give a refusal (D3 refuses anything that is not the pin) — and the run
    // would end "nothing was run" with a paid try behind it and tries still authorized.
    // A spent pin is a decision already honoured, not a standing instruction.
    const pinNow = pinned && !tried.has(pinned) ? pinned : null;
    const sel = await selectBridge({
      registry, job, ask: askText, provider: selectionProvider ?? provider,
      pinned: pinNow, shortlist, forceCold, exclude: [...tried],
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
    const stop = afterTry(await runTry(entry, n));
    if (stop) return stop;
  }

  // ── 5. "then start anew" — the cold leg, under the SAME per-try numbers (or, when the
  // kill landed inside the cold attempt itself, under what is LEFT of them)
  //
  // A resumed run can arrive here with the cold leg ALREADY RUN: the killed process
  // finished it and died before its own terminal (a narrow window, but a real one — and
  // the one where a second draft would cost a whole extra attempt the envelope never
  // authorized). The inherited row IS the cold leg; nothing is re-run, and the run keeps
  // the verdict that attempt actually earned.
  const inheritedCold = coldRestart ? null : tries.find((t) => t.mode === 'cold' && t.inherited) ?? null;
  const cold = coldRestart
    ? await runTry(null, coldRestart.n, coldRestart.prior, coldRestart.seed, coldRestart.branch)
    : inheritedCold ?? await runTry(null, tries.length + 1);
  const coldStop = afterTry(cold);
  if (coldStop) return coldStop;
  return done(cold.runOutcome, {
    category: 'reuse-exhausted',
    decision: `Every authorized attempt is spent: ${tries.filter((t) => t.mode === 'bridge').length} workflow ${tries.filter((t) => t.mode === 'bridge').length === 1 ? 'try' : 'tries'} of ${resolved.bridgeTries}, then a cold draft, and the job's own verification is still not satisfied. The envelope pre-authorized exactly this much and no more.`,
    options: [
      'raise the envelope (more tries, or a bigger per-try budget/wall) and rerun — resume-to-cap, the stop IS the checkpoint',
      'revise the goal or the close — a spec edit, whose new hash needs re-approval',
      'abandon the run',
    ],
    detail: tries.map((t) => `try ${t.n} (${t.mode}${t.bridge ? ` "${t.bridge}"` : ''}): ${t.runOutcome}`
      + `${t.failingStage ? ` at stage "${t.failingStage}"` : ''}`
      + ` — ${t.spentUsd === null ? 'spend UNKNOWN' : `${t.spendComplete ? '' : '≥'}$${t.spentUsd.toFixed(4)}`} of $${t.capUsd},`
      + ` ${typeof t.wallMs === 'number' && Number.isFinite(t.wallMs) ? `${(t.wallMs / 60000).toFixed(1)}min of ${(t.wallCapMs / 60000).toFixed(1)}min` : 'wall UNKNOWN'},`
      + ` close ${t.closeReached ? 'reached' : 'NEVER REACHED'}`).join('\n'),
  });
}
