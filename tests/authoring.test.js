// THE AUTHORING SURFACE (M2, close-authoring gate 4) — the catalogue, the TYPES
// genre, and the declaration validator.
//
// What is actually under test here is not "does a schema walk walk a schema".
// It is the four things that decide whether an AUTHORED close can be trusted,
// each one paid for by a gate-2 round:
//
//   - the catalogue is the ONLY vocabulary, and it must not drift from the
//     executor's own live-kind list (two catalogues are two instruments);
//   - the TYPES genre template is FROZEN TEXT — the test reads the prereg doc
//     and compares bytes, so a paraphrase in source fails here rather than
//     quietly changing what every future close is authored against;
//   - the guard batteries and their SCOPE are genre property (addendum 6): a
//     declaration that drops, weakens, or NARROWS an injected guard is a red,
//     because round 3's arm A narrowed the suppression scan to two files and a
//     suppression in a new helper would have escaped;
//   - a path the model wrote down must SELECT from the real seed listing.
//     Round 2's arm A invented `src/alertEmail.js` from the user's prose; the
//     real file is `src/email.js`. That is a mechanical check against real
//     data, never a judgment call.
//
// Every expected number is derived from the fixture or from the shipped
// constant, never hardcoded twice (a catalogue edit must not silently red the
// suite — it must red the ONE assertion that owns the fact).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LIVE_KINDS, regexGroups } from '../src/kinds.js';
import { VERDICT_TYPES, LOCKED_VERDICTS } from '../src/job.js';
import { hasNestedQuantifier } from '../src/validate.js';
import {
  KIND_CATALOGUE, CATALOGUE_KINDS, CATALOGUE_LIVE_KINDS, LOCKED_KINDS, MAX_STAGES, DIRECTIONS, BASELINES,
  TYPES_GENRE, TYPES_GENRE_TEMPLATE, GENRE_LANGUAGES, DENIED_COMMANDS,
  VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES, CLASS_BATTERIES,
  classGuards, closeCeiling, genreEnv, genreOwnedEnvNames, genreInstruments,
  validateDeclaration, normalizeDeclaration,
} from '../src/authoring.js';
import { declarationLines, parseCeiling, ceilingLine } from '../scripts/author-readout.mjs';

/** The battery for the one class v1 admits. The attachment point is the CLASS
 * (PRD v1.57 §2) and every fixture in this file is a green job, so the class is
 * stated once here rather than at thirty call sites. */
const greenGuards = (lang) => classGuards({ verdictType: 'green', lang });

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

// ── fixtures ─────────────────────────────────────────────────────────────────

/** a pulselog-shaped seed listing: the files that ACTUALLY exist */
const LISTING = Object.freeze([
  'package.json',
  'README.md',
  'src/backup.js',
  'src/email.js',
  'src/index.js',
  'src/util/time.js',
  'test/backup.test.js',
  'test/email.test.js',
]);

const TARGETS = ['src/email.js', 'src/backup.js'];

/** the two injected JS guards, with the one model-filled slot filled */
function guardStages(allowPrefixes = TARGETS) {
  return greenGuards('js').map((g) => (g.kind === 'files-changed'
    ? { name: g.name, kind: g.kind, params: { ...g.params, allowPrefixes: [...allowPrefixes] } }
    : { name: g.name, kind: g.kind, params: structuredClone(g.params) }));
}

/** a count stage, parameterised so a test can move exactly one axis */
function countStage(over = {}) {
  return {
    name: 'typecheck',
    kind: 'count-not-worse',
    params: {
      cmd: 'npx',
      args: ['tsc', '--noEmit', '--strict'],
      parser: { terms: [{ lineMatch: 'error TS\\d+:', sign: 1, aggregate: 'sum', region: 'whole-output' }] },
      scope: { includePrefixes: [...TARGETS] },
      direction: 'lower-is-better',
      baseline: 0,
      ...over,
    },
  };
}

/** a declaration that VALIDATES — every negative test starts from this and breaks one thing */
function goodDeclaration() {
  return {
    stages: [
      guardStages()[0],
      countStage(),
      {
        name: 'typecheck-outside',
        kind: 'count-not-worse',
        params: {
          cmd: 'npx',
          args: ['tsc', '--noEmit', '--strict'],
          parser: { terms: [{ lineMatch: 'error TS\\d+:', sign: 1, aggregate: 'sum', region: 'whole-output' }] },
          scope: { excludePrefixes: [...TARGETS] },
          direction: 'lower-is-better',
          baseline: 'seed',
        },
      },
      {
        name: 'suite-green',
        kind: 'command-exit',
        params: { cmd: 'npm', args: ['test'], expectExit: 0 },
      },
      guardStages()[1],
    ],
  };
}

/**
 * `goodDeclaration()` AFTER the flow injected a genre variable — the form every
 * re-validation actually sees. The env lands on every stage the CATALOGUE says
 * can carry one, which is exactly the rule `applyGenreEnv` injects by; a fixture
 * that put it on one stage would be testing a declaration the arbiter never
 * writes.
 */
function injectedDeclaration(env = { MYPYPATH: 'src' }) {
  const decl = goodDeclaration();
  for (const s of decl.stages) {
    const spec = KIND_CATALOGUE[s.kind];
    if ([...spec.required, ...spec.optional].includes('env')) s.params.env = { ...env };
  }
  return decl;
}

const opts = (over = {}) => ({
  listing: LISTING, guards: greenGuards('js'), envOwned: genreOwnedEnvNames('js'), verdictType: 'green', ...over,
});
const run = (decl, over = {}) => validateDeclaration(decl, opts(over));
const codes = (res) => res.reds.map((r) => r.code);
/** @param {any} res @param {string} code */
const at = (res, code) => res.reds.filter((r) => r.code === code);

// ── the catalogue ────────────────────────────────────────────────────────────

test('catalogue: the live kinds are EXACTLY the executor\'s live kinds, both directions', () => {
  const live = CATALOGUE_KINDS.filter((k) => !KIND_CATALOGUE[k].locked);
  assert.deepEqual([...live].sort(), [...LIVE_KINDS].sort());
});

test('catalogue: judged-floor is the one LOCKED entry; harness-loop is ABSENT', () => {
  // `human-confirms` went LIVE at N4 slice 1; `judged-floor` waits for the
  // judged floor its class needs (slice 2)
  assert.deepEqual([...LOCKED_KINDS].sort(), ['judged-floor']);
  for (const k of LOCKED_KINDS) assert.equal(KIND_CATALOGUE[k].locked, true, `${k} must be marked locked`);
  // absent is not the same as locked: declaring harness-loop is an unknown-kind
  // typo, not counted demand — it is out of v1 with no menu entry at all
  assert.equal(Object.hasOwn(KIND_CATALOGUE, 'harness-loop'), false);
  assert.equal(CATALOGUE_KINDS.includes('harness-loop'), false);
});

test('catalogue: every entry declares required/optional/pathParams as data, and a shape line', () => {
  for (const [name, spec] of Object.entries(KIND_CATALOGUE)) {
    assert.ok(Array.isArray(spec.required), `${name}.required`);
    assert.ok(Array.isArray(spec.optional), `${name}.optional`);
    assert.ok(Array.isArray(spec.pathParams), `${name}.pathParams`);
    assert.ok(typeof spec.shape === 'string' && spec.shape.length > 0, `${name}.shape`);
    for (const p of spec.pathParams) {
      const head = p.split('.')[0];
      assert.ok(spec.required.includes(head) || spec.optional.includes(head), `${name}.pathParams names ${head}, which is not a parameter`);
    }
  }
});

test('catalogue: the catalogue option is LOAD-BEARING — a narrowed catalogue refuses a kind the default admits', () => {
  const narrowed = { 'files-changed': KIND_CATALOGUE['files-changed'] };
  const wide = run(goodDeclaration());
  const narrow = run(goodDeclaration(), { catalogue: narrowed });
  assert.equal(wide.ok, true);
  assert.ok(at(narrow, 'unknown-kind').length > 0, 'a narrowed catalogue must refuse count-not-worse');
});

// ── the TYPES genre template: FROZEN TEXT ────────────────────────────────────

test('genre template: byte-identical to the prereg\'s frozen policy text', () => {
  const doc = readFileSync(join(REPO, 'docs/plans/2026-08-08-close-authoring-gate2-poc-prereg.md'), 'utf8');
  const lines = doc.split('\n');
  const marker = lines.findIndex((l) => l.startsWith('**The frozen TYPES genre template'));
  assert.notEqual(marker, -1, 'the prereg no longer carries the frozen template marker — the source of truth moved');
  let i = marker + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  const block = [];
  while (i < lines.length && lines[i].trim() !== '') { block.push(lines[i]); i++; }
  const frozen = block.join('\n');
  // the extractor must have found the real thing, or this test passes vacuously
  assert.ok(frozen.length > 500, `extracted only ${frozen.length} bytes — the extractor missed the block`);
  for (const n of [1, 2, 3, 4, 5, 6]) assert.ok(frozen.includes(`\n${n}. `) || frozen.startsWith(`${n}. `), `policy point ${n} missing from the extracted block`);
  assert.equal(TYPES_GENRE_TEMPLATE, frozen);
  assert.equal(TYPES_GENRE.template, frozen);
});

// ── the genre-owned guard batteries and their scope ──────────────────────────

test('genre batteries: the JS 7 and the Python 5, by id, from the hand-written closes', () => {
  assert.deepEqual(GENRE_LANGUAGES, ['js', 'python']);
  assert.deepEqual(
    TYPES_GENRE.languages.js.suppressions.map((p) => p.id),
    ['ts-ignore', 'ts-expect-error', 'ts-nocheck', 'eslint-disable', 'any', 'any-star', 'cast'],
  );
  assert.deepEqual(
    TYPES_GENRE.languages.python.suppressions.map((p) => p.id),
    ['ignore', 'any', 'cast', 'noqa', 'mypy-disable'],
  );
  assert.deepEqual(TYPES_GENRE.languages.js.extensions, ['.js', '.mjs', '.cjs']);
  assert.deepEqual(TYPES_GENRE.languages.python.extensions, ['.py']);
});

test('genre batteries: every shipped pattern compiles and survives our OWN F49 reject', () => {
  for (const lang of GENRE_LANGUAGES) {
    for (const p of TYPES_GENRE.languages[lang].suppressions) {
      assert.doesNotThrow(() => new RegExp(p.regex), `${lang}/${p.id} does not compile`);
      assert.equal(hasNestedQuantifier(p.regex), false, `${lang}/${p.id} would be rejected by the gate that admits it`);
    }
  }
});

test('genre guards: fully enumerated, and the suppression scan carries NO scope (addendum 6)', () => {
  const guards = greenGuards('js');
  assert.deepEqual(guards.map((g) => g.name), ['changed-from-seed', 'no-suppressions']);
  const changed = guards.find((g) => g.name === 'changed-from-seed');
  const supp = guards.find((g) => g.name === 'no-suppressions');
  // the containment guard's prefixes are the JOB's, filled by the model
  assert.deepEqual(changed.fill, ['allowPrefixes']);
  assert.equal(changed.params.requireNonEmpty, true);
  assert.equal(Object.hasOwn(changed.params, 'allowPrefixes'), false);
  // the suppression guard has NOTHING left to fill — scope included. Round 3's
  // arm A narrowed this scan to the two target files; a suppression added in a
  // NEW helper file would have walked straight through.
  assert.deepEqual(supp.fill, []);
  assert.equal(Object.hasOwn(supp.params, 'scope'), false);
  assert.equal(supp.params.patterns.length, TYPES_GENRE.languages.js.suppressions.length);
});

test('genre guards: each call hands back its OWN copy — a caller cannot edit the battery', () => {
  const a = greenGuards('js');
  a[1].params.patterns.length = 1;
  a[1].params.patterns[0].regex = 'x';
  const b = greenGuards('js');
  assert.equal(b[1].params.patterns.length, TYPES_GENRE.languages.js.suppressions.length);
  assert.equal(b[1].params.patterns[0].regex, TYPES_GENRE.languages.js.suppressions[0].regex);
});

test('genre guards: an unknown language THROWS — never an empty battery', () => {
  assert.throws(() => greenGuards('rust'), /rust/);
  assert.throws(() => genreEnv('rust', { sourcePrefixes: ['src'] }), /rust/);
  assert.throws(() => genreOwnedEnvNames('rust'), /rust/);
  assert.throws(() => genreInstruments('rust'), /rust/);
});

// ── how the genre's own tools PRINT (run msmbpjk6, 2026-08-09) ───────────────
//
// REAL, UNCRAFTED EVIDENCE. Every line below is copied verbatim out of
// `bareloop-patients/pulselog-author-live-bareloop/tsc-real-output.txt`, which is
// the captured `npm run typecheck -- --strict` of the live patient — 71 lines,
// 67 of them error lines, tool exit 2. Nothing here was written to match a
// pattern; the pattern is being judged against what the tool actually printed.

/** 8 of the file's 67 error lines, chosen to span its shapes: the first, a
 * 3-digit column, both TS codes that appear, the enormous inline-type TS7053
 * line, and the last. */
const TSC_REAL_ERROR_LINES = Object.freeze([
  'src/backup.js(21,19): error TS7006: Parameter \'now\' implicitly has an \'any\' type.',
  'src/backup.js(42,48): error TS7006: Parameter \'now\' implicitly has an \'any\' type.',
  'src/backup.js(165,125): error TS18046: \'err\' is of type \'unknown\'.',
  'src/checks.js(13,15): error TS7006: Parameter \'ms\' implicitly has an \'any\' type.',
  'src/run.js(33,14): error TS7053: Element implicitly has an \'any\' type because expression of type \'any\' can\'t be used to index type \'{ http: (cfg: any) => Promise<{ ok: boolean; reason: string; detail: { http_status: number; }; }>; tcp: (cfg: any) => Promise<any>; ssl: (cfg: any) => Promise<any>; disk: (cfg: any) => Promise<...>; \'file-age\': (cfg: any) => Promise<...>; service: (cfg: any) => Promise<...>; command: (cfg: any) => Promise<...>; }\'.',
  'src/run.js(42,58): error TS18046: \'err\' is of type \'unknown\'.',
  'src/sink.js(30,27): error TS7006: Parameter \'byteLength\' implicitly has an \'any\' type.',
  'src/sink.js(52,82): error TS18046: \'err\' is of type \'unknown\'.',
]);

/** ALL 4 of the file's non-error lines — the npm banner pair and the blanks
 * around it. The `> tsc --noEmit --strict` line is the trap: it names the tool
 * and must still not count as an error. */
const TSC_REAL_NON_ERROR_LINES = Object.freeze([
  '',
  '> pulselog@0.7.2 typecheck',
  '> tsc --noEmit --strict',
  '',
]);

/** what run msmbpjk6 actually composed: tsc's PRETTY shape, which tsc prints
 * only to a terminal. Quoted verbatim from that run's declaration. */
const DRAFTED_PRETTY_FORMAT = '^\\S+\\.js:\\d+:\\d+ - error TS\\d+:';

/** REAL captured mypy lines, from a live aurora run's own spine
 * (`bareloop-patients/aurora-u-bareloop/u-ms2c0ls7.jsonl`). */
const MYPY_REAL_ERROR_LINES = Object.freeze([
  'packages/spawner/src/aurora_spawner/timeout_policy.py:89: error: Statement is unreachable  [unreachable]',
  'packages/spawner/src/aurora_spawner/circuit_breaker.py:324: error: Statement is unreachable  [unreachable]',
  'packages/spawner/src/aurora_spawner/recovery.py:353: error: Need type annotation for',
]);

// ── REAL captured TEST-RUNNER output ────────────────────────────────────────
//
// Same rule as the tsc lines above: copied verbatim out of archived spines, never
// typed to match a pattern.

/** verbatim from the mailproof job-#2 battery's own `close-precheck` gaps —
 * `bareloop-patients/mailproof-job2-bareloop/battery-P1-mrm7gk25.jsonl` (5 fails)
 * and `battery-P2-mrm7gk25.jsonl` (1 fail): whole `npm test` → `node --test`
 * captures, taken down the close's pipe. */
const NODE_TEST_REAL_LINES = Object.freeze([
  '# tests 317',
  '# pass 316',
  '# fail 1',
  '# pass 312',
  '# fail 5',
  'not ok 7 - edit-renotify: a non-participant edit, and edits on a pending event, ping no one',
  'not ok 61 - remind+: workflow — initiator triggers reminder to every eligible step (ctx.reminder=true)',
  'not ok 84 - m7d e2e: every kernel occasion fires through one deliver(), keyed by kind',
]);

/** lines from the SAME captures that a test-count term must NOT read. `# Subtest:`
 * is the trap: the runner prefixes ordinary chatter with the same `# `, and one of
 * these test NAMES literally contains the word "pass". `ok 316 - …` is the other:
 * without `^`, every PASSING test would count as a failure. */
const NODE_TEST_REAL_NON_COUNT_LINES = Object.freeze([
  'TAP version 13',
  '# Subtest: pickSigner: prefers a pass signature, falls back to any with domain+selector, else null',
  'ok 316 - resolveUpgrade: below-verified levels upgrade to verified; verified does not',
  '1..317',
  '# suites 0',
  '# duration_ms 18975.857395',
]);

/** what `node --test` prints on a real pty instead — MEASURED on this machine
 * (node v22.22.2, one test file, identical args, 2026-08-13). The node analogue of
 * `DRAFTED_PRETTY_FORMAT`: this is the shape a close NEVER sees, and a term
 * composed against it matches nothing while the suite runs perfectly. */
const NODE_TEST_TTY_LINES = Object.freeze([
  'ℹ tests 2',
  'ℹ pass 1',
  'ℹ fail 1',
  '✔ a (7.666969ms)',
  '✖ b (1.463505ms)',
]);

/** verbatim from the aurora battery's `close-precheck` gaps,
 * `bareloop-patients/aurora-soar-bareloop/battery-A{1,4}-*.jsonl` (pytest 9.1.1,
 * the patient's own addopts). The padding really is one `=` per side — the line is
 * wider than the terminal, not truncated. */
const PYTEST_REAL_LINES = Object.freeze([
  '= 1 failed, 2690 passed, 3 skipped, 18 deselected, 1775 warnings in 326.12s (0:05:26) =',
  '= 2 failed, 2689 passed, 3 skipped, 18 deselected, 1775 warnings in 163.35s (0:02:43) =',
  'FAILED packages/soar/tests/test_agent_registry_deprecation.py::TestAgentRegistryDeprecation::test_registry_and_discovery_equivalent_results',
  'FAILED packages/cli/tests/unit/test_plan_commands.py::TestShowPlan::test_show_wrong_location_hint',
]);

/** MEASURED locally (pytest 9.0.2, 2026-08-13), because the archive has no green
 * pytest row and no `-q` row to quote. `PYTEST_GREEN_LINE` is the whole reason
 * python carries no fail-COUNT term; `PYTEST_QUIET_LINE` is why nothing anchors on
 * the `=` padding. */
const PYTEST_GREEN_LINE = '============================== 1 passed in 0.04s ===============================';
const PYTEST_QUIET_LINE = '1 failed, 1 passed in 0.03s';

/** the REAL captured lines this genre may teach FROM, per language. An example is
 * the TEACHING half of the fix — the pattern alone survives a drifted example
 * (`error TS\d+` reads the pretty shape too), so a shipped example that is not
 * one of these would quietly show the author the very format that cost run
 * msmbpjk6 a whole authoring pass. */
const REAL_LINES = Object.freeze({
  js: Object.freeze([...TSC_REAL_ERROR_LINES, ...NODE_TEST_REAL_LINES]),
  python: Object.freeze([...MYPY_REAL_ERROR_LINES, ...PYTEST_REAL_LINES]),
});

test('known instruments: the genre-owned tsc term reads every REAL captured error line', () => {
  const [tsc] = genreInstruments('js');
  assert.equal(tsc.id, 'tsc-error-line');
  const re = new RegExp(tsc.lineMatch);
  const hits = TSC_REAL_ERROR_LINES.filter((l) => re.test(l));
  assert.equal(hits.length, TSC_REAL_ERROR_LINES.length,
    `missed ${TSC_REAL_ERROR_LINES.length - hits.length} real error line(s): ${TSC_REAL_ERROR_LINES.filter((l) => !re.test(l)).join(' | ')}`);
  // and it must not count the tool's own banner — the line NAMING tsc included
  const falsePositives = TSC_REAL_NON_ERROR_LINES.filter((l) => re.test(l));
  assert.deepEqual(falsePositives, [], 'a non-error line counted as an error');
  // no capture group: the term TALLIES one per line rather than reading a figure,
  // which is exactly what the prompt tells the author it does. Counted with the
  // executor's OWN counter, never a second one.
  const groups = regexGroups(tsc.lineMatch);
  assert.equal(groups.red, null, groups.red ?? '');
  assert.equal(groups.count, 0, 'the term must carry no capture group, or it reads a figure instead of tallying lines');
});

test('known instruments: the PRETTY format the drafter composed live matches ZERO real lines — the defect, pinned', () => {
  const re = new RegExp(DRAFTED_PRETTY_FORMAT);
  const hits = TSC_REAL_ERROR_LINES.filter((l) => re.test(l));
  assert.equal(hits.length, 0,
    'the terminal-only shape must match nothing in captured output — if this ever passes, the evidence file changed');
  // ... and the genre's own term is not that shape. Stated as a comparison so a
  // future edit that "tidies" the term into the pretty shape reds here.
  assert.notEqual(genreInstruments('js')[0].lineMatch, DRAFTED_PRETTY_FORMAT);
});

test('known instruments: the example shipped to the author is a REAL captured line, not a tidied one', () => {
  for (const lang of GENRE_LANGUAGES) {
    for (const i of genreInstruments(lang)) {
      assert.doesNotThrow(() => new RegExp(i.lineMatch), `${lang}/${i.id} does not compile`);
      assert.equal(hasNestedQuantifier(i.lineMatch), false, `${lang}/${i.id} would be rejected by the gate that admits it`);
      assert.match(i.example, new RegExp(i.lineMatch),
        `${lang}/${i.id}: the pattern handed over does not read the line handed over beside it`);
      // THE TEACHING HALF. `error TS\d+` reads the pretty shape too, so the
      // pattern alone survives an example quietly drifted to the format that cost
      // run msmbpjk6 its authoring pass. The example must SELECT from real
      // captured output — the same "never invented" rule paths already live under.
      assert.ok(
        REAL_LINES[lang].some((real) => real === i.example || i.example.startsWith(real)),
        `${lang}/${i.id}: the shipped example is not one of the real captured lines — got ${JSON.stringify(i.example)}`,
      );
    }
  }
  const [mypy] = genreInstruments('python');
  assert.equal(mypy.id, 'mypy-error-line');
  // mypy's own tail line reports the total; counting it would double-count
  assert.doesNotMatch('Found 16 errors in 5 files (checked 23 source files)', new RegExp(mypy.lineMatch));
});

test('known instruments: ONE spelling — the term is the hand-written closes\' own, not a second ruler', () => {
  // The provenance claim is mechanical, not a comment: the pattern the genre
  // hands the author must be byte-identical to the one the operator's paid-for
  // closes already grade with. Two spellings would be two instruments.
  const close = readFileSync(join(REPO, 'scripts/u-pulselog-close.mjs'), 'utf8');
  const m = close.match(/filter\(\(l\) => \/(.+?)\/\.test\(l\)\)/);
  assert.notEqual(m, null, 'the hand-written close no longer reads tsc with a literal regex — the provenance moved');
  assert.equal(genreInstruments('js')[0].lineMatch, m[1]);

  const spawner = readFileSync(join(REPO, 'scripts/u-spawner-close.mjs'), 'utf8');
  const mm = spawner.match(/filter\(\(l\) => l\.includes\('(.+?)'\)\)/);
  assert.notEqual(mm, null, 'the hand-written mypy close no longer reads a literal substring — the provenance moved');
  assert.equal(genreInstruments('python')[0].lineMatch, mm[1]);
});

// ── the TEST-COUNT facts (2026-08-13) ───────────────────────────────────────
//
// Same bar as the tsc term: a printed format enters the ruler only with captured
// real output behind it. These tests hold the evidence side — every shipped
// pattern is run against lines the tools actually printed, and against the lines
// they printed that it must NOT read.

/** every instrument the genre owns, keyed by id, for the language given. */
const byId = (/** @type {string} */ lang) => Object.fromEntries(genreInstruments(lang).map((i) => [i.id, i]));

test('known instruments: the node --test terms read the REAL captured TAP lines and nothing else in the same capture', () => {
  const js = byId('js');
  const cases = [
    ['node-test-total-count', ['# tests 317'], '317'],
    ['node-test-pass-count', ['# pass 316', '# pass 312'], null],
    ['node-test-fail-count', ['# fail 1', '# fail 5'], null],
  ];
  for (const [id, lines, firstFigure] of cases) {
    const i = js[/** @type {string} */ (id)];
    assert.ok(i, `${id} is not in the table`);
    const re = new RegExp(/** @type {any} */ (i).lineMatch);
    for (const l of /** @type {string[]} */ (lines)) {
      const m = re.exec(l);
      assert.notEqual(m, null, `${id} missed the real captured line ${JSON.stringify(l)}`);
      // it must read the FIGURE, not merely match: a term that matches but
      // captures nothing feeds `first` an undefined and the stage reads unknown.
      assert.equal(typeof m[1], 'string', `${id} matched ${JSON.stringify(l)} without capturing its number`);
    }
    if (firstFigure) assert.equal(re.exec(/** @type {string[]} */ (lines)[0])[1], firstFigure);
    // and never the runner's own chatter from the same captures
    const wrong = NODE_TEST_REAL_NON_COUNT_LINES.filter((l) => re.test(l));
    assert.deepEqual(wrong, [], `${id} counted the runner's own non-summary output`);
  }

  // the failure TALLY: one per failing test, never a passing one
  const failed = js['node-test-failed-line'];
  const fre = new RegExp(failed.lineMatch);
  const notOk = NODE_TEST_REAL_LINES.filter((l) => l.startsWith('not ok'));
  assert.equal(notOk.length, 3, 'the evidence set lost its real failing lines');
  for (const l of notOk) assert.match(l, fre);
  assert.deepEqual(NODE_TEST_REAL_NON_COUNT_LINES.filter((l) => fre.test(l)), [],
    'the failure tally read a passing test or the runner\'s chatter — `ok 316 - …` is one anchor away');
});

test('known instruments: the runner\'s TERMINAL shape matches ZERO piped-format terms — the tsc trap, on a second tool', () => {
  // MEASURED: node v22.22.2 prints TAP down a pipe and the spec reporter on a pty.
  // A close only ever reads the piped half. This is the `DRAFTED_PRETTY_FORMAT`
  // guard, one tool over: if a future edit "tidies" a term toward the pretty
  // shape, the term stops reading the only output a close can see, and this reds.
  for (const i of genreInstruments('js')) {
    const re = new RegExp(i.lineMatch);
    const hits = NODE_TEST_TTY_LINES.filter((l) => re.test(l));
    assert.deepEqual(hits, [], `${i.id} is written against the terminal shape, which no close ever captures`);
  }
  // and the piped shape it IS written against really is the one in the archive
  assert.ok(NODE_TEST_REAL_LINES.some((l) => new RegExp(byId('js')['node-test-pass-count'].lineMatch).test(l)));
});

test('known instruments: the pytest terms read the REAL captured lines, across the padding they never anchor on', () => {
  const py = byId('python');
  const pass = py['pytest-pass-count'];
  const re = new RegExp(pass.lineMatch);
  for (const l of PYTEST_REAL_LINES.filter((x) => x.includes(' passed'))) {
    const m = re.exec(l);
    assert.notEqual(m, null, `pytest-pass-count missed ${JSON.stringify(l)}`);
    assert.match(m[1], /^\d+$/);
  }
  assert.equal(re.exec(PYTEST_REAL_LINES[0])[1], '2690', 'it read a number off the line, but not the passed one');
  // MEASURED: the `=` padding is terminal-derived and absent under -q. The term
  // must survive both, and an `=`-anchored spelling must not — stated as the
  // comparison, so a future "tidy" toward the decoration reds here.
  assert.match(PYTEST_QUIET_LINE, re, 'the term stops reading pytest the moment a patient configures -q');
  assert.match(PYTEST_GREEN_LINE, re);
  const paddingAnchored = /^=+ .*\d+ passed.*=+$/;
  assert.doesNotMatch(PYTEST_QUIET_LINE, paddingAnchored,
    'if this ever matches, the padding stopped being optional and the comparison is moot');

  // the failure TALLY: exactly one line per failing test (measured under -ra and -q)
  const failed = py['pytest-failed-line'];
  const fre = new RegExp(failed.lineMatch);
  const fails = PYTEST_REAL_LINES.filter((l) => l.startsWith('FAILED '));
  assert.equal(fails.length, 2, 'the evidence set lost its real FAILED lines');
  for (const l of fails) assert.match(l, fre);
  assert.deepEqual(PYTEST_REAL_LINES.filter((l) => l.includes(' passed') && fre.test(l)), [],
    'the failure tally also read the counts line — that would double-count every red run');
});

test('known instruments: python carries NO fail-count figure, because a green pytest run omits the segment', () => {
  // THE REASON THE TERM DOES NOT EXIST, pinned mechanically rather than as a
  // comment. `first` over no match reports "never reported" — a broken instrument
  // — so a fail-COUNT term would go silent on exactly the runs that went well.
  assert.doesNotMatch(PYTEST_GREEN_LINE, /(\d+) failed/,
    'a green pytest run now prints a failed segment; the omission this table is built around changed');
  for (const i of genreInstruments('python')) {
    if (i.capture === null) continue;
    assert.doesNotMatch(i.lineMatch, /failed/,
      `${i.id} reads a figure off a segment pytest omits when it is zero`);
  }
  // node's runner is the CONTRAST that proves the rule is about the tool, not
  // about counting failures: it prints every counter on every run, so its
  // fail-count term is safe. Measured: a fully green run still prints `# fail 0`.
  const jsFail = new RegExp(byId('js')['node-test-fail-count'].lineMatch);
  assert.equal(jsFail.exec('# fail 0')[1], '0', 'node\'s reported zero is what makes a js fail-count term honest');
});

test('known instruments: every entry declares a capture that matches its own pattern', () => {
  for (const lang of GENRE_LANGUAGES) {
    for (const i of genreInstruments(lang)) {
      assert.ok(i.capture === null || Number.isInteger(i.capture), `${lang}/${i.id}: capture is neither null nor a group index`);
      const groups = regexGroups(i.lineMatch);
      assert.equal(groups.red, null, groups.red ?? '');
      if (i.capture === null) {
        assert.equal(groups.count, 0,
          `${lang}/${i.id} says it TALLIES but carries a capture group — the executor would read a figure instead`);
      } else {
        assert.ok(groups.count >= i.capture,
          `${lang}/${i.id} says it reads group ${i.capture}, which its pattern does not have`);
        assert.equal(typeof new RegExp(i.lineMatch).exec(i.example)?.[i.capture], 'string',
          `${lang}/${i.id}: group ${i.capture} captures nothing on its own real line`);
      }
    }
  }
});

test('known instruments: no term in a language reads another term\'s line — one population per stage', () => {
  // ONE POPULATION PER STAGE is the first law, and two terms that read each
  // other's lines are the mechanical way to break it while looking fine.
  for (const lang of GENRE_LANGUAGES) {
    const all = genreInstruments(lang);
    for (const i of all) {
      for (const j of all) {
        if (i.id === j.id) continue;
        assert.doesNotMatch(j.example, new RegExp(i.lineMatch),
          `${lang}: ${i.id} also reads ${j.id}'s real line — two populations, one ruler`);
      }
    }
  }
});

test('known instruments: each call hands back its OWN copy — a caller never holds the shipped ruler', () => {
  // IDENTITY, not mutability: the table is frozen, so an edit throws either way
  // and a mutation test written that way passes for the wrong mechanism. What
  // this pins is the same convention `classGuards` states — a caller is handed a
  // fresh object it may edit, and the shipped one is never reachable through it.
  const a = genreInstruments('js');
  const b = genreInstruments('js');
  assert.notEqual(a, b, 'two calls handed the same array');
  assert.notEqual(a[0], TYPES_GENRE.languages.js.instruments[0], 'the caller was handed the shipped entry itself');
  assert.deepEqual(a[0], { ...TYPES_GENRE.languages.js.instruments[0] }, 'the copy must carry every field of the original');
  a[0].lineMatch = 'nonsense';
  assert.equal(genreInstruments('js')[0].lineMatch, TYPES_GENRE.languages.js.instruments[0].lineMatch);
});

// ── the battery's HOME is the verdict class (PRD v1.57 §2) ───────────────────
//
// What a battery is FOR is the class of dishonesty the class of VERDICT admits,
// so a green job carries the green battery whatever problem it came from. The
// attachment point is the class; the tool-specific CONTENTS resolve at
// composition, because a suppression pattern belongs to the tool the declaration
// names and nothing before composition knows that tool.

test('classes: the two copies of the menu are IDENTICAL — the spec radio and the authoring surface', () => {
  // `src/job.js` owns the same menu as the spec's declared radio and imports this
  // module transitively, so importing it back would close a cycle. Two copies,
  // pinned HERE — the same treatment CATALOGUE_LIVE_KINDS and LIVE_KINDS get.
  assert.deepEqual([...VERDICT_CLASSES], [...VERDICT_TYPES], 'the radio and the battery must key on ONE vocabulary');
  assert.deepEqual([...LOCKED_CLASSES], [...LOCKED_VERDICTS]);
});

test('classes: the class menu is exactly three, and v1 builds two of them (N4 slice 1)', () => {
  assert.deepEqual([...VERDICT_CLASSES], ['green', 'soft-green', 'hitl']);
  assert.deepEqual([...LOCKED_CLASSES], ['soft-green']);
  assert.deepEqual([...LIVE_CLASSES], ['green', 'hitl']);
  // the batteries cover the menu and nothing else — a class with no entry would
  // be a class whose guards nothing can supply
  assert.deepEqual(Object.keys(CLASS_BATTERIES).sort(), [...VERDICT_CLASSES].sort());
  for (const c of LOCKED_CLASSES) {
    assert.equal(CLASS_BATTERIES[c].locked, true, `${c} must be a named but LOCKED set`);
    assert.equal(CLASS_BATTERIES[c].guards, null, `${c}'s battery is ABSENT (null), never an empty array`);
  }
});

test('battery: an EMPTY battery is IMPOSSIBLE for a known class and a known language', () => {
  for (const verdictType of LIVE_CLASSES) {
    for (const lang of GENRE_LANGUAGES) {
      const guards = classGuards({ verdictType, lang });
      assert.ok(guards.length > 0, `${verdictType}/${lang} handed back an EMPTY battery`);
      for (const g of guards) {
        assert.ok(g.name && g.kind, `${verdictType}/${lang} guard is malformed`);
        // every composed param resolved to something the tool actually needs —
        // an empty pattern list is a suppression scan that scans for nothing,
        // which reads clean exactly like one that scanned correctly (F6/F59)
        for (const p of g.compose ?? []) {
          assert.ok(Array.isArray(g.params[p]) && g.params[p].length > 0,
            `${verdictType}/${lang}: composed param "${p}" of "${g.name}" resolved EMPTY`);
        }
      }
    }
  }
});

test('battery: an unknown class, and a LOCKED class, THROW rather than hand back nothing', () => {
  assert.throws(() => classGuards({ verdictType: 'chartreuse', lang: 'js' }), /chartreuse/);
  for (const c of LOCKED_CLASSES) {
    assert.throws(() => classGuards({ verdictType: c, lang: 'js' }), new RegExp(c),
      `a locked class must never resolve a battery — admission refuses it first`);
  }
  // and the language check survives the re-home (F59: absent is never "none needed")
  assert.throws(() => classGuards({ verdictType: 'green', lang: 'rust' }), /rust/);
});

test('battery: the CONTENTS come from the tool the declaration names, not from the class', () => {
  const js = classGuards({ verdictType: 'green', lang: 'js' });
  const py = classGuards({ verdictType: 'green', lang: 'python' });
  // same attachment point, same guard names, same kinds…
  assert.deepEqual(js.map((g) => g.name), py.map((g) => g.name));
  assert.deepEqual(js.map((g) => g.kind), py.map((g) => g.kind));
  // …and DIFFERENT fills, resolved from the language data at composition
  const suppOf = (/** @type {any[]} */ gs) => gs.find((g) => g.kind === 'pattern-absent-in-diff');
  assert.deepEqual(suppOf(js).params.extensions, [...TYPES_GENRE.languages.js.extensions]);
  assert.deepEqual(suppOf(py).params.extensions, [...TYPES_GENRE.languages.python.extensions]);
  assert.notDeepEqual(suppOf(js).params.patterns, suppOf(py).params.patterns);
});

// ── the CEILING rule: the picked class is a PROMISE (PRD v1.57 §1) ───────────
//
// Inert in v1 by construction — every LIVE kind is mechanical, so the ceiling can
// never exceed a green pick today. It is built now so the first soft-green kind
// is not the thing that discovers the question, and it is TESTED against an
// injected catalogue carrying a live non-green kind, because that is the only way
// the rule can be watched firing without unlocking anything.

/** a catalogue exactly like the shipped one, plus ONE LIVE soft-green kind */
const withLiveSoftKind = () => ({
  ...KIND_CATALOGUE,
  'judged-floor': {
    ...KIND_CATALOGUE['judged-floor'],
    locked: false,
    required: [], optional: [], pathParams: [],
    verdictClass: 'soft-green',
  },
});

test('ceiling: every catalogue kind carries the verdict class it can honestly render', () => {
  for (const [name, spec] of Object.entries(KIND_CATALOGUE)) {
    assert.ok(VERDICT_CLASSES.includes(spec.verdictClass), `${name}.verdictClass is ${String(spec.verdictClass)}`);
  }
  // every live MEASURING kind is mechanical — the ceiling rule was inert in v1
  // by construction, and `human-confirms` is the first kind to make it bite: a
  // human stage in a green spec is a class-ceiling red (tests/hitl.test.js)
  for (const k of CATALOGUE_LIVE_KINDS.filter((x) => x !== 'human-confirms')) {
    assert.equal(KIND_CATALOGUE[k].verdictClass, 'green', k);
  }
  assert.equal(KIND_CATALOGUE['judged-floor'].verdictClass, 'soft-green');
  assert.equal(KIND_CATALOGUE['human-confirms'].verdictClass, 'hitl');
});

test('ceiling: closeCeiling reports the HIGHEST class any stage demands, and which kind raised it', () => {
  const green = closeCeiling(goodDeclaration());
  assert.equal(green.class, 'green');
  const mixed = closeCeiling({
    stages: [...goodDeclaration().stages, { name: 'taste', kind: 'human-confirms', params: {} }],
  });
  assert.equal(mixed.class, 'hitl');
  assert.equal(mixed.kind, 'human-confirms');
  assert.equal(mixed.stage, 'taste');
  // nothing the catalogue knows: no ceiling to report, and never a defaulted one
  assert.equal(closeCeiling({ stages: [{ name: 'x', kind: 'harness-loop', params: {} }] }), null);
  assert.equal(closeCeiling(null), null);
});

test('ceiling: a catalogue kind that states NO class THROWS — a kind whose honesty nobody stated is never weighed', () => {
  const mute = { ...KIND_CATALOGUE, 'files-changed': { ...KIND_CATALOGUE['files-changed'], verdictClass: undefined } };
  assert.throws(() => closeCeiling(goodDeclaration(), /** @type {any} */ (mute)), /files-changed/);
  // and a kind the catalogue does not know contributes nothing rather than a
  // guessed class — it already carries an unknown-kind red of its own
  assert.equal(closeCeiling({ stages: [{ name: 'x', kind: 'harness-loop', params: {} }] }, /** @type {any} */ (mute)), null);
});

test('ceiling: a declaration ABOVE the picked class is an honest red naming the kind that raised it', () => {
  const catalogue = withLiveSoftKind();
  const decl = goodDeclaration();
  decl.stages.splice(3, 0, { name: 'reads-well', kind: 'judged-floor', params: {} });

  const res = validateDeclaration(decl, opts({ catalogue, verdictType: 'green' }));
  const red = at(res, 'class-ceiling')[0];
  assert.ok(red, `expected a class-ceiling red, got ${JSON.stringify(codes(res))}`);
  assert.equal(res.ok, false);
  assert.equal(red.kind, 'judged-floor', 'the red NAMES the kind that raised the ceiling');
  assert.equal(red.stage, 'reads-well');
  assert.equal(red.kindClass, 'soft-green');
  assert.equal(red.picked, 'green');
  assert.equal(res.ceiling.class, 'soft-green');
});

test('ceiling: the SAME declaration under a matching pick is not a ceiling red — no silent downgrade either', () => {
  const catalogue = withLiveSoftKind();
  const decl = goodDeclaration();
  decl.stages.splice(3, 0, { name: 'reads-well', kind: 'judged-floor', params: {} });
  // the battery is the picked class's, so a soft-green pick is validated against
  // a soft-green battery — the guards below are the green ones purely so this
  // test moves ONE axis (the pick) and nothing else
  const res = validateDeclaration(decl, opts({ catalogue, verdictType: 'soft-green' }));
  assert.deepEqual(at(res, 'class-ceiling'), [], 'a kind AT the picked class is legal');
  assert.equal(res.ceiling.class, 'soft-green');
});

test('ceiling: a LOCKED kind is refused as unavailable and never ALSO redded for its class — one problem, one red', () => {
  const decl = goodDeclaration();
  decl.stages.splice(3, 0, { name: 'reads-well', kind: 'judged-floor', params: {} });
  const res = run(decl);
  assert.equal(at(res, 'locked-kind').length, 1);
  assert.deepEqual(at(res, 'class-ceiling'), []);
});

test('ceiling: the PICK is required — a validator with no pick cannot check the promise', () => {
  const res = validateDeclaration(goodDeclaration(), { listing: LISTING, guards: greenGuards('js'), envOwned: [] });
  assert.ok(at(res, 'class-absent').length > 0, JSON.stringify(codes(res)));
  assert.equal(res.ok, false);
  // an unknown pick is the same refusal, and it names the enumerated menu
  const bad = validateDeclaration(goodDeclaration(), opts({ verdictType: 'greenish' }));
  const red = at(bad, 'class-absent')[0];
  assert.ok(red && VERDICT_CLASSES.every((c) => String(red.detail).includes(c)), JSON.stringify(bad.reds));
});

// ── genre env injection (the second addendum-6 residue) ──────────────────────

test('genre env: python gets MYPYPATH from the source prefixes; js gets nothing', () => {
  assert.deepEqual(genreEnv('python', { sourcePrefixes: ['packages/spawner/src'] }), { MYPYPATH: 'packages/spawner/src' });
  assert.deepEqual(genreEnv('python', { sourcePrefixes: ['a/src', 'b/src'] }), { MYPYPATH: 'a/src:b/src' });
  assert.deepEqual(genreEnv('js', { sourcePrefixes: ['src'] }), {});
  assert.deepEqual(genreOwnedEnvNames('python'), ['MYPYPATH']);
  assert.deepEqual(genreOwnedEnvNames('js'), []);
});

test('genre env: no source prefixes means the var is UNSET, never an empty value', () => {
  assert.deepEqual(genreEnv('python', { sourcePrefixes: [] }), {});
  assert.deepEqual(genreEnv('python', {}), {});
});

// ── the validator: the frame ─────────────────────────────────────────────────

test('validator: a well-formed declaration validates, and hands back the RESOLVED form', () => {
  const decl = goodDeclaration();
  decl.stages[1].params.parser = { lineMatch: 'error TS\\d+:' }; // the short form
  const res = run(decl);
  assert.deepEqual(res.reds, []);
  assert.equal(res.ok, true);
  // D13 forward-compat point 3: the hash is taken over the RESOLVED form, so the
  // validator is where the short form stops existing.
  assert.deepEqual(res.declaration.stages[1].params.parser, {
    terms: [{ lineMatch: 'error TS\\d+:', capture: null, sign: 1, aggregate: 'first', region: 'whole-output' }],
  });
  assert.deepEqual(decl.stages[1].params.parser, { lineMatch: 'error TS\\d+:' }, 'the input must not be mutated');
});

test('validator: a red declaration hands back null, like every shipped validator', () => {
  const res = run({ stages: [] });
  assert.equal(res.ok, false);
  assert.equal(res.declaration, null);
});

test('validator: never throws on hostile shapes', () => {
  for (const bad of [null, undefined, 7, 'stages', [], { stages: 'src' }, { stages: [null, 3, []] }]) {
    const res = run(bad);
    assert.equal(res.ok, false);
    assert.ok(res.reds.length > 0);
  }
});

test('validator: the stage ceiling binds', () => {
  const decl = goodDeclaration();
  while (decl.stages.length <= MAX_STAGES) decl.stages.splice(1, 0, countStage({ }));
  const res = run(decl);
  assert.ok(res.reds.some((r) => r.path === 'stages' && String(r.detail).includes(String(MAX_STAGES))));
});

test('validator: names are slugs, and a name is never used twice', () => {
  const bad = goodDeclaration();
  bad.stages[1].name = 'TypeCheck';
  assert.ok(at(run(bad), 'invalid-value').some((r) => r.path.endsWith('.name')));

  const dup = goodDeclaration();
  dup.stages[2].name = dup.stages[1].name;
  assert.ok(at(run(dup), 'duplicate-name').length > 0);

  const missing = goodDeclaration();
  delete missing.stages[1].name;
  assert.ok(at(run(missing), 'missing-field').some((r) => r.path.endsWith('.name')));
});

// ── kinds: unknown vs LOCKED ─────────────────────────────────────────────────

test('validator: an unknown kind is a typo red', () => {
  const decl = goodDeclaration();
  decl.stages[1].kind = 'harness-loop';
  const res = run(decl);
  const red = at(res, 'unknown-kind')[0];
  assert.ok(red, 'harness-loop must be unknown, not locked — it is out of v1 with no menu entry');
  assert.equal(red.kind, 'harness-loop');
});

test('validator: a LOCKED kind is a DISTINCT red carrying counted demand', () => {
  for (const locked of LOCKED_KINDS) {
    const decl = goodDeclaration();
    decl.stages[1] = { name: 'judge-it', kind: locked, params: {} };
    const res = run(decl);
    const red = at(res, 'locked-kind')[0];
    assert.ok(red, `${locked} must red as locked-kind`);
    // the ledger keys admission demand on structured fields, never on prose,
    // and the territory is stamped at the emit site (the typed-lib rule): this
    // is demand against BARELOOP's own catalogue, not a bare-suite gap.
    assert.equal(red.verb, locked);
    assert.equal(red.lib, 'bareloop');
    assert.equal(at(res, 'unknown-kind').length, 0, 'a locked kind is never an unknown-kind typo');
  }
});

// ── params ───────────────────────────────────────────────────────────────────

test('validator: a missing required param, and a param the catalogue does not name', () => {
  const missing = goodDeclaration();
  delete missing.stages[1].params.direction;
  assert.ok(at(run(missing), 'missing-field').some((r) => r.path.endsWith('.direction')));

  const extra = goodDeclaration();
  extra.stages[1].params.threshold = 5;
  assert.ok(at(run(extra), 'invalid-value').some((r) => r.path.endsWith('.threshold')));
});

test('validator: direction and baseline come from the menu, never free text', () => {
  const d = goodDeclaration();
  d.stages[1].params.direction = 'lower';
  assert.ok(at(run(d), 'invalid-value').some((r) => r.path.endsWith('.direction')));
  assert.ok(DIRECTIONS.includes('lower-is-better') && DIRECTIONS.includes('higher-is-better'));

  const b = goodDeclaration();
  b.stages[1].params.baseline = 63; // the paid-for number, hardcoded — D12 forbids it
  assert.ok(at(run(b), 'invalid-value').some((r) => r.path.endsWith('.baseline')));
  assert.deepEqual([...BASELINES], ['seed', 0]);
});

test('validator: command shape — cmd, args, timeoutMs, env values', () => {
  const c = goodDeclaration();
  c.stages[3].params.cmd = '';
  assert.ok(at(run(c), 'invalid-value').some((r) => r.path.endsWith('.cmd')));

  const a = goodDeclaration();
  a.stages[3].params.args = 'test';
  assert.ok(at(run(a), 'invalid-value').some((r) => r.path.endsWith('.args')));

  const t = goodDeclaration();
  t.stages[3].params.timeoutMs = -1;
  assert.ok(at(run(t), 'invalid-value').some((r) => r.path.endsWith('.timeoutMs')));

  const e = goodDeclaration();
  e.stages[3].params.env = { CI: 1 };
  assert.ok(at(run(e), 'invalid-value').some((r) => r.path.endsWith('.env')));
});

test('validator: command-exit needs an integer exit code', () => {
  for (const bad of ['0', 0.5, null, true]) {
    const d = goodDeclaration();
    d.stages[3].params.expectExit = bad;
    assert.ok(at(run(d), 'invalid-value').concat(at(run(d), 'missing-field')).some((r) => r.path.endsWith('.expectExit')),
      `expectExit ${JSON.stringify(bad)}`);
  }
});

test('validator: files-changed needs real allowPrefixes and a literal requireNonEmpty:true', () => {
  const d = goodDeclaration();
  d.stages[0].params.requireNonEmpty = false;
  assert.ok(at(run(d), 'invalid-value').some((r) => r.path.endsWith('.requireNonEmpty')));

  for (const bad of [[], 'src', [7], ['']]) {
    const a = goodDeclaration();
    a.stages[0].params.allowPrefixes = bad;
    assert.ok(at(run(a), 'invalid-value').some((r) => r.path.endsWith('.allowPrefixes')), `allowPrefixes ${JSON.stringify(bad)}`);
  }
});

test('validator: pattern-absent-in-diff needs patterns, ids, regexes and extensions', () => {
  for (const bad of [[], 'ts-ignore', {}]) {
    const e = goodDeclaration();
    e.stages[4].params.patterns = bad;
    assert.ok(at(run(e), 'invalid-value').some((r) => r.path.endsWith('.patterns')), `patterns ${JSON.stringify(bad)}`);
  }

  const p = goodDeclaration();
  p.stages[4].params.patterns = [{ id: '', regex: 'x' }];
  assert.ok(at(run(p), 'invalid-value').some((r) => r.path.includes('.id')));

  const x = goodDeclaration();
  x.stages[4].params.extensions = [];
  assert.ok(at(run(x), 'invalid-value').some((r) => r.path.endsWith('.extensions')));
});

test('validator: a scope is an object of prefix ARRAYS, and takes no other key', () => {
  // a non-object scope must red as a MISSING population, not fall through to
  // the F84 filter check and report something else about it
  const notObj = goodDeclaration();
  notObj.stages[1].params.scope = 'src/email.js';
  assert.ok(at(run(notObj), 'missing-field').some((r) => r.path.endsWith('.scope')));

  for (const bad of ['src/email.js', [], [7]]) {
    const inc = goodDeclaration();
    inc.stages[1].params.scope = { includePrefixes: bad };
    assert.ok(at(run(inc), 'invalid-value').some((r) => r.path.endsWith('.includePrefixes')), `includePrefixes ${JSON.stringify(bad)}`);

    const exc = goodDeclaration();
    exc.stages[2].params.scope = { excludePrefixes: bad };
    assert.ok(at(run(exc), 'invalid-value').some((r) => r.path.endsWith('.excludePrefixes')), `excludePrefixes ${JSON.stringify(bad)}`);
  }

  const stray = goodDeclaration();
  stray.stages[1].params.scope.onlyPrefixes = ['src'];
  assert.ok(at(run(stray), 'invalid-value').some((r) => r.path.endsWith('.onlyPrefixes')));
});

// ── the parser: ONE normalisation, M1's ──────────────────────────────────────

test('validator: parser reds arrive through the executor\'s OWN normaliser', () => {
  const both = goodDeclaration();
  both.stages[1].params.parser = { terms: [], lineMatch: 'x' };
  assert.ok(run(both).reds.some((r) => String(r.detail).includes('never both')));

  const badSign = goodDeclaration();
  badSign.stages[1].params.parser = { terms: [{ lineMatch: 'e', sign: 2, aggregate: 'sum', region: 'whole-output' }] };
  assert.ok(run(badSign).reds.some((r) => r.path.includes('sign')));

  const badGroup = goodDeclaration();
  badGroup.stages[1].params.parser = { terms: [{ lineMatch: 'e(\\d+)', capture: 3, sign: 1, aggregate: 'sum', region: 'whole-output' }] };
  assert.ok(run(badGroup).reds.some((r) => r.path.includes('capture')));
});

test('validator: F49 — a nested quantifier is rejected statically, in every regex slot', () => {
  const lineMatch = goodDeclaration();
  lineMatch.stages[1].params.parser = { terms: [{ lineMatch: '(a+)+$', sign: 1, aggregate: 'sum', region: 'whole-output' }] };
  assert.ok(run(lineMatch).reds.some((r) => String(r.detail).includes('nested quantifier')), 'lineMatch');

  const anchor = goodDeclaration();
  anchor.stages[1].params.parser = {
    terms: [{ lineMatch: 'x', sign: 1, aggregate: 'sum', region: { anchor: '(\\d*)*=', capture: 0 } }],
  };
  assert.ok(run(anchor).reds.some((r) => String(r.detail).includes('nested quantifier')), 'region anchor');

  const pat = goodDeclaration();
  pat.stages[4].params.patterns = [...pat.stages[4].params.patterns, { id: 'evil', regex: '((a+))+' }];
  assert.ok(run(pat).reds.some((r) => String(r.detail).includes('nested quantifier')), 'pattern regex');

  const broken = goodDeclaration();
  broken.stages[4].params.patterns = [{ id: 'nope', regex: '(' }];
  assert.ok(run(broken).reds.some((r) => String(r.detail).includes('not a valid regular expression')));
});

// ── the one-population law (F84) ─────────────────────────────────────────────

test('one-population: a count stage over a SCOPED job must name its population', () => {
  const decl = goodDeclaration();
  delete decl.stages[1].params.scope.includePrefixes;
  const res = run(decl);
  const red = at(res, 'one-population')[0];
  assert.ok(red, 'a scoped job with an unfiltered count mixes two populations under one name');
  assert.equal(red.rule, 'unnamed-population');
});

test('one-population: an UNSCOPED job may count over everything — the law must not over-red', () => {
  const decl = goodDeclaration();
  decl.stages[0].params.allowPrefixes = ['.'];          // whole tree — nothing is outside
  decl.stages.splice(2, 1);                             // no outside ceiling on a whole-tree job
  delete decl.stages[1].params.scope.includePrefixes;
  const res = run(decl);
  assert.deepEqual(at(res, 'one-population'), []);
  assert.equal(res.ok, true, JSON.stringify(res.reds));
});

test('one-population: two counts over the SAME population are one population declared twice', () => {
  const decl = goodDeclaration();
  const twin = structuredClone(decl.stages[1]);
  twin.name = 'typecheck-again';
  decl.stages.splice(2, 0, twin);
  const res = run(decl);
  const red = at(res, 'one-population').find((r) => r.rule === 'duplicate-population');
  assert.ok(red, 'identical cmd + parser + scope is the same number measured twice');
  assert.ok(String(red.detail).includes('typecheck'));
});

test('one-population: the in-scope/outside split is EXACTLY what must stay legal', () => {
  // same cmd, same parser, complementary scope — the F84 split itself. If the
  // duplicate rule reds this, it has eaten the thing it exists to protect.
  const res = run(goodDeclaration());
  assert.deepEqual(at(res, 'one-population'), []);
});

/** the genre's own containment guard, by NAME — never a second spelling here */
const SCOPE_GUARD = greenGuards('js').find((g) => g.kind === 'files-changed').name;

/** a legally-shaped whole-tree containment stage that is NOT the genre guard */
const decoyStage = () => ({
  name: 'files-touched',
  kind: 'files-changed',
  params: { allowPrefixes: ['.'], requireNonEmpty: true },
});

test('one-population: the job\'s scope is read off the GENRE GUARD, never the first files-changed stage — a decoy cannot disarm F84', () => {
  const decl = goodDeclaration();
  decl.stages.unshift(decoyStage());            // declared BEFORE the real guard
  delete decl.stages[2].params.scope.includePrefixes;   // the count is now unfiltered
  const res = run(decl);
  assert.equal(res.scoped.scoped, true, 'the guard names a proper subset — the job IS scoped');
  assert.equal(res.scoped.via, `${SCOPE_GUARD}.allowPrefixes`);
  const red = at(res, 'one-population').find((r) => r.rule === 'unnamed-population');
  assert.ok(red, 'a whole-tree decoy in front of the guard must not switch the one-population law off');
});

test('one-population: a whole-tree job read off the GUARD is still genuinely unscoped — the law must not over-red', () => {
  const decl = goodDeclaration();
  decl.stages[0].params.allowPrefixes = ['.'];  // the GUARD says whole tree
  decl.stages.splice(2, 1);                     // no outside ceiling on a whole-tree job
  delete decl.stages[1].params.scope.includePrefixes;
  const res = run(decl);
  assert.equal(res.scoped.scoped, false);
  assert.deepEqual(at(res, 'one-population'), []);
});

test('a SECOND files-changed stage is a duplicate-kind red — one containment stage, and an intersection of prefix sets is itself a prefix set', () => {
  const decl = goodDeclaration();
  decl.stages.unshift(decoyStage());
  const red = at(run(decl), 'duplicate-kind')[0];
  assert.ok(red, 'two containment stages make the job\'s own scope ambiguous');
  assert.equal(red.kind, 'files-changed');
  assert.equal(red.twin, 'files-touched', 'the first one declared owns the kind');
  assert.equal(red.stage, SCOPE_GUARD);
  // and the law must not fire on the ONE stage every legal declaration carries
  assert.deepEqual(at(run(goodDeclaration()), 'duplicate-kind'), []);
});

// ── notes: the loop must red what signing would red (M2/M3 divergence) ───────

test('validator: every note is a non-empty string — the LOOP reds it, not the signing gate', () => {
  const empty = goodDeclaration();
  empty.notes = ['a real note', ''];
  const red = at(run(empty), 'invalid-value').find((r) => r.path === 'notes');
  assert.ok(red, 'an empty note that passes the loop and reds at signing is a paid loop that succeeded into a refusal');

  const wrongShape = goodDeclaration();
  wrongShape.notes = 'not an array';
  assert.ok(at(run(wrongShape), 'invalid-value').some((r) => r.path === 'notes'));

  const good = goodDeclaration();
  good.notes = ['could not express the per-package timeout'];
  assert.equal(run(good).ok, true, JSON.stringify(run(good).reds));
  assert.equal(run(goodDeclaration()).ok, true, 'absent notes stay legal');
});

// ── listing selection (hamr's rule) ──────────────────────────────────────────

test('listing: an invented path is a DISTINCT red, in every path-bearing param', () => {
  const inc = goodDeclaration();
  inc.stages[1].params.scope.includePrefixes = ['src/alertEmail.js'];  // round 2, arm A
  const r1 = run(inc);
  const red = at(r1, 'path-not-in-listing')[0];
  assert.ok(red, 'the invented filename must not survive validation');
  assert.equal(red.declared, 'src/alertEmail.js');

  const exc = goodDeclaration();
  exc.stages[2].params.scope.excludePrefixes = ['src/nope.js'];
  assert.ok(at(run(exc), 'path-not-in-listing').length > 0, 'a dead exclude filter is a dead filter');

  const allow = goodDeclaration();
  allow.stages[0].params.allowPrefixes = ['lib/'];
  assert.ok(at(run(allow), 'path-not-in-listing').length > 0, 'allowPrefixes');
});

test('listing: a directory spelling must name a real DIRECTORY, a file a real FILE', () => {
  const dirOk = goodDeclaration();
  dirOk.stages[0].params.allowPrefixes = ['src/', 'test/'];
  dirOk.stages[1].params.scope.includePrefixes = ['src'];
  dirOk.stages[2].params.scope.excludePrefixes = ['src'];
  assert.deepEqual(at(run(dirOk), 'path-not-in-listing'), []);

  // `src/email.js/` is spelled as a directory but the listing says it is a file
  const dirOnFile = goodDeclaration();
  dirOnFile.stages[0].params.allowPrefixes = ['src/email.js/'];
  const red = at(run(dirOnFile), 'path-not-in-listing')[0];
  assert.ok(red, 'a trailing slash asserts a directory');
  assert.ok(String(red.detail).includes('file'));
});

test('listing: the root selects; a glob the FENCE does not collapse does not', () => {
  // the spellings globToPrefix actually collapses to the run directory
  for (const root of ['.', './', '/', './/']) {
    const decl = goodDeclaration();
    decl.stages[0].params.allowPrefixes = [root];
    assert.deepEqual(at(run(decl), 'path-not-in-listing'), [], `root spelling ${root}`);
  }
  // the shipped `/**` suffix collapses to its directory, and that directory is real
  for (const dir of ['src/**', 'src/*', 'src/']) {
    const decl = goodDeclaration();
    decl.stages[0].params.allowPrefixes = [dir];
    assert.deepEqual(at(run(decl), 'path-not-in-listing'), [], `directory spelling ${dir}`);
  }
  // A BARE `**` is not a root and must red — `globToPrefix` only collapses the
  // `/**` SUFFIX, so the fence and M1's `underPrefix` both read `**` as a literal
  // prefix that matches nothing. Admitting it here would put the validator and
  // the grader on two spellings of the same scope (the F9 red-class): green at
  // the gate, and a containment guard that reds every file at runtime.
  for (const bogus of ['**', '*']) {
    const decl = goodDeclaration();
    decl.stages[0].params.allowPrefixes = [bogus];
    assert.ok(at(run(decl), 'path-not-in-listing').length > 0, `bare glob ${bogus} must not pass as a root`);
  }
});

test('listing: an ABSENT listing is a red, never a silently skipped check', () => {
  for (const bad of [undefined, null, [], 'src/email.js']) {
    const res = validateDeclaration(goodDeclaration(), opts({ listing: bad }));
    assert.ok(at(res, 'listing-absent').length > 0, `listing ${JSON.stringify(bad)}`);
    assert.equal(res.ok, false);
    // and the path check does not then fire once per path against an empty index —
    // one honest red about the instrument, not a storm about the declaration
    assert.deepEqual(at(res, 'path-not-in-listing'), []);
  }
});

// ── the D5 line: the injected guards ─────────────────────────────────────────

test('guards: a dropped guard is a red naming the guard', () => {
  const decl = goodDeclaration();
  decl.stages.pop(); // no-suppressions — exactly the stage F87 caught
  const red = at(run(decl), 'guard-missing')[0];
  assert.ok(red);
  assert.equal(red.guard, 'no-suppressions');
});

test('guards: a weakened battery is a red — patterns are ours, not the model\'s', () => {
  const thin = goodDeclaration();
  thin.stages[4].params.patterns = thin.stages[4].params.patterns.slice(0, 3); // round 1: 3 of 7
  assert.ok(at(run(thin), 'guard-weakened').some((r) => r.param === 'patterns'));

  const rewritten = goodDeclaration();
  rewritten.stages[4].params.patterns[1].regex = '@ts-expect-error-NOT';
  assert.ok(at(run(rewritten), 'guard-weakened').some((r) => r.param === 'patterns'));

  const exts = goodDeclaration();
  exts.stages[4].params.extensions = ['.js'];
  assert.ok(at(run(exts), 'guard-weakened').some((r) => r.param === 'extensions'));
});

test('guards: NARROWING the suppression scan is a red (addendum 6 — guard scope is genre-owned)', () => {
  const decl = goodDeclaration();
  decl.stages[4].params.scope = { includePrefixes: [...TARGETS] };  // round 3, arm A
  const red = at(run(decl), 'guard-weakened')[0];
  assert.ok(red, 'the scan covers every changed file of the genre extensions, never the target files only');
  assert.equal(red.param, 'scope');
});

test('guards: swapping a guard\'s kind is a red', () => {
  const decl = goodDeclaration();
  decl.stages[4] = { name: 'no-suppressions', kind: 'command-exit', params: { cmd: 'true', args: [], expectExit: 0 } };
  assert.ok(at(run(decl), 'guard-weakened').some((r) => r.param === 'kind'));
});

test('guards: the model-filled slot stays fillable — allowPrefixes is not weakening', () => {
  const res = run(goodDeclaration());
  assert.deepEqual(at(res, 'guard-weakened'), []);
  assert.deepEqual(at(res, 'guard-missing'), []);
});

test('guards: ABSENT guards are a red — D5 is never validated away by omission', () => {
  for (const bad of [undefined, null, []]) {
    const res = validateDeclaration(goodDeclaration(), opts({ guards: bad }));
    assert.ok(at(res, 'guards-absent').length > 0, `guards ${JSON.stringify(bad)}`);
    assert.equal(res.ok, false);
  }
});

test('env ownership: ABSENT is a red; declared-EMPTY is a genre that owns none', () => {
  const absent = validateDeclaration(goodDeclaration(), { listing: LISTING, guards: greenGuards('js'), verdictType: 'green' });
  assert.ok(at(absent, 'env-ownership-absent').length > 0);
  assert.equal(absent.ok, false);
  // `[]` is JS's real answer and must pass — absent and empty are different states
  const empty = validateDeclaration(goodDeclaration(), { listing: LISTING, guards: greenGuards('js'), envOwned: [], verdictType: 'green' });
  assert.deepEqual(at(empty, 'env-ownership-absent'), []);
  assert.equal(empty.ok, true);
});

test('guards: the shipped Python battery validates against its own genre', () => {
  const pyListing = ['mypy.ini', 'packages/spawner/src/aurora_spawner/spawner.py', 'packages/spawner/tests/test_spawner.py'];
  const guards = greenGuards('python');
  const decl = {
    stages: [
      { name: 'changed-from-seed', kind: 'files-changed', params: { ...guards[0].params, allowPrefixes: ['packages/spawner/src'] } },
      {
        name: 'typecheck',
        kind: 'count-not-worse',
        params: {
          cmd: 'python3',
          args: ['-m', 'mypy', '--strict', 'packages/spawner/src'],
          parser: { terms: [{ lineMatch: ' error: ', sign: 1, aggregate: 'sum', region: 'whole-output' }] },
          scope: { includePrefixes: ['packages/spawner/src'] },
          direction: 'lower-is-better',
          baseline: 0,
        },
      },
      { name: 'no-suppressions', kind: 'pattern-absent-in-diff', params: structuredClone(guards[1].params) },
    ],
  };
  const res = validateDeclaration(decl, { listing: pyListing, guards, envOwned: genreOwnedEnvNames('python'), verdictType: 'green' });
  assert.deepEqual(res.reds, []);
});

// ── genre-owned env: ours to inject, never model-filled ──────────────────────

test('env: a model-authored genre-owned var is a red — the flow injects it, the model does not', () => {
  const decl = goodDeclaration();
  decl.stages[1].params.env = { MYPYPATH: 'src' };  // round 2, arm B: the wrong value
  const res = validateDeclaration(decl, opts({ envOwned: ['MYPYPATH'] }));
  const red = at(res, 'genre-owned-env')[0];
  assert.ok(red);
  assert.equal(red.name, 'MYPYPATH');
  // and a var the genre does NOT own stays the model's to set
  const other = goodDeclaration();
  other.stages[1].params.env = { PYTHONDONTWRITEBYTECODE: '1' };
  assert.deepEqual(at(validateDeclaration(other, opts({ envOwned: ['MYPYPATH'] })), 'genre-owned-env'), []);
});

// The check above catches the MODEL. Every RE-validation after the flow injected
// the genre's own variable sees the SAME key in the same place — and a check that
// can only flag PRESENCE cannot tell the arbiter's injection from the model's
// guess, so it reds the arbiter's own artefact and no python close can ever be
// signed, validated or run. The split is by VALUE, exactly as `checkGuards`
// splits a genre guard from a weakened copy.
test('env: the ARBITER\'s own injection is accepted BY VALUE, and a wrong value in the same key still reds', () => {
  const injected = { MYPYPATH: 'src' };
  const post = (/** @type {any} */ decl) => validateDeclaration(decl, opts({ envOwned: ['MYPYPATH'], envInjected: injected }));

  // the POST-injection form is what `applyGenreEnv` really leaves behind: the
  // variable on EVERY env-capable stage, not just the one under test
  const ours = injectedDeclaration(injected);
  assert.deepEqual(at(post(ours), 'genre-owned-env'), [], 'the arbiter must not red its own injection');
  assert.equal(post(ours).ok, true);

  // the round-2 arm-B failure, and plain corruption, are the SAME shape: a value
  // that is not the one the arbiter builds
  const wrong = injectedDeclaration(injected);
  wrong.stages[1].params.env = { MYPYPATH: 'src:lib' };
  const red = at(post(wrong), 'genre-owned-env')[0];
  assert.ok(red, 'a wrong value in an owned key is the model or corruption, never ours');
  assert.equal(red.name, 'MYPYPATH');
  assert.equal(red.expected, 'src');
  assert.equal(red.declared, 'src:lib');

  // PRE-injection (the authoring loop passes no injection) the model's copy still
  // reds, on every stage carrying it — the loop's gate is not what moved
  const envStages = ours.stages.filter((/** @type {any} */ s) => Object.hasOwn(s.params, 'env')).length;
  assert.ok(envStages >= 2);
  assert.equal(at(validateDeclaration(ours, opts({ envOwned: ['MYPYPATH'] })), 'genre-owned-env').length, envStages);
});

// The value check catches a CHANGED variable. Nothing caught a DELETED one: drop
// the key from a stage (or drop `env` outright) and the by-value rule has nothing
// to compare, so a hand-edited spec validates clean and mypy silently resolves
// through an editable install to a different checkout — the Result-5 hazard, back
// through the one door the fix left open. Ownership is only real if it is
// complete: what the arbiter injected must be PRESENT everywhere it injects.
test('env completeness: a recorded injection DELETED from an env-capable stage reds — the Result-5 hazard both ways', () => {
  const injected = { MYPYPATH: 'src' };
  const post = (/** @type {any} */ decl) => validateDeclaration(decl, opts({ envOwned: ['MYPYPATH'], envInjected: injected }));

  const full = injectedDeclaration(injected);
  assert.deepEqual(at(post(full), 'genre-env-missing'), [], 'the arbiter\'s own complete artefact must pass');
  assert.equal(post(full).ok, true);
  // the fixture has to carry MORE than one env-capable stage or "every stage" is
  // untested by construction
  const capable = full.stages.filter((/** @type {any} */ s) => Object.hasOwn(s.params, 'env'));
  assert.ok(capable.length >= 2, `only ${capable.length} env-capable stages — the rule would be vacuous`);

  // one key deleted, the rest of the artefact untouched
  const gone = structuredClone(full);
  delete gone.stages[1].params.env.MYPYPATH;
  const red = at(post(gone), 'genre-env-missing')[0];
  assert.ok(red, 'a stage the arbiter injected into may not come back without it');
  assert.equal(red.path, 'stages[1].params.env.MYPYPATH');
  assert.equal(red.name, 'MYPYPATH');
  assert.equal(post(gone).ok, false);

  // the whole env object deleted is the same hazard wearing a different shape
  const noEnv = structuredClone(full);
  delete noEnv.stages[3].params.env;
  assert.equal(at(post(noEnv), 'genre-env-missing')[0]?.path, 'stages[3].params.env.MYPYPATH');

  // a stage that CANNOT carry an environment is never asked for one — the rule
  // mirrors the catalogue the injector reads, so it can never demand what
  // `applyGenreEnv` would not inject
  const guardsOnly = at(post(full), 'genre-env-missing').filter((/** @type {any} */ r) => /stages\[(0|4)\]/.test(r.path));
  assert.deepEqual(guardsOnly, [], 'files-changed and pattern-absent-in-diff carry no env');

  // PRE-injection (the authoring loop records nothing) NOTHING is required: the
  // model is not asked to supply the variable it is forbidden to author
  const bare = goodDeclaration();
  assert.deepEqual(at(validateDeclaration(bare, opts({ envOwned: ['MYPYPATH'] })), 'genre-env-missing'), []);
  assert.deepEqual(run(bare).reds, []);
});

// ── the deny floor under a declared command (PRD v1.57 §3) ───────────────────

test('deny floor: every name in the exported constant is refused at the gate — the list and the gate cannot drift', () => {
  assert.ok(DENIED_COMMANDS.length > 0);
  for (const cmd of DENIED_COMMANDS) {
    const decl = goodDeclaration();
    decl.stages[1] = countStage({ cmd });
    const red = at(run(decl), 'cmd-denied')[0];
    assert.ok(red, `${cmd} must be refused by the floor`);
    assert.ok(red.path.endsWith('.params.cmd'), red.path);
    assert.equal(red.cmd, cmd);
  }
});

test('deny floor: the mkfs FAMILY, and the OTHER command-bearing kind, are covered by the one helper', () => {
  const fs = goodDeclaration();
  fs.stages[1] = countStage({ cmd: 'mkfs.ext4' });
  assert.equal(at(run(fs), 'cmd-denied').length, 1, 'mkfs.* is a family, not one name');

  const exit = goodDeclaration();
  exit.stages[3].params.cmd = 'rm'; // the command-exit stage
  const red = at(run(exit), 'cmd-denied')[0];
  assert.ok(red && red.path.startsWith('stages[3]'), JSON.stringify(red));
});

test('deny floor: NORMALISED first — a directory, a case change and a traversal never dodge the basename', () => {
  for (const cmd of ['/usr/bin/rm', '/bin/sh', './bin/RM', 'BASH', '../../bin/rm']) {
    const decl = goodDeclaration();
    decl.stages[1] = countStage({ cmd });
    assert.ok(at(run(decl), 'cmd-denied').length > 0, `${cmd} must not dodge the floor`);
  }
});

test('deny floor: a DRIVE-ABSOLUTE spelling is outside the repository too — the two path-escape readings agree', () => {
  // `scopeContained` (src/validate.js) already counts `C:\` as an escape. This
  // check did not, so a drive-absolute path fell past the outside-repo branch to
  // the basename floor, which has never heard of `evil.bat` — no red at all.
  for (const cmd of ['C:\\Windows\\System32\\evil.bat', 'c:/tools/bin/build', 'D:\\ci\\run']) {
    const decl = goodDeclaration();
    decl.stages[1] = countStage({ cmd });
    const red = at(run(decl), 'cmd-denied')[0];
    assert.ok(red, `${cmd} names a program off this machine's repository and must be refused`);
    assert.match(red.detail, /outside the repository/);
  }
});

test('deny floor: a program named OUTSIDE the repository is refused even when its basename is innocent', () => {
  for (const cmd of ['/opt/toolchain/bin/tsc', '../elsewhere/bin/build', '/usr/local/bin/mypy']) {
    const decl = goodDeclaration();
    decl.stages[1] = countStage({ cmd });
    const red = at(run(decl), 'cmd-denied')[0];
    assert.ok(red, `${cmd} names a program outside the repository`);
  }
});

test('deny floor: every legitimate runner still validates — a floor that blocks the job is not a floor', () => {
  const runners = ['node', 'npx', 'npm', 'pnpm', 'yarn', 'python', 'python3', 'pytest', 'mypy',
    'tsc', 'go', 'cargo', 'make', 'git', 'uv', './node_modules/.bin/tsc'];
  for (const cmd of runners) {
    const decl = goodDeclaration();
    decl.stages[1] = countStage({ cmd });
    assert.deepEqual(at(run(decl), 'cmd-denied'), [], `${cmd} must keep working`);
  }
  // and the shipped genre-shaped declaration is clean end to end
  assert.deepEqual(run(goodDeclaration()).reds, []);
});

// ── the resolver ─────────────────────────────────────────────────────────────

test('normalizeDeclaration: resolves every short-form parser, and copies rather than edits', () => {
  const decl = goodDeclaration();
  decl.stages[1].params.parser = { lineMatch: 'error TS(\\d+):', capture: 1 };
  const out = normalizeDeclaration(decl);
  assert.deepEqual(out.stages[1].params.parser.terms[0], {
    lineMatch: 'error TS(\\d+):', capture: 1, sign: 1, aggregate: 'first', region: 'whole-output',
  });
  assert.deepEqual(decl.stages[1].params.parser, { lineMatch: 'error TS(\\d+):', capture: 1 });
  // a parser that cannot normalise is left VERBATIM — it already carries a red,
  // and rewriting it would hide what the model actually wrote
  const bad = goodDeclaration();
  bad.stages[1].params.parser = { lineMatch: 42 };
  assert.deepEqual(normalizeDeclaration(bad).stages[1].params.parser, { lineMatch: 42 });
  assert.deepEqual(normalizeDeclaration(null), null);
});

// ── the SIGNING readout: goal and judged stages, in one reading (F87) ────────
//
// F87's law is that the goal must state everything the close will judge, and
// NOTHING derives one from the other. So the only defence is the person signing
// seeing both halves at once — and neither signing surface did: run-author
// printed the declaration and never the goal, run-u's --approve gate printed
// the goal and never the declaration. The lines live in a helper because
// `run-author.mjs` is a script (importing it runs it, and reaching that block
// costs a real scout and a real model call), exactly as `u-readout.mjs` exists.
test('signing readout: the goal leads, and every stage that will judge it is named under it', () => {
  // a REAL signed spec out of this repo's own jobs/ — not a fixture authored to
  // contain the answer
  const spec = JSON.parse(readFileSync(join(REPO, 'jobs/pulselog-author-types.json'), 'utf8'));
  const lines = declarationLines(spec);

  assert.equal(lines[0], `goal       ${JSON.stringify(spec.goal)}`, 'the goal is not the first thing the signer reads');
  assert.equal(lines[1], 'declaration');
  // every stage, in declaration order, with the kind that decides how it grades
  const stages = spec.closeDecl.stages;
  assert.ok(stages.length > 1, 'this artifact no longer carries a multi-stage close — the reading it pins is gone');
  const heads = lines.filter((l) => /^ {2}\S/.test(l) && !l.startsWith('  note:'));
  assert.equal(heads.length, stages.length, 'a stage the close judges is missing from the readout');
  stages.forEach((s, i) => {
    assert.ok(heads[i].startsWith(`  ${s.name}  [${s.kind}]`), `stage ${i} renders as ${JSON.stringify(heads[i])}`);
    assert.ok(lines.includes(`      params ${JSON.stringify(s.params ?? {})}`), `stage ${s.name} lost its params line`);
  });
  for (const n of spec.closeDecl.notes ?? []) assert.ok(lines.includes(`  note: ${n}`));
});

test('signing readout: a missing goal reads as MISSING, never as an empty pair of quotes', () => {
  // F6 in prose: a blank after `goal` is indistinguishable from a goal that says
  // nothing, and this readout exists to make an unstated thing visible.
  const lines = declarationLines({ closeDecl: { stages: [{ name: 'a', kind: 'command-exit', params: {} }] } });
  assert.match(lines[0], /^goal +\(none/);
  assert.ok(lines.some((l) => l.startsWith('  a  [command-exit]')));
  // and a spec with no declaration at all still renders its goal rather than throwing
  assert.deepEqual(declarationLines({ goal: 'g' }), ['goal       "g"', 'declaration']);
});

// ── the authoring CEILING's parse and its announcement ───────────────────────
//
// Same reason as the readout above: `run-author.mjs` is a script, so the rule
// lives where a test can reach it. The rule itself is the one the run path paid
// for twice — a cap with a DEFAULT is a silent second ceiling, so the only route
// to unbounded is asking for nothing, and taking that route is announced.

test('the authoring ceiling has NO DEFAULT: an absent --budget is UNBOUNDED, and nothing else is', () => {
  assert.deepEqual(parseCeiling(null), { ceilingUsd: null, error: null });
  assert.deepEqual(parseCeiling('2.5'), { ceilingUsd: 2.5, error: null });
  assert.deepEqual(parseCeiling('0.05'), { ceilingUsd: 0.05, error: null });
});

test('a MALFORMED --budget is an error, never a silent fall back to unbounded', () => {
  // the failure this flag exists to prevent, wearing the operator's own typo: a
  // value that cannot be read collapsing into "no ceiling" would spend real money
  // under a cap the person believed they had set
  for (const bad of ['banana', '', '-1', '0', 'NaN', 'Infinity']) {
    const r = parseCeiling(bad);
    assert.equal(r.ceilingUsd, null, `${JSON.stringify(bad)} must not become a ceiling`);
    assert.match(r.error ?? '', /not a positive number of dollars/, `${JSON.stringify(bad)} must be REFUSED, not defaulted`);
    assert.match(r.error ?? '', /omit the flag entirely to run UNBOUNDED/, 'and the message names the only legal route to unbounded');
  }
});

test('an UNBOUNDED authoring run ANNOUNCES itself — an absent cap is a stated choice, never a silent state', () => {
  const unbounded = ceilingLine(null);
  assert.match(unbounded, /UNBOUNDED/);
  assert.match(unbounded, /reported, never capped/, 'it says what it will and will not do about the money');
  const bounded = ceilingLine(2.5);
  assert.match(bounded, /\$2\.5 ceiling/);
  assert.match(bounded, /BETWEEN metered calls/, 'and a bounded run states the seam it binds at');
  assert.ok(!/UNBOUNDED/.test(bounded), 'the two readings are never confusable');
});
