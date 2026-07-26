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
  // The failures must sit in the ELIDED MIDDLE of a long output, or the test
  // proves nothing: the gap bound keeps ~400 head + ~1500 tail bytes verbatim,
  // so on a short output the FAILED lines ride through whether gapKeep exists or
  // not, and the assertion passes vacuously (a smoke test in disguise). Real
  // suites are exactly this shape — F28 was minted on a 67KB one.
  writeFileSync(join(wd, 'noisy.mjs'), `const pad = (tag) => { for (let i = 0; i < 200; i++) console.log(tag + ' filler line ' + i + ' ................................'); };
pad('head'); console.log("FAILED: a"); pad('mid'); console.log("FAILED: b"); pad('tail'); process.exit(1);\n`);
  writeFileSync(join(wd, 'empty.mjs'), 'console.log("collected 0 items"); process.exit(0);\n');
  const keep = runStages([{ name: 'noisy', cmd: 'node noisy.mjs', expect: 0, gapKeep: '^FAILED' }], (s) => s, { cwd: wd });
  assert.ok(keep.gap.includes('filler line 0') && !keep.gap.includes('mid filler line 100'),
    'precondition: the output really was long enough to elide — otherwise gapKeep is not what surfaced anything');
  assert.match(keep.gap, /FAILED: a[\s\S]*FAILED: b/, 'the stage\'s own gapKeep surfaced its failures out of the elided middle');

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

test('a stage is judged against its OWN expect code — a non-zero contract is truth, and exit 0 against it is the red', (t) => {
  const { wd } = patient(t);
  // Not academic: an inspection stage may be a tool whose "nothing to report"
  // code is not 0 (a diff that must find no changes, a grep that must miss). The
  // stage declares what truth looks like; the shell never assumes zero.
  writeFileSync(join(wd, 'three.mjs'), 'console.log("no differences"); process.exit(3);\n');
  const ok = runStages([{ name: 'no-diff', cmd: 'node three.mjs', expect: 3 }], (s) => s, { cwd: wd });
  assert.equal(ok.verdict, 'satisfied', 'exit 3 against expect 3 is the stage passing');

  writeFileSync(join(wd, 'zero.mjs'), 'console.log("differences found"); process.exit(0);\n');
  const red = runStages([{ name: 'no-diff', cmd: 'node zero.mjs', expect: 3 }], (s) => s, { cwd: wd });
  assert.equal(red.verdict, 'needs_revision', 'and exit 0 against expect 3 is the stage failing — never the reverse');
  assert.equal(red.stage, 'no-diff');
});
