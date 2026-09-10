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
// PRD ITEM 32 REWRITE. This file used to pin the judge as a LIBRARY CONSTANT —
// every fixture below hard-imported `JUDGE_MODEL` as THE judge, because before
// item 32 that constant was the only judge bareloop could ever grade with. Item
// 32.1 un-pinned it: the identity that grades a job is now RESOLVED per job
// (`resolveJudge`, src/judged.js — the spec's signed `judge:{provider,model}` if
// one is named, else the job's own worker provider+model) and travels as data —
// `foldJudgedArtifacts`'s `judgeModel` argument, `ctx.judgeModel`, and
// `closeDecl.calibration.judgeModel` are all now the RESOLVED identity, never an
// import of the constant. `JUDGE_MODEL` survives only as one legal VALUE that
// identity can resolve to (still the right default for an anthropic-api job,
// per src/judged.js's own docstring) — this file no longer treats it as the
// judge, only as a convenient fixed string to hand `resolveJudge` when a test
// wants a stand-in for "the anthropic-api job's own worker model".
//
// FIVE PROMISES, and they are five different layers on purpose — the same
// split the calibration set itself already lives under:
//
//   - THE FOLD STORES IT. `foldJudgedArtifacts` writes the HANDED-IN identity
//     beside `cases`, inside the spec, so `jobSpecHash` covers it by
//     construction. No default: an absent identity throws (item 32.1).
//   - THE HASH MOVES. Two specs differing in nothing but that field hash
//     differently — which is what makes a bump a RE-SIGN rather than a silent
//     re-read.
//   - THE VALIDATOR REQUIRES IT. A stored set without the model that graded it is
//     a set nobody can attribute, and it reds at the spec gate before any token.
//   - THE STAGE REFUSES A MISMATCH. `runJudgedFloor` stops on the same fault the
//     absent-seam gap stops on, naming BOTH models and the two things that fix it.
//   - THE GUARD SURVIVES A PROVIDER CHANGE (PRD item 32.4). The recalibration
//     detector compares the STORED identity against `ctx.judgeModel` by name —
//     it does not carry a separate provider field, because a provider swap is,
//     in every real case, ALSO a model-name change (no two admitted providers
//     share a model id string). The guard was proven above only against a
//     same-provider model BUMP (`claude-haiku-4-5` → `claude-haiku-9-9`); the
//     test at the bottom of this file proves the identical mechanism catches a
//     calibration graded on one PROVIDER's model being asked to grade under a
//     different provider's model, through the real `resolveJudge` seam rather
//     than a hand-typed string — the exact shape item 32.4 asks for.
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
import { JUDGE_MODEL, resolveJudge } from '../src/judged.js';
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

// `judgeModel` defaults to `JUDGE_MODEL` here only because that is the identity
// EVERY run in this file resolves to unless a test deliberately overrides it —
// item 32.1 removed the library default `runJudgedFloor` reads, it did not
// remove the caller's freedom to resolve to the same value every time. The
// value below is what `resolveJudge({specJudge: null, workerProvider:
// 'anthropic-api', workerModel: JUDGE_MODEL})` would hand back, spelled out
// rather than routed through `resolveJudge` so the seam tests stay about the
// STAGE, not about resolution (that seam is exercised directly, with real
// `resolveJudge` calls, in the 32.4 test at the bottom of this file).
const CTX = (wd, over = {}) => ({
  workdir: wd, seedRef: 'HEAD', gapKeep: 'close: ', judgeModel: JUDGE_MODEL, judgeLoop: fakeJudge().loop, ...over,
});

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

test('the fold stores the HANDED-IN judge identity beside the cases — never a library import', () => {
  // the fold is asked with a model that is NOT `JUDGE_MODEL`, on purpose — the
  // only way to prove the stored value is the caller's resolved identity and
  // not a silent read of the constant is to hand in something else and see it
  // come back unchanged.
  const out = foldJudgedArtifacts(
    { genre: 'types', lang: 'js', stages: [{ name: 'docs-read-well', kind: 'judged-floor', params: {} }] },
    { card: CARD, cases: [{ id: 'pass-1', artifact: ARTIFACT, expect: { verdict: 'pass', reds: [] } }], judgeModel: 'deepseek-chat' },
  );
  assert.equal(out.calibration.judgeModel, 'deepseek-chat', 'the resolved identity, not the constant');
  assert.equal(out.calibration.cases.length, 1, 'and the cases still land where they always did');
});

test('the fold REFUSES with no judgeModel — there is no library pin to fall back to (PRD item 32.1)', () => {
  assert.throws(() => foldJudgedArtifacts(
    { genre: 'types', lang: 'js', stages: [{ name: 'docs-read-well', kind: 'judged-floor', params: {} }] },
    { card: CARD, cases: [{ id: 'pass-1', artifact: ARTIFACT, expect: { verdict: 'pass', reds: [] } }] },
  ), /needs the resolved judgeModel/);
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

// ── 6. THE GUARD ACROSS A PROVIDER CHANGE (PRD item 32.4) ───────────────────
//
// Every mismatch above is a same-provider model BUMP — a spec calibrated by
// `resolveJudge`'s anthropic-api default is later asked to grade under a
// different anthropic-api model name. Item 32.4 asks for the guard exercised
// across a judge CHANGE, not just a bump: a spec calibrated on one PROVIDER's
// resolved judge refuses to grade under a DIFFERENT provider's resolved judge,
// naming both — through the real `resolveJudge` seam this run's caller
// actually uses (scripts/run-u.mjs, src/authorjob.js), never a hand-typed
// string standing in for it. The detector itself is unchanged (it compares
// `stage.calibrationJudgeModel` against `ctx.judgeModel` by name, same as every
// test above): what this proves is that a REAL provider swap reaches that
// comparison as two different names, because no two admitted providers share a
// model id string — the mechanism a bare model bump already exercises is the
// SAME mechanism a provider swap exercises, and this is the row that says so
// with a real second provider rather than an invented one.

test('the recalibration guard fires across a PROVIDER change: a spec calibrated on anthropic-api refuses to grade on deepseek-api', async () => {
  const wd = patient();
  // the identity the close was SIGNED and calibrated under — this job's own
  // worker, resolved with no override, on anthropic-api
  const signedJudge = resolveJudge({ specJudge: null, workerProvider: 'anthropic-api', workerModel: JUDGE_MODEL });
  assert.equal(signedJudge.model, JUDGE_MODEL);
  const stages = declaredStages(decl(signedJudge.model));

  // later, the SAME spec's `judge` override is signed onto a different
  // provider (an operator moving the job's judge to DeepSeek) — resolved
  // through the identical seam, never a literal string
  const laterJudge = resolveJudge({ specJudge: { provider: 'deepseek-api', model: 'deepseek-chat' }, workerProvider: 'anthropic-api', workerModel: JUDGE_MODEL });
  assert.notEqual(laterJudge.provider, signedJudge.provider, 'the fixture is really crossing a provider boundary');

  const r = await runStage(stages.find((s) => s.kind === 'judged-floor'), CTX(wd, { judgeModel: laterJudge.model }));

  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.exitCode, EXIT_STOP);
  assert.equal(r.detail.fault, STOP_FAULTS.FAILED, 'a wiring gap, not a crash, and not a verdict on the tree');
  assert.ok(r.detail.stop.includes(signedJudge.model), 'the provider/model the set was CALIBRATED by is named');
  assert.ok(r.detail.stop.includes(laterJudge.model), 'and so is the provider/model this run would have bought');
  assert.match(r.detail.stop, /re-sign/i);
  assert.match(r.detail.stop, /recalibrat/i);
});
