// IDEA A CORE section 8 test 1 - THE GOLDEN PORT. For each of the eight REAL saved pages (with the AI's REAL saved map), `applyPageRules` must equal
// the frozen POC run with its OUT rules switched off (R2, R2a, R2b, R2c, R3, R3U, V4, pageClaims): .claude/scratch/idea-a-core/golden.mjs over
// rules-core.mjs + v3-core.mjs, which are the POC files (.claude/scratch/idea-a-v2/rules.mjs, rules-v3-candidate.mjs) with those branches deleted.
// The golden outputs are pinned by sha256 in tests/idea-a-fixtures.js. The test must FAIL when one kept rule is switched off (mutation, see the commit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPageRules } from '../src/pagerules.js';
import { loadFixture, PAGE_KEYS, JOBS } from './idea-a-fixtures.js';

/** the comparable shape of a product result: the POC golden has no line / rule numbers */
const project = (/** @type {ReturnType<typeof applyPageRules>} */ r) => ({
  facts: r.facts.map((f) => ({ name: f.name, shape: f.shape, from: f.from, words: f.words, ...(f.unit ? { unit: f.unit } : {}), ...(f.currency ? { currency: f.currency } : {}) })),
  dropped: r.dropped.map((d) => JSON.stringify({ fact: d.fact, word: d.word ?? '(fact)', reason: d.reason })).sort(),
});

for (const key of PAGE_KEYS) {
  test(`golden port: ${key} - the kept facts and every drop equal the POC with its OUT rules off`, () => {
    const fx = loadFixture(key);
    const got = project(applyPageRules(fx.page, fx.map, key.startsWith('airbnb') ? JOBS.airbnb : JOBS.flights));
    assert.deepEqual(got.facts, fx.golden.facts);
    assert.deepEqual(got.dropped, fx.golden.dropped.map((/** @type {any} */ d) => JSON.stringify(d)).sort());
  });
}

test('golden port: the eight pages between them exercise found-on-page, R1, R1L, U1 (units and an unanchored fact) - a golden with none of them would prove nothing', () => {
  const reasons = new Set();
  let anchorless = false;
  for (const key of PAGE_KEYS) {
    const g = loadFixture(key).golden;
    for (const d of g.dropped) reasons.add(d.reason);
    if (g.facts.some((/** @type {any} */ f) => f.shape === 'money' && f.words.length === 0 && f.unit?.length)) anchorless = true;
  }
  assert.ok(reasons.has('r1') && reasons.has('r1l'), `reasons seen: ${[...reasons].join(', ')}`);
  assert.ok(anchorless, 'a money fact that U1 left with only a unit (the Airbnb "total")');
});
