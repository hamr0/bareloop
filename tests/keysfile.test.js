// PANEL-BUILD.md P4a item 1 — the keys file loader (src/keysfile.js) and its wiring
// into the run-u door. Every test injects a scratch `home` (never the real
// ~/.config/bareloop). No provider is ever constructed: the wiring test uses a key
// whose VALUE is malformed, so the run refuses at the key gate ($0, exit 2) — and the
// refusal text proves the file's value reached the gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keysFilePath, keysHome, parseKeysText, loadKeysEnv, keysForDoor } from '../src/keysfile.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun } from '../src/userrun.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'keysfile-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
/** @param {string} home @param {string} text @param {number} [mode] */
const writeKeys = (home, text, mode = 0o600) => {
  writeFileSync(keysFilePath(home), text);
  chmodSync(keysFilePath(home), mode);
};

test('parseKeysText: NAME=value, comments, blanks, export prefix, matching quotes; bad lines skipped', () => {
  const got = parseKeysText([
    '# a comment', '', 'A_KEY=aaa', 'export B_KEY=bbb', 'C_KEY="ccc"', "D_KEY='ddd'", 'E_KEY = eee ',
    'not a pair', '9BAD=x', 'F_KEY=', 'G_KEY=with#hash',
  ].join('\n'));
  assert.deepEqual(got, { A_KEY: 'aaa', B_KEY: 'bbb', C_KEY: 'ccc', D_KEY: 'ddd', E_KEY: 'eee', F_KEY: '', G_KEY: 'with#hash' });
});

test('keysHome / keysFilePath: injected home wins; default is under ~/.config/bareloop', () => {
  assert.equal(keysFilePath('/x/y'), '/x/y/.env');
  assert.match(keysHome(), /\.config[\\/]bareloop$/);
});

test('loadKeysEnv: no file = env unchanged, no names, no warning', (t) => {
  const home = tmp(t);
  const r = loadKeysEnv({ env: { X: '1' }, home });
  assert.deepEqual(r, { exists: false, names: [], warning: null, env: { X: '1' } });
});

test('loadKeysEnv: the file FILLS names the shell does not set; the SHELL WINS on a clash; empty shell value counts as unset', (t) => {
  const home = tmp(t);
  writeKeys(home, 'FROM_FILE=file-val\nCLASH=file-clash\nEMPTY_IN_SHELL=file-fills\n');
  const shell = { CLASH: 'shell-clash', EMPTY_IN_SHELL: '', ONLY_SHELL: 's' };
  const r = loadKeysEnv({ env: shell, home });
  assert.equal(r.env.FROM_FILE, 'file-val');
  assert.equal(r.env.CLASH, 'shell-clash');
  assert.equal(r.env.EMPTY_IN_SHELL, 'file-fills');
  assert.equal(r.env.ONLY_SHELL, 's');
  assert.deepEqual(r.names, ['CLASH', 'EMPTY_IN_SHELL', 'FROM_FILE']);
  assert.equal(shell.CLASH, 'shell-clash', 'the input env is never mutated');
  assert.equal('FROM_FILE' in shell, false);
});

test('loadKeysEnv: mode 600 = no warning; group/other readable = a warning that names the fix, not the value', (t) => {
  const home = tmp(t);
  writeKeys(home, 'SECRET_ONE=super-secret-value-123\n', 0o600);
  assert.equal(loadKeysEnv({ env: {}, home }).warning, null);
  writeKeys(home, 'SECRET_ONE=super-secret-value-123\n', 0o644);
  const r = loadKeysEnv({ env: {}, home });
  assert.match(r.warning ?? '', /readable by other users \(mode 644\).*chmod 600/);
  assert.equal(r.env.SECRET_ONE, 'super-secret-value-123', 'a bad mode is a warning, never a refusal');
});

test('loadKeysEnv: the VALUE never appears in names or the warning', (t) => {
  const home = tmp(t);
  writeKeys(home, 'SECRET_ONE=super-secret-value-123\nnot a pair super-secret-value-123\n', 0o644);
  const r = loadKeysEnv({ env: {}, home });
  const nonEnv = JSON.stringify({ names: r.names, warning: r.warning, exists: r.exists });
  assert.equal(nonEnv.includes('super-secret-value-123'), false);
});

test('keysForDoor: an injected env alone never reads the file; env + keysHome (or no env) does', (t) => {
  const home = tmp(t);
  writeKeys(home, 'K1=v1\n');
  assert.deepEqual(keysForDoor({ env: { A: 'a' } }).env, { A: 'a' });
  assert.equal(keysForDoor({ env: { A: 'a' }, keysHome: home }).env.K1, 'v1');
  assert.equal(keysForDoor({ env: { A: 'a' }, keysHome: home }).env.A, 'a');
});

// --- wiring into the run-u door ---------------------------------------------------------
const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const CLOSE_SOURCE = "console.log('FIXTURE judged=1');\nprocess.exit(1);\n";

/** @param {import('node:test').TestContext} t @param {Record<string,string|undefined>} env @param {string|undefined} keysHomeDir */
async function runU(t, env, keysHomeDir) {
  const workdir = tmp(t);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'keys-test@example.com']);
  git(workdir, ['config', 'user.name', 'keys-test']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const scripts = tmp(t);
  const closePath = join(scripts, 'close.mjs');
  writeFileSync(closePath, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'keysfile-wiring-fixture', description: 'P4a item 1 wiring fixture.',
    provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  /** @type {string[]} */ const errs = [];
  const code = await startRun(spec, {
    workdir, seed, spineName: 'keysfile-wiring-fixture-bareloop', approve: jobSpecHash(spec),
    deps: { env, keysHome: keysHomeDir, out: () => {}, err: (s) => errs.push(s), runlistHome: tmp(t) },
  });
  return { code, errs: errs.join('\n') };
}

test('run-u door: with no key anywhere the run stops "not set"; with the value in the keys file it reaches the key check (a malformed file value is refused by shape, $0)', async (t) => {
  const home = tmp(t);
  const none = await runU(t, {}, home);
  assert.equal(none.code, 2);
  assert.match(none.errs, /ANTHROPIC_API_KEY not set/);
  writeKeys(home, 'ANTHROPIC_API_KEY=tab\there-bad\n');
  const filled = await runU(t, {}, home);
  assert.equal(filled.code, 2);
  assert.match(filled.errs, /ANTHROPIC_API_KEY contains a tab character/);
  assert.equal(filled.errs.includes('tab\there-bad'), false, 'the value is never echoed');
});

test('cli door: a group-readable keys file prints a WARNING line on a key-using command (and never the value)', async (t) => {
  const { main } = await import('../src/cli.js');
  const home = tmp(t);
  writeKeys(home, 'ANTHROPIC_API_KEY=warn-secret-value\n', 0o644);
  /** @type {string[]} */ const errs = [];
  const sink = (/** @type {string[]} */ into) => ({ write: (/** @type {string} */ s) => { into.push(s); return true; } });
  const code = await main(['run-u'], { env: {}, keysHome: home, stdout: sink([]), stderr: sink(errs), cwd: home });
  assert.equal(code, 2);
  const all = errs.join('');
  assert.match(all, /WARNING: .*readable by other users \(mode 644\).*chmod 600/);
  assert.equal(all.includes('warn-secret-value'), false);
});
