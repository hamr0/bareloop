// PANEL-BUILD.md P4a — the providers the panel can use today, as ROWS (Settings ->
// Providers, and the Money tab's per-provider breakdown). One row per provider a job
// can run on now; this is NOT a new provider table: every row names an entry that
// already exists in `src/providers.js` (`PROVIDER_TABLE`), and DeepSeek is that
// table's `openai-api` shape pointed at DeepSeek's endpoint — exactly how the panel's
// Model menu (`MODEL_OPTIONS`) already spells it. Adding/removing rows and Ollama is
// P4b (its own spec): it widens `job.js PROVIDERS`, which is menu work, not page work.
//
// Also the ONE spelling of "which key variable does this provider read": the
// provider's built-in `envKey`, unless the person picked another NAME in Settings
// (config.json `providers.<row>.key`, src/config.js). Key VALUES never pass through
// here — only names.
import { resolveProvider } from './providers.js';

/** DeepSeek's OpenAI-shaped endpoint (the same string the panel's Model menu uses). */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * @typedef {object} ProviderRow
 * @property {string} id stable row id — also the key under config.json `providers`
 * @property {string} name display name
 * @property {string} provider the `src/providers.js` table entry this row runs on
 * @property {string|null} baseUrl the endpoint override this row implies (null = the vendor's own host)
 * @property {string} shape plain-words API shape
 * @property {string} shownUrl the URL the Providers table shows
 */

/** @type {readonly ProviderRow[]} */
export const PROVIDER_ROWS = Object.freeze([
  { id: 'anthropic', name: 'Anthropic', provider: 'anthropic-api', baseUrl: null, shape: 'Anthropic', shownUrl: 'https://api.anthropic.com/v1' },
  { id: 'openai', name: 'OpenAI', provider: 'openai-api', baseUrl: null, shape: 'OpenAI-compatible', shownUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Gemini', provider: 'gemini-api', baseUrl: null, shape: 'Gemini', shownUrl: 'Google\'s own host' },
  { id: 'deepseek', name: 'DeepSeek', provider: 'openai-api', baseUrl: DEEPSEEK_BASE_URL, shape: 'OpenAI-compatible', shownUrl: DEEPSEEK_BASE_URL },
].map((r) => Object.freeze(r)));

/**
 * Which row a run's `(provider, baseUrl)` belongs to. `openai-api` with no override is
 * OpenAI; with DeepSeek's host it is DeepSeek; with any OTHER override it is no row
 * (null — never silently pooled into OpenAI's figures).
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @returns {string|null} a row id, or null
 */
export function rowIdFor(provider, baseUrl) {
  if (provider === 'anthropic-api') return 'anthropic';
  if (provider === 'gemini-api') return 'gemini';
  if (provider === 'openai-api') {
    if (!baseUrl) return 'openai';
    try {
      const host = new URL(baseUrl).hostname;
      if (host === 'api.deepseek.com') return 'deepseek';
    } catch { /* an unparseable override is no known row */ }
    return null;
  }
  return null;
}

/**
 * The key variable NAME a provider row reads: the person's choice from config.json,
 * else the provider's built-in `envKey`.
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @param {Record<string, any>} config the parsed config.json
 * @returns {{ name: string, builtIn: string, chosen: boolean }}
 */
export function keyNameFor(provider, baseUrl, config) {
  const builtIn = resolveProvider(/** @type {string} */ (provider)).envKey;
  const id = rowIdFor(provider, baseUrl);
  const picked = id !== null ? config?.providers?.[id]?.key : undefined;
  return typeof picked === 'string' && picked !== '' && picked !== builtIn
    ? { name: picked, builtIn, chosen: true }
    : { name: builtIn, builtIn, chosen: false };
}

/**
 * The env a door hands to provider construction, with the person's chosen key variable
 * standing in for the provider's built-in one: `env[builtIn] = env[chosen]`. The chosen
 * variable being unset leaves the built-in name UNSET too (the person picked a variable
 * and it is empty — falling back to the built-in would silently use a key they moved
 * away from). No choice, or the built-in chosen = the env unchanged. A copy — never
 * mutates the input.
 * @param {Record<string,string|undefined>} env
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @param {Record<string, any>} config
 * @returns {Record<string,string|undefined>}
 */
export function applyConfiguredKey(env, provider, baseUrl, config) {
  if (typeof provider !== 'string') return env;
  let k;
  try { k = keyNameFor(provider, baseUrl, config); } catch { return env; } // unknown provider: resolveProvider's own named throw fires at its own door
  if (!k.chosen) return env;
  return { ...env, [k.builtIn]: env[k.name] };
}
