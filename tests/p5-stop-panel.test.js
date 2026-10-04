// PANEL-BUILD.md P5 item 5 — STOP, the panel half: the route, the Ended row, the card line, the detail fields.
// The REAL panel server on an ephemeral port, an injected scratch home, a REAL sleeping child as the "runner"
// (named run-u.mjs so `isLiveRunner` reads it as one) — no stub stands in for the liveness read.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createPanelServer, endedFor, getRunDetail, listRuns } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { stopFilePath } from '../src/legs.js';

/** @type {string[]} */ const tmpDirs = [];
/** @type {import('node:child_process').ChildProcess[]} */ const kids = [];
after(() => { for (const k of kids) { try { k.kill('SIGKILL'); } catch { /* gone */ } } for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'p5-stop-panel-')); tmpDirs.push(d); return d; };

/** a real child that looks like a runner to `isLiveRunner` and just sleeps */
function sleepingRunner() {
  const dir = tmp();
  const script = join(dir, 'run-u.mjs');
  writeFileSync(script, 'setInterval(() => {}, 1000);\n');
  const child = spawn(process.execPath, [script], { stdio: 'ignore' });
  kids.push(child);
  return child;
}

/** one run on disk: a spine with job-start + a green step (+ optional job-end), listed with `pid` */
function makeRun(home, { runid, pid, outcome = null }) {
  const dir = tmp();
  const spine = join(dir, `u-${runid}.jsonl`);
  const recs = [
    { type: 'job-start', job: 'p5-job', specHash: 'h', budgetUsd: 4, shape: 'plan', goal: 'g', ts: new Date().toISOString(), seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'one' }, { id: 'two' }] }, ts: new Date().toISOString(), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.1, ts: new Date().toISOString(), seq: 3 },
    ...(outcome ? [{ type: 'job-end', outcome, spentUsd: 0.1, spendComplete: true, ts: new Date().toISOString(), seq: 4 }] : []),
  ];
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  // no pid on the row: the spine's AGE is what says "not running" (the died window), so age it
  if (!pid) { const old = new Date(Date.now() - 3 * 3600 * 1000); utimesSync(spine, old, old); }
  appendRun({ at: new Date().toISOString(), runid, job: 'p5-job', spine, patient: null, via: 'run-u', ...(pid ? { pid } : {}) }, { home });
  return spine;
}

async function startServerHome(t, home) {
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, settleMs: 40, home });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const post = (path, { withToken = true } = {}) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(withToken ? { 'x-bareloop-token': token } : {}) }, body: '{}',
  });
  return { base, post };
}

test('endedFor: a `stopped` run reads "You stopped it." / "Resume." with a Resume button, card line "you pressed Stop — resume"', () => {
  const e = endedFor({ outcome: 'stopped', stopReason: null, spentUsd: 1, budgetUsd: 4 }, { died: false, lastThing: null }, { resume: { ok: true } });
  assert.equal(e?.reason, 'You stopped it.');
  assert.equal(e?.next, 'Resume.');
  assert.equal(e?.line, 'you pressed Stop — resume');
  assert.deepEqual(e?.actions, [{ id: 'resume', label: 'Resume' }]);
  const no = endedFor({ outcome: 'stopped', stopReason: null, spentUsd: 1, budgetUsd: 4 }, { died: false, lastThing: null }, { resume: { ok: false, why: 'it is still running' } });
  assert.deepEqual(no?.actions, [], 'never a button the engine would refuse');
});

test('POST /api/runs/:runid/stop: human guard, 404, 409 when not live, 409 while starting; a LIVE run gets its stop file', async (t) => {
  const home = tmp();
  const child = sleepingRunner();
  const live = makeRun(home, { runid: 'live1', pid: child.pid });
  const done = makeRun(home, { runid: 'done1', outcome: 'cap-halt' });
  // a listed live run whose spine does not exist yet
  appendRun({ at: new Date().toISOString(), runid: 'start1', job: 'p5-job', spine: join(tmp(), 'u-start1.jsonl'), patient: null, via: 'run-u', pid: child.pid }, { home });
  const { post } = await startServerHome(t, home);

  assert.equal((await post('/api/runs/live1/stop', { withToken: false })).status, 403, 'token required — the click is a human act');
  assert.equal((await post('/api/runs/nope/stop')).status, 404);
  const notLive = await post('/api/runs/done1/stop');
  assert.equal(notLive.status, 409);
  assert.match((await notLive.json()).error, /not running/);
  assert.equal(existsSync(stopFilePath(done)), false, 'nothing written for a run that is not running');
  const starting = await post('/api/runs/start1/stop');
  assert.equal(starting.status, 409);
  assert.match((await starting.json()).error, /still starting/);

  assert.equal(existsSync(stopFilePath(live)), false);
  const ok = await post('/api/runs/live1/stop');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, runid: 'live1', stopping: true });
  assert.equal(existsSync(stopFilePath(live)), true, 'the request is a file beside the spine');
  assert.ok(readFileSync(stopFilePath(live), 'utf8').length > 0);

  // the detail now says live + stopping, so the page shows "stopping after this turn…" until the leg ends
  const d = getRunDetail('live1', { home });
  assert.equal(d.live, true);
  assert.equal(d.stopping, true);
  assert.equal(d.ended, null, 'no Ended block while running');
  assert.equal(getRunDetail('done1', { home }).live, false);
});

test('a stopped-and-resumable run (job-end `stopped`) carries the Ended block, the Resume action and the card line through the real readers', async () => {
  const home = tmp();
  const dir = tmp();
  const spec = { job: 'p5-job', description: 'd', budgetUsd: 4, maxWallMs: 3_600_000, goal: 'g' };
  const { jobSpecHash } = await import('../src/job.js');
  writeFileSync(join(dir, 'resolved-spec.json'), JSON.stringify(spec));
  mkdirSync(join(dir, 'source-x', 'p5-job-bareloop'), { recursive: true });
  writeFileSync(join(dir, 'source-x', 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  const spine = join(dir, 'source-x', 'p5-job-bareloop', 'u-st1.jsonl');
  const ts = '2026-10-01T10:00:00.000Z';
  writeFileSync(spine, `${[
    { type: 'job-start', job: 'p5-job', specHash: jobSpecHash(spec), budgetUsd: 4, shape: 'plan', goal: 'g', ts, seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'one' }, { id: 'two' }] }, ts, seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 1, ts, seq: 3 },
    { type: 'step-end', step: 'one', outcome: 'green', ts, seq: 4 },
    { type: 'stop-requested', stepsDone: 1, stepsPlanned: 2, ts, seq: 5 },
    { type: 'job-end', outcome: 'stopped', spentUsd: 1, spendComplete: true, ts: '2026-10-01T10:05:00.000Z', seq: 6 },
  ].map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old); // no pid on the row: the spine's age is what says "not running"
  appendRun({ at: ts, runid: 'st1', job: 'p5-job', spine, patient: null, via: 'run-u' }, { home });
  const d = getRunDetail('st1', { home });
  assert.equal(d.ended.reason, 'You stopped it.');
  assert.deepEqual(d.ended.actions, [{ id: 'resume', label: 'Resume' }], `resume offered (${JSON.stringify(d.resume)})`);
  assert.equal(listRuns({ home }).find((r) => r.runid === 'st1').endedLine, 'you pressed Stop — resume');
});
