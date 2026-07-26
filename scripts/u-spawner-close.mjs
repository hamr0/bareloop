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

const run = (/** @type {string} */ cmd, /** @type {string[]} */ args, timeoutMs = 900_000) => {
  const r = spawnSync(cmd, args, { cwd: WORKDIR, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
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
  const r = run('python3', ['-m', 'mypy', '--config-file', 'mypy.ini', PKG_SRC]);
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
  const m = r.text.match(/=+ ([^=]*\b(?:passed|failed|error)\b[^=]*) =+\s*$/m);
  if (!m) stop('the suite produced no readable summary line — the run did not complete');
  const passed = Number((r.text.match(/(\d+) passed/) ?? [])[1] ?? NaN);
  const failed = Number((r.text.match(/(\d+) (?:failed|error)/) ?? [])[1] ?? 0);
  // a suite that SHRANK is not a suite that passes: deleting a test removes its
  // failure and is the cheapest way to green a behaviour gate
  if (!Number.isFinite(passed)) stop('the suite produced no readable pass count');
  if (passed < 209) { out(`red: ${passed} tests passed, below the seed's 209 — tests were lost, not kept`); echo(r.text.split('\n').filter((l) => l.startsWith('FAILED') || l.startsWith('ERROR'))); done(1); }
  if (failed > 0 || r.code !== 0) {
    out(`red: ${failed} test(s) now fail — a type annotation must describe what the code already does`);
    echo(r.text.split('\n').filter((l) => l.startsWith('FAILED') || l.startsWith('ERROR')));
    done(1);
  }
  out(`green: ${passed} tests pass`);
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
