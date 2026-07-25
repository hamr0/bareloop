// Job #5 (TYPES) HARDNESS SCREEN — TYPES-PREREG.md §6, frozen before any number.
//
// Second-genre e2e per PRD v1.26. One row per verbosity arm through the REAL plan flow
// (scout -> Planner drafts plan-v1 -> validator gates -> per-step Loop+Gate executor with
// operator-signed checks the AGENT composes -> outer close + bounded fix loop).
//
// This screen decides ADMISSION ONLY. n=1 per arm is an anecdote in BOTH directions (a red
// at n=1 is exactly as much an anecdote as a green), so it never mints a capability finding.
//
//   H1  not one-shot   — an arm whose FIRST graded attempt is green is DISCARDED (saturated)
//   H2  gradient       — strict-error count must strictly decrease across two successive
//                        readings, else DISCARDED as unreadable
//   selection          — both survive -> battery runs ARM C; one survives -> that one;
//                        NEITHER survives -> job #5 is DISCARDED and the stop IS the result
//
//   node scripts/run-screen-types.mjs                    # prints hashes, spends nothing
//   ANTHROPIC_API_KEY=... node scripts/run-screen-types.mjs --approve <c-hash> <f-hash>

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-types';
const SPINE_DIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-types-bareloop';
const SEED_REF = 'ca1af8a';
const MODEL = 'claude-sonnet-5';
const SEED_ERRORS = 63;          // frozen §3 baseline — the precheck must read exactly this
const CLOSE_TIMEOUT_MS = 900_000; // close = tsc + 410-test suite + emit (~90s); checks up to 5min
const CAP_RUNS = 4;
const HARD_STOP_USD = 8;         // 2 rows x $4/row, frozen §6.1

const ARMS = [
  { id: 'C', spec: '../jobs/litectx-types-screen-c.json', label: 'counts-only' },
  { id: 'F', spec: '../jobs/litectx-types-screen-f.json', label: 'full-errors' },
];

const has = (/** @type {string} */ n) => process.argv.includes(`--${n}`);
const dry = has('dry');
const approveIdx = process.argv.indexOf('--approve');
const approvedHashes = approveIdx === -1 ? [] : process.argv.slice(approveIdx + 1, approveIdx + 3);

const specs = ARMS.map((a) => {
  const spec = JSON.parse(readFileSync(new URL(a.spec, import.meta.url), 'utf8'));
  return { ...a, spec, hash: jobSpecHash(spec) };
});

if (!specs.every((s, i) => approvedHashes[i] === s.hash)) {
  console.log('JOB #5 TYPES hardness screen (TYPES-PREREG.md §6) — anthropic-api, REAL dollars');
  console.log(`  patient  ${WORKDIR} @ seed ${SEED_REF} (${SEED_ERRORS} strict errors, suite 410/409/0)`);
  console.log(`  ${specs.length} rows, $${specs[0].spec.budgetUsd}/row, hard-stop $${HARD_STOP_USD}, capRuns=${CAP_RUNS}, model ${MODEL}`);
  for (const s of specs) console.log(`  ARM ${s.id}  ${s.label.padEnd(12)} ${s.hash}`);
  if (approvedHashes.length) console.error('\nREFUSED: --approve hashes do not match these spec versions.');
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-screen-types.mjs --approve ${specs.map((s) => s.hash).join(' ')}`);
  process.exit(approvedHashes.length ? 1 : 0);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!dry && !apiKey) {
  console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
  process.exit(2);
}
const provider = dry
  ? /** @type {any} */ ({ async generate() { throw new Error('DRY RUN: the provider was called — this run was supposed to spend nothing'); } })
  : new AnthropicProvider({ apiKey, model: MODEL });

const wd = resolve(WORKDIR);
mkdirSync(SPINE_DIR, { recursive: true });
const closeLog = join(SPINE_DIR, 'types-close-log.jsonl');
const checkLog = join(SPINE_DIR, 'types-check-log.jsonl');
if (!existsSync(join(SPINE_DIR, 'types-seed-symbols.txt'))) {
  console.error('types-seed-symbols.txt missing — regenerate with: node scripts/types-close.mjs symbols');
  process.exit(2);
}
const runid = Date.now().toString(36);
const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
const logLines = (/** @type {string} */ f) => existsSync(f) ? readFileSync(f, 'utf8').trimEnd().split('\n').filter(Boolean) : [];

function resetPatient() {
  const stray = join(wd, 'gate-audit.jsonl');
  if (existsSync(stray)) renameSync(stray, join(SPINE_DIR, `types-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
  git(['checkout', '--force', '--quiet', SEED_REF]);
  const head = git(['rev-parse', 'HEAD']);
  if (!head.startsWith(SEED_REF)) throw new Error(`reset failed: HEAD ${head} != frozen seed ${SEED_REF}`);
  // -fd only removes untracked-and-NOT-ignored, so node_modules/.litectx/types survive
  git(['clean', '-fdq']);
  const status = git(['status', '--porcelain']);
  if (status !== '') throw new Error(`reset left the tree dirty:\n${status}`);
}

console.log(`screen ${runid}${dry ? '  [DRY]' : `  model ${MODEL} via anthropic-api`}`);
console.log(`caps   $${specs[0].spec.budgetUsd}/row · hard-stop $${HARD_STOP_USD} · capRuns=${CAP_RUNS} · seed ${SEED_ERRORS} errors\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null;

for (const s of specs) {
  if (cumulativeUsd + s.spec.budgetUsd > HARD_STOP_USD) { stop = `screen cap: $${cumulativeUsd.toFixed(4)} + $${s.spec.budgetUsd} would exceed $${HARD_STOP_USD} — ARM ${s.id} not launched`; break; }
  console.log(`\n== ARM ${s.id} (${s.label}) ==`);
  resetPatient();
  console.log(`  reset   clean at seed ${SEED_REF}`);

  const beforeClose = logLines(closeLog).length;
  const beforeCheck = logLines(checkLog).length;
  const spineFile = join(SPINE_DIR, `types-screen-${s.id}-${runid}.jsonl`);
  const approvals = [{ specHash: s.hash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];

  const outcome = await runJob(s.spec, {
    approvals, workdir: wd, provider, emit: makeSpine(spineFile),
    shellCapUsd: s.spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS,
  });

  const auditSrc = join(wd, 'gate-audit.jsonl');
  const audit = existsSync(auditSrc) ? join(SPINE_DIR, `types-screen-${s.id}-${runid}-gate-audit.jsonl`) : null;
  if (audit) renameSync(auditSrc, audit);

  const raw = readFileSync(spineFile, 'utf8');
  const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const je = events.findLast((e) => e.type === 'job-end');
  const spentUsd = je?.spentUsd ?? null;
  const spendComplete = je?.spendComplete;
  const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);
  const casualty = events.some((e) => e.type === 'escalation' && e.category === 'provider-red');

  const auditEntries = audit ? logLines(audit).map((l) => JSON.parse(l)) : [];
  const acted = auditEntries.filter((e) => e.decision === 'allow' && (e.action?.type === 'write' || e.action?.type === 'edit')).length;
  const rounds = events.filter((e) => e.type === 'worker-round' && e.kind === 'turn').length;

  const planAccepted = events.filter((e) => e.type === 'plan-accepted').map((e) => e.plan);
  const plan = planAccepted[0] ?? null;
  const planSteps = plan ? (plan.steps ?? []).length : 0;
  const composedChecks = [...new Set(planAccepted.flatMap((p) => (p?.steps ?? []).flatMap((st) => (st.exit ?? []).filter((x) => x.type === 'check-passes').map((x) => x.name))))];
  const replanned = planAccepted.length > 1;

  // ---- the graded trajectory --------------------------------------------------
  // close slice[0] is runPlan's own precheck (the seed state) — never an attempt grade.
  // F45: a harness slicing a shared append-only log must account for EVERY writer.
  const closeSlice = logLines(closeLog).slice(beforeClose).map((l) => JSON.parse(l));
  const checkSlice = logLines(checkLog).slice(beforeCheck).map((l) => JSON.parse(l));
  const precheck = closeSlice[0] ?? null;
  const attempts = closeSlice.slice(1);
  const precheckOk = precheck != null && precheck.phase === 'typecheck' && precheck.errors === SEED_ERRORS;

  // H2 reads the error count wherever it was measured, in order: the close's own attempt
  // grades AND every typecheck-clean check the agent composed. Either channel counts —
  // an arm that only ever iterates through checks is still showing a gradient.
  const trajectory = [
    ...(precheck?.errors != null ? [{ src: 'precheck', errors: precheck.errors }] : []),
    ...attempts.filter((a) => a.errors != null).map((a) => ({ src: 'close', errors: a.errors })),
    ...checkSlice.filter((c) => c.check === 'typecheck-clean' && c.errors != null).map((c) => ({ src: 'check', errors: c.errors })),
  ];
  // strictly-decreasing pair count over the ORDERED readings after the precheck
  const post = trajectory.filter((t) => t.src !== 'precheck').map((t) => t.errors);
  const readings = [SEED_ERRORS, ...post];
  let decreases = 0;
  for (let i = 1; i < readings.length; i++) if (readings[i] < readings[i - 1]) decreases++;

  const firstAttempt = attempts[0] ?? null;
  const firstAttemptGreen = firstAttempt != null && firstAttempt.verdict === 'green';
  const converged = outcome === 'green' || attempts.some((a) => a.verdict === 'green');

  const h1 = !firstAttemptGreen;                       // not one-shot
  const h2 = decreases >= 2 || (converged && decreases >= 1); // readable gradient

  /** @type {any} */
  const row = {
    arm: s.id, label: s.label, outcome, casualty, acted, rounds, planSteps, composedChecks, replanned,
    precheck: precheck ? { phase: precheck.phase, errors: precheck.errors ?? null } : null,
    attempts: attempts.map((a) => ({ phase: a.phase, verdict: a.verdict, errors: a.errors ?? null, tests: a.tests ?? null, fails: a.fails ?? null })),
    checkRuns: checkSlice.map((c) => ({ check: c.check, pass: c.pass, errors: c.errors ?? null })),
    readings, decreases, firstAttemptGreen, converged, h1, h2,
    spentUsd, spendComplete, secretsClean: leaks.length === 0, spine: spineFile, audit,
  };

  if (casualty) { row.cls = 'CASUALTY'; row.valid = false; }
  else if (!precheckOk) { row.cls = 'INSTRUMENT-STOP(precheck-drift)'; row.valid = false; stop = `ARM ${s.id}: close precheck read ${precheck ? `${precheck.phase}:${precheck.errors}` : 'null'} != typecheck:${SEED_ERRORS} — drift, re-derive`; }
  else if (acted === 0) { row.cls = 'INERT'; row.valid = true; }
  else if (outcome === 'plan-red') { row.cls = 'PLAN-RED'; row.valid = true; }
  else { row.cls = converged ? 'CONVERGED' : 'NO-CONVERGE'; row.valid = true; }

  // admission verdict (frozen §6). Only a VALID acting row can be admitted or discarded on
  // merit; a casualty or instrument stop is neither — it is simply unread.
  row.admit = !row.valid || acted === 0 ? null : (row.h1 && row.h2);

  rows.push(row);
  cumulativeUsd += spentUsd ?? 0;
  console.log(`  row     outcome=${outcome} class=${row.cls} acted=${acted} rounds=${rounds} planSteps=${planSteps} checks=[${composedChecks.join(',')}]${replanned ? ' REPLANNED' : ''}`);
  console.log(`  grade   readings=${JSON.stringify(readings)} decreases=${decreases} firstAttemptGreen=${firstAttemptGreen} converged=${converged}`);
  console.log(`  gates   H1=${row.h1 ? 'PASS' : 'FAIL(one-shot)'} H2=${row.h2 ? 'PASS' : 'FAIL(no gradient)'} admit=${row.admit} spent=${spentUsd == null ? 'UNKNOWN' : `${spendComplete === false ? '≥' : ''}$${spentUsd.toFixed(4)}`}`);
  if (!row.secretsClean) { stop = `ARM ${s.id}: SPINE LEAK — the hard line is broken`; break; }
  if (!dry && (spendComplete === false || spentUsd == null)) { stop = `ARM ${s.id}: spend not governable (floor/unpriced) — the cap cannot govern it`; break; }
  if (stop) break;
}

resetPatient();
console.log(`\npatient reset — clean at seed ${SEED_REF}`);

// ---- frozen selection rule (§6.1) -------------------------------------------
const admitted = rows.filter((r) => r.admit === true).map((r) => r.arm);
const unread = rows.filter((r) => r.admit === null).map((r) => r.arm);
let selected = null;
let reading;
if (rows.length < ARMS.length || unread.length) {
  reading = `INCOMPLETE — ${rows.length}/${ARMS.length} rows, unread arms [${unread.join(',')}]. Re-run only the unread arms; never let a casualty shrink coverage.`;
} else if (admitted.length === 2) {
  selected = 'C';
  reading = 'BOTH ARMS ADMITTED — the battery runs ARM C (harder channel, and the one consistent with standing gap doctrine). ARM F is a recorded-secondary contrast.';
} else if (admitted.length === 1) {
  selected = admitted[0];
  reading = `ONE ARM ADMITTED (${selected}) — the battery runs it.`;
} else {
  reading = 'NEITHER ARM ADMITTED — job #5 is DISCARDED and the stop IS the result. No cap widening, no loosened gate, no third arm invented after the numbers. Report to hamr.';
}

const results = {
  runid, dry, model: dry ? null : MODEL, provider: 'anthropic-api', seedRef: SEED_REF,
  seedErrors: SEED_ERRORS, hardStopUsd: HARD_STOP_USD, capRuns: CAP_RUNS,
  cumulativeUsd, stop, rows, selected,
  summary: { admitted, unread, reading },
};
const resultsFile = join(SPINE_DIR, `types-screen-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\narm  class            acted  rounds  steps  readings                    H1     H2     admit  spent');
for (const r of rows) {
  console.log(`${r.arm.padEnd(4)} ${String(r.cls).padEnd(16)} ${String(r.acted).padEnd(6)} ${String(r.rounds).padEnd(7)} ${String(r.planSteps).padEnd(6)} ${JSON.stringify(r.readings).padEnd(27)} ${(r.h1 ? 'PASS' : 'FAIL').padEnd(6)} ${(r.h2 ? 'PASS' : 'FAIL').padEnd(6)} ${String(r.admit).padEnd(6)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\nspend $${cumulativeUsd.toFixed(4)} of $${HARD_STOP_USD}`);
console.log(`reading: ${reading}`);
if (stop) console.log(`STOP: ${stop}`);
console.log(`results: ${resultsFile}`);
process.exit(0);
