// src/exportnames.js is the list bundle.js judges a close script's `from 'bareloop'` imports against, so that bundle.js
// need not import src/index.js (index re-exports bundle.js: a cycle). A list kept by hand can drift from the real root
// surface; these tests hold it equal to `Object.keys` of src/index.js, both ways, with the difference named.
// The documented contract (bareloop.context.md) is tied to the same root list by tests/index.test.js's two-way guard,
// so equality here carries it through to the doc.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_NAMES } from '../src/exportnames.js';
import * as bareloop from '../src/index.js';

/** @param {readonly string[]} listed @param {string[]} real @returns {string} empty when equal, else both differences by name */
export function exportDiff(listed, real) {
  const missing = real.filter((n) => !listed.includes(n));
  const extra = listed.filter((n) => !real.includes(n));
  return [missing.length ? `exported by src/index.js but not in src/exportnames.js: ${missing.join(', ')}` : '', extra.length ? `in src/exportnames.js but not exported by src/index.js: ${extra.join(', ')}` : ''].filter(Boolean).join('; ');
}

test('src/exportnames.js equals the root export names, both directions', () => {
  assert.equal(exportDiff(EXPORT_NAMES, Object.keys(bareloop)), '');
});

test('the list is frozen, has no repeats, and keeps cliMain', () => {
  assert.ok(Object.isFrozen(EXPORT_NAMES));
  assert.equal(new Set(EXPORT_NAMES).size, EXPORT_NAMES.length);
  assert.ok(EXPORT_NAMES.includes('cliMain'));
});

test('exportDiff names an added and a removed root export (fail-first proof for the comparison itself)', () => {
  assert.equal(exportDiff(['a', 'b'], ['a', 'b', 'c']), 'exported by src/index.js but not in src/exportnames.js: c');
  assert.equal(exportDiff(['a', 'b', 'z'], ['a', 'b']), 'in src/exportnames.js but not exported by src/index.js: z');
  assert.equal(exportDiff(['a'], ['a']), '');
});
