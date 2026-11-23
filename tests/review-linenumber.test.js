// REVIEW THE CODE, clean build item 8 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the "1. 1." root cause (POC A8: not a review bug). The ONE owner is `parseJobBlock`: the box's gutter numbers each line by position and the line's text is the person's
// words; nine renderers prefix `n. ` to that text, so a person who also TYPED "1. " on the line read "1. 1. ..." (run mwozqcqh). Fix at the owner: a typed leading `<n>.` that equals the line's own position is the person's line marker and is not kept
// in the text (hamr: 4A). Any other leading number stays as typed. $0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobBlock, renderJobLines, jobBoxText } from '../src/jobblock.js';
import { renderRunMd } from '../src/resultmd.js';

const texts = (/** @type {string} */ box) => {
  const r = parseJobBlock(box);
  if (!r.ok) throw new Error(r.error);
  return r.lines.map((l) => [l.n, l.text]);
};

test('a typed leading "<n>." that equals the line\'s own position is the person\'s marker and is not kept', () => {
  assert.deepEqual(texts('1. Look at src/\n2. Say why'), [[1, 'Look at src/'], [2, 'Say why']]);
  assert.deepEqual(texts('1.   Look at src/'), [[1, 'Look at src/']], 'spaces after the marker are not text');
  assert.deepEqual(texts('1. Look at src/\n~ at least 3 items\n2. Say why'), [[1, 'Look at src/'], [2, 'Say why']], 'a ~ rule does not take a position');
});

test('any other leading number stays as typed: a different position, a decimal, a year, a list in the words', () => {
  assert.deepEqual(texts('2. Look at src/'), [[1, '2. Look at src/']], 'the first line is position 1, "2." is the person\'s words');
  assert.deepEqual(texts('1. First\n1. Again'), [[1, 'First'], [2, '1. Again']]);
  assert.deepEqual(texts('1.5 liters of water\n2024 is the year'), [[1, '1.5 liters of water'], [2, '2024 is the year']]);
  assert.deepEqual(texts('1.Look at src/'), [[1, '1.Look at src/']], 'no space after the dot: not a marker');
  assert.deepEqual(texts('1.'), [[1, '1.']], 'a marker alone leaves no words: kept');
});

test('every renderer now shows ONE number: the job lines the drafter reads, the box, and the report heading', () => {
  const r = parseJobBlock('1. Look at src/\n~ be brief');
  assert.ok(r.ok);
  assert.equal(renderJobLines(r.lines), '1. Look at src/\n   rule: be brief');
  assert.equal(jobBoxText(r.lines), 'Look at src/\n~ be brief');
  const md = renderRunMd({ job: 'j', runNo: 1, now: new Date('2026-11-20T10:00:00Z'), closeDecl: { stages: [] }, jobLines: r.lines, steps: [{ n: 1, orig: Buffer.from(JSON.stringify({ text: 'x', cites: {} })), delivered: Buffer.from(JSON.stringify({ text: 'x', cites: {} })) }] });
  assert.equal(md.includes('1. 1.'), false, md);
  assert.match(md, /## 1\. Look at src\//);
});
