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
import { runPlan, planPrompt, closeGapBlock } from '../src/planrun.js';
import { ralph, boundGap, GAP_KEEP_TRIM_MARKER } from '../src/ralph.js';
import { validateJob } from '../src/job.js';
import { StallError, MAX_STALLS } from '../src/stall.js';
import { scriptedProvider, scriptedNativeFactory } from './helpers.js';
import { scanSecrets } from '../src/validate.js';
// the check gap's ONE ceiling — the backstop test below derives both arms from it
// rather than respelling 12000, so a change to the constant moves the test with it
import { CHECK_GAP_MAX } from '../src/exits.js';

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
  // The staged close (PRD v1.28): the inspection is a list of named stages and
  // the agent's ruler menu DERIVES from it. `clean-run` is a stage of the close,
  // not a copy carved beside it — which is the whole point: the ruler and the
  // real inspection cannot drift apart.
  close: [
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' },
  ],
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

async function go(wd, provider, { job = JOB(wd), capRuns = 3, layerRoot = false, scoutRounds, now, providerFor, bridge, resumeSeed } = {}) {
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns, layerRoot, remainingUsd: () => 1.5, ...(scoutRounds ? { scoutRounds } : {}), ...(now ? { now } : {}), ...(providerFor ? { providerFor } : {}), ...(bridge ? { bridge } : {}), ...(resumeSeed ? { resumeSeed } : {}) });
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
  const close = { type: 'predicate', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' };
  const { events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000, close }) });
  const wc = events.find((e) => e.type === 'wall-clock');
  assert.equal(wc.closeStages, 1, 'the object form is the ONE-stage list it stands for (stageClose)');
  assert.equal(wc.enforcedMs, 720_000);
});

test('T: the materials handed to the planner are a BALANCE — no rate, no per-round allowance, no derived round count (hamr\'s correction; F57 measured a 150x spread on verification gaps)', async (t) => {
  const wd = makePatient(t);
  const prompts = [];
  const provider = {
    name: 'capture',
    async generate(msgs) {
      prompts.push(String(msgs.at(-1)?.content ?? ''));
      const scripted = [
        { text: 'scout' }, { text: PLAN(wd) },
        { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
        { text: 'done' },
      ][prompts.length - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  await go(wd, provider, { job: JOB(wd, { maxWallMs: 2_700_000 }) });
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

test('T: with no maxWallMs the materials block carries money only — an absent cap is never rendered as a number', async (t) => {
  const wd = makePatient(t);
  const prompts = [];
  const provider = {
    name: 'capture',
    async generate(msgs) {
      prompts.push(String(msgs.at(-1)?.content ?? ''));
      const scripted = [
        { text: 'scout' }, { text: PLAN(wd) },
        { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
        { text: 'done' },
      ][prompts.length - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  await go(wd, provider);
  const draft = prompts.find((p) => p.includes('DRAFT-PLAN'));
  assert.match(draft, /money left for the whole run/);
  assert.doesNotMatch(draft, /time left for the whole run/, 'no cap means no time line — not "0 minutes", not "unlimited"');
});

test('A: the variance trigger FIRES — a step that eats over half the run\'s remaining money with its exits still red gets no further attempt, and the planner re-allocates (the trigger exhaustion-only could never reach, F56)', async (t) => {
  const wd = makePatient(t);
  // Attempt 1 writes a NON-ok file: tree-changed passes, clean-run reds, so attempt 2
  // is scheduled. The wallet is drained past the 50% threshold DURING attempt 1, so
  // the meter must stop the step at the head of attempt 2 rather than fund it.
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
    { text: 'attempt 1 done' },
    // the replan: a fresh plan whose one step greens
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] }]) },
    { text: 'writing', toolCalls: [tcall('2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  // The drain is driven by the RUN'S OWN progress, not a call count: once the first
  // step has been judged once, the wallet reports 40% of what the step started with
  // (a 60% share, over the 50% threshold). Deterministic, and it cannot silently
  // retarget if the number of wallet reads changes.
  let judged = 0;
  let balance = 1.5;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data) => {
    if (type === 'exit-eval') { judged += 1; if (judged === 1) balance = 0.6; }
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd: () => balance,
  });

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, `the meter must fire — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(variance.axis, 'money');
  assert.ok(variance.moneyShare >= 0.5, `share ${variance.moneyShare} must be at or over the threshold`);
  assert.equal(variance.threshold, 0.5, 'hamr\'s number, provisional by construction');
  assert.equal(variance.timeShare, null, 'no maxWallMs set — the time axis is null, never a fabricated 0');
  assert.equal(variance.iteration, 2, 'stopped at the HEAD of attempt 2, so attempt 1\'s work is not discarded');

  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, 'the variance routes to a REPLAN, not a stop — this is the adaptation channel (F56: zero replans in the programme)');
  assert.equal(replan.trigger, 'step-variance');
  assert.match(replan.reason, /consuming the run/);

  // the escalation ralph emitted must NOT claim something broke
  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'step-variance');
  assert.ok(esc, 'the category rides out by name');
  assert.doesNotMatch(esc.decision, /broke/i, 'a metered stop is not a fault — the record must not say the middle broke');

  // and the replan drafter was handed the DRAINED balance, not the original
  const replanMaterials = events.filter((e) => e.type === 'materials').at(-1);
  assert.equal(replanMaterials.phase, 'replan');
  assert.equal(replanMaterials.balanceUsd, 0.6, 'the balance is read LIVE at the replan — a stale snapshot would let it plan against money already spent');
  assert.match(replanMaterials.progress, /step 1 of 1/, 'the progress line is the other half of the adaptation channel');
});

test('A: the variance check NEVER fires on attempt 1 — the share is 0 by construction, so a first attempt can never be pre-empted', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  // a wallet that reports almost nothing left from the very start
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 0.002 });
  assert.equal(events.filter((e) => e.type === 'variance').length, 0, 'no variance event on a single-attempt step');
  assert.equal(outcome, 'green');
});

// ── F85: the meter REPORTS progress; it does not decide on it.
//
// u-msh70zla is the whole reason this section exists. One wide step was
// CONVERGING — its close counted 24 → 15 → 14 strict errors across three
// attempts, and the step ladder recorded `wrote: true, strikes: 0` every time —
// when the money meter fired at a 0.618 share. The stop was CORRECT (the step
// really was eating the run), but everything the stop then SAID about it was
// false: the replan reason was the fixed string "with its exits unmoved", and
// the materials handed to the replanner said only "step 1 of 1 did not finish".
// Believing nothing had been achieved, the replanner decomposed and re-targeted
// a file that was already at zero errors; that step wrote nothing twice, struck
// out, and killed the run with $1.09 and 7 minutes unspent.
//
// hamr's ruling: *"meter is right but missing a piece … it should give heads up
// on money/time + progress for llm to judge"*. So the trigger is untouched and
// the READOUT gains the run's measured trajectory — from the ONE trend
// instrument the money halt already reads, never a second one.

/** `n` TODO markers — the thing the counting patient's close counts. */
const todos = (n, pad = '') => `export const x = 1;\n${`// TODO${pad}\n`.repeat(n)}`;

/**
 * A patient whose close reports a real NUMBER the worker can move: `typecheck`
 * counts the TODO markers left in src/mod.mjs and reds with the same shape the
 * live u-* closes use (`red: … reports N error(s) in …`). `makePatient`'s close
 * reports no number at all, so it can only ever read `unknown` — which makes it
 * the right control and the wrong instrument for reading a trajectory.
 *
 * F71: `process.exitCode`, never `process.exit()` — a close that prints and then
 * exits can drop its own queued stdout and read as a clean short close.
 */
function makeCountingPatient(t, seed = 30, pad = '') {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-count-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), todos(seed, pad));
  writeFileSync(join(wd, 'count.mjs'), `import { readFileSync } from 'node:fs';
const n = (readFileSync(new URL('./src/mod.mjs', import.meta.url), 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('clean'); } else {
  console.log('red: tsc --strict reports ' + n + ' error(s) in src/mod.mjs');
  process.exitCode = 1;
}
`);
  return wd;
}

const COUNT_JOB = (wd, over = {}) => ({
  schema: 'job-v1',
  job: 'count-patient',
  description: 'shrink the strict-error count through an agent-authored plan',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Remove the TODO markers from src/mod.mjs so the typecheck stage greens.',
  verdictType: 'green',
  close: [{ name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^red' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const COUNT_PLAN = (steps) => JSON.stringify({
  schema: 'plan-v1',
  steps: steps ?? [{
    id: 'shrink-errors', action: 'Remove TODO markers from src/mod.mjs.',
    tools: ['write'], rounds: 6, target: 'src/mod.mjs',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }],
  }],
});

/** one worker attempt: a write round, then the summary round */
const attempt = (wd, id, body) => [
  { text: `attempt ${id}`, toolCalls: [tcall(id, 'shell_write', { path: join(wd, 'src', 'mod.mjs'), content: body })] },
  { text: `attempt ${id} done` },
];

/**
 * Drive a counting-patient run with a wallet the RUN'S OWN progress drains: after
 * the Nth judged exit the balance drops to `to`. Deterministic, and it cannot
 * silently retarget if the number of wallet reads changes (the F37 class).
 */
async function countRun(wd, script, drains, { job, start = 1.5, over = {} } = {}) {
  job = job ?? COUNT_JOB(wd);
  const provider = scriptedProvider(script);
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const { events, emit } = collector();
  let judged = 0;
  let balance = start;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data) => {
    if (type === 'exit-eval') { judged += 1; if (drains[judged] !== undefined) balance = drains[judged]; }
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd: () => balance, ...over });
  return { outcome, events, provider };
}

test('F85-A: the meter still fires on a CONVERGING step — and the variance record now carries the trajectory it used to be silent about', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),
    // the replan's fresh plan, which finishes the job
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 });

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, `the meter must fire — events: ${events.map((e) => e.type).join(' ')}`);
  // THE TRIGGER IS UNCHANGED. A converging step that eats the run is still
  // stopped: the meter is a governance instrument and must not judge capability.
  assert.equal(variance.threshold, 0.5, 'the threshold is untouched');
  assert.ok(variance.moneyShare >= 0.5, `share ${variance.moneyShare} is what fired it, and nothing else`);
  assert.equal(variance.axis, 'money');
  assert.equal(variance.iteration, 3, 'stopped at the HEAD of attempt 3 — attempts 1 and 2 keep their work');
  // …and the READOUT is the new half.
  assert.equal(variance.trend, 'converging', `the run WAS converging — reading: ${variance.reading}`);
  assert.match(variance.reading, /typecheck .*24 → 15/, 'the real per-stage trajectory, from the run trend');
  assert.ok(variance.series.find((s) => s.stage === 'typecheck')?.values.includes(24), 'the series rides on the record');

  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'step-variance');
  assert.ok(esc, 'the category rides out by name');
  assert.match(esc.detail, /consumed \d+%/, 'the share sentence is unchanged');
  assert.match(esc.detail, /24 → 15/, 'and the detail now states what the step actually achieved');
});

test('F85-A control: the meter fires identically on a FLAT expensive step, and reads it as flat — the reading can produce the negative, so this is not a silent disarm', async (t) => {
  // Same money story, same fire — but the worker rewrites the file with the SAME
  // error count (whitespace only), so tree-changed passes and the number does not
  // move. If `converging` were the only reachable reading the instrument would be
  // unfalsifiable and every later assertion on it would be worthless.
  const wd = makeCountingPatient(t, 24);
  const { events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24, ' ')),
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '2', todos(0)),
  ], { 1: 0.5 });

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, `the meter fires exactly as before — events: ${events.map((e) => e.type).join(' ')}`);
  assert.ok(variance.moneyShare >= 0.5);
  assert.equal(variance.trend, 'flat', `a run that moved no number reads flat — reading: ${variance.reading}`);
  assert.match(variance.reading, /no stage improved/);
  const replan = events.find((e) => e.type === 'replan');
  assert.doesNotMatch(replan.reason, /still progressing/, 'and the replan brief says so too');
});

test('F85-A: the trigger gained no progress term — a converging step UNDER the threshold is not stopped', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(0)),
  ], { 1: 1.2 }); // a 20% share — under 0.5, so nothing fires

  assert.equal(events.filter((e) => e.type === 'variance').length, 0, 'share is the only gate; progress never fires the meter by itself');
  assert.equal(events.filter((e) => e.type === 'replan').length, 0);
  assert.equal(outcome, 'green');
});

/**
 * The SHIPPED close shape: a `changed-from-seed` guard in front of the numeric
 * stage. It matters because `runStages` is first-red-wins — on a cold tree the
 * PRECHECK reds on the guard and never reaches the counter at all, so the numeric
 * stage's baseline exists only in the check PREFLIGHT. Every live u-* close is
 * built this way, which is why the seed fold is not a detail.
 */
function makeSeedGuardPatient(t, seed = 30) {
  const wd = makeCountingPatient(t, seed);
  writeFileSync(join(wd, 'seed.txt'), todos(seed));
  writeFileSync(join(wd, 'changed.mjs'), `import { readFileSync } from 'node:fs';
const now = readFileSync(new URL('./src/mod.mjs', import.meta.url), 'utf8');
const seed = readFileSync(new URL('./seed.txt', import.meta.url), 'utf8');
if (now !== seed) { console.log('changed'); } else {
  console.log('red: the tree is identical to the seed — nothing was changed');
  process.exitCode = 1;
}
`);
  return wd;
}

const GUARD_CLOSE = [
  { name: 'changed-from-seed', cmd: 'node changed.mjs', expect: 0, gapKeep: '^red' },
  { name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^red' },
];

test('F85-A: the numeric stage\'s SEED comes from the check preflight — so the commonest stop of all, a meter firing on attempt 2, is readable instead of "unknown"', async (t) => {
  // The precheck is first-red-wins and stops at `changed-from-seed`, exactly as every
  // shipped close does on a cold tree. Without the preflight seed the `typecheck`
  // series holds ONE value when the meter fires, and one value is not a comparison —
  // the readout would say "the direction is unknown" about a step that had just taken
  // 30 errors to 24. That is the blind-instrument class, not a conservative answer.
  const wd = makeSeedGuardPatient(t, 30);
  const job = COUNT_JOB(wd, { close: GUARD_CLOSE });
  const { events } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '2', todos(0)),
  ], { 1: 0.5 }, { job });

  assert.equal(events.find((e) => e.type === 'close-precheck').stage, 'changed-from-seed',
    'the precheck never reached the counter — otherwise this fixture proves nothing');
  const variance = events.find((e) => e.type === 'variance');
  assert.equal(variance.iteration, 2, 'ONE step grade in hand: the commonest variance stop there is');
  assert.equal(variance.trend, 'converging', `30 → 24 is a comparison, and it exists only because the preflight seeded it — reading: ${variance.reading}`);
  assert.match(variance.reading, /typecheck 30 → 24/);
});

test('F85-B: the replan brief carries the MEASURED trajectory and never the hardcoded "unmoved" — the u-msh70zla regression', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { events, provider } = await countRun(wd, [
    { text: 'scout' }, { text: COUNT_PLAN() },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 });

  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, 'the variance still routes to a replan');
  assert.equal(replan.trigger, 'step-variance');
  assert.doesNotMatch(replan.reason, /unmoved/, 'the fixed false statement is gone — the exits MOVED, 24 → 15');
  assert.match(replan.reason, /24 → 15/, 'and the reason states the measured trajectory instead');

  // the materials keep the structural sentence AND gain the measured one
  const mat = events.filter((e) => e.type === 'materials').at(-1);
  assert.equal(mat.phase, 'replan');
  assert.match(mat.progress, /step 1 of 1/, 'the structural sentence survives');
  assert.match(mat.progress, /24 → 15/, 'and the outcome the run actually achieved rides beside it');

  // the brief is the channel that converts (F38/F39) — it must carry it too
  const brief = provider.calls.find((c) => c.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  assert.match(brief, /24 → 15/, 'the replanner is told what the stopped step achieved');
  assert.doesNotMatch(brief, /unmoved/);
  assert.match(brief, /where the run got to.*24 → 15/s, 'and the materials block states it as well');
});

test('F85-C: a SECOND variance stop on a converging run earns ONE more replan — granted by the arbiter off a mechanical trend reading', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const step = (id) => COUNT_PLAN([{ id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1 at the head of attempt 3
    { text: step('plan-b') },
    ...attempt(wd, '3', todos(10)),   // fire #2 at the head of attempt 2 → the GRANT
    { text: step('plan-c') },
    ...attempt(wd, '4', todos(0)),
  ], { 2: 0.5, 3: 0.16 });

  const replans = events.filter((e) => e.type === 'replan');
  assert.equal(replans.length, 2, `the converging run earns the second replan — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(replans[0].granted, undefined, 'the first replan is the ordinary ceiling, not a grant');
  assert.equal(replans[1].granted, 'converging', 'the second is granted BY THE ARBITER off the trend reading — the agent never asks for it');
  assert.equal(replans[1].trigger, 'step-variance', 'and only a variance stop can earn it');
  assert.equal(outcome, 'green');
  // the extra replan must not open a hole in Rule B: the check the plan carried is
  // still carried after the SECOND redraft (a shed would let a plan green on form)
  const accepted = events.filter((e) => e.type === 'plan-accepted');
  assert.equal(accepted.length, 3, 'draft + two replans');
  assert.ok(accepted.at(-1).plan.steps.every((s) => s.exit.some((e) => e.type === 'check-passes' && e.name === 'typecheck')),
    'the truth check survives the granted redraft — Rule B chains across both replans');
});

test('F85-C: the grant is BOUNDED — a THIRD variance stop is the stop, exactly as before', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const step = (id) => COUNT_PLAN([{ id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1
    { text: step('plan-b') },
    ...attempt(wd, '3', todos(10)),   // fire #2 → grant
    { text: step('plan-c') },
    ...attempt(wd, '4', todos(8)),    // fire #3 → STOP (unlimited replanning launders thrash as adaptation)
  ], { 2: 0.5, 3: 0.16, 4: 0.05 });

  assert.equal(events.filter((e) => e.type === 'replan').length, 2, 'two replans and no more, however well the run is converging');
  assert.equal(events.filter((e) => e.type === 'variance').length, 3, 'the third stop was still metered and recorded');
  assert.equal(outcome, 'step-red:plan-c', 'the stop rides out as a step-red, never as a new top-level outcome');
});

test('F85-C: a second variance stop on a FLAT run stops exactly as it does today — the grant is earned, never given', async (t) => {
  const wd = makeCountingPatient(t, 24);
  const step = (id) => COUNT_PLAN([{ id, action: 'Rewrite src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]);
  const { outcome, events } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') },
    ...attempt(wd, '1', todos(24, ' ')),   // fire #1
    { text: step('plan-b') },
    ...attempt(wd, '2', todos(24, '  ')),  // fire #2 — nothing has moved
  ], { 1: 0.5, 2: 0.16 });

  const variances = events.filter((e) => e.type === 'variance');
  assert.equal(variances.length, 2);
  assert.equal(variances[1].trend, 'flat', 'the reading the grant is refused on');
  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'one replan, exactly as before this change');
  assert.equal(outcome, 'step-red:plan-b');
});

// ── THE REPLAN CEILING IS THE RUN'S, AND A RUN CAN SPAN LEGS ─────────────────
//
// `replanned`/`varianceGrantUsed`/`replans` are locals in `runPlan`, so before this
// they were reborn on every call — and a resume IS another call. Measured on the
// counting patient: leg 1 spent both replans and step-redded; leg 2, driven with the
// checkpoint leg 1 left behind, replanned twice MORE. Two replans became four by
// being killed once, which is the exact creep the latch exists to make impossible
// ("unlimited replanning launders thrash as adaptation", PRD v1.12).
//
// The precedent copied is `resumeGrades` (the trend's baselines), and the reason the
// two seeds differ is worth stating: src/trend.js deliberately does NOT seed the fix
// loop's ITERATIONS from history, "because the leg's own bounds must not be spent by
// history". A leg's attempt allowance is a LEG bound. The replan ceiling is not — it
// is a RUN bound by doctrine, the same span the halt readout already asks about, so
// the history is exactly what must be spent.
const RESUMED_STEP = (id) => JSON.parse(COUNT_PLAN([{
  id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs',
  exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }],
}]));
/** a resumed leg picking up `id` with nothing yet finished — the shape `readResume`
 * returns when the kill landed inside the first step of the plan it had accepted */
const resumedAt = (id) => ({ phase: 'step', plan: RESUMED_STEP(id), completedSteps: [], planSeq: 1 });

test('resume: a leg whose predecessor SPENT the ceiling does not replan — the bound spans the chain (v1.12)', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { outcome, events } = await countRun(wd, [
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // the meter fires at the head of attempt 3
  ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 2, grantUsed: true } } });

  // the meter DID fire — the refusal has to be the ceiling's, not a stop that never
  // reached the decision (a negative for the wrong reason proves nothing)
  assert.equal(events.filter((e) => e.type === 'variance').length, 1, 'the variance stop happened, so the replan decision really was reached');
  assert.equal(events.filter((e) => e.type === 'replan').length, 0,
    'the dead leg already spent both replans — a kill must not buy a fresh allowance');
  assert.equal(outcome, 'step-red:plan-c', 'the stop rides out as the same step-red a third variance stop produces cold');
});

test('resume: a leg whose predecessor left the ceiling UNSPENT replans normally — the seed inherits a ledger, it does not disarm the mechanism', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { outcome, events } = await countRun(wd, [
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1 → the ORDINARY replan, untouched by the seed
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 0, grantUsed: false } } });

  assert.equal(events.filter((e) => e.type === 'replan').length, 1,
    'a resumed leg with the ceiling unspent replans exactly as a cold one does — this is the arm that can produce the negative');
  assert.equal(outcome, 'green');
});

test('resume: the F85-C grant cannot be RE-EARNED by a resumed leg — the latch travels beside the count', async (t) => {
  // Both arms inherit the ORDINARY ceiling as spent and hit the SAME converging
  // variance stop, so they differ in exactly one bit: whether the dead leg had
  // already been granted its one extra. Without the latch travelling, the two arms
  // are indistinguishable and the grant is re-earnable once per kill.
  const arm = async (/** @type {boolean} */ grantUsed) => {
    const wd = makeCountingPatient(t, 30);
    return countRun(wd, [
      ...attempt(wd, '1', todos(24)),
      ...attempt(wd, '2', todos(15)),   // the meter fires at the head of attempt 3
    ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 1, grantUsed } } });
  };

  const unused = await arm(false);
  assert.equal(unused.events.filter((e) => e.type === 'replan').length, 1,
    'the grant is still there to be earned — the control that proves this test can produce both answers');
  assert.equal(unused.events.find((e) => e.type === 'replan').granted, 'converging', 'and it is the arbiter\'s grant, not the ordinary ceiling');

  const used = await arm(true);
  assert.equal(used.events.filter((e) => e.type === 'variance').length, 1, 'the same stop, so the arms differ only in the inherited latch');
  assert.equal(used.events.filter((e) => e.type === 'replan').length, 0,
    'a leg cannot re-earn an extra its predecessor already spent — the ONE grant is the RUN\'s');
  assert.equal(used.outcome, 'step-red:plan-c');
});

test('resume: plan-executed.replans is the CHAIN total, so a reader can see a ceiling no single leg spent', async (t) => {
  const wd = makeCountingPatient(t, 30);
  const { events } = await countRun(wd, [
    ...attempt(wd, '1', todos(24)),
    ...attempt(wd, '2', todos(15)),   // fire #1 on this leg → the ARBITER GRANT (the ordinary one is spent)
    { text: COUNT_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...attempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { over: { resumeSeed: resumedAt('plan-c'), resumeReplans: { count: 1, grantUsed: false } } });

  const replans = events.filter((e) => e.type === 'replan');
  assert.equal(replans.length, 1, 'this leg drafted one replan — the leg count stays readable as the number of records');
  assert.equal(replans[0].granted, 'converging', 'and it is the GRANT, because the ordinary ceiling was spent by the leg before it');
  assert.equal(replans[0].replan, 2, 'the record numbers it within the RUN, not within the leg');
  assert.equal(events.findLast((e) => e.type === 'plan-executed').replans, 2,
    'and the chain total is on the record — otherwise every leg reports 1 and the run\'s two are invisible');
});

// ── F64: the wall clock's own stop must never be filed as a transport casualty.
// A provider-red is a CASUALTY by doctrine — never evidence, retry, and it carries
// the F44 spendComplete:false floor. So a run that correctly ran out of the
// operator's TIME must not ride out under the label reserved for a dead socket.

/** a fake clock the test drives: the provider advances it on the call it chooses */
const fakeClock = (startMs = 1_000_000) => {
  const state = { ms: startMs };
  return { now: () => state.ms, advance: (by) => { state.ms += by; } };
};

/** bare-agent's TimeoutError shape (BA-18): a code, and NO category */
const timeoutError = () => Object.assign(new Error('[AnthropicProvider] request timed out after 120000ms of socket inactivity'), { code: 'ETIMEDOUT' });

test('F64: a wall-derived call timeout is a wall-halt, NOT a provider-red — the operator\'s governance stop is never filed as a network failure', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  // Call 3 is the worker's first round. The wall passes DURING it and the provider
  // rejects with bare-agent's own timeout — which is exactly what clock.callTimeoutMs()
  // asked it to do. That is the run's deadline coming back as a provider error.
  let n = 0;
  const provider = {
    name: 'wall-timeout',
    async generate() {
      n += 1;
      if (n === 3) { clk.advance(700_000); throw timeoutError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'wall-halt', 'time ran out — that is a governance stop, not a casualty');
  const cats = events.filter((e) => e.type === 'escalation').map((e) => e.category);
  assert.ok(cats.includes('wall-halt'), `the escalation names the same category the outcome does (F11) — saw ${cats.join(', ')}`);
  assert.ok(!cats.includes('provider-red'), 'nothing on the spine may call this a transport failure');
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the run-level record carries the clock\'s numbers, not just ralph\'s escalation');
  assert.equal(wh.requestedMs, 600_000);
  assert.equal(wh.enforcedMs, 840_000, 'both numbers, always (addendum 1) — and the enforced one counts every stage of this job\'s two-stage close (W5)');
  assert.ok(wh.elapsedMs >= 600_000, 'the honest elapsed figure, overshoot included');
  assert.equal(wh.cutMidCall, true, 'distinguishes a deadline that landed INSIDE a call from one read between steps');
  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'wall-halt');
  assert.match(esc.options.join(' '), /maxWallMs/, 'the decision-ready option is raise-the-cap, not retry-the-provider');
  assert.doesNotMatch(esc.decision, /transport|network|socket/i, 'the human must not be sent to debug the provider binding');
});

test('F64 control: the SAME timeout with time still on the clock stays a provider-red — the fix must not launder a real dead socket into a governance stop', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'dead-socket',
    async generate() {
      n += 1;
      // identical rejection, identical call position — the ONLY difference is that
      // the clock is NOT expired, so the wall cannot have been what bound this call
      if (n === 3) { clk.advance(1_000); throw timeoutError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'provider-red', 'a hang with time left is a transport casualty and must stay one');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no wall-halt record on a run that never ran out of time');
});

test('F64: an unbounded run can never produce a wall-halt — with no cap there is no deadline for a timeout to be derived from', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'unbounded-timeout',
    async generate() {
      n += 1;
      if (n === 3) { clk.advance(9_000_000); throw timeoutError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { now: clk.now }); // JOB() sets no maxWallMs
  assert.equal(outcome, 'provider-red', 'the provider\'s own default timeout tripped — that is transport, and no clock claims it');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0);
});

test('F64: a wall-derived timeout during PLAN DRAFTING is a wall-halt too — the relay path is not a second, blinder route', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'draft-timeout',
    async generate() {
      n += 1;
      if (n === 2) { clk.advance(700_000); throw timeoutError(); } // the drafting call
      return { text: 'scout', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });
  assert.equal(outcome, 'wall-halt');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt');
  assert.equal(esc.phase, 'plan', 'the phase says where the clock ran out');
  assert.ok(events.find((e) => e.type === 'wall-halt'), 'the clock\'s numbers reach the spine on the drafting path too');
  // This file's OWN option list (WALL_OPTIONS), pinned — the only test that reads it.
  // Nothing used to, so it silently drifted to two levers while ralph's entry for the
  // same category offered three: one category, one option list, whichever site read
  // the clock. Both levers are spec edits, so each names its re-approval.
  assert.deepEqual(esc.options, [
    'raise maxWallMs and rerun (resume-to-cap; a spec edit, so the new hash needs re-approval)',
    'revise the goal/spec so the work fits the time (same re-approval)',
    'abandon the task',
  ]);
});

test('W-2: the wall-halt option list is ONE list — planrun\'s WALL_OPTIONS and ralph\'s DECISIONS entry pinned against EACH OTHER, not each against a literal', async (t) => {
  // The two lists are declared byte-identical in both files' comments, and the pin
  // above only holds planrun's side to a copy of the text. A literal-vs-literal pin
  // is one-sided: edit ralph's entry and nothing here fails, which is exactly how the
  // lists drifted to two-vs-three levers the first time. This reads BOTH sites'
  // real emissions and compares them to each other, so an edit to EITHER breaks.
  // Behavioural, not by import: neither list is exported (WALL_OPTIONS is a runPlan
  // local, ralph's DECISIONS a per-throw local), and the escalation's `options` is
  // the observable that actually reaches a human either way.
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'draft-timeout',
    async generate() {
      n += 1;
      if (n === 2) { clk.advance(700_000); throw timeoutError(); } // the drafting call — planrun's own WALL_OPTIONS site
      return { text: 'scout', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });
  const planrunOptions = events.filter((e) => e.type === 'escalation').at(-1)?.options;

  // ralph's side: a middle that throws the SAME category, so its DECISIONS table
  // renders the entry the same human would read from the other site
  const { events: ralphEvents, emit } = collector();
  await ralph({
    middle: () => { throw Object.assign(new Error('the wall passed'), { category: 'wall-halt' }); },
    judge: async () => ({ verdict: 'satisfied' }),
    capRuns: 1,
    emit,
  });
  const ralphEsc = ralphEvents.find((e) => e.type === 'escalation');
  assert.equal(ralphEsc?.category, 'wall-halt', 'ralph really routed the category — a different one and this compares the wrong list');

  assert.equal(planrunOptions?.length, 3, 'three levers: more time, a smaller goal, stop');
  assert.deepEqual(planrunOptions, ralphEsc.options,
    'ONE category, ONE option list — which site read the clock is an implementation detail');
});

test('T: the between-steps wall terminal — a run whose clock expires after a green step STOPS, and the stop is the checkpoint', async (t) => {
  // NOT closeGreen: an already-green close short-circuits the whole run at the
  // precheck, so the terminal under test would never be reached (a green patient
  // here reads `already-green` and proves nothing).
  const wd = makePatient(t);
  const clk = fakeClock();
  const twoSteps = [
    { id: 'one', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] },
    { id: 'two', action: 'Write tests/test_y.mjs.', tools: ['write'], rounds: 4, target: 'tests/test_y.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] },
  ];
  let n = 0;
  const provider = {
    name: 'slow-step',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd, twoSteps) },
        { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
        { text: 'step one done' },
      ][n - 1] ?? { text: 'done' };
      if (n === 4) clk.advance(700_000); // step one greened, and the clock is now spent
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });
  assert.equal(outcome, 'wall-halt', 'step two is never started — starting a step the run cannot fund is the F45 class');
  const wh = events.find((e) => e.type === 'wall-halt');
  assert.equal(wh.stepsDone, 1);
  assert.equal(wh.stepsPlanned, 2);
  assert.equal(wh.cutMidCall, false, 'read BETWEEN steps, not inside a call');
  assert.match(wh.meaning, /not "can't"/, 'a time stop is not a capability read');
});

test('a HIDDEN precondition never becomes a ruler, and a dependent stage is picked WITH its chain — through the real plan flow', async (t) => {
  const wd = makePatient(t);
  // Both stage classes v1.28 names, in one close, exercised end to end — the
  // unit tests cover checkMenu and runStages, but nothing had run either class
  // through preflight and the check-passes seam, where the menu and the chain
  // are actually consumed.
  writeFileSync(join(wd, 'seed.mjs'), 'process.exit(0);\n');                       // a precondition: always true, teaches nothing
  writeFileSync(join(wd, 'build.mjs'), `import { writeFileSync as w } from 'node:fs';
w(new URL('./built.txt', import.meta.url), 'x'); process.exit(0);\n`);
  // `api` judges what `build` produced: alone it reds for a reason that has
  // nothing to do with the worker's edit, which is what `needs` exists to prevent
  // it CONSUMES the artifact, so the chain must re-run `build` every single time:
  // a persistent artifact would let a chainless `api` pass on the leftovers from
  // preflight, and the test would go green while proving nothing
  writeFileSync(join(wd, 'api.mjs'), `import { existsSync, rmSync } from 'node:fs';
const built = new URL('./built.txt', import.meta.url);
if (!existsSync(built)) { console.log('FAILED: nothing was built'); process.exit(1); }
rmSync(built); process.exit(0);\n`);
  const job = JOB(wd, { close: [
    { name: 'seed-present', cmd: 'node seed.mjs', expect: 0, offer: false },
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'build', cmd: 'node build.mjs', expect: 0 },
    { name: 'api', cmd: 'node api.mjs', expect: 0, needs: ['build'] },
  ] });
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
    tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'api' }],
  }] });
  const provider = scriptedProvider([
    { text: 'scout' }, { text: plan },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] }, { text: 'wrote it' },
  ]);
  const { outcome, events } = await go(wd, provider, { job });

  const menu = events.find((e) => e.type === 'check-menu');
  assert.deepEqual(menu.offered, ['clean-run', 'build', 'api'], 'the derived menu, and the precondition is not in it');
  assert.deepEqual(menu.hidden, ['seed-present'], 'what was withheld is on the record, not silently dropped');
  assert.deepEqual(events.filter((e) => e.type === 'check-preflight').map((e) => e.name), ['clean-run', 'build', 'api'],
    'preflight runs the MENU — a hidden precondition is never preflighted as a ruler');
  assert.deepEqual(events.find((e) => e.type === 'check-preflight' && e.name === 'api').chain, ['build', 'api'],
    'and the dependent stage preflights as its chain');

  // the plan named `api`; picking it must have run `build` first, or api reds on
  // a phantom and the step could never green
  assert.equal(events.find((e) => e.type === 'check-run' && e.name === 'api')?.verdict, 'satisfied',
    'the chain ran, so the ruler judged the real thing');
  assert.equal(outcome, 'green');
});

// ---- P: the widened step vocabulary is WIRED, not just validated (F50 class) ----

test('P: a per-step scope NARROWS the live fence — a write the job fence allows is denied by the step scope', async (t) => {
  const wd = makePatient(t);
  const job = JOB(wd, { writeScope: ['tests/**', 'src/**'] });
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test; do not touch src.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', scope: 'tests/**',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: plan },
    // one round, two writes: src/ is INSIDE the signed fence but OUTSIDE the step scope
    { toolCalls: [
      tcall('t1', 'shell_write', { path: join(wd, 'src', 'hack.mjs'), content: 'nope\n' }),
      tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' }),
    ] },
    { text: 'wrote the test' },
  ]);
  const { outcome } = await go(wd, provider, { job });
  assert.equal(outcome, 'green');
  assert.ok(existsSync(join(wd, 'tests', 'test_x.mjs')), 'the in-scope write landed');
  assert.ok(!existsSync(join(wd, 'src', 'hack.mjs')), 'the out-of-step-scope write was denied by the NARROWED fence');
});

test('P: step.attempts is TOLERATED-INERT at the runner too — a stored bridge plan validates and the field bounds nothing', async (t) => {
  // It used to tighten the shell's fixed per-step cap, and this test read exactly
  // one iteration off it. The cap is gone: the step ladder governs iterations by
  // progress, and a field that could only ever TIGHTEN is the wrong shape for that
  // (drafters measurably tightened it to 3, then to 2 on replan). It is still
  // ACCEPTED because the frozen bridge registry's stored plans carry it — refusing
  // them would ruin a frozen contrast experiment.
  const wd = makePatient(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test.',
      tools: ['write'], rounds: 3, target: 'tests/test_x.mjs', attempts: 1,
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: plan },
    // the write lands but its content never satisfies the check → exit red, and the
    // gap is byte-identical every iteration, so the ladder strikes out at two
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'not the magic word\n' })] },
    { text: 'wrote it (wrong)' },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'still not it\n' })] },
    { text: 'wrote it (wrong again)' },
    // the replan drafter fires next (cap-halt + funds left) — feed it junk so the
    // run ends; this test reads the ITERATION count, not the ending
    { text: 'not a plan' },
  ]);
  const { events } = await go(wd, provider);
  assert.equal(events.find((e) => e.type === 'plan-validate').ok, true, 'a plan carrying attempts is accepted');
  // cut at the STEP boundaries: the close precheck and the fix loop emit the same event
  // type, so an unscoped filter can read a fix-loop iteration as the step's second one
  assert.equal(stepIterations(events).filter((e) => e.iteration === 2).length >= 1, true,
    'attempts: 1 bounded nothing — a second iteration ran under a step that declared one');
});

test('P: step.model routes the worker through providerFor(tier); the drafter stays on the default', async (t) => {
  const wd = makePatient(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', model: 'sonnet',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const main = scriptedProvider([
    { text: 'scout notes' },
    { text: plan },
  ]);
  const tiered = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote the test' },
  ]);
  /** @type {string[]} */
  const asked = [];
  const { outcome } = await go(wd, main, { providerFor: (tier) => { asked.push(tier); return tiered; } });
  assert.equal(outcome, 'green');
  assert.deepEqual(asked, ['sonnet'], 'the factory is asked for exactly the planned tier');
  assert.equal(main.calls.length, 2, 'scout + plan ran on the default provider');
  assert.ok(tiered.calls.length >= 1, 'the step worker ran on the tier provider');
});

test('P: step.model with NO providerFor is a STOP, never a silent default-tier run', async (t) => {
  const wd = makePatient(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the test.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', model: 'sonnet',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }],
    }],
  });
  const provider = scriptedProvider([{ text: 'scout notes' }, { text: plan }]);
  const { outcome, events } = await go(wd, provider);
  assert.notEqual(outcome, 'green');
  assert.ok(events.some((e) => e.type === 'escalation' && /providerFor/.test(`${e.decision ?? ''} ${e.detail ?? ''}`)),
    `the missing wiring is NAMED in the escalation — got ${JSON.stringify(events.filter((e) => e.type === 'escalation'))}`);
});

// ── casualty routing across EVERY provider-consuming phase ──────────────────
//
// Doctrine: an API truncation is TRANSPORT class — retry, never capability
// evidence, never interpreter-red/config-red (the `truncated:` leg at
// src/planrun.js:735-743). And a casualty is a casualty wherever the provider is
// consumed: the plan flow calls out from five places (scout, plan drafter, step
// worker, replan drafter, close-fix worker) and each must file the same event
// under the same name, or the readout's casualty count is phase-shaped.
//
// Prior coverage was ONE cell of that grid: a mid-STEP transport THROW (the
// F11/F44 test above). Truncation reaches the router by the OTHER seam — a
// RETURNED `r.error`, not a throw — and the drafting/replan/fix phases had no
// casualty coverage at all.

/**
 * A scripted provider whose Nth call onward (0-based) dies instead of answering.
 * Same wrap idiom as the F11/F44 mid-step test, factored because four phases
 * need it at four different call positions.
 * @param {any[]} script @param {number} n @param {() => Error} [thrower]
 */
const dyingAt = (script, n, thrower = () => Object.assign(new Error('ECONNRESET mid-call'), { category: 'provider-red', lib: 'bare-agent' })) => {
  const base = scriptedProvider(script);
  let i = 0;
  return {
    calls: base.calls,
    toolsOffered: base.toolsOffered,
    /** @param {any} messages @param {any} tools */
    async generate(messages, tools) {
      if (i++ >= n) throw thrower();
      return base.generate(messages, tools);
    },
  };
};

test('WORKER truncation: a step round cut off at the output cap rides out as provider-red — a returned truncated:max_tokens is the SAME casualty class as a thrown socket, never interpreter-red', async (t) => {
  const wd = makePatient(t);
  // The truncation seam is a RETURNED error, not a throw: the real Loop maps
  // stopReason max_tokens to `error: 'truncated:max_tokens'` (bare-agent
  // loop.js), and planrun's `ask` routes that string. So the fixture drives the
  // REAL mechanism (a provider stop reason) rather than a hand-made error object
  // — and the router's default `interpreter-red` leg sits one line below the one
  // under test, so a mis-wired router lands there and this test reads it.
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'half a thou', stopReason: 'max_tokens' },   // the step worker's first round
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red', 'an API-truncated worker round is transport, never capability tier data');
  assert.ok(!outcome.startsWith('step-red'), 'never laundered into the outcome the driver reads as a capability read');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red', 'the outcome and the spine escalation name the SAME category (F11)');
  assert.match(esc.detail ?? '', /truncated:max_tokens/, 'the casualty is named by its own shape — a human reading the spine can tell truncation from a dead socket');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'interpreter-red').length, 0,
    'a truncated round is NOT a broken interpreter — that routing would blame the harness for the provider');
});

test('DRAFTER truncation: a plan-draft call cut off at the output cap is provider-red, never plan-red — a truncated draft is a casualty, and there is no redraft on truncation', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: 'a plan that never fini', stopReason: 'max_tokens' },  // the DRAFT call
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red', 'the drafter was cut off by the provider — that is not a bad plan');
  assert.equal(events.filter((e) => e.type === 'plan-validate').length, 0,
    'the truncated text is never validated: judging a half-emitted artifact would mint a plan-red the drafter never earned');
  assert.equal(events.filter((e) => e.type === 'plan-red').length, 0, 'and no plan-red rides out');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.equal(esc.phase, 'plan', 'the escalation says WHICH call died — the relay path is not a blinder route (F64 class)');
  assert.match(esc.detail ?? '', /truncated:max_tokens/);
});

test('REPLAN-DRAFTER casualty: a transport death during the replan draft is provider-red, and the spine still records that the replan was ATTEMPTED', async (t) => {
  const wd = makePatient(t);
  // Same fixture as the ONE-replan test: plan A's step writes nothing, so
  // tree-changed reds every attempt → cap-halt with funds left → the one replan.
  // Call 4 is the replan draft, and it dies on the wire.
  const provider = dyingAt([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'thinking about it' },   // attempt 1: no write
    { text: 'still thinking' },      // attempt 2: no write → exhaustion
  ], 4);
  const { outcome, events } = await go(wd, provider, { capRuns: 2 });
  assert.equal(outcome, 'provider-red', 'the replan drafter is a provider consumer like any other — its casualty is a casualty');
  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, 'the replan is on the record even though its draft never came back — a phase that spent must not vanish');
  assert.equal(replan.trigger, 'cap-halt');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red', 'the returned outcome and the last escalation agree (F11)');
  assert.equal(esc.phase, 'replan');
  assert.ok(events.find((e) => e.type === 'plan-executed'), 'the plan-as-executed record never dangles, even on a casualty exit (design law #2)');
});

test('CLOSE-FIX-LOOP casualty: a transport death inside the outer fix loop rides out under its OWN name, and the metered rounds that DID complete survive', async (t) => {
  const wd = makePatient(t);
  // Same shape as the fix-loop test: the close is stricter than the check, so
  // the step greens and the close reds once, opening the fix loop. Call 4 is the
  // fix worker's first round, and it dies on the wire.
  writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('ok') && t.includes('import')) process.exit(0);
console.log('FAILED close: the test never imports the module'); process.exit(1);\n`);
  const provider = dyingAt([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },            // the step greens; the close then reds
  ], 4);
  const { outcome, events } = await go(wd, provider);

  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop opened — the casualty is inside it, not before it');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red', 'ralph files the casualty correctly ON THE SPINE');

  // The fix loop restores the casualty's own name exactly as the step loop does
  // (planrun.js:1140-1147): ralph catches the middle throw and returns the flat
  // 'escalated', and the caller re-reads `lastEscalation.category`. Anything
  // else is the F11 two-instruments-disagreeing shape — and run.js's F44 branch
  // keys spendComplete on the OUTCOME, so a laundered label reports an
  // exact-looking total for a call that never billed back. (Was a pinned
  // doctrine gap; fixed with hamr's explicit go, 2026-07-30.)
  assert.equal(outcome, 'provider-red',
    'a transport casualty in the fix loop is a casualty — never laundered into a bare escalated');
  assert.equal(outcome, esc.category,
    'the returned outcome and the spine escalation name the SAME category (F11)');

  // whatever the label, the money record must survive the casualty: the rounds
  // that completed were really spent and really billed (F12 per-round metering)
  const rounds = events.filter((e) => e.type === 'worker-round');
  assert.ok(rounds.length >= 4, `scout + draft + the two step rounds stay on the spine, got ${rounds.length}`);
  assert.ok(rounds.some((r) => r.phase === 'scout') && rounds.some((r) => r.phase === 'plan'),
    'the pre-casualty phases keep their attribution — a casualty never erases the spend that preceded it');
  assert.ok(rounds.every((r) => 'costUsd' in r), 'every surviving round still carries its cost field (F6)');
});

/** the fix-loop fixture: a close STRICTER than the check, so every step greens on
 * its own exits and the outer close still reds — the one shape that opens the
 * close-fix loop. @param {string} wd */
const strictCloseOverCheck = (wd) => writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('ok') && t.includes('import')) process.exit(0);
console.log('FAILED close: the test never imports the module'); process.exit(1);\n`);

test('CLOSE-FIX-LOOP money halt: a fix loop that cap-halts on a DRAINED wallet returns cap-halt, never escalated — a money cut is never a capability read (F45, MED-4)', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },                 // the step greens; the close then reds
    { text: 'fix attempt' },              // the fix worker's first round — priced above the drained wallet
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  // The drain is targeted at the RUN'S OWN STATE (the fix loop has opened), never
  // by counting calls on the injected wallet — a call-count trigger measures "how
  // many times has remainingUsd been read", which silently retargets whenever the
  // number of reads changes.
  let fixOpen = false;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'fix-loop') fixOpen = true;
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit: emit2, capRuns: 3,
    remainingUsd: () => (fixOpen ? 0.0001 : 1.5),
  });
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop opened — the halt is inside it, not before it');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt', 'ralph emits the money-gate halt as cap-halt (its ONE category for both halts)');
  assert.equal(outcome, 'cap-halt',
    'a drained wallet in the fix loop is the resume-to-cap checkpoint, not "the fix failed" — the step loop already splits this exact pair');
});

test('CLOSE-FIX-LOOP exhaustion CONTROL: attempts spent WITH money left stays escalated — the designed "close still red" terminal (MED-4 must not swallow it)', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },                 // the step greens; the close then reds
    { text: 'fix attempt — writes nothing' }, // sticks: every fix attempt leaves the close red
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 2, remainingUsd: () => 1.5 });
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop opened');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt', 'ralph names attempt-exhaustion cap-halt too — the SAME category, which is why the wallet is the split');
  assert.equal(outcome, 'escalated',
    'attempts spent with money on the table is a capability terminal, and it must keep riding out as escalated');
});

// ── W-2: the wall, read BETWEEN close-fix iterations. Nothing used to read the
// clock between the last step and the outer close, and the fix loop re-ran the FULL
// staged close every iteration with no wall read at all. Past the deadline each fix
// worker is stopped on its first round by the metered clock check — it writes
// nothing — so every post-wall iteration was zero work plus a full re-grade of an
// UNCHANGED tree, minting the verdict already on the record, capRuns times over (60
// minutes each on the shipped four-stage spec). hamr's ruling: keep the grade we
// already have and stop, then ask the human for more time or a different goal.

/** the events emitted from the `fix-loop` marker onward — the close-fix loop's own
 * record, separated from the step loop's (which emits the same event types). */
const afterFixLoop = (events) => {
  const i = events.findIndex((e) => e.type === 'fix-loop');
  assert.ok(i >= 0, 'the fix loop opened — every assertion below is about what happened inside it');
  return events.slice(i);
};

/** a close whose RED OUTPUT tracks the tree (a real suite's does), so two
 * consecutive grades can legitimately differ. Still stricter than the `clean-run`
 * check, which is what opens the fix loop at all. @param {string} wd */
const byteReportingClose = (wd) => writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('import')) process.exit(0);
console.log(\`FAILED close: \${t.length} bytes, still no import\`); process.exit(1);\n`);

test('W-2: the wall past the outer close STOPS the fix loop on the verdict already minted — one close post-steps, zero fix rounds, no re-grade of an unchanged tree', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-at-outer-close',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
        { text: 'wrote it' },
      ][n - 1] ?? { text: 'a fix attempt that must never be bought' };
      if (n === 4) clk.advance(700_000); // the step greened, and the clock is now spent
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });

  assert.equal(outcome, 'wall-halt', 'time ran out — a governance stop, never "the fix failed"');
  const inFix = afterFixLoop(events);
  assert.equal(inFix.filter((e) => e.type === 'close-verdict').length, 0,
    'ZERO closes ran inside the fix loop: the only post-steps grade is the outer close, and it is the one the run stops on');
  assert.equal(events.filter((e) => e.type === 'outer-close').length, 1, 'exactly one close ran after the steps');
  assert.equal(events.filter((e) => e.type === 'worker-round' && e.phase === 'fix').length, 0,
    'not a single fix-worker round was bought past the deadline');

  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt', 'the escalation names the same category the outcome does (F11)');
  assert.match(esc.detail, /needs_revision/, 'the detail states the verdict that STANDS — the grade is kept, never re-derived');
  assert.match(esc.detail, /stage "verdict"/, 'and which stage rendered it');
  // The denominator is GONE, deliberately (v1.46 §4): `capRuns` retired as this
  // loop's governor, so quoting "0 of 3" would state a bound that no longer decides
  // anything. What is spent is the fact; there is no longer a number it is "of".
  assert.match(esc.detail, /after 0 fix iteration/, 'and how much of the loop was actually spent');
  assert.doesNotMatch(esc.detail, /of \d+ fix iteration/, 'never a denominator that no longer governs');
  assert.match(esc.detail, /trend: unknown/, 'no stage reported a comparable number twice, and the honest reading says so rather than guessing a direction');
  assert.match(esc.options.join(' | '), /maxWallMs/, 'lever one: more time');
  assert.match(esc.options.join(' | '), /revise the goal/, 'lever two: a different goal — the trend is what tells the human which');
  assert.match(esc.options.join(' | '), /abandon/, 'lever three');
  assert.doesNotMatch(esc.decision, /transport|network|socket/i, 'never a socket to debug');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the run-level TIME record carries the clock\'s own numbers');
  assert.equal(wh.cutMidCall, false, 'read BETWEEN iterations, not inside a call (F64 is the other reading)');
  assert.equal(wh.phase, 'fix');
  assert.equal(wh.trend, 'unknown', 'the trend rides as a FIELD, not only as prose');
  assert.equal(wh.iterationsUsed, 0);
  assert.equal(wh.verdict, 'needs_revision');
  assert.equal(wh.requestedMs, 600_000);
});

test('W-2 CONTROL: with time still on the clock the fix loop iterates exactly as before — the check must cost the healthy run nothing', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const clk = fakeClock(); // never advanced: the wall is set and never reached
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },
    { text: 'fix attempt — writes nothing, so the close stays red' },
  ]);
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 2 });

  assert.equal(outcome, 'escalated', 'attempts spent with time and money left is the designed capability terminal');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 2,
    'both fix iterations ran and both were graded — the wall check fired zero times');
  assert.equal(events.filter((e) => e.type === 'worker-round' && e.phase === 'fix').length, 2, 'both fix workers were bought');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no time record on a run that never ran out of time');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1).category, 'cap-halt');
});

/**
 * The trend fixtures. IDENTICAL in every respect but one: what the single fix
 * attempt writes, and therefore whether the close it triggers reports the same
 * bytes as the grade before it. Same close, same plan, same clock, same call
 * positions — so a difference in the trend can only come from the gaps.
 *
 * Both closes below are deliberately NUMBERLESS to the trend instrument (no line
 * is marked `red`), which is the case the byte comparison exists for: it is the
 * FALLBACK inside `unknown`, never a verdict of its own.
 * @param {string} fixContent what the fix worker writes on its one attempt
 * @param {(wd: string) => void} [close] the close to install (default: byte-reporting)
 */
const trendRun = async (t, fixContent, close = byteReportingClose) => {
  const wd = makePatient(t);
  close(wd);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-after-one-fix',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
        { text: 'wrote it' },                                                                    // step greens; outer close reds → G0
        { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: fixContent })] },
        { text: 'fix attempt done' },                                                            // …and the wall passes HERE
      ][n - 1] ?? { text: 'never bought' };
      if (n === 6) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  return go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
};

/** A close that COUNTS what is still missing — the numeric shape every shipped
 * u-close has, and the one the trend instrument is built to read. Still stricter
 * than the `clean-run` check (which greens on "ok"), so the fix loop opens.
 * Declared HERE rather than beside its §4 users because the wall halt reads the
 * same instrument they do — one close shape, two sites, never two spellings.
 * @param {string} wd @param {string[]} markers */
const countingClose = (wd, markers = ['import', 'DONE']) => writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
const missing = ${JSON.stringify(markers)}.filter((k) => !t.includes(k));
if (missing.length === 0) process.exit(0);
console.log(\`FAILED red: \${missing.length} requirement(s) missing\`); process.exit(1);\n`);

test('W-2 UNIFIED (a): a wall halt whose close reported NUMBERS reads the per-stage trend — converging, where the byte instrument could only ever have said "it changed"', async (t) => {
  // The unification's whole point. The retired `gapTrend` compared two strings: it
  // could say the output moved, never which WAY. Here the same stop reads the close's
  // own falling count (2 → 1) and hands the human the lever that follows from a
  // direction, on the same evidence the money halt one branch over reads.
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-after-one-converging-fix',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok A\n' })] },
        { text: 'wrote it' },                                                                  // outer close: 2 missing
        { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok A B\n' })] },
        { text: 'fix attempt done' },                                                          // fix close: 1 missing
      ][n - 1] ?? { text: 'never bought' };
      if (n === 6) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
  assert.equal(outcome, 'wall-halt');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.trend, 'converging', 'the verdict stage fell — a DIRECTION, which no byte comparison can produce');
  assert.equal(wh.motion, null, 'motion is the fallback, and a fallback beside a real number is a second opinion nobody asked for');
  assert.equal(wh.iterationsUsed, 1);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  // F85: the series opens at 3, not at 2. The PRECHECK is first-red-wins and reds on
  // `clean-run` here, so it never reaches `verdict` at all — the stage's real seed is
  // the one the check PREFLIGHT rendered, and the run trend is now fed it. Pinned by
  // the precheck assertion below rather than asserted in prose: without it this
  // expectation could be updated to whatever the code happens to print.
  assert.equal(events.find((e) => e.type === 'close-precheck').stage, 'clean-run',
    'the precheck redded at an EARLIER stage, which is why `verdict` had no baseline before the preflight');
  assert.match(esc.detail, /verdict 3 → 2 → 1/, 'the series it judged is shown, from the seed on, so a human can check the instrument');
  assert.match(esc.detail, /top up|maxWallMs/i, 'converging work is what more allowance finishes');
});

test('W-2 UNIFIED: the wall reads the RUN\'s trend, not the fix loop\'s — the grade that existed BEFORE this leg\'s work is part of the chain', async (t) => {
  // The discriminating case for WHICH instance the wall reads. The fix loop's own
  // reader opens at the outer close and can never see the precheck; the run's reader
  // is fed by every grade the arbiter renders, precheck first ("the seed the work is
  // measured against"). Here the wall lands with ZERO fix iterations spent, so the
  // fix loop holds exactly one grade and could only say "unknown" — while the run
  // plainly went 2 → 1. Reading the loop's reader here would tell the human "I can't
  // tell" about a run that had visibly converged.
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  // the patient starts with a test that already satisfies `clean-run`, so the PRECHECK
  // reds on the same stage the outer close does — two readings of one axis
  writeFileSync(join(wd, 'tests', 'test_x.mjs'), 'ok A\n');
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-at-outer-close-with-numbers',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok A B\n' })] },
        { text: 'wrote it' },
      ][n - 1] ?? { text: 'a fix attempt that must never be bought' };
      if (n === 4) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
  assert.equal(outcome, 'wall-halt');
  assert.equal(events.find((e) => e.type === 'close-precheck').verdict, 'needs_revision',
    'the precheck really did render a grade — otherwise there is nothing for the two readers to disagree about');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.iterationsUsed, 0, 'zero fix iterations: the fix loop holds ONE grade and cannot make a trend out of it');
  assert.equal(wh.trend, 'converging', 'the RUN went 2 → 1 — the precheck is the baseline the step\'s work is measured against');
  assert.match(events.filter((e) => e.type === 'escalation').at(-1).detail, /verdict 2 → 1/,
    'and the series that says so is shown, the same one the money halt would show at this instant');
});

test('W-2 trend (c): with NO number anywhere, a fix attempt that MOVED the close reads unknown + something-changed — and its close ran to completion even though the wall passed mid-attempt', async (t) => {
  const { outcome, events } = await trendRun(t, 'ok and six more bytes\n');
  assert.equal(outcome, 'wall-halt');

  // the in-flight case, which falls out of WHERE the check sits rather than out of
  // a second mechanism: the deadline landed during fix attempt 1, that attempt's
  // close still ran and graded real pre-deadline work, and only THEN did the loop
  // stop. A close is never bounded — a wall that kills grading leaves the run
  // unreadable after the money is spent (F45).
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 1,
    'the expiring attempt was still graded; the SECOND iteration is the one that never started');
  assert.ok(events.some((e) => e.type === 'wall-bounded' && e.phase === 'fix'),
    'the wall did land inside that attempt — otherwise this proves nothing about the in-flight case');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.trend, 'unknown', 'no stage reported a comparable number, and motion is never promoted to a direction (F6)');
  assert.equal(wh.motion, 'changed', 'the old "moving" signal, preserved in substance and labelled as what it is');
  assert.equal(wh.iterationsUsed, 1);
  assert.match(events.filter((e) => e.type === 'escalation').at(-1).detail, /still changing/,
    'the tree was still moving under the close when time ran out — a reading, not a verdict');
});

test('W-2 trend (b): with NO number anywhere, a fix attempt that changed NOTHING the close can see reads unknown + nothing-changed — and points the human at the goal, not the clock', async (t) => {
  const { outcome, events } = await trendRun(t, 'ok\n'); // byte-identical to what step one wrote
  assert.equal(outcome, 'wall-halt');
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.trend, 'unknown', 'byte equality is evidence of no MOTION, which is not evidence of a direction');
  assert.equal(wh.motion, 'unchanged', 'the old "stalled" signal, preserved in substance');
  assert.equal(wh.iterationsUsed, 1);
  assert.match(events.filter((e) => e.type === 'escalation').at(-1).detail, /revise the goal\/spec/,
    'more time does not make an unreachable goal reachable — the frozen output is what points at the goal');
});

// ── W-2 at the STEP site. The fix loop's wall read has a sibling one layer up: a
// STEP that would BEGIN past the deadline. The variance meter cannot see that one —
// it measures a step's share against what the run had left when the step STARTED,
// and a step that started with nothing left has a time share of 0 forever, so the
// meter never fires and the step burns every attempt it is allowed. Each of those
// attempts is worthless by construction: the metered clock check stops the worker on
// its FIRST round so it writes nothing, and the judge still runs the step's exits —
// themselves close stages, at the full close timeout each — to re-mint the red
// already on the record. Same ruling as the fix loop's: when time is up, keep the
// grade we already have and stop.

/** the events emitted from the FIRST `step-start` onward — the step loop's own
 * record, separated from the close precheck's (which spawns the same check stages). */
const afterStepStart = (events) => {
  const i = events.findIndex((e) => e.type === 'step-start');
  assert.ok(i >= 0, 'a step opened — every assertion below is about what happened inside the step loop');
  return events.slice(i);
};

test('W-2 (step site): a step that would START past the deadline is never funded — zero attempts, zero rounds, zero exit checks', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-before-step-one',
    async generate() {
      n += 1;
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'a step attempt that must never be bought' };
      if (n === 2) clk.advance(700_000); // the plan is drafted, and the clock is spent
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });

  assert.equal(outcome, 'wall-halt', 'time ran out before the step could start — a governance stop, never a step-red');
  assert.equal(n, 2, 'not one provider call was bought past the deadline');
  const inStep = afterStepStart(events);
  assert.equal(inStep.filter((e) => e.type === 'worker-round').length, 0, 'zero rounds inside the step');
  assert.equal(inStep.filter((e) => e.type === 'exit-eval').length, 0,
    'the judge never ran: a step\'s exits are close stages, and re-grading an untouched tree with them is the cost this closes');
  assert.equal(inStep.filter((e) => e.type === 'check-run').length, 0, 'so no check stage was spawned either');
  assert.equal(inStep.filter((e) => e.type === 'iteration-start').length, 1,
    'exactly ONE attempt was opened and it was refused at its head — never capRuns of them');
  assert.equal(inStep.filter((e) => e.type === 'middle-done').length, 0, 'and that attempt never ran');
  assert.equal(events.filter((e) => e.type === 'outer-close').length, 0,
    'nor does the run mint a fresh full close past the deadline: the grade it has is the close precheck\'s');

  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt', 'the escalation names the same category the outcome does (F11)');
  assert.match(esc.options.join(' | '), /maxWallMs/, 'lever one: more time');
  assert.match(esc.options.join(' | '), /revise the goal/, 'lever two: a different goal');
  assert.doesNotMatch(esc.decision, /transport|network|socket/i, 'never a socket to debug');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the run-level TIME record carries the clock\'s own numbers');
  assert.equal(wh.cutMidCall, false,
    'read BETWEEN attempts with no call in flight — F64 is the other reading, and the job-end money floor keys on exactly this field');
  assert.equal(wh.phase, 'step:write-test');
  assert.equal(wh.stepsDone, 0);
  assert.equal(wh.stepsPlanned, 1);
  assert.equal(wh.attemptsUsed, 0);
  assert.equal(wh.requestedMs, 600_000);
});

test('W-2 (step site): the wall-halt record carries the LADDER state — never a count that no longer bounds anything here', async (t) => {
  // This record used to carry `capRuns` (the run's cap) alongside `stepAttemptCap`
  // (the step's tightening), named separately so one key could not carry two
  // meanings. Neither number bounds a step any more — the strike ladder does — and a
  // field whose name means something it no longer measures is worse than an absent
  // one, because a reader cannot tell it went stale. The fix site still writes
  // `capRuns` and still means it: that loop is still counted.
  //
  // The plan still declares `attempts: 1` on purpose: it is the shape that USED to
  // change this record, so a stale reading would show up here first.
  const wd = makePatient(t);
  const clk = fakeClock();
  const tightened = PLAN(wd, [{
    id: 'write-test', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 4,
    attempts: 1, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }],
  }]);
  let n = 0;
  const provider = {
    name: 'wall-before-tightened-step',
    async generate() {
      n += 1;
      const scripted = [{ text: 'scout' }, { text: tightened }][n - 1] ?? { text: 'never bought' };
      if (n === 2) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
  assert.equal(outcome, 'wall-halt');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.phase, 'step:write-test', 'the STEP site wrote this record — the fix site is the other one');
  assert.equal(wh.strikes, 0, 'the ladder was governing this step, so the ladder state is what the record states');
  assert.equal(wh.strikeLimit, 2);
  assert.equal(wh.distinctGaps, 0, 'the step was refused at its head, so it judged nothing');
  assert.equal(wh.capRuns, undefined, 'the close-fix cap never bounded this step and no longer claims to');
  assert.equal(wh.stepAttemptCap, undefined, 'and the tightening it named bounds nothing either — the field is inert');
});

test('W-2 (step site) CONTROL: a step ALREADY RUNNING when the wall passes keeps its old behaviour — the attempt finishes, the judge runs, and the METER is what stops it', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  // The replanned plan KEEPS check-passes(clean-run): Rule B (check-shed) refuses a
  // redraft that drops an inherited check, and this test's subject is the WALL, not
  // the shed — the step is refused at the deadline before its exits ever run.
  const replanned = PLAN(wd, [{
    id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4,
    target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  }]);
  let n = 0;
  const provider = {
    name: 'wall-during-step-one',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
        { text: 'attempt 1 done' },   // …and the wall passes HERE, with the step under way
        { text: replanned },
      ][n - 1] ?? { text: 'never bought' };
      if (n === 4) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });

  // scoped to the FIRST step — the step that was already running when the wall
  // passed. What the run does AFTER the replan is the other test's subject.
  const stepOne = afterStepStart(events).slice(0, afterStepStart(events).findIndex((e) => e.type === 'replan'));
  assert.equal(stepOne.filter((e) => e.type === 'middle-done').length, 1,
    'the in-flight attempt ran to completion — the wall never cuts work already under way');
  assert.equal(stepOne.filter((e) => e.type === 'exit-eval').length, 1, 'and its judge ran: grading real work always completes (F45)');

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, 'the METER is the instrument for a step that was already running — it sees the whole remaining time gone');
  assert.equal(variance.axis, 'time');
  assert.equal(variance.timeShare, 1);
  assert.equal(variance.iteration, 2, 'stopped at the HEAD of attempt 2, so attempt 1\'s work is not discarded');
  assert.equal(events.filter((e) => e.type === 'escalation')[0].category, 'step-variance',
    'a running step is stopped by the meter exactly as before — never by the step-site wall check');
  const replan = events.find((e) => e.type === 'replan');
  assert.ok(replan, 'and it still routes to the ONE replan rather than to a stop');
  assert.equal(replan.trigger, 'step-variance');

  // The TAIL is the fix above, not this control: the REPLANNED plan's first step is
  // the one that would begin past the deadline, and that is the step the run refuses.
  assert.equal(outcome, 'wall-halt');
  assert.equal(events.filter((e) => e.type === 'wall-halt').at(-1).phase, 'step:second-go');
});

test('SCOUT casualty: a transport death on the survey call ends the run as provider-red BEFORE a plan is ever drafted', async (t) => {
  const wd = makePatient(t);
  const provider = dyingAt([{ text: 'never reached' }], 0);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'plan-validate').length, 0, 'the run ended before any plan was validated');
  assert.equal(events.filter((e) => e.type === 'plan-accepted').length, 0);
  assert.ok(events.some((e) => e.type === 'scout-start'), 'the scout had started — the casualty is attributed to the phase that died');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.equal(esc.phase, 'scout');
  assert.equal(esc.lib, 'bare-agent', 'the typed lib field is stamped at the throw site, never sniffed from prose');
});

// ---- W4: ONE close staging, shared by the prompt, the validator and the runner ----

test('W4: an object-form predicate close is STAGED once — the drafter, the validator and the runner see the same one-stage menu, at the same close cost as the equivalent single-stage list', async (t) => {
  // Before the hoist there were TWO derivations: planPrompt and validatePlan
  // called checkMenu on the RAW spec (an object is not an array → empty menu),
  // while runPlan called it on the SYNTHESIZED [{name:'close',…}]. So the runner
  // announced and preflighted a stage the drafter was never offered and the
  // validator would have redded check-unknown — and it ran the close command a
  // second time for a ruler nobody could reference.
  const run = async (close) => {
    const wd = makePatient(t);
    // a COUNTING close: it appends one line per execution, so the number of times
    // the operator's command actually ran is on disk, not inferred from events
    writeFileSync(join(wd, 'close.mjs'), `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
appendFileSync(new URL('./close-runs.log', import.meta.url), 'run\\n');
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('suite: 1 passed'); process.exit(0); }
console.log('FAILED tests/test_x.mjs — file missing or has no ok assertion'); process.exit(1);\n`);
    const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
      id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'close' }],
    }] });
    const provider = scriptedProvider([
      { text: 'scout' }, { text: plan },
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
      { text: 'wrote it' },
    ]);
    const { outcome, events } = await go(wd, provider, { job: JOB(wd, { close }) });
    const log = join(wd, 'close-runs.log');
    const runs = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0;
    return { outcome, events, runs };
  };

  const obj = await run({ type: 'predicate', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' });
  assert.equal(obj.outcome, 'green', 'the plan referenced the staged stage by name and the run completed');
  assert.deepEqual(obj.events.find((e) => e.type === 'check-menu').offered, ['close']);
  assert.deepEqual(obj.events.filter((e) => e.type === 'check-preflight').map((e) => e.name), ['close']);
  assert.equal(obj.events.filter((e) => e.type === 'close-precheck').length, 1, 'the precheck is one close judgment, not two');
  assert.ok(obj.events.some((e) => e.type === 'check-run' && e.name === 'close'),
    'the step actually referenced the staged stage as its ruler — without that the menu claim is decoration');

  // parity: the object form is EXACTLY the one-stage list it stands for, so its
  // close command must execute the same number of times — no extra run for an
  // unreferenceable ruler, and no silently skipped preflight either
  const arr = await run([{ name: 'close', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }]);
  assert.equal(arr.outcome, 'green');
  assert.equal(obj.runs, arr.runs,
    `the object form must cost exactly what its staged equivalent costs (object ${obj.runs} vs list ${arr.runs})`);
  assert.deepEqual(
    obj.events.filter((e) => ['check-menu', 'check-preflight', 'check-run'].includes(e.type)),
    arr.events.filter((e) => ['check-menu', 'check-preflight', 'check-run'].includes(e.type)),
    'and the two shapes produce the same menu/preflight/check record',
  );
});

test('W3: the incoherent narrowed-scope plan is rejected at the VALIDATION gate on the shipped path — it never reaches the worker to burn attempts on refusals', async (t) => {
  // The defect this closes, end to end: `scope` narrows the step's gate to
  // tests/**, `target` names src/mod.mjs — each half legal against the SIGNED
  // fence, so the plan used to validate green and every write the step made was
  // then denied by the narrowed gate, burning its attempts with no red anywhere.
  // Run against the runner's OWN derived scope menu, not a hand-passed one.
  const wd = makePatient(t);
  const job = JOB(wd, { writeScope: ['tests/**', 'src/**'] });
  const bad = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-test', action: 'Edit the module.',
    tools: ['write'], rounds: 6, target: 'src/mod.mjs', scope: 'tests/**',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }],
  }] });
  const provider = scriptedProvider([{ text: 'scout' }, { text: bad }, { text: bad }]);
  const { outcome, events } = await go(wd, provider, { job });
  assert.equal(outcome, 'plan-red');
  const red = events.filter((e) => e.type === 'plan-red').find((e) => e.path === 'steps.0.target');
  assert.equal(red?.code, 'step-scope-escape', `got ${JSON.stringify(events.filter((e) => e.type === 'plan-red'))}`);
  assert.match(red.detail ?? '', /tests\/\*\*/, 'the gap names the step\'s own narrowed scope so the redraft can aim');
  assert.equal(events.filter((e) => e.type === 'step-start').length, 0, 'no step ever ran — the burn is what this closes');
});

// ── Layer 3 module 3: MECHANICAL START — the bridge as the drafter's starting
// draft (design record 2026-08-01, D3/D4/D5 + the D2-SPLIT addendum).
//
// The probe (scripts/reuse-exec-probe.mjs) proved the mechanism by INJECTING at
// the provider seam; this graduates it into the shipped path. What the tests hold:
//  - D2 (split): the load gate runs AT THE DOOR — before the close precheck, before
//    the scout, before any token. A refusal is the `recipe-stale` terminal, never a
//    crash and never an automatic silent fall-back to cold drafting.
//  - D4: the bridge is a STARTING DRAFT — appended to the SAME drafting prompt, judged
//    by the SAME validator. No second, looser path exists for an inherited plan.
//  - D5: the one-replan ceiling is untouched, and a REPLAN draft never re-injects the
//    bridge — it drafts from the run's own state (the probe's own rule, kept).
//  - the COLD path is byte-identical when no bridge is passed (the F47 "works both
//    ways" lesson): no marker in the prompt, and no new event on the spine.

/** the recipe's plan: same SHAPE, and its paths are the OTHER repository's — instance-bound
 * fields are EXPECTED to be wrong here, which is the whole D2-split finding */
const BRIDGE_PLAN = {
  schema: 'plan-v1',
  steps: [{
    id: 'write-the-missing-test', action: 'Write the missing test file, as the recipe did on the other repository.',
    tools: ['write'], rounds: 6, target: 'spec/other_spec.mjs',
    exit: [{ type: 'tree-changed', scope: 'spec/**' }],
  }],
};
/** an OLDER version of the same recipe — `versions` is oldest-first, so this one must NOT
 * be the plan that reaches the prompt */
const BRIDGE_PLAN_OLD = { schema: 'plan-v1', steps: [{ id: 'stale-first-cut', action: 'the superseded first cut', tools: ['write'], rounds: 4, target: 'spec/old_spec.mjs', exit: [{ type: 'tree-changed', scope: 'spec/**' }] }] };
const greenRow = (runid, patient) => ({ at: '2026-07-30T00:00:00Z', runid, patient, outcome: 'green', failingStage: null, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 40 });
const version = (plan, runid, patient) => ({ plan, runid, greenAt: '2026-07-30T00:00:00Z', patient, costUsd: 2.21, wallMs: 534_000, rounds: 40 });
const BRIDGE = (over = {}) => ({
  schema: 'bridge-v1',
  name: 'plan-patient-suite',
  goal: 'Write the missing test so the suite greens.',
  specHash: null,
  closeStageNames: ['clean-run', 'verdict'],
  toolsUsed: ['write'],
  versions: [version(BRIDGE_PLAN_OLD, 'ms-older', 'other-repo'), version(BRIDGE_PLAN, 'ms-newest', 'third-repo')],
  history: [greenRow('ms-older', 'other-repo'), greenRow('ms-newest', 'third-repo')],
  ...over,
});
const MARKER = 'YOUR STARTING DRAFT';

test('planPrompt COLD is byte-identical with the starting-draft argument absent, null, or undefined (the F47 works-both-ways pin)', () => {
  const wd = '/tmp/does-not-matter';
  const job = JOB(wd);
  const args = [job, 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 }];
  const cold = planPrompt(...args);
  assert.equal(planPrompt(...args, null), cold, 'an explicit null is the cold render');
  assert.equal(planPrompt(...args, undefined), cold, 'and so is an explicit undefined');
  assert.ok(!cold.includes(MARKER), 'no mechanical-start marker exists on the cold path');
});

test('planPrompt with a starting draft: the cold prompt is intact as a PREFIX, plus the verbatim framing and the plan pretty-printed', () => {
  const wd = '/tmp/does-not-matter';
  const job = JOB(wd);
  const args = [job, 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 }];
  const cold = planPrompt(...args);
  const warm = planPrompt(...args, BRIDGE_PLAN);
  assert.ok(warm.startsWith(cold), 'the shipped prompt is unchanged and the block is ADDITIVE — never surgery on its interior');
  // the framing is the pre-probe's arm C, the language the draft read was measured on
  assert.match(warm, /YOUR STARTING DRAFT — begin from the plan below and tweak it\./);
  assert.match(warm, /Take it\nas your starting draft rather than starting from a blank page: keep what carries over, change what\nthis repository needs\./);
  assert.match(warm, /Everything you submit must be legal for THIS job as described above/);
  // the stage count is TRUE for THIS job (two stages), never the probe job's hardcoded four
  assert.match(warm, /the same two close stages/);
  assert.ok(warm.includes(JSON.stringify(BRIDGE_PLAN, null, 2)), 'the plan rides pretty-printed, exactly as the probe handed it over');
});

test('planPrompt keeps the reds appendix LAST: a redraft is still told to fix its reds after the starting draft', () => {
  const wd = '/tmp/does-not-matter';
  const job = JOB(wd);
  const reds = [{ code: 'invalid-value', path: 'steps.0.scope' }];
  const warm = planPrompt(job, 'scout', reds, 40, null, undefined, { balanceUsd: 1.5 }, BRIDGE_PLAN);
  assert.ok(warm.indexOf(MARKER) < warm.indexOf('Your previous plan was REJECTED'),
    'the block lands BEFORE the reds instruction — the probe recorded the opposite ordering as its own known wart');
  assert.ok(warm.trimEnd().endsWith('Output ONLY the corrected JSON object.'), 'the last word to a redrafting planner is still the validator\'s');
});

test('a bridge that PASSES the load gate becomes the drafter\'s starting draft; bridge-loaded names the NEWEST version', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider, { bridge: BRIDGE() });
  assert.equal(outcome, 'green');
  const loaded = events.find((e) => e.type === 'bridge-loaded');
  assert.ok(loaded, `bridge-loaded is on the spine — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(loaded.name, 'plan-patient-suite');
  assert.equal(loaded.versions, 2);
  assert.equal(loaded.runid, 'ms-newest', 'the NEWEST version is the one that inherits (versions are oldest-first)');
  assert.ok(!events.some((e) => e.type === 'bridge-gate'), 'a passing gate is recorded as the load, not as a refusal');

  const draft = provider.calls[1];
  assert.ok(draft.includes(MARKER), 'the DRAFT prompt carries the mechanical start');
  assert.ok(draft.includes(JSON.stringify(BRIDGE_PLAN, null, 2)), 'and it carries the newest version\'s plan');
  assert.ok(!draft.includes(JSON.stringify(BRIDGE_PLAN_OLD, null, 2)), 'never the superseded one');
  assert.ok(!provider.calls[0].includes(MARKER), 'the SCOUT is untouched — the bridge is a drafting material, not a worker\'s');
  for (const p of provider.calls.slice(2)) assert.ok(!p.includes(MARKER), 'and no step worker ever sees it');
});

test('the tweaked draft passes the SAME validator — no second, looser path exists for an inherited plan (D4)', async (t) => {
  const wd = makePatient(t);
  // the drafter hands back the recipe UNCHANGED: its `spec/**` scope is outside this
  // job's signed fence, so the shipped validator must red it exactly as it would a cold draft
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: JSON.stringify(BRIDGE_PLAN) },
    { text: JSON.stringify(BRIDGE_PLAN) },
  ]);
  const { outcome, events } = await go(wd, provider, { bridge: BRIDGE() });
  assert.equal(outcome, 'plan-red', 'an inherited plan that does not fit THIS job is rejected like any other');
  assert.ok(events.some((e) => e.type === 'plan-red'), 'and the reds are on the spine');
  assert.ok(provider.calls[2].includes(MARKER), 'the arm HOLDS across a validator-rejected redraft — one red must not silently convert the run to cold');
});

test('D5: a REPLAN draft never re-injects the bridge — it drafts from the run\'s own state, and the one-replan ceiling is untouched', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'thinking about it' },   // attempt 1: no write
    { text: 'still thinking' },      // attempt 2: no write → cap → replan
    { text: PLAN(wd, [{
      id: 'write-test-2', action: 'Actually write tests/test_x.mjs now.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }]) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 2, bridge: BRIDGE() });
  assert.equal(outcome, 'green');
  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'exactly one replan — reuse buys no extra revision allowance');
  const replanDraft = provider.calls[4];
  assert.ok(replanDraft.includes('What happened when the previous plan ran:'), 'this IS the replan draft');
  assert.ok(!replanDraft.includes(MARKER), 'and it carries NO starting draft — the run\'s own state is the material now');
  assert.equal(events.filter((e) => e.type === 'bridge-loaded').length, 1, 'the bridge is loaded once, at the door');
});

test('a bridge that FAILS the load gate is the recipe-stale terminal: zero tokens, no close precheck, never a crash', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }]);
  // same job, a recipe that inspects something else — the D2-split gate's stage-kind check
  const { outcome, events } = await go(wd, provider, { bridge: BRIDGE({ closeStageNames: ['typecheck', 'suite-green'] }) });
  assert.equal(outcome, 'recipe-stale');
  assert.equal(provider.calls.length, 0, 'refused at the door — not one token was spent');
  assert.ok(!events.some((e) => e.type === 'close-precheck'), 'and not one close stage was run either');
  assert.ok(!events.some((e) => e.type === 'scout-start'));
  const gate = events.find((e) => e.type === 'bridge-gate');
  assert.ok(gate, `bridge-gate is on the spine — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(gate.outcome, 'recipe-stale');
  assert.equal(gate.name, 'plan-patient-suite');
  assert.equal(gate.reds[0].code, 'recipe-stale');
  assert.match(gate.reds[0].path, /closeStageNames/);
  assert.ok(!events.some((e) => e.type === 'bridge-loaded'));
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc?.category, 'recipe-stale');
  assert.equal(esc.decisionReady, true, 'cold drafting is the CALLER\'s decision — never an automatic silent fall-back');
  assert.ok(esc.options.some((o) => /cold/i.test(o)), `the cold option is offered by name: ${JSON.stringify(esc?.options)}`);
});

test('a MALFORMED bridge is refused at the same door, by its own reds — never a throw on the way to reading its plan', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }]);
  for (const bad of [BRIDGE({ versions: [], history: [] }), BRIDGE({ schema: 'bridge-v2' }), { not: 'a bridge' }, 'nonsense']) {
    const { outcome, events } = await go(wd, provider, { bridge: bad });
    assert.equal(outcome, 'recipe-stale', `refused: ${JSON.stringify(bad).slice(0, 60)}`);
    assert.ok(events.find((e) => e.type === 'bridge-gate')?.reds.length > 0, 'the reds say WHY, they are never an empty refusal');
    assert.equal(provider.calls.length, 0);
  }
});

test('COLD path unchanged: with no bridge opt, no bridge event fires and the drafting prompt carries no starting draft', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  assert.ok(!events.some((e) => e.type === 'bridge-loaded' || e.type === 'bridge-gate'), 'no bridge event exists on a cold run');
  for (const p of provider.calls) assert.ok(!p.includes(MARKER), 'and nothing anywhere carries a starting draft');
});

// ── BA-19 / F72 park D: the TOTAL-duration deadline at the provider seam.
//
// BA-18's `timeoutMs` bounds socket INACTIVITY only, so a call that trickles bytes
// forever is invisible to it (F66: 274 minutes inside one call, the bound correctly
// passed). BA-19 adds an absolute ceiling. Wiring it raises exactly one question this
// repo has already answered once, on the other bound: when it trips, is that the
// operator's own governance number binding, or a dead socket? F64's answer is the
// clock, not the error code — and these three tests hold both halves of it.

/** bare-agent's BA-19 rejection shape (`provider-http.js` applyRequestDeadline):
 * a DIFFERENT code from the idle bound's, no category, and terminal */
const deadlineError = () => Object.assign(new Error('[AnthropicProvider] request exceeded its total deadline of 600000ms'), { code: 'EDEADLINE', retryable: false, context: { bound: 'deadline' } });

test('BA-19: a wall-derived DEADLINE trip is a wall-halt, not a provider-red — the run set that ceiling from its own remaining time, so the trip is governance (F64, on the new bound)', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'deadline-trip',
    async generate() {
      n += 1;
      // the worker's first round: the call outlives the wall and bare-agent's
      // TOTAL-duration timer — the one this run armed — destroys the request
      if (n === 3) { clk.advance(700_000); throw deadlineError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'wall-halt', 'a deadline this run derived is the run running out of time — never a casualty');
  const cats = events.filter((e) => e.type === 'escalation').map((e) => e.category);
  assert.ok(cats.includes('wall-halt'), `the escalation names the same category the outcome does — saw ${cats.join(', ')}`);
  assert.ok(!cats.includes('provider-red'), 'nothing on the spine may call the operator\'s own ceiling a transport failure');
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the clock\'s numbers reach the spine, exactly as on the idle bound');
  assert.equal(wh.cutMidCall, true, 'the deadline landed INSIDE a call — that is the whole reason this bound exists');
  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'wall-halt');
  assert.match(esc.options.join(' '), /maxWallMs/, 'the lever is raise-the-cap, not retry-the-provider');
});

test('BA-19 control: a DEADLINE trip with wall time REMAINING stays a provider-red — the discriminator is the clock, never the code, so a deadline this run did not derive is still transport (F64\'s pre-registered must-not-change control)', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'foreign-deadline',
    async generate() {
      n += 1;
      // identical rejection, identical call position; the clock is NOT expired, so
      // this ceiling cannot have come from the wall (a provider constructed with its
      // own deadlineMs, say) and the row is a casualty like any other
      if (n === 3) { clk.advance(1_000); throw deadlineError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no wall-halt record on a run that never ran out of time');
});

test('BA-19 wiring: every provider call carries a deadlineMs derived from the wall REMAINING at that call — and an unbounded run carries none at all (the knob is absent, not 0 and not a default)', async (t) => {
  // The blind-instrument guard on this whole module: a `deadlineMs` computed and never
  // handed to the provider is F50 in a new coat ("wired ≠ the code exists"). bare-agent
  // forwards loop.run's options straight into provider.generate (loop.js:732), so the
  // observable is the third argument.
  /** @param {any[]} seen */
  const capturing = (seen) => {
    let n = 0;
    return {
      name: 'capture-options',
      async generate(_messages, _tools, options) {
        n += 1;
        seen.push(options ?? {});
        const scripted = [{ text: 'scout' }, { text: PLAN(_wd) }][n - 1] ?? { text: 'done' };
        return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
      },
    };
  };
  let _wd = makePatient(t);
  /** @type {any[]} */
  const bounded = [];
  const clk = fakeClock();
  await go(_wd, capturing(bounded), { job: JOB(_wd, { maxWallMs: 600_000 }), now: clk.now });
  assert.ok(bounded.length >= 2, 'the scout and the drafter both went through the seam');
  for (const o of bounded) {
    assert.equal(typeof o.deadlineMs, 'number', 'a bounded run arms the total-duration ceiling on every call');
    assert.equal(o.deadlineMs, 600_000, 'and the number is the wall\'s remainder read at call time (this fake clock never advances, so it is the full wall)');
    assert.ok(o.deadlineMs >= o.timeoutMs, 'the idle bound trips first on a SILENT socket; only a live-but-never-finishing stream reaches the deadline (bare-agent provider-http.js:92)');
  }

  _wd = makePatient(t);
  /** @type {any[]} */
  const unbounded = [];
  await go(_wd, capturing(unbounded), { now: fakeClock().now }); // JOB() sets no maxWallMs
  assert.ok(unbounded.length >= 2);
  for (const o of unbounded) {
    assert.ok(!('deadlineMs' in o), 'an operator who set no wall gets NO ceiling — omitted entirely, so nothing downstream can read a default into it (F45)');
    assert.equal(typeof o.timeoutMs, 'number', 'the idle bound is unchanged: BA-18 still bounds a hang with no run budget');
  }
});

// ── RESUME, step level (module C v2) ────────────────────────────────────────
//
// hamr's ruling, verbatim: *"even if it gets killed by outside, it should allow resume
// and start last step instead from the beginning, why would i want to waste more money
// on something i already started, our goal is to find ways to save money and time"*.
//
// So the seed is the finest checkpoint the dead run's own spine can PROVE: the plan it
// accepted and the steps that reached their exits. Nothing here re-pays for a paid unit —
// not the scout, not the draft, not a finished step — and nothing here is inferred: a
// skipped step says so on the spine, with the event it relies on.

/** the two-step plan the resume fixtures reload: one step per fenced directory */
const TWO_STEP = (wd) => ({
  schema: 'plan-v1',
  steps: [
    { id: 'seed-src', action: 'Write src/a.mjs.', tools: ['write'], rounds: 4, target: 'src/a.mjs', exit: [{ type: 'artifact-written', path: 'src/a.mjs' }] },
    { id: 'write-test', action: 'Write tests/test_x.mjs with an ok assertion.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] },
  ],
});
/** the job those steps are fenced by — both directories writable */
const TWO_STEP_JOB = (wd) => JOB(wd, { writeScope: ['src/**', 'tests/**'] });

test('resume seed: the accepted plan is RELOADED — no scout, no draft — and the step that already finished is SKIPPED with the evidence it rests on', async (t) => {
  const wd = makePatient(t);
  const plan = TWO_STEP(wd);
  // the only calls this run may make are the REMAINING step's: a scout call or a draft
  // call would consume the first entry and the assertions below would catch it
  const provider = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    resumeSeed: { phase: 'steps', plan, completedSteps: [{ id: 'seed-src', seq: 42, by: 'step-end' }] },
  });

  assert.equal(outcome, 'green');
  assert.equal(provider.calls.length, 2, `only the remaining step was paid for: ${provider.calls.join(' | ').slice(0, 200)}`);
  assert.ok(!events.some((e) => e.type === 'scout-start'), 'the scout is not re-paid');
  assert.ok(events.some((e) => e.type === 'scout-skipped'), 'and its absence is a RECORD, never silence');
  assert.ok(!events.some((e) => e.type === 'plan-validate' && String(e.phase).startsWith('draft')), 'the draft is not re-paid');
  assert.ok(events.some((e) => e.type === 'plan-accepted' && e.phase === 'resume'), 'the reloaded plan is this leg\'s plan-as-executed — R1 reads it back off the spine');

  const skipped = events.filter((e) => e.type === 'step-skipped');
  assert.deepEqual(skipped.map((e) => e.step), ['seed-src']);
  assert.equal(skipped[0].provenSeq, 42, 'the skip names the event that proves it');
  assert.ok(!events.some((e) => e.type === 'step-start' && e.step === 'seed-src'), 'never a fake step-start for a step that did not run');
  assert.ok(!events.some((e) => e.type === 'step-end' && e.step === 'seed-src'), 'and never a fake step-end either');
  assert.ok(events.some((e) => e.type === 'step-start' && e.step === 'write-test'), 'the in-flight step DOES run, fresh');
  const exec = events.find((e) => e.type === 'plan-executed');
  assert.deepEqual(exec.steps, [{ id: 'seed-src', outcome: 'skipped' }, { id: 'write-test', outcome: 'green' }],
    'the plan-as-executed record tells skipped from run — a reader can never mistake one for the other');
  assert.equal(existsSync(join(wd, 'src', 'a.mjs')), false, 'the skipped step is genuinely not re-run');
});

test('resume seed at the CLOSE: every step is skipped and the run goes straight to the close, which re-runs and opens its fix loop', async (t) => {
  const wd = makePatient(t);
  const plan = TWO_STEP(wd);
  const provider = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'fixed' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    resumeSeed: {
      phase: 'close',
      plan,
      completedSteps: [{ id: 'seed-src', seq: 10, by: 'step-end' }, { id: 'write-test', seq: 20, by: 'step-end' }],
    },
  });

  assert.equal(outcome, 'green');
  assert.equal(provider.calls.length, 2, 'the only worker paid for is the fix loop\'s');
  assert.ok(!events.some((e) => e.type === 'scout-start'));
  assert.ok(!events.some((e) => e.type === 'step-start'), 'no step is re-run — the steps were done when the kill landed');
  assert.deepEqual(events.filter((e) => e.type === 'step-skipped').map((e) => e.step), ['seed-src', 'write-test']);
  assert.ok(events.some((e) => e.type === 'outer-close'), 'the close re-runs — it is a command, stateless and free of tokens');
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'and the fix loop continues under the folded remainder');
});

test('resume seed: a stored plan that no longer VALIDATES is refused by name — an invalid plan is never run', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'must never be called' }]);
  const stale = {
    schema: 'plan-v1',
    // `run` has never been in the menu and the signed spec does not grant it: a plan
    // carrying it is the registry/schema-drift case
    steps: [{ id: 'x', action: 'Do it.', tools: ['run'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs' }] }],
  };
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    resumeSeed: { phase: 'steps', plan: stale, completedSteps: [] },
  });

  assert.equal(outcome, 'plan-red');
  assert.equal(provider.calls.length, 0, 'nothing was spent on a plan that cannot legally run');
  const named = events.find((e) => e.type === 'resume-plan-red');
  assert.ok(named, `the refusal is its own record: ${events.map((e) => e.type).join(' ')}`);
  assert.ok(named.reds.length > 0, 'and it carries the reds that refused it');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'plan-red', 'the escalation and the outcome agree (F11)');
  assert.match(esc.decision, /resum/i, 'and the decision says this is the RESUMED plan, not a fresh draft the model got wrong');
  assert.ok(!events.some((e) => e.type === 'step-start'));
});

test('resume seed: a REPLAN after a resume clears the skip set — the new plan\'s steps are not the dead plan\'s steps', async (t) => {
  const wd = makePatient(t);
  const plan = TWO_STEP(wd);
  const replanned = JSON.stringify({
    schema: 'plan-v1',
    steps: [
      { id: 'seed-src', action: 'Write src/a.mjs (same id, NEW plan).', tools: ['write'], rounds: 4, target: 'src/a.mjs', exit: [{ type: 'artifact-written', path: 'src/a.mjs' }] },
      { id: 'second-go', action: 'Write the test properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] },
    ],
  });
  const provider = scriptedProvider([
    { text: 'attempt 1 — writes nothing' },          // resumed step 2, attempt 1 → exit red
    { text: 'attempt 2 — writes nothing' },          // attempt 2 → exhausted, funds left
    { text: replanned },                              // the ONE replan draft
    { toolCalls: [tcall('a', 'shell_write', { path: join(wd, 'src', 'a.mjs'), content: 'export const a = 1;\n' })] },
    { text: 'wrote src/a.mjs' },
    { toolCalls: [tcall('b', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote the test' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    capRuns: 2,
    resumeSeed: { phase: 'steps', plan, completedSteps: [{ id: 'seed-src', seq: 7, by: 'step-end' }] },
  });

  assert.equal(outcome, 'green');
  assert.ok(events.some((e) => e.type === 'replan'), 'the resumed step exhausted its attempts with funds left, so the one replan fired');
  assert.deepEqual(events.filter((e) => e.type === 'step-skipped').map((e) => e.step), ['seed-src'],
    'exactly ONE skip: the dead plan\'s completed step. The new plan re-uses that id and must NOT inherit its green');
  const startsAfterReplan = events.slice(events.findIndex((e) => e.type === 'replan')).filter((e) => e.type === 'step-start');
  assert.deepEqual(startsAfterReplan.map((e) => e.step), ['seed-src', 'second-go'],
    'every step of the new plan runs — a skip set that survived the replan would silently skip work nobody did');
  assert.equal(existsSync(join(wd, 'src', 'a.mjs')), true);
});

test('resume seed: a completed step that does not line up with the reloaded plan is RUN, never skipped on a mismatched id', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { toolCalls: [tcall('a', 'shell_write', { path: join(wd, 'src', 'a.mjs'), content: 'export const a = 1;\n' })] },
    { text: 'wrote src/a.mjs' },
    { toolCalls: [tcall('b', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'wrote the test' },
  ]);
  const { outcome, events } = await go(wd, provider, {
    job: TWO_STEP_JOB(wd),
    // a seed naming a step this plan does not have at that position: the skip is a PREFIX
    // match on ids, never a count, so it stops rather than skipping whatever sits there
    resumeSeed: { phase: 'steps', plan: TWO_STEP(wd), completedSteps: [{ id: 'a-step-from-another-plan', seq: 3, by: 'step-end' }] },
  });

  assert.equal(outcome, 'green');
  assert.deepEqual(events.filter((e) => e.type === 'step-skipped').map((e) => e.step), [], 'nothing is skipped on an id that does not match');
  assert.deepEqual(events.filter((e) => e.type === 'step-start').map((e) => e.step), ['seed-src', 'write-test'], 'both steps run — re-doing work is the safe direction, skipping work nobody did is not');
  const seedRec = events.find((e) => e.type === 'resume-seed');
  assert.equal(seedRec.skipping, 0);
  assert.match(seedRec.divergence, /line up/, 'and the divergence is on the record, never a silent discard');
});

// ── THE STEP LADDER (design 2026-08-03). The step loop's exhaustion rule was a
// FIXED COUNT (`capRuns`, 4 in the operator's runner) and it demonstrably cut
// converging work: u-msd916dh went 30 → 22 → 17 → 11 scope errors and was stopped
// with $1.30 and ~6 minutes unspent. It is replaced by a PROGRESS rule — a strike
// per red iteration that repeats a gap or writes nothing, two strikes ends the
// step — with money, wall, variance and the stall fuse keeping every bit of their
// current authority.

/** a patient whose close/check output MOVES with the tree: it counts TODO markers
 * and reports the count, the way a real `tsc` reports an error count. The fixed
 * `FAILED …` line of `makePatient` cannot express a trajectory at all, so a
 * converging run there is inexpressible — the fixture has to be able to show the
 * thing under test. */
function makeConvergingPatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-ladder-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  mkdirSync(join(wd, 'tests'));
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (!existsSync(p)) { console.log('FAILED: tests/test_x.mjs is missing'); process.exit(1); }
const n = (readFileSync(p, 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('suite: clean'); process.exit(0); }
console.log(\`FAILED: \${n} error(s) remain\`); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), probe);
  writeFileSync(join(wd, 'check.mjs'), probe);
  return wd;
}

/** like makeConvergingPatient, but the check's red line NAMES a file — the
 * mismatch-note tests point it at a file the worker does or does not write */
function makeMismatchPatient(t, gapPath) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-mismatch-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  mkdirSync(join(wd, 'tests'));
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (!existsSync(p)) { console.log('FAILED: tests/test_x.mjs is missing'); process.exit(1); }
const n = (readFileSync(p, 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('suite: clean'); process.exit(0); }
console.log(\`FAILED: \${n} error(s) remain in ${gapPath}\`); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), probe);
  writeFileSync(join(wd, 'check.mjs'), probe);
  return wd;
}

const LADDER_PLAN = (wd, over = {}) => PLAN(wd, [{
  id: 'shrink-errors', action: 'Remove the TODO markers from tests/test_x.mjs.',
  tools: ['write'], rounds: 4, target: 'tests/test_x.mjs',
  exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  ...over,
}]);

/** one script entry pair per step iteration: a write, then the attempt's summary
 * round. `scriptedProvider` sticks on the last entry, so once the list runs out the
 * worker writes nothing more — which is itself a strike, so nothing can hang. */
const iterWrites = (wd, contents) => contents.flatMap((content, i) => [
  { toolCalls: [tcall(`w${i}`, 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content })] },
  { text: `attempt ${i + 1} done` },
]);

/** the step's own iterations — the close precheck and the fix loop emit the same
 * event type, so the window has to be cut at the step boundaries */
const stepIterations = (events) => {
  const a = events.findIndex((e) => e.type === 'step-start');
  const b = events.findIndex((e) => e.type === 'step-end');
  assert.ok(a >= 0, 'a step opened');
  return events.slice(a, b === -1 ? undefined : b).filter((e) => e.type === 'iteration-start');
};

test('LADDER (a) CONVERGING: a step whose gap moves every iteration is NEVER struck out — it runs past the old fixed count and greens', async (t) => {
  const wd = makeConvergingPatient(t);
  // 5 iterations. The old rule (capRuns) would have cut this at 4 with the error
  // count still falling — the exact shape of u-msd916dh.
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO TODO TODO\n', 'TODO TODO TODO\n', 'TODO TODO\n', 'TODO\n', 'clean\n']),
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });

  assert.equal(outcome, 'green');
  assert.equal(stepIterations(events).length, 5,
    'five iterations under a fixed count of four — the count is no longer what bounds a step');
  const reads = events.filter((e) => e.type === 'ladder');
  assert.equal(reads.length, 4, 'one reading per RED iteration; the green one is never read');
  assert.deepEqual(reads.map((e) => e.strike), [false, false, false, false], 'nothing struck: every gap moved and every iteration wrote');
  assert.deepEqual(reads.map((e) => e.wrote), [true, true, true, true]);
  assert.equal(reads.at(-1).distinctGaps, 4);
  assert.equal(events.filter((e) => e.type === 'cap-halt').length, 0,
    'and the gate never halted it either — the per-iteration turn allowance floats with the ladder');
});

test('LADDER (b) OSCILLATION A→B→A→B: the repeat strikes, and the second repeat ends the step', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    // 3 errors → 1 → 3 → 1: iterations 3 and 4 are gaps already seen. A last-only
    // comparison reads every one of these as progress (the gap differs from the one
    // before it every single time) — only a seen-set catches the cycle.
    ...iterWrites(wd, ['TODO TODO TODO\n', 'TODO\n', 'TODO TODO TODO\n', 'TODO\n']),
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'the replanned step writes nothing either' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });

  const reads = events.filter((e) => e.type === 'ladder');
  assert.deepEqual(reads.slice(0, 4).map((e) => e.strike), [false, false, true, true],
    'the oscillation is caught the moment a gap comes BACK, not when it merely repeats the last one');
  assert.deepEqual(reads.slice(0, 4).map((e) => e.wrote), [true, true, true, true],
    'the worker was writing the whole time — the repeat alone did this (the OR is an OR)');
  assert.equal(reads[2].repeatOf, 1, 'and the record names the iteration the gap was first seen at');
  assert.equal(reads[3].repeatOf, 2);
  assert.equal(stepIterations(events).length, 4, 'two strikes ended it');
  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'and the routing is unchanged: exactly one replan');
  assert.match(outcome, /^step-red:/);
});

test('LADDER (c) IDLE: a worker that writes nothing strikes out in two iterations, whatever the fixed count says', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    { text: 'thinking about it' },   // iteration 1: text only
    { text: 'still thinking' },      // iteration 2: text only → two strikes
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'the replanned step is idle too' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });

  assert.equal(stepIterations(events).length, 2,
    'STRIKE_LIMIT bounds it at two, NOT the fixed count of four — an idle worker is not bought three more times');
  const reads = events.filter((e) => e.type === 'ladder').slice(0, 2); // the FIRST step's; the replanned one has its own
  assert.deepEqual(reads.map((e) => [e.wrote, e.strike]), [[false, true], [false, true]]);
  assert.equal(reads[0].repeatOf, null, 'the first gap was novel — it struck on the WRITE signal alone');
  assert.equal(reads[1].strikes, 2);
  assert.equal(events.filter((e) => e.type === 'replan').length, 1);
  assert.match(outcome, /^step-red:/);
});

test('LADDER: the strike-out escalation stays category cap-halt (downstream counts categories) but says STRIKES, never "N/N runs spent"', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    { text: 'writes nothing' },
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'nor does the replanned one' },
  ]);
  const { events } = await go(wd, provider, { capRuns: 4 });
  const esc = events.filter((e) => e.type === 'escalation' && e.category === 'cap-halt');
  assert.ok(esc.length >= 1, 'the category is unchanged — a renamed category is counted as an unclassified escalation downstream');
  assert.match(esc[0].decision, /strike/i, 'the copy names the real trigger');
  assert.doesNotMatch(esc[0].decision, /runs spent/, 'the fixed-count sentence is a lie about what stopped it');
  assert.equal(esc[0].spend.strikeLimit, 2);
  assert.equal(esc[0].spend.strikes, 2);
  const halt = events.filter((e) => e.type === 'cap-halt').at(0);
  assert.equal(halt.strikes, 2);
  assert.equal(halt.strikeLimit, 2);
  assert.equal(halt.capRuns, undefined, 'a step ladder halt never carries a number that no longer bounds it');
});

test('LADDER: the replan brief names the SHAPE that ended the step, its evidence, and what was left on the table', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    // the same content three times: the gap is byte-identical, so iterations 2 and 3
    // are both repeats and the worker wrote on every one of them
    ...iterWrites(wd, ['TODO TODO\n', 'TODO TODO\n', 'TODO TODO\n']),
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'nothing' },
  ]);
  await go(wd, provider, { capRuns: 4, job: JOB(wd, { maxWallMs: 600_000 }) });

  const replanPrompt = provider.calls.find((c) => c.includes('What happened when the previous plan ran'));
  assert.ok(replanPrompt, 'the replan drafted');
  assert.match(replanPrompt, /repeated itself/, 'WHICH shape ended the step');
  assert.match(replanPrompt, /iteration 3 had already been seen at iteration 1/, 'and the evidence for it');
  assert.match(replanPrompt, /1 distinct exit output\(s\) over 3 iteration\(s\)/, 'the gap trajectory, as a fact');
  assert.doesNotMatch(replanPrompt, /stalled/, 'the worker wrote every iteration — the brief must not also claim it stalled');
  assert.doesNotMatch(replanPrompt, /It ran \d+ attempts/, 'the old sentence described a bound that no longer exists');
  assert.match(replanPrompt, /\$\d+\.\d\d and \d+ minute\(s\) of the run were still unspent/,
    'and what the step left on the table — the money and the time a raised count would have bought');
});

test('LADDER: with NO wall set the brief reports the time left as unbounded — never 0 minutes (F6 extends to time)', async (t) => {
  const wd = makeConvergingPatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO\n', 'TODO TODO\n', 'TODO TODO\n']),
    { text: LADDER_PLAN(wd, { id: 'second-go' }) },
    { text: 'nothing' },
  ]);
  await go(wd, provider, { capRuns: 4 }); // the JOB fixture sets no maxWallMs
  const replanPrompt = provider.calls.find((c) => c.includes('What happened when the previous plan ran'));
  assert.match(replanPrompt, /time UNBOUNDED/, 'an unknown/unbounded duration is reported as such, never rendered as a number');
  assert.doesNotMatch(replanPrompt, /0 minute\(s\) of the run were still unspent/);
});

// ---- the prose-prohibition trap (u-msdpuaej, 2026-08-03) ----------------------
// A drafter wrote "Do not modify any file outside src/loop.js" into a step whose
// exit check judges the WHOLE goal; the worker obeyed the prose and ground to
// death against errors in a file it was told to leave alone. Two fixes: the
// planPrompt law (a step must be free to edit everything its check can report),
// and a mechanical line in the replan brief naming the gap-files the step never
// wrote (gap paths vs the F32 write audit — the F38 mechanical genre).

test('planPrompt states the exit-freedom law: a step must be free to edit every file its check can report — forbidding files the exit judges is the u-msdpuaej death', () => {
  const p = planPrompt(JOB('/tmp/x'), 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 });
  assert.match(p, /free to edit every file the check can report/i);
  assert.match(p, /never\s+write an action that forbids/i);
});

test('LADDER (e) WALL beats progress: an expired clock ends a CONVERGING ladder — the governance stops keep every bit of their authority', async (t) => {
  const wd = makeConvergingPatient(t);
  const clk = fakeClock();
  let n = 0;
  const script = [
    { text: 'scout' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO TODO\n', 'TODO TODO\n', 'TODO\n', 'clean\n']),
  ];
  // the replan's draft, once the meter stops the (still converging) first step
  script.splice(6, 0, { text: LADDER_PLAN(wd, { id: 'second-go' }) });
  const provider = {
    name: 'wall-mid-convergence',
    async generate() {
      n += 1;
      const s = script[n - 1] ?? { text: 'never bought' };
      // the clock is spent right after iteration 2's summary round, with the error
      // count still falling — progress is real and the clock wins anyway
      if (n === 6) clk.advance(700_000);
      return { text: s.text ?? '', toolCalls: s.toolCalls ?? [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 4 });

  assert.equal(outcome, 'wall-halt', 'time ran out — progress does not buy time the operator did not sign');
  const reads = events.filter((e) => e.type === 'ladder');
  assert.deepEqual(reads.map((e) => e.strike), [false, false],
    'the ladder struck NOTHING: every gap moved and every iteration wrote — the clock alone stopped this run');
  assert.equal(stepIterations(events).length, 3,
    'iteration 3 opened and was refused at its head — the ladder never got to say whether it should continue');
  assert.equal(events.filter((e) => e.type === 'escalation')[0].category, 'step-variance',
    'a step ALREADY RUNNING when the deadline passes is stopped by the meter, exactly as before');

  // …and the replanned step, which would BEGIN past the deadline, is never funded:
  // the step-site W-2 check, whose record now carries the ladder's state
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.phase, 'step:second-go');
  assert.equal(wh.cutMidCall, false, 'read between attempts with no call in flight');
  assert.equal(wh.strikes, 0, 'the record carries the state that was actually governing the ladder');
  assert.equal(wh.strikeLimit, 2);
  assert.equal(wh.distinctGaps, 0, 'a step refused at its head has judged nothing — zero is the true reading here');
  assert.equal(wh.capRuns, undefined, 'never a field name meaning something it no longer measures');
  assert.equal(wh.stepAttemptCap, undefined);
});


// ─── the shape-lottery gate rules, WIRED (2026-08-04): preflight verdicts →
// Rule A-v2 at every draft gate; the accepted plan's checks → Rule B at the
// replan gate. The $0 sweep: seed-red-check-on-early-step has 0 honest greens
// ever; the one-wide-closing-step shape greens 7/7. Rules are mechanical
// (recorded verdicts + predecessor exits), never an LLM assessing "small". ───

test('Rule A-v2 WIRED: a draft putting the seed-red check on an EARLY write step reds check-placement, the law rides the prompt, the redraft greens', async (t) => {
  const wd = makePatient(t);
  const badPlan = PLAN(wd, [
    {
      id: 'prep-helper', action: 'Write tests/helper.mjs with shared fixtures.',
      tools: ['write'], rounds: 4, target: 'tests/helper.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    },
    {
      id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    },
  ]);
  const provider = scriptedProvider([
    { text: 'src/mod.mjs exports x; tests/ is empty.' },   // scout
    { text: badPlan },                                     // draft 1 — the death shape
    { text: PLAN(wd) },                                    // redraft — the RLM shape
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote tests/test_x.mjs' },
  ]);
  const { outcome, events } = await go(wd, provider);
  const v1 = events.find((e) => e.type === 'plan-validate' && e.phase === 'draft-1');
  assert.equal(v1?.ok, false, 'the death shape is refused at the gate');
  assert.ok(v1.reds.some((r) => r.code === 'check-placement'), `expected check-placement, got ${JSON.stringify(v1.reds)}`);
  assert.equal(events.find((e) => e.type === 'plan-validate' && e.phase === 'draft-2')?.ok, true);
  assert.equal(outcome, 'green', 'the redraft self-heals into the winning shape and the run greens');
  // the law is STATED, not just enforced (mailbox precedent: gate + prompt) —
  // and it names the seed-red check, which only the preflight wiring can know
  const draftPrompt = provider.calls.find((c) => c.includes('DRAFT-PLAN'));
  assert.ok(draftPrompt, 'a draft prompt exists');
  assert.match(draftPrompt, /FINAL write step/i);
  assert.match(draftPrompt, /"clean-run"/);
});

test('Rule B WIRED: a replan that sheds the inherited check is refused check-shed — a form-only redraft cannot fake a green (u-msdsmkid mechanism b)', async (t) => {
  const wd = makeMismatchPatient(t, 'tests/test_x.mjs');
  const shedPlan = LADDER_PLAN(wd, { id: 'second-go', exit: [{ type: 'tree-changed', scope: 'tests/**' }] });
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: LADDER_PLAN(wd) },
    ...iterWrites(wd, ['TODO TODO\n', 'TODO TODO\n', 'TODO TODO\n']),
    { text: shedPlan },   // replan draft 1 — sheds check-passes(clean-run)
    { text: shedPlan },   // redraft — sheds again (sticks)
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 4 });
  const r1 = events.find((e) => e.type === 'plan-validate' && e.phase === 'replan-1');
  assert.equal(r1?.ok, false, 'the shed redraft is refused at the gate');
  assert.ok(r1.reds.some((r) => r.code === 'check-shed'), `expected check-shed, got ${JSON.stringify(r1.reds)}`);
  assert.equal(outcome, 'plan-red', 'two shed drafts exhaust the redraft — the run stops honestly instead of greening on form');
  const replanPrompt = provider.calls.find((c) => c.includes('What happened when the previous plan ran'));
  assert.ok(replanPrompt, 'the replan drafted');
  assert.match(replanPrompt, /previous plan carried/i, 'Rule B is stated to the replanner, not just enforced');
});

// ══ PRD v1.46 §2 + §4 — the money halt gets the W-2 treatment, and the
// close-fix loop's fixed count retires for the same progress rule ═════════════
//
// §2: a money cut keeps the verdict it already minted and pauses DECISION-READY
// with a trend the human can act on. The accuracy law is PER STAGE (src/trend.js)
// — never across axes, never model prose, and "can't tell" when there is no
// number (F6). The library reports; it never adjusts a budget (hard line).
//
// §4: `capRuns` retires as the fix loop's GOVERNOR. The replacement is the same
// 2-strike no-progress rule the step ladder runs, read off the close's own graded
// numbers. Money and the wall keep every bit of their authority. Replay-validated
// at $0 over all 8 archived fix loops: 0 greens harmed, 1 waste case caught.

/** one fix iteration: the write, then the attempt summary @param {string} wd */
const fixWrite = (wd, content, tag) => [
  { toolCalls: [tcall(tag, 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content })] },
  { text: `fix ${tag}` },
];

test('§4 the close-fix loop is governed by PROGRESS, not the count: a converging close iterates PAST capRuns and greens', async (t) => {
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok A\n', 't1'),          // the STEP: clean-run greens, close reds at 2 missing
    ...fixWrite(wd, 'ok A B\n', 't2'),        // fix 1 → 1 missing   (improved)
    ...fixWrite(wd, 'ok A B extra\n', 't3'),  // fix 2 → 1 missing   (flat, strike 1)
    ...fixWrite(wd, 'ok A B C\n', 't4'),      // fix 3 → GREEN
  ]);
  // capRuns 2 is the RETIRED number: under the old bound fix 3 was never bought.
  const { outcome, events } = await go(wd, provider, { capRuns: 2 });
  assert.equal(outcome, 'green', 'the converging fix loop was allowed to finish — the count no longer governs');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 3,
    'three fix iterations ran under a retired cap of two');
});

test('§4 two consecutive fix grades with NO stage improving ends the loop — under the SAME cap-halt taxonomy the count used', async (t) => {
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B']);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok A\n', 't1'),        // step greens; close reds at 1 missing
    ...fixWrite(wd, 'ok A x\n', 't2'),      // fix 1 → still 1 missing (strike 1)
    ...fixWrite(wd, 'ok A y\n', 't3'),      // fix 2 → still 1 missing (strike 2 → out)
    ...fixWrite(wd, 'ok A B\n', 't4'),      // never bought
  ]);
  // capRuns 9 so the retired count cannot possibly be what stopped it
  const { outcome, events } = await go(wd, provider, { capRuns: 9 });
  assert.equal(outcome, 'escalated', 'the designed "close still red" terminal, unchanged');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 2,
    'exactly two fix iterations: the run stopped when it ran out of IDEAS, not out of money');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt', 'ONE exhaustion terminal, two triggers — only the trigger changed, never the taxonomy');
  assert.match(esc.decision, /2\/2 strike|no progress|stopped making progress/i, 'the decision names the progress rule that fired');
  assert.doesNotMatch(esc.options.join(' | '), /replan/i, 'there is no planner at the close — never offer a lever that does not exist here');
  const reads = events.filter((e) => e.type === 'ladder' && e.governor === 'close-trend');
  assert.equal(reads.length, 2, 'both fix readings are on the spine under their own governor name');
  assert.deepEqual(reads.map((r) => r.improved), [false, false]);
});

test('§4 BLIND CONTROL: a close the trend cannot read keeps the retired count as its bound — never unbounded, never a strike out of ignorance', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd); // its red output carries no count at all
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok but no module use\n', 't1'),
    { text: 'fix attempt — writes nothing' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 3 });
  assert.equal(outcome, 'escalated');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 3,
    'exactly capRuns iterations — the blind fallback is the count it replaced, byte for byte');
  const reads = events.filter((e) => e.type === 'ladder' && e.governor === 'close-trend');
  assert.ok(reads.every((r) => r.comparable === false), 'no reading was comparable, so no reading struck');
});

test('§2 a fix loop cut by a DRAINED wallet emits a decision-ready money-halt: the kept verdict, a per-stage trend, and hamr\'s three levers', async (t) => {
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  // The drain is targeted at the RUN'S OWN STATE — the fix loop has opened AND has
  // graded one attempt — never at a raw `close-verdict` count, which the STEP loop's
  // own micro-loop also emits and which therefore fires long before the fix loop
  // exists (the call-count trigger that silently retargets).
  let fixOpen = false;
  let fixGrades = 0;
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok A\n', 't1'),      // step greens; close reds at 2 missing
    ...fixWrite(wd, 'ok A B\n', 't2'),    // fix 1 → 1 missing (converging), and the wallet drains
    { text: 'never bought' },
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'fix-loop') fixOpen = true;
    if (fixOpen && type === 'close-verdict') fixGrades += 1;
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit: emit2, capRuns: 9,
    remainingUsd: () => (fixGrades >= 1 ? 0.0001 : 1.5),
  });
  assert.equal(outcome, 'cap-halt', 'a money cut is never a capability read — it is the resume-to-cap checkpoint');

  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh, 'the run-level MONEY record exists, exactly as W-2 gave TIME one');
  assert.equal(mh.phase, 'fix');
  assert.equal(mh.verdict, 'needs_revision', 'the verdict already minted is KEPT, never discarded and never re-derived');
  assert.equal(mh.stage, 'verdict', 'and which stage rendered it');
  assert.equal(mh.trend, 'converging', 'the close went 2 → 1 on its own stage: a top-up likely finishes it');
  assert.match(mh.reading, /2 → 1/, 'the reading shows the series it judged, so the human can check the instrument');
  assert.equal(mh.budgetUsd, 1.5);
  assert.match(mh.options.join(' | '), /top up|budgetUsd/i, 'lever one: more money');
  assert.match(mh.options.join(' | '), /revise the goal/i, 'lever two: a different goal — the trend says which');
  assert.match(mh.options.join(' | '), /abandon/i, 'lever three');
  assert.ok(mh.options.every((o) => !/self|automatic/i.test(o)), 'the library reports; it never adjusts a budget');
});

test('§2 CAN\'T TELL: a money cut on a close with no extractable number says so rather than inventing a direction (F6)', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd); // no count in its output, ever
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok but no module use\n', 't1'),
    { text: 'fix attempt' },
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  let fixOpen = false;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'fix-loop') fixOpen = true;
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd: () => (fixOpen ? 0.0001 : 1.5) });
  assert.equal(outcome, 'cap-halt');
  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh, 'the money record still lands — an unknown trend is a reading, not a reason to stay silent');
  assert.equal(mh.trend, 'unknown', 'never "flat": recommending a goal rewrite on no evidence is F6 in a verdict\'s coat');
  assert.match(mh.reading, /unknown|nothing the instrument can compare/i);
});

test('§2 a STEP-loop money cut gets the same record — the readout is symmetric to wall-halt at every site that emits one', async (t) => {
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
  const remainingUsd = () => (++calls <= 2 ? 1.5 : 0.0001);
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd });
  assert.equal(outcome, 'cap-halt');
  const mh = events.filter((e) => e.type === 'money-halt').at(-1);
  assert.ok(mh, 'the step loop\'s money cut is decision-ready too');
  // the STEP site must be the emitter — without this pin, an extra remainingUsd()
  // call added anywhere upstream would silently retarget the cut to the scout/plan
  // site and this test would keep passing while testing nothing (review F2; the
  // call-counting trigger stays, but the run's own state names the site)
  assert.equal(mh.phase, 'step:write-test');
  assert.match(mh.options.join(' | '), /top up|budgetUsd/i);
  assert.equal(typeof mh.trend, 'string');
});

test('§2 the money-halt says whether the SPEND behind it is exact — an unknown-floor run\'s "remaining" is a floor too (F6)', async (t) => {
  // The record states `remainingUsd` to four decimals. That figure is `budget − spent`,
  // so a run whose spend is a FLOOR (a self-healed stall, a mid-call cut, a resumed leg
  // inheriting an unpriced predecessor) has a remaining that is a CEILING — and stating
  // it bare reads as exact. `emitWallHalt` has always carried its honest bound; this is
  // the same duty on the money side. The four causes live in `runJob`'s ledger, so the
  // record reads THAT state rather than deriving a second, weaker answer of its own.
  const run = async (/** @type {(() => boolean)|undefined} */ spendComplete) => {
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
    const outcome = await runPlan(jv.job, {
      workdir: wd, provider, emit, capRuns: 3,
      remainingUsd: () => (++calls <= 2 ? 1.5 : 0.0001),
      ...(spendComplete ? { spendComplete } : {}),
    });
    assert.equal(outcome, 'cap-halt');
    return events.filter((e) => e.type === 'money-halt').at(-1);
  };
  assert.equal((await run(() => false)).spendComplete, false,
    'a floor spend makes the remaining a bound, and the record says so instead of quoting it as the number');
  assert.equal((await run(() => true)).spendComplete, true, 'and an exact run keeps its exact figure — the honest direction points both ways');
  assert.equal((await run(undefined)).spendComplete, true, 'the field is always present, so no consumer branches on presence');
});

test('§2 CONTROL: a run that never runs out of money emits NO money-halt record — the readout costs the healthy run nothing', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    ...fixWrite(wd, 'ok — asserts x\n', 't1'),
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  assert.equal(events.filter((e) => e.type === 'money-halt').length, 0);
});

// ── F86: the REPLANNER is handed the close's own last output ───────────────────
//
// u-mshcpdg4 is the whole reason this section exists. The run reached ONE
// remaining strict error and died anyway. The close said exactly where it was:
//
//   BAREAGENT red: tsc --strict reports 1 error(s) in src/recurse.js, src/loop.js
//   BAREAGENT | src/recurse.js(978,115): error TS2322: …
//
// The worker saw that every attempt. The REPLANNER — the thing that chooses
// which files the next plan targets — was told only "close trend so far: still
// progressing — typecheck 30 → 15 → 15 → 1". Converging, and silent about WHERE.
// It re-targeted src/loop.js, which was already at zero errors; that step wrote
// nothing, struck out twice, and the run ended with $1.10 and 82 seconds unspent.
//
// The fix hands the gap over as TEXT and nothing else. NOT a parsed file list:
// line 1 of that very gap names every file in SCOPE, only line 2 names the
// culprit, and no regex can tell a summary line from a detail line — the shapes
// differ per close anyway (tsc file:line, pytest test ids, a count close naming
// no file at all). A model reading the artifact can. That is the whole design.

/**
 * A counting patient whose close renders the SHIPPED two-line shape: a summary
 * line naming every file in scope, plus an optional detail line naming the one
 * location actually failing. `makeCountingPatient`'s close emits one line and one
 * file, so it cannot reproduce the summary-vs-detail split that killed u-mshcpdg4.
 * F71: `process.exitCode`, never `process.exit()`.
 * @param {any} t @param {{seed?: number, summary: string, detail?: string|null}} shape
 */
function makeGapShapePatient(t, { seed = 30, summary, detail = null }) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-gapshape-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'recurse.js'), todos(seed));
  // the SECOND in-scope file, clean from the start — the one u-mshcpdg4's
  // replanner re-targeted. Its presence is what makes the summary line honest.
  writeFileSync(join(wd, 'src', 'loop.js'), 'export const y = 2;\n');
  writeFileSync(join(wd, 'count.mjs'), `import { readFileSync } from 'node:fs';
const n = (readFileSync(new URL('./src/recurse.js', import.meta.url), 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('clean'); } else {
  console.log(${JSON.stringify(summary)}.replace('{n}', String(n)));
  ${detail ? `console.log(${JSON.stringify(detail)});` : ''}
  process.exitCode = 1;
}
`);
  return wd;
}

/** the real u-mshcpdg4 detail line, verbatim */
const MSHCPDG4_DETAIL = "| src/recurse.js(978,115): error TS2322: Type 'string | null | undefined' is not assignable to type 'string | null'.";

const GAP_JOB = (wd, over = {}) => ({
  schema: 'job-v1',
  job: 'gap-shape-patient',
  description: 'the u-mshcpdg4 close shape: a summary line over a detail line',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Make src/recurse.js and src/loop.js pass the typecheck stage.',
  verdictType: 'green',
  // both lines survive the gap bound (F28) — a keep pattern that dropped the
  // detail line would hide the very fact this section is about
  close: [{ name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^(red|\\|)' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const GAP_PLAN = (steps) => JSON.stringify({
  schema: 'plan-v1',
  steps: steps ?? [{
    id: 'shrink-errors', action: 'Remove TODO markers from src/recurse.js.',
    tools: ['write'], rounds: 6, target: 'src/recurse.js',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }],
  }],
});

/** one worker attempt against the gap-shape patient */
const gapAttempt = (wd, id, body) => [
  { text: `attempt ${id}`, toolCalls: [tcall(id, 'shell_write', { path: join(wd, 'src', 'recurse.js'), content: body })] },
  { text: `attempt ${id} done` },
];

test('F86 unit: closeGapBlock carries the gap VERBATIM, labelled as the step\'s own exit results', () => {
  const gap = 'check "typecheck" red: close stage "typecheck" failed:\nBAREAGENT red: tsc --strict reports 1 error(s) in src/recurse.js, src/loop.js\nBAREAGENT ' + MSHCPDG4_DETAIL + '\nBAREAGENT judged=1\n';
  const block = closeGapBlock(gap);
  assert.ok(block.includes(gap.trim()), 'every byte of the gap reaches the planner — not a summary, not a parse');
  // this assertion used to read `/verification/` and to call the block the close's own
  // output. That was the accuracy defect, not the fix: the block is the join of every
  // failing EXIT detail, so on a step that wrote nothing it leads with the evaluator's
  // own `tree-changed` prose. What must still hold is that it is labelled as the
  // instruments' output rather than as the run's narration of the stop.
  assert.match(block, /exits reported/i, 'labelled as the step\'s exit results, not as the run\'s narration');
  // the same carry for a close that names no file at all — a count close is not a
  // second format to handle, it is the same artifact handed over unchanged
  assert.ok(closeGapBlock('red: unit=0 tests executed, below the seed\'s 12').includes('unit=0 tests executed'),
    'a count close\'s own words survive too — nothing here is tsc-shaped');
});

test('F86 unit CONTROL: no gap → the empty string, so the brief is byte-identical to the pre-F86 one', () => {
  assert.equal(closeGapBlock(undefined), '');
  assert.equal(closeGapBlock(null), '');
  assert.equal(closeGapBlock(''), '');
  assert.equal(closeGapBlock('   \n  '), '', 'whitespace is not an output — an empty block invents a section that says nothing');
});

// Strictly a NEGATIVE control: it passes before this change (there was no block)
// and after it (the block is the gap, and the gap named nothing). That is the
// point — it is the assertion that would catch a parsed file list being
// manufactured, which is the trap this whole design avoids.
test('F86 unit CONTROL: a gap that names NO file invents nothing — no path, no file list, no guess', () => {
  const block = closeGapBlock('red: unit=0 tests executed, below the seed\'s 12');
  assert.doesNotMatch(block, /[\w.-]+\/[\w.-]+/, 'nothing path-shaped is manufactured out of a gap that named no file');
});

test('F86 unit: an ALREADY-BOUNDED gap passes through VERBATIM — the second envelope must not re-trim what the first deliberately rescued', () => {
  // The real shape, not a synthetic one: `runClose` bounds the stage output with the
  // stage's own `gapKeep` (both shipped closes cap at 120 red lines), and `evalExits`
  // wraps THAT in `check "<name>" red: …`. So what reaches this helper has already
  // survived one envelope built to preserve the failing NAMES — the mechanical gap
  // F46's conversion mechanism feeds the worker. A second 400/1500 envelope over it
  // deletes exactly those names again (F28 reintroduced), and src/exits.js states the
  // rule in the same words for the same artifact one seam earlier.
  const errs = Array.from({ length: 120 }, (_, i) => `FAILED tests/test_x.py::case_${String(i).padStart(3, '0')} - AssertionError`);
  const raw = ['red: 120 test(s) now fail', ...errs, 'judged=1'].join('\n');
  const inner = boundGap(raw, '^(FAILED|red)');
  const rescued = errs.filter((e) => inner.includes(e));
  assert.ok(rescued.length > 50, `the first envelope really did rescue a block of names (${rescued.length}) — otherwise this test guards nothing`);

  // and the WORST case runClose can hand over still fits under the backstop, or the
  // shipped path would start being re-bounded again without anything saying so (the
  // blind-instrument class: a headroom claim nothing measures is a claim that rots the
  // day boundGap's own caps move)
  const worst = boundGap(Array.from({ length: 5000 }, (_, i) => `FAILED case_${i} ${'x'.repeat(180)}`).join('\n'), '^FAILED');
  const treeChanged = '0 files changed under src/** — the tree is byte-identical to the step start (an identical re-write is not a change)';
  assert.ok(`${treeChanged}\ncheck "suite-green" red: ${worst}`.length < CHECK_GAP_MAX,
    `the largest gap the close path can produce, joined with its paired exit, still passes VERBATIM: ${worst.length} against a ${CHECK_GAP_MAX} backstop`);

  const block = closeGapBlock(`check "suite-green" red: close stage "suite-green" failed:\n${inner}`);
  const dropped = rescued.filter((e) => !block.includes(e));
  assert.deepEqual(dropped, [],
    'every name the close\'s own bound chose to keep reaches the replanner — a second envelope over a bounded artifact is a fidelity loss with an announcement on it, not a bound');
});

test('F86 unit: an over-long gap is CAPPED and every trim is ANNOUNCED (F28: silent truncation is the disease)', () => {
  // 120 red lines of 200 chars: past boundGap's envelope AND past the keep
  // block's 50-line cap, so BOTH announcements must appear.
  const gap = Array.from({ length: 120 }, (_, i) => `red: error ${i} ${'x'.repeat(190)}`).join('\n');
  const block = closeGapBlock(gap);
  assert.ok(block.length < gap.length, `capped: ${block.length} < ${gap.length}`);
  assert.match(block, /chars truncated/, 'the elision announces itself');
  assert.match(block, new RegExp(GAP_KEEP_TRIM_MARKER), 'and so does the keep-block cap — a cure that truncates silently is the disease');
  assert.match(block, /red: error 0 /, 'the RED lines survive the truncation (gapKeep), which is the point of reusing the bound');
});

test('F86 unit: the backstop sits on exits.js\'s OWN ceiling — under it verbatim, over it bounded, and the number is not respelled here', () => {
  // Both arms are built FROM the shared constant rather than from a literal 12000: a
  // hardcoded copy is a second answer to "how big may a check gap be", and the two
  // seams would drift on exactly the property that matters. The pair also pins that
  // the backstop is neither dead (over the line must still bound) nor an envelope
  // (under it must not touch a byte).
  const line = (/** @type {number} */ i) => `FAILED tests/test_x.py::case_${String(i).padStart(4, '0')} - AssertionError`;
  const build = (/** @type {number} */ target) => {
    let s = '';
    for (let i = 0; s.length <= target; i += 1) s += `${line(i)}\n`;
    return s;
  };
  const under = build(CHECK_GAP_MAX - 200).slice(0, CHECK_GAP_MAX - 100);
  assert.ok(under.length < CHECK_GAP_MAX && under.length > 2000,
    'the under arm is well past boundGap\'s own 2000-char envelope, or it would pass through for the wrong reason');
  assert.ok(closeGapBlock(under).includes(under), 'under the ceiling: every byte, untouched');

  const over = build(CHECK_GAP_MAX * 2);
  const block = closeGapBlock(over);
  assert.ok(block.length < over.length, `over it the backstop still binds: ${block.length} < ${over.length}`);
  assert.match(block, /chars truncated/, 'and says so — a backstop that trimmed silently would be F28 wearing a smaller number');
});

test('F86 unit: the LABEL names the step\'s EXITS, because that is what the block carries — the close\'s output is one of them, not all of it', () => {
  // `res.gap` is `lastGap`: the join of EVERY failing exit's detail, in exit order.
  // With MAX_EXITS_PER_STEP=2 and the mandatory `tree-changed` pairing on a write
  // step, a step that wrote nothing produces exactly this — the evaluator's own
  // prose first, the close's output second. Captured verbatim from a real replan
  // prompt. The payload is right (a replanner very much wants "the step wrote
  // nothing"); it was the LABEL that claimed a single source for it.
  const treeChanged = '0 files changed under src/** — the tree is byte-identical to the step start (an identical re-write is not a change)';
  const checkRed = 'check "typecheck" red: close stage "typecheck" failed:\nBAREAGENT red: tsc --strict reports 1 error(s) in src/recurse.js';
  const block = closeGapBlock([treeChanged, checkRed].join('\n'));

  assert.match(block, /exits?\b/i, 'the label names what is actually under it: this step\'s exit results');
  assert.doesNotMatch(block.split('\n')[1] ?? '', /its own output/,
    'and does not attribute the whole block to the verification — the first line under that claim was ours, not the close\'s');
  assert.match(block, /verbatim/, 'still verbatim: the artifact is handed over as TEXT, and the label must keep saying so (F86)');
  assert.ok(block.includes(treeChanged) && block.includes(checkRed),
    'both details survive — this fixes an accuracy claim, never the payload the replanner needs');
});

test('F86 unit: a secret-shaped string is masked BEFORE the prompt — one inventory, not a second spelling', () => {
  const secret = `sk-${'a'.repeat(30)}`;
  const block = closeGapBlock(`red: auth failed with ${secret} in src/mod.mjs`);
  assert.ok(!block.includes(secret), 'the literal never reaches the prompt');
  assert.deepEqual(scanSecrets(block), [], 'and the ONE inventory agrees it is clean');
});

test('F86: the replan brief carries the close\'s own last output — the u-mshcpdg4 regression', async (t) => {
  const wd = makeGapShapePatient(t, {
    seed: 30,
    summary: 'red: tsc --strict reports {n} error(s) in src/recurse.js, src/loop.js',
    detail: MSHCPDG4_DETAIL,
  });
  const job = GAP_JOB(wd);
  const { events, provider } = await countRun(wd, [
    { text: 'scout' }, { text: GAP_PLAN() },
    ...gapAttempt(wd, '1', todos(15)),
    ...gapAttempt(wd, '2', todos(1)),
    { text: GAP_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/recurse.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...gapAttempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { job });

  assert.ok(events.find((e) => e.type === 'replan'), `the meter must route to a replan — events: ${events.map((e) => e.type).join(' ')}`);
  const brief = provider.calls.find((c) => c.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  // THE regression: the ONE remaining error's location reaches the planner.
  assert.match(brief, /src\/recurse\.js\(978,115\)/,
    'the replanner is told WHERE the remaining work is — u-mshcpdg4 was told only that it was converging, and re-targeted the clean file');
  assert.match(brief, /reports 1 error\(s\) in src\/recurse\.js, src\/loop\.js/,
    'and the summary line rides along verbatim — the planner reads the artifact, the runner does not pre-digest it');
  // …and NOTHING sits beside it telling the planner which file to pick. On this
  // exact gap the deleted never-wrote line resolved to `src/loop.js` — the file
  // that was already CLEAN — because loop.js appears only in the SUMMARY line and
  // the worker had been writing recurse.js. Two readers of one question, the
  // parsed one wrong and phrased as a directive, next to the artifact that says
  // the opposite. Deleted (hamr, 2026-08-05); this assertion is what keeps any
  // future digest from being reintroduced beside the verbatim block.
  assert.doesNotMatch(brief, /never wrote/,
    'the runner hands over the close\'s words and no parsed file claim of its own — a regex cannot tell a summary line from a detail line');
});

test('F86 CONTROL: a gap that names no file leaves the brief naming no file — before and after', async (t) => {
  const wd = makeGapShapePatient(t, { seed: 30, summary: 'red: {n} fault(s) remain, unit=0' });
  const job = GAP_JOB(wd, { close: [{ name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^red' }] });
  const { provider } = await countRun(wd, [
    { text: 'scout' }, { text: GAP_PLAN() },
    ...gapAttempt(wd, '1', todos(15)),
    ...gapAttempt(wd, '2', todos(1)),
    { text: GAP_PLAN([{ id: 'finish', action: 'Remove the rest.', tools: ['write'], rounds: 4, target: 'src/recurse.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }]) },
    ...gapAttempt(wd, '3', todos(0)),
  ], { 2: 0.5 }, { job });

  const brief = provider.calls.find((c) => c.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  // Strictly NEGATIVE, so it holds before this change and after it: the brief may
  // name the plan's own declared target (the step action and target are the
  // planner's own words), and nothing else file-shaped may appear.
  const carried = brief.slice(brief.indexOf('did not reach its exits')).replace(/src\/recurse\.js/g, '');
  assert.doesNotMatch(carried, /The last exit output names file\(s\)/,
    'the mechanical never-wrote line stays silent when the gap named nothing');
  assert.doesNotMatch(carried, /[\w.-]+\.[a-z]{2,4}\b(?![\w.])/,
    'nothing file-shaped is invented out of a gap that named no file');
});

test('F86 CONTROL: a stall never judged its exits, so the brief carries NO close output — nothing is invented', async (t) => {
  const wd = makePatient(t);
  const base = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'unreachable — the step call stalls' },
    { text: PLAN(wd, [{ id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4, target: 'tests/test_x.mjs', exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }] }]) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const prompts = [];
  let n = 0;
  const provider = {
    calls: base.calls,
    async generate(messages, tools) {
      prompts.push(String(messages.at(-1)?.content ?? ''));
      if (n++ === 2) throw new StallError('no round completed for 300s, 3 times in this step — not reissuing again', MAX_STALLS);
      return base.generate(messages, tools);
    },
  };
  await go(wd, provider);
  const brief = prompts.find((p) => p.includes('did not reach its exits'));
  assert.ok(brief, 'the replan drafter was handed a failure brief');
  assert.doesNotMatch(brief, /What the verification/i,
    'a stall produced no close output — a labelled empty section would be a section that says nothing');
});
