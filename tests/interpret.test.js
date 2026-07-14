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
// shared fixtures (helpers.js): the scripted stub keeps 2b tool-mode entries and
// the EXPLICIT costUsd: undefined unpriced case ('in', never ?? — F6)
import { scriptedProvider as stubProvider, GOOD_SUM, BAD_SUM, makeSumWork, readSpine, validConfig } from './helpers.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

const base = mkdtempSync(join(tmpdir(), 'interpret-test-'));

const TASK = 'Implement sum.mjs exporting sum(a, b) returning the numeric sum.';

const makeWork = (/** @type {string} */ name) => makeSumWork(base, name);
const config = validConfig;

async function run(name, cfg, { script = [{ text: GOOD_SUM }], capRuns = 3, ...rest } = {}) {
  const { workdir, target, close } = makeWork(name);
  const provider = stubProvider(script);
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(cfg, { task: TASK, target, close, workdir, capRuns, emit: makeSpine(file), provider, ...rest });
  return { outcome, events: readSpine(file), provider, target, workdir };
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
  const events = readSpine(file);
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
  // A GENUINE middle failure — the write itself throws (the target is a directory:
  // the gate allows the path, the filesystem refuses it). NOT a provider throw:
  // that is provider-red now (F11), and using one here was the misclassification.
  const { workdir, close } = makeWork('interp-red');
  const target = join(workdir, 'src', 'sum.mjs');
  mkdirSync(target); // a DIRECTORY where the artifact must be written → writeFileSync EISDIR
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), { task: TASK, target, close, workdir, capRuns: 3, emit: makeSpine(file), provider: stubProvider([{ text: GOOD_SUM }]) });
  const events = readSpine(file);
  assert.equal(outcome, 'escalated');
  assert.equal(events.find((e) => e.type === 'escalation').category, 'interpreter-red', 'a broken middle is still its own category — the class did not collapse into provider-red');
});

// ---- mid-run revision (stall → revisor → interpreter-owned acceptance) ----
// The revisor is a stub seam here, same doctrine as the provider. What CI
// protects: stall detection fires once and only under a real stall; the
// INTERPRETER accepts or rejects the candidate (a revisor cannot vouch for its
// own output); rejected revisions degrade loudly and the run continues on the
// old config; an accepted revision observably changes behavior mid-run.

const stalling = () => ({ script: [{ text: BAD_SUM }], capRuns: 3 }); // reds forever under cap 3

// ---- review fixes: the fence reaches the choke point; revision accepts what validation validated ----

test('interpret enforces the job fence: workflow scope outside jobWriteScope → config-red, zero tokens', async () => {
  const { outcome, events, provider } = await run('fence-choke', config(), { jobWriteScope: ['docs/**'] });
  assert.equal(outcome, 'config-red');
  assert.ok(events.some((e) => e.type === 'config-red' && e.code === 'scope-escape'));
  assert.equal(provider.calls.length, 0, 'reds before tokens');
});

test('R2 CRITICAL: the ".//src/**" spelling resolves INSIDE the workdir, never to an absolute /src', async () => {
  // pre-fix this validated green and the Gate fence resolved to absolute "/src"
  const cfg = config(); cfg.gate.writeScope = ['.//src/**'];
  const { outcome, provider, workdir } = await run('escape-scope', cfg);
  assert.equal(outcome, 'green', 'the sloppy spelling normalizes to src/ and runs');
  assert.ok(provider.calls.length > 0);
  // the audit proves the fence stayed under workdir (no absolute /src grant)
  const audit = readFileSync(join(workdir, 'gate-audit.jsonl'), 'utf8');
  assert.ok(!audit.includes('"/src"'), 'the Gate fence never became the absolute /src');
});

test('secrets in close output never reach the spine OR the next worker prompt (hard line, end to end)', async () => {
  // a close that fails and prints a token; the worker keeps failing so gap feeds forward
  const workdir = join(base, 'secret-gap');
  mkdirSync(join(workdir, 'src'), { recursive: true });
  const leaky = join(workdir, 'leaky.mjs');
  writeFileSync(leaky, 'console.error("auth failed: Bearer sk-ant-abcdefghijklmnop"); process.exit(1);');
  const provider = stubProvider([{ text: BAD_SUM }]);
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), {
    task: TASK, target: join(workdir, 'src', 'sum.mjs'), close: ['node', leaky],
    workdir, capRuns: 2, emit: makeSpine(file), provider,
  });
  assert.equal(outcome, 'escalated');
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes('sk-ant-abcdefghijklmnop'), 'the token never entered the append-only spine');
  // and the worker never saw it either (gap is scrubbed before the prompt)
  assert.ok(!provider.calls.some((c) => c.includes('sk-ant-abcdefghijklmnop')), 'the token never entered a worker prompt');
  // the failure itself still reaches the record (redacted, not hidden — V4)
  assert.ok(raw.includes('[REDACTED') || raw.includes('auth failed'), 'the gap is redacted, not dropped');
});

test('release review: a trailing-slash workdir is a legal spelling — the enforcement belt must not false-red it', async () => {
  const { workdir, target, close } = makeWork('trailing-slash-wd');
  const provider = stubProvider([{ text: GOOD_SUM }]);
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), { task: TASK, target, close, workdir: workdir + '/', capRuns: 3, emit: makeSpine(file), provider });
  assert.equal(outcome, 'green', 'workdir + "/" must behave exactly like workdir');
});

test('release review: a GitHub token in close output is scrubbed — the redactor covers every shape the validator reds', async () => {
  const workdir = join(base, 'secret-gap-ghp');
  mkdirSync(join(workdir, 'src'), { recursive: true });
  const leaky = join(workdir, 'leaky.mjs');
  // build the fakes by concatenation so the literals never sit in this file's bytes
  writeFileSync(leaky, 'console.error("push failed for token ghp_" + "abcdefghijklmnopqrstuv" + " key AKIA" + "ABCDEFGHIJKLMNOP"); process.exit(1);');
  const provider = stubProvider([{ text: BAD_SUM }]);
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), {
    task: TASK, target: join(workdir, 'src', 'sum.mjs'), close: ['node', leaky],
    workdir, capRuns: 2, emit: makeSpine(file), provider,
  });
  assert.equal(outcome, 'escalated');
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes('ghp_' + 'abcdefghijklmnopqrstuv'), 'a GitHub token never enters the append-only spine');
  assert.ok(!raw.includes('AKIA' + 'ABCDEFGHIJKLMNOP'), 'an AWS key never enters the append-only spine');
  assert.ok(!provider.calls.some((c) => c.includes('ghp_' + 'abcdefghijklmnopqrstuv')), 'the token never entered a worker prompt');
  assert.ok(raw.includes('[REDACTED') || raw.includes('push failed'), 'the gap is redacted, not dropped');
});

test('N2: a prose-wrapped artifact greens — only the fenced code reaches the target (fence-robust, F21)', async () => {
  const wrapped = 'Here is the fix you asked for:\n\n```js\n' + GOOD_SUM.trim() + '\n```\n\nHope this helps!';
  const { outcome, target } = await run('prose-wrapped', config(), { script: [{ text: wrapped }] });
  assert.equal(outcome, 'green', 'the prose wrapper must not reach the close');
  assert.equal(readFileSync(target, 'utf8'), GOOD_SUM.trim());
});

test('N2: an empty worker response reds artifact-red on its own axis, target unwritten, and the next attempt is told', async () => {
  const { outcome, events, provider, target } = await run('artifact-red', config(), { script: [{ text: '' }, { text: GOOD_SUM }] });
  assert.equal(outcome, 'green', 'the artifact-red attempt is retryable, not terminal');
  const ar = events.find((e) => e.type === 'artifact-red');
  assert.ok(ar && ar.iteration === 1 && ar.reason === 'empty response', 'artifact-red carries its own category and reason');
  assert.ok(!events.some((e) => e.type === 'artifact-written' && e.iteration === 1), 'nothing was written on the red attempt');
  assert.match(provider.calls[1], /non-artifact|ONLY the code/i, 'the second attempt is told the artifact never reached the close');
  assert.equal(readFileSync(target, 'utf8'), GOOD_SUM.trim());
});

test('R2: a non-canonical but legal scope spelling runs green end to end (no regression)', async () => {
  const cfg = config(); cfg.gate.writeScope = ['./src/**']; // dot-slash form of the fixture's src/**
  const { outcome } = await run('dotslash-scope', cfg);
  assert.equal(outcome, 'green', 'the artifact under ./src/** still writes and greens');
});

test('revision: a candidate arriving as a JSON string is judged on its PARSED form (single-parse contract)', async () => {
  const candidate = config();
  candidate.loop.shape = 'plan'; // legal free-axis change, arbiter byte-identical
  const revisor = async () => ({ candidate: JSON.stringify(candidate), costUsd: 0.005 });
  const { events } = await run('rev-string-candidate', config(), { ...stalling(), revisor, script: [{ text: BAD_SUM }, { text: BAD_SUM }, { text: GOOD_SUM }] });
  const acc = events.find((e) => e.type === 'revision-accepted');
  assert.ok(acc, `expected revision-accepted, got ${JSON.stringify(events.filter((e) => e.type === 'revision-red'))}`);
  assert.deepEqual(acc.changedPaths, ['loop.shape']);
  assert.ok(events.some((e) => e.type === 'config-final' && e.config?.loop?.shape === 'plan'), 'the PARSED candidate is installed, never the string');
});

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

// ---- module 2b: the tool-mode middle (design addendum 2026-07-12b) ----
// Same doctrine as above: everything real (Loop, Gate, shell tools, ralph, a
// real close) except the scripted provider. The POC (poc/n2-tool-middle.mjs)
// proved the containment wiring; these tests pin the interpreter's use of it.

const tcall = (id, name, args) => ({ id, name, arguments: args });
const twd = (name) => join(base, name); // deterministic: makeWork(name) uses the same path

test('tools mode green: the worker writes the artifact THROUGH the gated write tool', async () => {
  const wd = twd('tools-green');
  const { outcome, events } = await run('tools-green', config(), {
    mode: 'tools',
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done — wrote sum.mjs' },
    ],
  });
  assert.equal(outcome, 'green');
  assert.equal(readFileSync(join(wd, 'src', 'sum.mjs'), 'utf8'), GOOD_SUM, 'tool wrote the exact bytes — no extraction layer in tool mode');
  assert.ok(!events.some((e) => e.type === 'artifact-red'), 'artifact-red does not exist in tool mode');
  const wr = events.find((e) => e.type === 'worker-result');
  assert.equal(wr.costUsd, 0.002, 'both rounds priced and summed');
  assert.equal(wr.toolCalls, 1, 'tool invocations ride the worker-result event');
});

test('tools mode: out-of-scope write denied MID-ATTEMPT, deny reason feeds the same attempt, nothing lands outside', async () => {
  const wd = twd('tools-deny');
  const { outcome, provider } = await run('tools-deny', config(), {
    mode: 'tools',
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'escape.txt'), content: 'leak' })] },
      { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done' },
    ],
  });
  assert.equal(outcome, 'green', 'a single deny is feedback, not a stop — the worker pivots');
  assert.ok(!existsSync(join(wd, 'escape.txt')), 'denied write never touched disk');
  assert.match(provider.calls[1], /writeScope/, 'the deny reason reached the worker verbatim');
});

test('tools mode: a denial streak stops the attempt as gate-red, its own category', async () => {
  const wd = twd('tools-streak');
  const esc = (n) => tcall(`t${n}`, 'shell_write', { path: join(wd, `escape-${n}.txt`), content: 'x' });
  const { outcome, events } = await run('tools-streak', config(), {
    mode: 'tools',
    script: [{ toolCalls: [esc(1), esc(2), esc(3)] }, { text: 'never reached' }],
  });
  assert.equal(outcome, 'escalated');
  assert.equal(events.find((e) => e.type === 'escalation').category, 'gate-red');
  assert.ok(!existsSync(join(wd, 'escape-1.txt')), 'nothing written');
});

test('tools mode: the spec grant is the menu — an ungranted tool is never offered', async () => {
  const wd = twd('tools-menu');
  const { outcome, provider } = await run('tools-menu', config(), {
    mode: 'tools', tools: ['read'], capRuns: 2,
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done' },
    ],
  });
  assert.equal(outcome, 'escalated', 'nothing written → the close keeps redding → cap');
  assert.ok(!existsSync(join(wd, 'src', 'sum.mjs')), 'the ungranted write never executed');
  assert.match(provider.calls[1], /Unknown tool/, 'the worker is told the tool does not exist for it');
});

test('tools mode: reads are fenced to the workdir (readScope — the stray-read secrets channel)', async () => {
  const wd = twd('tools-read');
  const { outcome, provider } = await run('tools-read', config(), {
    mode: 'tools',
    script: [
      { toolCalls: [tcall('t1', 'shell_read', { path: '/etc/hostname' })] },
      { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done' },
    ],
  });
  assert.equal(outcome, 'green');
  assert.match(provider.calls[1], /readScope/, 'the out-of-tree read was denied with the reason');
});

test('tools mode: an unpriced run reaches the spine as the honest null, never $0 (F6)', async () => {
  const wd = twd('tools-unpriced');
  const { outcome, events } = await run('tools-unpriced', config(), {
    mode: 'tools',
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })], costUsd: undefined },
      { text: 'done', costUsd: undefined },
    ],
  });
  assert.equal(outcome, 'green', 'green with unpriced spend is exactly the case the runner halts on');
  const wr = events.find((e) => e.type === 'worker-result');
  assert.equal(wr.costUsd, null, 'unknown spend is null on the spine');
  assert.ok(wr.unpricedRounds >= 2, `unpriced rounds visible (got ${wr.unpricedRounds})`);
});

test('tools mode: on-green remember stores the worker summary — no target dependency', async () => {
  const wd = twd('tools-remember');
  const { outcome, events } = await run('tools-remember', config(), {
    mode: 'tools', target: undefined,
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'wrote sum.mjs with the numeric sum' },
    ],
  });
  assert.equal(outcome, 'green');
  assert.ok(events.some((e) => e.type === 'hook-op' && e.op === 'remember'), 'retention fired without a target');
});

test('text mode without target throws immediately — reds-before-tokens, a caller bug is loud', async () => {
  const { workdir, close } = makeWork('no-target');
  const provider = stubProvider([{ text: GOOD_SUM }]);
  const config = { schema: 'v1', loop: { shape: 'refine' }, memory: { store: 'litectx' }, gate: { budgetUsd: 1, writeScope: ['src/**'] }, escalation: { mode: 'decision-ready' } };
  await assert.rejects(
    interpret(config, { task: TASK, close, workdir, capRuns: 2, emit: () => ({}), provider }),
    TypeError,
  );
  assert.equal(provider.calls.length, 0, 'the throw lands before any provider call');
});

// ---- F10: the worker must be TOLD where the repository is (first real-model run) ----
// The real run groped for the repo — it read /home/hamr, the runner's own directory,
// then / — and the fence denied all three until the denial streak stopped it. The
// persona says "always use absolute paths", but nothing ever told the worker WHICH
// absolute path: bare-agent's shell tools resolve relative paths against the PROCESS
// cwd (not the workdir), so a worker with no root is working blind.

test('F10: tool mode tells the worker the absolute repository root, and a worker that uses it greens', async () => {
  const wd = twd('tools-root');
  // the stub reads the root OUT of the prompt — it knows no path a priori, exactly
  // like the real model. If the prompt does not carry it, this cannot write at all.
  const rootUsing = {
    calls: [],
    async generate(messages) {
      const prompt = messages.at(-1).content;
      this.calls.push(prompt);
      const root = (prompt.match(/Repository root \(absolute\): (\S+)/) ?? [])[1];
      if (!root) return { text: 'I do not know where the repository is', toolCalls: [], usage: { inputTokens: 5, outputTokens: 5 }, costUsd: 0.001, model: null };
      if (this.calls.length === 1) {
        return { text: '', toolCalls: [tcall('t1', 'shell_write', { path: join(root, 'src', 'sum.mjs'), content: GOOD_SUM })], usage: { inputTokens: 5, outputTokens: 5 }, costUsd: 0.001, model: null };
      }
      return { text: 'wrote sum.mjs', toolCalls: [], usage: { inputTokens: 5, outputTokens: 5 }, costUsd: 0.001, model: null };
    },
  };
  const { workdir, target, close } = makeWork('tools-root');
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), { task: TASK, target, close, workdir, capRuns: 2, emit: makeSpine(file), provider: rootUsing, mode: 'tools' });
  assert.equal(outcome, 'green', 'the worker could only find the repo if the prompt told it — this is the whole finding');
  assert.match(rootUsing.calls[0], new RegExp(`Repository root \\(absolute\\): ${wd}`), 'the root is stated verbatim');
  assert.equal(readFileSync(join(wd, 'src', 'sum.mjs'), 'utf8'), GOOD_SUM);
});

test('F10: text mode is NOT told a root — it writes one shell-chosen target and has no tools to point anywhere', async () => {
  const { provider } = await run('text-no-root', config(), { script: [{ text: GOOD_SUM }] });
  assert.ok(!/Repository root/.test(provider.calls[0]), 'no dead prompt weight where there are no tools');
});

test('F11: a transport throw in the WORKER path is provider-red, not interpreter-red (a network error is not a broken middle)', async () => {
  // the real run died `read ENETUNREACH` mid-worker-call and was filed
  // interpreter-red — telling the operator to "fix the interpreter" when the
  // truth was "the network failed, retry". bare-agent's Loop throws transport
  // errors out of run(); a throw from the LOOP is provider territory by
  // definition, and the drafting path already has provider-red for exactly this.
  const netDown = { async generate() { const e = new Error('read ENETUNREACH'); throw e; } };
  const { workdir, target, close } = makeWork('worker-transport');
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), { task: TASK, target, close, workdir, capRuns: 2, emit: makeSpine(file), provider: netDown });
  const events = readSpine(file);
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'provider-red', 'the operator is told to retry the provider, not to debug the interpreter');
  assert.match(esc.detail, /ENETUNREACH/, 'the cause still rides');
});

// ---- F14: the worker may not read the RUN'S OWN machinery (first real-model run) ----
// The real run's worker read .bareloop/<spine>.jsonl (its own spine), gate-audit.jsonl
// (the gate's own ledger) and .smoke — the emergent middle reading the arbiter's private
// books. It is an invitation to fit-to-pass and it pollutes the context with the run's
// own bookkeeping. The agent never authors its arbiter — it does not get to read its
// records either. readScope is the workdir, so these must be DENIED explicitly.

test('F14: tool mode denies reads of the run\'s own machinery — gate audit, smoke store, memory store', async () => {
  const wd = twd('tools-books');
  const { outcome, provider } = await run('tools-books', config(), {
    mode: 'tools',
    script: [
      { toolCalls: [tcall('t1', 'shell_read', { path: join(wd, 'gate-audit.jsonl') })] },
      { toolCalls: [tcall('t2', 'shell_read', { path: join(wd, '.litectx') })] },
      { toolCalls: [tcall('t3', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done' },
    ],
  });
  assert.equal(outcome, 'green', 'the denials are feedback, not a stop — the worker pivots to real work');
  assert.match(provider.calls[1], /deny|denied|not allowed|fs\./i, 'the gate refused the audit read');
  assert.match(provider.calls[2], /deny|denied|not allowed|fs\./i, 'and the memory store too');
});

test('F13: the worker is told what the close CURRENTLY says — the tree\'s state is evidence, not an attempt', async () => {
  // The real run asked a model to fix a failing suite while telling it NOTHING about
  // which test failed — and the `run` verb is locked, so it cannot execute the suite
  // itself. It groped through the repo and burned the entire $1.5 cap without ever
  // attempting a write. The precheck had the failure output the whole time; it was
  // withheld because "no attempt exists yet". That confused ATTRIBUTING AN ATTEMPT
  // with EVIDENCE ABOUT THE TREE — which is what a human maintainer reads first.
  const { workdir, target, close } = makeWork('close-state');
  const provider = stubProvider([{ text: GOOD_SUM }]);
  const file = join(workdir, 'run.jsonl');
  await interpret(config(), {
    task: TASK, target, close, workdir, capRuns: 1, emit: makeSpine(file), provider,
    closeState: 'FAIL sum.test.mjs: expected 5, got -1',
  });
  assert.match(provider.calls[0], /expected 5, got -1/, 'the first prompt carries the close\'s current output');
  assert.ok(!/Previous attempt/.test(provider.calls[0]), 'and it is NOT framed as a previous attempt — no attempt has happened');
});

test('F16: the tool persona states the LOOP contract — the worker knows it will be re-run with the close\'s verdict', async () => {
  // the real run's worker read for 12 rounds and never wrote: it behaved like a
  // one-shot because nothing told it otherwise. An attempt that never reaches the
  // close produces no verdict, no gap, and no learning — the loop stops looping.
  const wd = twd('tools-persona');
  const { provider } = await run('tools-persona', config(), {
    mode: 'tools',
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done' },
    ],
  });
  // the persona reaches the provider as the system prompt — assert on the contract, not the wording
  const system = provider.systems?.[0] ?? '';
  assert.match(system, /called again|re-?run|loop/i, 'the worker is told it is one attempt inside a loop');
  assert.match(system, /budget|exhaust/i, 'and that reading exhaustively can burn the run before it ever writes');
});

// ─── worker-round carries the FULL usage breakdown (F18) ────────────────────
// `inputTokens` is the UNCACHED prompt remainder. A round that re-pays for half
// the repo (billed as cache READ) and a round that reads it fresh can carry the
// SAME input+output count at very different cost. A ledger that records only the
// sum cannot tell them apart — and "is re-sent context the cost driver?" is the
// question the whole context-cost investigation turns on.

test('worker-round records the four priced tiers separately — cache reads are not invisible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-'));
  const { workdir, close } = makeSumWork(dir, 'w');
  const provider = stubProvider([
    { text: `\`\`\`js\n${GOOD_SUM}\`\`\``, costUsd: 0.02,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 90_000, cacheCreationTokens: 5_000 } },
  ]);
  const events = [];
  await interpret(validConfig(), {
    task: 'sum', target: join(workdir, 'src/sum.js'), close, workdir, capRuns: 1,
    emit: (type, data) => { events.push({ type, ...data }); return { type, ...data }; },
    provider,
  });
  const round = events.find((e) => e.type === 'worker-round');
  assert.ok(round, 'a worker-round was emitted');
  assert.equal(round.usage.cacheReadTokens, 90_000, 're-sent context is VISIBLE, not folded into a sum');
  assert.equal(round.usage.cacheCreationTokens, 5_000);
  assert.equal(round.usage.inputTokens, 100);
  assert.equal(round.usage.outputTokens, 20);
  assert.equal(round.tokens, 120, 'the legacy sum stays input+output — cache tiers never inflate it');
  assert.equal(round.kind, 'turn', 'a worker turn is tagged as such');
});
