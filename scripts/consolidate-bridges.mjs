#!/usr/bin/env node
// Consolidate the probe-era bridge files into a bridge-v1 REGISTRY (design record
// docs/plans/2026-08-01-layer-3-reuse-design.md, D1: "Consolidating today's
// per-patient spine-dir bridge files into the registry is PART OF THE BUILD — they
// are the registry's seed data, not legacy to abandon").
//
// The old shape is what `scripts/run-u.mjs` writes on a green: one file PER GREEN,
// `{ job, specHash?, runid, greenAt?, plan }`, beside the spine. This converts them
// into one bridge-v1 entry PER JOB, with every green as a version + a history row.
//
// What it will NOT do, on purpose:
//  - **invent a number.** The old files carry no cost, no wall time and no round
//    count, so every one of those lands as an explicit `null` (F6: unpriced is
//    never free, and an unknown time is reported unknown, never rendered as 0).
//    Anything else here would manufacture a green's receipts after the fact.
//  - **derive the label from the plan.** `goal` and `closeStageNames` come from the
//    SIGNED job spec in `jobs/`, never from the stored plan — the load gate compares
//    against the operator's close, so a guessed stage list would be a gate that
//    passes on a fiction. A group whose spec is missing is refused, not approximated.
//  - **overwrite an existing entry** without `--force`: a registry entry that has
//    seen real runs carries history this file cannot reconstruct.
//
// usage:
//   node scripts/consolidate-bridges.mjs <registryDir> [--dry-run] [--force] [--from <dir>]...
//
// `--dry-run` prints exactly what it would write and touches nothing.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_MENU } from '../src/job.js';
import { closeStagesOf } from '../src/plan.js';
import { mintBridge, appendGreen, saveBridge, listingRow, deriveStatus, makeRegistry, registryExists } from '../src/bridges.js';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
/** the five probe-era files live beside their patients' spines (run-u.mjs's layout) */
const DEFAULT_SOURCES = [
  join(REPO, '..', 'bareloop-patients', 'aurora-u-bareloop'),
  join(REPO, '..', 'bareloop-patients', 'litectx-u-bareloop'),
];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const dryRun = flag('--dry-run');
const force = flag('--force');
/** @type {string[]} */
const from = [];
for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--from' && argv[i + 1]) from.push(argv[i + 1]);
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--from');
const registryDir = positional[0];

const die = (msg) => { console.error(`consolidate-bridges: ${msg}`); process.exit(2); };

if (!registryDir) {
  die('a target registry DIRECTORY is required (there is no default location — the registry path is operator-supplied)\n'
    + '  usage: node scripts/consolidate-bridges.mjs <registryDir> [--dry-run] [--force] [--from <dir>]...');
}
const sources = from.length ? from : DEFAULT_SOURCES;

// --- the patient slug: ONE spelling, shared with the other writer -----------
//
// D6 counts DISTINCT patient strings, so two spellings of ONE physical patient
// mint a `proven` that no second instance ever paid for. The canonical slug is the
// PATIENT WORKDIR basename (`aurora-u`, `litectx-u`) — exactly what
// `scripts/run-reuse.mjs` writes from its JOBS table. This script reads a SPINE
// dir, whose convention in `scripts/run-u.mjs` is `<patient>-bareloop`, so the
// patient is the dir name with that suffix stripped. A source directory that does
// not carry the convention is REFUSED, never guessed at: guessing here is how the
// second spelling got in.
const SPINE_SUFFIX = '-bareloop';

/** @param {string} dir a spine directory @returns {string} the patient slug */
function patientFromSpineDir(dir) {
  const slug = basename(resolve(dir));
  if (!slug.endsWith(SPINE_SUFFIX) || slug.length === SPINE_SUFFIX.length) {
    die(`source directory ${dir}: expected a spine dir named <patient>${SPINE_SUFFIX} (scripts/run-u.mjs's layout).\n`
      + `  The PATIENT slug is the patient workdir basename — the same spelling scripts/run-reuse.mjs writes — and it is\n`
      + `  never guessed from a differently-named directory: a second spelling of one patient falsely mints \`proven\` (D6).`);
  }
  return slug.slice(0, -SPINE_SUFFIX.length);
}

// --- read the old files ----------------------------------------------------

/** @type {{file: string, patient: string, job: string, runid: string, specHash: string|null, greenAt: string|null, plan: any}[]} */
const olds = [];
for (const dir of sources) {
  if (!existsSync(dir)) die(`source directory not found: ${dir}`);
  const patient = patientFromSpineDir(dir);
  for (const f of readdirSync(dir).filter((n) => /^bridge-.*\.json$/.test(n)).sort()) {
    const file = join(dir, f);
    let o;
    try { o = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`${file}: ${e.message}`); }
    if (typeof o.job !== 'string' || typeof o.runid !== 'string' || typeof o.plan !== 'object' || o.plan === null) {
      die(`${file}: not a probe-era bridge ({job, runid, plan} required) — refusing to guess its shape`);
    }
    olds.push({
      file,
      // the PATIENT is the instance this green ran against, spelled the ONE way
      // both writers spell it (D6 counts DISTINCT patients — see above)
      patient,
      job: o.job,
      runid: o.runid,
      specHash: typeof o.specHash === 'string' ? o.specHash : null,
      greenAt: typeof o.greenAt === 'string' ? o.greenAt : null,
      plan: o.plan,
    });
  }
}
if (!olds.length) die(`no bridge-*.json files under ${sources.join(', ')}`);

// --- group by JOB, one registry entry each ---------------------------------

/** @type {Map<string, typeof olds>} */
const groups = new Map();
for (const b of olds) groups.set(b.job, [...(groups.get(b.job) ?? []), b]);

/** @type {{bridge: any, files: string[]}[]} */
const built = [];
for (const [job, greens] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const specFile = join(REPO, 'jobs', `${job}.json`);
  if (!existsSync(specFile)) die(`${specFile} not found — goal and close stages come from the SIGNED spec, never from the stored plan`);
  const spec = JSON.parse(readFileSync(specFile, 'utf8'));
  // THE ONE STAGING (`closeStagesOf`), never `stageClose` directly: a spec may
  // carry a command close OR an authored declaration, and a reader that knows
  // only `close` sees a declared job as having no close at all — which here would
  // refuse a perfectly good spec for the one reason that is not true of it.
  const closeStageNames = (closeStagesOf(spec) ?? []).map((s) => s?.name);
  if (!closeStageNames.length || closeStageNames.some((n) => typeof n !== 'string')) {
    die(`${specFile}: its close stages no name sequence — the load gate compares against them, so an entry without them is unusable`);
  }
  if (typeof spec.goal !== 'string' || !spec.goal) die(`${specFile}: no goal — the listing shows the job sentence a bridge greened (D3)`);

  // Oldest first. The runids are fixed-width base36 millisecond stamps, so
  // lexicographic order IS chronological; where greenAt exists it agrees, and the
  // check below says so out loud rather than assuming it.
  greens.sort((a, b) => a.runid.localeCompare(b.runid));
  const dated = greens.filter((g) => g.greenAt);
  for (let i = 1; i < dated.length; i += 1) {
    if (dated[i].greenAt < dated[i - 1].greenAt) die(`${job}: runid order disagrees with greenAt order (${dated[i - 1].runid} vs ${dated[i].runid}) — refusing to guess which green came first`);
  }

  // the union of every version's step verbs, in menu order (a stable listing)
  const used = new Set(greens.flatMap((g) => (Array.isArray(g.plan.steps) ? g.plan.steps : []).flatMap((s) => (Array.isArray(s.tools) ? s.tools : []))));
  const toolsUsed = TOOL_MENU.filter((t) => used.has(t));
  const unknown = [...used].filter((t) => !TOOL_MENU.includes(t));
  if (unknown.length) die(`${job}: stored plan uses verb(s) outside the tool menu: ${unknown.join(', ')}`);
  if (!toolsUsed.length) die(`${job}: stored plans declare no tools — nothing for the load gate to judge`);

  /** every receipt the old files do not carry is an explicit unknown, never a 0 */
  const record = (g) => ({ runid: g.runid, patient: g.patient, at: g.greenAt, plan: g.plan, specHash: g.specHash, costUsd: null, spendComplete: false, wallMs: null, rounds: null });

  // the top-level specHash is the hash of the NEWEST green; each version carries
  // its own, because the five real files hold THREE distinct hashes across greens
  // of the same job and one field cannot hold them without dropping provenance
  const meta = { name: job, goal: spec.goal, specHash: greens.at(-1).specHash, closeStageNames, toolsUsed };
  let r = mintBridge(meta, record(greens[0]));
  for (const g of greens.slice(1)) {
    if (!r.ok) break;
    r = appendGreen(r.bridge, record(g));
  }
  if (!r.ok) die(`${job}: ${r.reds.map((x) => `${x.code}:${x.path}`).join(', ')}`);
  built.push({ bridge: r.bridge, files: greens.map((g) => g.file) });
}

// --- report, then write ----------------------------------------------------

console.log(`sources   ${sources.join('\n          ')}`);
console.log(`read      ${olds.length} probe-era bridge file(s) → ${built.length} registry entr${built.length === 1 ? 'y' : 'ies'}`);
console.log(`registry  ${registryDir}${dryRun ? '  (DRY RUN — nothing is written)' : ''}\n`);

for (const { bridge, files } of built) {
  const row = listingRow(bridge);
  const target = join(registryDir, `${bridge.name}.json`);
  console.log(`${bridge.name}.json`);
  console.log(`  goal      ${row.goal}`);
  console.log(`  status    ${row.status} (${row.greens} green / ${row.reds} red · ${new Set(bridge.versions.map((v) => v.patient)).size} distinct patient(s))`);
  console.log(`  stages    ${bridge.closeStageNames.join(' → ')}`);
  console.log(`  verbs     ${bridge.toolsUsed.join(', ')}`);
  console.log(`  cost/time ${row.greenCost.minUsd === null ? 'UNKNOWN' : `$${row.greenCost.minUsd}–$${row.greenCost.maxUsd}`} · ${row.greenCost.minWallMs === null ? 'UNKNOWN' : `${row.greenCost.minWallMs}–${row.greenCost.maxWallMs}ms`}`
    + `  (${row.greenCost.unpricedCount} unpriced, ${row.greenCost.untimedCount} untimed — the old files carry no receipts and none are invented)`);
  for (const [i, v] of bridge.versions.entries()) {
    console.log(`  v${i + 1}        ${v.runid} · ${v.patient} · ${v.greenAt ?? 'greenAt UNKNOWN'} · ${v.plan.steps?.length ?? '?'} step(s) · specHash ${v.specHash ? `${v.specHash.slice(0, 12)}…` : 'UNKNOWN'}`);
    console.log(`              from ${files[i]}`);
  }
  const exists = existsSync(target);
  if (dryRun) { console.log(`  would write ${target}${exists ? '  (EXISTS — would refuse without --force)' : ''}\n`); continue; }
  if (exists && !force) { console.error(`  REFUSED — ${target} already exists; it may carry history this file cannot reconstruct (pass --force to replace)\n`); process.exitCode = 1; continue; }
  if (!registryExists(registryDir)) makeRegistry(registryDir);
  const w = saveBridge(registryDir, bridge);
  if (!w.ok) { console.error(`  WRITE FAILED — ${w.reds.map((x) => `${x.code}:${x.path}`).join(', ')}\n`); process.exitCode = 1; continue; }
  console.log(`  wrote ${w.file}\n`);
}

// the status line the operator reads last: consolidation mints no promotion — the
// entries are exactly as proven as the greens behind them (D6, derived not stored)
const proven = built.filter((b) => deriveStatus(b.bridge.history) === 'proven').length;
console.log(`${built.length} entr${built.length === 1 ? 'y' : 'ies'} · ${proven} proven · ${built.length - proven} candidate${dryRun ? '  (dry run)' : ''}`);
