// T Part 5 (PANEL-BUILD.md T addendum, G.7 and E.4): files queue by arrival. The scheduler is the ONLY writer of `arrived`
// and `ran` rows. Queue = arrived minus ran minus dropped, oldest arrival first, ties by name then sha. No real waits:
// the clock is injected and `tick` is called by hand; a run "ends" when the door's starting window passes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { basename, join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { createScheduler } from '../src/panel/scheduler.js';
import { createScheduleDoor } from '../src/panel/schedules.js';
import { readLedger } from '../src/triggerledger.js';
import { queueOf, readSeen, STABLE_POLLS } from '../src/triggerfiles.js';
import { appendRun } from '../src/runlist.js';
import { fireWorld, SLOT, DEAD_PID, waitExec } from './trigger-world.mjs';

async function qWorld() {
  const w = await fireWorld({ when: 'files' });
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  const polls = async (n = STABLE_POLLS + 2) => { for (let i = 0; i < n; i += 1) await s.tick(); };
  const started = () => w.made.map((m) => basename(m.reuse.spec.inputs[0].value));
  const ledgerKinds = (k) => readSeen(w.ledger).filter((r) => r.kind === k);
  const drop = (name, body = `${name}\n`) => writeFileSync(join(w.inbox, name), body);
  /** the run in flight ends: the door's starting window (120 s) passes, and run-u's row says it is not alive */
  const endRun = () => w.now.add(121_000);
  return { ...w, s, polls, started, ledgerKinds, drop, endRun };
}

test('3 files land at once: 3 runs, one after another, in arrival order (identical arrival times: by name)', async () => {
  const f = await qWorld();
  for (const n of ['c.txt', 'a.txt', 'b.txt']) f.drop(n); // written in a different order than their names
  await f.polls();
  assert.deepEqual(f.started(), ['a.txt'], 'one at a time: the head of the queue started, the others wait');
  assert.equal(f.ledgerKinds('arrived').length, 3);
  assert.equal(f.ledgerKinds('ran').length, 1, '`ran` is written only for the file that started');
  assert.equal(new Set(f.ledgerKinds('arrived').map((r) => r.at)).size, 1, 'identical arrival times: this clock, never the file mtime');
  f.endRun(); await f.polls();
  assert.deepEqual(f.started(), ['a.txt', 'b.txt']);
  f.endRun(); await f.polls();
  assert.deepEqual(f.started(), ['a.txt', 'b.txt', 'c.txt']);
  f.endRun(); await f.polls(10);
  assert.deepEqual(f.started(), ['a.txt', 'b.txt', 'c.txt'], 'nothing left in the queue; nothing runs twice');
  assert.equal(f.spawnFn.spawns.length, 3);
});

test('arrival order beats name order when the arrival times differ', async () => {
  const f = await qWorld();
  f.drop('first.txt'); await f.polls();
  assert.deepEqual(f.started(), ['first.txt']);
  f.now.add(60_000); f.drop('z.txt'); await f.polls();
  f.now.add(60_000); f.drop('a.txt'); await f.polls();
  f.endRun(); await f.polls();
  f.endRun(); await f.polls();
  assert.deepEqual(f.started(), ['first.txt', 'z.txt', 'a.txt'], 'z arrived before a');
});

test('busy: exactly one `busy` row per queued file over many ticks; the file stays queued and gets no `ran`', async () => {
  const f = await qWorld();
  f.drop('one.txt'); await f.polls();
  f.drop('two.txt'); f.drop('three.txt');
  await f.polls(40);
  const busy = readLedger(f.ledger).rows.filter((r) => r.kind === 'busy');
  assert.deepEqual(busy.map((r) => basename(r.file)).sort(), ['three.txt', 'two.txt'], JSON.stringify(busy));
  assert.equal(f.ledgerKinds('ran').length, 1);
  assert.equal(queueOf(readSeen(f.ledger)).length, 2);
  f.endRun(); await f.polls(); f.endRun(); await f.polls(); f.endRun(); await f.polls(6);
  assert.deepEqual(f.started(), ['one.txt', 'three.txt', 'two.txt']);
});

test('a live run of the job (pid alive, row in runs.jsonl) holds the queue; its end frees it', async () => {
  const f = await qWorld();
  const { spawn } = await import('node:child_process');
  const { tmp } = await import('./trigger-world.mjs');
  const d = tmp('tq-runner-');
  writeFileSync(join(d, 'run-u.mjs'), 'setInterval(() => {}, 1000);\n');
  const c = spawn(process.execPath, [join(d, 'run-u.mjs')], { stdio: 'ignore' });
  waitExec(c.pid);
  test.after(() => { try { c.kill('SIGKILL'); } catch { /* gone */ } });
  writeFileSync(join(d, 'u-live.jsonl'), '');
  appendRun({ at: new Date().toISOString(), runid: 'live', job: 'sched-job', spine: join(d, 'u-live.jsonl'), patient: null, via: 'run-u', pid: c.pid }, { home: f.home });
  f.drop('a.txt'); await f.polls(10);
  assert.deepEqual(f.started(), []);
  assert.equal(readLedger(f.ledger).rows.filter((r) => r.kind === 'busy').length, 1);
  c.kill('SIGKILL');
  await new Promise((r) => { c.once('exit', r); });
  await f.polls();
  assert.deepEqual(f.started(), ['a.txt']);
});

test('restart keeps the queue: a fresh scheduler over the same files runs the waiting head, nothing doubled', async () => {
  const f = await qWorld();
  f.drop('a.txt'); f.drop('b.txt'); await f.polls();
  assert.deepEqual(f.started(), ['a.txt']);
  const s2 = createScheduler({ door: f.door, now: f.now, intervalMs: 0 });
  f.endRun();
  for (let i = 0; i < 6; i += 1) await s2.tick();
  assert.deepEqual(f.started(), ['a.txt', 'b.txt']);
  assert.equal(f.ledgerKinds('arrived').length, 2, 'the restarted watcher did not re-arrive them');
});

test('a queued file deleted before its turn is dropped with a reason and the next head runs', async () => {
  const f = await qWorld();
  f.drop('a.txt'); f.drop('b.txt'); f.drop('c.txt'); await f.polls();
  assert.deepEqual(f.started(), ['a.txt']);
  rmSync(join(f.inbox, 'b.txt'));
  f.endRun(); await f.polls();
  assert.deepEqual(f.started(), ['a.txt', 'c.txt']);
  const dropped = f.ledgerKinds('dropped');
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].why, 'deleted');
  const row = readLedger(f.ledger).rows.find((r) => r.kind === 'deleted');
  assert.match(row.say, /^b\.txt did not run: it was deleted\.$/);
});

test('a queued file changed before its turn is dropped as changed and arrives again as the new version', async () => {
  const f = await qWorld();
  f.drop('a.txt'); f.drop('b.txt'); await f.polls();
  assert.deepEqual(f.started(), ['a.txt']);
  f.drop('b.txt', 'b changed\n');
  f.endRun(); await f.polls(8);
  assert.equal(f.ledgerKinds('dropped')[0].why, 'changed');
  assert.deepEqual(f.started(), ['a.txt', 'b.txt']);
  assert.equal(f.ledgerKinds('arrived').filter((r) => r.name === 'b.txt').length, 2, 'old version and new version');
  assert.equal(f.made[1].reuse.spec.inputs[0].value, join(f.inbox, 'b.txt'));
});

test('a file already in the folder at arm never runs, under any name; a really new file does', async () => {
  const w = await fireWorld({ when: 'files' });
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  w.door.cancel('sched-job');
  writeFileSync(join(w.inbox, 'seen.txt'), 'old\n');
  w.now.set(SLOT - 3600_000);
  const body = { ...w.body, when: { kind: 'new-file', folder: w.inbox }, capUsd: 2 };
  const pre = await w.p.post('/api/author/schedule-prepare', body);
  assert.equal((await w.p.post('/api/author/schedule', { ...body, hash: pre.body.hash })).status, 200);
  assert.equal(w.rows().filter((r) => r.kind === 'baseline').length, 1);
  w.now.set(SLOT + 60_000);
  writeFileSync(join(w.inbox, 'copy-of-seen.txt'), 'old\n');
  for (let i = 0; i < 8; i += 1) await s.tick();
  assert.equal(w.spawnFn.spawns.length, 0, 'the same content under a new name is not new');
  writeFileSync(join(w.inbox, 'fresh.txt'), 'brand new\n');
  for (let i = 0; i < 6; i += 1) await s.tick();
  assert.deepEqual(w.made.map((m) => basename(m.reuse.spec.inputs[0].value)), ['fresh.txt']);
});

test('T19a: with 200 listed runs and 10 queued files a tick reads the run list ONCE; with a free job and no fire it reads none', async () => {
  const w = await fireWorld({ when: 'files' });
  for (let i = 0; i < 200; i += 1) appendRun({ at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), runid: `old${i}`, job: i % 2 ? 'sched-job' : 'else-job', spine: `/nope/${i}.jsonl`, patient: null, via: 'run-u', pid: DEAD_PID }, { home: w.home });
  let reads = 0;
  const door = createScheduleDoor({
    home: w.home, now: w.now, jobRuns: () => [], startFrom: () => null, jobOfRun: () => null, rowsFor: () => [],
    runRows: () => { reads += 1; return []; },
  });
  door.attachStarter(w.starter);
  // the first run makes the job busy (the starting window), so the other nine queue behind it
  for (let i = 0; i < 10; i += 1) writeFileSync(join(w.inbox, `f${String(i).padStart(2, '0')}.txt`), `${i}\n`);
  const s = createScheduler({ door, now: w.now, intervalMs: 0 });
  for (let i = 0; i < STABLE_POLLS; i += 1) await s.tick();
  reads = 0;
  await s.tick(); // all ten arrive, the head starts
  assert.equal(reads, 1, 'one read of the run list for the whole tick');
  reads = 0;
  await s.tick(); // busy: nine told once each
  assert.equal(reads, 1);
  reads = 0;
  for (let i = 0; i < 5; i += 1) await s.tick();
  assert.equal(reads, 5, 'one per tick, never one per queued file');
  assert.equal(readLedger(w.ledger).rows.filter((r) => r.kind === 'busy').length, 9);
});
