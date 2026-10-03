// Reuse workflow item 5 (hamr 2026-10-03) — REUSING AN IMPORTED JOB. The bundle is re-read and re-verified at the
// moment of reuse (bundle hash over every close script, its own `bareloop` dependency, every close stage's signed
// sha256 against the bytes on disk), the spec is the bundle's with `$BARELOOP_BUNDLE` resolved to the folder, the
// same four boxes are open, and the person signs the result on this machine. A REAL exported bundle
// (tests/bundle-fixture.js), real readers, scratch homes only; the model boundary is never reached (no key is real).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, symlinkSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createPanelServer, getStartFromImport } from '../src/panel/server.js';
import { importsPath, importId } from '../src/panel/importroutes.js';
import { createSession, buildReuseSpec } from '../src/panel/authorsession.js';
import { resolveBundleSpec, readBundle } from '../src/bundle.js';
import { jobSpecHash, workflowKey } from '../src/job.js';
import { exportFixtureBundle } from './bundle-fixture.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
/** @type {string[]} */ const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'reuse-imp-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

/** a config home with a Settings row (the key's NAME is all a row needs) and one imported bundle in it */
function setup({ deps = true, importRow = true, env = 'ANTHROPIC_API_KEY=fake-not-a-real-key\n' } = {}) {
  const home = tmp('reuse-imp-home-');
  if (env) writeFileSync(join(home, '.env'), env, { mode: 0o600 });
  const bundleDir = join(tmp('reuse-imp-user-'), 'fix.bareloop');
  const b = exportFixtureBundle(bundleDir);
  // the bundle's own `bareloop` dependency (what `cd <bundle> && npm install` provides): a link to this checkout
  if (deps) { mkdirSync(join(bundleDir, 'node_modules')); symlinkSync(REPO_ROOT, join(bundleDir, 'node_modules', 'bareloop')); }
  const id = importId(bundleDir);
  if (importRow) appendFileSyncRow(home, { at: '2026-10-03T10:00:00.000Z', dir: bundleDir, job: 'fixture-export-job', bundleHash: b.bundleHash });
  return { home, bundleDir, id, bundleHash: b.bundleHash };
}
function appendFileSyncRow(home, row) { appendFileSync(importsPath(home), `${JSON.stringify(row)}\n`); }

const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
function makeRepo() {
  const dir = tmp('reuse-imp-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => { setTimeout(r, 10); }); } return false; }

test('prefill from an imported job: the bundle\'s spec with $BARELOOP_BUNDLE resolved to its folder, the locked boxes from the signed job, the four open boxes at the exported values, Source blank', () => {
  const { home, bundleDir, id } = setup();
  const pre = getStartFromImport(id, { home });
  assert.equal(pre.ok, true, JSON.stringify(pre));
  assert.equal(pre.from, 'imported job');
  assert.deepEqual(pre.origin, { runid: null, job: 'fixture-export-job', importId: id });
  assert.equal(pre.card.jobName, 'fixture-export-job');
  assert.equal(pre.card.goal, 'Make the fixture pass its own close.');
  assert.equal(pre.card.success, 'changed-from-seed · suite-green', 'success is the close stages, read by the Job tab\'s own reader');
  assert.equal(pre.card.destination, 'src/**');
  assert.equal(pre.card.capUsd, 1.5);
  assert.equal(pre.card.maxWallMs, 1_800_000);
  assert.equal(pre.card.source, '');
  assert.ok(pre.card.model !== '', 'the Settings Name of the job\'s provider');
  assert.ok(pre.spec.close.every((s) => s.cmd.includes(`${bundleDir}/close/`) && !s.cmd.includes('$BARELOOP_BUNDLE')), 'close paths point at the verified folder');
  assert.equal(pre.workflowKey, workflowKey(resolveBundleSpec(readBundle(bundleDir), bundleDir).spec));
  assert.match(pre.line, /^Same job — 0 green · 0 not green · no finished run yet to price or time$/);
});

test('an imported job is refused in words — never reused — when it changed, lost its dependency, has a tampered script, or has no Settings row', () => {
  // swapped close script: the bundle's own hash no longer matches what was imported
  const a = setup();
  appendFileSync(join(a.bundleDir, 'close', 'fixture-close.mjs'), '\n// swapped\n');
  const t = getStartFromImport(a.id, { home: a.home });
  assert.equal(t.ok, false);
  assert.match(t.error, /changed since import/);
  // folder gone
  const g = setup();
  rmSync(g.bundleDir, { recursive: true, force: true });
  assert.match(getStartFromImport(g.id, { home: g.home }).error, /not found|changed since import|moved or deleted/);
  // no `npm install` inside the bundle
  const d = setup({ deps: false });
  const r = getStartFromImport(d.id, { home: d.home });
  assert.equal(r.ok, false);
  assert.match(r.error, /npm install/);
  // no Settings row for the job's provider
  const n = setup({ env: '' });
  const nr = getStartFromImport(n.id, { home: n.home });
  assert.equal(nr.ok, false);
  assert.match(nr.error, /Settings > Providers/);
  assert.equal(getStartFromImport('aaaaaaaaaaaa', { home: a.home }), null);
});

test('routes: the imported reuse refuses a changed locked box by name and accepts the four open ones; the session it starts is a reuse', async (t) => {
  const { home, id } = setup({ env: 'ANTHROPIC_API_KEY=bad key\n' }); // a malformed key: every session refuses at $0
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, sessionsRoot: tmp('reuse-imp-sess-') });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const get = (p) => fetch(`${base}${p}`, { headers: { 'x-bareloop-token': token } });
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(body) });
  const pre = await (await get(`/api/author/start-from?import=${id}`)).json();
  assert.equal(pre.ok, true, JSON.stringify(pre));
  assert.deepEqual(pre.open, ['source', 'destination', 'capUsd', 'maxWallMs']);
  assert.equal((await get('/api/author/start-from?import=aaaaaaaaaaaa')).status, 404);

  const bad = await post('/api/author/start', { ...pre.card, source: '/x', goal: 'smuggled', startFrom: { importId: id } });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'Goal is locked on a reused workflow — use + New to change it');
  const noSource = await post('/api/author/start', { ...pre.card, startFrom: { importId: id } });
  assert.equal(noSource.status, 400);
  assert.equal((await noSource.json()).error, 'Source is required');
  const ok = await (await post('/api/author/start', { ...pre.card, source: '/some/source', destination: 'lib/', capUsd: 1, startFrom: { importId: id } })).json();
  assert.equal(ok.ok, true);
  assert.equal(ok.reuse, true);
});

test('session: an imported reuse re-verifies the close bytes, signs the spec as written (command close: no declaration to ground), NEW hash, SAME workflowKey; a script swapped after the prefill is refused', async () => {
  const { home, bundleDir, id } = setup();
  const pre = getStartFromImport(id, { home });
  const spec = buildReuseSpec(pre.spec, { destination: 'lib/', capUsd: 1, maxWallMs: 600000 });
  const mk = () => createSession({ ...pre.card, source: makeRepo(), destination: 'lib/', capUsd: 1, maxWallMs: 600000 }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: tmp('reuse-imp-sess-'),
    reuse: { spec, workflowKey: pre.workflowKey },
    generate: async () => { throw new Error('a reuse must never call the model'); },
    confirmGenerate: async () => { throw new Error('a reuse must never call the model'); },
    authorFn: async () => { throw new Error('a reuse must never author'); },
    prepareSigningFn: async () => { throw new Error('a command close is signed as written — prepareSigning refuses it by design'); },
  });
  const s = mk();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  assert.equal(s.state.phase, 'prepared', String(s.state.error));
  assert.equal(s.state.specHash, jobSpecHash(spec));
  assert.notEqual(s.state.specHash, pre.specHash, 'the caps and the fence are in the hash: a NEW one to sign');
  const written = JSON.parse(readFileSync(join(s.state.outDir, 'resolved-spec.json'), 'utf8'));
  assert.deepEqual(written, spec);
  assert.equal(workflowKey(written), pre.workflowKey);
  assert.equal(JSON.parse(readFileSync(join(s.state.outDir, 'signing.json'), 'utf8')).gates.closeBytes.ok, true);
  assert.ok(existsSync(join(s.state.outDir, 'card.json')));
  assert.equal(s.state.draftSpentUsd, 0);

  // the script is swapped between the prefill and the session: the byte check refuses, nothing is signed
  appendFileSync(join(bundleDir, 'close', 'fixture-close.mjs'), '\n// swapped after the prefill\n');
  const s2 = mk();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s2.state.phase)));
  assert.equal(s2.state.phase, 'refused');
  assert.match(s2.state.error, /does not match its signed bytes/);
});
