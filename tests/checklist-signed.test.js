// B1: the signed close carries the list (`closeDecl.list`): line, key, from, by, kind, state, rule, part, reason - never the row's words. Admitted by the close validator, built by authorClose, carried by authorCloseForJob like `picks`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { CLOSE_DECL_FIELDS } from '../src/declaredclose.js';
import { authorClose, DECLARATION_TOOL_NAME, GREEN_QUESTIONS } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';
import { jobSpecHash } from '../src/job.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'checklist-signed-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const jobLines = [{ n: 1, text: 'Find the latest heading', rule: 'at most 80 words', rules: ['at most 80 words'] }];
const texts = { Changelog: '## [0.54.1] - 2026-11-04\n### Fixed\n- one\n' };
const look = { facts: [{ line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## ['] }], dropped: [] };

test('B1 the close validator admits `list` as a closeDecl field', () => {
  assert.ok(CLOSE_DECL_FIELDS.includes('list'));
});

test('B1 authorClose returns the final signed rows of the block (`ledger`) beside the accepted declaration', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  const prep = proved.prep;
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const labels = ['Changelog'];
  const run = () => {
    const block = new CheckBlock({ texts, labels });
    block.fromJob([{ n: 1, text: 'Summarise' }]); block.addLook([], []); block.reconcile();
    return authorClose({
      workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green', answers: { 1: '1. x' }, questions: { 1: GREEN_QUESTIONS[1] },
      scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] }, listing, writeScope: ['output/'],
      jobLines: [{ n: 1, text: 'Summarise' }], inputs: [{ n: 1, label: 'Changelog', value: file }], block,
      // the drafter's reply is row edits (an empty list is a good answer)
      generate: async (_m, tools) => {
        await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [] });
        return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
      },
    });
  };
  const r = await run();
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.ok(Array.isArray(r.ledger) && r.ledger.some((x) => x.kind === 'cited' && x.state === 'built'));
  assert.ok(r.ledger.every((x) => !('words' in x) && !('text' in x)), 'the signed rows carry no words');
});

test('B1 hashing is untouched: the list is hashed as any closeDecl field, and an unrelated spec hashes as before', () => {
  const base = { schema: 'job-v1', job: 'j', goal: 'g', closeDecl: { genre: 'text', lang: 'text', stages: [] } };
  const withList = { ...base, closeDecl: { ...base.closeDecl, list: [{ line: 1, key: 'k', from: 'rule', by: 'you', kind: 'rule', state: 'built' }] } };
  assert.notEqual(jobSpecHash(base), jobSpecHash(withList), 'a changed list is a changed signed spec');
  assert.equal(jobSpecHash(base), jobSpecHash(JSON.parse(JSON.stringify(base))));
});

import { validateCloseDecl } from '../src/declaredclose.js';
const listReds = (list) => validateCloseDecl({ genre: 'text', lang: 'text', stages: [], list }, { at: 'closeDecl', verdictType: 'soft-green' }).reds.filter((r) => r.path === 'closeDecl.list' || String(r.path).startsWith('closeDecl.list['));
const okRow = { line: 1, key: 'L1.~1', from: 'rule', by: 'you', kind: 'rule', rule: 1, state: 'built', part: { line: 1, part: 0 } };

test('B1 the validator checks the list shape: a good row passes; words, a bad state, a non-array and an unknown field are refused', () => {
  assert.deepEqual(listReds([okRow, { ...okRow, state: 'not-checked', reason: 'plain words', part: undefined }]), []);
  assert.ok(listReds([{ ...okRow, words: ['a quote'] }]).some((r) => r.code === 'unknown-field'), 'the row\'s words are never signed');
  assert.ok(listReds([{ ...okRow, state: 'listed' }]).some((r) => /state/.test(r.path)));
  assert.ok(listReds([{ ...okRow, by: 'robot' }]).some((r) => /by/.test(r.path)));
  assert.ok(listReds('nope').length > 0);
});

import { authorCloseForJob as forJob } from '../src/authorjob.js';
test('B1 authorCloseForJob carries the list into closeDecl like picks: signed rows only; no ledger, no field', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } };
  const go = (ledger) => forJob({
    answers: { 1: '1. x' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG, jobLines: [{ n: 1, text: 'Summarise' }], inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'],
    provider: { fake: true }, ceilingUsd: 1, lookFn: async () => survey, generate: async () => { throw new Error('no model call'); },
    authorFn: async () => ({ ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }, { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'u', class: 'countable', check: 'cited', source: 'Changelog' }] } }] }, genreEnv: null, ledger, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }),
  });
  // the block's own signedRows() output (src/checkblock.js): the nine signed fields, never a row's words
  const rows = [{ key: 'L1.$cited', line: 1, kind: 'cited', from: 'default', by: 'default', state: 'built', part: { line: 1, part: 0 } }, { key: 'L1.~1', line: 1, kind: 'rule', from: 'rule', by: 'you', rule: 1, state: 'not-checked', reason: 'No rule can check this.' }];
  const r = await go(rows);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual(r.closeDecl.list, [
    { line: 1, key: 'L1.$cited', from: 'default', by: 'default', kind: 'cited', state: 'built', part: { line: 1, part: 0 } },
    { line: 1, key: 'L1.~1', from: 'rule', by: 'you', kind: 'rule', rule: 1, state: 'not-checked', reason: 'No rule can check this.' },
  ]);
  assert.equal('list' in (await go(null)).closeDecl, false);
});
