// fwd v0.39.0 am8 item 1e (f8493636), copied 2026-11-27 (ITEM33-BUILD Addendum 2026-11-27): "is this a Drop or Add choice" has ONE owner,
// `isRowChoice` in src/pickrecord.js. No behaviour change. The guard fails while any src file other than pickrecord.js spells the pair out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => {
  for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|html)$/.test(p)) out.push(p); }
  return out;
};
/** the same thing compared to 'drop' then 'add' (or 'add' then 'drop') right after each other: `x !== 'drop' && x !== 'add'`, `x === 'drop' || x === 'add'` */
const PAIR = /([\w.?]+)\s*(===|!==)\s*'(drop|add)'\s*(?:\|\||&&)\s*\1\s*\2\s*'(?!\3')(?:drop|add)'/;

test('guard: no src file other than pickrecord.js spells the Drop/Add pair out', () => {
  const hits = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (rel === 'src/pickrecord.js') continue;
    readFileSync(file, 'utf8').split('\n').forEach((l, i) => { if (PAIR.test(l)) hits.push(`${rel}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `ask isRowChoice (src/pickrecord.js) instead: ${hits.join(', ')}`);
});

test('same answer: isRowChoice agrees with the old spelled-out pair on every input', async () => {
  const { isRowChoice, ROW_CHOICES } = await import('../src/pickrecord.js');
  const old = (/** @type {any} */ c) => c === 'drop' || c === 'add';
  for (const v of ['drop', 'add', 'Drop', 'ADD', '', ' drop', null, undefined, 0, 1, {}, [], 'x', 'column']) assert.equal(isRowChoice(v), old(v), String(v));
  assert.deepEqual([...ROW_CHOICES], ['drop', 'add']);
});
