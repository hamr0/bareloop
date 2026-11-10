// R10 paid round 5: `rubric-fact-label-off-list` came from two lists. The drafter was offered the code-made label list ("pick ONLY from this
// list": "] -", "## [") while the draft gate proved a label against what the page-word map KEPT. Now ONE list: the prompt offers what the proof accepts.
// Real drafts: paid round 5 drafts 11 (session smwabfk0eadsv) and 12 (smwabfyt763ga); fixture = their saved page-map answers and refused tries.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPageMap } from '../src/pagemap.js';
import { checkFactWords, keptSetOf, labelListsFor } from '../src/factwords.js';
import * as af from '../src/authorflow.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(HERE, 'fixtures', 'r10-labellist-drafts.json'), 'utf8'));
const CHANGELOG = join(HERE, 'fixtures', 'r10-countable-changelog.md');
const TEXT = readFileSync(CHANGELOG, 'utf8');
const JOB_LINES = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words'] }];
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'r10-labellist-')); made.push(d); return d; };

/** the look the draft had: the saved page-map answer through the real map code, no model */
async function lookOf(/** @type {string} */ raw) {
  const r = await runPageMap({ texts: { Changelog: TEXT }, inputs: [{ n: 1, label: 'Changelog' }], jobLines: JOB_LINES, createLoop: () => ({ run: async () => ({ text: raw }) }) });
  return r.facts.look;
}
const refusedLabels = (/** @type {any} */ d) => d.refused.map((/** @type {any} */ r) => /the label "(.*?)" is not one of/.exec(r.detail)?.[1]);
const offered = (/** @type {string} */ block) => [...block.matchAll(/^ {2}("(?:[^"\\]|\\.)*")$/gm)].map((m) => JSON.parse(m[1]));

for (const key of ['d11', 'd12']) {
  test(`${key}: every label the drafter is offered is one the draft gate accepts; the refused labels are not offered`, async () => {
    const look = await lookOf(FX[key].pageMapRaw);
    const [block] = labelListsFor({ Changelog: TEXT }, look);
    const kept = keptSetOf(look, 'Changelog');
    for (const label of offered(block)) {
      const reds = checkFactWords({ part: { source: 'Changelog', facts: [{ name: 'x', shape: 'date', anchor: label }] }, text: TEXT, line: 1, kept });
      assert.ok(!reds.some((r) => r.code === 'rubric-fact-label-off-list'), `offered ${JSON.stringify(label)} is refused by the gate`);
    }
    for (const bad of refusedLabels(FX[key])) assert.ok(!offered(block).includes(bad), `the refused label ${JSON.stringify(bad)} is still offered`);
    assert.doesNotMatch(block, /the words right before a/);
  });
}

test('d11: no label kept -> the drafter is told to leave the label out; d12: the kept words are the whole list', async () => {
  const [none] = labelListsFor({ Changelog: TEXT }, await lookOf(FX.d11.pageMapRaw));
  assert.match(none, /kept no label for this input - leave the label out/);
  const [one] = labelListsFor({ Changelog: TEXT }, await lookOf(FX.d12.pageMapRaw));
  assert.deepEqual(offered(one), ['## [0.54.1] - 2026-11-04']);
});

test('an input with no page-word map (no look, or the old look with no dropped list) keeps the code-made list', () => {
  for (const look of [null, { facts: [] }]) {
    const [block] = labelListsFor({ Changelog: TEXT }, look);
    assert.match(block, /\(the words right before a date\)/);
    assert.match(block, /"\] -"/);
  }
});

// ---- the real seam: the prompt the drafting loop builds -------------------------------------------------------------------------------------
for (const key of ['d11', 'd12']) {
  test(`${key}: authorClose's drafting prompt carries the one list (the kept labels), not the code-made one`, async () => {
    const look = await lookOf(FX[key].pageMapRaw);
    const file = join(tmp(), 'CHANGELOG.md'); copyFileSync(CHANGELOG, file);
    const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
    assert.equal(proved.ok, true);
    if (!proved.ok) throw new Error('unreachable');
    const prep = proved.prep;
    /** @type {string[]} */ const prompts = [];
    const generate = async (/** @type {any} */ m, /** @type {any} */ tools) => {
      prompts.push(m.map((/** @type {any} */ x) => (typeof x.content === 'string' ? x.content : JSON.stringify(x.content))).join('\n'));
      await tools.find((/** @type {any} */ t) => t.name === af.DECLARATION_TOOL_NAME).execute({ stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
    };
    const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
    await af.authorClose({
      workdir: prep.tree, seedRef: prep.manifest.seed, lang: 'text', verdictType: 'soft-green',
      answers: { 1: '1. Summarise the latest release in the changelog' }, questions: { 1: af.GREEN_QUESTIONS[1] },
      scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look }, calls: [], raws: [] },
      listing, generate, writeScope: ['output/'], jobLines: JOB_LINES, inputs: [{ n: 1, label: 'Changelog', value: file }], maxRevisions: 0,
    });
    assert.ok(prompts.length >= 1);
    const [block] = labelListsFor({ Changelog: TEXT }, look);
    assert.ok(prompts[0].includes(block), 'the prompt carries the kept-label list');
    assert.doesNotMatch(prompts[0], /the words right before a date\)/);
    for (const bad of refusedLabels(FX[key])) assert.ok(!prompts[0].includes(`  ${JSON.stringify(bad)}  x`), `the code-made row for ${JSON.stringify(bad)} is still in the prompt`);
  });
}
