// R10 one owner per count rule (hamr 2026-11-09; fwdloop am22 strip, am24 asked-once). Paid round 4 failed 5 of 10 on the honesty bar: one countable `~` rule was touched by the page look,
// the pick offer and the drafter, and they did not agree. Real data: the round-4 closeDecls of drafts 1 and 4 and draft 9's check-suggest answer (tests/fixtures/r10-once-drafts.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askableFromLook } from '../src/pagemap.js';
import { rowsFromAnswer, CANT_CHECK_WORDS, isCountable } from '../src/checkpick.js';
import { checkDeclarationWords } from '../src/factwords.js';
import { CheckBlock } from '../src/checkblock.js';
import { questionsOfBlock } from '../src/blockasks.js';

const F = JSON.parse(readFileSync(new URL('./fixtures/r10-once-drafts.json', import.meta.url), 'utf8'));
const rules = [{ line: 1, rule: 1, text: 'exactly 3 bullets' }, { line: 1, rule: 2, text: 'under 80 words' }];
const TEXT = readFileSync(new URL('./fixtures/r10-countable-changelog.md', import.meta.url), 'utf8');
/** the check block of a job's rules over the changelog, no suggestion call (the block proposes the count checks itself) */
function asksOf(/** @type {string[]} */ ruleTexts, look = /** @type {any[]} */ ([])) {
  const b = new CheckBlock({ texts: { Changelog: TEXT }, labels: ['Changelog'] });
  b.fromJob([{ n: 1, text: 'x', rules: ruleTexts }]);
  b.addLook(look);
  b.reconcile();
  return { b, asks: questionsOfBlock(b) };
}

// ---- D1: a count rule gets no page question ----------------------------------------------------------------------------------------------
test('D1: a count rule is never asked as a page question (no "can\'t check on the page", no "I read it as"); a non-count rule still is; a look fact about it stays (askableFromLook, kept as a pure function; the block is the product\'s asker, tested right below)', () => {
  const lines = [{ n: 1, text: 'x', rule: 'exactly 3 bullets; under 80 words; be friendly', rules: ['exactly 3 bullets', 'under 80 words', 'be friendly'] }];
  assert.deepEqual(askableFromLook({ facts: [] }, lines).map((a) => [a.rule, a.ask]), [[3, 'cant-check']]);
  const look = { facts: [{ line: 1, forRule: 1, name: 'bullet count', shape: 'number' }] };
  assert.deepEqual(askableFromLook(look, lines).map((a) => [a.rule, a.ask]), [[3, 'cant-check']]);
  assert.equal(look.facts.length, 1);
});

test('D1 on the block: a count rule is asked as a CHECK proposal (never "can\'t check", never a reading); a non-count rule is a can\'t-check ask; the look\'s fact tied to the count rule stays a fact', () => {
  const { b, asks } = asksOf(['exactly 3 bullets', 'under 80 words', 'be friendly'], [{ line: 1, forRule: 1, name: 'bullet count', shape: 'phrase', source: 'Changelog', words: ['### Fixed'] }]);
  assert.deepEqual(asks.map((a) => [a.rule, a.ask]), [[3, 'cant-check'], [1, 'check'], [2, 'check']]);
  assert.equal(b.rows.find((r) => r.key === 'L1.fact.bullet count')?.state, 'built');
});

// ---- D2: code strips what the drafter wrote on a picked line: inexpressible now (the AI writes no parts), and the page-word red a restated count caused is the block's per-fact check ------------------
test('D2 on the block: a count that restates the number a ~ rule names is refused as "already says it" (no count on the fact); the real round-4 draft 3 shape (count 3 on a "### Fixed" fact the page holds fewer times) leaves the FACT Not checked in the gate\'s words, never a plan-red', () => {
  const b = new CheckBlock({ texts: { Changelog: TEXT }, labels: ['Changelog'], asks: false });
  b.fromJob([{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words'] }]);
  b.addLook([{ line: 1, name: 'section word', shape: 'phrase', source: 'Changelog', words: ['### Fixed'] }]);
  b.applyDelta({ edits: [{ op: 'add', kind: 'count', line: 1, min: 3, max: 3 }] });
  b.reconcile();
  const count = b.rows.find((r) => r.kind === 'count');
  assert.equal(count?.state, 'not-checked');
  assert.match(String(count?.reason), /a ~ rule already says it: line 1 rule 1 names the number/);
  // the saved draft's own fact part (count 3/3 on "### Fixed"): the gate's word red it caused is the one the block now meets per fact
  const texts = { Changelog: TEXT };
  assert.deepEqual(checkDeclarationWords(F.D3.declaration, texts, null).map((r) => r.code), ['rubric-fact-phrase-rare']);
  const c = new CheckBlock({ texts, labels: ['Changelog'], asks: false });
  c.fromJob([{ n: 1, text: 'List the sections', rules: [] }]);
  c.addLook([{ line: 1, name: 'section word', shape: 'phrase', source: 'Changelog', words: ['### Fixed'] }]);
  c.applyDelta({ edits: [{ op: 'add', kind: 'count', line: 1, min: 3, max: 3 }] });
  c.reconcile();
  assert.match(String(c.rows.find((r) => r.name === 'section word')?.reason), /only \d+ times?, but this line asks for 3 results/);
});

// ---- D3: a count rule never gets "I can't check this" ---------------------------------------------------------------------------------------
test('D3: round-4 draft 9 (the suggest call said none for "exactly 3 bullets"): code builds the proposal itself, in the "I propose" words, and never "I can\'t check this" for a count rule', () => {
  const { asks } = asksOf(['exactly 3 bullets', 'under 80 words']);
  const [a, b] = asks;
  assert.deepEqual([a.ask, a.counted, a.check], ['check', false, { rule: 'listItems', value: 3 }]);
  assert.equal(a.question, 'Line 1, guardrail "exactly 3 bullets": I propose exactly 3 list items. Answer "agree" to use it, or type your own words (your answer is added as a new ~ rule on line 1), or answer "drop it" to leave it Not checked.');
  assert.deepEqual([b.ask, b.check], ['check', { rule: 'maxWords', value: 80 }]);
  assert.ok(!asks.some((x) => x.question.includes(CANT_CHECK_WORDS)));
});
test('D3: with no suggestion every count rule still gets its proposal; a non-count rule is the can\'t-check ask; two different counts in one rule build nothing; (rowsFromAnswer keeps its own rows for the pick path)', () => {
  const texts = ['exactly 3 bullets', 'under 80 words', 'at least 200 words', 'at most 10 lines', 'be friendly', 'between 100 and 200 words'];
  const { asks } = asksOf(texts);
  assert.deepEqual(asks.map((a) => [a.rule, a.ask, a.check ?? null]), [[5, 'cant-check', null], [6, 'cant-check', null], [1, 'check', { rule: 'listItems', value: 3 }], [2, 'check', { rule: 'maxWords', value: 80 }], [3, 'check', { rule: 'minWords', value: 200 }], [4, 'check', { rule: 'maxLines', value: 10 }]]);
  assert.ok(texts.slice(0, 4).every((t) => isCountable(t)));
  assert.equal(asksOf(['exactly 3 bullets under 80 words']).asks[0].ask, 'cant-check', 'two different counts in one rule: nothing is built');
  const rs = [...rules, { line: 1, rule: 3, text: 'at least 200 words' }, { line: 1, rule: 4, text: 'at most 10 lines' }, { line: 1, rule: 5, text: 'be friendly' }, { line: 1, rule: 6, text: 'between 100 and 200 words' }];
  assert.deepEqual(rowsFromAnswer(rs, { checks: [] }).map((r) => r.check), [{ rule: 'listItems', value: 3 }, { rule: 'maxWords', value: 80 }, { rule: 'minWords', value: 200 }, { rule: 'maxLines', value: 10 }, null, null]);
});
