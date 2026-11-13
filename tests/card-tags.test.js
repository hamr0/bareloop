// F-c (hamr ruling 2026-11-13, live drafts smwelq2l6srdb = A and smwelw0jrax5c = B): the card tags are by row kind, code-owned: a `~` row (and a fact built from the person's rule) is [you], a `!` row [agent], a `$` row [default].
// Surfaces: the confirm card and the signed card / Job tab (one model, one drawing) and the Result tab. The heading is "Not checked".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { draftBlock } from './card-drafts-helper.js';
import { cardOfClose } from '../src/rubricstep.js';
import { planFromConfirm, planFromSpec } from '../src/panel/jobplan.js';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const { renderJobPlan, resultNotChecked } = new Function('escapeXml', 'resultField', `${fnSrc('byTagOf')}\n${fnSrc('renderJobPlan')}\n${fnSrc('resultNotChecked')}\nreturn { renderJobPlan, resultNotChecked };`)(escapeXml, (l, h) => h);

const byOf = (/** @type {any[]} */ items, /** @type {RegExp} */ re) => items.find((c) => re.test(c.text))?.by;
const ledgerOf = (/** @type {any} */ block) => block.rows.map((r) => ({ key: r.key, words: r.kind === 'rule' ? [r.text ?? ''] : (r.words ?? []) }));

for (const which of /** @type {const} */ (['A', 'B'])) {
  test(`draft ${which}: the card rows are tagged by row kind: price and departure [you], origin, destination and the count [agent]`, async () => {
    const { block, d } = await draftBlock(which);
    const card = cardOfClose({ closeDecl: block.closeView(), jobLines: d.jobLines, ledger: ledgerOf(block) });
    assert.equal(byOf(card.checkItems, /^fact · price /), 'you', JSON.stringify(card.checkItems));
    assert.equal(byOf(card.checkItems, /^fact · departure time /), 'you');
    assert.equal(byOf(card.checkItems, /^fact · origin /), 'agent');
    assert.equal(byOf(card.checkItems, /^fact · destination /), 'agent');
    assert.equal(byOf(card.checkItems, /^fact · results — /), 'agent');
    const html = renderJobPlan(planFromConfirm(d.jobLines, { ...card, checks: card.checkItems.map((c) => c.text), protections: [] }));
    assert.match(html, /check · fact · price [^<]*<span class="by" data-testid="plan-by" data-by="you">\[you\]<\/span>/);
    assert.match(html, /check · fact · origin [^<]*<span class="by" data-testid="plan-by" data-by="agent">\[agent\]<\/span>/);
    assert.doesNotMatch(html, /the AI's own reading|you picked/);
    assert.match(html, /<summary>Not checked · \d/);
  });
}

test('draft B: Not checked rows carry their tag: the rule the person wrote [you], the default quote row [default]', async () => {
  const { block, d } = await draftBlock('B');
  const card = cardOfClose({ closeDecl: block.closeView(), jobLines: d.jobLines, ledger: ledgerOf(block) });
  const rule = card.notChecked.find((t) => /nonstop is not mandatory/.test(t));
  assert.ok(rule, JSON.stringify(card.notChecked));
  assert.match(rule, /it says what is not needed, so there is nothing to check/);
  assert.equal(card.notCheckedBy[rule], 'you');
  const cited = card.notChecked.find((t) => /every claim quotes its input/.test(t));
  assert.equal(card.notCheckedBy[cited], 'default');
  const html = renderJobPlan(planFromConfirm(d.jobLines, { ...card, checks: [], protections: [] }));
  assert.match(html, /nonstop is not mandatory[^<]*<span class="by" data-testid="plan-by" data-by="you">\[you\]<\/span><\/li>/);
  assert.match(html, /every claim quotes its input[^<]*<span class="by" data-testid="plan-by" data-by="default">\[default\]<\/span><\/li>/);
});

test('the signed card and the Job tab (planFromSpec over the signed close) tag the same way, and the Result tab tags its Not checked list', async () => {
  const { block, d } = await draftBlock('B');
  const closeDecl = { ...block.closeView(), genre: 'rubric', lang: 'rubric-files' };
  const spec = { goal: 'x', jobLines: d.jobLines.map((l) => ({ ...l, rule: l.rules.join('; ') })), closeDecl };
  const plan = planFromSpec(spec, ledgerOf(block));
  const tags = Object.fromEntries(plan.lines[0].checks.map((c) => [c.name.split(' — ')[0], c.by]));
  assert.equal(tags['fact · price'], 'you', JSON.stringify(tags));
  assert.equal(tags['fact · origin airport'], 'agent');
  const refused = plan.lines[0].refused.find((t) => /nonstop is not mandatory/.test(t));
  assert.ok(refused, JSON.stringify(plan.lines[0].refused));
  assert.equal(plan.notCheckedBy?.[refused], 'you');
  assert.match(renderJobPlan(plan), /not checked · [^<]*nonstop is not mandatory[^<]*<span class="by" data-testid="plan-by" data-by="you">\[you\]/);
  assert.match(resultNotChecked('Not checked', [refused], 't', plan.notCheckedBy), /\[you\]/);
  assert.doesNotMatch(resultNotChecked('Not checked', [refused], 't'), /\[you\]/, 'no map, no tag (an older run)');
});
