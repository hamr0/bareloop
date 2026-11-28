// P6 item 3: the npm ci runner — argv, env strip, timeout/ENOENT/non-zero mapping. The spawn is an injected seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNpmCi, npmEnv, nativePackagesOf, NPM_CI_TIMEOUT_MS } from '../src/npminstall.js';

const fakeRun = (/** @type {any} */ result, /** @type {any[]} */ seen = []) => async (/** @type {any} */ cmd, /** @type {any} */ args, /** @type {any} */ o) => { seen.push({ cmd, args, o }); return result; };

test('runNpmCi: argv array `npm ci --ignore-scripts` in cwd, bounded, credentials stripped from the child env', async () => {
  const seen = [];
  const env = { PATH: '/usr/bin', HOME: '/h', ANTHROPIC_API_KEY: 'k', DEEPSEEK_API_KEY: 'k2', AWS_SECRET_ACCESS_KEY: 'k3', NPM_TOKEN: 't' };
  const r = await runNpmCi('/some/dir', { env, run: fakeRun({ error: null, status: 0, signal: null, stdout: '', stderr: '' }, seen) });
  assert.deepEqual(r, { ok: true });
  assert.equal(seen[0].cmd, 'npm');
  assert.deepEqual(seen[0].args, ['ci', '--ignore-scripts']);
  assert.equal(seen[0].o.cwd, '/some/dir');
  assert.equal(seen[0].o.timeoutMs, NPM_CI_TIMEOUT_MS);
  assert.deepEqual(Object.keys(seen[0].o.env).sort(), ['HOME', 'PATH']);
  assert.equal(env.ANTHROPIC_API_KEY, 'k', 'the panel\'s own env is a copy, never mutated');
});

test('runNpmCi: non-zero exit -> last stderr line (redacted); ENOENT -> npm not found; ETIMEDOUT -> timed out', async () => {
  const bad = await runNpmCi('/d', { run: fakeRun({ error: null, status: 1, signal: null, stdout: '', stderr: 'npm warn x\nnpm error boom sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789\n' }) });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /npm error boom/);
  assert.ok(!/abcdefghijklmnopqrstuvwxyz0123456789/.test(bad.reason));
  const nf = await runNpmCi(tmpdir(), { run: fakeRun({ error: Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' }), status: null, signal: null, stdout: '', stderr: '' }) });
  assert.deepEqual(nf, { ok: false, reason: 'npm was not found' });
  const to = await runNpmCi('/d', { timeoutMs: 5000, run: fakeRun({ error: Object.assign(new Error('t'), { code: 'ETIMEDOUT' }), status: null, signal: 'SIGTERM', stdout: '', stderr: '' }) });
  assert.deepEqual(to, { ok: false, reason: 'timed out after 5s' });
});

test('runNpmCi: ENOENT in a folder that does not exist says so, not "npm not found"', async () => {
  const r = await runNpmCi('/no/such/folder', { run: fakeRun({ error: Object.assign(new Error('x'), { code: 'ENOENT' }), status: null, signal: null, stdout: '', stderr: '' }) });
  assert.deepEqual(r, { ok: false, reason: 'the install folder does not exist' });
});

test('npmEnv keeps connection config, drops credentials by name, prefix and shape', () => {
  const e = npmEnv({ PATH: 'p', HTTPS_PROXY: 'x', FOO_API_KEY: '1', AWS_X: '2', MY_TOKEN: '3', PGHOST: 'h' });
  assert.deepEqual(Object.keys(e).sort(), ['HTTPS_PROXY', 'PATH', 'PGHOST']);
});

// The build step: `--ignore-scripts` leaves native packages (better-sqlite3) unbuilt; `npm rebuild` follows a good `npm ci`.
const ok = { error: null, status: 0, signal: null, stdout: '', stderr: '' };
/** @param {any[]} results @param {any[]} seen */
const seqRun = (results, seen) => async (/** @type {any} */ cmd, /** @type {any} */ args, /** @type {any} */ o) => { seen.push({ cmd, args, o }); return results[seen.length - 1] ?? ok; };

/** a tree with node_modules: a binding.gyp package, a gypfile:true scoped one, a nested one, a pure-JS one with install scripts; root scripts too */
const nativeTree = () => {
  const root = mkdtempSync(join(tmpdir(), 'npmnative-'));
  const pkg = (/** @type {string} */ rel, /** @type {any} */ json, /** @type {string[]} */ files = []) => {
    const d = join(root, 'node_modules', rel); mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'package.json'), JSON.stringify(json));
    for (const f of files) writeFileSync(join(d, f), '');
  };
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root', scripts: { postinstall: 'echo root' } }));
  pkg('gypone', { name: 'gypone' }, ['binding.gyp']);
  pkg('@sc/flagged', { name: '@sc/flagged', gypfile: true });
  pkg('purejs', { name: 'purejs', scripts: { install: 'echo dep', postinstall: 'echo dep' } });
  pkg('purejs/node_modules/nested', { name: 'nested' }, ['binding.gyp']);
  pkg('falseflag', { name: 'falseflag', gypfile: false });
  return root;
};

test('nativePackagesOf: only packages with a binding.gyp or "gypfile": true, scoped and nested too, sorted; none = []', () => {
  assert.deepEqual(nativePackagesOf(nativeTree()), ['@sc/flagged', 'gypone', 'nested']);
  assert.deepEqual(nativePackagesOf(mkdtempSync(join(tmpdir(), 'npmnone-'))), []);
  assert.deepEqual(nativePackagesOf('/no/such/folder'), []);
});

test('runNpmCi: `npm rebuild` names ONLY the native packages (never the repo\'s own or pure-JS packages\' scripts)', async () => {
  const root = nativeTree();
  const seen = [];
  const r = await runNpmCi(root, { run: seqRun([ok, ok], seen) });
  assert.deepEqual(r, { ok: true });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].args, ['rebuild', '@sc/flagged', 'gypone', 'nested']);
});

test('runNpmCi: no native package = no rebuild call at all, ok:true', async () => {
  const root = mkdtempSync(join(tmpdir(), 'npmnone-'));
  mkdirSync(join(root, 'node_modules', 'purejs'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'purejs', 'package.json'), JSON.stringify({ name: 'purejs' }));
  const seen = [];
  assert.deepEqual(await runNpmCi(root, { run: seqRun([ok, ok], seen) }), { ok: true });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].args, ['ci', '--ignore-scripts']);
});

test('runNpmCi: after a good install `npm rebuild` runs in the same tree with the same stripped env and deadline', async () => {
  const seen = [];
  const env = { PATH: '/usr/bin', HOME: '/h', NPM_TOKEN: 't', ANTHROPIC_API_KEY: 'k' };
  const root = nativeTree();
  const r = await runNpmCi(root, { env, timeoutMs: 7000, run: seqRun([ok, ok], seen) });
  assert.deepEqual(r, { ok: true });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].args.slice(0, 1), ['rebuild']);
  assert.equal(seen[1].cmd, 'npm');
  assert.equal(seen[1].o.cwd, root);
  assert.equal(seen[1].o.timeoutMs, 7000);
  assert.equal(seen[1].o.env.NPM_TOKEN, undefined);
  assert.deepEqual(seen[1].o.env, seen[0].o.env);
});

test('runNpmCi: a failing rebuild is ok:false in plain words with npm\'s last error line, secret-masked', async () => {
  const seen = [];
  const bad = { error: null, status: 1, signal: null, stdout: '', stderr: 'gyp info\nnpm error build failed sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789\n' };
  const r = await runNpmCi(nativeTree(), { run: seqRun([ok, bad], seen) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /the build step \(npm rebuild\) of the packages failed: npm error build failed/);
  assert.ok(!/abcdefghijklmnopqrstuvwxyz0123456789/.test(r.reason));
});

test('runNpmCi: a timed-out rebuild (killed by the spawn deadline) is ok:false and says the build step timed out', async () => {
  const seen = [];
  const to = { error: Object.assign(new Error('t'), { code: 'ETIMEDOUT' }), status: null, signal: 'SIGTERM', stdout: '', stderr: '' };
  const r = await runNpmCi(nativeTree(), { timeoutMs: 5000, run: seqRun([ok, to], seen) });
  assert.deepEqual(r, { ok: false, reason: 'the build step (npm rebuild) of the packages timed out after 5s' });
  assert.equal(seen[1].o.timeoutMs, 5000);
});

test('runNpmCi: a failed `npm ci` never runs the rebuild', async () => {
  const seen = [];
  const r = await runNpmCi('/d', { run: seqRun([{ error: null, status: 1, signal: null, stdout: '', stderr: 'npm error nope' }], seen) });
  assert.equal(r.ok, false);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].args, ['ci', '--ignore-scripts']);
});
