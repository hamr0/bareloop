// R8 (piece 4): `POST /api/author/ticket-anyway {job, ticket, reason}` and its two ways in. The REAL panel server, the REAL card routes, the REAL schedule door, starter and scheduler (a recorded spawn,
// the model boundary stubbed): with the ticket schedule still OFF the run starts at once by hand (`--ticket N --anyway`, no row); with it ON ONE `arrived` row (reason, `anyway: true`) joins the queue and
// the scheduler starts it with `--anyway`. A blank reason starts nothing. A click route: token + Origin/Host guard.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { appendRun, appendRunEvent } from '../src/runlist.js';
import { readLedger } from '../src/triggerledger.js';
import { cardWorld } from './schedule-card-world.mjs';
import { DEAD_PID } from './trigger-world.mjs';

async function tickAll(f) { await f.scheduler.tick(); await f.scheduler.settled(); await f.scheduler.tick(); }
const ledgerOf = (f) => path.join(f.dir(), 'ledger.jsonl');
const argvOf = (spawn) => spawn.args;

/** a ticket the job's filter skipped, laid out as `run-u` writes it: a listed row with no spine and one `settled` event */
function skip(f, runid, ticket, at = '2026-11-07T20:00:00.000Z') {
  appendRun({ at, runid, job: 'tk-job', spine: path.join(f.w.base, `${runid}.jsonl`), patient: null, via: 'run-u', pid: DEAD_PID, ticket }, { home: f.w.cfg });
  appendRunEvent({ runid, type: 'settled', by: runid, reason: 'skipped', words: 'no P1 label on the ticket', spentUsd: 0, spendComplete: true, at }, { home: f.w.cfg });
}
async function waitingJob(t) {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ ticket: '5', schedule: { kind: 'new-ticket' } }));
  assert.equal(out.signed.status, 200, JSON.stringify(out.signed));
  return { f, out };
}
const POST = '/api/author/ticket-anyway';

test('a click route: no token, a wrong token, or a foreign Origin is refused (403) and nothing starts or is written', async (t) => {
  const { f } = await waitingJob(t);
  skip(f, 'sk7', 7);
  const n = f.spawnFn.spawns.length;
  const rows = readLedger(ledgerOf(f)).rows.length;
  const body = JSON.stringify({ job: 'tk-job', ticket: 7, reason: 'the label was wrong' });
  const hdr = { 'content-type': 'application/json' };
  for (const [what, h] of [['no token', hdr], ['wrong token', { ...hdr, 'x-bareloop-token': 'nope' }], ['foreign Origin', { ...hdr, 'x-bareloop-token': f.w.token, origin: 'http://evil.example' }]]) {
    const r = await fetch(`${f.w.origin}${POST}`, { method: 'POST', headers: h, body });
    assert.equal(r.status, 403, what);
  }
  assert.equal((await fetch(`${f.w.origin}${POST}`, { headers: f.w.H })).status, 405, 'POST only');
  assert.equal(f.spawnFn.spawns.length, n);
  assert.equal(readLedger(ledgerOf(f)).rows.length, rows);
});

test('a blank reason starts nothing, in plain words; so does a reason over the cap, a bad number, and a ticket that is not a skipped one', async (t) => {
  const { f } = await waitingJob(t);
  skip(f, 'sk7', 7);
  const n = f.spawnFn.spawns.length;
  const rows = readLedger(ledgerOf(f)).rows.length;
  for (const reason of ['', '   ', undefined]) {
    const r = await f.w.post(POST, { job: 'tk-job', ticket: 7, ...(reason === undefined ? {} : { reason }) });
    assert.equal(r.status, 400);
    assert.equal(r.body.refused, 'reason-required');
    assert.equal(r.body.say, 'Please write a reason to run it anyway. Nothing started.');
  }
  assert.equal((await f.w.post(POST, { job: 'tk-job', ticket: 7, reason: 'x'.repeat(501) })).body.refused, 'reason-too-long');
  for (const bad of [0, -1, 1.5, '7', null, 2 ** 60]) assert.equal((await f.w.post(POST, { job: 'tk-job', ticket: bad, reason: 'why' })).body.refused, 'bad-request', String(bad));
  const nope = await f.w.post(POST, { job: 'tk-job', ticket: 8, reason: 'why' });
  assert.deepEqual([nope.status, nope.body.refused], [409, 'not-skipped']);
  assert.equal(f.spawnFn.spawns.length, n);
  assert.equal(readLedger(ledgerOf(f)).rows.length, rows);
});

test('schedule OFF: Run it anyway starts that ticket now by hand through Sign & run: --ticket N --anyway, the job\'s own signed spec, no review door, no row', async (t) => {
  const { f, out } = await waitingJob(t);
  skip(f, 'sk7', 7);
  const n = f.spawnFn.spawns.length;
  const rows = readLedger(ledgerOf(f)).rows.length;
  const r = await f.w.post(POST, { job: 'tk-job', ticket: 7, reason: 'the label was wrong' });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.deepEqual([r.body.ok, r.body.started, r.body.number], [true, true, 7]);
  assert.equal(f.spawnFn.spawns.length, n + 1);
  const argv = argvOf(f.spawnFn.spawns.at(-1));
  assert.equal(argv[argv.indexOf('--ticket') + 1], '7');
  assert.ok(argv.includes('--anyway'));
  assert.equal(argv.includes('--review-door'), false);
  assert.equal(argv[argv.indexOf('--approve') + 1], out.state.specHash);
  assert.equal(readLedger(ledgerOf(f)).rows.length, rows, 'a by-hand start writes no ledger row');
});

test('schedule ON: ONE `arrived` row with the reason and anyway:true joins the queue; the scheduler starts it with --anyway; asking twice never queues twice', async (t) => {
  const { f, out } = await waitingJob(t);
  f.run(out.spec, { runid: 'g1', outcome: 'green', ticket: 5 });
  await tickAll(f);
  assert.equal(f.door.isWaiting('tk-job'), false, 'the schedule is on');
  skip(f, 'sk7', 7);
  const before = f.spawnFn.spawns.length;
  const r = await f.w.post(POST, { job: 'tk-job', ticket: 7, reason: 'the label was wrong' });
  assert.deepEqual([r.status, r.body.ok, r.body.queued, r.body.number], [202, true, true, 7], JSON.stringify(r.body));
  assert.equal(f.spawnFn.spawns.length, before, 'queued, not started by the route');
  const arrived = readLedger(ledgerOf(f)).rows.filter((x) => x.kind === 'arrived' && x.number === 7);
  assert.equal(arrived.length, 1);
  assert.equal(arrived[0].reason, 'the label was wrong');
  assert.equal(arrived[0].anyway, true);
  const again = await f.w.post(POST, { job: 'tk-job', ticket: 7, reason: 'again' });
  assert.deepEqual([again.status, again.body.refused], [409, 'queue']);
  assert.match(again.body.say, /already queued/);
  assert.equal(readLedger(ledgerOf(f)).rows.filter((x) => x.kind === 'arrived' && x.number === 7).length, 1);
  await tickAll(f);
  assert.equal(f.spawnFn.spawns.length, before + 1, 'the queue started it');
  const argv = argvOf(f.spawnFn.spawns.at(-1));
  assert.equal(argv[argv.indexOf('--ticket') + 1], '7');
  assert.ok(argv.includes('--anyway'), 'a queued anyway carries --anyway');
  assert.ok(argv.includes('--review-door'), 'a scheduled start still opens the review door');
  assert.ok(readLedger(ledgerOf(f)).rows.some((x) => x.kind === 'ran' && x.sha === 'ticket:7:0'));
});

test('a normal arrival (no anyway) never carries --anyway', async (t) => {
  const { f, out } = await waitingJob(t);
  f.run(out.spec, { runid: 'g1', outcome: 'green', ticket: 5 });
  await tickAll(f);
  const before = f.spawnFn.spawns.length;
  // a ticket arrives by the look (a baseline then a new one): use the scheduler's own queue row shape
  const { appendSeen } = await import('../src/triggerfiles.js');
  appendSeen(ledgerOf(f), { id: 'arrived:ticket:9', kind: 'arrived', sha: 'ticket:9', name: '#9', path: '#9', size: 0, at: f.now(), number: 9 }, out.state.specHash);
  await tickAll(f);
  assert.equal(f.spawnFn.spawns.length, before + 1);
  assert.equal(argvOf(f.spawnFn.spawns.at(-1)).includes('--anyway'), false);
});

/** a ticket the job's filter skipped, laid out as the REAL one is: the row's spine path sits in the session folder that signed the job (`<out>/source-seed/<job>-bareloop/u-<runid>.jsonl`), the spine itself never written */
function skipInSession(f, out, runid, ticket, at = '2026-11-07T20:00:00.000Z') {
  const spine = path.join(path.dirname(out.state.resolvedSpecPath), 'source-seed', 'tk-job-bareloop', `u-${runid}.jsonl`);
  appendRun({ at, runid, job: 'tk-job', spine, patient: null, via: 'run-u', pid: DEAD_PID, ticket }, { home: f.w.cfg });
  appendRunEvent({ runid, type: 'settled', by: runid, reason: 'skipped', words: 'no P1 label on the ticket', spentUsd: 0, spendComplete: true, at }, { home: f.w.cfg });
}

test('am3: a job with NO ticket schedule: Run it anyway starts the skipped ticket at once from the skipped run\'s own signed job: --ticket N --anyway, by hand, the job\'s cap, no row', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ ticket: '5' }));
  assert.equal(out.signed.status, 200, JSON.stringify(out.signed));
  assert.equal(f.door.readSchedule('tk-job'), null, 'no schedule at all');
  skipInSession(f, out, 'sk7', 7);
  const n = f.spawnFn.spawns.length;
  const r = await f.w.post(POST, { job: 'tk-job', ticket: 7, reason: 'the label was wrong' });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.deepEqual([r.body.ok, r.body.started, r.body.number], [true, true, 7]);
  assert.equal(f.spawnFn.spawns.length, n + 1, 'one run was started');
  const argv = argvOf(f.spawnFn.spawns.at(-1));
  assert.ok(argv.includes('run-u'));
  assert.equal(argv[argv.indexOf('--ticket') + 1], '7');
  assert.ok(argv.includes('--anyway'));
  assert.equal(argv.includes('--review-door'), false, 'by hand: no review door');
  assert.equal(argv[argv.indexOf('--approve') + 1], out.state.specHash, 'the job\'s own signed spec');
  assert.equal(readLedger(ledgerOf(f)).rows.length, 0, 'no schedule, so no ledger row');
  assert.equal(f.door.readSchedule('tk-job'), null, 'still no schedule');
});

test('am3: a skipped row with no signed job anywhere (its session folder is gone) is refused in words naming why; nothing starts', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ ticket: '5' }));
  assert.equal(out.signed.status, 200);
  skip(f, 'sk7', 7);   // the spine path names no session folder: the signed job cannot be found
  const n = f.spawnFn.spawns.length;
  const r = await f.w.post(POST, { job: 'tk-job', ticket: 7, reason: 'why' });
  assert.deepEqual([r.status, r.body.refused], [409, 'queue']);
  assert.match(r.body.say, /signed job cannot be read \(this run's signed job is not on disk.*\), so it cannot be run from here\. Nothing started\.$/);
  assert.equal(f.spawnFn.spawns.length, n);
});

test('am3: the no-schedule start keeps the guards: a month with no room starts nothing', async (t) => {
  const f = await cardWorld(t);
  const out = await f.signCard(f.card({ ticket: '5' }));
  skipInSession(f, out, 'sk7', 7);
  const cfgPath = path.join(f.w.cfg, 'config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, monthlyLimitUsd: 0.01 }));
  const n = f.spawnFn.spawns.length;
  const r = await f.w.post(POST, { job: 'tk-job', ticket: 7, reason: 'why' });
  assert.equal(r.status, 409);
  assert.match(r.body.say, /limit has no room.*Nothing started\.$/);
  assert.equal(f.spawnFn.spawns.length, n);
});
