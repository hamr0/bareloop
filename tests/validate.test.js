// Validator exit criteria: the valid fixture passes; each red fixture produces
// its ONE distinct named red (code + path), before any execution. Table-driven
// over tests/fixtures/ — one fixture per named red, each isolating a single
// defect. Reference semantics: adaptlearn's M1 suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, diffPaths, globToPrefix, scopeContained } from '../src/validate.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

test('valid fixture passes with zero reds and returns the parsed config (N1: single parse)', () => {
  const valid = load('valid.json');
  const r = validateConfig(valid);
  assert.equal(r.config, valid, 'reference echo is the contract for object input');
  assert.deepEqual(r, { ok: true, reds: [], config: load('valid.json') }, 'fresh-copy compare: validation must not mutate the config');
});

// ---- review fixes: the two-layer fence is normalized, fail-closed, and indexed ----

test('R2 CRITICAL: a "./"+"//" spelling normalizes to a CONTAINED prefix, never an absolute escape', () => {
  // ".//src/**" is a sloppy-but-legal spelling of "src/**" (leading dot = relative).
  // Before the fix it minted the absolute prefix "/src" and escaped the run dir;
  // after, it collapses to "src" — contained and safe, not rejected.
  const cases = { './/src/**': 'src', './/etc/**': 'etc', './//src/**': 'src', './/./src/**': 'src' };
  for (const [scope, want] of Object.entries(cases)) {
    assert.ok(!globToPrefix(scope).startsWith('/'), `globToPrefix(${JSON.stringify(scope)}) = ${JSON.stringify(globToPrefix(scope))} must never be absolute`);
    assert.equal(globToPrefix(scope), want, `${JSON.stringify(scope)} normalizes to a contained prefix`);
    assert.equal(scopeContained(scope), true, `${JSON.stringify(scope)} is contained`);
    assert.deepEqual(validateConfig({ ...load('valid.json'), gate: { budgetUsd: 1, writeScope: [scope] } }).reds, [], `${JSON.stringify(scope)} validates green (safe)`);
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


test('equivalent scope spellings agree across the layers (one normalize in globToPrefix)', () => {
  const wf = (scope) => ({ ...load('valid.json'), gate: { budgetUsd: 1, writeScope: [scope] } });
  // a validateJob-green fence with a trailing slash must not deadlock every workflow config
  assert.deepEqual(validateConfig(wf('src/**'), { jobWriteScope: ['src/'] }).reds, []);
  // spellings scopeContained explicitly allows fit a plain fence
  assert.deepEqual(validateConfig(wf('././src/**'), { jobWriteScope: ['src/**'] }).reds, []);
  assert.deepEqual(validateConfig(wf('src/./gen/**'), { jobWriteScope: ['src/**'] }).reds, []);
});

test('a malformed fence fails CLOSED with its own red — never silently dropped, never a lying scope-escape', () => {
  const cfg = load('valid.json');
  // non-array fence: enforcement must not be skippable by a caller bug
  const asString = validateConfig(cfg, { jobWriteScope: 'src/**' });
  assert.equal(asString.ok, false);
  assert.equal(asString.reds[0].code, 'fence-invalid');
  // null/undefined are the legitimate "no fence" spellings (job optional at N2) — skip the layer, never deadlock
  assert.deepEqual(validateConfig(cfg, { jobWriteScope: null }).reds, [], 'null fence = no fence');
  assert.deepEqual(validateConfig(cfg, { jobWriteScope: undefined }).reds, [], 'undefined fence = no fence');
  // fence entries validateJob would reject: distinct red, not scope-escape
  for (const fence of [['.'], ['./**'], ['../x/**'], ['src/*/gen/**'], ['/abs/**'], [''], [42]]) {
    const r = validateConfig(cfg, { jobWriteScope: fence });
    assert.equal(r.ok, false, `${JSON.stringify(fence)} must red`);
    assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'fence-invalid:jobWriteScope', `${JSON.stringify(fence)} attribution, got ${JSON.stringify(r.reds)}`);
  }
  // a malformed fence must not misattribute to the (innocent) workflow config field
  assert.notEqual(validateConfig(cfg, { jobWriteScope: [''] }).reds[0].path, 'gate.writeScope');
});

test('each escaping scope reds at its own indexed path (spine pins code:path per defect)', () => {
  const cfg = load('valid.json');
  cfg.gate.writeScope = ['src/**', 'docs/**', 'infra/**'];
  const r = validateConfig(cfg, { jobWriteScope: ['src/**'] });
  assert.deepEqual(r.reds.map((x) => `${x.code}:${x.path}`), ['scope-escape:gate.writeScope.1', 'scope-escape:gate.writeScope.2']);
});

// ---- review fix: the secrets sweep guards BOTH config documents ----

test('a token literal anywhere in a workflow config reds secret-literal (the agent-authored doc is the riskier one)', () => {
  const cfg = load('valid.json');
  cfg.gate.writeScope = ['src/ghp_abcdefghijklmnopqrstuv/**'];
  const r = validateConfig(cfg);
  assert.equal(r.ok, false);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'secret-literal:gate.writeScope.0');
});

test('a secret-shaped object KEY reds too — a token can ride a key onto the spine, not just a value (release review)', () => {
  const cfg = load('valid.json');
  cfg.memory.extra = { ghp_abcdefghijklmnopqrstuv: true };
  const r = validateConfig(cfg);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => `${x.code}:${x.path}` === 'secret-literal:memory.extra.ghp_abcdefghijklmnopqrstuv'), JSON.stringify(r.reds));
});

test('raw invalid JSON → parse-error red', () => {
  const r = validateConfig(readFileSync(join(fixtures, 'red/parse-error.txt'), 'utf8'));
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'parse-error');
});

// fixture file → the exact red it must produce (code + path), nothing else red
const RED_CASES = {
  'schema-missing':     { code: 'missing-required', path: 'schema' },
  'schema-wrong':       { code: 'invalid-value',    path: 'schema' },
  'smuggled-close':     { code: 'unknown-field',    path: 'close' },
  'smuggled-provider':  { code: 'unknown-field',    path: 'provider' },
  'loop-shape-missing': { code: 'missing-required', path: 'loop.shape' },
  'loop-shape-invalid': { code: 'invalid-value',    path: 'loop.shape' },
  'maxiter-bounds':     { code: 'bounds',           path: 'loop.maxIterations' },
  'store-missing':      { code: 'missing-required', path: 'memory.store' },
  'recall-k-bounds':    { code: 'bounds',           path: 'memory.recall.k' },
  'kinds-invalid':      { code: 'invalid-value',    path: 'memory.recall.kinds' },
  'compress-invalid':   { code: 'invalid-value',    path: 'memory.compressLevel' },
  'budget-missing':     { code: 'missing-required', path: 'gate.budgetUsd' },
  'budget-over-cap':    { code: 'bounds',           path: 'gate.budgetUsd' },
  'writescope-missing': { code: 'missing-required', path: 'gate.writeScope' },
  'writescope-empty':   { code: 'invalid-value',    path: 'gate.writeScope' },
  'writescope-midglob': { code: 'invalid-value',    path: 'gate.writeScope' },
  'writescope-escape':  { code: 'invalid-value',    path: 'gate.writeScope' },
  'writescope-absolute':{ code: 'invalid-value',    path: 'gate.writeScope' },
  'escalation-missing': { code: 'missing-required', path: 'escalation.mode' },
  'escalation-wrong':   { code: 'invalid-value',    path: 'escalation.mode' },
  'slot-unknown':       { code: 'unknown-field',    path: 'hooks.run-start' },
  'slot-overflow':      { code: 'slot-overflow',    path: 'hooks.before-attempt' },
  'verb-illegal':       { code: 'verb-illegal',     path: 'hooks.after-red.0' },
  'verb-placement':     { code: 'verb-placement',   path: 'hooks.before-attempt.0' },
  'verb-params':        { code: 'verb-params',      path: 'hooks.before-attempt.0.foo' },
};

for (const [fixture, expect] of Object.entries(RED_CASES)) {
  test(`red fixture ${fixture} → ${expect.code}:${expect.path}`, () => {
    const r = validateConfig(load(`red/${fixture}.json`));
    assert.equal(r.ok, false, 'must red');
    assert.equal(r.reds.length, 1, `exactly one red, got: ${JSON.stringify(r.reds)}`);
    assert.equal(r.reds[0].code, expect.code);
    assert.equal(r.reds[0].path, expect.path);
  });
}

test('garbage input types → parse-error red, never a throw', () => {
  for (const garbage of [42, null, true, [], 'not json at all', undefined]) {
    const r = validateConfig(garbage);
    assert.equal(r.ok, false, `${JSON.stringify(garbage)} must red`);
    assert.equal(r.reds[0].code, 'parse-error');
  }
});

test('budget cap is the shell\'s to set: 5 USD passes under a 10 USD shell cap', () => {
  const r = validateConfig(load('red/budget-over-cap.json'), { shellCapUsd: 10 });
  assert.equal(r.ok, true);
});

test('a config with several defects reports each as its own red', () => {
  const c = load('valid.json');
  delete c.memory.store;
  c.escalation.mode = 'vibes';
  const r = validateConfig(c);
  assert.equal(r.reds.length, 2);
  assert.deepEqual(r.reds.map((x) => x.code).sort(), ['invalid-value', 'missing-required']);
});

// ---- containment: a scope can never reach the arbiter's inputs (design law #1) ----
// ('../**' and '/tmp/**' live in the fixture table above; this covers the other spellings)

test('workdir-escaping and whole-workdir scopes red in every spelling; contained scopes pass', () => {
  const bad = [
    ['src/../../etc/**'], ['/**'], ['..'],          // escapes
    ['.'], ['./**'],                                 // the whole run dir — the close lives there
    ['..\\evil/**'], ['C:/evil/**'], ['c:\\evil'],   // Windows spellings escape too
  ];
  for (const scope of bad) {
    const cfg = load('valid.json');
    cfg.gate.writeScope = scope;
    const r = validateConfig(cfg);
    assert.equal(r.ok, false, `${JSON.stringify(scope)} must red`);
    assert.equal(r.reds[0].path, 'gate.writeScope');
  }
  for (const scope of [['src/**'], ['src/gen/*'], ['out'], ['a/b/c/**'], ['./src/**']]) {
    const cfg = load('valid.json');
    cfg.gate.writeScope = scope;
    assert.deepEqual(validateConfig(cfg).reds, [], `${JSON.stringify(scope)} must pass`);
  }
});

// ---- placement: each verb is legal only where it has effect ----
// An op that validates green but is inert at runtime is a fake knob in the
// contrast evidence (design law #3) — reds-before-tokens closes the axis.

test('every verb reds outside its one effective slot', () => {
  const cases = [
    ['after-red', { op: 'recall' }],       // context is discarded before the attempt
    ['on-green', { op: 'recall' }],        // nothing consumes on-green context
    ['after-red', { op: 'compress' }],
    ['on-green', { op: 'compress' }],
    ['before-attempt', { op: 'stash' }],   // no gap exists yet
    ['on-green', { op: 'stash' }],
    ['before-attempt', { op: 'remember' }],
    ['after-red', { op: 'remember' }],     // retention is verdict-gated (law #2)
  ];
  for (const [slot, op] of cases) {
    const cfg = load('valid.json');
    cfg.hooks = { [slot]: [op] };
    const r = validateConfig(cfg);
    assert.equal(r.ok, false, `${op.op} in ${slot} must red`);
    assert.equal(r.reds[0].code, 'verb-placement');
  }
});

test('op params named after Object.prototype members do not smuggle past the unknown-param red', () => {
  const cfg = load('valid.json');
  cfg.hooks['after-red'] = [{ op: 'stash', constructor: 1 }];
  const r = validateConfig(cfg);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'verb-params');
  assert.equal(r.reds[0].path, 'hooks.after-red.0.constructor');
});

// ---- globToPrefix: the ONE validator↔enforcement transform (F9 drift guard) ----

test('globToPrefix maps trailing globs to their directory prefix and nothing else', () => {
  assert.equal(globToPrefix('src/**'), 'src');
  assert.equal(globToPrefix('src/*'), 'src');
  assert.equal(globToPrefix('src'), 'src');
  assert.equal(globToPrefix('a/b/**'), 'a/b');
  assert.equal(globToPrefix('src/*/gen'), 'src/*/gen'); // mid-path untouched — the validator reds it
});

// ---- diffPaths: the one-knob mutation checker ----

test('diffPaths: identical configs → no paths', () => {
  assert.deepEqual(diffPaths(load('valid.json'), load('valid.json')), []);
});

test('diffPaths: one dial turned → exactly that path', () => {
  const child = load('valid.json');
  child.loop.maxIterations = 6;
  assert.deepEqual(diffPaths(load('valid.json'), child), ['loop.maxIterations']);
});

test('diffPaths: one op param changed inside a slot → one path', () => {
  const child = load('valid.json');
  child.hooks['before-attempt'][0].k = 12;
  assert.deepEqual(diffPaths(load('valid.json'), child), ['hooks.before-attempt.0.k']);
});

test('diffPaths: an op added to a slot → one path (the new index)', () => {
  const child = load('valid.json');
  child.hooks['after-red'].push({ op: 'recall', k: 3 });
  assert.deepEqual(diffPaths(load('valid.json'), child), ['hooks.after-red.1']);
});

test('diffPaths: two knobs → two paths (illegal mutant, caught)', () => {
  const child = load('valid.json');
  child.loop.shape = 'plan';
  child.memory.compressLevel = 'drop';
  assert.equal(diffPaths(load('valid.json'), child).length, 2);
});

// ---- remember kinds bound from litectx WRITE_KINDS (adaptlearn F5 drift guard) ----
// The F5 lesson kept live: every kind the validator passes for `remember` must
// be accepted by litectx remember() at RUNTIME, and `doc` must stay gated out
// on our side while `code` stays rejected on theirs. If either vocabulary moves
// alone, one of these fails — the drift red-flags here instead of post-green
// in on-green.

test('every validator-legal remember kind is accepted by litectx remember() (F5 harmony)', async () => {
  const { WRITE_KINDS, LiteCtx } = await import('litectx');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const legal = WRITE_KINDS.filter((k) => k !== 'doc');
  assert.ok(legal.length >= 2, 'v1 must keep at least fact|episode');
  const lc = new LiteCtx({ root: mkdtempSync(join(tmpdir(), 'f5-')) });
  for (const kind of legal) {
    const cfg = load('valid.json');
    cfg.hooks['on-green'] = [{ op: 'remember', kind }];
    assert.deepEqual(validateConfig(cfg).reds, [], `validator must accept kind "${kind}"`);
    await lc.remember(`f5-${kind}`, 'harmony probe', { kind }); // must not throw
  }
  await assert.rejects(lc.remember('f5-code', 'x', { kind: 'code' }), /kind must be/,
    'litectx must still reject code at write time');
});

test('doc stays gated out of v1 remember even though litectx accepts it', () => {
  const cfg = load('valid.json');
  cfg.hooks['on-green'] = [{ op: 'remember', kind: 'doc' }];
  const r = validateConfig(cfg);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'verb-params');
});
