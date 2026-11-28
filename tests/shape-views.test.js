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

test('the report (signed mock D): the shape-checks line, a table of items x fields with marks and short values, the Not checked line; no AI-answer heading, no Failed list on a green run', () => {
  const file = { results: [
    { remote: true, matching: ['python', 'sql'], blurb: 'Strong fit.', name: 'Ada Lovelace', extra: 'never printed' },
    { name: 'Alan Turing', blurb: 'Good.', matching: [], remote: false },
  ] };
  const buf = Buffer.from(JSON.stringify(file));
  const md = /** @type {string} */ (renderRunMd({ job: 'Resumes', runNo: 3, now: new Date(2026, 10, 18), closeDecl: CLOSE, jobLines: JOB, steps: [{ n: 2, orig: buf, delivered: buf }] }));
  assert.match(md, /^# Resumes \u2014 run-3\nPassed \u00b7 18 Nov 2026/);
  assert.match(md, /## 2\. Read each resume\nRule: each blurb is under 60 words\nRule: matching words is a list of at most 5 words\nRule: the candidate has a name\n\nShape checks \(code checks each item's form, not whether it is true\)\n\n/);
  assert.match(md, /\| item \| name \| blurb \| matching \| remote \|\n\| --- \| --- \| --- \| --- \| --- \|\n\| 1 \u00b7 Ada Lovelace \| \u2713 Ada Lovelace \| \u2713 Strong fit. \(2 words\) \| \u2713 python, sql \(2 entries\) \| \u2713 yes \|\n\| 2 \u00b7 Alan Turing \| \u2713 Alan Turing \| \u2713 Good. \(1 word\) \| \u2713 0 entries \| \u2713 no \|\n/);
  assert.match(md, /\nNot checked: whether each one is true \(you judge it at Accept\)\n$/);
  assert.ok(!md.includes('never printed') && !md.includes("The AI's answer") && !md.includes('Failed') && !md.includes('#### Item'));
});

test('the view model (signed mock A and D): marks per cell from the item reds, short values, the red words name the worker\'s own value, the Failed list', async () => {
  const { shapeResultModel, shapeMarkdown } = await import('../src/shaperesult.js');
  const part = buildShapePart({ text: 't', fields: [
    { name: 'title', spec: { kind: 'text', required: true, minChars: 1 }, rule: 1, by: 'you' },
    { name: 'status', spec: { kind: 'oneOf', values: ['in progress', 'closed', 'finished'] }, rule: 2, by: 'you' },
    { name: 'summary', spec: { kind: 'text', maxChars: 199 }, rule: 3, by: 'you' },
  ] });
  const rules = ['each item has a title', 'status is in progress, closed or finished', 'the summary is under 200 characters'];
  const results = [
    { title: 'Cell culture notes', status: 'in progress', summary: 'x'.repeat(142) }, { title: 'Soil sample log', status: 'closed', summary: 'x'.repeat(88) },
    { title: 'Field survey', status: 'done', summary: 'x'.repeat(120) }, { title: 'Water quality review', status: 'finished', summary: 'x'.repeat(236) },
  ];
  const m = shapeResultModel({ part, results, rules, reds: ['#2:status:not-one-of', '#3:summary:too-long:chars:236>199'] });
  assert.deepEqual(m.columns, [{ name: 'title' }, { name: 'status' }, { name: 'summary' }]);
  assert.deepEqual([m.total, m.passed, m.failed], [4, 2, 2]);
  assert.equal(m.rows[2].name, '3 \u00B7 Field survey');
  assert.deepEqual(m.rows[2].cells, [{ mark: 'g', text: 'Field survey' }, { mark: 'r', text: 'done', why: 'is "done", not one of: in progress, closed, finished' }, { mark: 'g', text: `${'x'.repeat(39)}… (120 chars)` }]);
  assert.deepEqual(m.rows[3].cells.map((c) => c.mark + c.text), ['gWater quality review', 'gfinished', `r${'x'.repeat(39)}… (236 chars)`]);
  assert.deepEqual(m.errors, ['item 3: status is "done", not one of: in progress, closed, finished', 'item 4: summary is too long (236 characters, under 200)']);
  assert.match(shapeMarkdown(m), /\| 3 \u00b7 Field survey \| \u2713 Field survey \| \u2717 done \| \u2713 x{39}… \(120 chars\) \|\n/);
  assert.match(shapeMarkdown(m), /\n### Failed\n\n- item 3: status is "done", not one of: in progress, closed, finished\n- item 4: summary is too long \(236 characters, under 200\)$/);
  const whole = shapeResultModel({ part, results: [null], rules, reds: ['#0:item-not-object'] });
  assert.deepEqual(whole.rows[0].cells.map((c) => c.mark), ['r', 'r', 'r']);
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
  const { renderJobPlan } = new Function('escapeXml', `${fnSrc('tagWordOf')}\n${fnSrc('byTagOf')}\n${fnSrc('ckTagHtml')}\n${fnSrc('ckRowHtml')}\n${fnSrc('ckGroupHtml')}\n${fnSrc('renderJobPlan')}\nreturn { renderJobPlan };`)(escapeXml);
  const spec = { jobLines: JOB, closeDecl: { ...CLOSE, list: [...CLOSE.list, { key: 'L2.$prose', line: 2, kind: 'prose', by: 'default', from: 'default', state: 'not-checked', reason: SHAPE_TRUTH_WORDS }] } };
  const plan = { ...planFromSpec(spec), suggested: [{ key: 'L2.shape.owner', line: 2, text: 'owner · text' }] };
  const html = renderJobPlan(plan, (/** @type {string} */ op, /** @type {string} */ key) => `<button data-op="${op}" data-key="${key}">${op}</button>`);
  assert.doesNotMatch(html, /plan-shape-head|Shape checks/, 'the old heading is gone: the kind word on each row says shape');
  const ROW = (/** @type {string} */ by, /** @type {string} */ text) => `<span class="by tagcol" data-testid="plan-by" data-by="${by}">\\[${by}\\]<\\/span><span class="kind" data-testid="ck-kind">shape<\\/span><span class="ck-t">${text}<\\/span><span class="ck-right">`;
  assert.match(html, new RegExp(`${ROW('you', 'name · not empty')}<button data-op="drop" data-key="L2\\.~3">`), 'every shape row says shape; the person\'s own ~ row can be dropped');
  assert.match(html, new RegExp(`${ROW('agent', 'remote · yes')}<button data-op="drop"`));
  assert.match(html, /data-by="default">\[default\]<\/span><span class="kind" data-testid="ck-kind">shape<\/span><span class="ck-t">the answer lists exactly 2 items<\/span><\/div>/, 'code\'s own $ row has no Drop');
  assert.match(html, /<div class="ck-h">SUGGESTED \u00B7 add if you want it<\/div><div class="ck-row" data-testid="plan-suggest-row"><span class="by tagcol"[^>]*data-by="agent">\[agent\]<\/span><span class="kind" data-testid="ck-kind">shape<\/span><span class="ck-t">owner · text<\/span><span class="ck-right"><button data-op="add" data-key="L2.shape.owner"/);
  assert.match(html, /NOT CHECKED \u00B7 \d+ \u00B7 you judge these at Accept/);
});

test('the page draws the Result grid and the Audit shape rows as the signed mock (A and C): plain-text item names, marks and values, errors, Not checked; the reason on its own line under an Audit shape row only', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
  const fnSrc = (/** @type {string} */ name) => { const start = PAGE.indexOf(`function ${name}(`); assert.ok(start !== -1, name); let depth = 0; let i = PAGE.indexOf('{', start); for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } } return PAGE.slice(start, i + 1); };
  const escapeXml = (/** @type {unknown} */ s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const names = ['gridGlyph', 'tgMark', 'tgCell', 'tagWordOf', 'byTagOf', 'ckTagHtml', 'ckRowHtml', 'resultField', 'resultNotChecked', 'shapeFoldHtml', 'shapeResultCard', 'stateDotHTML', 'auditCheckRowHtml'];
  const { shapeResultCard, auditCheckRowHtml } = new Function('escapeXml', `var RESULT_NONE = "no saved result to show";\n${names.map(fnSrc).join('\n')}\nreturn { shapeResultCard, auditCheckRowHtml };`)(escapeXml);
  const { shapeResultModel } = await import('../src/shaperesult.js');
  const part = buildShapePart({ text: 't', fields: [{ name: 'title', spec: { kind: 'text', minChars: 1 }, rule: 1, by: 'you' }, { name: 'status', spec: { kind: 'oneOf', values: ['a', 'b'] }, rule: 2, by: 'you' }] });
  const model = shapeResultModel({ part, results: [{ title: 'One', status: 'a' }, { title: 'Two', status: 'done' }], reds: ['#1:status:not-one-of'], rules: ['t', 's'] });
  const html = shapeResultCard({ n: 1, kind: 'shape', shape: model, notChecked: ['whether each one is true — you judge it at Accept'], notCheckedBy: { 'whether each one is true — you judge it at Accept': 'default' } }, { job: 'research-1', runNo: 3, runid: 'x' }, false);
  assert.match(html, /<h4>Result<\/h4>/);
  assert.match(html, /<p class="tg-stats" data-testid="shape-stats"><b>research-1<\/b> · run-3 · <b>2<\/b> items · <b>1<\/b> passed · <b>1<\/b> failed<\/p>/);
  assert.match(html, /data-testid="shape-fold"/);
  assert.match(html, /<span class="sf-nm" data-testid="shape-name" title="2 · Two">2 · Two<\/span>/);
  assert.doesNotMatch(html, /<button[^>]*sf-nm/, 'item names are plain text, not buttons');
  assert.match(html, /<span class="k">status<\/span><span class="g"><span class="glyph-red">✗<\/span><\/span><span class="v">done /);
  assert.doesNotMatch(html, /shape-errors|shape-grid/);
  assert.match(html, /<label>Not checked<\/label>.*whether each one is true — you judge it at Accept .*\$ \[default\]/);
  assert.match(shapeResultCard({ n: 1, kind: 'shape', shape: null, notChecked: [] }, {}, true), /<h4>Result · line 1<\/h4><div class="hint" data-testid="result-nofile">no saved result to show<\/div>/);
  // the signed look: `[tag] shape words ... result`, the red reason on its own indented line under the row; every kind of row reads the same
  const shapeRow = auditCheckRowHtml({ text: 'status · one of: a, b', by: 'you', kind: 'shape', result: 'failed', why: 'item 2: "status" is not one of the allowed values', shape: true });
  assert.match(shapeRow, /^<div class="ck-row" data-testid="audit-check-row" data-result="failed"><span class="by tagcol" data-testid="plan-by" data-by="you">\[you\]<\/span><span class="kind" data-testid="ck-kind">shape<\/span><span class="ck-t">status · one of: a, b<\/span><span class="ck-right">.*failed<\/b><\/span><\/span><div class="hint ck-under" data-testid="audit-check-why">item 2: &quot;status&quot; is not one of the allowed values<\/div><\/div>$/);
  const other = auditCheckRowHtml({ text: 'fact · price', by: 'you', kind: 'truth', result: 'failed', why: 'x' });
  assert.match(other, /truth<\/span><span class="ck-t">fact · price<\/span>.*failed<\/b>.*<div class="hint ck-under" data-testid="audit-check-why">x<\/div><\/div>$/, 'a truth row\'s red reason sits under it the same way');
});

test('the Audit model: shape rows without the `line N` prefix, the heading and the Suggested names, the truth row with no prefix and its $ tag', async () => {
  const { planFromSpec, auditChecksOf } = await import('../src/panel/jobplan.js');
  const { SHAPE_TRUTH_WORDS } = await import('../src/shaperows.js');
  const spec = { jobLines: JOB, closeDecl: { ...CLOSE, list: [...CLOSE.list, { key: 'L2.$prose', line: 2, kind: 'prose', by: 'default', from: 'default', state: 'not-checked', reason: SHAPE_TRUTH_WORDS }, { key: 'L2.shape.owner', line: 2, kind: 'shape', by: 'agent', from: 'agent', state: 'dropped', reason: 'Suggested' }] } };
  const plan = planFromSpec(spec);
  const ac = auditChecksOf(plan, [], null);
  assert.equal(ac.shapeHead, "Shape checks · code checks each item's form, not whether it is true");
  assert.deepEqual(ac.checks.filter((r) => r.shape).map((r) => r.text).slice(0, 2), ['name · not empty', 'blurb · under 60 words']);
  assert.deepEqual(ac.suggested, [{ key: 'L2.shape.owner', line: 2, text: 'owner' }]);
  const truth = ac.notChecked.find((r) => r.text === SHAPE_TRUTH_WORDS);
  assert.deepEqual([truth?.by, truth?.result], ['default', 'not-checked']);
});

test('a shape line of 5+ fields folds (A2): one <details> per item, k of n, a failed item open with its field line and red reason; 4 fields stay the grid (A1)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
  const fnSrc = (/** @type {string} */ name) => { const start = PAGE.indexOf(`function ${name}(`); assert.ok(start !== -1, name); let depth = 0; let i = PAGE.indexOf('{', start); for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } } return PAGE.slice(start, i + 1); };
  const escapeXml = (/** @type {unknown} */ s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const names = ['gridGlyph', 'tgMark', 'tgCell', 'tagWordOf', 'byTagOf', 'resultField', 'resultNotChecked', 'shapeFoldHtml', 'shapeResultCard'];
  const { shapeResultCard } = new Function('escapeXml', `var RESULT_NONE = "x";\n${names.map(fnSrc).join('\n')}\nreturn { shapeResultCard };`)(escapeXml);
  const { shapeResultModel } = await import('../src/shaperesult.js');
  const mk = (/** @type {number} */ n) => {
    const fields = Array.from({ length: n }, (_v, k) => ({ name: k === 0 ? 'title' : `f${k}`, spec: k === 0 ? { kind: 'text', minChars: 1 } : { kind: 'text', maxChars: 9 }, rule: 1, by: 'you' }));
    const ok = Object.fromEntries(fields.map((f) => [f.name, 'abc']));
    const bad = { ...ok, f1: 'x'.repeat(30) };
    return shapeResultModel({ part: buildShapePart({ text: 't', fields }), results: [ok, bad], reds: ['#1:f1:too-long:chars:30>9'], rules: ['t'] });
  };
  const draw = (/** @type {any} */ m) => shapeResultCard({ n: 1, kind: 'shape', shape: m, notChecked: [] }, { job: 'j', runNo: 1, runid: 'x' }, false);
  const five = draw(mk(5));
  assert.match(five, /data-testid="shape-fold"/);
  assert.doesNotMatch(five, /data-testid="shape-grid"/);
  assert.match(five, /<b>2<\/b> items · <b>1<\/b> passed · <b>1<\/b> failed/);
  assert.match(five, /<details class="sf-item" data-testid="shape-item"><summary>.*?1 · abc.*?5 of 5/);
  assert.match(five, /<details class="sf-item bad" data-testid="shape-item" open><summary>.*?4 of 5/);
  assert.doesNotMatch(PAGE.match(/\.sf-nm\{[^}]*\}/)?.[0] ?? 'font-weight', /font-weight/, 'item row name is normal weight');
  assert.match(five, /data-result="failed"><span class="k">f1<\/span><span class="g"><span class="glyph-red">✗<\/span><\/span><span class="v">xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \(30 chars\) <span class="why">· is too long/);
  for (const n of [1, 3, 4]) {
    const few = draw(mk(n));
    assert.match(few, /data-testid="shape-fold"/, `${n} fields draw the fold`);
    assert.doesNotMatch(few, /shape-grid|<table/);
  }
});

test('every cell shows the item\'s own value (clipped, escaped): a free title, a list joined, yes/no, a number; a bounded field adds its words in brackets', async () => {
  const { shapeResultModel } = await import('../src/shaperesult.js');
  const part = buildShapePart({ text: 't', fields: [
    { name: 'title', spec: { kind: 'text', required: true, minChars: 1 }, rule: 1, by: 'you' },
    { name: 'blurb', spec: { kind: 'text', maxWords: 9 }, rule: 1, by: 'you' },
    { name: 'tags', spec: { kind: 'list', of: { kind: 'text' } }, rule: 1, by: 'you' },
    { name: 'remote', spec: { kind: 'boolean' }, rule: 1, by: 'you' },
    { name: 'long', spec: { kind: 'text', minChars: 1 }, rule: 1, by: 'you' },
  ] });
  const m = shapeResultModel({ part, rules: ['t'], results: [{ title: 'Ada <b>', blurb: 'two words', tags: ['a', 'b'], remote: true, long: 'y'.repeat(60) }] });
  const t = m.rows[0].cells.map((c) => c.text);
  assert.equal(t[0], 'Ada <b>');
  assert.equal(t[1], 'two words (2 words)');
  assert.equal(t[2], 'a, b (2 entries)');
  assert.equal(t[3], 'yes');
  assert.equal(t[4], `${'y'.repeat(39)}…`);
});

test('the fold draws no separate errors list for any field count (its reasons sit on the opened items\' red lines)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
  const fnSrc = (/** @type {string} */ name) => { const start = PAGE.indexOf(`function ${name}(`); assert.ok(start !== -1, name); let depth = 0; let i = PAGE.indexOf('{', start); for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } } return PAGE.slice(start, i + 1); };
  const escapeXml = (/** @type {unknown} */ s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const names = ['gridGlyph', 'tgMark', 'tgCell', 'tagWordOf', 'byTagOf', 'resultField', 'resultNotChecked', 'shapeFoldHtml', 'shapeResultCard'];
  const { shapeResultCard } = new Function('escapeXml', `var RESULT_NONE = "x";\n${names.map(fnSrc).join('\n')}\nreturn { shapeResultCard };`)(escapeXml);
  const { shapeResultModel } = await import('../src/shaperesult.js');
  const mk = (/** @type {number} */ n) => {
    const fields = Array.from({ length: n }, (_v, k) => ({ name: `f${k}`, spec: { kind: 'text', maxChars: 9 }, rule: 1, by: 'you' }));
    const bad = Object.fromEntries(fields.map((f) => [f.name, 'abc'])); bad.f1 = 'x'.repeat(30);
    return shapeResultModel({ part: buildShapePart({ text: 't', fields }), results: [bad], reds: ['#0:f1:too-long:chars:30>9'], rules: ['t'] });
  };
  const draw = (/** @type {any} */ m) => shapeResultCard({ n: 1, kind: 'shape', shape: m, notChecked: [] }, { job: 'j', runNo: 1, runid: 'x' }, false);
  assert.doesNotMatch(draw(mk(5)), /shape-errors/);
  assert.match(draw(mk(5)), /class="why">· is too long/);
  assert.doesNotMatch(draw(mk(3)), /shape-errors/);
  assert.match(draw(mk(3)), /class="why">· is too long/);
});
