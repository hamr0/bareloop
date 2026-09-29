// PANEL-BUILD.md P4a item 2 — the ONE reader/writer of `~/.config/bareloop/config.json`.
//
// Every panel/CLI setting lives in this one file (R5): the monthly $ limit, the
// Anthropic balance note, and the Providers rows' Name / API shape / Base URL, per key variable.
// Key VALUES never live here — they live in the keys file (`src/keysfile.js`) and the
// shell env. The write path refuses a document that carries a secret-shaped string
// (the ONE inventory: `sweepSecretLiterals`, src/validate.js).
//
// Shape (unknown fields are kept, never dropped):
//   { "monthlyLimitUsd": <number>,          // absent = no limit, no check
//     "anthropicBalanceNote": <number>,     // a typed note; no check ever reads it
//     "keys": { "<ENV NAME>": { "name": "<model id>", "shape": "<api shape>", "baseUrl": "<url or blank>" } } }
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
/** the API shapes a keys row may name (the `src/providers.js` table names) */
const SHAPE_IDS = ['anthropic-api', 'openai-api', 'gemini-api'];

/**
 * Apply a patch and write. `null` deletes a field. Top-level fields shallow-merge;
 * `keys` merges per key variable name, then per field. Validated before anything is
 * written; nothing is written on a refusal.
 *
 * Patch fields understood: `monthlyLimitUsd` (finite > 0), `anthropicBalanceNote`
 * (finite >= 0), `keys.<ENV NAME>.{name,shape,baseUrl}` (Name = a model id, shape = a provider table name, baseUrl = blank or http(s)). Any other
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
    if (k === 'keys') continue;
    if (v === null) { delete next[k]; continue; }
    if (k === 'monthlyLimitUsd' && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) {
      throw new ConfigError('monthlyLimitUsd must be a number above 0 (remove the limit to have none)');
    }
    if (k === 'anthropicBalanceNote' && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
      throw new ConfigError('anthropicBalanceNote must be a number, 0 or more');
    }
    next[k] = v;
  }
  if (patch.keys !== undefined) {
    if (patch.keys === null || typeof patch.keys !== 'object' || Array.isArray(patch.keys)) {
      throw new ConfigError('keys must be an object of key variable names');
    }
    /** @type {Record<string, any>} */
    const keys = { ...(next.keys && typeof next.keys === 'object' ? next.keys : {}) };
    for (const [envName, fields] of Object.entries(patch.keys)) {
      if (!ENV_NAME_RE.test(envName)) throw new ConfigError(`"${envName}" is not a key variable name`);
      if (fields === null) { delete keys[envName]; continue; }
      if (typeof fields !== 'object' || Array.isArray(fields)) throw new ConfigError(`keys.${envName} must be an object`);
      const merged = { ...(keys[envName] && typeof keys[envName] === 'object' ? keys[envName] : {}) };
      for (const [fk, fv] of Object.entries(/** @type {Record<string, any>} */ (fields))) {
        if (fv === null) { delete merged[fk]; continue; }
        if (fk === 'name' && !(typeof fv === 'string' && fv.length <= 100 && !/\s/.test(fv))) {
          throw new ConfigError(`keys.${envName}.name must be a model id (no spaces, up to 100 characters)`);
        }
        if (fk === 'shape' && !SHAPE_IDS.includes(fv)) {
          throw new ConfigError(`keys.${envName}.shape must be one of ${SHAPE_IDS.join(', ')}`);
        }
        if (fk === 'baseUrl' && !(typeof fv === 'string' && (fv === '' || /^https?:\/\/\S+$/.test(fv)))) {
          throw new ConfigError(`keys.${envName}.baseUrl must be blank or an http(s) URL`);
        }
        merged[fk] = fv;
      }
      keys[envName] = merged;
    }
    next.keys = keys;
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
