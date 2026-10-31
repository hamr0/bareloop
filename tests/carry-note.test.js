// The carry note renderer (src/carrynote.js) and the edit-recency order (src/carrystore.js): pure, no run. Noise dropped but
// counted, rank by times read, "looked here, no fix made" wording, and the diff-first cap order (hamr, 2026-10-30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderEditsByRecency, RED_MARKER } from '../src/carrystore.js';
import { HEADING, CAP, render, similarName, isNonSource, NO_FIX } from '../src/carrynote.js';

test('renderer: noise dropped but counted, rank by times read, wrong-trail wording, fold', () => {
  const ev = (o) => ({ ask: 1, ...o });
  const r = render({
    lastAsk: 2,
    lastTry: { step: 's', kind: 'step', n: 1, of: 2, ended: 'Ran out of calls (4 of 4).', changed: [] },
    events: [
      ev({ tool: 'read', path: 'package.json', lines: 70 }), ev({ tool: 'read', path: 'src', dir: true }), ev({ tool: 'read', path: 'README.md', lines: 9 }),
      ev({ tool: 'read', path: 'src/a.js', lines: 10, noFix: true }), ev({ tool: 'read', path: 'src/b.js', lines: 10 }), ev({ tool: 'read', path: 'src/b.js', lines: 10 }),
      ev({ tool: 'read', path: 'src/c.js', lines: 5, noFix: true }), ev({ tool: 'read', path: 'src/c.js', lines: 5, noFix: true }), ev({ tool: 'read', path: 'src/c.js', lines: 5, noFix: true }),
      ev({ tool: 'read', path: 'src/d.js', lines: 5, noFix: true }), ev({ tool: 'read', path: 'src/d.js', lines: 5, noFix: true }),
      ev({ tool: 'recall', query: 'runMetric', hitPaths: [], hitRanges: [] }), ev({ tool: 'recall', query: 'runMetricsBatch', hitPaths: [], hitRanges: [] }),
    ],
    edits: [],
  });
  assert.ok(r.text.includes('+3 listings/config reads not shown'));
  assert.ok(!r.text.includes('package.json') && !r.text.includes('README'));
  assert.ok(r.text.indexOf('src/b.js') < r.text.indexOf('src/a.js'), 'more reads first');
  assert.ok(r.text.includes('src/c.js (5 lines) · read 3x' + NO_FIX), 'read 3x in a no-fix try: marked');
  assert.ok(/src\/d\.js \(5 lines\) · read 2x\n/.test(r.text), 'read 2x in a no-fix try: no mark');
  assert.ok(/src\/a\.js \(10 lines\) · read 1x\n/.test(r.text) && !/src\/b\.js[^\n]*no fix/.test(r.text));
  assert.ok(r.text.includes('Where earlier workers looked'));
  assert.equal((r.text.match(/recall "/g) ?? []).length, 1);
  assert.ok(r.text.includes('· 1 similar'));
  assert.equal(similarName('runMetric', 'runMetricsBatch'), true);
  assert.equal(similarName('ab', 'abc'), false);
  assert.equal(isNonSource('package-lock.json'), true);
  assert.equal(isNonSource('src/gate.js'), false);
  assert.ok(RED_MARKER.test("Previous attempt failed this step's checks:\nx"));
});

// ---- cap order (hamr, 2026-10-30): files, then searches, then earlier tries, then diff hunks (oldest edit first); diffs last
const NAMES = ['alpha', 'bravo', 'cobalt', 'delta', 'ember', 'falcon', 'garnet', 'harbor', 'iris', 'jasper', 'kestrel', 'lumen', 'marble', 'nectar', 'onyx', 'pylon'];
function capScenario({ nEdits = 3, hunk = 30 } = {}) {
  const events = [];
  NAMES.forEach((n, i) => { for (let k = 0; k <= i % 3; k++) events.push({ ask: 1 + (i % 2), tool: 'read', path: `src/${n}file.js`, lines: 50 + i }); });
  NAMES.forEach((n) => events.push({ ask: 1, tool: 'grep', scope: 'src', pattern: `${n}zzpattern${n}`, matches: 2, firstMatches: ['src/a.js:1'] }));
  const edits = ['aa', 'bb', 'cc', 'dd'].slice(0, nEdits).map((x) => ({ path: `src/edit-${x}.js`, lines: hunk, hunks: Array.from({ length: hunk }, (_, i) => `+${x} line ${i} ${'x'.repeat(8)}`) }));
  // one edited file also appears in "where looked" so the protect rule can be seen
  events.push({ ask: 1, tool: 'read', path: 'src/edit-aa.js', lines: 9 });
  const earlier = [['qwerty', 'uiop', 'asdfgh', 'jklz'], ['zxcvbn', 'mpoi', 'lkjhgf', 'dsaq'], ['plmokn', 'ijbuhv', 'ygctfx', 'rdzesw'], ['nhbgvf', 'cdxsza', 'ewqrty', 'poiuyt']].map((w, i) => `${w.join(' ')} fix loop try ${i + 1}: Changed ${w.join(', ')}.`);
  return { lastAsk: 2, lastTry: { step: 'x', kind: 'fix', n: 1, ended: 'Its check failed.', changed: [] }, events, edits, earlier };
}
const hunkCount = (text, x) => (text.match(new RegExp(`^ {4}\\+${x} line `, 'gm')) ?? []).length;

test('cap order: over cap keeps the full hunk of the newest edit while file and search lines drop', () => {
  const n = capScenario({ nEdits: 2, hunk: 40 });
  const big = render(n, 1e9);
  assert.equal(big.capped, false);
  const r = render(n, CAP / 4); // a cap the scenario exceeds (the default CAP is bigger than this scenario's note)
  assert.equal(r.capped, true);
  assert.ok(r.text.length <= CAP / 4);
  // the newest edit is the LAST in the edits array ('bb'); its whole (40 line) hunk survives, so does the older one's here
  assert.equal(hunkCount(r.text, 'bb'), 40);
  assert.equal(hunkCount(r.text, 'aa'), 40);
  assert.ok(r.sections.reads < big.sections.reads && r.sections.searches < big.sections.searches, 'file and search lines were dropped');
  assert.ok(r.text.includes('lower-ranked not shown)'));
  assert.ok(r.text.includes('Last try: fix loop') && r.text.includes(HEADING));
});

test('cap order: files, then searches, then earlier tries, then hunks (oldest edit first, newest last)', () => {
  const n = capScenario({ nEdits: 3, hunk: 40 });
  const full = render(n, 1e9);
  const seen = [];
  for (let cap = 6000; cap >= 150; cap -= 10) {
    const r = render(n, cap);
    const { reads, searches, earlier } = r.sections;
    const h = ['cc', 'bb', 'aa'].map((x) => hunkCount(r.text, x)); // newest first: array order aa,bb,cc -> cc newest
    seen.push({ cap, reads, searches, earlier, h });
    const anyHunkCut = h.some((c) => c < 40) || r.sections.edits < 3;
    if (anyHunkCut) assert.ok(reads === 0 || r.text.length > 0 && reads <= 1, 'hunks cut only after files gone (edited file may remain? no: it drops last in files, before hunks)');
    if (anyHunkCut) assert.deepEqual([reads, searches, earlier], [0, 0, 0], `cap ${cap}: hunk touched while lines remain`);
    if (earlier < full.sections.earlier) assert.deepEqual([reads, searches], [0, 0], `cap ${cap}: earlier dropped before files/searches`);
    if (searches < full.sections.searches) assert.equal(reads, 0, `cap ${cap}: search dropped before every file line`);
    // newest edit's hunk is never cut while an older edit still has more lines than it
    assert.ok(h[0] >= h[1] && h[1] >= h[2], `cap ${cap}: newest edit must hold at least as many hunk lines as older ones ${h}`);
  }
  assert.ok(seen.some((s) => s.reads > 0 && s.reads < full.sections.reads), 'file-only stage was exercised');
  assert.ok(seen.some((s) => s.reads === 0 && s.searches > 0 && s.searches < full.sections.searches), 'search stage');
  assert.ok(seen.some((s) => s.earlier > 0 && s.earlier < full.sections.earlier), 'earlier stage');
  assert.ok(seen.some((s) => s.h[0] === 12 && s.h[1] === 12 && s.h[2] === 12), 'all hunks shrink to 12 first');
  assert.ok(seen.some((s) => s.h[0] === 12 && s.h[2] === 0), 'older hunk to 0 while newest still shows 12');
  assert.ok(seen.some((s) => s.h[0] < 40 && s.h[0] > 0 && s.h[1] === 0 && s.h[2] === 0), 'newest hunk cut last');
});

test('cap order: the edited file keeps its place longest in "where looked"; earlier tries drop oldest first', () => {
  const n = capScenario({ nEdits: 1, hunk: 5 });
  let last = null;
  for (let cap = 6000; cap >= 400; cap -= 5) {
    const r = render(n, cap);
    const files = r.text.split('\n').filter((l) => /^- src\/\w+file\.js|^- src\/edit-aa\.js \(/.test(l));
    if (files.length) last = files; else break;
  }
  assert.ok(last && last.length === 1 && last[0].startsWith('- src/edit-aa.js'), `last surviving file line: ${last}`);
  let checked = false;
  const r = render(n, 1e9);
  let prev = r.sections.earlier;
  for (let cap = CAP / 4; cap >= 300; cap -= 5) {
    const t = render(n, cap);
    if (t.sections.earlier < prev && t.sections.earlier > 0) {
      const lines = t.text.split('\n').filter((l) => /fix loop try \d/.test(l));
      assert.ok(lines[0].includes('nhbgvf'), `newest earlier try survives first: ${lines[0]}`);
      checked = true; break;
    }
    prev = t.sections.earlier;
  }
  assert.ok(checked, 'the earlier-tries stage was reached');
});

test('cap order: hunks shrink one edit at a time, oldest first, and stop as soon as the note fits', () => {
  const n = capScenario({ nEdits: 3, hunk: 40 }); // edits[] is oldest -> newest: aa, bb, cc
  const seen = [];
  for (let cap = 6000; cap >= 150; cap -= 1) {
    const r = render(n, cap);
    seen.push({ cap, len: r.text.length, h: ['cc', 'bb', 'aa'].map((x) => hunkCount(r.text, x)) }); // newest first
  }
  assert.ok(seen.some((s) => s.h[0] === 40 && s.h[1] === 40 && s.h[2] === 12), 'oldest edit alone at 12, the others full');
  assert.ok(seen.some((s) => s.h[0] === 40 && s.h[1] === 12 && s.h[2] === 12), 'two oldest at 12, newest full');
  assert.ok(seen.some((s) => s.h[0] === 12 && s.h[1] === 12 && s.h[2] === 0 && s.len > 0), 'then to 0 oldest first');
  // no overshoot: a note that fits is not cut further than needed (leaving less than one cut's worth unused)
  const full = render(n, 1e9);
  for (const s of seen.filter((x) => x.cap >= 1500)) assert.ok(s.cap - s.len < full.text.length / 3, `cap ${s.cap} len ${s.len}: over-cut`);
});

test('edit recency: ordered by the latest settled ask whose changed list names the file; never-changed files are oldest', () => {
  const edits = [{ path: 'a.js' }, { path: 'b.js' }, { path: 'c.js' }, { path: 'd.js' }];
  const settled = [{ changed: ['c.js'] }, { changed: ['a.js', 'c.js'] }, { changed: ['b.js'] }];
  assert.deepEqual(orderEditsByRecency(edits, settled).map((e) => e.path), ['d.js', 'a.js', 'c.js', 'b.js']);
  assert.deepEqual(orderEditsByRecency(edits, []).map((e) => e.path), ['a.js', 'b.js', 'c.js', 'd.js'], 'no history: alphabetical order kept');
});

// ---- earlier failures: cut order (hamr, 2026-10-31): files, searches, earlier tries, earlier failures oldest group first, then hunks
test('cap order: earlier failures go after earlier tries, oldest group first, whole group, before any diff hunk', () => {
  const n = capScenario({ nEdits: 2, hunk: 40 });
  const words = ['quokka', 'lemur', 'ibex', 'tapir'];
  n.failures = words.map((w, i) => ({ label: `fix loop try ${i + 1}`, text: `${w} ${w}wall ${w}zone failed\n${w} second line ${w}extra` }));
  const full = render(n, 1e9);
  assert.equal(full.sections.failures, 4);
  assert.ok(full.text.indexOf('Earlier tries (folded):') < full.text.indexOf('Earlier failures (folded):'));
  const seen = [];
  for (let cap = full.text.length; cap >= 150; cap -= 1) {
    const r = render(n, cap);
    seen.push({ f: r.sections.failures, e: r.sections.earlier, h: hunkCount(r.text, 'bb'), text: r.text });
  }
  const gone = seen.filter((s) => s.f < 4 && s.f > 0);
  assert.ok(gone.length, 'the failures stage was reached');
  for (const s of gone) {
    assert.equal(s.e, 0, 'earlier tries are gone before any failure group is');
    assert.equal(s.h, 40, 'no hunk touched while failures are being cut');
    // the survivors are the NEWEST groups; each shown whole (second line travels with its first)
    const shown = words.filter((w) => s.text.includes(`${w} second line`));
    assert.deepEqual(shown, words.slice(4 - s.f));
    for (const w of shown) assert.ok(s.text.includes(`    ${w} ${w}wall ${w}zone failed\n    ${w} second line`));
  }
  assert.ok(seen.some((s) => s.f === 0 && s.h < 40), 'hunks are cut only after the failures are all gone');
});
