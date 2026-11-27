// F399 parity pins, Reuse (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Reuse").
// The try history line is built by runReuse from each try's own events (readTry, which reads src/runread.js). It is driven through the REAL runReuse with the same scripted job runner
// tests/reuse.test.js uses (a hand-built spine: no real archived reuse run is a fixture); the expected words are the records the scripted runs emit, by a plain read.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReuse } from '../src/reuse.js';
import { makeRegistry, saveBridge } from '../src/bridges.js';
import { scriptedProvider } from './helpers.js';
import { trackRecordFor, reuseLine } from '../src/panel/server.js';
import { workflowKey } from '../src/job.js';
import { f399World } from './f399-world.mjs';
import { specAt } from './f399-raw.mjs';
import { makeAuditGridWorld } from './audit-grid-world.mjs';

const base = mkdtempSync(join(tmpdir(), 'f399-reuse-'));
after(() => rmSync(base, { recursive: true, force: true }));
const PLAN = { schema: 'plan-v1', steps: [{ id: 'fix-types', action: 'Fix the types.', tools: ['read', 'edit'], rounds: 8, target: 'src/x.js', exit: [{ type: 'tree-changed', scope: 'src/**' }] }] };
const BRIDGE = { schema: 'bridge-v1', name: 'alpha', goal: 'Make the package pass tsc --strict without weakening the tests.', specHash: 'signed-hash', closeStageNames: ['typecheck'], toolsUsed: ['read', 'edit'],
  versions: [{ plan: PLAN, runid: 'ms1', greenAt: '2026-07-27T10:00:00Z', patient: 'aurora-u', costUsd: 2.21, wallMs: 534_000, rounds: 40 }],
  history: [{ at: '2026-07-27T10:00:00Z', runid: 'ms1', patient: 'aurora-u', outcome: 'green', failingStage: null, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 40 }] };
const JOB = { schema: 'job-v1', job: 'types-migration', description: 'a plan-shape job with a staged close', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 5, maxWallMs: 1_800_000, writeScope: ['src/**'],
  goal: 'Make the package pass tsc --strict without weakening the tests.', verdictType: 'green', close: [{ name: 'typecheck', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED', sha256: 'a'.repeat(64) }], tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' } };
let n = 0;
/** @param {any[]} script one entry per try: {outcome, closeStage?} */
const runs = (script) => { let i = 0; return async (/** @type {any} */ _spec, /** @type {any} */ opts) => { const s = script[Math.min(i, script.length - 1)]; i += 1; opts.emit('worker-round', { kind: 'turn', costUsd: 0.5 }); if (s.closeStage !== undefined) opts.emit('outer-close', { verdict: 'red', stage: s.closeStage }); opts.emit('job-end', { outcome: s.outcome, spentUsd: 1, spendComplete: true }); return s.outcome; }; };
async function exhausted(/** @type {any[]} */ script) {
  const dir = makeRegistry(join(base, `reg-${n += 1}`));
  assert.equal(saveBridge(dir, BRIDGE).ok, true);
  const events = [];
  const emit = (/** @type {string} */ type, /** @type {any} */ data) => { const ev = { type, seq: events.length, ...(data ?? {}) }; events.push(ev); return ev; };
  await runReuse({ job: JOB, approvals: [], registryDir: dir, envelope: { perTryBudgetUsd: 5, perTryWallMs: 1_800_000, bridgeTries: 1 }, patient: 'litectx-u', workdir: base, provider: scriptedProvider([]),
    selectionProvider: scriptedProvider([{ text: JSON.stringify({ choice: 'alpha', reason: 'fits' }) }]), emit, runJob: runs(script) });
  return /** @type {any} */ (events.find((e) => e.type === 'escalation' && e.category === 'reuse-exhausted'));
}

test('reuse-try-history-line-parity: each try\'s history line says "at stage X" from the final close\'s failing stage and "close reached" / "close NEVER REACHED" from whether a close ran (scripted real runReuse)', async () => {
  const esc = await exhausted([{ outcome: 'escalated', closeStage: 'typecheck' }, { outcome: 'escalated' }]);
  const lines = esc.detail.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^try 1 \(bridge "alpha"\): escalated at stage "typecheck" — .*, close reached$/);
  assert.match(lines[1], /^try 2 \(cold\): escalated — .*, close NEVER REACHED$/);
  assert.ok(!lines[1].includes(' at stage '), 'a try whose close never ran names no stage');
});

test('reuse-estimate-line-parity: the estimate line reads run outcomes, spend and wall only - "Same job - G green - N not green - about $X and M min a run" (real f399 runs and the real already-green leg)', () => {
  const rec = { runs: 3, green: 2, notGreen: 1, finished: 3, avgSpendUsd: 0.5, avgWallMs: 5 * 60_000 };
  assert.equal(reuseLine(rec), 'Same job — 2 green · 1 not green · about $0.50 and 5 min a run');
  assert.equal(reuseLine({ ...rec, avgSpendUsd: null }), 'Same job — 2 green · 1 not green · about 5 min a run, cost not recorded');
  assert.equal(reuseLine({ ...rec, runs: 0, green: 0, notGreen: 0 }), 'Same job — no runs yet on this model');
  // the counts come from each run's last-leg outcome: a real green run (mv5e1ktb) and a real red one (mv73swnx) of DIFFERENT workflows count 1 each under their own key
  const a = f399World('mv5e1ktb', 'rubric-2');
  const t = trackRecordFor(/** @type {string} */ (/** @type {any} */ (trackKeyOf(a))), a.opts);
  assert.deepEqual([t.runs, t.green, t.notGreen], [1, 1, 0]);
  const g = makeAuditGridWorld();
  const gt = trackRecordFor(/** @type {string} */ (/** @type {any} */ (trackKeyOf(g, 'audit-grid'))), g.opts);
  assert.deepEqual([gt.green, gt.notGreen], [1, 0], 'the already-green last leg counts as green');
});

function trackKeyOf(/** @type {any} */ _w, /** @type {string} */ fx = 'f399/mv5e1ktb') {
  return workflowKey(fx === 'audit-grid' ? specAt('audit-grid/mvtatlxw.resolved-spec.json') : specAt(`${fx}/resolved-spec.json`));
}
