// ITEM33-BUILD piece 9 (R7), rule 7: while a schedule signed with its job is OFF, the Run tab's SCHEDULE block reads the grey line "Schedule waiting for a green run" (one sentence from
// src/schedulewords.js), the Audit `schedule` section and the Job tab's Schedule row read the same state, the schedule card says it, and once it is on none of it remains. The REAL
// panel over HTTP; the words are the table's, never typed here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEDULE_WORDS, jobScheduleWords } from '../src/schedulewords.js';
import { cardWorld } from './schedule-card-world.mjs';

const WAITING = 'Schedule waiting for a green run';
async function tickAll(f) { await f.scheduler.tick(); await f.scheduler.settled(); await f.scheduler.tick(); }

test('the one sentence is "Schedule waiting for a green run" (fwd\'s words), kept in the schedule words table', () => {
  assert.equal(SCHEDULE_WORDS.waiting, WAITING);
  assert.equal(jobScheduleWords({ trigger: { kind: 'daily', hour: 9, minute: 0 }, originNo: null, model: 'm', destination: null, waiting: true }), 'every day at 09:00 · schedule waiting for a green run · m');
  assert.equal(jobScheduleWords({ trigger: { kind: 'daily', hour: 9, minute: 0 }, originNo: null, model: 'm', destination: null }), 'every day at 09:00 · m', 'not waiting: as before');
});

test('Run tab, Audit and Job tab say it while the schedule waits, and stop saying it once the job\'s green run turns it on', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ jobName: 'tk-words', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  assert.equal(out.signed.status, 200);
  f.run(out.spec, { runid: 'r1', outcome: 'red' });
  const detail = (await f.w.get('/api/runs/r1')).body;
  assert.equal(detail.schedule.scheduled, true);
  assert.equal(detail.schedule.waiting, true);
  assert.equal(detail.schedule.next, WAITING, 'the NEXT line');
  assert.equal(detail.schedule.nextRed, false, 'grey, not red');
  assert.equal(detail.schedule.line2, WAITING, 'the SCHEDULE row\'s second line is this one sentence (no "no run yet" beside it)');
  assert.equal(detail.schedule.problem, false);
  assert.equal(detail.schedule.text, 'Every day at 09:00');
  assert.match(detail.scheduleSection.head, /every day at 09:00 · schedule waiting for a green run/);
  const job = (await f.w.get('/api/runs/r1/job')).body;
  assert.match(job.schedule, /every day at 09:00 · schedule waiting for a green run/);
  // the schedule card (Cancel / modify schedule) says it too
  const card = f.door.cardFor('tk-words');
  assert.equal(card.scheduled, true);
  assert.equal(card.now, `Every day at 09:00 · ${WAITING}`);
  // a green run turns it on: the sentence is gone everywhere
  f.run(out.spec, { runid: 'r2', outcome: 'green' });
  await tickAll(f);
  const on = (await f.w.get('/api/runs/r1')).body;
  assert.equal(on.schedule.waiting, false);
  assert.doesNotMatch(on.schedule.line2, /waiting for a green run/);
  assert.doesNotMatch(on.scheduleSection.head, /waiting for a green run/);
  assert.doesNotMatch((await f.w.get('/api/runs/r1/job')).body.schedule, /waiting for a green run/);
  assert.equal(f.door.cardFor('tk-words').now, 'Every day at 09:00');
});

test('a waiting schedule whose newest run waits for the Accept still reads as not armed: the NEXT line is the waiting sentence, not an "armed" one', async (t) => {
  const f = await cardWorld(t);
  await f.signCard(f.card({ jobName: 'tk-acc', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  const v = f.door.view('tk-acc', { waitingRunNo: 1 });
  assert.equal(v.waiting, true);
  assert.equal(v.next, WAITING);
  assert.equal(v.nextWords, WAITING);
  assert.equal(v.accept, true, 'the Accept is still named on the SCHEDULE row\'s second line');
});
