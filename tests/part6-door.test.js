// PRD v1.107 Part 6: `POST /api/runs/:id/rerun {text}` and `/pause` spawn the engine's OWN door path exactly as Accept does
// (`run-u --spec <signed spec> --door <id> --decide … --approve <hash>`), behind the same human-click guard, refusals in the engine's own plain words.
// Recorded spawns only: no engine, no provider, a scratch home.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync, writeSync } from 'node:fs';
import { jobSpecHash } from '../src/job.js';
import { engineRefusalWords } from '../src/panel/runroutes.js';
import {
  keysHome, makeRun, panel, specOf,
} from './trigger-world.mjs';

const doorRec = { type: 'review-door', outcome: 'green', ts: new Date().toISOString(), seq: 20 };
const addRec = (spine, rec) => appendFileSync(spine, `${JSON.stringify(rec)}\n`);

/** a spawn that records argv and ends the way the engine would: exit `code` (null = still running), writing `say` to the log it was given */
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

async function doorWorld(o = {}, { waiting = true } = {}) {
  const home = keysHome();
  const spec = specOf({ job: 'door-job', files: true });
  const run = makeRun(home, { runid: 'a1', spec, outcome: 'green' });
  if (waiting) addRec(run.spine, doorRec);
  const spawnFn = engine(o);
  const p = await panel({ home, spawnFn });
  return { home, spec, run, spawnFn, p };
}

test('POST /rerun spawns the engine\'s door path with the person\'s words LAST, the run\'s signed spec and hash; a rerun is a run, so a live engine is "started"', async () => {
  const w = await doorWorld({ code: null });
  const r = await w.p.post('/api/runs/a1/rerun', { text: '  only morning flights, and show the airline  ' });
  // the settle window is the Resume route's own (6s default); a still-running engine answers started
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rerunning, true);
  assert.equal(w.spawnFn.spawns.length, 1);
  const { cmd, args } = w.spawnFn.spawns[0];
  assert.equal(cmd, 'setsid');
  const i = args.indexOf('run-u');
  assert.deepEqual(args.slice(i + 1), ['--spec', `${w.run.out}/resolved-spec.json`, '--door', 'a1', '--decide', 'rerun', '--approve', jobSpecHash(w.spec), '--text', 'only morning flights, and show the airline']);
}, { timeout: 20000 });

test('POST /rerun with empty or blank text is refused in words and spawns nothing', async () => {
  const w = await doorWorld();
  for (const body of [{}, { text: '' }, { text: '   \n ' }, { text: 7 }, { text: null }]) {
    const r = await w.p.post('/api/runs/a1/rerun', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.error, 'Write what you want done differently, then press Rerun. Your words are what the next attempt is given.');
  }
  assert.equal(w.spawnFn.spawns.length, 0);
});

test('POST /pause spawns the engine\'s pause door and nothing else; it carries no text', async () => {
  const w = await doorWorld();
  const r = await w.p.post('/api/runs/a1/pause', { text: 'ignored' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.paused, true);
  const { args } = w.spawnFn.spawns[0];
  assert.deepEqual(args.slice(args.indexOf('run-u') + 1), ['--spec', `${w.run.out}/resolved-spec.json`, '--door', 'a1', '--decide', 'pause', '--approve', jobSpecHash(w.spec)]);
});

test('rerun and pause show only at an open door: a run not waiting is refused 409 and nothing is spawned', async () => {
  const w = await doorWorld({}, { waiting: false });
  for (const [path, body] of [['rerun', { text: 'again' }], ['pause', {}]]) {
    const r = await w.p.post(`/api/runs/a1/${path}`, body);
    assert.equal(r.status, 409, path);
    assert.match(r.body.error, /not waiting for your answer/);
  }
  assert.equal(w.spawnFn.spawns.length, 0);
  assert.equal((await w.p.post('/api/runs/nosuch/rerun', { text: 'x' })).status, 404);
});

test('rerun and pause need the human-click token (the chat can never reach them)', async () => {
  const w = await doorWorld();
  assert.equal(await w.p.noToken('/api/runs/a1/rerun', { text: 'again' }), 403);
  assert.equal(await w.p.noToken('/api/runs/a1/pause', {}), 403);
  assert.equal(w.spawnFn.spawns.length, 0);
});

test('a refused rerun / pause answers 409 with the engine\'s own plain sentence only; unknown text becomes one fixed sentence naming the log', async () => {
  const known = 'DOOR REFUSED (rerun) — nothing was recorded and nothing was released.';
  const a = await doorWorld({ code: 2, say: `${known}\n  door-expired:door.ts — it has expired on its own\n` });
  const r = await a.p.post('/api/runs/a1/rerun', { text: 'again' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, known);
  const b = await doorWorld({ code: 1, say: 'Error: boom\n    at x (/y.js:1:1)\n' });
  const pr = await b.p.post('/api/runs/a1/pause', {});
  assert.equal(pr.status, 409);
  assert.match(pr.body.error, /^Pause did not go through\. Nothing was recorded\. The details are in .+pause-a1-\d+\.log\.$/);
  const rr = await b.p.post('/api/runs/a1/rerun', { text: 'again' });
  assert.match(rr.body.error, /^Rerun did not start\. Nothing was spent on it\. The details are in .+rerun-a1-\d+\.log\.$/);
  assert.equal(engineRefusalWords('', 'accept', 'L'), 'Accept did not go through. Nothing was recorded. The details are in L.');
});

test('Accept is unchanged by the shared door path: same argv, same log name, same words', async () => {
  const w = await doorWorld();
  const r = await w.p.post('/api/runs/a1/accept', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.accepted, true);
  const { args } = w.spawnFn.spawns[0];
  assert.deepEqual(args.slice(args.indexOf('run-u') + 1), ['--spec', `${w.run.out}/resolved-spec.json`, '--door', 'a1', '--decide', 'accept', '--approve', jobSpecHash(w.spec)]);
  assert.match(r.body.log, /accept-a1-\d+\.log$/);
});
