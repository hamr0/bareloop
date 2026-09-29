// PANEL-BUILD.md P4b — Settings -> Providers: one row per key in the keys file that has a value;
// Name / API shape / Base URL saved to config.json `keys` (human click only); the $0 Test; tokens.
// Scratch homes only; the network is a fake fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, configPath, updateConfig } from '../src/config.js';
import { applyConfiguredKey, keyNameFor, keyRows, findRow, modelChoiceFor, chatModels, defaultsFor } from '../src/providerrows.js';
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

test('keys file: created with the four empty presets (mode 600) only when missing; an existing file is never touched; empty lines are not rows', (t) => {
  const home = tmp(t);
  assert.equal(ensureKeysFile(['ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'], home), true);
  const f = join(home, '.env');
  assert.equal(readFileSync(f, 'utf8'), 'ANTHROPIC_API_KEY=\nDEEPSEEK_API_KEY=\nOPENAI_API_KEY=\nGEMINI_API_KEY=\n');
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
  assert.equal(readFileSync(join(home, '.env'), 'utf8'), 'ANTHROPIC_API_KEY=\nDEEPSEEK_API_KEY=\nOPENAI_API_KEY=\nGEMINI_API_KEY=\n', 'created on first read');
  assert.deepEqual(empty.rows, [], 'four empty presets = no rows');
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
  assert.equal('price' in by.MY_OTHER, false, 'no price anywhere');
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

test('panel page: Providers tab has Name / API shape / Base URL / Test / Tokens used, saves through the row route; no Price, no key dropdown, no add / remove; Chat has no token price', () => {
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
  assert.doesNotMatch(html, /<th>Price<\/th>|pv-key\b|providers\/key|jf-price|Token price/);
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
