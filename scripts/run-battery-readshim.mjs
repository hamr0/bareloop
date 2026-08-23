// READ SHIM — PHASE 2 BATTERY. 4 arms x n=3 = 12 rows on the aurora patient.
//
// The frozen design is docs/03-logs/experiments/2026-08-18-readshim-phase2-prereg.md
// and it is AUTHORITATIVE. Nothing here loosens it. The claim under test is the SECOND
// half of the shim's sentence — cost is already measured at $0 over 1,844 archived
// reads; what is unmeasured is whether a CAPPED worker still greens.
//
//   PRIMARY   median spend per run, per arm
//   VETO      green rate must not drop. Cost is the headline ONLY if greens hold.
//   SECONDARY ctx_recall/ctx_get share of tool calls — did the steer actually steer
//   DISCARD   provider-red rows are casualties, never evidence
//
// A2/A3 COST IS DECLARED UNRESOLVED AT n=3 IN ADVANCE. The readout says so verbatim,
// unconditionally, every time.
//
// ── WHY THIS DRIVER SPAWNS `run-u.mjs` RATHER THAN CALLING runJob ──────────
// Every prior battery in this repo imported `runJob` and rebuilt the run around it,
// and each one then had to re-grow the guards `run-u.mjs` already carries: the
// approval gate, the cold reset, the outside watchdog, the wall arithmetic, the
// resume reader, the lag sampler. A second copy of any of those is a second thing
// that can be wrong, and the row it is wrong on is a paid one. So a battery row IS a
// `run-u.mjs` invocation — one code path between a manual run and a battery row, and
// the only thing this file adds is the arm, the order, the ledger and the ceiling.
//
//   node scripts/run-battery-readshim.mjs --dry-run    # ZERO provider calls, $0
//   ANTHROPIC_API_KEY=... node scripts/run-battery-readshim.mjs --approve <hash>
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, openSync, closeSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobSpecHash } from '../src/job.js';
import { closeStagesOf } from '../src/plan.js';
import { readShimArm } from '../src/readshim.js';
import { coldReset } from './u-patient.mjs';
import {
  ARMS, ARM_CLI, rowPlan, ceilingGate, readSpend, readToolShare, armStats, isCasualty, rowSettled,
  ACCOUNTED_ROUND_TYPES, ECHO_ROUND_TYPES, UNRESOLVED_NOTICE, isSpineFile,
} from './readshim-battery.mjs';

// ── FROZEN PARAMETERS ──────────────────────────────────────────────────────
/** the `run-u.mjs` job key — the RUNNER's half (patient, seed, spine dir) */
const JOB_KEY = 'aurora-spawner';
const SPEC_FILE = 'aurora-u-spawner-types.json';
/** hamr-approved, this spec version. A spec that drifted mid-battery invalidates every
 * row that already ran, because rows filed together would have been run against
 * different closes/budgets — so this is a REFUSAL, not a warning. */
const EXPECTED_HASH = 'c395b716b7afdbe8e3b637fb46eb394773332a367dd30e47f9ee7fc3aecd56a3';
const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u';
const SPINE_DIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u-bareloop';
const SEED = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18';
/** hamr, in-turn: "all" four arms, ceiling quoted at $60 and not contradicted. Prior
 * spend folds in; NEVER widened. */
const CEILING_USD = 60;
const N_PER_ARM = 3;
/** the same per-invocation close bound `run-u.mjs` uses — this driver only needs it to
 * size how long a legal row may be silent before it is a dead row. */
const CLOSE_TIMEOUT_MS = 900_000;
/** how long after the run's own outside deadline this driver waits before calling the
 * row dead. The watchdog owns the KILL; this is only the driver's patience, and it is
 * deliberately LATER than the watchdog's so a row is declared dead by the guard that
 * can write a report rather than by the poller that cannot. */
const DRIVER_GRACE_MS = 900_000;
const POLL_MS = 5_000;

const has = (/** @type {string} */ n) => process.argv.includes(`--${n}`);
const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };

const DRY = has('dry-run');
const PRIOR_USD = Math.max(0, Number(arg('prior-usd') ?? 0));
if (!Number.isFinite(PRIOR_USD)) die('--prior-usd must be a number (it folds into the ceiling; an unreadable one would widen it)');
/** run only the first N rows of the plan this invocation (a battery split across
 * sessions folds its prior spend back in with --prior-usd) */
const LIMIT = arg('rows') === null ? Number.MAX_SAFE_INTEGER : Number(arg('rows'));
if (!Number.isFinite(LIMIT) || LIMIT < 1) die('--rows must be a positive number (a NaN here would slice the plan to nothing and report a battery that never ran)');

// ── the spec, and the refusal ──────────────────────────────────────────────
const specPath = fileURLToPath(new URL(`../jobs/${SPEC_FILE}`, import.meta.url));
if (!existsSync(specPath)) die(`no spec at ${specPath}`);
let spec;
try { spec = JSON.parse(readFileSync(specPath, 'utf8')); } catch (e) { die(`${specPath} is not readable JSON (${e.message})`); }
const specHash = jobSpecHash(spec);
if (specHash !== EXPECTED_HASH) {
  die(`SPEC DRIFT — jobs/${SPEC_FILE} now hashes ${specHash}\n`
    + `                    the battery is frozen against ${EXPECTED_HASH}\n`
    + '  REFUSING. Rows run against two spec versions are not one battery: they would share a results\n'
    + '  file while having been judged by different closes, budgets or walls. Either restore the spec, or\n'
    + '  re-freeze the experiment against the new hash with hamr\'s signature — never file them together.');
}
const ROW_BUDGET_USD = spec.budgetUsd;
const WALL_MS = typeof spec.maxWallMs === 'number' && Number.isFinite(spec.maxWallMs) ? spec.maxWallMs : null;
const CLOSE_STAGES = closeStagesOf(spec)?.length || 1;
/** the run's own outside deadline (run-u arms the watchdog at exactly this), plus this
 * driver's grace. A row still alive past it is dead as far as the battery is concerned. */
const ROW_DEADLINE_MS = (WALL_MS ?? 0) + CLOSE_STAGES * CLOSE_TIMEOUT_MS + DRIVER_GRACE_MS;

const PLAN = rowPlan(ARMS, N_PER_ARM);
const RESULTS_FILE = arg('results') ?? join(SPINE_DIR, `readshim-battery-${Date.now().toString(36)}.json`);

// ── header ─────────────────────────────────────────────────────────────────
const banner = () => {
  console.log('READ SHIM — PHASE 2 BATTERY (prereg 2026-08-18, FROZEN)');
  console.log(`  spec      jobs/${SPEC_FILE}  $${ROW_BUDGET_USD}/row  wall ${WALL_MS === null ? 'UNBOUNDED' : `${WALL_MS / 60000}min`}  close ${CLOSE_STAGES} stage(s)`);
  console.log(`  hash      ${specHash}  ${specHash === EXPECTED_HASH ? '== frozen' : 'DRIFTED'}`);
  console.log(`  patient   ${WORKDIR} @ ${SEED.slice(0, 12)}  (a COPY — never the original)`);
  console.log(`  spine     ${SPINE_DIR}`);
  console.log(`  ceiling   $${CEILING_USD} hard, prior $${PRIOR_USD.toFixed(2)} folded in, never widened`);
  console.log(`  rows      ${PLAN.length} (${ARMS.length} arms x n=${N_PER_ARM}), interleaved`);
  console.log('  arms:');
  for (const a of ARMS) {
    const lv = readShimArm(/** @type {any} */ (a.flag));
    console.log(`    ${a.name}  readShim=${JSON.stringify(a.flag).padEnd(7)} cap=${String(lv.cap).padEnd(5)} pointer=${String(lv.pointer).padEnd(5)} diff=${String(lv.diff).padEnd(5)} g1=${String(lv.g1).padEnd(5)} — ${a.label}`);
  }
};

// ── readers over a run's own artifacts ─────────────────────────────────────
/** @param {string} f */
const readJsonl = (f) => {
  if (!existsSync(f)) return null;
  /** @type {any[]} */
  const out = [];
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    try { out.push(JSON.parse(l)); } catch {
      // a kill can land mid-append, so a broken LAST line is the shape being modelled.
      // Anywhere else it is a corrupt log and the row is unreadable, never guessed at.
      if (i < lines.length - 2) out.push({ __corrupt: true, line: i + 1 });
    }
  });
  return out;
};

/** every number one row contributes, read off that row's OWN artifacts */
const readRow = (/** @type {string} */ spineFile) => {
  const events = readJsonl(spineFile);
  if (events === null) return { outcome: /** @type {string|null} */ ('no-spine'), spendUsd: 0, spendComplete: true, share: null, detail: 'no spine file' };
  const corrupt = events.filter((e) => e.__corrupt).length;
  const spend = readSpend(events.filter((e) => !e.__corrupt));
  const runid = /u-([^/]+)\.jsonl$/.exec(spineFile)?.[1] ?? null;
  const auditFile = runid ? join(SPINE_DIR, `u-${runid}-gate-audit.jsonl`) : null;
  const audit = auditFile ? readJsonl(auditFile) : null;
  const tools = audit ? readToolShare(audit.filter((e) => !e.__corrupt)) : null;
  return {
    ...spend,
    outcome: spend.outcome ?? 'no-job-end',
    share: tools?.share ?? null,
    tools,
    corruptLines: corrupt,
    // A dropped record is a record NOBODY READ, and one of them may have carried money.
    // Counting the count and then reporting the row's spend as exact would be the same
    // launder `unpricedRounds` refuses: the row's spend is a FLOOR whenever a line of
    // its own spine was unreadable, and the readout prints the count beside it.
    spendComplete: spend.spendComplete && corrupt === 0,
    spineFile,
    runid,
  };
};

// ── launching one row ──────────────────────────────────────────────────────
/**
 * ONE row = one `run-u.mjs`, under `systemd-inhibit` and session-detached.
 *
 *  - `systemd-inhibit`: the machine idle-suspends in ~12min, and a suspend freezes
 *    EVERYTHING including the outside watchdog (F72). An unsinhibited row is a row
 *    whose guard is asleep.
 *  - `detached: true` puts the child in its OWN session (Node calls setsid). A harness
 *    task-stop group-kills this driver's group; the run survives it, and its watchdog
 *    survives with it, so the death of the battery still leaves a report.
 *  - The API key rides the child's ENVIRONMENT, never argv — a cmdline is world
 *    readable through /proc, and a key that reaches one has leaked.
 *  - The cold reset is `run-u.mjs`'s own (`coldReset`, shared): seed + `.litectx`
 *    removed. This driver does not touch the patient before launching.
 */
const launchRow = (/** @type {{arm: string, row: number}} */ row, /** @type {string} */ logFile) => {
  const argv = [
    fileURLToPath(new URL('./run-u.mjs', import.meta.url)),
    '--job', JOB_KEY,
    '--read-shim', ARM_CLI[/** @type {keyof typeof ARM_CLI} */ (row.arm)],
    '--approve', specHash,
  ];
  const fd = openSync(logFile, 'a');
  const child = spawn('systemd-inhibit', [
    '--what=idle:sleep', `--why=bareloop readshim battery row ${row.row} (${row.arm})`,
    process.execPath, ...argv,
  ], { detached: true, stdio: ['ignore', fd, fd], env: process.env });
  closeSync(fd);
  // an unhandled 'error' on a ChildProcess is an UNCAUGHT EXCEPTION — a battery that
  // could not spawn one row would die on the spot and lose every row it had already
  // paid for. It becomes a launch-failed casualty instead, through the exit path.
  child.on('error', (/** @type {Error} */ e) => { console.error(`   spawn failed: ${e.message}`); });
  return child;
};

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** poll the SPINE for `job-end` — never `pgrep -f`, which matches the poller's own
 * command line and never exits (a rule this programme paid for). */
const awaitRow = async (/** @type {any} */ child, /** @type {Set<string>} */ before, /** @type {number} */ startedAt) => {
  /** @type {string|null} */
  let spineFile = null;
  let exited = /** @type {{code: number|null, signal: string|null, error?: string}|null} */ (null);
  child.on('exit', (/** @type {number|null} */ code, /** @type {string|null} */ signal) => { exited ??= { code, signal }; });
  // ENOENT (no `systemd-inhibit` on this machine) emits 'error' and may never emit
  // 'exit' — without this the poller would sit out the full 120min row deadline on a
  // row that never started. 'close' is the belt: it fires on every completed spawn.
  child.on('error', (/** @type {Error} */ e) => { exited ??= { code: null, signal: null, error: e.message }; });
  child.on('close', (/** @type {number|null} */ code, /** @type {string|null} */ signal) => { exited ??= { code, signal }; });
  for (;;) {
    if (spineFile === null) {
      const now = readdirSync(SPINE_DIR).filter(isSpineFile);
      const fresh = now.filter((f) => !before.has(f));
      if (fresh.length === 1) spineFile = join(SPINE_DIR, fresh[0]);
      else if (fresh.length > 1) return { spineFile: null, stop: 'no-spine', detail: `${fresh.length} new spines appeared — this driver cannot tell which is the row's (another run is writing here)` };
    }
    if (spineFile !== null) {
      const raw = readFileSync(spineFile, 'utf8');
      if (raw.includes('"job-end"')) {
        // the close's own files land in the same tick; one more poll makes the audit whole
        await sleep(POLL_MS);
        return { spineFile, stop: 'job-end', detail: null };
      }
    }
    if (exited !== null) {
      // the child is gone. If it left a job-end we already returned above, so this is a
      // death: a refusal before the run (exit 2), a kill, or a crash.
      await sleep(POLL_MS);
      if (spineFile !== null && readFileSync(spineFile, 'utf8').includes('"job-end"')) return { spineFile, stop: 'job-end', detail: null };
      return { spineFile, stop: spineFile === null ? 'launch-failed' : 'no-job-end', detail: exited.error ? `child could not start: ${exited.error}` : `child exited code=${exited.code} signal=${exited.signal}` };
    }
    if (Date.now() - startedAt > ROW_DEADLINE_MS) {
      return { spineFile, stop: 'driver-timeout', detail: `past the run's own outside deadline (${Math.round(ROW_DEADLINE_MS / 60000)}min) with no job-end` };
    }
    await sleep(POLL_MS);
  }
};

// ── the readout ────────────────────────────────────────────────────────────
const pct = (/** @type {number|null} */ v) => (v === null ? 'unknown' : `${(v * 100).toFixed(1)}%`);
const usd = (/** @type {number|null} */ v, /** @type {boolean} */ complete = true) => (v === null ? 'unknown' : `${complete ? '' : '>='}$${v.toFixed(4)}`);

const readout = (/** @type {any[]} */ rows) => {
  console.log(`\n${'='.repeat(78)}`);
  console.log('READ SHIM PHASE 2 — READOUT');
  console.log('='.repeat(78));
  console.log(`\n${UNRESOLVED_NOTICE}\n`);
  console.log('-'.repeat(78));

  const stats = armStats(rows, ARMS);
  const a0 = stats.find((s) => s.arm === 'A0');
  console.log('\nPER ARM  (casualties EXCLUDED from every number below)\n');
  console.log('  arm  n  green      median spend   vs A0        ctx share   casualties');
  for (const s of stats) {
    const rel = (a0 && a0.medianUsd && s.medianUsd !== null)
      ? `${(((s.medianUsd - a0.medianUsd) / a0.medianUsd) * 100).toFixed(1)}%`.padStart(9)
      : '     n/a ';
    console.log(`  ${s.arm}   ${String(s.n).padEnd(2)} ${`${s.greens}/${s.n}`.padEnd(5)} ${pct(s.greenRate).padStart(7)}  ${usd(s.medianUsd, s.spendComplete).padStart(11)}  ${rel}  ${pct(s.medianShare).padStart(8)}   ${s.casualties}${s.casualties ? ` (${s.casualtyOutcomes.join(', ')})` : ''}`);
  }

  console.log('\nTHE VETO — green rate is the gate; cost is the headline ONLY if greens hold.');
  if (a0 && a0.greenRate !== null) {
    console.log(`  baseline A0 green rate: ${pct(a0.greenRate)} (${a0.greens}/${a0.n})`);
    let below = 0;
    for (const s of stats) {
      if (s.arm === 'A0') continue;
      if (s.greenRate === null) { console.log(`  ${s.arm}: green rate UNKNOWN (${s.n} valid rows) — this arm is unread, not passed.`); continue; }
      if (s.greenRate < a0.greenRate) { below += 1; console.log(`  ${s.arm}: green rate ${pct(s.greenRate)} BELOW baseline ${pct(a0.greenRate)} — REJECTED. A cheaper arm that greens less is not a tradeoff to be argued.`); }
      else console.log(`  ${s.arm}: green rate ${pct(s.greenRate)} holds against baseline ${pct(a0.greenRate)}.`);
    }
    if (below === 0) console.log('  no arm fell below the baseline green rate — the veto did not fire.');
  } else {
    console.log('  baseline green rate UNKNOWN (no valid A0 rows) — NOTHING here is readable as a cost result.');
  }
  // an arm short of its pre-registered n is UNDERPOWERED, and saying so is not optional:
  // n=1 on a nondeterministic worker is an anecdote, and so is a green (standing doctrine).
  const short = stats.filter((s) => s.n < N_PER_ARM);
  if (short.length) console.log(`  UNDERPOWERED: ${short.map((s) => `${s.arm} n=${s.n}`).join(', ')} — short of the pre-registered n=${N_PER_ARM}. These arms are incomplete, not results.`);
  console.log('  A2/A3 cost: UNRESOLVED (see the notice above). Their readable axes are capability and safety.');

  console.log('\nPER ROW\n');
  console.log('  #   arm  outcome           spend       rounds  ctx share  runid        note');
  for (const r of rows) {
    console.log(`  ${String(r.row).padEnd(3)} ${r.arm}   ${String(r.outcome ?? '-').padEnd(17)} ${usd(r.spendUsd ?? null, r.spendComplete !== false).padStart(10)}  ${String(r.accountedRounds ?? '-').padStart(6)}  ${pct(r.share ?? null).padStart(9)}  ${String(r.runid ?? '-').padEnd(12)} ${isCasualty(r.outcome) ? 'CASUALTY — excluded' : ''}${r.detail ? ` ${r.detail}` : ''}`);
  }

  // the F45 guard, printed whether or not it fired
  console.log('\nSPEND ACCOUNTING AUDIT');
  console.log(`  accounted record types : ${ACCOUNTED_ROUND_TYPES.join(', ')}  (src/run.js's own ledger)`);
  console.log(`  excluded as echoes     : ${ECHO_ROUND_TYPES.join(', ')}  (attempt TOTALS of the rounds above — summing them double-counts the run)`);
  const echoSeen = rows.flatMap((r) => Object.entries(r.echoes ?? {}));
  console.log(`  echo records seen      : ${echoSeen.length === 0 ? 'none' : echoSeen.map(([t, n]) => `${t} x${n}`).join(', ')}`);
  const unacc = rows.flatMap((r) => (r.unaccounted ?? []).map((u) => `${u.type} x${u.count} $${u.sumUsd.toFixed(4)} (row ${r.row})`));
  if (unacc.length === 0) {
    console.log('  UNACCOUNTED writers    : none — no record outside the accounted set carried a non-zero costUsd.');
  } else {
    console.log('  UNACCOUNTED WRITERS    : *** a record type carrying money that the library ledger does not sum ***');
    for (const u of unacc) console.log(`      ${u}`);
    console.log('    Counted into the rows above so the ceiling cannot under-read. This is the F45 class and it needs a decision.');
  }
  const div = rows.filter((r) => typeof r.divergenceUsd === 'number' && Math.abs(r.divergenceUsd) > 0.000001);
  console.log(`  reader vs job-end      : ${div.length === 0 ? 'agree on every row' : `DIVERGE on ${div.length} row(s): ${div.map((r) => `row ${r.row} ${r.divergenceUsd > 0 ? '+' : ''}$${r.divergenceUsd.toFixed(6)}`).join(', ')}`}`);
  const floors = rows.filter((r) => r.spendComplete === false);
  if (floors.length) console.log(`  spend FLOORS (F6)      : ${floors.length} row(s) reported spendComplete:false — their spend is >=, never exact.`);
  // a line of a row's own spine that could not be parsed is a record NOBODY READ — it is
  // named here, because a silently dropped record is the F45 class arriving through the
  // reader's own front door rather than through an unaccounted type.
  const torn = rows.filter((r) => (r.corruptLines ?? 0) > 0);
  if (torn.length) console.log(`  UNREADABLE spine lines : ${torn.map((r) => `row ${r.row} x${r.corruptLines}`).join(', ')} — those records were dropped, so these rows' spend is a FLOOR.`);
  const unpriced = rows.filter((r) => (r.unpricedRounds ?? 0) > 0);
  if (unpriced.length) console.log(`  UNPRICED rounds        : ${unpriced.map((r) => `row ${r.row} x${r.unpricedRounds}`).join(', ')} — unpriced is never free (F6).`);

  const total = rows.reduce((a, r) => a + (r.spendUsd ?? 0), 0);
  console.log(`\nSPEND  battery $${total.toFixed(4)} + prior $${PRIOR_USD.toFixed(2)} = $${(total + PRIOR_USD).toFixed(4)} of the $${CEILING_USD} ceiling`);
};

// ── DRY RUN ────────────────────────────────────────────────────────────────
//
// Exercises EVERYTHING except the provider. Zero API calls, $0. It is the artifact the
// orchestrating session inspects before a dollar is spent, so it must not be a
// narration of what the driver intends — every reader below runs against the REAL
// archived artifacts on this machine, and the cold reset it prints is a reset that
// actually happened.
const dryRun = () => {
  banner();

  console.log('\n== DRY RUN — ZERO provider calls, $0. Everything below actually ran. ==');

  // 1. the run order
  console.log('\n[1] ROW PLAN — interleaved (A0,A1,A2,A3,A0,...), never blocked by arm:');
  console.log(`    ${PLAN.map((r) => r.arm).join(' ')}`);
  const blocked = PLAN.some((r, i) => i > 0 && PLAN[i - 1].arm === r.arm);
  console.log(`    adjacent same-arm rows: ${blocked ? 'PRESENT — the order is BLOCKED, provider drift would confound the treatment' : 'none — provider drift spreads across all four arms'}`);

  // 2. the arms resolve, through the LIBRARY's resolver
  console.log('\n[2] ARM RESOLUTION — every arm through src/readshim.js readShimArm():');
  for (const a of ARMS) console.log(`    ${a.name} -> ${JSON.stringify(a.flag)} -> ${JSON.stringify(readShimArm(/** @type {any} */ (a.flag)))}`);
  try { readShimArm(/** @type {any} */ ('Cap')); console.log('    GUARD FAILED — a bad arm did not throw'); }
  catch (e) { console.log(`    guard: readShimArm('Cap') throws -> ${e.message.slice(0, 90)}`); }

  // 3. the child command line, verbatim (and the key's absence from it)
  console.log('\n[3] ROW COMMAND (row 1) — exactly what would be spawned:');
  console.log(`    systemd-inhibit --what=idle:sleep --why="bareloop readshim battery row 1 (A0)" \\`);
  console.log(`      ${process.execPath} scripts/run-u.mjs --job ${JOB_KEY} --read-shim A0 --approve ${specHash}`);
  console.log('    detached: true (own session — a harness task-stop cannot group-kill the run)');
  console.log(`    ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'present in env' : 'NOT SET (the real run would refuse)'} — passed via the child ENVIRONMENT, never argv`);

  // 4. the cold reset, actually performed
  console.log('\n[4] COLD PATIENT — `coldReset` (scripts/u-patient.mjs), the SAME function run-u.mjs calls:');
  if (!existsSync(join(WORKDIR, '.git'))) {
    console.log(`    SKIPPED — ${WORKDIR} is not a git repo on this machine. THE BATTERY CANNOT RUN until it is.`);
  } else {
    const storeBefore = existsSync(join(WORKDIR, '.litectx'));
    const cold = coldReset(WORKDIR, SEED);
    console.log(`    ${WORKDIR}`);
    console.log(`      .litectx before: ${storeBefore ? 'present' : 'absent'} -> after: ${existsSync(join(WORKDIR, '.litectx')) ? 'STILL PRESENT (BUG)' : 'gone'}`);
    console.log(`      HEAD now ${cold.head} (seed ${SEED.slice(0, 12)}), tree clean`);
    console.log('      run-u.mjs performs this itself at the top of every cold row — the battery does not do it a second time.');
  }

  // 5. the spend reader, against REAL archived spines of this very job
  console.log('\n[5] SPEND ACCOUNTING — against REAL archived spines (not a fixture):');
  const archived = existsSync(SPINE_DIR)
    ? readdirSync(SPINE_DIR).filter(isSpineFile).sort()
    : [];
  /** @type {any[]} */
  const sampleRows = [];
  for (const f of archived) {
    const r = readRow(join(SPINE_DIR, f));
    sampleRows.push(r);
    const un = r.unaccounted.length ? ` UNACCOUNTED:[${r.unaccounted.map((u) => `${u.type} x${u.count}`).join(',')}]` : '';
    const ec = Object.keys(r.echoes).length ? ` echoes-skipped:[${Object.entries(r.echoes).map(([t, n]) => `${t} x${n}`).join(',')}]` : '';
    console.log(`    ${f.padEnd(22)} ${String(r.outcome).padEnd(14)} rounds=${String(r.accountedRounds).padStart(4)} summed=$${r.accountedUsd.toFixed(4)} job-end=${r.ledgerUsd === null ? 'none' : `$${r.ledgerUsd.toFixed(4)}`} diff=${r.divergenceUsd === null ? 'n/a' : `$${r.divergenceUsd.toFixed(6)}`}${r.spendComplete ? '' : ' FLOOR'}${r.unpricedRounds ? ` UNPRICED x${r.unpricedRounds}` : ''}${ec}${un}`);
  }
  if (archived.length === 0) console.log('    no archived spines here — the reader could not be exercised on real data.');
  console.log(`    accounted types: ${ACCOUNTED_ROUND_TYPES.join(', ')} | echoes excluded: ${ECHO_ROUND_TYPES.join(', ')} | anything else with a non-zero costUsd is reported UNACCOUNTED and still counted`);

  // 6. the tool-share reader, against REAL gate audits
  console.log('\n[6] TOOL SHARE (SECONDARY) — against REAL archived gate audits:');
  for (const r of sampleRows) {
    if (!r.tools) { console.log(`    ${(r.runid ?? '?').padEnd(12)} no gate audit on disk`); continue; }
    const top = Object.entries(r.tools.byTool).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t}:${n}`).join(' ');
    console.log(`    ${(r.runid ?? '?').padEnd(12)} tools=${String(r.tools.total).padStart(4)} ctx_recall+ctx_get=${String(r.tools.retrieval).padStart(4)} share=${pct(r.tools.share)}  (llm rows excluded: ${r.tools.llmRows}, governance rows: ${r.tools.governanceRows})  ${top}`);
  }

  // 7. the ceiling arithmetic, row by row, over the real row budget
  console.log(`\n[7] CEILING — $${CEILING_USD} hard, checked BEFORE each row on the WORST CASE that row could cost ($${ROW_BUDGET_USD} = the signed budgetUsd, never an average of what rows have cost so far):`);
  let spent = 0;
  let stopped = false;
  // rehearse with real archived spends, cycled, so the arithmetic runs on real numbers
  const realSpends = sampleRows.filter((r) => !isCasualty(r.outcome) && r.spendUsd > 0).map((r) => r.spendUsd);
  for (const row of PLAN) {
    const gate = ceilingGate({ ceilingUsd: CEILING_USD, priorUsd: PRIOR_USD, spentUsd: spent, rowBudgetUsd: ROW_BUDGET_USD });
    if (!gate.ok) {
      console.log(`    row ${String(row.row).padStart(2)} ${row.arm}: REFUSED — committed $${gate.committed.toFixed(2)} + worst case $${ROW_BUDGET_USD} = $${gate.projected.toFixed(2)} > $${CEILING_USD}. STOP and report; the ceiling is never widened.`);
      stopped = true;
      break;
    }
    const cost = realSpends.length ? realSpends[(row.row - 1) % realSpends.length] : 0;
    spent += cost;
    console.log(`    row ${String(row.row).padStart(2)} ${row.arm}: OK (headroom $${gate.headroom.toFixed(2)}) -> rehearsed spend $${cost.toFixed(4)} (a real archived row's), running $${spent.toFixed(4)}`);
  }
  if (!stopped) console.log(`    all ${PLAN.length} rows fundable at the rehearsed rate; worst case ${PLAN.length} x $${ROW_BUDGET_USD} = $${(PLAN.length * ROW_BUDGET_USD).toFixed(2)} sits exactly at the $${CEILING_USD} ceiling, so a row is refused the moment real spend exceeds the rehearsal.`);
  const refuse = ceilingGate({ ceilingUsd: CEILING_USD, priorUsd: CEILING_USD - 1, spentUsd: 0, rowBudgetUsd: ROW_BUDGET_USD });
  console.log(`    refuse-to-start check: prior $${(CEILING_USD - 1).toFixed(2)} + $${ROW_BUDGET_USD} worst case -> ok=${refuse.ok} (projected $${refuse.projected.toFixed(2)})`);

  // 8. the readout itself, on the real archived rows
  console.log('\n[8] READOUT — rendered over the archived rows above, arms assigned by the plan.');
  console.log('    THESE ARE NOT BATTERY RESULTS. They are real past runs of this job, used here only to prove');
  console.log('    the readout renders, the medians compute and the casualty exclusion fires. No arm was run.');
  const rehearsal = sampleRows.map((r, i) => ({ ...r, row: i + 1, arm: PLAN[i % PLAN.length].arm }));
  readout(rehearsal);

  console.log('\n== DRY RUN COMPLETE — zero provider calls made, $0 spent. ==');
  console.log(`   To fire for real:  ANTHROPIC_API_KEY=... node scripts/run-battery-readshim.mjs --approve ${specHash}`);
};

// ── THE REAL BATTERY ───────────────────────────────────────────────────────
const fire = async () => {
  banner();
  if (!process.env.ANTHROPIC_API_KEY) die('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
  // asked ONCE, before any money: the machine idle-suspends in ~12min and a suspend
  // freezes the outside watchdog too (F72). A battery without the inhibitor is 12 rows
  // of unguarded run, and finding that out at row 1's death is finding it out too late.
  try { execFileSync('systemd-inhibit', ['--help'], { stdio: 'ignore' }); }
  catch (e) { die(`systemd-inhibit is not runnable here (${e?.message ?? e}) — every paid row must hold a sleep inhibitor, and a suspend freezes the outside watchdog with everything else (F72). REFUSING to start.`); }
  mkdirSync(SPINE_DIR, { recursive: true });

  // ── CONTINUATION. A battery stops mid-way for two legal reasons (a casualty
  // awaiting its provider probe, an operator kill), and the re-invocation must not
  // re-pay for rows that already ran. `--results <file>` reopens a battery: its rows,
  // its spend and its relaunch ledger are read back, and only the unfinished rows are
  // queued. Without this the re-invocation printed by the casualty path would have
  // restarted at row 1 and bought every completed row a second time.
  /** @type {any[]} */
  let rows = [];
  /** casualty classes already relaunched once. "One relaunch per casualty class"
   * (prereg DISCARD rule) — a class that dies twice is a condition, not an accident.
   * Persisted, because the relaunch and the retry live in different invocations. */
  let relaunched = new Set();
  if (existsSync(RESULTS_FILE)) {
    const prior = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
    if (prior.specHash !== specHash) die(`--results ${RESULTS_FILE} was written against spec ${prior.specHash}; this one is ${specHash}. Rows judged by two spec versions are not one battery.`);
    rows = Array.isArray(prior.rows) ? prior.rows : [];
    relaunched = new Set(Array.isArray(prior.relaunched) ? prior.relaunched : []);
    console.log(`\ncontinuing ${RESULTS_FILE}: ${rows.length} row(s) already on file, relaunched classes [${[...relaunched].join(', ') || 'none'}]`);
  }
  /** this battery's OWN spend, read off its rows — never re-entered by hand. `--prior-usd`
   * is for spend OUTSIDE this results file only, so the two can never double-count. */
  let spent = rows.reduce((a, r) => a + (r.spendUsd ?? 0), 0);
  let stop = null;

  const persist = () => writeFileSync(RESULTS_FILE, JSON.stringify({
    prereg: 'docs/03-logs/experiments/2026-08-18-readshim-phase2-prereg.md',
    specHash, ceilingUsd: CEILING_USD, priorUsd: PRIOR_USD, rowBudgetUsd: ROW_BUDGET_USD,
    plan: PLAN, rows, relaunched: [...relaunched], spentUsd: spent, stop,
  }, null, 2));

  // a row is DONE when it produced a result (a casualty did not). A casualty row is
  // re-queued only while its class still has its one relaunch — otherwise it stands as
  // a casualty and its arm ends short of n, which the readout says out loud.
  const queue = PLAN.slice(0, LIMIT).filter((r) => !rowSettled(rows, r.row))
    .map((r) => ({ ...r, attempt: rows.filter((x) => x.row === r.row).length + 1 }));
  if (queue.length === 0) { console.log('\nevery planned row is settled — nothing to launch.'); readout(rows); console.log(`\nresults  ${RESULTS_FILE}`); return; }
  while (queue.length) {
    const row = queue.shift();
    const gate = ceilingGate({ ceilingUsd: CEILING_USD, priorUsd: PRIOR_USD, spentUsd: spent, rowBudgetUsd: ROW_BUDGET_USD });
    if (!gate.ok) {
      stop = `CEILING — row ${row.row} (${row.arm}) not started: committed $${gate.committed.toFixed(2)} + worst case $${ROW_BUDGET_USD} = $${gate.projected.toFixed(2)} > $${CEILING_USD}`;
      console.log(`\n${stop}`);
      console.log('  STOPPING. The remaining rows are unfunded; the ceiling is never widened. Report and hand back.');
      rows.push({ row: row.row, arm: row.arm, outcome: 'ceiling-stop', spendUsd: 0, spendComplete: true, share: null, detail: 'never launched — unfunded' });
      persist();
      break;
    }

    const logFile = join(SPINE_DIR, `readshim-row${row.row}-${row.arm}-a${row.attempt}.log`);
    const before = new Set(readdirSync(SPINE_DIR).filter(isSpineFile));
    console.log(`\n-- row ${row.row}/${PLAN.length}  arm ${row.arm}  attempt ${row.attempt}  (headroom $${gate.headroom.toFixed(2)}) --`);
    const startedAt = Date.now();
    const child = launchRow(row, logFile);
    const waited = await awaitRow(child, before, startedAt);
    const read = waited.spineFile ? readRow(waited.spineFile) : { outcome: waited.stop, spendUsd: 0, spendComplete: true, share: null, accountedRounds: 0, echoes: {}, unaccounted: [] };
    // a driver-side stop OVERRIDES whatever the spine's last state looked like: a row
    // this driver could not read to completion is not a result, whatever it half-said.
    const outcome = waited.stop === 'job-end' ? read.outcome : waited.stop;
    const rec = { ...read, row: row.row, arm: row.arm, attempt: row.attempt, outcome, detail: waited.detail ?? read.detail ?? null, logFile, wallMs: Date.now() - startedAt };
    // The NEXT row's cold reset destroys this row's tree, so the diff is captured here
    // while it still exists. Read-only (`git diff`, no index touch): the spine and the
    // gate audit survive on their own, but the edits a green actually produced are the
    // only artifact that can answer "did the capped worker really do the work" later.
    try {
      const patch = execFileSync('git', ['-C', WORKDIR, 'diff', SEED], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const patchFile = join(SPINE_DIR, `readshim-row${row.row}-${row.arm}-a${row.attempt}.patch`);
      writeFileSync(patchFile, patch);
      rec.patchFile = patchFile;
      rec.patchBytes = patch.length;
    } catch (e) { rec.patchFile = null; rec.patchError = String(e?.message ?? e); }
    rows.push(rec);
    spent += rec.spendUsd ?? 0;
    persist();
    console.log(`   ${outcome}  ${usd(rec.spendUsd ?? null, rec.spendComplete !== false)}  ${Math.round(rec.wallMs / 60000)}min  ${isCasualty(outcome) ? 'CASUALTY (excluded from the arm)' : ''}`);

    if (isCasualty(outcome)) {
      const cls = String(outcome);
      if (relaunched.has(cls)) {
        rec.relaunchGranted = false;
        persist();
        console.log(`   ${cls} has already been relaunched once this battery — NOT relaunching again. One relaunch per casualty class; a class that repeats is a condition, and this arm ends short of n=${N_PER_ARM}.`);
      } else {
        relaunched.add(cls);
        rec.relaunchGranted = true;
        console.log(`   relaunching row ${row.row} (${row.arm}) once — but NOT before the provider shows 2 consecutive 200s.`);
        console.log('   PROVIDER PROBE IS NOT AUTOMATED HERE: it is a paid call, and this driver does not make');
        console.log('   unaccounted paid calls. Run the probe yourself, then re-invoke with:');
        console.log(`     node scripts/run-battery-readshim.mjs --approve ${specHash} --results ${RESULTS_FILE}${PRIOR_USD ? ` --prior-usd ${PRIOR_USD}` : ''}`);
        console.log('   (the results file carries this battery\'s rows, spend and relaunch ledger — the finished rows are NOT re-run,');
        console.log('    and their spend is folded back into the ceiling from the file rather than re-entered by hand.)');
        stop = `CASUALTY ${cls} on row ${row.row} (${row.arm}) — relaunch pending a provider probe (2 consecutive 200s)`;
        persist();
        break;
      }
    }
  }

  readout(rows);
  console.log(`\nresults  ${RESULTS_FILE}`);
  if (stop) console.log(`stop     ${stop}`);
};

// ── entry ──────────────────────────────────────────────────────────────────
if (DRY) {
  dryRun();
} else if (arg('approve') !== specHash) {
  banner();
  console.log('\nThis battery spends REAL dollars. Nothing launched.');
  console.log(`  read it first:  node scripts/run-battery-readshim.mjs --dry-run`);
  console.log(`  then fire:      ANTHROPIC_API_KEY=... node scripts/run-battery-readshim.mjs --approve ${specHash}`);
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  process.exit(arg('approve') === null ? 0 : 1);
} else {
  await fire();
}
