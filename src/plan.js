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
//   exits from the closed menu only        → `exit-illegal` (arbiter
//     inexpressibility: an exit is declarative data the shell evaluates with
//     its own fixed code — `run` cannot be laundered through it)
//   check references resolve against the SIGNED checks menu → `check-unknown`
//     (decision 1: a check the spec doesn't sign does not exist)
//
// Like its siblings (validate.js, job.js) it never throws on JSON text or
// plain parsed data; every failure is a named {code, path, detail} red.

import { TOOL_MENU, LOCKED_TOOLS } from './job.js';
import { globToPrefix, scopeContained, isObj, isNonEmptyString, sweepSecretLiterals } from './validate.js';

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
 * and the v1.18 target requirement */
export const WRITE_VERBS = Object.freeze(['write', 'edit']);
const PLAN_FIELDS = ['schema', 'steps'];
// decision 7: NO dependsOn — v1 is strictly sequential, array order IS the
// order; a field nothing consumes is a live-looking knob with zero effect
// (the F16 inert-op class). The arbiter's own vocabulary (close, budget,
// fence) is absent by construction — unknown-field at every depth.
const STEP_FIELDS = ['id', 'action', 'tools', 'rounds', 'target', 'exit'];
const EXIT_FIELDS = {
  'artifact-written': ['type', 'path', 'pattern'],
  'tree-changed': ['type', 'scope'],
  'json-valid': ['type', 'path'],
  'check-passes': ['type', 'name'],
};
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Length of an UNBOUNDED quantifier token at `src[i]` (`*`, `+`, or `{n,}`,
 * plus an optional trailing lazy `?`), or 0. Bounded forms (`?`, `{n}`,
 * `{n,m}`) return 0: they cannot drive exponential backtracking (a bounded
 * outer repeat is polynomial at worst, and the body is self-authored — F49).
 * @param {string} src @param {number} i */
function unboundedQuantLen(src, i) {
  let len = src[i] === '*' || src[i] === '+' ? 1 : 0;
  if (!len && src[i] === '{') { const m = /^\{\d+,\}/.exec(src.slice(i)); if (m) len = m[0].length; }
  if (len && src[i + len] === '?') len++; // the lazy modifier is part of the same token
  return len;
}

/**
 * F49 — a heuristic reject for the catastrophic-backtracking footgun: an
 * unbounded quantifier applied to a group whose body itself repeats unboundedly
 * (`(a+)+`, `(\d*)*`, `([a-z]+){1,}`) — including through a redundant wrapping
 * group (`((a+))+`, `(?:(a+))*`), which is the SAME exponential class as `(a+)+`
 * and is caught by propagating the inner repeat up through the wrapper. Such a
 * pattern can hang `RegExp.test` for
 * seconds on a short crafted body, and `evalExits` runs the agent-authored
 * `artifact-written` pattern with NO timeout. This is self-DoS only — the agent
 * authors both the pattern and (via the worker) the artifact, so a hang burns
 * only its own run's wall-clock; there is NO arbiter compromise (it cannot
 * escape the fence, forge a green, or leak a secret). So the reject targets the
 * dominant exponential class and fails it as a mechanical gap at the validation
 * gate, before any tokens burn. A full ReDoS analyzer needs a real regex engine
 * (an external native dep we do not take for a LOW issue); exotic
 * overlapping-alternation blowup is out of scope by decision.
 *
 * SCOPE IS ASYMMETRIC, both directions named on purpose:
 *   - false NEGATIVE: overlapping-alternation blowup (`(a|ab)+`-class) is not
 *     detected — out of scope (self-DoS only, no arbiter compromise).
 *   - false POSITIVE: a group whose repetitions are disambiguated by a literal
 *     anchor/delimiter (`(?:^- .+$\n?)+`, `(?:CHANGELOG:.+\n)+`) is FLAGGED even
 *     though a real engine runs it linearly — the scan sees the nested-quantifier
 *     SHAPE, not the disambiguation. Rejecting it is the FAIL-SAFE direction (it
 *     never admits an unsafe pattern), and the cost is bounded: the plan drafter
 *     gets a mechanical gap and rewrites (drop the outer `+`, or match once).
 *     Detecting "safe because anchored" needs the same real engine we declined,
 *     and guessing it wrong would ADMIT an exponential pattern — so the shape
 *     reject stands, and the over-rejection is a named, accepted limitation.
 *
 * The input is guaranteed to compile as a RegExp (checked first by the caller),
 * so this scan assumes valid, balanced JS regex syntax.
 * @param {string} src a compiled regex source string
 * @returns {boolean} true iff a nested unbounded quantifier is present
 */
export function hasNestedQuantifier(src) {
  /** @type {{ quant: boolean }[]} */
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }          // escaped atom — the next char is a literal
    if (c === '[') {                            // character class: quantifier chars inside are literals
      i++;
      if (src[i] === '^') i++;
      if (src[i] === ']') i++;                  // a leading ] is a literal member, not the close
      while (i < src.length && src[i] !== ']') { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '(') { stack.push({ quant: false }); continue; }
    if (c === ')') {
      const g = stack.pop();
      const qlen = unboundedQuantLen(src, i + 1);
      if (g && g.quant && qlen) return true;    // group repeats unboundedly AND its body did too
      // The group is an unbounded-repeated atom of its parent when it is directly
      // re-quantified (qlen) OR its own body already repeats unboundedly (g.quant):
      // a redundant wrapper — ((a+))+ , (?:(a+))* , (((\d*)))+ — is the SAME
      // exponential class as (a+)+, so an inner repeat must propagate THROUGH the
      // enclosing group or the outer quantifier's close never sees it. Propagation
      // is MONOTONIC (it only ever SETS quant=true → only ever adds rejections): it
      // can widen over-rejection — the named FAIL-SAFE direction — but can never
      // introduce a false negative, which is the dangerous one (F49).
      if ((qlen || (g && g.quant)) && stack.length) stack[stack.length - 1].quant = true;
      i += qlen;
      continue;
    }
    const qlen = unboundedQuantLen(src, i);     // a quantifier applying to the preceding atom, inside the current group
    if (qlen) { if (stack.length) stack[stack.length - 1].quant = true; i += qlen - 1; }
  }
  return false;
}

/** @typedef {{code: string, path: string, detail?: string, verb?: string}} Red */

/**
 * Validate an agent-authored plan (`schema: "plan-v1"`) against the SIGNED
 * job spec. Never throws on JSON text or plain parsed data; every failure is
 * a named red. Returns the parsed plan on ok (single parse), null on any red.
 * @param {object|string} input parsed plan, or raw JSON text (parse failures are a red)
 * @param {{ job?: any, maxStepRounds?: number }} [opts] `job`: the
 *   validateJob-GREEN four-field spec (the ceiling, the fence, and the checks
 *   menu all come from it — a missing or non-plan-shape job fails CLOSED);
 *   `maxStepRounds`: the shell's per-step rounds ceiling (interpret's
 *   tool-mode TURNS_PER_ATTEMPT) — a step may tighten it, never exceed it.
 * @returns {{ ok: boolean, reds: Red[], plan: object|null }}
 */
export function validatePlan(input, { job, maxStepRounds = 40 } = {}) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };

  // The signed side, fail-CLOSED (the validate.js fence-invalid pattern): the
  // ceiling/fence/menu are meaningless without a plan-shape spec, and an open
  // gate on a malformed one would validate a plan against nothing.
  if (!isObj(job) || !isNonEmptyString(/** @type {any} */ (job).goal) || !Array.isArray(/** @type {any} */ (job).writeScope)) {
    return { ok: false, reds: [{ code: 'job-invalid', path: 'job', detail: 'a plan validates only against a validateJob-green plan shape spec (goal/verdictType/close/checks[]) — validate the job first' }], plan: null };
  }
  const spec = /** @type {Record<string, any>} */ (job);
  /** the signed tool ceiling — validateJob permits omission, meaning the full menu */
  const ceiling = Array.isArray(spec.tools) ? spec.tools : [...TOOL_MENU];
  const fence = spec.writeScope.map(globToPrefix);
  const insideFence = (/** @type {string} */ p) => fence.some((f) => p === f || p.startsWith(f + '/'));
  const checkNames = Array.isArray(spec.checks) ? spec.checks.map((/** @type {any} */ c) => c?.name).filter(isNonEmptyString) : [];

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
      }

      // rounds ≤ the shell cap (cap-not-estimate; the step bound IS maxTurns)
      if (!(Number.isInteger(s.rounds) && s.rounds >= 1 && s.rounds <= maxStepRounds)) {
        red('bounds', `${at}.rounds`, `integer 1..${maxStepRounds} — the step bound is the Gate's maxTurns, it may tighten the shell cap, never exceed it`);
      }

      // target (v1.18): the per-step deliverable — required on write steps,
      // always inside the signed fence when present
      if (s.target === undefined || s.target === '') {
        if (writeStep) red('missing-required', `${at}.target`, 'a write-granted step declares its deliverable path (v1.18) — an untargeted write step is unattributable');
      } else if (!isNonEmptyString(s.target) || !scopeContained(s.target)) {
        red('invalid-value', `${at}.target`, 'a relative path inside the run dir — no absolute paths, no ".." segments');
      } else if (!insideFence(globToPrefix(s.target))) {
        red('scope-escape', `${at}.target`, `"${s.target}" is outside the signed fence [${spec.writeScope.join(', ')}]`);
      }

      validateExit(s, at, red, { checkNames, fence: spec.writeScope, insideFence, writeStep });
    });
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
 * @param {{ checkNames: string[], fence: string[], insideFence: (p: string) => boolean, writeStep: boolean }} ctx
 */
function validateExit(s, at, red, { checkNames, fence, insideFence, writeStep }) {
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
        red('check-unknown', eAt, `"${e.name}" is not a signed check — the agent references checks, never authors them; signed menu: [${checkNames.join(', ') || 'none'}]`);
      }
    } else if (e.type === 'tree-changed') {
      hasTreeChanged = true;
      if (!isNonEmptyString(e.scope) || !scopeContained(e.scope) || globToPrefix(e.scope).includes('*')) {
        red('invalid-value', `${eAt}.scope`, 'a contained scope (trailing /** or /* only, no ".." or absolute)');
      } else if (!insideFence(globToPrefix(e.scope))) {
        red('scope-escape', `${eAt}.scope`, `"${e.scope}" is outside the signed fence [${fence.join(', ')}]`);
      }
    } else { // artifact-written | json-valid — a named file path inside the fence
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
}
