// The one 30-minute limit for an AI-drafted check (hamr, 2026-11-21): drafting seed read, signing gates, the run's
// precheck and final close all run a declared check under the SAME code-owned limit. The AI writes no limit of its own (F393,
// hamr 2026-11-24): a `timeoutMs` on an OLD signed spec is ignored. A hand-written command close keeps its old ceiling (120 s floor x K autoset) byte for byte.
//
// The constant is read off the module namespace (`kinds.CHECK_LIMIT_MS`) so a test never respells the number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as kinds from '../src/kinds.js';
import { resolveCloseTimeoutMs, CLOSE_TIMEOUT_FLOOR_MS } from '../src/closetimeout.js';
import { runJob } from '../src/run.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { createSession } from '../src/panel/authorsession.js';
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';
import { makeRangeWorld } from './range-world.mjs';
import { world, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { gitInPatient } from './helpers.js';
import path from 'node:path';

const LIMIT = kinds.CHECK_LIMIT_MS;

test('the check limit is ONE named constant and the kinds executor defaults to it', () => {
  assert.equal(typeof LIMIT, 'number');
  assert.equal(kinds.DEFAULT_TIMEOUT_MS, LIMIT, 'one number, never a second spelling');
  assert.equal(kinds.effectiveTimeoutMs({}), LIMIT, 'a ctx that names no bound runs under the limit');
});

test('an authored timeoutMs no longer shortens the limit: the one limit binds, whatever an old spec carries (F393)', async () => {
  assert.equal(kinds.effectiveTimeoutMs({ timeoutMsDefault: 7_000 }), 7_000, 'the operator\'s number is the limit');
  // the stage itself: a declared 250 ms would have killed this command under the old rule; now the ctx limit (30 s here) binds and the command finishes
  const dir = mkdtempSync(join(tmpdir(), 'check-limit-ignored-'));
  try {
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    const { execFileSync } = await import('node:child_process');
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'seed');
    const seed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
    const stage = { name: 'tests', kind: 'command-exit', params: { cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},800)'], expectExit: 0, timeoutMs: 250 } };
    const row = await kinds.runStage(stage, { workdir: dir, seedRef: seed, gapKeep: '', timeoutMsDefault: 30_000 });
    assert.equal(row.verdict, 'green', 'the authored 250 ms did not cut the command short');
    const slow = await kinds.runStage({ ...stage, params: { ...stage.params, timeoutMs: 60_000 } }, { workdir: dir, seedRef: seed, gapKeep: '', timeoutMsDefault: 300 });
    assert.equal(slow.verdict, 'instrument-stop', 'and an authored 60 s did not widen it');
    assert.equal(slow.detail.limitMs, 300);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const declaredStages = () => [{ name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['-e', '0'], expectExit: 0 } }];

test('the close timeout of a DECLARED close is the limit, with no timing pass (the pass cannot time a kind stage)', async () => {
  const r = await resolveCloseTimeoutMs({ job: { closeDecl: { stages: declaredStages() } }, stages: declaredStages(), cwd: process.cwd() });
  assert.equal(r.closeTimeoutMs, LIMIT);
  assert.equal(r.timedOut, false);
  assert.equal(r.timing, null);
});

test('a hand-written COMMAND close keeps its old ceiling: the 120 s floor x K autoset, unchanged', async () => {
  const stages = [{ name: 'verdict', cmd: 'node -e 0', expect: 0 }];
  const r = await resolveCloseTimeoutMs({ job: { close: stages }, stages, cwd: process.cwd() });
  assert.equal(r.source, 'estimated');
  assert.equal(r.closeTimeoutMs, CLOSE_TIMEOUT_FLOOR_MS, 'a fast command is still sized by the floor');
  assert.ok(r.timing !== null, 'the timing pass still ran for a command close');
  // a signed override still wins outright for a command close, in either direction
  const o = await resolveCloseTimeoutMs({ job: { close: stages, closeTimeoutMs: 150_000 }, stages, cwd: process.cwd() });
  assert.equal(o.closeTimeoutMs, 150_000);
  assert.equal(o.source, 'override');
});

// ── through the real runner: a declared close, maxWallMs well under the limit ──────────────────────────────────────

function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-limit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'check.mjs'), 'process.exit(1);\n');
  initPatientRepo(dir);
  const spineDir = mkdtempSync(join(tmpdir(), 'check-limit-spine-'));
  t.after(() => rmSync(spineDir, { recursive: true, force: true }));
  return { dir, spine: join(spineDir, 'spine.jsonl') };
}
const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) } }));
const declaredJob = (extra = {}) => ({
  schema: 'job-v1', job: 'check-limit', description: 'a declared close under the check limit', provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'], goal: 'Create src/fix.js.', verdictType: 'green',
  closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }, guards[1]] },
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' }, ...extra,
});

test('runJob: a declared close runs under the limit, and the wall-under-close-timeout refusal does NOT fire for it', async (t) => {
  const { dir, spine } = makePatient(t);
  const WALL = 600_000; // above the static floor, far under the 30 min limit
  assert.ok(WALL < LIMIT);
  const job = declaredJob({ maxWallMs: WALL });
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'no plan' }]);
  const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: dir, provider, emit: makeSpine(spine) });
  const events = readSpine(spine);
  const timing = events.find((e) => e.type === 'close-timing');
  assert.equal(timing?.ceilingMs, LIMIT, 'the close ran under the one limit');
  assert.notEqual(outcome, 'wall-under-close-timeout', 'the limit is code\'s own and is never compared to the Time cap');
  assert.ok(!events.some((e) => e.type === 'escalation' && e.category === 'wall-under-close-timeout'));
});

// ── the panel's signing gates take the limit too ───────────────────────────────────────────────────────────────────

test('the panel session hands the signing gates the limit (no second 5 minute spelling)', async (t) => {
  const w = await world(t, { serve: false });
  const wr = makeRangeWorld(t);
  writeFileSync(path.join(wr.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  gitInPatient(wr.repo, ['add', '-A']);
  gitInPatient(wr.repo, ['commit', '-q', '-m', 'pkg']);
  const seams = draftSeams({});
  /** @type {any} */ let got = null;
  const inner = seams.prepareSigningFn;
  seams.prepareSigningFn = async (/** @type {any} */ o) => { got = o.timeoutMs; return inner(o); };
  const s = createSession(baseCard({ source: wr.repo }), { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  assert.equal(got, LIMIT);
});
