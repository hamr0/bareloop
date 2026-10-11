// PANEL-BUILD.md P4b / P8 — Settings -> Providers, the pure parts: the rows (nothing built in), the keys file body, the
// `null` no-key marker, the CLI door's key pick, Open keys folder. The routes' texts live in settings-routes-p8.test.js,
// the page in panel-providers-layout.test.js. Scratch homes only; the network is a fake fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateConfig } from '../src/config.js';
import { applyConfiguredKey, keyNameFor, keyRows, findRow, modelChoiceFor, chatModels, effectiveModels, NO_KEY_PLACEHOLDER, usableKey } from '../src/providerrows.js';
import { apiKeyProblem } from '../src/providers.js';
import { Loop } from 'bare-agent';
import { rateProvenance } from '../src/ledger.js';
import { ensureKeysFile, filledKeyNames, KEYS_FILE_BODY } from '../src/keysfile.js';
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

test('rows: nothing is built in; saved entries win; matching is by shape + endpoint, then the ticked priced line of the model', () => {
  const filled = ['ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'MY_OTHER'];
  const bare = keyRows({ filled, config: {} });
  // a key NAME carries no meaning: every row reads the same plain default
  for (const r of bare) assert.deepEqual(r, { envName: r.envName, provider: 'openai-api', baseUrl: '', legacyMaxTokens: false, models: [] });
  const GW = 'https://gw.example/v1';
  const config = {
    keys: { A_KEY: { shape: 'anthropic-api' }, D_KEY: { shape: 'openai-api', baseUrl: GW, legacyMaxTokens: true }, E_KEY: { shape: 'openai-api', baseUrl: GW } },
    models: {
      A_KEY: [{ model: 'm-a', use: true, inPerM: 3, outPerM: 15 }],
      D_KEY: [{ model: 'm-d', use: true, inPerM: 1, outPerM: 2 }, { model: 'm-x', use: false }],
      E_KEY: [{ model: 'm-e', use: true, inPerM: 1, outPerM: 2 }],
    },
  };
  const rows = keyRows({ filled: ['A_KEY', 'D_KEY', 'E_KEY'], config });
  assert.equal(rows[1].legacyMaxTokens, true);
  assert.equal(keyRows({ filled: ['A_KEY'], config: { keys: { A_KEY: { shape: 'anthropic-api', legacyMaxTokens: true } } } })[0].legacyMaxTokens, false, 'the old max_tokens tick only matters on openai-api');
  assert.equal(keyNameFor('anthropic-api', undefined, rows).name, 'A_KEY');
  assert.deepEqual(keyNameFor('openai-api', `${GW}/`, rows, 'm-e'), { name: 'E_KEY', builtIn: 'OPENAI_API_KEY', chosen: true }, 'trailing slash is the same endpoint; the ticked priced line breaks the tie');
  assert.equal(findRow(rows, { provider: 'openai-api', baseUrl: GW, model: 'm-d' })?.envName, 'D_KEY');
  assert.equal(findRow(rows, { provider: 'openai-api', baseUrl: GW, model: 'm-x' })?.envName, 'D_KEY', 'an unticked line breaks no tie: the first row on the endpoint');
  assert.equal(findRow(rows, { provider: 'openai-api', baseUrl: 'https://elsewhere.example/v1' }), null, 'an endpoint no row claims matches no row');
  assert.equal(findRow(rows, { provider: 'openai-api', baseUrl: undefined }), null, 'a blank endpoint is blank: there is no default host to fall back to');
  // env mapping: the row's value lands on the built-in name; input never mutated
  const env = { D_KEY: SECRET_B, OPENAI_API_KEY: SECRET_A };
  const out = applyConfiguredKey(env, 'openai-api', GW, rows, 'm-d');
  assert.equal(out.OPENAI_API_KEY, SECRET_B);
  assert.equal(env.OPENAI_API_KEY, SECRET_A);
  // Chat: only ticked, priced lines; a pick resolves to shape + URL (URL absent when blank)
  assert.deepEqual(chatModels(rows).map((m) => m.id), ['m-a', 'm-d', 'm-e']);
  assert.deepEqual(modelChoiceFor(rows, 'm-a'), { provider: 'anthropic-api', envName: 'A_KEY', name: 'm-a' });
  assert.equal(modelChoiceFor(rows, 'm-d').baseUrl, GW);
  assert.equal(modelChoiceFor(rows, 'm-x'), null, 'an unticked line is never offered');
  assert.equal(modelChoiceFor(rows, ''), null);
  assert.equal(modelChoiceFor(rows, 'nope'), null);
  assert.equal(effectiveModels('A_KEY', config)[0].model, 'm-a');
});

test('keys file: created with the two comment lines (mode 600, no vendor name) only when missing; an existing file is never touched; empty lines are not rows', (t) => {
  const home = tmp(t);
  assert.equal(ensureKeysFile(home), true);
  const f = join(home, '.env');
  assert.equal(readFileSync(f, 'utf8'), KEYS_FILE_BODY);
  assert.equal(readFileSync(f, 'utf8'), '# bareloop keys — type NAME=value by hand; this file is never shown or written by bareloop.\n# One line per provider key, e.g. MY_PROVIDER_API_KEY=... ; each key becomes a row in Settings > Providers.\n');
  assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.deepEqual(filledKeyNames(home), [], 'comment lines are not rows');
  writeFileSync(f, `MINE=${SECRET_A}\nEMPTY=\n`);
  assert.equal(ensureKeysFile(home), false);
  assert.equal(readFileSync(f, 'utf8'), `MINE=${SECRET_A}\nEMPTY=\n`, 'an existing file is never edited');
  assert.deepEqual(filledKeyNames(home), ['MINE']);
});

test('LOCAL_KEY=null: a row is made (null counts as SET, shown as "set in file"), and the provider gets a placeholder — never the word null, never a real key', async (t) => {
  const home = tmp(t);
  keysFile(home, 'LOCAL_KEY=null\nEMPTY_ONE=\n');
  updateConfig({ keys: { LOCAL_KEY: { shape: 'openai-api', baseUrl: 'http://127.0.0.1:11434/v1' } } }, { home });
  const calls = [];
  const { get, post } = await panel(t, home, async (url, init) => { calls.push({ url: String(url), h: init.headers }); return new Response(JSON.stringify({ data: [{ id: 'llama-x' }] }), { status: 200 }); });
  const r = await get('/api/settings/providers');
  assert.deepEqual(r.rows.map((x) => x.slot), ['LOCAL_KEY'], 'null makes a row; an empty value does not');
  assert.equal(r.rows[0].keyStatus, 'set in file');
  assert.equal(apiKeyProblem('null'), null, 'null is accepted as "no key needed"');
  const ok = await (await post('/api/settings/test', { slot: 'LOCAL_KEY' })).json();
  assert.equal(ok.ok, true);
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/v1/models', 'the normal models-list call at the row\'s URL');
  assert.equal(calls[0].h.Authorization, `Bearer ${NO_KEY_PLACEHOLDER}`);
  assert.equal(usableKey('null'), NO_KEY_PLACEHOLDER);
  const rows = keyRows({ filled: ['LOCAL_KEY'], config: { keys: { LOCAL_KEY: { shape: 'openai-api', baseUrl: 'http://127.0.0.1:11434/v1' } } } });
  const env = applyConfiguredKey({ LOCAL_KEY: 'null' }, 'openai-api', 'http://127.0.0.1:11434/v1', rows);
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


test('CLI door (run-u): the key row whose shape + URL match the spec is the one the run demands — it is named, nothing is spent', async (t) => {
  const home = tmp(t);
  // the row MY_KEY is Anthropic-shaped with a malformed value (a tab inside): the run must name IT,
  // not the built-in ANTHROPIC_API_KEY (which is not in the file at all)
  keysFile(home, 'MY_KEY=sk-test-aaaa\tbbbb\n');
  updateConfig({ keys: { MY_KEY: { shape: 'anthropic-api' } }, models: { MY_KEY: [{ model: 'm-a', use: true, inPerM: 3, outPerM: 15 }] } }, { home });
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
    provider: 'anthropic-api', model: 'm-a', cadence: { unit: 'day', every: 1 }, budgetUsd: 1, maxWallMs: 1_800_000,
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
