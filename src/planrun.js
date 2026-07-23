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
/**
 * NATIVE-ONLY read cap (F48/BA-16). On the clipipe-subscription surface the claude CLI
 * TRUNCATES a large tool result before the model ever sees it (~40-50KB / ~line 550,
 * measured), spilling the remainder to a `~/.claude/.../tool-results/` file the fence denies
 * AND wrapping it in a "read this in chunks" notice the model correctly distrusts as prompt
 * injection — so a whole-file `shell_read` of a large file blinds the worker (0-write stall,
 * F48). We bound OUR read result below the CLI cap and hand back a TRUSTED notice steering to
 * `ctx_get` (ranged retrieval survives the cap: one function per fetch). API path is untouched
 * — there the full result rides straight into context, so no cap and RETRIEVAL_STRATEGY alone.
 */
const NATIVE_READ_CAP = 24 * 1024;
/** native-only strategy: tell the worker WHY whole-file reads fail here and to navigate by symbol */
const NATIVE_READ_STRATEGY = '\nINTERFACE LIMIT: on this surface a whole-file read of a large file is TRUNCATED before you see it — a shell_read of a file over ~24KB returns only its start followed by a truncation notice. This is NOT the whole file. To read a function IN FULL, always use ctx_recall(<symbol>) then ctx_get(<pointer>) — that returns the entire function no matter how large the file is. To locate a line, use shell_grep(<pattern>). Never try to understand a file over ~400 lines by reading it whole; recall its symbols instead.';
/** feed-forward artifact bound per step (prompt ingredient, spine-bound) */
const ARTIFACT_MAX = 2000;
/** the wallet floor below which a replan is a stop, not an adaptation (review
 * #5): a money-gate halt drains the wallet to ~0, so replanning against dust
 * just burns another draft and mislabels the money-cut as "exits still red"
 * (F45 class) — the honest terminal there is cap-halt. */
const MONEY_MIN = 0.001;

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
 * @param {any} opts.provider shell-owned LLM binding (the Loop path — `anthropic-api`)
 * @param {(o: {policy: Function, onTurn?: Function, maxTurns: number, hasTools: boolean}) => any} [opts.nativeProvider]
 *   NATIVE clipipe factory (BA-16): required when `job.provider === 'clipipe-subscription'`.
 *   The runner builds a FRESH provider per worker and picks the mode by `hasTools`:
 *   `true` → native tool mode (`toolProtocol:'claude-mcp'`, wire `policy`+`onTurn`+`maxTurns`);
 *   `false` → the drafter has no tools, so a native session would report NO cost — return a
 *   metered claude-json TEXT provider (`--output-format json`, `parse:'claude-json'`) instead,
 *   so its spend is never invisible. The Loop path (`anthropic-api`) never touches this.
 * @param {(type: string, data?: object) => object} opts.emit spine emitter (the caller's METERED emit)
 * @param {() => number} opts.remainingUsd the one wallet: what is left of the signed budget right now
 * @param {() => boolean} [opts.isUnpriced] has any round come back with a null cost? (F6) — the
 *   plan flow bails IN-FLIGHT on the first unpriced round instead of burning the whole plan
 * @param {number} [opts.capRuns] shell-owned per-step attempt cap
 * @param {number} [opts.closeTimeoutMs] close/check wall-clock cap (shell territory)
 * @param {number} [opts.maxStepRounds] the shell's per-step rounds ceiling (validatePlan's bound)
 * @returns {Promise<string>} 'green' | 'already-green' | 'escalated' | 'plan-red' |
 *   'check-red' | 'close-red' | 'close-unsupported' | 'pricing-red' | 'cap-halt' |
 *   'provider-red' | 'interpreter-red' | `step-red:<id>`
 */
export async function runPlan(job, { workdir, provider, nativeProvider, emit, remainingUsd, isUnpriced = () => false, capRuns = 3, closeTimeoutMs, maxStepRounds = 40 }) {
  workdir = resolve(workdir);
  const scrub = (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS });

  // Which worker surface? `clipipe-subscription` drives tools NATIVELY (the CLI
  // owns the turn cycle, BA-16); every other provider runs the Loop. The close,
  // the checks, and the exit evaluator are provider-independent (commands and
  // form checks) — ONLY the worker differs, so the whole plan flow is shared.
  const native = job.provider === 'clipipe-subscription';

  // ── close-unsupported (F17 guard, mirrored from the legacy path at run.js):
  // the plan flow executes a PREDICATE close only — a command whose exit code is
  // truth. validateJob admits a GOLD close under verdictType green (gold is
  // hard-class), and a gold close carries no `cmd`; running `close.cmd.trim()`
  // on it would TypeError out of runJob with NO job-end (the spine would dangle,
  // no spend recorded). Refuse a non-predicate close cleanly, before any tokens.
  if (job.close.type !== 'predicate') {
    emit('escalation', {
      category: 'close-unsupported', decisionReady: true,
      decision: `The job's close is a ${job.close.type} close — the plan flow executes a predicate close only (a command whose exit code is truth).`,
      options: ['restate the close as a predicate', 'wait for the verdict-classes rung'],
    });
    return 'close-unsupported';
  }

  // ── native wiring: a clipipe-subscription job needs the native provider
  // FACTORY (native governance is constructor-time + per-worker, so the runner
  // cannot reuse one injected instance). A missing factory is an adopter wiring
  // gap, never a silent fall-back to the Loop path (that would run a
  // subscription job on the metered API — the wrong bill on the wrong surface).
  if (native && typeof nativeProvider !== 'function') {
    emit('escalation', {
      category: 'interpreter-red', decisionReady: true,
      decision: 'This job declares provider clipipe-subscription (native tool mode), but no native provider factory was wired into the runner.',
      options: ['wire a native CLIPipeProvider factory (opts.nativeProvider)', 'change the job provider to a Loop-driven one'],
    });
    return 'interpreter-red';
  }

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
    const grantedNames = new Set(granted.map((v) => /** @type {Record<string, string>} */ (TOOL_BY_VERB)[v]));
    const shell = createShellTools().tools.filter((/** @type {{name: string}} */ t) => grantedNames.has(t.name));
    // F48: on native, bound shell_read below the CLI's tool-result display cap and hand back a
    // TRUSTED truncation notice steering to ctx_get — the CLI's own truncation blinds the worker
    // (spilled + injection-flagged). Fresh tool objects per mkWorker call, so mutating is per-worker.
    if (native) {
      const rd = shell.find((/** @type {{name: string}} */ t) => t.name === TOOL_BY_VERB.read);
      if (rd) {
        const inner = rd.execute;
        rd.execute = async (/** @type {any} */ args) => {
          const r = await inner(args);
          if (typeof r === 'string' && Buffer.byteLength(r, 'utf8') > NATIVE_READ_CAP) {
            const head = Buffer.from(r, 'utf8').subarray(0, NATIVE_READ_CAP).toString('utf8');
            return head + `\n\n[bareloop: file truncated at ${NATIVE_READ_CAP} bytes — this interface will not display more of a single read. To read a specific function IN FULL use ctx_recall(<symbol>) then ctx_get(<pointer>); to find a line use shell_grep(<pattern>).]`;
          }
          return r;
        };
      }
    }
    const ctx = [...CTX_TOOLS].some((t) => grantedNames.has(t))
      ? createCtxTools(lc, workdir, emit).filter((t) => grantedNames.has(t.name))
      : [];
    if (ctx.length) await lc.index();
    const toolDefs = [...shell, ...ctx];
    const system = PERSONA_TOOLS + (granted.includes('edit') ? EDIT_STRATEGY : '') + (ctx.length ? RETRIEVAL_STRATEGY : '')
      + (native && grantedNames.has(TOOL_BY_VERB.read) ? NATIVE_READ_STRATEGY : '');
    /** @param {any} u @returns {{inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheCreationTokens: number}} */
    const usageOf = (u) => ({ inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0, cacheReadTokens: u?.cacheReadTokens ?? 0, cacheCreationTokens: u?.cacheCreationTokens ?? 0 });

    if (native && toolDefs.length > 0) {
      // ── NATIVE clipipe TOOL session (BA-16): the CLI owns the turn cycle, so
      // the arbiter clips onto the PROVIDER — policy (the SAME wireGate fence,
      // proven to deny out-of-scope), onTurn (metering), maxTurns (the
      // per-session round bound). Money is null per turn and AUTHORITATIVE at
      // session close (the round-level F12 figure the CLI does not expose; the
      // session total is honest — the per-session reconciliation). Only workers
      // WITH tools take this path: a native session with NO tools fires no
      // onTurn and reports no cost (live-verified), so the toolless drafter runs
      // the metered claude-json TEXT path below instead (never unmetered spend).
      /** @param {{costUsd?: number|null, pricing?: string|null, usage?: any, kind?: string}} arg */
      const nativeMetered = async (arg) => {
        const session = (arg?.kind ?? 'turn') === 'session';
        // per-turn events are ATTRIBUTION ONLY (`worker-turn`, never accounted —
        // a native turn's cost is null BY DESIGN and F6 must not read it as
        // unpriced); the session-close event carries the authoritative cost and
        // IS the one accounted `worker-round` the ledger sums (F12 at the surface
        // the CLI actually meters).
        emit(session ? 'worker-round' : 'worker-turn', {
          phase, iteration: roundIteration, kind: arg?.kind ?? 'turn',
          costUsd: session ? (arg?.costUsd ?? null) : null, pricing: arg?.pricing ?? null,
          tokens: (arg?.usage?.inputTokens ?? 0) + (arg?.usage?.outputTokens ?? 0),
          usage: usageOf(arg?.usage),
        });
        return onLlmResult(arg);
      };
      const provider2 = /** @type {any} */ (nativeProvider)({ policy, onTurn: nativeMetered, maxTurns: attemptRounds, hasTools: true });
      const loop = new Loop({ provider: provider2, system }); // no Loop policy / no cacheMessages: the CLI owns the transcript
      /** @param {string} prompt @param {typeof toolDefs} [defs] */
      const ask = async (prompt, defs = toolDefs) => {
        let r;
        try {
          r = await loop.run([{ role: 'user', content: prompt }], defs, { maxTokens: 32000 });
        } catch (e) {
          const err = /** @type {CategorizedError} */ (e);
          err.category = e instanceof HaltError ? 'cap-halt' : (err.category ?? 'provider-red');
          throw err;
        }
        // a maxTurns session is a BOUNDED attempt, not an escalation — the same
        // role loop.stop() plays on the Loop path: judge the partial work and
        // feed the gap forward (the CLI preserves lastText, BA-5).
        if (r.error === 'max_turns') {
          attemptBounded = roundIteration;
          emit('attempt-bounded', { phase, iteration: roundIteration, cap: attemptRounds, native: true });
          return r;
        }
        if (r.error) {
          const err = /** @type {CategorizedError} */ (new Error(`native session: ${r.error}`));
          // halt → cap-halt, denial streak → gate-red; a bridge/session terminal
          // (bridge-failed, session_timeout, session:*) is provider-owned transport
          err.category = r.error.startsWith('halt:') ? 'cap-halt'
            : r.error.startsWith('denied:') ? 'gate-red'
            : 'provider-red';
          err.lib = 'bare-agent';
          throw err;
        }
        return r;
      };
      return { ask, workerWrites, setIteration: (/** @type {number|string} */ i) => { roundIteration = i; roundsThisAttempt = 0; }, wasBounded: () => attemptBounded };
    }

    // ── LOOP path: the injected provider (anthropic-api and every other
    // Loop-driven binding), OR — for a native worker with NO tools (the plan
    // drafter) — a claude-json structured-output CLIPipe from the factory. Native
    // tool mode cannot meter a toolless session (no onTurn, no cost); the
    // claude-json TEXT path reports a real per-call cost that the Loop's
    // onLlmResult meters exactly like an API round, so the drafter's spend is
    // never invisible (F6/F44). The gate policy is wired but idle (no tools).
    const loopProvider = native
      ? /** @type {any} */ (nativeProvider)({ policy, maxTurns: attemptRounds * (attempts + 1), hasTools: false })
      : provider;
    /** @param {{costUsd?: number|null, pricing?: string|null, usage?: any, kind?: string}} arg */
    const metered = async (arg) => {
      emit('worker-round', {
        phase, iteration: roundIteration, kind: arg?.kind ?? 'turn',
        costUsd: arg?.costUsd ?? null, pricing: arg?.pricing ?? null,
        tokens: (arg?.usage?.inputTokens ?? 0) + (arg?.usage?.outputTokens ?? 0),
        usage: usageOf(arg?.usage),
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
    const loop = new Loop({ provider: loopProvider, system, policy, onLlmResult: metered });
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
  // F6 in-flight: an unpriced round means the cap cannot govern spend it cannot
  // see — halt at the boundary rather than run the whole plan blind (the caller
  // emits pricing-red; runPlan just stops burning tokens). Legacy halts per-step.
  if (isUnpriced()) return 'pricing-red';

  // ── 2. PLAN — the decompose call; the planner NEVER sees the repo (no tools,
  // scout blob only — what keeps the plan a plan and not a second worker).
  // One shot + one redraft with the reds fed back (the drafting precedent).
  /** draft + validate with one redraft; emits plan-validate per phase. The
   * drafter is built FRESH per call (review #4): its Gate budget snapshots the
   * CURRENT wallet, never a stale pre-execute allocation. A replan draft after
   * the steps have spent is therefore bounded by what is ACTUALLY left, so the
   * total run spend can never exceed the signed budget (advertised == enforced,
   * the hard line) — a drafter built once at full budget would let the replan
   * draft spend against money the steps had already consumed.
   * @param {string} phase @param {string|null} failure */
  const obtainPlan = async (phase, failure) => {
    const drafter = await mkWorker({ granted: [], phase: 'plan', attemptRounds: 2, attempts: 3, writable: false });
    const draftPlan = async (/** @type {any[]|null} */ reds) => {
      drafter.setIteration(reds ? 'redraft' : 'draft');
      const r = await drafter.ask(planPrompt(job, scoutBlob, reds, maxStepRounds, failure), []);
      return extractArtifact(r.text).code ?? '';
    };
    let text = await draftPlan(null);
    let pv = validatePlan(text, { job, maxStepRounds });
    emit('plan-validate', { ok: pv.ok, reds: pv.reds, phase: `${phase}-1` });
    if (!pv.ok) {
      text = await draftPlan(pv.reds);
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
  if (isUnpriced()) return 'pricing-red'; // F6: the plan drafting round came back unpriced — halt before steps

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
      // Reachable ONLY by mkWorker/gate/index SETUP faults: ralph catches middle
      // throws and returns 'escalated', so a provider throw never reaches here.
      // An uncategorized setup fault is interpreter-red (broken infra), never
      // relay's provider-red default — and the RECORDED outcome must match the
      // escalation the human reads (review #6, F11 misfiling: a spine that says
      // interpreter-red while the escalation says provider-red is two
      // instruments disagreeing about the same event).
      const err = /** @type {CategorizedError} */ (e);
      const category = err instanceof HaltError ? 'cap-halt' : (typeof err.category === 'string' ? err.category : 'interpreter-red');
      stepOutcomes.push({ id: step.id, outcome: category });
      if (category === 'cap-halt') emit('cap-halt', { category, meaning: 'not under cap — not "can\'t"', detail: String(err?.message ?? err) });
      emit('escalation', {
        category, decisionReady: true, phase: `step:${step.id}`,
        decision: category === 'cap-halt'
          ? `The budget gate tripped while building step "${step.id}" — the wallet cannot fund the plan flow.`
          : `Step "${step.id}" could not be set up (${category}) — the worker, gate, or index failed before the step ran.`,
        options: category === 'cap-halt' ? ['raise the job budget and rerun', 'abandon the run'] : ['fix the interpreter/environment', 'retry the run', 'abandon the run'],
        detail: String(err?.message ?? err),
        ...(typeof err?.lib === 'string' ? { lib: err.lib } : {}),
      });
      planExecuted();
      return category;
    }
    stepOutcomes.push({ id: step.id, outcome: res.outcome });
    emit('step-end', { step: step.id, outcome: res.outcome });
    if (isUnpriced()) { planExecuted(); return 'pricing-red'; } // F6: a step round came back unpriced — halt before the next
    if (res.outcome === 'green') {
      artifacts.push({ id: step.id, text: res.artifact });
      idx += 1;
      continue;
    }
    // ONE replan, and only for EXHAUSTION with FUNDS LEFT (review #5): ralph
    // emits cap-halt for BOTH attempt-exhaustion AND a money-gate halt
    // mid-attempt — but a drained wallet is a stop, not an adaptation. A
    // money-gate halt necessarily drained the wallet (the worker's cap WAS the
    // whole remaining wallet), so replanning against it burns another draft and
    // mislabels the money-cut as "exits still red" (F45 class); attempt-
    // exhaustion leaves money on the table. An instrument/governance stop that
    // is not cap-halt never replans either.
    if (!replanned && lastEscalation?.category === 'cap-halt' && !isUnpriced() && remainingUsd() > MONEY_MIN) {
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
    // A money-gate halt (wallet drained or unpriced) is an honest cap-halt
    // terminal, never a step-red: the exits never ran because the money ran out,
    // not because the work failed. Attempt-exhaustion WITH funds after the one
    // replan is spent stays a step-red (the stop is a result).
    if (lastEscalation?.category === 'cap-halt' && (isUnpriced() || remainingUsd() <= MONEY_MIN)) {
      planExecuted();
      return 'cap-halt';
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
