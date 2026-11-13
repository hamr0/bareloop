// R10 tick 7 (PRD v1.131): a RETENTION record per rubric draft: per job line, how many of the agent's page checks there were (`aiParts`), how many ended built (`kept`), how many did not (`dropped`),
// and whether the line has a built pick. Read from the check block's rows (`block.retention()`), record only: no model, no UI, $0. (retentionOf, which read an AI-written declaration pair, is deleted;
// its counts are tested on the block in tests/checkblock.test.js and tests/checklist-views.test.js.)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorClose, GREEN_QUESTIONS } from '../src/authorflow.js';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'r10-retention-')); made.push(d); return d; };
test('authorClose: a rubric draft ends with ONE draft-retention phase carrying the per-line counts read from the block rows (the agent\'s default cited row counts as kept; the pick counts as picks)', async () => {
  const file = join(tmp(), 'CHANGELOG.md'); copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const prep = proved.prep;
  const line = { n: 1, text: 'Summarise the latest release', rule: 'under 80 words', rules: ['under 80 words', 'at most 80 words'] };
  const generate = async (/** @type {any} */ _m, /** @type {any} */ tools) => {
    await tools.find((/** @type {any} */ t) => t.name === ROW_EDIT_TOOL).execute({ edits: [] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const block = new CheckBlock({ texts: { Changelog: 'x' }, labels: ['Changelog'] });
  block.fromJob([line]);
  block.addLook([]);
  block.carry({ picks: [{ line: 1, rule: 1, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }] });
  block.reconcile();
  /** @type {any[]} */ const phases = [];
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Summarise the latest release' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [line], inputs: [{ n: 1, label: 'Changelog', value: file }], block,
    onPhase: (/** @type {string} */ name, /** @type {any} */ data) => phases.push({ name, data }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const got = phases.filter((p) => p.name === 'draft-retention');
  assert.equal(got.length, 1, 'one record per draft');
  assert.deepEqual(got[0].data.lines, [{ line: 1, aiParts: 1, kept: 1, dropped: 0, picks: true }]);
});

test('wiring: the panel session writes the phase into the drafting log as one `retention` line (same writer as the call lines)', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'panel', 'authorsession.js'), 'utf8');
  assert.match(src, /name === 'draft-retention'[\s\S]{0,200}appendDraftLog\(outDir, \{ kind: 'retention'/);
});
