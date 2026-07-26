// Module 2 of the staged close: RUNNING the stage list. The close is every
// stage in order (first red is the verdict); a derived check is its own chain
// (prerequisites first). Real spawned scripts — the close is a command whose
// exit code is truth, so a mocked runner would test nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStages } from '../src/ralph.js';
import { checkMenu } from '../src/job.js';

/** a workdir whose stages pass or fail on demand, through real processes */
function patient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'staged-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  const stage = (name, { pass = true, out = '' } = {}) => {
    writeFileSync(join(wd, `${name}.mjs`), `console.log(${JSON.stringify(out || name + ' ran')}); process.exit(${pass ? 0 : 1});\n`);
    return { name, cmd: `node ${name}.mjs`, expect: 0 };
  };
  return { wd, stage };
}

test('the close is EVERY stage, in order — all green means green, and the record names each stage that ran', (t) => {
  const { wd, stage } = patient(t);
  const stages = [stage('one'), stage('two'), stage('three')];
  const r = runStages(stages, (s) => s, { cwd: wd });
  assert.equal(r.verdict, 'satisfied');
  assert.deepEqual(r.stages.map((s) => `${s.name}:${s.verdict}`), ['one:satisfied', 'two:satisfied', 'three:satisfied']);
});

test('the FIRST red is the verdict and the run stops there — a later stage never runs, so it can never mask the failure', (t) => {
  const { wd, stage } = patient(t);
  const stages = [stage('one'), stage('two', { pass: false, out: 'FAILED: two is broken' }), stage('three')];
  const r = runStages(stages, (s) => s, { cwd: wd });
  assert.equal(r.verdict, 'needs_revision');
  assert.equal(r.stage, 'two', 'the record names the stage that rendered the verdict');
  assert.match(r.gap, /FAILED: two is broken/, 'the gap is that stage\'s own output');
  assert.deepEqual(r.stages.map((s) => s.name), ['one', 'two'], 'stage three never ran');
});

test('the gap NAMES the failing stage — the worker is told which wall it hit, and the close still never names a culprit file (v1.12/F28)', (t) => {
  const { wd, stage } = patient(t);
  const r = runStages([stage('typecheck'), stage('suite', { pass: false, out: 'FAILED: 3 assertions' })], (s) => s, { cwd: wd });
  assert.match(r.gap, /suite/, 'which stage failed is mechanical information the worker needs');
  assert.match(r.gap, /FAILED: 3 assertions/);
});

test('a stage FAULT (cannot run) is a fault, not a red — a close that never rendered an opinion is an instrument stop', (t) => {
  const { wd, stage } = patient(t);
  const r = runStages([stage('one'), { name: 'ghost', cmd: 'definitely-not-a-real-binary-xyz', expect: 0 }], (s) => s, { cwd: wd });
  assert.equal(r.verdict, 'failed', 'the fault verdict rides out unchanged — CLOSE_FAULTS routes it');
  assert.equal(r.stage, 'ghost');
});

test('per-stage gapKeep and judged apply to their OWN stage — the floor that was not met is named by the stage that declared it', (t) => {
  const { wd } = patient(t);
  writeFileSync(join(wd, 'noisy.mjs'), 'console.log("noise"); console.log("FAILED: a"); console.log("more noise"); console.log("FAILED: b"); process.exit(1);\n');
  writeFileSync(join(wd, 'empty.mjs'), 'console.log("collected 0 items"); process.exit(0);\n');
  const keep = runStages([{ name: 'noisy', cmd: 'node noisy.mjs', expect: 0, gapKeep: '^FAILED' }], (s) => s, { cwd: wd });
  assert.match(keep.gap, /FAILED: a[\s\S]*FAILED: b/, 'the stage\'s own gapKeep surfaced its failures');

  const floor = runStages([{ name: 'empty', cmd: 'node empty.mjs', expect: 0, judged: { pattern: 'collected (\\d+) items', min: 1 } }], (s) => s, { cwd: wd });
  assert.equal(floor.verdict, 'crashed', 'an exit-0 stage that judged nothing is a fake green, caught by its own floor');
  assert.equal(floor.stage, 'empty');
});

test('a derived check runs its chain: the prerequisite FIRST, then the stage — alone it would red for a reason unrelated to the work', (t) => {
  const { wd, stage } = patient(t);
  // `api` only passes if `build` ran first (it reads what build wrote)
  writeFileSync(join(wd, 'build.mjs'), 'import {writeFileSync} from "node:fs"; writeFileSync(new URL("./built.txt", import.meta.url), "x"); process.exit(0);\n');
  writeFileSync(join(wd, 'api.mjs'), 'import {existsSync} from "node:fs"; if (!existsSync(new URL("./built.txt", import.meta.url))) { console.log("FAILED: nothing was built"); process.exit(1); } process.exit(0);\n');
  const close = [
    stage('seed', {}),
    { name: 'build', cmd: 'node build.mjs', expect: 0 },
    { name: 'api', cmd: 'node api.mjs', expect: 0, needs: ['build'] },
  ];
  const menu = checkMenu(close);
  const api = menu.find((m) => m.name === 'api');
  const r = runStages(api.run, (s) => s, { cwd: wd });
  assert.equal(r.verdict, 'satisfied', 'the chain ran build first, so api judged the real thing');
  assert.deepEqual(r.stages.map((s) => s.name), ['build', 'api']);

  rmSync(join(wd, 'built.txt'));
  const alone = runStages([close[2]], (s) => s, { cwd: wd });
  assert.equal(alone.verdict, 'needs_revision', 'and WITHOUT the chain it reds — which is exactly the phantom needs exists to prevent');
});

test('a prerequisite that fails stops the check there and says so — the worker is never told the ruler failed when the setup did', (t) => {
  const { wd, stage } = patient(t);
  const close = [stage('build', { pass: false, out: 'FAILED: build broke' }), { name: 'api', cmd: 'node build.mjs', expect: 0, needs: ['build'] }];
  const r = runStages(checkMenu(close).find((m) => m.name === 'api').run, (s) => s, { cwd: wd });
  assert.equal(r.stage, 'build', 'the stage that actually failed is the one named');
  assert.match(r.gap, /FAILED: build broke/);
});

test('the scrub runs on every stage, not just the first — a secret echoed by stage three never reaches the spine', (t) => {
  const { wd, stage } = patient(t);
  const scrub = (s) => s.replace(/ghp_[A-Za-z0-9]+/g, '<redacted>');
  const stages = [stage('one'), { name: 'leaky', cmd: 'node leaky.mjs', expect: 0 }];
  writeFileSync(join(wd, 'leaky.mjs'), 'console.log("token ghp_abcdefghijklmnopqrstuv leaked"); process.exit(1);\n');
  const r = runStages(stages, scrub, { cwd: wd });
  assert.doesNotMatch(r.gap, /ghp_abcdefghijklmnopqrstuv/, 'redaction is at capture, on every stage');
  assert.match(r.gap, /<redacted>/);
});
