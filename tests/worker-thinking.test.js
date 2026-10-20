// PRD v1.106 Part 1 — thinking on retries. The worker's per-call thinking mode is decided in code (src/thinking.js `workerThinkingMode`)
// from the phase and attempt, written to the spine as `thinking-decision` BEFORE the call, and sent through `thinkingCallOptions`.
// Wire tests drive the REAL bare-agent Loop against a REAL OpenAIProvider / AnthropicProvider with `_request` stubbed at the transport
// seam (a stub replacing a whole library seam could read green with and without the fix). Nothing reaches a network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { workerThinkingMode } from '../src/thinking.js';
import { scriptedProvider } from './helpers.js';
import { tcall, makePatient, JOB, PLAN, collector, go } from './planrun-fixtures.js';

const decisions = (/** @type {any[]} */ events) => events.filter((e) => e.type === 'thinking-decision');
const pair = (/** @type {any} */ d) => [d.phase, d.iteration, d.mode];

// ── the decision table, pure ────────────────────────────────────────────────────────────────────────────────────────────────────────

test('workerThinkingMode: the table, phase by phase and attempt by attempt', () => {
  assert.equal(workerThinkingMode({ phase: 'plan', iteration: 'draft' }), 'on', 'draft thinks');
  assert.equal(workerThinkingMode({ phase: 'plan', iteration: 'redraft' }), 'on', 'redraft thinks');
  assert.equal(workerThinkingMode({ phase: 'plan', iteration: 'draft', tick: false }), 'on', 'replan/draft share the plan phase: thinks');
  assert.equal(workerThinkingMode({ phase: 'scout', iteration: 1 }), 'off');
  assert.equal(workerThinkingMode({ phase: 'step:a', iteration: 1 }), 'off', 'step attempt 1');
  assert.equal(workerThinkingMode({ phase: 'step:a', iteration: 2 }), 'on', 'step attempt 2');
  assert.equal(workerThinkingMode({ phase: 'step:a', iteration: 7 }), 'on', 'step attempt 7');
  assert.equal(workerThinkingMode({ phase: 'fix', iteration: 1 }), 'on', 'close-fix thinks, even on its first iteration');
});

test('workerThinkingMode: the job tick makes EVERY worker call think', () => {
  for (const [phase, iteration] of [['plan', 'draft'], ['scout', 1], ['step:a', 1], ['step:a', 2], ['fix', 1]]) {
    assert.equal(workerThinkingMode({ phase, iteration, tick: true }), 'on', `${phase}/${iteration}`);
  }
  assert.equal(workerThinkingMode({ phase: 'scout', iteration: 1, tick: 'yes' }), 'off', 'only a literal true is the tick');
});

test('workerThinkingMode: a step/fix iteration that is not a whole number >= 1 throws — never a guess; an unknown phase throws', () => {
  for (const bad of [0, -1, 1.5, '2', '1', undefined, null, NaN, Infinity]) {
    assert.throws(() => workerThinkingMode({ phase: 'step:a', iteration: bad }), /step iteration must be a whole number >= 1/, `step ${String(bad)}`);
    assert.throws(() => workerThinkingMode({ phase: 'fix', iteration: bad }), /fix iteration must be a whole number >= 1/, `fix ${String(bad)}`);
    assert.throws(() => workerThinkingMode({ phase: 'step:a', iteration: bad, tick: true }), /whole number/, `tick does not excuse a bad iteration (${String(bad)})`);
  }
  assert.throws(() => workerThinkingMode({ phase: 'banana', iteration: 1 }), /unknown worker phase/);
  assert.throws(() => workerThinkingMode({ phase: undefined, iteration: 1 }), /phase must be a string/);
});

// ── through the engine, scripted provider (a test double is sent nothing, but the decision is still recorded) ──────────────────────

test('engine, close-fix: scout off, plan on, step attempt 1 off, close-fix on — one spine record per worker call, in call order', async (t) => {
  const wd = makePatient(t);
  // the close is stricter than the step's check, so the step greens and the close reds once, opening the fix loop
  writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('ok') && t.includes('import')) process.exit(0);
console.log('FAILED close: the test never imports the module'); process.exit(1);\n`);
  const tf = join(wd, 'tests', 'test_x.mjs');
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: tf, content: 'ok but no module use\n' })] },
    { text: 'wrote it' },
    { toolCalls: [tcall('t2', 'shell_write', { path: tf, content: "import '../src/mod.mjs';\nok\n" })] },
    { text: 'fixed' },
  ]);
  const { events } = await go(wd, provider);
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop opened');
  const d = decisions(events);
  const seen = d.map(pair);
  assert.deepEqual(seen[0], ['scout', 1, 'off']);
  assert.deepEqual(seen[1], ['plan', 'draft', 'on']);
  const stepCalls = d.filter((x) => x.phase.startsWith('step:'));
  assert.equal(stepCalls.length, 1, 'one decision per worker call (a call = one Loop run, however many rounds it takes)');
  assert.ok(stepCalls.every((x) => x.iteration === 1 && x.mode === 'off'), 'step attempt 1 = off');
  const fixCalls = d.filter((x) => x.phase === 'fix');
  assert.ok(fixCalls.length >= 1, 'the fix worker made a call');
  assert.ok(fixCalls.every((x) => x.iteration === 1 && x.mode === 'on'), 'close-fix = on');
  // order on the spine: decision records sit between the phase's other records, never after the run
  assert.ok(events.indexOf(d[0]) < events.findIndex((e) => e.type === 'worker-round'), 'the first decision precedes the first metered round');
});

test('engine, tick on: every worker call on the spine says on', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }, { text: 'did nothing' }]);
  const { events } = await go(wd, provider, { job: JOB(wd, { thinking: true }), capRuns: 1 });
  const d = decisions(events);
  assert.ok(d.length >= 3, `scout, plan and a step call were decided, got ${d.length}`);
  assert.ok(d.some((x) => x.phase === 'scout') && d.some((x) => x.phase.startsWith('step:')));
  assert.deepEqual([...new Set(d.map((x) => x.mode))], ['on'], 'the tick overrides scout and step attempt 1');
});

// ── through the engine, REAL providers with the transport stubbed ───────────────────────────────────────────────────────────────────

const textReply = (/** @type {string} */ text) => ({
  choices: [{ message: { content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 50, completion_tokens: 20 },
  model: 'deepseek-flash',
});

/**
 * A real OpenAIProvider (deepseek-flash: bare-agent's measured-switchable answer); each request body is captured WITH the number of
 * `thinking-decision` records already on the spine when it arrived, which is how "written before the call" is read.
 * @param {Array<any>} script one reply body (or an Error to throw) per request, sticks on the last
 * @param {{events: any[]}} sink
 */
async function wireProvider(script, sink) {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'deepseek-flash' });
  /** @type {Array<{body: any, decisionsSoFar: number}>} */
  const wire = [];
  let n = 0;
  /** @type {any} */ (provider)._request = async (/** @type {any} */ _a, /** @type {any} */ body) => {
    wire.push({ body: JSON.parse(JSON.stringify(body)), decisionsSoFar: decisions(sink.events).length });
    const s = script[Math.min(n++, script.length - 1)];
    if (s instanceof Error) throw s;
    return s;
  };
  return { provider, wire };
}
const WRITE_JOB = (/** @type {string} */ wd, over = {}) => JOB(wd, { provider: 'openai-api', ...over });
/** what a request body says about thinking: 'off' = bare-agent's disabled shape, 'on' = no switch field (this model thinks by default) */
const wireMode = (/** @type {any} */ b) => (b.thinking?.type === 'disabled' ? 'off' : (b.thinking === undefined ? 'on' : `?${JSON.stringify(b.thinking)}`));

test('wire, real OpenAI-shaped provider: the sent field follows the decision for scout, plan, step attempts 1 and 2, replan; the decision is on the spine BEFORE each request', async (t) => {
  const wd = makePatient(t);
  const { events, emit } = collector();
  const { provider, wire } = await wireProvider([
    textReply('scout'), textReply(PLAN(wd)), textReply('nothing'), textReply('nothing'), textReply(PLAN(wd)), textReply('nothing'),
  ], { events });
  const jv = validateJob(WRITE_JOB(wd));
  assert.deepEqual(jv.reds, []);
  await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 0, strikeLimit: 2, remainingUsd: () => 1.5 });
  const d = decisions(events);
  assert.ok(d.length >= 5, `scout, plan, two step attempts, replan: got ${d.length}`);
  assert.deepEqual(d.slice(0, 5).map(pair), [
    ['scout', 1, 'off'], ['plan', 'draft', 'on'], [d[2].phase, 1, 'off'], [d[2].phase, 2, 'on'], ['plan', 'draft', 'on'],
  ]);
  assert.match(d[2].phase, /^step:/);
  // one request per decision here (text-only replies), in order: the wire says what the spine says, and the record came first
  assert.ok(wire.length >= 5);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(wireMode(wire[i].body), d[i].mode, `request ${i} (${d[i].phase}/${d[i].iteration}) carries the decided mode`);
    assert.equal(wire[i].decisionsSoFar, i + 1, `request ${i} arrived with its decision already written`);
  }
  // bare-agent's own per-call verdict is recorded beside the decision, as drafting rounds record it
  const st = events.filter((e) => e.type === 'thinking-status');
  assert.ok(st.length >= 1 && st.every((e) => typeof e.thinkingStatus === 'string' && (e.mode === 'on' || e.mode === 'off')));
});

test('wire, tick on: no request carries the off switch, scout and step attempt 1 included', async (t) => {
  const wd = makePatient(t);
  const { events, emit } = collector();
  const { provider, wire } = await wireProvider([textReply('scout'), textReply(PLAN(wd)), textReply('nothing')], { events });
  const jv = validateJob(WRITE_JOB(wd, { thinking: true }));
  assert.deepEqual(jv.reds, []);
  await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 0, strikeLimit: 1, remainingUsd: () => 1.5 });
  assert.ok(wire.length >= 3);
  assert.ok(wire.every((w) => wireMode(w.body) === 'on'), 'every worker request is on under the tick');
  assert.deepEqual([...new Set(decisions(events).map((x) => x.mode))], ['on']);
});

test('wire, a model that cannot switch: the decision is recorded but nothing is sent', async (t) => {
  const wd = makePatient(t);
  const { events, emit } = collector();
  const { AnthropicProvider } = await import('bare-agent/providers');
  const provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-opus-5-5' });
  /** @type {any[]} */
  const bodies = [];
  let n = 0;
  const replies = ['scout', PLAN(wd), 'nothing'];
  /** @type {any} */ (provider)._request = async (/** @type {any} */ a) => {
    bodies.push(JSON.parse(JSON.stringify(a)));
    const text = replies[Math.min(n++, replies.length - 1)];
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, model: 'claude-opus-5-5' };
  };
  const jv = validateJob(WRITE_JOB(wd, { provider: 'anthropic-api' }));
  assert.deepEqual(jv.reds, []);
  await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 0, strikeLimit: 1, remainingUsd: () => 1.5 });
  assert.ok(decisions(events).some((x) => x.mode === 'off'), 'an off decision was made (scout)');
  assert.ok(bodies.length >= 3);
  for (const b of bodies) {
    for (const k of ['thinking', 'reasoning_effort', 'think', 'output_config']) assert.equal(k in b, false, `no ${k} sent to a model that cannot switch`);
  }
});

test('wire, a dropped-and-retried call carries the SAME decision: one record, the retried request has the same switch', async (t) => {
  const wd = makePatient(t);
  const { events, emit } = collector();
  const drop = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  // request 1 = scout (dropped), request 2 = the scout retried, then plan
  const { provider, wire } = await wireProvider([drop, textReply('scout'), textReply(PLAN(wd)), textReply('nothing')], { events });
  const jv = validateJob(WRITE_JOB(wd));
  await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 0, strikeLimit: 1, remainingUsd: () => 1.5 });
  assert.ok(events.some((e) => e.type === 'transport-retry' && e.recovered === true), 'the drop was retried and recovered');
  assert.equal(wireMode(wire[0].body), 'off');
  assert.equal(wireMode(wire[1].body), 'off', 'the retried request carries the same decision');
  assert.deepEqual(wire[0].body.thinking, wire[1].body.thinking);
  assert.equal(decisions(events).filter((x) => x.phase === 'scout').length, 1, 'the retry is the same call: one decision record');
});

test('wire, the scout\'s reserved toolless summary round (askFrom) carries the scout decision too: two scout decisions, both off, both on the wire', async (t) => {
  const wd = makePatient(t);
  const { events, emit } = collector();
  const grep = {
    choices: [{ message: { content: '', tool_calls: [{ id: 'c1', function: { name: 'shell_grep', arguments: JSON.stringify({ pattern: 'export', path: wd }) } }] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 50, completion_tokens: 20 }, model: 'deepseek-flash',
  };
  const { provider, wire } = await wireProvider([grep, textReply(`Survey. ${'The suite runs node --test over tests. '.repeat(8)}`), textReply(PLAN(wd)), textReply('nothing')], { events });
  const jv = validateJob(WRITE_JOB(wd));
  await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 0, strikeLimit: 1, scoutRounds: 1, remainingUsd: () => 1.5 });
  const scouts = decisions(events).filter((x) => x.phase === 'scout');
  assert.equal(scouts.length, 2, 'the scout run and its summary round are two calls, two decisions');
  assert.ok(scouts.every((x) => x.iteration === 1 && x.mode === 'off'));
  assert.equal(wireMode(wire[0].body), 'off');
  assert.equal(wireMode(wire[1].body), 'off', 'the summary round (askFrom) sends the decision too');
});
