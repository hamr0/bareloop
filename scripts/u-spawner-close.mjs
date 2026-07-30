// U (user-mode e2e) — the close for the aurora-u spawner job, as NAMED STAGES.
//
// One command, one stage per invocation: `node u-spawner-close.mjs <stage>`. The
// stages ARE the close (run in order, first red is the verdict) and the agent's
// ruler menu DERIVES from them (PRD v1.28) — nobody hand-authors a check.
//
// Operator-owned and versioned HERE, in bareloop, not in the patient: the worker's
// readScope is the patient tree, so the arbiter's own instrument is out of reach by
// construction (v1.12 — the worker never reads the arbiter's books).
//
// Output contract:
//   every gap line is prefixed `SPAWNER ` (the spec's gapKeep) so failures survive
//   the gap bound; `SPAWNER judged=1` is printed on every real judgment so the
//   spec's judged floor can tell a rendered opinion from a crashed instrument (F17).
//   The output NAMES NO CULPRIT FILE beyond what the tool itself reports — the
//   worker finds its own way (v1.12/F28 governs the failure message, not the list).
import { execFileSync, spawnSync } from 'node:child_process';

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u';
const SEED_REF = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18'; // the patient as cloned
const PKG_SRC = 'packages/spawner/src';
const PKG_TESTS = 'packages/spawner/tests';
// The seed's EXECUTED count — executed, never passed (F40). Measured on the patient at
// SEED_REF: `collected 209 items` … `209 passed in 21.58s`, zero skipped, zero
// deselected, so executed == collected == passed == 209 at the seed. The three coincide
// only there; the floor is on the EXECUTED number, and it is the one that moves when a
// test is deleted, filtered out or skipped.
const TESTS_MIN = 209;
const GAP_LINE_CAP = 40;
// suppressing an error is not typing it. `unknown` is deliberately NOT here: it
// forces narrowing at the use site, which is real typing work.
const SUPPRESSIONS = [
  { id: 'ignore', re: /#\s*type:\s*ignore/ },
  { id: 'any', re: /\bAny\b/ },
  { id: 'cast', re: /\bcast\s*\(/ },
  { id: 'noqa', re: /#\s*noqa/ },
  { id: 'mypy-disable', re: /#\s*mypy:\s*disable/ },
];

const stage = process.argv[2];
const out = (/** @type {string} */ line) => console.log(`SPAWNER ${line}`);
/** every real judgment says so; an instrument stop (97) deliberately does not */
const done = (/** @type {number} */ code) => { if (code !== 97) out('judged=1'); process.exit(code); };
const stop = (/** @type {string} */ why) => { out(`instrument-stop: ${why}`); process.exit(97); };

const run = (/** @type {string} */ cmd, /** @type {string[]} */ args, timeoutMs = 900_000, /** @type {Record<string,string>} */ extraEnv = {}) => {
  const r = spawnSync(cmd, args, { cwd: WORKDIR, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ...extraEnv } });
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
  // MYPYPATH is load-bearing, not decoration. The patient sets `explicit_package_bases`,
  // so passing `packages/spawner/src` makes mypy NAME those modules
  // `packages.spawner.src.aurora_spawner.*`. A sibling import (`from aurora_spawner.recovery
  // import …`) then matches none of them and falls through to the editable install, which
  // symlinks to a DIFFERENT checkout of aurora — so a fix that crosses a module boundary was
  // being checked against unedited source in another repo. Proven by probe: adding a function
  // to the patient's recovery.py and misusing it from spawner.py reported "Module
  // aurora_spawner.recovery has no attribute …" (the other repo) instead of the arg-type
  // error. With MYPYPATH the module names resolve inside the patient and the real error is
  // reported. The seed count is 16 either way and both recorded greens re-verify clean, so
  // this closes a latent hole and moves no number.
  const r = run('python3', ['-m', 'mypy', '--config-file', 'mypy.ini', PKG_SRC], 900_000, { MYPYPATH: PKG_SRC });
  if (r.timedOut || r.code === null) stop('the strict typecheck timed out');
  const errs = r.text.split('\n').filter((l) => l.includes(' error: '));
  if (errs.length === 0 && r.code === 0) { out('green: mypy --strict reports zero errors'); done(0); }
  if (errs.length === 0) { stop(`mypy exited ${r.code} with no readable error lines — the run did not complete`); }
  out(`red: mypy --strict reports ${errs.length} error(s)`);
  echo(errs.map((l) => l.replace(`${PKG_SRC}/`, '')));
  done(1);
}

if (stage === 'suite-green') {
  const r = run('python3', ['-m', 'pytest', PKG_TESTS, '-ra', '-p', 'no:cacheprovider']);
  if (r.timedOut || r.code === null) stop('the patient suite timed out');
  // Count tests EXECUTED, never PASSED — a red tree must not be able to hide under a
  // passing-count floor (F40). pytest's own totals, read off REAL runs of this patient
  // under this exact invocation (pytest 9.0.2), never an imagined shape:
  //   `collecting ... collected 209 items`                      the header count
  //   `collected 209 items / 207 deselected / 2 selected`       …with a filter in play
  //   `collected 0 items / 1 error`                             …with a collection error
  //   `= 2 failed, 1 passed, 1 skipped, 1 xfailed, 2 errors in 0.15s =`   the summary
  //   `= 2 errors in 0.06s =` · `= 2 passed, 207 deselected in 2.38s =` · `= no tests ran =`
  const collected = Number((r.text.match(/\bcollected (\d+) items?\b/) ?? [])[1] ?? NaN);
  if (!Number.isFinite(collected)) stop('the suite produced no readable collection count — the run did not complete');
  // `errors?` and `no tests ran` are in the matcher because an errors-only or empty run
  // prints NEITHER "passed" nor "failed": without them a real red read as a crashed
  // instrument (97) instead of a verdict.
  const m = r.text.match(/=+ ([^=]*\b(?:passed|failed|errors?|no tests ran)\b[^=]*) =+\s*$/m);
  if (!m) stop('the suite produced no readable summary line — the run did not complete');
  // tallied over the SUMMARY LINE ONLY (a traceback body can contain anything) and
  // SUMMED, not first-match: `2 failed, …, 2 errors` is four red tests, and the old
  // single-match read reported two. `xfailed` cannot be captured — the alternation is
  // anchored at the digit + space, and "1 xfailed" offers no "failed" there.
  const tally = (/** @type {RegExp} */ re) => { let n = 0; for (const g of m[1].matchAll(re)) n += Number(g[1]); return n; };
  const failed = tally(/(\d+) (?:failed|errors?)\b/g);
  // a skipped or deselected test is a test that did NOT run. Subtracting them is what
  // makes this an EXECUTED floor rather than a collected one — otherwise `@pytest.mark.skip`
  // on a failing test clears the floor as cheaply as deleting it. (The sibling litectx
  // close counts node:test's `# tests`, which folds skips in; this is the stricter read.)
  const notRun = tally(/(\d+) (?:skipped|deselected)\b/g);
  const executed = collected - notRun;
  // a suite that SHRANK is not a suite that passes: removing a test removes its
  // failure and is the cheapest way to green a behaviour gate
  if (executed < TESTS_MIN) {
    out(`red: ${executed} tests executed${notRun ? ` (${collected} collected, ${notRun} skipped/deselected)` : ''}, below the seed's ${TESTS_MIN} — tests were lost, not kept`);
    echo(r.text.split('\n').filter((l) => l.startsWith('FAILED') || l.startsWith('ERROR')));
    done(1);
  }
  if (failed > 0 || r.code !== 0) {
    out(`red: ${failed} test(s) now fail — a type annotation must describe what the code already does`);
    echo(r.text.split('\n').filter((l) => l.startsWith('FAILED') || l.startsWith('ERROR')));
    done(1);
  }
  out(`green: ${executed} tests executed, 0 failing`);
  done(0);
}

if (stage === 'no-suppressions') {
  const changed = changedFiles().filter((f) => f.endsWith('.py'));
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
    out('| every parameter, variable and return needs a REAL type; `unknown` is fine (it forces narrowing), Any and type: ignore are not');
    done(1);
  }
  out(`green: no suppressions added across ${changed.length} changed file(s)`);
  done(0);
}

out(`instrument-stop: unknown stage "${stage ?? ''}" — the close is: changed-from-seed, typecheck, suite-green, no-suppressions`);
process.exit(97);
