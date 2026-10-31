// The seed note (src/seednote.js; EXPERIMENTAL, default off; docs/logs/SEEDGAP-PREREG.md): what the job's own count check said on the
// untouched tree, handed to the planner's first draft and to the first worker of the first step, once. Real runJob, real declared close
// executor, real preflight; only the model is scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { redactSecrets } from '../src/validate.js';
import { buildSeedNote, SEED_NOTE_HEADING } from '../src/seednote.js';
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';

const SECRET = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD';

/** a patient with a count stage red at seed (9 ERR lines against baseline 0) AND a command-exit stage red at seed (prints a marker, exits 1) */
function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'seednote-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'src', 'count.txt'), '9\n');
  writeFileSync(join(dir, 'check-count.mjs'), `import { readFileSync } from 'node:fs';
const n = Number(readFileSync(new URL('./src/count.txt', import.meta.url).pathname, 'utf8').trim() || '0');
for (let i = 0; i < n; i++) console.log('ERR' + i + ' not ok ' + i + ' - the failing title ${SECRET}');
process.exit(0);
`);
  writeFileSync(join(dir, 'noisy.mjs'), "console.log('CMDNOISE-LINE passing tap output'); process.exit(1);\n");
  initPatientRepo(dir);
  const spineDir = mkdtempSync(join(tmpdir(), 'seednote-spine-'));
  t.after(() => rmSync(spineDir, { recursive: true, force: true }));
  return { dir, spine: join(spineDir, 'spine.jsonl') };
}

const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({
  name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
}));
const COUNT_STAGE = {
  name: 'count-stage', kind: 'count-not-worse',
  params: {
    cmd: 'node', args: ['check-count.mjs'],
    parser: { terms: [{ lineMatch: 'ERR\\d+', sign: 1, aggregate: 'sum', region: 'whole-output' }] },
    scope: { includePrefixes: ['src/'] }, direction: 'lower-is-better', baseline: 0,
  },
};
const NOISY_STAGE = { name: 'noisy-exit', kind: 'command-exit', params: { cmd: 'node', args: ['noisy.mjs'], expectExit: 0 } };

const jobOf = (over = {}) => ({
  schema: 'job-v1', job: 'seed-note-patient', description: 'a declared count stage red at seed',
  provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'],
  goal: 'Lower the value in src/count.txt to 0.', verdictType: 'green',
  closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], NOISY_STAGE, COUNT_STAGE, guards[1]] },
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' }, ...over,
});
const approve = (job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];
const PLAN = (steps) => JSON.stringify({ schema: 'plan-v1', steps });
const STEP = (id, rounds = 4) => ({ id, action: `Lower src/count.txt (${id}).`, tools: ['write'], rounds, target: 'src/count.txt', exit: [{ type: 'tree-changed', scope: 'src/**' }] });
const wr = (dir, n, id) => ({ toolCalls: [{ id, name: 'shell_write', arguments: { path: join(dir, 'src', 'count.txt'), content: `${n}\n` } }] });
/** the first user prompt of every ask (one array per ask) */
const askPrompts = (provider) => [...new Set(provider.messagesLog)].map((m) => m.find((x) => x.role !== 'system').content);

async function drive(t, over, script) {
  const { dir, spine } = makePatient(t);
  const job = jobOf(over);
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);
  const provider = scriptedProvider(script(dir));
  const outcome = await runJob(job, { approvals: approve(job), workdir: dir, provider, emit: makeSpine(spine), capRuns: 2 });
  const events = readSpine(spine);
  const norm = (p) => p.split(dir).join('<wd>');
  return { outcome, events, prompts: askPrompts(provider).map(norm), dir, provider };
}

// iteration 1 writes nothing (the step's tree-changed stays red), iteration 2 writes: two step tries, one step
const twoTries = (dir) => [
  { text: 'src/count.txt holds a number.' },
  { text: PLAN([STEP('s1')]) },
  { text: 'I looked and wrote nothing' },
  wr(dir, 5, 'a'), { text: 'wrote' },
  wr(dir, 3, 'b'), { text: 'wrote' }, wr(dir, 2, 'c'), { text: 'wrote' }, { text: 'never' },
];
// two steps: the first writes at once, the second starts afterwards
const twoSteps = (dir) => [
  { text: 'scout' },
  { text: PLAN([STEP('s1'), STEP('s2')]) },
  wr(dir, 5, 'a'), { text: 'wrote' },
  wr(dir, 3, 'b'), { text: 'wrote' }, wr(dir, 2, 'c'), { text: 'wrote' }, { text: 'never' },
];

test('ON: the count-not-worse text reaches the planner and the first worker of step 1 once; command-exit and changed-from-seed text do not', async (t) => {
  const { events, prompts } = await drive(t, { seedNote: true }, twoTries);
  const planner = prompts.find((p) => p.includes('Goal:') && p.includes('"rounds"'));
  assert.ok(planner, 'found the planner prompt');
  assert.ok(planner.includes(SEED_NOTE_HEADING), 'planner is told');
  const at = planner.indexOf(SEED_NOTE_HEADING);
  const block = planner.slice(at, planner.indexOf('\nRepository survey'));
  console.log(`--- real block (planner prompt) ---\n${block}\n--- end ---`);
  assert.match(block, /not ok \d+ - the failing title/, 'the count stage\'s own text, as rendered');
  assert.ok(!block.includes('CMDNOISE-LINE'), 'command-exit text is dropped');
  assert.ok(!/nothing changed|changed-from-seed/i.test(block), 'changed-from-seed text is dropped');
  assert.ok(!block.includes(SECRET), 'secret masked');
  // worker: iteration 1 of step 1 carries it; iteration 2 does not
  const workers = prompts.filter((p) => p.startsWith('Lower src/count.txt (s1)'));
  assert.ok(workers.length >= 2, `step 1 had two tries (${workers.length})`);
  assert.ok(workers[0].includes(SEED_NOTE_HEADING), 'first worker told');
  assert.ok(!workers[1].includes(SEED_NOTE_HEADING), 'iteration 2 is not');
  assert.ok(workers[1].includes('Previous attempt failed'), 'iteration 2 has its gap');
  const notes = events.filter((e) => e.type === 'seed-note');
  assert.deepEqual(notes.map((e) => e.to), ['planner', 'worker']);
  assert.deepEqual(notes[0].stages, ['count-stage']);
  assert.equal(notes[0].chars, notes[1].chars);
  assert.deepEqual(Object.keys(notes[0]).filter((k) => !['type', 'seq', 'ts', 'runId'].includes(k)).sort(), ['chars', 'stages', 'to'], 'counts and names only');
  assert.ok(!JSON.stringify(notes).includes('failing title'), 'no text on the spine');
});

test('ON: only the FIRST step\'s first try carries it (step 2 does not)', async (t) => {
  const { prompts } = await drive(t, { seedNote: true }, twoSteps);
  const s1 = prompts.filter((p) => p.startsWith('Lower src/count.txt (s1)'));
  const s2 = prompts.filter((p) => p.startsWith('Lower src/count.txt (s2)'));
  assert.ok(s1.length >= 1 && s2.length >= 1);
  assert.ok(s1[0].includes(SEED_NOTE_HEADING));
  assert.ok(s2.every((p) => !p.includes(SEED_NOTE_HEADING)));
});

test('OFF (absent and false): no block anywhere, no record, and every prompt is byte-identical to ON with the block cut out', async (t) => {
  const on = await drive(t, { seedNote: true }, twoTries);
  const off = await drive(t, {}, twoTries);
  const offFalse = await drive(t, { seedNote: false }, twoTries);
  for (const r of [off, offFalse]) {
    assert.ok(r.prompts.every((p) => !p.includes(SEED_NOTE_HEADING)));
    assert.equal(r.events.filter((e) => e.type === 'seed-note').length, 0);
  }
  assert.deepEqual(off.prompts, offFalse.prompts, 'absent and false are the same bytes');
  const chars = on.events.find((e) => e.type === 'seed-note').chars;
  const text = on.prompts.find((p) => p.includes(SEED_NOTE_HEADING));
  const block = text.slice(text.indexOf(SEED_NOTE_HEADING), text.indexOf(SEED_NOTE_HEADING) + chars);
  // planner: rendered as `\n<block>\n`; worker: joined to its neighbours with a blank line
  const cut = on.prompts.map((p) => (p.includes(`\n${block}\n`) ? p.replace(`\n${block}\n`, '') : p.replace(`\n\n${block}`, '')));
  assert.deepEqual(cut, off.prompts, 'ON minus the block == OFF, prompt by prompt (planner and worker)');
});

test('a command close (no declared kinds) keeps nothing, and a green-at-seed count stage keeps nothing', () => {
  assert.equal(buildSeedNote([{ stage: 'verdict', kind: undefined, gap: 'FAILED x' }], (s) => s), null);
  assert.equal(buildSeedNote([{ stage: 'a', kind: 'command-exit', gap: 'noise' }, { stage: 'b', kind: 'files-changed', gap: 'none' }], (s) => s), null);
  assert.equal(buildSeedNote([{ stage: 'c', kind: 'count-not-worse', gap: '   ' }], (s) => s), null);
  assert.equal(buildSeedNote([], (s) => s), null);
});

test('buildSeedNote: keeps count-not-worse reds once per stage, in order, masked with the run\'s scrub', () => {
  const r = buildSeedNote([
    { stage: 'c1', kind: 'count-not-worse', gap: `not ok 1 - t ${SECRET}` },
    { stage: 'c1', kind: 'count-not-worse', gap: 'duplicate' },
    { stage: 'n', kind: 'command-exit', gap: 'noise' },
    { stage: 'c2', kind: 'count-not-worse', gap: 'second' },
  ], redactSecrets);
  assert.deepEqual(r.stages, ['c1', 'c2']);
  assert.ok(r.text.startsWith(`${SEED_NOTE_HEADING}\n`));
  assert.ok(!r.text.includes(SECRET) && r.text.includes('not ok 1 - t'));
  assert.ok(!r.text.includes('noise') && !r.text.includes('duplicate'));
});

test('the switch enters the signed hash only when present; a non-boolean is a red', () => {
  const base = jobOf();
  assert.ok(!('seedNote' in base));
  assert.notEqual(jobSpecHash(base), jobSpecHash({ ...base, seedNote: true }));
  assert.notEqual(jobSpecHash(base), jobSpecHash({ ...base, seedNote: false }));
  // pinned: the pre-field hash of a small spec (same value handoff-note.test.js pins) is unchanged by this field existing
  assert.equal(jobSpecHash({ schema: 'job-v1', job: 'old-spec', thinking: false, budgetUsd: 1, writeScope: ['a/**'] }), 'e6ca118c3f6cf71646334ffc3b5fa67ea52e7e0d023d3e711f458237fa6aa96e');
  assert.equal(validateJob({ ...base, seedNote: 'yes' }).reds.some((r) => r.path === 'seedNote'), true);
  assert.equal(validateJob({ ...base, seedNote: true }, { shellCapUsd: base.budgetUsd }).reds.some((r) => r.path === 'seedNote'), false);
});
