// Close integrity — PRD item 27 / M1(b), `docs/product/CLOSE-INTEGRITY-BUILD.md`.
//
// ONE detector for "does a close script bake in an absolute path", shared by
// `src/bundle.js` (export-time, mechanical) and the run-start precheck below
// (every job, not only bundles). Two spellings of the same rule is exactly
// how F129 shipped an export-only guard while every non-exported job stayed
// exposed — this module exists so that never happens again.
//
// `readCloseScripts` is the reader M2's sha256 fingerprint will reuse: pure,
// never throws on a missing file (reports it absent so a caller can red
// distinctly from a tampered one), and only ever looks at `node <path> …`
// stages — a `.sh` cmd or any other form is out of this module's scope, the
// same scope `src/bundle.js`'s own `parseCmd` already drew.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { isObj } from './validate.js';
import { closeStagesOf } from './plan.js';

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
 * `closeStagesOf`) of the form `node <path> …` to the script's absolute path
 * and bytes off disk. The spec's OWN `cmd` path is the address and is never
 * itself judged — only the named script's CONTENT is read here. A relative
 * path resolves against `cwd` (the caller passes the run's own workdir or
 * the spec file's directory, matching how each caller already resolves
 * paths elsewhere). Never throws: a missing/unreadable script reports
 * `bytes: null` so a caller can red it distinctly from a tampered one.
 * @param {any} spec resolved job spec (or anything `closeStagesOf` accepts)
 * @param {string} cwd
 * @returns {{stage: string, path: string, bytes: string|null}[]}
 */
export function readCloseScripts(spec, cwd) {
  const stages = closeStagesOf(spec) ?? [];
  /** @type {{stage: string, path: string, bytes: string|null}[]} */
  const out = [];
  for (const stage of stages) {
    if (!isObj(stage) || typeof stage.cmd !== 'string') continue;
    const parts = stage.cmd.trim().split(/\s+/);
    if (parts[0] !== 'node' || !parts[1]) continue;
    const scriptPath = isAbsolute(parts[1]) ? parts[1] : resolve(cwd, parts[1]);
    /** @type {string|null} */
    let bytes = null;
    try { bytes = readFileSync(scriptPath, 'utf8'); } catch { bytes = null; }
    out.push({ stage: typeof stage.name === 'string' ? stage.name : scriptPath, path: scriptPath, bytes });
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
