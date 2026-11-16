// Addendum 2026-11-15 (d) piece 2: a repo draft SIGNS its list (`closeDecl.list`, built by src/repolist.js from the declaration), carries the drafter's fence claim (`closeDecl.fenceKept`), and the signing gate accepts both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorCloseForJob } from '../src/authorjob.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { listMatchesClose } from '../src/rubricstep.js';
import { SCOUT_ATTEMPTS } from '../src/authorscout.js';

const spec = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smw6ssquvtvqs-spec.json', import.meta.url), 'utf8'));
const SURVEY = { state: 'PRESENT', reason: null, calls: [], facts: { language: 'javascript', runner: 'node --test', sourcePaths: ['src'], testPaths: [], extensions: ['.js'] }, meta: { bytes: 1, rounds: 1, bounded: false, recovered: false, error: null } };
const LISTING = { stop: null, files: ['package.json', 'src/sum.js', 'test/sum.test.js'] };

/** drafts the fixture job with a scripted drafter whose declaration is the fixture's stages plus the given claims */
async function draft(/** @type {any[]|undefined} */ fenceKept) {
  const declaration = { stages: spec.closeDecl.stages, ...(fenceKept ? { fenceKept } : {}) };
  return authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.\n   rule: no new dependencies' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
    jobLines: spec.jobLines, writeScope: spec.writeScope,
    scoutFn: async () => SURVEY, listingFn: async () => LISTING,
    authorFn: async () => ({ ok: true, declaration, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: LISTING, ledger: null }),
  });
}

test('a repo draft signs a list: the rule row Not checked, one `!` row per work stage, the guards and the fence once', async () => {
  const r = await draft();
  assert.equal(r.ok, true);
  const list = r.closeDecl.list;
  assert.ok(Array.isArray(list), 'closeDecl.list is signed for a repo job');
  assert.equal(list.find((/** @type {any} */ x) => x.kind === 'rule').state, 'not-checked');
  assert.equal(list.filter((/** @type {any} */ x) => x.kind === 'stage').length, 3);
  assert.equal(list.filter((/** @type {any} */ x) => x.kind === 'guard').length, 2);
  assert.equal(list.filter((/** @type {any} */ x) => x.kind === 'fence').length, 1);
  assert.equal(listMatchesClose(r.closeDecl).ok, true);
  assert.deepEqual(validateCloseDecl(r.closeDecl, { at: 'closeDecl', verdictType: 'green', listing: LISTING.files }).reds.filter((/** @type {any} */ x) => /closeDecl\.list\[|fenceKept/.test(String(x.path))), []);
});

/** the fixture job with its first rule's words replaced */
/** a fake pointing-call boundary that points rule 1 of line 1 at package.json */
const pointAt = async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === 'submit_edits').execute({ edits: [{ op: 'fence', line: 1, rule: 1, path: 'package.json' }] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0, unpricedRounds: 0 } }; };
async function draftRule(/** @type {string} */ words, /** @type {any} */ fenceGenerate = undefined) {
  const jobLines = structuredClone(spec.jobLines);
  jobLines[0].rules = [words]; jobLines[0].rule = words;
  const declaration = { stages: spec.closeDecl.stages };
  return authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true,
    jobLines, writeScope: spec.writeScope, ...(fenceGenerate ? { fenceGenerate } : {}),
    scoutFn: async () => SURVEY, listingFn: async () => LISTING,
    authorFn: async () => ({ ok: true, declaration, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: LISTING, ledger: null }),
  });
}

test('a rule the AI points at a repo file outside the write fence, which its own words name, is kept by code\'s proof', async () => {
  const r = await draftRule('do not change package.json', pointAt);
  const row = r.closeDecl.list.find((/** @type {any} */ x) => x.kind === 'rule');
  assert.deepEqual([row.state, row.fence], ['built', 'package.json']);
  assert.deepEqual(validateCloseDecl(r.closeDecl, { at: 'closeDecl', verdictType: 'green', listing: LISTING.files }).reds.filter((/** @type {any} */ x) => /closeDecl\.list\[/.test(String(x.path))), []);
  assert.equal(listMatchesClose(r.closeDecl).ok, true);
});

test('a rule that names a place the run may change is not kept: Not checked, never built', async () => {
  const r = await draftRule('keep the comment at the top of src/sum.js');
  assert.equal(r.ok, true);
  const row = r.closeDecl.list.find((/** @type {any} */ x) => x.kind === 'rule');
  assert.equal(row.state, 'not-checked');
  assert.equal(row.fence, undefined);
});

test('a malformed fenceKept (not {line, rule, path}) is refused at signing, never signed', () => {
  const bad = { ...spec.closeDecl, fenceKept: [{ line: 1, rule: 1 }] };
  assert.ok(validateCloseDecl(bad, { at: 'closeDecl', verdictType: 'green', listing: LISTING.files }).reds.some((/** @type {any} */ x) => /fenceKept/.test(String(x.path))));
});
