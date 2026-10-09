// P5-R — the PAGE side of "one run, one id, one file": the card tag, the Audit leg divider, the map's dotted
// connector. Same posture as the other page tests: the page's own functions are extracted VERBATIM from
// src/panel/index.html and run against a tiny hand-rolled fake DOM (no jsdom, one-dependency budget).
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

// ---------------------------------------------------------------- the card
test('page: a resumed run is ONE card with a small "resumed ×N" tag — on the history row and the sub-card (not the workflow card)', () => {
  // eslint-disable-next-line no-new-func
  const { resumedTagHtml } = new Function(`${fnSrc('escapeXml')}\n${fnSrc('resumedTagHtml')}\nreturn { resumedTagHtml: resumedTagHtml };`)();
  assert.equal(resumedTagHtml(0, 'x'), '', 'a run nobody resumed carries no tag');
  assert.equal(resumedTagHtml(undefined, 'x'), '');
  assert.match(resumedTagHtml(2, 'hist-resumed-r1'), /data-testid="hist-resumed-r1">resumed &times;2</);
  assert.match(fnSrc('buildRunRowEl'), /resumedTagHtml\(r\.resumedCount, "hist-resumed-" \+ r\.runid\)/, 'the history row builds the tag off the run\'s own count');
  assert.doesNotMatch(fnSrc('renderWorkflows'), /resumedTagHtml/, 'the workflow card drops the tag (hamr 2026-10-06 layout); the history row and the sub-card keep it');
  assert.match(fnSrc('groupRunsByJob'), /lastResumedCount: last\.resumedCount \|\| 0/);
});

// ---------------------------------------------------------------- the map
function loadMap() {
  const start = PAGE.indexOf('function escapeXml');
  const end = PAGE.indexOf('function renderStepMap(');
  assert.ok(start !== -1 && end > start);
  // eslint-disable-next-line no-new-func
  return new Function(`${PAGE.slice(start, end)}\nreturn { buildStepMapHTML: buildStepMapHTML, buildOrderedBoxes: buildOrderedBoxes, stepNumberIndices: stepNumberIndices, stepTitleText: stepTitleText };`)();
}
const stepPart = (n, extra = {}) => ({
  kind: 'step', id: `s${n}`, label: `s${n}`, occurrence: 1, outcome: 'green', blocked: 0, attempts: [{ n: 1, outcome: 'green' }], ...extra,
});

test('page map: the connector from the step a leg ENDED at to the step the next leg picked up is DOTTED and says "resumed"; the others stay solid', () => {
  const { buildStepMapHTML, buildOrderedBoxes } = loadMap();
  const boxes = buildOrderedBoxes([stepPart(1), stepPart(2, { resumedNext: true }), stepPart(3)], false);
  assert.deepEqual(boxes.map((b) => b.resumedNext), [false, true, false]);
  const svg = buildStepMapHTML(boxes, 900);
  const chips = svg.match(/<button [^>]*>/g) ?? [];
  assert.equal(chips.length, 3, 'one chip per step');
  assert.equal(chips.filter((l) => l.includes('resumed-next') && l.includes('data-resumed="1"')).length, 1, 'exactly the leg boundary chip is marked (dotted right edge)');
  assert.doesNotMatch(svg, />resumed</, 'no word drawn beside the chip (hamr 2026-10-05: cramped; the key names it)');
  // a run nobody resumed draws no dotted line and no label
  const plain = buildStepMapHTML(buildOrderedBoxes([stepPart(1), stepPart(2)], false), 900);
  assert.doesNotMatch(plain, /data-resumed|>resumed</);
});

test('page map: the resumed mark survives wrapping — it is a property of the chip, not of where the line breaks', () => {
  const { buildStepMapHTML, buildOrderedBoxes } = loadMap();
  const parts = [1, 2, 3, 4, 5, 6].map((n) => stepPart(n, n === 3 ? { resumedNext: true } : {}));
  const narrow = buildStepMapHTML(buildOrderedBoxes(parts, false));
  assert.equal((narrow.match(/data-resumed="1"/g) ?? []).length, 1);
  assert.equal((narrow.match(/<button /g) ?? []).length, 6);
});

test('page: the sign legend is gone (the line-style key returned 2026-10-04); the dotted edge still names itself "resumed" inside the map', () => {
  assert.doesNotMatch(PAGE, /stepMapLegendHTML|map-legend/);
  assert.match(PAGE, /dotted edge = resumed after/);
  assert.doesNotMatch(PAGE, />resumed<\/text>/, 'no resumed label inside the map');
});

test('page: the "Reuse: job (run …)" origin line is gone — the Reuse workflow radio + the picked box say it once (hamr 2026-10-06)', () => {
  assert.doesNotMatch(PAGE, /chat-startfrom-origin|startfrom-origin|sfOrigin/, 'no second statement of the reuse origin above the card title');
  assert.ok(PAGE.indexOf('id="rw-picked"') > PAGE.indexOf('id="job-card-title"'), 'the picked box sits under Check type, inside the card');
});

// ---------------------------------------------------------------- the Audit divider
function fakeDoc() {
  const mk = (tag) => {
    const el = {
      tag, children: [], attrs: {}, className: '', textContent: '', innerHTML: '', hidden: false, type: '',
      setAttribute(k, v) { el.attrs[k] = v; },
      getAttribute(k) { return el.attrs[k] ?? null; },
      appendChild(c) { el.children.push(c); return c; },
      addEventListener() {},
    };
    return el;
  };
  return { createElement: mk, mk };
}

test('page Audit: legDividerEl paints the server\'s code-owned text between rules; the dividers sit before the part they precede, and the last one closes the list', () => {
  const doc = fakeDoc();
  // eslint-disable-next-line no-new-func
  const legDividerEl = new Function('document', `${fnSrc('legDividerEl')}\nreturn legDividerEl;`)(doc);
  const el = legDividerEl({ leg: 2, text: 'stopped: money cap reached ($8.00) · resumed 2026-10-03 14:10' });
  assert.equal(el.className, 'audit-leg-divider');
  assert.equal(el.attrs['data-testid'], 'audit-leg-divider-2');
  assert.equal(el.textContent, '── stopped: money cap reached ($8.00) · resumed 2026-10-03 14:10 ──');
  const groups = fnSrc('renderAuditGroups');
  assert.match(groups, /dv\.beforePart === idx\) container\.appendChild\(legDividerEl\(dv\)\)/, 'a divider is placed before the part it precedes');
  assert.match(groups, /dv\.beforePart >= boxes\.length\) container\.appendChild\(legDividerEl\(dv\)\)/, 'a leg with no part yet closes the list');
});

test('page Audit (flat): a divider row is placed by time — before the first call made at or after the leg picked up — and never counted as a filterable row', () => {
  const src = fnSrc('renderAudit');
  assert.match(src, /dividerAtMs\(pendingDividers\[0\]\) <= Date\.parse\(r\.time\)/);
  assert.match(src, /tr:not\(\.audit-leg-divider-row\)/, 'the Writes/Blocked chips never hide a divider');
  assert.match(src, /pendingDividers\.forEach\(function\(dv\)\{ tbody\.appendChild\(flatDividerRow\(dv\)\); \}\);/, 'any divider after the last call closes the table');
});

test('page map: a part its leg\'s halt cut off reads STOPPED (the existing state, a red box, no done/check); the step that continues it is "(continued)" and keeps its number; real retries stay "(try N)"', () => {
  const { buildOrderedBoxes, stepNumberIndices, stepTitleText } = loadMap();
  const parts = [
    stepPart(1),
    stepPart(2, { outcome: null, stopReason: 'money cap', attempts: [{ n: 1, outcome: 'stopped' }], resumedNext: true, leg: 1, tryNumber: 1, continued: false }),
    stepPart(2, { occurrence: 2, continued: true, tryNumber: 1, leg: 2 }),
    stepPart(3, { occurrence: 1 }),
    stepPart(3, { occurrence: 2, tryNumber: 2, continued: false }),
  ];
  const boxes = buildOrderedBoxes(parts, false);
  assert.deepEqual(boxes.map((b) => b.state), ['done', 'stopped', 'done', 'done', 'done']);
  assert.equal(boxes[1].attempts[0].outcome, 'stopped');
  const num = stepNumberIndices(boxes);
  assert.deepEqual(num.map((n) => n + 1), [1, 2, 2, 3, 4], 'the continued box repeats its number; the next step carries on from it');
  assert.equal(boxes[2].title, 's2 (continued)');
  assert.equal(boxes[4].title, 's3 (try 2)', 'a retry within a leg is still a try');
  assert.equal(boxes[1].title, 's2');
  assert.doesNotMatch(stepTitleText(num[1], boxes[1]), /✓/);
});

test('page card: the stopped part says why, in words, beside its figures', () => {
  // eslint-disable-next-line no-new-func
  const f = new Function('liveWallPhrase', 'duration', 'liveSpendText', 'panelMoney', 'attemptChecksLine', 'escapeXml', `${fnSrc('partLine1Text')}\nreturn partLine1Text;`)(
    () => '', (ms) => `${ms}ms`, () => '', (n) => `$${n}`, () => '', (x) => x);
  assert.match(f({ kind: 'step', rounds: 1, toolCalls: 2, wallMs: 5, spentUsd: 3, unpricedRounds: 0, attempts: [], stopReason: 'money cap' }, {}), /stopped &mdash; money cap/);
  assert.doesNotMatch(f({ kind: 'step', rounds: 1, toolCalls: 2, wallMs: 5, spentUsd: 3, unpricedRounds: 0, attempts: [] }, {}), /stopped/);
});

// ---------------------------------------------------------------- Workflows sub-card cap (hamr 2026-10-08)
test('page: an expanded job shows at most its latest 7 other runs when no search/filter is active; a selected older run beyond them is appended, never hidden; filters lift the cap', () => {
  // eslint-disable-next-line no-new-func
  const { capSubRuns } = new Function(`var WF_SUB_CAP = 7;\n${fnSrc('capSubRuns')}\nreturn { capSubRuns: capSubRuns };`)();
  const runs = (n) => Array.from({ length: n }, (_, i) => ({ runid: `r${i}` })); // latest first
  assert.equal(PAGE.match(/var WF_SUB_CAP = (\d+);/)[1], '7');
  const few = capSubRuns(runs(7), false, null);
  assert.deepEqual([few.shown.length, few.more], [7, false], '7 other runs look exactly as today');
  const many = capSubRuns(runs(12), false, null);
  assert.deepEqual(many.shown.map((r) => r.runid), ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'], 'the NEWEST seven');
  assert.equal(many.more, true);
  const sel = capSubRuns(runs(12), false, 'r10');
  assert.deepEqual(sel.shown.map((r) => r.runid), ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r10'], 'a selected older run is appended after the 7');
  assert.equal(sel.more, true);
  assert.equal(capSubRuns(runs(12), false, 'r3').shown.length, 7, 'a selected run already inside the 7 adds nothing');
  const filtered = capSubRuns(runs(12), true, null);
  assert.deepEqual([filtered.shown.length, filtered.more], [12, false], 'search/filters active: every matching sub-card, no cap, no line');
  const src = fnSrc('renderWorkflows');
  assert.match(src, /capSubRuns\(childRuns, active, olderSelected\)/);
  assert.match(src, /"wf-older-" \+ g\.job/);
  assert.match(src, /"older: use search\."/);
});
