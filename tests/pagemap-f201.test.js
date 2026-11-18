// Piece 0 (ITEM33-BUILD addendum 2026-11-17): the look prompt copied from fwd F201 (goal, ONE-of-two, `why` per fact, `cannot` list) and the `named` guard withdrawn.
// Live run mwi76vh8: "be friendly" was tied to "Select flight".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapPrompt, parseMapAnswer } from '../src/pagemap.js';
import { CheckBlock } from '../src/checkblock.js';

const jobLines = [{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: ['be friendly'] }];
const prompt = () => mapPrompt({ jobLines, label: 'flights', text: 'PAGE-BODY' });

test('F201 prompt: the goal paragraph, the ONE-of-two block, why per fact and the cannot list are present', () => {
  const p = prompt();
  assert.ok(p.includes('Your goal: the ~ rules are the person\'s intent.'));
  assert.ok(p.includes('For each job line and for each ~ rule, do ONE of two things:'));
  assert.ok(p.includes('they must carry the rule\'s MEANING'));
  assert.ok(p.includes('Never tie a rule to page words that do not carry its meaning. A rule with no fact is a correct answer when the page cannot show it.'));
  assert.ok(p.includes('"why":"<one line>"'));
  assert.ok(p.includes('"cannot":[{"from":"line N rule M","why":"<one line>"}]'));
});

test('F201 prompt: bareloop\'s own lines stay (ONCE line, date/number/lang/decimal, reading, page tail)', () => {
  const p = prompt();
  assert.ok(p.includes('A label must appear ONCE on its page line and sit right before the value; when the value stands alone on its line, give no label.'));
  assert.ok(p.includes('"shape":"place|money|time|date|number|phrase"'));
  assert.ok(p.includes('"lang":"<en|de|fr|es|it|pt|nl>","decimal":"<. or ,>"'));
  assert.ok(p.includes('- date: words = the label(s) written right BEFORE the date'));
  assert.ok(p.includes('- number: words = the label(s) written right BEFORE a plain number'));
  assert.ok(p.includes('reading (optional, only on a time or money fact)'));
  assert.match(p, /PAGE TEXT \(the input "flights"\):\nPAGE-BODY$/);
});

test('parseMapAnswer accepts and ignores `why` and `cannot`: the same facts as without them', () => {
  const fact = { name: 'price', from: 'line 1 rule 1', shape: 'money', words: ['From'], unit: ['US dollars'] };
  const plain = parseMapAnswer(JSON.stringify({ facts: [fact] }));
  const withWhy = parseMapAnswer(JSON.stringify({ facts: [{ ...fact, why: 'a price on a result' }], cannot: [{ from: 'line 1 rule 2', why: 'tone' }] }));
  assert.equal(plain.ok, true);
  assert.equal(withWhy.ok, true);
  if (!plain.ok || !withWhy.ok) return;
  const strip = (/** @type {any[]} */ fs) => fs.map(({ why, ...rest }) => rest);
  assert.deepEqual(strip(withWhy.mapping.facts), strip(plain.mapping.facts));
});

test('the `named` carve-out is gone: a phrase whose words the rule\'s text does not hold links to the rule row (no separate ! row)', () => {
  const PAGE = readFileSync(new URL('./fixtures/phrase-link/flights.txt', import.meta.url), 'utf8');
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false });
  b.fromJob(jobLines);
  b.addLook([{ line: 1, name: 'friendly', shape: 'phrase', source: 'flights', words: ['Select flight'], forRule: 1 }]);
  const rule = b.rows.find((r) => r.kind === 'rule');
  assert.equal(rule?.links?.length, 1);
  assert.equal(rule?.links?.[0].name, 'friendly');
  assert.equal(b.rows.some((r) => r.key === 'L1.fact.friendly'), false);
});
