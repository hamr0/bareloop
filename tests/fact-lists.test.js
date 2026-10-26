// IDEA A CORE item 7 (docs/product/ITEM33-BUILD.md "Addendum 2026-10-18 — Idea A core: build spec", section 6, section 8 tests 5 and 8): CURRENCY AND
// UNIT LISTS on a money fact. A money fact names at least one of unit / currency (both allowed), each one value or a list; a string reads
// exactly as a one-element list and an old spec is never rewritten. The REAL bareguard (0.24, ruling #65) is the signer - no stub anywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRubric } from 'bareguard';
import { rubricStepShapeReds, checkRubricParts, buildStepSpec } from '../src/rubricstep.js';
import { factDecides, factSentence, factBrief, asList, moneyForms, MAX_CURRENCIES, MAX_UNITS } from '../src/facts.js';
import { checkFactWords } from '../src/factwords.js';
import { jobSpecHash } from '../src/job.js';
import { REQUIRED_FACTS_BRIEF } from '../src/authorflow.js';
import { loadFixture } from './idea-a-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const part = (/** @type {any[]} */ facts) => ({ text: 'list 3 stays', class: 'fact', source: 'Page', facts, count: { min: 3, max: 3 } });
const money = (/** @type {any} */ over) => ({ name: 'price', shape: 'money', anchor: 'From', ...over });
const reds = (/** @type {any[]} */ facts) => rubricStepShapeReds({ step: 1, parts: [part(facts)] }, 'x').map((r) => `${r.path}: ${r.detail}`);
/** the real bareguard signs the step (throws a plain Error when it would refuse) */
const signs = (/** @type {any[]} */ facts) => createRubric(buildStepSpec({ step: 1, parts: [part(facts)] }, { Page: '0'.repeat(64) }));

test('an OLD single-value spec still loads, keeps its hash and builds: the real signed run smv73148pw343 carries "unit": "US dollars" as a string, untouched', () => {
  const file = join(HERE, 'fixtures', 'idea-a', 'smv73148pw343.resolved-spec.json');
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), '596a50814f660a685d9a8d6144b5b290139e61ca5669181a561b47f2dd88251b', 'a fixture is never edited');
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(jobSpecHash(spec), '03b5975c034669c78ffb250990a834fb5438321b860bc37392584e86793c42a7', 'the hash this spec had before lists existed');
  const stages = spec.closeDecl.stages.filter((/** @type {any} */ s) => s.kind === 'rubric-step');
  const facts = stages.flatMap((/** @type {any} */ s) => s.params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts));
  const price = facts.find((/** @type {any} */ f) => f.unit === 'US dollars');
  assert.ok(price, 'the fixture holds a scalar unit');
  for (const s of stages) assert.deepEqual(rubricStepShapeReds(s.params, 'x'), []);
  /** @type {string[]} */
  const out = [];
  checkRubricParts(stages, { inputLabels: ['flights'], red: (code) => out.push(code) });
  assert.deepEqual(out, [], 'it builds with the real bareguard');
  assert.equal(factDecides({ facts: [price] })[0].unit, 'US dollars', 'the decide the guard signs carries the string, not a list');
  assert.deepEqual(asList(price.unit), ['US dollars'], 'a string reads exactly as a one-element list');
});

test('a money fact names AT LEAST one of unit and currency; both together are accepted; neither is a plain red', () => {
  assert.deepEqual(reds([money({ unit: 'US dollars' })]), []);
  assert.deepEqual(reds([money({ currency: '$' })]), []);
  assert.deepEqual(reds([money({ unit: 'total', currency: '€' })]), [], 'R1L needs both: "€490 total" is the currency "€" and the unit "total"');
  const none = reds([money({})]);
  assert.equal(none.length, 1);
  assert.match(none[0], /facts\[0\]\.unit: money names at least one of unit/);
  assert.match(reds([{ name: 'n', shape: 'number', unit: 'x' }])[0], /only money has a unit or a currency/);
});

test('lists: up to 3 currencies and 10 units pass shape AND the real bareguard; a string and a one-element list sign the same', () => {
  const units = Array.from({ length: MAX_UNITS }, (_, i) => `unit${i}`);
  assert.deepEqual(reds([money({ unit: units, currency: ['$', '€', '£'] })]), []);
  assert.doesNotThrow(() => signs([money({ unit: units, currency: ['$', '€', '£'] })]));
  assert.doesNotThrow(() => signs([money({ unit: ['total'], currency: ['€'] })]));
  assert.deepEqual(factDecides(part([money({ unit: ['a', 'b'], currency: ['$', '€'] })]))[0], { valueKind: 'money', unit: ['a', 'b'], currency: ['$', '€'], anchor: 'From' });
  assert.deepEqual(factDecides(part([money({ unit: 'a', currency: '$' })]))[0], { valueKind: 'money', unit: 'a', currency: '$', anchor: 'From' });
});

test('limits are bareguard\'s, and ours first: a 4th currency, an 11th unit, a repeated currency, a blank, an over-long unit and a currency CODE are each a plain red - and the guard refuses the same lists', () => {
  assert.equal(MAX_CURRENCIES, 3);
  const cases = [
    [money({ currency: ['$', '€', '£', '$'] }), /at most 3 currencies \(4 given\)/],
    [money({ currency: ['$', '€', '£', 'EUR'] }), /one of \$ \| € \| £, or a list/],
    [money({ unit: Array.from({ length: 11 }, (_, i) => `u${i}`) }), /at most 10 units \(11 given\)/],
    [money({ currency: ['$', '$'] }), /not repeated/],
    [money({ unit: ['a', ' '] }), /non-empty string/],
    [money({ unit: [] }), /non-empty string/],
    [money({ unit: 'x'.repeat(101) }), /at most 100 characters/],
    [money({ currency: 'EUR' }), /one of \$ \| € \| £/],
  ];
  for (const [fact, want] of cases) {
    const got = reds([fact]);
    assert.equal(got.length, 1, JSON.stringify(fact).slice(0, 80));
    assert.match(got[0], want);
  }
  // the guard itself refuses the over-limit lists (our red is the SAME limit, stated plainly before the guard's raw error)
  assert.throws(() => signs([money({ currency: ['$', '€', '£', '$'] })]));
  assert.throws(() => signs([money({ unit: Array.from({ length: 11 }, (_, i) => `u${i}`) })]));
});

test('the drafting red path asks the real bareguard for a signable list; an over-limit one is OUR shape red first, so the guard\'s raw error is never what the person is shown', () => {
  /** @type {string[]} */
  const out = [];
  const stage = (/** @type {any[]} */ facts) => [{ kind: 'rubric-step', name: 's1', params: { step: 1, parts: [part(facts)] }, fromLine: [1] }];
  checkRubricParts(stage([money({ unit: ['total'], currency: ['€'] })]), { inputLabels: ['Page'], red: (code) => out.push(code) });
  assert.deepEqual(out, []);
  const over = [money({ currency: ['$', '€', '£', '$'] })];
  assert.equal(reds(over).length, 1, 'our plain red');
  checkRubricParts(stage(over), { inputLabels: ['Page'], red: (code) => out.push(code) });
  assert.ok(!out.includes('rubric-fact-invalid'), 'the guard is not even asked about a list that already has a shape red');
});

test('words: the plan row and the worker brief name the PRIMARY form (units first), and say "or" for more', () => {
  const f = money({ unit: ['total', 'night'], currency: ['€'], rule: { op: 'lt', value: 400 } });
  assert.deepEqual(moneyForms(f), ['total', 'night', '€']);
  assert.match(factSentence(f, 'Page'), /money in total or night or €, under 400 total, after "From"/);
  assert.match(factBrief(f), /an amount in total or night or €, right after "From", must be under 400 total/);
  const cur = money({ currency: ['€', '$'], rule: { op: 'lt', value: 400 } });
  assert.match(factSentence(cur, 'Page'), /money in € or \$, under €400/);
  assert.match(factSentence(money({ unit: 'US dollars', rule: { op: 'lte', value: 450 } }), 'Page'), /money in US dollars, at most 450 US dollars/, 'a single value reads as it always did');
});

test('words proof: EVERY listed unit must be found as whole words and EVERY listed currency sign must be found as written on the input', () => {
  const lisbon = loadFixture('airbnb-lisbon');
  const run = (/** @type {any} */ f) => checkFactWords({ part: { source: 'Page', facts: [f] }, text: lisbon.page, line: 1 }).map((r) => r.detail);
  assert.deepEqual(run({ name: 'p', shape: 'money', unit: ['total'], currency: ['€'] }), []);
  assert.match(run({ name: 'p', shape: 'money', unit: ['total', 'zorkmids'] })[0], /the unit "zorkmids" is not in the input "Page"/);
  assert.match(run({ name: 'p', shape: 'money', currency: ['€', '£'] })[0], /the currency "£" is not in the input "Page"/);
  assert.match(run({ name: 'p', shape: 'money', unit: 'zorkmids' })[0], /the unit "zorkmids"/, 'a single string is proved exactly as before');
});

test('the drafter is TOLD the new rules in the same change: at least one of unit/currency, both allowed, the list limits, a code is a unit', () => {
  assert.match(REQUIRED_FACTS_BRIEF, /names at least one of "unit".*or "currency".*and may name both/);
  assert.match(REQUIRED_FACTS_BRIEF, /at most 3 currencies and 10 units, none repeated, a unit at most 100 characters/);
  assert.match(REQUIRED_FACTS_BRIEF, /A code like EUR is a unit/);
});

test('bareguard 0.26 refuses a unit list whose entries are equal once marks and spaces are removed; the signing pre-flight (real createRubric) says it in our words, naming the fact and both units', () => {
  /** @type {Array<[any[], string, string]>} */
  const cases = [
    [[money({ unit: ['**pp**', 'pp'] })], '**pp**', 'pp'],
    [[money({ unit: ['US dollars', ' US dollars'] })], 'US dollars', ' US dollars'],
    [[money({ unit: ['a', 'a'] })], 'a', 'a'],
    [[{ name: 'rooms', shape: 'number', anchor: 'Rooms' }, money({ unit: ['x', 'y', 'US  dollars ', 'US dollars'] })], 'US  dollars ', 'US dollars'],
  ];
  for (const [facts, a, b] of cases) {
    assert.throws(() => signs(facts), /duplicates/, 'the guard itself refuses it');
    assert.deepEqual(reds(facts), [], 'no shape red: the pre-flight owns this refusal');
    /** @type {Array<{code: string, detail: string}>} */
    const out = [];
    checkRubricParts([{ kind: 'rubric-step', name: 's3', params: { step: 3, parts: [part(facts)] }, fromLine: [3] }], { inputLabels: ['Page'], red: (code, _p, detail) => out.push({ code, detail }) });
    assert.equal(out.length, 1);
    assert.equal(out[0].code, 'rubric-fact-invalid');
    assert.equal(out[0].detail, `line 3: the fact 'price' lists the same unit twice ('${a}' and '${b}' are the same once marks and spaces are removed). Keep one. Nothing spent.`);
  }
  assert.deepEqual(reds([money({ unit: ['US dollars', 'US dollar'] })]), [], 'different words are still two units');
});
