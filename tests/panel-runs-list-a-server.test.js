// PANEL-BUILD.md P9 v2 — the server half of the runs list (copied from fwdloop M11): the server decides `live`, `needs`, each job's head,
// the quiet split and the limits; `GET /api/runs` carries `{runs, jobs, limits}`. Real spines on disk under a scratch home.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPanelServer, listRuns, needsTag, summarizeJobs, RUNS_LIST_LIMITS, runsListPayload,
} from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'runs-list-a-'));
  tmpDirs.push(d);
  return d;
}

const T0 = '2026-10-01T10:00:00.000Z';
const STOP = '2026-10-01T10:05:00.000Z'; // the fixture's job-end ts
const STOP_MS = Date.parse(STOP);
const DAY = 86_400_000;

/** one run on disk laid out the way a panel-authored run is (spec beside the spine), aged past the died window unless `fresh` */
function makeRun(home, {
  runid, job = 'fix-types', outcome = 'cap-halt', jobEnd = true, at = T0, hashOverride = null, fresh = false, noSpec = false,
}) {
  const spec = { job, description: 'fixture', budgetUsd: 8, maxWallMs: 3_600_000, goal: 'make types clean' };
  const out = tmp();
  const into = join(out, 'source-x');
  const dir = join(into, `${job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  if (!noSpec) writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const t = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const records = [
    { type: 'job-start', job, specHash: hashOverride ?? jobSpecHash(spec), budgetUsd: 8, shape: 'plan', goal: spec.goal, ts: t(0), seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: t(1), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 8, ts: t(2), seq: 3 },
    ...(jobEnd ? [{ type: 'job-end', outcome, spentUsd: 8, spendComplete: true, ts: STOP, seq: 99 }] : []),
  ];
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  if (!fresh) { const old = new Date(Date.now() - 3 * 3600 * 1000); utimesSync(spine, old, old); }
  appendRun({ at, runid, job, spine, patient: null, via: 'run-u' }, { home });
}

test('needsTag: ONE rule. Resume only when the engine would accept it; Accept is never produced today (no review-door state in the panel)', () => {
  assert.equal(needsTag({ ok: true }, STOP, STOP_MS + 1000), 'Resume');
  assert.equal(needsTag({ ok: false, why: 'x' }, STOP, STOP_MS), null);
  assert.equal(needsTag(null, STOP, STOP_MS), null);
  for (const plan of [{ ok: true }, { ok: false }, null, { accept: true }]) assert.notEqual(needsTag(plan, STOP, STOP_MS), 'Accept', 'no Accept today');
});

test('needsTag: a Resume run leaves Needs you 7 days after it stopped (exactly 7 days = out); no readable stop time stays in', () => {
  assert.equal(needsTag({ ok: true }, STOP, STOP_MS + 7 * DAY - 1), 'Resume');
  assert.equal(needsTag({ ok: true }, STOP, STOP_MS + 7 * DAY), null);
  assert.equal(needsTag({ ok: true }, null, STOP_MS + 90 * DAY), 'Resume');
  assert.equal(needsTag({ ok: true }, 'not a date', STOP_MS + 90 * DAY), 'Resume');
});

test('listRuns: a cap-halted run that can continue carries Resume; stoppedAt is the job-end ts; now is injectable and the age rule applies', () => {
  const home = tmp();
  makeRun(home, { runid: 'r1' });
  const at = (now) => listRuns({ home, now })[0];
  assert.equal(at(STOP_MS + 1000).needs, 'Resume');
  assert.equal(at(STOP_MS + 1000).stoppedAt, STOP);
  assert.equal(at(STOP_MS + 7 * DAY).needs, null, 'exactly 7 days = out of Needs you');
  assert.equal(at(STOP_MS + 7 * DAY).glyph, '✗', 'it is still listed under Jobs with its own sign');
});

test('listRuns: once the job is edited (no Resume button) the run carries no tag; a green and a live run never carry one', () => {
  const home = tmp();
  makeRun(home, { runid: 'edited', hashOverride: 'f'.repeat(64) });
  makeRun(home, { runid: 'green', job: 'g', outcome: 'green', noSpec: true });
  makeRun(home, { runid: 'live', job: 'l', jobEnd: false, fresh: true, noSpec: true });
  const by = Object.fromEntries(listRuns({ home, now: STOP_MS + 1000 }).map((r) => [r.runid, r]));
  assert.equal(by.edited.needs, null);
  assert.equal(by.green.needs, null);
  assert.equal(by.live.needs, null);
  assert.equal(by.green.live, false);
});

test('listRuns: live is the server\'s call: no job-end and still running. A live row carries liveSince and priorWallMs; a stopped or died one does not', () => {
  const home = tmp();
  makeRun(home, { runid: 'live', job: 'l', jobEnd: false, fresh: true, noSpec: true });
  makeRun(home, { runid: 'done', job: 'd', outcome: 'green', noSpec: true });
  makeRun(home, { runid: 'died', job: 'x', jobEnd: false, noSpec: true }); // old mtime, no pid: died
  const by = Object.fromEntries(listRuns({ home }).map((r) => [r.runid, r]));
  assert.equal(by.live.live, true);
  assert.equal(by.live.liveSince, T0);
  assert.equal(by.live.priorWallMs, 0, 'a never-resumed run has no earlier legs');
  assert.equal(by.live.needs, null);
  assert.equal(by.live.liveWhy, 'step 1 of 1', 'the plain why of a live run is the server\'s');
  assert.equal(by.done.liveWhy, null);
  assert.equal(by.done.live, false);
  assert.equal(by.done.liveSince ?? null, null);
  assert.equal(by.died.live, false);
  assert.equal(by.died.died, true);
  assert.equal(by.died.stoppedAt, '2026-10-01T10:02:00.000Z', 'a died run stopped at its last record');
});

test('summarizeJobs: newest activity first; quiet only when known and older than 30 days; unknown age never quiet; a live job never quiet', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const rows = [
    { job: 'old', runid: 'o1', at: '2026-08-01T00:00:00Z' },
    { job: 'edge', runid: 'e1', at: new Date(now - 30 * DAY).toISOString() },
    { job: 'over', runid: 'v1', at: new Date(now - 30 * DAY - 1).toISOString() },
    { job: 'unknown', runid: 'u1', at: 'garbage' },
    { job: 'livejob', runid: 'l1', at: '2026-08-02T00:00:00Z', live: true },
    { job: 'fresh', runid: 'f1', at: '2026-10-13T00:00:00Z' },
  ];
  const jobs = summarizeJobs(rows, now);
  assert.deepEqual(jobs.map((j) => j.job), ['fresh', 'edge', 'over', 'livejob', 'old', 'unknown']);
  const q = Object.fromEntries(jobs.map((j) => [j.job, j.quiet]));
  assert.deepEqual(q, { fresh: false, edge: false, over: true, livejob: false, old: true, unknown: false });
  assert.equal(jobs.find((j) => j.job === 'unknown').activityMs, null);
});

test('summarizeJobs: headRunid is the newest run BY TIME, not the first row in server order (fwdloop\'s parked bug); activity prefers a later stop time', () => {
  const rows = [
    { job: 'a', runid: 'stuck-old', at: '2026-09-01T00:00:00Z' },
    { job: 'a', runid: 'newest', at: '2026-10-10T00:00:00Z' },
    { job: 'a', runid: 'mid', at: '2026-10-05T00:00:00Z', stoppedAt: '2026-10-12T00:00:00Z' },
  ];
  const [a] = summarizeJobs(rows, Date.parse('2026-10-14T00:00:00Z'));
  assert.equal(a.headRunid, 'newest');
  assert.equal(a.activityMs, Date.parse('2026-10-12T00:00:00Z'));
});

test('limits: 30 days, 7 runs and 7 days are named once on the server, frozen', () => {
  assert.deepEqual({ ...RUNS_LIST_LIMITS }, { quietDays: 30, olderRuns: 7, needsYouDays: 7 });
  assert.ok(Object.isFrozen(RUNS_LIST_LIMITS));
});

test('GET /api/runs carries runs, jobs and limits over real HTTP', async (t) => {
  const home = tmp();
  makeRun(home, { runid: 'r1' });
  makeRun(home, { runid: 'r2', job: 'other', outcome: 'green', noSpec: true, at: '2026-10-02T10:00:00.000Z' });
  const { close, port } = await createPanelServer({ port: 0, home });
  t.after(() => close());
  const body = await (await fetch(`http://127.0.0.1:${port}/api/runs`)).json();
  assert.deepEqual(Object.keys(body).sort(), ['jobs', 'limits', 'runs']);
  assert.equal(body.runs.length, 2);
  assert.deepEqual(body.limits, { ...RUNS_LIST_LIMITS });
  assert.deepEqual(body.jobs.map((j) => j.job), ['other', 'fix-types']);
  assert.equal(body.jobs[0].headRunid, 'r2');
  assert.equal(runsListPayload({ home }).runs.length, 2);
});
