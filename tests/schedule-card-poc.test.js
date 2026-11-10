// ITEM33-BUILD piece 9 (R7), the $0 POC (re-proves fwd F114, F117, F120, F124): a schedule signed WITH the job on the New job card is OFF; nothing looks while it is off; the first run reads
// #5 and goes green and THEN it arms; #6, which came in during the wait, runs once; #5 never; a skipped first run does NOT arm; a clock schedule arms at the green; a rubric job arms at the
// honoured Accept, not at the bare green. The REAL card routes, door, scheduler and ticket look; the fake MCP servers; an injected clock; no model, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readLedger } from '../src/triggerledger.js';
import { readSeen } from '../src/triggerfiles.js';
import { appendRunEvent } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';
import { cardWorld, newestFirst } from './schedule-card-world.mjs';
import { specOf } from './trigger-world.mjs';

const HOUR = 3_600_000;
const MIN = 60_000;
const rows = (f, kind) => readLedger(path.join(f.dir(), 'ledger.jsonl')).rows.filter((r) => !kind || r.kind === kind);

/** the door's starter for these tests: records the tickets it was asked to run, consumes the slot like the real one */
function recordingStarter(f) {
  const started = [];
  f.door.attachStarter({
    wouldAccept: () => ({ ok: true }),
    async start(job, cause, hooks = {}) { hooks.beforeSpawn?.(); started.push(cause.number ?? cause.slot); return { ok: true, sessionId: `s${started.length}`, specHash: 'h', consumed: true }; },
  });
  return started;
}
async function tickAll(f) { await f.scheduler.tick(); await f.scheduler.settled(); await f.scheduler.tick(); }

test('POC 1-5: a ticket schedule signed with the job is OFF, nothing looks while off, the first green run (#5) arms it, #6 runs once, #5 never', async (t) => {
  const f = await cardWorld(t, { issues: newestFirst(6) });   // the list already holds #6 when the wait ends: it arrived during the wait
  const started = recordingStarter(f);
  const out = await f.signCard(f.card({ ticket: '5', schedule: { kind: 'new-ticket' } }));
  assert.equal(out.signed.status, 200, JSON.stringify(out.signed));
  // (1) signed OFF, with the job: the spec carries the trigger (so the FIRST run's hash covers it), the schedule file waits, no armed row
  assert.deepEqual(out.spec.trigger, { kind: 'new-ticket', input: 'issues' });
  const sch = JSON.parse(readFileSync(path.join(f.dir(), 'schedule.json'), 'utf8'));
  assert.equal(sch.specHash, out.state.specHash, 'the schedule is of the very spec the run was signed with');
  assert.equal(sch.specHash, jobSpecHash(out.spec));
  assert.deepEqual(rows(f).map((r) => r.kind), ['signed', 'waiting']);
  assert.equal(f.spawnFn.spawns.length, 1, 'Sign & run started the first run');
  // (2) no look while off: hours of ticks make no call to the ticket server and write nothing
  for (let i = 0; i < 6; i += 1) { f.now.add(HOUR); await tickAll(f); }
  assert.equal(f.tw.callsMade().length, 0, 'no look while the schedule is off');
  assert.deepEqual(rows(f).map((r) => r.kind), ['signed', 'waiting']);
  assert.deepEqual(started, []);
  // (3) the first run reads #5 and goes RED first: still off
  f.run(out.spec, { runid: 'r1', outcome: 'red', ticket: 5 });
  await tickAll(f);
  assert.equal(f.tw.callsMade().length, 0, 'a red run does not turn it on');
  // (4) a later run reads #5 and goes green: the next check arms it, remembering #5
  f.run(out.spec, { runid: 'r2', outcome: 'green', ticket: 5 });
  f.now.add(MIN);
  await tickAll(f);
  const armed = rows(f, 'armed');
  assert.equal(armed.length, 1);
  assert.equal(armed[0].ticketN, 5);
  assert.equal(JSON.parse(readFileSync(path.join(f.dir(), 'schedule.json'), 'utf8')).originRunid, 'r2', 'the schedule names the run that turned it on');
  // (5) the first look baselines up to #5 only; #6 arrived during the wait and runs once; #5 never
  await f.scheduler.settled();
  await tickAll(f);
  assert.deepEqual(readSeen(path.join(f.dir(), 'ledger.jsonl'), out.state.specHash).filter((r) => r.kind === 'baseline').map((r) => r.number).sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(started, [6]);
  for (let i = 0; i < 4; i += 1) { f.now.add(20 * MIN); await tickAll(f); }
  assert.deepEqual(started, [6], '#6 ran once and #5 never');
});

test('POC 6: a skipped first run does NOT arm the schedule', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ ticket: '5', schedule: { kind: 'new-ticket' } }));
  assert.equal(out.signed.status, 200);
  // a skipped run: its row is listed, settled `skipped`, and it has no spine at all
  const runid = 'skip1';
  const { appendRun } = await import('../src/runlist.js');
  appendRun({ at: '2026-10-01T10:00:00.000Z', runid, job: 'tk-job', spine: path.join(f.w.base, 'nope.jsonl'), patient: null, via: 'run-u', ticket: 5 }, { home: f.w.cfg });
  appendRunEvent({ runid, type: 'settled', by: 'run-u', at: '2026-10-01T10:00:01.000Z', reason: 'skipped', words: 'Skipped.' }, { home: f.w.cfg });
  f.now.add(HOUR);
  await tickAll(f);
  assert.deepEqual(rows(f).map((r) => r.kind), ['signed', 'waiting']);
  assert.equal(f.tw.callsMade().length, 0);
});

test('POC 7: a clock schedule signed with the job arms at the green run, and its slots count from then', async (t) => {
  const f = await cardWorld(t);
  const started = recordingStarter(f);
  const out = await f.signCard(f.card({ flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  assert.equal(out.signed.status, 200, JSON.stringify(out.signed));
  assert.deepEqual(out.spec.trigger, { kind: 'daily', hour: 9, minute: 0 });
  f.now.add(48 * HOUR);
  await tickAll(f);
  assert.deepEqual(started, [], 'off: no slot fires, however long it waits');
  f.run(out.spec, { runid: 'r1', outcome: 'green' });
  await tickAll(f);
  assert.equal(rows(f, 'armed').length, 1);
  assert.deepEqual(started, [], 'the slots before the arming never fire');
  f.now.add(26 * HOUR);
  await tickAll(f);
  assert.equal(started.length, 1, 'then the next slot fires');
});

test('POC 8: a RUBRIC job arms at the honoured Accept, not at the bare green', async (t) => {
  const f = await cardWorld(t);
  const spec = { ...specOf({ job: 'rub-job', files: true, input: '/tw/in/notes.txt' }), trigger: { kind: 'daily', hour: 9, minute: 0 } };
  const signed = f.door.signWithJob({ spec, specHash: jobSpecHash(spec), trigger: spec.trigger, inputsText: 'notes: /tw/in/notes.txt', destination: '/tw/out' });
  assert.equal(signed.ok, true, JSON.stringify(signed));
  f.run(spec, { runid: 'r1', outcome: 'green', accepted: false });
  await tickAll(f);
  assert.equal(existsSync(path.join(f.dir('rub-job'), 'schedule.json')), true);
  assert.equal(readLedger(path.join(f.dir('rub-job'), 'ledger.jsonl')).rows.filter((r) => r.kind === 'armed').length, 0, 'a bare green of a rubric job does not arm');
  f.run(spec, { runid: 'r2', outcome: 'green', accepted: true });
  await tickAll(f);
  assert.equal(readLedger(path.join(f.dir('rub-job'), 'ledger.jsonl')).rows.filter((r) => r.kind === 'armed').length, 1, 'the honoured Accept arms it');
});
