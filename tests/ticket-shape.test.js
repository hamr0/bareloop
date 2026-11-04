// MCP + tickets piece 1b: ONE ticket shape whatever the source (an MCP reply or a page read with barebrowse). Fixtures: the real saved page texts under
// tests/fixtures (page-partial.txt) and an MCP reply from the fake server. Also borrowed-from: fwdloop src/ticket-shape.js@9650320 (the list address + number rules).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { parseTicketList, isTicketNumber, TICKET_MAX, WATCHABLE, ticketListsOf } from '../src/ticketshape.js';
import { readTicket, ticketFromPage, ticketFromMcp, maskTicketText, PAGE_TICKET_LIMIT_WORDS } from '../src/ticket.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, 'fixtures', 'fake-mcp-server.mjs');
const LIST = 'https://github.com/flutter/flutter/issues';
const TOKEN = `ghp_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`;
const KEYS = ['source', 'url', 'number', 'title', 'state', 'labels', 'text', 'sha256', 'bytes', 'masked', 'record'].sort();

describe('the list address and the ticket number', () => {
  test('parseTicketList reads owner/repo issues pages only; ticketUrl appends the number', () => {
    const r = parseTicketList('https://github.com/a/b/issues/');
    assert.equal(r.ok, true);
    assert.deepEqual([r.owner, r.repo, r.ticketUrl(7)], ['a', 'b', 'https://github.com/a/b/issues/7']);
    for (const bad of ['https://github.com/a/b', 'https://github.com/a/b/pulls', 'http://github.com/a/b/issues', 'https://x.com/a/b/issues']) assert.equal(parseTicketList(bad).ok, false, bad);
  });
  test('isTicketNumber: 1 to TICKET_MAX whole numbers', () => {
    for (const ok of [1, 42, TICKET_MAX]) assert.equal(isTicketNumber(ok), true);
    for (const bad of [0, -1, 1.5, TICKET_MAX + 1, '7', null, NaN]) assert.equal(isTicketNumber(bad), false);
    assert.deepEqual([...WATCHABLE], ['state', 'labels']);
  });
  test('ticketListsOf finds the page inputs that have the list shape', () => {
    assert.deepEqual(ticketListsOf({ sources: [{ role: 'issues', kind: 'page', path: LIST }, { role: 'x', kind: 'page', path: 'https://example.com' }] }), { issues: LIST });
  });
});

describe('both sources produce the same shape', () => {
  const page = () => ticketFromPage(readFileSync(path.join(HERE, 'fixtures', 'page-partial.txt'), 'utf8'), `${LIST}/100047`);
  const mcp = () => ticketFromMcp('{"number":100047,"title":"Crash on tap","state":"OPEN","body":"Tap the back arrow","labels":[{"name":"P2"},"bug"]}', `${LIST}/100047`, 100047, { server: 'github', exposed: ['github_issue_read'], missing: [], calls: [] });
  test('the same keys; the sha is of the frozen (masked) bytes; bytes is its length', () => {
    for (const t of [page(), mcp()]) {
      assert.deepEqual(Object.keys(t).sort(), KEYS);
      assert.equal(t.sha256, createHash('sha256').update(t.text).digest('hex'));
      assert.equal(t.bytes, Buffer.byteLength(t.text));
    }
  });
  test('an MCP ticket reads number, title, state and labels from the reply', () => {
    const t = mcp();
    assert.deepEqual([t.source, t.number, t.title, t.state, t.labels], ['mcp', 100047, 'Crash on tap', 'open', ['P2', 'bug']]);
    assert.equal(t.record.server, 'github');
  });
  test('a page ticket is weaker, said so: number from the address, labels null, state unknown unless the text says Closed, no MCP record', () => {
    const t = page();
    assert.deepEqual([t.source, t.number, t.labels, t.record], ['page', 100047, null, null]);
    assert.ok(['unknown', 'closed'].includes(t.state));
    assert.equal(ticketFromPage('# Fix thing\nbody\nClosed', `${LIST}/9`).state, 'closed');
    assert.equal(ticketFromPage('# Fix thing\nbody', `${LIST}/9`).state, 'unknown');
    assert.equal(ticketFromPage('# Fix thing', `${LIST}/9`).title, 'Fix thing');
    assert.match(PAGE_TICKET_LIMIT_WORDS, /labels and state may be missing/);
  });
  test('a page address with no ticket number has number null (the grid row reads #?); a pull address has its number', () => {
    assert.equal(ticketFromPage('x', LIST).number, null);
    assert.equal(ticketFromPage('x', 'https://github.com/a/b/pull/12').number, 12);
    assert.equal(ticketFromPage('x', 'https://github.com/a/b/issues/0').number, null);
  });
  test('an MCP reply that is not JSON keeps its text: first line is the title, state unknown, labels null', () => {
    const t = ticketFromMcp('Crash on tap\nsecond line', `${LIST}/1`, 1, null);
    assert.deepEqual([t.title, t.state, t.labels], ['Crash on tap', 'unknown', null]);
  });
});

describe('masking: a secret shape in a ticket is masked before the sha, never refused, on both sources', () => {
  test('maskTicketText counts shapes (names no value) and the sha is of the masked bytes', () => {
    const m = maskTicketText(`token ${TOKEN} and ${TOKEN}`);
    assert.equal(m.masked, 2);
    assert.ok(!m.text.includes(TOKEN));
    assert.equal(m.sha256, createHash('sha256').update(m.text).digest('hex'));
    assert.notEqual(m.sha256, createHash('sha256').update(`token ${TOKEN} and ${TOKEN}`).digest('hex'));
    assert.equal(maskTicketText('clean').masked, 0);
  });
  test('MCP: a ghp_ token in the body and the title never survives into text, title, labels or record', () => {
    const t = ticketFromMcp(JSON.stringify({ number: 3, title: `leak ${TOKEN}`, state: 'open', body: `x ${TOKEN}`, labels: [{ name: TOKEN }] }), `${LIST}/3`, 3, null);
    assert.equal(t.masked >= 1, true);
    assert.ok(!JSON.stringify(t).includes(TOKEN));
  });
  test('page: the same', () => {
    const t = ticketFromPage(`# leak ${TOKEN}\nbody ${TOKEN}`, `${LIST}/3`);
    assert.ok(!JSON.stringify(t).includes(TOKEN));
    assert.equal(t.masked, 2);
  });
});

describe('readTicket dispatches on the input', () => {
  test('an MCP-backed row goes through the MCP reader (fake server) and comes back as a ticket; the planted token is masked', async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bareloop-ticket-shape-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const configPath = path.join(dir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_PLANT: TOKEN } } } }));
    const r = await readTicket({ mcp: { server: 'github', tools: ['issue_read'] }, listUrl: LIST, number: 100047 }, { configPath });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.deepEqual([r.ticket.source, r.ticket.number, r.ticket.title, r.ticket.state, r.ticket.labels], ['mcp', 100047, 'Crash on tap', 'open', ['P2']]);
    assert.equal(r.ticket.masked, 1);
    assert.ok(!r.ticket.text.includes(TOKEN));
    assert.match(r.ticket.text, /Tap the back arrow/);
  });
  test('an MCP refusal comes back as the reader\'s own words', async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bareloop-ticket-shape-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const configPath = path.join(dir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_REPLY: 'device' } } } }));
    const r = await readTicket({ mcp: { server: 'github', tools: ['issue_read'] }, listUrl: LIST, number: 1 }, { configPath });
    assert.deepEqual([r.ok, r.error], [false, 'GitHub token unavailable — the server asked for a login (is pass locked?)']);
  });
  test('a page row goes through the page reader (injected) and comes back as a ticket of the same shape', async () => {
    const r = await readTicket({ url: `${LIST}/55` }, { fetchPage: async (u) => ({ ok: true, text: '# Title here\nbody', url: u }) });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.ticket).sort(), KEYS);
    assert.deepEqual([r.ticket.source, r.ticket.number, r.ticket.title], ['page', 55, 'Title here']);
    const bad = await readTicket({ url: `${LIST}/55` }, { fetchPage: async () => ({ ok: false, error: 'blocked' }) });
    assert.deepEqual([bad.ok, bad.error], [false, 'blocked']);
  });
});
