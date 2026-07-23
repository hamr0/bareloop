// Layer 2 CLIPIPE cross-surface battery — job #4 through the REAL plan flow on the
// NATIVE clipipe subscription surface (BA-16, module 4d). Same frozen read as the API
// acceptance battery (prereg 2026-07-22a): n=3 acting rows, >=2/3 L2-CONVERT, 45-bar
// recorded. This REPLICATES F47 on a different surface — does the built machinery also
// convert when the `claude` CLI drives the turn cycle natively?
//
// All dollars NOTIONAL (subscription-equivalent) — NEVER pooled with anthropic-api rows
// (F42/job-v1 doctrine). F47's API numbers are a cross-surface REFERENCE, not a baseline
// on this surface (different prompting/turn surface). No API key: workers run on the
// Claude subscription via the CLI; the grader/check run locally.
//
//   node scripts/run-battery-l2accept-clipipe.mjs                 # prints hash + plan, spends nothing
//   node scripts/run-battery-l2accept-clipipe.mjs --approve <hash> [--need N] [--priorUsd X]

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
const { CLIPipe } = require('bare-agent/providers');

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const COMMIT = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18';
const MODEL = 'claude-sonnet-5';
const CLI_TIMEOUT_MS = 1_200_000; // per native CLI session (~23s/turn × up to 40 rounds; F48 raised from 900s)
const CLOSE_TIMEOUT_MS = 1_800_000;
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

// caps — NOTIONAL dollars. $8/row (generous; native metering settles at session close),
// $30 cumulative hard-stop, n=3 acting rows, capRuns=4. Sizing confirmed by the POC smoke
// BEFORE the prereg freezes the cap.
const HARD_STOP_USD = 30;
const N_ACT = 3;
const MAX_LAUNCHES = 6;
const CAP_RUNS = 4;

const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);
const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};

const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen-l2accept-clipipe.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const dry = has('dry');
const need = Math.max(1, Number(arg('need') ?? N_ACT));
const priorUsd = Math.max(0, Number(arg('priorUsd') ?? 0));

const approved = arg('approve');
if (approved !== specHash) {
  console.log('LAYER 2 CLIPIPE cross-surface battery — job #4 REAL plan flow, native clipipe-subscription (NOTIONAL dollars)');
  console.log(`  spec     jobs/aurora-testgen-l2accept-clipipe.json  $${spec.budgetUsd}/row capRuns=${CAP_RUNS}  hash ${specHash}`);
  console.log(`  patient  ${WORKDIR} @ ${COMMIT.slice(0, 12)} + frozen seed (${SEED_BASELINE_RATE}% baseline)`);
  console.log(`  ${N_ACT} ACT rows, ${MAX_LAUNCHES} launches max, hard-stop $${HARD_STOP_USD} NOTIONAL, threshold ${THRESHOLD}%`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  node scripts/run-battery-l2accept-clipipe.mjs --approve ${specHash}`);
  process.exit(approved === null ? 0 : 1);
}
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];

// The native provider FACTORY (BA-16 / module 4d live-smoke pattern): native governance
// is constructor-time and per-worker, so the runner calls this fresh per worker.
//   hasTools:true  -> native tool mode (claude-mcp); policy/onTurn/maxTurns clip the arbiter
//                     onto the PROVIDER (the CLI owns the loop).
//   hasTools:false -> the toolless drafter; a native no-tools session reports NO cost
//                     (onTurn silent), so it runs metered claude-json TEXT mode instead.
const nativeProvider = dry
  ? /** @type {any} */ (() => { throw new Error('DRY RUN: native provider constructed — this run was supposed to spend nothing'); })
  : (/** @type {{policy:Function, onTurn?:Function, maxTurns:number, hasTools:boolean}} */ { policy, onTurn, maxTurns, hasTools }) => hasTools
    // F48: the native session needs `sessionTimeout` (the whole-session wall clock, default 600s) —
    // `timeout` is only the outer generate ceiling. A slow multi-round native step (~23s/turn × 30
    // rounds ≈ 690s) blew past the 600s default, hit session_timeout, and reported UNPRICED cost →
    // pricing-red casualty before grading. Size the session clock to the step's round budget.
    ? new CLIPipe({ command: 'claude', args: ['-p', '--model', MODEL, '--strict-mcp-config', '--setting-sources', ''], toolProtocol: 'claude-mcp', policy, onTurn, maxTurns, timeout: CLI_TIMEOUT_MS, sessionTimeout: CLI_TIMEOUT_MS })
    : new CLIPipe({ command: 'claude', args: ['-p', '--model', MODEL, '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--setting-sources', ''], parse: 'claude-json', timeout: CLI_TIMEOUT_MS });
// the Loop-path `provider` is never used for a clipipe job (the factory serves both surfaces)
const provider = /** @type {any} */ ({ async generate() { throw new Error('the API Loop provider was called on a clipipe job — native factory should serve every worker'); } });

const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', `${wd.split('/').at(-1)}-bareloop`);
mkdirSync(spineDir, { recursive: true });
const graderSh = join(spineDir, 'testgen-close.sh');
const checkSh = join(spineDir, 'l2poc-check-close.sh');
const graderLog = join(spineDir, 'testgen-close-log.jsonl');
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
  const stray = archiveAudit(join(spineDir, `l2clip-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
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

console.log(`spec ${specHash} approved by ${approvals[0].signer}   runid ${runid}${dry ? '   [DRY]' : `   model ${MODEL} via native clipipe`}`);
console.log(`caps  $${spec.budgetUsd}/row capRuns=${CAP_RUNS} · hard-stop $${HARD_STOP_USD} NOTIONAL · threshold ${THRESHOLD}% · seed ${SEED_BASELINE_RATE}%\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = priorUsd;
let stop = null;
let launches = 0;

const isAct = (/** @type {any} */ r) => r.valid && r.acted > 0;

for (let i = 1; rows.filter(isAct).length < need && launches < MAX_LAUNCHES && !stop; i++) {
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
  const spineFile = join(spineDir, `l2clip-L${i}-${runid}.jsonl`);
  const outcome = await runJob(spec, {
    approvals, workdir: wd, provider, nativeProvider, emit: makeSpine(spineFile),
    shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS,
  });
  const audit = archiveAudit(join(spineDir, `l2clip-L${i}-${runid}-gate-audit.jsonl`));
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
  // native surface reports rounds as worker-round kind:'session'; count both for visibility
  const rounds = events.filter((ev) => ev.type === 'worker-round').length;
  const turns = events.filter((ev) => ev.type === 'worker-turn').length;

  const planAccepted = events.filter((e) => e.type === 'plan-accepted').map((e) => e.plan);
  const planReferencedCheck = planAccepted.some((p) => (p?.steps ?? []).some((s) => (s.exit ?? []).some((x) => x.type === 'check-passes' && x.name === 'clean-run')));
  const planSteps = planAccepted.length ? (planAccepted[0].steps ?? []).length : 0;
  const replanned = planAccepted.length > 1;

  const graderSlice = logLines(graderLog).slice(beforeGrader).map((l) => JSON.parse(l));
  const precheck = graderSlice[0] ?? null;
  const grade = graderSlice.length >= 2 ? graderSlice[graderSlice.length - 1] : null;
  const precheckOk = precheck != null && precheck.phase === 'verdict' && precheck.rate === SEED_BASELINE_RATE;

  const converted = acted > 0 && grade != null && grade.phase === 'verdict';
  const green45 = outcome === 'green' || (grade != null && grade.phase === 'verdict' && grade.rate >= THRESHOLD);

  /** @type {any} */
  const row = {
    run: `L${i}`, outcome, casualty, acted, rounds, turns, planSteps, planReferencedCheck, replanned,
    precheck: precheck ? { phase: precheck.phase, rate: precheck.rate ?? null } : null,
    grade: grade ? { phase: grade.phase, rate: grade.rate ?? null, killed: grade.killed ?? null } : null,
    converted, green45, vsSeed: grade?.rate != null ? (grade.rate > SEED_BASELINE_RATE ? 'UP' : 'FLAT') : null,
    delta, spentUsd, spendComplete, secretsClean: leaks.length === 0, spine: spineFile, audit,
  };

  if (casualty) { row.cls = 'CASUALTY'; row.valid = false; }
  else if (!precheckOk) { row.cls = 'INSTRUMENT-STOP(precheck-drift)'; row.valid = false; stop = `L${i}: grader precheck read ${precheck ? `${precheck.phase}:${precheck.rate}` : 'null'} != verdict:${SEED_BASELINE_RATE} — drift, re-derive`; }
  else if (acted === 0) { row.cls = 'L2-INERT'; row.valid = true; }
  else if (outcome === 'plan-red') { row.cls = 'L2-PLAN-RED'; row.valid = true; }
  else if (converted) { row.cls = 'L2-CONVERT'; row.valid = true; }
  else { row.cls = 'L2-NO-CONVERT'; row.valid = true; }

  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  const g = row.grade ? ` grade=${row.grade.phase}${row.grade.rate != null ? ':' + row.grade.rate + '%' : ''}` : '';
  console.log(`  row     outcome=${outcome} class=${row.cls} acted=${acted} rounds=${rounds} turns=${turns} planSteps=${planSteps} planCheck=${planReferencedCheck}${row.replanned ? ' REPLANNED' : ''}${g} spent=${row.spentUsd == null ? 'UNKNOWN' : `${row.spendComplete === false ? '≥' : ''}$${row.spentUsd.toFixed(4)} notional`}`);
  console.log(`  read    converted=${converted} green45=${green45} vsSeed=${row.vsSeed ?? '-'} delta targeted=${delta.targeted.length}/${SURVIVOR_FUNCS.length}`);
  if (!row.secretsClean) { stop = `L${i}: SPINE LEAK — the hard line is broken`; break; }
  if (!dry && (row.spendComplete === false || row.spentUsd == null)) { stop = `L${i}: spend not governable (floor/unpriced) — the cap cannot govern it`; break; }
}

resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)} (seed removed)`);

const actRows = rows.filter(isAct);
const converts = actRows.filter((r) => r.cls === 'L2-CONVERT').length;
const inert = rows.filter((r) => r.cls === 'L2-INERT').length;
const greens45 = rows.filter((r) => r.green45).length;
let reading;
if (stop && stop.includes('precheck-drift')) reading = 'VOID: grader precheck drift — instrument, no read';
else if (need !== N_ACT) reading = `CONTINUATION: ${actRows.length} acting row(s) this invocation — combine with prior banked rows for the frozen n=${N_ACT} read`;
else if (actRows.length < N_ACT) reading = `INCOMPLETE (${actRows.length}/${N_ACT} acting rows) — report rows in hand, no top-up without hamr`;
else if (converts >= 2) reading = 'CLIPIPE CONVERTS: the native surface reproduces conversion (>=2/3 acting rows graded) — cross-surface replication of F47 holds';
else if (converts === 0) reading = 'CLIPIPE DID NOT CONVERT: the native surface did not reproduce conversion — report, decide with hamr';
else reading = 'MIXED (1 of 3) — report to hamr';

const results = {
  runid, specHash, commit: COMMIT, dry, model: dry ? null : MODEL, provider: 'clipipe-subscription', notional: true,
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
const resultsFile = join(spineDir, `l2clip-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nrun  outcome        class            acted  rounds  planCheck  grade         green45  spent(notional)');
for (const r of rows) {
  const g = r.grade ? `${r.grade.phase}${r.grade.rate != null ? ':' + r.grade.rate + '%' : ''}` : '-';
  console.log(`${r.run.padEnd(4)} ${String(r.outcome ?? '-').padEnd(14)} ${String(r.cls).padEnd(16)} ${String(r.acted ?? '-').padEnd(6)} ${String(r.rounds ?? '-').padEnd(7)} ${String(r.planReferencedCheck).padEnd(10)} ${g.padEnd(13)} ${String(r.green45).padEnd(8)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\nacting ${actRows.length} · CONVERT ${converts} · INERT ${inert} · greens@${THRESHOLD} ${greens45} · plan-composed-check ${results.summary.planComposedCheck}/${actRows.length} · spend $${cumulativeUsd.toFixed(4)} of $${HARD_STOP_USD} NOTIONAL`);
console.log(`grades: ${JSON.stringify(results.summary.grades)}  (API/F47 cross-surface ref: 67.5/55/55)`);
console.log(`reading: ${reading}`);
if (stop) console.log(`STOP: ${stop}`);
console.log(`results: ${resultsFile}`);
process.exit(0);
