// hamr 2026-11-24 (signed, ITEM33-BUILD "Part B", C): the Audit's drafting table shows the total draft time only, no per-step times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');

test('C: the Audit drafting table shows the TOTAL draft time only - no per-step time', () => {
  const start = PAGE.indexOf('function draftingTableHtml(');
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  const fns = ['draftingTableHtml', 'draftingMoneyText', 'draftingCallCost', 'duration', 'escapeXml', 'panelMoney'].map((n) => {
    const a = PAGE.indexOf(`function ${n}(`); let d = 0; let j = PAGE.indexOf('{', a);
    for (; j < PAGE.length; j += 1) { if (PAGE[j] === '{') d += 1; else if (PAGE[j] === '}') { d -= 1; if (d === 0) break; } }
    return PAGE.slice(a, j + 1);
  }).join('\n');
  // eslint-disable-next-line no-new-func
  const table = new Function(`${fns}\nreturn draftingTableHtml;`)();
  const html = table({ draftSteps: [{ label: 'checking setup', wallMs: 42_000, calls: [], humans: [] }, { label: 'drafting', wallMs: 92_000, calls: [{ label: 'draft', model: 'm', costUsd: 0.05, unpricedRounds: 0 }], humans: [] }], wallMs: 134_000, rounds: 1, spentUsd: 0.08, spendComplete: true });
  const rows = html.slice(html.indexOf('<tbody>')).match(/<tr>.*?<\/tr>|<tr class="drafting-total">.*?<\/tr>/g);
  assert.doesNotMatch(rows[0], /42s|0m42s|42/, 'no per-step time on a step row');
  assert.doesNotMatch(rows[1], /1m32s|92s/, 'no per-step time on a step row');
  assert.match(rows[2], /drafting-total.*<b>total<\/b><\/td><td>2m14s<\/td>/, 'the total row keeps the total draft time');
});
