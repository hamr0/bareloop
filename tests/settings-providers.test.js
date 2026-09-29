// PANEL-BUILD.md P4a item 4 — Settings -> Providers: read, the $0 Test, the key-NAME dropdown
// saved to config.json (human click only). Scratch homes only; the network is a fake fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, configPath, updateConfig } from '../src/config.js';
import { applyConfiguredKey, keyNameFor } from '../src/providerrows.js';
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

test('keyNameFor / applyConfiguredKey: no pick = built-in, env untouched; a pick maps its value onto the built-in name; an unset pick leaves the built-in UNSET', () => {
  const env = { OPENAI_API_KEY: SECRET_A, MY_KEY: SECRET_B };
  assert.deepEqual(keyNameFor('openai-api', null, {}), { name: 'OPENAI_API_KEY', builtIn: 'OPENAI_API_KEY', chosen: false });
  assert.equal(applyConfiguredKey(env, 'openai-api', null, {}), env, 'no pick: the very same env');
  const cfg = { providers: { openai: { key: 'MY_KEY' } } };
  assert.equal(keyNameFor('openai-api', null, cfg).name, 'MY_KEY');
  const out = applyConfiguredKey(env, 'openai-api', null, cfg);
  assert.equal(out.OPENAI_API_KEY, SECRET_B);
  assert.equal(env.OPENAI_API_KEY, SECRET_A, 'input never mutated');
  // DeepSeek is its own row: OpenAI's pick does not leak into it
  assert.equal(keyNameFor('openai-api', 'https://api.deepseek.com/v1', cfg).chosen, false);
  // picked variable is empty -> the built-in is NOT silently used
  const empty = applyConfiguredKey({ OPENAI_API_KEY: SECRET_A }, 'openai-api', null, cfg);
  assert.equal(empty.OPENAI_API_KEY, undefined);
});

test('/api/settings/providers: needs the token; four rows; names from the file only; found / not set; no key VALUE anywhere in the response', async (t) => {
  const home = tmp(t);
  keysFile(home, `OPENAI_API_KEY=${SECRET_A}\nMY_OTHER=${SECRET_B}\n`);
  const { base, get } = await panel(t, home, async () => { throw new Error('no network expected'); });
  assert.equal((await fetch(`${base}/api/settings/providers`)).status, 403);
  const raw = JSON.stringify(await get('/api/settings/providers'));
  assert.equal(raw.includes(SECRET_A) || raw.includes(SECRET_B), false, 'values never reach the page');
  const r = JSON.parse(raw);
  assert.deepEqual(r.rows.map((x) => x.id), ['anthropic', 'openai', 'gemini', 'deepseek']);
  const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
  assert.equal(by.openai.keyStatus, 'found');
  assert.equal(by.anthropic.keyStatus, 'not set');
  assert.deepEqual(by.openai.keyOptions.sort(), ['MY_OTHER', 'OPENAI_API_KEY']);
  assert.ok(by.anthropic.keyOptions.includes('ANTHROPIC_API_KEY'), 'the built-in is always offered');
  assert.deepEqual(r.keysFile.names, ['MY_OTHER', 'OPENAI_API_KEY']);
  assert.equal(by.deepseek.price, 'estimated');
  assert.equal(by.anthropic.balance.kind, 'note');
});

test('key dropdown: a name in the keys file saves to config.json and shows as the row\'s key; the built-in resets it; a name NOT in the file, or without the token, changes nothing', async (t) => {
  const home = tmp(t);
  keysFile(home, `MY_OTHER=${SECRET_B}\n`);
  const { get, post, token } = await panel(t, home, async () => { throw new Error('no network'); });
  assert.equal((await post('/api/settings/providers/key', { id: 'openai', key: 'MY_OTHER' }, { 'content-type': 'application/json' })).status, 403, 'no token');
  assert.equal((await post('/api/settings/providers/key', { id: 'openai', key: 'MY_OTHER' }, { 'content-type': 'application/json', 'x-bareloop-token': token, origin: 'http://evil.example' })).status, 403, 'wrong Origin');
  assert.equal('providers' in readConfig({ home }).config, false, 'nothing written');
  assert.equal((await post('/api/settings/providers/key', { id: 'openai', key: 'NOT_IN_FILE' })).status, 400);
  assert.equal((await post('/api/settings/providers/key', { id: 'nope', key: 'MY_OTHER' })).status, 400);
  assert.equal('providers' in readConfig({ home }).config, false);
  assert.equal((await post('/api/settings/providers/key', { id: 'openai', key: 'MY_OTHER' })).status, 200);
  assert.equal(readConfig({ home }).config.providers.openai.key, 'MY_OTHER');
  const row = (await get('/api/settings/providers')).rows.find((x) => x.id === 'openai');
  assert.equal(row.keyName, 'MY_OTHER');
  assert.equal(row.keyStatus, 'found');
  assert.equal(readFileSync(configPath(home), 'utf8').includes(SECRET_B), false, 'config.json holds a NAME, never a value');
  assert.equal((await post('/api/settings/providers/key', { id: 'openai', key: 'OPENAI_API_KEY' })).status, 200);
  assert.equal(readConfig({ home }).config.providers?.openai?.key, undefined, 'the built-in clears the pick');
});

test('Test button: no key = no network call; with a key = ONE GET of the models list, key only in a header; the response never carries the key', async (t) => {
  const home = tmp(t);
  keysFile(home, `OPENAI_API_KEY=${SECRET_A}\n`);
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, headers: init?.headers, body: init?.body });
    return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
  };
  const { post } = await panel(t, home, fake);
  const none = await (await post('/api/settings/providers/test', { id: 'anthropic' })).json();
  assert.equal(none.reachable, false);
  assert.equal(none.status, 'no key');
  assert.equal(calls.length, 0, 'a missing key spends nothing and calls nothing');
  const raw = await (await post('/api/settings/providers/test', { id: 'openai' })).text();
  assert.equal(raw.includes(SECRET_A), false);
  const ok = JSON.parse(raw);
  assert.equal(ok.reachable, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].body, undefined, 'a models-list GET, never a completion');
  assert.match(calls[0].url, /openai\.com.*models/);
  assert.equal(calls[0].headers.Authorization, `Bearer ${SECRET_A}`);
});

test('Test button follows the picked key variable', async (t) => {
  const home = tmp(t);
  keysFile(home, `MY_OTHER=${SECRET_B}\n`);
  updateConfig({ providers: { openai: { key: 'MY_OTHER' } } }, { home });
  const calls = [];
  const { post } = await panel(t, home, async (url, init) => { calls.push(init.headers); return new Response('{}', { status: 200 }); });
  assert.equal((await (await post('/api/settings/providers/test', { id: 'openai' })).json()).reachable, true);
  assert.equal(calls[0].Authorization, `Bearer ${SECRET_B}`);
});

test('balance: DeepSeek fetched server-side (key only in a header); Anthropic is a hand-typed note stored in config.json; a bad note is refused', async (t) => {
  const home = tmp(t);
  keysFile(home, `DEEPSEEK_API_KEY=${SECRET_A}\n`);
  updateConfig({ providers: { deepseek: { key: 'DEEPSEEK_API_KEY' } } }, { home });
  const calls = [];
  const { get, post } = await panel(t, home, async (url, init) => {
    calls.push({ url: String(url), h: init.headers });
    return new Response(JSON.stringify({ balance_infos: [{ currency: 'USD', total_balance: '7.42' }] }), { status: 200 });
  });
  const b = await get('/api/settings/providers/balance');
  assert.equal(b.text, '7.42 USD');
  assert.match(calls[0].url, /api\.deepseek\.com\/user\/balance/);
  assert.equal(JSON.stringify(b).includes(SECRET_A), false);
  assert.equal((await post('/api/settings/providers/balance-note', { usd: '12.5' })).status, 200);
  assert.equal(readConfig({ home }).config.anthropicBalanceNote, 12.5);
  assert.equal((await get('/api/settings/providers')).rows.find((x) => x.id === 'anthropic').balance.usd, 12.5);
  assert.equal((await post('/api/settings/providers/balance-note', { usd: 'abc' })).status, 400);
  assert.equal((await post('/api/settings/providers/balance-note', { usd: -1 })).status, 400);
  assert.equal(readConfig({ home }).config.anthropicBalanceNote, 12.5);
});

test('panel page: Providers tab, key dropdown, Test and Reload are in the page; there is NO add / edit / remove (P4b)', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  for (const id of ['tab-providers', 'panel-providers', 'pv-rows', 'btn-reload-keys', 'pv-keyfile-path']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /pv-test/);
  assert.match(html, /\/api\/settings\/providers\/key/);
  assert.doesNotMatch(html, /btn-add-provider|edit-provider-|remove-provider-/);
});

test('CLI door (run-u): the key variable picked in Settings is the one the run demands — an unset pick is named, nothing is spent', async (t) => {
  const home = tmp(t);
  keysFile(home, `ANTHROPIC_API_KEY=${SECRET_A}\n`);
  updateConfig({ providers: { anthropic: { key: 'MY_MISSING_KEY' } } }, { home });
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
  assert.match(errs.join('\n'), /MY_MISSING_KEY not set/);
});
