// Layer 2: the exit evaluator — the SHELL's own fixed code for the closed
// exit menu (PRD v1.12 §3: "evaluated by the shell with its own fixed code,
// never a command"). Doctrine under test:
//   - exits verify FORM, not truth (progress gates; the close stays the truth)
//   - AND-only: every listed exit must pass (decision 8)
//   - tree-changed reads OUTCOME (real bytes vs a pre-step snapshot), never
//     git status and never gate intent — the F43/F45 blind-instrument class
//   - a failing exit's detail is a MECHANICAL gap (named wall, counts) — the
//     genre that converts (F38); check-passes delegates through a seam the
//     runner wires to runClose (the evaluator itself never spawns)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotScope, evalExits } from '../src/exits.js';

/** a throwaway workdir per test — real files, no mocks */
const makeDir = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-exits-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

// ─── artifact-written ───

test('artifact-written: existing file passes; missing file fails naming the path', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/notes.md'), 'def foo: covered\n');
  const ok = await evalExits([{ type: 'artifact-written', path: 'tests/notes.md' }], { dir });
  assert.equal(ok.pass, true);
  assert.equal(ok.results[0].pass, true);
  const miss = await evalExits([{ type: 'artifact-written', path: 'tests/gone.md' }], { dir });
  assert.equal(miss.pass, false);
  assert.match(miss.results[0].detail, /tests\/gone\.md/);
  assert.match(miss.results[0].detail, /not.*written|does not exist/i);
});

test('artifact-written with a pattern: content must match; a non-matching file fails naming the pattern', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/notes.md'), 'nothing useful here\n');
  const r = await evalExits([{ type: 'artifact-written', path: 'tests/notes.md', pattern: 'def ' }], { dir });
  assert.equal(r.pass, false);
  assert.match(r.results[0].detail, /def /);
  writeFileSync(join(dir, 'tests/notes.md'), 'def foo\ndef bar\n');
  const ok = await evalExits([{ type: 'artifact-written', path: 'tests/notes.md', pattern: 'def ' }], { dir });
  assert.equal(ok.pass, true);
});

test('artifact-written: an EMPTY file is not a written artifact (a zero-byte touch is not progress)', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/notes.md'), '');
  const r = await evalExits([{ type: 'artifact-written', path: 'tests/notes.md' }], { dir });
  assert.equal(r.pass, false);
  assert.match(r.results[0].detail, /empty/i);
});

// ─── tree-changed (outcome, never intent — F43) ───

test('tree-changed: snapshot before + a real byte change after = pass; untouched tree = fail with a zero count', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/a.py'), 'x = 1\n');
  const snap = await snapshotScope(dir, 'tests/**');
  const untouched = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir, snapshot: snap });
  assert.equal(untouched.pass, false, 'the seed tree is green and unchanged — the F17 trap this exit closes');
  assert.match(untouched.results[0].detail, /0 files? changed/);
  writeFileSync(join(dir, 'tests/a.py'), 'x = 2\n');
  const changed = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir, snapshot: snap });
  assert.equal(changed.pass, true);
});

test('tree-changed: a NEW file under the scope counts as change; a change OUTSIDE the scope does not', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/mod.py'), 'y = 1\n');
  const snap = await snapshotScope(dir, 'tests/**');
  writeFileSync(join(dir, 'src/mod.py'), 'y = 2\n'); // outside scope
  const outside = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir, snapshot: snap });
  assert.equal(outside.pass, false, 'an out-of-scope change is not this step\'s progress');
  writeFileSync(join(dir, 'tests/new_test.py'), 'def test_x(): pass\n');
  const added = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir, snapshot: snap });
  assert.equal(added.pass, true);
});

test('tree-changed: an identical re-write (same bytes) is NOT a change — outcome, not intent (the F43 identical-refire trap)', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/a.py'), 'x = 1\n');
  const snap = await snapshotScope(dir, 'tests/**');
  writeFileSync(join(dir, 'tests/a.py'), 'x = 1\n'); // re-fire, same bytes
  const r = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir, snapshot: snap });
  assert.equal(r.pass, false, 'same bytes = no outcome, whatever the write intent was');
});

test('tree-changed: TWO tree-changed exits in one step — an UNCHANGED scope must NOT pass by borrowing the other scope\'s change (merged-snapshot deletion contamination)', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'a'));
  mkdirSync(join(dir, 'b'));
  writeFileSync(join(dir, 'a/keep.txt'), 'a original\n');
  writeFileSync(join(dir, 'b/keep.txt'), 'b original\n');
  // planrun builds ONE merged snapshot across every tree-changed scope of the step
  const snapshot = new Map();
  for (const scope of ['a/**', 'b/**']) for (const [k, v] of await snapshotScope(dir, scope)) snapshot.set(k, v);
  // the worker changes ONLY b; a is byte-identical to the step start
  writeFileSync(join(dir, 'b/keep.txt'), 'b CHANGED\n');
  const { pass, results } = await evalExits(
    [{ type: 'tree-changed', scope: 'a/**' }, { type: 'tree-changed', scope: 'b/**' }],
    { dir, snapshot },
  );
  assert.equal(results[0].pass, false, 'a/** did not change — it must not count b/**\'s files as its own deletions');
  assert.equal(results[1].pass, true, 'b/** genuinely changed');
  assert.equal(pass, false, 'AND-only: one unchanged scope fails the step');
});

test('tree-changed: a DELETED file counts as change; a scope dir that does not exist yet snapshots empty', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/a.py'), 'x = 1\n');
  const snap = await snapshotScope(dir, 'tests/**');
  rmSync(join(dir, 'tests/a.py'));
  const r = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir, snapshot: snap });
  assert.equal(r.pass, true, 'deletion is a real tree change');
  const emptySnap = await snapshotScope(dir, 'newdir/**');
  assert.equal(emptySnap.size, 0, 'missing scope dir = empty snapshot, never a throw');
});

test('tree-changed without a snapshot in ctx fails CLOSED as a fault (a blind instrument must never read "changed" — and never feed a worker gap)', async (t) => {
  const dir = makeDir(t);
  const r = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir });
  assert.equal(r.pass, false);
  assert.equal(r.results[0].fault, 'failed');
  assert.match(r.results[0].detail, /snapshot/i);
});

// ─── json-valid ───

test('json-valid: parseable file passes; broken JSON fails naming the parse error; missing file fails', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/out.json'), '{"cases": 3}');
  const ok = await evalExits([{ type: 'json-valid', path: 'tests/out.json' }], { dir });
  assert.equal(ok.pass, true);
  writeFileSync(join(dir, 'tests/out.json'), '{nope');
  const bad = await evalExits([{ type: 'json-valid', path: 'tests/out.json' }], { dir });
  assert.equal(bad.pass, false);
  assert.match(bad.results[0].detail, /JSON/);
  const miss = await evalExits([{ type: 'json-valid', path: 'tests/absent.json' }], { dir });
  assert.equal(miss.pass, false);
});

// ─── check-passes (the seam — the runner wires runClose; the evaluator never spawns) ───

test('check-passes delegates to ctx.runCheck and carries its gap through verbatim', async (t) => {
  const dir = makeDir(t);
  const calls = [];
  const runCheck = async (name) => { calls.push(name); return { pass: false, gap: '2 failed: FAILED test_a — AssertionError' }; };
  const r = await evalExits([{ type: 'check-passes', name: 'clean-run' }], { dir, runCheck });
  assert.deepEqual(calls, ['clean-run']);
  assert.equal(r.pass, false);
  assert.match(r.results[0].detail, /FAILED test_a/, 'the check\'s gap IS the mechanical wall the worker pushes on (F46)');
  const green = await evalExits([{ type: 'check-passes', name: 'clean-run' }], { dir, runCheck: async () => ({ pass: true, gap: '' }) });
  assert.equal(green.pass, true);
});

test('check-passes without a wired runCheck fails CLOSED as a FAULT (broken-close class: an instrument stop, never worker feedback)', async (t) => {
  const dir = makeDir(t);
  const r = await evalExits([{ type: 'check-passes', name: 'clean-run' }], { dir });
  assert.equal(r.pass, false);
  assert.equal(r.results[0].fault, 'failed', 'fault carries the runClose verdict name so the loop escalates instead of retrying');
  assert.match(r.results[0].detail, /runCheck|not wired/i);
});

test('a THROWING runCheck fails closed as a fault with the error in the detail — never an unhandled rejection', async (t) => {
  const dir = makeDir(t);
  const r = await evalExits([{ type: 'check-passes', name: 'clean-run' }], { dir, runCheck: async () => { throw new Error('spawn ENOENT'); } });
  assert.equal(r.pass, false);
  assert.equal(r.results[0].fault, 'failed');
  assert.match(r.results[0].detail, /spawn ENOENT/);
});

test('a runCheck result carrying a forbidden-zone fault rides through — a crashed check stays crashed (F32 routing input), a timeout stays a timeout', async (t) => {
  const dir = makeDir(t);
  const crashed = await evalExits([{ type: 'check-passes', name: 'clean-run' }],
    { dir, runCheck: async () => ({ pass: false, fault: 'crashed', gap: 'check judged 0 of a declared floor of 5' }) });
  assert.equal(crashed.pass, false);
  assert.equal(crashed.results[0].fault, 'crashed', 'the verdict name survives so ralph routes it (worker-crash after writes, instrument stop otherwise)');
  assert.match(crashed.results[0].detail, /floor of 5/);
  const timed = await evalExits([{ type: 'check-passes', name: 'clean-run' }],
    { dir, runCheck: async () => ({ pass: false, fault: 'timed-out', gap: 'check exceeded 120000ms' }) });
  assert.equal(timed.results[0].fault, 'timed-out');
});

test('an honest check RED carries NO fault — it is worker feedback, not an instrument stop', async (t) => {
  const dir = makeDir(t);
  const r = await evalExits([{ type: 'check-passes', name: 'clean-run' }],
    { dir, runCheck: async () => ({ pass: false, gap: '2 failed: FAILED test_a' }) });
  assert.equal(r.results[0].fault, undefined);
});

// ─── composition (AND-only, decision 8) ───

test('AND-only: one passing + one failing exit = overall fail, BOTH results reported (the gap names every wall, not the first)', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/t.py'), 'def test(): pass\n');
  const snap = await snapshotScope(dir, 'tests/**');
  writeFileSync(join(dir, 'tests/t.py'), 'def test_2(): pass\n');
  const r = await evalExits([
    { type: 'tree-changed', scope: 'tests/**' },
    { type: 'check-passes', name: 'clean-run' },
  ], { dir, snapshot: snap, runCheck: async () => ({ pass: false, gap: '1 failed' }) });
  assert.equal(r.pass, false);
  assert.equal(r.results.length, 2);
  assert.equal(r.results[0].pass, true);
  assert.equal(r.results[1].pass, false);
});

test('an unknown exit type fails CLOSED (belt — the validator already reds it; the evaluator must not silently pass what it cannot judge)', async (t) => {
  const dir = makeDir(t);
  const r = await evalExits([{ type: 'vibes-good' }], { dir });
  assert.equal(r.pass, false);
  assert.match(r.results[0].detail, /vibes-good/);
});

test('evaluator results carry NO file contents — details are counts and names only (spine-bound text stays bounded)', async (t) => {
  const dir = makeDir(t);
  mkdirSync(join(dir, 'tests'));
  const big = 'SECRETISH '.repeat(5000);
  writeFileSync(join(dir, 'tests/big.md'), big);
  const snap = await snapshotScope(dir, 'tests/**');
  writeFileSync(join(dir, 'tests/big.md'), big + 'x');
  const r = await evalExits([{ type: 'tree-changed', scope: 'tests/**' }], { dir, snapshot: snap });
  assert.equal(r.pass, true);
  for (const res of r.results) {
    assert.ok((res.detail ?? '').length < 500, 'details stay bounded');
    assert.ok(!(res.detail ?? '').includes('SECRETISH'), 'file bodies never ride the result');
  }
});

test('check-passes: a red check gap is carried WHOLE, not clamped to 400 chars — the gapKeep failing-test NAMES survive to the worker (review #2, F28 must not reappear)', async () => {
  // runClose already bounds the gap (~10KB head+keepblock+tail); the evaluator
  // must NOT re-truncate to 400 and delete the `FAILED`/`not ok` names that ARE
  // the worker's aim — the F46 conversion mechanism depends on them reaching it.
  const names = Array.from({ length: 40 }, (_, i) => `FAILED tests/test_mod_${i}.mjs — assertion failed`).join('\n');
  const longGap = `${'preamble line that eats the first four hundred characters. '.repeat(10)}\n${names}`;
  assert.ok(longGap.indexOf('test_mod_39') > 400, 'the last name lives well past char 400 (the test would be vacuous otherwise)');
  const runCheck = async () => ({ pass: false, gap: longGap });
  const { results } = await evalExits([{ type: 'check-passes', name: 'clean-run' }], { dir: '/tmp', runCheck });
  assert.ok(results[0].detail.includes('test_mod_39'), 'the last failing-test name reaches the detail — not sliced off');
});

test('check-passes fault path also carries the whole bounded gap (the forbidden-zone branch, not only needs_revision) (review #2)', async () => {
  const longGap = `crash detail: ${'x'.repeat(1200)}`;
  const runCheck = async () => ({ pass: false, fault: 'crashed', gap: longGap });
  const { results } = await evalExits([{ type: 'check-passes', name: 'c' }], { dir: '/tmp', runCheck });
  assert.equal(results[0].fault, 'crashed', 'the forbidden-zone verdict still rides through by name (F32 routing input)');
  assert.ok(results[0].detail.length > 1000, 'a crashed check carries its full bounded gap, not a 400 clamp');
});
