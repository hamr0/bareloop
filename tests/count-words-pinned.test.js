// fwd am15a (v0.38.0), S4: the list-line count words, pinned on every surface that shows them. No wording changed: this test only holds them.
// One owner of the card / Audit / Job-tab words (`shapeRowsOf`, over `shapeCountWords` and `shapeDefaultWords`, src/shaperows.js); the worker's text is `lineBriefs` (src/rubricstep.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeCountWords, shapeDefaultWords, shapeRowsOf } from '../src/shaperows.js';
import { lineBriefs } from '../src/rubricstep.js';

const fields = [{ name: 'title', spec: { kind: 'text', required: true, minChars: 1 } }];
const workerText = (/** @type {any} */ c) => lineBriefs({ stages: [{ kind: 'rubric-step', params: { step: 2, parts: [{ class: 'shape', text: 't', fields, ...c }] } }] })[0].text;
/** the card / Audit row of a signed count: the line's own `~` rule row, through the one reader of the signed close */
function cardRowText(/** @type {any} */ c) {
  const stages = [{ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'shape', text: 't', fields: [], rules: [1], ...c }] } }];
  const list = [{ key: 'L1.~1', state: 'built' }];
  const rows = shapeRowsOf({ stages, list }, [{ n: 1, text: 'Write the list', rules: ['a count rule'] }]);
  return rows.find((r) => r.key === 'L1.~1')?.text;
}

test('the card and the Audit say: exactly N items, at least N items, at most N items, and "item" for 1', () => {
  assert.equal(cardRowText({ minItems: 4, maxItems: 4 }), 'the answer lists exactly 4 items');
  assert.equal(cardRowText({ minItems: 3 }), 'the answer lists at least 3 items');
  assert.equal(cardRowText({ maxItems: 5 }), 'the answer lists at most 5 items');
  assert.equal(cardRowText({ minItems: 3, maxItems: 5 }), 'the answer lists at least 3 items and at most 5 items');
  assert.equal(cardRowText({ minItems: 1, maxItems: 1 }), 'the answer lists exactly 1 item');
  assert.equal(cardRowText({ minItems: 1 }), 'the answer lists at least 1 item');
  assert.equal(cardRowText({ maxItems: 1 }), 'the answer lists at most 1 item');
  assert.equal(shapeCountWords({ minItems: 2, maxItems: 2 }), 'the answer lists exactly 2 items');
  assert.equal(shapeDefaultWords({ min: 1, max: 1 }), 'the answer lists exactly 1 item');
  assert.equal(shapeDefaultWords({ min: 6 }), 'the answer lists at least 6 items');
});

test('the worker is told the same words: exactly N items, at least N items, at most N items, and "item" for 1', () => {
  assert.match(workerText({ minItems: 4, maxItems: 4 }), /One object per item: exactly 4 items\./);
  assert.match(workerText({ minItems: 3 }), /One object per item: at least 3 items\./);
  assert.match(workerText({ maxItems: 5 }), /One object per item: at most 5 items\./);
  assert.match(workerText({ minItems: 3, maxItems: 5 }), /One object per item: at least 3 items and at most 5 items\./);
  assert.match(workerText({ minItems: 1, maxItems: 1 }), /One object per item: exactly 1 item\./);
  assert.match(workerText({ maxItems: 1 }), /One object per item: at most 1 item\./);
});
