// REVIEW THE CODE, clean build item 7 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the draft readout's FIRST line says which road the job took, read from the road (the class) and the SIGNED source: a repo source
// reads the code and changes none; a Deterministic job changes it; a rubric job on files says neither. No fence inference. $0, real fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReadout, jobKindWords, readoutHeadIndexes } from '../src/authorreadout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (/** @type {string} */ f) => JSON.parse(readFileSync(join(HERE, 'fixtures', f), 'utf8'));
const first = (/** @type {any} */ spec) => buildReadout({ spec, rounds: 1, costUsd: 0.01 }).split('\n')[0];
const REPO = () => load('repo-list/smwhvmfsxd5t8-spec.json');
const RUBRIC = () => load('mv5bk400-resolved-spec.json');

test('a repo-source job\'s readout opens "review (reads the code, changes none)"; the bold header is still the first line', () => {
  const spec = RUBRIC();
  spec.closeDecl.source = 'repo';
  assert.equal(spec.closeDecl.lang, 'text');
  assert.equal(first(spec), `DRAFT READOUT — NOT SIGNED — job ${spec.job} — review (reads the code, changes none)`);
  assert.equal(readoutHeadIndexes(buildReadout({ spec, rounds: 1, costUsd: 0 }))[0], 0);
});

test('a Deterministic repo job opens "change (changes the code)"', () => {
  const spec = REPO();
  assert.equal(spec.verdictType, 'green');
  assert.equal(first(spec), `DRAFT READOUT — NOT SIGNED — job ${spec.job} — change (changes the code)`);
});

test('a rubric job on files (the text close, no source) says neither, whatever its fence holds', () => {
  const spec = RUBRIC();
  assert.equal(first(spec), `DRAFT READOUT — NOT SIGNED — job ${spec.job}`);
  assert.equal(first({ ...spec, writeScope: ['output/', 'docs/'] }), `DRAFT READOUT — NOT SIGNED — job ${spec.job}`, 'a fence beside output/ is not what says "review"');
  assert.equal(jobKindWords({}), '');
});
