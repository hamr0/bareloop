// Scripted run for the carry note tests (tests/carry-wiring.test.js) through runJob: scout text, plan (warm, real),
// warm reads/greps/recalls/writes, real writes. Deterministic paths. Not a test file.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeSpine } from '../src/spine.js';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';

export const SECRET = 'AKIAABCDEFGHIJKLMNOP';
export const CONTENT_MARK = 'zebra-content-xyzzy';
const PROBE = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) process.exit(0);
console.log('FAILED tests/test_x.mjs missing'); process.exit(1);\n`;
const tcall = (id, name, args) => ({ id, name, arguments: args });
const ALL = ['read', 'grep', 'write', 'recall', 'get'];
const job = () => ({
  schema: 'job-v1', job: 'carrynote', description: 'carry note wiring', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5, writeScope: ['tests/**'], goal: 'Write tests/test_x.mjs with an ok assertion.', verdictType: 'green',
  close: [{ name: 'clean-run', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED', sha256: hashCloseScriptBytes(PROBE) }],
  tools: ALL, escalation: { mode: 'decision-ready' },
});

/** @param {string} wd fixed working dir (wiped first) @param {{ carryNote?: boolean }} o */
export async function runScripted(wd, { carryNote = false } = {}) {
  rmSync(wd, { recursive: true, force: true });
  rmSync(wd + '-spine', { recursive: true, force: true });
  mkdirSync(join(wd, 'tests'), { recursive: true });
  mkdirSync(join(wd, 'src'), { recursive: true });
  mkdirSync(wd + '-spine', { recursive: true });
  writeFileSync(join(wd, 'src', 'mod.mjs'), `export const ZEBRA = '${CONTENT_MARK}';\nexport const x = 1;\n`);
  writeFileSync(join(wd, 'close.mjs'), PROBE);
  initPatientRepo(wd);
  const mod = join(wd, 'src', 'mod.mjs');
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [
    { id: 'warm', action: 'Warm up step.', tools: ALL, rounds: 8, target: 'tests/a.txt', exit: [{ type: 'tree-changed', scope: 'tests/**' }] },
    { id: 'real', action: 'Write the real test.', tools: ALL, rounds: 6, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] },
  ] });
  const provider = scriptedProvider([
    { text: 'surveyed' }, { text: plan },
    { toolCalls: [tcall('r1', 'shell_read', { path: mod })] },
    { toolCalls: [tcall('g1', 'shell_grep', { pattern: `export|${SECRET}`, path: join(wd, 'src') })] },
    { toolCalls: [tcall('q1', 'ctx_recall', { query: 'ZEBRA' })] },
    { toolCalls: [tcall('w1', 'shell_write', { path: join(wd, 'tests', 'a.txt'), content: `a-line ${SECRET}\n` })] },
    { text: 'warm done' },
    { toolCalls: [tcall('r2', 'shell_read', { path: join(wd, '.smoke', 'carry', 'state.json') })] },
    { toolCalls: [tcall('w2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'real done' },
  ]);
  const file = join(wd + '-spine', 'spine.jsonl');
  const j = job();
  const outcome = await runJob(j, { readShim: false, carryNote, approvals: [{ specHash: jobSpecHash(j), signer: 'hamr', ts: 'now' }], workdir: wd, provider, emit: makeSpine(file) });
  return { outcome, provider, events: readSpine(file) };
}
