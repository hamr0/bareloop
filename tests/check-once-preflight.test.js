// hamr 2026-11-22 (run mwsblixt: the suite ran 10.5 + 23.5 min + a 3rd run before any step): the run-start PREFLIGHT loop is ONE check pass,
// because the tree is unchanged through it. A command read by several menu stages runs once there; the precheck, the step exits and the final
// close each take their own fresh pass. The command here counts its own runs in a gitignored file, so "once" is read off the world.
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
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';

function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-once-pf-'));
  const spineDir = mkdtempSync(join(tmpdir(), 'check-once-pf-spine-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(spineDir, { recursive: true, force: true }); });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\nruns.txt\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exit(0); }
console.log('FAILED src/fix.js - missing or has no ok marker'); process.exit(1);\n`);
  // a command that records each run of itself (always green)
  writeFileSync(join(dir, 'counter.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync(new URL('./runs.txt', import.meta.url).pathname, process.argv[2] + '\\n'); process.exit(0);\n`);
  const seed = initPatientRepo(dir);
  const runs = () => { try { return readFileSync(join(dir, 'runs.txt'), 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  return { dir, seed, spine: join(spineDir, 'spine.jsonl'), runs };
}

const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({
  name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
}));
const counter = (name, tag) => ({ name, kind: 'command-exit', params: { cmd: 'node', args: ['counter.mjs', tag], expectExit: 0 } });

const jobOf = (counters) => ({
  schema: 'job-v1', job: 'check-once-preflight', description: 'preflight reads a command once', provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'],
  goal: 'Create src/fix.js with an ok marker so the check passes.', verdictType: 'green',
  closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], ...counters, { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }, guards[1]] },
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
});

async function runIt(t, counters) {
  const { dir, spine, runs } = makePatient(t);
  const job = jobOf(counters);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'write-fix', action: 'Create src/fix.js containing the ok marker.', tools: ['write'], rounds: 6, target: 'src/fix.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }] }] }) },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'src', 'fix.js'), content: '// ok\n' } }] },
    { text: 'wrote it' },
  ]);
  const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: dir, provider, emit: makeSpine(spine) });
  return { outcome, events: readSpine(spine), runs: runs() };
}

test('three stages reading one command: the preflight loop runs it ONCE; each stage keeps its own verdict and check-preflight record; precheck and final close are fresh passes', async (t) => {
  const { outcome, events, runs } = await runIt(t, [counter('one', 'a'), counter('two', 'a'), counter('three', 'a')]);
  assert.equal(outcome, 'green', JSON.stringify(events.filter((e) => e.type === 'escalation')));
  const pf = events.filter((e) => e.type === 'check-preflight');
  for (const n of ['one', 'two', 'three']) assert.equal(pf.find((e) => e.name === n)?.verdict, 'satisfied', `${n} keeps its own verdict`);
  assert.equal(pf.filter((e) => ['one', 'two', 'three'].includes(e.name)).length, 3, 'one check-preflight record per stage');
  // precheck 1 + preflight 1 (not 3): the precheck is its own fresh pass, so the preflight runs the command again (2, never 1)
  assert.equal(runs.length, 2, `ran ${runs.length} times`);
});

test('two different commands still each run once per pass', async (t) => {
  const { outcome, runs } = await runIt(t, [counter('one', 'a'), counter('two', 'a'), counter('other', 'b')]);
  assert.equal(outcome, 'green');
  assert.deepEqual([runs.filter((x) => x === 'a').length, runs.filter((x) => x === 'b').length], [2, 2], 'each command: one precheck run + one preflight run');
});
