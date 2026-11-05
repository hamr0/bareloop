// ITEM33-BUILD piece 9 (R7), the one turn-on of a schedule signed WITH its job (`armFor`), beyond the POC: only a run that began after the signing arms it (a Reuse of a job that already had
// greens does not), an edited workflow never does, the ticket number the run read is the first look's cut (and none is none), and the card-time schedule and the two-click door agree
// about the same job (the build doc's Unchecked item: sign with a schedule, Cancel, then set it again through the door). The REAL card routes, door, scheduler; fake MCP; injected clock.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readLedger } from '../src/triggerledger.js';
import { jobSpecHash } from '../src/job.js';
import { cardWorld } from './schedule-card-world.mjs';
import { DAILY } from './trigger-world.mjs';

const HOUR = 3_600_000;
const kinds = (f, job = 'tk-job') => readLedger(path.join(f.dir(job), 'ledger.jsonl')).rows.map((r) => r.kind);
async function tickAll(f) { await f.scheduler.tick(); await f.scheduler.settled(); await f.scheduler.tick(); }
const plainCard = (f, over = {}) => f.card({ flowType: undefined, mcp: undefined, inputs: `repo: ${f.repo}`, ...over });

test('a Reuse of a job that already had a green run: that green does NOT turn the schedule on; the new run\'s green does', async (t) => {
  const f = await cardWorld(t);
  const first = await f.signCard(plainCard(f, { jobName: 'tk-reuse' }));
  assert.equal(first.signed.status, 200);
  f.run(first.spec, { runid: 'old1', outcome: 'green', at: '2026-10-01T10:00:00.000Z' });
  // Reuse workflow: the unchanged job from its green run, with a schedule picked on the card
  const reused = await f.signCard(plainCard(f, { jobName: 'tk-reuse', startFrom: 'old1', schedule: { kind: 'daily', hour: 7, minute: 0 }, destination: 'src/' }));
  assert.equal(reused.started.body.reuse, true);
  assert.equal(reused.signed.status, 200, JSON.stringify(reused.signed));
  assert.deepEqual(reused.spec.trigger, { kind: 'daily', hour: 7, minute: 0 }, 'a reuse signs the schedule too');
  assert.equal(readLedger(path.join(f.dir('tk-reuse'), 'ledger.jsonl')).rows.at(-1).before.includes('old1'), true, 'the signing remembers the runs the job already had');
  f.now.add(HOUR);
  await tickAll(f);
  assert.equal(kinds(f, 'tk-reuse').includes('armed'), false, 'an old green is not the run this schedule waits for');
  f.run(reused.spec, { runid: 'new1', outcome: 'green', at: '2026-10-02T10:00:00.000Z' });
  await tickAll(f);
  assert.equal(kinds(f, 'tk-reuse').filter((k) => k === 'armed').length, 1);
});

test('a workflow edited since (the green run is of another workflow key) never turns the schedule on', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(plainCard(f, { jobName: 'tk-edit', schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  f.run({ ...out.spec, goal: 'a different job entirely' }, { runid: 'e1', outcome: 'green' });
  await tickAll(f);
  assert.equal(kinds(f, 'tk-edit').includes('armed'), false);
});

test('a ticket schedule whose first green run recorded no ticket arms with no cut (the first look baselines what is there)', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ jobName: 'tk-nocut', schedule: { kind: 'new-ticket' } }));
  assert.equal(out.signed.status, 200, JSON.stringify(out.signed));
  f.run(out.spec, { runid: 'g1', outcome: 'green' });
  await tickAll(f);
  const armed = readLedger(path.join(f.dir('tk-nocut'), 'ledger.jsonl')).rows.find((r) => r.kind === 'armed');
  assert.ok(armed);
  assert.equal('ticketN' in armed, false);
});

test('a clock schedule does not change the two-click door: a job scheduled AFTER its green still arms at the first check, no waiting row', async (t) => {
  const f = await cardWorld(t);
  const first = await f.signCard(plainCard(f, { jobName: 'tk-door' }));
  f.run(first.spec, { runid: 'g1', outcome: 'green' });
  const body = { runid: 'g1', when: DAILY, inputs: `repo: ${f.repo}`, destination: 'src/', capUsd: 2 };
  const pre = await f.w.post('/api/author/schedule-prepare', body);
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  const set = await f.w.post('/api/author/schedule', { ...body, hash: pre.body.hash });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.armed, true);
  assert.deepEqual(kinds(f, 'tk-door'), ['signed', 'armed']);
});

test('card-time schedule and the two-click door agree: sign with a schedule, Cancel it, set it again through the door - on, not waiting; and the SAME signature signed again by the card waits again', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(plainCard(f, { jobName: 'tk-both', schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  assert.equal(out.signed.status, 200);
  assert.equal(f.door.isWaiting('tk-both'), true);
  f.run(out.spec, { runid: 'g1', outcome: 'green' });
  // Cancel is never refused, waiting or not
  assert.equal(f.door.cancel('tk-both'), true);
  assert.equal(existsSync(path.join(f.dir('tk-both'), 'schedule.json')), false);
  assert.equal(f.door.isWaiting('tk-both'), false);
  // set it again through the two-click door (the card is the green run's card: the same Inputs, Destination and caps)
  const body = { runid: 'g1', when: { kind: 'weekdays', hour: 8, minute: 15 }, inputs: `repo: ${f.repo}`, destination: 'src/', capUsd: 2 };
  const pre = await f.w.post('/api/author/schedule-prepare', body);
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  const set = await f.w.post('/api/author/schedule', { ...body, hash: pre.body.hash });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.armed, true, 'the door arms at once: the job already had its good run');
  assert.equal(f.door.isWaiting('tk-both'), false);
  assert.equal(f.door.read('tk-both').armed, true);
  // the SAME signature signed with the job again (a cancel, then the card with the very same job): a `waiting` row starts that signing over, so it waits, not "already armed"
  f.door.cancel('tk-both');
  const spec = { ...out.spec };
  assert.equal(f.door.signWithJob({ spec, specHash: jobSpecHash(spec), trigger: spec.trigger, inputsText: `repo: ${f.repo}`, destination: null }).ok, true);
  assert.equal(f.door.isWaiting('tk-both'), true, 'the earlier `armed` row of the same signature does not count');
  assert.equal(f.door.read('tk-both').armed, false);
});

test('a waiting schedule is superseded by the two-click door\'s click 2 (a later `signed` row), which arms it at once', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(plainCard(f, { jobName: 'tk-super', schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  f.run(out.spec, { runid: 'g1', outcome: 'green' });
  // the door modifies the SAME schedule before the next check turned it on (same card, same signature)
  const body = { runid: 'g1', when: { kind: 'daily', hour: 9, minute: 0 }, inputs: `repo: ${f.repo}`, destination: 'src/', capUsd: 2 };
  const pre = await f.w.post('/api/author/schedule-prepare', body);
  const set = await f.w.post('/api/author/schedule', { ...body, hash: pre.body.hash });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(f.door.isWaiting('tk-super'), false);
  assert.equal(JSON.parse(readFileSync(path.join(f.dir('tk-super'), 'schedule.json'), 'utf8')).specHash, set.body.hash);
});

test('the check is cheap while a job waits: a tick asks the green gate from the run list and writes nothing', async (t) => {
  const f = await cardWorld(t);
  await f.signCard(plainCard(f, { jobName: 'tk-cheap', schedule: { kind: 'daily', hour: 9, minute: 0 } }));
  const before = readFileSync(path.join(f.dir('tk-cheap'), 'ledger.jsonl'), 'utf8');
  for (let i = 0; i < 50; i += 1) { f.now.add(500); await f.scheduler.tick(); }
  assert.equal(readFileSync(path.join(f.dir('tk-cheap'), 'ledger.jsonl'), 'utf8'), before, '50 ticks, not one row');
});
