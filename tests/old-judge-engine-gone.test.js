// hamr 2026-11-14: "i don't need old runs in anything" -- the old judge's RUNTIME engine is gone too (the locate call, the rulebook, decide(), the calibration
// shape, the judged-floor kind and the judge's paid seam). What stays is the one thing a current job needs from this file: which model a job's judge identity names
// (`resolveJudge`, `resolveJobJudge`: the spec's `judge` field and the workflow key read it). Each assertion failed before the removal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/index.js';
import * as judged from '../src/judged.js';
import * as kinds from '../src/kinds.js';
import { validateCloseDecl } from '../src/declaredclose.js';

test('src/judged.js keeps only the two judge-identity resolvers', () => {
  assert.deepEqual(Object.keys(judged).sort(), ['resolveJobJudge', 'resolveJudge']);
});

test('the package root no longer exports the old judge engine', () => {
  for (const name of ['runLocate', 'decide', 'JUDGE_RULES', 'JUDGE_RULE_IDS', 'CALIBRATION_SIZE', 'validateCalibrationSet', 'expectedOf', 'JUDGE_ATTEMPTS', 'MAX_JUDGED_PATHS']) {
    assert.equal(name in lib, false, `${name} is gone from the root`);
  }
  assert.equal('resolveJudge' in lib, true, 'the identity resolver stays');
});

test('judged-floor is no live kind and judged stages have no reader', () => {
  assert.equal(kinds.LIVE_KINDS.includes('judged-floor'), false);
  assert.deepEqual([...kinds.SEED_EXEMPT_KINDS], ['human-confirms']);
  for (const name of ['JUDGED_FLOOR_KIND', 'judgedStages', 'closeJudges', 'MAX_JUDGED_PATHS', 'JUDGE_ATTEMPTS']) assert.equal(name in kinds, false, name);
});

test('a close declaration carrying a calibration set is refused as an unknown field', () => {
  const v = validateCloseDecl({ genre: 'TYPES', lang: 'js', stages: [], calibration: { cases: [], judgeModel: 'm' } }, { verdictType: 'soft-green', deferListing: true });
  assert.equal(v.reds.some((r) => r.code === 'unknown-field' && /calibration/.test(r.path)), true, JSON.stringify(v.reds));
});
