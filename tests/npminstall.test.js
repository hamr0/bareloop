// P6 item 3: the npm ci runner — argv, env strip, timeout/ENOENT/non-zero mapping. The spawn is an injected seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { runNpmCi, npmEnv, NPM_CI_TIMEOUT_MS } from '../src/npminstall.js';

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
