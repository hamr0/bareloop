// Aurora battery runner — job #3, the frozen 4-plant battery of
// docs/02-experiments/AURORA-PREREG.md against the frozen aurora patient.
// A REWRITE of run-battery.mjs for the pytest close genre, never a copy:
// TAP parsing → pytest FAILED-line parsing, npm test → the operator-owned
// close wrapper, plus the two frozen aurora conditions — a 15-minute close
// clock (the ~6.5-min suite would die under the 120s default) and a FRESH
// litectx index per run (wipes the written-memory store: row independence by
// construction; a ranking no-op — measured, F35).
//
// Per plant, in the frozen order: reset the patient to the frozen commit →
// wipe .litectx → apply the ONE anchored edit (exactly-once or ABORT) →
// sanity-run the close and compare the FAILED set to the prereg's recorded set
// (drift = STOP, never a shrug) → runJob under the signed spec → archive the
// gate audit out of the tree → record the row. Battery-level guards: cumulative
// spend hard-stops at $10 (frozen; the stop is a result), and a sanity/plant
// drift stops the battery before any further spend.
//
//   node scripts/run-battery-aurora.mjs                             # prints hash + plan, spends nothing
//   node scripts/run-battery-aurora.mjs --approve <hash> --dry      # full cycle, provider throws if called
//   ANTHROPIC_API_KEY=... node scripts/run-battery-aurora.mjs --approve <hash>
//   ... --only A2             # rerun a subset (after a STOP); frozen order still applies
//
// AURORA-PREREG reading rules bind this file: single-pass labels are
// provisional, plants get discarded, rules never get loosened.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// ---- the frozen facts (docs/02-experiments/AURORA-PREREG.md — transcribed, never edited) ----
const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const COMMIT = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18';
const MODEL = 'claude-sonnet-5';
const BATTERY_CAP_USD = 10; // battery total spend hard-stop (frozen)
const CLOSE_TIMEOUT_MS = 900_000; // frozen: green close ~6.5 min, red ~4.5 min; the 120s default kills every close

/**
 * The frozen plant table, transcribed EXACTLY from docs/02-experiments/AURORA-PREREG.md
 * ("Accepted plants"). `before` must occur EXACTLY ONCE in `file` at the frozen
 * commit (probe-verified 2026-07-16; A2's anchor is the 5-line block because the
 * one-line guard exists twice — the sequential twin at :935). `fails` are the
 * verbatim pytest node ids the prereg recorded; the live sanity close must
 * reproduce this exact set or the battery STOPS (drift rule).
 * @type {ReadonlyArray<{id: string, file: string, line: number, before: string, after: string, fails: readonly string[], culprit: string}>}
 */
const PLANTS = Object.freeze([
  {
    id: 'A1', file: 'packages/soar/src/aurora_soar/discovery_adapter.py', line: 89,
    before: '        name=discovery_agent.role,',
    after: '        name=discovery_agent.id,',
    fails: Object.freeze([
      'packages/soar/tests/test_agent_registry_deprecation.py::TestAgentRegistryDeprecation::test_registry_and_discovery_equivalent_results',
    ]),
    culprit: 'packages/soar/src/aurora_soar/discovery_adapter.py',
  },
  {
    id: 'A2', file: 'packages/soar/src/aurora_soar/phases/collect.py', line: 634,
    before: '        agent = agent_map[idx]\n\n        duration_ms = int((time.time() - start_time) * 1000)\n\n        if spawn_result.success:',
    after: '        agent = agent_map[idx]\n\n        duration_ms = int((time.time() - start_time) * 1000)\n\n        if spawn_result is not None:',
    fails: Object.freeze([
      'packages/cli/tests/test_commands/test_soar_parallel.py::TestSoarParallelResearch::test_parallel_execution_handles_failures_gracefully',
    ]),
    culprit: 'packages/soar/src/aurora_soar/phases/collect.py',
  },
  {
    id: 'A3', file: 'packages/cli/src/aurora_cli/planning/core.py', line: 600,
    before: '    if plan.status == PlanStatus.ARCHIVED:',
    after: '    if plan.status == PlanStatus.ARCHIVED and _force:',
    fails: Object.freeze([
      'packages/cli/tests/unit/test_plan_commands.py::TestArchivePlan::test_archive_already_archived',
    ]),
    culprit: 'packages/cli/src/aurora_cli/planning/core.py',
  },
  {
    id: 'A4', file: 'packages/cli/src/aurora_cli/planning/core.py', line: 497,
    before: '            if other_matches:',
    after: '            if not other_matches:',
    fails: Object.freeze([
      'packages/cli/tests/unit/test_plan_commands.py::TestShowPlan::test_show_plan_not_found',
      'packages/cli/tests/unit/test_plan_commands.py::TestShowPlan::test_show_wrong_location_hint',
    ]),
    culprit: 'packages/cli/src/aurora_cli/planning/core.py',
  },
]);

// ---- argv (mirrors run-battery.mjs) ---------------------------------------
const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};
const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);

const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-fix.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const shellCapUsd = spec.budgetUsd; // ONE number the human signs
const dry = has('dry');

// --only A2 / --only A1,A3: rerun a subset after a STOP; the frozen order holds
const only = arg('only');
const wanted = only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
if (wanted) {
  const known = new Set(PLANTS.map((p) => p.id));
  const bad = [...wanted].filter((id) => !known.has(id));
  if (bad.length) {
    console.error(`unknown plant id(s): ${bad.join(', ')} — known: ${PLANTS.map((p) => p.id).join(', ')}`);
    process.exit(2);
  }
}
const roster = PLANTS.filter((p) => !wanted || wanted.has(p.id));

// human-signs-always: no hash, no run — zero tokens. Unapproved prints the
// battery plan so the human signs knowing exactly what the hash buys: 4 runs.
const approved = arg('approve');
if (approved !== specHash) {
  console.log(`job:       ${spec.job} — ${spec.description.slice(0, 80)}…`);
  console.log(`spec:      jobs/aurora-fix.json   budget $${spec.budgetUsd}/plant, ${PLANTS.length} plants, battery hard-stop $${BATTERY_CAP_USD}`);
  console.log(`patient:   ${WORKDIR} @ ${COMMIT}`);
  console.log(`specHash:  ${specHash}   (ONE signature covers the whole battery)`);
  console.log('\nplan (frozen order):');
  for (const p of roster) console.log(`  ${p.id}  ${p.file}:${p.line}  [${p.fails.length} expected fail(s)]`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-battery-aurora.mjs --approve ${specHash}`);
  process.exit(approved === null ? 0 : 1);
}
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];

// provider: SHELL-owned binding; --dry throws on ANY call — a loud failure,
// never a silent spend
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!dry && !apiKey) {
  console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
  process.exit(2);
}
const provider = dry
  ? { async generate() { throw new Error('DRY RUN: the provider was called — this run was supposed to spend nothing'); } }
  : new AnthropicProvider({ apiKey, model: MODEL });

const wd = resolve(WORKDIR);
// spine + audit archive + the close wrapper live OUTSIDE the tree (F14)
const spineDir = join(wd, '..', `${wd.split('/').at(-1)}-bareloop`);
mkdirSync(spineDir, { recursive: true });
const closeSh = join(spineDir, 'close.sh');
if (!existsSync(closeSh)) {
  console.error(`close wrapper missing: ${closeSh} — the arbiter's close must exist before anything runs`);
  process.exit(2);
}
const runid = Date.now().toString(36);

const git = (/** @type {string[]} */ args) => execFileSync('git', ['-C', wd, ...args], { encoding: 'utf8' }).trim();

/** archive the patient's gate audit out of the tree (the arbiter's books are
 *  never destroyed — a leftover from a prior run is moved aside, not cleaned) */
function archiveAudit(/** @type {string} */ dest) {
  const src = join(wd, 'gate-audit.jsonl');
  if (!existsSync(src)) return null;
  renameSync(src, dest);
  return dest;
}

/** reset the patient to the frozen commit: tracked files forced back, untracked
 *  non-ignored removed (.venv/.smoke survive — ignored AND excluded; never
 *  re-clone, never reinstall the venv). Then the frozen fresh-index rule:
 *  .litectx is DELETED so runJob's own index() rebuilds from nothing — the
 *  written-memory store starts empty every run (row independence; F35: this is
 *  a ranking no-op, the store wipe is the point). */
function resetPatient() {
  // any stray gate audit is evidence, not litter — archive before clean eats it
  const stray = archiveAudit(join(spineDir, `battery-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
  if (stray) console.log(`  reset   archived stray gate audit → ${stray}`);
  git(['checkout', '--force', '--quiet', COMMIT]);
  const head = git(['rev-parse', 'HEAD']);
  if (head !== COMMIT) throw new Error(`reset failed: HEAD ${head} != frozen ${COMMIT}`);
  git(['clean', '-fdq', '-e', '.venv', '-e', '.smoke', '-e', '.litectx']);
  rmSync(join(wd, '.litectx'), { recursive: true, force: true }); // frozen rule: fresh index per run
  const status = git(['status', '--porcelain']);
  if (status !== '') throw new Error(`reset left the tree dirty:\n${status}`);
}

/** apply ONE plant. Exactly-once match against the frozen anchor or the battery
 *  ABORTS — a site that moved is drift, never something to fix here. */
function applyPlant(/** @type {(typeof PLANTS)[number]} */ p) {
  const path = join(wd, p.file);
  const src = readFileSync(path, 'utf8');
  const n = src.split(p.before).length - 1;
  if (n !== 1) throw new Error(`DRIFT: ${p.id} anchor found ${n} time(s) in ${p.file} (expected exactly 1) — STOP, investigate against the prereg`);
  writeFileSync(path, src.replace(p.before, p.after));
}

/** run the patient's close ONCE, directly — the sanity instrument (token-free).
 *  pytest exits non-zero on red: a red suite is a normal RETURN, not a throw.
 *  Failing tests are read off pytest's short-summary `FAILED <nodeid> - …` lines.
 *  A kill at the clock is its OWN state (timedOut), never conflated with a
 *  drifted failing set — a killed close renders no summary, so `0 FAILED`
 *  under a timeout is the instrument dying, not the plant changing (the first
 *  battery launch mislabeled exactly this as sanity-drift). */
function sanityClose() {
  let out, status, timedOut = false;
  try {
    out = execFileSync(closeSh, [], { cwd: wd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: CLOSE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    status = 0;
  } catch (e) {
    const err = /** @type {any} */ (e);
    timedOut = err.status == null && err.signal != null; // killed by the clock, never exited
    status = err.status ?? 1;
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  const fails = [...out.matchAll(/^FAILED (\S+)/gm)].map((m) => m[1]);
  return { status, fails, timedOut };
}

/** compare the live failing set to the prereg's recorded set — order-free, exact */
function failsMatch(/** @type {string[]} */ live, /** @type {readonly string[]} */ expected) {
  const got = new Set(live);
  const missing = expected.filter((t) => !got.has(t));
  const extra = live.filter((t) => !expected.includes(t));
  return { ok: live.length === expected.length && !missing.length && !extra.length, missing, extra };
}

/** read one plant's row fields off its spine + archived audit — data, never prose.
 *  writes counts BOTH write-class verbs (F33's blind-collector lesson);
 *  culpritRead sees every read-class channel: gated read, ctx_get, recall paths. */
function readRow(/** @type {string} */ spineFile, /** @type {string|null} */ auditFile, /** @type {(typeof PLANTS)[number]} */ p, /** @type {string} */ outcome) {
  const raw = readFileSync(spineFile, 'utf8');
  const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spentUsd = events.findLast((e) => e.type === 'job-end')?.spentUsd ?? null; // honest null, never 0 (F6)
  const rounds = events.filter((e) => e.type === 'worker-round').length;
  const runEnd = events.findLast((e) => e.type === 'run-end');
  const attemptsToGreen = runEnd?.outcome === 'green' ? runEnd.iterations : null;
  const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);
  let writes = null, culpritRead = null;
  if (auditFile) {
    const audit = readFileSync(auditFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    writes = audit.filter((a) => (a.action?.type === 'write' || a.action?.type === 'edit') && a.phase === 'gate' && a.decision === 'allow').length;
    culpritRead = audit.some((a) => a.action?.type === 'read' && a.action?.path === join(wd, p.culprit))
      || events.some((e) => e.type === 'ctx-tool' && e.tool === 'ctx_get' && e.path === p.culprit)
      || events.some((e) => e.type === 'ctx-tool' && e.tool === 'ctx_recall' && (e.paths ?? []).includes(p.culprit))
      || events.some((e) => e.type === 'hook-op' && e.op === 'recall' && (e.paths ?? []).includes(p.culprit));
  }
  return { plant: p.id, outcome, attemptsToGreen, writes, culpritRead, rounds, spentUsd, secretsClean: leaks.length === 0, spine: spineFile, audit: auditFile };
}

// ---- the battery ----------------------------------------------------------
console.log(`spec ${specHash} approved by ${approvals[0].signer}`);
console.log(`patient ${wd} @ ${COMMIT}${dry ? '   [DRY: provider throws if called]' : `   model ${MODEL}`}`);
console.log(`caps    $${shellCapUsd}/plant (== approved budget), $${BATTERY_CAP_USD} battery hard-stop, close clock ${CLOSE_TIMEOUT_MS / 60000}min`);
console.log(`plants  ${roster.map((p) => p.id).join(' → ')}   runid ${runid}\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null; // a STOP is a result — recorded, reported, never papered over

for (const p of roster) {
  if (cumulativeUsd >= BATTERY_CAP_USD) {
    stop = `battery cap: cumulative spend $${cumulativeUsd.toFixed(4)} >= $${BATTERY_CAP_USD} before ${p.id}`;
    break;
  }
  console.log(`\n== ${p.id}  ${p.file}:${p.line} ==`);

  // 1. reset to the frozen commit + wipe the index (fresh per run, frozen rule)
  resetPatient();
  console.log(`  reset   clean at ${COMMIT.slice(0, 12)}, .litectx wiped`);

  // 2. plant the one anchored edit (exactly-once or ABORT)
  try {
    applyPlant(p);
  } catch (e) {
    stop = String(/** @type {Error} */ (e).message);
    rows.push({ plant: p.id, outcome: 'plant-drift', detail: stop });
    break;
  }
  console.log(`  plant   ${p.file}:${p.line} applied`);

  // 3. sanity: the close, once, directly — drift in the failing set is a STOP
  console.log('  sanity  close.sh (~4.5min)…');
  const t0 = Date.now();
  const s = sanityClose();
  const m = failsMatch(s.fails, p.fails);
  console.log(`  sanity  exit ${s.status}${s.timedOut ? ' (KILLED at the clock)' : ''}, ${s.fails.length} FAILED (prereg: ${p.fails.length}) in ${((Date.now() - t0) / 60000).toFixed(1)}min — ${s.timedOut ? 'TIMEOUT' : m.ok ? 'MATCH' : 'DRIFT'}`);
  if (s.timedOut) {
    stop = `${p.id} sanity timeout: the close exceeded ${CLOSE_TIMEOUT_MS / 60000}min and was killed — the instrument rendered no verdict (not a drift)`;
    rows.push({ plant: p.id, outcome: 'sanity-timeout', liveFails: s.fails });
    break; // same frozen rule as drift: investigate before spending more
  }
  if (s.status === 0 || !m.ok) {
    stop = `${p.id} sanity drift: live failing set differs from the prereg`;
    rows.push({ plant: p.id, outcome: 'sanity-drift', liveFails: s.fails, missing: m.missing, extra: m.extra });
    break; // frozen reading rule: investigate drift before spending more
  }

  // 4. the run — the signed spec, the shell cap, the frozen close clock, a per-plant spine
  const spineFile = join(spineDir, `battery-${p.id}-${runid}.jsonl`);
  const outcome = await runJob(spec, { approvals, workdir: wd, provider, emit: makeSpine(spineFile), shellCapUsd, closeTimeoutMs: CLOSE_TIMEOUT_MS });

  // 5. archive the gate audit next to the spine BEFORE the next reset
  const audit = archiveAudit(join(spineDir, `battery-${p.id}-${runid}-gate-audit.jsonl`));
  if (!audit) console.log('  audit   none produced (no worker rounds ran)');

  // 6. the row, read off the instruments
  const row = readRow(spineFile, audit, p, outcome);
  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  console.log(`  row     outcome=${row.outcome} attempts=${row.attemptsToGreen ?? '-'} writes=${row.writes ?? '-'} culpritRead=${row.culpritRead ?? '-'} rounds=${row.rounds} spent=${row.spentUsd == null ? 'UNKNOWN' : `$${row.spentUsd.toFixed(4)}`}`);
  if (!row.secretsClean) {
    stop = `${p.id}: SPINE LEAK — the hard line is broken`;
    break;
  }
  // unpriced is never free (F6): a real run whose spend is unknown cannot be
  // summed against the battery cap — the cap cannot govern spend it cannot see
  if (!dry && row.spentUsd == null) {
    stop = `${p.id}: spend unknown (${row.outcome}) — the $${BATTERY_CAP_USD} cap cannot govern unpriced spend`;
    break;
  }
}

// leave the patient clean at the frozen commit, whatever happened above
resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)}`);

// ---- the result: a table and a JSON file, no claims in prose ---------------
const results = {
  runid, specHash, commit: COMMIT, dry, model: dry ? null : MODEL,
  batteryCapUsd: BATTERY_CAP_USD, closeTimeoutMs: CLOSE_TIMEOUT_MS, cumulativeUsd, stop, rows,
};
const resultsFile = join(spineDir, `battery-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nplant  outcome        attempts  writes  culpritRead  rounds  spent');
for (const r of rows) {
  console.log(`${r.plant.padEnd(6)} ${String(r.outcome).padEnd(14)} ${String(r.attemptsToGreen ?? '-').padEnd(9)} ${String(r.writes ?? '-').padEnd(7)} ${String(r.culpritRead ?? '-').padEnd(12)} ${String(r.rounds ?? '-').padEnd(7)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\ncumulative: $${cumulativeUsd.toFixed(4)} of $${BATTERY_CAP_USD} battery cap`);
if (stop) console.log(`STOP: ${stop}   (a stop is a result — rows above stand)`);
console.log(`results:    ${resultsFile}`);
process.exit(rows.some((r) => r.secretsClean === false) ? 1 : 0);
