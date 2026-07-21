// The N2 runner — the shell's top layer. It owns everything the emergent parts
// must never touch: the approval gate (human-signs-always), the primitive
// smoke, the ONE budget ledger (cap-not-estimate; unpriced is never free, F6),
// step sequencing, and the decision-ready stops. It composes the pieces below
// it (drafting → validateConfig → per-step interpret loops) and interprets
// nothing itself. Design record: docs/plans/2026-07-12-n2-headless-loop-design.md.

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LiteCtx, COMPRESS_LEVELS, KINDS } from 'litectx';
import { redact } from 'bareguard';
import { validateJob, jobSpecHash, checkApproval } from './job.js';
import { validateConfig, LOOP_SHAPES, SLOTS, VERBS, globToPrefix, SECRET_PATTERNS, REMEMBER_KINDS } from './validate.js';
import { interpret } from './interpret.js';
import { runClose, CLOSE_FAULTS } from './ralph.js';
import { extractArtifact, priceOf } from './text.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** @typedef {{code: string, path: string, detail?: string}} Red */

/**
 * The shell's own drafting allowance, carved out of the job budget (F9).
 * Drafting is a paid shell call that happens BEFORE the config it produces is
 * validated — so a ceiling advertised as the whole job budget is invalidated by
 * the very call that answers it, and a rational drafter (one that claims the
 * ceiling it is given) deadlocks every run. The shell therefore reserves this
 * slice for itself and advertises `budget − reserve` as the ceiling the config
 * may claim. It is a CAP, not an estimate: overspend it and the run stops on
 * the budget story it is, never on a config-red blaming the drafter.
 */
const DRAFT_RESERVE_FRAC = 0.05;
/** truncate (never round up) — an advertised ceiling must be one the shell can honour */
const floor4 = (/** @type {number} */ n) => Math.floor(n * 10_000) / 10_000;

// The drafting prompt: a schema DESCRIPTION built from the live validator
// menus — never a copyable example config (the drafter must author, not echo;
// the N2 drafting probe proved a frontier model greens on this, F6). The
// DRAFT-CONFIG sentinel is fixed shell vocabulary, not content.
// REMEMBER_KINDS comes from the validator: the prompt advertises the SAME menu
// the validator enforces — one source, no drift.
/** @param {any} job @param {Red[]|null} reds @param {number} ceiling the budget the config may actually claim (F9) */
function draftPrompt(job, reds, ceiling) {
  const doc = `DRAFT-CONFIG
You are drafting a workflow config (schema "v1") for the job spec below. The config is
pure declarative JSON validated by a strict schema; ANY unknown field, wrong enum value,
or out-of-bounds number is rejected. Output ONLY the JSON object, no fences, no commentary.

Required top-level fields (no others exist):
- "schema": must be exactly "v1"
- "loop": { "shape": one of ${JSON.stringify([...LOOP_SHAPES])}, "maxIterations": optional integer 1..8 }
- "memory": { "store": must be "litectx",
    "recall": optional { "k": integer 1..20, "kinds": optional non-empty subset of ${JSON.stringify([...KINDS])} },
    "compressLevel": optional, one of ${JSON.stringify([...COMPRESS_LEVELS])} }
- "gate": { "budgetUsd": number, 0 < n <= the ceiling stated below, "writeScope": array of path-prefix globs like "src/**" }
- "escalation": { "mode": must be "decision-ready" }
- "hooks": optional; keys from ${JSON.stringify([...SLOTS])}, each an array of ops.
  Each op is { "op": one of ${JSON.stringify([...VERBS])}, ...params }. STRICT slot legality:
  "recall" (optional "k", "kinds") and "compress" (optional "level") ONLY in "before-attempt";
  "stash" (no params) ONLY in "after-red"; "remember" (optional "kind", one of
  ${JSON.stringify(REMEMBER_KINDS)}) ONLY in "on-green".

Hard constraints from the job spec (violations are rejected):
- Every writeScope entry must fit INSIDE the job's writeScope (${JSON.stringify(job.writeScope)}).
  No "..", no absolute paths, no mid-path wildcards.
- gate.budgetUsd must be <= ${ceiling}. (This is ONE STEP's share of the job's
  $${job.budgetUsd} budget, minus the shell's own drafting allowance: this config is drafted
  once and reused for every step, so the number must still fit after earlier steps have
  spent. Claiming exactly ${ceiling} is legal and validates.)
- The config CANNOT contain close commands, provider choice, retry caps, or minting claims.

Job spec:
${JSON.stringify(job, null, 2)}`;
  return reds
    ? `${doc}\n\nYour previous draft was REJECTED with these reds (code:path):\n${JSON.stringify(reds)}\nFix every red. Output ONLY the corrected JSON object.`
    : doc;
}

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

/** @typedef {(argv: string[], opts?: {cwd?: string}) => {status: number|null, stdout: string, stderr: string}} ExecCmd */

/** default process runner for the hitl PR mechanics — real spawnSync, no shell
 * @type {ExecCmd} */
const defaultExec = (argv, { cwd } = {}) => {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: 60_000 });
  if (r.error) return { status: null, stdout: '', stderr: String(r.error) };
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

/**
 * The hitl middle's work (2b): branch → stage the job fence ONLY → commit →
 * push → draft PR. Deterministic runner code, never model tools (the model
 * never sees a git or gh surface — design addendum 2026-07-12b). Staging is
 * fence-scoped so spines, audit logs, and anything else living in the workdir
 * never enter the PR. Any failure is an honest red carrying the failed argv;
 * the caller still escalates — a broken PR path must never swallow the
 * escalation (the pain channel, law #7).
 * The checkout is handed back exactly as it was found: the starting branch is
 * read BEFORE anything moves and restored on EVERY path, success or failure
 * (found by the real job #1 run, 2026-07-13 — the workdir was left sitting on
 * the bareloop branch, so the next cadenced run would branch off yesterday's
 * unmerged branch and judge its close against that state). A restore that
 * itself fails is loud (`strandedOn`), never silent.
 *
 * @param {{workdir: string, branch: string, title: string, body: string, addPaths: string[], exec: ExecCmd}} o
 * @returns {Promise<{url: string|null, red: {argv: string, detail: string}|null, strandedOn: string|null}>}
 */
async function openDraftPr({ workdir, branch, title, body, addPaths, exec }) {
  // Subprocess output is scrubbed AT CAPTURE with the ONE shape inventory —
  // the same doctrine as the close path (interpret wires SECRET_PATTERNS into
  // ralph): git/gh error text can echo a credentialed remote URL, and the
  // detail lands on the append-only spine (pr-red + the escalation's pr.error).
  const scrub = (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS });
  const head = exec(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workdir });
  const startBranch = head.status === 0 ? head.stdout.trim() : '';
  /** put the checkout back where it started; report the branch it is stranded on if that fails */
  const restore = () => {
    if (!startBranch) return null; // never knew where we started — nothing honest to restore to
    const r = exec(['git', 'checkout', startBranch], { cwd: workdir });
    return r.status === 0 ? null : branch;
  };
  /** @param {{url?: string|null, red?: {argv: string, detail: string}|null}} o */
  const done = ({ url = null, red = null }) => ({ url, red, strandedOn: restore() });

  const steps = [
    ['git', 'checkout', '-b', branch],
    ['git', 'add', '--', ...addPaths],
    ['git', 'commit', '-m', title],
    ['git', 'push', '-u', 'origin', branch],
    ['gh', 'pr', 'create', '--draft', '--title', title, '--body', body],
  ];
  for (const argv of steps) {
    const r = exec(argv, { cwd: workdir });
    if (r.status !== 0) {
      return done({ red: { argv: argv.join(' '), detail: `${argv.slice(0, 2).join(' ')} failed: ${scrub((r.stderr || r.stdout || `exit ${r.status}`)).trim().slice(0, 500)}` } });
    }
    if (argv[0] === 'gh') {
      const url = (r.stdout.match(/https?:\/\/\S+/) ?? [null])[0];
      // a "successful" gh with no link is not a PR the human can act on
      return url ? done({ url }) : done({ red: { argv: argv.join(' '), detail: 'no PR URL in gh output' } });
    }
  }
  return done({ red: { argv: 'gh pr create', detail: 'PR step never ran' } }); // unreachable while gh is last; belt for edits
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
 * @param {string} [opts.target] the step artifact path (text-mode steps; unused by tool-mode steps)
 * @param {any} opts.provider shell-owned LLM binding (never the config's)
 * @param {(type: string, data?: object) => object} opts.emit spine emitter
 * @param {number} [opts.capRuns] shell-owned per-step iteration cap
 * @param {number} [opts.shellCapUsd] the shell's hard USD ceiling
 * @param {number} [opts.closeTimeoutMs] close wall-clock cap (shell territory)
 * @param {ExecCmd} [opts.execCmd] process runner for the hitl PR mechanics
 * @param {boolean} [opts.layerRoot=false] Layer R (within-run ratchet) — shell
 *        territory, threaded to every predicate step's interpreter. Defaults OFF
 *        (decided 2026-07-21): fixation is extinct on every current job (F41), so
 *        ON has never won its own A/B — the acceptance read defers to Layer 2 (or
 *        a manufactured-fixation probe). `true` is the ON/experimental arm; the
 *        default is the OFF arm. (Shell-owned seam, same doctrine as the provider
 *        binding.)
 * @returns {Promise<string>} outcome: 'green' | 'escalated' | 'unapproved-spec' |
 *   'job-red' | 'smoke-red' | 'config-red' | 'pricing-red' | 'provider-red' |
 *   'cap-halt' | 'close-unsupported' | `step-red:<id>`
 */
export async function runJob(rawSpec, { approvals, workdir, target, provider, emit, capRuns = 3, shellCapUsd = 2, closeTimeoutMs, execCmd = defaultExec, layerRoot = false }) {
  // 0. the ledger's counters, declared FIRST so that every job-end — including
  // the pre-token reds below — can state a real figure. An omitted `spentUsd` is
  // not a zero: a consumer reads `undefined` and either crashes or launders it
  // into $0 (F12's class, at the terminal record instead of mid-attempt).
  let spentUsd = 0;
  let unpriced = false;
  // The money on the terminal record, and whether the money is EXACT. `spentUsd`
  // is the accumulated sum of PRICED rounds ONLY — never an estimate derived
  // from tokens or averages (cap-not-estimate). When any round came back
  // unpriced (F6) that sum is a FLOOR, not the total, and `spendComplete: false`
  // says so machine-readably instead of dressing a floor up as exact. Emitted on
  // EVERY job-end (true when everything was priced) so no consumer ever has to
  // branch on field presence.
  const spend = () => ({ spentUsd, spendComplete: !unpriced });
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
  // Reds-before-tokens: a text-mode predicate step writes ONE artifact — with
  // no target it would burn a draft + a worker call and then crash inside the
  // middle as a misfiled interpreter-red. The spec is fine; the CALL is not.
  if ((typeof target !== 'string' || !target)
      && job.steps.some((/** @type {any} */ s) => s.close.type === 'predicate' && (s.mode ?? 'text') === 'text')) {
    emit('job-red', { code: 'missing-required', path: 'opts.target', detail: 'text-mode steps write ONE artifact — pass opts.target (reds-before-tokens)' });
    emit('job-end', { outcome: 'job-red', ...spend() });
    return 'job-red';
  }
  emit('job-start', { job: job.job, specHash: jobSpecHash(job), budgetUsd: job.budgetUsd, steps: job.steps.map((/** @type {any} */ s) => s.id) });

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
    return emit(type, data);
  };
  const pricingRed = () => {
    emit('escalation', { category: 'pricing-red', decisionReady: true, decision: 'A provider result carried no priced cost — the hard cap cannot govern spend it cannot see (unpriced is never free, F6).', options: ['bind a priced provider/model', 'abandon the run'], spentUsd });
    emit('job-end', { outcome: 'pricing-red', ...spend() });
    return 'pricing-red';
  };

  // 4. sealed drafting: one shot + one redraft, reds fed back, PRICED path
  // (through Loop, the same accounting the worker uses — never around it, F6)
  const drafter = new Loop({ provider, system: 'You draft workflow configs as pure JSON. Output only the JSON object.' });
  /** @type {string|null} a transport throw from the drafting call — spend UNKNOWN, terminal */
  let transportRed = null;
  /** @type {string|null} a drafting round the API TRUNCATED (BA-6, bare-agent 0.27.0) — provider-red like
   * a throw, but the round WAS metered so spend is known; must never launder into a config-red (F25). */
  let draftTruncated = null;
  /** @param {Red[]|null} reds */
  const draft = async (reds) => {
    let r;
    try {
      r = await drafter.run([{ role: 'user', content: draftPrompt(job, reds, ceilingNow()) }]);
    } catch (e) {
      // Loop defaults throwOnError: true — a misconfigured binding or a bare
      // transient 500 REJECTS here. The spend is UNKNOWN (F6), and the spine
      // must still terminate: never an unhandled rejection out of the runner.
      transportRed = String(/** @type {Error} */ (e)?.message ?? e);
      emit('draft-result', { costUsd: null, redraft: reds !== null, error: transportRed });
      return null;
    }
    const { costUsd, unpricedRounds } = priceOf(r); // the ONE honest-null cost read (F6)
    account(costUsd);
    if (unpricedRounds > 0) unpriced = true;
    emit('draft-result', { costUsd, redraft: reds !== null, error: r.error ?? null });
    // BA-6: the API cut the drafting round off mid-JSON. That is provider-red (the API's
    // fault, not the drafter's), so it must NOT be laundered into a config-red blaming the
    // drafter (F25's class) and must NOT consume the redraft — retrying a truncation blindly
    // just burns budget; the human decides. Metered above, so unlike transportRed spend is known.
    if (typeof r.error === 'string' && r.error.startsWith('truncated:')) { draftTruncated = r.error; return null; }
    return r.error ? null : (extractArtifact(r.text).code ?? '');
  };
  const providerRed = () => {
    emit('escalation', { category: 'provider-red', decisionReady: true, decision: 'The provider path threw before a result existed — spend for the failed call is unknown (F6), and no drafting verdict exists.', options: ['fix the provider binding', 'retry the run', 'abandon the run'], detail: transportRed, spentUsd });
    // A transport THROW never returned a usage figure, so the floor is NOT the total
    // (F6): spendComplete must be false — spend()'s `!unpriced` only knows about priced
    // rounds that came back unpriced, not a call that never returned at all. Leaving it
    // true would have the job-end contradict the escalation's own "spend … is unknown".
    emit('job-end', { outcome: 'provider-red', ...spend(), spendComplete: false });
    return 'provider-red';
  };
  const capNow = () => Math.min(shellCapUsd, job.budgetUsd - spentUsd);
  // The ceiling the CONFIG may claim (F9): the job budget minus the shell's own
  // drafting allowance, and never above what is actually left. Advertised in the
  // prompt and enforced by the validator — ONE number, so a drafter that claims
  // the ceiling it was given always validates. (Before: the prompt advertised the
  // whole job budget while the validator enforced budget − drafting-spend, a bound
  // the drafter was never told and could not satisfy.)
  // ...and a PER-STEP share of it, not the whole pot. The config is drafted ONCE
  // and re-validated at every step against what is LEFT, so a ceiling sized to the
  // whole budget is stale the moment step 1 spends: step 2 then reds `bounds` on an
  // unchanged config with plenty of money still in the pot (review 2026-07-18).
  // Dividing by the steps that will actually run a worker makes the number the
  // drafter is handed one that still fits after its predecessors have spent —
  // sum(shares) = budget − reserve, so every step can claim its share. This is a
  // DRAFTING change, not an enforcement one: cap-not-estimate is untouched, and a
  // step that needs more than its share still cap-halts cleanly with a resume
  // point. Single-step jobs (every shipped job today) are arithmetically unchanged.
  const loopSteps = Math.max(1, job.steps.filter((s) => s.close.type === 'predicate').length);
  const workerCeiling = floor4(job.budgetUsd * (1 - DRAFT_RESERVE_FRAC) / loopSteps);
  const ceilingNow = () => Math.min(workerCeiling, capNow());
  const cOpts = () => ({ shellCapUsd: ceilingNow(), jobWriteScope: job.writeScope });
  // Drafting is DEFERRED to the first step that needs a worker (resume model,
  // design addendum 2026-07-13): a step whose close already greens skips for
  // zero tokens, so a clean rerun may need no config at all — drafting one no
  // interpret will ever read is spend for nothing (F6's spirit). Decision #3
  // holds: when a config IS needed, it is drafted fresh THIS run, never inherited.
  /** @type {any} the validated config, drafted on first need */
  let config = null;
  /** @returns {Promise<string|null>} a terminal job outcome, or null with `config` set */
  const ensureConfig = async () => {
    if (config) return null;
    let text = await draft(null);
    let cv = validateConfig(text ?? '', cOpts());
    emit('config-validate', { ok: cv.ok, reds: cv.reds, phase: 'draft-1' });
    // the redraft only fires when it can still help: not over a transport red,
    // not over unpriced spend, and never over an already-blown budget (a paid
    // call against a negative cap can only red again — budget story, not drafter)
    if (!cv.ok && !unpriced && !transportRed && !draftTruncated && capNow() > 0) {
      text = await draft(cv.reds);
      cv = validateConfig(text ?? '', cOpts());
      emit('config-validate', { ok: cv.ok, reds: cv.reds, phase: 'draft-2' });
    }
    if (transportRed) return providerRed();
    if (draftTruncated) {
      // A truncated draft is provider-red, NOT config-red — the API cut it off; the drafter is
      // not on trial. Mirrors the worker path (interpret.js) and the human's options: the round
      // was metered, so this is a fault with a known cost, not a spend-unknown transport throw.
      emit('escalation', { category: 'provider-red', decisionReady: true, decision: 'The drafting round was truncated at the output cap (BA-6) — the API cut the config off mid-generation, so no valid config exists. Not the drafter\'s competence (never a config-red), and not silently retried.', options: ['raise the drafting cap and rerun', 'retry the run', 'abandon the run'], detail: draftTruncated, spentUsd });
      emit('job-end', { outcome: 'provider-red', ...spend() });
      return 'provider-red';
    }
    if (unpriced) return pricingRed();
    if (!cv.ok) {
      if (capNow() <= 0) {
        // drafting consumed the whole job budget before a valid config existed —
        // the honest stop is a cap story, never a config-red blaming the drafter
        emit('cap-halt', { category: 'cap-halt', meaning: 'not under cap — not "can\'t"', spentUsd, budgetUsd: job.budgetUsd });
        emit('escalation', { category: 'cap-halt', decisionReady: true, decision: `Drafting spend ($${spentUsd.toFixed(4)}) consumed the job budget ($${job.budgetUsd}) before a valid config existed.`, options: ['raise the job budget and rerun', 'abandon the run'], spentUsd });
        emit('job-end', { outcome: 'cap-halt', ...spend() });
        return 'cap-halt';
      }
      for (const r of cv.reds) emit('config-red', r);
      emit('job-end', { outcome: 'config-red', ...spend() });
      return 'config-red';
    }
    config = cv.config;
    return null;
  };

  // 5. sequential per-step loops under the one ledger; a step-red stops the
  // job and the stop is a result (ladder discipline applied to steps)
  for (const step of job.steps) {
    if (step.close.type === 'hitl') {
      // Nothing changed in the fence → nothing for a human to review (found by
      // the real job #1 run, 2026-07-13): a cadenced run whose steps all skip
      // already-green would otherwise branch/add/commit, and `git commit`
      // correctly fails ("nothing added to commit") — a broken-PR escalation
      // every single day. A hitl close is a human decision point; with no
      // changes there IS no decision. Only an AFFIRMATIVE clean answer skips:
      // a failed check (not a repo, broken git) falls through to the PR path
      // and reds honestly there — an unknown fence state is never a green.
      const fence = job.writeScope.map((/** @type {string} */ g) => globToPrefix(g));
      const st = execCmd(['git', 'status', '--porcelain', '--', ...fence], { cwd: workdir });
      if (st.status === 0 && st.stdout.trim() === '') {
        emit('pr-skipped', { step: step.id, reason: 'no changes in the job fence — nothing for a human to review' });
        emit('step-end', { step: step.id, outcome: 'already-green', spentUsd });
        continue;
      }
      // the hitl middle's work (2b): deterministic branch/commit/draft-PR —
      // model tools never touch git; a PR failure is red + escalation, never a
      // swallowed escalation
      const branch = `bareloop/${job.job}-${Date.now().toString(36)}`;
      const title = `bareloop draft: ${job.job}`;
      const pr = await openDraftPr({
        workdir, branch, title,
        body: `${job.description}\n\nstep: ${step.id}\nprompt: ${step.close.prompt}\nspent: $${spentUsd.toFixed(4)} of $${job.budgetUsd}\n\nDraft by bareloop — merge stays human, forever.`,
        addPaths: job.writeScope.map((/** @type {string} */ g) => globToPrefix(g)),
        exec: execCmd,
      });
      if (pr.red) emit('pr-red', { step: step.id, ...pr.red });
      else emit('pr-opened', { step: step.id, branch, url: pr.url });
      // a checkout left on a bareloop branch poisons the NEXT cadenced run's
      // baseline — loud, and never allowed to un-open a real PR
      if (pr.strandedOn) emit('workdir-red', { step: step.id, branch: pr.strandedOn, detail: 'the run could not return the checkout to its starting branch — the next run would build on this one' });
      emit('escalation', { category: 'hitl-close', decisionReady: true, step: step.id, prompt: step.close.prompt, spentUsd, decision: step.close.prompt, options: ['approve', 'reject'], pr: { url: pr.url, branch, error: pr.red?.detail ?? null } });
      emit('job-end', { outcome: 'escalated', step: step.id, ...spend() });
      return 'escalated'; // by design: the human acts outside the run, forever
    }
    if (step.close.type !== 'predicate') {
      // honest refusal: gold/rubric EXECUTION lands with the verdict classes
      // (N4); a fake verdict here would poison every contrast downstream
      emit('escalation', { category: 'close-unsupported', decisionReady: true, step: step.id, decision: `Step "${step.id}" has a ${step.close.type} close — N2 executes predicate and hitl closes only.`, options: ['restate the close as a predicate', 'wait for the verdict-classes rung'] });
      emit('job-end', { outcome: 'close-unsupported', step: step.id, ...spend() });
      return 'close-unsupported';
    }
    emit('step-start', { step: step.id, remainingUsd: job.budgetUsd - spentUsd, spentUsd, mode: step.mode ?? 'text' });
    // Close-first skip (resume model): the workdir + the close ARE the
    // checkpoint. Run the step's own arbiter BEFORE any tokens — already-green
    // means the step's work is done, and the step skips as a DISTINCT record
    // (already-green, never plain green: nothing was done, so it mints no
    // learning credit and runs no on-green retention). Same instrument as
    // ralph's verdict (runClose), same at-capture scrub as every close output.
    // trim before splitting: validateJob reds whitespace-padded cmds, but an
    // empty argv[0] would THROW at spawn — belt for any path around the validator
    const closeArgv = step.close.cmd.trim().split(/\s+/);
    const closeOpts = { timeoutMs: closeTimeoutMs, cwd: workdir, expect: step.close.expect, judged: step.close.judged, gapKeep: step.close.gapKeep };
    const pre = runClose(closeArgv, (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS }), closeOpts);
    emit('close-precheck', { step: step.id, ...pre });
    if (pre.verdict === 'satisfied') {
      emit('step-end', { step: step.id, outcome: 'already-green', spentUsd });
      continue;
    }
    // reds-before-tokens: the forbidden zone is checked BEFORE the draft and the
    // worker call. A close that cannot run, never finished, died by signal, or
    // judged nothing rendered NO VERDICT — escalate by its own name (the SAME
    // map ralph uses; two maps would be two instruments), never spend on it.
    const fault = Object.hasOwn(CLOSE_FAULTS, pre.verdict) ? CLOSE_FAULTS[pre.verdict] : undefined;
    if (fault) {
      emit('escalation', { category: fault.category, decisionReady: true, step: step.id, decision: fault.decision, options: fault.options, detail: pre.detail, spentUsd });
      emit('job-end', { outcome: 'step-red', step: step.id, cause: fault.category, ...spend() });
      return `step-red:${step.id}`;
    }
    // The precheck's gap goes to the worker as what it IS: the close's output on
    // the tree as it stands (F13). It is never framed as an attempt — no attempt
    // has happened — so the contrast evidence stays clean. Withholding it (the
    // original call) left the worker unable to see the failure it was hired to
    // fix: `run` is a locked verb, so it cannot execute the close itself.
    const halted = await ensureConfig();
    if (halted) return halted;
    let outcome;
    try {
      outcome = await interpret(config, {
        task: `${job.description} — step: ${step.id}`,
        target, close: closeArgv, workdir, capRuns,
        emit: meter, provider, ...cOpts(), closeTimeoutMs, closeState: pre.gap,
        // the SPEC's grant, threaded verbatim (2b decision #2) — the drafted
        // config cannot express mode or tools, so there is nothing to merge.
        // expect/judged/gapKeep ride the same rail for the same reason: they are
        // arbiter territory (PRD v1.11; F28 for gapKeep).
        mode: step.mode ?? 'text', tools: step.tools,
        closeExpect: step.close.expect, closeJudged: step.close.judged, closeGapKeep: step.close.gapKeep,
        layerRoot,
      });
    } catch (e) {
      // ralph belts throws INSIDE the loop; this belts the interpreter's own
      // setup (gate.init, store ctor) — the spine must terminate, never dangle
      emit('escalation', { category: 'interpreter-red', decisionReady: true, step: step.id, decision: 'The interpreter broke outside the loop — no harness verdict is trustworthy until it is fixed.', options: ['fix the interpreter/run directory', 'abandon the run'], detail: String(/** @type {Error} */ (e)?.message ?? e), spentUsd });
      emit('job-end', { outcome: 'step-red', step: step.id, cause: 'interpreter-red', ...spend() });
      return `step-red:${step.id}`;
    }
    emit('step-end', { step: step.id, outcome, spentUsd });
    if (unpriced) return pricingRed();
    if (outcome !== 'green') {
      emit('job-end', { outcome: 'step-red', step: step.id, cause: outcome, ...spend() });
      return `step-red:${step.id}`;
    }
  }
  emit('job-end', { outcome: 'green', ...spend() });
  return 'green';
}
