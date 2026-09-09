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
const { AnthropicProvider, OpenAIProvider, GeminiProvider } = require('bare-agent/providers');

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
 * Gemini (PRD item 31.3, hamr 2026-09-09: "anthropic, openai, gemini drop
 * ollama for now"). Two real tiers, unlike DeepSeek's single model: `flash` is
 * the cheap tier by design, so `haiku` maps to it honestly rather than
 * repeating one id.
 *
 * ADMITTED-PENDING-PROBE. The probe rule stands (PRD item 28 ruling (d),
 * 2026-09-09): no endpoint is in the menu without its own clean paid probe,
 * and `gemini-api` has ZERO runs. `anthropic-api` is the original (~167
 * archived runs) and `openai-api` was probed green through the shipped runner
 * (run mtu12vks, $1.64/$4, F157); gemini owes that fire and has not paid it.
 * `PROBE_STATUS` below is the machine-readable form of that debt — nothing in
 * here silently pretends the provider is proven.
 */
export const GEMINI_TIER_MODELS = Object.freeze({
  sonnet: 'gemini-2.5-pro',
  haiku: 'gemini-2.5-flash',
});

/**
 * Which admitted providers have paid for their own end-to-end probe, and which
 * have not. Read by the runner to print a loud marker; never read to REFUSE —
 * hamr admitted gemini to the menu, and a table that quietly withheld it would
 * be a second, invisible ruling. An unprobed provider runs, and says so.
 * @type {Readonly<Record<string, {probed: boolean, evidence: string}>>}
 */
export const PROBE_STATUS = Object.freeze({
  'anthropic-api': Object.freeze({ probed: true, evidence: 'the original surface — ~167 archived runs' }),
  'openai-api': Object.freeze({ probed: true, evidence: 'run mtu12vks, green through scripts/run-u.mjs, $1.64/$4 (F157)' }),
  'gemini-api': Object.freeze({ probed: false, evidence: 'ZERO runs — admitted to the menu, owes its own paid probe (PRD item 31.3)' }),
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
 * @property {string} endpointKey the CONSTRUCTOR OPTION NAME this provider reads its endpoint from — NOT assumed to be `baseUrl` (see below)
 * @property {(model: string|undefined) => Record<string, any>} paramsFor per-model request-key/param gating, applied on TOP of {exposeErrorBody:true, apiKey, model, <endpointKey>?}
 */

// ── WHY `endpointKey` IS A FIELD AND NOT THE LITERAL `baseUrl` ──────────────
//
// hamr's framing for this item was "api + api shape + endpoint" (PRD 31.3), and
// the endpoint half is the one that does NOT generalize. Read from bare-agent's
// own constructors, not assumed:
//
//   AnthropicProvider  `baseUrl`  (provider-anthropic.js:49)
//   OpenAIProvider     `baseUrl`  (provider-openai.js:76)
//   GeminiProvider     `baseUrl`  (provider-gemini.js:47)
//   OllamaProvider     `url`      (provider-ollama.js:32)  <- and NO apiKey at all
//
// Every one of these constructors defaults its endpoint when the option is
// absent and none of them validate unknown option names. So passing `baseUrl`
// to Ollama would not throw: it would be IGNORED, the provider would default to
// `http://localhost:11434`, and the run would quietly talk to the wrong machine.
// That is the F149 class exactly — DeepSeek silently ignoring
// `max_completion_tokens` and returning 665 tokens for a 64-token cap — where a
// silently-dropped option produces a plausible-looking run against a
// configuration nobody chose.
//
// Ollama is NOT admitted today (hamr, 2026-09-09: "drop ollama for now"), so
// this field currently reads `baseUrl` for all three entries and its value is
// never exercised against a second spelling. It is here anyway, because the
// alternative is a hardcoded `baseUrl` that is correct for exactly as long as
// the menu holds only http-shaped API providers, and the FIRST thing that
// changes when Ollama is admitted is the one line nobody would think to look at.

/** @type {Readonly<Record<string, ProviderTableEntry>>} */
const PROVIDER_TABLE = Object.freeze({
  'anthropic-api': Object.freeze({
    ctor: AnthropicProvider,
    envKey: 'ANTHROPIC_API_KEY',
    tiers: ANTHROPIC_TIER_MODELS,
    endpointKey: 'baseUrl',
    // Anthropic has only ever had one request key for the output cap
    // (`max_tokens`) — nothing to gate here, ever (unlike OpenAI-shaped
    // backends, which fork on `max_tokens` vs `max_completion_tokens`).
    paramsFor: () => ({}),
  }),
  'openai-api': Object.freeze({
    ctor: OpenAIProvider,
    envKey: 'OPENAI_API_KEY',
    tiers: OPENAI_TIER_MODELS,
    endpointKey: 'baseUrl',
    paramsFor: (model) => OPENAI_MODEL_OPTIONS[/** @type {string} */ (model)] ?? {},
  }),
  'gemini-api': Object.freeze({
    ctor: GeminiProvider,
    envKey: 'GEMINI_API_KEY',
    tiers: GEMINI_TIER_MODELS,
    endpointKey: 'baseUrl',
    // Gemini carries no `max_tokens`/`max_completion_tokens` fork of its own —
    // bare-agent's GeminiProvider maps the cap internally. Nothing to gate, and
    // an empty object is the honest statement of that, not an omission.
    paramsFor: () => ({}),
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
    // the endpoint goes in under THIS PROVIDER'S OWN OPTION NAME, never a
    // hardcoded `baseUrl` (PRD item 31.3). The spec field stays `baseUrl` for
    // everyone — one name for the person writing the job — and the translation
    // to the constructor's spelling happens here, once. A provider whose option
    // is spelled differently would otherwise IGNORE the endpoint silently and
    // run against its own default; see the note above the table.
    ...(baseUrl !== undefined ? { [entry.endpointKey]: baseUrl } : {}),
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
