// PANEL-BUILD.md P4b — the Providers rows, driven by the keys file. NOTHING here is a
// hardcoded provider list: one row exists per key in `~/.config/bareloop/.env` that has a
// value; each row's Name / API shape / Base URL come from config.json `keys.<ENV NAME>`
// (src/config.js), else the per-name defaults below. This is NOT a new provider table:
// a row's API shape names an entry that already exists in `src/providers.js`
// (`PROVIDER_TABLE`), and a row's Base URL is that provider's `baseUrl` option.
//
// This module is also THE one owner of "model -> key + shape + URL": Chat's Model menu,
// the author doors and the run doors all resolve through `findRow` / `keyNameFor` /
// `applyConfiguredKey` / `modelChoiceFor` below — no second lookup exists. Key VALUES
// never pass through here — only names.
import { resolveProvider } from './providers.js';
import { readConfig } from './config.js';
import { filledKeyNames } from './keysfile.js';

/** DeepSeek's OpenAI-shaped endpoint (the same string the panel's Model menu used). */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * The API shapes the dropdown offers. `id` is the `src/providers.js` table name;
 * `defaultUrl` is the host a blank Base URL means ('' = the vendor's own, unshown).
 * @type {readonly {id: string, label: string, defaultUrl: string}[]}
 */
export const SHAPES = Object.freeze([
  Object.freeze({ id: 'anthropic-api', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' }),
  Object.freeze({ id: 'openai-api', label: 'OpenAI-compatible', defaultUrl: 'https://api.openai.com/v1' }),
  Object.freeze({ id: 'gemini-api', label: 'Gemini', defaultUrl: '' }),
]);

/** The five empty lines a fresh keys file is created with, in this order. */
export const PRESET_KEY_NAMES = Object.freeze(['ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'LOCAL_API_KEY']);

/** A local server's default endpoint: Ollama's OpenAI-compatible host (LM Studio / llama.cpp: change the URL). */
export const LOCAL_BASE_URL = 'http://127.0.0.1:11434/v1';

/**
 * A key line whose value is the word `null` is SET and means "no real key": the row exists and
 * the provider is handed this harmless stand-in (local servers ignore auth). It is not a
 * secret and is never shown or logged as a key.
 */
export const NO_KEY_PLACEHOLDER = 'no-key-needed';

/**
 * The key value to hand a provider: the `null` marker becomes the placeholder, anything else
 * passes through unchanged.
 * @template {string|undefined} T
 * @param {T} raw
 * @returns {T|string}
 */
export function usableKey(raw) {
  return raw === 'null' ? NO_KEY_PLACEHOLDER : raw;
}

/**
 * What a key with no saved entry shows. Any name not listed is OpenAI-compatible with a
 * blank URL and a blank Name.
 * @param {string} envName
 * @returns {{ name: string, shape: string, baseUrl: string }}
 */
export function defaultsFor(envName) {
  switch (envName) {
    case 'ANTHROPIC_API_KEY': return { name: 'claude-sonnet-5', shape: 'anthropic-api', baseUrl: '' };
    case 'DEEPSEEK_API_KEY': return { name: 'deepseek-flash', shape: 'openai-api', baseUrl: DEEPSEEK_BASE_URL };
    case 'GEMINI_API_KEY': return { name: '', shape: 'gemini-api', baseUrl: '' };
    case 'LOCAL_API_KEY': return { name: '', shape: 'openai-api', baseUrl: LOCAL_BASE_URL };
    default: return { name: '', shape: 'openai-api', baseUrl: '' };
  }
}

/**
 * @typedef {object} KeyRow
 * @property {string} envName the key variable NAME (read-only label; never a value)
 * @property {string} name the model id Chat uses ('' = not offered in Chat)
 * @property {string} provider the `src/providers.js` table entry (the API shape's id)
 * @property {string} baseUrl the saved Base URL ('' = the shape's default host)
 */

/**
 * The rows: one per name in `filled`, saved entry over defaults.
 * @param {{ filled: readonly string[], config: Record<string, any> }} src
 * @returns {KeyRow[]}
 */
export function keyRows({ filled, config }) {
  const saved = config?.keys && typeof config.keys === 'object' && !Array.isArray(config.keys) ? config.keys : {};
  return filled.map((envName) => {
    const d = defaultsFor(envName);
    const s = saved[envName] && typeof saved[envName] === 'object' ? saved[envName] : {};
    return {
      envName,
      name: typeof s.name === 'string' ? s.name : d.name,
      provider: SHAPES.some((x) => x.id === s.shape) ? s.shape : d.shape,
      baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : d.baseUrl,
    };
  });
}

/**
 * The rows for a keys home. `undefined` home (a door that skipped the keys file) = no
 * rows, so nothing resolves through the file and the provider's built-in variable stands.
 * @param {string|undefined} home
 * @returns {KeyRow[]}
 */
export function rowsForHome(home) {
  if (home === undefined) return [];
  return keyRows({ filled: filledKeyNames(home), config: readConfig({ home }).config });
}

/**
 * @param {string} provider
 * @returns {string} the shape's default host ('' = the vendor's own)
 */
export function defaultUrlOf(provider) {
  return SHAPES.find((s) => s.id === provider)?.defaultUrl ?? '';
}

/**
 * An endpoint in comparable form: blank = the shape's default host; scheme + host lower-cased,
 * trailing slashes dropped.
 * @param {string} provider
 * @param {string|null|undefined} baseUrl
 * @returns {string}
 */
export function endpointOf(provider, baseUrl) {
  const raw = (typeof baseUrl === 'string' && baseUrl.trim() !== '' ? baseUrl : defaultUrlOf(provider)).trim();
  if (raw === '') return '';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch { return raw.replace(/\/+$/, ''); }
}

/**
 * The URL a row talks to, for display ('' = the vendor's own host, which has no URL to show).
 * @param {KeyRow} row
 * @returns {string}
 */
export function shownUrl(row) {
  return row.baseUrl.trim() !== '' ? row.baseUrl : defaultUrlOf(row.provider);
}

/**
 * Which row a `(provider, baseUrl[, model])` identity belongs to: the rows on that shape and
 * endpoint; when several share it, the one whose Name is the model, else the first.
 * @param {readonly KeyRow[]} rows
 * @param {{ provider?: string|null, baseUrl?: string|null, model?: string|null }} id
 * @returns {KeyRow|null}
 */
export function findRow(rows, { provider, baseUrl, model }) {
  if (typeof provider !== 'string') return null;
  const want = endpointOf(provider, baseUrl);
  const same = rows.filter((r) => r.provider === provider && endpointOf(r.provider, r.baseUrl) === want);
  if (same.length === 0) return null;
  return (model ? same.find((r) => r.name === model) : undefined) ?? same[0];
}

/**
 * What Chat's Model menu offers and how a pick resolves: the row whose Name is the model
 * (a blank Name is never offered). `baseUrl` is absent when blank, exactly as a spec omits it.
 * @param {readonly KeyRow[]} rows
 * @param {string} model
 * @returns {{ provider: string, baseUrl?: string, envName: string, name: string }|null}
 */
export function modelChoiceFor(rows, model) {
  const r = model === '' ? undefined : rows.find((x) => x.name === model);
  if (!r) return null;
  return { provider: r.provider, ...(r.baseUrl.trim() !== '' ? { baseUrl: r.baseUrl.trim() } : {}), envName: r.envName, name: r.name };
}

/**
 * The models Chat offers, in keys-file order.
 * @param {readonly KeyRow[]} rows
 * @returns {{ id: string, envName: string, shape: string }[]}
 */
export function chatModels(rows) {
  return rows.filter((r) => r.name !== '').map((r) => ({
    id: r.name, envName: r.envName, shape: SHAPES.find((s) => s.id === r.provider)?.label ?? r.provider,
  }));
}

/**
 * The key variable NAME a job on `(provider, baseUrl[, model])` reads: the matching row's
 * variable, else the provider's built-in one (byte-identical to before for anything no row
 * claims).
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @param {readonly KeyRow[]} rows
 * @param {string|null|undefined} [model]
 * @returns {{ name: string, builtIn: string, chosen: boolean }}
 */
export function keyNameFor(provider, baseUrl, rows, model) {
  const builtIn = resolveProvider(/** @type {string} */ (provider)).envKey;
  const row = findRow(rows, { provider, baseUrl, model });
  return row && row.envName !== builtIn
    ? { name: row.envName, builtIn, chosen: true }
    : { name: builtIn, builtIn, chosen: false };
}

/**
 * The env a door hands to provider construction, with the matching row's key variable
 * standing in for the provider's built-in one: `env[builtIn] = env[row.envName]` (the `null`
 * no-key marker becomes {@link NO_KEY_PLACEHOLDER}). A copy — never mutates the input.
 * No matching row and no marker = the env unchanged.
 * @param {Record<string,string|undefined>} env
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @param {readonly KeyRow[]} rows
 * @param {string|null|undefined} [model]
 * @returns {Record<string,string|undefined>}
 */
export function applyConfiguredKey(env, provider, baseUrl, rows, model) {
  if (typeof provider !== 'string') return env;
  let k;
  try { k = keyNameFor(provider, baseUrl, rows, model); } catch { return env; } // unknown provider: resolveProvider's own named throw fires at its own door
  const value = env[k.name];
  if (!k.chosen && value !== 'null') return env;
  return { ...env, [k.builtIn]: usableKey(value) };
}
