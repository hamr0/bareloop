// MCP + tickets piece 3 (R6), the scheduler's ticket branch: a look every 15 minutes at $0, the first look is the starting point, new tickets queue oldest first in the job's ledger, a busy
// job keeps them waiting, a watched change arrives once, an unreadable list is never "0 new". Ported from fwd test/m12-p2-scheduler.test.js@v0.29.0. The REAL scheduler and the REAL look
// against the fake MCP server, a recording stub for the door, an injected clock (no real waits, no network, no model).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScheduler } from '../src/panel/scheduler.js';
import { readSeen, queueOf } from '../src/triggerfiles.js';
import { appendRow, readLedger } from '../src/triggerledger.js';
import { TICKET_LOOK_MS } from '../src/triggertickets.js';
import {
  ticketWorld, newestFirst, MIN, LIST,
} from './ticket-world.mjs';

const SIG = 'sig-1';

/** a scheduler over one ticket schedule; `fires` records what the door was asked to start */
function setup(t, { issues = newestFirst(5), env = {}, ticketWatch, busy = false, paused = false, tools = ['issue_read', 'list_issues'] } = {}) {
  const w = ticketWorld(t, { issues, env, prefix: 'bareloop-ticket-sched-' });
  const ledger = join(w.dir, 'ledger.jsonl');
  const spec = {
    flowType: 'tickets', mcp: { server: 'github', tools }, inputs: [{ n: 1, label: 'issues', value: LIST }], ...(ticketWatch ? { ticketWatch } : {}),
  };
  const schedule = { specHash: SIG, trigger: { kind: 'new-ticket', input: 'issues' }, spec };
  const clock = { t: 1_000_000 };
  const fires = [];
  const told = [];
  const state = { busy, paused };
  const door = {
    scan: () => [{ job: 'tk', schedule }],
    armFor() {},
    ledgerOf: () => ledger,
    paused: () => state.paused,
    busy: () => state.busy,
    tellOnce(job, sig, tag, why) { told.push(why); return true; },
    async fire(job, cause, hooks = {}) {
      if (hooks.busy) { fires.push({ busy: true, number: cause.number }); return { outcome: 'busy' }; }
      hooks.beforeSpawn?.();
      fires.push({ number: cause.number, kind: cause.kind, why: cause.why, sha: cause.sha });
      return { outcome: 'started' };
    },
  };
  const s = createScheduler({ door, now: () => clock.t, intervalMs: 0, mcpConfig: w.configPath });
  return {
    s, clock, fires, told, state, ledger, dir: w.dir, setList: w.setList,
    lookCalls: () => w.callsMade().length,
    /** one tick (a look may start), the look settles, a second tick takes the queue: what two ticks 500 ms apart do */
    async step(advanceMs = 0) { clock.t += advanceMs; await s.tick(); await s.settled(); await s.tick(); },
    rows: (kind) => readSeen(ledger, SIG).filter((r) => !kind || r.kind === kind),
  };
}

test('the first look is the starting point: baseline rows for the tickets on the list, nothing arrives, nothing runs', async (t) => {
  const f = setup(t);
  await f.step();
  assert.deepEqual(f.rows('baseline').map((r) => r.number).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.deepEqual(f.rows('arrived'), []);
  await f.step(1000);
  assert.deepEqual(f.fires, []);
});

test('a look every 15 minutes, no oftener: a tick before the time makes no call; the tick at 15 minutes looks', async (t) => {
  const f = setup(t);
  await f.step();
  const first = f.lookCalls();
  assert.equal(first, 1);
  await f.step(14 * MIN);
  assert.equal(f.lookCalls(), first, 'no look at 14 minutes');
  await f.step(MIN);
  assert.equal(f.lookCalls(), first + 1, 'a look at 15 minutes');
  assert.equal(TICKET_LOOK_MS, 15 * MIN);
});

test('looks never overlap: a second tick while a look is out starts no second look', async (t) => {
  const f = setup(t);
  await f.s.tick();
  await f.s.tick();
  await f.s.settled();
  assert.equal(f.lookCalls(), 1);
});

test('looks never overlap: a slow look still out when the next 15 minutes pass starts no second look', async (t) => {
  const w = ticketWorld(t);
  const ledger = join(w.dir, 'ledger.jsonl');
  let calls = 0; let release;
  const gate = new Promise((r) => { release = r; });
  const look = async () => { calls += 1; await gate; return { ok: true, first: true, found: [{ number: 1, state: 'open', labels: [] }], changed: [], pages: 1 }; };
  const schedule = { specHash: SIG, trigger: { kind: 'new-ticket', input: 'issues' }, spec: { flowType: 'tickets', mcp: { server: 'github', tools: ['list_issues'] }, inputs: [{ n: 1, label: 'issues', value: LIST }] } };
  const door = { scan: () => [{ job: 'tk', schedule }], armFor() {}, ledgerOf: () => ledger, paused: () => false, busy: () => false, tellOnce() {}, async fire() { return { outcome: 'started' }; } };
  const clock = { t: 1_000_000 };
  const s = createScheduler({ door, now: () => clock.t, intervalMs: 0, look });
  await s.tick();
  clock.t += 20 * MIN;
  await s.tick();
  assert.equal(calls, 1, 'the first look is still out');
  release();
  await s.settled();
  clock.t += 20 * MIN;
  await s.tick();
  await s.settled();
  assert.equal(calls, 2, 'once it has settled and 15 minutes have passed, the next look starts');
});

test('new tickets get one `arrived` row each and start oldest first, one at a time; each `ran` row is written before its start; a seen ticket never runs again', async (t) => {
  const f = setup(t);
  await f.step();
  f.setList(newestFirst(7));
  await f.step(15 * MIN);
  assert.deepEqual(f.rows('arrived').map((r) => r.number), [6, 7], 'oldest arrival first');
  assert.deepEqual(f.fires.map((x) => x.number), [6], 'the first start came on the tick after the look');
  assert.deepEqual(f.fires[0].kind, 'ticket');
  assert.deepEqual(f.rows('ran').map((r) => r.sha), ['ticket:6']);
  assert.deepEqual(queueOf(readSeen(f.ledger, SIG)).map((q) => q.number), [7]);
  await f.step(1000);
  assert.deepEqual(f.fires.map((x) => x.number), [6, 7]);
  await f.step(15 * MIN);
  await f.step(1000);
  assert.deepEqual(f.fires.map((x) => x.number), [6, 7], 'a seen ticket never runs again');
  assert.equal(f.rows('arrived').length, 2);
});

test('the arrival time is the scheduler clock, not the wall clock', async (t) => {
  const f = setup(t);
  await f.step();
  f.setList(newestFirst(6));
  await f.step(15 * MIN);
  assert.equal(f.rows('arrived')[0].at, 1_000_000 + 15 * MIN);
});

test('Must fail: a busy job starts nothing; the ticket stays queued and is taken once the job is free', async (t) => {
  const f = setup(t, { busy: true });
  await f.step();
  f.setList(newestFirst(6));
  await f.step(15 * MIN);
  assert.deepEqual(f.fires, [{ busy: true, number: 6 }]);
  assert.deepEqual(f.rows('ran'), [], 'no ran row while busy');
  f.state.busy = false;
  await f.step(1000);
  assert.deepEqual(f.fires.at(-1).number, 6);
  assert.equal(f.rows('ran').length, 1);
});

test('a schedule that gave up (paused) still looks and queues, but starts nothing', async (t) => {
  const f = setup(t, { paused: true });
  await f.step();
  f.setList(newestFirst(6));
  await f.step(15 * MIN);
  assert.deepEqual(f.rows('arrived').map((r) => r.number), [6]);
  assert.deepEqual(f.fires, []);
  f.state.paused = false;
  await f.step(1000);
  assert.deepEqual(f.fires.map((x) => x.number), [6]);
});

test('Must fail: an unreadable list reads as "0 new"; it is an `unreadable` row with its cause, starts nothing, and a first look that failed is tried again as a first look', async (t) => {
  const f = setup(t, { env: { FAKE_REPLY: 'device' } });
  await f.step();
  const u = f.rows('unreadable');
  assert.equal(u.length, 1);
  assert.equal(u[0].why, 'GitHub token unavailable — is pass locked?');
  assert.deepEqual(f.rows('baseline'), [], 'no starting point from an unreadable list');
  await f.step(15 * MIN);
  assert.equal(f.rows('unreadable').length, 2);
  assert.deepEqual(f.fires, []);
});

test('Must fail: a later unreadable look neither arrives nor loses the seen list', async (t) => {
  const f = setup(t);
  await f.step();
  f.setList([]);
  await f.step(15 * MIN);
  assert.match(f.rows('unreadable')[0].why, /came back empty/);
  f.setList(newestFirst(6));
  await f.step(15 * MIN);
  assert.deepEqual(f.rows('arrived').map((r) => r.number), [6], 'the starting point survived the bad look');
});

test('watched state: a change arrives once with its reason and runs once; an unwatched edit arrives nothing; the same value later arrives nothing', async (t) => {
  const f = setup(t, { ticketWatch: ['state'] });
  await f.step();
  f.setList(newestFirst(5).map((i) => (i.number === 3 ? { ...i, state: 'CLOSED' } : i.number === 4 ? { ...i, title: 'edited' } : i)));
  await f.step(15 * MIN);
  assert.deepEqual(f.rows('arrived').map((r) => [r.number, r.reason]), [[3, 'state open→closed']]);
  assert.deepEqual(f.fires.map((x) => [x.number, x.why]), [[3, 'state open→closed']]);
  await f.step(15 * MIN);
  await f.step(1000);
  assert.equal(f.rows('arrived').length, 1, 'the same value again is no change');
  assert.equal(f.fires.length, 1);
});

test('Must fail: with NO watched field, a ticket closing arrives nothing (the signed job names what to watch)', async (t) => {
  const f = setup(t);
  await f.step();
  f.setList(newestFirst(5).map((i) => (i.number === 3 ? { ...i, state: 'CLOSED' } : i)));
  await f.step(15 * MIN);
  assert.deepEqual(f.rows('arrived'), []);
  assert.deepEqual(f.fires, []);
});

test('watched change on a ticket still queued behind a busy run: ONE queued run, not two; a later change after it started arrives once', async (t) => {
  const f = setup(t, { ticketWatch: ['state'], busy: true });
  const flip = (st) => f.setList(newestFirst(5).map((i) => (i.number === 3 ? { ...i, state: st } : i)));
  await f.step();
  flip('CLOSED');
  await f.step(15 * MIN);
  assert.equal(queueOf(readSeen(f.ledger, SIG)).length, 1, 'ticket 3 is queued behind the busy run');
  flip('OPEN');
  await f.step(15 * MIN);
  assert.equal(f.rows('arrived').length, 1, 'a second change on a queued ticket queues nothing');
  f.state.busy = false;
  await f.step(1000);
  assert.deepEqual(f.fires.filter((x) => !x.busy).map((x) => x.number), [3], 'exactly one run');
  await f.step(15 * MIN);
  await f.step(1000);
  assert.equal(f.rows('arrived').length, 1, 'the skipped change does not re-fire once the run started');
  flip('CLOSED');
  await f.step(15 * MIN);
  await f.step(1000);
  assert.equal(f.rows('arrived').length, 2, 'a later change arrives once');
  assert.deepEqual(f.fires.filter((x) => !x.busy).map((x) => x.number), [3, 3]);
});

test('a schedule whose signed tools lack list_issues cannot look: ONE refusal in words, no look, no row', async (t) => {
  const f = setup(t, { tools: ['issue_read'] });
  await f.step();
  await f.step(15 * MIN);
  assert.equal(f.lookCalls(), 0);
  assert.equal(f.told.length >= 1, true);
  assert.match(f.told[0], /do not include list_issues/);
  assert.deepEqual(f.rows(), []);
});

test('9.3, Must fail: a look whose result cannot be saved (the ledger cannot be written) leaves the scheduler up; the next look is tried and the failure is told once the ledger takes a row again', async (t) => {
  const f = setup(t);
  assert.notEqual(process.getuid?.(), 0, 'a read-only folder does not stop root');
  chmodSync(f.dir, 0o500); // the ledger can be read (no file yet) but not written: the save after the look throws
  try {
    await f.s.tick();
    await assert.doesNotReject(f.s.settled(), 'the look settles; a failed save is not an unhandled rejection');
  } finally { chmodSync(f.dir, 0o700); }
  assert.equal(existsSync(f.ledger), false, 'nothing was saved');
  await f.step(15 * MIN);
  assert.equal(f.rows('baseline').length, 5, 'the next look is a first look again and saves');
  assert.ok(f.told.some((w) => /ticket look: its result could not be saved/.test(w)), 'told once the ledger could take a row');
});

test('every row of a ticket schedule carries the signing', async (t) => {
  const f = setup(t);
  await f.step();
  f.setList(newestFirst(6));
  await f.step(15 * MIN);
  assert.ok(readLedger(f.ledger).rows.every((r) => r.sig === SIG), readFileSync(f.ledger, 'utf8'));
});

test('R7: the first look cuts at the NEWEST armed row of the signing (a schedule signed with the same job again carries its own ticket number, not the old one)', async (t) => {
  const f = setup(t, { issues: newestFirst(5) });
  appendRow(f.ledger, { kind: 'armed', sig: SIG, at: 1, ticketN: 2 });
  appendRow(f.ledger, { kind: 'armed', sig: SIG, at: 2, ticketN: 5 });
  f.setList(newestFirst(7));
  await f.step();
  assert.deepEqual(f.rows('baseline').map((r) => r.number).sort((a, b) => a - b), [1, 2, 3, 4, 5], 'baselined up to the newest cut');
  assert.deepEqual(f.rows('arrived').map((r) => r.number), [6, 7]);
});
