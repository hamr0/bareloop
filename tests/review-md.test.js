// REVIEW THE CODE, fix 10 (clean build, item 5's report): a cited list's .md report prints each item's FULL `why` and `quote` as a block per item, not a clipped table cell. The signed part's `cite` (the source table's output) is the only thing read: a report whose
// shape part has none is byte-identical to before. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRunMd } from '../src/resultmd.js';

const spec = (n) => ({ kind: 'text', required: true, minChars: 1 });
const fields = (cite) => ['file', 'quote', 'why'].map((name) => ({ name, spec: spec(), ...(cite ? { row: 'default' } : {}) }));
const closeOf = (cite) => ({ stages: [{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'items', class: 'shape', fields: fields(cite), ...(cite ? { cite: 'repo' } : {}) }] } }] });
const LONG_WHY = 'It sorts the whole list on every call, so the cost grows as n log n for each request, and the sort result is never reused anywhere in the module. '.repeat(3).trim();
const QUOTE = 'return list.filter((x) => x.ok)\n  .map((x) => x.id)\n  .sort();';
const results = [{ file: 'src/slow.js', quote: QUOTE, why: LONG_WHY }, { file: 'src/other.js', quote: 'a | b', why: 'pipes | break table cells' }];
const render = (closeDecl) => renderRunMd({ job: 'review-job', runNo: 3, now: new Date('2026-11-20T10:00:00Z'), closeDecl, jobLines: [{ n: 1, text: 'List the slow code', rules: [] }], steps: [{ n: 1, orig: Buffer.from(JSON.stringify({ results })), delivered: Buffer.from(JSON.stringify({ results })) }] });

test('a review\'s report: a block per item with the FULL why and the whole quote (every line kept, as a block quote); no table, nothing clipped', () => {
  const md = render(closeOf(true));
  assert.ok(md.includes(`**Why:** ${LONG_WHY}`), 'the whole why');
  assert.ok(md.includes(`> return list.filter((x) => x.ok)\n>   .map((x) => x.id)\n>   .sort();`), 'every quote line kept');
  assert.match(md, /#### Item 1 · src\/slow\.js\n\n\*\*Why:\*\*/);
  assert.match(md, /#### Item 2 · src\/other\.js/);
  assert.ok(md.includes('> a | b'), 'a pipe is plain text in a block');
  assert.equal(md.includes('| item |'), false, 'no table');
  assert.match(md, /Checked by code: each quote below is found word for word in the file its item names \(2 items\)\./);
  assert.match(md, /Not checked: whether each one is true \(you judge it at Accept\)/);
  assert.equal(md.includes('…'), false, 'nothing is clipped with an ellipsis');
});

test('a report that is not a review\'s keeps the table, byte for byte as before', () => {
  const md = render(closeOf(false));
  assert.match(md, /\| item \| file \| quote \| why \|/);
  assert.equal(md.includes('#### Item 1'), false);
  assert.equal(md.includes('**Why:**'), false);
});
