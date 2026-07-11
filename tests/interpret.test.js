// Interpreter exit criteria as behavior tests: green on valid config, broken
// config → red not crash (zero tokens), gate provably binds (over-cap halts).
// Everything is real (Loop, Gate, LiteCtx, ralph, a real node --test close)
// except the LLM: the provider is a scripted stub — the legitimate seam, since
// the provider is a SHELL-owned binding by design (never the config's).
// Reference semantics: adaptlearn's M2/M5 suites.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSpine } from '../src/spine.js';
import { interpret } from '../src/interpret.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

const base = mkdtempSync(join(tmpdir(), 'interpret-test-'));

// scripted provider: returns each script entry in turn (sticks on the last), counts calls
function stubProvider(script) {
  const calls = [];
  return {
    calls,
    async generate(messages) {
      const s = script[Math.min(calls.length, script.length - 1)];
      calls.push(messages.at(-1).content);
      return { text: s.text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: s.costUsd ?? 0.001, model: null };
    },
  };
}

const GOOD_SUM = 'export function sum(a, b) { return a + b; }\n';
const BAD_SUM = 'export function sum(a, b) { return a - b; }\n';
const TASK = 'Implement sum.mjs exporting sum(a, b) returning the numeric sum.';

// artifact lives under src/ (inside valid.json's writeScope "src/**"); the suite
// lives OUTSIDE the scope — a workflow can never edit its own close
function makeWork(name) {
  const workdir = join(base, name);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  const target = join(workdir, 'src', 'sum.mjs');
  const suite = join(workdir, 'sum.test.mjs');
  writeFileSync(suite, `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));
`);
  return { workdir, target, close: ['node', '--test', suite] };
}

const config = () => JSON.parse(readFileSync(new URL('./fixtures/valid.json', import.meta.url), 'utf8'));

async function run(name, cfg, { script = [{ text: GOOD_SUM }], capRuns = 3, ...rest } = {}) {
  const { workdir, target, close } = makeWork(name);
  const provider = stubProvider(script);
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(cfg, { task: TASK, target, close, workdir, capRuns, emit: makeSpine(file), provider, ...rest });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  return { outcome, events, provider, target, workdir };
}

test('valid config + correct artifact → green; artifact on disk; on-green remember ran', async () => {
  const { outcome, events, target } = await run('green', config());
  assert.equal(outcome, 'green');
  assert.equal(readFileSync(target, 'utf8'), GOOD_SUM.trim()); // stripFences trims — the close, not bytes, is the contract
  assert.ok(events.some((e) => e.type === 'hook-op' && e.op === 'remember'), 'verdict-gated retention fired');
  assert.ok(events.some((e) => e.type === 'worker-result' && e.costUsd > 0), 'provider cost reached the spine');
});

test('gap feedback reaches the second attempt (refine wiring)', async () => {
  const { outcome, provider } = await run('refine-gap', config(), { script: [{ text: BAD_SUM }, { text: GOOD_SUM }] });
  assert.equal(outcome, 'green');
  assert.equal(provider.calls.length, 2);
  assert.match(provider.calls[1], /failed the test suite/, 'second prompt carries the close gap');
});

test('broken config → config-red, not a crash, and ZERO provider calls', async () => {
  const broken = config();
  delete broken.gate.writeScope;
  const { outcome, events, provider } = await run('config-red', broken);
  assert.equal(outcome, 'config-red');
  assert.equal(provider.calls.length, 0, 'reds before tokens burn');
  assert.equal(events.find((e) => e.type === 'config-red').path, 'gate.writeScope');
});

test('gate provably binds: over-cap run halts as cap-halt, its own category', async () => {
  const tiny = config();
  tiny.gate.budgetUsd = 0.02;
  const { outcome, events, provider } = await run('cap-halt', tiny, {
    script: [{ text: BAD_SUM, costUsd: 0.05 }], capRuns: 4, // every attempt red + each call over the whole budget
  });
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'cap-halt');
  assert.ok(esc.decisionReady);
  assert.ok(provider.calls.length < 4, `gate halted before the run cap (calls: ${provider.calls.length})`);
  assert.ok(events.some((e) => e.type === 'cap-halt'), 'cap-halt event present, never merged with wrong');
});

test('write outside the config writeScope → gate-red, not interpreter-red', async () => {
  const scoped = config();
  scoped.gate.writeScope = ['allowed-dir/**'];
  const { outcome, events } = await run('gate-red', scoped);
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'gate-red');
  assert.ok(!existsSync(join(base, 'gate-red', 'src', 'sum.mjs')), 'nothing written outside scope');
});

test('loop.shape is wired in: plan makes a plan call before the implement call', async () => {
  const planned = config();
  planned.loop.shape = 'plan';
  const { outcome, events, provider } = await run('plan-shape', planned, {
    script: [{ text: '1. write sum\n2. export it' }, { text: GOOD_SUM }],
  });
  assert.equal(outcome, 'green');
  assert.equal(provider.calls.length, 2, 'plan shape = decompose call + implement call');
  assert.ok(events.some((e) => e.type === 'worker-plan'), 'plan call on the spine');
  assert.match(provider.calls[1], /Follow this plan/, 'implement call carries the plan');
});

test('config maxIterations tightens the shell cap, never exceeds it', async () => {
  const short = config();
  short.loop.maxIterations = 2;
  const { outcome, events } = await run('tighten', short, { script: [{ text: BAD_SUM }], capRuns: 5 });
  assert.equal(outcome, 'escalated');
  assert.equal(events.findLast((e) => e.type === 'run-end').iterations, 2, 'stopped at the config bound, under the shell cap');
});

test('config-final on the spine carries the run-as-executed config (design law #2)', async () => {
  const c = config();
  const { events } = await run('config-final', c, { script: [{ text: GOOD_SUM }] });
  const fin = events.findLast((e) => e.type === 'config-final');
  assert.ok(fin, 'config-final emitted');
  assert.equal(fin.revised, false);
  assert.deepEqual(fin.config, c, 'no revision → executed config === authored config');
});

test('on-green hook failure → retention-red on the spine, but the green STANDS', async () => {
  const { workdir, target } = makeWork('retention-red');
  // a close that verifies then deletes the artifact: green verdict, then on-green
  // remember's readFileSync(target) genuinely throws — a real post-green retention failure
  const close = ['node', '-e', `const fs=require('node:fs'); const t=${JSON.stringify(target)}; if(!fs.existsSync(t))process.exit(1); fs.unlinkSync(t); process.exit(0)`];
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), { task: TASK, target, close, workdir, capRuns: 3, emit: makeSpine(file), provider: stubProvider([{ text: GOOD_SUM }]) });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'green', 'a retention hiccup must not un-green a real green');
  const red = events.find((e) => e.type === 'retention-red');
  assert.ok(red, 'retention failure is loud on the spine, not swallowed');
  assert.ok(!events.some((e) => e.type === 'hook-op' && e.op === 'remember'), 'this green minted no inheritance');
});

test('cap trips between the plan call and the implement call → still cap-halt', async () => {
  const planned = config();
  planned.loop.shape = 'plan';
  planned.gate.budgetUsd = 0.02;
  const { outcome, events, provider } = await run('plan-halt', planned, {
    script: [{ text: '1. plan', costUsd: 0.05 }, { text: GOOD_SUM, costUsd: 0.05 }], capRuns: 4,
  });
  assert.equal(outcome, 'escalated');
  assert.equal(events.find((e) => e.type === 'escalation').category, 'cap-halt');
  assert.ok(provider.calls.length <= 2, `halted within the first plan+implement pair (calls: ${provider.calls.length})`);
});

test('remember kind "code" is a verb-params red (validator matches litectx runtime, F5)', async () => {
  const bad = config();
  bad.hooks['on-green'] = [{ op: 'remember', kind: 'code' }];
  const { outcome, events, provider } = await run('remember-kind', bad);
  assert.equal(outcome, 'config-red');
  assert.equal(provider.calls.length, 0);
  assert.equal(events.find((e) => e.type === 'config-red').code, 'verb-params');
});

test('interpreter crash mid-run → interpreter-red, never masquerading as bad harness', async () => {
  const provider = { async generate() { throw new Error('provider exploded'); } };
  const { workdir, target, close } = makeWork('interp-red');
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), { task: TASK, target, close, workdir, capRuns: 3, emit: makeSpine(file), provider });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'escalated');
  assert.equal(events.find((e) => e.type === 'escalation').category, 'interpreter-red');
});

// ---- mid-run revision (stall → revisor → interpreter-owned acceptance) ----
// The revisor is a stub seam here, same doctrine as the provider. What CI
// protects: stall detection fires once and only under a real stall; the
// INTERPRETER accepts or rejects the candidate (a revisor cannot vouch for its
// own output); rejected revisions degrade loudly and the run continues on the
// old config; an accepted revision observably changes behavior mid-run.

const stalling = () => ({ script: [{ text: BAD_SUM }], capRuns: 3 }); // reds forever under cap 3

test('revision: accepted free-axis revision changes behavior mid-run (shape swap observable)', async () => {
  const candidate = config();
  candidate.loop.shape = 'plan';
  let calls = 0;
  const revisor = async () => { calls += 1; return { candidate, costUsd: 0.005 }; };
  // BAD, BAD → stall; iteration 3 under 'plan' consumes a plan call then an implement call
  const { outcome, events } = await run('rev-accept', config(), {
    script: [{ text: BAD_SUM }, { text: BAD_SUM }, { text: '1. just write it' }, { text: GOOD_SUM }],
    capRuns: 3, revisor,
  });
  assert.equal(calls, 1, 'revisor consulted exactly once');
  assert.ok(events.some((e) => e.type === 'stall-detected' && e.iteration === 3));
  const acc = events.find((e) => e.type === 'revision-accepted');
  assert.deepEqual(acc.changedPaths, ['loop.shape']);
  assert.ok(events.some((e) => e.type === 'worker-plan' && e.iteration === 3), 'revised shape actually ran');
  assert.ok(!events.some((e) => e.type === 'worker-plan' && e.iteration < 3), 'shape swap did not rewrite history');
  assert.equal(outcome, 'green');
});

test('revision: arbiter-touch candidate is rejected by the INTERPRETER; run continues on old config', async () => {
  const candidate = config();
  candidate.gate.budgetUsd = 0.01; // tries to author the arbiter mid-run
  const revisor = async () => ({ candidate, costUsd: 0.005 }); // revisor "vouches" — must not matter
  const { outcome, events } = await run('rev-arbiter', config(), { ...stalling(), revisor });
  assert.equal(events.filter((e) => e.type === 'revision-red' && e.code === 'arbiter-touch').length, 1);
  assert.ok(!events.some((e) => e.type === 'revision-accepted'));
  assert.equal(outcome, 'escalated', 'continued on the old config to the cap');
  assert.equal(events.find((e) => e.type === 'escalation').category, 'cap-halt');
});

test('revision: loop.maxIterations is snapshotted — touching it is a cap-touch red, not a silent no-op', async () => {
  const candidate = config();
  candidate.loop.maxIterations = 8;
  const revisor = async () => ({ candidate });
  const { events } = await run('rev-cap-touch', config(), { ...stalling(), revisor });
  assert.equal(events.find((e) => e.type === 'revision-red').code, 'cap-touch');
});

test('revision: invalid candidate → validation revision-red with the named reds', async () => {
  const candidate = config();
  candidate.hooks['before-attempt'] = [{ op: 'remember', kind: 'fact' }]; // verb-placement red
  const revisor = async () => ({ candidate });
  const { events } = await run('rev-invalid', config(), { ...stalling(), revisor });
  const red = events.find((e) => e.type === 'revision-red');
  assert.equal(red.code, 'validation');
  assert.equal(red.reds[0].code, 'verb-placement');
});

test('revision: unparseable candidate → parse-error revision-red, never a crash', async () => {
  const revisor = async () => ({ candidate: null, parseError: 'Unexpected token I' });
  const { outcome, events } = await run('rev-parse', config(), { ...stalling(), revisor });
  assert.equal(events.find((e) => e.type === 'revision-red').code, 'parse-error');
  assert.equal(outcome, 'escalated');
});

test('revision: no revisor → no stall machinery at all (control-arm semantics)', async () => {
  const { events } = await run('rev-none', config(), stalling());
  assert.ok(!events.some((e) => e.type === 'stall-detected'));
  assert.ok(!events.some((e) => e.type === 'revision-red' || e.type === 'revision-accepted'));
});

test('revision: revisor never consulted without a stall', async () => {
  let calls = 0;
  const revisor = async () => { calls += 1; return { candidate: config() }; };
  const { outcome } = await run('rev-green-fast', config(), { script: [{ text: GOOD_SUM }], revisor });
  assert.equal(outcome, 'green');
  assert.equal(calls, 0);
});

test('revision: revisor spend is metered by the RUN\'s gate — an expensive revision halts the run early', async () => {
  const cfg = config();
  cfg.gate.budgetUsd = 0.05;
  // A revisor whose own LLM call costs 0.2 — over the run's budget on its own.
  // It runs its call through the gate handlers the interpreter passes in (the
  // production revisor contract): spend lands on the run's budget axis.
  const expensive = { generate: async () => ({ text: JSON.stringify(config()), toolCalls: [], usage: { inputTokens: 5, outputTokens: 5 }, costUsd: 0.2, model: null }) };
  const revisor = async ({ policy, onLlmResult }) => {
    const loop = new Loop({ provider: expensive, system: 'revise', policy, onLlmResult });
    const r = await loop.run([{ role: 'user', content: 'revise the config' }]);
    return { candidate: JSON.parse(r.text), costUsd: r.cost ?? 0 };
  };
  const { outcome, events } = await run('rev-metered', cfg, { script: [{ text: BAD_SUM, costUsd: 0.001 }], capRuns: 4, revisor });
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'cap-halt');
  assert.equal(esc.spend.runs, 3, 'halted at iteration 3 — BEFORE the run cap of 4: the gate saw the revisor\'s tokens');
  assert.ok(events.some((e) => e.type === 'stall-detected'), 'the revision did fire before the halt');
});
