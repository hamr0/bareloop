// PRD v1.114 / F245 — `bareloop export "<job> (run-N)" --out <dir>`: a bundle from a green panel run, by its name.
// Fixtures are REAL archived panel sessions (tests/fixtures/export-run/): smuqqw9x266au = fix-slugify (a green repo job,
// run muqrenrf, closeDecl, no close scripts) and smvij5q3rx96z = flight-c1 (a green rubric / page-link job, run mvij7kuk).
// Every test runs in a scratch home; nothing reads or writes the real ~/.config/bareloop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun, readRunList, readExported } from '../src/runlist.js';
import { listGreenRuns, exportRun } from '../src/runexport.js';
import { readBundle } from '../src/bundle.js';
import { jobSpecHash } from '../src/job.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'export-run');

/** @param {import('node:test').TestContext} t */
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'export-run-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

/**
 * A scratch home whose run list points at a COPY of one archived session.
 * @param {import('node:test').TestContext} t
 * @param {string} session fixture dir name @param {string} jobDir `<job>-bareloop` @param {string} runid @param {string} job
 */
function scratch(t, session, jobDir, runid, job) {
  const root = tmp(t);
  const sess = join(root, 'panel-sessions', session);
  cpSync(join(FIX, session), sess, { recursive: true });
  const home = join(root, 'home');
  appendRun({
    at: '2026-10-02T09:27:14.379Z', runid, job, spine: join(sess, 'source-seed', jobDir, `u-${runid}.jsonl`), patient: join(sess, 'source-seed', 'tree'), via: 'run-u',
  }, { home });
  return { root, sess, home };
}

const repoRun = (/** @type {import('node:test').TestContext} */ t) => scratch(t, 'smuqqw9x266au', 'fix-slugify-bareloop', 'muqrenrf', 'fix-slugify');
const rubricRun = (/** @type {import('node:test').TestContext} */ t) => scratch(t, 'smvij5q3rx96z', 'flight-c1-bareloop', 'mvij7kuk', 'flight-c1');

/** @param {string[]} argv @param {object} deps @param {string} [input] */
async function cli(argv, deps, input) {
  let o = ''; let e = '';
  const code = await main(argv, {
    stdout: { write: (/** @type {string} */ s) => { o += s; }, isTTY: false },
    stderr: { write: (/** @type {string} */ s) => { e += s; } },
    stdin: Readable.from(input === undefined ? [] : [input]),
    env: {},
    ...deps,
  });
  return { code, out: o, err: e };
}

test('listGreenRuns: the real green panel run is listed under the panel\'s own name "job (run-N)"', (t) => {
  const { home } = repoRun(t);
  const runs = listGreenRuns({ home });
  assert.deepEqual(runs.map((r) => r.name), ['fix-slugify (run-1)']);
  assert.equal(runs[0].runid, 'muqrenrf');
});

test('exportRun: a real green repo run becomes a bundle that readBundle accepts, its numbers read off the run\'s spine', (t) => {
  const { root, home, sess } = repoRun(t);
  const outDir = join(root, 'bundle');
  const r = exportRun({ name: 'fix-slugify (run-1)', outDir, home, bareloopVersion: '0.47.1', now: () => Date.parse('2026-10-25T10:00:00Z') });
  assert.equal(r.ok, true, JSON.stringify(r));
  const rb = readBundle(outDir);
  assert.equal(rb.ok, true, JSON.stringify(rb.reds));
  const signed = JSON.parse(readFileSync(join(sess, 'resolved-spec.json'), 'utf8'));
  // the signed spec as is: closeDecl kept, no close key invented, same hash
  assert.deepEqual(rb.spec, signed);
  assert.equal(jobSpecHash(rb.spec), jobSpecHash(signed));
  assert.equal(rb.spec.close, undefined);
  assert.equal(rb.manifest.bundleHash, r.ok && r.bundleHash);
  // the bridge: plan from the bridge file, numbers from the spine (job-end cost; 8 worker rounds; first-to-last record time)
  assert.equal(rb.bridges.length, 1);
  const v = rb.bridges[0].versions[0];
  assert.equal(v.runid, 'muqrenrf');
  assert.equal(v.costUsd, 0.003699911999999999);
  assert.equal(v.rounds, 8);
  assert.equal(v.wallMs, 19822);
  assert.equal(v.patient, join(sess, 'source-seed', 'tree'));
  assert.equal(rb.bridges[0].specHash, jobSpecHash(signed));
  assert.equal(rb.bridges[0].history[0].spendComplete, true);
  // one `exported` row, ignored by the run list
  const ex = readExported({ home });
  assert.equal(ex.length, 1);
  assert.deepEqual({ ...ex[0], at: undefined }, { type: 'exported', runid: 'muqrenrf', job: 'fix-slugify', bundle: outDir, bundleHash: r.ok ? r.bundleHash : '', at: undefined });
  assert.equal(ex[0].at, '2026-10-25T10:00:00.000Z');
  assert.equal(readRunList({ home }).rows.length, 1, 'the exported row is not a run');
});

test('exportRun: a rubric (judged) page-link job is refused at $0 with the plain reason', (t) => {
  const { root, home } = rubricRun(t);
  assert.deepEqual(listGreenRuns({ home }), [], 'the list offers only runs export can take: a rubric page-link job is not listed');
  const r = exportRun({ name: 'flight-c1 (run-1)', outDir: join(root, 'b'), home, bareloopVersion: '0.47.1' });
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.why, /only repo jobs can be exported for now/);
  assert.match(r.ok ? '' : r.why, /rubric job/);
  assert.equal(existsSync(join(root, 'b')), false, 'nothing written');
  assert.equal(readExported({ home }).length, 0);
});

test('exportRun: a green-class job that reads a page link, or works on a plain folder, is refused with its own reason', (t) => {
  // the real repo run, with ITS spec and source.json re-recorded the way a link / folder job would be (hash re-pinned in the spine)
  const link = repoRun(t);
  const specFile = join(link.sess, 'resolved-spec.json');
  const spec = JSON.parse(readFileSync(specFile, 'utf8'));
  const spine = join(link.sess, 'source-seed', 'fix-slugify-bareloop', 'u-muqrenrf.jsonl');
  const oldHash = jobSpecHash(spec);
  spec.inputs = [{ n: 1, label: 'page', value: 'https://example.com/x' }];
  const newHash = jobSpecHash(spec);
  writeFileSync(specFile, JSON.stringify(spec, null, 2));
  for (const f of [spine, join(link.sess, 'source-seed', 'fix-slugify-bareloop', 'bridge-fix-slugify-muqrenrf.json')]) writeFileSync(f, readFileSync(f, 'utf8').split(oldHash).join(newHash));
  const a = exportRun({ name: 'fix-slugify (run-1)', outDir: join(link.root, 'b'), home: link.home, bareloopVersion: '0.47.1' });
  assert.equal(a.ok, false);
  assert.match(a.ok ? '' : a.why, /only repo jobs can be exported for now.*page link/);

  const folder = repoRun(t);
  const srcFile = join(folder.sess, 'source-seed', 'source.json');
  writeFileSync(srcFile, readFileSync(srcFile, 'utf8').replace('"kind": "repo"', '"kind": "folder"'));
  const b = exportRun({ name: 'fix-slugify (run-1)', outDir: join(folder.root, 'b'), home: folder.home, bareloopVersion: '0.47.1' });
  assert.equal(b.ok, false);
  assert.match(b.ok ? '' : b.why, /only repo jobs can be exported for now.*plain folder/);
});

test('exportRun: a number that cannot be read is refused naming it, never guessed (no ending record = no cost)', (t) => {
  const { root, home, sess } = repoRun(t);
  const spine = join(sess, 'source-seed', 'fix-slugify-bareloop', 'u-muqrenrf.jsonl');
  const lines = readFileSync(spine, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  const je = lines.find((l) => l.type === 'job-end');
  delete je.engagementSpentUsd; delete je.spentUsd;
  writeFileSync(spine, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  const r = exportRun({ name: 'fix-slugify (run-1)', outDir: join(root, 'b'), home, bareloopVersion: '0.47.1' });
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.why, /cannot read what .* cost/);
  assert.equal(existsSync(join(root, 'b')), false);
});

test('exportRun: an unknown name, a name that is not a name, and a missing saved plan are each refused in words', (t) => {
  const { root, home, sess } = repoRun(t);
  assert.match(String(exportRun({ name: 'nope (run-9)', outDir: join(root, 'b'), home, bareloopVersion: '0.47.1' })['why']), /no run named/);
  assert.match(String(exportRun({ name: 'fix-slugify', outDir: join(root, 'b'), home, bareloopVersion: '0.47.1' })['why']), /not a run name/);
  rmSync(join(sess, 'source-seed', 'fix-slugify-bareloop', 'bridge-fix-slugify-muqrenrf.json'));
  assert.deepEqual(listGreenRuns({ home }), [], 'a run with no saved plan (e.g. already green at start) is not listed either');
  assert.match(String(exportRun({ name: 'fix-slugify (run-1)', outDir: join(root, 'b'), home, bareloopVersion: '0.47.1' })['why']), /saved no plan/);
});

test('CLI export by name with --out: exits 0 and prints the next steps', async (t) => {
  const { root, home } = repoRun(t);
  const outDir = join(root, 'bundle');
  const r = await cli(['export', 'fix-slugify (run-1)', '--out', outDir], { runlistHome: home });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /exported "fix-slugify \(run-1\)"/);
  assert.match(r.out, /npm install/);
  assert.equal(readBundle(outDir).ok, true);
});

test('CLI export with no name lists the green runs, takes a number, then asks the folder', async (t) => {
  const { root, home } = repoRun(t);
  const outDir = join(root, 'bundle');
  const r = await cli(['export'], { runlistHome: home, cwd: root }, `1\n${outDir}\n`);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /1 {2}fix-slugify \(run-1\)/);
  assert.match(r.out, /Number to export:/);
  assert.equal(readBundle(outDir).ok, true);
});

test('CLI export prompts: one empty Enter asks again; a second ends cleanly with exit 0 and nothing exported', async (t) => {
  const { root, home } = repoRun(t);
  const once = await cli(['export'], { runlistHome: home, cwd: root }, `\n1\n${join(root, 'b1')}\n`);
  assert.equal(once.code, 0, once.err);
  assert.equal((once.out.match(/Number to export:/g) ?? []).length, 2, 'asked twice');
  assert.equal(readBundle(join(root, 'b1')).ok, true);
  const twice = await cli(['export'], { runlistHome: home, cwd: root }, '\n\n');
  assert.equal(twice.code, 0);
  assert.match(twice.out, /Nothing chosen, nothing exported\./);
  assert.equal(readExported({ home }).length, 1, 'only the first export left a row');
  const noFolder = await cli(['export', 'fix-slugify (run-1)'], { runlistHome: home, cwd: root }, '\n\n');
  assert.equal(noFolder.code, 0);
  assert.match(noFolder.out, /No folder given, nothing exported\./);
});

test('CLI export old form (job.json --registry --out) still routes to the registry exporter', async (t) => {
  const r = await cli(['export', '/no/such/job.json', '--registry', '/no/such/reg', '--out', '/no/such/out'], { runlistHome: tmp(t) });
  assert.equal(r.code, 1);
  assert.match(r.err, /cannot read job spec at \/no\/such\/job\.json/);
});

// --- the one menu: 6 export, 7 run, 8 resume, 9 history each prompt for what they need ---

const MENU_LAUNCHER = { ports: [], timeoutMs: 50, nodeVersion: '22.1.0', version: '0.0.0-test' };

test('menu 6 export: pick a green run from the numbered list, give a folder, the bundle is made; two empty Enters end it with exit 0', async (t) => {
  const { root, home } = repoRun(t);
  const outDir = join(root, 'from-menu');
  const r = await cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, `6\n1\n${outDir}\n`);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /6 export {3}7 run {3}8 resume {3}9 history/);
  assert.match(r.out, /Green runs you can export:\n {2}1 {2}fix-slugify \(run-1\)/);
  assert.equal(readBundle(outDir).ok, true);
  const none = await cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, '6\n\n\n');
  assert.equal(none.code, 0);
  assert.match(none.out, /Nothing chosen, nothing exported\./);
  assert.equal(readExported({ home }).length, 1);
});

test('menu 9 history: pick an exported bundle by number and see its history; menu 7 run with two empty Enters runs nothing and exits 0', async (t) => {
  const { root, home } = repoRun(t);
  const outDir = join(root, 'b');
  assert.equal(exportRun({ name: 'fix-slugify (run-1)', outDir, home, bareloopVersion: '0.47.1' }).ok, true);
  const h = await cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, '9\n1\n');
  assert.equal(h.code, 0, h.err);
  assert.match(h.out, /Bundles:\n {2}1 {2}fix-slugify \(run-1\) {2}\S+\/b\n/);
  assert.match(h.out, /history: \(no runs yet\)/);
  assert.match(h.out, /bridges:/);
  const run = await cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, '7\n\n\n');
  assert.equal(run.code, 0);
  assert.match(run.out, /No bundle chosen, nothing run\./);
  const resume = await cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, '8\n');
  assert.equal(resume.code, 0);
  assert.match(resume.out, /No stopped runs to resume\./);
});

test('bundle pick lists (history / run): the last 10, newest first, numbered, label = run name + folder; older by name or folder; deduped by folder; none = one plain line', async (t) => {
  const { root, home } = repoRun(t);
  const { mkdirSync } = await import('node:fs');
  const { appendExported } = await import('../src/runlist.js');
  // none known: one line, exit 0, nothing asked
  const emptyHome = join(root, 'empty-home');
  const none = await cli([], { runlistHome: emptyHome, keysHome: emptyHome, launcher: MENU_LAUNCHER }, '9\n');
  assert.equal(none.code, 0);
  assert.match(none.out, /No exported bundles yet\. Export one with 6\.\n/);
  assert.doesNotMatch(none.out, /Bundle \(a number/);
  // 12 bundles exported on 12 days; one of them listed twice (same folder, later row) is still one entry
  for (let i = 1; i <= 12; i += 1) {
    const dir = join(root, `bundle-${String(i).padStart(2, '0')}`);
    mkdirSync(dir, { recursive: true });
    appendExported({ runid: 'muqrenrf', job: 'fix-slugify', bundle: dir, bundleHash: 'h', at: `2026-10-${String(i).padStart(2, '0')}T10:00:00.000Z` }, { home });
  }
  appendExported({ runid: 'muqrenrf', job: 'fix-slugify', bundle: join(root, 'bundle-03'), bundleHash: 'h', at: '2026-10-03T11:00:00.000Z' }, { home });
  const r = await cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, `9\n1\n`);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Bundles \(the last 10 of 12; older ones by run name or folder\):/);
  const listed = [...r.out.matchAll(/^ {2}(\d+) {2}fix-slugify \(run-1\) {2}(\S+)$/gm)].map((m) => [Number(m[1]), m[2].split('/').pop()]);
  assert.deepEqual(listed, [[1, 'bundle-12'], [2, 'bundle-11'], [3, 'bundle-10'], [4, 'bundle-09'], [5, 'bundle-08'], [6, 'bundle-07'], [7, 'bundle-06'], [8, 'bundle-05'], [9, 'bundle-04'], [10, 'bundle-03']], 'newest first, 10 shown, a folder listed twice once');
  assert.match(r.out, /history: \(no runs yet\)/, 'number 1 picked the newest');
  // an older one by its folder (not shown) is still reachable
  const old = await cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, `9\n${join(root, 'bundle-01')}\n`);
  assert.match(old.out, /history: \(no runs yet\)/);
});

test('q (any case, trimmed) at a job question ends that command cleanly: plain "nothing chosen" line, exit 0, never a name or number', async (t) => {
  const { root, home } = repoRun(t);
  const b = join(root, 'b');
  assert.equal(exportRun({ name: 'fix-slugify (run-1)', outDir: b, home, bareloopVersion: '0.47.1' }).ok, true);
  const menu = (input) => cli([], { runlistHome: home, keysHome: home, launcher: MENU_LAUNCHER }, input);
  const cases = [
    ['7\nq\n', /No bundle chosen, nothing run\./],
    ['9\n Q \n', /No bundle chosen, nothing shown\./],
    ['6\nQ\n', /Nothing chosen, nothing exported\./],
    ['6\n1\nq\n', /No folder given, nothing exported\./],
  ];
  for (const [input, want] of cases) {
    const r = await menu(input);
    assert.equal(r.code, 0, `${JSON.stringify(input)}: ${r.err}`);
    assert.match(r.out, want, JSON.stringify(input));
    assert.doesNotMatch(r.err, /neither a bundle folder nor/, JSON.stringify(input));
  }
  // run: q at the repo question
  const repo = await menu(`7\n${b}\nq\n`);
  assert.equal(repo.code, 0);
  assert.match(repo.out, /No repo chosen, nothing run\./);
});

// The Run tab NEXT "reusable bundle:" row (panel) is offered only for runs `checkExportable` takes (one owner), and its command is shell-safe.
/** a repo run's panel detail: the fixture gets a work-branch record + a worktree in source.json so the green ending shows the merge rows */
function panelDetail(sess, home, mutate = (/** @type {any[]} */ r) => r) {
  const dir = join(sess, 'source-seed');
  const src = JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8'));
  writeFileSync(join(dir, 'source.json'), JSON.stringify({ ...src, repo: src.repo ?? join(sess, 'repo'), worktree: join(sess, 'wt-gone') }));
  const spine = join(dir, 'fix-slugify-bareloop', 'u-muqrenrf.jsonl');
  const recs = readFileSync(spine, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  recs.splice(1, 0, { type: 'work-branch', branch: 'bareloop-fix-slugify', created: true, resumed: false, from: null, base: 'abc', repo: join(sess, 'wt-gone'), ts: recs[0].ts, seq: 0 });
  writeFileSync(spine, `${mutate(recs).map((r) => JSON.stringify(r)).join('\n')}\n`);
  return getRunDetail('muqrenrf', { home });
}
const exportRow = (/** @type {any} */ d) => (d.ended.rows ?? []).find((/** @type {string[]} */ r) => r[0] === 'reusable bundle:');

test('panel NEXT: a green repo run with a saved plan gets the export row, and its command is shell-safe', (t) => {
  const { home, sess } = repoRun(t);
  const row = exportRow(panelDetail(sess, home));
  assert.ok(row, 'offered');
  assert.equal(row[1], 'bareloop export "fix-slugify (run-1)" --out "./fix-slugify-bundle"');
  assert.doesNotMatch(row[1], /[<>]/);
});

test('panel NEXT: an already-green run (no saved plan) gets NO export row', (t) => {
  const { home, sess } = repoRun(t);
  rmSync(join(sess, 'source-seed', 'fix-slugify-bareloop', 'bridge-fix-slugify-muqrenrf.json'));
  const d = panelDetail(sess, home, (recs) => recs.map((r) => (r.type === 'job-end' ? { ...r, outcome: 'already-green' } : r)));
  assert.ok(d.ended.rows.some((/** @type {string[]} */ r) => r[0] === 'keep the work:'), 'the merge rows still show');
  assert.equal(exportRow(d), undefined);
});

test('panel NEXT: a soft-green (rubric) repo run gets NO export row', (t) => {
  const { home, sess } = repoRun(t);
  // re-record the spec as a judged class, hash re-pinned in the spine and the saved plan (as the folder/link test does)
  const specFile = join(sess, 'resolved-spec.json');
  const spec = JSON.parse(readFileSync(specFile, 'utf8'));
  const oldHash = jobSpecHash(spec);
  const next = { ...spec, verdictType: 'softgreen' };
  writeFileSync(specFile, JSON.stringify(next));
  const bridge = join(sess, 'source-seed', 'fix-slugify-bareloop', 'bridge-fix-slugify-muqrenrf.json');
  writeFileSync(bridge, readFileSync(bridge, 'utf8').split(oldHash).join(jobSpecHash(next)));
  const d = panelDetail(sess, home, (recs) => JSON.parse(JSON.stringify(recs).split(oldHash).join(jobSpecHash(next))));
  assert.ok(d.ended.rows.some((/** @type {string[]} */ r) => r[0] === 'keep the work:'));
  assert.equal(exportRow(d), undefined);
});
