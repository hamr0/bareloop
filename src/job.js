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
/** the hierarchy: which verdict classes a close type may claim (PRD §7). Read by
 * the verdictType check — a declared verdict may not demand a class its close
 * type cannot legally claim (green-on-rubric is laundering). The `CLASSES`
 * vocabulary export went with steps[] (PRD v1.32): a class was a STEP field, and
 * nothing declares one now. */
export const CLASS_BY_CLOSE = Object.freeze({ predicate: Object.freeze(['hard']), gold: Object.freeze(['hard']), rubric: Object.freeze(['soft']), hitl: Object.freeze(['hitl']) });
export const GOLD_COMPARE = Object.freeze(['exact', 'json-equal']);
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
 * taxes output tokens ∝ file size. It admits no execution either.
 *
 * P (design record 2026-07-28, hamr: full catalog) widened the menu to the four
 * components — write · select · compress · isolate — every verb an EXISTING
 * litectx implementation (menu-is-inventory). impact/related/recent/compress/
 * peek are read-only like the retrieval pair; stash/remember/forget are
 * STORE-writes (`.litectx`, never the tree — own gate action types, and the U
 * runner deletes the store at reset so cold stays cold). None admits execution:
 * the `run` lock is untouched. */
export const TOOL_MENU = Object.freeze(['read', 'grep', 'write', 'edit', 'recall', 'get', 'impact', 'related', 'recent', 'compress', 'peek', 'stash', 'remember', 'forget']);
/** the write-class split the validator and the scout filter read: tree writes
 * (writeScope fence) vs store writes (isolate) — NEITHER is read-capable. */
export const WRITE_VERBS = Object.freeze(['write', 'edit']);
export const STORE_VERBS = Object.freeze(['stash', 'remember', 'forget']);
/**
 * The floor for `maxWallMs`: one default close timeout (`runClose`'s 120_000).
 * Addendum 1 MEASURED that a wall deadline can only be read BETWEEN rounds —
 * `loop.stop()` does not cut an in-flight call (fired at 500ms, returned at
 * 4,018ms) — so enforcement is `maxWallMs + closeStages × closeTimeoutMs` (W5: a
 * staged close runs every stage under the FULL timeout, ralph.js `runStages`).
 * Under this floor the overshoot exceeds the budget itself and the advertised
 * number would be more wrong than right, which is the advertised-must-equal-
 * enforced line.
 *
 * The VALUE is a one-stage, default-timeout floor and is deliberately left alone —
 * a threshold is operator territory, not something this module re-derives from a
 * spec's own stage count. It therefore bounds only the degenerate case; a job with
 * many stages or a raised `closeTimeoutMs` can still sit far above it while its
 * overshoot dwarfs its cap. The clock reports that honestly (`closeStages` and
 * `enforcedMs` are both on the `wall-clock` record) rather than the floor pretending
 * to prevent it.
 */
export const MIN_WALL_MS = 120_000;
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
// `steps` stays in the field list ONLY so a retired spec reds by name
// (`shape-retired`) instead of falling through to a generic unknown-field —
// the operator gets told what happened, not just that something is wrong.
const JOB_FIELDS = ['schema', 'job', 'description', 'provider', 'conditions', 'cadence', 'budgetUsd', 'maxWallMs', 'writeScope', 'steps', 'escalation', 'goal', 'verdictType', 'close', 'checks', 'tools'];
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

  // T (PRD v1.27/v1.29) — TIME, with exactly budgetUsd's status: operator input,
  // the agent may tighten and never widen, never self-raised. OPTIONAL AND WITH NO
  // DEFAULT, decided by hamr 2026-07-26: a defaulted cap is a silent second
  // ceiling, which is the F45 failure (a money rule with no wired detector let
  // four cut rows be classed as evidence). A spec without it is time-unbounded by
  // explicit operator CHOICE — so nothing here mints a fallback, and the runner
  // reports the absence rather than letting it be inferred.
  if (spec.maxWallMs !== undefined
      && !(typeof spec.maxWallMs === 'number' && Number.isInteger(spec.maxWallMs) && spec.maxWallMs >= MIN_WALL_MS)) {
    red('bounds', 'maxWallMs',
      `integer milliseconds >= ${MIN_WALL_MS} (one close timeout). Enforcement is a between-round deadline, measured as maxWallMs + closeStages x closeTimeoutMs (design addendum 1: loop.stop() cannot cut an in-flight call; W5: every close stage runs under the full timeout), so a budget under one close cannot fund its own close and the advertised number would be more wrong than right`);
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

  // 4. the plan shape — the ONLY shape (PRD v1.32, 2026-07-26). The legacy
  // operator-authored steps[] chain was deleted with the rest of that path:
  // hand-writing the workflow is the exact thing the product removes, and its
  // co-existence forced every downstream schema decision to carry two spellings.
  // `steps` is now an unknown field like any other, so an old spec reds by name
  // rather than half-running.
  if (spec.steps !== undefined) {
    red('shape-retired', 'steps', 'operator-authored steps[] was deleted (PRD v1.32) — a job declares goal/verdictType/close and the AGENT authors the steps. hitl and soft-green return as a Layer 3 decision, rebuilt in this shape');
  } else if (PLAN_CORE_FIELDS.some((f) => spec[f] !== undefined) || spec.tools !== undefined) {
    validatePlanShape(spec, red, reds);
  } else {
    red('missing-required', 'goal', 'a job declares goal/verdictType/close — the agent authors the steps');
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
 * The staged close (PRD v1.28) — the close is an ORDERED LIST of named stages,
 * and the check menu DERIVES from it. The principle: *the user authors the
 * destination, never the road.* A user who cannot describe a workflow can still
 * say what done looks like, and everything downstream of that is derived — which
 * is why `checks[]` no longer exists as a field (hamr: *"there shouldn't be user
 * authoring anywhere, that defies the point of bareloop"*).
 *
 * Two stage classes cannot be handed to the agent as a mid-build ruler, and F58
 * measured both against a real close:
 *  - a PRECONDITION ("the seed commit exists") is not a ruler for the work; run
 *    as a check it passes instantly and teaches nothing. It sets `offer: false`.
 *  - a stage that reads what an EARLIER stage built ("the public API matches the
 *    emitted declarations") reds on its own for a reason that has nothing to do
 *    with the worker's edit. It names `needs`, and picking it runs that chain first.
 * Everything else is offerable: derivation gave job #5 SEVEN rulers where the
 * operator had hand-carved three (F58) — removing the operator does not cost the
 * agent rulers, it hands it more.
 *
 * The `needs` expansion is TRANSITIVE (fixed point, not one level): a
 * prerequisite may itself name one, and running an incomplete chain reproduces
 * the exact false-red `needs` exists to remove, one level deeper. The expanded
 * chain is ordered by the CLOSE, never by the order names were typed —
 * validateStagedClose forces `needs` to name EARLIER stages, so close order IS
 * a topological order. A `needs` cycle is inexpressible in a validated close for
 * that same reason; the walk is still cycle-safe by construction (each stage is
 * collected at most once), because a pure exported helper must terminate on
 * whatever it is handed rather than hang the runner before any token burns.
 *
 * @param {any[]} close the validated stage list
 * @returns {{name: string, run: any[]}[]} offerable stages, each with the ordered
 *   chain that must run for it (prerequisites first, the stage itself last)
 */
export function checkMenu(close) {
  if (!Array.isArray(close)) return [];
  const named = close.filter((s) => isObj(s) && isNonEmptyString(s.name));
  const byName = new Map(named.map((s) => [s.name, s]));
  const orderOf = new Map(named.map((s, i) => [s, i]));
  /** the transitive prerequisite closure of one stage, in close order */
  const chain = (/** @type {any} */ stage) => {
    /** @type {Set<any>} */
    const collected = new Set();
    const walk = (/** @type {any} */ s) => {
      for (const n of Array.isArray(s.needs) ? s.needs : []) {
        const p = byName.get(n);
        // already collected (a diamond) or the picked stage itself (a cycle):
        // the walk stops here, so it visits each stage at most once
        if (!p || p === stage || collected.has(p)) continue;
        collected.add(p);
        walk(p);
      }
    };
    walk(stage);
    return [...collected].sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
  };
  return close
    .filter((s) => isObj(s) && s.offer !== false && isNonEmptyString(s.name))
    .map((s) => ({ name: s.name, run: [...chain(s), s] }));
}

/** the fields a close STAGE may carry — anything else is a smuggle channel */
const STAGE_FIELDS = ['name', 'cmd', 'expect', 'judged', 'gapKeep', 'offer', 'needs'];

/**
 * Validate the staged close. Every stage is a predicate BODY under the same
 * rules the single close object has always used (one contract, never a second
 * copy — the F9 two-transforms class applied to the arbiter itself).
 * @param {any[]} stages
 * @param {(code: string, path: string, detail?: string) => void} red
 */
function validateStagedClose(stages, red) {
  if (stages.length === 0) {
    red('missing-required', 'close', 'a non-empty ordered list of named stages — a job with nothing to run is ungated spend');
    return;
  }
  const seen = new Set();
  stages.forEach((s, i) => {
    const at = `close.${i}`;
    if (!isObj(s)) { red('invalid-value', at, 'a stage is an object { name, cmd, expect, ... }'); return; }
    for (const key of Object.keys(s)) {
      if (!STAGE_FIELDS.includes(key)) red('unknown-field', `${at}.${key}`, `not a stage field (script bodies, close types and minting claims land here); fields: ${STAGE_FIELDS.join(', ')}`);
    }
    if (!isNonEmptyString(s.name) || !SLUG_RE.test(s.name)) red('invalid-value', `${at}.name`, 'kebab-case slug — the plan references stages by name (check-passes(name))');
    else if (seen.has(s.name)) red('duplicate-id', `${at}.name`, `"${s.name}" is already a stage name — check-passes(name) would be ambiguous`);
    else seen.add(s.name);
    // every stage is a COMMAND whose exit code is truth: a rubric or hitl stage
    // is inexpressible here by construction, which is the hierarchy enforced by
    // shape rather than by a check
    predicateBody(s, at, red);
    if (s.offer !== undefined && typeof s.offer !== 'boolean') {
      red('invalid-value', `${at}.offer`, 'boolean — omit it (the default) unless the stage cannot stand alone as a ruler');
    }
    if (s.needs !== undefined) {
      const earlier = new Set(stages.slice(0, i).filter((p) => isObj(p) && isNonEmptyString(p.name)).map((p) => p.name));
      if (!Array.isArray(s.needs) || s.needs.length === 0 || !s.needs.every((n) => typeof n === 'string')) {
        red('invalid-value', `${at}.needs`, 'non-empty array of EARLIER stage names — omit the field when the stage stands alone');
      } else if (s.offer === false) {
        red('invalid-value', `${at}.needs`, 'a stage that is never offered has no chain to run — needs and offer:false are incoherent together');
      } else {
        const bad = s.needs.filter((n) => !earlier.has(n));
        if (bad.length) red('invalid-value', `${at}.needs`, `must name stages declared BEFORE this one (a prerequisite that has not run yet cannot be one): ${bad.join(', ')} — earlier stages: ${[...earlier].join(', ') || 'none'}`);
      }
    }
  });
}

/**
 * The plan-shaped job spec (design record 2026-07-21, decision 5): goal /
 * verdictType / close (+ the top-level tool ceiling). The fourth field of the
 * original four, `checks`, is RETIRED — the check menu derives from the close's
 * stages instead (PRD v1.28/v1.32), and a spec that still declares it gets the
 * `checks-derived` red below rather than a bare unknown-field.
 *
 * v1 admits only verdictType `green`; soft-green/hitl are declared-but-locked
 * and red as `request-red` — admission demand the ledger counts, never a grant.
 * The close is validated one level up as well: a declared verdict demands a
 * close CLASS, so green-on-rubric reds as `close-hierarchy` rather than
 * laundering a soft judgement into a hard one.
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
  // The staged close (PRD v1.28): an ordered list of named command stages, from
  // which the check menu derives. The object form remains ONLY for the
  // declared-but-locked verdict classes (gold/rubric/hitl), which name no
  // command and which the plan flow refuses at runtime (close-unsupported).
  else if (Array.isArray(spec.close)) validateStagedClose(spec.close, red);
  else if (!isObj(spec.close)) red('invalid-value', 'close', 'an ordered list of named stages [{ name, cmd, expect, ... }], or a close object for a locked verdict class');
  else if (validateClose(spec.close, 'close', red) && demanded !== undefined
           && !CLASS_BY_CLOSE[spec.close.type].includes(demanded)) {
    // the hierarchy one level up: the declared verdict demands a close class
    // its close type cannot legally claim (green-on-rubric is laundering)
    red('close-hierarchy', 'verdictType', `verdictType ${spec.verdictType} demands a ${demanded}-class close; ${spec.close.type} admits ${CLASS_BY_CLOSE[spec.close.type].join('|')} only (a rubric can never be hard — PRD §7)`);
  }

  // `checks[]` is RETIRED (PRD v1.28/v1.32): the check menu DERIVES from the
  // close's stages, so no operator authors checks per job, ever. The red names
  // what happened rather than leaving a bare unknown-field — and the hazard it
  // removes is measured, not theoretical: job #5's three hand-written checks
  // were re-implementations of three stages the close already ran, and a
  // hand-carved copy can drift LENIENT (the worker passes the operator's ruler
  // and fails the real inspection). Derivation removes that class by construction.
  if (spec.checks !== undefined) {
    red('checks-derived', 'checks', 'hand-authored checks are retired — declare the close as an ordered list of named stages and the check menu derives from it (the agent references them with check-passes(name)); a stage that cannot stand alone sets offer:false, one that needs an earlier stage names it in needs');
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
      // a plan-shape ceiling must grant ≥1 READ-capable verb (review #8): the
      // scout surveys read-only (the write-class verbs are filtered out of its
      // menu), so a write-only ceiling hands the scout an EMPTY menu and it
      // surveys blind — a degradation the validator catches at sign time.
      else if (!spec.tools.some((/** @type {string} */ t) => TOOL_MENU.includes(t) && !WRITE_VERBS.includes(t) && !STORE_VERBS.includes(t))) {
        red('invalid-value', 'tools', 'a plan-shape ceiling must grant ≥1 read-capable verb — the scout surveys read-only; write-class and store-class verbs leave it blind');
      }
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
 * The spec as the RUNTIME reads it — the form both hash paths canonize (MED-1).
 * `tools` is optional and its absence means the whole TOOL_MENU: plan.js and
 * planrun.js resolve it with this exact predicate, so an omitted-`tools` spec's
 * ceiling GROWS whenever the menu does while its bytes never move. Hashing the
 * unresolved form leaves that widening unsigned; hashing the resolved form pins
 * WHICH menu was signed, so a menu change flips the hash into the existing
 * refuse-until-reapproved machinery. A spec that named its own ceiling is
 * untouched — no migration for a signature already in flight.
 * @param {any} job
 * @returns {any}
 */
function resolveSpec(job) {
  if (!isObj(job) || Array.isArray(job.tools)) return job;
  return { ...job, tools: [...TOOL_MENU] };
}

/**
 * Content hash of a job spec — what an approval record binds to. Any SEMANTIC
 * edit changes the hash, so a spec whose meaning moved is unapproved by
 * construction (interview decision #1: human signs, always, once per spec
 * VERSION). Not every BYTE edit: the hash is taken over the RESOLVED spec
 * (resolveSpec), so writing today's full TOOL_MENU into a spec that omitted
 * `tools` is hash-neutral — the two spell the same ceiling, and that identity
 * is the point of MED-1, since it is what pins WHICH menu the signature covers.
 * The direction that matters still bites: the menu itself changing (or the
 * explicit list changing) moves the resolved form, and the hash with it.
 * @param {object} job
 * @returns {string} sha256 hex
 */
export function jobSpecHash(job) {
  // NEVER throws: the N2 runner mints {specHash, signer, ts} by calling this
  // directly on the raw job object, so a non-JSON value (BigInt, a cycle, a
  // throwing getter) must yield a hash, not crash the signer. canon handles
  // JSON-representable inputs; the guard covers cycles and hostile getters.
  // resolveSpec sits INSIDE the guard: it spreads, and a spread runs getters.
  let c;
  try { c = canon(resolveSpec(job)); } catch { c = '\u0000unhashable'; }
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
  // Here un-hashable simply means unapproved, full stop. The RESOLVED spec is
  // what gets canonized, same as the signer's (MED-1) — a gate reading a
  // different form than the mint would unapprove every omitted-`tools` spec.
  let c;
  try { c = canon(resolveSpec(job)); } catch { return false; }
  const h = createHash('sha256').update(c).digest('hex');
  return approvals.some((a) => isObj(a) && /** @type {Record<string, unknown>} */ (a).specHash === h);
}
