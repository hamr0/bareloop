// P6 item 1 — a repo job runs on a WORKTREE in the person's own repo. REAL git, the REAL source door and the REAL
// engine (`run-u --spec`, in-process) with a scripted provider; nothing is stubbed on the git side. Every commit forces a
// neutral identity (CI has no global gitconfig). The signed spec sits beside `source-seed/` exactly as the panel lays a
// session out: `<session>/resolved-spec.json`, `<session>/source-seed/source.json`, spine in `<session>/source-seed/<job>-bareloop/`.

import { test } from 'node:test';
import fs, { statSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { prepareSource } from '../src/source.js';
import { main } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { stopFilePath } from '../src/legs.js';
import { scriptedProvider, reply } from './helpers.js';

/** @param {import('node:test').TestContext} t @param {string} prefix @param {string} [base] */
const tmp = (t, prefix, base = tmpdir()) => {
  const d = mkdtempSync(join(base, prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const ID = ['-c', 'user.name=p6-test', '-c', 'user.email=p6@test', '-c', 'commit.gpgsign=false'];
const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', [...ID, '-C', cwd, ...args], { encoding: 'utf8' }).trim();

function initRepo(/** @type {string} */ dir, /** @type {boolean} */ marked = false) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.mjs'), `export const x = 1;\n${marked ? 'MARKER_OK\n' : ''}`);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'seed']);
}

const CLOSE_SOURCE = `import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const p = join(process.cwd(), 'src', 'mod.mjs');
const ok = existsSync(p) && readFileSync(p, 'utf8').includes('MARKER_OK');
console.log('FIXTURE judged=1');
process.exit(ok ? 0 : 1);
`;

const planFor = () => JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'append-marker', action: 'Append the line MARKER_OK to src/mod.mjs', tools: ['write'], rounds: 6, target: 'src/mod.mjs',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'has-marker' }],
  }],
});
const tcall = (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ args) => ({ id, name, arguments: args });

/**
 * One session laid out like the panel's: the spec, and the REAL source door (worktree mode) over a fresh repo.
 * @param {import('node:test').TestContext} t @param {{budgetUsd?: number, repoBase?: string, marked?: boolean}} [o]
 */
async function session(t, o = {}) {
  const repo = tmp(t, 'p6-repo-', o.repoBase);
  initRepo(repo, o.marked);
  const dir = tmp(t, 'p6-session-');
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1',
    job: 'p6-worktree-job',
    description: 'P6 item 1 fixture: append a marker line to src/mod.mjs.',
    provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 },
    budgetUsd: o.budgetUsd ?? 2,
    maxWallMs: 1_800_000,
    writeScope: ['src/**'],
    goal: 'Append the line MARKER_OK to src/mod.mjs.',
    verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closeScript} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
    escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  const worktree = join(repo, '.bareloop', 'wt', 'sess1');
  const prep = await prepareSource({ source: repo, into, destination: 'src/', worktree });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  return { repo, dir, spec, specPath, into, worktree, prep };
}

const sink = () => {
  /** @type {string[]} */
  const chunks = [];
  return { push: (/** @type {string} */ s) => { chunks.push(s); }, text: () => chunks.join('\n') };
};

test('source door worktree mode: the tree is a detached worktree at HEAD inside the repo; no copy, no seed commit, repo untouched', async (t) => {
  const f = await session(t);
  const head = git(f.repo, ['rev-parse', 'HEAD']);
  assert.equal(f.prep.tree, f.worktree);
  assert.equal(f.prep.manifest.worktree, f.worktree);
  assert.equal(f.prep.manifest.repo, f.repo);
  assert.equal(f.prep.manifest.seed, head, 'the seed IS the repo\'s own HEAD — no front-door seed commit is made');
  assert.equal(git(f.worktree, ['rev-parse', 'HEAD']), head);
  assert.equal(existsSync(join(f.into, 'tree')), false, 'the hidden copy is gone for a repo');
  assert.equal(existsSync(join(f.worktree, 'output')), false, 'no output/ scaffold is written into the person\'s repo tree');
  assert.equal(git(f.repo, ['status', '--porcelain']), '', 'the person\'s own git status stays clean (.bareloop/ is hidden)');
  assert.equal(git(f.repo, ['rev-parse', 'HEAD']), head);
  assert.equal(readFileSync(join(f.repo, '.git', 'info', 'exclude'), 'utf8').split('\n').filter((l) => l === '/.bareloop/').length, 1);
});

test('source door worktree mode: uncommitted edits are NOT in the worktree', async (t) => {
  const repo = tmp(t, 'p6-dirty-');
  initRepo(repo);
  writeFileSync(join(repo, 'src', 'mod.mjs'), 'export const x = 1;\nUNCOMMITTED\n');
  const into = join(tmp(t, 'p6-dirty-sess-'), 'source-seed');
  const prep = await prepareSource({ source: repo, into, destination: 'src/', worktree: join(repo, '.bareloop', 'wt', 's') });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  assert.doesNotMatch(readFileSync(join(prep.tree, 'src', 'mod.mjs'), 'utf8'), /UNCOMMITTED/);
});

test('source door worktree mode: a repo with no commit refuses, naming why, and leaves no worktree', async (t) => {
  const repo = tmp(t, 'p6-nocommit-');
  git(repo, ['init', '-q', '-b', 'main']);
  const into = join(tmp(t, 'p6-nocommit-sess-'), 'source-seed');
  const prep = await prepareSource({ source: repo, into, destination: 'src/', worktree: join(repo, '.bareloop', 'wt', 's') });
  // an empty repo has no tracked files, so the front door's own empty check or the worktree add stops it — either way a named stop
  assert.notEqual(prep.stop, null);
  assert.equal(existsSync(join(repo, '.bareloop', 'wt', 's')), false);
});

test('run-u --spec on a worktree: GREEN commits on the work branch, removes the folder, keeps the branch; spine stays in the session', async (t) => {
  const f = await session(t);
  const marker = join(f.worktree, 'src', 'mod.mjs');
  const provider = scriptedProvider([
    { text: 'scout: src/mod.mjs has no MARKER_OK yet' },
    { text: planFor() },
    { toolCalls: [tcall('t1', 'shell_write', { path: marker, content: 'export const x = 1;\nMARKER_OK\n' })] },
    { text: 'wrote the marker' },
  ]);
  const out = sink(); const err = sink();
  const home = tmp(t, 'p6-home-');
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], {
    provider, env: {}, out: out.push, err: err.push, runlistHome: home,
  });
  assert.equal(rc, 0, `${out.text()}\n${err.text()}`);
  const branch = git(f.repo, ['branch', '--list', 'bareloop-p6-worktree-job*', '--format=%(refname:short)']);
  assert.match(branch, /^bareloop-p6-worktree-job/, 'the engine\'s own work-branch rule, from a detached worktree');
  assert.match(git(f.repo, ['show', `${branch}:src/mod.mjs`]), /MARKER_OK/, 'the final commit carries the run\'s work');
  assert.match(git(f.repo, ['log', '-1', '--format=%s', branch]), /^bareloop: p6-worktree-job/);
  assert.equal(existsSync(f.worktree), false, 'GREEN removes the worktree folder');
  assert.doesNotMatch(git(f.repo, ['worktree', 'list']), /sess1/);
  assert.equal(git(f.repo, ['symbolic-ref', '--short', 'HEAD']), 'main', 'the person\'s own checkout never moved');
  assert.doesNotMatch(readFileSync(join(f.repo, 'src', 'mod.mjs'), 'utf8'), /MARKER_OK/, 'their working tree is untouched');
  assert.match(out.text(), /WORKTREE\s+final commit [0-9a-f]+ on bareloop-p6-worktree-job/);
  // the books stay in the session dir, never inside the person's repo
  const spineDir = join(f.into, 'p6-worktree-job-bareloop');
  assert.ok(readdirSync(spineDir).some((n) => /^u-.*\.jsonl$/.test(n)), 'spine is beside source.json in the session');
  assert.equal(existsSync(join(f.repo, '.bareloop', 'p6-worktree-job-bareloop')), false);
  assert.equal(git(f.repo, ['status', '--porcelain']), '');
});

test('run-u --spec on a worktree: a run that does NOT green leaves the worktree folder (Resume needs it)', async (t) => {
  const f = await session(t);
  const provider = scriptedProvider([
    { text: 'scout: nothing' },
    { text: JSON.stringify({ schema: 'plan-v1', steps: [] }) },
    { text: 'never reached' },
  ]);
  const out = sink(); const err = sink();
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], {
    provider, env: {}, out: out.push, err: err.push, runlistHome: tmp(t, 'p6-home-'),
  });
  assert.equal(rc, 0, `${out.text()}\n${err.text()}`);
  assert.match(out.text(), /outcome\s+plan-red/, 'this fixture must not green (a stepless plan is a plan-red)');
  assert.equal(existsSync(join(f.worktree, '.git')), true, 'the worktree folder stays');
  assert.match(git(f.repo, ['worktree', 'list']), /sess1/);
  assert.doesNotMatch(out.text(), /WORKTREE\s+final commit/);
});

test('run-u --spec: a worktree that is gone is a named $0 stop, never a silent fresh start', async (t) => {
  const f = await session(t);
  rmSync(f.worktree, { recursive: true, force: true });
  const out = sink(); const err = sink();
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], {
    provider: scriptedProvider([{ text: 'x' }]), env: {}, out: out.push, err: err.push, runlistHome: tmp(t, 'p6-home-'),
  });
  assert.equal(rc, 2);
  assert.match(err.text(), /the job's worktree is gone/);
});

// EXDEV: the worktree sits in the person's repo, which can be on another filesystem than the session dir. The green
// end moves the run's gate audit from the tree into the spine dir; renameSync cannot cross a device.
/** @param {import('node:test').TestContext} t @param {Awaited<ReturnType<typeof session>>} f */
async function greenRun(t, f) {
  const marker = join(f.worktree, 'src', 'mod.mjs');
  const provider = scriptedProvider([
    { text: 'scout: src/mod.mjs has no MARKER_OK yet' },
    { text: planFor() },
    { toolCalls: [tcall('t1', 'shell_write', { path: marker, content: 'export const x = 1;\nMARKER_OK\n' })] },
    { text: 'wrote the marker' },
  ]);
  const out = sink(); const err = sink();
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], {
    provider, env: {}, out: out.push, err: err.push, runlistHome: tmp(t, 'p6-home-'),
  });
  return { rc, out: out.text(), err: err.text() };
}

function assertGreenCommitted(/** @type {any} */ f, /** @type {{rc: number, out: string, err: string}} */ r) {
  assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
  const branch = git(f.repo, ['branch', '--list', 'bareloop-p6-worktree-job*', '--format=%(refname:short)']);
  assert.match(git(f.repo, ['show', `${branch}:src/mod.mjs`]), /MARKER_OK/, 'the green-end commit happened');
  assert.equal(existsSync(f.worktree), false, 'the worktree folder is removed');
  const spineDir = join(f.into, 'p6-worktree-job-bareloop');
  const audit = readdirSync(spineDir).find((n) => /^u-.*-gate-audit\.jsonl$/.test(n));
  assert.ok(audit, 'the gate audit reached the spine dir');
  assert.ok(readFileSync(join(spineDir, audit), 'utf8').length > 0);
}

test('run-u --spec on a worktree: rename forced to EXDEV for the gate audit — the run still completes and commits', async (t) => {
  const f = await session(t);
  const realRename = fs.renameSync;
  let forced = 0;
  fs.renameSync = /** @type {typeof fs.renameSync} */ ((a, b) => {
    if (String(a).endsWith('gate-audit.jsonl')) { forced++; throw Object.assign(new Error(`EXDEV: cross-device link not permitted, rename '${a}' -> '${b}'`), { code: 'EXDEV' }); }
    return realRename(a, b);
  });
  syncBuiltinESMExports();
  t.after(() => { fs.renameSync = realRename; syncBuiltinESMExports(); });
  const r = await greenRun(t, f);
  fs.renameSync = realRename; syncBuiltinESMExports();
  assert.ok(forced >= 1, 'the audit move really hit the forced EXDEV');
  assertGreenCommitted(f, r);
});

const shm = '/dev/shm';
const crossDev = (() => { try { return statSync(shm).dev !== statSync(tmpdir()).dev; } catch { return false; } })();
test('run-u --spec on a worktree: REAL cross-device (repo on /dev/shm, session dir on tmpdir) completes and commits', { skip: crossDev ? false : '/dev/shm is on the same device as tmpdir' }, async (t) => {
  const f = await session(t, { repoBase: shm });
  assertGreenCommitted(f, await greenRun(t, f));
});

// A later readout step must never skip the green commit: the watchdog note is parsed long after the gate-audit move, and a
// malformed one throws there. The work is already committed and the folder already removed by then.
test('run-u --spec on a worktree: a readout step that throws AFTER the green (malformed watchdog note) still commits and removes the folder', async (t) => {
  const f = await session(t);
  const realExists = fs.existsSync;
  const realRead = fs.readFileSync;
  const isNote = (/** @type {any} */ p) => String(p).endsWith('.watchdog.json');
  fs.existsSync = /** @type {typeof fs.existsSync} */ ((p) => isNote(p) || realExists(p));
  fs.readFileSync = /** @type {typeof fs.readFileSync} */ (/** @type {any} */ ((p, ...rest) => (isNote(p) ? 'not json {' : realRead(p, ...rest))));
  syncBuiltinESMExports();
  const restore = () => { fs.existsSync = realExists; fs.readFileSync = realRead; syncBuiltinESMExports(); };
  t.after(restore);
  /** @type {{rc: number, out: string, err: string} | null} */
  let r = null;
  /** @type {any} */
  let threw = null;
  try { r = await greenRun(t, f); } catch (e) { threw = e; }
  restore();
  assert.ok(threw !== null || (r !== null && r.rc !== 0), 'the malformed note really made the readout fail');
  const branch = git(f.repo, ['branch', '--list', 'bareloop-p6-worktree-job*', '--format=%(refname:short)']);
  assert.match(branch, /^bareloop-p6-worktree-job/);
  assert.match(git(f.repo, ['show', `${branch}:src/mod.mjs`]), /MARKER_OK/, 'the green work is committed despite the later throw');
  assert.equal(existsSync(f.worktree), false, 'the worktree folder is removed despite the later throw');
});

// hamr's ruling: the branch ALWAYS holds a green's work. A door-open green still commits (the panel says `git merge <branch>`)
// but keeps its folder — an accept at the door re-runs the mechanical stages against it.
test('run-u --spec on a worktree: a GREEN that opens a review door commits on the branch AND keeps the folder', async (t) => {
  const f = await session(t);
  const marker = join(f.worktree, 'src', 'mod.mjs');
  const provider = scriptedProvider([
    { text: 'scout: src/mod.mjs has no MARKER_OK yet' },
    { text: planFor() },
    { toolCalls: [tcall('t1', 'shell_write', { path: marker, content: 'export const x = 1;\nMARKER_OK\n' })] },
    { text: 'wrote the marker' },
  ]);
  const out = sink(); const err = sink();
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec), '--review-door'], {
    provider, env: {}, out: out.push, err: err.push, runlistHome: tmp(t, 'p6-home-'),
  });
  assert.equal(rc, 0, `${out.text()}\n${err.text()}`);
  assert.match(out.text(), /review door/i, 'the run really opened a door');
  const branch = git(f.repo, ['branch', '--list', 'bareloop-p6-worktree-job*', '--format=%(refname:short)']);
  assert.match(git(f.repo, ['show', `${branch}:src/mod.mjs`]), /MARKER_OK/, 'the branch holds the work');
  assert.equal(existsSync(f.worktree), true, 'the folder is KEPT for the door');
  assert.match(out.text(), /WORKTREE\s+final commit [0-9a-f]+ on bareloop-p6-worktree-job.*KEPT for the review door/);
});

test('run-u --spec on a worktree: a GREEN with a spine leak still commits on the branch and removes the folder', async (t) => {
  const f = await session(t);
  const marker = join(f.worktree, 'src', 'mod.mjs');
  const provider = scriptedProvider([
    { text: 'scout: src/mod.mjs has no MARKER_OK yet' },
    { text: planFor() },
    { toolCalls: [tcall('t1', 'shell_write', { path: marker, content: 'export const x = 1;\nMARKER_OK\n' })] },
    { text: 'wrote the marker' },
  ]);
  const out = sink(); const err = sink();
  // the spine is scrubbed at capture, so a leak can only be a raw secret-shaped string the readout finds in it: serve one
  // on the spine's own whole-file read (the one the leak scan takes), never on a line-by-line reader
  const realRead = fs.readFileSync;
  const isSpine = (/** @type {any} */ p) => /[\\/]u-[^\\/]*\.jsonl$/.test(String(p)) && !String(p).endsWith('gate-audit.jsonl');
  fs.readFileSync = /** @type {typeof fs.readFileSync} */ (/** @type {any} */ ((p, ...rest) => {
    const v = realRead(p, ...rest);
    return isSpine(p) && typeof v === 'string' ? `${v.trimEnd()}\n{"type":"note","text":"sk-ant-abcdefghijklmnopqrstuvwx"}\n` : v;
  }));
  syncBuiltinESMExports();
  const restore = () => { fs.readFileSync = realRead; syncBuiltinESMExports(); };
  t.after(restore);
  try {
    await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], {
      provider, env: {}, out: out.push, err: err.push, runlistHome: tmp(t, 'p6-home-'),
    });
  } finally { restore(); }
  assert.match(out.text(), /SPINE LEAK/, `${out.text()}\n${err.text()}`);
  const branch = git(f.repo, ['branch', '--list', 'bareloop-p6-worktree-job*', '--format=%(refname:short)']);
  assert.match(git(f.repo, ['show', `${branch}:src/mod.mjs`]), /MARKER_OK/, 'the branch holds the work');
  assert.equal(existsSync(f.worktree), false, 'no door: the folder is removed');
});

// the close already passes before any work (a cold already-green): no work branch was made and nothing changed, so the
// folder must not be left behind, and the readout must not claim a branch.
test('run-u --spec on a worktree: an ALREADY-GREEN run removes its folder, makes no branch, and says nothing was changed', async (t) => {
  const f = await session(t, { marked: true });
  const out = sink(); const err = sink();
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], {
    provider: scriptedProvider([{ text: 'never reached' }]), env: {}, out: out.push, err: err.push, runlistHome: tmp(t, 'p6-home-'),
  });
  assert.equal(rc, 0, `${out.text()}\n${err.text()}`);
  assert.match(out.text(), /outcome\s+already-green/);
  assert.equal(existsSync(f.worktree), false, 'the worktree folder is removed');
  assert.doesNotMatch(git(f.repo, ['worktree', 'list']), /sess1/);
  assert.equal(git(f.repo, ['branch', '--list', 'bareloop-p6-worktree-job*']), '', 'no work branch');
  assert.match(out.text(), /WORKTREE\s+nothing was changed \(the close already passed\); the worktree folder is removed/);
});

// C7 (fix-ledger): the RESUMED already-green path. Leg 1 is stopped by the person during the plan phase (the leg ends
// `stopped`, the worktree folder stays); then the person's own edit lands in that worktree, so on resume the close
// already passes: an already-green leg whose worktree holds UNCOMMITTED edits. The work must land on the run's work
// branch (the resumed leg returns to / makes it), never on a detached HEAD, and the folder is removed.
test('run-u --spec on a worktree: a RESUMED already-green leg commits the worktree\'s uncommitted edits ON the work branch, then removes the folder', async (t) => {
  const f = await session(t);
  const home = tmp(t, 'p6-home-');
  /** @type {string|null} */ let spine = null;
  let calls = 0;
  const leg1Provider = {
    name: 'queue',
    async generate() {
      calls += 1;
      if (calls === 2) { spine = readRunList({ home }).rows[0].spine; writeFileSync(stopFilePath(spine), ''); }
      return reply(calls === 1 ? { text: 'scout: nothing' } : { text: planFor() });
    },
  };
  const out1 = sink(); const err1 = sink();
  await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], {
    provider: leg1Provider, env: {}, out: out1.push, err: err1.push, runlistHome: home,
  });
  assert.match(out1.text(), /outcome\s+stopped/, `${out1.text()}\n${err1.text()}`);
  assert.equal(existsSync(join(f.worktree, '.git')), true, 'a stopped leg keeps the folder');
  assert.ok(spine);

  // the person's own edit, uncommitted, makes the close pass
  writeFileSync(join(f.worktree, 'src', 'mod.mjs'), 'export const x = 1;\nMARKER_OK\n');

  const out = sink(); const err = sink();
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec), '--resume', spine], {
    provider: scriptedProvider([{ text: 'never reached' }]), env: {}, out: out.push, err: err.push, runlistHome: home,
  });
  assert.equal(rc, 0, `${out.text()}\n${err.text()}`);
  assert.match(out.text(), /outcome\s+already-green/);
  const branch = git(f.repo, ['branch', '--list', 'bareloop-p6-worktree-job*', '--format=%(refname:short)']);
  assert.match(branch, /^bareloop-p6-worktree-job/, 'the resumed leg works on the run\'s own work branch');
  assert.match(git(f.repo, ['show', `${branch}:src/mod.mjs`]), /MARKER_OK/, 'the uncommitted edit landed ON the branch, not on a detached HEAD');
  assert.equal(existsSync(f.worktree), false, 'the folder is removed');
  assert.doesNotMatch(git(f.repo, ['worktree', 'list']), /sess1/);
  assert.match(out.text(), new RegExp(`WORKTREE\\s+final commit [0-9a-f]+ on ${branch}; the worktree folder is removed`), 'the Ended text for this path, pinned');
});
