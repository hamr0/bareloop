// P6 item 2 — a secret already in the person's OWN repo is MASKED wherever bareloop records it, not a refusal (hamr
// 2026-10-05 Q2=A). REAL git, REAL source door (worktree mode), REAL engine (`run-u --spec`, in-process), scripted
// provider. The fixture key is obviously fake, built at runtime from the shared inventory's `sk-` shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { prepareSource } from '../src/source.js';
import { redactSecrets } from '../src/validate.js';
import { main } from '../src/userrun.js';
import { scriptedProvider } from './helpers.js';

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const ID = ['-c', 'user.name=p6-test', '-c', 'user.email=p6@test', '-c', 'commit.gpgsign=false'];
const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', [...ID, '-C', cwd, ...args], { encoding: 'utf8' }).trim();

// obviously fake; matches the `sk-[A-Za-z0-9_-]{16,}` shape of the one inventory
const FAKE = `sk-${'FAKEFIXTUREKEY0'.repeat(3)}`;

function initRepo(/** @type {string} */ dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  writeFileSync(join(dir, 'src', 'client.mjs'), `export const KEY = '${FAKE}';\n`);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'seed']);
}

/** every file under dir, recursively @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('fixture sanity: the fake key is a real hit of the shared redactor', () => {
  assert.notEqual(redactSecrets(FAKE), FAKE);
});

test('prepareSource: worktree mode does NOT refuse a repo carrying a secret-shaped key; the non-worktree copy still does', async (t) => {
  const repo = tmp(t, 'p6s-repo-');
  initRepo(repo);
  const wt = await prepareSource({ source: repo, into: join(tmp(t, 'p6s-a-'), 'seed'), destination: 'src/', worktree: join(repo, '.bareloop', 'wt', 's') });
  assert.equal(wt.stop, null, JSON.stringify(wt));
  assert.ok(wt.manifest.files.some((/** @type {{path: string}} */ f) => f.path === 'src/client.mjs'));
  assert.doesNotMatch(readFileSync(wt.manifestPath, 'utf8'), new RegExp(FAKE), 'the manifest records paths and hashes, never content');
  const copy = await prepareSource({ source: repo, into: join(tmp(t, 'p6s-b-'), 'seed'), destination: 'src/' });
  assert.equal(copy.code, 'source-carries-secret', 'the copy door is unchanged');
});

test('prepareSource: worktree mode still refuses a repo tracking a .env by NAME', async (t) => {
  const repo = tmp(t, 'p6s-env-');
  initRepo(repo);
  writeFileSync(join(repo, '.env'), 'A=1\n');
  git(repo, ['add', '.env']);
  git(repo, ['commit', '-q', '-m', 'env']);
  const r = await prepareSource({ source: repo, into: join(tmp(t, 'p6s-c-'), 'seed'), destination: 'src/', worktree: join(repo, '.bareloop', 'wt', 's') });
  assert.equal(r.code, 'source-env-file');
});

test('run-u --spec on a worktree whose worker READS a file holding a secret: the raw key is in none of the session books or the run list', async (t) => {
  const repo = tmp(t, 'p6s-run-repo-');
  initRepo(repo);
  const dir = tmp(t, 'p6s-session-');
  const closeSource = `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ok = readFileSync(join(process.cwd(), 'src', 'mod.mjs'), 'utf8').includes('MARKER_OK');
console.log('FIXTURE judged=1');
process.exit(ok ? 0 : 1);
`;
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, closeSource);
  const spec = {
    schema: 'job-v1', job: 'p6-secret-job', description: 'P6 item 2 fixture.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['src/**'],
    goal: 'Append the line MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closeScript} has-marker`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  const worktree = join(repo, '.bareloop', 'wt', 'sess1');
  const prep = await prepareSource({ source: repo, into, destination: 'src/', worktree });
  assert.equal(prep.stop, null, JSON.stringify(prep));

  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'append-marker', action: 'Append the line MARKER_OK to src/mod.mjs', tools: ['read', 'recall', 'get', 'write'], rounds: 6, target: 'src/mod.mjs',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'has-marker' }],
  }] });
  const provider = scriptedProvider([
    { text: 'scout: src/mod.mjs has no MARKER_OK yet' },
    { text: plan },
    { toolCalls: [{ id: 't0', name: 'shell_read', arguments: { path: join(worktree, 'src', 'client.mjs') } }] },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(worktree, 'src', 'mod.mjs'), content: 'export const x = 1;\nMARKER_OK\n' } }] },
    { text: `wrote the marker; the client file holds ${FAKE}` },
  ]);
  const home = tmp(t, 'p6s-home-');
  /** @type {string[]} */ const out = []; /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], {
    provider, env: {}, out: (s) => out.push(s), err: (s) => err.push(s), runlistHome: home,
  });
  assert.equal(rc, 0, `${out.join('\n')}\n${err.join('\n')}`);
  // the worker really saw the raw key (else this proves nothing)
  assert.ok(provider.messagesLog.some((m) => JSON.stringify(m).includes(FAKE)), 'the fixture must actually put the key in front of the worker');
  const files = [...walk(dir), ...walk(home)];
  assert.ok(files.some((f) => /\.jsonl$/.test(f)), 'a spine exists to search');
  assert.ok(files.some((f) => f.startsWith(home)), 'a run-list row exists to search');
  const leaks = files.filter((f) => readFileSync(f, 'utf8').includes(FAKE));
  assert.deepEqual(leaks, [], `raw secret leaked into: ${leaks.join(', ')}`);
  assert.doesNotMatch(`${out.join('\n')}\n${err.join('\n')}`, new RegExp(FAKE), 'nor the CLI readout');
});
