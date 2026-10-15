// RULED 2026-10-15 (aligned with fwdloop M9 am7): the schedule shown on the Run, Job and Audit tabs. Server side over real HTTP on a scratch home;
// the page side (frame and row red, By hand, the one block) is in trigger-schedule-buttons-page.test.js. Each test below can FAIL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendRow } from '../src/triggerledger.js';
import { dateTimeWords, lowerFirst } from '../src/schedulewords.js';
import { CLOCK, fireWorld, keysHome, makeRun, panel, specOf, SLOT } from './trigger-world.mjs';

const detail = async (p, runid) => (await p.get(`/api/runs/${runid}`)).body;
const job = async (p, runid) => (await p.get(`/api/runs/${runid}/job`)).body;
const dt = (iso) => dateTimeWords(Date.parse(iso));

/** a second run of the scheduled job that the schedule started: its `trigger.json` as the starter writes it */
function scheduledRun(w, runid, rec, at = '2026-10-03T10:00:00.000Z') {
  const run = makeRun(w.home, { runid, spec: w.spec, outcome: 'green', accepted: true, at });
  writeFileSync(join(run.out, 'trigger.json'), JSON.stringify(rec));
  return run;
}
const CLOCK_REC = { kind: 'clock', trigger: 'Every day at 09:00', triggerKind: 'daily', slot: SLOT, catchUp: false, originRunid: 'r1', sessionId: 's1' };

test('the starter records what the Job tab and Audit need in trigger.json: kind, session, origin run, signature, lateness', async () => {
  const w = await fireWorld();
  await w.door.fire('sched-job', CLOCK({ catchUp: true, missed: 1 }));
  const trig = JSON.parse(readFileSync(join(w.made[0].session.state.outDir, 'trigger.json'), 'utf8'));
  assert.deepEqual([trig.triggerKind, trig.sessionId, trig.originRunid, trig.sig], ['daily', 's1', 'r1', w.sig]);
  assert.ok(Number.isFinite(trig.lateMs) && trig.lateMs >= 0 && Number.isFinite(trig.startedAt), 'lateness = the starter\'s clock minus the slot');
});

test('Job tab: a hand run says `By hand` with its start time; a scheduled run says it was scheduled (catch-up with minutes late), a file run names the file', async () => {
  const w = await fireWorld();
  assert.equal((await job(w.p, 'r1')).started, `By hand · ${dt('2026-10-01T10:00:00.000Z')}`);
  scheduledRun(w, 'r2', { ...CLOCK_REC, catchUp: true, lateMs: 600_000 });
  assert.equal((await job(w.p, 'r2')).started, `By the schedule: every day at 09:00 · catch-up, 10 min late · ${dt('2026-10-03T10:00:00.000Z')}`);
  scheduledRun(w, 'r3', { kind: 'file', trigger: 'When a new file arrives in /x/', triggerKind: 'new-file', file: '/x/8een.md', sha: 'a' }, '2026-10-04T10:00:00.000Z');
  assert.equal((await job(w.p, 'r3')).started, `By a new file: 8een.md · ${dt('2026-10-04T10:00:00.000Z')}`);
  scheduledRun(w, 'r4', { kind: 'file', trigger: 'When aging.csv is updated', triggerKind: 'file-updated', file: '/x/aging.csv', sha: 'b' }, '2026-10-05T10:00:00.000Z');
  assert.equal((await job(w.p, 'r4')).started, `By a file update: aging.csv · ${dt('2026-10-05T10:00:00.000Z')}`);
  // an OLD record (no triggerKind / lateMs) still reads
  scheduledRun(w, 'r5', { kind: 'file', trigger: 'When a new file arrives in /x/', file: '/x/old.md' }, '2026-10-06T10:00:00.000Z');
  assert.match((await job(w.p, 'r5')).started, /^By a new file: old\.md · /);
});

test('Job tab Schedule: the job\'s schedule now, bound to its origin run (run-N), model and destination; it IS the Run tab line (first letter lowered), so they cannot disagree', async () => {
  const w = await fireWorld();
  const j = await job(w.p, 'r1');
  assert.equal(j.schedule, 'every day at 09:00 · from run-1 · claude-sonnet-5 · /tw/out');
  const run = (await detail(w.p, 'r1')).schedule;
  assert.equal(j.schedule.split(' · ')[0], lowerFirst(run.text), 'same words as the SCHEDULE line');
  // a file schedule
  const f = await fireWorld({ when: 'files' });
  const jf = await job(f.p, 'r1');
  assert.equal(jf.schedule.split(' · ')[0], lowerFirst((await detail(f.p, 'r1')).schedule.text));
  assert.match(jf.schedule, /^when a new file arrives in .*\/ · from run-1 · /);
  // after a cancel it is `none`
  const c = await w.p.post('/api/author/schedule-prepare', { runid: 'r1', when: null });
  await w.p.post('/api/author/schedule', { runid: 'r1', when: null, hash: c.body.hash });
  assert.equal((await job(w.p, 'r1')).schedule, 'none');
});

test('Audit: a scheduled run\'s first row says so (slot, origin run, catch-up); a file run names the file; a hand run has no such row', async () => {
  const w = await fireWorld();
  assert.equal((await detail(w.p, 'r1')).startedAudit, null);
  scheduledRun(w, 'r2', { ...CLOCK_REC, catchUp: true });
  assert.equal((await detail(w.p, 'r2')).startedAudit, 'started by the schedule · every day at 09:00 · slot 09:00 · from run-1 · catch-up');
  scheduledRun(w, 'r3', { kind: 'file', trigger: 'When a new file arrives in /x/', triggerKind: 'new-file', file: '/x/8een.md', originRunid: 'r1' }, '2026-10-04T10:00:00.000Z');
  assert.equal((await detail(w.p, 'r3')).startedAudit, 'started by the schedule · new file 8een.md · from run-1');
});

test('Audit schedule group: fires that started NOTHING, newest first, at most 7, on the run the schedule was set from only, in plain words; other signings\' rows stay out', async () => {
  const w = await fireWorld();
  const t = w.now();
  appendRow(w.ledger, { kind: 'refused', sig: w.sig, at: t, told: 'a', why: 'The destination does not exist. Nothing started.' });
  appendRow(w.ledger, { kind: 'busy', sig: w.sig, at: t + 60_000, told: 'b', why: 'A run of this job is still going. This one starts when it is done.' });
  appendRow(w.ledger, { kind: 'monthly-exhausted', sig: w.sig, at: t + 120_000, told: 'c', leftUsd: 0.01, needUsd: 0.03, atLeast: false });
  appendRow(w.ledger, { kind: 'refused', sig: 'someone-elses-sig', at: t + 180_000, told: 'd', why: 'Not mine. Nothing started.' });
  const g = (await detail(w.p, 'r1')).scheduleGroup;
  assert.equal(g.title, 'schedule (3)');
  assert.deepEqual(g.lines, [
    `${dateTimeWords(t + 120_000)}  month used up — $0.01 left, needs $0.03. Nothing spent.`,
    `${dateTimeWords(t + 60_000)}  busy — a run of this job was still going. Nothing started.`,
    `${dateTimeWords(t)}  refused: the destination does not exist. Nothing started.`,
  ]);
  assert.equal((await detail(w.p, 'r1')).startedAudit, null);
  // not on another run of the job
  scheduledRun(w, 'r2', CLOCK_REC);
  assert.equal((await detail(w.p, 'r2')).scheduleGroup, null, 'the group lives on the origin run only');
  // a later signing set from the SAME origin run keeps the older rows (they point back to r1 through their `signed` row)
  const b = { ...w.body, capUsd: 2 };
  const pre = await w.p.post('/api/author/schedule-prepare', b);
  assert.equal((await w.p.post('/api/author/schedule', { ...b, hash: pre.body.hash })).status, 200);
  assert.equal((await detail(w.p, 'r1')).scheduleGroup.lines.length, 3, 'rows of the first signing still count');
  // at most 7
  for (let i = 0; i < 9; i += 1) appendRow(w.ledger, { kind: 'busy', sig: w.sig, at: t + 1_000_000 + i * 1000, told: `n${i}`, why: 'x' });
  assert.equal((await detail(w.p, 'r1')).scheduleGroup.lines.length, 7);
  assert.equal((await detail(w.p, 'r1')).scheduleGroup.title, 'schedule (7)');
});

test('Run tab: ENDED always starts with the run\'s end date and time, then the outcome word, then the reason', async () => {
  const w = await fireWorld();
  const d = await detail(w.p, 'r1');
  assert.equal(d.endedText, `${dt('2026-10-01T10:05:00.000Z')} · passed · ${d.ended.reason}`);
});

test('Run tab SCHEDULE: an unscheduled job says `By hand` (no second line); a scheduled one gives its words and `next <Day MM/DD HH:MM>`', async () => {
  const home = keysHome();
  makeRun(home, { runid: 'u1', spec: specOf({ job: 'u-job' }), outcome: 'green' });
  const p = await panel({ home });
  const u = (await detail(p, 'u1')).schedule;
  assert.equal(u.scheduled, false);
  assert.equal(u.words.byHand, 'By hand');
  assert.equal(u.words.scheduledLabel, 'SCHEDULE');
  const w = await fireWorld();
  const s = (await detail(w.p, 'r1')).schedule;
  assert.equal(s.problem, false);
  assert.match(s.line2, /^next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d\/\d\d 09:00$/);
  const f = (await detail((await fireWorld({ when: 'files' })).p, 'r1')).schedule;
  assert.equal(f.line2, 'next: waiting for a new file');
});

test('Run tab SCHEDULE: a last fire that started nothing is a problem (red) with the reason in words; a later good start clears it; the same on every run page of the job', async () => {
  const w = await fireWorld();
  const t = w.now();
  appendRow(w.ledger, { kind: 'refused', sig: w.sig, at: t, told: 'a', why: 'The destination does not exist. Nothing started.' });
  scheduledRun(w, 'r2', CLOCK_REC);
  for (const id of ['r1', 'r2']) {
    const s = (await detail(w.p, id)).schedule;
    assert.equal(s.problem, true, `${id}: a refused last is a problem`);
    assert.equal(s.line2, `last ${dateTimeWords(t)} · refused: the destination does not exist · next: fix it in Cancel / modify schedule`);
  }
  appendRow(w.ledger, { kind: 'monthly-exhausted', sig: w.sig, at: t + 2000, told: 'c', leftUsd: 0.01, needUsd: 0.5 });
  const month = (await detail(w.p, 'r1')).schedule;
  assert.equal(month.problem, true, 'month used up is red');
  assert.equal(month.line2, `last ${dateTimeWords(t + 2000)} · month used up: $0.01 left, needs $0.50 · next: raise the limit in Settings, or it starts on the 1st`);
  // the next fire works: a `started` row (with the session the run's trigger.json names) is the newest
  appendRow(w.ledger, { kind: 'started', sig: w.sig, at: t + 3000, key: 'k', sessionId: 's1', specHash: 'h' });
  const fixed = (await detail(w.p, 'r1')).schedule;
  assert.equal(fixed.problem, false, 'a fixed schedule is not red');
  assert.equal(fixed.line2, `last ${dateTimeWords(t + 3000)} · run-2 · passed · next ${fixed.line2.split(' · next ')[1]}`);
  assert.match(fixed.line2, / · next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d\/\d\d 09:00$/);
});

test('Run tab SCHEDULE: a catch-up start says so on the `last` line', async () => {
  const w = await fireWorld();
  scheduledRun(w, 'r2', { ...CLOCK_REC, catchUp: true });
  appendRow(w.ledger, { kind: 'started', sig: w.sig, at: w.now(), key: 'k', sessionId: 's1', specHash: 'h' });
  assert.match((await detail(w.p, 'r1')).schedule.line2, /^last \d\d\/\d\d \d\d:\d\d · run-2 · passed · catch-up · next /);
});

test('Run tab SCHEDULE: busy is NOT a problem (normal colours, no "fix it"); the normal next for its kind follows; "at most" money is said', async () => {
  const w = await fireWorld();
  const t = w.now();
  appendRow(w.ledger, { kind: 'busy', sig: w.sig, at: t, told: 'b', why: 'A run of this job is still going. This one starts when it is done.' });
  const s = (await detail(w.p, 'r1')).schedule;
  assert.equal(s.problem, false);
  assert.match(s.line2, new RegExp(`^last ${dateTimeWords(t)} · busy: a run of this job was still going · next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d\\d/\\d\\d 09:00$`));
  assert.doesNotMatch(s.line2, /fix it/);
  appendRow(w.ledger, { kind: 'monthly-exhausted', sig: w.sig, at: t + 1000, told: 'm', leftUsd: 0.01, needUsd: 0.5, atLeast: true });
  assert.match((await detail(w.p, 'r1')).schedule.line2, /· month used up: at most \$0\.01 left, needs \$0\.50 · next: raise the limit/);
});

test('Run tab SCHEDULE: a run waiting for the person\'s Accept is said inside line 2, after the last part, and is not red', async () => {
  const w = await fireWorld();
  const r2 = makeRun(w.home, { runid: 'r2', spec: w.spec, outcome: 'green', accepted: false, at: '2026-10-03T10:00:00.000Z' });
  writeFileSync(join(r2.out, 'trigger.json'), JSON.stringify(CLOCK_REC));
  appendFileSync(r2.spine, `${JSON.stringify({ type: 'review-door', outcome: 'green', ts: new Date().toISOString(), seq: 8 })}\n`);
  const t = w.now();
  appendRow(w.ledger, { kind: 'started', sig: w.sig, at: t, key: 'k', sessionId: 's1', specHash: 'h' });
  const s = (await detail(w.p, 'r1')).schedule;
  assert.equal(s.problem, false);
  assert.match(s.line2, new RegExp(`^last ${dateTimeWords(t)} · run-2 · passed · waiting for your Accept \\(the next run does not wait\\) · next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) `));
});
