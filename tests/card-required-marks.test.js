// R9 am5 (fwd 0229765, test/m13-am5.test.js shape): the New job card marks what validateJobCard refuses when empty with a grey `required` inside the caption: Job name, The job, Inputs,
// Destination, Cap $ - and nothing else. The marks were already in the markup; this pins them, and the CSS that keeps them small, grey and inside the pill. No UI change.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'panel', 'index.html'), 'utf8');
const CAPTIONS = [...PAGE.matchAll(/<label for="([a-z-]+)">([^<]*)<span class="req">required<\/span><\/label>/g)].map((m) => [m[1], m[2].trim()]);

test('the five required marks are on exactly Job name, The job, Inputs, Destination and Cap $, each inside its own caption', () => {
  assert.deepEqual(CAPTIONS, [['jf-name', 'Job name'], ['jf-job', 'The job'], ['jf-inputs', 'Inputs'], ['jf-dest', 'Destination'], ['jf-cap-money', 'Cap $']]);
});

test('no other label carries a `required` mark (an optional box never wears one), and the page has exactly those five spans', () => {
  assert.equal((PAGE.match(/class="req"/g) ?? []).length, 5);
  const others = [...PAGE.matchAll(/<label[^>]*>[^<]*<span class="req">/g)].length;
  assert.equal(others, 5);
});

test('the mark is small, grey, and rides inside the caption pill (the card-scoped rule)', () => {
  assert.match(PAGE, /#job-card \.req\{font-size:11px;font-weight:400;color:var\(--req\);margin-left:8px;\}/);
  assert.match(PAGE, /--req:/, 'the grey is a page token, not a literal');
});
