// Export by run name (PRD v1.114, F245; EXPORT-BUILD.md addendum 2026-10-25). `bareloop export "<job> (run-N)" --out <dir>`
// turns a green panel / run-u run into a bundle: the run's OWN signed resolved spec (closeDecl kept as signed, nothing
// hand-written or edited) plus a bridge-v1 record minted by the library's `mintBridge` from the run's saved plan and
// its spine. Every number comes off the run's own records; a value that cannot be read is a refusal in plain words
// naming it, never a guess. $0: nothing here talks to a model.
//
// The `job (run-N)` name comes from `runNumbers` (src/runlist.js) — the panel's one owner of run names.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { readRunList, runNumbers, runNameOf, appendExported } from './runlist.js';
import { sourceNearSpine, signedSpecForRun } from './runfiles.js';
import { parseJsonl } from './replayio.js';
import { legsOf, legsWallMs } from './legs.js';
import { jobSpecHash } from './job.js';
import { closeStagesOf } from './plan.js';
import { readTry } from './reuse.js';
import { mintBridge, saveBridge, makeRegistry } from './bridges.js';
import { exportBundle } from './bundle.js';

/** the one sentence every refusal of a job that is not a repo job starts with */
const REPO_ONLY = 'only repo jobs can be exported for now';

/**
 * @param {string} name
 * @returns {{ job: string, n: number }|null}
 */
function parseRunName(name) {
  const m = /^(.*) \(run-(\d+)\)$/.exec(String(name).trim());
  return m ? { job: m[1], n: Number(m[2]) } : null;
}

/**
 * The terminal outcome of a run's latest leg, read off its spine. `null` = no readable spine or no terminal record.
 * @param {string} spine
 * @returns {{ records: any[], outcome: string|null }}
 */
function readSpineOutcome(spine) {
  if (!existsSync(spine)) return { records: [], outcome: null };
  const records = parseJsonl(spine).records;
  return { records, outcome: legsOf(records).at(-1)?.outcome ?? null };
}

/**
 * Every green panel / run-u run, oldest first, as `{name, runid, job, row}`. Green = the run's latest job-end is `green` or
 * `already-green`. Rows made by `bareloop run` (via 'bundle') or a backfill are not panel / run-u runs and are not listed.
 * @param {{ home?: string }} [opts]
 * @returns {{ name: string, runid: string, job: string, at: string, outcome: string, row: any }[]}
 */
export function listGreenRuns(opts = {}) {
  const { rows } = readRunList(opts);
  const nos = runNumbers(rows);
  /** @type {{ name: string, runid: string, job: string, at: string, outcome: string, row: any }[]} */
  const out = [];
  for (const row of rows) {
    if (row.via !== 'run-u' || typeof row.spine !== 'string') continue;
    const { outcome } = readSpineOutcome(row.spine);
    if (outcome !== 'green' && outcome !== 'already-green') continue;
    out.push({ name: runNameOf(row.job, nos.get(row.runid)), runid: row.runid, job: row.job, at: row.at, outcome, row });
  }
  return out;
}

/** @param {unknown} v @returns {boolean} */
const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());

/**
 * Build the bundle for one green run. Never throws for a run it cannot export: every stop is `{ok:false, why}` in plain words.
 * @param {{ name: string, outDir: string, home?: string, bareloopVersion: string, now?: () => number }} o
 * @returns {{ ok: true, runid: string, job: string, name: string, dir: string, bundleHash: string } | { ok: false, why: string }}
 */
export function exportRun({ name, outDir, home, bareloopVersion, now = Date.now }) {
  const want = parseRunName(name);
  if (!want) return { ok: false, why: `"${name}" is not a run name — it looks like: my-job (run-3)` };
  const { rows } = readRunList(home === undefined ? {} : { home });
  const nos = runNumbers(rows);
  const row = rows.find((r) => r.job === want.job && nos.get(r.runid) === want.n && r.via === 'run-u') ?? null;
  if (!row) return { ok: false, why: `no run named "${name}" in the run list` };
  if (typeof row.spine !== 'string' || !existsSync(row.spine)) return { ok: false, why: `"${name}" has no log file on this machine any more (${row.spine ?? 'none recorded'})` };
  const { records, outcome } = readSpineOutcome(row.spine);
  if (outcome !== 'green' && outcome !== 'already-green') return { ok: false, why: `"${name}" did not end green (${outcome ?? 'no ending recorded'}) — only a green run can be exported` };

  const signed = signedSpecForRun(row, records);
  if (!signed) return { ok: false, why: `the signed job file for "${name}" is not beside its log, or none matches the hash it ran under` };
  const spec = signed.spec;

  // repo jobs only for now ($0): say which kind this is
  if (spec.verdictType !== 'green') return { ok: false, why: `${REPO_ONLY}: "${name}" is a rubric job, graded by a judge (${spec.verdictType ?? 'no class recorded'})` };
  if (Array.isArray(spec.inputs) && spec.inputs.some((/** @type {any} */ i) => isUrl(i?.value))) return { ok: false, why: `${REPO_ONLY}: "${name}" reads a page link` };
  const near = sourceNearSpine(row.spine);
  /** @type {any} */
  let source = null;
  if (near.sourceJsonPath) { try { source = JSON.parse(readFileSync(near.sourceJsonPath, 'utf8')); } catch { source = null; } }
  if (!source || typeof source.kind !== 'string') return { ok: false, why: `"${name}" has no record of what it worked on (source.json), so its kind cannot be told` };
  if (source.kind !== 'repo') return { ok: false, why: `${REPO_ONLY}: "${name}" works on a plain ${source.kind}, not a repo` };

  // the saved plan: the panel / run-u engine writes it beside the spine on a green
  const bridgeFile = join(dirname(row.spine), `bridge-${spec.job}-${row.runid}.json`);
  /** @type {any} */
  let bf = null;
  try { bf = JSON.parse(readFileSync(bridgeFile, 'utf8')); } catch { bf = null; }
  if (!bf || typeof bf.plan !== 'object' || bf.plan === null) {
    return { ok: false, why: `"${name}" saved no plan (${bridgeFile}) — a run that was already green at start has none, so it cannot be exported` };
  }
  if (bf.runid !== row.runid || bf.specHash !== signed.specHash || bf.specHash !== jobSpecHash(spec)) {
    return { ok: false, why: `the plan saved by "${name}" was made under a different signed job file than the one beside it` };
  }

  // the numbers, all from the run's own spine; nothing guessed
  const legs = legsOf(records);
  const je = legs.at(-1)?.jobEnd ?? null;
  const costUsd = typeof je?.engagementSpentUsd === 'number' ? je.engagementSpentUsd : (typeof je?.spentUsd === 'number' ? je.spentUsd : null);
  if (costUsd === null || !Number.isFinite(costUsd)) return { ok: false, why: `cannot read what "${name}" cost: its log's ending record carries no spend figure` };
  if (typeof je?.spendComplete !== 'boolean') return { ok: false, why: `cannot read whether the cost of "${name}" is complete: its log's ending record does not say` };
  const wall = legsWallMs(legs);
  if (wall.ms === null || !wall.complete) return { ok: false, why: `cannot read how long "${name}" took: its log's time stamps are missing or unreadable` };
  const rounds = readTry(records).rounds;
  if (typeof rounds !== 'number') return { ok: false, why: `cannot read how many rounds "${name}" took: its log shows spend but no round records` };
  if (typeof row.patient !== 'string' || row.patient === '') return { ok: false, why: `cannot read which folder "${name}" worked in: its run-list row records none` };

  const toolsUsed = [...new Set((Array.isArray(bf.plan.steps) ? bf.plan.steps : []).flatMap((/** @type {any} */ s) => (Array.isArray(s?.tools) ? s.tools : [])))];
  const minted = mintBridge(
    { name: spec.job, goal: spec.goal, specHash: signed.specHash, closeStageNames: (closeStagesOf(spec) ?? []).map((/** @type {any} */ s) => s.name), toolsUsed },
    {
      runid: row.runid, patient: row.patient, at: typeof bf.greenAt === 'string' ? bf.greenAt : null, plan: bf.plan,
      costUsd, spendComplete: je.spendComplete, wallMs: wall.ms, rounds, specHash: signed.specHash, verdictType: spec.verdictType,
    },
  );
  if (!minted.ok) return { ok: false, why: `the run's record did not make a valid bridge: ${minted.reds.map((r) => `${r.code} at ${r.path}`).join(', ')}` };

  // a throwaway registry: exportBundle ships "a run that actually happened", read from a registry directory
  const tmp = mkdtempSync(join(tmpdir(), 'bareloop-export-'));
  try {
    const reg = join(tmp, 'registry');
    makeRegistry(reg);
    const saved = saveBridge(reg, minted.bridge);
    if (!saved.ok) return { ok: false, why: `could not stage the bridge: ${saved.reds.map((r) => `${r.code} at ${r.path}`).join(', ')}` };
    const dir = resolve(outDir);
    const r = exportBundle({ spec, closeScripts: {}, registryDir: reg, outDir: dir, bareloopVersion });
    if (!r.ok) return { ok: false, why: r.reds.map((x) => `${x.code} at ${x.path}${x.detail ? `: ${x.detail}` : ''}`).join('; ') };
    const bundleHash = /** @type {string} */ (r.bundleHash);
    appendExported({ runid: row.runid, job: row.job, bundle: dir, bundleHash, at: new Date(now()).toISOString() }, home === undefined ? {} : { home });
    return { ok: true, runid: row.runid, job: row.job, name: runNameOf(row.job, want.n), dir, bundleHash };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
