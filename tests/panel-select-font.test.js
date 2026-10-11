// hamr's click-through 2026-10-11: the API shape dropdown (and its opened list) is not the page's monospace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

test('select and its options take the page font family explicitly', () => {
  assert.match(PAGE, /\n\s*select,option\{font-family:inherit;\}/);
  assert.match(PAGE, /:root\{[^]*?font:[^;]*monospace;/); // the page font being inherited is monospace
});
