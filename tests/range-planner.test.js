// Part 2 item 6 (ITEM33-BUILD "Part 2 build spec"): the planner block for a range/branch review: one block from rangeNoteOfSpec, only with a token, words FROZEN from live round W. Invariants: every code-close prompt, every
// signed-spec fixture's prompt and a no-token review's prompt are byte-identical to the parent commit (tests/fixtures/range-planner-golden.json, captured at 4ba2da23 before this change).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planPrompt } from '../src/planrun.js';
import { rangeNoteOfSpec } from '../src/rangereview.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, 'fixtures');
const golden = JSON.parse(readFileSync(path.join(R, 'range-planner-golden.json'), 'utf8'));
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['output/'], requireNonEmpty: true } };
const stage = (/** @type {number} */ n) => ({ name: `line-${n}`, kind: 'rubric-step', fromLine: [n], params: { step: n, parts: [] } });
const review = (/** @type {string} */ text) => ({ schema: 'job-v1', job: 'r', goal: 'g', writeScope: ['output/'], verdictType: 'soft-green', jobLines: [{ n: 1, text }], closeDecl: { lang: 'text', source: 'repo', stages: [guard, stage(1)] } });

// the words, byte for byte, FROZEN from round W (`<A..B>` is the typed range, or main..NAME for a branch)
const WORDS = (/** @type {string} */ span) => `This review covers ${span}. The changed files are listed in output/review-diff/files.txt; each file's changes are in output/review-diff/<path>.diff. Plan ONE step that reads and writes: write output/steps/1.json as soon as you have your first finding, then add each new finding to it as you read. Do not plan a separate step that only re-checks the answer.`;

test('INVARIANT: every signed-spec fixture\'s planner prompt (plain, and with hints/seed note/read shim) is byte-identical to the parent commit; so is a no-token review\'s', () => {
  const files = [];
  for (const e of readdirSync(R, { withFileTypes: true })) {
    if (e.isFile() && /resolved-spec.*\.json$/.test(e.name)) files.push(e.name);
    if (e.isDirectory()) for (const f of readdirSync(path.join(R, e.name))) if (/resolved-spec.*\.json$/.test(f)) files.push(`${e.name}/${f}`);
  }
  assert.deepEqual(files.sort(), Object.keys(golden.prompts).sort(), 'the golden covers exactly the fixtures that exist');
  for (const f of files) {
    const job = JSON.parse(readFileSync(path.join(R, f), 'utf8'));
    assert.equal(sha(planPrompt(job, '{}', [], 6, null, null, null)), golden.prompts[f].plain, `${f} plain`);
    assert.equal(sha(planPrompt(job, '{}', [], 6, null, null, null, null, {}, null, true, 'hint text', 'seed note')), golden.prompts[f].knobs, `${f} with knobs`);
  }
  assert.equal(planPrompt(review('Review the code in src/ for bugs'), '{}', [], 6, null, null, null), golden.reviewNoToken.prompt);
});

test('a review with a range token: the planner prompt is the no-token prompt plus ONE block of the frozen words, nowhere else', () => {
  const job = review('Review range: v1..v2 for bugs');
  const noToken = planPrompt({ ...job, jobLines: [{ n: 1, text: 'Review the code in src/ for bugs' }] }, '{}', [], 6, null, null, null);
  const withIt = planPrompt(job, '{}', [], 6, null, null, null, null, {}, null, false, null, null, rangeNoteOfSpec(job));
  assert.ok(withIt.includes(WORDS('v1..v2')));
  assert.equal(withIt.split(WORDS('v1..v2')).length, 2, 'once');
  assert.equal(withIt.replace(`\n${WORDS('v1..v2')}\n`, ''), noToken, 'removing the block gives back the no-token prompt');
});

test('a branch review says main..NAME; a change job with branch: (a code spec) and a change job with no token get no block', () => {
  assert.equal(rangeNoteOfSpec(review('Review branch: feat for bugs')), WORDS('main..feat'));
  const change = { ...review('Make branch: feat pass'), verdictType: 'green', closeDecl: { lang: 'js', stages: [guard] }, writeScope: ['src/'] };
  assert.equal(rangeNoteOfSpec(change), null);
  assert.equal(rangeNoteOfSpec(review('Review the code')), null);
});

test('the run\'s one planner call site passes the block from the signed spec (draft, redraft and replan all go through it)', () => {
  const src = readFileSync(path.join(HERE, '..', 'src', 'planrun.js'), 'utf8');
  assert.equal((src.match(/planPrompt\(/g) ?? []).length, 2, 'the definition and one call');
  assert.match(src, /seedNoteForPlanner\?\.text \?\? null, rangeNoteOfSpec\(job\)\), \[\]\)/);
});
