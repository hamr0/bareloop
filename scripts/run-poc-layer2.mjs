// Layer 2 POC runner — TESTGEN-PREREG.md amendment 2026-07-21a (frozen before
// any number). Two arms over clipipe-subscription (F42, bare-agent 0.32.0 tool
// emulation), worker claude-sonnet-5:
//   BASELINE — F39 replication on this provider: capRuns=1, grader as close.
//     Transport gate: >=2 of 3 ACT rows dead at the clean wall, else STOP.
//   CHECK — the lever: capRuns=4, in-row close = the operator-signed check
//     (changed-from-seed → D1 → form → clean); check-green rows face the FROZEN
//     grader exactly once (harness-run) for the rate. The grader stays the only
//     truth; the check decides nothing and mints nothing.
// Primary read: clean-wall survival among CHECK ACT rows (>=2/3 L-CLEAN-PASS).
// Kill-rate/greens are RECORDED, never acceptance (pre-registered axis split).
// All dollars NOTIONAL (subscription-equivalent) — never pooled with API rows.
//
//   node scripts/run-poc-layer2.mjs                    # prints hashes + plan, spends nothing
//   node scripts/run-poc-layer2.mjs --approve <baselineHash>,<checkHash>

import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { CLIPipeProvider } = require('bare-agent/providers');

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const COMMIT = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18';
const MODEL = 'claude-sonnet-5';
const GRADER_TIMEOUT_MS = 1_800_000;
const CHECK_TIMEOUT_MS = 600_000;
const FROZEN_SHA_PREFIX = 'b75a7fe7f71199f8';
const THRESHOLD = 45;
const SEED_BASELINE_RATE = 15;
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

// frozen caps (2026-07-21a, hamr-approved notional)
const POC_CAP_USD = 50;
const N_ACT = 3; // per arm
const ARM_MAX_LAUNCHES = 6;
const MAX_LAUNCHES = 12; // total backstop

const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);
const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};

const baseSpec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen-l2poc-baseline.json', import.meta.url), 'utf8'));
const checkSpec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen-l2poc-check.json', import.meta.url), 'utf8'));
const baseHash = jobSpecHash(baseSpec);
const checkHash = jobSpecHash(checkSpec);
const dry = has('dry');

const approved = arg('approve');
const wanted = `${baseHash},${checkHash}`;
if (approved !== wanted) {
  console.log('LAYER 2 POC (prereg 2026-07-21a) — two arms, clipipe-subscription (NOTIONAL dollars)');
  console.log(`  BASELINE ${baseSpec.job}  $${baseSpec.budgetUsd}/row capRuns=1  hash ${baseHash}`);
  console.log(`  CHECK    ${checkSpec.job}  $${checkSpec.budgetUsd}/row capRuns=4  hash ${checkHash}`);
  console.log(`  ${N_ACT} ACT rows/arm, ${ARM_MAX_LAUNCHES} launches/arm, ${MAX_LAUNCHES} total, POC hard-stop $${POC_CAP_USD} notional`);
  if (approved !== null) console.error(`\nREFUSED: --approve does not match this spec pair.`);
  console.log(`\nTo approve and run:\n  node scripts/run-poc-layer2.mjs --approve ${wanted}`);
  process.exit(approved === null ? 0 : 1);
}
const ts = () => new Date().toISOString();
const mkApprovals = (/** @type {string} */ h) => [{ specHash: h, signer: process.env.USER ?? 'human', ts: ts() }];

const provider = dry
  ? /** @type {any} */ ({ async generate() { throw new Error('DRY RUN: provider called'); } })
  : new CLIPipeProvider({
      command: 'claude',
      // --output-format json REQUIRED on base args for the plain-text (drafting)
      // path; strip flags make it bare/cheap (tool mode appends its own copies).
      args: ['-p', '--model', MODEL, '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--setting-sources', ''],
      toolProtocol: 'claude',
      parse: 'claude-json',
      timeout: 300_000,
    });

const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', `${wd.split('/').at(-1)}-bareloop`);
mkdirSync(spineDir, { recursive: true });
const graderSh = join(spineDir, 'testgen-close.sh');
const checkSh = join(spineDir, 'l2poc-check-close.sh');
const graderLog = join(spineDir, 'testgen-close-log.jsonl');
const checkLog = join(spineDir, 'l2poc-check-log.jsonl');
for (const f of [graderSh, checkSh]) {
  if (!existsSync(f)) { console.error(`close wrapper missing: ${f}`); process.exit(2); }
}
const thresholdFile = join(spineDir, 'testgen-threshold.txt');
if (!existsSync(thresholdFile) || Number(readFileSync(thresholdFile, 'utf8').trim()) !== THRESHOLD) {
  console.error(`testgen-threshold.txt missing or != ${THRESHOLD} — the grader must grade at the frozen bar`);
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
  const stray = archiveAudit(join(spineDir, `l2poc-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
  if (stray) console.log(`  reset   archived stray gate audit → ${stray}`);
  git(['checkout', '--force', '--quiet', COMMIT]);
  const head = git(['rev-parse', 'HEAD']);
  if (head !== COMMIT) throw new Error(`reset failed: HEAD ${head} != frozen ${COMMIT}`);
  git(['clean', '-fdq', '-e', '.venv', '-e', '.smoke', '-e', '.litectx']);
  rmSync(join(wd, '.litectx'), { recursive: true, force: true }); // fresh index per row (F33 confound rule)
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

/** which files changed vs the seed + which survivor functions they mention (17a's mechanical read) */
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

const logLines = (/** @type {string} */ f) => existsSync(f) ? readFileSync(f, 'utf8').trimEnd().split('\n').filter(Boolean) : [];

/** run the FROZEN grader once, harness-side; returns its last log entry (or null on stop) */
function runGrader() {
  const r = spawnSync(graderSh, [], { cwd: wd, encoding: 'utf8', timeout: GRADER_TIMEOUT_MS });
  const entries = logLines(graderLog);
  const last = entries.length ? JSON.parse(entries[entries.length - 1]) : null;
  return { code: r.status, entry: last };
}

console.log(`spec pair approved   runid ${runid}${dry ? '   [DRY]' : `   model ${MODEL} via clipipe`}`);
console.log(`caps  baseline $${baseSpec.budgetUsd}/row · check $${checkSpec.budgetUsd}/row · POC hard-stop $${POC_CAP_USD} NOTIONAL · threshold ${THRESHOLD}% · seed ${SEED_BASELINE_RATE}%\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null;
let launches = 0;

/** shared row runner. arm: 'B'|'C'. Returns the row (also pushed) or null when a cap stops the arm. */
async function runRow(/** @type {'B'|'C'} */ arm, /** @type {number} */ i) {
  const spec = arm === 'B' ? baseSpec : checkSpec;
  const capRuns = arm === 'B' ? 1 : 4;
  if (launches >= MAX_LAUNCHES) { stop = `launch backstop ${MAX_LAUNCHES} reached`; return null; }
  if (cumulativeUsd + spec.budgetUsd > POC_CAP_USD) {
    stop = `POC cap: $${cumulativeUsd.toFixed(4)} + $${spec.budgetUsd}/row would exceed $${POC_CAP_USD} — ${arm}${i} not launched`;
    return null;
  }
  launches++;
  console.log(`\n== ${arm}${i} ==`);
  resetPatient();
  seedPatient();
  console.log(`  reset   clean at ${COMMIT.slice(0, 12)} + seed copied (manifest-verified)`);

  // per-row grader precheck at exactly the frozen baseline (drift = instrument stop).
  // The BASELINE arm's runJob precheck IS the grader (same as 17a) — harness-run here
  // for the CHECK arm too so both arms carry the same drift guard.
  const pre = runGrader();
  const precheckOk = pre.entry != null && pre.entry.phase === 'verdict' && pre.entry.rate === SEED_BASELINE_RATE;
  if (!precheckOk) {
    const row = { run: `${arm}${i}`, cls: 'INSTRUMENT-STOP(precheck-drift)', valid: false, precheck: pre.entry, spentUsd: 0, spendComplete: true };
    rows.push(row);
    console.log(`  row     class=${row.cls} precheck=${pre.entry ? `${pre.entry.phase}:${pre.entry.rate}` : 'null'}`);
    return row;
  }

  const beforeGrader = logLines(graderLog).length;
  const beforeCheck = logLines(checkLog).length;
  const spineFile = join(spineDir, `l2poc-${arm}${i}-${runid}.jsonl`);
  const outcome = await runJob(spec, {
    approvals: mkApprovals(arm === 'B' ? baseHash : checkHash), workdir: wd, provider,
    emit: makeSpine(spineFile), shellCapUsd: spec.budgetUsd, capRuns,
    closeTimeoutMs: arm === 'B' ? GRADER_TIMEOUT_MS : CHECK_TIMEOUT_MS,
  });
  const audit = archiveAudit(join(spineDir, `l2poc-${arm}${i}-${runid}-gate-audit.jsonl`));
  const delta = seedDelta();

  const raw = readFileSync(spineFile, 'utf8');
  const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const je = events.findLast((e) => e.type === 'job-end');
  const spentUsd = je?.spentUsd ?? null;
  const spendComplete = je?.spendComplete;
  const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);
  const casualty = events.some((e) => e.type === 'escalation' && e.category === 'provider-red');
  const auditEntries = audit ? logLines(audit).map((l) => JSON.parse(l)) : [];
  const acted = auditEntries.filter((e) => e.decision === 'allow' && (e.action?.type === 'write' || e.action?.type === 'edit')).length;
  const rounds = events.filter((ev) => ev.type === 'worker-round' && ev.kind === 'turn').length;

  /** @type {any} */
  const row = {
    run: `${arm}${i}`, outcome, casualty, acted, rounds, delta,
    spentUsd, spendComplete, secretsClean: leaks.length === 0, spine: spineFile, audit,
  };

  if (arm === 'B') {
    // F39 classes; clean-wall death = grader attempt entry phase 'clean'
    const attempts = logLines(graderLog).slice(beforeGrader).map((l) => JSON.parse(l));
    const attempt = attempts[0] ?? null; // capRuns=1: at most one post-precheck grade
    row.attempt = attempt ? { phase: attempt.phase, rate: attempt.rate ?? null, killed: attempt.killed ?? null } : null;
    if (casualty) row.cls = 'CASUALTY';
    else if (acted === 0) row.cls = 'B-INERT';
    else if (attempt == null) row.cls = 'INSTRUMENT-STOP(no-attempt-close)';
    else if (attempt.phase !== 'verdict') row.cls = 'B-ACT-BROKE';
    else if (attempt.rate > SEED_BASELINE_RATE) row.cls = 'B-ACT-UP';
    else row.cls = 'B-ACT-FLAT';
    row.cleanDeath = attempt != null && attempt.phase === 'clean';
    row.valid = row.cls.startsWith('B-');
  } else {
    const checks = logLines(checkLog).slice(beforeCheck).map((l) => JSON.parse(l));
    row.checks = checks.map((c) => ({ phase: c.phase, verdict: c.verdict }));
    if (casualty) { row.cls = 'CASUALTY'; row.valid = false; }
    else if (acted === 0) { row.cls = 'C-INERT'; row.valid = true; }
    else if (outcome === 'green') {
      // check settled green → the FROZEN grader runs exactly once for the rate
      const graded = runGrader();
      row.grade = graded.entry ? { phase: graded.entry.phase, rate: graded.entry.rate ?? null, killed: graded.entry.killed ?? null } : null;
      row.cls = 'C-CLEAN-PASS';
      row.valid = true;
      row.green45 = graded.entry != null && graded.entry.phase === 'verdict' && graded.entry.rate >= THRESHOLD;
      row.vsBaseline = graded.entry?.rate != null ? (graded.entry.rate > SEED_BASELINE_RATE ? 'UP' : 'FLAT') : null;
    } else { row.cls = 'C-CLEAN-FAIL'; row.valid = true; }
  }

  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  const a = row.attempt ? ` attempt=${row.attempt.phase}${row.attempt.rate != null ? ':' + row.attempt.rate + '%' : ''}` : '';
  const g = row.grade ? ` grade=${row.grade.phase}${row.grade.rate != null ? ':' + row.grade.rate + '%' : ''}` : '';
  console.log(`  row     outcome=${outcome} class=${row.cls} acted=${acted} rounds=${rounds}${a}${g} spent=${row.spentUsd == null ? 'UNKNOWN' : `${row.spendComplete === false ? '≥' : ''}$${row.spentUsd.toFixed(4)}`}`);
  console.log(`  delta   changed=${JSON.stringify(delta.changed)} targeted=${delta.targeted.length}/${SURVIVOR_FUNCS.length}`);
  if (!row.secretsClean) { stop = `${arm}${i}: SPINE LEAK — the hard line is broken`; return row; }
  if (!dry && (row.spendComplete === false || row.spentUsd == null)) { stop = `${arm}${i}: spend not governable (floor/unpriced)`; return row; }
  return row;
}

// ---- BASELINE arm -----------------------------------------------------------
const isB = (/** @type {any} */ r) => r.valid && r.cls.startsWith('B-ACT');
for (let i = 1; rows.filter(isB).length < N_ACT && i <= ARM_MAX_LAUNCHES && !stop; i++) {
  await runRow('B', i);
}
const bAct = rows.filter(isB);
const bCleanDeaths = bAct.filter((r) => r.cleanDeath).length;
const transported = bAct.length >= N_ACT && bCleanDeaths >= 2;
console.log(`\nBASELINE: ${bAct.length} ACT rows, clean-wall deaths ${bCleanDeaths}/${bAct.length} → transport ${transported ? 'CONFIRMED' : 'NOT confirmed'}`);

// ---- CHECK arm (only behind the transport gate) -----------------------------
const isC = (/** @type {any} */ r) => r.valid && (r.cls === 'C-CLEAN-PASS' || r.cls === 'C-CLEAN-FAIL');
if (transported && !stop) {
  for (let i = 1; rows.filter(isC).length < N_ACT && i <= ARM_MAX_LAUNCHES && !stop; i++) {
    await runRow('C', i);
  }
} else if (!stop) {
  stop = `transport gate: F39's clean-wall death did not replicate on clipipe (${bCleanDeaths}/${bAct.length}) — CHECK arm not fired`;
}

resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)} (seed removed)`);

// ---- frozen reading ---------------------------------------------------------
const cAct = rows.filter(isC);
const cPass = cAct.filter((r) => r.cls === 'C-CLEAN-PASS').length;
const cInert = rows.filter((r) => r.cls === 'C-INERT').length;
let reading;
if (!transported) reading = 'VOID: baseline did not transport — no premise read';
else if (cAct.length < N_ACT) reading = `INCOMPLETE (${cAct.length}/${N_ACT} CHECK ACT rows) — report rows in hand, no top-up without hamr`;
else if (cPass >= 2) reading = 'PREMISE HOLDS: the in-run check converts the clean wall — proceed to the real build (design record step 2)';
else if (cPass === 0) reading = 'PREMISE FAILS: the check loop did not convert the clean wall — STOP is the result; findings entry; redesign with hamr';
else reading = 'MIXED (1 of 3) — report to hamr, no unilateral extension';

const results = {
  runid, baseHash, checkHash, commit: COMMIT, dry, model: dry ? null : MODEL,
  provider: 'clipipe-subscription', notional: true,
  threshold: THRESHOLD, seedBaselineRate: SEED_BASELINE_RATE,
  pocCapUsd: POC_CAP_USD, cumulativeUsd, stop, launches, rows,
  summary: {
    baseline: { act: bAct.length, cleanDeaths: bCleanDeaths, transported, inert: rows.filter((r) => r.cls === 'B-INERT').length },
    check: { act: cAct.length, cleanPass: cPass, cleanFail: cAct.length - cPass, inert: cInert,
             greens45: rows.filter((r) => r.green45).length,
             vsBaseline: cAct.map((r) => r.vsBaseline ?? null) },
    casualties: rows.filter((r) => r.cls === 'CASUALTY').length,
    instrumentStops: rows.filter((r) => String(r.cls).startsWith('INSTRUMENT-STOP')).length,
    reading,
  },
};
const resultsFile = join(spineDir, `l2poc-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nrun  outcome        class                          acted  rounds  attempt/grade      spent');
for (const r of rows) {
  const ag = r.attempt ? `${r.attempt.phase}${r.attempt.rate != null ? ':' + r.attempt.rate + '%' : ''}`
    : r.grade ? `${r.grade.phase}${r.grade.rate != null ? ':' + r.grade.rate + '%' : ''}` : '-';
  console.log(`${r.run.padEnd(4)} ${String(r.outcome ?? '-').padEnd(14)} ${String(r.cls).padEnd(30)} ${String(r.acted ?? '-').padEnd(6)} ${String(r.rounds ?? '-').padEnd(7)} ${ag.padEnd(18)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\nbaseline ACT ${bAct.length} (clean-deaths ${bCleanDeaths}) · check ACT ${cAct.length} (CLEAN-PASS ${cPass}, INERT ${cInert}) · spend $${cumulativeUsd.toFixed(4)} of $${POC_CAP_USD} notional`);
console.log(`reading: ${reading}`);
if (stop) console.log(`STOP: ${stop}`);
console.log(`results: ${resultsFile}`);
process.exit(0);
