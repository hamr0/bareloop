#!/usr/bin/env node
// ONE-TIME migration: rewrite `-bareloop`-suffixed patient slugs in an existing
// bridge registry to the canonical form.
//
// WHY. D6 (`deriveStatus`, src/bridges.js) counts DISTINCT patient strings, and two
// spellings of ONE physical patient therefore mint a `proven` that no second instance
// ever paid for. The two registry writers had drifted apart:
//
//   scripts/consolidate-bridges.mjs  wrote the SPINE dir name   `litectx-u-bareloop`
//   scripts/run-reuse.mjs            writes the PATIENT workdir  `litectx-u`
//
// The canonical slug is the PATIENT WORKDIR basename (hamr's call). Consolidation now
// strips the suffix at the source; this script repairs the rows already on disk.
//
// What it will NOT do, on purpose:
//  - **touch a row it cannot rewrite honestly.** A patient of exactly `-bareloop`
//    would strip to the empty string, which is not a patient — the file is REFUSED
//    whole rather than half-migrated.
//  - **rename a file.** `saveBridge` builds the path from `name`; if that disagrees
//    with the filename on disk the entry is refused, not silently re-homed.
//  - **write an entry its own validator rejects.** Every write goes through
//    `saveBridge` (validate, then temp+rename), so a registry read that races the
//    migration sees the old entry or the new one, never a half-written file.
//
// Both the HISTORY rows and the VERSION rows carry `patient`, and both are migrated:
// they name the same physical patient, so leaving one spelling behind would be the
// exact drift this fixes. The summary counts them separately so the operator sees it.
//
// usage:
//   node scripts/migrate-bridge-patient-slugs.mjs <registryDir> [--dry-run]
//
// `--dry-run` prints the identical report and touches nothing. Run it first.

import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadBridge, saveBridge, deriveStatus, registryExists } from '../src/bridges.js';

const SPINE_SUFFIX = '-bareloop';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const registryDir = argv.find((a) => !a.startsWith('--'));

const die = (/** @type {string} */ msg) => { console.error(`migrate-bridge-patient-slugs: ${msg}`); process.exit(2); };

if (!registryDir) {
  die('a registry DIRECTORY is required (there is no default location — the registry path is operator-supplied)\n'
    + '  usage: node scripts/migrate-bridge-patient-slugs.mjs <registryDir> [--dry-run]');
}
if (!registryExists(registryDir)) die(`not a registry directory: ${registryDir}`);

/** the canonical slug, or null when the row must not be rewritten
 * @param {unknown} patient @returns {string|null} */
function canonical(patient) {
  if (typeof patient !== 'string' || !patient.endsWith(SPINE_SUFFIX)) return null;
  const slug = patient.slice(0, -SPINE_SUFFIX.length);
  return slug.length ? slug : null;
}

let files;
try { files = readdirSync(registryDir).filter((f) => f.endsWith('.json')).sort(); } catch (e) {
  die(`${registryDir}: ${/** @type {Error} */ (e).message}`);
}

console.log(`registry  ${registryDir}${dryRun ? '  (DRY RUN — nothing is written)' : ''}`);
console.log(`files     ${files.length}\n`);

let changedFiles = 0;
let rowsRewritten = 0;

for (const f of files) {
  const file = join(registryDir, f);
  const r = loadBridge(file);
  if (!r.ok) {
    console.error(`${f}\n  SKIPPED — not a valid bridge entry: ${r.reds.map((x) => `${x.code}:${x.path}`).join(', ')}\n`);
    process.exitCode = 1;
    continue;
  }
  const b = r.bridge;
  if (`${b.name}.json` !== basename(file)) {
    console.error(`${f}\n  SKIPPED — entry name "${b.name}" does not match the filename; the write would land elsewhere\n`);
    process.exitCode = 1;
    continue;
  }

  const rows = [...b.versions, ...b.history];
  const stale = rows.filter((/** @type {any} */ x) => typeof x.patient === 'string' && x.patient.endsWith(SPINE_SUFFIX));
  if (!stale.length) {
    console.log(`${f}\n  unchanged — no ${SPINE_SUFFIX} patient slugs\n`);
    continue;
  }
  const unrewritable = stale.filter((/** @type {any} */ x) => canonical(x.patient) === null);
  if (unrewritable.length) {
    console.error(`${f}\n  REFUSED — ${unrewritable.length} row(s) whose patient strips to the empty string (${unrewritable.map((/** @type {any} */ x) => JSON.stringify(x.patient)).join(', ')}); the file is left untouched\n`);
    process.exitCode = 1;
    continue;
  }

  const before = {
    status: deriveStatus(b.history),
    versions: b.versions.map((/** @type {any} */ v) => v.patient),
    history: b.history.map((/** @type {any} */ h) => h.patient),
  };
  const next = {
    ...b,
    versions: b.versions.map((/** @type {any} */ v) => ({ ...v, patient: canonical(v.patient) ?? v.patient })),
    history: b.history.map((/** @type {any} */ h) => ({ ...h, patient: canonical(h.patient) ?? h.patient })),
  };
  const versionsChanged = next.versions.filter((/** @type {any} */ v, /** @type {number} */ i) => v.patient !== before.versions[i]).length;
  const historyChanged = next.history.filter((/** @type {any} */ h, /** @type {number} */ i) => h.patient !== before.history[i]).length;
  const after = { status: deriveStatus(next.history), versions: next.versions.map((/** @type {any} */ v) => v.patient), history: next.history.map((/** @type {any} */ h) => h.patient) };

  console.log(f);
  console.log(`  versions  before [${before.versions.join(', ')}]`);
  console.log(`            after  [${after.versions.join(', ')}]   (${versionsChanged} rewritten)`);
  console.log(`  history   before [${before.history.join(', ')}]`);
  console.log(`            after  [${after.history.join(', ')}]   (${historyChanged} rewritten)`);
  console.log(`  distinct  ${new Set(before.history).size} → ${new Set(after.history).size} patient(s) in history`);
  console.log(`  status    ${before.status} → ${after.status}  (derived, never stored — D6)`);

  changedFiles += 1;
  rowsRewritten += versionsChanged + historyChanged;
  if (dryRun) { console.log(`  would write ${file}\n`); continue; }
  const w = saveBridge(registryDir, next);
  if (!w.ok) {
    console.error(`  WRITE FAILED — ${w.reds.map((x) => `${x.code}:${x.path}`).join(', ')}\n`);
    process.exitCode = 1;
    continue;
  }
  console.log(`  wrote ${w.file}\n`);
}

console.log(`${changedFiles} file(s) · ${rowsRewritten} row(s) rewritten${dryRun ? '  (dry run — nothing written)' : ''}`);
