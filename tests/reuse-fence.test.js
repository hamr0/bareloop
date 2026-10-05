// Reuse workflow, live defects 2026-10-04 (hamr's real panel): Destination on a reused REPO job is the write fence
// (writeScope globs), never an absolute output directory. REAL bundle fixture (a `src/**` fence), REAL git repos,
// the real session engine; scratch homes only; no model is ever reached.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getStartFromImport } from '../src/panel/server.js';
import { importsPath, importId } from '../src/panel/importroutes.js';
import { createSession, buildReuseSpec } from '../src/panel/authorsession.js';
import { exportFixtureBundle } from './bundle-fixture.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
/** @type {string[]} */ const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
function makeRepo() {
  const dir = tmp('fence-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
function setup() {
  const home = tmp('fence-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const bundleDir = join(tmp('fence-user-'), 'fix.bareloop');
  const b = exportFixtureBundle(bundleDir);
  mkdirSync(join(bundleDir, 'node_modules'));
  symlinkSync(REPO_ROOT, join(bundleDir, 'node_modules', 'bareloop'));
  appendFileSync(importsPath(home), `${JSON.stringify({ at: '2026-10-03T10:00:00.000Z', dir: bundleDir, job: 'fixture-export-job', bundleHash: b.bundleHash })}\n`);
  return { home, id: importId(bundleDir) };
}
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => { setTimeout(r, 10); }); } return false; }
function start(source, home, pre, key = 'fake-not-a-real-key') {
  const card = { ...pre.card, source, destination: 'src/**', capUsd: 1 };
  return createSession(card, {
    env: { ANTHROPIC_API_KEY: key }, home, sessionsRoot: tmp('fence-sess-'),
    reuse: { spec: buildReuseSpec(pre.spec, card), workflowKey: pre.workflowKey },
    generate: async () => { throw new Error('no model'); }, confirmGenerate: async () => { throw new Error('no model'); },
    prepareSigningFn: async () => { throw new Error('command close'); },
  });
}
const settled = (s) => ['prepared', 'refused', 'error'].includes(s.state.phase);

test('a reused repo job takes its Destination as the write fence: a real repo source + src/** reaches prepared with writeScope [src/**]', async () => {
  const { home, id } = setup();
  const pre = getStartFromImport(id, { home });
  assert.equal(pre.card.destination, 'src/**');
  const s = start(makeRepo(), home, pre);
  assert.ok(await until(() => settled(s)));
  assert.equal(s.state.phase, 'prepared', String(s.state.error));
});

test('a source the door cannot take as a repo (a linked worktree, a missing path) is refused for ITS reason — never as "src/** is not absolute"', async () => {
  const { home, id } = setup();
  const pre = getStartFromImport(id, { home });
  const main = makeRepo();
  const wt = join(tmp('fence-wt-'), 'wt');
  git(main, ['worktree', 'add', '-q', wt, '-b', 'side']);
  for (const [source, why] of [[wt, /linked worktree|worktree/i], [join(tmpdir(), 'fence-no-such-dir-xyz'), /unreadable|exist|read/i]]) {
    const s = start(source, home, pre);
    assert.ok(await until(() => settled(s)));
    assert.equal(s.state.phase, 'refused');
    assert.doesNotMatch(s.state.error, /not absolute/, s.state.error);
    assert.match(s.state.error, why, s.state.error);
  }
});

test('a FOLDER source keeps the absolute-directory proof: a relative Destination is still refused by proveDestination', async () => {
  const { home, id } = setup();
  const pre = getStartFromImport(id, { home });
  const folder = tmp('fence-folder-'); writeFileSync(join(folder, 'a.txt'), 'x\n');
  const { prepareSource } = await import('../src/source.js');
  const r = await prepareSource({ source: folder, into: join(tmp('fence-into-'), 'x'), destination: 'src/**' });
  assert.match(r.stop, /not absolute/);
  void pre;
});

test('a refusal appears exactly once: state.error is set, no chat bubble repeats it, and the page does not echo it into #chat-card-error', async () => {
  const { readFileSync } = await import('node:fs');
  const { home, id } = setup();
  const pre = getStartFromImport(id, { home });
  const s = start(makeRepo(), home, pre, 'bad\tkey'); // malformed key: refuses at $0
  assert.ok(await until(() => settled(s)));
  assert.equal(s.state.phase, 'refused');
  const copies = s.state.messages.filter((m) => m.text.includes(s.state.error));
  assert.equal(copies.length, 0, 'the refusal lives on state.error only; the thread carries chat turns');
  const html = readFileSync(join(REPO_ROOT, 'src', 'panel', 'index.html'), 'utf8');
  const fn = html.slice(html.indexOf('function renderActions(state){'), html.indexOf('function poll(){'));
  assert.doesNotMatch(fn, /errEl\.textContent = state\.error/, 'renderActions must not write the session error into #chat-card-error');
});
