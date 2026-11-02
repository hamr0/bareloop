// BA-29 consumer (bare-agent >= 0.58): the worker Loop turns on `checkArgs`, a bad
// tool call lands on the spine as `worker-bad-calls` (structured fields only), and a
// cut-off round keeps its malformed marker. F265 (object content), F266 (cut-offs),
// F267 (audit size). Same idiom as tests/worker-malformed-toolcall.test.js: the REAL
// bare-agent Loop against a REAL OpenAIProvider with `_request` stubbed at the
// transport seam, because a hand-rolled scripted provider returns pre-parsed
// toolCalls and can never produce a bad-call record or a malformed marker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { initPatientRepo } from './helpers.js';
import { signCloseScripts } from '../src/close-integrity.js';

function makePatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'worker-badcalls-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'tests'));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('suite: 1 passed'); process.exit(0); }
console.log('FAILED tests/test_x.mjs — file missing or has no ok assertion'); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), probe);
  return wd;
}

const JOB = (wd) => signCloseScripts({
  schema: 'job-v1',
  job: 'worker-bad-calls',
  description: 'a single-step job driven by a real OpenAIProvider with scripted bad calls',
  provider: 'openai-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs with an ok assertion so the suite greens.',
  verdictType: 'green',
  close: [{ name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
}, wd).spec;

const PLAN = () => JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
    tools: ['write', 'edit'], rounds: 4, target: 'tests/test_x.mjs',
    exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs' }],
  }],
});

function collector() {
  /** @type {any[]} */
  const events = [];
  return { events, emit: (/** @type {string} */ type, /** @type {any} */ data = {}) => { events.push({ type, ...data }); } };
}

/** real OpenAIProvider, `_request` stubbed; records every request body */
async function provider(script) {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const p = new OpenAIProvider({ apiKey: 'test-key', model: 'deepseek-flash' });
  let n = 0;
  /** @type {any[]} */
  const bodies = [];
  p._request = async (_path, body) => { bodies.push(body); return script[Math.min(n++, script.length - 1)]; };
  return { p, bodies };
}

const textReply = (/** @type {string} */ text) => ({
  choices: [{ message: { content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 50, completion_tokens: 20 },
  model: 'deepseek-flash',
});

/** one tool-call round; `args` is the raw `function.arguments` STRING */
const callReply = (/** @type {string} */ name, /** @type {string} */ args, finish = 'tool_calls', usage = { prompt_tokens: 60, completion_tokens: 15 }) => ({
  choices: [{ message: { content: '', tool_calls: [{ id: 'call_1', function: { name, arguments: args } }] }, finish_reason: finish }],
  usage,
  model: 'deepseek-flash',
});

const run = async (jv, wd, p, emit, extra = {}) => runPlan(jv.job, {
  workdir: wd, provider: p, emit, capRuns: 0, strikeLimit: 1, remainingUsd: () => 1.5, scout: false, ...extra,
});

test('A.2/A.4: checkArgs is on for the worker — an object content is refused with the new hint and the spine names the bad-call kind', async (t) => {
  const wd = makePatient(t);
  const { p, bodies } = await provider([
    textReply(PLAN()),
    callReply('shell_write', JSON.stringify({ path: join(wd, 'tests/test_x.mjs'), content: { ok: true } })),
    callReply('shell_write', JSON.stringify({ path: join(wd, 'tests/test_x.mjs'), content: 'ok' })),
    textReply('done'),
  ]);
  const jv = validateJob(JOB(wd));
  assert.deepEqual(jv.reds, []);
  const { events, emit } = collector();
  await run(jv, wd, p, emit);

  const rec = events.filter((e) => e.type === 'worker-bad-calls');
  assert.equal(rec.length, 1, 'one record for the one refused call');
  assert.equal(rec[0].calls[0].kind, 'arg-type');
  assert.equal(rec[0].calls[0].tool, 'shell_write');
  assert.equal(rec[0].calls[0].param, 'content');
  assert.equal(rec[0].calls[0].got, 'object');
  const toolMsgs = bodies.flatMap((b) => b.messages).filter((m) => m.role === 'tool').map((m) => String(m.content));
  assert.ok(toolMsgs.some((m) => m.includes('content must be a string, got object')), `the refusal text reached the model: ${JSON.stringify(toolMsgs)}`);
  assert.ok(existsSync(join(wd, 'tests', 'test_x.mjs')) && readFileSync(join(wd, 'tests', 'test_x.mjs'), 'utf8') === 'ok', 'the corrected string write landed');
});

test('A.4: a cut round whose call is cut mid-JSON records BOTH the bad-call and the malformed marker', async (t) => {
  const wd = makePatient(t);
  const cutArgs = `{"path":"tests/test_x.mjs","content":"${'x'.repeat(4000)}`; // never closed: cut at the cap
  const { p } = await provider([
    textReply(PLAN()),
    callReply('shell_write', cutArgs, 'length', { prompt_tokens: 60, completion_tokens: 32000 }),
    textReply(PLAN()),
  ]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  await run(jv, wd, p, emit);
  const bad = events.filter((e) => e.type === 'worker-bad-calls');
  assert.ok(bad.length >= 1, 'the cut round records its bad call');
  assert.equal(bad[0].calls[0].kind, 'cut-off');
  assert.equal(bad[0].calls[0].hasAppend, true);
  assert.ok(bad[0].calls[0].argBytes > 3000, 'the dropped call size is on the record');
  assert.equal(bad[0].calls[0].parsed, false);
  assert.equal(bad[0].cutOff.outputTokens, 32000);
  const marker = events.filter((e) => e.type === 'worker-malformed-tool-call');
  assert.equal(marker.length, 1, 'the malformed marker survives the cut round');
  assert.equal(marker[0].name, 'shell_write');
});

test('A.4: a cut round carrying a COMPLETE call records the bad-call (parsed) and its size', async (t) => {
  const wd = makePatient(t);
  const { p } = await provider([
    textReply(PLAN()),
    callReply('shell_write', JSON.stringify({ path: 'tests/test_x.mjs', content: 'x'.repeat(4000) }), 'length', { prompt_tokens: 60, completion_tokens: 32000 }),
    textReply(PLAN()),
  ]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  await run(jv, wd, p, emit);
  const bad = events.filter((e) => e.type === 'worker-bad-calls');
  assert.equal(bad[0].calls[0].kind, 'cut-off');
  assert.equal(bad[0].calls[0].parsed, true);
  assert.ok(bad[0].calls[0].argBytes > 4000);
});

// ── A.3: the next-attempt note, built from the STRUCTURED facts (never from prose) ──────────────────────────────────────────
import { boundedNote } from '../src/planrun.js';

const cutFacts = (call, cutOff = { outputTokens: 32000, reasoningTokens: null, maxTokensRequested: 32000 }) => ({
  calls: [{ kind: 'cut-off', tool: 'shell_write', parsed: false, argBytes: 0, hasAppend: true, round: 1, ...call }], cutOff,
});
const trunc = (bad) => ({ iteration: 1, cause: 'truncated', reason: 'output cut at the token limit (max_tokens)', ...(bad ? { bad } : {}) });
const PLAIN = 'Your previous attempt was CUT OFF: output cut at the token limit (max_tokens). That response was discarded.';

test('A.3 note: a cut write with append and a large argument says write in parts with append', () => {
  const note = boundedNote(trunc(cutFacts({ argBytes: 60000 })), 6);
  assert.ok(note.startsWith(PLAIN), 'the frozen cut-off sentence stays the prefix');
  assert.match(note, /shell_write/);
  assert.match(note, /in parts/);
  assert.match(note, /append/);
});

test('A.3 note: a cut where reasoning dominates says decide sooner', () => {
  const note = boundedNote(trunc(cutFacts({ argBytes: 0, hasAppend: false }, { outputTokens: 32000, reasoningTokens: 30000, maxTokensRequested: 32000 })), 6);
  assert.ok(note.startsWith(PLAIN));
  assert.match(note, /reasoning/);
  assert.match(note, /sooner/);
  assert.doesNotMatch(note, /in parts/);
});

test('A.3 note: a cut with nothing known keeps the plain cut-off sentence, byte for byte', () => {
  assert.equal(boundedNote(trunc(null), 6), PLAIN);
  assert.equal(boundedNote(trunc({ calls: [], cutOff: null }), 6), PLAIN);
  assert.equal(boundedNote(trunc(cutFacts({ argBytes: 10, hasAppend: false })), 6), PLAIN, 'a small cut with no append and no reasoning count says nothing extra');
});

test('A.3 note: an object sent where a string was declared says send JSON as text', () => {
  const bad = { calls: [{ kind: 'arg-type', tool: 'shell_write', param: 'content', expected: 'string', got: 'object', hasAppend: true, round: 2 }], cutOff: null };
  const note = boundedNote({ iteration: 1, cause: 'rounds', reason: null, bad }, 6);
  assert.match(note, /CUT OFF after 6 tool rounds/, 'the round-bound sentence stays');
  assert.match(note, /content/);
  assert.match(note, /JSON/);
  assert.match(note, /as text|one string/);
});
