// PART 1a (docs/product/ITEM33-BUILD.md "Addendum 2026-10-12") — the rubric job's DOOR: a soft-green job on the person's own
// local files is no longer the "not a code project" stop. Covers the text genre's guards (src/authoring.js), the close-
// declaration language menu (src/declaredclose.js), authorCloseForJob's no-scout / one-question path (src/authorjob.js),
// the panel session routing (src/panel/authorsession.js) and ruling P1=B (src/jobblock.js). Every model seam is a fake that
// THROWS if it is reached: nothing here can spend. Real data throughout: a copy of this repo's own CHANGELOG.md is the input.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classGuards, RUBRIC_LANG, DECLARABLE_LANGUAGES, GENRE_LANGUAGES } from '../src/authoring.js';
import { validateCloseDecl, guardNames } from '../src/declaredclose.js';
import { authorCloseForJob, runInterview } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { parseJobBlock, jobBlockFitsCheck } from '../src/jobblock.js';
import { rubricGoal } from '../src/rubricstep.js';
import { createSession, validateJobCard as rawValidateJobCard } from '../src/panel/authorsession.js';
import { keyRows } from '../src/providerrows.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-door-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const changelogCopy = () => { const f = join(tmp(), 'CHANGELOG.md'); copyFileSync(join(HERE, '..', 'CHANGELOG.md'), f); return f; };
const rows = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: ANTH_CFG });
const validateJobCard = (card) => rawValidateJobCard(card, { rows });
const keysHome = () => { const d = tmp('rubric-door-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };

test('the text genre: soft-green keeps the machine guard that applies to a file tree (changed-from-seed), drops the code-suppression scan; green and unknown languages stay as they were', () => {
  const g = classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG });
  assert.deepEqual(g.map((x) => x.name), ['changed-from-seed']);
  assert.deepEqual(g[0].fill, ['allowPrefixes']);
  assert.throws(() => classGuards({ verdictType: 'green', lang: RUBRIC_LANG }), /rubric-files one/);
  // regression: the code languages are untouched — both guards, same as before
  for (const lang of GENRE_LANGUAGES) assert.deepEqual(classGuards({ verdictType: 'soft-green', lang }).map((x) => x.name), ['changed-from-seed', 'no-suppressions']);
  assert.throws(() => classGuards({ verdictType: 'soft-green', lang: 'cobol' }), /no TYPES genre data/);
  assert.deepEqual([...GENRE_LANGUAGES], ['js', 'python'], 'the code-language menu does not grow: text is declarable, not detectable');
  assert.deepEqual([...DECLARABLE_LANGUAGES], ['js', 'python', 'text']);
});

test('a closeDecl may declare lang "text" and is judged against its one guard; "cobol" is still a red; guardNames follows', () => {
  const decl = (lang, extra = {}) => ({
    genre: 'TYPES', lang,
    stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }],
    refused: [{ line: 1, reason: 'nothing in this fixture can check it' }],
    ...extra,
  });
  const listing = ['input/CHANGELOG.md', 'output/.gitkeep'];
  const ok = validateCloseDecl(decl('text'), { listing, verdictType: 'soft-green', writeScope: ['output/'], jobLines: [{ n: 1 }] });
  assert.equal(ok.ok, true, JSON.stringify(ok.reds));
  const bad = validateCloseDecl(decl('cobol'), { listing, verdictType: 'soft-green', writeScope: ['output/'], jobLines: [{ n: 1 }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.reds.some((r) => r.path === 'closeDecl.lang'));
  // the guard cannot be dropped: a text close without changed-from-seed is the same red a code close gets
  const dropped = validateCloseDecl(decl('text', { stages: [] }), { listing, verdictType: 'soft-green', writeScope: ['output/'], jobLines: [{ n: 1 }] });
  assert.equal(dropped.ok, false);
  assert.deepEqual(guardNames(decl('text'), 'soft-green'), ['changed-from-seed']);
  assert.deepEqual(guardNames(decl('cobol'), 'soft-green'), []);
});

test('runInterview: a caller may name the answer keys it needs; with none named the whole class set is still demanded', () => {
  const base = { verdictType: 'soft-green', repoPath: '/x' };
  assert.equal(runInterview({ ...base, answers: { 1: 'the job' } }).ok, false, 'default: soft-green still wants its examples answer');
  const one = runInterview({ ...base, answers: { 1: 'the job' }, required: [1] });
  assert.equal(one.ok, true, JSON.stringify(one.reds));
});

test('authorCloseForJob on the text genre: NO scout runs, the survey is the numbered inputs, and ONE answer is enough', async () => {
  const file = changelogCopy();
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  let seen = null;
  const r = await authorCloseForJob({
    answers: { 1: '1. Summarize the unreleased changes' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: [{ n: 1, text: 'Summarize the unreleased changes' }], inputs: [{ n: 1, label: 'Changelog', value: file }],
    writeScope: ['output/'],
    scoutFn: async () => { throw new Error('the paid scout must never run for a rubric job on files'); },
    generate: async () => { throw new Error('no model call in this test'); },
    authorFn: async (o) => {
      seen = o;
      return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }] }, genreEnv: null, cost: { calls: [] }, reds: [], stop: null };
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  assert.equal(r.closeDecl.lang, 'text');
  assert.deepEqual(seen.scout.facts, { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] });
  assert.equal(seen.scout.state, 'PRESENT');
  assert.deepEqual(Object.keys(seen.questions), ['1'], 'the prompt shows the job-lines question only');
  assert.ok(seen.listing.files.includes('input/CHANGELOG.md'), 'the real hidden-git listing is what the composer selects paths from');
});

test('authorCloseForJob: a language that is neither a code genre nor text (cobol) still refuses at the genre check — text is the only new door', async () => {
  const r = await authorCloseForJob({
    answers: { 1: 'x', 2: 'y' }, verdictType: 'soft-green', repoPath: '/tmp', lang: 'cobol',
    scout: { state: 'PRESENT', facts: { a: 1 }, calls: [], raws: [] }, generate: async () => { throw new Error('no'); },
  });
  assert.equal(r.ok, false);
});

// ── P1=B ─────────────────────────────────────────────────────────────────────

test('P1=B: jobBlockFitsCheck demands PASS/FAIL examples of a rubric only when it holds a judged part', () => {
  const noEx = parseJobBlock('1. Summarize the changes\n2. List the fixes');
  const withEx = parseJobBlock('1. Summarize\n~ PASS: a clear short summary\n~ FAIL: a wall of text');
  assert.ok(noEx.ok && withEx.ok);
  if (!noEx.ok || !withEx.ok) return;
  assert.match(jobBlockFitsCheck(noEx.lines, true) ?? '', /needs at least one "~ PASS:" line/, 'default (judged): still required');
  assert.equal(jobBlockFitsCheck(noEx.lines, true, { judged: false }), null, 'no judged part: not required');
  assert.equal(jobBlockFitsCheck(withEx.lines, true, { judged: false }), null, 'examples given anyway are never a red');
  assert.match(jobBlockFitsCheck(withEx.lines, false) ?? '', /Deterministic job has no judge/, 'deterministic jobs are unchanged');
});

test('P1=B at the card: a rubric on a local FILE needs no examples; a rubric on a REPO still does', () => {
  const file = changelogCopy();
  const card = (inputs) => ({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'rubric-door-card-test', jobText: '1. Summarize the unreleased changes',
    inputs, destination: '/tmp/out', capUsd: 1,
  });
  assert.equal(validateJobCard(card(`Changelog: ${file}`)).ok, true);
  const repo = validateJobCard(card(`repo: ${join(HERE, '..')}`));
  assert.equal(repo.ok, false);
  assert.match(repo.error, /needs at least one "~ PASS:" line/);
});

// ── the panel session ────────────────────────────────────────────────────────

test('createSession on a rubric job with a local file: no "not a code project" stop, no scout, no confirm turn — a signed-ready spec with the text genre, the output/ fence and a code-written goal', async () => {
  const file = changelogCopy();
  const dest = join(tmp(), 'delivered');
  let authorOpts = null;
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'rubric-door-session', jobText: '1. Summarize the unreleased changes\n~ keep it under 200 words',
    inputs: `Changelog: ${file}`, destination: dest, capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('rubric-door-sess-'),
    scout: { state: 'PRESENT', facts: { x: 1 }, calls: [], raws: [] },
    generate: async () => { throw new Error('no model call'); },
    confirmGenerate: async () => { throw new Error('no confirm turn for a rubric job on files'); },
    authorFn: async (o) => {
      authorOpts = o;
      return {
        ok: true,
        declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }], notes: [] },
        genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [],
      };
    },
    prepareSigningFn: async () => ({ ok: true, specHash: 'abc123def4567890', seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: {} }),
  });
  const t0 = Date.now();
  while (!['prepared', 'refused', 'error'].includes(session.state.phase) && Date.now() - t0 < 8000) await new Promise((r) => { setTimeout(r, 20); });
  assert.equal(session.state.phase, 'prepared', `${session.state.phase} / ${session.state.error}`);
  const spec = JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
  assert.equal(spec.verdictType, 'soft-green');
  assert.equal(spec.closeDecl.lang, 'text');
  assert.deepEqual(spec.writeScope, ['output/']);
  assert.match(spec.goal, /output\/steps\/N\.json/);
  assert.match(spec.goal, /Changelog: input\/CHANGELOG\.md/);
  assert.match(spec.goal, /1\. Summarize the unreleased changes\n {3}rule: keep it under 200 words/);
  assert.equal(authorOpts.lang, 'text');
  // the frozen source the run will use: manifest with inputs, destination recorded for copy-out
  const into = join(session.state.outDir, 'source-seed');
  const manifest = JSON.parse(readFileSync(join(into, 'source.json'), 'utf8'));
  assert.equal(manifest.destination, dest);
  assert.equal(manifest.inputs[0].label, 'Changelog');
  assert.equal(existsSync(join(into, 'tree', 'input', 'CHANGELOG.md')), true);
});

test('createSession: a web input line stops at $0 in the exact plain words; a relative Destination is refused before anything is copied', async () => {
  const file = changelogCopy();
  const run = async (inputs, destination) => {
    const s = createSession({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'rubric-door-web', jobText: '1. Summarize', inputs, destination, capUsd: 1 }, {
      env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('rubric-door-sess-'),
      generate: async () => { throw new Error('no model call'); },
    });
    const t0 = Date.now();
    while (!['prepared', 'refused', 'error'].includes(s.state.phase) && Date.now() - t0 < 8000) await new Promise((r) => { setTimeout(r, 20); });
    return s.state;
  };
  const web = await run(`Changelog: ${file}\nPage: https://example.com/changes`, join(tmp(), 'out'));
  assert.equal(web.phase, 'refused');
  assert.equal(web.error, 'line 2: web inputs (URLs, search) arrive in a later build. Nothing spent.');
  const rel = await run(`Changelog: ${file}`, 'out/');
  assert.equal(rel.phase, 'refused');
  assert.match(rel.error, /Destination must be the full path of a folder/);
});

test('rubricGoal: the worker brief carries the step-file contract, every input label with its frozen path, and the person\'s own lines with their rules', () => {
  const g = rubricGoal({ jobLines: [{ n: 1, text: 'Summarize', rule: 'under 200 words' }, { n: 2, text: 'List fixes', rule: '' }], files: [{ label: 'Changelog', rel: 'input/CHANGELOG.md' }] });
  assert.match(g, /output\/steps\/N\.json/);
  assert.match(g, /"text"/);
  assert.match(g, /"cites"/);
  assert.match(g, /- Changelog: input\/CHANGELOG\.md/);
  assert.match(g, /1\. Summarize\n {3}rule: under 200 words\n2\. List fixes$/);
});
