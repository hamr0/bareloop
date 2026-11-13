// PLACE RULES on the check block (ported from tests/place-{fit,look,strip,one-owner}.test.js, which drove the deleted buildLedger/applyLedger/resolveLedger): a version or an ISO date is true only today,
// so a row whose words hold one is built ONLY as the place value(s) a place rule fits on the input's own newest heading (`how: 'place'`), else it is Not checked with the week-only words.
// One owner of the decision (hamr 2026-11-11): the row alone; only the person's own `~` rule text naming the token keeps fixed words. The AI's edit has no `place` field: the rule is code's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckBlock } from '../src/checkblock.js';
import { WEEK_ONLY_WORDS, weekOnly } from '../src/checklist.js';
import * as PR from '../src/placerule.js';
import { factShapeReds } from '../src/facts.js';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { scriptedProvider, readSpine } from './helpers.js';

const LOG = '# Changelog\n\n## [Unreleased]\n\n## [0.55.0] - 2026-11-04\n\n### Fixed\n- one\n\n## [0.54.1] - 2026-11-01\n';
const jobLines = [{ n: 1, text: 'Quote the newest release', rule: '', rules: [] }];
const VER = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const DATE = { kind: 'headingDateAfter', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const factsOf = (/** @type {any} */ c) => c.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts);

/** the real pipeline on one AI `add` of a phrase: the block judges the edit, matches the row on the page, builds */
function draft(/** @type {string} */ phrase, /** @type {string} */ log = LOG, name = 'newest release') {
  const block = new CheckBlock({ texts: { Changelog: log }, labels: ['Changelog'] });
  block.fromJob(jobLines);
  block.addLook([]);
  const rec = block.applyDelta({ edits: [{ op: 'add', kind: 'phrase', line: 1, name, source: 'Changelog', words: [phrase] }] });
  const close = block.reconcile();
  return { block, rec, close, facts: factsOf(close), row: block.rows.find((r) => r.kind === 'phrase') };
}
/** the same on one LOOK fact */
function draftLook(/** @type {string[]} */ words, /** @type {string} */ log = LOG) {
  const block = new CheckBlock({ texts: { Changelog: log }, labels: ['Changelog'] });
  block.fromJob(jobLines);
  block.addLook([{ line: 1, name: 'version heading', shape: 'phrase', words, source: 'Changelog' }]);
  const close = block.reconcile();
  return { block, close, facts: factsOf(close), row: block.rows.find((r) => r.from === 'look') };
}

// ---- P1: a phrase the input proves and a place rule fits is built; one with no fit is Not checked with the week-only words ------------------------------------
test('P1 a week-only phrase the input proves and a place rule fits is BUILT (how place, the signed shape validates); one with no fit is Not checked with WEEK_ONLY_WORDS', () => {
  const ok = draft('0.55.0');
  assert.equal(ok.row?.state, 'built');
  assert.equal(ok.row?.can.how, 'place');
  const f = ok.facts[0];
  assert.equal(f.phrase, '0.55.0', 'the drafting words stay as the example');
  assert.deepEqual(f.place, VER);
  /** @type {string[]} */ const reds = [];
  factShapeReds(ok.close.parts.find((/** @type {any} */ p) => p.class === 'fact'), 'p', (code, path, detail) => reds.push(`${code} ${path} ${detail}`));
  assert.deepEqual(reds, []);
  // an older release the input holds (in a bullet) fits no rule: the first heading is not that value
  const nofit = draft('0.54.1', `${LOG}\n- shipped 0.54.1 earlier\n`);
  assert.equal(nofit.row?.state, 'not-checked');
  assert.equal(nofit.row?.reason, WEEK_ONLY_WORDS);
  assert.equal(nofit.facts.length, 0);
  // a date the input holds but no rule fits (only the older one is in the words)
  const old = draft('2026-11-01');
  assert.equal(old.row?.reason, WEEK_ONLY_WORDS);
  assert.equal(old.close.parts.some((/** @type {any} */ p) => p.class === 'fact'), false);
});

test('P1 the AI\'s edit has no place field: a place a reply carries is ignored, the signed rule is code\'s (fail-first on a mutant that copies it)', () => {
  const block = new CheckBlock({ texts: { Changelog: LOG }, labels: ['Changelog'] });
  block.fromJob(jobLines);
  block.applyDelta({ edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'version', source: 'Changelog', words: ['0.55.0'], place: { kind: 'line-prefix', prefix: '# ' } }] });
  const f = factsOf(block.reconcile())[0];
  assert.deepEqual(f.place, VER);
  assert.equal(JSON.stringify(f.place).includes('line-prefix'), false);
});

// ---- the look's facts, stripped the same way -----------------------------------------------------------------------------------------------------------------
const LOOK_WORDS = '## [0.55.0] - 2026-11-04';
test('look strip: a look fact "## [0.55.0] - 2026-11-04" is built and splits into a version and a date place fact (plain split names)', () => {
  const { row, facts, close, block } = draftLook([LOOK_WORDS]);
  assert.equal(row?.state, 'built');
  assert.deepEqual(facts.map((f) => [f.name, f.phrase, f.place]), [['heading version', '0.55.0', VER], ['heading date', '2026-11-04', DATE]]);
  assert.equal(block.signedRows().find((x) => x.from === 'look')?.state, 'built');
  assert.deepEqual(PR.placeFactsOf({ closeDecl: { stages: close.stages } }).map((f) => f.key), ['line-1/heading version', 'line-1/heading date']);
});

test('look strip: a date or number SHAPE look fact with a version or date stays Not checked as week-only', () => {
  for (const shape of ['date', 'number']) {
    const block = new CheckBlock({ texts: { Changelog: LOG }, labels: ['Changelog'] });
    block.fromJob(jobLines);
    block.addLook([{ line: 1, name: 'v', shape, words: [shape === 'date' ? '2026-11-04' : '0.55.0'], source: 'Changelog' }]);
    block.reconcile();
    assert.equal(block.rows.find((x) => x.from === 'look')?.reason, WEEK_ONLY_WORDS, shape);
  }
});

test('look strip: a bare version look fact keeps one fact with the rule; an older release look fact is Not checked as week-only', () => {
  const { row, facts } = draftLook(['0.55.0']);
  assert.equal(row?.state, 'built');
  assert.deepEqual(facts.map((f) => [f.phrase, f.place]), [['0.55.0', VER]]);
  for (const words of [['## [0.54.1] - 2026-11-01'], ['## [0.55.0]', '## [0.54.1]']]) {
    const o = draftLook(words);
    assert.equal(o.row?.state, 'not-checked', words.join('|'));
    assert.equal(o.row?.reason, WEEK_ONLY_WORDS);
    assert.equal(o.facts.length, 0);
  }
});

// ---- P1b: strip a heading piece to its value(s) ---------------------------------------------------------------------------------------------------------------
for (const [words, value, rule] of /** @type {[string, string, any][]} */ ([
  ['## [0.55.0]', '0.55.0', VER], ['[0.55.0]', '0.55.0', VER], ['[0.55.0] -', '0.55.0', VER], ['0.55.0', '0.55.0', VER], ['2026-11-04', '2026-11-04', DATE],
])) {
  test(`P1b strip: "${words}" fits and signs the bare value ${value}`, () => {
    const { row, rec, facts, close } = draft(words);
    assert.deepEqual(rec.edits.map((e) => e.accepted), [true]);
    assert.equal(row?.state, 'built');
    assert.equal(facts.length, 1);
    assert.equal(facts[0].phrase, value);
    assert.equal(facts[0].name, 'newest release');
    assert.deepEqual(facts[0].place, rule);
    /** @type {string[]} */ const reds = [];
    factShapeReds(close.parts.find((/** @type {any} */ p) => p.class === 'fact'), 'p', (code, path, detail) => reds.push(`${code} ${path} ${detail}`));
    assert.deepEqual(reds, []);
  });
}

test('P1b strip: the whole heading line becomes TWO phrase facts (version, date), each with its own rule, and the row ends built and points at its part', () => {
  const { block, facts, row } = draft('## [0.55.0] - 2026-11-04');
  assert.deepEqual(facts.map((f) => [f.name, f.phrase, f.place]), [['newest release version', '0.55.0', VER], ['newest release date', '2026-11-04', DATE]]);
  assert.equal(row?.state, 'built');
  assert.deepEqual(row?.part, { line: 1, part: 0 });
  assert.deepEqual(block.signedRows().find((x) => x.kind === 'phrase')?.state, 'built');
  assert.deepEqual(PR.placeFactsOf({ closeDecl: { stages: block.closeCache.stages } }).map((f) => f.key), ['line-1/newest release version', 'line-1/newest release date']);
});

test('P1b strip refused as week-only: an older release, two versions, two dates, a sentence, a date off the first heading', () => {
  for (const words of ['## [0.54.1]', '0.54.1 - 0.55.0', '2026-11-01 2026-11-04', 'Release 0.55.0 shipped', '## [0.55.0] - 2026-11-01', 'version 0.55.0']) {
    // the words are in the input (so they are refused as week-only, not as "not in the input")
    const { row, facts, rec } = draft(words, `${LOG}\n- ${words}\n`);
    assert.equal(rec.edits[0].accepted, true, words);
    assert.equal(row?.state, 'not-checked', words);
    assert.equal(row?.reason, WEEK_ONLY_WORDS, words);
    assert.equal(facts.length, 0, words);
  }
});

test('P1b strip: a split that would reuse a sibling fact name is not placed (the row is Not checked, the name said plainly; by design its reason is the block\'s, not week-only)', () => {
  const block = new CheckBlock({ texts: { Changelog: LOG }, labels: ['Changelog'] });
  block.fromJob(jobLines);
  block.applyDelta({ edits: [
    { op: 'add', kind: 'phrase', line: 1, name: 'newest release date', source: 'Changelog', words: ['### Fixed'] },
    { op: 'add', kind: 'phrase', line: 1, name: 'newest release', source: 'Changelog', words: ['## [0.55.0] - 2026-11-04'] },
  ] });
  block.reconcile();
  const split = block.rows.find((r) => r.words?.[0] === '## [0.55.0] - 2026-11-04');
  assert.equal(split?.state, 'not-checked');
  assert.match(String(split?.reason), /used twice/);
});

// split names (hamr 2026-11-11 "fix it"): the words version, date and "and" leave the base name before " version"/" date" is appended (live: "release version version")
for (const [name, want] of /** @type {[string, string[]][]} */ ([
  ['release version', ['release version', 'release date']],
  ['newest release version and date', ['newest release version', 'newest release date']],
  ['version and date', ['version', 'date']],
  ['release heading', ['release heading version', 'release heading date']],
])) {
  test(`split names: "${name}" -> ${want.join(' + ')}`, () => {
    const { facts, rec } = draft('## [0.55.0] - 2026-11-04', LOG, name);
    assert.deepEqual(rec.edits.map((e) => e.accepted), [true]);
    assert.deepEqual(facts.map((f) => f.name), want);
  });
}

// ---- one owner of the week-only decision ---------------------------------------------------------------------------------------------------------------------
const FX = new URL('./fixtures/place-live-smwcirsot84mn/', import.meta.url);
const read = (/** @type {string} */ f) => readFileSync(new URL(f, FX), 'utf8');

test('live smwcirsot84mn: the "version" fact is signed as a place value (0.54.1), no fixed phrase, though a ~ rule (at most 80 words) is on the line', () => {
  const TEXT = read('CHANGELOG.md');
  const decl0 = JSON.parse(read('declaration.json'));
  const block = new CheckBlock({ texts: { Changelog: TEXT }, labels: ['Changelog'] });
  block.fromJob(decl0.jobLines.map((/** @type {any} */ l) => ({ n: l.n, text: l.text, rules: l.rules })));
  // the live look's two facts (the saved ledger rows): the version, and the changes summary tied to rule 1
  block.addLook([{ line: 1, name: 'version', shape: 'phrase', source: 'Changelog', words: ['0.54.1'] }, { line: 1, name: 'changes summary', shape: 'phrase', source: 'Changelog', words: ['Fixed'], forRule: 1 }]);
  block.carry({ picks: [{ line: 1, rule: 1, check: { rule: 'maxWords', value: 80 } }] });
  const facts = factsOf(block.reconcile());
  const v = facts.find((f) => f.name === 'version');
  assert.ok(v, 'the version fact is signed');
  assert.equal(v.phrase, '0.54.1');
  assert.ok(v.place && typeof v.place === 'object', 'it carries a place rule, so it is not fixed');
  assert.equal(PR.readPlace(v.place, TEXT).value, '0.54.1');
  assert.ok(!facts.some((f) => weekOnly(f.phrase) && !f.place), 'no fixed week-only phrase is signed');
});

test('a week-only fact no row of the person\'s own names: an unrelated ~ rule does not exempt it (refused as week-only when no place rule fits)', () => {
  const block = new CheckBlock({ texts: { Changelog: `${LOG}\n- shipped 0.54.1 earlier\n` }, labels: ['Changelog'] });
  block.fromJob([{ n: 1, text: 'Summarise', rules: ['at most 80 words'] }]);
  block.carry({ picks: [{ line: 1, rule: 1, check: { rule: 'maxWords', value: 80 } }] });
  block.applyDelta({ edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'release version', source: 'Changelog', words: ['0.54.1'] }] });
  block.reconcile();
  const row = block.rows.find((r) => r.kind === 'phrase');
  assert.equal(row?.reason, WEEK_ONLY_WORDS);
  assert.deepEqual(factsOf(block.closeCache), []);
});

test('a look fact tied to a ~ rule whose TEXT names the token keeps the person\'s fixed words; a tied fact the rule does not name is placed or Not checked', () => {
  const mk = (/** @type {string} */ rule, /** @type {string} */ log) => {
    const b = new CheckBlock({ texts: { Changelog: log }, labels: ['Changelog'] });
    b.fromJob([{ n: 1, text: 'Say the version', rules: [rule] }]);
    b.addLook([{ line: 1, name: 'release version', shape: 'phrase', source: 'Changelog', words: ['0.54.1'], forRule: 1 }]);
    return { b, close: b.reconcile() };
  };
  const named = mk('the version must say 0.54.1', `${LOG}\n- shipped 0.54.1 earlier\n`);
  assert.deepEqual(factsOf(named.close), [{ name: 'release version', shape: 'phrase', phrase: '0.54.1' }]);
  const unnamed = mk('the version', `${LOG}\n- shipped 0.54.1 earlier\n`);
  assert.deepEqual(factsOf(unnamed.close), []);
  assert.equal(unnamed.b.rows.find((r) => r.kind === 'rule')?.reason, WEEK_ONLY_WORDS);
  const placed = mk('the version', LOG.replace('0.55.0', '0.54.1'));
  assert.ok(factsOf(placed.close)[0]?.place);
});

test('split version/date look facts each get a place rule for their own value (a fact whose words hold only the date builds only the date)', () => {
  const block = new CheckBlock({ texts: { Changelog: LOG }, labels: ['Changelog'] });
  block.fromJob(jobLines);
  block.addLook([{ line: 1, name: 'v', shape: 'phrase', source: 'Changelog', words: ['0.55.0'] }, { line: 1, name: 'd', shape: 'phrase', source: 'Changelog', words: ['2026-11-04'] }]);
  const facts = factsOf(block.reconcile());
  assert.deepEqual(facts.map((f) => [f.name, f.phrase]), [['v', '0.55.0'], ['d', '2026-11-04']]);
  assert.ok(facts.every((f) => f.place));
});

// ---- the run: a new top release binds both new values and greens ------------------------------------------------------------------------------------------------
const DRAFT_LOG = '# Changelog\n\n## [0.55.0] - 2026-11-04\n\n- first\n';
const RUN_LOG = '# Changelog\n\n## [0.56.0] - 2026-11-10\n\n- second\n\n## [0.55.0] - 2026-11-04\n\n- first\n';

for (const [label, kind] of /** @type {[string, 'look'|'add'][]} */ ([['look strip run: a look fact stripped at drafting from the whole heading', 'look'], ['P1b run: facts stripped at drafting from the whole heading', 'add']])) {
  test(`${label} bind the NEW version and date at run start, and the close greens on the new heading`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'place-strip-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, 'CHANGELOG.md');
    writeFileSync(file, DRAFT_LOG);
    const d = (() => {
      const phrase = '## [0.55.0] - 2026-11-04';
      const b = new CheckBlock({ texts: { changelog: DRAFT_LOG }, labels: ['changelog'] });
      b.fromJob(jobLines);
      if (kind === 'look') b.addLook([{ line: 1, name: 'newest release', shape: 'phrase', words: [phrase], source: 'changelog' }]);
      else { b.addLook([]); b.applyDelta({ edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'newest release', source: 'changelog', words: [phrase] }] }); }
      return { ...b.reconcile().parts.find((/** @type {any} */ p) => p.class === 'fact'), text: 'Quote the newest release heading' };
    })();
    assert.equal(d.facts.length, 2);
    const spec = {
      schema: 'job-v1', job: 'newest-release', description: 'strip fixture.', provider: 'anthropic-api',
      cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/'],
      goal: 'Quote the newest release heading of the changelog.', verdictType: 'soft-green', escalation: { mode: 'decision-ready' },
      jobLines: [{ n: 1, text: 'Quote the newest release heading', rule: '' }],
      inputs: [{ n: 1, label: 'changelog', value: file }],
      closeDecl: { genre: 'TEXT', lang: 'text', stages: [
        { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
        { name: 'line-1-newest-release', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [d] } },
      ] },
    };
    const specPath = join(dir, 'resolved-spec.json');
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    writeFileSync(file, RUN_LOG);
    const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'changelog', value: file }], into: join(dir, 'source-seed') });
    if (!prep.ok) throw new Error(JSON.stringify(prep));
    const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json',
      exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'line-1-newest-release' }] }] });
    const provider = scriptedProvider([
      { text: 'input/CHANGELOG.md holds the changelog' }, { text: plan },
      { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: `${JSON.stringify({ results: [{ quote: '## [0.56.0] - 2026-11-10', values: {} }] })}\n` } }] },
      { text: 'wrote' },
    ]);
    const home = mkdtempSync(join(tmpdir(), 'place-strip-home-'));
    t.after(() => rmSync(home, { recursive: true, force: true }));
    /** @type {string[]} */ const err = [];
    /** @type {string[]} */ const out = [];
    const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: (s) => out.push(String(s)), err: (s) => err.push(String(s)), runlistHome: home });
    assert.equal(rc, 0, `${err.join('\n')}\n${out.join('\n')}`);
    const events = readSpine(readRunList({ home }).rows[0].spine);
    assert.equal(events.findLast((e) => e.type === 'job-end').outcome, 'green');
    const rec = events.findLast((e) => e.type === 'place-rules');
    assert.deepEqual(rec.rows.map((/** @type {any} */ r) => [r.key.split('/').pop(), r.value, r.was]), [['newest release version', '0.56.0', '0.55.0'], ['newest release date', '2026-11-10', '2026-11-04']]);
  });
}
