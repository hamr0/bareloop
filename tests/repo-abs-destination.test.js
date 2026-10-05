// hamr's ruling B (2026-10-05): for a REPO source an absolute Destination is refused at $0 with one plain message,
// before the copy and before any model call — for a fresh card and a Reuse card alike (one rule, one owner:
// `repoDestinationProblem`). A relative Destination on a repo and an absolute one on a FOLDER keep working.
// REAL git repos, the real session engine, scratch homes; a counting fake `generate` proves no model is reached.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getStartFromImport } from '../src/panel/server.js';
import { importsPath, importId } from '../src/panel/importroutes.js';
import { createSession, buildReuseSpec, repoDestinationProblem } from '../src/panel/authorsession.js';
import { exportFixtureBundle } from './bundle-fixture.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MSG = 'Destination must be a path inside the repo, like src/digest.js';
/** @type {string[]} */ const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
function makeRepo() {
  const dir = tmp('absdest-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
const home = () => { const d = tmp('absdest-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); return d; };
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => { setTimeout(r, 10); }); } return false; }
const settled = (s) => ['prepared', 'refused', 'error', 'confirm', 'drafting'].includes(s.state.phase) || s.state.pendingAsk !== null;

/** @param {any} card @param {any} [extra] */
function fresh(card, calls, extra = {}) {
  return createSession({
    checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'absdest-job', goal: 'g', success: 's', guardrails: 'n', judgeExamples: '', capUsd: 2, ...card,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: home(), sessionsRoot: tmp('absdest-sess-'),
    generate: async () => { calls.n++; throw new Error('no model'); }, confirmGenerate: async () => { calls.n++; throw new Error('no model'); },
    authorFn: async () => { calls.n++; throw new Error('no model'); },
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    prepareSigningFn: async () => { throw new Error('no signing'); },
    ...extra,
  });
}

test('repoDestinationProblem: absolute POSIX and drive paths refuse on a repo; relative never; a folder never', () => {
  for (const d of ['/home/x/repo/src/digest.js', 'C:\\x\\src\\a.js', 'D:/x/a.js']) {
    assert.equal(repoDestinationProblem(d, true), MSG);
    assert.equal(repoDestinationProblem(d, false), null);
  }
  for (const d of ['src/digest.js', 'src/**', 'src/']) assert.equal(repoDestinationProblem(d, true), null);
});

test('fresh card: an absolute Destination on a REPO source is refused at $0 with the plain message; no model call, nothing spent', async () => {
  const repo = makeRepo();
  const calls = { n: 0 };
  const s = fresh({ source: repo, destination: join(repo, 'src', 'digest.js') }, calls);
  assert.ok(await until(() => s.state.phase === 'refused' || settled(s)));
  assert.equal(s.state.phase, 'refused', String(s.state.error));
  assert.equal(s.state.error, MSG);
  assert.equal(calls.n, 0, 'no model seam was reached');
  assert.ok(!(s.state.draftSpentUsd > 0), 'nothing spent');
});

test('fresh card: a relative Destination on a repo is NOT refused by this rule (reaches the draft)', async () => {
  const repo = makeRepo();
  const calls = { n: 0 };
  const s = fresh({ source: repo, destination: 'src/digest.js' }, calls);
  assert.ok(await until(() => calls.n > 0 || s.state.phase === 'refused' || s.state.pendingAsk !== null));
  assert.notEqual(s.state.error, MSG);
  assert.ok(calls.n > 0 || s.state.phase !== 'refused', `drafting was reached; phase=${s.state.phase} error=${s.state.error}`);
});

test('fresh card: a FOLDER source with an absolute Destination still works (not refused by this rule)', async () => {
  const folder = tmp('absdest-folder-'); writeFileSync(join(folder, 'a.txt'), 'x\n');
  const out = tmp('absdest-out-');
  const calls = { n: 0 };
  const s = fresh({ source: folder, destination: out }, calls);
  assert.ok(await until(() => calls.n > 0 || s.state.phase === 'refused' || s.state.pendingAsk !== null));
  assert.notEqual(s.state.error, MSG);
});

test('Reuse card: an absolute Destination on a REPO source is refused with the same message, no model call', async () => {
  const h = home();
  const bundleDir = join(tmp('absdest-user-'), 'fix.bareloop');
  const b = exportFixtureBundle(bundleDir);
  mkdirSync(join(bundleDir, 'node_modules'));
  symlinkSync(REPO_ROOT, join(bundleDir, 'node_modules', 'bareloop'));
  appendFileSync(importsPath(h), `${JSON.stringify({ at: '2026-10-03T10:00:00.000Z', dir: bundleDir, job: 'fixture-export-job', bundleHash: b.bundleHash })}\n`);
  const pre = getStartFromImport(importId(bundleDir), { home: h });
  const repo = makeRepo();
  const calls = { n: 0 };
  const run = (destination) => {
    const card = { ...pre.card, source: repo, destination, capUsd: 1 };
    return createSession(card, {
      env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: h, sessionsRoot: tmp('absdest-sess-'),
      reuse: { spec: buildReuseSpec(pre.spec, card), workflowKey: pre.workflowKey },
      generate: async () => { calls.n++; throw new Error('no model'); }, confirmGenerate: async () => { calls.n++; throw new Error('no model'); },
      prepareSigningFn: async () => { throw new Error('command close'); },
    });
  };
  const bad = run(join(repo, 'src', 'mod.js'));
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(bad.state.phase)));
  assert.equal(bad.state.error, MSG);
  assert.equal(calls.n, 0);
  const ok = run('src/**');
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(ok.state.phase)));
  assert.notEqual(ok.state.error, MSG, String(ok.state.error));
});
