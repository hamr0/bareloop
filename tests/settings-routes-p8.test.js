// PANEL-BUILD.md P8 batch 2 — the Settings > Providers routes, every server text word for word. Scratch homes only; the network is a
// fake fetch. A refusal never changes config.json (byte-identical); a key reaches a header only and never a response.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createPanelServer } from '../src/panel/server.js';
import { configPath, updateConfig } from '../src/config.js';

const KEY = 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const GW = 'https://gw.example/v1';
/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'settings-routes-p8-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
function keysFile(home, text) {
  const f = join(home, '.env');
  writeFileSync(f, text);
  chmodSync(f, 0o600);
}
async function panel(t, { home, fetchImpl, env = {}, ...rest }) {
  const { port, token, close } = await createPanelServer({ port: 0, home, env, sessionsRoot: tmp(t), fetchImpl, ...rest });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'x-bareloop-token': token, 'content-type': 'application/json' };
  const get = async (p) => { const r = await fetch(`${base}${p}`, { headers: H }); return { status: r.status, body: await r.json() }; };
  const post = async (p, body) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  return { base, token, H, get, post };
}
const row = (rows, slot) => rows.find((r) => r.slot === slot);
const setup = (t, text = `K=${KEY}\n`) => { const home = tmp(t); keysFile(home, text); return home; };

test('GET providers: guarded; rows = filled key lines (file order); the exact payload; no key value anywhere; no vendor row, add or remove control', async (t) => {
  const home = tmp(t);
  const { base, get } = await panel(t, { home });
  assert.equal((await fetch(`${base}/api/settings/providers`)).status, 403);
  const first = await get('/api/settings/providers');
  assert.equal(first.body.ok, true);
  assert.deepEqual(first.body.rows, [], 'a fresh keys file holds two comment lines, no row');
  assert.equal(first.body.keysFile.exists, true);
  assert.equal(first.body.keysFile.path, join(home, '.env'));
  assert.deepEqual(first.body.shapes, [{ id: 'anthropic-api', label: 'Anthropic' }, { id: 'openai-api', label: 'OpenAI-compatible' }, { id: 'gemini-api', label: 'Gemini' }]);
  assert.equal(first.body.configProblem, null);
  keysFile(home, `B_KEY=${KEY}\nEMPTY=\nA_KEY=${KEY}\n`);
  const r = await get('/api/settings/providers');
  assert.deepEqual(r.body.rows.map((x) => x.slot), ['B_KEY', 'A_KEY']);
  assert.deepEqual(row(r.body.rows, 'A_KEY'), { slot: 'A_KEY', label: 'A_KEY', envVar: 'A_KEY', keyStatus: 'set in file', shape: 'openai-api', baseUrl: '', legacyMaxTokens: false, tokens: 0, models: [] });
  assert.equal(JSON.stringify(r.body).includes(KEY), false);
});

test('GET providers: key statuses — not set in shell, found in shell (only when config names it), set in file, bad key sentence', async (t) => {
  const home = setup(t, `GOOD=${KEY}\nBAD=sk-a b\tc\n`);
  updateConfig({ keys: { SHELLY: { shape: 'openai-api' }, UNNAMED_SHELL: null } }, { home });
  const { get } = await panel(t, { home, env: { SHELLY: KEY, STRAY: KEY } });
  const r = (await get('/api/settings/providers')).body.rows;
  assert.deepEqual(r.map((x) => x.slot), ['GOOD', 'BAD', 'SHELLY'], 'a shell-only key is a row only because config names it; STRAY is not');
  assert.equal(row(r, 'GOOD').keyStatus, 'set in file');
  assert.equal(row(r, 'BAD').keyStatus, 'The key has a space or a line break in it. Fix it in your keys file, then reload keys.');
  assert.equal(row(r, 'SHELLY').keyStatus, 'found in shell');
});

test('POST provider: saves shape / Base URL (trailing slashes stripped, empty clears) / the old max_tokens tick; every refusal text word for word and leaves config byte-identical', async (t) => {
  const home = setup(t);
  const { get, post } = await panel(t, { home });
  const ok = await post('/api/settings/provider', { slot: 'K', shape: 'openai-api', baseUrl: `${GW}//`, legacyMaxTokens: true });
  assert.deepEqual(ok, { status: 200, body: { ok: true, slot: 'K' } });
  let r = row((await get('/api/settings/providers')).body.rows, 'K');
  assert.deepEqual([r.shape, r.baseUrl, r.legacyMaxTokens], ['openai-api', GW, true]);
  await post('/api/settings/provider', { slot: 'K', baseUrl: '' });
  r = row((await get('/api/settings/providers')).body.rows, 'K');
  assert.equal(r.baseUrl, '', 'empty clears the field');
  await post('/api/settings/provider', { slot: 'K', baseUrl: GW });
  const before = readFileSync(configPath(home), 'utf8');
  const cases = [
    [{ slot: 'K', shape: 'ollama' }, 'Pick an API shape from the list. Nothing was saved.'],
    [{ slot: 'K', baseUrl: 'ftp://x' }, 'The Base URL must start with http:// or https://. Nothing was saved.'],
    [{ slot: 'K', legacyMaxTokens: 'yes' }, 'The legacy max_tokens tick must be on or off. Nothing was saved.'],
    [{ slot: 'K', shape: 'openai-api', baseUrl: 'nope' }, 'The Base URL must start with http:// or https://. Nothing was saved.'],
    [{ slot: 'K' }, 'Nothing to save.'],
    [{ slot: 'NOPE', shape: 'openai-api' }, 'That provider is not known.'],
    [{ shape: 'openai-api' }, 'That provider is not known.'],
  ];
  for (const [body, say] of cases) {
    const res = await post('/api/settings/provider', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.ok, false);
    assert.equal(res.body.say, say, JSON.stringify(body));
    assert.equal(readFileSync(configPath(home), 'utf8'), before, `byte-identical after ${JSON.stringify(body)}`);
  }
});

test('POST model: a field left out keeps the line; null clears a price; 0 / 0 is a chosen price; tick needs both prices; duplicate / bad name / cachedInPerM / non-string refused with the exact text', async (t) => {
  const home = setup(t);
  const { get, post } = await panel(t, { home });
  const lines = async () => row((await get('/api/settings/providers')).body.rows, 'K').models;
  assert.deepEqual((await post('/api/settings/model', { slot: 'K', model: 'm1' })).body, { ok: true, slot: 'K' });
  assert.deepEqual(await lines(), [{ model: 'm1', use: false }], 'a typed name is added unticked');
  assert.equal((await post('/api/settings/model', { slot: 'K', model: 'm1', inPerM: 0, outPerM: 0 })).status, 200);
  assert.deepEqual(await lines(), [{ model: 'm1', use: false, inPerM: 0, outPerM: 0 }], '0 and 0 are accepted as a chosen price');
  assert.equal((await post('/api/settings/model', { slot: 'K', model: 'm1', use: true })).status, 200, 'a field left out keeps the line\'s price');
  assert.deepEqual(await lines(), [{ model: 'm1', use: true, inPerM: 0, outPerM: 0 }]);
  await post('/api/settings/model', { slot: 'K', model: 'm1', use: false, inPerM: null, outPerM: null });
  assert.deepEqual(await lines(), [{ model: 'm1', use: false }], 'null clears a price');
  const before = readFileSync(configPath(home), 'utf8');
  const cases = [
    [{ slot: 'K', model: 'm1', use: true }, 'Fill both prices to tick this model.'],
    [{ slot: 'K', model: 'm1', inPerM: 1 }, 'Fill both price boxes or clear both.'],
    [{ slot: 'K', model: 'm1', inPerM: -1, outPerM: 1 }, 'A price must be a number, 0 or more.'],
    [{ slot: 'K', model: 'm1', inPerM: '1', outPerM: 1 }, 'A price must be a number, 0 or more.'],
    [{ slot: 'K', model: 'm1', use: 'yes' }, 'Use must be on or off.'],
    [{ slot: 'K', model: 'two words' }, 'The model name must be a model id: 1 to 200 characters, no spaces.'],
    [{ slot: 'K', model: 'm1', cachedInPerM: 1 }, 'Cached input has no price of its own: it is priced as input. Nothing was saved.'],
    [{ slot: 'K' }, 'Pick a model line. Nothing was saved.'],
    [{ slot: 'K', model: 7 }, 'Pick a model line. Nothing was saved.'],
    [{ slot: 'X', model: 'm1' }, 'That provider is not known.'],
  ];
  for (const [body, say] of cases) {
    const res = await post('/api/settings/model', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.say, say, JSON.stringify(body));
    assert.equal(readFileSync(configPath(home), 'utf8'), before, `byte-identical after ${JSON.stringify(body)}`);
  }
  // an older file listing the same model twice is refused whole, by the one rule
  writeFileSync(configPath(home), JSON.stringify({ models: { K: [{ model: 'd', use: false }, { model: 'd', use: false }] } }));
  const broken = await post('/api/settings/model', { slot: 'K', model: 'e' });
  assert.equal(broken.body.say, 'Your settings file (config.json) cannot be read. Fix or remove it, then look again. Nothing was saved.');
});

test('POST model: the first list written for a row removes its older name/price fields; the older single line shows as one line meanwhile', async (t) => {
  const home = setup(t);
  writeFileSync(configPath(home), JSON.stringify({ keys: { K: { name: 'old', priceInPerM: 1, priceOutPerM: 2, shape: 'openai-api', baseUrl: GW } } }));
  const { get, post } = await panel(t, { home });
  assert.deepEqual(row((await get('/api/settings/providers')).body.rows, 'K').models, [{ model: 'old', use: true, inPerM: 1, outPerM: 2 }]);
  await post('/api/settings/model', { slot: 'K', model: 'new' });
  const c = JSON.parse(readFileSync(configPath(home), 'utf8'));
  assert.deepEqual(c.keys.K, { shape: 'openai-api', baseUrl: GW });
  assert.deepEqual(c.models.K, [{ model: 'old', use: true, inPerM: 1, outPerM: 2 }, { model: 'new', use: false }]);
});

test('Test / Refresh: ONE GET of <Base URL>/models, key only in a header per shape, redirect not followed, 4 s deadline; every failure sentence; success texts; no call without a Base URL', async (t) => {
  const home = setup(t, `A=${KEY}\nB=${KEY}\nC=${KEY}\nD=${KEY}\n`);
  updateConfig({ keys: {
    A: { shape: 'anthropic-api', baseUrl: GW }, B: { shape: 'gemini-api', baseUrl: GW }, C: { shape: 'openai-api', baseUrl: GW }, D: { shape: 'openai-api' } } }, { home });
  const calls = [];
  let answer = () => new Response(JSON.stringify({ data: [{ id: 'z' }, { id: 'a' }, { id: 'a' }], models: [{ name: 'models/g1' }] }), { status: 200 });
  const { post, get } = await panel(t, { home, fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return answer(init); } });
  const sets = [['A', { 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }], ['B', { 'x-goog-api-key': KEY }], ['C', { Authorization: `Bearer ${KEY}` }]];
  for (const [slot, headers] of sets) {
    const res = await post('/api/settings/test', { slot });
    assert.equal(res.body.ok, true, slot);
    assert.match(String(res.body.ms), /^\d+$/);
    assert.equal(calls.at(-1).url, `${GW}/models`);
    assert.deepEqual(calls.at(-1).init.headers, headers);
    assert.equal(calls.at(-1).init.method, 'GET');
    assert.equal(calls.at(-1).init.redirect, 'manual');
    assert.equal(JSON.stringify(res.body).includes(KEY), false);
  }
  assert.deepEqual((await post('/api/settings/models', { slot: 'C' })).body, { ok: true, models: ['a', 'z'] }, 'sorted, de-duplicated');
  assert.deepEqual((await post('/api/settings/models', { slot: 'B' })).body, { ok: true, models: ['g1'] }, 'the models/ prefix is dropped');
  const n = calls.length;
  assert.deepEqual((await post('/api/settings/test', { slot: 'D' })).body, { ok: false, why: 'Type a Base URL for D in Settings.' });
  assert.equal(calls.length, n, 'no call when the Base URL is empty');
  const fails = [
    [() => new Response('{}', { status: 401 }), 'The provider refused the key.'],
    [() => new Response('{}', { status: 403 }), 'The provider refused the key.'],
    [() => new Response('{}', { status: 500 }), 'The provider answered with an error.'],
    [() => new Response('', { status: 302, headers: { location: 'https://evil.example/' } }), 'The provider answered with a redirect; the key was not sent on. Check the Base URL.'],
    [() => { throw new TypeError('fetch failed'); }, 'Could not reach the provider.'],
    [(init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); })), 'The provider did not answer in 4 seconds.'],
  ];
  const realSetTimeout = global.setTimeout;
  for (const [fn, why] of fails) {
    answer = fn;
    // the 4 s deadline case is driven by shrinking only the timer the route sets (the signal path is the real one)
    if (why.includes('4 seconds')) global.setTimeout = (cb, ms, ...a) => realSetTimeout(cb, ms === 4000 ? 5 : ms, ...a);
    // eslint-disable-next-line no-await-in-loop
    const res = await post('/api/settings/test', { slot: 'C' });
    global.setTimeout = realSetTimeout;
    assert.deepEqual(res.body, { ok: false, why });
  }
  answer = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
  assert.deepEqual((await post('/api/settings/models', { slot: 'C' })).body, { ok: false, why: 'The provider did not list any models.' });
  assert.equal((await post('/api/settings/test', { slot: 'NOPE' })).body.say, 'That provider is not known.');
  // a row whose key is bad / missing says so without a call
  keysFile(home, 'C=sk-a b\tc\n');
  const m = calls.length;
  assert.equal((await post('/api/settings/test', { slot: 'C' })).body.why, 'The key has a space or a line break in it. Fix it in your keys file, then reload keys.');
  assert.equal(calls.length, m);
  assert.equal(row((await get('/api/settings/providers')).body.rows, 'C').models.length, 0, 'Test and Refresh save no line: listed ids are not saved until touched');
});

test('Test / Refresh write no spend row and never touch a completion endpoint', async (t) => {
  const home = setup(t);
  updateConfig({ keys: { K: { shape: 'openai-api', baseUrl: GW } } }, { home });
  const urls = [];
  const { post } = await panel(t, { home, fetchImpl: async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ data: [{ id: 'x' }] }), { status: 200 }); } });
  await post('/api/settings/test', { slot: 'K' });
  await post('/api/settings/models', { slot: 'K' });
  assert.deepEqual(urls, [`${GW}/models`, `${GW}/models`]);
  assert.equal(existsSync(join(home, 'runs.jsonl')), false);
  assert.equal(existsSync(join(home, 'panel-sessions')), false);
});

test('Open keys folder: dirname of the keys file only; a non-empty body is refused (no-path-allowed); other OS / failed spawn / test process = opened:false + the path', async (t) => {
  const home = setup(t);
  const calls = [];
  const openFolderSpawn = (cmd, args, o) => { calls.push({ cmd, args, o }); const ee = new EventEmitter(); ee.unref = () => {}; process.nextTick(() => ee.emit('spawn')); return ee; };
  const { post, base, H } = await panel(t, { home, openFolderSpawn, platform: 'linux' });
  assert.deepEqual((await post('/api/settings/open-keys-folder', {})).body, { ok: true, opened: true, path: home });
  assert.deepEqual([calls[0].cmd, calls[0].args], ['xdg-open', [home]]);
  assert.equal(calls[0].o.detached, true);
  const sent = await post('/api/settings/open-keys-folder', { path: '/etc' });
  assert.equal(sent.status, 400);
  assert.deepEqual(sent.body, { ok: false, refused: 'no-path-allowed', say: 'The keys folder is opened from the panel\'s own settings; a path cannot be sent. Nothing was opened.' });
  assert.equal(calls.length, 1, 'nothing spawned for the refused one');
  void base; void H;
  const home2 = setup(t);
  const bare = await panel(t, { home: home2 });
  assert.deepEqual((await bare.post('/api/settings/open-keys-folder', {})).body, { ok: true, opened: false, path: home2 }, 'a test process with no injected opener never spawns');
});

test('unknown routes answer the one sentence (404); Balance routes are gone; money routes unchanged', async (t) => {
  const home = setup(t);
  const { get, post, H, base } = await panel(t, { home });
  for (const p of ['/api/settings/providers/balance', '/api/settings/nothing', '/api/settings/providers/row']) {
    const g = await get(p);
    assert.equal(g.status, 404, p);
    assert.equal(g.body.say, 'Settings cannot do that. Keys are typed into your keys file by hand.');
  }
  const b = await post('/api/settings/providers/balance-note', { usd: 5 });
  assert.equal(b.status, 404);
  assert.equal(b.body.say, 'Settings cannot do that. Keys are typed into your keys file by hand.');
  assert.equal(existsSync(configPath(home)), false, 'a refused route writes nothing');
  assert.equal((await post('/api/settings/money', { monthlyLimitUsd: 5 })).status, 200);
  assert.equal((await get('/api/settings/money')).body.monthlyLimitUsd, 5);
  assert.equal((await fetch(`${base}/api/settings/money`, { headers: H, method: 'PUT' })).status, 405);
});

test('a broken config.json: GET says so in plain words; writes are refused with Nothing was saved', async (t) => {
  const home = setup(t);
  writeFileSync(configPath(home), '{ not json');
  const { get, post } = await panel(t, { home });
  const r = await get('/api/settings/providers');
  assert.equal(r.body.configProblem, 'Your settings file (config.json) cannot be read. Fix or remove it, then look again.');
  const w = await post('/api/settings/provider', { slot: 'K', shape: 'openai-api' });
  assert.equal(w.body.say, 'Your settings file (config.json) cannot be read. Fix or remove it, then look again. Nothing was saved.');
  assert.equal(readFileSync(configPath(home), 'utf8'), '{ not json');
});

test('the Money tab groups spend by the matched row\'s key name and carries tokens per model', async (t) => {
  const home = setup(t);
  updateConfig({ keys: { K: { shape: 'openai-api', baseUrl: GW } }, models: { K: [{ model: 'm1', use: true, inPerM: 1, outPerM: 2 }] } }, { home });
  const spine = join(home, 'a.jsonl');
  writeFileSync(spine, [
    JSON.stringify({ type: 'job-start', ts: '2026-09-01T00:00:00Z', provider: 'openai-api', baseUrl: GW, model: 'm1' }),
    JSON.stringify({ type: 'worker-round', ts: '2026-09-01T00:00:01Z', costUsd: 0.01, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 5 } }),
    JSON.stringify({ type: 'job-end', ts: '2026-09-01T00:00:02Z', spendComplete: true }),
  ].join('\n') + '\n');
  writeFileSync(join(home, 'runs.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), spine, runId: 'r1' })}\n`);
  const { get } = await panel(t, { home });
  const r = row((await get('/api/settings/providers')).body.rows, 'K');
  assert.equal(r.tokens, 155);
  assert.deepEqual(r.models, [{ model: 'm1', use: true, inPerM: 1, outPerM: 2, tokens: 155 }]);
  const money = (await get('/api/settings/money')).body;
  assert.deepEqual(money.byProvider.map((p) => p.label), ['K']);
});
