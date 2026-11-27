// fwd v0.39.0 am8 item 1n (67857355), copied 2026-11-27 (ITEM33-BUILD Addendum 2026-11-27): four questions, one owner each, no behaviour change
// (one ruled exception, the count below): isAmountShape / isPhraseShape / isLegalCount (src/facts.js), canReadLimit (src/pagerules.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => {
  for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|html)$/.test(p)) out.push(p); }
  return out;
};
/** `x === 'a' || x === 'b'` / `x !== 'a' && x !== 'b'` for one pair of words (either order), on the same thing, and NOT a longer list of the same thing after it */
const pairOf = (/** @type {string} */ a, /** @type {string} */ b) => new RegExp(`([\\w.?]+)\\s*(===|!==)\\s*'(${a}|${b})'\\s*(?:\\|\\||&&)\\s*\\1\\s*\\2\\s*'(?!\\3')(?:${a}|${b})'(?!\\s*(?:\\|\\||&&)\\s*\\1\\s*\\2\\s*')`);
/** the owners' own definition lines, and the one named vocabulary that is not a fact shape */
const isDefinition = (/** @type {string} */ l) => /export const (isAmountShape|isPhraseShape|canReadLimit)\b/.test(l);
const LEFT = { 'src/shapebuild.js': 'a shape-menu `kind` (number|money), not a fact shape: a different vocabulary' };

/** every src line that spells the pair out, minus the owner's definition and the named vocabulary */
function spelled(/** @type {RegExp} */ re) {
  /** @type {string[]} */ const hits = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (Object.hasOwn(LEFT, rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((l, i) => { if (re.test(l) && !isDefinition(l)) hits.push(`${rel}:${i + 1}`); });
  }
  return hits;
}

test('guard: money|number is asked of isAmountShape only', () => assert.deepEqual(spelled(pairOf('money', 'number')), []));
test('guard: phrase|place is asked of isPhraseShape only', () => assert.deepEqual(spelled(pairOf('phrase', 'place')), []));
test('guard: money|time is asked of canReadLimit only', () => assert.deepEqual(spelled(pairOf('money', 'time')), []));
test('guard: the legal-count test lives in isLegalCount only', () => {
  /** @type {string[]} */ const hits = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    let inDef = false;
    readFileSync(file, 'utf8').split('\n').forEach((l, i) => {
      if (/export const isLegalCount\b/.test(l)) inDef = true;
      if (!inDef && (/k === 'min' \|\| k === 'max'/.test(l) || /Number\.isInteger\(e\.min\) && Number\.isInteger\(e\.max\) && e\.min > e\.max/.test(l))) hits.push(`${rel}:${i + 1}`);
      if (inDef && /;\s*$/.test(l)) inDef = false;
    });
  }
  assert.deepEqual(hits, []);
});

test('same answer: the shape owners agree with the old spelled-out pairs on every shape word', async () => {
  const { isAmountShape, isPhraseShape } = await import('../src/facts.js');
  const { canReadLimit } = await import('../src/pagerules.js');
  for (const s of ['money', 'number', 'date', 'time', 'phrase', 'place', 'text', 'Money', '', null, undefined, 0]) {
    assert.equal(isAmountShape(s), s === 'money' || s === 'number', String(s));
    assert.equal(isPhraseShape(s), s === 'phrase' || s === 'place', String(s));
    assert.equal(canReadLimit(s), s === 'money' || s === 'time', String(s));
  }
});

/** the old `facts.js` count check (Object.hasOwn) and the old `checkblock.js` `addCount` test (`!== undefined`), kept here as the oracles */
const oldFacts = (/** @type {any} */ c) => !!c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).every((k) => k === 'min' || k === 'max') && (Object.hasOwn(c, 'min') || Object.hasOwn(c, 'max'))
  && ['min', 'max'].every((k) => !Object.hasOwn(c, k) || (Number.isInteger(c[k]) && c[k] >= 1)) && (!Object.hasOwn(c, 'min') || !Object.hasOwn(c, 'max') || c.min <= c.max);
const oldAdd = (/** @type {any} */ e) => {
  const ok = (/** @type {unknown} */ x) => Number.isInteger(x) && /** @type {number} */ (x) >= 1;
  return !(![e.min, e.max].some(Number.isInteger) || [e.min, e.max].some((x) => x !== undefined && !ok(x)) || (Number.isInteger(e.min) && Number.isInteger(e.max) && e.min > e.max));
};
const COUNTS = [{ min: 1 }, { max: 2 }, { min: 1, max: 2 }, { min: 2, max: 2 }, { min: 3, max: 2 }, {}, { min: 0 }, { max: 0 }, { min: 1, extra: 1 }, { min: 1.5 }, { min: '3' }, { min: null }, { min: -1 }, { min: 1, max: null }, { min: NaN }];

test('same answer: isLegalCount agrees with both old count checks on every count they agreed on', async () => {
  const { isLegalCount } = await import('../src/facts.js');
  for (const c of COUNTS) {
    assert.equal(isLegalCount(c), oldFacts(c), JSON.stringify(c));
    assert.equal(isLegalCount({ min: c.min, max: c.max }), oldAdd(c), JSON.stringify(c));
  }
});

test('ruled 2026-11-27: {min: undefined, max: 2} is legal at both sites (the one owner takes !== undefined)', async () => {
  const { isLegalCount, factShapeReds } = await import('../src/facts.js');
  assert.equal(oldFacts({ min: undefined, max: 2 }), false, 'old facts.js refused it');
  assert.equal(oldAdd({ min: undefined, max: 2 }), true, 'old addCount accepted it');
  assert.equal(isLegalCount({ min: undefined, max: 2 }), true);
  /** @type {string[]} */ const reds = [];
  factShapeReds({ class: 'fact', text: 't', facts: [], count: { min: undefined, max: 2 } }, 'p', (_c, path) => reds.push(path));
  assert.deepEqual(reds.filter((p) => p.endsWith('.count')), []);
});

test('factShapeReds count red follows isLegalCount', async () => {
  const { isLegalCount, factShapeReds } = await import('../src/facts.js');
  for (const c of COUNTS) {
    /** @type {string[]} */ const reds = [];
    factShapeReds({ class: 'fact', text: 't', facts: [], count: c }, 'p', (_c, path) => reds.push(path));
    assert.equal(reds.some((p) => p.endsWith('.count')), !isLegalCount(c), JSON.stringify(c));
  }
});
