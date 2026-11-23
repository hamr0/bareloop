// A person's Stop that lands while a STEP's exit check runs (live defect, run mwt89eey): the check is killed BECAUSE the person asked to
// stop, so the leg ends `stopped` (resumable, same step), never `close-killed` with the OOM wording. A kill with NO stop request stays
// close-killed. Driven through the real runJob with a real declared close; the check script plants the stop file / kills itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { stopFilePath } from '../src/legs.js';
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';

/** @param {any} t @param {'stop'|'kill'} mode what the check does once src/fix.js exists */
function patient(t, mode) {
  const dir = mkdtempSync(join(tmpdir(), 'stop-step-'));
  const spineDir = mkdtempSync(join(tmpdir(), 'stop-step-spine-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(spineDir, { recursive: true, force: true }); });
  const spine = join(spineDir, 'spine.jsonl');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  const act = mode === 'stop'
    ? `writeFileSync(${JSON.stringify(stopFilePath(spine))}, ''); setTimeout(() => {}, 60000);`
    : "process.kill(process.pid, 'SIGKILL');";
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, writeFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (!existsSync(p)) { console.log('FAILED src/fix.js missing'); process.exit(1); }
${act}\n`);
  initPatientRepo(dir);
  return { dir, spine };
}

const guards = classGuards({ verdictType: 'green', lang: 'js' })
  .map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) } }));
const job = () => ({
  schema: 'job-v1', job: 'stop-in-step-check', description: 'stop while a step check runs',
  provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5, writeScope: ['src/**'],
  goal: 'Create src/fix.js.', verdictType: 'green',
  closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }, guards[1]] },
  tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
});
const PLAN = JSON.stringify({
  schema: 'plan-v1',
  steps: [{ id: 'write-fix', action: 'Create src/fix.js.', tools: ['write'], rounds: 6, target: 'src/fix.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }] }],
});
async function drive(/** @type {any} */ t, /** @type {'stop'|'kill'} */ mode) {
  const { dir, spine } = patient(t, mode);
  const j = job();
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'src', 'fix.js'), content: '// ok\n' } }] },
    { text: 'wrote' }, { text: 'wrote' },
  ]);
  const outcome = await runJob(j, { approvals: [{ specHash: jobSpecHash(j), signer: 'hamr', ts: 'now' }], workdir: dir, provider, emit: makeSpine(spine), stopFile: stopFilePath(spine) });
  return { outcome, events: readSpine(spine), spine };
}

test('a Stop while a step\'s exit check runs ends the leg `stopped`: no close-killed escalation, no OOM wording, stop file consumed', async (t) => {
  const { outcome, events, spine } = await drive(t, 'stop');
  const esc = events.filter((e) => e.type === 'escalation');
  assert.ok(events.some((e) => e.type === 'stop-requested'), 'the stop is recorded');
  assert.equal(events.findLast((e) => e.type === 'job-end').outcome, 'stopped', JSON.stringify(esc));
  assert.equal(outcome, 'stopped');
  assert.ok(!esc.some((e) => e.category === 'close-killed' || /OOM/.test(e.decision ?? '')), 'no instrument-kill story');
  assert.ok(esc.some((e) => e.category === 'stopped'), 'filed as the person\'s stop');
  assert.equal(existsSync(stopFilePath(spine)), false);
});

test('a check killed with NO stop request stays close-killed', async (t) => {
  const { events } = await drive(t, 'kill');
  const esc = events.filter((e) => e.type === 'escalation');
  assert.ok(esc.some((e) => e.category === 'close-killed'), JSON.stringify(esc));
  assert.equal(events.findLast((e) => e.type === 'job-end').outcome, 'close-killed');
  assert.ok(!events.some((e) => e.type === 'stop-requested'));
});
