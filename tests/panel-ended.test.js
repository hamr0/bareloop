// PANEL-BUILD.md P5 items 1 + 2 — the Ended block and Resume.
//
// Every server test drives the REAL panel server on an ephemeral port with an injected
// scratch `home` (never the real ~/.config/bareloop). The spawn seam (`spawnFn`) is the
// ONE stub: it replaces the child process only, so the route's own gate, spec-writing,
// hashing and argv assembly are the code under test. The Ended sentences come from the
// real `endedFor` / `getRunDetail` over real spine files.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync, appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createPanelServer, endedFor, getRunDetail, listRuns } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'panel-ended-'));
  tmpDirs.push(d);
  return d;
}

const SPEC = { job: 'fix-types', description: 'p5 fixture', budgetUsd: 8, maxWallMs: 3_600_000, goal: 'make types clean' };

/**
 * One run on disk, laid out the way a panel-authored run is: the spine under
 * `<out>/source-x/<job>-bareloop/`, the signed spec at `<out>/resolved-spec.json`.
 * The spine is aged past the died window, so "still running" is never the reading.
 */
function makeRun(home, {
  runid = 'run1', outcome = 'cap-halt', spec = SPEC, jobEnd = true, spent = 8, hashOverride = null, extra = [], draft = null,
} = {}) {
  const out = tmp();
  const into = join(out, 'source-x');
  const dir = join(into, `${spec.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const specHash = hashOverride ?? jobSpecHash(spec);
  const t = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const records = [
    {
      type: 'job-start', job: spec.job, specHash, budgetUsd: spec.budgetUsd, shape: 'plan', goal: spec.goal, ts: t(0), seq: 1, ...(draft ? { draftSpentUsd: draft, draftSpendComplete: true } : {}),
    },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: t(1), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: spent, ts: t(2), seq: 3 },
    ...extra,
    ...(jobEnd ? [{ type: 'job-end', outcome, spentUsd: spent, spendComplete: true, ts: t(5), seq: 99 }] : []),
  ];
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  appendRun({
    at: '2026-10-01T10:00:00.000Z', runid, job: spec.job, spine, patient: null, via: 'run-u',
  }, { home });
  return { out, spine, specHash };
}

/** a spawn stub: records every call; `behave(child)` may write the log and emit exit */
function makeSpawn(behave = () => {}) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.unref = () => {};
    calls.push({ cmd, args, opts });
    setImmediate(() => behave(child));
    return child;
  };
  fn.calls = calls;
  return fn;
}

async function startServer(t, opts = {}) {
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, settleMs: 40, ...opts });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body, { withToken = true } = {}) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(withToken ? { 'x-bareloop-token': token } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { base, post, token };
}

// ---------------------------------------------------------------------------
// item 1 — the Ended block (code-owned sentences, one owner for card + detail)
// ---------------------------------------------------------------------------

test('endedFor: the table — every outcome maps to its fixed reason, next line and buttons', () => {
  const ok = { ok: true };
  const no = { ok: false, why: 'it is still running' };
  const live = (outcome, extra = {}) => endedFor({ outcome, stopReason: null, spentUsd: 8, budgetUsd: 8, ...extra }, { died: false, lastThing: null }, extra.o ?? {});
  assert.equal(live(null), null, 'no Ended block while a run is live');
  assert.deepEqual(live('green'), { reason: 'Goal met.', next: 'Nothing to do.', line: 'goal met', actions: [{ id: 'reuse', label: 'Reuse workflow' }] });
  assert.equal(live('already-green').reason, 'Goal met.');
  assert.equal(live('green', { o: { destinationRefused: 'folder is read only' } }).reason, 'Goal met, but the output could not be delivered.');

  const cap = live('cap-halt', { o: { resume: ok } });
  assert.equal(cap.reason, 'Money cap reached ($8.00 of $8.00).');
  assert.equal(cap.next, 'Raise the cap, then Resume.');
  assert.deepEqual(cap.actions, [{ id: 'resume', label: 'Resume' }]);
  assert.equal(cap.line, 'money cap — resume');

  const wall = live('wall-halt', { o: { resume: ok } });
  assert.equal(wall.reason, 'Time cap reached.');
  assert.equal(wall.next, 'Raise the time, then Resume.');

  const prov = live('provider-red', { stopReason: 'HTTP 503', o: { resume: ok } });
  assert.equal(prov.reason, 'The model provider failed (HTTP 503).');
  assert.equal(prov.next, 'Resume.');

  assert.equal(live('step-stalled', { o: { resume: ok } }).reason, 'A step stopped making progress.');

  // Reuse workflow (2026-10-03): the button is for GREEN rows only; every red row says where to change the job
  const stalled = live('step-stalled', { o: { resume: ok } });
  assert.deepEqual(stalled.actions, [{ id: 'resume', label: 'Resume' }], 'stalled: Resume only');
  assert.match(stalled.next, /change the job: Clear the card and draft a new one/);
  assert.deepEqual(live('green', { o: { destinationRefused: 'folder is read only' } }).actions, [{ id: 'reuse', label: 'Reuse workflow' }], 'green + destination refused keeps Reuse workflow');
  assert.match(live('green', { o: { destinationRefused: 'x' } }).next, /Reuse workflow/);
  for (const o of ['cap-halt', 'wall-halt', 'stopped', 'provider-red']) {
    assert.ok(!live(o, { o: { resume: ok } }).actions.some((a) => a.id === 'reuse'), `${o}: never Reuse workflow`);
    assert.ok(!live(o, { o: { resume: no } }).actions.some((a) => a.id === 'reuse'), `${o} (not resumable): never Reuse workflow`);
  }
  for (const cat of ['wall-halt', 'provider-red']) {
    const e = endedFor({ outcome: 'escalated', stopReason: null, spentUsd: 1, budgetUsd: 8, lastEscalation: { category: cat } }, { died: false, lastThing: null }, {});
    assert.deepEqual(e.actions, [], `escalated ${cat}: no button`);
    assert.equal(e.next, 'Change the job: Clear the card and draft a new one.');
  }

  for (const o of ['plan-red', 'check-red', 'step-red', 'escalated']) {
    const r = live(o, { stopReason: 'tests failing' });
    assert.match(r.reason, /^Goal not met — the checks said no \(tests failing\)\.$/, o);
    assert.deepEqual(r.actions, [], `${o} offers no button — a red row says: Change the job: Clear the card and draft a new one`);
    assert.equal(r.next, 'Change the job: Clear the card and draft a new one.', o);
  }
  assert.match(live('close-red').reason, /^The check itself broke \(instrument fault\), not your goal\.$/);
  for (const o of ['pricing-red', 'unapproved-spec', 'job-red', 'branch-red', 'interpreter-red', 'recipe-stale', 'close-unsupported', 'smoke-red', 'runner-drained']) {
    assert.equal(live(o, { stopReason: 'human-confirms stage raw engine detail' }).reason, `Stopped before or outside the work (code: ${o}).`, o);
  }

  const died = endedFor({ outcome: null, stopReason: null, spentUsd: null, budgetUsd: 8 }, { died: true, lastThing: 'a scout model call at 2026-10-01 10:02' }, { resume: ok });
  assert.match(died.reason, /^Stopped with no ending recorded \(last thing it did: a scout model call at 2026-10-01 10:02\)\.$/);
  assert.deepEqual(died.actions, [{ id: 'resume', label: 'Resume' }], 'died: Resume only (Reuse workflow is for green rows)');

  // never a button the engine would refuse
  const refused = live('cap-halt', { o: { resume: no } });
  assert.deepEqual(refused.actions, []);
  assert.match(refused.next, /^Resume is not available for this run \(it is still running\)\.$/);
});

// the REAL escalation record of run mup3h70u (the strike governor filed under category cap-halt),
// copied verbatim from its spine — the money cap never fired on that run ($0.28 of $1.50)
const MUP3H70U_ESCALATION = {
  type: 'escalation',
  category: 'cap-halt',
  decisionReady: true,
  verdicts: ['needs_revision', 'worker-crash', 'worker-crash', 'worker-crash'],
  spend: { runs: 4, strikes: 2, strikeLimit: 2 },
  decision: "2/2 strikes — the fix loop stopped making progress against the close's own numbers (no stage improved — (unstaged) 2 → 2 → 2). Continue, change approach, or stop?",
  options: ['revise the goal/spec so the work is reachable (a spec edit, so the new hash needs re-approval)', 'this cannot be resumed — the close already rendered its verdict against the tree; revise the goal/spec and rerun fresh (a new hash needs re-approval)', 'abandon the task'],
  seq: 236,
  ts: '2026-10-01T05:50:31.666Z',
};

test('ITEM 1: an escalated run whose escalation is the STRIKE governor (category cap-halt, spend.strikes) is "stopped improving", never the money cap, and never resumable', () => {
  const home = tmp();
  makeRun(home, { runid: 'strike1', outcome: 'escalated', spent: 0.28, spec: { ...SPEC, budgetUsd: 1.5 }, extra: [MUP3H70U_ESCALATION] });
  const d = getRunDetail('strike1', { home });
  assert.equal(d.ended.reason, 'The fix loop stopped improving (2 of 2 tries, no check got better).');
  assert.equal(d.ended.next, 'Change the job: Clear the card and draft a new one.');
  assert.deepEqual(d.ended.actions, []);
  assert.doesNotMatch(d.ended.reason, /Money cap/);
  assert.equal(listRuns({ home }).find((r) => r.runid === 'strike1').endedLine, 'stopped improving');
});

test('ITEM 1: "Money cap reached" needs a money-halt record (escalated) or the job-end outcome cap-halt itself', () => {
  const home = tmp();
  makeRun(home, { runid: 'mh1', outcome: 'escalated', spent: 1.5, spec: { ...SPEC, budgetUsd: 1.5 }, extra: [MUP3H70U_ESCALATION, { type: 'money-halt', budgetUsd: 1.5, remainingUsd: 0, ts: '2026-10-01T10:04:00.000Z', seq: 60 }] });
  assert.equal(getRunDetail('mh1', { home }).ended.reason, 'Money cap reached ($1.50 of $1.50).');
  makeRun(home, { runid: 'mh2', outcome: 'cap-halt', spent: 1.5, spec: { ...SPEC, budgetUsd: 1.5 } });
  assert.equal(getRunDetail('mh2', { home }).ended.reason, 'Money cap reached ($1.50 of $1.50).');
});

test('ITEM 2: a terminal outcome never says "Resume is not available" or leaks engine prose; only resumable classes may', () => {
  const home = tmp();
  makeRun(home, { runid: 'esc2', outcome: 'escalated', extra: [MUP3H70U_ESCALATION] });
  const d = getRunDetail('esc2', { home });
  assert.doesNotMatch(d.ended.next, /Resume is not available|answer, not a stop/);
  // a resumable class with no signed spec says so in plain words
  makeRun(home, { runid: 'cap2', hashOverride: 'nope' });
  assert.match(getRunDetail('cap2', { home }).ended.next, /^Resume is not available for this run \(no signed job file beside this run matches the hash it ran under\)\.$/);
});

test('ITEM 3: "stopped before or outside the work" shows the code only — raw engine detail (e.g. a retired hitl stage) never reaches the page', () => {
  const home = tmp();
  makeRun(home, { runid: 'hitl1', outcome: 'hitl-decision-red', extra: [{ type: 'escalation', category: 'hitl-decision-red', detail: 'no human-confirms stage in this close', ts: '2026-10-01T10:04:00.000Z', seq: 70 }] });
  const d = getRunDetail('hitl1', { home });
  assert.equal(d.ended.reason, 'Stopped before or outside the work (code: hitl-decision-red).');
  assert.doesNotMatch(JSON.stringify(d.ended), /human-confirms/);
});

test('getRunDetail + listRuns: a cap-halt run carries the Ended block, the Resume action and the card line', () => {
  const home = tmp();
  makeRun(home, { runid: 'cap1' });
  const d = getRunDetail('cap1', { home });
  assert.equal(d.ended.reason, 'Money cap reached ($8.00 of $8.00).');
  assert.deepEqual(d.ended.actions, [{ id: 'resume', label: 'Resume' }]);
  assert.equal(d.resume.budgetUsd, 8);
  assert.equal(d.resume.maxWallMin, 60);
  assert.equal(d.resume.spentUsd, 8);
  assert.equal(typeof d.resume.wallUsedMs, 'number', 'the time used so far rides with the resume plan — the route\'s time refusal reads the same figure');
  const row = listRuns({ home }).find((r) => r.runid === 'cap1');
  assert.equal(row.endedLine, 'money cap — resume');
  assert.equal(row.glyph, '✗', 'result glyphs unchanged');
});

test('getRunDetail: a green run reads "Goal met." with no Resume; a died run reads Stopped with no ending and glyph ?', () => {
  const home = tmp();
  makeRun(home, { runid: 'grn1', outcome: 'green' });
  const g = getRunDetail('grn1', { home });
  assert.equal(g.ended.reason, 'Goal met.');
  assert.equal(g.ended.next, 'Nothing to do.');
  assert.deepEqual(g.ended.actions, [{ id: 'reuse', label: 'Reuse workflow' }]);
  assert.equal(g.resume, null);

  makeRun(home, { runid: 'died1', jobEnd: false });
  const d = getRunDetail('died1', { home });
  assert.equal(d.glyph, '?', 'died is never [✗]');
  assert.match(d.ended.reason, /^Stopped with no ending recorded \(last thing it did: .+\)\.$/);
  assert.deepEqual(d.ended.actions, [{ id: 'resume', label: 'Resume' }]);
});

test('getRunDetail: a destination-refused record on a green names the delivery failure', () => {
  const home = tmp();
  makeRun(home, { runid: 'dst1', outcome: 'green', extra: [{ type: 'destination-refused', code: 'D1', detail: 'folder is read only', ts: '2026-10-01T10:04:00.000Z', seq: 50 }] });
  assert.equal(getRunDetail('dst1', { home }).ended.reason, 'Goal met, but the output could not be delivered.');
});

test('getRunDetail: a run with a job-end the engine would refuse to resume (plan-red) shows no Resume, and a missing signed spec hides it', () => {
  const home = tmp();
  makeRun(home, { runid: 'red1', outcome: 'plan-red' });
  assert.deepEqual(getRunDetail('red1', { home }).ended.actions, [], 'a red run has no Reuse workflow');
  // cap-halt but the spec beside it is not the one the run was signed under
  makeRun(home, { runid: 'stale1', hashOverride: 'not-the-hash' });
  const s = getRunDetail('stale1', { home });
  assert.deepEqual(s.ended.actions, [], 'cap-halt with no usable signed spec: Resume is hidden, and Reuse workflow is not on the cap-halt row');
  assert.match(s.ended.next, /no signed job file beside this run matches the hash/);
});

// ---------------------------------------------------------------------------
// item 2 — POST /api/runs/:runid/resume
// ---------------------------------------------------------------------------

test('resume route: refused without the human-click token', async (t) => {
  const home = tmp();
  makeRun(home, { runid: 'tok1' });
  const spawnFn = makeSpawn();
  const { post } = await startServer(t, { home, spawnFn });
  const res = await post('/api/runs/tok1/resume', {}, { withToken: false });
  assert.equal(res.status, 403);
  assert.equal(spawnFn.calls.length, 0, 'nothing spawned');
});

test('resume route: unknown run is 404; a run that cannot be resumed is 409 with the reason and spawns nothing', async (t) => {
  const home = tmp();
  makeRun(home, { runid: 'red2', outcome: 'plan-red' });
  const spawnFn = makeSpawn();
  const { post } = await startServer(t, { home, spawnFn });
  assert.equal((await post('/api/runs/nope/resume', {})).status, 404);
  const r = await post('/api/runs/red2/resume', {});
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /Resume is not available for this run \(it ended with an answer, not a stop/);
  assert.equal(spawnFn.calls.length, 0);
});

test('resume route: unchanged caps spawn run-u with the SAME signed spec, --resume <runid> and --approve <its hash>; nothing is written', async (t) => {
  const home = tmp();
  const { out, specHash } = makeRun(home, { runid: 'same1', spent: 5, draft: 0.5 });
  const spawnFn = makeSpawn();
  const { post } = await startServer(t, { home, spawnFn, bareloopBin: '/x/bareloop.mjs' });
  const res = await post('/api/runs/same1/resume', { budgetUsd: 8, maxWallMin: 60 });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.capsChanged, false);
  assert.equal(spawnFn.calls.length, 1);
  const { cmd, args, opts } = spawnFn.calls[0];
  assert.equal(cmd, 'setsid');
  assert.equal(opts.detached, true);
  const i = args.indexOf('run-u');
  assert.deepEqual(args.slice(i, i + 7), ['run-u', '--spec', join(out, 'resolved-spec.json'), '--resume', 'same1', '--approve', specHash]);
  assert.ok(args.includes('systemd-inhibit'), 'held under the inhibitor, like Sign & run');
  assert.deepEqual(args.slice(args.indexOf('--draft-spent-usd'), args.indexOf('--draft-spent-usd') + 2), ['--draft-spent-usd', '0.5'], 'the drafting fold rides every leg');
  assert.deepEqual(readdirSync(out).filter((n) => !n.startsWith('resume-')).sort(), ['resolved-spec.json', 'source-x'], 'no revision file when the caps did not change');
});

test('resume route: raised caps write resolved-spec-r1.json beside the original (never over it) and approve the NEW hash', async (t) => {
  const home = tmp();
  const { out, specHash } = makeRun(home, { runid: 'raise1' });
  const original = readFileSync(join(out, 'resolved-spec.json'), 'utf8');
  const spawnFn = makeSpawn();
  const { post } = await startServer(t, { home, spawnFn });
  const res = await post('/api/runs/raise1/resume', { budgetUsd: 12, maxWallMin: 90 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).capsChanged, true);
  assert.equal(readFileSync(join(out, 'resolved-spec.json'), 'utf8'), original, 'the signed spec is untouched');
  const revised = JSON.parse(readFileSync(join(out, 'resolved-spec-r1.json'), 'utf8'));
  assert.equal(revised.budgetUsd, 12);
  assert.equal(revised.maxWallMs, 90 * 60000);
  assert.equal(revised.goal, SPEC.goal, 'only the caps moved');
  const newHash = jobSpecHash(revised);
  assert.notEqual(newHash, specHash, 'a raised cap is a different signature');
  const { args } = spawnFn.calls[0];
  assert.equal(args[args.indexOf('--approve') + 1], newHash);
  assert.equal(args[args.indexOf('--spec') + 1], join(out, 'resolved-spec-r1.json'));
  // a second resume under another raise takes r2, never overwriting r1
  const before = readFileSync(join(out, 'resolved-spec-r1.json'), 'utf8');
  const res2 = await post('/api/runs/raise1/resume', { budgetUsd: 15 });
  assert.equal(res2.status, 200);
  assert.equal(readFileSync(join(out, 'resolved-spec-r1.json'), 'utf8'), before);
  assert.equal(JSON.parse(readFileSync(join(out, 'resolved-spec-r2.json'), 'utf8')).budgetUsd, 15);
});

test('resume route: a resumed run (signed under r1) is resumed again under ITS caps, not the original', async (t) => {
  const home = tmp();
  const spec1 = { ...SPEC, budgetUsd: 12 };
  // lay the run out by hand: its spine says it ran under the r1 hash
  const r = makeRun(home, { runid: 'chain1', spec: spec1 });
  // the original file is the 8-dollar spec; the spine's hash is spec1's — so only r1 matches
  writeFileSync(join(r.out, 'resolved-spec.json'), JSON.stringify(SPEC));
  writeFileSync(join(r.out, 'resolved-spec-r1.json'), JSON.stringify(spec1));
  const d = getRunDetail('chain1', { home });
  assert.equal(d.resume.budgetUsd, 12, 'the form prefills the caps the run actually ran under');
});

test('resume route: bad caps are 400 and spawn nothing', async (t) => {
  const home = tmp();
  makeRun(home, { runid: 'bad1' });
  const spawnFn = makeSpawn();
  const { post } = await startServer(t, { home, spawnFn });
  assert.equal((await post('/api/runs/bad1/resume', { budgetUsd: -3 })).status, 400);
  assert.equal((await post('/api/runs/bad1/resume', { budgetUsd: 'abc' })).status, 400);
  assert.equal((await post('/api/runs/bad1/resume', { budgetUsd: 8, maxWallMin: 0 })).status, 400);
  assert.equal(spawnFn.calls.length, 0);
});

test('ITEM 5: a money cap at or below what is already spent, or a time cap at or below the time used, is refused at $0 — nothing written, nothing spawned', async (t) => {
  const home = tmp();
  const { out } = makeRun(home, { runid: 'low1' }); // spent 8 of 8, ~5 min used
  const spawnFn = makeSpawn();
  const { post } = await startServer(t, { home, spawnFn });
  for (const cap of [8, 7.5, 1]) {
    const r = await post('/api/runs/low1/resume', { budgetUsd: cap });
    assert.equal(r.status, 400, `cap ${cap}`);
    assert.match((await r.json()).error, /^The money cap must be above what is already spent \(\$8\.00\) — raise it, then Resume\.$/);
  }
  const w = await post('/api/runs/low1/resume', { budgetUsd: 12, maxWallMin: 5 });
  assert.equal(w.status, 400);
  assert.match((await w.json()).error, /^The time cap must be above the time already used \(5 min\)/);
  assert.equal(spawnFn.calls.length, 0);
  assert.deepEqual(readdirSync(out).filter((n) => n !== 'source-x'), ['resolved-spec.json'], 'no revision file, no log');
  // just above is accepted
  assert.equal((await post('/api/runs/low1/resume', { budgetUsd: 8.01 })).status, 200);
});

test("resume route: the engine's own refusal text reaches the page", async (t) => {
  const home = tmp();
  const { out } = makeRun(home, { runid: 'eng1', spent: 5 });
  const refusal = '--resume: that run reached its own terminal (step-red) — only a governance halt leaves work to continue.';
  // the child's stdout/stderr is the run's log file: the stub writes where a real engine would
  const spawnFn = makeSpawn((child) => {
    const log = readdirSync(out).find((n) => n.startsWith('resume-eng1-'));
    appendFileSync(join(out, log), `${refusal}\n`);
    child.emit('exit', 2);
  });
  const { post } = await startServer(t, { home, spawnFn });
  const res = await post('/api/runs/eng1/resume', {});
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, refusal);
});

test('resume route: the monthly $ limit refuses before anything is spawned', async (t) => {
  const home = tmp();
  makeRun(home, { runid: 'mon1', spent: 5 });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ monthlyLimitUsd: 1 }));
  const spawnFn = makeSpawn();
  const { post } = await startServer(t, { home, spawnFn });
  const res = await post('/api/runs/mon1/resume', { budgetUsd: 8 });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /monthly/i);
  assert.equal(spawnFn.calls.length, 0);
});

// ---------------------------------------------------------------------------
// the PAGE: the Ended block and the Resume confirm, extracted verbatim from
// src/panel/index.html and driven against a tiny hand-rolled fake DOM (no jsdom).
// ---------------------------------------------------------------------------

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}

function makePage({ currentRunid = 'run1' } = {}) {
  const els = {};
  const clicks = [];
  const mk = (id) => {
    const subs = {};
    const el = {
      id, hidden: false, className: '', innerHTML: '', textContent: '', value: '', disabled: false, handlers: {},
      addEventListener(ev, fn) { el.handlers[ev] = fn; },
      click() { clicks.push(id); },
      querySelector(sel) { if (!subs[sel]) subs[sel] = mk(`${id}>${sel}`); return subs[sel]; },
    };
    return el;
  };
  const document = { getElementById(id) { if (!els[id]) els[id] = mk(id); return els[id]; } };
  const posts = [];
  let postResult = { status: 200, body: { ok: true } };
  const authorPost = (path, body) => { posts.push({ path, body }); return Promise.resolve(postResult); };
  const refreshed = [];
  const rendered = [];
  const selected = [];
  const timers = [];
  let detailAfter = { glyph: '✗', died: false };
  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'authorPost', 'refreshRunsList', 'setTimeout', 'renderJob', 'selectRun', 'getJSON', 'initialRunid', `
    var currentRunid = initialRunid;
    ${fnSrc('escapeXml')}
    ${fnSrc('panelMoney')}
    var lastEndedSig = null;
    var resumeMode = null;
    var lastJobShown = null;
    var stopAsked = {};
    function reuseWorkflow() {}
    ${fnSrc('renderEnded')}
    ${fnSrc('renderRunActions')}
    ${fnSrc('openResumeOnJobTab')}
    ${fnSrc('paintResumeMode')}
    ${fnSrc('afterResumeRefresh')}
    return { renderEnded: renderEnded, renderRunActions: renderRunActions, setCurrent: function(v){ currentRunid = v; }, paintResumeMode: paintResumeMode, resumeMode: function(){ return resumeMode; }, setLastJob: function(j){ lastJobShown = j; } };
  `);
  const page = factory(document, authorPost, (f) => refreshed.push(f), (fn, ms) => { timers.push(ms); fn(); }, (j) => rendered.push(j), (...a) => selected.push(a),
    () => Promise.resolve(detailAfter), currentRunid);
  return {
    ...page, document, posts, refreshed, els, clicks, rendered, selected, timers, setPostResult(r) { postResult = r; }, setDetailAfter(d) { detailAfter = d; },
  };
}

const DETAIL = {
  runid: 'run1',
  glyph: '✗',
  died: false,
  ended: {
    reason: 'Money cap reached ($8.00 of $8.00).', next: 'Raise the cap, then Resume.', line: 'money cap — resume', actions: [{ id: 'resume', label: 'Resume' }],
  },
  resume: {
    budgetUsd: 8, maxWallMin: 60, spentUsd: 8, spendComplete: true, wallUsedMs: 61 * 60_000 - 5_000,
  },
};

test('page: renderEnded paints ENDED and NEXT as text only (Resume lives in the action row, only when the server offers one), and hides the block while live', () => {
  const pg = makePage();
  pg.renderEnded(DETAIL);
  const box = pg.document.getElementById('ended-block');
  assert.equal(box.hidden, false);
  assert.match(box.innerHTML, /ENDED/);
  assert.match(box.innerHTML, /Money cap reached \(\$8\.00 of \$8\.00\)\./);
  assert.match(box.innerHTML, /NEXT/);
  assert.doesNotMatch(box.innerHTML, /<button|btn-resume|btn-reuse/, 'B5: the Ended block is text only — buttons live in the Run tab\'s action row');
  pg.renderRunActions(DETAIL);
  assert.match(pg.document.getElementById('run-actions').innerHTML, /data-testid="btn-resume-run"/);

  const pg2 = makePage();
  pg2.renderEnded({ ...DETAIL, ended: { ...DETAIL.ended, actions: [] }, resume: null });
  pg2.renderRunActions({ ...DETAIL, ended: { ...DETAIL.ended, actions: [] }, resume: null });
  assert.doesNotMatch(pg2.document.getElementById('run-actions').innerHTML, /btn-resume/, 'no button the engine would refuse');

  pg2.renderEnded({ ...DETAIL, ended: null });
  assert.equal(pg2.document.getElementById('ended-block').hidden, true, 'no Ended block while a run is live');
});

test('page: Resume opens the run\'s own Job tab — ONLY the money cap and the time cap become inputs, and [Sign & resume] posts them', async () => {
  const pg = makePage();
  pg.renderRunActions(DETAIL);
  pg.document.getElementById('run-actions').querySelector('[data-testid="btn-resume-run"]').handlers.click();
  assert.deepEqual(pg.clicks, ['tab-details'], 'it opens the Job tab (the run\'s own page), not an inline form on the Ended block');
  const money = pg.document.getElementById('details-cap-money');
  const time = pg.document.getElementById('details-cap-time');
  assert.match(money.innerHTML, /id="resume-budget"/);
  assert.match(money.innerHTML, /value="8"/, 'prefilled with the signed money cap');
  assert.match(time.innerHTML, /id="resume-wall"/);
  assert.match(time.innerHTML, /value="60"/, 'prefilled with the signed time cap');
  // the unit is in the caption, never loose text above/below the input
  assert.equal(pg.document.getElementById('details-cap-money-label').textContent, 'Money cap ($)');
  assert.equal(pg.document.getElementById('details-cap-time-label').textContent, 'Time cap (min)');
  assert.doesNotMatch(money.innerHTML, /\$ <input|>\s*\$/, 'no loose "$" beside the money input');
  assert.doesNotMatch(time.innerHTML, /> min</, 'no loose "min" beside the time input');
  const box = pg.document.getElementById('resume-job');
  assert.equal(box.hidden, false);
  // [Sign & resume] and [Cancel] are the same button class (same height) — Cancel is no longer a .small one
  assert.match(box.innerHTML, /<button class="btn primary" type="button" data-testid="btn-sign-resume">/);
  assert.match(box.innerHTML, /<button class="btn" type="button" data-testid="btn-resume-cancel">/);
  assert.match(box.innerHTML, /Resume run run1/);
  assert.match(box.innerHTML, /the same run, not a new one/);
  assert.match(box.innerHTML, /Only the money cap and the time cap can change/);
  assert.match(box.innerHTML, /spent so far \$8\.00 &middot; time used so far 61 min/, 'the time already used, rounded UP like the route\'s own refusal text');
  assert.match(box.innerHTML, /Sign &amp; resume/);
  // nothing else on the Job tab was turned into an input: the page only ever touches the two cap cells and the Sign box
  for (const id of ['details-goal', 'details-success', 'details-guardrails', 'details-source', 'details-dest', 'details-tools', 'details-model']) {
    assert.equal(pg.els[id], undefined, `${id} is never touched by resume mode — it stays the read-only text`);
  }
  assert.doesNotMatch(pg.document.getElementById('ended-block').innerHTML, /resume-form/, 'the old inline confirm form is gone');

  pg.document.getElementById('resume-budget').value = '12';
  pg.document.getElementById('resume-wall').value = '90';
  pg.setPostResult({ status: 409, body: { ok: false, error: '--resume: that run reached its own terminal' } });
  await box.querySelector('[data-testid="btn-sign-resume"]').handlers.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(pg.posts, [{ path: '/api/runs/run1/resume', body: { budgetUsd: '12', maxWallMin: '90' } }]);
  const err = pg.document.getElementById('resume-err');
  assert.equal(err.textContent, '--resume: that run reached its own terminal');
  assert.equal(err.hidden, false);
  assert.equal(pg.resumeMode() !== null, true, 'a refusal leaves the Job tab in resume mode so the caps can be fixed');
});

test('page: a successful resume says nothing about a NEW run — the same run goes back to its Run tab and follows the engine until it reads live', async () => {
  const pg = makePage();
  pg.renderRunActions(DETAIL);
  pg.document.getElementById('run-actions').querySelector('[data-testid="btn-resume-run"]').handlers.click();
  pg.setPostResult({ status: 200, body: { ok: true, runid: 'run1' } });
  pg.setDetailAfter({ glyph: '▶', died: false });
  await pg.document.getElementById('resume-job').querySelector('[data-testid="btn-sign-resume"]').handlers.click();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(pg.resumeMode(), null, 'resume mode is over');
  assert.equal(pg.clicks.at(-1), 'tab-run', 'back to the run\'s own Run tab');
  assert.equal(pg.rendered.length, 1, 'the Job tab is repainted read-only');
  assert.deepEqual(pg.selected.map((a) => a[0]), ['run1'], 'the SAME runid is re-selected once it reads live');
  assert.doesNotMatch(PAGE, /The new run is starting/, 'the copy that said a resume is a new run is gone');
  assert.doesNotMatch(PAGE, /appears in the list in a moment/);
});

test('page: Cancel leaves resume mode and repaints the Job tab read-only', () => {
  const pg = makePage();
  pg.renderRunActions(DETAIL);
  pg.document.getElementById('run-actions').querySelector('[data-testid="btn-resume-run"]').handlers.click();
  pg.document.getElementById('resume-job').querySelector('[data-testid="btn-resume-cancel"]').handlers.click();
  assert.equal(pg.resumeMode(), null);
  assert.equal(pg.rendered.length, 1);
  // the stub's renderJob does not repaint; the captions return to normal when the Job tab paints without resume mode
  pg.paintResumeMode();
  assert.equal(pg.document.getElementById('details-cap-money-label').textContent, '$ cap');
  assert.equal(pg.document.getElementById('details-cap-time-label').textContent, 'Time cap');
});

test('page: resume mode belongs to ONE run — painting it while another run is open hides it', () => {
  const pg = makePage();
  pg.renderRunActions(DETAIL);
  pg.document.getElementById('run-actions').querySelector('[data-testid="btn-resume-run"]').handlers.click();
  pg.setCurrent('other');
  pg.paintResumeMode();
  assert.equal(pg.document.getElementById('resume-job').hidden, true);
});

test('page: renderRun calls renderEnded (an engine with a caller), and the run card carries the endedLine under the job name', () => {
  assert.match(fnSrc('renderRun'), /renderEnded\(detail\);/);
  assert.match(PAGE, /r\.status \? '<span class="wf-ended"[^]*?statusWordHtml\(r\.status, r\.endedLine\)/);
  assert.match(PAGE, /g\.lastStatus \? '<span class="wf-ended wf-ended-inline"[^]*?statusWordHtml\(g\.lastStatus, g\.lastEndedLine\)/);
});
