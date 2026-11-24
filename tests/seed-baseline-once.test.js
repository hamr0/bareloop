// hamr 2026-11-23 (run mwsfq0pi leg 3: tests-kept-executed took 10.4 min): a count stage whose baseline is the SEED measures its command in a detached worktree of the
// seed tree. The seed tree is fixed for the whole run, so that reading is kept by command + seed TREE id (never the directory) and reused by every pass; the
// reading of the CURRENT tree stays fresh. The command logs the directory it ran in, so "run in the seed worktree" is read off the world, never off a mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { runStateFile } from '../src/carrystore.js';
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';

const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({
  name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
}));

function makePatient(t, { atSeed = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'seed-once-'));
  const side = mkdtempSync(join(tmpdir(), 'seed-once-side-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(side, { recursive: true, force: true }); });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'count.txt'), '2\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  const log = join(side, 'cwds.txt');
  writeFileSync(join(dir, 'count.mjs'), `import { readFileSync, appendFileSync } from 'node:fs';
appendFileSync(process.argv[2], process.cwd() + '\\n');
const n = Number(readFileSync('src/count.txt', 'utf8').trim() || '0');
for (let i = 0; i < n; i++) console.log('ERR' + i + ' at src/count.txt');
process.exit(0);\n`);
  const seed = initPatientRepo(dir);
  // a tree already changed from its seed (a resumed run, or the work so far): 2 at the seed, 3 now (worse, so the precheck is red)
  if (!atSeed) writeFileSync(join(dir, 'src', 'count.txt'), '3\n');
  const cwds = () => { try { return readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  return { dir, seed, side, spine: join(side, 'spine.jsonl'), log, cwds };
}

const jobOf = (log) => ({
  schema: 'job-v1', job: 'seed-baseline-once', description: 'the seed baseline is read once per run', provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'],
  goal: 'Lower the value in src/count.txt to 1.', verdictType: 'green',
  closeDecl: {
    genre: GENRE, lang: 'js',
    stages: [guards[0], {
      name: 'count-stage', kind: 'count-not-worse',
      params: { cmd: 'node', args: ['count.mjs', log], parser: { terms: [{ lineMatch: 'ERR\\d+', sign: 1, aggregate: 'sum', region: 'whole-output' }] }, scope: { includePrefixes: ['src/'] }, direction: 'lower-is-better', baseline: 'seed' },
    }, guards[1]],
  },
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
});

test('the seed-baseline reading runs ONCE in the run: precheck, preflight, the step exit and the final close all take it; the current tree is read fresh every time', async (t) => {
  const p = makePatient(t);
  const job = jobOf(p.log);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'lower', action: 'Set src/count.txt to 1.', tools: ['write'], rounds: 6, target: 'src/count.txt', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'count-stage' }] }] }) },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(p.dir, 'src', 'count.txt'), content: '1\n' } }] },
    { text: 'done' },
  ]);
  const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: p.dir, provider, emit: makeSpine(p.spine) });
  const events = readSpine(p.spine);
  assert.equal(outcome, 'green', JSON.stringify(events.filter((e) => ['escalation', 'outer-close', 'close-verdict', 'fix-loop'].includes(e.type))).slice(0, 2500));
  const all = p.cwds();
  const here = all.filter((c) => c === p.dir || c.endsWith(p.dir));
  const seedRuns = all.filter((c) => !here.includes(c));
  assert.equal(seedRuns.length, 1, `the seed worktree ran the command ${seedRuns.length} times: ${all.join(' | ')}`);
  assert.ok(here.length >= 3, `the current tree was read fresh in each pass (${here.length} reads)`);
});

test('a second leg reads the saved seed baseline from the state file: 0 more seed runs', async (t) => {
  const p = makePatient(t);
  const job = jobOf(p.log);
  const leg = async (tag, resumeBranch) => {
    const spine = join(tmpdir(), `${tag}-${Date.now()}.jsonl`);
    const provider = { calls: [], async generate() { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); } };
    const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: p.dir, provider, emit: makeSpine(spine), stateFile: runStateFile(p.side), ...(resumeBranch ? { resumeBranch } : {}) });
    const events = readSpine(spine);
    rmSync(spine, { force: true });
    return { outcome, events, branch: events.find((e) => e.type === 'work-branch')?.branch ?? null };
  };
  const seedRuns = () => p.cwds().filter((c) => !(c === p.dir || c.endsWith(p.dir))).length;
  const l1 = await leg('l1', null);
  assert.ok(l1.branch, JSON.stringify(l1.events.filter((e) => e.type === 'escalation')));
  assert.equal(seedRuns(), 1);
  await leg('l2', l1.branch);
  assert.equal(seedRuns(), 1, 'leg 2 did not measure the seed again');
});

test('F395: leg 1 at the seed in place, the AI then edits, a later leg reads the seed count from the state file: the command runs ONCE (the current tree), never in the seed worktree', async (t) => {
  const p = makePatient(t, { atSeed: true });
  const job = jobOf(p.log);
  const leg = async (tag, resumeBranch) => {
    const spine = join(p.side, `${tag}.jsonl`);
    const provider = { calls: [], async generate() { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); } };
    await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: p.dir, provider, emit: makeSpine(spine), stateFile: runStateFile(p.side), ...(resumeBranch ? { resumeBranch } : {}) });
    const events = readSpine(spine);
    return { events, branch: events.find((e) => e.type === 'work-branch')?.branch ?? null };
  };
  const l1 = await leg('l1', null);
  assert.ok(l1.branch, JSON.stringify(l1.events.filter((e) => e.type === 'escalation')));
  const afterLeg1 = p.cwds().length;
  assert.equal(afterLeg1, 1, 'leg 1: the tree is at the seed, so the one in-place run is the seed reading');
  writeFileSync(join(p.dir, 'src', 'count.txt'), '3\n'); // the AI edited between legs
  await leg('l2', l1.branch);
  const leg2 = p.cwds().slice(afterLeg1);
  assert.equal(leg2.length, 1, `leg 2 ran the command ${leg2.length} times: ${leg2.join(' | ')}`);
  assert.ok(leg2[0] === p.dir || leg2[0].endsWith(p.dir), 'and it was the current tree, not the seed worktree');
});
