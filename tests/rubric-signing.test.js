// PART 1a, deliverable 6 — SIGNING a rubric job on local files makes ZERO judge-round records. `prepareSigning` runs its paid
// calibration gate only for a close that carries a judged stage; a rubric-step close has none, so a soft-green job on files
// signs on $0 gates alone (declaration, precheck, seed verdict). Real everything: the real source door, real hidden git, the
// real `prepareSigning`, the real validator; the judge seam is a function that FAILS THE TEST if it is ever called.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSigning, assembleSpec } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { RUBRIC_LANG } from '../src/authoring.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-signing-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

const DRAFT = {
  schema: 'job-v1', job: 'changelog-summary', description: 'a rubric job on a local file', provider: 'anthropic-api', model: 'claude-sonnet-5',
  cadence: { unit: 'day', every: 1 }, budgetUsd: 0.5, writeScope: ['output/'], goal: 'write the step files',
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
  jobLines: [{ n: 1, text: 'Summarize the unreleased changes', rule: 'under 200 words' }],
  inputs: [{ n: 1, label: 'Changelog', value: '/x/CHANGELOG.md' }],
};
const DECL = () => ({
  genre: 'TEXT', lang: RUBRIC_LANG,
  stages: [
    { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
    { name: 'line-1', fromLine: [1], kind: 'rubric-step', params: { step: 1, parts: [{ text: 'under 200 words', class: 'countable', check: 'maxWords', value: 200 }] } },
  ],
});

async function frozen() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return r.prep;
}

test('a soft-green rubric-step close validates as a job with NO calibration set and no judge — nothing in the job validator requires a judged floor of soft-green', () => {
  const spec = assembleSpec(DRAFT, { closeDecl: DECL(), verdictType: 'soft-green' });
  const v = validateJob(spec);
  assert.deepEqual(v.reds, []);
  assert.equal(v.ok, true);
});

test('prepareSigning on a rubric-step close: signs on the $0 gates, the calibration gate never runs, and the judge seam is never touched', async () => {
  const prep = await frozen();
  const spec = assembleSpec(DRAFT, { closeDecl: DECL(), verdictType: 'soft-green' });
  let judgeCalls = 0;
  let costEvents = 0;
  const r = await prepareSigning({
    spec, workdir: prep.tree, seedRef: prep.manifest.seed, timeoutMs: 30_000,
    judgeLoop: async () => { judgeCalls += 1; throw new Error('the judge must never be called to sign a rubric-step close'); },
    judgeModel: 'would-be-judge',
    onJudgeCost: () => { costEvents += 1; },
    calibrateFn: async () => { throw new Error('calibration must never run for a close with no judged stage'); },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.gates.calibration, null, 'no calibration record: the gate did not run');
  assert.equal(judgeCalls, 0);
  assert.equal(costEvents, 0, 'zero judge-round records');
  assert.deepEqual(r.gates.declaration.ok, true);
  assert.equal(r.gates.precheck.ok, true);
  assert.deepEqual(r.gates.seedVerdict.workRed, ['line-1'], 'the line is red at the seed (no step file yet), so the close has work to do');
  assert.deepEqual(r.guards.map((g) => g.stage), ['changed-from-seed']);
  assert.equal(r.specHash, jobSpecHash(validateJob(spec).job));
});

test('a seed that already satisfies the rubric (a step file present and within limits) is NOT signable — the close must have work to do', async () => {
  const prep = await frozen();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  // a different seed: commit a finished step file into the hidden tree, then sign against that
  mkdirSync(join(prep.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(prep.tree, 'output', 'steps', '1.json'), JSON.stringify({ text: 'done', cites: {} }));
  const { execFileSync } = await import('node:child_process');
  const git = (args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: prep.tree, encoding: 'utf8' });
  git(['add', '-A', '-f']);
  git(['commit', '-q', '-m', 'finished already']);
  const seed = git(['rev-parse', 'HEAD']).trim();
  const spec = assembleSpec(DRAFT, { closeDecl: DECL(), verdictType: 'soft-green' });
  const r = await prepareSigning({ spec, workdir: prep.tree, seedRef: seed, timeoutMs: 30_000 });
  assert.equal(r.ok, false);
  assert.match(r.refusal?.detail ?? '', /No work stage of this close is RED at the seed/);
});

test('M2: a prose line after a fact line signs as a NORMAL seed red (no step files at the seed), never a broken-close; and a rubric job\'s refusal never says "install, build and test"', async () => {
  const prep = await frozen();
  const draft = { ...DRAFT, jobLines: [{ n: 1, text: 'List the last 3 releases', rule: '' }, { n: 2, text: 'Summarize them in one short paragraph', rule: '' }] };
  const decl = {
    genre: 'TEXT', lang: RUBRIC_LANG,
    stages: [
      { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
      { name: 'line-1', fromLine: [1], kind: 'rubric-step', params: { step: 1, parts: [{ text: 'list the last 3 releases', class: 'fact', source: 'Changelog',
        facts: [{ name: 'version', shape: 'text', anchor: '## [', until: ']' }], count: { min: 3, max: 3 } }] } },
      { name: 'line-2', fromLine: [2], kind: 'rubric-step', params: { step: 2, parts: [
        { text: 'under 80 words', class: 'countable', check: 'maxWords', value: 80 },
        { text: 'every number in the text is in a quote checked on line 1', class: 'countable', check: 'numbersFromFacts', from: [1] }] } },
    ],
  };
  const spec = assembleSpec(draft, { closeDecl: decl, verdictType: 'soft-green' });
  const r = await prepareSigning({ spec, workdir: prep.tree, seedRef: prep.manifest.seed, timeoutMs: 30_000,
    judgeLoop: async () => { throw new Error('no judge'); }, calibrateFn: async () => { throw new Error('no calibration'); } });
  assert.deepEqual(r.reds.filter((x) => x.code === 'broken-close'), [], JSON.stringify(r.reds));
  assert.equal(r.gates.precheck.ok, true, 'the precheck ran every stage');
  assert.ok(r.gates.seedVerdict.workRed.includes('line-2'), 'line 2 is an ordinary seed red');
  assert.equal(r.ok, true, JSON.stringify(r.reds));
});

test('M2: a rubric job whose check truly cannot run (input bytes changed after freezing) refuses with a broken-close red marked rubricJob, worded without the code-job commands', async () => {
  const prep = await frozen();
  const { writeFileSync } = await import('node:fs');
  const rel = JSON.parse((await import('node:fs')).readFileSync(join(dirname(prep.tree), 'source.json'), 'utf8')).inputs[0].rel;
  writeFileSync(join(prep.tree, rel), 'tampered after the door');
  const decl = {
    genre: 'TEXT', lang: RUBRIC_LANG,
    stages: [
      { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
      { name: 'line-1', fromLine: [1], kind: 'rubric-step', params: { step: 1, parts: [{ text: 'list the last 3 releases', class: 'fact', source: 'Changelog',
        facts: [{ name: 'version', shape: 'text', anchor: '## [', until: ']' }], count: { min: 3, max: 3 } }] } },
    ],
  };
  const spec = assembleSpec({ ...DRAFT, jobLines: [{ n: 1, text: 'List the last 3 releases', rule: '' }] }, { closeDecl: decl, verdictType: 'soft-green' });
  const r = await prepareSigning({ spec, workdir: prep.tree, seedRef: prep.manifest.seed, timeoutMs: 30_000,
    judgeLoop: async () => { throw new Error('no judge'); }, calibrateFn: async () => { throw new Error('no calibration'); } });
  assert.equal(r.ok, false);
  const broken = r.reds.filter((x) => x.code === 'broken-close');
  assert.equal(broken.length, 1, JSON.stringify(r.reds));
  assert.equal(broken[0].rubricJob, true);
  const { signingStopText } = await import('../src/authorreadout.js');
  const said = signingStopText({ reds: r.reds, refusal: r.refusal });
  assert.doesNotMatch(said, /install, build and test/);
  assert.match(said, /could not run/);
});
