// fwd v0.39.0 am8 item 1m (af8b316c), copied 2026-11-27 (ITEM33-BUILD Addendum 2026-11-27): the picks-record readers and writeRecordPart's read open the file ONE way (a private reader in
// src/pickrecord.js; not `readJsonFile`, which bundle.js already uses for another function). fwd's inside-the-folder read is not copied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecordFile, readRowChoices, readShapeDropped, readSheetDropped, writeRecordPart } from '../src/pickrecord.js';

const SRC = readFileSync(fileURLToPath(new URL('../src/pickrecord.js', import.meta.url)), 'utf8');

test('guard: pickrecord.js opens and parses a record file in ONE place', () => {
  assert.equal(SRC.split('\n').filter((l) => /JSON\.parse\(readFileSync\(/.test(l)).length, 1);
});

const dir = mkdtempSync(join(tmpdir(), 'bl-jsonreader-'));
const put = (/** @type {string} */ name, /** @type {string} */ text) => { const f = join(dir, name); writeFileSync(f, text); return f; };
const E = { lineWords: 'a b', occurrence: 0 };
const GOOD = {
  picks: [{ ...E, ruleText: 'r' }],
  rowChoices: [{ ...E, tail: 'count.1-', choice: 'add' }],
  shapeDropped: [{ ...E, name: 'n' }],
  sheetDropped: [{ ...E, check: { id: 'x' }, text: 't' }],
};
const READERS = /** @type {[string, (f: string) => any, string][]} */ ([['readRecordFile', readRecordFile, 'picks'], ['readRowChoices', readRowChoices, 'rowChoices'], ['readShapeDropped', readShapeDropped, 'shapeDropped'], ['readSheetDropped', readSheetDropped, 'sheetDropped']]);

// A pin, not a fail-first: the move keeps every answer (these pass on the tree before the change too).
test('same answer: each reader over a missing file, torn JSON, other JSON, no key, a bad key, a good key', () => {
  for (const [name, read, key] of READERS) {
    assert.equal(read(join(dir, 'none.json')), null, `${name} missing`);
    assert.equal(read(put('torn.json', '{"picks": [')), null, `${name} torn`);
    for (const [i, text] of ['[]', 'null', '5', '"s"', '[{"picks":[]}]'].entries()) assert.equal(read(put(`other${i}.json`, text)), null, `${name} ${text}`);
    assert.equal(read(put('nokey.json', '{"other": []}')), null, `${name} no key`);
    assert.equal(read(put('badkey.json', JSON.stringify({ [key]: 'x' }))), null, `${name} key not a list`);
    assert.deepEqual(read(put('empty.json', JSON.stringify({ [key]: [] }))), [], `${name} empty list`);
    assert.deepEqual(read(put('good.json', JSON.stringify(GOOD))), GOOD[/** @type {'picks'} */ (key)], `${name} good`);
    assert.deepEqual(read(put('mixed.json', JSON.stringify({ [key]: [null, 5, ...GOOD[/** @type {'picks'} */ (key)]] }))), GOOD[/** @type {'picks'} */ (key)], `${name} drops a bad entry`);
  }
});

test('same answer: writeRecordPart over a missing file, torn JSON, array JSON and an object (the other parts are kept)', () => {
  const read = (/** @type {string} */ f) => JSON.parse(readFileSync(f, 'utf8'));
  const none = join(dir, 'w-none.json'); writeRecordPart(none, { picks: [1] }); assert.deepEqual(read(none), { picks: [1] });
  const torn = put('w-torn.json', '{"picks": ['); writeRecordPart(torn, { rowChoices: [2] }); assert.deepEqual(read(torn), { rowChoices: [2] });
  const arr = put('w-arr.json', '[1,2]'); writeRecordPart(arr, { picks: [3] }); assert.deepEqual(read(arr), { picks: [3] });
  const obj = put('w-obj.json', JSON.stringify({ picks: [1], sheetDropped: [9] })); writeRecordPart(obj, { rowChoices: [4] }); assert.deepEqual(read(obj), { picks: [1], sheetDropped: [9], rowChoices: [4] });
  writeRecordPart(obj, { picks: [5] }); assert.deepEqual(read(obj), { picks: [5], sheetDropped: [9], rowChoices: [4] });
});
