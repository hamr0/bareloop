// Audit tab (Grouped view): every folded row wears the schedule header's arrow — ▼ open, ▶ closed — at the very start
// of its button text, and it flips on every click. The page's own renderAuditGroups / renderAuditLearnings run against a small fake DOM.

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

function mk(tag = 'div') {
  const el = {
    tag, className: '', hidden: false, textContent: '', style: {}, attrs: {}, children: [], listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { this.listeners[t] = f; },
    click() { (this.onclick ?? this.listeners.click)?.(); },
    find(testid) { return this.all().find((e) => e.attrs['data-testid'] === testid); },
    all() { return this.children.flatMap((c) => [c, ...c.all()]); },
    set innerHTML(v) { this.html = v; if (v === '') this.children = []; }, get innerHTML() { return this.html ?? ''; },
  };
  return el;
}

const OPEN = '<span class="audit-caret">▼</span>';
const CLOSED = '<span class="audit-caret">▶</span>';

function groupsPage(boxes) {
  const els = { 'audit-groups': mk() };
  const document = { getElementById: (id) => els[id] ?? null, createElement: (t) => mk(t) };
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `
    var currentAuditFilter = "all";
    function buildOrderedBoxes(){ return ${JSON.stringify(boxes)}; }
    function stepNumberIndices(b){ return b.map(function(x, i){ return i; }); }
    function stepStateHTML(){ return "STATE"; }
    function partLine1Text(){ return "LINE1"; }
    function partResultGlyph(){ return null; }
    function actorMarkHtml(){ return ""; }
    function partHasWrites(){ return false; }
    function legDividerEl(){ return document.createElement("div"); }
    function loadRounds(){}
    function buildStepFold(){}
    function buildAttemptsList(){}
    function partLine2Text(){ return ""; }
    function applyAuditFilter(){}
    ${['escapeXml', 'auditCaret', 'renderAuditGroups'].map(fnSrc).join('\n')}
    return renderAuditGroups;
  `)(document);
  return { els, render };
}

test('Audit part rows: ▶ while folded, ▼ once opened, flipping on every click; a running part starts open with ▼', () => {
  const boxes = [
    { kind: 'scout', title: 'scout', state: 'done', blocked: 0, part: { kind: 'scout', attempts: [] } },
    { kind: 'step', title: 'build', state: 'running', blocked: 0, part: { kind: 'step', attempts: [] } },
  ];
  const { els, render } = groupsPage(boxes);
  render({ parts: [{}, {}], glyph: '▶', died: false });
  const closed = els['audit-groups'].find('audit-part-toggle-0');
  const running = els['audit-groups'].find('audit-part-toggle-1');
  assert.equal(closed.getAttribute('aria-expanded'), 'false');
  assert.ok(closed.innerHTML.startsWith(`${CLOSED}STATE scout`), `closed row starts with the closed arrow: ${closed.innerHTML}`);
  closed.click();
  assert.equal(closed.getAttribute('aria-expanded'), 'true');
  assert.ok(closed.innerHTML.startsWith(`${OPEN}STATE scout`), 'opened row starts with the open arrow');
  assert.ok(closed.innerHTML.endsWith('scout &middot; LINE1'), 'header text after the arrow is unchanged');
  closed.click();
  assert.ok(closed.innerHTML.startsWith(CLOSED), 'closes again');
  assert.equal(running.getAttribute('aria-expanded'), 'true');
  assert.ok(running.innerHTML.startsWith(`${OPEN}STATE`), 'a running part starts open with the open arrow');
  running.click();
  assert.ok(running.innerHTML.startsWith(CLOSED), 'and flips on click');
});

test('Audit learnings button: ▶ folded, ▼ open, same placement', () => {
  const els = { 'audit-learnings': mk(), 'audit-learnings-list': mk(), 'audit-learnings-summary': mk('button') };
  els['audit-learnings-summary'].attrs['aria-expanded'] = 'false';
  els['audit-learnings-list'].hidden = true;
  const document = { getElementById: (id) => els[id] ?? null, createElement: (t) => mk(t) };
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `
    function stateDotHTML(){ return "DOT"; }
    function glyphClass(){ return "green"; }
    function learnRow(){}
    function learnHintLabel(){ return "x"; }
    ${['escapeXml', 'auditCaret', 'renderAuditLearnings'].map(fnSrc).join('\n')}
    return renderAuditLearnings;
  `)(document);
  render({ learnings: [{ phase: 'draft', chars: 10, ids: ['a'], hints: [{ n: 1 }] }] });
  const btn = els['audit-learnings-summary'];
  assert.ok(btn.innerHTML.startsWith(`${CLOSED}DOT What the planner was told`), btn.innerHTML);
  btn.click();
  assert.ok(btn.innerHTML.startsWith(`${OPEN}DOT What the planner was told`), btn.innerHTML);
  btn.click();
  assert.ok(btn.innerHTML.startsWith(CLOSED));
});
