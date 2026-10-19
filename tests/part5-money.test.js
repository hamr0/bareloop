// PRD v1.106 Part 5 Q4: "$0.0054 run + $0.0035 drafting = $0.0089 of $1.00". The run's figure EXCLUDES drafting; the total is their sum. The
// CLI/library spelling (src/replay.js moneyWithDraft) and the panel's (panelMoneyWithDraft in the page) must read the same words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moneyWithDraft } from '../src/replay.js';

const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name}`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
const panelMoneyWithDraft = new Function(`${['panelMoney', 'panelMoneyWithDraft'].map(fnSrc).join('\n')}\nreturn panelMoneyWithDraft;`)();

test('the real run mve5y8fa (runs.jsonl: run 0.0054, drafting 0.0035, total 0.0089) reads as run + drafting = total of cap', () => {
  const rows = readFileSync(new URL('./fixtures/part5/u-mve5y8fa.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const end = rows.find((r) => r.type === 'job-end');
  assert.equal(moneyWithDraft(`$${end.spentUsd.toFixed(4)}`, 0.0035, 1, true, end.spentUsd), '$0.0054 run + $0.0035 drafting = $0.0089 of $1.00');
});

test('the sum is always the run plus drafting, in both spellings', () => {
  for (const [run, draft] of [[0.0054, 0.0035], [3.71, 0.81], [0.18, 0.004], [12.5, 0.3]]) {
    const lib = moneyWithDraft(`$${run.toFixed(4)}`, draft, 50, true, run);
    const m = /= \$([\d.]+) of/.exec(lib);
    assert.ok(m, lib);
    assert.equal(Number(m[1]), Number((run + draft).toFixed(4)), `library total for ${run}+${draft}`);
    const panel = panelMoneyWithDraft(run, false, draft, true, 50);
    const p = /= (\$[\d.]+) of/.exec(panel);
    assert.ok(p, panel);
    assert.equal(p[1], run + draft < 0.01 ? `$${(run + draft).toFixed(4)}` : `$${(Math.round((run + draft) * 100) / 100).toFixed(2)}`, `panel total for ${run}+${draft}: 2-decimal, 4 under a cent, on the true sum`);
  }
});

test('a floor loses nothing: "at least" stays on the run, the drafting and the total, in both spellings', () => {
  const lib = moneyWithDraft('$3.71', 0.81, 5, false, 3.71);
  const panel = panelMoneyWithDraft(3.71, true, 0.81, false, 5);
  assert.equal(lib, 'at least $3.71 run + at least $0.8100 drafting = at least $4.5200 of $5.00');
  assert.equal(panel, 'at least $3.71 run + at least $0.81 drafting = at least $4.52 of $5.00');
  // a died run's floor core with exact drafting still makes the total a floor
  assert.equal(moneyWithDraft('at least $0.0182', 0.01, 5, true, 0.0182), 'at least $0.0182 run + $0.0100 drafting = at least $0.0282 of $5.00');
  assert.equal(panelMoneyWithDraft(0.0182, true, 0.01, true, 5), 'at least $0.02 run + $0.01 drafting = at least $0.03 of $5.00');
});

test('the two spellings read the same words: stripped of their numbers they are the same sentence', () => {
  const skel = (s) => s.replace(/<?\$[\d.]+/g, 'N');
  const cases = [[3.71, false, 0.81, true, 5], [3.71, false, 0.81, false, 5], [0.0182, true, 0.01, true, 5], [3.68, false, null, null, 5], [3.68, false, null, null, undefined]];
  for (const [run, coreFloor, draft, complete, cap] of cases) {
    const lib = moneyWithDraft(`${coreFloor ? 'at least ' : ''}$${run.toFixed(4)}`, draft, cap, complete, run);
    assert.equal(skel(panelMoneyWithDraft(run, coreFloor, draft, complete, cap)), skel(lib), `case ${JSON.stringify([run, coreFloor, draft, complete, cap])}`);
  }
});

test('no drafting share: both spellings are exactly what they always were', () => {
  assert.equal(moneyWithDraft('$3.68', null, 5, null, 3.68), '$3.68 of $5.00');
  assert.equal(panelMoneyWithDraft(3.68, false, null, null, 5), '$3.68 of $5.00');
});

test('the run.log line (userrun.js) passes the run\'s number so its sum is written', () => {
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');
  assert.match(src, /moneyWithDraft\(spendCore, legDraftSpentUsd, spec\.budgetUsd, legDraftSpendComplete, je\?\.spentUsd \?\? null\)/);
});
