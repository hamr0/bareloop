// PANEL-BUILD.md P4a item 1 — the keys file loader (`~/.config/bareloop/.env`).
//
// Key VALUES live only in this file (chmod 600, outside any repo) and in the shell
// environment — never in config.json, the spine, runs.jsonl, a log, or a page.
// This is the ONE reader of that file. Plain `NAME=value` lines (an optional
// `export ` prefix, `#` full-line comments, one pair of matching quotes around the
// value); no dependency.
//
// Precedence: the SHELL wins. An explicit `export FOO=…` beats the file; the file
// only fills names the shell leaves unset (or empty). The merged env is a NEW
// object — `process.env` is never mutated.
//
// Values leave this module in exactly one place: the `env` of `loadKeysEnv`, which
// goes to provider construction. Everything else it returns (`names`, `warning`) is
// value-free by construction, and a parse problem never quotes the offending line.
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * `~/.config/bareloop` (or the injected override) — same home every other
 * per-person file (runs.jsonl, config.json) lives in.
 * @param {string} [home] test seam; production never passes it
 * @returns {string}
 */
export function keysHome(home) {
  return home ?? join(homedir(), '.config', 'bareloop');
}

/**
 * @param {string} [home]
 * @returns {string} `<home>/.env`
 */
export function keysFilePath(home) {
  return join(keysHome(home), '.env');
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parse the file's text. Lines that are not `NAME=value` are skipped silently
 * (never echoed — a malformed line may hold a secret).
 * @param {string} text
 * @returns {Record<string,string>}
 */
export function parseKeysText(text) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice(7).trimStart() : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const name = body.slice(0, eq).trim();
    if (!NAME_RE.test(name)) continue;
    let value = body.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }
    out[name] = value;
  }
  return out;
}

/**
 * The NAMES in the file that carry a non-empty value, in file order — the Providers rows
 * (an empty preset line is not a row). Names only; a missing/unreadable file = none.
 * @param {string} [home]
 * @returns {string[]}
 */
export function filledKeyNames(home) {
  try {
    return Object.entries(parseKeysText(readFileSync(keysFilePath(home), 'utf8'))).filter(([, v]) => v !== '').map(([n]) => n);
  } catch { return []; }
}

/**
 * Create the keys file with the five empty preset lines when — and only when — it does not
 * exist (mode 600). An existing file is never touched.
 * @param {readonly string[]} presetNames the names to seed, in order
 * @param {string} [home]
 * @returns {boolean} true if it was created
 */
export function ensureKeysFile(presetNames, home) {
  const file = keysFilePath(home);
  if (existsSync(file)) return false;
  mkdirSync(keysHome(home), { recursive: true });
  try {
    writeFileSync(file, presetNames.map((n) => `${n}=\n`).join(''), { mode: 0o600, flag: 'wx' });
  } catch (/** @type {any} */ e) {
    if (e?.code === 'EEXIST') return false; // lost a race: the file is there, untouched
    throw e;
  }
  return true;
}

/**
 * @typedef {object} KeysLoad
 * @property {boolean} exists the file is there
 * @property {string[]} names the NAMES the file defines (sorted; never values)
 * @property {string|null} warning a plain-words warning (file readable by others, or
 *   unreadable), else null — a warning, never a refusal
 * @property {Record<string,string|undefined>} env shell env with the file filling the
 *   names the shell does not set. THE ONLY place values leave this module.
 */

/**
 * Load the keys file over an env. Missing file is fine (no names, env unchanged).
 * @param {{ env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {KeysLoad}
 */
export function loadKeysEnv(opts = {}) {
  const base = opts.env ?? process.env;
  const file = keysFilePath(opts.home);
  if (!existsSync(file)) return { exists: false, names: [], warning: null, env: { ...base } };
  /** @type {string|null} */
  let warning = null;
  try {
    const mode = statSync(file).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      warning = `${file} is readable by other users (mode ${mode.toString(8)}) — run: chmod 600 ${file}`;
    }
  } catch { /* the read below reports it */ }
  /** @type {Record<string,string>} */
  let parsed = {};
  try {
    parsed = parseKeysText(readFileSync(file, 'utf8'));
  } catch (/** @type {any} */ e) {
    return { exists: true, names: [], warning: `${file} could not be read (${e?.code ?? 'error'})`, env: { ...base } };
  }
  /** @type {Record<string,string|undefined>} */
  const env = { ...base };
  for (const [name, value] of Object.entries(parsed)) {
    if (!env[name]) env[name] = value;
  }
  return { exists: true, names: Object.keys(parsed).sort(), warning, env };
}

/**
 * The door helper the CLI and the panel call: load the file only when the caller is
 * on the REAL environment (no injected env) or names a keys home explicitly — so a
 * test that injects `env` alone never reads the real `~/.config/bareloop/.env`.
 * @param {{ env?: Record<string,string|undefined>, keysHome?: string }} deps
 * @returns {KeysLoad & { env: Record<string,string|undefined>, home: string|undefined }}
 *   `home` = the home the file was loaded from (the real `~/.config/bareloop` when none was
 *   injected) — or `undefined` when loading was skipped (injected env, no keysHome). The
 *   door passes it on so config.json (src/config.js) is read from the SAME place, and never
 *   from the real home in a test.
 */
export function keysForDoor(deps) {
  if (deps.env !== undefined && deps.keysHome === undefined) {
    return { exists: false, names: [], warning: null, env: deps.env, home: undefined };
  }
  return { ...loadKeysEnv({ env: deps.env, home: deps.keysHome }), home: keysHome(deps.keysHome) };
}
