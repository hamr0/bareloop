// hamr 2026-11-15: "same flow as rubric, no exceptions; same CheckBlock, only the TYPE of checks varies". A repo job's rows live in the ONE check block: a `~` rule is kept by the write fence only when CODE finds a repo
// path in the person's own words that lies outside the fence; every other rule is asked about (Agree / Drop it / own words), as a rubric rule is. Real data: session smwhxoarri6xz (run mwhvvvap), where the old
// drafter-claim proof "kept" `no new dependencies at all` (via package.json) and `keep the comment at the top of src/sum.js` (via a tracked .bareloop/ copy of it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock, REASON } from '../src/checkblock.js';
import { questionsOfBlock, applyChoices } from '../src/blockasks.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { validateCloseDecl } from '../src/declaredclose.js';

const live = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smwhxoarri6xz-live.json', import.meta.url), 'utf8'));
const FILES = live.files.filter((/** @type {string} */ f) => !f.startsWith('.bareloop/'));
const SURVEY = { state: 'PRESENT', reason: null, calls: [], facts: { language: 'javascript', runner: 'node --test', sourcePaths: ['src'], testPaths: [], extensions: ['.js'] }, meta: { bytes: 1, rounds: 1, bounded: false, recovered: false, error: null } };

/** @param {{asks?: boolean, files?: string[]|null}} [o] */
function liveBlock({ asks = true, files = FILES } = {}) {
  const b = new CheckBlock({ texts: {}, labels: [], asks, repo: { files, writeScope: live.writeScope } });
  b.setGuards(['changed-from-seed', 'no-suppressions'], live.writeScope);
  b.fromJob(live.jobLines);
  b.reconcile();
  return b;
}
const rule = (/** @type {CheckBlock} */ b, /** @type {number} */ k) => b.rows.find((r) => r.kind === 'rule' && r.rule === k);

test('the live job: rule 1 is kept by the fence (test/ is in the words), rules 2 and 3 are QUESTIONS, never falsely kept', () => {
  const b = liveBlock();
  assert.deepEqual([rule(b, 1)?.state, rule(b, 1)?.fence], ['built', 'test']);
  assert.equal(rule(b, 2)?.state, 'not-checked');
  assert.equal(rule(b, 3)?.state, 'not-checked');
  assert.equal(rule(b, 2)?.fence, undefined);
  assert.equal(rule(b, 3)?.fence, undefined);
  const asks = questionsOfBlock(b);
  assert.deepEqual(asks.map((a) => [a.rule, a.ask]), [[2, 'cant-check'], [3, 'cant-check']]);
  assert.ok(asks.every((a) => !/on the page/.test(a.question)), 'a repo question never says "page"');
  assert.deepEqual(b.signedRows().filter((r) => r.kind === 'rule').map((r) => r.key), ['L1.~1', 'L1.~2', 'L1.~3']);
});

test('the proof reads the PERSON\'s words, never a path the AI pointed at: the listing path must be in the rule text', () => {
  const b = liveBlock();
  assert.equal(b.fenceKeeps('no new dependencies at all'), null, 'package.json is not in those words');
  assert.equal(b.fenceKeeps("don't edit test/"), 'test');
  assert.equal(b.fenceKeeps('leave package.json alone.'), 'package.json');
  assert.equal(b.fenceKeeps('do not touch ./package.json'), 'package.json');
  assert.equal(b.fenceKeeps('keep the comment at the top of src/sum.js'), null, 'src/sum.js is a place the run may change');
  assert.equal(b.fenceKeeps('keep package.json and src/sum.js as they are'), null, 'one named path is inside the fence: not kept');
  assert.equal(b.fenceKeeps('keep the tests short'), null, 'a folder word without its slash is not a path');
  assert.equal(b.fenceKeeps("don't edit test/sum.test.js"), 'test/sum.test.js');
});

test('a tracked bareloop store path never keeps a rule (the old leak): the listing without it, the words name no path', () => {
  const b = liveBlock({ files: live.files });
  // the patient\'s own `.bareloop/wt/.../src/sum.js` is only a leaked path if it is OFFERED; code still never keeps a rule from words that name no outside path
  assert.equal(b.fenceKeeps('keep the comment at the top of src/sum.js'), null);
});

test('no listing read: nothing is kept', () => {
  const b = liveBlock({ files: null });
  assert.equal(rule(b, 1)?.state, 'not-checked');
});

test('Drop it leaves the rule Not checked with REASON.left; own words are re-proved (one in, one out); Agree is not offered', () => {
  const b = liveBlock();
  const [q2, q3] = questionsOfBlock(b);
  assert.equal(b.open.find((q) => q.key === q2.key)?.offers.agree, false);
  assert.deepEqual(applyChoices(b, [{ key: q2.key, choice: 'rule', text: 'do not change package.json' }, { key: q3.key, choice: 'drop' }]), []);
  assert.deepEqual([rule(b, 2)?.state, rule(b, 2)?.fence, rule(b, 2)?.text], ['built', 'package.json', 'do not change package.json']);
  assert.deepEqual([rule(b, 3)?.state, rule(b, 3)?.reason], ['not-checked', REASON.left]);
  assert.equal(b.open.length, 0);
  assert.deepEqual(b.jobLinesView(live.jobLines)[0].rules, ["don't edit test/", 'do not change package.json', 'keep the comment at the top of src/sum.js']);
});

test('own words that name no outside path stay Not checked (typed words are the person\'s to judge, never asked twice)', () => {
  const b = liveBlock();
  const [q2] = questionsOfBlock(b);
  applyChoices(b, [{ key: q2.key, choice: 'rule', text: 'use only what is already installed' }]);
  assert.deepEqual([rule(b, 2)?.state, rule(b, 2)?.reason], ['not-checked', REASON.nothingOnPage]);
  assert.deepEqual(questionsOfBlock(b).map((a) => a.rule), [3]);
});

test('nobody to ask (no answer seam): a rule code cannot prove is Not checked with REASON.noRule', () => {
  const b = liveBlock({ asks: false });
  assert.deepEqual([rule(b, 2)?.state, rule(b, 2)?.reason], ['not-checked', REASON.noRule]);
  assert.equal(b.open.length, 0);
});

test('authorCloseForJob on the live job: the questions are the two rules, answers land in the one signed list, no rule shows twice', async () => {
  /** @type {any[]} */ const seen = [];
  const jobLines = structuredClone(live.jobLines);
  const r = await authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
    jobLines, writeScope: live.writeScope,
    scoutFn: async () => SURVEY, listingFn: async () => ({ stop: null, files: live.files.filter((/** @type {string} */ f) => !f.startsWith('.bareloop/')) }),
    answerQuestions: async ({ questions }) => {
      seen.push(...questions);
      return { jobLines, answers: { 1: 'x' }, left: [], picks: [], choices: questions.map((q) => ({ key: String(/** @type {any} */ (q).key), choice: 'drop' })) };
    },
    authorFn: async () => ({ ok: true, declaration: { stages: live.stages }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: null, ledger: null }),
  });
  assert.equal(r.ok, true);
  assert.deepEqual(seen.map((q) => [q.rule, q.ask]), [[2, 'cant-check'], [3, 'cant-check']]);
  const list = r.closeDecl.list;
  assert.deepEqual(list.filter((/** @type {any} */ x) => x.kind === 'rule').map((/** @type {any} */ x) => [x.rule, x.state, x.fence ?? null, x.reason ?? null]),
    [[1, 'built', 'test', null], [2, 'not-checked', null, REASON.left], [3, 'not-checked', null, REASON.left]]);
  assert.deepEqual(r.closeDecl.refused.map((/** @type {any} */ x) => [x.line, x.rule]), [[1, 2], [1, 3]], 'refused is built from the rows in code: each rule once');
  assert.equal(list.filter((/** @type {any} */ x) => x.kind === 'stage').length, 3);
});

test('a repo work stage is a `!` row: Drop takes it out of the close, never the last check on its line; Add puts it back', () => {
  const b = liveBlock();
  b.addStages(live.stages, { guardNames: ['changed-from-seed', 'no-suppressions'], refused: [], guardLines: [] });
  b.reconcile();
  const rows = () => b.rows.filter((r) => r.kind === 'stage');
  assert.deepEqual(rows().map((r) => [r.key, r.state]), [['S.sum-tests-green', 'built'], ['S.sum-tests-failing', 'built'], ['S.sum-tests-executed', 'built']]);
  assert.deepEqual(b.rowChoice('S.sum-tests-failing', 'drop'), { ok: true });
  assert.equal(b.closeView().stages.some((/** @type {any} */ s) => s.name === 'sum-tests-failing'), false);
  assert.equal(b.signedRows().find((r) => r.key === 'S.sum-tests-failing')?.state, 'dropped');
  assert.deepEqual(b.rowChoice('S.sum-tests-executed', 'drop'), { ok: true });
  const last = b.rowChoice('S.sum-tests-green', 'drop');
  assert.equal(last.ok, false, 'the last check on line 1 stays');
  assert.deepEqual(b.rowChoice('S.sum-tests-failing', 'add'), { ok: true });
  assert.equal(b.closeView().stages.some((/** @type {any} */ s) => s.name === 'sum-tests-failing'), true);
  assert.equal(b.rowChoice('J.$guard.changed-from-seed', 'drop').ok, false, 'a `$` row is code\'s own');
});

test('Revise carries a repo Drop: the record ties it to the line\'s words and the stage; the next draft drops the same stage, never the last one', () => {
  const b = liveBlock();
  b.addStages(live.stages, { guardNames: ['changed-from-seed', 'no-suppressions'] });
  b.reconcile();
  b.rowChoice('S.sum-tests-failing', 'drop');
  const rec = b.choicesRecord();
  assert.deepEqual(rec.map((c) => [c.tail, c.choice]), [['S.sum-tests-failing', 'drop']]);
  const next = liveBlock();
  next.addStages(live.stages, { guardNames: ['changed-from-seed', 'no-suppressions'] });
  next.carryChoices(rec);
  next.reconcile();
  assert.equal(next.rows.find((r) => r.key === 'S.sum-tests-failing')?.state, 'dropped');
  // a carried drop of every stage keeps the last one
  const all = liveBlock();
  all.addStages(live.stages, { guardNames: ['changed-from-seed', 'no-suppressions'] });
  all.carryChoices(['S.sum-tests-green', 'S.sum-tests-failing', 'S.sum-tests-executed'].map((tail) => ({ ...rec[0], tail })));
  all.reconcile();
  assert.equal(all.rows.filter((r) => r.kind === 'stage' && r.state === 'built').length, 1);
});

test('a drafter that still writes fenceKept and a rule-level refused (the live run\'s own claims) changes nothing: code reads neither, and the signed close carries neither claim', async () => {
  const jobLines = structuredClone(live.jobLines);
  const r = await authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
    jobLines, writeScope: live.writeScope,
    scoutFn: async () => SURVEY, listingFn: async () => ({ stop: null, files: FILES }),
    authorFn: async () => ({ ok: true, declaration: { stages: live.stages, fenceKept: live.fenceKept, refused: live.refused }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: null, ledger: null }),
  });
  assert.equal(r.ok, true);
  assert.equal('fenceKept' in r.closeDecl, false, 'the drafter\'s fence claim is not signed');
  assert.deepEqual(r.closeDecl.list.filter((/** @type {any} */ x) => x.kind === 'rule').map((/** @type {any} */ x) => [x.rule, x.state, x.fence ?? null]), [[1, 'built', 'test'], [2, 'not-checked', null], [3, 'not-checked', null]]);
  assert.deepEqual(r.closeDecl.refused.map((/** @type {any} */ x) => [x.line, x.rule, x.reason]), [[1, 2, REASON.noRule], [1, 3, REASON.noRule]], 'refused is built from the rows: each rule once, code\'s reason, never the drafter\'s swapped words');
  assert.deepEqual(validateCloseDecl(r.closeDecl, { at: 'closeDecl', verdictType: 'green', listing: FILES }).reds.filter((/** @type {any} */ x) => /list\[|fenceKept|refused/.test(String(x.path))), []);
});

test('authorCloseForJob: a Revise carries the last draft\'s repo Drop (carriedChoices); the stage leaves the signed close and its list row signs `dropped`; onChoices hands the record on', async () => {
  const jobLines = structuredClone(live.jobLines);
  const carried = [{ lineWords: jobLines[0].text.toLowerCase(), occurrence: 0, tail: 'S.sum-tests-failing', choice: 'drop' }];
  /** @type {any[]} */ const handed = [];
  const r = await authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
    jobLines, writeScope: live.writeScope, carriedChoices: carried, onChoices: (rec) => handed.push(rec),
    scoutFn: async () => SURVEY, listingFn: async () => ({ stop: null, files: FILES }),
    authorFn: async () => ({ ok: true, declaration: { stages: live.stages }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: null, ledger: null }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.closeDecl.stages.some((/** @type {any} */ s) => s.name === 'sum-tests-failing'), false);
  assert.equal(r.closeDecl.list.find((/** @type {any} */ x) => x.key === 'S.sum-tests-failing').state, 'dropped');
  assert.deepEqual(handed, [carried]);
});

test('a line the drafter refused (no rule named) is one Not checked `!` row on that line in its words, shown once; a rule is never refused by the drafter', () => {
  const b = liveBlock();
  b.addStages(live.stages, { guardNames: ['changed-from-seed', 'no-suppressions'], refused: [{ line: 1, reason: 'nothing here can read it' }, { line: 1, rule: 1, reason: 'the AI\'s own words' }] });
  b.reconcile();
  const row = b.rows.find((r) => r.key === 'L1.refused.1');
  assert.deepEqual([row?.kind, row?.state, row?.reason], ['stage', 'not-checked', 'nothing here can read it']);
  assert.equal(b.rows.filter((r) => r.kind === 'stage' && r.refusal).length, 1, 'a rule-level refusal makes no row');
  assert.equal(rule(b, 1)?.state, 'built', 'and does not set the rule\'s state or reason');
  assert.equal(b.rowChoice('L1.refused.1', 'drop').ok, false, 'a refusal is no check: nothing to drop');
});
