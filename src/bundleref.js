// How the CLI finds a bundle: by the run name it was exported under, or by folder (PRD v1.114, one menu). Names come from the
// `exported` rows `bareloop export` appends to runs.jsonl, numbered by the panel's own `runNumbers`. Also: which stopped bundle runs
// can be resumed (the menu's Resume list). $0, read-only.

import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { readRunList, readExported, runNumbers, runIsAlive } from './runlist.js';
import { parseJsonl } from './replayio.js';
import { legsOf } from './legs.js';
import { readResume, checkpointAgeGate, CHECKPOINT_OUTCOMES } from './reuse.js';
import { runNameOf } from './runexport.js';

/** @param {string} p @returns {boolean} */
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/**
 * Every exported bundle whose folder still exists, newest export last, one per run name (a re-export of the same run replaces the older).
 * @param {{ home?: string }} [opts]
 * @returns {{ name: string, dir: string, runid: string, job: string }[]}
 */
export function exportedBundles(opts = {}) {
  const { rows } = readRunList(opts);
  const nos = runNumbers(rows);
  /** @type {Map<string, { name: string, dir: string, runid: string, job: string }>} */
  const byName = new Map();
  for (const x of readExported(opts)) {
    if (!isDir(x.bundle)) continue;
    const n = nos.get(x.runid);
    const name = n === undefined ? `${x.job} (${x.runid})` : runNameOf(x.job, n);
    byName.delete(name);
    byName.set(name, { name, dir: x.bundle, runid: x.runid, job: x.job });
  }
  return [...byName.values()];
}

/**
 * A bundle reference typed by a person: an existing folder (relative to `cwd`), else an exported run name.
 * @param {string} ref @param {{ home?: string, cwd: string }} o
 * @returns {{ ok: true, dir: string } | { ok: false, why: string }}
 */
export function resolveBundleRef(ref, { home, cwd }) {
  const asPath = resolve(cwd, ref);
  if (isDir(asPath)) return { ok: true, dir: asPath };
  const hit = exportedBundles(home === undefined ? {} : { home }).find((b) => b.name === ref);
  if (hit) return { ok: true, dir: hit.dir };
  return { ok: false, why: `"${ref}" is neither a bundle folder nor the name of a bundle you exported (bareloop export makes one)` };
}

/**
 * The stopped / capped runs of `bareloop run` the engine would accept a resume for, newest last: not alive, no answer yet, an
 * attempt to continue, checkpoint not expired, and the bundle folder still on disk.
 * @param {{ home?: string }} [opts]
 * @returns {{ runid: string, job: string, bundleDir: string, outcome: string, label: string }[]}
 */
export function listResumableBundleRuns(opts = {}) {
  const { rows } = readRunList(opts);
  /** @type {{ runid: string, job: string, bundleDir: string, outcome: string, label: string }[]} */
  const out = [];
  for (const row of rows) {
    if (row.via !== 'bundle' || typeof row.spine !== 'string' || !existsSync(row.spine)) continue;
    if (runIsAlive(row)) continue;
    const bundleDir = dirname(dirname(dirname(row.spine))); // <bundle>/runs/<runid>/spine.jsonl
    if (!isDir(bundleDir)) continue;
    const records = parseJsonl(row.spine).records;
    const dead = readResume(records, { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES });
    if (!dead.started || dead.greened || dead.ended || !dead.restart) continue;
    if (!checkpointAgeGate(records).ok) continue;
    const outcome = legsOf(records).at(-1)?.outcome ?? 'stopped';
    out.push({ runid: row.runid, job: row.job, bundleDir, outcome, label: `${row.job} run ${row.runid} (${outcome})` });
  }
  return out;
}
