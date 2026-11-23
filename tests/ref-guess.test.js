// "Did you mean branch: X?" (hamr 2026-11-23): no prose parsing, but GUIDE the person. A job with no typed `branch:`/`range:` token, in which a WORD equals a real local branch of the repo (code compares against the repo, exact
// match, no word list), or a word shaped `A..B` whose two ends both resolve (a REVIEW job only), gets ONE code-written yes/no question; Yes writes the typed token onto that job line (the same path as a typed token), No leaves it.
// REAL git in a real temp repo (tests/range-world.mjs): main + branch feat + tag v1.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { refGuess, refGuessQuestion } from '../src/refguess.js';
import { createSession } from '../src/panel/authorsession.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { gitInPatient } from './helpers.js';
import { makeRangeWorld } from './range-world.mjs';

const lines = (/** @type {string[]} */ ...t) => t.map((text, i) => ({ n: i + 1, text }));

test('refGuess: a word that IS a local branch name is a branch guess; a typed token, a word that is no branch, or a flag-shaped word is none', async (t) => {
  const w = makeRangeWorld(t);
  assert.deepEqual(await refGuess({ repo: w.repo, jobLines: lines('Fix the tests', 'Review feat for bugs') }), { kind: 'branch', name: 'feat', line: 2 });
  assert.equal(await refGuess({ repo: w.repo, jobLines: lines('Fix the tests on branch: feat') }), null, 'a typed token is already there');
  assert.equal(await refGuess({ repo: w.repo, jobLines: lines('Fix the tests', 'range: v1..feat') }), null);
  assert.equal(await refGuess({ repo: w.repo, jobLines: lines('Fix the failing tests') }), null);
  assert.equal(await refGuess({ repo: w.repo, jobLines: lines('--feat -feat') }), null);
});

test('refGuess: a word A..B whose ends both resolve is a range guess on a REVIEW job only; a change job gets no range question; an end that does not resolve is none', async (t) => {
  const w = makeRangeWorld(t);
  assert.deepEqual(await refGuess({ repo: w.repo, review: true, jobLines: lines('Review v1..feat for bugs') }), { kind: 'range', a: 'v1', b: 'feat', line: 1 });
  assert.equal(await refGuess({ repo: w.repo, review: false, jobLines: lines('Change v1..feat') }), null);
  assert.equal(await refGuess({ repo: w.repo, review: true, jobLines: lines('Review v9..feat') }), null);
  assert.equal(refGuessQuestion({ kind: 'branch', name: 'feat', line: 1 }), 'Did you mean branch: feat?');
  assert.equal(refGuessQuestion({ kind: 'range', a: 'v1', b: 'feat', line: 1 }), 'Did you mean range: v1..feat?');
});

async function session(t, jobText, answer) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  gitInPatient(repo, ['branch', 'feat']);
  gitInPatient(repo, ['tag', 'v1']);
  const seams = draftSeams({});
  const card = baseCard({ source: repo, jobName: 'rg-job', jobText, destination: 'src/' });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, reviewPick: async () => ({ answer, reason: null }) });
  return s;
}
const signedLines = async (s) => {
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `no menu (${s.state.phase} ${s.state.error})`);
  s.signPrepare();
  assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared (${s.state.phase} ${s.state.error})`);
  return JSON.parse(readFileSync(s.state.resolvedSpecPath, 'utf8')).jobLines.map((l) => l.text);
};

test('panel door: a change job whose line holds the word feat asks "Did you mean branch: feat?"; Yes writes `branch: feat` on that line, No leaves the line as typed', async (t) => {
  const yes = await session(t, 'Fix the tests on feat\n~ keep the API', 'change');
  assert.ok(await until(() => yes.state.pendingAsk?.source === 'ref-point'), `no question (${yes.state.phase} ${yes.state.error})`);
  assert.equal(yes.state.pendingAsk.question, 'Did you mean branch: feat?');
  assert.deepEqual(yes.state.pendingAsk.box.choices.map((c) => c.choice), ['yes', 'no']);
  yes.send('yes');
  assert.deepEqual(await signedLines(yes), ['Fix the tests on feat branch: feat']);
  // the page's Job box follows state.card.jobText: box and plan card must read the same line (hamr, seen live)
  assert.match(yes.state.card.jobText, /^Fix the tests on feat branch: feat\n~ keep the API$/);
  const no = await session(t, 'Fix the tests on feat\n~ keep the API', 'change');
  assert.ok(await until(() => no.state.pendingAsk?.source === 'ref-point'));
  no.send('no');
  assert.deepEqual(await signedLines(no), ['Fix the tests on feat']);
  assert.equal(no.state.card.jobText, 'Fix the tests on feat\n~ keep the API', 'No changes nothing');
});

test('panel door: a review job with a word v1..feat asks "Did you mean range: v1..feat?" and Yes writes `range: v1..feat`; a change job with the same word asks nothing about a range; a typed token asks nothing', async (t) => {
  const rv = await session(t, 'Review v1..feat for bugs\n~ say why', 'review');
  assert.ok(await until(() => rv.state.pendingAsk?.source === 'ref-point'), `no question (${rv.state.phase} ${rv.state.error})`);
  assert.equal(rv.state.pendingAsk.question, 'Did you mean range: v1..feat?');
  rv.send('yes');
  // a review signs on the rubric road, which this suite's change-shaped fake composer cannot compose: read the line as the plan card shows it
  assert.ok(await until(() => rv.state.pendingAsk?.kind === 'menu'), `no menu (${rv.state.phase} ${rv.state.error})`);
  assert.match(JSON.stringify(rv.state.messages), /Review v1\.\.feat for bugs range: v1\.\.feat/);
  const ch = await session(t, 'Fix v1..feat\n~ keep the API', 'change');
  assert.deepEqual(await signedLines(ch), ['Fix v1..feat'], 'no question, drafted straight to the menu');
  const typed = await session(t, 'Fix the tests branch: feat\n~ keep the API', 'change');
  assert.deepEqual(await signedLines(typed), ['Fix the tests branch: feat']);
});
