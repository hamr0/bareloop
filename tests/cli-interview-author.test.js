// PANEL-BUILD.md P0 tasks 3/4 and 4/4 — `bareloop interview` and `bareloop
// author`, wired over `src/cli.js`'s `main(argv, deps)` the same way
// `bareloop run-u` already is (`tests/cli-run-u.test.js`'s own pattern,
// mirrored here). `src/cli.js`'s dispatch hands argv straight to
// `src/interviewrun.js`/`src/authorrun.js`'s own `main(argv, deps)`
// UNPARSED — those functions are the one owner of each flag grammar
// (`scripts/run-interview.mjs`/`scripts/run-author.mjs` call the exact same
// functions directly), so this suite exercises the DISPATCH seam itself:
// does `bareloop interview <flags>` / `bareloop author <flags>` reach the
// right library `main` with the right argv and the right
// `env`/`stdin`/`stdout`/`stderr`, never a real interview or a real run.
//
// Every case here is a $0 die() path (a missing/malformed flag) — each one
// fires before either module ever creates its `readline` interface, so no
// real stdin is needed; an EMPTY readable stream stands in for it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { main } from '../src/cli.js';
import { main as interviewDirectMain } from '../src/interviewrun.js';
import { main as authorDirectMain } from '../src/authorrun.js';

/** a fresh in-memory stdout/stderr sink */
function sink() {
  /** @type {string[]} */
  const chunks = [];
  return { write: (/** @type {string} */ s) => { chunks.push(s); return true; }, text: () => chunks.join('') };
}

/** an empty stdin — every case below dies before either module reads it. */
const noStdin = () => Readable.from([]);

// ---------------------------------------------------------------------------
// dispatch: `bareloop interview` reaches src/interviewrun.js's own die() paths
// ---------------------------------------------------------------------------

test('bareloop interview: missing required flags dies with the module\'s own usage message, exit 2', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['interview'], {
    stdout: out, stderr: err, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /usage: node scripts\/run-interview\.mjs/);
});

test('bareloop interview: --patient is refused by name — Source replaced it (PRD item 33 M3)', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['interview', '--patient', '/tmp/whatever', '--verdict', 'green', '--provider', 'anthropic-api', '--out', '/tmp/out'], {
    stdout: out, stderr: err, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /--patient is no longer a flag/);
});

test('bareloop interview: an off-menu --verdict value is a typo, refused as one, exit 2', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['interview', '--verdict', 'bogus-class', '--provider', 'anthropic-api', '--out', '/tmp/out'], {
    stdout: out, stderr: err, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /--verdict bogus-class is not a verdict class/);
});

// ---------------------------------------------------------------------------
// dispatch: `bareloop author` reaches src/authorrun.js's own die() paths
// ---------------------------------------------------------------------------

test('bareloop author: missing required flags dies with the module\'s own usage message, exit 2', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['author'], {
    stdout: out, stderr: err, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /usage: node scripts\/run-author\.mjs/);
});

test('bareloop author: --patient is refused by name — --source replaced it (PRD item 33 M3)', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['author', '--patient', '/tmp/whatever', '--answers', '/tmp/a.json', '--draft', '/tmp/d.json', '--verdict', 'green', '--out', '/tmp/out'], {
    stdout: out, stderr: err, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /--patient is no longer a flag — use --source <tree>/);
});

test('bareloop author: an off-menu --verdict value is a typo, refused as one, exit 2', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['author', '--source', '/tmp/nope', '--answers', '/tmp/a.json', '--draft', '/tmp/d.json', '--verdict', 'bogus-class', '--out', '/tmp/out'], {
    stdout: out, stderr: err, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /--verdict bogus-class is not a verdict class/);
});

// ---------------------------------------------------------------------------
// no drift: dispatching through src/cli.js must produce BYTE-IDENTICAL
// output to calling the library module's own main() directly with the same
// argv — proof there is exactly one code path parsing each flag grammar.
// ---------------------------------------------------------------------------

test('bareloop interview: dispatch through src/cli.js matches src/interviewrun.js:main called directly, byte for byte', async () => {
  const argv = ['--verdict', 'bogus-class', '--provider', 'anthropic-api', '--out', '/tmp/out'];

  const cliOut = sink(); const cliErr = sink();
  const cliRc = await main(['interview', ...argv], {
    stdout: cliOut, stderr: cliErr, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });

  const directOut = sink(); const directErr = sink();
  const directRc = await interviewDirectMain(argv, { env: {}, stdin: noStdin(), stdout: directOut, stderr: directErr });

  assert.equal(cliRc, directRc);
  assert.equal(cliErr.text(), directErr.text());
  assert.equal(cliOut.text(), directOut.text());
});

test('bareloop author: dispatch through src/cli.js matches src/authorrun.js:main called directly, byte for byte', async () => {
  const argv = ['--source', '/tmp/nope', '--answers', '/tmp/a.json', '--draft', '/tmp/d.json', '--verdict', 'bogus-class', '--out', '/tmp/out'];

  const cliOut = sink(); const cliErr = sink();
  const cliRc = await main(['author', ...argv], {
    stdout: cliOut, stderr: cliErr, stdin: noStdin(), env: {}, cwd: process.cwd(),
  });

  const directOut = sink(); const directErr = sink();
  const directRc = await authorDirectMain(argv, { env: {}, stdin: noStdin(), stdout: directOut, stderr: directErr });

  assert.equal(cliRc, directRc);
  assert.equal(cliErr.text(), directErr.text());
  assert.equal(cliOut.text(), directOut.text());
});

// ---------------------------------------------------------------------------
// the top-level command list now names interview and author too
// ---------------------------------------------------------------------------

test('bareloop: an unknown command\'s refusal now lists interview/author alongside export/run/history/run-u', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['bogus'], { stdout: out, stderr: err });
  assert.equal(rc, 1);
  assert.match(err.text(), /unknown command "bogus" — one of: export, run, history, run-u, interview, author/);
});
