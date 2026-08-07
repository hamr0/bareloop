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
import { LIVE_KINDS } from '../src/kinds.js';
import { hasNestedQuantifier } from '../src/validate.js';
import {
  KIND_CATALOGUE, CATALOGUE_KINDS, LOCKED_KINDS, MAX_STAGES, DIRECTIONS, BASELINES,
  TYPES_GENRE, TYPES_GENRE_TEMPLATE, GENRE_LANGUAGES,
  genreGuards, genreEnv, genreOwnedEnvNames,
  validateDeclaration, normalizeDeclaration,
} from '../src/authoring.js';

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
  return genreGuards('js').map((g) => (g.kind === 'files-changed'
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

const opts = (over = {}) => ({ listing: LISTING, guards: genreGuards('js'), envOwned: genreOwnedEnvNames('js'), ...over });
const run = (decl, over = {}) => validateDeclaration(decl, opts(over));
const codes = (res) => res.reds.map((r) => r.code);
/** @param {any} res @param {string} code */
const at = (res, code) => res.reds.filter((r) => r.code === code);

// ── the catalogue ────────────────────────────────────────────────────────────

test('catalogue: the live kinds are EXACTLY the executor\'s live kinds, both directions', () => {
  const live = CATALOGUE_KINDS.filter((k) => !KIND_CATALOGUE[k].locked);
  assert.deepEqual([...live].sort(), [...LIVE_KINDS].sort());
});

test('catalogue: judged-floor and human-confirms are LOCKED entries; harness-loop is ABSENT', () => {
  assert.deepEqual([...LOCKED_KINDS].sort(), ['human-confirms', 'judged-floor']);
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
  const guards = genreGuards('js');
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
  const a = genreGuards('js');
  a[1].params.patterns.length = 1;
  a[1].params.patterns[0].regex = 'x';
  const b = genreGuards('js');
  assert.equal(b[1].params.patterns.length, TYPES_GENRE.languages.js.suppressions.length);
  assert.equal(b[1].params.patterns[0].regex, TYPES_GENRE.languages.js.suppressions[0].regex);
});

test('genre guards: an unknown language THROWS — never an empty battery', () => {
  assert.throws(() => genreGuards('rust'), /rust/);
  assert.throws(() => genreEnv('rust', { sourcePrefixes: ['src'] }), /rust/);
  assert.throws(() => genreOwnedEnvNames('rust'), /rust/);
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
  const absent = validateDeclaration(goodDeclaration(), { listing: LISTING, guards: genreGuards('js') });
  assert.ok(at(absent, 'env-ownership-absent').length > 0);
  assert.equal(absent.ok, false);
  // `[]` is JS's real answer and must pass — absent and empty are different states
  const empty = validateDeclaration(goodDeclaration(), { listing: LISTING, guards: genreGuards('js'), envOwned: [] });
  assert.deepEqual(at(empty, 'env-ownership-absent'), []);
  assert.equal(empty.ok, true);
});

test('guards: the shipped Python battery validates against its own genre', () => {
  const pyListing = ['mypy.ini', 'packages/spawner/src/aurora_spawner/spawner.py', 'packages/spawner/tests/test_spawner.py'];
  const guards = genreGuards('python');
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
  const res = validateDeclaration(decl, { listing: pyListing, guards, envOwned: genreOwnedEnvNames('python') });
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
