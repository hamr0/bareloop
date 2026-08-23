// THE JUDGE MODEL, INSIDE THE SIGNATURE (1A) — the detector behind a docstring's
// claim.
//
// `JUDGE_MODEL` (src/judged.js) has always SAID that a judge-model bump forces a
// full recalibration. Nothing enforced it: the stored calibration set carried only
// its `cases`, so the tier that certified those cases was nowhere in the signed
// bytes, a bump flipped no hash, and the stage that grades a run never compared the
// model it was about to buy against the model the signer's set was graded by. A
// rule with no wired detector is prose (F45), and this file is the wiring's test.
//
// FOUR PROMISES, and they are four different layers on purpose — the same
// split the calibration set itself already lives under:
//
//   - THE FOLD STORES IT. `foldJudgedArtifacts` writes `judgeModel` beside
//     `cases`, inside the spec, so `jobSpecHash` covers it by construction.
//   - THE HASH MOVES. Two specs differing in nothing but that field hash
//     differently — which is what makes a bump a RE-SIGN rather than a silent
//     re-read.
//   - THE VALIDATOR REQUIRES IT. A stored set without the model that graded it is
//     a set nobody can attribute, and it reds at the spec gate before any token.
//   - THE STAGE REFUSES A MISMATCH. `runJudgedFloor` stops on the same fault the
//     absent-seam gap stops on, naming BOTH models and the two things that fix it.
//
// The stamp reaches the stage the way every other arbiter-owned fact does — through
// `declaredStages`, which already stamps `offer: false` by law rather than trusting
// the artefact for it.
//
// NO PAID CALL: every judge seam here is an injected fake.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStage, STOP_FAULTS, EXIT_STOP, EXIT_GREEN } from '../src/kinds.js';
import { JUDGE_MODEL } from '../src/judged.js';
import { validateCloseDecl, declaredStages } from '../src/declaredclose.js';
import { foldJudgedArtifacts } from '../src/cardauthor.js';
import { jobSpecHash } from '../src/job.js';

const CARD = {
  items: [
    { rule: 'has-doc', text: 'Every exported function carries a JSDoc block.' },
    { rule: 'params', text: 'Every parameter is documented.' },
  ],
};

const ARTIFACT = '/** add two numbers\n * @param {number} a @param {number} b */\n'
  + 'export function add(a, b) {\n  return a + b;\n}\n';

/** the facts an honest judge returns about ARTIFACT — a clean PASS, so any red or
 * stop this file reads comes from the detector under test and never from the card */
const PASS_FACTS = {
  functions: [{
    name: 'add',
    declarationQuote: 'export function add(a, b) {',
    docQuote: '/** add two numbers',
    paramNames: ['a', 'b'],
    paramTagNames: ['a', 'b'],
    returnsDocumented: true,
    returnsValue: true,
    returnsQuote: '@param {number} a @param {number} b',
  }],
};

const base = mkdtempSync(join(tmpdir(), 'judge-model-pin-'));
let n = 0;
function patient() {
  const wd = join(base, `p${n += 1}`);
  mkdirSync(join(wd, 'src'), { recursive: true });
  writeFileSync(join(wd, 'src', 'mod.js'), ARTIFACT);
  return wd;
}

const fakeJudge = () => ({
  loop: () => ({
    run: async () => ({
      text: JSON.stringify(PASS_FACTS),
      stopReason: 'end_turn',
      error: null,
      metrics: { costUsd: 0.0004, unpricedRounds: 0 },
    }),
  }),
});

const CTX = (wd, over = {}) => ({ workdir: wd, seedRef: 'HEAD', gapKeep: 'close: ', judgeLoop: fakeJudge().loop, ...over });

/** a close declaration that judges, with `judgeModel` under the caller's control so
 * both directions of the detector are reachable from one fixture */
const decl = (judgeModel = JUDGE_MODEL) => ({
  genre: 'types',
  lang: 'js',
  stages: [{ name: 'docs-read-well', kind: 'judged-floor', params: { card: CARD, paths: ['src/mod.js'] } }],
  calibration: {
    cases: [{ id: 'pass-1', artifact: ARTIFACT, expect: { verdict: 'pass', reds: [] } }],
    ...(judgeModel === null ? {} : { judgeModel }),
  },
});

// ── 1. THE FOLD ──────────────────────────────────────────────────────────────

test('the fold stores the JUDGE MODEL beside the cases — the tier that graded them is part of the artifact', () => {
  const out = foldJudgedArtifacts(
    { genre: 'types', lang: 'js', stages: [{ name: 'docs-read-well', kind: 'judged-floor', params: {} }] },
    { card: CARD, cases: [{ id: 'pass-1', artifact: ARTIFACT, expect: { verdict: 'pass', reds: [] } }] },
  );
  assert.equal(out.calibration.judgeModel, JUDGE_MODEL);
  assert.equal(out.calibration.cases.length, 1, 'and the cases still land where they always did');
});

// ── 2. THE HASH ──────────────────────────────────────────────────────────────

test('a judge-model bump FLIPS the spec hash — a bump is a re-sign, never a silent re-read', () => {
  const spec = (judgeModel) => ({
    schema: 'job-v1',
    job: 'judged-patient',
    goal: 'Document every exported function in src/.',
    budgetUsd: 1.5,
    writeScope: ['src/**'],
    verdictType: 'soft-green',
    closeDecl: decl(judgeModel),
  });
  const pinned = jobSpecHash(spec(JUDGE_MODEL));
  const bumped = jobSpecHash(spec('claude-haiku-9-9'));
  assert.notEqual(pinned, bumped, 'the field is INSIDE the hashed spec, so the signature cannot survive the bump');
  assert.equal(pinned, jobSpecHash(spec(JUDGE_MODEL)), 'and the hash is still stable for an unchanged spec');
});

// ── 3. THE VALIDATOR ─────────────────────────────────────────────────────────

test('a stored calibration set with NO judge model is a spec-gate red — an unattributable set', () => {
  const r = validateCloseDecl(decl(null), { deferListing: true, verdictType: 'soft-green' });
  const red = r.reds.find((x) => x.path === 'closeDecl.calibration.judgeModel');
  assert.ok(red, `expected a judgeModel red, got ${JSON.stringify(r.reds)}`);
  assert.equal(red.code, 'missing-required');
});

test('a judge model of the wrong SHAPE reds too — and a legal set still validates clean', () => {
  const bad = validateCloseDecl(decl(''), { deferListing: true, verdictType: 'soft-green' });
  assert.ok(bad.reds.some((x) => x.path === 'closeDecl.calibration.judgeModel' && x.code === 'invalid-value'));

  // the fixture is deliberately a MINIMAL declaration (it carries none of the genre's
  // mandatory guards and one case rather than ten), so the assertion is on THIS field
  // and not on the whole declaration — every other red here belongs to a rule this
  // test is not about, and swallowing them into one `ok` would make it a smoke test.
  const good = validateCloseDecl(decl(), { deferListing: true, verdictType: 'soft-green' });
  assert.ok(!good.reds.some((x) => x.path === 'closeDecl.calibration.judgeModel'),
    `a legal judge model must not red: ${JSON.stringify(good.reds)}`);
});

// ── 4. THE STAMP ─────────────────────────────────────────────────────────────

test('declaredStages stamps the stored judge model onto the judged stage — the arbiter carries it, not the artefact', () => {
  const stages = declaredStages(decl('claude-haiku-9-9'));
  const judged = stages.find((s) => s.kind === 'judged-floor');
  assert.equal(judged.calibrationJudgeModel, 'claude-haiku-9-9');
  assert.equal(judged.offer, false, 'and the law it already stamped is untouched');
});

// ── 5. THE STAGE ─────────────────────────────────────────────────────────────

test('the judged stage STOPS when the signed calibration names a different judge — both models, and the two fixes', async () => {
  const wd = patient();
  const stages = declaredStages(decl('claude-haiku-9-9'));
  const r = await runStage(stages.find((s) => s.kind === 'judged-floor'), CTX(wd));

  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.exitCode, EXIT_STOP);
  assert.equal(r.judged, false, 'a stop renders no judgment about the tree');
  assert.equal(r.detail.fault, STOP_FAULTS.FAILED, 'the same fault an absent judge seam stops on — a wiring gap, not a crash');
  assert.ok(r.detail.stop.includes('claude-haiku-9-9'), 'the model the set was CALIBRATED by is named');
  assert.ok(r.detail.stop.includes(JUDGE_MODEL), 'and so is the model this run would have bought');
  assert.match(r.detail.stop, /re-sign/i);
  assert.match(r.detail.stop, /recalibrat/i);
});

test('the judged stage RUNS when the signed calibration names the pinned judge', async () => {
  const wd = patient();
  const stages = declaredStages(decl());
  const r = await runStage(stages.find((s) => s.kind === 'judged-floor'), CTX(wd));

  assert.equal(r.verdict, 'green');
  assert.equal(r.exitCode, EXIT_GREEN);
  assert.equal(r.detail.model, JUDGE_MODEL);
});
