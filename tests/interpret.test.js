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

// The plan call's own prompt says "Plan only, no code" — offering it the write
// tools contradicts that contract: a model that calls shell_write during the
// plan round mutates the tree (and burns budget) before the implement round
// exists. The menu IS the grant (2b): the plan call gets an EMPTY menu.
test('tools mode + plan shape: the plan-only call is offered NO tools; the implement call keeps the grant', async () => {
  const wd = twd('tools-plan');
  const planned = config();
  planned.loop.shape = 'plan';
  const { outcome, provider } = await run('tools-plan', planned, {
    mode: 'tools',
    script: [
      { text: '1. write sum\n2. export it' }, // the plan round: text only
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done — wrote sum.mjs' },
    ],
  });
  assert.equal(outcome, 'green');
  assert.deepEqual(provider.toolsOffered[0], [], 'plan-only call: no tools in the menu');
  assert.ok(provider.toolsOffered[1].includes('shell_write'), 'implement call: the granted menu is intact');
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

test('BA-6: a truncated round (stopReason max_tokens) → provider-red, never scored as an empty attempt', async () => {
  // The real Loop reads stopReason and returns error:'truncated:max_tokens' with the partial
  // text preserved (BA-6/BA-5, bare-agent 0.27.0). Before the fix this laundered into a clean
  // finish with error:null (F25) — an empty attempt indistinguishable from "the worker chose to
  // stop", which may have corrupted every prior sonnet arm. bareloop must escalate it as
  // provider-red (retry), the transport-failure class (F11), NOT interpreter-red (fix the middle)
  // and NOT a silent empty write. The provider is the shell-owned seam, so a scripted max_tokens
  // stopReason is the honest way to drive the real Loop's truncation path.
  const { workdir, target, close } = makeWork('truncated');
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), {
    task: TASK, target, close, workdir, capRuns: 3, emit: makeSpine(file),
    provider: stubProvider([{ text: 'I was thinking about the sum when I got cut o', stopReason: 'max_tokens' }]),
  });
  const events = readSpine(file);
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'provider-red', 'a truncation is a transport-class failure (retry), not a broken middle');
  assert.match(esc.detail, /truncated:max_tokens/, 'the escalation names the real cause');
  assert.ok(!existsSync(target), 'a truncated round writes NOTHING — no empty/partial artifact reaches disk (F25/BA-4 class)');
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

test('revision: revisor rounds are METERED but never spend the WORKER\'s per-attempt bound (advertised == enforced)', async () => {
  // The counter resets once, BEFORE the revisor phase, and revisor turns share
  // the worker's metered handler — so R revisor rounds silently left the worker
  // 40−R, and a revisor burning the whole bound called loop.stop() on the worker
  // loop before its FIRST tool call. The worker is TOLD 40 rounds; it must get 40.
  // Money is the other axis and is unaffected: every revisor round still meters
  // (F12). Same principle the summarizer-fold carve-out already states.
  const wd = twd('rev-bound');
  const cheap = { generate: async () => ({ text: JSON.stringify(config()), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.0001, model: null }) };
  const revisor = async ({ policy, onLlmResult }) => {
    // burn the ENTIRE per-attempt bound inside the revisor
    for (let i = 0; i < 40; i += 1) await onLlmResult({ costUsd: 0.0001, usage: { inputTokens: 1, outputTokens: 1 } });
    const loop = new Loop({ provider: cheap, system: 'revise', policy });
    const r = await loop.run([{ role: 'user', content: 'revise' }]);
    return { candidate: JSON.parse(r.text), costUsd: r.cost ?? null };
  };
  const { events } = await run('rev-bound', config(), {
    mode: 'tools', capRuns: 3, revisor,
    // reds forever: two consecutive reds stall the run, and attempt 3 consults
    // the revisor (the script sticks on its last entry, so every attempt is
    // write-BAD then stop — two worker rounds, nowhere near the 40 bound)
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: BAD_SUM })] },
      { text: 'wrote it' },
    ],
  });
  assert.ok(events.some((e) => e.type === 'stall-detected'), 'the revisor did fire');
  assert.ok(!events.some((e) => e.type === 'attempt-bounded'),
    'the revisor burned 40 rounds — the WORKER must still get its full bound, not zero');
  // money is still metered on the same axis: the revisor's rounds reach the spine
  assert.ok(events.filter((e) => e.type === 'worker-round').length > 40, 'revisor rounds are still metered (F12)');
});

test('revision: an UNPRICED revisor records costUsd null on the spine, never a laundered $0 (F6)', async () => {
  // `?? 0` on the revision events restated an unknown spend as free on the
  // append-only record — the one F6 laundering left in the file. Governance is
  // unaffected (revisor rounds meter through worker-round), but the spine is
  // the permanent record and null is the honest unknown.
  const candidate = config();
  candidate.loop.shape = 'plan';
  const revisor = async () => ({ candidate }); // nothing priced: no costUsd field at all
  const { events } = await run('rev-unpriced', config(), { ...stalling(), revisor, script: [{ text: BAD_SUM }, { text: BAD_SUM }, { text: GOOD_SUM }] });
  const rev = events.find((e) => e.type === 'revision-accepted' || e.type === 'revision-red');
  assert.ok(rev, 'expected a revision event');
  assert.equal(rev.costUsd, null, 'unknown revisor spend is null, not 0');
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

// F20 — THE ATTEMPT MUST END, or ralph never ralphs. bareguard's limits.maxTurns is a
// RUN-wide halt (the Gate is built once per run), so nothing bounded a single attempt: a
// tool-mode attempt ran until the model CHOSE to stop calling tools. A worker that is never
// told it is wrong does not choose to stop — measured on the real job, attempt #1 ran 55
// rounds, ate the entire budget, and the close NEVER RAN (zero verdicts, zero writes).
// The scripted provider clamps to its LAST entry, so a script ending in a tool call IS that
// worker: it reads forever. The fix must cut the attempt, run the close, and loop.
test('F20 tools mode: an attempt that never stops reading is BOUNDED — the close still runs and the loop loops', async () => {
  const wd = twd('tools-unbounded');
  const { events, provider } = await run('tools-unbounded', config(), {
    mode: 'tools', tools: ['read'], capRuns: 2,
    // one entry, clamped forever: the worker reads and reads and never writes, never finishes
    script: [{ toolCalls: [tcall('t1', 'shell_read', { path: join(wd, 'src') })] }],
  });

  const bounded = events.filter((e) => e.type === 'attempt-bounded');
  assert.ok(bounded.length >= 1, 'the runaway attempt was cut off at its bound');
  assert.equal(bounded[0].cap, 40, 'tool mode bounds an attempt at 40 rounds');
  assert.equal(bounded[0].rounds, 40, 'it stopped AT the bound, not past it');

  // The point of bounding: the verdict gets rendered and the loop gets its second attempt.
  const attempts = events.filter((e) => e.type === 'iteration-start');
  assert.ok(attempts.length >= 2, `the close ran and the loop looped (attempts: ${attempts.length}) — an unbounded attempt would spend the whole run inside iteration 1`);

  // and the next attempt is TOLD it was cut off — otherwise it reads its own truncated
  // transcript as a finished one and stops exactly as short next time.
  // (the LAST recorded call is a mid-loop tool result; the note rides the attempt's OPENING prompt)
  assert.ok(provider.calls.some((c) => /CUT OFF after 40 tool rounds/.test(c)), 'the bound is fed back to the worker as evidence, not applied silently');
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

test('F30: worker rounds carry an output budget that fits a whole-file write — the provider default (4096) truncates any real edit', async () => {
  // battery pass 1: three of three rows died to `truncated:max_tokens` (or its
  // downstream close-crash) because the Loop was built with NO maxTokens, so the
  // provider defaulted to 4096 output tokens per round — a whole-file shell_write
  // of create.js/ingest.js cannot fit, the API cuts the round, and doctrine
  // (correctly) reads the cut as provider-red: run over, zero valid rows. The
  // output budget is shell territory; it must be set where the shell runs the loop.
  const seen = { options: null };
  const optCapture = {
    async generate(messages, _tools, options) {
      seen.options = options;
      return { text: 'looked around, nothing to do', toolCalls: [], usage: { inputTokens: 5, outputTokens: 5 }, costUsd: 0.001, model: null };
    },
  };
  const { workdir, target, close } = makeWork('tools-maxtokens');
  const file = join(workdir, 'run.jsonl');
  await interpret(config(), { task: TASK, target, close, workdir, capRuns: 1, emit: makeSpine(file), provider: optCapture, mode: 'tools' });
  assert.ok(seen.options?.maxTokens >= 16384,
    `worker rounds must budget for whole-file writes: maxTokens=${seen.options?.maxTokens ?? 'unset (provider defaults to 4096)'}`);
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

// ─── worker-crash attribution end to end (F32, from battery pass 1 / F31) ───
// Battery pass 1: 4 of 7 rows whole-file-rewrote an orchestrator, broke imports,
// the close crashed under the judged floor, and the run ESCALATED — the worker
// was never told "your edit crashed the suite". The instrument is the gate
// audit's allow-decision writes (run_id-scoped); ralph consumes it only at a
// crashed verdict. Everything here is real except the scripted provider: real
// Gate, real audit file, real node --test close with a real judged floor.

test('F32 end to end: a worker edit that crashes the suite comes back as a worker-crash gap (gate audit is the instrument), and the next attempt recovers', async () => {
  const wd = twd('tools-worker-crash');
  mkdirSync(join(wd, 'src'), { recursive: true });
  const suite = join(wd, 'two.test.mjs');
  // TWO tests, floor 2: a crash-at-load synthesizes ONE failing test (# tests 1),
  // so the floor separates "suite cannot load" from an honest red (# tests 2)
  writeFileSync(suite, `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));
test('adds negatives', () => assert.equal(sum(-2, -3), -5));`);
  writeFileSync(join(wd, 'src', 'sum.mjs'), BAD_SUM); // baseline: the suite RUNS (honest red) before the worker breaks it
  const target = join(wd, 'src', 'sum.mjs');
  const provider = stubProvider([
    // attempt 1: the "big rewrite" that breaks the tree at load
    { toolCalls: [tcall('t1', 'shell_write', { path: target, content: 'not an export;;;\n' })] },
    { text: 'rewrote sum.mjs' },
    // attempt 2: told the suite crashed, the worker repairs its own edit
    { toolCalls: [tcall('t2', 'shell_write', { path: target, content: GOOD_SUM })] },
    { text: 'fixed sum.mjs' },
  ]);
  const file = join(wd, 'run.jsonl');
  const outcome = await interpret(config(), {
    task: TASK, close: ['node', '--test', suite], workdir: wd, capRuns: 3,
    emit: makeSpine(file), provider, mode: 'tools',
    closeJudged: { pattern: '^# tests (\\d+)$', min: 2 },
  });
  const events = readSpine(file);
  assert.equal(outcome, 'green', 'the worker-caused crash was fed back and the next attempt recovered');
  const wc = events.find((e) => e.type === 'worker-crash');
  assert.ok(wc, 'the attribution is a visible spine record');
  assert.ok(wc.files.some((/** @type {string} */ f) => f.endsWith('src/sum.mjs')), 'the gate audit named the worker\'s own write');
  const crashPrompt = provider.calls.find((c) => /CRASHED the test suite/.test(c));
  assert.ok(crashPrompt, 'the worker was TOLD its edit crashed the suite');
  assert.ok(crashPrompt.includes(target), 'and which file it wrote');
  assert.ok(!events.some((e) => e.type === 'escalation'), 'no escalation — the run recovered on its own');
});

// ─── shell_edit consumption (BA-13, bare-agent 0.29.0) ──────────────────────
// The anchored edit verb: changing one line no longer costs a whole-file rewrite
// (battery pass 1: 4 of 5 big-file whole-writes broke the tree — the verb, not
// the transport). Same fence as write: bareguard judges type 'edit' under
// writeScope, and the F32 attribution instrument counts edits as worker writes.

test('BA-13: the worker fixes the file THROUGH the gated edit verb — anchored replace, exact bytes, green', async () => {
  const wd = twd('tools-edit-green');
  const { workdir, target, close } = makeWork('tools-edit-green');
  writeFileSync(target, BAD_SUM); // the file exists; the fix is ONE span, not a rewrite
  const provider = stubProvider([
    { toolCalls: [tcall('t1', 'shell_edit', { path: target, oldText: 'return a - b;', newText: 'return a + b;' })] },
    { text: 'flipped the operator' },
  ]);
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), {
    task: TASK, close, workdir, capRuns: 2, emit: makeSpine(file), provider,
    mode: 'tools', tools: ['read', 'edit'],
  });
  assert.equal(outcome, 'green');
  assert.equal(readFileSync(target, 'utf8'), GOOD_SUM, 'the anchored splice landed verbatim');
  assert.ok(wd === workdir, 'twd/makeWork agree'); // twd is the same deterministic path
});

test('BA-13: an edit OUTSIDE writeScope is denied by the SAME fence as write — nothing lands', async () => {
  const wd = twd('tools-edit-deny');
  const { outcome } = await run('tools-edit-deny', config(), {
    mode: 'tools', tools: ['edit', 'write'],
    script: [
      { toolCalls: [tcall('t1', 'shell_edit', { path: join(wd, 'escape.txt'), oldText: 'x', newText: 'y' })] },
      { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: GOOD_SUM })] },
      { text: 'done' },
    ],
  });
  assert.equal(outcome, 'green', 'the denied edit fed back mid-attempt and the run recovered');
  assert.ok(!existsSync(join(wd, 'escape.txt')), 'the out-of-scope path was never touched');
  // the deny must be REAL (a fence decision), not vacuous (an ungranted tool):
  // the gate audit carries an edit action denied by fs.writeScope
  const audit = readFileSync(join(wd, 'gate-audit.jsonl'), 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  const denied = audit.find((r) => r.phase === 'gate' && r.action?.type === 'edit' && r.decision === 'deny');
  assert.ok(denied, 'the edit reached the gate as type "edit" and was denied there — the same fence as write');
});

test('BA-13 × F32: a crash caused through shell_edit is ATTRIBUTED — the instrument sees edit actions, not only writes', async () => {
  const wd = twd('tools-edit-crash');
  mkdirSync(join(wd, 'src'), { recursive: true });
  const suite = join(wd, 'two.test.mjs');
  writeFileSync(suite, `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));
test('adds negatives', () => assert.equal(sum(-2, -3), -5));`);
  const target = join(wd, 'src', 'sum.mjs');
  writeFileSync(target, BAD_SUM); // baseline: the suite runs (honest red)
  const provider = stubProvider([
    // attempt 1: a one-span edit that breaks the file at load
    { toolCalls: [tcall('t1', 'shell_edit', { path: target, oldText: 'return a - b;', newText: 'return a -;;- b;' })] },
    { text: 'edited sum.mjs' },
    // attempt 2: told the suite crashed, repairs its own edit
    { toolCalls: [tcall('t2', 'shell_edit', { path: target, oldText: 'return a -;;- b;', newText: 'return a + b;' })] },
    { text: 'repaired the edit' },
  ]);
  const file = join(wd, 'run.jsonl');
  const outcome = await interpret(config(), {
    task: TASK, close: ['node', '--test', suite], workdir: wd, capRuns: 3,
    emit: makeSpine(file), provider, mode: 'tools', tools: ['read', 'edit'],
    closeJudged: { pattern: '^# tests (\\d+)$', min: 2 },
  });
  const events = readSpine(file);
  assert.equal(outcome, 'green', 'the edit-caused crash was fed back and repaired');
  const wc = events.find((e) => e.type === 'worker-crash');
  assert.ok(wc, 'the edit action was visible to the attribution instrument');
  assert.ok(wc.files.some((/** @type {string} */ f) => f.endsWith('src/sum.mjs')));
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

// ---- Layer R: the root (within-run ratchet, design record 2026-07-19) ----
// Shell-assembled fixation detection wired through the middle: consecutive
// attempts rewriting the same file without moving the reds get an escalating
// summary→verbatim note in the next prompt. Everything real except the
// scripted provider; the close is a real `node --test` (TAP: `not ok` lines
// are byte-stable, unlike the spec reporter's duration-stamped ✖ lines).

test('Layer R tools mode: fixation → summary at attempt 3, verbatim at attempt 4; events carry no content', async () => {
  const wd = twd('root-fixation');
  const w = () => ({ toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: BAD_SUM })] });
  const { outcome, events, provider } = await run('root-fixation', config(), {
    mode: 'tools', capRuns: 4, closeGapKeep: '^not ok ',
    script: [w(), { text: 'done' }, w(), { text: 'done' }, w(), { text: 'done' }, w(), { text: 'done' }],
  });
  assert.equal(outcome, 'escalated', 'still red at cap — the ratchet informs, never judges');
  // attempts are fresh conversations: calls 0-1 attempt 1, 2-3 attempt 2, …
  assert.ok(!provider.calls[2].includes('RATCHET'), 'attempt 2: one data point, no ratchet');
  assert.match(provider.calls[4], /RATCHET: you are repeating yourself/, 'attempt 3 gets the summary');
  assert.match(provider.calls[4], /sum\.mjs/, 'the summary names the repeated file');
  assert.ok(!provider.calls[4].includes('return a - b'), 'summary stage carries no verbatim content');
  assert.match(provider.calls[6], /STRUCTURALLY DIFFERENT/, 'attempt 4 escalates to verbatim');
  assert.ok(provider.calls[6].includes('return a - b'), 'verbatim surfaces the worker\'s own failed content');
  const inj = events.filter((e) => e.type === 'root-injected');
  assert.deepEqual(inj.map((e) => e.stage), ['summary', 'verbatim'], 'both stages on the spine, in order');
  assert.equal(inj[0].mode, 'reds+writes', 'the detector mode is named');
  assert.ok(!JSON.stringify(inj).includes('return a - b'), 'spine events never carry content');
});

test('Layer R OFF arm: layerRoot false → no injection, no events (the acceptance battery control)', async () => {
  const wd = twd('root-off');
  const w = () => ({ toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: BAD_SUM })] });
  const { events, provider } = await run('root-off', config(), {
    mode: 'tools', capRuns: 4, closeGapKeep: '^not ok ', layerRoot: false,
    script: [w(), { text: 'done' }, w(), { text: 'done' }, w(), { text: 'done' }, w(), { text: 'done' }],
  });
  assert.ok(provider.calls.every((c) => !c.includes('RATCHET')), 'no ratchet note in any prompt');
  assert.ok(!events.some((e) => e.type === 'root-injected'), 'no root events on the spine');
});

test('Layer R text mode: the one-target rewrite loop is the same fixation, teed at the write site', async () => {
  const { events, provider } = await run('root-text', config(), {
    capRuns: 3, closeGapKeep: '^not ok ',
    script: [{ text: BAD_SUM }, { text: BAD_SUM }, { text: BAD_SUM }],
  });
  assert.match(provider.calls[2], /RATCHET: you are repeating yourself/, 'attempt 3 gets the summary');
  assert.equal(events.find((e) => e.type === 'root-injected').stage, 'summary');
});

test('Layer R stays inert on progress: a red that moves to green never sees the ratchet', async () => {
  const { outcome, events, provider } = await run('root-inert', config(), {
    capRuns: 3, closeGapKeep: '^not ok ',
    script: [{ text: BAD_SUM }, { text: GOOD_SUM }],
  });
  assert.equal(outcome, 'green');
  assert.ok(provider.calls.every((c) => !c.includes('RATCHET')), 'cost-neutral when not stuck (RSI §3.3)');
  assert.ok(!events.some((e) => e.type === 'root-injected'));
});

// Finding 4 (Layer R × BA-13): the tee decides write-class by toolAction's action
// TYPE, not by a hardcoded tool-name list (a third enumeration of write verbs that
// a future granted verb would silently bypass). Driven through shell_edit — an
// idempotent anchored edit (newText === oldText) lands every attempt AND keeps its
// anchor matchable, so the same file is re-written with the same failing content →
// fixation. The verbatim note surfaces the edit's content only if the tee KEY
// (act.path) matches the gate-audit path the overlap is read from — i.e. only if
// the tee provably flows through the same toolAction resolution as the audit.
test('Finding 4: a shell_edit fixation is teed via toolAction (action type, not tool name) — newText surfaces verbatim', async () => {
  const { workdir, target, close } = makeWork('root-edit-fixation');
  writeFileSync(target, BAD_SUM); // the file exists; each attempt re-applies the SAME anchored edit
  const e = () => ({ toolCalls: [tcall('t1', 'shell_edit', { path: target, oldText: 'return a - b;', newText: 'return a - b;' })] });
  const provider = stubProvider([e(), { text: 'done' }, e(), { text: 'done' }, e(), { text: 'done' }, e(), { text: 'done' }]);
  const file = join(workdir, 'run.jsonl');
  const outcome = await interpret(config(), {
    task: TASK, target, close, workdir, capRuns: 4,
    emit: makeSpine(file), provider, mode: 'tools', tools: ['read', 'edit'], closeGapKeep: '^not ok ',
  });
  const events = readSpine(file);
  assert.equal(outcome, 'escalated', 'still red at cap — the ratchet informs, never judges');
  assert.match(provider.calls[4], /RATCHET: you are repeating yourself/, 'attempt 3 gets the summary');
  assert.match(provider.calls[6], /STRUCTURALLY DIFFERENT/, 'attempt 4 escalates to verbatim');
  assert.ok(provider.calls[6].includes('return a - b'),
    'the edit content (newText) is teed and surfaced — the tee key matched the audit path, so it flowed through toolAction');
  const inj = events.filter((ev) => ev.type === 'root-injected');
  assert.deepEqual(inj.map((x) => x.stage), ['summary', 'verbatim'], 'both stages on the spine, in order');
});

// Finding 6 (2026-07-20): the tool-mode tee ran inside the actionTranslator,
// which wireGate calls BEFORE gate.check settles — so a write the gate went on
// to REJECT was captured all the same, and (last-write-wins per path) could
// end the attempt sitting on a path the audit legitimately lists as allowed.
// The capture is now two-phase: stage in the translator, commit only when the
// policy returns true, discard on deny AND on halt. These two pin the wiring
// end-to-end: the commit must not be lost when a deny shares the round, and the
// discard must never swallow the HaltError that cap-halt routing depends on.

test('Finding 6: a denied write in the same round never costs the ALLOWED write its teed content', async () => {
  const wd = twd('root-deny-round');
  const round = () => ({
    toolCalls: [
      // denied: outside the config writeScope — staged, then discarded
      tcall('t1', 'shell_write', { path: join(wd, 'outside', 'evil.mjs'), content: 'REJECTED BY THE FENCE' }),
      // allowed: lands, and is the fixation the ratchet reads
      tcall('t2', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: BAD_SUM }),
    ],
  });
  const { events, provider } = await run('root-deny-round', config(), {
    mode: 'tools', capRuns: 4, closeGapKeep: '^not ok ',
    script: [round(), { text: 'done' }, round(), { text: 'done' }, round(), { text: 'done' }, round(), { text: 'done' }],
  });
  assert.match(provider.calls[6], /STRUCTURALLY DIFFERENT/, 'attempt 4 escalates to verbatim');
  assert.ok(provider.calls[6].includes('return a - b'), 'the ALLOWED write\'s content survived the denied sibling');
  assert.ok(provider.calls.every((c) => !c.includes('REJECTED BY THE FENCE')),
    'the denied write never reaches the worker as something that "landed"');
  assert.ok(!existsSync(join(wd, 'outside', 'evil.mjs')), 'and it never reached the tree');
  assert.ok(!JSON.stringify(events).includes('REJECTED BY THE FENCE'), 'nor the spine');
});

test('Finding 6: a HALT on a staged write still propagates as cap-halt (discard never swallows it)', async () => {
  const wd = twd('root-halt-write');
  const tiny = config();
  tiny.gate.budgetUsd = 0.02;
  const { outcome, events } = await run('root-halt-write', tiny, {
    mode: 'tools', capRuns: 4, closeGapKeep: '^not ok ',
    script: [
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'src', 'sum.mjs'), content: BAD_SUM })], costUsd: 0.05 },
      { text: 'done' },
    ],
  });
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'cap-halt', 'the halt reached ralph as a cap story, not a swallowed deny');
  assert.ok(events.some((e) => e.type === 'cap-halt'), 'cap-halt event on the spine');
  assert.ok(!existsSync(join(wd, 'src', 'sum.mjs')), 'the halted write never landed');
});
