// REVIEW THE CODE, clean build item 6 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): prompt text belongs to the ROAD, not to "review". The planner line "write only your answer files `output/steps/<n>.json`; every exit is on them" goes to EVERY
// text-close planner (a rubric job on files had the same first-plan fence escape, 8 of 53 archived runs); a code close's planner prompt is byte-identical to before. A repo and a files planner prompt differ only by what the job itself says. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPrompt, answerFilesWords } from '../src/planrun.js';

const stage = (/** @type {number} */ n) => ({ name: `line-${n}`, kind: 'rubric-step', fromLine: [n], params: { step: n, parts: [] } });
const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['output/'], requireNonEmpty: true } };
const base = { schema: 'job-v1', job: 'r', writeScope: ['output/'] };
const repoJob = { ...base, closeDecl: { lang: 'text', source: 'repo', stages: [guard, stage(1), stage(2)] } };
const filesJob = { ...base, closeDecl: { lang: 'text', stages: [guard, stage(1), stage(2)] } };
const codeJob = { ...base, writeScope: ['src/'], closeDecl: { lang: 'js', stages: [guard] } };
const prompt = (/** @type {any} */ job) => planPrompt(job, '{}', [], 6, null, null, null);

test('every TEXT close\'s planner is told its answer files are the only thing written and every exit and check is on them (one file per job line)', () => {
  for (const job of [repoJob, filesJob]) {
    const p = prompt(job);
    assert.ok(p.includes(answerFilesWords([1, 2])));
    assert.match(p, /THIS JOB'S OUTPUT IS ITS ANSWER FILES\. The input is only READ, never written: no step may write or edit an input file, and no step's "target" or exit "path" may be one\./);
    assert.match(p, /\(output\/steps\/1\.json, output\/steps\/2\.json\)/);
    assert.match(p, /put every exit \(artifact-written, json-valid, tree-changed under output\/\) and every check-passes on that answer file/);
  }
});

test('no flag, no source branch: a repo and a files planner prompt are byte-identical for the same job', () => {
  assert.equal(prompt(repoJob), prompt(filesJob));
  assert.equal(prompt(repoJob).includes('REVIEW'), false, 'the prompt names no "review"');
});

test('a code close\'s planner prompt is the one it always got', () => {
  assert.equal(prompt(codeJob).includes('ANSWER FILES'), false);
  assert.equal(prompt(codeJob).includes(answerFilesWords([1])), false);
});
