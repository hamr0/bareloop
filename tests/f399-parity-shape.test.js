// F399 parity pins, Shape grid (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Shape grid").
// Fixture: the trimmed REAL spine of audit-lines-mwndngl5 (a shape + facts job, green). No real run carries a final staged close with per-stage `items`
// (mwnbs3np, the only real red shape run, is a red STEP check), so the structured-close case is that real spine plus PLANTED `items` on its final close and a
// PLANTED saved file in the shape's real form; the expected reds are the planted records' own strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRunResult } from '../src/panel/server.js';
import { checksOf } from '../src/runread.js';
import { realWorld, plantDelivered, spineAt, specAt } from './f399-raw.mjs';

const ITEMS = ['#2:title:required', '#2:status:not-in-list'];
const LONG = 'a very long title that goes on and on well past forty characters in total';
const FILE = JSON.stringify({ results: [
  { quote: 'x', title: 'Evaluate queue libraries', status: 'in progress', values: {} },
  { quote: 'y', title: LONG, status: 'closed', values: {} },
  { quote: 'z', title: 'Third', status: 'blocked', values: {} },
] });
/** the real spine with its saved file planted and (optionally) the final close made red with structured item reds on line 1 */
const mutate = (dir, items) => (/** @type {any[]} */ recs) => plantDelivered(recs, dir, [FILE, FILE]).map((r) => {
  if (r.type === 'outer-close' && items) return { ...r, verdict: 'needs_revision', stages: r.stages.map((/** @type {any} */ s) => (s.name === 'line-1' ? { ...s, verdict: 'needs_revision', items } : s)) };
  return r;
});

test('shape-items-structured-close-parity: a final staged close\'s stage `items` are the item reds the reader and the Result grid show; with none recorded the grid has no red (real mwndngl5 + planted items)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f399sh-'));
  try {
    const recs = mutate(dir, ITEMS)(spineAt('audit-lines-mwndngl5/u-mwndngl5.jsonl'));
    assert.deepEqual(checksOf(recs, null, { spec: specAt('audit-lines-mwndngl5/resolved-spec.json') })?.shapeItems.get('line-1'), ITEMS);
    const red = getRunResult('mwndngl5', realWorld({ fixture: 'audit-lines-mwndngl5', id: 'mwndngl5', job: 'j', mutate: mutate(dir, ITEMS) }).opts).lines[0].shape;
    assert.deepEqual([red.total, red.passed, red.failed], [3, 2, 1]);
    assert.deepEqual(red.errors, ['item 3: title required', 'item 3: status not-in-list']);
    const green = getRunResult('mwndngl5', realWorld({ fixture: 'audit-lines-mwndngl5', id: 'mwndngl5', job: 'j', mutate: mutate(dir, undefined) }).opts).lines[0].shape;
    assert.deepEqual([green.total, green.passed, green.failed, green.errors], [3, 3, 0, []]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('shape-grid-model-parity: the grid has one row per item of the saved file, one column per signed field in signed order, values clipped at 40, a failed item\'s cells marked red with the reason (data only; the drawing is a hamr walk)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f399sh-'));
  try {
    const spec = specAt('audit-lines-mwndngl5/resolved-spec.json');
    const shape = spec.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step').params.parts.find((/** @type {any} */ p) => p.class === 'shape');
    const g = getRunResult('mwndngl5', realWorld({ fixture: 'audit-lines-mwndngl5', id: 'mwndngl5', job: 'j', mutate: mutate(dir, ITEMS) }).opts).lines[0].shape;
    const file = JSON.parse(FILE);
    assert.deepEqual(g.columns.map((/** @type {any} */ c) => c.name), shape.fields.map((/** @type {any} */ f) => f.name));
    assert.equal(g.rows.length, file.results.length);
    assert.equal(g.rows[1].cells[0].text, `${LONG.slice(0, 39)}…`, 'a value past 40 characters is clipped');
    assert.deepEqual(g.rows.map((/** @type {any} */ r) => r.cells.map((/** @type {any} */ c) => c.mark)), [['g', 'g'], ['g', 'g'], ['r', 'r']]);
    assert.deepEqual(g.rows[2].cells.map((/** @type {any} */ c) => c.why), ['required', 'not-in-list']);
    assert.equal(g.rows[0].name, '1 · Evaluate queue libraries');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
