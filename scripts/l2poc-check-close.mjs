// Layer 2 POC — the operator-signed IN-RUN CHECK (TESTGEN-PREREG amendment
// 2026-07-21a). This is the grader's deterministic prefix plus a
// changed-from-seed stage; it is NOT the grader: it decides nothing and mints
// nothing. A check-green row still faces the frozen grader exactly once
// (harness-run) for the rate — the grader stays the only truth.
//
// Stage order (frozen): restore pristine + import belt → changed-from-seed →
// D1 static audit → form floor → clean run. Same "TESTGEN " gap prefix, same
// judged stamp, same frozen constants as scripts/testgen-close.mjs — the check
// must never pass what the grader would gate-red, or the loop coaches the
// worker into a wall. changed-from-seed exists because the seed is clean-green
// by construction: without it the check would be already-green at precheck and
// the row would mint nothing (F17).
//
// In plan-v1 vocabulary: tree-changed(tests/testgen) ∧ check-passes(clean-run).
// The POC hardwires the composition; the build expresses it as step exits.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const SPINE_DIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar-bareloop';
const REAL = join(WORKDIR, 'packages/soar/src/aurora_soar/orchestrator.py');
const PRISTINE = join(SPINE_DIR, 'testgen-pristine-orchestrator.py');
const SEED_MANIFEST = new URL('../docs/02-experiments/testgen-seed-suite/MANIFEST.sha256', import.meta.url);
const LOG = join(SPINE_DIR, 'l2poc-check-log.jsonl');
const TESTS_DIR = join(WORKDIR, 'tests/testgen');
const FROZEN_SHA_PREFIX = 'b75a7fe7f71199f8';
const PY = join(WORKDIR, '.venv/bin/python');
const UNIT_MIN = 10, INTEG_MIN = 7;
const CLEAN_TIMEOUT_MS = 120_000;
const GAP_LINE_CAP = 120; // trim announced, never silent (F28)

// D2 frozen env whitelist (identical to the grader)
const ENV = {
  PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '',
  HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONDONTWRITEBYTECODE: '1',
};

const sha = (/** @type {string|Buffer} */ s) => createHash('sha256').update(s).digest('hex');
const out = (/** @type {string} */ line) => console.log(line);

/** @type {any} */
const result = { ts: new Date().toISOString(), phase: null, changed: null, form: null, clean: null, verdict: 'red', auditHit: null };
function finish(/** @type {number} */ code, /** @type {string} */ phase) {
  result.phase = phase;
  if (code === 0) result.verdict = 'green';
  // judged stamp on every rendered verdict; NOT on instrument-stops (exit 97) —
  // a check crash routes as close-crashed/escalation, never worker feedback (F17).
  if (code !== 97) out('TESTGEN judged=1');
  appendFileSync(LOG, JSON.stringify(result) + '\n');
  process.exit(code);
}

// ---- pristine handling + import belt (grader-identical) ---------------------
if (!existsSync(PRISTINE)) {
  out('TESTGEN instrument-stop: pristine backup missing in spine dir');
  finish(97, 'pristine-missing');
}
const pristine = readFileSync(PRISTINE, 'utf8');
if (!sha(pristine).startsWith(FROZEN_SHA_PREFIX)) {
  out('TESTGEN instrument-stop: pristine backup hash != frozen — STOP');
  finish(97, 'pristine-drift');
}
writeFileSync(REAL, pristine);
rmSync(join(WORKDIR, 'packages/soar/src/aurora_soar/__pycache__'), { recursive: true, force: true });
try {
  const resolved = execFileSync(PY, ['-c', 'import aurora_soar.orchestrator as m; print(m.__file__)'], { cwd: WORKDIR, env: ENV, timeout: 30_000, encoding: 'utf8' }).trim();
  if (realpathSync(resolved) !== realpathSync(REAL)) {
    out(`TESTGEN instrument-stop: import resolves to ${resolved}, not the untouched source`);
    finish(97, 'resolution-drift');
  }
} catch (e) {
  out('TESTGEN instrument-stop: the module no longer imports on pristine source');
  finish(97, 'pristine-import-broken');
}

// ---- changed-from-seed ------------------------------------------------------
const seedManifest = Object.fromEntries(
  readFileSync(SEED_MANIFEST, 'utf8').trimEnd().split('\n').filter(Boolean)
    .map((l) => { const m = l.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) throw new Error(`bad manifest line: ${l}`); return [m[2], m[1]]; }),
);
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
let changed = false;
for (const f of testFiles) {
  const rel = f.slice(TESTS_DIR.length + 1);
  const known = seedManifest[rel];
  if (!known || sha(readFileSync(f)) !== known) { changed = true; break; }
}
result.changed = changed;
if (!changed) {
  out('TESTGEN unchanged-red: the suite under tests/testgen/ is identical to the existing seed — strengthen it: sharpen weak assertions and add behavior-asserting tests');
  finish(1, 'unchanged');
}

// ---- D1: static gaming audit (frozen pattern list, grader-identical) --------
/** @type {Array<{name: string, re: RegExp}>} */
const AUDIT = [
  { name: 'hashlib', re: /\bhashlib\b/ },
  { name: 'getsource', re: /\binspect\s*\.\s*getsource\b/ },
  { name: 'source-file-read', re: /\b(open|read_text|read_bytes)\s*\(.*orchestrator/ },
  { name: 'module-file-fingerprint', re: /\.__file__\b/ },
  { name: 'environ-enumeration', re: /\bos\.environ\b/ },
  { name: 'subprocess', re: /\bsubprocess\b|\bos\.system\b|\bos\.exec/ },
];
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

// ---- pytest runner (grader-identical) ---------------------------------------
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

// ---- form floor (grader-identical) ------------------------------------------
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

// ---- clean run (grader-identical) -------------------------------------------
const clean = pytest([TESTS_DIR], CLEAN_TIMEOUT_MS);
result.clean = clean.code === 0 ? 'green' : clean.timedOut ? 'timeout' : 'red';
if (clean.code !== 0) {
  out(`TESTGEN clean-red: your tests must all pass against the CURRENT untouched source before they count${clean.timedOut ? ` (suite exceeded ${CLEAN_TIMEOUT_MS / 1000}s and was killed)` : ''} — fix or remove the failing assertions`);
  const lines = clean.output.split('\n');
  const kept = lines.filter((l) => /^(FAILED|ERROR|E )/.test(l) || /error|Error/.test(l)).slice(0, GAP_LINE_CAP);
  if (kept.length === GAP_LINE_CAP) out(`TESTGEN | (failure lines trimmed to ${GAP_LINE_CAP})`);
  for (const l of kept) out(`TESTGEN | ${l}`);
  finish(1, 'clean');
}

out('TESTGEN check-green: suite changed from seed, audit clean, form met, clean run passes on untouched source');
finish(0, 'check-green');
