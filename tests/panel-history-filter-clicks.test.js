// F-panel-chip-collision: hamr's live-panel feedback (2026-09-25 verbatim,
// commit 8d2bf42) — History filter chips "need two clicks to work" and
// "clear doesn't work". Root cause: the Audit tab's generic chip wiring
// (`src/panel/index.html` around the `document.querySelectorAll(".chip")`
// calls) is UNSCOPED and its selector also matches the History filter bar's
// chip buttons, because both bars reuse the bare `.chip` class. A second
// click listener ends up bound on every History chip; it unconditionally
// forces that chip's `aria-pressed` back to "true" after every click,
// masking the correct internal-state toggle that the History-specific
// handler already performed.
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

/** Pulls the two chip-wiring regions (History filter bar + Audit tab filter)
 * out of the page's own source text, verbatim, byte for byte. */
function extractChipWiringSource() {
  const html = readFileSync(PAGE_PATH, 'utf8');

  const startA = html.indexOf('// ---- History filters (item 5) ----');
  const endA = html.indexOf('// item 4: phone-only');
  assert.ok(startA !== -1 && endA !== -1 && endA > startA, 'expected the History filters block in src/panel/index.html');
  const regionA = html.slice(startA, endA);

  const startB = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const endB = html.indexOf('// ---- Job tab ----');
  assert.ok(startB !== -1 && endB !== -1 && endB > startB, 'expected the Audit tab chip-filter block in src/panel/index.html');
  const regionB = html.slice(startB, endB);

  return 'var auditRowEls = [];\n' + regionA + '\n' + regionB;
}

/** A minimal fake DOM element: just enough surface for the extracted code. */
function makeEl({ tag = 'button', classes = [], attrs = {}, ancestorClasses = [] } = {}) {
  return {
    tag,
    classes: new Set(classes),
    attrs: { ...attrs },
    ancestorClasses: new Set(ancestorClasses),
    style: {},
    listeners: [],
    classList: {
      contains(c) { return this._el.classes.has(c); },
    },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    click() { this.listeners.filter((l) => l.type === 'click').forEach((l) => l.fn.call(this)); },
  };
}

/** Matches one compound selector piece like ".chip[data-filter]" against an element. */
function matchesCompound(el, compound) {
  const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attrs = [...compound.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
  for (const c of classes) if (!el.classes.has(c)) return false;
  for (const [, name, val] of attrs) {
    if (!(name in el.attrs)) return false;
    if (val !== undefined && el.attrs[name] !== val) return false;
  }
  return true;
}

/** A tiny selector engine covering exactly the selector shapes this page
 * uses for chip wiring: a bare compound ('.chip', '.chip[data-filter]') or
 * a two-part descendant selector ('.hist-filters .chip[data-filter-group]'). */
function makeFakeDocument(elements) {
  return {
    querySelectorAll(selector) {
      const parts = selector.trim().split(/\s+/);
      if (parts.length === 1) return elements.filter((el) => matchesCompound(el, parts[0]));
      const [ancestorPart, elPart] = parts;
      const ancestorClass = ancestorPart.replace('.', '');
      return elements.filter((el) => el.ancestorClasses.has(ancestorClass) && matchesCompound(el, elPart));
    },
    getElementById(id) {
      return elements.find((el) => el.attrs.id === id) || null;
    },
  };
}

function makeFixtureElements() {
  const histDet = makeEl({ classes: ['chip'], attrs: { 'data-filter-group': 'checkType', 'data-filter-value': 'deterministic', 'aria-pressed': 'false' }, ancestorClasses: ['hist-filters'] });
  const histAll = makeEl({ classes: ['chip'], attrs: { 'data-filter-group': 'time', 'data-filter-value': 'all', 'aria-pressed': 'true' }, ancestorClasses: ['hist-filters'] });
  const clearBtn = makeEl({ classes: ['btn', 'small'], attrs: { id: 'hist-filter-clear' } });
  const auditAll = makeEl({ classes: ['chip'], attrs: { 'data-filter': 'all', 'aria-pressed': 'true' } });
  const auditWrites = makeEl({ classes: ['chip'], attrs: { 'data-filter': 'write', 'aria-pressed': 'false' } });
  const countEl = makeEl({ tag: 'div', attrs: { id: 'hist-filter-count' } });
  const elements = [histDet, histAll, clearBtn, auditAll, auditWrites, countEl];
  // wire classList back-reference (fake DOM helper, not part of extracted source)
  elements.forEach((el) => { el.classList._el = el; });
  return { elements, histDet, histAll, clearBtn, auditAll };
}

function runWiring(elements) {
  const src = extractChipWiringSource();
  const fakeDocument = makeFakeDocument(elements);
  const fakeLocalStorage = {
    store: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
    setItem(k, v) { this.store[k] = String(v); },
  };
  const fakeAllHistoryRuns = [];
  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'localStorage', 'allHistoryRuns', 'renderHistory', `
    ${src}
    return { getHistFilterState: function(){ return histFilterState; }, applyHistFilters: applyHistFilters };
  `);
  return factory(fakeDocument, fakeLocalStorage, fakeAllHistoryRuns, function () {});
}

test('F-panel-chip-collision RED: audit tab wiring selector ".chip" also binds a second listener on History filter chips (source-shape proof)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  // The exact defect: these two lines select ALL `.chip` elements in the
  // whole document, unscoped, so they also match the History filter bar's
  // buttons (which share the bare `.chip` class at src/panel/index.html:282-295).
  const unscopedChipSelectorCount = (html.match(/document\.querySelectorAll\("\.chip"\)/g) || []).length;
  assert.equal(unscopedChipSelectorCount, 0, 'expected no unscoped ".chip" selector left in src/panel/index.html — audit-tab wiring must be scoped (e.g. ".chip[data-filter]") so it cannot also bind to the History filter bar\'s chips');
});

test('F-panel-chip-collision: clicking a History checkType chip toggles it OFF on the very next click (no phantom stuck-on from the audit tab\'s wiring)', () => {
  const { elements, histDet } = makeFixtureElements();
  const api = runWiring(elements);

  histDet.click();
  assert.equal(api.getHistFilterState().checkTypes.includes('deterministic'), true, 'first click should turn the filter on');
  assert.equal(histDet.getAttribute('aria-pressed'), 'true');

  histDet.click();
  assert.equal(api.getHistFilterState().checkTypes.includes('deterministic'), false, 'second click should turn the filter back off in state');
  assert.equal(histDet.getAttribute('aria-pressed'), 'false', 'the chip must visually show OFF after the second click, not stay stuck pressed=true from the audit tab\'s unscoped handler');
});

test('F-panel-chip-collision: History chips never receive a second listener from the audit tab\'s wiring (listener count stays 1)', () => {
  const { elements, histDet } = makeFixtureElements();
  runWiring(elements);
  const clickListeners = histDet.listeners.filter((l) => l.type === 'click');
  assert.equal(clickListeners.length, 1, `History chip should have exactly one click listener bound to it; got ${clickListeners.length} (a second listener means the audit tab's ".chip" wiring leaked onto this element)`);
});
