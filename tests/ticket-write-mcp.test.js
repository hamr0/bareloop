// The planted-ticket fixture (tests/fixtures/ticket-write-mcp.mjs, ITEM33-BUILD Part C): started through bare-agent's real bridge (startStepMcp), every tool of the fixture logs exactly one
// line to CALLS_FILE, and no tool touches anything but that file. This is the instrument of the injection test, so the test pins its exact line counts and names.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStepMcp } from '../src/stepmcp.js';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ticket-write-mcp.mjs');
const TOOLS = ['issue_read', 'list_issues', 'add_issue_comment', 'issue_write'];
const TICKET = { number: 1, title: 'Crash on tap', state: 'open', body: 'Tap the back arrow.', labels: [{ name: 'P2' }] };

function world(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bareloop-ticket-write-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = path.join(dir, 'calls.jsonl'), ticket = path.join(dir, 'ticket.json'), configPath = path.join(dir, 'mcp.json');
  writeFileSync(ticket, JSON.stringify(TICKET));
  writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { TICKET_FILE: ticket, CALLS_FILE: calls } } } }));
  const logged = () => (existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { configPath, logged };
}

test('each of the four tools appends exactly one line to CALLS_FILE, in call order, with its name and arguments', async (t) => {
  const w = world(t);
  const run = await startStepMcp({ mcp: { server: 'github', tools: TOOLS }, mcpTools: TOOLS, configPath: w.configPath });
  t.after(() => run.close());
  assert.deepEqual(run.names, TOOLS.map((n) => `github_${n}`));
  assert.deepEqual(w.logged(), [], 'starting the server and listing its tools logs nothing');
  const call = (n, args) => run.tools.find((x) => x.name === `github_${n}`).execute(args, {});
  const args = {
    issue_read: { method: 'get', owner: 'o', repo: 'r', issue_number: 1 },
    list_issues: { owner: 'o', repo: 'r' },
    add_issue_comment: { owner: 'o', repo: 'r', issue_number: 1, body: 'PWNED-x' },
    issue_write: { method: 'update', owner: 'o', repo: 'r', issue_number: 1, state: 'closed' },
  };
  for (const [i, n] of TOOLS.entries()) {
    await call(n, args[n]);
    const l = w.logged();
    assert.equal(l.length, i + 1, `${n}: exactly one new line`);
    assert.equal(l[i].name, n);
    assert.deepEqual(l[i].arguments, args[n]);
    assert.equal(typeof l[i].ts, 'number');
  }
  assert.equal(w.logged().length, 4);
});

test('issue_read answers with the ticket file as written, and a changed file is re-read', async (t) => {
  const w = world(t);
  const run = await startStepMcp({ mcp: { server: 'github', tools: ['issue_read'] }, mcpTools: ['issue_read'], configPath: w.configPath });
  t.after(() => run.close());
  const read = () => run.tools[0].execute({ method: 'get', owner: 'o', repo: 'r', issue_number: 1 }, {});
  assert.match(JSON.stringify(await read()), /Crash on tap/);
  writeFileSync(JSON.parse(readFileSync(w.configPath, 'utf8')).mcpServers.github.env.TICKET_FILE, JSON.stringify({ ...TICKET, title: 'Changed title' }));
  assert.match(JSON.stringify(await read()), /Changed title/);
  assert.equal(w.logged().length, 2);
});

test('without TICKET_FILE and CALLS_FILE the fixture exits at once (a bare import under node --test does not hang)', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [FAKE], { env: { PATH: process.env.PATH }, timeout: 5000 });
  assert.equal(r.status, 0);
});
