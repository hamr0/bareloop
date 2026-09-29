// P4a bug 1 — "Reload keys" must be real. The panel process is started by the CLI, whose
// env is ALREADY merged with the keys file; the routes must re-merge the file onto the RAW
// shell env each request, or an edited/removed value never takes effect. Real child process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const KEY_A = 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KEY_B = 'sk-test-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const freePort = () => new Promise((res) => {
  const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

async function startCli(t, home) {
  const port = await freePort();
  const env = { PATH: process.env.PATH, HOME: home };
  const child = spawn(process.execPath, [new URL('../bin/bareloop.mjs', import.meta.url).pathname, 'panel', '--port', String(port)], { env, stdio: 'ignore' });
  t.after(() => { child.kill('SIGTERM'); });
  const base = `http://127.0.0.1:${port}`;
  let page = null;
  for (let i = 0; i < 100 && !page; i += 1) {
    try { page = await (await fetch(`${base}/`)).text(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(page, 'panel came up');
  const token = /token["':\s=]+["']?([0-9a-f]{16,})/i.exec(page)?.[1];
  assert.ok(token, 'page carries the per-start token');
  return { base, H: { 'x-bareloop-token': token } };
}

test('CLI-started panel: Reload re-reads the keys file — rows appear and disappear with the file, no restart', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'settings-reload-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, '.config', 'bareloop');
  mkdirSync(dir, { recursive: true });
  const envFile = join(dir, '.env');
  writeFileSync(envFile, `DEEPSEEK_API_KEY=${KEY_A}\nOPENAI_API_KEY=${KEY_B}\n`);
  chmodSync(envFile, 0o600);
  const { base, H } = await startCli(t, home);
  const rows = async () => Object.fromEntries((await (await fetch(`${base}/api/settings/providers`, { headers: H })).json()).rows.map((r) => [r.envName, r]));
  let r = await rows();
  assert.deepEqual(Object.keys(r), ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY']);
  assert.equal(r.DEEPSEEK_API_KEY.keyStatus, 'found');
  // the person edits the file: OPENAI removed, DEEPSEEK emptied, two names added
  writeFileSync(envFile, `DEEPSEEK_API_KEY=\nGEMINI_API_KEY=${KEY_B}\nNEW_ONE=${KEY_A}\n`);
  r = await rows();
  assert.deepEqual(Object.keys(r), ['GEMINI_API_KEY', 'NEW_ONE'], 'a removed or emptied key has no row; new ones appear');
  assert.equal(r.GEMINI_API_KEY.shape, 'gemini-api');
});

test('in-process panel: Chat\'s Model menu and model-check follow the Settings rows and the keys file live', async (t) => {
  const { createPanelServer } = await import('../src/panel/server.js');
  const home = mkdtempSync(join(tmpdir(), 'settings-reload2-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const envFile = join(home, '.env');
  writeFileSync(envFile, `DEEPSEEK_API_KEY=${KEY_A}\nOTHER_KEY=${KEY_B}\n`);
  chmodSync(envFile, 0o600);
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: join(home, 's'), fetchImpl });
  t.after(() => close());
  const H = { 'x-bareloop-token': token, 'content-type': 'application/json' };
  const get = async (p) => (await fetch(`http://127.0.0.1:${port}${p}`, { headers: H })).json();
  const models = async () => (await get('/api/author/models')).models.map((m) => m.id);
  assert.deepEqual(await models(), ['deepseek-flash'], 'OTHER_KEY has a blank Name: not offered');
  let b = await get('/api/author/model-check?model=deepseek-flash');
  assert.equal(b.envKey, 'DEEPSEEK_API_KEY');
  assert.equal(b.keyStatus, 'found');
  // naming the other row in Settings puts it in Chat's menu, with no restart
  await fetch(`http://127.0.0.1:${port}/api/settings/providers/row`, { method: 'POST', headers: H, body: JSON.stringify({ envName: 'OTHER_KEY', name: 'my-model', shape: 'openai-api', baseUrl: '' }) });
  assert.deepEqual(await models(), ['deepseek-flash', 'my-model']);
  b = await get('/api/author/model-check?model=my-model');
  assert.equal(b.envKey, 'OTHER_KEY');
  writeFileSync(envFile, `OPENAI_API_KEY=${KEY_B}\n`);
  b = await get('/api/author/model-check?model=deepseek-flash');
  assert.equal(b.ok, false, 'a model whose key left the file is no longer a model');
  assert.deepEqual(await models(), []);
});
