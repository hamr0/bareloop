// run mwsfq0pi (change-repo3): a red declared count stage told the worker only "term 0 /^# fail (\d+)$/ ... # fail 1" - no test name, no error - so it edited the wrong
// file. A red count stage now QUOTES the command's own failing-test lines (the genre-owned table, src/authoring.js `failureLinesOf`) by the close's language. It tells the
// worker only: the verdict, value and baseline are the same with and without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDeclaredStages, declaredStages } from '../src/declaredclose.js';
import { failureLinesOf } from '../src/authoring.js';
import { initPatientRepo } from './helpers.js';

const TAP = `TAP version 13
ok 1 - fine
not ok 3 - the widget test
  ---
  duration_ms: 0.5
  error: 'expected 2 got 3'
  code: 'ERR_ASSERTION'
  ...
# tests 2
# fail 1
`;
const PYTEST = `FAILED tests/test_a.py::test_b - assert 1 == 2
E   assert 1 == 2
# fail 1
`;

function patient(t, out) {
  const dir = mkdtempSync(join(tmpdir(), 'failing-lines-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'suite.mjs'), `import { readFileSync } from 'node:fs';\nconst bad = readFileSync('bad.txt', 'utf8').trim() === '1';\nif (bad) process.stdout.write(${JSON.stringify(out)}); else console.log('# fail 0');\n`);
  writeFileSync(join(dir, 'bad.txt'), '0\n');
  const seed = initPatientRepo(dir);
  writeFileSync(join(dir, 'bad.txt'), '1\n');
  return { dir, seed };
}
const stage = () => ({ name: 'failing-tests-count', kind: 'count-not-worse', params: { cmd: 'node', args: ['suite.mjs'], parser: { terms: [{ lineMatch: '^# fail (\\d+)$', sign: 1, aggregate: 'first', region: 'whole-output', capture: 1 }] }, direction: 'lower-is-better', baseline: 'seed' } });
const run = (p, lang) => runDeclaredStages(declaredStages({ stages: [stage()] }), (s) => s, { cwd: p.dir, seedRef: p.seed, ...(lang ? { lang } : {}) });

test('a red count stage over a node suite quotes the failing test name and its error lines (red before the change)', async (t) => {
  const r = await run(patient(t, TAP), 'js');
  assert.equal(r.verdict, 'needs_revision');
  assert.match(r.gap, /failing tests in the output:/);
  assert.match(r.gap, /not ok 3 - the widget test/);
  assert.match(r.gap, /expected 2 got 3/);
});

test('the verdict, value and baseline are the same with and without the lines', async (t) => {
  const p = patient(t, TAP);
  const on = await run(p, 'js');
  const off = await run(p, null);
  assert.doesNotMatch(off.gap, /widget/);
  for (const k of ['verdict', 'value', 'baseline', 'exitCode', 'stage']) assert.deepEqual(on[k], off[k], k);
});

test('a green stage adds nothing', async (t) => {
  const p = patient(t, TAP);
  writeFileSync(join(p.dir, 'bad.txt'), '0\n');
  const r = await run(p, 'js');
  assert.equal(r.verdict, 'satisfied');
  assert.ok(!r.gap);
});

test('python: FAILED and E lines are passed; an unknown language adds nothing', async (t) => {
  const p = patient(t, PYTEST);
  const py = await run(p, 'python');
  assert.match(py.gap, /FAILED tests\/test_a\.py::test_b/);
  assert.match(py.gap, /E {3}assert 1 == 2/);
  const other = await run(p, 'text');
  assert.doesNotMatch(other.gap, /failing tests in the output/);
});

test('failureLinesOf: at most 12 lines a failure, and no row for an unknown language', () => {
  const long = `not ok 1 - big\n  ---\n${Array.from({ length: 40 }, (_, i) => `  line${i}: x`).join('\n')}\n  ...\n`;
  assert.equal(failureLinesOf('js', long).length, 12);
  assert.deepEqual(failureLinesOf('go', long), []);
  assert.deepEqual(failureLinesOf(undefined, long), []);
});
