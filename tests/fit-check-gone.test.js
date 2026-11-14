// hamr 2026-11-14 (rubric vs deterministic split, piece 3): the fit check ("I found N of M of your asks", src/fitcheck.js, v0.45.0) is removed.
// One place for all checks: the check list. "A run needs at least one check" stays, from the check list (tests/nocheck-*.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refuseChoice, resolveChoice, boxFor, CHOICE_SAYS } from '../src/questionbox.js';
import { PROMPT_REGISTERS } from '../src/promptregisters.js';
import { PHASE_STEP } from '../src/panel/authorsession.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

test('the fit check module is gone, and no prompt register names it', () => {
  assert.equal(existsSync(join(SRC, 'fitcheck.js')), false);
  assert.equal(PROMPT_REGISTERS.some((r) => r.file === 'src/fitcheck.js'), false);
});

test('a question from source "fit-check" is no longer a thing: its go-on/stop choices are refused and its box is the ordinary one', () => {
  assert.equal(refuseChoice({ kind: 'answer', source: 'fit-check' }, 'go-on'), CHOICE_SAYS.bad);
  assert.equal(refuseChoice({ kind: 'answer', source: 'fit-check' }, 'stop'), CHOICE_SAYS.bad);
  assert.notDeepEqual(resolveChoice('go-on', ''), { value: 'go on', shown: 'Go on' });
  const box = boxFor({ kind: 'answer', source: 'fit-check', question: 'x' });
  assert.deepEqual(box?.choices, [], 'no Go on / Stop buttons');
});

test('the drafting steps and the panel session know no fit-check phase, and no fit seam', () => {
  assert.equal('fit-check' in PHASE_STEP, false);
  assert.equal('fit-check-done' in PHASE_STEP, false);
  const session = readFileSync(join(SRC, 'panel', 'authorsession.js'), 'utf8');
  assert.doesNotMatch(session, /fitFn|fitAsk|onFit|FIT_ABSENT_NOTE/);
  const job = readFileSync(join(SRC, 'authorjob.js'), 'utf8');
  assert.doesNotMatch(job, /fitFn|fitAsk|onFit|fit-stopped|runFitCheck/);
});
