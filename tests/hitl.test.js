// N4 slice 1 — the hitl verdict class, admitted.
//
// The frozen record (docs/plans/2026-08-07-close-authoring-design.md, the nine
// rulings + the 2026-08-12 surface addendum) says what the class MEANS; the build
// plan (docs/plans/2026-08-13-n4-verdict-classes-build.md §1) says which coupled
// sites have to move together for a hitl spec to be admissible at all. This file
// pins the ADMISSION half: every site in §1.1's table, plus the two guards that
// must NOT move with it — soft-green stays locked, and the legacy `close.type:
// 'hitl'` OBJECT form stays refused at runtime exactly as it was.
//
// The refusal was never one flag. Moving fewer than all of the sites yields a
// spec that passes one gate and reds at the next, which is why these assertions
// are one test rather than six files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateJob, VERDICT_TYPES, LOCKED_VERDICTS, CLASS_BY_CLOSE } from '../src/job.js';
import {
  VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES, CLASS_BATTERIES, classGuards, KIND_CATALOGUE,
} from '../src/authoring.js';
import { DECLARED_CLOSE_CLASSES, validateCloseDecl } from '../src/declaredclose.js';
import { QUESTION_SETS, CLASS_STATEMENTS, questionsFor, requiredAnswersFor } from '../src/authorflow.js';
import { GENRE_LANGUAGES } from '../src/authoring.js';

// ── fixtures ────────────────────────────────────────────────────────────────

/** a plan-shape spec with a COMMAND close, verdict class parameterised */
const spec = (/** @type {string} */ verdictType, /** @type {any} */ over = {}) => ({
  schema: 'job-v1',
  job: 'litectx-maintainer',
  description: 'keep litectx green; a person signs off on the result',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Fix any failure in src/ so the suite passes, then have the signer review it.',
  verdictType,
  close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }],
  tools: ['read', 'grep', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

/** a minimal AUTHORED declaration (M4), all-mechanical, with D5's green battery */
const decl = () => ({
  genre: 'TYPES',
  lang: 'js',
  stages: [
    {
      name: 'changed-from-seed',
      kind: 'files-changed',
      params: { allowPrefixes: ['src/'], requireNonEmpty: true },
    },
    {
      name: 'no-suppressions',
      kind: 'pattern-absent-in-diff',
      params: {
        patterns: classGuards({ verdictType: 'green', lang: 'js' })
          .find((g) => g.name === 'no-suppressions').params.patterns,
        extensions: classGuards({ verdictType: 'green', lang: 'js' })
          .find((g) => g.name === 'no-suppressions').params.extensions,
      },
    },
  ],
});

// ── §1.1 the six coupled sites ──────────────────────────────────────────────

test('§1.1 admission — hitl leaves the locked menu on BOTH copies, soft-green stays', () => {
  // the two copies are pinned identical elsewhere; what this asserts is the MOVE
  assert.deepEqual([...VERDICT_TYPES], ['green', 'soft-green', 'hitl'], 'the menu itself never changed');
  assert.deepEqual([...LOCKED_VERDICTS], ['soft-green'], 'hitl is admitted; soft-green is slice 2');
  assert.deepEqual([...LOCKED_CLASSES], ['soft-green']);
  assert.deepEqual([...LIVE_CLASSES], ['green', 'hitl']);
});

test('§1.1 admission — a hitl spec with a command close validates, with NO request-red', () => {
  const r = validateJob(spec('hitl'));
  assert.deepEqual(r.reds, [], 'the counted request-red at validatePlanShape stops firing for hitl');
  assert.equal(r.ok, true);
});

test('§1.1 admission — soft-green is the CONTROL: still one counted request-red', () => {
  const r = validateJob(spec('soft-green', { close: { type: 'rubric', criteria: 'reads well' } }));
  assert.equal(r.ok, false);
  const red = r.reds.find((x) => x.code === 'request-red' && x.path === 'verdictType');
  assert.equal(red.verb, 'soft-green');
  assert.equal(red.lib, 'bareloop', 'our own catalogue refusing, never an upstream ask');
});

test('§1.1 admission — DECLARED_CLOSE_CLASSES widens to hard|hitl, so a hitl verdict on an authored declaration stops redding close-hierarchy', () => {
  assert.deepEqual([...DECLARED_CLOSE_CLASSES], ['hard', 'hitl']);
  assert.deepEqual(CLASS_BY_CLOSE.declared, DECLARED_CLOSE_CLASSES, 'one hierarchy table, read by the validator');
  const r = validateJob(spec('hitl', { close: undefined, closeDecl: decl() }));
  assert.equal(r.reds.filter((x) => x.code === 'close-hierarchy').length, 0, JSON.stringify(r.reds));
  assert.equal(r.ok, true, JSON.stringify(r.reds));
});

test('§1.1 admission — validateCloseDecl stops emitting class-battery-locked for hitl (and still emits it for soft-green)', () => {
  const live = validateCloseDecl(decl(), { deferListing: true, verdictType: 'hitl' });
  assert.equal(live.reds.filter((x) => x.code === 'class-battery-locked').length, 0, JSON.stringify(live.reds));
  assert.equal(live.ok, true, JSON.stringify(live.reds));
  const locked = validateCloseDecl(decl(), { deferListing: true, verdictType: 'soft-green' });
  assert.equal(locked.reds.find((x) => x.code === 'class-battery-locked').path, 'verdictType');
});

test('§1.1 OPEN-1 — the hitl battery IS the green mechanical battery (hamr, 2026-08-13): same guards, nothing a human stage cannot see', () => {
  assert.equal(CLASS_BATTERIES.hitl.locked, false);
  assert.notEqual(CLASS_BATTERIES.hitl.guards, null, 'a LIVE class carries guards, never null');
  for (const lang of GENRE_LANGUAGES) {
    const hitl = classGuards({ verdictType: 'hitl', lang });
    const green = classGuards({ verdictType: 'green', lang });
    assert.deepEqual(hitl, green, `hitl inherits the green battery verbatim for ${lang}`);
    assert.deepEqual(hitl.map((g) => g.name), ['changed-from-seed', 'no-suppressions']);
  }
});

test('§1.1 OPEN-1 — classGuards stops THROWING for hitl, and still throws for soft-green', () => {
  assert.doesNotThrow(() => classGuards({ verdictType: 'hitl', lang: 'js' }));
  assert.throws(() => classGuards({ verdictType: 'soft-green', lang: 'js' }), /LOCKED/);
});

test('§1.1 — the hitl INTERVIEW set and composer statement exist (the two authorflow throws stop firing)', () => {
  assert.equal(QUESTION_SETS.hitl.locked, false);
  assert.doesNotThrow(() => questionsFor('hitl'));
  const qs = questionsFor('hitl');
  assert.ok(Object.keys(qs).length > 0, 'a live class has questions, never an empty set');
  assert.deepEqual(requiredAnswersFor('hitl'), Object.keys(qs).map(Number).sort((a, b) => a - b));
  assert.equal(typeof CLASS_STATEMENTS.hitl, 'string');
  assert.match(CLASS_STATEMENTS.hitl, /person/i, 'the statement says a PERSON renders the verdict');
  // soft-green is the control on both, still absent rather than empty (F59)
  assert.equal(QUESTION_SETS['soft-green'].questions, null);
  assert.equal(CLASS_STATEMENTS['soft-green'], null);
});

test('§1.1 finding 1 — the legacy close.type "hitl" OBJECT form is NOT widened: the catalogue entry stands untouched', () => {
  // N4's hitl is a STAGE (`human-confirms` inside a declaration), never a close
  // TYPE. The object form keeps exactly the treatment it had — admitted by the
  // schema, refused by the plan flow at runtime (`close-unsupported`, asserted in
  // the runner's own suite) — so there is one live expression of hitl, not two.
  assert.deepEqual(CLASS_BY_CLOSE.hitl, ['hitl']);
  const r = validateJob(spec('hitl', { close: { type: 'hitl', prompt: 'review the draft?' } }));
  assert.deepEqual(r.reds, [], 'the schema admitted this shape before the unlock and still does');
});

test('§1.2 — the human-confirms CATALOGUE entry carries the hitl class and no env (a human stage can never be env-capable)', () => {
  const k = KIND_CATALOGUE['human-confirms'];
  assert.equal(k.verdictClass, 'hitl');
  assert.ok(![...k.required, ...k.optional].includes('env'),
    'env is absent from BOTH lists — a human stage is never env-capable, by construction rather than by promise');
});
