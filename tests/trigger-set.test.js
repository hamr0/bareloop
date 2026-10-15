// T Part 3 (PANEL-BUILD.md T addendum, G.4 and E.3): the two $0 schedule routes over REAL HTTP through createPanelServer.
// prepare signs and writes nothing; set carries the hash. No provider is reachable; every home is scratch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScheduleDoor } from '../src/panel/schedules.js';
import { readLedger } from '../src/triggerledger.js';
import { queueOf, readSeen, recordArrived } from '../src/triggerfiles.js';
import { jobSpecHash, workflowKey } from '../src/job.js';
import {
  keysHome, makeRun, panel, specOf, tmp,
} from './trigger-world.mjs';

// the deterministic key as computed BEFORE the judge-resolving fix: it must never move
const DET_KEY = 'e450074cce6af8b0d58a4a68d853f5847026246a733c85df1b7983bd51bd681d';
const DAILY = { kind: 'daily', hour: 9, minute: 0 };
const card = (o = {}) => ({ inputs: 'notes: /tw/in/notes.txt', destination: '/tw/out', capUsd: 1.5, maxWallMs: 600000, ...o });
/** a home with one plain-files rubric job: a green run, accepted */
function world({ files = true, outcome = 'green', accepted = true, job = 'sched-job' } = {}) {
  const home = keysHome();
  const spec = specOf({ job, files });
  makeRun(home, { runid: `${job}-r1`, spec, outcome, accepted });
  return { home, spec, runid: `${job}-r1`, triggers: join(home, 'triggers', job) };
}
const ledgerRows = (w) => readLedger(join(w.triggers, 'ledger.jsonl')).rows;

test('a rubric job signed with NO explicit judge can be scheduled after its Accept (mv76m82c): same workflow key, not refused', async () => {
  const home = keysHome();
  const spec = specOf({ job: 'nojudge', files: true, judge: false });
  assert.equal('judge' in spec, false);
  makeRun(home, { runid: 'nojudge-r1', spec, outcome: 'green', accepted: true });
  const p = await panel({ home });
  const r = await p.post('/api/author/schedule-prepare', { runid: 'nojudge-r1', when: DAILY, ...card() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.words, 'Every day at 09:00');
});

test('workflowKey: a missing judge and its resolved default share a key; a different judge does not; a deterministic key is unchanged', () => {
  const bare = specOf({ files: true, judge: false });
  const pinned = { ...bare, judge: { provider: 'anthropic-api', model: 'claude-sonnet-5' } };
  const other = { ...bare, judge: { provider: 'anthropic-api', model: 'claude-haiku-4-5' } };
  assert.equal(workflowKey(bare), workflowKey(pinned));
  assert.notEqual(workflowKey(bare), workflowKey(other));
  // a pinned judge keeps the key when the worker model changes (Model is open on a reuse)
  assert.equal(workflowKey(pinned), workflowKey({ ...pinned, model: 'claude-haiku-4-5' }));
  const det = specOf({ files: false });
  assert.equal(workflowKey(det), DET_KEY);
});

test('no good run: refused with the fixed sentence, nothing written (deterministic outcome not green)', async () => {
  const w = world({ outcome: 'cap-halt' });
  const p = await panel({ home: w.home });
  const r = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: DAILY, ...card() });
  assert.equal(r.status, 409);
  assert.equal(r.body.refused, 'no-green-run');
  assert.match(r.body.say, /has not had a good run yet/);
  assert.match(r.body.say, /Nothing was changed\.$/);
  assert.equal(existsSync(w.triggers), false);
});

test('already-green does not count as a good run', async () => {
  const w = world({ outcome: 'already-green' });
  const p = await panel({ home: w.home });
  const r = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: DAILY, ...card() });
  assert.equal(r.status, 409);
});

test('a rubric job without an honoured accept is refused; with one it is not', async () => {
  const no = world({ accepted: false, job: 'rub-no' });
  const p1 = await panel({ home: no.home });
  const r1 = await p1.post('/api/author/schedule-prepare', { runid: no.runid, when: DAILY, ...card() });
  assert.equal(r1.status, 409);
  assert.match(r1.body.say, /Accept once/);
  const yes = world({ accepted: true, job: 'rub-yes' });
  const p2 = await panel({ home: yes.home });
  const r2 = await p2.post('/api/author/schedule-prepare', { runid: yes.runid, when: DAILY, ...card() });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.words, 'Every day at 09:00');
});

test('an edited job: the older green does not count (the newest run has a new workflow key)', async () => {
  const home = keysHome();
  makeRun(home, { runid: 'old-g', spec: specOf({ files: true, goal: 'v1' }), outcome: 'green', accepted: true, at: '2026-10-01T10:00:00.000Z' });
  makeRun(home, { runid: 'new-r', spec: specOf({ files: true, goal: 'v2' }), outcome: 'cap-halt', at: '2026-10-02T10:00:00.000Z' });
  const p = await panel({ home });
  const r = await p.post('/api/author/schedule-prepare', { runid: 'new-r', when: DAILY, ...card() });
  assert.equal(r.status, 409);
  assert.equal(r.body.refused, 'no-green-run');
});

test('prepare writes nothing; set needs the hash it was shown (stale hash refused), then writes schedule.json and arms', async () => {
  const w = world();
  const p = await panel({ home: w.home });
  const pre = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: DAILY, ...card() });
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  assert.equal(existsSync(w.triggers), false, 'click 1 writes nothing');
  assert.match(pre.body.hash, /^[0-9a-f]{64}$/);
  const stale = await p.post('/api/author/schedule', { runid: w.runid, when: DAILY, ...card(), hash: 'deadbeef' });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.refused, 'stale-hash');
  assert.match(stale.body.say, /Nothing was signed/);
  assert.equal(existsSync(w.triggers), false);
  const changed = await p.post('/api/author/schedule', { runid: w.runid, when: DAILY, ...card({ capUsd: 2 }), hash: pre.body.hash });
  assert.equal(changed.status, 409, 'a card edited between the clicks changes the hash');
  const moved = await p.post('/api/author/schedule', { runid: w.runid, when: DAILY, ...card({ destination: '/tw/other' }), hash: pre.body.hash });
  assert.equal(moved.status, 409, 'so does a Destination edited between the clicks');
  const set = await p.post('/api/author/schedule', { runid: w.runid, when: DAILY, ...card(), hash: pre.body.hash });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.armed, true);
  const sched = JSON.parse(readFileSync(join(w.triggers, 'schedule.json'), 'utf8'));
  assert.equal(sched.job, 'sched-job');
  assert.deepEqual(sched.trigger, DAILY);
  assert.deepEqual(sched.spec.trigger, DAILY);
  // an absolute Destination rides on the schedule (not in the spec), so the hash the two clicks bind covers it and differs from the signature
  assert.equal(sched.specHash, jobSpecHash(sched.spec));
  assert.equal(sched.destination, '/tw/out');
  assert.equal(set.body.hash, sched.specHash);
  assert.equal(sched.workflowKey, workflowKey(w.spec), 'the scheduled spec keeps the green run\'s workflow key');
  assert.equal(sched.spec.budgetUsd, 1.5);
  const rows = ledgerRows(w);
  assert.deepEqual(rows.map((r) => r.kind), ['armed']);
  assert.equal(rows[0].sig, sched.specHash, 'every row carries the signature it was written under');
  // the cards' reader
  const got = await p.get(`/api/author/start-from?runid=${w.runid}&mode=schedule`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.body.schedule.trigger, DAILY);
  assert.equal(got.body.schedule.armed, true);
});

test('bad shapes are refused in words: cron text, a bad hour, a relative folder', async () => {
  const w = world();
  const p = await panel({ home: w.home });
  for (const when of ['0 9 * * *', { kind: 'daily', hour: 25, minute: 0 }, { kind: 'new-file', folder: 'inbox' }, { kind: 'daily', hour: 9, minute: 0, cron: 'x' }]) {
    const r = await p.post('/api/author/schedule-prepare', { runid: w.runid, when, ...card() });
    assert.equal(r.status, 400, JSON.stringify(when));
    assert.equal(r.body.refused, 'bad-trigger');
    assert.match(r.body.say, /Nothing was changed\.$/);
  }
});

test('a file kind: the folder must exist; a repo-shaped job is refused for file kinds', async () => {
  const w = world();
  const p = await panel({ home: w.home });
  const gone = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: { kind: 'new-file', folder: join(tmp(), 'nope') }, ...card() });
  assert.equal(gone.status, 400);
  assert.match(gone.body.say, /does not exist/);
  const ok = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: { kind: 'new-file', folder: tmp('tw-in-') }, ...card() });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match(ok.body.words, /^When a new file arrives in /);
  // a deterministic (repo) job: fine for a clock, refused for a file kind
  const repo = world({ files: false, job: 'repo-job' });
  const p2 = await panel({ home: repo.home });
  const body = { runid: repo.runid, ...card({ inputs: 'repo: /tw/repo', destination: 'src/' }) };
  assert.equal((await p2.post('/api/author/schedule-prepare', { ...body, when: DAILY })).status, 200);
  const f = await p2.post('/api/author/schedule-prepare', { ...body, when: { kind: 'new-file', folder: tmp('tw-in-') } });
  assert.equal(f.status, 400);
  assert.match(f.body.say, /repo/);
});

test('a missing model line is refused in words, not signed', async () => {
  const w = world();
  const bare = tmp('tw-bare-');
  writeFileSync(join(bare, 'runs.jsonl'), readFileSync(join(w.home, 'runs.jsonl')));
  const p = await panel({ home: bare });
  const r = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: DAILY, ...card() });
  assert.notEqual(r.status, 200);
  assert.match(r.body.say ?? r.body.error ?? '', /Nothing was changed|Settings|Tick|not set up/i);
});

test('cancel is never refused: no green gate, no keys, works on a job whose run list is gone; it removes schedule.json', async () => {
  const w = world();
  const p = await panel({ home: w.home });
  const pre = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: DAILY, ...card() });
  await p.post('/api/author/schedule', { runid: w.runid, when: DAILY, ...card(), hash: pre.body.hash });
  assert.ok(existsSync(join(w.triggers, 'schedule.json')));
  // a server whose home has NO keys and NO green: cancel still works on the files that exist
  const door = createScheduleDoor({ home: w.home, jobRuns: () => [], startFrom: () => null, jobOfRun: () => null, rowsFor: () => [] });
  const cp = await p.post('/api/author/schedule-prepare', { job: 'sched-job', when: null });
  assert.equal(cp.status, 200);
  assert.equal(cp.body.words, 'Cancel schedule');
  const cs = await p.post('/api/author/schedule', { job: 'sched-job', when: null, hash: cp.body.hash });
  assert.equal(cs.status, 200);
  assert.equal(existsSync(join(w.triggers, 'schedule.json')), false);
  assert.equal(ledgerRows(w).at(-1).kind, 'cancelled');
  assert.equal(door.cancel('sched-job'), false, 'cancelling again is quiet');
  assert.equal((await p.post('/api/author/schedule', { job: 'sched-job', when: null, hash: 'x' })).status, 409, 'a stale cancel hash is still refused as stale');
});

test('T18: a re-sign with a different cap carries the queue; a changed folder drops each queued file with a reason; cancel too', async () => {
  const w = world();
  const inbox = tmp('tw-inbox-');
  const other = tmp('tw-other-');
  const p = await panel({ home: w.home });
  const when = { kind: 'new-file', folder: inbox };
  const sign = async (wh, c) => {
    const pre = await p.post('/api/author/schedule-prepare', { runid: w.runid, when: wh, ...card(c) });
    assert.equal(pre.status, 200, JSON.stringify(pre.body));
    const set = await p.post('/api/author/schedule', { runid: w.runid, when: wh, ...card(c), hash: pre.body.hash });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    return pre.body.hash;
  };
  const sig1 = await sign(when, {});
  const ledger = join(w.triggers, 'ledger.jsonl');
  recordArrived(ledger, { path: join(inbox, 'a.csv'), sha: 'a'.repeat(64), size: 1 }, 100, sig1);
  recordArrived(ledger, { path: join(inbox, 'b.csv'), sha: 'b'.repeat(64), size: 1 }, 200, sig1);
  const sig2 = await sign(when, { capUsd: 2.5 });
  assert.notEqual(sig1, sig2);
  assert.deepEqual(queueOf(readSeen(ledger)).map((r) => r.name), ['a.csv', 'b.csv'], 'same folder: both still queued, in arrival order');
  assert.equal(readLedger(ledger).rows.filter((r) => r.kind === 'armed').length, 2, 'a re-sign appends an armed row to the SAME ledger');
  await sign({ kind: 'new-file', folder: other }, { capUsd: 2.5 });
  assert.deepEqual(queueOf(readSeen(ledger)), [], 'changed folder: nothing carried');
  const rows = readLedger(ledger).rows;
  assert.deepEqual(rows.filter((r) => r.kind === 'dropped').map((r) => [r.name, r.why]), [['a.csv', 'schedule-changed'], ['b.csv', 'schedule-changed']]);
  assert.equal(rows.filter((r) => r.kind === 'changed' && /did not/.test(r.say)).length, 2, 'one plain-words row per dropped file');
  // cancel drops what is queued then
  recordArrived(ledger, { path: join(other, 'c.csv'), sha: 'c'.repeat(64), size: 1 }, 300, rows.at(-1).sig);
  const cp = await p.post('/api/author/schedule-prepare', { job: 'sched-job', when: null });
  await p.post('/api/author/schedule', { job: 'sched-job', when: null, hash: cp.body.hash });
  assert.deepEqual(readLedger(ledger).rows.filter((r) => r.kind === 'dropped').map((r) => r.why).slice(-1), ['schedule-cancelled']);
});

test('the routes sit behind the human-click guard and take POST only', async () => {
  const w = world();
  const p = await panel({ home: w.home });
  assert.equal(await p.noToken('/api/author/schedule', { runid: w.runid, when: null }), 403);
  assert.equal(await p.noToken('/api/author/schedule-prepare', { runid: w.runid, when: DAILY }), 403);
  const g = await p.get('/api/author/schedule');
  assert.equal(g.status, 405);
});
