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
  SAYS_WHAT_STOPWORDS, validateCard, validateFacts, locatePrompt, runLocate, decide, validateCalibrationSet, CALIBRATION_SIZE,
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

// ── COMPLETENESS (PRD 30.8): a pass on the REPORTED functions is not a pass on
// the FILE — a locate emission can be well-formed, non-empty, and still have
// silently dropped a top-level function the artifact actually holds ─────────

/** two top-level, fully documented functions — the completeness fixture */
const TWO_FN_ARTIFACT =
  '/**\n * Adds two numbers.\n * @param {number} a\n * @param {number} b\n * @returns {number} the sum\n */\n'
  + 'function add(a, b) {\n  return a + b;\n}\n\n'
  + '/**\n * Subtracts two numbers.\n * @param {number} a\n * @param {number} b\n * @returns {number} the difference\n */\n'
  + 'function sub(a, b) {\n  return a - b;\n}\n';

const ADD_FACTS = {
  name: 'add',
  declarationQuote: 'function add(a, b) {',
  docQuote: '/**',
  paramNames: ['a', 'b'],
  paramIsPattern: [false, false],
  paramTagNames: ['a', 'b'],
  returnsTagQuote: ' * @returns {number} the sum',
  returnsValueQuote: '  return a + b;',
};

const SUB_FACTS = {
  name: 'sub',
  declarationQuote: 'function sub(a, b) {',
  docQuote: '/**',
  paramNames: ['a', 'b'],
  paramIsPattern: [false, false],
  paramTagNames: ['a', 'b'],
  returnsTagQuote: ' * @returns {number} the difference',
  returnsValueQuote: '  return a - b;',
};

test('decide REDS when locate silently OMITS a top-level function the artifact holds — never a pass on the subset', () => {
  const d = decide({ functions: [ADD_FACTS] }, CARD, { artifactText: TWO_FN_ARTIFACT });
  assert.equal(d.verdict, 'red');
  assert.equal(d.items.length, 0, 'this is an UNSURE route — the same shape as every other completeness-blind red, grading never runs');
  assert.ok(/sub/.test(String(d.reason)), 'the reason NAMES the missing function');
  assert.ok(!/\badd\b/.test(String(d.reason)), 'and only the missing one — `add` was reported and is not part of the miss');
});

test('decide is UNCHANGED when locate reports every top-level function — completeness is silent, the RULES decide', () => {
  const d = decide({ functions: [ADD_FACTS, SUB_FACTS] }, CARD, { artifactText: TWO_FN_ARTIFACT });
  assert.equal(d.verdict, 'pass', JSON.stringify(d.items));
  assert.equal(d.items.length, CARD.items.length, 'grading RAN — completeness did not short-circuit it, it just found nothing to say');
});

test('completeness is OPT-IN like the quote check — no artifactText, no completeness claim', () => {
  // without the artifact decide() cannot know `sub` exists, and says nothing it cannot know
  const d = decide({ functions: [ADD_FACTS] }, CARD);
  assert.equal(d.verdict, 'pass');
});

test('the fns.length === 0 route still reds on its OWN reason, completeness or not', () => {
  const d = decide({ functions: [] }, CARD, { artifactText: TWO_FN_ARTIFACT });
  assert.equal(d.verdict, 'red');
  assert.ok(/found nothing/.test(String(d.reason)), 'the empty-list reason is unchanged — completeness never runs on an empty list');
});

// ── ONE SHAPE INVENTORY: the LOCATE prompt's prose and the completeness
// detector are both derived from the same `FN_SHAPES` table in src/judged.js
// (the standing one-inventory rule — never two hand-typed spellings that can
// drift apart in the unsafe direction). These tests exercise every shape the
// prompt claims to cover, one at a time, proving the detector actually
// catches each one rather than trusting the prose — `async`/`export`
// modifiers included, which is exactly what a hand-typed regex misses first.

test('locatePrompt states the async/export modifiers, not just the bare shapes', () => {
  const p = locatePrompt(CARD);
  assert.ok(/async/.test(p), 'the prompt names the async modifier');
  assert.ok(/export/.test(p), 'the prompt names the export modifier');
});

/** [label, a real column-0 declaration line, the name it declares] — one per
 * shape `FN_SHAPES` enumerates */
const SHAPE_LINES = [
  ['function name(...)', 'function plain() {\n  return 1;\n}\n', 'plain'],
  ['async function name(...)', 'async function asyncPlain() {\n  return 1;\n}\n', 'asyncPlain'],
  ['export function name(...)', 'export function exportedFn() {\n  return 1;\n}\n', 'exportedFn'],
  ['export async function name(...)', 'export async function exportedAsyncFn() {\n  return 1;\n}\n', 'exportedAsyncFn'],
  ['const name = (...) =>', 'const arrow = () => {\n  return 1;\n};\n', 'arrow'],
  ['const name = async (...) =>', 'const asyncArrow = async () => {\n  return 1;\n};\n', 'asyncArrow'],
  ['export const name = (...) =>', 'export const exportedArrow = () => {\n  return 1;\n};\n', 'exportedArrow'],
  ['export const name = async (...) =>', 'export const exportedAsyncArrow = async () => {\n  return 1;\n};\n', 'exportedAsyncArrow'],
];

for (const [label, decl, name] of SHAPE_LINES) {
  test(`completeness catches an omitted "${label}" — the shape the prompt claims to cover is actually detected`, () => {
    const artifact = `${TWO_FN_ARTIFACT}\n${decl}`;
    const d = decide({ functions: [ADD_FACTS, SUB_FACTS] }, CARD, { artifactText: artifact });
    assert.equal(d.verdict, 'red', `a real "${label}" declaration must not be invisible to completeness`);
    assert.ok(new RegExp(`\\b${name}\\b`).test(String(d.reason)), `the reason names the omitted function (${name})`);
  });
}

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

// ── has-doc: code reads the artifact, the judge only points (F192, ruling A) ──
//
// REAL data: the artifacts are the archived mub2nboo calibration cases and the
// facts are deepseek-flash's actual answers from the 2026-10-08 probe — the judge
// quoted the first WORDED JSDoc line, not the bare opener.

const F192 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'f192-has-doc-real.json'), 'utf8'));
const HAS_DOC = { items: [CARD.items[0]] };
/** has-doc verdict for `fn` facts over an artifact */
const hasDoc = (/** @type {any} */ fn, /** @type {string} */ artifact) =>
  decide({ functions: [fn] }, HAS_DOC, { artifactText: artifact });

test('F192: the real worded-first-line docQuote no longer reds has-doc, on all three real cases', () => {
  for (const [id, c] of Object.entries(F192)) {
    const d = decide(c.facts, HAS_DOC, { artifactText: c.artifact });
    assert.equal(d.verdict, 'pass', `${id}: ${JSON.stringify(d.items)}`);
  }
});

test('F192: the bare opener quote still passes', () => {
  const c = F192['full-contract-pass'];
  const fn = { ...c.facts.functions[0], docQuote: '/**' };
  assert.equal(hasDoc(fn, c.artifact).verdict, 'pass');
});

test('F192: a docQuote that is not inside the block directly above the declaration still reds', () => {
  const c = F192['two-functions-pass'];
  const [parse, build] = c.facts.functions;
  const why = (/** @type {any} */ d) => d.items[0].reds.map((/** @type {any} */ r) => r.why).join(';');
  // the completeness check wants BOTH functions reported; `patch` edits one of them
  const both = (/** @type {number} */ i, /** @type {any} */ patch) => {
    const fns = [{ ...parse }, { ...build }];
    fns[i] = { ...fns[i], ...patch };
    return decide({ functions: fns }, HAS_DOC, { artifactText: c.artifact });
  };
  // (a) null stays red, with its own why
  const none = both(0, { docQuote: null });
  assert.equal(none.verdict, 'red');
  assert.match(why(none), /no JSDoc block/);
  // the JSDoc block of a DIFFERENT function (parseQuery's) quoted for buildQuery
  const other = both(1, { docQuote: ' * Turns an Express-style query string into a plain object.' });
  assert.equal(other.verdict, 'red');
  assert.match(why(other), /not inside a JSDoc block/);
  // a line from the function body
  const body = both(1, { docQuote: '    .join(\'&\');' });
  assert.equal(body.verdict, 'red');
  assert.match(why(body), /not inside a JSDoc block/);
  // invented text: red through the quote-verification pass
  const invented = both(1, { docQuote: ' * Builds a query string, honestly.' });
  assert.equal(invented.verdict, 'red');
  assert.match(why(invented), /not in the artifact/);
});

test('F192: a plain block comment above the declaration is not a JSDoc block', () => {
  const art = '/*\n * Adds two numbers.\n */\nfunction add(a, b) {\n  return a + b;\n}\n';
  const fn = { name: 'add', declarationQuote: 'function add(a, b) {', docQuote: ' * Adds two numbers.' };
  assert.equal(hasDoc(fn, art).verdict, 'red');
  const jsdoc = art.replace('/*\n', '/**\n');
  assert.equal(hasDoc(fn, jsdoc).verdict, 'pass', 'the same lines under a double-star opener pass');
});

test('F192: a block separated from the declaration by code is not directly above it', () => {
  const art = '/**\n * Old doc.\n */\nconst x = 1;\nfunction add(a, b) {\n  return a + b;\n}\n';
  const fn = { name: 'add', declarationQuote: 'function add(a, b) {', docQuote: ' * Old doc.' };
  assert.equal(hasDoc(fn, art).verdict, 'red');
});

test('F192: an unfindable or duplicated declaration line is unsure, and unsure is red', () => {
  const c = F192['full-contract-pass'];
  const fn = c.facts.functions[0];
  assert.equal(hasDoc({ ...fn, declarationQuote: 'function nope() {' }, c.artifact).verdict, 'red');
  const twice = `${c.artifact}\n/**\n * again\n */\nfunction formatBytes(bytes, decimals = 1) {\n}\n`;
  assert.equal(hasDoc(fn, twice).verdict, 'red');
});

// ── params: an EXTRA @param tag reds (F192, item 1) ──────────────────────────
//
// REAL data: tests/fixtures/f192-params-real.json — the archived mub2nboo cases
// and deepseek-flash's actual facts from the 2026-10-08 probe.

const F192P = JSON.parse(readFileSync(join(HERE, 'fixtures', 'f192-params-real.json'), 'utf8'));
const PARAMS_ONLY = { items: [CARD.items[1]] };
/** params reds (rule-level why strings) for one function's facts */
const paramReds = (/** @type {any} */ fn) => {
  const d = decide({ functions: [fn] }, PARAMS_ONLY, { artifactText: null });
  return d.items[0].reds.map((/** @type {any} */ r) => r.why);
};
/** a synthetic fn whose declaration quote carries every name */
const synth = (/** @type {string[]} */ names, /** @type {string[]} */ tags, /** @type {boolean[]} */ pat = names.map(() => false)) => ({
  name: 'f', declarationQuote: `function f(${names.join(', ')}) {`, paramNames: names, paramIsPattern: pat, paramTagNames: tags,
});

test('F192 item 1: the real phantom @param cases red, with a plain why', () => {
  const a = F192P['phantom-param-red'].facts.functions[0];
  assert.deepEqual(paramReds(a), ['@param overwrite names no parameter of copyFile']);
  const b = F192P['phantom-param-and-no-returns'].facts.functions[0];
  assert.deepEqual(paramReds(b), ['@param admin names no parameter of createUser']);
});

test('F192 item 1: the existing missing-param red is unchanged, and a fully matching doc stays green', () => {
  const m = F192P['omitted-param-red'].facts.functions[0];
  assert.deepEqual(paramReds(m), ['@param missing for cc']);
  assert.deepEqual(paramReds(F192['full-contract-pass'].facts.functions[0]), []);
  assert.deepEqual(paramReds(F192['clamp-contract-pass'].facts.functions[0]), []);
});

test('F192 item 1: dotted sub-params are not extra', () => {
  assert.deepEqual(paramReds(synth(['opts'], ['opts', 'opts.a', 'opts.b'])), []);
  assert.deepEqual(paramReds(synth(['opts', 'n'], ['opts', 'n', 'opts.a'])), []);
});

test('F192 item 1: a destructured slot absorbs ONE unmatched root tag, and only that', () => {
  const pat = '{ a = 1 } = {}';
  // `@param [opts]` documents the pattern: no red (the real makeSpine shape)
  assert.deepEqual(paramReds(synth([pat], ['[opts]', 'opts.a'], [true])), []);
  // a named param plus a pattern, root documented: no red
  assert.deepEqual(paramReds(synth(['x', pat], ['x', 'opts'], [false, true])), []);
  // one root for the pattern AND a second unmatched tag: the second is extra
  assert.deepEqual(paramReds(synth(['x', pat], ['x', 'opts', 'ghost'], [false, true])), ['@param ghost names no parameter of f']);
});

// ── 3A: a case may not expect a has-doc red on a function that HAS a doc block ──

const caseOf = (/** @type {string} */ id, /** @type {any} */ fx) => ({ id, artifact: fx.artifact, expect: fx.expect });
const setWith = (/** @type {any[]} */ extra) => {
  const filler = Array.from({ length: CALIBRATION_SIZE - extra.length }, (_, i) => ({
    id: `filler-${i}`,
    artifact: `/** doc ${i} */\nfunction g${i}(a) {\n  return a;\n}\n`,
    expect: i === 0 ? { verdict: 'red', reds: [{ rule: 'params', fn: 'g0' }] } : { verdict: 'pass', reds: [] },
  }));
  return [...extra, ...filler];
};

test('F192 item 3A: the real name-echo cases are illegal, with the plain message', () => {
  for (const [id, fn] of [['name-echo-denies-purpose', 'parseDate'], ['name-echo-and-no-returns', 'slugify']]) {
    const v = validateCalibrationSet(setWith([caseOf(id, F192P[id])]), { card: CARD });
    assert.equal(v.ok, false, id);
    assert.ok(v.reds.some((r) => r.detail === `case ${id} expects has-doc red on ${fn}, but ${fn} has a JSDoc block directly above it `
      + '— has-doc only checks that a block exists, so no judge answer can grade this case'), JSON.stringify(v.reds));
  }
});

test('F192 item 3A: a has-doc red on a genuinely undocumented function stays legal', () => {
  const v = validateCalibrationSet(setWith([caseOf('undocumented-function-red', F192P['undocumented-function-red'])]), { card: CARD });
  assert.deepEqual(v.reds, []);
});

// ── quote matching is bareguard's quoteIn({wholeLines:true}) (F192, item 3) ──
//
// REAL data: the archived mub2nboo `name-echo-denies-purpose` artifact and the
// judge's actual `returnsTagQuote`, which dropped the leading `* ` of its line.

const NE = F192P['name-echo-denies-purpose'];
const RETURNS_ONLY = { items: [CARD.items.find((/** @type {any} */ i) => i.rule === 'returns')] };
const returnsReds = (/** @type {any} */ patch) =>
  decide({ functions: [{ ...NE.facts.functions[0], ...patch }] }, RETURNS_ONLY, { artifactText: NE.artifact })
    .items[0].reds.map((/** @type {any} */ r) => r.why);

test('F192 item 3: the real @returns quote that dropped its leading "* " is found, not reddened', () => {
  assert.equal(NE.facts.functions[0].returnsTagQuote, '@returns {Date} the parsed date, in the local time zone.');
  assert.deepEqual(returnsReds({}), []);
});

test('F192 item 3: a fragment of a line, a changed word and reordered lines still red', () => {
  assert.match(returnsReds({ returnsValueQuote: 'return' })[0], /returnsValueQuote.*not in the artifact/);
  assert.match(returnsReds({ returnsTagQuote: '@returns {Date} the parsed date, in UTC.' })[0], /returnsTagQuote/);
  assert.match(returnsReds({ returnsValueQuote: "return new Date(y, m - 1, d);\nfunction parseDate(value, pattern) {" })[0], /returnsValueQuote/);
});

test('F192 item 3: has-doc keeps docBlockAbove as the authority when the quote is the bare opener', () => {
  // "/**" alone matches any source holding that line (quoteIn proves nothing about location);
  // the block-above check must still decide. A function whose block sits ABOVE ANOTHER function reds.
  const art = '/**\n * Doc of a.\n */\nfunction a() {}\n\nfunction b() {}\n';
  const fn = (/** @type {string} */ n) => ({ name: n, declarationQuote: `function ${n}() {}`, docQuote: '/**' });
  assert.equal(decide({ functions: [fn('a'), fn('b')] }, HAS_DOC, { artifactText: art }).verdict, 'red');
  assert.equal(decide({ functions: [fn('a')] }, HAS_DOC, { artifactText: art.replace('function b() {}\n', '') }).verdict, 'pass');
});

// ── `says-what` (F192 addendum 2026-10-09, hamr ruling A): the doc is more than the name ──
//
// REAL artifacts: the archived mub2nboo name-echo cases (f192-params-real.json) must red; the real
// documented passes (f192-has-doc-real.json, and the other f192-params-real documented functions) must
// pass. The judge's `descriptionQuote` is the one thing no archive holds (the rule is new), so each is
// the description line read OFF the real artifact the way an honest judge would quote it.

const SAYS_ONLY = { items: [{ rule: 'says-what', text: 'The doc says what the function does, not just its name.' }] };
/** the first prose line of the doc block above `fnName`, read off the artifact, as a judge would quote it */
const honestDescription = (/** @type {string} */ art, /** @type {string} */ fnName) => {
  const lines = art.split('\n');
  const at = lines.findIndex((l) => new RegExp(`function\\s+${fnName}\\b`).test(l));
  let i = at - 1;
  while (i >= 0 && !lines[i].includes('/**')) i--;
  return lines.slice(i + 1, at).find((l) => /^\s*\*\s+\S/.test(l) && !/^\s*\*\s+@/.test(l)) ?? null;
};
const saysFacts = (/** @type {string} */ art, /** @type {any} */ f, /** @type {string|null|undefined} */ quote) => ({
  functions: [{ name: f.name, declarationQuote: f.declarationQuote, descriptionQuote: quote === undefined ? honestDescription(art, f.name) : quote }],
});
// (the rule's own check, one function at a time: decide() also demands every top-level function be reported)
const saysReds = (/** @type {string} */ art, /** @type {any} */ f, /** @type {string|null|undefined} */ quote) =>
  JUDGE_RULES['says-what'].check(saysFacts(art, f, quote).functions[0], art).map((/** @type {any} */ r) => r.why);

test('says-what: the real mub2nboo name-echo artifacts RED (parseDate, slugify)', () => {
  for (const id of ['name-echo-denies-purpose', 'name-echo-and-no-returns']) {
    const c = F192P[id];
    const f = c.facts.functions[0];
    assert.equal(honestDescription(c.artifact, f.name)?.trim(), `* ${f.name}`, `${id}: the description line is the bare name`);
    const d = decide(saysFacts(c.artifact, f), SAYS_ONLY, { artifactText: c.artifact });
    assert.equal(d.verdict, 'red', id);
    assert.equal(d.firstRed, 'says-what');
    assert.match(d.items[0].reds[0].why, /only restates the function name/);
  }
});

test('says-what: the real documented functions PASS (formatBytes, clamp, parseQuery, buildQuery, copyFile, createUser, sendEmail)', () => {
  const real = [
    ...Object.values(F192).flatMap((c) => c.facts.functions.map((f) => [c.artifact, f])),
    ...['phantom-param-red', 'phantom-param-and-no-returns', 'omitted-param-red'].map((id) => [F192P[id].artifact, F192P[id].facts.functions[0]]),
  ];
  assert.ok(real.length >= 7);
  for (const [art, f] of real) assert.deepEqual(saysReds(art, f), [], f.name);
});

test('says-what: a function with no doc block, or a null / opener-only / invented / tag-only quote, is red (unsure is red)', () => {
  const c = F192P['undocumented-function-red'];
  const f = c.facts.functions[0];
  assert.equal(decide(saysFacts(c.artifact, f, null), SAYS_ONLY, { artifactText: c.artifact }).verdict, 'red');
  const ne = F192P['name-echo-denies-purpose'];
  const nf = ne.facts.functions[0];
  assert.equal(decide(saysFacts(ne.artifact, nf, '/**'), SAYS_ONLY, { artifactText: ne.artifact }).verdict, 'red');
  const fb = F192['full-contract-pass'];
  const ff = fb.facts.functions[0];
  assert.match(saysReds(fb.artifact, ff, ' * Formats every byte count into a tidy string.')[0], /not in the artifact/);
  // a @param line is not a description: the prose before the first tag is empty
  assert.match(saysReds(fb.artifact, ff, ' * @param {number} bytes - the number of bytes to format; must be zero or greater.')[0], /only restates/);
  // no artifact in hand: no looser path
  assert.equal(decide(saysFacts(fb.artifact, ff), SAYS_ONLY, { artifactText: null }).verdict, 'red');
});

test('says-what: the quote must sit inside the block directly above the declaration (docBlockAbove stays the authority)', () => {
  const art = '/**\n * Computes the rolling median of a window.\n */\nfunction a() {}\n\n/**\n * b\n */\nfunction b() {}\n';
  const fa = { name: 'a', declarationQuote: 'function a() {}' };
  const fb = { name: 'b', declarationQuote: 'function b() {}' };
  assert.deepEqual(saysReds(art, fa), []);
  // b's description quoted from a's block: found in the file, not in b's block
  assert.match(saysReds(art, fb, ' * Computes the rolling median of a window.')[0], /not inside the JSDoc block/);
  assert.match(saysReds(art, fb)[0], /only restates/);
});

test('says-what: name words (camel, snake, kebab), light inflections and the stopword list', () => {
  /** @param {string} name @param {string} line */
  const verdictOf = (name, line) => {
    const art = `/**\n * ${line}\n */\nfunction ${name}() {}\n`;
    return saysReds(art, { name, declarationQuote: `function ${name}() {}` });
  };
  assert.equal(verdictOf('getTotal', 'Gets the total.').length, 1, 'inflected echo reds');
  assert.equal(verdictOf('parse_date', 'Parses a date').length, 1, 'snake_case + s');
  assert.equal(verdictOf('validate', 'Validating the').length, 1, 'ing with silent e');
  assert.equal(verdictOf('parseDate', 'parseDate').length, 1, 'camel in the description too');
  assert.equal(verdictOf('parseDate', 'Parse the date string').length, 0, 'adds "string"');
  // THE STATED CEILING: generic words that are not stopwords pass
  assert.equal(verdictOf('getTotal', 'Returns the total.').length, 0, 'ceiling: "Returns" is an added word');
  assert.deepEqual([...SAYS_WHAT_STOPWORDS], ['a', 'an', 'the', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'and', 'or', 'as']);
  const one = '/** Parse date. */\nfunction parseDate() {}\n';
  assert.equal(saysReds(one, { name: 'parseDate', declarationQuote: 'function parseDate() {}' }, '/** Parse date. */').length, 1, 'one-line block');
});

test('says-what: the locate prompt asks for descriptionQuote only when the card names the rule', () => {
  assert.match(locatePrompt(SAYS_ONLY), /descriptionQuote/);
  assert.doesNotMatch(locatePrompt({ items: [CARD.items[0]] }), /descriptionQuote/);
});
