// R10: a word limit is never a claim count. Live: paid round 6 draft 22 (panel session smwag9marst6v): "at most 120 words" (the AI's proposal, answered "drop it")
// was written as maxClaims 120. Drafts 8 and 17 (smwag4fcpf9z0, smwag7ncubmip) are the other two vanished-limit drafts; their real closes are the fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moveTextUnitClaims, moveUncheckable } from '../src/checkpick.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(readFileSync(join(HERE, 'fixtures', 'r10-vanish-closes.json'), 'utf8'));
const jobLines = [{ n: 1, text: 'Write a short friendly summary of the note', rule: 'x', rules: [] }];
const partsOf = (d) => d.stages.filter((s) => s.kind === 'rubric-step').flatMap((s) => s.params.parts);

test('draft 22 real close: the 120-word claim count is gone, listed under Not checked in its own words, the cited check stays', () => {
  const out = moveUncheckable(moveTextUnitClaims(V.d22.specClose, true), jobLines, true);
  assert.deepEqual(partsOf(out).map((p) => p.check), ['cited']);
  assert.ok(!JSON.stringify(partsOf(out)).includes('maxClaims'));
  assert.ok(out.notes.some((n) => /^line 1: "the summary of the note written for line 1 is at most 120 words" — No rule can check this/.test(n)), JSON.stringify(out.notes));
});

test('drafts 8 and 17 real closes are returned untouched', () => {
  assert.equal(moveTextUnitClaims(V.d8.specClose, true), V.d8.specClose);
  assert.equal(moveTextUnitClaims(V.d17.specClose, true), V.d17.specClose);
});

test('a real claim count (the words say claims) and a non-rubric job are untouched', () => {
  const claims = { stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ text: 'at most 3 claim(s) are listed under Note', class: 'countable', check: 'maxClaims', value: 3, source: 'Note' }] } }] };
  assert.equal(moveTextUnitClaims(claims, true), claims);
  assert.equal(moveTextUnitClaims(V.d22.specClose, false), V.d22.specClose);
});

test('the input is not mutated', () => {
  const before = JSON.stringify(V.d22.specClose);
  moveTextUnitClaims(V.d22.specClose, true);
  assert.equal(JSON.stringify(V.d22.specClose), before);
});

test('the draft path runs it before moveUncheckable', () => {
  const src = readFileSync(join(HERE, '../src/authorflow.js'), 'utf8');
  assert.match(src, /moveUncheckable\(moveTextUnitClaims\(d, lang === RUBRIC_LANG\)/);
});

test('a claim count worded with bullets but backed by quotes (paid round 4 draft 4) is a real claim count: untouched', () => {
  const backed = { stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ text: 'a summary of the changelog, with each of its 3 bullets backed by a quote copied from the Changelog input', class: 'countable', check: 'minClaims', value: 3, source: 'Changelog' }] } }] };
  assert.equal(moveTextUnitClaims(backed, true), backed);
});
