// Shape jobs (itemShape), clause 8 "Views": the plan card rows (checksOfClose / cardOfClose), the per-row results (rowResultsOf), the report (renderRunMd) and flattenStep's pass-through of a shape answer.
// The signed close is a fixture written here with a `shape` part (src/shaperows.js `buildShapePart`); the gaps are written from bareguard's documented red grammar. A shape line is picked by its signed class, never by the
// key `results` (a facts line uses the same key). $0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksOfClose, cardOfClose, flattenStep } from '../src/rubricstep.js';
import { rowResultsOf } from '../src/rowresults.js';
import { renderRunMd } from '../src/resultmd.js';
import { buildShapePart, shapeRowsOf, shapeFieldSentence, shapeDefaultWords, shapePartOf } from '../src/shaperows.js';

const JOB = [{ n: 2, text: 'Read each resume', rules: ['each blurb is under 60 words', 'matching words is a list of at most 5 words', 'the candidate has a name'] }];
const PART = buildShapePart({
  text: 'the items of line 2',
  itemCount: { n: 2 },
  fields: [
    { name: 'name', spec: { kind: 'text', required: true, minChars: 1 }, rule: 3, by: 'you' },
    { name: 'blurb', spec: { kind: 'text', required: true, maxWords: 59 }, rule: 1, by: 'you' },
    { name: 'matching', spec: { kind: 'list', of: { kind: 'text' }, maxEntries: 5, unique: true }, rule: 2, by: 'you' },
    { name: 'remote', spec: { kind: 'boolean', equals: true }, by: 'agent' },
  ],
});
const CLOSE = {
  stages: [{ name: 'line-2', kind: 'rubric-step', fromLine: [2], params: { step: 2, parts: [PART] } }],
  list: [
    { key: 'L2.$shape', line: 2, kind: 'shape', by: 'default', state: 'built' },
    { key: 'L2.~1', line: 2, kind: 'rule', rule: 1, by: 'you', state: 'built' },
    { key: 'L2.~2', line: 2, kind: 'rule', rule: 2, by: 'you', state: 'built' },
    { key: 'L2.~3', line: 2, kind: 'rule', rule: 3, by: 'you', state: 'built' },
    { key: 'L2.shape.remote', line: 2, kind: 'shape', by: 'agent', state: 'built' },
  ],
};

test('the card: one row per field ([you] covers its rule, [agent] for an extra field) and the [default] row, in code\'s words', () => {
  const rows = checksOfClose(CLOSE, JOB);
  assert.deepEqual(rows.map((r) => [r.by, r.key]), [['you', 'L2.~3'], ['you', 'L2.~1'], ['you', 'L2.~2'], ['agent', 'L2.shape.remote'], ['default', 'L2.$shape']]);
  assert.equal(rows[0].text, 'name \u00B7 not empty');
  assert.equal(rows[1].text, 'blurb \u00B7 under 60 words', 'the person\'s own form: "each blurb is under 60 words" signs 59');
  assert.equal(rows[2].text, 'matching \u00B7 a list of text, at most 5 entries, no repeats');
  assert.equal(rows[3].text, 'remote \u00B7 yes');
  assert.equal(rows[4].text, 'the answer lists exactly 2 items');
  assert.ok(rows.every((r) => r.shape === true));
  assert.deepEqual(cardOfClose({ closeDecl: CLOSE, jobLines: JOB }).checkItems.map((c) => c.key), rows.map((r) => r.key));
});

test('the [default] row is drawn only when its signed list row is there (like the sheet\'s)', () => {
  const rows = checksOfClose({ ...CLOSE, list: CLOSE.list.filter((r) => r.key !== 'L2.$shape') }, JOB);
  assert.ok(!rows.some((r) => r.by === 'default'));
});

test('shapeFieldSentence: every kind in plain words', () => {
  assert.equal(shapeFieldSentence({ kind: 'oneOf', values: ['in progress', 'closed'] }), 'one of: in progress, closed');
  assert.equal(shapeFieldSentence({ kind: 'money', lt: 450, required: true }), 'an amount of money, under 450');
  assert.equal(shapeFieldSentence({ kind: 'time', min: '05:00', max: '21:59' }), 'a time, at least "05:00", at most "21:59"');
  assert.equal(shapeFieldSentence({ kind: 'text', maxChars: 199 }, 'the summary is under 200 characters'), 'under 200 characters');
  assert.equal(shapeFieldSentence({ kind: 'text', maxChars: 200 }, 'the summary is under 200 characters'), 'at most 200 characters', 'a bound that is the written number is not "under" it');
  assert.equal(shapeFieldSentence({ kind: 'text', minChars: 1, required: true }), 'not empty');
  assert.equal(shapeFieldSentence({ kind: 'text' }), 'text');
  assert.equal(shapeFieldSentence({ kind: 'boolean' }), 'yes or no');
  assert.equal(shapeFieldSentence({ kind: 'boolean', equals: false }), 'no');
  assert.equal(shapeFieldSentence({ kind: 'url' }), 'a web address');
  assert.equal(shapeDefaultWords(null), null, 'no count, no default row on the card');
});

test('flattenStep passes a shape answer\'s results through only for a line whose signed class is shape', () => {
  const obj = { results: [{ name: 'A' }] };
  assert.deepEqual(flattenStep(obj, [], null, [], [], PART).results, [{ name: 'A' }]);
  assert.equal(Object.hasOwn(flattenStep(obj), 'results'), false, 'a line with no shape part is flattened as it always was');
  assert.equal(shapePartOf({ step: 2, parts: [PART] }), PART);
  assert.equal(shapePartOf({ step: 2, parts: [{ class: 'fact', facts: [] }] }), null);
});

const params = CLOSE.stages[0].params;
const rowsOf = (/** @type {any} */ g) => rowResultsOf(CLOSE.list, params, g);
const gap = (/** @type {any} */ o) => ({ id: 'p1-shape', check: 'itemShape', field: 'results', ...o });

test('per-row results: an item red lands on the row that owns its field, in plain words; the others pass', () => {
  const r = rowsOf({ verdict: 'red', rawGaps: [gap({ kind: 'item-shape', items: ['#1:blurb:too-long:words:75>59', '#0:remote:wrong-value', '#1:matching[2]:duplicate'] })] });
  const by = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  assert.equal(by['L2.~1'].result, 'failed');
  assert.match(String(by['L2.~1'].why), /item 2: "blurb" is too long \(75 words, at most 59\)/);
  assert.equal(by['L2.shape.remote'].result, 'failed');
  assert.match(String(by['L2.shape.remote'].why), /item 1: "remote" does not have the value/);
  assert.equal(by['L2.~2'].result, 'failed');
  assert.equal(by['L2.~3'].result, 'passed');
  assert.equal(by['L2.$shape'].result, 'passed');
  assert.deepEqual(r.unclaimed, []);
});

test('per-row results: a whole-field gap and a field-less item red land on the [default] row', () => {
  const a = rowsOf({ verdict: 'red', rawGaps: [gap({ kind: 'count-under', measured: 1, limit: 2 })] });
  assert.equal(a.rows.find((x) => x.key === 'L2.$shape')?.result, 'failed');
  assert.match(String(a.rows.find((x) => x.key === 'L2.$shape')?.why), /lists 1 item\(s\), at least 2/);
  const b = rowsOf({ verdict: 'red', rawGaps: [gap({ kind: 'item-shape', items: ['#0:item-not-object'] })] });
  assert.equal(b.rows.find((x) => x.key === 'L2.$shape')?.result, 'failed');
  assert.equal(b.rows.filter((x) => x.result === 'failed').length, 1);
});

test('the report: one #### Item N block per item, fields in the signed order, a list field as a list; no AI-answer heading', () => {
  const file = { results: [
    { remote: true, matching: ['python', 'sql'], blurb: 'Strong fit.', name: 'Ada Lovelace', extra: 'never printed' },
    { name: 'Alan Turing', blurb: 'Good.', matching: [], remote: false },
  ] };
  const buf = Buffer.from(JSON.stringify(file));
  const md = /** @type {string} */ (renderRunMd({ job: 'Resumes', runNo: 3, now: new Date(2026, 10, 18), closeDecl: CLOSE, jobLines: JOB, steps: [{ n: 2, orig: buf, delivered: buf }] }));
  assert.match(md, /^# Resumes — run-3\nPassed · 18 Nov 2026/);
  assert.match(md, /## 2\. Read each resume\nRule: each blurb is under 60 words\nRule: matching words is a list of at most 5 words\nRule: the candidate has a name/);
  assert.match(md, /### Checked by code\n#### Item 1\n- Name: Ada Lovelace\n- Blurb: Strong fit\.\n- Matching:\n {2}- python\n {2}- sql\n- Remote: true\n\n#### Item 2\n- Name: Alan Turing\n- Blurb: Good\.\n- Matching: \(none\)\n- Remote: false\n/);
  assert.ok(!md.includes('never printed'));
  assert.ok(!md.includes("The AI's answer"));
});

test('a facts line whose answer also has `results` is still rendered as facts (picked by class, not by key)', () => {
  const FACTS = { stages: [{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ class: 'fact', text: 'p', source: 'page', facts: [{ name: 'price', shape: 'money' }] }] } }] };
  const buf = Buffer.from(JSON.stringify({ results: [{ quote: 'Price $5', values: { price: '$5' } }] }));
  const md = /** @type {string} */ (renderRunMd({ job: 'J', runNo: null, now: new Date(2026, 10, 18), closeDecl: FACTS, jobLines: [{ n: 1, text: 'Find the price', rules: [] }], steps: [{ n: 1, orig: buf, delivered: buf }] }));
  assert.match(md, /#### Result 1\n- Price: \$5\n\nfrom the page: "Price \$5"/);
});

test('rows of a close with no shape part: none', () => {
  assert.deepEqual(shapeRowsOf({ stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'fact' }] } }] }), []);
});

test('the card of a shape line (panel model): one heading in code\'s words, the rows as `name · sentence` with their tags, Not checked says the truth is the person\'s', async () => {
  const { planFromSpec, planFromConfirm } = await import('../src/panel/jobplan.js');
  const { SHAPE_HEAD, SHAPE_TRUTH_WORDS } = await import('../src/shaperows.js');
  const spec = { jobLines: JOB, closeDecl: { ...CLOSE, list: [...CLOSE.list, { key: 'L2.$prose', line: 2, kind: 'prose', by: 'default', from: 'default', state: 'not-checked', reason: SHAPE_TRUTH_WORDS }] } };
  const plan = planFromSpec(spec);
  assert.equal(plan.shapeHead, SHAPE_HEAD);
  assert.equal(SHAPE_HEAD, "Shape checks · code checks each item's form, not whether it is true");
  const checks = plan.lines[0].checks;
  assert.deepEqual(checks.filter((c) => c.shape).map((c) => [c.name, c.by]), [['name · not empty', 'you'], ['blurb · under 60 words', 'you'], ['matching · a list of text, at most 5 entries, no repeats', 'you'], ['remote · yes', 'agent'], ['the answer lists exactly 2 items', 'default']]);
  assert.ok(plan.lines[0].refused.some((t) => t.includes('whether each one is true — you judge it at Accept')));
  const confirm = planFromConfirm(JOB, { checkItems: cardOfClose({ closeDecl: spec.closeDecl, jobLines: JOB }).checkItems });
  assert.equal(confirm.shapeHead, SHAPE_HEAD);
  assert.equal(confirm.lines[0].checks.every((c) => c.shape === true || c.key === 'L2.$floor'), true);
  assert.equal(planFromSpec({ jobLines: JOB, closeDecl: { stages: [], list: [] } }).shapeHead, undefined, 'no shape row, no heading');
});

test('the page draws a shape card: the heading once, rows as `› name · sentence` with their tags, Suggested with Add, Not checked with the $ tag (the page\'s own renderJobPlan)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { planFromSpec } = await import('../src/panel/jobplan.js');
  const { SHAPE_TRUTH_WORDS } = await import('../src/shaperows.js');
  const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
  const fnSrc = (/** @type {string} */ name) => { const start = PAGE.indexOf(`function ${name}(`); let depth = 0; let i = PAGE.indexOf('{', start); for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } } return PAGE.slice(start, i + 1); };
  const escapeXml = (/** @type {unknown} */ s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const { renderJobPlan } = new Function('escapeXml', `${fnSrc('byTagOf')}\n${fnSrc('renderJobPlan')}\nreturn { renderJobPlan };`)(escapeXml);
  const spec = { jobLines: JOB, closeDecl: { ...CLOSE, list: [...CLOSE.list, { key: 'L2.$prose', line: 2, kind: 'prose', by: 'default', from: 'default', state: 'not-checked', reason: SHAPE_TRUTH_WORDS }] } };
  const plan = { ...planFromSpec(spec), suggested: [{ key: 'L2.shape.owner', line: 2, text: 'owner · text' }] };
  const html = renderJobPlan(plan, (/** @type {string} */ op, /** @type {string} */ key) => `<button data-op="${op}" data-key="${key}">${op}</button>`);
  assert.equal((html.match(/data-testid="plan-shape-head"/g) ?? []).length, 1);
  assert.match(html, /<b>Shape checks · code checks each item's form, not whether it is true<\/b>/);
  assert.match(html, /<span class="mk">›<\/span> name · not empty <span class="by" data-testid="plan-by" data-by="you">~ \[you\]<\/span>/);
  assert.match(html, /<span class="mk">›<\/span> remote · yes <span class="by" data-testid="plan-by" data-by="agent">! \[agent\]<\/span><button data-op="drop"/);
  assert.doesNotMatch(html, /check · name · not empty/);
  assert.match(html, /Suggested ·[^<]*<\/span><div class="fold" data-testid="plan-suggest-row"><span class="mk">›<\/span> line 2 · owner · text <span class="by"[^>]*>! \[agent\]<\/span><button data-op="add" data-key="L2.shape.owner"/);
  assert.match(html, /<summary>Not checked · \d/);
});
