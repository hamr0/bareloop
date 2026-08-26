// PR #23 review item 7 (2026-08-26): `scripts/prompt-commit-check.mjs --range
// origin/main..HEAD` (package.json's `test` script) resolves to ZERO commits
// the instant a change pushes DIRECT to main — this repo's own norm (see
// .claude/remember/MEMORY.md's "Push direct to main") — because a push
// updates the local `origin/main` remote-tracking ref to match `HEAD`
// immediately. `tests/promptcommit.test.js` deliberately stays pure (no tmp
// git repo, no shelling to git — see its own header); THIS file is the CLI/
// git-dependent counterpart, needed because the fallback this review adds
// can only be exercised against a REAL git ref graph (HEAD, origin/main,
// HEAD~1), not the pure `promptcommitlib.mjs` decision path.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../scripts/prompt-commit-check.mjs', import.meta.url).pathname;

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'bareloop-test', GIT_AUTHOR_EMAIL: 'test@bareloop',
  GIT_COMMITTER_NAME: 'bareloop-test', GIT_COMMITTER_EMAIL: 'test@bareloop',
};

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

/**
 * A bare "origin" remote plus a working clone, both real git repos — the
 * fallback this test proves depends on real ref resolution (`git rev-parse
 * HEAD`/`origin/main`), which no hand-built fixture can stand in for.
 * @returns {string} the working clone's path
 */
function makeRepoWithOrigin() {
  const root = mkdtempSync(join(tmpdir(), 'prompt-commit-cli-'));
  tmpDirs.push(root);
  const bare = join(root, 'origin.git');
  const clone = join(root, 'clone');
  const git = (/** @type {string[]} */ args, /** @type {string} */ cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });

  git(['init', '-q', '--bare', '-b', 'main', bare], root);
  git(['clone', '-q', bare, clone], root);
  writeFileSync(join(clone, '.gitkeep'), '');
  git(['add', '-A'], clone);
  git(['commit', '-q', '-m', 'seed'], clone);
  git(['push', '-q', 'origin', 'main'], clone);
  return clone;
}

test('--range origin/main..HEAD falls back to HEAD~1..HEAD after a direct push to main, and PRINTS that it did', () => {
  const clone = makeRepoWithOrigin();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', env: GIT_ENV });

  // a direct push touching a real prompt-register path, with a NON-compliant
  // message — this is the commit the fallback must actually find and flag.
  mkdirSync(join(clone, 'src'), { recursive: true });
  writeFileSync(join(clone, 'src', 'authorscout.js'), 'x');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'touch a prompt file, no labels']);
  git(['push', '-q', 'origin', 'main']); // origin/main now == HEAD, same as any direct push

  const headSha = git(['rev-parse', 'HEAD']).trim();
  const originMainSha = git(['rev-parse', 'origin/main']).trim();
  assert.equal(headSha, originMainSha, 'precondition: origin/main == HEAD, the exact condition a direct push leaves behind');

  let out = '';
  let status = 0;
  try {
    out = execFileSync('node', [SCRIPT, '--range', 'origin/main..HEAD'], { cwd: clone, encoding: 'utf8' });
  } catch (err) {
    const e = /** @type {{stdout?: string, stderr?: string, status?: number}} */ (err);
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    status = e.status ?? 1;
  }

  assert.match(out, /range origin\/main\.\.HEAD is empty at main — checked HEAD~1\.\.HEAD instead/, 'the fallback prints that it substituted a range, never silently');
  assert.match(out, /commits 2\.\.N of a multi-commit direct push are NOT covered/, 'the partial-coverage limitation is stated, not hidden');
  assert.notEqual(status, 0, 'the fallback actually inspected the pushed commit and found its non-compliant message');
});

test('the ordinary branch/PR path (origin/main behind HEAD by a real commit) is untouched — no fallback fires when the range is genuinely non-empty', () => {
  const clone = makeRepoWithOrigin();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', env: GIT_ENV });

  // a LOCAL commit, never pushed: origin/main stays at the seed commit, HEAD
  // moves ahead of it — the range is genuinely non-empty (1 commit), the
  // normal case the rule was built for, and the new fallback must never fire
  // on it (it only ever triggers on a ZERO-commit range).
  mkdirSync(join(clone, 'src'), { recursive: true });
  writeFileSync(join(clone, 'src', 'authorscout.js'), 'x');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'Failure: run mszcthk1 — x\nAddresses: y\nCorrects: z']);

  const out = execFileSync('node', [SCRIPT, '--range', 'origin/main..HEAD'], { cwd: clone, encoding: 'utf8' });
  assert.match(out, /OK — 1 commit\(s\) checked/, 'the one real unpushed commit is the one actually inspected');
  assert.doesNotMatch(out, /checked HEAD~1\.\.HEAD instead/, 'the fallback must not fire when the range already has content');
});
