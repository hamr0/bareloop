// P6 item 3 (signed 2026-10-05): bareloop installs a JS repo's packages ITSELF, $0, before any token,
// for the one case whose command is exact and offline-reproducible: a committed `package-lock.json` /
// `npm-shrinkwrap.json` -> `npm ci --ignore-scripts`. It is the panel door's own step, never a verb the
// agent is granted (the tool menu is untouched): the agent never sees, asks for, or triggers it.
// Anything else (another lock file, no lock file, npm missing, a failure, a timeout) returns `ok:false`
// and the caller falls back to the install-needed wait with the real command. After the install it runs
// `npm rebuild <the native packages>` (same env, same deadline) so native packages are built despite `--ignore-scripts`;
// only packages with a `binding.gyp` / `"gypfile": true` are named, so the repo's own and pure-JS packages' install scripts never run.
// Named limit: a native package's own install script still runs (that is how it builds).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnClose, CLOSE_ENV_DENY } from './ralph.js';
import { redactSecrets } from './validate.js';

/** Wall-clock cap for one `npm ci`: 10 minutes. A cold install of a large repo is minutes, never an hour;
 * past this the person is better served by the printed command in their own terminal. Operator-set. */
export const NPM_CI_TIMEOUT_MS = 600_000;

/** the lock files whose gap command is `npm ci` (the rule table in src/source.js, LOCKFILE_COMMANDS) */
export const NPM_CI_LOCKS = Object.freeze(['package-lock.json', 'npm-shrinkwrap.json']);

/**
 * The env npm sees: the panel's own env minus every credential `CLOSE_ENV_DENY` names (never re-spelled).
 * `npm ci` needs no provider key; a private registry token (NPM_TOKEN) is stripped too, so such a repo
 * simply falls back to the person's own install.
 * @param {NodeJS.ProcessEnv} base
 * @returns {NodeJS.ProcessEnv}
 */
export function npmEnv(base) {
  const env = { ...base };
  delete env.NODE_TEST_CONTEXT;
  for (const name of Object.keys(env)) {
    if (CLOSE_ENV_DENY.names.includes(name)
      || CLOSE_ENV_DENY.prefixes.some((p) => name.startsWith(p))
      || CLOSE_ENV_DENY.shape.test(name)) delete env[name];
  }
  return env;
}

/**
 * The ONE owner of "which installed packages need a native build": every package under `<cwd>/node_modules` (scoped and nested ones too)
 * that has a `binding.gyp` file or `"gypfile": true` in its package.json. Names, sorted, no repeats; none = [].
 * @param {string} cwd @returns {string[]}
 */
export function nativePackagesOf(cwd) {
  /** @type {Set<string>} */ const names = new Set();
  /** @param {string} nm a node_modules folder */
  const walk = (nm) => {
    let entries;
    try { entries = readdirSync(nm, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const dir = join(nm, e.name);
      if (e.name.startsWith('@')) { walk(dir); continue; }
      let pkg = null;
      try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { /* no readable package.json: not a package */ }
      if (pkg !== null && typeof pkg === 'object' && (existsSync(join(dir, 'binding.gyp')) || pkg.gypfile === true) && typeof pkg.name === 'string') names.add(pkg.name);
      walk(join(dir, 'node_modules'));
    }
  };
  walk(join(cwd, 'node_modules'));
  return [...names].sort();
}

/**
 * Run `npm ci --ignore-scripts` in `cwd`, then `npm rebuild <native packages>` in the same tree (no native package = no rebuild). Async (never blocks the panel's
 * event loop); argv array, no shell. `--ignore-scripts` leaves native packages (better-sqlite3 ...) unbuilt, and a
 * repo's own tests then fail on "Could not locate the bindings file" - failures no worker can fix. So the build step
 * runs here, with the SAME stripped env and the same deadline; a failed or timed-out rebuild is `ok:false` (the
 * caller's manual install ask), never a silent continue. This is the ONE install function every door calls.
 * @param {string} cwd the directory holding package.json + the lock file
 * @param {{timeoutMs?: number, env?: NodeJS.ProcessEnv, run?: typeof spawnClose}} [o] `run` is the test seam
 * @returns {Promise<{ok: true}|{ok: false, reason: string}>}
 */
export async function runNpmCi(cwd, { timeoutMs = NPM_CI_TIMEOUT_MS, env = process.env, run = spawnClose } = {}) {
  const stripped = npmEnv(env);
  const ci = await runStep(run, ['ci', '--ignore-scripts'], cwd, stripped, timeoutMs, '');
  if (!ci.ok) return ci;
  const native = nativePackagesOf(cwd);
  if (native.length === 0) return ci;
  return runStep(run, ['rebuild', ...native], cwd, stripped, timeoutMs, 'the build step (npm rebuild) of the packages ');
}

/**
 * One npm call mapped to plain words. `what` prefixes the failure ('' for the install itself).
 * @param {typeof spawnClose} run @param {string[]} args @param {string} cwd @param {NodeJS.ProcessEnv} env
 * @param {number} timeoutMs @param {string} what
 * @returns {Promise<{ok: true}|{ok: false, reason: string}>}
 */
async function runStep(run, args, cwd, env, timeoutMs, what) {
  const r = await run('npm', args, { env, cwd, timeoutMs });
  if (r.error) {
    const code = r.error.code;
    if (code === 'ETIMEDOUT') return { ok: false, reason: `${what}timed out after ${Math.round(timeoutMs / 1000)}s` };
    if (code === 'ENOENT') return existsSync(cwd) ? { ok: false, reason: 'npm was not found' } : { ok: false, reason: 'the install folder does not exist' };
    return { ok: false, reason: `${what}${redactSecrets(String(r.error.message ?? r.error))}`.slice(0, 200) };
  }
  if (r.status === 0) return { ok: true };
  const lines = String(r.stderr || r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const last = redactSecrets(lines[lines.length - 1] ?? '').slice(0, 200);
  const tail = last || (r.status === null ? `killed by ${r.signal ?? 'a signal'}` : `exit ${r.status}`);
  return { ok: false, reason: what ? `${what}failed: ${tail}` : tail };
}
