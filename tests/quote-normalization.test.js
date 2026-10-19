// The panel decides "this evidence entry is about THIS quote" by normalizing the quote the way bareguard did. That is a second spelling of
// bareguard's `normalizeForQuote` (not exported from its package root; src/panel/server.js `normalizeQuote`). Compared here with bareguard's REAL
// function, imported by file path, on the edges where a one-pass regex differs from bareguard's two removals.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeQuote } from '../src/panel/server.js';

const { normalizeForQuote } = await import(pathToFileURL(fileURLToPath(new URL('../node_modules/bareguard/src/primitives/rubric.js', import.meta.url))).href);

test('the panel\'s quote normalization equals bareguard\'s normalizeForQuote on the marker and whitespace edges', () => {
  const cases = [
    'a _**_ b', 'x__y z', '*__* q', 'a b', '  a ** b __ ', '**', '__', ' ** __ ', 'a ****_ b', '___x___', '_*_*_', '**a**', 'a\n\t b',
    'From 144 US dollars. Nonstop flight.', 'a *** b', '__**__',
  ];
  for (const c of cases) assert.equal(normalizeQuote(c), normalizeForQuote(c), JSON.stringify(c));
  assert.equal(normalizeQuote('a _**_ b'), 'a b', 'the case the one-pass regex got wrong ("a __ b")');
});
