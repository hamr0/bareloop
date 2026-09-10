// PRD item 28, shape (1): the provider factory (src/providers.js). Tests
// the seam itself — provider name -> ctor/envKey/tier table/param gating —
// plus the job-spec-level admission of `openai-api`/`baseUrl` (src/job.js)
// and the `stopReason` forwarding on a real-Loop `worker-round` (src/
// planrun.js, driven through the existing scripted-provider harness).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveProvider, makeProvider, buildRunnerProviders, ANTHROPIC_TIER_MODELS, OPENAI_TIER_MODELS,
  GEMINI_TIER_MODELS, PROBE_STATUS, probeWarningLines,
} from '../src/providers.js';
import { validateJob, PROVIDERS } from '../src/job.js';

// The `stopReason`-on-`worker-round` tests live in tests/planrun.test.js
// instead of here: `makePatient`/`go`/`PLAN`/`tcall`/`JOB` are that file's
// own LOCAL helpers (not exported from tests/helpers.js), and driving a
// real Loop through a scripted provider is exactly "the existing planrun
// test harness" the build asked for — duplicating that harness here would
// be a second copy of the same scaffold, not a new instrument.

// ── the menu itself ─────────────────────────────────────────────────────

test('the PROVIDERS menu is the exact admitted set — a new entry is a deliberate edit, never a drift', () => {
  // PRD item 31.3 added `gemini-api` (hamr: "anthropic, openai, gemini drop
  // ollama for now"). Pinned exactly, and in order, so widening the menu can
  // only happen on purpose: this list is what a spec's `provider` field is
  // validated against, and every entry is a live claim that bareloop can drive
  // that backend.
  assert.deepEqual([...PROVIDERS], ['anthropic-api', 'openai-api', 'gemini-api', 'clipipe-subscription']);
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
//
// PRD item 32.1/32.2 removed the "judge is ALWAYS anthropic-api" pin this
// suite used to assert. The judge now DEFAULTS to the worker's own provider
// (`judgeProviderName = providerName`, PRD item 32.1's un-pinning applied at
// this factory) and is built through the SAME `makeProvider` seam the worker
// is, never a hardcoded `AnthropicProvider` — an operator names a DIFFERENT
// provider for the judge only by passing `judgeProviderName` explicitly. The
// three tests below are the three shapes that claim replaces: the default
// (worker's own provider), the override (a deliberately different one), and
// the reuse (identity match collapses to one instance, which is an economic
// claim — a second instance against the same endpoint/model/key is a second
// prompt-cache prefix — not merely a convenience).

test('buildRunnerProviders: providerFor(tier) reuses the top-level provider when the tier resolves to the same model', () => {
  const { provider, providerFor } = buildRunnerProviders({
    providerName: 'openai-api',
    apiKey: 'worker-key',
    model: 'deepseek-chat',
    tierModels: { sonnet: 'deepseek-chat', haiku: 'deepseek-chat' },
    judgeApiKey: 'judge-key',
    judgeModel: 'claude-haiku-4-5',
  });
  assert.equal(providerFor('sonnet'), provider, 'same model id -> the SAME instance, not a rebuild');
  assert.equal(providerFor('haiku'), provider, 'deepseek-chat on both tiers -> the same instance too');
});

test('buildRunnerProviders: with no judgeProviderName override, the judge DEFAULTS to the worker\'s own provider (PRD item 32.1)', async () => {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const { judgeProvider } = buildRunnerProviders({
    providerName: 'openai-api',
    apiKey: 'worker-key',
    model: 'deepseek-chat',
    tierModels: { sonnet: 'deepseek-chat', haiku: 'deepseek-chat' },
    judgeApiKey: 'judge-key',
    judgeModel: 'claude-haiku-4-5',
  });
  assert.ok(judgeProvider instanceof OpenAIProvider,
    'no override named -> the judge grades on the WORKER\'s own provider, never a fixed vendor');
  assert.equal(judgeProvider.model, 'claude-haiku-4-5');
  assert.equal(judgeProvider.apiKey, 'judge-key', 'the judge uses ITS OWN key, never the worker\'s');
});

test('buildRunnerProviders: an explicit judgeProviderName override builds THAT provider instead — a deliberate pin, not the default', async () => {
  const { AnthropicProvider } = await import('bare-agent/providers');
  const { provider, judgeProvider } = buildRunnerProviders({
    providerName: 'openai-api',
    apiKey: 'worker-key',
    model: 'deepseek-chat',
    tierModels: { sonnet: 'deepseek-chat', haiku: 'deepseek-chat' },
    judgeApiKey: 'judge-key',
    judgeModel: 'claude-haiku-4-5',
    judgeProviderName: 'anthropic-api',
  });
  assert.ok(judgeProvider instanceof AnthropicProvider, 'the named override, and only the named override, pins the judge');
  assert.notEqual(judgeProvider, provider, 'a different provider is never the same instance as the worker\'s');
  assert.equal(judgeProvider.model, 'claude-haiku-4-5');
});

test('buildRunnerProviders: the worker instance is REUSED when provider+model+key+baseUrl all match — never a second instance for the same identity', () => {
  const { provider, judgeProvider } = buildRunnerProviders({
    providerName: 'anthropic-api',
    apiKey: 'shared-key',
    model: 'claude-sonnet-5',
    tierModels: { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5' },
    judgeApiKey: 'shared-key',
    judgeModel: 'claude-sonnet-5',
  });
  assert.equal(judgeProvider, provider, 'identical identity on every axis -> ONE instance, ONE prompt-cache prefix');
});

test('buildRunnerProviders: reuse requires EVERY axis to match — a differing key alone still builds a second instance', () => {
  const { provider, judgeProvider } = buildRunnerProviders({
    providerName: 'anthropic-api',
    apiKey: 'worker-key',
    model: 'claude-sonnet-5',
    tierModels: { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5' },
    judgeApiKey: 'a-different-account-key',
    judgeModel: 'claude-sonnet-5',
  });
  assert.notEqual(judgeProvider, provider, 'same provider and model, different key -> still a SEPARATE instance');
  assert.equal(judgeProvider.apiKey, 'a-different-account-key');
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


// ── PRD item 31.3 — matching bare-agent's adapter surface ───────────────────
//
// hamr's framing: "api + api shape + endpoint". Two of those three generalize
// across bare-agent's providers. The endpoint does NOT, and these tests exist
// because the way it fails is SILENT.

test('gemini-api is on the menu, with its own key, tiers and endpoint spelling', () => {
  assert.ok(PROVIDERS.includes('gemini-api'), 'a spec can name it');
  const e = resolveProvider('gemini-api');
  assert.equal(e.envKey, 'GEMINI_API_KEY', 'its own key, never borrowed from another provider');
  assert.equal(e.tiers.sonnet, 'gemini-2.5-pro');
  assert.equal(e.tiers.haiku, 'gemini-2.5-flash', 'gemini has a real cheap tier, so haiku maps to it honestly');
  assert.notEqual(e.tiers.sonnet, e.tiers.haiku, 'and the two tiers are genuinely different models, unlike DeepSeek');
});

test('the silent-ignore hazard endpointKey guards against is REAL, measured on the dependency', async () => {
  // This is the test that justifies `endpointKey` existing at all, and it is
  // deliberately aimed at bare-agent's OWN constructor rather than at ours —
  // because the hazard lives there and would survive any amount of care on our
  // side. Ollama reads `url`; every other provider reads `baseUrl`; NONE of
  // them validate unknown option names.
  const { OllamaProvider } = await import('bare-agent/providers');
  const elsewhere = 'https://elsewhere.test';
  const wrongSpelling = new OllamaProvider({ baseUrl: elsewhere });
  const rightSpelling = new OllamaProvider({ url: elsewhere });

  assert.equal(rightSpelling.url, elsewhere, 'the option under its real name is honoured');
  // ...and under the WRONG name it is not an error. It is DROPPED, and the
  // provider quietly keeps its own default — a run against a machine nobody
  // chose, with nothing anywhere reporting a problem. Same class as F149
  // (DeepSeek silently ignoring `max_completion_tokens`: asked 64 output
  // tokens, returned 665).
  assert.equal(wrongSpelling.url, 'http://localhost:11434', 'the wrong spelling is silently ignored, never rejected');
  assert.equal(wrongSpelling.baseUrl, undefined, 'and nothing is left behind to notice it by');
});

test('EVERY admitted provider declares its OWN endpoint option name, matching the real constructor', async () => {
  // NOTE ON WHAT THIS CAN AND CANNOT CATCH. All three admitted providers spell
  // it `baseUrl` today, so replacing `entry.endpointKey` with a hardcoded
  // `baseUrl` in makeProvider does NOT fail this suite — mutation-tested and
  // confirmed inert. It is a FORWARD guard, and saying so is the point: a
  // conditional assertion whose condition never holds is a smoke test in
  // disguise, and pretending otherwise is worse than the gap.
  //
  // What it DOES catch, today, and falsifiably: an entry whose declared
  // endpointKey is not the name its own ctor actually reads. That is checked
  // against the constructor, not against a copy of the expected string here.
  const providers = PROVIDERS.filter((p) => p !== 'clipipe-subscription');
  assert.ok(providers.length >= 3, 'the loop below is vacuous if the menu empties');
  for (const name of providers) {
    const e = resolveProvider(name);
    assert.equal(typeof e.endpointKey, 'string', `${name} must SAY where its endpoint goes`);
    assert.ok(e.endpointKey.length > 0, `${name}'s endpointKey is non-empty`);
    // the declared key is the one the ctor honours — constructed DIRECTLY, so a
    // wrong declaration cannot hide behind our own factory using it consistently
    const direct = new e.ctor({ apiKey: 'k', [e.endpointKey]: 'https://declared.test' });
    assert.equal(direct[e.endpointKey], 'https://declared.test',
      `${name} declares endpointKey "${e.endpointKey}" — its constructor must actually read that name`);
  }
});

test('the endpoint lands under the provider\'s own option name, and REACHES the provider', () => {
  // Not "the option was passed" — the constructed object's own field is read
  // back. A test that only checked the argument would pass against a provider
  // that ignored it, which is the exact failure being guarded.
  const url = 'https://endpoint.invalid/v1';
  for (const name of PROVIDERS.filter((p) => p !== 'clipipe-subscription')) {
    const e = resolveProvider(name);
    const p = makeProvider(name, { apiKey: 'k', model: e.tiers.sonnet, baseUrl: url });
    assert.equal(p[e.endpointKey], url, `${name}: the endpoint must arrive under ${e.endpointKey} and STICK`);
  }
});

test('an omitted endpoint leaves the provider on its own default — never undefined', () => {
  for (const name of PROVIDERS.filter((p) => p !== 'clipipe-subscription')) {
    const e = resolveProvider(name);
    const p = makeProvider(name, { apiKey: 'k', model: e.tiers.sonnet });
    assert.equal(typeof p[e.endpointKey], 'string', `${name}: an absent baseUrl must not blank the endpoint`);
    assert.ok(p[e.endpointKey].startsWith('http'), `${name}: it falls back to a real default`);
  }
});

test('every admitted provider still gets exposeErrorBody unconditionally (F153)', () => {
  for (const name of PROVIDERS.filter((p) => p !== 'clipipe-subscription')) {
    const e = resolveProvider(name);
    const p = makeProvider(name, { apiKey: 'k', model: e.tiers.sonnet });
    assert.equal(p.exposeErrorBody, true, `${name}: the provider's own error sentence must reach the human`);
  }
});

test('PROBE_STATUS covers every API provider on the menu, and tells the truth about gemini', () => {
  for (const name of PROVIDERS.filter((p) => p !== 'clipipe-subscription')) {
    assert.ok(PROBE_STATUS[name], `${name} must declare whether it has been probed — silence would read as proven`);
    assert.equal(typeof PROBE_STATUS[name].probed, 'boolean');
    assert.ok(PROBE_STATUS[name].evidence.length > 0, `${name} must say WHAT the evidence is, or that there is none`);
  }
  assert.equal(PROBE_STATUS['anthropic-api'].probed, true, 'the original surface');
  assert.equal(PROBE_STATUS['openai-api'].probed, true, 'run mtu12vks greened through the shipped runner (F157)');
  assert.equal(PROBE_STATUS['gemini-api'].probed, false, 'ZERO runs — admitted to the menu, owes its probe (PRD item 31.3)');
  assert.match(PROBE_STATUS['openai-api'].evidence, /mtu12vks/, 'a claimed probe cites the run that paid for it');
});

test('ollama is NOT admitted — its rounds would price at $0 through machinery that trusts a price', () => {
  // hamr, 2026-09-09: "drop ollama for now". Beyond the ruling, it is the entry
  // whose economics differ in kind: no API key, no bill. A $0 round flowing
  // through a budget that treats $0 as a real price is the honesty violation the
  // `?? 0` rule exists to stop, so admitting it needs that answered first.
  assert.ok(!PROVIDERS.includes('ollama'), 'not on the spec menu');
  assert.ok(!PROVIDERS.includes('ollama-local'), 'under any spelling');
  assert.throws(() => resolveProvider('ollama'), /unknown provider/, 'and the factory refuses it by name, never a silent default');
});


// ── the launch-time UNPROVEN marker (PRD item 31.3) ─────────────────────────

test('an unprobed provider yields a loud warning that NAMES it, cites the absent evidence, and says it will still run', () => {
  const lines = probeWarningLines('gemini-api');
  assert.ok(Array.isArray(lines) && lines.length === 3, 'three lines, in order');
  assert.match(lines[0], /UNPROVEN PROVIDER/, 'the marker itself');
  assert.match(lines[0], /gemini-api/, 'names the provider — a warning that does not say WHICH one is unactionable');
  assert.match(lines[1], /ZERO runs/, 'carries the evidence field verbatim, never a paraphrase that could drift from the table');
  assert.match(lines[2], /will run/, 'and states the NON-refusal — hamr admitted it; this marker never withholds it');
});

test('a probed provider yields NOTHING — the marker is the exception, never a banner every run carries', () => {
  assert.equal(probeWarningLines('anthropic-api'), null);
  assert.equal(probeWarningLines('openai-api'), null);
});

test('an off-table provider name yields nothing here — an unknown provider is resolveProvider\'s named THROW, not a soft warning', () => {
  assert.equal(probeWarningLines('ollama'), null);
  assert.equal(probeWarningLines(''), null);
  assert.throws(() => resolveProvider('ollama'), /unknown provider/, 'the refusal lives there, and only there');
});

test('the warning tracks the TABLE, not a copy of it: every unprobed menu provider gets lines, every probed one gets null', () => {
  // The failure this pins is the one the inline version could not be tested
  // against at all: gemini pays for its probe, PROBE_STATUS flips to true, and a
  // hardcoded warning keeps shouting about a provider that has been proven.
  for (const name of PROVIDERS.filter((p) => p !== 'clipipe-subscription')) {
    const lines = probeWarningLines(name);
    if (PROBE_STATUS[name].probed) assert.equal(lines, null, `${name} is probed — nothing to say`);
    else assert.ok(lines?.[0].includes(name), `${name} is unprobed — it must be named in its own warning`);
  }
});

test('scripts/run-u.mjs PRINTS the warning at launch, through this function and not a second copy of the words', () => {
  // A source-level pin, and deliberately labelled as one: the runner reaches
  // this line only with a real job row (a machine-local patient path) and a
  // real signed spec, so the suite cannot EXECUTE the branch — the reason the
  // words were moved out of the runner in the first place. What this can prove
  // is that the call site exists, sends the lines to stderr, and holds no
  // duplicate of the text that could drift away from PROBE_STATUS.
  const src = readFileSync(new URL('../scripts/run-u.mjs', import.meta.url), 'utf8');
  assert.match(src, /probeWarningLines\(/, 'the runner calls it');
  assert.match(src, /for \(const line of probeWarningLines\(.*\) \?\? \[\]\) console\.error\(line\);/, 'and prints every line to stderr');
  assert.ok(!src.includes('UNPROVEN PROVIDER'), 'the words live in ONE place — a second copy is the drift this item exists to stop');
});
