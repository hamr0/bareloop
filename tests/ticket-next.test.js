// MCP + tickets piece 8 (R6): a by-hand run of a Tickets job that names no ticket takes the NEWEST UNRUN ticket (fwd newestUnrunTicket, ported). The pick itself ($0, the real look against the
// fake MCP server), then through the REAL run start (`run-u` with no --ticket): the run is listed with the ticket it read, a typed number still wins, and "nothing new" ends at $0.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newestUnrunTicket, ranTicketNumbers } from '../src/ticketnext.js';
import { ticketWorld, newestFirst, issue, LIST } from './ticket-world.mjs';

const MCP = { server: 'github', tools: ['issue_read', 'list_issues'] };
const INPUTS = [{ n: 1, label: 'issues', value: LIST }];
const rowsOf = (...nums) => nums.map((n, i) => ({ runid: `r${i}`, job: 'tk', ticket: n }));
const pick = (w, over = {}) => newestUnrunTicket({ job: 'tk', rows: [], inputs: INPUTS, mcp: MCP, configPath: w.configPath, ...over });

describe('the pick', () => {
  test('a job with no ticket run yet takes the newest open ticket of the first page', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(25) });
    assert.deepEqual(await pick(w), { ok: true, number: 25 });
    assert.deepEqual(w.callsMade().map((c) => c.name), ['list_issues'], 'a $0 look, nothing else');
  });
  test('a job that ran #20 takes the newest above it; a number it ran is never picked again', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(23) });
    assert.deepEqual(await pick(w, { rows: rowsOf(20) }), { ok: true, number: 23 });
    assert.deepEqual(await pick(w, { rows: rowsOf(20, 23) }), { ok: false, nothingNew: true, say: 'No new ticket since #23. Nothing to run.' });
  });
  test('only THIS job\'s runs count: another job\'s ticket number is not "run" here', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(5) });
    const rows = [{ runid: 'x', job: 'other', ticket: 5 }, { runid: 'y', job: 'tk' }];
    assert.deepEqual([...ranTicketNumbers(rows, 'tk')], []);
    assert.deepEqual(await pick(w, { rows }), { ok: true, number: 5 });
  });
  test('9.6: numbers compare as numbers (#10 is newer than #9)', async (t) => {
    const w = ticketWorld(t, { issues: [issue(10), issue(9), issue(8)] });
    assert.deepEqual(await pick(w, { rows: rowsOf(9) }), { ok: true, number: 10 });
  });
  test('Must fail: an empty list says so; an unreadable list says its cause and the way out; neither is a ticket', async (t) => {
    const empty = ticketWorld(t, { issues: [] });
    const a = await pick(empty);
    assert.equal(a.ok, false);
    assert.match(a.say, /came back empty/);
    assert.doesNotMatch(a.say, /Type the ticket number/, 'the Ticket box is gone: no words point at it (R7b 6)');
    assert.match(a.say, /start the job again\.$/);
    const dev = ticketWorld(t, { env: { FAKE_REPLY: 'device' } });
    const b = await pick(dev);
    assert.equal(b.ok, false);
    assert.match(b.say, /GitHub token unavailable/);
    assert.match(b.say, /^The newest ticket could not be looked up\. The reason: /, 'it names that the newest-ticket look failed, then the cause');
    assert.doesNotMatch(b.say, /\?\./, 'no doubled ?. (fwd flags it as a nit)');
    assert.doesNotMatch(b.say, /Type the ticket number/);
  });
  test('Must fail: the signed tools lack list_issues, or the job reads a pulls list -> plain words, no look', async (t) => {
    const w = ticketWorld(t);
    const a = await pick(w, { mcp: { server: 'github', tools: ['issue_read'] } });
    assert.match(a.say, /do not include list_issues/);
    const b = await pick(w, { inputs: [{ n: 1, label: 'prs', value: 'https://github.com/flutter/flutter/pulls' }] });
    assert.match(b.say, /only be found on an issues list/);
    assert.deepEqual(w.callsMade(), []);
  });
});
