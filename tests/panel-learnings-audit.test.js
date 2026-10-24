// Audit tab, "What the planner was told from earlier runs": the page-eval of renderAuditLearnings. The block is a REAL
// renderHints output (the real aurora ledger, src/learn.js), split by the server's reader (parseHintBlock); the page's own
// functions are extracted verbatim and run against a small fake DOM that records children, attributes and clicks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emptyLedger, countLedger, renderHints, parseHintBlock } from '../src/learn.js';
import { cardsOf } from './learn-fixtures.js';

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

/** a fake element: children, attributes, listeners, click() */
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

/** the page's renderAuditLearnings over a fresh fake document; returns the pieces */
function page() {
  const els = { 'audit-learnings': mk(), 'audit-learnings-list': mk(), 'audit-learnings-summary': mk('button') };
  els['audit-learnings-summary'].attrs['aria-expanded'] = 'false';
  els['audit-learnings-list'].hidden = true;
  const document = { getElementById: (id) => els[id] ?? null, createElement: (t) => mk(t) };
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `${['escapeXml', 'auditCaret', 'glyphClass', 'stateDotHTML', 'learnRow', 'learnHintLabel', 'renderAuditLearnings'].map(fnSrc).join('\n')}\nreturn renderAuditLearnings;`)(document);
  return { els, render };
}

/** a header button's innerHTML as plain text (tags dropped, entities left as written) */
const plain = (el) => el.innerHTML.replace(/<[^>]*>/g, '');

/** the real aurora ledger (typecheck seen 5x, no-suppressions seen 2x) plus one never-fixed lesson: a real 3-hint block */
function realBlock() {
  const WF = 'aurora-u-spawner-types';
  let L = emptyLedger();
  const NOW = new Date('2099-01-01T00:00:00Z');
  for (const id of ['ms2c0ls7', 'ms7flkok', 'mszi97jd', 'ms2ddxjc', 'mszcfaof']) {
    L = countLedger(L, { runid: id, cards: cardsOf(id).cards, workflow: WF, place: '/p/aurora', specHash: 'h1', trust: 'deterministic', now: new Date(cardsOf(id).cards[0].at) });
  }
  // the archived aurora cards predate the stored diff: give the typecheck row one (an edit, said so) so What changed has lines to carry
  L = { ...L, rows: L.rows.map((r) => (r.sample.check === 'typecheck' && r.sample.kind === 'FIXED'
    ? { ...r, sample: { ...r.sample, whatChanged: { files: [{ diff: 'diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -1,2 +1,6 @@\n-old line\n+new one\n+new two\n+new three\n+new four\n context' }] } } }
    : r)) };
  const stuck = cardsOf('mshcpdg4').cards;
  L = countLedger(L, { runid: 'mshcpdg4', cards: stuck, workflow: WF, place: '/p/aurora', specHash: 'h1', trust: 'deterministic', now: new Date(stuck[0].at) });
  const lastAt = L.rows.map((r) => r.lastSeen).sort().at(-1);
  return { ledger: L, r: renderHints(L, { workflow: WF, place: '/p/aurora', specHash: 'h1', now: new Date(new Date(lastAt).getTime() + 86_400_000) }) };
}
const record = (phase, r) => ({ phase, text: r.text, chars: r.text.length, ids: r.ids, hints: parseHintBlock(r.text) });

test('the header counts the hints HANDED to the planner (the block), not the ledger rows', () => {
  const { ledger, r } = realBlock();
  assert.ok(r.ids.length >= 2, 'the real block holds hints');
  // the ledger holds MORE rows than the block was handed: the count must not follow the ledger
  const padded = { ...record('draft', r), ids: [...r.ids, 'x1', 'x2', 'x3', 'x4', 'x5'] };
  assert.ok(ledger.rows.length >= r.ids.length);
  const { els, render } = page();
  render({ learnings: [padded] });
  assert.equal(plain(els['audit-learnings-summary']), `\u25B6learnings What the planner was told from earlier runs · ${r.ids.length} hints`);
  assert.equal(els['audit-learnings'].hidden, false);
  render({ learnings: [] });
  assert.equal(els['audit-learnings'].hidden, true, 'nothing handed = section hidden');
});

test('the section is ONE .audit-part box like the other Audit sections: one toggle button, body hidden until clicked, then every hint at once, no inner toggles', () => {
  const { r } = realBlock();
  const { els, render } = page();
  render({ learnings: [record('draft', r)] });
  assert.match(PAGE, /<div id="audit-learnings" class="audit-part"[^>]*hidden>\s*<button type="button" id="audit-learnings-summary" class="btn audit-part-toggle" aria-expanded="false"[^>]*>[^<]*<\/button>\s*<div id="audit-learnings-list" class="audit-part-body"[^>]*hidden><\/div>/);
  assert.ok(!/<details id="audit-learnings"/.test(PAGE), 'no bare <details>');
  const btn = els['audit-learnings-summary'];
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(els['audit-learnings-list'].hidden, true, 'body hidden by default');
  // the header wears the SAME `[sign] word` state markup as the schedule/step headers (stateDotHTML + glyphClass), sign ✓ word "learnings"
  assert.match(PAGE, /stateDotHTML\(glyphClass\("\\u2713"\), "learnings", "audit-learnings-state"\)/);
  assert.match(PAGE, /stateDotHTML\(glyphClass\(sec\.sign\), sec\.word, "audit-schedule-state"\)/, 'the schedule header uses the same helper');
  assert.equal(btn.innerHTML.match(/^<span class="audit-caret">\u25B6<\/span>(<span class="step-state" data-testid="audit-learnings-state"><span class="dot green"><\/span><b class="st-word">learnings<\/b><\/span>) /)?.length, 2, 'dot green + st-word learnings in a step-state span');
  btn.click();
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(els['audit-learnings-list'].hidden, false, 'click opens the body');
  assert.ok(plain(btn).startsWith('\u25BClearnings What the planner was told'));
  btn.click();
  assert.equal(els['audit-learnings-list'].hidden, true);
  assert.ok(plain(btn).startsWith('\u25B6learnings What the planner was told'), 'arrow back to closed');
  btn.click();
  const list = els['audit-learnings-list'];
  const hints = list.children.filter((c) => /^audit-learnings-hint-draft-\d+$/.test(c.attrs['data-testid']));
  assert.equal(hints.length, r.ids.length, 'all hints are in the DOM at once');
  assert.ok(!list.all().some((e) => e.tag === 'button' || e.className.includes('audit-part')), 'no inner toggles or boxes');
  assert.ok(!list.find('audit-learnings-raw-draft') && !list.find('audit-learnings-text'), 'no raw-text fold');
  assert.ok(!list.all().some((e) => ['input', 'textarea'].includes(e.tag)));
  assert.match(list.children[0].textContent, /^Read-only\. Given to the planner at the draft \([\d,]+ characters\)\. No worker sees it\.$/);
  // each hint is ONE rounds-table in an audit-table-scroll (the schedule body's look): a bold title row, then label | value rows
  const tb = (h) => h.children[0].children[0];
  assert.ok(hints.every((h) => h.className === 'audit-table-scroll' && h.children[0].tag === 'table' && h.children[0].className === 'rounds-table'));
  const first = hints[0];
  const titleCell = tb(first).children[0].children[0];
  assert.equal(titleCell.attrs.colspan, '2');
  assert.match(titleCell.style.cssText, /font-weight:600/);
  assert.match(titleCell.textContent, /^1 · this job · seen \d+ times · \S+ · .*(fixed|never fixed)$/);
  const rows = tb(first).children.slice(1);
  assert.ok(rows.every((tr) => tr.tag === 'tr' && tr.children[0].className === 'hint' && /nowrap/.test(tr.children[0].style.cssText) && /pre-wrap/.test(tr.children[1].style.cssText)));
  assert.deepEqual(rows.map((row) => row.children[0].textContent), ['It said:', 'Fix touched:', 'What changed:']);
  assert.equal(rows[2].children[1].textContent, '-old line\n+new one\n+new two\n(+2 more)');
  // a never-fixed hint says so, and has only It said
  const never = hints.find((h) => /never fixed$/.test(tb(h).children[0].children[0].textContent));
  assert.ok(never, 'the block holds a never-fixed hint');
  assert.deepEqual(tb(never).children.slice(1).map((row) => row.children[0].textContent), ['It said:']);
  assert.ok(!/\.lh-/.test(PAGE), 'the old .lh-* free-row styles are gone');
});

test('a first-replan record renders a sub-heading and its hints in the same table look, inside the same fold', () => {
  const { r } = realBlock();
  const { els, render } = page();
  render({ learnings: [record('draft', r), record('replan', r)] });
  const list = els['audit-learnings-list'];
  assert.equal(list.find('audit-learnings-group-draft').textContent, 'At the draft');
  assert.equal(list.find('audit-learnings-group-replan').textContent, 'At the first replan');
  const h = list.find('audit-learnings-hint-replan-1');
  assert.ok(h && h.className === 'audit-table-scroll');
  assert.equal(h.children[0].children[0].children[1].children[0].textContent, 'It said:');
  assert.ok(!list.find('audit-learnings-raw-replan'));
  assert.equal(plain(els['audit-learnings-summary']), `\u25B6learnings What the planner was told from earlier runs · ${r.ids.length} hints`, 'the same hints handed at draft and replan count once');
});

test('parseHintBlock reads back what renderHints wrote: every hint, its fields, the same count as ids', () => {
  const { r } = realBlock();
  const hints = parseHintBlock(r.text);
  assert.equal(hints.length, r.ids.length);
  assert.deepEqual(hints.map((h) => h.n), r.ids.map((_, i) => i + 1));
  const tc = hints.find((h) => h.check === 'typecheck');
  assert.ok(tc && tc.level === 'this job' && tc.count === 5 && tc.fixed === true && tc.kinds.length >= 1);
  assert.ok(hints.some((h) => !h.fixed && h.touched === null && h.changed.length === 0), 'a never-fixed hint has no fix lines');
  // the fields re-assemble into the lines the block holds: nothing dropped, nothing invented
  for (const h of hints) {
    if (h.said) assert.ok(r.text.includes(`   It said: ${h.said}`));
    if (h.touched) assert.ok(r.text.includes(`   Fix touched: ${h.touched}`));
    for (const c of h.changed) assert.ok(r.text.includes(c));
  }
  assert.deepEqual(parseHintBlock(''), []);
});

// Hints 1 and 3 copied verbatim from a real archived run's spine record (run mvkj03w7; hint 2 and some What-changed lines left out), for the long What-changed shape.
const REAL_MVKJ = [
  'Hints from earlier runs, copied by code from recorded runs (not instructions; the close alone judges):',
  '1. [this job, seen 2 times] check "no-suppressions" (no casts or silencers added) failed on [cast] in src/checks.js; fixed later in the same run.',
  '   It said: [cast] checks.js:61: const cause = /** @type {NodeJS.ErrnoException} */ (err);',
  '   Fix touched: checks.js',
  '   What changed: +/**',
  '                 +* A caught value\'s string `code` (net/fs errors set one), else \'\'. Read through',
  '                 +* an `in` guard so the caught `unknown` is narrowed, never asserted.',
  '                 (+18 more)',
  '3. [this job, seen 1 time] check "tree-changed" (did the step change a file in its scope) failed; fixed later in the same run.',
  '   It said: 0 files changed under src/** \u2014 the tree is byte-identical to the step start (an identical re-write is not a change)',
  '   Fix touched: src/checks.js',
].join('\n');

test('parseHintBlock on a real archived block: levels, counts, check, codes, fixed, long What changed', () => {
  const [a, b] = parseHintBlock(REAL_MVKJ);
  assert.deepEqual({ n: a.n, level: a.level, count: a.count, check: a.check, kinds: a.kinds, fixed: a.fixed, touched: a.touched, moreChanged: a.moreChanged }, { n: 1, level: 'this job', count: 2, check: 'no-suppressions', kinds: ['[cast]'], fixed: true, touched: 'checks.js', moreChanged: 18 });
  assert.equal(a.changed.length, 3);
  assert.deepEqual({ n: b.n, count: b.count, check: b.check, kinds: b.kinds }, { n: 3, count: 1, check: 'tree-changed', kinds: [] });
});

test('the header counts DISTINCT hints across draft and replan: a replan block with an extra hint adds it', () => {
  const { r } = realBlock();
  const replan = { ...record('replan', r), hints: [...parseHintBlock(r.text), { ...parseHintBlock(r.text)[0], n: r.ids.length + 1 }], ids: [...r.ids, 'extra-row'] };
  const { els, render } = page();
  render({ learnings: [record('draft', r), replan] });
  assert.equal(plain(els['audit-learnings-summary']), `\u25B6learnings What the planner was told from earlier runs · ${r.ids.length + 1} hints`);
});
