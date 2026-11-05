// ITEM33-BUILD piece 9 (R7), the New job card's Schedule row, $0, no model: the card refuses what cannot be signed BEFORE any session exists; a card with no schedule signs a job that
// hashes exactly as before (the real archived spec stands as the witness); a schedule picked on the card is part of the signed spec, so the FIRST run's hash covers it, and `workflowKey`
// ignores it. Ported in spirit from fwd test/m13-p5-card.test.js (the real card routes and the real door, not stubs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardScheduleOf } from '../src/cardschedule.js';
import { CARD_FIELDS, FILES_DESTINATION_WORDS, cardFields } from '../src/panel/authorsession.js';
import { signRun } from '../src/panel/authorroutes.js';
import { jobSpecHash, workflowKey, validateJob } from '../src/job.js';
import { readLedger } from '../src/triggerledger.js';
import { cardWorld, LIST } from './schedule-card-world.mjs';
import { createSession } from '../src/panel/authorsession.js';
import { draftSeams, keysHome, until } from './flowtype-world.mjs';

const OLD = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mv5bk400-resolved-spec.json'), 'utf8'));
const TOOLS = ['issue_read', 'list_issues'];
const ticketInputs = [{ n: 1, label: 'repo', value: '/r' }, { n: 2, label: 'issues', value: LIST }];
const ctx = (over = {}) => ({ flowType: 'tickets', pick: { server: 'github', tools: TOOLS }, inputs: ticketInputs, ...over });

test('an existing job with no schedule hashes as before: the REAL archived spec (run mv5bk400) keeps its hash and key, carries no trigger, and a trigger moves the hash but never the workflow key', () => {
  assert.equal(jobSpecHash(OLD), 'db2333d0a54886349093bb64dc0a4c9a1f263ffe1562de1faf720280fdca640b', 'the archived spec hashes as before this build');
  assert.equal(workflowKey(OLD), 'fb777a06e2d14c38a9a7a6be9f4c636cd4845d4b81555a60f2c4d62f028fb090');
  assert.equal('trigger' in OLD, false);
  const scheduled = { ...OLD, trigger: { kind: 'daily', hour: 9, minute: 0 } };
  assert.equal(workflowKey(scheduled), workflowKey(OLD), 'workflowKey is the same with and without a trigger (so the first green still counts for the schedule it was signed with)');
  assert.notEqual(jobSpecHash(scheduled), jobSpecHash(OLD), 'the trigger IS in the signed hash, so the first run already covers it');
  // (the archived spec predates today's genre menu, so it is red today for that reason alone: the trigger must add no red of its own)
  assert.deepEqual(validateJob(scheduled, { shellCapUsd: scheduled.budgetUsd }).reds, validateJob(OLD, { shellCapUsd: OLD.budgetUsd }).reds);
  const ticket = { ...OLD, flowType: 'tickets', trigger: { kind: 'new-ticket', input: 'issues' } };
  assert.equal(workflowKey(ticket), workflowKey({ ...OLD, flowType: 'tickets' }));
});

test('the card fields carry `schedule`; a card that picked nothing (absent, null, by hand) asks for no schedule', () => {
  assert.ok(CARD_FIELDS.includes('schedule'));
  assert.deepEqual(cardFields({ jobName: 'j', schedule: { kind: 'daily', hour: 9, minute: 0 }, stray: 1 }), { jobName: 'j', schedule: { kind: 'daily', hour: 9, minute: 0 } });
  for (const none of [undefined, null, { kind: 'hand' }]) assert.deepEqual(cardScheduleOf({ jobName: 'j', schedule: none }, ctx()), { ok: true, trigger: null });
  assert.deepEqual(cardScheduleOf({ jobName: 'j' }, ctx()), { ok: true, trigger: null });
});

test('cardScheduleOf: Every day at HH:MM is the card\'s own data; a bad time is refused in words', () => {
  assert.deepEqual(cardScheduleOf({ schedule: { kind: 'daily', hour: 9, minute: 5 } }, ctx({ flowType: 'plain', pick: null })), { ok: true, trigger: { kind: 'daily', hour: 9, minute: 5 } });
  for (const bad of [{ kind: 'daily', hour: null, minute: null }, { kind: 'daily', hour: 24, minute: 0 }, { kind: 'daily', hour: 9, minute: 60 }, { kind: 'daily' }, { kind: 'daily', hour: 9, minute: 0, folder: '/x' }]) {
    const r = cardScheduleOf({ schedule: bad }, ctx());
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.error, / Nothing spent\.$/);
  }
  assert.equal(cardScheduleOf({ schedule: { kind: 'cron', expr: '* * * * *' } }, ctx()).ok, false, 'never cron text');
  assert.equal(cardScheduleOf({ schedule: 'daily' }, ctx()).ok, false);
});

test('cardScheduleOf: a file trigger is not a card choice (it is set after the first good run)', () => {
  const r = cardScheduleOf({ schedule: { kind: 'new-file', folder: '/x' } }, ctx({ flowType: 'plain', pick: null }));
  assert.equal(r.ok, false);
  assert.match(r.error, /file trigger is set after the first good run\. Nothing spent\.$/);
});

test('cardScheduleOf: When a new ticket arrives is filled from the card - one issues list, the pick\'s list_issues - and refused in words otherwise', () => {
  assert.deepEqual(cardScheduleOf({ schedule: { kind: 'new-ticket' } }, ctx()), { ok: true, trigger: { kind: 'new-ticket', input: 'issues' } });
  assert.deepEqual(cardScheduleOf({ schedule: { kind: 'new-ticket', input: 'x' } }, ctx()), { ok: true, trigger: { kind: 'new-ticket', input: 'issues' } }, 'the input is the card\'s to fill, never the page\'s');
  const plain = cardScheduleOf({ schedule: { kind: 'new-ticket' } }, ctx({ flowType: 'plain', pick: null }));
  assert.match(plain.error, /^Only a Tickets MCP job can start on a new ticket\. Nothing spent\.$/);
  const noList = cardScheduleOf({ schedule: { kind: 'new-ticket' } }, ctx({ inputs: [ticketInputs[0]] }));
  assert.equal(noList.ok, false);
  assert.match(noList.error, / Nothing spent\.$/);
  const noTool = cardScheduleOf({ schedule: { kind: 'new-ticket' } }, ctx({ pick: { server: 'github', tools: ['issue_read'] } }));
  assert.match(noTool.error, /do not include list_issues/);
  const two = cardScheduleOf({ schedule: { kind: 'new-ticket' } }, ctx({ inputs: [...ticketInputs, { n: 3, label: 'more', value: 'https://github.com/o/s/issues' }] }));
  assert.equal(two.error, 'When a new ticket arrives needs exactly one ticket list in Inputs. Nothing spent.');
  const pulls = cardScheduleOf({ schedule: { kind: 'new-ticket' } }, ctx({ inputs: [ticketInputs[0], { n: 2, label: 'prs', value: 'https://github.com/o/r/pulls' }] }));
  assert.equal(pulls.ok, false, 'a pulls list is not an issues list');
});

test('cardScheduleOf: a job that already has a schedule is not overwritten from the card', () => {
  const r = cardScheduleOf({ jobName: 'tk-job', schedule: { kind: 'daily', hour: 9, minute: 0 } }, ctx({ hasSchedule: (j) => j === 'tk-job' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /^The job "tk-job" already has a schedule\. Change it with Cancel \/ modify schedule on one of its runs\. Nothing spent\.$/);
  assert.equal(cardScheduleOf({ jobName: 'other', schedule: { kind: 'daily', hour: 9, minute: 0 } }, ctx({ hasSchedule: (j) => j === 'tk-job' })).ok, true);
});

test('the START door: a refused Schedule starts no session; by hand and a good pick start one', async (t) => {
  const f = await cardWorld(t);
  const bad = await f.w.post('/api/author/start', f.card({ schedule: { kind: 'daily', hour: 99, minute: 0 } }));
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, / Nothing spent\.$/);
  const live = await f.w.get('/api/author/live');
  assert.equal(live.body.sessionId, null, 'nothing was started on a refusal');
  const plainTicket = await f.w.post('/api/author/start', f.card({ flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'new-ticket' } }));
  assert.match(plainTicket.body.error, /^Only a Tickets MCP job can start on a new ticket\./);
  const ok = await f.w.post('/api/author/start', f.card({ schedule: { kind: 'new-ticket' } }));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.state.card.schedule, { kind: 'new-ticket' }, 'the card keeps what the person picked (a refreshed page repaints it)');
});

test('a Destination that could not be delivered to is refused at the card with a schedule picked, in the words the sign-time rule uses, and starts no session', async (t) => {
  const f = await cardWorld(t);
  const notes = path.join(f.w.base, 'notes.txt');
  writeFileSync(notes, 'hello\n');
  const daily = { kind: 'daily', hour: 9, minute: 0 };
  // a plain-files rubric job delivers to a full folder path: a relative one is refused (relative-destination)
  const rel = await f.w.post('/api/author/start', f.card({ jobName: 'tk-files', flowType: undefined, mcp: undefined, checkType: 'rubric', inputs: `notes: ${notes}`, destination: 'out/rel', schedule: daily }));
  assert.equal(rel.status, 400);
  assert.equal(rel.body.error, FILES_DESTINATION_WORDS);
  // a repo job's Destination is a path inside the repo: an absolute one is refused
  const abs = await f.w.post('/api/author/start', f.card({ jobName: 'tk-abs', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, destination: '/tmp/elsewhere', schedule: daily }));
  assert.equal(abs.status, 400);
  assert.match(abs.body.error, /^Destination must be a path inside the repo/);
  assert.equal((await f.w.get('/api/author/live')).body.sessionId, null, 'no session, no folder');
  assert.equal(existsSync(path.join(f.dir('tk-files'), 'schedule.json')), false);
});

test('the signed spec: a card with no schedule signs NO trigger key (so an unscheduled job hashes as before); a picked schedule is a field of the spec the person signs', async (t) => {
  const f = await cardWorld(t);
  const none = await f.signCard(f.card({ jobName: 'tk-none', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}` }));
  assert.equal(none.signed.status, 200, JSON.stringify(none.signed));
  assert.equal('trigger' in none.spec, false);
  assert.equal(existsSync(path.join(f.dir('tk-none'), 'schedule.json')), false, 'no schedule file for a by-hand job');
  const hand = await f.signCard(f.card({ jobName: 'tk-hand', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'hand' } }));
  assert.equal('trigger' in hand.spec, false);
  const sched = await f.signCard(f.card({ jobName: 'tk-daily', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 6, minute: 30 } }));
  assert.equal(sched.signed.status, 200, JSON.stringify(sched.signed));
  assert.deepEqual(sched.spec.trigger, { kind: 'daily', hour: 6, minute: 30 });
  assert.equal(sched.state.specHash, jobSpecHash(sched.spec), 'the hash the person signed covers the trigger');
  assert.equal(workflowKey({ ...sched.spec, trigger: undefined }), workflowKey(sched.spec));
  const rows = readLedger(path.join(f.dir('tk-daily'), 'ledger.jsonl')).rows;
  assert.deepEqual(rows.map((r) => r.kind), ['signed', 'waiting']);
  assert.equal(rows.every((r) => r.sig === sched.state.specHash), true);
});

test('Sign & run on a job that got a schedule since the card was started refuses and spawns NOTHING', async (t) => {
  const f = await cardWorld(t);
  const first = await f.signCard(f.card({ jobName: 'tk-dup', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  assert.equal(first.signed.status, 200);
  const spawned = f.spawnFn.spawns.length;
  // a second signing of the SAME job name with a schedule: the start door refuses it up front ...
  const again = await f.w.post('/api/author/start', f.card({ jobName: 'tk-dup', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 10, minute: 0 } }));
  assert.equal(again.status, 400);
  assert.match(again.body.error, /already has a schedule/);
  assert.equal(f.spawnFn.spawns.length, spawned, 'and nothing was spawned');
  // ... and if the schedule appears between the start and the sign, the sign refuses (the door is the one writer)
  const spec = { ...first.spec, trigger: { kind: 'daily', hour: 11, minute: 0 } };
  const r = f.door.signWithJob({ spec, specHash: jobSpecHash(spec), trigger: spec.trigger, inputsText: 'repo: /r' });
  assert.equal(r.ok, false);
  assert.match(r.say, /already has a schedule\. Change it with Cancel \/ modify schedule on one of its runs\. Nothing was signed\.$/);
});

test('a run that never started takes its waiting schedule back: a spawn that throws, and a child that errors after the spawn', async (t) => {
  const f = await cardWorld(t);
  const base = (await f.signCard(f.card({ jobName: 'tk-base', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 9, minute: 0 } }))).spec;
  const sessionFor = (job) => {
    const spec = { ...base, job };
    const outDir = path.join(f.w.base, `out-${job}`);
    mkdirSync(outDir, { recursive: true });
    const resolvedSpecPath = path.join(outDir, 'resolved-spec.json');
    writeFileSync(resolvedSpecPath, JSON.stringify(spec));
    return { state: { phase: 'prepared', specHash: jobSpecHash(spec), resolvedSpecPath, outDir, card: { inputs: 'repo: /r', destination: 'src/' }, schedule: spec.trigger, steps: [] } };
  };
  const where = { env: {}, bareloopBin: '/x/bareloop.mjs', sessionsRoot: path.join(f.w.base, 'sess'), home: f.w.cfg, schedules: f.door };
  // the spawn itself throws
  assert.throws(() => signRun(sessionFor('tk-throws'), jobSpecHash({ ...base, job: 'tk-throws' }), { ...where, spawnFn: () => { throw new Error('no setsid'); } }), /no setsid/);
  assert.equal(existsSync(path.join(f.dir('tk-throws'), 'schedule.json')), false, 'no run, no waiting schedule');
  assert.equal(readLedger(path.join(f.dir('tk-throws'), 'ledger.jsonl')).rows.at(-1).kind, 'cancelled', 'and it says so in its own plain row');
  // the child reports an error on the next turn
  const handlers = {};
  const s2 = sessionFor('tk-errors');
  const r = signRun(s2, s2.state.specHash, { ...where, spawnFn: () => ({ unref() {}, once(ev, h) { handlers[ev] = h; return this; } }) });
  assert.equal(r.ok, true);
  assert.equal(existsSync(path.join(f.dir('tk-errors'), 'schedule.json')), true, 'waiting while the run is starting');
  handlers.error(new Error('spawn setsid ENOENT'));
  assert.equal(existsSync(path.join(f.dir('tk-errors'), 'schedule.json')), false, 'the child never started: the waiting schedule is taken back');
  // no schedule picked: the door is never touched
  const s3 = sessionFor('tk-plain');
  delete s3.state.schedule;
  assert.equal(signRun(s3, s3.state.specHash, { ...where, spawnFn: () => ({ unref() {} }) }).ok, true);
  assert.equal(existsSync(path.join(f.dir('tk-plain'), 'schedule.json')), false);
  // a schedule picked but no door to keep it: nothing is signed
  const s4 = sessionFor('tk-nodoor');
  let spawned = false;
  const { schedules: _no, ...noDoor } = where;
  assert.equal(signRun(s4, s4.state.specHash, { ...noDoor, spawnFn: () => { spawned = true; return { unref() {} }; } }).ok, false);
  assert.equal(spawned, false);
  // the hash the person signed is not the saved copy's: nothing is signed, nothing spawned
  const s5 = sessionFor('tk-tamper');
  writeFileSync(s5.state.resolvedSpecPath, JSON.stringify({ ...JSON.parse(readFileSync(s5.state.resolvedSpecPath, 'utf8')), goal: 'something else' }));
  const bad = signRun(s5, s5.state.specHash, { ...where, spawnFn: () => { spawned = true; return { unref() {} }; } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /no longer matches what was signed/);
  assert.equal(spawned, false);
});

test('the session checks the schedule against the job it ACTUALLY built, not only the card: a new-ticket trigger on a job that is not a Tickets job refuses the session before anything is signed', async (t) => {
  const f = await cardWorld(t);
  const card = f.card({ jobName: 'tk-belt', flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}` });
  const session = createSession(card, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(f.w.base, 'keys2')), sessionsRoot: path.join(f.w.base, 'sess-belt'), ...draftSeams({}),
    schedule: { kind: 'new-ticket', input: 'issues' },
  });
  await until(() => session.state.pendingAsk?.kind === 'menu');
  session.signPrepare();
  await until(() => ['prepared', 'refused', 'error'].includes(session.state.phase));
  assert.equal(session.state.phase, 'refused');
  assert.match(session.state.error, /^Only a Tickets MCP job can start on a new ticket\./);
  assert.equal(session.state.specHash, null, 'nothing was signed');
});
