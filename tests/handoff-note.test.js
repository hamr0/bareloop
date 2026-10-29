// The handoff note (src/handoff.js, F253): a code-written map of the files earlier workers in the run read,
// appended to the next step/fix ask's first prompt. Scripted provider, real Loop, real Gate, real LiteCtx index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { scriptedProvider, patientGitEnv } from './helpers.js';
import { tcall, makePatient, JOB, PLAN, go } from './planrun-fixtures.js';
import { jobSpecHash, validateJob } from '../src/job.js';
import { createHandoffStore, isHandoffExcluded, HANDOFF_CAP, HANDOFF_HEADING } from '../src/handoff.js';

/** The first user prompt of every ask. The provider logs the live transcript array (it grows as the ask goes), so one array = one ask. */
const askPrompts = (provider) => [...new Set(provider.messagesLog)].map((m) => m.find((x) => x.role !== 'system').content);

/** A patient whose src/mod.mjs has a named function, so the index has a symbol to map. */
const patient = (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export function alpha(a) {\n  return a + 1;\n}\n\nexport function beta(b) {\n  return b * 2;\n}\n');
  // LiteCtx indexes tracked files only, so the file is committed (a real patient's files are).
  const git = (args) => execFileSync('git', args, { cwd: wd, env: patientGitEnv() });
  git(['add', 'src/mod.mjs']);
  git(['commit', '-q', '-m', 'mod']);
  return wd;
};

const TOOLS = ['read', 'write', 'edit', 'recall', 'get'];
const twoSteps = () => JSON.stringify({
  schema: 'plan-v1',
  steps: [
    { id: 'look', action: 'Read src/mod.mjs and write tests/test_x.mjs.', tools: ['read', 'write'], rounds: 6, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] },
    { id: 'more', action: 'Write tests/test_y.mjs.', tools: ['write', 'recall', 'get'], rounds: 6, target: 'tests/test_y.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] },
  ],
});
const READING_STEP = {
  id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
  tools: ['read', 'write'], rounds: 6, target: 'tests/test_x.mjs',
  exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
};
const readMod = (wd) => tcall('r1', 'shell_read', { path: join(wd, 'src', 'mod.mjs') });
const w = (wd, name, content) => tcall(`w-${name}`, 'shell_write', { path: join(wd, 'tests', name), content });

function twoStepScript(wd) {
  return [
    { text: 'scout notes' },
    { text: twoSteps() },
    { toolCalls: [readMod(wd)] },
    { toolCalls: [w(wd, 'test_x.mjs', 'ok — x\n')] },
    { text: 'step one done' },
    { toolCalls: [w(wd, 'test_y.mjs', 'ok — y\n')] },
    { text: 'step two done' },
  ];
}

test('step 2 first prompt carries the note naming the file step 1 read, with its line count and map; a spine record counts paths', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider(twoStepScript(wd));
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS }) });
  assert.equal(outcome, 'green');
  const prompts = askPrompts(provider);
  const stepOne = prompts.find((p) => p.includes('Read src/mod.mjs and write'));
  const stepTwo = prompts.find((p) => p.includes('Write tests/test_y.mjs.'));
  assert.ok(stepOne && stepTwo, 'found both step prompts');
  assert.ok(!stepOne.includes(HANDOFF_HEADING), 'step 1 reads nothing before it: no note');
  assert.ok(stepTwo.includes(HANDOFF_HEADING), 'step 2 gets the note');
  assert.match(stepTwo, /^- src\/mod\.mjs \(\d+ lines\)/m);
   assert.match(stepTwo, /^- src\/mod\.mjs \(\d+ lines\): \S+ \d+-\d+/m, 'the map comes from the LiteCtx index: symbol + line range');
  const recs = events.filter((e) => e.type === 'handoff-note');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].phase, 'step:more');
  assert.equal(recs[0].paths, 1);
  assert.equal(typeof recs[0].chars, 'number');
  assert.ok(!('text' in recs[0]) && !JSON.stringify(recs[0]).includes('mod.mjs'), 'a count, never content');
});

test('a retry of the same step carries the reads of its attempt 1', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd, [READING_STEP]) },
    { toolCalls: [readMod(wd)] },
    { toolCalls: [w(wd, 'test_x.mjs', 'not yet\n')] },
    { text: 'wrote a test' },
    { toolCalls: [w(wd, 'test_x.mjs', 'ok — fixed\n')] },
    { text: 'fixed' },
  ]);
  const { outcome } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS }) });
  assert.equal(outcome, 'green');
  const prompts = askPrompts(provider);
  const attempts = prompts.filter((p) => p.includes('Write tests/test_x.mjs asserting'));
  assert.equal(attempts.length, 2);
  assert.ok(!attempts[0].includes(HANDOFF_HEADING));
  assert.ok(attempts[1].includes(HANDOFF_HEADING) && /^- src\/mod\.mjs \(\d+ lines\)/m.test(attempts[1]), 'attempt 2 is handed attempt 1\'s read');
});

test('a scout read feeds the first step; scout and drafter prompts are byte-identical with the note on and off', async (t) => {
  const scoutReads = (wd) => [
    { toolCalls: [readMod(wd)] },
    { text: 'scout notes' },
    { text: PLAN(wd, [READING_STEP]) },
    { toolCalls: [w(wd, 'test_x.mjs', 'ok\n')] },
    { text: 'done' },
  ];
  const run = async (over) => {
    const wd = patient(t);
    const provider = scriptedProvider(scoutReads(wd));
    const { outcome, events } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS, ...over }) });
    assert.equal(outcome, 'green');
    return { wd, prompts: askPrompts(provider), events };
  };
  const on = await run({});
  const off = await run({ handoffNote: false });
  const norm = (r, p) => p.split(r.wd).join('<wd>');
  assert.equal(norm(on, on.prompts[0]), norm(off, off.prompts[0]), 'scout prompt identical');
  assert.equal(norm(on, on.prompts[1]), norm(off, off.prompts[1]), 'drafter prompt identical');
  assert.ok(!on.prompts[0].includes(HANDOFF_HEADING) && !on.prompts[1].includes(HANDOFF_HEADING));
  assert.ok(on.prompts[2].includes(HANDOFF_HEADING) && /- src\/mod\.mjs/.test(on.prompts[2]), 'the scout\'s read reaches step 1');
  assert.ok(!off.prompts[2].includes(HANDOFF_HEADING));
});

test('handoffNote:false: no note in any prompt and no spine record', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider(twoStepScript(wd));
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS, handoffNote: false }) });
  assert.equal(outcome, 'green');
  assert.ok(askPrompts(provider).every((p) => !p.includes(HANDOFF_HEADING)));
  assert.equal(events.filter((e) => e.type === 'handoff-note').length, 0);
});

test('the cap trims the OLDEST paths first and says how many', () => {
  const store = createHandoffStore({ workdir: '/job' });
  const n = 400;
  store.absorb(Array.from({ length: n }, (_, i) => `/job/src/file-${String(i).padStart(4, '0')}-${'x'.repeat(40)}.js`));
  const { text, paths } = store.render();
  assert.ok(text.length <= HANDOFF_CAP, `${text.length} <= ${HANDOFF_CAP}`);
  const dropped = n - paths;
  assert.ok(dropped > 0);
  assert.ok(text.includes(`[trimmed: ${dropped} older path(s)]`));
  assert.ok(!text.includes('file-0000-') && text.includes(`file-${String(n - 1).padStart(4, '0')}-`), 'newest kept, oldest gone');
});

test('arbiter books, .git, and anything outside the job root never appear', async (t) => {
  for (const rel of ['.smoke/spine.jsonl', '.smoke/attempt-diff/1.json', '.litectx/index.db', 'gate-audit.jsonl', '.git/config', 'a/.git/HEAD', '../outside.txt', '/etc/passwd']) {
    assert.ok(isHandoffExcluded(rel), rel);
  }
  assert.ok(!isHandoffExcluded('src/mod.mjs') && !isHandoffExcluded('.gitignore') && !isHandoffExcluded('docs/.github/x.md'));
  const store = createHandoffStore({ workdir: '/job' });
  store.absorb(['/job/.smoke/spine.jsonl', '/job/.litectx/x', '/job/gate-audit.jsonl', '/job/.git/config', '/outside/f.js', '/job/src/ok.js']);
  const { text, paths } = store.render();
  assert.equal(paths, 1);
  assert.ok(text.includes('src/ok.js') && !/smoke|litectx|gate-audit|\.git\/|outside/.test(text.replace(HANDOFF_HEADING, '')));
  // and end to end: a worker that reads a book (the gate denies it) or .git (allowed) leaves neither in the next prompt
  const wd = patient(t);
  mkdirSync(join(wd, '.smoke'), { recursive: true });
  writeFileSync(join(wd, '.smoke', 'spine.jsonl'), '{}\n');
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: twoSteps() },
    { toolCalls: [tcall('b1', 'shell_read', { path: join(wd, '.smoke', 'spine.jsonl') }), tcall('b2', 'shell_read', { path: join(wd, '.git', 'HEAD') }), readMod(wd)] },
    { toolCalls: [w(wd, 'test_x.mjs', 'ok — x\n')] },
    { text: 'one' },
    { toolCalls: [w(wd, 'test_y.mjs', 'ok — y\n')] },
    { text: 'two' },
  ]);
  const { outcome } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS }) });
  assert.equal(outcome, 'green');
  const stepTwo = askPrompts(provider).find((p) => p.includes('Write tests/test_y.mjs.'));
  assert.ok(stepTwo.includes('- src/mod.mjs'));
  assert.ok(!/\.smoke|\.git\b|gate-audit/.test(stepTwo.slice(stepTwo.indexOf(HANDOFF_HEADING))), 'no book path in the note');
});

test('an old spec without the field keeps its hash; the switch itself enters the hash; a non-boolean is a red', (t) => {
  const wd = patient(t);
  const base = JOB(wd);
  assert.ok(!('handoffNote' in base));
  const withOff = { ...base, handoffNote: false };
  const withOn = { ...base, handoffNote: true };
  assert.notEqual(jobSpecHash(base), jobSpecHash(withOff), 'switching it off is a different signed spec');
  assert.notEqual(jobSpecHash(base), jobSpecHash(withOn));
  // pinned: the hash this spec had BEFORE the field existed (computed by the pre-change src/job.js) — an old signed spec keeps it
  assert.equal(jobSpecHash({ schema: 'job-v1', job: 'old-spec', thinking: false, budgetUsd: 1, writeScope: ['a/**'] }), 'e6ca118c3f6cf71646334ffc3b5fa67ea52e7e0d023d3e711f458237fa6aa96e');
  assert.equal(validateJob(withOff).reds.length, 0);
  assert.equal(validateJob({ ...base, handoffNote: 'no' }).reds.some((r) => r.path === 'handoffNote'), true);
});
