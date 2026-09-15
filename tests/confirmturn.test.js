// THE CONFIRM TURN (PRD item 33 M3 piece 4) — unit tests over `runConfirmTurn`
// alone, with a stub `generate` (scripted like `authorflow.test.js`'s own
// `scriptGenerate`, scoped to the confirm channel instead of the declaration
// one) and a scripted `ask`. Nothing here wires a real scout, a real listing,
// or `authorCloseForJob` — that wiring is step S3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runConfirmTurn, CONFIRM_TOOL_NAME, CONFIRM_ACK, CONFIRM_SYSTEM, confirmPrompt,
  makeCostBook, WORSE_THAN_BEFORE_FIELD, LANGUAGE_PICK_FIELD, CONFIRM_MENU,
  GREEN_QUESTIONS, FIELD_LABELS, confirmProtections, GUARD_DESCRIPTIONS,
  makeLoopGenerate, MAX_STRUCTURE_RETRIES,
} from '../src/authorflow.js';
import { redactSecrets } from '../src/validate.js';

/**
 * A scripted model boundary over the CONFIRM channel — the same idiom
 * `authorflow.test.js`'s `scriptGenerate` uses for the declaration channel.
 * @param {{plan?: any, plans?: any[], text?: string, costUsd?: number|null, error?: string|null}[]} script
 */
function scriptConfirmGenerate(script) {
  /** @type {any[]} */
  const calls = [];
  const generate = async (/** @type {any} */ messages, /** @type {any} */ tools) => {
    const spec = script[Math.min(calls.length, script.length - 1)] ?? {};
    calls.push({ messages, tools });
    const tool = tools.find((/** @type {any} */ t) => t.name === CONFIRM_TOOL_NAME);
    const delivered = spec.plans ?? (spec.plan ? [spec.plan] : []);
    if (tool) for (const d of delivered) await tool.execute(d);
    return {
      text: spec.text ?? (tool ? '' : JSON.stringify(delivered[0] ?? {})),
      error: spec.error ?? null,
      msgs: [],
      metrics: { costUsd: 'costUsd' in spec ? spec.costUsd : 0.01, unpricedRounds: 0 },
    };
  };
  return { generate, calls };
}

/** A scripted `ask` — each call consumes the next scripted answer (or `null`
 * at end of script, standing in for "input ended"). @param {any[]} script */
function scriptAsk(script) {
  /** @type {any[]} */
  const seen = [];
  let i = 0;
  const ask = async (/** @type {any} */ step) => {
    seen.push(step);
    if (i >= script.length) return null;
    return script[i++];
  };
  return { ask, seen };
}

// The model is NEVER asked for `protections` any more (fix #1, run mu0voeo4)
// — the schema has no such field — but a stub model in these tests can still
// try to smuggle one in through the tool call, and that must be ignored
// (never shown, never recorded). `notChecked` IS a real model field now.
const PLAN_ONE = { checks: ['tests stay green'], goal: 'Keep the tests green.', questions: [], notChecked: [] };

const baseArgs = (over = {}) => ({
  verdictType: 'green',
  answers: { 1: 'fix the bug', 2: 'tests pass', 3: 'do not touch the CLI' },
  questions: GREEN_QUESTIONS,
  labels: FIELD_LABELS,
  facts: { sourcePaths: ['src/'] },
  listing: null,
  writeScope: ['src/**'],
  isRepo: true,
  lang: 'js',
  mode: 'tool',
  ...over,
});

/** the REAL protections for `baseArgs()`'s own class/lang/writeScope — computed
 * from code, never hand-typed twice, so this file cannot drift from
 * {@link confirmProtections}'s own wording. */
const BASE_PROTECTIONS = confirmProtections({ verdictType: 'green', lang: 'js', writeScope: ['src/**'] });

test('(a) confirm on round 1 costs exactly one model call', async () => {
  const { generate, calls } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const { ask, seen } = scriptAsk(['', 'confirm']); // worseThanBefore, then the menu pick
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(calls.length, 1, 'exactly one paid call');
  assert.equal(r.ok, true);
  assert.equal(r.stop, null);
  assert.equal(r.rounds, 1);
  assert.deepEqual(r.accepted, {
    goal: 'Keep the tests green.', checks: ['tests stay green'], protections: BASE_PROTECTIONS,
    lang: 'js', worseThanBefore: '', openQuestions: [], notChecked: [],
  });
  assert.equal(seen[0].kind, 'worseThanBefore');
  assert.equal(seen[1].kind, 'menu');
});

test('(b) fix,fix costs exactly 2 calls (never 3), and ONLY round-2\'s own fix lands in openQuestions — FAIL-FIRST', async () => {
  // F175 ledger fix: round 1's "fix" text is the ANSWER to round 2's redraft
  // — round 2's plan is the response to it — so it must never itself land in
  // openQuestions. Only round 2's OWN terminal "fix" (D3: no 3rd call) does.
  const { generate, calls } = scriptConfirmGenerate([{ plan: PLAN_ONE }, { plan: { ...PLAN_ONE, goal: 'Keep the tests green, round 2.' } }]);
  const { ask } = scriptAsk(['', 'fix', 'make it stricter', 'fix', 'also check the CLI']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(calls.length, 2, 'never a 3rd call after 2 fix rounds — this is the loop-bound this test would catch if broken');
  assert.equal(r.ok, true);
  assert.equal(r.stop, null);
  assert.equal(r.rounds, 2);
  assert.deepEqual(r.accepted?.openQuestions, ['also check the CLI'], 'round 1\'s "make it stricter" is superseded, never carried');
  // round 2's plan is passed to the composer VERBATIM (D3) — never re-asked a 3rd time
  assert.equal(r.accepted?.goal, 'Keep the tests green, round 2.');
});

// ── F175 (docs/logs/FINDINGS.md) — the model's honestly-raised `questions`
// never reached `accepted.openQuestions`, so a genuinely missing answer could
// be confirmed away silently. Every accepting path now carries the model's
// own `questions` from the plan being ACCEPTED.

test('(b2) F175 ledger scenario: round-1 fix superseded, round-2 plan has NO questions of its own → openQuestions is []', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }, { plan: { ...PLAN_ONE, goal: 'Keep the tests green, round 2.' } }]);
  const { ask } = scriptAsk(['', 'fix', 'make it stricter', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted?.openQuestions, []);
});

test('(b3) F175: a round-1 plan\'s honest `questions` entry rides through when the person picks Confirm on round 1', async () => {
  const planWithQuestion = {
    ...PLAN_ONE,
    questions: ['Does "in strict mode" mean tsconfig\'s existing setting, or flipping strict:true?'],
  };
  const { generate } = scriptConfirmGenerate([{ plan: planWithQuestion }]);
  const { ask } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted?.openQuestions, [planWithQuestion.questions[0]]);
});

test('(b4) F175: round-2 fix path carries round-2\'s OWN questions first, then the person\'s fix text', async () => {
  const round2Plan = { ...PLAN_ONE, questions: ['still unclear whether X or Y'] };
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }, { plan: round2Plan }]);
  const { ask } = scriptAsk(['', 'fix', 'make it stricter', 'fix', 'also check the CLI']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.deepEqual(r.accepted?.openQuestions, ['still unclear whether X or Y', 'also check the CLI']);
});

test('(b5) F175: "type the goal yourself" still carries the drafted plan\'s own questions', async () => {
  const planWithQuestion = { ...PLAN_ONE, questions: ['is the CLI in or out of scope?'] };
  const { generate } = scriptConfirmGenerate([{ plan: planWithQuestion }]);
  const { ask } = scriptAsk(['', 'type-goal', 'My own goal sentence.']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted?.openQuestions, [planWithQuestion.questions[0]]);
});

test('(c) a book already at its ceiling from absorbed scout calls costs 0 confirm calls and cap-halts', async () => {
  const { generate, calls } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const { ask } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: 0.01 });
  book.absorb([{ label: 'scout', costUsd: 0.01, unpricedRounds: 0 }]);
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(calls.length, 0, 'the ceiling was already spent by the absorbed scout call — no confirm call is made');
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'cap-halt');
  assert.equal(r.rounds, 0);
  assert.equal(r.accepted, null);
});

test('(d) a null costUsd (unpriced) reply is a pricing-red, never a silent free pass', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE, costUsd: null }]);
  const { ask } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: 1 });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'pricing-red');
});

test('(e) input ending at the $0 question is confirm-abandoned, and costs 0 calls', async () => {
  const { generate, calls } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const { ask } = scriptAsk([]); // ends immediately — the very first ask() returns null
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(calls.length, 0);
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'confirm-abandoned');
  assert.equal(r.rounds, 0);
});

test('(f) "worse than before" is asked only for a repo source', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const repoAsk = scriptAsk(['nothing worse', 'confirm']);
  const bookRepo = makeCostBook({ ceilingUsd: null });
  await runConfirmTurn({ ...baseArgs({ isRepo: true }), generate, book: bookRepo, ask: repoAsk.ask });
  assert.equal(repoAsk.seen[0].kind, 'worseThanBefore');

  const folderAsk = scriptAsk(['confirm']);
  const bookFolder = makeCostBook({ ceilingUsd: null });
  const r2 = await runConfirmTurn({ ...baseArgs({ isRepo: false }), generate, book: bookFolder, ask: folderAsk.ask });
  assert.equal(folderAsk.seen[0].kind, 'menu', 'no worseThanBefore ask at all for a non-repo source');
  assert.equal(r2.accepted?.worseThanBefore, '');
});

test('(g) an ambiguous language offers exactly the candidates detectLanguage found', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const { ask, seen } = scriptAsk(['', 'python', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({
    ...baseArgs(), lang: { kind: 'ambiguous', candidates: ['js', 'python'], dir: '/repo' }, generate, book, ask,
  });
  const langStep = seen.find((s) => s.kind === 'language');
  assert.deepEqual(langStep.candidates, ['js', 'python']);
  assert.equal(r.accepted?.lang, 'python');
});

test('(h) a drafted goal naming none of the listed checks is still accepted — no code matcher (ruling 6)', async () => {
  const oddPlan = { checks: ['tests stay green'], goal: 'Ship it.', questions: [], notChecked: [] };
  const { generate } = scriptConfirmGenerate([{ plan: oddPlan }]);
  const { ask } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, true, 'never refused for a goal/checks mismatch — that judgement is the person\'s, not code\'s');
  assert.equal(r.accepted?.goal, 'Ship it.');
});

test('(i) a secret typed into a fix is redacted before it reaches openQuestions or the next round\'s prompt', async () => {
  const secretFix = 'use sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-abcdAA';
  const { generate, calls } = scriptConfirmGenerate([{ plan: PLAN_ONE }, { plan: PLAN_ONE }]);
  // round 1's OWN fix text feeds round 2's PROMPT (checked below); round 2's
  // fix text (F175: the only one that can still land in openQuestions, since
  // round 1's is superseded by the redraft it fed) is what the first
  // assertion checks — the same secret string covers both redaction points.
  const { ask } = scriptAsk(['', 'fix', secretFix, 'fix', secretFix]);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.accepted?.openQuestions[0], redactSecrets(secretFix));
  assert.notEqual(r.accepted?.openQuestions[0], secretFix);
  const round2Prompt = JSON.stringify(calls[1].messages);
  assert.ok(!round2Prompt.includes('sk-ant-api03'), 'the raw secret never reaches the next round\'s prompt');
});

test('(j) "type the goal yourself" replaces the drafted goal, redacted, and keeps the drafted checks/protections', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const { ask } = scriptAsk(['', 'type-goal', 'My own goal sentence.']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, true);
  assert.equal(r.accepted?.goal, 'My own goal sentence.');
  assert.deepEqual(r.accepted?.checks, PLAN_ONE.checks);
  assert.deepEqual(r.accepted?.protections, BASE_PROTECTIONS);
});

// ── fix #1 (run mu0voeo4, 2026-09-14): protections come from CODE, never the
// model ──────────────────────────────────────────────────────────────────────

test('a model-invented "protection" (e.g. a behavior-preservation guard this build cannot check) is never shown or recorded', async () => {
  const inventedPlan = {
    checks: ['tests stay green'], goal: 'Keep the tests green.', questions: [], notChecked: [],
    // a stub model trying to smuggle back a `protections` field anyway (the
    // exact shape run mu0voeo4 produced) — must be ignored entirely.
    protections: ['behavior-preservation guard (mandatory, always on): the patch must not change what the code does at runtime'],
  };
  const { generate } = scriptConfirmGenerate([{ plan: inventedPlan }]);
  const seenPlans = [];
  const { ask } = scriptAsk(['', 'confirm']);
  const wrappedAsk = async (/** @type {any} */ step) => {
    if (step.kind === 'menu') seenPlans.push(step.plan);
    return ask(step);
  };
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask: wrappedAsk });
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted?.protections, BASE_PROTECTIONS);
  assert.ok(!r.accepted?.protections.some((p) => p.includes('behavior-preservation')), 'the invented protection never reaches accepted');
  assert.deepEqual(seenPlans[0].protections, BASE_PROTECTIONS, 'the menu shows the REAL guard list, not the model\'s invented one');
  assert.ok(!JSON.stringify(seenPlans[0]).includes('behavior-preservation'), 'the invented text never even reaches the displayed plan');
});

test('the real protections equal classGuards\' own guard list (+ the write fence when set, absent when not)', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const seenPlans = [];
  const { ask } = scriptAsk(['', 'confirm']);
  const wrappedAsk = async (/** @type {any} */ step) => {
    if (step.kind === 'menu') seenPlans.push(step.plan);
    return ask(step);
  };
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs({ writeScope: null }), generate, book, ask: wrappedAsk });
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted?.protections, ['changed-from-seed', 'no-suppressions'].map(
    (name) => `${name} — ${GUARD_DESCRIPTIONS[name]}`,
  ));
  assert.ok(!r.accepted?.protections.some((p) => p.startsWith('write fence')), 'no fence line when writeScope is not set');
  assert.deepEqual(seenPlans[0].protections, r.accepted?.protections);
});

test('notChecked lines from the model are carried through to accepted and to what the menu displays', async () => {
  const planWithGap = {
    checks: ['tests stay green'], goal: 'Keep the tests green.', questions: [],
    notChecked: ['that the fix looks good to a human reviewer'],
  };
  const { generate } = scriptConfirmGenerate([{ plan: planWithGap }]);
  const seenPlans = [];
  const { ask } = scriptAsk(['', 'confirm']);
  const wrappedAsk = async (/** @type {any} */ step) => {
    if (step.kind === 'menu') seenPlans.push(step.plan);
    return ask(step);
  };
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask: wrappedAsk });
  assert.equal(r.ok, true);
  assert.deepEqual(r.accepted?.notChecked, planWithGap.notChecked);
  assert.deepEqual(seenPlans[0].notChecked, planWithGap.notChecked);
});

test('start-over stops the whole turn as confirm-restart, never a signable accept', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const { ask } = scriptAsk(['', 'start-over']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'confirm-restart');
  assert.equal(r.accepted, null);
});

test('a transport failure on the confirm call is provider-red, not artifact-red', async () => {
  const { generate } = scriptConfirmGenerate([{ error: 'ECONNRESET', text: '' }]);
  const { ask } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'provider-red');
});

test('a reply with no confirm-tool call is artifact-red', async () => {
  const { generate } = scriptConfirmGenerate([{ text: 'sure, sounds good' }]);
  const { ask } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'artifact-red');
  assert.equal(r.reds[0]?.code, 'artifact-red');
});

// ── wording sanity (not frozen-text pins — the prose is new and not yet cited
// by any historical run) ─────────────────────────────────────────────────────

test('CONFIRM_SYSTEM states ruling 6 (no unasked check) and cites run mtv8jihy', () => {
  assert.match(CONFIRM_SYSTEM, /never propose a check the goal.*did not ask for/i);
  assert.match(CONFIRM_SYSTEM, /mtv8jihy/);
  assert.match(CONFIRM_SYSTEM, /a protection is never a check and never named in the goal sentence/i);
});

test('CONFIRM_SYSTEM (fix #1, run mu0voeo4) orders the model to never claim its own protection/guard, and to report gaps honestly', () => {
  assert.match(CONFIRM_SYSTEM, /never claim, name, or list a protection or guard of your own/i);
  assert.match(CONFIRM_SYSTEM, /`notChecked`/);
  assert.match(CONFIRM_SYSTEM, /never omit a gap to make the plan look complete/i);
});

test('confirmPrompt shows each answer beside its label, and worse-than-before only when present', () => {
  const withWtb = confirmPrompt({
    answers: { 1: 'a', 2: 'b', 3: 'c' }, questions: GREEN_QUESTIONS, labels: FIELD_LABELS,
    isRepo: true, lang: 'js', worseThanBefore: 'do not slow the CLI',
  });
  assert.match(withWtb, /Q1 \(Goal\)\. what you want to achieve/);
  assert.match(withWtb, /A1\. a/);
  assert.match(withWtb, /WORSE THAN BEFORE.*do not slow the CLI/);

  const withoutWtb = confirmPrompt({
    answers: { 1: 'a', 2: 'b', 3: 'c' }, questions: GREEN_QUESTIONS, labels: FIELD_LABELS,
    isRepo: false, lang: 'js', worseThanBefore: '',
  });
  assert.ok(!/WORSE THAN BEFORE/.test(withoutWtb));
});

test('the confirm tool acknowledges without acting', async () => {
  const generate = async (/** @type {any} */ _m, /** @type {any} */ tools) => {
    const tool = tools.find((/** @type {any} */ t) => t.name === CONFIRM_TOOL_NAME);
    const ack = await tool.execute(PLAN_ONE);
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 }, ack };
  };
  const { ask } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(r.ok, true);
});

test('WORSE_THAN_BEFORE_FIELD / LANGUAGE_PICK_FIELD / CONFIRM_MENU are handed through as the `field` on their steps', async () => {
  const { generate } = scriptConfirmGenerate([{ plan: PLAN_ONE }]);
  const { ask, seen } = scriptAsk(['', 'confirm']);
  const book = makeCostBook({ ceilingUsd: null });
  await runConfirmTurn({ ...baseArgs(), generate, book, ask });
  assert.equal(seen[0].field, WORSE_THAN_BEFORE_FIELD);
  assert.equal(seen[1].field, CONFIRM_MENU);
  void LANGUAGE_PICK_FIELD; // exercised in test (g) above via the ambiguous-language path
  void CONFIRM_ACK;
});

// ── F179 (2026-09-15 ruling, retry not repair) — the confirm turn also goes
// through makeLoopGenerate (scripts/run-author.mjs:601's `confirmGenerate`),
// so a malformed tool-call reply on the confirm channel must retry through the
// SAME existing ladder (askStructured's MAX_STRUCTURE_RETRIES), never crash
// the confirm round. Modelled on authorflow.test.js's own F179 makeLoopGenerate
// tests, scoped here to the confirm channel/tool name instead.

test('runConfirmTurn (F179): a REAL OpenAIProvider malformed tool-call reply retries via the existing ladder within round 1 — never lost as a run-ending crash', async () => {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'deepseek-flash' });
  let call = 0;
  const okArgs = JSON.stringify(PLAN_ONE);
  provider._request = async () => {
    call += 1;
    const args = call === 1 ? `${okArgs}}` : okArgs; // round 1: valid JSON + trailing brace
    return {
      choices: [{
        message: { content: '', tool_calls: [{ id: `c${call}`, function: { name: CONFIRM_TOOL_NAME, arguments: args } }] },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 30 },
      model: 'deepseek-flash',
    };
  };
  const generate = makeLoopGenerate(provider);
  const { ask } = scriptAsk(['', 'confirm']); // worseThanBefore, then the menu pick
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });

  assert.equal(call, 2, 'the malformed-JSON retry happened WITHIN confirm round 1 — not a 2nd confirm round');
  assert.equal(r.ok, true, 'the sound 2nd attempt is what the confirm turn accepts');
  assert.equal(r.rounds, 1, 'still one confirm round shown to the person — the retry is internal to askStructured');
  assert.deepEqual(r.accepted, {
    goal: 'Keep the tests green.', checks: ['tests stay green'], protections: BASE_PROTECTIONS,
    lang: 'js', worseThanBefore: '', openQuestions: [], notChecked: [],
  });
  const report = book.report();
  assert.equal(report.calls.length, 2, 'both the malformed and the sound call are booked');
  for (const c of report.calls) assert.equal(typeof c.costUsd, 'number', 'F179 2026-09-15: priced off real usage, never a null-cost casualty for this path');
});

test('runConfirmTurn (F179): every attempt malformed exhausts the retry ladder inside round 1 and reads as the confirm turn\'s own artifact-red stop, never a crash', async () => {
  const { OpenAIProvider } = await import('bare-agent/providers');
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'deepseek-flash' });
  let call = 0;
  provider._request = async () => {
    call += 1;
    return {
      choices: [{
        message: { content: '', tool_calls: [{ id: `c${call}`, function: { name: CONFIRM_TOOL_NAME, arguments: `${JSON.stringify(PLAN_ONE)}}` } }] },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 30 },
      model: 'deepseek-flash',
    };
  };
  const generate = makeLoopGenerate(provider);
  const { ask } = scriptAsk(['']); // worseThanBefore only — no menu pick reached
  const book = makeCostBook({ ceilingUsd: null });
  const r = await runConfirmTurn({ ...baseArgs(), generate, book, ask });

  assert.equal(call, 1 + MAX_STRUCTURE_RETRIES, 'the ladder ran to its existing cap, no new cap');
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'artifact-red');
  assert.equal(r.reds[0]?.axis, 'malformed-tool-call-arguments');
  const report = book.report();
  assert.equal(report.calls.length, 1 + MAX_STRUCTURE_RETRIES);
  assert.equal(report.spendComplete, true, 'every attempt priced — none fell back to a null-cost casualty');
});
