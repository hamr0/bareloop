// The index at every run start (src/planrun.js; litectx 0.41 makes index.db lazy): a scripted run through runJob with NO ctx tool
// granted still builds the index, records one `ctx-index` spine record (log only, nothing reaches the worker), and an index failure is
// recorded without crashing the run.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSpine } from '../src/spine.js';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';

const base = mkdtempSync(join(tmpdir(), 'ctx-index-'));
after(() => rmSync(base, { recursive: true, force: true }));
const PROBE = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) process.exit(0);
console.log('FAILED tests/test_x.mjs missing'); process.exit(1);\n`;
const TOOLS = ['read', 'write']; // no ctx verb (recall/get/impact): the index must not depend on one
const job = () => ({
  schema: 'job-v1', job: 'ctxindex', description: 'index at run start', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5, writeScope: ['tests/**'], goal: 'Write tests/test_x.mjs with an ok assertion.', verdictType: 'green',
  close: [{ name: 'clean-run', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED', sha256: hashCloseScriptBytes(PROBE) }],
  tools: TOOLS, escalation: { mode: 'decision-ready' },
});

/** @param {string} wd @param {{ blockIndex?: boolean }} o */
async function run(wd, { blockIndex = false } = {}) {
  mkdirSync(join(wd, 'tests'), { recursive: true });
  mkdirSync(join(wd, 'src'), { recursive: true });
  mkdirSync(wd + '-spine', { recursive: true });
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  writeFileSync(join(wd, 'close.mjs'), PROBE);
  // a FILE where litectx wants its `.litectx` directory: the first index write fails
  if (blockIndex) writeFileSync(join(wd, '.litectx'), 'not a directory');
  initPatientRepo(wd);
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [
    { id: 'real', action: 'Write the real test.', tools: TOOLS, rounds: 6, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] },
  ] });
  const provider = scriptedProvider([
    { text: 'surveyed' }, { text: plan },
    { toolCalls: [{ id: 'w1', name: 'shell_write', arguments: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' } }] },
    { text: 'done' },
  ]);
  const file = join(wd + '-spine', 'spine.jsonl');
  const j = job();
  const outcome = await runJob(j, { readShim: false, approvals: [{ specHash: jobSpecHash(j), signer: 'hamr', ts: 'now' }], workdir: wd, provider, emit: makeSpine(file) });
  return { outcome, events: readSpine(file) };
}

test('run start indexes with no ctx tool granted: one ctx-index record, indexed true, files counted, no error', async () => {
  const wd = join(base, 'ok');
  const r = await run(wd);
  assert.equal(r.outcome, 'green');
  const recs = r.events.filter((e) => e.type === 'ctx-index');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].indexed, true);
  assert.ok(recs[0].files >= 1, 'the repo files were counted');
  assert.equal(typeof recs[0].ms, 'number');
  assert.equal('error' in recs[0], false);
  assert.ok(existsSync(join(wd, '.litectx')), 'the index db exists on disk after the run-start index');
});

test('an index failure never crashes the run: the record carries indexed false and an error, the run still goes green', async () => {
  const r = await run(join(base, 'blocked'), { blockIndex: true });
  assert.equal(r.outcome, 'green');
  const recs = r.events.filter((e) => e.type === 'ctx-index');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].indexed, false);
  assert.equal(typeof recs[0].error, 'string');
  assert.ok(recs[0].error.length > 0 && recs[0].error.length <= 300);
  assert.equal('files' in recs[0], false);
});
