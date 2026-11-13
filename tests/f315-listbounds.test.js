// F315 / BG-5: "at most / up to / no more than / at least N bullets" is a directional list-items check (bareguard 0.35 maxListItems / minListItems),
// not the exact listItems. Real bareguard grades; no model is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCheck, keepOrDrop } from '../src/checkpick.js';
import { plainWords, OFFERED } from '../src/checkwords.js';
import { rubricStepShapeReds, buildStepSpec, gradeStep, partSentence, toldPicks } from '../src/rubricstep.js';

test('the wording maps to the right rule and value', () => {
  const rows = [
    ['at most 3 bullets', 'maxListItems', 3],
    ['up to 3 bullets', 'maxListItems', 3],
    ['no more than 3 bullets', 'maxListItems', 3],
    ['maximum 3 bullets', 'maxListItems', 3],
    ['max 3 list items', 'maxListItems', 3],
    ['fewer than 3 bullets', 'maxListItems', 2],
    ['less than 4 bullets', 'maxListItems', 3],
    ['under 4 bullets', 'maxListItems', 3],
    ['below 4 items', 'maxListItems', 3],
    ['under 1 bullet', 'maxListItems', 0],
    ['under 80 words', 'maxWords', 80],
    ['at least 3 bullets', 'minListItems', 3],
    ['minimum 3 bullets', 'minListItems', 3],
    ['no fewer than 3 bullets', 'minListItems', 3],
    ['more than 3 bullets', 'minListItems', 4],
    ['exactly 3 bullets', 'listItems', 3],
    ['3 bullets', 'listItems', 3],
  ];
  for (const [text, rule, value] of rows) assert.deepEqual(countCheck(text), { rule, value }, text);
});

test('a value below the rule floor is refused', () => {
  assert.equal(countCheck('at least 0 bullets'), null);
  assert.equal(countCheck('under 0 bullets'), null);
  assert.equal(countCheck('fewer than 0 bullets'), null);
  assert.deepEqual(countCheck('at most 0 bullets'), { rule: 'maxListItems', value: 0 });
  assert.equal(keepOrDrop('at least 3 bullets', { rule: 'minListItems', value: 0 }).kept, false);
});

test('the two rules are offered, in plain words, with a sentence and a part that is legal', () => {
  assert.ok(OFFERED.includes('maxListItems') && OFFERED.includes('minListItems'));
  assert.equal(plainWords({ rule: 'maxListItems', value: 3 }), 'at most 3 list items');
  assert.equal(plainWords({ rule: 'minListItems', value: 3 }), 'at least 3 list items');
  const mx = { text: 'r', class: 'countable', check: 'maxListItems', value: 3 };
  const mn = { text: 'r', class: 'countable', check: 'minListItems', value: 3 };
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [mx, mn] }, 'p'), []);
  assert.equal(partSentence(mx), 'the text has at most 3 list items');
  assert.equal(partSentence(mn), 'the text has at least 3 list items');
  assert.match(toldPicks([mx])[0] ?? '', /must have at most 3 list items; a list item is its own line starting with "1\." or "- "/);
  assert.match(toldPicks([mn])[0] ?? '', /must have at least 3 list items/);
});

const grade = async (check, value, n) => {
  const p = { text: 'r', class: 'countable', check, value };
  const params = { step: 1, parts: [p] };
  assert.ok(buildStepSpec(params, {}).checkpoints['1'].checks.some((c) => c.rule === check));
  const text = n === 0 ? 'plain prose, no bullets' : Array.from({ length: n }, (_, i) => `- item ${i}`).join('\n');
  return gradeStep({ params, bytes: JSON.stringify({ text }), outputBytes: null, inputs: {} }, {});
};

test('graded by real bareguard: at most 3 passes 0/2/3 and fails 4', async () => {
  for (const n of [0, 2, 3]) assert.equal((await grade('maxListItems', 3, n)).verdict, 'green', `n=${n}`);
  const g = await grade('maxListItems', 3, 4);
  assert.equal(g.verdict, 'red');
  assert.match(g.gapLines.join('\n'), /at most 3/);
});

test('graded by real bareguard: at least 3 fails 2 and passes 3/4', async () => {
  const g = await grade('minListItems', 3, 2);
  assert.equal(g.verdict, 'red');
  assert.match(g.gapLines.join('\n'), /at least 3/);
  for (const n of [3, 4]) assert.equal((await grade('minListItems', 3, n)).verdict, 'green', `n=${n}`);
});

test('exactly 3 is unchanged, and an old signed listItems part still validates and grades as before', async () => {
  assert.equal((await grade('listItems', 3, 3)).verdict, 'green');
  const g = await grade('listItems', 3, 2);
  assert.equal(g.verdict, 'red');
  assert.match(g.gapLines.join('\n'), /exactly 3 are required/);
  assert.equal(partSentence({ text: 'r', class: 'countable', check: 'listItems', value: 3 }), 'the text has exactly 3 list items');
});

test('graded by real bareguard: "under 4 bullets" (max 3) passes 0 and 3 and fails 4', async () => {
  const v = countCheck('under 4 bullets');
  assert.deepEqual(v, { rule: 'maxListItems', value: 3 });
  for (const n of [0, 3]) assert.equal((await grade(v.rule, v.value, n)).verdict, 'green', `n=${n}`);
  assert.equal((await grade(v.rule, v.value, 4)).verdict, 'red');
});
