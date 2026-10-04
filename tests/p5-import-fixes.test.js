// hamr's click-through 2026-10-04, items A1-A4 (Import browser). Page functions extracted from src/panel/index.html
// against a tiny fake DOM (same posture as p5-import-page.test.js); server pieces against a scratch home.
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
