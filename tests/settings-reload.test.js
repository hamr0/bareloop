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

test('CLI-started panel: Reload re-reads the keys file — an edited/removed value takes effect, a chosen-name provider follows it', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'settings-reload-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, '.config', 'bareloop');
  mkdirSync(dir, { recursive: true });
  const envFile = join(dir, '.env');
  writeFileSync(envFile, `DEEPSEEK_API_KEY=${KEY_A}\nOPENAI_API_KEY=${KEY_B}\n`);
  chmodSync(envFile, 0o600);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ providers: { anthropic: { key: 'DEEPSEEK_API_KEY' } } }));
  const { base, H } = await startCli(t, home);
  const rows = async () => Object.fromEntries((await (await fetch(`${base}/api/settings/providers`, { headers: H })).json()).rows.map((r) => [r.id, r]));
  let r = await rows();
  assert.equal(r.deepseek.keyStatus, 'found');
  assert.equal(r.openai.keyStatus, 'found');
  assert.equal(r.anthropic.keyName, 'DEEPSEEK_API_KEY');
  assert.equal(r.anthropic.keyStatus, 'found');
  // the person edits the file: OPENAI removed, a new name added, DEEPSEEK emptied
  writeFileSync(envFile, `GEMINI_API_KEY=${KEY_B}\nNEW_ONE=${KEY_A}\n`);
  r = await rows();
  assert.equal(r.openai.keyStatus, 'not set', 'a removed value no longer counts as found');
  assert.equal(r.deepseek.keyStatus, 'not set');
  assert.equal(r.anthropic.keyStatus, 'not set', 'the chosen-name provider follows the file too');
  assert.equal(r.gemini.keyStatus, 'found');
  assert.ok(r.openai.keyOptions.includes('NEW_ONE'));
  assert.ok(!r.openai.keyOptions.includes('OPENAI_API_KEY') || r.openai.keyOptions[0] === 'OPENAI_API_KEY');
});

test('in-process panel: model-check and keyOptions follow the keys file live and the key name picked in config.json', async (t) => {
  const { createPanelServer } = await import('../src/panel/server.js');
  const home = mkdtempSync(join(tmpdir(), 'settings-reload2-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const envFile = join(home, '.env');
  writeFileSync(envFile, `DEEPSEEK_API_KEY=${KEY_A}\n`);
  chmodSync(envFile, 0o600);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ providers: { anthropic: { key: 'DEEPSEEK_API_KEY' } } }));
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: join(home, 's'), fetchImpl });
  t.after(() => close());
  const H = { 'x-bareloop-token': token };
  const check = async () => (await fetch(`http://127.0.0.1:${port}/api/author/model-check?model=claude-sonnet-5`, { headers: H })).json();
  let b = await check();
  assert.equal(b.envKey, 'DEEPSEEK_API_KEY', 'Chat reads the key name picked in Settings');
  assert.equal(b.keyStatus, 'found');
  writeFileSync(envFile, `OPENAI_API_KEY=${KEY_B}\n`);
  b = await check();
  assert.equal(b.keyStatus, 'missing', 'the file edit is seen without a restart');
  const rows = (await (await fetch(`http://127.0.0.1:${port}/api/settings/providers`, { headers: H })).json()).rows;
  assert.ok(rows.find((r) => r.id === 'anthropic').keyOptions.includes('DEEPSEEK_API_KEY'), 'the chosen name stays in its own dropdown');
});
