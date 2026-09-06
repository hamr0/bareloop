// Export M2 (`docs/product/EXPORT-BUILD.md`) — the `bareloop` CLI
// (`src/cli.js`: `main(argv, deps)`). Every test drives `main` in-process, at
// $0, with a scripted provider (`tests/helpers.js`'s `scriptedProvider`) —
// the same seam `tests/planrun.test.js` uses. A real (throwaway) git repo is
// the patient; the worktree/branch/gate-audit assertions are the whole point
// of M2 and cannot be faked without one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { mintBridge } from '../src/bridges.js';
import { main } from '../src/cli.js';
import { scriptedProvider } from './helpers.js';

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** a throwaway origin repo, one commit, src/mod.mjs without the marker */
function initRepo(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'cli-test@example.com']);
  git(dir, ['config', 'user.name', 'cli-test']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'seed']);
}

/** the close script: no bareloop/src imports at all (never needs the package
 * installed at run time — the CLI test worktree is a bare throwaway repo,
 * not a bareloop consumer) — just checks the marker landed. */
const CLOSE_SOURCE = `import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const p = join(process.cwd(), 'src', 'mod.mjs');
const ok = existsSync(p) && readFileSync(p, 'utf8').includes('MARKER_OK');
console.log('FIXTURE judged=1');
process.exit(ok ? 0 : 1);
`;

/** @param {{ job: string, closeScriptPath: string, budgetUsd?: number, maxWallMs?: number }} o */
function buildJob({ job, closeScriptPath, budgetUsd = 2, maxWallMs = 1_800_000 }) {
  return {
    schema: 'job-v1',
    job,
    description: 'CLI M2 fixture: append a marker line to src/mod.mjs.',
    provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 },
    budgetUsd,
    maxWallMs,
    writeScope: ['src/**'],
    goal: 'Append the line MARKER_OK to src/mod.mjs.',
    verdictType: 'green',
    close: [
      { name: 'has-marker', cmd: `node ${closeScriptPath} has-marker`, expect: 0 },
    ],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
    escalation: { mode: 'decision-ready' },
  };
}

/** @param {any} job */
function bridgeFor(job) {
  const m = mintBridge(
    { name: job.job, goal: job.goal, specHash: jobSpecHash(job), closeStageNames: ['has-marker'], toolsUsed: ['read', 'grep', 'edit', 'write'] },
    { runid: 'mint-1', patient: 'p1', at: '2026-09-05T00:00:00.000Z', plan: { schema: 'plan-v1', steps: [] }, costUsd: 1, spendComplete: true, wallMs: 30_000, rounds: 4, specHash: jobSpecHash(job) },
  );
  assert.equal(m.ok, true, `bridge fixture must mint clean: ${JSON.stringify(m.reds)}`);
  return m.bridge;
}

/** @param {import('node:test').TestContext} t @param {any} bridge */
function makeRegistry(t, bridge) {
  const dir = tmp(t, 'cli-registry-');
  writeFileSync(join(dir, `${bridge.name}.json`), `${JSON.stringify(bridge, null, 2)}\n`);
  return dir;
}

/** a fresh in-memory stdout/stderr sink */
function sink() {
  /** @type {string[]} */
  const chunks = [];
  return { write: (/** @type {string} */ s) => { chunks.push(s); return true; }, text: () => chunks.join('') };
}

/** a monotonic fake clock — deterministic runids across a whole `main()` call
 * (the FIRST `now()` call mints the runid; later calls only stamp timestamps
 * that never need to be asserted on exactly). */
function makeNow(seed) {
  let n = seed;
  return () => n++;
}

/**
 * Write a fixture job spec + close script + a registry bridge minted at the
 * job's own hash — everything `bareloop export` needs to succeed.
 * @param {import('node:test').TestContext} t @param {{ job?: string, budgetUsd?: number, maxWallMs?: number }} [o]
 */
function fixtureSpec(t, o = {}) {
  const jobName = o.job ?? 'cli-fixture-job';
  const scriptsDir = tmp(t, 'cli-scripts-');
  const closeScriptPath = join(scriptsDir, 'close.mjs');
  writeFileSync(closeScriptPath, CLOSE_SOURCE);

  const job = buildJob({
    job: jobName, closeScriptPath, budgetUsd: o.budgetUsd, maxWallMs: o.maxWallMs,
  });
  const bridge = bridgeFor(job);
  const registryDir = makeRegistry(t, bridge);

  const specDir = tmp(t, 'cli-spec-');
  const specFile = join(specDir, `${jobName}.json`);
  writeFileSync(specFile, JSON.stringify(job, null, 2));

  return { job, specFile, registryDir };
}

/**
 * Export a fixture bundle through the REAL CLI path and return the bundleDir
 * + bundleHash a `run` test needs.
 * @param {import('node:test').TestContext} t @param {{ job?: string, budgetUsd?: number, maxWallMs?: number }} [o]
 */
async function exportFixture(t, o = {}) {
  const { specFile, registryDir } = fixtureSpec(t, o);
  const outDir = join(tmp(t, 'cli-out-'), 'fixture.bareloop');
  const out = sink(); const err = sink();
  const rc = await main(['export', specFile, '--registry', registryDir, '--out', outDir], { stdout: out, stderr: err, cwd: process.cwd() });
  assert.equal(rc, 0, `export must succeed: ${err.text()}`);
  const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
  return {
    bundleDir: outDir, bundleHash: manifest.bundleHash, manifest, out, err,
  };
}

const CLOSE_SCOUT = { text: 'scout: src/mod.mjs has no MARKER_OK yet' };
/** the plan draft — one write step, exactly the shape the export POC proved */
const planFor = () => JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'append-marker',
    action: 'Append the line MARKER_OK to src/mod.mjs',
    tools: ['write'],
    rounds: 6,
    target: 'src/mod.mjs',
    exit: [
      { type: 'tree-changed', scope: 'src/**' },
      { type: 'check-passes', name: 'has-marker' },
    ],
  }],
});
const tcall = (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ args) => ({ id, name, arguments: args });

/** @param {string} worktree a green script for the fixture job over `worktree` */
function greenScript(worktree) {
  const modPath = join(worktree, 'src', 'mod.mjs');
  return scriptedProvider([
    CLOSE_SCOUT,
    { text: planFor() },
    { toolCalls: [tcall('t1', 'shell_write', { path: modPath, content: 'export const x = 1;\nMARKER_OK\n' })] },
    { text: 'wrote the marker' },
  ]);
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

test('bareloop export: happy path prints the hash, the file list, and the unblessed sentence', async (t) => {
  const { specFile, registryDir } = fixtureSpec(t);
  const outDir = join(tmp(t, 'cli-out-'), 'fixture.bareloop');
  const out = sink(); const err = sink();
  const rc = await main(['export', specFile, '--registry', registryDir, '--out', outDir], { stdout: out, stderr: err, cwd: process.cwd() });
  assert.equal(rc, 0, `export must succeed: ${err.text()}`);
  assert.match(out.text(), /bundleHash: [0-9a-f]{64}/);
  assert.match(out.text(), /close\/close\.mjs/);
  assert.match(out.text(), /this bundle is unblessed until its first run greens on the importer's machine\./);
  assert.ok(existsSync(join(outDir, 'manifest.json')));
});

test('bareloop export: a red (no bridge at hash) prints the code and writes nothing', async (t) => {
  const { specFile } = fixtureSpec(t);
  const emptyRegistry = tmp(t, 'cli-empty-registry-');
  const outDir = join(tmp(t, 'cli-out-'), 'fixture.bareloop');
  const out = sink(); const err = sink();
  const rc = await main(['export', specFile, '--registry', emptyRegistry, '--out', outDir], { stdout: out, stderr: err, cwd: process.cwd() });
  assert.equal(rc, 1);
  assert.match(err.text(), /no-bridge-at-hash/);
  assert.equal(existsSync(outDir), false);
});

// ---------------------------------------------------------------------------
// run — the money/arbiter-sensitive ordering
// ---------------------------------------------------------------------------

test('bareloop run: no key and no injected provider -> questions + hash, exit 0, no worktree', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t);
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo], {
    stdout: out, stderr: err, cwd: process.cwd(), env: {},
  });
  assert.equal(rc, 0);
  assert.match(out.text(), new RegExp(bundleHash));
  assert.match(out.text(), /ANTHROPIC_API_KEY/);
  assert.equal(existsSync(join(repo, '.bareloop')), false, 'no worktree may be created when nothing was spent');
});

test('bareloop run: a tampered bundle reds bundle-tampered BEFORE any worktree/provider', async (t) => {
  const { bundleDir } = await exportFixture(t);
  const scriptFile = join(bundleDir, 'close', 'close.mjs');
  writeFileSync(scriptFile, readFileSync(scriptFile, 'utf8').replace('FIXTURE', 'HACKED'));
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo, '--approve', 'whatever'], {
    stdout: out, stderr: err, cwd: process.cwd(), provider,
  });
  assert.equal(rc, 1);
  assert.match(err.text(), /bundle-tampered/);
  assert.deepEqual(provider.calls, []);
  assert.equal(existsSync(join(repo, '.bareloop', 'wt')), false);
});

test('bareloop run: first run without --approve is refused', async (t) => {
  const { bundleDir } = await exportFixture(t);
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo], { stdout: out, stderr: err, cwd: process.cwd(), provider });
  assert.equal(rc, 1);
  assert.match(err.text(), /--approve/);
  assert.deepEqual(provider.calls, []);
});

test('bareloop run: first run with the WRONG --approve is refused', async (t) => {
  const { bundleDir } = await exportFixture(t);
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo, '--approve', 'deadbeef'], { stdout: out, stderr: err, cwd: process.cwd(), provider });
  assert.equal(rc, 1);
  assert.deepEqual(provider.calls, []);
});

test('bareloop run: first GREEN run blesses the bundle, records history, and leaves a worktree+branch', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t);
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const originStatusBefore = git(repo, ['status', '--porcelain', '--', 'src']);
  const originBranchBefore = git(repo, ['branch', '--show-current']);

  const now = makeNow(1_700_000_000_000);
  const runid = (1_700_000_000_000).toString(36);
  const worktree = join(repo, '.bareloop', 'wt', runid);
  const provider = greenScript(worktree);

  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash], {
    stdout: out, stderr: err, cwd: process.cwd(), provider, now,
  });
  assert.equal(rc, 0, `run must green: ${out.text()}\n${err.text()}`);
  assert.match(out.text(), /outcome   green/);

  // blessing
  const blessing = JSON.parse(readFileSync(join(bundleDir, 'blessing.json'), 'utf8'));
  assert.equal(blessing.bundleHash, bundleHash);
  assert.equal(blessing.outcome, 'green');

  // history: one row, bundleHash+approveHash pairing recorded
  const historyLines = readFileSync(join(bundleDir, 'history.jsonl'), 'utf8').trim().split('\n');
  assert.equal(historyLines.length, 1);
  const row = JSON.parse(historyLines[0]);
  assert.equal(row.outcome, 'green');
  assert.equal(row.bundleHash, bundleHash);
  assert.equal(typeof row.approveHash, 'string');
  assert.notEqual(row.approveHash, bundleHash, 'the approveHash is the RESOLVED spec hash, never the bundle manifest hash');
  assert.equal(row.worktree, worktree);
  assert.match(row.branch, /^bareloop-cli-fixture-job$/);

  // worktree + branch left behind, kept
  assert.equal(existsSync(worktree), true);
  assert.equal(git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']), 'bareloop-cli-fixture-job');
  assert.match(readFileSync(join(worktree, 'src', 'mod.mjs'), 'utf8'), /MARKER_OK/);

  // origin checkout untouched (the only new thing on disk is `.bareloop/`,
  // the worktree home — never a tracked-file change or a branch switch)
  assert.equal(git(repo, ['status', '--porcelain', '--', 'src']), originStatusBefore);
  assert.equal(git(repo, ['branch', '--show-current']), originBranchBefore);

  // spine + gate-audit relocated under the bundle, not left in the worktree
  assert.equal(existsSync(join(bundleDir, 'runs', runid, 'spine.jsonl')), true);
  assert.equal(existsSync(join(worktree, 'gate-audit.jsonl')), false);
  assert.equal(existsSync(join(bundleDir, 'runs', runid, 'gate-audit.jsonl')), true);
});

test('bareloop run: a SECOND run needs no --approve, mints a fresh worktree/runid and a "-2" branch', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t);
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);

  const runid1 = (1_700_000_100_000).toString(36);
  const wt1 = join(repo, '.bareloop', 'wt', runid1);
  await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash], {
    stdout: sink(), stderr: sink(), cwd: process.cwd(), provider: greenScript(wt1), now: makeNow(1_700_000_100_000),
  });
  assert.equal(existsSync(join(bundleDir, 'blessing.json')), true);

  const runid2 = (1_700_000_200_000).toString(36);
  const wt2 = join(repo, '.bareloop', 'wt', runid2);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo], {
    stdout: out, stderr: err, cwd: process.cwd(), provider: greenScript(wt2), now: makeNow(1_700_000_200_000),
  });
  assert.equal(rc, 0, `second run must green: ${out.text()}\n${err.text()}`);
  assert.notEqual(wt1, wt2);
  assert.equal(existsSync(wt2), true);
  assert.equal(git(wt2, ['rev-parse', '--abbrev-ref', 'HEAD']), 'bareloop-cli-fixture-job-2');

  const historyLines = readFileSync(join(bundleDir, 'history.jsonl'), 'utf8').trim().split('\n');
  assert.equal(historyLines.length, 2);
});

test('bareloop run: --budget wider than the bundle reds envelope-widen', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t, { budgetUsd: 2 });
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash, '--budget', '10'], {
    stdout: out, stderr: err, cwd: process.cwd(), provider: scriptedProvider([{ text: 'never reached' }]),
  });
  assert.equal(rc, 1);
  assert.match(err.text(), /envelope-widen/);
});

test('bareloop run: a TIGHTER --budget runs and history records the tighter number', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t, { budgetUsd: 2 });
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const runid = (1_700_000_300_000).toString(36);
  const worktree = join(repo, '.bareloop', 'wt', runid);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash, '--budget', '1'], {
    stdout: out, stderr: err, cwd: process.cwd(), provider: greenScript(worktree), now: makeNow(1_700_000_300_000),
  });
  assert.equal(rc, 0, `run must green: ${out.text()}\n${err.text()}`);
  const row = JSON.parse(readFileSync(join(bundleDir, 'history.jsonl'), 'utf8').trim().split('\n')[0]);
  assert.equal(row.budgetUsd, 1);
});

test('bareloop run: blessing-stale (bundle re-exported since blessing) reds and exits 1', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t);
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const runid = (1_700_000_400_000).toString(36);
  const worktree = join(repo, '.bareloop', 'wt', runid);
  const first = await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash], {
    stdout: sink(), stderr: sink(), cwd: process.cwd(), provider: greenScript(worktree), now: makeNow(1_700_000_400_000),
  });
  assert.equal(first, 0);

  // simulate "re-exported since blessing": the close script changed, the
  // manifest's bundleHash now reflects it, but blessing.json still holds the
  // OLD hash — same simulation tests/bundle.test.js uses for verifyBlessing.
  const scriptFile = join(bundleDir, 'close', 'close.mjs');
  writeFileSync(scriptFile, `${readFileSync(scriptFile, 'utf8')}\n// re-exported\n`);
  const manifest = JSON.parse(readFileSync(join(bundleDir, 'manifest.json'), 'utf8'));
  const { bundleHash: recomputed } = await import('../src/bundle.js').then((m) => ({ bundleHash: m.bundleHash(bundleDir) }));
  writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify({ ...manifest, bundleHash: recomputed }, null, 2));

  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo], {
    stdout: out, stderr: err, cwd: process.cwd(), provider: scriptedProvider([{ text: 'never reached' }]),
  });
  assert.equal(rc, 1);
  assert.match(err.text(), /blessing-stale/);
});

// ---------------------------------------------------------------------------
// history
// ---------------------------------------------------------------------------

test('bareloop history: prints history rows and bridge listing rows', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t);
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const runid = (1_700_000_500_000).toString(36);
  const worktree = join(repo, '.bareloop', 'wt', runid);
  await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash], {
    stdout: sink(), stderr: sink(), cwd: process.cwd(), provider: greenScript(worktree), now: makeNow(1_700_000_500_000),
  });

  const out = sink(); const err = sink();
  const rc = await main(['history', bundleDir], { stdout: out, stderr: err, cwd: process.cwd() });
  assert.equal(rc, 0);
  assert.match(out.text(), /"outcome":"green"/);
  assert.match(out.text(), /"name":"cli-fixture-job"/);
});

// ---------------------------------------------------------------------------
// unknown command
// ---------------------------------------------------------------------------

test('bareloop: an unknown command errs and exits 1', async () => {
  const out = sink(); const err = sink();
  const rc = await main(['bogus'], { stdout: out, stderr: err });
  assert.equal(rc, 1);
  assert.match(err.text(), /unknown command/);
});
