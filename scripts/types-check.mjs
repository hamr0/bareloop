// TYPES named checks — operator-SIGNED, agent-REFERENCED (TYPES-PREREG.md §5.4).
//
// The agent may compose these into its plan by name via check-passes(<name>); it can never
// author one. Checks decide nothing and mint nothing — the close (types-close.mjs) stays the
// only truth. Which checks the agent attaches to which steps IS the workflow-authoring
// behaviour under test, so the menu is offered and the composition is never prescribed.
//
// argv[2] is the check name; argv[3] is the verbosity arm and MUST match the close's arm.
// Without that coupling `typecheck-clean` would hand the worker verbatim error lines inside
// a counts-only run, bypassing the screened channel entirely and destroying the §6.1
// contrast — the check would be a second, wider feedback path the arm never authorised.
// Exit 0 = pass. Gap lines are prefixed "TYPES-CHECK ".

import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { JUDGED_MARKER } from '../src/kinds.js';

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-types';
const SPINE_DIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-types-bareloop';
// Checks are where most in-run iteration happens, so the strict-error TRAJECTORY — the H2
// gradient variable — lives here, not only in the close log. Without this the screen's
// instrument would be blind to the very thing it screens for (F55's every-writer rule).
// The log is the arbiter's book: fs.deny-ed inside the worker's readScope.
const LOG = join(SPINE_DIR, 'types-check-log.jsonl');
const SEED_REF = 'ca1af8a';
const TESTS_MIN = 410;
const GAP_LINE_CAP = 60;
const ENV = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NO_COLOR: '1' };

const NAME = process.argv[2] ?? '';
const VERBOSITY = process.argv[3] === 'full' ? 'full' : 'counts';
const out = (/** @type {string} */ l) => console.log(l);

function run(/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {number} */ timeout) {
  try {
    return { code: 0, stdout: execFileSync(cmd, args, { cwd: WORKDIR, env: ENV, timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }), stderr: '' };
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err?.killed || err?.signal) return { code: null, stdout: String(err?.stdout ?? ''), stderr: String(err?.stderr ?? '') };
    return { code: typeof err?.status === 'number' ? err.status : 1, stdout: String(err?.stdout ?? ''), stderr: String(err?.stderr ?? '') };
  }
}

function emitCapped(/** @type {string[]} */ lines, /** @type {string} */ label) {
  const shown = lines.slice(0, GAP_LINE_CAP);
  for (const l of shown) out(`TYPES-CHECK ${label} ${l}`);
  if (lines.length > shown.length) out(`TYPES-CHECK ${label} … ${lines.length - shown.length} further lines trimmed (cap ${GAP_LINE_CAP})`);
}

const done = (/** @type {number} */ code, /** @type {any} */ data = {}) => {
  try { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), check: NAME, verbosity: VERBOSITY, pass: code === 0, ...data }) + '\n'); } catch { /* best-effort */ }
  out(`TYPES-CHECK ${JUDGED_MARKER}`);
  process.exit(code);
};

if (NAME === 'typecheck-clean') {
  const r = run('npx', ['tsc', '--noEmit', '--strict'], 180_000);
  if (r.code === null) { out('TYPES-CHECK typecheck-clean: timed out'); done(1); }
  const errs = (r.stdout + '\n' + r.stderr).split('\n').map((s) => s.trim()).filter((l) => /error TS\d+/.test(l));
  if (!errs.length) { out('TYPES-CHECK typecheck-clean: PASS — zero strict errors'); done(0, { errors: 0 }); }
  out(`TYPES-CHECK typecheck-clean: FAIL — ${errs.length} strict errors remain`);
  if (VERBOSITY === 'full') {
    emitCapped(errs, 'error');
  } else {
    /** @type {Map<string, number>} */ const byFile = new Map();
    /** @type {Map<string, number>} */ const byCode = new Map();
    for (const l of errs) {
      const f = (l.match(/^(\S+?)\(/) ?? [])[1] ?? '(unknown)';
      const c = (l.match(/error (TS\d+)/) ?? [])[1] ?? '(unknown)';
      byFile.set(f, (byFile.get(f) ?? 0) + 1);
      byCode.set(c, (byCode.get(c) ?? 0) + 1);
    }
    emitCapped([...byFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f}: ${n}`), 'file');
    emitCapped([...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}: ${n}`), 'code');
  }
  done(1, { errors: errs.length });
}

if (NAME === 'suite-green') {
  const r = run('npm', ['test'], 300_000);
  if (r.code === null) { out('TYPES-CHECK suite-green: timed out'); done(1); }
  const o = r.stdout + '\n' + r.stderr;
  const tests = Number((o.match(/^# tests (\d+)$/m) ?? [])[1] ?? NaN);
  const fails = Number((o.match(/^# fail (\d+)$/m) ?? [])[1] ?? NaN);
  if (!Number.isFinite(tests) || !Number.isFinite(fails)) { out('TYPES-CHECK suite-green: FAIL — the suite produced no readable counts'); done(1, { tests: null, fails: null }); }
  if (tests < TESTS_MIN) { out(`TYPES-CHECK suite-green: FAIL — ${tests} tests executed, floor is ${TESTS_MIN}`); done(1, { tests, fails }); }
  if (fails > 0) {
    out(`TYPES-CHECK suite-green: FAIL — ${fails} of ${tests} tests fail`);
    emitCapped(o.split('\n').filter((l) => /^not ok /.test(l)).map((s) => s.trim()), 'failing');
    done(1, { tests, fails });
  }
  out(`TYPES-CHECK suite-green: PASS — ${tests} executed, 0 failing`);
  done(0, { tests, fails });
}

if (NAME === 'no-suppressions') {
  /** @type {Array<{ id: string, name: string, re: RegExp }>} */
  const AUDIT = [
    { id: 'D1a', name: '@ts-ignore', re: /@ts-ignore/g },
    { id: 'D1b', name: '@ts-expect-error', re: /@ts-expect-error/g },
    { id: 'D1c', name: '@ts-nocheck', re: /@ts-nocheck/g },
    { id: 'D1d', name: 'any in a JSDoc type', re: /\{[^}]*\bany\b[^}]*\}/g },
    { id: 'D1e', name: 'JSDoc wildcard {*}', re: /\{\s*\*\s*\}/g },
  ];
  const diff = run('git', ['diff', '--name-only', SEED_REF, '--'], 60_000);
  if (diff.code !== 0) { out('TYPES-CHECK no-suppressions: FAIL — cannot diff against the seed'); done(1); }
  const changed = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const untracked = run('git', ['ls-files', '--others', '--exclude-standard'], 60_000);
  if (untracked.code === 0) for (const f of untracked.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) if (!changed.includes(f)) changed.push(f);

  const count = (/** @type {string} */ b, /** @type {RegExp} */ re) => (b.match(re) ?? []).length;
  /** @type {string[]} */ const hits = [];
  for (const f of changed) {
    let now = '';
    try { now = readFileSync(join(WORKDIR, f), 'utf8'); } catch { continue; }
    const seed = run('git', ['show', `${SEED_REF}:${f}`], 30_000);
    const before = seed.code === 0 ? seed.stdout : '';
    for (const a of AUDIT) {
      const n = count(now, a.re), b = count(before, a.re);
      if (n > b) hits.push(`${a.id} "${a.name}" in ${f}: ${b} → ${n}`);
    }
  }
  if (!hits.length) { out(`TYPES-CHECK no-suppressions: PASS — no suppression or any-escape added across ${changed.length} changed files`); done(0, { changedFiles: changed.length, hits: 0 }); }
  out(`TYPES-CHECK no-suppressions: FAIL — ${hits.length} suppression/any-escape additions`);
  emitCapped(hits, 'added');
  done(1, { changedFiles: changed.length, hits: hits.length });
}

out(`TYPES-CHECK unknown check name "${NAME}" — the signed menu is: typecheck-clean, suite-green, no-suppressions`);
process.exit(97); // instrument stop: an unsigned name is never a worker-readable failure
