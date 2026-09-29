// The one-runner engine seam (`ctx.bundle`, src/userrun.js): the bundle door's hand-in.
// These drive `startRun` in-process with a scripted provider (tests/helpers.js) and a
// `bundle` opt, and prove each seam site: the books land under `bundle.runDir`, the
// tree hook fires only AFTER the $0 refusals, the run-list row says `bundle`, no bridge
// file is written, printed hints name the bundle's own invocation, and the signature
// equality (`approve === jobSpecHash(spec)`) still gates a bundle run. A local run (no
// `bundle`) is proven unchanged by the rest of the suite, untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
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

/** @param {string} dir */
function initRepo(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'bundle-seam-test@example.com']);
  git(dir, ['config', 'user.name', 'bundle-seam-test']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return git(dir, ['rev-parse', 'HEAD']);
}

const CLOSE_SOURCE = "console.log('FIXTURE judged=1');\nprocess.exit(1);\n";

/** @param {import('node:test').TestContext} t */
function fixture(t) {
  const workdir = tmp(t, 'bundle-seam-wd-');
  const seed = initRepo(workdir);
  const scriptsDir = tmp(t, 'bundle-seam-scripts-');
  const closeScriptPath = join(scriptsDir, 'close.mjs');
  writeFileSync(closeScriptPath, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1',
    job: 'bundle-seam-fixture',
    description: 'engine seam fixture',
    provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 },
    budgetUsd: 0.0005, // cap-halts right after the first rounds; only the seams are under test
    maxWallMs: 1_800_000,
    writeScope: ['src/**'],
    goal: 'Append the line MARKER_OK to src/mod.mjs.',
    verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closeScriptPath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
    escalation: { mode: 'decision-ready' },
  };
  const bundleDir = tmp(t, 'bundle-seam-bundle-');
  const runDir = join(bundleDir, 'runs', 'r1');
  let prepared = 0;
  const bundle = {
    runid: 'r1',
    runDir,
    invoke: 'bareloop run /the/bundle --repo /the/repo',
    printApprove: 'BUNDLEHASH',
    prepareTree: () => { prepared += 1; mkdirSync(runDir, { recursive: true }); },
  };
  const out = /** @type {string[]} */ ([]);
  const err = /** @type {string[]} */ ([]);
  const home = tmp(t, 'bundle-seam-home-');
  const provider = () => scriptedProvider([
    { text: 'scout: nothing' },
    { text: JSON.stringify({ schema: 'plan-v1', steps: [] }) },
    { text: 'never reached' },
  ]);
  return { workdir, seed, spec, bundle, runDir, out, err, home, provider, prepared: () => prepared };
}

test('bundle seam: a signed bundle run keeps its books under runDir and is listed via:bundle', async (t) => {
  const f = fixture(t);
  try {
    await startRun(f.spec, {
      workdir: f.workdir, seed: f.seed, spineName: 'unused', approve: jobSpecHash(f.spec), bundle: f.bundle,
      deps: { provider: f.provider(), env: {}, out: (s) => f.out.push(s), err: (s) => f.err.push(s), runlistHome: f.home },
    });
  } catch { /* only the seams matter, not this fixture's own outcome */ }
  assert.equal(f.prepared(), 1, 'prepareTree fired exactly once');
  assert.ok(existsSync(join(f.runDir, 'spine.jsonl')), 'the spine is <runDir>/spine.jsonl');
  assert.ok(existsSync(join(f.runDir, 'close')), 'the close books dir is <runDir>/close');
  const { rows } = readRunList({ home: f.home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].via, 'bundle');
  assert.equal(rows[0].runid, 'r1');
  assert.equal(rows[0].spine, join(f.runDir, 'spine.jsonl'));
});

test('bundle seam: a $0 refusal (no key) exits 2 BEFORE prepareTree — no tree, no books', async (t) => {
  const f = fixture(t);
  const code = await startRun(f.spec, {
    workdir: f.workdir, seed: f.seed, spineName: 'unused', approve: jobSpecHash(f.spec), bundle: f.bundle,
    deps: { env: {}, out: (s) => f.out.push(s), err: (s) => f.err.push(s), runlistHome: f.home },
  });
  assert.equal(code, 2);
  assert.equal(f.prepared(), 0, 'the hook never ran');
  assert.ok(!existsSync(f.runDir));
  assert.match(f.err.join('\n'), /ANTHROPIC_API_KEY/);
});

test('bundle seam: the signature equality still gates — a wrong approve previews and never prepares a tree', async (t) => {
  const f = fixture(t);
  const code = await startRun(f.spec, {
    workdir: f.workdir, seed: f.seed, spineName: 'unused', approve: 'not-the-hash', bundle: f.bundle,
    deps: { provider: f.provider(), env: {}, out: (s) => f.out.push(s), err: (s) => f.err.push(s), runlistHome: f.home },
  });
  assert.equal(code, 1, 'a preview refusal, not a run');
  assert.equal(f.prepared(), 0);
  assert.ok(!existsSync(f.runDir));
  assert.equal(readRunList({ home: f.home }).rows.length, 0);
});
