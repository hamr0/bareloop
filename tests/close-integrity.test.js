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
import { closeScriptCandidateToken } from '../src/validate.js';
import {
  readCloseScripts, checkCloseAbsolutePaths, absolutePathLiteralsOf,
  hashCloseScriptBytes, checkCloseByteSignature, checkStageByteSignature, signCloseScripts,
} from '../src/close-integrity.js';
import { scriptedProvider, initPatientRepo, gitInPatient } from './helpers.js';
import { jobSpecHash } from '../src/job.js';
import { assembleSpec } from '../src/authorjob.js';
import { exportBundle } from '../src/bundle.js';

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
// script. As of PRD item 27/M3 Part B, `types-close.mjs`, `testgen-close.mjs`,
// `testgen-cold-check-close.mjs` and `l2poc-check-close.mjs`'s `SPINE_DIR`
// (a log/pristine-copy location the arbiter deliberately keeps OUTSIDE the
// patient tree — never the cwd-judging bug F129 names) reads
// `process.env.BARELOOP_CLOSE_DIR`, absent = instrument-stop (see
// tests/close-timeout.test.js); `u-pulselog-close.mjs`'s `--workdir` DEFAULT
// moved from a hardcoded absolute path to `process.cwd()` (same M1 template
// as every other script) — the old literal already tripped the run-start
// close-absolute-path guard for every job that named this close without
// `--workdir` (`jobs/pulselog-u-types.json`).
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

test('F129/M3 regression pin: u-pulselog-close.mjs still takes --workdir, and its default is now process.cwd() (no baked /home/ literal)', () => {
  const src = readFileSync(join(REPO_ROOT, 'scripts', 'u-pulselog-close.mjs'), 'utf8');
  assert.match(src, /process\.argv\.indexOf\('--workdir'\)/, 'must still support the --workdir override');
  assert.doesNotMatch(src, /'\/home\//, 'no baked-in /home/ literal may survive — the default fell back to process.cwd() (PRD item 27/M3 Part B)');
  assert.match(src, /: process\.cwd\(\);/, 'the --workdir-absent fallback must be process.cwd()');
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

// Widened 2026-09-06 (orchestrator audit, folded into M2): a BARE absolute
// executable cmd (a `.sh` wrapper with no interpreter prefix — exactly
// `jobs/aurora-testgen-cold.json`'s shape) used to read as `[]` here, which
// left it invisible to BOTH `checkCloseAbsolutePaths` and the sha256
// fingerprint — a blind instrument for every job using this shape. It is
// now IN scope; only a RELATIVE bare executable (no interpreter, no leading
// `/`) stays out, because it names no file at all under this scheme.
test('readCloseScripts: a bare absolute executable cmd (a .sh wrapper, no interpreter) IS in scope — the F129 blind-spot fix', (t) => {
  const dir = tmp(t, 'close-integrity-read-');
  writeFileSync(join(dir, 'x.sh'), '#!/bin/sh\nexit 0\n');
  const spec = { close: [{ name: 'verdict', cmd: join(dir, 'x.sh'), expect: 0 }] };
  const scripts = readCloseScripts(spec, dir);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].path, join(dir, 'x.sh'));
  assert.equal(scripts[0].bytes, '#!/bin/sh\nexit 0\n');
});

test('readCloseScripts: a RELATIVE bare executable (no interpreter, not absolute) stays out of scope — it names no file at all', (t) => {
  const dir = tmp(t, 'close-integrity-read-');
  const spec = { close: [{ name: 'verdict', cmd: 'true', expect: 0 }] };
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
  gitInPatient(wd, ['add', '-A']);
  gitInPatient(wd, ['commit', '-q', '-m', 'src', '--allow-empty']);
  return wd;
}

// PRD item 27/M2: `sha256` is the REAL hash of the script bytes just written
// to disk — every one of these tests actually runs the close through
// runPlan, so a wrong/absent value would red close-tampered before the
// scenario under test ever gets a chance to fire.
const JOB_WITH_CLOSE = (/** @type {string} */ closeCmd, /** @type {string} */ sha256) => ({
  schema: 'job-v1',
  job: 'close-integrity-patient',
  description: 'close-integrity M1(b) fixture',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Append a line to src/mod.mjs.',
  verdictType: 'green',
  close: [{ name: 'verdict', cmd: closeCmd, expect: 0, sha256 }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});

test('runPlan: a close script baking in an existing absolute path is refused close-absolute-path at $0 — the provider is NEVER called', async (t) => {
  const wd = makePatient(t);
  const bakedDir = tmp(t, 'close-integrity-baked-'); // an existing absolute path the script bakes in
  const closeSrc = `const WORKDIR = '${bakedDir}';\nprocess.exit(0);\n`;
  writeFileSync(join(wd, 'verdict-close.mjs'), closeSrc);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(closeSrc));
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
  const closeSrc = 'const WORKDIR = process.cwd();\nprocess.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), closeSrc);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(closeSrc));
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
  const closeSrc = `const WORKDIR = '${bakedDir}';\nprocess.exit(1);\n`;
  writeFileSync(join(wd, 'verdict-close.mjs'), closeSrc);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(closeSrc));
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
  // PRD item 27/M2: the run-start integrity check runs BEFORE plan drafting,
  // so even this money-halt-during-drafting fixture needs a real signature
  // for its (never-executed-to-completion) close script.
  close: [{ name: 'verdict', cmd: 'node verdict-close.mjs', expect: 0, sha256: hashCloseScriptBytes('process.exit(1);\n') }],
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

// ===========================================================================
// M2 — close-bytes signature (PRD item 27, `docs/product/CLOSE-INTEGRITY-BUILD.md`)
//
//   (d) checkCloseByteSignature / checkStageByteSignature — unit level
//   (e) checkCloseByteSignature — run-start integration, provider never called
//   (f) mid-run tamper — close-tampered, not close-red, between fix iterations
//   (g) signCloseScripts — the minting helper, old->new hash, missing scripts
//   (h) validateJob — the sha256 field, including the widened .sh-wrapper scope
//   (i) exportBundle — close-sha-mismatch
//   (j) authoring refusal — assembleSpec refuses a draft carrying sha256
//   (k) mutation proof — excise the compare, the same tamper scenario greens
// ===========================================================================

const tcall = (id, name, args) => ({ id, name, arguments: args });

// ---------------------------------------------------------------------------
// (c2) closeScriptCandidateToken — the shared shape test, fixed 2026-09-06
// (orchestrator audit): the FIRST version returned bare argv[1] for an
// interpreter cmd, so `python -m pytest` demanded a sha256 for the token
// `-m` — a flag, never a file — making such a spec permanently unsignable
// (the sign helper reads nothing at that "path", the validator reds
// forever). The fix requires the token to be PATH-SHAPED: not a `-`-flag,
// and either containing `/` or ending in a recognized script extension.
// ---------------------------------------------------------------------------

test('closeScriptCandidateToken: a bare interpreter invocation with no path-shaped argument names nothing', () => {
  assert.equal(closeScriptCandidateToken('python -m pytest'), null);
  assert.equal(closeScriptCandidateToken('npx tsc --noEmit'), null);
});

test('closeScriptCandidateToken: flags before the real path are skipped, never mistaken for the path', () => {
  assert.equal(closeScriptCandidateToken('node --enable-source-maps ./close/x.mjs stage'), './close/x.mjs');
});

test('closeScriptCandidateToken: the ordinary node/bash forms are unchanged', () => {
  assert.equal(closeScriptCandidateToken('node close.mjs'), 'close.mjs');
  assert.equal(closeScriptCandidateToken('bash /abs/wrap.sh'), '/abs/wrap.sh');
});

test('closeScriptCandidateToken: a path-shaped argument further down argv[1..] is still found', () => {
  assert.equal(closeScriptCandidateToken('python -m mypy --strict src/pkg'), 'src/pkg');
  assert.equal(closeScriptCandidateToken('python check_form.py'), 'check_form.py');
});

// ---------------------------------------------------------------------------
// (d) unit level
// ---------------------------------------------------------------------------

test('checkCloseByteSignature: a tampered script (bytes changed after signing) reds — expected/actual carried, distinct hashes', (t) => {
  const dir = tmp(t, 'close-integrity-sig-');
  const original = 'process.exit(0);\n';
  writeFileSync(join(dir, 'x-close.mjs'), original);
  const sha256 = hashCloseScriptBytes(original);
  const spec = { close: [{ name: 'verdict', cmd: 'node x-close.mjs', expect: 0, sha256 }] };
  assert.deepEqual(checkCloseByteSignature(spec, dir), { ok: true });

  writeFileSync(join(dir, 'x-close.mjs'), 'process.exit(1); // tampered\n');
  const r = checkCloseByteSignature(spec, dir);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].stage, 'verdict');
  assert.equal(r.reds[0].expected, sha256);
  assert.notEqual(r.reds[0].actual, sha256);
});

test('checkCloseByteSignature: a signed script that has gone MISSING reds too (actual:null) — an unreadable signed script is as untrustworthy as a tampered one', (t) => {
  const dir = tmp(t, 'close-integrity-sig-');
  const sha256 = hashCloseScriptBytes('anything');
  const spec = { close: [{ name: 'verdict', cmd: 'node nope.mjs', expect: 0, sha256 }] };
  const r = checkCloseByteSignature(spec, dir);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].actual, null);
  assert.equal(r.reds[0].expected, sha256);
});

test('checkCloseByteSignature: a stage carrying no sha256 is not checked at all — M2\'s validator is what demands the field, not this runtime check', (t) => {
  const dir = tmp(t, 'close-integrity-sig-');
  const spec = { close: [{ name: 'verdict', cmd: 'node nope.mjs', expect: 0 }] };
  assert.deepEqual(checkCloseByteSignature(spec, dir), { ok: true });
});

test('checkStageByteSignature: the SAME comparison, scoped to a stage array rather than a whole spec — this is what runCloseStages re-verifies before every close run', (t) => {
  const dir = tmp(t, 'close-integrity-sig-');
  writeFileSync(join(dir, 'x-close.mjs'), 'process.exit(0);\n');
  const sha256 = hashCloseScriptBytes('process.exit(0);\n');
  const stages = [{ name: 'verdict', cmd: 'node x-close.mjs', expect: 0, sha256 }];
  assert.deepEqual(checkStageByteSignature(stages, dir), { ok: true });
  writeFileSync(join(dir, 'x-close.mjs'), 'process.exit(1);\n');
  assert.equal(checkStageByteSignature(stages, dir).ok, false);
});

// ---------------------------------------------------------------------------
// (e) close-tampered — run-start integration: refused at $0, BEFORE any
// provider call, exactly the same shape (b)'s close-absolute-path tests use.
// ---------------------------------------------------------------------------

test('runPlan: a close script whose bytes no longer match its signed sha256 is refused close-tampered at $0 — the provider is NEVER called', async (t) => {
  const wd = makePatient(t);
  const signedSrc = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), signedSrc);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(signedSrc));
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the fixture job must be validateJob-green');
  // byte-flip AFTER signing — the signature now disagrees with the file
  writeFileSync(join(wd, 'verdict-close.mjs'), 'process.exit(1); // tampered after signing\n');
  const provider = scriptedProvider([{ text: 'never called' }]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'close-tampered');
  assert.equal(provider.calls.length, 0, 'a $0 refusal must never reach the provider');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'close-tampered');
  assert.match(esc.detail, /verdict:/);
});

test('runPlan: a close script whose bytes MATCH its signed sha256 is not refused close-tampered — the run proceeds past the integrity checks', async (t) => {
  const wd = makePatient(t);
  const signedSrc = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), signedSrc);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(signedSrc));
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, []);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached — already-green' }]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  assert.notEqual(outcome, 'close-tampered');
  assert.equal(outcome, 'already-green');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'close-tampered').length, 0);
});

// ---------------------------------------------------------------------------
// (f) mid-run tamper — a REAL close-fix loop: iteration 1 grades an honest
// close-red (needs_revision), iteration 2's own attempt overwrites the close
// script itself (in scope, so the gate allows it) — the runtime re-verify
// must catch the SAME script mid-run and read close-tampered, never a
// graded verdict (which would be a fake red or, worse, a fake green).
// ---------------------------------------------------------------------------

test('runPlan: tampering the close script BETWEEN fix iterations reds close-tampered, not a graded close-red', async (t) => {
  const wd = makePatient(t);
  const closeSrc = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) process.exit(0);
console.log('FAILED tests/test_x.mjs missing an ok assertion'); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), closeSrc);
  mkdirSync(join(wd, 'tests'), { recursive: true });

  const job = {
    schema: 'job-v1',
    job: 'close-integrity-tamper-patient',
    description: 'M2 mid-run tamper fixture',
    provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 },
    budgetUsd: 1.5,
    // close.mjs is a bare top-level filename — a legal exact-file scope
    // (no wildcard required), and the worker needs it in scope for the
    // tamper below to be a GATE-AUDITED write, not a fenced denial.
    writeScope: ['tests/**', 'close.mjs'],
    goal: 'Write tests/test_x.mjs with an ok assertion so the suite greens.',
    verdictType: 'green',
    close: [{ name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED', sha256: hashCloseScriptBytes(closeSrc) }],
    tools: ['read', 'write', 'edit'],
    escalation: { mode: 'decision-ready' },
  };
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the fixture job must be validateJob-green');

  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write tests/test_x.mjs with an ok assertion.', tools: ['write'], rounds: 6,
      target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: plan },
    // the plan step's ONE attempt writes something that does NOT satisfy
    // the outer close (no 'ok') — the plan's own exit is tree-changed only,
    // so this step "succeeds" and the OUTER close is what reds, entering
    // the close-fix loop.
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'no\n' })] },
    { text: 'wrote it' },
    // fix iteration 1: still no 'ok' — an HONEST close-red (needs_revision),
    // never close-tampered, proving the mechanism is silent on ordinary reds
    { toolCalls: [tcall('f1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'still no\n' })] },
    { text: 'fix attempt 1' },
    // fix iteration 2: instead of fixing the test, the attempt overwrites
    // the CLOSE SCRIPT ITSELF — the tamper this test is about
    { toolCalls: [tcall('f2', 'shell_write', { path: join(wd, 'close.mjs'), content: 'console.log("tampered"); process.exit(0);\n' })] },
    { text: 'fix attempt 2' },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });

  assert.equal(outcome, 'close-tampered', `expected close-tampered, got ${outcome} — events: ${events.map((e) => e.type).join(' ')}`);
  const verdicts = events.filter((e) => e.type === 'close-verdict').map((e) => e.verdict);
  assert.ok(verdicts.includes('needs_revision'), `iteration 1 must be an honest graded red first: ${JSON.stringify(verdicts)}`);
  assert.ok(verdicts.includes('close-tampered'), `iteration 2 must read close-tampered, not another graded verdict: ${JSON.stringify(verdicts)}`);
  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'close-tampered');
  assert.ok(esc, 'a close-tampered escalation must be emitted, the same shape as the run-start refusal');
});

// ---------------------------------------------------------------------------
// (g) signCloseScripts — the minting helper
// ---------------------------------------------------------------------------

test('signCloseScripts: mints sha256 from disk for every node-script stage, reports old->new per stage, and moves jobSpecHash', (t) => {
  const dir = tmp(t, 'close-integrity-sign-');
  writeFileSync(join(dir, 'a-close.mjs'), 'process.exit(0);\n');
  writeFileSync(join(dir, 'b-close.mjs'), 'process.exit(0);\n');
  const spec = {
    schema: 'job-v1', job: 'x', close: [
      { name: 'a', cmd: 'node a-close.mjs', expect: 0 },
      { name: 'b', cmd: 'node b-close.mjs', expect: 0 },
      { name: 'c', cmd: 'git rev-parse SEED', expect: 0 }, // out of scope — no file to sign
    ],
  };
  const before = jobSpecHash(spec);
  const r = signCloseScripts(spec, dir);
  assert.equal(r.ok, true);
  assert.equal(r.missing.length, 0);
  assert.equal(r.changes.length, 2);
  assert.deepEqual(r.changes.map((c) => c.stage).sort(), ['a', 'b']);
  for (const c of r.changes) assert.equal(c.old, null, 'the stage carried no sha256 before minting');
  assert.equal(r.spec.close[0].sha256, hashCloseScriptBytes('process.exit(0);\n'));
  assert.equal(r.spec.close[1].sha256, hashCloseScriptBytes('process.exit(0);\n'));
  assert.equal(r.spec.close[2].sha256, undefined, 'the out-of-scope stage is untouched');
  assert.notEqual(jobSpecHash(r.spec), before, 'minting the field moves the signed spec hash (it sits inside the spec)');

  // re-signing an ALREADY-signed spec against unchanged bytes is a no-op hash-wise
  const r2 = signCloseScripts(r.spec, dir);
  assert.equal(jobSpecHash(r2.spec), jobSpecHash(r.spec));
  assert.equal(r2.changes[0].old, r2.changes[0].new, 'old==new when nothing on disk moved');
});

test('signCloseScripts: a stage naming an unreadable script is reported MISSING and left unsigned — ok:false', (t) => {
  const dir = tmp(t, 'close-integrity-sign-');
  const spec = { close: [{ name: 'gone', cmd: 'node nope.mjs', expect: 0 }] };
  const r = signCloseScripts(spec, dir);
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].stage, 'gone');
  assert.equal(r.spec.close[0].sha256, undefined);
});

test('signCloseScripts: a spec with no command close (closeDecl) is ok:false and untouched — nothing this rung can sign', () => {
  const spec = { closeDecl: { genre: 'TYPES', lang: 'js', stages: [] } };
  const r = signCloseScripts(spec, '/tmp');
  assert.equal(r.ok, false);
  assert.equal(r.spec, spec);
});

test('scripts/sign-close.mjs: NEVER writes without --write (dry run reports the same table and touches nothing)', (t) => {
  const dir = tmp(t, 'close-integrity-cli-');
  writeFileSync(join(dir, 'verdict-close.mjs'), 'process.exit(0);\n');
  const specPath = join(dir, 'job.json');
  const spec = {
    schema: 'job-v1', job: 'sign-cli-fixture', description: 'x', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 1, writeScope: ['src/**'], goal: 'x', verdictType: 'green',
    close: [{ name: 'verdict', cmd: `node ${join(dir, 'verdict-close.mjs')}`, expect: 0 }],
    tools: ['read', 'write'], escalation: { mode: 'decision-ready' },
  };
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  const beforeText = readFileSync(specPath, 'utf8');

  const dry = execFileSync('node', [join(REPO_ROOT, 'scripts', 'sign-close.mjs'), specPath], { encoding: 'utf8' });
  assert.match(dry, /jobSpecHash:/);
  assert.equal(readFileSync(specPath, 'utf8'), beforeText, '--write was NOT passed — the file must be byte-identical');

  const wrote = execFileSync('node', [join(REPO_ROOT, 'scripts', 'sign-close.mjs'), specPath, '--write'], { encoding: 'utf8' });
  assert.match(wrote, /written/);
  const after = JSON.parse(readFileSync(specPath, 'utf8'));
  assert.equal(after.close[0].sha256, hashCloseScriptBytes('process.exit(0);\n'));
  assert.notEqual(jobSpecHash(after), jobSpecHash(spec));
});

// ---------------------------------------------------------------------------
// (h) validateJob — the sha256 field
// ---------------------------------------------------------------------------

test('validateJob: a node-script close stage with no sha256 reds missing-required', () => {
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', undefined);
  delete job.close[0].sha256;
  const r = validateJob(job);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'missing-required' && x.path === 'close.0.sha256'), JSON.stringify(r.reds));
});

test('validateJob: a malformed sha256 (wrong length / non-hex) reds invalid-value', () => {
  for (const bad of ['abc', 'A'.repeat(64), `${'a'.repeat(63)}g`, 123]) {
    const job = JOB_WITH_CLOSE('node verdict-close.mjs', bad);
    const r = validateJob(job);
    assert.equal(r.ok, false, `expected a red for sha256=${JSON.stringify(bad)}`);
    assert.ok(r.reds.some((x) => x.path === 'close.0.sha256' && x.code === 'invalid-value'), JSON.stringify(r.reds));
  }
});

test('validateJob: a well-formed sha256 on a node-script stage validates green', () => {
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', 'a'.repeat(64));
  assert.deepEqual(validateJob(job).reds, []);
});

test('validateJob: the widened scope — a BARE absolute-executable cmd (a .sh wrapper, no interpreter) ALSO demands sha256', () => {
  const job = JOB_WITH_CLOSE('/tmp/some-close.sh', undefined);
  delete job.close[0].sha256;
  const r = validateJob(job);
  assert.ok(r.reds.some((x) => x.code === 'missing-required' && x.path === 'close.0.sha256'), JSON.stringify(r.reds));
  const signed = JOB_WITH_CLOSE('/tmp/some-close.sh', 'a'.repeat(64));
  assert.deepEqual(validateJob(signed).reds, []);
});

test('validateJob: a cmd naming NO file at all (a relative bare executable) carries no sha256 demand', () => {
  const job = JOB_WITH_CLOSE('npm test', undefined);
  delete job.close[0].sha256;
  assert.deepEqual(validateJob(job).reds, []);
});

// ---------------------------------------------------------------------------
// (i) exportBundle — close-sha-mismatch
// ---------------------------------------------------------------------------

test('exportBundle: reds when the spec\'s sha256 disagrees with the script bytes being packed', (t) => {
  const closeDir = tmp(t, 'close-integrity-export-src-');
  const scriptPath = join(closeDir, 'x-close.mjs');
  const source = 'process.exit(0);\n';
  writeFileSync(scriptPath, source);
  const registryDir = tmp(t, 'close-integrity-export-reg-');
  const outDir = join(tmp(t, 'close-integrity-export-out-'), 'x.bareloop');
  const spec = {
    schema: 'job-v1', job: 'export-sha-fixture', description: 'x', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 1, writeScope: ['src/**'], goal: 'x', verdictType: 'green',
    // a WRONG sha256 — the export must catch this even with no bridge in the registry
    close: [{ name: 'verdict', cmd: `node ${scriptPath}`, expect: 0, sha256: hashCloseScriptBytes('a different file entirely') }],
    tools: ['read', 'write'], escalation: { mode: 'decision-ready' },
  };
  const r = exportBundle({ spec, closeScripts: { [scriptPath]: source }, registryDir, outDir, bareloopVersion: '0.0.0-test' });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'close-sha-mismatch'), JSON.stringify(r.reds));
});

test('exportBundle: a matching sha256 does not red close-sha-mismatch (the no-bridge-at-hash red still fires — this is not a green-path test)', (t) => {
  const closeDir = tmp(t, 'close-integrity-export-src-');
  const scriptPath = join(closeDir, 'x-close.mjs');
  const source = 'process.exit(0);\n';
  writeFileSync(scriptPath, source);
  const registryDir = tmp(t, 'close-integrity-export-reg-');
  const outDir = join(tmp(t, 'close-integrity-export-out-'), 'x.bareloop');
  const spec = {
    schema: 'job-v1', job: 'export-sha-fixture-2', description: 'x', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 1, writeScope: ['src/**'], goal: 'x', verdictType: 'green',
    close: [{ name: 'verdict', cmd: `node ${scriptPath}`, expect: 0, sha256: hashCloseScriptBytes(source) }],
    tools: ['read', 'write'], escalation: { mode: 'decision-ready' },
  };
  const r = exportBundle({ spec, closeScripts: { [scriptPath]: source }, registryDir, outDir, bareloopVersion: '0.0.0-test' });
  assert.ok(!r.reds.some((x) => x.code === 'close-sha-mismatch'), JSON.stringify(r.reds));
});

// ---------------------------------------------------------------------------
// (j) authoring refusal — the agent never writes sha256
// ---------------------------------------------------------------------------

test('assembleSpec: refuses a draft carrying sha256, the same way it refuses close/closeDecl/verdictType', () => {
  const draft = { schema: 'job-v1', job: 'x', sha256: 'a'.repeat(64) };
  assert.throws(
    () => assembleSpec(draft, { closeDecl: { genre: 'TYPES', lang: 'js', stages: [] }, verdictType: 'green' }),
    /sha256/,
  );
});

// ---------------------------------------------------------------------------
// (k) mutation proof — excise the byte-signature compare from a SCRATCH COPY
// and show the SAME run-start tamper scenario then calls the provider.
// ---------------------------------------------------------------------------

test('MUTATION PROOF: disabling the byte-signature compare inside runCloseStages makes the "never called" provider get called', async (t) => {
  // Targets `runCloseStages`, not the run-start block above: `runCloseStages`
  // is the ONE seam every close execution goes through (precheck included —
  // `judgeClose` calls it too), so it is the actual chokepoint. Excising only
  // the EARLIER run-start check would prove nothing: `judgeClose`'s own call
  // into `runCloseStages` re-verifies independently and would still catch the
  // tamper, so the provider would still never be reached — the defense is
  // deliberately layered, and the mutation proof must target the layer that
  // is load-bearing for every call site, not the one that merely runs first.
  const scratch = tmp(t, 'close-integrity-tamper-mutant-');
  cpSync(join(REPO_ROOT, 'src'), join(scratch, 'src'), { recursive: true });
  cpSync(join(REPO_ROOT, 'package.json'), join(scratch, 'package.json'));
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(scratch, 'node_modules'), 'dir');

  const planrunPath = join(scratch, 'src', 'planrun.js');
  let src = readFileSync(planrunPath, 'utf8');
  const before = '  const runCloseStages = async (stages) => {\n'
    + '    const sig = checkStageByteSignature(stages, workdir);\n'
    + '    if (!sig.ok) {\n'
    + '      const r = sig.reds[0];\n'
    + '      const detail = sig.reds.map((rr) => `${rr.stage}: expected ${rr.expected.slice(0, 12)}… got ${rr.actual ? `${rr.actual.slice(0, 12)}…` : \'<unreadable>\'}`).join(\'; \');\n'
    + "      return { verdict: 'close-tampered', stage: r?.stage, detail };\n"
    + '    }\n'
    + '    return runCloseStagesInner(stages);\n'
    + '  };';
  assert.ok(src.includes(before), 'the exact runCloseStages wrapper body must be found in the REAL source — if this fails, it moved and the mutation below would cut the wrong thing');
  src = src.replace(before, '  const runCloseStages = async (stages) => runCloseStagesInner(stages);');
  const startMarker = '// ── close-tampered (PRD item 27/M2';
  const endMarker = "// ── THE SIGNER'S ANSWER (N4 §1.4)";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker);
  assert.ok(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx, 'the run-start block\'s anchors must also be found');
  src = src.slice(0, startIdx) + src.slice(endIdx);
  assert.doesNotMatch(src, /'close-tampered'/, 'the mutant must carry no trace of the re-verify in EITHER layer');
  writeFileSync(planrunPath, src);

  const { runPlan: mutantRunPlan } = await import(pathToFileURL(planrunPath).href);
  const { validateJob: mutantValidateJob } = await import(pathToFileURL(join(scratch, 'src', 'job.js')).href);

  const wd = makePatient(t);
  const signedSrc = 'process.exit(1);\n'; // exit 1: never a short-circuit already-green
  writeFileSync(join(wd, 'verdict-close.mjs'), signedSrc);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(signedSrc));
  const jv = mutantValidateJob(job);
  assert.deepEqual(jv.reds, []);
  // tamper AFTER signing, exactly like the real guard's own test above
  writeFileSync(join(wd, 'verdict-close.mjs'), 'process.exit(1); // tampered\n');
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'the mutant reaches the provider' }]);
  const { emit } = collector();
  const outcome = await mutantRunPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });

  assert.notEqual(outcome, 'close-tampered', 'the excised guard must not fire');
  assert.ok(provider.calls.length > 0,
    'with the run-start guard excised, the provider WAS called for a tampered close script — this proves the REAL guard (still in place in src/) is what stops it');
});
