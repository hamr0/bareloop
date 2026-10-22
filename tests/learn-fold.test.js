// Cross-run learnings, part 2: when are two cards one lesson (ITEM33-BUILD.md rev 2, section 3, RULING 3).
// Same job + same check + a shared error kind + Jaccard >= 60% on flagged-text tokens; single-link; every pair in a
// component re-checked for a shared kind. Real cards from real runs; where a card is edited the test says so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldCards, cardsMatch, jaccard, sharedKind, JACCARD_MIN } from '../src/learn.js';
import { cardsOf } from './learn-fixtures.js';

const AURORA = ['ms2c0ls7', 'ms7flkok', 'mszi97jd', 'ms2ddxjc', 'mszcfaof'];
const aurora = AURORA.flatMap((id) => cardsOf(id).cards);
const typecheck = aurora.filter((c) => c.check === 'typecheck');
const noSup = aurora.filter((c) => c.check === 'no-suppressions');
/** an edited copy of a real card (the edit is the point of the test that calls this) */
const edit = (/** @type {any} */ c, /** @type {any} */ over) => ({ ...c, ...over });

test('five runs of one job that hit the same typecheck lesson fold into ONE lesson; the other check stays apart', () => {
  assert.equal(typecheck.length, 5);
  assert.equal(noSup.length, 2);
  const groups = foldCards(aurora);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => [g[0].check, g.length]), [['typecheck', 5], ['no-suppressions', 2]]);
});

test('the same two real cards do NOT fold when the job differs (red side), and DO when the job matches (green side)', () => {
  const [a, b] = typecheck;
  assert.equal(cardsMatch(a, b).match, true);
  assert.equal(cardsMatch(a, edit(b, { job: 'some-other-job' })).match, false, 'same check, same kind, same text, different job');
  assert.equal(cardsMatch(a, edit(b, { job: 'some-other-job' }), { sameJob: false }).match, true, 'the cross-job rule drops only the job test');
  assert.equal(cardsMatch(a, edit(b, { check: 'other-check' })).match, false, 'different check');
});

test('error kind `other` never matches anything, even two cards with identical (empty) text', () => {
  const [x] = cardsOf('mties136').cards;
  const [y] = cardsOf('mv2i30bf').cards;
  assert.deepEqual([x.kinds, y.kinds], [['other'], ['other']]);
  assert.equal(sharedKind(x, y), false);
  assert.equal(cardsMatch(x, edit(y, { job: x.job })).match, false);
  assert.equal(foldCards([x, edit(y, { job: x.job })]).length, 2, 'always singletons');
});

test('the 60% line: 3 of 5 shared tokens folds, 3 of 6 does not; an empty token set scores 0', () => {
  const [a] = typecheck;
  const A = edit(a, { tokens: ['aa', 'bb', 'cc', 'dd'] });
  assert.equal(jaccard(['aa', 'bb', 'cc', 'dd'], ['aa', 'bb', 'cc', 'ee']), 3 / 5);
  assert.equal(cardsMatch(A, edit(a, { tokens: ['aa', 'bb', 'cc', 'ee'] })).match, true);
  assert.equal(cardsMatch(A, edit(a, { tokens: ['aa', 'bb', 'cc', 'ee', 'ff'] })).match, false, '3 of 6 = 50%');
  assert.equal(cardsMatch(A, edit(a, { tokens: [] })).score, 0);
  assert.equal(JACCARD_MIN, 0.6);
});

test('single-link, then every pair re-checked: a chain whose ends share no kind splits back to singletons', () => {
  const [a] = typecheck;
  const t = ['aa', 'bb', 'cc', 'dd'];
  const A = edit(a, { id: 'A', kinds: ['TS1'], tokens: t });
  const B = edit(a, { id: 'B', kinds: ['TS1', 'TS2'], tokens: t });
  const C = edit(a, { id: 'C', kinds: ['TS2'], tokens: t });
  assert.equal(cardsMatch(A, B).match && cardsMatch(B, C).match, true, 'A~B and B~C are both eligible pairs');
  assert.equal(cardsMatch(A, C).match, false, 'A and C share no kind');
  assert.deepEqual(foldCards([A, B, C]).map((g) => g.map((c) => c.id)), [['A'], ['B'], ['C']]);
  // the green side: give C a kind A also has and the chain is one lesson
  const C2 = edit(C, { kinds: ['TS1', 'TS2'] });
  assert.deepEqual(foldCards([A, B, C2]).map((g) => g.map((c) => c.id)), [['A', 'B', 'C']]);
});
