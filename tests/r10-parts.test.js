// R10 step 1: a rubric part accepts the five text checks fwdloop v0.29.0 OFFERS beyond bareloop's own set (nonEmpty, listItems,
// sectionOrder, mustCarry, blockLines), through the SAME mapping to bareguard (buildStepSpec -> createRubric/checkStep), in plain words.
// Real bareguard 0.31 grades; no model is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rubricStepShapeReds, buildStepSpec, gradeStep, partSentence } from '../src/rubricstep.js';

const part = (check, extra = {}) => ({ text: 'a rule', class: 'countable', check, ...extra });
const cases = [
  ['nonEmpty', {}, '', 'is missing or empty', 'the text is not empty'],
  ['listItems', { value: 3 }, '- a\n- b', 'exactly 3 are required', 'the text has exactly 3 list items'],
  ['sectionOrder', { names: ['Intro', 'End'] }, '# End\n# Intro', 'asked order', 'the text has the section(s) Intro, End, in that order'],
  ['mustCarry', { phrases: ['nonstop'] }, 'hello there', 'does not carry: nonstop', 'the text carries nonstop'],
  ['blockLines', { size: 2, phrases: ['x'] }, 'a\nb\n\nc', 'blocks of 2 lines', 'the text is in blocks of 2 lines, each carrying x'],
];

for (const [check, extra, bad, gapWords, sentence] of cases) {
  test(`${check}: a part is legal, builds a bareguard rule, grades red in plain words, and has one sentence`, async () => {
    const p = part(check, extra);
    assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [p] }, 'p'), []);
    const params = { step: 1, parts: [p] };
    const spec = buildStepSpec(params, {});
    assert.ok(spec.checkpoints['1'].checks.some((c) => c.rule === check && c.field === 'text'));
    const g = await gradeStep({ params, bytes: JSON.stringify({ text: bad }), outputBytes: null, inputs: {} }, {});
    assert.equal(g.verdict, 'red');
    assert.match(g.gapLines.join('\n'), new RegExp(gapWords));
    assert.equal(partSentence(p), sentence);
  });
}

test('a pick that is short of its fields is a shape red, not a late crash', () => {
  assert.equal(rubricStepShapeReds({ step: 1, parts: [part('listItems')] }, 'p').length, 1);
  assert.equal(rubricStepShapeReds({ step: 1, parts: [part('mustCarry', { phrases: [] })] }, 'p').length, 1);
  assert.equal(rubricStepShapeReds({ step: 1, parts: [part('blockLines', { size: 2 })] }, 'p').length, 1);
});

test('a good file passes each of the five', async () => {
  const params = { step: 1, parts: [part('nonEmpty'), part('listItems', { value: 2 }), part('mustCarry', { phrases: ['nonstop'] })] };
  const g = await gradeStep({ params, bytes: JSON.stringify({ text: '- a nonstop\n- b' }), outputBytes: null, inputs: {} }, {});
  assert.equal(g.verdict, 'green');
});
