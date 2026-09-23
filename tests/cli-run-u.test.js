// PANEL-BUILD.md P0 task 2/4 — `bareloop run-u`, wired over `src/cli.js`'s
// `main(argv, deps)` the same way `bareloop run`/`export`/`history` already
// are. `src/cli.js`'s `run-u` dispatch hands its argv straight to
// `src/userrun.js`'s own `main(argv, deps)` UNPARSED — that function is the
// one owner of this flag grammar (`scripts/run-u.mjs` calls the exact same
// function directly), so this suite exercises the dispatch seam itself: does
// `bareloop run-u <flags>` reach `src/userrun.js:main` with the right argv
// and the right `out`/`err`/`env`, never a real run.
//
// Every case here is a $0 die()/preview path (no `--approve`, so nothing
// ever reads a key or spends) — no scripted provider is even needed, the
// same instrument `tests/run-u-key-hint.test.js` uses (there via a real
// subprocess spawn; here in-process through `main`, the seam PANEL-BUILD.md
// names for this task).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.js';
import { main as userUMain } from '../src/userrun.js';

/** a fresh in-memory stdout/stderr sink */
function sink() {
  /** @type {string[]} */
  const chunks = [];
  return { write: (/** @type {string} */ s) => { chunks.push(s); return true; }, text: () => chunks.join('') };
}

/** blank both provider keys so a real `--job` run stops at the preview
 * (never reads a key, never spends) — the same env shape
 * `tests/run-u-key-hint.test.js` uses against the real script. */
const NO_KEYS = { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' };

// ---------------------------------------------------------------------------
// dispatch: `bareloop run-u` reaches src/userrun.js's own die() paths
// ---------------------------------------------------------------------------

test('bareloop run-u: no --job and no --spec dies with the runner\'s own message, exit 2', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['run-u'], { stdout: out, stderr: err, env: NO_KEYS, cwd: process.cwd() });
  assert.equal(rc, 2);
  assert.match(err.text(), /give one of --job <key> \(one of: .*\) or --spec <path to resolved-spec\.json>/);
});

test('bareloop run-u: --job and --spec together — the SAME misused-flag refusal src/userrun.js prints today', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['run-u', '--job', 'aurora-spawner', '--spec', '/tmp/does-not-matter.json'], {
    stdout: out, stderr: err, env: NO_KEYS, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /--job aurora-spawner and --spec \/tmp\/does-not-matter\.json name a job two different ways/);
});

test('bareloop run-u: an unknown --job value refuses by name, exit 2', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['run-u', '--job', 'not-a-real-job'], { stdout: out, stderr: err, env: NO_KEYS, cwd: process.cwd() });
  assert.equal(rc, 2);
  assert.match(err.text(), /unknown --job "not-a-real-job" — one of: /);
});

test('bareloop run-u: a misused --model value refuses at $0, before any key/provider check', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['run-u', '--job', 'aurora-spawner', '--model', 'bogus-tier'], {
    stdout: out, stderr: err, env: NO_KEYS, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /unknown --model "bogus-tier" — one of: sonnet, haiku/);
});

// ---------------------------------------------------------------------------
// the real preview path, still $0: no key -> print hints, exit 0, no spend
// ---------------------------------------------------------------------------

test('bareloop run-u: a real job with no key prints its preview and exits 0, spending nothing', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['run-u', '--job', 'aurora-spawner'], { stdout: out, stderr: err, env: NO_KEYS, cwd: process.cwd() });
  assert.equal(rc, 0, err.text());
  assert.match(out.text() + err.text(), /ANTHROPIC_API_KEY/, 'the preview names the key this job\'s provider needs');
});

// ---------------------------------------------------------------------------
// no drift: dispatching through src/cli.js must produce BYTE-IDENTICAL
// output to calling src/userrun.js's own main() directly with the same argv
// — proof there is exactly one code path parsing this flag grammar, not two.
// ---------------------------------------------------------------------------

test('bareloop run-u: dispatch through src/cli.js matches src/userrun.js:main called directly, byte for byte', async () => {
  const argv = ['--job', 'aurora-spawner', '--model', 'bogus-tier'];

  const cliOut = sink(); const cliErr = sink();
  const cliRc = await main(['run-u', ...argv], { stdout: cliOut, stderr: cliErr, env: NO_KEYS, cwd: process.cwd() });

  const directOut = []; const directErr = [];
  const directRc = await userUMain(argv, {
    env: NO_KEYS,
    out: (/** @type {string} */ s) => directOut.push(s),
    err: (/** @type {string} */ s) => directErr.push(s),
  });

  assert.equal(cliRc, directRc);
  assert.equal(cliErr.text(), `${directErr.join('\n')}\n`);
  assert.equal(cliOut.text(), `${directOut.join('\n')}${directOut.length ? '\n' : ''}`);
});

// ---------------------------------------------------------------------------
// the top-level command list now names run-u
// ---------------------------------------------------------------------------

test('bareloop: an unknown command\'s refusal now lists run-u alongside export/run/history', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['bogus'], { stdout: out, stderr: err });
  assert.equal(rc, 1);
  assert.match(err.text(), /unknown command "bogus" — one of: export, run, history, run-u/);
});
