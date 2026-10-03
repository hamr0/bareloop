// PANEL-BUILD.md P5 item 5 — STOP, the engine half. A stop request is a FILE `<spine>.stop`; the engine reads it at
// the round-boundary seam (where the money cap binds), emits `stop-requested`, and ends the leg `stopped`
// (a checkpoint outcome: resumable, the SAME run continues as a new leg). Driven through the real engine
// (`startRun` / `resumeRun`, in-process) with a scripted provider and a scratch home — never the real one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun, resumeRun } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { legsOf, parseSpineText, stopFilePath } from '../src/legs.js';
import { CHECKPOINT_OUTCOMES } from '../src/reuse.js';
import { reply } from './helpers.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'p5-stop-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tcall = (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ args) => ({ id, name, arguments: args });

const PLAN = {
  schema: 'plan-v1',
  steps: [
    { id: 'one', action: 'Write src/a.mjs.', tools: ['write'], rounds: 4, target: 'src/a.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }] },
    { id: 'two', action: 'Write src/b.mjs.', tools: ['write'], rounds: 4, target: 'src/b.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }] },
    { id: 'three', action: 'Write src/c.mjs.', tools: ['write'], rounds: 4, target: 'src/c.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }] },
  ],
};

/** a patient repo + a signed three-step spec whose close greens once src/c.mjs exists */
function fixture(t, closeFile = 'c.mjs') {
  const workdir = join(tmp(t), 'patient');
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'p5@example.com']);
  git(workdir, ['config', 'user.name', 'p5']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const closeSource = `import { existsSync } from 'node:fs';\nconst ok = existsSync(${JSON.stringify(join(workdir, 'src', closeFile))});\nconsole.log(ok ? 'ok' : 'FAILED: src/${closeFile} is missing');\nprocess.exit(ok ? 0 : 1);\n`;
  const closePath = join(tmp(t), 'close.mjs');
  writeFileSync(closePath, closeSource);
  const spec = {
    schema: 'job-v1', job: 'p5-stop-fixture', description: 'P5 stop fixture.',
    provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Write src/a.mjs and src/b.mjs.', verdictType: 'green',
    close: [{ name: 'has-c', cmd: `node ${closePath}`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  return { workdir, seed, spec };
}

/** a provider that plays a queue (sticking on the last entry) and runs `onCall(n)` first */
function queueProvider(/** @type {{queue: any[], onCall?: (n: number) => void}} */ s) {
  let n = 0;
  return {
    name: 'queue',
    async generate() {
      n += 1;
      s.onCall?.(n);
      const e = s.queue[Math.min(n - 1, s.queue.length - 1)];
      return reply(e);
    },
  };
}

/** @param {any} f @param {any} provider @param {string} home */
async function leg1(f, provider, home) {
  /** @type {string[]} */ const outs = [];
  const code = await startRun(f.spec, {
    workdir: f.workdir, seed: f.seed, spineName: 'p5-stop-fixture-bareloop', approve: jobSpecHash(f.spec),
    deps: { provider, env: {}, out: (s) => outs.push(s), err: (s) => outs.push(s), runlistHome: home },
  });
  return { code, out: outs.join('\n') };
}

test('item 5: a stop request during step 1 of 3 ends the leg `stopped` at the round boundary; the stop file is consumed; the SAME run resumes (re-entering that step) as leg 2', async (t) => {
  const home = tmp(t);
  const f = fixture(t);
  /** @type {string|null} */ let spine = null;
  const provider = queueProvider({
    queue: [
      { text: 'scout: nothing' }, { text: JSON.stringify(PLAN) },
      { toolCalls: [tcall('w1', 'shell_write', { path: join(f.workdir, 'src', 'a.mjs'), content: 'export const a = 1;\n' })] },
      { text: 'step one done' },
      { text: 'never reached' },
    ],
    // the person clicks Stop while step one is running: the panel's route writes exactly this file
    onCall: (n) => {
      if (n === 3) {
        spine = readRunList({ home }).rows[0].spine;
        writeFileSync(stopFilePath(spine), '');
      }
    },
  });
  const first = await leg1(f, provider, home);
  assert.ok(spine, 'the run was listed while it ran');
  const recs1 = parseSpineText(readFileSync(spine, 'utf8')).records;
  const types = recs1.map((r) => r.type);
  assert.ok(types.includes('stop-requested'), `the stop is recorded — ${types.join(',')}`);
  const end = recs1.findLast((r) => r.type === 'job-end');
  assert.equal(end.outcome, 'stopped');
  assert.equal(end.spendComplete, true, 'cut at a round boundary with nothing in flight: the spend is exact');
  assert.ok(types.indexOf('stop-requested') < types.lastIndexOf('job-end'));
  assert.equal(recs1.filter((r) => r.type === 'step-start').length, 1, 'step two was never started');
  assert.notEqual(first.code, undefined);
  assert.equal(existsSync(stopFilePath(spine)), false, 'the stop file is consumed when the leg ends — a later leg must not stop at once');
  assert.ok(CHECKPOINT_OUTCOMES.includes('stopped'), '`stopped` is a checkpoint outcome');

  // a request that raced the leg's end is still on disk when the person resumes: leg 2 must clear it at its
  // start, never stop at once on a request that belonged to the leg before
  writeFileSync(stopFilePath(spine), '');

  // leg 2: the SAME run, the next step
  // (the stale file planted above would stop it at its first round — if it were not cleared at leg start)
  const queue2 = [
    { toolCalls: [tcall('w1b', 'shell_write', { path: join(f.workdir, 'src', 'a.mjs'), content: 'export const a = 1;\n' })] },
    { text: 'step one done' },
    { toolCalls: [tcall('w2', 'shell_write', { path: join(f.workdir, 'src', 'b.mjs'), content: 'export const b = 2;\n' })] },
    { text: 'step two done' },
    { toolCalls: [tcall('w3', 'shell_write', { path: join(f.workdir, 'src', 'c.mjs'), content: 'export const c = 3;\n' })] },
    { text: 'step three done' },
  ];
  /** @type {string[]} */ const outs = [];
  const code2 = await resumeRun(spine, {
    spec: f.spec, workdir: f.workdir, seed: f.seed, spineName: 'p5-stop-fixture-bareloop', approve: jobSpecHash(f.spec),
    deps: { provider: queueProvider({ queue: queue2 }), env: {}, out: (s) => outs.push(s), err: (s) => outs.push(s), runlistHome: home },
  });
  const all = parseSpineText(readFileSync(spine, 'utf8')).records;
  const legs = legsOf(all);
  assert.equal(legs.length, 2, `one run, two legs — ${outs.join('\n').slice(-600)}`);
  assert.equal(legs[0].outcome, 'stopped');
  assert.equal(legs[1].after, 'stopped', 'the marker says how the previous leg ended');
  assert.deepEqual(legs[1].records.filter((r) => r.type === 'step-start').map((r) => r.step), ['one', 'two', 'three'], 'a mid-step stop re-enters the step it cut (like a cap-halt), then goes on');
  assert.equal(legs[1].outcome, 'green', `code ${code2}`);
  assert.equal(readRunList({ home }).rows.length, 1, 'one run row');
  assert.deepEqual(readdirSync(join(spine, '..')).filter((n) => /^u-.*\.jsonl$/.test(n) && !n.includes('gate-audit') && !n.includes('lag')).length, 1, 'one spine file');
});

const PLAN_ONE = {
  schema: 'plan-v1',
  steps: [{ id: 'only', action: 'Write src/a.mjs and src/a2.mjs.', tools: ['write'], rounds: 6, target: 'src/a2.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }] }],
};

test('item 5 (the money-cap seam): a ONE-step run is stopped MID-STEP between rounds — `stopped`, exact spend — and resume re-enters the SAME step on the SAME run and greens', async (t) => {
  const home = tmp(t);
  const f = fixture(t, 'a2.mjs');
  /** @type {string|null} */ let spine = null;
  const w = (id, name) => ({ toolCalls: [tcall(id, 'shell_write', { path: join(f.workdir, 'src', name), content: `export const v = '${id}';\n` })] });
  const provider = queueProvider({
    queue: [{ text: 'scout: nothing' }, { text: JSON.stringify(PLAN_ONE) }, w('w1', 'a.mjs'), w('w2', 'a2.mjs'), { text: 'never reached' }],
    // Stop is clicked while the model is working on round 1 of the only step
    onCall: (n) => { if (n === 3) { spine = readRunList({ home }).rows[0].spine; writeFileSync(stopFilePath(spine), ''); } },
  });
  let calls = 0;
  const counted = { ...provider, async generate(...a) { calls += 1; return provider.generate(...a); } };
  await leg1(f, counted, home);
  assert.ok(spine);
  const recs = parseSpineText(readFileSync(spine, 'utf8')).records;
  const end = recs.findLast((r) => r.type === 'job-end');
  assert.equal(end.outcome, 'stopped', 'a one-step run CAN be stopped');
  assert.equal(end.spendComplete, true, 'cut between rounds with nothing in flight: exact');
  const sr = recs.find((r) => r.type === 'stop-requested');
  assert.ok(sr, 'stop-requested is recorded');
  assert.equal(sr.step, 'only');
  assert.equal(typeof sr.round, 'number');
  assert.equal(calls, 3, 'scout, plan, ONE worker round — no second round was bought after the request');
  assert.equal(recs.filter((r) => r.type === 'step-end' && r.outcome === 'green').length, 0, 'the step did not finish');
  assert.equal(existsSync(stopFilePath(spine)), false, 'consumed');

  const queue2 = [w('w3', 'a.mjs'), w('w4', 'a2.mjs'), { text: 'done' }];
  await resumeRun(spine, {
    spec: f.spec, workdir: f.workdir, seed: f.seed, spineName: 'p5-stop-fixture-bareloop', approve: jobSpecHash(f.spec),
    deps: { provider: queueProvider({ queue: queue2 }), env: {}, out: () => {}, err: () => {}, runlistHome: home },
  });
  const legs = legsOf(parseSpineText(readFileSync(spine, 'utf8')).records);
  assert.equal(legs.length, 2, 'one run, two legs');
  assert.equal(legs[0].outcome, 'stopped');
  assert.deepEqual(legs[1].records.filter((r) => r.type === 'step-start').map((r) => r.step), ['only'], 'resume re-enters the SAME step');
  assert.equal(legs[1].outcome, 'green');
  assert.equal(readRunList({ home }).rows.length, 1);
});
