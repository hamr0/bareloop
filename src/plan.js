// plan-v1 validator — the AGENT-authored half of the two-doc story (Layer 2,
// design record 2026-07-21; PRD v1.12). The plan is the ONLY document the
// emergent middle authors: an ordered list of bounded steps, each with a tool
// grant, a rounds bound, a deliverable target, and a form-check exit. This
// validator gates it before tokens burn, against the SIGNED job spec:
//
//   verbs ⊆ the spec's tool ceiling        → `verb-escape` (the ceiling
//     exists and the plan overreached — distinct from the operator-side
//     `request-red`, which is admission demand against the product menu)
//   bounds ≤ the shell caps                → `bounds`
//   scopes/targets inside the signed fence → `scope-escape` / `invalid-value`
//   …and, on a step that NARROWED the fence with `scope`, the step's WRITES are
//     judged against that narrowed prefix too → `step-scope-escape` (the runner
//     gates the step from it, so an in-fence-but-out-of-scope target is a write
//     denied on every attempt with no red anywhere — W3). Exits are observations,
//     not writes: only a `tree-changed` scope DISJOINT from the step's scope is
//     unsatisfiable, and the artifact paths are not constrained at all
//   exits from the closed menu only        → `exit-illegal` (arbiter
//     inexpressibility: an exit is declarative data the shell evaluates with
//     its own fixed code — `run` cannot be laundered through it)
//   check references resolve against the menu DERIVED from the signed close → `check-unknown`
//     (decision 1: a check the spec doesn't sign does not exist)
//
// Like its siblings (validate.js, job.js) it never throws on JSON text or
// plain parsed data; every failure is a named {code, path, detail} red.

import { TOOL_MENU, LOCKED_TOOLS, WRITE_VERBS, checkMenu } from './job.js';
import { declaredStages } from './declaredclose.js';
import { globToPrefix, scopeContained, isObj, isNonEmptyString, sweepSecretLiterals, hasNestedQuantifier } from './validate.js';
import { READ_SHIM_CAP, readShimArm } from './readshim.js';

/** the closed exit menu (PRD v1.12 §3 + decision 1's `check-passes`): the
 * shell evaluates every form with its own fixed code, never a command — the
 * same both-directions inexpressibility guard as the two-validator split */
export const EXIT_TYPES = Object.freeze(['artifact-written', 'tree-changed', 'json-valid', 'check-passes']);
/** decision 8: AND-only conjunction, bounded — no OR (a weak arm would
 * launder the exit), no NOT */
export const MAX_EXITS_PER_STEP = 2;
/** plan size bound — per-step rounds bound the spend, but an unbounded step
 * COUNT is still an unbounded claim on the wallet; same 8 as loop.maxIterations */
export const MAX_PLAN_STEPS = 8;
/** the write-class verbs (BA-13: `edit` is judged by the same fence as
 * `write`) — a step granting one is a WRITE step for the F17 pairing rule
 * and the v1.18 target requirement. RE-EXPORTED from job.js, never re-declared:
 * ONE inventory (the SECRET_PATTERNS precedent) — a second copy lets a third
 * write-class verb land in one list and stay invisible to the other. */
export { WRITE_VERBS };
/** scope-menu bound: the menu is a PROMPT ingredient on every draft and
 * redraft, so an unbounded repo would price the drafting call by its directory
 * count. Shallow entries survive the cap (see `legalScopes`) because they are
 * the useful ones — a deep leaf is reachable via its parent. */
export const MAX_SCOPE_MENU = 24;
/** G1's pair (read shim only): the two verbs that can reach INTO a file the cap
 * cut short — `recall` names where a symbol lives, `get` reads that symbol in
 * full. Named here because the rule that needs them lives here; the cap that
 * makes them mandatory lives in src/readshim.js. */
const RETRIEVAL_PAIR = Object.freeze(['recall', 'get']);

/**
 * The MENU of legal `tree-changed` scopes — choose-don't-describe (design record
 * §4, hamr's correction: *"did agent choose from a list or not?"*).
 *
 * F60 measured 13 of 18 validator reds as ONE class: the agent writes
 * `scope: "src/*.js"`, the grammar accepts only a trailing `/**` or `/*`, and
 * each red costs a redraft call. Teaching the rule in the prompt or widening the
 * grammar both leave the agent authoring a free-text string and guessing its
 * shape. Enumerating instead makes an illegal scope INEXPRESSIBLE.
 *
 * This is the only producer of scope menus, and it filters by the signed fence —
 * so a menu entry that escapes containment cannot be constructed, rather than
 * being caught by a downstream check. `globToPrefix` is untouched: this changes
 * what the agent is OFFERED, never what the fence ENFORCES.
 *
 * @param {string[]} writeScope the signed fence entries (always offerable — they
 *   cover directories a step has not created yet, which `snapshotScope` treats
 *   as an empty snapshot)
 * @param {string[]} [dirs] workdir-relative directories discovered under the
 *   fence; each becomes `<dir>/**`
 * @param {number} [cap] the menu bound; `Infinity` asks for the UNCAPPED set, so
 *   a caller can report how many entries the cap dropped (no silent caps — a menu
 *   that reads as complete when it is not is the blind-instrument class)
 * @returns {string[]} the offerable scopes, deduped, shallowest-first, capped
 */
export function legalScopes(writeScope, dirs = [], cap = MAX_SCOPE_MENU) {
  const fence = writeScope.filter(isNonEmptyString).map(globToPrefix).filter((p) => p !== '');
  const inside = (/** @type {string} */ p) => fence.some((f) => p === f || p.startsWith(f + '/'));
  /** @type {string[]} */
  const prefixes = [];
  for (const p of [...fence, ...dirs.filter(isNonEmptyString).map(globToPrefix)]) {
    // scopeContained rejects absolutes, drive letters, backslashes and any ".."
    // segment; `inside` rejects a contained-but-out-of-fence dir. Both, in that
    // order, on the NORMALIZED prefix.
    if (!scopeContained(p) || !inside(p) || prefixes.includes(p)) continue;
    prefixes.push(p);
  }
  // depth first, then lexical — a stable order so the same repo yields the same
  // menu (and the same prompt) across drafts, and so the cap drops leaves
  // rather than roots.
  prefixes.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  return prefixes.slice(0, cap).map((p) => `${p}/**`);
}
const PLAN_FIELDS = ['schema', 'steps'];
// decision 7: NO dependsOn — v1 is strictly sequential, array order IS the
// order; a field nothing consumes is a live-looking knob with zero effect
// (the F16 inert-op class). The arbiter's own vocabulary (close, budget,
// fence) is absent by construction — unknown-field at every depth.
const STEP_FIELDS = ['id', 'action', 'tools', 'rounds', 'target', 'exit', 'model', 'attempts', 'scope'];
/** P (design record 2026-07-28): the signed per-step model-tier menu. Closed by
 * construction — the agent picks a tier, never names an arbitrary model string
 * (the tier→model mapping and any effort params are the RUNNER's, per provider).
 * opus is deliberately absent: reserved for fresh builds hamr explicitly assigns,
 * never plan-selectable.
 *
 * 2026-08-06 — haiku dropped, on hamr's order: "haiku should be dropped to see if
 * it passes, if it's agent poor work or harness, like always." This is a REVERSIBLE
 * ATTRIBUTION PROBE, not a finding that haiku is incapable. What the $0 archive read
 * (186 spines / 71 accepted plans / 255 steps) actually shows is a CONFOUND, in both
 * directions: only 20 steps ever declared a tier at all — haiku 12 (9 of them on a
 * REPLANNED plan, 6 the LAST step of their plan, bounds 3–12 rounds, 2 ever green)
 * against explicitly-declared sonnet 8 (bounds 14–32, 5 green). The planner picks
 * haiku for steps it judges mechanical, and replanned steps sit on runs already in
 * trouble, so neither column is a controlled read. All three bareagent-u runs of
 * 2026-08-06 tiered the REPLANNED step down (haiku/6, haiku/8, haiku/12) and all
 * three failed, against sonnet initial steps at 30–40 rounds — a confound sitting
 * on the programme's most recent capability read. Removing the tier is how it gets
 * attributed: with only one tier expressible, a still-failing replan is agent or
 * harness, not the tier.
 *
 * The `model` FIELD and its validator branch stay: a one-entry menu means a plan (or
 * a stored bridge) declaring `model:"sonnet"` still validates, and restoring haiku is
 * a one-token edit. This narrows only what the AGENT may express — `--model haiku`
 * remains the OPERATOR's probe knob (PRD v1.36), untouched in the runner scripts. */
export const STEP_MODELS = Object.freeze(['sonnet']);
const EXIT_FIELDS = {
  'artifact-written': ['type', 'path', 'pattern'],
  'tree-changed': ['type', 'scope'],
  'json-valid': ['type', 'path'],
  'check-passes': ['type', 'name'],
};
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** F49's catastrophic-backtracking reject. RE-EXPORTED from validate.js, never
 * re-declared: THREE untimed regex fields are split across the two documents —
 * this one (`artifact-written.pattern`, agent-authored) and the operator's
 * `judged.pattern` + `gapKeep` in job.js. plan.js imports job.js, so job.js
 * cannot import plan.js; housing the scan in the shared primitives module is
 * what lets both reject through ONE inventory (the SECRET_PATTERNS precedent —
 * a second copy is a shape one side rejects and the other admits). */
export { hasNestedQuantifier };

/**
 * The close, as the ordered STAGE LIST the plan flow actually executes (PRD
 * v1.28). A staged close is already that list; the legacy object form is the
 * ONE-stage list it stands for, named `close`. Anything else — a gold, rubric or
 * hitl close, which names no command to run — is null, and the runner escalates
 * `close-unsupported` before any tokens.
 *
 * W4 — this is the ONE staging, and it exists because there used to be two. The
 * runner synthesized the single stage and derived its check menu from THAT, while
 * `planPrompt` and `validatePlan` called `checkMenu` on the RAW spec — where an
 * object close is not an array, so the menu came back empty. The result was a
 * runner announcing and preflighting a stage the drafter was never offered and the
 * validator would have redded `check-unknown`. Same class as the two-transforms
 * defects before it: the fix is one derivation every consumer calls, not three
 * copies kept in step by comment.
 *
 * Lives here rather than beside `checkMenu` in job.js only because job.js owns the
 * SIGNED vocabulary and this is the consumer-side reading of it; `plan.js` is the
 * lowest module every check-menu consumer already imports (planrun imports plan,
 * never the reverse), so it is the one place all three can share without a cycle.
 * @param {any} close the spec's `close` field, any shape
 * @returns {any[]|null} the stage list, or null when the close names no command
 */
export function stageClose(close) {
  if (Array.isArray(close)) return close;
  if (!isObj(close) || close.type !== 'predicate') return null;
  return [{ name: 'close', cmd: close.cmd, expect: close.expect, judged: close.judged, gapKeep: close.gapKeep }];
}

/**
 * THE ONE STAGING, one level up: a job's close stages, from EITHER of the two
 * fields a spec may carry.
 *
 * `stageClose` reads a command close; `declaredStages` reads an authored
 * declaration (M4). A spec declares exactly one of them — the job validator reds
 * `close-duplicated` on both — so this is a selection, never a merge.
 *
 * Every consumer calls THIS rather than `stageClose` directly, for the reason
 * W4 wrote `stageClose` in the first place: the drafting prompt, the plan
 * validator, the runner, the bridge registry and the reuse envelope must all see
 * the same stage list, and a consumer that reads only `close` sees a declared
 * job as having no close at all — an empty check menu offered to a drafter whose
 * plan the validator would then red for referencing a stage nobody offered.
 * @param {any} job the job spec, any shape
 * @returns {any[]|null} the stage list, or null when the job names no close
 */
export function closeStagesOf(job) {
  if (!isObj(job)) return null;
  const declared = declaredStages(job.closeDecl);
  if (declared) return declared;
  return stageClose(job.close);
}

/** @typedef {{code: string, path: string, detail?: string, verb?: string}} Red */

/**
 * Validate an agent-authored plan (`schema: "plan-v1"`) against the SIGNED
 * job spec. Never throws on JSON text or plain parsed data; every failure is
 * a named red. Returns the parsed plan on ok (single parse), null on any red.
 * @param {object|string} input parsed plan, or raw JSON text (parse failures are a red)
 * @param {{ job?: any, maxStepRounds?: number, scopes?: string[], seedRed?: string[], priorChecks?: string[], readShim?: boolean|'cap'|'diff' }} [opts] `job`: the
 *   validateJob-GREEN four-field spec (the ceiling, the fence, and the checks
 *   menu all come from it — a missing or non-plan-shape job fails CLOSED);
 *   `maxStepRounds`: the shell's per-step rounds ceiling (interpret's
 *   tool-mode TURNS_PER_ATTEMPT) — a step may tighten it, never exceed it;
 *   `scopes`: the offered `tree-changed` menu from `legalScopes` (the SAME array
 *   the drafting prompt enumerated). Omitted, it derives from the signed
 *   writeScope — never a free-text fallback (F50).
 *
 *   The two shape-lottery gate rules (2026-08-04) — both keyed on RECORDED
 *   facts, never an LLM judgment of "is this job small", and both inactive
 *   when their fact is omitted (resume/reuse callers stay byte-identical):
 *   `seedRed`: check names whose PREFLIGHT verdict was needs_revision. Rule
 *   A-v2 — a seed-red check is the goal itself, not a milestone; it may only
 *   sit on the plan's FINAL write step (`check-placement`). The $0 archive
 *   sweep: seed-red-check-on-an-early-step has 0 honest greens ever; the one
 *   wide closing step greens 7/7. Green-at-seed checks stay free mid-plan
 *   (the 20 TESTGEN mid-plan greens — a guard, not a goal).
 *   `priorChecks`: the check names the PREDECESSOR plan carried (replan gate
 *   only). Rule B — a redraft may not drop one (`check-shed`): exits without
 *   the check verify FORM alone, so a shed lets the run "green" unearned
 *   (u-msdsmkid mechanism b; the 3 archived sheds were all on step-red runs).
 *   `readShim` (G1): the read shim's ARM for this run — `false` (default), `'cap'`,
 *   `'diff'` or `true`. The arms that CAP (`'cap'`, `true`) add one rule: a step
 *   granting `read` must also grant `recall` and `get` (`read-blind`), because a
 *   capped read is only navigable with them. The arms that do not cap (`false`,
 *   `'diff'`) render byte-identically to the pre-shim validator, so the frozen A0
 *   baseline stays a baseline and A2 isolates the diff instead of importing an
 *   admission rule with it. An unrecognised value THROWS (`readShimArm`) — a param
 *   guard on the caller's own argument, never a plan red.
 * @returns {{ ok: boolean, reds: Red[], plan: object|null }}
 */
export function validatePlan(input, { job, maxStepRounds = 40, scopes, seedRed, priorChecks, readShim = false } = {}) {
  // The one thing in here that throws, and it is not plan data: an unknown arm
  // name is the CALLER's own argument, checked before a single plan field is
  // read. The "never throws" contract above is about the agent's artifact —
  // this is the operator's, and silently coercing it would run one arm under
  // another's label (the BA-4 param-guard class; see `readShimArm`).
  const shimArm = readShimArm(readShim);
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };

  // The signed side, fail-CLOSED (the validate.js fence-invalid pattern): the
  // ceiling/fence/menu are meaningless without a plan-shape spec, and an open
  // gate on a malformed one would validate a plan against nothing.
  // The writeScope's MEMBERS are checked here too, not just its arrayness:
  // `globToPrefix` below calls `.replace` on each one, so a non-string member
  // threw `TypeError: scope.replace is not a function` out of a function whose
  // contract is that plain data only ever yields a named red. Same
  // `isNonEmptyString` question `legalScopes` already asks of the same field.
  if (!isObj(job) || !isNonEmptyString(/** @type {any} */ (job).goal) || !Array.isArray(/** @type {any} */ (job).writeScope)
    || !(/** @type {any[]} */ (/** @type {any} */ (job).writeScope)).every(isNonEmptyString)) {
    return { ok: false, reds: [{ code: 'job-invalid', path: 'job', detail: 'a plan validates only against a validateJob-green plan shape spec (goal/verdictType/close) — validate the job first' }], plan: null };
  }
  const spec = /** @type {Record<string, any>} */ (job);
  /** the signed tool ceiling — validateJob permits omission, meaning the full menu */
  const ceiling = Array.isArray(spec.tools) ? spec.tools : [...TOOL_MENU];
  const fence = spec.writeScope.map(globToPrefix);
  const insideFence = (/** @type {string} */ p) => fence.some((f) => p === f || p.startsWith(f + '/'));
  // The check menu DERIVES from the close's stages (PRD v1.28) — the agent
  // references a piece of the operator's own inspection, never a ruler someone
  // hand-carved beside it. One derivation, shared with the runner, so what the
  // prompt offers and what the validator accepts cannot drift apart — which means
  // reading the close through `stageClose`, the same staging the runner EXECUTES
  // (W4: reading the raw field here made the legacy object form's stage invisible
  // to the validator and the prompt while the runner ran it).
  // `?? []` is the null case spelled out: a close that names no command to run
  // (gold/rubric/hitl) stages nothing, so it offers nothing — the runner
  // escalates `close-unsupported` on the same null, and an empty menu is already
  // the honest reading here (every check-passes becomes a check-unknown).
  const checkNames = checkMenu(closeStagesOf(spec) ?? []).map((m) => m.name);
  // The offered scope menu. A caller-supplied menu must be the same one the
  // prompt enumerated; with none, derive from the signed fence — fail-CLOSED,
  // so omitting the option narrows the agent's choices and never widens them.
  const scopeMenu = Array.isArray(scopes) && scopes.length ? scopes : legalScopes(spec.writeScope);

  let p = input;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch (e) {
      return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: String(/** @type {Error} */ (e).message) }], plan: null };
    }
  }
  if (!isObj(p)) return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: 'plan must be a JSON object' }], plan: null };
  const plan = /** @type {Record<string, any>} */ (p);

  // 1. shape — unknown top-level fields red (a smuggled close/checks/budget
  // lands here: the arbiter is inexpressible in the plan vocabulary)
  for (const key of Object.keys(plan)) {
    if (!PLAN_FIELDS.includes(key)) red('unknown-field', key, 'the plan vocabulary is steps only — the arbiter (close/budget/fence/checks) is signed, never planned');
  }
  if (plan.schema === undefined) red('missing-required', 'schema');
  else if (plan.schema !== 'plan-v1') red('invalid-value', 'schema', `expected "plan-v1", got ${JSON.stringify(plan.schema)}`);

  // 2. steps — ordered array (decision 7: order IS the order), bounded count
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    red('missing-required', 'steps', 'non-empty ordered array — v1 executes strictly sequentially, array order is the order');
  } else if (plan.steps.length > MAX_PLAN_STEPS) {
    red('bounds', 'steps', `max ${MAX_PLAN_STEPS} steps — per-step rounds bound the spend, the step count bounds the claim on the wallet`);
  } else {
    // Rule A-v2's anchor: the index of the plan's FINAL write-granted step. Read
    // off the RAW steps (a step whose grant didn't parse counts as non-write —
    // its own missing-required/invalid-value red already fired; deriving a
    // placement charge from the false default would be a second red for one
    // defect). -1 when no step writes: every check then reds as a mailbox anyway.
    const lastWriteIdx = plan.steps.reduce((/** @type {number} */ acc, /** @type {any} */ s, /** @type {number} */ i) => (
      isObj(s) && Array.isArray(s.tools) && s.tools.some((/** @type {unknown} */ t) => WRITE_VERBS.includes(/** @type {string} */ (t))) ? i : acc), -1);
    const seedRedNames = Array.isArray(seedRed) ? seedRed.filter(isNonEmptyString) : [];
    const seen = new Set();
    plan.steps.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
      const at = `steps.${i}`;
      if (!isObj(s)) { red('invalid-value', at, 'step must be an object'); return; }
      for (const key of Object.keys(s)) {
        if (!STEP_FIELDS.includes(key)) red('unknown-field', `${at}.${key}`, key === 'dependsOn' ? 'no dependsOn in v1 — strictly sequential, array order is the order (an inert knob is a fake contrast lever)' : 'not a step field — the arbiter is inexpressible here');
      }
      if (!isNonEmptyString(s.id) || !SLUG_RE.test(s.id)) red('invalid-value', `${at}.id`, 'kebab-case slug');
      else if (seen.has(s.id)) red('duplicate-id', `${at}.id`, s.id);
      else seen.add(s.id);

      if (!isNonEmptyString(s.action)) red('missing-required', `${at}.action`, 'the step\'s task text — a step without one is an unaimed worker');

      // tools ⊆ the SIGNED ceiling: a verb beyond it is verb-escape with the
      // verb as structured data (the ledger counts overreach per verb) — an
      // unknown string stays a typo (invalid-value), never an escape
      let writeStep = false;
      let toolsParsed = false;
      if (s.tools === undefined) red('missing-required', `${at}.tools`, 'every step declares its grant — the narrowed menu is the step boundary');
      else if (!(Array.isArray(s.tools) && s.tools.length > 0
                 && s.tools.every((/** @type {unknown} */ t) => typeof t === 'string')
                 && new Set(s.tools).size === s.tools.length)) {
        red('invalid-value', `${at}.tools`, `non-empty unique subset of the spec ceiling [${ceiling.join(', ')}]`);
      } else {
        // three disjoint classes: a LOCKED verb (run — never in any ceiling) is
        // an escape the ledger must never bury as a typo; a menu verb outside
        // the SIGNED ceiling is an escape too (overreach, not admission demand);
        // a string in neither list is a typo (invalid-value)
        const unknown = s.tools.filter((/** @type {string} */ t) => !TOOL_MENU.includes(t) && !LOCKED_TOOLS.includes(t));
        if (unknown.length) red('invalid-value', `${at}.tools`, `unknown tool(s) ${unknown.join(', ')} — menu: ${TOOL_MENU.join('|')}`);
        for (const t of s.tools.filter((/** @type {string} */ t) => LOCKED_TOOLS.includes(t))) {
          reds.push({ code: 'verb-escape', path: `${at}.tools`, verb: t, detail: `"${t}" is locked at every layer — a worker that can run commands can run its own close` });
        }
        for (const t of s.tools.filter((/** @type {string} */ t) => TOOL_MENU.includes(t) && !ceiling.includes(t))) {
          reds.push({ code: 'verb-escape', path: `${at}.tools`, verb: t, detail: `"${t}" is outside the signed ceiling [${ceiling.join(', ')}] — the plan may narrow the grant, never widen it` });
        }
        writeStep = s.tools.some((/** @type {string} */ t) => WRITE_VERBS.includes(t));
        toolsParsed = true;
        // G1 — the read shim's admission rule, and it only exists while the CAP
        // does. The shim caps a read at READ_SHIM_CAP and hands back a steer;
        // capping a worker whose grant holds no retrieval verb leaves it with no
        // way to reach the rest of the file, which is BA-17 read-blinding on
        // purpose. So the cap is what makes the pair mandatory — the two ship
        // together or neither ships.
        // Fires only inside the parsed branch (the mailbox precedent: a rule
        // derived from an unknowable grant charges the ledger for a violation
        // the agent never committed), and only per step, because the grant IS
        // the step boundary. Keyed on the ARM's g1 flag, not on "is the shim on":
        // the diff-only arm (A2) caps nothing, so there is nothing to be blind
        // about, and firing here would narrow A2's admissible plan space on top
        // of the lever it is meant to isolate.
        if (shimArm.g1 && s.tools.includes('read') && !RETRIEVAL_PAIR.every((/** @type {string} */ v) => s.tools.includes(v))) {
          const short = RETRIEVAL_PAIR.filter((v) => !ceiling.includes(v));
          red('read-blind', `${at}.tools`, `a step granting "read" must also grant ${RETRIEVAL_PAIR.join(' and ')} — reads are capped at ${READ_SHIM_CAP} bytes and the rest of a big file is reachable only through the retrieval verbs; a capped worker without them is blind to it`
            + (short.length ? ` (the signed ceiling [${ceiling.join(', ')}] offers no ${short.join('/')}: this plan cannot satisfy the rule — the spec needs re-signing with them, or the run needs the shim off)` : ''));
        }
      }

      // rounds ≤ the shell cap (cap-not-estimate; the step bound IS maxTurns)
      if (!(Number.isInteger(s.rounds) && s.rounds >= 1 && s.rounds <= maxStepRounds)) {
        red('bounds', `${at}.rounds`, `integer 1..${maxStepRounds} — the step bound is the Gate's maxTurns, it may tighten the shell cap, never exceed it`);
      }

      // P (design record 2026-07-28): the widened vocabulary — every field
      // optional, every field tighten-only, every legal set handed over as a
      // MENU (choose-don't-describe: illegal is inexpressible, never described)
      if (s.model !== undefined && !STEP_MODELS.includes(s.model)) {
        red('invalid-value', `${at}.model`, `menu: ${STEP_MODELS.join('|')} — the tier menu is signed; the agent picks a tier, never names a model`);
      }
      // `attempts` is TOLERATED-INERT (step ladder, 2026-08-03). It once tightened a
      // fixed per-step attempt count; that count is gone — a step's iterations are
      // governed by the strike ladder, and a field that could only ever TIGHTEN is
      // the wrong shape for a progress rule (drafters measurably tightened it to 3,
      // then to 2 on replan, which is the opposite of the heal a converging step
      // needs). It is no longer OFFERED in the drafting prompt, and the runner
      // ignores it.
      //
      // It is not REJECTED, and that is the load-bearing half: the frozen bridge
      // registry's stored plans carry `attempts`, and a bridge rides into the drafter
      // as a starting draft after passing the ordinary validator. Redding it here
      // would refuse every stored recipe minted before today and ruin a frozen
      // contrast experiment. The SHAPE is still checked — a known field holding
      // garbage stays a named red — but the upper bound is gone with the cap it
      // named: keeping `<= capRuns` would make a plan stored under one runner's
      // number invalid under another's, for a field that decides nothing.
      if (s.attempts !== undefined && !(Number.isInteger(s.attempts) && s.attempts >= 1)) {
        red('bounds', `${at}.attempts`, 'integer >= 1 — the field is accepted for stored-plan compatibility and bounds nothing (the step ladder governs iterations)');
      }
      if (s.scope !== undefined && !scopeMenu.includes(s.scope)) {
        red('invalid-value', `${at}.scope`, `menu: [${scopeMenu.join(', ')}] — a per-step write scope narrows the fence from the same menu tree-changed uses`);
      }
      // W3 — a step that NARROWS the fence is gated by its own scope, not the
      // signed one: planrun's mkWorker builds this step's Gate writeScope from
      // `globToPrefix(scope)`. So a TARGET that is in-fence but OUTSIDE the step's
      // own scope is a write the gate denies on every attempt — the step burns its
      // whole attempt budget on refusals and no red is raised anywhere, because
      // each half was individually legal and nothing checked the PAIR. Checking it
      // here makes the incoherent pair inexpressible at the validation gate rather
      // than discovered at the runtime one.
      //
      // The rule binds WRITES, not OBSERVATIONS. An exit is evaluated by the shell
      // (src/exits.js), never written by the worker, so the step's gate constrains
      // it only where the evaluator's own semantics say so — measured, not assumed:
      //   - `tree-changed` passes iff ANY file under ITS scope changed, so a scope
      //     that CONTAINS the step's scope contains the step's writable ground and
      //     fires exactly when the narrow one does. Only a DISJOINT scope is
      //     unsatisfiable: it can pass only if ground this gate refuses changed.
      //     Hence overlap, not containment (and the menu is shallowest-first while
      //     the prompt says copy one value, so the widest scope is the LIKELIEST
      //     draft — containment here would tax the natural plan, the exact F60
      //     class `legalScopes` exists to eliminate).
      //   - `artifact-written`/`json-valid` read and parse the named file and ask
      //     nothing about who wrote it, so a path outside the step's scope naming a
      //     PRIOR step's artifact is legal AND satisfiable (v1 is strictly
      //     sequential — that composition is the natural shape). No step-scope red
      //     belongs on those arms: it would claim a constraint the evaluator does
      //     not impose. A path nothing ever produces still fails at runtime, with
      //     the mechanical "<path> was not written (does not exist)" gap.
      //
      // Fence FIRST, narrowed scope SECOND (see the target/scope arms): the menu is
      // fence-filtered by `legalScopes`, so containment in the scope normally
      // implies containment in the fence — but a caller-supplied menu is data, and
      // deriving the fence check FROM it would let a bad menu widen what is
      // accepted. Kept as two ordered checks, the narrowed one can only tighten.
      // An OFF-MENU scope carries no narrowing (it already redded above): one
      // defect, one red — a second red derived from a value the agent cannot use
      // would charge the ledger twice for the same mistake.
      const stepScope = s.scope !== undefined && scopeMenu.includes(s.scope) ? s.scope : null;
      const stepPrefix = stepScope === null ? null : globToPrefix(stepScope);
      /** contained by the step's OWN scope — vacuously true on an unscoped step,
       * which is what keeps every pre-W3 plan byte-identical. The WRITE test. */
      const insideStepScope = (/** @type {string} */ p) => stepPrefix === null
        || p === stepPrefix || p.startsWith(stepPrefix + '/');
      /** shares ground with the step's own scope — either prefix contains the
       * other. The OBSERVATION test: what `tree-changed` needs to be satisfiable. */
      const overlapsStepScope = (/** @type {string} */ p) => stepPrefix === null
        || p === stepPrefix || p.startsWith(stepPrefix + '/') || stepPrefix.startsWith(p + '/');

      // target (v1.18): the per-step deliverable — required on write steps,
      // always inside the signed fence when present
      if (s.target === undefined || s.target === '') {
        if (writeStep) red('missing-required', `${at}.target`, 'a write-granted step declares its deliverable path (v1.18) — an untargeted write step is unattributable');
      } else if (!isNonEmptyString(s.target) || !scopeContained(s.target)) {
        red('invalid-value', `${at}.target`, 'a relative path inside the run dir — no absolute paths, no ".." segments');
      } else if (!insideFence(globToPrefix(s.target))) {
        red('scope-escape', `${at}.target`, `"${s.target}" is outside the signed fence [${spec.writeScope.join(', ')}]`);
      } else if (!insideStepScope(globToPrefix(s.target))) {
        red('step-scope-escape', `${at}.target`, `"${s.target}" is inside the signed fence but outside this step's own scope "${stepScope}" — the step's gate is built from that narrowed prefix, so every write to this target would be denied`);
      }

      validateExit(s, at, red, { checkNames, fence: spec.writeScope, insideFence, writeStep, toolsParsed, scopeMenu, stepScope, overlapsStepScope, seedRedNames, isFinalWrite: i === lastWriteIdx });
    });

    // Rule B (`check-shed`, replan gate): the caller hands over the check names
    // the PREDECESSOR plan carried; a redraft that drops one is refused. Exits
    // without the check verify FORM alone (tree-changed/artifact-written), so a
    // shed lets a step "green" with the truth unjudged — u-msdsmkid's replan
    // dropped check-passes from BOTH steps and greened unearned on form. Set
    // semantics on NAMES: where the check sits may move (A-v2 forces it to the
    // final write step); that it is judged at all may not. One red listing every
    // dropped name — one defect (the shed), one red.
    if (Array.isArray(priorChecks)) {
      const carried = new Set(plan.steps.flatMap((/** @type {any} */ s) => (isObj(s) && Array.isArray(s.exit)
        ? s.exit.filter((/** @type {any} */ e) => isObj(e) && e.type === 'check-passes' && isNonEmptyString(e.name)).map((/** @type {any} */ e) => e.name)
        : [])));
      const dropped = priorChecks.filter(isNonEmptyString).filter((n) => !carried.has(n));
      if (dropped.length) {
        red('check-shed', 'steps', `the predecessor plan carried check-passes(${dropped.join(', ')}) and this redraft drops ${dropped.length === 1 ? 'it' : 'them'} — a replan may move a check, never shed it (the remaining exits verify form only, so a shed green would be unearned)`);
      }
    }
  }

  // 3. secrets sweep — the agent-authored document is the riskier entry point
  sweepSecretLiterals(plan, red);

  return { ok: reds.length === 0, reds, plan: reds.length === 0 ? plan : null };
}

/**
 * A step's exit: AND-only conjunction from the closed menu, max 2 (decision
 * 8). Every form is declarative data the shell evaluates with its own fixed
 * code — `exit-illegal` is the arbiter-inexpressibility red.
 * @param {Record<string, any>} s the step
 * @param {string} at step path prefix
 * @param {(code: string, path: string, detail?: string) => void} red
 * @param {{ checkNames: string[], fence: string[], insideFence: (p: string) => boolean, writeStep: boolean, toolsParsed: boolean, scopeMenu: string[], stepScope: string|null, overlapsStepScope: (p: string) => boolean, seedRedNames: string[], isFinalWrite: boolean }} ctx
 *   `stepScope`/`overlapsStepScope` (W3): the step's OWN narrowed fence when it
 *   declared a legal `scope`, null/always-true otherwise. Exits are OBSERVATIONS,
 *   not writes, so only `tree-changed` is constrained by it and only against
 *   DISJOINTness — see the arm for the measured semantics.
 *   `seedRedNames`/`isFinalWrite` (Rule A-v2): the preflight-red check names and
 *   whether THIS step is the plan's final write step — see the check-passes arm.
 */
function validateExit(s, at, red, { checkNames, fence, insideFence, writeStep, toolsParsed, scopeMenu, stepScope, overlapsStepScope, seedRedNames, isFinalWrite }) {
  if (!Array.isArray(s.exit) || s.exit.length === 0) {
    red('missing-required', `${at}.exit`, `non-empty array from the closed menu ${EXIT_TYPES.join('|')} — ALL listed exits must pass (AND-only); a step without an exit has no progress gate`);
    return;
  }
  if (s.exit.length > MAX_EXITS_PER_STEP) {
    red('exit-illegal', `${at}.exit`, `max ${MAX_EXITS_PER_STEP} exits — AND-only conjunction, bounded (decision 8)`);
    return;
  }
  let hasTreeChanged = false;
  let hasCheck = false;
  s.exit.forEach((/** @type {any} */ e, /** @type {number} */ i) => {
    const eAt = `${at}.exit.${i}`;
    if (!isObj(e) || !EXIT_TYPES.includes(e.type)) {
      red('exit-illegal', eAt, `menu: ${EXIT_TYPES.join('|')} — an exit is declarative data the shell evaluates with its own fixed code, never a command`);
      return;
    }
    for (const key of Object.keys(e)) {
      if (!EXIT_FIELDS[e.type].includes(key)) red('unknown-field', `${eAt}.${key}`, `not a ${e.type} field (commands and script bodies land here)`);
    }
    if (e.type === 'check-passes') {
      hasCheck = true;
      if (!isNonEmptyString(e.name)) red('invalid-value', `${eAt}.name`, 'the signed check\'s name');
      else if (!checkNames.includes(e.name)) {
        // decision 1: a check the spec doesn't sign DOES NOT EXIST — and the
        // detail names the signed menu so the replan can aim, not guess
        red('check-unknown', eAt, `"${e.name}" is not an offered close stage — the agent references stages of the operator's close, never authors a ruler; offered: [${checkNames.join(', ') || 'none'}]`);
      } else if (seedRedNames.includes(e.name) && writeStep && !isFinalWrite) {
        // Rule A-v2 (`check-placement`): a check that was RED at preflight is
        // the GOAL itself, not a milestone — it judges the whole territory, so
        // an earlier step scoped to a slice can never satisfy it without
        // crossing its own boundary (the bareagent-u death shape: 0 honest
        // greens in the whole archive; the wide closing step greens 7/7). Only
        // on a WRITE step and only when the anchor exists elsewhere: a
        // read-only step already redded as a mailbox (one defect, one red),
        // and a green-at-seed check is a guard, free to sit anywhere.
        red('check-placement', eAt, `"${e.name}" was RED at preflight — a failing check is the goal itself and may only gate the plan's FINAL write step (make that step wide: free to edit any file it reports, iterating until it passes); an earlier step scoped to a slice can never satisfy a whole-goal check`);
      }
    } else if (e.type === 'tree-changed') {
      hasTreeChanged = true;
      // choose-don't-describe: membership of the enumerated menu, NOT a shape
      // grammar the agent has to guess (§4; F60's 72%-of-all-reds class). The
      // menu derives from the signed writeScope when the caller passes none, so
      // omitting the option can never restore free-text containment — a
      // silently-ignored optional param is the F50 blind-instrument class. Every
      // menu comes from `legalScopes`, which filters by the fence, so
      // scope-escape here is inexpressible rather than checked.
      // An off-menu scope splits by CAUSE, because the two carry different
      // meaning to the ledger's class table: reaching OUTSIDE the signed fence is
      // a behaviour signal about the agent (`scope-escape`, same code the target
      // and path arms raise), while an in-fence value that simply is not offered
      // is drafting friction (`invalid-value`, and the detail carries the menu so
      // the redraft can choose instead of guess). Collapsing them would launder an
      // attempted fence escape into a typo class.
      if (!isNonEmptyString(e.scope) || !scopeMenu.includes(e.scope)) {
        const contained = isNonEmptyString(e.scope) && scopeContained(e.scope);
        if (contained && !insideFence(globToPrefix(e.scope))) {
          red('scope-escape', `${eAt}.scope`, `"${e.scope}" is outside the signed fence [${fence.join(', ')}]`);
        } else {
          red('invalid-value', `${eAt}.scope`, `one of the offered scopes: [${scopeMenu.join(', ')}]`);
        }
      } else if (!overlapsStepScope(globToPrefix(e.scope))) {
        // W3: an offered, in-fence scope can still be DISJOINT from the step's own
        // narrowed fence. Measured against src/exits.js: `tree-changed` passes iff
        // some file under ITS scope changed against the pre-step snapshot, and that
        // snapshot already holds every earlier step's bytes — so a disjoint scope
        // can only pass if ground this step's gate refuses changed. Unsatisfiable on
        // every attempt, which is exactly the burn W3 closes.
        // A WIDER (containing) scope is NOT redded: it contains the step's writable
        // ground and fires exactly when the narrow one does.
        red('step-scope-escape', `${eAt}.scope`, `"${e.scope}" is disjoint from this step's own scope "${stepScope}" — the step's gate allows writes only under "${stepScope}", and this exit passes only if a file under "${e.scope}" changed, so no write this step can make would ever satisfy it (a scope that contains "${stepScope}" is fine)`);
      }
    } else { // artifact-written | json-valid — a named file path inside the fence
      // NO step-scope check here, deliberately (W3): src/exits.js reads and parses
      // the named file and asks nothing about who wrote it, so a path outside the
      // step's own scope naming a PRIOR step's artifact is legal AND satisfiable —
      // and v1 is strictly sequential, so that composition is the natural shape.
      // A red would claim a constraint the evaluator does not impose. A path nothing
      // ever produces still fails at runtime with the mechanical "was not written"
      // gap — the honest direction, versus taxing a legal draft with a redraft.
      if (!isNonEmptyString(e.path) || !scopeContained(e.path)) {
        red('invalid-value', `${eAt}.path`, 'a relative file path inside the run dir — no absolute paths, no ".." segments');
      } else if (!insideFence(globToPrefix(e.path))) {
        red('scope-escape', `${eAt}.path`, `"${e.path}" is outside the signed fence [${fence.join(', ')}]`);
      }
      if (e.type === 'artifact-written' && e.pattern !== undefined) {
        if (!isNonEmptyString(e.pattern)) red('invalid-value', `${eAt}.pattern`, 'regex source string');
        else {
          let compiled = false;
          try { new RegExp(e.pattern, 'm'); compiled = true; }
          catch { red('invalid-value', `${eAt}.pattern`, 'must compile as a RegExp'); }
          // F49: a compiled-but-catastrophic pattern (nested unbounded
          // quantifier) can hang the untimed exit evaluator — reject it here as
          // a mechanical gap so the replan rewrites it, before any tokens burn.
          if (compiled && hasNestedQuantifier(e.pattern)) {
            red('invalid-value', `${eAt}.pattern`, `nested unbounded quantifier (e.g. (a+)+ , (\\d*)* , (x+){1,}) — a catastrophic-backtracking footgun that can hang the exit evaluator (F49); rewrite without a repeated group inside a repeat`);
          }
        }
      }
    }
  });
  // The F17 pairing rule: the seed tree is green, so a lone check-passes on a
  // write-granted step would pass on the UNTOUCHED repo — an unearned exit.
  // The POC's changed-from-seed stage existed for exactly this; here it is a
  // validation law, stated in the plan itself (never hardwired shell code).
  if (writeStep && hasCheck && !hasTreeChanged) {
    red('exit-illegal', `${at}.exit`, 'check-passes on a write-granted step requires the tree-changed conjunct — the seed tree is green, so a lone check would pass on the untouched repo (F17/F46 already-green trap)');
  }
  // The inverse trap, measured (runs ms4l5p6w/ms57zr7c: 4 of 4 drafted plans):
  // a failing check's gap is re-delivered to THIS step's own worker, so a step
  // holding a check must be able to act on it. A read-only "verify" step is a
  // mailbox with no hands — the gap arrives, nothing can edit, the loop stalls
  // to cap on a byte-identical gap. The outer close is the run's verification;
  // forbidding this shape pushes the check onto the step that fixes (the one
  // shape that has ever greened this job).
  // …and only when the grant PARSED: with `tools` missing/malformed the step's
  // hands are unknowable, and a mailbox red derived from the false default would
  // charge the ledger with a violation the agent never committed (the real
  // defect already redded as missing-required/invalid-value). One defect, one red.
  if (toolsParsed && !writeStep && hasCheck) {
    red('exit-illegal', `${at}.exit`, `check-passes on a step with no write-class tool (${WRITE_VERBS.join('|')}) — the check's failure gap comes back to this step's own worker, which cannot edit; attach the check to the step that fixes (the operator's close already verifies the finished run)`);
  }
}
