// The signing stop for a rubric / page job whose close has no check that can fail (hamr ruling 2026-11-10).
// Live: paid round 5 draft 18, panel session smwabidzpqvgt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signingStopText } from '../src/authorreadout.js';
import { CheckBlock } from '../src/checkblock.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OLD = /Nothing in the close fails on the repository as it is/;
const NEW_SENTENCE = 'This job has no check that can fail: no `~` rule, and no check the AI built was kept. A run needs at least one check, a quoted fact or a count. Without one, its pass would prove nothing. For an answer nobody checks, a plain chat AI is the right tool.';
const NEW_TODO = 'add a `~` rule (for example the version, the date, or "under 80 words"), or answer the question with what the output must contain';
const spend = { knownUsd: 0.0107, spendComplete: true };

// The close no longer decides this: the check block does (`block.hasBuiltCheck()`, carried out of drafting as `hasBuiltCheck`), and the doors pass `noCheck` (src/authorreadout.js signingStopText).
test('no-check rubric job, seed-green: the signed words, header unchanged', () => {
  const t = signingStopText({ reds: [], refusal: null, spend, noCheck: true });
  assert.equal(t, `The checks before signing did not all pass, so nothing was signed. Spent so far: $0.01.\nWhat was wrong:\n • ${NEW_SENTENCE}\nWhat to do: ${NEW_TODO}.`);
  assert.doesNotMatch(t, OLD);
});

test('repo (code genre) seed-green keeps the old words', () => {
  const t = signingStopText({ reds: [], refusal: null, spend });
  assert.match(t, OLD);
  assert.match(t, /What to do: check that the close measures the right thing/);
  assert.match(signingStopText({ reds: [], refusal: null, spend, noCheck: false }), OLD);
});

test('rubric job WITH a built check, seed-green, keeps the old words', () => {
  assert.match(signingStopText({ reds: [], refusal: null, spend, noCheck: false }), OLD);
});

test('a block whose only stage has no parts is still no check (the floor never counts)', () => {
  const b = new CheckBlock({ texts: {}, labels: [], asks: false });
  b.fromJob([{ n: 1, text: 'x', rules: [] }]);
  b.reconcile();
  assert.match(signingStopText({ reds: [], refusal: null, spend, noCheck: !b.hasBuiltCheck() }), /no check that can fail/);
});

test('both doors pass the block\'s reading', () => {
  for (const [f, re] of /** @type {[string, RegExp][]} */ ([['../src/authorrun.js', /signingStopText\(\{[^}]*noCheck: authored\.hasBuiltCheck === false/s], ['../src/panel/authorsession.js', /signingStopText\(\{[^}]*noCheck: hasBuiltCheck === false/s]])) {
    assert.match(readFileSync(join(HERE, f), 'utf8'), re, f);
  }
});
