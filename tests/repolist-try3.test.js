// Addendum 2026-11-15 (d) piece 5 (item 5): the try-3 answer (replace a rule, or add one) rebuilds the repo rows through the one owner: the rows are built from the job lines that stand when the draft stands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorCloseForJob } from '../src/authorjob.js';

const spec = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smw6ssquvtvqs-spec.json', import.meta.url), 'utf8'));
const SURVEY = { state: 'PRESENT', reason: null, calls: [], facts: { language: 'javascript', runner: 'node --test', sourcePaths: ['src'], testPaths: [], extensions: ['.js'] }, meta: { bytes: 1, rounds: 1, bounded: false, recovered: false, error: null } };
const LISTING = { stop: null, files: ['package.json', 'src/sum.js', 'test/sum.test.js'] };

/** a drafter that asks once (leg 1), then drafts; `answered` is what the person's answer did to the job lines */
async function draftWithAnswer(/** @type {(l: any[]) => any[]} */ answered, /** @type {any[]} */ fenceKept) {
  let leg = 0;
  return authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.\n   rule: no new dependencies' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
    jobLines: structuredClone(spec.jobLines), writeScope: spec.writeScope,
    scoutFn: async () => SURVEY, listingFn: async () => LISTING,
    answerQuestions: async ({ questions }) => ({ jobLines: answered(structuredClone(spec.jobLines)), answers: { 1: '1. answered' }, left: [], picks: [], choices: [] , questions }),
    authorFn: async () => {
      leg += 1;
      if (leg === 1) return { ok: false, declaration: null, reds: [], stop: 'questions-open', questions: [{ line: 1, question: 'Which package files?', new: true }], iterations: [], cost: null };
      return { ok: true, declaration: { stages: spec.closeDecl.stages, fenceKept }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: LISTING, ledger: null };
    },
  });
}

test('an ADDED rule (a try-3 answer) is a new `~` row of the rebuilt list, Not checked: the AI never pointed at it, so code keeps nothing', async () => {
  const r = await draftWithAnswer((l) => { l[0].rules.push('leave package.json alone'); l[0].rule = l[0].rules.join('; '); return l; }, [{ line: 1, rule: 2, path: 'package.json' }]);
  assert.equal(r.ok, true);
  const rules = r.closeDecl.list.filter((/** @type {any} */ x) => x.kind === 'rule');
  assert.deepEqual(rules.map((/** @type {any} */ x) => [x.key, x.state, x.fence ?? null]), [['L1.~1', 'not-checked', null], ['L1.~2', 'not-checked', null]]);
});

test('a REPLACED rule is one row, not two: the old words leave the list', async () => {
  const r = await draftWithAnswer((l) => { l[0].rules[0] = 'no dependency may be added'; l[0].rule = l[0].rules[0]; return l; }, []);
  const rules = r.closeDecl.list.filter((/** @type {any} */ x) => x.kind === 'rule');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].state, 'not-checked');
});
