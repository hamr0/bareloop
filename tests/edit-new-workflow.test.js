// RULED 2026-10-15 (PRD v1.100): an edit never clears a schedule; Edit in chat opens the Job name as `<origin>-N`; an unchanged
// workflow signs under the origin's name, a changed one under the card's; a new workflow is schedulable only after its own green.
// Scratch homes only (trigger-world.mjs); no model is ever reached.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { signRun } from '../src/panel/authorroutes.js';
import { createSession, foldEditName, nextFreeJobName } from '../src/panel/authorsession.js';
import { appendRow } from '../src/triggerledger.js';
import { workflowKey } from '../src/job.js';
import { keysHome, makeRun, panel, specOf, tmp, fireWorld, DAILY } from './trigger-world.mjs';


test('signing an edited spec (a DIFFERENT workflow key) leaves the job\'s schedule in place and writes no edited row', async () => {
  const w = await fireWorld();
  const outDir = tmp('enw-sign-');
  const resolvedSpecPath = join(outDir, 'resolved-spec.json');
  writeFileSync(resolvedSpecPath, JSON.stringify({ ...w.spec, goal: 'a different goal, so a different workflow' }));
  assert.notEqual(workflowKey(JSON.parse(readFileSync(resolvedSpecPath, 'utf8'))), workflowKey(w.spec));
  const session = { state: { phase: 'prepared', specHash: 'abc123', resolvedSpecPath, outDir, messages: [] } };
  const r = signRun(session, 'abc123', { env: {}, spawnFn: () => ({ unref() {} }), bareloopBin: '/x/bareloop.mjs', home: w.home, schedules: w.door });
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
  for (const q of ['runid=r1', 'mode=edit&runid=r1', 'mode=schedule&runid=r1']) {
    const b = (await w.p.get(`/api/author/start-from?${q}`)).body;
    assert.equal(b.ok, true);
    assert.equal('editNote' in b, false, q);
  }
});

test('Edit in chat prefills the Job name as <origin>-2, then the next free number; Reuse (plain start-from) keeps the origin name', async () => {
  const home = keysHome();
  makeRun(home, { runid: 'a1', spec: specOf({ job: 'digest' }), outcome: 'cap-halt' });
  const p = await panel({ home });
  assert.equal((await p.get('/api/author/start-from?mode=edit&runid=a1')).body.card.jobName, 'digest-2');
  assert.equal((await p.get('/api/author/start-from?runid=a1')).body.card.jobName, 'digest', 'the Reuse door is unchanged');
  makeRun(home, { runid: 'a2', spec: specOf({ job: 'digest-2' }), outcome: 'cap-halt' });
  assert.equal((await p.get('/api/author/start-from?mode=edit&runid=a1')).body.card.jobName, 'digest-3');
  // an origin already ending in -<digits> still gets the suffix appended; the base is never guessed
  assert.equal((await p.get('/api/author/start-from?mode=edit&runid=a2')).body.card.jobName, 'digest-2-2');
});

test('nextFreeJobName skips a name taken in the jobs dir too', () => {
  const dir = tmp('enw-jd-');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'x-2.json'), '{}');
  assert.equal(nextFreeJobName('x', [], { jobsDir: dir }), 'x-3');
  assert.equal(nextFreeJobName('x', ['x-3'], { jobsDir: dir }), 'x-4');
});

test('foldEditName: the same workflow signs under the ORIGIN name; a different one keeps the card name; the origin name on a different workflow is refused', () => {
  const origin = specOf({ job: 'x' });
  const edit = { job: 'x', workflowKey: workflowKey(origin) };
  // only caps / source changed: a new run of the same workflow
  const same = { ...specOf({ job: 'x-2', cap: 9 }), description: 'x-2 — authored through the bareloop panel' };
  const o2 = { ...origin, description: 'x — authored through the bareloop panel' };
  const edit2 = { job: 'x', workflowKey: workflowKey(o2) };
  const f = foldEditName(same, 'x-2', edit2);
  assert.equal(f.ok, true);
  assert.equal(f.spec.job, 'x');
  assert.equal(f.spec.description, 'x — authored through the bareloop panel');
  assert.equal(f.spec.budgetUsd, 9, 'the open fields stay as edited');
  // a different goal: a new workflow under the card's name
  const diff = { ...specOf({ job: 'x-2', goal: 'something else' }), description: 'x-2 — authored through the bareloop panel' };
  const g = foldEditName(diff, 'x-2', edit2);
  assert.equal(g.ok, true);
  assert.equal(g.spec.job, 'x-2');
  // keeping the origin's name on a different workflow is refused in plain words
  const h = foldEditName({ ...specOf({ job: 'x', goal: 'something else' }), description: 'x — authored through the bareloop panel' }, 'x', edit2);
  assert.deepEqual(h, { ok: false, error: 'A job named "x" already exists and is a different job. Pick another name.' });
  // not an edit: untouched
  assert.equal(foldEditName(diff, 'x-2', null).spec, diff);
  void edit;
});

const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
function makeRepo() {
  const dir = tmp('enw-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}

/** drive the real session's finish() with a spec (no model); the resolved spec it writes is what gets signed */
async function signedAs(spec, cardName, edit) {
  const s = createSession({ jobName: cardName, checkType: 'deterministic', model: 'claude-sonnet-5', jobText: '1. x', inputs: `repo: ${makeRepo()}`, destination: 'src/', capUsd: 1 }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('enw-s-'), reuse: { spec, workflowKey: workflowKey(spec) }, ...(edit ? { edit } : {}),
    generate: async () => { throw new Error('no model'); }, confirmGenerate: async () => { throw new Error('no model'); },
    prepareSigningFn: async () => { throw new Error('no model'); },
  });
  const t0 = Date.now();
  while (!['prepared', 'refused', 'error'].includes(s.state.phase) && Date.now() - t0 < 8000) await new Promise((r) => { setTimeout(r, 10); });
  return s;
}

test('the session writes the spec under the origin name when the workflow is unchanged, and refuses the origin name on a changed one', async () => {
  const o = { ...specOf({ job: 'x' }), description: 'x — authored through the bareloop panel' };
  const edit = { job: 'x', workflowKey: workflowKey(o) };
  const same = await signedAs({ ...specOf({ job: 'x-2', cap: 2 }), description: 'x-2 — authored through the bareloop panel' }, 'x-2', edit);
  assert.equal(JSON.parse(readFileSync(same.state.resolvedSpecPath, 'utf8')).job, 'x');
  const changed = await signedAs({ ...specOf({ job: 'x', goal: 'other' }), description: 'x — authored through the bareloop panel' }, 'x', edit);
  assert.equal(changed.state.phase, 'refused');
  assert.match(changed.state.error, /A job named "x" already exists and is a different job\. Pick another name\./);
});

test('POST /api/author/start with editFrom: a card name used by ANOTHER panel job is refused at $0', async () => {
  const home = keysHome();
  makeRun(home, { runid: 'a1', spec: specOf({ job: 'digest' }), outcome: 'cap-halt' });
  makeRun(home, { runid: 'b1', spec: specOf({ job: 'other' }), outcome: 'green' });
  const p = await panel({ home });
  const r = await p.post('/api/author/start', { jobName: 'other', checkType: 'deterministic', editFrom: 'a1', jobText: '1. x', inputs: 'repo: /tw/repo', destination: 'src/', capUsd: 1 });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'A job named "other" already exists and is a different job. Pick another name.');
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
