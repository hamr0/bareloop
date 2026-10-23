// PANEL-BUILD.md P8 batch 4 — Chat's Model menu and the run path: the menu offers ONLY ticked, priced lines labelled `<KEY> · <model>`; a card
// carries `provider` (the key's env name) beside `model`, so two keys ticking one model id resolve by key; a stale pick is refused at $0 with one
// of the three sentences; the run's key is its row's own variable. Scratch homes; nothing is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPanelServer } from '../src/panel/server.js';
import { keyRows, judgePick, chatLines, modelChoiceFor } from '../src/providerrows.js';
import { validateJobCard, buildReuseSpec } from '../src/panel/authorsession.js';
import { updateConfig } from '../src/config.js';
import { listModels } from '../src/modellist.js';

const KEY = 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
/** @param {import('node:test').TestContext} t */
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'model-menu-p8-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const CFG = {
  keys: { A_KEY: { shape: 'openai-api', baseUrl: 'https://a.example/v1' }, B_KEY: { shape: 'openai-api', baseUrl: 'https://b.example/v1' }, C_KEY: { shape: 'anthropic-api' } },
  models: {
    A_KEY: [{ model: 'shared', use: true, inPerM: 1, outPerM: 2 }, { model: 'a-only', use: true, inPerM: 1, outPerM: 2 }, { model: 'unpriced', use: false }, { model: 'priced-unticked', use: false, inPerM: 1, outPerM: 1 }],
    B_KEY: [{ model: 'shared', use: true, inPerM: 3, outPerM: 4 }],
    C_KEY: [],
  },
};
const rows = keyRows({ filled: ['A_KEY', 'B_KEY', 'C_KEY'], config: CFG });

test('chatLines: ONLY ticked and priced lines, labelled `<KEY> · <model>`, in keys-file order', () => {
  assert.deepEqual(chatLines(rows), [
    { slot: 'A_KEY', model: 'shared', label: 'A_KEY · shared' },
    { slot: 'A_KEY', model: 'a-only', label: 'A_KEY · a-only' },
    { slot: 'B_KEY', model: 'shared', label: 'B_KEY · shared' },
  ]);
});

test('two keys ticking the same model id resolve BY KEY; a stale pick is refused with the right one of the three sentences', () => {
  assert.equal(modelChoiceFor(rows, { provider: 'B_KEY', model: 'shared' })?.baseUrl, 'https://b.example/v1');
  assert.equal(modelChoiceFor(rows, { provider: 'A_KEY', model: 'shared' })?.baseUrl, 'https://a.example/v1');
  assert.equal(modelChoiceFor(rows, { provider: 'B_KEY', model: 'a-only' }), null, 'that key does not tick that model');
  assert.equal(modelChoiceFor(rows, { provider: 'A_KEY', model: 'priced-unticked' }), null);
  assert.equal(modelChoiceFor(rows, { provider: 'A_KEY', model: 'unpriced' }), null);
  const j = (pick, r = rows) => judgePick(r, pick);
  assert.equal(j({ provider: 'A_KEY', model: 'shared' }).ok, true);
  assert.equal(j({ provider: 'B_KEY', model: 'a-only' }).say, 'Pick a model. Nothing was spent.', 'the key is set up and ticks something, but not this');
  assert.equal(j({ provider: 'C_KEY', model: 'x' }).say, 'Tick a model in Settings > Providers. Nothing was spent.', 'that key ticks nothing yet');
  assert.equal(j({ provider: 'GONE_KEY', model: 'x' }).say, 'GONE_KEY is not set up: put its key in your keys file and type its Base URL in Settings > Providers. Nothing was spent.');
  assert.equal(j({ model: '' }).say, 'Pick a model. Nothing was spent.');
  assert.equal(j({ model: '' }, []).say, 'Tick a model in Settings > Providers. Nothing was spent.', 'no ticked line anywhere');
});

test('validateJobCard and buildReuseSpec use the pick: the card carries provider beside model', () => {
  const card = { jobName: 'menu-p8-job', checkType: 'deterministic', provider: 'B_KEY', model: 'shared', jobText: 'fix\n~ nothing else\nit works', inputs: 'repo: /x', destination: 'src/', capUsd: 1 };
  assert.deepEqual(validateJobCard({ ...card, provider: 'B_KEY', model: 'a-only' }, { rows, jobsDir: '/nonexistent' }), { ok: false, error: 'Pick a model. Nothing was spent.' });
  const origin = { schema: 'job-v1', job: 'x', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1, verdictType: 'green', writeScope: ['src/**'], goal: 'g', tools: ['read'], escalation: { mode: 'decision-ready' } };
  const spec = buildReuseSpec(origin, { destination: 'src/', capUsd: 2, provider: 'B_KEY', model: 'shared' }, rows);
  assert.deepEqual([spec.provider, spec.baseUrl, spec.model], ['openai-api', 'https://b.example/v1', 'shared']);
});

test('GET /api/author/models: {ok, lines, say}; the empty text; model-check judges {provider, model} and answers a stale pick 400 with the sentence', async (t) => {
  const home = tmp(t);
  writeFileSync(join(home, '.env'), `A_KEY=${KEY}\nB_KEY=${KEY}\nC_KEY=${KEY}\n`);
  chmodSync(join(home, '.env'), 0o600);
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: join(home, 's'), fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'shared' }] }), { status: 200 }) });
  t.after(() => close());
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'x-bareloop-token': token } }); return { status: r.status, body: await r.json() }; };
  const empty = await get('/api/author/models');
  assert.deepEqual(empty.body, { ok: true, lines: [], say: 'Tick a model in Settings > Providers.' });
  for (const [env, c] of Object.entries(CFG.keys)) updateConfig({ keys: { [env]: c } }, { home });
  for (const [env, list] of Object.entries(CFG.models)) updateConfig({ models: { [env]: list } }, { home });
  const full = await get('/api/author/models');
  assert.equal(full.body.say, '');
  assert.deepEqual(full.body.lines.map((l) => l.label), ['A_KEY · shared', 'A_KEY · a-only', 'B_KEY · shared']);
  // every line carries the server's answer for the "Thinking on" box (bare-agent's lookup; an unmeasured model is 'unverified' and stays enabled)
  // each line names its shape and normalised endpoint: the Resume card filters on them exactly as resolveWorker does
  assert.deepEqual(full.body.lines.map((l) => [l.shape, l.endpoint]), [['openai-api', 'https://a.example/v1'], ['openai-api', 'https://a.example/v1'], ['openai-api', 'https://b.example/v1']]);
  assert.deepEqual(full.body.lines[0].thinking, { support: 'unverified', canChange: true, say: '' });
  const ok = await get('/api/author/model-check?model=shared&provider=B_KEY');
  assert.equal(ok.body.envKey, 'B_KEY', 'the key is the chosen row\'s own variable');
  assert.equal(ok.body.keyStatus, 'found');
  const stale = await get('/api/author/model-check?model=a-only&provider=B_KEY');
  assert.equal(stale.status, 400);
  assert.equal(stale.body.error, 'Pick a model. Nothing was spent.');
});

test('listModels on a Base URL with 30000 slashes before a last character is linear (the trailing-slash regex was quadratic), and still drops only trailing slashes', async () => {
  const urls = /** @type {string[]} */ ([]);
  const fetchImpl = /** @type {any} */ (async (/** @type {string} */ u) => { urls.push(u); return { ok: false, status: 500, text: async () => '', json: async () => ({}), headers: new Map() }; });
  const t0 = performance.now();
  const mid = `https://x.example${'/'.repeat(30000)}v1`;
  await listModels({ shape: 'openai', baseUrl: `  ${mid}${'/'.repeat(30000)}`, key: 'k', fetchImpl });
  await listModels({ shape: 'openai', baseUrl: mid, key: 'k', fetchImpl });
  assert.deepEqual(urls, [`${mid}/models`, `${mid}/models`]);
  assert.ok(performance.now() - t0 < 1000, `took ${performance.now() - t0} ms`);
});
