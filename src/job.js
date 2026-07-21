// Job-spec validator — the OPERATOR-owned half of the config story (N1,
// design record: docs/plans/2026-07-12-n1-job-close-schema-design.md).
// A job spec is the arbiter's rulebook: the close chain, the budget, the
// outer write fence, the escalation route. It is pure declarative data —
// no freeform code is expressible anywhere in it — and it validates
// reds-before-tokens like its sibling validate.js (workflow, agent-authored).
// The arbiter split is guarded from both sides by INEXPRESSIBILITY: the
// workflow config cannot say close/provider (validate.js, shipped at N0);
// the job spec cannot say hooks/loop/memory, any minting claim, or the
// shell-owned retry cap — all unknown-field reds here.
//
// Close-authoring hierarchy (PRD §7) as a class menu keyed by close type:
// verdict-class laundering (a rubric claiming hard) is a named red, never a
// judgment call. Minting policy is product doctrine, not job-authorable.

import { createHash } from 'node:crypto';
import { globToPrefix, scopeContained, isObj, isNonEmptyString, sweepSecretLiterals } from './validate.js';

// The menus below ARE the close-authoring hierarchy (PRD §7) and ship frozen:
// they are read at call time, so a mutable export would let adopter code
// enable verdict-class laundering process-wide with one push().
export const CLOSE_TYPES = Object.freeze(['predicate', 'gold', 'rubric', 'hitl']);
export const CLASSES = Object.freeze(['hard', 'soft', 'hitl']);
/** the hierarchy: which verdict classes a close type may claim (PRD §7) */
export const CLASS_BY_CLOSE = Object.freeze({ predicate: Object.freeze(['hard']), gold: Object.freeze(['hard']), rubric: Object.freeze(['soft']), hitl: Object.freeze(['hitl']) });
export const GOLD_COMPARE = Object.freeze(['exact', 'json-equal']);
/** step middle modes (2b): text = single-target artifact; tools = Gate-governed file tools */
export const STEP_MODES = Object.freeze(['text', 'tools']);
/** the tool grant menu (2b interview #1): read/grep/write, plus the two litectx
 * RETRIEVAL verbs (F19) — `run` stays locked-but-listed; a spec requesting it
 * reds, and that red IS the request-red evidence admission waits on (curation
 * doctrine, PRD F2).
 *
 * `recall`/`get` are READ-ONLY BY CONSTRUCTION, not by promise: `recall` returns
 * pointers (path/symbol/line-range, no bodies) and `get` trades ONE pointer for
 * ONE chunk — it refuses any range that is not a chunk boundary, so it cannot be
 * widened into a whole-file read, and it is content-hash gated (a drifted file
 * throws rather than serving a stale body). Admitting them does NOT weaken the
 * `run` lock: the worker still cannot execute anything, so it still cannot run
 * its own close (the arbiter). F19: `shell_read` starts at byte ZERO and cannot
 * seek, so a pointer was INERT — the worker paged 1.37 MB of source through
 * context to reach 8 lines. The ranged read is the pager.
 *
 * `edit` (BA-13, bare-agent 0.29.0) is the anchored exact-once replace — a
 * WRITE-class verb judged by the SAME writeScope fence as `write` (bareguard
 * action type 'edit'). Admitted because whole-file rewrite is measurably
 * unreliable at size (F31: 4 of 5 big-file whole-writes broke the tree) and
 * taxes output tokens ∝ file size. It admits no execution either. */
export const TOOL_MENU = Object.freeze(['read', 'grep', 'write', 'edit', 'recall', 'get']);
/** locked-but-listed tools: real capabilities deliberately outside the grant
 * menu. Requesting one is a DISTINCT `request-red` (module 4) — the ledger
 * counts admission demand, and a generic invalid-value would bury it as a typo. */
export const LOCKED_TOOLS = Object.freeze(['run']);
/** Layer 2 (design record 2026-07-21, decision 5): the verdict-type radio of
 * the four-field plan shape. v1 ADMITS only `green`; soft-green/hitl are
 * declared-but-locked — declaring one is a `request-red` (the tool-menu
 * pattern: disclosure ≠ admission), so the ledger counts the demand and the
 * non-code rung later fills a declared slot instead of reshaping the schema. */
export const VERDICT_TYPES = Object.freeze(['green', 'soft-green', 'hitl']);
export const LOCKED_VERDICTS = Object.freeze(['soft-green', 'hitl']);
/** which close CLASS a declared verdictType demands — the close hierarchy one
 * level up: the same laundering guard as CLASS_BY_CLOSE, applied to the plan
 * shape's single close (green on a rubric would be a fake-hard verdict). */
const CLASS_BY_VERDICT = Object.freeze({ green: 'hard', 'soft-green': 'soft', hitl: 'hitl' });
export const CADENCE_UNITS = Object.freeze(['hour', 'day', 'week']);
/** SP-2: API-first; local deferred (PRD §5/§8). `clipipe-subscription` (F42,
 * bare-agent 0.32.0 tool mode): the CLI as a bare turn-provider on a Claude
 * subscription — its costUsd axis is NOTIONAL (API-equivalent value, not
 * billed), so it is a DISTINCT condition: rows never pool with anthropic-api
 * rows on the cost axis, and budgets sized for one do not transfer. */
export const PROVIDERS = Object.freeze(['anthropic-api', 'clipipe-subscription']);
/** V3 environment label: declared keys only — every field is a lineage-key
 * candidate at N3. `provider` is part of the key by definition (top-level,
 * not duplicated here). */
export const CONDITION_KEYS = Object.freeze(['providerPath', 'closeVerbosity', 'taskFraming', 'scaffold']);
const JOB_FIELDS = ['schema', 'job', 'description', 'provider', 'conditions', 'cadence', 'budgetUsd', 'writeScope', 'steps', 'escalation', 'goal', 'verdictType', 'close', 'checks', 'tools'];
/** the four-field plan shape's core (decision 5) — presence of any of these
 * declares the shape; `tools` (the ceiling) rides the shape but alone does not
 * declare it, so a legacy spec carrying it gets a pointed red, not a conflict */
const PLAN_CORE_FIELDS = ['goal', 'verdictType', 'close', 'checks'];
/** exact field set per close type — anything else is an unknown-field red
 * (freeform code, script bodies, and minting claims all land there) */
const CLOSE_FIELDS = {
  predicate: ['type', 'cmd', 'expect', 'judged', 'gapKeep'],
  gold: ['type', 'expected', 'compare'],
  rubric: ['type', 'criteria'],
  hitl: ['type', 'prompt'],
};
/** a named check (decision 1) IS the predicate-close body plus a name — same
 * fields, same validator, same runClose machinery (a second command shape
 * would be the F9 two-transforms class one level up) */
const CHECK_FIELDS = ['name', 'cmd', 'expect', 'judged', 'gapKeep'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** @typedef {{code: string, path: string, detail?: string, verb?: string}} Red — `verb` rides request-reds as structured data (the ledger keys on it, never on prose) */

/**
 * Validate an operator-owned job spec (`schema: "job-v1"`). Never throws on
 * JSON text or plain parsed data — the ingest contract; a live object with a
 * hostile accessor is outside it. Every failure is a named red. Returns the
 * parsed spec on ok (single parse), null on any red.
 * @param {object|string} input parsed spec, or raw JSON text (parse failures are a red)
 * @param {{ shellCapUsd?: number }} [opts] the shell's hard ceiling — the job
 *   budget may tighten it, never exceed it (ceiling chain: workflow ≤ job ≤ shell)
 * @returns {{ ok: boolean, reds: Red[], job: object|null }}
 */
export function validateJob(input, { shellCapUsd = 2 } = {}) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };

  let j = input;
  if (typeof j === 'string') {
    try { j = JSON.parse(j); } catch (e) {
      return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: String(/** @type {Error} */ (e).message) }], job: null };
    }
  }
  if (!isObj(j)) return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: 'job spec must be a JSON object' }], job: null };
  const spec = /** @type {Record<string, any>} */ (j);

  // 1. shape — unknown fields red here: hooks/loop/memory (agent domain),
  // capRuns (shell domain), minting claims — inexpressibility is the guard.
  for (const key of Object.keys(spec)) {
    if (!JOB_FIELDS.includes(key)) red('unknown-field', key);
  }
  if (spec.schema === undefined) red('missing-required', 'schema');
  else if (spec.schema !== 'job-v1') red('invalid-value', 'schema', `expected "job-v1", got ${JSON.stringify(spec.schema)}`);
  if (!isNonEmptyString(spec.job) || !SLUG_RE.test(spec.job)) red('invalid-value', 'job', 'kebab-case slug');
  if (!isNonEmptyString(spec.description)) red('missing-required', 'description');

  if (spec.provider === undefined) red('missing-required', 'provider');
  else if (!PROVIDERS.includes(spec.provider)) red('invalid-value', 'provider', `menu: ${PROVIDERS.join('|')}`);

  // 2. the environment label (V3, design law #5): declared keys only
  if (spec.conditions !== undefined) {
    if (!isObj(spec.conditions)) red('invalid-value', 'conditions', 'flat object of declared condition keys');
    else {
      for (const [key, value] of Object.entries(spec.conditions)) {
        if (!CONDITION_KEYS.includes(key)) red('unknown-field', `conditions.${key}`, `declared keys only: ${CONDITION_KEYS.join('|')} (every field is a lineage-key dimension, V3)`);
        else if (!isNonEmptyString(value)) red('invalid-value', `conditions.${key}`, 'non-empty string');
      }
    }
  }

  if (spec.cadence === undefined) red('missing-required', 'cadence');
  else if (!isObj(spec.cadence)) red('invalid-value', 'cadence', 'object of {unit, every}');
  else {
    const cad = spec.cadence;
    for (const key of Object.keys(cad)) {
      if (key !== 'unit' && key !== 'every') red('unknown-field', `cadence.${key}`, 'nested objects red unknown keys too — no smuggling level exists in a signed spec');
    }
    if (!CADENCE_UNITS.includes(cad.unit)) red('invalid-value', 'cadence.unit', CADENCE_UNITS.join('|'));
    if (!(Number.isInteger(cad.every) && cad.every >= 1 && cad.every <= 30)) red('bounds', 'cadence.every', '1..30');
  }

  if (spec.budgetUsd === undefined) red('missing-required', 'budgetUsd');
  else if (!(typeof spec.budgetUsd === 'number' && spec.budgetUsd > 0 && spec.budgetUsd <= shellCapUsd)) {
    red('bounds', 'budgetUsd', `0 < budget <= shell cap ${shellCapUsd} (cap-not-estimate; no self-adjusted budgets, ever)`);
  }

  // 3. the outer write fence — operator law (interview decision #4), same
  // containment rules as the workflow layer THROUGH THE SAME CODE (F9: two
  // transforms would let a fence validate green and mean something else).
  if (spec.writeScope === undefined) red('missing-required', 'writeScope', 'the fence is operator law — the workflow scope must fit inside it');
  else if (!(Array.isArray(spec.writeScope) && spec.writeScope.length > 0
             && spec.writeScope.every((/** @type {unknown} */ s) => isNonEmptyString(s)))) {
    red('invalid-value', 'writeScope', 'non-empty array of glob strings');
  } else if (!spec.writeScope.every((/** @type {string} */ s) => !globToPrefix(s).includes('*'))) {
    red('invalid-value', 'writeScope', 'wildcards only as a trailing "/**" or "/*" (enforcement is prefix-containment, adaptlearn F9)');
  } else if (!spec.writeScope.every(scopeContained)) {
    red('invalid-value', 'writeScope', 'must be a proper subdirectory of the run directory — no absolute paths, no ".." segments, not the run dir itself (design law #1)');
  }

  if (spec.escalation === undefined) red('missing-required', 'escalation.mode', 'the pain channel is not optional (law #7)');
  else {
    const esc = isObj(spec.escalation) ? spec.escalation : {};
    for (const key of Object.keys(esc)) {
      if (key !== 'mode') red('unknown-field', `escalation.${key}`, 'nested objects red unknown keys too — no smuggling level exists in a signed spec');
    }
    if (esc.mode !== 'decision-ready') red('invalid-value', 'escalation.mode', 'must be "decision-ready"');
  }

  // 4. the two shapes (design record 2026-07-21, decisions 5+6): EITHER the
  // legacy operator-authored steps[] chain (co-existing scaffolding, staged
  // sunset — archives alongside config-v1 when the Layer 2 path proves itself)
  // OR the four-field plan shape (goal/verdictType/close/checks[]) where the
  // AGENT authors the step plan at run time. Never both: a spec carrying both
  // would let one shape ride the other as a smuggle channel.
  const hasSteps = spec.steps !== undefined;
  const hasPlanCore = PLAN_CORE_FIELDS.some((f) => spec[f] !== undefined);
  if (hasSteps && hasPlanCore) {
    red('shape-conflict', 'steps', 'EITHER operator-authored steps[] OR the plan shape (goal/verdictType/close/checks[]) — never both (design record 2026-07-21, decision 6)');
  } else if (!hasSteps) {
    if (hasPlanCore || spec.tools !== undefined) validatePlanShape(spec, red, reds);
    else red('missing-required', 'steps', 'one shape is required: operator-authored steps[] (legacy, staged sunset) or the plan shape goal/verdictType/close/checks[]');
  } else if (spec.tools !== undefined) {
    red('invalid-value', 'tools', 'the tool ceiling is a plan-shape field — a legacy steps[] spec grants tools per step');
  } else if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
    red('missing-required', 'steps', 'non-empty array — a job without closes is ungated spend');
  } else {
    const seen = new Set();
    spec.steps.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
      const at = `steps.${i}`;
      if (!isObj(s)) { red('invalid-value', at, 'step must be an object'); return; }
      for (const key of Object.keys(s)) {
        if (!['id', 'close', 'class', 'mode', 'tools'].includes(key)) red('unknown-field', `${at}.${key}`);
      }
      // mode/tools — the spec-side tool grant (2b decision #2: the human job
      // spec owns mode + menu; the drafted config cannot express either)
      const isHitl = isObj(s.close) && s.close.type === 'hitl';
      if ((s.mode !== undefined || s.tools !== undefined) && isHitl) {
        red('invalid-value', `${at}.mode`, 'hitl steps run no loop — mode/tools do not apply');
      } else {
        if (s.mode !== undefined && !STEP_MODES.includes(s.mode)) red('invalid-value', `${at}.mode`, STEP_MODES.join('|'));
        if (s.tools !== undefined) {
          if (s.mode !== 'tools') red('invalid-value', `${at}.tools`, 'a tool grant requires mode "tools" — a grant without the mode is incoherent');
          else if (!(Array.isArray(s.tools) && s.tools.length > 0
                     && s.tools.every((/** @type {unknown} */ t) => typeof t === 'string')
                     && new Set(s.tools).size === s.tools.length)) {
            red('invalid-value', `${at}.tools`, `non-empty unique subset of ${TOOL_MENU.join('|')}`);
          } else {
            // locked-but-listed asks red DISTINCTLY: request-red is the admission
            // evidence the ledger tallies (two-red routing); a typo stays invalid-value
            for (const t of s.tools.filter((/** @type {string} */ t) => LOCKED_TOOLS.includes(t))) {
              // verb as a structured field: the ledger keys admission demand on it;
              // parsing it back out of the prose detail would break on a rewording
              reds.push({ code: 'request-red', path: `${at}.tools`, verb: t, detail: `"${t}" is locked-but-listed — this red IS the admission evidence, never a grant; granted menu: ${TOOL_MENU.join('|')}` });
            }
            const unknown = s.tools.filter((/** @type {string} */ t) => !TOOL_MENU.includes(t) && !LOCKED_TOOLS.includes(t));
            if (unknown.length) red('invalid-value', `${at}.tools`, `unknown tool(s) ${unknown.join(', ')} — menu: ${TOOL_MENU.join('|')}`);
          }
        }
      }
      if (!isNonEmptyString(s.id) || !SLUG_RE.test(s.id)) red('invalid-value', `${at}.id`, 'kebab-case slug');
      else if (seen.has(s.id)) red('duplicate-id', `${at}.id`, s.id);
      else seen.add(s.id);

      if (s.class === undefined) red('missing-required', `${at}.class`);
      else if (!CLASSES.includes(s.class)) red('invalid-value', `${at}.class`, CLASSES.join('|'));

      if (!isObj(s.close)) { red('missing-required', `${at}.close`, 'every step names its close — a step without one is ungated spend'); return; }
      const close = s.close;
      if (!validateClose(close, `${at}.close`, red)) return;
      // the hierarchy: one check covers both directions — a class outside the
      // close type's menu is laundering (rubric-as-hard) or delegation
      // (hitl-class on a script close); hitl ⇔ hitl falls out of the menus.
      const legal = CLASS_BY_CLOSE[close.type];
      if (CLASSES.includes(s.class) && !legal.includes(s.class)) {
        red('close-hierarchy', `${at}.class`, `${close.type} close admits class ${legal.join('|')} only (a rubric can never be hard; a human IS the hitl close — PRD §7)`);
      }
    });
  }

  // 5. secrets sweep — the SAME shared guard the workflow validator runs
  // (defense-in-depth against known token shapes; env-only loading is the law)
  sweepSecretLiterals(spec, red);

  return { ok: reds.length === 0, reds, job: reds.length === 0 ? spec : null };
}

/**
 * Per-type close contract — fixed menus only. ONE home for both call sites
 * (a legacy step's close, the plan shape's top-level close): two copies would
 * be the F9 two-transforms class on the arbiter's own contract.
 * @param {Record<string, any>} close
 * @param {string} at path prefix of the close object (e.g. `steps.0.close`, `close`)
 * @param {(code: string, path: string, detail?: string) => void} red
 * @returns {boolean} type-in-menu — false means per-type checks were unreachable
 */
function validateClose(close, at, red) {
  if (!CLOSE_TYPES.includes(close.type)) {
    red('close-type', `${at}.type`, `menu: ${CLOSE_TYPES.join('|')} — a close is data, never code`);
    return false;
  }
  if (close.type === 'predicate') {
    predicateBody(close, at, red);
  } else if (close.type === 'gold') {
    if (close.expected === undefined) red('missing-required', `${at}.expected`);
    if (!GOLD_COMPARE.includes(close.compare)) red('invalid-value', `${at}.compare`, GOLD_COMPARE.join('|'));
  } else if (close.type === 'rubric') {
    if (!isNonEmptyString(close.criteria)) red('missing-required', `${at}.criteria`);
  } else if (close.type === 'hitl') {
    if (!isNonEmptyString(close.prompt)) red('missing-required', `${at}.prompt`);
  }
  for (const key of Object.keys(close)) {
    if (!CLOSE_FIELDS[close.type].includes(key)) {
      red('unknown-field', `${at}.${key}`, `not a ${close.type} field (script bodies and minting claims land here)`);
    }
  }
  return true;
}

/**
 * The predicate BODY contract — cmd/expect/judged/gapKeep. Shared verbatim by
 * the predicate close and the Layer 2 named checks (decision 1: a check runs
 * under the same runClose machinery, so it validates under the same rules).
 * @param {Record<string, any>} o the close or check carrying the body
 * @param {string} at path prefix (e.g. `steps.0.close`, `close`, `checks.1`)
 * @param {(code: string, path: string, detail?: string) => void} red
 */
function predicateBody(o, at, red) {
  if (!isNonEmptyString(o.cmd)) red('missing-required', `${at}.cmd`);
  // the runner executes cmd as whitespace-split argv with NO shell: quote
  // characters imply shell semantics the split cannot honor — honest
  // refusal beats silent misparse (N2 design default)
  else if (/["']/.test(o.cmd)) red('invalid-value', `${at}.cmd`, 'quote characters are inexpressible: cmd runs as whitespace-split argv, no shell');
  else if (o.cmd !== o.cmd.trim()) red('invalid-value', `${at}.cmd`, 'leading/trailing whitespace — argv splits on whitespace and an empty argv[0] cannot spawn; honest refusal beats a silent misparse');
  if (!Number.isInteger(o.expect)) red('invalid-value', `${at}.expect`, 'integer exit code');
  // The judgment-rendered signal (PRD v1.11, optional). Exit code alone
  // cannot separate "the suite ran and failed" from "the suite crashed at
  // load" — they are byte-identical at the seam, and against `node --test`
  // so are the raw counts (a crashed file is reported as ONE failing test).
  // So the signal is a FLOOR, not a zero-check: a close declares how many
  // things it must judge before its exit code means anything at all.
  if (o.judged !== undefined) {
    const j = o.judged;
    if (!isObj(j)) red('invalid-value', `${at}.judged`, 'object {pattern, min} — proof the close actually judged something');
    else {
      for (const key of Object.keys(j)) {
        if (!['pattern', 'min'].includes(key)) red('unknown-field', `${at}.judged.${key}`);
      }
      if (!isNonEmptyString(j.pattern)) red('missing-required', `${at}.judged.pattern`, 'regex over the close output with ONE capture group yielding the count');
      else {
        let groups = 0;
        try {
          // `p|` always matches the empty string, so exec() returns an array
          // whose length is 1 + the number of capture groups — the only way
          // to count groups without executing the pattern against real output.
          groups = (new RegExp(`${j.pattern}|`).exec('')?.length ?? 1) - 1;
        } catch {
          red('invalid-value', `${at}.judged.pattern`, 'must compile as a RegExp');
          groups = -1;
        }
        // A pattern with no capture group extracts nothing, so EVERY close
        // would read as crashed — a dead arbiter that reds forever. Red the
        // spec, not every run.
        if (groups === 0) red('invalid-value', `${at}.judged.pattern`, 'no capture group — the count is read from group 1, so this pattern would crash every close');
        // More than one is the same defect wearing a subtler hat: runClose
        // reads group 1 ONLY, so an alternation whose other branch carries
        // the count leaves group 1 undefined → NaN → judgedCount null →
        // an exit-0 GREEN stamped 'crashed' (a fake crash, the mirror of
        // the fake green this floor exists to catch). Alternation stays
        // fully expressible with non-capturing branches: `(?:a|b) (\d+)`.
        else if (groups > 1) red('invalid-value', `${at}.judged.pattern`, `${groups} capture groups — the count is read from group 1 only; use exactly one capture group and non-capturing (?:…) branches`);
      }
      if (!Number.isInteger(j.min) || j.min < 1) {
        red('invalid-value', `${at}.judged.min`, 'integer >= 1 — a floor of 0 is satisfied by judging nothing, which is the check it is meant to make');
      }
    }
  }
  // The kept-failures pattern (F28, optional). ralph's gap bound head/tail-
  // elides a large close stream, and a big TAP suite prints its `not ok`
  // lines in the MIDDLE — so the failing-test NAMES (the causal navigation
  // input the worker runs on) were deleted in transit and the worker was
  // told "5 fail" and never WHICH. gapKeep is a regex SOURCE whose matching
  // lines are PRESERVED in the gap in addition to head+tail. Same discipline
  // as judged.pattern: a non-empty string that must compile as a RegExp, or
  // it is a spec red before any tokens burn (reds-before-tokens) — an invalid
  // keep pattern must never surface as a runtime crash inside the arbiter.
  if (o.gapKeep !== undefined) {
    if (!isNonEmptyString(o.gapKeep)) red('invalid-value', `${at}.gapKeep`, 'regex source string — lines matching it survive the gap bound (F28)');
    else {
      try { new RegExp(o.gapKeep, 'm'); }
      catch { red('invalid-value', `${at}.gapKeep`, 'must compile as a RegExp'); }
    }
  }
}

/**
 * The four-field plan shape (design record 2026-07-21, decision 5): goal /
 * verdictType / close / checks[] (+ the top-level tool ceiling). v1 admits
 * only verdictType `green`; soft-green/hitl are declared-but-locked and red
 * as `request-red` — admission demand the ledger counts, never a grant.
 * @param {Record<string, any>} spec
 * @param {(code: string, path: string, detail?: string) => void} red
 * @param {Red[]} reds direct access for structured request-reds
 */
function validatePlanShape(spec, red, reds) {
  if (spec.goal === undefined) red('missing-required', 'goal');
  else if (!isNonEmptyString(spec.goal)) red('invalid-value', 'goal', 'non-empty text — the goal is what the agent plans against');

  /** @type {string|undefined} the close class the declared verdict demands */
  let demanded;
  if (spec.verdictType === undefined) red('missing-required', 'verdictType', `declared radio, never inferred: ${VERDICT_TYPES.join('|')}`);
  else if (LOCKED_VERDICTS.includes(spec.verdictType)) {
    // declared-but-locked (disclosure ≠ admission, the tool-menu pattern):
    // the type rides as a structured field — the ledger keys admission demand
    // on it, never on prose
    reds.push({ code: 'request-red', path: 'verdictType', verb: spec.verdictType, detail: `"${spec.verdictType}" is declared-but-locked — not at this rung (v1 admits green only); this red IS the admission evidence, never a grant` });
    demanded = CLASS_BY_VERDICT[spec.verdictType];
  } else if (!VERDICT_TYPES.includes(spec.verdictType)) {
    red('invalid-value', 'verdictType', `menu: ${VERDICT_TYPES.join('|')} — an unknown type is a typo, never a request`);
  } else {
    demanded = CLASS_BY_VERDICT[spec.verdictType];
  }

  if (spec.close === undefined) red('missing-required', 'close', 'declared green with nothing to run it — preflight validates the declaration, never infers');
  else if (!isObj(spec.close)) red('invalid-value', 'close', 'a close object (type + its fixed fields)');
  else if (validateClose(spec.close, 'close', red) && demanded !== undefined
           && !CLASS_BY_CLOSE[spec.close.type].includes(demanded)) {
    // the hierarchy one level up: the declared verdict demands a close class
    // its close type cannot legally claim (green-on-rubric is laundering)
    red('close-hierarchy', 'verdictType', `verdictType ${spec.verdictType} demands a ${demanded}-class close; ${spec.close.type} admits ${CLASS_BY_CLOSE[spec.close.type].join('|')} only (a rubric can never be hard — PRD §7)`);
  }

  if (spec.checks !== undefined) {
    if (!Array.isArray(spec.checks) || spec.checks.length === 0) {
      red('invalid-value', 'checks', 'non-empty array of named checks — omit the field when the job signs none');
    } else {
      const seen = new Set();
      spec.checks.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
        const at = `checks.${i}`;
        if (!isObj(c)) { red('invalid-value', at, 'a check must be an object'); return; }
        for (const key of Object.keys(c)) {
          if (!CHECK_FIELDS.includes(key)) red('unknown-field', `${at}.${key}`, 'not a check field (script bodies land here)');
        }
        if (!isNonEmptyString(c.name) || !SLUG_RE.test(c.name)) red('invalid-value', `${at}.name`, 'kebab-case slug — the plan references checks by name (check-passes(name))');
        else if (seen.has(c.name)) red('duplicate-id', `${at}.name`, c.name);
        else seen.add(c.name);
        predicateBody(c, at, red);
      });
    }
  }

  // the tool CEILING (plan-v1 anchor: every plan step's verbs ⊆ this) — same
  // grant rules as a step's tools; run stays locked-but-listed (request-red)
  if (spec.tools !== undefined) {
    if (!(Array.isArray(spec.tools) && spec.tools.length > 0
          && spec.tools.every((/** @type {unknown} */ t) => typeof t === 'string')
          && new Set(spec.tools).size === spec.tools.length)) {
      red('invalid-value', 'tools', `non-empty unique subset of ${TOOL_MENU.join('|')}`);
    } else {
      for (const t of spec.tools.filter((/** @type {string} */ t) => LOCKED_TOOLS.includes(t))) {
        reds.push({ code: 'request-red', path: 'tools', verb: t, detail: `"${t}" is locked-but-listed — this red IS the admission evidence, never a grant; granted menu: ${TOOL_MENU.join('|')}` });
      }
      const unknown = spec.tools.filter((/** @type {string} */ t) => !TOOL_MENU.includes(t) && !LOCKED_TOOLS.includes(t));
      if (unknown.length) red('invalid-value', 'tools', `unknown tool(s) ${unknown.join(', ')} — menu: ${TOOL_MENU.join('|')}`);
    }
  }
}

/**
 * Canonical JSON — recursive key sort, so the hash binds to CONTENT, not to
 * the accident of key order a drafting UX or an editor produced.
 * @param {any} v
 * @returns {string}
 */
function canon(v) {
  // Follow JSON.stringify semantics — the hash must equal the hash of the
  // disk round-trip, or an approval minted in memory fails after save/reload
  // (human-signs-always rejecting an unedited spec). That means honoring toJSON
  // (a Date serializes to its ISO string, not walked as {}) and dropping
  // undefined-valued keys, both of which JSON.stringify does. One divergence:
  // a function/symbol-VALUED key canonizes as null where stringify drops it —
  // reachable only on non-JSON specs, where a round-trip mismatch is correct.
  if (v !== null && typeof v === 'object' && typeof (/** @type {any} */ (v).toJSON) === 'function') {
    return canon(/** @type {any} */ (v).toJSON());
  }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canon(x))).join(',')}]`;
  if (isObj(v)) {
    const obj = /** @type {Record<string, any>} */ (v);
    return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`).join(',')}}`;
  }
  const s = JSON.stringify(v);
  return s === undefined ? 'null' : s; // undefined/function/symbol leaf: not JSON-representable — 'null', never throw
}

/**
 * Content hash of a job spec — what an approval record binds to. Any edit to
 * the spec changes the hash, so an edited spec is unapproved by construction
 * (interview decision #1: human signs, always, once per spec VERSION).
 * @param {object} job
 * @returns {string} sha256 hex
 */
export function jobSpecHash(job) {
  // NEVER throws: the N2 runner mints {specHash, signer, ts} by calling this
  // directly on the raw job object, so a non-JSON value (BigInt, a cycle, a
  // throwing getter) must yield a hash, not crash the signer. canon handles
  // JSON-representable inputs; the guard covers cycles and hostile getters.
  let c;
  try { c = canon(job); } catch { c = '\u0000unhashable'; }
  return createHash('sha256').update(c).digest('hex');
}

/**
 * Does an approval record cover this exact spec version? Pure predicate — the
 * N2 runner refuses to run without it; nothing here writes or prompts. The
 * approval record lives OUTSIDE the document it signs (a spec never contains
 * its own signature) and is shell/human territory, never agent-writable.
 * @param {object} job
 * @param {unknown} approvals array of { specHash, signer, ts } records
 * @returns {boolean}
 */
export function checkApproval(job, approvals) {
  if (!Array.isArray(approvals)) return false;
  // NOT jobSpecHash: its un-hashable sentinel would make every un-hashable
  // spec hash-equal — an approval minted for one would authorize any other.
  // Here un-hashable simply means unapproved, full stop.
  let c;
  try { c = canon(job); } catch { return false; }
  const h = createHash('sha256').update(c).digest('hex');
  return approvals.some((a) => isObj(a) && /** @type {Record<string, unknown>} */ (a).specHash === h);
}
