// Run mv5bk400, wrong labels in the record of a rubric job on a plain file: (1) the close-decl said genre "TYPES" for lang
// "text"; (2) the outer-close said judgedCount 1 when no judge ran; (3) the progress list said "making worktree" and "reading
// repo" for a job with neither. Each test fails on the old behaviour.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genreForLang, TEXT_GENRE, RUBRIC_LANG, classGuards } from '../src/authoring.js';
import { validateCloseDecl, declaredStages, runDeclaredStages, DECLARED_GENRES } from '../src/declaredclose.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { stepFileRel } from '../src/rubricstep.js';
import { createSession, STEP_LABELS, FILE_JOB_STEP_LABELS } from '../src/panel/authorsession.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = JSON.parse(readFileSync(join(HERE, 'fixtures', 'mv5bk400-resolved-spec.json'), 'utf8'));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-labels-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── genre ────────────────────────────────────────────────────────────────────

test('genre follows the language: a text close is TEXT, a code close is TYPES, and neither may wear the other\'s label', () => {
  assert.equal(genreForLang(RUBRIC_LANG), 'TEXT');
  assert.equal(genreForLang('js'), 'TYPES');
  assert.equal(genreForLang('python'), 'TYPES');
  assert.deepEqual([...DECLARED_GENRES], ['TYPES', TEXT_GENRE]);
  const base = clone(REAL.closeDecl);
  const opts = { listing: ['input/CHANGELOG.md', 'output/.gitkeep'], verdictType: 'soft-green', writeScope: ['output/'], jobLines: [{ n: 1 }, { n: 2 }], inputLabels: ['Changelog'] };
  // the mv5bk400 record itself: lang text, genre TYPES — now refused
  assert.equal(base.genre, 'TYPES');
  const old = validateCloseDecl(base, opts);
  assert.equal(old.ok, false);
  assert.ok(old.reds.some((r) => r.path === 'closeDecl.genre' && /genre follows its language \(TEXT for "text"\)/.test(r.detail)), JSON.stringify(old.reds));
  // the same close with its own genre validates
  const fixed = validateCloseDecl({ ...base, genre: 'TEXT' }, opts);
  assert.deepEqual(fixed.reds, []);
  // a code close may not claim TEXT
  const code = validateCloseDecl({ genre: 'TEXT', lang: 'js', stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['src/'] } }] },
    { listing: ['src/a.js'], verdictType: 'green', writeScope: ['src/'] });
  assert.ok(code.reds.some((r) => r.path === 'closeDecl.genre'));
});

test('authorCloseForJob stamps the closeDecl with the language\'s own genre: TEXT for a rubric job on files', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const r = await authorCloseForJob({
    answers: { 1: '1. Summarize' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: [{ n: 1, text: 'Summarize' }], inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'],
    generate: async () => { throw new Error('no model'); },
    authorFn: async () => ({ ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }] }, genreEnv: null, cost: { calls: [] }, reds: [] }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.closeDecl.genre, 'TEXT');
  assert.equal(classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }).length, 1);
});

// ── judgedCount ──────────────────────────────────────────────────────────────

async function frozenTree() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return r.prep;
}

test('judgedCount: a text close never reports one — green, red at the guard, red at a rubric-step — because no judge ran; a code close keeps its marker', async () => {
  const prep = await frozenTree();
  const decl = clone(REAL.closeDecl);
  decl.genre = 'TEXT';
  const stages = declaredStages(decl);
  // red at the first stage (the guard: nothing changed yet)
  const red1 = await runDeclaredStages(stages, (x) => x, { cwd: prep.tree, seedRef: prep.manifest.seed });
  assert.equal(red1.verdict, 'needs_revision');
  assert.equal(red1.stage, 'changed-from-seed');
  assert.equal(Object.hasOwn(red1, 'judgedCount'), false, 'red at the guard');
  // the guard passes, line 1's file is missing: red at a rubric-step
  mkdirSync(join(prep.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(prep.tree, 'output', 'steps', 'x.txt'), 'changed');
  const red2 = await runDeclaredStages(stages, (x) => x, { cwd: prep.tree, seedRef: prep.manifest.seed });
  assert.equal(red2.stage, 'line-1-versions-quoted-and-under-120-words');
  assert.equal(Object.hasOwn(red2, 'judgedCount'), false, 'red at a rubric-step');
  // green: both step files complete
  const q = readFileSync(join(prep.tree, 'input', 'CHANGELOG.md'), 'utf8').split('\n').find((l) => l.startsWith('# '));
  const body = (n) => JSON.stringify({ text: 'short', cites: { Changelog: [{ claim: 'a title', quote: q }] } });
  writeFileSync(join(prep.tree, stepFileRel(1)), body(1));
  writeFileSync(join(prep.tree, stepFileRel(2)), JSON.stringify({ text: 'short', cites: {} }));
  const green = await runDeclaredStages(stages, (x) => x, { cwd: prep.tree, seedRef: prep.manifest.seed });
  assert.equal(green.verdict, 'satisfied', JSON.stringify(green));
  assert.equal(Object.hasOwn(green, 'judgedCount'), false, 'green: the outer-close record carries no judged count');
  // a CODE close is untouched: a mechanical green still carries its marker
  const code = await runDeclaredStages(declaredStages({ stages: [decl.stages[0]] }), (x) => x, { cwd: prep.tree, seedRef: prep.manifest.seed });
  assert.equal(code.judgedCount, 1);
});

// ── progress labels ──────────────────────────────────────────────────────────

function keysHome() {
  const d = tmp('rubric-labels-keys-');
  writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 15); }); return fn(); };

test('the progress list words a file job for files: "copying input files" and "reading input files", never "making worktree" / "reading repo"; the repo wording is unchanged', async () => {
  assert.deepEqual({ ...FILE_JOB_STEP_LABELS }, { copy: 'copying input files', read: 'reading input files' });
  assert.equal(STEP_LABELS.copy, 'making worktree');
  assert.equal(STEP_LABELS.read, 'reading repo');
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const plan = { goal: 'Summarize.', checks: [{ text: 'under 200 words', fromLine: [1] }], notChecked: [], questions: [] };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'rubric-labels-session', jobText: '1. Summarize\n~ under 200 words',
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'out'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('rubric-labels-sess-'),
    generate: async () => { throw new Error('no model'); },
    confirmGenerate: async (_c, tools) => { await tools[0].execute(plan); return { text: '', error: null, cost: 0 }; },
    authorFn: async (o) => {
      o.onPhase('seed-read', {});
      return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }], notes: [] }, genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] };
    },
    prepareSigningFn: async () => ({ ok: true, specHash: 'abc123def4567890', seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: {} }),
  });
  assert.ok(await waitFor(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  session.signPrepare();
  assert.ok(await waitFor(() => ['prepared', 'refused', 'error'].includes(session.state.phase)));
  const labels = session.state.steps.map((s) => s.label);
  assert.ok(labels.includes('copying input files'), labels.join(' | '));
  assert.ok(labels.includes('reading input files'), labels.join(' | '));
  assert.ok(!labels.includes('making worktree'));
  assert.ok(!labels.includes('reading repo'));
});
