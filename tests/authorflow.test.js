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
  KIND_CATALOGUE, CATALOGUE_LIVE_KINDS, LOCKED_KINDS, MAX_STAGES,
  DIRECTIONS, BASELINES, genreGuards, genreOwnedEnvNames, validateDeclaration,
} from '../src/authoring.js';
import {
  DECLARATION_TOOL_NAME, MAX_REVISIONS, MAX_STRUCTURE_RETRIES, REVISE_GAP_CAP, REVISE_RED_CAP,
  REVISE_INSTRUCTION, STRUCTURE_INSTRUCTION_TOOL, TYPES_QUESTIONS,
  PARAM_SCHEMAS, schemaCoverage, declarationSchema, declarationTool,
  catalogueBlock, lawsBlock, authorPrompt,
  renderSeedReadBlock, renderRejectBlock, buildReviseTurn, assertReviseTurn,
  applyGenreEnv, resolveSourcePrefixes, makeCostBook, authorClose,
} from '../src/authorflow.js';
import { scanSecrets } from '../src/validate.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

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
  return genreGuards(lang).map((g) => ({
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
  workdir: '/patient', seedRef: 'seedsha', lang: /** @type {'js'} */ ('js'),
  answers: { 1: 'stop the type checker complaining', 2: 'src/email.js and src/backup.js' },
  scout: SCOUT_OK,
  listing: { files: [...LISTING], block: 'FILES THAT ACTUALLY EXIST AT THE SEED\n  src/email.js', meta: { tier: 'full', totalSeedFiles: LISTING.length, entries: [] }, stop: null },
  closeCtx: { gapKeep: 'TEST:: ' },
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
    answers: baseArgs().answers, questions: TYPES_QUESTIONS, facts: FACTS,
    listingBlock: 'FILES THAT ACTUALLY EXIST', lang: 'js', guards: genreGuards('js'),
    ownedEnvNames: genreOwnedEnvNames('js'),
  });
  assert.match(p, /The graded instrument is the STRICT form/, 'the frozen TYPES template is law for the declaration');
  for (const k of CATALOGUE_LIVE_KINDS) assert.ok(p.includes(k), `the catalogue must name ${k}`);
  assert.match(p, /@ts-expect-error/, 'the guard battery arrives fully parameterised — genre property, not model-filled');
  assert.match(p, /<FILL IN>/, 'the one model-filled slot is marked');
  assert.match(p, new RegExp(DECLARATION_TOOL_NAME), 'the output contract is the tool, never a fenced block');
  assert.ok(!p.includes('```'), 'nothing asks for a fenced JSON block in tool mode');
});

test('the prompt announces the genre-owned environment so the model does not author it', () => {
  const p = authorPrompt({
    answers: {}, questions: TYPES_QUESTIONS, facts: FACTS, listingBlock: '', lang: 'python',
    guards: genreGuards('python'), ownedEnvNames: genreOwnedEnvNames('python'),
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
    listing: [...LISTING], guards: genreGuards('js'), envOwned: ['MYPYPATH'], envInjected: { MYPYPATH: 'src' },
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
  await authorClose({ ...baseArgs(), generate, seedReadFn: fn });

  const turn = calls[1].messages.at(-1).content;
  assert.match(turn, /MEASURED VALIDATION/, 'the reject block is what was fed back');
  assert.deepEqual(scanSecrets(turn), [], 'a secret in a validation red must never cross the network');
  assert.ok(turn.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(turn, /cmd-denied at stages\[1\]\.params\.cmd/);
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
    workdir: dir, seedRef: seed, lang: 'js',
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
