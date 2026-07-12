// The N2 runner — the shell's top layer. It owns everything the emergent parts
// must never touch: the approval gate (human-signs-always), the primitive
// smoke, the ONE budget ledger (cap-not-estimate; unpriced is never free, F6),
// step sequencing, and the decision-ready stops. It composes the pieces below
// it (drafting → validateConfig → per-step interpret loops) and interprets
// nothing itself. Design record: docs/plans/2026-07-12-n2-headless-loop-design.md.

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { LiteCtx, COMPRESS_LEVELS, KINDS, WRITE_KINDS } from 'litectx';
import { validateJob, jobSpecHash, checkApproval } from './job.js';
import { validateConfig, LOOP_SHAPES, SLOTS, VERBS } from './validate.js';
import { interpret } from './interpret.js';
import { stripFences } from './text.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** @typedef {{code: string, path: string, detail?: string}} Red */

// The drafting prompt: a schema DESCRIPTION built from the live validator
// menus — never a copyable example config (the drafter must author, not echo;
// the N2 drafting probe proved a frontier model greens on this, F6). The
// DRAFT-CONFIG sentinel is fixed shell vocabulary, not content.
const REMEMBER_KINDS = WRITE_KINDS.filter((k) => k !== 'doc');
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

/**
 * Run an approved job end to end: approval gate → primitive smoke → sealed
 * config draft (one shot + one redraft) → sequential per-step interpret loops
 * under the one ledger → the hitl step becomes the decision-ready escalation.
 *
 * N2 bounds (honest, documented): steps write a single `target` artifact
 * (interpret's contract; the tool-driven multi-file middle is the next module);
 * `gold`/`rubric` closes refuse `close-unsupported` (execution lands with the
 * verdict classes, N4); the pricing-red halt lands at the step boundary — the
 * Gate still caps within a step, but an unpriced result cannot be summed, so
 * the run stops rather than counting it $0 (F6).
 *
 * @param {object|string} rawSpec the job spec (job-v1), text or parsed
 * @param {object} opts
 * @param {unknown} opts.approvals `{ specHash, signer, ts }` records (from OUTSIDE the spec)
 * @param {string} opts.workdir the run directory (the fence's root)
 * @param {string} opts.target the step artifact path (N2 single-target bound)
 * @param {any} opts.provider shell-owned LLM binding (never the config's)
 * @param {(type: string, data?: object) => object} opts.emit spine emitter
 * @param {number} [opts.capRuns] shell-owned per-step iteration cap
 * @param {number} [opts.shellCapUsd] the shell's hard USD ceiling
 * @param {number} [opts.closeTimeoutMs] close wall-clock cap (shell territory)
 * @returns {Promise<string>} outcome: 'green' | 'escalated' | 'unapproved-spec' |
 *   'job-red' | 'smoke-red' | 'config-red' | 'pricing-red' | 'close-unsupported' |
 *   `step-red:<id>`
 */
export async function runJob(rawSpec, { approvals, workdir, target, provider, emit, capRuns = 3, shellCapUsd = 2, closeTimeoutMs }) {
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
    if (type === 'worker-result') {
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
  /** @param {Red[]|null} reds */
  const draft = async (reds) => {
    const r = await drafter.run([{ role: 'user', content: draftPrompt(job, reds) }]);
    // metrics.costUsd is the honest null when nothing priced; `cost` sums priced
    // rounds only and would launder unpriced into $0 (F6)
    const costUsd = r.metrics ? r.metrics.costUsd : (r.cost ?? null);
    account(costUsd);
    if ((r.metrics?.unpricedRounds ?? 0) > 0) unpriced = true;
    emit('draft-result', { costUsd, redraft: reds !== null, error: r.error ?? null });
    return r.error ? null : stripFences(r.text);
  };
  const capNow = () => Math.min(shellCapUsd, job.budgetUsd - spentUsd);
  const cOpts = () => ({ shellCapUsd: capNow(), jobWriteScope: job.writeScope });
  let text = await draft(null);
  let cv = validateConfig(text ?? '', cOpts());
  emit('config-validate', { ok: cv.ok, reds: cv.reds, phase: 'draft-1' });
  if (!cv.ok && !unpriced) {
    text = await draft(cv.reds);
    cv = validateConfig(text ?? '', cOpts());
    emit('config-validate', { ok: cv.ok, reds: cv.reds, phase: 'draft-2' });
  }
  if (unpriced) return pricingRed();
  if (!cv.ok) {
    for (const r of cv.reds) emit('config-red', r);
    emit('job-end', { outcome: 'config-red' });
    return 'config-red';
  }

  // 5. sequential per-step loops under the one ledger; a step-red stops the
  // job and the stop is a result (ladder discipline applied to steps)
  for (const step of job.steps) {
    if (step.close.type === 'hitl') {
      emit('escalation', { category: 'hitl-close', decisionReady: true, step: step.id, prompt: step.close.prompt, spentUsd, decision: step.close.prompt, options: ['approve', 'reject'] });
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
    emit('step-start', { step: step.id, remainingUsd: job.budgetUsd - spentUsd, spentUsd });
    const outcome = await interpret(cv.config, {
      task: `${job.description} — step: ${step.id}`,
      target, close: step.close.cmd.split(/\s+/), workdir, capRuns,
      emit: meter, provider, ...cOpts(), closeTimeoutMs,
    });
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
