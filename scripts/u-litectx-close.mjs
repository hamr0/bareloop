// U (user-mode e2e) — the close for the litectx-u types job, as NAMED STAGES.
//
// One command, one stage per invocation: `node u-litectx-close.mjs <stage>`. The
// stages ARE the close (run in order, first red is the verdict) and the agent's
// ruler menu DERIVES from them (PRD v1.28) — nobody hand-authors a check.
//
// Operator-owned and versioned HERE, in bareloop, not in the patient: the worker's
// readScope is the patient tree, so the arbiter's own instrument is out of reach by
// construction (v1.12 — the worker never reads the arbiter's books).
//
// Second target for U, holding the JOB SHAPE from the aurora-u spawner close
// (changed-from-seed → typecheck → suite-green → no-suppressions) while varying the
// patient AND the toolchain (JS/JSDoc + tsc, not Python + mypy). Passing every stage
// IS the grade — there is no separate grading stage, so no stage is `offer:false`
// except the seed guard.
//
// Output contract:
//   every gap line is prefixed `LITECTX ` (the spec's gapKeep) so failures survive
//   the gap bound; `LITECTX judged=1` is printed on every real judgment so the
//   spec's judged floor can tell a rendered opinion from a crashed instrument (F17).
//   The output NAMES NO CULPRIT FILE beyond what the tool itself reports — the
//   worker finds its own way (v1.12/F28 governs the failure message, not the list).
import { execFileSync, spawnSync } from 'node:child_process';

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-u';
const SEED_REF = '96813a43bbcbac6a808ff610c6751a8736e2903e'; // the patient as seeded
const PKG_SRC = 'src';
const TESTS_MIN = 410; // the seed's EXECUTED count (409 pass + 1 skipped) — executed, never passed (F40)
const GAP_LINE_CAP = 40;
// Suppressing an error is not typing it. `unknown` is deliberately NOT here: it forces
// narrowing at the use site, which is real typing work.
//   - `any` is matched only in TYPE position (after `{ < | ( [ : ,` or `as`, or `any[]`),
//     never as the English word — this file's own prose says "any" and must not self-trip.
//   - a JSDoc CAST (`/** @type {X} */ (expr)`) is the JS analog of Python's `cast(`: it
//     asserts a type the checker could not derive. Declaration annotations (a `@type` line
//     that does NOT open a parenthesised expression) are the real work and stay legal.
const SUPPRESSIONS = [
  { id: 'ts-ignore', re: /@ts-ignore/ },
  { id: 'ts-expect-error', re: /@ts-expect-error/ },
  { id: 'ts-nocheck', re: /@ts-nocheck/ },
  { id: 'eslint-disable', re: /eslint-disable/ },
  { id: 'any', re: /(?:[{<|(\[:,]|\bas)\s*any\b|\bany\[\]/ },
  { id: 'cast', re: /@type\s*\{[^}]*\}\s*\*\/\s*\(/ },
];

const stage = process.argv[2];
const out = (/** @type {string} */ line) => console.log(`LITECTX ${line}`);
/** every real judgment says so; an instrument stop (97) deliberately does not */
const done = (/** @type {number} */ code) => { if (code !== 97) out('judged=1'); process.exit(code); };
const stop = (/** @type {string} */ why) => { out(`instrument-stop: ${why}`); process.exit(97); };

const run = (/** @type {string} */ cmd, /** @type {string[]} */ args, timeoutMs = 900_000) => {
  const r = spawnSync(cmd, args, { cwd: WORKDIR, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 28, env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}`, timedOut: r.error?.code === 'ETIMEDOUT' };
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

// ── the seed diff, shared by two stages. A missing seed commit is an INSTRUMENT
// stop, never a red: the run cannot be judged at all if the baseline is unreadable.
const changedFiles = () => {
  if (git(['rev-parse', '--verify', `${SEED_REF}^{commit}`]) === null) stop(`frozen seed commit ${SEED_REF.slice(0, 12)} not found in the patient`);
  const d = git(['diff', '--name-only', SEED_REF, '--']);
  if (d === null) stop('git diff against the seed failed');
  return d.split('\n').filter(Boolean);
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

if (stage === 'typecheck') {
  const r = run('npx', ['tsc', '--noEmit', '--strict'], 600_000);
  if (r.timedOut || r.code === null) stop('the strict typecheck timed out');
  const errs = r.text.split('\n').map((s) => s.trimEnd()).filter((l) => /error TS\d+/.test(l));
  if (errs.length === 0 && r.code === 0) { out('green: tsc --strict reports zero errors'); done(0); }
  if (errs.length === 0) { stop(`tsc exited ${r.code} with no readable error lines — the run did not complete`); }
  out(`red: tsc --strict reports ${errs.length} error(s)`);
  echo(errs);
  done(1);
}

if (stage === 'suite-green') {
  const r = run('npm', ['test'], 900_000);
  if (r.timedOut || r.code === null) stop('the patient suite timed out');
  // `node --test` spec output is never byte-stable (duration stamps); the TAP summary
  // counters and `not ok` lines are. Count tests EXECUTED, never passed — a red tree
  // must not be able to hide under a passing-count floor (F40).
  const num = (/** @type {RegExp} */ re) => { const m = r.text.match(re); return m ? Number(m[1]) : NaN; };
  const tests = num(/^# tests (\d+)$/m);
  const failed = num(/^# fail (\d+)$/m);
  if (!Number.isFinite(tests) || !Number.isFinite(failed)) stop('the suite produced no readable TAP summary — the run did not complete');
  const notOk = r.text.split('\n').filter((l) => /^not ok \d+/.test(l)).map((s) => s.trim());
  // a suite that SHRANK is not a suite that passes: deleting a test removes its failure
  // and is the cheapest way to green a behaviour gate
  if (tests < TESTS_MIN) { out(`red: ${tests} tests executed, below the seed's ${TESTS_MIN} — tests were lost, not kept`); echo(notOk); done(1); }
  if (failed > 0 || r.code !== 0) {
    out(`red: ${failed} test(s) now fail — a type annotation must describe what the code already does`);
    echo(notOk);
    done(1);
  }
  out(`green: ${tests} tests executed, 0 failing`);
  done(0);
}

if (stage === 'no-suppressions') {
  const changed = changedFiles().filter((f) => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'));
  const hits = [];
  for (const f of changed) {
    const d = git(['diff', '-U0', SEED_REF, '--', f]);
    if (d === null) stop(`git diff failed for ${f}`);
    for (const line of d.split('\n')) {
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

out(`instrument-stop: unknown stage "${stage ?? ''}" — the close is: changed-from-seed, typecheck, suite-green, no-suppressions`);
process.exit(97);
