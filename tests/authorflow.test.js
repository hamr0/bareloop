// THE WRITING HALF (M3b, close-authoring gate 4) — schema-forced authoring and
// the grounded revise loop.
//
// The load-bearing claims, each one paid for by a gate-2 round or a standing
// finding, and each one tested against the thing that can actually break it:
//
//   - STRUCTURE IS ENFORCED, NOT PARSED. The declaration arrives as the
//     arguments of a schema-forced tool call. The schema is DERIVED from M2's
//     catalogue, so a locked kind has no branch at all — declaring one is
//     INEXPRESSIBLE in tool mode rather than rejected afterwards. The named
//     consequence is tested too: locked-kind DEMAND can then only be counted on
//     the text fallback (or by the interview layer), and that path still reds.
//   - THE REVISE TURN IS BYTE-STABLE. It is exactly the measured block plus one
//     frozen instruction, and `assertReviseTurn` is what makes "nothing else can
//     enter the turn" a fact rather than a promise. The instruction's bytes are
//     asserted literally: an edit reds this test and forces a decision.
//   - MEASURED, NEVER REVIEWED. The feedback is execution output — a validation
//     red, an instrument stop, a value against a baseline. No model ever grades
//     another model's close (D9), and a number the instrument never reported is
//     rendered `unknown`, never 0 (F6).
//   - THE GENRE OWNS ITS ENVIRONMENT. MYPYPATH is the Result-5 fact no user can
//     supply and no model found; it is injected mechanically, and a model-authored
//     copy is dropped AND announced (fail-safe, never silent).
//
// The model boundary is injected, so the loop's branches are all reachable from
// scripted transports — but the DEFAULT seed-read wiring is exercised against a
// REAL temp git repo with real child processes, because a flow whose only proof
// is a fixture has never met its instrument.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AGGREGATES, SIGNS, MAX_TERMS, EXIT_GREEN, EXIT_RED, EXIT_STOP } from '../src/kinds.js';
import {
  KIND_CATALOGUE, CATALOGUE_LIVE_KINDS, LOCKED_KINDS, MAX_STAGES, VERDICT_CLASSES, LOCKED_CLASSES,
  DIRECTIONS, BASELINES, classGuards, genreOwnedEnvNames, genreInstruments, validateDeclaration,
} from '../src/authoring.js';
import {
  DECLARATION_TOOL_NAME, DECLARATION_ACK, AUTHOR_MAX_TOKENS,
  MAX_REVISIONS, MAX_STRUCTURE_RETRIES, REVISE_GAP_CAP, REVISE_RED_CAP,
  REVISE_INSTRUCTION, STRUCTURE_INSTRUCTION_TOOL,
  QUESTION_SETS, GREEN_QUESTIONS, questionsFor, requiredAnswersFor, CLASS_STATEMENTS,
  PARAM_SCHEMAS, schemaCoverage, declarationSchema, declarationTool,
  catalogueBlock, lawsBlock, instrumentsBlock, authorPrompt,
  renderSeedReadBlock, renderRejectBlock, buildReviseTurn, assertReviseTurn,
  applyGenreEnv, resolveSourcePrefixes, makeCostBook, makeLoopGenerate, authorClose,
} from '../src/authorflow.js';
import { SCOUT_ATTEMPTS } from '../src/authorscout.js';
import { scrubRaw } from '../src/text.js';
import { scanSecrets } from '../src/validate.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

/** every fixture here is a GREEN job — the battery keys off the class it picked */
const greenGuards = (lang) => classGuards({ verdictType: 'green', lang });

const LISTING = Object.freeze([
  'package.json', 'README.md',
  'src/backup.js', 'src/email.js', 'src/index.js',
  'test/backup.test.js', 'test/email.test.js',
]);
const TARGETS = ['src/email.js', 'src/backup.js'];

const FACTS = Object.freeze({
  language: 'javascript', runner: 'node --test',
  sourcePaths: ['src'], testPaths: ['test'],
});
const SCOUT_OK = Object.freeze({ state: 'PRESENT', facts: FACTS, reason: null, calls: [] });

/** the two injected JS guards with their one model-filled slot filled */
function guardStages(lang = 'js', allowPrefixes = TARGETS) {
  return greenGuards(lang).map((g) => ({
    name: g.name,
    kind: g.kind,
    params: g.fill.includes('allowPrefixes') ? { ...g.params, allowPrefixes } : { ...g.params },
  }));
}

/** a declaration that PASSES M2's validator against the listing it is judged with */
function goodDeclaration(lang = 'js', targets = TARGETS) {
  const [changed, suppressions] = guardStages(lang, targets);
  return {
    stages: [
      changed,
      {
        name: 'typecheck',
        kind: 'count-not-worse',
        params: {
          cmd: 'npx', args: ['tsc', '--noEmit', '--strict'],
          parser: { lineMatch: 'Found (\\d+) errors?' },
          scope: { includePrefixes: targets },
          direction: 'lower-is-better', baseline: 0,
        },
      },
      suppressions,
    ],
    notes: [],
  };
}

/**
 * A scripted model boundary. Each entry either DELIVERS a declaration through
 * the tool (`declaration` / `declarations`) or delivers only text.
 * @param {{declaration?: any, declarations?: any[], text?: string, costUsd?: number|null, error?: string|null}[]} script
 */
function scriptGenerate(script) {
  /** @type {any[]} */
  const calls = [];
  const generate = async (/** @type {any} */ messages, /** @type {any} */ tools, /** @type {any} */ opts) => {
    const spec = script[Math.min(calls.length, script.length - 1)] ?? {};
    calls.push({ messages, tools, opts });
    const tool = tools.find((/** @type {any} */ t) => t.name === DECLARATION_TOOL_NAME);
    const delivered = spec.declarations ?? (spec.declaration ? [spec.declaration] : []);
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

/** a scripted seed read: one row per declared stage, verdict from the map */
function scriptSeedRead(byStage = {}) {
  /** @type {any[]} */
  const seen = [];
  const fn = async (/** @type {any} */ declaration) => {
    seen.push(declaration);
    return declaration.stages.map((/** @type {any} */ s) => ({
      verdict: byStage[s.name]?.verdict ?? 'red',
      exitCode: byStage[s.name]?.exitCode ?? EXIT_RED,
      value: byStage[s.name]?.value ?? null,
      baseline: byStage[s.name]?.baseline ?? null,
      baselineSource: byStage[s.name]?.baselineSource ?? null,
      gapLines: byStage[s.name]?.gapLines ?? [],
      judged: byStage[s.name]?.judged ?? true,
      stage: s.name, kind: s.kind,
      detail: byStage[s.name]?.detail ?? {},
    }));
  };
  return { fn, seen };
}

const baseArgs = () => ({
  workdir: '/patient', seedRef: 'seedsha', lang: /** @type {'js'} */ ('js'), verdictType: 'green',
  answers: { 1: 'stop the type checker complaining', 2: 'src/email.js and src/backup.js' },
  scout: SCOUT_OK,
  listing: { files: [...LISTING], block: 'FILES THAT ACTUALLY EXIST AT THE SEED\n  src/email.js', meta: { tier: 'full', totalSeedFiles: LISTING.length, entries: [] }, stop: null },
  closeCtx: { gapKeep: 'TEST:: ' },
});

// ── 0. the question sets are keyed by VERDICT CLASS (PRD v1.57 §2) ──────────
//
// Genres are a fat tail that cannot be enumerated; classes are exactly three.
// The green set is fully built; the other two are NAMED LOCKED SETS whose
// selection refuses at admission before their questions ever run.

test('question sets: exactly three, keyed by class, and only the green one is built', () => {
  assert.deepEqual(Object.keys(QUESTION_SETS).sort(), [...VERDICT_CLASSES].sort());
  assert.equal(QUESTION_SETS.green.locked, false);
  assert.deepEqual(QUESTION_SETS.green.questions, GREEN_QUESTIONS);
  for (const c of LOCKED_CLASSES) {
    assert.equal(QUESTION_SETS[c].locked, true, `${c} is a named but LOCKED set`);
    assert.equal(QUESTION_SETS[c].questions, null, `${c}'s questions are ABSENT (null), never an empty set`);
    assert.equal(QUESTION_SETS[c].required, null);
  }
});

test('question sets: the GREEN set asks nothing about a genre — the confirm slot is gone (D13 slot superseded)', () => {
  const numbers = Object.keys(GREEN_QUESTIONS).map(Number).sort((a, b) => a - b);
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6], 'the seventh slot was the genre confirm and it is deleted');
  assert.deepEqual(requiredAnswersFor('green'), numbers);
  const all = Object.values(GREEN_QUESTIONS).join(' ');
  assert.ok(!/type[- ]?fix|type checker|TYPES/i.test(all), `a genre-specific slot survives: ${all}`);
  for (const q of Object.values(GREEN_QUESTIONS)) assert.ok(q.trim().endsWith('?'), q);
});

test('question sets: a LOCKED class has no questions to run, and asking for them THROWS', () => {
  assert.deepEqual(questionsFor('green'), GREEN_QUESTIONS);
  for (const c of LOCKED_CLASSES) {
    assert.throws(() => questionsFor(c), new RegExp(c), 'admission refuses the class BEFORE its questions run');
    assert.throws(() => requiredAnswersFor(c), new RegExp(c));
  }
  assert.throws(() => questionsFor('chartreuse'), /chartreuse/);
});

test('the prompt STATES the declared class — this is where genre understanding now lives', () => {
  const p = authorPrompt({
    answers: baseArgs().answers, questions: GREEN_QUESTIONS, facts: FACTS,
    listingBlock: '', lang: 'js', guards: greenGuards('js'), ownedEnvNames: [], verdictType: 'green',
  });
  assert.ok(p.includes(CLASS_STATEMENTS.green), 'the composer is told what the user declared DONE to mean');
  assert.match(p, /green/);
  // and it is not a decoration the caller can leave off or get wrong
  const args = {
    answers: {}, questions: GREEN_QUESTIONS, facts: FACTS, listingBlock: '', lang: 'js',
    guards: greenGuards('js'), ownedEnvNames: [],
  };
  assert.throws(() => authorPrompt({ ...args }), /verdict class/i);
  for (const c of LOCKED_CLASSES) assert.throws(() => authorPrompt({ ...args, verdictType: c }), new RegExp(c));
});

test('authorClose: a LOCKED or unknown class refuses at $0, before any token', async () => {
  for (const verdictType of [...LOCKED_CLASSES, 'chartreuse']) {
    const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
    const r = await authorClose({ ...baseArgs(), verdictType, generate, seedReadFn: scriptSeedRead().fn });
    assert.equal(r.ok, false, verdictType);
    assert.equal(r.stop, 'precheck');
    assert.equal(r.reds[0].code, 'class-unsupported', JSON.stringify(r.reds));
    assert.equal(r.reds[0].verb, verdictType);
    assert.equal(calls.length, 0, 'a class with no battery must never author a close without the guards it cannot supply');
  }
});

// ── 1. the schema is DERIVED from the catalogue ─────────────────────────────

test('schemaCoverage: every live catalogue param has exactly one schema, and none is orphaned', () => {
  const c = schemaCoverage();
  assert.deepEqual(c.missing, [], 'a catalogue param with no schema would be silently undeclarable');
  assert.deepEqual(c.orphan, [], 'a schema for a param the catalogue does not have is a second catalogue');
  assert.equal(c.ok, true);
});

test('schemaCoverage catches a catalogue that outran the schema, and declarationSchema THROWS on it', () => {
  const widened = { ...KIND_CATALOGUE, 'files-changed': { ...KIND_CATALOGUE['files-changed'], required: ['allowPrefixes', 'requireNonEmpty', 'brandNewParam'] } };
  const c = schemaCoverage(/** @type {any} */ (widened));
  assert.equal(c.ok, false);
  assert.ok(c.missing.includes('files-changed.brandNewParam'));
  assert.throws(() => declarationSchema(/** @type {any} */ (widened)), /brandNewParam/);
});

test('declarationSchema: one branch per LIVE kind, required derived from the catalogue', () => {
  const schema = declarationSchema();
  const branches = schema.properties.stages.items.oneOf;
  assert.deepEqual(branches.map((/** @type {any} */ b) => b.properties.kind.const), [...CATALOGUE_LIVE_KINDS]);
  for (const b of branches) {
    const kind = b.properties.kind.const;
    const spec = KIND_CATALOGUE[kind];
    assert.deepEqual(b.properties.params.required, [...spec.required], `${kind}: required is the catalogue's own`);
    assert.deepEqual(
      Object.keys(b.properties.params.properties).sort(),
      [...spec.required, ...spec.optional].sort(),
      `${kind}: the schema offers exactly the catalogue's parameter names`,
    );
    assert.equal(b.properties.params.additionalProperties, false, 'a parameter name outside the catalogue is inexpressible');
  }
  assert.equal(schema.properties.stages.maxItems, MAX_STAGES);
  assert.equal(schema.additionalProperties, false);
});

test('declarationSchema: a LOCKED kind is INEXPRESSIBLE — no branch, no mention', () => {
  const schema = declarationSchema();
  const text = JSON.stringify(schema);
  assert.ok(LOCKED_KINDS.length > 0, 'the catalogue must still carry locked entries');
  for (const k of LOCKED_KINDS) assert.ok(!text.includes(k), `${k} must not appear anywhere in the tool schema`);
});

test('declarationSchema: a note is a NON-EMPTY string — an empty one is inexpressible at the source, not rejected after', () => {
  const notes = declarationSchema().properties.notes;
  assert.equal(notes.items.minLength, 1,
    'the validator reds an empty note; the schema must not let the model write one in the first place');
});

test('declarationSchema: every enum is the shipped constant, never a second spelling', () => {
  const schema = declarationSchema();
  const branch = (/** @type {string} */ k) => schema.properties.stages.items.oneOf.find((/** @type {any} */ b) => b.properties.kind.const === k);
  const cnw = branch('count-not-worse').properties.params.properties;
  assert.deepEqual(cnw.direction.enum, [...DIRECTIONS]);
  assert.deepEqual(cnw.baseline.enum, [...BASELINES]);
  const longForm = cnw.parser.oneOf.find((/** @type {any} */ f) => f.properties?.terms);
  const term = longForm.properties.terms.items.properties;
  assert.deepEqual(term.aggregate.enum, [...AGGREGATES]);
  assert.deepEqual(term.sign.enum, [...SIGNS]);
  assert.equal(longForm.properties.terms.maxItems, MAX_TERMS);
  assert.ok(cnw.parser.oneOf.some((/** @type {any} */ f) => f.properties?.lineMatch), 'the short form stays expressible');
});

test('declarationTool: the tool takes NO action — it records and acknowledges', async () => {
  /** @type {any} */
  const box = { calls: [] };
  const tool = declarationTool(box);
  assert.equal(tool.name, DECLARATION_TOOL_NAME);
  const out = await tool.execute({ stages: [] });
  assert.equal(typeof out, 'string');
  assert.deepEqual(box.calls, [{ stages: [] }]);
});

// ── 2. the prompt renders the catalogue, the laws, the template, the guards ──

test('the authoring prompt carries the genre template, the catalogue and the FILLED guards', () => {
  const p = authorPrompt({
    answers: baseArgs().answers, questions: GREEN_QUESTIONS, facts: FACTS,
    listingBlock: 'FILES THAT ACTUALLY EXIST', lang: 'js', guards: greenGuards('js'),
    ownedEnvNames: genreOwnedEnvNames('js'), verdictType: 'green',
  });
  assert.match(p, /The graded instrument is the STRICT form/, 'the frozen TYPES template is law for the declaration');
  for (const k of CATALOGUE_LIVE_KINDS) assert.ok(p.includes(k), `the catalogue must name ${k}`);
  assert.match(p, /@ts-expect-error/, 'the guard battery arrives fully parameterised — genre property, not model-filled');
  assert.match(p, /<FILL IN>/, 'the one model-filled slot is marked');
  assert.match(p, new RegExp(DECLARATION_TOOL_NAME), 'the output contract is the tool, never a fenced block');
  assert.ok(!p.includes('```'), 'nothing asks for a fenced JSON block in tool mode');
});

// ── the known-instrument block (run msmbpjk6, 2026-08-09) ───────────────────
//
// The drafting call composed tsc's TTY-only pretty shape against piped output —
// 0 matches on 67 real error lines — and a prior run happened to roll the right
// one. The format of a tool we already own is not a composition choice, so it
// arrives spelled out. These tests hold the DELIVERY: the term must reach the
// prompt verbatim, from the genre, with the real line beside it.

test('the prompt hands over the genre-owned tsc pattern VERBATIM, with the real captured line', () => {
  const p = authorPrompt({
    answers: baseArgs().answers, questions: GREEN_QUESTIONS, facts: FACTS,
    listingBlock: '', lang: 'js', guards: greenGuards('js'), ownedEnvNames: [], verdictType: 'green',
  });
  const [tsc] = genreInstruments('js');
  assert.ok(p.includes(`lineMatch: ${tsc.lineMatch}`), 'the pattern the tree grades with must reach the author spelled out');
  assert.ok(p.includes(tsc.example), 'the real captured line rides with the pattern — the format claim is shown, not asserted');
  assert.match(p, /PIPE, never a terminal/, 'the MECHANISM is stated, not only the answer — other tools pretty-print too');
  // and the block is placed where it can be read as law, not as a footnote after
  // the output contract
  assert.ok(p.indexOf('KNOWN INSTRUMENTS') > p.indexOf('The graded instrument is the STRICT form'), 'it follows the policy that mandates the typecheck stage');
  assert.ok(p.indexOf('KNOWN INSTRUMENTS') < p.indexOf('HOW TO ANSWER'), 'it is law, not a trailing note');
});

test('the known-instrument block is rendered FROM the genre, per language, and never invents a second tool', () => {
  for (const lang of ['js', 'python']) {
    const b = instrumentsBlock(lang);
    const own = genreInstruments(lang);
    for (const i of own) {
      assert.ok(b.includes(i.id), `${lang}: ${i.id} missing`);
      assert.ok(b.includes(`lineMatch: ${i.lineMatch}`), `${lang}: ${i.id}'s pattern is not the genre's own spelling`);
      assert.ok(b.includes(i.example), `${lang}: ${i.id} ships without its real line`);
      // the capture rides WITH the pattern. A count term handed over without it
      // is handed over without the half that decides its aggregate, and `first`
      // paired with a tally (or `sum` with a figure) misreads silently — the exact
      // bug jobs/pulselog-author-types.json records fixing in its own notes.
      assert.ok(b.includes(`capture: ${i.capture === null ? 'null' : i.capture}`),
        `${lang}: ${i.id} ships without its capture`);
    }
    // and the mapping capture → aggregate is STATED, not left to be inferred from
    // the rows: without it the table teaches a shape and hides the trap.
    // ... and stated the RIGHT way round. jobs/pulselog-author-types.json records
    // fixing this exact pairing in its own notes ("must use aggregate sum, not
    // first"), so an inverted law here is a shipped bug wearing correct-looking
    // prose — pinned to the aggregate NAMES, not merely to the law's presence.
    assert.match(b, /capture: null\s+the term TALLIES one per matching line\. Use aggregate "sum"/);
    assert.match(b, /capture: <n>\s+the term reads the FIGURE[\s\S]{0,120}?Use aggregate\s+"first"/);
    assert.match(b, /never a zero/);
    // a language's block never carries the OTHER language's instrument
    for (const other of genreInstruments(lang === 'js' ? 'python' : 'js')) {
      if (own.some((i) => i.id === other.id)) continue;
      assert.ok(!b.includes(other.id), `${lang}: renders ${other.id}, which belongs to the other language`);
    }
    // the gap is NAMED rather than smoothed: a parser for anything not listed is
    // still the author's own work
    assert.match(b, /you still compose the pattern yourself/);
  }
  assert.throws(() => instrumentsBlock('rust'), /rust/);
});

test('the python prompt hands over the mypy pattern, not the JS one', () => {
  const p = authorPrompt({
    answers: {}, questions: GREEN_QUESTIONS, facts: FACTS, listingBlock: '', lang: 'python',
    guards: greenGuards('python'), ownedEnvNames: genreOwnedEnvNames('python'), verdictType: 'green',
  });
  assert.ok(p.includes(`lineMatch: ${genreInstruments('python')[0].lineMatch}`));
  assert.ok(!p.includes('tsc-error-line'), 'a python job is not told how the TypeScript checker prints');
});

test('the prompt announces the genre-owned environment so the model does not author it', () => {
  const p = authorPrompt({
    answers: {}, questions: GREEN_QUESTIONS, facts: FACTS, listingBlock: '', lang: 'python',
    guards: greenGuards('python'), ownedEnvNames: genreOwnedEnvNames('python'), verdictType: 'green',
  });
  assert.match(p, /MYPYPATH/);
});

test('the catalogue and law blocks are rendered from the catalogue, not restated', () => {
  const b = catalogueBlock();
  for (const [kind, spec] of Object.entries(KIND_CATALOGUE)) {
    assert.ok(b.includes(kind));
    if (!spec.locked) assert.ok(b.includes(spec.shape), `${kind}'s shape comes from the catalogue`);
  }
  assert.match(lawsBlock(), /ONE POPULATION PER STAGE/);
  assert.match(lawsBlock(), /FIRST RED WINS/);
});

// ── 3. the revise turn is byte-stable ───────────────────────────────────────

test('REVISE_INSTRUCTION is FROZEN TEXT — its bytes are the gate-2 round-3 instruction', () => {
  assert.equal(
    REVISE_INSTRUCTION,
    'These are the measured results of running your close against the UNCHANGED repository (the seed). '
    + 'The work has not been done yet. Judge your own declaration against them: a work stage that is GREEN at '
    + 'seed is grading nothing; an instrument stop means the stage cannot run at all; a count far from what the '
    + 'interview describes means the instrument is measuring the wrong thing. Return the full corrected '
    + 'declaration, or return it unchanged if you believe it is correct.',
  );
});

test('a revise turn is EXACTLY the measured block plus the frozen instruction', () => {
  const block = renderSeedReadBlock([{ stage: 'typecheck', kind: 'count-not-worse', verdict: 'red', exitCode: EXIT_RED, value: 27, baseline: 0, baselineSource: 'declared 0', gapLines: [], judged: true, detail: {} }]);
  const turn = buildReviseTurn(block);
  assert.equal(turn, `${block}\n\n${REVISE_INSTRUCTION}`);
  assert.deepEqual(assertReviseTurn(turn, block).ok, true);
});

test('assertReviseTurn refuses every way prose could enter the turn', () => {
  const block = renderRejectBlock({ kind: 'validation', reds: [{ code: 'x', path: 'y', detail: 'z' }] });
  const turn = buildReviseTurn(block);
  assert.throws(() => assertReviseTurn(`${turn}\n\nAlso, please hurry.`, block), /REVISE DRIFT/);
  assert.throws(() => assertReviseTurn(`Quick note.\n\n${turn}`, block), /REVISE DRIFT/);
  assert.throws(() => assertReviseTurn(`${block}\n\n${REVISE_INSTRUCTION.replace('measured', 'estimated')}`, block), /REVISE DRIFT/);
  assert.throws(() => assertReviseTurn(buildReviseTurn('some prose'), 'some prose'), /mechanical header/);
});

test('the structure re-ask is its OWN fixed instruction — never the revise one', () => {
  assert.notEqual(STRUCTURE_INSTRUCTION_TOOL, REVISE_INSTRUCTION);
  assert.match(STRUCTURE_INSTRUCTION_TOOL, new RegExp(DECLARATION_TOOL_NAME));
});

// ── 4. the measured blocks are measurements ─────────────────────────────────

test('renderSeedReadBlock: a number the instrument never reported is unknown, never 0 (F6)', () => {
  const block = renderSeedReadBlock([
    { stage: 'typecheck', kind: 'count-not-worse', verdict: 'instrument-stop', exitCode: EXIT_STOP, value: null, baseline: null, baselineSource: null, judged: false, gapLines: ['TEST:: INSTRUMENT: tsc did not finish'], detail: { stop: 'INSTRUMENT: tsc did not finish' } },
    { stage: 'tests-kept', kind: 'count-not-worse', verdict: 'green', exitCode: EXIT_GREEN, value: 0, baseline: 0, baselineSource: 'declared 0', judged: true, gapLines: [], detail: {} },
  ]);
  assert.match(block, /^MEASURED SEED-READ —/);
  assert.match(block, /instrument-stop: INSTRUMENT: tsc did not finish/);
  assert.ok(!/value: 0 · baseline: 0[\s\S]*tsc did not finish/.test(block), 'the stopped stage must not report a number');
  assert.match(block, /value: 0 · baseline: 0/, 'a genuinely counted zero still reads 0');
});

test('renderSeedReadBlock: a measured value against an UNMEASURABLE baseline reads unknown', () => {
  // the half of F6 the stop case cannot exercise: the stage DID report a number,
  // and the thing it is judged against did not
  const block = renderSeedReadBlock([{ stage: 'tests-kept', kind: 'count-not-worse', verdict: 'red', exitCode: EXIT_RED, value: 12, baseline: null, baselineSource: null, judged: true, gapLines: [], detail: {} }]);
  assert.match(block, /value: 12 · baseline: unknown/);
  assert.ok(!/baseline: 0/.test(block), 'an unmeasured baseline is never a defaulted zero');
});

test('renderSeedReadBlock: the per-stage gap is capped and the trim ANNOUNCED (F28)', () => {
  const gapLines = Array.from({ length: REVISE_GAP_CAP + 7 }, (_, i) => `TEST:: error ${i}`);
  const block = renderSeedReadBlock([{ stage: 's', kind: 'command-exit', verdict: 'red', exitCode: EXIT_RED, value: null, baseline: null, baselineSource: null, judged: true, gapLines, detail: {} }]);
  assert.match(block, /gap trimmed: 7 of 22 lines withheld/);
  assert.ok(block.includes('TEST:: error 0'));
  assert.ok(!block.includes('TEST:: error 21'));
});

test('renderRejectBlock: validation and parse each carry a mechanical header, reds capped', () => {
  const reds = Array.from({ length: REVISE_RED_CAP + 3 }, (_, i) => ({ code: 'invalid-value', path: `stages[${i}]`, detail: 'nope' }));
  const v = renderRejectBlock({ kind: 'validation', reds });
  assert.match(v, /^MEASURED VALIDATION —/);
  assert.match(v, /3 of 23 reds withheld/);
  const p = renderRejectBlock({ kind: 'artifact', reds: ['no tool call'] });
  assert.match(p, /^MEASURED PARSE —/);
});

// ── 5. the genre owns its environment ───────────────────────────────────────

test('applyGenreEnv: python injects MYPYPATH into every command-bearing stage only', () => {
  const decl = { stages: [...goodDeclaration('python').stages] };
  const r = applyGenreEnv(decl, 'python', { sourcePrefixes: ['src', 'lib'] });
  assert.deepEqual(r.reds, []);
  assert.deepEqual(r.applied, { MYPYPATH: 'src:lib' });
  const byKind = Object.fromEntries(r.declaration.stages.map((/** @type {any} */ s) => [s.kind, s.params]));
  assert.deepEqual(byKind['count-not-worse'].env, { MYPYPATH: 'src:lib' });
  assert.ok(!('env' in byKind['files-changed']), 'a stage that spawns nothing gets no environment');
  assert.ok(!('env' in byKind['pattern-absent-in-diff']));
  // the input is never mutated — the model's own declaration stays what it wrote
  assert.ok(!('env' in decl.stages[1].params));
});

test('applyGenreEnv: a model-authored genre-owned variable is DROPPED and ANNOUNCED (fail-safe)', () => {
  const decl = goodDeclaration('python');
  decl.stages[1].params.env = { MYPYPATH: 'whatever-the-model-guessed', PYTHONHASHSEED: '0' };
  const r = applyGenreEnv(decl, 'python', { sourcePrefixes: ['src'] });
  assert.deepEqual(r.dropped, [{ stage: 'typecheck', name: 'MYPYPATH' }]);
  assert.deepEqual(r.declaration.stages[1].params.env, { PYTHONHASHSEED: '0', MYPYPATH: 'src' });
});

test('applyGenreEnv: a genre that owns no environment injects nothing and reds nothing', () => {
  const r = applyGenreEnv(goodDeclaration('js'), 'js', { sourcePrefixes: ['src'] });
  assert.deepEqual(r.applied, {});
  assert.deepEqual(r.reds, []);
  assert.deepEqual(r.missing, []);
});

test('applyGenreEnv: a genre variable it CANNOT compute is a red, never a silent omission', () => {
  const r = applyGenreEnv(goodDeclaration('python'), 'python', { sourcePrefixes: [] });
  assert.deepEqual(r.missing, ['MYPYPATH']);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'genre-env-unavailable');
});

// ── 5b. the prefixes the genre variable is BUILT from ───────────────────────
//
// The aurora shape, measured: 11 `src/*` entries are symlinks into
// `packages/*/src`, so an existence-only filter joins BOTH spellings of one tree
// into MYPYPATH and mypy dies fatally (exit 2, "shadows library module") with no
// output at all — a stage that reads as a broken instrument on a healthy patient.

/** a temp tree with real directories and real symlinks @param {any} t */
function symlinkTree(t) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-prefixes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const pkg of ['alpha', 'beta']) {
    mkdirSync(join(dir, 'packages', pkg, 'src'), { recursive: true });
    writeFileSync(join(dir, 'packages', pkg, 'src', 'mod.py'), 'x = 1\n');
  }
  mkdirSync(join(dir, 'src'), { recursive: true });
  symlinkSync(join('..', 'packages', 'alpha', 'src'), join(dir, 'src', 'alpha'));
  symlinkSync(join('..', 'packages', 'beta', 'src'), join(dir, 'src', 'beta'));
  return dir;
}

/** what `git ls-tree -r` reports for that tree: symlinks are FILE entries */
const SYMLINK_SEED = Object.freeze([
  'packages/alpha/src/mod.py', 'packages/beta/src/mod.py', 'src/alpha', 'src/beta',
]);

test('source prefixes: a symlink and the real directory behind it are ONE prefix, spelled as the REAL path', async (t) => {
  const dir = symlinkTree(t);
  const out = resolveSourcePrefixes({
    workdir: dir,
    sourcePaths: ['src/alpha (symlink)', 'packages/alpha/src', 'src/beta', 'packages/beta/src'],
    seedFiles: [...SYMLINK_SEED],
  });
  assert.deepEqual(out, ['packages/alpha/src', 'packages/beta/src'],
    'both spellings of one tree in MYPYPATH is the "shadows library module" fatal');
  // and every spelling it emits SELECTS from the seed listing — the grounded
  // validator checks each element against exactly this list
  for (const p of out) {
    assert.ok(SYMLINK_SEED.some((f) => f === p || f.startsWith(`${p}/`)), `${p} must be listing-present`);
  }
});

test('source prefixes: the EXISTENCE filter survives — a path the seed tree does not contain is dropped', async (t) => {
  const dir = symlinkTree(t);
  const out = resolveSourcePrefixes({
    workdir: dir,
    sourcePaths: ['packages/alpha/src', 'src/invented', ''],
    seedFiles: [...SYMLINK_SEED],
  });
  assert.deepEqual(out, ['packages/alpha/src']);
});

test('source prefixes: a tree with no symlinks is passed through unchanged, in order', async (t) => {
  const dir = symlinkTree(t);
  const out = resolveSourcePrefixes({
    workdir: dir,
    sourcePaths: ['packages/beta/src', 'packages/alpha/src'],
    seedFiles: [...SYMLINK_SEED],
  });
  assert.deepEqual(out, ['packages/beta/src', 'packages/alpha/src'], 'dedupe must not reorder or collapse real siblings');
});

test('source prefixes: a link OUT of the repository keeps its listing-present spelling, never an outside absolute path', async (t) => {
  const dir = symlinkTree(t);
  const outside = mkdtempSync(join(tmpdir(), 'bareloop-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(dir, 'src', 'external'));
  const out = resolveSourcePrefixes({
    workdir: dir,
    sourcePaths: ['src/external'],
    seedFiles: [...SYMLINK_SEED, 'src/external'],
  });
  assert.deepEqual(out, ['src/external'],
    'a value the grounded validator cannot select from the listing is one the arbiter must not build');
});

test('source prefixes: an unreadable candidate keeps its declared spelling rather than vanishing', async (t) => {
  const dir = symlinkTree(t);
  symlinkSync(join(dir, 'nowhere-at-all'), join(dir, 'src', 'dangling'));
  const out = resolveSourcePrefixes({
    workdir: dir,
    sourcePaths: ['src/dangling'],
    seedFiles: [...SYMLINK_SEED, 'src/dangling'],
  });
  assert.deepEqual(out, ['src/dangling']);
});

// ── 6. the flow ─────────────────────────────────────────────────────────────

test('authorClose: the happy path — author, validate, measure, revise, early-stop unchanged', async () => {
  const decl = goodDeclaration();
  const { generate, calls } = scriptGenerate([{ declaration: decl }, { declaration: decl }]);
  const { fn, seen } = scriptSeedRead({ 'changed-from-seed': { verdict: 'red' }, typecheck: { verdict: 'red', value: 27, baseline: 0 } });
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });

  assert.equal(r.ok, true);
  assert.deepEqual(r.reds, []);
  assert.equal(r.stop, 'unchanged');
  assert.equal(calls.length, 2, 'one authoring call, one revise call, then the early stop');
  assert.equal(seen.length, 1, 'an unchanged declaration is never re-executed');
  assert.equal(r.seedRead.length, decl.stages.length);
  assert.equal(r.finalFrom, 'author');
  // the revise turn actually carried the measured block
  const reviseMsg = calls[1].messages.at(-1).content;
  assert.match(reviseMsg, /^MEASURED SEED-READ —/m);
  assert.ok(reviseMsg.endsWith(REVISE_INSTRUCTION));
});

test('authorClose: the turn the LOOP sends is byte-identical to measured-block + the frozen instruction', async () => {
  // the call-site invariant, not just the helper's. `assertReviseTurn` inside the
  // loop can only fire when something else is already broken, so the thing worth
  // pinning is that the bytes leaving the loop are exactly the ones the two
  // mechanical builders produce — nothing may be appended on the way out
  const decl = goodDeclaration();
  const { generate, calls } = scriptGenerate([{ declaration: decl }, { declaration: decl }]);
  const { fn } = scriptSeedRead({ typecheck: { verdict: 'red', value: 27, baseline: 0, gapLines: ['TEST:: 27 errors'] } });
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  const expected = buildReviseTurn(renderSeedReadBlock(r.iterations[0].seedRead));
  assert.equal(calls[1].messages.at(-1).content, expected);
});

test('authorClose: subprocess output reaching the model is SCRUBBED by the one shared redactor', async () => {
  // The seed read's gap lines and instrument stops are raw subprocess output —
  // env echoes, stack traces, file contents — and that block becomes the next
  // USER TURN sent to the provider. It is the surface most likely to carry a
  // real credential, so it crosses the same scrubber every other boundary in
  // this file uses (the model's own text at `askDeclaration`), from the ONE
  // inventory in validate.js. Built here from parts so no real-shaped token
  // literal ever exists in the tree.
  const fake = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(fake).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const decl = goodDeclaration();
  const { generate, calls } = scriptGenerate([{ declaration: decl }, { declaration: decl }]);
  const { fn } = scriptSeedRead({
    typecheck: {
      verdict: 'red',
      value: 27,
      baseline: 0,
      gapLines: [`TEST::   error: ANTHROPIC_API_KEY=${fake} not accepted`],
      detail: { stop: `INSTRUMENT: "npx" could not be run (token ${fake})` },
    },
  });
  await authorClose({ ...baseArgs(), generate, seedReadFn: fn });

  const turn = calls[1].messages.at(-1).content;
  assert.deepEqual(scanSecrets(turn), [], 'a secret in subprocess output must never cross the network');
  assert.ok(turn.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  // the mechanical detail AROUND the token is what converts — it must survive
  assert.match(turn, /TEST::   error: ANTHROPIC_API_KEY=/);
  assert.match(turn, /instrument-stop: INSTRUMENT: "npx" could not be run/);
});

// The seed-read block was scrubbed; the REJECT block is the other half of the
// same channel and was not. Validation reds quote what the MODEL DECLARED,
// verbatim — the genre-env wrong-value branch echoes both the expected and the
// declared value, the deny floor echoes the whole `cmd`, the listing rule echoes
// the path — and that block becomes the next USER TURN. A declared value shaped
// like a credential crossed unmasked. Same fix, same ONE inventory, applied to
// the whole rendered block so a line added here is scrubbed by construction.
test('renderRejectBlock: a validation red quoting model-declared text is SCRUBBED before it can become a turn', () => {
  const fake = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(fake).length, 1, 'the fixture must be a shape the ONE inventory actually detects');

  // the reds are the REAL validator's, never hand-written: what is being tested
  // is that the details it produces carry raw model strings
  const decl = goodDeclaration();
  decl.stages[1].params.env = { MYPYPATH: fake };
  const { reds } = validateDeclaration(decl, {
    listing: [...LISTING], guards: greenGuards('js'), envOwned: ['MYPYPATH'], envInjected: { MYPYPATH: 'src' },
    verdictType: 'green',
  });
  assert.ok(
    reds.some((r) => scanSecrets(r.detail).length === 1),
    'the validator must actually echo the declared value — without that this test cannot fail',
  );

  const block = renderRejectBlock({ kind: 'validation', reds });
  assert.deepEqual(scanSecrets(block), [], 'a declared secret must never cross the network in a reject block');
  assert.ok(block.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  // the mechanical detail AROUND the token is what converts — it must survive
  assert.match(block, /genre-owned-env at stages\[1\]\.params\.env\.MYPYPATH/);
});

test('authorClose: a validation red reaching the model is SCRUBBED in the turn actually handed to generate', async () => {
  const fake = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(fake).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  // reachable inside the loop: the deny floor quotes the declared cmd verbatim,
  // and a vendored toolchain path is exactly the kind of operator-pasted string
  // that carries a token
  const bad = goodDeclaration();
  bad.stages[1].params.cmd = `/opt/${fake}/bin/tsc`;
  const good = goodDeclaration();
  const { generate, calls } = scriptGenerate([{ declaration: bad }, { declaration: good }, { declaration: good }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });

  const turn = calls[1].messages.at(-1).content;
  assert.match(turn, /MEASURED VALIDATION/, 'the reject block is what was fed back');
  assert.deepEqual(scanSecrets(turn), [], 'a secret in a validation red must never cross the network');
  assert.ok(turn.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(turn, /cmd-denied at stages\[1\]\.params\.cmd/);

  // …and the PERSISTED twin, which is the copy that outlives the run. These reds
  // ride `iterations[].validation` and this function's returned `reds` into
  // authored.json and into the append-only spine, where a captured key is captured
  // forever. The rendered block was masked and this copy was not — one channel
  // scrubbed, one not, out of the same `v.reds`.
  assert.deepEqual(scanSecrets(JSON.stringify(r.iterations[0].validation)), [],
    'the recorded validation is a persisted record, scrubbed at the same boundary as the rendered one');
  const denied = r.iterations[0].validation.reds.find((/** @type {any} */ x) => x.code === 'cmd-denied');
  assert.ok(denied, 'the deny-floor red is the one that quotes the declared cmd verbatim');
  assert.ok(denied.cmd.includes('[REDACTED:'), 'the structured cmd field is masked too, not only detail');
});

test('authorClose: a validation red is fed back as a measurement and COUNTS as a revision', async () => {
  const bad = goodDeclaration();
  bad.stages[1].params.scope = {}; // scoped job with no population named → F84 red
  const good = goodDeclaration();
  const { generate, calls } = scriptGenerate([{ declaration: bad }, { declaration: good }, { declaration: good }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });

  assert.equal(calls.length, 3);
  assert.match(calls[1].messages.at(-1).content, /^MEASURED VALIDATION —/);
  assert.equal(r.iterations[0].validation.ok, false);
  assert.equal(r.iterations[0].seedRead, null, 'a rejected declaration is never executed');
  assert.equal(r.ok, true);
  assert.equal(r.finalFrom, 'revise-1');
});

test('authorClose: revisions are BOUNDED — the loop stops at MAX_REVISIONS', async () => {
  const decls = [goodDeclaration(), goodDeclaration(), goodDeclaration(), goodDeclaration()];
  decls[1].notes = ['a']; decls[2].notes = ['b']; decls[3].notes = ['c'];
  const { generate, calls } = scriptGenerate(decls.map((d) => ({ declaration: d })));
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  assert.equal(calls.length, MAX_REVISIONS + 1);
  assert.equal(r.revisions, MAX_REVISIONS);
  assert.equal(r.stop, 'max-revisions');
});

test('authorClose: maxRevisions is TIGHTEN-ONLY — a caller cannot buy more revise rounds than MAX_REVISIONS', async () => {
  const decls = Array.from({ length: 6 }, (_, n) => { const d = goodDeclaration(); d.notes = [`n${n}`]; return d; });
  const { generate, calls } = scriptGenerate(decls.map((d) => ({ declaration: d })));
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, maxRevisions: 50 });
  assert.equal(calls.length, MAX_REVISIONS + 1, 'the raised ceiling is clamped down to the constant');
  assert.equal(r.revisions, MAX_REVISIONS);
  assert.equal(r.stop, 'max-revisions');
});

test('authorClose: a negative maxRevisions floors at zero — one authoring call, no revise round', async () => {
  const decls = Array.from({ length: 4 }, (_, n) => { const d = goodDeclaration(); d.notes = [`n${n}`]; return d; });
  const { generate, calls } = scriptGenerate(decls.map((d) => ({ declaration: d })));
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, maxRevisions: -3 });
  assert.equal(calls.length, 1, 'the floor is one author call, never a negative loop bound');
  assert.equal(r.revisions, 0);
  assert.equal(r.stop, 'max-revisions');
});

// TIGHTENING IS THE HALF THAT HAD NO DETECTOR. The two tests above pin the
// ceiling and the floor; NEITHER can fail if the clamp stops honouring values
// BETWEEN them — MEASURED by replacing the clamp with `x <= 0 ? 0 : CEILING`,
// which passed the whole file. A bound that only ever reads as its two extremes
// is not tighten-only, it is a switch, and the direction the whole rule exists
// to permit (the operator lowering it) was the untested one.

test('authorClose: a maxRevisions BETWEEN the floor and the ceiling is HONOURED, not rounded to either', async () => {
  const decls = Array.from({ length: 4 }, (_, n) => { const d = goodDeclaration(); d.notes = [`n${n}`]; return d; });
  const { generate, calls } = scriptGenerate(decls.map((d) => ({ declaration: d })));
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, maxRevisions: 1 });
  assert.ok(MAX_REVISIONS > 1, 'the fixture only discriminates while 1 is strictly inside the range');
  assert.equal(calls.length, 2, 'one author call and exactly ONE revise — the number asked for');
  assert.equal(r.revisions, 1);
  assert.equal(r.stop, 'max-revisions');
});

test('authorClose: structureRetries is TIGHTEN-ONLY under the constant that already claimed to be its ceiling', async () => {
  // it buys provider calls exactly as `maxRevisions` does, and it rode through to
  // `askDeclaration` unclamped until 40672ae — a caller handing 50 got 50 paid
  // malformed-emission retries above a ceiling this module declares
  const { generate, calls } = scriptGenerate([{ text: 'prose only, no tool call' }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, structureRetries: 50 });
  assert.equal(calls.length, MAX_STRUCTURE_RETRIES + 1, 'the raised ceiling clamps down to the constant');
  assert.equal(r.stop, 'artifact-red');
});

test('authorClose: a structureRetries BETWEEN the floor and the ceiling is HONOURED too', async () => {
  const { generate, calls } = scriptGenerate([{ text: 'prose only, no tool call' }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, structureRetries: 1 });
  assert.ok(MAX_STRUCTURE_RETRIES > 1, 'the fixture only discriminates while 1 is strictly inside the range');
  assert.equal(calls.length, 2, 'one ask and exactly ONE retry');
  assert.equal(r.stop, 'artifact-red');
});

test('authorClose: structureRetries floors at zero — ONE ask, no retry, and never a negative loop bound', async () => {
  const { generate, calls } = scriptGenerate([{ text: 'prose only, no tool call' }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, structureRetries: -5 });
  // `askDeclaration` loops `attempt <= retries`, so 0 is still ONE attempt — a
  // legal tighter ask, never an absent one
  assert.equal(calls.length, 1);
  assert.equal(r.stop, 'artifact-red');
});

test('authorClose: a bound that is not a NUMBER floors on both axes — it never throws', async () => {
  // the SCOUT_ATTEMPTS direction verbatim: a malformed value CLAMPS rather than
  // throwing, because the number is not a signed artefact — nothing downstream
  // depends on a caller having asked for the right one, and refusing a run over a
  // bad cap costs a paid scout for no safety
  const { fn } = scriptSeedRead();
  for (const junk of ['banana', NaN, null, {}]) {
    const a = scriptGenerate([{ declaration: goodDeclaration() }]);
    const ra = await authorClose({ ...baseArgs(), generate: a.generate, seedReadFn: fn, maxRevisions: /** @type {any} */ (junk) });
    assert.equal(a.calls.length, 1, `maxRevisions ${String(junk)} must floor, not throw and not run unbounded`);
    assert.equal(ra.stop, 'max-revisions');

    const b = scriptGenerate([{ text: 'prose only' }]);
    await authorClose({ ...baseArgs(), generate: b.generate, seedReadFn: fn, structureRetries: /** @type {any} */ (junk) });
    assert.equal(b.calls.length, 1, `structureRetries ${String(junk)} must floor, not throw and not run unbounded`);
  }
});

test('authorClose: Infinity is a WIDENING, not garbage — it clamps to the ceiling, exactly as SCOUT_ATTEMPTS treats it', async () => {
  // `Math.trunc(Infinity)` is Infinity and survives the `|| 0` guard, so it lands
  // on the `Math.min` and reads as "as many as you will give me". That is the
  // ceiling, not the floor — the same reading `runAuthorScout`'s own tighten-only
  // test pins for `attempts: Infinity`
  const decls = Array.from({ length: 6 }, (_, n) => { const d = goodDeclaration(); d.notes = [`n${n}`]; return d; });
  const a = scriptGenerate(decls.map((d) => ({ declaration: d })));
  const ra = await authorClose({ ...baseArgs(), generate: a.generate, seedReadFn: scriptSeedRead().fn, maxRevisions: Infinity });
  assert.equal(a.calls.length, MAX_REVISIONS + 1);
  assert.equal(ra.revisions, MAX_REVISIONS);

  const b = scriptGenerate([{ text: 'prose only, no tool call' }]);
  await authorClose({ ...baseArgs(), generate: b.generate, seedReadFn: scriptSeedRead().fn, structureRetries: Infinity });
  assert.equal(b.calls.length, MAX_STRUCTURE_RETRIES + 1);
});

test('the two revise-loop bounds floor at ZERO while the SURVEY floors at ONE — a deliberate difference', async () => {
  // the same tighten-only rule, three axes, and the floors differ on purpose: a
  // scout that never ran is an ABSENT nobody can act on, while one authoring call
  // with no revise round is a perfectly legal ask. Pinned so a later tidy-up that
  // "harmonises" the floors has to argue with a test rather than a comment.
  assert.equal(SCOUT_ATTEMPTS, 3);
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn, maxRevisions: 0, structureRetries: 0 });
  assert.equal(calls.length, 1, 'zero is a LEGAL bound on both revise-loop axes — one call, and it authored a close');
  assert.equal(r.ok, true);
});

test('authorClose: a reply with no tool call is an ARTIFACT-RED with a bounded retry, and writes nothing', async () => {
  const { generate, calls } = scriptGenerate([{ text: 'Here is my close: {...}' }]);
  const { fn, seen } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  assert.equal(r.ok, false);
  assert.equal(r.declaration, null);
  assert.equal(r.stop, 'artifact-red');
  assert.equal(r.reds[0].code, 'artifact-red');
  assert.equal(calls.length, MAX_STRUCTURE_RETRIES + 1, 'the retry is bounded, not unlimited');
  assert.equal(seen.length, 0, 'nothing is ever executed for a declaration that never arrived');
  assert.match(calls[1].messages.at(-1).content, new RegExp(DECLARATION_TOOL_NAME));
});

test('authorClose: a structure retry does NOT consume a revision', async () => {
  const d0 = goodDeclaration();
  const d1 = goodDeclaration(); d1.notes = ['one'];
  const d2 = goodDeclaration(); d2.notes = ['two'];
  const { generate, calls } = scriptGenerate([{ text: 'prose only' }, { declaration: d0 }, { declaration: d1 }, { declaration: d2 }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  assert.equal(r.ok, true);
  assert.equal(r.iterations[0].attempts, 2, 'the malformed emission was retried inside the first authoring call');
  // a transport fault is not a declaration defect: the FULL revision budget is
  // still available afterwards
  assert.equal(r.revisions, MAX_REVISIONS);
  assert.equal(calls.length, 1 + (MAX_REVISIONS + 1), 'one retry, then all three declaration calls');
});

test('authorClose: two declaration calls in one turn is ambiguity, not a free choice', async () => {
  const a = goodDeclaration();
  const b = goodDeclaration();
  b.notes = ['second'];
  const { generate } = scriptGenerate([{ declarations: [a, b] }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'artifact-red');
  assert.match(r.reds[0].detail, /2/);
});

test('authorClose: a provider error stops the flow and is NOT a declaration defect', async () => {
  const { generate } = scriptGenerate([{ error: 'ENETUNREACH', declaration: null }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'provider-red');
  assert.equal(r.reds[0].code, 'provider-red');
});

test('authorClose: a provider error AFTER a good close keeps the close and still says what died', async () => {
  const decl = goodDeclaration();
  const { generate } = scriptGenerate([{ declaration: decl }, { error: 'ENETUNREACH' }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  // a casualty is never evidence: a dead socket on the revise call does not
  // invalidate a close that was already validated and already measured
  assert.equal(r.ok, true);
  assert.equal(r.finalFrom, 'author');
  assert.equal(r.stop, 'provider-red');
  assert.equal(r.reds[0].code, 'provider-red', 'why the loop ended is never hidden');
});

test('authorClose: an ABSENT survey refuses BEFORE any token is spent (F59)', async () => {
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({
    ...baseArgs(), generate, seedReadFn: fn,
    scout: { state: 'ABSENT', facts: null, reason: 'survey 0 bytes — the scout did not complete', calls: [] },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'scout-absent');
  assert.equal(calls.length, 0, 'an absent facts object must never be authored from');
});

test('authorClose: an EMPTY facts object is never treated as "no facts needed"', async () => {
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({
    ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn,
    scout: { state: 'PRESENT', facts: {}, reason: null, calls: [] },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'scout-absent');
  assert.equal(calls.length, 0);
});

test('authorClose: an unreadable listing is a red before any token, never an empty listing', async () => {
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({
    ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn,
    listing: { files: null, block: null, meta: null, stop: 'INSTRUMENT: the seed commit does not exist' },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'listing-unreadable');
  assert.equal(calls.length, 0);
});

test('authorClose: the git stderr inside an unreadable-listing red is SCRUBBED — the red is kept, not just read', async () => {
  // the listing's `stop` is built from `git ls-tree`'s own stderr (kinds.js:
  // `INSTRUMENT: … : ${String(r.err).trim()}`), and M1 deliberately does not
  // scrub — the caller does, at the boundary. This red leaves the flow and is
  // carried by `authorCloseForJob` into what the caller persists, exactly like
  // the two git channels in `prepareSigning`. Same leak class, same one inventory.
  const fake = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(fake).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const stop = `INSTRUMENT: git ls-tree -r seedsha failed in /patient: fatal: authorization failed (token ${fake})`;

  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({
    ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn,
    listing: { files: null, block: null, meta: null, stop },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'listing-unreadable');
  assert.deepEqual(scanSecrets(r.reds[0].detail), [], 'a credential in git stderr must never survive into a kept red');
  assert.ok(r.reds[0].detail.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(r.reds[0].detail, /^INSTRUMENT: git ls-tree -r seedsha failed in \/patient: fatal: authorization failed/);
  assert.equal(calls.length, 0, 'and it still refuses before any token');
});

test('authorClose: the provider error inside a provider-red is SCRUBBED — a transport casualty is still persisted', async () => {
  // the transport's own message, verbatim: a proxy URL or an auth header echoed
  // back by the socket layer lands in `ask.providerError` and rides straight into
  // a kept red. Same boundary, same one inventory as the two git channels above.
  const fake = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(fake).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const err = `ENETUNREACH: connect failed via https://proxy.invalid?key=${fake}`;
  assert.equal(scanSecrets(err).length, 1, 'and the injected error must really carry it — else nothing is under test');

  const { generate } = scriptGenerate([{ error: err, declaration: null }]);
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn });

  assert.equal(r.ok, false);
  assert.equal(r.stop, 'provider-red');
  assert.equal(r.reds[0].code, 'provider-red');
  assert.deepEqual(scanSecrets(r.reds[0].detail), [], 'a credential in transport prose must never survive into a kept red');
  assert.ok(r.reds[0].detail.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(r.reds[0].detail, /^ENETUNREACH: connect failed via /, 'which transport died is still readable');
});

test('authorClose: the scout reason inside a scout-absent red is SCRUBBED — its meta.error half is provider prose', async () => {
  // `scout.reason` is half survey bookkeeping and half the scout's own error
  // string, so the same transport prose reaches this red by a second route — and
  // this one refuses at $0, before the loop the test above dies inside.
  const fake = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(fake).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const reason = `survey 0 bytes — the scout did not complete (401 for key ${fake})`;
  assert.equal(scanSecrets(reason).length, 1, 'and the injected reason must really carry it — else nothing is under test');

  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({
    ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn,
    scout: { state: 'ABSENT', facts: null, reason, calls: [] },
  });

  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'scout-absent');
  assert.deepEqual(scanSecrets(r.reds[0].detail), [], 'a credential in the survey reason must never survive into a kept red');
  assert.ok(r.reds[0].detail.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(r.reds[0].detail, /^the survey is ABSENT \(survey 0 bytes — the scout did not complete/);
  assert.equal(calls.length, 0, 'and it still refuses before any token');
});

test('authorClose: an EMPTY listing is a red before any token, and names itself apart from an unreadable one', async () => {
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({
    ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn,
    listing: { files: [], block: '', meta: {}, stop: null },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'listing-absent', 'a tree with no files and an unreadable tree are different facts');
  assert.equal(calls.length, 0);
});

test('authorClose: a genre variable the patient cannot supply refuses BEFORE any token', async () => {
  // MYPYPATH moves no seed number, so no seed-verdict read can ever catch its
  // absence — which is exactly why it has to be caught here, at $0, before a
  // close is authored that would be signed without it
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration('python') }]);
  const r = await authorClose({
    ...baseArgs(), lang: /** @type {any} */ ('python'), generate, seedReadFn: scriptSeedRead().fn,
    // the survey named a source path that exists nowhere in the seed tree, so
    // there is nothing honest to build the variable out of
    scout: { state: 'PRESENT', facts: { ...FACTS, sourcePaths: ['does/not/exist'] }, reason: null, calls: [] },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'genre-env-unavailable');
  assert.equal(r.reds[0].name, 'MYPYPATH');
  assert.equal(calls.length, 0);
});

test('the text fallback treats an unparseable JSON body as an artifact-red, never an empty close', async () => {
  const generate = async () => ({
    text: '```json\n{ "stages": [ oops\n```',
    error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 },
  });
  const { fn, seen } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, structuredMode: 'text' });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'artifact-red');
  assert.match(r.reds[0].detail, /did not parse as JSON/);
  assert.equal(seen.length, 0, 'a reply that could not be read is never executed as a close');
});

test('authorClose: a genre with no data refuses instead of authoring guardless', async () => {
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({ ...baseArgs(), lang: /** @type {any} */ ('cobol'), generate, seedReadFn: scriptSeedRead().fn });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'genre-unsupported');
  assert.equal(calls.length, 0);
});

test('authorClose: the returned declaration carries the genre env, the model\'s copy does not', async () => {
  const decl = goodDeclaration('python', ['src/a.py', 'src/b.py']);
  const { generate, calls } = scriptGenerate([{ declaration: decl }, { declaration: decl }]);
  const { fn, seen } = scriptSeedRead();
  const r = await authorClose({
    ...baseArgs(), lang: /** @type {any} */ ('python'), generate, seedReadFn: fn,
    listing: { files: ['src/a.py', 'src/b.py'], block: 'b', meta: {}, stop: null },
    scout: { state: 'PRESENT', facts: { ...FACTS, language: 'python', sourcePaths: ['src'] }, reason: null, calls: [] },
  });
  assert.equal(r.ok, true);
  const tc = r.declaration.stages.find((/** @type {any} */ s) => s.kind === 'count-not-worse');
  assert.deepEqual(tc.params.env, { MYPYPATH: 'src' });
  // what was MEASURED is what will RUN
  assert.deepEqual(seen[0].stages.find((/** @type {any} */ s) => s.kind === 'count-not-worse').params.env, { MYPYPATH: 'src' });
  // ... and the model was never handed its own injected copy back (it would red as genre-owned-env)
  const revise = calls[1].messages.at(-1).content;
  assert.ok(!revise.includes('MYPYPATH'), 'the injected variable is stated once, up front, never fed back as the model\'s own');
});

test('authorClose: the declaration handed to the validator is the RESOLVED one (short parsers expanded)', async () => {
  const decl = goodDeclaration();
  const { generate } = scriptGenerate([{ declaration: decl }, { declaration: decl }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  const parser = r.declaration.stages.find((/** @type {any} */ s) => s.kind === 'count-not-worse').params.parser;
  assert.ok(Array.isArray(parser.terms), 'the short form stops existing at this boundary');
  assert.equal(parser.terms[0].aggregate, 'first');
  assert.equal(parser.terms[0].sign, 1);
});

test('authorClose: cost is metered per call, and one unpriced call makes the total honest-null', async () => {
  const decl = goodDeclaration();
  const { generate } = scriptGenerate([{ declaration: decl, costUsd: 0.02 }, { declaration: decl, costUsd: null }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  assert.equal(r.cost.costUsd, null, 'unknown is never laundered into a number');
  assert.equal(r.cost.knownUsd, 0.02);
  assert.equal(r.cost.spendComplete, false);
  assert.deepEqual(r.cost.calls.map((/** @type {any} */ c) => c.label), ['author', 'revise-1']);
});

test('authorClose: the scout\'s own spend is absorbed into the flow\'s book', async () => {
  const decl = goodDeclaration();
  const { generate } = scriptGenerate([{ declaration: decl }, { declaration: decl }]);
  const r = await authorClose({
    ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn,
    scout: { ...SCOUT_OK, calls: [{ label: 'author-scout', costUsd: 0.05, unpricedRounds: 0 }] },
  });
  assert.equal(r.cost.calls[0].label, 'author-scout');
  assert.ok(r.cost.knownUsd >= 0.05);
});

test('authorClose: a last revision that REGRESSES keeps the last accepted close and says so', async () => {
  const good = goodDeclaration();
  const bad = goodDeclaration();
  bad.stages.splice(2, 1); // drop the no-suppressions guard → guard-missing
  const { generate } = scriptGenerate([{ declaration: good }, { declaration: bad }, { declaration: bad }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });
  assert.equal(r.ok, true);
  assert.equal(r.finalFrom, 'author');
  assert.ok(r.reds.some((/** @type {any} */ x) => x.code === 'guard-missing'), 'the rejected revision is reported, never hidden');
});

// ── 7. the text fallback, and the consequence of an inexpressible locked kind ─

test('the text fallback parses a fenced declaration and is the ONLY locked-kind demand channel', async () => {
  const decl = goodDeclaration();
  decl.stages.push({ name: 'human-check', kind: 'human-confirms', params: {} });
  const generate = async () => ({
    text: `\`\`\`json\n${JSON.stringify(decl)}\n\`\`\``,
    error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 },
  });
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn, structuredMode: 'text' });
  // the demand IS counted here, because text mode can express what the schema cannot
  const locked = r.iterations[0].validation.reds.filter((/** @type {any} */ x) => x.code === 'locked-kind');
  assert.equal(locked.length, 1);
  assert.equal(locked[0].kind, 'human-confirms');
  assert.equal(locked[0].lib, 'bareloop');
});

test('tool mode hands the model exactly one tool; text mode hands it none', async () => {
  const seen = /** @type {any[]} */ ([]);
  const generate = async (/** @type {any} */ m, /** @type {any} */ tools) => {
    seen.push(tools.map((/** @type {any} */ t) => t.name));
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn });
  assert.deepEqual(seen[0], [DECLARATION_TOOL_NAME]);
  seen.length = 0;
  await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn, structuredMode: 'text' });
  assert.deepEqual(seen[0], []);
});

// ── 8. the REAL instrument ──────────────────────────────────────────────────

test('authorClose drives the REAL seed read against a REAL repository', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-authorflow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'flow-test', GIT_AUTHOR_EMAIL: 'flow@test',
      GIT_COMMITTER_NAME: 'flow-test', GIT_COMMITTER_EMAIL: 'flow@test',
    },
  });
  git(['init', '-q', '-b', 'main']);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/email.js'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'src/backup.js'), 'export const b = 2;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  const seed = git(['rev-parse', 'HEAD']).trim();

  const decl = {
    stages: [
      ...guardStages('js', ['src']),
      { name: 'suite-green', kind: 'command-exit', params: { cmd: 'node', args: ['-e', 'process.exitCode = 0'], expectExit: 0 } },
    ],
  };
  const { generate } = scriptGenerate([{ declaration: decl }, { declaration: decl }]);
  const r = await authorClose({
    workdir: dir, seedRef: seed, lang: 'js', verdictType: 'green',
    answers: { 1: 'type it' }, scout: { state: 'PRESENT', facts: { sourcePaths: ['src'] }, reason: null, calls: [] },
    closeCtx: { gapKeep: 'REAL:: ' },
    generate,
    // no seedReadFn — the SHIPPED M1 executor is what runs
  });

  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const changed = r.seedRead.find((/** @type {any} */ s) => s.stage === 'changed-from-seed');
  // at its own seed nothing has changed — the guard is RED by construction, and
  // that is precisely why the seed read is never first-red-wins
  assert.equal(changed.verdict, 'red');
  const suite = r.seedRead.find((/** @type {any} */ s) => s.stage === 'suite-green');
  assert.equal(suite.verdict, 'green', 'every stage runs at seed, including the ones after a red');
  assert.equal(r.listing.files.includes('src/email.js'), true, 'the listing was computed from the real tree');
});

// ── 9. THE MODEL BOUNDARY — makeLoopGenerate against the REAL Loop ──────────
//
// The adapter that wires the authoring call onto bare-agent. Everything above
// injects `generate`, so this is the ONE place the real Loop runs, and the three
// things it encodes were each paid for in a live run rather than reasoned out:
//
//   - THE TOOL ENDS THE CALL. `declare_close` is an OUTPUT CHANNEL, not a step in
//     a conversation, so the round that would acknowledge its result has nothing
//     to say and must never be paid for. MEASURED both arms: stop-wired = 1
//     provider round, unwired = 2. The observable is the ROUND COUNT, not the
//     spelling of the wiring.
//   - CACHING IS ON (F18). Caching was silently OFF once and cost 9.4x per round.
//   - THE TOKEN CAP IS OURS (F30). The 4096 provider default cannot hold a whole
//     declaration, and a round cut off at the cap must surface as its OWN outcome
//     — laundering a truncation into a clean empty success is the BA-6 class.
//
// The provider is the seam (a shell-owned binding by design). It records the
// options object it is handed, which is what a flag drop actually looks like from
// the outside: the round happens, and the wire says nothing about caching.

/**
 * A counting provider. One script entry per ROUND (sticks on the last), and every
 * round's `(messages, tools, options)` is recorded — `options` is what `loop.run`
 * forwards verbatim (bare-agent loop.js: `provider.generate(toSend, activeTools, options)`).
 * @param {{text?: string, toolCalls?: any[], stopReason?: string}[]} script
 */
function countingProvider(script) {
  /** @type {{messages: any[], tools: any[], options: any}[]} */
  const rounds = [];
  return {
    name: 'counting',
    rounds,
    async generate(/** @type {any[]} */ messages, /** @type {any[]} */ tools, /** @type {any} */ options) {
      const s = script[Math.min(rounds.length, script.length - 1)] ?? {};
      rounds.push({ messages, tools, options });
      const toolCalls = s.toolCalls ?? [];
      return {
        text: s.text ?? '',
        toolCalls,
        usage: { inputTokens: 10, outputTokens: 10 },
        costUsd: 0.001,
        // the NEUTRAL vocabulary the Loop classifies on (BA-6/BA-13)
        stopReason: s.stopReason ?? (toolCalls.length ? 'tool_use' : 'end_turn'),
        model: 'counting-model',
      };
    },
  };
}

/** the declaration as the model would deliver it: one schema-forced tool call */
const declCall = (/** @type {any} */ declaration, id = 't1') => ([{ id, name: DECLARATION_TOOL_NAME, arguments: declaration }]);

test('makeLoopGenerate: the declaration tool ENDS the call — the acknowledging round is never paid for', async () => {
  /** @type {any} */
  const box = { calls: [] };
  const decl = goodDeclaration();
  const provider = countingProvider([
    { toolCalls: declCall(decl) },
    // the round the wiring exists to prevent: if the loop ever reaches this, the
    // call paid twice for one declaration
    { text: 'thanks, noted' },
  ]);

  const r = await makeLoopGenerate(provider)([{ role: 'user', content: 'author it' }], [declarationTool(box)], {});

  assert.equal(provider.rounds.length, 1, 'ONE provider round per declaration — an unwired tool pays for a second');
  assert.deepEqual(box.calls, [decl], 'the tool still RAN: the stop lands AFTER the result, never instead of it');
  assert.equal(r.error, null,
    'a deliberate stop is not a fault — askDeclaration reads `error` first and would route this as a provider-red');
});

test('makeLoopGenerate: the tool that ends the call is the one the CALLER passed, with its own result', async () => {
  // the wiring wraps `execute`; a wrapper that swallowed the caller's return, or
  // dropped the rest of the tool definition, would break the output channel while
  // still stopping the loop
  /** @type {any} */
  const box = { calls: [] };
  const original = declarationTool(box);
  /** @type {any[]} */
  const wiredSeen = [];
  const provider = {
    name: 'inspecting',
    async generate(/** @type {any[]} */ _m, /** @type {any[]} */ tools) {
      wiredSeen.push(tools);
      return { text: '', toolCalls: [], usage: {}, costUsd: 0.001, stopReason: 'end_turn', model: 'm' };
    },
  };
  await makeLoopGenerate(provider)([{ role: 'user', content: 'x' }], [original], {});

  const wired = wiredSeen[0][0];
  assert.equal(wired.name, DECLARATION_TOOL_NAME, 'the menu the model sees is unchanged');
  assert.deepEqual(wired.parameters, original.parameters, 'the schema is the tool\'s own — the wrapper is not a second one');
  assert.equal(await wired.execute({ stages: [] }), DECLARATION_ACK, 'the caller\'s own result comes back through the wrapper');
  assert.deepEqual(box.calls, [{ stages: [] }], 'and the caller\'s own recorder is the one that filled');
});

test('makeLoopGenerate: F18 caching and the F30 token cap reach the provider, from the shipped constants', async () => {
  /** @type {any} */
  const box = { calls: [] };
  const provider = countingProvider([{ toolCalls: declCall(goodDeclaration()) }]);
  await makeLoopGenerate(provider)([{ role: 'user', content: 'author it' }], [declarationTool(box)], {});

  const { options } = provider.rounds[0];
  assert.equal(options.cacheMessages, true,
    'F18: caching was silently OFF once and cost 9.4x per round — the flag must reach the wire, not just the docstring');
  assert.equal(options.maxTokens, AUTHOR_MAX_TOKENS,
    'F30: the cap is the shipped constant, never a literal that can drift from it');
  assert.ok(AUTHOR_MAX_TOKENS > 4096,
    'F30: the 4096 provider default cannot hold a whole declaration — that is what the constant is FOR');

  // and it is genuinely the option that travels, not a coincidence of defaults
  const other = countingProvider([{ toolCalls: declCall(goodDeclaration()) }]);
  await makeLoopGenerate(other, { maxTokens: 4096 })([{ role: 'user', content: 'x' }], [declarationTool({ calls: [] })], {});
  assert.equal(other.rounds[0].options.maxTokens, 4096);
});

test('makeLoopGenerate: a round CUT OFF at the token cap is its OWN outcome, never a clean empty success', async () => {
  // BA-6's defect class: a truncated round carries no tool call, and "no tool
  // calls ⇒ final answer" would return it as a finished turn with error:null. The
  // authoring flow reads `error` as the sole success signal, so a laundered
  // truncation would arrive as an empty declaration instead of a casualty.
  /** @type {any} */
  const box = { calls: [] };
  const provider = countingProvider([{ text: '{ "stages": [', stopReason: 'max_tokens' }]);
  const r = await makeLoopGenerate(provider)([{ role: 'user', content: 'author it' }], [declarationTool(box)], {});

  assert.equal(r.error, 'truncated:max_tokens', 'the cut-off is NAMED on the channel the caller branches on');
  assert.deepEqual(box.calls, [], 'and nothing was delivered — a half-written declaration is not a declaration');
});

test('makeLoopGenerate: a HALF-WRITTEN declaration on a truncated round is never executed (BA-4)', async () => {
  // the dangerous direction: the round was cut off mid-generation, so the tool
  // call's arguments are missing keys — executing it is how a truncated
  // `shell_write` emptied a 1789-line file. Here it would mint a declaration the
  // model never finished writing, and the validator would judge it on its merits.
  /** @type {any} */
  const box = { calls: [] };
  const provider = countingProvider([
    { toolCalls: declCall({ stages: [{ name: 'changed-from-seed' }] }), stopReason: 'max_tokens' },
  ]);
  const r = await makeLoopGenerate(provider)([{ role: 'user', content: 'author it' }], [declarationTool(box)], {});

  assert.deepEqual(box.calls, [], 'a tool call from a cut-off round is refused, not run');
  assert.equal(r.error, 'truncated:max_tokens');
});

test('makeLoopGenerate: a truncated authoring round routes as provider-red through the flow, not as a declaration defect', async () => {
  // where the distinct outcome has to LAND: a casualty is never evidence about
  // the model (F45), so it must not spend the structure-retry budget that exists
  // for a malformed emission, and it must not read as an artifact-red.
  const provider = countingProvider([{ text: '', stopReason: 'max_tokens' }]);
  const r = await authorClose({ ...baseArgs(), generate: makeLoopGenerate(provider), seedReadFn: scriptSeedRead().fn });

  assert.equal(r.ok, false);
  assert.equal(r.stop, 'provider-red', 'a cut-off round is a transport casualty, never an artifact-red');
  assert.equal(r.reds[0].code, 'provider-red');
  assert.match(r.reds[0].detail, /truncated:max_tokens/);
  assert.equal(r.iterations[0].attempts, 1, 'and it does not burn the malformed-emission retries on its way out');
});

test('makeLoopGenerate: the whole authoring flow pays ONE provider round per call, every one of them cached and capped', async () => {
  // the adapter under the real flow rather than in isolation: two authoring calls
  // (author, then the revise that returns the declaration unchanged), each one a
  // fresh Loop, each one a single paid round.
  const decl = goodDeclaration();
  const provider = countingProvider([{ toolCalls: declCall(decl) }]);
  const { fn, seen } = scriptSeedRead({ typecheck: { verdict: 'red', value: 27, baseline: 0 } });
  const r = await authorClose({ ...baseArgs(), generate: makeLoopGenerate(provider), seedReadFn: fn });

  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.stop, 'unchanged');
  assert.equal(seen.length, 1, 'the declaration really did survive the tool channel and get measured');
  assert.equal(provider.rounds.length, 2, 'two authoring calls, two provider rounds — the acknowledging rounds are never paid');
  for (const [i, round] of provider.rounds.entries()) {
    assert.equal(round.options.cacheMessages, true, `round ${i}: caching must be on for EVERY round, not just the first`);
    assert.equal(round.options.maxTokens, AUTHOR_MAX_TOKENS, `round ${i}: the cap travels with every round`);
    assert.deepEqual(round.tools.map((/** @type {any} */ t) => t.name), [DECLARATION_TOOL_NAME],
      `round ${i}: the authoring call still carries exactly one tool, and it takes no action`);
  }
  // the revise round re-sent the transcript — which is precisely the cost F18's
  // flag exists to bound
  assert.ok(provider.rounds[1].messages.length > provider.rounds[0].messages.length);
});

test('makeCostBook: absorbed and added calls both land, and unknown stays unknown', () => {
  const book = makeCostBook();
  book.absorb([{ label: 'author-scout', costUsd: 0.03, unpricedRounds: 0 }]);
  book.add('author', { metrics: { costUsd: 0.01, unpricedRounds: 0 } });
  assert.equal(book.report().costUsd, 0.04);
  book.add('revise-1', { metrics: { costUsd: 0.01, unpricedRounds: 2 } });
  const r = book.report();
  assert.equal(r.costUsd, null, 'an unpriced round makes the TOTAL unknown');
  assert.equal(r.unpricedRounds, 2);
  assert.equal(r.spendComplete, false);
});

// ── 8b. THE AUTHORING CEILING ────────────────────────────────────────────────
//
// The pipeline metered spend and nothing bounded it: `run-author.mjs` REPORTED a
// total and no number anywhere could stop a call. The ceiling is the operator's
// own, it has NO DEFAULT (a defaulted cap is a silent second ceiling — the
// maxWallMs precedent), and it binds BETWEEN metered calls, which is the only
// seam where stopping is honest: a cap that binds mid-call kills the row before
// it can be graded (F45).

test('makeCostBook: the ceiling is the BOOK\'s, and it reads the same spend the report does', () => {
  const book = makeCostBook({ ceilingUsd: 0.05 });
  assert.equal(book.capStop(), null, 'nothing spent, so nothing is over');
  book.absorb([{ label: 'author-scout', costUsd: 0.03, unpricedRounds: 0 }]);
  assert.equal(book.capStop(), null, 'the scout\'s spend folds in and still fits');
  book.add('author', { metrics: { costUsd: 0.02, unpricedRounds: 0 } });
  assert.equal(book.capStop(), 'cap-halt', 'and the call that reached the cap closes it');
});

test('makeCostBook: NO ceiling is unbounded — a book with no cap never halts', () => {
  const book = makeCostBook();
  book.absorb([{ label: 'author-scout', costUsd: 500, unpricedRounds: 0 }]);
  assert.equal(book.capStop(), null);
  assert.equal(book.ceilingUsd, null, 'and the book says so, rather than carrying a number nobody set');
});

test('authorClose: the ceiling binds BETWEEN calls — the call that would breach it is never made', async () => {
  // distinct declarations are on offer at $0.02 each under a $0.03 ceiling:
  // author (spend 0 → runs, now 0.02), revise-1 (0.02 < 0.03 → runs, now 0.04),
  // revise-2 (0.04 ≥ 0.03) → never asked for. The ceiling is deliberately set to
  // bind BEFORE MAX_REVISIONS would, or the test proves the revision bound works
  // and says nothing at all about the money.
  const decls = Array.from({ length: 4 }, (_, n) => { const d = goodDeclaration(); d.notes = [`n${n}`]; return d; });
  const { generate, calls } = scriptGenerate(decls.map((d) => ({ declaration: d, costUsd: 0.02 })));
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, ceilingUsd: 0.03 });

  assert.ok(MAX_REVISIONS + 1 > 2, 'the fixture only means something while the revision bound is the looser one');
  assert.equal(calls.length, 2, 'two calls fit under the ceiling; the third is refused before it is paid for');
  assert.equal(r.stop, 'cap-halt', 'and the MONEY is what ended it, not the revision count');
  assert.equal(r.cost.costUsd, 0.04, 'the spend that WAS incurred is reported, not the ceiling');
  assert.equal(r.reds[0].code, 'cap-halt');
  assert.match(r.reds[0].detail, /0\.04/, 'the stop names the spend');
  assert.match(r.reds[0].detail, /0\.03/, 'and the cap it is measured against');
  // a governance stop is not a verdict on the close: one was authored and measured
  assert.equal(r.ok, true, 'a close that was already validated and measured survives the money stop');
  assert.equal(r.iterations.length, 2, 'and the partial record is complete — every call that happened is on it');
});

test('authorClose: a ceiling already spent by the SCOUT funds no declaration call at all', async () => {
  const scout = { ...SCOUT_OK, calls: [{ label: 'author-scout', costUsd: 0.30, unpricedRounds: 0 }] };
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration(), costUsd: 0.02 }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), scout, generate, seedReadFn: fn, ceilingUsd: 0.10 });

  assert.equal(calls.length, 0, 'spend already incurred folds in — re-entering cannot widen the ceiling');
  assert.equal(r.stop, 'cap-halt');
  assert.equal(r.ok, false);
  assert.equal(r.iterations.length, 0, 'no iteration is recorded for a call that never happened');
  assert.equal(r.cost.costUsd, 0.30, 'and the scout\'s spend is on the record it was measured against');
});

test('authorClose: a survey the CEILING stopped is named a MONEY stop, never a scout failure', async () => {
  // the scout carries its own governance stop, and it is the honest name for why
  // the facts are missing — `scout-absent` would send the operator to the
  // instrument when the fact is the number they set (W-2's rule, in money)
  const halted = {
    state: 'ABSENT', facts: null, cause: 'not-funded',
    reason: 'the survey was never asked for: the $0.02 ceiling was already spent',
    budgetStop: 'cap-halt',
    calls: [{ label: 'author-scout', costUsd: 0.03, unpricedRounds: 0 }], raws: [],
  };
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({ ...baseArgs(), scout: halted, generate, seedReadFn: scriptSeedRead().fn, ceilingUsd: 0.02 });

  assert.equal(r.stop, 'cap-halt');
  assert.equal(r.reds[0].code, 'cap-halt', 'the money stop outranks the absence it caused');
  assert.match(r.reds[0].detail, /never asked for/, 'and the survey\'s own reason rides along, rather than being replaced');
  assert.equal(calls.length, 0, 'still a $0 refusal — naming it correctly costs nothing');
});

test('authorClose: a ceiling that stopped a survey the TRANSPORT also killed concedes both causes', async () => {
  // the ceiling really did refuse the reserved recovery round — and the call it
  // would have replaced died on a dead socket. Both are true, and a detail that
  // says "not on anything it read" while quoting a transport error in the same
  // sentence contradicts itself and routes the operator at `--budget`, which is
  // the one lever that cannot repair a socket.
  const both = {
    state: 'ABSENT', facts: null, cause: 'call-failed',
    reason: 'the survey call failed: ENETUNREACH',
    budgetStop: 'cap-halt',
    calls: [{ label: 'author-scout', costUsd: 0.03, unpricedRounds: 0 }], raws: [],
  };
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({ ...baseArgs(), scout: both, generate, seedReadFn: scriptSeedRead().fn, ceilingUsd: 0.02 });

  assert.equal(r.stop, 'cap-halt', 'the decided stop does not move — this is attribution, not routing');
  assert.equal(r.reds[0].code, 'cap-halt');
  assert.match(r.reds[0].detail, /ENETUNREACH/, 'the transport error still rides along');
  assert.ok(!/not on anything it read/.test(r.reds[0].detail),
    'and the detail must not DENY the cause it is quoting in the same breath');
  assert.match(r.reds[0].detail, /call itself failed/i, 'the concurrent cause is named, not implied');
  assert.equal(calls.length, 0, 'still a $0 refusal');
});

test('authorClose: an ordinarily ABSENT survey is STILL a scout-absent — the money branch is not a catch-all', async () => {
  // the discriminator for the test above: same absence, no budgetStop, and the
  // scout is correctly blamed
  const absent = { state: 'ABSENT', facts: null, reason: 'the survey did not parse as JSON', budgetStop: null, calls: [], raws: [] };
  const r = await authorClose({ ...baseArgs(), scout: absent, generate: scriptGenerate([{}]).generate, seedReadFn: scriptSeedRead().fn, ceilingUsd: 5 });
  assert.equal(r.stop, 'precheck');
  assert.equal(r.reds[0].code, 'scout-absent');
});

test('authorClose: NO ceiling is UNBOUNDED — spend that would dwarf any cap runs to the revision bound', async () => {
  const decls = Array.from({ length: 6 }, (_, n) => { const d = goodDeclaration(); d.notes = [`n${n}`]; return d; });
  const { generate, calls } = scriptGenerate(decls.map((d) => ({ declaration: d, costUsd: 25 })));
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn });

  assert.equal(calls.length, MAX_REVISIONS + 1, 'nothing bounds the money when nobody set a bound');
  assert.equal(r.stop, 'max-revisions', 'the revision cap is what ends it — never a cap nobody chose');
});

test('authorClose: spend that cannot be KNOWN stops on its OWN axis — unpriced is never $0 (F6)', async () => {
  const decls = [goodDeclaration(), goodDeclaration()];
  decls[1].notes = ['second'];
  const { generate, calls } = scriptGenerate([
    { declaration: decls[0], costUsd: null },
    { declaration: decls[1], costUsd: 0.01 },
  ]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, ceilingUsd: 5 });

  assert.equal(calls.length, 1, 'the cap went blind on call one, so call two is never funded');
  assert.equal(r.stop, 'pricing-red', 'DISTINCT from cap-halt: the money is not gone, the instrument is');
  assert.equal(r.reds[0].code, 'pricing-red');
  assert.equal(r.cost.costUsd, null, 'and the total stays honestly unknown');
  assert.match(r.reds[0].detail, /unpriced/i);
});

test('authorClose: the money stop is DISTINCT from an artifact refusal and from a provider casualty', async () => {
  const { fn } = scriptSeedRead();
  // same ceiling, same money — the difference is what the model did
  const capped = await authorClose({
    ...baseArgs(), seedReadFn: fn, ceilingUsd: 0.01,
    scout: { ...SCOUT_OK, calls: [{ label: 'author-scout', costUsd: 0.02, unpricedRounds: 0 }] },
    generate: scriptGenerate([{ declaration: goodDeclaration() }]).generate,
  });
  const refused = await authorClose({
    ...baseArgs(), seedReadFn: fn, ceilingUsd: 50,
    generate: scriptGenerate([{ text: 'prose only, no tool call' }]).generate,
  });
  const casualty = await authorClose({
    ...baseArgs(), seedReadFn: fn, ceilingUsd: 50,
    generate: scriptGenerate([{ error: 'ENETUNREACH' }]).generate,
  });
  assert.deepEqual(
    [capped.stop, refused.stop, casualty.stop],
    ['cap-halt', 'artifact-red', 'provider-red'],
    'three stops, three names — a governance stop never wears a model failure\'s coat',
  );
});

test('authorClose: the ceiling gates STRUCTURE RETRIES too — every paid call is behind it', async () => {
  // the retry axis buys provider calls exactly as the revision axis does, and it
  // is the axis that fires when the model is malforming — the worst time for a
  // bound to be missing
  const { generate, calls } = scriptGenerate([{ text: 'prose only, no tool call', costUsd: 0.04 }]);
  const { fn } = scriptSeedRead();
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: fn, ceilingUsd: 0.07 });

  assert.ok(MAX_STRUCTURE_RETRIES >= 2, 'the fixture is only meaningful while retries exist to cut short');
  assert.equal(calls.length, 2, 'two retries fit; the third would breach the cap and is never made');
  assert.equal(r.stop, 'cap-halt', 'the money stop outranks the artifact red that was in flight');
  assert.equal(r.ok, false);
});

// ── 9. THE RAW MODEL OUTPUT IS PART OF THE RUN'S AUDIT ──────────────────────
//
// Run mslhn707 wrote an `authored.json` that recorded a $0.053 scout call, a
// `scout-absent` red naming a parse position — and NOT ONE BYTE of what the
// model actually said. `iterations` was `[]` (the flow refuses at $0 preflight,
// before any iteration exists) and it carries no raws even when it does run, so
// the malformation could not be read, only remembered. Raws now ride the
// returned result on EVERY path, through the one scrubbed-persist helper.

test('authorClose: the scout\'s raws survive the $0 preflight refusal — the autopsy outlives the run', async () => {
  const raws = [
    scrubRaw({ label: 'author-scout', attempt: 1, text: '{"language": "javascript",', cause: 'unparseable', reason: 'the survey did not parse as JSON: Expected \',\' at position 26' }),
    scrubRaw({ label: 'author-scout#2', attempt: 2, text: 'still broken', cause: 'unparseable', reason: 'the survey did not parse as JSON' }),
  ];
  const absent = { state: 'ABSENT', facts: null, reason: 'the survey did not parse as JSON — after 2 attempts', calls: [{ label: 'author-scout', costUsd: 0.05, unpricedRounds: 0 }, { label: 'author-scout#2', costUsd: 0.01, unpricedRounds: 0 }], raws };
  const { generate, calls } = scriptGenerate([{ declaration: goodDeclaration() }]);
  const r = await authorClose({ ...baseArgs(), scout: absent, generate, seedReadFn: scriptSeedRead().fn });

  assert.equal(r.ok, false);
  assert.equal(r.stop, 'precheck');
  assert.equal(calls.length, 0, 'the refusal is still $0 — persistence buys evidence, not tokens');
  assert.equal(r.reds[0].code, 'scout-absent');
  assert.deepEqual(r.raws.map((x) => x.label), ['author-scout', 'author-scout#2'], 'what the model said is on the trail, not in the void');
  assert.match(r.raws[0].text, /"language": "javascript",/);
  assert.match(r.raws[0].reason, /position 26/);
});

test('authorClose: every model call on the declaration path persists its raw, paired with the cost book', async () => {
  const bad = goodDeclaration();
  bad.stages[1].params.scope = {}; // a validation red → one revise
  const good = goodDeclaration();
  const { generate } = scriptGenerate([
    { text: 'prose only, no tool call' },
    { declaration: bad, text: 'here is my close' },
    { declaration: good, text: 'corrected' },
  ]);
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn });
  assert.equal(r.ok, true);
  // one raw per metered call, in call order, labels identical — the audit trail
  // and the cost book are two readings of ONE list of calls
  assert.deepEqual(r.raws.map((x) => x.label), r.cost.calls.map((c) => c.label));
  assert.deepEqual(r.raws.map((x) => x.label), ['author', 'author#2', 'revise-1', 'revise-2']);
  assert.match(r.raws[0].text, /prose only, no tool call/, 'the malformed emission is exactly the one worth keeping');
  assert.deepEqual(r.raws.map((x) => x.attempt), [1, 2, 1, 1]);
});

test('authorClose: the scout\'s raws and the declaration\'s raws are ONE trail, in call order', async () => {
  const scoutRaws = [scrubRaw({ label: 'author-scout', attempt: 1, text: 'survey text' })];
  const scout = { ...SCOUT_OK, calls: [{ label: 'author-scout', costUsd: 0.05, unpricedRounds: 0 }], raws: scoutRaws };
  const { generate } = scriptGenerate([{ declaration: goodDeclaration(), text: 'the close' }]);
  const r = await authorClose({ ...baseArgs(), scout, generate, seedReadFn: scriptSeedRead().fn, maxRevisions: 0 });
  assert.deepEqual(r.raws.map((x) => x.label), ['author-scout', 'author']);
  assert.deepEqual(r.raws.map((x) => x.label), r.cost.calls.map((c) => c.label), 'no second trail, and no unpaired call');
});

test('authorClose: a persisted declaration raw is SCRUBBED — masked, never deleted', async () => {
  const fake = ['sk', 'live', 'C1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(fake).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const { generate } = scriptGenerate([{ declaration: goodDeclaration(), text: `I read ANTHROPIC_API_KEY=${fake} in the env file` }]);
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn, maxRevisions: 0 });
  assert.deepEqual(scanSecrets(JSON.stringify(r.raws)), [], 'a record that captures a key captures it forever');
  assert.ok(r.raws.at(-1).text.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(r.raws.at(-1).text, /in the env file/, 'the surrounding text survives — the raw is the autopsy');
});

test('authorClose: a provider casualty still leaves its raw on the trail', async () => {
  const { generate } = scriptGenerate([{ error: 'ENETUNREACH', text: 'partial answer before the socket died' }]);
  const r = await authorClose({ ...baseArgs(), generate, seedReadFn: scriptSeedRead().fn });
  assert.equal(r.stop, 'provider-red');
  assert.deepEqual(r.raws.map((x) => x.label), r.cost.calls.map((c) => c.label));
  assert.match(r.raws[0].text, /partial answer before the socket died/);
});
