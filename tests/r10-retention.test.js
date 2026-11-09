// R10 tick 7 (PRD v1.131): a RETENTION record per rubric draft: per job line, how many of the AI's page checks the drafter wrote (`aiParts`), how many are still in the final
// declaration (`kept`), how many code removed (`dropped`), and whether the line has code-matched count picks. Record only: no model, no UI, $0. The declarations are real
// (tests/fixtures/r10-sourcefill-drafts.json, refused tries of paid round 4); the whole loop runs on real bareguard with a scripted drafter.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cp from '../src/checkpick.js';
import { authorClose, GREEN_QUESTIONS, DECLARATION_TOOL_NAME } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(HERE, 'fixtures', 'r10-sourcefill-drafts.json'), 'utf8'));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'r10-retention-')); made.push(d); return d; };
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words'] }, { n: 2, text: 'Say hello', rules: [] }];
const step = (n, parts) => ({ name: `line-${n}`, kind: 'rubric-step', fromLine: [n], params: { step: n, parts } });
const fact = (name) => ({ class: 'fact', source: 'Changelog', text: name, facts: [{ name, shape: 'phrase', phrase: '### Fixed' }] });
const cited = () => ({ class: 'countable', check: 'cited', source: 'Changelog', text: 'a quote' });

test('retentionOf: counts the fact units and cited parts the drafter wrote per line, what is still there, what code removed, and whether the line has picks', () => {
  const drafted = { stages: [step(1, [fact('a'), fact('b'), cited(), { class: 'judged', text: 'nice' }]), step(2, [fact('c')])] };
  const final = { stages: [step(1, [{ ...fact('a'), facts: [fact('a').facts[0], fact('b').facts[0]] }]), step(2, [fact('c')])], picks: [{ line: 1, part: { check: 'listItems', value: 3 } }] };
  assert.deepEqual(cp.retentionOf(drafted, final, jobLines), [
    { line: 1, aiParts: 4, kept: 2, dropped: 2, picks: true },
    { line: 2, aiParts: 1, kept: 1, dropped: 0, picks: false },
  ]);
});

test('retentionOf: a merge of two fact parts keeps both facts (nothing dropped); a real draft (round 4 d8, three fact parts, one pick pair) counts exactly', () => {
  const d = FX['d8-r4-revise-2'].declaration;
  const lines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words'] }];
  const rec = cp.retentionOf(d, d, lines);
  assert.deepEqual(rec, [{ line: 1, aiParts: 3, kept: 3, dropped: 0, picks: false }]);
});

test('retentionOf: nothing to read gives no lines', () => {
  assert.deepEqual(cp.retentionOf(null, null, jobLines), []);
  assert.deepEqual(cp.retentionOf({ stages: [] }, { stages: [] }, []), []);
});

test('authorClose: a rubric draft ends with ONE draft-retention phase carrying the per-line counts (a judged part the code moved counts as dropped; the pick counts as picks)', async () => {
  const file = join(tmp(), 'CHANGELOG.md'); copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const prep = proved.prep;
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  const line = { n: 1, text: 'Summarise the latest release', rule: 'under 80 words', rules: ['under 80 words', 'at most 80 words'] };
  const generate = async (/** @type {any} */ _m, /** @type {any} */ tools) => {
    await tools.find((/** @type {any} */ t) => t.name === DECLARATION_TOOL_NAME).execute({ stages: [guard, step(1, [cited(), { class: 'judged', text: 'is a good summary', rules: [] }])] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const checkPicks = { rules: [{ line: 1, rule: 1, text: 'under 80 words' }], picks: [{ line: 1, rule: 1, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }], left: [] };
  /** @type {any[]} */ const phases = [];
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Summarise the latest release' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [line], inputs: [{ n: 1, label: 'Changelog', value: file }], checkPicks,
    onPhase: (/** @type {string} */ name, /** @type {any} */ data) => phases.push({ name, data }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const got = phases.filter((p) => p.name === 'draft-retention');
  assert.equal(got.length, 1, 'one record per draft');
  assert.deepEqual(got[0].data.lines, [{ line: 1, aiParts: 2, kept: 1, dropped: 1, picks: true }]);
});

test('wiring: the panel session writes the phase into the drafting log as one `retention` line (same writer as the call lines)', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'panel', 'authorsession.js'), 'utf8');
  assert.match(src, /name === 'draft-retention'[\s\S]{0,200}appendDraftLog\(outDir, \{ kind: 'retention'/);
});
