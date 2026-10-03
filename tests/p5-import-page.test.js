// P5 item 4 — the PAGE side of Import (read only). Same posture as p5r-page.test.js: the page's own functions
// extracted from src/panel/index.html against a tiny fake DOM. The server owns every read; the page only paints.
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
const el = () => ({
  innerHTML: '', hidden: false, textContent: '', className: '', children: [], listeners: {}, attrs: {},
  appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; },
  addEventListener(t, f) { this.listeners[t] = f; }, classList: { toggle() {}, remove() {}, add() {} },
  querySelector() { return { addEventListener() {} }; },
});

test('page: the imported row carries "imported · view only"; a changed folder shows "changed since import" in the red class; an ok one shows neither', () => {
  const list = el();
  const rows = [];
  const doc = { getElementById: () => list, createElement: () => { const r = el(); rows.push(r); return r; }, querySelectorAll: () => [] };
  // eslint-disable-next-line no-new-func
  const renderImports = new Function('document', 'currentImportId', 'selectImport', 'scrollRunIntoViewMobile', `${fnSrc('escapeXml')}\n${fnSrc('renderImports')}\nreturn renderImports;`)(doc, null, () => {}, () => {});
  renderImports([
    { id: 'aaaaaaaaaaaa', job: 'fix-types', dir: '/h/fix.bareloop', status: 'ok', statusText: null },
    { id: 'bbbbbbbbbbbb', job: 'other', dir: '/h/other.bareloop', status: 'changed', statusText: 'changed since import' },
    { id: 'cccccccccccc', job: 'gone', dir: '/h/gone.bareloop', status: 'missing', statusText: 'folder not found — it was moved or deleted since import' },
  ]);
  assert.equal(rows.length, 3);
  for (const r of rows) assert.match(r.innerHTML, /imported · view only/);
  assert.doesNotMatch(rows[0].innerHTML, /imp-bad/);
  assert.match(rows[1].innerHTML, /class="imp-bad"[^>]*>changed since import</);
  assert.match(rows[2].innerHTML, /imp-bad[^>]*>folder not found/);
  assert.match(PAGE, /\.imp-bad\{color:var\(--red\)/, 'red');
});

test('page: an imported job opens in the SAME Run / Audit / Job tabs — Run says no runs yet and keeps history + approved + ONE Start from this, Audit says no runs, Job carries the spec', () => {
  const els = {};
  const get = (id) => els[id] ?? (els[id] = el());
  const doc = { getElementById: get };
  const jobs = [];
  const clicks = [];
  get('tab-run').click = () => clicks.push('tab-run');
  // eslint-disable-next-line no-new-func
  const render = new Function('document', 'reuseImportedWorkflow', 'renderJob', `${['escapeXml', 'panelMoney'].map(fnSrc).join('\n')}\n${fnSrc('renderImportView')}\nreturn renderImportView;`)(doc, () => {}, (j) => jobs.push(j));
  render({
    ok: true, id: 'aaaaaaaaaaaa', job: 'fix-types', status: 'ok', statusText: null, importedAt: '2026-10-02T10:00:00.000Z',
    goal: 'Make types clean', checkType: 'deterministic', success: 'a · b', guardrails: 'write fence — src/**', model: 'deepseek-flash',
    budgetUsd: 1.5, maxWallMs: 1_800_000, history: { greens: 3, reds: 1, total: 4, recent: [{ at: '2026-09-05T00:00:00Z', outcome: 'green', costUsd: 2 }] },
    approved: false, approvedText: 'not approved on this machine yet — it has never run green here',
  });
  const html = els['import-view'].innerHTML;
  for (const need of ['no runs yet', '3 green · 1 not green', 'not approved on this machine yet']) assert.ok(html.includes(need), `Run tab shows: ${need}`);
  assert.equal(els['import-view'].hidden, false);
  assert.equal(els['run-empty'].hidden, true);
  assert.equal(els['run-content'].hidden, true);
  assert.equal(els['audit-body'].hidden, true);
  assert.equal(els['audit-select-empty'].hidden, false);
  assert.match(els['audit-select-empty'].textContent, /no runs yet/);
  assert.equal(els['active-wf-verdict'].textContent, 'imported · view only');
  assert.deepEqual(clicks, ['tab-run']);
  assert.equal((html.match(/<button/g) ?? []).length, 1, 'exactly one button');
  assert.match(html, /btn-start-from-import">Start from this</);
  assert.doesNotMatch(html, />Run</);
  assert.doesNotMatch(html, /import-view-changed/);
  // the Job tab is the same renderJob every run uses, fed the exported spec
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].goal, 'Make types clean');
  assert.equal(jobs[0].checkType, 'deterministic');
  assert.equal(jobs[0].success, 'a · b');
  assert.equal(jobs[0].guardrails, 'write fence — src/**');
  assert.equal(jobs[0].model, 'deepseek-flash');
  assert.equal(jobs[0].budgetUsd, 1.5);
  assert.equal(jobs[0].maxWallMs, 1_800_000);
  render({ ok: true, id: 'a', job: 'j', status: 'changed', statusText: 'changed since import', history: { greens: 0, reds: 0, recent: [] } });
  assert.match(els['import-view'].innerHTML, /imp-bad" data-testid="import-view-changed">changed since import</);
  // an unreadable import says so and empties the Job tab
  render({ ok: false, error: 'folder not found' });
  assert.match(els['import-view'].innerHTML, /folder not found/);
  assert.equal(jobs.at(-1), null);
  // the page no longer hides the tab row or the tab body for an import
  assert.doesNotMatch(fnSrc('renderImportView'), /rp-tabrow|right-pane-body/);
  assert.match(PAGE, /<section id="panel-run"[^>]*>\s*<div class="import-view" id="import-view"/, 'the import summary lives inside the Run tab');
});

test('page: the Import button lives on the Workflows toolbar, opens the folder browser + paste box, and Import posts the path to the guarded route', () => {
  assert.match(PAGE, /id="wf-import" data-testid="wf-import"/);
  assert.match(PAGE, /id="import-path"/);
  assert.match(PAGE, /authorGet\("\/api\/fs\/list\?path=" \+ encodeURIComponent\(path \|\| ""\)\)/);
  assert.match(PAGE, /authorPost\("\/api\/imports", \{path: importPathEl\.value\}\)/);
  assert.match(fnSrc('paintRunsViewToggle'), /wf-import"\)\.hidden = runsViewMode !== "workflows"/, 'Workflows view only');
  assert.match(fnSrc('selectRun'), /hideImportView\(\)/, 'picking a run brings the run tabs back');
  assert.match(PAGE, /\.import-entries\{[^}]*overflow-x:hidden/, 'no horizontal scroll in the folder list');
});

test('page: Reuse workflow on an imported job asks for the import prefill and hands it to the card with the import id, no run id', async () => {
  const events = [];
  const urls = [];
  // eslint-disable-next-line no-new-func
  const f = new Function('document', 'authorGet', 'CustomEvent', 'window', `${fnSrc('reuseImportedWorkflow')}\nreturn reuseImportedWorkflow;`)(
    { getElementById: () => ({ click() {} }), dispatchEvent: (e) => events.push(e) },
    (u) => { urls.push(u); return Promise.resolve({ ok: true, card: {}, line: 'Same job' }); },
    class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    { alert() {} },
  );
  f('aaaaaaaaaaaa');
  await new Promise((r) => { setTimeout(r, 10); });
  assert.deepEqual(urls, ['/api/author/start-from?import=aaaaaaaaaaaa']);
  assert.equal(events[0].detail.runid, null);
  assert.equal(events[0].type, 'bareloop-reuse');
  assert.equal(events[0].detail.importId, 'aaaaaaaaaaaa');
  assert.match(PAGE, /startFrom = d\.importId \? \{importId: d\.importId\} : \{runid: d\.runid\};/);
});
