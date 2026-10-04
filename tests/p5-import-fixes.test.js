// hamr's click-through 2026-10-04, items A1-A4 (Import browser). Page functions extracted from src/panel/index.html
// against a tiny fake DOM (same posture as p5-import-page.test.js); server pieces against a scratch home.
import { test, after } from 'node:test';
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
  innerHTML: '', hidden: false, textContent: '', value: '', className: '', children: [], listeners: {}, attrs: {},
  appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
  addEventListener(t, f) { this.listeners[t] = f; }, classList: { toggle() {}, remove() {}, add() {} },
  insertAdjacentHTML(_w, h) { this.innerHTML += h; }, querySelectorAll() { return []; },
});

function browseHarness(replies) {
  const els = {};
  const get = (id) => els[id] ?? (els[id] = el());
  const doc = { getElementById: get, createElement: () => el() };
  const queue = [...replies];
  const err = get('import-err');
  const importShowErr = (m) => { err.textContent = m; err.hidden = !m; };
  // eslint-disable-next-line no-new-func
  const importLoadDir = new Function('document', 'authorGet', 'importPathEl', 'importShowErr', 'escapeXml', 'rememberImportDir',
    `${fnSrc('importLoadDir')}\nreturn importLoadDir;`)(doc, () => Promise.resolve(queue.shift()), get('import-path'), importShowErr, (x) => x, () => {});
  return { els, importLoadDir };
}
const GOOD = { ok: true, path: '/h/jobs', requested: '/h/jobs', parent: '/h', bundle: false, depth: 3, entries: [{ name: 'a.bareloop', path: '/h/jobs/a.bareloop', bundle: true }] };

test('A1: a refused path after a good one clears the list and the "showing" line — only the error remains; a later good path restores the list and clears the error', async () => {
  const h = browseHarness([GOOD, { ok: false, error: 'no such folder: /nope' }, GOOD]);
  await h.importLoadDir('/h/jobs');
  assert.match(h.els['import-resolved'].textContent, /^showing \/h\/jobs/);
  assert.ok(h.els['import-entries'].children.length > 0);
  await h.importLoadDir('/nope');
  assert.equal(h.els['import-resolved'].textContent, '', 'no stale "showing" line');
  assert.equal(h.els['import-entries'].innerHTML, '');
  assert.equal(h.els['import-err'].textContent, 'no such folder: /nope');
  assert.equal(h.els['import-err'].hidden, false);
  await h.importLoadDir('/h/jobs');
  assert.equal(h.els['import-err'].hidden, true);
  assert.match(h.els['import-resolved'].textContent, /^showing \/h\/jobs/);
});

test('A2: the path textbox uses the theme\'s normal input background token (editable look), not the grey panel fill', () => {
  const rule = PAGE.match(/\.import-pathrow input\{[^}]*\}/)[0];
  const base = PAGE.match(/\n  input,select\{[^}]*\}/)[0];
  const bg = (s) => s.match(/background:([^;}]+)/)[1];
  assert.equal(bg(rule), bg(base), 'same token as every other input');
  assert.doesNotMatch(rule, /var\(--panel\)/);
});

// ── A3: one row per folder ───────────────────────────────────────────────────────────────────────────────────
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPanelServer } from '../src/panel/server.js';
import { readImports, importsPath, importId } from '../src/panel/importroutes.js';
import { exportFixtureBundle } from './bundle-fixture.js';

/** @type {string[]} */ const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); tmps.push(d); return d; };

test('A3: re-importing an already-imported folder UPDATES its row (one line in imports.jsonl, one row listed), and the POST names the folder just imported', async (t) => {
  const home = tmp('a3-cfg-');
  const userHome = tmp('a3-user-');
  const bundleDir = join(userHome, 'jobs', 'fix.bareloop');
  mkdirSync(join(userHome, 'jobs'), { recursive: true });
  exportFixtureBundle(bundleDir);
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, userHome });
  t.after(() => close());
  const call = (m, p, body) => fetch(`http://127.0.0.1:${port}${p}`, {
    method: m, headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
  const first = await call('POST', '/api/imports', { path: bundleDir });
  await new Promise((r) => { setTimeout(r, 15); });
  const second = await call('POST', '/api/imports', { path: bundleDir });
  assert.equal(second.id, first.id);
  assert.equal(second.id, importId(bundleDir));
  const lines = readFileSync(importsPath(home), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1, 'one row per folder in the file');
  const list = await call('GET', '/api/imports');
  assert.equal(list.imports.length, 1);
  assert.equal(list.imports[0].id, second.id);
});

test('A3: existing duplicate rows (same folder, even through a symlink) list ONCE, newest wins; another folder keeps its own row', () => {
  const home = tmp('a3-cfg2-');
  const real = tmp('a3-real-');
  const other = tmp('a3-other-');
  const link = join(tmp('a3-links-'), 'ln');
  symlinkSync(real, link);
  const row = (dir, at, job) => JSON.stringify({ at, dir, job, bundleHash: 'h' });
  const file = importsPath(home);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, [row(real, '2026-10-04T10:00:00.000Z', 'old'), row(other, '2026-10-04T11:00:00.000Z', 'o'),
    row(link, '2026-10-04T12:00:00.000Z', 'new'), row(real, '2026-10-04T09:00:00.000Z', 'older')].join('\n') + '\n');
  const list = readImports(home);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((r) => r.job), ['new', 'o']);
});

test('A3: after [Import] the job just imported is opened AND scrolled into view (the closing import box must not leave the pane parked on the list\'s end)', () => {
  const calls = [];
  const row = { scrollIntoView: (o) => calls.push(o) };
  // eslint-disable-next-line no-new-func
  const reveal = new Function('document', `${fnSrc('revealImportRow')}\nreturn revealImportRow;`)(
    { querySelector: (q) => { calls.push(q); return row; } });
  reveal('abc123abc123');
  assert.equal(calls[0], '[data-testid="import-row-abc123abc123"]');
  assert.deepEqual(calls[1], { block: 'nearest' });
  const go = PAGE.slice(PAGE.indexOf('document.getElementById("import-go").addEventListener'));
  const body = go.slice(0, go.indexOf('\n  });'));
  assert.match(body, /selectImport\(res\.body\.id\)/);
  assert.match(body, /revealImportRow\(res\.body\.id\)/, 'the import button reveals the row it just opened');
});

// ── A4: remember the last folder ─────────────────────────────────────────────────────────────────────────────
function storeHarness(storage) {
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', `var IMPORT_DIR_KEY = ${PAGE.match(/var IMPORT_DIR_KEY = ("[^"]+");/)[1]};\n${fnSrc('rememberImportDir')}\n${fnSrc('recallImportDir')}\nreturn {rememberImportDir, recallImportDir};`)(storage);
}

test('A4: the last folder is remembered in localStorage and recalled; with no value it falls back to "" (home)', () => {
  const data = {};
  const h = storeHarness({ getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } });
  assert.equal(h.recallImportDir(), '');
  h.rememberImportDir('/h/jobs');
  assert.equal(h.recallImportDir(), '/h/jobs');
});

test('A4: a throwing / missing localStorage never breaks the browser (every read and write is in try/catch)', () => {
  const boom = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const h = storeHarness(boom);
  assert.doesNotThrow(() => h.rememberImportDir('/x'));
  assert.equal(h.recallImportDir(), '');
});

test('A4: a good listing remembers its folder, and opening the box uses the remembered folder, falling back to home when it is gone', async () => {
  const seen = [];
  const h = browseHarness([GOOD]);
  // the remembered-folder write happens in importLoadDir
  const els = h.els;
  let remembered = null;
  const doc = { getElementById: (id) => els[id] ?? (els[id] = el()), createElement: () => el() };
  // eslint-disable-next-line no-new-func
  const load = new Function('document', 'authorGet', 'importPathEl', 'importShowErr', 'escapeXml', 'rememberImportDir',
    `${fnSrc('importLoadDir')}\nreturn importLoadDir;`)(doc, (u) => { seen.push(u); return Promise.resolve(GOOD); }, doc.getElementById('import-path'), () => {}, (x) => x, (p) => { remembered = p; });
  assert.equal(await load('/h/jobs'), true);
  assert.equal(remembered, '/h/jobs');
  const open = PAGE.slice(PAGE.indexOf('document.getElementById("wf-import").addEventListener'));
  const body = open.slice(0, open.indexOf('\n  });'));
  assert.match(body, /importPathEl\.value \|\| recallImportDir\(\)/);
  assert.match(body, /importLoadDir\(""\)/, 'a remembered folder that is gone falls back to home');
});

// ── B5: buttons only in the Run tab's top action row ─────────────────────────────────────────────────────────
test('B5: the page builds [Stop] / [Resume] / [Reuse workflow] in renderRunActions (and the imported action row) and nowhere else', () => {
  const buttons = [...PAGE.matchAll(/data-testid="(btn-stop|btn-resume-run|btn-resume|btn-reuse-ended|btn-reuse|btn-reuse-import)"/g)];
  const where = (idx) => {
    const before = PAGE.slice(0, idx);
    const m = [...before.matchAll(/\n  function (\w+)\(/g)].pop();
    return m ? m[1] : null;
  };
  for (const m of buttons) {
    if (!/^<button|'<button/.test(PAGE.slice(PAGE.lastIndexOf('<button', m.index) - 1, PAGE.lastIndexOf('<button', m.index) + 7))) continue;
    assert.ok(['renderRunActions', 'renderImportView'].includes(where(m.index)), `${m[1]} is built in ${where(m.index)}`);
  }
  assert.doesNotMatch(fnSrc('renderEnded'), /<button/);
  assert.doesNotMatch(PAGE, /btn-reuse-ended/);
});
