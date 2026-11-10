// borrowed-from: fwdloop test/m13-p4-pick.test.js@13be64d (re-shaped: bareloop's config home and an injected person's home; the POC half runs the REAL `check tools` press on the fake server)
// ITEM33-BUILD piece 8 POC ($0): the pick on a never-checked MCP refuses in the exact words; after a check the pick lists EVERY tool including the write tools, none dropped.
// A job with an MCP gets ALL the tools of that MCP's newest OK check, set by code; a server is never started by the pick.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { appendMcpCheck } from '../src/mcpchecks.js';
import { mcpPickFor, NEVER_CHECKED_SAY, signFlow } from '../src/mcppick.js';
import { world, FAKE_TOOLS } from './flowtype-world.mjs';

const GH = { mcpServers: { github: { command: '/nonexistent/never-started' }, remoteone: { url: 'https://x.test/mcp' } } };
const check = (over) => ({ server: 'github', path: '~/.mcp.json', at: '2026-10-31T10:00:00Z', ok: true, tools: [{ name: 'issue_read', hint: 'read-only' }, { name: 'list_issues', hint: null }, { name: 'create_issue', hint: null }], ...over });

test('the full tool list of the newest OK check, in the server\'s order; the server is never started (its command does not exist)', async (t) => {
  const w = await world(t, { files: { '.mcp.json': GH }, serve: false });
  const o = { home: w.cfg, mcpHome: w.home };
  appendMcpCheck(w.cfg, check({ at: '2026-10-30T10:00:00Z', tools: [{ name: 'old_tool', hint: null }] }));
  appendMcpCheck(w.cfg, check());
  assert.deepEqual(mcpPickFor('github', o), { ok: true, server: 'github', tools: ['issue_read', 'list_issues', 'create_issue'] });
});

test('a failed check after an OK one does not hide the OK one: the newest OK line is used', async (t) => {
  const w = await world(t, { files: { '.mcp.json': GH }, serve: false });
  appendMcpCheck(w.cfg, check());
  appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-10-31T11:00:00Z', ok: false, error: 'did not start' });
  assert.equal(mcpPickFor('github', { home: w.cfg, mcpHome: w.home }).ok, true);
});

test('never checked, only a failed check, or an empty tool list: refused with the one sentence', async (t) => {
  const w = await world(t, { files: { '.mcp.json': GH }, serve: false });
  const o = { home: w.cfg, mcpHome: w.home };
  assert.deepEqual(mcpPickFor('github', o), { ok: false, say: NEVER_CHECKED_SAY });
  assert.equal(NEVER_CHECKED_SAY, 'press check tools in Settings > MCP first');
  appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-10-31T11:00:00Z', ok: false, error: 'x' });
  assert.equal(mcpPickFor('github', o).ok, false);
  appendMcpCheck(w.cfg, check({ tools: [] }));
  assert.equal(mcpPickFor('github', o).ok, false);
});

test('a check of the same name at ANOTHER path does not count; a remote or unknown server is refused by name', async (t) => {
  const w = await world(t, { files: { '.mcp.json': GH }, serve: false });
  const o = { home: w.cfg, mcpHome: w.home };
  appendMcpCheck(w.cfg, check({ path: '/somewhere/else.json' }));
  assert.equal(mcpPickFor('github', o).ok, false);
  assert.match(mcpPickFor('remoteone', o).say, /remoteone is a remote server, not supported yet/);
  assert.match(mcpPickFor('nope', o).say, /nope is not in any MCP config/);
});

test('POC: a never-checked MCP refuses in the exact words; after a REAL check tools press the pick lists every tool, the write tools included, none dropped', async (t) => {
  const w = await world(t);
  const o = { home: w.cfg, mcpHome: w.home };
  const before = mcpPickFor('github', o);
  assert.deepEqual(before, { ok: false, say: 'press check tools in Settings > MCP first' });
  const r = await w.post('/api/settings/mcp-check', { server: 'github' });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.equal(r.body.checked, true, 'the fake server answered');
  const pick = mcpPickFor('github', o);
  assert.equal(pick.ok, true, JSON.stringify(pick));
  assert.deepEqual([...pick.tools].sort(), [...FAKE_TOOLS].sort(), 'every tool the server lists');
  assert.ok(pick.tools.includes('add_issue_comment') && pick.tools.includes('issue_write'), 'the write tools are in the pick');
  // the pick is the check log's own list: what the press logged is what the job gets
  const logged = readFileSync(path.join(w.cfg, 'mcp-checks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).at(-1);
  assert.deepEqual(pick.tools, logged.tools.map((x) => x.name));
  // the pick itself calls no tool: the fake server logs every tools/call, and it logged none
  assert.equal(existsSync(path.join(w.base, 'calls.jsonl')), false);
});

test('signFlow: a plain pick writes NOTHING; an MCP pick writes flowType and the whole mcp block (a copy, the input untouched)', () => {
  const spec = { schema: 'job-v1', job: 'x' };
  assert.equal(signFlow(spec, 'plain', null), spec);
  assert.equal(signFlow(spec, 'plain', { server: 's', tools: ['a'] }), spec, 'plain ignores a stray pick');
  const pick = { server: 's', tools: ['a', 'b'] };
  const out = signFlow(spec, 'tickets', pick);
  assert.deepEqual(out, { schema: 'job-v1', job: 'x', flowType: 'tickets', mcp: { server: 's', tools: ['a', 'b'] } });
  assert.equal('flowType' in spec, false);
  out.mcp.tools.push('c');
  assert.deepEqual(pick.tools, ['a', 'b'], 'the pick is copied, never shared');
});
