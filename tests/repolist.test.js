// Addendum 2026-11-15 (d) piece 1: the repo row builder. A `~` rule is kept only when code proves the fence keeps it; every other rule is Not checked. Fixture: the real signed spec of saved draft smw6ssquvtvqs
// ("no new dependencies", checked by nothing before this build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRepoRows, proveFenceClaim, NO_CHECK_WORDS, stageKeyOf, ruleKeyOf } from '../src/repolist.js';

const spec = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smw6ssquvtvqs-spec.json', import.meta.url), 'utf8'));
const files = ['package.json', 'src/sum.js', 'test/sum.test.js'];
const GUARDS = ['changed-from-seed', 'no-suppressions'];
const build = (/** @type {any} */ extra = {}) => buildRepoRows({ jobLines: spec.jobLines, stages: spec.closeDecl.stages, guardNames: GUARDS, writeScope: spec.writeScope, files, ...extra });

test('a rule with no fence claim is Not checked with code\'s reason, never a built row', () => {
  const row = build().find((r) => r.key === ruleKeyOf(1, 1));
  assert.equal(row.state, 'not-checked');
  assert.equal(row.reason, NO_CHECK_WORDS);
  assert.equal(row.by, 'you');
  assert.equal(row.fence, undefined);
});

test('a fence claim on a file outside the write scope and in the listing is proven: the rule row is built, kept by the fence', () => {
  const row = build({ fenceKept: [{ line: 1, rule: 1, path: 'package.json' }] }).find((r) => r.key === ruleKeyOf(1, 1));
  assert.equal(row.state, 'built');
  assert.equal(row.fence, 'package.json');
});

test('a fence claim on a path INSIDE the write scope is not proven: Not checked, with the path named', () => {
  const row = build({ fenceKept: [{ line: 1, rule: 1, path: 'src/sum.js' }] }).find((r) => r.key === ruleKeyOf(1, 1));
  assert.equal(row.state, 'not-checked');
  assert.match(row.reason, /the AI said the fence keeps it, but src\/sum\.js is a place the run may change/);
});

test('a fence claim on a path the listing does not hold is not proven', () => {
  const p = proveFenceClaim('lockfile.json', ['src/**'], files);
  assert.equal(p.ok, false);
  assert.match(/** @type {any} */ (p).reason, /not in the repo listing/);
  assert.equal(proveFenceClaim('../x', ['src/**'], files).ok, false);
  assert.equal(proveFenceClaim('package.json', ['src/**'], null).ok, false);
});

test('a folder claim is proven only when every listed file under it is outside the scope', () => {
  assert.equal(proveFenceClaim('test', ['src/**'], files).ok, true);
  assert.equal(proveFenceClaim('src', ['src/**'], files).ok, false);
  assert.equal(proveFenceClaim('.', ['src/**'], files).ok, false);
});

test('one `!` row per work stage on its line, one `$` row per guard and one for the fence, each once', () => {
  const rows = build();
  assert.deepEqual(rows.filter((r) => r.kind === 'stage').map((r) => r.key), ['node-test-executed-count', 'node-test-fail-count', 'suite-green'].map(stageKeyOf));
  assert.deepEqual(rows.filter((r) => r.kind === 'guard').map((r) => r.key), GUARDS.map((g) => `J.$guard.${g}`));
  assert.equal(rows.filter((r) => r.kind === 'fence').length, 1);
  assert.ok(rows.filter((r) => r.kind === 'stage').every((r) => r.by === 'agent' && r.state === 'built' && r.line === 1));
});

test('a line refused with no rule is a Not checked `!` row on that line; a rule-level refusal does not set the rule\'s reason', () => {
  const rows = build({ refused: [{ line: 1, reason: 'nothing here can read it' }, { line: 1, rule: 1, reason: 'the AI\'s own words' }] });
  const refusedRow = rows.find((r) => r.key === 'L1.refused.1');
  assert.equal(refusedRow.state, 'not-checked');
  assert.equal(refusedRow.reason, 'nothing here can read it');
  assert.equal(rows.find((r) => r.key === ruleKeyOf(1, 1)).reason, NO_CHECK_WORDS);
});

test('the old joined `rule` and the new `rules[]` both give one row per rule', () => {
  const old = buildRepoRows({ jobLines: [{ n: 1, text: 't', rule: 'a; b' }], stages: [], writeScope: ['src/'], files });
  const neu = buildRepoRows({ jobLines: [{ n: 1, text: 't', rules: ['a', 'b'] }], stages: [], writeScope: ['src/'], files });
  assert.deepEqual(old.filter((r) => r.kind === 'rule').map((r) => r.key), [ruleKeyOf(1, 1), ruleKeyOf(1, 2)]);
  assert.deepEqual(neu, old);
});
