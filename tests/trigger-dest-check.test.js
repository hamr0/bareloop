// The rubric-2 failure (2026-10-14): a scheduled fire carried writeScope ["output/"] (a relative fence on a plain-files rubric job),
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

test('click 1 and click 2 refuse a relative Destination on a plain-files rubric job, at $0, writing nothing', async () => {
  const home = keysHome();
  const notes = join(tmp('dc-in-'), 'n.txt');
  writeFileSync(notes, 'x\n');
  makeRun(home, { runid: 'r1', spec: specOf({ files: true, input: notes }), accepted: true });
  const p = await panel({ home });
  const body = { runid: 'r1', when: DAILY, inputs: `notes: ${notes}`, destination: 'output/', capUsd: 1.5, maxWallMs: 600000 };
  const a = await p.post('/api/author/schedule-prepare', body);
  assert.equal(a.status, 400, JSON.stringify(a.body));
  assert.match(a.body.say, /Destination must be the full path of a folder/);
  assert.match(a.body.say, /Nothing was changed\.$/);
  const b = await p.post('/api/author/schedule', { ...body, hash: 'a'.repeat(64) });
  assert.equal(b.status, 400);
  assert.match(b.body.say, /Destination must be the full path of a folder/);
  assert.equal(existsSync(join(home, 'triggers', 'sched-job')), false);
});

test('Reuse prefill: a plain-files job opens with the folder its origin run delivered to, not the signed fence output/', async () => {
  const home = keysHome();
  const notes = join(tmp('dc-in-'), 'n.txt');
  writeFileSync(notes, 'x\n');
  const run = makeRun(home, { runid: 'r1', spec: specOf({ files: true, input: notes }), accepted: true });
  writeFileSync(join(run.out, 'card.json'), JSON.stringify({ inputs: `notes: ${notes}`, destination: '/tw/delivered', model: 'claude-sonnet-5' }));
  const p = await panel({ home });
  const r = await p.get('/api/author/start-from?runid=r1');
  assert.equal(r.body.card.destination, '/tw/delivered');
});

test('plain Reuse of a files job with a relative Destination is refused at $0 and makes no session dir', async () => {
  const w = await realWorld({ relative: false });
  const pre = await w.p.get('/api/author/start-from?runid=r1');
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  const card = { ...pre.body.card, startFrom: 'r1', destination: 'output/', inputs: `notes: ${w.notes}`, capUsd: 1.5 };
  const r = await w.p.post('/api/author/start', card);
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.error, /Destination must be the full path of a folder/);
  assert.deepEqual(readdirSync(w.sessions), []);
});

test('rubric-2: a fire whose spec carries writeScope ["output/"], ticked 500 times, leaves 0 session dirs and a bounded number of rows', async () => {
  const w = await realWorld();
  const s = createScheduler({ door: w.p.schedules, now: w.now, intervalMs: 0 });
  for (let i = 0; i < 500; i += 1) await s.tick();
  assert.deepEqual(readdirSync(w.sessions), [], 'no session dir for a start that would be refused');
  const refused = w.rows().filter((r) => r.kind === 'refused');
  assert.equal(refused.length, 1, 'told once');
  assert.match(refused[0].why, /Destination must be the full path of a folder/);
  assert.ok(w.rows().length <= 3, `bounded, not ${w.rows().length}`);
});

test('a refused fire is a red NEXT with the words on the run page (the refused-lead rule)', async () => {
  const w = await realWorld();
  await createScheduler({ door: w.p.schedules, now: w.now, intervalMs: 0 }).tick();
  const d = (await w.p.get('/api/runs/r1')).body;
  assert.equal(d.schedule.nextRed, true);
  assert.match(d.schedule.next, /^The last try did not start: .*Destination must be the full path of a folder/);
});

