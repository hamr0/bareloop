// Lift-contrast job A — the close for the pulselog-u types job, as NAMED STAGES.
//
// One command, one stage per invocation: `node u-pulselog-close.mjs <stage>`. The
// stages ARE the close (run in order, first red is the verdict) and the agent's
// ruler menu DERIVES from them (PRD v1.28) — nobody hand-authors a check.
//
// Operator-owned and versioned HERE, in bareloop, not in the patient: the worker's
// readScope is the patient tree, so the arbiter's own instrument is out of reach by
// construction (v1.12 — the worker never reads the arbiter's books).
//
// Holds the JOB SHAPE from the aurora-u/litectx-u closes (changed-from-seed →
// typecheck → typecheck-outside → tests-kept → suite-green → no-suppressions)
// while SCOPING the typecheck the way
// aurora-u scoped mypy to the spawner package: the grade is zero strict errors in
// the SCOPE files, with a ceiling on errors OUTSIDE the scope so fixing the target
// can never be bought by breaking the rest (seed: 27 in scope, 40 outside).
//
// Output contract: every gap line is prefixed `PULSELOG ` (the spec's gapKeep);
// `PULSELOG judged=1` on every real judgment (F17); no culprit file is named beyond
// what the tool itself reports.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/pulselog-u';
const SEED_REF = '92d71a7c1253f8f2430e2d308ecfef01c826b5c2'; // the patient as seeded
const PKG_SRC = 'src';
const SCOPE = ['src/email.js', 'src/backup.js']; // the job's target files
const OUTSIDE_MAX = 40; // the seed's own outside-scope strict-error count — a ceiling, never a target
const TESTS_MIN = 67; // the seed's EXECUTED count — executed, never passed (F40)
const GAP_LINE_CAP = 40;
// Suppressing an error is not typing it — same measured battery as u-litectx-close.mjs
// (tsc 5.x, `--noEmit --strict --allowJs --checkJs`); see that file for the per-rule
// measurement notes. `unknown` is deliberately legal: it forces narrowing.
const SUPPRESSIONS = [
  { id: 'ts-ignore', re: /@ts-ignore/ },
  { id: 'ts-expect-error', re: /@ts-expect-error/ },
  { id: 'ts-nocheck', re: /@ts-nocheck/ },
  { id: 'eslint-disable', re: /eslint-disable/ },
  { id: 'any', re: /(?:[{<|(\[:,]|\bas)\s*any\b|\bany\[\]/ },
  { id: 'any-star', re: /@\w+\s*\{\s*[*?]\s*\}/ },
  { id: 'cast', re: /@type\s*\{.*\}\s*\*\/\s*\(/ },
];

const stage = process.argv[2];
const out = (/** @type {string} */ line) => console.log(`PULSELOG ${line}`);
/** every real judgment says so; an instrument stop (97) deliberately does not */
const done = (/** @type {number} */ code) => { if (code !== 97) out('judged=1'); process.exit(code); };
const stop = (/** @type {string} */ why) => { out(`instrument-stop: ${why}`); process.exit(97); };

const run = (/** @type {string} */ cmd, /** @type {string[]} */ args, timeoutMs = 900_000) => {
  const r = spawnSync(cmd, args, { cwd: WORKDIR, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 28, env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}`, timedOut: r.error?.code === 'ETIMEDOUT', why: r.error?.code ?? r.signal ?? 'no error, no signal' };
};
/** A spawn with NO exit code was not a judgment — which instrument-stop matters (see
 * u-litectx-close.mjs for the measured spawnSync shapes). */
const noExit = (/** @type {{code: number|null, timedOut: boolean, why: string}} */ r, /** @type {string} */ what) => {
  if (r.timedOut) stop(`${what} timed out`);
  if (r.code === null) stop(`${what} died without an exit code (${r.why}) — the instrument broke, the tree was never judged`);
};
/** the tool's own lines, capped and prefixed — trims are ANNOUNCED, never silent (F28) */
const echo = (/** @type {string[]} */ lines) => {
  const shown = lines.slice(0, GAP_LINE_CAP);
  for (const l of shown) out(`| ${l}`);
  if (lines.length > shown.length) out(`| (${lines.length - shown.length} further lines elided, cap ${GAP_LINE_CAP})`);
};

const git = (/** @type {string[]} */ args) => {
  try { return execFileSync('git', ['-C', WORKDIR, ...args], { encoding: 'utf8' }); }
  catch { return null; }
};

// `git diff <seed>` is blind to UNTRACKED files (tail-review F-5): a brand-new file under
// src/ holding the suppressions would never be diffed, never scanned, and could re-export a
// "clean" surface into the SCOPE files — a constructible fake green. So the changed set is
// diff PLUS untracked (`ls-files --others --exclude-standard`), with exactly one named
// exclusion: `.litectx/` is the arbiter-side store the retrieval verbs create in the
// workdir, not worker output, and it is not in the patient's .gitignore.
const untrackedFiles = () => {
  const o = git(['ls-files', '--others', '--exclude-standard']);
  if (o === null) stop('git ls-files (untracked sweep) failed');
  // TWO arbiter books, both named: `.litectx/` (the retrieval store) and
  // `gate-audit.jsonl` (the gate's own in-flight audit, relocated beside the spine
  // only at run end). The audit exclusion was paid for live (u-msdonzxl): the v2
  // sweep's first mid-run firing red-carded the ARBITER'S OWN FILE as a worker
  // change, and the fix loop burned to the wall on a red the worker can neither
  // read nor delete. Exact name, never a pattern: a worker-authored
  // `src/gate-audit.jsonl` must still count.
  return o.split('\n').filter(Boolean).filter((f) => !f.startsWith('.litectx/') && f !== 'gate-audit.jsonl');
};
const changedFiles = () => {
  if (git(['rev-parse', '--verify', `${SEED_REF}^{commit}`]) === null) stop(`frozen seed commit ${SEED_REF.slice(0, 12)} not found in the patient`);
  const d = git(['diff', '--name-only', SEED_REF, '--']);
  if (d === null) stop('git diff against the seed failed');
  return [...new Set([...d.split('\n').filter(Boolean), ...untrackedFiles()])];
};

if (stage === 'changed-from-seed') {
  const changed = changedFiles();
  if (changed.length === 0) { out('red: the tree is identical to the seed — nothing was changed'); done(1); }
  const outside = changed.filter((f) => !f.startsWith(`${PKG_SRC}/`));
  if (outside.length) {
    out(`red: ${outside.length} file(s) changed outside ${PKG_SRC}/ — the tests and the config are not negotiable`);
    echo(outside);
    done(1);
  }
  out(`green: ${changed.length} file(s) changed, all under ${PKG_SRC}/`);
  done(0);
}

// ONE POPULATION PER STAGE — the law for close AUTHORS (F84, hamr-signed
// 2026-08-05). The strict typecheck answers two structurally different questions:
// how many faults are IN the target files, and how many errors exist OUTSIDE
// them. Under one stage name those two counts land in one trend series, and a 29
// (in-scope faults) followed by a 4 (outside-scope overflow) reads CONVERGING on
// a run that has only swapped which wall it is behind. The trend reader is never
// taught to tell two prose shapes apart (the F49 precedent) — the close splits.
const strictErrors = () => {
  const r = run('npx', ['tsc', '--noEmit', '--strict'], 600_000);
  noExit(r, 'the strict typecheck');
  const errs = r.text.split('\n').map((s) => s.trimEnd()).filter((l) => /error TS\d+/.test(l));
  if (errs.length === 0 && r.code !== 0) stop(`tsc exited ${r.code} with no readable error lines — the run did not complete`);
  return {
    inScope: errs.filter((l) => SCOPE.some((f) => l.startsWith(f))),
    outside: errs.filter((l) => !SCOPE.some((f) => l.startsWith(f))),
  };
};

if (stage === 'typecheck') {
  const { inScope } = strictErrors();
  if (inScope.length > 0) {
    out(`red: tsc --strict reports ${inScope.length} error(s) in ${SCOPE.join(', ')}`);
    echo(inScope);
    done(1);
  }
  out(`green: tsc --strict reports zero errors in ${SCOPE.join(', ')}`);
  done(0);
}

// Runs IMMEDIATELY AFTER `typecheck`, which is exactly where the outside-scope
// branch sat inside the single stage: `runStages` is first-red-wins, so the
// worker still sees its in-scope faults before this ceiling can ever red. The
// effective gate sequence is unchanged — only the series each number donates to.
if (stage === 'typecheck-outside') {
  const { outside } = strictErrors();
  if (outside.length > OUTSIDE_MAX) {
    out(`red: ${outside.length} strict error(s) outside ${SCOPE.join(', ')}, above the seed's ${OUTSIDE_MAX} — the target files are clean but new errors were introduced elsewhere, not fixed`);
    echo(outside);
    done(1);
  }
  out(`green: ${outside.length} strict error(s) outside ${SCOPE.join(', ')}, at or below the seed's ${OUTSIDE_MAX}`);
  done(0);
}

// The same law, the same split: an EXECUTED-COUNT FLOOR (higher is better,
// ~1000-scale) and a FAILURE COUNT (lower is better, single digits) are two
// populations, and one series cannot hold both. `tests-kept` runs FIRST —
// exactly where the floor check sat inside the single stage — so a shrunken
// suite still reds before any failure count is ever reported.
const suite = () => {
  const r = run('npm', ['test'], 900_000);
  noExit(r, 'the patient suite');
  const num = (/** @type {RegExp} */ re) => { const m = r.text.match(re); return m ? Number(m[1]) : NaN; };
  const tests = num(/^# tests (\d+)$/m);
  const failed = num(/^# fail (\d+)$/m);
  if (!Number.isFinite(tests) || !Number.isFinite(failed)) stop('the suite produced no readable TAP summary — the run did not complete');
  return { code: r.code, tests, failed, notOk: r.text.split('\n').filter((l) => /^not ok \d+/.test(l)).map((s) => s.trim()) };
};

if (stage === 'tests-kept') {
  const s = suite();
  if (s.tests < TESTS_MIN) { out(`red: ${s.tests} tests executed, below the seed's ${TESTS_MIN} — tests were lost, not kept`); echo(s.notOk); done(1); }
  out(`green: ${s.tests} tests executed, at or above the seed's ${TESTS_MIN}`);
  done(0);
}

if (stage === 'suite-green') {
  const s = suite();
  if (s.failed > 0 || s.code !== 0) {
    out(`red: ${s.failed} test(s) now fail — a type annotation must describe what the code already does`);
    echo(s.notOk);
    done(1);
  }
  out(`green: ${s.tests} tests executed, 0 failing`);
  done(0);
}

if (stage === 'no-suppressions') {
  const changed = changedFiles().filter((f) => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'));
  // an untracked file has no diff — EVERY line of it is added, so the whole file is scanned
  const untracked = new Set(untrackedFiles());
  const hits = [];
  for (const f of changed) {
    let added;
    if (untracked.has(f)) {
      let body; try { body = readFileSync(join(WORKDIR, f), 'utf8'); } catch { stop(`unreadable untracked file ${f}`); }
      added = (body ?? '').split('\n').map((l) => `+${l}`);
    } else {
      const d = git(['diff', '-U0', SEED_REF, '--', f]);
      if (d === null) stop(`git diff failed for ${f}`);
      added = d.split('\n');
    }
    for (const line of added) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const s of SUPPRESSIONS) if (s.re.test(line)) hits.push(`${f}: added ${s.id} — ${line.slice(1).trim()}`);
    }
  }
  if (hits.length) {
    out(`red: ${hits.length} suppression(s) added — suppressing an error is not typing it`);
    echo(hits);
    out('| every parameter, variable and return needs a REAL type; `unknown` is fine (it forces narrowing), `any` and `@ts-ignore` are not, and a `@type {X} */ (expr)` cast asserts what the checker could not derive');
    done(1);
  }
  out(`green: no suppressions added across ${changed.length} changed file(s)`);
  done(0);
}

out(`instrument-stop: unknown stage "${stage ?? ''}" — the close is: changed-from-seed, typecheck, typecheck-outside, tests-kept, suite-green, no-suppressions`);
process.exit(97);
