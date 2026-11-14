// SOFTGREEN MODULE 3 — the verdict CLASS opens.
//
// Modules 1 and 2 built the judged floor and wired the stage into the close.
// Neither of them could be reached from a real job: `soft-green` was still the
// declared-but-locked class, so every production path — the job validator, the
// declaration gate, the interview, the guard battery — refused before the stage
// ever ran. This file pins the ADMISSION half, the way tests/hitl.test.js pinned
// slice 1's: the refusal was never one flag, and moving fewer than all of the
// coupled sites yields a spec that passes one gate and reds at the next.
//
// It also pins the two rules the class brings WITH it:
//   - THE COMPOSER'S MENU IS CLASS-SCOPED. A green job is never shown
//     `judged-floor` (nor `human-confirms`): picking one was a late
//     `class-ceiling` red, and an illegal pick belongs INEXPRESSIBLE at the
//     schema rather than rejected after a paid call composed it.
//   - THE JUDGED STAGE SITS AFTER THE MECHANICAL ONES (§4.5), at most once.
//     First-red-wins makes the order the mechanism: a judged stage in front of a
//     mechanical one buys a paid call to shield a free one, and can grade a tree
//     the cheap stages would have refused.
//
// NO test in this file makes a paid call.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateJob, VERDICT_TYPES, LOCKED_VERDICTS, CLASS_BY_CLOSE } from '../src/job.js';
import {
  VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES, CLASS_BATTERIES, classGuards, classMenu,
  KIND_CATALOGUE, validateDeclaration, closeCeiling,
} from '../src/authoring.js';
import { DECLARED_CLOSE_CLASSES, validateCloseDecl } from '../src/declaredclose.js';
import {
  QUESTION_SETS, GREEN_QUESTIONS, SOFTGREEN_QUESTIONS, CLASS_STATEMENTS, questionsFor,
  requiredAnswersFor, declarationSchema, catalogueBlock, authorPrompt,
} from '../src/authorflow.js';
import { GENRE_LANGUAGES } from '../src/authoring.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const guardParams = (/** @type {string} */ name) => classGuards({ verdictType: 'green', lang: 'js' })
  .find((g) => g.name === name).params;

/** D5's battery, as declared stages */
const battery = () => [
  { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } },
  {
    name: 'no-suppressions',
    kind: 'pattern-absent-in-diff',
    params: { patterns: guardParams('no-suppressions').patterns, extensions: guardParams('no-suppressions').extensions },
  },
];

/** a soft-green AUTHORED declaration: the mandatory guards, a mechanical work
 * stage, and the judged floor LAST */
const softDecl = (/** @type {any[]} */ stages = [
  ...battery(),
  { name: 'typecheck-clean', kind: 'command-exit', params: { cmd: 'npx', args: ['tsc', '--noEmit'], expectExit: 0 } },
]) => ({ genre: 'TYPES', lang: 'js', stages });

/** a plan-shape spec carrying that declaration */
const spec = (/** @type {string} */ verdictType, /** @type {any} */ over = {}) => ({
  schema: 'job-v1',
  job: 'litectx-jsdoc',
  description: 'document every exported function in src/',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Document every exported function in src/ with accurate JSDoc.',
  verdictType,
  closeDecl: softDecl(),
  tools: ['read', 'grep', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const declOpts = (/** @type {any} */ over = {}) => ({
  catalogue: KIND_CATALOGUE,
  listing: ['src/spine.js', 'src/index.js'],
  guards: classGuards({ verdictType: 'soft-green', lang: 'js' }),
  envOwned: [],
  verdictType: 'soft-green',
  ...over,
});

// ── 1. the class opens on every coupled site ────────────────────────────────

test('module 3 — soft-green leaves the locked menu on BOTH copies, and the menu itself is unchanged', () => {
  assert.deepEqual([...VERDICT_TYPES], ['green', 'soft-green', 'hitl']);
  assert.deepEqual([...VERDICT_CLASSES], [...VERDICT_TYPES], 'the two copies stay pinned identical');
  assert.deepEqual([...LOCKED_VERDICTS], [], 'nothing is declared-but-locked any more');
  assert.deepEqual([...LOCKED_CLASSES], [...LOCKED_VERDICTS], 'both constants moved in one commit');
  assert.deepEqual([...LIVE_CLASSES], ['green', 'soft-green', 'hitl']);
});

test('module 3 admission — a soft-green spec with an authored declaration validates, with NO request-red', () => {
  const r = validateJob(spec('soft-green'));
  assert.deepEqual(r.reds, [], JSON.stringify(r.reds));
  assert.equal(r.ok, true);
});

test('module 3 admission — DECLARED_CLOSE_CLASSES widens to hard|soft|hitl, so close-hierarchy stops firing', () => {
  assert.deepEqual([...DECLARED_CLOSE_CLASSES], ['hard', 'soft', 'hitl']);
  assert.deepEqual(CLASS_BY_CLOSE.declared, DECLARED_CLOSE_CLASSES, 'one hierarchy table, read by the validator');
  const r = validateJob(spec('soft-green'));
  assert.equal(r.reds.filter((x) => x.code === 'close-hierarchy').length, 0);
});

test('module 3 admission — validateCloseDecl stops emitting class-battery-locked for soft-green', () => {
  const v = validateCloseDecl(softDecl(), { deferListing: true, verdictType: 'soft-green' });
  assert.equal(v.reds.filter((x) => x.code === 'class-battery-locked').length, 0, JSON.stringify(v.reds));
  assert.equal(v.ok, true, JSON.stringify(v.reds));
  // the mechanism itself is untouched: a class this build does not know still
  // bails rather than validating a declaration against another class's battery
  const unknown = validateCloseDecl(softDecl(), { deferListing: true, verdictType: 'chartreuse' });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reds.find((x) => x.code === 'class-absent').path, 'verdictType');
});

// ── 2. the battery is INHERITED, not copied ─────────────────────────────────

test('module 3 ruling 4 — softgreen INHERITS green\'s guard battery: the same object, not a second copy', () => {
  assert.equal(CLASS_BATTERIES['soft-green'].locked, false);
  assert.equal(CLASS_BATTERIES['soft-green'].guards, CLASS_BATTERIES.green.guards,
    'shared BY REFERENCE — a fix to green\'s battery flows to softgreen with no second edit');
  assert.equal(CLASS_BATTERIES['soft-green'].guards, CLASS_BATTERIES.hitl.guards, 'and to hitl, the same way');
  for (const lang of GENRE_LANGUAGES) {
    assert.doesNotThrow(() => classGuards({ verdictType: 'soft-green', lang }));
    assert.deepEqual(classGuards({ verdictType: 'soft-green', lang }), classGuards({ verdictType: 'green', lang }));
  }
  // still a fresh deep copy per call: one battery must never be weakened through another
  const a = classGuards({ verdictType: 'soft-green', lang: 'js' });
  assert.notEqual(a[0].params, classGuards({ verdictType: 'green', lang: 'js' })[0].params);
});

// ── 3. the seven questions ──────────────────────────────────────────────────

test('module 3 §4.6 — the softgreen interview is green\'s job question BYTE FOR BYTE (the judge examples are gone, 2026-11-14)', () => {
  const qs = questionsFor('soft-green');
  assert.equal(Object.keys(qs).length, 1, 'nothing hardcodes the count anywhere else — the library reports it');
  for (const [n, q] of Object.entries(GREEN_QUESTIONS)) {
    assert.equal(qs[n], q, `question ${n} is green's own string, byte for byte`);
  }
  // Judge Examples replaces the old Q6+Q7: one field, whose text is now the
  // signed table's own "Holds" column, verbatim (PRD item 33 M3 piece 3's
  // wording fix) — not the old worded Q7 ("Give one example you'd pass and
  // one you'd fail, and say why."). The old Q6 ("what separates a pass from a
  // fail") is retired as its own question, since the "why" half of a real
  // pass/fail pair is what the rubric card now compiles from (cardauthor.js).
  // 2026-11-14: the judge examples are gone; the soft-green set is the green set (The job only)
  assert.equal(qs[2], undefined);
  assert.deepEqual(requiredAnswersFor('soft-green'), [1]);
  assert.equal(QUESTION_SETS['soft-green'].locked, false);
  assert.equal(QUESTION_SETS['soft-green'].questions, SOFTGREEN_QUESTIONS);
});

test('module 3 — the composer statement exists and says what a softgreen close is', () => {
  const s = CLASS_STATEMENTS['soft-green'];
  assert.equal(typeof s, 'string');
  assert.match(s, /judge/i);
  assert.match(s, /mechanical/i, 'mechanical first is stated as an ORDER, the way hitl\'s is');
});

test('module 3 — the job answer reaches the composer verbatim, with the person\'s own words beside it', () => {
  const answers = Object.fromEntries(requiredAnswersFor('soft-green').map((n) => [n, `answer ${n}`]));
  const p = authorPrompt({
    answers,
    questions: questionsFor('soft-green'),
    facts: {},
    listingBlock: '',
    lang: 'js',
    verdictType: 'soft-green',
    guards: classGuards({ verdictType: 'soft-green', lang: 'js' }),
  });
  assert.ok(p.includes(questionsFor('soft-green')[1]), 'the job question travels into the brief');
  assert.ok(p.includes('A1. answer 1'), 'with the person\'s own words beside it');
});

// ── 4. the composer's menu is CLASS-SCOPED ──────────────────────────────────

test('module 3 — classMenu hands over the kinds at or below the picked class, and throws on an unknown one', () => {
  const green = classMenu('green');
  assert.ok(green.includes('command-exit'));
  assert.ok(!green.includes('judged-floor'), 'a judged ruler is above a green promise');
  assert.ok(!green.includes('human-confirms'));
  const soft = classMenu('soft-green');
  assert.ok(!soft.includes('judged-floor'), 'the old judge is gone (2026-11-14): no class menu offers it');
  assert.ok(!soft.includes('human-confirms'), 'a person is above a judged promise');
  assert.deepEqual([...classMenu('hitl')].sort(), Object.keys(KIND_CATALOGUE).filter((k) => k !== 'judged-floor').sort(), 'the top class sees everything the menu still offers');
  assert.throws(() => classMenu('chartreuse'), /chartreuse/);
});

test('module 3 — the DECLARATION SCHEMA a green job is handed cannot SPELL judged-floor', () => {
  const text = JSON.stringify(declarationSchema(KIND_CATALOGUE, { verdictType: 'green' }));
  assert.ok(!text.includes('judged-floor'), 'inexpressible, not rejected after the fact');
  assert.ok(!text.includes('human-confirms'));
  assert.ok(text.includes('command-exit'));
  const soft = JSON.stringify(declarationSchema(KIND_CATALOGUE, { verdictType: 'soft-green' }));
  assert.ok(!soft.includes('judged-floor'), 'no class is offered the old judge any more (2026-11-14)');
  assert.ok(!soft.includes('human-confirms'));
  const hitl = JSON.stringify(declarationSchema(KIND_CATALOGUE, { verdictType: 'hitl' }));
  assert.ok(!hitl.includes('judged-floor') && hitl.includes('human-confirms'), 'the top class keeps the person stage, not the old judge');
});

test('module 3 — the CATALOGUE BLOCK and the whole prompt are filtered the same way', () => {
  assert.ok(!catalogueBlock(KIND_CATALOGUE, { verdictType: 'green' }).includes('judged-floor'));
  assert.ok(!catalogueBlock(KIND_CATALOGUE, { verdictType: 'soft-green' }).includes('judged-floor'));
  const args = {
    answers: { 1: 'a' },
    facts: {},
    listingBlock: '',
    lang: 'js',
    guards: classGuards({ verdictType: 'green', lang: 'js' }),
  };
  assert.ok(!authorPrompt({ ...args, verdictType: 'green' }).includes('judged-floor'),
    'the green composer is never shown the kind whose pick would red late');
  assert.ok(!authorPrompt({
    ...args, verdictType: 'soft-green', guards: classGuards({ verdictType: 'soft-green', lang: 'js' }),
  }).includes('judged-floor'), 'and the soft-green composer is not offered the old judge either');
});

// ── 5. composition: the judged stage sits AFTER the mechanical ones, once ───

// ── 6. the module 2 bridge ──────────────────────────────────────────────────
