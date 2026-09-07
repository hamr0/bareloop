// Close timeout — PRD item 27 / M3, `docs/product/CLOSE-INTEGRITY-BUILD.md`.
// hamr's rulings (2026-09-07, arbiter constants): FLOOR_MS = 120_000, K = 5.
//
// Three layers:
//   (a) unit — the ceiling formula, the timing pass, and the resolver's
//       precedence (signed override skips the pass; autoset otherwise).
//   (b) close-dir-required — a close script that reads BARELOOP_CLOSE_DIR
//       and gets none refuses at $0; mutation-proven by literally breaking
//       the guard and confirming the test would have caught it.
//   (c) runPlan integration — the wiring: autoset happy path, explicit/
//       signed override precedence, wall-vs-close-timeout refusal, and
//       BARELOOP_CLOSE_DIR actually reaching a spawned close's env.
//
// The timing-pass TIMEOUT path (`close-timing-red`) is unit-tested via the
// `ceilingMs` test seam (`timeCloseStages`/`resolveCloseTimeoutMs`) rather
// than through a full `runPlan` run: the real provisional ceiling
// (`TIMING_PREFLIGHT_CEILING_MS`, 600s) cannot be shrunk from the outside
// without either that seam or a genuine 10-minute test — this is a named
// divergence from a fully end-to-end proof of that one path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  CLOSE_TIMEOUT_FLOOR_MS, CLOSE_TIMEOUT_K, TIMING_PREFLIGHT_CEILING_MS,
  timeCloseStages, computeCloseTimeoutCeiling, resolveCloseTimeoutMs, closeTimeoutBanner,
} from '../src/closetimeout.js';
import { checkCloseDirRequired, CLOSE_DIR_ENV_VAR, hashCloseScriptBytes } from '../src/close-integrity.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { assembleSpec, AUTHORED_SPEC_FIELDS } from '../src/authorjob.js';
import { runPlan } from '../src/planrun.js';
import { runJob } from '../src/run.js';
import { scriptedProvider, initPatientRepo, gitInPatient } from './helpers.js';

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

/** a throwaway git patient — the work-branch/close machinery both need one */
function makePatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'close-timeout-patient-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'src'), { recursive: true });
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  gitInPatient(wd, ['add', '-A']);
  gitInPatient(wd, ['commit', '-q', '-m', 'src', '--allow-empty']);
  return wd;
}

const collector = () => {
  /** @type {any[]} */
  const events = [];
  return { events, emit: (/** @type {string} */ type, /** @type {any} */ data = {}) => { events.push({ type, ...data }); } };
};

/** the plan-shape job fixture, one command-close stage, real bytes signed. */
const JOB_WITH_CLOSE = (/** @type {string} */ closeCmd, /** @type {string} */ sha256, /** @type {object} */ extra = {}) => ({
  schema: 'job-v1',
  job: 'close-timeout-patient',
  description: 'close-timeout M3 fixture',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Append a line to src/mod.mjs.',
  verdictType: 'green',
  close: [{ name: 'verdict', cmd: closeCmd, expect: 0, sha256 }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...extra,
});

// ---------------------------------------------------------------------------
// (a) unit — the ceiling formula
// ---------------------------------------------------------------------------

test('computeCloseTimeoutCeiling: FLOOR wins on a tiny seed', () => {
  const r = computeCloseTimeoutCeiling({ slowestMs: 10 });
  assert.equal(r.ceilingMs, CLOSE_TIMEOUT_FLOOR_MS);
  assert.equal(r.source, 'estimated');
});

test('computeCloseTimeoutCeiling: K x slowest wins once the seed is slow enough', () => {
  const slowestMs = 1_000_000; // K x this exceeds the floor
  const r = computeCloseTimeoutCeiling({ slowestMs });
  assert.equal(r.ceilingMs, CLOSE_TIMEOUT_K * slowestMs);
  assert.equal(r.source, 'estimated');
});

test('computeCloseTimeoutCeiling: override wins over BOTH the floor and K x slowest, in either direction', () => {
  const below = computeCloseTimeoutCeiling({ slowestMs: 10, overrideMs: 5_000_000 });
  assert.equal(below.ceilingMs, 5_000_000);
  assert.equal(below.source, 'override');
  const above = computeCloseTimeoutCeiling({ slowestMs: 1_000_000, overrideMs: 200_000 });
  assert.equal(above.ceilingMs, 200_000, 'an override below the autoset estimate is still legal — the customer-override shape, F113');
  assert.equal(above.source, 'override');
});

// MUTATION PROOF: if `Math.max` were swapped for a plain `K * slowestMs` (no
// floor), this test would fail on a tiny seed — confirmed by temporarily
// editing src/closetimeout.js to drop the floor and re-running this file:
// the assertion above failed with ceilingMs=50 instead of 120000, then
// passed again once the floor was restored.
test('computeCloseTimeoutCeiling: exact arithmetic at the boundary (K x slowest == floor)', () => {
  const slowestMs = CLOSE_TIMEOUT_FLOOR_MS / CLOSE_TIMEOUT_K;
  const r = computeCloseTimeoutCeiling({ slowestMs });
  assert.equal(r.ceilingMs, CLOSE_TIMEOUT_FLOOR_MS);
});

// ---------------------------------------------------------------------------
// (a) unit — the timing pass itself
// ---------------------------------------------------------------------------

test('timeCloseStages: times every stage once, ignoring verdicts (a red stage is still timed and the pass continues)', async (t) => {
  const dir = tmp(t, 'close-timeout-time-');
  writeFileSync(join(dir, 'red.mjs'), 'process.exit(1);\n');
  writeFileSync(join(dir, 'green.mjs'), 'process.exit(0);\n');
  const stages = [
    { name: 'first', cmd: `node ${join(dir, 'red.mjs')}`, expect: 0 },
    { name: 'second', cmd: `node ${join(dir, 'green.mjs')}`, expect: 0 },
  ];
  const r = await timeCloseStages(stages, { cwd: dir });
  assert.equal(r.perStage.length, 2, 'BOTH stages ran — first-red-wins does not apply to the timing pass');
  assert.equal(r.perStage[0].name, 'first');
  assert.equal(r.perStage[0].exitCode, 1);
  assert.equal(r.perStage[1].exitCode, 0);
  assert.equal(r.anyTimedOut, false);
  assert.ok(r.slowestMs >= 0);
});

test('timeCloseStages: a declared/kind stage (no .cmd) is skipped, not timed as zero', async (t) => {
  const dir = tmp(t, 'close-timeout-time-');
  writeFileSync(join(dir, 'green.mjs'), 'process.exit(0);\n');
  const stages = [
    { name: 'declared', kind: 'files-changed' }, // no cmd — nothing to spawn
    { name: 'cmd-stage', cmd: `node ${join(dir, 'green.mjs')}`, expect: 0 },
  ];
  const r = await timeCloseStages(stages, { cwd: dir });
  assert.equal(r.perStage.length, 1, 'the declared stage contributes no reading at all');
  assert.equal(r.perStage[0].name, 'cmd-stage');
});

test('timeCloseStages: a stage that outlives the (test-seam) ceiling reads timedOut:true', async (t) => {
  const dir = tmp(t, 'close-timeout-time-');
  // node has no builtin sleep; spin a tight timer via setTimeout — 300ms, well
  // over the 60ms test ceiling below, and well under any real test timeout.
  writeFileSync(join(dir, 'slow.mjs'), 'await new Promise((r) => setTimeout(r, 300));\nprocess.exit(0);\n');
  const stages = [{ name: 'slow', cmd: `node ${join(dir, 'slow.mjs')}`, expect: 0 }];
  const r = await timeCloseStages(stages, { cwd: dir, ceilingMs: 60 });
  assert.equal(r.anyTimedOut, true);
  assert.equal(r.perStage[0].timedOut, true);
});

// ---------------------------------------------------------------------------
// (a) unit — resolveCloseTimeoutMs precedence
// ---------------------------------------------------------------------------

test('resolveCloseTimeoutMs: a signed job.closeTimeoutMs skips the timing pass entirely (timing: null)', async (t) => {
  const dir = tmp(t, 'close-timeout-resolve-');
  writeFileSync(join(dir, 'slow.mjs'), 'await new Promise((r) => setTimeout(r, 5000));\nprocess.exit(0);\n');
  const stages = [{ name: 'slow', cmd: `node ${join(dir, 'slow.mjs')}`, expect: 0 }];
  const started = Date.now();
  const r = await resolveCloseTimeoutMs({ job: { closeTimeoutMs: 999_000 }, stages, cwd: dir });
  const elapsed = Date.now() - started;
  assert.equal(r.closeTimeoutMs, 999_000);
  assert.equal(r.source, 'override');
  assert.equal(r.timing, null);
  assert.ok(elapsed < 2000, `the pass must not have run the 5s stage — elapsed ${elapsed}ms`);
});

test('resolveCloseTimeoutMs: no override runs the pass and autosets from what was measured', async (t) => {
  const dir = tmp(t, 'close-timeout-resolve-');
  writeFileSync(join(dir, 'fast.mjs'), 'process.exit(0);\n');
  const stages = [{ name: 'fast', cmd: `node ${join(dir, 'fast.mjs')}`, expect: 0 }];
  const r = await resolveCloseTimeoutMs({ job: {}, stages, cwd: dir });
  assert.equal(r.source, 'estimated');
  assert.equal(r.closeTimeoutMs, CLOSE_TIMEOUT_FLOOR_MS, 'a fast stage floors out');
  assert.ok(r.timing && r.timing.perStage.length === 1);
});

test('resolveCloseTimeoutMs: a timing-pass timeout reports timedOut:true and closeTimeoutMs:null', async (t) => {
  const dir = tmp(t, 'close-timeout-resolve-');
  writeFileSync(join(dir, 'slow.mjs'), 'await new Promise((r) => setTimeout(r, 300));\nprocess.exit(0);\n');
  const stages = [{ name: 'slow', cmd: `node ${join(dir, 'slow.mjs')}`, expect: 0 }];
  const r = await resolveCloseTimeoutMs({ job: {}, stages, cwd: dir, ceilingMs: 60 });
  assert.equal(r.timedOut, true);
  assert.equal(r.closeTimeoutMs, null);
});

test('closeTimeoutBanner: three honest spellings, never the same word for different sources', () => {
  const est = closeTimeoutBanner({ ceilingMs: 120_000, source: 'estimated', slowestMs: 1000, slowestName: 'suite' });
  const ovr = closeTimeoutBanner({ ceilingMs: 300_000, source: 'override' });
  const exp = closeTimeoutBanner({ ceilingMs: 50_000, source: 'explicit' });
  assert.match(est, /estimated from seed timing/);
  assert.match(ovr, /signed override/);
  assert.match(exp, /explicit runner override/);
  assert.notEqual(est, ovr);
  assert.notEqual(ovr, exp);
});

// ---------------------------------------------------------------------------
// (a) unit — validateJob's closeTimeoutMs field
// ---------------------------------------------------------------------------

test('validateJob: closeTimeoutMs is optional; absent is fine', (t) => {
  const dir = tmp(t, 'close-timeout-validate-');
  writeFileSync(join(dir, 'x.mjs'), 'process.exit(0);\n');
  const job = JOB_WITH_CLOSE(`node ${join(dir, 'x.mjs')}`, hashCloseScriptBytes('process.exit(0);\n'));
  const v = validateJob(job);
  assert.equal(v.ok, true, JSON.stringify(v.reds));
  assert.equal(v.job.closeTimeoutMs, undefined);
});

test('validateJob: closeTimeoutMs below the floor is a bounds red', (t) => {
  const dir = tmp(t, 'close-timeout-validate-');
  writeFileSync(join(dir, 'x.mjs'), 'process.exit(0);\n');
  const job = JOB_WITH_CLOSE(`node ${join(dir, 'x.mjs')}`, hashCloseScriptBytes('process.exit(0);\n'), { closeTimeoutMs: CLOSE_TIMEOUT_FLOOR_MS - 1 });
  const v = validateJob(job);
  assert.equal(v.ok, false);
  assert.ok(v.reds.some((r) => r.code === 'bounds' && r.path === 'closeTimeoutMs'));
});

test('validateJob: closeTimeoutMs exactly at the floor is valid; above it is valid too (customer override, no ceiling)', (t) => {
  const dir = tmp(t, 'close-timeout-validate-');
  writeFileSync(join(dir, 'x.mjs'), 'process.exit(0);\n');
  const sha256 = hashCloseScriptBytes('process.exit(0);\n');
  const atFloor = validateJob(JOB_WITH_CLOSE(`node ${join(dir, 'x.mjs')}`, sha256, { closeTimeoutMs: CLOSE_TIMEOUT_FLOOR_MS }));
  assert.equal(atFloor.ok, true, JSON.stringify(atFloor.reds));
  const wayAbove = validateJob(JOB_WITH_CLOSE(`node ${join(dir, 'x.mjs')}`, sha256, { closeTimeoutMs: CLOSE_TIMEOUT_FLOOR_MS * 100 }));
  assert.equal(wayAbove.ok, true, JSON.stringify(wayAbove.reds));
});

test('validateJob: a non-integer closeTimeoutMs is an invalid bounds red', (t) => {
  const dir = tmp(t, 'close-timeout-validate-');
  writeFileSync(join(dir, 'x.mjs'), 'process.exit(0);\n');
  const job = JOB_WITH_CLOSE(`node ${join(dir, 'x.mjs')}`, hashCloseScriptBytes('process.exit(0);\n'), { closeTimeoutMs: 120_000.5 });
  const v = validateJob(job);
  assert.equal(v.ok, false);
  assert.ok(v.reds.some((r) => r.path === 'closeTimeoutMs'));
});

// ---------------------------------------------------------------------------
// (a) unit — authorjob.js's AUTHORED_SPEC_FIELDS
// ---------------------------------------------------------------------------

test('AUTHORED_SPEC_FIELDS: closeTimeoutMs is arbiter territory — assembleSpec refuses a draft carrying it', () => {
  assert.ok(AUTHORED_SPEC_FIELDS.includes('closeTimeoutMs'));
  assert.throws(
    () => assembleSpec({ job: 'x', closeTimeoutMs: 500_000 }, { closeDecl: {}, verdictType: 'green' }),
    /closeTimeoutMs/,
  );
});

// ---------------------------------------------------------------------------
// (b) close-dir-required — unit + mutation proof
// ---------------------------------------------------------------------------

test('checkCloseDirRequired: a script that never mentions BARELOOP_CLOSE_DIR carries no demand', (t) => {
  const dir = tmp(t, 'close-dir-');
  writeFileSync(join(dir, 'x.mjs'), 'process.exit(0);\n');
  const spec = { close: [{ name: 'verdict', cmd: 'node x.mjs', expect: 0 }] };
  assert.deepEqual(checkCloseDirRequired(spec, dir, null), { ok: true });
});

test('checkCloseDirRequired: a script that reads BARELOOP_CLOSE_DIR and gets none reds', (t) => {
  const dir = tmp(t, 'close-dir-');
  writeFileSync(join(dir, 'x.mjs'), `const d = process.env.${CLOSE_DIR_ENV_VAR};\nprocess.exit(d ? 0 : 1);\n`);
  const spec = { close: [{ name: 'verdict', cmd: 'node x.mjs', expect: 0 }] };
  const r = checkCloseDirRequired(spec, dir, null);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].stage, 'verdict');
});

test('checkCloseDirRequired: the same script is fine once a closeDir is given', (t) => {
  const dir = tmp(t, 'close-dir-');
  writeFileSync(join(dir, 'x.mjs'), `const d = process.env.${CLOSE_DIR_ENV_VAR};\nprocess.exit(d ? 0 : 1);\n`);
  const spec = { close: [{ name: 'verdict', cmd: 'node x.mjs', expect: 0 }] };
  assert.deepEqual(checkCloseDirRequired(spec, dir, '/some/books/dir'), { ok: true });
});

// MUTATION PROOF (manual, at build time — recorded here rather than re-run
// live every suite pass): commenting out the `reds.push` line inside
// `checkCloseDirRequired` (src/close-integrity.js) and re-running the test
// above ("gets none reds") flips it from pass to fail — the guard's absence
// is caught. Restored immediately after confirming the failure.

// ---------------------------------------------------------------------------
// (c) runPlan integration
// ---------------------------------------------------------------------------

test('runPlan: a close script needing BARELOOP_CLOSE_DIR and given none refuses close-dir-required at $0 — provider NEVER called', async (t) => {
  const wd = makePatient(t);
  const src = `const d = process.env.${CLOSE_DIR_ENV_VAR};\nprocess.exit(d ? 0 : 1);\n`;
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src));
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'fixture must be validateJob-green');
  const provider = scriptedProvider([{ text: 'never called' }]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'close-dir-required');
  assert.equal(provider.calls.length, 0);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'close-dir-required');
});

test('runPlan: BARELOOP_CLOSE_DIR actually reaches the spawned close as the value the runner passed', async (t) => {
  const wd = makePatient(t);
  const closeDir = join(wd, '..', 'the-close-books');
  mkdirSync(closeDir, { recursive: true });
  // The received value is written to a file in the PATIENT (relative path,
  // no absolute literal baked into the script's own source — a baked literal
  // that happens to exist on disk would itself trip the close-absolute-path
  // guard, a different check than the one under test here) so the test can
  // read it back after the run rather than baking the expected value INTO
  // the spawned script (which would be exactly that hazard).
  const src = "import { writeFileSync } from 'node:fs';\n"
    + `writeFileSync('received.txt', process.env.${CLOSE_DIR_ENV_VAR} ?? '');\n`
    + 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src));
  const jv = validateJob(job);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached — already-green' }]);
  const { emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5, closeDir });
  assert.equal(outcome, 'already-green', 'the close exited 0 — a fast, satisfied precheck');
  assert.equal(readFileSync(join(wd, 'received.txt'), 'utf8'), closeDir);
});

test('runPlan: no override, no signed field — the close-timing record is emitted with source estimated and a fast stage floors out', async (t) => {
  const wd = makePatient(t);
  const src = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src));
  const jv = validateJob(job);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached' }]);
  const { events, emit } = collector();
  await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  const timing = events.filter((e) => e.type === 'close-timing').at(0);
  assert.ok(timing, 'a close-timing record must be emitted on every run');
  assert.equal(timing.source, 'estimated');
  assert.equal(timing.ceilingMs, CLOSE_TIMEOUT_FLOOR_MS);
});

test('runPlan: a signed job.closeTimeoutMs wins as "override" and the pass never runs (a hanging stage would prove it; here we assert the label)', async (t) => {
  const wd = makePatient(t);
  const src = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src), { closeTimeoutMs: CLOSE_TIMEOUT_FLOOR_MS + 5000 });
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, []);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached' }]);
  const { events, emit } = collector();
  await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  const timing = events.filter((e) => e.type === 'close-timing').at(0);
  assert.equal(timing.source, 'override');
  assert.equal(timing.ceilingMs, CLOSE_TIMEOUT_FLOOR_MS + 5000);
});

test('runPlan: an explicit runtime closeTimeoutMs option wins as "explicit" (backward-compat/test knob) over autoset', async (t) => {
  const wd = makePatient(t);
  const src = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src));
  const jv = validateJob(job);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached' }]);
  const { events, emit } = collector();
  await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5, closeTimeoutMs: 77_777 });
  const timing = events.filter((e) => e.type === 'close-timing').at(0);
  assert.equal(timing.source, 'explicit');
  assert.equal(timing.ceilingMs, 77_777);
});

// ---------------------------------------------------------------------------
// F133 — a real paid fire (run mtqwmb9l) printed BOTH `scripts/run-u.mjs`'s
// own resolved banner ("estimated from seed timing") AND `runPlan`'s second
// one ("explicit runner override") for the SAME number: run-u resolved the
// ceiling itself (needed early, to size its outside watchdog, F67), printed
// it, then ALSO fed the resolved number back into `runJob` as a bare
// `closeTimeoutMs` — which this call site reads as the pre-M3 shell/test
// knob and prints/emits its own SECOND, mislabelled line. Fixed by making
// `runJob`/`runPlan`'s one call the ONLY place a production run's ceiling is
// announced: `scripts/run-u.mjs` still resolves the number for its own
// watchdog sizing, but never announces it and never passes it to `runJob`
// (grep-pinned below, the same discipline as the F129 hardcoded-WORKDIR pin).
// ---------------------------------------------------------------------------

test('runPlan: the banner prints exactly ONCE per run on the autoset path (console.log mutation proof)', async (t) => {
  const wd = makePatient(t);
  const src = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src));
  const jv = validateJob(job);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached' }]);
  const { emit } = collector();
  const lines = [];
  const orig = console.log;
  console.log = (/** @type {string} */ s) => lines.push(s);
  try {
    await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  } finally {
    console.log = orig;
  }
  const banners = lines.filter((l) => typeof l === 'string' && l.includes('close timeout:'));
  assert.equal(banners.length, 1, `expected exactly one close-timeout banner line, got: ${JSON.stringify(banners)}`);
  assert.match(banners[0], /estimated from seed timing/, 'the TRUE label, never a second "explicit runner override" line');
});

// grep-pin (same discipline as the F129 hardcoded-WORKDIR pin): a production
// runner must never resolve `closeTimeoutMs` for its own purposes and then
// ALSO hand the number to `runJob`/`runPlan` — that is exactly how F133
// shipped a second, mislabelled banner beside the runner's own correct one.
// Scoped to the runJob/runPlan CALL ITSELF (bracket-matched to its closing
// paren), never a bare source-wide grep: `scripts/run-u.mjs` legitimately
// passes `closeTimeoutMs` to the UNRELATED `answerReviewDoor`/
// `proveMechanically` door-rerun path (`src/reviewdoor.js` has no timing-pass
// or banner infrastructure at all, so that call never double-prints — named
// in the build spec as the one exempted case) and a source-wide match would
// false-positive on it.
/** @param {string} source @param {string} fnName @returns {string} the fnName(...) call's argument text, or '' if not found */
function sliceCall(source, fnName) {
  const start = source.indexOf(`${fnName}(`);
  if (start === -1) return '';
  let depth = 0;
  let i = start + fnName.length;
  const openAt = i;
  for (; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openAt, i + 1);
    }
  }
  throw new Error(`${fnName}( at ${start} never closes — unbalanced parens in fixture source`);
}

for (const [file, fnName, label] of [
  ['scripts/run-u.mjs', 'runJob', 'run-u.mjs'],
  ['src/cli.js', 'runJob', 'the bundle CLI'],
]) {
  test(`F133 grep-pin: ${label}'s ${fnName} call never passes closeTimeoutMs`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const call = sliceCall(source, fnName);
    assert.notEqual(call, '', `fixture bug: no ${fnName}( call found in ${file} — this pin is not exercising anything`);
    assert.doesNotMatch(
      call,
      /closeTimeoutMs\s*:/,
      `${label}'s ${fnName} call must never pass closeTimeoutMs (F133, run mtqwmb9l) — resolve it locally if needed (e.g. to size a watchdog), never hand it back to the library`,
    );
  });
}

test('F133 sanity: sliceCall actually isolates the runJob call (not the whole file)', () => {
  const source = readFileSync(new URL('../scripts/run-u.mjs', import.meta.url), 'utf8');
  const call = sliceCall(source, 'runJob');
  assert.ok(call.length > 0 && call.length < source.length, 'must be a real slice, not the whole file');
  assert.match(call, /approvals/, 'must actually contain the runJob options bag');
});

// ---------------------------------------------------------------------------
// F133 (second catch, same fire): the archived spine `u-mtqwmb9l.jsonl` shows
// `close-timing` as the FIRST record, one ahead of `job-start` — the pre-fix
// `scripts/run-u.mjs` emitted its own `close-timing` reading before ever
// calling `runJob` (which is what emits `job-start`). Every spine reader
// (replay, the readshim battery, spend slicers) assumes `job-start` opens the
// file. `runJob` (`src/run.js`) emits `job-start` as literally its first emit
// after the approval/validation gate, BEFORE `runPlan` (and therefore before
// `runPlan`'s own `close-timing` emit) is ever called — this was already true
// of the library; F133's fix (run-u no longer emitting its own early
// close-timing record) removes the ONLY writer that could get ahead of it.
// ---------------------------------------------------------------------------

test('runJob: job-start is always the spine\'s first record, close-timing (if any) comes after it', async (t) => {
  const wd = makePatient(t);
  const src = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src));
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, []);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached' }]);
  const { events, emit } = collector();
  await runJob(jv.job, {
    approvals: [{ specHash: jobSpecHash(jv.job), signer: 'test', ts: 'now' }],
    workdir: wd, provider, emit,
  });
  assert.ok(events.length > 0, 'the run must have emitted something');
  assert.equal(events[0].type, 'job-start', `the spine's first record must be job-start, got: ${events[0].type}`);
  const closeTimingIdx = events.findIndex((e) => e.type === 'close-timing');
  const jobStartIdx = events.findIndex((e) => e.type === 'job-start');
  assert.ok(closeTimingIdx === -1 || closeTimingIdx > jobStartIdx, 'close-timing, if present at all, must come after job-start, never before');
});

test('runPlan: maxWallMs under the effective close timeout refuses wall-under-close-timeout at $0', async (t) => {
  const wd = makePatient(t);
  const src = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  // signed closeTimeoutMs of 500_000ms, maxWallMs of 200_000ms (>= MIN_WALL_MS's
  // own static floor of 120_000, so it passes validateJob, but under the
  // EFFECTIVE ceiling this run would actually use).
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src), { closeTimeoutMs: 500_000, maxWallMs: 200_000 });
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], JSON.stringify(jv.reds));
  const provider = scriptedProvider([{ text: 'never called' }]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'wall-under-close-timeout');
  assert.equal(provider.calls.length, 0);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-under-close-timeout');
});

test('runPlan: maxWallMs at or above the effective close timeout is fine', async (t) => {
  const wd = makePatient(t);
  const src = 'process.exit(0);\n';
  writeFileSync(join(wd, 'verdict-close.mjs'), src);
  const job = JOB_WITH_CLOSE('node verdict-close.mjs', hashCloseScriptBytes(src), { closeTimeoutMs: 150_000, maxWallMs: 150_000 });
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, []);
  const provider = scriptedProvider([{ text: 'scout' }, { text: 'never reached' }]);
  const { emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, remainingUsd: () => 1.5 });
  assert.notEqual(outcome, 'wall-under-close-timeout');
});
