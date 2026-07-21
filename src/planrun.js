// Layer 2 executor — the plan-v1 run, end to end (PRD v1.12; design record
// 2026-07-21). SCOUT (read-only, hard-bounded) → PLAN (the decompose call,
// gated by validatePlan before tokens burn) → EXECUTE (per-step micro-loops:
// the same ralph(), judge = the exit evaluator — the F46 mechanism) → ONE
// replan → the operator's close, the only truth. The checks referenced by
// `check-passes` run under the FULL runClose machinery (forbidden zone,
// judged floor, redaction, gapKeep); they decide nothing and mint nothing —
// a check result is a progress gate and a gap source, nothing more.
//
// Prompt contract (v1.12 §5), held here: a step worker sees its action, the
// absolute repo root, its target, prior steps' artifacts labeled by id, its
// gap, and a cut-off notice. It NEVER sees the budget, the close command, a
// check's command, the validator, other steps' grants, or the arbiter's books
// (fs.deny on the gate audit / .smoke / .litectx, unchanged).

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Gate, redact } from 'bareguard';
import { LiteCtx } from 'litectx';
import { runClose, ralph, CLOSE_FAULTS } from './ralph.js';
import { validatePlan } from './plan.js';
import { WRITE_VERBS, EXIT_TYPES, MAX_EXITS_PER_STEP, MAX_PLAN_STEPS } from './plan.js';
import { snapshotScope, evalExits } from './exits.js';
import { TOOL_MENU } from './job.js';
import { TOOL_BY_VERB, CTX_TOOLS, createCtxTools, toolAction, PERSONA_TOOLS, RETRIEVAL_STRATEGY, EDIT_STRATEGY } from './interpret.js';
import { globToPrefix, SECRET_PATTERNS } from './validate.js';
import { extractArtifact } from './text.js';

const require = createRequire(import.meta.url);
const { Loop, wireGate, HaltError } = require('bare-agent');
const { createShellTools } = require('bare-agent/tools');

/** the scout's hard round bound — read-only survey, never a worker (v1.12 §1) */
const SCOUT_ROUNDS = 8;
/** blob bound: the scout's output is a PROMPT ingredient for every later call */
const SCOUT_BLOB_MAX = 8000;
/** feed-forward artifact bound per step (prompt ingredient, spine-bound) */
const ARTIFACT_MAX = 2000;

/** @typedef {Error & {category?: string, lib?: string}} CategorizedError */

/**
 * The plan-drafting prompt: a schema DESCRIPTION built from the live validator
 * menus — never a copyable example (the drafter must author, not echo; the
 * run.js draftPrompt precedent). Check NAMES only: a check's command is
 * arbiter territory the planner never sees.
 * @param {any} job @param {string} scoutBlob @param {any[]|null} reds
 * @param {number} maxStepRounds @param {string|null} failure replan context
 */
function planPrompt(job, scoutBlob, reds, maxStepRounds, failure) {
  const ceiling = Array.isArray(job.tools) ? job.tools : [...TOOL_MENU];
  const checkNames = (job.checks ?? []).map((/** @type {any} */ c) => c.name);
  const doc = `DRAFT-PLAN
You are planning how to accomplish a goal in a repository, as an ordered list of bounded
steps (schema "plan-v1"). The plan is pure declarative JSON validated by a strict schema;
ANY unknown field, wrong enum value, or out-of-bounds number is rejected. Output ONLY the
JSON object, no fences, no commentary.

Shape: { "schema": "plan-v1", "steps": [ ... 1..${MAX_PLAN_STEPS} steps ... ] } — steps run
strictly in array order. Each step (no other fields exist):
- "id": kebab-case slug, unique
- "action": the step's task, precise enough for a worker that sees ONLY this step
- "tools": non-empty unique subset of ${JSON.stringify(ceiling)} (write/edit are the write-class verbs)
- "rounds": integer 1..${maxStepRounds} — the step's per-attempt tool-round bound
- "target": the step's deliverable path (REQUIRED when tools include write/edit), inside ${JSON.stringify(job.writeScope)}
- "exit": 1..${MAX_EXITS_PER_STEP} form checks that ALL must pass (AND), each one of:
    {"type":"artifact-written","path":"...","pattern":"optional regex"}
    {"type":"tree-changed","scope":"a scope inside ${JSON.stringify(job.writeScope)}"}
    {"type":"json-valid","path":"..."}
    {"type":"check-passes","name":"one of ${JSON.stringify(checkNames)}"}
  A check-passes on a write-granted step MUST be paired with a tree-changed exit
  (the repository starts green — a lone check would pass on the untouched tree).
  Reference checks by NAME only; you cannot author or modify one.

Goal:
${job.goal}

Repository survey (from a read-only scout):
${scoutBlob || '(no scout notes)'}`;
  let p = doc;
  if (failure) p += `\n\nWhat happened when the previous plan ran:\n${failure}\nPlan differently — a repeat of the same steps will fail the same way.`;
  if (reds) p += `\n\nYour previous plan was REJECTED with these reds (code:path):\n${JSON.stringify(reds)}\nFix every red. Output ONLY the corrected JSON object.`;
  return p;
}

/**
 * Execute a validateJob-GREEN plan-shape job (goal/verdictType/close/checks[]).
 * Called by runJob after the approval gate, validation, and the smoke — this
 * function owns the plan flow only; the caller owns the job-end record and the
 * one ledger (every provider round is emitted here as `worker-round`, which
 * the caller's metered emit accounts — F12).
 *
 * @param {any} job the validated plan-shape spec
 * @param {object} opts
 * @param {string} opts.workdir the run directory (the fence's root)
 * @param {any} opts.provider shell-owned LLM binding
 * @param {(type: string, data?: object) => object} opts.emit spine emitter (the caller's METERED emit)
 * @param {() => number} opts.remainingUsd the one wallet: what is left of the signed budget right now
 * @param {number} [opts.capRuns] shell-owned per-step attempt cap
 * @param {number} [opts.closeTimeoutMs] close/check wall-clock cap (shell territory)
 * @param {number} [opts.maxStepRounds] the shell's per-step rounds ceiling (validatePlan's bound)
 * @returns {Promise<string>} 'green' | 'already-green' | 'escalated' | 'plan-red' |
 *   'check-red' | 'close-red' | 'cap-halt' | 'provider-red' | `step-red:<id>`
 */
export async function runPlan(job, { workdir, provider, emit, remainingUsd, capRuns = 3, closeTimeoutMs, maxStepRounds = 40 }) {
  workdir = resolve(workdir);
  const scrub = (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS });
  const closeArgv = job.close.cmd.trim().split(/\s+/);
  const closeOpts = { timeoutMs: closeTimeoutMs, cwd: workdir, expect: job.close.expect, judged: job.close.judged, gapKeep: job.close.gapKeep };

  // ── 0a. close precheck (close-first, F17): already-green is a DISTINCT
  // record, zero tokens; a forbidden-zone verdict escalates before any spend
  const pre = runClose(closeArgv, scrub, closeOpts);
  emit('close-precheck', { ...pre });
  if (pre.verdict === 'satisfied') return 'already-green';
  const preFault = Object.hasOwn(CLOSE_FAULTS, pre.verdict) ? CLOSE_FAULTS[pre.verdict] : undefined;
  if (preFault) {
    emit('escalation', { category: preFault.category, decisionReady: true, decision: preFault.decision, options: preFault.options, detail: pre.detail });
    return 'close-red';
  }

  // ── 0b. checks preflight ($0, deterministic): every SIGNED check runs once
  // before tokens — an unrunnable check would fault mid-plan after real spend
  // (a frozen rule without a wired detector is prose; here the detector runs
  // first). Red and green are both fine: checks decide nothing.
  for (const c of job.checks ?? []) {
    const v = runClose(c.cmd.trim().split(/\s+/), scrub, { timeoutMs: closeTimeoutMs, cwd: workdir, expect: c.expect, judged: c.judged, gapKeep: c.gapKeep });
    emit('check-preflight', { name: c.name, verdict: v.verdict });
    const f = Object.hasOwn(CLOSE_FAULTS, v.verdict) ? CLOSE_FAULTS[v.verdict] : undefined;
    if (f) {
      emit('escalation', { category: f.category, decisionReady: true, decision: `Signed check "${c.name}" rendered no judgment at preflight — every plan referencing it would fault mid-run. ${f.decision}`, options: f.options, detail: `${c.name}: ${v.detail ?? ''}` });
      return 'check-red';
    }
  }

  const lc = new LiteCtx({ root: workdir });
  const ceiling = Array.isArray(job.tools) ? job.tools : [...TOOL_MENU];
  const fencePrefixes = job.writeScope.map((/** @type {string} */ g) => resolve(workdir, globToPrefix(g)));
  const auditPath = join(workdir, 'gate-audit.jsonl');
  const checksByName = new Map((job.checks ?? []).map((/** @type {any} */ c) => [c.name, c]));

  /** the check-passes seam evalExits delegates to: the FULL runClose machinery
   * per signed check; a forbidden-zone verdict rides out as `fault` by name so
   * the micro-loop escalates (or F32-routes a crash) instead of faking a gap */
  const runCheck = async (/** @type {string} */ name) => {
    const c = checksByName.get(name);
    if (!c) return { pass: false, fault: 'failed', gap: `no signed check named "${name}"` };
    const v = runClose(c.cmd.trim().split(/\s+/), scrub, { timeoutMs: closeTimeoutMs, cwd: workdir, expect: c.expect, judged: c.judged, gapKeep: c.gapKeep });
    emit('check-run', { name, verdict: v.verdict, ...(v.exitCode !== undefined ? { exitCode: v.exitCode } : {}) });
    if (v.verdict === 'satisfied') return { pass: true };
    if (v.verdict === 'needs_revision') return { pass: false, gap: v.gap };
    return { pass: false, fault: v.verdict, gap: v.detail };
  };

  /** the last escalation ralph emitted — the replan trigger reads its category
   * (only exhaustion replans; an instrument stop stays a stop) */
  let lastEscalation = /** @type {any} */ (null);
  /** @type {(type: string, data?: object) => object} */
  const emitL = (type, data) => { if (type === 'escalation') lastEscalation = data; return emit(type, data); };

  /**
   * Assemble one bounded worker: fresh Gate (the fence, the arbiter's books
   * denied, the wallet as its budget), granted tools only (the menu IS the
   * grant), per-attempt round bound via loop.stop() (F20), every round metered
   * with a phase label (F12).
   * @param {{granted: string[], phase: string, attemptRounds: number, attempts: number, writable: boolean}} o
   */
  async function mkWorker({ granted, phase, attemptRounds, attempts, writable }) {
    const gate = new Gate({
      fs: {
        writeScope: writable ? fencePrefixes : [],
        readScope: [workdir],
        deny: [auditPath, join(workdir, '.smoke'), join(workdir, '.litectx')],
      },
      budget: { maxCostUsd: Math.max(remainingUsd(), 0.0001) },
      limits: { maxTurns: attemptRounds * (attempts + 1) },
      audit: { path: auditPath },
      humanChannel: async () => ({ decision: 'terminate' }),
    });
    await gate.init();
    // F32's instrument, run_id-scoped, write AND edit, allow-decision only —
    // the same audit read as interpret's (never git status, F45)
    const workerWrites = () => {
      try {
        const paths = new Set();
        for (const line of readFileSync(auditPath, 'utf8').split('\n')) {
          if (!line) continue;
          let rec;
          try { rec = JSON.parse(line); } catch { continue; }
          if (rec.run_id === gate.runId && rec.phase === 'gate' && rec.decision === 'allow'
              && (rec.action?.type === 'write' || rec.action?.type === 'edit')
              && typeof rec.action.path === 'string') paths.add(rec.action.path);
        }
        return [...paths];
      } catch { return []; }
    };
    const { policy, onLlmResult } = wireGate(gate, { actionTranslator: (/** @type {string} */ n, /** @type {any} */ a) => toolAction(n, a, workdir) });
    /** @type {number|string|undefined} */
    let roundIteration;
    let roundsThisAttempt = 0;
    /** @type {number|string|undefined} */
    let attemptBounded;
    /** @param {{costUsd?: number|null, pricing?: string|null, usage?: any, kind?: string}} arg */
    const metered = async (arg) => {
      const u = arg?.usage ?? {};
      emit('worker-round', {
        phase, iteration: roundIteration, kind: arg?.kind ?? 'turn',
        costUsd: arg?.costUsd ?? null, pricing: arg?.pricing ?? null,
        tokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
        usage: { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, cacheReadTokens: u.cacheReadTokens ?? 0, cacheCreationTokens: u.cacheCreationTokens ?? 0 },
      });
      if ((arg?.kind ?? 'turn') === 'turn') {
        roundsThisAttempt += 1;
        if (roundsThisAttempt >= attemptRounds) {
          attemptBounded = roundIteration;
          emit('attempt-bounded', { phase, iteration: roundIteration, rounds: roundsThisAttempt, cap: attemptRounds });
          loop.stop();
        }
      }
      return onLlmResult(arg);
    };
    const grantedNames = new Set(granted.map((v) => /** @type {Record<string, string>} */ (TOOL_BY_VERB)[v]));
    const shell = createShellTools().tools.filter((/** @type {{name: string}} */ t) => grantedNames.has(t.name));
    const ctx = [...CTX_TOOLS].some((t) => grantedNames.has(t))
      ? createCtxTools(lc, workdir, emit).filter((t) => grantedNames.has(t.name))
      : [];
    if (ctx.length) await lc.index();
    const toolDefs = [...shell, ...ctx];
    const loop = new Loop({
      provider,
      system: PERSONA_TOOLS + (granted.includes('edit') ? EDIT_STRATEGY : '') + (ctx.length ? RETRIEVAL_STRATEGY : ''),
      policy,
      onLlmResult: metered,
    });
    /** @param {string} prompt @param {typeof toolDefs} [defs] */
    const ask = async (prompt, defs = toolDefs) => {
      let r;
      try {
        r = await loop.run([{ role: 'user', content: prompt }], defs, { cacheMessages: true, maxTokens: 32000 });
      } catch (e) {
        const err = /** @type {CategorizedError} */ (e);
        err.category = e instanceof HaltError ? 'cap-halt' : (err.category ?? 'provider-red');
        throw err;
      }
      // same error-return taxonomy as interpret's ask (one map, same doctrine):
      // halt → cap-halt, denial streak → gate-red, API truncation → provider-red
      if (r.error) {
        const err = /** @type {CategorizedError} */ (new Error(`worker loop: ${r.error}`));
        err.category = r.error.startsWith('halt:') ? 'cap-halt'
          : r.error.startsWith('denied:') ? 'gate-red'
          : r.error.startsWith('truncated:') ? 'provider-red'
          : 'interpreter-red';
        err.lib = 'bare-agent';
        throw err;
      }
      return r;
    };
    return { ask, workerWrites, setIteration: (/** @type {number|string} */ i) => { roundIteration = i; roundsThisAttempt = 0; }, wasBounded: () => attemptBounded };
  }

  /** relay a throw from OUTSIDE ralph (scout/plan drafting) as its honest category */
  const relay = (/** @type {any} */ e, /** @type {string} */ phase) => {
    const category = e instanceof HaltError ? 'cap-halt' : (typeof e?.category === 'string' ? e.category : 'provider-red');
    if (category === 'cap-halt') emit('cap-halt', { category, meaning: 'not under cap — not "can\'t"', detail: String(e?.message ?? e) });
    emit('escalation', {
      category, decisionReady: true, phase,
      decision: category === 'cap-halt' ? `The budget gate tripped during ${phase} — the wallet cannot fund the plan flow.` : `The ${phase} call failed (${category}) — no result exists.`,
      options: category === 'cap-halt' ? ['raise the job budget and rerun', 'abandon the run'] : ['retry the run', 'fix the provider binding', 'abandon the run'],
      detail: String(e?.message ?? e),
      ...(typeof e?.lib === 'string' ? { lib: e.lib } : {}),
    });
    return category === 'cap-halt' ? 'cap-halt' : 'provider-red';
  };

  // ── 1. SCOUT — read-only by construction: the write-class verbs are simply
  // not in its menu (the menu is the grant), and its gate fences zero paths
  let scoutBlob = '';
  emit('scout-start', { rounds: SCOUT_ROUNDS });
  try {
    const scout = await mkWorker({ granted: ceiling.filter((v) => !WRITE_VERBS.includes(v)), phase: 'scout', attemptRounds: SCOUT_ROUNDS, attempts: 1, writable: false });
    scout.setIteration(1);
    const r = await scout.ask([
      'Survey this repository READ-ONLY for the goal below. Report: the relevant layout, the key files and symbols, and your best hypothesis about what the work requires. Be concise — your notes brief a planner that cannot see the repository.',
      `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root.`,
      `Goal:\n${job.goal}`,
      pre.gap && `The job's verification is currently failing. Its output on the tree as it stands:\n${pre.gap}`,
    ].filter(Boolean).join('\n\n'));
    scoutBlob = scrub(r.text ?? '').slice(0, SCOUT_BLOB_MAX);
  } catch (e) {
    return relay(e, 'scout');
  }
  emit('scout-result', { bytes: Buffer.byteLength(scoutBlob) });

  // ── 2. PLAN — the decompose call; the planner NEVER sees the repo (no tools,
  // scout blob only — what keeps the plan a plan and not a second worker).
  // One shot + one redraft with the reds fed back (the drafting precedent).
  const drafter = await mkWorker({ granted: [], phase: 'plan', attemptRounds: 2, attempts: 3, writable: false });
  /** @param {any[]|null} reds @param {string|null} failure */
  const draftPlan = async (reds, failure) => {
    drafter.setIteration(reds ? 'redraft' : 'draft');
    const r = await drafter.ask(planPrompt(job, scoutBlob, reds, maxStepRounds, failure), []);
    return extractArtifact(r.text).code ?? '';
  };
  /** draft + validate with one redraft; emits plan-validate per phase
   * @param {string} phase @param {string|null} failure */
  const obtainPlan = async (phase, failure) => {
    let text = await draftPlan(null, failure);
    let pv = validatePlan(text, { job, maxStepRounds });
    emit('plan-validate', { ok: pv.ok, reds: pv.reds, phase: `${phase}-1` });
    if (!pv.ok) {
      text = await draftPlan(pv.reds, failure);
      pv = validatePlan(text, { job, maxStepRounds });
      emit('plan-validate', { ok: pv.ok, reds: pv.reds, phase: `${phase}-2` });
    }
    return pv;
  };
  let plan;
  try {
    const pv = await obtainPlan('draft', null);
    if (!pv.ok) {
      for (const r of pv.reds) emit('plan-red', r);
      return 'plan-red';
    }
    plan = /** @type {any} */ (pv.plan);
    emit('plan-accepted', { plan });
  } catch (e) {
    return relay(e, 'plan');
  }

  // ── 3. EXECUTE — strictly sequential micro-loops; judge = the exit
  // evaluator through ralph's shell-owned seam; artifacts feed forward (F21)
  /** @type {{id: string, text: string}[]} */
  const artifacts = [];
  /** @type {{id: string, outcome: string}[]} */
  const stepOutcomes = [];
  let replanned = false;
  const planExecuted = () => emit('plan-executed', { steps: stepOutcomes, replanned });

  /** @param {any} step */
  const executeStep = async (step) => {
    emit('step-start', { step: step.id, rounds: step.rounds, tools: step.tools });
    // the before-side of every tree-changed exit, taken at STEP start: the
    // step's cumulative work is what the exit judges (outcome, never intent)
    const snapshot = new Map();
    for (const e of step.exit) {
      if (e.type === 'tree-changed') for (const [k, v] of await snapshotScope(workdir, e.scope)) snapshot.set(k, v);
    }
    const w = await mkWorker({ granted: step.tools, phase: `step:${step.id}`, attemptRounds: step.rounds, attempts: capRuns, writable: true });
    let lastText = '';
    let iterationNow = 0;
    /** @param {number} iteration @param {string} [gap] */
    const middle = async (iteration, gap) => {
      w.setIteration(iteration);
      iterationNow = iteration;
      const r = await w.ask([
        step.action,
        `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root — a relative path resolves against a different directory and will be denied by the gate.`,
        step.target && `Write your deliverable to: ${resolve(workdir, step.target)}`,
        artifacts.length > 0 && `Working context (read-only) — prior steps' results:\n${artifacts.map((a) => `[${a.id}] ${a.text}`).join('\n\n')}`,
        gap && `Previous attempt failed this step's checks:\n${gap}`,
        w.wasBounded() === iteration - 1
          && `Your previous attempt was CUT OFF after ${step.rounds} tool rounds. Reading is bounded; writing is not. Form a hypothesis EARLY and make the change.`,
      ].filter(Boolean).join('\n\n'));
      lastText = scrub(r.text ?? '').slice(0, ARTIFACT_MAX);
    };
    const judge = async () => {
      const { pass, results } = await evalExits(step.exit, { dir: workdir, snapshot, runCheck });
      emit('exit-eval', { step: step.id, iteration: iterationNow, results });
      // an instrument fault rides out by its runClose verdict NAME: ralph
      // escalates it through CLOSE_FAULTS (or F32-routes a crash after writes)
      const faulty = results.find((r) => r.fault);
      if (faulty) return { verdict: /** @type {string} */ (faulty.fault), detail: faulty.detail };
      if (pass) return { verdict: 'satisfied' };
      // AND-only: the gap names EVERY failing wall (mechanical genre, F38)
      return { verdict: 'needs_revision', gap: results.filter((r) => !r.pass).map((r) => r.detail).join('\n') };
    };
    const outcome = await ralph({ middle, judge, capRuns, emit: emitL, workerWrites: w.workerWrites });
    return { outcome, artifact: lastText };
  };

  let idx = 0;
  while (idx < plan.steps.length) {
    const step = plan.steps[idx];
    let res;
    try {
      res = await executeStep(step);
    } catch (e) {
      // mkWorker/gate setup faults — the spine must terminate, never dangle
      stepOutcomes.push({ id: step.id, outcome: 'interpreter-red' });
      planExecuted();
      return relay(e, `step:${step.id}`);
    }
    stepOutcomes.push({ id: step.id, outcome: res.outcome });
    emit('step-end', { step: step.id, outcome: res.outcome });
    if (res.outcome === 'green') {
      artifacts.push({ id: step.id, text: res.artifact });
      idx += 1;
      continue;
    }
    // ONE replan, and only for EXHAUSTION (cap-halt): an instrument stop or a
    // governance halt is a stop — replanning around a broken instrument would
    // launder the fault (F45's class). Unlimited replanning launders thrash.
    if (!replanned && lastEscalation?.category === 'cap-halt') {
      replanned = true;
      emit('replan', { step: step.id, reason: 'step exhausted its attempts with exits still red' });
      const failure = `Step "${step.id}" (${step.action}) ran ${capRuns} attempts and its exits were still red. `
        + `Last exit state:\n${lastEscalation?.detail ?? '(none)'}\n`
        + `Steps completed so far: ${artifacts.map((a) => a.id).join(', ') || 'none'}.`;
      let pv;
      try {
        pv = await obtainPlan('replan', failure);
      } catch (e) {
        planExecuted();
        return relay(e, 'replan');
      }
      if (!pv.ok) {
        for (const r of pv.reds) emit('plan-red', r);
        planExecuted();
        return 'plan-red';
      }
      plan = /** @type {any} */ (pv.plan);
      emit('plan-accepted', { plan, phase: 'replan' });
      idx = 0;
      continue;
    }
    planExecuted();
    return `step-red:${step.id}`;
  }

  // ── 4. THE CLOSE — the operator's signed command, the only truth. Red →
  // the gap feeds ONE bounded fix loop judged by the REAL close (v1.12 §4);
  // still red → the escalation ralph already emitted stands.
  const post = runClose(closeArgv, scrub, closeOpts);
  emit('outer-close', { ...post });
  if (post.verdict === 'satisfied') {
    planExecuted();
    return 'green';
  }
  const postFault = Object.hasOwn(CLOSE_FAULTS, post.verdict) ? CLOSE_FAULTS[post.verdict] : undefined;
  if (postFault) {
    emit('escalation', { category: postFault.category, decisionReady: true, decision: postFault.decision, options: postFault.options, detail: post.detail });
    planExecuted();
    return 'close-red';
  }
  emit('fix-loop', { gapBytes: Buffer.byteLength(post.gap ?? '') });
  let fixOutcome;
  try {
    const w = await mkWorker({ granted: ceiling, phase: 'fix', attemptRounds: maxStepRounds, attempts: capRuns, writable: true });
    /** @param {number} iteration @param {string} [gap] */
    const middle = async (iteration, gap) => {
      w.setIteration(iteration);
      await w.ask([
        'The job\'s final verification is failing. Fix the repository so it passes.',
        `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root.`,
        artifacts.length > 0 && `Working context (read-only) — the plan's steps produced:\n${artifacts.map((a) => `[${a.id}] ${a.text}`).join('\n\n')}`,
        !gap && post.gap && `The verification's output on the tree as it stands (not an attempt of yours):\n${post.gap}`,
        gap && `Previous attempt failed the verification:\n${gap}`,
      ].filter(Boolean).join('\n\n'));
    };
    fixOutcome = await ralph({
      middle, close: closeArgv, capRuns, emit: emitL, redact: scrub,
      closeTimeoutMs, cwd: workdir, expect: job.close.expect, judged: job.close.judged, gapKeep: job.close.gapKeep,
      workerWrites: w.workerWrites,
    });
  } catch (e) {
    planExecuted();
    return relay(e, 'fix');
  }
  planExecuted();
  return fixOutcome === 'green' ? 'green' : 'escalated';
}
