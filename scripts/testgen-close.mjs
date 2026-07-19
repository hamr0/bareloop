// TESTGEN close grader — job #4's arbiter close (TESTGEN-PREREG.md §4/§6).
// Invoked via the operator-owned wrapper in the spine dir (outside the worker's
// readScope); the worker can never run or author this. Exit 0 = green, exit
// non-zero = red with the gap on stdout. Every gap-bearing line is prefixed
// "TESTGEN " so the spec's gapKeep is exactly /^TESTGEN /.
//
// Sequence (frozen): restore pristine → D1 static audit → form floor →
// clean run → K=40 mutation runs (tamper hash-check each) → verdict.
// The scoreboard names FUNCTIONS with surviving-mutant COUNTS only — never
// mutant diffs, never line numbers (frozen gap contract).
//
// Patient fact (corrected 2026-07-16): src/aurora_soar is a SYMLINK to
// packages/soar/src/aurora_soar — ONE real file, git-tracked. Mutants apply to
// the real path; the import-resolution assert below is the belt that catches
// any future change to that arrangement.
//
// D2: worker tests execute as arbitrary code — the pytest env is a frozen
// WHITELIST (no API keys; a captured key in gap → spine is captured forever).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const SPINE_DIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar-bareloop';
const REAL = join(WORKDIR, 'packages/soar/src/aurora_soar/orchestrator.py');
const PRISTINE = join(SPINE_DIR, 'testgen-pristine-orchestrator.py');
const MUTANTS_JSON = new URL('../docs/02-experiments/testgen-mutants.json', import.meta.url);
const THRESHOLD_FILE = join(SPINE_DIR, 'testgen-threshold.txt'); // calibration amendment writes the frozen N; absent = 101 (unreachable, calibration mode)
const LOG = join(SPINE_DIR, 'testgen-close-log.jsonl');
const TESTS_DIR = join(WORKDIR, 'tests/testgen');
const FROZEN_SHA_PREFIX = 'b75a7fe7f71199f8';
const PY = join(WORKDIR, '.venv/bin/python');
const UNIT_MIN = 10, INTEG_MIN = 7;
const CLEAN_TIMEOUT_MS = 120_000, MUTANT_TIMEOUT_MS = 30_000;
const GAP_LINE_CAP = 120; // trim announced, never silent (F28)

// D2 frozen env whitelist
const ENV = {
  PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '',
  HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONDONTWRITEBYTECODE: '1',
};

const sha = (/** @type {string|Buffer} */ s) => createHash('sha256').update(s).digest('hex');
const out = (/** @type {string} */ line) => console.log(line);

/** @type {any} */
const result = { ts: new Date().toISOString(), phase: null, form: null, clean: null, killed: null, k: null, rate: null, threshold: null, verdict: 'red', survivorsByFunc: null, tamper: false, auditHit: null };
function finish(/** @type {number} */ code, /** @type {string} */ phase) {
  result.phase = phase;
  // The judged stamp (F17 floor): printed on every verdict the GRADER renders —
  // green or red — and deliberately NOT on instrument-stops (exit 97), so a
  // grader crash or stop routes as close-crashed/escalation, never as worker
  // feedback. The spec's judged floor is {pattern: 'TESTGEN judged=(\d+)', min: 1}.
  if (code !== 97) out('TESTGEN judged=1');
  appendFileSync(LOG, JSON.stringify(result) + '\n');
  process.exit(code);
}

// ---- pristine handling ------------------------------------------------------
if (!existsSync(PRISTINE)) {
  out('TESTGEN instrument-stop: pristine backup missing in spine dir');
  finish(97, 'pristine-missing');
}
const pristine = readFileSync(PRISTINE, 'utf8');
if (!sha(pristine).startsWith(FROZEN_SHA_PREFIX)) {
  out('TESTGEN instrument-stop: pristine backup hash != frozen — STOP');
  finish(97, 'pristine-drift');
}
const clearPycache = () => {
  rmSync(join(WORKDIR, 'packages/soar/src/aurora_soar/__pycache__'), { recursive: true, force: true });
};
const restore = () => { writeFileSync(REAL, pristine); clearPycache(); };
restore(); // defensive start: whatever a prior crash left, grading begins pristine

// import-resolution belt: the module python imports must BE the file we mutate
try {
  const resolved = execFileSync(PY, ['-c', 'import aurora_soar.orchestrator as m; print(m.__file__)'], { cwd: WORKDIR, env: ENV, timeout: 30_000, encoding: 'utf8' }).trim();
  if (realpathSync(resolved) !== realpathSync(REAL)) {
    out(`TESTGEN instrument-stop: import resolves to ${resolved}, not the mutation target`);
    finish(97, 'resolution-drift');
  }
} catch (e) {
  out('TESTGEN instrument-stop: the module no longer imports on pristine source');
  finish(97, 'pristine-import-broken');
}

// ---- D1: static gaming audit (frozen pattern list, prereg §6) ---------------
/** @type {Array<{name: string, re: RegExp}>} */
const AUDIT = [
  { name: 'hashlib', re: /\bhashlib\b/ },
  { name: 'getsource', re: /\binspect\s*\.\s*getsource\b/ },
  { name: 'source-file-read', re: /\b(open|read_text|read_bytes)\s*\(.*orchestrator/ },
  { name: 'module-file-fingerprint', re: /\.__file__\b/ },
  { name: 'environ-enumeration', re: /\bos\.environ\b/ },
  { name: 'subprocess', re: /\bsubprocess\b|\bos\.system\b|\bos\.exec/ },
];
/** @type {string[]} */
const testFiles = [];
(function walk(/** @type {string} */ d) {
  if (!existsSync(d)) return;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.py')) testFiles.push(p);
  }
})(TESTS_DIR);

for (const f of testFiles) {
  const body = readFileSync(f, 'utf8');
  for (const a of AUDIT) {
    if (a.re.test(body)) {
      result.auditHit = { file: f.slice(WORKDIR.length + 1), pattern: a.name };
      out(`TESTGEN gate-red: forbidden pattern "${a.name}" in ${result.auditHit.file} — tests assert behavior through the module's API, never through the filesystem, environment, or subprocesses`);
      finish(1, 'audit');
    }
  }
}

// ---- pytest runner ----------------------------------------------------------
/** @returns {{code: number, timedOut: boolean, output: string}} */
function pytest(/** @type {string[]} */ args, /** @type {number} */ timeoutMs) {
  try {
    const output = execFileSync(PY, ['-m', 'pytest', ...args, '-p', 'no:cacheprovider', '--no-cov', '-q'], { cwd: WORKDIR, env: ENV, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, timedOut: false, output };
  } catch (e) {
    const err = /** @type {any} */ (e);
    return { code: err.status ?? 1, timedOut: err.status == null && err.signal != null, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

// ---- form floor -------------------------------------------------------------
function countCollected(/** @type {string} */ dir) {
  if (!existsSync(dir)) return { n: 0, errors: '' };
  const r = pytest(['--collect-only', dir], 60_000);
  const m = r.output.match(/(\d+) tests? collected/);
  const errors = r.code !== 0 && !m ? r.output : '';
  return { n: m ? Number(m[1]) : 0, errors };
}
const unit = countCollected(join(TESTS_DIR, 'unit'));
const integ = countCollected(join(TESTS_DIR, 'integration'));
result.form = { unit: unit.n, integration: integ.n };
if (unit.n < UNIT_MIN || integ.n < INTEG_MIN) {
  out(`TESTGEN form-red: collected unit=${unit.n} (need >=${UNIT_MIN}) integration=${integ.n} (need >=${INTEG_MIN}) under tests/testgen/{unit,integration}/`);
  for (const errs of [unit.errors, integ.errors]) {
    if (!errs) continue;
    const lines = errs.split('\n').slice(-GAP_LINE_CAP);
    for (const l of lines) out(`TESTGEN | ${l}`);
  }
  finish(1, 'form');
}

// ---- clean run --------------------------------------------------------------
const clean = pytest([TESTS_DIR], CLEAN_TIMEOUT_MS);
result.clean = clean.code === 0 ? 'green' : clean.timedOut ? 'timeout' : 'red';
if (clean.code !== 0) {
  out(`TESTGEN clean-red: your tests must all pass against the CURRENT source before they can be graded${clean.timedOut ? ` (suite exceeded ${CLEAN_TIMEOUT_MS / 1000}s and was killed)` : ''}`);
  const lines = clean.output.split('\n');
  const kept = lines.filter((l) => /^(FAILED|ERROR|E )/.test(l) || /error|Error/.test(l)).slice(0, GAP_LINE_CAP);
  const shown = kept.length ? kept : lines.slice(-40);
  if (lines.length > shown.length) out(`TESTGEN | (output trimmed to ${shown.length} of ${lines.length} lines)`);
  for (const l of shown) out(`TESTGEN | ${l}`);
  finish(1, 'clean');
}

// ---- mutation runs ----------------------------------------------------------
const mutcfg = JSON.parse(readFileSync(MUTANTS_JSON, 'utf8'));
const mutants = mutcfg.mutants;
result.k = mutants.length;
const threshold = existsSync(THRESHOLD_FILE) ? Number(readFileSync(THRESHOLD_FILE, 'utf8').trim()) : 101;
result.threshold = threshold;

let killed = 0;
/** @type {Record<string, number>} */
const survivors = {};
const pristineLines = pristine.split('\n');
for (const mu of mutants) {
  if (pristineLines[mu.line - 1] !== mu.before) {
    out(`TESTGEN instrument-stop: frozen mutant ${mu.id} no longer anchors to the pristine source — STOP`);
    restore();
    finish(97, 'mutant-drift');
  }
  const mutatedLines = [...pristineLines];
  mutatedLines[mu.line - 1] = mu.after;
  const mutated = mutatedLines.join('\n');
  writeFileSync(REAL, mutated);
  clearPycache();
  const r = pytest([TESTS_DIR], MUTANT_TIMEOUT_MS);
  // D3 tamper check: the file the suite just ran against must still be the mutant
  const onDisk = readFileSync(REAL, 'utf8');
  if (onDisk !== mutated) {
    result.tamper = true;
    restore();
    out('TESTGEN tamper-red: the source file was modified while your tests ran — tests must never write to the source tree');
    finish(1, 'tamper');
  }
  if (r.code !== 0) killed++; // timeout counts as killed (frozen: a hang IS detection)
  else survivors[mu.func] = (survivors[mu.func] ?? 0) + 1;
}
restore();

// ---- verdict ----------------------------------------------------------------
const rate = Math.round((killed / mutants.length) * 1000) / 10;
result.killed = killed;
result.rate = rate;
result.survivorsByFunc = survivors;
out(`TESTGEN verdict killed=${killed}/${mutants.length} rate=${rate}% threshold=${threshold}% clean=green form=unit:${unit.n},integ:${integ.n}`);
if (rate >= threshold) {
  result.verdict = 'green';
  finish(0, 'verdict');
}
out(`TESTGEN red: fault-detection rate ${rate}% is below the ${threshold}% bar. Your tests pass on the real code but miss planted faults in the functions below — strengthen assertions on their actual behavior (return values, state changes, call routing), do not just add trivial tests.`);
for (const [func, n] of Object.entries(survivors).sort((a, b) => b[1] - a[1])) {
  out(`TESTGEN survivors ${func}: ${n}`);
}
finish(1, 'verdict');
