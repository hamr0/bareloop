// THE RUNTIME BRIDGE (M4a) — the seam where an authored DECLARATION meets the
// arbiter that was built to run an argv. Arbiter-adjacent, so what is under test
// is not "does the declared close work" but whether every contract the command
// path already held still holds on the other executor:
//
//   * first-red-wins, and the deciding stage names itself;
//   * the FORBIDDEN ZONE routes by a TYPED fault, so a timeout still offers
//     "raise the close timeout" and a spawn failure still offers "fix the close"
//     (`CLOSE_FAULTS` keeps four rows because they are four human decisions);
//   * the gap header is the SAME line `src/trend.js` parses — one spelling;
//   * the gap is SCRUBBED at this boundary (M1 deliberately does not scrub);
//   * the trend donates a number only in the direction where a falling value
//     means convergence — a higher-is-better floor donates NOTHING, because
//     donating it would read a dropping test count as progress.
//
// Every fixture is a REAL temp git repo running REAL child processes: a declared
// close spawns worker-authored code for a living, and a mocked spawn cannot fail
// the way a real one does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  runDeclaredStages, declaredStages, closeGrade, validateCloseDecl, guardNames, isDeclaredClose,
  DECLARED_GAP_PREFIX, DECLARED_GAP_KEEP, DECLARED_CLOSE_CLASSES, CLOSE_DECL_FIELDS,
} from '../src/declaredclose.js';
import { CLOSE_FAULTS, runStages, stageGap } from '../src/ralph.js';
import { GAP_LINE_CAP, GAP_TRIM_MARKER } from '../src/kinds.js';
import { createRoot } from '../src/root.js';
import { readGrade, createTrend } from '../src/trend.js';
import { checkMenu, CLASS_BY_CLOSE, CLOSE_TYPES } from '../src/job.js';
import { closeStagesOf } from '../src/plan.js';
import { genreGuards } from '../src/authoring.js';
import { applyGenreEnv } from '../src/authorflow.js';
import { redactSecrets } from '../src/validate.js';

/** @param {string} dir @param {string[]} args */
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'decl-test', GIT_AUTHOR_EMAIL: 'decl@test',
    GIT_COMMITTER_NAME: 'decl-test', GIT_COMMITTER_EMAIL: 'decl@test',
  },
});

/** @param {string} dir @param {Record<string,string>} files */
function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

/** a throwaway repo with one commit; the seed SHA is READ BACK, never assumed */
function makeRepo(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-decl-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', 'main']);
  write(dir, files);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return { dir, seed: git(dir, ['rev-parse', 'HEAD']).trim() };
}

/** a node one-liner printing literal text and exiting with a chosen code */
const SAY = (/** @type {string} */ text, code = 0) => ['-e', `process.stdout.write(${JSON.stringify(text)});process.exit(${code})`];

const stage = (name, kind, params) => ({ name, kind, params });

// ── the vocabulary seams ─────────────────────────────────────────────────────

test('the gap-keep PATTERN is derived from the gap PREFIX, so a declared gap line always matches it', () => {
  const line = `${DECLARED_GAP_PREFIX}typecheck: 12 against a baseline of 0`;
  assert.match(line, new RegExp(DECLARED_GAP_KEEP, 'm'));
  // and it is anchored: a line that merely CONTAINS the prefix is not a judged line
  assert.doesNotMatch(`  indented ${DECLARED_GAP_PREFIX}x`, new RegExp(DECLARED_GAP_KEEP));
});

test('the verdict-class hierarchy is ONE table: every close type plus `declared`, and declared is hard', () => {
  assert.deepEqual(
    Object.keys(CLASS_BY_CLOSE).sort(),
    [...CLOSE_TYPES, 'declared'].sort(),
    'CLASS_BY_CLOSE and CLOSE_TYPES must not drift — a class table missing a shape launders that shape',
  );
  assert.deepEqual(CLASS_BY_CLOSE.declared, DECLARED_CLOSE_CLASSES);
  assert.deepEqual([...DECLARED_CLOSE_CLASSES], ['hard']);
});

test('closeStagesOf reads EITHER field, and a declared stage carries the arbiter\'s own gapKeep', () => {
  const decl = { genre: 'TYPES', lang: 'js', stages: [stage('a', 'files-changed', { allowPrefixes: ['src/'], requireNonEmpty: true })] };
  const fromDecl = closeStagesOf({ closeDecl: decl });
  assert.equal(fromDecl.length, 1);
  assert.equal(fromDecl[0].name, 'a');
  assert.equal(fromDecl[0].gapKeep, DECLARED_GAP_KEEP, 'Layer R reads redKeep off this field');
  // the command path is untouched
  assert.deepEqual(closeStagesOf({ close: [{ name: 'c', cmd: 'true', expect: 0 }] }), [{ name: 'c', cmd: 'true', expect: 0 }]);
  assert.equal(closeStagesOf({}), null);
  assert.equal(closeStagesOf(null), null);
  // and the declaration is never mutated by the enrichment
  assert.equal(decl.stages[0].gapKeep, undefined);
});

test('the check menu derives from a DECLARED close exactly as from a command one — stage names, one hop', () => {
  const stages = closeStagesOf({
    closeDecl: {
      genre: 'TYPES',
      lang: 'js',
      stages: [stage('changed-from-seed', 'files-changed', {}), stage('typecheck', 'count-not-worse', {})],
    },
  });
  assert.deepEqual(checkMenu(stages).map((m) => m.name), ['changed-from-seed', 'typecheck']);
});

test('guardNames names the genre\'s guards and nothing else — the work/guard split D9.3 keys on', () => {
  const decl = { genre: 'TYPES', lang: 'js', stages: [] };
  assert.deepEqual(guardNames(decl).sort(), genreGuards('js').map((g) => g.name).sort());
  assert.deepEqual(guardNames({ genre: 'TYPES', lang: 'nope', stages: [] }), []);
  assert.equal(isDeclaredClose({ closeDecl: decl }), true);
  assert.equal(isDeclaredClose({ close: [] }), false);
});

// ── validateCloseDecl: the spec-level gate, both directions ──────────────────

const JS_GUARDS = () => genreGuards('js');
const guardStages = (allowPrefixes) => JS_GUARDS().map((g) => ({
  name: g.name,
  kind: g.kind,
  params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes } : {}) },
}));

const GOOD_DECL = (allowPrefixes = ['src/']) => ({
  genre: 'TYPES',
  lang: 'js',
  stages: [
    guardStages(allowPrefixes)[0],
    stage('typecheck', 'count-not-worse', {
      cmd: 'node', args: ['-e', 'process.exit(0)'],
      parser: { lineMatch: 'error TS\\d+' },
      scope: { includePrefixes: ['src/'] },
      direction: 'lower-is-better', baseline: 0,
    }),
    guardStages(allowPrefixes)[1],
  ],
});

/**
 * The PYTHON declaration in the form every re-validation actually sees: the flow
 * (M3's `applyGenreEnv`) has already injected the genre's own `MYPYPATH` into
 * every env-capable stage, and the envelope RECORDS what it injected. Built here
 * rather than imported from the flow — a fixture that calls the injector would
 * pass whatever the injector does, including nothing.
 */
const PY_DECL = (injected = { MYPYPATH: 'src' }) => {
  const g = genreGuards('python');
  return {
    genre: 'TYPES',
    lang: 'python',
    genreEnv: { ...injected },
    stages: [
      { name: g[0].name, kind: g[0].kind, params: { ...g[0].params, allowPrefixes: ['src/'] } },
      stage('typecheck', 'count-not-worse', {
        cmd: 'python3',
        args: ['-m', 'mypy', '--strict', 'src'],
        parser: { lineMatch: ' error: ' },
        scope: { includePrefixes: ['src/'] },
        direction: 'lower-is-better',
        baseline: 0,
        env: { ...injected },
      }),
      { name: g[1].name, kind: g[1].kind, params: structuredClone(g[1].params) },
    ],
  };
};
const PY_LISTING = ['mypy.ini', 'src/a.py', 'src/b.py'];

test('the ARBITER\'s own genre-env injection survives re-validation — a python close is not bricked by its own MYPYPATH', () => {
  const d = PY_DECL();
  const deferred = validateCloseDecl(d, { deferListing: true });
  assert.deepEqual(deferred.reds, [], 'the signing gate and the job validator must accept our own injection');
  assert.equal(deferred.ok, true);

  const grounded = validateCloseDecl(d, { listing: PY_LISTING });
  assert.deepEqual(grounded.reds, [], 'and so must the runner, grounded against the real seed');
  assert.equal(grounded.grounded, true);
  assert.deepEqual(grounded.closeDecl.genreEnv, { MYPYPATH: 'src' }, 'the recorded injection rides the resolved form');
});

test('genre-owned env: a WRONG value still reds, and an owned key with no recorded injection behind it reds too', () => {
  const wrong = PY_DECL();
  wrong.stages[1].params.env = { MYPYPATH: 'the-model-guessed' };
  const r1 = validateCloseDecl(wrong, { deferListing: true });
  assert.equal(r1.ok, false);
  const red = r1.reds.find((x) => x.code === 'genre-owned-env');
  assert.ok(red, JSON.stringify(r1.reds));
  assert.equal(red.expected, 'src');
  assert.equal(red.declared, 'the-model-guessed');

  // nothing recorded → the arbiter cannot claim the key as its own, so the
  // fail-safe direction holds (round 2's arm B is still refused)
  const unrecorded = PY_DECL();
  delete unrecorded.genreEnv;
  assert.ok(validateCloseDecl(unrecorded, { deferListing: true }).reds.some((r) => r.code === 'genre-owned-env'));
});

test('the recorded genre env is CONSTRAINED to the names the genre owns — it is never an environment channel', () => {
  const smuggle = PY_DECL();
  smuggle.genreEnv = { ...smuggle.genreEnv, LD_PRELOAD: '/tmp/x.so' };
  assert.ok(validateCloseDecl(smuggle, { deferListing: true }).reds
    .some((r) => r.path === 'closeDecl.genreEnv.LD_PRELOAD'), 'an unowned name may never be recorded');

  // js owns no environment at all, so ANY recorded name is a red there
  assert.ok(validateCloseDecl({ ...GOOD_DECL(), genreEnv: { MYPYPATH: 'src' } }, { deferListing: true }).reds
    .some((r) => r.path === 'closeDecl.genreEnv.MYPYPATH'));
  // an empty record is legal (a genre that owns none injected none) and a
  // non-string value is not
  assert.deepEqual(validateCloseDecl({ ...GOOD_DECL(), genreEnv: {} }, { deferListing: true }).reds, []);
  const bad = PY_DECL();
  bad.genreEnv = { MYPYPATH: '' };
  assert.ok(validateCloseDecl(bad, { deferListing: true }).reds.some((r) => r.path === 'closeDecl.genreEnv'));
});

// The by-VALUE check proves the two copies of MYPYPATH AGREE — and both copies
// live in the same hand-editable spec, so agreement is something a forger gets
// for free. `genreEnv` is only evidence if it is checked against something the
// forger does NOT own: the real tree at the seed. Every value the arbiter can
// build is a join of prefixes that were themselves filtered against the seed
// listing, so grounding accepts exactly what `applyGenreEnv` produces and
// nothing else.
test('the recorded genre env is GROUNDED against the seed tree — self-consistency is not provenance', () => {
  // the direction that must keep working: the value the arbiter really builds
  assert.deepEqual(validateCloseDecl(PY_DECL(), { listing: PY_LISTING }).reds, [],
    'the real injected value derives FROM the listing and must ground clean');

  // the forgery: a hand-edited spec whose two copies agree perfectly
  const forged = PY_DECL({ MYPYPATH: '/tmp/attacker-stubs' });
  const deferred = validateCloseDecl(forged, { deferListing: true });
  assert.deepEqual(deferred.reds, [], 'with no tree in hand the deferred gate cannot see it — that is why the '
    + 'grounded gates exist, and why the runner re-validates');
  const r = validateCloseDecl(forged, { listing: PY_LISTING });
  const red = r.reds.find((x) => x.code === 'genre-env-ungrounded');
  assert.ok(red, `a path outside the seed tree must not be claimable as ours: ${JSON.stringify(r.reds)}`);
  assert.equal(red.path, 'closeDecl.genreEnv.MYPYPATH');
  assert.equal(red.name, 'MYPYPATH');
  assert.equal(red.element, '/tmp/attacker-stubs');

  // the value is a JOINED list, so every element is grounded on its own — one
  // real prefix must not launder the rest
  const half = PY_DECL({ MYPYPATH: 'src:/tmp/attacker-stubs' });
  const reds = validateCloseDecl(half, { listing: PY_LISTING }).reds.filter((x) => x.code === 'genre-env-ungrounded');
  assert.equal(reds.length, 1, JSON.stringify(reds));
  assert.equal(reds[0].element, '/tmp/attacker-stubs');

  // a multi-prefix value the arbiter really could have built still grounds
  const both = PY_DECL({ MYPYPATH: 'src:mypy.ini' });
  assert.deepEqual(validateCloseDecl(both, { listing: PY_LISTING }).reds, [],
    'a file and a directory prefix are both things the seed listing selects');
  // …and neither an invented sibling of a real prefix nor a climb out of the
  // tree does. `globToPrefix` deliberately leaves ".." VISIBLE rather than
  // resolving it (F9), which is exactly what lets the listing refuse it.
  for (const v of ['src_stubs', '../attacker-stubs', 'src/../../attacker-stubs']) {
    const bad = PY_DECL({ MYPYPATH: v });
    assert.ok(validateCloseDecl(bad, { listing: PY_LISTING }).reds.some((x) => x.code === 'genre-env-ungrounded'), v);
  }
});

// Deletion is the asymmetry the by-value check cannot see, and it reaches the
// SIGNED spec: strip MYPYPATH off the stage, leave the record in place, and mypy
// resolves through an editable install to a different checkout while the close
// reports a number. It reds at the DEFERRED gate too — this needs no tree, so
// the job validator catches it with no repository in hand.
test('a recorded genre env DELETED from the stage reds at the spec gate — with or without a tree', () => {
  const stripped = PY_DECL();
  delete stripped.stages[1].params.env;
  for (const o of [{ deferListing: true }, { listing: PY_LISTING }]) {
    const red = validateCloseDecl(stripped, o).reds.find((x) => x.code === 'genre-env-missing');
    assert.ok(red, `${JSON.stringify(o)}: a stage that lost the injection may not validate`);
    assert.equal(red.path, 'closeDecl.stages[1].params.env.MYPYPATH');
    assert.equal(red.expected, 'src');
  }

  // the same stage with the key still on it is clean — the rule is about the
  // key, not about having an `env` object at all
  const kept = PY_DECL();
  kept.stages[1].params.env = { MYPYPATH: 'src', PYTHONDONTWRITEBYTECODE: '1' };
  assert.deepEqual(validateCloseDecl(kept, { deferListing: true }).reds, []);
});

// The round trip, against the REAL producer rather than a fixture that agrees
// with my reading of it: whatever `applyGenreEnv` injects must ground clean at
// the gate. A grounding rule that refuses the arbiter's own output would brick
// the python genre exactly the way presence-flagging did.
test('grounding accepts EXACTLY what applyGenreEnv produces — the producer and the gate cannot drift', () => {
  const listing = ['mypy.ini', 'src/a.py', 'src/pkg/b.py', 'lib/c.py', 'tests/test_a.py'];
  // the flow's own prefix filter (authorflow: source paths kept only when the
  // seed tree really contains them)
  const sourcePrefixes = ['src', 'lib', 'invented_stubs']
    .filter((p) => listing.some((f) => f === p || f.startsWith(`${p}/`)));
  assert.deepEqual(sourcePrefixes, ['src', 'lib'], 'the flow drops a prefix the tree does not contain');

  const bare = PY_DECL();
  delete bare.genreEnv;
  delete bare.stages[1].params.env;
  const injected = applyGenreEnv(bare, 'python', { sourcePrefixes });
  assert.deepEqual(injected.applied, { MYPYPATH: 'src:lib' }, 'the joined form is what the arbiter really writes');

  const signed = { ...injected.declaration, genreEnv: { ...injected.applied } };
  assert.deepEqual(validateCloseDecl(signed, { listing }).reds, [],
    'the gate must accept the injector\'s own output, joined value and all');
});

test('validateCloseDecl accepts a well-formed declaration and hands back the RESOLVED stages', () => {
  const r = validateCloseDecl(GOOD_DECL(), { deferListing: true });
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.equal(r.grounded, false, 'a deferred listing is REPORTED, never passed off as grounded');
  // the short-form parser is expanded — the signed form is the form that runs
  assert.ok(Array.isArray(r.closeDecl.stages[1].params.parser.terms));
  assert.equal(r.closeDecl.stages[1].params.parser.terms[0].aggregate, 'first');
});

test('validateCloseDecl reds the envelope: unknown field, wrong genre, unknown language, bad notes', () => {
  const codes = (d) => validateCloseDecl(d, { deferListing: true }).reds.map((x) => `${x.code}:${x.path}`);
  assert.ok(codes({ ...GOOD_DECL(), seedRef: 'abc' }).includes('unknown-field:closeDecl.seedRef'),
    'a frozen seed in the SIGNED artefact is exactly what D12 retires — it must be inexpressible');
  assert.ok(codes({ ...GOOD_DECL(), genre: 'TESTGEN' }).some((c) => c.startsWith('invalid-value:closeDecl.genre')));
  assert.ok(codes({ ...GOOD_DECL(), lang: 'rust' }).some((c) => c.startsWith('invalid-value:closeDecl.lang')));
  assert.ok(codes({ ...GOOD_DECL(), notes: [''] }).some((c) => c.startsWith('invalid-value:closeDecl.notes')));
  assert.ok(codes('not an object').some((c) => c.startsWith('invalid-value:closeDecl')));
  // …and every legal field is accepted: a valid declaration carrying all of them
  // reds NOTHING (a negative assertion over an already-empty list proves nothing)
  assert.deepEqual(codes({ ...GOOD_DECL(), notes: ['a note'] }), []);
  assert.deepEqual([...CLOSE_DECL_FIELDS].sort(), ['genre', 'genreEnv', 'lang', 'notes', 'stages']);
});

test('validateCloseDecl refuses when a guard was WEAKENED — D5 is not a taste', () => {
  const d = GOOD_DECL();
  d.stages[2].params.patterns = d.stages[2].params.patterns.slice(0, 2);
  const reds = validateCloseDecl(d, { deferListing: true }).reds;
  assert.ok(reds.some((r) => r.code === 'guard-weakened'), JSON.stringify(reds));
});

test('validateCloseDecl with NEITHER a listing nor deferListing refuses — a validator handed nothing to check reports nothing', () => {
  const reds = validateCloseDecl(GOOD_DECL(), {}).reds;
  assert.ok(reds.some((r) => r.code === 'listing-absent'));
});

test('validateCloseDecl refuses a caller that BOTH defers and supplies a listing — it does not know which gate it ran', () => {
  const reds = validateCloseDecl(GOOD_DECL(), { deferListing: true, listing: ['src/a.js'] }).reds;
  assert.ok(reds.some((r) => r.code === 'listing-conflict'), JSON.stringify(reds));
});

test('GROUNDED, the listing rule fires: an invented path is a named red, and the same declaration passes deferred', async (t) => {
  const { dir } = makeRepo(t, { 'src/email.js': 'x', 'src/backup.js': 'y' });
  const d = GOOD_DECL(['src/alertEmail.js']);
  const grounded = validateCloseDecl(d, { listing: ['src/email.js', 'src/backup.js'] });
  assert.equal(grounded.ok, false);
  assert.ok(grounded.reds.some((r) => r.code === 'path-not-in-listing'), JSON.stringify(grounded.reds));
  assert.equal(grounded.grounded, true);
  // the SAME declaration is accepted with the tree-grounded half deferred — which
  // is exactly why the runner re-runs it grounded before any stage
  assert.equal(validateCloseDecl(d, { deferListing: true }).ok, true);
  assert.ok(dir);
});

// ── execution: the arbiter's contracts, on the other executor ────────────────

const OPTS = (r, over = {}) => ({ cwd: r.dir, seedRef: r.seed, timeoutMs: 30_000, ...over });

test('first red wins: the deciding stage names itself and a later stage never runs', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a' });
  const stages = declaredStages({
    stages: [
      stage('ok-one', 'command-exit', { cmd: 'node', args: SAY('fine', 0), expectExit: 0 }),
      stage('the-wall', 'command-exit', { cmd: 'node', args: SAY('boom', 3), expectExit: 0 }),
      stage('never-runs', 'command-exit', { cmd: 'node', args: SAY('unreached', 0), expectExit: 0 }),
    ],
  });
  const v = await runDeclaredStages(stages, (s) => s, OPTS(r));
  assert.equal(v.verdict, 'needs_revision');
  assert.equal(v.stage, 'the-wall');
  assert.deepEqual(v.stages.map((s) => s.name), ['ok-one', 'the-wall'], 'the third stage must not have run');
  assert.equal(v.declared, true);
  assert.equal(v.judgedCount, 1);
});

test('the gap header is the ONE spelling — trend.js buckets a declared grade by the same regex it uses for a command close', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a' });
  const stages = declaredStages({ stages: [stage('typecheck', 'command-exit', { cmd: 'node', args: SAY('bad', 1), expectExit: 0 })] });
  const v = await runDeclaredStages(stages, (s) => s, OPTS(r));
  assert.ok(v.gap.startsWith(stageGap('typecheck', '')), 'the header must be stageGap\'s own template');
  assert.equal(readGrade(v.gap).stage, 'typecheck');
  // every judged line carries the prefix, so the derived gapKeep designates them
  const body = v.gap.split('\n').slice(1);
  assert.ok(body.length > 0 && body.every((l) => l.startsWith(DECLARED_GAP_PREFIX)), v.gap);
});

test('a red with no output is never falsy — every consumer guards with `if (gap)`', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a' });
  // files-changed at its own seed: nothing changed, so it reds — and it reds
  // with a real line, which is what makes this test able to distinguish
  const stages = declaredStages({ stages: [stage('changed-from-seed', 'files-changed', { allowPrefixes: ['src/'], requireNonEmpty: true })] });
  const v = await runDeclaredStages(stages, (s) => s, OPTS(r));
  assert.equal(v.verdict, 'needs_revision');
  assert.ok(v.gap && v.gap.length > 0);
});

test('THE FORBIDDEN ZONE: an instrument stop routes by its TYPED fault, not by its prose', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a' });

  // (1) cannot RUN → failed → broken-close
  const cannotRun = await runDeclaredStages(
    declaredStages({ stages: [stage('s', 'command-exit', { cmd: 'no-such-binary-xyz', args: [], expectExit: 0 })] }),
    (s) => s, OPTS(r),
  );
  assert.equal(cannotRun.verdict, 'failed');
  assert.equal(CLOSE_FAULTS[cannotRun.verdict].category, 'broken-close');
  assert.equal(cannotRun.gap, undefined, 'a stop is NOT a verdict — it feeds no gap back');
  assert.equal(cannotRun.judgedCount, undefined, 'judged is WITHHELD with a stop (F17)');

  // (2) ran and never finished judging → timed-out → close-timeout, with its OWN
  //     option list. Pooling this into `failed` would hand a human "fix the argv"
  //     for a close that simply needs longer.
  const timedOut = await runDeclaredStages(
    declaredStages({ stages: [stage('s', 'command-exit', { cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], expectExit: 0, timeoutMs: 400 })] }),
    (s) => s, OPTS(r),
  );
  assert.equal(timedOut.verdict, 'timed-out');
  assert.equal(CLOSE_FAULTS[timedOut.verdict].category, 'close-timeout');
  assert.ok(CLOSE_FAULTS[timedOut.verdict].options.some((o) => /timeout/i.test(o)));
  assert.notDeepEqual(CLOSE_FAULTS['timed-out'].options, CLOSE_FAULTS.failed.options);

  // (3) ran, came back, judged nothing → crashed → close-crashed. `first` over
  //     zero matches is UNKNOWN, and unknown is never zero (F6).
  const crashed = await runDeclaredStages(
    declaredStages({
      stages: [stage('s', 'count-not-worse', {
        cmd: 'node', args: SAY('no numbers here', 0),
        parser: { lineMatch: 'errors: (\\d+)' }, scope: {}, direction: 'lower-is-better', baseline: 0,
      })],
    }),
    (s) => s, OPTS(r),
  );
  assert.equal(crashed.verdict, 'crashed');
  assert.equal(CLOSE_FAULTS[crashed.verdict].category, 'close-crashed');

  // every fault this bridge can produce is a row the arbiter already knows
  for (const v of [cannotRun, timedOut, crashed]) assert.ok(Object.hasOwn(CLOSE_FAULTS, v.verdict));
});

test('a declared close with no seed REFUSES rather than guessing a baseline', async () => {
  const v = await runDeclaredStages(declaredStages({ stages: [stage('s', 'command-exit', { cmd: 'node', args: SAY('x', 0), expectExit: 0 })] }), (s) => s, { cwd: '/tmp' });
  assert.equal(v.verdict, 'failed');
  assert.match(v.detail, /seed/);
});

test('SECRETS: a declared stage\'s output is scrubbed at THIS boundary, in gaps AND in stop details', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a' });
  const KEY = `sk-ant-api03-${'A'.repeat(95)}`;
  assert.notEqual(redactSecrets(KEY), KEY, 'the fixture must be a shape the ONE inventory actually knows');

  const red = await runDeclaredStages(
    declaredStages({ stages: [stage('leaky', 'command-exit', { cmd: 'node', args: SAY(`401 Authorization: Bearer ${KEY}`, 1), expectExit: 0 })] }),
    redactSecrets, OPTS(r),
  );
  assert.equal(red.verdict, 'needs_revision');
  assert.ok(!red.gap.includes(KEY), 'a secret a close echoes must never reach the gap');

  // the stop path carries the instrument's own text, and it is scrubbed too
  const stopped = await runDeclaredStages(
    declaredStages({
      stages: [stage('leaky-stop', 'count-not-worse', {
        cmd: 'node', args: SAY(`token=${KEY}`, 0),
        parser: { lineMatch: 'errors: (\\d+)' }, scope: {}, direction: 'lower-is-better', baseline: 0,
      })],
    }),
    redactSecrets, OPTS(r),
  );
  assert.equal(stopped.verdict, 'crashed');
  assert.ok(!JSON.stringify(stopped).includes(KEY), 'the stop detail is an emission boundary too');
});

test('a TRIMMED declared gap announces itself in a spelling Layer R can see — an unseen trim is a blind detector claiming certainty', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a' });
  const many = Array.from({ length: GAP_LINE_CAP + 20 }, (_, i) => `line ${i}`).join('\n');
  const noisy = declaredStages({ stages: [stage('noisy', 'command-exit', { cmd: 'node', args: SAY(many, 1), expectExit: 0 })] });
  const trimmed = await runDeclaredStages(noisy, (s) => s, OPTS(r));
  assert.equal(trimmed.verdict, 'needs_revision');
  assert.ok(trimmed.gap.includes(GAP_TRIM_MARKER), `the trim must announce itself: ${trimmed.gap.slice(-200)}`);

  // A SHORT gap from the same executor, under the line cap: no trim marker, so
  // the kept-set is trustworthy. The two gaps are the contrast that makes this
  // test able to fail — without it, the assertion below would pass on any gap.
  const quiet = declaredStages({ stages: [stage('noisy', 'command-exit', { cmd: 'node', args: SAY('one\ntwo', 1), expectExit: 0 })] });
  const untrimmed = await runDeclaredStages(quiet, (s) => s, OPTS(r));
  assert.equal(untrimmed.verdict, 'needs_revision');
  assert.ok(!untrimmed.gap.includes(GAP_TRIM_MARKER));

  // Layer R's Finding 5, on the declared executor's own gap: the detector still
  // FIRES on write-overlap (the writes are real information), but it degrades to
  // `writes-only` and makes no "the reds did not change" claim off a window that
  // silently dropped failures. Writes must genuinely OVERLAP for any of this to
  // be observable — `observe` compares the DELTA of the cumulative audit set, so
  // handing it the same list twice yields an empty delta and no reading at all.
  /** @param {string} gap */
  const twice = (gap) => {
    const root = createRoot({ gapKeep: DECLARED_GAP_KEEP, writesInformative: true });
    root.observe({ iteration: 1, writes: [] });
    root.noteWrite('src/a.js', 'first try');
    root.observe({ iteration: 2, gap, writes: ['src/a.js'], redStage: 'noisy', redKeep: DECLARED_GAP_KEEP });
    root.noteWrite('src/a.js', 'second try');
    return root.observe({ iteration: 3, gap, writes: ['src/a.js'], redStage: 'noisy', redKeep: DECLARED_GAP_KEEP });
  };

  const onTrimmed = twice(trimmed.gap);
  assert.ok(onTrimmed, 'write-overlap still fires — the trim degrades the reading, it does not silence it');
  assert.equal(onTrimmed.event.mode, 'writes-only', 'a trimmed window is not a trustworthy red-set');
  assert.equal(onTrimmed.event.redSetSize, null);
  assert.ok(!/did not change/i.test(onTrimmed.note), 'no "the failing set is unchanged" claim off a trimmed window');

  // the complement, same fixture, one variable moved: an UNtrimmed window keeps
  // the strong mode and does make the claim
  const onQuiet = twice(untrimmed.gap);
  assert.ok(onQuiet);
  assert.equal(onQuiet.event.mode, 'reds+writes', 'no trim marker → trustworthy red-set → strong mode');
  assert.ok(onQuiet.event.redSetSize > 0);
  assert.match(onQuiet.note, /did not change/i);
});

// ── the trend seam ───────────────────────────────────────────────────────────

test('closeGrade is byte-identical for a COMMAND close: the gap alone, so readGrade still runs', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a' });
  const v = await runStages([{ name: 'c', cmd: `node -e process.exit(1)`, expect: 0 }], (s) => s, { cwd: r.dir, timeoutMs: 30_000 });
  const g = closeGrade(v);
  assert.deepEqual(Object.keys(g), ['gap']);
  assert.equal(g.stage, undefined, 'undefined, NOT null — null would disable trend.record\'s readGrade fallback');
  assert.equal(g.value, undefined);
});

test('a lower-is-better count DONATES its number; a higher-is-better floor donates NOTHING', async (t) => {
  // A real D12 fixture: the count is READ OUT OF THE TREE, so the seed baseline
  // is measured in a detached worktree at the seed and the current value is
  // measured in the workdir. `n=5` at seed, `n=2` now — a test-count floor that
  // genuinely dropped, which is the only way to make a higher-is-better stage red.
  const r = makeRepo(t, { 'src/a.js': 'a', 'count.txt': 'n=5\n' });
  writeFileSync(join(r.dir, 'count.txt'), 'n=2\n');
  const READ = ['-e', "process.stdout.write(require('fs').readFileSync('count.txt','utf8'))"];
  const counting = (name, direction, baseline) => stage(name, 'count-not-worse', {
    cmd: 'node', args: READ,
    parser: { lineMatch: 'n=(\\d+)' }, scope: {}, direction, baseline,
  });

  const worse = await runDeclaredStages(declaredStages({ stages: [counting('typecheck', 'lower-is-better', 0)] }), (s) => s, OPTS(r));
  assert.equal(worse.verdict, 'needs_revision');
  assert.equal(worse.value, 2);
  assert.equal(closeGrade(worse).value, 2, 'a falling fault count IS convergence — the reader may compare it');
  assert.equal(closeGrade(worse).stage, 'typecheck');

  // A test-count floor: a DROP is the run getting worse. trend.js reads
  // `value < best` as improvement, so donating this number would read a dying
  // run as converging and recommend a top-up. F6's answer: unknown, never a
  // number that means the opposite of what it says.
  const floor = await runDeclaredStages(declaredStages({ stages: [counting('tests-kept', 'higher-is-better', 'seed')] }), (s) => s, OPTS(r));
  assert.equal(floor.verdict, 'needs_revision', 'the floor dropped 5 → 2 against its own seed');
  assert.equal(floor.value, 2, 'the measurement is still reported');
  assert.equal(floor.baseline, 5, 'measured at the seed, every run — never a frozen constant (D12)');
  assert.equal(closeGrade(floor).value, null, 'but it is NOT donated as a trend comparison');
  assert.equal(closeGrade(floor).stage, 'tests-kept', 'the stage POSITION still travels either way');
});

test('the donated number reaches the trend reader as a real comparison (12 → 4 reads as improvement)', () => {
  const t2 = createTrend({ stageOrder: ['typecheck'] });
  t2.record(closeGrade({ declared: true, stage: 'typecheck', trendValue: 12, gap: 'x' }));
  t2.record(closeGrade({ declared: true, stage: 'typecheck', trendValue: 4, gap: 'y' }));
  const v = t2.verdict();
  assert.equal(v.trend, 'converging', JSON.stringify(v));
});

test('a higher-is-better floor CANNOT manufacture a converging reading out of a dropping count', () => {
  const t2 = createTrend({ stageOrder: ['tests-kept'] });
  t2.record(closeGrade({ declared: true, stage: 'tests-kept', trendValue: null, gap: 'a' }));
  t2.record(closeGrade({ declared: true, stage: 'tests-kept', trendValue: null, gap: 'b' }));
  assert.notEqual(t2.verdict().trend, 'converging');
});
