// Live draft 3 (session smwen1p12tyhc, 2026-11-13, hamr: "fix the 4 first"): the job's words win over the long page name, a Drop is undone through Suggested, the [default] tag on
// Always checked, bold section headings. Draft C is the real page and the real page-map reply of that session (tests/fixtures/card-drafts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { draftBlock } from './card-drafts-helper.js';

const row = (/** @type {any} */ b, /** @type {string} */ key) => b.rows.find((/** @type {any} */ r) => r.key === key);
const facts = (/** @type {any} */ b) => b.reconcile().parts.flatMap((/** @type {any} */ p) => p.facts ?? []);
const ORIGIN = 'L1.fact.origin airport';
const DEST = 'L1.fact.destination airport';

test('2: the job says Boston and Chicago, the look named the long airports: both rows are job-derived [agent], built as "must say Boston"/"Chicago", with Drop; nothing from the job is under Suggested', async () => {
  const { block } = await draftBlock('C');
  for (const [k, w] of [[ORIGIN, 'Boston'], [DEST, 'Chicago']]) {
    assert.equal(row(block, k).state, 'built', k);
    assert.equal(row(block, k).by, 'agent');
    assert.ok(facts(block).some((/** @type {any} */ f) => f.phrase === w), `${w} is the phrase checked: ${JSON.stringify(facts(block).map((/** @type {any} */ f) => f.phrase))}`);
    assert.ok(!facts(block).some((/** @type {any} */ f) => /International Airport/.test(f.phrase ?? '')), 'not the long page name');
    assert.ok(block.card().some((/** @type {any} */ c) => c.key === k && c.state === 'built' && c.by === 'agent'), `${k} is on the card`);
  }
  assert.deepEqual(block.suggestedView().map((/** @type {any} */ x) => x.key), [], 'nothing the job names is under Suggested');
  assert.deepEqual(block.rowChoice(ORIGIN, 'drop'), { ok: true }, 'Drop is offered on it');
});

test('2: a row with NO word from the job (draft A: Nonstop) still goes to Suggested; a job word that is not on the page does not derive a row', async () => {
  const { block } = await draftBlock('A');
  assert.deepEqual(block.suggestedView().map((/** @type {any} */ x) => x.key), ['L1.phrase.nonstop']);
});

test('4: Drop on an [agent] row moves it to Suggested (it was buildable); Add puts it back; $0, no model call, one owner (the block); Revise carries the state; the signed row says dropped only while it is not added', async () => {
  const { block } = await draftBlock('C');
  assert.deepEqual(block.rowChoice(ORIGIN, 'drop'), { ok: true });
  assert.equal(row(block, ORIGIN).state, 'suggested');
  assert.ok(!facts(block).some((/** @type {any} */ f) => f.phrase === 'Boston'), 'a dropped row is not checked');
  assert.deepEqual(block.suggestedView().map((/** @type {any} */ x) => x.key), [ORIGIN]);
  assert.ok(!block.card().some((/** @type {any} */ c) => c.key === ORIGIN), 'off the card');
  assert.equal(block.signedRows().find((/** @type {any} */ r) => r.key === ORIGIN)?.state, 'dropped');
  // a Revise carries the drop: the row is under Suggested again, not lost
  const rec = JSON.parse(JSON.stringify(block.choicesRecord()));
  const again = await draftBlock('C');
  again.block.carryChoices(rec); again.block.reconcile();
  assert.equal(row(again.block, ORIGIN).state, 'suggested');
  // Add puts it back
  assert.deepEqual(block.rowChoice(ORIGIN, 'add'), { ok: true });
  assert.equal(row(block, ORIGIN).state, 'built');
  assert.ok(facts(block).some((/** @type {any} */ f) => f.phrase === 'Boston'));
  assert.deepEqual(block.suggestedView(), []);
  assert.equal(block.signedRows().find((/** @type {any} */ r) => r.key === ORIGIN)?.state, 'built');
  // the count row (agent, job-derived) round-trips the same way, and can be dropped again after an Add
  assert.deepEqual(block.rowChoice('L1.count.3-3', 'drop'), { ok: true });
  assert.equal(row(block, 'L1.count.3-3').state, 'suggested');
  assert.deepEqual(block.rowChoice('L1.count.3-3', 'add'), { ok: true });
  assert.deepEqual(block.rowChoice('L1.count.3-3', 'drop'), { ok: true });
});

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(/** @type {string} */ name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, name);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
const escapeXml = (/** @type {unknown} */ s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// eslint-disable-next-line no-new-func
const renderJobPlan = new Function('escapeXml', `${fnSrc('byTagOf')}\n${fnSrc('renderJobPlan')}\nreturn renderJobPlan;`)(escapeXml);

test('3: the Always checked rows (and a guard under a line) carry the [default] tag, the same markup as the other tags', () => {
  const h = renderJobPlan({ lines: [{ n: 1, text: 'a', checks: [], always: ['changed-from-seed'] }], loose: [], notChecked: [], readNotes: [], alwaysOn: ['no-suppressions', 'changed-from-seed'], older: false });
  assert.equal((h.match(/<span class="by" data-testid="plan-by" data-by="default">\[default\]<\/span>/g) ?? []).length, 3, h);
  assert.match(h, /plan-alwayson"><summary>Always checked · 2<\/summary><ul><li>no-suppressions <span class="by"[^>]*data-by="default">/);
});

test('1: the section headings (Suggested, Not checked, How the page was read, Always checked) are bold', () => {
  assert.match(PAGE, /\.jp details>summary\{[^}]*font-weight:700/);
  assert.match(PAGE, /\.jp-sug \.lbl\{[^}]*font-weight:700/);
});
