// The ONE progress list (hamr 2026-10-04): the session's `state.steps`, driven through the real engine (real git repos,
// real bundle fixture, real source door) — each pipeline step is one entry that updates in place, a refusal fails
// exactly one step with the reason once, and no pipeline text goes into the chat thread. Scratch homes only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getStartFromImport } from '../src/panel/server.js';
import { importsPath, importId } from '../src/panel/importroutes.js';
import { createSession, buildReuseSpec, STEP_LABELS } from '../src/panel/authorsession.js';
import { signRun } from '../src/panel/authorroutes.js';
import { exportFixtureBundle } from './bundle-fixture.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
/** @type {string[]} */ const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
function makeRepo(extra = {}) {
  const dir = tmp('steps-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  for (const [f, body] of Object.entries(extra)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), body); }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
function setup() {
  const home = tmp('steps-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const bundleDir = join(tmp('steps-user-'), 'fix.bareloop');
  const b = exportFixtureBundle(bundleDir);
  mkdirSync(join(bundleDir, 'node_modules'));
  symlinkSync(REPO_ROOT, join(bundleDir, 'node_modules', 'bareloop'));
  appendFileSync(importsPath(home), `${JSON.stringify({ at: '2026-10-03T10:00:00.000Z', dir: bundleDir, job: 'fixture-export-job', bundleHash: b.bundleHash })}\n`);
  return { home, pre: getStartFromImport(importId(bundleDir), { home }) };
}
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => { setTimeout(r, 10); }); } return false; }
function start(source, { home, pre }, key = 'fake-not-a-real-key') {
  const card = { ...pre.card, source, destination: 'src/**', capUsd: 1 };
  return createSession(card, {
    env: { ANTHROPIC_API_KEY: key }, home, sessionsRoot: tmp('steps-sess-'),
    reuse: { spec: buildReuseSpec(pre.spec, card), workflowKey: pre.workflowKey },
    generate: async () => { throw new Error('no model'); }, confirmGenerate: async () => { throw new Error('no model'); },
    prepareSigningFn: async () => { throw new Error('command close'); },
  });
}
const settled = (s) => ['prepared', 'refused', 'error'].includes(s.state.phase);

test('a reuse that reaches prepared lists setup, copy, check, reuse, hash — every line done, in that order, labels from the one table', async () => {
  const s = start(makeRepo(), setup());
  assert.ok(await until(() => settled(s)));
  assert.equal(s.state.phase, 'prepared', String(s.state.error));
  assert.deepEqual(s.state.steps.map((x) => x.id), ['setup', 'copy', 'check', 'reuse', 'hash']);
  assert.equal(s.state.steps.at(-1).detail, `spec hash ${s.state.specHash}`, 'generating hash carries the full hash as its detail');
  assert.ok(s.state.steps.every((x) => x.status === 'done'));
  assert.ok(s.state.steps.every((x) => x.label === STEP_LABELS[x.id]));
  assert.equal(s.state.messages.filter((m) => m.role === 'system').length, 0, 'no pipeline line goes into the thread');
});

test('the secret front door refusing a repo is ONE failed "checking source" line after a done "copying source", the reason once', async () => {
  const fake = `const k = "${'sk-'}${'a'.repeat(40)}";\n`;
  const s = start(makeRepo({ 'test/a.test.js': fake, 'test/b.test.js': fake }), setup());
  assert.ok(await until(() => settled(s)));
  assert.equal(s.state.phase, 'refused');
  assert.deepEqual(s.state.steps.map((x) => [x.id, x.status]), [['setup', 'done'], ['copy', 'done'], ['check', 'failed']]);
  const failed = s.state.steps.at(-1);
  assert.equal(failed.detail, s.state.error);
  assert.match(failed.detail, /2 file\(s\) carry a known secret shape/);
  assert.equal(s.state.steps.filter((x) => x.detail.includes('secret shape')).length, 1);
  assert.equal(s.state.messages.length, 0);
});

test('a source that cannot be reached fails "copying source"; a bad key fails "checking setup" before anything is copied', async () => {
  const ctx = setup();
  const missing = start(join(tmpdir(), 'steps-no-such-dir-xyz'), ctx);
  assert.ok(await until(() => settled(missing)));
  assert.deepEqual(missing.state.steps.map((x) => [x.id, x.status]), [['setup', 'done'], ['copy', 'failed']]);
  const bad = start(makeRepo(), ctx, 'bad\tkey');
  assert.ok(await until(() => settled(bad)));
  assert.deepEqual(bad.state.steps.map((x) => [x.id, x.status]), [['setup', 'failed']]);
  assert.match(bad.state.steps[0].detail, /tab/);
});

test('a signed reuse ends the list with "signed hash" DONE (never running/untouched) and it stays done once the session settles (hamr 2026-10-05: no check seen)', async () => {
  const s = start(makeRepo(), setup());
  assert.ok(await until(() => settled(s)));
  const r = signRun(s, s.state.specHash, { env: {}, spawnFn: () => ({ unref() {} }), bareloopBin: '/x/bin/bareloop.mjs', home: tmp('steps-signhome-') });
  assert.equal(r.ok, true);
  const check = () => {
    assert.equal(s.state.phase, 'signed');
    assert.deepEqual(s.state.steps.at(-1), { id: 'signed', label: 'signed hash', status: 'done', detail: '' });
    assert.ok(s.state.steps.every((x) => x.status === 'done'), 'every line, the last included, ends as a check');
    assert.equal(s.state.pendingAsk, null);
  };
  check();
  await new Promise((r2) => { setTimeout(r2, 300); });
  check();
});
