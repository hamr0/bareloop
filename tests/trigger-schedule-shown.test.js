// RULED 2026-10-15 (aligned with fwdloop M9 am7): the schedule shown on the Run, Job and Audit tabs. Server side over real HTTP on a scratch home;
// the page side (frame and row red, By hand, the one block) is in trigger-schedule-buttons-page.test.js. Each test below can FAIL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendRow } from '../src/triggerledger.js';
import { dateTimeWords, lowerFirst, scheduleSignFor } from '../src/schedulewords.js';
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

const section = async (p, runid) => (await detail(p, runid)).scheduleSection;

test('Audit section: the head sign is [▶] only while a run of the job runs, [✗] when the SCHEDULE row is red, else [·]', () => {
  assert.equal(scheduleSignFor({ running: true, red: true }).sign, '▶');
  assert.equal(scheduleSignFor({ running: false, red: true }).sign, '✗');
  assert.equal(scheduleSignFor({ running: false, red: false }).sign, '·');
  assert.equal(scheduleSignFor({ running: true, red: false }).sign, '▶');
});

test('Audit section: every run of a scheduled job has ONE `schedule` section; a hand run says `by hand`, the origin run adds where the schedule was set', async () => {
  const w = await fireWorld();
  const o = await section(w.p, 'r1');
  assert.equal(o.title, 'schedule');
  assert.equal(o.sign, '·');
  assert.equal(o.head, 'every day at 09:00 · from run-1');
  assert.deepEqual(o.rows, [{ label: 'this run', text: `${dt('2026-10-01T10:00:00.000Z')}  by hand. The schedule was set from this run.` }, { label: 'tries', text: 'none' }]);
  makeRun(w.home, { runid: 'r9', spec: w.spec, outcome: 'green', accepted: true, at: '2026-10-02T10:00:00.000Z' });
  assert.equal((await section(w.p, 'r9')).rows[0].text, `${dt('2026-10-02T10:00:00.000Z')}  by hand.`);
  assert.equal((await detail(w.p, 'r1')).startedAudit, undefined, 'the old first row is gone while the schedule is on');
});

test('Audit section: a run the schedule started says how (file named, catch-up with minutes late); the section is the same words on every run of the job', async () => {
  const w = await fireWorld({ when: 'files' });
  scheduledRun(w, 'r3', { kind: 'file', trigger: 'When a new file arrives in /x/', triggerKind: 'new-file', file: '/x/litectx.md', originRunid: 'r1' }, '2026-10-04T10:00:00.000Z');
  const s = await section(w.p, 'r3');
  assert.match(s.head, /^when a new file arrives in .*\/ · from run-1$/);
  assert.equal(s.rows[0].label, 'this run');
  assert.equal(s.rows[0].text, `${dt('2026-10-04T10:00:00.000Z')}  started by the schedule · new file litectx.md`);
  assert.equal((await section(w.p, 'r1')).head, s.head);
  const c = await fireWorld();
  scheduledRun(c, 'r2', { ...CLOCK_REC, catchUp: true, lateMs: 600_000 });
  assert.equal((await section(c.p, 'r2')).rows[0].text, `${dt('2026-10-03T10:00:00.000Z')}  started by the schedule · every day at 09:00 · catch-up, 10 min late`);
});

test('Audit section tries: fires that started NOTHING of ALL signings of the job, newest first, at most 7, in plain words; the folded head counts them; the SCHEDULE row red turns the sign to [✗]', async () => {
  const w = await fireWorld();
  const t = w.now();
  appendRow(w.ledger, { kind: 'refused', sig: w.sig, at: t, told: 'a', why: 'The destination does not exist. Nothing started.' });
  appendRow(w.ledger, { kind: 'busy', sig: w.sig, at: t + 60_000, told: 'b', why: 'x' });
  appendRow(w.ledger, { kind: 'monthly-exhausted', sig: w.sig, at: t + 120_000, told: 'c', leftUsd: 0.01, needUsd: 0.03, atLeast: false });
  appendRow(w.ledger, { kind: 'refused', sig: 'an-older-signing', at: t + 180_000, told: 'd', why: 'Not mine. Nothing started.' });
  const s = await section(w.p, 'r1');
  assert.equal(s.sign, '✗');
  assert.equal(s.head, 'every day at 09:00 · from run-1 · 4 tries started nothing');
  assert.deepEqual(s.rows.slice(1).map((r) => [r.label, r.text]), [
    ['tries', `${dateTimeWords(t + 180_000)}  refused: not mine. Nothing started.`],
    ['', `${dateTimeWords(t + 120_000)}  month used up: $0.01 left, needs $0.03. Nothing spent.`],
    ['', `${dateTimeWords(t + 60_000)}  busy: a run of this job was still working. Nothing started.`],
    ['', `${dateTimeWords(t)}  refused: the destination does not exist. Nothing started.`],
  ]);
  // another signing from a different origin stays in (all signings), and the same section is on every run
  makeRun(w.home, { runid: 'r8', spec: w.spec, outcome: 'green', accepted: true, at: '2026-10-02T10:00:00.000Z' });
  assert.equal((await section(w.p, 'r8')).rows.length, 5);
  for (let i = 0; i < 9; i += 1) appendRow(w.ledger, { kind: 'busy', sig: w.sig, at: t + 1_000_000 + i * 1000, told: `n${i}`, why: 'x' });
  const m = await section(w.p, 'r1');
  assert.equal(m.rows.length, 1 + 7);
  assert.match(m.head, / · 13 tries started nothing$/);
  // one try reads in the singular
  const one = await fireWorld();
  appendRow(one.ledger, { kind: 'busy', sig: one.sig, at: one.now(), told: 'b', why: 'x' });
  assert.match((await section(one.p, 'r1')).head, / · 1 try started nothing$/);
});

test('Audit section: no schedule now = no section; a run a cancelled schedule started keeps its old single `started by the schedule` line', async () => {
  const w = await fireWorld();
  scheduledRun(w, 'r2', CLOCK_REC);
  const c = await w.p.post('/api/author/schedule-prepare', { runid: 'r1', when: null });
  await w.p.post('/api/author/schedule', { runid: 'r1', when: null, hash: c.body.hash });
  assert.equal((await detail(w.p, 'r1')).scheduleSection, undefined);
  assert.equal((await detail(w.p, 'r1')).startedAudit, undefined);
  const d = await detail(w.p, 'r2');
  assert.equal(d.scheduleSection, undefined);
  assert.equal(d.startedAudit, 'started by the schedule · every day at 09:00 · slot 09:00 · from run-1');
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
  assert.match(s.line2, /^no run yet · next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d\/\d\d 09:00$/);
  const f = (await detail((await fireWorld({ when: 'files' })).p, 'r1')).schedule;
  assert.equal(f.line2, 'no run yet · next: waiting for a new file');
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
  assert.match(s.line2, new RegExp(`^last ${dateTimeWords(t)} · busy: a run of this job was still working · next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d\\d/\\d\\d 09:00$`));
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

test('Run tab SCHEDULE: month used up is red only in the month it happened; a last one from an EARLIER month is not red and no "raise the limit" next follows (RULED 2026-10-15)', async () => {
  const w = await fireWorld();
  const earlier = w.now() - 40 * 86_400_000;
  appendRow(w.ledger, { kind: 'monthly-exhausted', sig: w.sig, at: earlier, told: 'm', leftUsd: 0.01, needUsd: 0.5 });
  const old = (await detail(w.p, 'r1')).schedule;
  assert.equal(old.problem, false, 'an earlier month is not red');
  assert.doesNotMatch(old.line2, /raise the limit/);
  assert.match(old.line2, / · next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d\/\d\d 09:00$/);
  appendRow(w.ledger, { kind: 'monthly-exhausted', sig: w.sig, at: w.now(), told: 'm2', leftUsd: 0.01, needUsd: 0.5 });
  const cur = (await detail(w.p, 'r1')).schedule;
  assert.equal(cur.problem, true, 'this month is red');
  assert.match(cur.line2, /next: raise the limit in Settings/);
});

test('Run tab SCHEDULE: signed but not armed yet ends `next: not armed yet` in normal colour, for a clock and a file schedule alike; before the first fire it starts `no run yet`', async () => {
  for (const when of [undefined, 'files']) {
    const w = await fireWorld(when ? { when } : {});
    const rows = readFileSync(w.ledger, 'utf8').split('\n').filter((l) => l && JSON.parse(l).kind !== 'armed');
    writeFileSync(w.ledger, rows.length ? `${rows.join('\n')}\n` : '');
    const s = (await detail(w.p, 'r1')).schedule;
    assert.equal(s.problem, false, 'unarmed is not red');
    assert.equal(s.line2, 'no run yet · next: not armed yet');
  }
});
