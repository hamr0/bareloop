// REUSE — the first real caller of `runReuse` (Layer 3, design record
// docs/product/2026-08-01-layer-3-reuse-design.md, D3/D6/D7 + R1).
//
// hamr's sentence, verbatim, is what this runner exists to execute:
//
//   *"part of reuse we ask user for cost/time and how many workflows to try before
//   starting new like $5 and 30 mins x2 then start anew if both red"*
//
// So the operator hands over three numbers — `--budget`, `--wall`, `--tries` — plus a
// registry to pick from, and the run does the rest under exactly those numbers. It is
// `run-u.mjs`'s conventions throughout: the approval gate on the spec HASH, the F67
// outside watchdog, the spine, the gate-audit relocation, the secrets scan, and a run
// that dies comes back to hamr rather than being re-fired by the harness.
//
// ── BEFORE YOU LAUNCH ────────────────────────────────────────────────────────
// Run it under a sleep inhibitor. A reuse run is up to (tries + 1) full jobs long, and
// F72 measured that a SUSPEND freezes every guard there is — the in-process fuses, the
// clock, and the outside watchdog alike (they are all in processes that stopped). No
// guard covers a laptop that slept, so the inhibitor is the operator's job and it is
// NOT shelled out to from here (a harness that grabs a system lock nobody asked for is
// the wrong side of the line):
//
//   systemd-inhibit --what=idle:sleep --why="bareloop reuse run" \
//     env ANTHROPIC_API_KEY=... node scripts/run-reuse.mjs --job litectx-types \
//     --registry ../bareloop-patients/bridges --budget 5 --wall 30 --tries 2 --approve <hash>
//
// ── FOUR DELIBERATE DIFFERENCES FROM run-u.mjs, named rather than papered over ──
//  1. **The patient is NOT reset.** run-u does `git reset --hard SEED && git clean -fd`;
//     this runner REFUSES on a dirty tree and prints the command instead (the
//     reuse-preprobe/exec-probe precedent): the reset is operator-performed, so a
//     half-solved tree is a stop the operator sees rather than a state a harness erased.
//  2. **The approved hash covers ALL THREE envelope numbers.** The envelope tightens
//     `budgetUsd`/`maxWallMs`, which makes a new spec VERSION — and `--tries` multiplies
//     the whole thing, so the signed artifact is the per-try spec WRAPPED with the try
//     count (`resolveReuse` + `reuseSpecHash`). An envelope equal to the spec's own
//     numbers leaves the per-try spec hash-identical, but the approval hash is still its
//     own number: a hash signed before the count was folded in will not match, and
//     re-signing once is the whole migration (there is no legacy acceptance path).
//  3. **The leak scan cannot gate the registry write.** run-u scans its spine and REFUSES
//     to write the bridge on a hit, because its one bridge is written at the end, after
//     the scan. `runReuse` writes registry rows MID-RUN, per try, so there is no such
//     moment here and no mid-run scan is built for one (a second, hand-rolled scanner is
//     how the ONE inventory drifts). The real guard on this path is the plan validator's
//     own secrets sweep, which runs before any plan executes; the end-of-run scan below
//     stays what it is — a loud, non-zero-exit READOUT over the spine, not a gate.
//  4. **The gate audit is CUMULATIVE across tries.** Every try runs in the same workdir,
//     so one audit file holds them all; it is relocated once, at the end, beside the
//     spine. Said here because a reader counting writes must know they span tries.
//
// ── --resume <runid|spine path> (module C) ───────────────────────────────────
// "killing and coming back is not an option" — but when a kill DOES happen, the run
// comes back losing as little as possible. `--resume` reads the dead run's OWN spine,
// keeps every try that completed, and RESTARTS the try that was mid-flight (it was
// never graded, so it was never consumed) under the REMAINDER of that try's signed
// per-try numbers. Four things it refuses to do, each for a ruling already paid for:
//
//   - it never resumes a run whose process is still ALIVE (that is a double-run);
//   - it never resumes under a different envelope than the dead run was signed under
//     — both hashes are printed and the operator decides;
//   - it never gives a restarted try a FRESH allotment: prior spend and prior wall
//     fold in, so a kill cannot widen the signed worst case one kill at a time. If the
//     remainder cannot fund the restart the run caps honestly, having launched nothing;
//   - it never RESETS the patient. A dirty tree is the dead tries' real progress and is
//     continued as the run left it; only HEAD moving off the seed (a commit or rebase
//     under the dead run — operator intervention) stops it.
//
// It CONTINUES the dead spine rather than opening a new one (one run, one log, `seq`
// carried on), and it leaves the unrelocated `gate-audit.jsonl` in the workdir exactly
// where the dead run left it: the audit is cumulative by design, so the resumed legs
// append to the same file and it is relocated once at the end, as usual.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { runReuse, validateEnvelope, resolveReuse, reuseSpecHash, readResume, resumeTreeGate } from '../src/reuse.js';
import { jobSpecHash, resolveWorkerModel } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { scanSecrets, redactSecrets } from '../src/validate.js';
import { registryExists, loadRegistry } from '../src/bridges.js';
import { renderListing } from '../src/selection.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// run-u's own targets table — a PATIENT, its frozen seed, and the spec that names its
// close. Copied with this pointer rather than imported: run-u.mjs is an executable
// runner and importing it fires a paid run.
const JOBS = {
  'aurora-spawner': {
    spec: 'aurora-u-spawner-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/aurora-u',
    spine: 'aurora-u-bareloop',
    seed: 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18',
    patient: 'aurora-u',
  },
  'litectx-types': {
    spec: 'litectx-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/litectx-u',
    spine: 'litectx-u-bareloop',
    seed: '96813a43bbcbac6a808ff610c6751a8736e2903e',
    patient: 'litectx-u',
  },
  'pulselog-types': {
    spec: 'pulselog-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/pulselog-u',
    spine: 'pulselog-u-bareloop',
    seed: '92d71a7c1253f8f2430e2d308ecfef01c826b5c2',
    patient: 'pulselog-u',
  },
  'baremobile-types': {
    spec: 'baremobile-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/baremobile-u',
    spine: 'baremobile-u-bareloop',
    seed: 'd9b318fac78036bd3db35f68c4b1eb5ee634244d',
    patient: 'baremobile-u',
  },
  'bareagent-types': {
    spec: 'bareagent-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/bareagent-u',
    spine: 'bareagent-u-bareloop',
    seed: '0037182a5a369d380e1635e0e4ab13e3557cfab9',
    patient: 'bareagent-u',
  },
  'bareguard-types': {
    spec: 'bareguard-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/bareguard-u',
    spine: 'bareguard-u-bareloop',
    seed: '2ae8fcd37041c186524a6eb5e953b9752cd602fa',
    patient: 'bareguard-u',
  },
};
const CLOSE_TIMEOUT_MS = 900_000; // run-u's number: headroom over the slowest stage, not a budget
const CAP_RUNS = 4;              // the CLOSE-FIX loop's iteration cap
// The step ladder's strike ceiling (src/ladder.js). Shell-owned, exactly where the
// step's fixed count used to be: a step ends when it stops making progress, not
// after N tries, and this is the number of no-progress iterations it is allowed.
const STRIKE_LIMIT = 2;
const DEFAULT_TIER_MODELS = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' };

const argv = process.argv.slice(2);
const die = (/** @type {string} */ msg) => { console.error(msg); process.exit(2); };
// Every flag here TAKES A VALUE, so a flag with nothing after it is a typo, not a
// number. `Number('')` is 0 — and 0 is a legal `--tries` (force cold) and a legal
// `--budget`-adjacent shape, so a trailing `--tries` used to reshape the signed run
// into something the operator never typed and then hash it as if they had. A missing
// value is an operator error and stops here; the next token starting with `--` is the
// same mistake wearing the next flag's name.
const arg = (/** @type {string} */ n) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) die(`--${n} takes a value and none was given${v === undefined ? '' : ` (the next argument is ${JSON.stringify(v)}, which is another flag)`} — an empty value would be read as a number and would silently reshape the run you are signing`);
  return /** @type {string} */ (v);
};
const num = (/** @type {string} */ n) => { const v = arg(n); if (v === null) return null; const x = Number(v); return Number.isFinite(x) ? x : NaN; };

const jobKey = arg('job') ?? 'litectx-types';
const target = JOBS[jobKey];
if (!target) die(`unknown --job "${jobKey}" — one of: ${Object.keys(JOBS).join(', ')}`);

const tierArg = arg('model') ?? 'sonnet';
let MODEL = DEFAULT_TIER_MODELS[tierArg];
if (!MODEL) die(`unknown --model "${tierArg}" — one of: ${Object.keys(DEFAULT_TIER_MODELS).join(', ')}`);

// ── the ENVELOPE: three operator numbers, none of them defaulted. A missing one is a
// refusal, not a guess — a cap the operator did not state is a cap nobody chose, and a
// defaulted cap is a silent second ceiling (the standing `maxWallMs` ruling).
const REGISTRY = arg('registry');
if (!REGISTRY) die('--registry <dir> is required — the bridge registry path is operator-supplied and is never conjured');
const budget = num('budget');
const wallMin = num('wall');
const tries = num('tries');
if (budget === null || Number.isNaN(budget)) die('--budget <usd> is required (the PER-TRY money cap) — no default, ever');
if (wallMin === null || Number.isNaN(wallMin)) die('--wall <minutes> is required (the PER-TRY wall-clock cap) — no default, ever');
if (tries === null || Number.isNaN(tries)) die('--tries <n> is required (how many stored workflows to try before drafting cold; 0 = force cold)');
const envelope = { perTryBudgetUsd: budget, perTryWallMs: Math.round(wallMin * 60_000), bridgeTries: tries };

const PIN = arg('pin');
const FORCE_COLD = argv.includes('--force-cold');
if (PIN && FORCE_COLD) die('--pin and --force-cold contradict each other — pick one');

const spec = JSON.parse(readFileSync(new URL(`../jobs/${target.spec}`, import.meta.url), 'utf8'));
// The signed spec's `model` wins outright; a mismatched --model flag is refused
// (same contract as run-u.mjs — src/job.js resolveWorkerModel, build-list #3).
try {
  MODEL = resolveWorkerModel({
    specModel: spec.model,
    flagModel: arg('model') === null ? undefined : MODEL,
    defaultModel: DEFAULT_TIER_MODELS.sonnet,
  }).model;
} catch (e) { die(/** @type {Error} */ (e).message); }
const ev = validateEnvelope(envelope, { job: spec });
if (!ev.ok) {
  console.error('ENVELOPE REFUSED — it does not compose with the signed spec:');
  for (const r of ev.reds) console.error(`  ${r.code} ${r.path}${r.detail ? ` — ${r.detail}` : ''}`);
  console.error('\nThe envelope may only TIGHTEN the signed caps. Raising them is a spec edit, and the new hash needs re-approval.');
  process.exit(2);
}
// The hash the human signs is the hash that RUNS — and it covers ALL THREE envelope
// numbers, not two. The worst case a reuse run authorizes is
// `perTryBudgetUsd × (tries + 1)`, so a signature over the per-try spec alone (budget +
// wall) leaves the MULTIPLIER unsigned: `--tries 0` and `--tries 9` printed the same hash.
// `resolveReuse` wraps the per-try spec with the count and `reuseSpecHash` hashes them
// together. The per-try spec's OWN hash is still computed, because `runJob`'s inner gate
// reads that one — see the approvals mint below.
const resolved = resolveReuse(spec, ev.envelope);
const specHash = jobSpecHash(resolved.spec);
const approvalHash = reuseSpecHash(resolved);
const tightened = specHash !== jobSpecHash(spec);

const registryDir = resolve(REGISTRY);
if (!registryExists(registryDir)) die(`--registry ${registryDir} does not exist — create it (the path is operator-supplied and never conjured)`);

// ── --resume: read the dead run's spine BEFORE the approval gate ─────────────
// Everything here happens before a key is read and before a dollar is committed, and
// every failure is a refusal rather than a fresh run wearing a resume flag.
const RESUME = arg('resume');
const spineDirDefault = join(resolve(target.workdir), '..', target.spine);
/** the dead spine. `--resume` takes the runid (the conventional
 * `<spine dir>/reuse-<runid>.jsonl`) or an explicit path — the path form is what makes
 * these gates testable without touching an operator's real spine directory. */
const deadSpineFile = RESUME === null ? null
  : (RESUME.includes('/') || RESUME.endsWith('.jsonl') ? resolve(RESUME) : join(spineDirDefault, `reuse-${RESUME}.jsonl`));
/** @type {any} */
let dead = null;
/** the runid the resumed legs keep: the R1 rows point back at a spine FILE, so the id
 * is the file's, never a fresh one (a new id would name a spine that does not exist) */
let resumedRunid = null;
/** the DEAD run's kill report, parsed ONCE and defensively (a truncated or mid-write
 * report is not evidence of anything, least of all of life). Module-scoped because the
 * archive step below reads the same file: a second bare `JSON.parse` there would abort a
 * signed resume on a half-written byte the reader above already tolerated. */
/** @type {any} */
let deadWatchdog = null;
if (deadSpineFile !== null) {
  if (!existsSync(deadSpineFile)) die(`--resume: no spine at ${deadSpineFile} — a resume continues a run that happened, and this one left no log`);
  let raw;
  try { raw = readFileSync(deadSpineFile, 'utf8'); } catch (e) { die(`--resume: cannot read ${deadSpineFile}: ${e.message}`); }
  /** @type {any[]} */
  const deadEvents = [];
  const lines = raw.split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try { deadEvents.push(JSON.parse(line)); } catch (e) {
      // a kill can land mid-append, so a broken LAST line is the failure being modelled
      // and is tolerated (named, never silently dropped). A broken line anywhere else is
      // a corrupt log, and reconstructing from one would invent a history.
      if (i >= lines.length - 2) console.error(`--resume: ignoring a truncated final line in ${deadSpineFile} (a kill mid-append — the expected shape)`);
      else die(`--resume: ${deadSpineFile} is corrupt at line ${i + 1} (${e.message}) — a reconstruction from a damaged log would invent a history`);
    }
  });

  // is the dead run actually DEAD? Resuming a live one double-runs it: two processes,
  // one workdir, one registry. The pids come from the run's own `runner-start` record
  // and from the watchdog's kill report.
  const watchdogFile = `${deadSpineFile}.watchdog.json`;
  if (existsSync(watchdogFile)) { try { deadWatchdog = JSON.parse(readFileSync(watchdogFile, 'utf8')); } catch { /* an unreadable report is not evidence of life */ } }
  const pids = new Set([...deadEvents.filter((e) => e.type === 'runner-start' && Number.isInteger(e.pid)).map((e) => e.pid), ...(Number.isInteger(deadWatchdog?.pid) ? [deadWatchdog.pid] : [])]);
  for (const pid of pids) {
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    if (!alive) continue;
    // A live pid is not proof: the kernel recycles pids, and refusing on a stranger
    // would strand a resume forever. `/proc/<pid>/cmdline` is the discriminator — and
    // when it cannot be read, the refusal is the safe direction (a double-run is
    // unrecoverable; a false refusal costs the operator one sentence).
    let cmdline = null;
    try { cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim(); } catch { /* no /proc, or not ours */ }
    if (cmdline === null) die(`--resume: pid ${pid} from ${deadSpineFile} is still alive and this process cannot read its command line to tell whether it is the run. Refusing: two processes on one workdir is unrecoverable, a false refusal is not.`);
    if (cmdline.includes('run-reuse.mjs')) die(`--resume: pid ${pid} is STILL ALIVE and running run-reuse (${cmdline.slice(0, 120)}). Resuming a live run would double-run it — stop it first, or wait for it to come back to you.`);
    console.error(`--resume: pid ${pid} is alive but is NOT this runner (${cmdline.slice(0, 80)}) — the pid was recycled; continuing.`);
  }

  // the watchdog's kill record is later, better evidence of how long the dead attempt
  // really lived than its last spine event — and folding an UNDER-count of the wall
  // would hand the restart time the dead attempt already burned
  const killedAt = Date.parse(String(deadWatchdog?.at ?? ''));
  dead = readResume(deadEvents, Number.isFinite(killedAt) ? { deathAt: killedAt } : {});
  if (!dead.started) die(`--resume: ${deadSpineFile} carries no reuse-start — that is not a reuse run's spine`);
  if (dead.ended) die(`--resume: that run reached its own terminal (${dead.endOutcome}) — there is nothing to resume. Start a fresh run.`);
  if (dead.greened) die('--resume: that run already GREENED — there is nothing to resume.');
  if (dead.approvalHash !== approvalHash) {
    console.error('--resume REFUSED: that run was signed under a DIFFERENT envelope than the one you are offering.');
    console.error(`  the dead run's approval hash   ${dead.approvalHash}`);
    console.error(`  this envelope's approval hash  ${approvalHash}   ($${ev.envelope.perTryBudgetUsd}/try · ${(ev.envelope.perTryWallMs / 60000).toFixed(0)}min/try · ${ev.envelope.bridgeTries} tries)`);
    console.error('A resume continues ONE signed run. Resume with the envelope it was signed under, or start a fresh run under this one.');
    process.exit(2);
  }
  const m = /^reuse-(.+)\.jsonl$/.exec(deadSpineFile.split('/').at(-1) ?? '');
  resumedRunid = m ? m[1] : (deadSpineFile.split('/').at(-1) ?? '').replace(/\.jsonl$/, '');
  dead.fromRunid = resumedRunid;
}

// ── what this process will ACTUALLY attempt ──────────────────────────────────
// ONE arithmetic, read by the preview the operator signs against AND by the outside
// watchdog's arming. Two spellings of it disagreed the first time this was rendered: the
// preview promised "1 further workflow try" on a run whose COLD leg was what got killed,
// and the guard was armed for two attempts that were never coming (F70's shape — a guard
// that cannot fire before the run is long dead).
//
// The rules, all from the loop's own behaviour:
//   - a COLD restart means the try loop was already LEFT (exhausted, or the model said
//     none matches, and either way that decision was made and paid for) — no further
//     bridge try is opened, and the restart IS the cold leg;
//   - a cold leg already RUN means everything the envelope authorized is spent;
//   - otherwise the unspent bridge tries remain, and the cold leg after them.
const restartIsCold = dead?.restart?.mode === 'cold';
const coldAlreadyRun = dead ? dead.completed.some((/** @type {any} */ t) => t.mode === 'cold') : false;
const bridgeTriesSpent = dead
  ? dead.completed.filter((/** @type {any} */ t) => t.mode === 'bridge').length + (dead.restart?.mode === 'bridge' ? 1 : 0)
  : 0;
const furtherBridgeTries = !dead ? ev.envelope.bridgeTries
  : (restartIsCold || coldAlreadyRun ? 0 : Math.max(0, ev.envelope.bridgeTries - bridgeTriesSpent));
const coldLegsToRun = !dead ? 1 : (restartIsCold || coldAlreadyRun ? 0 : 1);
/** the restarted attempt runs on its REMAINDER, not a whole cap */
const restartWallMs = dead?.restart ? Math.max(0, ev.envelope.perTryWallMs - dead.restart.priorWallMs) : 0;
const plannedWallMs = ev.envelope.perTryWallMs * (furtherBridgeTries + coldLegsToRun) + restartWallMs;
/** how many CLOSES the guard's grace has to cover: one per attempt that will run */
const plannedAttempts = furtherBridgeTries + coldLegsToRun + (dead?.restart ? 1 : 0);

if (arg('approve') !== approvalHash) {
  const listing = loadRegistry(registryDir);
  if (dead) {
    // the RESUME preview: what is inherited, what restarts, and on what remainder. Read
    // before signing, because signing this hash authorizes exactly the attempts below.
    const rs = dead.restart;
    console.log('RESUME — continuing a killed run, REAL dollars');
    console.log(`  spine     ${deadSpineFile}  (run ${resumedRunid})`);
    console.log(`  spent     ${dead.spentUsd == null ? 'UNKNOWN' : `${dead.spendComplete ? '' : '≥'}$${dead.spentUsd.toFixed(4)}`} before the kill${dead.deathAtKnown ? '' : ' (the death time is UNKNOWN — no wall could be folded)'}`);
    for (const t of dead.completed) {
      console.log(`  kept      try ${t.n} ${t.mode}${t.bridge ? ` "${t.bridge}"` : ''} → ${t.runOutcome}`
        + ` (${t.spentUsd === null ? 'spend UNKNOWN' : `${t.spendComplete ? '' : '≥'}$${t.spentUsd.toFixed(4)}`}) — NOT re-run`);
    }
    if (dead.r1Missing) console.log('  NOTE      the last try was graded but the kill landed before its registry row was written — that row is LOST, and the resumed run does not invent it');
    if (rs) {
      console.log(`  restart   try ${rs.n} ${rs.mode}${rs.bridge ? ` "${rs.bridge}"` : ''} — it was never graded, so it is not consumed`);
      console.log(`            already spent on it: ${rs.priorSpendComplete ? '' : '≥'}$${rs.priorSpentUsd.toFixed(4)} and ${(rs.priorWallMs / 60000).toFixed(1)}min — FOLDED IN, so it restarts on the REMAINDER`);
      console.log(`            remainder: $${(ev.envelope.perTryBudgetUsd - rs.priorSpentUsd).toFixed(4)} of $${ev.envelope.perTryBudgetUsd} and ${((ev.envelope.perTryWallMs - rs.priorWallMs) / 60000).toFixed(1)}min of ${(ev.envelope.perTryWallMs / 60000).toFixed(0)}min`);
      // WHERE it picks up. Without this line "restart try 1" covers two attempts that
      // cost very different amounts — one that re-drafts from nothing, and one that
      // resumes at the last step — and the operator is signing a hash that authorizes
      // the dollars either way. So the line states what will NOT be bought again.
      const sd = rs.seed;
      const left = `$${(ev.envelope.perTryBudgetUsd - rs.priorSpentUsd).toFixed(2)} remaining for it`;
      if (!sd) {
        console.log(`  at        the beginning of the try — it died before a plan was accepted, so nothing paid is re-payable (${left})`);
      } else if (sd.phase === 'close') {
        console.log(`  at        the close and its fix loop — all ${sd.plan.steps.length} steps are done and are SKIPPED; the close re-runs for no tokens (${left})`);
        console.log('            the plan is reloaded from this run\'s own spine: no re-scout, no re-draft, no step re-run');
      } else {
        const nth = sd.completedSteps.length;
        const next = sd.plan.steps[nth];
        console.log(`  at        step ${nth + 1} of ${sd.plan.steps.length} ${JSON.stringify(next?.id ?? '(unknown)')} — ${nth} step${nth === 1 ? '' : 's'} already finished and SKIPPED, not re-paid (${left})`);
        console.log('            the plan is reloaded from this run\'s own spine: no re-scout, no re-draft');
      }
    } else {
      console.log('  restart   nothing was mid-flight — the kill landed between tries');
    }
    console.log(`  left      ${furtherBridgeTries} further workflow tr${furtherBridgeTries === 1 ? 'y' : 'ies'} of ${ev.envelope.bridgeTries} authorized`
      + `${coldLegsToRun ? ', then the cold draft' : restartIsCold ? ' — the restart IS the cold draft, and the try loop was already left' : ' — the cold draft already ran; this run has nothing left to authorize'}`);
    if (plannedWallMs > 0) console.log(`  guard     the outside watchdog is armed for ${(plannedWallMs / 60000).toFixed(0)}min — the work actually LEFT, not the whole envelope`);
    // W-2 on the launch side. Zero left is not "armed for 0min" — it is nothing to arm
    // a guard for, and it used to reach u-watchdog as `--wall-ms 0`, which defaulted to
    // null and armed no deadline at all. Said HERE too, before the signature, because a
    // refusal the operator only meets after signing is a refusal one step too late.
    // TWO zeros, two levers: a restart with its wall burned wants --wall; a run whose
    // authorized attempts all ran wants --tries or nothing — naming the wrong lever
    // would send the operator to re-sign a number that buys no attempt.
    else if (dead?.restart) console.log('  guard     NO WALL LEFT — the restart burned its whole per-try wall; the run below REFUSES rather than launching (raise --wall, which re-signs)');
    else console.log('  guard     NOTHING TO ARM — no attempt will run (every authorized attempt already did); the run below REFUSES rather than launching (raise --tries for another attempt, which re-signs, or read the run as it stands)');
    console.log(`  patient   ${target.workdir} — continued AS THE RUN LEFT IT (dirty is expected; it is never reset here)`);
    console.log(`  registry  ${registryDir}`);
    console.log(`  hash      ${approvalHash}`);
    console.log('            the SAME signature the dead run carried — a resume continues one signed run, never a new envelope');
    if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version + envelope.`);
    console.log('\nLaunch under a sleep inhibitor (F72):');
    console.log(`  systemd-inhibit --what=idle:sleep --why="bareloop reuse" env ANTHROPIC_API_KEY=... \\
    node scripts/run-reuse.mjs --job ${jobKey} --registry ${REGISTRY} --budget ${budget} --wall ${wallMin} --tries ${tries} --resume ${RESUME} --approve ${approvalHash}`);
    process.exit(arg('approve') === null ? 0 : 1);
  }
  console.log('REUSE — a stored workflow first, a cold draft last, REAL dollars');
  console.log(`  spec      jobs/${target.spec}${tightened ? '  (TIGHTENED by the envelope → a NEW spec version)' : '  (envelope equals the spec — hash unchanged)'}`);
  console.log(`  envelope  $${ev.envelope.perTryBudgetUsd}/try · ${(ev.envelope.perTryWallMs / 60000).toFixed(0)}min/try · ${ev.envelope.bridgeTries} workflow tr${ev.envelope.bridgeTries === 1 ? 'y' : 'ies'}, then cold`);
  // named, not rounded away: the envelope caps each TRY, and the selection calls sit
  // OUTSIDE those caps (they happen before a try starts, on the drafter tier). They are
  // small — one short prompt each — but "small" is not "zero", and a header that folded
  // them into the try cap would advertise a number the run does not enforce.
  console.log(`  worst     $${(ev.envelope.perTryBudgetUsd * (ev.envelope.bridgeTries + 1)).toFixed(2)} and ${((ev.envelope.perTryWallMs * (ev.envelope.bridgeTries + 1)) / 60000).toFixed(0)}min if every attempt runs to its cap`);
  console.log(`            PLUS up to ${ev.envelope.bridgeTries} selection call(s), which sit OUTSIDE the per-try caps and are metered and reported separately`);
  console.log(`  patient   ${target.workdir} @ ${target.seed.slice(0, 12)}`);
  console.log(`  registry  ${registryDir}`);
  console.log(`  selection ${FORCE_COLD ? 'FORCED COLD (no workflow offered)' : PIN ? `PINNED "${PIN}" (the model may refuse it only explicitly, with a reason)` : 'the model picks, or declares none matches'}`);
  console.log(`  goal      "${spec.goal}"`);
  console.log(`  hash      ${approvalHash}`);
  console.log(`            covers ALL THREE envelope numbers — the per-try spec (${specHash.slice(0, 12)}…: budget + wall) AND --tries ${ev.envelope.bridgeTries}, because tries is the spend MULTIPLIER`);
  console.log('');
  console.log(renderListing(listing));
  if (arg('approve') !== null) {
    console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version + envelope.`);
    // said plainly, because the scheme CHANGED: a hash signed before the try count was
    // folded in will not match, and neither will one signed for a different --tries.
    // That is correct — a signature that never covered the multiplier never covered the
    // run's worst case — and there is no legacy acceptance path. Re-sign once.
    console.error('The approval hash now includes --tries (it used to cover only the per-try budget and wall), so a hash signed under the old scheme — or for a different try count — will NOT match. Re-sign the hash printed above.');
  }
  console.log('\nLaunch under a sleep inhibitor — a suspend freezes every guard, including the outside watchdog (F72):');
  console.log(`  systemd-inhibit --what=idle:sleep --why="bareloop reuse" env ANTHROPIC_API_KEY=... \\
    node scripts/run-reuse.mjs --job ${jobKey} --registry ${REGISTRY} --budget ${budget} --wall ${wallMin} --tries ${tries}${PIN ? ` --pin ${PIN}` : ''}${FORCE_COLD ? ' --force-cold' : ''} --approve ${approvalHash}`);
  process.exit(arg('approve') === null ? 0 : 1);
}

// W-2 ("when time is up, keep the grade we already have and stop"), on the launch side.
// `plannedWallMs` is the work actually LEFT, and a resume can reach zero two ways: the
// restarted try already burned its whole per-try wall, or every authorized attempt has
// run. Either way there is no time to start anything in — and launching anyway used to
// hand the outside guard `--wall-ms 0`, which it defaulted to null: an unbounded run
// under a banner advertising a wall. The refusal names the lever; nothing here raises a
// cap, and raising --wall re-signs the hash.
if (plannedWallMs <= 0) {
  console.error(`${dead?.restart ? 'WALL ALREADY EXHAUSTED' : 'NOTHING LEFT TO AUTHORIZE'} — nothing is left to run under this envelope (${furtherBridgeTries} further workflow tr${furtherBridgeTries === 1 ? 'y' : 'ies'}, ${coldLegsToRun} cold leg${dead?.restart ? `, restart remainder ${(restartWallMs / 60000).toFixed(1)}min of ${(ev.envelope.perTryWallMs / 60000).toFixed(0)}min` : ''}).`);
  console.error('The killed run kept every verdict it minted; this process would buy a scout and a precheck before its own clock stopped it. The levers are yours:');
  console.error('  - RAISE --wall (and/or --tries) — both are in the approval hash, so that is a new signature;');
  console.error('  - or read the run as it stands and start a fresh one under a new envelope.');
  process.exit(2);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) die('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');

const wd = resolve(target.workdir);
const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
// the patient must START at the seed, and this runner REFUSES rather than resetting: a
// half-solved tree is a stop the operator sees, never a state the harness silently erased
const head = git(['rev-parse', 'HEAD']);
const dirty = git(['status', '--porcelain']);
if (dead) {
  // a RESUME inherits the tree: the dead tries' edits are work this run already paid
  // for, and resetting them would throw away the progress resume exists to keep. Only a
  // moved HEAD stops it (see `resumeTreeGate`).
  const gate = resumeTreeGate({ head, seed: target.seed, dirty });
  if (!gate.ok) {
    console.error(`PATIENT REFUSED — ${gate.detail}`);
    console.error('This is a decision for you, not the harness: reset and start fresh, or put HEAD back where the dead run left it and resume again.');
    process.exit(2);
  }
  if (gate.detail) console.log(`patient   ${gate.detail}`);
} else if (head !== target.seed || dirty) {
  console.error(`PATIENT REFUSED — ${head !== target.seed ? `HEAD is ${head.slice(0, 12)}, not the frozen seed ${target.seed.slice(0, 12)}` : 'the tree has uncommitted changes'}.`);
  console.error('A run that inherits the previous run\'s edits measures the wrong thing. Reset it yourself:');
  console.error(`  git -C ${wd} reset --hard ${target.seed} && git -C ${wd} clean -fd && rm -rf ${join(wd, '.litectx')}`);
  console.error('(To CONTINUE a killed run instead of starting over, that is `--resume <runid>` — it keeps the tree and the tries the dead run already paid for.)');
  process.exit(2);
}

const spineDir = join(wd, '..', target.spine);
mkdirSync(spineDir, { recursive: true });
// ONE run, ONE log: a resume appends to the dead run's own spine and keeps its runid, so
// the R1 rows it writes (`<runid>-t<n>`) still name a file that exists. `seq` continues
// from the last row already in it — a second series restarting at 1 would put two rows
// with the same number in one append-only record.
const runid = dead ? resumedRunid : Date.now().toString(36);
const spineFile = dead ? deadSpineFile : join(spineDir, `reuse-${runid}.jsonl`);
const startSeq = dead
  ? readFileSync(spineFile, 'utf8').split('\n').filter((l) => l.trim()).reduce((max, l) => { try { const s = JSON.parse(l).seq; return typeof s === 'number' && s > max ? s : max; } catch { return max; } }, 0)
  : 0;

// The record `runJob`'s OWN gate reads, which is the per-try spec's hash — minted here
// only because `--approve` just matched `approvalHash`, and that hash is a function of
// exactly this `specHash` plus the try count. So the operator's one signature ENTAILS
// this record; nothing is forged and no second decision is made. `runReuse` still hands
// `approvals` straight through and still has no way to mint one itself.
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];
const provider = new AnthropicProvider({ apiKey, model: MODEL });
/** @type {Record<string, any>} */
const tierCache = {};
const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= DEFAULT_TIER_MODELS[tier] === MODEL ? provider : new AnthropicProvider({ apiKey, model: DEFAULT_TIER_MODELS[tier] }));

const started = Date.now();
console.log(`\n== ${dead ? 'RESUMED' : 'REUSE'} run ${runid} ==  $${ev.envelope.perTryBudgetUsd}/try · ${(ev.envelope.perTryWallMs / 60000).toFixed(0)}min/try · ${ev.envelope.bridgeTries} tries then cold · ${MODEL}`);

// F67 — the OUTSIDE watchdog. Same arithmetic as run-u, with ONE difference that matters:
// the run's wall is per TRY, and the process legitimately lives for (tries + 1) of them,
// so the outside deadline is the SUM. A watchdog holding one try's wall would reap a
// healthy run the moment it started its second attempt — the guard destroying the thing
// it guards (F70).
//
// A RESUME sizes the same arithmetic against the work that is actually LEFT: the tries
// already completed will not run again, and the restarted try has only its remainder. A
// watchdog armed for the whole envelope on a run with one attempt to go is a guard that
// cannot fire before the run is long dead.
const closeStages = Array.isArray(spec.close) ? spec.close.length : 1;
const worstCloseSilenceMs = CLOSE_TIMEOUT_MS * closeStages;
// `plannedWallMs` / `plannedAttempts` come from the ONE arithmetic above — the same two
// numbers the preview printed for the operator to sign against. They are read here
// directly rather than recomputed: the first version of this file computed the guard's
// arming twice and the two spellings disagreed the moment a resume changed the shape.
// The DEAD run's kill record sits at the path this run's watchdog will write, and the
// readout at the bottom reads that path. Left in place it would report the previous
// process's kill as if this one had been reaped — the blind-instrument class, told by
// one file answering for two runs. It is ARCHIVED beside the spine rather than deleted:
// the record of why the first process died is evidence, and evidence is not tidied away.
if (dead && existsSync(`${spineFile}.watchdog.json`)) {
  // the report was already parsed DEFENSIVELY when the pids were read; re-parsing it
  // bare here would throw out of the module on a truncated report and abort a signed
  // resume at the last gate before the run — the one file whose half-written state this
  // process is specifically built to survive.
  const killedAt = Date.parse(String(deadWatchdog?.at ?? ''));
  // and the suffix must be UNIQUE: a literal `unknown` makes the SECOND unreadable
  // report overwrite the first, which is evidence destroyed by a naming choice. The
  // archive moment stands in when the kill moment cannot be read.
  const archived = `${spineFile}.watchdog-${Number.isFinite(killedAt) ? killedAt : `unknown-${Date.now()}`}.json`;
  renameSync(`${spineFile}.watchdog.json`, archived);
  console.log(`watchdog  the killed run's own kill record archived → ${archived}${Number.isFinite(killedAt) ? '' : ' (its kill time could not be read — the suffix is the ARCHIVE moment, so a second unreadable report cannot overwrite this one)'}`);
}
const watchdog = spawn(process.execPath, [
  fileURLToPath(new URL('./u-watchdog.mjs', import.meta.url)),
  '--spine', spineFile,
  '--pid', String(process.pid),
  '--stale-ms', String(worstCloseSilenceMs + 600_000),
  '--wall-ms', String(plannedWallMs),
  // the grace must cover a legal close per remaining attempt, exactly as run-u's does per run
  '--grace-ms', String(worstCloseSilenceMs * Math.max(1, plannedAttempts)),
], { stdio: ['ignore', 'ignore', 'inherit'] });
watchdog.on('error', (e) => {
  console.error(`\nWATCHDOG FAILED TO START (${e.message}) — this run is UNGUARDED from outside: a frozen event loop will NOT be reaped (F67). The run continues under its own fuses, wall clock and money cap.`);
});
watchdog.unref();

// the WHERE-was-the-freeze sampler (run-u's diagnostic sidecar; decides nothing)
const LAG_POLL_MS = 1_000;
const LAG_RECORD_MS = 3_000;
const lagFile = `${spineFile}.lag.jsonl`;
let lagDue = Date.now() + LAG_POLL_MS;
const lagTimer = setInterval(() => {
  const now = Date.now();
  const blockedMs = now - lagDue;
  if (blockedMs >= LAG_RECORD_MS) {
    try { appendFileSync(lagFile, `${JSON.stringify({ blockedMs, from: new Date(now - blockedMs).toISOString(), until: new Date(now).toISOString() })}\n`); } catch { /* a diagnostic must never kill the run */ }
  }
  lagDue = now + LAG_POLL_MS;
}, LAG_POLL_MS);

const emit = makeSpine(spineFile, { startSeq });
// the run's own liveness record, so a later `--resume` can ask "is that process still
// there?" of something better than a guess. Written by the RUNNER because the pid is the
// runner's, not the library's.
// argv is operator-typed text going onto an APPEND-ONLY log, so it is masked at the
// WRITE SITE, not audited afterwards: the whole-file `scanSecrets` at the readout runs
// long after the bytes are permanent, and a log that captures a key captures it forever.
// The documented launch pattern keeps the key in the environment (`env ANTHROPIC_API_KEY=…
// node …`, never argv), so this is the residual channel closed, not a live leak plugged.
// ONE spelling, the shipped inventory's (src/validate.js) — a hand-rolled mask here would
// be the copy that misses a shape.
emit('runner-start', { pid: process.pid, jobKey, model: MODEL, resumedFrom: dead ? resumedRunid : null, argv: argv.filter((a) => a !== '--approve' && a !== arg('approve')).map((a) => redactSecrets(a)) });

let result;
try {
  result = await runReuse({
    job: spec, approvals, registryDir, envelope: ev.envelope,
    patient: target.patient, workdir: wd, provider, providerFor,
    emit, runid,
    capRuns: CAP_RUNS, strikeLimit: STRIKE_LIMIT, closeTimeoutMs: CLOSE_TIMEOUT_MS,
    ...(PIN ? { pinned: PIN } : {}),
    ...(dead ? { resume: dead } : {}),
    forceCold: FORCE_COLD,
  });
} finally {
  try { watchdog.kill('SIGKILL'); } catch { /* already gone */ }
  clearInterval(lagTimer);
}
const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);

// ── the read. Facts only.
const raw = readFileSync(spineFile, 'utf8');
// the ONE spelling of the text-side scan — a hand-rolled copy here would be another one,
// and one that misses a shape leaks on the very output it guards
const leaks = scanSecrets(raw);

const auditSrc = join(wd, 'gate-audit.jsonl');
let auditFile = null;
if (existsSync(auditSrc)) { auditFile = join(spineDir, `reuse-${runid}-gate-audit.jsonl`); renameSync(auditSrc, auditFile); }

console.log(`\noutcome   ${result.outcome}`);
// F6 on a resumed run: the figure is the WHOLE job — the killed legs plus this one. The
// carried half is stated separately so a reader can see both, and neither half is ever
// dropped to make the other look exact.
console.log(`spent     ${result.spentUsd == null ? 'UNKNOWN' : `${result.spendComplete ? '' : '≥'}$${result.spentUsd.toFixed(4)}`} (tries + selection calls) against $${(ev.envelope.perTryBudgetUsd * (ev.envelope.bridgeTries + 1)).toFixed(2)} of per-try caps`);
if (dead) console.log(`          of which ${dead.carrySpendComplete ? '' : '≥'}$${(dead.carrySpentUsd ?? 0).toFixed(4)} was spent by the KILLED run and is carried, never re-counted and never dropped`);
console.log(`wall      ${elapsedMin}min${dead ? ' in THIS process (the killed run\'s time is folded into the try it was running, not into this line)' : ''}`);
console.log(`tries     ${result.triesUsed} workflow tr${result.triesUsed === 1 ? 'y' : 'ies'} of ${result.triesAuthorized} authorized${result.tries.some((t) => t.mode === 'cold') ? ', then a cold draft' : ''}`);
for (const s of result.selection) {
  console.log(`selection #${s.n} ${s.called ? '' : '(no call) '}→ ${s.choice ?? 'NONE MATCHES'}${s.refused ? ' [REFUSED THE PIN]' : ''}: ${s.reason}`);
}
for (const t of result.tries) {
  const money = t.spentUsd === null ? 'spend UNKNOWN' : `${t.spendComplete ? '' : '≥'}$${t.spentUsd.toFixed(4)}`;
  console.log(`try ${t.n}     ${t.mode}${t.bridge ? ` "${t.bridge}"` : ''} → ${t.runOutcome}${t.failingStage ? ` (stage ${t.failingStage})` : ''}`
    + `  ${money}/$${t.capUsd} · ${typeof t.wallMs === 'number' && Number.isFinite(t.wallMs) ? `${(t.wallMs / 60000).toFixed(1)}/${(t.wallCapMs / 60000).toFixed(0)}min` : 'wall UNKNOWN'} · ${typeof t.rounds === 'number' ? `${t.rounds} rounds` : 'rounds UNKNOWN'} · close ${t.closeReached ? 'reached' : 'NEVER REACHED'}`
    + `${t.inherited ? '  [from the killed run — not re-run]' : ''}`
    + `${t.restarted ? `  [RESTARTED after the kill; ${t.spendComplete === false ? '≥' : ''}$${(t.priorSpentUsd ?? 0).toFixed(4)} and ${((t.priorWallMs ?? 0) / 60000).toFixed(1)}min of that was the dead attempt's]` : ''}`);
}
for (const w of result.bridgeWrites) console.log(`registry  ${w.action} ${w.name ?? '(unnamed)'}${w.file ? ` → ${w.file}` : ''}${w.reds?.length ? ` — REDS: ${w.reds.map((r) => r.code).join(', ')}` : ''}`);
if (result.decision) {
  console.log(`\nDECISION  ${result.decision}`);
  for (const o of result.options) console.log(`  - ${o}`);
  if (result.detail) console.log(result.detail.split('\n').map((l) => `  ${l}`).join('\n'));
}

// A leak is the HARD LINE broken. Count and PATH only, never the matched content.
if (leaks.length) {
  console.log(`\nSPINE LEAK: ${leaks.length} secret-shaped strings in ${spineFile} — the hard line is broken`);
  process.exitCode = 3;
}
if (existsSync(`${spineFile}.watchdog.json`)) {
  const m = JSON.parse(readFileSync(`${spineFile}.watchdog.json`, 'utf8'));
  console.log(`\nWATCHDOG   fired: ${m.reason} — the run was stopped from OUTSIDE, not by its own governance`);
}
if (existsSync(lagFile)) {
  const lags = readFileSync(lagFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const worst = lags.reduce((a, b) => (b.blockedMs > a.blockedMs ? b : a));
  console.log(`\nLOOP FROZE ${lags.length}x — worst ${(worst.blockedMs / 1000).toFixed(1)}s, ${worst.from} → ${worst.until} (${lagFile})`);
}
// the whole result beside the spine: the per-try rows are the decision-ready record, and
// a reader must not have to reconstruct them from stdout
writeFileSync(`${spineFile}.reuse.json`, `${JSON.stringify({
  runid, jobKey, approvalHash, specHash, envelope: ev.envelope,
  // what was inherited, so the file explains its own numbers without the spine
  ...(dead ? { resumedFrom: resumedRunid, carried: { spentUsd: dead.carrySpentUsd, spendComplete: dead.carrySpendComplete, triesCompleted: dead.completed.length, r1Missing: dead.r1Missing }, restarted: dead.restart } : {}),
  result,
}, null, 2)}\n`);
console.log(`\nspine     ${spineFile}${dead ? ` (CONTINUED from the killed run ${resumedRunid} — one run, one log)` : ''}`);
if (auditFile) console.log(`audit     ${auditFile} (CUMULATIVE across every try${dead ? ', killed run included — they share one workdir' : ' — they share one workdir'})`);
console.log(`patient   left AS THE RUN LEFT IT (read it before the next run resets to the seed)`);
if (dead) console.log(`resume    to continue THIS run if it dies again: --resume ${runid} --approve ${approvalHash}`);
