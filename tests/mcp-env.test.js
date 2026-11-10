// borrowed-from: fwdloop test/m13-p1-mcp-env.test.js@44f0e2a (re-shaped: fwd's ticket look is bareloop's step worker; the ticket reader is the same readTicketMcp)
// M13 item 9.5 / R2c: an MCP gets only its own settings plus what it needs to start, never your provider keys. Real bare-agent bridge, a fake stdio server that
// records its env NAMES (never values), a canary `*_KEY` name in the parent env. Both places bareloop starts an MCP are checked: the ticket reader and a plan
// step's worker (MCP_PASS_ENV, cwd = the home folder).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path, { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTicketMcp, MCP_PASS_ENV, mcpStartOpts } from '../src/ticketmcp.js';
import { startStepMcp } from '../src/stepmcp.js';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'env-names-mcp-server.mjs');
const LIST = 'https://github.com/flutter/flutter/issues';
const CANARY = 'BARELOOP_R2C_CANARY_KEY';

/** runs `fn(configPath)` with the canary in the parent env; returns the env names the fake server saw */
async function namesSeen(t, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-r2c-env-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'names.json');
  const configPath = join(dir, 'mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { ENV_NAMES_OUT: out, OWN_SETTING: 'x' } } } }));
  process.env[CANARY] = 'canary-not-a-key';
  try { await fn(configPath); } finally { delete process.env[CANARY]; }
  return JSON.parse(readFileSync(out, 'utf8'));
}

const check = (names) => {
  assert.equal(names.includes(CANARY), false, 'a parent *_KEY name reached the MCP');
  for (const n of ['PATH', 'HOME', 'OWN_SETTING']) assert.equal(names.includes(n), true, `${n} must reach the MCP`);
};

test('the one list is PATH and HOME, and the one start option set carries it with the home folder as cwd', () => {
  assert.deepEqual(MCP_PASS_ENV, ['PATH', 'HOME']);
  assert.deepEqual(mcpStartOpts(), { passEnv: ['PATH', 'HOME'], cwd: homedir() });
});

test('ticket reader: no parent *_KEY reaches the MCP; PATH, HOME and its own env do', async (t) => {
  check(await namesSeen(t, (configPath) => readTicketMcp({ listUrl: LIST, number: 1, mcp: { server: 'github', tools: ['issue_read'] }, configPath })));
});

test('step worker: no parent *_KEY reaches the MCP; PATH, HOME and its own env do', async (t) => {
  check(await namesSeen(t, async (configPath) => {
    const run = await startStepMcp({ mcp: { server: 'github', tools: ['issue_read'] }, mcpTools: ['issue_read'], configPath });
    await run.close();
  }));
});

test('should-differ pair: the same step start with the pass list removed DOES leak the canary (so the check above can fail)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-r2c-env-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'names.json');
  const configPath = join(dir, 'mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { ENV_NAMES_OUT: out } } } }));
  const { createMCPBridge } = await import('bare-agent/mcp');
  process.env[CANARY] = 'canary-not-a-key';
  let bridge;
  try { bridge = await createMCPBridge({ configPaths: [configPath], confirmServer: () => true, allow: { github: ['issue_read'] } }); } finally { delete process.env[CANARY]; }
  await bridge.close();
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).includes(CANARY), true, 'with no passEnv the canary reaches the server: the instrument can see a leak');
});
