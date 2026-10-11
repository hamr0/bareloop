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
  GEMINI_TIER_MODELS, PROBE_STATUS, probeWarningLines, apiKeyProblem, checkProviderReachable, judgeCallOptions,
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

test('resolveProvider("openai-api") yields the OpenAIProvider ctor, OPENAI_API_KEY, and deepseek-flash on both tiers (hamr\'s ruling: one secondary provider, not a menu)', async () => {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const entry = resolveProvider('openai-api');
  assert.equal(entry.ctor, OpenAIProvider);
  assert.equal(entry.envKey, 'OPENAI_API_KEY');
  assert.deepEqual({ ...entry.tiers }, { sonnet: 'deepseek-flash', haiku: 'deepseek-flash' });
  assert.deepEqual({ ...OPENAI_TIER_MODELS }, { sonnet: 'deepseek-flash', haiku: 'deepseek-flash' });
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

test('the deepseek-flash entry carries the legacy-max-tokens flag (F149: DeepSeek silently ignores max_completion_tokens, asked 64 got 665/608) — the anthropic entry does not', () => {
  const deepseek = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-flash' });
  assert.equal(deepseek.legacyMaxTokens, true, 'an output cap that does not bind is a money hazard — this MUST bind');
  const anthropic = makeProvider('anthropic-api', { apiKey: 'k', model: 'claude-sonnet-5' });
  assert.notEqual(anthropic.legacyMaxTokens, true, 'Anthropic has only ever had one request key — nothing to gate, ever');
});

test('an openai-api model with no table entry gets no legacy-key override — bare-agent\'s own default (max_completion_tokens, GPT-5-safe) applies untouched', () => {
  const gpt = makeProvider('openai-api', { apiKey: 'k', model: 'gpt-4.1' });
  assert.notEqual(gpt.legacyMaxTokens, true);
});

test('makeProvider forwards baseUrl only when given', () => {
  const withUrl = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-flash', baseUrl: 'https://gateway.example/v1' });
  assert.equal(withUrl.baseUrl, 'https://gateway.example/v1');
  const withoutUrl = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-flash' });
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
    model: 'deepseek-flash',
    tierModels: { sonnet: 'deepseek-flash', haiku: 'deepseek-flash' },
    judgeApiKey: 'judge-key',
    judgeModel: 'claude-haiku-4-5',
  });
  assert.equal(providerFor('sonnet'), provider, 'same model id -> the SAME instance, not a rebuild');
  assert.equal(providerFor('haiku'), provider, 'deepseek-flash on both tiers -> the same instance too');
});

test('buildRunnerProviders: with no judgeProviderName override, the judge DEFAULTS to the worker\'s own provider (PRD item 32.1)', async () => {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const { judgeProvider } = buildRunnerProviders({
    providerName: 'openai-api',
    apiKey: 'worker-key',
    model: 'deepseek-flash',
    tierModels: { sonnet: 'deepseek-flash', haiku: 'deepseek-flash' },
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
    model: 'deepseek-flash',
    tierModels: { sonnet: 'deepseek-flash', haiku: 'deepseek-flash' },
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
  model: 'deepseek-flash',
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
  //
  // PANEL-BUILD.md P0 — this call site moved off scripts/run-u.mjs (now a thin
  // adapter) into src/userrun.js's one shared execute() engine, where every
  // `console.error` became `err` (the library never calls `process.exit`/
  // prints via the global console directly — it takes an injectable `err`).
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');
  assert.match(src, /probeWarningLines\(/, 'the runner calls it');
  assert.match(src, /for \(const line of probeWarningLines\(.*\) \?\? \[\]\) err\(line\);/, 'and prints every line to stderr');
  assert.ok(!src.includes('UNPROVEN PROVIDER'), 'the words live in ONE place — a second copy is the drift this item exists to stop');
});

// ── apiKeyProblem: F181 — a shape an HTTP header value cannot carry ────────

test('apiKeyProblem: a clean single-line key reads null', () => {
  assert.equal(apiKeyProblem('sk-test-abc123'), null);
});

test('apiKeyProblem: an embedded newline is caught, named "line break"', () => {
  assert.equal(apiKeyProblem('sk-test\nmeta'), 'contains a line break');
});

test('apiKeyProblem: a bare carriage return is caught by the same "line break" reason', () => {
  assert.equal(apiKeyProblem('sk-test\rmeta'), 'contains a line break');
});

test('apiKeyProblem: an embedded tab is caught, named distinctly from a line break', () => {
  assert.equal(apiKeyProblem('sk-test\tmeta'), 'contains a tab character');
});

test('apiKeyProblem: a leading space is caught', () => {
  assert.equal(apiKeyProblem(' sk-test'), 'has leading or trailing whitespace');
});

test('apiKeyProblem: a trailing space is caught', () => {
  assert.equal(apiKeyProblem('sk-test '), 'has leading or trailing whitespace');
});

test('apiKeyProblem: a generic C0 control character (not tab/CR/LF) is caught', () => {
  assert.equal(apiKeyProblem('sk-test\x01meta'), 'contains a control character');
});

test('apiKeyProblem never trims or repairs — it only reports; the caller decides', () => {
  // the function's own contract, pinned: it must never RETURN a cleaned
  // value, only a reason or null — trimming here would be exactly the
  // "guess at the repair" hamr's retry-never-repair rule forbids in spirit.
  const src = readFileSync(new URL('../src/providers.js', import.meta.url), 'utf8');
  const fn = /export function apiKeyProblem\(value\) \{[\s\S]*?\n\}/.exec(src)?.[0];
  assert.ok(fn, 'apiKeyProblem moved — this guard no longer reads the function it pins');
  assert.ok(!/\.trim\(\)(?!\s*[!=<>])/.test(fn.replace('value !== value.trim()', '')), 'no trim() outside the detection check itself');
});

// ── checkProviderReachable (panel P3 build item 7) — $0, GET-only, never a
// completion/chat call, never returns the key material. Every real network
// call is stubbed via `fetchImpl`; nothing here reaches the internet. ─────

test('checkProviderReachable: anthropic-api — GET only, to <typed Base URL>/models, key in x-api-key, never a completion endpoint', async () => {
  /** @type {any} */
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), method: init.method, headers: init.headers };
    return { ok: true, json: async () => ({ data: [{ id: 'claude-sonnet-5' }] }) };
  };
  const r = await checkProviderReachable({
    providerName: 'anthropic-api', apiKey: 'sk-ant-secret', model: 'claude-sonnet-5', baseUrl: 'https://llm.example.test/v1', fetchImpl,
  });
  assert.equal(seen.method, 'GET');
  assert.equal(seen.url, 'https://llm.example.test/v1/models');
  assert.equal(seen.headers['x-api-key'], 'sk-ant-secret');
  assert.equal(seen.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.reachable, true);
  assert.equal(r.modelListed, true);
  // RED-PROOF: a model id NOT in the stubbed list must read false, not just
  // "truthy because the call succeeded" — otherwise this field proves nothing.
  const r2 = await checkProviderReachable({
    providerName: 'anthropic-api', apiKey: 'sk-ant-secret', model: 'not-a-real-model', baseUrl: 'https://llm.example.test/v1', fetchImpl,
  });
  assert.equal(r2.modelListed, false);
});

test('checkProviderReachable: openai-api — GET to <baseUrl>/models, key as Bearer, never x-api-key', async () => {
  /** @type {any} */
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), method: init.method, headers: init.headers };
    return { ok: true, json: async () => ({ data: [{ id: 'deepseek-flash' }] }) };
  };
  const r = await checkProviderReachable({
    providerName: 'openai-api', apiKey: 'sk-deepseek-secret', model: 'deepseek-flash',
    baseUrl: 'https://gw.example/v1', fetchImpl,
  });
  assert.equal(seen.method, 'GET');
  assert.equal(seen.url, 'https://gw.example/v1/models');
  assert.equal(seen.headers.Authorization, 'Bearer sk-deepseek-secret');
  assert.equal(seen.headers['x-api-key'], undefined, 'never sends the anthropic header shape to an openai-shaped endpoint');
  assert.equal(r.reachable, true);
  assert.equal(r.modelListed, true);
});

test('checkProviderReachable: an HTTP error status reads reachable:false with the status named, never thrown', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const r = await checkProviderReachable({ providerName: 'anthropic-api', apiKey: 'bad-key', baseUrl: 'https://llm.example.test/v1', fetchImpl });
  assert.equal(r.reachable, false);
  assert.equal(r.status, 'HTTP 401');
  assert.equal(r.modelListed, null);
});

test('checkProviderReachable: a network/transport failure reads reachable:false with an error class, never throws', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const r = await checkProviderReachable({ providerName: 'anthropic-api', apiKey: 'k', baseUrl: 'https://llm.example.test/v1', fetchImpl });
  assert.equal(r.reachable, false);
  assert.equal(r.note, 'request failed: Error');
});

test('checkProviderReachable: a fetch TypeError (nothing listening) says what was tried, in plain words', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const r = await checkProviderReachable({ providerName: 'openai-api', apiKey: 'k', baseUrl: 'http://127.0.0.1:9/v1', fetchImpl });
  assert.equal(r.reachable, false);
  assert.equal(r.note, 'nothing answering at http://127.0.0.1:9/v1/models');
});

test('checkProviderReachable: an abort (timeout) reads status "timeout", not a generic error', async () => {
  const fetchImpl = async (url, init) => new Promise((resolveFn, rejectFn) => {
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      rejectFn(e);
    });
  });
  const r = await checkProviderReachable({ providerName: 'anthropic-api', apiKey: 'k', baseUrl: 'https://llm.example.test/v1', fetchImpl, timeoutMs: 5 });
  assert.equal(r.reachable, false);
  assert.equal(r.status, 'timeout');
});

test('checkProviderReachable: an unknown shape name, or a blank Base URL (no default host exists), never calls fetch at all', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  const r = await checkProviderReachable({ providerName: 'no-such-api', apiKey: 'k', baseUrl: 'https://x.example/v1', fetchImpl });
  assert.equal(called, false);
  assert.equal(r.reachable, false);
  assert.equal(r.status, 'unsupported-provider');
  const blank = await checkProviderReachable({ providerName: 'openai-api', apiKey: 'k', fetchImpl });
  assert.equal(called, false);
  assert.equal(blank.reachable, false);
  assert.equal(blank.status, 'no-base-url');
});

test('checkProviderReachable: gemini-api is now testable — key in x-goog-api-key, ids from models[].name minus its models/ prefix', async () => {
  /** @type {any} */
  let seen = null;
  const fetchImpl = async (url, init) => { seen = { url: String(url), headers: init.headers, redirect: init.redirect }; return { ok: true, json: async () => ({ models: [{ name: 'models/m-1' }] }) }; };
  const r = await checkProviderReachable({ providerName: 'gemini-api', apiKey: 'g-key', model: 'm-1', baseUrl: 'https://gem.example/v1beta', fetchImpl });
  assert.equal(seen.url, 'https://gem.example/v1beta/models');
  assert.equal(seen.headers['x-goog-api-key'], 'g-key');
  assert.equal(seen.redirect, 'manual', 'a redirect is never followed, so the key is never sent on');
  assert.equal(r.modelListed, true);
});

test('checkProviderReachable: RED-PROOF — the returned object never carries the api key anywhere in its own JSON shape', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
  const secret = 'sk-this-must-never-come-back-abc123';
  const r = await checkProviderReachable({ providerName: 'anthropic-api', apiKey: secret, baseUrl: 'https://llm.example.test/v1', fetchImpl });
  assert.ok(!JSON.stringify(r).includes(secret));
});

// ── F192 (hamr ruling A, 2026-10-09): the rubric judge runs with thinking OFF ───
//
// run mv117wde: deepseek-flash's default thinking ate the judge's 4000-token output
// budget (1835 of 2409 completion tokens were reasoning), so the locate truncated 4x.
// These tests capture the request body at the provider's `_request` seam, driven
// through bareloop's own code (runLocate -> defaultJudgeLoop -> bare-agent Loop ->
// OpenAIProvider.generate) — nothing between bareloop and the wire is stubbed.

import { runLocate, defaultJudgeLoop, JUDGE_MAX_TOKENS } from '../src/judged.js';
import { makeLoopGenerate } from '../src/authorflow.js';

const F192_CARD = { items: [{ rule: 'has-doc', text: 'Every top-level function has a JSDoc block directly above it.' }] };
const F192_ARTIFACT = '/** doc */\nexport function a() {}\n';

/** run one judge locate against a real provider whose `_request` captures the body */
async function captureJudgeBody(/** @type {string} */ model) {
  const provider = makeProvider('openai-api', { apiKey: 'test-key', model });
  /** @type {any} */
  let body = null;
  /** @type {any} */ (provider)._request = async (/** @type {string} */ _path, /** @type {any} */ b) => {
    body = JSON.parse(JSON.stringify(b));
    throw new Error('captured');
  };
  await runLocate({ artifactText: F192_ARTIFACT, card: F192_CARD, loopFactory: ({ system }) => defaultJudgeLoop({ provider, system }) });
  assert.ok(body, 'the locate request reached the provider seam');
  return body;
}

test('F192: a deepseek-flash judge locate carries thinking:{type:"disabled"} and the unchanged 4000-token cap', async () => {
  const body = await captureJudgeBody('deepseek-flash');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(JUDGE_MAX_TOKENS, 4000);
  assert.equal(body.max_tokens, 4000, 'deepseek-flash takes the legacy max_tokens key (F149) and the cap is untouched');
});

test('thinkingMode: a gpt-5 judge locate carries bare-agent\'s own off shape (reasoning_effort minimal) and NEVER the raw thinking field', async () => {
  const body = await captureJudgeBody('gpt-5');
  assert.equal(body.reasoning_effort, 'minimal', "bare-agent's measured off shape for gpt-5, not a bareloop list");
  assert.equal('thinking' in body, false);
});

test('thinkingMode: a judge on claude-opus-5-5 (measured NOT switchable) does not throw and sends no thinking field of any kind', async () => {
  const provider = makeProvider('anthropic-api', { apiKey: 'test-key', model: 'claude-opus-5-5' });
  assert.deepEqual(judgeCallOptions(provider), {});
  /** @type {any} */
  let body = null;
  /** @type {any} */ (provider)._request = async (/** @type {any} */ b) => { body = JSON.parse(JSON.stringify(b)); throw new Error('captured'); };
  await runLocate({ artifactText: F192_ARTIFACT, card: F192_CARD, loopFactory: ({ system }) => defaultJudgeLoop({ provider, system }) });
  assert.ok(body, 'the request was sent (bare-agent did not refuse before send)');
  assert.equal('thinking' in body, false);
});

test('thinkingMode: a judge on an UNVERIFIED model sends nothing (the default path never breaks a model bare-agent has not measured)', async () => {
  const body = await captureJudgeBody('some-local-model');
  for (const k of ['thinking', 'reasoning_effort', 'think']) assert.equal(k in body, false, k);
});

test('F192: a drafter call with thinking ON on the SAME deepseek-flash provider instance carries NO thinking field — the judge option never leaks into the call options', async () => {
  const provider = makeProvider('openai-api', { apiKey: 'test-key', model: 'deepseek-flash' });
  /** @type {any} */
  let body = null;
  /** @type {any} */ (provider)._request = async (/** @type {string} */ _path, /** @type {any} */ b) => {
    body = JSON.parse(JSON.stringify(b));
    throw new Error('captured');
  };
  await makeLoopGenerate(provider, { draftThinking: 'on' })([{ role: 'user', content: 'hi' }], [], {}).catch(() => {});
  assert.ok(body, 'the worker-path request reached the provider seam');
  assert.equal('thinking' in body, false);
});

test('F192: judgeCallOptions is empty for a non-OpenAI provider even when the model id matches the allow-list', () => {
  const p = makeProvider('anthropic-api', { apiKey: 'k', model: 'deepseek-flash' });
  assert.deepEqual(judgeCallOptions(p), {});
});

// ── hamr 2026-10-10: the DRAFTER's per-call "thinking off" knob (default OFF since hamr 2026-10-11) ─────────────────────────────────

import { draftCallOptions, draftThinkingSent, DRAFT_THINKING_MODES } from '../src/providers.js';
import { runAuthorScout } from '../src/authorscout.js';

/** every request body a real OpenAIProvider of `model` is asked to send while `fn(provider)` runs (the stub answers with a plain text round) */
async function captureBodies(/** @type {string} */ model, /** @type {(p: any) => Promise<any>} */ fn) {
  const provider = makeProvider('openai-api', { apiKey: 'test-key', model });
  /** @type {any[]} */
  const bodies = [];
  /** @type {any} */ (provider)._request = async (/** @type {string} */ _path, /** @type {any} */ b) => {
    bodies.push(JSON.parse(JSON.stringify(b)));
    return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 }, model };
  };
  await fn(provider);
  return bodies;
}

test('draftCallOptions: the knob is the enumerated pair; the DEFAULT is off; on sends nothing; off sends thinkingMode off ONLY where bare-agent measures the model switchable', () => {
  assert.deepEqual([...DRAFT_THINKING_MODES], ['on', 'off']);
  const flash = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-flash' });
  assert.deepEqual(draftCallOptions(flash), { thinkingMode: 'off' }, 'no value = off');
  assert.deepEqual(draftCallOptions(flash, 'on'), {});
  assert.deepEqual(draftCallOptions(flash, 'off'), { thinkingMode: 'off' });
  assert.deepEqual(draftCallOptions(makeProvider('openai-api', { apiKey: 'k', model: 'gpt-5' }), 'off'), { thinkingMode: 'off' }, 'measured switchable');
  assert.deepEqual(draftCallOptions(makeProvider('anthropic-api', { apiKey: 'k', model: 'claude-opus-5-5' }), 'off'), {}, 'measured NOT switchable: nothing sent');
  assert.deepEqual(draftCallOptions(makeProvider('openai-api', { apiKey: 'k', model: 'some-local-model' }), 'off'), {}, 'unverified: nothing sent on the default path');
  assert.deepEqual(draftCallOptions({ model: 'deepseek-flash' }, 'off'), {}, 'not a constructed provider (a test double): never sent');
});

test('draftThinkingSent: on | off | not-switchable | unverified, from bare-agent thinkingSupport', () => {
  const sent = (/** @type {string} */ prov, /** @type {string} */ model, /** @type {any} */ mode) => draftThinkingSent(makeProvider(prov, { apiKey: 'k', model }), mode);
  assert.equal(sent('openai-api', 'deepseek-flash'), 'off');
  assert.equal(sent('openai-api', 'deepseek-flash', 'on'), 'on');
  assert.equal(sent('anthropic-api', 'claude-opus-5-5'), 'not-switchable');
  assert.equal(sent('openai-api', 'some-local-model'), 'unverified');
});

test('draftCallOptions: any other value throws as an operator-param guard (never a silent default)', () => {
  const flash = makeProvider('openai-api', { apiKey: 'k', model: 'deepseek-flash' });
  for (const bad of ['default', 'OFF', '', null, true, 0, {}]) {
    assert.throws(() => draftCallOptions(flash, bad), /draftThinking must be one of on \| off/);
  }
  assert.throws(() => makeLoopGenerate(flash, { draftThinking: 'nope' }), /draftThinking must be one of/, 'and at the generate seam, at construction');
});

test('drafter generate (real OpenAIProvider, _request stubbed): the DEFAULT (no value) and off put thinking on the request body for deepseek-flash only; on leaves the body unchanged', async () => {
  const call = (/** @type {any} */ mode) => (/** @type {any} */ p) => makeLoopGenerate(p, { draftThinking: mode })([{ role: 'user', content: 'hi' }], [], {});
  const [off] = await captureBodies('deepseek-flash', call('off'));
  assert.deepEqual(off.thinking, { type: 'disabled' });
  const [none] = await captureBodies('deepseek-flash', (p) => makeLoopGenerate(p)([{ role: 'user', content: 'hi' }], [], {}));
  assert.deepEqual(none.thinking, { type: 'disabled' }, 'a drafter built with NO thinking value sends thinking disabled');
  assert.deepEqual(none, off, 'no value is exactly off');
  const [dflt] = await captureBodies('deepseek-flash', call('on'));
  assert.equal('thinking' in dflt, false);
  const { thinking: _t, ...offSansThinking } = off;
  assert.deepEqual(dflt, offSansThinking, "'on' is byte-identical to the off body minus the one thinking field");
  const [gpt5] = await captureBodies('gpt-5', call('off'));
  assert.equal(gpt5.reasoning_effort, 'minimal', "gpt-5 'off': bare-agent's own measured shape");
  assert.equal('thinking' in gpt5, false);
  const [unverified] = await captureBodies('some-local-model', call('off'));
  const [unverifiedOn] = await captureBodies('some-local-model', call('on'));
  assert.deepEqual(unverified, unverifiedOn, 'an unverified model: the default off path sends nothing (== on == no knob)');
  for (const k of ['thinking', 'reasoning_effort', 'think']) assert.equal(k in unverified, false, k);
  // 'on' is byte-identical to a call made with NO thinking knob at all (raw provider, not our wrapper)
  const [plain] = await captureBodies('deepseek-flash', (p) => makeLoopGenerate(p, { draftThinking: 'on' })([{ role: 'user', content: 'hi' }], [], {}));
  assert.deepEqual(plain, dflt);
  // the drafter's own max_tokens cap rides along unchanged
  assert.equal(off.max_tokens, dflt.max_tokens);
});

test('the scout (every call it makes) carries the drafter options through runAuthorScout({callOptions})', async () => {
  const surveyor = async () => ({ tools: [{ name: 'shell_read', description: 'read', parameters: { type: 'object', properties: {} }, execute: async () => '' }], policy: null, onLlmResult: null, cleanup: async () => {} });
  const run = (/** @type {any} */ callOptions) => (/** @type {any} */ p) => runAuthorScout({ workdir: '/w', provider: p, createSurveyor: surveyor, attempts: 1, ...(callOptions ? { callOptions } : {}) });
  const off = await captureBodies('deepseek-flash', run({ thinkingMode: 'off' }));
  assert.ok(off.length >= 1);
  assert.ok(off.every((b) => b.thinking && b.thinking.type === 'disabled'), 'survey, recovery and re-ask rounds alike');
  const dflt = await captureBodies('deepseek-flash', run(null));
  assert.ok(dflt.length >= 1);
  assert.ok(dflt.every((b) => !('thinking' in b)));
});
