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
import { GOOD_SUM, reply, makeSumWork, readSpine } from './helpers.js';

const base = mkdtempSync(join(tmpdir(), 'run-test-'));

// a legal drafted config (the stub "drafter" emits it; fits inside the fence)
const draftedConfig = (budgetUsd = 0.7) => JSON.stringify({
  schema: 'v1',
  loop: { shape: 'refine', maxIterations: 3 },
  memory: { store: 'litectx' },
  gate: { budgetUsd, writeScope: ['src/**'] },
  escalation: { mode: 'decision-ready' },
});

// Runner-specific stub: routes by the DRAFT-CONFIG sentinel the runner prefixes
// drafting prompts with; the response envelope is the shared `reply` (helpers.js).
// Worker entries are strings (text mode) or { text, toolCalls } objects (2b tool mode).
/**
 * A drafter that claims EXACTLY the ceiling the prompt advertises — which is
 * what the prompt tells it to do ("claiming exactly N is legal and validates"),
 * and therefore the only stub that can exercise the ceiling arithmetic at all.
 * A stub that hardcodes a safe number validates under any ceiling and so cannot
 * tell a per-step share from a whole-pot one.
 */
function ceilingClaimingProvider({ draftCostUsd = 0.001, workCostUsd = 0.001 } = {}) {
  const calls = { draft: [], work: [] };
  return {
    calls,
    async generate(messages) {
      const prompt = messages.at(-1).content;
      if (prompt.startsWith('DRAFT-CONFIG')) {
        calls.draft.push(prompt);
        const ceiling = Number((prompt.match(/must be <= ([0-9]+(?:\.[0-9]+)?)/) ?? [])[1]);
        assert.ok(Number.isFinite(ceiling) && ceiling > 0, `draft prompt must advertise a ceiling, got: ${ceiling}`);
        return reply({ text: draftedConfig(ceiling), costUsd: draftCostUsd });
      }
      calls.work.push(prompt);
      return reply({ text: GOOD_SUM, costUsd: workCostUsd });
    },
  };
}

function stubProvider({ drafts = [draftedConfig()], worker = [GOOD_SUM], draftCostUsd = 0.001, workCostUsd = 0.001 } = {}) {
  const calls = { draft: [], work: [] };
  let d = 0; let w = 0;
  return {
    calls,
    async generate(messages) {
      const prompt = messages.at(-1).content;
      if (prompt.startsWith('DRAFT-CONFIG')) {
        calls.draft.push(prompt);
        const dEntry = drafts[Math.min(d++, drafts.length - 1)];
        // a draft entry may be a bare JSON string OR an object (e.g. {text, stopReason}) so a
        // test can drive the real Loop's truncation path (BA-6) — mirrors the worker branch below
        return reply({ ...(typeof dEntry === 'string' ? { text: dEntry } : dEntry), costUsd: draftCostUsd });
      }
      calls.work.push(prompt);
      const s = worker[Math.min(w++, worker.length - 1)];
      return reply({ ...(typeof s === 'string' ? { text: s } : s), costUsd: workCostUsd });
    },
  };
}

// recording exec seam for the hitl PR mechanics (the process runner is
// shell-owned; injecting it is the same doctrine as the provider stub).
// `dirty` is the default: the run changed files in the fence, so `git status
// --porcelain` reports them and the PR is real work. `dirty: false` is the
// cadenced no-op — nothing changed, so there is nothing for a human to review.
function stubExec({ failAt = null, prUrl = 'https://github.com/hamr0/litectx/pull/7', dirty = true } = {}) {
  const calls = [];
  const fn = (argv, opts = {}) => {
    calls.push({ argv, cwd: opts.cwd });
    const key = argv.slice(0, 2).join(' ');
    // failAt matches the FULL argv prefix: 'git checkout main' (the restore)
    // must be distinguishable from 'git checkout -b' (the branch)
    if (failAt && argv.join(' ').startsWith(failAt)) return { status: 1, stdout: '', stderr: `stub: ${failAt} failed` };
    if (key === 'git rev-parse') return { status: 0, stdout: 'main\n', stderr: '' };
    if (key === 'git status') return { status: 0, stdout: dirty ? ' M src/sum.mjs\n' : '', stderr: '' };
    return { status: 0, stdout: argv[0] === 'gh' ? `${prUrl}\n` : '', stderr: '' };
  };
  fn.calls = calls;
  return fn;
}

const makeWork = (/** @type {string} */ name, /** @type {{breakSuite?: boolean}} */ opts = {}) => makeSumWork(base, name, opts);

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
  const events = readSpine(file);
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

test('multi-step: an AMPLE budget survives step 2 — a reused ceiling is not a per-step requirement', async () => {
  // The config is drafted ONCE and re-validated at every step against what is
  // LEFT, so a ceiling drafted for the whole pot reds later steps that had
  // plenty of money (review 2026-07-18). The ceiling now offered to the drafter
  // is a per-step SHARE, so the number it claims still fits after earlier steps
  // have spent. This is the false positive; the drained-ledger red below is the
  // true one and must keep firing.
  // step 2 keeps its OWN still-red close (a shared one already-greens after step
  // 1 and skips, proving nothing). The verdict here is NOT the outcome — step 2
  // can never green — it is whether step 2 got to spend a single token at all.
  const provider = ceilingClaimingProvider({ workCostUsd: 0.05 });
  const { events } = await run('budget-ample', {
    provider,
    specOver: {
      budgetUsd: 0.5,
      steps: [
        { id: 'fix', close: { type: 'predicate', cmd: `node --test ${join(base, 'budget-ample', 'sum.test.mjs')}`, expect: 0 }, class: 'hard' },
        { id: 'style', close: { type: 'predicate', cmd: 'node -e process.exit(1)', expect: 0 }, class: 'hard' },
      ],
    },
  });
  assert.ok(!events.some((e) => e.type === 'config-red' && e.code === 'bounds' && e.path === 'gate.budgetUsd'),
    'a ceiling drafted before earlier steps spent is stale, not out of bounds — $0.449 remained');
  assert.ok(provider.calls.work.length > 1, 'step 2 must actually run: it had money and a job to do');
});

test('mid-job budget exhaustion: the drained ledger reds the next step BEFORE tokens (cap-not-estimate)', async () => {
  // numbers re-based for per-step drafting (the share is 0.2375, so the drafted
  // 0.2 is legal at step 1): step 1's 0.3 of work drains the pot to ~0.199,
  // BELOW the config's claim, and step 2 reds before buying a single round.
  // The behaviour under test is unchanged — only the arithmetic that reaches it.
  const provider = ceilingClaimingProvider({ draftCostUsd: 0.2, workCostUsd: 0.1 });
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

test('BA-6: a TRUNCATED drafting round → provider-red, never a config-red blaming the drafter, and no redraft', async () => {
  // The API cut the config off mid-JSON (bare-agent 0.27.0 returns error:'truncated:max_tokens').
  // That is the API's fault, not the drafter's: it must NOT launder into a config-red (F25's class,
  // one level up in the drafting path), and it must NOT consume the redraft — retrying a truncation
  // blindly just burns budget; the human decides. Symmetric with the worker path (interpret.js).
  const provider = stubProvider({ drafts: [{ text: '{ "schema": "job-v1", "loop": { "sha', stopReason: 'max_tokens' }] });
  const { outcome, events } = await run('draft-truncated', { provider });
  assert.equal(outcome, 'provider-red', 'a truncated draft is provider-red, not config-red');
  assert.equal(provider.calls.draft.length, 1, 'a truncation is NOT retried — the redraft is for the drafter\'s reds, not the API\'s cutoff');
  assert.equal(provider.calls.work.length, 0, 'zero worker tokens — the job never got a config');
  assert.ok(!events.some((e) => e.type === 'config-red'), 'the drafter is never put on trial for an API cutoff');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'provider-red');
  assert.match(esc.detail, /truncated:max_tokens/, 'the escalation names the real cause');
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
    'git status --porcelain',    // the fence has changes → there IS something to review
    'git rev-parse --abbrev-ref', // where we started, read before anything moves
    'git checkout -b',
    'git add --',
    'git commit -m',
    'git push -u',
    'gh pr create',
    'git checkout main',          // and handed back exactly as found
  ], `the fixed sequence, nothing model-authored (got ${JSON.stringify(seq)})`);
  assert.deepEqual(exec.calls[0].argv.slice(3), ['--', 'src'], 'the change check is fence-scoped too');
  assert.match(exec.calls[2].argv[3], /^bareloop\/run-test-/, 'branch is runner-named');
  assert.deepEqual(exec.calls[3].argv.slice(3), ['src'], 'git add stages the job fence ONLY — spines and audit logs never enter the PR');
  assert.ok(exec.calls[6].argv.includes('--draft'), 'PRs are drafts, merge stays human');
  assert.ok(exec.calls.every((c) => c.cwd === join(base, 'hitl-pr')), 'everything runs in the workdir');
  const opened = events.find((e) => e.type === 'pr-opened');
  assert.equal(opened.url, 'https://github.com/hamr0/litectx/pull/7');
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'hitl-close');
  assert.equal(esc.pr.url, 'https://github.com/hamr0/litectx/pull/7', 'the escalation carries the PR URL (decision-ready)');
  assert.ok(esc.prompt.includes('review and merge'), 'the operator prompt still rides');
});

test('the PR step returns the checkout to the branch it started on — the next cadenced run never branches off an unmerged branch', async () => {
  // found by the REAL job #1 run on litectx (2026-07-13): the workdir was left
  // sitting on bareloop/litectx-maintainer-<id>, so tomorrow's run would branch
  // off yesterday's unmerged branch and judge its close against that state
  const exec = stubExec();
  const { events } = await run('hitl-restore', { execCmd: exec });
  const seq = exec.calls.map((c) => c.argv.join(' '));
  assert.ok(seq.indexOf('git rev-parse --abbrev-ref HEAD') < seq.findIndex((s) => s.startsWith('git checkout -b')),
    'the starting branch is read BEFORE anything moves');
  assert.equal(seq.at(-1), 'git checkout main', 'the run hands the checkout back exactly as it found it');
  assert.ok(events.some((e) => e.type === 'pr-opened'), 'and the PR still opened');
  assert.ok(!events.some((e) => e.type === 'workdir-red'), 'a clean restore raises nothing');
});

test('a PR that fails mid-sequence STILL restores the branch — a broken run never strands the checkout', async () => {
  const exec = stubExec({ failAt: 'git commit' });
  const { outcome, events } = await run('hitl-restore-red', { execCmd: exec });
  assert.equal(outcome, 'escalated');
  assert.equal(exec.calls.at(-1).argv.join(' '), 'git checkout main', 'the restore runs on the failure path too');
  assert.ok(events.some((e) => e.type === 'pr-red'), 'the failure is still reported');
});

test('a restore that itself fails is a LOUD workdir-red — a stranded checkout is never silent', async () => {
  const exec = stubExec({ failAt: 'git checkout main' });
  const { outcome, events } = await run('hitl-restore-broken', { execCmd: exec });
  assert.equal(outcome, 'escalated', 'the hitl escalation still fires — the PR is real work');
  const red = events.find((e) => e.type === 'workdir-red');
  assert.ok(red && red.branch, 'the operator is told which branch the checkout was left on');
  assert.ok(events.some((e) => e.type === 'pr-opened'), 'a failed restore does not un-open a real PR');
});

test('a failed PR step is pr-red on the spine; the escalation still fires decision-ready with the error', async () => {
  const exec = stubExec({ failAt: 'git push' });
  const { outcome, events } = await run('hitl-pr-red', { execCmd: exec });
  assert.equal(outcome, 'escalated', 'a broken PR path must never swallow the escalation');
  assert.ok(!exec.calls.some((c) => c.argv[0] === 'gh'), 'the sequence stops at the failure — gh never runs');
  assert.equal(exec.calls.at(-1).argv.join(' '), 'git checkout main', 'and the checkout is still handed back');
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
  gate: { budgetUsd: 0.7, writeScope: ['src/**'] },
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
    const key = argv.slice(0, 2).join(' ');
    if (key === 'git status') return { status: 0, stdout: ' M src/sum.mjs\n', stderr: '' }; // the fence changed → the PR path runs
    if (key === 'git push') {
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
  const events = readSpine(file);
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
  const events = readSpine(file);
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
  const events = readSpine(file);
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
  const events = readSpine(file);
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

test('F12: spend inside an attempt that HALTS still lands on the job ledger — a call that never returns is not free', async () => {
  // found by the real run: the gate halted the worker at its OWN cap ($1.4375
  // spent) while the job ledger reported $0.0048. Cause: the ledger accounted
  // `worker-result`, which is emitted only after loop.run() RETURNS — and it
  // threw. An entire attempt's spend became invisible, so the escalation lied to
  // the human about the money by 300x. Money must be counted as it is SPENT
  // (per round), not after a call that may never come back (F6's family).
  // The halt must land MID-attempt (as it did for real: tool mode, many rounds) —
  // a single-round attempt RETURNS, and a returned attempt was always accounted.
  const wd = join(base, 'halt-spend');
  const provider = stubProvider({
    drafts: [draftedConfig(0.05)],
    draftCostUsd: 0.001,
    workCostUsd: 0.03, // round 1: 0.03 (under cap) · round 2: 0.06 >= 0.05 → the gate halts INSIDE the attempt
    worker: [{ toolCalls: [{ id: 't1', name: 'shell_read', arguments: { path: join(wd, 'sum.test.mjs') } }] }],
  });
  const { outcome, events } = await run('halt-spend', {
    provider,
    specOver: {
      budgetUsd: 1.5,
      steps: [{ id: 'fix', mode: 'tools', tools: ['read', 'write'], close: { type: 'predicate', cmd: `node --test ${join(wd, 'sum.test.mjs')}`, expect: 0 }, class: 'hard' }],
    },
  });
  assert.equal(outcome, 'step-red:fix', 'the worker trips the config gate mid-attempt and the step stops');
  const end = events.find((e) => e.type === 'job-end');
  assert.ok(end.spentUsd > 0.05,
    `every round the worker actually bought must be on the ledger — expected > $0.05 (draft 0.001 + 2 rounds x 0.03), got $${end.spentUsd}: the halted attempt's spend is INVISIBLE`);
});

test('F12: rounds are counted ONCE — a normal attempt does not double-count round + result', async () => {
  const provider = stubProvider({ workCostUsd: 0.15, draftCostUsd: 0.001 });
  const { events } = await run('round-once', { provider });
  const esc = events.find((e) => e.type === 'escalation' && e.category === 'hitl-close');
  // 1 draft (0.001) + ONE working step × one round (0.15) = 0.151 (step 2 skips already-green)
  assert.ok(Math.abs(esc.spentUsd - 0.151) < 1e-9, `expected 0.151, got ${esc.spentUsd} (double counting?)`);
});

test('F9: a drafter that claims the WHOLE advertised ceiling greens — the shell may never advertise a bound its own spend invalidates', async () => {
  // found by the first real-model run (2026-07-13): the prompt advertised the
  // JOB budget ($1.5) as the ceiling, but by validation time the drafting call
  // itself had spent $0.0053, so the validator enforced <= $1.4947 and red the
  // draft. The redraft was told the same stale ceiling, claimed it again, and
  // the run died config-red having burned two paid calls. A rational drafter
  // claims the ceiling — so EVERY real run deadlocked. The stub never saw it
  // because it drafts $1.00, comfortably under.
  // the shared ceiling-claiming stub: one spelling of "claim exactly what the
  // prompt advertises", which is what the prompt instructs (0.0053 = a real
  // drafting call is not free — this is what invalidated the bound)
  const ceilingClaimer = ceilingClaimingProvider({ draftCostUsd: 0.0053 });
  const { outcome, events } = await run('ceiling-claim', { provider: ceilingClaimer });
  assert.equal(outcome, 'escalated', `claiming the advertised ceiling must VALIDATE (got ${outcome}: ${JSON.stringify(events.filter((e) => e.type === 'config-red'))})`);
  assert.equal(ceilingClaimer.calls.draft.length, 1, 'and it greens on the first shot — no redraft over a bound the shell itself broke');
  assert.ok(ceilingClaimer.calls.work.length > 0, 'the worker actually ran');
});

test('F8: the close runs in the WORKDIR — a cwd-relative close (npm test) judges the job\'s repo, never the runner\'s', async () => {
  // found by the REAL job #1 run on litectx (2026-07-13): `npm test` ran in
  // bareloop's own directory, so the precheck greened against bareloop's suite
  // while litectx sat RED. The arbiter was judging the wrong repository, and
  // every existing test missed it because their closes named ABSOLUTE paths.
  // The close is GREEN in the workdir and does not exist anywhere else, so only a
  // close that actually ran in the workdir can report satisfied — running it in
  // the runner's own directory reds (file not found), which is a DIFFERENT answer.
  // (Asserting the red side would pass for the wrong reason: wrong-dir also reds.)
  const { workdir, target } = makeWork('close-cwd');
  writeFileSync(join(workdir, 'check.mjs'), 'process.exit(0)');
  const s = spec('node check.mjs', {
    steps: [{ id: 'fix', close: { type: 'predicate', cmd: 'node check.mjs', expect: 0 }, class: 'hard' }],
  });
  const provider = stubProvider();
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, target, provider, emit: makeSpine(file), capRuns: 1 });
  const events = readSpine(file);
  assert.equal(events.find((e) => e.type === 'close-precheck').verdict, 'satisfied',
    'the precheck ran the close IN THE WORKDIR — anywhere else it cannot even find it');
  assert.equal(events.find((e) => e.type === 'step-end').outcome, 'already-green');
  assert.equal(outcome, 'green');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'and it cost nothing');
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

test('F32 boundary: a close that crashes at PRECHECK is an instrument stop — close-crashed, zero tokens, never attributed to a worker', async () => {
  // the other half of the F32 attribution rule: worker-crash exists ONLY for a
  // crash that follows worker writes. Before any tokens there is no worker to
  // blame, so the precheck's crash keeps its instrument name and stops the job.
  const { workdir, target } = makeWork('precheck-crashed');
  const crashy = join(workdir, 'crashy.mjs');
  writeFileSync(crashy, 'console.log("# tests 1"); process.exit(1);'); // under the declared floor: judged nothing
  const provider = stubProvider();
  const s = spec(`node ${crashy}`, {
    steps: [{ id: 'fix', close: { type: 'predicate', cmd: `node ${crashy}`, expect: 0, judged: { pattern: '^# tests (\\d+)$', min: 2 } }, class: 'hard' }],
  });
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, target, provider, emit: makeSpine(file), capRuns: 2 });
  const events = readSpine(file);
  assert.equal(outcome, 'step-red:fix');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'zero tokens on a crashed arbiter');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'close-crashed', 'the crash keeps its instrument name');
  assert.ok(!events.some((e) => e.type === 'worker-crash'), 'no worker exists yet — nothing to attribute');
});

test('a cadenced no-op run opens NO PR: nothing changed in the fence → nothing for a human to review, job ends green', async () => {
  // found by the REAL job #1 rung-exit run on litectx (2026-07-13): with every
  // step already-green, the hitl step still branched/added/committed — and `git
  // commit` correctly failed ("nothing added to commit"), so a daily cadence on
  // a green repo emitted a broken-PR escalation EVERY DAY. There is no decision
  // to make when nothing changed.
  const exec = stubExec({ dirty: false });
  const { workdir, target, suiteCmd } = makeWork('hitl-noop');
  writeFileSync(target, GOOD_SUM); // the work is already done: the suite step skips
  const s = spec(suiteCmd, {
    steps: [
      { id: 'fix', close: { type: 'predicate', cmd: suiteCmd, expect: 0 }, class: 'hard' },
      { id: 'pr', close: { type: 'hitl', prompt: 'review and merge?' }, class: 'hitl' },
    ],
  });
  const provider = stubProvider();
  const file = join(workdir, 'run.jsonl');
  const outcome = await runJob(s, { approvals: approve(s), workdir, target, provider, emit: makeSpine(file), capRuns: 2, execCmd: exec });
  const events = readSpine(file);
  assert.equal(outcome, 'green', 'a no-op cadenced run ends green — not escalated, not pr-red');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'and costs ZERO provider calls');
  assert.deepEqual(exec.calls.map((c) => c.argv.slice(0, 2).join(' ')), ['git status'], 'the fence was checked and NOTHING else ran — no branch, no commit, no push');
  assert.ok(!events.some((e) => e.type === 'pr-opened' || e.type === 'pr-red'), 'no PR, and no PR failure either');
  assert.ok(!events.some((e) => e.type === 'escalation'), 'a silent no-op run raises no decision the human must make');
  const skipped = events.find((e) => e.type === 'pr-skipped');
  assert.ok(skipped && skipped.step === 'pr', 'the skip is a visible spine record, never a silent omission');
  assert.equal(events.find((e) => e.type === 'step-end' && e.step === 'pr').outcome, 'already-green');
  assert.equal(events.find((e) => e.type === 'job-end').outcome, 'green');
});

test('a broken git status (not a repo) still opens the PR path — a failed check never silently swallows the escalation', async () => {
  const exec = stubExec({ failAt: 'git status' });
  const { outcome, events } = await run('hitl-status-broken', { execCmd: exec });
  assert.equal(outcome, 'escalated', 'the hitl escalation still fires');
  assert.ok(events.some((e) => e.type === 'pr-red' || e.type === 'pr-opened'), 'the PR path ran rather than being skipped on an unknown fence state');
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
