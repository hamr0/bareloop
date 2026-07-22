// Layer 2 module 4b: the plan executor — SCOUT → PLAN (validated) → per-step
// micro-loops (judge = exit evaluator) → ONE replan → the operator's close.
// Integration-grade: real bare-agent Loop, real Gate, real spawned checks and
// closes, scripted provider (the one legitimate seam). Doctrine under test:
// the F46 mechanism end-to-end (an exit gap converts the next attempt), the
// prompt contract (v1.12 §5 — the worker never sees budget/close-cmd/checks'
// cmds), one replan, preflight check validation before tokens, and the
// already-green distinct record (F17).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { scriptedProvider, scriptedNativeFactory } from './helpers.js';

const tcall = (id, name, args) => ({ id, name, arguments: args });

/**
 * A real patient: close greens iff tests/test_x.mjs exists and contains "ok";
 * the clean-run check greens on the same condition (a cheap in-run mirror of
 * the close's wall — the F46 shape). Both are real spawned scripts.
 */
function makePatient(t, { closeGreen = false } = {}) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  mkdirSync(join(wd, 'tests'));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('suite: 1 passed'); process.exit(0); }
console.log('FAILED tests/test_x.mjs — file missing or has no ok assertion'); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), closeGreen ? 'process.exit(0)\n' : probe);
  writeFileSync(join(wd, 'check.mjs'), probe);
  return wd;
}

const JOB = (wd, over = {}) => ({
  schema: 'job-v1',
  job: 'plan-patient',
  description: 'write the missing test through an agent-authored plan',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs with an ok assertion so the suite greens.',
  verdictType: 'green',
  close: { type: 'predicate', cmd: 'node close.mjs', expect: 0 },
  checks: [{ name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const PLAN = (wd, steps) => JSON.stringify({
  schema: 'plan-v1',
  steps: steps ?? [{
    id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
    tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  }],
});

/** collect spine events in memory (the pure-listener contract) */
const collector = () => {
  /** @type {any[]} */
  const events = [];
  return { events, emit: (type, data = {}) => { const e = { type, ...data }; events.push(e); return e; } };
};

async function go(wd, provider, { job = JOB(wd), capRuns = 3 } = {}) {
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns, remainingUsd: () => 1.5 });
  return { outcome, events };
}

test('happy path: scout → plan → write step (exits green) → close green; plan-executed on the spine', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty — no test exists yet.' },      // scout
    { text: PLAN(wd) },                                                            // plan draft
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },                                            // attempt summary
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  assert.ok(existsSync(join(wd, 'tests', 'test_x.mjs')));
  assert.ok(events.find((e) => e.type === 'scout-result'), 'scout ran');
  assert.equal(events.find((e) => e.type === 'plan-validate')?.ok, true);
  const exec = events.find((e) => e.type === 'plan-executed');
  assert.ok(exec, 'plan-as-executed is on the spine (design law #2)');
  assert.deepEqual(exec.steps.map((s) => s.outcome), ['green']);
  assert.equal(exec.replanned, false);
  const exits = events.filter((e) => e.type === 'exit-eval');
  assert.ok(exits.length >= 1, 'exit evaluations are on the spine');
  assert.ok(exits.at(-1).results.every((r) => r.pass));
});

test('prompt contract (v1.12 §5): the worker sees the repo root and its action — NEVER the budget, the close cmd, or a check cmd', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  await go(wd, provider);
  const stepPrompts = provider.calls.slice(2); // after scout + plan
  assert.ok(stepPrompts.length >= 1);
  for (const p of stepPrompts) {
    assert.ok(p.includes(wd), 'the absolute repo root is stated (F10)');
    assert.ok(!p.includes('close.mjs'), 'the close command never reaches the worker');
    assert.ok(!p.includes('check.mjs'), 'a check\'s command never reaches the worker (it references checks by name only)');
    assert.ok(!/budgetUsd|1\.5/.test(p), 'the budget never reaches the worker');
  }
});

test('the F46 mechanism: a red check feeds its mechanical gap to attempt 2, which converts', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    // attempt 1: writes a file WITHOUT the ok marker — tree changes, check reds
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'not yet\n' })] },
    { text: 'wrote a test' },
    // attempt 2: sees the FAILED line, fixes it
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — fixed\n' })] },
    { text: 'fixed the assertion' },
  ]);
  const { outcome } = await go(wd, provider);
  assert.equal(outcome, 'green');
  const attempt2 = provider.calls[4];
  assert.match(attempt2, /FAILED tests\/test_x\.mjs/, 'the check\'s kept-failures line (gapKeep) reached attempt 2 — the mechanical wall (F38/F46)');
});

test('plan drafting: an invalid first draft is fed back its reds and the redraft proceeds; two invalid drafts end plan-red', async (t) => {
  const wd = makePatient(t);
  const bad = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'x', action: 'do', tools: ['run'], rounds: 6, exit: [{ type: 'tree-changed', scope: 'tests/**' }] }] });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: bad },                        // draft 1: verb-escape (run)
    { text: PLAN(wd) },                   // redraft: valid
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  assert.match(provider.calls[2], /verb-escape/, 'the redraft prompt names the reds');
  const validates = events.filter((e) => e.type === 'plan-validate');
  assert.deepEqual(validates.map((e) => e.ok), [false, true]);

  const wd2 = makePatient(t);
  const stubborn = scriptedProvider([{ text: 'scout' }, { text: bad }, { text: bad }]);
  const r2 = await go(wd2, stubborn);
  assert.equal(r2.outcome, 'plan-red');
  assert.ok(r2.events.some((e) => e.type === 'plan-red' && e.code === 'verb-escape'));
});

test('ONE replan: a step that exhausts its attempts triggers exactly one replan; the replanned plan greens', async (t) => {
  const wd = makePatient(t);
  // plan A's step writes nothing (text-only attempts) → tree-changed reds every
  // attempt → cap → replan; plan B's step writes and greens
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'thinking about it' },   // attempt 1: no write
    { text: 'still thinking' },      // attempt 2: no write
    { text: PLAN(wd, [{
      id: 'write-test-2', action: 'Actually write tests/test_x.mjs now.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }]) },                            // the replan
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 2 });
  assert.equal(outcome, 'green');
  const replans = events.filter((e) => e.type === 'replan');
  assert.equal(replans.length, 1, 'exactly one replan (unlimited replanning launders thrash as adaptation)');
  assert.equal(events.find((e) => e.type === 'plan-executed').replanned, true);
});

test('a second exhaustion after the replan escalates — the stop is a result', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { text: 'no write 1' }, { text: 'no write 2' },     // plan A exhausts
    { text: PLAN(wd) },                                  // replan
    { text: 'no write 3' },                              // plan B exhausts too (sticks)
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 2 });
  assert.match(outcome, /^step-red:/);
  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'never a second replan');
});

test('preflight: a signed check that cannot RUN escalates broken-close before any tokens', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const job = JOB(wd, { checks: [{ name: 'clean-run', cmd: 'no-such-binary --x', expect: 0 }] });
  const { outcome, events } = await go(wd, provider, { job });
  assert.equal(outcome, 'check-red');
  assert.equal(provider.calls.length, 0, 'no tokens were spent');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'broken-close');
  assert.match(esc.detail ?? '', /clean-run/);
});

test('an already-green close at precheck ends the run as the DISTINCT already-green, zero tokens (F17)', async (t) => {
  const wd = makePatient(t, { closeGreen: true });
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'already-green');
  assert.equal(provider.calls.length, 0);
  assert.ok(events.some((e) => e.type === 'close-precheck'));
});

test('outer close red after green steps: the gap feeds ONE bounded fix loop judged by the REAL close', async (t) => {
  const wd = makePatient(t);
  // the check greens on "ok" but the CLOSE also wants the file to import the module —
  // make close stricter than the check so steps green while the close reds once
  writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('ok') && t.includes('import')) process.exit(0);
console.log('FAILED close: the test never imports the module'); process.exit(1);\n`);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },                 // step greens (check passes)
    // fix loop attempt: sees the close gap, adds the import
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: "import { x } from '../src/mod.mjs'; // ok\n" })] },
    { text: 'added the import' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  const fixPrompt = provider.calls[4];
  assert.match(fixPrompt, /FAILED close: the test never imports/, 'the close gap reached the fix loop');
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop is a named spine phase');
});

test('every provider round is metered on the spine as worker-round with a phase label (F12: money per round, attributable)', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { events } = await go(wd, provider);
  const rounds = events.filter((e) => e.type === 'worker-round');
  assert.ok(rounds.length >= 4, `scout + plan + 2 step rounds at least, got ${rounds.length}`);
  const phases = new Set(rounds.map((r) => r.phase));
  assert.ok(phases.has('scout') && phases.has('plan'), `phases label attribution, got ${[...phases]}`);
  assert.ok(rounds.every((r) => 'costUsd' in r), 'every round carries its cost (null is the honest unknown, never omitted)');
});

test('the scout is read-only by construction: its tool menu carries no write-class verb', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  await go(wd, provider);
  const scoutMenu = provider.toolsOffered[0];
  assert.ok(!scoutMenu.includes('shell_write') && !scoutMenu.includes('shell_edit'),
    `the menu is the grant — the scout cannot write, got ${scoutMenu}`);
  assert.ok(scoutMenu.includes('shell_read'), 'the scout can read');
  const planMenu = provider.toolsOffered[1];
  assert.deepEqual(planMenu, [], 'the planner sees the scout blob only — never the repo (no tools at all)');
});

// ── review 2026-07-21: doctrine-restoring fixes to the graduated plan flow ──

test('a GOLD close that validates under verdictType green is refused close-unsupported by the plan flow — never a TypeError on close.cmd (review #1)', async (t) => {
  const wd = makePatient(t);
  const job = JOB(wd, { close: { type: 'gold', expected: 'x', compare: 'exact' }, checks: undefined });
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'green + gold-close validates (gold is hard-class) — the hazard is real, not hypothetical');
  const provider = scriptedProvider([{ text: 'never reached' }]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'close-unsupported', 'a non-predicate close is a clean refusal, not a crash');
  assert.equal(provider.calls.length, 0, 'refused before any tokens');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1)?.category, 'close-unsupported');
});

test('an unpriced round halts the plan flow IN-FLIGHT (pricing-red) instead of burning the whole plan — F6 at the plan boundary (review #3)', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout notes' }, { text: PLAN(wd) }]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 1.5,
    isUnpriced: () => provider.calls.length >= 1, // flips true once the scout round returns unpriced
  });
  assert.equal(outcome, 'pricing-red');
  assert.equal(provider.calls.length, 1, 'bailed right after the scout — the plan was never drafted, no steps ran');
});

test('a step that money-halts (wallet drained) returns cap-halt and does NOT replan — a drained wallet is a stop, not an adaptation (review #5, F45 class)', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
    { text: 'attempt' },
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  let calls = 0;
  // ample for scout(1) + plan-drafter(2) construction; drained by the step worker(3) and the replan check(4)
  const remainingUsd = () => (++calls <= 2 ? 1.5 : 0.0001);
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd });
  assert.equal(outcome, 'cap-halt', 'a money-gate halt is its own honest terminal, not a mislabeled step-red');
  assert.ok(!events.find((e) => e.type === 'replan'), 'no replan burns tokens against a drained wallet');
});

test('the replan drafter is bounded by the CURRENT wallet, not a stale pre-execute allocation — advertised budget == enforced budget (review #4)', async (t) => {
  const wd = makePatient(t);
  const step = JSON.stringify({
    schema: 'plan-v1',
    steps: [{ id: 'w', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 1, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs' }] }],
  });
  const provider = scriptedProvider([
    { text: 'scout', costUsd: 0.001 },              // 0 scout
    { text: step, costUsd: 0.001 },                 // 1 initial plan draft
    { text: 'attempt 1 — no write', costUsd: 0.6 }, // 2 step attempt 1 (writes nothing → artifact-written red)
    { text: 'attempt 2 — no write', costUsd: 0.6 }, // 3 step attempt 2 → exhaustion, funds partly drained
    { text: step, costUsd: 0.6 },                    // 4 replan draft — a fresh drafter can no longer afford this round
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd, { checks: undefined }));
  let spent = 0;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'worker-round' && typeof data.costUsd === 'number') spent += data.costUsd;
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit: emit2, capRuns: 2, remainingUsd: () => 1.5 - spent });
  assert.ok(events.find((e) => e.type === 'replan'), 'exhaustion with funds left DID trigger the one replan');
  assert.equal(outcome, 'cap-halt', 'the replan draft cap-halts against the drained wallet — a stale full-budget drafter would have proceeded');
});

test('a step SETUP fault is recorded on the plan-executed spine with the SAME category the escalation carries — never a self-contradicting record (review #6, F11 misfiling)', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }, { text: 'x' }]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  let n = 0;
  // throw at the STEP worker's construction (call 3): scout(1) + drafter(2) succeed first,
  // and ralph catches middle throws — so this catch is reachable ONLY by a setup fault
  const remainingUsd = () => { n += 1; if (n >= 3) throw new Error('boom: cannot size the wallet'); return 1.5; };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd });
  const exec = events.find((e) => e.type === 'plan-executed');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.ok(exec, 'plan-executed is on the spine — the record never dangles');
  assert.equal(exec.steps.at(-1).outcome, esc.category, 'the recorded step outcome MATCHES the escalation category (no contradiction)');
  assert.equal(esc.category, 'interpreter-red', 'an uncategorized setup throw is interpreter-red (infra), not provider-red');
  assert.equal(outcome, 'interpreter-red');
});

// ── module 4d: NATIVE clipipe (BA-16). The plan flow is provider-agnostic —
// only the WORKER differs. Live-POC-proven that the REAL provider+gate governs;
// these drive OUR executor branch deterministically via a scripted native
// factory. The Loop path (anthropic-api) above is untouched (parity by design).

test('NATIVE clipipe: the SAME plan flow runs green — the CLI executes the gated write, exits green, close green (module 4d)', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  assert.deepEqual(jv.reds, [], 'clipipe-subscription is an admitted provider');
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'src/mod.mjs exports x; tests/ is empty' }] },   // scout session
    { turns: [{ text: PLAN(wd) }] },                                   // plan-draft session
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' } }, { text: 'wrote it' }] },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 3, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');
  assert.ok(existsSync(join(wd, 'tests', 'test_x.mjs')), 'the native session executed the gated write');
  assert.ok(events.find((e) => e.type === 'plan-executed'), 'the SAME plan-executed spine record (design law #2)');
});

test('NATIVE clipipe: the gate DENIES an out-of-fence write — the same fence that held in the live POC, now in-suite (module 4d)', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  const outPath = join(wd, 'secret', 'leak.txt'); // OUTSIDE writeScope tests/**
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'scout' }] },
    { turns: [{ text: PLAN(wd) }] },
    { turns: [{ tool: 'shell_write', args: { path: outPath, content: 'leak\n' } }, { text: 'tried to escape' }] },
  ]);
  const { events, emit } = collector();
  await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 1, remainingUsd: () => 1.5 });
  assert.ok(!existsSync(outPath), 'the out-of-fence write was DENIED by the provider policy — the fence is real, not a fence-that-isn\'t-there');
});

test('NATIVE clipipe: money is metered at SESSION close (worker-round); per-turn events are attribution-only — the per-session reconciliation (module 4d)', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'scout' }], cost: 0.02 },
    { turns: [{ text: PLAN(wd) }], cost: 0.01 },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' } }, { text: 'done' }], cost: 0.03 },
  ]);
  let spent = 0;
  const { events, emit } = collector();
  const meter = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'worker-round' && typeof data.costUsd === 'number') spent += data.costUsd; // mirror run.js's ledger
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, { workdir: wd, nativeProvider, emit: meter, capRuns: 3, remainingUsd: () => 1.5 });
  assert.equal(outcome, 'green');
  const rounds = events.filter((e) => e.type === 'worker-round');
  const turnEvents = events.filter((e) => e.type === 'worker-turn');
  assert.ok(turnEvents.length >= 3, 'per-turn attribution rides the spine as worker-turn');
  assert.ok(rounds.every((r) => typeof r.costUsd === 'number'), 'every ACCOUNTED worker-round carries a real session cost — never a null-per-turn (F6 not tripped)');
  assert.ok(Math.abs(spent - 0.06) < 1e-9, `the ledger sums SESSION totals only (0.02+0.01+0.03), got ${spent}`);
});

test('NATIVE clipipe: a maxTurns session is a BOUNDED attempt (judged, gap forward), not an escalation — the loop.stop() analog (module 4d)', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'scout' }] },
    { turns: [{ text: PLAN(wd) }] },
    // 7 text turns with the step round-bound at 6 → max_turns, and NOTHING written
    { turns: Array.from({ length: 7 }, (_, i) => ({ text: `thinking ${i}` })) },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' } }, { text: 'now wrote it' }] },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 3, remainingUsd: () => 1.5 });
  assert.ok(events.some((e) => e.type === 'attempt-bounded' && e.native === true), 'the maxTurns session emitted attempt-bounded, not an escalation');
  assert.equal(outcome, 'green', 'the bounded attempt fed its gap forward and attempt 2 converted');
});

test('NATIVE clipipe: a clipipe-subscription job with NO native factory wired is interpreter-red — never a silent fall-back to the metered API (module 4d)', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, emit, capRuns: 3, remainingUsd: () => 1.5 }); // no nativeProvider
  assert.equal(outcome, 'interpreter-red', 'a missing factory is a wiring stop, before any tokens or the close');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1)?.category, 'interpreter-red');
});
