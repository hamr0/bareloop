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
  mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readFileSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobSpecHash } from '../src/job.js';
import { mintBridge } from '../src/bridges.js';
import { main } from '../src/cli.js';
import { scriptedProvider } from './helpers.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';

/** this repo's own root — every fixture bundle's node_modules/bareloop
 * symlinks here so `checkBundleDeps`'s preflight (F128) passes for the
 * existing green-path tests, exactly the way a real `npm install` inside the
 * bundle would resolve the package. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

// PRD item 27/M2: every fixture in this file writes CLOSE_SOURCE verbatim to
// disk before running (real spawns through runPlan/exportBundle), so the
// signed sha256 must be the REAL hash of that constant, computed once here.
const CLOSE_SOURCE_SHA256 = hashCloseScriptBytes(CLOSE_SOURCE);

/** @param {{ job: string, closeScriptPath: string, budgetUsd?: number, maxWallMs?: number, provider?: string, judge?: { provider: string, model: string } }} o */
function buildJob({
  job, closeScriptPath, budgetUsd = 2, maxWallMs = 1_800_000, provider = 'anthropic-api', judge,
}) {
  return {
    schema: 'job-v1',
    job,
    description: 'CLI M2 fixture: append a marker line to src/mod.mjs.',
    provider,
    ...(judge !== undefined ? { judge } : {}),
    cadence: { unit: 'day', every: 1 },
    budgetUsd,
    maxWallMs,
    writeScope: ['src/**'],
    goal: 'Append the line MARKER_OK to src/mod.mjs.',
    verdictType: 'green',
    close: [
      { name: 'has-marker', cmd: `node ${closeScriptPath} has-marker`, expect: 0, sha256: CLOSE_SOURCE_SHA256 },
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
 * @param {import('node:test').TestContext} t @param {{ job?: string, budgetUsd?: number, maxWallMs?: number, provider?: string, judge?: { provider: string, model: string } }} [o]
 */
function fixtureSpec(t, o = {}) {
  const jobName = o.job ?? 'cli-fixture-job';
  const scriptsDir = tmp(t, 'cli-scripts-');
  const closeScriptPath = join(scriptsDir, 'close.mjs');
  writeFileSync(closeScriptPath, CLOSE_SOURCE);

  const job = buildJob({
    job: jobName, closeScriptPath, budgetUsd: o.budgetUsd, maxWallMs: o.maxWallMs, provider: o.provider, judge: o.judge,
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
 * @param {import('node:test').TestContext} t @param {{ job?: string, budgetUsd?: number, maxWallMs?: number, provider?: string, judge?: { provider: string, model: string } }} [o]
 */
async function exportFixture(t, o = {}) {
  const { specFile, registryDir } = fixtureSpec(t, o);
  const outDir = join(tmp(t, 'cli-out-'), 'fixture.bareloop');
  const out = sink(); const err = sink();
  const rc = await main(['export', specFile, '--registry', registryDir, '--out', outDir], { stdout: out, stderr: err, cwd: process.cwd() });
  assert.equal(rc, 0, `export must succeed: ${err.text()}`);
  const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
  // F128: mint the bundle's own node_modules/bareloop so checkBundleDeps'
  // preflight passes — every `run` test below exercises what happens AFTER
  // that check, not the check itself (tests/bundle.test.js covers that
  // directly, and one dedicated test here proves the CLI fails without it).
  mkdirSync(join(outDir, 'node_modules'), { recursive: true });
  symlinkSync(REPO_ROOT, join(outDir, 'node_modules', 'bareloop'), 'dir');
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

test('bareloop run: a bundle naming a provider with a DIFFERENT env key refuses at $0, never builds it with the Anthropic key', async (t) => {
  // PRD item 28: the bundle runner's key contract is ANTHROPIC_API_KEY only.
  // Constructing an openai-api worker with that key would 401 at the first
  // call and read as a credential problem rather than the unbuilt seam it is.
  // The spec names the provider at EXPORT time — editing spec.json afterwards
  // would trip the manifest-hash guard first, which is its own (correct) test.
  const { bundleDir } = await exportFixture(t, { provider: 'openai-api' });
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo], {
    stdout: out, stderr: err, cwd: process.cwd(), env: { ANTHROPIC_API_KEY: 'sk-test-not-used' },
  });
  assert.notEqual(rc, 0, 'a provider it cannot key must refuse, never run');
  const said = err.text() + out.text();
  assert.match(said, /OPENAI_API_KEY/, 'it must name the key it would have needed');
  assert.equal(existsSync(join(repo, '.bareloop')), false, 'nothing may be created when nothing was spent');
});

test('bareloop run: a bundle whose signed JUDGE names a DIFFERENT env key refuses at $0, never builds it with the Anthropic key', async (t) => {
  // PRD item 32.2: the worker stays anthropic-api (so the WORKER refusal
  // above cannot be what fires here), but the spec signs a `judge` naming
  // gemini-api, which reads GEMINI_API_KEY. The bundle runner's key contract
  // is ANTHROPIC_API_KEY only, so resolveJudge's result must refuse the same
  // way the worker refusal does, by name, before any worktree/provider work.
  const { bundleDir } = await exportFixture(t, {
    provider: 'anthropic-api',
    judge: { provider: 'gemini-api', model: 'gemini-2.5-pro' },
  });
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo], {
    stdout: out, stderr: err, cwd: process.cwd(), env: { ANTHROPIC_API_KEY: 'sk-test-not-used' },
  });
  assert.notEqual(rc, 0, 'a judge it cannot key must refuse, never run');
  const said = err.text() + out.text();
  assert.match(said, /GEMINI_API_KEY/, 'it must name the key it would have needed');
  assert.match(said, /judge/i, 'the refusal must say judge, so this cannot pass on the worker refusal\'s text');
  assert.equal(existsSync(join(repo, '.bareloop')), false, 'nothing may be created when nothing was spent');
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
// F128 — bundle-deps-missing preflight
// ---------------------------------------------------------------------------

test('bareloop run: a bundle with no node_modules reds bundle-deps-missing BEFORE any worktree/provider', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t);
  // exportFixture mints node_modules/bareloop by default (F128) — strip it
  // back out to reproduce hamr's live defect exactly.
  rmSync(join(bundleDir, 'node_modules'), { recursive: true, force: true });
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash], {
    stdout: out, stderr: err, cwd: process.cwd(), provider,
  });
  assert.equal(rc, 1);
  assert.match(err.text(), /bundle-deps-missing/);
  assert.match(err.text(), /npm install/);
  assert.deepEqual(provider.calls, []);
  assert.equal(existsSync(join(repo, '.bareloop', 'wt')), false);
});

// ---------------------------------------------------------------------------
// exit code — run exits 0 only for green/already-green
// ---------------------------------------------------------------------------

test('bareloop run: a non-green outcome (cap-halt) exits 1', async (t) => {
  const { bundleDir, bundleHash } = await exportFixture(t, { budgetUsd: 0.0005 });
  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const runid = (1_700_000_600_000).toString(36);
  const worktree = join(repo, '.bareloop', 'wt', runid);
  const provider = scriptedProvider([CLOSE_SCOUT, { text: planFor() }, { text: 'never reached' }]);
  const out = sink(); const err = sink();
  const rc = await main(['run', bundleDir, '--repo', repo, '--approve', bundleHash], {
    stdout: out, stderr: err, cwd: process.cwd(), provider, now: makeNow(1_700_000_600_000),
  });
  const outcomeLine = out.text().match(/^outcome {3}(\S+)$/m)?.[1];
  assert.notEqual(outcomeLine, 'green', `fixture must not accidentally green: ${out.text()}`);
  assert.notEqual(outcomeLine, 'already-green');
  assert.equal(rc, 1, `a non-green outcome (${outcomeLine}) must exit 1: ${out.text()}\n${err.text()}`);
});

// ---------------------------------------------------------------------------
// minting-run line — the runid of the bridge VERSION at the resolved bundle
// spec's own hash, never the bridge's first history row
// ---------------------------------------------------------------------------

test('bareloop run: first-run "minting run" names the bridge VERSION at this exact spec hash', async (t) => {
  // The bridge's stored version.specHash is `jobSpecHash` of the ORIGINAL
  // (unrewritten) spec, which names the close script by its REAL absolute
  // path at mint time — a path that generally differs from wherever the
  // bundle later lands on an importer's machine, so the two hashes usually
  // do NOT collide (proven by the "no version at this hash" test below,
  // which is the honest common case). To exercise the MATCH branch here, the
  // fixture's "original" close-script path is deliberately chosen to be the
  // bundle's own eventual `<outDir>/close/<script>` path, so
  // `resolveBundleSpec`'s `$BARELOOP_BUNDLE` substitution reconstructs the
  // exact byte-identical cmd string the bridge was minted against.
  const outDir = join(tmp(t, 'cli-out-'), 'selfmatch.bareloop');
  const scriptAbsPath = join(outDir, 'close', 'close.mjs');
  const job = buildJob({ job: 'cli-selfmatch-job', closeScriptPath: scriptAbsPath });
  const bridge = bridgeFor(job);
  const registryDir = makeRegistry(t, bridge);

  const { exportBundle } = await import('../src/bundle.js');
  const r = exportBundle({
    spec: job, closeScripts: { [scriptAbsPath]: CLOSE_SOURCE }, registryDir, outDir, bareloopVersion: '0.0.0-test',
  });
  assert.equal(r.ok, true, `export must succeed: ${JSON.stringify(r.reds)}`);
  // F128: this bundle went through exportBundle directly (not exportFixture),
  // so mint its node_modules/bareloop by hand.
  mkdirSync(join(outDir, 'node_modules'), { recursive: true });
  symlinkSync(REPO_ROOT, join(outDir, 'node_modules', 'bareloop'), 'dir');

  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const out = sink(); const err = sink();
  // wrong --approve so the run stops right after printing the first-run
  // notice — cheapest way to observe the "minting run" line at $0.
  const rc = await main(['run', outDir, '--repo', repo, '--approve', 'deadbeef'], {
    stdout: out, stderr: err, cwd: process.cwd(), provider,
  });
  assert.equal(rc, 1);
  assert.match(out.text(), /minting run: mint-1 \(spine not bundled in v1\)/, out.text());
});

test('bareloop run: "no version at this hash" when no bridge version matches the resolved spec', async (t) => {
  const { bundleDir } = await exportFixture(t);
  // Change the shipped spec.json (moves both jobSpecHash AND bundleHash) but
  // keep the SAME shipped bridge, whose one version was minted at the
  // ORIGINAL hash — same simulation the blessing-stale test uses, minus the
  // blessing file (this is still a first run).
  const specPath = join(bundleDir, 'spec.json');
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  spec.budgetUsd = 999;
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  const { bundleHash: recomputed } = await import('../src/bundle.js').then((m) => ({ bundleHash: m.bundleHash(bundleDir) }));
  const manifest = JSON.parse(readFileSync(join(bundleDir, 'manifest.json'), 'utf8'));
  writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify({ ...manifest, bundleHash: recomputed }, null, 2));

  const repo = tmp(t, 'cli-repo-');
  initRepo(repo);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const out = sink(); const err = sink();
  // no --approve given at all: exits 1 right after printing the first-run
  // notice, which is all this test needs to observe.
  const rc = await main(['run', bundleDir, '--repo', repo], {
    stdout: out, stderr: err, cwd: process.cwd(), provider,
  });
  assert.equal(rc, 1);
  assert.match(out.text(), /no version at this hash/);
  assert.deepEqual(provider.calls, []);
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
