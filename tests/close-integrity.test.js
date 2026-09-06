// Close integrity — PRD item 27 / M1, `docs/product/CLOSE-INTEGRITY-BUILD.md`.
// Three parts:
//   (a) F129 repo-wide pin — every scripts/*-close.mjs that defines a WORKDIR
//       constant judges process.cwd(), never a hardcoded absolute path.
//   (b) close-absolute-path as a $0 run-start precheck (not just export) —
//       proven with a scripted provider that must never be called, and
//       mutation-proven by excising the guard from a scratch copy of the
//       source and showing the SAME scenario then calls the provider.
//   (c) the honest escalation tail — `resumable:false` (the bundle CLI, F130)
//       never names `--resume`; `run-u`'s default (`resumable:true`) still
//       does, byte-identical to before this build.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { readCloseScripts, checkCloseAbsolutePaths, absolutePathLiteralsOf } from '../src/close-integrity.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

const collector = () => {
  /** @type {any[]} */
  const events = [];
  return { events, emit: (/** @type {string} */ type, /** @type {any} */ data = {}) => { events.push({ type, ...data }); } };
};

// ---------------------------------------------------------------------------
// (a) F129 repo-wide — every close script that defines a WORKDIR constant
// must set it via process.cwd(), never a hardcoded absolute path.
//
// SCOPED to WORKDIR, not every absolute-looking literal in every close
// script: `types-close.mjs`, `testgen-close.mjs`, `testgen-cold-check-close.mjs`
// and `l2poc-check-close.mjs` still hardcode a `SPINE_DIR` (a log/pristine-copy
// location the arbiter deliberately keeps OUTSIDE the patient tree — never the
// cwd-judging bug F129 names), and `u-pulselog-close.mjs`'s `--workdir`
// DEFAULT is a deliberate hash-stable fallback per its own header comment.
// Both are flagged as a divergence in this build's report, not silently
// swept into this pin.
// ---------------------------------------------------------------------------

const CLOSE_SCRIPT_FILES = readdirSync(join(REPO_ROOT, 'scripts')).filter((f) => f.endsWith('-close.mjs'));

test('F129: scripts/*-close.mjs — a close script judges the cwd the runner gives it, never a hardcoded /home/ WORKDIR', () => {
  assert.ok(CLOSE_SCRIPT_FILES.length >= 9, 'sanity: the scripts/ directory listing must not come back empty');
  const checked = [];
  for (const f of CLOSE_SCRIPT_FILES) {
    const src = readFileSync(join(REPO_ROOT, 'scripts', f), 'utf8');
    const m = src.match(/^const WORKDIR = (.+);/m);
    if (!m) continue; // u-pulselog-close.mjs: WORKDIR is a multi-line --workdir-derived const, pinned separately below
    checked.push(f);
    assert.match(m[1], /^process\.cwd\(\)/, `${f}: WORKDIR must read process.cwd() (F129), got: ${m[1]}`);
    assert.doesNotMatch(m[1], /\/home\//, `${f}: WORKDIR line must never bake in an absolute /home/ literal (F129)`);
  }
  // the 8 scripts this build fixed, plus u-spawner-close.mjs fixed in 3b987d4
  assert.equal(checked.length, 9, `expected exactly 9 single-line-WORKDIR close scripts, got: ${JSON.stringify(checked)}`);
});

test('F129 regression pin: u-pulselog-close.mjs already takes --workdir (no change needed)', () => {
  const src = readFileSync(join(REPO_ROOT, 'scripts', 'u-pulselog-close.mjs'), 'utf8');
  assert.match(src, /process\.argv\.indexOf\('--workdir'\)/, 'must still support the --workdir override this build left untouched');
});

// ---------------------------------------------------------------------------
// (b) close-absolute-path — unit level (readCloseScripts / checkCloseAbsolutePaths)
// ---------------------------------------------------------------------------

test('readCloseScripts: resolves a relative "node <path>" cmd against cwd and reads its bytes', (t) => {
  const dir = tmp(t, 'close-integrity-read-');
  writeFileSync(join(dir, 'x-close.mjs'), 'process.exit(0)\n');
  const spec = { close: [{ name: 'verdict', cmd: 'node x-close.mjs', expect: 0 }] };
  const scripts = readCloseScripts(spec, dir);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].path, join(dir, 'x-close.mjs'));
  assert.equal(scripts[0].bytes, 'process.exit(0)\n');
});

test('readCloseScripts: a missing script reports bytes:null rather than throwing (a distinct fault from tampered)', (t) => {
  const dir = tmp(t, 'close-integrity-read-');
  const spec = { close: [{ name: 'verdict', cmd: 'node nope.mjs', expect: 0 }] };
  const scripts = readCloseScripts(spec, dir);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].bytes, null);
});

test('readCloseScripts: a non-"node" cmd (a .sh script) is out of scope, same as src/bundle.js', (t) => {
  const dir = tmp(t, 'close-integrity-read-');
  const spec = { close: [{ name: 'verdict', cmd: `${join(dir, 'x.sh')}`, expect: 0 }] };
  const scripts = readCloseScripts(spec, dir);
  assert.deepEqual(scripts, []);
});

test('checkCloseAbsolutePaths: a close script baking in an existing absolute path reds close-absolute-path', (t) => {
  const dir = tmp(t, 'close-integrity-check-');
  const bakedDir = tmp(t, 'close-integrity-baked-');
  writeFileSync(join(dir, 'x-close.mjs'), `const WORKDIR = '${bakedDir}';\nprocess.exit(0);\n`);
  const spec = { close: [{ name: 'verdict', cmd: 'node x-close.mjs', expect: 0 }] };
  const r = checkCloseAbsolutePaths(spec, dir);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].literal, bakedDir);
  assert.equal(r.reds[0].stage, 'verdict');
});

test('checkCloseAbsolutePaths: a clean script (process.cwd()) passes', (t) => {
  const dir = tmp(t, 'close-integrity-check-');
  writeFileSync(join(dir, 'x-close.mjs'), 'const WORKDIR = process.cwd();\nprocess.exit(0);\n');
  const spec = { close: [{ name: 'verdict', cmd: 'node x-close.mjs', expect: 0 }] };
  const r = checkCloseAbsolutePaths(spec, dir);
  assert.deepEqual(r, { ok: true });
});

test('checkCloseAbsolutePaths: a missing script is NOT reported here (broken-close\'s job once the close tries to run it)', (t) => {
  const dir = tmp(t, 'close-integrity-check-');
  const spec = { close: [{ name: 'verdict', cmd: 'node nope.mjs', expect: 0 }] };
  const r = checkCloseAbsolutePaths(spec, dir);
  assert.deepEqual(r, { ok: true });
});

// ---------------------------------------------------------------------------
// (b) close-absolute-path — integration: runPlan refuses at $0, BEFORE any
// provider call. `provider.calls.length === 0` is the load-bearing assertion:
// a red that fires after even one round would mean the precheck ran too late.
// ---------------------------------------------------------------------------

/** a throwaway git patient — the work-branch/close machinery both need one */
function makePatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'close-integrity-patient-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'src'), { recursive: true });
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  execFileSync('git', ['add', '-A'], { cwd: wd });
  execFileSync('git', ['commit', '-q', '-m', 'src', '--allow-empty'], { cwd: wd });
  return wd;
}

const JOB_WITH_CLOSE = (/** @type {string} */ closeCmd) => ({
  schema: 'job-v1',
  job: 'close-integrity-patient',
  description: 'close-integrity M1(b) fixture',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Append a line to src/mod.mjs.',
  verdictType: 'green',
  close: [{ name: 'verdict', cmd: closeCmd, expect: 0 }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});

test('runPlan: a close script baking in an existing absolute path is refused close-absolute-path at $0 — the provider is NEVER called', async (t) => {
  const wd = makePatient(t);
  const bakedDir = tmp(t, 'close-integrity-baked-'); // an existing absolute path the script bakes in
  writeFileSync(join(wd, 'verdict-close.mjs'), `const WORKDIR = '${bakedDir}';\nprocess.exit(0);\n`);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs');
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the fixture job must be validateJob-green');
  const provider = scriptedProvider([{ text: 'never called' }]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'close-absolute-path');
  assert.equal(provider.calls.length, 0, 'a $0 refusal must never reach the provider');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'close-absolute-path');
  assert.match(esc.detail, /verdict:/);
  assert.match(esc.detail, new RegExp(bakedDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('runPlan: a clean close script (process.cwd()) is NOT refused close-absolute-path — the run proceeds to spend tokens', async (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'verdict-close.mjs'), 'const WORKDIR = process.cwd();\nprocess.exit(0);\n');
  const job = JOB_WITH_CLOSE('node verdict-close.mjs');
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, []);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached — the close already reads already-green' }]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  assert.notEqual(outcome, 'close-absolute-path');
  // the close greens unconditionally (process.exit(0)) — already-green at the precheck, $0, but PAST the integrity check
  assert.equal(outcome, 'already-green');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'close-absolute-path').length, 0);
});

// ---------------------------------------------------------------------------
// (b) mutation proof — excise the precheck from a SCRATCH COPY of src/ (the
// real tree stays untouched) and show the exact same scenario above then DOES
// call the provider. This is the standing house style: "mutation-proven (flip
// the guard, confirm the test catches it)".
// ---------------------------------------------------------------------------

test('MUTATION PROOF: removing the close-absolute-path precheck makes the "never called" provider get called', async (t) => {
  const scratch = tmp(t, 'close-integrity-mutant-');
  cpSync(join(REPO_ROOT, 'src'), join(scratch, 'src'), { recursive: true });
  cpSync(join(REPO_ROOT, 'package.json'), join(scratch, 'package.json'));
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(scratch, 'node_modules'), 'dir');

  const planrunPath = join(scratch, 'src', 'planrun.js');
  let src = readFileSync(planrunPath, 'utf8');
  const startMarker = "// ── close-absolute-path (PRD item 27(c)";
  const endMarker = "// ── THE SIGNER'S ANSWER (N4 §1.4)";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker);
  assert.ok(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx,
    'the two anchor comments must bracket the precheck block in the REAL source — if this fails, the surrounding code moved and the mutation below would cut the wrong thing');
  src = src.slice(0, startIdx) + src.slice(endIdx); // excise the entire precheck block
  assert.doesNotMatch(src, /close-absolute-path/, 'the mutant must carry NO trace of the guard');
  writeFileSync(planrunPath, src);

  const { runPlan: mutantRunPlan } = await import(pathToFileURL(planrunPath).href);
  const { validateJob: mutantValidateJob } = await import(pathToFileURL(join(scratch, 'src', 'job.js')).href);

  const wd = makePatient(t);
  const bakedDir = tmp(t, 'close-integrity-baked-');
  // exit 1, never exit 0: an unconditionally-green close would short-circuit
  // at the close-first precheck (already-green) before the scout even runs,
  // which would prove nothing about the excised guard either way.
  writeFileSync(join(wd, 'verdict-close.mjs'), `const WORKDIR = '${bakedDir}';\nprocess.exit(1);\n`);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs');
  const jv = mutantValidateJob(job);
  assert.deepEqual(jv.reds, []);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'the mutant reaches the provider' }]);
  const { emit } = collector();
  const outcome = await mutantRunPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });

  assert.notEqual(outcome, 'close-absolute-path', 'the excised guard must not fire');
  assert.ok(provider.calls.length > 0,
    'with the guard excised, the provider WAS called for a script that bakes in an absolute path — this is what proves the REAL guard (still in place in src/) is the thing stopping it, not something else (validateJob, the close itself, etc.)');
});

// ---------------------------------------------------------------------------
// (c) the honest escalation tail (F130/PRD item 27(c)) — `resumable` threaded
// from `runJob`/`src/cli.js` into `runPlan`'s three `--resume`-naming
// readouts. Driven at the `runPlan` seam directly (same seam
// tests/planrun.test.js's own WALL_OPTIONS pin uses) via a money-halt during
// PLAN DRAFTING: the scout is fully funded, the plan drafter's gate is
// drained to a fraction of a cent, so its first round trips the budget gate
// and `relay(e, 'plan')` escalates with `MONEY_OPTIONS`.
// ---------------------------------------------------------------------------

const JOB_MONEY = (wd) => ({
  schema: 'job-v1',
  job: 'close-integrity-money-halt',
  description: 'tail fixture',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Append a line to src/mod.mjs.',
  verdictType: 'green',
  close: [{ name: 'verdict', cmd: 'node verdict-close.mjs', expect: 0 }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});

/**
 * A provider that answers the scout call normally, then throws a `cap-halt`
 * on the very next round — the same shape `tests/planrun.test.js`'s own
 * `timeoutError()` uses for `wall-halt` (a provider throw named by category,
 * which `categorize()` reads directly, `src/planrun.js`'s `relay(e, 'plan')`
 * seam). This targets the WIRING under test (does `resumable` reach the
 * escalation's option text) rather than bareguard's own budget-tripping
 * mechanics, which are exercised elsewhere in `tests/planrun.test.js`.
 */
function capHaltOnSecondCall() {
  let calls = 0;
  return {
    name: 'cap-halt-on-second-call',
    async generate() {
      calls += 1;
      if (calls === 1) return { text: 'scout notes', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
      throw Object.assign(new Error('budget gate tripped mid-draft'), { category: 'cap-halt' });
    },
  };
}

async function moneyHaltDuringDrafting(t, { resumable } = {}) {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'verdict-close.mjs'), 'process.exit(1);\n'); // never reached — halts before any close runs
  const job = JOB_MONEY(wd);
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, []);
  const provider = capHaltOnSecondCall();
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit, remainingUsd: () => 1.5, ...(resumable !== undefined ? { resumable } : {}),
  });
  return { outcome, events };
}

test('runPlan: a money-halt during PLAN DRAFTING (resumable=true, the default) names --resume, byte-identical to before this build', async (t) => {
  const { outcome, events } = await moneyHaltDuringDrafting(t);
  assert.equal(outcome, 'cap-halt');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt');
  assert.deepEqual(esc.options, [
    'top up budgetUsd and rerun with --resume (resume-to-cap; a spec edit, so the new hash needs re-approval)',
    'revise the goal/spec so the work fits the budget (same re-approval)',
    'abandon the task',
  ]);
});

test('runPlan: the SAME money-halt with resumable:false (the bundle CLI, F130) never names --resume', async (t) => {
  const { outcome, events } = await moneyHaltDuringDrafting(t, { resumable: false });
  assert.equal(outcome, 'cap-halt');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt');
  assert.equal(esc.options.some((o) => o.includes('--resume')), false, `no option may name --resume: ${JSON.stringify(esc.options)}`);
  assert.match(esc.options[0], /run-u.*only/, 'the honest tail must say resume is run-u-only in v1');
});

test('src/cli.js: the bundle CLI\'s runJob call passes resumable:false (F130) — a source pin so the wiring cannot silently drift back to the default', () => {
  const cliSrc = readFileSync(join(REPO_ROOT, 'src', 'cli.js'), 'utf8');
  assert.match(cliSrc, /resumable:\s*false/, 'src/cli.js must thread resumable:false into its runJob call');
});
