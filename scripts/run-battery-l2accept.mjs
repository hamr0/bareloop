// Layer 2 rung ACCEPTANCE battery — job #4 (TESTGEN) through the REAL plan flow.
// TESTGEN-PREREG.md amendment 2026-07-22a (frozen BEFORE any number).
//
// This is NOT the POC (run-poc-layer2.mjs, which HARDWIRED the winning check
// composition). Here the four-field plan-shape spec dispatches runJob -> runPlan:
// scout -> Planner drafts a plan-v1 DAG -> validator gates -> per-step Loop+Gate
// executor (the signed `clean-run` check is referenced by the plan as a step exit)
// -> outer grader close (the only truth) + its bounded fix loop. The AGENT authors
// the check composition the POC hardwired; whether it does is part of the read.
//
// Reads against F39 (0 conversion; 3/3 acting rows died at the clean wall) and the
// POC (F46: 3/3 hardwired conversions, 0 at the 45 bar). Provider anthropic-api,
// worker claude-sonnet-5 (F39/POC surface — behavioral reads live where baselines live).
//
// PRIMARY (acceptance): >=2 of 3 acting rows L2-CONVERT (the flow drives the worker
//   to a clean, GRADED suite — outer grader reaches phase 'verdict'). 0/3 = the build
//   broke the premise, STOP. 1/3 = mixed, report.
// SECONDARY (recorded, NOT acceptance — pre-registered axis split): kill-rate, greens
//   at 45 (F38's claim gets its first real-flow data), plan-composed-the-check rate,
//   vs seed, vs POC. A 45 green additionally satisfies the "path closes green
//   end-to-end" milestone that sunsets steps[] — recorded, never the gate.
//
//   node scripts/run-battery-l2accept.mjs                 # prints hash + plan, spends nothing
//   ANTHROPIC_API_KEY=... node scripts/run-battery-l2accept.mjs --approve <hash>

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
const CLOSE_TIMEOUT_MS = 1_800_000; // per grader/check invocation (40 mutants ~1-2min)
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

// frozen caps (amendment 2026-07-22a, hamr-signed): $8/row REAL, n=3 ACT rows,
// $30 hard-stop, capRuns=4 (mirrors the POC check loop). Budget must fund the plan
// steps PLUS the grader fix loop PLUS every check/grader run (16g sizing rule); if a
// row cap-halts before converting, that is a SIZING finding (re-size with hamr), not
// a premise fail. spendComplete=false / null spentUsd => STOP (spend not governable).
const HARD_STOP_USD = 30;
const N_ACT = 3;
const MAX_LAUNCHES = 6;
const CAP_RUNS = 4;

const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);
const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};

const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen-l2accept.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const dry = has('dry');
// --runs N: run only N launches this invocation (casualty rows re-run to keep n=3)
const runsRequested = Math.max(1, Math.min(MAX_LAUNCHES, Number(arg('runs') ?? MAX_LAUNCHES)));

const approved = arg('approve');
if (approved !== specHash) {
  console.log('LAYER 2 ACCEPTANCE battery (prereg 2026-07-22a) — job #4 through the REAL plan flow, anthropic-api (REAL dollars)');
  console.log(`  spec     jobs/aurora-testgen-l2accept.json  $${spec.budgetUsd}/row capRuns=${CAP_RUNS}  hash ${specHash}`);
  console.log(`  patient  ${WORKDIR} @ ${COMMIT.slice(0, 12)} + frozen seed (${SEED_BASELINE_RATE}% baseline)`);
  console.log(`  ${N_ACT} ACT rows, ${MAX_LAUNCHES} launches max, hard-stop $${HARD_STOP_USD} REAL, threshold ${THRESHOLD}%`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-battery-l2accept.mjs --approve ${specHash}`);
  process.exit(approved === null ? 0 : 1);
}
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!dry && !apiKey) {
  console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
  process.exit(2);
}
const provider = dry
  ? /** @type {any} */ ({ async generate() { throw new Error('DRY RUN: the provider was called — this run was supposed to spend nothing'); } })
  : new AnthropicProvider({ apiKey, model: MODEL });

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
  const stray = archiveAudit(join(spineDir, `l2accept-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
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

console.log(`spec ${specHash} approved by ${approvals[0].signer}   runid ${runid}${dry ? '   [DRY]' : `   model ${MODEL} via anthropic-api`}`);
console.log(`caps  $${spec.budgetUsd}/row capRuns=${CAP_RUNS} · hard-stop $${HARD_STOP_USD} REAL · threshold ${THRESHOLD}% · seed ${SEED_BASELINE_RATE}%\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null;
let launches = 0;

const isAct = (/** @type {any} */ r) => r.valid && r.acted > 0;

for (let i = 1; rows.filter(isAct).length < N_ACT && launches < runsRequested && !stop; i++) {
  if (launches >= MAX_LAUNCHES) { stop = `launch backstop ${MAX_LAUNCHES} reached`; break; }
  if (cumulativeUsd + spec.budgetUsd > HARD_STOP_USD) {
    stop = `battery cap: $${cumulativeUsd.toFixed(4)} + $${spec.budgetUsd}/row would exceed $${HARD_STOP_USD} — row ${i} not launched`;
    break;
  }
  launches++;
  console.log(`\n== L${i} ==`);
  resetPatient();
  seedPatient();
  console.log(`  reset   clean at ${COMMIT.slice(0, 12)} + seed copied (manifest-verified)`);

  const beforeGrader = logLines(graderLog).length;
  const spineFile = join(spineDir, `l2accept-L${i}-${runid}.jsonl`);
  const outcome = await runJob(spec, {
    approvals, workdir: wd, provider, emit: makeSpine(spineFile),
    shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS,
  });
  const audit = archiveAudit(join(spineDir, `l2accept-L${i}-${runid}-gate-audit.jsonl`));
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

  // did the AGENT compose the winning check exit? (the POC hardwired it; here it's a read)
  const planAccepted = events.filter((e) => e.type === 'plan-accepted').map((e) => e.plan);
  const planReferencedCheck = planAccepted.some((p) => (p?.steps ?? []).some((s) => (s.exit ?? []).some((x) => x.type === 'check-passes' && x.name === 'clean-run')));
  const planSteps = planAccepted.length ? (planAccepted[0].steps ?? []).length : 0;
  const replanned = planAccepted.length > 1;
  const checkRuns = events.filter((e) => e.type === 'check-run').map((e) => ({ name: e.name, verdict: e.verdict }));

  // grade = the outer grader's LAST log entry this run (precheck is slice[0]); the
  // grader also runs inside the fix loop, so the final entry is the settled grade.
  const graderSlice = logLines(graderLog).slice(beforeGrader).map((l) => JSON.parse(l));
  const precheck = graderSlice[0] ?? null;                       // runPlan's close precheck
  const grade = graderSlice.length >= 2 ? graderSlice[graderSlice.length - 1] : null; // null = outer close never ran
  const precheckOk = precheck != null && precheck.phase === 'verdict' && precheck.rate === SEED_BASELINE_RATE;

  const converted = acted > 0 && grade != null && grade.phase === 'verdict';
  const green45 = outcome === 'green' || (grade != null && grade.phase === 'verdict' && grade.rate >= THRESHOLD);

  /** @type {any} */
  const row = {
    run: `L${i}`, outcome, casualty, acted, rounds, planSteps, planReferencedCheck, replanned,
    checkRuns, precheck: precheck ? { phase: precheck.phase, rate: precheck.rate ?? null } : null,
    grade: grade ? { phase: grade.phase, rate: grade.rate ?? null, killed: grade.killed ?? null } : null,
    converted, green45, vsSeed: grade?.rate != null ? (grade.rate > SEED_BASELINE_RATE ? 'UP' : 'FLAT') : null,
    delta, spentUsd, spendComplete, secretsClean: leaks.length === 0, spine: spineFile, audit,
  };

  // classification
  if (casualty) { row.cls = 'CASUALTY'; row.valid = false; }
  else if (!precheckOk) { row.cls = 'INSTRUMENT-STOP(precheck-drift)'; row.valid = false; stop = `L${i}: grader precheck read ${precheck ? `${precheck.phase}:${precheck.rate}` : 'null'} != verdict:${SEED_BASELINE_RATE} — drift, re-derive`; }
  else if (acted === 0) { row.cls = 'L2-INERT'; row.valid = true; }
  else if (outcome === 'plan-red') { row.cls = 'L2-PLAN-RED'; row.valid = true; }
  else if (converted) { row.cls = 'L2-CONVERT'; row.valid = true; }
  else { row.cls = 'L2-NO-CONVERT'; row.valid = true; }

  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  const g = row.grade ? ` grade=${row.grade.phase}${row.grade.rate != null ? ':' + row.grade.rate + '%' : ''}` : '';
  console.log(`  row     outcome=${outcome} class=${row.cls} acted=${acted} rounds=${rounds} planSteps=${planSteps} planCheck=${planReferencedCheck}${row.replanned ? ' REPLANNED' : ''}${g} spent=${row.spentUsd == null ? 'UNKNOWN' : `${row.spendComplete === false ? '≥' : ''}$${row.spentUsd.toFixed(4)}`}`);
  console.log(`  read    converted=${converted} green45=${green45} vsSeed=${row.vsSeed ?? '-'} checkRuns=${checkRuns.length} delta targeted=${delta.targeted.length}/${SURVIVOR_FUNCS.length}`);
  if (!row.secretsClean) { stop = `L${i}: SPINE LEAK — the hard line is broken`; break; }
  if (!dry && (row.spendComplete === false || row.spentUsd == null)) { stop = `L${i}: spend not governable (floor/unpriced) — the cap cannot govern it`; break; }
}

resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)} (seed removed)`);

// ---- frozen reading (2026-07-22a) -------------------------------------------
const actRows = rows.filter(isAct);
const converts = actRows.filter((r) => r.cls === 'L2-CONVERT').length;
const inert = rows.filter((r) => r.cls === 'L2-INERT').length;
const greens45 = rows.filter((r) => r.green45).length;
let reading;
if (stop && stop.includes('precheck-drift')) reading = 'VOID: grader precheck drift — instrument, no premise read';
else if (actRows.length < N_ACT) reading = `INCOMPLETE (${actRows.length}/${N_ACT} acting rows) — report rows in hand, no top-up without hamr`;
else if (converts >= 2) reading = 'ACCEPTANCE MET: the real plan flow reproduces the clean-wall conversion (>=2/3 acting rows reach a graded suite) — Layer 2 machinery holds';
else if (converts === 0) reading = 'ACCEPTANCE FAILS: the built flow did not reproduce conversion — the stop is the result; findings entry; redesign with hamr';
else reading = 'MIXED (1 of 3) — report to hamr, no unilateral extension';

const results = {
  runid, specHash, commit: COMMIT, dry, model: dry ? null : MODEL, provider: 'anthropic-api',
  threshold: THRESHOLD, seedBaselineRate: SEED_BASELINE_RATE, capRuns: CAP_RUNS,
  hardStopUsd: HARD_STOP_USD, cumulativeUsd, stop, launches, rows,
  summary: {
    actRows: actRows.length, converts, noConvert: actRows.filter((r) => r.cls === 'L2-NO-CONVERT').length,
    planReds: rows.filter((r) => r.cls === 'L2-PLAN-RED').length, inert,
    casualties: rows.filter((r) => r.cls === 'CASUALTY').length,
    planComposedCheck: actRows.filter((r) => r.planReferencedCheck).length,
    greens45, grades: actRows.map((r) => r.grade?.rate ?? null), vsSeed: actRows.map((r) => r.vsSeed ?? null),
    reading,
  },
};
const resultsFile = join(spineDir, `l2accept-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nrun  outcome        class            acted  rounds  planCheck  grade         green45  spent');
for (const r of rows) {
  const g = r.grade ? `${r.grade.phase}${r.grade.rate != null ? ':' + r.grade.rate + '%' : ''}` : '-';
  console.log(`${r.run.padEnd(4)} ${String(r.outcome ?? '-').padEnd(14)} ${String(r.cls).padEnd(16)} ${String(r.acted ?? '-').padEnd(6)} ${String(r.rounds ?? '-').padEnd(7)} ${String(r.planReferencedCheck).padEnd(10)} ${g.padEnd(13)} ${String(r.green45).padEnd(8)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\nacting ${actRows.length} · CONVERT ${converts} · INERT ${inert} · greens@${THRESHOLD} ${greens45} · plan-composed-check ${results.summary.planComposedCheck}/${actRows.length} · spend $${cumulativeUsd.toFixed(4)} of $${HARD_STOP_USD}`);
console.log(`grades: ${JSON.stringify(results.summary.grades)}  (POC was 27.5/40/37.5, 0 at ${THRESHOLD})`);
console.log(`reading: ${reading}`);
if (stop) console.log(`STOP: ${stop}`);
console.log(`results: ${resultsFile}`);
process.exit(0);
