// PANEL-BUILD.md addendum (RULED 2026-10-15, matches fwdloop DRAFT M11 am11 items 3-5): "Remove from Needs you". Real spines under a scratch home, a real panel
// over HTTP. The click appends ONE `needs-removed` row to runs.jsonl and nothing else changes: status, the list row, Resume, Reuse and the month's money stay.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPanelServer, listRuns, getRunDetail } from '../src/panel/server.js';
import { appendRun, readRunList } from '../src/runlist.js';
import { monthSpend, spendSummary, readLegs, checkMonthlyRoom } from '../src/monthly.js';
import { fileURLToPath } from 'node:url';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'needs-remove-'));
  tmpDirs.push(d);
  return d;
}
const DAY = 86_400_000;
const HOUR = 3_600_000;
const runsFile = (home) => join(home, 'runs.jsonl');
const lines = (home) => readFileSync(runsFile(home), 'utf8').split('\n').filter(Boolean);

/** one cap-halted run on disk (Resume is open), stopped `ageMs` ago; `door:true` = a passed run waiting at its review door */
function makeRun(home, { runid, job = 'fix-types', ageMs = HOUR, outcome = 'cap-halt', door = false }) {
  const spec = { job, description: 'fixture', budgetUsd: 8, maxWallMs: 3_600_000, goal: 'make types clean' };
  const out = tmp();
  const into = join(out, 'source-x');
  const dir = join(into, `${job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const stop = new Date(Date.now() - ageMs).toISOString();
  const start = new Date(Date.now() - ageMs - 300_000).toISOString();
  const records = [
    { type: 'job-start', job, specHash: jobSpecHash(spec), budgetUsd: 8, shape: 'plan', goal: spec.goal, ts: start, seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: start, seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 8, ts: start, seq: 3 },
    { type: 'job-end', outcome, spentUsd: 8, spendComplete: true, ts: stop, seq: 99 },
    ...(door ? [{ type: 'review-door', outcome: 'green', ts: stop, seq: 100 }] : []),
  ];
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * HOUR);
  utimesSync(spine, old, old);
  appendRun({ at: start, runid, job, spine, patient: null, via: 'run-u' }, { home });
  return { spine, stop };
}

async function panel(home) {
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, schedulerIntervalMs: 0, sessionsRoot: tmp() });
  after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const hdr = { 'content-type': 'application/json', 'x-bareloop-token': token };
  return {
    get: async (p) => { const r = await fetch(`${base}${p}`, { headers: hdr }); return { status: r.status, body: await r.json() }; },
    post: async (p, body = {}) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: hdr, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; },
    noToken: async (p) => (await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status,
  };
}

test('Remove from Needs you: the click takes the card out of Needs you and writes ONE needs-removed row; status, the list row, Resume and Reuse stay', async () => {
  const home = tmp();
  makeRun(home, { runid: 'r1' });
  const p = await panel(home);
  const before = listRuns({ home })[0];
  assert.equal(before.needs, 'Resume');
  const d0 = (await p.get('/api/runs/r1')).body;
  assert.equal(d0.canRemoveFromNeeds, true, 'the button is offered on a Resume card');
  const n0 = lines(home).length;
  const r = await p.post('/api/runs/r1/needs-remove');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rows = lines(home);
  assert.equal(rows.length, n0 + 1, 'exactly one row appended');
  const row = JSON.parse(rows.at(-1));
  assert.deepEqual([row.runid, row.type, typeof row.at], ['r1', 'needs-removed', 'string']);
  assert.ok(Number.isFinite(Date.parse(row.at)));
  const after1 = listRuns({ home });
  assert.equal(after1.length, 1, 'the run stays in the runs list');
  assert.equal(after1[0].needs, null, 'out of Needs you');
  assert.equal(after1[0].glyph, before.glyph);
  assert.deepEqual(after1[0].status, before.status);
  assert.equal(after1[0].runNo, before.runNo);
  const d1 = (await p.get('/api/runs/r1')).body;
  assert.equal(d1.canRemoveFromNeeds, false, 'no second button');
  assert.ok(d1.resume && d1.resume.ok !== false, 'Resume is still there');
  assert.ok((d1.ended.actions || []).some((a) => a.id === 'resume') && (d1.ended.actions || []).some((a) => a.id === 'reuse'), 'Resume and Reuse workflow stay');
  assert.deepEqual(d1.status, d0.status);
  assert.match(d1.needsAudit, /^removed from Needs you by you · \d\d\/\d\d \d\d:\d\d$/);
});

test('a second click (or a stale page) is refused in plain words and writes nothing more', async () => {
  const home = tmp();
  makeRun(home, { runid: 'r1' });
  const p = await panel(home);
  assert.equal((await p.post('/api/runs/r1/needs-remove')).status, 200);
  const n = lines(home).length;
  const again = await p.post('/api/runs/r1/needs-remove');
  assert.equal(again.status, 409);
  assert.match(again.body.error, /not in Needs you/);
  assert.equal(lines(home).length, n, 'nothing written');
});

test('refused (409) when the run is not in Needs you; a run waiting for Accept never offers Remove and the route refuses it; 404 for no such run; the token guard applies', async () => {
  const home = tmp();
  makeRun(home, { runid: 'old', ageMs: 9 * DAY });
  makeRun(home, { runid: 'green', outcome: 'green' });
  makeRun(home, { runid: 'door', outcome: 'green', door: true });
  const p = await panel(home);
  const n = lines(home).length;
  for (const id of ['old', 'green']) assert.equal((await p.post(`/api/runs/${id}/needs-remove`)).status, 409, id);
  assert.equal(listRuns({ home }).find((r) => r.runid === 'door').needs, 'Accept', 'the fixture really waits for Accept');
  const door = await p.post('/api/runs/door/needs-remove');
  assert.equal(door.status, 409);
  assert.match(door.body.error, /Accept/);
  assert.equal((await p.get('/api/runs/door')).body.canRemoveFromNeeds, false, 'no Remove on a live Accept');
  assert.equal((await p.post('/api/runs/nope/needs-remove')).status, 404);
  assert.equal(await p.noToken('/api/runs/old/needs-remove'), 403);
  assert.equal(lines(home).length, n, 'no refusal wrote a row');
  assert.equal(listRuns({ home }).find((r) => r.runid === 'door').needs, 'Accept');
});

test('a removal covers only the ending it was made on: a NEW stop after it brings the run back into Needs you', async () => {
  const home = tmp();
  const { spine } = makeRun(home, { runid: 'r1' });
  const p = await panel(home);
  assert.equal((await p.post('/api/runs/r1/needs-remove')).status, 200);
  assert.equal(listRuns({ home })[0].needs, null);
  // the run is resumed and stops again LATER than the removal
  await new Promise((r) => { setTimeout(r, 15); });
  const ts = () => new Date().toISOString();
  appendFileSync(spine, [
    { type: 'leg-resume', leg: 2, ts: ts(), seq: 110 },
    { type: 'job-start', job: 'fix-types', specHash: JSON.parse(readFileSync(spine, 'utf8').split('\n')[0]).specHash, budgetUsd: 8, shape: 'plan', goal: 'make types clean', ts: ts(), seq: 111 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 16, spendComplete: true, ts: ts(), seq: 120 },
  ].map((r) => `${JSON.stringify(r)}\n`).join(''));
  const old = new Date(Date.now() - 3 * HOUR);
  utimesSync(spine, old, old); // a spine that went quiet is not a live run
  assert.equal(listRuns({ home })[0].needs, 'Resume', 'back in Needs you');
  assert.equal((await p.get('/api/runs/r1')).body.canRemoveFromNeeds, true);
  assert.equal((await p.get('/api/runs/r1')).body.needsAudit ?? null, null, 'the old removal is not claimed for the new ending');
});

test('Audit says `removed from Needs you after 7 days` for a run that aged out, and nothing for a run still in Needs you', async () => {
  const home = tmp();
  makeRun(home, { runid: 'old', ageMs: 9 * DAY });
  makeRun(home, { runid: 'new' });
  const p = await panel(home);
  assert.equal((await p.get('/api/runs/old')).body.needsAudit, 'removed from Needs you after 7 days');
  assert.equal((await p.get('/api/runs/new')).body.needsAudit ?? null, null);
  assert.equal(getRunDetail('old', { home }).canRemoveFromNeeds, false);
});

test('the new row type changes nothing else in runs.jsonl: the run list, the run counter, and every monthly figure read the same with and without it', () => {
  const home = tmp();
  makeRun(home, { runid: 'r1' });
  makeRun(home, { runid: 'r2', job: 'other', outcome: 'green' });
  const now = () => Date.now();
  writeFileSync(join(home, 'config.json'), JSON.stringify({ monthlyLimitUsd: 10 }));
  const snap = () => JSON.stringify({
    list: readRunList({ home }),
    month: monthSpend({ home, now }),
    summary: spendSummary({ home, now }),
    legs: readLegs({ home, now }),
    room: checkMonthlyRoom({ capUsd: 1, home, now }),
    nos: listRuns({ home }).map((r) => [r.runid, r.runNo, r.glyph]),
  });
  const without = snap();
  // a hostile shape on purpose: it names a REAL run id and carries pid/cap-like fields a reader might mistake for a claim
  appendFileSync(runsFile(home), `${JSON.stringify({ runid: 'r1', type: 'needs-removed', at: new Date().toISOString() })}\n`);
  appendFileSync(runsFile(home), `${JSON.stringify({ runid: 'r1', type: 'needs-removed', at: new Date().toISOString(), pid: 1, capUsd: 99 })}\n`);
  assert.equal(snap(), without, 'rows, events, month spend, Money tab, legs, the monthly room and run numbers are identical');
  assert.equal(listRuns({ home }).find((r) => r.runid === 'r1').needs, null, 'only the Needs-you tag moved');
});

// ------------------------------------------------------------------ the page
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
const ENDED = { reason: 'x', next: 'y', actions: [{ id: 'resume' }, { id: 'reuse' }] };

test('page: Remove from Needs you shows only when the server says so, LAST in the Run tab action row (after the schedule button), never on a live run or an Accept', () => {
  const { render, bar } = pageActions();
  const base = { runid: 'r', live: false, died: false, ended: ENDED, resume: { budgetUsd: 1 }, job: 'j', schedule: { scheduled: true, words: { cancelModify: 'Cancel / modify schedule' } } };
  render({ ...base, canRemoveFromNeeds: true });
  const h = bar.innerHTML;
  assert.match(h, /data-testid="btn-needs-remove">Remove from Needs you</);
  assert.ok(h.indexOf('run-cancel-schedule') < h.indexOf('btn-needs-remove') && h.indexOf('btn-reuse') < h.indexOf('btn-needs-remove'), 'it is the last button');
  render({ ...base, canRemoveFromNeeds: false });
  assert.doesNotMatch(bar.innerHTML, /btn-needs-remove/);
  render({ ...base, accept: true, canRemoveFromNeeds: false });
  assert.doesNotMatch(bar.innerHTML, /btn-needs-remove/, 'a live Accept never shows it');
  render({ runid: 'r', live: true, died: false, ended: null, resume: null, canRemoveFromNeeds: true, job: 'j' });
  assert.doesNotMatch(bar.innerHTML, /btn-needs-remove/, 'a running run is not in Needs you');
});

test('page: the button posts to the needs-remove route only, and the Audit tab paints the server\'s needsAudit line', () => {
  const { PAGE } = pageActions();
  assert.match(PAGE, /"\/api\/runs\/" \+ encodeURIComponent\(detail\.runid\) \+ "\/needs-remove"/);
  assert.match(PAGE, /detail\.needsAudit/);
});
