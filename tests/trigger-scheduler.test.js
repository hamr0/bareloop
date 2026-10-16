// T Part 5 (PANEL-BUILD.md T addendum, G.10 and C.5): the scheduler tick. The REAL scheduler over the REAL door and starter,
// with only the session factory and the spawn recorded. Clock injected; ticks driven by hand except the one real-timer test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScheduler } from '../src/panel/scheduler.js';
import { createScheduleDoor, procStartMs, runnerAlive, PID_REUSE_SLACK_MS } from '../src/panel/schedules.js';
import { readLedger } from '../src/triggerledger.js';
import { appendRun } from '../src/runlist.js';
import {
  fireWorld as world, makeRun, specOf, tmp, SLOT, DEAD_PID, waitExec,
} from './trigger-world.mjs';

const kinds = (w) => w.rows().map((r) => r.kind);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await sleep(10); } };

test('a tick with no schedule on disk reads nothing else: no run list read, no fire', async () => {
  const w = await world();
  w.door.cancel('sched-job');
  let reads = 0;
  const door = createScheduleDoor({ home: w.home, now: w.now, jobRuns: () => [], startFrom: () => null, jobOfRun: () => null, rowsFor: () => [], runRows: () => { reads += 1; return []; } });
  door.attachStarter(w.starter);
  await createScheduler({ door, now: w.now, intervalMs: 0 }).tick();
  assert.equal(reads, 0);
  assert.equal(w.spawnFn.spawns.length, 0);
});

test('a clock tick: due -> one `fire` and one `started`, the argv recorded; a second tick fires nothing', async () => {
  const w = await world();
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  assert.deepEqual(kinds(w), ['signed', 'armed', 'fire', 'started']);
  assert.equal(w.spawnFn.spawns.length, 1);
  const args = w.spawnFn.spawns[0].args;
  assert.ok(args.includes('--review-door'));
  assert.equal(args[args.indexOf('--approve') + 1], w.sig);
  await s.tick();
  await s.tick();
  assert.deepEqual(kinds(w), ['signed', 'armed', 'fire', 'started']);
});

test('the panel was off across 4 slots: ONE catch-up fire for the latest slot, marked, and the old slots never fire later', async () => {
  const w = await world();
  w.now.set(SLOT + 3 * 86_400_000 + 60_000);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  const fire = w.rows().find((r) => r.kind === 'fire');
  assert.deepEqual([fire.slot, fire.catchUp, fire.missed], [SLOT + 3 * 86_400_000, true, 4]);
  w.now.add(200_000);
  await s.tick();
  assert.equal(w.rows().filter((r) => r.kind === 'fire').length, 1);
});

test('a tick that finds the slot refused (key gone) writes one told row, consumes nothing, and starts when the key is back', async () => {
  const w = await world();
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  rmSync(join(w.home, '.env'));
  for (let i = 0; i < 40; i += 1) await s.tick();
  assert.deepEqual(kinds(w), ['signed', 'armed', 'refused']);
  writeFileSync(join(w.home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  await s.tick();
  assert.deepEqual(kinds(w), ['signed', 'armed', 'refused', 'fire', 'started']);
});

test('two ticks back to back (a start still preparing): the second fires nothing and writes no busy row', async () => {
  const w = await world();
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  const a = s.tick();
  const b = s.tick();
  await Promise.all([a, b]);
  assert.equal(w.spawnFn.spawns.length, 1);
  assert.deepEqual(kinds(w), ['signed', 'armed', 'fire', 'started']);
});

test('an unarmed schedule (a crash between the sign and the arm) is armed by the tick', async () => {
  const w = await world();
  writeFileSync(w.ledger, '');
  assert.deepEqual(kinds(w), []);
  w.now.set(SLOT - 3600_000);
  await createScheduler({ door: w.door, now: w.now, intervalMs: 0 }).tick();
  assert.deepEqual(kinds(w), ['armed']);
});

test('one job\'s exception is written once and never stops the other jobs', async () => {
  const w = await world();
  // a second job with its own signed schedule
  const spec2 = specOf({ job: 'other-job', files: true, input: w.notes });
  makeRun(w.home, { runid: 'r2', spec: spec2, accepted: true });
  const body2 = { runid: 'r2', when: { kind: 'daily', hour: 9, minute: 0 }, inputs: `notes: ${w.notes}`, destination: '/tw/out', capUsd: 1.5, maxWallMs: 600000 };
  w.now.set(SLOT - 3600_000);
  const pre = await w.p.post('/api/author/schedule-prepare', body2);
  assert.equal((await w.p.post('/api/author/schedule', { ...body2, hash: pre.body.hash })).status, 200);
  w.now.set(SLOT + 60_000);
  const door = Object.create(w.door);
  door.ledgerOf = (job) => { if (job === 'other-job') throw new Error('disk gone'); return w.door.ledgerOf(job); };
  const s = createScheduler({ door, now: w.now, intervalMs: 0 });
  await s.tick();
  await s.tick();
  assert.deepEqual(kinds(w), ['signed', 'armed', 'fire', 'started'], 'the good job fired');
  const ledger2 = readLedger(join(w.home, 'triggers', 'other-job', 'ledger.jsonl')).rows;
  assert.equal(ledger2.filter((r) => r.kind === 'refused').length, 1, 'told once, not per tick');
  assert.match(ledger2.find((r) => r.kind === 'refused').why, /disk gone/);
});

test('the real timer ticks by itself and stops with the server: no tick after close', async () => {
  const w = await world({ schedulerIntervalMs: 20 });
  assert.equal(w.p.scheduler.running, true);
  await until(() => w.spawnFn.spawns.length === 1);
  await until(() => kinds(w).includes('started'));
  await w.p.close();
  assert.equal(w.p.scheduler.running, false);
  w.now.add(2 * 86_400_000); // a day later a free job would fire again
  const n = w.rows().length;
  await sleep(150);
  assert.equal(w.rows().length, n, 'closed: no timer left');
  assert.equal(w.spawnFn.spawns.length, 1);
});

test('start and stop are idempotent; intervalMs 0 never starts a timer', () => {
  const door = { scan: () => [] };
  const s = createScheduler({ door: /** @type {any} */ (door), intervalMs: 20 });
  s.start(); s.start();
  assert.equal(s.running, true);
  s.stop(); s.stop();
  assert.equal(s.running, false);
  const z = createScheduler({ door: /** @type {any} */ (door), intervalMs: 0 });
  z.start();
  assert.equal(z.running, false);
});

test('the panel with no schedule and the default timer leaves no handle: closing it resolves and stops the timer', async () => {
  const { panel } = await import('./trigger-world.mjs');
  const p = await panel({ schedulerIntervalMs: 500 });
  assert.equal(p.scheduler.running, true);
  await p.close();
  assert.equal(p.scheduler.running, false);
});

// ---- the pid-reuse guard (C.5.5) ----

/** a live "runner" process: a node child named run-u.mjs */
function liveRunner() {
  const d = tmp('ts-runner-');
  const f = join(d, 'run-u.mjs');
  writeFileSync(f, 'setInterval(() => {}, 1000);\n');
  const c = spawn(process.execPath, [f], { stdio: 'ignore' });
  waitExec(c.pid);
  test.after(() => { try { c.kill('SIGKILL'); } catch { /* gone */ } });
  return { c, d };
}

test('procStartMs reads /proc: a process we just started began a moment ago; unreadable /proc is null', async () => {
  const { c } = liveRunner();
  await sleep(50);
  const ms = procStartMs(c.pid);
  assert.ok(ms !== null, 'this machine has /proc');
  assert.ok(Math.abs(Date.now() - ms) < 15_000, `started ${Date.now() - ms} ms ago`);
  assert.equal(procStartMs(DEAD_PID), null);
  assert.equal(procStartMs(1, () => { throw new Error('no /proc'); }), null);
});

test('procStartMs counts fields after the LAST ")" so a command name with spaces and parentheses cannot shift field 22', () => {
  // after "<pid> (<comm>) " comes field 3 (the state); field 22 is the 20th token from there (index 19)
  const tokens = Array.from({ length: 40 }, (_, i) => (i === 19 ? '4200' : i === 0 ? 'S' : '0'));
  const read = (p) => (p.includes('/proc/123/') ? `123 (we ird) x) ${tokens.join(' ')}` : 'cpu 1\nbtime 1000\n');
  assert.equal(procStartMs(123, read), 1000 * 1000 + 42 * 1000);
});

test('PID REUSE: a live runner pid whose process started well after its row was written is NOT that run; a row written after the process started is', async () => {
  const { c } = liveRunner();
  await sleep(50);
  const base = { runid: 'x', job: 'sched-job', spine: '/nope', patient: null, via: 'run-u', pid: c.pid };
  assert.equal(runnerAlive({ ...base, at: new Date().toISOString() }, Date.now()), true);
  assert.equal(runnerAlive({ ...base, at: new Date(Date.now() - 3600_000).toISOString() }, Date.now()), false, 'the row is an hour older than this process: the pid was recycled');
  assert.equal(runnerAlive({ ...base, at: new Date(Date.now() - PID_REUSE_SLACK_MS + 1000).toISOString() }, Date.now()), true, 'inside the 5 s slack');
  assert.equal(runnerAlive({ ...base, at: new Date(Date.now() - 3600_000).toISOString(), leg: 2 }, Date.now()), true, 'a resumed run keeps its first leg\'s time: the guard is skipped');
  assert.equal(runnerAlive({ ...base, pid: DEAD_PID, at: new Date().toISOString() }, Date.now()), false);
});

test('busy through the door: a recycled pid does not hold the job busy; the real run does', async () => {
  const w = await world();
  const { c, d } = liveRunner();
  await sleep(50);
  const spine = join(d, 'u-recycled.jsonl');
  writeFileSync(spine, '');
  appendRun({ at: new Date(Date.now() - 3600_000).toISOString(), runid: 'recycled', job: 'sched-job', spine, patient: null, via: 'run-u', pid: c.pid }, { home: w.home });
  assert.equal(w.door.busy('sched-job'), false);
  appendRun({ at: new Date().toISOString(), runid: 'real', job: 'sched-job', spine, patient: null, via: 'run-u', pid: c.pid }, { home: w.home });
  assert.equal(w.door.busy('sched-job'), true);
});
