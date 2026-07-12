// N2 runner exit criteria as behavior tests: approval gates everything (zero
// tokens on refusal), primitive-smoke runs before tokens, drafting is priced
// and sealed (one shot + one redraft), steps run as sequential loops under the
// ONE ledger, a step-red stops the job with attribution, unpriced is never
// free (F6), the hitl step IS the escalation. Everything real except the LLM
// (scripted stub — the provider is shell-owned by design).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSpine } from '../src/spine.js';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';

const base = mkdtempSync(join(tmpdir(), 'run-test-'));
const GOOD_SUM = 'export function sum(a, b) { return a + b; }\n';
const BAD_SUM = 'export function sum(a, b) { return a - b; }\n';

// a legal drafted config (the stub "drafter" emits it; fits inside the fence)
const draftedConfig = (budgetUsd = 1) => JSON.stringify({
  schema: 'v1',
  loop: { shape: 'refine', maxIterations: 3 },
  memory: { store: 'litectx' },
  gate: { budgetUsd, writeScope: ['src/**'] },
  escalation: { mode: 'decision-ready' },
});

// routes by the DRAFT-CONFIG sentinel the runner prefixes drafting prompts with
function stubProvider({ drafts = [draftedConfig()], worker = [GOOD_SUM], draftCostUsd = 0.001, workCostUsd = 0.001 } = {}) {
  const calls = { draft: [], work: [] };
  let d = 0; let w = 0;
  return {
    calls,
    async generate(messages) {
      const prompt = messages.at(-1).content;
      if (prompt.startsWith('DRAFT-CONFIG')) {
        calls.draft.push(prompt);
        return { text: drafts[Math.min(d++, drafts.length - 1)], toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: draftCostUsd, model: null };
      }
      calls.work.push(prompt);
      return { text: worker[Math.min(w++, worker.length - 1)], toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: workCostUsd, model: null };
    },
  };
}

function makeWork(name, { breakSuite = false } = {}) {
  const workdir = join(base, name);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  const suite = join(workdir, 'sum.test.mjs');
  writeFileSync(suite, breakSuite
    ? 'process.exit(1); // a close that can never green'
    : `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));`);
  return { workdir, target: join(workdir, 'src', 'sum.mjs'), suiteCmd: `node --test ${suite}` };
}

const spec = (suiteCmd, over = {}) => ({
  schema: 'job-v1',
  job: 'run-test',
  description: 'fix sum.mjs until the suite greens, then pr',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  steps: [
    { id: 'fix', close: { type: 'predicate', cmd: suiteCmd, expect: 0 }, class: 'hard' },
    { id: 'style', close: { type: 'predicate', cmd: suiteCmd, expect: 0 }, class: 'hard' },
    { id: 'pr', close: { type: 'hitl', prompt: 'PR opened - review and merge?' }, class: 'hitl' },
  ],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const approve = (s) => [{ specHash: jobSpecHash(s), signer: 'hamr', ts: '2026-07-12T00:00:00Z' }];

async function run(name, { specOver = {}, provider = stubProvider(), approvals, breakSuite = false, ...rest } = {}) {
  const { workdir, target, suiteCmd } = makeWork(name, { breakSuite });
  const s = spec(suiteCmd, specOver);
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, {
    approvals: approvals ?? approve(s), workdir, target, provider,
    emit: makeSpine(file), capRuns: 2, ...rest,
  });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { outcome, events, provider, spec: s, workdir };
}

test('unapproved spec: refusal before ANY provider call — zero tokens (human-signs-always)', async () => {
  const { outcome, events, provider } = await run('unapproved', { approvals: [] });
  assert.equal(outcome, 'unapproved-spec');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0);
  assert.equal(events.find((e) => e.type === 'job-end').outcome, 'unapproved-spec');
});

test('an edited spec is unapproved by construction (approval binds to the exact version)', async () => {
  const { workdir, target, suiteCmd } = makeWork('edited');
  const original = spec(suiteCmd);
  const edited = spec(suiteCmd, { budgetUsd: 1.4 });
  const provider = stubProvider();
  const outcome = await runJob(edited, { approvals: approve(original), workdir, target, provider, emit: makeSpine(join(workdir, 'run.jsonl')), capRuns: 2 });
  assert.equal(outcome, 'unapproved-spec');
});

test('happy chain: smoke before tokens, both hard steps green in order, hitl step IS the escalation, budget drains', async () => {
  const { outcome, events, provider } = await run('happy');
  assert.equal(outcome, 'escalated', 'the run ends at the hitl step by design');
  // primitive-smoke ran, ok, and BEFORE the first provider call hit the spine
  const smokeIdx = events.findIndex((e) => e.type === 'primitive-smoke');
  const firstWork = events.findIndex((e) => e.type === 'worker-result');
  assert.ok(smokeIdx >= 0 && events[smokeIdx].ok, 'smoke ran and greened');
  assert.ok(smokeIdx < firstWork, 'known-answer smoke fires before tokens (A3)');
  assert.deepEqual(events.filter((e) => e.type === 'step-start').map((e) => e.step), ['fix', 'style']);
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'hitl-close');
  assert.ok(esc.decisionReady && esc.prompt.includes('review and merge'), 'decision-ready, carries the operator prompt');
  assert.ok(esc.spentUsd > 0, 'the escalation reports real spend');
  const starts = events.filter((e) => e.type === 'step-start');
  assert.ok(starts[1].remainingUsd < starts[0].remainingUsd, 'the ONE budget drains across steps');
  assert.equal(events.find((e) => e.type === 'job-end').outcome, 'escalated');
  assert.ok(provider.calls.draft.length === 1, 'one sealed drafting shot sufficed');
});

test('a step that cannot green stops the job and names itself; later steps never run', async () => {
  const { outcome, events } = await run('step-red', { breakSuite: true });
  assert.equal(outcome, 'step-red:fix');
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'step-red');
  assert.equal(end.step, 'fix', 'the stop is attributed');
  assert.ok(!events.some((e) => e.type === 'step-start' && e.step === 'style'));
});

test('mid-job budget exhaustion: the drained ledger reds the next step BEFORE tokens (cap-not-estimate)', async () => {
  const provider = stubProvider({ drafts: [draftedConfig(0.4)], workCostUsd: 0.15 });
  const { outcome, events } = await run('budget', { provider, specOver: { budgetUsd: 0.5 } });
  assert.equal(outcome, 'step-red:style', 'step 2 dies on the drained ledger');
  assert.ok(events.some((e) => e.type === 'config-red' && e.code === 'bounds' && e.path === 'gate.budgetUsd'));
  assert.equal(provider.calls.work.length, 1, 'step 2 burned zero worker tokens');
});

test('drafting: a red first draft gets its reds fed back for ONE redraft; two reds = config-red, no grinding', async () => {
  const badDraft = JSON.stringify({ schema: 'v1', loop: { shape: 'refine' }, memory: { store: 'litectx' }, gate: { budgetUsd: 1, writeScope: ['docs/**'] }, escalation: { mode: 'decision-ready' } });
  const rescued = await run('redraft', { provider: stubProvider({ drafts: [badDraft, draftedConfig()] }) });
  assert.equal(rescued.outcome, 'escalated', 'the redraft rescued the run');
  assert.equal(rescued.provider.calls.draft.length, 2);
  assert.ok(rescued.provider.calls.draft[1].includes('scope-escape'), 'the reds fed the redraft prompt');

  const dead = await run('redraft2', { provider: stubProvider({ drafts: [badDraft, badDraft] }) });
  assert.equal(dead.outcome, 'config-red');
  assert.equal(dead.provider.calls.draft.length, 2, 'never a third shot');
  assert.equal(dead.provider.calls.work.length, 0, 'zero worker tokens on a dead draft');
});

test('F6 — unpriced is never free: a null-cost drafting call halts pricing-red before any step', async () => {
  const provider = stubProvider({ draftCostUsd: null });
  const { outcome, events } = await run('unpriced-draft', { provider });
  assert.equal(outcome, 'pricing-red');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'pricing-red');
  assert.ok(esc && esc.decisionReady, 'decision-ready, not a silent $0');
  assert.equal(provider.calls.work.length, 0, 'no step ran on unaccounted spend');
});

test('F6 — an unpriced worker call halts pricing-red at the step boundary; later steps never run', async () => {
  const provider = stubProvider({ workCostUsd: null });
  const { outcome, events } = await run('unpriced-work', { provider });
  assert.equal(outcome, 'pricing-red');
  assert.ok(events.some((e) => e.type === 'step-start' && e.step === 'fix'), 'step 1 ran (the leak is visible)');
  assert.ok(!events.some((e) => e.type === 'step-start' && e.step === 'style'), 'the halt lands at the boundary');
});

test('a degraded primitive is a smoke-red stop before tokens (A3: silent bugs throw nothing)', async () => {
  const workdir = join(base, 'smoke-red');
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, '.smoke'), 'a FILE where the smoke store needs a directory');
  const suite = join(workdir, 'sum.test.mjs');
  writeFileSync(suite, 'process.exit(0)');
  const s = spec(`node --test ${suite}`);
  const provider = stubProvider();
  const outcome = await runJob(s, { approvals: approve(s), workdir, target: join(workdir, 'src', 'sum.mjs'), provider, emit: makeSpine(join(workdir, 'run.jsonl')), capRuns: 2 });
  assert.equal(outcome, 'smoke-red');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'zero tokens on a degraded primitive');
});

test('a gold/rubric close reaching the runner is an honest close-unsupported refusal at N2, not a fake verdict', async () => {
  const { outcome, events } = await run('gold-step', {
    specOver: {
      steps: [
        { id: 'compare', close: { type: 'gold', expected: '42', compare: 'exact' }, class: 'hard' },
      ],
    },
  });
  assert.equal(outcome, 'close-unsupported');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'close-unsupported');
  assert.ok(esc && esc.decisionReady && esc.step === 'compare');
});
