// F271 B2 — pairEditGrant at its three call sites in runPlan (first draft, replan, resume). A scripted provider drafts a
// write-ONLY plan; what the runner executes must carry `edit`: `plan-accepted` and `step-start` show it, the worker is OFFERED
// the edit tool, and strategyFor's edit sentence (EDIT_STRATEGY) reaches the worker's system prompt. validatePlan stays a
// reference echo (tests/plan.test.js), so the pairing is visible only on what the runner executes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { EDIT_STRATEGY } from '../src/tools.js';
import { scriptedProvider } from './helpers.js';
import { tcall, makePatient, JOB, PLAN, collector, go } from './planrun-fixtures.js';

const WRITE_ONLY = (target = 'tests/test_x.mjs') => [{
  id: 'write-test', action: 'Write tests/test_x.mjs with an ok assertion.', tools: ['write'], rounds: 4, target,
  exit: [{ type: 'artifact-written', path: target, pattern: 'ok' }],
}];

const assertPaired = (events, provider, where) => {
  const accepted = events.filter((e) => e.type === 'plan-accepted');
  assert.ok(accepted.length >= 1, `${where}: a plan was accepted`);
  assert.deepEqual(accepted.at(-1).plan.steps[0].tools, ['write', 'edit'], `${where}: plan-accepted records the plan AS EXECUTED, paired`);
  const start = events.filter((e) => e.type === 'step-start').at(-1);
  assert.deepEqual(start.tools, ['write', 'edit'], `${where}: step-start shows the paired grant`);
  const stepCall = provider.toolsOffered.findIndex((names) => names.includes('shell_write'));
  assert.ok(provider.toolsOffered[stepCall].includes('shell_edit'), `${where}: the worker is offered the edit tool`);
  assert.ok(provider.systems[stepCall].includes(EDIT_STRATEGY.trim().slice(0, 40)), `${where}: the edit sentence reached the worker system prompt`);
};

test('C.4 draft site: a write-only drafted plan runs with edit', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd, WRITE_ONLY()) },
    { toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { events } = await go(wd, provider);
  assertPaired(events, provider, 'draft');
});

test('C.4 replan site: a write-only REPLANNED plan runs with edit', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
    { text: 'attempt 1 done' },
    // a replan may move a check, never shed it (check-shed): keep the predecessor's clean-run, still write-only
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] }]) },
    { text: 'writing', toolCalls: [tcall('2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  let judged = 0; let balance = 1.5;
  const emit2 = (type, data) => { if (type === 'exit-eval') { judged += 1; if (judged === 1) balance = 0.6; } return emit(type, data); };
  await runPlan(jv.job, { workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd: () => balance });
  assert.ok(events.some((e) => e.type === 'plan-accepted' && e.phase === 'replan'), `the replan was accepted: ${events.map((e) => e.type + (e.code ? ':' + e.code + (e.detail ?? '') : '')).join(' ')}`);
  const rp = events.find((e) => e.type === 'plan-accepted' && e.phase === 'replan');
  assert.deepEqual(rp.plan.steps[0].tools, ['write', 'edit'], 'replan: plan-accepted is paired');
  const start = events.filter((e) => e.type === 'step-start').at(-1);
  assert.deepEqual(start.tools, ['write', 'edit'], 'replan: step-start shows the paired grant');
  const stepCall = provider.toolsOffered.map((n, i) => (n.includes('shell_edit') ? i : -1)).find((i) => i >= 0);
  assert.ok(stepCall !== undefined, 'replan: the worker is offered the edit tool');
  assert.ok(provider.systems[stepCall].includes(EDIT_STRATEGY.trim().slice(0, 40)), 'replan: the edit sentence reached the worker');
});

test('C.4 resume site: a reloaded write-only plan runs with edit', async (t) => {
  const wd = makePatient(t);
  const plan = { schema: 'plan-v1', steps: WRITE_ONLY() };
  const provider = scriptedProvider([
    { toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { events } = await go(wd, provider, { resumeSeed: { phase: 'steps', plan, completedSteps: [] } });
  assertPaired(events, provider, 'resume');
});
