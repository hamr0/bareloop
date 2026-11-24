// Each command runs ONCE per check pass (hamr, 2026-11-21): every stage reading the same command shares its result. A pass is one seed
// read, or one close run; the next pass runs the command again (the tree may have changed), and a command that differs in any way runs on
// its own. The command here counts its own runs in a file, so "once" is read off the world, not off a mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { seedRead } from '../src/kinds.js';
import { runDeclaredStages } from '../src/declaredclose.js';

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-once-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  // prints the number of times it has run, and records each run
  writeFileSync(join(dir, 'counter.mjs'), `import { appendFileSync, readFileSync, existsSync } from 'node:fs';
const f = new URL('./runs.txt', import.meta.url).pathname;
appendFileSync(f, 'run\\n');
console.log('total ' + readFileSync(f, 'utf8').split('\\n').filter(Boolean).length);
process.exit(Number(process.argv[2] ?? 0));
`);
  writeFileSync(join(dir, '.gitignore'), 'runs.txt\n');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'seed');
  const seed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  return { dir, seed, runs: () => { try { return readFileSync(join(dir, 'runs.txt'), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } } };
}
const stage = (name, args = ['0'], extra = {}) => ({ name, kind: 'command-exit', params: { cmd: process.execPath, args: ['counter.mjs', ...args], expectExit: 0, ...extra } });
const ctxOf = (r) => ({ workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: 30_000 });

test('two stages reading the same command: it runs once in a seed read, and both stages get its result', async (t) => {
  const r = repo(t);
  const rows = await seedRead({ stages: [stage('one'), stage('two')] }, ctxOf(r));
  assert.equal(r.runs(), 1);
  assert.deepEqual(rows.map((x) => x.verdict), ['green', 'green']);
});

test('a command that differs in args or env is another command and runs on its own; an authored limit is no difference (F393)', async (t) => {
  const r = repo(t);
  await seedRead({ stages: [stage('one'), stage('args', ['0', 'x']), stage('env', ['0'], { env: { FOO: '1' } }), stage('limit', ['0'], { timeoutMs: 20_000 })] }, ctxOf(r));
  assert.equal(r.runs(), 3, 'one, args, env - the authored limit is ignored, so `limit` shares the first run');
});

test('the next pass runs the command again: nothing is shared across passes (the tree may have changed)', async (t) => {
  const r = repo(t);
  await seedRead({ stages: [stage('one'), stage('two')] }, ctxOf(r));
  await seedRead({ stages: [stage('one'), stage('two')] }, ctxOf(r));
  assert.equal(r.runs(), 2);
});

test('a red result is shared too: two stages on one failing command both red, one run', async (t) => {
  const r = repo(t);
  const rows = await seedRead({ stages: [stage('one', ['1']), stage('two', ['1'])] }, ctxOf(r));
  assert.equal(r.runs(), 1);
  assert.deepEqual(rows.map((x) => x.verdict), ['red', 'red']);
});

test('the run\'s close pass (runDeclaredStages) shares a command between its stages, and each close run is its own pass', async (t) => {
  const r = repo(t);
  const o = { cwd: r.dir, seedRef: r.seed, timeoutMs: 30_000 };
  await runDeclaredStages([stage('one'), stage('two')], (s) => s, o);
  assert.equal(r.runs(), 1);
  await runDeclaredStages([stage('one'), stage('two')], (s) => s, o);
  assert.equal(r.runs(), 2, 'a second close run reads the tree again');
});
