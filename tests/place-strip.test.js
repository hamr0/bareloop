// PLACE RULES, P1b (hamr ruling "strip it", 2026-11-11): at drafting, code STRIPS a phrase that is a piece of the newest release heading to its value(s); the
// signed fact carries the bare value and its place rule. A phrase with a version AND a date becomes TWO phrase facts ("<name> version", "<name> date"), each
// with its own rule. Two versions, two dates, a sentence, or a value that is not at the first release heading are refused as week-only, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as CL from '../src/checklist.js';
import * as PR from '../src/placerule.js';
import { factShapeReds } from '../src/facts.js';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { scriptedProvider, readSpine } from './helpers.js';

const LOG = '# Changelog\n\n## [Unreleased]\n\n## [0.55.0] - 2026-11-04\n\n### Fixed\n- one\n\n## [0.54.1] - 2026-11-01\n';
const texts = { Changelog: LOG };
const jobLines = [{ n: 1, text: 'Quote the newest release', rule: '', rules: [] }];
const decl = (/** @type {any[]} */ parts) => ({ genre: 'TEXT', lang: 'text', stages: [{ name: 's1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }] });
const phrasePart = (/** @type {string} */ phrase, name = 'newest release') => ({ text: 'f', class: 'fact', source: 'Changelog', facts: [{ name, shape: 'phrase', phrase }] });
const VER = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const DATE = { kind: 'headingDateAfter', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };

/** the real drafting pipeline on one phrase: the list, then the apply */
function draft(/** @type {string} */ phrase, /** @type {string} */ log = LOG) {
  const t = { Changelog: log };
  const rows = CL.buildLedger({ jobLines, texts: t, inputLabels: ['Changelog'], extra: [{ line: 1, kind: 'phrase', phrase, source: 'Changelog' }] });
  const r = CL.applyLedger(decl([phrasePart(phrase)]), rows, { labels: ['Changelog'], texts: t });
  const facts = r.declaration.stages[0].params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts);
  return { rows, r, facts };
}

for (const [words, value, rule] of /** @type {[string, string, any][]} */ ([
  ['## [0.55.0]', '0.55.0', VER], ['[0.55.0]', '0.55.0', VER], ['[0.55.0] -', '0.55.0', VER], ['0.55.0', '0.55.0', VER], ['2026-11-04', '2026-11-04', DATE],
])) {
  test(`P1b strip: "${words}" fits and signs the bare value ${value}`, () => {
    const { rows, r, facts } = draft(words);
    assert.equal(rows.find((x) => x.kind === 'phrase')?.state, 'listed');
    assert.deepEqual(r.refused, []);
    assert.equal(facts.length, 1);
    assert.equal(facts[0].phrase, value);
    assert.equal(facts[0].name, 'newest release');
    assert.deepEqual(facts[0].place, rule);
    /** @type {string[]} */ const reds = [];
    factShapeReds(r.declaration.stages[0].params.parts[0], 'p', (code, path, detail) => reds.push(`${code} ${path} ${detail}`));
    assert.deepEqual(reds, []);
  });
}

test('P1b strip: the whole heading line becomes TWO phrase facts (version, date), each with its own rule, and the resolved list still builds the row', () => {
  const { rows, r, facts } = draft('## [0.55.0] - 2026-11-04');
  assert.deepEqual(r.refused, []);
  assert.deepEqual(facts.map((f) => [f.name, f.phrase, f.place]), [['newest release version', '0.55.0', VER], ['newest release date', '2026-11-04', DATE]]);
  assert.equal(r.units, 1, 'the drafted unit count is the one fact the drafter wrote');
  const resolved = CL.resolveLedger(rows, r.declaration);
  const row = resolved.find((x) => x.kind === 'phrase');
  assert.equal(row?.state, 'built');
  assert.deepEqual(row?.part, { line: 1, part: 0 });
  assert.equal(CL.signedRows(resolved).find((x) => x.kind === 'phrase')?.state, 'built');
  assert.deepEqual(PR.placeFactsOf({ closeDecl: r.declaration }).map((f) => f.key), ['s1/newest release version', 's1/newest release date']);
});

test('P1b strip refused as week-only: an older release, two versions, two dates, a sentence, a date off the first heading', () => {
  for (const words of ['## [0.54.1]', '0.54.1 - 0.55.0', '2026-11-01 2026-11-04', 'Release 0.55.0 shipped', '## [0.55.0] - 2026-11-01', 'version 0.55.0']) {
    // the words are in the input (so they are refused as week-only, not as "not in the input")
    const { rows, r, facts } = draft(words, `${LOG}\n- ${words}\n`);
    const row = rows.find((x) => x.kind === 'phrase');
    assert.equal(row?.state, 'dropped', words);
    assert.equal(row?.reason, CL.WEEK_ONLY_WORDS, words);
    assert.equal(facts.length, 0, words);
    assert.ok(r.refused.every((x) => x.reason === 'week-only'), words);
  }
});

test('P1b strip: a split that would reuse a sibling fact name is not placed (stays week-only)', () => {
  const rows = CL.buildLedger({ jobLines, texts, inputLabels: ['Changelog'], extra: [{ line: 1, kind: 'phrase', phrase: '## [0.55.0] - 2026-11-04', source: 'Changelog' }] });
  const part = { text: 'f', class: 'fact', source: 'Changelog', facts: [{ name: 'newest release', shape: 'phrase', phrase: '## [0.55.0] - 2026-11-04' }, { name: 'newest release date', shape: 'phrase', phrase: '## [0.55.0] - 2026-11-04' }] };
  const r = CL.applyLedger(decl([part]), rows, { labels: ['Changelog'], texts });
  assert.ok(r.refused.length > 0);
});

// ---- the run: a new top release binds both new values and greens ------------------------------------------------------------------------------
const DRAFT_LOG = '# Changelog\n\n## [0.55.0] - 2026-11-04\n\n- first\n';
const RUN_LOG = '# Changelog\n\n## [0.56.0] - 2026-11-10\n\n- second\n\n## [0.55.0] - 2026-11-04\n\n- first\n';

test('P1b run: facts stripped at drafting from the whole heading bind the NEW version and date at run start, and the close greens on the new heading', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'place-strip-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'CHANGELOG.md');
  writeFileSync(file, DRAFT_LOG);
  const d = (() => {
    const phrase = '## [0.55.0] - 2026-11-04';
    const t1 = { changelog: DRAFT_LOG };
    const rows = CL.buildLedger({ jobLines, texts: t1, inputLabels: ['changelog'], extra: [{ line: 1, kind: 'phrase', phrase, source: 'changelog' }] });
    const part = { text: 'Quote the newest release heading', class: 'fact', source: 'changelog', facts: [{ name: 'newest release', shape: 'phrase', phrase }] };
    return CL.applyLedger(decl([part]), rows, { labels: ['changelog'], texts: t1 }).declaration.stages[0].params.parts[0];
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
