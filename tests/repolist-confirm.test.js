// Addendum 2026-11-15 (d) piece 4: a repo job's confirm turn plans the goal only. What the model sends as checks, gaps and questions is discarded by code; the confirm card shows the job's rows (the `$ [default]` guards and the fence), never an AI prose check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConfirmTurn, makeCostBook, GREEN_QUESTIONS, CONFIRM_TOOL_NAME, confirmPrompt, authorPrompt } from '../src/authorflow.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { planFromConfirm } from '../src/panel/jobplan.js';

const JOB = [{ n: 1, text: 'Fix the bug in src/sum.js', rule: 'no new dependencies', rules: ['no new dependencies'] }];
const SURVEY = { state: 'PRESENT', reason: null, calls: [], facts: { language: 'javascript', runner: 'node --test', sourcePaths: ['src'], testPaths: [], extensions: ['.js'] }, meta: { bytes: 1, rounds: 1, bounded: false, recovered: false, error: null } };

const generate = async (/** @type {any} */ _m, /** @type {any[]} */ tools) => {
  await tools.find((t) => t.name === CONFIRM_TOOL_NAME).execute({ goal: 'Fix the bug', checks: [{ text: 'tests stay green', fromLine: [1] }, { text: 'no new dependencies', fromLine: [1] }], notChecked: ['style'], questions: ['which tests?'] });
  return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
};

test('a repo job\'s confirm turn keeps the goal and discards the model\'s checks, gaps and questions; accepted carries goalOnly', async () => {
  const asked = /** @type {any[]} */ ([]);
  const ask = async (/** @type {any} */ step) => { asked.push(step); return step.kind === 'menu' ? 'confirm' : 'x'; };
  const r = await runConfirmTurn({ verdictType: 'green', answers: { 1: '1. fix' }, questions: GREEN_QUESTIONS, isRepo: true, lang: 'js', facts: {}, writeScope: ['src/**'], generate, book: makeCostBook({ ceilingUsd: null }), ask });
  assert.equal(r.ok, true);
  assert.equal(r.accepted?.goal, 'Fix the bug');
  assert.deepEqual([r.accepted?.checkItems, r.accepted?.checks, r.accepted?.notChecked, r.accepted?.openQuestions], [[], [], [], []]);
  assert.equal(r.accepted?.goalOnly, true);
  assert.deepEqual(asked.map((a) => a.kind), ['menu'], 'a question the model sent is never asked');
});

test('the repo confirm prompt tells the model to plan none (the checks are the list\'s)', () => {
  assert.match(confirmPrompt({ answers: { 1: '1. fix' }, questions: GREEN_QUESTIONS, isRepo: true, lang: 'js' }), /plan none/);
});

test('the confirm card of a repo job is the job\'s rows: `$ [default]` guards and the fence, once each, and "Always checked" holds nothing', async () => {
  let shown = /** @type {any} */ (null);
  const ask = async (/** @type {any} */ step) => { if (step.kind === 'menu') shown = step.plan; return 'confirm'; };
  await authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.\n   rule: no new dependencies' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true, jobLines: JOB, writeScope: ['src/**'],
    ask, confirmGenerate: generate, scoutFn: async () => SURVEY, listingFn: async () => ({ stop: null, files: ['package.json', 'src/sum.js'] }),
    authorFn: async () => ({ ok: false, declaration: null, reds: [], stop: 'max-revisions', cost: null }),
  });
  assert.ok(shown, 'the confirm menu was shown');
  assert.deepEqual(shown.checks.filter((/** @type {string} */ t) => /dependencies|green/.test(t)), [], 'no AI prose check');
  const keys = shown.checkItems.map((/** @type {any} */ c) => c.key);
  assert.deepEqual(keys.filter((/** @type {string} */ k) => k.startsWith('J.$guard.')).length, 2);
  assert.equal(keys.filter((/** @type {string} */ k) => k === 'J.$fence').length, 1);
  assert.ok(shown.checkItems.every((/** @type {any} */ c) => c.by === 'default'));
  assert.deepEqual(shown.protections, []);
  const plan = planFromConfirm(JOB, shown);
  assert.equal(plan.loose.filter((c) => c.by === 'default').length, 3);
});
