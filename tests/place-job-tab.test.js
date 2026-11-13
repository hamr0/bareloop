// PLACE RULES, P6 (docs/product/ITEM33-BUILD.md, "Place rules build spec"): the Job tab row of a place-rule fact reads
//   version in the newest "## [" heading (last read 0.55.0)      /      date in the newest "## [" heading (last read 2026-11-04)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFromSpec } from '../src/panel/jobplan.js';
import { factSentence } from '../src/facts.js';

const PLACE = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const spec = {
  job: 'newest-release', goal: 'g', jobLines: [{ n: 1, text: 'Quote the newest release heading', rule: '' }],
  closeDecl: { genre: 'TEXT', lang: 'text', stages: [{ name: 'line-1-newest-release', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'f', class: 'fact', source: 'changelog', facts: [
    { name: 'version', shape: 'phrase', phrase: '0.55.0', place: PLACE },
    { name: 'released', shape: 'phrase', phrase: '2026-11-04', place: { ...PLACE, kind: 'headingDateAfter', prefix: '### v' } },
    { name: 'heading', shape: 'phrase', phrase: '## [' }] }] } }] },
};

test('P6 the Job tab rows of the place-rule facts read as the spec words; a plain phrase fact reads as before', () => {
  const plan = planFromSpec(spec);
  const names = plan.lines[0].checks.map((c) => c.name);
  assert.ok(names.includes('version in the newest "## [" heading (last read 0.55.0)'), names.join('\n'));
  assert.ok(names.includes('date in the newest "### v" heading (last read 2026-11-04)'), names.join('\n'));
  assert.ok(names.includes('fact · heading — phrase, must say "## [", quoted from "changelog"'), names.join('\n'));
});

test('P6 factSentence (the one owner of the row, also the Result tab\'s sentence) words a place fact the same way', () => {
  assert.equal(factSentence({ name: 'version', shape: 'phrase', phrase: '0.55.0', place: PLACE }, 'changelog'), 'version in the newest "## [" heading (last read 0.55.0)');
});
