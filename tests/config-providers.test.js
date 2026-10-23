// PANEL-BUILD.md P8 batch 1 — the new config shape (`keys.<ENV>.{shape,baseUrl,legacyMaxTokens}` + `models.<ENV>` lines),
// how an older file reads, the one model-line rule, and that nothing sniffs a host or a model id. Scratch homes only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, updateConfig, configPath, modelsProblem, providerFieldProblem, cleanBaseUrl, ConfigError } from '../src/config.js';
import { keyRows, effectiveModels, tickedLines, ratesFor } from '../src/providerrows.js';
import { SHAPES, SHAPE_IDS } from '../src/providershapes.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'config-providers-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const rowOf = (env, config) => keyRows({ filled: [env], config })[0];

test('shapes: three wire protocols, id + label only — no address anywhere', () => {
  assert.deepEqual(SHAPES.map((s) => [s.id, s.label]), [['anthropic-api', 'Anthropic'], ['openai-api', 'OpenAI-compatible'], ['gemini-api', 'Gemini']]);
  assert.deepEqual([...SHAPE_IDS], ['anthropic-api', 'openai-api', 'gemini-api']);
  for (const s of SHAPES) assert.deepEqual(Object.keys(s).sort(), ['id', 'label']);
});

test('read: an older row {name, priceInPerM, priceOutPerM} is ONE ticked line; half a price, a bad price, or none is an UNTICKED line with no price; no name is no line', () => {
  const cfg = (v) => ({ keys: { K: { shape: 'openai-api', baseUrl: 'https://x.example/v1', ...v } } });
  assert.deepEqual(effectiveModels('K', cfg({ name: 'm', priceInPerM: 0.5, priceOutPerM: 1.5 })), [{ model: 'm', use: true, inPerM: 0.5, outPerM: 1.5 }]);
  assert.deepEqual(effectiveModels('K', cfg({ name: 'm', priceInPerM: 0, priceOutPerM: 0 })), [{ model: 'm', use: true, inPerM: 0, outPerM: 0 }], '0 / 0 is a chosen price');
  for (const bad of [{ priceInPerM: 1 }, { priceOutPerM: 1 }, { priceInPerM: -1, priceOutPerM: 1 }, { priceInPerM: 'x', priceOutPerM: 1 }, {}]) {
    assert.deepEqual(effectiveModels('K', cfg({ name: 'm', ...bad })), [{ model: 'm', use: false }], JSON.stringify(bad));
  }
  assert.deepEqual(effectiveModels('K', cfg({ priceInPerM: 1, priceOutPerM: 1 })), [], 'a price with no saved name carries no line');
  assert.deepEqual(effectiveModels('K', {}), []);
  // the built-in names an old build supplied are NOT carried: only what the person saved
  assert.deepEqual(effectiveModels('ANTHROPIC_API_KEY', {}), []);
  assert.deepEqual(effectiveModels('DEEPSEEK_API_KEY', {}), []);
});

test('read: a row WITH models.<ENV> uses that list and ignores the older single-line fields', () => {
  const config = { keys: { K: { name: 'old', priceInPerM: 1, priceOutPerM: 1 } }, models: { K: [{ model: 'new', use: false }] } };
  assert.deepEqual(effectiveModels('K', config), [{ model: 'new', use: false }]);
  assert.deepEqual(tickedLines([rowOf('K', config)]), []);
});

test('defaults: shape openai-api, no address, tick off, no lines — and no host or model id sets anything', () => {
  for (const env of ['DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'LOCAL_API_KEY', 'ANYTHING']) {
    assert.deepEqual(rowOf(env, {}), { envName: env, provider: 'openai-api', baseUrl: '', legacyMaxTokens: false, models: [] });
  }
  // a deepseek host and a deepseek model id do not turn the old max_tokens tick on (nobody sniffs)
  const r = rowOf('K', { keys: { K: { shape: 'openai-api', baseUrl: 'https://api.deepseek.com/v1' } }, models: { K: [{ model: 'deepseek-flash', use: true, inPerM: 1, outPerM: 1 }] } });
  assert.equal(r.legacyMaxTokens, false);
  assert.equal(rowOf('K', { keys: { K: { shape: 'openai-api', legacyMaxTokens: true } } }).legacyMaxTokens, true, 'only the person\'s tick');
});

test('modelsProblem: the ONE rule, sentence for sentence', () => {
  const p = (list) => modelsProblem(list);
  assert.equal(p([]), null);
  assert.equal(p([{ model: 'a', use: false }, { model: 'b', use: true, inPerM: 0, outPerM: 0 }]), null);
  assert.equal(p('x'), 'The model list must be a list of lines.');
  assert.equal(p([1]), 'Each model line must be an object.');
  assert.equal(p([{ model: 'two words', use: false }]), 'The model name must be a model id: 1 to 200 characters, no spaces.');
  assert.equal(p([{ model: '', use: false }]), 'The model name must be a model id: 1 to 200 characters, no spaces.');
  assert.equal(p([{ model: 'a', use: false }, { model: 'a', use: false }]), 'The model "a" is listed twice.');
  assert.equal(p([{ model: 'a', use: 'yes' }]), 'Use must be on or off.');
  assert.equal(p([{ model: 'a', use: false, inPerM: 1 }]), 'Fill both price boxes or clear both.');
  assert.equal(p([{ model: 'a', use: false, inPerM: 1, outPerM: -1 }]), 'A price must be a number, 0 or more.');
  assert.equal(p([{ model: 'a', use: false, inPerM: '1', outPerM: 1 }]), 'A price must be a number, 0 or more.');
  assert.equal(p([{ model: 'a', use: true }]), 'Fill both prices to tick this model.');
  assert.equal(p([{ model: 'a', use: false, thinkingOff: true }]), 'A model line has no "thinkingOff" field.');
  assert.equal(providerFieldProblem('shape', 'ollama'), 'must be one of anthropic-api, openai-api, gemini-api');
  assert.equal(cleanBaseUrl('https://x.example/v1///'), 'https://x.example/v1');
});

test('write: models replace whole; the FIRST list of a row removes its older name/price fields in the same write; the Balance note goes; other fields are kept', (t) => {
  const home = tmp(t);
  writeFileSync(configPath(home), JSON.stringify({
    monthlyLimitUsd: 9, anthropicBalanceNote: 4, custom: { keep: 1 },
    keys: { K: { name: 'old', priceInPerM: 1, priceOutPerM: 2, shape: 'openai-api', baseUrl: 'https://x.example/v1', extra: 'kept' }, J: { name: 'other', priceInPerM: 1, priceOutPerM: 1 } },
  }));
  updateConfig({ models: { K: [{ model: 'old', use: true, inPerM: 1, outPerM: 2 }] } }, { home });
  const c = readConfig({ home }).config;
  assert.deepEqual(c.keys.K, { shape: 'openai-api', baseUrl: 'https://x.example/v1', extra: 'kept' }, 'name and both prices are gone from K, in the same write');
  assert.deepEqual(c.keys.J, { name: 'other', priceInPerM: 1, priceOutPerM: 1 }, 'another row is untouched');
  assert.equal(Object.hasOwn(c, 'anthropicBalanceNote'), false);
  assert.deepEqual(c.custom, { keep: 1 });
  assert.equal(c.monthlyLimitUsd, 9);
  assert.deepEqual(c.models.K, [{ model: 'old', use: true, inPerM: 1, outPerM: 2 }]);
  // J still reads through the migration rule
  assert.deepEqual(effectiveModels('J', c), [{ model: 'other', use: true, inPerM: 1, outPerM: 1 }]);
});

test('write: a refused patch leaves the file byte-identical; a secret-shaped string is refused anywhere; an unreadable or invalid file is a reported problem', (t) => {
  const home = tmp(t);
  updateConfig({ keys: { K: { shape: 'openai-api' } } }, { home });
  const before = readFileSync(configPath(home), 'utf8');
  const secret = `sk-${'a'.repeat(30)}`;
  assert.throws(() => updateConfig({ models: { K: [{ model: secret, use: false }] } }, { home }), ConfigError);
  assert.throws(() => updateConfig({ keys: { K: { baseUrl: `https://x.example/${secret}` } } }, { home }), /never holds a key value/);
  assert.throws(() => updateConfig({ models: { K: [{ model: 'a', use: true }] } }, { home }), /Fill both prices to tick this model\./);
  assert.equal(readFileSync(configPath(home), 'utf8'), before);
  writeFileSync(configPath(home), JSON.stringify({ models: { K: [{ model: 'a', use: true }] } }));
  const r = readConfig({ home });
  assert.match(r.problem ?? '', /Fill both prices to tick this model\./);
  assert.deepEqual(r.config, {}, 'a broken file reads as nothing set, with the problem reported — never silently half-used');
  assert.throws(() => updateConfig({ monthlyLimitUsd: 5 }, { home }), ConfigError);
});

test('ratesFor reads the model LINE price (per 1M, /1000 for bare-agent); an unticked or unpriced line gives none', () => {
  const rows = keyRows({ filled: ['K'], config: { keys: { K: { shape: 'openai-api', baseUrl: 'https://x.example/v1' } }, models: { K: [
    { model: 'a', use: true, inPerM: 2, outPerM: 8 }, { model: 'b', use: false, inPerM: 4, outPerM: 4 }, { model: 'c', use: false }] } } });
  assert.deepEqual(ratesFor('openai-api', 'https://x.example/v1', rows, 'a')?.rates, { in: 2 / 1000, out: 8 / 1000 });
  assert.deepEqual(ratesFor('openai-api', 'https://x.example/v1', rows, 'b')?.rates, { in: 4 / 1000, out: 4 / 1000 }, 'a priced line prices its model even unticked');
  assert.equal(ratesFor('openai-api', 'https://x.example/v1', rows, 'c'), null);
  assert.equal(ratesFor('openai-api', 'https://x.example/v1', rows, 'nope'), null);
});

test('cleanBaseUrl on a Base URL with 20000 slashes before a last character is linear (the trailing-slash regex was quadratic), and still drops only trailing slashes', () => {
  const t0 = performance.now();
  const mid = `https://x.example${'/'.repeat(20000)}v1`;
  assert.equal(cleanBaseUrl(mid), mid);
  assert.equal(cleanBaseUrl(`${mid}${'/'.repeat(20000)}`), mid);
  assert.ok(performance.now() - t0 < 1000, `took ${performance.now() - t0} ms`);
});
