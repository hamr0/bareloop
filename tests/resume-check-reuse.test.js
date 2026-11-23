// hamr 2026-11-23 (run mwsfq0pi): a RESUMED leg's start pass (precheck + preflight) may take a check result an earlier leg SAVED for exactly the same files,
// instead of running the suite again. The saved result is a completed command run (any exit code) kept in the carry memo file with the tree identity taken
// before it ran. ONE safety rule: a pass never comes from a saved result. Step exits, the fix-loop judge and the final close are always fresh.
// The command here counts its own runs in a gitignored file, so "spawned N times" is read off the world, never off a mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { treeIdentity } from '../src/kinds.js';
import { readSpine, scriptedProvider, initPatientRepo, patientGitEnv } from './helpers.js';

function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'resume-reuse-'));
  const spineDir = mkdtempSync(join(tmpdir(), 'resume-reuse-spine-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(spineDir, { recursive: true, force: true }); });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\nruns.txt\nignored.txt\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exit(0); }
console.log('FAILED src/fix.js - missing or has no ok marker'); process.exit(1);\n`);
  // a command that records each run of itself (always green); a third argument makes it hang so a limit kills it
  writeFileSync(join(dir, 'counter.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync(new URL('./runs.txt', import.meta.url).pathname, process.argv[2] + '\\n');
if (process.argv[3] === 'hang') setTimeout(() => {}, 20000); else process.exit(0);\n`);
  const seed = initPatientRepo(dir);
  const runs = () => { try { return readFileSync(join(dir, 'runs.txt'), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  return { dir, seed, spineDir, runs };
}

const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({
  name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
}));
const counter = (name, tag, extra = {}) => ({ name, kind: 'command-exit', params: { cmd: 'node', args: ['counter.mjs', tag, ...(extra.hang ? ['hang'] : [])], expectExit: 0, ...(extra.timeoutMs ? { timeoutMs: extra.timeoutMs } : {}) } });

const jobOf = (counters) => ({
  schema: 'job-v1', job: 'resume-check-reuse', description: 'resume reuses a saved check result', provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'],
  goal: 'Create src/fix.js with an ok marker so the check passes.', verdictType: 'green',
  closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], ...counters, { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }, guards[1]] },
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
});

/** a provider whose every call dies like a dropped connection: the leg ends right after its start pass, before any final close */
const dropped = () => ({
  calls: [],
  async generate() { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); },
});

/** one leg. `resumeBranch` null = a cold leg. */
async function leg(ctx, job, provider, resumeBranch, tag) {
  const spine = join(ctx.spineDir, `${tag}.jsonl`);
  const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: ctx.dir, provider, emit: makeSpine(spine), ...(resumeBranch ? { resumeBranch } : {}) });
  const events = readSpine(spine);
  return { outcome, events, branch: events.find((e) => e.type === 'work-branch')?.branch ?? null };
}

const startRed = (ctx) => { writeFileSync(join(ctx.dir, 'src', 'fix.js'), '// started\n'); };
const startGreen = (ctx) => { writeFileSync(join(ctx.dir, 'src', 'fix.js'), '// ok\n'); };
const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: patientGitEnv() });
const WRITE_PLAN = (dir, exit) => scriptedProvider([
  { text: 'scout' },
  { text: JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'write-fix', action: 'Create src/fix.js containing the ok marker.', tools: ['write'], rounds: 6, target: 'src/fix.js', exit }] }) },
  { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'src', 'fix.js'), content: '// ok\n' } }] },
  { text: 'wrote it' },
]);

test('a. resume on the SAME files: the start pass spawns the command 0 more times, and says so in one plain line', async (t) => {
  const ctx = makePatient(t);
  startRed(ctx);
  const job = jobOf([counter('one', 'a'), counter('two', 'a')]);
  const l1 = await leg(ctx, job, dropped(), null, 'l1');
  assert.ok(l1.branch, JSON.stringify(l1.events.filter((e) => e.type === 'escalation')));
  assert.equal(ctx.runs(), 1, 'leg 1: precheck and preflight share one run');
  const l2 = await leg(ctx, job, dropped(), l1.branch, 'l2');
  assert.equal(ctx.runs(), 1, `leg 2's start pass ran the command ${ctx.runs() - 1} more times`);
  const said = l2.events.find((e) => e.type === 'check-reused');
  assert.match(said?.text ?? '', /^Checks not run again: same files as the last check at \d\d:\d\d\.$/);
  for (const n of ['one', 'two']) assert.ok(l2.events.some((e) => e.type === 'check-preflight' && e.name === n), `${n} still has its own preflight record`);
});

test('b1. a 1-byte tracked edit between the legs: the start pass runs the command fresh', async (t) => {
  const ctx = makePatient(t);
  startRed(ctx);
  const job = jobOf([counter('one', 'a')]);
  const l1 = await leg(ctx, job, dropped(), null, 'l1');
  appendFileSync(join(ctx.dir, 'src', 'mod.js'), 'x');
  const l2 = await leg(ctx, job, dropped(), l1.branch, 'l2');
  assert.equal(ctx.runs(), 2, 'the files changed, so leg 2 read them again');
  assert.ok(!l2.events.some((e) => e.type === 'check-reused'));
});

test('b2. a new untracked file between the legs: the start pass runs the command fresh', async (t) => {
  const ctx = makePatient(t);
  startRed(ctx);
  const job = jobOf([counter('one', 'a')]);
  const l1 = await leg(ctx, job, dropped(), null, 'l1');
  writeFileSync(join(ctx.dir, 'src', 'extra.js'), '// new\n');
  const l2 = await leg(ctx, job, dropped(), l1.branch, 'l2');
  assert.equal(ctx.runs(), 2);
  assert.ok(!l2.events.some((e) => e.type === 'check-reused'));
});

test('c. a saved result that would make the precheck SATISFIED is dropped: the precheck runs fresh and nothing says it was reused', async (t) => {
  const ctx = makePatient(t);
  git(ctx.dir, ['branch', 'bareloop-rb']);
  startGreen(ctx);
  const job = jobOf([counter('one', 'a')]);
  const l1 = await leg(ctx, job, dropped(), null, 'l1');
  assert.equal(l1.outcome, 'already-green', JSON.stringify(l1.events.filter((e) => e.type === 'escalation')));
  assert.equal(ctx.runs(), 1);
  const l2 = await leg(ctx, job, dropped(), 'bareloop-rb', 'l2');
  assert.equal(l2.outcome, 'already-green', JSON.stringify(l2.events.filter((e) => e.type === 'escalation')));
  assert.ok(ctx.runs() >= 2, `the precheck judged again fresh (spawned ${ctx.runs() - 1} more times)`);
  assert.ok(!l2.events.some((e) => e.type === 'check-reused'), 'a dropped saved result is never announced');
});

test('d. a step exit and the final close still spawn the command fresh after a reused start pass', async (t) => {
  const ctx = makePatient(t);
  startRed(ctx);
  const job = jobOf([counter('one', 'a')]);
  const l1 = await leg(ctx, job, dropped(), null, 'l1');
  assert.equal(ctx.runs(), 1);
  const l2 = await leg(ctx, job, WRITE_PLAN(ctx.dir, [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'one' }]), l1.branch, 'l2');
  assert.equal(l2.outcome, 'green', JSON.stringify(l2.events.filter((e) => e.type === 'escalation')));
  assert.ok(l2.events.some((e) => e.type === 'check-reused'), 'the start pass used the saved result');
  // start pass 0 + step exit 1 + final close 1 (without the feature: 3)
  assert.equal(ctx.runs() - 1, 2, `leg 2 spawned the command ${ctx.runs() - 1} times`);
});

test('e. a tampered close script is refused close-tampered at the very start, with a reusable saved result sitting in the carry memo', async (t) => {
  const ctx = makePatient(t);
  git(ctx.dir, ['branch', 'bareloop-rb']);
  startRed(ctx);
  const { hashCloseScriptBytes } = await import('../src/close-integrity.js');
  const signedSrc = 'process.exit(0);\n';
  writeFileSync(join(ctx.dir, 'verdict-close.mjs'), signedSrc);
  git(ctx.dir, ['add', '-A']); git(ctx.dir, ['commit', '-q', '-m', 'close']);
  const job = {
    schema: 'job-v1', job: 'resume-reuse-tamper', description: 'x', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'],
    goal: 'x', verdictType: 'green', close: [{ name: 'verdict', cmd: 'node verdict-close.mjs', expect: 0, sha256: hashCloseScriptBytes(signedSrc) }],
    tools: ['read', 'write'], escalation: { mode: 'decision-ready' },
  };
  mkdirSync(join(ctx.dir, '.smoke', 'carry'), { recursive: true });
  writeFileSync(join(ctx.dir, '.smoke', 'carry', 'state.json'), JSON.stringify({ n: 0, base: null, events: [], asks: [], startFailure: null, checks: [{ key: 'k', treeId: await treeIdentity(ctx.dir), code: 0, out: 'ok', ms: 1, at: new Date().toISOString() }] }));
  writeFileSync(join(ctx.dir, 'verdict-close.mjs'), 'process.exit(1); // tampered after signing\n');
  const provider = scriptedProvider([{ text: 'never' }]);
  const l = await leg(ctx, job, provider, 'bareloop-rb', 'l2');
  assert.equal(l.outcome, 'close-tampered');
  assert.equal(provider.calls.length, 0);
});

test('f. a command that TIMED OUT saves nothing: the carry file holds no result, and the next leg runs it fresh', async (t) => {
  const ctx = makePatient(t);
  git(ctx.dir, ['branch', 'bareloop-rb']);
  startRed(ctx);
  const job = jobOf([counter('slow', 'a', { hang: true, timeoutMs: 3000 })]);
  const l1 = await leg(ctx, job, dropped(), null, 'l1');
  assert.ok(l1.events.some((e) => e.type === 'close-precheck'), `the precheck ran and hit the limit: ${JSON.stringify(l1.events.filter((e) => e.type === 'escalation')).slice(0, 600)}`);
  assert.equal(ctx.runs(), 1);
  let saved = [];
  try { saved = JSON.parse(readFileSync(join(ctx.dir, '.smoke', 'carry', 'state.json'), 'utf8')).checks ?? []; } catch { /* no file = nothing saved */ }
  assert.deepEqual(saved, [], 'a timed-out run is never kept');
  await leg(ctx, job, dropped(), 'bareloop-rb', 'l2');
  assert.equal(ctx.runs(), 2, 'leg 2 ran it fresh');
});

test('g. treeIdentity: edit changes it, revert returns it, untracked add/remove, mtime touch and an ignored path leave it equal', async (t) => {
  const ctx = makePatient(t);
  const id0 = await treeIdentity(ctx.dir);
  assert.match(id0, /^[0-9a-f]{64}$/);
  assert.equal(await treeIdentity(ctx.dir), id0, 'repeated reads are equal');
  const mod = join(ctx.dir, 'src', 'mod.js');
  const orig = readFileSync(mod, 'utf8');
  writeFileSync(mod, `${orig}x`);
  const edited = await treeIdentity(ctx.dir);
  assert.notEqual(edited, id0, 'a 1-byte tracked edit');
  writeFileSync(mod, orig);
  assert.equal(await treeIdentity(ctx.dir), id0, 'reverting returns the identity');
  writeFileSync(join(ctx.dir, 'new.js'), '// n\n');
  assert.notEqual(await treeIdentity(ctx.dir), id0, 'a new untracked file');
  rmSync(join(ctx.dir, 'new.js'));
  assert.equal(await treeIdentity(ctx.dir), id0, 'removing it returns the identity');
  const later = new Date(Date.now() + 60_000);
  utimesSync(mod, later, later);
  assert.equal(await treeIdentity(ctx.dir), id0, 'an mtime-only touch is the same files');
  writeFileSync(join(ctx.dir, 'ignored.txt'), 'x');
  writeFileSync(join(ctx.dir, 'runs.txt'), 'x');
  assert.equal(await treeIdentity(ctx.dir), id0, 'a gitignored path is not part of the identity');
  mkdirSync(join(ctx.dir, '.smoke'), { recursive: true });
  writeFileSync(join(ctx.dir, '.smoke', 'book'), 'x');
  assert.equal(await treeIdentity(ctx.dir), id0, 'the arbiter books are left out');
  assert.equal(await treeIdentity(tmpdir()), null, 'no git answer = null, never a throw');
});
