// Export M1 — `docs/product/EXPORT-BUILD.md` (frozen 2026-09-05). A BUNDLE is a
// directory an importer can `npm install` and run without this repo: the signed
// job spec (close paths rewritten to `$BARELOOP_BUNDLE/close/<script>`), the
// close scripts it runs, and the job's whole registry history (bridges). This
// module is the pure, testable half — it writes/reads the directory and its
// signature; nothing here talks to a provider or runs a close.
//
// N4 (the spec's negative POC, load-bearing): the manifest's `bundleHash`
// verify is not a courtesy. `jobSpecHash` covers `close[].cmd` as a PATH, not
// the script's bytes, so a swapped close script leaves the spec's own
// signature intact and the close-first precheck would read the fake result as
// an early green. `readBundle`'s `bundle-tampered` red is therefore the ONLY
// thing standing between a swapped script and a fake green, and every caller
// (M2's runner) must run it before anything else touches the bundle.
//
// Bridges and history are OUTSIDE the bundle hash on purpose (they are
// records, not the arbiter) — only `spec.json` and `close/*` are signed.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { isObj, isNonEmptyString } from './validate.js';
import { jobSpecHash } from './job.js';
import { loadRegistry } from './bridges.js';
import { closeStagesOf } from './plan.js';
import { shapeForkName } from './reuse.js';
import { absolutePathLiteralsOf, hashCloseScriptBytes } from './close-integrity.js';
// The live export list IS `src/index.js`'s own `Object.keys` — never a second,
// hand-kept copy that can drift from the real surface a close script can
// legally import. This module is itself exported from `index.js` (a cycle by
// design): the binding is only READ inside function bodies, at call time,
// long after both modules have finished evaluating, so the cycle is safe.
import * as bareloopExports from './index.js';

/** @typedef {{code: string, path: string, detail?: string}} Red */

const BUNDLE_SCHEMA = 'bundle-v1';
const BUNDLE_TOKEN = '$BARELOOP_BUNDLE';

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/** @param {Buffer|string} content @returns {string} sha256 hex */
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * The ONE bundle-hash formula: sha256 over the sorted `path:contentSha256`
 * lines of a files map. `bundleHash(dir)` and `exportBundle` both go through
 * this so minting and re-verifying can never drift into two spellings.
 * @param {Record<string, string>} files path -> sha256 hex
 * @returns {string} sha256 hex
 */
function hashFilesMap(files) {
  const lines = Object.keys(files).sort().map((p) => `${p}:${files[p]}`);
  return sha256(lines.join('\n'));
}

/**
 * Read `spec.json` and every `close/*` file off disk and hash them the same
 * way `exportBundle` did at mint time. Never throws: a missing file (a
 * deleted close script, a missing spec.json) is reported as absent so a
 * caller comparing against a stored hash reads it as tampered rather than
 * crashing.
 * @param {string} dir bundle directory
 * @returns {{ files: Record<string, string>, missing: string[] }}
 */
function collectHashedFiles(dir) {
  /** @type {Record<string, string>} */
  const files = {};
  /** @type {string[]} */
  const missing = [];
  const specPath = join(dir, 'spec.json');
  if (existsSync(specPath)) files['spec.json'] = sha256(readFileSync(specPath));
  else missing.push('spec.json');
  const closeDir = join(dir, 'close');
  if (isDir(closeDir)) {
    for (const f of readdirSync(closeDir).sort()) {
      files[`close/${f}`] = sha256(readFileSync(join(closeDir, f)));
    }
  } else missing.push('close/');
  return { files, missing };
}

/**
 * Recompute the bundle hash from what is ACTUALLY on disk right now (never
 * trusts the stored manifest). Throws only if `dir` itself does not exist —
 * every other absence (a missing spec.json, an empty close/) folds into the
 * hash as an omitted file, which is exactly what makes a swapped/deleted
 * script change the hash.
 * @param {string} dir bundle directory
 * @returns {string} sha256 hex
 */
export function bundleHash(dir) {
  if (!isDir(dir)) throw new Error(`bundleHash: not a directory: ${dir}`);
  const { files } = collectHashedFiles(dir);
  return hashFilesMap(files);
}

/**
 * The pattern a close script's import line must match to be rewritten/checked:
 * a relative specifier that reaches into this repo's `src/` (`../src/x.js`,
 * `./src/x.js`, `../../src/x.js`, …). A script importing `bareloop` itself
 * (the installed package, post-rewrite) matches on the literal name instead.
 * @param {string} spec the quoted module specifier
 * @returns {boolean}
 */
function isBareloopSrcImport(spec) {
  return spec === 'bareloop' || /^(\.\.?\/)+src\//.test(spec);
}

// Every STATIC import statement, clause captured whole (undefined when there
// is no `from` — a bare side-effect `import 'x'`). Deliberately permissive:
// the shape check below is what decides legality, not this regex.
const STATIC_IMPORT_RE = /import\s+(?:([^'";]*?)\s+from\s+)?(['"])([^'"]+)\2/g;
// Dynamic `import('x')` (and `await import('x')`, `import ('x')`, …) — no
// clause exists for this form at all, so it is ALWAYS unparsed when it
// targets something this bundle would otherwise have to check.
const DYNAMIC_IMPORT_RE = /import\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

/** @param {string} spec @returns {boolean} */
function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../');
}

// F8/F129 — `absolutePathLiteralsOf` (a close judges the cwd the runner
// gives it, never a path baked into the script itself) now lives in
// `src/close-integrity.js`, shared with the run-start precheck that applies
// the SAME rule to every job, not only exports. Never a second spelling.

/**
 * Every import in a close script this bundle has an opinion about: a
 * relative import (src-bound or not — a sibling file is exactly the case
 * that must be caught) and the bare `'bareloop'` package specifier. A
 * node:/third-party specifier is filtered out here and never reaches the
 * legality check — this module has nothing to say about those.
 * @param {string} source close script text
 * @returns {{ raw: string, spec: string, clause: string|null, dynamic: boolean }[]}
 */
function relevantImportsOf(source) {
  /** @type {{ raw: string, spec: string, clause: string|null, dynamic: boolean }[]} */
  const out = [];
  for (const m of source.matchAll(STATIC_IMPORT_RE)) {
    const [raw, clause, , spec] = m;
    if (!isRelative(spec) && spec !== 'bareloop') continue;
    out.push({ raw: raw.trim(), spec, clause: clause === undefined ? null : clause.trim(), dynamic: false });
  }
  for (const m of source.matchAll(DYNAMIC_IMPORT_RE)) {
    const [raw, , spec] = m;
    if (!isRelative(spec) && spec !== 'bareloop') continue;
    out.push({ raw: raw.trim(), spec, clause: null, dynamic: true });
  }
  return out;
}

/**
 * The ONLY import shape this module can verify: a plain `{ a, b as c }`
 * named clause. Anything else — a default import, `* as ns`, a mix of
 * default+named/namespace, a bare side-effect import, or (by construction,
 * since it carries no clause at all) a dynamic `import()` — is UNPARSED, not
 * silently accepted: a legality check that skips what it cannot read is a
 * blind instrument, and blind is not the same as clean.
 * @param {string|null} clause @param {boolean} dynamic
 * @returns {boolean}
 */
function isPlainNamedClause(clause, dynamic) {
  return !dynamic && clause !== null && /^\{[^{}]*\}$/.test(clause);
}

/**
 * Rewrite every `from '<relative-into-src>'` specifier in a close script's
 * source to `from 'bareloop'` — the one substitution the spec names (N-facts,
 * "close scripts copied verbatim except …"). Only the specifier moves; the
 * imported names are untouched, so a script importing `JUDGED_MARKER` from
 * `../src/kinds.js` imports it from `bareloop` instead, byte-identical
 * otherwise.
 * @param {string} source
 * @returns {string}
 */
function rewriteSrcImports(source) {
  return source.replace(/from\s+(['"])(\.\.?\/)+src\/[^'"]*\1/g, "from 'bareloop'");
}

/**
 * Parse one `close[].cmd` into its no-shell argv (the runner spawns it
 * without a shell — `src/ralph.js`, whitespace split). Refuses anything that
 * is not exactly `node <absolute path ending .mjs> <args…>` — the one shape
 * this bundle can relocate, because it is the one shape whose first argv
 * token IS a path this module controls.
 * @param {string} cmd
 * @returns {{ ok: true, scriptPath: string, rest: string[] } | { ok: false }}
 */
function parseNodeCmd(cmd) {
  if (!isNonEmptyString(cmd)) return { ok: false };
  const parts = cmd.trim().split(/\s+/);
  if (parts.length < 2 || parts[0] !== 'node') return { ok: false };
  const scriptPath = parts[1];
  if (!isAbsolute(scriptPath) || !scriptPath.endsWith('.mjs')) return { ok: false };
  return { ok: true, scriptPath, rest: parts.slice(2) };
}

/**
 * EXPORT — mints a bundle directory from a signed job spec (`docs/product/
 * EXPORT-BUILD.md`, "The bundle"). Every check below runs BEFORE anything
 * touches disk (typed reds, nothing written): a partially-written bundle
 * would be worse than no bundle, since `readBundle`'s tamper check has
 * nothing trustworthy to compare against yet.
 *
 * Refusals, each a distinct red code:
 *  - `no-bridge-at-hash` — neither of the job's two possible bridge names —
 *    `spec.job` itself, or its SHAPE FORK `shapeForkName(spec.job,
 *    closeStagesOf(spec))` (the name `writeGreenRow`/`writeRunGreenRow` in
 *    `src/reuse.js` mint whenever a run's close-stage set differs from the
 *    base bridge's `closeStageNames` — same derivation, imported rather than
 *    re-spelled, so the two names cannot drift) — carries a recorded specHash
 *    (bridge-level or on some version) equal to `jobSpecHash(spec)`: nothing
 *    has ever greened THIS exact spec, so there is nothing proven to ship.
 *    Every candidate bridge that DOES exist (base and/or fork) still ships
 *    into `bridges/` — the spec says "the job's WHOLE registry history
 *    (greens and reds)", not just the one that matched.
 *  - `close-cmd-unrelocatable` — a `close[].cmd` is not `node <abs .mjs> …`.
 *  - `close-script-missing` — a cmd names a script `closeScripts` does not
 *    carry the source for.
 *  - `close-script-collision` — two different script paths share a basename;
 *    copying both into one flat `close/` directory would silently clobber one.
 *  - `close-import-unexported` — a close script imports a name from
 *    bareloop's own src that `src/index.js` does not export.
 *  - `close-import-unparsed` — a close script's import is a shape this
 *    module cannot verify at all (default import, `* as ns`, mixed
 *    default+named/namespace, a bare side-effect import, or a dynamic
 *    `import()`), or is a relative import that does not point into
 *    `src/` (a sibling file `close/` never ships, so it would be missing
 *    from the bundle). Fails safe rather than silently accepting what it
 *    cannot read.
 *  - `close-absolute-path` — a close script's source bakes in a string
 *    literal that is an absolute POSIX path which exists on the exporting
 *    machine and is outside the system-prefix allow-list (see
 *    `absolutePathLiteralsOf`): a close judges the cwd the runner gives it,
 *    never a path baked into the script — F8/F129, the live defect this
 *    guard would have refused at export time before any run.
 *  - `outdir-not-empty` — `outDir` exists and already holds files.
 *  - `registry-unreadable` — `registryDir` itself could not be read
 *    (bubbled from `loadRegistry`).
 * @param {{ spec: any, closeScripts: Record<string, string>, registryDir: string, outDir: string, bareloopVersion: string }} o
 * @returns {{ ok: boolean, reds: Red[], dir: string|null, bundleHash: string|null, manifest: any|null }}
 */
export function exportBundle({ spec, closeScripts, registryDir, outDir, bareloopVersion }) {
  /** @type {Red[]} */
  const reds = [];
  const red = (/** @type {string} */ code, /** @type {string} */ path, /** @type {string} */ detail) => reds.push({ code, path, detail });
  const fail = () => ({ ok: false, reds, dir: null, bundleHash: null, manifest: null });

  if (!isObj(spec) || !isNonEmptyString(spec.job)) {
    red('invalid-value', 'spec.job', 'a job spec with a job slug is required');
    return fail();
  }
  if (!Array.isArray(spec.close) || spec.close.length === 0) {
    red('invalid-value', 'spec.close', 'a non-empty ordered close stage list is required to export');
    return fail();
  }
  const scripts = isObj(closeScripts) ? closeScripts : {};

  // outDir: refuse a non-empty destination before any other check runs, since
  // this is the cheapest way to fail and the one most likely to be a mistake
  // (re-exporting into a directory that already holds a prior bundle/blessing).
  if (existsSync(outDir)) {
    if (!isDir(outDir)) { red('invalid-value', 'outDir', 'exists and is not a directory'); return fail(); }
    if (readdirSync(outDir).length > 0) { red('outdir-not-empty', outDir, 'exportBundle never merges into an existing directory'); return fail(); }
  }

  // registry: the job must have a bridge minted at THIS exact spec's hash.
  const reg = loadRegistry(registryDir);
  if (!reg.ok && reg.bridges.length === 0) {
    red('registry-unreadable', registryDir, reg.reds.map((r) => `${r.code}:${r.path}`).join(', ') || 'the registry could not be read');
    return fail();
  }
  const currentHash = jobSpecHash(spec);
  // Two candidate bridge names for this job: its own name, and the SHAPE FORK
  // `writeGreenRow` mints when a run's close-stage set differs from the base
  // bridge's stored `closeStageNames` (src/reuse.js `shapeForkName`). The
  // stage names are derived through the same `closeStagesOf` the writer uses,
  // never re-spelled, so the fork name this reads can never drift from the
  // fork name that gets minted.
  const stageNames = (closeStagesOf(spec) ?? []).map((/** @type {any} */ s) => s.name);
  const forkName = shapeForkName(spec.job, stageNames);
  const candidateNames = new Set([spec.job, forkName]);
  const candidateBridges = reg.bridges.filter((/** @type {any} */ b) => candidateNames.has(b.name));
  const hashMatches = candidateBridges.some((/** @type {any} */ b) => (
    b.specHash === currentHash
    || (Array.isArray(b.versions) && b.versions.some((/** @type {any} */ v) => v.specHash === currentHash))
  ));
  if (!hashMatches) {
    red('no-bridge-at-hash', 'spec', `neither "${spec.job}" nor its shape fork "${forkName}" in ${registryDir} carries a green at this spec's current hash (${currentHash.slice(0, 12)}…) — export ships a run that actually happened, never an unproven draft`);
  }

  // close[].cmd shape + import legality, over EVERY stage before writing any of them.
  const exportNames = new Set(Object.keys(bareloopExports));
  /** @type {Map<string, string>} scriptPath -> basename, dedup'd */
  const byPath = new Map();
  /** @type {Map<string, string>} basename -> scriptPath (collision detection) */
  const byName = new Map();
  spec.close.forEach((/** @type {any} */ stage, /** @type {number} */ i) => {
    const at = `close.${i}.cmd`;
    const parsed = parseNodeCmd(isObj(stage) ? stage.cmd : undefined);
    if (!parsed.ok) { red('close-cmd-unrelocatable', at, `must be "node <absolute path>.mjs …" — got ${JSON.stringify(isObj(stage) ? stage.cmd : stage)}`); return; }
    const { scriptPath } = parsed;
    if (byPath.has(scriptPath)) return; // already checked this path from an earlier stage
    const name = basename(scriptPath);
    const collidesWith = byName.get(name);
    if (collidesWith && collidesWith !== scriptPath) {
      red('close-script-collision', at, `"${name}" is already claimed by ${collidesWith} — two different close scripts cannot share one basename in a flat close/ directory`);
      return;
    }
    byName.set(name, scriptPath);
    byPath.set(scriptPath, name);
    const source = scripts[scriptPath];
    if (!isNonEmptyString(source)) { red('close-script-missing', at, `closeScripts has no source for ${scriptPath}`); return; }
    for (const imp of relevantImportsOf(source)) {
      if (!isPlainNamedClause(imp.clause, imp.dynamic) || (isRelative(imp.spec) && !isBareloopSrcImport(imp.spec))) {
        red('close-import-unparsed', at, `${basename(scriptPath)}: "${imp.raw}" is not a plain named import this bundle can verify — a default/namespace/side-effect/dynamic import, or a relative import outside src/ (close/ ships only the named script, so a sibling file would be missing from the bundle)`);
        continue;
      }
      // isPlainNamedClause guarantees clause is a non-null `{ ... }` string here
      const names = /** @type {string} */ (imp.clause).slice(1, -1).split(',')
        .map((raw) => raw.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      for (const name of names) {
        if (!exportNames.has(name)) {
          red('close-import-unexported', at, `${basename(scriptPath)} imports "${name}" from bareloop's src, which src/index.js does not export`);
        }
      }
    }
    for (const lit of absolutePathLiteralsOf(source)) {
      red('close-absolute-path', at, `${basename(scriptPath)}: bakes in the absolute path "${lit}" — a close judges the cwd the runner gives it, never a path baked into the script (F8/F129)`);
    }
    // PRD item 27/M2 — the spec's OWN sha256 (if it carries one) must agree
    // with the bytes actually being packed into the bundle: the two
    // signatures (this one, and `bundleHash`'s manifest hash over the
    // rewritten script) cover the same bytes by two different paths, and N4
    // is exactly the hazard of letting a spec's signature drift from what it
    // names. A spec with no sha256 at all is a SEPARATE red (`validateJob`'s
    // `missing-required`, upstream of export) — this only fires when a value
    // is present and wrong.
    if (isNonEmptyString(stage.sha256)) {
      const actual = hashCloseScriptBytes(source);
      if (actual !== stage.sha256) {
        red('close-sha-mismatch', at, `${basename(scriptPath)}: signed sha256 ${stage.sha256.slice(0, 12)}… does not match the script bytes being packed (${actual.slice(0, 12)}…) — re-sign before exporting`);
      }
    }
  });

  if (reds.length > 0) return fail();

  // ── everything validated — now write, in one pass ──────────────────────
  mkdirSync(outDir, { recursive: true });
  const closeDir = join(outDir, 'close');
  mkdirSync(closeDir, { recursive: true });
  const bridgesDir = join(outDir, 'bridges');
  mkdirSync(bridgesDir, { recursive: true });

  /** @type {Record<string, string>} */
  const files = {};
  // F132 — keyed by scriptPath (not name) so the spec-rewrite pass below can
  // look up each relocated stage's REWRITTEN-bytes hash without re-hashing.
  // Both `sha256` here and `hashCloseScriptBytes` (src/close-integrity.js)
  // hash the same way (sha256 of the UTF-8 script text) — this is not a
  // second formula, just this module's own existing helper reused.
  /** @type {Map<string, string>} scriptPath -> sha256 of the RELOCATED bytes */
  const relocatedSha = new Map();
  for (const [scriptPath, name] of byPath) {
    const rewritten = rewriteSrcImports(scripts[scriptPath]);
    writeFileSync(join(closeDir, name), rewritten);
    const hash = sha256(rewritten);
    files[`close/${name}`] = hash;
    relocatedSha.set(scriptPath, hash);
  }

  const specOut = { ...spec, close: spec.close.map((/** @type {any} */ stage) => {
    const parsed = parseNodeCmd(stage.cmd);
    // unreachable: every stage's cmd already passed this same parse above, or
    // the function returned before reaching this write pass at all
    if (!parsed.ok) throw new Error(`unreachable: ${stage.cmd} was validated as a relocatable close cmd`);
    const name = byPath.get(parsed.scriptPath);
    const cmd = ['node', `${BUNDLE_TOKEN}/close/${name}`, ...parsed.rest].join(' ');
    // F132 (run mtqwmb9l/mtqwydl4): the bundle's manifest hash covers the
    // RELOCATED bytes (the import rewrite above), but the spec's own
    // `close[].sha256` was left carrying the SOURCE spec's signature — two
    // signatures over two different byte strings, so `checkCloseByteSignature`
    // at run start correctly read the bundle as tampered even though nothing
    // was. Re-sign here, over the bytes actually being packed, so the two
    // signatures agree by construction. Only a stage that already carried a
    // signature gets one written back — a stage export never fabricates a
    // signature that was never there (M2 leaves that to the validator).
    const sha256Out = typeof stage.sha256 === 'string' ? (relocatedSha.get(parsed.scriptPath) ?? stage.sha256) : stage.sha256;
    return { ...stage, cmd, sha256: sha256Out };
  }) };
  const specText = `${JSON.stringify(specOut, null, 2)}\n`;
  writeFileSync(join(outDir, 'spec.json'), specText);
  files['spec.json'] = sha256(specText);

  // Bundle EVERY candidate bridge that exists (base and/or shape fork) — the
  // spec says "the job's whole registry history (greens and reds)", not just
  // whichever one happened to carry the matching hash.
  for (const b of candidateBridges) {
    writeFileSync(join(bridgesDir, `${b.name}.json`), `${JSON.stringify(b, null, 2)}\n`);
  }

  const hash = hashFilesMap(files);
  const manifest = {
    schema: BUNDLE_SCHEMA,
    job: spec.job,
    exportedAt: new Date().toISOString(),
    bareloopVersion,
    files,
    bundleHash: hash,
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // `package.json` — required by the frozen spec's bundle table so `npm install
  // <bundle dir>` (validation step 2) works in a clean consumer. Deliberately
  // OUTSIDE `bundleHash`: the hash covers spec.json + close/* only (per spec),
  // so this file is written after `hashFilesMap(files)` above and never folded
  // into `files`/`manifest.files`.
  const npmName = `${spec.job}.bareloop`.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const packageJson = {
    name: npmName,
    version: '1.0.0',
    private: true,
    type: 'module',
    dependencies: { bareloop: `^${bareloopVersion}` },
    bareloop: { manifest: 'manifest.json' },
  };
  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

  const readme = [
    `# ${spec.job}`,
    '',
    spec.goal ? spec.goal : '',
    '',
    `bundleHash: ${hash}`,
    `exported: ${manifest.exportedAt}`,
    `bareloop: ${bareloopVersion}`,
    '',
    '## Install this bundle\'s own dependency first (F128)',
    '',
    '  cd <this directory> && npm install',
    '',
    'This bundle\'s own package.json declares "bareloop" as its dependency — its close',
    'scripts import from it at run time. `npm install <this directory>` from SOMEWHERE',
    'ELSE installs this bundle AS that other project\'s dependency instead, which never',
    'installs this bundle\'s own node_modules and crashes every close stage. Run npm',
    'install INSIDE this directory, then use the bareloop binary it just installed:',
    '',
    '## Running this bundle',
    '',
    '  ./node_modules/.bin/bareloop run . --repo <path> [--budget N] [--wall MIN] [--approve <bundleHash>]',
    '',
    'Answer these, in the order `bareloop run` asks them:',
    '',
    '1. Provider key — set ANTHROPIC_API_KEY in your environment (never on the',
    '   command line, never in a file). Absent, `bareloop run` prints these',
    '   questions and the bundleHash again, and spends nothing.',
    `2. Approve — the FIRST run on this machine requires --approve ${hash}`,
    "   (this bundle's own signed hash, shown above) to prove a human read and",
    '   accepted it before anything runs. Once that first run GREENS, the',
    '   bundle is blessed and later runs need no re-approval ("no-resign") as',
    '   long as it stays unchanged.',
    '3. Repo — --repo <path> must be a git repository with at least one commit.',
    '   Every run creates a FRESH detached worktree under',
    '   <repo>/.bareloop/wt/<runid> and never reuses or deletes one for you;',
    '   your checkout is never touched.',
    '4. Budget/wall (optional) — --budget <usd> and --wall <minutes> may only',
    `   TIGHTEN this bundle's own signed ceiling${spec.maxWallMs != null ? 's' : ''} (budgetUsd ${spec.budgetUsd ?? '?'}`
      + `${spec.maxWallMs != null ? `, maxWallMs ${spec.maxWallMs}` : ''}); raising either is a`,
    '   re-export, never a runner flag.',
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'README.md'), readme);

  return { ok: true, reds: [], dir: outDir, bundleHash: hash, manifest };
}

/** @param {string} file @returns {{ ok: true, value: any } | { ok: false, error: string }} */
function readJsonFile(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (err) {
    return { ok: false, error: String(/** @type {Error} */ (err).message) };
  }
  try { return { ok: true, value: JSON.parse(text) }; } catch (err) {
    return { ok: false, error: String(/** @type {Error} */ (err).message) };
  }
}

/**
 * READ a bundle directory back: the manifest/spec, tamper-checked against
 * what is actually on disk, plus the record-only bridges/blessing/history a
 * runner needs beside them. Never throws — every failure is a typed red.
 *
 * `bundle-tampered` (N4) is a RED, never a warning, and runs whenever both a
 * manifest and a spec could be read at all — a swapped close script must be
 * caught here, before any caller reaches `runJob`.
 * @param {string} dir bundle directory
 * @returns {{ ok: boolean, reds: Red[], spec: any, manifest: any, bridges: any[], blessing: any, history: any[] }}
 */
export function readBundle(dir) {
  /** @type {Red[]} */
  const reds = [];
  const red = (/** @type {string} */ code, /** @type {string} */ path, /** @type {string} */ detail) => reds.push({ code, path, detail });

  if (!isDir(dir)) {
    red('bundle-missing', dir, 'not a directory');
    return { ok: false, reds, spec: null, manifest: null, bridges: [], blessing: null, history: [] };
  }

  const manifestR = readJsonFile(join(dir, 'manifest.json'));
  if (!manifestR.ok) red('manifest-invalid', 'manifest.json', manifestR.error);
  const specR = readJsonFile(join(dir, 'spec.json'));
  if (!specR.ok) red('spec-invalid', 'spec.json', specR.error);

  if (manifestR.ok && specR.ok) {
    let recomputed = null;
    try { recomputed = bundleHash(dir); } catch { recomputed = null; }
    if (recomputed === null || recomputed !== manifestR.value.bundleHash) {
      red('bundle-tampered', 'manifest.bundleHash', `stored ${manifestR.value.bundleHash ?? '<none>'} vs recomputed ${recomputed ?? '<unreadable>'}`);
    }
  }

  /** @type {any[]} */
  const bridges = [];
  const bridgesDir = join(dir, 'bridges');
  if (isDir(bridgesDir)) {
    for (const f of readdirSync(bridgesDir).filter((n) => n.endsWith('.json')).sort()) {
      const r = readJsonFile(join(bridgesDir, f));
      if (r.ok) bridges.push(r.value);
    }
  }

  const blessingR = readJsonFile(join(dir, 'blessing.json'));

  /** @type {any[]} */
  const history = [];
  const historyFile = join(dir, 'history.jsonl');
  if (existsSync(historyFile)) {
    for (const line of readFileSync(historyFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { history.push(JSON.parse(line)); } catch { /* a malformed line is skipped, not fatal to the read */ }
    }
  }

  return {
    ok: reds.length === 0,
    reds,
    spec: specR.ok ? specR.value : null,
    manifest: manifestR.ok ? manifestR.value : null,
    bridges,
    blessing: blessingR.ok ? blessingR.value : null,
    history,
  };
}

/**
 * The IN-MEMORY `$BARELOOP_BUNDLE` substitution (the frozen spec's "two
 * facts": the runner never touches the spec on disk, it substitutes the
 * absolute bundle directory into a copy before `runJob`, and signs THAT
 * substituted spec's hash — not the on-disk one). `approveHash` is the value
 * an `--approve` flag / a `history.jsonl` row must record.
 * @param {{ spec: any }} bundle a `readBundle` result (or anything carrying `.spec`)
 * @param {string} bundleDir absolute or relative bundle directory
 * @returns {{ spec: any, approveHash: string }}
 */
export function resolveBundleSpec(bundle, bundleDir) {
  const absDir = resolve(bundleDir);
  const spec = JSON.parse(JSON.stringify(bundle.spec));
  if (Array.isArray(spec.close)) {
    spec.close = spec.close.map((/** @type {any} */ stage) => (
      isObj(stage) && typeof stage.cmd === 'string'
        ? { ...stage, cmd: stage.cmd.split(BUNDLE_TOKEN).join(absDir) }
        : stage
    ));
  }
  return { spec, approveHash: jobSpecHash(spec) };
}

/**
 * TIGHTEN-ONLY envelope check (hamr Q8: raising the ceiling is a re-export,
 * never a runner flag). Each GIVEN number must be ≤ the bundle spec's own —
 * an absent field in the envelope trivially passes (nothing was asked to
 * tighten), and a spec with no ceiling of its own for that field (only
 * `maxWallMs` is ever absent — `budgetUsd` is required) has nothing to
 * widen, so a given number passes there too.
 * @param {any} spec the (already `$BARELOOP_BUNDLE`-resolved) bundle spec
 * @param {{ budgetUsd?: number, maxWallMs?: number }} envelope
 * @returns {{ ok: boolean, reds: Red[] }}
 */
export function checkEnvelope(spec, envelope = {}) {
  /** @type {Red[]} */
  const reds = [];
  const s = isObj(spec) ? spec : {};
  const e = isObj(envelope) ? envelope : {};
  for (const field of /** @type {const} */ (['budgetUsd', 'maxWallMs'])) {
    if (e[field] === undefined) continue;
    if (typeof e[field] !== 'number' || !Number.isFinite(e[field]) || e[field] <= 0) {
      reds.push({ code: 'invalid-value', path: field, detail: 'a positive number' });
      continue;
    }
    if (typeof s[field] === 'number' && e[field] > s[field]) {
      reds.push({ code: 'envelope-widen', path: field, detail: `${e[field]} exceeds the bundle's signed ${field} (${s[field]}) — raising a ceiling is a re-export, never a runner flag` });
    }
  }
  return { ok: reds.length === 0, reds };
}

/**
 * Write `blessing.json`: the FIRST GREEN RUN on the importer's own machine
 * signs the bundle as trustworthy (hamr Q2), so later runs need no
 * `--approve` (hamr: "no-resign"). Overwrites any prior blessing — there is
 * only ever one, for the bundle's current `bundleHash`.
 * @param {string} dir bundle directory
 * @param {{ bundleHash: string, runid: string, outcome: string, host?: string, blessedAt?: string }} record
 * @returns {any} the blessing object written
 */
export function bless(dir, record) {
  const o = isObj(record) ? record : {};
  const blessing = {
    bundleHash: o.bundleHash,
    blessedAt: o.blessedAt ?? new Date().toISOString(),
    runid: o.runid ?? null,
    outcome: o.outcome ?? null,
    host: o.host ?? null,
  };
  writeFileSync(join(dir, 'blessing.json'), `${JSON.stringify(blessing, null, 2)}\n`);
  return blessing;
}

/**
 * Read `blessing.json` back and judge it against the bundle's CURRENT
 * manifest hash. Three outcomes, never conflated: no blessing at all
 * (`unblessed: true` — the bundle has simply never greened here, not a red);
 * a blessing whose hash no longer matches the manifest (`blessing-stale` —
 * the bundle was re-exported/edited since the run that blessed it); a match.
 * @param {{ manifest: any, blessing: any }} bundle a `readBundle` result
 * @returns {{ ok: boolean, unblessed: boolean, reds: Red[] }}
 */
export function verifyBlessing(bundle) {
  const b = isObj(bundle) ? bundle : {};
  if (!isObj(b.blessing)) return { ok: false, unblessed: true, reds: [] };
  const manifestHash = isObj(b.manifest) ? b.manifest.bundleHash : undefined;
  if (b.blessing.bundleHash !== manifestHash) {
    return { ok: false, unblessed: false, reds: [{ code: 'blessing-stale', path: 'blessing.bundleHash', detail: `blessed ${b.blessing.bundleHash ?? '<none>'} vs manifest ${manifestHash ?? '<none>'} — re-export and re-approve` }] };
  }
  return { ok: true, unblessed: false, reds: [] };
}

/**
 * F128 preflight — can this bundle's close scripts actually resolve `import
 * ... from 'bareloop'` at runtime? The bundle's own `package.json` declares
 * `bareloop` as ITS dependency (`npm install` must be run INSIDE the bundle
 * directory — validation step 2 was corrected 2026-09-06, see the dated
 * addendum in `docs/product/EXPORT-BUILD.md`); nothing installs it for the
 * bundle as a side effect of the bundle being installed as someone else's
 * dependency. Left unchecked, a missing `node_modules` crashes every close
 * stage deep inside the close-first precheck with a bare
 * `ERR_MODULE_NOT_FOUND`, which surfaces as a generic `close-red` with no
 * cure line (the live defect this fixes) — this check runs first and fails
 * fast with the exact command to run.
 *
 * Resolves the bare specifier `'bareloop'` exactly as a close script would,
 * from inside the bundle's own `close/` directory (the probe path itself
 * need not exist — `createRequire`/`resolve` only use it to anchor the
 * `node_modules` walk). Going through `require.resolve` also walks
 * `bareloop`'s own `exports` map (the package root, `"."` -> `./src/
 * index.js`), so a bare successful resolve already proves a real,
 * exports-map-shaped `bareloop` package is reachable from THIS bundle's own
 * dependency chain — not some unrelated global install. Any resolution
 * counts (a direct `node_modules/bareloop`, a symlink into it, or a parent
 * `node_modules/bareloop` up the directory chain) — it only has to resolve.
 * @param {string} bundleDir
 * @returns {{ ok: boolean, reds: Red[] }}
 */
export function checkBundleDeps(bundleDir) {
  /** @type {Red[]} */
  const reds = [];
  const probeFrom = join(bundleDir, 'close', '__bundle_deps_probe__.mjs');
  try {
    createRequire(probeFrom).resolve('bareloop');
  } catch {
    reds.push({
      code: 'bundle-deps-missing',
      path: bundleDir,
      detail: `close scripts cannot resolve their own "bareloop" dependency — run: cd ${bundleDir} && npm install`,
    });
    return { ok: false, reds };
  }
  return { ok: true, reds: [] };
}

/**
 * Append one row to `history.jsonl` — one `bareloop run` on this machine per
 * line. Same convention as `spine.js`/`ledger.js`: `appendFileSync` opens
 * with O_APPEND, so one line under PIPE_BUF is written atomically with
 * respect to other appenders; there is no read-modify-write here to race.
 * @param {string} dir bundle directory
 * @param {any} row
 */
export function appendHistory(dir, row) {
  appendFileSync(join(dir, 'history.jsonl'), `${JSON.stringify(row)}\n`);
}
