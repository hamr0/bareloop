// TESTGEN calibration runner — job #4, TESTGEN-PREREG.md §7 (frozen protocol).
// n=5 independent ONE-SHOT runs (capRuns=1: attempt → close → stop; the loop
// never retries) to measure sonnet's one-shot fault-detection base rate. The
// frozen threshold formula consumes the mean: N = ceil((mean + 90) / 2).
//
// Reading rule (amendment 2026-07-16a, frozen BEFORE any number): a run whose
// close reds before the mutation phase (gate/form/clean) yields NO kill-rate —
// the mean uses only mutation-graded rows; if fewer than 3 of 5 rows are graded,
// extend by up to 3 more runs (still under the $2 calibration cap); if still
// fewer than 3, STOP and hand the design back.
//
//   node scripts/run-calibration-testgen.mjs                    # prints hash + plan, spends nothing
//   node scripts/run-calibration-testgen.mjs --approve <hash> --dry
//   ANTHROPIC_API_KEY=... node scripts/run-calibration-testgen.mjs --approve <hash>

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
const CALIBRATION_CAP_USD = 2; // frozen (§7/§8)
const CLOSE_TIMEOUT_MS = 1_800_000; // 30min clock (§4; measured full grade ≈ 18s — ~100× headroom)
const N_RUNS = 5;
const MAX_EXTENSION = 3;
const MIN_GRADED = 3;
const FROZEN_SHA_PREFIX = 'b75a7fe7f71199f8';

const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};
const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);

const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const dry = has('dry');

const approved = arg('approve');
if (approved !== specHash) {
  console.log(`job:       ${spec.job} — calibration (one-shot base rate, §7)`);
  console.log(`spec:      jobs/aurora-testgen.json   $${spec.budgetUsd}/run × ${N_RUNS} runs (+ up to ${MAX_EXTENSION} extension), calibration hard-stop $${CALIBRATION_CAP_USD}`);
  console.log(`patient:   ${WORKDIR} @ ${COMMIT}`);
  console.log(`specHash:  ${specHash}`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-calibration-testgen.mjs --approve ${specHash}`);
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
// threshold file must be ABSENT for calibration (101-mode); a leftover frozen
// threshold would grade calibration against the battery bar — wrong instrument
if (existsSync(join(spineDir, 'testgen-threshold.txt'))) {
  console.error('testgen-threshold.txt already exists — calibration must run in 101-mode; remove/park it first');
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

/** reset: identical mechanics to the job #3 battery (tracked forced back,
 *  untracked non-ignored removed, fresh index), plus two testgen-specific
 *  asserts: the prior run's tests/testgen is GONE (row independence) and the
 *  orchestrator is byte-pristine (the close restores defensively, but the
 *  reset VERIFIES — trust nothing that isn't checked). */
function resetPatient() {
  const stray = archiveAudit(join(spineDir, `testgen-cal-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
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

console.log(`spec ${specHash} approved by ${approvals[0].signer}`);
console.log(`patient ${wd} @ ${COMMIT}${dry ? '   [DRY: provider throws if called]' : `   model ${MODEL}`}`);
console.log(`caps    $${spec.budgetUsd}/run, $${CALIBRATION_CAP_USD} calibration hard-stop, close clock ${CLOSE_TIMEOUT_MS / 60000}min   runid ${runid}\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null;

for (let i = 1; i <= N_RUNS + MAX_EXTENSION; i++) {
  const graded = rows.filter((r) => r.rate != null).length;
  if (i > N_RUNS && (graded >= MIN_GRADED || graded + (N_RUNS + MAX_EXTENSION - i + 1) < MIN_GRADED)) break;
  if (i > N_RUNS) console.log(`  (extension run — only ${graded}/${MIN_GRADED} graded rows so far)`);
  if (cumulativeUsd >= CALIBRATION_CAP_USD) {
    stop = `calibration cap: cumulative $${cumulativeUsd.toFixed(4)} >= $${CALIBRATION_CAP_USD} before run ${i}`;
    break;
  }
  console.log(`\n== C${i} ==`);
  resetPatient();
  console.log(`  reset   clean at ${COMMIT.slice(0, 12)}, .litectx wiped`);

  const before = closeLogLines().length;
  const spineFile = join(spineDir, `testgen-cal-C${i}-${runid}.jsonl`);
  const outcome = await runJob(spec, { approvals, workdir: wd, provider, emit: makeSpine(spineFile), shellCapUsd: spec.budgetUsd, capRuns: 1, closeTimeoutMs: CLOSE_TIMEOUT_MS });
  const audit = archiveAudit(join(spineDir, `testgen-cal-C${i}-${runid}-gate-audit.jsonl`));

  const raw = readFileSync(spineFile, 'utf8');
  const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spentUsd = events.findLast((e) => e.type === 'job-end')?.spentUsd ?? null;
  const rounds = events.filter((e) => e.type === 'worker-round').length;
  const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);

  // the close's own log is the kill-rate instrument: entries appended during
  // THIS run; the LAST one is the graded close of the single attempt (earlier
  // ones are the precheck). rate is null unless the mutation phase ran.
  const closeEntries = closeLogLines().slice(before).map((l) => JSON.parse(l));
  const last = closeEntries.at(-1) ?? null;
  const row = {
    run: `C${i}`, outcome, phase: last?.phase ?? null,
    rate: last?.phase === 'verdict' ? last.rate : null,
    killed: last?.phase === 'verdict' ? last.killed : null,
    form: last?.form ?? null, auditHit: last?.auditHit ?? null, tamper: last?.tamper ?? false,
    rounds, spentUsd, secretsClean: leaks.length === 0, spine: spineFile, audit,
  };
  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  console.log(`  row     outcome=${row.outcome} phase=${row.phase ?? '-'} rate=${row.rate ?? 'UNREADABLE'} rounds=${row.rounds} spent=${row.spentUsd == null ? 'UNKNOWN' : `$${row.spentUsd.toFixed(4)}`}`);
  if (!row.secretsClean) { stop = `C${i}: SPINE LEAK — the hard line is broken`; break; }
  if (!dry && row.spentUsd == null) { stop = `C${i}: spend unknown — the cap cannot govern unpriced spend`; break; }
}

resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)}`);

const gradedRows = rows.filter((r) => r.rate != null);
const mean = gradedRows.length ? gradedRows.reduce((s, r) => s + r.rate, 0) / gradedRows.length : null;
// frozen formula (§7): N = ceil((mean + 90) / 2); guards: mean >= 85 → no
// headroom STOP; mean === 0 → autopsy before proceeding
const threshold = mean == null ? null : Math.ceil((mean + 90) / 2);

const results = {
  runid, specHash, commit: COMMIT, dry, model: dry ? null : MODEL,
  calibrationCapUsd: CALIBRATION_CAP_USD, cumulativeUsd, stop, rows,
  graded: gradedRows.length, meanRate: mean, thresholdByFormula: threshold,
  guards: {
    noHeadroom: mean != null && mean >= 85,
    zeroMean: mean === 0,
    tooFewGraded: gradedRows.length < MIN_GRADED,
  },
};
const resultsFile = join(spineDir, `testgen-cal-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nrun  outcome        phase     rate    rounds  spent');
for (const r of rows) {
  console.log(`${r.run.padEnd(4)} ${String(r.outcome).padEnd(14)} ${String(r.phase ?? '-').padEnd(9)} ${String(r.rate ?? '-').padEnd(7)} ${String(r.rounds).padEnd(7)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\ngraded ${gradedRows.length}/${rows.length}   mean ${mean == null ? 'UNREADABLE' : mean.toFixed(1) + '%'}   formula threshold ${threshold ?? '-'}%   spend $${cumulativeUsd.toFixed(4)} of $${CALIBRATION_CAP_USD}`);
if (results.guards.noHeadroom) console.log('GUARD: mean >= 85 — NO HEADROOM, do not run the battery; redesign mutant classes');
if (results.guards.zeroMean) console.log('GUARD: mean == 0 — autopsy before proceeding');
if (results.guards.tooFewGraded) console.log(`GUARD: fewer than ${MIN_GRADED} graded rows — STOP, hand the design back`);
if (stop) console.log(`STOP: ${stop}`);
console.log(`results: ${resultsFile}`);
console.log('\nNEXT (manual, after reading): write the threshold to testgen-threshold.txt + prereg amendment — never automated');
process.exit(0);
