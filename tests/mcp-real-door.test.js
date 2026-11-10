// borrowed-from: fwdloop test/m13-real-door.test.js@d453892 (re-shaped: fwd's bug was the config home being undefined on the REAL panel, "undefined" must mean the default config home, not "never checked";
// bareloop's pick is R4, so here the same door is walked with the Settings > MCP routes and the check log)
// Run in a CHILD node process with NODE_ENV and NODE_TEST_CONTEXT removed and HOME a scratch dir: no injected home, no injected mcpHome, the panel as `bareloop` starts it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = path.join(ROOT, 'tests', 'fixtures', 'fake-mcp-server.mjs');

const CHILD = `
import { createPanelServer } from ${JSON.stringify(path.join(ROOT, 'src', 'panel', 'server.js'))};
import { newestOkMcpTools } from ${JSON.stringify(path.join(ROOT, 'src', 'mcpchecks.js'))};
import { mcpConfigFor } from ${JSON.stringify(path.join(ROOT, 'src', 'mcpsources.js'))};
const [sessions, press] = process.argv.slice(1);
const { port, token, close } = await createPanelServer({ port: 0, env: {}, sessionsRoot: sessions });
const H = { 'x-bareloop-token': token, 'content-type': 'application/json' };
const get = async (p) => (await fetch('http://127.0.0.1:' + port + p, { headers: H })).json();
const post = async (p, b) => (await fetch('http://127.0.0.1:' + port + p, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
const before = await get('/api/settings/mcp');
const pressed = press === '1' ? await post('/api/settings/mcp-check', { server: 'github' }) : null;
const after = await get('/api/settings/mcp');
await close();
console.log(JSON.stringify({ before, pressed, after, tools: newestOkMcpTools(undefined, 'github', '~/.mcp.json'), cfg: mcpConfigFor('github')?.file ?? null }));
`;

function run(t, { press }) {
  const home = mkdtempSync(path.join(tmpdir(), 'bareloop-r3door-home-'));
  const sessions = mkdtempSync(path.join(tmpdir(), 'bareloop-r3door-sess-'));
  t.after(() => { rmSync(home, { recursive: true, force: true }); rmSync(sessions, { recursive: true, force: true }); });
  writeFileSync(path.join(home, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1' } } } }));
  const env = { ...process.env, HOME: home };
  delete env.NODE_ENV; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD, sessions, press ? '1' : '0'], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  return { home, out: JSON.parse(r.stdout.trim().split('\n').pop()) };
}

test('real process, no injected home: the panel lists the server in the (scratch) HOME\'s ~/.mcp.json, never checked, and the default config home is ~/.config/bareloop', (t) => {
  const { home, out } = run(t, { press: false });
  const gh = out.before.places.find((p) => p.path === '~/.mcp.json').servers[0];
  assert.deepEqual([gh.name, gh.remote, gh.check], ['github', false, null]);
  assert.equal(out.tools, null, 'nothing was checked');
  assert.equal(out.cfg, path.join(home, '.mcp.json'));
  assert.equal(existsSync(path.join(home, '.config', 'bareloop', 'mcp-checks.jsonl')), false, 'a listing wrote a check line');
});

test('real process, no injected home: a press writes the line at the DEFAULT config home and the next read (a "checked" MCP) finds it there', (t) => {
  const { home, out } = run(t, { press: true });
  assert.deepEqual([out.pressed.ok, out.pressed.checked], [true, true]);
  const log = path.join(home, '.config', 'bareloop', 'mcp-checks.jsonl');
  assert.equal(existsSync(log), true, 'the line was not written at ~/.config/bareloop');
  assert.deepEqual(out.tools, ['issue_read', 'list_issues', 'pull_request_read'], 'the default-config-home reader did not find the checked MCP');
  const gh = out.after.places.find((p) => p.path === '~/.mcp.json').servers[0];
  assert.equal(gh.check.ok, true);
  assert.equal(gh.check.tools.length, 3);
  assert.equal(readFileSync(log, 'utf8').split('\n').filter(Boolean).length, 1);
});

test('a test process with an injected config home and no HOME file reads no MCP at all (the door is closed to the real home)', async () => {
  const { mcpSources } = await import('../src/mcpsources.js');
  const cfg = mkdtempSync(path.join(tmpdir(), 'bareloop-r3door-cfg-'));
  const fixture = mkdtempSync(path.join(tmpdir(), 'bareloop-r3door-fx-'));
  try {
    mkdirSync(path.join(fixture, '.cursor'), { recursive: true });
    const src = mcpSources({ home: cfg, mcpHome: fixture });
    assert.deepEqual(src.places.flatMap((p) => p.servers), []);
  } finally { rmSync(cfg, { recursive: true, force: true }); rmSync(fixture, { recursive: true, force: true }); }
});
