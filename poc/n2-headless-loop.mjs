// N2 POC #1 — composition, token-free (NEVER ships; the finding does).
// Riskiest composition assumptions under test:
//   A. happy chain: draft → validate → sequential per-step interpret loops →
//      hitl step becomes a decision-ready escalation (run ends 'escalated' BY DESIGN)
//   B. a step that cannot green stops the job and the escalation NAMES the step
//   C. the ONE budget: spend accumulates across draft + steps; a step whose
//      ceiling is exhausted reds before tokens (cap-not-estimate, composed)
//   D. checkApproval refuses before ANY provider call
//   E. drafting is one sealed shot + one redraft; reds feed the redraft prompt
// Run: node poc/n2-headless-loop.mjs   (exit 0 = all scenarios hold)

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateJob, jobSpecHash, checkApproval } from '../src/job.js';
import { validateConfig } from '../src/validate.js';
import { interpret } from '../src/interpret.js';
import { makeSpine } from '../src/spine.js';

const base = mkdtempSync(join(tmpdir(), 'n2-poc-'));
const GOOD_SUM = 'export function sum(a, b) { return a + b; }\n';
const BAD_SUM = 'export function sum(a, b) { return a - b; }\n';

// ---- the job (job #1's shape, 2 hard steps + the hitl step) ----
const jobSpec = (over = {}) => ({
  schema: 'job-v1',
  job: 'poc-maintainer',
  description: 'fix sum.mjs until the suite greens; then style; then PR',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  steps: [
    { id: 'fix', close: { type: 'predicate', cmd: 'SUITE', expect: 0 }, class: 'hard' },
    { id: 'style', close: { type: 'predicate', cmd: 'SUITE', expect: 0 }, class: 'hard' },
    { id: 'pr', close: { type: 'hitl', prompt: 'PR opened - review and merge?' }, class: 'hitl' },
  ],
  escalation: { mode: 'decision-ready' },
  ...over,
});

// a workflow config the "drafter" emits (fixture-shaped, fits inside the fence)
const draftedConfig = (budgetUsd = 1) => JSON.stringify({
  schema: 'v1',
  loop: { shape: 'refine', maxIterations: 3 },
  memory: { store: 'litectx' },
  hooks: { 'on-green': [{ op: 'remember', kind: 'fact' }] },
  gate: { budgetUsd, writeScope: ['src/**'] },
  escalation: { mode: 'decision-ready' },
});

// stub provider: routes by prompt marker — drafting calls get config JSON,
// worker calls get file content from a script. Counts everything.
function stubProvider({ drafts, worker, draftCostUsd = 0.001, workCostUsd = 0.001 }) {
  const calls = { draft: [], work: [] };
  let d = 0; let w = 0;
  return {
    calls,
    async generate(messages) {
      const prompt = messages.at(-1).content;
      if (prompt.startsWith('DRAFT-CONFIG')) {
        calls.draft.push(prompt);
        const text = drafts[Math.min(d++, drafts.length - 1)];
        return { text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: draftCostUsd, model: null };
      }
      calls.work.push(prompt);
      const text = worker[Math.min(w++, worker.length - 1)];
      return { text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: workCostUsd, model: null };
    },
  };
}

function makeRepo(name, { breakSuite = false } = {}) {
  const workdir = join(base, name);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  const suite = join(workdir, 'sum.test.mjs');
  writeFileSync(suite, breakSuite
    ? 'process.exit(1); // a close that can never green'
    : `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));`);
  return { workdir, target: join(workdir, 'src', 'sum.mjs'), suiteArgv: `node --test ${suite}` };
}

// ---- the runner prototype (what src/run.js will become) ----
async function runJobPoc(rawSpec, { approvals, workdir, target, suiteArgv, provider, shellCapUsd = 2, emit }) {
  // D: approval gate — before ANY provider call
  if (!checkApproval(rawSpec, approvals)) {
    emit('job-end', { outcome: 'unapproved-spec' });
    return 'unapproved-spec';
  }
  const jv = validateJob(rawSpec, { shellCapUsd });
  if (!jv.ok) { emit('job-end', { outcome: 'job-red' }); return 'job-red'; }
  const job = /** @type {any} */ (jv.job);

  let spent = 0;
  const meter = (type, payload) => { // the runner owns the cumulative ledger
    if (type === 'worker-result' && typeof payload?.costUsd === 'number') spent += payload.costUsd;
    emit(type, payload);
  };

  // E: one sealed drafting shot + one redraft, reds fed back
  const draft = async (reds) => {
    const r = await provider.generate([{ role: 'user', content: `DRAFT-CONFIG ${JSON.stringify({ job, reds })}` }]);
    spent += r.costUsd ?? 0;
    return r.text;
  };
  const cap = () => Math.min(shellCapUsd, job.budgetUsd - spent);
  let cv = validateConfig(await draft(null), { shellCapUsd: cap(), jobWriteScope: job.writeScope });
  emit('config-validate', { ok: cv.ok, reds: cv.reds, phase: 'draft-1' });
  if (!cv.ok) {
    cv = validateConfig(await draft(cv.reds), { shellCapUsd: cap(), jobWriteScope: job.writeScope });
    emit('config-validate', { ok: cv.ok, reds: cv.reds, phase: 'draft-2' });
  }
  if (!cv.ok) { emit('job-end', { outcome: 'config-red' }); return 'config-red'; }

  // A/B/C: sequential per-step loops under the one budget
  for (const step of job.steps) {
    if (step.close.type === 'hitl') {
      emit('escalation', { category: 'hitl-close', step: step.id, prompt: step.close.prompt, spentUsd: spent });
      emit('job-end', { outcome: 'escalated', step: step.id });
      return 'escalated'; // by design: the human acts outside the run
    }
    const remaining = job.budgetUsd - spent;
    emit('step-start', { step: step.id, remainingUsd: remaining });
    const argv = (step.close.cmd === 'SUITE' ? suiteArgv : step.close.cmd).split(/\s+/);
    const outcome = await interpret(cv.config, {
      task: `${job.description} - step ${step.id}`, target, close: argv,
      workdir, capRuns: 2, emit: meter, provider, shellCapUsd: remaining, jobWriteScope: job.writeScope,
    });
    emit('step-end', { step: step.id, outcome, spentUsd: spent });
    if (outcome !== 'green') {
      emit('job-end', { outcome: `step-red`, step: step.id, cause: outcome });
      return `step-red:${step.id}`;
    }
  }
  emit('job-end', { outcome: 'green' });
  return 'green';
}

const spineFor = (workdir) => {
  const file = join(workdir, 'run.jsonl');
  writeFileSync(file, '');
  return { file, emit: makeSpine(file), read: () => readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
};
const approve = (spec) => [{ specHash: jobSpecHash(spec), signer: 'hamr', ts: '2026-07-12T00:00:00Z' }];

// ================= scenarios =================
{ // A — happy chain: both hard steps green, hitl becomes the escalation artifact
  const repo = makeRepo('a-happy');
  const spec = jobSpec();
  const provider = stubProvider({ drafts: [draftedConfig()], worker: [GOOD_SUM] });
  const s = spineFor(repo.workdir);
  const out = await runJobPoc(spec, { approvals: approve(spec), ...repo, provider, emit: s.emit });
  assert.equal(out, 'escalated', 'A: the run ends at the hitl step by design');
  const ev = s.read();
  assert.deepEqual(ev.filter((e) => e.type === 'step-start').map((e) => e.step), ['fix', 'style'], 'A: both hard steps ran, in order');
  const esc = ev.find((e) => e.type === 'escalation' && e.category === 'hitl-close');
  assert.ok(esc && esc.prompt.includes('review and merge'), 'A: escalation carries the operator prompt');
  assert.ok(esc.spentUsd > 0, 'A: the escalation reports real spend');
  const starts = ev.filter((e) => e.type === 'step-start');
  assert.ok(starts[1].remainingUsd < starts[0].remainingUsd, 'A: the ONE budget drains across steps');
  console.log('A ok — happy chain, hitl escalation, budget drains across steps');
}

{ // B — a step that cannot green stops the job and names itself
  const repo = makeRepo('b-stepred', { breakSuite: true });
  const spec = jobSpec();
  const provider = stubProvider({ drafts: [draftedConfig()], worker: [GOOD_SUM] });
  const s = spineFor(repo.workdir);
  const out = await runJobPoc(spec, { approvals: approve(spec), ...repo, provider, emit: s.emit });
  assert.equal(out, 'step-red:fix', 'B: the stop names the step that died');
  const end = s.read().find((e) => e.type === 'job-end');
  assert.equal(end.step, 'fix', 'B: job-end attributes the stop');
  assert.ok(!s.read().some((e) => e.type === 'step-start' && e.step === 'style'), 'B: later steps never ran');
  console.log('B ok — step-red stops the job with attribution');
}

{ // C1 — MID-JOB exhaustion: step 1's spend drains the ledger below the gate's
  // ceiling; step 2 reds bounds BEFORE tokens (cap-not-estimate, composed)
  const repo = makeRepo('c-budget');
  const spec = jobSpec({ budgetUsd: 0.5 });
  // draft 0.001 + step-1 worker call 0.15 → remaining 0.349 < drafted gate 0.4
  const provider = stubProvider({ drafts: [draftedConfig(0.4)], worker: [GOOD_SUM], workCostUsd: 0.15 });
  const s = spineFor(repo.workdir);
  const out = await runJobPoc(spec, { approvals: approve(spec), ...repo, provider, emit: s.emit });
  assert.equal(out, 'step-red:style', 'C1: the drained ledger stops the job at the SECOND step');
  const reds = s.read().filter((e) => e.type === 'config-red');
  assert.ok(reds.some((r) => r.code === 'bounds' && r.path === 'gate.budgetUsd'), 'C1: the stop is a bounds red, before tokens');
  assert.equal(provider.calls.work.length, 1, 'C1: step 2 burned zero worker tokens');
  console.log('C1 ok — mid-job exhaustion: step 2 reds before tokens');
}

{ // C2 — DRAFT-TIME exhaustion: a fat draft alone drains the ledger; the run
  // dies at the drafting gate, never reaching a step (found by this POC's first
  // run — the mechanism is stricter than the scenario originally assumed)
  const repo = makeRepo('c2-budget');
  const spec = jobSpec({ budgetUsd: 0.5 });
  const provider = stubProvider({ drafts: [draftedConfig(0.4)], worker: [GOOD_SUM], draftCostUsd: 0.45 });
  const s = spineFor(repo.workdir);
  const out = await runJobPoc(spec, { approvals: approve(spec), ...repo, provider, emit: s.emit });
  assert.equal(out, 'config-red', 'C2: draft-time exhaustion is a config-red stop');
  assert.equal(provider.calls.work.length, 0, 'C2: zero worker tokens ever');
  console.log('C2 ok — draft-time exhaustion dies at the drafting gate');
}

{ // D — unapproved spec: refusal before any provider call
  const repo = makeRepo('d-unapproved');
  const spec = jobSpec();
  const provider = stubProvider({ drafts: [draftedConfig()], worker: [GOOD_SUM] });
  const s = spineFor(repo.workdir);
  const out = await runJobPoc(spec, { approvals: [], ...repo, provider, emit: s.emit });
  assert.equal(out, 'unapproved-spec');
  assert.equal(provider.calls.draft.length + provider.calls.work.length, 0, 'D: zero provider calls, zero tokens');
  const edited = jobSpec({ budgetUsd: 1.4 }); // approval binds to the exact version
  const out2 = await runJobPoc(edited, { approvals: approve(jobSpec()), ...repo, provider, emit: s.emit });
  assert.equal(out2, 'unapproved-spec', 'D: an edited spec is unapproved by construction');
  console.log('D ok — human-signs-always gates the runner, zero tokens on refusal');
}

{ // E — drafting: first draft reds, reds feed the redraft, second draft runs; a third never happens
  const repo = makeRepo('e-redraft');
  const spec = jobSpec();
  const badDraft = JSON.stringify({ schema: 'v1', loop: { shape: 'refine' }, memory: { store: 'litectx' }, gate: { budgetUsd: 1, writeScope: ['docs/**'] }, escalation: { mode: 'decision-ready' } }); // escapes the fence
  const provider = stubProvider({ drafts: [badDraft, draftedConfig()], worker: [GOOD_SUM] });
  const s = spineFor(repo.workdir);
  const out = await runJobPoc(spec, { approvals: approve(spec), ...repo, provider, emit: s.emit });
  assert.equal(out, 'escalated', 'E: the redraft rescued the run');
  assert.equal(provider.calls.draft.length, 2, 'E: exactly one redraft');
  assert.ok(provider.calls.draft[1].includes('scope-escape'), 'E: the reds fed the redraft prompt');

  // and a drafter that NEVER greens gets exactly two shots, then config-red
  const provider2 = stubProvider({ drafts: [badDraft, badDraft], worker: [GOOD_SUM] });
  const repo2 = makeRepo('e2-redraft');
  const s2 = spineFor(repo2.workdir);
  const out2 = await runJobPoc(spec, { approvals: approve(spec), ...repo2, provider: provider2, emit: s2.emit });
  assert.equal(out2, 'config-red', 'E: two reds = stop, no draft-until-green grinding');
  assert.equal(provider2.calls.draft.length, 2, 'E: never a third shot');
  console.log('E ok — one sealed shot + one redraft, reds feed back, no grinding');
}

console.log('\nPOC #1 verdict: composition holds — runner = approval gate → sealed draft(+1) → sequential interpret loops under one ledger. src/run.js can be built to this shape.');
