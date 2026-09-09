// PRD item 28, shape (1): the provider factory (src/providers.js). Tests
// the seam itself — provider name -> ctor/envKey/tier table/param gating —
// plus the job-spec-level admission of `openai-api`/`baseUrl` (src/job.js)
// and the `stopReason` forwarding on a real-Loop `worker-round` (src/
// planrun.js, driven through the existing scripted-provider harness).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveProvider, makeProvider, buildRunnerProviders, ANTHROPIC_TIER_MODELS, OPENAI_TIER_MODELS,
} from '../src/providers.js';
import { validateJob, PROVIDERS } from '../src/job.js';

// The `stopReason`-on-`worker-round` tests live in tests/planrun.test.js
// instead of here: `makePatient`/`go`/`PLAN`/`tcall`/`JOB` are that file's
// own LOCAL helpers (not exported from tests/helpers.js), and driving a
// real Loop through a scripted provider is exactly "the existing planrun
// test harness" the build asked for — duplicating that harness here would
// be a second copy of the same scaffold, not a new instrument.

// ── the menu itself ─────────────────────────────────────────────────────

test('the PROVIDERS menu admits openai-api alongside anthropic-api and clipipe-subscription', () => {
  assert.deepEqual([...PROVIDERS], ['anthropic-api', 'openai-api', 'clipipe-subscription']);
});

// ── resolveProvider: name -> {ctor, envKey, tiers, paramsFor} ──────────

test('resolveProvider("anthropic-api") yields the AnthropicProvider ctor, its own env key, and today\'s exact tier ids', async () => {
  const { AnthropicProvider } = await import('bare-agent/providers');
  const entry = resolveProvider('anthropic-api');
  assert.equal(entry.ctor, AnthropicProvider);
  assert.equal(entry.envKey, 'ANTHROPIC_API_KEY');
  assert.deepEqual({ ...entry.tiers }, { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' });
  assert.deepEqual({ ...ANTHROPIC_TIER_MODELS }, { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' });
});

test('resolveProvider("openai-api") yields the OpenAIProvider ctor, OPENAI_API_KEY, and deepseek-chat on both tiers (hamr\'s ruling: one secondary provider, not a menu)', async () => {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const entry = resolveProvider('openai-api');
  assert.equal(entry.ctor, OpenAIProvider);
  assert.equal(entry.envKey, 'OPENAI_API_KEY');
  assert.deepEqual({ ...entry.tiers }, { sonnet: 'deepseek-chat', haiku: 'deepseek-chat' });
  assert.deepEqual({ ...OPENAI_TIER_MODELS }, { sonnet: 'deepseek-chat', haiku: 'deepseek-chat' });
});

test('resolveProvider on an unknown name throws a NAMED error — no silent default (the resolveRates lesson)', () => {
  assert.throws(() => resolveProvider('grok-api'), /unknown provider "grok-api"/);
  assert.throws(() => resolveProvider(undefined), /unknown provider/);
  assert.throws(() => resolveProvider(''), /unknown provider/);
});

// ── makeProvider: construction + per-model param gating ────────────────

test('makeProvider constructs with exposeErrorBody:true unconditionally (F153)', () => {
  const p = makeProvider('anthropic-api', { apiKey: 'k', model: 'claude-sonnet-5' });
  assert.equal(p.exposeErrorBody, true);
  assert.equal(p.model, 'claude-sonnet-5');
});

test('the deepseek-chat entry carries the legacy-max-tokens flag (F149: DeepSeek silently ignores max_completion_tokens, asked 64 got 665/608) — the anthropic entry does not', () => {
  const deepseek = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-chat' });
  assert.equal(deepseek.legacyMaxTokens, true, 'an output cap that does not bind is a money hazard — this MUST bind');
  const anthropic = makeProvider('anthropic-api', { apiKey: 'k', model: 'claude-sonnet-5' });
  assert.notEqual(anthropic.legacyMaxTokens, true, 'Anthropic has only ever had one request key — nothing to gate, ever');
});

test('an openai-api model with no table entry gets no legacy-key override — bare-agent\'s own default (max_completion_tokens, GPT-5-safe) applies untouched', () => {
  const gpt = makeProvider('openai-api', { apiKey: 'k', model: 'gpt-4.1' });
  assert.notEqual(gpt.legacyMaxTokens, true);
});

test('makeProvider forwards baseUrl only when given', () => {
  const withUrl = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-chat', baseUrl: 'https://gateway.example/v1' });
  assert.equal(withUrl.baseUrl, 'https://gateway.example/v1');
  const withoutUrl = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-chat' });
  assert.equal(withoutUrl.baseUrl, 'https://api.openai.com/v1', 'bare-agent\'s own OpenAIProvider default, untouched');
});

// ── buildRunnerProviders: the shared provider/providerFor/judgeProvider triple ──

test('buildRunnerProviders: providerFor(tier) reuses the top-level provider when the tier resolves to the same model, and the judge is ALWAYS anthropic-api/judgeModel regardless of providerName', async () => {
  const { AnthropicProvider } = await import('bare-agent/providers');
  const { provider, providerFor, judgeProvider } = buildRunnerProviders({
    providerName: 'openai-api',
    apiKey: 'worker-key',
    model: 'deepseek-chat',
    tierModels: { sonnet: 'deepseek-chat', haiku: 'deepseek-chat' },
    judgeApiKey: 'judge-key',
    judgeModel: 'claude-haiku-4-5',
  });
  assert.equal(providerFor('sonnet'), provider, 'same model id -> the SAME instance, not a rebuild');
  assert.equal(providerFor('haiku'), provider, 'deepseek-chat on both tiers -> the same instance too');
  assert.ok(judgeProvider instanceof AnthropicProvider, 'the judge is pinned to anthropic-api no matter the worker provider');
  assert.equal(judgeProvider.model, 'claude-haiku-4-5');
  assert.equal(judgeProvider.apiKey, 'judge-key', 'the judge uses ITS OWN key, never the worker\'s');
});

test('buildRunnerProviders: a spec-named model on one tier builds a SECOND provider instance for a differing tier', () => {
  const { provider, providerFor } = buildRunnerProviders({
    providerName: 'anthropic-api',
    apiKey: 'k',
    model: 'claude-opus-4',
    tierModels: { sonnet: 'claude-opus-4', haiku: 'claude-haiku-4-5-20251001' },
    judgeApiKey: 'k',
    judgeModel: 'claude-haiku-4-5',
  });
  assert.equal(providerFor('sonnet'), provider);
  const haikuProvider = providerFor('haiku');
  assert.notEqual(haikuProvider, provider);
  assert.equal(haikuProvider.model, 'claude-haiku-4-5-20251001');
});

// ── job-spec-level admission: provider + baseUrl ────────────────────────

// Mirrors tests/job.test.js's own JOB1 fixture shape (the one job spec that
// fixture proves validates green) — swapped onto the secondary provider,
// PRD 30.7/F150.
const BASE_SPEC = {
  schema: 'job-v1',
  job: 'openai-probe',
  description: 'a job on the secondary provider',
  provider: 'openai-api',
  model: 'deepseek-chat',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**', 'test/**'],
  goal: 'Fix any failure in src/ so the suite passes.',
  verdictType: 'green',
  close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }],
  tools: ['read', 'grep', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
};

test('a job spec naming provider:"openai-api" (+ a well-formed baseUrl) validates clean', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC, baseUrl: 'https://api.deepseek.com/v1' }, { shellCapUsd: 100 });
  assert.equal(ok, true, JSON.stringify(reds));
});

test('a job spec with no baseUrl at all still validates clean — the field is optional', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC }, { shellCapUsd: 100 });
  assert.equal(ok, true, JSON.stringify(reds));
});

test('baseUrl reds: non-string', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC, baseUrl: 12345 }, { shellCapUsd: 100 });
  assert.equal(ok, false);
  assert.ok(reds.some((r) => r.path === 'baseUrl'), JSON.stringify(reds));
});

test('baseUrl reds: bad scheme (plain http to a real host, not loopback)', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC, baseUrl: 'http://gateway.example.com/v1' }, { shellCapUsd: 100 });
  assert.equal(ok, false);
  assert.ok(reds.some((r) => r.path === 'baseUrl' && /https:\/\//.test(r.detail ?? '')), JSON.stringify(reds));
});

test('baseUrl admits http:// to a loopback host (a local OpenAI-compatible server)', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC, baseUrl: 'http://127.0.0.1:8080/v1' }, { shellCapUsd: 100 });
  assert.equal(ok, true, JSON.stringify(reds));
});

test('baseUrl reds: embedded credentials', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC, baseUrl: 'https://user:secret@gateway.example/v1' }, { shellCapUsd: 100 });
  assert.equal(ok, false);
  assert.ok(reds.some((r) => r.path === 'baseUrl' && /credential/.test(r.detail ?? '')), JSON.stringify(reds));
});

test('baseUrl reds: unparseable string', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC, baseUrl: 'not a url at all' }, { shellCapUsd: 100 });
  assert.equal(ok, false);
  assert.ok(reds.some((r) => r.path === 'baseUrl'), JSON.stringify(reds));
});

test('provider reds an unrecognized value, unchanged behaviour from before this build', () => {
  const { ok, reds } = validateJob({ ...BASE_SPEC, provider: 'grok-api' }, { shellCapUsd: 100 });
  assert.equal(ok, false);
  assert.ok(reds.some((r) => r.path === 'provider'), JSON.stringify(reds));
});

