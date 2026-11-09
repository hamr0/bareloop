// R10 fact merge: a look fact that carries a `~` rule belongs INSIDE the line's one fact part. Real refused declaration from the paid R10
// round 3 draft 5 (panel session smw9ln03z3vf6, trimmed copy under tests/fixtures), real bareguard grades. The red for a second fact list
// must carry a LEGAL example of one part holding two facts, and the drafter brief must say where a rule-tied look fact goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { withFactBindings, withDropNotes, settlePersonsWords } from '../src/rubricstep.js';
import { applyPicks, settleRules } from '../src/checkpick.js';
import { REQUIRED_FACTS_BRIEF, renderRejectBlock } from '../src/authorflow.js';
import { draftStopText } from '../src/authorreadout.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const { D5 } = JSON.parse(fx('r10-factmerge-refused.json'));
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words', 'exactly 3 list items', 'at most 80 words'] }];
const rules = [{ line: 1, rule: 1, text: 'exactly 3 bullets' }, { line: 1, rule: 2, text: 'under 80 words' }];
const picks = [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 }, added: 'exactly 3 list items' }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }];
const settled = settleRules(rules, picks, [], jobLines);
const opts = () => ({
  catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }),
  envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'],
});
const chain = (d) => validateDeclaration(withFactBindings(withDropNotes(settlePersonsWords(applyPicks(d, settled), jobLines), undefined, jobLines)), opts());
const withParts = (d, parts) => ({ ...d, stages: d.stages.map((s) => (s.kind === 'rubric-step' ? { ...s, params: { ...s.params, parts } } : s)) });
const twice = () => chain(D5).reds.filter((r) => r.code === 'rubric-fact-twice');

test('R3 d5: two fact parts on line 1 still red rubric-fact-twice (the rule is unchanged)', () => {
  const v = chain(D5);
  assert.equal(v.ok, false);
  assert.ok(twice().length >= 1, v.reds.map((r) => r.code).join(' | '));
});

test('the rubric-fact-twice red carries a drafter-only example, and the example is ONE legal fact part holding two facts', () => {
  const [r] = twice();
  const m = /Example[^{]*(\{.*\})/.exec(r.hint);
  assert.ok(m, `no example in: ${JSON.stringify(r)}`);
  const part = JSON.parse(m[1]);
  assert.equal(part.class, 'fact');
  assert.equal(part.facts.length, 2);
  assert.deepEqual(part.rules, [1]);
  assert.equal(part.count, undefined);
  // the example, as the only part of the line, plus the person's two picks, passes the real draft gate
  const v = chain(withParts(D5, [part]));
  assert.deepEqual(v.reds.map((x) => `${x.code} ${x.path}`), []);
  assert.equal(v.ok, true);
});

test('the person\'s stop text for a fact-twice refusal is plain words (no JSON); the drafter\'s retry note carries the example', () => {
  const reds = twice();
  const person = draftStopText({ stop: 'max-revisions', reds, spend: '$0.01' });
  assert.match(person, /What it said:/);
  assert.match(person, /put them all in one/);
  assert.ok(!/[{}]|Example of ONE part/.test(person), person);
  const note = renderRejectBlock({ kind: 'validation', reds });
  assert.match(note, /put them all in one\. Nothing spent\. Example of ONE part holding two facts: \{"class":"fact"/);
  assert.equal(JSON.parse(/(\{.*\})/.exec(note)[1]).facts.length, 2);
});

test('R3 d5 merged: one fact part with both facts, rules [1], no count min 3, plus the two picks passes the draft gate', () => {
  const merged = { text: 'the release heading and the section words', class: 'fact', source: 'Changelog', rules: [1], facts: [
    { name: 'release heading', shape: 'phrase', phrase: '## [0.54.1] - 2026-11-04' },
    { name: 'section word', shape: 'phrase', phrase: '### Fixed' },
  ] };
  const v = chain(withParts(D5, [merged]));
  assert.deepEqual(v.reds.map((x) => `${x.code} ${x.path}`), []);
  assert.equal(v.ok, true);
  const [st] = v.declaration.stages.filter((s) => s.kind === 'rubric-step');
  assert.deepEqual(st.params.parts.map((p) => p.class + ':' + (p.check ?? '')), ['fact:', 'countable:listItems', 'countable:maxWords']);
});

test('the drafter brief says a rule-tied look fact goes inside the line\'s one fact part, and a picked count is not a count on it', () => {
  assert.match(REQUIRED_FACTS_BRIEF, /A look fact that carries a ~ rule goes INSIDE the line's one fact part/);
  assert.match(REQUIRED_FACTS_BRIEF, /never as a fact part of its own/);
  assert.match(REQUIRED_FACTS_BRIEF, /A count of words, bullets or list items the person picked is a pick, not a "count" on the fact part/);
});
