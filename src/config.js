// PANEL-BUILD.md P4a item 2 — the ONE reader/writer of `~/.config/bareloop/config.json`.
//
// Every panel/CLI setting lives in this one file (R5): the monthly $ limit, the
// Anthropic balance note, and per-provider choices (the key NAME each provider reads).
// Key VALUES never live here — they live in the keys file (`src/keysfile.js`) and the
// shell env. The write path refuses a document that carries a secret-shaped string
// (the ONE inventory: `sweepSecretLiterals`, src/validate.js).
//
// Shape (unknown fields are kept, never dropped):
//   { "monthlyLimitUsd": <number>,          // absent = no limit, no check
//     "anthropicBalanceNote": <number>,     // a typed note; no check ever reads it
//     "providers": { "<name>": { "key": "<ENV NAME>" } } }
//
// A missing file = defaults. An UNREADABLE file is reported (`problem`), never
// papered over — the monthly check REFUSES on it rather than silently running with
// no limit. Written atomically (tmp + rename), mode 600.
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { sweepSecretLiterals } from './validate.js';

/** A plain-words config failure (bad value, secret-shaped string, unreadable file). */
export class ConfigError extends Error {}

/**
 * @param {string} [home] test seam; production never passes it
 * @returns {string} `<home>/config.json`
 */
export function configPath(home) {
  return join(home ?? join(homedir(), '.config', 'bareloop'), 'config.json');
}

/**
 * @typedef {object} ConfigRead
 * @property {Record<string, any>} config the parsed document ({} when missing/unreadable)
 * @property {boolean} exists
 * @property {string|null} problem plain words when the file is there but unreadable
 */

/**
 * @param {{ home?: string }} [opts]
 * @returns {ConfigRead}
 */
export function readConfig(opts = {}) {
  const file = configPath(opts.home);
  if (!existsSync(file)) return { config: {}, exists: false, problem: null };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (/** @type {any} */ e) {
    return { config: {}, exists: true, problem: `${file} is not readable JSON (${e?.code ?? 'parse error'}) — fix or remove it` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: {}, exists: true, problem: `${file} must hold a JSON object — fix or remove it` };
  }
  return { config: parsed, exists: true, problem: null };
}

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const PROVIDER_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Apply a patch and write. `null` deletes a field. Top-level fields shallow-merge;
 * `providers` merges per provider name, then per field. Validated before anything is
 * written; nothing is written on a refusal.
 *
 * Patch fields understood: `monthlyLimitUsd` (finite > 0), `anthropicBalanceNote`
 * (finite >= 0), `providers.<name>.key` (an env-var NAME — never a value). Any other
 * field is passed through untouched (kept), but the whole document is swept for
 * secret-shaped strings first.
 * @param {Record<string, any>} patch
 * @param {{ home?: string }} [opts]
 * @returns {Record<string, any>} the document as written
 */
export function updateConfig(patch, opts = {}) {
  const cur = readConfig(opts);
  if (cur.problem) throw new ConfigError(cur.problem);
  /** @type {Record<string, any>} */
  const next = { ...cur.config };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'providers') continue;
    if (v === null) { delete next[k]; continue; }
    if (k === 'monthlyLimitUsd' && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) {
      throw new ConfigError('monthlyLimitUsd must be a number above 0 (remove the limit to have none)');
    }
    if (k === 'anthropicBalanceNote' && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
      throw new ConfigError('anthropicBalanceNote must be a number, 0 or more');
    }
    next[k] = v;
  }
  if (patch.providers !== undefined) {
    if (patch.providers === null || typeof patch.providers !== 'object' || Array.isArray(patch.providers)) {
      throw new ConfigError('providers must be an object of provider names');
    }
    /** @type {Record<string, any>} */
    const provs = { ...(next.providers && typeof next.providers === 'object' ? next.providers : {}) };
    for (const [name, fields] of Object.entries(patch.providers)) {
      if (!PROVIDER_NAME_RE.test(name)) throw new ConfigError(`"${name}" is not a provider name`);
      if (fields === null) { delete provs[name]; continue; }
      if (typeof fields !== 'object' || Array.isArray(fields)) throw new ConfigError(`providers.${name} must be an object`);
      const merged = { ...(provs[name] && typeof provs[name] === 'object' ? provs[name] : {}) };
      for (const [fk, fv] of Object.entries(/** @type {Record<string, any>} */ (fields))) {
        if (fv === null) { delete merged[fk]; continue; }
        if (fk === 'key' && !(typeof fv === 'string' && ENV_NAME_RE.test(fv))) {
          throw new ConfigError(`providers.${name}.key must be the NAME of a key variable (like OPENAI_API_KEY), never a key value`);
        }
        merged[fk] = fv;
      }
      provs[name] = merged;
    }
    next.providers = provs;
  }
  /** @type {string[]} */
  const secretPaths = [];
  sweepSecretLiterals(next, (_code, path) => { secretPaths.push(path); });
  if (secretPaths.length) {
    throw new ConfigError(`config.json never holds a key value — a secret-shaped string at ${secretPaths.join(', ')} was refused (keys live in ~/.config/bareloop/.env)`);
  }
  const file = configPath(opts.home);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  return next;
}
