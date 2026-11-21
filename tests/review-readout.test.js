// REVIEW THE CODE, clean build item 7 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"), as worded by "Result tab A + Job type everywhere" (2026-11-21): the draft readout's SECOND line is the Job type line (the one owner,
// src/sourcedefaults.js `jobTypeLine`), read from the road (the class) and the SIGNED source: a repo source is `Review code`; a Deterministic job is `Change code`; a rubric job on files has none. No fence inference. $0, real fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReadout, readoutHeadIndexes } from '../src/authorreadout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (/** @type {string} */ f) => JSON.parse(readFileSync(join(HERE, 'fixtures', f), 'utf8'));
const top = (/** @type {any} */ spec) => buildReadout({ spec, rounds: 1, costUsd: 0.01 }).split('\n').slice(0, 2);
const REPO = () => load('repo-list/smwhvmfsxd5t8-spec.json');
const RUBRIC = () => load('mv5bk400-resolved-spec.json');

test('a repo-source job\'s readout carries "Job type: Review code" on its second line; the bold header is still the first line', () => {
  const spec = RUBRIC();
  spec.closeDecl.source = 'repo';
  assert.equal(spec.closeDecl.lang, 'text');
  assert.deepEqual(top(spec), [`DRAFT READOUT — NOT SIGNED — job ${spec.job}`, 'Job type: Review code']);
  assert.equal(readoutHeadIndexes(buildReadout({ spec, rounds: 1, costUsd: 0 }))[0], 0);
});

test('a Deterministic repo job carries "Job type: Change code"', () => {
  const spec = REPO();
  assert.equal(spec.verdictType, 'green');
  assert.deepEqual(top(spec), [`DRAFT READOUT — NOT SIGNED — job ${spec.job}`, 'Job type: Change code']);
});

test('a rubric job on files (the text close, no source) has no Job type line, whatever its fence holds', () => {
  const spec = RUBRIC();
  assert.deepEqual(top(spec), [`DRAFT READOUT — NOT SIGNED — job ${spec.job}`, '']);
  assert.deepEqual(top({ ...spec, writeScope: ['output/', 'docs/'] }), [`DRAFT READOUT — NOT SIGNED — job ${spec.job}`, ''], 'a fence beside output/ is not what says "Review code"');
});
