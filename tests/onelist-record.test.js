// Addendum 2026-11-14 (c) piece 4: the CLOSE records a result per row. The real `runDeclaredStages` runs the real rubric-step stage (bareguard) and the real `files-changed` guard over a real prepared tree
// (proveRubricInputs: git seed, frozen input, source record); given the signed list it puts `rows` (and `unclaimed`) on each stage's entry. Without the list (an older job) the entries are as they were.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckBlock } from '../src/checkblock.js';
import { runDeclaredStages } from '../src/declaredclose.js';
import { proveRubricInputs } from '../src/source.js';

const PAGE = 'Flights\nBoston Logan International Airport\nFrom $389 US dollars\nBoston Logan International Airport\nFrom $412 US dollars\n';
const QUOTE = 'Boston Logan International Airport\nFrom $389 US dollars';
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

async function world(/** @type {any} */ step) {
  const d = mkdtempSync(join(tmpdir(), 'onelist-record-'));
  made.push(d);
  const file = join(d, 'flights.txt');
  writeFileSync(file, PAGE);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'flights', value: file }], into: join(d, 'seed') });
  if (!r.ok) throw new Error('unreachable');
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false });
  b.fromJob([{ n: 1, text: 'List a flight', rules: ['under $450'] }]);
  b.setGuards(['changed-from-seed']);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.', forRule: 1 }, { line: 1, name: 'airport', shape: 'phrase', source: 'flights', words: ['Boston Logan International Airport'] }], []);
  const c = b.reconcile();
  const stages = [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }, ...c.stages];
  mkdirSync(join(r.prep.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(r.prep.tree, 'output', 'steps', '1.json'), JSON.stringify(step));
  return { tree: r.prep.tree, seed: r.prep.manifest.seed, stages, list: b.signedRows() };
}
const run = (/** @type {any} */ w, /** @type {any} */ withList = true) => runDeclaredStages(w.stages, (s) => s, { cwd: w.tree, seedRef: w.seed, ...(withList ? { list: w.list } : {}) });

test('a green close records every row passed, the guard row from its own stage verdict', async () => {
  const w = await world({ text: 'x', results: [{ quote: QUOTE, values: { price: '389' } }] });
  const res = await run(w);
  assert.equal(res.verdict, 'satisfied', JSON.stringify(res));
  const by = Object.fromEntries(res.stages.flatMap((/** @type {any} */ s) => (s.rows ?? []).map((/** @type {any} */ r) => [r.key, r.result])));
  assert.deepEqual(by, { 'J.$guard.changed-from-seed': 'passed', 'L1.~1': 'passed', 'L1.$floor': 'passed', 'L1.fact.airport': 'passed' });
});

test('a red close records the failed row with its plain reason and the rows that passed; the stage verdict stays the close\'s own', async () => {
  const w = await world({ text: 'x', results: [{ quote: QUOTE, values: { price: '999' } }] });
  const res = await run(w);
  assert.notEqual(res.verdict, 'satisfied');
  const line = res.stages.find((/** @type {any} */ s) => s.name === 'line-1');
  assert.notEqual(line.verdict, 'satisfied');
  const by = Object.fromEntries(line.rows.map((/** @type {any} */ r) => [r.key, r.result]));
  assert.deepEqual(by, { 'L1.~1': 'failed', 'L1.$floor': 'passed', 'L1.fact.airport': 'passed' });
  assert.match(line.rows.find((/** @type {any} */ r) => r.key === 'L1.~1').why, /the value is not what the quote holds/);
  assert.deepEqual(line.unclaimed ?? [], []);
});

test('a gap no row owns (a made-up quote) is recorded as unclaimed words on the stage, never spread over rows', async () => {
  const w = await world({ text: 'x', results: [{ quote: 'made up', values: { price: '389' } }] });
  const line = (await run(w)).stages.find((/** @type {any} */ s) => s.name === 'line-1');
  assert.ok(line.rows.every((/** @type {any} */ r) => r.result === 'passed'));
  assert.equal(line.unclaimed.length, 1);
});

test('a guard that fails records its row failed (no file changed)', async () => {
  const w = await world({ text: 'x', results: [] });
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['-C', w.tree, 'checkout', '-q', '--', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', w.tree, 'clean', '-fdq', 'output'], { stdio: 'ignore' });
  const res = await run(w);
  const g = res.stages.find((/** @type {any} */ s) => s.name === 'changed-from-seed');
  assert.notEqual(g.verdict, 'satisfied');
  assert.deepEqual(g.rows.map((/** @type {any} */ r) => [r.key, r.result]), [['J.$guard.changed-from-seed', 'failed']]);
});

test('with no list (an older job) the stage entries carry no rows, as before', async () => {
  const w = await world({ text: 'x', results: [{ quote: QUOTE, values: { price: '389' } }] });
  const res = await run(w, false);
  assert.equal(res.verdict, 'satisfied');
  assert.ok(res.stages.every((/** @type {any} */ s) => !('rows' in s) && !('unclaimed' in s)));
});
