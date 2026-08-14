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
import { validateJob, VERDICT_TYPES, LOCKED_VERDICTS, CLASS_BY_CLOSE, checkMenu } from '../src/job.js';
import {
  VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES, CLASS_BATTERIES, classGuards, KIND_CATALOGUE,
  CATALOGUE_LIVE_KINDS, LOCKED_KINDS, envCapableKind, closeCeiling,
} from '../src/authoring.js';
import {
  DECLARED_CLOSE_CLASSES, validateCloseDecl, declaredStages, runDeclaredStages, closeGrade,
} from '../src/declaredclose.js';
import {
  LIVE_KINDS, SEED_EXEMPT_KINDS, runStage, seedRead, normalizeHumanRuling, runDeclaredClose,
} from '../src/kinds.js';
import { CLOSE_FAULTS } from '../src/ralph.js';
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

// ── §1.2/§1.3 the kind goes live, and the executor PAUSES on it ─────────────

test('§1.2 — human-confirms is LIVE in both catalogues, and the two lists stay pinned equal', () => {
  assert.equal(KIND_CATALOGUE['human-confirms'].locked, undefined,
    'a live kind carries no locked flag at all');
  assert.ok(CATALOGUE_LIVE_KINDS.includes('human-confirms'));
  assert.deepEqual([...CATALOGUE_LIVE_KINDS].sort(), [...LIVE_KINDS].sort(),
    'the catalogue offers exactly what the executor implements — both directions');
  assert.deepEqual([...LOCKED_KINDS], ['judged-floor'], 'judged-floor is slice 2');
  const k = KIND_CATALOGUE['human-confirms'];
  assert.deepEqual([...k.required], ['ask']);
  assert.deepEqual([...k.optional], [], 'no timeoutMs and no env — a human stage spawns nothing');
  assert.equal(envCapableKind('human-confirms'), false, 'never env-capable, by construction');
});

/** the all-mechanical declaration plus one human stage at the END (the composition law) */
const hitlDecl = (/** @type {any} */ over = {}) => {
  const d = decl();
  return { ...d, stages: [...d.stages, { name: 'signer-reviews', kind: 'human-confirms', params: { ask: 'is this what you wanted?' }, ...over }] };
};

test('§1.2 offer:false BY LAW — a declaration that OFFERS a human stage is a RED, never a silent normalization', () => {
  const r = validateCloseDecl(hitlDecl({ offer: true }), { deferListing: true, verdictType: 'hitl' });
  const red = r.reds.find((x) => x.code === 'human-stage-offered');
  assert.ok(red, JSON.stringify(r.reds));
  assert.match(red.detail, /never an in-run/i);
  // and the arbiter's own execution bridge keeps it off the DERIVED check menu
  const stages = declaredStages(hitlDecl());
  assert.equal(stages.at(-1).offer, false, 'the bridge stamps the law onto the stage the runner sees');
  assert.deepEqual(checkMenu(stages).map((m) => m.name), ['changed-from-seed', 'no-suppressions'],
    'the agent can never compose check-passes(<a person>)');
});

test('§1.2 ceiling — a human stage inside a GREEN spec is a class-ceiling red (the existing hierarchy, not a new rule)', () => {
  const green = validateCloseDecl(hitlDecl(), { deferListing: true, verdictType: 'green' });
  const red = green.reds.find((x) => x.code === 'class-ceiling');
  assert.ok(red, JSON.stringify(green.reds));
  assert.equal(red.kindClass, 'hitl');
  assert.equal(red.picked, 'green');
  // …and the same declaration under the class it promises validates clean
  assert.equal(validateCloseDecl(hitlDecl(), { deferListing: true, verdictType: 'hitl' }).ok, true);
  assert.equal(closeCeiling(hitlDecl()).class, 'hitl');
});

const humanStage = { name: 'signer-reviews', kind: 'human-confirms', params: { ask: 'is this what you wanted?' } };
/** a ctx pointing at a directory that DOES NOT EXIST: a stage that pauses spawns nothing */
const nowhere = { workdir: '/nonexistent-on-purpose', seedRef: 'HEAD', gapKeep: 'close: ' };

test('§1.3 — a human stage does not RUN, it PAUSES: the fifth StageResult verdict', async () => {
  const r = await runStage(humanStage, nowhere);
  assert.equal(r.verdict, 'pause', 'neither green nor red — a non-verdict (F17)');
  assert.equal(r.judged, false, 'nothing was judged; a pause must never mint judged evidence');
  assert.equal(r.exitCode, null, 'no process ran, so there is no exit code (F6: unknown, never 0)');
  assert.equal(r.detail.ask, 'is this what you wanted?');
  assert.equal(r.detail.fault, undefined, 'a pause is not a fault');
});

test('§1.3 — the human ruling decides the stage: accept is green, rerun is a red whose GAP is the human\'s own words', async () => {
  const yes = await runStage(humanStage, { ...nowhere, humanRuling: { decision: 'accept' } });
  assert.equal(yes.verdict, 'green');
  assert.equal(yes.judged, true, 'a person DID render a judgment here');

  const no = await runStage(humanStage, { ...nowhere, humanRuling: { decision: 'rerun', text: 'the summary buries the risk section' } });
  assert.equal(no.verdict, 'red');
  assert.ok(no.gapLines.some((l) => l.includes('the summary buries the risk section')),
    'ruling 3 is literal: the human IS the gap author');
  assert.ok(no.gapLines.every((l) => l.startsWith('close: ')), 'the gap rides the declared gapKeep, like every other stage');
});

test('§1.3 — a decision the stage cannot read renders NO verdict (an instrument stop, never a guess)', async () => {
  for (const humanRuling of [{ decision: 'cancel' }, { decision: 'maybe' }, { decision: 'rerun', text: '  \n' }]) {
    const r = await runStage(humanStage, { ...nowhere, humanRuling });
    assert.equal(r.verdict, 'instrument-stop', JSON.stringify(humanRuling));
    assert.equal(r.judged, false);
  }
});

test('§1.3 ruling 8 — the human stage SKIPS the seed-verdict read, and the skip is recorded BY NAME (F59)', async () => {
  const rows = await seedRead(hitlDecl(), { ...nowhere, workdir: '/tmp' });
  assert.equal(rows.length, hitlDecl().stages.length, 'every stage produces a row — absence is never the record');
  const human = rows.at(-1);
  assert.equal(human.stage, 'signer-reviews');
  assert.equal(human.verdict, 'skipped');
  assert.equal(human.judged, false);
  assert.match(String(human.detail.why), /ruling 8/i);
  assert.deepEqual([...SEED_EXEMPT_KINDS].sort(), ['human-confirms', 'judged-floor']);
});

test('§1.3 — a PAUSE is never graded: neither runDeclaredClose nor the arbiter bridge may render it as green or as a fault', async () => {
  // the human stage ALONE: the mechanical stages need a real seed tree, and what
  // is under test here is the two readers' treatment of a pause. The whole
  // close, mechanical stages and all, runs against a real patient in the runner's
  // own suite.
  const stages = declaredStages({ ...hitlDecl(), stages: [hitlDecl().stages.at(-1)] });
  // the raw M1 path: the close STOPS at the human stage and says so by name
  const closed = await runDeclaredClose({ stages }, { ...nowhere, workdir: '/tmp', seedRef: 'HEAD' });
  assert.equal(closed.verdict, 'pause', 'a pause must never fall through to green (nothing decided it)');
  assert.equal(closed.judged, false);
  assert.equal(closed.firstRed, null, 'nothing was red');
  assert.equal(closed.pausedAt, 'signer-reviews');

  // …and the arbiter bridge, whose vocabulary every downstream reader speaks
  const v = await runDeclaredStages(stages, (s) => s, { cwd: '/tmp', seedRef: 'HEAD' });
  assert.equal(v.verdict, 'human-pause', 'a distinct verdict — never satisfied, never needs_revision, never a fault');
  assert.equal(v.stage, 'signer-reviews');
  assert.equal(v.gap, undefined, 'a pause carries no gap: nobody has said anything yet');
  assert.equal(Object.hasOwn(CLOSE_FAULTS, v.verdict), false,
    'the forbidden-zone table must not claim it — a pause is a non-verdict, not a broken instrument');
  assert.equal(closeGrade(v).value, null, 'and it donates no number to the trend reader (F6: blind reads unknown)');
});

test('§1.5 — the decision GATE refuses an empty rerun: the fix worker must never receive an empty human gap', () => {
  assert.equal(normalizeHumanRuling({ decision: 'rerun', text: 'do it again, properly' }).ok, true);
  assert.equal(normalizeHumanRuling({ decision: 'accept' }).ok, true);
  assert.equal(normalizeHumanRuling({ decision: 'cancel' }).ok, true);
  assert.equal(normalizeHumanRuling(null).ok, true, 'no ruling at all is the PAUSE path, not a refusal');
  assert.equal(normalizeHumanRuling(null).ruling, null);
  for (const bad of [{ decision: 'rerun' }, { decision: 'rerun', text: '' }, { decision: 'rerun', text: '   \n\t ' }]) {
    const r = normalizeHumanRuling(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.why, /text/i);
  }
  assert.equal(normalizeHumanRuling({ decision: 'maybe', text: 'hm' }).ok, false, 'there is no fourth door');
  assert.equal(normalizeHumanRuling({ text: 'words' }).ok, false);
});
