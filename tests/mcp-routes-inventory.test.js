// ITEM33-BUILD piece 7 / Part B: the inventory of the four Settings > MCP routes. Each is behind the human-click guard (per-start token + Origin/Host) — the GET too,
// because it names servers — and the authoring session has no path to any of them. Wrong method = the same plain refusal as any unknown settings route. $0, scratch homes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPanelServer } from '../src/panel/server.js';

const ROUTES = [['GET', '/api/settings/mcp'], ['POST', '/api/settings/mcp-check'], ['POST', '/api/settings/mcp-path'], ['POST', '/api/settings/mcp-path-remove']];

async function panel(t) {
  const base = mkdtempSync(path.join(tmpdir(), 'bareloop-r3inv-'));
  const cfg = path.join(base, 'cfg'); const person = path.join(base, 'person');
  const { port, token, close } = await createPanelServer({ port: 0, home: cfg, mcpHome: person, env: {}, sessionsRoot: path.join(base, 's') });
  t.after(async () => { await close(); rmSync(base, { recursive: true, force: true }); });
  return { port, token, cfg, base };
}
/** a raw request, so a foreign Host header can be sent (fetch forbids it) */
const raw = (port, { method, p, headers = {}, body }) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => { const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(ch).toString('utf8') })); });
  req.on('error', reject);
  if (body !== undefined) req.write(body);
  req.end();
});

test('every MCP route refuses a request with no token, a wrong token, a foreign Origin, or a foreign Host with no Origin - GET and POST alike - and does nothing', async (t) => {
  const w = await panel(t);
  const sentinel = path.join(w.base, 'started.txt');
  writeFileSync(path.join(w.base, 'mcp.json'), JSON.stringify({ mcpServers: { s: { command: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(sentinel)},'x')`] } } }));
  for (const [method, p] of ROUTES) {
    const body = method === 'POST' ? JSON.stringify({ server: 's', path: path.join(w.base, 'mcp.json') }) : undefined;
    const base = { 'content-type': 'application/json', ...(body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) }) };
    const cases = [
      ['no token', { ...base }],
      ['wrong token', { ...base, 'x-bareloop-token': 'nope' }],
      ['foreign Origin', { ...base, 'x-bareloop-token': w.token, origin: 'http://evil.example' }],
      ['foreign Host, no Origin', { ...base, 'x-bareloop-token': w.token, host: 'evil.example' }],
    ];
    for (const [what, headers] of cases) {
      const r = await raw(w.port, { method, p, headers, body });
      assert.equal(r.status, 403, `${method} ${p} with ${what}`);
      assert.match(r.text, /refused|wrong Host/);
    }
  }
  assert.equal(existsSync(w.cfg) && existsSync(path.join(w.cfg, 'config.json')), false, 'a refused request changed config.json');
  assert.equal(existsSync(path.join(w.cfg, 'mcp-checks.jsonl')), false, 'a refused request wrote a check line');
  assert.equal(existsSync(sentinel), false, 'a refused request started a server');
});

test('with the token and the right Host each MCP route answers; the wrong METHOD on any of the four is the plain "no such settings route" 404', async (t) => {
  const w = await panel(t);
  const H = { 'x-bareloop-token': w.token, 'content-type': 'application/json' };
  const call = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${w.port}${p}`, { method, headers: H, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; };
  const g = await call('GET', '/api/settings/mcp');
  assert.deepEqual([g.status, g.body.ok, g.body.problem, g.body.places.length], [200, true, null, 4]);
  assert.equal((await call('POST', '/api/settings/mcp-check', { server: 'nope' })).body.refused, 'unknown-mcp');
  assert.equal((await call('POST', '/api/settings/mcp-check', {})).body.refused, 'bad-server');
  assert.equal((await call('POST', '/api/settings/mcp-path', { path: 'rel.json' })).body.refused, 'bad-path');
  assert.equal((await call('POST', '/api/settings/mcp-path-remove', { path: '/not/added.json' })).body.refused, 'path-unknown');
  for (const [method, p] of [['POST', '/api/settings/mcp'], ['GET', '/api/settings/mcp-check'], ['GET', '/api/settings/mcp-path'], ['GET', '/api/settings/mcp-path-remove'], ['PUT', '/api/settings/mcp-path'], ['GET', '/api/settings/mcp-other']]) {
    const r = await call(method, p, method === 'GET' ? undefined : {});
    assert.deepEqual([r.status, r.body.refused], [404, 'no-such-settings-route'], `${method} ${p}`);
  }
});

test('the authoring session has no path to the MCP routes: the author routes and the session name no settings handler', () => {
  const src = (f) => readFileSync(new URL(`../src/panel/${f}`, import.meta.url), 'utf8');
  assert.equal(/settingsroutes/.test(src('authorroutes.js')), false);
  assert.equal(/\/api\/settings\/mcp/.test(src('authorroutes.js')), false);
  assert.equal(/\/api\/settings\/mcp|settingsroutes/.test(src('authorsession.js')), false);
});
