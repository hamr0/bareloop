// T Part 4 (PANEL-BUILD.md T addendum, G.5 and C.4): the fire order busy -> monthly -> wouldAccept -> started, through the
// REAL door, the REAL starter and the REAL `signRun`, with only the session factory and the spawn recorded. Each outcome is ONE
// row; a refused or busy fire consumes nothing (RULED 2026-10-14). No provider is reachable; every home is scratch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import {
  existsSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createStarter, perFireSpec } from '../src/panel/schedulestart.js';
import { MAX_RELEASES } from '../src/panel/schedules.js';
import { getStartFrom } from '../src/panel/server.js';
import { keysForDoor, keysHome as kHome } from '../src/keysfile.js';
import { rowsForHome } from '../src/providerrows.js';
import { jobSpecHash } from '../src/job.js';
import { due } from '../src/triggerclock.js';
import { readLedger } from '../src/triggerledger.js';
import { queueOf, readSeen, recordArrived } from '../src/triggerfiles.js';
import { appendRun } from '../src/runlist.js';
import {
  clock, keysHome, makeRun, panel, recordingSpawn, specOf, tmp, fireWorld as world, DAILY, SLOT, CLOCK,
} from './trigger-world.mjs';


const kinds = (w) => w.rows().map((r) => r.kind);

/** a live "runner" process of the job: a node child named run-u.mjs */
function liveRunner(home, job = 'sched-job', runid = 'live1') {
  const d = tmp('tf-runner-');
  const f = join(d, 'run-u.mjs');
  writeFileSync(f, 'setInterval(() => {}, 1000);\n');
  const c = spawn(process.execPath, [f], { stdio: 'ignore' });
  test.after(() => { try { c.kill('SIGKILL'); } catch { /* gone */ } });
  const spine = join(d, `u-${runid}.jsonl`);
  writeFileSync(spine, '');
  appendRun({ at: new Date().toISOString(), runid, job, spine, patient: null, via: 'run-u', pid: c.pid }, { home });
  return c;
}

test('started: a clock fire runs the full order, one `fire` row then one `started`; argv carries --approve <hash> and --review-door; trigger.json is written once', async () => {
  const w = await world();
  const r = await w.door.fire('sched-job', CLOCK({ catchUp: true, missed: 3 }));
  assert.equal(r.outcome, 'started', JSON.stringify(r));
  assert.deepEqual(kinds(w), ['armed', 'fire', 'started']);
  const fire = w.rows().find((x) => x.kind === 'fire');
  assert.deepEqual([fire.slot, fire.catchUp, fire.missed, fire.sig], [SLOT, true, 3, w.sig]);
  assert.equal(w.spawnFn.spawns.length, 1);
  const { cmd, args } = w.spawnFn.spawns[0];
  assert.equal(cmd, 'setsid');
  const i = args.indexOf('run-u');
  assert.ok(i > 0);
  assert.equal(args[args.indexOf('--approve') + 1], w.made[0].session.state.specHash);
  assert.ok(args.includes('--review-door'), 'a scheduled run opens the review door even when deterministic');
  assert.equal(args[args.indexOf('--spec') + 1], w.made[0].session.state.resolvedSpecPath);
  const trig = JSON.parse(readFileSync(join(w.made[0].session.state.outDir, 'trigger.json'), 'utf8'));
  assert.deepEqual([trig.kind, trig.catchUp, trig.missed, trig.slot], ['clock', true, 3, SLOT]);
  assert.match(trig.reason, /^Started by the schedule: Every day at 09:00 \(catch-up\)$/);
  assert.equal(w.made[0].o.headless, true, 'a scheduled start is headless: apart from the person\'s session');
  assert.equal(w.made[0].reuse.workflowKey, JSON.parse(readFileSync(join(w.dir, 'schedule.json'), 'utf8')).workflowKey);
  // the slot is consumed by the fire row
  assert.equal(due(DAILY, w.rows(), SLOT + 1000).fire, false);
});

test('a hand run is unchanged: --review-door is only on a scheduled spawn (signRun without the flag has none)', async () => {
  const { signRun } = await import('../src/panel/authorroutes.js');
  const w = await world();
  const outDir = tmp('tf-hand-');
  const resolvedSpecPath = join(outDir, 'resolved-spec.json');
  writeFileSync(resolvedSpecPath, JSON.stringify(w.spec));
  const spawnFn = recordingSpawn();
  const session = { state: { phase: 'prepared', specHash: 'abc', resolvedSpecPath, outDir, steps: [] } };
  assert.equal(signRun(session, 'abc', { env: {}, spawnFn, bareloopBin: '/x', home: w.home }).ok, true);
  assert.equal(spawnFn.spawns[0].args.includes('--review-door'), false);
});

test('busy: a live run of the job -> one `busy` row, nothing consumed, no session, no spawn; told once; when free the fire starts', async () => {
  const w = await world();
  const runner = liveRunner(w.home);
  for (let i = 0; i < 5; i += 1) assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'busy');
  assert.deepEqual(kinds(w), ['armed', 'busy'], 'told once, not per tick');
  assert.equal(w.made.length, 0);
  assert.equal(w.spawnFn.spawns.length, 0);
  assert.equal(due(DAILY, w.rows(), SLOT + 60000).fire, true, 'the slot is NOT consumed: it retries when the run is done');
  runner.kill('SIGKILL');
  await new Promise((r) => { runner.once('exit', r); });
  assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'started');
  assert.deepEqual(kinds(w), ['armed', 'busy', 'fire', 'started']);
});

test('a run waiting at its review door has ended, so it is NOT busy (T7)', async () => {
  const w = await world();
  makeRun(w.home, { runid: 'waiting', spec: specOf({ files: true, input: w.notes }), outcome: 'green' });
  assert.equal(w.door.busy('sched-job'), false);
});

test('two fires back to back: the second sees the first as busy (the starting set closes the gap before the row exists)', async () => {
  const w = await world();
  const a = w.door.fire('sched-job', CLOCK());
  const b = await w.door.fire('sched-job', CLOCK({ slot: SLOT + 86400000 }));
  assert.equal(b.outcome, 'busy');
  assert.equal((await a).outcome, 'started');
  assert.equal(w.spawnFn.spawns.length, 1);
});

test('monthly: not enough room -> `monthly-exhausted` with leftUsd/needUsd, once, nothing consumed; raising the limit lets it start', async () => {
  const w = await world();
  const cfgPath = join(w.home, 'config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, monthlyLimitUsd: 1 }));
  for (let i = 0; i < 3; i += 1) assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'monthly-exhausted');
  const row = w.rows().find((x) => x.kind === 'monthly-exhausted');
  assert.deepEqual([row.needUsd, row.leftUsd], [1.5, 0.5], 'the limit minus the 0.5 the fixture run already spent');
  assert.equal(w.rows().filter((x) => x.kind === 'monthly-exhausted').length, 1);
  assert.equal(w.made.length, 0);
  assert.equal(due(DAILY, w.rows(), SLOT + 1000).fire, true);
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, monthlyLimitUsd: 50 }));
  assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'started');
});

test('monthly: an unreadable limit is a `refused` row that refuses rather than guess', async () => {
  const w = await world();
  const cfgPath = join(w.home, 'config.json');
  writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, 'utf8')), monthlyLimitUsd: 'lots' }));
  const r = await w.door.fire('sched-job', CLOCK());
  assert.equal(r.outcome, 'refused');
  assert.match(r.why, /refusing rather than guess the monthly limit/);
});

test('refused: the keys are gone -> a `refused` row in words, no session, no `fire` row, the slot still due', async () => {
  const w = await world();
  rmSync(join(w.home, '.env'));
  const r = await w.door.fire('sched-job', CLOCK());
  assert.equal(r.outcome, 'refused');
  assert.match(r.why, /key for this job's model is not set up/);
  assert.deepEqual(kinds(w), ['armed', 'refused']);
  assert.equal(w.made.length, 0, 'wouldAccept said no BEFORE any session');
  assert.equal(due(DAILY, w.rows(), SLOT + 1000).fire, true);
  writeFileSync(join(w.home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'started');
});

test('refused: the stored spec no longer matches what was signed; the model line is gone; the input is gone', async () => {
  const w = await world();
  const sf = join(w.dir, 'schedule.json');
  const good = readFileSync(sf, 'utf8');
  const tampered = JSON.parse(good);
  tampered.spec.goal = 'something else';
  writeFileSync(sf, JSON.stringify(tampered));
  assert.match((await w.door.fire('sched-job', CLOCK())).why, /no longer matches what you signed/);
  writeFileSync(sf, good);
  const cfgPath = join(w.home, 'config.json');
  const cfg = readFileSync(cfgPath, 'utf8');
  writeFileSync(cfgPath, JSON.stringify({ keys: { ANTHROPIC_API_KEY: { shape: 'anthropic-api' } }, models: { ANTHROPIC_API_KEY: [{ model: 'claude-sonnet-5', use: false }] } }));
  assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'refused');
  writeFileSync(cfgPath, cfg);
  rmSync(w.notes);
  assert.match((await w.door.fire('sched-job', CLOCK())).why, /is not there/);
  assert.equal(w.made.length, 0);
});

test('a session that never reaches `prepared` (packages missing) is abandoned and told as `refused`; nothing is consumed', async () => {
  const w = await world();
  let abandoned = 0;
  const starter = createStarter({
    door: w.door, envNow: () => keysForDoor({ env: {}, keysHome: w.home }).env, spawnFn: w.spawnFn, bareloopBin: '/x', home: w.home,
    rowsFor: () => rowsForHome(kHome(w.home), keysForDoor({ env: {}, keysHome: w.home }).env), startFrom: (id) => getStartFrom(id, { home: w.home }),
    startSession: async () => ({ ok: true, session: { state: { id: 's', phase: 'install-needed', outDir: tmp() }, abandon() { abandoned += 1; } } }),
  });
  w.door.attachStarter(starter);
  const r = await w.door.fire('sched-job', CLOCK());
  assert.equal(r.outcome, 'refused');
  assert.match(r.why, /Packages are missing in the job's copy\. Nothing started\.$/);
  assert.equal(abandoned, 1);
  assert.deepEqual(kinds(w), ['armed', 'refused']);
  assert.equal(due(DAILY, w.rows(), SLOT + 1000).fire, true);
});

test('a spawn error AFTER the consuming row releases it (retryable), bounded: a persistent launch failure writes a bounded number of rows', async () => {
  const w = await world();
  w.spawnFn.failWith = new Error('spawn setsid ENOENT');
  // the scheduler only fires what is due
  for (let i = 0; i < 50; i += 1) if (due(DAILY, w.rows(), w.now()).fire) await w.door.fire('sched-job', CLOCK());
  const rows = w.rows();
  assert.equal(rows.filter((x) => x.kind === 'fire').length, MAX_RELEASES + 1, 'one consuming row per try; the last stays consumed');
  assert.equal(rows.filter((x) => x.kind === 'released').length, MAX_RELEASES);
  assert.ok(rows.length <= 1 + 3 * (MAX_RELEASES + 1), `bounded, not ${rows.length}`);
  assert.equal(w.spawnFn.spawns.length, MAX_RELEASES + 1);
  assert.match(rows.filter((x) => x.kind === 'refused').at(-1).why, /given up on/);
  // after a release the slot IS due; once given up on it is consumed
  assert.equal(due(DAILY, rows, SLOT + 1000).fire, false);
});

test('a single spawn error is released and the next try starts', async () => {
  const w = await world();
  w.spawnFn.failWith = new Error('boom');
  assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'refused');
  assert.equal(due(DAILY, w.rows(), SLOT + 1000).fire, true, 'released: due again');
  w.spawnFn.failWith = null;
  assert.equal((await w.door.fire('sched-job', CLOCK())).outcome, 'started');
  assert.equal(due(DAILY, w.rows(), SLOT + 1000).fire, false);
});

test('told once per slot|outcome|why, read back from disk: a fresh door over the same files does not repeat it', async () => {
  const w = await world();
  rmSync(join(w.home, '.env'));
  await w.door.fire('sched-job', CLOCK());
  await w.door.fire('sched-job', CLOCK({ slot: SLOT + 86400000 }));
  assert.equal(w.rows().filter((x) => x.kind === 'refused').length, 2, 'a different slot is a different key');
  const { createScheduleDoor } = await import('../src/panel/schedules.js');
  const door2 = createScheduleDoor({ home: w.home, jobRuns: () => [], startFrom: () => null, jobOfRun: () => null, rowsFor: () => [] });
  door2.attachStarter(w.starter);
  await door2.fire('sched-job', CLOCK());
  assert.equal(w.rows().filter((x) => x.kind === 'refused').length, 2);
});

test('file cause: Inputs line 1 is the arriving file; the per-fire hash differs from the signed one and is what --approve gets; `ran` is written only after the starter agrees', async () => {
  const w = await world({ when: 'files' });
  const f = join(w.inbox, 'a.csv');
  writeFileSync(f, 'a,1\n');
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update('a,1\n').digest('hex');
  recordArrived(w.ledger, { path: f, sha, size: 4 }, 100, w.sig);
  const r = await w.door.fire('sched-job', { kind: 'file', path: f, sha, size: 4 });
  assert.equal(r.outcome, 'started', JSON.stringify(r));
  assert.deepEqual(kinds(w), ['armed', 'arrived', 'ran', 'started']);
  assert.equal(w.made[0].reuse.spec.inputs[0].value, f);
  assert.equal(w.made[0].card.inputs, `notes: ${f}`);
  const signed = JSON.parse(readFileSync(join(w.dir, 'schedule.json'), 'utf8'));
  assert.notEqual(w.made[0].session.state.specHash, signed.specHash, 'the per-fire spec differs in inputs, so its own hash differs');
  assert.equal(w.made[0].session.state.specHash, perFireSpec(signed, { kind: 'file', path: f }).hash);
  assert.deepEqual(queueOf(readSeen(w.ledger)), [], 'ran: out of the queue');
  const trig = JSON.parse(readFileSync(join(w.made[0].session.state.outDir, 'trigger.json'), 'utf8'));
  assert.deepEqual([trig.kind, trig.file, trig.sha], ['file', f, sha]);
});

test('perFireSpec: only `inputs` may differ; a tampered field or a changed workflow is refused', async () => {
  const w = await world({ when: 'files' });
  const signed = JSON.parse(readFileSync(join(w.dir, 'schedule.json'), 'utf8'));
  assert.equal(perFireSpec(signed, { kind: 'clock' }).hash, signed.specHash, 'a clock fire is byte for byte the signed spec');
  const bad = JSON.parse(JSON.stringify(signed));
  bad.spec.budgetUsd = 99;
  bad.specHash = jobSpecHash(bad.spec);
  assert.equal(perFireSpec(bad, { kind: 'clock' }).ok, true, 'a re-hashed cap is the person\'s signed cap');
  bad.workflowKey = 'other';
  assert.equal(perFireSpec(bad, { kind: 'file', path: '/x' }).ok, false, 'the workflow key must be unchanged');
});

test('file cause: a file deleted before its turn is refused at wouldAccept (no `ran`), the file stays queued for the scheduler to drop', async () => {
  const w = await world({ when: 'files' });
  const f = join(w.inbox, 'gone.csv');
  writeFileSync(f, 'x\n');
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update('x\n').digest('hex');
  recordArrived(w.ledger, { path: f, sha, size: 2 }, 100, w.sig);
  rmSync(f);
  const r = await w.door.fire('sched-job', { kind: 'file', path: f, sha, size: 2 });
  assert.equal(r.outcome, 'refused');
  assert.match(r.why, /is not there/);
  assert.equal(readSeen(w.ledger).filter((x) => x.kind === 'ran').length, 0);
  assert.equal(queueOf(readSeen(w.ledger)).length, 1);
  assert.equal(existsSync(join(w.dir, 'trigger.json')), false);
});
