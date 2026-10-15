// RULED 2026-10-15 (PANEL-BUILD.md T addendum item 11): a scheduled fire refused with `install-needed` waits Fibonacci minutes (1, 2, 3, 5, 8, 13, 21)
// before its next attempt, stops at 60 minutes total, and the schedule then pauses and the job waits in Needs you. Earlier: a flat 1 minute. Before: the 500 ms tick redid the copy and `npm ci` about twice a second. Real door, real starter, a fake session factory
// that counts install attempts and leaves a dir the starter must remove.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createStarter } from '../src/panel/schedulestart.js';
import { INSTALL_GIVE_UP_MS, INSTALL_RETRY_STEPS_MS, createScheduleDoor } from '../src/panel/schedules.js';
import { createScheduler } from '../src/panel/scheduler.js';
import { getStartFrom } from '../src/panel/server.js';
import { keysForDoor, keysHome as kHome } from '../src/keysfile.js';
import { rowsForHome } from '../src/providerrows.js';
import { jobSpecHash } from '../src/job.js';
import { gaveUpNextWords, retryWords } from '../src/schedulewords.js';
import { fireWorld, recordingSpawn, tmp } from './trigger-world.mjs';

const FAILURE = 'a scheduled fire hit install-needed and the 500 ms tick redid the copy and npm ci about twice a second';
assert.ok(FAILURE);

/** a world whose session factory fails the install `failures` times, then prepares. `attempts` counts every install try. */
async function world(failures, when) {
  const w = await fireWorld(when ? { when } : {});
  const root = tmp('iw-sess-');
  const st = { attempts: 0 };
  const startSession = async (card, reuse) => {
    st.attempts += 1;
    const outDir = join(root, `s${st.attempts}`);
    mkdirSync(outDir, { recursive: true });
    const resolvedSpecPath = join(outDir, 'resolved-spec.json');
    writeFileSync(resolvedSpecPath, JSON.stringify(reuse.spec));
    const fails = Array.isArray(failures) ? failures[st.attempts - 1] === 'f' : st.attempts <= failures;
    const phase = fails ? 'install-needed' : 'prepared';
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


const MIN = 60_000;
/** tick every 5 s for `minutes`, returning the minute offsets (from `t0`) at which a new install attempt happened */
async function attemptTimes(w, s, minutes) {
  const t0 = w.now();
  const at = [];
  let seen = w.st.attempts;
  for (let ms = 0; ms <= minutes * MIN; ms += 5000) {
    await s.tick();
    if (w.st.attempts > seen) { at.push((w.now() - t0) / MIN); seen = w.st.attempts; }
    w.now.add(5000);
  }
  return at;
}
const gaveUpRows = (w) => w.rows().filter((r) => r.kind === 'gave-up');

test('the waits are one named list, Fibonacci 1, 2, 3, 5, 8, 13, 21 minutes, with a 60-minute ceiling', () => {
  assert.deepEqual(INSTALL_RETRY_STEPS_MS.map((x) => x / MIN), [1, 2, 3, 5, 8, 13, 21]);
  assert.equal(INSTALL_GIVE_UP_MS, 60 * MIN);
  assert.equal(INSTALL_RETRY_STEPS_MS.reduce((a, b) => a + b, 0) / MIN, 53, 'total waiting is 53 minutes');
});

test('consecutive install failures: attempts are 1, 2, 3, 5, 8, 13, 21 minutes apart, and there is none after', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  const at = await attemptTimes(w, s, 120);
  assert.deepEqual(at, [0, 1, 3, 6, 11, 19, 32, 53], 'the first attempt at 0, then 1, 2, 3, 5, 8, 13, 21 minutes apart');
  assert.equal(w.st.attempts, 8);
});

test('giving up writes exactly ONE gave-up row, with the refusal words, and leaves no session dir; rows stay bounded', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await attemptTimes(w, s, 200);
  const g = gaveUpRows(w);
  assert.equal(g.length, 1);
  assert.equal(g[0].why, "Packages are missing in the job's copy. Nothing started.");
  assert.equal(g[0].sig, w.sig);
  assert.equal(readdirSync(w.root).length, 0, 'no session dir left');
  assert.ok(w.rows().length <= 8, `bounded, not ${w.rows().length}`);
});

test('a clock schedule that gave up does not fire its next slots (2 days on the fake clock)', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await attemptTimes(w, s, 70);
  const attempts = w.st.attempts;
  for (let d = 0; d < 2; d += 1) { w.now.add(24 * 60 * MIN); await s.tick(); await s.tick(); }
  assert.equal(w.st.attempts, attempts, 'no attempt on the next slots');
  assert.equal(w.spawnFn.spawns.length, 0);
  assert.equal(gaveUpRows(w).length, 1);
});

test('the pause survives a restart: a fresh scheduler and a fresh door still read it from the ledger', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await attemptTimes(w, s, 70);
  const attempts = w.st.attempts;
  const door2 = createScheduleDoor({ home: w.home, now: w.now, jobRuns: () => [], startFrom: () => null, jobOfRun: () => null, rowsFor: () => [], runRows: () => [] });
  assert.equal(door2.paused('sched-job'), true);
  door2.attachStarter(w.starter);
  const s2 = createScheduler({ door: door2, now: w.now, intervalMs: 0 });
  w.now.add(24 * 60 * MIN);
  await s2.tick();
  assert.equal(w.st.attempts, attempts, 'a restarted panel does not resume trying');
});

test('a folder schedule that gave up: new files still queue as arrived, none runs', async () => {
  const w = await world(1e9, 'files');
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  writeFileSync(join(w.inbox, 'a.txt'), 'one\n');
  for (let i = 0; i < 4; i += 1) { w.now.add(1000); await s.tick(); }
  await attemptTimes(w, s, 70);
  assert.equal(gaveUpRows(w).length, 1);
  const attempts = w.st.attempts;
  writeFileSync(join(w.inbox, 'b.txt'), 'two\n');
  for (let i = 0; i < 6; i += 1) { w.now.add(1000); await s.tick(); }
  w.now.add(60 * MIN);
  await s.tick();
  assert.equal(w.st.attempts, attempts, 'nothing ran');
  assert.ok(w.rows().some((r) => r.kind === 'arrived' && /b\.txt/.test(String(r.file ?? r.path ?? ''))), 'b.txt still queued as arrived');
});

test('/api/runs carries the Needs-you entry for a gave-up job: pill Check, refusal words and date from the server, head run to open; no age-out', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await attemptTimes(w, s, 70);
  const gaveAt = w.rows().find((r) => r.kind === 'gave-up').at;
  w.now.add(30 * 24 * 60 * MIN);
  const { body } = await w.p.get('/api/runs');
  assert.equal(body.gaveUp.length, 1, 'still there 30 days later');
  const g = body.gaveUp[0];
  assert.equal(g.job, 'sched-job');
  assert.equal(g.pill, 'Check');
  assert.equal(g.words, "Packages are missing in the job's copy. Nothing started.");
  const d = new Date(gaveAt);
  assert.match(g.at, /^\d\d\/\d\d \d\d:\d\d$/);
  assert.equal(g.at, `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  assert.equal(g.runId, body.jobs.find((j) => j.job === 'sched-job').headRunid, 'the card opens the job\'s newest run');
});

test('a re-sign (Cancel / modify) clears the pause, resets the count, and the next slot fires', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await attemptTimes(w, s, 70);
  assert.equal(w.door.paused('sched-job'), true);
  const pre = await w.p.post('/api/author/schedule-prepare', w.body);
  const set = await w.p.post('/api/author/schedule', { ...w.body, hash: pre.body.hash });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(w.door.paused('sched-job'), false);
  assert.equal((await w.p.get('/api/runs')).body.gaveUp.length, 0);
  const before = w.st.attempts;
  w.now.add(24 * 60 * MIN);
  await s.tick();
  assert.equal(w.st.attempts, before + 1, 'the next slot tried again');
  const t1 = w.now();
  const at = await attemptTimes(w, s, 5);
  assert.deepEqual(at, [1, 3], 'the wait starts over at 1 minute (the re-signed slot already tried once above)');
  assert.ok(t1 > 0);
});

test('cancel clears the pause; a fresh schedule is not paused', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await attemptTimes(w, s, 70);
  assert.equal(w.door.cancel('sched-job'), true);
  assert.equal(w.door.paused('sched-job'), false);
  assert.equal((await w.p.get('/api/runs')).body.gaveUp.length, 0);
  const pre = await w.p.post('/api/author/schedule-prepare', w.body);
  await w.p.post('/api/author/schedule', { ...w.body, hash: pre.body.hash });
  assert.equal(w.door.paused('sched-job'), false, 'the old gave-up row does not pause the new signing');
});

test('a success resets the count: after a good start the next failure waits 1 minute again', async () => {
  const w = await world(['f', 'f', 'p', 'f', 'f', 'f']); // fail, fail, start; next day: fail, fail, fail
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  assert.deepEqual(await attemptTimes(w, s, 4), [0, 1, 3], 'attempts at 0 (fail), 1 (fail, 2 min wait), 3 (starts)');
  assert.equal(w.spawnFn.spawns.length, 1, 'the run started');
  assert.equal(w.door.view('sched-job').nextRed, false);
  w.now.add(24 * 60 * MIN);
  assert.deepEqual(await attemptTimes(w, s, 8), [0, 1, 3, 6], 'the next failure waits 1, 2, 3 minutes: the count started over (without the reset it would wait 3, then 5)');
});

test('NEXT words: the minutes left before giving up, singular at 1 minute; the red give-up words after', async () => {
  assert.equal(retryWords(60_000), 'Trying again in 1 minute. ');
  assert.equal(retryWords(120_000), 'Trying again in 2 minutes. ');
  assert.equal(retryWords(61_000), 'Trying again in 2 minutes. ');
  assert.equal(retryWords(null), '');
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  assert.match(w.door.view('sched-job').next, /Trying again in 1 minute\. /);
  w.now.add(MIN); await s.tick(); // 2nd refusal: 2-minute wait
  assert.match(w.door.view('sched-job').next, /Trying again in 2 minutes\. /);
  w.now.add(30_000);
  assert.match(w.door.view('sched-job').next, /Trying again in 2 minutes\. /, '90 s left rounds up');
  await attemptTimes(w, s, 70);
  const v = w.door.view('sched-job');
  assert.equal(v.nextRed, true);
  assert.equal(v.next, "Stopped trying after 60 minutes: Packages are missing in the job's copy. Nothing started. Fix it, then Cancel / modify schedule to start again.");
  assert.equal(gaveUpNextWords('Packages missing.'), 'Stopped trying after 60 minutes: Packages missing. Fix it, then Cancel / modify schedule to start again.');
});

test('during a wait: no session dir is left, no row per tick, the refusal is told once', async () => {
  const w = await world(5);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  const rows = w.rows().length;
  for (let i = 0; i < 100; i += 1) { w.now.add(500); await s.tick(); }
  assert.equal(w.rows().length, rows, 'nothing written per tick');
  assert.equal(readdirSync(w.root).length, 0, 'no session dir remains');
  assert.equal(w.rows().filter((r) => r.kind === 'refused').length, 1, 'told once');
  assert.equal(w.st.attempts, 1);
});

test('cancelling the schedule stops the retries', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  assert.equal(w.door.cancel('sched-job'), true);
  for (let i = 0; i < 5; i += 1) { w.now.add(INSTALL_RETRY_STEPS_MS[0]); await s.tick(); }
  assert.equal(w.st.attempts, 1);
});

test('the page draws the Needs-you card from the server: pill, words and date, a click opens the run', () => {
  const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
  assert.match(PAGE, /function rlGaveUpCardHtml\(g\)/);
  assert.match(PAGE, /data-rl-jump="' \+ escapeXml\(g\.runId\)/);
  assert.match(PAGE, /m\.needs\.concat\(m\.gaveUp/);
});

// RULED 2026-10-15 (hamr "yes to all"): while the install back-off is still retrying the SCHEDULE row is NOT red and says when it tries again; only the give-up is red.
test('SCHEDULE line 2 while retrying: not red, ends `next: tries again in N min`; after the 60-minute give-up: red, ends `next: fix it in Cancel / modify schedule`', async () => {
  const w = await world(1e9);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  await s.tick();
  const d1 = (await w.p.get('/api/runs/r1')).body.schedule;
  assert.equal(d1.problem, false, 'still retrying is not a problem');
  assert.match(d1.line2, /^last \d\d\/\d\d \d\d:\d\d · refused: .* · next: tries again in 1 min$/);
  await attemptTimes(w, s, 200);
  const d2 = (await w.p.get('/api/runs/r1')).body.schedule;
  assert.equal(d2.problem, true, 'given up is red');
  assert.match(d2.line2, / · next: fix it in Cancel \/ modify schedule$/);
});
