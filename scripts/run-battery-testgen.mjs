// TESTGEN battery runner — job #4, TESTGEN-PREREG.md §8 + amendment 2026-07-16h.
// n=5 LOOP runs (capRuns=3: attempt → close → gap → attempt), the first observation
// of Layer 1's thesis on this job. Threshold N=45 frozen in testgen-threshold.txt.
//
// Primary endpoint (§8): conversion = kill-rate strictly increases attempt-over-attempt
// where consecutive attempts are both graded. Extended ladder (16h, pre-registered for
// the ungraded-attempt case the one-shots proved dominant):
//   rank 0 form-red with zero tests · rank 1 audit-red or form-red with >0 tests
//   rank 2 clean-red · rank 3 graded — within rank 3, higher rate = progress.
// By-construction check (§8): an attempt-1 GREEN means the threshold failed → drift,
// STOP the battery.
//
//   node scripts/run-battery-testgen.mjs                    # prints hash + plan, spends nothing
//   ANTHROPIC_API_KEY=... node scripts/run-battery-testgen.mjs --approve <hash>

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const COMMIT = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18';
const MODEL = 'claude-sonnet-5';
const BATTERY_CAP_USD = 30; // hamr-approved 2026-07-16 ("go for next experiment", amendment 2026-07-16h)
const CLOSE_TIMEOUT_MS = 1_800_000;
const N_RUNS = 5;
const CAP_RUNS = 3; // attempts per run — THE loop
const FROZEN_SHA_PREFIX = 'b75a7fe7f71199f8';
const THRESHOLD = 45;

const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};
const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);

const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const dry = has('dry');

// --runs N: run only N rows this invocation (amendment 16h: casualty rows are re-run to
// keep n=5 — the babysitter passes the REMAINING count so valid rows never exceed 5)
const runsRequested = Math.max(1, Math.min(N_RUNS, Number(arg('runs') ?? N_RUNS)));

const approved = arg('approve');
if (approved !== specHash) {
  console.log(`job:       ${spec.job} — BATTERY (loop runs, §8 + 16h)`);
  console.log(`spec:      jobs/aurora-testgen.json   $${spec.budgetUsd}/run × ${N_RUNS} runs × ${CAP_RUNS} attempts, battery hard-stop $${BATTERY_CAP_USD}`);
  console.log(`patient:   ${WORKDIR} @ ${COMMIT}`);
  console.log(`specHash:  ${specHash}`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-battery-testgen.mjs --approve ${specHash}`);
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
// the battery is the INVERSE of calibration: the frozen threshold MUST exist and match
const thresholdFile = join(spineDir, 'testgen-threshold.txt');
if (!existsSync(thresholdFile) || Number(readFileSync(thresholdFile, 'utf8').trim()) !== THRESHOLD) {
  console.error(`testgen-threshold.txt missing or != ${THRESHOLD} — the battery runs only against the frozen bar (amendment 2026-07-16h)`);
  process.exit(2);
}
const runid = Date.now().toString(36);

const git = (/** @type {string[]} */ args) => execFileSync('git', ['-C', wd, ...args], { encoding: 'utf8' }).trim();

function archiveAudit(/** @type {string} */ dest) {
  const src = join(wd, 'gate-audit.jsonl');
  if (!existsSync(src)) return null;
  renameSync(src, dest);
  return dest;
}

function resetPatient() {
  const stray = archiveAudit(join(spineDir, `testgen-bat-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
  if (stray) console.log(`  reset   archived stray gate audit → ${stray}`);
  git(['checkout', '--force', '--quiet', COMMIT]);
  const head = git(['rev-parse', 'HEAD']);
  if (head !== COMMIT) throw new Error(`reset failed: HEAD ${head} != frozen ${COMMIT}`);
  git(['clean', '-fdq', '-e', '.venv', '-e', '.smoke', '-e', '.litectx']);
  rmSync(join(wd, '.litectx'), { recursive: true, force: true });
  if (existsSync(join(wd, 'tests/testgen'))) throw new Error('reset left tests/testgen behind — row independence broken');
  const orch = readFileSync(join(wd, 'packages/soar/src/aurora_soar/orchestrator.py'));
  const sha = createHash('sha256').update(orch).digest('hex');
  if (!sha.startsWith(FROZEN_SHA_PREFIX)) throw new Error(`reset left orchestrator at ${sha.slice(0, 16)} != frozen ${FROZEN_SHA_PREFIX}`);
  const status = git(['status', '--porcelain']);
  if (status !== '') throw new Error(`reset left the tree dirty:\n${status}`);
}

const closeLogLines = () => existsSync(closeLog) ? readFileSync(closeLog, 'utf8').trimEnd().split('\n').filter(Boolean) : [];

/** amendment 16h ladder: progress toward a graded suite, frozen before any battery number */
function ladderRank(/** @type {any} */ e) {
  if (e.phase === 'verdict') return 3;
  if (e.phase === 'clean') return 2;
  if (e.phase === 'audit') return 1;
  if (e.phase === 'form') {
    const u = e.form?.unit ?? 0, g = e.form?.integration ?? 0;
    return (u + g) > 0 ? 1 : 0;
  }
  return 0;
}

console.log(`spec ${specHash} approved by ${approvals[0].signer}`);
console.log(`patient ${wd} @ ${COMMIT}${dry ? '   [DRY: provider throws if called]' : `   model ${MODEL}`}`);
console.log(`caps    $${spec.budgetUsd}/run × ${CAP_RUNS} attempts, $${BATTERY_CAP_USD} battery hard-stop, threshold ${THRESHOLD}%   runid ${runid}\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null;

for (let i = 1; i <= runsRequested; i++) {
  // the cap binds INSIDE the sequence (2026-07-16b lesson): launch only if the whole budget fits
  if (cumulativeUsd + spec.budgetUsd > BATTERY_CAP_USD) {
    stop = `battery cap: cumulative $${cumulativeUsd.toFixed(4)} + $${spec.budgetUsd}/run would exceed $${BATTERY_CAP_USD} — run ${i} not launched`;
    break;
  }
  console.log(`\n== B${i} ==`);
  resetPatient();
  console.log(`  reset   clean at ${COMMIT.slice(0, 12)}, .litectx wiped`);

  const before = closeLogLines().length;
  const spineFile = join(spineDir, `testgen-bat-B${i}-${runid}.jsonl`);
  const outcome = await runJob(spec, { approvals, workdir: wd, provider, emit: makeSpine(spineFile), shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS });
  const audit = archiveAudit(join(spineDir, `testgen-bat-B${i}-${runid}-gate-audit.jsonl`));

  const raw = readFileSync(spineFile, 'utf8');
  const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spentUsd = events.findLast((e) => e.type === 'job-end')?.spentUsd ?? null;
  const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);

  // per-attempt readout: close entries appended during THIS run, minus the precheck
  // (the precheck is entry 0 of the slice: always the empty-tree form-red).
  const entries = closeLogLines().slice(before).map((l) => JSON.parse(l));
  const attempts = entries.slice(1).map((e, idx) => ({
    attempt: idx + 1, phase: e.phase, rank: ladderRank(e),
    rate: e.phase === 'verdict' ? e.rate : null,
    killed: e.phase === 'verdict' ? e.killed : null,
    form: e.form ?? null, verdict: e.verdict ?? null,
    rounds: events.filter((ev) => ev.type === 'worker-round' && ev.kind === 'turn' && ev.iteration === idx + 1).length,
  }));

  // conversion flags (16h): primary = both-graded rate strictly up; ladder = rank strictly up
  let conversionPrimary = false, conversionLadder = false, deliveredGaps = Math.max(0, attempts.length - 1);
  for (let a = 1; a < attempts.length; a++) {
    const prev = attempts[a - 1], cur = attempts[a];
    if (prev.rate != null && cur.rate != null && cur.rate > prev.rate) conversionPrimary = true;
    if (cur.rank > prev.rank) conversionLadder = true;
  }
  const green = attempts.some((a) => a.verdict === 'satisfied' || (a.rate != null && a.rate >= THRESHOLD));

  const casualty = events.some((e) => e.type === 'escalation' && e.category === 'provider-red');
  const row = {
    run: `B${i}`, outcome, casualty, attempts, deliveredGaps, conversionPrimary, conversionLadder, green,
    spentUsd, secretsClean: leaks.length === 0, spine: spineFile, audit,
  };
  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  console.log(`  row     outcome=${row.outcome}${casualty ? ' CASUALTY' : ''} attempts=${attempts.map((a) => `${a.phase}${a.rate != null ? ':' + a.rate + '%' : ''}(r${a.rank})`).join(' → ') || '-'} spent=${row.spentUsd == null ? 'UNKNOWN' : `$${row.spentUsd.toFixed(4)}`}`);
  console.log(`  read    conversion primary=${conversionPrimary} ladder=${conversionLadder} green=${green}`);
  if (!row.secretsClean) { stop = `B${i}: SPINE LEAK — the hard line is broken`; break; }
  if (!dry && row.spentUsd == null) { stop = `B${i}: spend unknown — the cap cannot govern unpriced spend`; break; }
  // §8 by-construction check: attempt-1 green = the threshold formula failed = drift = STOP
  if (attempts.length >= 1 && attempts[0].verdict === 'satisfied') { stop = `B${i}: ATTEMPT-1 GREEN — threshold drift, battery invalid, re-derive (§8)`; break; }
}

resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)}`);

const results = {
  runid, specHash, commit: COMMIT, dry, model: dry ? null : MODEL, threshold: THRESHOLD,
  batteryCapUsd: BATTERY_CAP_USD, cumulativeUsd, stop, rows,
  summary: {
    runs: rows.length,
    valid: rows.filter((r) => !r.casualty).length,
    casualties: rows.filter((r) => r.casualty).length,
    greens: rows.filter((r) => r.green).length,
    conversionPrimary: rows.filter((r) => r.conversionPrimary).length,
    conversionLadder: rows.filter((r) => r.conversionLadder).length,
  },
};
const resultsFile = join(spineDir, `testgen-bat-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nrun  outcome        attempts(phase:rate)                      conv-primary  conv-ladder  green  spent');
for (const r of rows) {
  const a = r.attempts.map((/** @type {any} */ x) => `${x.phase}${x.rate != null ? ':' + x.rate + '%' : ''}`).join('→');
  console.log(`${r.run.padEnd(4)} ${String(r.outcome).padEnd(14)} ${a.padEnd(41)} ${String(r.conversionPrimary).padEnd(13)} ${String(r.conversionLadder).padEnd(12)} ${String(r.green).padEnd(6)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\nruns ${results.summary.runs} (valid ${results.summary.valid}, casualties ${results.summary.casualties})   greens ${results.summary.greens}   conversion primary ${results.summary.conversionPrimary}/${results.summary.runs}   ladder ${results.summary.conversionLadder}/${results.summary.runs}   spend $${cumulativeUsd.toFixed(4)} of $${BATTERY_CAP_USD}`);
if (stop) console.log(`STOP: ${stop}`);
console.log(`results: ${resultsFile}`);
process.exit(0);
