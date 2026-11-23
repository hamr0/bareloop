// REVIEW THE CODE, clean build item 6 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): prompt text belongs to the ROAD, not to "review". The planner line "write only your answer files `output/steps/<n>.json`; every exit is on them" goes to EVERY
// text-close planner (a rubric job on files had the same first-plan fence escape, 8 of 53 archived runs); a code close's planner prompt is byte-identical to before. A repo and a files planner prompt differ only by what the job itself says. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { planPrompt, answerFilesWords } from '../src/planrun.js';
import { validatePlan, EXIT_EXAMPLE } from '../src/plan.js';

const stage = (/** @type {number} */ n) => ({ name: `line-${n}`, kind: 'rubric-step', fromLine: [n], params: { step: n, parts: [] } });
const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['output/'], requireNonEmpty: true } };
const base = { schema: 'job-v1', job: 'r', writeScope: ['output/'] };
const repoJob = { ...base, closeDecl: { lang: 'text', source: 'repo', stages: [guard, stage(1), stage(2)] } };
const filesJob = { ...base, closeDecl: { lang: 'text', stages: [guard, stage(1), stage(2)] } };
const codeJob = { ...base, writeScope: ['src/'], closeDecl: { lang: 'js', stages: [guard] } };
const prompt = (/** @type {any} */ job) => planPrompt(job, '{}', [], 6, null, null, null);

test('every TEXT close\'s planner is told its answer files are the only thing written and every exit and check is on them (one file per job line)', () => {
  for (const [job, source] of /** @type {[any, 'repo'|'files'][]} */ ([[repoJob, 'repo'], [filesJob, 'files']])) {
    const p = prompt(job);
    assert.ok(p.includes(answerFilesWords([1, 2], source)));
    assert.match(p, /THIS JOB'S OUTPUT IS ITS ANSWER FILES\. The input is only READ, never written: no step may write or edit an input file, and no step's "target" or exit "path" may be one\./);
    assert.match(p, /\(output\/steps\/1\.json, output\/steps\/2\.json\)/);
    assert.match(p, /put every exit \(artifact-written, json-valid, tree-changed under output\/\) and every check-passes on that answer file/);
  }
});

test('the planner is told its role and answer file in the road\'s words: a repo reviews, a files job answers (one source table, no flag)', () => {
  const rp = prompt(repoJob);
  const fp = prompt(filesJob);
  assert.ok(rp.includes('You are reviewing the code. Read what you need, then write your review to output/steps/1.json, output/steps/2.json. That review file is the only file you write; every exit and every check goes on it.'));
  assert.ok(fp.includes('You are answering from the input files. Read what you need, then write your answer to output/steps/1.json, output/steps/2.json. That answer file is the only file you write; every exit and every check goes on it.'));
  const strip = (/** @type {string} */ t) => t.replace(/\nYou are [^\n]*\. Read what you need[^\n]*/, '');
  assert.equal(strip(rp), strip(fp), 'the two prompts differ only by that one sentence');
});

test('a text close\'s planner exit example has no read-only look-around clause; the legal write examples stay', () => {
  for (const job of [repoJob, filesJob]) {
    const p = prompt(job);
    assert.equal(p.includes('read-only look-around'), false);
    assert.equal(p.includes(EXIT_EXAMPLE), false);
    assert.match(p, /Legal exit examples: a step that changes files and has no check uses \[/);
  }
});

const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/code-close-planner-golden.json', import.meta.url), 'utf8'));
const goldJob = { schema: 'job-v1', job: 'r', goal: 'g', writeScope: ['src/'], closeDecl: { lang: 'js', stages: [] } };
const noExit = { schema: 'plan-v1', steps: [{ id: 'x', action: 'do', tools: ['read'], rounds: 6 }] };
const missingDetail = (/** @type {any} */ job) => validatePlan(noExit, { job }).reds.find((x) => x.code === 'missing-required')?.detail ?? '';

test('a code close\'s planner prompt and missing-exit red detail are byte-identical to the golden captured on the parent commit', () => {
  assert.equal(planPrompt(goldJob, '{}', [], 6, null, null, null), golden.prompt);
  assert.equal(missingDetail(goldJob), golden.detail);
  assert.ok(golden.detail.includes(EXIT_EXAMPLE));
});

test('the missing-required exit red on a text close carries no read-only example, so a redraft never sees it', () => {
  for (const job of [repoJob, filesJob]) {
    const d = missingDetail({ ...job, goal: 'g' });
    assert.ok(d.includes('Legal exit examples: a step that changes files'));
    assert.equal(d.includes('read-only look-around'), false);
  }
});

test('a code close\'s planner prompt is the one it always got', () => {
  assert.equal(prompt(codeJob).includes('ANSWER FILES'), false);
  assert.equal(prompt(codeJob).includes(answerFilesWords([1])), false);
});
