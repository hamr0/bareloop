// The shared validation primitives — the fence transform, containment, the
// secret-shape inventory, and the small type guards. Both validators
// (`validateJob`, `validatePlan`) go through this ONE module, because a scope
// that validated under one transform and enforced under another is the F9
// red-class: green at the gate, gate-red on every write.
//
// This file WAS the config-v1 workflow-config validator. config-v1 died in F22
// (of its 7 knobs only `loop.shape` was ever live, on a never-green run) and
// was DELETED with the operator-authored steps[] path on 2026-07-26 (PRD
// v1.32). What remains is what the live path imports — the primitives were
// housed here, they were never part of the dead schema.

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
// ONE shape inventory for the whole system: detection (this sweep) and the
// spine redactor (interpret wires these into bareguard's redact) must never
// disagree on what a secret looks like — a shape the validator reds but the
// redactor passes is a leak on the very output the validator was guarding.
export const SECRET_PATTERNS = [
  /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{16,}/,
  /(?<![A-Za-z0-9_-])ghp_[A-Za-z0-9]{20,}/,
  /(?<![A-Za-z0-9_-])github_pat_[A-Za-z0-9_]{20,}/,
  /(?<![A-Za-z0-9_-])AKIA[0-9A-Z]{16}/,
  /(?<![A-Za-z0-9_-])xox[bap]-[A-Za-z0-9-]{10,}/,
];
const SECRET_RE = new RegExp(SECRET_PATTERNS.map((r) => r.source).join('|'));

/**
 * Scan a RAW text stream (a spine file, a close's output, a transcript) for
 * known secret shapes and return the literal matches. The ONE spelling of the
 * text-side scan, for the same reason SECRET_PATTERNS is the ONE inventory: a
 * hand-rolled copy that misses a shape is a leak on the very output it guards.
 * The dedup is now COMPLETE and the count is grepped, not remembered: all 11
 * call sites in scripts/ go through this function, and zero hand-rolled copies
 * of the expression remain anywhere in the repo. (F40 landed the helper and
 * converted 2 of 7 sites; the 5 it left alone plus 4 that accreted afterwards
 * were converted in one sweep, byte-identical behaviour — measured equivalent
 * on 900 spiked real spines, 0 divergences.)
 * `sweepSecretLiterals` is the config-tree twin — same shapes, tree walk.
 * Never throws; returns [] for a missing stream.
 * @param {unknown} raw
 * @returns {string[]} every match, in stream order per pattern
 */
export function scanSecrets(raw) {
  const text = String(raw ?? '');
  // a fresh global clone per call: a shared /g regex carries lastIndex between
  // calls and would skip matches on the next stream
  return SECRET_PATTERNS.flatMap((re) => text.match(new RegExp(re.source, `${re.flags.replace('g', '')}g`)) ?? []);
}

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
    else if (isObj(node)) {
      for (const [k, v] of Object.entries(node)) {
        const path = at ? `${at}.${k}` : k;
        // keys too: inside free-form values (a gold expected, a conditions map)
        // a key is unconstrained, so a token can ride a KEY onto the spine
        if (SECRET_RE.test(k)) red('secret-literal', path, 'secrets load from the environment; an append-only record that captures a key captures it forever');
        sweep(v, path);
      }
    }
  })(root, '');
}
