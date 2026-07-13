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
import { runClose } from './ralph.js';
import { extractArtifact, priceOf } from './text.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** @typedef {{code: string, path: string, detail?: string}} Red */

// The drafting prompt: a schema DESCRIPTION built from the live validator
// menus — never a copyable example config (the drafter must author, not echo;
// the N2 drafting probe proved a frontier model greens on this, F6). The
// DRAFT-CONFIG sentinel is fixed shell vocabulary, not content.
// REMEMBER_KINDS comes from the validator: the prompt advertises the SAME menu
// the validator enforces — one source, no drift.
/** @param {any} job @param {Red[]|null} reds */
function draftPrompt(job, reds) {
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
- "gate": { "budgetUsd": number, 0 < n <= the job budget, "writeScope": array of path-prefix globs like "src/**" }
- "escalation": { "mode": must be "decision-ready" }
- "hooks": optional; keys from ${JSON.stringify([...SLOTS])}, each an array of ops.
  Each op is { "op": one of ${JSON.stringify([...VERBS])}, ...params }. STRICT slot legality:
  "recall" (optional "k", "kinds") and "compress" (optional "level") ONLY in "before-attempt";
  "stash" (no params) ONLY in "after-red"; "remember" (optional "kind", one of
  ${JSON.stringify(REMEMBER_KINDS)}) ONLY in "on-green".

Hard constraints from the job spec (violations are rejected):
- Every writeScope entry must fit INSIDE the job's writeScope (${JSON.stringify(job.writeScope)}).
  No "..", no absolute paths, no mid-path wildcards.
- gate.budgetUsd must be <= ${job.budgetUsd}.
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
 * @param {{workdir: string, branch: string, title: string, body: string, addPaths: string[], exec: ExecCmd}} o
 * @returns {Promise<{url: string|null, red: {argv: string, detail: string}|null}>}
 */
async function openDraftPr({ workdir, branch, title, body, addPaths, exec }) {
  const steps = [
    ['git', 'checkout', '-b', branch],
    ['git', 'add', '--', ...addPaths],
    ['git', 'commit', '-m', title],
    ['git', 'push', '-u', 'origin', branch],
    ['gh', 'pr', 'create', '--draft', '--title', title, '--body', body],
  ];
  // Subprocess output is scrubbed AT CAPTURE with the ONE shape inventory —
  // the same doctrine as the close path (interpret wires SECRET_PATTERNS into
  // ralph): git/gh error text can echo a credentialed remote URL, and the
  // detail lands on the append-only spine (pr-red + the escalation's pr.error).
  const scrub = (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS });
  for (const argv of steps) {
    const r = exec(argv, { cwd: workdir });
    if (r.status !== 0) {
      return { url: null, red: { argv: argv.join(' '), detail: `${argv.slice(0, 2).join(' ')} failed: ${scrub((r.stderr || r.stdout || `exit ${r.status}`)).trim().slice(0, 500)}` } };
    }
    if (argv[0] === 'gh') {
      const url = (r.stdout.match(/https?:\/\/\S+/) ?? [null])[0];
      // a "successful" gh with no link is not a PR the human can act on
      return url ? { url, red: null } : { url: null, red: { argv: argv.join(' '), detail: 'no PR URL in gh output' } };
    }
  }
  return { url: null, red: { argv: 'gh pr create', detail: 'PR step never ran' } }; // unreachable while gh is last; belt for edits
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
 *        (shell-owned seam, same doctrine as the provider binding)
 * @returns {Promise<string>} outcome: 'green' | 'escalated' | 'unapproved-spec' |
 *   'job-red' | 'smoke-red' | 'config-red' | 'pricing-red' | 'provider-red' |
 *   'cap-halt' | 'close-unsupported' | `step-red:<id>`
 */
export async function runJob(rawSpec, { approvals, workdir, target, provider, emit, capRuns = 3, shellCapUsd = 2, closeTimeoutMs, execCmd = defaultExec }) {
  // 1. human-signs-always — before ANY provider call (N1 decision #1)
  if (!checkApproval(rawSpec, approvals)) {
    emit('job-end', { outcome: 'unapproved-spec', detail: 'no approval record matches this exact spec version' });
    return 'unapproved-spec';
  }
  const jv = validateJob(rawSpec, { shellCapUsd });
  if (!jv.ok) {
    for (const r of jv.reds) emit('job-red', r);
    emit('job-end', { outcome: 'job-red' });
    return 'job-red';
  }
  const job = /** @type {any} */ (jv.job);
  // Reds-before-tokens: a text-mode predicate step writes ONE artifact — with
  // no target it would burn a draft + a worker call and then crash inside the
  // middle as a misfiled interpreter-red. The spec is fine; the CALL is not.
  if ((typeof target !== 'string' || !target)
      && job.steps.some((/** @type {any} */ s) => s.close.type === 'predicate' && (s.mode ?? 'text') === 'text')) {
    emit('job-red', { code: 'missing-required', path: 'opts.target', detail: 'text-mode steps write ONE artifact — pass opts.target (reds-before-tokens)' });
    emit('job-end', { outcome: 'job-red' });
    return 'job-red';
  }
  emit('job-start', { job: job.job, specHash: jobSpecHash(job), budgetUsd: job.budgetUsd, steps: job.steps.map((/** @type {any} */ s) => s.id) });

  // 2. known-answer smoke before tokens (A3: silent degradation throws nothing)
  const smoke = await primitiveSmoke(workdir);
  emit('primitive-smoke', smoke);
  if (!smoke.ok) {
    emit('escalation', { category: 'smoke-red', decisionReady: true, decision: `The ${smoke.primitive} primitive failed its known-answer check — no run verdict is trustworthy on a degraded primitive.`, options: ['fix the primitive/store', 'abandon the run'], detail: smoke.detail });
    emit('job-end', { outcome: 'smoke-red' });
    return 'smoke-red';
  }

  // 3. the ONE ledger. Unpriced is never free (F6): a null cost can't be
  // summed, so it flags a stop instead of accumulating $0.
  let spentUsd = 0;
  let unpriced = false;
  /** @param {number|null|undefined} c */
  const account = (c) => { if (typeof c === 'number' && Number.isFinite(c)) spentUsd += c; else unpriced = true; };
  /** @type {(type: string, data?: object) => object} */
  const meter = (type, data) => {
    // every priced emission is accounted: worker-result AND worker-plan — the
    // plan shape makes a SEPARATE loop.run whose metrics never fold into the
    // implement call's, so skipping it under-counts real spend (review 2026-07-13)
    if (type === 'worker-result' || type === 'worker-plan') {
      account(/** @type {any} */ (data)?.costUsd);
      // a PARTIALLY unpriced run reports a finite costUsd that under-counts —
      // the flag is the only honest signal (F6)
      if ((/** @type {any} */ (data)?.unpricedRounds ?? 0) > 0) unpriced = true;
    }
    return emit(type, data);
  };
  const pricingRed = () => {
    emit('escalation', { category: 'pricing-red', decisionReady: true, decision: 'A provider result carried no priced cost — the hard cap cannot govern spend it cannot see (unpriced is never free, F6).', options: ['bind a priced provider/model', 'abandon the run'], spentUsd });
    emit('job-end', { outcome: 'pricing-red' });
    return 'pricing-red';
  };

  // 4. sealed drafting: one shot + one redraft, reds fed back, PRICED path
  // (through Loop, the same accounting the worker uses — never around it, F6)
  const drafter = new Loop({ provider, system: 'You draft workflow configs as pure JSON. Output only the JSON object.' });
  /** @type {string|null} a transport throw from the drafting call — spend UNKNOWN, terminal */
  let transportRed = null;
  /** @param {Red[]|null} reds */
  const draft = async (reds) => {
    let r;
    try {
      r = await drafter.run([{ role: 'user', content: draftPrompt(job, reds) }]);
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
    return r.error ? null : (extractArtifact(r.text).code ?? '');
  };
  const providerRed = () => {
    emit('escalation', { category: 'provider-red', decisionReady: true, decision: 'The provider path threw before a result existed — spend for the failed call is unknown (F6), and no drafting verdict exists.', options: ['fix the provider binding', 'retry the run', 'abandon the run'], detail: transportRed, spentUsd });
    emit('job-end', { outcome: 'provider-red' });
    return 'provider-red';
  };
  const capNow = () => Math.min(shellCapUsd, job.budgetUsd - spentUsd);
  const cOpts = () => ({ shellCapUsd: capNow(), jobWriteScope: job.writeScope });
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
    if (!cv.ok && !unpriced && !transportRed && capNow() > 0) {
      text = await draft(cv.reds);
      cv = validateConfig(text ?? '', cOpts());
      emit('config-validate', { ok: cv.ok, reds: cv.reds, phase: 'draft-2' });
    }
    if (transportRed) return providerRed();
    if (unpriced) return pricingRed();
    if (!cv.ok) {
      if (capNow() <= 0) {
        // drafting consumed the whole job budget before a valid config existed —
        // the honest stop is a cap story, never a config-red blaming the drafter
        emit('cap-halt', { category: 'cap-halt', meaning: 'not under cap — not "can\'t"', spentUsd, budgetUsd: job.budgetUsd });
        emit('escalation', { category: 'cap-halt', decisionReady: true, decision: `Drafting spend ($${spentUsd.toFixed(4)}) consumed the job budget ($${job.budgetUsd}) before a valid config existed.`, options: ['raise the job budget and rerun', 'abandon the run'], spentUsd });
        emit('job-end', { outcome: 'cap-halt' });
        return 'cap-halt';
      }
      for (const r of cv.reds) emit('config-red', r);
      emit('job-end', { outcome: 'config-red' });
      return 'config-red';
    }
    config = cv.config;
    return null;
  };

  // 5. sequential per-step loops under the one ledger; a step-red stops the
  // job and the stop is a result (ladder discipline applied to steps)
  for (const step of job.steps) {
    if (step.close.type === 'hitl') {
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
      emit('escalation', { category: 'hitl-close', decisionReady: true, step: step.id, prompt: step.close.prompt, spentUsd, decision: step.close.prompt, options: ['approve', 'reject'], pr: { url: pr.url, branch, error: pr.red?.detail ?? null } });
      emit('job-end', { outcome: 'escalated', step: step.id, spentUsd });
      return 'escalated'; // by design: the human acts outside the run, forever
    }
    if (step.close.type !== 'predicate') {
      // honest refusal: gold/rubric EXECUTION lands with the verdict classes
      // (N4); a fake verdict here would poison every contrast downstream
      emit('escalation', { category: 'close-unsupported', decisionReady: true, step: step.id, decision: `Step "${step.id}" has a ${step.close.type} close — N2 executes predicate and hitl closes only.`, options: ['restate the close as a predicate', 'wait for the verdict-classes rung'] });
      emit('job-end', { outcome: 'close-unsupported', step: step.id });
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
    const pre = runClose(closeArgv, (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS }), { timeoutMs: closeTimeoutMs });
    emit('close-precheck', { step: step.id, ...pre });
    if (pre.verdict === 'satisfied') {
      emit('step-end', { step: step.id, outcome: 'already-green', spentUsd });
      continue;
    }
    if (pre.verdict === 'failed') {
      // reds-before-tokens: a close that cannot RUN is a broken arbiter — the
      // same honest stop ralph makes, moved before the draft and the worker call
      emit('escalation', { category: 'broken-close', decisionReady: true, step: step.id, decision: 'The close itself cannot run — no verdict is trustworthy until it is fixed.', options: ['fix the close command', 'abandon the run'], detail: pre.detail, spentUsd });
      emit('job-end', { outcome: 'step-red', step: step.id, cause: 'broken-close', spentUsd });
      return `step-red:${step.id}`;
    }
    // the precheck's gap stays on the spine only — feeding it to the worker as
    // a "previous attempt" would be a lie (no attempt exists) and would skew
    // the contrast evidence between fresh runs and resumes
    const halted = await ensureConfig();
    if (halted) return halted;
    let outcome;
    try {
      outcome = await interpret(config, {
        task: `${job.description} — step: ${step.id}`,
        target, close: closeArgv, workdir, capRuns,
        emit: meter, provider, ...cOpts(), closeTimeoutMs,
        // the SPEC's grant, threaded verbatim (2b decision #2) — the drafted
        // config cannot express mode or tools, so there is nothing to merge
        mode: step.mode ?? 'text', tools: step.tools,
      });
    } catch (e) {
      // ralph belts throws INSIDE the loop; this belts the interpreter's own
      // setup (gate.init, store ctor) — the spine must terminate, never dangle
      emit('escalation', { category: 'interpreter-red', decisionReady: true, step: step.id, decision: 'The interpreter broke outside the loop — no harness verdict is trustworthy until it is fixed.', options: ['fix the interpreter/run directory', 'abandon the run'], detail: String(/** @type {Error} */ (e)?.message ?? e), spentUsd });
      emit('job-end', { outcome: 'step-red', step: step.id, cause: 'interpreter-red', spentUsd });
      return `step-red:${step.id}`;
    }
    emit('step-end', { step: step.id, outcome, spentUsd });
    if (unpriced) return pricingRed();
    if (outcome !== 'green') {
      emit('job-end', { outcome: 'step-red', step: step.id, cause: outcome, spentUsd });
      return `step-red:${step.id}`;
    }
  }
  emit('job-end', { outcome: 'green', spentUsd });
  return 'green';
}
