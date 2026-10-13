// PART 1b live fix B2 — the drafter is told which shape takes which fields, READ OFF bareguard's rubric vocabulary. Pinned three ways:
// the guide agrees with bareguard's real vocabulary AND with this repo's own validator (a field the guide says a shape never takes is
// refused; one it takes is accepted), and the composer prompt carries the guide verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factShapeFields, factShapeGuide, factShapeReds, FACT_SHAPES } from '../src/facts.js';
import { REQUIRED_FACTS_BRIEF } from '../src/authorflow.js';
import { rubricVocabulary, createRubric } from 'bareguard';

/** a minimal fact of a shape plus one extra field, run through this repo's validator; returns the reds at that field */
function redsFor(shape, field, value) {
  const f = { name: 'thing', shape, ...(shape === 'money' ? { unit: 'US dollars' } : {}), ...(shape === 'phrase' ? { phrase: 'Nonstop' } : {}) };
  Object.assign(f, { [field]: value });
  const reds = [];
  factShapeReds({ source: 'In', facts: [f] }, 'p', (code, path, detail) => reds.push({ code, path, detail }));
  return reds.filter((r) => r.path.endsWith(`.${field}`));
}

test('B2: the guide covers every shape, and what it says matches the vocabulary bareguard publishes', () => {
  const by = factShapeFields();
  assert.deepEqual(Object.keys(by).sort(), [...FACT_SHAPES].sort());
  const kinds = rubricVocabulary.rules.cited.fields.decides.shapes.value.fields.valueKind.enum;
  assert.deepEqual([...kinds].sort(), FACT_SHAPES.filter((s) => s !== 'phrase').sort(), 'our shapes are bareguard\'s value kinds plus phrase');
  assert.deepEqual(by.text, ['anchor', 'until'], 'text takes anchor and until, no rule');
  assert.deepEqual(by.phrase, ['phrase'], 'phrase takes only its words');
  for (const s of ['money', 'number', 'date', 'time']) assert.ok(by[s].includes('rule') && by[s].includes('anchor') && !by[s].includes('until'), s);
  assert.ok(by.money.includes('unit or currency') && !by.number.includes('unit or currency'));
});

test('B2: a field the guide says a shape never takes is refused by the validator, and a field it takes is accepted', () => {
  const by = factShapeFields();
  const sample = { rule: { op: 'lt', value: 5 }, anchor: 'Price', until: ' at', phrase: 'Nonstop' };
  for (const shape of FACT_SHAPES) {
    for (const field of ['rule', 'anchor', 'until']) {
      const f = shape === 'date' || shape === 'time' ? { ...sample, rule: { op: 'lt', value: shape === 'date' ? '2026-01-01' : '10:00' } } : sample;
      const reds = field === 'until' && by[shape].includes('until') ? [] : redsFor(shape, field, f[field]);
      const takes = by[shape].includes(field);
      // `until` alone also needs an anchor, which is its own rule; compare on the shape rule only
      if (field === 'until' && takes) continue;
      assert.equal(reds.length === 0, takes, `${shape}.${field}: guide says ${takes ? 'takes' : 'never'}, validator gave ${JSON.stringify(reds)}`);
    }
  }
});

test('B2: bareguard itself agrees — it signs an until on a text decide and refuses it on money', () => {
  const mk = (d) => () => createRubric({ schema: 1, goal: 'g', inputs: [{ name: 'In', sha256: 'a'.repeat(64) }], checkpoints: { 1: { gating: false, checks: [{ id: 'c', rule: 'cited', claims: 'cites:In', source: 'In', decides: [d] }] } } });
  assert.doesNotThrow(mk({ valueKind: 'text', anchor: 'Leaves', until: ' at' }));
  assert.throws(mk({ valueKind: 'money', unit: 'US dollars', anchor: 'Price', until: ' at' }));
  assert.throws(mk({ valueKind: 'text', op: 'lt', value: 3 }));
});

test('B2: the composer brief carries the generated guide verbatim, and says one stage per job line', () => {
  assert.ok(REQUIRED_FACTS_BRIEF.includes(factShapeGuide()));
  assert.match(factShapeGuide(), /text: takes anchor, until; never rule/);
  assert.match(REQUIRED_FACTS_BRIEF, /ONE stage per job line, holding ALL of that line's facts/);
});
