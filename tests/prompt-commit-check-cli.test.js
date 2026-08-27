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
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
  assert.match(out, /on a linear multi-commit\s+direct push only the last commit/, 'the partial-coverage limitation is stated, not hidden');
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

// Release-gate finding 1 (2026-08-27, security/low): `git(['rev-list',
// range])` passed the `--range` argv value to `git rev-list` positionally,
// with no `--` separator. A value starting with `-` is parsed by git as an
// OPTION of its own, not a revision range — e.g. `--output=<path>` is a real
// `git rev-list` option that writes to a file. Verified against a real repo
// that `git rev-list -- <range>` does NOT fix this: unlike `show`/
// `diff-tree`, rev-list's `--` marks everything after it as a PATH filter,
// not a revision range, so it errors out (exit 129) instead of resolving
// anything. The fix instead rejects any `--range` value starting with `-`
// up front, before any git call runs.
test('--range value that looks like an option is rejected before it ever reaches git, and creates no file', () => {
  const clone = makeRepoWithOrigin();
  const injectedTarget = join(clone, 'pwned-by-range-arg');

  let out = '';
  let status = 0;
  try {
    out = execFileSync('node', [SCRIPT, '--range', `--output=${injectedTarget}`], { cwd: clone, encoding: 'utf8' });
  } catch (err) {
    const e = /** @type {{stdout?: string, stderr?: string, status?: number}} */ (err);
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    status = e.status ?? 1;
  }

  assert.equal(existsSync(injectedTarget), false, 'the option-shaped range must never actually reach `git rev-list` and create the file');
  assert.notEqual(status, 0, 'an option-shaped --range value is refused, not silently accepted');
  assert.match(out, /looks like an option/, 'the refusal is reported with a clear message, not a raw git error');

  // A normal range must still work — the guard only rejects values that
  // start with "-", never a legitimate rev-range. This fixture has only the
  // one seed commit (origin/main == HEAD), so the main-push fallback fires
  // and then finds no HEAD~1 to fall back to — a SKIP, exit 0, same as any
  // other run this script would have made before this fix existed.
  const okOut = execFileSync('node', [SCRIPT, '--range', 'origin/main..HEAD'], { cwd: clone, encoding: 'utf8' });
  assert.match(okOut, /SKIPPED/, 'a normal range is never touched by the option-shaped guard');
});

// Release-gate finding 2 (2026-08-27, WARNING/diff-review): the fallback's
// printed limitation claimed HEAD~1..HEAD "only re-covers the LAST commit"
// of a multi-commit direct push, unconditionally. On a MERGE commit,
// HEAD~1 is the first parent, so HEAD~1..HEAD lists the merge commit PLUS
// every commit unique to the merged-in branch — reproduced against this
// repo's own history (`git rev-list 4904d76~1..4904d76` -> 10 commits, not
// 1). These two tests derive their expected commit counts from the fixture
// they build, never a hardcoded string beyond the message text itself.
test('a merge commit pushed to main: the fallback reports the merge + every commit it brought in', () => {
  const clone = makeRepoWithOrigin();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', env: GIT_ENV });

  git(['checkout', '-q', '-b', 'feature']);
  writeFileSync(join(clone, 'feature-1.txt'), 'a');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'feature commit 1']);
  writeFileSync(join(clone, 'feature-2.txt'), 'b');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'feature commit 2']);
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--no-ff', '-m', 'merge feature into main', 'feature']);
  git(['push', '-q', 'origin', 'main']); // origin/main now == HEAD, same as any direct push

  const expectedCount = git(['rev-list', 'HEAD~1..HEAD']).trim().split('\n').filter(Boolean).length;
  assert.equal(expectedCount, 3, 'precondition: merge commit + its 2 unique feature commits');

  const out = execFileSync('node', [SCRIPT, '--range', 'origin/main..HEAD'], { cwd: clone, encoding: 'utf8' });
  assert.match(out, new RegExp(`OK — ${expectedCount} commit\\(s\\) checked`), 'the fallback inspects the merge and every commit it brought in, not just the merge itself');
  assert.match(out, /on a merge commit this covers the merge and every commit it brought in/, 'the printed limitation is accurate for the merge case');
});

test('a linear 2-commit direct push to main: the fallback reports only the last commit', () => {
  const clone = makeRepoWithOrigin();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', env: GIT_ENV });

  writeFileSync(join(clone, 'linear-1.txt'), 'a');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'linear commit 1']);
  writeFileSync(join(clone, 'linear-2.txt'), 'b');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'linear commit 2']);
  git(['push', '-q', 'origin', 'main']); // origin/main now == HEAD, same as any direct push

  const expectedCount = git(['rev-list', 'HEAD~1..HEAD']).trim().split('\n').filter(Boolean).length;
  assert.equal(expectedCount, 1, 'precondition: a linear push has no merge parent to widen the range');

  const out = execFileSync('node', [SCRIPT, '--range', 'origin/main..HEAD'], { cwd: clone, encoding: 'utf8' });
  assert.match(out, new RegExp(`OK — ${expectedCount} commit\\(s\\) checked`), 'the fallback on a linear push covers only the last commit, as documented');
  assert.match(out, /on a linear multi-commit\s+direct push only the last commit/, 'the printed limitation is accurate for the linear case');
});

// #2b (2026-08-27, hamr's word): CI now supplies PROMPT_COMMIT_RANGE
// (github.event.before..sha, push events only) so a linear multi-commit
// direct push is fully covered, unlike the HEAD~1..HEAD local fallback
// exercised above. These three tests exercise the env var directly, the
// same way the CI step would set it.
test('PROMPT_COMMIT_RANGE covers BOTH commits of a linear 2-commit direct push, unlike the HEAD~1 fallback', () => {
  const clone = makeRepoWithOrigin();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', env: GIT_ENV });

  const seedSha = git(['rev-parse', 'HEAD']).trim();

  mkdirSync(join(clone, 'src'), { recursive: true });
  writeFileSync(join(clone, 'src', 'authorscout.js'), 'x');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'linear commit 1, no labels']);
  writeFileSync(join(clone, 'src', 'authorscout.js'), 'y');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'linear commit 2, no labels']);
  git(['push', '-q', 'origin', 'main']);

  const sha1 = git(['rev-parse', 'HEAD~1']).trim();
  const sha2 = git(['rev-parse', 'HEAD']).trim();

  let out = '';
  try {
    out = execFileSync(
      'node',
      [SCRIPT, '--range', 'origin/main..HEAD'],
      { cwd: clone, encoding: 'utf8', env: { ...process.env, PROMPT_COMMIT_RANGE: `${seedSha}..HEAD` } },
    );
  } catch (err) {
    const e = /** @type {{stdout?: string, stderr?: string}} */ (err);
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }

  assert.match(out, /using PROMPT_COMMIT_RANGE=/, 'the env range in use is printed so CI logs show it');
  assert.match(out, new RegExp(sha1), 'the FIRST of the two linear commits is named — the HEAD~1 fallback would miss it');
  assert.match(out, new RegExp(sha2), 'the SECOND of the two linear commits is also named');
});

test('an unresolvable PROMPT_COMMIT_RANGE (github.event.before all-zeros, new-branch shape) falls back to the --range arg', () => {
  const clone = makeRepoWithOrigin();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', env: GIT_ENV });

  mkdirSync(join(clone, 'src'), { recursive: true });
  writeFileSync(join(clone, 'src', 'authorscout.js'), 'x');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'touch a prompt file, no labels']);
  git(['push', '-q', 'origin', 'main']); // origin/main now == HEAD, triggers the existing main-push fallback

  const zeroSha = '0'.repeat(40);
  let out = '';
  let status = 0;
  try {
    out = execFileSync(
      'node',
      [SCRIPT, '--range', 'origin/main..HEAD'],
      { cwd: clone, encoding: 'utf8', env: { ...process.env, PROMPT_COMMIT_RANGE: `${zeroSha}..HEAD` } },
    );
  } catch (err) {
    const e = /** @type {{stdout?: string, stderr?: string, status?: number}} */ (err);
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    status = e.status ?? 1;
  }

  assert.match(out, /PROMPT_COMMIT_RANGE.*could not be resolved/, 'the unresolvable env range is reported');
  assert.match(out, /falling back to.*--range/, 'it says it is falling back to the --range arg');
  assert.match(out, /checked HEAD~1\.\.HEAD instead/, 'the existing main-push fallback still fires on the --range arg\'s own path');
  assert.notEqual(status, 0, 'the pushed commit was still found and flagged via the --range arg fallback');
});

test('a PROMPT_COMMIT_RANGE value that looks like an option is rejected before it ever reaches git', () => {
  const clone = makeRepoWithOrigin();
  const injectedTarget = join(clone, 'pwned-by-env-range');

  let out = '';
  let status = 0;
  try {
    out = execFileSync(
      'node',
      [SCRIPT, '--range', 'origin/main..HEAD'],
      { cwd: clone, encoding: 'utf8', env: { ...process.env, PROMPT_COMMIT_RANGE: `--output=${injectedTarget}` } },
    );
  } catch (err) {
    const e = /** @type {{stdout?: string, stderr?: string, status?: number}} */ (err);
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    status = e.status ?? 1;
  }

  assert.equal(existsSync(injectedTarget), false, 'the option-shaped env range must never reach `git rev-list` and create the file');
  assert.notEqual(status, 0, 'an option-shaped PROMPT_COMMIT_RANGE value is refused, not silently accepted');
  assert.match(out, /PROMPT_COMMIT_RANGE/, 'the refusal names the env var');
  assert.match(out, /looks like an option/, 'the refusal is reported with a clear message, not a raw git error');
});
