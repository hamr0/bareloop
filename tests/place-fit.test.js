// PLACE RULES, P1 (docs/product/ITEM33-BUILD.md, "Place rules build spec"): at drafting, code tries to fit a place rule to a phrase whose words hold a
// version or an ISO date, instead of refusing it as week-only. Frozen order: 27 candidates; the strict first-heading read on the fact's own input must return
// exactly the words. No fit = refused exactly as today.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as CL from '../src/checklist.js';
import * as PR from '../src/placerule.js';
import { factShapeReds } from '../src/facts.js';

const LOG = '# Changelog\n\n## [Unreleased]\n\n## [0.55.0] - 2026-11-04\n\n### Fixed\n- one\n\n## [0.54.1] - 2026-11-01\n';
const texts = { Changelog: LOG };
const jobLines = [{ n: 1, text: 'Quote the newest release', rule: '', rules: [] }];
const decl = (/** @type {any[]} */ parts) => ({ genre: 'TEXT', lang: 'text', stages: [{ name: 's1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }] });
const phrasePart = (/** @type {string} */ phrase) => ({ text: 'f', class: 'fact', source: 'Changelog', facts: [{ name: 'version', shape: 'phrase', phrase }] });

test('P1 fit: the version words fit the first candidate that reads them, in the frozen order (## [ and ] before the rest)', () => {
  assert.deepEqual(PR.fitPlaceRule('0.55.0', LOG), { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] });
  assert.equal(PR.PLACE_CANDIDATES.length, 27);
  assert.deepEqual(PR.PLACE_CANDIDATES.slice(0, 4).map((c) => `${c.prefix}|${c.end}`), ['## [|]', '## [| ', '## [|$EOL', '## v|]']);
});

test('P1 fit: the date words fit as headingDateAfter on the same heading', () => {
  assert.deepEqual(PR.fitPlaceRule('2026-11-04', LOG), { kind: 'headingDateAfter', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] });
});

test('P1 fit: no fit stays a null: words that are not the newest value, other date forms, version and date together, extra words, a mixed-level file, no text', () => {
  assert.equal(PR.fitPlaceRule('0.54.1', LOG), null, 'the older release is not what the newest heading reads');
  assert.equal(PR.fitPlaceRule('Nov 4, 2026', LOG), null, 'only an ISO date is handled');
  assert.equal(PR.fitPlaceRule('0.55.0 2026-11-04', LOG), null, 'two values in one phrase: ambiguous, refused');
  assert.equal(PR.fitPlaceRule('release 0.55.0', LOG), null, 'the phrase must be exactly the value');
  assert.equal(PR.fitPlaceRule('0.55.0', '# [1.0.0] x\n\n## [0.55.0] - 2026-11-04\n'), null, 'mixed levels');
  assert.equal(PR.fitPlaceRule('0.55.0', ''), null);
  assert.equal(PR.fitPlaceRule('0.55.0', null), null);
});

test('P1 buildLedger: a week-only phrase the input proves and a place rule fits is KEPT (listed); one with no fit is dropped with WEEK_ONLY_WORDS as today', () => {
  const rows = CL.buildLedger({ jobLines, texts, inputLabels: ['Changelog'], extra: [{ line: 1, kind: 'phrase', phrase: '0.55.0', source: 'Changelog' }] });
  const row = rows.find((r) => r.kind === 'phrase');
  assert.equal(row?.state, 'listed');
  const nofit = CL.buildLedger({ jobLines, texts: { Changelog: `${LOG}\n- shipped 0.54.1 earlier\n` }, inputLabels: ['Changelog'], extra: [{ line: 1, kind: 'phrase', phrase: '0.54.1', source: 'Changelog' }] });
  const r2 = nofit.find((r) => r.kind === 'phrase');
  assert.equal(r2?.state, 'dropped');
  assert.equal(r2?.reason, CL.WEEK_ONLY_WORDS);
});

test('P1 applyLedger: the unruled week-only fact whose rule fits is kept and carries `place`; the signed shape validates; no fit = refused week-only as today', () => {
  const rows = CL.buildLedger({ jobLines, texts, inputLabels: ['Changelog'], extra: [{ line: 1, kind: 'phrase', phrase: '0.55.0', source: 'Changelog' }] });
  const r = CL.applyLedger(decl([phrasePart('0.55.0')]), rows, { labels: ['Changelog'], texts });
  assert.deepEqual(r.refused, []);
  const f = r.declaration.stages[0].params.parts[0].facts[0];
  assert.equal(f.phrase, '0.55.0', 'the drafting words stay as the example');
  assert.deepEqual(f.place, { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] });
  /** @type {string[]} */ const reds = [];
  factShapeReds(r.declaration.stages[0].params.parts[0], 'p', (code, path, detail) => reds.push(`${code} ${path} ${detail}`));
  assert.deepEqual(reds, []);
  // a date the input holds but no rule fits (only the older one is in the words)
  const rows2 = CL.buildLedger({ jobLines, texts, inputLabels: ['Changelog'], extra: [{ line: 1, kind: 'phrase', phrase: '2026-11-01', source: 'Changelog' }] });
  const r2 = CL.applyLedger(decl([phrasePart('2026-11-01')]), rows2, { labels: ['Changelog'], texts });
  assert.deepEqual(r2.refused.map((x) => x.reason), ['week-only']);
  assert.equal(r2.declaration.stages[0].params.parts.some((/** @type {any} */ p) => p.class === 'fact'), false);
});

test('P1 applyLedger without texts keeps the old behaviour (no fit can be proven)', () => {
  const rows = CL.buildLedger({ jobLines, texts, inputLabels: ['Changelog'], extra: [{ line: 1, kind: 'phrase', phrase: '0.55.0', source: 'Changelog' }] });
  const r = CL.applyLedger(decl([phrasePart('0.55.0')]), rows, { labels: ['Changelog'] });
  assert.deepEqual(r.refused.map((x) => x.reason), ['week-only']);
});
