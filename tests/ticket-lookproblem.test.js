// R9 9b.3 (fwd 96f10d6, m13-p7-look-card): a ticket look that could not read (pass locked: GitHub's device-login text) shows on the Run tab as ONE red line naming the cause, never as a
// quiet "waiting for a new ticket"; the next look that reads clears it. Real door, real HTTP detail, real ledger rows written by the real `recordLook`; injected clock. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookProblemWords, scheduledNextFor } from '../src/schedulewords.js';
import { recordLook, lookTickets } from '../src/triggertickets.js';
import { ticketWorld, LIST, MCP, MIN } from './ticket-world.mjs';
import { clock, keysHome, makeRun, panel, specOf, SLOT } from './trigger-world.mjs';

const WHEN = { kind: 'new-ticket', input: 'issues' };

async function world(t) {
  const home = keysHome();
  const spec = { ...specOf({ files: true }), inputs: [{ n: 1, label: 'issues', value: LIST }], flowType: 'tickets', mcp: { server: 'github', tools: ['issue_read', 'list_issues'] } };
  makeRun(home, { runid: 'r1', spec, accepted: true });
  const now = clock(SLOT - 3600_000);
  const p = await panel({ home, now });
  const body = { runid: 'r1', when: WHEN, inputs: `issues: ${LIST}`, destination: '/tw/out', capUsd: 1.5, maxWallMs: 600000 };
  const pre = await p.post('/api/author/schedule-prepare', body);
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  assert.equal((await p.post('/api/author/schedule', { ...body, hash: pre.body.hash })).status, 200);
  now.set(SLOT + 60_000);
  const mcp = ticketWorld(t, { env: { FAKE_REPLY: 'device' } });
  const ledger = join(home, 'triggers', 'sched-job', 'ledger.jsonl');
  const detail = async () => (await p.get('/api/runs/r1')).body;
  const sig = JSON.parse(readFileSync(join(home, 'triggers', 'sched-job', 'schedule.json'), 'utf8')).specHash;
  const look = (cfg, first) => lookTickets({ listUrl: LIST, mcp: MCP, configPath: cfg, seen: first ? null : new Set(), last: new Map(), watch: [], perPage: 10 });
  return { p, now, mcp, ledger, sig, detail, look, home };
}

test('Must fail: an unreadable look shows ONE red line with its cause on the Run tab; a later look that reads clears it', async (t) => {
  const w = await world(t);
  const quiet = await w.detail();
  assert.equal(quiet.schedule.nextRed, false, 'nothing wrong before any look');
  assert.doesNotMatch(quiet.schedule.line2, /could not read/);
  const bad = await w.look(w.mcp.configPath, true);
  assert.equal(bad.ok, false);
  recordLook(w.ledger, w.sig, bad, w.now() - 5 * MIN);
  const d = await w.detail();
  assert.equal(d.schedule.problem, true, 'the SCHEDULE row is red');
  assert.equal(d.schedule.nextRed, true);
  assert.match(d.schedule.next, /^The last look could not read the tickets: .*It looks again in 15 minutes\.$/);
  assert.match(d.schedule.line2, /last look .* · could not read the tickets: .*It looks again in 15 minutes\.$/);
  assert.equal((d.schedule.line2.match(/could not read the tickets/g) ?? []).length, 1, 'one line, said once');
  assert.doesNotMatch(d.schedule.line2, /waiting for a new ticket/, 'never the quiet waiting line');
  // the pass is unlocked: the next look reads (nothing new), one `looked` row ends the problem
  const w2 = ticketWorld(t, {});
  const good = await w.look(w2.configPath, true);
  assert.equal(good.ok, true);
  recordLook(w.ledger, w.sig, good, w.now());
  const after = await w.detail();
  assert.equal(after.schedule.problem, false);
  assert.equal(after.schedule.nextRed, false);
  assert.match(after.schedule.line2, /next: waiting for a new ticket/);
});

test('the words come from one function: the cause with its full stop trimmed, then the cadence', () => {
  assert.equal(lookProblemWords({ at: 1, why: 'the server wants a login.' }), 'could not read the tickets: the server wants a login. It looks again in 15 minutes.');
  assert.equal(lookProblemWords({ at: 1, why: 'is pass locked?' }), 'could not read the tickets: is pass locked? It looks again in 15 minutes.', 'no "?." after a question');
  const n = scheduledNextFor({ trigger: WHEN, armed: true, nextSlotMs: null, lastOutcome: null, waitingRunNo: null, now: 0, lookProblem: { at: 1, why: 'x' } });
  assert.deepEqual(n, { text: 'The last look could not read the tickets: x. It looks again in 15 minutes.', red: true });
  const ok = scheduledNextFor({ trigger: WHEN, armed: true, nextSlotMs: null, lastOutcome: null, waitingRunNo: null, now: 0 });
  assert.equal(ok.red, false);
});
