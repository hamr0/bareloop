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
    click() { this.listeners.click?.(); },
    find(testid) { return this.all().find((e) => e.attrs['data-testid'] === testid); },
    all() { return this.children.flatMap((c) => [c, ...c.all()]); },
    set innerHTML(v) { if (v === '') this.children = []; }, get innerHTML() { return ''; },
  };
  return el;
}

/** the page's renderAuditLearnings over a fresh fake document; returns the pieces */
function page() {
  const els = { 'audit-learnings': mk(), 'audit-learnings-list': mk(), 'audit-learnings-summary': mk('summary') };
  const document = { getElementById: (id) => els[id] ?? null, createElement: (t) => mk(t) };
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `${['learnFold', 'learnRow', 'learnHintLabel', 'renderAuditLearnings'].map(fnSrc).join('\n')}\nreturn renderAuditLearnings;`)(document);
  return { els, render };
}

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
  assert.equal(els['audit-learnings-summary'].textContent, `What the planner was told from earlier runs · ${r.ids.length} hints`);
  assert.equal(els['audit-learnings'].hidden, false);
  render({ learnings: [] });
  assert.equal(els['audit-learnings'].hidden, true, 'nothing handed = section hidden');
});

test('one folded box per hint, all folded by default, opened on click with It said / Fix touched / What changed', () => {
  const { r } = realBlock();
  const { els, render } = page();
  render({ learnings: [record('draft', r)] });
  const list = els['audit-learnings-list'];
  const boxes = list.children.filter((c) => c.className === 'audit-part' && /^audit-learnings-hint-/.test(c.attrs['data-testid']));
  assert.equal(boxes.length, r.ids.length);
  for (const b of boxes) {
    const [btn, body] = b.children;
    assert.equal(btn.className, 'btn audit-part-toggle');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(body.hidden, true);
    assert.equal(body.children.length, 0, 'folded boxes build nothing until opened');
  }
  const first = boxes[0];
  assert.match(first.children[0].textContent, /^▸ 1 · this job · seen \d+ times · \S+ · .*(fixed|never fixed)$/);
  first.children[0].click();
  assert.equal(first.children[1].hidden, false);
  assert.match(first.children[0].textContent, /^▾ /);
  const rows = first.children[1].children;
  assert.deepEqual(rows.map((row) => row.children[0].textContent), ['It said:', 'Fix touched:', 'What changed:']);
  assert.equal(rows[2].children[1].textContent, '-old line\n+new one\n+new two\n(+2 more)');
  first.children[0].click();
  assert.equal(first.children[1].hidden, true, 'a second click folds it again');
  // a never-fixed hint says so, and has no Fix touched / What changed
  const never = boxes.find((b) => /never fixed$/.test(b.children[0].textContent));
  assert.ok(never, 'the block holds a never-fixed hint');
  never.children[0].click();
  assert.deepEqual(never.children[1].children.map((row) => row.children[0].textContent), ['It said:']);
  // nothing editable: the only buttons are the folds
  assert.ok(list.all().filter((e) => e.tag === 'button').every((e) => e.className === 'btn audit-part-toggle'));
  assert.ok(!list.all().some((e) => ['input', 'textarea'].includes(e.tag)));
});

test('the exact text sits in its own fold, byte for byte', () => {
  const { r } = realBlock();
  const { els, render } = page();
  render({ learnings: [record('draft', r)] });
  const raw = els['audit-learnings-list'].find('audit-learnings-raw-draft');
  assert.equal(raw.children[0].getAttribute('aria-expanded'), 'false');
  assert.match(raw.children[0].textContent, /Exact text the planner got$/);
  raw.children[0].click();
  assert.equal(raw.children[1].children[0].textContent, r.text);
});

test('a first-replan record renders a second group, same style', () => {
  const { r } = realBlock();
  const { els, render } = page();
  render({ learnings: [record('draft', r), record('replan', r)] });
  const list = els['audit-learnings-list'];
  assert.equal(list.find('audit-learnings-group-draft').textContent, 'At the draft');
  assert.equal(list.find('audit-learnings-group-replan').textContent, 'At the first replan');
  assert.ok(list.find('audit-learnings-hint-replan-1'));
  assert.ok(list.find('audit-learnings-raw-replan'));
  assert.equal(els['audit-learnings-summary'].textContent, `What the planner was told from earlier runs · ${r.ids.length} hints`, 'the header counts the draft hints');
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
