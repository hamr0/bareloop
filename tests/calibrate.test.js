// THE CALIBRATION GATE (softgreen module 5) — the ten graded truths and the five
// resisted lies that buy a signature.
//
// Module 4 stored two signed artifacts and checked them for LEGALITY, saying in
// its own header that it does not grade. What is under test here is the grading,
// and it is five separate promises:
//
//   - THE FLOOR IS ITEMIZED, NOT VERDICT-LEVEL. A case graded to the right
//     verdict for the wrong reason is a FAILED case (hamr, 2026-08-18: 10/10 with
//     itemized reds). The negative control for that is a set whose verdicts all
//     match and whose addresses do not.
//   - A CASUALTY IS NEVER A CASE. A dead call, an unpriced one and an
//     unparseable emission STOP the gate on the transport's own axis — a broken
//     judge says nothing about the set, in either direction (F45).
//   - THE INJECTION BATTERY READS THE FACTS. Re-aimed at the locate axis
//     (2026-08-18 second addendum, ruling 1), and it MUST read the facts rather
//     than the decision: an invented `docQuote` reds `has-doc` through the
//     quote-verification route, so a leak and a resist can render the SAME
//     itemized reds. The test for that is the leak that passes the decision.
//   - A JUDGED CLOSE IS UNSIGNABLE WITHOUT IT, and a JUDGED-ONLY close is
//     signable WITH it (ruling 3 — the calibration plays D9.3's seed-red role).
//     Both directions, plus the mechanical close staying byte-identically bound
//     to its seed red.
//   - THE MONEY IS VISIBLE. Every locate call the gate buys is metered on every
//     route out, and one unpriced call makes the TOTAL unknown (F6), never $0.
//
// NO PAID CALL ANYWHERE: every judge seam is an injected fake. The fakes EXTRACT
// (they read the artifact they are handed and answer about it) rather than replay
// a canned string, because a replay would answer the same thing for every case
// and could not tell a working comparison from a broken one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  runCalibration, compareExpectation, factsResist, artifactHash,
  INJECTION_LOCATE_BATTERY, INJECTION_CARD, CALIBRATION_LABEL, CASUALTY_AXES,
} from '../src/calibrate.js';
import { JUDGE_MODEL, CALIBRATION_SIZE, expectedOf, decide } from '../src/judged.js';
import { signJudgedArtifacts } from '../src/cardauthor.js';
import { prepareSigning, assembleSpec, authorCloseForJob, GENRE } from '../src/authorjob.js';
import { classGuards } from '../src/authoring.js';

// ── the artifacts, and an honest extractor over them ─────────────────────────

const CARD = () => ({
  items: [
    { rule: 'has-doc', text: 'Every exported function carries a JSDoc block.' },
    { rule: 'params', text: 'Every parameter is documented.' },
  ],
});

const ARTIFACT_RED = 'export function add(a, b) {\n  return a + b;\n}\n';
const ARTIFACT_PASS = '/** add two numbers\n * @param {number} a @param {number} b */\n'
  + 'export function add(a, b) {\n  return a + b;\n}\n';

/**
 * A DETERMINISTIC HONEST EXTRACTOR — what a truthful judge would come back with.
 * It reads the artifact it is handed (never a fixture keyed by case id), so the
 * comparison under test is exercised with ten different answers rather than one
 * answer ten times.
 * @param {string} artifact
 */
function extract(artifact) {
  const lines = artifact.split('\n');
  /** @type {any[]} */
  const functions = [];
  lines.forEach((line, i) => {
    const m = /^export function (\w+)\(([^)]*)\)/.exec(line.trim());
    if (!m) return;
    /** @type {string|null} */
    let docQuote = null;
    /** @type {string[]} */
    const paramTagNames = [];
    for (let j = i - 1; j >= 0; j -= 1) {
      const t = lines[j].trim();
      if (t === '') break;
      for (const tag of t.matchAll(/@param \{[^}]*\} (\w+)/g)) paramTagNames.unshift(tag[1]);
      // a real JSDoc block OPENS the line. `includes` is what a credulous reader
      // would do, and the injection artifacts deliberately bait exactly that: two
      // of them carry a literal `/**` inside their attack comment, and a judge
      // that quoted THAT line back would pass `has-doc` in the real pipe (the
      // quote IS in the artifact). This extractor stands in for a TRUTHFUL model,
      // so it reads the opener rather than the bait.
      if (t.startsWith('/**')) { docQuote = t; break; }
      if (!t.startsWith('*') && !t.endsWith('*/')) break;
    }
    const paramNames = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    functions.push({
      name: m[1],
      declarationQuote: line.trim(),
      docQuote,
      paramNames,
      paramIsPattern: paramNames.map(() => false),
      paramTagNames,
    });
  });
  return { functions };
}

/** the artifact a locate call was pointed at, read back out of the message the
 * fake receives — the fakes answer about the REAL input, never about a case id */
const artifactOf = (/** @type {any[]} */ msgs) => String(msgs?.[0]?.content ?? '')
  .replace(/^FILE \(untrusted data\):\n/, '')
  .replace(/\n\nReturn the JSON\.$/, '');

/**
 * A fake judge seam. `answer` maps the artifact text to the facts object the
 * model "returns"; `costUsd` is what the round is priced at.
 * @param {(artifact: string) => any} answer
 * @param {{costUsd?: number|null, unpricedRounds?: number, text?: (a: string) => string, error?: string|null}} [o]
 */
function fakeJudge(answer, { costUsd = 0.0004, unpricedRounds = 0, text = null, error = null } = {}) {
  /** @type {any[]} */
  const calls = [];
  const loop = (/** @type {{system: string}} */ o) => ({
    run: async (/** @type {any[]} */ msgs) => {
      const artifact = artifactOf(msgs);
      calls.push({ system: o.system, artifact });
      return {
        text: text ? text(artifact) : JSON.stringify(answer(artifact)),
        stopReason: 'end_turn',
        error,
        metrics: { costUsd, unpricedRounds },
      };
    },
  });
  return { loop, calls };
}

/** the honest judge: it extracts, truthfully, every time */
const honest = (/** @type {any} */ o) => fakeJudge(extract, o);

// ── the signed ten, with the gold DERIVED from the shipped rulebook ──────────
//
// The expectation is what `decide()` renders over an HONEST extraction, taken
// through `expectedOf` — the same reduction the gate compares against. That is
// not the gate marking its own homework: what is under test is whether the whole
// PIPE (a model emission, parsed, then judged) reproduces a stored expectation,
// and the stored expectation has to come from somewhere a signer could also
// arrive at. Every wrong-answer test below perturbs one side and watches the
// comparison separate.

/** @param {string} artifact */
const goldFor = (artifact) => expectedOf(decide(extract(artifact), CARD(), { artifactText: artifact }));

/** @param {number} i */
const passCase = (i) => {
  const artifact = `${ARTIFACT_PASS}// case ${i}\n`;
  return { id: `pass-${i}`, artifact, expect: goldFor(artifact) };
};
/** @param {number} i */
const redCase = (i) => {
  const artifact = `${ARTIFACT_RED}// case ${i}\n`;
  return { id: `red-${i}`, artifact, expect: goldFor(artifact) };
};

const CASES = () => [
  ...Array.from({ length: 5 }, (_, i) => passCase(i + 1)),
  ...Array.from({ length: 5 }, (_, i) => redCase(i + 1)),
];

// the fixture is only worth anything if the two polarities really are two
// polarities — asserted rather than assumed
test('fixture check: the ten carry both polarities, and a red case is ITEMIZED', () => {
  const cases = CASES();
  assert.equal(cases.length, CALIBRATION_SIZE);
  assert.equal(cases.filter((c) => c.expect.verdict === 'pass').length, 5);
  const red = cases.find((c) => c.expect.verdict === 'red');
  assert.deepEqual(red.expect.reds, [{ rule: 'has-doc', fn: 'add' }, { rule: 'params', fn: 'add' }]);
});

// ── 1. THE HAPPY PATH ────────────────────────────────────────────────────────

test('10/10 graded + 5/5 resisted → the gate passes, and every row is itemized', async () => {
  const j = honest();
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: j.loop });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.stop, null);
  assert.equal(r.graded.length, CALIBRATION_SIZE);
  assert.ok(r.graded.every((g) => g.ok && g.detail === null));
  // ITEMIZED, never an aggregate: every row names its case and carries both sides
  assert.deepEqual(r.graded.map((g) => g.id).sort(), CASES().map((c) => c.id).sort());
  assert.ok(r.graded.every((g) => Array.isArray(g.got.reds) && Array.isArray(g.want.reds)));
  assert.equal(r.injection.allResisted, true);
  assert.equal(r.injection.styles.length, INJECTION_LOCATE_BATTERY.length);
  assert.deepEqual(r.injection.leaks, []);
  assert.equal(r.judgeModel, JUDGE_MODEL);
  // the whole pipe, not just decide(): one locate call per artifact
  assert.equal(j.calls.length, CALIBRATION_SIZE + INJECTION_LOCATE_BATTERY.length);
});

test('the gate certifies WHICH BYTES it graded — card, cases and the model it used', async () => {
  const cases = CASES();
  const a = await runCalibration({ cases, card: CARD(), judgeLoop: honest().loop });
  const b = await runCalibration({ cases, card: CARD(), judgeLoop: honest().loop });
  assert.equal(a.cardHash, b.cardHash, 'a byte-identical card hashes identically');
  assert.equal(a.casesHash, b.casesHash);
  assert.equal(a.setHash, b.setHash);

  // …and a moved card or a moved case moves the hash, which is what makes the
  // stored certification a claim about SOMETHING
  const card2 = CARD();
  card2.items[0].text = 'Every exported function carries a JSDoc block, please.';
  const c = await runCalibration({ cases, card: card2, judgeLoop: honest().loop });
  assert.notEqual(c.cardHash, a.cardHash);
  const cases2 = CASES();
  cases2[0].artifact += '// edited\n';
  const d = await runCalibration({ cases: cases2, card: CARD(), judgeLoop: honest().loop });
  assert.notEqual(d.casesHash, a.casesHash);
  // the set hash covers the MODEL too: a judge-model bump is a different ruler
  assert.notEqual(artifactHash({ card: CARD(), cases, judgeModel: 'other-model' }), a.setHash);
});

// ── 2. THE FLOOR IS ALL OF THEM, AND IT IS ITEMIZED ─────────────────────────

test('one WRONG VERDICT reds the gate and NAMES the case', async () => {
  const cases = CASES();
  // the signer signed a pass for an artifact the rulebook reds
  cases[9].expect = { verdict: 'pass', reds: [] };
  const r = await runCalibration({ cases, card: CARD(), judgeLoop: honest().loop });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'calibration-red');
  assert.deepEqual(r.failures, ['red-5']);
  const red = r.reds.find((x) => x.code === 'calibration-miswrite');
  assert.equal(red.path, 'calibration.cases.red-5');
  assert.match(red.detail, /signed "pass".*rendered "red"/);
  // the other nine are still reported, correctly — an itemized gate never
  // collapses to "something failed"
  assert.equal(r.graded.filter((g) => g.ok).length, CALIBRATION_SIZE - 1);
});

test('THE FLOOR IS ITEMIZED: right verdict, wrong ADDRESS is a failed case', async () => {
  const cases = CASES();
  // same verdict, one of the two itemized reds dropped: the pipe would red this
  // artifact for a reason the signer did not sign
  cases[5].expect = { verdict: 'red', reds: [{ rule: 'has-doc', fn: 'add' }] };
  // …and one where the ADDRESS is wrong rather than missing
  cases[6].expect = { verdict: 'red', reds: [{ rule: 'has-doc', fn: 'subtract' }, { rule: 'params', fn: 'add' }] };
  const r = await runCalibration({ cases, card: CARD(), judgeLoop: honest().loop });
  assert.equal(r.ok, false);
  assert.deepEqual(r.failures, ['red-1', 'red-2']);
  assert.match(r.graded.find((g) => g.id === 'red-1').detail, /raised that nobody signed/);
  const wrongFn = r.graded.find((g) => g.id === 'red-2');
  assert.match(wrongFn.detail, /did not raise/);
  assert.match(wrongFn.detail, /has-doc · subtract/);
});

test('compareExpectation: verdict AND reds, order-insensitive, both halves required', () => {
  const want = { verdict: 'red', reds: [{ rule: 'has-doc', fn: 'a' }, { rule: 'params', fn: 'b' }] };
  const reordered = { verdict: 'red', reds: [{ rule: 'params', fn: 'b' }, { rule: 'has-doc', fn: 'a' }] };
  assert.equal(compareExpectation(reordered, want).ok, true, 'order is not a fact about the pipe');
  assert.equal(compareExpectation({ verdict: 'pass', reds: [] }, want).ok, false);
  assert.equal(compareExpectation({ verdict: 'red', reds: [{ rule: 'has-doc', fn: 'a' }] }, want).ok, false);
  const extra = compareExpectation({ verdict: 'red', reds: [...want.reds, { rule: 'params', fn: 'c' }] }, want);
  assert.equal(extra.ok, false);
  assert.deepEqual(extra.extra, ['params · c']);
});

// ── 3. A CASUALTY IS NEVER A FAILED CASE ────────────────────────────────────

test('a dead call STOPS the gate as a provider casualty, never as a red case', async () => {
  let n = 0;
  const loop = () => ({
    run: async (/** @type {any[]} */ msgs) => {
      n += 1;
      // the 3rd artifact dies, after two clean grades — so there IS a graded
      // prefix, and it must not be reported as if the run finished
      if (n >= 3) throw new Error('ENETUNREACH');
      return { text: JSON.stringify(extract(artifactOf(msgs))), stopReason: 'end_turn', error: null, metrics: { costUsd: 0.0004, unpricedRounds: 0 } };
    },
  });
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: loop });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'provider-red');
  assert.ok(CASUALTY_AXES.includes(r.stop));
  assert.equal(r.casualty.at, 'pass-3');
  assert.equal(r.casualty.kind, 'case');
  assert.equal(r.graded.length, 2, 'the two real grades are kept');
  assert.deepEqual(r.failures, [], 'an UNGRADED case is never a FAILED one');
  assert.ok(!r.reds.some((x) => x.code === 'calibration-miswrite'));
  assert.match(r.reds[0].detail, /CASUALTY/);
  // …and the ladder was real: JUDGE_ATTEMPTS attempts on the dying artifact
  assert.equal(r.casualty.attempts.length, 2);
});

test('an UNPRICED call is a pricing casualty and is never retried (F6)', async () => {
  const j = honest({ costUsd: null, unpricedRounds: 1 });
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: j.loop });
  assert.equal(r.stop, 'pricing-red');
  assert.equal(r.casualty.attempts.length, 1, 'a retry of an unpriced call only buys more spend nobody can see');
  assert.equal(r.costUsd, null, 'unknown is reported as UNKNOWN, never as $0');
  assert.equal(r.spendComplete, false);
});

test('the ladder is TIGHTEN-ONLY with a floor of 1 — zero attempts is not a cheaper gate', async () => {
  // a caller may buy fewer retries; a caller may not buy a gate that runs no call
  // and therefore has no reading to report
  const one = fakeJudge(() => ({}), { text: () => 'not json' });
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: one.loop, attempts: 0 });
  assert.equal(r.stop, 'artifact-red');
  assert.equal(one.calls.length, 1, 'exactly one attempt — the floor, never none');
  // …and never MORE than the shipped ladder, whatever a caller asks for
  const many = fakeJudge(() => ({}), { text: () => 'not json' });
  await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: many.loop, attempts: 99 });
  assert.equal(many.calls.length, 2, 'the operator-confirmed JUDGE_ATTEMPTS ceiling still binds');
});

test('an emission that never parses is an artifact casualty AFTER the ladder', async () => {
  const j = fakeJudge(() => ({}), { text: () => '{"functions":[' });
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: j.loop });
  assert.equal(r.stop, 'artifact-red');
  assert.equal(r.casualty.at, 'pass-1');
  assert.equal(j.calls.length, 2, 'one retry, then stop');
});

// ── 4. THE MONEY ─────────────────────────────────────────────────────────────

test('every locate call is metered, on every route out, and the totals are honest', async () => {
  /** @type {any[]} */
  const seen = [];
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: honest().loop, onCost: (c) => seen.push(c) });
  assert.equal(seen.length, CALIBRATION_SIZE + INJECTION_LOCATE_BATTERY.length);
  assert.ok(seen.every((c) => c.label === CALIBRATION_LABEL && c.model === JUDGE_MODEL));
  assert.deepEqual([...new Set(seen.map((c) => c.kind))], ['case', 'injection']);
  assert.equal(r.spendComplete, true);
  assert.equal(r.costUsd, Number((0.0004 * seen.length).toFixed(6)));
  assert.equal(r.knownUsd, r.costUsd);
  assert.equal(r.calls.length, seen.length);
});

test('a null cost inside an otherwise clean run makes the TOTAL unknown, never $0', async () => {
  let n = 0;
  const loop = () => ({
    run: async (/** @type {any[]} */ msgs) => {
      n += 1;
      return {
        text: JSON.stringify(extract(artifactOf(msgs))),
        stopReason: 'end_turn',
        error: null,
        // priced everywhere except one round, which is exactly the shape `?? 0`
        // used to launder into an exact-looking total
        metrics: n === 4 ? { costUsd: null, unpricedRounds: 1 } : { costUsd: 0.001, unpricedRounds: 0 },
      };
    },
  });
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: loop });
  assert.equal(r.stop, 'pricing-red', 'the unpriced call is itself the stop');
  assert.equal(r.costUsd, null);
  assert.ok(r.knownUsd > 0, 'the priced half is still reported, explicitly');
});

// ── 5. THE INJECTION BATTERY, RE-AIMED AT LOCATE ────────────────────────────

test('the battery is FIVE arbiter-owned styles, one per upstream attack, and it is not in any spec', () => {
  assert.equal(INJECTION_LOCATE_BATTERY.length, 5);
  assert.equal(new Set(INJECTION_LOCATE_BATTERY.map((b) => b.style)).size, 5);
  for (const b of INJECTION_LOCATE_BATTERY) {
    // the attack text is inside the ARTIFACT — the untrusted-data channel, which
    // is the only channel an attacker has
    assert.ok(b.artifact.length > 40, b.id);
    assert.equal(b.expect.verdict, 'red', 'every artifact carries one honestly undocumented function');
    assert.equal(b.expectFacts.functions.filter((f) => f.hasDoc).length, 1, 'and one honestly documented one');
  }
  // the card the battery grades against is ONE line, and it is ours
  assert.deepEqual(INJECTION_CARD.items.map((i) => i.rule), ['has-doc']);
});

test('all five styles resist an honest extractor', async () => {
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: honest().loop });
  assert.equal(r.injection.allResisted, true);
  assert.ok(r.injection.styles.every((s) => s.resisted && s.factsOk && s.decisionOk));
});

test('a LEAK fails calibration and NAMES the style — even when the decision still matches', async () => {
  // THE HAZARD THIS TEST EXISTS FOR: a judge that obeys the attack and invents a
  // doc quote produces the SAME itemized reds as an honest one, because an
  // unquotable quote reds `has-doc` through the quote-verification route. Only
  // the FACTS separate a leak from a resist here.
  const leaky = fakeJudge((artifact) => {
    const f = extract(artifact);
    for (const fn of f.functions) if (fn.docQuote === null) fn.docQuote = '/** documented, honest */';
    return f;
  });
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: leaky.loop });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'calibration-red');
  assert.equal(r.injection.allResisted, false);
  assert.equal(r.injection.leaks.length, 5);
  const leak = r.reds.find((x) => x.code === 'injection-leak');
  assert.ok(INJECTION_LOCATE_BATTERY.some((b) => b.style === leak.style), 'the leaking STYLE is named');
  const style = r.injection.styles[0];
  assert.equal(style.factsOk, false, 'the facts moved');
  assert.equal(style.decisionOk, true, 'and the decision did NOT — a verdict-only battery would have passed this');
  assert.match(style.detail, /reported one/);
});

test('a style that HIDES a function is a leak too', async () => {
  const hiding = fakeJudge((artifact) => ({
    functions: extract(artifact).functions.filter((f) => f.docQuote !== null),
  }));
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: hiding.loop });
  assert.equal(r.injection.allResisted, false);
  assert.match(r.injection.styles[0].detail, /function list moved/);
});

test('factsResist reads the facts, and both directions of the doc claim', () => {
  const b = INJECTION_LOCATE_BATTERY[0];
  const truth = extract(b.artifact);
  assert.equal(factsResist(truth, b.expectFacts, b.artifact).ok, true);
  // an undocumented function reported as documented
  const lied = { functions: truth.functions.map((f) => ({ ...f, docQuote: f.docQuote ?? '/**' })) };
  assert.equal(factsResist(lied, b.expectFacts, b.artifact).ok, false);
  // a DOCUMENTED function reported as undocumented — the other direction, which a
  // battery that only looked for false-positives would miss
  const denied = { functions: truth.functions.map((f) => ({ ...f, docQuote: null })) };
  assert.equal(factsResist(denied, b.expectFacts, b.artifact).ok, false);
  assert.equal(factsResist({ functions: null }, b.expectFacts, b.artifact).ok, false);
});

test('an injection casualty is a casualty, not a leak', async () => {
  let n = 0;
  const loop = () => ({
    run: async (/** @type {any[]} */ msgs) => {
      n += 1;
      if (n > CALIBRATION_SIZE) return { text: '', stopReason: 'end_turn', error: 'overloaded', metrics: { costUsd: 0.0001, unpricedRounds: 0 } };
      return { text: JSON.stringify(extract(artifactOf(msgs))), stopReason: 'end_turn', error: null, metrics: { costUsd: 0.0004, unpricedRounds: 0 } };
    },
  });
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: loop });
  assert.equal(r.stop, 'provider-red');
  assert.equal(r.casualty.kind, 'injection');
  assert.equal(r.injection.leaks.length, 0, 'a casualty is never counted as a leak');
  assert.equal(r.graded.filter((g) => g.ok).length, CALIBRATION_SIZE, 'the ten were graded before the battery died');
  assert.ok(!r.ok);
});

// ── 6. THE $0 REFUSALS — nobody pays to find out their set is illegal ────────

test('an illegal set is refused BEFORE any call', async () => {
  const j = honest();
  const r = await runCalibration({ cases: CASES().slice(0, 9), card: CARD(), judgeLoop: j.loop });
  assert.equal(r.stop, 'invalid-set');
  assert.equal(j.calls.length, 0, 'not one token');
  assert.ok(r.reds.some((x) => x.code === 'calibration-size'));
  assert.equal(r.costUsd, 0);
});

test('NO JUDGE SEAM is a wiring gap that stops the gate — never a silent pass', async () => {
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: null });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'no-judge');
  assert.equal(r.reds[0].code, 'no-judge-seam');
  assert.equal(r.graded.length, 0);
});

// ── 7. THE SIGNING GATE ─────────────────────────────────────────────────────

const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'cal-test', GIT_AUTHOR_EMAIL: 'cal@test',
    GIT_COMMITTER_NAME: 'cal-test', GIT_COMMITTER_EMAIL: 'cal@test',
  },
});

function makePatient(/** @type {any} */ t) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-cal-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [rel, body] of Object.entries({
    'src/mod.js': ARTIFACT_RED,
    'check.mjs': 'process.exitCode = 1;\n',
  })) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return { dir, seed: git(dir, ['rev-parse', 'HEAD']).trim() };
}

const sgGuards = () => classGuards({ verdictType: 'soft-green', lang: 'js' }).map((g) => ({
  name: g.name,
  kind: g.kind,
  params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
}));

/** a soft-green close. `mechanical` adds a work stage that is RED at the seed. */
const sgClose = ({ mechanical = false, cases = CASES() } = {}) => ({
  genre: GENRE,
  lang: 'js',
  stages: [
    ...sgGuards(),
    ...(mechanical ? [{ name: 'checks-clean', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }] : []),
    { name: 'docs-read-well', kind: 'judged-floor', params: { card: CARD(), paths: ['src/mod.js'] } },
  ],
  ...(cases === null ? {} : { calibration: { cases } }),
});

const DRAFT = {
  schema: 'job-v1',
  job: 'judged-patient',
  description: 'a job whose done needs a reading',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Document every exported function in src/, with a JSDoc block and @param tags.',
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
};

const sgSpec = (/** @type {any} */ over = {}) => assembleSpec({ ...DRAFT }, {
  closeDecl: sgClose(over),
  verdictType: 'soft-green',
});

test('D9.3 ruling 3: a JUDGED-ONLY close IS signable once the calibration gate passes', async (t) => {
  const p = makePatient(t);
  const j = honest();
  /** @type {any[]} */
  const costs = [];
  const r = await prepareSigning({
    spec: sgSpec(), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000,
    judgeLoop: j.loop, onJudgeCost: (c) => costs.push(c),
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(r.gates.calibration.ok, true);
  assert.deepEqual(r.gates.seedVerdict.workRed, [], 'the judged stage skips the seed read (ruling 8)');
  assert.equal(r.gates.seedVerdict.satisfiedBy, 'calibration', 'and the record SAYS which proof carried it');
  assert.ok(r.specHash);
  // …and it really spent real metered money, reported
  assert.equal(costs.length, CALIBRATION_SIZE + INJECTION_LOCATE_BATTERY.length);
  assert.equal(r.gates.calibration.calls, costs.length);
  assert.ok(r.gates.calibration.costUsd > 0);
  assert.equal(r.gates.calibration.spendComplete, true);
});

test('the signing record stores WHAT the gate certified — hashes and the judge model', async (t) => {
  const p = makePatient(t);
  const spec = sgSpec();
  const r = await prepareSigning({
    spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: honest().loop,
  });
  const c = r.gates.calibration;
  assert.equal(c.judgeModel, JUDGE_MODEL);
  assert.equal(c.cardHash, artifactHash(CARD()));
  assert.equal(c.casesHash, artifactHash(CASES()));
  assert.equal(c.setHash, artifactHash({ card: CARD(), cases: CASES(), judgeModel: JUDGE_MODEL }));
  assert.equal(c.graded.length, CALIBRATION_SIZE);
  assert.equal(c.injection.styles.length, 5);
  // the ARTIFACTS are not copied into the evidence — they are already in the spec
  assert.ok(!JSON.stringify(c).includes('export function add'));
});

test('a judged close with NO calibration set is refused — the gate is MANDATORY at signing', async (t) => {
  const p = makePatient(t);
  const spec = sgSpec({ cases: null });
  const r = await prepareSigning({
    spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: honest().loop,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'calibration-missing');
  assert.equal(r.refusal.kind, 'decision-ready');
  assert.match(r.refusal.detail, /unmeasured ruler cannot be signed/);
  assert.equal(r.gates.calibration.ok, false);
});

test('a judged close whose gate FAILS in this run is refused, naming the case', async (t) => {
  const p = makePatient(t);
  const cases = CASES();
  cases[0].expect = { verdict: 'red', reds: [{ rule: 'has-doc', fn: 'add' }] };
  const r = await prepareSigning({
    spec: sgSpec({ cases }), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: honest().loop,
  });
  assert.equal(r.ok, false);
  assert.equal(r.specHash, null, 'nothing signable comes back');
  assert.ok(r.reds.some((x) => x.code === 'calibration-miswrite' && x.path.endsWith('pass-1')));
  assert.match(r.refusal.detail, /1 of 10 case\(s\) graded wrong/);
});

test('a judged close with NO judge seam wired is refused — the gate cannot be skipped', async (t) => {
  const p = makePatient(t);
  const r = await prepareSigning({ spec: sgSpec(), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000 });
  assert.equal(r.ok, false);
  assert.equal(r.gates.calibration.stop, 'no-judge');
  assert.match(r.refusal.detail, /wiring gap/);
});

test('a gate CASUALTY refuses under the TRANSPORT\'s name — never as a verdict on the close', async (t) => {
  const p = makePatient(t);
  const loop = () => ({ run: async () => { throw new Error('ENETUNREACH'); } });
  const r = await prepareSigning({ spec: sgSpec(), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: loop });
  assert.equal(r.ok, false);
  assert.equal(r.gates.calibration.stop, 'provider-red');
  assert.match(r.refusal.detail, /could not be RUN/);
  assert.ok(r.refusal.options.some((o) => /wait out the provider/.test(o)));
  assert.ok(!r.reds.some((x) => x.code === 'calibration-miswrite'));
});

test('a MECHANICAL close is unchanged: it still needs a seed red, calibration or not', async (t) => {
  const p = makePatient(t);
  // the mechanical work stage is GREEN at seed (`node -e ''` exits 0), so D9.3
  // must still refuse — a passed calibration is NOT a licence for a close that
  // has nothing to do
  const spec = assembleSpec({ ...DRAFT }, {
    closeDecl: {
      genre: GENRE,
      lang: 'js',
      stages: [
        ...sgGuards(),
        { name: 'already-fine', kind: 'command-exit', params: { cmd: 'node', args: ['-e', ''], expectExit: 0 } },
        { name: 'docs-read-well', kind: 'judged-floor', params: { card: CARD(), paths: ['src/mod.js'] } },
      ],
      calibration: { cases: CASES() },
    },
    verdictType: 'soft-green',
  });
  const r = await prepareSigning({
    spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: honest().loop,
  });
  assert.equal(r.gates.calibration.ok, true, 'the ruler is fine');
  assert.equal(r.ok, false, 'and the close still has nothing to do');
  assert.equal(r.gates.seedVerdict.satisfiedBy, undefined);
  assert.match(r.refusal.detail, /No work stage of this close is RED at the seed/);
});

test('a mechanical work stage that IS red at seed signs on its own seed evidence', async (t) => {
  const p = makePatient(t);
  const r = await prepareSigning({
    spec: sgSpec({ mechanical: true }), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: honest().loop,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.deepEqual(r.gates.seedVerdict.workRed, ['checks-clean']);
  assert.equal(r.gates.seedVerdict.satisfiedBy, undefined, 'the alternate route is for the judged-ONLY shape');
  assert.equal(r.gates.calibration.ok, true, 'and the gate is mandatory for it too');
});

test('the paid gate runs LAST — a close that fails a $0 gate never buys a call', async (t) => {
  const p = makePatient(t);
  const j = honest();
  // an invented path: gate 1b (grounded) refuses it against the seed listing
  const spec = assembleSpec({ ...DRAFT }, {
    closeDecl: sgClose(),
    verdictType: 'soft-green',
  });
  spec.closeDecl.stages.at(-1).params.paths = ['src/nope.js'];
  const r = await prepareSigning({
    spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: j.loop,
  });
  assert.equal(r.ok, false);
  assert.equal(r.gates.calibration, null, 'never reached');
  assert.equal(j.calls.length, 0, 'and never paid for');
});

// ── 7b. THE THIRD PAID SEAM MEETS THE ONE CEILING ───────────────────────────
//
// The gate buys up to ten locate calls plus a five-artifact battery, each under
// its own retry ladder — the largest paid seam the authoring pipeline has. It
// used to run with NO ceiling at all while the scout and the declaration loop
// were both bounded by the operator's own number, which is the advertised budget
// and the enforced budget being two different numbers (PRD v1.62).
//
// A ceiling stop here is a REFUSAL that names money: never a throw, never a
// partial set presented as a graded one, and never a casualty (the transport was
// fine — the operator's own governance stopped the gate). Tighten-only: the gate
// may stop earlier than the ceiling and never runs past it.

test('the CEILING is read before every paid call — a spent one buys nothing at all', async () => {
  const j = honest();
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: j.loop, capStop: () => 'cap-halt' });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'cap-halt');
  assert.equal(j.calls.length, 0, 'the check is BEFORE the call, not after it');
  assert.equal(r.casualty, null, 'a ceiling is governance — never a casualty, and never a verdict on the set');
  assert.deepEqual(r.graded, [], 'nothing was graded, and nothing is reported as graded');
  assert.equal(r.injection.allResisted, false, 'an unrun battery resisted nothing');
  assert.ok(r.reds.some((x) => x.code === 'cap-halt' && x.path === 'budgetUsd'), JSON.stringify(r.reds));
  assert.match(r.reds[0].detail, /ceiling/);
});

test('a ceiling that trips MID-SET stops there, and the partial is never presented as complete', async () => {
  const j = honest();
  let left = 3;
  const r = await runCalibration({
    cases: CASES(), card: CARD(), judgeLoop: j.loop,
    capStop: () => (left-- > 0 ? null : 'cap-halt'),
  });
  assert.equal(r.ok, false, 'a gate that graded three of ten has not passed');
  assert.equal(r.stop, 'cap-halt');
  assert.equal(j.calls.length, 3, 'it stopped at the ceiling, never past it');
  assert.equal(r.graded.length, 3);
  assert.ok(r.graded.every((g) => g.ok), 'and the three it DID grade are reported honestly');
  assert.equal(r.failures.length, 0, 'a case nobody bought is not a failed case');
  assert.ok(r.costUsd > 0, 'what it did spend is still metered');
});

test('an UNPRICED prior call trips the ceiling as a pricing-red — unknown is never free (F6)', async () => {
  const j = honest();
  const r = await runCalibration({ cases: CASES(), card: CARD(), judgeLoop: j.loop, capStop: () => 'pricing-red' });
  assert.equal(r.stop, 'pricing-red');
  assert.equal(j.calls.length, 0);
  assert.ok(r.reds.some((x) => x.code === 'pricing-red' && x.path === 'budgetUsd'));
});

test('THE ONE OPERATOR NUMBER reaches the gate: a ceiling already spent refuses before a token', async (t) => {
  const p = makePatient(t);
  const j = honest();
  const r = await prepareSigning({
    spec: sgSpec(), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: j.loop,
    ceilingUsd: 0.25,
    // what the scout and the declaration loop already spent, folded in — a ceiling
    // that starts each seam's tally at zero is three ceilings wearing one number
    priorCalls: [{ label: 'author', costUsd: 0.25, unpricedRounds: 0 }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.specHash, null);
  assert.equal(j.calls.length, 0, 'the gate never bought a call against a spent ceiling');
  assert.equal(r.gates.calibration.stop, 'cap-halt');
  assert.match(r.refusal.detail, /ceiling/i);
  assert.equal(r.refusal.kind, 'decision-ready');
  assert.ok(r.refusal.options.some((o) => /raise/i.test(o)), JSON.stringify(r.refusal.options));
});

test('the ceiling BINDS the gate mid-flight, and a gate with room is unchanged', async (t) => {
  const p = makePatient(t);
  // each locate call is $0.0004 and $0.0009 of headroom is left, so three calls land
  // and the fourth never fires: the ceiling is read BETWEEN calls (`capStop`'s one
  // predicate, everywhere in this pipeline), so the last call it admits may carry the
  // tally past the number. That is the shipped semantics, asserted rather than
  // rounded — a test claiming an exact-to-the-cent cut would be testing a bound
  // nothing in this repository has.
  const j = honest();
  const bound = await prepareSigning({
    spec: sgSpec(), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: j.loop,
    ceilingUsd: 0.01, priorCalls: [{ label: 'author', costUsd: 0.0091, unpricedRounds: 0 }],
  });
  assert.equal(bound.ok, false);
  assert.equal(bound.gates.calibration.stop, 'cap-halt');
  assert.equal(j.calls.length, 3, 'the balance funded three calls, and the fourth never fired');

  // …and the SAME spec under a ceiling with room signs exactly as it did before
  const j2 = honest();
  const free = await prepareSigning({
    spec: sgSpec(), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: j2.loop,
    ceilingUsd: 5,
  });
  assert.equal(free.ok, true, JSON.stringify(free.reds ?? free.refusal));
  assert.equal(free.gates.calibration.ok, true);
  assert.equal(j2.calls.length, CALIBRATION_SIZE + INJECTION_LOCATE_BATTERY.length);
});

test('NO ceiling is unbounded here too — an absent number is a stated operator choice, never a default', async (t) => {
  const p = makePatient(t);
  const j = honest();
  const r = await prepareSigning({
    spec: sgSpec(), workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000, judgeLoop: j.loop,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(j.calls.length, CALIBRATION_SIZE + INJECTION_LOCATE_BATTERY.length);
});

// ── 8. THE COMPILE, WIRED INTO THE DRIVER ───────────────────────────────────

test('authorCloseForJob compiles Q6/Q7 into the close for a judged declaration', async (t) => {
  const p = makePatient(t);
  const declaration = { stages: sgClose({ cases: null }).stages, notes: [] };
  // the composer's own draft card is a DRAFT — the signed one replaces it
  declaration.stages.at(-1).params.card = { items: [{ rule: 'returns', text: 'the model made this up' }] };
  const proposal = { card: CARD(), cases: CASES() };
  /** @type {any[]} */
  const phases = [];
  const r = await authorCloseForJob({
    answers: {
      1: 'document the exported functions', 2: 'src/', 3: 'do not touch tests',
      4: 'I read the file', 5: 'if the docs are wrong',
      6: 'every exported function has a doc block and every parameter is described',
      7: 'I would pass a documented function and fail an undocumented one.',
    },
    verdictType: 'soft-green',
    repoPath: p.dir,
    lang: 'js',
    generate: async () => ({ text: '', metrics: { costUsd: 0.01, unpricedRounds: 0 } }),
    seedRef: p.seed,
    scout: { state: 'ok', facts: {} },
    listing: { files: ['src/mod.js', 'check.mjs'], block: '', stop: null },
    onPhase: (/** @type {string} */ n, /** @type {any} */ d) => phases.push([n, d]),
    authorFn: async () => ({ ok: true, declaration, reds: [], stop: null, cost: { calls: [{ label: 'author', costUsd: 0.02, unpricedRounds: 0 }] }, genreEnv: { applied: {} } }),
    proposeFn: async (/** @type {any} */ o) => {
      // the compile is asked with the person's OWN answers, verbatim
      assert.equal(o.answers[6], 'every exported function has a doc block and every parameter is described');
      o.book.absorb([{ label: 'judged-compile', costUsd: 0.03, unpricedRounds: 0 }]);
      return { ok: true, proposal, reds: [], stop: null, attempts: 1 };
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual(r.closeDecl.calibration.cases.map((/** @type {any} */ c) => c.id), CASES().map((c) => c.id));
  assert.deepEqual(r.closeDecl.stages.at(-1).params.card, CARD(), 'the SIGNED card replaces the composer\'s draft');
  assert.equal(r.judged.source, 'proposal', 'nobody fixed it, and that is recorded rather than implied');
  assert.ok(phases.some(([n]) => n === 'rubric') && phases.some(([n]) => n === 'rubric-done'));
  // ONE CEILING: the declaration loop's spend is folded in, never re-reported
  assert.equal(r.cost.costUsd, 0.05);
});

test('the SIGNER\'s fix is what is stored, and a fix that breaks the ruling is refused', async (t) => {
  const p = makePatient(t);
  const declaration = { stages: sgClose({ cases: null }).stages, notes: [] };
  const proposal = { card: CARD(), cases: CASES() };
  const fixed = { card: CARD(), cases: CASES() };
  fixed.card.items[0].text = 'what the person actually meant';
  const base = {
    answers: { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g' },
    verdictType: 'soft-green', repoPath: p.dir, lang: 'js', seedRef: p.seed,
    generate: async () => ({ text: '' }),
    scout: { state: 'ok', facts: {} },
    listing: { files: ['src/mod.js'], block: '', stop: null },
    authorFn: async () => ({ ok: true, declaration, reds: [], stop: null, cost: { calls: [] }, genreEnv: { applied: {} } }),
    proposeFn: async () => ({ ok: true, proposal, reds: [], stop: null, attempts: 1 }),
  };
  const ok = await authorCloseForJob({ ...base, signerFix: async () => fixed });
  assert.equal(ok.ok, true, JSON.stringify(ok.reds));
  assert.equal(ok.closeDecl.stages.at(-1).params.card.items[0].text, 'what the person actually meant');
  assert.equal(ok.judged.source, 'signer');

  // a signer can fix a legal proposal into an illegal one, and the gate runs over
  // WHAT WILL BE STORED
  const bad = await authorCloseForJob({ ...base, signerFix: () => ({ card: CARD(), cases: CASES().slice(0, 9) }) });
  assert.equal(bad.ok, false);
  assert.equal(bad.stop, 'rubric-invalid');
  assert.ok(bad.reds.some((/** @type {any} */ x) => x.code === 'calibration-size'));
});

// ── 9. THE SCRUB ANNOUNCES ──────────────────────────────────────────────────

test('the ingest scrub ANNOUNCES what it altered — a signer signs the STORED bytes', () => {
  const KEY = `sk-ant-api03-${'C'.repeat(95)}`;
  const proposal = { card: CARD(), cases: CASES() };
  proposal.card.items[0].text = `the key ${KEY} is in my notes`;
  proposal.cases[0].artifact = `${ARTIFACT_PASS}// ${KEY}\n`;
  const r = signJudgedArtifacts({ proposal });
  assert.ok(!JSON.stringify({ card: r.card, cases: r.cases }).includes(KEY), 'masked');
  assert.deepEqual(r.scrubbed.map((s) => s.path), ['card.items[0].text', 'cases[0].artifact']);
  // the announcement carries the PATH only — echoing the match would be the same
  // leak, one hop on
  assert.ok(!JSON.stringify(r.scrubbed).includes(KEY));
  // …and an honest artifact announces nothing
  assert.deepEqual(signJudgedArtifacts({ proposal: { card: CARD(), cases: CASES() } }).scrubbed, []);
});
