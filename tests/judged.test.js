// THE JUDGED FLOOR'S CORE (softgreen module 1) — LOCATE + DECIDE.
//
// What is under test is not "does a judge work". It is the four things the
// design record (2026-08-17 §4) and the POC paid for:
//
//   - the judge NEVER renders a verdict. `decide()` is a pure function with no
//     model in it, and every rule it dispatches comes off an OWNED enumerated
//     table — a card naming a rule we do not own is INEXPRESSIBLE, not rejected
//     late (`check-passes(name)`, again);
//   - UNSURE = RED, on every route in. Absent facts, a parse failure, a
//     truncation, an empty function list, a missing per-rule field and a quote
//     the artifact does not contain must ALL land on red. Each has its own
//     negative control below, because a fail-safe default nobody watched fail
//     is a promise, not a guard;
//   - FIRST-RED-WINS, in CARD ORDER, stably. The card is signed and enumerated,
//     so its order is the arbiter's order and never the iteration order of
//     whatever the model happened to emit;
//   - QUOTE-ANCHORED beats DERIVED. The POC measured `paramNames` drifting
//     between reps on the same file; `decide()` therefore cross-checks every
//     derived param name against the function's own `declarationQuote` and
//     reds when the two disagree.
//
// The facts fixtures are RECONSTRUCTED from the POC's two REAL artifacts
// (poc/softgreen-judge/artifact-pass.txt — src/spine.js, fully documented; and
// artifact-red.txt — a real scripts/n3-preprobe-grade.mjs excerpt with three
// undocumented top-level functions). The POC persisted its INPUTS but not its
// locate emissions, so the fixtures are reconstructed rather than lifted, and
// they are read against the real artifact text in the quote-verification tests
// — which is the strongest thing available short of a paid call. NO test in
// this file makes a paid call: every model seam is an injected fake.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  JUDGE_MODEL, JUDGE_MAX_TOKENS, JUDGE_RULES, JUDGE_RULE_IDS, LOCATE_AXES,
  validateCard, validateFacts, locatePrompt, runLocate, decide,
} from '../src/judged.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POC = join(HERE, '..', 'poc', 'softgreen-judge');
const passArtifact = readFileSync(join(POC, 'artifact-pass.txt'), 'utf8');
const redArtifact = readFileSync(join(POC, 'artifact-red.txt'), 'utf8');

/** the three-item card the POC's Q6 answer compiled into */
const CARD = {
  items: [
    { rule: 'has-doc', text: 'Every top-level function has a JSDoc block directly above it.' },
    { rule: 'params', text: 'Every parameter of every top-level function is named in an @param tag.' },
    { rule: 'returns', text: 'Every top-level function that returns a value documents it with @returns.' },
  ],
};

// ── the RECONSTRUCTED facts, quote-anchored to the two real artifacts ────────

/** src/spine.js: ONE top-level function; `emit` is NESTED and must not appear */
const PASS_FACTS = {
  functions: [{
    name: 'makeSpine',
    declarationQuote: 'export function makeSpine(file, { startSeq = 0 } = {}) {',
    docQuote: '/**',
    paramNames: ['file', '{ startSeq = 0 } = {}'],
    paramIsPattern: [false, true],
    paramTagNames: ['file', 'opts'],
    returnsTagQuote: ' * @returns {(type: string, data?: object) => object} emit — returns the event as written',
    returnsValueQuote: '    return ev;',
  }],
};

/** the n3-preprobe-grade excerpt: three top-level functions, none documented */
const RED_FACTS = {
  functions: [
    {
      name: 'namesHit',
      declarationQuote: 'const namesHit = (p, list) => { const t = planText(p); return list.filter((fn) => t.includes(fn)); };',
      docQuote: null,
      paramNames: ['p', 'list'],
      paramIsPattern: [false, false],
      paramTagNames: [],
      returnsTagQuote: null,
      returnsValueQuote: 'const namesHit = (p, list) => { const t = planText(p); return list.filter((fn) => t.includes(fn)); };',
    },
    {
      name: 'features',
      declarationQuote: 'function features(p) {',
      docQuote: null,
      paramNames: ['p'],
      paramIsPattern: [false],
      paramTagNames: [],
      returnsTagQuote: null,
      returnsValueQuote: '  return {',
    },
    {
      name: 'score',
      declarationQuote: 'function score(row) {',
      docQuote: null,
      paramNames: ['row'],
      paramIsPattern: [false],
      paramTagNames: [],
      returnsTagQuote: null,
      returnsValueQuote: '  return { ...f, aimHits: aimHits.length, memoHits: memoHits.length, memoNames: memoHits, winShape };',
    },
  ],
};

/** deep clone so a mutation in one test cannot leak into the next */
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── the owned rule table ─────────────────────────────────────────────────────

test('the rule table is OWNED and enumerated — a card can only name what we implement', () => {
  assert.ok(Array.isArray(JUDGE_RULE_IDS) && JUDGE_RULE_IDS.length > 0);
  for (const id of JUDGE_RULE_IDS) {
    const rule = JUDGE_RULES[id];
    assert.equal(rule.id, id, 'the table is keyed by the rule id it carries');
    assert.equal(typeof rule.ask, 'string');
    assert.ok(rule.ask.length > 0, 'every rule states the facts it needs, in the prompt');
    assert.equal(typeof rule.check, 'function');
  }
  assert.ok(Object.isFrozen(JUDGE_RULES), 'the rulebook is arbiter-owned — no caller edits it');
});

test('the judge model is PINNED and never agent-selectable', () => {
  assert.equal(JUDGE_MODEL, 'claude-haiku-4-5');
  assert.ok(Number.isFinite(JUDGE_MAX_TOKENS) && JUDGE_MAX_TOKENS > 0);
});

// ── the card schema ──────────────────────────────────────────────────────────

test('validateCard accepts the POC card and names every shape miss', () => {
  assert.deepEqual(validateCard(CARD), { ok: true, reds: [] });

  const bad = [
    [null, 'absent card'],
    [{}, 'no items'],
    [{ items: [] }, 'empty items'],
    [{ items: [{ rule: 'has-doc' }] }, 'item with no text'],
    [{ items: [{ text: 'x' }] }, 'item with no rule'],
    [{ items: [{ rule: 'has-doc', text: '   ' }] }, 'whitespace text'],
    [{ items: [{ rule: 'no-such-rule', text: 'x' }] }, 'a rule we do not own'],
    [{ items: [{ rule: 'has-doc', text: 'a' }, { rule: 'has-doc', text: 'b' }] }, 'the same rule twice'],
  ];
  for (const [card, label] of bad) {
    const v = validateCard(card);
    assert.equal(v.ok, false, `${label} must be refused`);
    assert.ok(v.reds.length > 0 && v.reds.every((r) => typeof r === 'string' && r.length > 0), `${label} names itself`);
  }
});

test('an unowned rule is INEXPRESSIBLE — the red names the enumerated set', () => {
  const v = validateCard({ items: [{ rule: 'vibes', text: 'it should feel good' }] });
  assert.equal(v.ok, false);
  assert.ok(v.reds.join(' ').includes('vibes'));
  for (const id of JUDGE_RULE_IDS) assert.ok(v.reds.join(' ').includes(id), `the refusal hands over ${id}`);
});

// ── the facts schema ─────────────────────────────────────────────────────────

test('validateFacts accepts both real-shaped fixtures', () => {
  assert.deepEqual(validateFacts(PASS_FACTS), { ok: true, reds: [] });
  assert.deepEqual(validateFacts(RED_FACTS), { ok: true, reds: [] });
});

test('validateFacts refuses every shape miss — an artifact-red, not a verdict', () => {
  const bad = [
    [null, 'absent'],
    ['{"functions":[]}', 'a string'],
    [[], 'an array'],
    [{}, 'no functions key'],
    [{ functions: {} }, 'functions is not an array'],
    [{ functions: [null] }, 'a null entry'],
    [{ functions: ['makeSpine'] }, 'a string entry'],
    [{ functions: [{ declarationQuote: 'x' }] }, 'an entry with no name'],
    [{ functions: [{ name: '', declarationQuote: 'x' }] }, 'an entry with an empty name'],
  ];
  for (const [facts, label] of bad) {
    const v = validateFacts(facts);
    assert.equal(v.ok, false, `${label} must be refused`);
    assert.ok(v.reds.length > 0, `${label} names itself`);
  }
});

test('an EMPTY function list passes the SHAPE gate and is a decide-red', () => {
  // the emission is well formed; what it says is "I found nothing", and unsure is red.
  assert.deepEqual(validateFacts({ functions: [] }), { ok: true, reds: [] });
  assert.equal(decide({ functions: [] }, CARD).verdict, 'red');
});

// ── the LOCATE prompt ────────────────────────────────────────────────────────

test('locatePrompt embeds the card rules, both POC cures, and asks for no verdict', () => {
  const p = locatePrompt(CARD);
  for (const it of CARD.items) assert.ok(p.includes(JUDGE_RULES[it.rule].ask), `the ${it.rule} clause is in the prompt`);
  // cure 1 (POC): nested functions are not top-level functions
  assert.ok(/nested/i.test(p), 'the nested-function cure clause rides');
  // cure 2 (POC): a destructured parameter has no name — flag it as a pattern
  assert.ok(p.includes('paramIsPattern'), 'the destructuring cure clause rides');
  // the whole argument of §4.2: LOCATE, never VERDICT
  assert.ok(/never decide|never judge/i.test(p), 'the judge is told it renders nothing');
  assert.ok(/untrusted/i.test(p), 'the artifact is framed as untrusted data');
  assert.ok(!/\bpass(es)?\b.*\bfail(s)?\b/i.test(p.split('\n')[0]), 'the first line does not ask for a verdict');
});

test('locatePrompt asks ONLY for the facts the card actually needs', () => {
  const one = locatePrompt({ items: [{ rule: 'has-doc', text: 'documented' }] });
  assert.ok(one.includes(JUDGE_RULES['has-doc'].ask));
  assert.ok(!one.includes(JUDGE_RULES.returns.ask), 'an unnamed rule buys no prompt tokens');
});

test('locatePrompt refuses an invalid card rather than prompting on garbage', () => {
  assert.throws(() => locatePrompt({ items: [{ rule: 'vibes', text: 'x' }] }), /card/i);
});

// ── decide(): the pass side and the red side, over the two real artifacts ────

test('decide PASSES the fully documented real artifact', () => {
  const d = decide(PASS_FACTS, CARD, { artifactText: passArtifact });
  assert.equal(d.verdict, 'pass', JSON.stringify(d.items));
  assert.equal(d.firstRed, null);
  assert.equal(d.items.length, CARD.items.length);
  assert.ok(d.items.every((i) => i.ok && i.reds.length === 0));
});

test('decide REDS the undocumented real artifact, itemized and quote-carrying', () => {
  const d = decide(RED_FACTS, CARD, { artifactText: redArtifact });
  assert.equal(d.verdict, 'red');
  const hasDoc = d.items.find((i) => i.rule === 'has-doc');
  assert.equal(hasDoc.ok, false);
  assert.equal(hasDoc.reds.length, 3, 'all three undocumented functions are named');
  for (const r of hasDoc.reds) {
    assert.ok(['namesHit', 'features', 'score'].includes(r.fn));
    assert.ok(typeof r.why === 'string' && r.why.length > 0);
    assert.ok(typeof r.quote === 'string' && redArtifact.includes(r.quote.trim()), 'the red carries an ADDRESS from the artifact');
  }
});

test('the two sides SEPARATE — the same card, two real artifacts, two verdicts', () => {
  // the POC's own can-this-fail control, kept: if both sides came out the same
  // the pipe would be measuring nothing.
  assert.notEqual(
    decide(PASS_FACTS, CARD).verdict,
    decide(RED_FACTS, CARD).verdict,
  );
});

// ── UNSURE = RED: one negative control per route in ──────────────────────────

test('unsure is RED — absent, malformed, empty and shape-broken facts all decide red', () => {
  const routes = [
    [null, 'absent facts (a parse failure upstream)'],
    [undefined, 'undefined facts (a truncation upstream)'],
    [{ functions: [] }, 'an empty function list'],
    [{ functions: [{ name: 'x' }] }, 'a function with no facts at all'],
    [{ nope: 1 }, 'a shape miss'],
    ['{"functions":[]}', 'an unparsed string'],
  ];
  for (const [facts, label] of routes) {
    const d = decide(facts, CARD);
    assert.equal(d.verdict, 'red', `${label} must decide RED`);
    assert.ok(typeof d.reason === 'string' && d.reason.length > 0, `${label} says why`);
  }
});

test('a MISSING per-rule field is unsure, and unsure is red — never a silent pass', () => {
  // has-doc: a docQuote that is not a JSDoc opener is not a doc block
  const notDoc = clone(PASS_FACTS);
  notDoc.functions[0].docQuote = '// makeSpine builds a spine';
  assert.equal(decide(notDoc, CARD).verdict, 'red');

  // params: no param facts at all
  const noParams = clone(PASS_FACTS);
  delete noParams.functions[0].paramNames;
  const dp = decide(noParams, CARD);
  assert.equal(dp.verdict, 'red');
  assert.ok(dp.items.find((i) => i.rule === 'params').reds.some((r) => /unsure/i.test(r.why)));

  // params: tags absent (not merely empty)
  const noTags = clone(PASS_FACTS);
  noTags.functions[0].paramTagNames = null;
  assert.equal(decide(noTags, CARD).verdict, 'red');
});

test('a value returned with no @returns tag is a red on the returns item only', () => {
  const f = clone(PASS_FACTS);
  f.functions[0].returnsTagQuote = null;
  const d = decide(f, { items: [CARD.items[2]] });
  assert.equal(d.verdict, 'red');
  assert.equal(d.items[0].rule, 'returns');
  assert.ok(d.items[0].reds[0].why.includes('@returns'));
});

test('a param with no @param tag reds, and the count rule catches the coarser miss', () => {
  const missing = clone(PASS_FACTS);
  missing.functions[0].paramTagNames = ['opts'];       // `file` undocumented
  const d1 = decide(missing, { items: [CARD.items[1]] });
  assert.equal(d1.verdict, 'red');
  assert.ok(d1.items[0].reds[0].why.includes('file'));

  // a DESTRUCTURED param has no name to match, so the count rule is what covers it
  const short = clone(PASS_FACTS);
  short.functions[0].paramTagNames = ['file'];         // one tag, two param slots
  const d2 = decide(short, { items: [CARD.items[1]] });
  assert.equal(d2.verdict, 'red');
  assert.ok(/tag/i.test(d2.items[0].reds[0].why));
});

// ── quote-anchored beats derived (the POC's measured drift) ──────────────────

test('a derived param name absent from the declaration QUOTE is drift — and drift is red', () => {
  const drift = clone(PASS_FACTS);
  drift.functions[0].paramNames = ['file', 'opts'];    // `opts` appears nowhere in the declaration
  drift.functions[0].paramIsPattern = [false, false];
  drift.functions[0].paramTagNames = ['file', 'opts']; // …and it would otherwise PASS
  const d = decide(drift, CARD);
  assert.equal(d.verdict, 'red', 'a quote-unanchored param name must never buy a pass');
  assert.ok(d.items.find((i) => i.rule === 'params').reds.some((r) => /declaration|unsure/i.test(r.why)));
});

test('a quote the artifact does not contain is red when the artifact is in hand', () => {
  const invented = clone(PASS_FACTS);
  invented.functions[0].declarationQuote = 'export function makeSpineDeluxe(file, opts) {';
  const withText = decide(invented, CARD, { artifactText: passArtifact });
  assert.equal(withText.verdict, 'red');
  assert.ok(JSON.stringify(withText.items).toLowerCase().includes('artifact'));
});

test('quote verification is OPT-IN and never invents a red without the artifact', () => {
  // no artifactText: decide() cannot check quotes, and says nothing it cannot know
  const d = decide(PASS_FACTS, CARD);
  assert.equal(d.verdict, 'pass');
});

// ── first-red-wins, in CARD order, stably ───────────────────────────────────

test('first-red-wins reports the FIRST failing item in CARD order, not emission order', () => {
  const allBad = clone(PASS_FACTS);
  allBad.functions[0].docQuote = null;                 // has-doc red
  allBad.functions[0].paramTagNames = [];              // params red
  allBad.functions[0].returnsTagQuote = null;          // returns red

  assert.equal(decide(allBad, CARD).firstRed, 'has-doc');

  const reordered = { items: [CARD.items[2], CARD.items[1], CARD.items[0]] };
  assert.equal(decide(allBad, reordered).firstRed, 'returns');
  assert.deepEqual(decide(allBad, reordered).items.map((i) => i.rule), ['returns', 'params', 'has-doc'],
    'the items come back in the signed card order, always');
});

test('every item is EVALUATED even after the first red — calibration wants itemized reds', () => {
  const allBad = clone(PASS_FACTS);
  allBad.functions[0].docQuote = null;
  allBad.functions[0].returnsTagQuote = null;
  const d = decide(allBad, CARD);
  assert.equal(d.items.length, 3);
  assert.equal(d.items.find((i) => i.rule === 'has-doc').ok, false);
  assert.equal(d.items.find((i) => i.rule === 'params').ok, true, 'a passing item after a red still reports pass');
  assert.equal(d.items.find((i) => i.rule === 'returns').ok, false);
});

test('decide is PURE and deterministic — same input, byte-identical output, twice', () => {
  const a = decide(RED_FACTS, CARD, { artifactText: redArtifact });
  const b = decide(clone(RED_FACTS), CARD, { artifactText: redArtifact });
  assert.deepEqual(a, b);
});

test('decide refuses an invalid CARD rather than grading against garbage', () => {
  assert.throws(() => decide(PASS_FACTS, { items: [{ rule: 'vibes', text: 'x' }] }), /card/i);
});

// ── runLocate: one attempt, the caller owns retries ─────────────────────────

/** a fake toolless Loop — no provider, no network, no money */
const fakeLoop = (out) => () => ({ run: async () => out });
const ok = (text, costUsd = 0.0004) => ({ text, stopReason: 'end_turn', error: null, metrics: { costUsd, unpricedRounds: 0 } });

test('runLocate returns parsed facts, the real cost, and reports the cost exactly once', () => {
  return (async () => {
    /** @type {any[]} */
    const costs = [];
    const r = await runLocate({
      artifactText: passArtifact, card: CARD,
      loopFactory: fakeLoop(ok(JSON.stringify(PASS_FACTS), 0.00042)),
      onCost: (c) => costs.push(c),
    });
    assert.equal(r.ok, true);
    assert.equal(r.red, null);
    assert.deepEqual(r.facts, PASS_FACTS);
    assert.equal(r.costUsd, 0.00042);
    assert.equal(r.truncated, false);
    assert.equal(r.parseError, false);
    assert.deepEqual(costs, [{ costUsd: 0.00042, unpricedRounds: 0 }]);
  })();
});

test('runLocate hands the card-derived prompt to the loop and the artifact as user data', async () => {
  /** @type {any} */
  let seen = null;
  /** @type {any} */
  let ran = null;
  await runLocate({
    artifactText: 'FILE BODY', card: CARD, maxTokens: 1234,
    loopFactory: (o) => { seen = o; return { run: async (msgs, tools, opts) => { ran = { msgs, tools, opts }; return ok('{"functions":[]}'); } }; },
  });
  assert.equal(seen.system, locatePrompt(CARD));
  assert.deepEqual(ran.tools, [], 'the locate call is TOOLLESS — a judge with hands is not a judge');
  assert.equal(ran.opts.maxTokens, 1234);
  assert.ok(JSON.stringify(ran.msgs).includes('FILE BODY'));
});

test('runLocate: a fenced/chatty emission still parses — one parser, the shipped one', async () => {
  const r = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: fakeLoop(ok('Here are the facts:\n```json\n' + JSON.stringify(PASS_FACTS) + '\n```')),
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.facts, PASS_FACTS);
});

test('runLocate: unparseable JSON is an ARTIFACT-RED result, never a throw and never repaired', async () => {
  const r = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: fakeLoop(ok('{"functions":[{"name":"makeSpine",')),
  });
  assert.equal(r.ok, false);
  assert.equal(r.parseError, true);
  assert.equal(r.red.axis, LOCATE_AXES.ARTIFACT);
  assert.equal(r.facts, null, 'no repair — a repairer silently alters what the model said');
  assert.equal(decide(r.facts, CARD).verdict, 'red', 'and it decides RED downstream');
});

test('runLocate: a shape miss is an ARTIFACT-RED too, with the facts withheld', async () => {
  const r = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: fakeLoop(ok('{"funcs":[]}')),
  });
  assert.equal(r.ok, false);
  assert.equal(r.red.axis, LOCATE_AXES.ARTIFACT);
  assert.equal(r.facts, null);
});

test('runLocate: a TRUNCATED emission is its own distinct field and a provider-red', async () => {
  const r = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: fakeLoop({ text: '{"functions":[{"name":"a"', stopReason: 'max_tokens', error: null, metrics: { costUsd: 0.001, unpricedRounds: 0 } }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.truncated, true);
  assert.equal(r.parseError, false, 'truncation is NOT laundered into a parse error');
  assert.equal(r.red.axis, LOCATE_AXES.PROVIDER);
  assert.equal(r.facts, null);
});

test('runLocate: an EMPTY emission is a truncation-class red, never a clean empty success', async () => {
  const r = await runLocate({ artifactText: passArtifact, card: CARD, loopFactory: fakeLoop(ok('   ')) });
  assert.equal(r.ok, false);
  assert.equal(r.truncated, true);
});

test('runLocate: a null cost is PRICING-RED — unpriced is never free (F6)', async () => {
  /** @type {any[]} */
  const costs = [];
  const r = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: fakeLoop({ text: JSON.stringify(PASS_FACTS), stopReason: 'end_turn', error: null, metrics: { costUsd: null, unpricedRounds: 1 } }),
    onCost: (c) => costs.push(c),
  });
  assert.equal(r.ok, false);
  assert.equal(r.costUsd, null, 'the honest null, never `?? 0`');
  assert.equal(r.red.axis, LOCATE_AXES.PRICING);
  assert.deepEqual(costs, [{ costUsd: null, unpricedRounds: 1 }], 'the meter still reports — a paid call always leaves a record');
});

test('runLocate: pricing-red OUTRANKS a truncation — the meter is the harder stop', async () => {
  const r = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: fakeLoop({ text: 'x', stopReason: 'max_tokens', error: null, metrics: { costUsd: null, unpricedRounds: 1 } }),
  });
  assert.equal(r.red.axis, LOCATE_AXES.PRICING, 'retrying an unpriced call buys more spend nobody can see');
  assert.equal(r.truncated, true, '…and the truncation is still REPORTED on its own field');
});

test('runLocate: a failed call is PROVIDER-RED and never mislabelled as a meter fault', async () => {
  const thrown = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: () => ({ run: async () => { throw new Error('ENETUNREACH'); } }),
  });
  assert.equal(thrown.ok, false);
  assert.equal(thrown.red.axis, LOCATE_AXES.PROVIDER);
  assert.ok(thrown.red.detail.includes('ENETUNREACH'));
  assert.equal(thrown.costUsd, null, 'a call that threw has no knowable cost');

  const errored = await runLocate({
    artifactText: passArtifact, card: CARD,
    loopFactory: fakeLoop({ text: '', stopReason: null, error: 'overloaded', metrics: { costUsd: 0.0001, unpricedRounds: 0 } }),
  });
  assert.equal(errored.red.axis, LOCATE_AXES.PROVIDER);
});

test('runLocate persists the raw emission, scrubbed and addressed', async () => {
  const r = await runLocate({
    artifactText: passArtifact, card: CARD, attempt: 2,
    loopFactory: fakeLoop(ok('{"functions":[]}')),
  });
  assert.equal(r.raw.attempt, 2);
  assert.equal(typeof r.raw.label, 'string');
  assert.ok(r.raw.text.includes('functions'));
});

test('runLocate refuses its own broken inputs by THROWING — the param-guard class', async () => {
  await assert.rejects(() => runLocate({ card: CARD, loopFactory: fakeLoop(ok('{}')) }), /artifactText/i);
  await assert.rejects(() => runLocate({ artifactText: 'x', card: CARD }), /loopFactory/i);
  await assert.rejects(() => runLocate({ artifactText: 'x', card: { items: [{ rule: 'vibes', text: 'y' }] }, loopFactory: fakeLoop(ok('{}')) }), /card/i);
});

test('the whole pipe grades the two real artifacts correctly, end to end, on fakes', async () => {
  for (const [artifact, facts, expected] of [
    [passArtifact, PASS_FACTS, 'pass'],
    [redArtifact, RED_FACTS, 'red'],
  ]) {
    const loc = await runLocate({ artifactText: artifact, card: CARD, loopFactory: fakeLoop(ok(JSON.stringify(facts))) });
    assert.equal(loc.ok, true);
    assert.equal(decide(loc.facts, CARD, { artifactText: artifact }).verdict, expected);
  }
});
