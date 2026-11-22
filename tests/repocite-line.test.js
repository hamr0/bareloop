// "Result tab A" FINDINGS closed rows show `basename:line`. The line is found by CODE with the cite's own matcher (bareguard `quoteIn`: markdown marks and whitespace runs do not matter) in the file the item names;
// when it cannot be found there is no line (never a guess). Real files in a scratch dir.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quoteLineOf, itemQuoteLine } from '../src/repocite.js';
import { track } from './tmp-track.mjs';

const TEXT = ['// head', 'const a = 1;', 'function f() {', '  return  a +', '    1;', '}', 'const a = 1;', ''].join('\n');

test('quoteLineOf: the first line of the match, the earliest occurrence, a multi-line quote, a reflowed one, and a mid-line start', () => {
  assert.equal(quoteLineOf(TEXT, 'const a = 1;'), 2, 'the first of two occurrences');
  assert.equal(quoteLineOf(TEXT, 'function f() {\n  return  a +'), 3, 'a quote over two lines starts on its first');
  assert.equal(quoteLineOf(TEXT, 'return a + 1;'), 4, 'whitespace reflow (the cite ignores it) still finds the start line');
  assert.equal(quoteLineOf(TEXT, 'f() {'), 3, 'a quote starting mid-line is that line');
  assert.equal(quoteLineOf('**bold** text\nnext', 'bold text next'), 1, 'markdown marks do not matter, as in the cite');
});

test('quoteLineOf: a quote not in the text, or an empty one, has no line', () => {
  assert.equal(quoteLineOf(TEXT, 'const b = 2;'), null);
  assert.equal(quoteLineOf(TEXT, '   '), null);
  assert.equal(quoteLineOf('', 'x'), null);
});

test('itemQuoteLine: reads the file the item names (`./` and `:line` forms as the cite reads them); a diff file, a missing file, a link and a missing quote give no line', () => {
  const dir = track(mkdtempSync(join(tmpdir(), 'qline-')));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'output', 'review-diff', 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.js'), TEXT);
  writeFileSync(join(dir, 'output', 'review-diff', 'src', 'a.js.diff'), TEXT);
  symlinkSync(join(dir, 'src', 'a.js'), join(dir, 'src', 'link.js'));
  assert.equal(itemQuoteLine(dir, 'src/a.js', 'return a + 1;'), 4);
  assert.equal(itemQuoteLine(dir, './src/a.js:9', 'return a + 1;'), 4);
  assert.equal(itemQuoteLine(dir, 'output/review-diff/src/a.js.diff', 'return a + 1;'), null, 'a per-file diff is not the file: no number');
  assert.equal(itemQuoteLine(dir, 'src/none.js', 'x'), null);
  assert.equal(itemQuoteLine(dir, 'src/link.js', 'return a + 1;'), null);
  assert.equal(itemQuoteLine(dir, 'src/a.js', 'not there'), null);
  assert.equal(itemQuoteLine(dir, 42, 'x'), null);
});
