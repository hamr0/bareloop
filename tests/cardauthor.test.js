// SOFTGREEN MODULE 4 — the two signed artifacts.
//
// Q6 becomes the rubric CARD and Q7 becomes the frozen CALIBRATION SET, both on
// the D5 shown-and-fixed path: an LLM PROPOSES, the SIGNER fixes, and the fixed
// version is what is stored, ENUMERATED, inside the spec hash.
//
// What this file pins is the compile and the storage. The GRADING GATE — running
// the whole pipe over the ten cases before the close is signable — is module 5
// and is deliberately absent here.
//
// NO test in this file makes a paid call.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  JUDGE_RULE_IDS, validateCard, decide,
  CALIBRATION_SIZE, CASE_VERDICTS, validateCalibrationSet, validateJudgedArtifacts, expectedOf,
} from '../src/judged.js';
import {
  PROPOSAL_TOOL_NAME, proposalSchema, proposalTool, cardCasesPrompt, proposeJudgedArtifacts,
  signJudgedArtifacts, foldJudgedArtifacts,
} from '../src/cardauthor.js';
import { makeCostBook } from '../src/authorflow.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { jobSpecHash } from '../src/job.js';
import { classGuards } from '../src/authoring.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const CARD = () => ({
  items: [
    { rule: 'has-doc', text: 'Every exported function carries a JSDoc block.' },
    { rule: 'params', text: 'Every parameter is documented.' },
  ],
});

/** a real, small JS artifact — one documented function, one not */
const ARTIFACT_RED = 'export function add(a, b) {\n  return a + b;\n}\n';
const ARTIFACT_PASS = '/** add two numbers\n * @param {number} a @param {number} b */\n'
  + 'export function add(a, b) {\n  return a + b;\n}\n';

/** @param {number} i */
const passCase = (i) => ({
  id: `pass-${i}`,
  artifact: `${ARTIFACT_PASS}// case ${i}\n`,
  expect: { verdict: 'pass', reds: [] },
});
/** @param {number} i */
const redCase = (i) => ({
  id: `red-${i}`,
  artifact: `${ARTIFACT_RED}// case ${i}\n`,
  expect: { verdict: 'red', reds: [{ rule: 'has-doc', fn: 'add' }] },
});

/** the signed ten: mixed polarity, unique ids, unique artifacts */
const CASES = () => [
  ...Array.from({ length: 5 }, (_, i) => passCase(i + 1)),
  ...Array.from({ length: 5 }, (_, i) => redCase(i + 1)),
];

const guardParams = (/** @type {string} */ name) => classGuards({ verdictType: 'soft-green', lang: 'js' })
  .find((g) => g.name === name).params;

/** a soft-green closeDecl carrying the judged floor last */
const closeDecl = (/** @type {any} */ over = {}) => ({
  genre: 'TYPES',
  lang: 'js',
  stages: [
    { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } },
    {
      name: 'no-suppressions',
      kind: 'pattern-absent-in-diff',
      params: { patterns: guardParams('no-suppressions').patterns, extensions: guardParams('no-suppressions').extensions },
    },
    { name: 'typecheck-clean', kind: 'command-exit', params: { cmd: 'npx', args: ['tsc', '--noEmit'], expectExit: 0 } },
    { name: 'docs-read-well', kind: 'judged-floor', params: { card: CARD(), paths: ['src/spine.js'] } },
  ],
  ...over,
});

const ANSWERS = () => ({
  1: 'document every exported function',
  2: 'src/ changes; nothing else',
  3: 'the tests must not change',
  4: 'I read the file',
  5: 'if the docs are wrong',
  6: 'every exported function has a doc block, and every parameter is described',
  7: 'I would pass a function with a full JSDoc block; I would fail one with no comment at all.',
});

/** a scripted model boundary that delivers the proposal through the tool */
function scriptGenerate(/** @type {{proposal?: any, proposals?: any[], text?: string, error?: string|null}[]} */ script) {
  /** @type {any[]} */
  const calls = [];
  const generate = async (/** @type {any} */ messages, /** @type {any} */ tools, /** @type {any} */ opts) => {
    const spec = script[Math.min(calls.length, script.length - 1)] ?? {};
    calls.push({ messages, tools, opts });
    const tool = tools.find((/** @type {any} */ t) => t.name === PROPOSAL_TOOL_NAME);
    const delivered = spec.proposals ?? (spec.proposal ? [spec.proposal] : []);
    if (tool) for (const d of delivered) await tool.execute(d);
    return {
      text: spec.text ?? '',
      error: spec.error ?? null,
      msgs: [],
      metrics: { costUsd: 0.01, unpricedRounds: 0 },
    };
  };
  return { generate, calls };
}

const PROPOSAL = () => ({ card: CARD(), cases: CASES() });

// ── 1. THE SCHEMA IS THE MENU ───────────────────────────────────────────────

test('the proposal schema hands over the RULEBOOK enumerated — a rule we do not own is inexpressible', () => {
  const s = proposalSchema();
  assert.deepEqual(s.properties.card.properties.items.items.properties.rule.enum, [...JUDGE_RULE_IDS]);
  assert.deepEqual(
    s.properties.cases.items.properties.expect.properties.reds.items.properties.rule.enum,
    [...JUDGE_RULE_IDS],
    'an expected red names a rule off the same closed set the card selects from',
  );
});

test('the schema pins the SIZE both ways — ten is hamr\'s number, not a suggestion', () => {
  const s = proposalSchema();
  assert.equal(CALIBRATION_SIZE, 10);
  assert.equal(s.properties.cases.minItems, CALIBRATION_SIZE);
  assert.equal(s.properties.cases.maxItems, CALIBRATION_SIZE);
  assert.deepEqual(s.properties.cases.items.properties.expect.properties.verdict.enum, [...CASE_VERDICTS]);
});

test('the compile prompt carries Q6 and Q7 VERBATIM, and the rulebook it must select from', () => {
  const p = cardCasesPrompt({ answers: ANSWERS() });
  assert.ok(p.includes(ANSWERS()[6]), 'Q6\'s answer reaches the compiler unedited');
  assert.ok(p.includes(ANSWERS()[7]), 'Q7\'s answer reaches the compiler unedited');
  for (const id of JUDGE_RULE_IDS) assert.ok(p.includes(id), `the rulebook names ${id}`);
});

// ── 2. THE CARD ─────────────────────────────────────────────────────────────

test('Q6 compiles to a card validateCard accepts — the same gate the runner uses', () => {
  const r = signJudgedArtifacts({ proposal: PROPOSAL() });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(validateCard(r.card).ok, true);
});

test('an unknown rule in a proposal REDS, with the enumerated set handed over', () => {
  const bad = PROPOSAL();
  bad.card.items[0].rule = 'reads-nicely';
  const r = signJudgedArtifacts({ proposal: bad });
  assert.equal(r.ok, false);
  const text = r.reds.map((/** @type {any} */ x) => x.detail).join(' ');
  assert.ok(text.includes('reads-nicely'));
  for (const id of JUDGE_RULE_IDS) assert.ok(text.includes(id), `the refusal hands back ${id}`);
});

// ── 3. THE TEN ──────────────────────────────────────────────────────────────

test('nine cases is a red that NAMES the count and the ruling', () => {
  const r = validateCalibrationSet(CASES().slice(0, 9), { card: CARD() });
  assert.equal(r.ok, false);
  const red = r.reds.find((/** @type {any} */ x) => x.code === 'calibration-size');
  assert.ok(red, JSON.stringify(r.reds));
  assert.ok(red.detail.includes('9') && red.detail.includes(String(CALIBRATION_SIZE)));
});

test('eleven cases reds the same way — the size is pinned in BOTH directions', () => {
  const r = validateCalibrationSet([...CASES(), passCase(99)], { card: CARD() });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-size'));
});

test('exactly ten, mixed polarity, validates clean', () => {
  const r = validateCalibrationSet(CASES(), { card: CARD() });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
});

test('a set that can only fail one way proves nothing — both polarities are REQUIRED', () => {
  const allPass = Array.from({ length: CALIBRATION_SIZE }, (_, i) => passCase(i + 1));
  const allRed = Array.from({ length: CALIBRATION_SIZE }, (_, i) => redCase(i + 1));
  for (const [label, set] of [['all-pass', allPass], ['all-red', allRed]]) {
    const r = validateCalibrationSet(/** @type {any} */ (set), { card: CARD() });
    assert.equal(r.ok, false, label);
    assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-polarity'), label);
  }
});

test('a red case with no expected reds is not itemized — the floor is itemized reds, not verdict-match', () => {
  const cases = CASES();
  cases[9].expect.reds = [];
  const r = validateCalibrationSet(cases, { card: CARD() });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-case'));
});

test('a PASS case carrying expected reds is a contradiction, refused', () => {
  const cases = CASES();
  cases[0].expect.reds = [{ rule: 'has-doc', fn: 'add' }];
  const r = validateCalibrationSet(cases, { card: CARD() });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-case'));
});

test('an expected red naming a rule the CARD does not judge is refused — the ceiling, mechanically', () => {
  const cases = CASES();
  cases[9].expect.reds = [{ rule: 'returns', fn: 'add' }];
  const r = validateCalibrationSet(cases, { card: CARD() }); // card carries has-doc + params only
  assert.equal(r.ok, false);
  const red = r.reds.find((/** @type {any} */ x) => x.code === 'calibration-case');
  assert.ok(red && red.detail.includes('returns'), JSON.stringify(r.reds));
});

test('an empty artifact is refused — a case with no text grades nothing', () => {
  const cases = CASES();
  cases[0].artifact = '   ';
  const r = validateCalibrationSet(cases, { card: CARD() });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-case'));
});

test('duplicate ids and duplicate artifacts are refused — ten names over nine cases is nine cases', () => {
  const dupId = CASES();
  dupId[1].id = dupId[0].id;
  assert.equal(validateCalibrationSet(dupId, { card: CARD() }).ok, false);

  const dupArtifact = CASES();
  dupArtifact[1].artifact = dupArtifact[0].artifact;
  assert.equal(validateCalibrationSet(dupArtifact, { card: CARD() }).ok, false);
});

// ── 4. THE SHAPE MODULE 5 WILL COMPARE ──────────────────────────────────────

test('the stored expectation is exactly what decide() emits, reduced to rule+fn', () => {
  const card = CARD();
  // a REAL decision, from the real rulebook over a real facts object
  const facts = {
    functions: [{
      name: 'add',
      declarationQuote: 'export function add(a, b) {',
      docQuote: null,
      paramNames: ['a', 'b'],
      paramTagNames: [],
    }],
  };
  const decision = decide(facts, card, { artifactText: ARTIFACT_RED });
  assert.equal(decision.verdict, 'red');

  const expectation = expectedOf(decision);
  assert.equal(expectation.verdict, 'red');
  assert.ok(expectation.reds.some((/** @type {any} */ r) => r.rule === 'has-doc' && r.fn === 'add'));
  // and it is a LEGAL case expectation: the shape the signer stores is the shape
  // the pipe produces, so module 5's comparison is mechanical
  const cases = CASES();
  cases[9] = { id: 'derived', artifact: ARTIFACT_RED, expect: expectation };
  assert.equal(validateCalibrationSet(cases, { card }).ok, true, 'a decision-derived expectation must be storable');
});

test('a PASS decision reduces to a pass expectation with no reds', () => {
  const card = { items: [{ rule: 'has-doc', text: 'documented' }] };
  const facts = {
    functions: [{ name: 'add', declarationQuote: 'export function add(a, b) {', docQuote: '/** add two numbers' }],
  };
  const decision = decide(facts, card, { artifactText: ARTIFACT_PASS });
  assert.deepEqual(expectedOf(decision), { verdict: 'pass', reds: [] });
});

// ── 5. SHOWN AND FIXED ──────────────────────────────────────────────────────

test('the SIGNER\'s fix is what lands — never the proposal', () => {
  const proposal = PROPOSAL();
  const fix = PROPOSAL();
  fix.card.items[0].text = 'the signer\'s own words';
  fix.cases[0].artifact = `${ARTIFACT_PASS}// the signer rewrote this one\n`;

  const r = signJudgedArtifacts({ proposal, fix });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.source, 'signer');
  assert.equal(r.card.items[0].text, 'the signer\'s own words');
  assert.ok(r.cases[0].artifact.includes('the signer rewrote this one'));
  assert.notEqual(r.card.items[0].text, proposal.card.items[0].text);
});

test('an unfixed proposal is signed AS PROPOSED, and says so', () => {
  const r = signJudgedArtifacts({ proposal: PROPOSAL() });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'proposal');
});

test('the signer cannot sign an illegal fix — the gate runs over the FIX, not the proposal', () => {
  const fix = PROPOSAL();
  fix.cases = fix.cases.slice(0, 9);
  const r = signJudgedArtifacts({ proposal: PROPOSAL(), fix });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-size'));
});

test('what is signed is a COPY — a later edit to the proposal cannot reach the signed artifact', () => {
  const proposal = PROPOSAL();
  const r = signJudgedArtifacts({ proposal });
  proposal.card.items[0].text = 'mutated after signing';
  proposal.cases[0].artifact = 'mutated after signing';
  assert.notEqual(r.card.items[0].text, 'mutated after signing');
  assert.notEqual(r.cases[0].artifact, 'mutated after signing');
});

// ── 6. SECRETS ──────────────────────────────────────────────────────────────

test('a planted key in a proposed case is SCRUBBED at ingest — a signed artefact outlives its run', () => {
  const KEY = `sk-ant-api03-${'C'.repeat(95)}`;
  const proposal = PROPOSAL();
  proposal.cases[0].artifact = `const client = new Client('${KEY}');\n${ARTIFACT_PASS}`;
  proposal.card.items[0].text = `pass when the key ${KEY} is gone`;

  const r = signJudgedArtifacts({ proposal });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.ok(!JSON.stringify(r).includes(KEY), 'the key never survives into the signed artifacts');
});

// ── 7. THE FOLD, AND THE HASH ───────────────────────────────────────────────

test('the fold enumerates BOTH artifacts into the closeDecl: the card on the judged stage, the ten beside it', () => {
  const signed = signJudgedArtifacts({ proposal: PROPOSAL() });
  const folded = foldJudgedArtifacts(closeDecl(), { card: signed.card, cases: signed.cases });
  const judged = folded.stages.find((/** @type {any} */ s) => s.kind === 'judged-floor');
  assert.deepEqual(judged.params.card, signed.card);
  assert.equal(folded.calibration.cases.length, CALIBRATION_SIZE);
  assert.deepEqual(folded.calibration.cases, signed.cases);
});

test('the fold REPLACES the composer\'s card with the signer\'s — one card, and it is the signed one', () => {
  const decl = closeDecl();
  decl.stages.at(-1).params.card = { items: [{ rule: 'returns', text: 'the composer\'s guess' }] };
  const signed = signJudgedArtifacts({ proposal: PROPOSAL() });
  const folded = foldJudgedArtifacts(decl, { card: signed.card, cases: signed.cases });
  assert.deepEqual(folded.stages.at(-1).params.card, signed.card);
  assert.deepEqual(decl.stages.at(-1).params.card.items[0].rule, 'returns', 'the input is never mutated');
});

test('a card with nowhere to land THROWS — a signed rubric over a close with no judged ruler is a bug, not a red', () => {
  const decl = closeDecl();
  decl.stages = decl.stages.filter((/** @type {any} */ s) => s.kind !== 'judged-floor');
  const signed = signJudgedArtifacts({ proposal: PROPOSAL() });
  assert.throws(() => foldJudgedArtifacts(decl, { card: signed.card, cases: signed.cases }), /judged-floor/);
});

test('the HASH covers both: a card edit and a case edit each flip it; a byte-identical re-store does not', () => {
  const signed = signJudgedArtifacts({ proposal: PROPOSAL() });
  const base = /** @type {any} */ ({
    job: 'docs', goal: 'document src/', verdictType: 'soft-green',
    closeDecl: foldJudgedArtifacts(closeDecl(), { card: signed.card, cases: signed.cases }),
  });
  const h0 = jobSpecHash(base);

  // re-storing the identical artifacts is hash-neutral
  const again = signJudgedArtifacts({ proposal: PROPOSAL() });
  const h1 = jobSpecHash({ ...base, closeDecl: foldJudgedArtifacts(closeDecl(), { card: again.card, cases: again.cases }) });
  assert.equal(h1, h0, 'byte-identical artifacts hash identically');

  // a CARD line moves it
  const cardFix = PROPOSAL();
  cardFix.card.items[0].text = 'a different sentence entirely';
  const s2 = signJudgedArtifacts({ proposal: PROPOSAL(), fix: cardFix });
  const h2 = jobSpecHash({ ...base, closeDecl: foldJudgedArtifacts(closeDecl(), { card: s2.card, cases: s2.cases }) });
  assert.notEqual(h2, h0, 'a card change is a re-sign');

  // a CASE moves it too
  const caseFix = PROPOSAL();
  caseFix.cases[3].artifact = `${ARTIFACT_PASS}// edited by the signer\n`;
  const s3 = signJudgedArtifacts({ proposal: PROPOSAL(), fix: caseFix });
  const h3 = jobSpecHash({ ...base, closeDecl: foldJudgedArtifacts(closeDecl(), { card: s3.card, cases: s3.cases }) });
  assert.notEqual(h3, h0, 'a case edit is a re-sign');
  assert.notEqual(h3, h2);

  // and the hash is genuinely OVER the stored bytes, not beside them
  assert.equal(typeof h0, 'string');
  assert.equal(h0.length, createHash('sha256').update('x').digest('hex').length);
});

// ── 8. THE SPEC GATE ────────────────────────────────────────────────────────

test('validateCloseDecl accepts a folded softgreen close and REFUSES a broken calibration set', () => {
  const signed = signJudgedArtifacts({ proposal: PROPOSAL() });
  const ok = foldJudgedArtifacts(closeDecl(), { card: signed.card, cases: signed.cases });
  const listing = ['src/spine.js', 'src/other.js'];
  const v = validateCloseDecl(ok, { listing, verdictType: 'soft-green' });
  assert.equal(v.ok, true, JSON.stringify(v.reds));

  const short = structuredClone(ok);
  short.calibration.cases = short.calibration.cases.slice(0, 9);
  const v2 = validateCloseDecl(short, { listing, verdictType: 'soft-green' });
  assert.equal(v2.ok, false);
  assert.ok(v2.reds.some((/** @type {any} */ r) => r.code === 'calibration-size'));
});

test('a calibration set with no judged stage to grade is refused', () => {
  const signed = signJudgedArtifacts({ proposal: PROPOSAL() });
  const decl = closeDecl();
  decl.stages = decl.stages.filter((/** @type {any} */ s) => s.kind !== 'judged-floor');
  const v = validateCloseDecl(
    { ...decl, calibration: { cases: signed.cases } },
    { listing: ['src/spine.js'], verdictType: 'green' },
  );
  assert.equal(v.ok, false);
  assert.ok(v.reds.some((/** @type {any} */ r) => r.code === 'calibration-orphan'), JSON.stringify(v.reds));
});

test('the set is graded against the JUDGED STAGE\'s own card — a case naming an unjudged rule reds at the spec gate', () => {
  const signed = signJudgedArtifacts({ proposal: PROPOSAL() });
  const decl = foldJudgedArtifacts(closeDecl(), { card: signed.card, cases: signed.cases });
  decl.stages.at(-1).params.card = { items: [{ rule: 'returns', text: 'only returns' }] };
  const v = validateCloseDecl(decl, { listing: ['src/spine.js'], verdictType: 'soft-green' });
  assert.equal(v.ok, false);
  assert.ok(v.reds.some((/** @type {any} */ r) => r.code === 'calibration-case'), JSON.stringify(v.reds));
});

// ── 9. THE PAID SEAM ────────────────────────────────────────────────────────

test('one seam, one call: the proposal arrives through the tool and is validated', async () => {
  const { generate, calls } = scriptGenerate([{ proposal: PROPOSAL() }]);
  const book = makeCostBook({});
  const r = await proposeJudgedArtifacts({ answers: ANSWERS(), generate, book });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(calls.length, 1);
  assert.equal(r.proposal.cases.length, CALIBRATION_SIZE);
  assert.equal(book.report().calls.length, 1, 'the call is metered');
});

test('a reply carrying no proposal is an ARTIFACT-RED, retried under the shared bounded ladder', async () => {
  const { generate, calls } = scriptGenerate([{ text: 'here is my rubric, in prose' }]);
  const book = makeCostBook({});
  const r = await proposeJudgedArtifacts({ answers: ANSWERS(), generate, book, structureRetries: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'artifact-red');
  assert.equal(calls.length, 3, 'one attempt plus two bounded retries — never a new ladder');
  assert.ok(r.reds[0].detail.includes(PROPOSAL_TOOL_NAME));
});

test('a proposal that parses but breaks the ruling comes back with the RULE, not a parse error', async () => {
  const bad = PROPOSAL();
  bad.cases = bad.cases.slice(0, 9);
  const { generate } = scriptGenerate([{ proposal: bad }]);
  const r = await proposeJudgedArtifacts({ answers: ANSWERS(), generate, book: makeCostBook({}) });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'proposal-invalid');
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-size'));
  assert.equal(r.proposal.cases.length, 9, 'what the model actually said is kept, never repaired');
});

test('a transport failure is a casualty, named as one', async () => {
  const { generate } = scriptGenerate([{ error: 'ENETUNREACH' }]);
  const r = await proposeJudgedArtifacts({ answers: ANSWERS(), generate, book: makeCostBook({}) });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'provider-red');
});

test('the ceiling binds BEFORE the call — an exhausted book buys no proposal', async () => {
  const book = makeCostBook({ ceilingUsd: 0.001 });
  book.add('scout', { metrics: { costUsd: 0.5, unpricedRounds: 0 } });
  const { generate, calls } = scriptGenerate([{ proposal: PROPOSAL() }]);
  const r = await proposeJudgedArtifacts({ answers: ANSWERS(), generate, book });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'cap-halt');
  assert.equal(calls.length, 0, 'nothing was bought above the ceiling');
});

test('proposalTool takes NO action — it records and acknowledges', async () => {
  /** @type {{calls: any[]}} */
  const box = { calls: [] };
  const tool = proposalTool(box);
  assert.equal(tool.name, PROPOSAL_TOOL_NAME);
  const ack = await tool.execute(PROPOSAL());
  assert.equal(typeof ack, 'string');
  assert.equal(box.calls.length, 1);
});

// ── 10. THE WHOLE-ARTIFACT GATE ─────────────────────────────────────────────

test('validateJudgedArtifacts refuses a card and a set independently, and names both', () => {
  const r = validateJudgedArtifacts({ card: { items: [] }, cases: CASES().slice(0, 9) });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((/** @type {any} */ x) => x.path === 'card'));
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'calibration-size'));
});
