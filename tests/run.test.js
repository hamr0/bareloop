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

// routes by the DRAFT-CONFIG sentinel the runner prefixes drafting prompts with.
// Worker entries are strings (text mode) or { text, toolCalls } objects (2b tool mode).
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
      const s = worker[Math.min(w++, worker.length - 1)];
      const entry = typeof s === 'string' ? { text: s } : s;
      return { text: entry.text ?? '', toolCalls: entry.toolCalls ?? [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: workCostUsd, model: null };
    },
  };
}

// recording exec seam for the hitl PR mechanics (the process runner is
// shell-owned; injecting it is the same doctrine as the provider stub)
function stubExec({ failAt = null, prUrl = 'https://github.com/hamr0/litectx/pull/7' } = {}) {
  const calls = [];
  const fn = (argv, opts = {}) => {
    calls.push({ argv, cwd: opts.cwd });
    const key = argv.slice(0, 2).join(' ');
    if (failAt && key.startsWith(failAt)) return { status: 1, stdout: '', stderr: `stub: ${failAt} failed` };
    return { status: 0, stdout: argv[0] === 'gh' ? `${prUrl}\n` : '', stderr: '' };
  };
  fn.calls = calls;
  return fn;
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
  // step 2 gets its OWN still-red close: a shared close would already-green
  // after step 1 and skip — this test is about a step that NEEDS work finding
  // the ledger drained before tokens
  const { outcome, events } = await run('budget', {
    provider,
    specOver: {
      budgetUsd: 0.5,
      steps: [
        { id: 'fix', close: { type: 'predicate', cmd: `node --test ${join(base, 'budget', 'sum.test.mjs')}`, expect: 0 }, class: 'hard' },
        { id: 'style', close: { type: 'predicate', cmd: 'node -e process.exit(1)', expect: 0 }, class: 'hard' },
      ],
    },
  });
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

// ---- module 2b: tools-step threading + the hitl draft-PR mechanics ----

test('a tools step threads the spec grant to the interpreter: the worker writes through the gated tool', async () => {
  const target = join(base, 'tools-step', 'src', 'sum.mjs');
  const suiteCmd = `node --test ${join(base, 'tools-step', 'sum.test.mjs')}`; // deterministic: makeWork('tools-step') builds exactly this
  const provider = stubProvider({
    worker: [
      { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: target, content: GOOD_SUM } }] },
      { text: 'wrote sum.mjs' },
    ],
  });
  const { outcome, events } = await run('tools-step', {
    provider,
    specOver: { steps: [{ id: 'fix', mode: 'tools', tools: ['read', 'grep', 'write'], close: { type: 'predicate', cmd: suiteCmd, expect: 0 }, class: 'hard' }] },
  });
  assert.equal(outcome, 'green');
  assert.equal(readFileSync(target, 'utf8'), GOOD_SUM, 'the tool wrote the exact bytes');
  const wr = events.find((e) => e.type === 'worker-result');
  assert.equal(wr.toolCalls, 1, 'tool invocations reached the spine through the runner');
});

test('hitl step opens the draft PR deterministically: branch → add(fence only) → commit → push → gh, URL rides the escalation', async () => {
  const exec = stubExec();
  const { outcome, events, spec: s } = await run('hitl-pr', { execCmd: exec });
  assert.equal(outcome, 'escalated');
  const seq = exec.calls.map((c) => c.argv.slice(0, 3).join(' '));
  assert.deepEqual(seq, [
    'git checkout -b',
    'git add --',
    'git commit -m',
    'git push -u',
    'gh pr create',
  ], `the fixed sequence, nothing model-authored (got ${JSON.stringify(seq)})`);
  assert.match(exec.calls[0].argv[3], /^bareloop\/run-test-/, 'branch is runner-named');
  assert.deepEqual(exec.calls[1].argv.slice(3), ['src'], 'git add stages the job fence ONLY — spines and audit logs never enter the PR');
  assert.ok(exec.calls[4].argv.includes('--draft'), 'PRs are drafts, merge stays human');
  assert.ok(exec.calls.every((c) => c.cwd === join(base, 'hitl-pr')), 'everything runs in the workdir');
  const opened = events.find((e) => e.type === 'pr-opened');
  assert.equal(opened.url, 'https://github.com/hamr0/litectx/pull/7');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'hitl-close');
  assert.equal(esc.pr.url, 'https://github.com/hamr0/litectx/pull/7', 'the escalation carries the PR URL (decision-ready)');
  assert.ok(esc.prompt.includes('review and merge'), 'the operator prompt still rides');
});

test('a failed PR step is pr-red on the spine; the escalation still fires decision-ready with the error', async () => {
  const exec = stubExec({ failAt: 'git push' });
  const { outcome, events } = await run('hitl-pr-red', { execCmd: exec });
  assert.equal(outcome, 'escalated', 'a broken PR path must never swallow the escalation');
  assert.equal(exec.calls.length, 4, 'the sequence stops at the failure — gh never runs');
  const red = events.find((e) => e.type === 'pr-red');
  assert.match(red.argv, /^git push/, 'the red names the failed command');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'hitl-close');
  assert.equal(esc.pr.url, null);
  assert.match(esc.pr.error, /git push failed/, 'the human sees why there is no PR link');
});

test('gh success without a PR URL in its output is pr-red, never a silent null link', async () => {
  const exec = stubExec({ prUrl: '' });
  const { events } = await run('hitl-pr-nourl', { execCmd: exec });
  assert.ok(events.some((e) => e.type === 'pr-red' && /no PR URL/i.test(e.detail)));
});

// ---- review-hardening round (2026-07-13): confirmed findings become behavior tests ----

const planConfig = () => JSON.stringify({
  schema: 'v1',
  loop: { shape: 'plan', maxIterations: 3 },
  memory: { store: 'litectx' },
  gate: { budgetUsd: 1, writeScope: ['src/**'] },
  escalation: { mode: 'decision-ready' },
});

test('the ONE ledger meters plan-shape spend: worker-plan calls enter spentUsd (cap-not-estimate)', async () => {
  const provider = stubProvider({ drafts: [planConfig()], draftCostUsd: 0.001, workCostUsd: 0.15 });
  const { outcome, events } = await run('plan-spend', { provider });
  assert.equal(outcome, 'escalated', 'the run ends at the hitl step');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'hitl-close');
  // 1 draft (0.001) + ONE working hard step × (plan 0.15 + implement 0.15) = 0.301
  // (the second hard step shares the close and skips already-green — resume model);
  // an un-metered plan call would read 0.151, so the assertion still distinguishes
  assert.ok(Math.abs(esc.spentUsd - 0.301) < 1e-9,
    `plan calls must be metered into the job ledger — expected 0.301, got ${esc.spentUsd}`);
});

test('F6 — an unpriced PLAN call halts pricing-red at the step boundary (plan spend is never invisible)', async () => {
  const calls = { draft: [], work: [] };
  const provider = {
    calls,
    async generate(messages) {
      const prompt = messages.at(-1).content;
      if (prompt.startsWith('DRAFT-CONFIG')) {
        calls.draft.push(prompt);
        return { text: planConfig(), toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: 0.001, model: null };
      }
      calls.work.push(prompt);
      const isPlan = prompt.includes('numbered implementation plan');
      return { text: GOOD_SUM, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: isPlan ? null : 0.01, model: null };
    },
  };
  const { outcome, events } = await run('plan-unpriced', { provider });
  assert.equal(outcome, 'pricing-red');
  assert.ok(!events.some((e) => e.type === 'step-start' && e.step === 'style'), 'the halt lands at the boundary');
});

test('pr-red never captures a secret: git/gh output is scrubbed at the source before the spine (hard line)', async () => {
  const token = 'ghp_a1B2c3D4e5F6g7H8i9J0k1L2';
  const execCmd = (argv) => {
    if (argv.slice(0, 2).join(' ') === 'git push') {
      return { status: 1, stdout: '', stderr: `fatal: unable to access 'https://x-access-token:${token}@github.com/x/y.git/': The requested URL returned error: 403` };
    }
    return { status: 0, stdout: argv[0] === 'gh' ? 'https://github.com/x/y/pull/1\n' : '', stderr: '' };
  };
  const { outcome, events, workdir } = await run('pr-secret', { execCmd });
  assert.equal(outcome, 'escalated', 'a PR failure never swallows the escalation');
  const raw = readFileSync(join(workdir, 'run.jsonl'), 'utf8');
  assert.ok(!raw.includes(token), 'the token never enters the append-only spine');
  const red = events.find((e) => e.type === 'pr-red');
  assert.ok(red && red.detail.includes('git push failed'), 'the red still names the failed step');
});

test('a provider transport throw during drafting is a decision-ready provider-red, never an unhandled rejection', async () => {
  const calls = { draft: [], work: [] };
  const provider = { calls, async generate() { throw new Error('401 invalid x-api-key'); } };
  const { outcome, events } = await run('draft-throw', { provider });
  assert.equal(outcome, 'provider-red');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'provider-red');
  assert.ok(esc?.decisionReady && esc.detail.includes('401'), 'decision-ready, carries the cause');
  assert.equal(events.find((e) => e.type === 'job-end').outcome, 'provider-red', 'the spine never dangles');
  const dr = events.find((e) => e.type === 'draft-result');
  assert.equal(dr.costUsd, null, 'a transport throw means spend UNKNOWN (F6), never $0');
  assert.equal(calls.work.length, 0, 'no step ran');
});

test('an interpreter throw outside the loop (broken gate audit) escalates interpreter-red with a terminal job-end', async () => {
  const { workdir, target, suiteCmd } = makeWork('gate-eisdir');
  mkdirSync(join(workdir, 'gate-audit.jsonl')); // a DIRECTORY at the audit path: gate.init throws EISDIR
  const s = spec(suiteCmd);
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, target, provider: stubProvider(), emit: makeSpine(file), capRuns: 2 });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(outcome, 'step-red:fix');
  assert.ok(events.some((e) => e.type === 'escalation' && e.category === 'interpreter-red' && e.decisionReady));
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'step-red');
  assert.equal(end.cause, 'interpreter-red');
});

test('reds-before-tokens: a text-mode job without opts.target is a job-red before ANY provider call', async () => {
  const { workdir, suiteCmd } = makeWork('no-target');
  const s = spec(suiteCmd);
  const provider = stubProvider();
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, provider, emit: makeSpine(file), capRuns: 2 });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(outcome, 'job-red');
  assert.ok(events.some((e) => e.type === 'job-red' && e.code === 'missing-required' && e.path === 'opts.target'));
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'zero tokens on a missing target');
});

test('drafting spend that consumes the whole job budget stops cap-halt — no paid redraft over a blown budget', async () => {
  const provider = stubProvider({ drafts: [draftedConfig(0.4)], draftCostUsd: 0.6 });
  const { outcome, events } = await run('draft-blown', { provider, specOver: { budgetUsd: 0.5 } });
  assert.equal(outcome, 'cap-halt');
  assert.equal(provider.calls.draft.length, 1, 'the redraft never fires over a blown budget');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'cap-halt');
  assert.ok(esc?.decisionReady, 'a budget story escalates as cap-halt, never blames the drafter');
  assert.equal(events.find((e) => e.type === 'job-end').outcome, 'cap-halt');
});

// ---- resume-to-cap (2026-07-13): close-first skip — the workdir + the closes ARE the checkpoint ----

test('resume: a step whose close already greens skips for ZERO tokens as already-green — never plain green', async () => {
  const { workdir, target, suiteCmd } = makeWork('skip-all');
  writeFileSync(target, GOOD_SUM); // the work is already done (a rerun after a budget top-up)
  const s = spec(suiteCmd, {
    steps: [
      { id: 'fix', close: { type: 'predicate', cmd: suiteCmd, expect: 0 }, class: 'hard' },
      { id: 'style', close: { type: 'predicate', cmd: suiteCmd, expect: 0 }, class: 'hard' },
    ],
  });
  const provider = stubProvider();
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, target, provider, emit: makeSpine(file), capRuns: 2 });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(outcome, 'green');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'a clean rerun costs ZERO provider calls — no draft, no worker');
  const ends = events.filter((e) => e.type === 'step-end');
  assert.deepEqual(ends.map((e) => [e.step, e.outcome]), [['fix', 'already-green'], ['style', 'already-green']], 'skips are DISTINCT spine records, never plain green');
  assert.ok(!events.some((e) => e.type === 'worker-result' || e.type === 'run-start'), 'no worker loop ran — an already-green mints no learning credit');
  assert.ok(events.filter((e) => e.type === 'close-precheck').every((e) => e.verdict === 'satisfied'), 'the skip-check is a visible spine record');
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'green');
  assert.equal(end.spentUsd, 0);
});

test('partial resume: finished steps skip; drafting is DEFERRED to the first step that needs a worker', async () => {
  const { workdir, target, suiteCmd } = makeWork('skip-partial');
  const s = spec(suiteCmd, {
    steps: [
      { id: 'fix', close: { type: 'predicate', cmd: 'node -e process.exit(0)', expect: 0 }, class: 'hard' },
      { id: 'style', close: { type: 'predicate', cmd: suiteCmd, expect: 0 }, class: 'hard' },
    ],
  });
  const provider = stubProvider();
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, target, provider, emit: makeSpine(file), capRuns: 2 });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(outcome, 'green');
  assert.equal(provider.calls.draft.length, 1, 'the config is still drafted fresh THIS run when a step needs it');
  assert.equal(provider.calls.work.length, 1, 'only the unfinished step paid a worker call');
  const fixEnd = events.find((e) => e.type === 'step-end' && e.step === 'fix');
  assert.equal(fixEnd.outcome, 'already-green');
  assert.equal(fixEnd.spentUsd, 0, 'the skip itself cost nothing');
  const styleStart = events.findIndex((e) => e.type === 'step-start' && e.step === 'style');
  const draftIdx = events.findIndex((e) => e.type === 'draft-result');
  assert.ok(styleStart >= 0 && draftIdx > styleStart, 'the draft fires only once a step actually needs a worker');
  assert.equal(events.find((e) => e.type === 'step-end' && e.step === 'style').outcome, 'green');
});

test('a close that cannot RUN is a broken-close stop BEFORE any provider call (reds-before-tokens)', async () => {
  const { outcome, events, provider } = await run('precheck-broken', {
    specOver: { steps: [{ id: 'fix', close: { type: 'predicate', cmd: 'bareloop-no-such-binary-xyz --version', expect: 0 }, class: 'hard' }] },
  });
  assert.equal(outcome, 'step-red:fix');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'zero tokens on a broken arbiter');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'broken-close');
  assert.ok(esc?.decisionReady && esc.step === 'fix', 'the same honest stop ralph makes, moved before the tokens');
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'step-red');
  assert.equal(end.cause, 'broken-close');
});

test('the skip-check close output is scrubbed at the source — a secret it echoes never enters the spine', async () => {
  const token = 'ghp_a1B2c3D4e5F6g7H8i9J0k1L2';
  const { workdir, target, suiteCmd } = makeWork('precheck-secret');
  const leak = join(workdir, 'leak.mjs');
  writeFileSync(leak, `console.error('fatal: https://x-access-token:${token}@github.com/x/y.git'); process.exit(1);`);
  const s = spec(suiteCmd, { steps: [{ id: 'fix', close: { type: 'predicate', cmd: `node ${leak}`, expect: 0 }, class: 'hard' }] });
  const provider = stubProvider();
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, target, provider, emit: makeSpine(file), capRuns: 2 });
  const raw = readFileSync(file, 'utf8');
  assert.equal(outcome, 'step-red:fix', 'the close never greens — the cap stop is honest');
  assert.ok(raw.includes('close-precheck'), 'the precheck is a visible spine record');
  assert.ok(!raw.includes(token), 'the token never enters the append-only spine');
});
