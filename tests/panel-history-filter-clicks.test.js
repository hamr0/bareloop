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
// only attribute) and the shared filter-bar component (now serving BOTH
// History and Workflows, item 5 layout redesign) to
// `.filterbar[data-scope="..."] .chip[data-filter-group]` (its own
// attribute, never present on audit chips) — the two selectors are now
// structurally disjoint, not just carefully non-overlapping by accident.
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

/** Pulls the filter-bar factory (History + Workflows share it) and the
 * Audit tab's chip-filter wiring out of the page's own source text,
 * verbatim, byte for byte. */
function extractChipWiringSource() {
  const html = readFileSync(PAGE_PATH, 'utf8');

  const startA = html.indexOf('function filterBarHTML(scope){');
  const endA = html.indexOf('// item 4: phone-only');
  assert.ok(startA !== -1 && endA !== -1 && endA > startA, 'expected the filter-bar component (filterBarHTML/createFilterBar) plus its two instances in src/panel/index.html');
  const regionA = html.slice(startA, endA);

  const startB = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const endB = html.indexOf('// ---- Job tab ----');
  assert.ok(startB !== -1 && endB !== -1 && endB > startB, 'expected the Audit tab chip-filter block in src/panel/index.html');
  const regionB = html.slice(startB, endB);

  return 'var auditRowEls = [];\n' + regionA + '\n' + regionB;
}

/** Matches one compound selector piece like ".chip[data-filter]" or
 * ".filterbar[data-scope=\"history\"]" against a {classes, attrs} bag. */
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
function makeEl({ tag = 'button', classes = [], attrs = {}, parent = null } = {}) {
  const el = {
    tag,
    classes: new Set(classes),
    attrs: { ...attrs },
    parent,
    style: {},
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
 * descendant selector ('.filterbar[data-scope="history"] .chip[data-filter-group]'). */
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
      // The two anchor divs (history-filterbar-anchor/workflows-filterbar-anchor)
      // get filterBarHTML() assigned to their innerHTML in the real page;
      // the fixture already pre-builds the chips that markup would produce,
      // so a no-op sink here is enough — this test covers the WIRING, and
      // filterBarHTML's own markup is covered separately in panel-page.test.js.
      if (id.endsWith('-filterbar-anchor')) return { set innerHTML(_v) {} };
      return null;
    },
  };
}

function makeFixtureElements() {
  const histBar = makeEl({ tag: 'div', classes: ['filterbar'], attrs: { 'data-scope': 'history' } });
  const wfBar = makeEl({ tag: 'div', classes: ['filterbar'], attrs: { 'data-scope': 'workflows' } });
  const histDet = makeEl({ classes: ['chip', 'fchip'], attrs: { 'data-filter-group': 'checkType', 'data-filter-value': 'deterministic', 'aria-pressed': 'false' }, parent: histBar });
  const histAll = makeEl({ classes: ['chip', 'fchip'], attrs: { 'data-filter-group': 'time', 'data-filter-value': 'all', 'aria-pressed': 'true' }, parent: histBar });
  const histClear = makeEl({ classes: ['chip', 'fchip'], attrs: { id: 'history-filter-clear' }, parent: histBar });
  const wfDet = makeEl({ classes: ['chip', 'fchip'], attrs: { 'data-filter-group': 'checkType', 'data-filter-value': 'deterministic', 'aria-pressed': 'false' }, parent: wfBar });
  const wfClear = makeEl({ classes: ['chip', 'fchip'], attrs: { id: 'workflows-filter-clear' }, parent: wfBar });
  const auditAll = makeEl({ classes: ['chip'], attrs: { 'data-filter': 'all', 'aria-pressed': 'true' } });
  const auditWrites = makeEl({ classes: ['chip'], attrs: { 'data-filter': 'write', 'aria-pressed': 'false' } });
  const histCount = makeEl({ tag: 'div', attrs: { id: 'history-filter-count' } });
  const wfCount = makeEl({ tag: 'div', attrs: { id: 'workflows-filter-count' } });
  const elements = [histDet, histAll, histClear, wfDet, wfClear, auditAll, auditWrites, histCount, wfCount];
  return { elements, histDet, histClear, wfDet, auditAll };
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
  const factory = new Function('document', 'localStorage', 'renderHistory', 'renderWorkflows', `
    ${src}
    return { historyFilterBar: historyFilterBar, workflowsFilterBar: workflowsFilterBar };
  `);
  return factory(fakeDocument, fakeLocalStorage, function () {}, function () {});
}

test('F-panel-chip-collision RED: no unscoped ".chip" selector left in src/panel/index.html (audit-tab wiring must be scoped, e.g. ".chip[data-filter]")', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const unscopedChipSelectorCount = (html.match(/document\.querySelectorAll\("\.chip"\)/g) || []).length;
  assert.equal(unscopedChipSelectorCount, 0, 'an unscoped ".chip" selector would also bind to the History/Workflows filter-bar chips, which share the bare .chip class');
});

test('F-panel-chip-collision: clicking a History checkType chip toggles it OFF on the very next click (no phantom stuck-on from the audit tab\'s wiring)', () => {
  const { elements, histDet } = makeFixtureElements();
  const api = runWiring(elements);

  histDet.click();
  assert.equal(api.historyFilterBar.getState().checkTypes.includes('deterministic'), true, 'first click should turn the filter on');
  assert.equal(histDet.getAttribute('aria-pressed'), 'true');

  histDet.click();
  assert.equal(api.historyFilterBar.getState().checkTypes.includes('deterministic'), false, 'second click should turn the filter back off in state');
  assert.equal(histDet.getAttribute('aria-pressed'), 'false', 'the chip must visually show OFF after the second click, not stay stuck pressed=true from a leaked audit-tab handler');
});

test('F-panel-chip-collision: History AND Workflows filter chips each receive exactly ONE click listener (no leak from the audit tab, no leak between the two filter-bar instances)', () => {
  const { elements, histDet, wfDet, auditAll } = makeFixtureElements();
  runWiring(elements);
  assert.equal(histDet.listeners.filter((l) => l.type === 'click').length, 1, 'History chip should have exactly one click listener');
  assert.equal(wfDet.listeners.filter((l) => l.type === 'click').length, 1, 'Workflows chip should have exactly one click listener');
  assert.equal(auditAll.listeners.filter((l) => l.type === 'click').length, 1, 'Audit chip should have exactly one click listener (its own, only)');
});

test('F-panel-chip-collision: the History "clear" button resets state and repaints a stuck-pressed chip back to off in one click', () => {
  const { elements, histDet, histClear } = makeFixtureElements();
  const api = runWiring(elements);

  histDet.click(); // turn a filter on
  assert.equal(api.historyFilterBar.getState().checkTypes.length, 1);

  histClear.click();
  assert.deepEqual(api.historyFilterBar.getState(), {
    checkTypes: [], results: [], time: 'all', search: '',
  });
  assert.equal(histDet.getAttribute('aria-pressed'), 'false', 'clear must visibly un-press every chip it turned off in state');
});
