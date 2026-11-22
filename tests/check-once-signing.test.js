// hamr 2026-11-22 (run mwsblixt: "checking signing gates" ran 4 times in one drafting session, each running the whole suite again on the SAME
// seed tree, ~38 min): the signing gates of ONE draft session share their completed seed-read results through a session-owned Map
// (`seedShare`), keyed by the command + the seed TREE. A timed-out or killed command is never kept; the run-start precheck and preflight never
// see the map. The command here counts its own runs in a gitignored file, so "once" is read off the world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE, prepareSigning } from '../src/authorjob.js';
import { readSpine, scriptedProvider, initPatientRepo, gitInPatient } from './helpers.js';

function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-once-sg-'));
  const spineDir = mkdtempSync(join(tmpdir(), 'check-once-sg-spine-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(spineDir, { recursive: true, force: true }); });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\nruns.txt\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exit(0); }
console.log('FAILED src/fix.js - missing or has no ok marker'); process.exit(1);\n`);
  // a command that records each spawn of itself, then (optionally) hangs for argv[3] ms
  writeFileSync(join(dir, 'counter.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync(new URL('./runs.txt', import.meta.url).pathname, process.argv[2] + '\\n');
await new Promise((r) => setTimeout(r, Number(process.argv[3] || 0))); process.exit(0);\n`);
  const seed = initPatientRepo(dir);
  const runs = () => { try { return readFileSync(join(dir, 'runs.txt'), 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  return { dir, seed, spine: join(spineDir, 'spine.jsonl'), runs };
}

const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({
  name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
}));
const counter = (name, tag, extra = {}) => ({ name, kind: 'command-exit', params: { cmd: 'node', args: ['counter.mjs', tag, ...(extra.sleepMs ? [String(extra.sleepMs)] : [])], expectExit: 0, ...(extra.timeoutMs ? { timeoutMs: extra.timeoutMs } : {}) } });

const jobOf = (counters) => ({
  schema: 'job-v1', job: 'check-once-signing', description: 'signing gates read a command once', provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'],
  goal: 'Create src/fix.js with an ok marker so the check passes.', verdictType: 'green',
  closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], ...counters, { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }, guards[1]] },
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
});

test('two signing-gate tries on an unchanged seed share one run of the repo command', async (t) => {
  const { dir, seed, runs } = makePatient(t);
  const spec = jobOf([counter('suite', 'a')]);
  const seedShare = new Map();
  await prepareSigning({ spec, workdir: dir, seedRef: seed, timeoutMs: 30_000, seedShare });
  assert.equal(runs().length, 1, 'try 1 ran it');
  const second = await prepareSigning({ spec, workdir: dir, seedRef: seed, timeoutMs: 30_000, seedShare });
  await prepareSigning({ spec, workdir: dir, seedRef: seed, timeoutMs: 30_000, seedShare });
  assert.equal(runs().length, 1, `three tries ran it ${runs().length} times`);
  assert.ok(second.gates.seedVerdict, 'the shared try still judged every stage');
});

test('a timed-out command on try 1 is not kept: try 2 runs it fresh', async (t) => {
  const { dir, seed, runs } = makePatient(t);
  const spec = jobOf([counter('slow', 'b', { sleepMs: 20_000, timeoutMs: 700 })]);
  const seedShare = new Map();
  await prepareSigning({ spec, workdir: dir, seedRef: seed, timeoutMs: 30_000, seedShare });
  await prepareSigning({ spec, workdir: dir, seedRef: seed, timeoutMs: 30_000, seedShare });
  assert.equal(runs().length, 2, `ran ${runs().length} times`);
});

test('a different seed tree is a fresh run', async (t) => {
  const { dir, seed, runs } = makePatient(t);
  const spec = jobOf([counter('suite', 'a')]);
  const seedShare = new Map();
  await prepareSigning({ spec, workdir: dir, seedRef: seed, timeoutMs: 30_000, seedShare });
  writeFileSync(join(dir, 'src', 'mod.js'), '// changed\n');
  gitInPatient(dir, ['add', '-A']);
  gitInPatient(dir, ['commit', '-q', '-m', 'next']);
  const seed2 = gitInPatient(dir, ['rev-parse', 'HEAD']).trim();
  await prepareSigning({ spec, workdir: dir, seedRef: seed2, timeoutMs: 30_000, seedShare });
  assert.equal(runs().length, 2, `ran ${runs().length} times`);
});

test('the run-start precheck and preflight never read a signing result', async (t) => {
  const { dir, seed, spine, runs } = makePatient(t);
  const job = jobOf([counter('suite', 'a')]);
  const seedShare = new Map();
  await prepareSigning({ spec: job, workdir: dir, seedRef: seed, timeoutMs: 30_000, seedShare });
  assert.equal(runs().length, 1, 'signing ran it once');
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'write-fix', action: 'Create src/fix.js containing the ok marker.', tools: ['write'], rounds: 6, target: 'src/fix.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }] }] }) },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'src', 'fix.js'), content: '// ok\n' } }] },
    { text: 'wrote it' },
  ]);
  const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: dir, provider, emit: makeSpine(spine) });
  assert.equal(outcome, 'green', JSON.stringify(readSpine(spine).filter((e) => e.type === 'escalation')));
  // signing 1 + precheck 1 + preflight 1: the run never read the signing result
  assert.equal(runs().length, 3, `ran ${runs().length} times`);
});
