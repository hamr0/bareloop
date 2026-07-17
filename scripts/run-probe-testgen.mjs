// TESTGEN semantic-stall probe runner — job #4, TESTGEN-PREREG.md amendments
// 2026-07-17a/b. n=4 ONE-ATTEMPT rows (capRuns=1) against the frozen
// operator-authored seed suite (docs/02-experiments/testgen-seed-suite,
// measured baseline 15%): a Wizard-of-Oz Layer R — the spec description
// hand-carries what the notebook would carry.
// Frozen row classes: P-INERT · P-ACT-BROKE · P-ACT-FLAT · P-ACT-UP.
// A green here is NOT drift (the seed is below bar by measurement, not
// construction); it is the strongest P-ACT-UP.
//
//   node scripts/run-probe-testgen.mjs                    # prints hash + plan, spends nothing
//   ANTHROPIC_API_KEY=... node scripts/run-probe-testgen.mjs --approve <hash>

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const COMMIT = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18';
const MODEL = 'claude-sonnet-5';
const CLOSE_TIMEOUT_MS = 1_800_000;
const MAX_LAUNCHES = 12; // casualty/instrument re-run backstop, still under the $ cap
const CAP_RUNS = 1; // ONE attempt — the probe has no gap channel
const FROZEN_SHA_PREFIX = 'b75a7fe7f71199f8';
const THRESHOLD = 45;
const SEED_BASELINE_RATE = 15; // measured 2026-07-17 (amendment 2026-07-17b)
const SEED_DIR = fileURLToPath(new URL('../docs/02-experiments/testgen-seed-suite', import.meta.url));
const SEED_FILES = ['conftest.py', 'unit/test_orchestrator_helpers.py', 'integration/test_execute_simple_path.py'];
const SURVIVOR_FUNCS = [
  'execute', '_check_soar_cache_hit', '_configure_health_monitoring', '_phase7_record',
  '_phase3_decompose', '_execute_simple_path', '_handle_execution_error',
  '_build_verify_only_result', '_build_cached_verify_result', '_check_goals_json_cache',
  '_get_progress_callback', '_phase2_retrieve', '_inject_context_files', '_phase5_collect',
  '_handle_critical_failure', '_handle_verification_failure', '_split_large_chunk_by_sections',
  '_classify_api_error',
];

const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};
const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);

// 17a defaults; 17d extension overrides (--valid 1 --cap 6) — mechanical, no semantic change
const N_VALID_ROWS = Math.max(1, Number(arg('valid') ?? 4));
const PROBE_CAP_USD = Math.max(0, Number(arg('cap') ?? 10)); // hamr-approved: $10 (17a), $6 extension (17d)

const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen-probe.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const dry = has('dry');

const approved = arg('approve');
if (approved !== specHash) {
  console.log(`job:       ${spec.job} — SEMANTIC-STALL PROBE (one-attempt rows, 17a/17b)`);
  console.log(`spec:      jobs/aurora-testgen-probe.json   $${spec.budgetUsd}/row × ${N_VALID_ROWS} valid rows, probe hard-stop $${PROBE_CAP_USD}`);
  console.log(`patient:   ${WORKDIR} @ ${COMMIT} + frozen seed (baseline ${SEED_BASELINE_RATE}%)`);
  console.log(`specHash:  ${specHash}`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-probe-testgen.mjs --approve ${specHash}`);
  process.exit(approved === null ? 0 : 1);
}
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!dry && !apiKey) {
  console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
  process.exit(2);
}
const provider = dry
  ? { async generate() { throw new Error('DRY RUN: the provider was called — this run was supposed to spend nothing'); } }
  : new AnthropicProvider({ apiKey, model: MODEL });

const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', `${wd.split('/').at(-1)}-bareloop`);
mkdirSync(spineDir, { recursive: true });
const closeSh = join(spineDir, 'testgen-close.sh');
const closeLog = join(spineDir, 'testgen-close-log.jsonl');
if (!existsSync(closeSh)) {
  console.error(`close wrapper missing: ${closeSh}`);
  process.exit(2);
}
const thresholdFile = join(spineDir, 'testgen-threshold.txt');
if (!existsSync(thresholdFile) || Number(readFileSync(thresholdFile, 'utf8').trim()) !== THRESHOLD) {
  console.error(`testgen-threshold.txt missing or != ${THRESHOLD} — the probe grades against the frozen battery bar`);
  process.exit(2);
}
const runid = Date.now().toString(36);

const git = (/** @type {string[]} */ args) => execFileSync('git', ['-C', wd, ...args], { encoding: 'utf8' }).trim();
const sha = (/** @type {string|Buffer} */ s) => createHash('sha256').update(s).digest('hex');

const seedManifest = Object.fromEntries(
  readFileSync(join(SEED_DIR, 'MANIFEST.sha256'), 'utf8').trimEnd().split('\n').filter(Boolean)
    .map((l) => { const m = l.match(/^([0-9a-f]{64})\s+(.+)$/); if (!m) throw new Error(`bad manifest line: ${l}`); return [m[2], m[1]]; }),
);

function archiveAudit(/** @type {string} */ dest) {
  const src = join(wd, 'gate-audit.jsonl');
  if (!existsSync(src)) return null;
  renameSync(src, dest);
  return dest;
}

function resetPatient() {
  const stray = archiveAudit(join(spineDir, `testgen-probe-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
  if (stray) console.log(`  reset   archived stray gate audit → ${stray}`);
  git(['checkout', '--force', '--quiet', COMMIT]);
  const head = git(['rev-parse', 'HEAD']);
  if (head !== COMMIT) throw new Error(`reset failed: HEAD ${head} != frozen ${COMMIT}`);
  git(['clean', '-fdq', '-e', '.venv', '-e', '.smoke', '-e', '.litectx']);
  rmSync(join(wd, '.litectx'), { recursive: true, force: true });
  if (existsSync(join(wd, 'tests/testgen'))) throw new Error('reset left tests/testgen behind — row independence broken');
  const orch = readFileSync(join(wd, 'packages/soar/src/aurora_soar/orchestrator.py'));
  if (!sha(orch).startsWith(FROZEN_SHA_PREFIX)) throw new Error('reset left orchestrator off the frozen hash');
  const status = git(['status', '--porcelain']);
  if (status !== '') throw new Error(`reset left the tree dirty:\n${status}`);
}

function seedPatient() {
  for (const rel of SEED_FILES) {
    const body = readFileSync(join(SEED_DIR, rel));
    if (sha(body) !== seedManifest[rel]) throw new Error(`seed drift vs MANIFEST.sha256: ${rel}`);
    const dest = join(wd, 'tests/testgen', rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  }
}

/** gap-utilization read (17a secondary): which files the worker added/modified vs
 *  the seed, and which survivor functions those files mention (mechanical grep) */
function seedDelta() {
  const root = join(wd, 'tests/testgen');
  /** @type {string[]} */
  const files = [];
  (function walk(/** @type {string} */ d) {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.py')) files.push(p);
    }
  })(root);
  /** @type {Array<{file: string, status: string}>} */
  const changed = [];
  let newOrModifiedContent = '';
  for (const f of files) {
    const rel = relative(root, f);
    const body = readFileSync(f);
    const known = seedManifest[rel];
    if (!known) { changed.push({ file: rel, status: 'new' }); newOrModifiedContent += body.toString(); }
    else if (sha(body) !== known) { changed.push({ file: rel, status: 'modified' }); newOrModifiedContent += body.toString(); }
  }
  for (const rel of SEED_FILES) {
    if (!existsSync(join(root, rel))) changed.push({ file: rel, status: 'deleted' });
  }
  const targeted = SURVIVOR_FUNCS.filter((fn) => newOrModifiedContent.includes(fn));
  return { changed, targeted };
}

const closeLogLines = () => existsSync(closeLog) ? readFileSync(closeLog, 'utf8').trimEnd().split('\n').filter(Boolean) : [];

console.log(`spec ${specHash} approved by ${approvals[0].signer}`);
console.log(`patient ${wd} @ ${COMMIT}${dry ? '   [DRY: provider throws if called]' : `   model ${MODEL}`}`);
console.log(`caps    $${spec.budgetUsd}/row × ${N_VALID_ROWS} valid rows, $${PROBE_CAP_USD} probe hard-stop, threshold ${THRESHOLD}%, seed baseline ${SEED_BASELINE_RATE}%   runid ${runid}\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null;
let validRows = 0;

for (let i = 1; validRows < N_VALID_ROWS && i <= MAX_LAUNCHES; i++) {
  if (cumulativeUsd + spec.budgetUsd > PROBE_CAP_USD) {
    stop = `probe cap: cumulative $${cumulativeUsd.toFixed(4)} + $${spec.budgetUsd}/row would exceed $${PROBE_CAP_USD} — row ${i} not launched`;
    break;
  }
  console.log(`\n== P${i} ==`);
  resetPatient();
  seedPatient();
  console.log(`  reset   clean at ${COMMIT.slice(0, 12)} + seed copied (manifest-verified)`);

  const before = closeLogLines().length;
  const spineFile = join(spineDir, `testgen-probe-P${i}-${runid}.jsonl`);
  const outcome = await runJob(spec, { approvals, workdir: wd, provider, emit: makeSpine(spineFile), shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS });
  const audit = archiveAudit(join(spineDir, `testgen-probe-P${i}-${runid}-gate-audit.jsonl`));
  const delta = seedDelta();

  const raw = readFileSync(spineFile, 'utf8');
  const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spentUsd = events.findLast((e) => e.type === 'job-end')?.spentUsd ?? null;
  const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);
  const casualty = events.some((e) => e.type === 'escalation' && e.category === 'provider-red');

  const entries = closeLogLines().slice(before).map((l) => JSON.parse(l));
  const precheck = entries[0] ?? null;
  const precheckOk = precheck != null && precheck.phase === 'verdict' && precheck.rate === SEED_BASELINE_RATE;
  const attempt = entries[1] ?? null;

  const auditEntries = audit ? readFileSync(audit, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const acted = auditEntries.filter((e) => e.decision === 'allow' && (e.action?.type === 'write' || e.action?.type === 'edit')).length;
  const rounds = events.filter((ev) => ev.type === 'worker-round' && ev.kind === 'turn' && ev.iteration === 1).length;

  let cls;
  if (casualty) cls = 'CASUALTY';
  else if (!precheckOk) cls = 'INSTRUMENT-STOP(precheck-drift)';
  else if (acted === 0) cls = 'P-INERT';
  else if (attempt == null) cls = 'INSTRUMENT-STOP(no-attempt-close)';
  else if (attempt.phase !== 'verdict') cls = 'P-ACT-BROKE';
  else if (attempt.rate > SEED_BASELINE_RATE) cls = 'P-ACT-UP';
  else cls = 'P-ACT-FLAT';
  const valid = cls.startsWith('P-');
  if (valid) validRows++;
  const green = attempt != null && attempt.phase === 'verdict' && attempt.rate >= THRESHOLD;

  const row = {
    run: `P${i}`, outcome, cls, valid, casualty, acted, rounds,
    precheck: precheck ? { phase: precheck.phase, rate: precheck.rate ?? null } : null,
    attempt: attempt ? { phase: attempt.phase, rate: attempt.rate ?? null, killed: attempt.killed ?? null, form: attempt.form ?? null, auditHit: attempt.auditHit ?? null } : null,
    green, delta, spentUsd, secretsClean: leaks.length === 0, spine: spineFile, audit,
  };
  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  console.log(`  row     outcome=${outcome} class=${cls} acted=${acted} rounds=${rounds} attempt=${attempt ? `${attempt.phase}${attempt.rate != null ? ':' + attempt.rate + '%' : ''}` : '-'} spent=${row.spentUsd == null ? 'UNKNOWN' : `$${row.spentUsd.toFixed(4)}`}`);
  console.log(`  delta   changed=${JSON.stringify(delta.changed)} targeted=${delta.targeted.join(',') || '-'}`);
  if (!row.secretsClean) { stop = `P${i}: SPINE LEAK — the hard line is broken`; break; }
  if (!dry && row.spentUsd == null) { stop = `P${i}: spend unknown — the cap cannot govern unpriced spend`; break; }
}

resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)} (seed removed)`);

const count = (/** @type {string} */ c) => rows.filter((r) => r.valid && r.cls === c).length;
const reading =
  count('P-ACT-UP') >= 3 ? 'memory-class: explicit state framing moves the worker AND lifts kill-rate — Layer R channel is a live lever (crafted-seed caveat carried)'
  : count('P-INERT') >= 3 ? 'not-memory-class: explicit framing does not move the worker — notebook alone insufficient (Layer 2 / gap-genre evidence)'
  : 'skill-class/mixed: engagement without (majority) conversion — notebook alone will not move kill-rate';

const results = {
  runid, specHash, commit: COMMIT, dry, model: dry ? null : MODEL, threshold: THRESHOLD,
  seedBaselineRate: SEED_BASELINE_RATE, seedManifest, probeCapUsd: PROBE_CAP_USD, cumulativeUsd, stop, rows,
  summary: {
    launches: rows.length,
    valid: validRows,
    casualties: rows.filter((r) => r.cls === 'CASUALTY').length,
    instrumentStops: rows.filter((r) => r.cls.startsWith('INSTRUMENT-STOP')).length,
    pInert: count('P-INERT'), pActBroke: count('P-ACT-BROKE'), pActFlat: count('P-ACT-FLAT'), pActUp: count('P-ACT-UP'),
    greens: rows.filter((r) => r.green).length,
    reading: validRows >= N_VALID_ROWS ? reading : `INCOMPLETE (${validRows}/${N_VALID_ROWS} valid rows) — report rows in hand, no top-up without hamr`,
  },
};
const resultsFile = join(spineDir, `testgen-probe-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nrun  outcome        class                          acted  rounds  attempt            green  spent');
for (const r of rows) {
  const a = r.attempt ? `${r.attempt.phase}${r.attempt.rate != null ? ':' + r.attempt.rate + '%' : ''}` : '-';
  console.log(`${r.run.padEnd(4)} ${String(r.outcome).padEnd(14)} ${r.cls.padEnd(30)} ${String(r.acted).padEnd(6)} ${String(r.rounds).padEnd(7)} ${a.padEnd(18)} ${String(r.green).padEnd(6)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\nvalid ${validRows}/${N_VALID_ROWS}   INERT ${count('P-INERT')}  BROKE ${count('P-ACT-BROKE')}  FLAT ${count('P-ACT-FLAT')}  UP ${count('P-ACT-UP')}   greens ${results.summary.greens}   spend $${cumulativeUsd.toFixed(4)} of $${PROBE_CAP_USD}`);
console.log(`reading: ${results.summary.reading}`);
if (stop) console.log(`STOP: ${stop}`);
console.log(`results: ${resultsFile}`);
process.exit(0);
