// PANEL-BUILD.md P4b — Settings -> Providers: one row per key in the keys file that has a value;
// Name / API shape / Base URL saved to config.json `keys` (human click only); the $0 Test; tokens.
// Scratch homes only; the network is a fake fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, configPath, updateConfig } from '../src/config.js';
import { ratesFor, applyConfiguredKey, keyNameFor, keyRows, findRow, modelChoiceFor, chatModels, defaultsFor, PRESET_KEY_NAMES, NO_KEY_PLACEHOLDER } from '../src/providerrows.js';
import { apiKeyProblem } from '../src/providers.js';
import { Loop } from 'bare-agent';
import { rateProvenance } from '../src/ledger.js';
import { ensureKeysFile, filledKeyNames } from '../src/keysfile.js';
import { createPanelServer } from '../src/panel/server.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun } from '../src/userrun.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'settings-providers-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const SECRET_A = 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SECRET_B = 'sk-test-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function keysFile(home, text) {
  const f = join(home, '.env');
  writeFileSync(f, text);
  chmodSync(f, 0o600);
}

async function panel(t, home, fetchImpl) {
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: tmp(t), fetchImpl });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'x-bareloop-token': token, 'content-type': 'application/json' };
  const get = async (p) => (await fetch(`${base}${p}`, { headers: H })).json();
  const post = (p, body, headers = H) => fetch(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { base, token, H, get, post };
}

test('rows: defaults, saved entries win, matching is by shape + endpoint (+ model), no row = the built-in variable', () => {
  const filled = ['ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'MY_OTHER'];
  const rows = keyRows({ filled, config: {} });
  const by = Object.fromEntries(rows.map((r) => [r.envName, r]));
  assert.deepEqual(defaultsFor('ANTHROPIC_API_KEY'), { name: 'claude-sonnet-5', shape: 'anthropic-api', baseUrl: '' });
  assert.deepEqual(by.DEEPSEEK_API_KEY, { envName: 'DEEPSEEK_API_KEY', name: 'deepseek-flash', provider: 'openai-api', baseUrl: 'https://api.deepseek.com/v1' });
  assert.equal(by.OPENAI_API_KEY.name, '');
  assert.equal(by.GEMINI_API_KEY.provider, 'gemini-api');
  assert.deepEqual([by.MY_OTHER.provider, by.MY_OTHER.baseUrl, by.MY_OTHER.name], ['openai-api', '', '']);
  // matching
  assert.equal(keyNameFor('anthropic-api', undefined, rows).name, 'ANTHROPIC_API_KEY');
  assert.deepEqual(keyNameFor('openai-api', 'https://api.deepseek.com/v1/', rows), { name: 'DEEPSEEK_API_KEY', builtIn: 'OPENAI_API_KEY', chosen: true }, 'trailing slash is the same endpoint');
  assert.equal(keyNameFor('openai-api', undefined, rows).name, 'OPENAI_API_KEY', 'a blank URL is the shape\'s own host = the OpenAI row');
  assert.equal(findRow(rows, { provider: 'openai-api', baseUrl: 'https://elsewhere.example/v1' }), null, 'an endpoint no row claims matches no row');
  assert.equal(keyNameFor('openai-api', 'https://elsewhere.example/v1', rows).name, 'OPENAI_API_KEY', 'no row = the built-in variable, as before');
  // env mapping: the row's value lands on the built-in name; input never mutated
  const env = { DEEPSEEK_API_KEY: SECRET_B, OPENAI_API_KEY: SECRET_A };
  const out = applyConfiguredKey(env, 'openai-api', 'https://api.deepseek.com/v1', rows);
  assert.equal(out.OPENAI_API_KEY, SECRET_B);
  assert.equal(env.OPENAI_API_KEY, SECRET_A);
  assert.equal(applyConfiguredKey(env, 'openai-api', undefined, rows), env, 'the row IS the built-in: the very same env');
  // two rows on one endpoint: the Name breaks the tie
  const two = keyRows({ filled: ['A_KEY', 'B_KEY'], config: { keys: { A_KEY: { name: 'm-a', shape: 'openai-api', baseUrl: '' }, B_KEY: { name: 'm-b', shape: 'openai-api', baseUrl: '' } } } });
  assert.equal(findRow(two, { provider: 'openai-api', model: 'm-b' }).envName, 'B_KEY');
  assert.equal(findRow(two, { provider: 'openai-api' }).envName, 'A_KEY');
  // Chat: a blank Name is not offered; a pick resolves to shape + URL (URL absent when blank)
  assert.deepEqual(chatModels(rows).map((m) => m.id), ['claude-sonnet-5', 'deepseek-flash']);
  assert.deepEqual(modelChoiceFor(rows, 'claude-sonnet-5'), { provider: 'anthropic-api', envName: 'ANTHROPIC_API_KEY', name: 'claude-sonnet-5' });
  assert.equal(modelChoiceFor(rows, 'deepseek-flash').baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(modelChoiceFor(rows, ''), null);
  assert.equal(modelChoiceFor(rows, 'nope'), null);
});

test('keys file: created with the five empty presets (mode 600) only when missing; an existing file is never touched; empty lines are not rows', (t) => {
  const home = tmp(t);
  assert.equal(ensureKeysFile(PRESET_KEY_NAMES, home), true);
  const f = join(home, '.env');
  assert.equal(readFileSync(f, 'utf8'), 'ANTHROPIC_API_KEY=\nDEEPSEEK_API_KEY=\nOPENAI_API_KEY=\nGEMINI_API_KEY=\nLOCAL_API_KEY=\n');
  assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.deepEqual(filledKeyNames(home), [], 'empty preset lines are not rows');
  writeFileSync(f, `MINE=${SECRET_A}\n`);
  assert.equal(ensureKeysFile(['ANTHROPIC_API_KEY'], home), false);
  assert.equal(readFileSync(f, 'utf8'), `MINE=${SECRET_A}\n`, 'an existing file is never edited');
  assert.deepEqual(filledKeyNames(home), ['MINE']);
});

test('/api/settings/providers: needs the token; a missing keys file is created; ONE row per FILLED key, nothing hardcoded; no key VALUE anywhere', async (t) => {
  const home = tmp(t);
  const { base, get } = await panel(t, home, async () => { throw new Error('no network expected'); });
  assert.equal((await fetch(`${base}/api/settings/providers`)).status, 403);
  const empty = await get('/api/settings/providers');
  assert.equal(readFileSync(join(home, '.env'), 'utf8'), 'ANTHROPIC_API_KEY=\nDEEPSEEK_API_KEY=\nOPENAI_API_KEY=\nGEMINI_API_KEY=\nLOCAL_API_KEY=\n', 'created on first read');
  assert.deepEqual(empty.rows, [], 'five empty presets = no rows');
  keysFile(home, `ANTHROPIC_API_KEY=\nDEEPSEEK_API_KEY=${SECRET_A}\nMY_OTHER=${SECRET_B}\n`);
  const raw = JSON.stringify(await get('/api/settings/providers'));
  assert.equal(raw.includes(SECRET_A) || raw.includes(SECRET_B), false, 'values never reach the page');
  const r = JSON.parse(raw);
  assert.deepEqual(r.rows.map((x) => x.envName), ['DEEPSEEK_API_KEY', 'MY_OTHER'], 'file order; the empty key has no row');
  const by = Object.fromEntries(r.rows.map((x) => [x.envName, x]));
  assert.deepEqual([by.DEEPSEEK_API_KEY.name, by.DEEPSEEK_API_KEY.shape, by.DEEPSEEK_API_KEY.baseUrl], ['deepseek-flash', 'openai-api', 'https://api.deepseek.com/v1']);
  assert.deepEqual([by.MY_OTHER.name, by.MY_OTHER.shape, by.MY_OTHER.baseUrl], ['', 'openai-api', '']);
  assert.equal(by.MY_OTHER.keyStatus, 'found');
  assert.deepEqual(r.shapes.map((x) => x.label), ['Anthropic', 'OpenAI-compatible', 'Gemini']);
  assert.deepEqual([by.MY_OTHER.priceInPerM, by.MY_OTHER.priceOutPerM], [null, null], 'no price set = null, never 0');
  assert.equal(by.DEEPSEEK_API_KEY.balance.kind, 'fetch');
  // Reload keys = the same GET: an edited file is re-read
  keysFile(home, `MY_OTHER=${SECRET_B}\n`);
  assert.deepEqual((await get('/api/settings/providers')).rows.map((x) => x.envName), ['MY_OTHER']);
});

test('row edit: Name / API shape / Base URL save to config.json `keys`; a bad value, an unknown key, or no token changes nothing', async (t) => {
  const home = tmp(t);
  keysFile(home, `MY_OTHER=${SECRET_B}\n`);
  const { get, post, token } = await panel(t, home, async () => { throw new Error('no network'); });
  const body = { envName: 'MY_OTHER', name: 'my-model', shape: 'anthropic-api', baseUrl: 'https://proxy.example/v1' };
  assert.equal((await post('/api/settings/providers/row', body, { 'content-type': 'application/json' })).status, 403, 'no token');
  assert.equal((await post('/api/settings/providers/row', body, { 'content-type': 'application/json', 'x-bareloop-token': token, origin: 'http://evil.example' })).status, 403, 'wrong Origin');
  assert.equal('keys' in readConfig({ home }).config, false, 'nothing written');
  assert.equal((await post('/api/settings/providers/row', { ...body, envName: 'NOT_IN_FILE' })).status, 400);
  assert.equal((await post('/api/settings/providers/row', { ...body, shape: 'ollama' })).status, 400, 'a shape outside the dropdown');
  assert.equal((await post('/api/settings/providers/row', { ...body, baseUrl: 'ftp://x' })).status, 400);
  assert.equal((await post('/api/settings/providers/row', { ...body, name: 'has space' })).status, 400);
  assert.equal('keys' in readConfig({ home }).config, false);
  assert.equal((await post('/api/settings/providers/row', body)).status, 200);
  assert.deepEqual(readConfig({ home }).config.keys, { MY_OTHER: { name: 'my-model', shape: 'anthropic-api', baseUrl: 'https://proxy.example/v1' } });
  const row = (await get('/api/settings/providers')).rows.find((x) => x.envName === 'MY_OTHER');
  assert.deepEqual([row.name, row.shape, row.baseUrl], ['my-model', 'anthropic-api', 'https://proxy.example/v1']);
  // a blank URL is saved as blank (= the shape's own host), and a trailing slash is dropped
  assert.equal((await post('/api/settings/providers/row', { ...body, baseUrl: '' })).status, 200);
  assert.equal(readConfig({ home }).config.keys.MY_OTHER.baseUrl, '');
  assert.equal((await post('/api/settings/providers/row', { ...body, baseUrl: 'https://proxy.example/v1///' })).status, 200);
  assert.equal(readConfig({ home }).config.keys.MY_OTHER.baseUrl, 'https://proxy.example/v1');
  assert.equal(readFileSync(configPath(home), 'utf8').includes(SECRET_B), false, 'config.json holds no value');
});

test('row price: In / Out save to config.json priceInPerM / priceOutPerM with the row; blank removes the field (never 0); half-set, negative, non-number or no token saves nothing; ratesFor reads what was saved', async (t) => {
  const home = tmp(t);
  keysFile(home, `MY_OTHER=${SECRET_B}\n`);
  const { get, post, token } = await panel(t, home, async () => { throw new Error('no network'); });
  const body = { envName: 'MY_OTHER', name: 'my-model', shape: 'openai-api', baseUrl: '' };
  const cfg = () => readConfig({ home }).config;
  assert.equal((await post('/api/settings/providers/row', { ...body, priceInPerM: '1', priceOutPerM: '2' }, { 'content-type': 'application/json' })).status, 403, 'no token');
  for (const bad of [
    { priceInPerM: '1', priceOutPerM: '' },
    { priceInPerM: '', priceOutPerM: '2' },
    { priceInPerM: '-1', priceOutPerM: '2' },
    { priceInPerM: 'abc', priceOutPerM: '2' },
    { priceInPerM: '1', priceOutPerM: 'Infinity' },
    { priceInPerM: '1', priceOutPerM: '0x10' },
    { priceInPerM: true, priceOutPerM: 2 },
    { priceInPerM: -0.5, priceOutPerM: 2 },
  ]) {
    const r = await post('/api/settings/providers/row', { ...body, ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(typeof (await r.json()).error, 'string');
  }
  assert.equal('keys' in cfg(), false, 'nothing saved by any refusal');
  assert.equal((await post('/api/settings/providers/row', { ...body, priceInPerM: '0.5', priceOutPerM: 2 })).status, 200);
  assert.deepEqual(cfg().keys.MY_OTHER, { name: 'my-model', shape: 'openai-api', baseUrl: '', priceInPerM: 0.5, priceOutPerM: 2 });
  const row = (await get('/api/settings/providers')).rows[0];
  assert.deepEqual([row.priceInPerM, row.priceOutPerM], [0.5, 2]);
  const priced = ratesFor('openai-api', undefined, keyRows({ filled: ['MY_OTHER'], config: cfg() }), 'my-model');
  assert.deepEqual([priced.inPerM, priced.outPerM], [0.5, 2]);
  // a body without the price fields leaves the saved price alone; 0 is a real price
  assert.equal((await post('/api/settings/providers/row', body)).status, 200);
  assert.deepEqual([cfg().keys.MY_OTHER.priceInPerM, cfg().keys.MY_OTHER.priceOutPerM], [0.5, 2]);
  assert.equal((await post('/api/settings/providers/row', { ...body, priceInPerM: '0', priceOutPerM: '0' })).status, 200);
  assert.deepEqual([cfg().keys.MY_OTHER.priceInPerM, cfg().keys.MY_OTHER.priceOutPerM], [0, 0]);
  // blank both = not set: the fields are gone, not 0
  assert.equal((await post('/api/settings/providers/row', { ...body, priceInPerM: '', priceOutPerM: null })).status, 200);
  assert.equal('priceInPerM' in cfg().keys.MY_OTHER || 'priceOutPerM' in cfg().keys.MY_OTHER, false);
  assert.equal(ratesFor('openai-api', undefined, keyRows({ filled: ['MY_OTHER'], config: cfg() }), 'my-model'), null, 'no price = estimated, as today');
  assert.equal(readFileSync(configPath(home), 'utf8').includes(SECRET_B), false);
});

test('Test button: no key = no network call; with a key = ONE GET of the models list at THAT row\'s shape + URL, key only in a header; the response never carries the key', async (t) => {
  const home = tmp(t);
  keysFile(home, `OPENAI_API_KEY=${SECRET_A}\nPROXY_KEY=${SECRET_B}\n`);
  updateConfig({ keys: { PROXY_KEY: { name: 'p', shape: 'anthropic-api', baseUrl: 'https://proxy.example/v9' } } }, { home });
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, headers: init?.headers, body: init?.body });
    return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
  };
  const { post } = await panel(t, home, fake);
  const none = await (await post('/api/settings/providers/test', { envName: 'ANTHROPIC_API_KEY' })).json();
  assert.equal(none.ok, false, 'a name that is not a row is refused');
  assert.equal(calls.length, 0);
  const raw = await (await post('/api/settings/providers/test', { envName: 'OPENAI_API_KEY' })).text();
  assert.equal(raw.includes(SECRET_A), false);
  assert.equal(JSON.parse(raw).reachable, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].body, undefined, 'a models-list GET, never a completion');
  assert.match(calls[0].url, /api\.openai\.com.*models/);
  assert.equal(calls[0].headers.Authorization, `Bearer ${SECRET_A}`);
  // the other row: its own shape (Anthropic header) and its own URL
  await post('/api/settings/providers/test', { envName: 'PROXY_KEY' });
  assert.equal(calls[1].url, 'https://proxy.example/v9/models');
  assert.equal(calls[1].headers['x-api-key'], SECRET_B);
  assert.equal(calls[1].headers.Authorization, undefined);
});

test('LOCAL_API_KEY=null: a row is made (null counts as SET), defaults to OpenAI-compatible at the local URL with a blank Name, and the provider gets a placeholder — never the word null, never a real key', async (t) => {
  const home = tmp(t);
  keysFile(home, 'LOCAL_API_KEY=null\nEMPTY_ONE=\n');
  const calls = [];
  const { get, post } = await panel(t, home, async (url, init) => { calls.push({ url: String(url), h: init.headers }); return new Response(JSON.stringify({ data: [] }), { status: 200 }); });
  const r = await get('/api/settings/providers');
  assert.deepEqual(r.rows.map((x) => x.envName), ['LOCAL_API_KEY'], 'null makes a row; an empty value does not');
  const row = r.rows[0];
  assert.deepEqual([row.name, row.shape, row.baseUrl, row.keyStatus], ['', 'openai-api', 'http://127.0.0.1:11434/v1', 'no key needed']);
  assert.equal(apiKeyProblem('null'), null, 'null is accepted as "no key needed"');
  const ok = await (await post('/api/settings/providers/test', { envName: 'LOCAL_API_KEY' })).json();
  assert.equal(ok.reachable, true);
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/v1/models', 'the normal models-list call at the row\'s URL');
  assert.equal(calls[0].h.Authorization, `Bearer ${NO_KEY_PLACEHOLDER}`);
  // the door hands the provider the placeholder on the built-in name
  const rows = keyRows({ filled: ['LOCAL_API_KEY'], config: {} });
  const env = applyConfiguredKey({ LOCAL_API_KEY: 'null' }, 'openai-api', 'http://127.0.0.1:11434/v1', rows);
  assert.equal(env.OPENAI_API_KEY, NO_KEY_PLACEHOLDER);
  assert.equal(applyConfiguredKey({ OPENAI_API_KEY: 'null' }, 'openai-api', undefined, []).OPENAI_API_KEY, NO_KEY_PLACEHOLDER, 'the marker is a placeholder even on the built-in name');
});

test('MONEY: a local (unknown-model) OpenAI-compatible round is a loud GUESS with a real non-zero cost — never a real $0, and never vouched', async () => {
  const payloads = [];
  const provider = { name: 'openai-api', model: 'llama3.2:3b', generate: async () => ({ text: 'ok', toolCalls: [], usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreationTokens: 0 } }) };
  const loop = new Loop({ provider, system: 's', onLlmResult: (p) => { payloads.push(p); } });
  loop._warnGuesstimateOnce = () => {}; // the one-time console warning is not under test
  await loop.run('hi', []);
  assert.ok(payloads.length >= 1);
  const p = payloads[0];
  assert.equal(p.rateSource, 'default', 'nobody supplied a rate for a local model');
  assert.ok(p.costUsd > 0, `a guess above zero, got ${p.costUsd}`);
  assert.equal(rateProvenance({ rateSource: p.rateSource }), 'guessed', 'our ledger reads it as a guess (estimated), not vouched');
  // no usage at all is UNPRICED (null), never $0
  const bare = { name: 'openai-api', model: 'llama3.2:3b', generate: async () => ({ text: 'ok', toolCalls: [] }) };
  const seen = [];
  const l2 = new Loop({ provider: bare, system: 's', onLlmResult: (x) => { seen.push(x); } });
  await l2.run('hi', []);
  assert.equal(seen[0].costUsd, null, 'a round with no usage is unpriced, not 0');
});

test('Test button: a key file line with no value has no row to test; a malformed value is refused before any call', async (t) => {
  const home = tmp(t);
  keysFile(home, 'GOOD=sk-test-aaaa\tbbbb\nEMPTY=\n');
  const calls = [];
  const { post } = await panel(t, home, async () => { calls.push(1); return new Response('{}', { status: 200 }); });
  assert.equal((await post('/api/settings/providers/test', { envName: 'EMPTY' })).status, 400);
  const bad = await (await post('/api/settings/providers/test', { envName: 'GOOD' })).json();
  assert.equal(bad.status, 'bad key');
  assert.equal(calls.length, 0);
});

test('tokens used: a row totals the runs whose shape + endpoint it serves, off the spines; another row\'s runs do not count', async (t) => {
  const home = tmp(t);
  keysFile(home, `DEEPSEEK_API_KEY=${SECRET_A}\nOPENAI_API_KEY=${SECRET_B}\n`);
  const spine = join(home, 'a.jsonl');
  writeFileSync(spine, [
    JSON.stringify({ type: 'job-start', ts: '2026-09-01T00:00:00Z', provider: 'openai-api', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' }),
    JSON.stringify({ type: 'worker-round', ts: '2026-09-01T00:00:01Z', costUsd: 0.01, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 5 } }),
    JSON.stringify({ type: 'job-end', ts: '2026-09-01T00:00:02Z', spendComplete: true }),
  ].join('\n') + '\n');
  writeFileSync(join(home, 'runs.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), spine, runId: 'r1' })}\n`);
  const { get } = await panel(t, home, async () => { throw new Error('no network'); });
  const rows = Object.fromEntries((await get('/api/settings/providers')).rows.map((x) => [x.envName, x]));
  assert.equal(rows.DEEPSEEK_API_KEY.tokens, 155);
  assert.equal(rows.OPENAI_API_KEY.tokens, 0);
});

test('balance: DeepSeek fetched server-side (key only in a header) for the row on DeepSeek\'s host; Anthropic is a hand-typed note stored in config.json; a bad note is refused', async (t) => {
  const home = tmp(t);
  keysFile(home, `DEEPSEEK_API_KEY=${SECRET_A}\nANTHROPIC_API_KEY=${SECRET_B}\nOPENAI_API_KEY=sk-test-cccccccccccccccccccccccccccc\n`);
  const calls = [];
  const { get, post } = await panel(t, home, async (url, init) => {
    calls.push({ url: String(url), h: init.headers });
    return new Response(JSON.stringify({ balance_infos: [{ currency: 'USD', total_balance: '7.42' }] }), { status: 200 });
  });
  const b = await get('/api/settings/providers/balance?env=DEEPSEEK_API_KEY');
  assert.equal(b.text, '7.42 USD');
  assert.match(calls[0].url, /api\.deepseek\.com\/user\/balance/);
  assert.equal(JSON.stringify(b).includes(SECRET_A), false);
  assert.equal(calls.length, 1);
  const notDeepseek = await get('/api/settings/providers/balance?env=OPENAI_API_KEY');
  assert.equal(notDeepseek.ok, false, 'only the DeepSeek-hosted row fetches a balance');
  assert.equal(calls.length, 1, 'no call for another row');
  assert.equal((await post('/api/settings/providers/balance-note', { usd: '12.5' })).status, 200);
  assert.equal(readConfig({ home }).config.anthropicBalanceNote, 12.5);
  assert.equal((await get('/api/settings/providers')).rows.find((x) => x.envName === 'ANTHROPIC_API_KEY').balance.usd, 12.5);
  assert.equal((await post('/api/settings/providers/balance-note', { usd: 'abc' })).status, 400);
  assert.equal((await post('/api/settings/providers/balance-note', { usd: -1 })).status, 400);
  assert.equal(readConfig({ home }).config.anthropicBalanceNote, 12.5);
});

test('panel page: Providers tab has Name / API shape / Base URL / Test / Tokens used, saves through the row route; Price is two boxes (In / Out), no key dropdown, no add / remove; Chat has no token price', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  for (const id of ['tab-providers', 'panel-providers', 'pv-rows', 'btn-reload-keys', 'pv-keyfile-path']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /pv-test/);
  assert.match(html, /pv-name/);
  assert.match(html, /pv-shape/);
  assert.match(html, /pv-url/);
  assert.match(html, /\/api\/settings\/providers\/row/);
  assert.match(html, /\/api\/author\/models/);
  const head = html.match(/<table class="pv-table" data-testid="provider-table">\s*<thead>\s*<tr>(.*?)<\/tr>/s)[1];
  assert.deepEqual([...head.matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1]),
    ['Key', 'Name', 'API shape', 'Base URL', 'Test', 'Tokens used', 'Balance', 'In $/1M', 'Out $/1M'], 'Providers columns, in order');
  assert.doesNotMatch(html, /<th>Price<\/th>|<label class="hint">(In|Out) \$\/1M/, 'no single Price column, no in-cell label');
  assert.match(html, /<td colspan="9" class="hint" data-testid="pv-empty">/, 'empty row spans all nine columns');
  assert.match(html, /priceInPerM: tr\.querySelector\("\.pv-price-in"\)\.value\.trim\(\),\s*priceOutPerM: tr\.querySelector\("\.pv-price-out"\)\.value\.trim\(\)/, 'the row Save carries both prices');
  assert.ok(html.includes('If your vendor lists two prices, enter the higher one.'));
  assert.doesNotMatch(html, /pv-key\b|providers\/key|jf-price|Token price/);
  assert.doesNotMatch(html, /btn-add-provider|edit-provider-|remove-provider-/);
});

test('CLI door (run-u): the key row whose shape + URL match the spec is the one the run demands — it is named, nothing is spent', async (t) => {
  const home = tmp(t);
  // the row MY_KEY is Anthropic-shaped with a malformed value (a tab inside): the run must name IT,
  // not the built-in ANTHROPIC_API_KEY (which is not in the file at all)
  keysFile(home, 'MY_KEY=sk-test-aaaa\tbbbb\n');
  updateConfig({ keys: { MY_KEY: { name: 'claude-sonnet-5', shape: 'anthropic-api', baseUrl: '' } } }, { home });
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const workdir = tmp(t);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'a@example.com']);
  git(workdir, ['config', 'user.name', 'a']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const closeSrc = "process.exit(1);\n";
  const closePath = join(tmp(t), 'close.mjs');
  writeFileSync(closePath, closeSrc);
  const spec = {
    schema: 'job-v1', job: 'key-pick-fixture', description: 'P4a item 4 door fixture.',
    provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(closeSrc) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const errs = [];
  let code;
  try {
    code = await startRun(spec, {
      workdir, seed, spineName: 'key-pick-fixture-bareloop', approve: jobSpecHash(spec),
      deps: { env: {}, keysHome: home, out: () => {}, err: (x) => errs.push(x), runlistHome: home },
    });
  } catch { code = 'threw'; }
  assert.equal(code, 2);
  assert.match(errs.join('\n'), /MY_KEY contains a tab character/);
});

test('providers GET: shellOnly names a preset key set only in the shell (name only, never the value); empty when the file has it too', async (t) => {
  const home = tmp(t);
  const { port, token, close } = await createPanelServer({ port: 0, home, env: { ANTHROPIC_API_KEY: SECRET_A, DEEPSEEK_API_KEY: SECRET_B, OPENAI_API_KEY: '', MY_OTHER: SECRET_A }, sessionsRoot: tmp(t) });
  t.after(() => close());
  const H = { 'x-bareloop-token': token };
  const read = async () => (await fetch(`http://127.0.0.1:${port}/api/settings/providers`, { headers: H })).text();
  keysFile(home, 'DEEPSEEK_API_KEY=' + SECRET_B + '\nANTHROPIC_API_KEY=\nOPENAI_API_KEY=\n');
  const body = await read();
  assert.deepEqual(JSON.parse(body).shellOnly, ['ANTHROPIC_API_KEY'], 'empty shell value and non-preset names are not listed; a filled file line is not shell-only');
  assert.equal(body.includes(SECRET_A), false, 'the value never appears in the response');
  assert.equal(body.includes(SECRET_B), false);
  keysFile(home, 'DEEPSEEK_API_KEY=' + SECRET_B + '\nANTHROPIC_API_KEY=' + SECRET_A + '\n');
  assert.deepEqual(JSON.parse(await read()).shellOnly, [], 'also in the file = nothing to say');
});

test('panel page: the Providers tab prints one shell-only hint per name under the table', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="pv-shell"'));
  assert.ok(html.includes('is set in your shell but not in ~/.config/bareloop/.env — add it there to use it here and in Chat.'));
});

test('panel page: [Reload keys] is always on the Providers tab (static markup, never in a conditional or hidden block) and the keys-file path is never hardcoded — only the server\'s path is shown', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  const strip = html.slice(html.indexOf('<div class="keyfile-strip"'), html.indexOf('data-testid="provider-table-wrap"'));
  assert.match(strip, /<button class="btn small" type="button" id="btn-reload-keys" data-testid="btn-reload-keys">Reload keys<\/button>/);
  assert.doesNotMatch(strip.slice(0, strip.indexOf('id="btn-reload-keys"')), /hidden/, 'no hidden attribute on the strip or its button');
  assert.ok(html.indexOf('id="btn-reload-keys"') < html.indexOf('id="pv-rows"'), 'it sits above the table, so an empty table cannot take it away');
  // the markup carries no literal path; the keys folder opens through the server (Open keys folder), and the
  // path shows as text only when the server could not open it (the server's own path, the HOME it reads)
  assert.doesNotMatch(strip, /\.config\/bareloop/);
  assert.match(strip, /id="btn-open-keys-folder"[^>]*>Open keys folder<\/button>/);
  assert.doesNotMatch(strip, /Copy path/);
  assert.match(html, /\/api\/settings\/open-keys-folder/);
  assert.match(html, /Could not open it here\. Your keys folder: " \+ \(b\.path/);
  assert.match(html, /path unknown — could not read providers/, 'a failed load says the path is unknown rather than showing a guess');
});

test('Open keys folder: linux = xdg-open <folder>, darwin = open <folder> (argv, detached, no shell, never the file); win32 / a spawn error / a throw = "could not open" + the path; no token = refused, nothing spawned', async (t) => {
  const { EventEmitter } = await import('node:events');
  const home = tmp(t);
  /** @param {string} platform @param {'spawn'|'error'|'throw'} how */
  const run = async (platform, how) => {
    const calls = [];
    const openFolderSpawn = (cmd, args, o) => {
      calls.push({ cmd, args, o });
      if (how === 'throw') throw new Error('EACCES');
      const ee = new EventEmitter();
      ee.unref = () => { ee.unrefd = true; };
      process.nextTick(() => ee.emit(how === 'error' ? 'error' : 'spawn', ...(how === 'error' ? [new Error('ENOENT')] : [])));
      calls.child = ee;
      return ee;
    };
    const { createPanelServer: mk } = await import('../src/panel/server.js');
    const { port, token, close } = await mk({ port: 0, home, env: {}, sessionsRoot: tmp(t), openFolderSpawn, platform });
    t.after(() => close());
    const url = `http://127.0.0.1:${port}/api/settings/open-keys-folder`;
    const H = { 'x-bareloop-token': token, 'content-type': 'application/json' };
    const noTok = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const callsAfterRefusal = calls.length;
    const r = await fetch(url, { method: 'POST', headers: H, body: '{}' });
    return { calls, noTokStatus: noTok.status, callsAfterRefusal, status: r.status, body: await r.json() };
  };
  const lin = await run('linux', 'spawn');
  assert.equal(lin.noTokStatus, 403);
  assert.equal(lin.callsAfterRefusal, 0, 'refused without the token: nothing spawned');
  assert.equal(lin.calls.length, 1);
  assert.deepEqual([lin.calls[0].cmd, lin.calls[0].args], ['xdg-open', [home]], 'the folder, never the .env file');
  assert.equal(lin.calls[0].o.detached, true);
  assert.equal(lin.calls[0].o.stdio, 'ignore');
  assert.equal(lin.calls[0].o.shell, undefined, 'no shell');
  assert.equal(lin.calls.child.unrefd, true);
  assert.deepEqual(lin.body, { ok: true, opened: true, path: home });
  const mac = await run('darwin', 'spawn');
  assert.deepEqual([mac.calls[0].cmd, mac.calls[0].args], ['open', [home]]);
  assert.equal(mac.body.opened, true);
  const win = await run('win32', 'spawn');
  assert.equal(win.calls.length, 0, 'another OS never spawns');
  assert.deepEqual(win.body, { ok: true, opened: false, path: home });
  const err = await run('linux', 'error');
  assert.deepEqual(err.body, { ok: true, opened: false, path: home });
  const thr = await run('linux', 'throw');
  assert.deepEqual(thr.body, { ok: true, opened: false, path: home });
});
