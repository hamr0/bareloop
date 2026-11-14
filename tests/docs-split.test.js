// hamr 2026-11-14 (rubric vs deterministic split, piece 7): the docs say what the code now does. README, the adopter contract (bareloop.context.md) and the PRD tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('README: no claim of a judge that decides or a calibration; the verification claim names what is real', () => {
  const r = read('README.md');
  assert.doesNotMatch(r, /calibrat/i);
  assert.doesNotMatch(r, /a judge only where code can't decide/);
  assert.doesNotMatch(r, /A judge only points at the quotes/);
  assert.match(r, /code decides/i);
});

test('bareloop.context.md: the old judge, the calibration gate, the PASS/FAIL examples and the fit check are not described as live', () => {
  const c = read('bareloop.context.md');
  for (const dead of ['THE CALIBRATION GATE', '`jobBlockFitsCheck(', 'The fit check (F243', 'bought by a signed calibration', '`proposalStopText`', '`calibrationSummary`', 'Judge Examples answer']) {
    assert.equal(c.includes(dead), false, dead);
  }
  assert.match(c, /PASS\/FAIL examples are gone/);
  assert.match(c, /A repo job uses a Deterministic check\./);
  assert.match(c, /oldJobWords/);
  assert.match(c, /cardInputs/);
});

test('PRD: the v1.134 contract ticks are checked, with the pointer', () => {
  const p = read('docs/product/PRD.md');
  const at = p.indexOf('### Rubric vs deterministic: PASS/FAIL, calibration and fit check removed');
  assert.ok(at > 0);
  const section = p.slice(at);
  const ticks = section.split('\n').filter((l) => /^- \[[ x]\]/.test(l));
  assert.equal(ticks.length, 6);
  assert.deepEqual(ticks.filter((l) => l.startsWith('- [ ]')), [], 'every contract line is ticked');
});
