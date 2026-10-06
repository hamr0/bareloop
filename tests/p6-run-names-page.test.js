// PANEL-BUILD.md P6 item 7 — the page shows `job (run-N)` wherever a run is named; N comes from the server (`runNo`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
const mk = (id) => ({
  id, hidden: false, className: '', innerHTML: '', textContent: '', style: {}, attrs: {}, classList: { add() {}, remove() {} },
  setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute() {}, addEventListener() {}, appendChild() {}, querySelector() { return mk('q'); }, querySelectorAll() { return []; },
});
const RUN = {
  runid: 'mujjtrvd', runNo: 3, job: 'my-job', glyph: '✗', status: { sign: '✗', word: 'failed' }, endedLine: 'checks said no', checkType: 'deterministic',
  spentUsd: 3.5, spendComplete: true, wallMs: 600000, date: '2026-10-04', resumedCount: 0, died: false,
};

function rowBuilder() {
  const names = ['escapeXml', 'runLabel', 'runName', 'glyphClass', 'statusWordHtml', 'panelMoney', 'panelMoneyWithDraft', 'liveSpendText', 'liveWallPhrase', 'duration', 'rowIsLive', 'rowWallText', 'rowSpendText', 'resumedTagHtml', 'buildRunRowEl'];
  // eslint-disable-next-line no-new-func
  return new Function('document', 'selectRun', 'scrollRunIntoViewMobile', `var currentRunid = null;\n${names.map(fnSrc).join('\n')}\nreturn buildRunRowEl;`)(
    { createElement: () => mk('r'), getElementById: () => mk('x') }, () => {}, () => {});
}

test('run names: the History card and an expanded row read run-N, never the run id', () => {
  const card = rowBuilder()(RUN).innerHTML;
  assert.match(card, /my-job \(run-3\)/);
  assert.doesNotMatch(card.replace(/data-testid="[^"]*"/g, ''), /mujjtrvd/);
  const compact = rowBuilder()(RUN, true).innerHTML;
  assert.match(compact, /run-3 · \$3\.50/);
  assert.doesNotMatch(compact.replace(/data-testid="[^"]*"/g, ''), /mujjtrvd/);
});

test('run names: a run with no number (an imported bundle run) falls back to its id', () => {
  assert.match(rowBuilder()({ ...RUN, runNo: undefined, runid: 'imp~r9' }).innerHTML, /my-job \(imp~r9\)/);
});

test('run names: the right-side header reads job (run-N) on every branch of renderRun', () => {
  const els = {};
  const document = { getElementById: (id) => els[id] ?? (els[id] = mk(id)), createElement: () => mk('c') };
  const stubs = ['buildOrderedBoxes', 'stepNumberIndices'].map((n) => `function ${n}(){return [];}`)
    .concat(['renderStepMap', 'partResultGlyph', 'partLine1Text', 'toolBreakdownLine', 'modelLine', 'toolsLine', 'cacheLine', 'paintOfferedRow', 'offeredLine', 'renderAuditGroups', 'renderJob', 'applyAuditFilter', 'renderRunActions']
      .map((n) => `function ${n}(){return "";}`)).join('\n');
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `
    var lastEndedSig = null; var lastJobToolsList = null;
    ${stubs}
    ${['escapeXml', 'runLabel', 'runName', 'glyphClass', 'statusWordHtml', 'fmtLocalDateTime', 'setRunHeader', 'liveStepText', 'runHeaderBody', 'panelMoney', 'panelMoneyWithDraft', 'duration', 'liveSpendText', 'liveWallPhrase', 'realSteps', 'renderEnded', 'renderRun'].map(fnSrc).join('\n')}
    return renderRun;
  `)(document);
  render({ ...RUN, steps: [], parts: [], ended: null, model: null, budgetUsd: 8 });
  assert.equal(els['active-wf-name'].textContent, 'my-job (run-3)');
  render({ runid: 'mujjtrvd', runNo: 3, job: 'my-job', fileMissing: true });
  assert.equal(els['active-wf-name'].textContent, 'my-job (run-3)');
});

test('run names: the workflow row names its latest run run-N; Resume and Reuse texts keep the real id', () => {
  assert.match(PAGE, /var wfFullName = runName\(g\.job, g\.lastRunNo, g\.lastRunid\);/);
  assert.match(PAGE, /lastRunNo: last\.runNo,/);
  assert.ok(PAGE.includes("Resume run ' + escapeXml(m.runid)"));
  assert.match(PAGE, /"latest green run here, " \+ \(run\.runid/);
  assert.match(PAGE, /" · run " \+ r\.runid/);
});
