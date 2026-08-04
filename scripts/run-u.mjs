// U — the user-mode e2e. ONE run: one sentence of problem, a budget, a clock, one
// close. No arms, no operator-authored checks, no hand-solving, no retry logic —
// a run that dies comes back to hamr with the cause (standing rule, 2026-07-26).
//
// Acceptance (hamr, LAYERS §4): the workflow need not green everything — it must
// green ONE job end to end. That green GRADUATES the bridge: the plan the agent
// authored is preserved from the spine as a reusable artifact, and the next run of
// this shape reuses and fine-tunes it rather than starting cold.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { scanSecrets } from '../src/validate.js';
// --resume reads the halted run's own spine back through the SAME reader the reuse
// path uses (never a second one) and keeps its patient the way it left it.
import { readResume, resumeTreeGate } from '../src/reuse.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// U targets. Each entry is a PATIENT + its frozen seed + the spec that names its close;
// everything else the runner reads from the spec itself. `--job` selects one; the default
// is the first target so run 1/run 3's invocation is unchanged.
const JOBS = {
  'aurora-spawner': {
    spec: 'aurora-u-spawner-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/aurora-u',
    spine: 'aurora-u-bareloop',
    seed: 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18',
  },
  'litectx-types': {
    spec: 'litectx-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/litectx-u',
    spine: 'litectx-u-bareloop',
    seed: '96813a43bbcbac6a808ff610c6751a8736e2903e',
  },
  'pulselog-types': {
    spec: 'pulselog-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/pulselog-u',
    spine: 'pulselog-u-bareloop',
    seed: '92d71a7c1253f8f2430e2d308ecfef01c826b5c2',
  },
  'baremobile-types': {
    spec: 'baremobile-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/baremobile-u',
    spine: 'baremobile-u-bareloop',
    seed: 'd9b318fac78036bd3db35f68c4b1eb5ee634244d',
  },
  'bareagent-types': {
    spec: 'bareagent-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/bareagent-u',
    spine: 'bareagent-u-bareloop',
    seed: '0037182a5a369d380e1635e0e4ab13e3557cfab9',
  },
  'bareguard-types': {
    spec: 'bareguard-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/bareguard-u',
    spine: 'bareguard-u-bareloop',
    seed: '2ae8fcd37041c186524a6eb5e953b9752cd602fa',
  },
};
const CLOSE_TIMEOUT_MS = 900_000; // the slowest close stage is the suite (~23s aurora, ~53s litectx); headroom, not a budget
// The close-fix loop's RETIRED iteration cap (PRD v1.46 §4). It no longer governs:
// that loop now stops on the same 2-strike no-progress rule the step ladder uses,
// read off the close's own per-stage numbers. This number survives as the bound for
// the one case that rule cannot read — a close whose output carries no number at all
// — because a governor that cannot see the variable must not be the governor.
const CAP_RUNS = 4;
// The step ladder's strike ceiling (src/ladder.js). Shell-owned, exactly where the
// step's fixed count used to be: a step ends when it stops making progress, not
// after N tries, and this is the number of no-progress iterations it is allowed.
const STRIKE_LIMIT = 2;

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
// --model picks the DEFAULT worker tier (runner territory — the spec names no model, so
// the signed hash is unaffected). Tier names, not model ids: the same closed menu the
// planner's per-step `model` field uses. haiku takes no output_config.effort
// (provider-gated, battery rule) — nothing to gate yet since neither tier sets effort.
// PRD v1.36 floor: the drafter/default tier is sonnet MINIMUM — measured, a haiku
// drafter died plan-red twice on the same rejection (ms7gne7s). `--model haiku` runs
// BELOW the floor: an explicit operator probe whose rows are probes, never battery
// evidence.
const DEFAULT_TIER_MODELS = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' };
const tierArg = arg('model') ?? 'sonnet';
const MODEL = DEFAULT_TIER_MODELS[/** @type {keyof typeof DEFAULT_TIER_MODELS} */ (tierArg)];
if (!MODEL) { console.error(`unknown --model "${tierArg}" — one of: ${Object.keys(DEFAULT_TIER_MODELS).join(', ')}`); process.exit(2); }
const jobKey = arg('job') ?? 'aurora-spawner';
const target = JOBS[/** @type {keyof typeof JOBS} */ (jobKey)];
if (!target) { console.error(`unknown --job "${jobKey}" — one of: ${Object.keys(JOBS).join(', ')}`); process.exit(2); }
const WORKDIR = target.workdir;
const SEED = target.seed;
const spec = JSON.parse(readFileSync(new URL(`../jobs/${target.spec}`, import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
// `maxWallMs` is OPTIONAL in job-v1 and has NO DEFAULT — a spec without one is
// time-unbounded by explicit operator choice, and the whole point of the missing
// default is that an unbounded run must be a VISIBLE choice rather than a silent
// second ceiling (src/clock.js, F45). So the runner does two things and neither is
// "invent a number": it NAMES the unbounded state in every readout instead of
// printing `NaN min` (`undefined / 60000`), and it OMITS `--wall-ms` rather than
// handing the watchdog the literal string "undefined" — u-watchdog's num() would
// fall back to its null default and disarm the deadline trigger silently while the
// header still claimed a wall. That is the same NaN-disarms-a-guard class as the
// closeStages fix below, one flag over.
const WALL_MS = typeof spec.maxWallMs === 'number' && Number.isFinite(spec.maxWallMs) ? spec.maxWallMs : null;
const WALL_LABEL = WALL_MS === null ? 'UNBOUNDED (spec sets no maxWallMs — deliberate operator choice; no outside deadline)' : `${WALL_MS / 60000}min`;

// ── --resume: continue a run its own MONEY (or TIME) cap stopped ─────────────
// PRD v1.46 §3, and it closes the third leg of hamr's resume rulings: kill-resume
// existed on the reuse path and W-2 pauses the wall decision-ready, but the case the
// original ruling was actually about — "why would i want to waste more money on
// something i already started" — had no machinery on the U path at all. This runner
// hard-reset the patient on every launch and the resume reader classed any landed
// job-end as complete.
//
// The TOP-UP ITSELF IS NOT HERE and never will be: raising `budgetUsd` is a spec edit,
// so it changes the hash and hamr signs the new one with `--approve`. This flag only
// declines to throw away what the dead run already bought — the tree, the plan, the
// steps that finished, and the money, which is folded IN so the ceiling cannot widen.
const RESUME = arg('resume');
/** the terminals that are a checkpoint rather than a verdict. Both are governance
 * halts: an operator-owned allowance ran out with the work on disk. Nothing else is
 * resumable — a green is done, and a red is an answer. */
const RESUMABLE_HALTS = ['cap-halt', 'wall-halt'];
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };
const spineDirFor = join(resolve(WORKDIR), '..', target.spine);
/** `--resume` takes the runid (the conventional `<spine dir>/u-<runid>.jsonl`) or an
 * explicit path — the path form is what makes these gates testable without touching
 * an operator's real spine directory. */
const deadSpineFile = RESUME == null ? null
  : (RESUME.includes('/') || RESUME.endsWith('.jsonl') ? resolve(RESUME) : join(spineDirFor, `u-${RESUME}.jsonl`));
/** @type {any} */
let dead = null;
if (deadSpineFile !== null) {
  if (!existsSync(deadSpineFile)) die(`--resume: no spine at ${deadSpineFile} — a resume continues a run that happened, and this one left no log`);
  let raw = '';
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
  // is the dead run actually dead? Two processes on one patient is unrecoverable; a
  // false refusal costs one sentence. run-u's own pid is not on its spine, so the
  // watchdog's report is the pid there is — and its absence is not evidence of life.
  const wdFile = `${deadSpineFile}.watchdog.json`;
  /** @type {any} */
  let watchdog = null;
  if (existsSync(wdFile)) { try { watchdog = JSON.parse(readFileSync(wdFile, 'utf8')); } catch { /* an unreadable report is not evidence of life */ } }
  if (Number.isInteger(watchdog?.pid)) {
    let alive = true;
    try { process.kill(watchdog.pid, 0); } catch { alive = false; }
    if (alive) {
      let cmdline = null;
      try { cmdline = readFileSync(`/proc/${watchdog.pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim(); } catch { /* no /proc, or not ours */ }
      if (cmdline === null || cmdline.includes('run-u.mjs') || cmdline.includes('u-watchdog.mjs')) {
        die(`--resume: pid ${watchdog.pid} from ${deadSpineFile} is still alive${cmdline ? ` (${cmdline.slice(0, 120)})` : ' and this process cannot read its command line'}. Two processes on one patient is unrecoverable — stop it first.`);
      }
      console.error(`--resume: pid ${watchdog.pid} is alive but is NOT this runner (${cmdline.slice(0, 80)}) — the pid was recycled; continuing.`);
    }
  }
  // the watchdog's kill record is later, better evidence of how long the dead run
  // really lived than its last spine event
  const killedAt = Date.parse(String(watchdog?.at ?? ''));
  dead = readResume(deadEvents, {
    direct: true,
    resumableOutcomes: RESUMABLE_HALTS,
    ...(Number.isFinite(killedAt) ? { deathAt: killedAt } : {}),
  });
  if (!dead.started) die(`--resume: ${deadSpineFile} carries no job-start — that is not a bareloop run's spine`);
  if (dead.job !== spec.job) die(`--resume: that spine is job "${dead.job}", not "${spec.job}" — a resume continues ONE job, and running another job's plan as this one's is a substitution nothing here is allowed to make`);
  if (dead.greened) die('--resume: that run already GREENED — there is nothing to resume.');
  if (dead.ended) die(`--resume: that run reached its own terminal (${dead.endOutcome}) — only a governance halt (${RESUMABLE_HALTS.join(' / ')}) leaves work to continue. Start a fresh run.`);
  if (!dead.restart) die(`--resume: ${deadSpineFile} has no attempt to continue — it never opened one.`);
}
/** the restart runs on the REMAINDER of the signed wall, never a fresh allotment —
 * "a budget ceiling folds in prior spend so re-invoking cannot silently widen it",
 * in a time coat. Both the run's own clock and the outside watchdog read this one. */
const RESUME_WALL_MS = WALL_MS === null || !dead ? WALL_MS : Math.max(0, WALL_MS - dead.restart.priorWallMs);

if (arg('approve') !== specHash) {
  console.log(dead ? 'U — RESUME, continuing a halted run, REAL dollars' : 'U — user-mode e2e, ONE run, REAL dollars');
  console.log(`  spec     jobs/${target.spec}  $${spec.budgetUsd}  wall ${WALL_LABEL}  strikeLimit=${STRIKE_LIMIT} (step ladder + close-fix progress rule)`);
  console.log(`  patient  ${WORKDIR} @ ${SEED.slice(0, 12)}`);
  console.log(`  goal     "${spec.goal}"`);
  if (dead) {
    const rs = dead.restart;
    console.log(`  spine    ${deadSpineFile}  → stopped on ${dead.endOutcome ?? 'a halt'}`);
    console.log(`  spent    ${dead.spendComplete ? '' : '≥'}$${rs.priorSpentUsd.toFixed(4)} and ${(rs.priorWallMs / 60000).toFixed(1)}min before the halt — FOLDED IN, so this restarts on the REMAINDER`);
    console.log(`  left     $${(spec.budgetUsd - rs.priorSpentUsd).toFixed(4)} of $${spec.budgetUsd}${WALL_MS === null ? '' : ` and ${(/** @type {number} */ (RESUME_WALL_MS) / 60000).toFixed(1)}min of ${WALL_MS / 60000}min`}`);
    // WHERE it picks up. Without this line "resume" covers two runs that cost very
    // different amounts — one that re-scouts and re-drafts from nothing, and one that
    // re-enters at the close — and the hash being signed authorizes the dollars either way.
    const sd = rs.seed;
    if (!sd) console.log('  at       the beginning — it halted before a plan was accepted, so nothing paid is re-payable');
    else if (sd.phase === 'close') console.log(`  at       the close and its fix loop — all ${sd.plan.steps.length} step(s) are done and are SKIPPED; the close re-runs for no tokens`);
    else console.log(`  at       step ${sd.completedSteps.length + 1} of ${sd.plan.steps.length} ${JSON.stringify(sd.plan.steps[sd.completedSteps.length]?.id ?? '(unknown)')} — ${sd.completedSteps.length} already finished and SKIPPED, not re-paid`);
    if (sd) console.log('           the plan is reloaded from that run\'s own spine: no re-scout, no re-draft');
    console.log('  patient  continued AS THE RUN LEFT IT — NOT reset to the seed');
    // The commonest resume there will ever be is the one straight after a money cut,
    // and on THAT spine the remainder is zero or negative by definition — the run
    // halted because the allowance was gone. Signing this hash unchanged buys an
    // immediate re-halt. A minus sign three lines up is not a warning; this is.
    const moneyLeft = spec.budgetUsd - rs.priorSpentUsd;
    const timeLeft = RESUME_WALL_MS;
    if (moneyLeft <= 0 || (timeLeft !== null && timeLeft <= 0)) {
      console.log('  ⚠ NOTHING LEFT — this run halted because its allowance ran out, and nothing here refills it:');
      if (moneyLeft <= 0) console.log(`            budgetUsd $${spec.budgetUsd} is already spent (${moneyLeft < 0 ? `over by $${(-moneyLeft).toFixed(4)}` : 'exactly'})`);
      if (timeLeft !== null && timeLeft <= 0) console.log(`            maxWallMs ${/** @type {number} */ (WALL_MS) / 60000}min is already burnt`);
      console.log(`            RAISE the number(s) in jobs/${target.spec} first — that is a spec edit, so the hash below changes and you sign the new one. Resuming as-is re-halts immediately for a close precheck's worth of nothing.`);
    }
    if (dead.specHash && dead.specHash !== specHash) {
      console.log(`  NOTE     the halted run was signed under ${dead.specHash.slice(0, 12)}… and this spec hashes to ${specHash.slice(0, 12)}…`);
      console.log('           that is what a TOP-UP looks like: budgetUsd is in the hash, so raising it is a spec edit you sign below. The reloaded plan is re-validated against THIS spec and refused by name if it no longer fits.');
    }
  }
  console.log(`  hash     ${specHash}`);
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-u.mjs --job ${jobKey}${dead ? ` --resume ${RESUME}` : ''} --approve ${specHash}`);
  process.exit(arg('approve') === null ? 0 : 1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)'); process.exit(2); }

const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', target.spine);
mkdirSync(spineDir, { recursive: true });
const runid = Date.now().toString(36);
const spineFile = join(spineDir, `u-${runid}.jsonl`);

const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
if (dead) {
  // A RESUME is the OPPOSITE case from a cold launch: the halted run's edits are work
  // this budget already paid for, and resetting them would throw away exactly what
  // resume exists to keep. A dirty tree is what a resume expects to find. Only a MOVED
  // HEAD stops it — nothing in a run commits, so that means a human did, and the
  // reconstruction's premise (this tree is where the run left it) no longer holds.
  // The `.litectx` store is kept for the same reason: it is paid indexing, and the
  // COLD-MEANS-COLD reset below is about a fresh baseline, which this is not.
  const gate = resumeTreeGate({ head: git(['rev-parse', 'HEAD']), seed: SEED, dirty: git(['status', '--porcelain']) });
  if (!gate.ok) {
    console.error(`PATIENT REFUSED — ${gate.detail}`);
    console.error('This is a decision for you, not the harness: reset and start fresh, or put HEAD back where the halted run left it and resume again.');
    process.exit(2);
  }
  console.log(`patient   ${gate.detail ?? 'clean — the halted run left no uncommitted work'} (store kept: it is indexing this run already paid for)`);
} else {
  // the patient starts at the seed, every time — a run that inherits the previous
  // run's edits is measuring the wrong thing
  git(['reset', '--hard', SEED]);
  git(['clean', '-fd']);
  // COLD MEANS COLD (P design record): the isolate verbs (stash/remember) persist in
  // .litectx across runs — an uncleaned store would leak run N's memory into run N+1's
  // "cold" baseline and quietly poison every contrast (the reuse rung's OFF arm above
  // all). The store is a derived, self-healing cache by litectx's own contract; the
  // re-index it costs is ~65s under yield. When the reuse rung lands, KEEPING the
  // store becomes an explicit ledger-attributed choice — never a leak.
  rmSync(join(wd, '.litectx'), { recursive: true, force: true });
  console.log(`patient reset — clean at ${git(['rev-parse', '--short', 'HEAD'])}, store cold`);
}

const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];
const provider = new AnthropicProvider({ apiKey, model: MODEL });
// P: the per-step model-tier factory. The TIER menu is signed in the plan schema
// (STEP_MODELS); the tier->model mapping is the RUNNER's territory, here. haiku
// takes no output_config.effort (provider-gated, battery rule) - nothing to gate
// yet since neither tier sets effort params.
const TIER_MODELS = DEFAULT_TIER_MODELS;
/** @type {Record<string, any>} */
const tierCache = {};
const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] === MODEL ? provider : new AnthropicProvider({ apiKey, model: TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] }));

const started = Date.now();
console.log(`\n== U run ${runid} ==  $${spec.budgetUsd} · ${WALL_LABEL} · ${MODEL}`);

// F67 — the OUTSIDE watchdog, started before the run and sharing nothing with it.
// Every guard bareloop had lived inside this process, and ms3197n8/ms3jh76q proved
// that is exactly where they cannot help: 274min and 81.5min of total silence, the
// in-process fuse never running because whatever froze the run froze its timers
// too. This one is a separate process holding one file's mtime and a pid.
// `unref()` so it can never keep a finished run alive.
// The STALE window is sized above the worst LEGAL spine silence, which is the
// CLOSE, not the worker: runStages emits nothing between stages (the close
// runner is async since the F68 fix, but its spine silence is unchanged), so a
// legal close can be
// silent for up to closeTimeoutMs × stages. The default 600s window against a
// 900s-per-stage cap would kill a live verdict mid-close — the exact damage the
// wall grace exists to prevent, on the trigger the grace never covered.
// The WALL's grace is the SAME arithmetic, and it must be passed: the watchdog's
// own default is one stage (900s), so a 4-stage close left on the default put the
// outside deadline at wall+15min while a legal close can still be mid-verdict at
// wall+60min — the guard could destroy a live verdict. This is the one number that
// keeps the outside deadline equal to the deadline the run's own clock enforces
// (src/clock.js: maxWallMs + closeStages × closeTimeoutMs).
// A legacy object-form close (the locked verdict classes, job.js) is ONE stage —
// `spec.close.length` on it is `undefined`, and NaN flags would have disarmed both
// windows silently.
const closeStages = Array.isArray(spec.close) ? spec.close.length : 1;
const worstCloseSilenceMs = CLOSE_TIMEOUT_MS * closeStages;
// `fileURLToPath`, not `.pathname`: a URL keeps its path percent-ENCODED, so a repo
// checked out under a directory with a space (or any of `#?%`) hands spawn a path
// containing `%20` that does not exist, and the guard dies at startup on the one run
// it was meant to protect. Same spelling the sibling scripts use.
const watchdog = spawn(process.execPath, [
  fileURLToPath(new URL('./u-watchdog.mjs', import.meta.url)),
  '--spine', spineFile,
  '--pid', String(process.pid),
  '--stale-ms', String(worstCloseSilenceMs + 600_000),
  // omitted entirely on an unbounded spec (see WALL_MS above): the watchdog's own
  // startup line then says "no wall", so the choice is loud on BOTH sides of the
  // process boundary and the STALE trigger — which needs no wall — stays armed.
  // On a RESUME this is the REMAINDER, not the signed total: the run's own clock
  // starts at `priorWallMs`, so arming the outside guard for the whole wall again
  // would put the two deadlines minutes apart and leave the guard unable to fire in
  // time on exactly the run it is watching (F70's shape).
  ...(RESUME_WALL_MS === null ? [] : ['--wall-ms', String(RESUME_WALL_MS)]),
  '--grace-ms', String(worstCloseSilenceMs),
], { stdio: ['ignore', 'ignore', 'inherit'] });
// A spawn failure arrives as an EVENT, and an unhandled 'error' on a ChildProcess is
// an uncaught exception — i.e. a guard that could not start would END the paid run it
// exists to protect, at second zero. The run must continue UNGUARDED and say so:
// losing the outside guard is a degraded run (the in-process fuses and the money cap
// still bound it), losing the run is a wasted budget. Loud, because a reader must
// never later mistake a missing watchdog marker for "the guard was watching and never
// fired".
watchdog.on('error', (e) => {
  console.error(`\nWATCHDOG FAILED TO START (${e.message}) — this run is UNGUARDED from outside: a frozen event loop will NOT be reaped (F67). The run continues under its own fuses, wall clock and money cap.`);
});
watchdog.unref();

// WHERE-was-the-freeze sampler. ms3jh76q froze its event loop for 81.5min and the
// spine could not say where — a frozen loop emits nothing, by construction. This
// timer is delayed exactly as long as any block; when it finally fires it records
// how late it ran, which brackets the freeze in time. Diagnostic sidecar only:
// nothing in the run reads it, and it decides nothing (the arbiter is untouched).
// Coverage split with the watchdog: blocks that END show up here; a block long
// enough for the watchdog's stale kill dies mid-freeze and is localized by the
// marker + the last spine event instead. Both windows are covered, by different
// instruments.
const LAG_POLL_MS = 1_000;
const LAG_RECORD_MS = 3_000; // healthy gaps measured in ms; litectx's sync index blocked ~18s
const lagFile = `${spineFile}.lag.jsonl`;
let lagDue = Date.now() + LAG_POLL_MS;
const lagTimer = setInterval(() => {
  const now = Date.now();
  const blockedMs = now - lagDue;
  if (blockedMs >= LAG_RECORD_MS) {
    const rec = { blockedMs, from: new Date(now - blockedMs).toISOString(), until: new Date(now).toISOString() };
    try { appendFileSync(lagFile, `${JSON.stringify(rec)}\n`); } catch { /* best-effort — a diagnostic must never kill the run */ }
  }
  lagDue = now + LAG_POLL_MS;
}, LAG_POLL_MS);

let outcome;
try {
  outcome = await runJob(spec, {
    approvals, workdir: wd, provider, providerFor, emit: makeSpine(spineFile),
    shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, strikeLimit: STRIKE_LIMIT, closeTimeoutMs: CLOSE_TIMEOUT_MS,
    // RESUME: the money and the wall the halted run already burned are FOLDED IN (so
    // the signed ceiling cannot widen by being re-invoked), and the checkpoint it
    // reached is handed over so the plan is reloaded rather than re-drafted and the
    // finished steps are skipped rather than re-paid.
    ...(dead ? {
      priorSpentUsd: dead.restart.priorSpentUsd,
      // and whether that fold was EXACT — a floor stays a floor across the resume (F6)
      priorSpendComplete: dead.restart.priorSpendComplete,
      priorWallMs: dead.restart.priorWallMs,
      ...(dead.restart.seed ? { resumeSeed: dead.restart.seed } : {}),
    } : {}),
  });
} finally {
  // the guard outlives the run only by accident, never by design
  try { watchdog.kill('SIGKILL'); } catch { /* already gone */ }
  clearInterval(lagTimer);
}
const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);

// ── the read. Facts only: what happened, what it cost, and whether the record is
// honest. No classification into pass/fail buckets — one run classifies nothing.
const raw = readFileSync(spineFile, 'utf8');
const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const je = events.findLast((e) => e.type === 'job-end');
// the ONE spelling of the text-side scan (src/validate.js) — a hand-rolled copy
// here would be the ninth, and one that misses a shape leaks on the very output
// it guards. Only the COUNT is ever read out; the matches themselves stay here.
const leaks = scanSecrets(raw);
// the ACCEPTED plan (a replan emits its own) — plan-validate carries verdicts, not the plan
const plan = events.findLast((e) => e.type === 'plan-accepted')?.plan ?? null;

const auditSrc = join(wd, 'gate-audit.jsonl');
let auditFile = null;
if (existsSync(auditSrc)) { auditFile = join(spineDir, `u-${runid}-gate-audit.jsonl`); renameSync(auditSrc, auditFile); }
const audit = auditFile ? readFileSync(auditFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const writes = audit.filter((e) => e.decision === 'allow' && (e.action?.type === 'write' || e.action?.type === 'edit'));

console.log(`\noutcome   ${outcome}`);
console.log(`spent     ${je?.spentUsd == null ? 'UNKNOWN' : `${je.spendComplete === false ? '≥' : ''}$${je.spentUsd.toFixed(4)}`} of $${spec.budgetUsd}`);
console.log(`wall      ${elapsedMin}min of ${WALL_LABEL}`);
console.log(`rounds    ${events.filter((e) => e.type === 'worker-round' && e.kind === 'turn').length}`);
console.log(`writes    ${writes.length} allowed (${new Set(writes.map((e) => e.action?.path)).size} distinct files)`);
console.log(`plan      ${plan ? `${plan.steps?.length ?? '?'} steps` : 'none validated'}`);
console.log(`checks    ${events.filter((e) => e.type === 'check-run').length} runs · menu [${events.find((e) => e.type === 'check-menu')?.offered?.join(', ') ?? '-'}]`);
// the close as JUDGED FIRST, then whether the fix loop had to run. Printing only
// the last outer-close reads as "close red" next to "outcome green" — the record
// must not make the reader reconcile two numbers that mean different things.
const oc = events.findLast((e) => e.type === 'outer-close');
const fixed = events.some((e) => e.type === 'fix-loop');
console.log(`close     first judgment ${oc?.verdict ?? '-'}${oc?.stage ? ` (stage ${oc.stage})` : ''}${fixed ? ` → fix loop ran → ${outcome}` : ''}`);
console.log(`replan    ${events.some((e) => e.type === 'replan') ? 'YES' : 'no'}`);
for (const e of events.filter((x) => x.type === 'escalation')) console.log(`ESCALATION ${e.category}: ${(e.decision ?? '').slice(0, 160)}`);
// v1.46 §2 — the MONEY halt reads out like the wall's: the verdict that STANDS, the
// per-stage trend that says which lever fits, and the three levers themselves. The
// run pauses decision-ready; nothing here adjusts a budget, and nothing here relaunches.
const mh = events.findLast((e) => e.type === 'money-halt');
if (mh) {
  console.log(`\nMONEY HALT — the cap cut the run at $${mh.remainingUsd?.toFixed?.(4) ?? '?'} left of $${mh.budgetUsd}. The verdict already minted STANDS: ${mh.verdict ?? 'unknown'}${mh.stage ? ` at stage "${mh.stage}"` : ''}.`);
  console.log(`  trend   ${mh.trend} — ${mh.reading}`);
  console.log(`  lever   ${mh.lever}`);
  for (const o of mh.options ?? []) console.log(`          · ${o}`);
  console.log(`  resume  node scripts/run-u.mjs --job ${jobKey} --resume ${runid} --approve <the NEW hash after you edit budgetUsd>`);
  console.log('          (the top-up is yours to sign — nothing in the run may widen its own budget)');
}
// A leak is the HARD LINE broken, not a note in the margin: an advisory that
// prints a count and then exits 0 while still writing the bridge is a guard in
// name only. On any hit the run fails LOUD (non-zero) and the bridge is NOT
// written — a spine carrying a secret must never graduate into a reusable
// artifact that outlives the run. Count and PATH only, never the matched
// content: echoing the secret to stdout/CI logs is the same leak, one hop on.
if (leaks.length) {
  console.log(`\nSPINE LEAK: ${leaks.length} secret-shaped strings in ${spineFile} — the hard line is broken; BRIDGE NOT WRITTEN`);
  process.exitCode = 3; // distinct from 2 (operator/config) and 1 (stale --approve)
}

// the BRIDGE: on a green the agent's own plan is kept as the reusable artifact
if (outcome === 'green' && plan && !leaks.length) {
  // one file PER GREEN, never one file per job: two cold runs of this job produced
  // two DIFFERENT plans that both green (run 1: 3 steps, run 3: 2 steps), so a
  // single `bridge-<job>.json` silently destroys the earlier bridge. WHICH bridge
  // gets offered for reuse is a selection question the reuse rung answers
  // (PRD v1.34 item 3) — the runner must not answer it by clobbering.
  // `spec.job` is operator-authored JSON reaching a filesystem path here, so it is
  // checked AT THE USE SITE rather than trusted from a distance. Same spelling as
  // the shipped validator's SLUG_RE (src/job.js) — deliberately not a second,
  // looser alphabet: `.` would admit `..` and walk out of spineDir. In practice
  // validateJob reds a non-slug job before any green exists, so this is a boundary
  // assertion, not the primary defence; it REJECTS rather than rewrites because a
  // malformed job name is an operator mistake to surface, not to silently mask.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec.job)) throw new Error(`spec.job ${JSON.stringify(spec.job)} is not a kebab-case slug — refusing to build a bridge filename from it (jobs/${target.spec})`);
  const bridgeFile = join(spineDir, `bridge-${spec.job}-${runid}.json`);
  writeFileSync(bridgeFile, `${JSON.stringify({ job: spec.job, specHash, runid, greenAt: new Date().toISOString(), plan }, null, 2)}\n`);
  console.log(`\nBRIDGE saved — ${bridgeFile}`);
  console.log('  the next run of this shape reuses this plan instead of starting cold');
}
// F67: if the outside guard fired, say so HERE rather than leaving the reader to
// reconcile a truncated run against a file they don't know exists. (A kill it
// completed leaves no readout at all — the marker beside the spine IS the record.)
if (existsSync(`${spineFile}.watchdog.json`)) {
  const m = JSON.parse(readFileSync(`${spineFile}.watchdog.json`, 'utf8'));
  console.log(`\nWATCHDOG   fired: ${m.reason} — the run was stopped from OUTSIDE, not by its own governance`);
}
// event-loop freezes the run survived — the sampler's record of WHERE the loop was blocked
if (existsSync(lagFile)) {
  const lags = readFileSync(lagFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const worst = lags.reduce((a, b) => (b.blockedMs > a.blockedMs ? b : a));
  console.log(`\nLOOP FROZE ${lags.length}x — worst ${(worst.blockedMs / 1000).toFixed(1)}s, ${worst.from} → ${worst.until} (${lagFile})`);
}
console.log(`\nspine     ${spineFile}`);
console.log(`patient   left AS THE RUN LEFT IT (read it before the next run resets to the seed)`);
