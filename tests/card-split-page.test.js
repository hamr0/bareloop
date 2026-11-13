// The page half of N-1/N-2/F-b (hamr ruling 2026-11-13, live drafts smwelq2l6srdb = A and smwelw0jrax5c = B): the Suggested section, Drop and Add buttons only on the confirm card, a Not checked list with no raw gate text
// (a suggestion code could not build is an Audit sentence), phone-width rules by source (barebrowse cannot emulate a phone: hamr's DevTools check stays open).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftBlock } from './card-drafts-helper.js';
import { cardOfClose } from '../src/rubricstep.js';
import { planFromConfirm } from '../src/panel/jobplan.js';
import { readDraftNotBuilt } from '../src/draftspend.js';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const page = () => new Function('escapeXml', `${fnSrc('byTagOf')}\n${fnSrc('renderJobPlan')}\n${fnSrc('draftingTableHtml')}\n${fnSrc('draftingMoneyText')}\n${fnSrc('draftingCallCost')}\n${fnSrc('panelMoney')}\n${fnSrc('duration')}\nreturn { renderJobPlan, draftingTableHtml };`)(escapeXml);
const ctl = (op, key) => ` <button type="button" class="btn jp-btn" data-rowop="${op}" data-rowkey="${escapeXml(key)}">${op === 'add' ? 'Add' : 'Drop'}</button>`;

async function confirmPlan(/** @type {'A'|'B'} */ which) {
  const { block, d } = await draftBlock(which);
  const card = cardOfClose({ closeDecl: block.closeView(), jobLines: d.jobLines, ledger: block.rows.map((r) => ({ key: r.key, words: r.kind === 'rule' ? [r.text ?? ''] : (r.words ?? []) })) });
  return { block, d, card, plan: planFromConfirm(d.jobLines, { ...card, checks: card.checkItems.map((c) => c.text), protections: [], suggested: block.suggestedView(), editable: true }) };
}

test('draft A, the signed preview: [agent] rows carry Drop, [you] rows none, Nonstop sits under Suggested with Add, Not checked has the default row', async () => {
  const { plan } = await confirmPlan('A');
  const { renderJobPlan } = page();
  const h = renderJobPlan(plan, ctl);
  const rowOf = (/** @type {RegExp} */ re) => h.split('</div>').find((x) => re.test(x)) ?? '';
  assert.match(rowOf(/fact · price/), /\[you\]/); assert.doesNotMatch(rowOf(/fact · price/), /<button/);
  assert.match(rowOf(/fact · departure time/), /\[you\]/); assert.doesNotMatch(rowOf(/fact · departure time/), /<button/);
  for (const re of [/fact · origin/, /fact · destination/, /fact · results/]) { assert.match(rowOf(re), /\[agent\]/, String(re)); assert.match(rowOf(re), /data-rowop="drop" data-rowkey="L1\./, String(re)); }
  assert.match(h, /Suggested · not in your job, not checked unless you add it/);
  const sug = h.slice(h.indexOf('plan-suggested'));
  assert.match(sug, /must say &quot;Nonstop&quot;[^]*data-rowop="add" data-rowkey="L1\.phrase\.nonstop"/);
  assert.match(h, /<summary>Not checked · \d/);
  assert.match(h, /every claim quotes its input[^<]*<span class="by"[^>]*data-by="default">\[default\]/);
  // the section sits between the lines and the Not checked fold
  assert.ok(h.indexOf('plan-suggested') > h.indexOf('fact · results') && h.indexOf('plan-suggested') < h.indexOf('plan-notchecked'));
});

test('without controls (the Job tab, the signed card) the same plan draws no button; and a plan with nothing suggested has no Suggested section', async () => {
  const { plan } = await confirmPlan('A');
  const { renderJobPlan } = page();
  assert.doesNotMatch(renderJobPlan(plan), /<button/);
  const b = await confirmPlan('B');
  assert.deepEqual(b.plan.suggested ?? [], []);
  assert.doesNotMatch(renderJobPlan(b.plan, ctl), /plan-suggested/);
});

test('F-b: the Not checked list shows no raw gate text; the rule the person wrote is there; the suggestion code could not build is one plain Audit sentence', async () => {
  const { card, block } = await confirmPlan('B');
  for (const t of card.notChecked) assert.doesNotMatch(t, /code could not build a legal check|Nothing was signed/, t);
  assert.ok(card.notChecked.some((t) => /nonstop is not mandatory/.test(t)), 'a ~ rule is never dropped silently');
  assert.ok(!JSON.stringify(card.checkItems).includes('12 results returned'));
  const unbuilt = block.unbuiltSuggestions();
  assert.equal(unbuilt.length, 1);
  assert.match(unbuilt[0].text, /^A suggested check was not built \(phrase "12 results returned\."\): /);
  // the Audit's draft lines read it from the draft log and draw it
  const dir = mkdtempSync(join(tmpdir(), 'card-notbuilt-'));
  try {
    writeFileSync(join(dir, 'draft-log.jsonl'), `${JSON.stringify({ kind: 'draft-notbuilt', no: 5, rows: unbuilt, at: 'x' })}\n{"kind":"draft-notbuilt","ro\n`);
    assert.deepEqual(readDraftNotBuilt(dir), unbuilt);
    const { draftingTableHtml } = page();
    const html = draftingTableHtml({ draftSteps: [], draftChecks: [], draftNotBuilt: unbuilt });
    assert.match(html, /data-testid="drafting-notbuilt"><td[^>]*>line 1 · A suggested check was not built \(phrase &quot;12 results returned\.&quot;\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the page wires the buttons once on the thread, posts a typed row edit, and keeps the card inside a phone width (by source)', () => {
  assert.match(PAGE, /thread\.addEventListener\("click"[^]*closest\("\[data-rowop\]"\)[^]*\/row-edit", \{op: b\.getAttribute\("data-rowop"\), key: b\.getAttribute\("data-rowkey"\)\}/);
  assert.match(PAGE, /renderJobPlan\(m\.plan, m\.plan\.editable === true \? planControlHTML : null\)/);
  assert.match(PAGE, /\.jp \.jp-btn\{[^}]*min-height:32px/);
  assert.match(PAGE, /\.jp \.fold\{overflow-wrap:anywhere;\}/);
  assert.doesNotMatch(fnSrc('renderJobPlan'), /<(input|button|select|textarea)\b/i, 'renderJobPlan paints no control itself: the caller hands it the one that does');
});
