// The text-only ending nudge (F-next, scan .claude/scratch/textonly-scan/RESULT.md): a worker ask on a writeable step (or the fix loop) whose
// Loop run finishes (end_turn) with text and NO allowed write in the real gate audit is continued ONCE, in the same conversation, with one
// code-written user message. The REAL bare-agent Loop + a REAL OpenAIProvider with `_request` stubbed at the transport seam (the same idiom as
// tests/worker-bad-calls.test.js), real shell tools, real gate audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { initPatientRepo } from './helpers.js';
import { signCloseScripts } from '../src/close-integrity.js';
import { attachMemos } from '../src/panel/handed.js';

const NUDGE = 'You ended without writing any file. Make the change now with your write or edit tool; do not reply in text.';

function makePatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'worker-nudge-'));
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
  schema: 'job-v1', job: 'worker-nudge', description: 'a single-step job driven by a real OpenAIProvider with scripted text-only endings',
  provider: 'openai-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs with an ok assertion so the suite greens.', verdictType: 'green',
  close: [{ name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
}, wd).spec;

const WRITE_STEP = (rounds = 4) => ({
  id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.', tools: ['write', 'edit'], rounds, target: 'tests/test_x.mjs',
  exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs' }],
});
const READ_STEP = { id: 'look', action: 'Read src/mod.mjs.', tools: ['read'], rounds: 3, exit: [{ type: 'artifact-written', path: 'src/mod.mjs' }] };
const PLAN = (steps = [WRITE_STEP()]) => JSON.stringify({ schema: 'plan-v1', steps });

function collector() {
  const events = [];
  return { events, emit: (type, data = {}) => { events.push({ type, ...data }); } };
}
async function provider(script) {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const p = new OpenAIProvider({ apiKey: 'test-key', model: 'deepseek-flash' });
  let n = 0;
  const bodies = [];
  p._request = async (_path, body) => { bodies.push(JSON.parse(JSON.stringify(body))); return script[Math.min(n++, script.length - 1)]; };
  return { p, bodies };
}
const textReply = (text) => ({ choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 20 }, model: 'deepseek-flash' });
const callReply = (name, args) => ({ choices: [{ message: { content: '', tool_calls: [{ id: 'call_1', function: { name, arguments: args } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 60, completion_tokens: 15 }, model: 'deepseek-flash' });
const run = async (jv, wd, p, emit, extra = {}) => runPlan(jv.job, { workdir: wd, provider: p, emit, capRuns: 0, strikeLimit: 1, remainingUsd: () => 1.5, scout: false, ...extra }); // eslint-disable-line
const writeCall = (wd) => callReply('shell_write', JSON.stringify({ path: join(wd, 'tests/test_x.mjs'), content: 'ok' }));
const textOf = (c) => (typeof c === 'string' ? c : JSON.stringify(c));
const lastUserIs = (b, text) => { const m = b.messages[b.messages.length - 1]; return m.role === 'user' && textOf(m.content).includes(text); };
const nudgeCount = (bodies) => bodies.filter((b) => lastUserIs(b, NUDGE)).length;

test('(a) a writeable step that ends in text is nudged once with the exact text, the nudge round writes, the try passes', async (t) => {
  const wd = makePatient(t);
  const { p, bodies } = await provider([textReply(PLAN()), textReply('I will now write the test.'), writeCall(wd), textReply('done')]);
  const jv = validateJob(JOB(wd));
  assert.deepEqual(jv.reds, []);
  const { events, emit } = collector();
  await run(jv, wd, p, emit);
  assert.equal(nudgeCount(bodies), 1, 'the nudge text went out exactly once');
  const nb = bodies.find((b) => lastUserIs(b, NUDGE));
  assert.ok(nb.messages.some((m) => m.role === 'assistant' && String(m.content).includes('I will now write the test.')), 'same conversation: the earlier text is in the history');
  assert.ok(nb.tools?.length > 0, 'the write tools are still offered (no toolless round, no forcing)');
  assert.equal(nb.tool_choice, undefined, 'no toolChoice forcing');
  assert.ok(existsSync(join(wd, 'tests', 'test_x.mjs')) && readFileSync(join(wd, 'tests', 'test_x.mjs'), 'utf8') === 'ok', 'the nudge round wrote');
  const rec = events.filter((e) => e.type === 'worker-text-only');
  assert.equal(rec.length, 1);
  assert.equal(rec[0].nudged, true);
  assert.equal(rec[0].nudgeWrote, true);
  assert.equal(rec[0].text, 'I will now write the test.');
  assert.ok(events.some((e) => e.type === 'step-end' && e.step === 'write-test' && e.outcome === 'green'), 'the try passed in the same try (one iteration)');
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 1, 'no second try was needed');
});

test('(b) a nudge round that is also text gets no second nudge; the try ends as it does today', async (t) => {
  const wd = makePatient(t);
  const { p, bodies } = await provider([textReply(PLAN()), textReply('first words'), textReply('second words')]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  await run(jv, wd, p, emit);
  assert.equal(nudgeCount(bodies), 1, 'once per ask, never twice');
  const rec = events.filter((e) => e.type === 'worker-text-only');
  assert.equal(rec.length, 1);
  assert.equal(rec[0].nudged, true);
  assert.equal(rec[0].nudgeWrote, false);
  assert.equal(rec[0].text, 'second words', 'the LAST round text is the one stored');
  assert.ok(!existsSync(join(wd, 'tests', 'test_x.mjs')), 'nothing was written');
});

test('(c) a read-only step is never nudged and records nothing', async (t) => {
  const wd = makePatient(t);
  const { p, bodies } = await provider([textReply(PLAN([READ_STEP, WRITE_STEP()])), textReply('I looked at it.'), callReply('shell_write', JSON.stringify({ path: join(wd, 'tests/test_x.mjs'), content: 'ok' })), textReply('done')]);
  const jv = validateJob(JOB(wd));
  assert.deepEqual(jv.reds, []);
  const { events, emit } = collector();
  await run(jv, wd, p, emit);
  assert.equal(nudgeCount(bodies), 0);
  assert.equal(events.filter((e) => e.type === 'worker-text-only').length, 0);
});

test('(d) a try whose round limit is already used up is not nudged', async (t) => {
  const wd = makePatient(t);
  const { p, bodies } = await provider([textReply(PLAN([WRITE_STEP(1)])), textReply('words only'), textReply('words only')]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  await run(jv, wd, p, emit);
  assert.equal(nudgeCount(bodies), 0, 'round 1 of 1 was the last round: no nudge');
  const rec = events.filter((e) => e.type === 'worker-text-only');
  assert.ok(rec.length >= 1, 'the text-only ending is still recorded');
  assert.equal(rec[0].nudged, false);
});

test('(e) the nudge round is metered like every other worker round, and the money cap halts it', async (t) => {
  const wd = makePatient(t);
  const { p } = await provider([textReply(PLAN()), textReply('words'), writeCall(wd), textReply('done')]);
  const jv = validateJob(JOB(wd));
  const rates = { in: 1, out: 1 }; // $ per 1K tokens: a 70-token round costs $0.07
  const a = collector();
  await run(jv, wd, p, a.emit, { rates, remainingUsd: () => 5 });
  const rounds = a.events.filter((e) => e.type === 'worker-round' && String(e.phase).startsWith('step:'));
  assert.ok(rounds.length >= 2, 'the text round and the nudge round are both metered');
  assert.ok(rounds.every((r) => typeof r.costUsd === 'number' && r.costUsd > 0), 'every step round is priced');
  assert.equal(rounds[0].phase, rounds[1].phase);

  const wd2 = makePatient(t);
  const { p: p2 } = await provider([textReply(PLAN()), textReply('words'), writeCall(wd2), textReply('done')]);
  const b = collector();
  await run(validateJob(JOB(wd2)), wd2, p2, b.emit, { rates, remainingUsd: () => 0.1 });
  assert.ok(!existsSync(join(wd2, 'tests', 'test_x.mjs')), 'the cap halted the nudge round before it could write');
  assert.ok(b.events.some((e) => e.type === 'escalation' && /cap|budget|halt/i.test(JSON.stringify(e))), `a cap escalation: ${b.events.map((e) => e.type).join(',')}`);
});

test('(f) the stored text is masked with the one secret inventory and capped at 2000 chars with a truncated flag', async (t) => {
  const wd = makePatient(t);
  const secret = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
  const long = `${secret} ${'y'.repeat(5000)}`;
  const { p } = await provider([textReply(PLAN()), textReply(long), textReply(long)]);
  const { events, emit } = collector();
  await run(validateJob(JOB(wd)), wd, p, emit);
  const rec = events.find((e) => e.type === 'worker-text-only');
  assert.ok(rec);
  assert.ok(!rec.text.includes(secret), 'the token is masked');
  assert.ok(rec.text.length <= 2000);
  assert.equal(rec.truncated, true);
  const short = collector();
  const wd2 = makePatient(t);
  const { p: p2 } = await provider([textReply(PLAN()), textReply('short words'), textReply('short words')]);
  await run(validateJob(JOB(wd2)), wd2, p2, short.emit);
  assert.equal(short.events.find((e) => e.type === 'worker-text-only').truncated, false);
});

test('(g) the Audit marks the nudged try: handed.js carries the flag onto the try and the grid header says "nudged"', async () => {
  const parts = [{ kind: 'step', label: 'write-test', attempts: [{ n: 1, iteration: 1, startSeq: 0, endSeq: 50 }, { n: 2, iteration: 2, startSeq: 0, endSeq: 50 }] }];
  const out = attachMemos(parts, [{ type: 'worker-text-only', phase: 'step:write-test', iteration: 1, seq: 10, nudged: true, nudgeWrote: false, text: 'x', truncated: false }]);
  assert.equal(out[0].attempts[0].nudged, true);
  assert.notEqual(out[0].attempts[1].nudged, true);
  const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
  assert.match(PAGE, /t\.nudged \? '<span class="hint">nudged<\/span>'/);
});
