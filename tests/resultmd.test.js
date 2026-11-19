// MD1 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-18 (c)" and "Ruling 2026-11-18 (later): one markdown report per run"): `renderRunMd` / `deliveredReporter`, the ONE markdown report of a green run.
// Cases ported from fwdloop v0.35.1 test/m15-send-md.test.js (names as words, quotes byte-exact), re-pointed at bareloop's step-file shapes (FACTS / SHEET / TEXT), plus the walk's REAL step file and signed spec (tests/fixtures/resultmd/walk-md.*).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRunMd, stepClaimWords, deliveredReporter, plainDate } from '../src/resultmd.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'resultmd');
const readJson = (f) => JSON.parse(readFileSync(join(FX, f), 'utf8'));
const NOW = new Date(2026, 10, 18);
const HEAD = '# job — run-3\nPassed · 18 Nov 2026';
/** every character a check mark or JSON could use, outside the worker's own words and the page quotes */
const NO_MARKS = (s) => assert.ok(!/[{}[\]✓✗]/.test(s), `no JSON braces or check marks in: ${s}`);
const buf = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o));
const factStage = { kind: 'rubric-step', params: { step: 1, parts: [{ class: 'fact' }] } };
const textStage = { kind: 'rubric-step', params: { step: 1, parts: [{ class: 'countable', check: 'maxWords', value: 50 }] } };
const run = (closeDecl, jobLines, steps, job = 'job', runNo = 3) => renderRunMd({ job, runNo, now: NOW, closeDecl, jobLines, steps: steps.map(([n, orig, delivered]) => ({ n, orig: buf(orig), delivered: buf(delivered ?? orig) })) });

/** the walk's delivered step file (code's report lines at the end of its text) and the worker's own file (the text before them) */
function walk() {
  const spec = readJson('walk-md.spec.json');
  const delivered = readJson('walk-md.step.json');
  const orig = { ...delivered, text: delivered.text.split('\n\nCount of rows')[0] };
  return { spec, delivered, orig };
}

test('the walk run: the real step file renders EXACTLY to the layout hamr approved (rows label right, Count 18, Total 13,206.91, the AI answer under the not-checked heading)', () => {
  const { spec, delivered, orig } = walk();
  const got = run(spec.closeDecl, spec.jobLines, [[1, orig, delivered]], 'walk-md', 1);
  const rows = delivered.claims.l1a2.rows.join(', ');
  assert.equal(got, [
    '# walk-md — run-1',
    'Passed · 18 Nov 2026',
    '',
    '## 1. List the expenses over 500, how many there are and what they add up to',
    'Rule: Amount over 500',
    '',
    '### Checked by code',
    `- Rows where Amount > 500: ${rows}`,
    '- Count: 18',
    '- Total: 13,206.91',
    '',
    '### The AI\'s answer (not checked — you judge it at Accept)',
    orig.text,
    '',
  ].join('\n'));
  assert.ok(orig.text.startsWith('Eleven expenses'), 'the worker\'s own (wrong) sentence is under the not-checked heading, never the answer');
  assert.ok(!/Count of rows|Total of rows|computed by code/.test(got), 'code\'s report lines are the bullets, never printed twice');
  assert.ok(!/l1a\d|l1r\d/.test(got), 'no rule id');
});

test('Count is always listed before Total, whatever order code\'s report lines (the signed checks) come in', () => {
  const { spec, delivered, orig } = walk();
  const [count, total] = delivered.text.slice(orig.text.length + 2).split('\n');
  assert.ok(count.startsWith('Count of rows') && total.startsWith('Total of rows'));
  const swapped = { ...delivered, text: `${orig.text}\n\n${total}\n${count}` };
  const got = run(spec.closeDecl, spec.jobLines, [[1, orig, swapped]], 'walk-md', 1);
  assert.ok(got.indexOf('- Count: 18') > 0 && got.indexOf('- Count: 18') < got.indexOf('- Total: 13,206.91'), got);
});

test('LABEL BUG: a claim shared by a countIf, a sumIf and a rows check is named by the rows check, whatever order the checks are in', () => {
  const { spec } = walk();
  assert.equal(spec.closeDecl.stages[1].params.parts[0].checks[0].op, 'countIf', 'the fixture has the count check FIRST (the walk\'s real order)');
  assert.deepEqual(stepClaimWords(spec.closeDecl, 1), { l1a2: 'rows where Amount > 500' });
  assert.deepEqual(stepClaimWords(readJson('expenses.closeDecl.json'), 1), { l1r1: 'rows where Amount > 500' });
  assert.deepEqual(stepClaimWords(readJson('expenses.closeDecl.json'), 2), {});
  assert.deepEqual(stepClaimWords(null, 1), {});
});

test('a claim only a sumIf / countIf check carries is NOT written: code computes that number and never reads the worker\'s', () => {
  const closeDecl = { stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'sheet', checks: [
    { id: 'a', rule: 'cells', table: 't', op: 'rows', claim: 'a', where: [{ column: 'Amount', cmp: 'gt', value: 500 }] },
    { id: 'c', rule: 'cells', table: 't', op: 'sumIf', column: 'Amount', claim: 'c', where: [{ column: 'Amount', cmp: 'gt', value: 9 }] },
  ] }] } }] };
  assert.deepEqual(stepClaimWords(closeDecl, 1), { a: 'rows where Amount > 500', c: null });
  const got = run(closeDecl, [{ n: 1, text: 'L' }], [[1, { text: 'T', claims: { a: { rows: [2, 3] }, c: { value: 99999.99 } } }]]);
  assert.ok(got.includes('- Rows where Amount > 500: 2, 3') && !got.includes('99999'), got);
});

test('a claim box no check carries (a stray l1a1) is left out (ruling B stands)', () => {
  const { spec, orig, delivered } = walk();
  const stray = { ...orig, claims: { ...orig.claims, l1a1: { value: 99999.99 }, odd_rows: { rows: [1, 2] } } };
  const got = run(spec.closeDecl, spec.jobLines, [[1, stray, { ...delivered, claims: stray.claims }]], 'walk-md', 1);
  assert.ok(!/99999|Odd|odd/.test(got), got);
});

test('SHEET line, maps: a days / bands map writes one bullet per row', () => {
  const obj = readJson('aging.step.json');
  const closeDecl = readJson('aging.closeDecl.json');
  const got = run(closeDecl, [{ n: 1, text: 'Age the invoices' }], [[1, obj]]);
  const bullets = got.split('\n').filter((l) => l.startsWith('- '));
  assert.ok(!bullets.some((l) => /l1r\d/.test(l)), 'no rule id on any bullet');
  assert.equal(bullets.length, 8 + 1 + 8, '8 days rows, one value, 8 band rows');
  assert.match(bullets[0], /^- Days since Due.*, row 2: 269$/);
  assert.match(bullets[16], /, row 9: 31-60$/);
  NO_MARKS(got.replace(obj.text, ''));
});

test('FACTS line: `#### Result k` blocks, value bullets in order, then the quote as a last line, byte for byte; no AI-answer section when the file holds no text', () => {
  const flights = readJson('flights.step.json');
  const got = run({ stages: [factStage] }, [{ n: 1, text: 'Find the flights', rules: ['under 700', 'nonstop'] }], [[1, flights]]);
  assert.ok(got.startsWith(`${HEAD}\n\n## 1. Find the flights\nRule: under 700\nRule: nonstop\n\n### Checked by code\n#### Result 1\n- Price: 144\n- Departure time: 12:12 PM\n\nfrom the page: "`), got);
  for (const r of flights.results) {
    assert.ok(got.includes(`from the page: "${r.quote}"`), 'quote byte-exact');
    for (const v of Object.values(r.values)) assert.ok(got.includes(`- `) && got.includes(`: ${v}\n`), `value ${v} kept`);
  }
  assert.deepEqual(got.match(/^#### Result \d+$/gm), flights.results.map((_, i) => `#### Result ${i + 1}`));
  assert.ok(!/The AI|The answer/.test(got));
  assert.ok(!/^\{|^\[|✓|✗/m.test(got));
});

test('FACTS names as words: a label with a space, camelCase, nested value/rows dropped, ID stays one word; two lines with the same words keep the a.b form', () => {
  const got = run({ stages: [factStage] }, [{ n: 1, text: 'L' }], [[1, { results: [{ quote: 'q', values: { 'departure time': '12:12 PM', expenseTotal: { value: 12719.59 }, ID: 'x', user_name: 'a', 'first-seen': 'b', expenseRows: { rows: [3, 6, 9] } } }] }]]);
  assert.ok(got.includes('#### Result 1\n- Departure time: 12:12 PM\n- Expense total: 12719.59\n- Id: x\n- User name: a\n- First seen: b\n- Expense rows: 3, 6, 9\n\nfrom the page: "q"'), got);
  const dup = run({ stages: [factStage] }, [{ n: 1, text: 'L' }], [[1, { results: [{ quote: 'q', values: { a: { value: 1 }, A: 2 } }] }]]);
  assert.ok(dup.includes('- a.value: 1\n- A: 2'), dup);
});

const NOT_CHECKED = "### The AI's answer (not checked — you judge it at Accept)";
const factsWithText = { n: 1, results: [{ quote: 'q', values: { price: 5 } }], text: 'My summary.' };
const factsStage = (...extra) => ({ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'fact' }, ...extra] } });

// rule copied from fwdloop v0.36.0 src/whole-job.js:54 `proseCheckedOf`: `### The answer` only when code checked the line's own text
test('FACTS line with text and a check on that text (words in the text): the text is under `The answer`, after the checked results', () => {
  const got = run({ stages: [factsStage({ class: 'countable', check: 'maxWords', value: 50 })] }, [{ n: 1, text: 'L' }], [[1, factsWithText]]);
  assert.ok(got.endsWith('from the page: "q"\n\n### The answer\nMy summary.\n'), got);
});

test('FACTS line with text whose only text check is the default note (non-empty), a quote or nothing: the not-checked heading (fwd v0.36.0: a non-empty check alone is no prose check)', () => {
  for (const extra of [[], [{ class: 'countable', check: 'nonEmpty', text: 'line 1 writes a note — the note must be there' }], [{ class: 'countable', check: 'cited', source: 'page' }]]) {
    const got = run({ stages: [factsStage(...extra)] }, [{ n: 1, text: 'L' }], [[1, factsWithText]]);
    assert.ok(got.endsWith(`${NOT_CHECKED}\nMy summary.\n`) && !got.includes('### The answer'), got);
  }
});

test('FACTS line with a words check AND a Not checked `~` rule on the line (signed list): the not-checked heading; a built rule row keeps `The answer`', () => {
  const stages = [factsStage({ class: 'countable', check: 'maxWords', value: 50 })];
  const notChecked = run({ stages, list: [{ line: 1, key: 'L1.r1', kind: 'rule', rule: 1, state: 'not-checked', reason: 'no check was picked' }] }, [{ n: 1, text: 'L' }], [[1, factsWithText]]);
  assert.ok(notChecked.endsWith(`${NOT_CHECKED}\nMy summary.\n`), notChecked);
  const built = run({ stages, list: [{ line: 1, key: 'L1.r1', kind: 'rule', rule: 1, state: 'built' }] }, [{ n: 1, text: 'L' }], [[1, factsWithText]]);
  assert.ok(built.endsWith('### The answer\nMy summary.\n'), built);
});

test('TEXT line: only the answer, under the not-checked heading (no "Checked by code" with nothing in it); cites are not written; the text is kept exactly', () => {
  const text = '- one\n- two\n\n  "quoted" {braces} ok';
  const got = run({ stages: [textStage] }, [{ n: 1, text: 'Write a note', rules: ['two bullets'] }], [[1, { text, cites: [{ quote: 'q', line: 3 }] }]]);
  assert.equal(got, `${HEAD}\n\n## 1. Write a note\nRule: two bullets\n\n### The AI's answer (not checked — you judge it at Accept)\n${text}\n`);
  assert.ok(!/cites|Checked by code/.test(got));
});

test('a text line whose prose IS checked (a list-built close with no prose Not-checked row for it) gets `The answer`; one with the prose row gets the not-checked heading', () => {
  const guard = { line: 0, key: 'J.$guard.x', kind: 'guard', state: 'built' };
  const checked = run({ stages: [textStage], list: [guard] }, [{ n: 1, text: 'L' }], [[1, { text: 'T' }]]);
  assert.ok(checked.endsWith('### The answer\nT\n'), checked);
  const prose = { line: 1, key: 'L1.$prose', kind: 'prose', state: 'not-checked', reason: 'what the text says — you judge it at Accept' };
  const unchecked = run({ stages: [textStage], list: [guard, prose] }, [{ n: 1, text: 'L' }], [[1, { text: 'T' }]]);
  assert.ok(unchecked.endsWith('### The AI\'s answer (not checked — you judge it at Accept)\nT\n'), unchecked);
});

test('a two-line run: ONE report, one H2 per line in line order, each with its own rules and sections', () => {
  const closeDecl = { stages: [textStage, { kind: 'rubric-step', params: { step: 2, parts: [{ class: 'fact' }] } }] };
  const got = run(closeDecl, [{ n: 1, text: 'First line' }, { n: 2, text: 'Second line', rule: 'cheap' }], [[2, { results: [{ quote: 'q', values: { price: 1 } }] }], [1, { text: 'hello' }]]);
  assert.equal(got.match(/^# /gm).length, 1);
  assert.deepEqual(got.match(/^## .*$/gm), ['## 1. First line', '## 2. Second line']);
  assert.ok(got.indexOf('## 1.') < got.indexOf('hello') && got.indexOf('hello') < got.indexOf('## 2.'));
  assert.ok(got.includes('## 2. Second line\nRule: cheap\n\n### Checked by code\n#### Result 1\n- Price: 1\n'), got);
});

test('the title: `<job> — run-N` then `Passed · <date>`; a run number that cannot be known leaves the job name alone; a line with no signed text reads `Line n`', () => {
  assert.equal(plainDate(new Date(2026, 0, 5)), '5 Jan 2026');
  assert.equal(plainDate(new Date(2026, 8, 30)), '30 Sep 2026');
  assert.ok(run({ stages: [textStage] }, [{ n: 1, text: 'L' }], [[1, { text: 'T' }]]).startsWith('# job — run-3\nPassed · 18 Nov 2026\n'));
  assert.ok(run({ stages: [textStage] }, [], [[1, { text: 'T' }]], 'job', null).startsWith('# job\nPassed · 18 Nov 2026\n\n## 1. Line 1\n'));
});

test('nothing writable is null: no step, non-JSON bytes, an object with neither text nor results', () => {
  assert.equal(run({ stages: [textStage] }, [], []), null);
  for (const v of ['not json', '[]', '{}', '{"cites":[]}', '{"claims":{"a":{"value":1}}}', '{"results":[]}']) assert.equal(run({ stages: [textStage] }, [], [[1, v]]), null, v);
});

test('no check marks and no JSON braces anywhere in the structure of the walk report', () => {
  const { spec, orig, delivered } = walk();
  const got = run(spec.closeDecl, spec.jobLines, [[1, orig, delivered]], 'walk-md', 1);
  NO_MARKS(got.replace(orig.text, ''));
});

test('deliveredReporter (the copyOut hook): only a step file of a line the close has a rubric-step for is written; a non-step path and a job with no rubric-step write nothing', () => {
  const { spec, orig, delivered } = walk();
  const files = [{ rel: 'steps/1.json', orig: buf(orig), delivered: buf(delivered) }];
  const hook = deliveredReporter({ closeDecl: spec.closeDecl, jobLines: spec.jobLines, job: 'walk-md', runNo: 1, now: NOW });
  assert.equal(hook(files), run(spec.closeDecl, spec.jobLines, [[1, orig, delivered]], 'walk-md', 1));
  assert.equal(hook([{ ...files[0], rel: 'steps/2.json' }]), null, 'no rubric-step for line 2');
  assert.equal(hook([{ ...files[0], rel: 'result.md' }]), null);
  assert.equal(deliveredReporter({ closeDecl: { stages: [] }, jobLines: [], job: 'j', runNo: 1 })(files), null);
});
