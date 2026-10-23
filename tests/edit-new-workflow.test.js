// RULED 2026-10-15 (PRD v1.100, door reshaped by v1.101): a reuse/edit never clears a schedule; a new workflow is schedulable only after
// its own first green. (The Job name / path rules live in one-door-reuse.test.js.) Scratch homes only (trigger-world.mjs); no model is ever reached.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signRun } from '../src/panel/authorroutes.js';
import { appendRow } from '../src/triggerledger.js';
import { workflowKey } from '../src/job.js';
import { makeRun, specOf, tmp, fireWorld, DAILY } from './trigger-world.mjs';


test('signing an edited spec (a DIFFERENT workflow key) leaves the job\'s schedule in place and writes no edited row', async () => {
  const w = await fireWorld();
  const outDir = tmp('enw-sign-');
  const resolvedSpecPath = join(outDir, 'resolved-spec.json');
  writeFileSync(resolvedSpecPath, JSON.stringify({ ...w.spec, goal: 'a different goal, so a different workflow' }));
  assert.notEqual(workflowKey(JSON.parse(readFileSync(resolvedSpecPath, 'utf8'))), workflowKey(w.spec));
  const session = { state: { phase: 'prepared', specHash: 'abc123', resolvedSpecPath, outDir, messages: [] } };
  const r = signRun(session, 'abc123', { env: {}, spawnFn: () => ({ unref() {} }), bareloopBin: '/x/bareloop.mjs', home: w.home });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(existsSync(join(w.dir, 'schedule.json')), 'the schedule survives an edited sign');
  assert.equal(w.rows().some((x) => x.kind === 'edited'), false);
});

test('the schedule door has no clearIfEdited, and an OLD ledger holding an `edited` row still reads', async () => {
  const w = await fireWorld();
  assert.equal('clearIfEdited' in w.door, false);
  assert.equal('editNoteFor' in w.door, false);
  appendRow(w.ledger, { kind: 'edited', sig: w.sig, at: 1, say: 'The job was edited, so its schedule was cleared. It is by hand again.' });
  assert.equal(w.rows().at(-1).kind, 'edited');
  const d = (await w.p.get('/api/runs/r1')).body;
  assert.equal(d.schedule.scheduled, true);
  const card = (await w.p.get('/api/author/start-from?mode=schedule&runid=r1')).body;
  assert.equal(card.ok, true);
  assert.equal('editNote' in card.scheduleCard, false);
});

test('start-from carries no editNote on a scheduled job, in any mode', async () => {
  const w = await fireWorld();
  for (const q of ['runid=r1', 'mode=schedule&runid=r1']) {
    const b = (await w.p.get(`/api/author/start-from?${q}`)).body;
    assert.equal(b.ok, true);
    assert.equal('editNote' in b, false, q);
  }
});

test('a NEW workflow is not schedulable before its own first green (the T3 gate, per job name); the old job\'s green and schedule do not carry over', async () => {
  const w = await fireWorld();
  makeRun(w.home, { runid: 'n1', spec: specOf({ job: 'sched-job-2', files: true, goal: 'a new workflow' }), outcome: 'cap-halt' });
  const d = (await w.p.get('/api/runs/n1')).body;
  assert.equal(d.schedule.scheduled, false);
  assert.equal(d.schedule.canSchedule, false);
  const pre = await w.p.post('/api/author/schedule-prepare', { runid: 'n1', when: DAILY, inputs: 'notes: /tw/in/notes.txt', destination: '/tw/out', capUsd: 1.5, maxWallMs: 600000 });
  assert.equal(pre.status, 409);
  assert.equal(pre.body.refused, 'no-green-run');
  assert.ok(existsSync(join(w.dir, 'schedule.json')), 'the old job keeps its schedule');
 
});
