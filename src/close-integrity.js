// Close integrity — PRD item 27 / M1(b), `docs/product/CLOSE-INTEGRITY-BUILD.md`.
//
// ONE detector for "does a close script bake in an absolute path", shared by
// `src/bundle.js` (export-time, mechanical) and the run-start precheck below
// (every job, not only bundles). Two spellings of the same rule is exactly
// how F129 shipped an export-only guard while every non-exported job stayed
// exposed — this module exists so that never happens again.
//
// `readCloseScripts` is the reader M2's sha256 fingerprint reuses: pure,
// never throws on a missing file (reports it absent so a caller can red
// distinctly from a tampered one). Scope (widened 2026-09-06, orchestrator
// audit): an INTERPRETER cmd (`node <path> …`, `sh <path> …`, …) OR a bare
// directly-executable ABSOLUTE path (a `.sh` wrapper with no interpreter
// prefix, e.g. `jobs/aurora-testgen-cold.json`'s close) — see
// `closeScriptCandidateToken` (src/validate.js) for the exact shape test.
// A relative bare executable (`true`, `pytest`) is still out of scope: it
// names no file at all, so there is nothing to read or sign.
//
// M2 (PRD item 27, `docs/product/CLOSE-INTEGRITY-BUILD.md`) adds the
// close-BYTES half beside the close-PATH half already here: `close[].sha256`
// is a hex sha256 of the same script bytes `readCloseScripts` already reads,
// so the fingerprint (`checkCloseByteSignature`/`checkStageByteSignature`)
// and the minting helper (`signCloseScripts`) both live in this one module —
// two spellings of "which bytes does this stage sign" is exactly the class
// of drift F129 shipped once already (see the module header above).

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { isObj, closeScriptCandidateToken } from './validate.js';
import { closeStagesOf } from './plan.js';

/**
 * Resolve a close stage's `cmd` to the addressable script's ABSOLUTE path on
 * disk — the shape test itself (`closeScriptCandidateToken`, src/validate.js)
 * is shared with `src/job.js`'s sha256 demand; this just resolves the
 * resulting token against `cwd` when it is relative. Returns null for
 * anything the shared shape test rejects (a relative bare executable, an
 * interpreter with no argument, a non-string/empty cmd).
 * @param {unknown} cmd
 * @param {string} cwd
 * @returns {string|null} absolute script path, or null if out of scope
 */
function closeScriptPathOf(cmd, cwd) {
  const token = closeScriptCandidateToken(cmd);
  if (token === null) return null;
  return isAbsolute(token) ? token : resolve(cwd, token);
}

/**
 * Hex sha256 of a close script's TEXT, exactly the way `src/bundle.js`'s own
 * `sha256(source)` hashes a close script's source before bundling (a JS
 * source file is always valid UTF-8, so hashing the decoded string and
 * hashing the raw file bytes agree) — ONE formula, so a signature minted here
 * and a mismatch read at export time can never disagree about what "the
 * bytes" means.
 * @param {string} text
 * @returns {string} sha256 hex
 */
export function hashCloseScriptBytes(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * A close script is entitled to name a real system path (`/usr/bin/env`,
 * `/etc/hosts`, …) without that being the F8/F129 hazard — only a path a
 * runner would actually relocate (a patient checkout, a scratch dir) is.
 * @type {string[]}
 */
export const SYSTEM_PATH_PREFIXES = ['/usr/', '/bin/', '/sbin/', '/lib/', '/lib64/', '/dev/', '/etc/', '/proc/', '/sys/', '/opt/'];

// Every quoted string literal (single/double/backtick). Backtick literals
// carrying `${…}` interpolation are filtered out below — they are not a
// fixed literal, so they cannot be "a path baked into the script" at all.
const STRING_LITERAL_RE = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

/**
 * F8/F129 — a close judges the cwd the runner gives it, never a path baked
 * into the script itself. This scans every quoted string literal in a close
 * script's source for an absolute POSIX path (`/…`) that EXISTS on this
 * machine right now and is not under an allow-listed system prefix.
 *
 * Deliberately monotone and simple, not clever, with named limits: a
 * nonexistent absolute-looking string is treated as a NAME, not a path —
 * `existsSync` is the only oracle this has for "load-bearing", so it is not
 * flagged; a path built by string concatenation (never one whole literal)
 * is invisible to this scan; and a literal that only exists inside a `//` or
 * `/* *\/` comment is naturally excluded because a comment carries no quote
 * characters of its own around the path text.
 * @param {string} source close script text
 * @returns {string[]} the offending literal path values, in source order
 */
export function absolutePathLiteralsOf(source) {
  /** @type {string[]} */
  const hits = [];
  for (const m of source.matchAll(STRING_LITERAL_RE)) {
    const isBacktick = m[3] !== undefined;
    const value = m[1] ?? m[2] ?? m[3];
    if (value === undefined) continue;
    if (isBacktick && value.includes('${')) continue; // interpolated, not a fixed literal
    if (!value.startsWith('/')) continue;
    if (SYSTEM_PATH_PREFIXES.some((p) => value.startsWith(p))) continue;
    if (!existsSync(value)) continue; // a nonexistent path is a name, not a hazard
    hits.push(value);
  }
  return hits;
}

/**
 * Resolve every `close[].cmd` (or `closeDecl`'s equivalent, via
 * `closeStagesOf`) that names an addressable script (`closeScriptCandidateToken`'s
 * scope: an interpreter cmd or a bare absolute executable) to its absolute
 * path and bytes off disk. The spec's OWN `cmd` path is the address and is never
 * itself judged — only the named script's CONTENT is read here. A relative
 * path resolves against `cwd` (the caller passes the run's own workdir or
 * the spec file's directory, matching how each caller already resolves
 * paths elsewhere). Never throws: a missing/unreadable script reports
 * `bytes: null` so a caller can red it distinctly from a tampered one.
 * `sha256` (M2, additive): the stage's OWN signed field, verbatim, or `null`
 * when the stage carries none — the field this rung's checker compares
 * against `hashCloseScriptBytes(bytes)`. M1's callers read `.stage`/`.path`/
 * `.bytes` only, so this addition is behaviour-preserving for them.
 * @param {any} spec resolved job spec (or anything `closeStagesOf` accepts)
 * @param {string} cwd
 * @returns {{stage: string, path: string, bytes: string|null, sha256: string|null}[]}
 */
export function readCloseScripts(spec, cwd) {
  const stages = closeStagesOf(spec) ?? [];
  /** @type {{stage: string, path: string, bytes: string|null, sha256: string|null}[]} */
  const out = [];
  for (const stage of stages) {
    if (!isObj(stage) || typeof stage.cmd !== 'string') continue;
    const scriptPath = closeScriptPathOf(stage.cmd, cwd);
    if (!scriptPath) continue;
    /** @type {string|null} */
    let bytes = null;
    try { bytes = readFileSync(scriptPath, 'utf8'); } catch { bytes = null; }
    out.push({
      stage: typeof stage.name === 'string' ? stage.name : scriptPath,
      path: scriptPath,
      bytes,
      sha256: typeof stage.sha256 === 'string' ? stage.sha256 : null,
    });
  }
  return out;
}

/**
 * The $0 run-start integrity check (PRD item 27(c)): red `close-absolute-path`
 * for EVERY job whose close script bakes in an absolute path literal that
 * exists on disk — the same rule `src/bundle.js`'s `exportBundle` already
 * applies at export time, now applied before the close-first precheck and
 * before any provider call, for every run, not only exported bundles. A
 * script this reads couldn't read (missing/unreadable) is not reported here
 * — that is `broken-close`'s job once the close actually tries to run it.
 * @param {any} spec resolved job spec
 * @param {string} cwd
 * @returns {{ ok: true } | { ok: false, reds: {stage: string, path: string, literal: string}[] }}
 */
export function checkCloseAbsolutePaths(spec, cwd) {
  const scripts = readCloseScripts(spec, cwd);
  /** @type {{stage: string, path: string, literal: string}[]} */
  const reds = [];
  for (const s of scripts) {
    if (s.bytes == null) continue;
    for (const literal of absolutePathLiteralsOf(s.bytes)) {
      reds.push({ stage: s.stage, path: s.path, literal });
    }
  }
  return reds.length > 0 ? { ok: false, reds } : { ok: true };
}

/** @typedef {{stage: string, path: string, expected: string, actual: string|null}} ByteRed */

/**
 * The core comparison, shared by the two checkers below: a `readCloseScripts`
 * row signs nothing (`sha256: null`, e.g. a `.sh`-cmd stage or a declared
 * kind) reads as `ok` — M2's validator is what demands the field on the
 * stages that must carry it; this runtime check only ever compares a
 * signature that exists.
 * @param {{stage: string, path: string, bytes: string|null, sha256: string|null}[]} scripts
 * @returns {{ ok: true } | { ok: false, reds: ByteRed[] }}
 */
function compareSignatures(scripts) {
  /** @type {ByteRed[]} */
  const reds = [];
  for (const s of scripts) {
    if (s.sha256 == null) continue;
    const actual = s.bytes == null ? null : hashCloseScriptBytes(s.bytes);
    if (actual !== s.sha256) reds.push({ stage: s.stage, path: s.path, expected: s.sha256, actual });
  }
  return reds.length > 0 ? { ok: false, reds } : { ok: true };
}

/**
 * M2's run-start integrity check (PRD item 27, `close-tampered`): every
 * signed `close[].sha256` must match the script's bytes off disk, RIGHT NOW —
 * checked before the close-first precheck and before any provider call,
 * exactly where `checkCloseAbsolutePaths` already runs (the two are always
 * called together at that seam). A script this cannot read reads `actual:
 * null` — distinct from a byte mismatch, but still a red: an unreadable
 * signed script is exactly as untrustworthy as a tampered one, and silently
 * treating "gone" as "fine" would be the M1 F129 hazard in a new coat.
 * @param {any} spec resolved job spec
 * @param {string} cwd
 * @returns {{ ok: true } | { ok: false, reds: ByteRed[] }}
 */
export function checkCloseByteSignature(spec, cwd) {
  return compareSignatures(readCloseScripts(spec, cwd));
}

/** the exact env var name a close script reads for its own books directory
 * (Part B, PRD item 27/M3) — named once so the detector below and the runner
 * that sets it (`src/ralph.js`'s `runClose`) can never drift into two
 * spellings of the same contract. */
export const CLOSE_DIR_ENV_VAR = 'BARELOOP_CLOSE_DIR';

/**
 * PRD item 27/M3, Part B — "the library `runJob` takes `closeDir` and refuses
 * at $0 if a spec's close needs it and none is given." A close script's
 * NEED is read the same way its bytes already are (`readCloseScripts`): a
 * script whose source mentions `BARELOOP_CLOSE_DIR` reads that variable at
 * run time, so a run with no `closeDir` handed to it would run that script
 * against `undefined` — silently, since `env.BARELOOP_CLOSE_DIR` would just
 * be absent from the child's environment rather than throwing. Refusing here,
 * at the same $0 run-start seam as the absolute-path/byte-signature checks,
 * turns that silent gap into a named red before any tokens spend, rather than
 * leaving it to whatever the script's own author remembered to check for.
 *
 * A script that never mentions the variable carries no demand — most
 * predicate-only fixture closes (`true`, `pytest`) have no books of their own
 * to keep, and requiring a `closeDir` for them would be a needless refusal.
 * @param {any} spec resolved job spec
 * @param {string} cwd
 * @param {string|null|undefined} closeDir the value the runner is about to hand
 *   the close as `BARELOOP_CLOSE_DIR` (or none)
 * @returns {{ ok: true } | { ok: false, reds: {stage: string, path: string}[] }}
 */
export function checkCloseDirRequired(spec, cwd, closeDir) {
  if (typeof closeDir === 'string' && closeDir.length > 0) return { ok: true };
  const scripts = readCloseScripts(spec, cwd);
  /** @type {{stage: string, path: string}[]} */
  const reds = [];
  for (const s of scripts) {
    if (s.bytes != null && s.bytes.includes(CLOSE_DIR_ENV_VAR)) reds.push({ stage: s.stage, path: s.path });
  }
  return reds.length > 0 ? { ok: false, reds } : { ok: true };
}

/**
 * The re-verify that runs before EVERY close run, precheck included (PRD
 * item 27, M2 §2) — scoped to the STAGES about to actually run rather than
 * the whole spec, because that is the true blast radius of "was this close
 * script's content tampered with since it was signed" for this particular
 * invocation. Same comparison, same red shape, as `checkCloseByteSignature`;
 * kept as a separate export because its caller (`runCloseStages` in
 * `src/planrun.js`) already holds a stage array, not a spec.
 * @param {any[]} stages a close stage chain (the shape `runStages` takes)
 * @param {string} cwd
 * @returns {{ ok: true } | { ok: false, reds: ByteRed[] }}
 */
export function checkStageByteSignature(stages, cwd) {
  const scripts = [];
  for (const stage of Array.isArray(stages) ? stages : []) {
    if (!isObj(stage) || typeof stage.cmd !== 'string') continue;
    const scriptPath = closeScriptPathOf(stage.cmd, cwd);
    if (!scriptPath) continue;
    /** @type {string|null} */
    let bytes = null;
    try { bytes = readFileSync(scriptPath, 'utf8'); } catch { bytes = null; }
    scripts.push({
      stage: typeof stage.name === 'string' ? stage.name : scriptPath,
      path: scriptPath,
      bytes,
      sha256: typeof stage.sha256 === 'string' ? stage.sha256 : null,
    });
  }
  return compareSignatures(scripts);
}

/**
 * M2's minting helper (PRD item 27 §3) — fills `close[].sha256` from disk for
 * every addressable-script stage in `spec.close` (`closeScriptCandidateToken`'s
 * scope: an interpreter cmd or a bare absolute executable, e.g. a `.sh`
 * wrapper). Pure: never writes anything itself (the CLI wrapper,
 * `scripts/sign-close.mjs`, gates on `--write`) and never throws on a
 * missing/unreadable script — it names the miss in `missing` and leaves
 * that stage's `sha256` untouched, so a caller can refuse to sign (and
 * refuse to report a hash it never computed) a spec it could not fully
 * hash. A stage outside this rung's scope (a relative bare executable, a
 * declared-kind stage) passes through unchanged and is never listed as
 * missing — it was never addressable to begin with (same scope
 * `readCloseScripts`/`checkCloseAbsolutePaths` already draw).
 *
 * Only ever operates on `spec.close` (the command-close array) — a
 * `closeDecl` spec has no script path to sign and `signCloseScripts` reports
 * `ok:false` for one rather than silently doing nothing to it.
 * @param {any} spec resolved job spec (parsed `jobs/<x>.json`)
 * @param {string} cwd base for resolving a RELATIVE script path (jobs in this
 *   repo only ever use absolute `cmd` paths; relative resolution is here for
 *   parity with `readCloseScripts` and any future relative-path spec)
 * @returns {{ ok: boolean, spec: any, changes: {stage: string, path: string, old: string|null, new: string}[], missing: {stage: string, path: string}[] }}
 */
export function signCloseScripts(spec, cwd) {
  if (!isObj(spec) || !Array.isArray(spec.close)) {
    return { ok: false, spec, changes: [], missing: [] };
  }
  /** @type {{stage: string, path: string, old: string|null, new: string}[]} */
  const changes = [];
  /** @type {{stage: string, path: string}[]} */
  const missing = [];
  const newClose = spec.close.map((/** @type {any} */ stage) => {
    if (!isObj(stage)) return stage;
    const scriptPath = closeScriptPathOf(stage.cmd, cwd);
    if (!scriptPath) return stage; // out of this rung's scope — never touched, never reported missing
    /** @type {string|null} */
    let bytes = null;
    try { bytes = readFileSync(scriptPath, 'utf8'); } catch { bytes = null; }
    if (bytes == null) { missing.push({ stage: stage.name, path: scriptPath }); return stage; }
    const hash = hashCloseScriptBytes(bytes);
    changes.push({ stage: stage.name, path: scriptPath, old: typeof stage.sha256 === 'string' ? stage.sha256 : null, new: hash });
    return { ...stage, sha256: hash };
  });
  return { ok: missing.length === 0, spec: { ...spec, close: newClose }, changes, missing };
}
