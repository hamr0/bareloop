// PART 1c item (e) - I1 as ruled by hamr (docs/product/ITEM33-BUILD.md "Ruled by hamr" 2): when the look shows the person's intent on a
// particular `~` rule was NOT captured (its words or meaning are not in the source), they are asked about THAT rule at once, named by
// its line and rule, through the existing question gate (answer required, no skip, the answer becomes a `~` rule). Any other drafting
// failure asks nothing piecemeal: it tells the person to review the whole job and submit it again. No network, no model.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeQuestions, MAX_QUESTIONS } from '../src/authorflow.js';
import { draftStopText } from '../src/authorreadout.js';
import { createSession } from '../src/panel/authorsession.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'look-ask-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const changelogCopy = () => { const f = join(tmp(), 'CHANGELOG.md'); copyFileSync(join(HERE, '..', 'CHANGELOG.md'), f); return f; };
const keysHome = () => { const d = tmp('look-ask-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };

const LINES = [{ n: 1, text: 'Find the last 3 releases', rule: 'released in October; one per week', rules: ['released in October', 'one per week'] }];

test('the existing caps apply: at most MAX_QUESTIONS are kept, each on a line the look named', () => {
  const cands = [1, 2, 3, 4].map((n) => ({ line: n, question: `Line ${n}, rule 1 - "r": what do you mean by it?` }));
  const kept = normalizeQuestions(cands, [1, 2, 3, 4]);
  assert.equal(kept.kept.length, MAX_QUESTIONS);
  assert.equal(kept.dropped.length, 1);
});

test('draftStopText: a rubric job on the person\'s inputs tells them to review the whole job and submit it again; a repo job keeps "draft again"', () => {
  const reds = [{ code: 'rubric-fact-label-off-list', path: 'stages[1]', detail: 'line 1: fact "x": the label "from" is not one of the labels the input "Flights" holds before a text value. Nothing was signed.' }];
  const whole = draftStopText({ stop: 'max-revisions', reds, spend: { knownUsd: 0.02, spendComplete: true }, wholeJob: true });
  assert.match(whole, /What to do: review the whole job - every line and its ~ rules, and the inputs - and submit it again\./);
  assert.match(whole, /the label "from" is not one of the labels the input "Flights"/, 'the reasons are in plain words');
  assert.match(draftStopText({ stop: 'max-revisions', reds, spend: null }), /What to do: draft again\./);
  assert.match(draftStopText({ stop: 'cap-halt', reds: [], spend: null, wholeJob: true }), /raise the cap/, 'a cap stop still says the cap');
});

test('authorCloseForJob: the early ask happens once, before the plan and the draft; the answer is a `~` rule on its line and reaches the drafter; no piecemeal ask is offered on a failed try', async () => {
  const file = changelogCopy();
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  /** @type {string[]} */ const order = [];
  /** @type {any} */ let asked = null;
  /** @type {any} */ let seen = null;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [],
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [{ line: 1, name: 'release date', shape: 'time', source: 'Changelog', example: '', forRule: 1 }], prose: [], notFound: [] } } };
  const r = await authorCloseForJob({
    answers: { 1: '1. Find the last 3 releases\n   rule: released in October; one per week' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(LINES)), inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'],
    provider: { fake: true }, ceilingUsd: 1, onPhase: (p) => order.push(p),
    lookFn: async () => { order.push('lookFn'); return survey; },
    answerQuestions: async (o) => {
      order.push('ask'); asked = o;
      const jobLines = JSON.parse(JSON.stringify(LINES));
      jobLines[0].rule += '; every Monday'; jobLines[0].rules.push('every Monday');
      return { jobLines, answers: { 1: '1. Find the last 3 releases\n   rule: released in October; one per week; every Monday' } };
    },
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (o) => { order.push('authorFn'); seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }], notes: [] }, genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.deepEqual(order.filter((x) => ['lookFn', 'ask', 'authorFn'].includes(x)), ['lookFn', 'ask', 'authorFn'], 'look, then the one early ask, then the draft');
  assert.deepEqual(asked.questions.map((q) => q.line), [1]);
  assert.match(asked.questions[0].question, /^Your line 1 says "one per week"\. I can't check this on the page\. Drop it\?/);
  assert.deepEqual([asked.questions[0].rule, asked.questions[0].source], [2, 'look'], 'rule 1 is tied to a kept page word, so only rule 2 is asked');
  assert.equal(asked.confirmed, null);
  assert.match(seen.answers[1], /every Monday/, 'the answer reaches the drafter as a ~ rule');
  assert.equal(seen.jobLines[0].rules.at(-1), 'every Monday');
  assert.equal(seen.offerQuestions, undefined, 'a rubric job never offers the piecemeal try-3 ask');
  assert.equal(order.includes('look-ask'), true);
  // an abandoned ask stops the draft with nothing spent on it
  const abandoned = await authorCloseForJob({
    answers: { 1: '1. x' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(LINES)), inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'], provider: { fake: true },
    lookFn: async () => survey, answerQuestions: async () => null, generate: async () => { throw new Error('no'); },
    authorFn: async () => { throw new Error('must not draft after an abandoned ask'); },
  });
  assert.equal(abandoned.ok, false);
  assert.equal(abandoned.stop, 'confirm-abandoned');
});

test('the panel: the early ask goes through the ordinary ask path, required with no skip; the answer is signed with the job lines; a draft that then fails says "review the whole job"', async () => {
  const file = changelogCopy();
  const sessionsRoot = tmp('look-ask-sess-');
  /** @type {any[]} */ const legs = [];
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [],
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } };
  const PLAN = { goal: 'Find releases.', checks: [{ text: 'three releases are listed', fromLine: [1] }], notChecked: [], questions: [] };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'look-ask-job', jobText: '1. Find the last 3 releases\n~ one per week',
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot,
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 },
      reds: [{ code: 'rubric-fact-label-off-list', path: 'stages[1].params.parts[0]', detail: 'line 1: fact "v": the label "from" is not one of the labels the input "Changelog" holds before a text value. Nothing was signed.' }] }; },
  });
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  const said = () => session.state.messages.filter((/** @type {any} */ m) => m.role === 'bot').at(-1).text;
  assert.match(said(), /about job line 1: Your line 1 says "one per week"\. I can't check this on the page\./);
  assert.equal(legs.length, 0, 'asked at once: nothing was drafted yet');
  session.send('   ');
  assert.ok(await until(() => session.state.messages.some((/** @type {any} */ m) => /An answer is needed/.test(m.text))));
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  session.send('each release is a weekly build');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), 'then the plan is confirmed as usual');
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => ['refused', 'error', 'prepared'].includes(session.state.phase)));
  assert.equal(session.state.phase, 'refused', String(session.state.error));
  assert.equal(legs.length, 1, 'one draft, and no piecemeal ask after it failed');
  assert.deepEqual(legs[0].jobLines[0].rules, ['one per week', 'each release is a weekly build']);
  assert.match(session.state.error, /What to do: review the whole job - every line and its ~ rules, and the inputs - and submit it again\./);
  assert.match(session.state.error, /the label "from" is not one of the labels the input "Changelog"/);
});
