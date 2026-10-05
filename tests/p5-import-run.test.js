// An imported job's Run tab reads like a normal run page (hamr's click-through 2026-10-04): the latest GREEN run in
// the bundle — from `runs/<runid>/spine.jsonl` when there is one, else from the bridge, else "no green". Real panel
// server on an ephemeral port, scratch `home` and `userHome`, a REAL exported bundle (tests/bundle-fixture.js) and a
// REAL green bundle run (tests/fixtures/bundle-run-muo1jah4: the spine and tool log `bareloop run <bundle>` wrote).
// The bundle is untrusted input and read only: every case checks the folder is byte-identical afterwards.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, copyFileSync, statSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createPanelServer } from '../src/panel/server.js';
import { importId } from '../src/panel/importroutes.js';
import { readBundle } from '../src/bundle.js';
import {
  safeSpinePath, parseImportedRunId, importedRunId, latestBridgeGreen, bridgeRunDetail, MAX_RUN_FILE_BYTES,
} from '../src/panel/importrun.js';
import { exportFixtureBundle } from './bundle-fixture.js';

const FIX = join(import.meta.dirname, 'fixtures', 'bundle-run-muo1jah4');
/** @type {string[]} */ const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'p5-import-run-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

async function start(t, { home, userHome }) {
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, userHome });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const get = (p) => fetch(`${base}${p}`, { headers: { 'x-bareloop-token': token } });
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(body) });
  return { get, post };
}

/** a fingerprint of every file (path, size, content hash) under `dir` — the bundle must not change by being looked at */
function fingerprint(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(`${p.slice(dir.length)}:${statSync(p).size}:${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
      else out.push(`${p.slice(dir.length)}:link`);
    }
  };
  walk(dir);
  return out.join('\n');
}

/** put the real green bundle run into `<dir>/runs/<runid>/` */
function addRun(dir, runid, { spine = join(FIX, 'spine.jsonl'), audit = true } = {}) {
  mkdirSync(join(dir, 'runs', runid), { recursive: true });
  copyFileSync(spine, join(dir, 'runs', runid, 'spine.jsonl'));
  if (audit) copyFileSync(join(FIX, 'gate-audit.jsonl'), join(dir, 'runs', runid, 'gate-audit.jsonl'));
}

async function setup(t, prep) {
  const home = tmp('p5-import-run-cfg-');
  const userHome = tmp('p5-import-run-user-');
  const bundleDir = join(userHome, 'fix.bareloop');
  exportFixtureBundle(bundleDir);
  if (prep) prep(bundleDir);
  const s = await start(t, { home, userHome });
  const id = (await (await s.post('/api/imports', { path: bundleDir })).json()).id;
  const view = async () => (await (await s.get(`/api/imports/${id}`)).json());
  return { ...s, id, bundleDir, view, home };
}

test('spine present: the view points at the latest GREEN run, and /api/runs/<id> + /audit + /rounds read it like any run', async (t) => {
  const { get, view, bundleDir, id } = await setup(t, (d) => addRun(d, 'greenrun1'));
  const before = fingerprint(bundleDir);
  const v = await view();
  assert.equal(v.runsHere, 1);
  assert.equal(v.run.kind, 'spine');
  assert.equal(v.run.id, `${id}~greenrun1`);
  assert.equal(v.run.runid, 'greenrun1');
  assert.equal(v.run.at, '2026-09-30T11:48:05.358Z', "the run's own job-start time");
  const d = await (await get(`/api/runs/${v.run.id}`)).json();
  assert.equal(d.glyph, '✓');
  assert.equal(d.outcome, 'green');
  assert.equal(d.live, false, 'a freshly copied spine is never "live"');
  assert.equal(d.stopping, false);
  assert.equal(d.job, 'bareguard-u-types-deepseek', "the run's own job-start names the job");
  assert.ok(d.parts.length >= 2, 'the same ordered part list a run carries (map + cards)');
  assert.ok(d.steps.length >= 2);
  assert.equal(typeof d.spentUsd, 'number');
  assert.equal(d.behaviour.totalCalls > 0, true, "the bundle run's gate-audit.jsonl beside the spine is the tool log");
  const a = await (await get(`/api/runs/${v.run.id}/audit`)).json();
  assert.ok(a.rows.length > 100);
  assert.equal(a.reason, null);
  const r = await (await get(`/api/runs/${v.run.id}/rounds?part=0&attempt=1`)).json();
  assert.ok(r && Array.isArray(r.rounds));
  assert.equal(fingerprint(bundleDir), before, 'reading the run changed nothing in the bundle');
  assert.equal(readBundle(bundleDir).ok, true, "and the bundle's own hash still holds");
});

test('spine present: the newest GREEN run wins; a newer run that did not end green is skipped; a garbled spine is skipped', async (t) => {
  const { view, get, id } = await setup(t, (d) => {
    addRun(d, 'oldgreen');
    // a newer run that escalated: the real spine with its job-end outcome changed (the only authored line in this fixture)
    const lines = readFileSync(join(FIX, 'spine.jsonl'), 'utf8').trim().split('\n');
    const last = JSON.parse(lines.at(-1));
    assert.equal(last.type, 'job-end');
    lines[lines.length - 1] = JSON.stringify({ ...last, outcome: 'escalated' });
    mkdirSync(join(d, 'runs', 'newred'), { recursive: true });
    writeFileSync(join(d, 'runs', 'newred', 'spine.jsonl'), `${lines.join('\n')}\n`);
    mkdirSync(join(d, 'runs', 'garbled'), { recursive: true });
    writeFileSync(join(d, 'runs', 'garbled', 'spine.jsonl'), 'not json\n{"type":\n');
    // make the red and garbled ones the NEWEST by mtime
    const now = Date.now() / 1000;
    for (const [n, off] of [['oldgreen', 300], ['newred', 100], ['garbled', 50]]) {
      const f = join(d, 'runs', n, 'spine.jsonl');
      const t0 = new Date((now - off) * 1000);
      utimesSync(f, t0, t0);
    }
  });
  const v = await view();
  assert.equal(v.runsHere, 3);
  assert.equal(v.run.kind, 'spine');
  assert.equal(v.run.runid, 'oldgreen');
  assert.equal((await get(`/api/runs/${id}~newred`)).status, 200, 'the red one is still readable as a run');
  assert.equal((await (await get(`/api/runs/${id}~newred`)).json()).outcome, 'escalated');
});

test('bridge only: the view carries the bridge\'s green version as a run detail in the SAME shape; fields the bridge lacks are null/absent, never 0 or invented', async (t) => {
  const { view, bundleDir } = await setup(t, (d) => {
    const f = join(d, 'bridges', readdirSync(join(d, 'bridges'))[0]);
    const b = JSON.parse(readFileSync(f, 'utf8'));
    b.versions[0].plan = { schema: 'plan-v1', steps: [{ id: 'first-step', action: 'x' }, { id: 'second-step', action: 'y' }] };
    delete b.versions[0].wallMs;
    writeFileSync(f, `${JSON.stringify(b)}\n`);
  });
  const before = fingerprint(bundleDir);
  const v = await view();
  assert.equal(v.status, 'ok', 'bridges are not part of the bundle hash');
  assert.equal(v.runsHere, 0);
  assert.equal(v.run.kind, 'bridge');
  assert.equal(v.run.runid, 'r1');
  assert.equal(v.run.at, '2026-09-05T00:00:00.000Z');
  const d = v.run.detail;
  assert.equal(d.fromBridge, true);
  assert.equal(d.glyph, '✓');
  assert.equal(d.checkType, 'deterministic');
  assert.equal(d.budgetUsd, 1.5);
  assert.deepEqual(d.parts.map((p) => p.label), ['first-step', 'second-step']);
  assert.deepEqual(d.steps.map((s) => s.id), ['first-step', 'second-step']);
  assert.equal(d.spentUsd, 2);
  assert.equal(d.spendComplete, true);
  assert.equal(d.wallMs, null, 'a field the bridge does not carry is null, not 0');
  assert.equal(d.model, null);
  assert.equal(d.behaviour, null);
  assert.equal(d.memoryCache, null);
  assert.equal(d.provider, null);
  assert.equal(d.parts[0].rounds, null);
  assert.equal(d.parts[0].toolCalls, null);
  assert.equal(d.parts[0].byTool, null);
  assert.deepEqual(d.toolsUsed, ['read', 'grep', 'edit']);
  assert.equal(d.close.verdict, 'satisfied — changed-from-seed · suite-green');
  assert.equal(d.ended, null);
  assert.equal(d.live, false);
  assert.equal(fingerprint(bundleDir), before);
});

test('bridge only, plan with no steps: parts and steps are empty (the page says "no steps recorded")', async (t) => {
  const { view } = await setup(t);
  const v = await view();
  assert.equal(v.run.kind, 'bridge');
  assert.deepEqual(v.run.detail.parts, []);
  assert.deepEqual(v.run.detail.steps, []);
});

test('no green anywhere: no bridge version and no green spine → {kind: none}, never a fabricated run', async (t) => {
  const { view, get, id } = await setup(t, (d) => {
    rmSync(join(d, 'bridges'), { recursive: true });
    // a spine that never ended (the real one, cut before its job-end)
    const lines = readFileSync(join(FIX, 'spine.jsonl'), 'utf8').trim().split('\n').slice(0, -1);
    mkdirSync(join(d, 'runs', 'cut'), { recursive: true });
    writeFileSync(join(d, 'runs', 'cut', 'spine.jsonl'), `${lines.join('\n')}\n`);
  });
  const v = await view();
  assert.equal(v.run.kind, 'none');
  assert.equal(v.runsHere, 1);
  assert.equal(v.ok, true);
  assert.equal((await get(`/api/runs/${id}~cut`)).status, 200);
});

test('malformed or hostile bundle files never crash the view and never become a run', async (t) => {
  const outside = tmp('p5-import-run-outside-');
  addRun(outside, 'secretrun'); // a real run OUTSIDE the bundle, reachable only through a link
  const { view, get, id, bundleDir } = await setup(t, (d) => {
    // a malformed bridge beside a good one, and a version with the wrong types
    writeFileSync(join(d, 'bridges', 'broken.json'), '{ not json');
    writeFileSync(join(d, 'bridges', 'wrongtypes.json'), JSON.stringify({ versions: [{ greenAt: 5, costUsd: 'lots' }, null, 'x'], history: 7 }));
    // links: runs/<id> is a symlink to a real run outside; runs/<id2>/spine.jsonl is a link; a tool log is a link
    mkdirSync(join(d, 'runs'), { recursive: true });
    symlinkSync(join(outside, 'runs', 'secretrun'), join(d, 'runs', 'linkdir'));
    mkdirSync(join(d, 'runs', 'linkspine'), { recursive: true });
    symlinkSync(join(outside, 'runs', 'secretrun', 'spine.jsonl'), join(d, 'runs', 'linkspine', 'spine.jsonl'));
    mkdirSync(join(d, 'runs', 'linkaudit'), { recursive: true });
    copyFileSync(join(FIX, 'spine.jsonl'), join(d, 'runs', 'linkaudit', 'spine.jsonl'));
    symlinkSync(join(outside, 'runs', 'secretrun', 'gate-audit.jsonl'), join(d, 'runs', 'linkaudit', 'gate-audit.jsonl'));
    // names that are not run names
    mkdirSync(join(d, 'runs', 'has space'), { recursive: true });
    copyFileSync(join(FIX, 'spine.jsonl'), join(d, 'runs', 'has space', 'spine.jsonl'));
  });
  const before = fingerprint(bundleDir);
  const v = await view();
  assert.equal(v.ok, true);
  assert.equal(v.run.kind, 'bridge', 'every hostile run folder is passed over; the good bridge is what is left');
  assert.equal(v.runsHere, 0);
  for (const name of ['linkdir', 'linkspine', 'linkaudit']) assert.equal((await get(`/api/runs/${id}~${name}`)).status, 404, `${name} is not a readable run`);
  assert.equal((await get(`/api/runs/${id}~has%20space`)).status, 400);
  assert.equal(fingerprint(bundleDir), before);
});

test('imported run ids: only a listed import and a plain run folder inside its bundle resolve; anything else is 404/400', async (t) => {
  const { get, id } = await setup(t, (d) => addRun(d, 'greenrun1'));
  assert.equal((await get(`/api/runs/${id}~greenrun1`)).status, 200);
  assert.equal((await get(`/api/runs/${id}~nope`)).status, 404);
  assert.equal((await get(`/api/runs/aaaaaaaaaaaa~greenrun1`)).status, 404, 'not an imported folder');
  assert.equal((await get(`/api/runs/${id}~..`)).status, 404);
  assert.equal((await get(`/api/runs/${id}~%2e%2e%2fmanifest`)).status, 400);
  // the run list never lists an imported run
  const list = await (await get('/api/runs')).json();
  assert.deepEqual(list.runs, []);
});

test('importrun helpers: id round-trip, size bound, latestBridgeGreen picks the newest version by greenAt and skips junk', () => {
  assert.deepEqual(parseImportedRunId(importedRunId('0123456789ab', 'r_1-x')), { importId: '0123456789ab', runid: 'r_1-x' });
  assert.equal(parseImportedRunId('0123456789ab~../x'), null);
  assert.equal(parseImportedRunId('xyz~r1'), null);
  assert.equal(parseImportedRunId('0123456789ab'), null);
  const d = tmp();
  mkdirSync(join(d, 'runs', 'big'), { recursive: true });
  writeFileSync(join(d, 'runs', 'big', 'spine.jsonl'), '');
  assert.equal(safeSpinePath(d, 'big'), join(d, 'runs', 'big', 'spine.jsonl'));
  assert.equal(safeSpinePath(d, '../x'), null);
  assert.equal(typeof MAX_RUN_FILE_BYTES, 'number');
  const g = latestBridgeGreen([
    null, { versions: 'x' },
    { name: 'a', versions: [{ greenAt: '2026-01-01T00:00:00Z', runid: 'old' }, { greenAt: 'nonsense' }, { greenAt: '2026-03-01T00:00:00Z', runid: 'new', costUsd: 3 }],
      history: [{ runid: 'new', outcome: 'green', spendComplete: false }] },
  ]);
  assert.equal(g.version.runid, 'new');
  assert.equal(g.historyRow.spendComplete, false);
  const det = bridgeRunDetail(g, { job: 'a', checkType: 'deterministic', checkTypeTitle: null, model: null, budgetUsd: null });
  assert.equal(det.spentUsd, 3);
  assert.equal(det.spendComplete, false);
  assert.equal(det.wallMs, null);
  assert.equal(latestBridgeGreen([]), null);
  assert.equal(latestBridgeGreen('junk'), null);
});

test('importId stays the same hash the list uses (the composite id carries it)', () => {
  assert.match(importId('/x/y'), /^[0-9a-f]{12}$/);
});
