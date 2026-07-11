// Workflow-config validator — a deterministic predicate that runs before any
// tokens burn (PRD §4: schema-validated, config-red before tokens). Every
// failure is a distinct named red { code, path, detail } so the spine can carry
// `config-red: missing-required:gate.writeScope`. An invalid config is a red,
// not a crash: this module never throws on bad input.
//
// The verb vocabulary is BOUND from litectx (adaptlearn F1 — consume, don't
// build; design law #10); this schema exposes the adaptlearn-proven 4-verb
// subset. The close and the provider are deliberately not expressible here:
// they arrive as unknown-field reds — the shell owns both (design law #1).

import { COMPRESS_LEVELS, KINDS, WRITE_KINDS } from 'litectx';

export const LOOP_SHAPES = ['refine', 'plan'];
export const SLOTS = ['before-attempt', 'after-red', 'on-green'];
export const VERBS = ['recall', 'compress', 'stash', 'remember'];
const TOP_FIELDS = ['schema', 'loop', 'memory', 'hooks', 'gate', 'escalation'];
const MAX_OPS_PER_SLOT = 2;

// per-verb parameter contracts: name → check(value) (op field itself excluded).
// remember's kinds are NARROWER than recall's: bound from litectx WRITE_KINDS
// (the set remember() itself validates against — adaptlearn F5's drift lesson:
// the export you bind can be wider than the function you call), minus doc:
// the doc/upload axis stays gated out deliberately.
const REMEMBER_KINDS = WRITE_KINDS.filter((k) => k !== 'doc');
const VERB_PARAMS = {
  recall: { k: (v) => Number.isInteger(v) && v >= 1 && v <= 20, kinds: isKinds },
  compress: { level: (v) => COMPRESS_LEVELS.includes(v) },
  stash: {},
  remember: { kind: (v) => REMEMBER_KINDS.includes(v) },
};

/**
 * Map a schema writeScope entry to its enforcement prefix. bareguard
 * fs.writeScope is prefix-containment, not glob (adaptlearn F4/F9): the
 * trailing "/**" | "/*" form maps to its directory prefix. The validator's
 * legality rule and the interpreter's enforcement mapping BOTH go through this
 * one helper — if they ever used different transforms, a scope could validate
 * green and then gate-red every write at runtime (the F9 red-class).
 * @param {string} scope
 */
export function globToPrefix(scope) {
  return scope.replace(/\/\*\*?$/, '');
}

function isKinds(v) {
  return Array.isArray(v) && v.length > 0 && v.every((k) => KINDS.includes(k));
}
function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Validate a workflow config against schema v1.
 * @param {object|string} input parsed config, or raw JSON text (parse failures are a red)
 * @param {{ shellCapUsd?: number }} [opts] the shell's cap — a config may tighten it, never exceed it
 * @returns {{ ok: boolean, reds: Array<{code: string, path: string, detail?: string}> }}
 */
export function validateConfig(input, { shellCapUsd = 2 } = {}) {
  /** @type {Array<{code: string, path: string, detail?: string}>} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };

  let c = input;
  if (typeof c === 'string') {
    try { c = JSON.parse(c); } catch (e) {
      return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: String(/** @type {Error} */ (e).message) }] };
    }
  }
  if (!isObj(c)) return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: 'config must be a JSON object' }] };

  // 1. shape — unknown top-level fields red here (smuggled close/provider included)
  for (const key of Object.keys(c)) {
    if (!TOP_FIELDS.includes(key)) red('unknown-field', key);
  }
  if (c.schema === undefined) red('missing-required', 'schema');
  else if (c.schema !== 'v1') red('invalid-value', 'schema', `expected "v1", got ${JSON.stringify(c.schema)}`);

  // 2. required bindings + 3. bounds, section by section
  const loop = isObj(c.loop) ? c.loop : {};
  if (loop.shape === undefined) red('missing-required', 'loop.shape');
  else if (!LOOP_SHAPES.includes(loop.shape)) red('invalid-value', 'loop.shape', `menu: ${LOOP_SHAPES.join('|')}`);
  if (loop.maxIterations !== undefined
      && !(Number.isInteger(loop.maxIterations) && loop.maxIterations >= 1 && loop.maxIterations <= 8)) {
    red('bounds', 'loop.maxIterations', '1..8');
  }

  const memory = isObj(c.memory) ? c.memory : {};
  if (memory.store === undefined) red('missing-required', 'memory.store');
  else if (memory.store !== 'litectx') red('invalid-value', 'memory.store', 'v1 binds "litectx"');
  if (isObj(memory.recall)) {
    const { k, kinds } = memory.recall;
    if (k !== undefined && !(Number.isInteger(k) && k >= 1 && k <= 20)) red('bounds', 'memory.recall.k', '1..20');
    if (kinds !== undefined && !isKinds(kinds)) red('invalid-value', 'memory.recall.kinds', `subset of ${KINDS.join('|')}`);
  }
  if (memory.compressLevel !== undefined && !COMPRESS_LEVELS.includes(memory.compressLevel)) {
    red('invalid-value', 'memory.compressLevel', COMPRESS_LEVELS.join('|'));
  }

  const gate = isObj(c.gate) ? c.gate : {};
  if (gate.budgetUsd === undefined) red('missing-required', 'gate.budgetUsd');
  else if (!(typeof gate.budgetUsd === 'number' && gate.budgetUsd > 0 && gate.budgetUsd <= shellCapUsd)) {
    red('bounds', 'gate.budgetUsd', `0 < budget <= shell cap ${shellCapUsd}`);
  }
  if (gate.writeScope === undefined) red('missing-required', 'gate.writeScope');
  else if (!(Array.isArray(gate.writeScope) && gate.writeScope.length > 0
             && gate.writeScope.every((s) => typeof s === 'string' && s.length > 0))) {
    red('invalid-value', 'gate.writeScope', 'non-empty array of glob strings');
  } else if (!gate.writeScope.every((s) => !globToPrefix(s).includes('*'))) {
    // adaptlearn F9: enforcement (bareguard fs.writeScope) is prefix-containment — a wildcard
    // anywhere but a trailing /** or /* is inexpressible there, so it would validate green
    // and then gate-red EVERY write at runtime. Reds-before-tokens means rejecting it here.
    red('invalid-value', 'gate.writeScope', 'wildcards only as a trailing "/**" or "/*" (enforcement is prefix-containment, adaptlearn F9)');
  } else if (!gate.writeScope.every((s) => !s.startsWith('/') && globToPrefix(s).split('/').every((seg) => seg !== '..'))) {
    // Containment: the interpreter resolves scopes against the run directory; an absolute
    // path or a ".." segment escapes it — and the close suite lives just outside the
    // scoped tree. A scope that can reach the arbiter's inputs is the config-level
    // fit-to-pass surface (design law #1). Reds-before-tokens.
    red('invalid-value', 'gate.writeScope', 'must stay inside the run directory — no absolute paths, no ".." segments (design law #1)');
  }

  const escalation = isObj(c.escalation) ? c.escalation : {};
  if (escalation.mode === undefined) red('missing-required', 'escalation.mode');
  else if (escalation.mode !== 'decision-ready') red('invalid-value', 'escalation.mode', 'must be "decision-ready"');

  // 4. verb legality inside the slots
  if (c.hooks !== undefined) {
    const hooks = isObj(c.hooks) ? c.hooks : {};
    if (!isObj(c.hooks)) red('invalid-value', 'hooks', 'must be an object of slots');
    for (const [slot, ops] of Object.entries(hooks)) {
      const at = `hooks.${slot}`;
      if (!SLOTS.includes(slot)) { red('unknown-field', at); continue; }
      if (!Array.isArray(ops)) { red('invalid-value', at, 'must be an array of ops'); continue; }
      if (ops.length > MAX_OPS_PER_SLOT) { red('slot-overflow', at, `max ${MAX_OPS_PER_SLOT} ops`); continue; }
      ops.forEach((op, i) => {
        const opAt = `${at}.${i}`;
        if (!isObj(op) || !VERBS.includes(op.op)) { red('verb-illegal', opAt, `verbs: ${VERBS.join('|')}`); return; }
        if (op.op === 'remember' && slot !== 'on-green') {
          red('verb-placement', opAt, 'remember is legal only in on-green (retention is verdict-gated, design law #2)');
          return;
        }
        const params = VERB_PARAMS[op.op];
        for (const [key, value] of Object.entries(op)) {
          if (key === 'op') continue;
          if (!(key in params)) red('verb-params', `${opAt}.${key}`, `unknown param for ${op.op}`);
          else if (!params[key](value)) red('verb-params', `${opAt}.${key}`, `invalid value for ${op.op}.${key}`);
        }
      });
    }
  }

  return { ok: reds.length === 0, reds };
}

/**
 * Changed JSON paths between two configs — the one-knob mutation checker
 * (a legal mutant has exactly one). A subtree present on only one side counts
 * as ONE path (its root), so "add an op to a slot" is one knob, not two params.
 * @param {object} a
 * @param {object} b
 * @returns {string[]} sorted changed paths, dot-notation with array indices
 */
export function diffPaths(a, b) {
  /** @type {string[]} */
  const paths = [];
  walk(a, b, '');
  return paths.sort();

  /**
   * @param {any} x
   * @param {any} y
   * @param {string} at
   */
  function walk(x, y, at) {
    if (x === y) return;
    const bothObj = isObj(x) && isObj(y);
    const bothArr = Array.isArray(x) && Array.isArray(y);
    if (!bothObj && !bothArr) {
      if (JSON.stringify(x) !== JSON.stringify(y)) paths.push(at || '$');
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const key of keys) {
      const p = at ? `${at}.${key}` : key;
      if (!(key in x) || !(key in y)) paths.push(p); // added/removed subtree = one knob
      else walk(x[key], y[key], p);
    }
  }
}
