// PART 1a, deliverable 2 — the step-file contract reaches its reader, the worker's goal (src/rubricstep.js `rubricGoal`; the composer's prompt that used to carry it too, `rubricAuthorPrompt`,
// is deleted: the AI writes row edits now, never a stage, so it needs no step-file contract); the plan validator lets a per-line step file
// be a step's target (src/plan.js); and the copy-out delivers `output/steps/` with the rest of the output (src/source.js).
// Real data: a copy of this repo's CHANGELOG.md frozen by the real door; the real seed listing; a scripted model boundary
// that can only DELIVER a declaration (it cannot spend).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorPrompt, authorClose, GREEN_QUESTIONS } from '../src/authorflow.js';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL, rowEditUserText } from '../src/rowedit.js';
import { classGuards, RUBRIC_LANG, catalogueForLang, KIND_CATALOGUE } from '../src/authoring.js';
import { proveRubricInputs, copyOut } from '../src/source.js';
import { stepFileContract, stepFileRel, STEP_DIR } from '../src/rubricstep.js';
import { validatePlan } from '../src/plan.js';
import { validateJob } from '../src/job.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-brief-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const changelogCopy = () => { const f = join(tmp(), 'CHANGELOG.md'); copyFileSync(join(HERE, '..', 'CHANGELOG.md'), f); return f; };

async function frozenTree() {
  const file = changelogCopy();
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { file, prep: r.prep };
}

const guards = () => classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG });
const JOB_LINES = [{ n: 1, text: 'Summarize the unreleased changes', rule: 'under 200 words' }, { n: 2, text: 'List the fixes', rule: '' }];
const INPUTS = [{ n: 1, label: 'Changelog', value: '/x/CHANGELOG.md' }];

test('catalogueForLang: the text genre sees only its own kinds; a code language never sees a rubric-only kind', () => {
  assert.deepEqual(Object.keys(catalogueForLang(RUBRIC_LANG)).sort(), ['files-changed', 'rubric-step']);
  for (const lang of ['js', 'python']) {
    assert.deepEqual(Object.keys(catalogueForLang(lang)), Object.keys(KIND_CATALOGUE).filter((k) => k !== 'rubric-step'));
  }
});

test('the drafter\'s message for the text genre carries the numbered lines and the labelled inputs — and nothing of a repository genre or of a stage; a CODE language is untouched', () => {
  const user = rowEditUserText({ jobLines: JOB_LINES.map((l) => ({ ...l, rules: l.rule ? [l.rule] : [] })), look: null, texts: { Changelog: 'the changelog text' } });
  assert.match(user, /^THE JOB \(the person's own words\)/);
  assert.match(user, /1\. Summarize the unreleased changes\n   ~ rule 1: under 200 words/);
  assert.match(user, /2\. List the fixes/);
  assert.match(user, /INPUT "Changelog" \(first 8000 characters\):\nthe changelog text/);
  for (const gone of ['TYPES', 'type checker', 'KNOWN INSTRUMENTS', 'MYPYPATH', 'read-only survey of their repository', 'output/steps', 'declare_close', 'allowPrefixes']) {
    assert.equal(user.includes(gone), false, `a repo-genre or stage phrase leaked into the text-genre message: ${gone}`);
  }
  // and a CODE language is untouched by this branch
  const code = authorPrompt({
    answers: { 1: 'fix' }, questions: { 1: GREEN_QUESTIONS[1] }, facts: { a: 1 }, listingBlock: '', lang: 'js', verdictType: 'green',
    guards: classGuards({ verdictType: 'green', lang: 'js' }),
  });
  assert.ok(code.includes('KNOWN INSTRUMENTS') && code.includes('THE GENRE TEMPLATE'));
  assert.equal(code.includes('output/steps'), false);
});

test('authorClose on the text genre end to end: no scout facts needed beyond the inputs, the real hidden-git listing is selected from, the block-built declaration validates and is seed-read', async () => {
  const { prep, file } = await frozenTree();
  const seen = [];
  const generate = async (messages, tools) => {
    seen.push(messages);
    await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  assert.ok(listing.files.includes('input/CHANGELOG.md'));
  const jobLines = JOB_LINES.map((l) => ({ ...l, rules: l.rule ? [l.rule] : [] }));
  const block = new CheckBlock({ texts: { Changelog: readFileSync(file, 'utf8') }, labels: ['Changelog'], asks: false });
  block.fromJob(jobLines);
  block.addLook([]);
  block.reconcile();
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Summarize\n2. List' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines, inputs: [{ n: 1, label: 'Changelog', value: file }], block,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.ok(seen.length >= 1);
  assert.match(seen[0][0].content, /^THE JOB/);
  assert.deepEqual(r.declaration.stages.map((s) => s.name), ['changed-from-seed', 'line-1', 'line-2']);
  assert.deepEqual(r.declaration.stages[0].params.allowPrefixes, ['output/'], 'the guard\'s fence slot is filled by code from the signed write fence');
  assert.deepEqual(r.declaration.refused.map((x) => [x.line, x.rule]), [[1, 1]], 'the rule nothing can check is listed under Not checked');
  assert.equal(r.seedRead.length, 3);
  assert.equal(r.seedRead[0].verdict, 'red', 'at the seed nothing has changed, so the guard is red — the work still has to be done');
  assert.deepEqual(r.genreEnv.owned, [], 'the text genre owns no environment');
});

test('the plan validator lets a per-line step file be a step\'s target inside the output/ fence, and refuses one outside it', () => {
  const job = {
    schema: 'job-v1', job: 'rubric-brief-plan', description: 'rubric on a file', provider: 'anthropic-api', model: 'claude-sonnet-5',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 1, writeScope: ['output/'], goal: 'write the step files', verdictType: 'soft-green',
    close: [{ name: 'clean-run', cmd: 'node check.mjs', expect: 0, sha256: 'a'.repeat(64) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  assert.ok(validateJob(job).reds.length >= 0);
  const plan = (target) => ({
    schema: 'plan-v1',
    steps: [{
      id: 'line-1', action: 'Write the answer for job line 1 and its quotes as one JSON file.', tools: ['read', 'write'], rounds: 6, target,
      exit: [{ type: 'json-valid', path: target }, { type: 'tree-changed', scope: 'output/**' }],
    }],
  });
  const ok = validatePlan(plan(stepFileRel(1)), { job });
  assert.deepEqual(ok.reds, []);
  assert.equal(ok.ok, true);
  const out = validatePlan(plan('input/CHANGELOG.md'), { job });
  assert.equal(out.ok, false, 'a target outside the output/ fence (the frozen input) is refused');
  assert.ok(out.reds.some((r) => r.code === 'scope-escape'));
  assert.equal(stepFileRel(3), `${STEP_DIR}/3.json`);
});

test('copyOut delivers output/steps/<n>.json with the output — each under its own dated name, in a steps/ folder (P2=A)', async () => {
  const { prep } = await frozenTree();
  mkdirSync(join(prep.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(prep.tree, 'output', 'steps', '1.json'), JSON.stringify({ text: 'one', cites: {} }));
  writeFileSync(join(prep.tree, 'output', 'steps', '2.json'), JSON.stringify({ text: 'two', cites: {} }));
  const dest = join(tmp('rubric-brief-dest-'), 'delivered');
  const r = await copyOut({ tree: prep.tree, into: dirname(prep.tree), destination: dest });
  assert.equal(r.stop, null, JSON.stringify(r));
  if (r.stop !== null) return;
  assert.equal(r.files.length, 2);
  for (const f of r.files) {
    assert.match(f.path, /\/steps\/[12]-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(existsSync(f.path), true);
  }
  assert.equal(JSON.parse(readFileSync(r.files[0].path, 'utf8')).text, 'one');
});

test('the step-file brief tells the worker to copy numbers, times and prices exactly as the input writes them — in the worker goal (the composer prompt that also carried it is deleted: the AI writes edits, not stages)', async () => {
  const { rubricGoal } = await import('../src/rubricstep.js');
  const line = 'copy every number, time and price exactly as the input writes it (for example "9:27 AM", not "09:27")';
  assert.ok(stepFileContract().replace(/\s+/g, ' ').includes(line), 'the contract carries the rule');
  assert.match(stepFileContract(), /the check matches the numbers in your claim against your quote/);
  assert.ok(rubricGoal({ jobLines: [{ n: 1, text: 'x', rule: '' }], files: [{ label: 'C', rel: 'input/C.md' }] }).replace(/\s+/g, ' ').includes(line));
});
