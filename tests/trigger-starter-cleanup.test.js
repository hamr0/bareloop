// The rubric-2 failure (the starter half) (2026-10-14): a scheduled fire carried writeScope ["output/"] (a relative fence on a plain-files rubric job),
// was refused by the session start ("Destination must be the full path of a folder"), and left a panel session dir on every
// 500 ms tick, with nothing shown. Real HTTP, the real door, starter, scheduler and session factory over a scratch home.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScheduler } from '../src/panel/scheduler.js';
import { readLedger } from '../src/triggerledger.js';
import {
  fireWorld, keysHome, makeRun, panel, realWorld, specOf, tmp, DAILY,
} from './trigger-world.mjs';

const FAILURE = 'rubric-2 scheduled fire 22:21 refused (Destination not a full path) and created a panel session dir every tick (237), with no warning shown';
assert.ok(FAILURE);

test('a session the start made and the session then refused (a symlink input) is removed by the starter, tick after tick', async () => {
  const real = join(tmp('dc-real-'), 'real.txt');
  writeFileSync(real, 'hi\n');
  const link = join(tmp('dc-link-'), 'notes.txt');
  symlinkSync(real, link);
  const w = await realWorld({ input: link, relative: false });
  const s = createScheduler({ door: w.p.schedules, now: w.now, intervalMs: 0 });
  for (let i = 0; i < 30; i += 1) await s.tick();
  assert.deepEqual(readdirSync(w.sessions), [], 'the refused session dir is gone');
  assert.equal(w.rows().filter((r) => r.kind === 'refused').length, 1, 'told once');
  assert.equal(w.rows().filter((r) => r.kind === 'fire').length, 0, 'nothing consumed');
});

test('a child that refuses right after the spawn: the starter removes what it made, the refusal counts toward MAX_RELEASES and rows stay bounded', async () => {
  const w = await fireWorld();
  w.spawnFn.exitWith = 2; // the injected child exits non-zero at once (run-u refused its spec, hash or precheck)
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  for (let i = 0; i < 60; i += 1) await s.tick();
  assert.ok(w.made.length >= 1);
  for (const m of w.made) assert.equal(existsSync(m.session.state.outDir), false, 'no lasting dir');
  assert.ok(w.rows().length <= 14, `bounded, not ${w.rows().length}`);
  assert.ok(w.spawnFn.spawns.length <= 4, `at most 1 + MAX_RELEASES tries, not ${w.spawnFn.spawns.length}`);
  assert.match(w.rows().filter((r) => r.kind === 'refused').at(-1).why, /given up on/);
});


test('the starter reads the SCHEDULER\'s clock: trigger.json lateMs is the injected clock minus the slot, not the wall clock', async () => {
  const w = await realWorld({ relative: false });
  const s = createScheduler({ door: w.p.schedules, now: w.now, intervalMs: 0 });
  await s.tick();
  const dirs = readdirSync(w.sessions).map((d) => join(w.sessions, d, 'trigger.json')).filter((f) => existsSync(f));
  assert.equal(dirs.length >= 1, true, 'a scheduled start wrote trigger.json');
  const trig = JSON.parse(readFileSync(dirs[0], 'utf8'));
  assert.equal(trig.lateMs, 60_000, 'late by exactly the injected clock\'s minute');
  assert.equal(trig.startedAt, w.now(), 'startedAt is the injected clock, not Date.now');
});
