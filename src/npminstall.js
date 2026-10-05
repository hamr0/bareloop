// P6 item 3 (signed 2026-10-05): bareloop installs a JS repo's packages ITSELF, $0, before any token,
// for the one case whose command is exact and offline-reproducible: a committed `package-lock.json` /
// `npm-shrinkwrap.json` -> `npm ci --ignore-scripts`. It is the panel door's own step, never a verb the
// agent is granted (the tool menu is untouched): the agent never sees, asks for, or triggers it.
// Anything else (another lock file, no lock file, npm missing, a failure, a timeout) returns `ok:false`
// and the caller falls back to the install-needed wait with the real command.

import { existsSync } from 'node:fs';
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
 * Run `npm ci --ignore-scripts` in `cwd`. Async (never blocks the panel's event loop); argv array, no shell.
 * @param {string} cwd the directory holding package.json + the lock file
 * @param {{timeoutMs?: number, env?: NodeJS.ProcessEnv, run?: typeof spawnClose}} [o] `run` is the test seam
 * @returns {Promise<{ok: true}|{ok: false, reason: string}>}
 */
export async function runNpmCi(cwd, { timeoutMs = NPM_CI_TIMEOUT_MS, env = process.env, run = spawnClose } = {}) {
  const r = await run('npm', ['ci', '--ignore-scripts'], { env: npmEnv(env), cwd, timeoutMs });
  if (r.error) {
    const code = r.error.code;
    if (code === 'ETIMEDOUT') return { ok: false, reason: `timed out after ${Math.round(timeoutMs / 1000)}s` };
    if (code === 'ENOENT') return existsSync(cwd) ? { ok: false, reason: 'npm was not found' } : { ok: false, reason: 'the install folder does not exist' };
    return { ok: false, reason: redactSecrets(String(r.error.message ?? r.error)).slice(0, 200) };
  }
  if (r.status === 0) return { ok: true };
  const lines = String(r.stderr || r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const last = redactSecrets(lines[lines.length - 1] ?? '').slice(0, 200);
  return { ok: false, reason: last || (r.status === null ? `killed by ${r.signal ?? 'a signal'}` : `exit ${r.status}`) };
}
