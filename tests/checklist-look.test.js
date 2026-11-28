// The signed check-list look (hamr 2026-11-19, .claude/scratch/checklist-ui/SIGNED-MOCK.md): ONE list, so the card and the Audit read the same rows —
// `[tag] kind words ... right`, the tag first in a fixed column, the kind word second (truth / shape / file), groups CHECKED / NOT CHECKED / SUGGESTED,
// a long reason behind "why". The page functions are extracted by name and run, like the other *-page tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planFromSpec, auditChecksOf, kindOfCheck, splitNotChecked } from '../src/panel/jobplan.js';
import { buildShapePart } from '../src/shaperows.js';
import { SHAPE_TRUTH_WORDS } from '../src/shaperows.js';
import { guardKeyOf, FENCE_KEY } from '../src/rubricstep.js';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(/** @type {string} */ name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
const escapeXml = (/** @type {unknown} */ s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NAMES = ['tagWordOf', 'byTagOf', 'ckTagHtml', 'ckRowHtml', 'ckGroupHtml', 'renderJobPlan', 'stateDotHTML', 'auditCheckRowHtml'];
const page = /** @type {any} */ (new Function('escapeXml', `${NAMES.map((n) => { try { return fnSrc(n); } catch { return ''; } }).join('\n')}\nreturn { renderJobPlan, auditCheckRowHtml: typeof auditCheckRowHtml === 'function' ? auditCheckRowHtml : null };`)(escapeXml));
const ctl = (/** @type {string} */ op, /** @type {string} */ key) => `<button data-op="${op}" data-key="${key}">${op === 'drop' ? 'Drop' : 'Add'}</button>`;

const JOB = [{ n: 1, text: 'List every research item in the tracker, one entry each', rules: ['each item has a title', 'summary is under 200 characters'] }];
const PART = buildShapePart({ text: 'the items of line 1', fields: [{ name: 'summary', spec: { kind: 'text', required: true, maxChars: 199 }, rule: 2, by: 'you' }] });
const REFUSED = [{ line: 1, rule: 1, by: 'you', reason: 'Code tried a quote check: "Evaluate queue libraries" is in the tracker once, but there are 4 items. Nothing was signed.' }];
const SPEC = {
  jobLines: JOB,
  closeDecl: {
    stages: [
      { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [PART] } },
      { name: 'changed-from-seed', kind: 'changed-from-seed', params: {} },
    ],
    refused: REFUSED,
    list: [
      { key: 'L1.~2', line: 1, kind: 'rule', rule: 2, by: 'you', state: 'built' },
      { key: 'L1.$prose', line: 1, kind: 'prose', by: 'default', from: 'default', state: 'not-checked', reason: SHAPE_TRUTH_WORDS },
      { key: guardKeyOf('changed-from-seed'), line: 0, kind: 'guard', by: 'default', state: 'built' },
    ],
  },
};

test('model: every check carries its kind word (shape / file / truth) and the Not checked rows come split into row and why', () => {
  assert.equal(kindOfCheck({ shape: true }), 'shape');
  assert.equal(kindOfCheck({ key: FENCE_KEY }), 'file');
  assert.equal(kindOfCheck({ key: guardKeyOf('x') }), 'file');
  assert.equal(kindOfCheck({ fence: true }), 'file');
  assert.equal(kindOfCheck({ key: 'L1.fact.price' }), 'truth');
  assert.deepEqual(splitNotChecked('"each item has a title" — Code tried a quote check.'), { text: 'each item has a title', why: 'Code tried a quote check.' });
  assert.deepEqual(splitNotChecked(SHAPE_TRUTH_WORDS), { text: 'whether each one is true' }, '"you judge it at Accept" is the group title\'s words');
  assert.deepEqual(splitNotChecked('plain'), { text: 'plain' });
  const plan = planFromSpec(SPEC);
  assert.ok(plan.lines[0].checks.some((c) => c.shape === true && c.kind === 'shape'), JSON.stringify(plan.lines[0].checks));
  assert.ok((plan.loose ?? []).concat(plan.lines[0].checks).some((c) => c.kind === 'file'), 'the guard row is a file row');
  const ruleRow = /** @type {any[]} */ (plan.ncRows).find((r) => r.text === 'each item has a title');
  assert.equal(ruleRow?.line, 1);
  assert.match(String(ruleRow?.why), /^Code tried a quote check: "Evaluate queue libraries/);
});

test('the card (signed mock A): legend, summary, the line with its ~ rules, then CHECKED, NOT CHECKED, SUGGESTED, the tag first, the kind second, Drop and Add where they were', () => {
  const plan = { ...planFromSpec(SPEC), goal: 'List every research item', suggested: [{ key: 'L1.shape.owner', line: 1, text: 'owner · has text' }] };
  const h = page.renderJobPlan(plan, ctl);
  const at = (/** @type {string} */ s) => h.indexOf(s);
  assert.match(h, /Done when every check below passes/);
  assert.ok(at('jp-legend') < at('plan-goal') && at('plan-goal') < at('plan-line') && at('plan-line') < at('data-testid="plan-checked"') && at('data-testid="plan-checked"') < at('data-testid="plan-notchecked"') && at('data-testid="plan-notchecked"') < at('data-testid="plan-suggested"'), 'order');
  assert.match(h, /<div class="ck-h">CHECKED · \d+<\/div>/);
  assert.match(h, /<div class="ck-h">NOT CHECKED · \d+ · you judge these at Accept<\/div>/);
  assert.match(h, /<div class="ck-h">SUGGESTED · add if you want it<\/div>/);
  // every row opens with its tag, then its kind word
  const rows = h.match(/<div class="ck-row"[^>]*>.*?(?=<div class="ck-row"|<\/div><\/div>)/g) ?? [];
  assert.ok(rows.length >= 5, String(rows.length));
  for (const r of rows) assert.match(r, /^<div class="ck-row"[^>]*><span class="by tagcol" data-testid="plan-by"[^>]*>[^<]*<\/span><span class="kind" data-testid="ck-kind">[^<]*<\/span>/);
  assert.match(h, /data-by="you">\[you\]<\/span><span class="kind" data-testid="ck-kind">shape<\/span><span class="ck-t">summary[^<]*<\/span><span class="ck-right"><button data-op="drop"/);
  assert.match(h, /data-by="default">\[default\]<\/span><span class="kind" data-testid="ck-kind">file<\/span>/);
  assert.match(h, /data-by="agent">\[agent\]<\/span><span class="kind" data-testid="ck-kind">shape<\/span><span class="ck-t">owner · has text<\/span><span class="ck-right"><button data-op="add" data-key="L1.shape.owner">/);
  // the long reason is behind "why"; the group's title carries "you judge these at Accept"
  assert.match(h, /<span class="ck-t">each item has a title <details class="ck-why" data-testid="ck-why"><summary>▸ why<\/summary><div class="hint">Code tried a quote check: &quot;Evaluate queue libraries/);
  assert.doesNotMatch(h, /Shape checks|other checks|Always checked/);
});

test('the Audit model (signed mock): one block per job line with its CHECKED and NOT CHECKED rows, kind words on every row, the job-level rows apart', () => {
  const plan = planFromSpec(SPEC);
  const results = new Map([['line-1', true], ['changed-from-seed', true]]);
  const ac = auditChecksOf(plan, [], results, 0, true, null);
  assert.equal(ac.lines.length, 1);
  assert.equal(ac.lines[0].n, 1);
  assert.equal(ac.lines[0].text, JOB[0].text);
  const shape = ac.lines[0].checks.find((r) => r.kind === 'shape');
  assert.ok(shape, JSON.stringify(ac.lines[0].checks));
  assert.ok(!/^line 1 ·/.test(shape.text), 'no `line N ·` prefix: the block says which line');
  assert.ok(ac.lines[0].checks.every((r) => r.kind === 'shape' || r.kind === 'truth' || r.kind === 'file'));
  const nc = ac.lines[0].notChecked.find((r) => r.text === 'each item has a title');
  assert.equal(nc?.result, 'not-checked');
  assert.match(String(nc?.why), /^Code tried a quote check/);
  assert.ok(ac.always.length > 0 && ac.always.every((r) => r.kind === 'file'), 'the guards and the write fence are file rows');
  // the flat lists the Result tab reads are unchanged
  assert.ok(ac.checks.every((r) => /^line 1 · |^[^l]/.test(r.text)));
});

test('the Audit page (signed mock): Line N and its text, CHECKED then NOT CHECKED, a failed row\'s reason indented under it, held at the right', () => {
  const plan = planFromSpec(SPEC);
  const shapeKey = String(plan.lines[0].checks.find((c) => c.shape)?.key);
  const ac = auditChecksOf(plan, [], new Map([['line-1', false], ['changed-from-seed', true]]), 0, true, { results: new Map([[shapeKey, { result: 'failed', why: 'item 3: summary has 241 characters, the limit is 199' }]]), unclaimed: new Map() });
  const doc = { createElement: () => { const el = /** @type {any} */ ({ children: [], innerHTML: '', setAttribute() {}, appendChild(/** @type {any} */ c) { this.children.push(c); }, addEventListener() {} }); return el; } };
  const fns = ['escapeXml', 'tagWordOf', 'byTagOf', 'ckTagHtml', 'ckRowHtml', 'ckGroupHtml', 'stateDotHTML', 'auditCheckRowHtml', 'auditCaret', 'glyphClass', 'auditChecksSignClass', 'auditChecksEl'];
  const src = fns.map((n) => { try { return fnSrc(n); } catch { return ''; } }).filter(Boolean).join('\n');
  const auditChecksEl = /** @type {any} */ (new Function('document', `${src}\nreturn auditChecksEl;`)(doc));
  const wrap = auditChecksEl(ac);
  const html = String(wrap.children[1].innerHTML);
  assert.match(html, /<span class="lbl">Line 1<\/span> List every research item in the tracker, one entry each/);
  const at = (/** @type {string} */ s) => html.indexOf(s);
  assert.ok(at('>CHECKED ·') > 0 && at('>CHECKED ·') < at('>NOT CHECKED ·'), 'CHECKED above NOT CHECKED');
  assert.match(html, /NOT CHECKED · \d+ · you judge these at Accept/);
  assert.match(html, /data-by="you">\[you\]<\/span><span class="kind" data-testid="ck-kind">shape<\/span>[^]*failed<\/b>[^]*<div class="hint ck-under" data-testid="audit-check-why">item 3: summary has 241 characters, the limit is 199<\/div>/);
  assert.match(html, /kind" data-testid="ck-kind">file<\/span><span class="ck-t">[^<]*<\/span><span class="ck-right">/, 'a file row\'s result sits at the right');
  assert.match(page.auditCheckRowHtml({ text: 'only files in output/ changed', by: 'default', kind: 'file', result: 'held', word: 'held \u00B7 0 writes blocked' }), /file<\/span><span class="ck-t">only files in output\/ changed<\/span><span class="ck-right">.*held \u00B7 0 writes blocked<\/b>/);
  assert.match(html, /each item has a title <details class="ck-why"/);
  assert.doesNotMatch(html, /Always checked|Shape checks/);
});

test('a Not checked row drawn inside Line 1\'s block does not repeat "line 1: "; a many-line job keeps it on a row outside any line block', () => {
  const note = 'line 1: whether each one is true — you judge it at Accept';
  const one = planFromSpec({ jobLines: [{ n: 1, text: 'a', rules: [] }], closeDecl: { stages: [], notes: [note] } });
  assert.deepEqual(one.ncRows?.map((r) => r.text), ['whether each one is true']);
  const html = page.renderJobPlan(one, ctl);
  assert.doesNotMatch(html, /line 1: whether/);
  assert.match(html, /whether each one is true/);
  const two = planFromSpec({ jobLines: [{ n: 1, text: 'a', rules: [] }, { n: 2, text: 'b', rules: [] }], closeDecl: { stages: [], notes: [note] } });
  assert.deepEqual(two.ncRows?.map((r) => r.text), ['line 1: whether each one is true']);
});
