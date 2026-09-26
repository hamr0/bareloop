// F-panel-chip-collision: hamr's live-panel feedback (2026-09-25 verbatim,
// commit 8d2bf42) — History filter chips "need two clicks to work" and
// "clear doesn't work". Root cause: the Audit tab's generic chip wiring
// (`src/panel/index.html`, originally `document.querySelectorAll(".chip")`)
// was UNSCOPED and its selector also matched the History filter bar's chip
// buttons, because both bars reused the bare `.chip` class. A second click
// listener ended up bound on every History chip; it unconditionally forced
// that chip's `aria-pressed` back to "true" after every click, masking the
// correct internal-state toggle the History-specific handler had already
// performed.
//
// The fix scopes the audit tab to `.chip[data-filter]` (its own chips'
// only attribute) and the shared filter-bar component to
// `.filterbar[data-scope="..."] .chip[data-filter-group]` (its own
// attribute, never present on audit chips) — structurally disjoint, not
// just carefully non-overlapping by accident.
//
// item 2 (2026-09-26 merge): History and Workflows merged into ONE left
// "Runs" tab sharing ONE filter-bar instance (scope "runs" — the old
// separate "history"/"workflows" scopes are gone), plus a THIRD chip group
// for the [Workflows]/[History] view toggle itself
// (`.chip[data-runs-view]`) — also structurally disjoint from the other
// two, so this file now proves all THREE chip-wiring groups never collide,
// not just two.
//
// This test extracts the REAL wiring code straight out of the page's own
// inline <script> (never a reimplementation) and drives it against a tiny
// hand-rolled fake DOM (no jsdom — no new dependency, per LIBRARY_CONVENTIONS
// one-dep budget). The fake DOM implements just enough of
// querySelectorAll/classList/addEventListener/getAttribute/setAttribute to
// run the extracted source unmodified.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(HERE, '..', 'src', 'panel', 'index.html');

/** Pulls the filter-bar factory, the runs-view-toggle wiring, and the
 * Audit tab's chip-filter wiring out of the page's own source text,
 * verbatim, byte for byte. */
function extractChipWiringSource() {
  const html = readFileSync(PAGE_PATH, 'utf8');

  const startA = html.indexOf('function filterBarHTML(scope){');
  const endA = html.indexOf('// item 4: phone-only');
  assert.ok(startA !== -1 && endA !== -1 && endA > startA, 'expected the filter-bar component plus the runs-view-toggle wiring in src/panel/index.html');
  const regionA = html.slice(startA, endA);

  const startB = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const endB = html.indexOf('// ---- Job tab ----');
  assert.ok(startB !== -1 && endB !== -1 && endB > startB, 'expected the Audit tab chip-filter block in src/panel/index.html');
  const regionB = html.slice(startB, endB);

  return 'var auditRowEls = [];\n' + regionA + '\n' + regionB;
}

/** Matches one compound selector piece like ".chip[data-filter]" or
 * ".filterbar[data-scope=\"runs\"]" against a {classes, attrs} bag. */
function matchesCompound(classes, attrs, compound) {
  const classNames = [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attrPairs = [...compound.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
  for (const c of classNames) if (!classes.has(c)) return false;
  for (const [, name, val] of attrPairs) {
    if (!(name in attrs)) return false;
    if (val !== undefined && attrs[name] !== val) return false;
  }
  return true;
}

/** A fake DOM element: just enough surface for the extracted code. `parent`
 * is the (single, synthetic) ancestor used for descendant-selector matching. */
function makeEl({
  tag = 'button', classes = [], attrs = {}, parent = null,
} = {}) {
  const el = {
    tag,
    classes: new Set(classes),
    attrs: { ...attrs },
    parent,
    style: {},
    hidden: false,
    listeners: [],
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    click() { this.listeners.filter((l) => l.type === 'click').forEach((l) => l.fn.call(this)); },
  };
  el.classList = { contains: (c) => el.classes.has(c) };
  return el;
}

/** A tiny selector engine covering exactly the shapes this page uses for
 * chip wiring: a bare compound ('.chip[data-filter]') or a two-part
 * descendant selector ('.filterbar[data-scope="runs"] .chip[data-filter-group]'). */
function makeFakeDocument(elements) {
  return {
    querySelectorAll(selector) {
      const parts = selector.trim().split(/\s+/);
      if (parts.length === 1) return elements.filter((el) => matchesCompound(el.classes, el.attrs, parts[0]));
      const [ancestorPart, elPart] = parts;
      return elements.filter((el) => el.parent && matchesCompound(el.parent.classes, el.parent.attrs, ancestorPart) && matchesCompound(el.classes, el.attrs, elPart));
    },
    getElementById(id) {
      const found = elements.find((el) => el.attrs.id === id);
      if (found) return found;
      // The filter-bar anchor div gets filterBarHTML() assigned to its
      // innerHTML in the real page; the fixture already pre-builds the
      // chips that markup would produce, so a no-op sink here is enough —
      // this test covers the WIRING, filterBarHTML's own markup is covered
      // separately in panel-page.test.js.
      if (id.endsWith('-filterbar-anchor')) return { set innerHTML(_v) {} };
      return null;
    },
  };
}

function makeFixtureElements() {
  const runsBar = makeEl({ tag: 'div', classes: ['filterbar'], attrs: { 'data-scope': 'runs' } });
  const detChip = makeEl({ classes: ['chip', 'fchip'], attrs: { 'data-filter-group': 'checkType', 'data-filter-value': 'deterministic', 'aria-pressed': 'false' }, parent: runsBar });
  const allTimeChip = makeEl({ classes: ['chip', 'fchip'], attrs: { 'data-filter-group': 'time', 'data-filter-value': 'all', 'aria-pressed': 'true' }, parent: runsBar });
  const clearBtn = makeEl({ classes: ['chip', 'fchip'], attrs: { id: 'runs-filter-clear' }, parent: runsBar });
  const auditAll = makeEl({ classes: ['chip'], attrs: { 'data-filter': 'all', 'aria-pressed': 'true' } });
  const auditWrites = makeEl({ classes: ['chip'], attrs: { 'data-filter': 'write', 'aria-pressed': 'false' } });
  const countEl = makeEl({ tag: 'div', attrs: { id: 'runs-filter-count' } });
  // the [Workflows]/[History] view toggle — its own chip group, disjoint
  // from both the audit chips and the filter-bar's own chips (item 2 merge)
  const wfViewChip = makeEl({ classes: ['chip'], attrs: { 'data-runs-view': 'workflows', 'aria-pressed': 'true' } });
  const histViewChip = makeEl({ classes: ['chip'], attrs: { 'data-runs-view': 'history', 'aria-pressed': 'false' } });
  const wfList = makeEl({ tag: 'div', attrs: { id: 'wf-list' } });
  const historyList = makeEl({ tag: 'div', attrs: { id: 'history-list' } });
  const elements = [
    detChip, allTimeChip, clearBtn, auditAll, auditWrites, countEl,
    wfViewChip, histViewChip, wfList, historyList,
  ];
  return {
    elements, detChip, clearBtn, auditAll, wfViewChip, histViewChip,
  };
}

function runWiring(elements) {
  const src = extractChipWiringSource();
  const fakeDocument = makeFakeDocument(elements);
  const fakeLocalStorage = {
    store: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
    setItem(k, v) { this.store[k] = String(v); },
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'localStorage', 'renderHistory', 'renderWorkflows', 'filterRuns', 'groupRunsByJob', 'filterWorkflows', `
    ${src}
    return { runsFilterBar: runsFilterBar };
  `);
  return factory(
    fakeDocument,
    fakeLocalStorage,
    function () {},
    function () {},
    function (runs) { return runs; },
    function (runs) { return runs; },
    function (jobs) { return jobs; },
  );
}

test('F-panel-chip-collision RED: no unscoped ".chip" selector left in src/panel/index.html (audit-tab wiring must be scoped, e.g. ".chip[data-filter]")', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const unscopedChipSelectorCount = (html.match(/document\.querySelectorAll\("\.chip"\)/g) || []).length;
  assert.equal(unscopedChipSelectorCount, 0, 'an unscoped ".chip" selector would also bind to the filter-bar/runs-view-toggle chips, which share the bare .chip class');
});

test('F-panel-chip-collision: clicking a Runs filter-bar checkType chip toggles it OFF on the very next click (no phantom stuck-on from the audit tab\'s wiring)', () => {
  const { elements, detChip } = makeFixtureElements();
  const api = runWiring(elements);

  detChip.click();
  assert.equal(api.runsFilterBar.getState().checkTypes.includes('deterministic'), true, 'first click should turn the filter on');
  assert.equal(detChip.getAttribute('aria-pressed'), 'true');

  detChip.click();
  assert.equal(api.runsFilterBar.getState().checkTypes.includes('deterministic'), false, 'second click should turn the filter back off in state');
  assert.equal(detChip.getAttribute('aria-pressed'), 'false', 'the chip must visually show OFF after the second click, not stay stuck pressed=true from a leaked audit-tab handler');
});

test('F-panel-chip-collision: the Runs filter-bar chip, the audit chip, and the runs-view-toggle chip each receive exactly ONE click listener (no leak between any of the three chip groups)', () => {
  const {
    elements, detChip, auditAll, wfViewChip, histViewChip,
  } = makeFixtureElements();
  runWiring(elements);
  assert.equal(detChip.listeners.filter((l) => l.type === 'click').length, 1, 'filter-bar chip should have exactly one click listener');
  assert.equal(auditAll.listeners.filter((l) => l.type === 'click').length, 1, 'Audit chip should have exactly one click listener (its own, only)');
  assert.equal(wfViewChip.listeners.filter((l) => l.type === 'click').length, 1, 'Workflows view-toggle chip should have exactly one click listener');
  assert.equal(histViewChip.listeners.filter((l) => l.type === 'click').length, 1, 'History view-toggle chip should have exactly one click listener');
});

test('F-panel-chip-collision: the Runs filter-bar "clear" button resets state and repaints a stuck-pressed chip back to off in one click', () => {
  const { elements, detChip, clearBtn } = makeFixtureElements();
  const api = runWiring(elements);

  detChip.click(); // turn a filter on
  assert.equal(api.runsFilterBar.getState().checkTypes.length, 1);

  clearBtn.click();
  assert.deepEqual(api.runsFilterBar.getState(), {
    checkTypes: [], results: [], time: 'all', search: '',
  });
  assert.equal(detChip.getAttribute('aria-pressed'), 'false', 'clear must visibly un-press every chip it turned off in state');
});

test('item 2: clicking the History view-toggle chip flips runsViewMode and re-presses the toggle chips (never touching the filter-bar\'s OWN chip group)', () => {
  const { elements, detChip, histViewChip, wfViewChip } = makeFixtureElements();
  runWiring(elements);

  histViewChip.click();
  assert.equal(histViewChip.getAttribute('aria-pressed'), 'true');
  assert.equal(wfViewChip.getAttribute('aria-pressed'), 'false');
  // the filter-bar's own chip group is untouched by a view-toggle click
  assert.equal(detChip.getAttribute('aria-pressed'), 'false');
});
