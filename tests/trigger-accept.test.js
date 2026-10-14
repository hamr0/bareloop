// T Part 8 + D.2 (PANEL-BUILD.md T addendum): the minimal Accept, and the hold on a scheduled green. The route spawns the ENGINE'S OWN
// door path (`run-u --spec --door --decide accept --approve`) and records nothing itself; the page button shows only when the server says
// a door is open; a scheduled green is not reusable until it is accepted. Recorded spawns only: no engine, no provider, scratch homes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync, mkdirSync, readFileSync, writeFileSync, writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobSpecHash } from '../src/job.js';
import { doorWaiting, heldScheduled } from '../src/reviewdoor.js';
import { getStartFrom, listReuseJobs } from '../src/panel/server.js';
import {
  keysHome, makeRun, panel, specOf, tmp,
} from './trigger-world.mjs';

const doorRec = (ts = new Date().toISOString()) => ({ type: 'review-door', outcome: 'green', ts, seq: 20 });
const decision = (o) => ({ type: 'door-decision', honoured: true, ts: new Date().toISOString(), seq: 21, ...o });
const addRec = (spine, rec) => appendFileSync(spine, `${JSON.stringify(rec)}\n`);

/** a spawn that records argv and ends the way the engine would: exit `code`, writing `say` to the log it was given */
function engine({ code = 0, say = '' } = {}) {
  const spawns = [];
  const fn = (cmd, args, o) => {
    spawns.push({ cmd, args, o });
    const handlers = {};
    if (say && typeof o?.stdio?.[1] === 'number') writeSync(o.stdio[1], say);
    const child = { unref() {}, once(ev, h) { handlers[ev] = h; return child; } };
    if (code !== null) setImmediate(() => handlers.exit?.(code));
    return child;
  };
  fn.spawns = spawns;
  return fn;
}

// ------------------------------------------------------------------ doorWaiting / heldScheduled (pure)
test('doorWaiting: a door record, not expired, no honoured accept or rerun after it; a pause keeps it open; an expired door is not waiting', () => {
  assert.equal(doorWaiting([{ type: 'job-end' }]), false, 'no door opened');
  assert.equal(doorWaiting([doorRec()]), true);
  assert.equal(doorWaiting([doorRec(), decision({ decision: 'pause' })]), true, 'a pause leaves the same three doors open');
  assert.equal(doorWaiting([doorRec(), decision({ decision: 'accept' })]), false);
  assert.equal(doorWaiting([doorRec(), decision({ decision: 'rerun' })]), false);
  assert.equal(doorWaiting([doorRec(), decision({ decision: 'accept', honoured: false })]), true, 'a refused accept does not close it');
  assert.equal(doorWaiting([decision({ decision: 'accept' }), doorRec()]), true, 'a decision BEFORE the door record is not an answer to it');
  assert.equal(doorWaiting([doorRec(new Date(Date.now() - 61 * 86_400_000).toISOString())]), false, 'expired after 60 days');
  assert.equal(doorWaiting([doorRec({ ts: 'garbage' }.ts)]), false, 'an unreadable stamp is not young');
});

test('heldScheduled: only a run a schedule started (trigger.json) without an honoured accept is held; a hand run never is', () => {
  assert.equal(heldScheduled([], null), false);
  assert.equal(heldScheduled([], { kind: 'clock' }), true);
  assert.equal(heldScheduled([decision({ decision: 'accept' })], { kind: 'clock' }), false);
  assert.equal(heldScheduled([decision({ decision: 'rerun' })], { kind: 'clock' }), true, 'only an accept releases it');
});

// ------------------------------------------------------------------ the server's answer: detail.accept and needs
test('detail.accept and the Needs-you `Accept` tag come from the SAME answer; an old waiting door never ages out; an answered one is gone', async () => {
  const home = keysHome();
  const wait = makeRun(home, { runid: 'w1', spec: specOf({ job: 'wait-job', files: true }), outcome: 'green', at: '2026-10-01T10:00:00.000Z' });
  addRec(wait.spine, doorRec(new Date(Date.now() - 30 * 86_400_000).toISOString()));
  makeRun(home, { runid: 'h1', spec: specOf({ job: 'hand-job' }), outcome: 'green' });
  const done = makeRun(home, { runid: 'd1', spec: specOf({ job: 'done-job', files: true }), outcome: 'green', accepted: true });
  addRec(done.spine, doorRec());
  addRec(done.spine, decision({ decision: 'accept' }));
  const p = await panel({ home });
  const list = (await p.get('/api/runs')).body.runs;
  assert.equal(list.find((r) => r.runid === 'w1').needs, 'Accept', 'a 30-day-old door still needs you (needsYouDays does not apply)');
  assert.equal(list.find((r) => r.runid === 'h1').needs, null);
  assert.equal(list.find((r) => r.runid === 'd1').needs, null);
  assert.equal((await p.get('/api/runs/w1')).body.accept, true);
  assert.equal((await p.get('/api/runs/h1')).body.accept, false);
  assert.equal((await p.get('/api/runs/d1')).body.accept, false);
});

// ------------------------------------------------------------------ the route
async function acceptWorld(o = {}) {
  const home = keysHome();
  const spec = specOf({ job: 'acc-job', files: true });
  const run = makeRun(home, { runid: 'a1', spec, outcome: 'green' });
  addRec(run.spine, doorRec());
  const spawnFn = engine(o);
  const p = await panel({ home, spawnFn });
  return { home, spec, run, spawnFn, p };
}

test('POST /api/runs/:id/accept spawns the engine\'s OWN door path with the run\'s signed spec and hash — nothing else is written by the panel', async () => {
  const w = await acceptWorld();
  const r = await w.p.post('/api/runs/a1/accept', {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.accepted, true);
  assert.equal(w.spawnFn.spawns.length, 1);
  const { cmd, args } = w.spawnFn.spawns[0];
  assert.equal(cmd, 'setsid');
  const i = args.indexOf('run-u');
  assert.deepEqual(args.slice(i + 1), ['--spec', `${w.run.out}/resolved-spec.json`, '--door', 'a1', '--decide', 'accept', '--approve', jobSpecHash(w.spec)]);
  assert.equal(args.includes('--registry'), false, 'no registry is conjured');
  // the panel wrote no door-decision itself: that is the engine's, on the run's own spine
  assert.equal(readFileSync(w.run.spine, 'utf8').includes('door-decision'), false);
});

test('a refused accept (the tree moved: `door-accept-red`) answers 409 with the ENGINE\'s own words, never a paraphrase', async () => {
  const w = await acceptWorld({ code: 2, say: 'DOOR REFUSED (accept) — nothing was recorded and nothing was released.\n  door-accept-red:stage.suite-green — the tree moved under the signer\n' });
  const r = await w.p.post('/api/runs/a1/accept', {});
  assert.equal(r.status, 409);
  assert.match(r.body.error, /DOOR REFUSED \(accept\)/);
  assert.match(r.body.error, /door-accept-red/);
});

test('an accept the engine is still checking answers 202 pending, never "accepted"', async () => {
  const home = keysHome();
  const run = makeRun(home, { runid: 'a2', spec: specOf({ job: 'slow-job', files: true }), outcome: 'green' });
  addRec(run.spine, doorRec());
  const { createPanelServer } = await import('../src/panel/server.js');
  const { close, port, token } = await createPanelServer({ port: 0, home, env: {}, schedulerIntervalMs: 0, spawnFn: engine({ code: null }), acceptWaitMs: 40, sessionsRoot: tmp() });
  test.after(() => close());
  const res = await fetch(`http://127.0.0.1:${port}/api/runs/a2/accept`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: '{}' });
  assert.equal(res.status, 202);
  const b = await res.json();
  assert.deepEqual([b.ok, b.pending, b.accepted], [true, true, undefined]);
});

test('refused before any spawn: no door open, a live run, an unknown run, no token, a GET', async () => {
  const w = await acceptWorld();
  const hand = makeRun(w.home, { runid: 'h9', spec: specOf({ job: 'hand9' }), outcome: 'green' });
  void hand;
  assert.equal((await w.p.post('/api/runs/h9/accept', {})).status, 409, 'a run that opened no door');
  assert.equal((await w.p.post('/api/runs/nope/accept', {})).status, 404);
  assert.equal(await w.p.noToken('/api/runs/a1/accept', {}), 403);
  assert.equal(w.spawnFn.spawns.length, 0, 'none of those spawned anything');
  addRec(w.run.spine, decision({ decision: 'accept' }));
  const again = await w.p.post('/api/runs/a1/accept', {});
  assert.equal(again.status, 409, 'an already-answered door');
  assert.match(again.body.error, /not waiting for your Accept/);
});

test('the engine accepts exactly these flags: run-u --spec <signed spec> --door <runid> --decide accept (no --approve) prints the door screen for that run and exits 0', () => {
  // a real prepared-copy layout, so the REAL runner resolves the spine the way the route's argv will ask it to
  const out = tmp('ta-engine-');
  const into = join(out, 'source-seed');
  const spec = { ...specOf({ job: 'door-job' }), inputs: undefined };
  delete spec.inputs;
  const dir = join(into, 'door-job-bareloop');
  mkdirSync(join(into, 'tree'), { recursive: true });
  mkdirSync(dir, { recursive: true });
  const git = (...a) => spawnSync('git', a, { cwd: join(into, 'tree'), env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }, encoding: 'utf8' });
  git('init', '-q');
  writeFileSync(join(into, 'tree', 'a.txt'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'seed');
  const seed = git('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: 'src/', seed }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const recs = [
    { type: 'job-start', job: 'door-job', specHash: jobSpecHash(spec), ts: new Date().toISOString(), seq: 1 },
    { type: 'job-end', outcome: 'green', spentUsd: 0.1, spendComplete: true, ts: new Date().toISOString(), seq: 2 },
    { ...doorRec(), seq: 3 },
  ];
  writeFileSync(join(dir, 'u-dr1.jsonl'), `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const bin = fileURLToPath(new URL('../bin/bareloop.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [bin, 'run-u', '--spec', join(out, 'resolved-spec.json'), '--door', 'dr1', '--decide', 'accept'], { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' }, timeout: 60000 });
  const text = `${r.stdout}${r.stderr}`;
  assert.match(text, /REVIEW DOOR, answering a run that has already ended/, text.slice(0, 600));
  assert.match(text, /--door dr1.*--decide accept.*--approve|accept/s);
  assert.equal(r.status, 0, text.slice(0, 600));
});

// ------------------------------------------------------------------ the page button
function pageActions() {
  const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
  const src = (name) => {
    const start = PAGE.indexOf(`function ${name}(`);
    let depth = 0; let i = PAGE.indexOf('{', start);
    for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
    return PAGE.slice(start, i + 1);
  };
  const bar = { innerHTML: '', hidden: true, querySelector: () => null, insertAdjacentHTML() {} };
  const render = new Function('document', 'authorPost', `var stopAsked = {};\n${src('escapeXml')}\n${src('renderRunActions')}\nreturn renderRunActions;`)({ getElementById: () => bar }, () => Promise.resolve({ status: 200, body: {} }));
  return { render, bar, PAGE };
}
const RESUMABLE = { reason: 'x', next: 'y', actions: [{ id: 'resume' }, { id: 'edit' }, { id: 'reuse' }] };

test('page: Accept shows only when the server says a door is open, right after Resume and before Edit in chat, and never on a live run', () => {
  const { render, bar } = pageActions();
  render({ runid: 'r', live: false, died: false, ended: RESUMABLE, resume: { budgetUsd: 1 }, accept: true, job: 'j' });
  const h = bar.innerHTML;
  assert.match(h, /data-testid="btn-accept-run">Accept</);
  assert.ok(h.indexOf('btn-resume-run') < h.indexOf('btn-accept-run') && h.indexOf('btn-accept-run') < h.indexOf('btn-edit-chat') && h.indexOf('btn-edit-chat') < h.indexOf('btn-reuse'), 'order: Resume, Accept, Edit in chat, Reuse workflow');
  render({ runid: 'r', live: false, died: false, ended: RESUMABLE, resume: { budgetUsd: 1 }, accept: false, job: 'j' });
  assert.doesNotMatch(bar.innerHTML, /btn-accept-run/);
  render({ runid: 'r', live: true, died: false, ended: null, resume: null, accept: true, job: 'j' });
  assert.doesNotMatch(bar.innerHTML, /btn-accept-run/, 'a live run is not at its door');
});

test('page: Accept posts to the accept route only', () => {
  const { PAGE } = pageActions();
  assert.match(PAGE, /"\/api\/runs\/" \+ encodeURIComponent\(detail\.runid\) \+ "\/accept"/);
});

// ------------------------------------------------------------------ D.2: a scheduled green is held until accepted
async function quarantineWorld() {
  const home = keysHome();
  const hand = makeRun(home, { runid: 'hand-g', spec: specOf({ job: 'q-hand' }), outcome: 'green', at: '2026-10-01T10:00:00.000Z' });
  void hand;
  const sched = makeRun(home, { runid: 'sched-g', spec: specOf({ job: 'q-sched' }), outcome: 'green', at: '2026-10-02T10:00:00.000Z' });
  writeFileSync(join(sched.out, 'trigger.json'), JSON.stringify({ kind: 'clock', reason: 'Started by the schedule: Every day at 09:00', catchUp: false }));
  addRec(sched.spine, doorRec());
  const p = await panel({ home });
  return { home, sched, p };
}

test('quarantine: a scheduled green is not offered by listReuseJobs, start-from reads green-held, and Reuse start answers 409 UNCHANGED; a hand green is unaffected', async () => {
  const w = await quarantineWorld();
  assert.deepEqual(listReuseJobs({ home: w.home }).map((j) => j.job), ['q-hand']);
  const pre = getStartFrom('sched-g', { home: w.home });
  assert.equal(pre.outcome, 'green-held');
  assert.equal(getStartFrom('hand-g', { home: w.home }).outcome, 'green');
  const card = pre.card;
  const start = await w.p.post('/api/author/start', { ...card, startFrom: 'sched-g' });
  assert.equal(start.status, 409);
  assert.match(start.body.error, /waiting for your Accept/);
});

test('quarantine: an honoured accept on the spine releases it (offered by Reuse again, outcome green)', async () => {
  const w = await quarantineWorld();
  addRec(w.sched.spine, decision({ decision: 'accept' }));
  assert.deepEqual(listReuseJobs({ home: w.home }).map((j) => j.job).sort(), ['q-hand', 'q-sched']);
  assert.equal(getStartFrom('sched-g', { home: w.home }).outcome, 'green');
});

test('quarantine: a held scheduled green does not count as a good run for the schedule gate either', async () => {
  const w = await quarantineWorld();
  assert.equal((await w.p.get('/api/runs/sched-g')).body.schedule.canSchedule, false, 'held');
  addRec(w.sched.spine, decision({ decision: 'accept' }));
  assert.equal((await w.p.get('/api/runs/sched-g')).body.schedule.canSchedule, true, 'released');
});
