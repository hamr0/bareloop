// scripts/hermetic.mjs: a mistyped test path must fail loudly, never be skipped while the rest runs green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/hermetic.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (args) => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // the script refuses to run nested inside node --test
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env, encoding: 'utf8' });
};

test('hermetic: a path that does not exist exits non-zero with a plain message and runs nothing', () => {
  const r = run(['tests/nonexistent-typo.test.js', 'tests/hermetic-args.test.js']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no such test path: tests\/nonexistent-typo\.test\.js/);
  assert.doesNotMatch(r.stdout, /# pass/, 'nothing ran');
});

test('hermetic: real paths still run, and a --flag value that is not a path is not mistaken for one', () => {
  const r = run(['--test-name-pattern', 'zzz-no-match', 'tests/panel-ended.test.js']);
  assert.equal(r.status, 0, r.stderr);
});
