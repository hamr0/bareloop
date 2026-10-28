// Layer 2 module 4b — the plan executor — the core cycle: scout → plan → step → close, the prompt contract, metering, scrubbing, Layer R, native clipipe, scout summary, wall-clock record and planner materials.
// Split from the former tests/planrun.test.js (hamr 2026-10-11) for parallel runs; tests moved
// verbatim. Shared fixtures: tests/planrun-fixtures.js. Original header: integration-grade — real
// bare-agent Loop, real Gate, real spawned checks and closes, scripted provider (the one legitimate seam).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { EXIT_EXAMPLE } from '../src/plan.js';
import { validateJob } from '../src/job.js';
import { StallError, MAX_STALLS } from '../src/stall.js';
import { scriptedProvider, scriptedNativeFactory } from './helpers.js';
import { scanSecrets } from '../src/validate.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { tcall, makePatient, JOB, PLAN, collector, go, fakeClock, stepIterations } from './planrun-fixtures.js';

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


// ── SCOUT OFF (docs/product/SCOUT-CONTRAST.md) — the operator-only switch:
// `scout:false` on a FRESH run skips the survey with a named record rather
// than silence, and leaves everything else byte-identical to today's ON run.

test('scout:false, fresh run: no scout-start/scout-result, exactly one scout-skipped operator-off, and the plan still greens', async (t) => {
  const wd = makePatient(t);
  // one fewer entry than the happy path: the scout call is gone, so the
  // FIRST call the provider sees is the plan draft
  const provider = scriptedProvider([
    { text: PLAN(wd) },                                                            // plan draft
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },                                            // attempt summary
  ]);
  const { outcome, events } = await go(wd, provider, { scout: false });
  assert.equal(outcome, 'green');
  assert.ok(!events.some((e) => e.type === 'scout-start'), 'the scout never starts');
  assert.ok(!events.some((e) => e.type === 'scout-result'), 'the scout never reports a result');
  assert.ok(!events.some((e) => e.type === 'scout-empty'), 'the empty-scout record is scout territory, not the off-switch');
  const skips = events.filter((e) => e.type === 'scout-skipped');
  assert.equal(skips.length, 1, 'exactly one scout-skipped record');
  assert.equal(skips[0].reason, 'operator-off');
  assert.equal(typeof skips[0].meaning, 'string');
  assert.ok(provider.calls[0].includes('(no scout notes)') || !provider.calls[0].includes('scout notes'), 'the planner drafts from the empty-blob prompt');
  const exec = events.find((e) => e.type === 'plan-executed');
  assert.deepEqual(exec.steps.map((s) => s.outcome), ['green']);
});


test('scout:false + resumeSeed: the resume skip wins its own reason — never operator-off', async (t) => {
  const wd = makePatient(t);
  const plan = PLAN(wd);
  const planObj = JSON.parse(plan);
  const provider = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    scout: false,
    resumeSeed: { phase: 'steps', plan: planObj, completedSteps: [] },
  });
  assert.equal(outcome, 'green');
  const skips = events.filter((e) => e.type === 'scout-skipped');
  assert.equal(skips.length, 1, 'exactly one scout-skipped record');
  assert.equal(skips[0].reason, 'resumed', 'the resume skip fires first and wins its own reason');
  assert.notEqual(skips[0].reason, 'operator-off');
});


test('scout: a non-boolean throws a TypeError before any provider call', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'never' }]);
  await assert.rejects(
    () => go(wd, provider, { scout: /** @type {any} */ ('off') }),
    TypeError,
  );
  assert.equal(provider.calls.length, 0, 'not one provider call');
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


test('plan reds are scrubbed at the validation boundary: a parse error quotes the DRAFT\'S OWN BYTES, and the spine is append-only', async (t) => {
  // The same V8-quoting class judge() already scrubs for `json-valid`: JSON.parse's
  // message embeds a window of the source it choked on (a body of 20 chars or fewer
  // is quoted whole), so a `parse-error` detail can carry bytes the MODEL wrote —
  // onto plan-validate, onto plan-red, and back into the redraft prompt. ONE
  // inventory (SECRET_PATTERNS), the same `scrub` the close output rides through.
  const wd = makePatient(t);
  // 15 chars, so V8 quotes it whole; a `xoxb-` shape specifically, because it is
  // NOT one of bareguard's built-in default patterns — a green here proves THIS
  // repo's inventory is wired and not that the redactor caught an `sk-` by itself.
  const TOKEN = 'xoxb-abcdefghij';
  const provider = scriptedProvider([{ text: 'scout notes' }, { text: TOKEN }, { text: TOKEN }]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'plan-red');

  const reds = events.filter((e) => e.type === 'plan-red');
  assert.equal(reds.length, 1);
  assert.equal(reds[0].code, 'parse-error');
  // the leak CHANNEL is real, not hypothetical: the detail really is V8's quoted window
  assert.match(reds[0].detail, /is not valid JSON/, 'the detail is the parser\'s own message, which quotes the draft');
  assert.match(reds[0].detail, /\[REDACTED:/, 'and the quoted draft bytes are masked, not dropped');

  for (const e of [...reds, ...events.filter((x) => x.type === 'plan-validate').flatMap((x) => x.reds ?? [])]) {
    assert.deepEqual(scanSecrets(JSON.stringify(e)), [], `a plan red carried a live token onto the spine: ${JSON.stringify(e)}`);
  }
  assert.deepEqual(scanSecrets(provider.calls[2]), [], 'and the redraft prompt does not hand the draft\'s own secret back to the model');
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


test('F66: the replan brief for a STALL says the model stopped producing rounds — never "its exits were still red", which never happened', async (t) => {
  const wd = makePatient(t);
  // The brief is the one channel the redrafting planner adapts to. A stall never
  // reached its exits at all (the watchdog gave up on the call), so handing it
  // the exhaustion sentence is a wrong diagnosis given to the only component
  // whose job is to respond to it — the F28 class, on the replan side.
  const base = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'unreachable — the step call stalls' },
    // the replan draft, then the fresh plan's step
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] }]) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  /** @type {string[]} */
  const prompts = [];
  let n = 0;
  const provider = {
    calls: base.calls,
    async generate(/** @type {any} */ messages, /** @type {any} */ tools) {
      prompts.push(String(messages.at(-1)?.content ?? ''));
      // the STEP worker's call: the watchdog reissued MAX_STALLS times and gave
      // up — the same StallError object the real watch rejects with, so ralph
      // reads the same typed category it would in production
      if (n++ === 2) throw new StallError('no round completed for 300s, 3 times in this step — not reissuing again', MAX_STALLS);
      return base.generate(messages, tools);
    },
  };
  const { events } = await go(wd, provider);

  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, `a stall past the ceiling must REPLAN, not stop — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(replan.trigger, 'step-stalled');
  const brief = prompts.find((p) => p.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  assert.match(brief, /stopped producing rounds/, 'the brief names what actually happened');
  assert.doesNotMatch(brief, /exits were still red/, 'a stall never judged its exits — claiming they reddened is a false diagnosis handed to the planner');
  assert.doesNotMatch(brief, /attempts and its exits/, 'and it did not run out of attempts either');
});


test('a mid-step provider-red is a CASUALTY, not a step-red: runPlan returns provider-red so the outcome and the escalation agree (F11/F44)', async (t) => {
  const wd = makePatient(t);
  // scout + a valid plan, then the STEP worker's provider throws a transport
  // error (category provider-red) — a casualty, never a capability failure. It
  // must NOT be laundered into step-red (the outcome the driver reads as tier data).
  const base = scriptedProvider([{ text: 'scout notes' }, { text: PLAN(wd) }]);
  let n = 0;
  const provider = {
    calls: base.calls,
    async generate(/** @type {any} */ messages, /** @type {any} */ tools) {
      if (n++ >= 2) { const e = /** @type {any} */ (new Error('ECONNRESET mid-step')); e.category = 'provider-red'; e.lib = 'bare-agent'; throw e; }
      return base.generate(messages, tools);
    },
  };
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red', 'a transport throw during a step is a provider-red casualty, never step-red');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red', 'the returned outcome and the spine escalation name the SAME category (F11)');
});


test('preflight: a close STAGE that cannot RUN escalates broken-close before any tokens — an unrunnable ruler would fault mid-plan after real spend', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'never reached' }]);
  // stage 1 runs and reds honestly (so the PRECHECK passes it through as a
  // normal red); stage 2 cannot run at all. Only the preflight can catch that —
  // the precheck stops at the first red and never reaches it.
  const job = JOB(wd, { close: [
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'ghost', cmd: 'no-such-binary --x', expect: 0 },
  ] });
  const { outcome, events } = await go(wd, provider, { job });
  assert.equal(outcome, 'check-red');
  assert.equal(provider.calls.length, 0, 'no tokens were spent');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'broken-close');
  assert.match(esc.detail ?? '', /ghost/);
});


test('an already-green close at precheck ends the run as the DISTINCT already-green, zero tokens (F17)', async (t) => {
  const wd = makePatient(t, { closeGreen: true });
  const provider = scriptedProvider([{ text: 'never reached' }]);
  // every stage green is what already-green MEANS: a close is satisfied only
  // when the whole list is, so this job's one stage is the green one
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { close: [{ name: 'verdict', cmd: 'node close.mjs', expect: 0 }] }) });
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


test('a worker-round carries the round\'s own stopReason, forwarded verbatim from the provider (PRD item 28, BA-13)', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })], stopReason: 'tool_use' },
    { text: 'done', stopReason: 'end_turn' },
  ]);
  const { events } = await go(wd, provider);
  const rounds = events.filter((e) => e.type === 'worker-round');
  assert.ok(rounds.length >= 4, `expected metered rounds, got ${rounds.length}`);
  assert.ok(rounds.some((r) => r.stopReason === 'tool_use'), `expected a tool_use round, got ${JSON.stringify(rounds.map((r) => r.stopReason))}`);
  assert.ok(rounds.some((r) => r.stopReason === 'end_turn'), `expected an end_turn round, got ${JSON.stringify(rounds.map((r) => r.stopReason))}`);
});


test('a worker-round\'s stopReason is null, never omitted, when the provider payload said nothing (pre-BA-13 / a non-string value) — the same honesty rule rateSource already follows', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { events } = await go(wd, provider);
  const rounds = events.filter((e) => e.type === 'worker-round');
  assert.ok(rounds.length >= 4);
  for (const r of rounds) {
    assert.ok('stopReason' in r, 'the field is never omitted');
    assert.equal(r.stopReason, null);
  }
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


test('L3: a ctx verb\'s spine event is SCRUBBED at the wiring — a model-authored recall query never lands a secret in the append-only log', async (t) => {
  // The hard line: secrets never enter the spine (a log that captures a key
  // captures it forever), and ONE inventory (SECRET_PATTERNS) governs detection
  // and redaction alike. Every ctx-tool field is model-CHOSEN text — the query
  // here, but equally a stash id, a symbol, a path the worker spelled — so the
  // scrub belongs on the emitter the tools are constructed with, not on any one
  // call site. Driven through the REAL wiring (runPlan builds the litectx and
  // the emitter itself); the key is synthetic and matches SECRET_PATTERNS.
  const wd = makePatient(t);
  const KEY = 'sk-ant-A1b2C3d4E5f6G7h8';
  const job = JOB(wd, { tools: ['read', 'write', 'recall'] });
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Find the module, then write tests/test_x.mjs.',
      tools: ['recall', 'write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty.' },                          // scout
    { text: plan },                                                               // plan draft
    { toolCalls: [tcall('t1', 'ctx_recall', { query: `stopword ${KEY} filter` })] },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const { events } = await go(wd, provider, { job });
  const ev = events.find((e) => e.type === 'ctx-tool' && e.tool === 'ctx_recall');
  assert.ok(ev, 'the recall really ran through the real wiring — no ctx-tool event and this test proves nothing');
  assert.doesNotMatch(JSON.stringify(ev), new RegExp(KEY), 'the literal key must not survive anywhere in the event');
  assert.match(ev.query, /\[REDACTED:/, 'the query rides the spine masked, and still says a secret was there');
  assert.match(ev.query, /stopword/, 'only the token is masked — the rest of the query stays readable, or the record is useless');
});


test('the GATE AUDIT is scrubbed too: a token in a worker\'s raw tool args never lands in the in-tree audit log', async (t) => {
  // Third channel into a persistent, append-only record — and the one that was
  // open. The spine and the ctx-verb wiring are scrubbed with SECRET_PATTERNS,
  // but the Gate was constructed with no `secrets` config, so `gate-audit.jsonl`
  // (in the WORKDIR, surviving the run) kept bareguard's default-on backstop
  // only — which covers `apiKey`/`authorization`/`Bearer …`/`sk-…` and NOT the
  // rest of our inventory.
  //
  // The channel is the MODEL-AUTHORED IDENTIFIER, not file content: `toolAction`
  // deliberately reduces a write to `{bytes}`, so content never reaches the gate
  // at all — but an isolate verb's `id` (and any path the worker spells) rides
  // onto the action verbatim. Measured on the real gate: `ctx_remember` /
  // `ctx_stash` / `ctx_forget` ids and a `shell_read` path each landed a `ghp_`
  // token in cleartext with no `secrets` config, and all masked with
  // SECRET_PATTERNS. ONE inventory governs every redaction boundary, so the gate
  // gets the same patterns. Driven through the REAL wiring — runPlan builds the Gate.
  const wd = makePatient(t);
  // Matches SECRET_PATTERNS but NOT bareguard's default-on set (apiKey / Bearer /
  // sk-), so this fails while the gate carries defaults only. The token stands
  // ALONE: SECRET_PATTERNS anchors on `(?<![A-Za-z0-9_-])`, so a `note-<token>`
  // spelling matches neither the inventory nor the gate and would prove nothing.
  const KEY = `ghp_${'A1b2C3d4E5f6G7h8I9j0'}`;
  const job = JOB(wd, { tools: ['read', 'write', 'remember'] });
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write tests/test_x.mjs, then record what you concluded.',
      tools: ['remember', 'write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty.' },                          // scout
    { text: plan },                                                               // plan draft
    { toolCalls: [tcall('t1', 'ctx_remember', { id: KEY, text: 'the module exports x' })] },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  await go(wd, provider, { job });
  const audit = readFileSync(join(wd, 'gate-audit.jsonl'), 'utf8');
  assert.match(audit, /ctx_remember/, 'the isolate verb really reached the gate — no audited action and this test proves nothing');
  assert.doesNotMatch(audit, new RegExp(KEY), 'the literal token must not survive in the in-tree audit log');
  assert.deepEqual(scanSecrets(audit), [], 'the whole audit is clean under the ONE inventory');
});


test('an EXIT DETAIL is scrubbed before it reaches the spine — json-valid quotes the file\'s own bytes back in V8\'s parse message', async (t) => {
  // The same hard line as the ctx-verb wiring above, on the other channel into the
  // append-only log. `json-valid` embeds `JSON.parse`'s message, and V8 quotes a
  // window of the SOURCE in it (a source of 20 chars or fewer is quoted whole:
  // measured, `JSON.parse('[xoxb-AAAAAAAAAA]')` → "Unexpected token 'x',
  // "[xoxb-AAAAAAAAAA]" is not valid JSON"). So an exit detail is not the
  // names-and-counts text the evaluator's own doctrine promises — it can carry
  // FILE BYTES, and the worker chose those bytes. ONE inventory (SECRET_PATTERNS)
  // scrubs it, at the emission boundary, so every downstream reader of the same
  // results (the exit-eval record, the escalation detail, the worker gap) is
  // covered by construction rather than by three remembered call sites.
  const wd = makePatient(t);
  const KEY = 'xoxb-AAAAAAAAAA';
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'emit-report', action: 'Write tests/report.json.',
      tools: ['write'], rounds: 4, target: 'tests/report.json',
      exit: [{ type: 'json-valid', path: 'tests/report.json' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: plan },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'report.json'), content: `[${KEY}]` })] },
    { text: 'wrote the report' },
  ]);
  const { events } = await go(wd, provider, { capRuns: 1 });
  const ev = events.find((e) => e.type === 'exit-eval');
  assert.ok(ev, 'the json-valid exit really ran — no exit-eval and this test proves nothing');
  const detail = ev.results[0].detail;
  assert.match(detail, /is not valid JSON/, 'the parse message really did ride into the detail (the leak channel is live)');
  assert.doesNotMatch(JSON.stringify(ev), new RegExp(KEY), 'the literal token must not survive anywhere in the spine record');
  assert.match(detail, /\[REDACTED:/, 'masked, and the record still says a secret was there');
  assert.match(detail, /tests\/report\.json/, 'only the token is masked — the mechanical gap (which file, which wall) stays readable');
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
  // Throw at the STEP worker's construction, and target it by the RUN'S OWN STATE
  // (the plan has been accepted) rather than by counting wallet reads. A call-count
  // trigger measures "how many times has remainingUsd been called", which is not the
  // same question as "are we past drafting" — it silently retargets whenever the
  // number of reads changes, and it did (T's materials block added one per draft).
  // ralph catches middle throws, so with the plan accepted this catch is reachable
  // only by a setup fault.
  let planAccepted = false;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data) => {
    if (type === 'plan-accepted') planAccepted = true;
    return emit(type, data);
  };
  const remainingUsd = () => { if (planAccepted) throw new Error('boom: cannot size the wallet'); return 1.5; };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd });
  const exec = events.find((e) => e.type === 'plan-executed');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.ok(exec, 'plan-executed is on the spine — the record never dangles');
  assert.equal(exec.steps.at(-1).outcome, esc.category, 'the recorded step outcome MATCHES the escalation category (no contradiction)');
  assert.equal(esc.category, 'interpreter-red', 'an uncategorized setup throw is interpreter-red (infra), not provider-red');
  assert.equal(outcome, 'interpreter-red');
});


// ── Layer R (the within-run ratchet, src/root.js) wired into the plan flow.
// A fixation script: the worker rewrites its ONE target with non-'ok' content
// twice (same file, same failing check ⇒ identical red-set), then converts on
// attempt 3. The detector must fire the SUMMARY stage at the start of attempt 3
// (comparing attempts 1 and 2), inject its note, and stay OFF by default.
// NOTE: content must not contain the substring 'ok' (the check greens on it) —
// and 'broken' does, so the stubs read 'placeholder N'.
const fixationScript = (wd) => scriptedProvider([
  { text: 'src/mod.mjs exports x; tests/ is empty.' },                              // scout
  { text: PLAN(wd) },                                                               // plan draft
  { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'placeholder 1 — no assertion yet\n' })] },
  { text: 'attempt 1' },
  { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'placeholder 2 — still no assertion\n' })] },
  { text: 'attempt 2' },
  { toolCalls: [tcall('t3', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x now\n' })] },
  { text: 'attempt 3 fixed it' },
]);


test('Layer R ON: a worker that rewrites the same file with an unmoved red-set fires the SUMMARY ratchet, injected into the next attempt', async (t) => {
  const wd = makePatient(t);
  const { outcome, events } = await go(wd, fixationScript(wd), { layerRoot: true });
  const inj = events.filter((e) => e.type === 'root-injected');
  assert.ok(inj.length >= 1, 'the ratchet fired at least once');
  assert.equal(inj[0].stage, 'summary', 'first fire is the capped summary (streak 1)');
  assert.equal(inj[0].step, 'write-test', 'the event names its step');
  assert.equal(outcome, 'green', 'the ratchet does not break convergence — attempt 3 still greens');
});


test('Layer R ON: the ratchet note is injected into the third attempt\'s prompt (the worker actually sees it)', async (t) => {
  const wd = makePatient(t);
  const provider = fixationScript(wd);
  await go(wd, provider, { layerRoot: true });
  // provider.calls: [scout, plan, a1-turn1, a1-turn2, a2-turn1, a2-turn2, a3-turn1, ...]
  // the attempt-3 opening prompt is the one carrying the ratchet note
  assert.ok(provider.calls.some((p) => typeof p === 'string' && p.includes('RATCHET')),
    'the worker was told, in-prompt, that it is repeating itself');
});


// ⚠ OPEN POINT FOR hamr — a COLLISION between two shipped mechanisms, recorded
// here rather than resolved unilaterally (it is arbiter/experiment territory).
//
// Layer R's escalation needs THREE consecutive fixated attempts: streak 1 injects
// the summary note at iteration 3, streak 2 injects the VERBATIM note at iteration
// 4. But fixation is, by its own definition, a byte-identical red-set — which is
// exactly what the step ladder calls a repeat. So a fixated step strikes at
// iteration 2 and strikes out at iteration 3, and iteration 4 never opens.
//
// Net effect: with `layerRoot: true`, the VERBATIM stage is now unreachable in the
// STEP loop. It remains reachable in the close-fix loop (still bounded by a count,
// capRuns), and the stage itself keeps full unit coverage in tests/root.test.js.
// Three ways out, none of them this build's to pick: accept summary-only on the
// step path; raise STRIKE_LIMIT (2 is hamr's number); or exempt the iteration in
// which the ratchet just spoke from striking. Layer R ships OFF by default (F41)
// and its ON arm's acceptance read has never been run, so nothing shipped is
// broken today — but that read would now measure a different Layer R than the one
// designed, and that is the part hamr has to decide.
//
// This test asserts what the two mechanisms ACTUALLY do together now.
test('Layer R ON + the step ladder: the ratchet reaches SUMMARY and the ladder ends the step first — VERBATIM is unreachable on the step path (open point above)', async (t) => {
  const wd = makePatient(t);
  // four attempts scripted: three non-'ok' rewrites of the one target (fixation
  // each comparison), then the fix. Under the OLD fixed count the run reached
  // attempt 4 and greened; under the ladder the byte-identical gap strikes twice.
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'placeholder 1\n' })] }, { text: 'a1' },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'placeholder 2\n' })] }, { text: 'a2' },
    { toolCalls: [tcall('t3', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'SENTINEL placeholder 3\n' })] }, { text: 'a3' },
    { toolCalls: [tcall('t4', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — fixed\n' })] }, { text: 'a4' },
  ]);
  const { events } = await go(wd, provider, { layerRoot: true, capRuns: 4 });

  const stages = events.filter((e) => e.type === 'root-injected' && e.step).map((e) => e.stage);
  assert.deepEqual(stages, ['summary'], 'the ratchet fires once and never escalates: the ladder ends the step at iteration 3');
  const reads = events.filter((e) => e.type === 'ladder').slice(0, 3);
  assert.deepEqual(reads.map((e) => e.strike), [false, true, true],
    'and it is the REPEAT that struck — the worker wrote a different file body every attempt');
  assert.deepEqual(reads.map((e) => e.wrote), [true, true, true], 'writes were never the reason');
  assert.equal(stepIterations(events).length, 3, 'attempt 4 — the one that would have carried VERBATIM, and the one that greened — never opened');
});


test('Layer R OFF (default): the SAME fixation script emits NO root-injected — armed only when asked', async (t) => {
  const wd = makePatient(t);
  const provider = fixationScript(wd);
  const { outcome, events } = await go(wd, provider); // layerRoot defaults false
  assert.equal(events.filter((e) => e.type === 'root-injected').length, 0, 'inert by default');
  assert.ok(!provider.calls.some((p) => typeof p === 'string' && p.includes('RATCHET')), 'no note reaches the worker');
  assert.equal(outcome, 'green');
});


test('Layer R ON: the outer close-fix loop ALSO ratchets — the red-set is the FAILING STAGE\'s, not the first stage that happens to carry a gapKeep', async (t) => {
  const wd = makePatient(t);
  // Stage 1 (`clean-run`) greens on "ok", so the step greens and the close walks
  // on; stage 2 (`verdict`) additionally wants a DONE marker, so IT renders the
  // verdict and the fix loop runs. The two stages carry DIFFERENT gapKeeps and
  // stage 1's pattern matches NOTHING in stage 2's output — so a detector reading
  // "the first stage carrying a gapKeep" sees an empty kept-set, degrades to
  // writes-only, and cannot make the strong claim. Reading the failing stage's
  // own pattern keeps the reds+writes mode, which is what this asserts.
  writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('DONE')) process.exit(0);
console.log('BAR verdict: the test is missing the DONE marker'); process.exit(1);\n`);
  const job = JOB(wd, { close: [
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^BAR' },
  ] });
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] }, { text: 'step done' },
    // fix loop: two rewrites still missing DONE (fixation), then the fix
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok stub 1\n' })] }, { text: 'f1' },
    { toolCalls: [tcall('t3', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok stub 2\n' })] }, { text: 'f2' },
    { toolCalls: [tcall('t4', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok DONE\n' })] }, { text: 'f3' },
  ]);
  const { outcome, events } = await go(wd, provider, { job, layerRoot: true });
  const inj = events.filter((e) => e.type === 'root-injected');
  const fixInj = inj.find((e) => e.phase === 'fix' && e.stage === 'summary');
  assert.ok(fixInj, `the fix loop ratchets under fixation; got ${JSON.stringify(inj)}`);
  assert.equal(fixInj.redStage, 'verdict', 'the red-set came from the stage that rendered the verdict');
  assert.equal(fixInj.mode, 'reds+writes', 'and it was READABLE — the failing stage\'s own pattern, not another stage\'s');
  assert.ok(provider.calls.some((p) => typeof p === 'string' && p.includes('RATCHET')), 'the note reached the fix worker');
  assert.equal(outcome, 'green');
});


test('Layer R + NATIVE (clipipe): excluded — the native worker has no onToolResult seam, so the ratchet stays inert even under fixation', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'scout' }] },
    { turns: [{ text: PLAN(wd) }] },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'placeholder 1\n' } }, { text: 'a1' }] },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'placeholder 2\n' } }, { text: 'a2' }] },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok now\n' } }, { text: 'a3' }] },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 3, layerRoot: true, remainingUsd: () => 1.5 });
  assert.equal(events.filter((e) => e.type === 'root-injected').length, 0, 'Layer R is not wired on the native surface (F48 fallback, not the experiment surface)');
  assert.equal(outcome, 'green');
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


// ── F59: the scout's round bound cut it off mid-tool-use, so it never wrote the
// survey that is its only deliverable — 15 of 18 archived runs handed the planner
// "(no scout notes)" while still paying ~12% of the run for the walk. The bound is
// mechanical (loop.stop from the metering callback), so the fix is mechanical too:
// a TOOLLESS follow-up round on the same conversation, where text is the only
// possible output. Prose ("remember to summarise") is the F19/F37 non-fix.
test('F59: a scout that spends its rounds on tools gets ONE toolless summary round, and the blob survives', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { toolCalls: [tcall('s1', 'shell_grep', { pattern: 'export', path: wd })] }, // scout burns its round on a tool
    // a REALISTIC survey: the archive's real ones are 5991-8056 bytes, so a fixture
    // under the 200-byte floor would be indistinguishable from the truncation it models
    { text: `Layout: src/mod.mjs (exports x), tests/ exists but is empty. ${'The suite runner is node --test over tests/**. '.repeat(4)}Hypothesis: the work needs one new test file under tests/ asserting on x; no source change is required, and the close greens only once that file contains an ok assertion.` },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote it' },
  ]);
  const { events } = await go(wd, provider, { scoutRounds: 1 });
  const sr = events.find((e) => e.type === 'scout-result');
  assert.ok(sr.bytes > 0, `the survey reached the planner (got ${sr.bytes} bytes)`);
  assert.ok(!events.find((e) => e.type === 'scout-empty'), 'a recovered scout is not the loud condition');
  // the recovery round is toolless BY CONSTRUCTION — the model cannot spend it exploring
  assert.deepEqual(provider.toolsOffered[1], [], 'the reserved summary round offers no tools');
  assert.ok(provider.calls[2].includes('Hypothesis: the work needs one new test file'), 'the planner received the recovered survey, not "(no scout notes)"');
});


test('F59: a scout still empty after its reserved round emits the LOUD scout-empty, and the run continues', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { toolCalls: [tcall('s1', 'shell_grep', { pattern: 'export', path: wd })] }, // burns the round
    { text: '' },                                                                 // and says nothing even toolless
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote it' },
  ]);
  const { outcome, events } = await go(wd, provider, { scoutRounds: 1 });
  const empty = events.find((e) => e.type === 'scout-empty');
  assert.ok(empty, 'the silent failure is now a named event, not a log line nobody reads');
  assert.equal(events.find((e) => e.type === 'scout-result').bytes, 0);
  // F59's own evidence: empty scouts still green — so this is LOUD, never a halt
  assert.equal(outcome, 'green', 'an empty survey is reported, not fatal (3 of 5 archived greens had one)');
});


// F147: `askFrom` feeds a prior `loop.run()`'s returned `msgs` into a NEW Loop.
// bare-agent's Loop.run() prepends its `system` message to the transcript it
// returns, and the new Loop (built with the same `system`) would prepend it
// again — two identical system messages at index 0/1. Real OpenAI tolerates
// that; vLLM-class OpenAI-compatible backends 400 on it. The fix strips a
// leading system message from `msgs` before re-running.
test('F147: the F59 summary round sends exactly ONE system message, not two', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { toolCalls: [tcall('s1', 'shell_grep', { pattern: 'export', path: wd })] }, // scout burns its round on a tool
    { text: `Layout: src/mod.mjs (exports x), tests/ exists but is empty. ${'The suite runner is node --test over tests/**. '.repeat(4)}Hypothesis: the work needs one new test file under tests/ asserting on x; no source change is required, and the close greens only once that file contains an ok assertion.` }, // F59 summary round
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote it' },
  ]);
  const { events } = await go(wd, provider, { scoutRounds: 1 });
  const sr = events.find((e) => e.type === 'scout-result');
  assert.ok(sr.bytes > 0, 'the survey reached the planner (sanity check the summary round ran)');
  // call index 1 is the F59 toolless summary round (index 0 is the scout's
  // first, tool-burning round) — assert on the FULL messages array bare-agent
  // saw, not just messages[0], since a duplicate lands at index 1 as well.
  const summaryMessages = provider.messagesLog[1];
  const systemMessages = summaryMessages.filter((m) => m.role === 'system');
  assert.equal(systemMessages.length, 1, `expected exactly one system message, got ${systemMessages.length}`);
  assert.equal(summaryMessages[0].role, 'system', 'the single system message stays at index 0');
});


// ── T + A: materials at the plan surface, the wall clock, and the variance
// replan trigger (PRD v1.27/v1.29; materials design record + addenda 1-3).
//
// A replan has fired ZERO times in the programme (F56) because only step
// exhaustion triggered one. A adds the second trigger: the meter stops a step that
// has eaten a declared share of the run with its exits unmoved. These tests are
// the first coverage of that path.

test('T: the wall clock is reported BEFORE anything spends, and an unbounded run says so rather than leaving it to be inferred', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { events } = await go(wd, provider);
  const wc = events.find((e) => e.type === 'wall-clock');
  assert.ok(wc, 'the clock is on the spine');
  assert.equal(wc.bounded, false);
  assert.equal(wc.requestedMs, null, 'null is the honest no-cap — never a defaulted number (F45)');
  assert.equal(wc.enforcedMs, null);
  assert.match(wc.meaning, /explicit operator choice/, 'the absence is stated, not implied');
  // it precedes every spending event
  const firstRound = events.findIndex((e) => e.type === 'worker-round');
  assert.ok(events.indexOf(wc) < firstRound, 'reported before the first metered round');
});


test('T: a bounded run reports BOTH numbers — requested and enforced — because a deadline is only readable between rounds (addendum 1, measured)', async (t) => {
  const wd = makePatient(t, { closeGreen: true });
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }) });
  const wc = events.find((e) => e.type === 'wall-clock');
  assert.equal(wc.bounded, true);
  assert.equal(wc.requestedMs, 600_000);
  // W5 — the close here is TWO stages and `runStages` gives each one the whole
  // timeout, so the enforced worst case is two of them. The old 720_000 quoted one
  // close for a two-close overshoot: the requested-vs-enforced split was on the
  // record and the enforced side was still wrong.
  assert.equal(wc.closeStages, 2, 'the count comes from the close the runner actually executes');
  assert.equal(wc.enforcedMs, 840_000, 'requested + every stage\'s close timeout — quoting only the requested number, or only one stage, is F6 in a time coat');
});


test('W5: the wall-clock record scales with the close it will actually run — a 4-stage close advertises four close timeouts, and the record equals the arithmetic from its own fields', async (t) => {
  const wd = makePatient(t, { closeGreen: true });
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  // jobs/aurora-u-spawner-types.json's shape: a real staged close, four stages.
  const close = [
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'stage-two', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'stage-three', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' },
  ];
  const { events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000, close }) });
  const wc = events.find((e) => e.type === 'wall-clock');
  assert.equal(wc.closeStages, 4);
  assert.equal(wc.enforcedMs, 600_000 + 4 * 120_000, 'four stages, four close timeouts of overshoot');
  assert.equal(wc.enforcedMs, wc.requestedMs + wc.closeStages * 120_000, 'the advertised record IS the enforced computation, readable from the record itself');
});


test('W5: a single-predicate (object-form) close still advertises exactly one close timeout — the regression the multiplier must not move', async (t) => {
  const wd = makePatient(t, { closeGreen: true });
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd, [{
      id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }],
    }]) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  // PRD item 27/M2: the object (single-predicate) form of `close` is out of
  // `signCloseScripts`' array-only scope, so JOB()'s auto-sign never
  // touches it — sign it here directly against the real close.mjs.
  const close = { type: 'predicate', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED', sha256: hashCloseScriptBytes(readFileSync(join(wd, 'close.mjs'), 'utf8')) };
  const { events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000, close }) });
  const wc = events.find((e) => e.type === 'wall-clock');
  assert.equal(wc.closeStages, 1, 'the object form is the ONE-stage list it stands for (stageClose)');
  assert.equal(wc.enforcedMs, 720_000);
});


/** the capture provider both materials tests script: it records every prompt and
 * optionally lets the caller move the clock on a chosen call. `onCall` is how a
 * test makes TIME PASS between `createClock()` and the drafting call — the only
 * window in which the rendered balance is decided. */
const capturingProvider = (wd, prompts, onCall = () => {}) => ({
  name: 'capture',
  async generate(msgs) {
    prompts.push(String(msgs.at(-1)?.content ?? ''));
    onCall(prompts.length);
    const scripted = [
      { text: 'scout' }, { text: PLAN(wd) },
      { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
      { text: 'done' },
    ][prompts.length - 1] ?? { text: 'done' };
    return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
  },
});


test('T: the materials handed to the planner are a BALANCE — no rate, no per-round allowance, no derived round count (hamr\'s correction; F57 measured a 150x spread on verification gaps)', async (t) => {
  const wd = makePatient(t);
  const prompts = [];
  // The clock is PINNED, and that is the point of this test rather than an
  // accident of it: the subject is the SHAPE of the materials block (a balance,
  // never a rate), so the rendered number must come from the signed cap and
  // nothing else. Read off the real `Date.now()` it came from the machine — and
  // `Date.now()` is the WALL clock, which is not monotonic. A full-suite run on
  // 2026-08-15 was frozen by a 45m44s s2idle suspend (journal 02:53:23 → 03:39:07)
  // while node's own monotonic timer recorded the test as 8.5s: `Date.now()` had
  // advanced 2,744,000ms past a 2,700,000ms cap, so `remainingMs()` floored to 0
  // and this line read "0 minutes" on a run seconds old. The same assertion is
  // load-exposed without any suspend at all — 30s of real time between the clock
  // and the draft renders "44". `runPlan` exposes `now` for exactly this, and the
  // companion test below is what covers the number MOVING.
  const clk = fakeClock();
  await go(wd, capturingProvider(wd, prompts), { job: JOB(wd, { maxWallMs: 2_700_000 }), now: clk.now });
  const draft = prompts.find((p) => p.includes('DRAFT-PLAN'));
  assert.ok(draft, 'the drafting prompt was captured');
  assert.match(draft, /money left for the whole run: \$1\.50/);
  assert.match(draft, /time left for the whole run: 45 minutes/);
  assert.match(draft, /Nothing here is a rate/);
  // The negative half, which is the whole point of addendum 2:
  assert.doesNotMatch(draft, /per round/i, 'no per-round rate may reach the planner');
  assert.doesNotMatch(draft, /affords roughly/, 'no derived round count (F60 T2B\'s framing, withdrawn)');
  assert.doesNotMatch(draft, /seconds of model time/, 'no duration rate');
});


test('T: the time balance is LIVE — a run that has already burned time hands the planner what is LEFT, not the signed cap', async (t) => {
  const wd = makePatient(t);
  const prompts = [];
  // The half the pinned clock above cannot see, and the reason it is a separate
  // test rather than a looser regex there: with the clock driven deliberately,
  // "the number tracks elapsed" is an assertion instead of a coincidence. 15
  // minutes pass during the SCOUT call — after `createClock()`, before the
  // drafting call reads the balance — so 45 must arrive as 30.
  const clk = fakeClock();
  const provider = capturingProvider(wd, prompts, (n) => { if (n === 1) clk.advance(900_000); });
  await go(wd, provider, { job: JOB(wd, { maxWallMs: 2_700_000 }), now: clk.now });
  const draft = prompts.find((p) => p.includes('DRAFT-PLAN'));
  assert.ok(draft, 'the drafting prompt was captured');
  assert.match(draft, /time left for the whole run: 30 minutes/, 'the balance is what is LEFT — a cap echoed back would read 45');
});


test('T: with no maxWallMs the materials block carries money only — an absent cap is never rendered as a number', async (t) => {
  const wd = makePatient(t);
  const prompts = [];
  await go(wd, capturingProvider(wd, prompts));
  const draft = prompts.find((p) => p.includes('DRAFT-PLAN'));
  assert.match(draft, /money left for the whole run/);
  assert.doesNotMatch(draft, /time left for the whole run/, 'no cap means no time line — not "0 minutes", not "unlimited"');
});

test('F254: after a missing-exit red the redraft prompt carries the legal exit example', async (t) => {
  const wd = makePatient(t);
  const noExit = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'x', action: 'do', tools: ['read'], rounds: 6 }] });
  const provider = scriptedProvider([{ text: 'scout notes' }, { text: noExit }, { text: noExit }]);
  await go(wd, provider);
  assert.match(provider.calls[2], /missing-required/);
  assert.ok(provider.calls[2].includes(EXIT_EXAMPLE), 'the redraft prompt shows a legal exit');
});
