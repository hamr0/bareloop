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

export const LOOP_SHAPES = Object.freeze(['refine', 'plan']);
export const SLOTS = Object.freeze(['before-attempt', 'after-red', 'on-green']);
export const VERBS = Object.freeze(['recall', 'compress', 'stash', 'remember']);
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
  // One canonical spelling for equivalent paths — leading "./", interior "/./",
  // doubled "//", trailing "/" all collapse — so the legality rule, the fence
  // comparison, and bareguard enforcement agree on what a scope NAMES. Without
  // this, a validateJob-green fence like "src/" would reject every workflow
  // scope inside it (the F9 red-class across two documents).
  //
  // Order is load-bearing: "//" collapses and interior "/./" drops BEFORE the
  // leading "./" strip, so ".//src" → "src" and never "/src". Stripping first
  // would MINT an absolute prefix from a relative scope — a design-law-#1
  // containment escape (resolve(workdir, "/src") ignores workdir entirely).
  //
  // Deliberately NOT path.posix.normalize: it resolves ".." segments
  // (normalize("src/../etc") === "etc"), which must stay VISIBLE so
  // scopeContained can reject them — the whole point of the containment law.
  let p = scope.replace(/\/\*\*?$/, '');
  p = p.replace(/\/{2,}/g, '/').replace(/\/\.(?=\/|$)/g, '').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  return p;
}

/**
 * A scope may never reach the arbiter's inputs (design law #1): it must
 * resolve to a PROPER subdirectory of the run directory. Absolute paths and
 * ".." segments escape it; "." / "./**" cover the whole run directory — where
 * the close suite lives. Windows spellings ("..\", "C:\") count as escapes.
 * Exported for the job validator: the operator's outer fence obeys the SAME
 * law through the same code — two containment transforms would be the F9
 * red-class one level up.
 * @param {string} s
 */
export function scopeContained(s) {
  if (s.startsWith('/') || s.includes('\\') || /^[a-zA-Z]:/.test(s)) return false;
  const prefix = globToPrefix(s);
  // Belt: reject a prefix that is empty, the run dir, absolute, or a drive —
  // checked on the NORMALIZED prefix, not just the raw string, so a spelling
  // that normalizes to something absolute can never pass (defense in depth
  // against a future globToPrefix regression; the un-gameable gate, law #1).
  if (prefix === '' || prefix === '.' || prefix.startsWith('/') || /^[a-zA-Z]:/.test(prefix)) return false;
  return prefix.split('/').every((seg) => seg !== '..');
}

/**
 * The per-entry write-scope legality law, one home for all three call sites
 * (workflow gate.writeScope, the job fence, the operator's job-v1 writeScope):
 * a non-empty string, no mid-path wildcard (enforcement is prefix-containment,
 * F9), contained under the run dir (law #1). The chains that need per-check
 * reds still spell the three steps; fenceOk and future callers use this so a
 * fence can never be blessed that the job validator would reject.
 * @param {unknown} s
 */
export function legalScopeEntry(s) {
  return isNonEmptyString(s) && !globToPrefix(s).includes('*') && scopeContained(s);
}

// Each verb is legal ONLY in the slot where it has effect: recall/compress
// build the attempt context (consumed by before-attempt only), stash parks the
// gap (which exists only after-red), remember is verdict-gated retention
// (on-green only, design law #2). An op that validates green but is inert at
// runtime would still emit hook-op events — a live-looking knob with zero
// effect, polluting the contrast evidence the extractor attributes by
// (design law #3; the F16 credit-loss class).
const VERB_SLOT = { recall: 'before-attempt', compress: 'before-attempt', stash: 'after-red', remember: 'on-green' };

function isKinds(v) {
  return Array.isArray(v) && v.length > 0 && v.every((k) => KINDS.includes(k));
}
/** Shared with the job validator — one definition of "a JSON object" for both
 * documents (the sibling-validator drift class).
 * @param {unknown} v */
export function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
/** @param {unknown} v @returns {v is string} */
export function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

// Secrets never enter the tree/spine/configs (hard line) — BOTH config
// documents get the same sweep: the agent-authored workflow config is the
// riskier entry point (machine-written), the operator's job spec the other.
// Known token shapes only, left-bounded so hyphenated words ("flask-sqlalchemy")
// never red — defense-in-depth; env-only loading is the law, not this regex.
const SECRET_RE = /(?<![A-Za-z0-9_-])(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[bap]-[A-Za-z0-9-]{10,})/;

/**
 * Red every string in a config tree that carries a known secret-token shape.
 * @param {any} root
 * @param {(code: string, path: string, detail?: string) => void} red
 */
export function sweepSecretLiterals(root, red) {
  (/** @type {(node: any, at: string) => void} */
  function sweep(node, at) {
    if (typeof node === 'string') {
      if (SECRET_RE.test(node)) red('secret-literal', at, 'secrets load from the environment; an append-only record that captures a key captures it forever');
      return;
    }
    if (Array.isArray(node)) node.forEach((v, i) => sweep(v, `${at}.${i}`));
    else if (isObj(node)) for (const [k, v] of Object.entries(node)) sweep(v, at ? `${at}.${k}` : k);
  })(root, '');
}

/**
 * Validate a workflow config against schema v1. Returns the parsed config on
 * ok (single parse — callers never re-parse; null on any red).
 * @param {object|string} input parsed config, or raw JSON text (parse failures are a red)
 * @param {{ shellCapUsd?: number, jobWriteScope?: string[] }} [opts] the shell's
 *   ceilings — a config may tighten either, never exceed. `shellCapUsd`: at N2+
 *   the shell passes min(shell cap, job budgetUsd) — the ceiling chain
 *   workflow ≤ job ≤ shell. `jobWriteScope`: the job spec's outer fence
 *   (operator law, job-v1) — every workflow scope must fit inside it.
 * @returns {{ ok: boolean, reds: Array<{code: string, path: string, detail?: string}>, config: object|null }}
 */
export function validateConfig(input, { shellCapUsd = 2, jobWriteScope } = {}) {
  /** @type {Array<{code: string, path: string, detail?: string}>} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };

  let c = input;
  if (typeof c === 'string') {
    try { c = JSON.parse(c); } catch (e) {
      return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: String(/** @type {Error} */ (e).message) }], config: null };
    }
  }
  if (!isObj(c)) return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: 'config must be a JSON object' }], config: null };

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
             && gate.writeScope.every(isNonEmptyString))) {
    red('invalid-value', 'gate.writeScope', 'non-empty array of glob strings');
  } else if (!gate.writeScope.every((s) => !globToPrefix(s).includes('*'))) {
    // adaptlearn F9: enforcement (bareguard fs.writeScope) is prefix-containment — a wildcard
    // anywhere but a trailing /** or /* is inexpressible there, so it would validate green
    // and then gate-red EVERY write at runtime. Reds-before-tokens means rejecting it here.
    red('invalid-value', 'gate.writeScope', 'wildcards only as a trailing "/**" or "/*" (enforcement is prefix-containment, adaptlearn F9)');
  } else if (!gate.writeScope.every(scopeContained)) {
    // A scope that can reach the arbiter's inputs is the config-level
    // fit-to-pass surface (design law #1). Reds-before-tokens.
    red('invalid-value', 'gate.writeScope', 'must be a proper subdirectory of the run directory — no absolute paths, no ".." segments, not the run dir itself (design law #1)');
  } else if (jobWriteScope !== undefined && jobWriteScope !== null) {
    // Two-layer fence: the job spec's writeScope is operator law; the authored
    // config may tighten it, never exceed it (the budget pattern, on paths).
    // null/undefined are the legitimate "no fence" spellings (job optional at
    // N2, and the only forms that survive JSON transit) — the layer is skipped,
    // never a deadlock. A PRESENT-but-malformed fence fails CLOSED with its own
    // red, attributed to jobWriteScope (NOT the innocent workflow field — the
    // ledger's contrast attribution must not charge the agent's config for the
    // operator's broken spec).
    const fenceOk = Array.isArray(jobWriteScope) && jobWriteScope.length > 0 && jobWriteScope.every(legalScopeEntry);
    if (!fenceOk) {
      const shown = JSON.stringify(jobWriteScope).slice(0, 200); // bound: a malformed fence is untrusted caller input, and this rides the append-only spine (ralph's 2000-char precedent)
      red('fence-invalid', 'jobWriteScope', `not a validateJob-green fence (${shown}) — validate the job spec before threading its fence`);
    } else {
      // Boundary-aware: "src2" is not inside "src" — prefix means PATH prefix.
      const fence = jobWriteScope.map(globToPrefix);
      const inside = (/** @type {string} */ p) => fence.some((f) => p === f || p.startsWith(f + '/'));
      gate.writeScope.forEach((/** @type {string} */ s, /** @type {number} */ i) => {
        if (!inside(globToPrefix(s))) {
          red('scope-escape', `gate.writeScope.${i}`, `"${s}" is outside the job's fence [${jobWriteScope.join(', ')}] — the workflow may tighten the operator's bound, never exceed it`);
        }
      });
    }
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
        if (VERB_SLOT[op.op] !== slot) {
          red('verb-placement', opAt, `${op.op} is legal only in ${VERB_SLOT[op.op]} — the one slot where it has effect (an inert op is a fake knob in the contrast evidence)`);
          return;
        }
        const params = VERB_PARAMS[op.op];
        for (const [key, value] of Object.entries(op)) {
          if (key === 'op') continue;
          // Object.hasOwn, not `in`: params named after Object.prototype members
          // ("constructor", "toString") must not smuggle past the unknown-param red.
          if (!Object.hasOwn(params, key)) red('verb-params', `${opAt}.${key}`, `unknown param for ${op.op}`);
          else if (!params[key](value)) red('verb-params', `${opAt}.${key}`, `invalid value for ${op.op}.${key}`);
        }
      });
    }
  }

  // 5. secrets sweep — same guard as the job spec (the agent-authored document
  // is the riskier one; a green config is a ledger fact and inherits forever)
  sweepSecretLiterals(c, red);

  return { ok: reds.length === 0, reds, config: reds.length === 0 ? c : null };
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
