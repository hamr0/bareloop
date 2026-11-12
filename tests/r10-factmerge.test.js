// R10 fact merge: a look fact that carries a `~` rule belongs INSIDE the line's one fact part. Real refused declaration from the paid R10
// round 3 draft 5 (panel session smw9ln03z3vf6, trimmed copy under tests/fixtures), real bareguard grades. The red for a second fact list
// must carry a LEGAL example of one part holding two facts, and the drafter brief must say where a rule-tied look fact goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { renderRejectBlock } from '../src/authorflow.js';
import { CheckBlock } from '../src/checkblock.js';
import { draftStopText } from '../src/authorreadout.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const { D5 } = JSON.parse(fx('r10-factmerge-refused.json'));
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words', 'exactly 3 list items', 'at most 80 words'] }];
const opts = () => ({
  catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }),
  envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'],
});
// the validator alone (the draft gate stays as a second look on a code-built plan); an AI-written declaration with two fact parts can no longer reach it, but the red and its example are still the validator's own
const chain = (d) => validateDeclaration(d, opts());
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
  // the example, as the only part of the line, passes the real fact-part shape and word rules (the person's picks are the block's)
  const v = chain(withParts(D5, [part]));
  assert.deepEqual(v.reds.filter((x) => /^rubric-fact/.test(x.code)).map((x) => `${x.code} ${x.path}`), []);
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

test('R3 d5 on the block: a look fact that carries a ~ rule and a free fact are ONE fact part of the line (rule 1 carried, no count), and the two picks follow it as their own parts - never a second fact part', () => {
  const TEXT = '## [0.54.1] - 2026-11-04\n### Fixed\n- one\n- two\n- three\n';
  const b = new CheckBlock({ texts: { Changelog: TEXT }, labels: ['Changelog'], asks: false });
  b.fromJob([{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words'] }]);
  b.addLook([{ line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## [0.54.1] - 2026-11-04'], forRule: 1 }, { line: 1, name: 'section word', shape: 'phrase', source: 'Changelog', words: ['### Fixed'] }]);
  b.carry({ picks: [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 } }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 } }] });
  const c = b.reconcile();
  const parts = c.stages.flatMap((st) => st.params.parts);
  assert.equal(parts.filter((p) => p.class === 'fact').length, 1);
  assert.deepEqual(parts.map((p) => p.class + ':' + (p.check ?? '')), ['fact:', 'countable:listItems', 'countable:maxWords']);
  assert.equal(parts[0].count, undefined, 'a picked count is a pick, not a "count" on the fact part');
});
