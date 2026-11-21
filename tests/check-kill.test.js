// A check that runs too long, or is abandoned, is killed WHOLE (hamr, 2026-11-21): the check's command runs in its own process
// group (the "box"), and one kill stops the command and everything it started. Today only the command itself (`npm`) is killed and
// its children keep running. The limit is injected short (`timeoutMsDefault`); the group is read back by the pids the fake suite wrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { runStage, seedRead } from '../src/kinds.js';

/** a throwaway repo with the fake suite in it. The suite starts two children — one plain, one that IGNORES SIGTERM — writes their pids
 * to pids.json, then sits idle for a minute (far past any limit injected here). */
function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-kill-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  writeFileSync(join(dir, 'suite.mjs'), `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const plain = spawn(process.execPath, ['-e', 'setTimeout(()=>{},600000)'], { stdio: 'ignore' });
const stubborn = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setTimeout(()=>{},600000)"], { stdio: 'ignore' });
writeFileSync(new URL('./pids.json', import.meta.url).pathname, JSON.stringify([plain.pid, stubborn.pid]));
setTimeout(() => process.exit(0), 60000);
`);
  writeFileSync(join(dir, 'report.txt'), '# tests 1\n');
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'seed');
  const seed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  return { dir, seed };
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** every pid the suite started is gone within a second, or the test names the survivors */
async function assertGone(dir, what) {
  assert.ok(existsSync(join(dir, 'pids.json')), `the fake suite ran and wrote its pids (${what})`);
  const pids = JSON.parse(readFileSync(join(dir, 'pids.json'), 'utf8'));
  for (let i = 0; i < 40 && pids.some(alive); i += 1) await new Promise((r) => { setTimeout(r, 50); });
  const left = pids.filter(alive);
  for (const p of left) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  assert.deepEqual(left, [], `${what}: these test processes were still running after the stop`);
}
const SUITE = { cmd: process.execPath, args: ['suite.mjs'], expectExit: 0 };

test('at the limit the whole group is killed - a child that ignores SIGTERM too', async (t) => {
  const r = repo(t);
  const row = await runStage({ name: 'tests', kind: 'command-exit', params: SUITE }, { workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: 600 });
  assert.equal(row.verdict, 'instrument-stop');
  assert.match(row.gapLines.join('\n'), /did not finish inside 600ms/);
  await assertGone(r.dir, 'limit');
});

test('count-not-worse: its measuring command is killed whole at the limit too', async (t) => {
  const r = repo(t);
  const row = await runStage({ name: 'count', kind: 'count-not-worse', params: { ...SUITE, parser: { lineMatch: 'total (\\d+)', capture: 1 }, scope: {}, direction: 'lower-is-better', baseline: 0 } },
    { workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: 600 });
  assert.equal(row.verdict, 'instrument-stop');
  await assertGone(r.dir, 'count-not-worse');
});

test('an abort signal (Abandon, Stop) kills the whole group at once, and the stop says it was stopped, not timed out', async (t) => {
  const r = repo(t);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 500);
  const t0 = Date.now();
  const row = await runStage({ name: 'tests', kind: 'command-exit', params: SUITE }, { workdir: r.dir, seedRef: r.seed, gapKeep: '', signal: ac.signal });
  assert.ok(Date.now() - t0 < 10_000, 'it did not wait for the limit');
  assert.equal(row.verdict, 'instrument-stop');
  assert.doesNotMatch(row.gapLines.join('\n'), /did not finish inside/);
  assert.match(row.gapLines.join('\n'), /stopped/i);
  await assertGone(r.dir, 'abort');
});

test('a signal already raised never starts the command', async (t) => {
  const r = repo(t);
  const ac = new AbortController(); ac.abort();
  const row = await runStage({ name: 'tests', kind: 'command-exit', params: SUITE }, { workdir: r.dir, seedRef: r.seed, gapKeep: '', signal: ac.signal });
  assert.equal(row.verdict, 'instrument-stop');
  assert.equal(existsSync(join(r.dir, 'pids.json')), false);
});

test('the process dying (a watchdog kill, ^C) takes the box with it: the test processes never outlive their owner', async (t) => {
  const r = repo(t);
  const owner = spawn(process.execPath, ['--input-type=module', '-e', `
    import { seedRead } from ${JSON.stringify(new URL('../src/kinds.js', import.meta.url).href)};
    await seedRead({ stages: [{ name: 'tests', kind: 'command-exit', params: ${JSON.stringify(SUITE)} }] }, { workdir: ${JSON.stringify(r.dir)}, seedRef: ${JSON.stringify(r.seed)}, gapKeep: '' });
  `], { stdio: 'ignore' });
  for (let i = 0; i < 100 && !existsSync(join(r.dir, 'pids.json')); i += 1) await new Promise((res) => { setTimeout(res, 50); });
  assert.ok(existsSync(join(r.dir, 'pids.json')), 'the owner started the suite');
  owner.kill('SIGTERM');
  await new Promise((res) => { owner.on('exit', res); });
  await assertGone(r.dir, 'owner killed');
});

// ── Abandon (the panel): a draft's running check is killed with the draft ──────────────────────────────────────────
import path from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { makeRangeWorld } from './range-world.mjs';
import { world, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { gitInPatient } from './helpers.js';

async function panelWorld(t) {
  const w = await world(t, { serve: false });
  const wr = makeRangeWorld(t);
  writeFileSync(path.join(wr.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  gitInPatient(wr.repo, ['add', '-A']);
  gitInPatient(wr.repo, ['commit', '-q', '-m', 'pkg']);
  return { w, repo: wr.repo };
}
const opts = (w, seams) => ({ env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams });
const raised = (signal) => new Promise((res) => { if (signal.aborted) res(); else signal.addEventListener('abort', () => res(), { once: true }); });

test('Abandon during the signing gates raises the abort the gates\' running check listens to', async (t) => {
  const { w, repo: src } = await panelWorld(t);
  const seams = draftSeams({});
  /** @type {any} */ let signal = null; let waiting = null;
  const inner = seams.prepareSigningFn;
  seams.prepareSigningFn = async (o) => { signal = o.signal; waiting = raised(o.signal); await waiting; return inner(o); };
  const s = createSession(baseCard({ source: src }), opts(w, seams));
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => signal !== null), 'the gates started');
  assert.equal(signal.aborted, false, 'a live draft is not aborted');
  assert.equal(s.abandon().ok, true);
  await waiting;
  assert.equal(signal.aborted, true);
  assert.equal(s.state.phase, 'abandoned');
});

test('Abandon during drafting raises the abort the drafting seed read\'s running check listens to', async (t) => {
  const { w, repo: src } = await panelWorld(t);
  const seams = draftSeams({});
  /** @type {any} */ let signal = null; let waiting = null;
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { signal = o.closeCtx?.signal ?? null; if (signal) { waiting = raised(signal); await waiting; } return inner(o); };
  const s = createSession(baseCard({ source: src }), opts(w, seams));
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => signal !== null), 'drafting started, and its seed read was handed a signal');
  assert.equal(signal.aborted, false);
  assert.equal(s.abandon().ok, true);
  await waiting;
  assert.equal(signal.aborted, true);
});

// ── Stop (a run): the person's Stop kills the running check whole and the run ends `stopped` ────────────────────────
import { mkdirSync } from 'node:fs';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

test('runPlan: Stop while a declared check runs kills the check\'s whole group at once, and the run ends stopped', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-kill-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'check.mjs'), readFileSync(join(repo(t).dir, 'suite.mjs'), 'utf8'));
  initPatientRepo(dir);
  const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) } }));
  const job = {
    schema: 'job-v1', job: 'check-kill', description: 'a hanging declared check', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5,
    writeScope: ['src/**'], goal: 'Create src/fix.js.', verdictType: 'green',
    closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }, guards[1]] },
    tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
  };
  const jv = validateJob(job, { shellCapUsd: job.budgetUsd });
  assert.deepEqual(jv.reds, []);
  const stopDir = mkdtempSync(join(tmpdir(), 'check-kill-stop-'));
  t.after(() => rmSync(stopDir, { recursive: true, force: true }));
  const stopFile = join(stopDir, 'stop');
  // the person presses Stop once the check is really running (its pids are on disk)
  const presser = setInterval(() => { if (existsSync(join(dir, 'pids.json'))) { writeFileSync(stopFile, 'stop\n'); clearInterval(presser); } }, 50);
  t.after(() => clearInterval(presser));
  const events = [];
  const t0 = Date.now();
  const outcome = await runPlan(jv.job, { workdir: dir, provider: scriptedProvider([{ text: 'scout' }]), emit: (type, data = {}) => { events.push({ type, ...data }); }, remainingUsd: () => 1.5, stopFile });
  assert.equal(outcome, 'stopped', JSON.stringify(events.filter((e) => e.type === 'escalation')));
  assert.ok(Date.now() - t0 < 30_000, 'the run did not wait for the check');
  assert.ok(events.some((e) => e.type === 'stop-requested' && e.phase === 'close'), 'the stop is on the spine');
  assert.equal(existsSync(stopFile), false, 'the request was consumed');
  await assertGone(dir, 'run stop');
});
