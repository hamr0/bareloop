// PART 1a, deliverable 2 — the step-file contract reaches BOTH readers of it: the composer's prompt (src/authorflow.js
// `rubricAuthorPrompt`) and the worker's goal (src/rubricstep.js `rubricGoal`); the plan validator lets a per-line step file
// be a step's target (src/plan.js); and the copy-out delivers `output/steps/` with the rest of the output (src/source.js).
// Real data: a copy of this repo's CHANGELOG.md frozen by the real door; the real seed listing; a scripted model boundary
// that can only DELIVER a declaration (it cannot spend).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorPrompt, authorClose, DECLARATION_TOOL_NAME, FILL_MARKER, GREEN_QUESTIONS } from '../src/authorflow.js';
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

test('the composer prompt for the text genre carries the step-file contract, the numbered lines, the labelled inputs and the guard to fill — and nothing of a repository genre', () => {
  const prompt = authorPrompt({
    answers: { 1: '1. Summarize the unreleased changes\n   rule: under 200 words' }, questions: { 1: GREEN_QUESTIONS[1] },
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, listingBlock: 'FILES THAT ACTUALLY EXIST AT THE SEED\n  input/CHANGELOG.md',
    lang: RUBRIC_LANG, verdictType: 'soft-green', guards: guards(), catalogue: catalogueForLang(RUBRIC_LANG),
    writeScope: ['output/'], jobLines: JOB_LINES, inputs: INPUTS,
  });
  assert.ok(prompt.includes(stepFileContract()), 'the SAME contract text the worker is given');
  assert.match(prompt, /output\/steps\/N\.json/);
  assert.match(prompt, /1 Changelog \/x\/CHANGELOG\.md/);
  assert.match(prompt, /The person's job has 2 numbered lines/);
  assert.match(prompt, /files-changed/);
  assert.ok(prompt.includes(FILL_MARKER), 'the guard\'s allowPrefixes slot is the model\'s');
  assert.match(prompt, /output\//);
  assert.match(prompt, new RegExp(`Call the ${DECLARATION_TOOL_NAME} tool exactly once`));
  for (const gone of ['TYPES', 'type checker', 'KNOWN INSTRUMENTS', 'MYPYPATH', 'read-only survey of their repository']) {
    assert.equal(prompt.includes(gone), false, `a repo-genre phrase leaked into the text-genre prompt: ${gone}`);
  }
  // and a CODE language is untouched by this branch
  const code = authorPrompt({
    answers: { 1: 'fix' }, questions: { 1: GREEN_QUESTIONS[1] }, facts: { a: 1 }, listingBlock: '', lang: 'js', verdictType: 'green',
    guards: classGuards({ verdictType: 'green', lang: 'js' }),
  });
  assert.ok(code.includes('KNOWN INSTRUMENTS') && code.includes('THE GENRE TEMPLATE'));
  assert.equal(code.includes('output/steps'), false);
});

test('authorClose on the text genre end to end: no scout facts needed beyond the inputs, the real hidden-git listing is selected from, the declaration validates and is seed-read', async () => {
  const { prep, file } = await frozenTree();
  const seen = [];
  const generate = async (messages, tools) => {
    seen.push(messages);
    const tool = tools.find((t) => t.name === DECLARATION_TOOL_NAME);
    await tool.execute({
      stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }],
      refused: [{ line: 1, reason: 'fixture' }, { line: 2, reason: 'fixture' }],
    });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  assert.ok(listing.files.includes('input/CHANGELOG.md'));
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Summarize\n2. List' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: JOB_LINES, inputs: [{ n: 1, label: 'Changelog', value: file }],
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.ok(seen.length >= 1);
  assert.match(seen[0][0].content, /THE STEP FILES/);
  assert.deepEqual(r.declaration.stages.map((s) => s.name), ['changed-from-seed']);
  assert.equal(r.seedRead.length, 1);
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
