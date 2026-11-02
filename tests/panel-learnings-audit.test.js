// Audit tab, the folds that show the learnings and the memory where they were passed on: the page-eval of learningsFoldEl / memoFoldEl / appendHanded. The block is a REAL
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

/** the page's fold builders over a fresh fake document */
function page() {
  const document = { getElementById: () => null, createElement: (t) => mk(t) };
  // eslint-disable-next-line no-new-func
  return new Function('document', `${['escapeXml', 'auditCaret', 'glyphClass', 'stateDotHTML', 'learnRow', 'learnHintLabel', 'handedFold', 'memoFoldEl', 'learningsFoldEl', 'appendHanded'].map(fnSrc).join('\n')}\nreturn { learningsFoldEl, memoFoldEl, appendHanded };`)(document);
}

/** a header button's innerHTML as plain text (tags dropped, entities left as written) */
const plain = (el) => el.innerHTML.replace(/<[^>]*>/g, '');

/** the real aurora ledger (typecheck seen 5x, no-suppressions seen 2x) plus one never-fixed lesson: a real 3-hint block */
function realBlock() {
  const WF = 'aurora-u-spawner-types';
  let L = emptyLedger();
  const NOW = new Date('2099-01-01T00:00:00Z');
  for (const id of ['ms2c0ls7', 'ms7flkok', 'mszi97jd', 'ms2ddxjc', 'mszcfaof']) {
    L = countLedger(L, { runid: id, cards: cardsOf(id).cards, workflow: WF, place: '/p/aurora', workflowKey: 'k1', trust: 'deterministic', now: new Date(cardsOf(id).cards[0].at) });
  }
  // the archived aurora cards predate the stored diff: give the typecheck row one (an edit, said so) so What changed has lines to carry
  L = { ...L, rows: L.rows.map((r) => (r.sample.check === 'typecheck' && r.sample.kind === 'FIXED'
    ? { ...r, sample: { ...r.sample, whatChanged: { files: [{ diff: 'diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -1,2 +1,6 @@\n-old line\n+new one\n+new two\n+new three\n+new four\n context' }] } } }
    : r)) };
  const stuck = cardsOf('mshcpdg4').cards;
  L = countLedger(L, { runid: 'mshcpdg4', cards: stuck, workflow: WF, place: '/p/aurora', workflowKey: 'k1', trust: 'deterministic', now: new Date(stuck[0].at) });
  const lastAt = L.rows.map((r) => r.lastSeen).sort().at(-1);
  return { ledger: L, r: renderHints(L, { workflow: WF, place: '/p/aurora', workflowKey: 'k1', now: new Date(new Date(lastAt).getTime() + 86_400_000) }) };
}
const record = (phase, r) => ({ phase, text: r.text, chars: r.text.length, ids: r.ids, hints: parseHintBlock(r.text) });

test('the learnings fold counts the hints in the block HANDED at that injection', () => {
  const { r } = realBlock();
  const { learningsFoldEl } = page();
  const fold = learningsFoldEl(record('draft', r), '', 'audit-learnings-3-draft');
  assert.equal(plain(fold.find('audit-learnings-3-draft-toggle')), `\u25B6learnings Learnings the planner got (draft) · ${r.ids.length} hints`);
});

test('the fold is ONE box like the other Audit folds: one toggle button, body hidden until clicked, then every hint at once, no inner toggles', () => {
  const { r } = realBlock();
  const { learningsFoldEl } = page();
  const fold = learningsFoldEl(record('draft', r), '', 'f');
  assert.equal(fold.className, 'handed-fold');
  const btn = fold.find('f-toggle');
  const wrapBody = fold.find('f-body');
  const list = wrapBody.children[0];
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(wrapBody.hidden, true, 'body hidden by default');
  assert.ok(!/<details/.test(PAGE.slice(PAGE.indexOf('function handedFold('), PAGE.indexOf('function appendHanded('))), 'no bare <details>');
  assert.match(PAGE, /stateDotHTML\(glyphClass\(failed \? "\\u2717" : "\\u2713"\), "learnings", testid \+ "-state"\)/);
  assert.equal(btn.innerHTML.match(/^<span class="audit-caret">\u25B6<\/span>(<span class="step-state" data-testid="f-state"><span class="dot green"><\/span><b class="st-word">learnings<\/b><\/span>) /)?.length, 2, 'dot green + st-word learnings in a step-state span');
  btn.click();
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(wrapBody.hidden, false, 'click opens the body');
  assert.ok(plain(btn).startsWith('\u25BClearnings Learnings the planner got'));
  btn.click();
  assert.equal(wrapBody.hidden, true);
  assert.ok(plain(btn).startsWith('\u25B6learnings Learnings the planner got'), 'arrow back to closed');
  const hints = list.all().filter((c) => /^audit-learnings-hint-draft-\d+$/.test(c.attrs['data-testid']));
  assert.equal(hints.length, r.ids.length, 'all hints are in the DOM at once');
  assert.ok(!list.all().some((e) => e.tag === 'button' || e.className.includes('audit-part')), 'no inner toggles or boxes');
  assert.ok(!list.all().some((e) => ['input', 'textarea'].includes(e.tag)));
  assert.match(list.children[0].textContent, /^Read-only\. Given to the planner at the draft \([\d,]+ characters\)\. No worker sees it\.$/);
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
  const never = hints.find((h) => /never fixed$/.test(tb(h).children[0].children[0].textContent));
  assert.ok(never, 'the block holds a never-fixed hint');
  assert.deepEqual(tb(never).children.slice(1).map((row) => row.children[0].textContent), ['It said:']);
  assert.ok(!/\.lh-/.test(PAGE), 'the old .lh-* free-row styles are gone');
});

test('the bottom "What the planner was told" box is gone: no #audit-learnings element, no renderAuditLearnings, so no text shows twice', () => {
  assert.ok(!/id="audit-learnings/.test(PAGE), 'no bottom box markup');
  assert.ok(!/renderAuditLearnings/.test(PAGE), 'no renderer for it');
  assert.ok(!PAGE.includes('What the planner was told from earlier runs'));
});

test('a first-replan record is its own fold on the replan part, with the replan test ids and wording', () => {
  const { r } = realBlock();
  const { learningsFoldEl } = page();
  const fold = learningsFoldEl(record('replan', r), '', 'audit-learnings-5-replan');
  assert.match(plain(fold.find('audit-learnings-5-replan-toggle')), /Learnings the planner got \(first replan\)/);
  assert.match(fold.find('audit-learnings-5-replan-body').children[0].children[0].textContent, /^Read-only\. Given to the planner at the first replan/);
  const h = fold.find('audit-learnings-hint-replan-1');
  assert.ok(h && h.className === 'audit-table-scroll');
  assert.equal(h.children[0].children[0].children[1].children[0].textContent, 'It said:');
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

test('a learnings file that could not be read shows ONE plain line in a red fold titled "No lessons were given to the planner"', () => {
  const { learningsFoldEl } = page();
  const line = 'The learnings file could not be read, so no lessons were given: /h/learnings.json is not readable JSON (parse error) — fix or remove it';
  const fold = learningsFoldEl(null, line, 'e');
  const btn = fold.find('e-toggle');
  assert.equal(plain(btn), '\u25B6learnings No lessons were given to the planner');
  assert.deepEqual(btn.innerHTML.match(/<span class="dot (\w+)"><\/span><b class="st-word">(\w+)<\/b>/)?.slice(1), ['red', 'learnings']);
  assert.equal(fold.find('e-error').textContent, line);
});

test('hints handed: green dot, the word stays "learnings", and an error beside hints keeps the hints title', () => {
  const { r } = realBlock();
  const { learningsFoldEl } = page();
  const fold = learningsFoldEl(record('draft', r), 'both at once (not expected)', 'g');
  const btn = fold.find('g-toggle');
  assert.deepEqual(btn.innerHTML.match(/<span class="dot (\w+)"><\/span><b class="st-word">(\w+)<\/b>/)?.slice(1), ['green', 'learnings']);
  assert.ok(plain(btn).includes('Learnings the planner got'));
});

// ── the memory fold ─────────────────────────────────────────────────────────────────────────────────
test('memo fold: closed by default; opened it shows the exact text in a pre via textContent (markup stays literal); header counts chars and says "cut at cap"', () => {
  const { memoFoldEl } = page();
  const text = '== What earlier workers in this run did ==\n<b>not markup</b> & more';
  const fold = memoFoldEl({ text, chars: text.length, capped: true }, 'Try 2', 'm');
  const btn = fold.find('m-toggle');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(fold.find('m-body').hidden, true);
  assert.equal(plain(btn), `\u25B6Try 2 · Memory this worker got (${text.length} chars, cut at cap)`);
  const pre = fold.find('m-text');
  assert.equal(pre.tag, 'pre');
  assert.equal(pre.textContent, text);
  assert.equal(pre.html, undefined, 'never set through innerHTML');
  btn.click();
  assert.equal(fold.find('m-body').hidden, false);
  assert.ok(plain(btn).startsWith('\u25BCTry 2'));
  const src = fnSrc('memoFoldEl');
  assert.ok(!/memo\.text[^;\n]*innerHTML|innerHTML[^;\n]*memo\.text/.test(src), 'the memo text is never routed through innerHTML');
  assert.match(PAGE, /\.handed-text\{[^}]*white-space:pre-wrap;[^}]*overflow-wrap:anywhere;[^}]*overflow:auto/, 'wraps inside its own box: no horizontal page scroll');
});

test('memo fold: an older run (no text) is one plain line "not saved (older run)", not a fold', () => {
  const { memoFoldEl } = page();
  const line = memoFoldEl({ missing: true, chars: 2726, capped: false }, 'Try 1', 'm');
  assert.equal(line.className, 'hint');
  assert.equal(line.textContent, 'Try 1 · Memory this worker got: not saved (older run)');
  assert.equal(line.all().length, 0);
});

test('appendHanded: one fold per try that has a memo, in try order, the fix part labelled by iteration, then the learnings; a try without a memo adds nothing', () => {
  const { appendHanded } = page();
  const body = mk();
  const m = (t) => ({ text: t, chars: t.length, capped: false });
  appendHanded(body, { kind: 'step', attempts: [{ n: 1, memo: m('a') }, { n: 2, memo: null }, { n: 3, memo: m('c') }] }, 4);
  assert.deepEqual(body.children.map((c) => c.attrs['data-testid']), ['audit-memo-4-1', 'audit-memo-4-3']);
  assert.deepEqual(body.children.map((c) => plain(c.find(`${c.attrs['data-testid']}-toggle`)).split(' · ')[0]), ['\u25B6Try 1', '\u25B6Try 3']);
  const fixBody = mk();
  appendHanded(fixBody, { kind: 'fix', attempts: [{ n: 1, source: 'outer-close', memo: null }, { n: 2, iteration: 1, memo: m('x') }] }, 9);
  assert.equal(plain(fixBody.children[0].find('audit-memo-9-2-toggle')).split(' · ')[0], '\u25B6Fix try 1');
  const { r } = realBlock();
  const pb = mk();
  appendHanded(pb, { kind: 'plan', attempts: [], learnings: record('draft', r) }, 1);
  assert.deepEqual(pb.children.map((c) => c.attrs['data-testid']), ['audit-learnings-1-draft']);
  const none = mk();
  appendHanded(none, { kind: 'scout', attempts: [] }, 0);
  assert.equal(none.children.length, 0);
});

