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
export const CADENCE_UNITS = Object.freeze(['hour', 'day', 'week']);
export const PROVIDERS = Object.freeze(['anthropic-api']); // SP-2: API-first; local deferred (PRD §5/§8)
/** V3 environment label: declared keys only — every field is a lineage-key
 * candidate at N3. `provider` is part of the key by definition (top-level,
 * not duplicated here). */
export const CONDITION_KEYS = Object.freeze(['providerPath', 'closeVerbosity', 'taskFraming', 'scaffold']);
const JOB_FIELDS = ['schema', 'job', 'description', 'provider', 'conditions', 'cadence', 'budgetUsd', 'writeScope', 'steps', 'escalation'];
/** exact field set per close type — anything else is an unknown-field red
 * (freeform code, script bodies, and minting claims all land there) */
const CLOSE_FIELDS = {
  predicate: ['type', 'cmd', 'expect'],
  gold: ['type', 'expected', 'compare'],
  rubric: ['type', 'criteria'],
  hitl: ['type', 'prompt'],
};
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** @typedef {{code: string, path: string, detail?: string}} Red */

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

  // 4. steps + the close chain
  if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
    red('missing-required', 'steps', 'non-empty array — a job without closes is ungated spend');
  } else {
    const seen = new Set();
    spec.steps.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
      const at = `steps.${i}`;
      if (!isObj(s)) { red('invalid-value', at, 'step must be an object'); return; }
      for (const key of Object.keys(s)) {
        if (!['id', 'close', 'class'].includes(key)) red('unknown-field', `${at}.${key}`);
      }
      if (!isNonEmptyString(s.id) || !SLUG_RE.test(s.id)) red('invalid-value', `${at}.id`, 'kebab-case slug');
      else if (seen.has(s.id)) red('duplicate-id', `${at}.id`, s.id);
      else seen.add(s.id);

      if (s.class === undefined) red('missing-required', `${at}.class`);
      else if (!CLASSES.includes(s.class)) red('invalid-value', `${at}.class`, CLASSES.join('|'));

      if (!isObj(s.close)) { red('missing-required', `${at}.close`, 'every step names its close — a step without one is ungated spend'); return; }
      const close = s.close;
      if (!CLOSE_TYPES.includes(close.type)) {
        red('close-type', `${at}.close.type`, `menu: ${CLOSE_TYPES.join('|')} — a close is data, never code`);
        return;
      }
      // per-type contracts — fixed menus only
      if (close.type === 'predicate') {
        if (!isNonEmptyString(close.cmd)) red('missing-required', `${at}.close.cmd`);
        if (!Number.isInteger(close.expect)) red('invalid-value', `${at}.close.expect`, 'integer exit code');
      } else if (close.type === 'gold') {
        if (close.expected === undefined) red('missing-required', `${at}.close.expected`);
        if (!GOLD_COMPARE.includes(close.compare)) red('invalid-value', `${at}.close.compare`, GOLD_COMPARE.join('|'));
      } else if (close.type === 'rubric') {
        if (!isNonEmptyString(close.criteria)) red('missing-required', `${at}.close.criteria`);
      } else if (close.type === 'hitl') {
        if (!isNonEmptyString(close.prompt)) red('missing-required', `${at}.close.prompt`);
      }
      for (const key of Object.keys(close)) {
        if (!CLOSE_FIELDS[close.type].includes(key)) {
          red('unknown-field', `${at}.close.${key}`, `not a ${close.type} field (script bodies and minting claims land here)`);
        }
      }
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
