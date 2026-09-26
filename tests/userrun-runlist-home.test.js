// F196 — src/userrun.js's `execute()` calls `appendRun` (src/runlist.js) right
// before its first paid call, the same way src/cli.js's `doRun` does. Every
// OTHER test in this repo that touches `src/userrun.js` drives it only through
// its $0 preview path (no `--approve`, so appendRun is never reached — see the
// header comments on tests/resume-u.test.js, tests/hitl-u.test.js,
// tests/spec-selector-u.test.js), so until now nothing proved this call site
// actually honors the injected `deps.runlistHome` test seam. This file drives
// `startRun` in-process (`src/userrun.js`'s own thin door, the same one
// `scripts/run-u.mjs --job/--spec` resolves to) with a scripted provider
// (tests/helpers.js, the SAME seam tests/cli.test.js uses for its `bareloop
// run` fixtures) past the approval gate, far enough to reach appendRun, and
// checks the row landed under the injected temp home rather than the real
// `~/.config/bareloop`.
//
// The fixture is deliberately built to CAP-HALT almost immediately after
// appendRun (budgetUsd near $0, mirroring tests/cli.test.js's own "non-green
// outcome (cap-halt)" fixture) — this test only needs execute() to get past
// appendRun, never to green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { scriptedProvider } from './helpers.js';

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** a throwaway patient repo, one commit — coldReset (called right after
 * appendRun, before any paid call) needs a real git repo whose HEAD already
 * sits at `seed`. */
function initRepo(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'userrun-runlist-test@example.com']);
  git(dir, ['config', 'user.name', 'userrun-runlist-test']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return git(dir, ['rev-parse', 'HEAD']);
}

const CLOSE_SOURCE = `import { existsSync } from 'node:fs';
console.log('FIXTURE judged=1');
process.exit(existsSync(process.cwd()) ? 1 : 1);
`;
const CLOSE_SOURCE_SHA256 = hashCloseScriptBytes(CLOSE_SOURCE);

test('userrun execute(): appendRun honors the injected deps.runlistHome seam — a real (cap-halting) run writes its row under the temp home, never the real one', async (t) => {
  const workdir = tmp(t, 'userrun-runlist-wd-');
  const seed = initRepo(workdir);

  const scriptsDir = tmp(t, 'userrun-runlist-scripts-');
  const closeScriptPath = join(scriptsDir, 'close.mjs');
  writeFileSync(closeScriptPath, CLOSE_SOURCE);

  const spec = {
    schema: 'job-v1',
    job: 'userrun-runlist-home-fixture',
    description: 'F196 fixture: proves appendRun\'s deps.runlistHome seam from execute().',
    provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 },
    // near-$0 on purpose (see file header): cap-halts right after the scout +
    // one plan-drafting round, well before any close/write round runs.
    budgetUsd: 0.0005,
    maxWallMs: 1_800_000,
    writeScope: ['src/**'],
    goal: 'Append the line MARKER_OK to src/mod.mjs.',
    verdictType: 'green',
    close: [
      { name: 'has-marker', cmd: `node ${closeScriptPath} has-marker`, expect: 0, sha256: CLOSE_SOURCE_SHA256 },
    ],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
    escalation: { mode: 'decision-ready' },
  };
  const specHash = jobSpecHash(spec);

  const home = tmp(t, 'userrun-runlist-home-');
  const provider = scriptedProvider([
    { text: 'scout: nothing to report' },
    { text: JSON.stringify({ schema: 'plan-v1', steps: [] }) },
    { text: 'never reached — the cap halts before this' },
  ]);

  const outLines = /** @type {string[]} */ ([]);
  const errLines = /** @type {string[]} */ ([]);
  let threw = null;
  try {
    await startRun(spec, {
      workdir,
      seed,
      spineName: 'userrun-runlist-home-fixture-bareloop',
      approve: specHash,
      deps: {
        provider,
        env: {},
        out: (/** @type {string} */ s) => outLines.push(s),
        err: (/** @type {string} */ s) => errLines.push(s),
        runlistHome: home,
      },
    });
  } catch (/** @type {any} */ e) {
    // this fixture only needs execute() to reach PAST appendRun — whatever
    // happens to the run's own outcome after that (cap-halt, a thrown
    // instrument stop) is irrelevant to what this test checks.
    threw = e;
  }

  // THE PROOF: appendRun wrote its row under the INJECTED home, never the
  // real ~/.config/bareloop. If the call site ever drops `deps.runlistHome`
  // (falls back to `os.homedir()`), this read finds nothing here.
  const { rows } = readRunList({ home });
  assert.equal(
    rows.length,
    1,
    `appendRun must have written exactly one row under the injected home; found ${rows.length}. `
    + `threw=${threw ? String(threw.message ?? threw) : '(no throw)'} out=${JSON.stringify(outLines)} err=${JSON.stringify(errLines)}`,
  );
  assert.equal(rows[0].job, spec.job);
  assert.equal(rows[0].via, 'run-u');
  assert.equal(rows[0].patient, workdir);
  assert.equal(typeof rows[0].at, 'string');
  assert.equal(existsSync(join(home, 'runs.jsonl')), true);
});
