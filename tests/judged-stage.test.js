// THE JUDGED STAGE (softgreen module 2) — M1's core wired into the close.
//
// Module 1 proved LOCATE and DECIDE in isolation. What is under test HERE is the
// wiring, and it is four separate promises, none of which module 1 could make:
//
//   - THE VERDICT COMES FROM `decide()`, NEVER FROM THE JUDGE. A green and a red
//     are both content readings over facts with addresses, and the red is
//     ITEMIZED — named card items, named functions, the instrument's own quotes
//     (ruling 7, F38/F39: a wall with a number converts, a paragraph does not).
//   - A BROKEN JUDGE IS A CASUALTY, NEVER EVIDENCE. An unparseable emission, a
//     dead call, an artifact that will not open and a card this arbiter cannot
//     read are all INSTRUMENT STOPS — contract (a) names "unreadable or
//     unparseable required output" in so many words. Grading a tree red because
//     our own judge produced garbage is manufactured evidence (F45).
//   - THE MONEY IS VISIBLE. A close has cost $0 until this kind. Every locate
//     call reports its own honest cost out through the ctx meter, on every route
//     including the red ones, and an UNPRICED call is a stop that is never
//     retried (F6/F12).
//   - THE LADDER IS BOUNDED AND THE SEED READ IS SKIPPED. One retry, then stop;
//     and ruling 8's exemption renders a `skipped` ROW rather than an absence.
//
// The artifacts are the POC's two REAL files and the facts fixtures are the ones
// tests/judged.test.js reconstructed against them (lifted deliberately: two
// copies of one fixture is cheaper than a shared fixture module nobody reads, and
// the quote-verification below reads them against the real artifact text either
// way). NO test in this file makes a paid call: every model seam is injected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runStage, seedRead, LIVE_KINDS, SEED_EXEMPT_KINDS, JUDGE_ATTEMPTS, MAX_JUDGED_PATHS,
  EXIT_GREEN, EXIT_RED, EXIT_STOP, STOP_FAULTS,
} from '../src/kinds.js';
import { JUDGE_MODEL, LOCATE_LABEL } from '../src/judged.js';
import { runDeclaredStages, declaredStages, DECLARED_GAP_PREFIX } from '../src/declaredclose.js';
import { KIND_CATALOGUE, CATALOGUE_LIVE_KINDS, LOCKED_KINDS, NEVER_OFFERED_KINDS } from '../src/authoring.js';
import { ACCOUNTED_ROUND_TYPES } from '../src/run.js';
import { readResume } from '../src/reuse.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POC = join(HERE, '..', 'poc', 'softgreen-judge');
const passArtifact = readFileSync(join(POC, 'artifact-pass.txt'), 'utf8');
const redArtifact = readFileSync(join(POC, 'artifact-red.txt'), 'utf8');

const CARD = {
  items: [
    { rule: 'has-doc', text: 'Every top-level function has a JSDoc block directly above it.' },
    { rule: 'params', text: 'Every parameter of every top-level function is named in an @param tag.' },
    { rule: 'returns', text: 'Every top-level function that returns a value documents it with @returns.' },
  ],
};

/** src/spine.js: ONE top-level function, fully documented */
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
  ],
};

const base = mkdtempSync(join(tmpdir(), 'judged-stage-'));
let n = 0;
/** a workdir carrying the two REAL artifacts under real paths */
function patient() {
  const wd = join(base, `p${n += 1}`);
  mkdirSync(join(wd, 'src'), { recursive: true });
  mkdirSync(join(wd, 'scripts'), { recursive: true });
  writeFileSync(join(wd, 'src', 'spine.js'), passArtifact);
  writeFileSync(join(wd, 'scripts', 'grade.mjs'), redArtifact);
  return wd;
}

const stage = (params, name = 'reads-well') => ({ name, kind: 'judged-floor', params });
const CTX = (wd, over = {}) => ({ workdir: wd, seedRef: 'HEAD', gapKeep: 'close: ', ...over });

/** a metered fake judge: every `run` returns the NEXT scripted reply, and the
 * calls are recorded so a ladder can be counted rather than assumed */
function fakeJudge(replies) {
  const calls = [];
  const loop = (o) => ({
    run: async (msgs, tools, opts) => {
      calls.push({ system: o.system, msgs, tools, opts });
      return replies[Math.min(calls.length - 1, replies.length - 1)];
    },
  });
  return { loop, calls };
}
const reply = (text, costUsd = 0.0004) => ({ text, stopReason: 'end_turn', error: null, metrics: { costUsd, unpricedRounds: 0 } });
const facts = (f) => reply(JSON.stringify(f));

/** the meter's own record of what a stage spent */
function meter() {
  const rows = [];
  return { rows, sink: (c) => rows.push(c) };
}

// ── the two verdicts ─────────────────────────────────────────────────────────

test('judged-floor: facts that satisfy every card item are a GREEN the ARBITER rendered', async () => {
  const wd = patient();
  const j = fakeJudge([facts(PASS_FACTS)]);
  const m = meter();
  const r = await runStage(stage({ card: CARD, paths: ['src/spine.js'] }), CTX(wd, { judgeLoop: j.loop, onJudgeCost: m.sink }));

  assert.equal(r.verdict, 'green');
  assert.equal(r.exitCode, EXIT_GREEN);
  assert.equal(r.judged, true, 'a judged stage renders a real judgment');
  assert.deepEqual(r.gapLines, [], 'a green says nothing');
  assert.equal(r.detail.model, JUDGE_MODEL, 'the tier is PINNED and stated on the record');
  assert.deepEqual(r.detail.card, ['has-doc', 'params', 'returns']);
  assert.equal(r.detail.perPath.length, 1);
  assert.equal(r.detail.perPath[0].verdict, 'pass');
  // the judge was asked for FACTS, over the real artifact, and never for a verdict
  assert.equal(j.calls.length, 1);
  assert.deepEqual(j.calls[0].tools, [], 'the judge is TOOLLESS');
  assert.ok(j.calls[0].msgs[0].content.includes('export function makeSpine'), 'it judged the AUTHORITATIVE artifact');
  assert.ok(!/did .* pass|verdict/i.test(j.calls[0].system), 'the locate prompt never asks for a judgement');
});

test('judged-floor: a card item the facts do not satisfy is a RED, itemized down to the function and the quote', async () => {
  const wd = patient();
  const j = fakeJudge([facts(RED_FACTS)]);
  const r = await runStage(stage({ card: CARD, paths: ['scripts/grade.mjs'] }), CTX(wd, { judgeLoop: j.loop }));

  assert.equal(r.verdict, 'red');
  assert.equal(r.exitCode, EXIT_RED);
  assert.equal(r.judged, true, 'a red IS a judgment — never a casualty');
  const gap = r.gapLines.join('\n');
  // the mechanical genre: named items and counts, never one paragraph
  assert.match(gap, /the judged floor is not met/);
  assert.match(gap, /first red: has-doc/, 'first-red-wins in the CARD\'s signed order');
  assert.match(gap, /\[has-doc\] Every top-level function has a JSDoc block/, 'the signer\'s own words explain the red');
  assert.match(gap, /scripts\/grade\.mjs: namesHit — no JSDoc block above the declaration/);
  assert.match(gap, /scripts\/grade\.mjs: features — no JSDoc block/);
  assert.match(gap, /> function features\(p\) \{/, 'the quote the INSTRUMENT itself reported');
  for (const line of r.gapLines) assert.ok(line.startsWith('close: '), `every gap line carries the keep: ${line}`);
  assert.equal(r.detail.redFiles, 1);
  assert.ok(r.detail.redItems >= 2, 'every item is graded, not just the first');

  // …AND NOT ONE WORD MORE. The `unsure` line is the fail-safe's own voice — a red
  // with nothing itemized under it — and it is pushed only when `decide()` named no
  // card item at all. On an ITEMIZED red it must be silent: an unsure line beside
  // named items would tell a worker the judge could not read the file it just quoted.
  assert.deepEqual(r.detail.unsure, [], 'an itemized red is not an unsure one');
  const bodies = r.gapLines.map((l) => l.replace(/^close: /, ''));
  const twoSpace = bodies.filter((l) => /^ {2}\S/.test(l));
  assert.ok(twoSpace.length > 0, 'the itemized card lines are there to be distinguished from');
  assert.ok(twoSpace.every((l) => l.startsWith('  [')),
    `only card items sit at that indent — an unsure line appeared: ${twoSpace.join(' | ')}`);
});

test('judged-floor: FIRST-RED-WINS is the CARD\'s order, ACROSS artifacts — never the file loop\'s', async () => {
  // The two orders diverge only in this shape, and nothing exercised it: artifact 1
  // reds a LATE card item and artifact 2 reds an EARLY one, so the file loop's first
  // red and the card's first red are different rules. Reading the file loop's answer
  // would make `firstRed` depend on the order the DECLARATION happened to list paths
  // in — the arbiter's stable order is the card's, and it is signed.
  const wd = patient();
  writeFileSync(join(wd, 'src', 'late.js'), '/**\n * alpha does a thing.\n */\nexport function alpha() {\n  return 1;\n}\n');
  writeFileSync(join(wd, 'src', 'early.js'), 'export function beta() {\n}\n');

  /** documented and parameterless, but returns a value with no @returns → `returns` only */
  const LATE_FACTS = {
    functions: [{
      name: 'alpha',
      declarationQuote: 'export function alpha() {',
      docQuote: '/**',
      paramNames: [],
      paramIsPattern: [],
      paramTagNames: [],
      returnsTagQuote: null,
      returnsValueQuote: 'return 1;',
    }],
  };
  /** undocumented, parameterless, returns nothing → `has-doc` only */
  const EARLY_FACTS = {
    functions: [{
      name: 'beta',
      declarationQuote: 'export function beta() {',
      docQuote: null,
      paramNames: [],
      paramIsPattern: [],
      paramTagNames: [],
      returnsTagQuote: null,
      returnsValueQuote: null,
    }],
  };

  const j = fakeJudge([facts(LATE_FACTS), facts(EARLY_FACTS)]);
  const r = await runStage(
    stage({ card: CARD, paths: ['src/late.js', 'src/early.js'] }),
    CTX(wd, { judgeLoop: j.loop }),
  );

  assert.equal(r.verdict, 'red');
  assert.equal(r.detail.redFiles, 2);
  // the divergence is REAL, asserted rather than assumed: the first artifact
  // processed reds a rule the card declares LAST
  assert.equal(r.detail.perPath[0].firstRed, 'returns', 'the file loop\'s first red is the LATE card item');
  assert.equal(r.detail.perPath[1].firstRed, 'has-doc');
  // …and the stage still reports the CARD's first red
  assert.match(r.gapLines.join('\n'), /first red: has-doc/,
    'the card\'s signed order decides — reading redItems[0] would answer "returns"');
});

test('judged-floor: an UNSURE reading is a red, not a pass — the fail-safe survives the wiring', async () => {
  const wd = patient();
  // a well-formed emission that found nothing: decide() calls that unsure, and
  // unsure is red (contract (a)). The stage must not read "no findings" as clean.
  const j = fakeJudge([facts({ functions: [] })]);
  const r = await runStage(stage({ card: CARD, paths: ['src/spine.js'] }), CTX(wd, { judgeLoop: j.loop }));
  assert.equal(r.verdict, 'red');
  assert.equal(r.detail.perPath[0].firstRed, null, 'an unsure reading names no item — it names the absence');
  assert.equal(r.detail.redItems, 0, 'and NOTHING is itemized, which is exactly the shape that must not read green');
  assert.match(r.gapLines.join('\n'), /src\/spine\.js: locate found nothing in the artifact — unsure, and unsure is red/,
    'the reason still reaches the gap: a red with no itemized detail is a red that says why');
});

// ── the ladder: one retry, then a CASUALTY ───────────────────────────────────

test('judged-floor: a malformed emission is RETRIED once, and a good second answer stands', async () => {
  const wd = patient();
  const j = fakeJudge([reply('{"functions":[{"name":'), facts(PASS_FACTS)]);
  const m = meter();
  const r = await runStage(stage({ card: CARD, paths: ['src/spine.js'] }), CTX(wd, { judgeLoop: j.loop, onJudgeCost: m.sink }));

  assert.equal(r.verdict, 'green');
  assert.equal(j.calls.length, 2, 'exactly one retry');
  assert.deepEqual(r.detail.perPath[0].attempts.map((a) => a.ok), [false, true]);
  assert.equal(m.rows.length, 2, 'BOTH calls are metered — the wasted one is real money');
});

test('judged-floor: a second malformed emission STOPS the close — a broken judge is never evidence about the tree', async () => {
  const wd = patient();
  const j = fakeJudge([reply('not json at all'), reply('still not json')]);
  const r = await runStage(stage({ card: CARD, paths: ['src/spine.js'] }), CTX(wd, { judgeLoop: j.loop }));

  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.exitCode, EXIT_STOP);
  assert.equal(r.judged, false, 'the judged marker is WITHHELD');
  assert.equal(r.detail.fault, STOP_FAULTS.CRASHED);
  assert.equal(r.detail.axis, 'artifact-red');
  assert.equal(j.calls.length, JUDGE_ATTEMPTS, 'the ladder is BOUNDED — never a model re-asked forever');
  assert.match(r.gapLines.join('\n'), /returned no usable facts .* after 2 attempt\(s\)/);
});

test('judged-floor: a transport failure is a casualty too — retried once, then stopped', async () => {
  const wd = patient();
  const calls = [];
  const loop = () => ({ run: async () => { calls.push(1); throw new Error('ENETUNREACH'); } });
  const r = await runStage(stage({ card: CARD, paths: ['src/spine.js'] }), CTX(wd, { judgeLoop: loop }));
  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.detail.axis, 'provider-red');
  assert.equal(calls.length, JUDGE_ATTEMPTS);
});

test('judged-floor: an UNPRICED call stops and is NEVER retried — a retry only buys more spend nobody can see', async () => {
  const wd = patient();
  const j = fakeJudge([{ text: JSON.stringify(PASS_FACTS), stopReason: 'end_turn', error: null, metrics: { costUsd: null, unpricedRounds: 1 } }]);
  const m = meter();
  const r = await runStage(stage({ card: CARD, paths: ['src/spine.js'] }), CTX(wd, { judgeLoop: j.loop, onJudgeCost: m.sink }));

  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.detail.axis, 'pricing-red');
  assert.equal(j.calls.length, 1, 'pricing-red outranks the ladder');
  assert.deepEqual(m.rows.map((x) => x.costUsd), [null], 'the honest null reaches the meter — never `?? 0`');
});

// ── the money ────────────────────────────────────────────────────────────────

test('judged-floor: every locate call reports its own cost, per artifact, through the ctx meter', async () => {
  const wd = patient();
  const j = fakeJudge([facts(PASS_FACTS), facts(RED_FACTS)]);
  const m = meter();
  const r = await runStage(
    stage({ card: CARD, paths: ['src/spine.js', 'scripts/grade.mjs'] }),
    CTX(wd, { judgeLoop: j.loop, onJudgeCost: m.sink }),
  );

  assert.equal(r.verdict, 'red', 'one clean artifact does not absolve the other');
  assert.equal(m.rows.length, 2, 'ONE meter record per paid call — the close is metered per call, like a worker round');
  // derived from the injected values, never a hardcoded figure
  const injected = 0.0004 + 0.0004;
  assert.equal(m.rows.reduce((a, x) => a + x.costUsd, 0), injected);
  assert.deepEqual(m.rows.map((x) => x.path), ['src/spine.js', 'scripts/grade.mjs']);
  for (const row of m.rows) {
    assert.equal(row.stage, 'reads-well');
    assert.equal(row.kind, 'judged-floor');
    assert.equal(row.label, LOCATE_LABEL);
    assert.equal(row.model, JUDGE_MODEL);
    assert.equal(row.attempt, 1);
  }
});

test('the ONE ledger accounts the close\'s own rounds, and the resume fold reads the SAME list', async () => {
  assert.ok(ACCOUNTED_ROUND_TYPES.includes('worker-round'));
  assert.ok(ACCOUNTED_ROUND_TYPES.includes('judge-round'), 'a close that spends is a close the wallet sees');

  // the fold that stops a resume silently widening a signed budget: a killed leg's
  // judge spend must come back in `spentUsd`, or the restart runs on a ceiling that
  // grew by exactly the close's own cost
  const events = [
    { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 5 },
    { type: 'worker-round', costUsd: 0.25 },
    { type: 'judge-round', stage: 'reads-well', path: 'src/spine.js', attempt: 1, costUsd: 0.125 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 0.375, spendComplete: true },
  ];
  const r = readResume(events, { mode: 'direct' });
  assert.equal(r.spentUsd, 0.375, 'worker rounds AND judge rounds');
});

// ── the refusals that are BROKEN CLOSE, not red ──────────────────────────────

test('judged-floor: a card naming a rule this arbiter does not implement is a broken close', async () => {
  const wd = patient();
  const j = fakeJudge([facts(PASS_FACTS)]);
  const r = await runStage(
    stage({ card: { items: [{ rule: 'vibes', text: 'it should read nicely' }] }, paths: ['src/spine.js'] }),
    CTX(wd, { judgeLoop: j.loop }),
  );
  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.detail.fault, STOP_FAULTS.CRASHED);
  assert.match(r.gapLines.join('\n'), /`vibes` is not a rule this arbiter implements — the rules are/);
  assert.equal(j.calls.length, 0, 'refused BEFORE any token');
});

test('judged-floor: no judge seam wired is a WIRING GAP — never a silent fall-back to another model', async () => {
  const wd = patient();
  const r = await runStage(stage({ card: CARD, paths: ['src/spine.js'] }), CTX(wd));
  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.detail.fault, STOP_FAULTS.FAILED);
  assert.match(r.gapLines.join('\n'), new RegExp(`wired no judge seam[\\s\\S]*${JUDGE_MODEL}`));
});

test('judged-floor: an artifact that will not open, is empty, or runs past the ceiling all STOP', async () => {
  const wd = patient();
  writeFileSync(join(wd, 'src', 'blank.js'), '   \n');
  const j = fakeJudge([facts(PASS_FACTS)]);
  const ctx = CTX(wd, { judgeLoop: j.loop });

  const missing = await runStage(stage({ card: CARD, paths: ['src/nope.js'] }), ctx);
  assert.equal(missing.verdict, 'instrument-stop');
  assert.match(missing.gapLines.join('\n'), /could not read the artifact it judges \(src\/nope\.js\)/);

  const blank = await runStage(stage({ card: CARD, paths: ['src/blank.js'] }), ctx);
  assert.equal(blank.verdict, 'instrument-stop');
  assert.match(blank.gapLines.join('\n'), /is empty/);

  const many = await runStage(stage({ card: CARD, paths: Array.from({ length: MAX_JUDGED_PATHS + 1 }, () => 'src/spine.js') }), ctx);
  assert.equal(many.verdict, 'instrument-stop');
  assert.match(many.gapLines.join('\n'), /over the ceiling of/);

  const none = await runStage(stage({ card: CARD, paths: [] }), ctx);
  assert.equal(none.verdict, 'instrument-stop');
  assert.match(none.gapLines.join('\n'), /names no artifact to judge/);

  assert.equal(j.calls.length, 0, 'not one of those bought a call');
});

// ── ruling 8: the seed read SKIPS it, and says so ────────────────────────────

test('ruling 8: a judged stage is EXEMPT from the seed-verdict read, as a ROW and never an absence', async () => {
  assert.ok(SEED_EXEMPT_KINDS.includes('judged-floor'));
  const wd = patient();
  const j = fakeJudge([facts(PASS_FACTS)]);
  const rows = await seedRead(
    { stages: [stage({ card: CARD, paths: ['src/spine.js'] })] },
    CTX(wd, { judgeLoop: j.loop }),
  );
  assert.equal(rows.length, 1, 'one row per declared stage (F59: absent is not empty)');
  assert.equal(rows[0].verdict, 'skipped');
  assert.equal(rows[0].judged, false);
  assert.equal(rows[0].exitCode, null, 'nothing ran, so there is no exit code to invent');
  assert.equal(rows[0].detail.skipped, true);
  assert.equal(j.calls.length, 0, 'the seed read never buys a judge call — its bar comes from calibration');
});

// ── the arbiter bridge: the seam a runner actually uses ──────────────────────

test('the bridge carries the judge seam and the meter into the stage, and translates both verdicts', async () => {
  const wd = patient();
  const green = fakeJudge([facts(PASS_FACTS)]);
  const m = meter();
  const stages = declaredStages({ stages: [stage({ card: CARD, paths: ['src/spine.js'] })] });
  assert.equal(stages[0].offer, false, 'ruling 5: a judged stage is never an in-run check');
  assert.equal(stages[0].gapKeep, `^${DECLARED_GAP_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

  const ok = await runDeclaredStages(stages, (s) => s, {
    cwd: wd, seedRef: 'HEAD', judgeLoop: green.loop, onJudgeCost: m.sink,
  });
  assert.equal(ok.verdict, 'satisfied');
  assert.equal(m.rows.length, 1, 'the meter reached the stage through the bridge');

  const j = fakeJudge([facts(RED_FACTS)]);
  const red = await runDeclaredStages(
    declaredStages({ stages: [stage({ card: CARD, paths: ['scripts/grade.mjs'] })] }),
    (s) => s.replace(/namesHit/g, '[scrubbed]'),
    { cwd: wd, seedRef: 'HEAD', judgeLoop: j.loop },
  );
  assert.equal(red.verdict, 'needs_revision');
  assert.match(red.gap, /close stage "reads-well" failed:/, 'the ONE gap header the trend reader parses');
  assert.match(red.gap, /\[scrubbed\]/, 'the caller redacts at the emission boundary');

  const unwired = await runDeclaredStages(stages, (s) => s, { cwd: wd, seedRef: 'HEAD' });
  assert.equal(unwired.verdict, STOP_FAULTS.FAILED, 'a wiring gap routes as a FAULT, never as a red');
});

// ── the catalogue and the executor move together ─────────────────────────────

test('catalogue: judged-floor is LIVE in both halves, and still never offered', () => {
  assert.ok(LIVE_KINDS.includes('judged-floor'), 'the executor runs it');
  assert.ok(CATALOGUE_LIVE_KINDS.includes('judged-floor'), 'the catalogue offers it');
  assert.deepEqual([...CATALOGUE_LIVE_KINDS].sort(), [...LIVE_KINDS].sort(), 'both directions, in ONE commit');
  assert.equal(KIND_CATALOGUE['judged-floor'].locked, undefined);
  assert.deepEqual([...LOCKED_KINDS], [], 'nothing in the v1 catalogue is locked any more');
  assert.ok(NEVER_OFFERED_KINDS.includes('judged-floor'),
    'ruling 5 is a LAW and outlives the unlock: a paid judge is never an in-run ruler');
  // the class it can honestly render is unchanged, and it is what class-gates a
  // declaration until the soft-green class itself is admitted
  assert.equal(KIND_CATALOGUE['judged-floor'].verdictClass, 'soft-green');
  assert.deepEqual([...KIND_CATALOGUE['judged-floor'].required], ['card', 'paths']);
  assert.deepEqual([...KIND_CATALOGUE['judged-floor'].pathParams], ['paths']);
});
