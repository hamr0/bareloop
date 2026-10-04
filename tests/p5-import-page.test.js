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
  appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
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

// the page's import-view functions against the fake DOM; `renderRun` / `getJSON` / `renderAudit` are the page's own
// run renderers, replaced by recorders (the real renderRun is exercised by the panel-page tests and the live panel)
function importHarness({ currentImportId = 'aaaaaaaaaaaa', getJSON = () => Promise.reject(new Error('no fetch')) } = {}) {
  const els = {};
  const get = (id) => els[id] ?? (els[id] = el());
  const doc = { getElementById: get };
  const calls = { jobs: [], clicks: [], runs: [], audits: [], fetched: [] };
  get('tab-run').click = () => calls.clicks.push('tab-run');
  const names = ['escapeXml', 'panelMoney', 'importedHeader', 'importedNoLog', 'paintImportedRun', 'paintImportedRunPlain', 'renderImportView'];
  // eslint-disable-next-line no-new-func
  const api = new Function('document', 'reuseImportedWorkflow', 'renderJob', 'renderRun', 'renderAudit', 'getJSON', 'currentImportId',
    `var currentRunid = null;\n${names.map(fnSrc).join('\n')}\nreturn {render: renderImportView, rid: function(){ return currentRunid; }};`)(
    doc, () => {}, (j) => calls.jobs.push(j), (d) => calls.runs.push(d), (r) => calls.audits.push(r),
    (u) => { calls.fetched.push(u); return getJSON(u); }, currentImportId);
  return { els, calls, ...api };
}
const BASE_VIEW = {
  ok: true, id: 'aaaaaaaaaaaa', job: 'fix-types', status: 'ok', statusText: null, importedAt: '2026-10-02T10:00:00.000Z',
  goal: 'Make types clean', checkType: 'deterministic', success: 'a · b', guardrails: 'write fence — src/**', model: 'deepseek-flash',
  budgetUsd: 1.5, maxWallMs: 1_800_000, history: { greens: 3, reds: 1, total: 4, recent: [{ at: '2026-09-05T00:00:00Z', outcome: 'green', costUsd: 2 }] },
  approved: false, approvedText: 'not approved on this machine yet — it has never run green here', runsHere: 0, run: { kind: 'none' },
};

test('page: an imported job opens in the SAME Run / Audit / Job tabs — ONE [Reuse workflow] in the top action row, then the IMPORTED box (runs here, exported with its recent runs, this machine), then the run below; the Job tab carries the spec', () => {
  const h = importHarness();
  h.render(BASE_VIEW);
  const html = h.els['import-view'].innerHTML;
  assert.match(html, /^<div class="run-actions" data-testid="run-actions-import"><button class="btn" type="button" data-testid="btn-reuse-import">Reuse workflow<\/button><\/div><div class="summary-box imported-box"/);
  for (const need of ['runs here:', 'none yet', 'exported:', '3 green · 1 not green', '2026-09-05 · green · $2.00', 'this machine:', 'not approved on this machine yet']) assert.ok(html.includes(need), `IMPORTED box shows: ${need}`);
  assert.ok(html.indexOf('exported:') < html.indexOf('2026-09-05 · green') && html.indexOf('2026-09-05 · green') < html.indexOf('this machine:'), 'the recent runs sit under "exported:"');
  assert.equal((html.match(/<button/g) ?? []).length, 1, 'exactly one button');
  assert.doesNotMatch(html, /Start from this|>Run</);
  assert.doesNotMatch(html, /import-view-changed/);
  assert.equal(h.els['import-view'].hidden, false);
  assert.equal(h.els['run-empty'].hidden, true);
  assert.deepEqual(h.calls.clicks, ['tab-run']);
  assert.equal(h.els['active-wf-verdict'].textContent, 'imported · view only');
  // the Job tab is the same renderJob every run uses, fed the exported spec
  assert.equal(h.calls.jobs.length, 1);
  const j = h.calls.jobs[0];
  assert.deepEqual([j.goal, j.checkType, j.success, j.guardrails, j.model, j.budgetUsd, j.maxWallMs], ['Make types clean', 'deterministic', 'a · b', 'write fence — src/**', 'deepseek-flash', 1.5, 1_800_000]);
  // never job details in the Run tab
  assert.doesNotMatch(html, /Make types clean|write fence/);
});

test('page: a changed folder puts the one code-owned line INSIDE the IMPORTED box; an unreadable import says so and empties the Job tab', () => {
  const LINE = 'files changed since you imported it — Reuse is off. Import it again if the change was yours.';
  const h = importHarness();
  h.render({ ...BASE_VIEW, status: 'changed', statusText: 'changed since import', changedLine: LINE, history: { greens: 0, reds: 0, recent: [] } });
  const html = h.els['import-view'].innerHTML;
  assert.match(html, /imp-bad" data-testid="import-view-changed">files changed since you imported it — Reuse is off\. Import it again if the change was yours\.</);
  assert.ok(html.indexOf('imported-box') < html.indexOf('import-view-changed'), 'inside the box, not above it');
  h.render({ ok: false, error: 'folder not found' });
  assert.match(h.els['import-view'].innerHTML, /folder not found/);
  assert.equal(h.calls.jobs.at(-1), null);
  assert.doesNotMatch(fnSrc('renderImportView'), /rp-tabrow|right-pane-body/);
  assert.match(PAGE, /<section id="panel-run"[^>]*>\s*<div class="import-view" id="import-view"/, 'the import summary lives inside the Run tab');
});

test('page: no green run → SUMMARY says so plainly, no counters, no map, no cards, no log', () => {
  const h = importHarness();
  h.render(BASE_VIEW);
  assert.match(h.els['run-summary'].innerHTML, /data-testid="import-no-green">no green run in this bundle</);
  assert.equal(h.els['run-content'].hidden, false);
  assert.equal(h.els['run-counters'].hidden, true);
  assert.equal(h.els['map-box'].hidden, true);
  assert.equal(h.els['step-list'].innerHTML, '');
  assert.equal(h.els['audit-body'].hidden, true);
  assert.equal(h.els['audit-select-empty'].textContent, 'no log — this job ran on another machine');
  assert.deepEqual(h.calls.runs, [], 'no run renderer call');
  assert.match(h.els['import-view'].innerHTML, /shown below:.*no green run/);
});

test('page: bridge only → the bridge detail goes through the SAME renderRun; the Audit says no log; zero steps reads "no steps recorded"; no step cards', () => {
  const h = importHarness();
  const detail = { fromBridge: true, runid: 'r1', parts: [{ label: 'a' }], steps: [], spentUsd: 2 };
  h.render({ ...BASE_VIEW, run: { kind: 'bridge', runid: 'r1', at: '2026-09-05T00:00:00.000Z', detail } });
  assert.deepEqual(h.calls.runs, [detail]);
  assert.equal(h.els['audit-body'].hidden, true);
  assert.equal(h.els['audit-select-empty'].textContent, 'no log — this job ran on another machine');
  assert.equal(h.els['step-list'].innerHTML, '', 'no per-step cards: the bridge carries no per-step figures');
  assert.equal(h.els['run-content'].hidden, false);
  assert.equal(h.els['run-actions'].hidden, true, 'no Stop/Resume/Reuse bar from the run renderer');
  assert.equal(h.els['run-counters'].hidden, true, 'the SUMMARY headline already says it');
  assert.match(h.els['import-view'].innerHTML, /shown below:.*the exported green run r1, 2026-09-05/);
  const h2 = importHarness();
  h2.render({ ...BASE_VIEW, run: { kind: 'bridge', runid: 'r1', at: '2026-09-05T00:00:00.000Z', detail: { ...detail, parts: [] } } });
  assert.equal(h2.els['map-box'].hidden, false);
  assert.match(h2.els['map-mount'].innerHTML, /data-testid="import-no-steps">no steps recorded</);
});

test('page: spine present → the run is fetched through the ordinary /api/runs routes, painted by renderRun without an Ended block or actions, its Audit by renderAudit; the Audit tab reads the same run id', async () => {
  const detail = { runid: 'aaaaaaaaaaaa~muo1jah4', glyph: '✓', ended: { reason: 'x', actions: [{ id: 'reuse' }] }, resume: { a: 1 }, live: true, parts: [{}] };
  const audit = { rows: [{}], reason: null };
  const h = importHarness({ getJSON: (u) => Promise.resolve(u.endsWith('/audit') ? audit : detail) });
  h.render({ ...BASE_VIEW, runsHere: 1, run: { kind: 'spine', id: 'aaaaaaaaaaaa~muo1jah4', runid: 'muo1jah4', at: '2026-09-30T11:48:05.358Z' } });
  await new Promise((r) => { setTimeout(r, 10); });
  assert.deepEqual(h.calls.fetched.sort(), ['/api/runs/aaaaaaaaaaaa~muo1jah4', '/api/runs/aaaaaaaaaaaa~muo1jah4/audit']);
  assert.equal(h.rid(), 'aaaaaaaaaaaa~muo1jah4');
  assert.equal(h.calls.runs.length, 1);
  assert.equal(h.calls.runs[0].ended, null, 'an imported run offers no Ended block (no Resume, no second Reuse button)');
  assert.equal(h.calls.runs[0].live, false);
  assert.deepEqual(h.calls.audits, [audit]);
  assert.equal(h.els['run-actions'].hidden, true);
  assert.equal(h.els['run-counters'].hidden, true);
  assert.equal(h.els['run-content'].hidden, false);
  assert.equal(h.els['active-wf-name'].textContent, 'fix-types', 'the header keeps the job name, not the long run id');
  assert.match(h.els['import-view'].innerHTML, /1 run</);
  assert.match(h.els['import-view'].innerHTML, /shown below:.*latest green run here, muo1jah4/);
});

test('page: a spine that cannot be read says so in the SUMMARY box (no crash); a view for another import is ignored', async () => {
  const h = importHarness({ getJSON: () => Promise.reject(new Error('HTTP 404')) });
  h.render({ ...BASE_VIEW, run: { kind: 'spine', id: 'aaaaaaaaaaaa~x', runid: 'x', at: null } });
  await new Promise((r) => { setTimeout(r, 10); });
  assert.match(h.els['run-summary'].innerHTML, /could not read this run: HTTP 404/);
  const h2 = importHarness({ currentImportId: 'bbbbbbbbbbbb', getJSON: () => Promise.resolve({ glyph: '✓' }) });
  h2.render({ ...BASE_VIEW, run: { kind: 'spine', id: 'aaaaaaaaaaaa~x', runid: 'x', at: null } });
  await new Promise((r) => { setTimeout(r, 10); });
  assert.deepEqual(h2.calls.runs, [], 'the person moved on: a late answer paints nothing');
});

test('page: renderRun reads "not recorded" — never 0 or a live floor — for the numbers a bridge-only detail lacks', () => {
  const src = fnSrc('renderRun');
  assert.match(src, /var isLiveNoEnd = !detail\.died && detail\.spentUsd === null && detail\.fromBridge !== true;/);
  assert.match(src, /typeof detail\.budgetUsd !== "number"\) \? "" : \(" of "/, 'no "of <cap>" when the bridge carries no cap');
  assert.match(src, /"time not recorded"/);
  assert.match(src, /detail\.fromBridge === true \? "not recorded" : "none started"/);
  assert.match(src, /bridgeToolsLine\(detail\.toolsUsed\)/);
  assert.match(PAGE, /\.summary-box\.imported-box::before\{content:"┤ IMPORTED ├";\}/);
  assert.match(fnSrc('hideImportView'), /run-counters"\)\.hidden = false/, 'a normal run brings the counters back');
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

// hamr's click-through 2026-10-04 (demo panel 4712), item 1.
test('page: [Go] on a refused path SHOWS why — the error sits right under the path row, above the (scrolling) folder list, never below it', () => {
  const at = (id) => PAGE.indexOf(`id="${id}"`);
  assert.ok(at('import-err') !== -1 && at('import-entries') !== -1);
  assert.ok(at('import-path') < at('import-err'), 'error is after the path box');
  assert.ok(at('import-err') < at('import-resolved'), 'error is above "showing …" and the list: below a 240px list it is off screen and [Open] reads as doing nothing');
  assert.ok(at('import-err') < at('import-entries'));
});

test('page: Import and Cancel are the same .btn height (Cancel is not .small)', () => {
  const tag = (id) => PAGE.slice(PAGE.lastIndexOf('<button', PAGE.indexOf(`id="${id}"`)), PAGE.indexOf('>', PAGE.indexOf(`id="${id}"`)));
  assert.doesNotMatch(tag('import-cancel'), /small/);
  assert.doesNotMatch(tag('import-go'), /small/);
});

// hamr's click-through 2026-10-04, item 1: the way up is a bold `..`, never a row that reads like a folder to import.
test('page: the way up is a bold ".." (still clickable, aria-labelled), not a folder-looking row; no arrow glyphs', () => {
  const src = fnSrc('importLoadDir');
  assert.match(src, /up\.textContent = "\.\."/);
  assert.doesNotMatch(src, /textContent = "up one folder"/);
  assert.doesNotMatch(src, /▲|▸/);
  assert.match(PAGE, /\.import-up\{font-weight:700;\}/);
  assert.match(src, /importLoadDir\(r\.parent\)/);
});

// hamr's click-through 2026-10-04, item 2: the button is [Go].
test('page: the path-row button reads Go (not Open)', () => {
  const i = PAGE.indexOf('id="import-open"');
  const tag = PAGE.slice(PAGE.lastIndexOf('<button', i), PAGE.indexOf('</button>', i));
  assert.match(tag, />Go$/);
  assert.doesNotMatch(tag, /Open/);
});

// hamr's click-through 2026-10-04, item 3: the list is bundles only; a click selects one for [Import]; the empty and capped lines are plain.
test('page: the list shows job bundles with their relative path, a click selects one into the path box, and the empty/capped lines are plain words', () => {
  const src = fnSrc('importLoadDir');
  assert.match(src, /importPathEl\.value = e\.path/);
  assert.match(src, /no job bundles here \(searched ' \+ r\.depth \+ ' folders deep\)/);
  assert.match(src, /stopped after ' \+ r\.visited \+ ' folders .{0,8}go into a narrower folder/);
  assert.doesNotMatch(src, /importLoadDir\(r\.path\.replace/, 'a bundle row no longer navigates into a folder');
  assert.doesNotMatch(src, /no folders here/);
});

// hamr's click-through 2026-10-04, item 4: IMPORTED showed "$0.22" (the exported bridge's green, run muo0txge) while the
// SUMMARY showed "$0.15" (the bundle's spine run muo1jah4) — two different runs, neither line said which.
test('page: each exported-history line in the IMPORTED box names its run, so a price there is never read as the SUMMARY run\'s', () => {
  assert.match(PAGE, /" · run " \+ r\.runid/);
});

test('page: a selected bundle row draws its border INSIDE the scrolling list (first, middle and last row all show top and bottom)', () => {
  // cause: the old selected mark was `outline` (drawn outside the box); the list clips overflow, so the last row's bottom edge was cut
  const entry = PAGE.match(/\.import-entry\{[^}]*\}/)[0];
  const sel = PAGE.match(/\.import-entry\.selected\{[^}]*\}/)[0];
  assert.match(entry, /border:1px solid transparent/, 'every row owns a border box, so selecting never shifts layout');
  assert.match(sel, /border-color:var\(--accent\)/);
  assert.doesNotMatch(sel, /outline/, 'an outline sits outside the box and is clipped by the list');
  assert.match(PAGE.match(/\.import-entries\{[^}]*\}/)[0], /padding:2px/, 'room so no row touches the clip edge');
});
