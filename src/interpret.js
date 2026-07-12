// The interpreter — the ONLY code that reads a workflow config (PRD §4's
// emergent middle, executed). It composes the suite, never invents: litectx is
// the store, bareguard is the leash, bareagent is the worker loop (design law
// #10). The provider arrives from the SHELL (never the config — it is
// arbiter-adjacent), and the close never runs here: the shell runs it and
// feeds the verdict back as `gap`.
//
// Two traps this encodes, both paid for in adaptlearn: `onLlmResult` is a Loop
// CONSTRUCTOR option — passed to run() it is silently ignored and the budget
// axis goes blind (F3); and a budget-exhausted gate deny must surface as
// cap-halt, its own category, never a generic error (design law #8).

import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Gate, redact } from 'bareguard';
import { LiteCtx, compress } from 'litectx';
import { validateConfig, diffPaths, globToPrefix } from './validate.js';
import { ralph } from './ralph.js';

/** @typedef {Error & {category?: string}} CategorizedError the failure map's carrier: ralph relays by `category` */

// consecutive close reds that count as a stall; one revision per run
export const STALL_REDS = 2;

const require = createRequire(import.meta.url);
const { Loop, wireGate, HaltError } = require('bare-agent');

import { stripFences } from './text.js';

/** @typedef {{body?: string|null, text?: string|null}} RecallHit litectx recall hit — body present only with `{body: true}` */

const PERSONA = 'You are a senior engineer. Reply with ONLY the complete contents of the requested JavaScript file — no markdown fences, no commentary. ESM.';

/**
 * Execute a workflow config against one task under the dumb shell.
 *
 * @param {object|string} configRaw schema v1 config (object or raw JSON text)
 * @param {object} opts
 * @param {string} opts.task implement instruction shown to the worker
 * @param {string} opts.target absolute path the artifact is written to
 * @param {string[]} opts.close argv whose exit code is truth (shell-owned)
 * @param {string} opts.workdir run directory (litectx root, gate audit, scope base)
 * @param {number} opts.capRuns shell iteration budget; the config may tighten via loop.maxIterations, never exceed
 * @param {(type: string, data?: object) => object} opts.emit spine emitter
 * @param {object} opts.provider a bareagent provider — SHELL-owned binding (adaptlearn F8: an unsealed binding is a gate bypass)
 * @param {number} [opts.shellCapUsd=2] the shell's USD cap; config budgetUsd is clamped by validation
 * @param {string[]} [opts.jobWriteScope] the job spec's outer write fence (operator law,
 *        job-v1) — enforced HERE, the one choke point where a config becomes a Gate:
 *        every workflow scope must fit inside it (scope-escape config-red otherwise),
 *        on entry validation and on every revision candidate alike
 * @param {(o: {config: object, gaps: string[], policy: any, onLlmResult: any}) => Promise<{candidate: object|null, parseError?: string|null, costUsd?: number}>} [opts.revisor]
 *        optional mid-run revision seam. Fires ONCE per run after STALL_REDS consecutive
 *        close reds. The interpreter — never the revisor — owns acceptance: the candidate
 *        must validate, and gate/escalation/loop.maxIterations must be unchanged
 *        (arbiter-touch / cap-touch revision-reds otherwise; the run continues on the old
 *        config). Revisor spend rides the run's own gate handlers — same budget axis as
 *        the worker.
 * @returns {Promise<'green'|'escalated'|'config-red'>}
 */
export async function interpret(configRaw, { task, target, close, workdir, capRuns, emit, provider, shellCapUsd = 2, jobWriteScope, revisor }) {
  const v = validateConfig(configRaw, { shellCapUsd, jobWriteScope });
  emit('config-validate', { ok: v.ok, reds: v.reds });
  if (!v.ok) {
    for (const r of v.reds) emit('config-red', r);
    emit('run-end', { outcome: 'config-red', iterations: 0 });
    return 'config-red';
  }
  let config = /** @type {any} */ (v.config); // single parse — validateConfig returns the parsed config on ok

  const lc = new LiteCtx({ root: workdir });
  // Enforcement belt (law #1, un-gameable gate): resolve every scope and prove
  // it stays under workdir BEFORE building the Gate. validateConfig already
  // rejects escaping scopes, so this is defense in depth — a future globToPrefix
  // regression (a spelling that normalizes to an absolute path) can never reach
  // a live Gate fence. The interpreter and the validator must never disagree (F9).
  const resolvedScopes = config.gate.writeScope.map((/** @type {string} */ g) => resolve(workdir, globToPrefix(g)));
  const escaped = resolvedScopes.filter((/** @type {string} */ abs) => abs !== workdir && !abs.startsWith(workdir + sep));
  if (escaped.length) {
    for (const abs of escaped) emit('config-red', { code: 'scope-escape', path: 'gate.writeScope', detail: `resolved scope ${abs} escapes the run directory` });
    emit('run-end', { outcome: 'config-red', iterations: 0 });
    return 'config-red';
  }
  const gate = new Gate({
    // bareguard fs.writeScope is prefix-containment, not glob (adaptlearn F4); globToPrefix
    // is the ONE transform shared with the validator's legality rule — mid-path wildcards
    // and workdir-escaping scopes were already rejected up front (adaptlearn F9, law #1).
    fs: { writeScope: resolvedScopes },
    budget: { maxCostUsd: config.gate.budgetUsd },
    limits: { maxTurns: 8 * (capRuns + 1) },
    audit: { path: join(workdir, 'gate-audit.jsonl') },
    humanChannel: async () => ({ decision: 'terminate' }), // no human mid-run: a tripped cap terminates → decision-ready escalation
  });
  await gate.init();
  const { policy, onLlmResult } = wireGate(gate);
  const loop = new Loop({ provider, system: PERSONA, policy, onLlmResult });

  /** @param {string} slot */
  const slotOps = (slot) => config.hooks?.[slot] ?? [];
  /** @param {{kinds?: string[]}} op */
  const recallKinds = (op) => op.kinds ?? config.memory.recall?.kinds ?? ['fact'];

  /** @param {string} prompt */
  async function ask(prompt) {
    let r;
    try {
      r = await loop.run([{ role: 'user', content: prompt }]);
    } catch (e) {
      if (e instanceof HaltError) /** @type {CategorizedError} */ (e).category = 'cap-halt'; // belt: bare-agent's contract could change
      throw e;
    }
    // bare-agent NEVER throws HaltError out of run() — a governance halt comes
    // back as an error RETURN ({text: '', error: 'halt:<rule>'}; loop.js: "no
    // throw even when throwOnError: true"). Read it, or the failure map goes
    // blind and a cap story masquerades as a worker result (design law #8).
    if (r.error) {
      const err = /** @type {CategorizedError} */ (new Error(`worker loop: ${r.error}`));
      err.category = r.error.startsWith('halt:') ? 'cap-halt' : 'interpreter-red';
      throw err;
    }
    return r;
  }

  /**
   * @param {string} slot
   * @param {{iteration?: number, gap?: string, context?: any}} o
   */
  async function runOps(slot, { iteration, gap, context }) {
    for (const op of slotOps(slot)) {
      if (op.op === 'recall') {
        /** @type {RecallHit[]} */
        const hits = [];
        for (const kind of recallKinds(op)) {
          hits.push(...await lc.recall(task, { kind, n: op.k ?? config.memory.recall?.k ?? 5, body: true }));
        }
        context.text = hits.map((h) => h.body ?? h.text ?? '').filter(Boolean).join('\n');
        context.level = null;
        emit('hook-op', { slot, op: 'recall', hits: hits.length, iteration });
      } else if (op.op === 'compress') {
        const level = op.level ?? config.memory.compressLevel ?? 'verbatim';
        if (context.text) context.text = await compress({ text: context.text, format: 'js' }, { level });
        emit('hook-op', { slot, op: 'compress', level, iteration });
      } else if (op.op === 'stash') {
        if (gap) lc.stash(`gap-${iteration}`, gap);
        emit('hook-op', { slot, op: 'stash', iteration });
      } else if (op.op === 'remember') {
        await lc.remember(`green-${iteration ?? 'final'}-${target.split('/').at(-1)}`, readFileSync(target, 'utf8'), { kind: op.kind ?? 'fact' });
        emit('hook-op', { slot, op: 'remember' });
      }
    }
  }

  // Mid-run revision: interpreter-owned acceptance — a revisor cannot vouch for
  // its own output. The gate is already constructed and the iteration budget
  // already snapshotted, so gate/escalation (arbiter) and loop.maxIterations
  // (cap) must be byte-identical; anything else that validates is a legal
  // free-axis revision.
  /** @param {any} candidate
   *  @returns {{ red: {code: string, reds?: object[]} } | { red?: undefined, config: any }} */
  const acceptRevision = (candidate) => {
    if (!candidate) return { red: { code: 'parse-error' } };
    const cv = validateConfig(candidate, { shellCapUsd, jobWriteScope });
    if (!cv.ok) return { red: { code: 'validation', reds: cv.reds } };
    // judged and installed on the PARSED form (single-parse contract) — a
    // string candidate compared raw would false-red arbiter-touch (its .gate
    // is undefined), and installing it raw would crash every later read
    const cand = /** @type {any} */ (cv.config);
    if (JSON.stringify(cand.gate) !== JSON.stringify(config.gate)
        || JSON.stringify(cand.escalation) !== JSON.stringify(config.escalation)) {
      return { red: { code: 'arbiter-touch' } };
    }
    if (cand.loop?.maxIterations !== config.loop.maxIterations) return { red: { code: 'cap-touch' } };
    return { config: cand };
  };

  /** @type {string[]} */
  const gaps = [];
  let revised = false;
  /**
   * @param {number} iteration
   * @param {string} [gap]
   */
  const middle = async (iteration, gap) => {
    if (gap) gaps.push(gap);
    if (revisor && !revised && gaps.length >= STALL_REDS) {
      emit('stall-detected', { iteration, consecutiveReds: gaps.length });
      revised = true; // one revision per run, spent even if rejected
      let rv;
      try {
        // the run's own gate handlers ride along: revisor spend hits the same
        // budget axis as the worker; a budget halt mid-revision is a cap story,
        // not a revision bug
        rv = await revisor({ config, gaps: [...gaps], policy, onLlmResult });
      } catch (e) {
        if (e instanceof HaltError) /** @type {CategorizedError} */ (e).category = 'cap-halt';
        throw e;
      }
      const rr = acceptRevision(rv.candidate);
      if (rr.red) {
        emit('revision-red', { iteration, ...rr.red, detail: rv.parseError ?? undefined, costUsd: rv.costUsd ?? 0 });
      } else {
        emit('revision-accepted', { iteration, changedPaths: diffPaths(config, rr.config), costUsd: rv.costUsd ?? 0 });
        config = rr.config;
      }
    }
    if (gap) await runOps('after-red', { iteration, gap, context: {} });
    const context = {};
    await runOps('before-attempt', { iteration, context });
    const parts = [task, context.text && `Possibly relevant notes:\n${context.text}`, gap && `Previous attempt failed the test suite:\n${gap}`];

    if (config.loop.shape === 'plan') {
      // plan-then-execute: one call to decompose, one to implement following the plan
      const p = await ask([`Produce a SHORT numbered implementation plan (2-4 steps) for this task. Plan only, no code.`, ...parts.slice(1), parts[0]].filter(Boolean).join('\n\n'));
      emit('worker-plan', { iteration, costUsd: p.metrics?.costUsd ?? p.cost ?? null }); // metrics.costUsd carries the honest null when unpriced; cost sums priced rounds only
      parts.push(`Follow this plan:\n${p.text}`);
    }
    const r = await ask(parts.filter(Boolean).join('\n\n'));
    emit('worker-result', { iteration, costUsd: r.metrics?.costUsd ?? r.cost ?? null, tokens: r.usage?.outputTokens ?? null });

    const decision = await gate.check({ type: 'write', path: target, args: { bytes: r.text.length } });
    if (decision.outcome !== 'allow') {
      const err = /** @type {CategorizedError} */ (new Error(`gate ${decision.outcome} write to ${target} (${decision.rule ?? 'no rule'})`));
      err.category = decision.severity === 'halt' ? 'cap-halt' : 'gate-red';
      throw err;
    }
    writeFileSync(target, stripFences(r.text));
    emit('artifact-written', { iteration, path: target });
  };

  // the config may tighten the shell's iteration budget, never exceed it (mirrors budgetUsd)
  const effectiveCap = Math.min(capRuns, config.loop.maxIterations ?? capRuns);
  // Secrets never enter the spine (hard line): the shell scrubs close output at
  // the source with bareguard's redactor (BG-1 default patterns — Bearer/sk-…).
  // Injected here (the layer that owns bareguard) so ralph stays stdlib-only and
  // the scrub is a fixed shell primitive, not an emergent component (V4 holds).
  const outcome = await ralph({ middle, close, capRuns: effectiveCap, emit, redact: (/** @type {string} */ s) => redact(s) });
  if (outcome === 'green') {
    // The close already passed — a retention hiccup must not un-green a real
    // green (it would corrupt the learning curve). It degrades loudly:
    // retention-red on the spine means this green mints NO inheritance, but
    // the delivery stands (adaptlearn F5).
    try {
      await runOps('on-green', {});
    } catch (e) {
      emit('retention-red', { category: 'retention-red', detail: String(/** @type {Error} */ (e).message || e) });
    }
  }
  // Design law #2 (adaptlearn F18): the run-as-executed record. A mid-run
  // revision changes `config`; without this event the revised config dies with
  // the run and every inheritance channel reads only the config-as-authored.
  emit('config-final', { config, revised });
  return outcome;
}
