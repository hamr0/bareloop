// ITEM33-BUILD piece 8 (R4): the scratch world the flowtype-*.test.js files share. A fixture person's home (the MCP config places), a fixture config home (mcp-checks.jsonl,
// config.json), and the REAL panel server on a port the OS picks. FAKE: the MCP server (tests/fixtures/ticket-write-mcp.mjs: four tools, two of them WRITE tools).
// HOME itself is a scratch dir too (npm test is hermetic); the real ~/.mcp.json and ~/.config/bareloop are never touched.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPanelServer } from '../src/panel/server.js';

export const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
/** the fake GitHub server's four tools, two of them write tools */
export const FAKE_TOOLS = ['issue_read', 'list_issues', 'add_issue_comment', 'issue_write'];

/** a config entry for the fake server (the files it needs sit in `dir`) */
export function fakeServer(dir) {
  const ticket = path.join(dir, 'ticket.json');
  writeFileSync(ticket, JSON.stringify({ number: 7, title: 'Add a retry', state: 'open', body: 'please', labels: [{ name: 'bug' }] }));
  return { command: process.execPath, args: [path.join(FIX, 'ticket-write-mcp.mjs')], env: { TICKET_FILE: ticket, CALLS_FILE: path.join(dir, 'calls.jsonl') } };
}

/**
 * @param {import('node:test').TestContext} t
 * @param {{ files?: Record<string, any>, serve?: boolean }} [o] `files` = {path under the person's home: json}; `serve:false` skips the panel server
 */
export async function world(t, o = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'bareloop-r4-'));
  const home = path.join(base, 'person');
  const cfg = path.join(base, 'cfg');
  const proj = path.join(base, 'proj');
  for (const d of [home, cfg, proj]) mkdirSync(d, { recursive: true });
  const files = o.files ?? { '.mcp.json': { mcpServers: { github: fakeServer(base) } } };
  for (const [rel, json] of Object.entries(files)) { mkdirSync(path.dirname(path.join(home, rel)), { recursive: true }); writeFileSync(path.join(home, rel), JSON.stringify(json)); }
  const w = { base, home, cfg, proj, close: async () => {} };
  if (o.serve !== false) {
    const cwd = process.cwd();
    process.chdir(proj);
    const srv = await createPanelServer({ port: 0, home: cfg, mcpHome: home, env: {}, sessionsRoot: path.join(base, 'sessions') });
    w.close = async () => { await srv.close(); process.chdir(cwd); };
    const origin = `http://127.0.0.1:${srv.port}`;
    const H = { 'x-bareloop-token': srv.token, 'content-type': 'application/json' };
    Object.assign(w, {
      origin, H, port: srv.port, token: srv.token,
      get: async (p) => { const r = await fetch(`${origin}${p}`, { headers: H }); return { status: r.status, body: await r.json() }; },
      post: async (p, body) => { const r = await fetch(`${origin}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; },
      page: async () => (await fetch(`${origin}/`, { headers: H })).text(),
    });
  }
  t.after(async () => { await w.close(); rmSync(base, { recursive: true, force: true }); });
  return w;
}
