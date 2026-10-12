// PANEL-BUILD.md P8 batch 7 — the grep test (rewritten from fwdloop test/m4d-am6-e.test.js): a search of src/ and bin/bareloop.mjs finds no
// provider name, model name, web address or price in CODE. Providers, models, prices and addresses live in Settings only. Comments that tell
// history may still name a vendor (ruling 7, option A: code only); comment-only lines and a trailing `// …` comment are not searched. What the search
// lets through is listed in ALLOWED, each with its reason; a hit anywhere else fails, and an entry that lets nothing through fails too.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

function walk(/** @type {string} */ dir) {
  /** @type {string[]} */
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// A provider is a company or hosted service (plus the tier words a vendor uses for a model family and the local-server name); a model is a vendor's
// name for one; a price is a per-token number; an address is a web URL.
const PROVIDER_NAMES = /deepseek|anthropic|openai|gemini|claude|\bgpt\b|moonshot|kimi|qwen|mistral|groq|openrouter|\bcohere\b|together\.ai|perplexity|\bxai\b|llama|\bglm\b|nemotron|mixtral|\bgoogle|\bhaiku\b|\bsonnet\b|\bopus\b|ollama/i;
const MODEL_NAMES = /deepseek-(flash|v\d|chat|reasoner|pro)|gpt-\d|gpt-oss|claude-\d|claude-(opus|sonnet|haiku)|gemini-\d|llama-?\d|qwen\d?|glm-\d|kimi-k|\bsyn:|\bhf:/i;
const ADDRESSES = /https?:\/\/[^\s'"`)>]+/i;
const PRICES = /\b0\.000\d+\b|\b(?:inPerM|outPerM|cachedInPerM)\s*[:=]\s*[1-9]\d*(?:\.\d+)?\b|RATES_BY_SUFFIX|CEILING_TABLE_USD|defaultModel/;

/**
 * The allow-list: the ONLY exemption. `re` is removed from a code line before the search; `why` says what it is.
 * @type {{file: string, re: RegExp, why: string}[]}
 */
const ALLOWED = [
  {
    file: 'src/providershapes.js',
    re: /anthropic-api|openai-api|gemini-api|'Anthropic'|'OpenAI-compatible'|'Gemini'/g,
    why: 'the three API shapes: the ids saved in config.json and the labels in the Settings dropdown. A shape names a wire protocol, not a vendor address or a model.',
  },
  {
    file: 'src/providers.js',
    re: /anthropic-api|openai-api|gemini-api|AnthropicProvider|OpenAIProvider|GeminiProvider/g,
    why: 'the three client classes bare-agent/providers exports, chosen by shape id, plus PROBE_STATUS keyed by shape id. Class names and shape ids, not providers or models.',
  },
  {
    file: 'src/thinking.js',
    re: /anthropic-api|openai-api|gemini-api|'anthropic'|'openai'|'gemini'|AnthropicProvider|OpenAIProvider|GeminiProvider/g,
    why: 'the map from our shape id to bare-agent\'s own provider kind (the first argument of its thinkingSupport lookup) and the client class names. Library vocabulary, not a vendor address or model.',
  },
  {
    file: 'src/providerrows.js',
    re: /openai-api/g,
    why: 'the plain default shape of a row with nothing saved, and the shape the old max_tokens tick applies to (a wire protocol id, never a vendor).',
  },
  {
    file: 'src/job.js',
    re: /'anthropic-api'|'openai-api'|'gemini-api'/g,
    why: 'the PROVIDERS menu a signed spec\'s `provider` is validated against: the three shape ids plus clipipe. Shape ids, not vendors.',
  },
  {
    file: 'src/modellist.js',
    re: /anthropic-api|gemini-api|anthropic-version|x-goog-api-key/g,
    why: 'the header each wire protocol expects the key in (x-api-key + anthropic-version, x-goog-api-key) and how each lists its models. Shape ids and protocol header names only.',
  },
  {
    file: 'src/config.js',
    re: /anthropicBalanceNote/g,
    why: 'the NAME of a retired config field, deleted from the file on any write (the Balance feature is gone). It is a key to delete, not a provider.',
  },
  {
    file: 'src/plan.js',
    re: /\['sonnet'\]/g,
    why: 'STEP_MODELS: a documented signed plan-schema token that means "this job\'s worker model" (hamr 2026-10-11 ruling Q4). Renaming it would move every signed plan hash.',
  },
  {
    file: 'src/ralph.js',
    re: /'ANTHROPIC_API_KEY'|'OPENAI_API_KEY'|'GEMINI_API_KEY'|'GOOGLE_API_KEY'|'ANTHROPIC_AUTH_TOKEN'/g,
    why: 'real secret environment variable names stripped from a close\'s env (a security denylist, arbiter-owned). Names a close child must never inherit, not a provider choice.',
  },
  {
    file: 'src/validate.js',
    re: /Google\/Gemini API key/g,
    why: 'the label of a secret shape in the one secret-shape inventory (what the redactor reports it found). A label, not a provider setting.',
  },
  {
    file: 'src/panel/index.html',
    re: /https:\/\/fonts\.(googleapis|gstatic)\.com[^\s'"]*|fonts\.(googleapis|gstatic)\.com|google/gi,
    why: 'the page font stylesheet host (no key or request body ever goes there). The only external address in src/, besides loopback.',
  },
  {
    file: 'src/panel/authorroutes.js',
    re: /https?:\/\/\$\{want\}|http:\/\/127\.0\.0\.1/g,
    why: 'the panel\'s own loopback address (its Origin and Host guard and the base for parsing its own request URL). Not a provider.',
  },
  {
    file: 'src/panel/importroutes.js',
    re: /http:\/\/127\.0\.0\.1/g,
    why: 'the panel\'s own loopback address, the base for parsing its own request URL. Not a provider.',
  },
  {
    file: 'src/panel/server.js',
    re: /http:\/\/127\.0\.0\.1(:\$\{boundPort\})?/g,
    why: 'the panel\'s own loopback address (parsing its request URL; the line the panel prints). Not a provider.',
  },
  {
    file: 'src/panel/settingsroutes.js',
    re: /http:\/\/ or https:\/\/\./g,
    why: 'the sentence that a Base URL must start with http:// or https:// (the SHAPE of an address, not an address).',
  },
];

/** a code line: comment-only lines (`//`, `/*`, `*`, `*​/`, `<!--`) dropped, a trailing `// …` comment cut (not inside a quoted URL) */
function codeOf(/** @type {string} */ line) {
  const t = line.trim();
  if (t === '' || /^(\/\/|\/\*|\*|\*\/|<!--)/.test(t)) return '';
  return line.replace(/(^|[^:'"`\\])\/\/\s.*$/, '$1');
}

function files() {
  return [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'bin', 'bareloop.mjs')].filter((f) => /\.(js|mjs|html|json)$/.test(f));
}

function hits() {
  /** @type {string[]} */
  const out = [];
  for (const f of files()) {
    const rel = path.relative(ROOT, f);
    const allowed = ALLOWED.filter((a) => a.file === rel);
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      let rest = codeOf(line);
      for (const a of allowed) rest = rest.replace(a.re, ' ');
      for (const [kind, re] of /** @type {const} */ ([['provider name', PROVIDER_NAMES], ['model name', MODEL_NAMES], ['web address', ADDRESSES], ['price', PRICES]])) {
        const m = re.exec(rest);
        if (m) out.push(`${rel}:${i + 1} ${kind} "${m[0]}" :: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  return out;
}

test('E1: src/ and bin/ hold no provider name, model name, web address or price in code — except the listed allow-list entries', () => {
  const found = hits();
  assert.equal(found.length, 0, `${found.length} hit(s):\n${found.join('\n')}`);
});

test('E2: the test CAN fail — a planted provider, model, address and price are each found, and a comment line is not searched', () => {
  for (const [re, text] of /** @type {const} */ ([
    [PROVIDER_NAMES, 'const host = "api.deepseek.example"'], [PROVIDER_NAMES, "const t = 'sonnet'"], [MODEL_NAMES, "const m = 'gpt-4o'"],
    [ADDRESSES, "const u = 'https://api.example.com/v1'"], [PRICES, 'const r = { inPerM: 3 }'],
  ])) assert.ok(re.test(codeOf(text)), text);
  assert.equal(codeOf('// claude-sonnet-5 on https://api.example.com'), '');
  assert.equal(codeOf('   * the deepseek row'), '');
  assert.equal(codeOf('const x = 1; // deepseek').trim(), 'const x = 1;');
  assert.ok(ADDRESSES.test(codeOf("const u = 'https://api.example.com/v1'; // fine")), 'an address inside a string is not cut as a comment');
});

test('E3: every allow-list entry names an existing file, says why (>= 20 chars) and is actually used — a stale entry would hide a future hit', () => {
  for (const a of ALLOWED) {
    assert.ok(a.why.length >= 20, `${a.file}: say why`);
    const text = readFileSync(path.join(ROOT, a.file), 'utf8').split('\n').map(codeOf).join('\n');
    assert.ok(new RegExp(a.re.source, a.re.flags).test(text), `${a.file} has nothing the allow-list entry for it lets through: remove the entry`);
  }
  console.log(`# allow-list (${ALLOWED.length} entries): ${ALLOWED.map((a) => `${a.file}`).join(', ')}`);
});
