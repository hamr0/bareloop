// hamr 2026-11-15: "same flow as rubric, no exceptions; same CheckBlock, only the TYPE of checks varies". A repo job's rows live in the ONE check block: a `~` rule is kept by the write fence only when CODE finds a repo
// path in the person's own words that lies outside the fence; every other rule is asked about (Agree / Drop it / own words), as a rubric rule is. Real data: session smwhxoarri6xz (run mwhvvvap), where the old
// drafter-claim proof "kept" `no new dependencies at all` (via package.json) and `keep the comment at the top of src/sum.js` (via a tracked .bareloop/ copy of it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock, REASON } from '../src/checkblock.js';
import { questionsOfBlock, applyChoices } from '../src/blockasks.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { FENCE_POINT_TOOL, FENCE_POINT_SYSTEM, runFencePoint } from '../src/fencepointcall.js';
import { validateCloseDecl } from '../src/declaredclose.js';

const live = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smwhxoarri6xz-live.json', import.meta.url), 'utf8'));
const FILES = live.files.filter((/** @type {string} */ f) => !f.startsWith('.bareloop/'));
const SURVEY = { state: 'PRESENT', reason: null, calls: [], facts: { language: 'javascript', runner: 'node --test', sourcePaths: ['src'], testPaths: [], extensions: ['.js'] }, meta: { bytes: 1, rounds: 1, bounded: false, recovered: false, error: null } };

/** the AI's pointer for rule 1 of the live job (`don't edit test/`), as the row-edit door carries it */
const POINT_TEST = { op: 'fence', line: 1, rule: 1, path: 'test' };
/** a fake model boundary that delivers the given edits through the pointing call's tool (what a real model does) */
const pointer = (/** @type {any[]} */ edits, /** @type {any[]} */ seen = []) => async (/** @type {any[]} */ m, /** @type {any[]} */ tools) => {
  seen.push(m.at(-1).content);
  await tools.find((t) => t.name === FENCE_POINT_TOOL).execute({ edits });
  return { text: '', error: null, msgs: [], metrics: { costUsd: 0.001, unpricedRounds: 0 } };
};

/** @param {{asks?: boolean, files?: string[]|null, point?: any[]}} [o] */
function liveBlock({ asks = true, files = FILES, point = [POINT_TEST] } = {}) {
  const b = new CheckBlock({ texts: {}, labels: [], asks, repo: { files, writeScope: live.writeScope } });
  b.setGuards(['changed-from-seed', 'no-suppressions'], live.writeScope);
  b.fromJob(live.jobLines);
  b.reconcile();
  if (point.length) { b.applyDelta({ label: 'pre:fence-point', pre: true, edits: point }); b.reconcile(); }
  return b;
}
const rule = (/** @type {CheckBlock} */ b, /** @type {number} */ k) => b.rows.find((r) => r.kind === 'rule' && r.rule === k);

test('the live job: rule 1 is kept by the fence (the AI pointed at test/, the words name it), rules 2 and 3 are Not checked at once with the code reason (option A: no question whose only answer is Drop it), never falsely kept', () => {
  const b = liveBlock();
  assert.deepEqual([rule(b, 1)?.state, rule(b, 1)?.fence], ['built', 'test']);
  assert.equal(rule(b, 2)?.state, 'not-checked');
  assert.equal(rule(b, 3)?.state, 'not-checked');
  assert.equal(rule(b, 2)?.fence, undefined);
  assert.equal(rule(b, 3)?.fence, undefined);
  assert.deepEqual(questionsOfBlock(b), [], 'nothing is asked');
  assert.deepEqual([rule(b, 2)?.reason, rule(b, 3)?.reason], [REASON.noRule, REASON.noRule]);
  assert.deepEqual(b.signedRows().filter((r) => r.kind === 'rule').map((r) => r.key), ['L1.~1', 'L1.~2', 'L1.~3']);
});

test('the proof: a path the AI points at must be on the listing, in the rule\'s OWN words, and outside the write scope', () => {
  const b = liveBlock({ point: [] });
  assert.equal(b.provesFence('no new dependencies at all', 'package.json'), false, 'package.json is not in those words');
  assert.equal(b.provesFence("don't edit test/", 'test'), true);
  assert.equal(b.provesFence('leave package.json alone.', 'package.json'), true);
  assert.equal(b.provesFence('do not touch ./package.json', 'package.json'), true);
  assert.equal(b.provesFence('keep the comment at the top of src/sum.js', 'src/sum.js'), false, 'src/sum.js is a place the run may change');
  assert.equal(b.provesFence('keep package.json and src/sum.js as they are', 'package.json'), false, 'one named path is inside the fence: not kept');
  assert.equal(b.provesFence('keep the tests short', 'test'), false, 'a folder word without its slash is not a path');
  assert.equal(b.provesFence("don't edit test/sum.test.js", 'test/sum.test.js'), true);
  assert.equal(b.provesFence("don't edit test/", 'lockfile.json'), false, 'a path not on the listing');
});

test('code never keeps a rule the AI did not point at: "the tests in test/ must pass" names test/ outside the fence, but with no pointer it is Not checked (not asked)', () => {
  const b = liveBlock({ point: [] });
  b.rows.find((r) => r.kind === 'rule' && r.rule === 1).text = 'the tests in test/ must pass';
  b.reconcile();
  assert.equal(rule(b, 1)?.state, 'not-checked');
  assert.equal(rule(b, 1)?.fence, undefined);
  assert.deepEqual(questionsOfBlock(b), []);
});

test('a pointer that fails the proof is refused alone with its reason and the rule is Not checked; the other pointers stand', () => {
  const b = liveBlock({ point: [] });
  const rec = b.applyDelta({ pre: true, edits: [{ op: 'fence', line: 1, rule: 2, path: 'package.json' }, { op: 'fence', line: 1, rule: 3, path: 'src/sum.js' }, { op: 'fence', line: 1, rule: 1, path: 'nope.txt' }, POINT_TEST, { op: 'fence', line: 9, rule: 1, path: 'test' }] });
  b.reconcile();
  assert.deepEqual(rec.edits.map((e) => e.accepted), [false, false, false, true, false]);
  assert.match(rec.edits[0].refusedBecause, /do not name package\.json/);
  assert.match(rec.edits[2].refusedBecause, /not on the repo listing/);
  assert.deepEqual([rule(b, 1)?.state, rule(b, 2)?.state, rule(b, 3)?.state], ['built', 'not-checked', 'not-checked']);
  assert.deepEqual(questionsOfBlock(b), []);
});

test('a tracked bareloop store path never keeps a rule (the old leak): a pointer at it is refused', () => {
  const b = liveBlock({ files: FILES, point: [] });
  const rec = b.applyDelta({ pre: true, edits: [{ op: 'fence', line: 1, rule: 3, path: '.bareloop/wt/smw6lfgjqkal1/src/sum.js' }] });
  assert.equal(rec.edits[0].accepted, false);
  assert.equal(rule(b, 3)?.state, 'not-checked');
});

test('no listing read: nothing is kept', () => {
  const b = liveBlock({ files: null });
  assert.equal(rule(b, 1)?.state, 'not-checked');
});

test('a rule the fence cannot keep has no question to answer, so it is Not checked with REASON.noRule; the job text keeps its words (Revise is how a rule changes)', () => {
  const b = liveBlock();
  assert.equal(b.open.length, 0);
  assert.deepEqual([rule(b, 2)?.state, rule(b, 2)?.fence, rule(b, 2)?.reason], ['not-checked', undefined, REASON.noRule]);
  assert.deepEqual([rule(b, 3)?.state, rule(b, 3)?.reason], ['not-checked', REASON.noRule]);
  assert.deepEqual(b.jobLinesView(live.jobLines)[0].rules, ["don't edit test/", 'no new dependencies at all', 'keep the comment at the top of src/sum.js']);
});

test('nobody to ask (no answer seam): a rule code cannot prove is Not checked with REASON.noRule', () => {
  const b = liveBlock({ asks: false });
  assert.deepEqual([rule(b, 2)?.state, rule(b, 2)?.reason], ['not-checked', REASON.noRule]);
  assert.equal(b.open.length, 0);
});

test('authorCloseForJob on the live job: nothing is asked, the two rules land Not checked in the one signed list, no rule shows twice', async () => {
  /** @type {any[]} */ const seen = [];
  const jobLines = structuredClone(live.jobLines);
  const r = await authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
    jobLines, writeScope: live.writeScope, fenceGenerate: pointer([POINT_TEST]),
    scoutFn: async () => SURVEY, listingFn: async () => ({ stop: null, files: live.files.filter((/** @type {string} */ f) => !f.startsWith('.bareloop/')) }),
    answerQuestions: async ({ questions }) => {
      seen.push(...questions);
      return { jobLines, answers: { 1: 'x' }, left: [], picks: [], choices: questions.map((q) => ({ key: String(/** @type {any} */ (q).key), choice: 'drop' })) };
    },
    authorFn: async () => ({ ok: true, declaration: { stages: live.stages }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: null, ledger: null }),
  });
  assert.equal(r.ok, true);
  assert.deepEqual(seen, [], 'answerQuestions is never called: no rule has a question');
  const list = r.closeDecl.list;
  assert.deepEqual(list.filter((/** @type {any} */ x) => x.kind === 'rule').map((/** @type {any} */ x) => [x.rule, x.state, x.fence ?? null, x.reason ?? null]),
    [[1, 'built', 'test', null], [2, 'not-checked', null, REASON.noRule], [3, 'not-checked', null, REASON.noRule]]);
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
    jobLines, writeScope: live.writeScope, fenceGenerate: pointer([POINT_TEST]),
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

test('a drafter line refusal is ignored when a live stage covers the line; a line nothing covers gets one Not checked `!` row with the REASON table words; a rule is never refused by the drafter', () => {
  const guards = ['changed-from-seed', 'no-suppressions'];
  const refused = [{ line: 1, reason: 'nothing here can read it' }, { line: 1, rule: 1, reason: 'the AI\'s own words' }];
  const covered = liveBlock();
  covered.addStages(live.stages, { guardNames: guards, refused });
  covered.reconcile();
  assert.equal(covered.rows.filter((r) => r.kind === 'stage' && r.refusal).length, 0, 'line 1 has three stages: nothing to refuse (the live session smwi20ir86wxj showed the extra row)');
  const bare = liveBlock();
  bare.addStages(live.stages.filter((/** @type {any} */ s) => guards.includes(s.name)), { guardNames: guards, refused });
  bare.reconcile();
  const row = bare.rows.find((r) => r.key === 'L1.refused.1');
  assert.deepEqual([row?.kind, row?.state, row?.reason], ['stage', 'not-checked', REASON.noRule], 'the drafter\'s words are only the signal; the reason is code\'s');
  assert.equal(bare.rows.filter((r) => r.kind === 'stage' && r.refusal).length, 1, 'a rule-level refusal makes no row');
  assert.equal(rule(bare, 1)?.state, 'built', 'and does not set the rule\'s state or reason');
  assert.equal(bare.rowChoice('L1.refused.1', 'drop').ok, false, 'a refusal is no check: nothing to drop');
  const guarded = liveBlock();
  guarded.addStages(live.stages.filter((/** @type {any} */ s) => guards.includes(s.name)), { guardNames: guards, refused, guardLines: [{ guard: 'no-suppressions', lines: [1] }] });
  assert.equal(guarded.rows.filter((r) => r.refusal).length, 0, 'a guard\'s guardLines covers the line too');
});

test('the signed close of a covered line carries no line-level refusal (the live smwi20ir86wxj row)', async () => {
  const r = await callFlow({ authorFn: async () => ({ ok: true, declaration: { stages: live.stages, refused: [{ line: 1, reason: 'x' }] }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: null, ledger: null }) });
  assert.equal(r.closeDecl.list.some((/** @type {any} */ x) => /refused/.test(x.key)), false);
  assert.equal((r.closeDecl.refused ?? []).some((/** @type {any} */ x) => !Number.isInteger(x.rule)), false);
});

test('the pointing call is shown the folders holding outside files (`test/`) beside the files, and a pointer at the folder is kept', async () => {
  const b = liveBlock({ point: [] });
  assert.deepEqual(b.outsideFolders(), ['test']);
  /** @type {any[]} */ const done = [];
  const r = await callFlow({ fenceGenerate: pointer([{ op: 'fence', line: 1, rule: 1, path: 'test/' }]), onPhase: (/** @type {string} */ p, /** @type {any} */ d) => { if (p === 'fence-point-done') done.push(d); } });
  assert.equal(r.closeDecl.list.find((/** @type {any} */ x) => x.kind === 'rule' && x.rule === 1).fence, 'test');
  assert.deepEqual(done[0].edits, [{ op: 'fence', line: 1, rule: 1, path: 'test/' }], 'the reply rides the phase data');
  assert.deepEqual(done[0].results.map((/** @type {any} */ e) => [e.path, e.accepted]), [['test/', true]]);
});

test('a refused pointer is recorded with its reason in the phase data', async () => {
  /** @type {any[]} */ const done = [];
  await callFlow({ fenceGenerate: pointer([{ op: 'fence', line: 1, rule: 1, path: 'test/sum.test.js' }]), onPhase: (/** @type {string} */ p, /** @type {any} */ d) => { if (p === 'fence-point-done') done.push(d); } });
  assert.equal(done[0].results[0].accepted, false);
  assert.match(done[0].results[0].refusedBecause, /do not name test\/sum\.test\.js/);
});

const callFlow = (/** @type {any} */ o) => authorCloseForJob({
  verdictType: 'green', answers: { 1: '1. Fix the bug.' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
  jobLines: structuredClone(live.jobLines), writeScope: live.writeScope,
  scoutFn: async () => SURVEY, listingFn: async () => ({ stop: null, files: FILES }),
  authorFn: async () => ({ ok: true, declaration: { stages: live.stages }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: null, ledger: null }),
  ...o,
});

test('the pointing call: one call before the asks, its user text names each rule\'s words and the outside-scope paths only, its cost is booked through onCall', async () => {
  /** @type {string[]} */ const seen = []; /** @type {any[]} */ const booked = []; /** @type {string[]} */ const phases = [];
  const r = await callFlow({ fenceGenerate: pointer([POINT_TEST], seen), onCall: (/** @type {any} */ c) => booked.push(c), onPhase: (/** @type {string} */ p) => phases.push(p) });
  assert.equal(r.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], ["THE RULES (the person's own words)", "line 1 rule 1: don't edit test/", 'line 1 rule 2: no new dependencies at all', 'line 1 rule 3: keep the comment at the top of src/sum.js', '', 'PATHS OUTSIDE THE WRITE SCOPE (src/):', '- test/', '- package.json', '- test/sum.test.js'].join('\n'));
  assert.deepEqual(booked.map((c) => c.label), ['fence-point']);
  assert.ok(phases.indexOf('fence-point') >= 0 && phases.indexOf('fence-point') < phases.indexOf('author'), 'point, then asks, then the draft');
  assert.equal(r.closeDecl.list.find((/** @type {any} */ x) => x.kind === 'rule' && x.rule === 1).state, 'built');
});

test('the pointing call is conditional: no `~` rules, or no path outside the fence, or no model boundary = no call (a rule is then Not checked, not asked)', async () => {
  let n = 0;
  const counting = async () => { n += 1; return { text: '', error: null, msgs: [], metrics: { costUsd: 0, unpricedRounds: 0 } }; };
  await callFlow({ fenceGenerate: counting, jobLines: [{ n: 1, text: 'fix the bug', rules: [], rule: '' }] });
  await callFlow({ fenceGenerate: counting, listingFn: async () => ({ stop: null, files: ['src/sum.js'] }) });
  assert.equal(n, 0);
  const r = await callFlow({});
  assert.equal(r.closeDecl.list.find((/** @type {any} */ x) => x.kind === 'rule' && x.rule === 1).state, 'not-checked', 'no pointing seam: rule 1 is not kept by words alone');
});

test('a failed pointing call never stops the draft: the rules are Not checked, the reason is logged, and the call is booked', async () => {
  /** @type {any[]} */ const done = []; /** @type {any[]} */ const asked = [];
  const bad = async () => ({ text: 'not a tool call', error: null, msgs: [], metrics: { costUsd: 0.001, unpricedRounds: 0 } });
  const r = await callFlow({
    fenceGenerate: bad, onPhase: (/** @type {string} */ p, /** @type {any} */ d) => { if (p === 'fence-point-done') done.push(d); },
    answerQuestions: async (/** @type {any} */ { questions }) => { asked.push(...questions); return { jobLines: structuredClone(live.jobLines), answers: { 1: 'x' }, left: [], picks: [], choices: questions.map((/** @type {any} */ q) => ({ key: q.key, choice: 'drop' })) }; },
  });
  assert.equal(r.ok, true);
  assert.equal(typeof done[0].reason, 'string');
  assert.deepEqual(asked, [], 'nothing to ask');
});

test('the pointing call\'s system text and schema are the signed ones (one op, fence; no counts, no readings)', () => {
  assert.match(FENCE_POINT_SYSTEM, /^You read the "~" rules of a job and point at the files a rule asks to leave as they are/);
  assert.match(FENCE_POINT_SYSTEM, /Send an edit only for a rule whose own words say a listed file or folder stays as it is\./);
  assert.equal(typeof runFencePoint, 'function');
});
