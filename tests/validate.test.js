// The shared validation primitives, tested at the primitive level: the fence
// transform (`globToPrefix`), containment (`scopeContained`), and the ONE
// secret-shape inventory (`scanSecrets`). These are fence/arbiter territory —
// F9's red-class is a scope that validates under one transform and enforces
// under another, so the transform is pinned here and BOTH validators
// (validateJob, validatePlan) import this one implementation.
//
// The config-v1 half of this file died with config-v1 itself (PRD v1.32,
// 2026-07-26). What it uniquely covered — the workflow-config schema, its slot
// legality, its diffPaths — went with the schema. What it covered INCIDENTALLY,
// by driving the primitives through a config, is kept below, re-pointed at the
// primitives themselves: driving a deleted schema was never what made those
// assertions load-bearing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToPrefix, scopeContained, scanSecrets, sweepSecretLiterals } from '../src/validate.js';

test('R2 CRITICAL: a "./"+"//" spelling normalizes to a CONTAINED prefix, never an absolute escape', () => {
  // ".//src/**" is a sloppy-but-legal spelling of "src/**" (leading dot = relative).
  // Before the fix it minted the absolute prefix "/src" and escaped the run dir;
  // after, it collapses to "src" — contained and safe, not rejected.
  const cases = { './/src/**': 'src', './/etc/**': 'etc', './//src/**': 'src', './/./src/**': 'src' };
  for (const [scope, want] of Object.entries(cases)) {
    assert.ok(!globToPrefix(scope).startsWith('/'), `globToPrefix(${JSON.stringify(scope)}) = ${JSON.stringify(globToPrefix(scope))} must never be absolute`);
    assert.equal(globToPrefix(scope), want, `${JSON.stringify(scope)} normalizes to a contained prefix`);
    assert.equal(scopeContained(scope), true, `${JSON.stringify(scope)} is contained`);
  }
  // the belt still fires for a genuinely non-relative normalized prefix
  assert.equal(scopeContained('/abs/**'), false);
  assert.equal(scopeContained('../up/**'), false);
});

test('R2: "src/" and other equivalent spellings still normalize identically (no regression in the fence fix)', () => {
  for (const [a, b] of [['src/', 'src'], ['./src/**', 'src'], ['././src/**', 'src'], ['src/./gen/**', 'src/gen'], ['src//gen/**', 'src/gen']]) {
    assert.equal(globToPrefix(a), b, `globToPrefix(${JSON.stringify(a)})`);
  }
});

test('globToPrefix maps trailing globs to their directory prefix and nothing else', () => {
  assert.equal(globToPrefix('src/**'), 'src');
  assert.equal(globToPrefix('src/*'), 'src');
  assert.equal(globToPrefix('src'), 'src');
  assert.equal(globToPrefix('a/b/**'), 'a/b');
  assert.equal(globToPrefix('src/*/gen'), 'src/*/gen'); // mid-path untouched — the validator reds it
});

test('scanSecrets returns the LITERAL matches, sharing the ONE shape inventory with the sweep', () => {
  // Seven scripts hand-rolled this scan off SECRET_PATTERNS (review 2026-07-18).
  // Detection and redaction must never disagree about what a secret looks like,
  // so the scan gets ONE spelling next to the inventory it reads.
  const raw = 'log line\nAuthorization: Bearer ghp_' + 'A'.repeat(24) + '\nharmless flask-sqlalchemy\n';
  const hits = scanSecrets(raw);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^ghp_A+$/);
  assert.deepEqual(scanSecrets('nothing to see, sk-not (too short)'), []);
  assert.deepEqual(scanSecrets(null), [], 'never throws on a missing stream');
});

test('scanSecrets finds EVERY occurrence, not just the first (a global scan, not a probe)', () => {
  const raw = ['AKIA' + 'B'.repeat(16), 'AKIA' + 'C'.repeat(16)].join('\n');
  assert.equal(scanSecrets(raw).length, 2);
});

test('the secret sweep reds a token literal anywhere in a signed document, and reds a secret-shaped KEY too — a token can ride a key onto the spine, not just a value', () => {
  const reds = [];
  const red = (code, path, detail) => reds.push({ code, path, detail });
  sweepSecretLiterals({ job: 'x', nested: { deep: ['sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'] } }, red);
  assert.equal(reds.length, 1, 'the sweep reaches nested arrays — a signed doc has no depth limit');
  assert.equal(reds[0].code, 'secret-literal');

  const keyReds = [];
  sweepSecretLiterals({ 'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 'harmless' }, (c, p, d) => keyReds.push({ code: c, path: p, detail: d }));
  assert.equal(keyReds.length, 1, 'a key is as much a leak channel as a value');
  assert.equal(keyReds[0].code, 'secret-literal');
});

test('scopeContained rejects every escape spelling and accepts the equivalent contained ones — the belt behind globToPrefix', () => {
  for (const bad of ['/abs/**', '../up/**', './../up/**', '/**']) {
    assert.equal(scopeContained(bad), false, `${JSON.stringify(bad)} must not be contained`);
  }
  for (const ok of ['src/**', './src/**', './/src/**', 'src/./gen/**', 'src//gen/**']) {
    assert.equal(scopeContained(ok), true, `${JSON.stringify(ok)} is a contained spelling`);
    assert.ok(!globToPrefix(ok).startsWith('/'), 'and never normalizes to an absolute prefix');
  }
});
