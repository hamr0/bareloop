// F184 — a malformed tool-call round on the WORKER path (`src/planrun.js`'s
// Loop-path `ask()`, distinct from the native/CLIPipe `ask()`) used to end
// an attempt with nothing on the spine naming it. bare-agent 0.43.0 (BA-27)
// returns a malformed final-turn tool call PRICED rather than throwing:
// `toolCalls: []`, `text: ''`, `error: null`, and its own
// `malformedToolCall: {name, error}` marker — but `ask()` only ever read
// `r.error` and returned `r` otherwise unexamined, so the marker reached
// bareloop code and was thrown away. The ordinary `needs_revision`/
// `exit-eval` gap that followed (the round wrote nothing) was
// indistinguishable, on the spine, from the model genuinely failing.
//
// The fix adds VISIBILITY only: a distinct `worker-malformed-tool-call`
// spine record, emitted right where `ask()` already sees the marker, with
// NO retry and NO change to strikes/ladder/attempt counting/verdict
// routing — `r` is returned exactly as before, so every existing spine
// shape for "the model wrote nothing this round" is unchanged.
//
// Per the repo's own rule (a test stub replacing a whole library seam can
// read green with AND without the fix), this drives the REAL bare-agent
// Loop against a REAL OpenAIProvider instance with `_request` stubbed at
// the transport seam — the same idiom tests/authorscout.test.js uses to
// prove the analogous scout-side blind spot. A hand-rolled `scriptedProvider`
// (tests/helpers.js) returns pre-parsed `toolCalls` objects directly and
// never exercises bare-agent's own `parseToolCalls`/malformed-JSON
// detection, so it cannot produce a real `malformedToolCall` marker at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { initPatientRepo } from './helpers.js';
import { signCloseScripts } from '../src/close-integrity.js';

function makePatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'worker-malformed-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'tests'));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  // MUST be red at the seed (planrun.test.js's makePatient idiom): an
  // already-green close short-circuits runPlan before the scout/plan/worker
  // ever run at all, which would make this fixture unable to reach the
  // worker path this finding is about.
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('suite: 1 passed'); process.exit(0); }
console.log('FAILED tests/test_x.mjs — file missing or has no ok assertion'); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), probe);
  return wd;
}

const JOB = (wd) => signCloseScripts({
  schema: 'job-v1',
  job: 'worker-malformed-toolcall',
  description: 'a single-round step, driven by a real OpenAIProvider with a malformed final tool call',
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
    tools: ['write'], rounds: 1, target: 'tests/test_x.mjs',
    exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs' }],
  }],
});

/** collect spine events in memory — same pure-listener contract as
 * tests/planrun.test.js's own `collector`. */
function collector() {
  /** @type {any[]} */
  const events = [];
  return { events, emit: (/** @type {string} */ type, /** @type {any} */ data = {}) => { events.push({ type, ...data }); } };
}

/**
 * A real bare-agent OpenAIProvider, `_request` stubbed at the transport
 * seam (never a fake Loop, never a hand-rolled toolCalls array) so the
 * REAL `parseToolCalls`/malformed-JSON detection inside bare-agent's own
 * `generate()` runs. Call-count-scripted, ignoring its arguments — the
 * same shape tests/authorscout.test.js's malformed-tool-call fixture uses.
 * @param {Array<object>} script one raw response BODY per call, sticks on the last
 */
async function malformedProvider(script) {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'deepseek-flash' });
  let n = 0;
  provider._request = async () => script[Math.min(n++, script.length - 1)];
  return provider;
}

const textReply = (/** @type {string} */ text) => ({
  choices: [{ message: { content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 50, completion_tokens: 20 },
  model: 'deepseek-flash',
});

/** a tool-call round whose `function.arguments` is INVALID JSON (an extra
 * closing brace) — the exact shape that makes bare-agent's own
 * `parseToolCalls` return `malformedToolCall` instead of throwing. */
const malformedToolCallReply = {
  choices: [{
    message: {
      content: '',
      tool_calls: [{ id: 'call_1', function: { name: 'shell_write', arguments: '{"path":"tests/test_x.mjs"}}' } }],
    },
    finish_reason: 'tool_calls',
  }],
  usage: { prompt_tokens: 60, completion_tokens: 15 },
  model: 'deepseek-flash',
};

test('a real malformed tool-call round on the worker path emits a distinct worker-malformed-tool-call spine record, scoped and named, never a value echoed elsewhere', async (t) => {
  const wd = makePatient(t);
  const provider = await malformedProvider([
    textReply(PLAN()), // plan draft (scout is off — this is the FIRST call)
    malformedToolCallReply, // the step's one round: a real malformed tool call
    // a THIRD, sticky-filler entry: strikeLimit:1 still triggers exactly one
    // replan (the ladder doctrine's own "two strikes force a replan", here
    // hit at the tightened floor of one), and the provider sticks on its
    // last script entry forever — without a third entry the replan's own
    // draft call, and everything after it, would hit the malformed reply
    // again and inflate the count this test pins. A plain text reply here
    // (never a tool call) means every call after the one under test is an
    // ORDINARY empty round, exactly the population the second test below
    // proves is never mis-flagged.
    textReply(PLAN()),
  ]);
  const jv = validateJob(JOB(wd));
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const { events, emit } = collector();
  // strikeLimit:1 — the smallest ladder this harness can produce: ONE step
  // iteration before the ladder strikes and forces the (single) replan.
  await runPlan(jv.job, {
    workdir: wd, provider, emit, capRuns: 0, strikeLimit: 1, remainingUsd: () => 1.5, scout: false,
  });

  const marker = events.filter((e) => e.type === 'worker-malformed-tool-call');
  assert.equal(marker.length, 1, 'exactly one distinct record for the one malformed round');
  assert.equal(marker[0].name, 'shell_write', 'the tool name bare-agent named travels onto the spine');
  assert.match(marker[0].error, /Unexpected|JSON|token/i, 'the transport-level parse error travels too — the honesty bar F179/F180 set');
  assert.equal(typeof marker[0].phase, 'string', 'it carries the same phase field every other worker-path record does');
  assert.equal(typeof marker[0].iteration, 'number', 'and the same iteration field');

  // NO RETRY: the event immediately following the marker is `middle-done`
  // — the attempt ending — never another `worker-round`. A retry of the
  // malformed round would insert a second round BEFORE the attempt ends;
  // this is checked by ADJACENCY rather than a count over the whole run,
  // because the run as a whole has more worker-round events than this (the
  // ladder's one allowed replan drafts and re-attempts past this iteration,
  // reusing the step id and iteration numbering — not a second look at the
  // same malformed round).
  const markerIdx = events.findIndex((e) => e.type === 'worker-malformed-tool-call');
  assert.equal(events[markerIdx + 1]?.type, 'middle-done', 'nothing — least of all a retried worker-round — runs between the marker and the attempt ending');

  // ORDINARY SHAPE UNCHANGED: the round wrote nothing (text came back
  // empty), so the step's own exit check still reds the ordinary way —
  // exactly as a genuinely-empty round would, never a distinct verdict.
  const exitEval = events.find((e) => e.type === 'exit-eval');
  assert.ok(exitEval, 'the ordinary exit-eval gap still fires — this fix changes visibility only, never verdict routing');
  assert.ok(exitEval.results.some((r) => !r.pass), 'the artifact-written exit still reds — nothing was written');
});

test('an ORDINARY empty round (no malformed marker) never emits worker-malformed-tool-call — the record is not a generic "wrote nothing" catch-all', async (t) => {
  const wd = makePatient(t);
  const provider = await malformedProvider([
    textReply(PLAN()),
    textReply('I looked around but made no changes this round.'), // ordinary empty reply, no tool call at all
  ]);
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  await runPlan(jv.job, {
    workdir: wd, provider, emit, capRuns: 1, remainingUsd: () => 1.5, scout: false,
  });
  assert.equal(events.filter((e) => e.type === 'worker-malformed-tool-call').length, 0, 'a genuinely empty round (never touched the malformed-JSON path) must not be mis-flagged');
  assert.ok(events.find((e) => e.type === 'exit-eval'), 'and the ordinary exit-eval gap still fires for it, same as before');
});
