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
import { homedir } from 'node:os';
import { Gate, redact } from 'bareguard';
import { LiteCtx, compress } from 'litectx';
import { validateConfig, diffPaths, globToPrefix, SECRET_PATTERNS } from './validate.js';
import { ralph } from './ralph.js';

/** @typedef {Error & {category?: string}} CategorizedError the failure map's carrier: ralph relays by `category` */

// consecutive close reds that count as a stall; one revision per run
export const STALL_REDS = 2;

const require = createRequire(import.meta.url);
const { Loop, wireGate, HaltError } = require('bare-agent');
const { createShellTools } = require('bare-agent/tools');

import { extractArtifact, priceOf } from './text.js';

/** @typedef {{body?: string|null, text?: string|null}} RecallHit litectx recall hit — body present only with `{body: true}` */

const PERSONA = 'You are a senior engineer. Reply with ONLY the complete contents of the requested JavaScript file — no markdown fences, no commentary. ESM.';
// The tool persona states the LOOP CONTRACT (F16): the worker is one attempt inside
// `while close-red and under-cap`, not a one-shot. Without knowing that, a model does
// the rational one-shot thing — read everything, be certain, then act — and the real
// run spent its ENTIRE budget on 12 rounds of reading without one write, never once
// reaching the close. Every round re-pays for every earlier tool result, so reads
// compound: that run's context grew 2k → 121k tokens and its last round cost $0.25.
// Telling the worker it will be re-run with the close's verdict makes an early,
// cheap, wrong attempt the rational move — which is exactly what the loop wants.
const PERSONA_TOOLS = 'You are a senior engineer working in a repository through file tools. '
  + 'ALWAYS use absolute paths — relative paths resolve against the process, not the repository, and will be denied. '
  + 'You are ONE attempt inside an automated loop: when you finish, a test suite runs and, if it still fails, you are called again with its output. '
  + 'So do not try to be certain before acting. Read only what you need to form your best hypothesis, make the change with the write tool, and stop. '
  + 'A wrong cheap attempt is corrected by the next round; exhaustive reading is not — every file you read is re-sent on every later round and the run has a hard budget it can exhaust before you ever write. '
  + 'Make the required changes with the write tool, then reply with a short summary of what you changed. Never put file contents in your reply.';

// ---- tool mode (2b): the spec-side grant menu mapped to bare-agent's shell tools ----
const TOOL_BY_VERB = Object.freeze({ read: 'shell_read', grep: 'shell_grep', write: 'shell_write' });

// The load-bearing containment line (2b POC, scenario B): bare-agent's built-in
// tools are deliberately ungated and their action type is their own NAME, which
// never trips bareguard's fs primitives — this translator maps them onto
// write/read actions so the SAME fence text mode enforces manually governs
// every tool call. Paths resolve exactly as the tools resolve them
// (path.resolve(expandHome(p)), POC scenario F) so the gate judges the same
// file the tool would touch; a relative spelling resolves against the process
// cwd and reds at the fence, and the deny reason teaches the retry.
/** @param {string} p */
const expandHome = (p) => (p === '~' || p.startsWith('~/')) ? join(homedir(), p.slice(1)) : p;
/** @param {string} name @param {any} args */
const toolAction = (name, args) => {
  if (name === 'shell_write') return { type: 'write', path: resolve(expandHome(String(args?.path ?? ''))), args: { bytes: String(args?.content ?? '').length } };
  if (name === 'shell_read' || name === 'shell_grep') return { type: 'read', path: resolve(expandHome(String(args?.path ?? ''))) };
  return { type: name, args };
};

/**
 * Execute a workflow config against one task under the dumb shell.
 *
 * @param {object|string} configRaw schema v1 config (object or raw JSON text)
 * @param {object} opts
 * @param {string} opts.task implement instruction shown to the worker
 * @param {string} [opts.target] absolute path the artifact is written to —
 *        required in text mode; unused in tool mode (the worker writes through
 *        the gated tools, wherever the fence allows)
 * @param {string[]} opts.close argv whose exit code is truth (shell-owned)
 * @param {number} [opts.closeExpect] the exit code the SIGNED spec calls success
 * @param {{pattern: string, min: number}} [opts.closeJudged] the signed spec's
 *   judgment-rendered signal — proof the close actually judged something before
 *   its exit code is believed in EITHER direction (PRD v1.11; the drafted config
 *   cannot express it, and must not: it is the arbiter's own honesty check)
 * @param {string} opts.workdir run directory (litectx root, gate audit, scope base)
 * @param {number} opts.capRuns shell iteration budget; the config may tighten via loop.maxIterations, never exceed
 * @param {(type: string, data?: object) => object} opts.emit spine emitter
 * @param {object} opts.provider a bareagent provider — SHELL-owned binding (adaptlearn F8: an unsealed binding is a gate bypass)
 * @param {number} [opts.shellCapUsd=2] the shell's USD cap; a config budgetUsd above it REDS at validation (bounds — no silent clamping)
 * @param {number} [opts.closeTimeoutMs] close wall-clock cap, threaded to the shell
 *        (shell/operator territory — the workflow config cannot express it)
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
 * @param {string} [opts.closeState] the close's CURRENT output on the tree as it stands
 *        (the shell's pre-token close check, F13) — shown to the first attempt only, and
 *        never framed as an attempt: the worker cannot run the close itself (`run` is a
 *        locked verb), so without this it is asked to fix a failure it cannot see
 * @param {'text'|'tools'} [opts.mode] middle mode (2b): 'text' (default) writes the ONE
 *        target from the response artifact; 'tools' gives the worker Gate-governed file
 *        tools — SPEC-side territory (the step declares it; the config cannot express it)
 * @param {string[]} [opts.tools] the spec's tool grant (subset of read|grep|write,
 *        job-v1 validated); defaults to the full menu in tool mode
 * @returns {Promise<'green'|'escalated'|'config-red'>}
 */
export async function interpret(configRaw, { task, target, close, workdir, capRuns, emit, provider, shellCapUsd = 2, jobWriteScope, revisor, closeTimeoutMs, mode = 'text', tools, closeState, closeExpect, closeJudged }) {
  // Reds-before-tokens: text mode writes ONE artifact — a missing target is a
  // caller bug that must be loud NOW, not a TypeError after a paid worker call
  // that ralph would misfile as interpreter-red (the gate skips an absent path,
  // so nothing downstream catches it before writeFileSync(undefined)).
  if (mode === 'text' && (typeof target !== 'string' || !target)) {
    throw new TypeError('interpret: text mode requires target (the absolute artifact path)');
  }
  // Normalize ONCE: a trailing slash or a relative spelling must mean the same
  // directory everywhere below — the enforcement belt compares string prefixes,
  // and "/run/" vs "/run" would false-red every legal scope (release review).
  workdir = resolve(workdir);
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
  // equality counts as escaped: no legal scope resolves to workdir itself (the
  // close lives there), so a scope normalizing to ''/'.' is a regression, not a grant
  const escaped = resolvedScopes.filter((/** @type {string} */ abs) => !abs.startsWith(workdir + sep));
  if (escaped.length) {
    for (const abs of escaped) emit('config-red', { code: 'scope-escape', path: 'gate.writeScope', detail: `resolved scope ${abs} escapes the run directory` });
    emit('run-end', { outcome: 'config-red', iterations: 0 });
    return 'config-red';
  }
  const gate = new Gate({
    // bareguard fs.writeScope is prefix-containment, not glob (adaptlearn F4); globToPrefix
    // is the ONE transform shared with the validator's legality rule — mid-path wildcards
    // and workdir-escaping scopes were already rejected up front (adaptlearn F9, law #1).
    // Tool mode adds readScope: the worker's reads stay inside the run directory —
    // the stray-read secrets channel (~/.ssh, /etc) closes with one field (2b POC D).
    // Tool mode adds readScope (the stray-read secrets channel, 2b POC D) AND
    // deny (F14): readScope is the whole workdir, which CONTAINS the run's own
    // machinery — the gate's audit ledger, the primitive-smoke store, the litectx
    // memory store. The real run's worker read its own gate audit and spine. The
    // emergent middle does not author the arbiter, and it does not get to read the
    // arbiter's books either: that is an invitation to fit-to-pass and it fills the
    // context with the run's own bookkeeping instead of the repository's code.
    fs: {
      writeScope: resolvedScopes,
      ...(mode === 'tools'
        ? { readScope: [workdir], deny: [join(workdir, 'gate-audit.jsonl'), join(workdir, '.smoke'), join(workdir, '.litectx')] }
        : {}),
    },
    budget: { maxCostUsd: config.gate.budgetUsd },
    // text mode is ~1-2 rounds per attempt; tool mode is N rounds (read→write→…)
    limits: { maxTurns: (mode === 'tools' ? 24 : 8) * (capRuns + 1) },
    audit: { path: join(workdir, 'gate-audit.jsonl') },
    humanChannel: async () => ({ decision: 'terminate' }), // no human mid-run: a tripped cap terminates → decision-ready escalation
  });
  await gate.init();
  const { policy, onLlmResult } = wireGate(gate, mode === 'tools' ? { actionTranslator: (/** @type {string} */ n, /** @type {any} */ a) => toolAction(n, a) } : {});
  // Money is metered as it is SPENT — per ROUND, not per attempt (F12). A
  // multi-round attempt that halts (or throws) never returns, so its rounds
  // never reach `worker-result`: the real run bought $1.4375 of tokens inside a
  // halted attempt and the job ledger reported $0.0048. `onLlmResult` is the one
  // seam that sees every round, and it fires BEFORE the gate records the round —
  // so even the round that trips the cap lands on the spine. Emitted first, then
  // forwarded verbatim: the gate's own accounting is never altered. costUsd/
  // pricing ride AS-IS (a null is the honest unknown, never $0 — F6).
  /** @type {number|undefined} the attempt a round belongs to (display only) */
  let roundIteration;
  /** @param {{costUsd?: number|null, pricing?: string|null, usage?: any}} arg */
  const meteredOnLlmResult = async (arg) => {
    emit('worker-round', {
      iteration: roundIteration,
      costUsd: arg?.costUsd ?? null,
      pricing: arg?.pricing ?? null,
      tokens: (arg?.usage?.inputTokens ?? 0) + (arg?.usage?.outputTokens ?? 0),
    });
    return onLlmResult(arg);
  };
  const loop = new Loop({ provider, system: mode === 'tools' ? PERSONA_TOOLS : PERSONA, policy, onLlmResult: meteredOnLlmResult });
  // The offered tools ARE the grant (2b decision #2): an ungranted tool is never
  // in the menu the model sees — a call to it is "unknown tool", not a deny.
  const toolDefs = mode === 'tools'
    ? (() => { const granted = new Set((tools ?? Object.keys(TOOL_BY_VERB)).map((v) => /** @type {Record<string, string>} */ (TOOL_BY_VERB)[v])); return createShellTools().tools.filter((/** @type {{name: string}} */ t) => granted.has(t.name)); })()
    : [];

  /** @param {string} slot */
  const slotOps = (slot) => config.hooks?.[slot] ?? [];
  /** @param {{kinds?: string[]}} op */
  const recallKinds = (op) => op.kinds ?? config.memory.recall?.kinds ?? ['fact'];

  /** @param {string} prompt */
  async function ask(prompt) {
    let r;
    try {
      r = await loop.run([{ role: 'user', content: prompt }], toolDefs);
    } catch (e) {
      const err = /** @type {CategorizedError} */ (e);
      // A throw OUT OF loop.run() is provider/loop territory by definition — the
      // interpreter's own code is not on that stack. The real run died `read
      // ENETUNREACH` mid-call and was filed interpreter-red ("fix the middle"),
      // when the honest decision was "the network failed — retry" (F11). A
      // governance halt keeps its own category; everything else is provider-red,
      // the same class the drafting path already names.
      err.category = e instanceof HaltError ? 'cap-halt' : (err.category ?? 'provider-red');
      throw err;
    }
    // bare-agent NEVER throws HaltError out of run() — a governance halt comes
    // back as an error RETURN ({text: '', error: 'halt:<rule>'}; loop.js: "no
    // throw even when throwOnError: true"). Read it, or the failure map goes
    // blind and a cap story masquerades as a worker result (design law #8).
    // A denial streak ('denied:<tool>', BA-11) is a governance deny, not a
    // broken interpreter — gate-red, same category as text mode's fence deny.
    if (r.error) {
      const err = /** @type {CategorizedError} */ (new Error(`worker loop: ${r.error}`));
      err.category = r.error.startsWith('halt:') ? 'cap-halt' : r.error.startsWith('denied:') ? 'gate-red' : 'interpreter-red';
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
        // tool mode has no single target to read back — the green's retained
        // form is the worker's own change summary (its final loop text), which
        // is what a future recall can actually use
        const content = mode === 'tools' ? (lastText ?? '') : readFileSync(/** @type {string} */ (target), 'utf8');
        await lc.remember(`green-${iteration ?? 'final'}-${mode === 'tools' ? 'tools' : /** @type {string} */ (target).split('/').at(-1)}`, content, { kind: op.kind ?? 'fact' });
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
  /** @type {string|undefined} set on artifact-red, consumed by the next attempt's prompt */
  let artifactNote;
  /** @type {string|undefined} tool mode: the last attempt's summary text (retention source) */
  let lastText;
  /**
   * @param {number} iteration
   * @param {string} [gap]
   */
  const middle = async (iteration, gap) => {
    roundIteration = iteration; // stamps every round of this attempt (F12)
    if (gap) gaps.push(gap);
    if (revisor && !revised && gaps.length >= STALL_REDS) {
      emit('stall-detected', { iteration, consecutiveReds: gaps.length });
      revised = true; // one revision per run, spent even if rejected
      let rv;
      try {
        // the run's own gate handlers ride along: revisor spend hits the same
        // budget axis as the worker; a budget halt mid-revision is a cap story,
        // not a revision bug
        // the METERED handler: revisor rounds are real money on the same axis (F12)
        rv = await revisor({ config, gaps: [...gaps], policy, onLlmResult: meteredOnLlmResult });
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
    // F10 (first real-model run): a tool-mode worker must be TOLD where the
    // repository is. The persona demands absolute paths, but bare-agent's shell
    // tools resolve relative paths against the PROCESS cwd — not the workdir —
    // so a worker with no root is working blind: the real run groped for the repo
    // (/home/hamr, the runner's own directory, then /) and the fence denied every
    // guess until the denial streak stopped it. Containment held; the task was
    // impossible. Text mode is told nothing: it has no tools to point anywhere,
    // and the shell alone chooses its one target.
    // (parts[0] stays the task: the plan shape re-orders around it)
    const parts = [
      task,
      mode === 'tools' && `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root — a relative path resolves against a different directory and will be denied by the gate.`,
      // F13: what the close says about the tree RIGHT NOW — the state a human
      // maintainer reads first. Given only until an attempt of our own exists
      // (then `gap` is the truer, attributable evidence). The real run withheld
      // this on the grounds that "no attempt has happened", and the worker — which
      // cannot run the suite itself, the `run` verb being locked — groped through
      // the repository and burned the entire cap without one write. Attributing an
      // attempt and describing the tree are different claims; this is the second.
      !gap && closeState && `The close is currently failing. This is its output on the tree as it stands (not an attempt of yours):\n${closeState}`,
      context.text && `Possibly relevant notes:\n${context.text}`, gap && `Previous attempt failed the test suite:\n${gap}`,
      artifactNote && `Previous attempt never reached the close:\n${artifactNote}`];

    if (config.loop.shape === 'plan') {
      // plan-then-execute: one call to decompose, one to implement following the plan
      const p = await ask([`Produce a SHORT numbered implementation plan (2-4 steps) for this task. Plan only, no code.`, ...parts.slice(1), parts[0]].filter(Boolean).join('\n\n'));
      emit('worker-plan', { iteration, ...priceOf(p) }); // priceOf: the ONE honest-null cost read (F6)
      parts.push(`Follow this plan:\n${p.text}`);
    }
    const r = await ask(parts.filter(Boolean).join('\n\n'));
    emit('worker-result', { iteration, ...priceOf(r), toolCalls: r.metrics?.toolCalls ?? 0, tokens: r.usage?.outputTokens ?? null });

    // Tool mode: the worker already wrote through the gated tools (every call
    // policy-checked against the fence); its final text is a change summary,
    // not an artifact — there is nothing to extract and artifact-red genuinely
    // does not exist here (2b decision #3). The close judges the tree as-is.
    if (mode === 'tools') {
      lastText = r.text ?? '';
      return;
    }

    // Fence-robust extraction BEFORE the gate: what gets written is the
    // artifact, not the response (F2 #2). A response with no artifact reds on
    // its OWN axis — artifact-red — and writes nothing: the close will red
    // against the stale/missing target, but the spine names the true cause,
    // so the contrast evidence stays clean (F21's instrument caveat).
    const ex = extractArtifact(r.text);
    if (ex.red) {
      emit('artifact-red', { iteration, category: 'artifact-red', reason: ex.red });
      artifactNote = `your response was rejected as a non-artifact (${ex.red}) — emit ONLY the code artifact`;
      return; // retryable: the next attempt carries the note; ralph's cap still governs
    }
    artifactNote = undefined;
    const code = /** @type {string} */ (ex.code); // non-null: ex.red was checked above
    const t = /** @type {string} */ (target); // text mode contract: target is required
    const decision = await gate.check({ type: 'write', path: t, args: { bytes: code.length } });
    if (decision.outcome !== 'allow') {
      const err = /** @type {CategorizedError} */ (new Error(`gate ${decision.outcome} write to ${t} (${decision.rule ?? 'no rule'})`));
      err.category = decision.severity === 'halt' ? 'cap-halt' : 'gate-red';
      throw err;
    }
    writeFileSync(t, code);
    emit('artifact-written', { iteration, path: t });
  };

  // the config may tighten the shell's iteration budget, never exceed it (mirrors budgetUsd)
  const effectiveCap = Math.min(capRuns, config.loop.maxIterations ?? capRuns);
  // Secrets never enter the spine (hard line): the shell scrubs close output at
  // the source with bareguard's redactor — BG-1 defaults (Bearer/sk-…) PLUS the
  // validator's whole shape inventory (SECRET_PATTERNS), so redaction can never
  // pass a shape detection reds (a git close echoing a ghp_ token was the gap).
  // Injected here (the layer that owns bareguard) so ralph stays stdlib-only and
  // the scrub is a fixed shell primitive, not an emergent component (V4 holds).
  // cwd: workdir — the close judges the tree the work happened in (F8). A close
  // is a repository command (`npm test`); run from anywhere else it silently
  // judges another repo and exit-code-is-truth stops being true.
  // expect/judged are the SIGNED spec's, threaded verbatim — the drafted config
  // cannot express either (they are arbiter territory, PRD v1.11).
  const outcome = await ralph({ middle, close, capRuns: effectiveCap, emit, closeTimeoutMs, cwd: workdir, expect: closeExpect, judged: closeJudged, redact: (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS }) });
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
