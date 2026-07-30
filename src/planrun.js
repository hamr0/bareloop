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
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { Gate, redact } from 'bareguard';
import { LiteCtx } from 'litectx';
import { runClose, runStages, ralph, CLOSE_FAULTS } from './ralph.js';
import { validatePlan, legalScopes, stageClose } from './plan.js';
import { WRITE_VERBS, EXIT_TYPES, MAX_EXITS_PER_STEP, MAX_PLAN_STEPS, MAX_SCOPE_MENU, STEP_MODELS } from './plan.js';
import { snapshotScope, evalExits } from './exits.js';
import { createRoot } from './root.js';
import { createStallWatch, STALL_MS, MAX_STALLS } from './stall.js';
import { TOOL_MENU, STORE_VERBS, checkMenu } from './job.js';
import { TOOL_BY_VERB, CTX_TOOLS, createCtxTools, toolAction, PERSONA_TOOLS, RETRIEVAL_STRATEGY, EDIT_STRATEGY, COMPONENT_STRATEGIES } from './tools.js';
import { globToPrefix, SECRET_PATTERNS } from './validate.js';
import { extractArtifact } from './text.js';
import { createClock, isWallTimeout } from './clock.js';

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
/** F59 — below this a scout survey is treated as absent. Sized off the archive, not
 * taste: the 15 truncated scouts produced 0/74/86 bytes; every real survey was
 * 5991-8056. 200 sits between the two populations with an order of magnitude of
 * daylight on each side, so it cannot be a tuned-to-one-case threshold. */
const SCOUT_MIN_BYTES = 200;
/** feed-forward artifact bound per step (prompt ingredient, spine-bound) */
const ARTIFACT_MAX = 2000;
/** the wallet floor below which a replan is a stop, not an adaptation (review
 * #5): a money-gate halt drains the wallet to ~0, so replanning against dust
 * just burns another draft and mislabels the money-cut as "exits still red"
 * (F45 class) — the honest terminal there is cap-halt. */
const MONEY_MIN = 0.001;
/**
 * A (PRD v1.27; design record §3.4, answered §6.2) — the replan trigger. A step
 * that has consumed this share of the run's REMAINING money or time with its exits
 * still red gets no further attempt; the planner re-allocates what is left instead.
 *
 * 50% is hamr's number (*"50% is fine"*), and it was **re-confirmed with its own
 * inertness on the table**: F63 replayed 18 archived spines / 54 steps / 101 judged
 * attempts and found it would have fired 0 times (near misses 0.35 · 0.35 · 0.40 ·
 * 0.45). Shown that, hamr's call was *"keep 0.5"* (2026-07-26).
 *
 * So this is a GUARD against a step that eats the run, deliberately set above the
 * observed population rather than tuned to it — lowering it to 0.35 because that is
 * where those four points sit would be fitting the number to the data (the standing
 * no-fit-to-pass rule), and threshold-setting is arbiter territory either way. It
 * has not hardened by surviving unexamined; it survived being examined.
 *
 * This changes the replan TRIGGER only. The hard ceiling of ONE replan is
 * unchanged — unlimited replanning launders thrash as adaptation (v1.12).
 */
const VARIANCE_THRESHOLD = 0.5;

/** @typedef {Error & {category?: string, lib?: string}} CategorizedError */

/**
 * The materials block: what the run has to spend, as a BALANCE and nothing else.
 *
 * hamr's correction (design record addendum 2, verbatim): *"why would you tell it
 * every round that you have x time per round? what if there is a heavier round?
 * why don't you tell it same like cost, you have x left from cost/time instead of
 * making it race against time?"*
 *
 * So: NO rate, NO per-round allowance, NO derived round count. F57 measured a 150x
 * spread on the verification gaps (3.8s to 561s), so a per-round constant
 * describes almost no real round — a heavy round would break the planner's
 * arithmetic with nothing to tell it. A balance is self-correcting: after a heavy
 * round the number is simply lower. A rate is also a stopwatch, and racing a clock
 * is the rush-or-fake incentive the v1.12 §5 prompt contract exists to remove.
 *
 * At DRAFT the balance is the total, so this is scale only — the planner is NOT
 * asked to allocate time, because sizing time at draft requires the rate that was
 * just removed. A plan that does not fit is what the meter is for (addendum 2).
 * @param {{ balanceUsd?: number|null, remainingMs?: number|null, progress?: string }} [m]
 */
function materialsBlock(m) {
  if (!m) return '';
  const lines = [];
  if (typeof m.balanceUsd === 'number') lines.push(`- money left for the whole run: $${m.balanceUsd.toFixed(2)}`);
  if (typeof m.remainingMs === 'number') lines.push(`- time left for the whole run: ${Math.round(m.remainingMs / 60_000)} minutes`);
  if (!lines.length) return '';
  // The progress line only exists at REPLAN: it is the variance the meter read,
  // and it is the adaptation channel (addendum 2). At draft there is no progress.
  if (m.progress) lines.push(`- where the run got to: ${m.progress}`);
  return `\nWhat this run has left to spend — plan within it:\n${lines.join('\n')}\nThese are totals for the run, not per-step allowances. Nothing here is a rate: a step's cost depends on what it does.\n`;
}

/**
 * The plan-drafting prompt: a schema DESCRIPTION built from the live validator
 * menus — never a copyable example (the drafter must author, not echo; the
 * run.js draftPrompt precedent). Check NAMES only: a check's command is
 * arbiter territory the planner never sees.
 * @param {any} job @param {string} scoutBlob @param {any[]|null} reds
 * @param {number} maxStepRounds @param {string|null} failure replan context
 * @param {string[]|undefined} scopes the offered `tree-changed` menu (`legalScopes`).
 *   Choose-don't-describe (§4): the agent picks a value, never authors a glob and
 *   guesses its shape. Omitted, it derives from the signed fence — the SAME
 *   fail-closed derivation `validatePlan` uses, so prompt and validator can never
 *   disagree about what was offered.
 * @param {{ balanceUsd?: number|null, remainingMs?: number|null, progress?: string }} [materials]
 *   what the run has LEFT (T/A). Omitted → no materials block at all, which is the
 *   pre-T behaviour and keeps every existing caller byte-identical.
 */
export function planPrompt(job, scoutBlob, reds, maxStepRounds, failure, scopes, materials) {
  const scopeMenu = Array.isArray(scopes) && scopes.length ? scopes : legalScopes(job.writeScope ?? []);
  const ceiling = Array.isArray(job.tools) ? job.tools : [...TOOL_MENU];
  // W4: the menu comes off the STAGED close — the same one derivation `runPlan`
  // executes and `validatePlan` accepts against. Reading `job.close` raw here left
  // the legacy object form offering nothing while the runner preflighted a stage.
  // (`?? []`: a close naming no command stages nothing, so it offers nothing)
  const checkNames = checkMenu(stageClose(job.close) ?? []).map((m) => m.name);
  const doc = `DRAFT-PLAN
You are planning how to accomplish a goal in a repository, as an ordered list of bounded
steps (schema "plan-v1"). The plan is pure declarative JSON validated by a strict schema;
ANY unknown field, wrong enum value, or out-of-bounds number is rejected. Output ONLY the
JSON object, no fences, no commentary.

Shape: { "schema": "plan-v1", "steps": [ ... 1..${MAX_PLAN_STEPS} steps ... ] } — steps run
strictly in array order. Each step (no other fields exist):
- "id": kebab-case slug, unique
- "action": the step's task, precise enough for a worker that sees ONLY this step
- "tools": non-empty unique subset of ${JSON.stringify(ceiling)} (write/edit change the tree; recall/get/impact/related/recent search and navigate the repository index; compress/peek read cheaply; stash/remember/forget park and record notes across steps)
- "rounds": integer 1..${maxStepRounds} — the step's per-attempt tool-round bound
- "target": the step's deliverable path (REQUIRED when tools include write/edit), inside ${JSON.stringify(job.writeScope)}
- "model" (optional): ${STEP_MODELS.join(' | ')} — a cheaper tier for mechanical steps; omit for the default
- "attempts" (optional): integer — TIGHTEN this step's retry cap below the shell's; you may never raise it
- "scope" (optional): narrow this step's WRITE fence — copy one value from the offered scopes below
- "exit": 1..${MAX_EXITS_PER_STEP} form checks that ALL must pass (AND), each one of:
    {"type":"artifact-written","path":"...","pattern":"optional regex"}
    {"type":"tree-changed","scope":"<copy one value from the offered scopes below>"}
    {"type":"json-valid","path":"..."}
    {"type":"check-passes","name":"one of ${JSON.stringify(checkNames)}"}
  A check-passes on a write-granted step MUST be paired with a tree-changed exit
  (the repository starts green — a lone check would pass on the untouched tree).
  A check-passes may ONLY appear on a step whose tools include write or edit: a
  failing check is reported back to THAT step's worker for another attempt, so
  the step must be able to act on the report. Do not plan a separate read-only
  "verify" step — attach the check to the step that does the fixing; the final
  verification after your plan is not yours to author.
  Reference checks by NAME only; you cannot author or modify one.

Offered "scope" values for tree-changed — copy ONE of these exactly, character for
character. No other value is accepted, and patterns of your own (like "src/*.js")
are not accepted:
${scopeMenu.map((s) => `  ${JSON.stringify(s)}`).join('\n')}

Goal:
${job.goal}
${materialsBlock(materials)}
Repository survey (from a read-only scout):
${scoutBlob || '(no scout notes)'}`;
  let p = doc;
  if (failure) p += `\n\nWhat happened when the previous plan ran:\n${failure}\nPlan differently — a repeat of the same steps will fail the same way.`;
  if (reds) p += `\n\nYour previous plan was REJECTED with these reds (code:path):\n${JSON.stringify(reds)}\nFix every red. Output ONLY the corrected JSON object.`;
  return p;
}

/**
 * Execute a validateJob-GREEN plan-shape job (goal/verdictType/close).
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
 * @param {(tier: string) => any} [opts.providerFor] P: per-step model-tier factory
 *   (tier ∈ STEP_MODELS → a provider). A plan naming a tier with no factory supplied is an
 *   interpreter-red STOP — never silently run the default tier as if the choice was honoured.
 * @param {number} [opts.capRuns] shell-owned per-step attempt cap
 * @param {number} [opts.closeTimeoutMs] close/check wall-clock cap (shell territory)
 * @param {number} [opts.maxStepRounds] the shell's per-step rounds ceiling (validatePlan's bound)
 * @param {number} [opts.scoutRounds] the read-only survey's round bound (F59: the LAST round is
 *   reserved — a scout that spends every round on tools gets one toolless round to write its
 *   survey, because the bound halts it mid-tool-use and text is its only deliverable)
 * @param {boolean} [opts.layerRoot=false] Layer R — the within-run ratchet (src/root.js),
 *   scoped PER STEP's ralph loop (each micro-wheel is the Layer-1 atom). Shell-assembled from
 *   the step's own books: per-attempt write-sets from the F32 workerWrites audit (teed for
 *   same-path rewrites, which the cumulative audit alone cannot see) and the red-set from the
 *   exit evaluator's own gap. Defaults OFF (decided 2026-07-21, F41): fixation is extinct on
 *   every current job, so ON has never won its A/B; `true` is the ON/experimental arm, and the
 *   first plan-flow job to emit `root-injected` runs the pre-registered ON-vs-OFF acceptance
 *   read (the Layer R default-flip, LAYERS.md ⚠). Excluded on native (clipipe): the native
 *   worker has no onToolResult seam, so the tee cannot settle and same-path rewrites are blind.
 * @param {() => number} [opts.now] the wall clock's time source, injected. The real clock is the
 *   default; a caller supplies this to drive time deterministically (the same seam `createClock`
 *   already exposes — a run's terminal cannot otherwise be exercised without waiting out a cap
 *   whose floor is one close timeout).
 * @returns {Promise<string>} 'green' | 'already-green' | 'escalated' | 'plan-red' |
 *   'check-red' | 'close-red' | 'close-unsupported' | 'pricing-red' | 'cap-halt' |
 *   'wall-halt' | 'provider-red' | 'interpreter-red' | 'step-stalled' | `step-red:<id>`
 */
export async function runPlan(job, { workdir, provider, nativeProvider, providerFor, emit, remainingUsd, isUnpriced = () => false, capRuns = 3, closeTimeoutMs, maxStepRounds = 40, layerRoot = false, scoutRounds = SCOUT_ROUNDS, now }) {
  workdir = resolve(workdir);
  const scrub = (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS });
  // The ctx verbs' spine channel, scrubbed at the WIRING. Every field a ctx-tool
  // event carries is MODEL-CHOSEN text — a recall query, a stash id, a symbol, a
  // path the worker spelled — and the spine is append-only: a log that captures a
  // key captures it forever. Scrubbing the emitter (once, at construction) rather
  // than the seventeen call sites is what makes the leak inexpressible: a new ctx
  // verb cannot forget it. Same ONE inventory (SECRET_PATTERNS) the close output
  // is scrubbed with — never a second spelling of what a secret looks like.
  // Shallow by shape: the events are flat records of strings, string arrays
  // (`paths`) and numbers, and numbers pass through untouched.
  const emitCtx = (/** @type {string} */ type, /** @type {any} */ data) => emit(type, Object.fromEntries(
    Object.entries(data ?? {}).map(([k, v]) => [k, typeof v === 'string' ? scrub(v)
      : (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? scrub(x) : x)) : v)]),
  ));

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
  // A STAGED close (PRD v1.28) is an ordered list of command stages and is the
  // go-forward shape; the object form survives only for the declared-but-locked
  // verdict classes (gold/rubric/hitl), which name no command to run.
  // W4: the staging itself lives in ONE place (`stageClose`), shared with
  // `planPrompt` and `validatePlan` — a second copy here is exactly how the
  // runner came to execute a stage neither of the other two could see.
  const stagedClose = stageClose(job.close);
  if (!stagedClose) {
    emit('escalation', {
      category: 'close-unsupported', decisionReady: true,
      decision: `The job's close is a ${job.close.type} close — the plan flow executes commands whose exit codes are truth (a staged close, or a single predicate).`,
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

  // T (PRD v1.27/v1.29) — the run's wall clock, STARTED HERE, before the close
  // precheck. The precheck is real wall time and F62 measured close/check gaps as
  // high as 328s on an archived run: a clock created after it would under-report
  // elapsed by that much and hand the planner a balance the run does not have. Time
  // the operator's own instruments too, or the budget is measured against a
  // different run than the one that happened.
  //
  // `job.maxWallMs` is operator input with budgetUsd's status and has NO DEFAULT
  // (hamr's ruling): absent means honestly time-unbounded, and the record says so
  // rather than leaving a reader to infer it. Both numbers are reported — addendum 1
  // measured that a deadline is only readable BETWEEN rounds, so enforcement is
  // requested + the close's own worst case and quoting one number would be F6 in a
  // time coat.
  //
  // W5 — that worst case is per STAGE. `runStages` hands each stage the full
  // `closeTimeoutMs`, so a run whose deadline trips just before a 4-stage close can
  // overshoot by four of them, and the clock is told the count rather than assuming
  // one. `stagedClose` is the SAME staging the runner executes (never a second
  // count), and it is non-null here by the close-unsupported guard above — a close
  // that names no command escalated before this line, so there is no null to thread.
  const clock = createClock({ maxWallMs: job.maxWallMs ?? null, closeStages: stagedClose.length, ...(now ? { now } : {}) });
  const closeTimeoutForReport = closeTimeoutMs ?? 120_000;
  emit('wall-clock', {
    ...clock.report(closeTimeoutForReport),
    meaning: clock.bounded
      ? 'a between-round deadline; a close already in flight when it trips runs to completion'
      : 'NO time cap was set — time-unbounded by explicit operator choice, never by a default',
  });

  /**
   * F64 — ONE categoriser for a throw out of a provider call, so the seams cannot
   * drift. A `HaltError` is the budget gate. The run's OWN deadline coming back as
   * bare-agent's `TimeoutError` (`callTimeoutMs()` is derived from the wall) is a
   * GOVERNANCE stop and rides out as `wall-halt` — filing it `provider-red` would
   * discard the row as a casualty (never evidence, F45/F48) and hand the human a
   * transport-debugging option list for a run that simply ran out of time. A
   * thrower that named its own category keeps it (the standing typed-attribution
   * rule); only an UNNAMED throw is classified here.
   * @param {any} e
   * @returns {{ err: CategorizedError, category: string }} the same throw, stamped,
   *   plus the category as a plain string (so a caller reading it never has to
   *   re-widen an optional field back to a value)
   */
  const categorize = (e) => {
    const err = /** @type {CategorizedError} */ (e);
    const category = e instanceof HaltError ? 'cap-halt'
      : (err.category ?? (isWallTimeout(err, clock) ? 'wall-halt' : 'provider-red'));
    err.category = category;
    return { err, category };
  };

  /** the run-level TIME record, one shape wherever the wall stops the run.
   * `cutMidCall` splits the two readings: `true` = the deadline landed INSIDE a
   * provider call (F64, seen as its timeout), `false` = read between steps, the
   * ordinary path. Both are the same stop; conflating them would hide which
   * instrument saw it. */
  const emitWallHalt = (/** @type {object} */ extra) => emit('wall-halt', {
    ...clock.report(closeTimeoutForReport),
    meaning: 'not under cap — not "can\'t"',
    cutMidCall: false,
    ...extra,
  });
  const WALL_OPTIONS = ['raise maxWallMs and rerun (resume-to-cap: the stop is the checkpoint)', 'abandon the run'];

  const closeOpts = { timeoutMs: closeTimeoutMs, cwd: workdir };
  /** @type {string|undefined} the stage that rendered the LAST close verdict (Layer R's red-set source) */
  let closeStage;
  /** the close, as ONE verdict: every stage in order, first red wins */
  const judgeClose = async () => {
    const v = await runStages(stagedClose, scrub, closeOpts);
    closeStage = v.stage;
    return v;
  };

  // ── 0a. close precheck (close-first, F17): already-green is a DISTINCT
  // record, zero tokens; a forbidden-zone verdict escalates before any spend
  const pre = await judgeClose();
  emit('close-precheck', { ...pre });
  if (pre.verdict === 'satisfied') return 'already-green';
  const preFault = Object.hasOwn(CLOSE_FAULTS, pre.verdict) ? CLOSE_FAULTS[pre.verdict] : undefined;
  if (preFault) {
    emit('escalation', { category: preFault.category, decisionReady: true, decision: preFault.decision, options: preFault.options, detail: pre.detail });
    return 'close-red';
  }

  // ── 0b. check preflight ($0, deterministic): every OFFERABLE stage runs once
  // before tokens — an unrunnable ruler would fault mid-plan after real spend (a
  // frozen rule without a wired detector is prose; here the detector runs
  // first). Red and green are both fine: checks decide nothing and mint nothing.
  // The menu is DERIVED from the close (PRD v1.28) — nobody authored it, so the
  // ruler and the real inspection cannot drift apart.
  const menu = checkMenu(stagedClose);
  emit('check-menu', {
    offered: menu.map((m) => m.name),
    ...(menu.length < stagedClose.length
      ? { hidden: stagedClose.filter((s2) => s2.offer === false).map((s2) => s2.name), meaning: 'a stage that cannot stand alone as a ruler (a precondition) is not offered — a partial menu is acceptable, never a failure' }
      : {}),
  });
  for (const m of menu) {
    const v = await runStages(m.run, scrub, closeOpts);
    emit('check-preflight', { name: m.name, verdict: v.verdict, ...(m.run.length > 1 ? { chain: m.run.map((s2) => s2.name) } : {}) });
    const f = Object.hasOwn(CLOSE_FAULTS, v.verdict) ? CLOSE_FAULTS[v.verdict] : undefined;
    if (f) {
      emit('escalation', { category: f.category, decisionReady: true, decision: `Close stage "${m.name}" rendered no judgment at preflight — every plan referencing it would fault mid-run. ${f.decision}`, options: f.options, detail: `${m.name}: ${v.detail ?? ''}` });
      return 'check-red';
    }
  }

  const lc = new LiteCtx({ root: workdir });
  const ceiling = Array.isArray(job.tools) ? job.tools : [...TOOL_MENU];
  const fencePrefixes = job.writeScope.map((/** @type {string} */ g) => resolve(workdir, globToPrefix(g)));
  const auditPath = join(workdir, 'gate-audit.jsonl');
  const chainByName = new Map(menu.map((m) => [m.name, m.run]));
  // Choose-don't-describe (§4): the offered `tree-changed` scopes, enumerated from
  // the signed fence plus the directories that actually exist beneath it. ONE menu
  // object feeds both the drafting prompt and the validator, so what was offered
  // and what is accepted can never drift apart. Discovery is best-effort — a
  // missing or unreadable fence directory degrades to the signed entries alone
  // (which `snapshotScope` already handles as an empty snapshot), never a throw.
  const discoveredDirs = job.writeScope.flatMap((/** @type {string} */ g) => {
    const prefix = globToPrefix(g);
    try {
      return readdirSync(join(workdir, prefix), { recursive: true, withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => `${prefix}/${relative(join(workdir, prefix), join(d.parentPath ?? d.path, d.name))}`);
    } catch { return []; }
  });
  const scopeMenu = legalScopes(job.writeScope, discoveredDirs);
  // No silent caps: MAX_SCOPE_MENU can drop deep directories, and a menu that
  // reads as complete when it is not is the blind-instrument class. Report BOTH
  // counts so a truncation is visible in the record rather than inferred.
  const offerable = legalScopes(job.writeScope, discoveredDirs, Infinity).length;
  emit('scope-menu', {
    offered: scopeMenu,
    ...(offerable > scopeMenu.length
      ? { truncated: true, offerableCount: offerable, cap: MAX_SCOPE_MENU, meaning: 'deep directories were dropped from the menu; they remain reachable via a parent scope' }
      : { truncated: false }),
  });

  /** the check-passes seam evalExits delegates to: the FULL runClose machinery
   * per signed check; a forbidden-zone verdict rides out as `fault` by name so
   * the micro-loop escalates (or F32-routes a crash) instead of faking a gap */
  const runCheck = async (/** @type {string} */ name) => {
    const chain = chainByName.get(name);
    // UNREACHABLE through runPlan and deliberately kept: validatePlan reds
    // `check-unknown` against `checkMenu(spec.close)` — the SAME derivation that
    // built this map from the SAME close — so a name that got here was already
    // proven to be on the menu. Defence in depth against a future second
    // derivation, not a live path; the reachable guard is the validator's, and
    // that one is mutation-covered.
    if (!chain) return { pass: false, fault: 'failed', gap: `no offered close stage named "${name}"` };
    const v = await runStages(chain, scrub, closeOpts);
    emit('check-run', { name, verdict: v.verdict, ...(v.stage && v.stage !== name ? { stage: v.stage } : {}), ...(v.exitCode !== undefined ? { exitCode: v.exitCode } : {}) });
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
   * @param {{granted: string[], phase: string, attemptRounds: number, attempts: number, writable: boolean, root?: ReturnType<typeof createRoot>|null, fence?: string[]|null, workerProvider?: any}} o
   *   `root` (Layer R): when present, the worker's write-class actions are teed
   *   for the within-run ratchet — staged before the gate decides, discarded on
   *   deny/halt, settled to landed-or-not after execution (the two axes, F43/F7).
   *   Wired ONLY on the Loop path: the native session exposes no onToolResult seam.
   */
  async function mkWorker({ granted, phase, attemptRounds, attempts, writable, root = null, fence = null, workerProvider = null }) {
    const gate = new Gate({
      fs: {
        // P: a step's `scope` narrows the fence — the per-step prefixes are always a
        // SUBSET of the signed fence (validator: scope ∈ the same menu tree-changed
        // uses), so this can only tighten, never widen
        writeScope: writable ? (fence ?? fencePrefixes) : [],
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
    // Layer R tee (design record 2026-07-19; created per-step by executeStep).
    // The translator STAGES write/edit content and snapshots the pre-write hash
    // BEFORE the gate decides (Finding 6); the policy wrapper DISCARDS on a deny
    // or a halt (the tool never runs); onToolOutcome SETTLES landed-vs-not after
    // execution (Finding 7 — the gate's allow is intent, the file is outcome).
    // All no-ops when root is null: every scout/drafter and every native worker.
    const fileHash = (/** @type {string} */ p) => {
      try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; }
    };
    /** @type {{path: string, content: string, type: string, before: string|null}|null} the write-class action awaiting its OUTCOME */
    let pendingProbe = null;
    const teeingTranslator = (/** @type {string} */ n, /** @type {any} */ a) => {
      // classify by action TYPE, never a name list (the workerWrites filter uses
      // the same write|edit test — a third enumeration would let a future
      // write-class verb bypass the tee, the blind-instrument class)
      const act = toolAction(n, a, workdir);
      if (root && (act.type === 'write' || act.type === 'edit')) {
        const path = /** @type {string} */ (act.path);
        const content = String((act.type === 'edit' ? a?.newText : a?.content) ?? '');
        root.stageWrite(path, content); // content read off RAW args, never onto the action (the audit stays bytes-only)
        pendingProbe = { path, content, type: act.type, before: fileHash(path) };
      }
      return act;
    };
    const { policy: gatePolicy, onLlmResult } = wireGate(gate, { actionTranslator: teeingTranslator });
    // Settle the stage on the verdict. A DENY/HALT means the tool never runs, so
    // the outcome seam below never fires for it — discard here (an allow is NOT
    // settled here: the bytes are not written yet; settling on the verdict is the
    // exact Finding 7 defect). The catch RE-THROWS so cap-halt routing still reads
    // the throw. Non-write actions stage nothing, so both settlements are no-ops.
    const policy = root
      ? async (/** @type {string} */ n, /** @type {any} */ a, /** @type {any} */ c) => {
        try {
          const verdict = await gatePolicy(n, a, c);
          if (verdict !== true) { root.discardWrite(); pendingProbe = null; }
          return verdict;
        } catch (e) { root.discardWrite(); pendingProbe = null; throw e; }
      }
      : gatePolicy;
    /**
     * Finding 7 — settle the staged write on what the tool ACTUALLY did. Fires
     * after every tool.execute (bare-agent loop.js), success or error, and tool
     * calls run strictly sequentially, so exactly one probe is ever in flight. A
     * probe that never reaches here (a halt out of a tool body) leaves the stage
     * unsettled — correct: nothing landed, and the attempt boundary drops it.
     * @param {{result?: any}} [info] the tool's return value
     */
    const onToolOutcome = async (info) => {
      if (!root || !pendingProbe) return;
      const { path: p, content, type, before } = pendingProbe;
      pendingProbe = null;
      let after = null;
      try { after = readFileSync(p, 'utf8'); } catch { /* absent → after stays null */ }
      let landed = after !== null && createHash('sha256').update(after, 'utf8').digest('hex') !== before;
      if (!landed && after !== null) {
        // no-byte-change: a write always writes (identical bytes ⇒ content IS the
        // file, exact-equal never substring); a no-op edit is an idempotent apply
        // OR a missed anchor — the tool RESULT is the only honest signal (F2)
        if (type === 'write') landed = after === content;
        else landed = typeof info?.result === 'string' && info.result.startsWith('edited ');
      }
      root.settleWrite(landed);
    };
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
      ? createCtxTools(lc, workdir, emitCtx).filter((t) => grantedNames.has(t.name))
      : [];
    // LC-3 (litectx 0.31.0): cooperative yield — index() is async but its work is sync CPU,
    // and the default pass holds THIS event loop (the fuse's timers, the wall clock, the lag
    // sampler all live here) for its full duration: measured 4.4s at 4.5% liveness on a
    // 155-file force pass. With yield:true the worst single block measured 189–252ms (n=4),
    // below anything a second/minute-scale timer can perceive. Store output is byte-identical.
    if (ctx.length) await lc.index({ yield: true });
    const toolDefs = [...shell, ...ctx];
    // F19 per component (P): a strategy line rides ONLY with a granted verb from its
    // component — RETRIEVAL_STRATEGY names ctx_recall/ctx_get, so it gates on those two
    // specifically (a worker granted only `impact` must not be steered to tools it lacks).
    const has = (/** @type {string[]} */ ...vs) => vs.some((v) => granted.includes(v));
    const system = PERSONA_TOOLS + (granted.includes('edit') ? EDIT_STRATEGY : '')
      + (has('recall', 'get') ? RETRIEVAL_STRATEGY : '')
      + (has('impact', 'related', 'recent') ? COMPONENT_STRATEGIES.select : '')
      + (has('compress', 'peek') ? COMPONENT_STRATEGIES.compress : '')
      + (has('stash', 'remember', 'forget') ? COMPONENT_STRATEGIES.isolate : '')
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
      /** F59: unavailable on native — a toolless native session fires no onTurn and
       * reports NO cost (F48/BA-16 live-verified), so a recovery round there would be
       * unmetered spend. The caller treats a null return as "no recovery possible". */
      const askFrom = async () => null;
      const ask = async (prompt, defs = toolDefs) => {
        let r;
        try {
          r = await loop.run([{ role: 'user', content: prompt }], defs, { maxTokens: 32000 });
        } catch (e) {
          throw categorize(e).err;
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
      return { ask, askFrom, workerWrites, setIteration: (/** @type {number|string} */ i) => { roundIteration = i; roundsThisAttempt = 0; }, wasBounded: () => attemptBounded };
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
      : (workerProvider ?? provider);
    // F66 — the stall watchdog. bare-agent's `timeoutMs` bounds socket INACTIVITY,
    // not call duration (provider-http.js `req.setTimeout` resets on every byte),
    // so a connection that stays alive while producing nothing is invisible to it:
    // U run ms3197n8 hung 274 minutes inside ONE call and died ECONNRESET with the
    // bound correctly passed. The heartbeat here is a completed ROUND, which is the
    // one signal that cannot be faked by a live socket. One watch PER WORKER, so
    // the ceiling counts stalls across the step rather than resetting each call.
    // L4 — the watch is handed the run's WALL. Self-heal is what a run does with
    // time left: past the deadline a reissue is spend the run already declined to
    // authorize, and this is the one path no other clock read covers (a stall
    // completes no round and returns from no step, which are the only two places
    // `clock.expired()` is otherwise consulted). Same clock object as every other
    // reader — never a second time source.
    const stallWatch = createStallWatch({
      onStall: (n) => emit('stall', { phase, iteration: roundIteration, stall: n, stallMs: STALL_MS, maxStalls: MAX_STALLS }),
      expired: () => clock.expired(),
    });
    /**
     * ONE Loop PER ISSUED CALL, and every callback on it scoped to that call's
     * generation. After a stall there are TWO calls alive: the abandoned one, whose
     * socket keeps streaming rounds (ms3197n8's lived 274min past the point we moved
     * on), and the reissue. Sharing one Loop between them shares `_stopped`, so a
     * corpse's round bound would cut the LIVE call mid-flight; sharing one callback
     * left the corpse beating the watch that was timing its replacement, which meant
     * the replacement could hang forever without tripping — the fuse feeding itself
     * from the thing it abandoned. A Loop is a plain object over the shared provider,
     * holds no cross-run state (`run()` takes the transcript per call), so one per
     * issue costs nothing.
     *
     * RESIDUAL, documented not fixed: both generations still execute tools through
     * the SAME Gate (`policy`) and the same audit — deliberately, because the audit
     * is what `workerWrites` reads and a per-generation gate would split the run's
     * own books. Concurrent tool calls across a stall therefore interleave on one
     * fence. The fence itself is decision-per-call and order-independent, so the
     * denial semantics hold; what is not modelled is two calls writing the same path
     * in the same window. Latent today (Layer R off, and a stall is rare).
     * @param {number} gen the generation `stallWatch` handed this call
     */
    const newLoop = (gen) => {
      /** @type {any} */
      let self = null;
      /** @param {{costUsd?: number|null, pricing?: string|null, usage?: any, kind?: string}} arg */
      const metered = async (arg) => {
        // The meter fires for EVERY generation, live or abandoned. An orphaned round
        // was really billed, and spend that no instrument sees is the one thing this
        // repo never ships (F6/F44 — unknown is reported as unknown, never as zero;
        // stall.js says it plainly: a reissue can pay twice, and the wallet is what
        // caps that).
        emit('worker-round', {
          phase, iteration: roundIteration, kind: arg?.kind ?? 'turn',
          costUsd: arg?.costUsd ?? null, pricing: arg?.pricing ?? null,
          tokens: (arg?.usage?.inputTokens ?? 0) + (arg?.usage?.outputTokens ?? 0),
          usage: usageOf(arg?.usage),
        });
        // Everything BELOW here belongs to the live call only. A superseded call must
        // not beat the watch (that is the whole watchdog), must not spend the step's
        // round bound (stall.js: "the step's round bound is untouched" by a reissue —
        // the wallet is what bounds a reissue's spend), and must not announce a bound
        // it cannot own.
        if (!stallWatch.isCurrent(gen)) return onLlmResult(arg);
        // F66 — the heartbeat is ANY result coming back from the model layer, not
        // only a `turn`. The question the watchdog asks is "is the model still
        // answering", and a non-turn result answers it just as well; gating the beat
        // on `kind` would arm a false stall on any round shape we don't enumerate
        // here, which is the blind-instrument class in miniature.
        stallWatch.beat(gen);
        if ((arg?.kind ?? 'turn') === 'turn') {
          roundsThisAttempt += 1;

          // The wall deadline rides the SAME seam as the round bound, because it is
          // the only seam that exists: loop.stop() is read at the round boundary and
          // cannot cut an in-flight call (F61/C1, measured — fired at 500ms, returned
          // at 4,018ms). Stopping here judges the partial work and feeds the gap
          // forward exactly as a round-bounded attempt does; the run-level terminal is
          // decided by the step loop, which reads the clock after the step returns.
          if (clock.expired()) {
            attemptBounded = roundIteration;
            emit('wall-bounded', { phase, iteration: roundIteration, ...clock.report(closeTimeoutForReport) });
            self.stop();
          } else if (roundsThisAttempt >= attemptRounds) {
            attemptBounded = roundIteration;
            emit('attempt-bounded', { phase, iteration: roundIteration, rounds: roundsThisAttempt, cap: attemptRounds });
            self.stop();
          }
        }
        return onLlmResult(arg);
      };
      self = new Loop({ provider: loopProvider, system, policy, onLlmResult: metered, onToolResult: onToolOutcome });
      return self;
    };
    /** @param {string} prompt @param {typeof toolDefs} [defs] */
    /**
     * F59 — continue an EXISTING conversation for exactly one TOOLLESS round.
     * `defs` is `[]`, so text is the only output the model can produce: the summary
     * round is guaranteed by CONSTRUCTION, never requested in prose (F19/F37 — a
     * pacing mandate in the persona was violated 6/6). Meters like any other round
     * (F12); the bound has already fired, so this is a deliberate +1 paid once.
     * @param {any[]} msgs the prior conversation (loop.run's `msgs`)
     * @param {string} prompt
     */
    const askFrom = async (msgs, prompt) => {
      try {
        return await stallWatch.watch((gen) => newLoop(gen).run([...msgs, { role: 'user', content: prompt }], [], { cacheMessages: true, maxTokens: 32000, timeoutMs: clock.callTimeoutMs() }));
      } catch (e) {
        throw categorize(e).err;
      }
    };
    const ask = async (prompt, defs = toolDefs) => {
      let r;
      try {
        r = await stallWatch.watch((gen) => newLoop(gen).run([{ role: 'user', content: prompt }], defs, { cacheMessages: true, maxTokens: 32000, timeoutMs: clock.callTimeoutMs() }));
      } catch (e) {
        throw categorize(e).err;
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
    return { ask, askFrom, workerWrites, setIteration: (/** @type {number|string} */ i) => { roundIteration = i; roundsThisAttempt = 0; }, wasBounded: () => attemptBounded };
  }

  /** relay a throw from OUTSIDE ralph (scout/plan drafting/fix) as its honest
   * category. Three terminals, never collapsed: the budget gate, the wall clock
   * (F64 — the scout and the drafter run under the same derived call timeout the
   * worker does, so this path needs the same split or it is the blinder route),
   * and transport. */
  const relay = (/** @type {any} */ e, /** @type {string} */ phase) => {
    const { category } = categorize(e);
    const detail = String(e?.message ?? e);
    if (category === 'cap-halt') emit('cap-halt', { category, meaning: 'not under cap — not "can\'t"', detail });
    if (category === 'wall-halt') emitWallHalt({ cutMidCall: true, phase });
    const DECIDE = {
      'cap-halt': [`The budget gate tripped during ${phase} — the wallet cannot fund the plan flow.`, ['raise the job budget and rerun', 'abandon the run']],
      'wall-halt': [`The run reached its wall-clock cap during ${phase}. Time ran out, not capability.`, WALL_OPTIONS],
      // A stall OUTSIDE a step (scout, drafting, fix) has no step to replan, so it
      // surfaces — but it is named, never laundered into provider-red. The socket
      // did not fail here; the model stopped answering and reissuing did not help,
      // and those are different diagnoses with different remedies (F45/F48: a
      // casualty is never evidence, and a governance stop is never a casualty).
      'step-stalled': [`The model stopped producing rounds during ${phase} and reissuing the call did not recover it.`, ['retry the run', 'check provider status', 'abandon the run']],
    };
    const [decision, options] = (Object.hasOwn(DECIDE, category) ? DECIDE[category] : undefined)
      ?? [`The ${phase} call failed (${category}) — no result exists.`, ['retry the run', 'fix the provider binding', 'abandon the run']];
    emit('escalation', {
      category, decisionReady: true, phase, decision, options, detail,
      ...(typeof e?.lib === 'string' ? { lib: e.lib } : {}),
    });
    // `step-stalled` rides out as ITSELF, not as provider-red. Naming the
    // escalation while returning a casualty label would launder a governance stop
    // into transport noise at exactly the layer the readout reads.
    return category === 'cap-halt' || category === 'wall-halt' || category === 'step-stalled' ? category : 'provider-red';
  };

  // ── 1. SCOUT — read-only by construction: the write-class verbs are simply
  // not in its menu (the menu is the grant), and its gate fences zero paths
  let scoutBlob = '';
  emit('scout-start', { rounds: scoutRounds });
  try {
    const scout = await mkWorker({ granted: ceiling.filter((v) => !WRITE_VERBS.includes(v) && !STORE_VERBS.includes(v)), phase: 'scout', attemptRounds: scoutRounds, attempts: 1, writable: false });
    scout.setIteration(1);
    const r = await scout.ask([
      'Survey this repository READ-ONLY for the goal below. Report: the relevant layout, the key files and symbols, and your best hypothesis about what the work requires. Be concise — your notes brief a planner that cannot see the repository.',
      `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root.`,
      `Goal:\n${job.goal}`,
      pre.gap && `The job's verification is currently failing. Its output on the tree as it stands:\n${pre.gap}`,
    ].filter(Boolean).join('\n\n'));
    scoutBlob = scrub(r.text ?? '').slice(0, SCOUT_BLOB_MAX);
    // F59 — RESERVE the summary round. The round bound is enforced from the
    // metering callback (loop.stop), so a scout still calling tools on its last
    // round is halted mid-tool-use and `text` is empty: it spends the whole
    // allowance exploring and never writes the survey that is its ONLY
    // deliverable. Measured on 15 of 18 archived runs, which then drafted from
    // `(no scout notes)` while still paying ~12% of the run (F55) for the walk.
    // The recovery is one TOOLLESS round on the SAME conversation (`r.msgs`
    // carries the exploration): with no tools offered, text is the only possible
    // output — a mechanical guarantee, never a prose plea to summarise (F19/F37:
    // a pacing mandate in the persona was violated 6/6).
    // The trigger is BOUNDED-and-short, never short alone: a terse survey that
    // finished on its own was not cut off and has nothing to recover. The archive
    // separates cleanly on exactly this pair — every truncated scout was bounded
    // with 0-86 bytes, and the two that finished naturally wrote 5991/8056.
    if (scout.wasBounded() && Buffer.byteLength(scoutBlob) < SCOUT_MIN_BYTES && Array.isArray(r.msgs) && r.msgs.length) {
      emit('scout-truncated', { bytes: Buffer.byteLength(scoutBlob) });
      const s2 = await scout.askFrom(r.msgs, 'You are out of exploration turns. Write your survey NOW, from what you have already read: the relevant layout, the key files and symbols, and your best hypothesis about what the work requires. Text only.');
      const recovered = scrub(s2?.text ?? '').slice(0, SCOUT_BLOB_MAX);
      if (Buffer.byteLength(recovered) > Buffer.byteLength(scoutBlob)) scoutBlob = recovered;
    }
  } catch (e) {
    return relay(e, 'scout');
  }
  emit('scout-result', { bytes: Buffer.byteLength(scoutBlob) });
  // F59 — the LOUD half. `scout-result {bytes: 0}` was emitted faithfully 18 times
  // out of 18 and read by nobody: an instrument that works but has no consumer is a
  // log line, not evidence. A survey that is still empty after its reserved round is
  // now a NAMED condition. It is never a halt — F59's own evidence is that 3 of 5
  // archived greens had an empty scout, so failing the run here would be a worse
  // error than the one being fixed.
  if (Buffer.byteLength(scoutBlob) < SCOUT_MIN_BYTES) emit('scout-empty', { bytes: Buffer.byteLength(scoutBlob), rounds: scoutRounds });
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
   * @param {string} phase @param {string|null} failure
   * @param {string} [progress] the meter's read, replan only (A's adaptation channel) */
  const obtainPlan = async (phase, failure, progress) => {
    const drafter = await mkWorker({ granted: [], phase: 'plan', attemptRounds: 2, attempts: 3, writable: false });
    // The BALANCE, read live at each draft — never a snapshot and never a rate
    // (addendum 2). At draft it is the whole budget (scale); at replan it is what
    // is actually left, which is the adaptation channel.
    const materials = { balanceUsd: remainingUsd(), remainingMs: clock.bounded ? clock.remainingMs() : null, ...(progress ? { progress } : {}) };
    emit('materials', { phase, ...materials });
    const draftPlan = async (/** @type {any[]|null} */ reds) => {
      drafter.setIteration(reds ? 'redraft' : 'draft');
      const r = await drafter.ask(planPrompt(job, scoutBlob, reds, maxStepRounds, failure, scopeMenu, materials), []);
      return extractArtifact(r.text).code ?? '';
    };
    let text = await draftPlan(null);
    let pv = validatePlan(text, { job, maxStepRounds, scopes: scopeMenu, capRuns });
    emit('plan-validate', { ok: pv.ok, reds: pv.reds, phase: `${phase}-1` });
    if (!pv.ok) {
      text = await draftPlan(pv.reds);
      pv = validatePlan(text, { job, maxStepRounds, scopes: scopeMenu, capRuns });
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
    // Layer R — one root per step's ralph loop (each micro-wheel is the Layer-1
    // atom, LAYERS.md). The red-set is the exit evaluator's OWN gap: fixation
    // here means "the worker rewrote the same file(s) AND the exit evaluator's
    // complaint is byte-identical" — so the whole normalized gap is the
    // comparable set (gapKeep `\S` = every non-blank line). That is more robust
    // than reusing a check's `^`-anchored gapKeep, which the exit wrapper
    // (`check "x" red: …`) would break. writesInformative is true (tool mode,
    // always) but never fires on write-overlap ALONE — a plan step rewrites its
    // one target every attempt, so only a KNOWN-unmoved red-set can distinguish
    // repetition from progress (Finding 3). Native is excluded (no onToolResult
    // seam → the tee cannot settle → same-path rewrites are blind).
    const root = layerRoot && !native
      ? createRoot({ gapKeep: '\\S', redact: scrub, writesInformative: true })
      : null;
    // P: the three widened step fields, each wired or refused — a silently-ignored
    // optional field is the F50 blind-instrument class. `attempts` tightens the
    // shell cap (validator already bounds it); `scope` narrows the fence to a
    // menu value (a subset by construction); `model` swaps the worker's provider
    // via the runner's factory — absent factory it must STOP, not silently run
    // the default tier as if the choice had been honoured.
    const stepCap = step.attempts !== undefined ? Math.min(step.attempts, capRuns) : capRuns;
    if (step.model !== undefined && !providerFor) {
      const err = /** @type {any} */ (new Error(`step "${step.id}" selects model tier "${step.model}" but the runner supplied no providerFor factory — wiring gap, not a plan defect`));
      err.category = 'interpreter-red';
      throw err;
    }
    const w = await mkWorker({
      granted: step.tools, phase: `step:${step.id}`, attemptRounds: step.rounds, attempts: stepCap, writable: true, root,
      fence: step.scope !== undefined ? [resolve(workdir, globToPrefix(step.scope))] : null,
      workerProvider: step.model !== undefined && providerFor ? providerFor(step.model) : null,
    });
    let lastText = '';
    let iterationNow = 0;
    // The meter's baseline: what the RUN had left when this step began. Shares are
    // computed against this, never against the original budget — a late step is
    // measured against what actually remains for it, which is what "eating the run"
    // means. Read once, here, so the denominator cannot drift mid-step.
    const stepStartUsd = remainingUsd();
    const stepStartMs = clock.bounded ? clock.remainingMs() : Infinity;
    /** @param {number} iteration @param {string} [gap] */
    const middle = async (iteration, gap) => {
      // A — the variance check, at the HEAD of an attempt so no work is discarded
      // (attempts 1..n-1 accrued the spend; their writes are already on disk). Never
      // fires on attempt 1: the share is 0 there by construction. Throwing with a
      // category is the seam ralph already owns; it routes the category and the step
      // loop reads it as a REPLAN, not a stop.
      if (iteration > 1) {
        const moneyShare = stepStartUsd > 0 ? (stepStartUsd - remainingUsd()) / stepStartUsd : 0;
        const timeShare = clock.bounded && stepStartMs > 0 ? (stepStartMs - clock.remainingMs()) / stepStartMs : 0;
        if (moneyShare >= VARIANCE_THRESHOLD || timeShare >= VARIANCE_THRESHOLD) {
          emit('variance', {
            step: step.id, iteration, threshold: VARIANCE_THRESHOLD,
            moneyShare: Number(moneyShare.toFixed(3)),
            timeShare: clock.bounded ? Number(timeShare.toFixed(3)) : null,
            axis: moneyShare >= VARIANCE_THRESHOLD ? 'money' : 'time',
          });
          const err = /** @type {CategorizedError} */ (new Error(
            `step "${step.id}" consumed ${Math.round(Math.max(moneyShare, timeShare) * 100)}% of the run's remaining `
            + `${moneyShare >= VARIANCE_THRESHOLD ? 'money' : 'time'} across ${iteration - 1} attempt(s) with its exits still red`));
          err.category = 'step-variance';
          throw err;
        }
      }
      w.setIteration(iteration);
      iterationNow = iteration;
      // Layer R observe: finalize the prior attempt from the books (workerWrites
      // audit + teed same-path rewrites), run the fixation detector, and inject
      // its escalating note into THIS attempt's prompt (null = inert). The event
      // carries counts and paths only — never content (the spine is forever).
      const rootInj = root ? root.observe({ iteration, gap, writes: w.workerWrites() }) : null;
      if (rootInj) emit('root-injected', { step: step.id, ...rootInj.event });
      const r = await w.ask([
        step.action,
        `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root — a relative path resolves against a different directory and will be denied by the gate.`,
        step.target && `Write your deliverable to: ${resolve(workdir, step.target)}`,
        artifacts.length > 0 && `Working context (read-only) — prior steps' results:\n${artifacts.map((a) => `[${a.id}] ${a.text}`).join('\n\n')}`,
        gap && `Previous attempt failed this step's checks:\n${gap}`,
        w.wasBounded() === iteration - 1
          && `Your previous attempt was CUT OFF after ${step.rounds} tool rounds. Reading is bounded; writing is not. Form a hypothesis EARLY and make the change.`,
        rootInj && rootInj.note,
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
    const outcome = await ralph({ middle, judge, capRuns: stepCap, emit: emitL, workerWrites: w.workerWrites });
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
      // T's terminal: a run that cannot fit its time budget STOPS, and the stop is
      // the result (build-ladder discipline, v1.27 — unchanged). Checked after a
      // GREEN step too, not just a red one: the alternative silently starts a step
      // it cannot fund, which is the same class as the money cap binding mid-attempt
      // (F45). Resume-to-cap applies exactly as it does to money — the stop IS the
      // checkpoint, so the completed steps are not wasted.
      if (clock.expired() && idx < plan.steps.length) {
        emitWallHalt({ stepsDone: idx, stepsPlanned: plan.steps.length });
        emit('escalation', {
          category: 'wall-halt', decisionReady: true, phase: `step:${step.id}`,
          decision: `The run reached its wall-clock cap after ${idx} of ${plan.steps.length} steps. Time ran out, not capability.`,
          options: WALL_OPTIONS,
          detail: `requested ${clock.requestedMs}ms, elapsed ${clock.elapsedMs()}ms`,
        });
        planExecuted();
        return 'wall-halt';
      }
      continue;
    }
    // ONE replan, and only for EXHAUSTION with FUNDS LEFT (review #5): ralph
    // emits cap-halt for BOTH attempt-exhaustion AND a money-gate halt
    // mid-attempt — but a drained wallet is a stop, not an adaptation. A
    // money-gate halt necessarily drained the wallet (the worker's cap WAS the
    // whole remaining wallet), so replanning against it burns another draft and
    // mislabels the money-cut as "exits still red" (F45 class); attempt-
    // exhaustion leaves money on the table. An instrument/governance stop that
    // is not cap-halt never replans either. (An unpriced step already returned
    // pricing-red at the step-end guard above, so isUnpriced() is false here.)
    //
    // A (PRD v1.27) adds the SECOND trigger: `step-variance` — the meter stopped a
    // step that had eaten a declared share of the run with its exits unmoved. That
    // is the case exhaustion-only could never reach (F56: a replan has fired zero
    // times in the programme), and it is a genuine re-allocation rather than a stop.
    // Both triggers still need FUNDS LEFT, and both are still bounded by the ONE
    // replan ceiling — this changes the trigger, never the ceiling (v1.12).
    const cat = lastEscalation?.category;
    // F66 adds the THIRD trigger: `step-stalled` — the stall watchdog reissued the
    // model call MAX_STALLS times and never got a round back. hamr's ruling is that
    // a stall must self-heal rather than end the run ("killing and coming back is
    // not an option"), so the watchdog reissues silently; only once reissuing has
    // demonstrably stopped working does the run adapt instead — by replanning, not
    // by stopping. Same ONE-replan ceiling and same FUNDS-LEFT condition as the
    // other two: this changes the trigger, never the ceiling (v1.12).
    const replanTrigger = cat === 'cap-halt' ? 'step exhausted its attempts with exits still red'
      : cat === 'step-variance' ? 'the meter stopped a step that was consuming the run with its exits unmoved'
      : cat === 'step-stalled' ? 'the model stopped producing rounds and reissuing the call did not recover it'
      : null;
    if (!replanned && replanTrigger && remainingUsd() > MONEY_MIN) {
      replanned = true;
      emit('replan', { step: step.id, reason: replanTrigger, trigger: cat });
      // The brief names the trigger HONESTLY, one branch per trigger: it is the
      // only channel the redrafting planner adapts to, so a wrong diagnosis here
      // is handed to the one component whose whole job is to respond to it. A
      // stall in particular never judged its exits at all — the exhaustion
      // sentence would invent a red the run never saw (F28's rule, replan side).
      const why = cat === 'step-variance'
        ? 'It was stopped by the run\'s meter for consuming too large a share of what was left.'
        : cat === 'step-stalled'
          ? 'It stalled: the model stopped producing rounds and reissuing the call did not recover it, so its exits were never judged.'
          : `It ran ${step.attempts !== undefined ? Math.min(step.attempts, capRuns) : capRuns} attempts and its exits were still red.`;
      const failure = `Step "${step.id}" (${step.action}) did not reach its exits. `
        + `${why}\n`
        + `Last exit state:\n${lastEscalation?.detail ?? '(none)'}\n`
        + `Steps completed so far: ${artifacts.map((a) => a.id).join(', ') || 'none'}.`;
      // The progress line IS the adaptation channel (addendum 2): the balance rides
      // in via obtainPlan's live read, and this says where the run got to. Both are
      // the planner re-allocating what remains across what is left — never a rate.
      const progress = `step ${idx + 1} of ${plan.steps.length} ("${step.id}") did not finish; `
        + `${artifacts.length} step(s) completed before it`;
      let pv;
      try {
        pv = await obtainPlan('replan', failure, progress);
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
      // the new plan's steps are NOT the old plan's steps — its abandoned greens
      // must not ride forward as this plan's "prior steps' results" (stale, and
      // it names steps the current plan does not contain)
      artifacts.length = 0;
      idx = 0;
      continue;
    }
    // F64 — the wall stopped this attempt from INSIDE a provider call (the derived
    // call timeout is the deadline in the provider's own coin). ralph already
    // emitted the escalation under this category, so the outcome and the record
    // agree (F11); what is still missing is the run-level TIME record, which the
    // between-steps site emits and this path must too. Never a replan trigger and
    // never a casualty: time ran out, and the stop IS the checkpoint.
    if (cat === 'wall-halt') {
      emitWallHalt({ cutMidCall: true, phase: `step:${step.id}`, stepsDone: idx, stepsPlanned: plan.steps.length });
      planExecuted();
      return 'wall-halt';
    }
    // A money-gate halt (wallet drained) is an honest cap-halt terminal, never a
    // step-red: the exits never ran because the money ran out, not because the
    // work failed. Attempt-exhaustion WITH funds after the one replan is spent
    // stays a step-red (the stop is a result).
    if (cat === 'cap-halt') {
      planExecuted();
      return remainingUsd() <= MONEY_MIN ? 'cap-halt' : `step-red:${step.id}`;
    }
    // A second `step-variance` after the one replan is spent is a STOP, and the stop
    // is the result — but it rides out as `step-red:<id>`, NOT as its own top-level
    // outcome. The category is a replan TRIGGER, never a run verdict: leaking it
    // upward would mint an outcome run.js and the ledger's class table do not know,
    // and an unmapped category is counted as a library bug (ledger.js) when this is a
    // planning story. The escalation ralph already emitted carries the real detail.
    if (cat === 'step-variance') {
      planExecuted();
      return `step-red:${step.id}`;
    }
    // Any OTHER terminal escalation category is NOT a capability failure: a
    // provider-red is a transport CASUALTY, a gate-red/interpreter-red/close
    // fault is an instrument stop. Each rides out under its OWN name (F11: the
    // returned outcome and the emitted escalation must agree) so run.js labels
    // it honestly — a provider-red carries the F44 spendComplete:false floor,
    // never laundered into step-red tier data. Mirrors the setup-fault catch.
    planExecuted();
    return typeof cat === 'string' ? cat : `step-red:${step.id}`;
  }

  // ── 4. THE CLOSE — the operator's signed command, the only truth. Red →
  // the gap feeds ONE bounded fix loop judged by the REAL close (v1.12 §4);
  // still red → the escalation ralph already emitted stands.
  const post = await judgeClose();
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
    // Layer R for the close-fix loop — the plan flow's single ralph loop judged
    // by the REAL close (the plan flow's single ralph loop, and the
    // likeliest place fixation manifests: the fix worker has the full menu and
    // is judged by a command, not a form-only exit). The red-set comes from the
    // stage that ACTUALLY rendered the verdict this attempt, not from one pattern
    // fixed for the run: a staged close has N gapKeeps and the wall the worker hit
    // varies attempt to attempt (the gap here is the raw close output, so the
    // `^`-anchored pattern matches, unlike the exec steps' exit-eval gap). Same
    // native exclusion (no onToolResult seam ⇒ the tee cannot settle).
    const fixRoot = layerRoot && !native
      ? createRoot({ redact: scrub, writesInformative: true })
      : null;
    const w = await mkWorker({ granted: ceiling, phase: 'fix', attemptRounds: maxStepRounds, attempts: capRuns, writable: true, root: fixRoot });
    /** @param {number} iteration @param {string} [gap] */
    const middle = async (iteration, gap) => {
      w.setIteration(iteration);
      // the red-set's source travels WITH the gap: `closeStage` is the stage the
      // judge stopped at for the attempt this gap came from, and its own gapKeep
      // designates that stage's failures
      const rootInj = fixRoot
        ? fixRoot.observe({
          iteration, gap, writes: w.workerWrites(),
          redStage: closeStage,
          redKeep: stagedClose.find((s2) => s2.name === closeStage)?.gapKeep,
        })
        : null;
      if (rootInj) emit('root-injected', { phase: 'fix', ...rootInj.event });
      await w.ask([
        'The job\'s final verification is failing. Fix the repository so it passes.',
        `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root.`,
        artifacts.length > 0 && `Working context (read-only) — the plan's steps produced:\n${artifacts.map((a) => `[${a.id}] ${a.text}`).join('\n\n')}`,
        !gap && post.gap && `The verification's output on the tree as it stands (not an attempt of yours):\n${post.gap}`,
        gap && `Previous attempt failed the verification:\n${gap}`,
        rootInj && rootInj.note,
      ].filter(Boolean).join('\n\n'));
    };
    fixOutcome = await ralph({
      // the staged close rides in as the JUDGE seam (one verdict, every stage in
      // order) — ralph's single-command path stays exactly what it was
      middle, judge: async () => judgeClose(), capRuns, emit: emitL, redact: scrub,
      closeTimeoutMs, cwd: workdir, workerWrites: w.workerWrites,
    });
  } catch (e) {
    planExecuted();
    return relay(e, 'fix');
  }
  planExecuted();
  if (fixOutcome !== 'green' && lastEscalation?.category === 'wall-halt') {
    // F64 in the close-fix loop: the same governance stop, and it must not ride out
    // as a bare `escalated` either — that reads as "the fix failed" when the fix was
    // never given the time to run.
    emitWallHalt({ cutMidCall: true, phase: 'fix' });
    return 'wall-halt';
  }
  if (fixOutcome !== 'green' && lastEscalation?.category === 'cap-halt') {
    // ralph spells BOTH of its terminals cap-halt — attempt-exhaustion AND a
    // money-gate halt thrown mid-attempt — so the category alone cannot tell them
    // apart, and the wallet is the only instrument that can. The step loop already
    // splits this exact pair on the same reading; the fix loop must too, because
    // the fix worker's gate is built with the wallet at its MOST drained (every
    // step's spend is behind it), which is precisely where a money cut masquerades
    // as "the fix failed". F45: a money cut is never a capability read — it rides
    // out as cap-halt, the resume-to-cap checkpoint (the stop IS the checkpoint).
    // Attempts spent with money still on the table stays the designed terminal
    // ("close still red") and keeps riding out as `escalated` below.
    // (MED-4, fixed with hamr's explicit go, 2026-07-30.)
    if (remainingUsd() <= MONEY_MIN) return 'cap-halt';
  } else if (fixOutcome !== 'green' && typeof lastEscalation?.category === 'string') {
    // The step loop's category restoration (F11), mirrored: ralph returns the flat
    // 'escalated' on a middle throw while its escalation carries the real name — a
    // provider-red here is a transport CASUALTY, and run.js keys the F44
    // spendComplete:false floor on the OUTCOME, so a laundered label would report
    // an exact-looking total for a call that never billed back.
    return lastEscalation.category;
  }
  return fixOutcome === 'green' ? 'green' : 'escalated';
}
