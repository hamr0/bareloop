// RULED 2026-10-15 (PANEL-BUILD.md T addendum): a scheduled fire refused with `install-needed` waits 1 minute before its next
// attempt. Before: the 500 ms tick redid the copy and `npm ci` about twice a second. Real door, real starter, a fake session factory
// that counts install attempts and leaves a dir the starter must remove.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStarter, INSTALL_RETRY_MS } from '../src/panel/schedulestart.js';
import { createScheduler } from '../src/panel/scheduler.js';
import { getStartFrom } from '../src/panel/server.js';
import { keysForDoor, keysHome as kHome } from '../src/keysfile.js';
import { rowsForHome } from '../src/providerrows.js';
import { jobSpecHash } from '../src/job.js';
import { retryWords } from '../src/schedulewords.js';
import { fireWorld, recordingSpawn, tmp } from './trigger-world.mjs';

const FAILURE = 'a scheduled fire hit install-needed and the 500 ms tick redid the copy and npm ci about twice a second';
assert.ok(FAILURE);

/** a world whose session factory fails the install `failures` times, then prepares. `attempts` counts every install try. */
async function world(failures) {
  const w = await fireWorld();
  const root = tmp('iw-sess-');
  const st = { attempts: 0 };
  const startSession = async (card, reuse) => {
    st.attempts += 1;
    const outDir = join(root, `s${st.attempts}`);
    mkdirSync(outDir, { recursive: true });
    const resolvedSpecPath = join(outDir, 'resolved-spec.json');
    writeFileSync(resolvedSpecPath, JSON.stringify(reuse.spec));
    const phase = st.attempts <= failures ? 'install-needed' : 'prepared';
    return { ok: true, session: { state: { id: `s${st.attempts}`, phase, specHash: jobSpecHash(reuse.spec), resolvedSpecPath, outDir }, abandon() {} } };
  };
  const envNow = () => keysForDoor({ env: {}, keysHome: w.home }).env;
  const spawnFn = recordingSpawn();
  const starter = createStarter({
    door: w.door, startSession, envNow, spawnFn, bareloopBin: '/x/bareloop.mjs', sessionsRoot: tmp('iw-root-'), home: w.home, childGraceMs: 40,
    rowsFor: () => rowsForHome(kHome(w.home), envNow()), startFrom: (runid) => getStartFrom(runid, { home: w.home }),
  });
  w.door.attachStarter(starter);
  return { ...w, st, root, spawnFn, starter };
}

test('the wait is one named constant, 1 minute', () => assert.equal(INSTALL_RETRY_MS, 60_000));

test('an install-needed fire ticked for 59 s does exactly 1 install attempt; at 60 s it does the second', async () => {
  const w = await world(5);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  assert.equal(w.st.attempts, 1);
  for (let ms = 500; ms <= 59_000; ms += 500) { w.now.add(500); await s.tick(); }
  assert.equal(w.st.attempts, 1, 'still the first attempt after 59 s of ticks');
  w.now.add(1000);
  await s.tick();
  assert.equal(w.st.attempts, 2, 'the second at 60 s');
});

test('during the wait: no session dir is left, no row per tick, the refusal is told once', async () => {
  const w = await world(5);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  const rows = w.rows().length;
  for (let i = 0; i < 100; i += 1) { w.now.add(500); await s.tick(); }
  assert.equal(w.rows().length, rows, 'nothing written per tick');
  assert.deepEqual(readdirSync(w.root), [...readdirSync(w.root)].filter((d) => !existsSync(join(w.root, d))), 'no session dir remains');
  assert.equal(readdirSync(w.root).length, 0);
  assert.equal(w.rows().filter((r) => r.kind === 'refused').length, 1, 'told once');
  w.now.add(10_000);
  await s.tick(); // the 2nd attempt: the same words, still one row
  assert.equal(w.rows().filter((r) => r.kind === 'refused').length, 1);
  assert.equal(readdirSync(w.root).length, 0);
});

test('rows stay bounded over a long broken install', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  for (let i = 0; i < 600; i += 1) { await s.tick(); w.now.add(500); }
  assert.ok(w.rows().length <= 8, `bounded, not ${w.rows().length}`);
  assert.ok(w.st.attempts <= 6, `about one a minute, not ${w.st.attempts}`);
});

test('the red NEXT carries the refusal words and `Trying again in 1 minute.`', async () => {
  const w = await world(5);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  const v = w.door.view('sched-job');
  assert.equal(v.nextRed, true);
  assert.match(v.next, /^The last try did not start: Packages are missing in the job's copy\. Nothing started\. Trying again in 1 minute\. /);
  assert.equal(retryWords(null), '');
  assert.equal(retryWords(60_000), 'Trying again in 1 minute. ');
});

test('a success on the 2nd try starts the run and NEXT is back to normal', async () => {
  const w = await world(1);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  assert.equal(w.spawnFn.spawns.length, 0);
  w.now.add(INSTALL_RETRY_MS);
  await s.tick();
  assert.equal(w.st.attempts, 2);
  assert.equal(w.spawnFn.spawns.length, 1, 'the run started');
  assert.doesNotMatch(w.door.view('sched-job').next, /Trying again/);
});

test('cancelling the schedule stops the retries', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  assert.equal(w.door.cancel('sched-job'), true);
  for (let i = 0; i < 5; i += 1) { w.now.add(INSTALL_RETRY_MS); await s.tick(); }
  assert.equal(w.st.attempts, 1);
});
