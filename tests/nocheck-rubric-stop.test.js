// The signing stop for a rubric / page job whose close has no check that can fail (hamr ruling 2026-11-10).
// Live: paid round 5 draft 18, panel session smwabidzpqvgt (fixture = that draft's specClose).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signingStopText } from '../src/authorreadout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const { specClose } = JSON.parse(readFileSync(join(HERE, 'fixtures', 'r10-nocheck-rubric-close.json'), 'utf8'));
const OLD = /Nothing in the close fails on the repository as it is/;
const NEW_SENTENCE = 'This job has no check that can fail: no `~` rule, and no check the AI built was kept. A run needs at least one check, a quoted fact or a count. Without one, its pass would prove nothing. For an answer nobody checks, a plain chat AI is the right tool.';
const NEW_TODO = 'add a `~` rule (for example the version, the date, or "under 80 words"), or answer the question with what the output must contain';
const spend = { knownUsd: 0.0107, spendComplete: true };

test('no-check rubric close, seed-green: the signed words, header unchanged', () => {
  const t = signingStopText({ reds: [], refusal: null, spend, closeDecl: specClose });
  assert.equal(t, `The checks before signing did not all pass, so nothing was signed. Spent so far: $0.01.\nWhat was wrong:\n • ${NEW_SENTENCE}\nWhat to do: ${NEW_TODO}.`);
  assert.doesNotMatch(t, OLD);
});

test('repo (code genre) seed-green keeps the old words', () => {
  const code = { genre: 'CODE', lang: 'js', stages: [{ name: 'tests', kind: 'command-exit', params: {} }] };
  const t = signingStopText({ reds: [], refusal: null, spend, closeDecl: code });
  assert.match(t, OLD);
  assert.match(t, /What to do: check that the close measures the right thing/);
  assert.match(signingStopText({ reds: [], refusal: null, spend }), OLD);
});

test('rubric close WITH a real check, seed-green, keeps the old words', () => {
  const withCheck = { ...specClose, stages: [...specClose.stages, { name: 'line-1', kind: 'rubric-step', fromLine: [1],
    params: { step: 1, parts: [{ text: 'the version', class: 'fact', source: 'Changelog', facts: [{ name: 'version', shape: 'phrase', phrase: 'Changed' }] }] } }] };
  assert.match(signingStopText({ reds: [], refusal: null, spend, closeDecl: withCheck }), OLD);
});

test('a rubric-step stage with no parts is still no check', () => {
  const empty = { ...specClose, stages: [...specClose.stages, { name: 'line-1', kind: 'rubric-step', params: { step: 1, parts: [] } }] };
  assert.match(signingStopText({ reds: [], refusal: null, spend, closeDecl: empty }), /no check that can fail/);
});

test('both doors pass the close', () => {
  for (const f of ['../src/authorrun.js', '../src/panel/authorsession.js']) {
    const src = readFileSync(join(HERE, f), 'utf8');
    assert.match(src, /signingStopText\(\{[^}]*closeDecl: spec\.closeDecl/s, f);
  }
});
