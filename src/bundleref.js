// How the CLI finds a bundle: by the run name it was exported under, or by folder (PRD v1.114, one menu). Names come from the
// `exported` rows `bareloop export` appends to runs.jsonl, numbered by the panel's own `runNumbers`. Also: which stopped bundle runs
// can be resumed (the menu's Resume list). $0, read-only.

import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { askRequired } from './prompts.js';

import { readRunList, readExported, runNumbers, runNameOf, runIsAlive } from './runlist.js';
import { parseJsonl } from './replayio.js';
import { legsOf } from './legs.js';
import { readResume, checkpointAgeGate, CHECKPOINT_OUTCOMES } from './reuse.js';

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

/** how many bundles a pick list shows; older ones stay reachable by typing their run name or folder */
export const RECENT_BUNDLES = 10;

/**
 * Every bundle on this machine the CLI knows, NEWEST FIRST, one per folder: the exported ones (the `exported` rows) and any bundle that
 * has `bareloop run` rows (spine `<bundle>/runs/<runid>/spine.jsonl`). `label` = the run name (or the job) and the folder.
 * @param {{ home?: string }} [opts]
 * @returns {{ name: string, dir: string, label: string, atMs: number }[]}
 */
export function knownBundles(opts = {}) {
  const { rows } = readRunList(opts);
  const nos = runNumbers(rows);
  const ms = (/** @type {any} */ x) => { const t = typeof x === 'string' ? Date.parse(x) : NaN; return Number.isFinite(t) ? t : 0; };
  /** @type {Map<string, { name: string, dir: string, label: string, atMs: number }>} */
  const byDir = new Map();
  const put = (/** @type {string} */ dir, /** @type {string} */ name, /** @type {number} */ atMs, /** @type {boolean} */ named) => {
    if (!isDir(dir)) return;
    const old = byDir.get(dir);
    if (old && old.atMs > atMs && (old.name !== '' || !named)) return;
    const keep = named ? name : (old ? old.name : '');
    byDir.set(dir, { name: keep, dir, label: `${keep || name}  ${dir}`, atMs: Math.max(atMs, old ? old.atMs : 0) });
  };
  for (const x of readExported(opts)) {
    const n = nos.get(x.runid);
    put(x.bundle, n === undefined ? `${x.job} (${x.runid})` : runNameOf(x.job, n), ms(x.at), true);
  }
  for (const r of rows) {
    if (r.via !== 'bundle' || typeof r.spine !== 'string') continue;
    put(dirname(dirname(dirname(r.spine))), r.job, ms(r.at), false);
  }
  return [...byDir.values()].sort((a, b) => b.atMs - a.atMs);
}

/**
 * The shared bundle question of `run` and `history`: show the last {@link RECENT_BUNDLES} bundles, newest first, numbered; then ask. A number
 * picks one shown; a run name or a folder reaches an older one. None known: one plain line and the command ends.
 * @param {{ ask: (q: string) => Promise<string>, out: (s: string) => void, home?: string, none: string, cancelled: string }} o
 * @returns {Promise<{ ref: string } | { end: true }>} `end` = the command ends cleanly (exit 0)
 */
export async function askBundle({ ask, out, home, none, cancelled }) {
  const known = knownBundles(home === undefined ? {} : { home });
  if (known.length === 0) { out(none); return { end: true }; }
  const shown = known.slice(0, RECENT_BUNDLES);
  out(known.length > shown.length ? `Bundles (the last ${shown.length} of ${known.length}; older ones by run name or folder):` : 'Bundles:');
  shown.forEach((b, i) => out(`  ${i + 1}  ${b.label}`));
  const pick = await askRequired(ask, 'Bundle (a number above, a run name, or a folder): ');
  if (pick === null) { out(cancelled); return { end: true }; }
  return { ref: /^\d+$/.test(pick) && shown[Number(pick) - 1] ? shown[Number(pick) - 1].dir : pick };
}

/**
 * A bundle reference typed by a person: an existing folder (relative to `cwd`), else an exported run name.
 * @param {string} ref @param {{ home?: string, cwd: string }} o
 * @returns {{ ok: true, dir: string } | { ok: false, why: string }}
 */
export function resolveBundleRef(ref, { home, cwd }) {
  const asPath = resolve(cwd, ref);
  if (isDir(asPath)) return { ok: true, dir: asPath };
  const hit = knownBundles(home === undefined ? {} : { home }).find((b) => b.name === ref);
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
    out.push({ runid: row.runid, job: row.job, bundleDir, outcome, label: `${row.job} run ${row.runid} (${outcome})  ${bundleDir}` });
  }
  return out.reverse(); // newest first
}
