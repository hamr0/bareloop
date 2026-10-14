// T Part 7 (PANEL-BUILD.md T addendum, G.9 and C.7): what the SERVER hands the page — `detail.schedule` on a run, `scheduled[]` in
// GET /api/runs, the start-from schedule card — over real HTTP on a scratch home. The page paints strings; every state and word is here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { appendRow, readLedger } from '../src/triggerledger.js';
import { appendRun } from '../src/runlist.js';
import { SCHEDULE_WORDS } from '../src/schedulewords.js';
import {
  clock, fireWorld, keysHome, makeRun, panel, specOf, tmp, SLOT, DAILY, waitExec,
} from './trigger-world.mjs';

const body = (notes) => ({ when: DAILY, inputs: `notes: ${notes}`, destination: 'output/', capUsd: 1.5, maxWallMs: 600000 });

async function sign(p, runid, notes, when = DAILY) {
  const b = { ...body(notes), runid, when };
  const pre = await p.post('/api/author/schedule-prepare', b);
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  const set = await p.post('/api/author/schedule', { ...b, hash: pre.body.hash });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  return pre.body.hash;
}
const detail = async (p, runid) => (await p.get(`/api/runs/${runid}`)).body;

test('detail.schedule: a scheduled job shows its words and NEXT, scheduled true, canSchedule false, fromRunid = the green it was made from; the table is the server\'s', async () => {
  const w = await fireWorld();
  const d = await detail(w.p, 'r1');
  assert.equal(d.schedule.scheduled, true);
  assert.equal(d.schedule.canSchedule, false);
  assert.equal(d.schedule.text, 'Every day at 09:00');
  assert.match(d.schedule.next, /^Next run /);
  assert.equal(d.schedule.nextRed, false);
  assert.equal(d.schedule.fromRunid, 'r1');
  assert.deepEqual(d.schedule.words, JSON.parse(JSON.stringify(SCHEDULE_WORDS)));
});

test('detail.schedule: an unscheduled job with a good run can be scheduled (fromRunid); a job with no good run gets neither flag', async () => {
  const home = keysHome();
  makeRun(home, { runid: 'g1', spec: specOf({ job: 'green-job' }), outcome: 'green' });
  makeRun(home, { runid: 'x1', spec: specOf({ job: 'red-job' }), outcome: 'cap-halt' });
  const p = await panel({ home });
  assert.deepEqual([(await detail(p, 'g1')).schedule.scheduled, (await detail(p, 'g1')).schedule.canSchedule, (await detail(p, 'g1')).schedule.fromRunid], [false, true, 'g1']);
  const red = (await detail(p, 'x1')).schedule;
  assert.deepEqual([red.scheduled, red.canSchedule], [false, false], 'a job with no good run has no Schedule button');
  assert.equal('fromRunid' in red, false);
});

test('detail.schedule: a RUBRIC job is schedulable only once it holds an honoured accept', async () => {
  const home = keysHome();
  makeRun(home, { runid: 'rb', spec: specOf({ job: 'rub', files: true }), outcome: 'green', accepted: false });
  makeRun(home, { runid: 'rb-ok', spec: specOf({ job: 'rub-ok', files: true }), outcome: 'green', accepted: true });
  const p = await panel({ home });
  assert.equal((await detail(p, 'rb')).schedule.canSchedule, false);
  assert.equal((await detail(p, 'rb-ok')).schedule.canSchedule, true);
});

test('the green gate is memoised on the job\'s run-list state: a new accept on the spine releases it at the next read', async () => {
  const home = keysHome();
  const r = makeRun(home, { runid: 'rb2', spec: specOf({ job: 'rub2', files: true }), outcome: 'green', accepted: false });
  const p = await panel({ home });
  assert.equal((await detail(p, 'rb2')).schedule.canSchedule, false);
  appendFileSync(r.spine, `${JSON.stringify({ type: 'door-decision', decision: 'accept', honoured: true, ts: '2026-10-01T10:07:00.000Z', seq: 9 })}\n`);
  assert.equal((await detail(p, 'rb2')).schedule.canSchedule, true, 'the key (spine size/mtime) moved, so the gate was asked again');
});

test('NEXT goes red when the month is used up, in the server\'s words (two-decimal money), and only for this month', async () => {
  const w = await fireWorld();
  appendRow(w.ledger, { kind: 'monthly-exhausted', sig: w.sig, at: w.now(), told: 'x', leftUsd: 0.12, needUsd: 0.5, atLeast: false });
  const d = (await detail(w.p, 'r1')).schedule;
  assert.equal(d.nextRed, true);
  assert.equal(d.next, 'Paused: not enough money left this month ($0.12 left, a run needs up to $0.50). Raise the monthly limit in Settings, or it starts again on the 1st.');
});

test('T19b: "since this signing" is keyed by the signature hash — an older signing\'s red, with the clock set BACK before it, does not lead the new schedule\'s NEXT', async () => {
  const w = await fireWorld();
  const oldSig = w.sig;
  appendRow(w.ledger, { kind: 'refused', sig: oldSig, at: w.now() + 5_000_000, told: 'old', why: 'The key is gone.' });
  assert.match((await detail(w.p, 'r1')).schedule.next, /^The last try did not start: The key is gone\. Next run/);
  assert.equal((await detail(w.p, 'r1')).schedule.nextRed, true);
  // re-sign with a different cap = a new signing
  w.now.set(SLOT - 3600_000);
  const b = { ...w.body, capUsd: 2 };
  const pre = await w.p.post('/api/author/schedule-prepare', b);
  assert.equal((await w.p.post('/api/author/schedule', { ...b, hash: pre.body.hash })).status, 200);
  w.now.set(SLOT - 7_200_000); // set the injected clock BACK before the old row's time
  const d = (await detail(w.p, 'r1')).schedule;
  assert.doesNotMatch(d.next, /did not start/);
  assert.equal(d.nextRed, false);
});

test('"the next run does not wait for the Accept": a job whose newest run waits at its review door says so, not red', async () => {
  const w = await fireWorld();
  const r2 = makeRun(w.home, { runid: 'r2', spec: specOf({ files: true, input: w.notes }), outcome: 'green', accepted: false, at: '2026-10-02T10:00:00.000Z' });
  appendFileSync(r2.spine, `${JSON.stringify({ type: 'review-door', outcome: 'green', ts: new Date().toISOString(), seq: 8 })}\n`);
  const d = (await detail(w.p, 'r1')).schedule;
  assert.equal(d.next, 'Run 2 is waiting for your Accept. The next scheduled run does not wait for it.');
  assert.equal(d.nextRed, false);
});

test('detail: a scheduled run says why it started and, when late, the catch-up sentence; a hand run says neither', async () => {
  const w = await fireWorld();
  assert.equal((await detail(w.p, 'r1')).startedBy, null);
  assert.equal((await detail(w.p, 'r1')).catchUp, null);
  // `trigger.json` is written beside the run's resolved-spec.json (its session folder) by the starter; two runs: one on time, one late
  const mk = (runid, rec) => {
    const run = makeRun(w.home, { runid, spec: specOf({ files: true, input: w.notes }), outcome: 'green', accepted: true, at: '2026-10-03T10:00:00.000Z' });
    writeFileSync(join(run.out, 'trigger.json'), JSON.stringify(rec));
  };
  mk('on-time', { kind: 'clock', reason: 'Started by the schedule: Every day at 09:00', catchUp: false });
  mk('late', { kind: 'clock', reason: 'Started by the schedule: Every day at 09:00 (catch-up)', catchUp: true });
  const a = await detail(w.p, 'on-time');
  assert.equal(a.startedBy, 'Started by the schedule: Every day at 09:00');
  assert.equal(a.catchUp, null);
  const b = await detail(w.p, 'late');
  assert.equal(b.startedBy, 'Started by the schedule: Every day at 09:00 (catch-up)');
  assert.match(b.catchUp, /^This run was a catch-up: it started more than 2 minutes after its set time/);
});

// ---------------------------------------------------------------- GET /api/runs `scheduled`
test('GET /api/runs: scheduled[] soonest first, a file trigger (no clock time) after those that have one, by name; the click target is the job\'s HEAD run by time', async () => {
  const home = keysHome();
  const now = clock(SLOT - 3600_000);
  const inbox = tmp('ts-inbox-');
  const notes = join(tmp('ts-in-'), 'n.txt');
  writeFileSync(notes, 'x\n');
  // job b: two runs; the NEWER one is appended FIRST in the file (server order is not time order)
  makeRun(home, { runid: 'b-new', spec: specOf({ job: 'b-job', files: true, input: notes }), outcome: 'green', accepted: true, at: '2026-10-05T10:00:00.000Z' });
  makeRun(home, { runid: 'b-old', spec: specOf({ job: 'b-job', files: true, input: notes }), outcome: 'green', accepted: true, at: '2026-10-01T10:00:00.000Z' });
  makeRun(home, { runid: 'a-run', spec: specOf({ job: 'a-job', files: true, input: notes }), outcome: 'green', accepted: true });
  makeRun(home, { runid: 'z-run', spec: specOf({ job: 'z-files', files: true, input: notes }), outcome: 'green', accepted: true });
  makeRun(home, { runid: 'm-run', spec: specOf({ job: 'm-files', files: true, input: notes }), outcome: 'green', accepted: true });
  const p = await panel({ home, now });
  await sign(p, 'a-run', notes, { kind: 'daily', hour: 15, minute: 0 });
  await sign(p, 'b-new', notes, { kind: 'daily', hour: 9, minute: 0 });
  await sign(p, 'z-run', notes, { kind: 'new-file', folder: inbox });
  await sign(p, 'm-run', notes, { kind: 'file-updated', path: notes });
  const list = (await p.get('/api/runs')).body.scheduled;
  assert.deepEqual(list.map((s) => s.job), ['b-job', 'a-job', 'm-files', 'z-files'], 'soonest clock first, file triggers last by name');
  assert.equal(list[0].runId, 'b-new', 'the job\'s newest run by time, not the first in file order');
  assert.deepEqual([list[0].at, list[0].in, list[0].words], ['today 09:00', 'next in 1h', 'Every day at 09:00']);
  assert.deepEqual([list[1].at, list[1].in, list[1].words], ['today 15:00', 'next in 7h', 'Every day at 15:00']);
  assert.equal(list[2].at, null);
  assert.equal(list[2].in, null);
  assert.equal(list[2].words, 'When n.txt is updated');
  assert.match(list[3].words, /^When a new file arrives in /);
  // a cancelled job leaves the list
  const cancel = await p.post('/api/author/schedule-prepare', { runid: 'a-run', when: null });
  await p.post('/api/author/schedule', { runid: 'a-run', when: null, hash: cancel.body.hash });
  assert.ok(!(await p.get('/api/runs')).body.scheduled.some((s) => s.job === 'a-job'));
});

test('GET /api/runs with no schedule: scheduled is an empty list, never missing', async () => {
  const home = keysHome();
  makeRun(home, { runid: 'q', spec: specOf({ job: 'q-job' }), outcome: 'green' });
  const p = await panel({ home });
  assert.deepEqual((await p.get('/api/runs')).body.scheduled, []);
});

// ---------------------------------------------------------------- the card
test('start-from?mode=schedule: the card data — current words, no refusal when scheduled, the edit note; a job with no good run is refused in words; plain start-from carries the edit note on a scheduled job', async () => {
  const w = await fireWorld();
  const card = (await w.p.get('/api/author/start-from?mode=schedule&runid=r1')).body;
  assert.equal(card.ok, true);
  assert.equal(card.scheduleCard.scheduled, true);
  assert.equal(card.scheduleCard.now, 'Every day at 09:00');
  assert.equal(card.scheduleCard.refusal, null);
  assert.deepEqual(card.scheduleCard.trigger, DAILY);
  assert.match(card.scheduleCard.editNote, /^This job runs by itself \(Every day at 09:00\)\. Signing this edit clears that back to By hand\./);
  assert.equal(card.scheduleCard.words.cancelSchedule, 'Cancel schedule');
  const plain = (await w.p.get('/api/author/start-from?runid=r1')).body;
  assert.equal(plain.editNote, card.scheduleCard.editNote, 'Edit in chat shows the note before signing');
  // an unscheduled green job: no note; scheduleCard.scheduled false
  const home = keysHome();
  makeRun(home, { runid: 'u1', spec: specOf({ job: 'u-job' }), outcome: 'green' });
  const p = await panel({ home });
  const u = (await p.get('/api/author/start-from?mode=schedule&runid=u1')).body;
  assert.equal(u.scheduleCard.scheduled, false);
  assert.equal(u.scheduleCard.refusal, null);
  assert.equal(u.scheduleCard.editNote, null);
  assert.equal((await p.get('/api/author/start-from?runid=u1')).body.editNote, null);
});

// ---------------------------------------------------------------- a spawning fired run is [▶] starting, never [?]
test('a fired run that has appended its row but not yet its spine reads [▶] starting in the list and the detail — never [?] or file missing', async () => {
  const home = keysHome();
  const d = tmp('ts-spawn-');
  writeFileSync(join(d, 'run-u.mjs'), 'setInterval(() => {}, 1000);\n');
  const c = spawn(process.execPath, [join(d, 'run-u.mjs')], { stdio: 'ignore' });
  waitExec(c.pid);
  test.after(() => { try { c.kill('SIGKILL'); } catch { /* gone */ } });
  mkdirSync(join(d, 'source-seed', 'sp-bareloop'), { recursive: true });
  appendRun({ at: new Date().toISOString(), runid: 'spawning', job: 'sched-job', spine: join(d, 'source-seed', 'sp-bareloop', 'u-spawning.jsonl'), patient: null, via: 'run-u', pid: c.pid }, { home });
  const p = await panel({ home });
  const row = (await p.get('/api/runs')).body.runs.find((r) => r.runid === 'spawning');
  assert.equal(row.starting, true);
  assert.equal(row.glyph, '▶');
  assert.equal(row.live, true);
  assert.notEqual(row.glyph, '?');
  assert.equal(row.fileMissing, false);
  const det = await detail(p, 'spawning');
  assert.equal(det.starting, true);
  assert.equal(det.glyph, '▶');
});
