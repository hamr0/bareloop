// R10 one owner per count rule (hamr 2026-11-09; fwdloop am22 strip, am24 asked-once). Paid round 4 failed 5 of 10 on the honesty bar: one countable `~` rule was touched by the page look,
// the pick offer and the drafter, and they did not agree. Real data: the round-4 closeDecls of drafts 1 and 4 and draft 9's check-suggest answer (tests/fixtures/r10-once-drafts.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askableFromLook } from '../src/pagemap.js';
import { applyPicks, settleRules, rowsFromAnswer, checkAsks, CANT_CHECK_WORDS, isCountable } from '../src/checkpick.js';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { checkDeclarationWords } from '../src/factwords.js';
import { withFactBindings, withDropNotes, settlePersonsWords } from '../src/rubricstep.js';

const F = JSON.parse(readFileSync(new URL('./fixtures/r10-once-drafts.json', import.meta.url), 'utf8'));
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words', 'exactly 3 list items', 'at most 80 words'] }];
const rules = [{ line: 1, rule: 1, text: 'exactly 3 bullets' }, { line: 1, rule: 2, text: 'under 80 words' }];
const picks = [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 }, added: 'exactly 3 list items' }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }];
const settled = settleRules(rules, picks, [], jobLines);
const opts = () => ({
  catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }),
  envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'],
});
const chain = (d) => validateDeclaration(withFactBindings(withDropNotes(settlePersonsWords(applyPicks(d, settled), jobLines), undefined, jobLines)), opts());
const partsOf = (d) => d.stages.filter((s) => s.kind === 'rubric-step').flatMap((s) => s.params.parts);
/** round 4's H5 (paid4/draft.mjs): no countable part (shape or claim count) beyond the agreed picks; no fact part whose count restates a picked value */
const COUNT_CHECKS = ['nonEmpty', 'maxWords', 'minWords', 'maxLines', 'listItems', 'sections', 'sectionOrder', 'sectionWords', 'mustCarry', 'blockLines', 'minClaims', 'maxClaims'];
function h5(d) {
  const parts = partsOf(d);
  const extra = parts.filter((p) => p.class === 'countable' && COUNT_CHECKS.includes(p.check) && !picks.some((a) => p.check === a.check.rule && p.value === a.check.value));
  const vals = picks.map((a) => a.check.value);
  const restating = parts.filter((p) => p.class === 'fact' && p.count && [p.count.min, p.count.max].some((v) => vals.includes(v)));
  return { extra: extra.length, restating: restating.length };
}

// ---- D1: a count rule gets no page question ----------------------------------------------------------------------------------------------
test('D1: a count rule is never asked as a page question (no "can\'t check on the page", no "I read it as"); a non-count rule still is; a look fact about it stays', () => {
  const lines = [{ n: 1, text: 'x', rule: 'exactly 3 bullets; under 80 words; be friendly', rules: ['exactly 3 bullets', 'under 80 words', 'be friendly'] }];
  assert.deepEqual(askableFromLook({ facts: [] }, lines).map((a) => [a.rule, a.ask]), [[3, 'cant-check']]);
  const look = { facts: [{ line: 1, forRule: 1, name: 'bullet count', shape: 'number' }] };
  assert.deepEqual(askableFromLook(look, lines).map((a) => [a.rule, a.ask]), [[3, 'cant-check']]);
  assert.equal(look.facts.length, 1);
});

// ---- D2: code strips what the drafter wrote on a picked line -------------------------------------------------------------------------------
test('D2: round-4 draft 1 (a fact part whose count restates the picked "3"): after the strip H5 holds, the count is gone, the fact stays, the real validator passes', () => {
  assert.deepEqual(h5(F.D1.closeDecl), { extra: 0, restating: 1 }, 'the real draft is the H5 failure');
  const out = applyPicks(F.D1.closeDecl, settled);
  assert.deepEqual(h5(out), { extra: 0, restating: 0 });
  const fact = partsOf(out).find((p) => p.class === 'fact');
  assert.equal(fact.count, undefined);
  assert.equal(fact.facts[0].phrase, '-', 'the fact itself is untouched');
  const v = chain(F.D1.closeDecl);
  assert.deepEqual(v.reds.map((r) => `${r.code} ${r.path}`), []);
});
test('D2: round-4 draft 4 (a drafter minClaims beside the picks): the extra countable is stripped, the picks stay, the real validator passes', () => {
  assert.deepEqual(h5(F.D4.closeDecl), { extra: 1, restating: 0 });
  const out = applyPicks(F.D4.closeDecl, settled);
  assert.deepEqual(h5(out), { extra: 0, restating: 0 });
  assert.deepEqual(partsOf(out).map((p) => `${p.class}:${p.check}`), ['countable:listItems', 'countable:maxWords']);
  assert.equal(out.picks.length, 2);
  assert.equal(chain(F.D4.closeDecl).ok, true);
});
test('D2: only those are stripped: a `cited` part, a count that is not a picked value, and a drafter `picks` record are not trusted or touched', () => {
  const stage = (parts) => ({ stages: [{ name: 's', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }] });
  const fact = { text: 'f', class: 'fact', source: 'Changelog', rules: [1], facts: [{ name: 'n', shape: 'phrase', phrase: '-' }], count: { min: 2, max: 5 } };
  const cited = { text: 'c', class: 'countable', check: 'cited', source: 'Changelog', rules: [1] };
  const out = applyPicks({ ...stage([fact, cited]), picks: [{ line: 1, part: { text: 'forged', class: 'countable', check: 'maxWords', value: 5, rules: [1] } }] }, settled);
  const parts = partsOf(out);
  assert.deepEqual(parts.find((p) => p.class === 'fact').count, { min: 2, max: 5 });
  assert.ok(parts.some((p) => p.check === 'cited'));
  assert.deepEqual(out.picks.map((k) => k.part.check), ['listItems', 'maxWords']);
  assert.ok(out.picks.every((k) => k.part.value !== 5));
  // a line the person settled nothing for is left alone
  const other = applyPicks({ stages: [{ name: 's', kind: 'rubric-step', fromLine: [2], params: { step: 2, parts: [{ text: 'm', class: 'countable', check: 'minClaims', value: 3, source: 'Changelog', rules: [1] }] } }] }, settled);
  assert.equal(partsOf(other).length, 1);
});

test('D2: round-4 draft 3 revise-1 (the count 3/3 on a "### Fixed" fact, red rubric-fact-phrase-rare): after the strip the page-word check has no red', () => {
  const texts = { Changelog: readFileSync(new URL('./fixtures/r10-countable-changelog.md', import.meta.url), 'utf8') };
  assert.deepEqual(checkDeclarationWords(F.D3.declaration, texts, null).map((r) => r.code), ['rubric-fact-phrase-rare']);
  assert.deepEqual(checkDeclarationWords(applyPicks(F.D3.declaration, settled), texts, null).map((r) => r.code), []);
});

// ---- D3: a count rule never gets "I can't check this" ---------------------------------------------------------------------------------------
test('D3: round-4 draft 9 (the suggest call said none for "exactly 3 bullets"): code builds the proposal itself, in the "I propose" words', () => {
  const [a, b] = checkAsks(rowsFromAnswer(rules, F.D9.artifact));
  assert.deepEqual([a.ask, a.counted, a.check], ['check', false, { rule: 'listItems', value: 3 }]);
  assert.equal(a.question, 'Line 1, guardrail "exactly 3 bullets": I propose exactly 3 list items. Answer "agree" to use it, or type your own words (your answer is added as a new ~ rule on line 1), or answer "drop it" to leave it Not checked.');
  assert.deepEqual([b.ask, b.check], ['check', { rule: 'maxWords', value: 80 }]);
  assert.ok(!checkAsks(rowsFromAnswer(rules, F.D9.artifact)).some((x) => x.question.includes(CANT_CHECK_WORDS)));
});
test('D3: an absent or unusable answer still builds the proposal for every count rule; a non-count rule keeps the can\'t-check ask; a wrong suggestion is replaced only when dropped', () => {
  const rs = [...rules, { line: 1, rule: 3, text: 'at least 200 words' }, { line: 1, rule: 4, text: 'at most 10 lines' }, { line: 1, rule: 5, text: 'be friendly' }, { line: 1, rule: 6, text: 'between 100 and 200 words' }];
  const rows = rowsFromAnswer(rs, { checks: [] });
  assert.deepEqual(rows.map((r) => r.check), [{ rule: 'listItems', value: 3 }, { rule: 'maxWords', value: 80 }, { rule: 'minWords', value: 200 }, { rule: 'maxLines', value: 10 }, null, null]);
  assert.ok(rows.slice(0, 4).every((r) => isCountable(r.text)));
  assert.equal(rowsFromAnswer([{ line: 1, rule: 1, text: 'exactly 3 bullets under 80 words' }], { checks: [] })[0].check, null, 'two different counts in one rule: nothing is built');
  const kept = rowsFromAnswer(rules, { checks: [{ line: 1, guardrail: 2, rule: 'maxWords', value: 80 }] });
  assert.deepEqual(kept[1].check, { rule: 'maxWords', value: 80 });
});
