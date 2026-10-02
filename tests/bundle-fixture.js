// A small REAL exported bundle for tests and demos: the same real shape tests/bundle.test.js exports (a two-stage
// close sharing one script, a bridge minted at the spec's hash through the real `mintBridge`), plus one recorded
// red through the real `appendRed`, so an imported job has an exported history with greens AND reds. Not a test
// file (no `.test.js`), so `node --test` never runs it.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { mintBridge, appendRed } from '../src/bridges.js';
import { exportBundle } from '../src/bundle.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';

export const CLOSE_SCRIPT_PATH = '/home/hamr/PycharmProjects/bareloop-close/scripts/fixture-close.mjs';
const CLOSE_SCRIPT_SOURCE = `import { JUDGED_MARKER } from '../src/kinds.js';

const stage = process.argv[2];
console.log(\`FIXTURE \${stage} \${JUDGED_MARKER}\`);
process.exit(0);
`;
const SHA = hashCloseScriptBytes(CLOSE_SCRIPT_SOURCE);

/** the exported job's signed spec */
export const BUNDLE_JOB = {
  schema: 'job-v1',
  job: 'fixture-export-job',
  description: 'a two-stage close, both stages sharing one script (real shape)',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  maxWallMs: 1_800_000,
  writeScope: ['src/**'],
  goal: 'Make the fixture pass its own close.',
  verdictType: 'green',
  close: [
    { name: 'changed-from-seed', cmd: `node ${CLOSE_SCRIPT_PATH} changed-from-seed`, expect: 0, offer: false, sha256: SHA },
    { name: 'suite-green', cmd: `node ${CLOSE_SCRIPT_PATH} suite-green`, expect: 0, sha256: SHA },
  ],
  escalation: { mode: 'decision-ready' },
};

/**
 * Export the fixture bundle into `outDir` (must not exist or be empty).
 * @param {string} outDir
 * @param {{job?: string}} [opts] `job` renames the exported job (a different slug is a different spec hash)
 * @returns {{dir: string, bundleHash: string, manifest: any}}
 */
export function exportFixtureBundle(outDir, opts = {}) {
  const job = opts.job ?? BUNDLE_JOB.job;
  const spec = { ...BUNDLE_JOB, job };
  const specHash = jobSpecHash(spec);
  const minted = mintBridge(
    { name: job, goal: spec.goal, specHash, closeStageNames: ['changed-from-seed', 'suite-green'], toolsUsed: ['read', 'grep', 'edit'] },
    { runid: 'r1', patient: 'p1', at: '2026-09-05T00:00:00.000Z', plan: { schema: 'plan-v1', steps: [] }, costUsd: 2, spendComplete: true, wallMs: 60_000, rounds: 10, specHash },
  );
  if (!minted.ok) throw new Error(`bundle fixture bridge did not mint: ${JSON.stringify(minted.reds)}`);
  const red = appendRed(minted.bridge, { runid: 'r0', patient: 'p1', at: '2026-09-04T00:00:00.000Z', outcome: 'red', failingStage: 'suite-green', costUsd: 1, spendComplete: true, wallMs: 30_000, rounds: 6 });
  if (!red.ok) throw new Error(`bundle fixture red did not append: ${JSON.stringify(red.reds)}`);
  const registryDir = mkdtempSync(join(tmpdir(), 'bundle-fixture-registry-'));
  try {
    writeFileSync(join(registryDir, `${job}.json`), `${JSON.stringify(red.bridge, null, 2)}\n`);
    const r = exportBundle({ spec, closeScripts: { [CLOSE_SCRIPT_PATH]: CLOSE_SCRIPT_SOURCE }, registryDir, outDir, bareloopVersion: '0.99.0' });
    if (!r.ok) throw new Error(`bundle fixture did not export: ${JSON.stringify(r.reds)}`);
    return { dir: outDir, bundleHash: /** @type {string} */ (r.bundleHash), manifest: r.manifest };
  } finally { rmSync(registryDir, { recursive: true, force: true }); }
}
