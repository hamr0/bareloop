// PLACE RULES: LOOK facts stripped like a call phrase (hamr 2026-11-11 "strip look too"). A look fact whose every week-only word fits a place rule is kept and the
// signed fact carries the bare value(s) and rule(s); a look fact with any word that does not fit is dropped as week-only, as before.
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


const LOOK_WORDS = '## [0.55.0] - 2026-11-04';
const lookOf = (/** @type {string[]} */ words) => ({ facts: [{ line: 1, name: 'version heading', shape: 'phrase', words, source: 'Changelog' }] });

/** the real drafting pipeline on one look fact: the list, then the apply of a drafter plan that copies the look's words */
function draftLook(/** @type {string[]} */ words, /** @type {string} */ log = LOG) {
  const t = { Changelog: log };
  const rows = CL.buildLedger({ jobLines, texts: t, inputLabels: ['Changelog'], look: lookOf(words) });
  const r = CL.applyLedger(decl([phrasePart(words[0], 'version heading')]), rows, { labels: ['Changelog'], texts: t });
  const facts = r.declaration.stages[0].params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts);
  return { rows, r, facts };
}

test('look strip: a look fact "## [0.55.0] - 2026-11-04" is listed and splits into a version and a date place fact', () => {
  const { rows, r, facts } = draftLook([LOOK_WORDS]);
  assert.equal(rows.find((x) => x.from === 'look')?.state, 'listed');
  assert.deepEqual(r.refused, []);
  assert.deepEqual(facts.map((f) => [f.name, f.phrase, f.place]), [['version heading version', '0.55.0', VER], ['version heading date', '2026-11-04', DATE]]);
  const resolved = CL.resolveLedger(rows, r.declaration);
  assert.equal(resolved.find((x) => x.from === 'look')?.state, 'built');
  assert.equal(CL.signedRows(resolved).find((x) => x.from === 'look')?.state, 'built');
  assert.deepEqual(PR.placeFactsOf({ closeDecl: r.declaration }).map((f) => f.key), ['s1/version heading version', 's1/version heading date']);
});

test('look strip: a date or number SHAPE look fact with a version or date stays dropped as week-only', () => {
  for (const [shape, words] of [['date', ['2026-11-04']], ['number', ['0.55.0']]]) {
    const rows = CL.buildLedger({ jobLines, texts, inputLabels: ['Changelog'], look: { facts: [{ line: 1, name: 'v', shape, words, source: 'Changelog' }] } });
    assert.equal(rows.find((x) => x.from === 'look')?.reason, CL.WEEK_ONLY_WORDS, shape);
  }
});

test('look strip: a bare version look fact keeps one fact with the rule', () => {
  const { rows, facts } = draftLook(['0.55.0']);
  assert.equal(rows.find((x) => x.from === 'look')?.state, 'listed');
  assert.deepEqual(facts.map((f) => [f.phrase, f.place]), [['0.55.0', VER]]);
});

test('look strip: an older release look fact is still dropped as week-only', () => {
  for (const words of [['## [0.54.1] - 2026-11-01'], ['## [0.55.0]', '## [0.54.1]']]) {
    const { rows, facts } = draftLook(words);
    const row = rows.find((x) => x.from === 'look');
    assert.equal(row?.state, 'dropped', words.join('|'));
    assert.equal(row?.reason, CL.WEEK_ONLY_WORDS);
    assert.equal(facts.length, 0);
  }
});

// ---- the run: a new top release binds both new values and greens ------------------------------------------------------------------------------
const DRAFT_LOG = '# Changelog\n\n## [0.55.0] - 2026-11-04\n\n- first\n';
const RUN_LOG = '# Changelog\n\n## [0.56.0] - 2026-11-10\n\n- second\n\n## [0.55.0] - 2026-11-04\n\n- first\n';

test('look strip run: a look fact stripped at drafting from the whole heading bind the NEW version and date at run start, and the close greens on the new heading', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'place-strip-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'CHANGELOG.md');
  writeFileSync(file, DRAFT_LOG);
  const d = (() => {
    const phrase = '## [0.55.0] - 2026-11-04';
    const t1 = { changelog: DRAFT_LOG };
    const rows = CL.buildLedger({ jobLines, texts: t1, inputLabels: ['changelog'], look: { facts: [{ line: 1, name: 'newest release', shape: 'phrase', words: [phrase], source: 'changelog' }] } });
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
