// ITEM33-BUILD piece 9, am3 (R7 side): "Run it anyway" on a ticket while the job's ticket schedule is still OFF (signed with the job, waiting for its first green run) starts that ticket's
// run at once, by hand, with the job's normal cap, through the real starter and the real session factory (the model boundary stubbed): `run-u --ticket N --anyway`, no review door, no
// `trigger.json`, no ledger row. A skipped run never arms the schedule; a green one does. Once armed, the queue takes it (R8). The route and the button are R8 (piece 4): nothing in HTTP calls
// `startAnyway` yet, so this drives the door function the route will call.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readLedger } from '../src/triggerledger.js';
import { cardWorld } from './schedule-card-world.mjs';

async function tickAll(f) { await f.scheduler.tick(); await f.scheduler.settled(); await f.scheduler.tick(); }
const argvOf = (spawn) => spawn.args;
const ledgerOf = (f) => path.join(f.dir(), 'ledger.jsonl');

async function waitingTicketJob(t) {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ ticket: '5', schedule: { kind: 'new-ticket' } }));
  assert.equal(out.signed.status, 200, JSON.stringify(out.signed));
  return { f, out };
}

test('while the ticket schedule is OFF, Run it anyway starts that ticket\'s run at once: run-u --ticket N --anyway, the job\'s own spec and cap, no review door, no schedule row', async (t) => {
  const { f, out } = await waitingTicketJob(t);
  const spawnedBefore = f.spawnFn.spawns.length;
  const rowsBefore = readLedger(ledgerOf(f)).rows.length;
  const r = await f.door.startAnyway({ job: 'tk-job', number: 7 });
  assert.deepEqual(r, { ok: true, say: 'Ticket #7 started now; the schedule is still off until a green run.' });
  assert.equal(f.spawnFn.spawns.length, spawnedBefore + 1, 'one run was started');
  const argv = argvOf(f.spawnFn.spawns.at(-1));
  assert.ok(argv.includes('run-u'));
  assert.equal(argv[argv.indexOf('--ticket') + 1], '7');
  assert.ok(argv.includes('--anyway'));
  assert.equal(argv.includes('--review-door'), false, 'a by-hand run, not a scheduled one: no review door');
  assert.equal(argv[argv.indexOf('--approve') + 1], out.state.specHash, 'the job\'s own signed spec (same hash as the first run)');
  assert.equal(readLedger(ledgerOf(f)).rows.length, rowsBefore, 'no ledger row at all: a skipped run never arms, a green one does');
  assert.equal(f.door.isWaiting('tk-job'), true, 'the schedule is still off');
  // no trigger.json: the run does not claim the schedule started it
  const sessions = readdirSync(path.join(f.w.base, 'sessions'));
  assert.ok(sessions.length >= 2);
  assert.equal(sessions.some((s) => existsSync(path.join(f.w.base, 'sessions', s, 'trigger.json'))), false);
});

test('a plain run of a card (Sign & run) has no --anyway; only the person\'s own Run it anyway says it', async (t) => {
  const { f } = await waitingTicketJob(t);
  assert.equal(argvOf(f.spawnFn.spawns[0]).includes('--anyway'), false);
});

test('Run it anyway is not this door\'s case when there is no ticket schedule, a clock schedule, or the schedule is on: null, nothing started', async (t) => {
  const f = await cardWorld(t);
  assert.equal(await f.door.startAnyway({ job: 'tk-job', number: 7 }), null, 'no schedule at all');
  const clock = await f.signCard(f.card({ jobName: 'tk-clock', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  assert.equal(clock.signed.status, 200);
  assert.equal(await f.door.startAnyway({ job: 'tk-clock', number: 7 }), null, 'a clock schedule has no tickets');
  const out = await f.signCard(f.card({ jobName: 'tk-on', ticket: '5', schedule: { kind: 'new-ticket' } }));
  f.run(out.spec, { runid: 'g1', outcome: 'green', ticket: 5 });
  await tickAll(f);
  const n = f.spawnFn.spawns.length;
  assert.equal(await f.door.startAnyway({ job: 'tk-on', number: 7 }), null, 'once the schedule is on the queue takes it (R8)');
  assert.equal(f.spawnFn.spawns.length, n);
  assert.equal(await f.door.startAnyway({ job: '../x', number: 7 }), null);
});

test('refusals start nothing and spend $0: a month with no room, a run still starting, a bad number', async (t) => {
  const { f } = await waitingTicketJob(t);
  // the first run Sign & run started is still in flight (the run list has no row for it yet): the job is busy
  const n0 = f.spawnFn.spawns.length;
  const cfgPath = path.join(f.w.cfg, 'config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, monthlyLimitUsd: 0.01 }));
  const poor = await f.door.startAnyway({ job: 'tk-job', number: 7 });
  assert.deepEqual(poor, { ok: false, say: "This month's limit has no room for this job's cap. Nothing started." });
  writeFileSync(cfgPath, JSON.stringify(cfg));
  assert.equal((await f.door.startAnyway({ job: 'tk-job', number: 7 })).ok, true);
  const again = await f.door.startAnyway({ job: 'tk-job', number: 8 });
  assert.deepEqual(again, { ok: false, say: 'A run of this job is still going. Nothing started.' });
  assert.equal(f.spawnFn.spawns.length, n0 + 1, 'only the one start');
  const n = f.spawnFn.spawns.length;
  for (const bad of [0, -3, 1.5, Number.NaN, 2 ** 60]) {
    const r = await f.door.startAnyway({ job: 'tk-job', number: bad });
    assert.equal(r.ok, false, String(bad));
    assert.match(r.say, /whole number from 1 up\. Nothing started\.$/);
  }
  assert.equal(f.spawnFn.spawns.length, n);
});

test('a skipped by-hand run never arms the schedule; a green one does, and the ticket it read is the cut', async (t) => {
  const { f, out } = await waitingTicketJob(t);
  assert.equal((await f.door.startAnyway({ job: 'tk-job', number: 7 })).ok, true);
  // that run is skipped / red: still off
  f.run(out.spec, { runid: 'r-red', outcome: 'red', ticket: 7 });
  await tickAll(f);
  assert.equal(f.door.isWaiting('tk-job'), true);
  // it (or a later one) goes green having read #7
  f.run(out.spec, { runid: 'r-green', outcome: 'green', ticket: 7 });
  await tickAll(f);
  const armed = readLedger(ledgerOf(f)).rows.find((x) => x.kind === 'armed');
  assert.equal(armed.ticketN, 7);
});
