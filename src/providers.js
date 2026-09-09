// Provider factory (PRD item 28, shape (1)): ONE seam mapping a job spec's
// `provider` name to the bare-agent constructor it drives, the env var
// carrying its key, and the per-tier model table — including any
// provider-specific request-key gating. Before this module existed, both
// runners constructed `AnthropicProvider` BY NAME (`src/cli.js`'s
// `buildProviders`, `scripts/run-u.mjs`'s top-level wiring) and any second
// provider would have meant scattering `if (provider === …)` across both.
//
// hamr's ruling (PRD 30.7, 2026-09-09): `deepseek-chat` is THE secondary
// provider — "settle on one secondary/replacement for claude … don't
// pickpocket random models". This table is not a menu of half-tested
// models; it is exactly the two provider identities the PROVIDERS menu
// (`src/job.js`) admits.
//
// What this module is NOT: it never picks a judge (the judge stays pinned
// to `anthropic-api`/`JUDGE_MODEL` regardless of the job's worker provider —
// arbiter territory, PRD item 28), never prices a round (F113: rates
// passthrough is dead), and never decides a budget. It only constructs the
// provider objects `bare-agent`'s `Loop` calls.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AnthropicProvider, OpenAIProvider } = require('bare-agent/providers');

/**
 * Today's anthropic-api tier table — EXACTLY the `DEFAULT_TIER_MODELS` both
 * runners hardcoded before this factory existed. Any change to these two
 * values is a change to shipped anthropic-api behaviour, not a refactor.
 */
export const ANTHROPIC_TIER_MODELS = Object.freeze({
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5-20251001',
});

/**
 * DeepSeek (F149/F150) is a SINGLE model, not a tiered family — hamr's
 * ruling above: one secondary provider, not a menu. Both tiers map to the
 * same model id ON PURPOSE: `resolveWorkerModel`/a runner's `providerFor
 * (tier)` only ever LOOK UP a tier's model id (src/job.js:818-827,
 * scripts/run-u.mjs's `providerFor`) — neither assumes the tiers name
 * different models — so repeating the one id is the honest representation
 * of a single-model provider, not a second model masquerading as `haiku`.
 * If DeepSeek (or a future openai-api entrant) ever ships a genuinely
 * cheaper tier model, this is where it would earn its own `haiku` id.
 */
export const OPENAI_TIER_MODELS = Object.freeze({
  sonnet: 'deepseek-chat',
  haiku: 'deepseek-chat',
});

/**
 * Per-MODEL request-key gating (F149, live-measured 2026-09-09): DeepSeek
 * silently IGNORES the modern `max_completion_tokens` key — asked for 64
 * output tokens, it returned 665/608 — and only honours the legacy
 * `max_tokens` key. `bare-agent`'s `OpenAIProvider` already exposes the
 * switch (`legacyMaxTokens`, BA-24; no model-name sniffing inside
 * bare-agent itself — "the caller declares the dialect"), so THIS table is
 * bareloop's routing of it, keyed per model, never a global default. An
 * output cap that does not bind is a money hazard: a reasoning model can
 * run to its own ceiling on every round, silently, so getting this wrong
 * for even one model defeats every budget that model's tier sets.
 *
 * A model with no entry here gets `{}` — bare-agent's own default
 * (`max_completion_tokens`, GPT-5-safe) applies, unmodified.
 */
const OPENAI_MODEL_OPTIONS = Object.freeze({
  'deepseek-chat': Object.freeze({ legacyMaxTokens: true }),
});

/**
 * @typedef {object} ProviderTableEntry
 * @property {new (options: any) => any} ctor the bare-agent provider class
 * @property {string} envKey the environment variable this provider reads its key from
 * @property {Readonly<Record<string, string>>} tiers tier name -> model id
 * @property {(model: string|undefined) => Record<string, any>} paramsFor per-model request-key/param gating, applied on TOP of {exposeErrorBody:true, apiKey, model, baseUrl?}
 */

/** @type {Readonly<Record<string, ProviderTableEntry>>} */
const PROVIDER_TABLE = Object.freeze({
  'anthropic-api': Object.freeze({
    ctor: AnthropicProvider,
    envKey: 'ANTHROPIC_API_KEY',
    tiers: ANTHROPIC_TIER_MODELS,
    // Anthropic has only ever had one request key for the output cap
    // (`max_tokens`) — nothing to gate here, ever (unlike OpenAI-shaped
    // backends, which fork on `max_tokens` vs `max_completion_tokens`).
    paramsFor: () => ({}),
  }),
  'openai-api': Object.freeze({
    ctor: OpenAIProvider,
    envKey: 'OPENAI_API_KEY',
    tiers: OPENAI_TIER_MODELS,
    paramsFor: (model) => OPENAI_MODEL_OPTIONS[/** @type {string} */ (model)] ?? {},
  }),
});

/**
 * Look up a provider's table entry. Throws a NAMED error on an unrecognized
 * provider — never a silent default (the `resolveRates`-style-substring-
 * match lesson: a forward hazard even at zero observed rounds, MEMORY.md).
 * `src/job.js`'s `PROVIDERS` menu is the one place a spec's `provider`
 * field is validated; this is the runtime construction seam it feeds.
 * @param {string} providerName
 * @returns {ProviderTableEntry}
 */
export function resolveProvider(providerName) {
  const entry = PROVIDER_TABLE[/** @type {keyof typeof PROVIDER_TABLE} */ (providerName)];
  if (!entry) {
    throw new Error(
      `src/providers.js: unknown provider "${providerName}" — no silent default. `
      + `Known providers: ${Object.keys(PROVIDER_TABLE).join(', ')}`,
    );
  }
  return entry;
}

/**
 * Construct ONE provider instance for `providerName`/`model`, applying
 * `exposeErrorBody: true` (F153 — every constructed provider, unconditionally)
 * and the model's own request-key gating (`paramsFor`). `baseUrl` (PRD item
 * 28, ruling (d), 2026-09-09: admitted in v1) is forwarded only when given —
 * every provider constructor here defaults it on its own when absent.
 * @param {string} providerName
 * @param {{apiKey?: string, model?: string, baseUrl?: string}} [options]
 */
export function makeProvider(providerName, { apiKey, model, baseUrl } = {}) {
  const entry = resolveProvider(providerName);
  return new entry.ctor({
    exposeErrorBody: true,
    apiKey,
    model,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...entry.paramsFor(model),
  });
}

/**
 * Build the `{provider, providerFor, judgeProvider}` triple both runners
 * need (`src/cli.js`'s `buildProviders`, `scripts/run-u.mjs`'s top-level
 * wiring) — ONE seam instead of two copies of the same construction and
 * tier-memoization logic. `model`/`tierModels` are already-RESOLVED inputs
 * (the caller runs `resolveWorkerModel` itself, exactly as both runners did
 * before this factory existed — that decision stays where each runner's own
 * `--model` flag/spec precedence lives, not duplicated in here).
 *
 * The JUDGE stays pinned to `anthropic-api`/`judgeModel` regardless of
 * `providerName` — arbiter territory (PRD item 28: "the judge stays PINNED
 * … regardless of the job's worker provider"). A signed `judge:{provider,
 * model}` field with its own calibration record is PRD item 28 part (2),
 * NOT built here; until it lands, the judge always needs its own
 * `judgeApiKey` (today, always `ANTHROPIC_API_KEY`), independent of which
 * key the worker used.
 * @param {object} args
 * @param {string} args.providerName spec.provider (or the anthropic-api default)
 * @param {string|undefined} args.apiKey the WORKER's key, read from the provider's own `envKey`
 * @param {string} args.model the already-resolved worker model id
 * @param {Readonly<Record<string, string>>} args.tierModels the already-resolved tier -> model map (spec override folded in by the caller)
 * @param {string|undefined} [args.baseUrl] spec.baseUrl, if any
 * @param {string|undefined} args.judgeApiKey the judge's own key (today: `ANTHROPIC_API_KEY`)
 * @param {string} args.judgeModel `JUDGE_MODEL`
 */
export function buildRunnerProviders({
  providerName, apiKey, model, tierModels, baseUrl, judgeApiKey, judgeModel,
}) {
  const provider = makeProvider(providerName, { apiKey, model, baseUrl });
  /** @type {Record<string, any>} */
  const tierCache = {};
  const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= (
    tierModels[tier] === model
      ? provider
      : makeProvider(providerName, { apiKey, model: tierModels[tier], baseUrl })
  ));
  const judgeProvider = makeProvider('anthropic-api', { apiKey: judgeApiKey, model: judgeModel });
  return { provider, providerFor, judgeProvider };
}
