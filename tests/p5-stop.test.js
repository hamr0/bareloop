// PANEL-BUILD.md P5 item 5 — STOP, the engine half. A stop request is a FILE `<spine>.stop`; the engine reads it at
// the between-steps seam (where the wall deadline is read), emits `stop-requested`, and ends the leg `stopped`
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
function fixture(t) {
  const workdir = join(tmp(t), 'patient');
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'p5@example.com']);
  git(workdir, ['config', 'user.name', 'p5']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const closeSource = `import { existsSync } from 'node:fs';\nconst ok = existsSync(${JSON.stringify(join(workdir, 'src', 'c.mjs'))});\nconsole.log(ok ? 'ok' : 'FAILED: src/c.mjs is missing');\nprocess.exit(ok ? 0 : 1);\n`;
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

test('item 5: a stop request ends the leg `stopped` BETWEEN steps; the stop file is consumed; the SAME run resumes at the next step as leg 2', async (t) => {
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
  assert.equal(end.spendComplete, true, 'read between steps with nothing in flight: the spend is exact');
  assert.ok(types.indexOf('stop-requested') < types.lastIndexOf('job-end'));
  assert.equal(recs1.filter((r) => r.type === 'step-start').length, 1, 'step two was never started');
  assert.notEqual(first.code, undefined);
  assert.equal(existsSync(stopFilePath(spine)), false, 'the stop file is consumed when the leg ends — a later leg must not stop at once');
  assert.ok(CHECKPOINT_OUTCOMES.includes('stopped'), '`stopped` is a checkpoint outcome');

  // a request that raced the leg's end is still on disk when the person resumes: leg 2 must clear it at its
  // start, never stop at once on a request that belonged to the leg before
  writeFileSync(stopFilePath(spine), '');

  // leg 2: the SAME run, the next step
  // (the stale file planted above would stop it after step two — if it were not cleared at leg start)
  const queue2 = [
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
  assert.deepEqual(legs[1].records.filter((r) => r.type === 'step-start').map((r) => r.step), ['two', 'three'], 'it picks up at the NEXT step, never re-pays step one');
  assert.equal(legs[1].outcome, 'green', `code ${code2}`);
  assert.equal(readRunList({ home }).rows.length, 1, 'one run row');
  assert.deepEqual(readdirSync(join(spine, '..')).filter((n) => /^u-.*\.jsonl$/.test(n) && !n.includes('gate-audit') && !n.includes('lag')).length, 1, 'one spine file');
});
