// A run that DIED (no job-end, runner gone) leaves its in-flight part reading `[?] died`, never `[✓] passed`; a LIVE run's
// open part stays running. Real spine shape in a scratch home; the died verdict is the server's (pid), replay cannot tell.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const at = (m) => `2026-10-01T10:${String(m).padStart(2, '0')}:00.000Z`;
const jl = (rows) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;

function makeRun(runid, { pid, stale, multiLeg }) {
  const home = mkdtempSync(join(tmpdir(), 'died-open-')); dirs.push(home);
  const dir = join(home, 'src-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  const plan = { schema: 'plan-v1', steps: [{ id: 'a' }, { id: 'b' }] };
  const rows = [
    { type: 'job-start', job: 'job', specHash: 'h1', budgetUsd: 8, shape: 'plan', goal: 'g', ts: at(0), seq: 1 },
    { type: 'plan-accepted', plan, ts: at(1), seq: 2 },
    { type: 'step-start', step: 'a', ts: at(2), seq: 3 },
    { type: 'worker-round', kind: 'turn', costUsd: 1, phase: 'step:a', ts: at(3), seq: 4 },
    ...(multiLeg ? [
      { type: 'step-end', step: 'a', outcome: 'green', ts: at(4), seq: 5 },
      { type: 'job-end', outcome: 'cap-halt', spentUsd: 1, engagementSpentUsd: 1, spendComplete: true, ts: at(5), seq: 6 },
      { type: 'leg-resume', leg: 2, after: 'cap-halt', at: at(10), ts: at(10), seq: 7 },
      { type: 'job-start', job: 'job', specHash: 'h1', budgetUsd: 12, shape: 'plan', goal: 'g', priorSpentUsd: 1, priorSpendComplete: true, priorWallMs: 300000, ts: at(10), seq: 8 },
      { type: 'plan-accepted', plan, ts: at(11), seq: 9 },
      { type: 'step-start', step: 'b', ts: at(12), seq: 10 },
      { type: 'worker-round', kind: 'turn', costUsd: 1, phase: 'step:b', ts: at(13), seq: 11 },
    ] : []),
  ];
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, jl(rows));
  if (stale) { const old = new Date(Date.now() - 3 * 3600 * 1000); utimesSync(spine, old, old); }
  appendRun({ at: at(0), runid, job: 'job', spine, patient: null, via: 'run-u', pid, capUsd: 8 }, { home });
  return getRunDetail(runid, { home });
}

test('a single-leg run that died mid-step: the open part reads died', () => {
  const d = makeRun('d1', { pid: 999999, stale: true });
  assert.equal(d.status.word, 'died');
  const open = d.parts.at(-1);
  assert.equal(open.kind, 'step');
  assert.equal(open.status.word, 'died');
  assert.equal(open.status.sign, '?');
});

test('a multi-leg run whose last leg died mid-step: the open part died, the finished one keeps its status', () => {
  const d = makeRun('d2', { pid: 999999, stale: true, multiLeg: true });
  assert.equal(d.status.word, 'died');
  const steps = d.parts.filter((p) => p.kind === 'step');
  assert.equal(steps[0].status.word, 'passed');
  assert.equal(steps.at(-1).status.word, 'died');
});

test('a LIVE run\'s open part is not marked died', () => {
  const d = makeRun('l1', { pid: undefined, stale: false });
  assert.equal(d.status.word, 'running');
  assert.notEqual(d.parts.at(-1).status.word, 'died');
  assert.equal(d.parts.at(-1).stopReason ?? null, null);
});
