// extractArtifact exit criteria (F2 port requirements #1/#2): fence-robust —
// the first fenced block ANYWHERE is the artifact (prose-wrapped and mid-text
// fences were the F21 instrument caveat); no fence → the trimmed whole text
// (N0 parity, including the unclosed-leading-fence fallback stripFences had);
// nothing extractable → artifact-red material (code null + a named reason),
// never a silent empty write that corrupts the close signal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractArtifact, priceOf } from '../src/text.js';

const CODE = 'export function sum(a, b) { return a + b; }';

test('a clean fenced block extracts verbatim (lang tag stripped)', () => {
  const r = extractArtifact('```js\n' + CODE + '\n```');
  assert.deepEqual(r, { code: CODE, red: null });
});

test('prose-wrapped mid-text fence: ONLY the code survives (the F21 instrument caveat)', () => {
  const r = extractArtifact('Here is the fix you asked for:\n\n```js\n' + CODE + '\n```\n\nHope this helps!');
  assert.deepEqual(r, { code: CODE, red: null });
});

test('multiple fenced blocks: the FIRST is the artifact (deterministic, documented)', () => {
  const r = extractArtifact('```js\n' + CODE + '\n```\nAlternatively:\n```js\nexport const nope = 1;\n```');
  assert.equal(r.code, CODE);
});

test('no fence: the trimmed whole text is the artifact (N0 parity)', () => {
  const r = extractArtifact('  \n' + CODE + '\n\n');
  assert.deepEqual(r, { code: CODE, red: null });
});

test('unclosed leading fence: stripped like stripFences did (N0 parity fallback)', () => {
  const r = extractArtifact('```js\n' + CODE);
  assert.deepEqual(r, { code: CODE, red: null });
});

test('an empty response is artifact-red material, not a silent empty write', () => {
  const r = extractArtifact('   \n  ');
  assert.equal(r.code, null);
  assert.equal(r.red, 'empty response');
});

test('an empty fenced block is artifact-red material', () => {
  const r = extractArtifact('Sure! Here you go:\n```js\n\n```');
  assert.equal(r.code, null);
  assert.equal(r.red, 'empty fenced block');
});

test('null/undefined degrade to artifact-red, never a throw', () => {
  assert.equal(extractArtifact(undefined).red, 'empty response');
  assert.equal(extractArtifact(null).red, 'empty response');
});

// ---- the wrapper-vs-content gate (review 2026-07-13, confirmed by execution):
// a fence is the artifact's WRAPPER only when it opens near the top (the chatty
// preamble shape). A fence buried deep inside an unfenced reply is the
// artifact's OWN content — extracting it truncated a doc-generator module to
// its 2-line example fragment with red:null.

test('an unfenced artifact whose OWN content contains a deep fence pair survives whole — never truncated to the fragment', () => {
  const artifact = [
    '// README generator — renders usage docs for a package',
    "import { name } from './pkg.js';",
    '',
    'export function renderReadme() {',
    '  return `# ${name}',
    '',
    'Usage:',
    '```js',
    "import { thing } from 'pkg';",
    'thing();',
    '```',
    '`;',
    '}',
  ].join('\n');
  const r = extractArtifact(artifact);
  assert.deepEqual(r, { code: artifact, red: null });
});

test('a fence opening past the preamble window is content even when prose precedes it (the documented trade-off)', () => {
  const longPreamble = ['line one', 'line two', 'line three', 'line four', 'line five', 'line six'].join('\n');
  const text = longPreamble + '\n```js\n' + CODE + '\n```';
  const r = extractArtifact(text);
  assert.deepEqual(r, { code: text, red: null }, 'past the window the whole text is the artifact');
});

test('a fence within the preamble window still extracts (chatty wrapper, the F21 case)', () => {
  const text = 'Sure!\nHere is\nthe fix\nyou asked for:\n```js\n' + CODE + '\n```';
  assert.deepEqual(extractArtifact(text), { code: CODE, red: null });
});

// ---- priceOf: the ONE spelling of the F6 honest-null cost read ----
// metrics.costUsd is the honest null when nothing priced; `cost` sums priced
// rounds only, so `?? cost` would launder unpriced into $0 (F6). Four shipped
// call sites collapsed onto this helper — the next priced seam gets no chance
// to re-invent the `?? 0` bug.

test('priceOf: metrics present → its costUsd verbatim, null stays null (the honest unknown)', () => {
  assert.deepEqual(priceOf({ metrics: { costUsd: null, unpricedRounds: 2 }, cost: 0.5 }),
    { costUsd: null, unpricedRounds: 2 });
  assert.deepEqual(priceOf({ metrics: { costUsd: 0.25, unpricedRounds: 0 } }),
    { costUsd: 0.25, unpricedRounds: 0 });
});

test('priceOf: a metrics costUsd of exactly $0 is a real price, never coerced (falsy-zero honesty)', () => {
  assert.deepEqual(priceOf({ metrics: { costUsd: 0, unpricedRounds: 0 }, cost: 0.5 }),
    { costUsd: 0, unpricedRounds: 0 });
});

test('priceOf: no metrics → legacy cost, and no cost at all → the honest null', () => {
  assert.deepEqual(priceOf({ cost: 0.3 }), { costUsd: 0.3, unpricedRounds: 0 });
  assert.deepEqual(priceOf({}), { costUsd: null, unpricedRounds: 0 });
  assert.deepEqual(priceOf(null), { costUsd: null, unpricedRounds: 0 });
});
