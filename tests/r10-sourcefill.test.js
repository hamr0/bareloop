// R10 (hamr 2026-11-09): on a RUBRIC job, code fills a missing fact/cited `source` when the job has exactly one input, and merges one line's several fact
// parts into ONE when that is safe. The declarations are the REAL refused tries of paid rounds 3, 4 and 4b (trimmed into tests/fixtures/r10-sourcefill-drafts.json);
// real bareguard validates; no model. A guard test per "not safe" case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { withFactBindings, withDropNotes, settlePersonsWords } from '../src/rubricstep.js';
import * as cp from '../src/checkpick.js';

const FX = JSON.parse(readFileSync(new URL('./fixtures/r10-sourcefill-drafts.json', import.meta.url), 'utf8'));
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words', 'exactly 3 list items', 'at most 80 words'] }];
const rules = [{ line: 1, rule: 1, text: 'exactly 3 bullets' }, { line: 1, rule: 2, text: 'under 80 words' }];
const picks = [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 }, added: 'exactly 3 list items' }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }];
const settled = cp.settleRules(rules, picks, [], jobLines);
const opts = (inputLabels) => ({ catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }), envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels });
// the draft gate's order (authorflow.js `picked`, then the settle/validate chain); the new step is absent on the old engine
const gate = (d, { labels = ['Changelog'], rubric = true } = {}) => {
  const moved = cp.applyPicks(cp.moveUncheckable(d, jobLines, rubric), settled);
  const filled = cp.fillAndMergeFacts ? cp.fillAndMergeFacts(moved, labels, rubric) : moved;
  return validateDeclaration(withFactBindings(withDropNotes(settlePersonsWords(filled, jobLines), undefined, jobLines)), opts(labels));
};
const codes = (v) => v.reds.map((r) => r.code);
const partsOf = (d) => d.stages.filter((s) => s.kind === 'rubric-step').flatMap((s) => s.params.parts);
const fact = (name, extra = {}) => ({ class: 'fact', source: 'Changelog', text: name, facts: [{ name, shape: 'phrase', phrase: '### Fixed' }], ...extra });
const withParts = (parts) => ({ stages: [{ name: 's', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }] });

test('round 3 d5 revise-2: two fact parts on one line merge into one and the draft is valid', () => {
  const v = gate(FX['d5-r3-revise-2'].declaration);
  assert.deepEqual(codes(v), []);
  assert.equal(v.ok, true);
  const facts = partsOf(v.declaration).filter((p) => p.class === 'fact');
  assert.equal(facts.length, 1);
  assert.deepEqual(facts[0].facts.map((f) => f.name), ['section label', 'release heading']);
  assert.deepEqual(facts[0].rules, [1]);
  assert.match(facts[0].text, /section words.*; the release version/s, 'both texts are kept, joined with "; "');
});

test('4b d4 revise-2: three fact parts merge into one (no fact-twice); every fact and every covers number is kept', () => {
  const v = gate(FX['d4-4b-revise-2'].declaration);
  assert.ok(!codes(v).includes('rubric-fact-twice'), codes(v).join());
  const merged = cp.fillAndMergeFacts(cp.applyPicks(FX['d4-4b-revise-2'].declaration, settled), ['Changelog'], true);
  const [f, ...more] = partsOf(merged).filter((p) => p.class === 'fact');
  assert.equal(more.length, 0);
  assert.deepEqual(f.facts.map((x) => x.name), ['release version', 'release date', 'release bullet']);
  assert.deepEqual(f.covers, [3, 4, 5]);
  assert.deepEqual(f.rules, [1]);
  assert.equal(f.count, undefined, 'the count that restated the pick (3) was stripped by the picks first');
});

test('4b d1 last try: the empty source is filled, so invalid-value and rubric-part-source go; the drafter cited part (rubric-fact-text) is NOT touched', () => {
  const old = codes(gate(FX['d1-4b-revise-2'].declaration, { rubric: true })).length;
  const v = gate(FX['d1-4b-revise-2'].declaration);
  assert.ok(old >= 1);
  assert.deepEqual([...new Set(codes(v))], ['rubric-fact-text']);
});

test('round 4 d8 revise-2: the empty sources are filled and the second fact lists merge', () => {
  const v = gate(FX['d8-r4-revise-2'].declaration);
  assert.deepEqual(codes(v), [], 'validation is clean; the picked-label red comes later from the words check');
  assert.equal(partsOf(v.declaration).filter((p) => p.class === 'fact').length, 1);
});

test('guard: two inputs leave a missing source red (nothing filled)', () => {
  const d = withParts([{ class: 'fact', text: 'x', facts: [{ name: 'a', shape: 'phrase', phrase: '### Fixed' }] }]);
  const out = cp.fillAndMergeFacts(d, ['Changelog', 'Notes'], true);
  assert.equal(partsOf(out)[0].source, undefined);
  assert.ok(codes(gate(FX['d1-4b-revise-2'].declaration, { labels: ['Changelog', 'Notes'] })).includes('rubric-part-source'));
});

test('guard: a wrong non-empty source is never rewritten', () => {
  const d = withParts([fact('a', { source: 'Release notes' })]);
  assert.equal(partsOf(cp.fillAndMergeFacts(d, ['Changelog'], true))[0].source, 'Release notes');
});

test('guard: sources that differ do not merge, and fact-twice still fires', () => {
  const d = withParts([fact('a'), fact('b', { source: 'Other' })]);
  const out = cp.fillAndMergeFacts(d, ['Changelog'], true);
  assert.equal(partsOf(out).length, 2);
  assert.equal(out, d, 'nothing changed, the same object');
});

test('guard: a shared fact name does not merge, and fact-twice still fires on the real gate', () => {
  const real = FX['d5-r3-revise-2'].declaration;
  const [a, b] = partsOf(real).filter((p) => p.class === 'fact');
  const clash = withParts([a, { ...b, facts: [{ ...b.facts[0], name: ` ${a.facts[0].name.toUpperCase()} ` }] }]);
  const out = cp.fillAndMergeFacts(clash, ['Changelog'], true);
  assert.equal(partsOf(out).length, 2);
  assert.ok(codes(validateDeclaration(withFactBindings(clash), opts(['Changelog']))).includes('rubric-fact-twice'));
});

test('guard: counts that differ do not merge; equal or absent counts do', () => {
  const two = (a, b) => partsOf(cp.fillAndMergeFacts(withParts([fact('a', a), fact('b', b)]), ['Changelog'], true));
  assert.equal(two({ count: { min: 2 } }, { count: { max: 5 } }).length, 2);
  assert.equal(two({ count: { min: 2 } }, { count: { min: 2 } }).length, 1);
  const [m] = two({ count: { min: 2 } }, {});
  assert.deepEqual(m.count, { min: 2 });
  assert.equal(two({}, {}).length, 1);
});

test('guard: a part with a field a fact part does not carry is never merged (nothing is dropped)', () => {
  const d = withParts([fact('a'), fact('b', { picks: 1 })]);
  assert.equal(partsOf(cp.fillAndMergeFacts(d, ['Changelog'], true)).length, 2);
});

test('guard: a non-rubric job is untouched (the same object, its reds stand)', () => {
  const d = FX['d4-4b-revise-2'].declaration;
  assert.equal(cp.fillAndMergeFacts(d, ['Changelog'], false), d);
  assert.ok(codes(gate(d, { rubric: false })).includes('rubric-fact-twice'));
});

test('wiring: the draft gate runs the fill/merge on every declaration (author, revise and retry share `picked`), rubric-gated, after the picks', () => {
  const src = readFileSync(new URL('../src/authorflow.js', import.meta.url), 'utf8');
  assert.match(src, /fillAndMergeFacts\(applyPicks\(moveUncheckable\(d, jobLines \?\? \[\], lang === RUBRIC_LANG\), settledPicks\), inputLabelsOf\(inputs\), lang === RUBRIC_LANG\)/);
  assert.equal([...src.matchAll(/withFactBindings\(withDropNotes\(settlePersonsWords\(picked\(/g)].length, 1, 'one settle site, so one place for the step');
});
