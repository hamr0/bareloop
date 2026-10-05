// PANEL-BUILD.md P5 item 4 — IMPORT, READ ONLY: the folder browser's path safety, the import list, the re-read on
// every view ("changed since import"), and the view's facts. Real panel server on an ephemeral port, scratch
// `home` (config) and scratch `userHome` (the folder the browser starts in) — never the real ones; a REAL
// exported bundle (tests/bundle-fixture.js).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, appendFileSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPanelServer } from '../src/panel/server.js';
import {
  resolveFsPath, findBundles, readImports, importId, importsPath, SEARCH_DEPTH, MAX_VISITED, MAX_RESULTS,
} from '../src/panel/importroutes.js';
import { bless } from '../src/bundle.js';
import { exportFixtureBundle } from './bundle-fixture.js';

/** @type {string[]} */ const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'p5-import-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

async function start(t, { home, userHome }) {
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, userHome });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const get = (p, withToken = true) => fetch(`${base}${p}`, { headers: withToken ? { 'x-bareloop-token': token } : {} });
  const post = (p, body, withToken = true) => fetch(`${base}${p}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(withToken ? { 'x-bareloop-token': token } : {}) }, body: JSON.stringify(body),
  });
  return { base, get, post };
}

// ── path safety, unit ────────────────────────────────────────────────────────────────────────────────────────
test('resolveFsPath: ~ and ~/x expand to the injected home; blank = home; relative, NUL, another user\'s ~ and non-folders are refused; .. collapses; a symlink is resolved and the REAL path is returned', () => {
  const home = tmp();
  mkdirSync(join(home, 'a', 'b'), { recursive: true });
  writeFileSync(join(home, 'afile'), 'x');
  const norm = (p) => resolveFsPath(p, home);
  assert.deepEqual(norm(''), { ok: true, requested: home, path: home });
  assert.equal(norm('~').path, home);
  assert.equal(norm('~/a').path, join(home, 'a'));
  assert.equal(norm(`${home}/a/b/../b/.`).path, join(home, 'a', 'b'), '.. and . are collapsed');
  assert.equal(norm('relative/dir').ok, false);
  assert.match(norm('relative/dir').error, /absolute/);
  assert.equal(norm('~root/x').ok, false);
  assert.equal(norm(`${home}/a\0/etc`).ok, false, 'a NUL byte is refused outright');
  assert.equal(norm('x'.repeat(5000)).ok, false);
  assert.equal(norm(42).ok, false);
  assert.match(norm(join(home, 'nope')).error, /no such folder/);
  assert.match(norm(join(home, 'afile')).error, /not a folder/);
  const outside = tmp('p5-import-outside-');
  symlinkSync(outside, join(home, 'link'));
  const viaLink = norm(join(home, 'link'));
  assert.equal(viaLink.ok, true);
  assert.equal(viaLink.requested, join(home, 'link'));
  assert.equal(viaLink.path, outside, 'the response says which folder it chose: the real one, not the link');
});

// hamr's click-through 2026-10-04, item 3: the list is job bundles only, found by searching DOWN.
test('findBundles: only bundles (real manifest.json FILE), relative paths, depth <= 3, no symlink followed, node_modules/.git/dot-folders skipped, never descends into a bundle', () => {
  const d = tmp();
  const bundle = (...p) => { mkdirSync(join(d, ...p), { recursive: true }); writeFileSync(join(d, ...p, 'manifest.json'), '{}'); };
  bundle('abundle');
  bundle('x', 'y', 'deep3');            // depth 3: found
  bundle('x', 'y', 'z', 'deep4');       // depth 4: not found
  bundle('node_modules', 'pkg');        // skipped
  bundle('.git', 'inner');              // skipped
  bundle('.hidden', 'inner');           // skipped
  bundle('outer');
  bundle('outer', 'nested');            // inside a bundle: not descended into
  mkdirSync(join(d, 'plain', 'folder'), { recursive: true });
  mkdirSync(join(d, 'linked-manifest'));
  writeFileSync(join(d, 'real.json'), '{}');
  symlinkSync(join(d, 'real.json'), join(d, 'linked-manifest', 'manifest.json'));
  const away = tmp('p5-import-target-');
  writeFileSync(join(away, 'manifest.json'), '{}');
  symlinkSync(away, join(d, 'a-link-to-a-bundle'));
  writeFileSync(join(d, 'a-file.txt'), 'secret contents');
  const r = findBundles(d);
  assert.deepEqual(r.entries.map((e) => e.name), ['abundle', 'outer', 'x/y/deep3']);
  assert.deepEqual(r.entries.map((e) => e.path), [join(d, 'abundle'), join(d, 'outer'), join(d, 'x', 'y', 'deep3')]);
  for (const e of r.entries) assert.deepEqual(Object.keys(e).sort(), ['bundle', 'name', 'path'], 'names, path and the tag only — never contents');
  assert.equal(SEARCH_DEPTH, 3);
  assert.equal(r.stopped, false);
  assert.equal(r.truncated, false);
  assert.deepEqual(findBundles(tmp()).entries, [], 'nothing below: empty, no error');
  assert.deepEqual(findBundles(join(d, 'does-not-exist')).entries, [], 'an unreadable folder is skipped silently');
});

test('findBundles: the caps are plain — MAX_VISITED folders stops the walk (stopped), MAX_RESULTS bundles truncates', () => {
  assert.equal(MAX_VISITED, 5000);
  assert.equal(MAX_RESULTS, 200);
  const many = tmp();
  for (let i = 0; i < MAX_RESULTS + 3; i += 1) { const p = join(many, `b${String(i).padStart(4, '0')}`); mkdirSync(p); writeFileSync(join(p, 'manifest.json'), '{}'); }
  const t1 = findBundles(many);
  assert.equal(t1.entries.length, MAX_RESULTS);
  assert.equal(t1.truncated, true);
  const wide = tmp();
  for (let i = 0; i < MAX_VISITED + 5; i += 1) mkdirSync(join(wide, `d${String(i).padStart(5, '0')}`));
  const t2 = findBundles(wide);
  assert.equal(t2.stopped, true);
  assert.equal(t2.visited, MAX_VISITED);
});

// ── the routes ───────────────────────────────────────────────────────────────────────────────────────────────
test('routes: fs/list and imports are behind the human guard (token + own address); the listing starts at the injected home and says which folder it chose', async (t) => {
  const home = tmp('p5-import-cfg-');
  const userHome = tmp('p5-import-user-');
  mkdirSync(join(userHome, 'jobs', 'a.bareloop'), { recursive: true });
  writeFileSync(join(userHome, 'jobs', 'a.bareloop', 'manifest.json'), '{}');
  mkdirSync(join(userHome, 'other'));
  const { get, post } = await start(t, { home, userHome });
  assert.equal((await get('/api/fs/list', false)).status, 403);
  assert.equal((await get('/api/imports', false)).status, 403);
  assert.equal((await post('/api/imports', { path: userHome }, false)).status, 403);
  const top = await (await get('/api/fs/list')).json();
  assert.equal(top.ok, true);
  assert.equal(top.path, userHome, 'starts at the home folder');
  assert.deepEqual(top.entries, [{ name: 'jobs/a.bareloop', path: join(userHome, 'jobs', 'a.bareloop'), bundle: true }], 'bundles only, relative to the folder asked for');
  assert.equal(top.depth, 3);
  assert.equal(top.stopped, false);
  const jobs = await (await get(`/api/fs/list?path=${encodeURIComponent(join(userHome, 'jobs'))}`)).json();
  assert.deepEqual(jobs.entries, [{ name: 'a.bareloop', path: join(userHome, 'jobs', 'a.bareloop'), bundle: true }]);
  assert.equal(jobs.parent, userHome);
  // refusals
  const rel = await get('/api/fs/list?path=relative');
  assert.equal(rel.status, 400);
  const nope = await get(`/api/fs/list?path=${encodeURIComponent(join(userHome, 'zzz'))}`);
  assert.equal(nope.status, 400);
  // a link in the listing is not offered; asking for the link by name says what it resolved to
  const outside = tmp('p5-import-outside-');
  mkdirSync(join(outside, 'secret-folder'));
  symlinkSync(outside, join(userHome, 'sneaky'));
  const after1 = await (await get('/api/fs/list')).json();
  assert.ok(!after1.entries.some((e) => e.name.includes('sneaky') || e.name.includes('secret-folder')), 'the symlinked folder is not searched');
  const asked = await (await get(`/api/fs/list?path=${encodeURIComponent(join(userHome, 'sneaky'))}`)).json();
  assert.equal(asked.requested, join(userHome, 'sneaky'));
  assert.equal(asked.path, outside, 'it names the real folder it chose');
});

test('import: a clean bundle imports (one line in imports.jsonl in the INJECTED home), a non-bundle / tampered folder is refused; the list re-reads every bundle: "changed since import" (tampered) and "folder not found" (gone)', async (t) => {
  const home = tmp('p5-import-cfg-');
  const userHome = tmp('p5-import-user-');
  const bundleDir = join(userHome, 'jobs', 'fix.bareloop');
  mkdirSync(join(userHome, 'jobs'), { recursive: true });
  const exported = exportFixtureBundle(bundleDir);
  mkdirSync(join(userHome, 'plain-folder'));
  const { get, post } = await start(t, { home, userHome });
  const before = readdirSync(bundleDir, { recursive: true }).sort();

  const notBundle = await post('/api/imports', { path: join(userHome, 'plain-folder') });
  assert.equal(notBundle.status, 400);
  assert.match((await notBundle.json()).error, /not a clean exported job folder/);
  assert.equal(existsSync(importsPath(home)), false, 'a refused import records nothing');

  const ok = await post('/api/imports', { path: bundleDir });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.id, importId(bundleDir));
  const rows = readFileSync(importsPath(home), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['at', 'bundleHash', 'dir', 'job']);
  assert.equal(rows[0].dir, bundleDir);
  assert.equal(rows[0].job, 'fixture-export-job');
  assert.equal(rows[0].bundleHash, exported.bundleHash);
  assert.deepEqual(readdirSync(home).sort(), ['imports.jsonl'], 'nothing else written into the config home');
  assert.deepEqual(readdirSync(bundleDir, { recursive: true }).sort(), before, 'import is read only: the folder gains and loses nothing');

  let list = await (await get('/api/imports')).json();
  assert.equal(list.imports.length, 1);
  assert.equal(list.imports[0].status, 'ok');
  assert.equal(list.imports[0].statusText, null);

  // the folder changes after the import: a close script's bytes
  appendFileSync(join(bundleDir, 'close', 'fixture-close.mjs'), '// edited after import\n');
  list = await (await get('/api/imports')).json();
  assert.equal(list.imports[0].status, 'changed');
  assert.equal(list.imports[0].statusText, 'changed since import');
  const view = await (await get(`/api/imports/${list.imports[0].id}`)).json();
  assert.equal(view.status, 'changed', 'the view re-reads too');
  assert.ok(view.reds.includes('bundle-tampered'));
  // and a tampered folder cannot be (re)imported
  const again = await post('/api/imports', { path: bundleDir });
  assert.equal(again.status, 400);

  rmSync(bundleDir, { recursive: true, force: true });
  list = await (await get('/api/imports')).json();
  assert.equal(list.imports[0].status, 'missing');
  assert.match(list.imports[0].statusText, /folder not found/);
});

test('the view: goal, checks, guardrails, caps, model, the exported history (greens AND reds) and approved-or-not on THIS machine', async (t) => {
  const home = tmp('p5-import-cfg-');
  const userHome = tmp('p5-import-user-');
  const bundleDir = join(userHome, 'fix.bareloop');
  const exported = exportFixtureBundle(bundleDir);
  const { get, post } = await start(t, { home, userHome });
  const id = (await (await post('/api/imports', { path: bundleDir })).json()).id;
  const v = await (await get(`/api/imports/${id}`)).json();
  assert.equal(v.ok, true);
  assert.equal(v.status, 'ok');
  assert.equal(v.job, 'fixture-export-job');
  assert.equal(v.goal, 'Make the fixture pass its own close.');
  assert.equal(v.checkType, 'deterministic');
  assert.equal(v.success, 'changed-from-seed · suite-green');
  assert.match(v.guardrails, /write fence.*src\/\*\*/);
  assert.equal(v.budgetUsd, 1.5);
  assert.equal(v.maxWallMs, 1_800_000);
  assert.deepEqual({ greens: v.history.greens, reds: v.history.reds, total: v.history.total }, { greens: 1, reds: 1, total: 2 });
  assert.equal(v.history.recent[0].outcome, 'green', 'newest first');
  assert.equal(v.approved, false);
  assert.match(v.approvedText, /not approved on this machine yet/);
  // the first green run on this machine blesses it
  bless(bundleDir, { bundleHash: exported.bundleHash, runid: 'local1', outcome: 'green', blessedAt: '2026-10-02T10:00:00.000Z' });
  const v2 = await (await get(`/api/imports/${id}`)).json();
  assert.equal(v2.approved, true);
  assert.equal(v2.approvedText, 'approved on this machine (first green run 2026-10-02)');
  // a blessing for another hash is stale
  bless(bundleDir, { bundleHash: 'deadbeef', runid: 'local1', outcome: 'green' });
  assert.match((await (await get(`/api/imports/${id}`)).json()).approvedText, /approval is stale/);
  assert.equal((await get('/api/imports/aaaaaaaaaaaa')).status, 404);
  assert.equal(readImports(home).length, 1);
});

