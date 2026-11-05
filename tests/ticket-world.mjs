// Shared fixture for the R6 ticket-look suites (ITEM33-BUILD piece 3). NOT named test-*.mjs (node's glob). A scratch dir holding a fake GitHub MCP config (the real
// bare-agent bridge against tests/fixtures/fake-mcp-server.mjs, FAKE_LIST = the issues the "server" lists, FAKE_CALLS = every call it got), an injectable list, no network, no model.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

export const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-mcp-server.mjs');
export const LIST = 'https://github.com/flutter/flutter/issues';
export const MCP = { server: 'github', tool: 'list_issues' };
export const MIN = 60_000;
export const issue = (number, extra = {}) => ({ number, state: 'OPEN', labels: [], created_at: `2026-10-${String(10 + (number % 18)).padStart(2, '0')}T00:00:00Z`, ...extra });
/** newest first: numbers n, n-1, ... 1 */
export const newestFirst = (n) => Array.from({ length: n }, (_, i) => issue(n - i));

/** @param {import('node:test').TestContext|null} t a context to clean up with, or null (a `test.after` cleans) */
export function ticketWorld(t, { env = {}, issues = newestFirst(25), prefix = 'bareloop-ticket-' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const clean = () => rmSync(dir, { recursive: true, force: true });
  if (t) t.after(clean); else test.after(clean);
  const calls = join(dir, 'calls.jsonl');
  const listFile = join(dir, 'list.json');
  const configPath = join(dir, 'mcp.json');
  writeFileSync(listFile, JSON.stringify(issues));
  writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_CALLS: calls, FAKE_LIST: listFile, ...env } } } }));
  return {
    dir,
    configPath,
    setList: (l) => writeFileSync(listFile, JSON.stringify(l)),
    callsMade: () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []),
  };
}
