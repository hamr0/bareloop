// PLACE RULES, P2 (docs/product/ITEM33-BUILD.md, "Place rules build spec"): the signed shape. A phrase fact carries `place: {kind, prefix, end, shape, skip}` plus
// `phrase` (the drafting words, an example). The signature covers the rule; the per-run value is never in the signed spec, so specHash and workflowKey do not move
// from run to run and Reuse keeps working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobSpecHash, workflowKey, validateJob } from '../src/job.js';
import { placeFactsOf, bindPlaceValues } from '../src/placerule.js';
import { validateCloseDecl } from '../src/declaredclose.js';

const PLACE = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const spec = (/** @type {any} */ fact) => ({
  schema: 'job-v1', job: 'newest-release', description: 'place-rule fixture.', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 },
  budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/'], goal: 'Quote the newest release heading.', verdictType: 'soft-green', escalation: { mode: 'decision-ready' },
  jobLines: [{ n: 1, text: 'Quote the newest release heading', rule: '' }], inputs: [{ n: 1, label: 'changelog', value: '/x/CHANGELOG.md' }],
  closeDecl: { genre: 'TEXT', lang: 'text', stages: [
    { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
    { name: 'line-1-newest-release', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'f', class: 'fact', source: 'changelog', facts: [fact] }] } },
  ] },
});
const F = (/** @type {any} */ over = {}) => ({ name: 'version', shape: 'phrase', phrase: '0.55.0', place: PLACE, ...over });
const reds = (/** @type {any} */ s) => validateJob(s, { shellCapUsd: 2 }).reds.map((/** @type {any} */ r) => `${r.path}: ${r.detail}`);

test('P2 the signature covers the rule: a different rule is a different hash, the same rule is the same hash', () => {
  assert.equal(jobSpecHash(spec(F())), jobSpecHash(spec(F())));
  assert.notEqual(jobSpecHash(spec(F())), jobSpecHash(spec(F({ place: { ...PLACE, prefix: '## v' } }))));
  assert.notEqual(jobSpecHash(spec(F())), jobSpecHash(spec(F({ place: undefined }))));
  assert.notEqual(jobSpecHash(spec(F())), jobSpecHash(spec(F({ place: { ...PLACE, kind: 'headingDateAfter' } }))));
});

test('P2 a run\'s value never moves the hash or the workflow key: binding works on a copy and leaves the signed spec untouched', () => {
  const signed = spec(F());
  const before = JSON.stringify(signed);
  const [pf] = placeFactsOf(signed);
  assert.equal(pf.key, 'line-1-newest-release/version');
  const bound = bindPlaceValues(signed, { [pf.key]: '0.99.0' });
  assert.equal(placeFactsOf(bound)[0].phrase, '0.99.0');
  assert.equal(JSON.stringify(signed), before, 'the signed spec is not mutated');
  assert.equal(placeFactsOf(signed)[0].phrase, '0.55.0');
  // the signed form is stable: two runs on different values both started from the same signed bytes
  assert.equal(jobSpecHash(signed), jobSpecHash(JSON.parse(before)));
  assert.equal(workflowKey(signed), workflowKey(JSON.parse(before)));
});

test('P2 a legal place fact validates; a bad rule, a place on a non-phrase fact, or an unknown rule field is refused at $0 by name', () => {
  assert.deepEqual(reds(spec(F())), []);
  assert.match(reds(spec(F({ place: { ...PLACE, kind: 'headingFirst' } }))).join('\n'), /facts\[0\]\.place: kind is one of/);
  assert.match(reds(spec(F({ place: { ...PLACE, prefix: 'Release ' } }))).join('\n'), /place: prefix starts with # marks/);
  assert.match(reds(spec(F({ place: { ...PLACE, extra: 1 } }))).join('\n'), /place: "extra" is not a field of a place rule/);
  assert.match(reds(spec(F({ place: { ...PLACE, skip: 'Unreleased' } }))).join('\n'), /place: skip is a list of words/);
  assert.match(reds(spec({ name: 'price', shape: 'number', place: PLACE })).join('\n'), /place: only a phrase fact carries a place rule/);
});

test('P2 the declaration validator accepts the place fact on its own too (the same shape the drafter signs)', () => {
  const s = spec(F());
  const r = validateCloseDecl(s.closeDecl, { at: 'closeDecl', deferListing: true, verdictType: 'soft-green', writeScope: s.writeScope, jobLines: s.jobLines });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
});
