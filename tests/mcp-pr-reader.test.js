// MCP PR reader (ITEM33-BUILD piece 1a "PR-verification job", for piece 12): a PULLS list row is read with `pull_request_read {method:'get', owner, repo, pullNumber}`.
// A real bare-agent bridge against the fake stdio server, whose pull reply carries the keys of the REAL GitHub server's (measured 2026-11-04). No network, no model.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTicketMcp, PR_READ_TOOL } from '../src/ticketmcp.js';
import { readTicket, prRecordOfTicket } from '../src/ticket.js';
import { prHeadSha, prBaseOf } from '../src/prcheckout.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, 'fixtures', 'fake-mcp-server.mjs');
const PULLS = 'https://github.com/hamr0/hol-guard/pulls';
const MCP = { server: 'github', tools: ['pull_request_read'] };
const HEAD = '70f268580123456789abcdef0123456789abcdef';
const TOKEN = `ghp_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`;

function world(t, { env = {}, tools = undefined } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bareloop-mcp-pr-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = path.join(dir, 'calls.jsonl');
  const configPath = path.join(dir, 'mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_CALLS: calls, FAKE_PR_HEAD: HEAD, ...(tools ? { FAKE_TOOLS: JSON.stringify(tools) } : {}), ...env } } } }));
  const callsMade = () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { configPath, callsMade };
}

describe('readTicketMcp on a pulls list', () => {
  test('pull_request_read {method get, owner, repo, pullNumber}; the url is the /pull/<n> address; the record names the call', async (t) => {
    const w = world(t);
    const r = await readTicketMcp({ listUrl: PULLS, number: 12, mcp: MCP, configPath: w.configPath });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.equal(r.url, 'https://github.com/hamr0/hol-guard/pull/12');
    assert.deepEqual(r.record, { server: 'github', exposed: ['github_pull_request_read'], missing: [], calls: [{ tool: PR_READ_TOOL, owner: 'hamr0', repo: 'hol-guard', method: 'get', pullNumber: 12 }] });
    assert.deepEqual(w.callsMade(), [{ name: 'pull_request_read', arguments: { method: 'get', owner: 'hamr0', repo: 'hol-guard', pullNumber: 12 } }]);
  });
  test('only pull_request_read exists for the run, though the job lists more and the server offers issue_read too', async (t) => {
    const w = world(t);
    const r = await readTicketMcp({ listUrl: PULLS, number: 12, mcp: { server: 'github', tools: ['pull_request_read', 'issue_read'] }, configPath: w.configPath });
    assert.deepEqual(r.record.exposed, ['github_pull_request_read']);
  });
  test('a job that did not sign pull_request_read, or a server that does not offer it, is refused in plain words naming it', async (t) => {
    const w = world(t);
    const unsigned = await readTicketMcp({ listUrl: PULLS, number: 12, mcp: { server: 'github', tools: ['issue_read'] }, configPath: w.configPath });
    assert.equal(unsigned.ok, false);
    assert.match(unsigned.error, /does not list pull_request_read, the tool that reads a pull request/);
    const w2 = world(t, { tools: [{ name: 'issue_read', annotations: { readOnlyHint: true } }] });
    const missing = await readTicketMcp({ listUrl: PULLS, number: 12, mcp: MCP, configPath: w2.configPath });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /github does not offer pull_request_read \(its GitHub server needs the pull_requests toolset enabled\)/);
    assert.deepEqual(w2.callsMade(), []);
  });
  test('an issues list still calls issue_read (the PR tool does not leak into the issue path)', async (t) => {
    const w = world(t);
    const r = await readTicketMcp({ listUrl: 'https://github.com/a/b/issues', number: 3, mcp: { server: 'github', tools: ['issue_read', 'pull_request_read'] }, configPath: w.configPath });
    assert.equal(r.ok, true);
    assert.deepEqual(w.callsMade().map((c) => c.name), ['issue_read']);
  });
});

describe('readTicket: the frozen PR, masked, with a head the checkout reads', () => {
  test('state/labels/title come from the reply; the record keeps head.sha and base {ref, sha} whole through the masking', async (t) => {
    const w = world(t, { env: { FAKE_PLANT: TOKEN, FAKE_PR_BASE: 'c'.repeat(40) } });
    const r = await readTicket({ mcp: MCP, listUrl: PULLS, number: 12 }, { configPath: w.configPath });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    const k = r.ticket;
    assert.deepEqual([k.number, k.title, k.state, k.labels, k.url], [12, 'Bump the thing', 'open', ['dependencies'], 'https://github.com/hamr0/hol-guard/pull/12']);
    assert.equal(k.masked, 1);
    assert.equal(k.text.includes(TOKEN), false, 'the token is masked in the frozen text');
    const rec = prRecordOfTicket(k);
    assert.equal(prHeadSha(rec), HEAD, 'a sha is not a secret shape: masking leaves it whole');
    assert.deepEqual(prBaseOf(rec), { ref: 'main', sha: 'c'.repeat(40) });
    assert.equal(JSON.stringify(rec).includes(TOKEN), false, 'the record is parsed from the masked bytes');
  });
  test('a reply with no head: the record has no head (the checkout refuses with "no code to fetch")', async (t) => {
    const w = world(t, { env: { FAKE_PR_NOHEAD: '1' } });
    const r = await readTicket({ mcp: MCP, listUrl: PULLS, number: 12 }, { configPath: w.configPath });
    assert.equal(r.ok, true);
    assert.equal(prHeadSha(prRecordOfTicket(r.ticket)), null);
  });
});
