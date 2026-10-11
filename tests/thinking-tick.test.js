// PANEL-BUILD.md P8 batch 5 — the per-job "Thinking on" tick. bareloop keeps no per-model thinking list: bare-agent (>=0.52) answers what a
// model can switch, and these tests drive bare-agent's REAL `thinkingSupport` and REAL provider classes (a stub in place of it could read green
// with and without the fix). Request bodies are captured at the provider's own `_request` seam; nothing reaches a network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeProvider } from '../src/providers.js';
import {
  thinkingSupport, thinkingOptions, thinkingCallOptions, thinkingForLine, thinkingRowText, assertThinkingMode, THINKING_FIXED_SAY, THINKING_MODES,
} from '../src/thinking.js';
import { runLocate, defaultJudgeLoop, JUDGE_MAX_TOKENS } from '../src/judged.js';
import { makeLoopGenerate } from '../src/authorflow.js';
import { runAuthorScout } from '../src/authorscout.js';
import { validateJob, jobSpecHash } from '../src/job.js';

// ── what bare-agent says (REAL answers) and the table ───────────────────────────────────────────────────────────────────────────────

test('thinkingSupport: bare-agent\'s own measured answers through the shape map — switchable true, measured-not-switchable false, unmeasured \'unverified\'', () => {
  assert.equal(thinkingSupport('openai-api', 'gpt-5'), true);
  assert.equal(thinkingSupport('openai-api', 'deepseek-flash', { baseUrl: 'https://gw.example/v1' }), true, 'bare-agent recognises the model id; bareloop has no regex of its own');
  assert.equal(thinkingSupport('anthropic-api', 'claude-opus-5-5'), false, 'a measured not-switchable model');
  assert.equal(thinkingSupport('openai-api', 'some-local-model'), 'unverified', 'an unknown model');
  assert.equal(thinkingSupport('anthropic-api', 'some-unknown-model'), 'unverified');
  assert.equal(thinkingSupport('gemini-api', 'some-unknown-model'), 'unverified');
  // a missing kind, a non-function impl and a throw are all 'unverified' — never a guess
  assert.equal(thinkingSupport('clipipe-subscription', 'x'), 'unverified');
  assert.equal(thinkingSupport('openai-api', 'gpt-5', { impl: /** @type {any} */ ('nope') }), 'unverified');
  assert.equal(thinkingSupport('openai-api', 'gpt-5', { impl: () => { throw new Error('boom'); } }), 'unverified');
});

test('thinkingOptions: the table, cell by cell (off + unverified sends off — bare-agent decides, hamr 2026-10-11)', () => {
  assert.deepEqual(thinkingOptions(true, true), { thinkingMode: 'on' });
  assert.deepEqual(thinkingOptions(false, true), {}, 'the box is greyed; it cannot be on');
  assert.deepEqual(thinkingOptions('unverified', true), { thinkingMode: 'on' });
  assert.deepEqual(thinkingOptions(true, false), { thinkingMode: 'off' });
  assert.deepEqual(thinkingOptions(false, false), {}, 'the model thinks as it would');
  assert.deepEqual(thinkingOptions('unverified', false), { thinkingMode: 'off' });
});

test('thinkingCallOptions: default off; the enumerated knob throws on anything else; a test double is never sent the switch; the options come off the REAL support answer', () => {
  assert.deepEqual([...THINKING_MODES], ['on', 'off']);
  const gpt5 = makeProvider('openai-api', { apiKey: 'k', model: 'gpt-5' });
  assert.deepEqual(thinkingCallOptions(gpt5), { thinkingMode: 'off' }, 'no value = off');
  assert.deepEqual(thinkingCallOptions(gpt5, 'on'), { thinkingMode: 'on' }, 'the tick sends on (it used to send nothing)');
  assert.deepEqual(thinkingCallOptions(makeProvider('anthropic-api', { apiKey: 'k', model: 'claude-opus-5-5' }), 'off'), {});
  assert.deepEqual(thinkingCallOptions(makeProvider('anthropic-api', { apiKey: 'k', model: 'claude-opus-5-5' }), 'on'), {});
  assert.deepEqual(thinkingCallOptions(makeProvider('openai-api', { apiKey: 'k', model: 'some-local-model' }), 'off'), { thinkingMode: 'off' });
  assert.deepEqual(thinkingCallOptions({ model: 'gpt-5' }, 'off'), {}, 'not a constructed provider: never sent');
  for (const bad of ['default', 'OFF', '', null, true, 0, {}]) assert.throws(() => thinkingCallOptions(gpt5, bad), /draftThinking must be one of on \| off/);
  assert.throws(() => assertThinkingMode('maybe'), /draftThinking must be one of/);
  assert.throws(() => makeLoopGenerate(gpt5, { draftThinking: 'nope' }), /draftThinking must be one of/, 'and at the generate seam, at construction');
});

test('thinkingForLine: the server\'s answer for the box — false greys and unticks with the one sentence; \'unverified\' stays enabled with no note', () => {
  assert.equal(THINKING_FIXED_SAY, "can't change this for this model");
  assert.deepEqual(thinkingForLine('anthropic-api', 'claude-opus-5-5', null), { support: false, canChange: false, say: "can't change this for this model" });
  assert.deepEqual(thinkingForLine('openai-api', 'some-local-model', 'https://x.example/v1'), { support: 'unverified', canChange: true, say: '' });
  assert.deepEqual(thinkingForLine('openai-api', 'gpt-5', ''), { support: true, canChange: true, say: '' });
});

test('thinkingRowText: code-owned, ALWAYS starting "thinking on" / "thinking off"; each bare-agent status has its own words', () => {
  assert.equal(thinkingRowText({ mode: 'off', support: true }), 'thinking off');
  assert.equal(thinkingRowText({ mode: 'on', support: true }), 'thinking on');
  assert.equal(thinkingRowText({ mode: 'off', support: false }), "thinking on (this model can't change it)");
  assert.equal(thinkingRowText({ mode: 'off', support: 'unverified' }), 'thinking off (not verified for this model)');
  assert.equal(thinkingRowText({ mode: 'off', status: 'applied' }), 'thinking off');
  assert.equal(thinkingRowText({ mode: 'on', status: 'applied' }), 'thinking on');
  assert.equal(thinkingRowText({ mode: 'off', status: 'unsupported' }), "thinking on (this model can't change it)");
  assert.equal(thinkingRowText({ mode: 'off', status: 'ignored' }), 'thinking on (the model thought anyway)');
  assert.equal(thinkingRowText({ mode: 'off', status: 'unknown' }), 'thinking off (not confirmed)');
  assert.equal(thinkingRowText({ mode: 'on', status: 'unknown' }), 'thinking on (not confirmed)');
});

// ── what goes on the wire (real provider classes, `_request` captured) ───────────────────────────────────────────────────────────────

/** every request body a real provider asks to send while `fn(provider)` runs; the stub answers with a plain one-round text reply */
async function captureBodies(/** @type {string} */ shape, /** @type {string} */ model, /** @type {(p: any) => Promise<any>} */ fn, /** @type {any} */ opts = {}) {
  const provider = makeProvider(shape, { apiKey: 'test-key', model, ...opts });
  /** @type {any[]} */
  const bodies = [];
  /** @type {any} */ (provider)._request = async (/** @type {any} */ a, /** @type {any} */ b) => {
    bodies.push(JSON.parse(JSON.stringify(shape === 'openai-api' ? b : a)));
    if (shape === 'openai-api') return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 }, model };
    if (shape === 'anthropic-api') return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, model };
    return { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
  };
  await fn(provider);
  return bodies;
}
const THINK_KEYS = ['thinking', 'reasoning_effort', 'think'];
const thinkingFields = (/** @type {any} */ b) => Object.fromEntries(THINK_KEYS.filter((k) => k in b).map((k) => [k, b[k]]));

const CARD = { items: [{ rule: 'has-doc', text: 'Every top-level function has a JSDoc block directly above it.' }] };
const ARTIFACT = '/** doc */\nexport function a() {}\n';
/** one judge locate through the real `defaultJudgeLoop` with the job's SIGNED tick */
const judgeBody = async (/** @type {string} */ shape, /** @type {string} */ model, /** @type {boolean} */ thinking, /** @type {any} */ opts = {}) => {
  const [b] = await captureBodies(shape, model, (p) => runLocate({ artifactText: ARTIFACT, card: CARD, loopFactory: ({ system }) => defaultJudgeLoop({ provider: p, system, thinking }) }), opts);
  assert.ok(b, 'the locate request reached the provider seam');
  return b;
};

test('the JUDGE follows the signed tick: off = the bare-agent off shape, on = the on shape, per model; the 4000-token cap and the row\'s old-max_tokens spelling are untouched', async () => {
  const off = await judgeBody('openai-api', 'deepseek-flash', false, { legacyMaxTokens: true });
  assert.deepEqual(off.thinking, { type: 'disabled' });
  assert.equal(JUDGE_MAX_TOKENS, 4000);
  assert.equal(off.max_tokens, 4000, 'the ROW\'s tick (not a model-id sniff) gives the legacy max_tokens key (F149)');
  const on = await judgeBody('openai-api', 'deepseek-flash', true, { legacyMaxTokens: true });
  assert.equal('thinking' in on, false, 'on for a model that thinks by default needs no field');
  assert.equal((await judgeBody('openai-api', 'deepseek-flash', false)).max_completion_tokens, 4000, 'with the row\'s tick OFF the modern key is used');
  assert.equal((await judgeBody('openai-api', 'gpt-5', false)).reasoning_effort, 'minimal');
  assert.equal((await judgeBody('openai-api', 'gpt-5', true)).reasoning_effort, 'medium');
  assert.equal('thinking' in (await judgeBody('openai-api', 'gpt-5', false)), false, 'NEVER the raw thinking field');
});

test('a judge on a model measured NOT switchable gets nothing at either tick; an UNVERIFIED model is sent the off shape when unticked (bare-agent decides) and on when ticked', async () => {
  for (const tick of [false, true]) assert.deepEqual(thinkingFields(await judgeBody('anthropic-api', 'claude-opus-5-5', tick)), {}, `tick=${tick}`);
  assert.deepEqual(thinkingFields(await judgeBody('openai-api', 'some-local-model', false)), { reasoning_effort: 'none' });
  assert.deepEqual(thinkingFields(await judgeBody('openai-api', 'some-local-model', true)), { reasoning_effort: 'medium' });
});

test('the DRAFTER follows the tick through makeLoopGenerate (default off), and the same instance\'s other calls are not touched', async () => {
  const call = (/** @type {any} */ mode) => (/** @type {any} */ p) => makeLoopGenerate(p, mode === undefined ? {} : { draftThinking: mode })([{ role: 'user', content: 'hi' }], [], {});
  const [none] = await captureBodies('openai-api', 'deepseek-flash', call(undefined));
  const [off] = await captureBodies('openai-api', 'deepseek-flash', call('off'));
  const [on] = await captureBodies('openai-api', 'deepseek-flash', call('on'));
  assert.deepEqual(none.thinking, { type: 'disabled' }, 'no value = off');
  assert.deepEqual(none, off);
  assert.equal('thinking' in on, false);
  const { thinking: _t, ...offSans } = off;
  assert.deepEqual(on, offSans, "'on' is byte-identical to the off body minus the one thinking field");
  // a raw call on the same instance carries nothing: the option rides per CALL, never the constructor
  const [raw] = await captureBodies('openai-api', 'deepseek-flash', (p) => p.generate([{ role: 'user', content: 'hi' }], [], {}));
  assert.deepEqual(thinkingFields(raw), {});
});

test('the scout (every call it makes) carries the drafter options through runAuthorScout({callOptions})', async () => {
  const surveyor = async () => ({ tools: [{ name: 'shell_read', description: 'read', parameters: { type: 'object', properties: {} }, execute: async () => '' }], policy: null, onLlmResult: null, cleanup: async () => {} });
  const run = (/** @type {any} */ callOptions) => (/** @type {any} */ p) => runAuthorScout({ workdir: '/w', provider: p, createSurveyor: surveyor, attempts: 1, ...(callOptions ? { callOptions } : {}) });
  const off = await captureBodies('openai-api', 'deepseek-flash', run({ thinkingMode: 'off' }));
  assert.ok(off.length >= 1);
  assert.ok(off.every((b) => b.thinking && b.thinking.type === 'disabled'), 'survey, recovery and re-ask rounds alike');
  const none = await captureBodies('openai-api', 'deepseek-flash', run(null));
  assert.ok(none.length >= 1);
  assert.ok(none.every((b) => !('thinking' in b)));
});

// ── the signed field ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const BASE = {
  schema: 'job-v1', job: 'thinking-tick-job', description: 'tick fixture', provider: 'openai-api', model: 'a-model', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5,
  writeScope: ['src/**'], goal: 'Fix any failure in src/ so the suite passes.', verdictType: 'green', close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }],
  tools: ['read', 'grep', 'write', 'edit'], escalation: { mode: 'decision-ready' },
};

test('job.thinking: an optional boolean; absent = off with the hash the spec always had; present moves the hash; anything but a boolean is a red', () => {
  assert.equal(validateJob({ ...BASE }, { shellCapUsd: 100 }).ok, true);
  assert.equal(validateJob({ ...BASE, thinking: true }, { shellCapUsd: 100 }).ok, true);
  assert.equal(validateJob({ ...BASE, thinking: false }, { shellCapUsd: 100 }).ok, true);
  for (const bad of ['yes', 1, null, {}, []]) {
    const r = validateJob({ ...BASE, thinking: bad }, { shellCapUsd: 100 });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.reds.some((x) => x.path === 'thinking'), JSON.stringify(r.reds));
  }
  // the hash a spec WITHOUT the field had before this feature (computed from the pre-change source) is unchanged
  assert.equal(jobSpecHash(BASE), PRE_FEATURE_HASH, 'an unticked job keeps the hash it would have had');
  assert.notEqual(jobSpecHash({ ...BASE, thinking: true }), PRE_FEATURE_HASH, 'a ticked job\'s hash differs');
});
// computed by the PRE-CHANGE src/job.js (a copy of the commit before this feature) for BASE above
const PRE_FEATURE_HASH = '2afe71c27a13230e9799a46cd14651b909c1783f98457577f49702b6bacd950e';

// ── the three judge constructors and the worker (source-level pins, labelled as such: each is reached only through a real run) ────────

test('source pins: the judge is built with the SIGNED tick in all three constructors (the run, run-author, the panel\'s calibration gate); the WORKER gets no thinking option', () => {
  const read = (/** @type {string} */ f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(read('src/planrun.js'), /defaultJudgeLoop\(\{ provider: judgeProvider, system: o\.system, rates: judgeRates, thinking: job\.thinking === true \}\)/, 'the run');
  assert.match(read('src/authorrun.js'), /defaultJudgeLoop\(\{ provider: judgeProvider, system: o\.system, rates: judgePrice\?\.rates \?\? null, thinking: spec\.thinking === true \}\)/, 'run-author');
  assert.match(read('src/panel/authorsession.js'), /defaultJudgeLoop\(\{ provider: judgeProvider, system: o\.system, rates: judgePrice\?\.rates \?\? null, thinking: spec\.thinking === true \}\)/, 'the calibration gate — the same tick as the later grading');
  for (const f of ['src/userrun.js', 'src/providers.js']) assert.ok(!/thinkingMode|thinkingCallOptions/.test(read(f).replace(/\/\/.*$/gm, '')), `${f}: the worker\'s provider construction carries no thinking option`);
  for (const [f, re] of [['src/providers.js', /thinkingSupport|deepseek/i], ['src/thinking.js', /deepseek/i]]) assert.ok(!re.test(read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${f}: no vendor regex or per-model list`);
});

// ── the page: the box follows the SERVER's per-line answer; the tick rides the card ────────────────────────────────────────────────────

const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
function fnSrc(/** @type {string} */ name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} is in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}

test('page: the tick is a checkbox under Model with a note line, unticked by default, CSS as designed; currentCard sends it as a boolean', () => {
  assert.match(PAGE, /<label class="jf-thinking" id="jf-thinking-label"><input type="checkbox" id="jf-thinking" data-testid="jf-thinking"> Thinking on<\/label>/);
  assert.match(PAGE, /<div class="hint" id="jf-thinking-note" data-testid="jf-thinking-note"><\/div>/);
  assert.ok(!/id="jf-thinking"[^>]*checked/.test(PAGE), 'unticked by default');
  assert.match(PAGE, /\.field label\.jf-thinking\{display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:6px;margin-top:6px;font-size:12px;text-transform:none;letter-spacing:0;\}/);
  assert.match(PAGE, /thinking: thinkingBox\.checked === true,/);
  assert.ok(PAGE.indexOf('id="jf-thinking"') > PAGE.indexOf('id="jf-model"') && PAGE.indexOf('id="jf-thinking"') < PAGE.indexOf('id="jf-name"'), 'directly under Model');
});

test('page: syncThinking — canChange:false greys AND unticks the box with the server\'s words; \'unverified\' (canChange true) stays enabled with no note; a live session or a reuse card locks it', () => {
  const mk = (/** @type {any} */ line, /** @type {any} */ over = {}) => {
    const thinkingBox = { checked: true, disabled: false };
    const thinkingNote = { textContent: 'old' };
    const label = { hidden: false };
    const lineThinking = { 'K|m': line };
    const api = new Function('thinkingBox', 'thinkingNote', 'lineThinking', 'modelSelect', 'document',
      `var sessionLive = ${over.sessionLive === true}; var resumeRun = ${over.resume ? '{}' : 'null'}; var reuseOn = ${over.reuse === true};\n${fnSrc('syncThinking')}\nreturn syncThinking;`)(
      thinkingBox, thinkingNote, lineThinking, { value: 'K|m' }, { getElementById: () => label });
    api();
    return { thinkingBox, thinkingNote, label };
  };
  const blocked = mk({ support: false, canChange: false, say: THINKING_FIXED_SAY });
  assert.deepEqual([blocked.thinkingBox.checked, blocked.thinkingBox.disabled, blocked.thinkingNote.textContent], [false, true, "can't change this for this model"]);
  const unverified = mk({ support: 'unverified', canChange: true, say: '' });
  assert.deepEqual([unverified.thinkingBox.checked, unverified.thinkingBox.disabled, unverified.thinkingNote.textContent], [true, false, ''], 'the person\'s tick is kept when the new line allows it');
  assert.equal(mk({ support: true, canChange: true, say: '' }, { sessionLive: true }).thinkingBox.disabled, true, 'a live session is frozen');
  assert.equal(mk({ support: true, canChange: true, say: '' }, { resume: true }).thinkingBox.disabled, true);
  const reuse = mk({ support: true, canChange: true, say: '' }, { reuse: true });
  assert.deepEqual([reuse.thinkingBox.disabled, reuse.label.hidden], [true, true], 'a Reuse card does not offer the tick');
  assert.deepEqual(mk(null).thinkingBox.disabled, false, 'no line known: the box is the person\'s');
});

test('page: Clear unticks the box; a saved card restores it (fillCard); changing the model keeps the tick if the new line allows it', () => {
  assert.match(fnSrc('resetCard'), /setThinkingTick\(false\);/);
  assert.match(fnSrc('fillCard'), /setThinkingTick\(c\.thinking === true\);/);
  assert.match(PAGE, /modelSelect\.addEventListener\("change", syncThinking\);/);
  assert.match(fnSrc('setThinkingTick'), /thinkingBox\.checked = on === true; syncThinking\(\);/);
});
