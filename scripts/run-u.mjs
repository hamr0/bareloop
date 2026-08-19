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
import { readShimArm } from '../src/readshim.js';
import { closeStagesOf } from '../src/plan.js';
import { makeSpine } from '../src/spine.js';
import { scanSecrets, redactSecrets } from '../src/validate.js';
// the three doors' SEMANTICS live in the library; this script surfaces them
import { normalizeHumanRuling, resolveHumanRuling } from '../src/kinds.js';
// SOFTGREEN — the judged stage's PINNED tier. The constant is the library's; a
// spelling here would be a second pin that can drift from the one the gate calibrated.
import { JUDGE_MODEL } from '../src/judged.js';
// --resume reads the halted run's own spine back through the SAME reader the reuse
// path uses (never a second one) and keeps its patient the way it left it.
import { readResume, resumeTreeGate, checkpointAgeGate, writeRunGreenRow, CHECKPOINT_OUTCOMES, PAUSE_TTL_MS } from '../src/reuse.js';
import { loadRegistry } from '../src/bridges.js';
import { HITL_PAUSE } from '../src/declaredclose.js';
// the REVIEW DOOR (module 8): the library opens it on the run's own spine, and this
// is the seam that answers one. Same rulebook, one level out.
import { answerReviewDoor, doorRecordOf, doorAgeGate } from '../src/reviewdoor.js';
// the cold reset, shared with the battery drivers so "cold" has one spelling
import { coldReset } from './u-patient.mjs';
// the banner's wall arithmetic, extracted so it is reachable by a test (F83): the
// end-of-run readout sits past the approval gate, so nothing could ever drive it here
import { wallLine, doomedResume, deathAtOf, evidencePackage, doorLines, resumeAtLines, reviewDoorPackage, runDoorLines } from './u-readout.mjs';

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
  // the first AUTHORED close (closeDecl, not a hand-written close script) — the
  // sign-and-run e2e: same patient/seed as 'pulselog-types', close declared by the
  // authoring interview (run msmsy579) instead of by hand.
  'pulselog-author-types': {
    spec: 'pulselog-author-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/pulselog-author-live',
    spine: 'pulselog-author-live-bareloop',
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
  // N4's hitl PROVING job (build plan §Proving; hamr's ruling, 2026-08-13). The job
  // has been dark since 507adbb deleted the legacy `steps[]` path its old spec was
  // written against, and it comes back as a plan-flow job with an AUTHORED close.
  //
  // `jobs/litectx-maintainer.json` DOES NOT EXIST, and this row does not create it:
  // the spec is authored live through scripts/run-interview.mjs → run-author.mjs and
  // signed by hamr, goal and answers included. Until it lands the runner refuses by
  // name (see the spec read below) — a row is the runner's half of a job, never the
  // signer's. The patient is a COPY at the convention this table already uses, and
  // the seed is that copy's own HEAD (litectx v0.32.0, 115213d).
  'litectx-maintainer': {
    spec: 'litectx-maintainer.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/litectx-maintainer',
    spine: 'litectx-maintainer-bareloop',
    seed: '115213dcb4c9f468c1045a212e6802456ed9119e',
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
/** every operator/config stop this script makes, in one exit code. Declared HERE,
 * above the first thing that can refuse (the job table's own spec file), rather than
 * beside the resume gates it used to sit with. */
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };
// --model picks the DEFAULT worker tier (runner territory — the spec names no model, so
// the signed hash is unaffected). Tier names, not model ids. This map is the OPERATOR's
// and is deliberately WIDER than the planner's menu: since 2026-08-06 `STEP_MODELS` is
// sonnet-only (the haiku attribution probe — see src/plan.js), so a PLAN can no longer
// say haiku while `--model haiku` still can. haiku takes no output_config.effort
// (provider-gated, battery rule) — nothing to gate yet since neither tier sets effort.
// PRD v1.36 floor: the drafter/default tier is sonnet MINIMUM — measured, a haiku
// drafter died plan-red twice on the same rejection (ms7gne7s). `--model haiku` runs
// BELOW the floor: an explicit operator probe whose rows are probes, never battery
// evidence.
const DEFAULT_TIER_MODELS = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' };
const tierArg = arg('model') ?? 'sonnet';
const MODEL = DEFAULT_TIER_MODELS[/** @type {keyof typeof DEFAULT_TIER_MODELS} */ (tierArg)];
if (!MODEL) { console.error(`unknown --model "${tierArg}" — one of: ${Object.keys(DEFAULT_TIER_MODELS).join(', ')}`); process.exit(2); }
// --read-shim picks the READ SHIM's ARM (src/readshim.js, Phase 2 A0/A1/A2/A3). Runner
// territory exactly like --model: the spec names no shim, so the signed hash is
// unaffected, and the default is OFF — the flag stays OFF regardless of the Phase 2
// outcome (the prereg's own "what this experiment does NOT claim"), so a default here
// would flip a decision that is hamr's alone.
//
// The arm NAMES are the operator's spelling; `readShimArm` is the one resolver, and it
// THROWS on anything it does not recognise (BA-4 param-guard class) before a token is
// spent — a row that silently ran the wrong arm is worse than a row that refused.
const READ_SHIM_ARM_NAMES = /** @type {Record<string, boolean|'cap'|'diff'>} */ ({
  A0: false, off: false, false: false,
  A1: 'cap', cap: 'cap',
  A2: 'diff', diff: 'diff',
  A3: true, all: true, true: true,
});
const shimArg = arg('read-shim');
if (shimArg !== null && !Object.prototype.hasOwnProperty.call(READ_SHIM_ARM_NAMES, shimArg)) {
  console.error(`unknown --read-shim "${shimArg}" — one of: ${Object.keys(READ_SHIM_ARM_NAMES).join(', ')}`);
  process.exit(2);
}
const READ_SHIM = shimArg === null ? false : READ_SHIM_ARM_NAMES[shimArg];
// resolve it HERE, at argv, not at runJob: the throw must land before the approval
// gate, the patient reset and the provider, not three hundred lines and one API key later.
const READ_SHIM_LEVERS = readShimArm(READ_SHIM);
const READ_SHIM_LABEL = shimArg === null
  ? 'read shim OFF (A0 — default; the flag is not flipped by any experiment)'
  : `read shim ${shimArg} -> ${JSON.stringify(READ_SHIM)} (cap ${READ_SHIM_LEVERS.cap} · pointer ${READ_SHIM_LEVERS.pointer} · diff ${READ_SHIM_LEVERS.diff} · G1 ${READ_SHIM_LEVERS.g1})`;
/** every re-invocation this script PRINTS carries the arm. A resume that drops it runs
 * A0 while being filed under the arm it was launched with — a silently mislabelled row
 * is the one failure the arm resolver's throw cannot catch. */
const SHIM_TAIL = shimArg === null ? '' : ` --read-shim ${shimArg}`;

const jobKey = arg('job') ?? 'aurora-spawner';
const target = JOBS[/** @type {keyof typeof JOBS} */ (jobKey)];
if (!target) { console.error(`unknown --job "${jobKey}" — one of: ${Object.keys(JOBS).join(', ')}`); process.exit(2); }
const WORKDIR = target.workdir;
const SEED = target.seed;
// THE SPEC IS THE OTHER HALF, AND IT MAY NOT BE THERE YET. A row in the table above
// is the RUNNER's half of a job — the patient, its seed, where the spine goes. The
// spec is the SIGNER's half: it is authored (scripts/run-interview.mjs →
// scripts/run-author.mjs) and signed, and nothing here may invent one. A row whose
// spec has not been authored yet used to die on `readFileSync`'s ENOENT stack, which
// reads as the runner being broken rather than as the job being unauthored.
const specPath = fileURLToPath(new URL(`../jobs/${target.spec}`, import.meta.url));
if (!existsSync(specPath)) {
  die(`--job ${jobKey}: there is no spec at ${specPath}.\n`
    + '  The table row is the runner\'s half of a job (patient, seed, spine); the SPEC is yours — authored through\n'
    + `  scripts/run-interview.mjs and scripts/run-author.mjs, then signed. Nothing here can stand in for it: a job\n`
    + '  with no spec has no goal, no close, no budget and no hash to approve.');
}
let spec;
try { spec = JSON.parse(readFileSync(specPath, 'utf8')); } catch (e) {
  die(`--job ${jobKey}: ${specPath} is not readable JSON (${e.message}) — a spec nobody can parse is a spec nobody signed`);
}
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

// ── --resume: continue a run its own MONEY (or TIME) cap — or a STALL — stopped ──
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
/** the terminals that are a checkpoint rather than a verdict — THE LIBRARY's set
 * (`CHECKPOINT_OUTCOMES`, src/reuse.js), not this script's own.
 *
 * It used to be a literal here, and N4 is what made that untenable: a fourth
 * checkpoint (`hitl-pause`) had to be added in two places at once, and the
 * exported bundle (PRD v1.44 §2 — a thin runner with bareloop as a dependency)
 * would have needed a third copy. `readResume` still takes the list as a
 * PARAMETER and still defaults to empty — that default is what the reuse loop's
 * graded-row semantics depend on — so what moved is the canonical ANSWER, not
 * the seam. Same reasoning that put the pause TTL in the library (OPEN-2, hamr,
 * 2026-08-13).
 *
 * Nothing else is resumable — a green is done, and a red is an answer.
 *
 * The first two are governance halts: an operator-owned allowance ran out with the
 * work on disk.
 *
 * `step-stalled` (hamr's go, 2026-08-13) is the third, and it is not an allowance
 * stop — it is the one terminal whose OWN escalation already tells the operator to
 * *"retry the run"* (src/planrun.js) while this runner answered "start a fresh run"
 * and threw away every finished step's spend. Two shapes reach it and resume is the
 * right answer to both: the plain stall (the model stopped producing rounds and the
 * reissue did not recover it — nothing about the work on disk is wrong), and the
 * edge that named this fix, where a stall trips WITH time left, becomes a replan
 * trigger, and the replan gate declines to fund a cycle past the deadline — the run
 * then rides out as `step-stalled` rather than `wall-halt` and lost the checkpoint a
 * wall stop would have kept. The NAME deliberately stays `step-stalled` (src/run.js
 * keys the F44 spend FLOOR on that outcome), so the fix is exactly this: widen which
 * terminals are read as a checkpoint, rename nothing.
 *
 * The floor rides along honestly — a stalled run's `spendComplete:false` reaches the
 * preview's fold as `≥$x` and `runJob` as `priorSpendComplete:false`, so the resumed
 * leg's own terminal stays a floor too rather than healing an unknown by inheriting it.
 *
 * `hitl-pause` (N4 §1.6) is the fourth, and the only one whose missing allowance is a
 * PERSON: the run reached the one stage a machine cannot render and stopped with its
 * work, its plan and its money exactly where they were. Answering it needs `--decide`
 * (below); every other entry here resumes on the hash alone. */
const RESUMABLE_HALTS = CHECKPOINT_OUTCOMES;

// ── THE THREE DOORS (N4, 2026-08-12 §1) — the hitl surface, at the terminal ──
//
// There is no interactive surface anywhere in this repo and there is not going to
// be one here: paid runs launch setsid-detached under `systemd-inhibit`, so a
// process blocking on stdin would block on a terminal nobody is watching. "Three
// buttons" is therefore a PAUSE plus a re-invocation — the run stops
// decision-ready, the person reads the evidence package, and their answer comes
// back as a flag on the resume that continues it.
//
// SIGNER-ONLY (ruling 4): the only signer proof this repo has is the spec-hash
// approval, so the decision rides that same gate rather than inventing a second
// identity mechanism. A decision without the matching hash never reaches `runJob`.
//
// The SEMANTICS are the library's (`normalizeHumanRuling`, src/kinds.js): three
// doors and no fourth, and a `rerun` whose text is the whole of what the fix
// worker will be given. This script asks that function and prints its refusal —
// a second rulebook here is how a runner comes to admit what the run refuses.
const DECIDE = arg('decide');
const TEXT = arg('text');

// ── THE REVIEW DOOR (softgreen module 8, PRD v1.71 §3) — the same three doors,
// one level out: at the END of a run rather than at a stage inside the close.
//
// `--door <runid>` answers a FINISHED run's door; `--resume` continues a HALTED
// one. They are different runs in different states and are refused together
// rather than merged, because a merge would have to pick which question the
// operator meant.
//
// `--review-door` is the OPT-IN half, and it is the one operator-facing default
// this module has: a soft-green run opens its door unasked (its credit is held
// until a person accepts, and nothing else releases it), and a green-class run
// behaves exactly as it always has unless this flag is passed. PRD v1.71 §3 says
// "the end of EVERY run" and also that a green door is NON-BLOCKING; the reading
// that changes an existing job's spine without being asked is hamr's to pick, and
// flipping it is one line in `REVIEW_DOOR_CLASSES` (src/kinds.js).
const DOOR = arg('door');
const REVIEW_DOOR_ON = process.argv.includes('--review-door');
if (DOOR !== null && RESUME !== null) {
  die('--door answers the review door of a run that FINISHED; --resume continues one that HALTED. Those are two '
    + 'different runs in two different states — give one.');
}
if (DECIDE !== null && RESUME === null && DOOR === null) {
  die('--decide answers a PAUSED run (--resume) or a finished run\'s REVIEW DOOR (--door), and there is neither here. '
    + 'A decision is an answer to something that already exists — there is nothing for it to rule on at the start of a fresh run.');
}
// A door that carries no text REFUSES the flag rather than dropping it. Silently
// discarding words a person typed is worse than refusing them: they would believe
// they had said something, and nothing downstream would ever carry it.
if (TEXT !== null && DECIDE !== 'rerun') {
  die(`--text is for the rerun door: only a "rerun" carries text (the human's words ARE the gap the worker converts from). `
    + `${DECIDE === null ? 'No --decide was given at all.' : `This run was handed --decide ${DECIDE}, which takes none.`}`);
}
/** the signer's answer, normalised at the LIBRARY's seam, or null for every
 * ordinary run and for the leg that pauses. Never authored here, never defaulted,
 * never inferred. */
const RULING = (() => {
  if (DECIDE === null) return null;
  const norm = normalizeHumanRuling({ decision: DECIDE, ...(TEXT === null ? {} : { text: TEXT }) });
  if (!norm.ok) die(`--decide ${JSON.stringify(DECIDE)} is not a ruling this run can act on: ${norm.why}`);
  return norm.ruling;
})();
/** the patient's tree, and the spine directory beside it — derived ONCE, here, because
 * both the RESUME reader below and the live run further down need them. Two spellings of
 * one path is how `--resume` comes to read a different directory than the run writes. */
const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', target.spine);
/** `--resume` takes the runid (the conventional `<spine dir>/u-<runid>.jsonl`) or an
 * explicit path — the path form is what makes these gates testable without touching
 * an operator's real spine directory. */
const deadSpineFile = RESUME == null ? null
  : (RESUME.includes('/') || RESUME.endsWith('.jsonl') ? resolve(RESUME) : join(spineDir, `u-${RESUME}.jsonl`));
/** @type {any} */
let dead = null;
/** F102 — the decision this checkpoint HOLDS: an answer the person already gave, on
 * a leg that stopped before a single round was bought for it. Null on every ordinary
 * resume. It is applied directly and the ask is never re-rendered — the whole of the
 * finding is that the person paid for that decision once and must not pay again. */
let HELD = null;
/** the paused run's own `hitl-pause` record — the evidence package the LIBRARY
 * assembled (the ask, every mechanical stage's result, the changed set). Hoisted
 * out of the reader block because the preview below renders it, and re-deriving
 * the run's facts at the surface is how a screen comes to disagree with a spine. */
let pauseRecord = null;
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
  // WHEN did the dead leg stop? The watchdog's kill record is later, better evidence
  // than the last spine event for a run that was KILLED — and worse evidence for one
  // that ended itself, which is what N4's pause is. The preference order lives in
  // `deathAtOf` (scripts/u-readout.mjs) so it is reachable by a test; the hazard it
  // closes was measured, not imagined (a report dated after a pause bills the human's
  // deciding time to the run's wall and can zero the remainder outright).
  const deathAt = deathAtOf({ watchdogAt: watchdog?.at, events: deadEvents });
  dead = readResume(deadEvents, {
    direct: true,
    resumableOutcomes: RESUMABLE_HALTS,
    ...(deathAt === null ? {} : { deathAt }),
  });
  if (!dead.started) die(`--resume: ${deadSpineFile} carries no job-start — that is not a bareloop run's spine`);
  if (dead.job !== spec.job) die(`--resume: that spine is job "${dead.job}", not "${spec.job}" — a resume continues ONE job, and running another job's plan as this one's is a substitution nothing here is allowed to make`);
  if (dead.greened) die('--resume: that run already GREENED — there is nothing to resume.');
  if (dead.ended) die(`--resume: that run reached its own terminal (${dead.endOutcome}) — only a governance halt (${RESUMABLE_HALTS.join(' / ')}) leaves work to continue. Start a fresh run.`);
  if (!dead.restart) die(`--resume: ${deadSpineFile} has no attempt to continue — it never opened one.`);
  // ── THE PAUSE TTL (2026-08-12 §2): a hitl checkpoint is kept for 60 days.
  //
  // The rule and the number are the LIBRARY's (`checkpointAgeGate` / `PAUSE_TTL_MS`,
  // OPEN-2 as hamr ruled it) so the exported bundle inherits them; this reads its
  // answer and refuses. It sits HERE, with the spine gates, rather than beside
  // `resumeTreeGate` further down, for two reasons: an expired checkpoint must refuse
  // BEFORE the operator signs a hash for it, and the age gate needs no git — the
  // tree gate does, and that is why the tree gate is where it is.
  //
  // `applies:false` on every other terminal is the gate's own doing: ageing out a
  // cap-halt would be a governance change nobody ruled. An UNREADABLE stamp refuses
  // too (unknown is not young — F6), which is why this branches on `ok` and not on
  // an age comparison of its own.
  const age = checkpointAgeGate(deadEvents);
  if (!age.ok) {
    console.error(`CHECKPOINT EXPIRED — ${age.detail}`);
    console.error('The work is still on the run\'s own branch; what has expired is the DECISION, not the tree. The levers are yours:');
    console.error('  - start a fresh run against the current tree (the same hash, nothing to re-sign);');
    console.error(`  - or revise the goal/spec in jobs/${target.spec} — a spec edit, so the hash changes and you sign the new one;`);
    console.error('  - or abandon it and keep the verdict the paused run already minted.');
    process.exit(2);
  }
  // F102 — DOES THIS CHECKPOINT ALREADY HOLD AN ANSWER? A leg that received a
  // decision and stopped before a single round was bought for it left the person's
  // words on its own spine, and the reader carries them. Read BEFORE the two gates
  // below, because a held decision is precisely the case where the terminal is NOT a
  // pause and a decision is nonetheless outstanding — the state F102's resume could
  // not tell apart from "nobody has looked yet".
  HELD = dead.restart.pendingDecision ?? null;
  // and TWO ANSWERS TO ONE QUESTION is refused by the library's own resolver, so the
  // runner cannot admit what the run refuses (a second rulebook here is how those two
  // come apart). The message names the held decision: the operator has to know what
  // they would be overriding. An unreadable HELD record refuses through the same seam
  // rather than being repaired — a decision nobody can read is not one to act on.
  const resolved = resolveHumanRuling(RULING, HELD);
  if (!resolved.ok) {
    die(`${RULING === null ? `--resume: the held decision on ${deadSpineFile}` : `--decide ${RULING.decision}`}: ${resolved.why}`);
  }
  // A decision answers a PAUSE. Every other checkpoint here stopped on an allowance,
  // and nothing about it is waiting on a person — handing one a ruling would let an
  // `accept` mint a green over evidence nobody was ever shown. The library refuses a
  // ruling for a close with no human stage; this is the other half of the same
  // question, and only the runner can ask it (it is about WHICH checkpoint is being
  // answered, not about the close's shape). A HELD decision is deliberately exempt:
  // it was answered against a pause, on a leg that then died carrying it.
  if (RULING !== null && dead.endOutcome !== HITL_PAUSE) {
    die(`--decide ${RULING.decision}: that run stopped on ${dead.endOutcome ?? 'an unrecorded terminal'}, not at a human stage. `
      + 'A decision answers a pause — the run has to have asked you something before you can answer it. Resume it without a decision.');
  }
  pauseRecord = deadEvents.filter((/** @type {any} */ e) => e?.type === HITL_PAUSE).at(-1) ?? null;
}
// ── THE DOOR's own reader. A finished run's spine, its door record, and what it
// spent — the last of those because the signed budget is the CHAIN's ceiling and a
// rerun spends what REMAINS of it (F103's money half: time is fresh, money folds).
/** @type {string|null} */
const doorSpineFile = DOOR == null ? null
  : (DOOR.includes('/') || DOOR.endsWith('.jsonl') ? resolve(DOOR) : join(spineDir, `u-${DOOR}.jsonl`));
/** @type {any[]|null} */
let doorEvents = null;
/** @type {any} */
let doorRecord = null;
/** @type {{spentUsd: number, spendComplete: boolean}|null} */
let doorPrior = null;
if (doorSpineFile !== null) {
  if (!existsSync(doorSpineFile)) die(`--door: no spine at ${doorSpineFile} — a door belongs to a run that happened, and this one left no log`);
  let raw = '';
  try { raw = readFileSync(doorSpineFile, 'utf8'); } catch (e) { die(`--door: cannot read ${doorSpineFile}: ${e.message}`); }
  doorEvents = [];
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { /** @type {any[]} */ (doorEvents).push(JSON.parse(line)); } catch (e) {
      die(`--door: ${doorSpineFile} is corrupt at line ${i + 1} (${e.message}) — a decision made on a damaged record is a decision about a run nobody can read`);
    }
  });
  const start = doorEvents.find((/** @type {any} */ e) => e?.type === 'job-start');
  if (!start) die(`--door: ${doorSpineFile} carries no job-start — that is not a bareloop run's spine`);
  if (start.job !== spec.job) die(`--door: that spine is job "${start.job}", not "${spec.job}" — a door is answered against the spec that was signed for it`);
  // THE DOOR ITSELF. Its absence is a refusal and never an invented one: a run that
  // opened no door has a verdict standing on its own, and answering a door nobody
  // was shown the evidence for is the rubber stamp this whole class exists to stop.
  doorRecord = doorRecordOf(doorEvents);
  if (!doorRecord) {
    die(`--door ${DOOR}: that run opened no review door — its verdict (${doorEvents.findLast((/** @type {any} */ e) => e?.type === 'job-end')?.outcome ?? 'unrecorded'}) stands on its own and there is nothing here to dispose of.\n`
      + '  A soft-green run opens one always; a green-class run opens one only when the run was launched with --review-door.');
  }
  // …and the 60-day TTL, read HERE for the same reason the pause TTL is read with
  // the spine gates: an expired door must refuse BEFORE a hash is signed for it.
  const dage = doorAgeGate(doorRecord);
  if (!dage.ok) {
    console.error(`DOOR EXPIRED — ${dage.detail}`);
    console.error('That expiry IS what "cancel" used to be: the verdict the run minted stands, nothing graduated, and nobody had to decide.');
    console.error('  - start a fresh run against the current tree (the same hash, nothing to re-sign);');
    console.error(`  - or revise the goal/spec in jobs/${target.spec} — a spec edit, so the hash changes and you sign the new one.`);
    process.exit(2);
  }
  const je = doorEvents.findLast((/** @type {any} */ e) => e?.type === 'job-end');
  const spentKnown = typeof je?.spentUsd === 'number' && Number.isFinite(je.spentUsd);
  doorPrior = {
    spentUsd: spentKnown ? je.spentUsd : 0,
    // a FLOOR stays a floor across the door (F6): an absent FIGURE is never "complete
    // at $0" — completeness is only trusted when the number it completes is known
    spendComplete: spentKnown && je?.spendComplete !== false,
  };
}

/** is this resume the one a PERSON has to answer? Read off the recorded terminal,
 * never off the presence of a `--decide` — the whole point is that the flag is
 * absent on the first visit. */
const PAUSED = !!dead && dead.endOutcome === HITL_PAUSE;

/**
 * The LINE-level half of the evidence package (ruling 2). The library carries WHICH
 * files moved — the granularity it can state honestly from where it sits — and this
 * reads the lines themselves out of the patient.
 *
 * READ-ONLY and BEST-EFFORT, in that order. It runs in the preview, above the
 * approval gate, so it may never mutate a patient (no `add -N`, no index touch) and
 * it may never throw: a diff nobody can read is a missing SECTION of a readout, not
 * a failed resume. Its absence is NAMED rather than rendered as an empty diff, which
 * would read as "nothing changed" — the F6 direction that matters most here, since a
 * person is about to mint a green off what this shows them.
 *
 * The patient is read AS IT STANDS NOW, not as it stood at the pause: a checkpoint
 * lives 60 days and nothing freezes a tree. That is exactly why `accept` re-runs the
 * mechanical stages (OPEN-3) instead of trusting what the human read.
 * @param {string[]} paths the pause record's own changed set, used as a pathspec
 */
const DIFF_LINE_CAP = 200;
/** One renderer for the review screen's evidence, shared by the resume preview
 * and the fresh-pause terminal so the fallback rule cannot drift between them:
 * with a `hitl-pause` record, the package is the close's own ask + the diff of
 * what changed; without one, say so plainly (per-site wording) rather than
 * rendering the bare "approve?" ruling 2 forbids.
 * @param {any} pause @param {string[]} fallbackLines */
const printPauseEvidence = (pause, fallbackLines) => {
  if (!pause) {
    for (const l of fallbackLines) console.log(l);
  } else {
    const paths = Array.isArray(pause.changed?.paths) ? pause.changed.paths : [];
    for (const l of evidencePackage({ pause, diff: readDiff(paths) })) console.log(l);
  }
};

const readDiff = (paths) => {
  const run = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  try {
    // after `--`, so a path that starts with a dash is a PATH and never a flag
    const pathspec = paths.length ? ['--', ...paths] : [];
    // secrets are scrubbed through the ONE inventory (src/validate.js), never a
    // second spelling: a token sitting in a patient's diff must not be echoed onto
    // a terminal or into whatever log is capturing it.
    const raw = redactSecrets(run(['diff', '--unified=1', SEED, ...pathspec]));
    const all = raw.split('\n').filter((l, i, a) => !(l === '' && i === a.length - 1));
    const lines = all.slice(0, DIFF_LINE_CAP);
    const others = run(['ls-files', '--others', '--exclude-standard']).split('\n').map((s) => s.trim()).filter(Boolean);
    const untracked = paths.length ? others.filter((f) => paths.includes(f)) : others;
    return { lines, truncated: Math.max(0, all.length - lines.length), untracked, unavailable: null };
  } catch (e) {
    return {
      lines: [],
      truncated: 0,
      untracked: [],
      unavailable: `${wd} could not be read against the seed ${SEED.slice(0, 12)} (${redactSecrets(String(e?.message ?? e)).split('\n')[0]})`,
    };
  }
};
/** F103 — is THIS leg a fresh engagement? A rerun is: the person commissioned new
 * work at the moment they took the door, and they did not decide on the run's clock.
 * The reading comes from the library's one resolver, never a second spelling here.
 *
 * BOTH DOORS are handed to it. A `--decide rerun` on a `--door` reaches the library
 * as `doorRerun` rather than as a ruling (one flag, two questions), so it is passed
 * in that slot here too — the `DOOR_RERUN` record itself is only built further down,
 * after the library has answered the door, and a runner whose watchdog wall folded
 * while the run's own clock did not would be the two counters disagreeing again. */
const FRESH_ENGAGEMENT = resolveHumanRuling(
  RULING, HELD, DOOR !== null && RULING?.decision === 'rerun' ? RULING : null,
).fresh;
/** the restart runs on the REMAINDER of the signed wall, never a fresh allotment —
 * "a budget ceiling folds in prior spend so re-invoking cannot silently widen it",
 * in a time coat. Both the run's own clock and the outside watchdog read this one.
 *
 * F103 narrows where that is true. A RESUME of the same engagement folds, exactly as
 * it always has (W-2: a kill may never buy a second wall). A RERUN does not: `msx7a3rj`
 * took the door and inherited 87 seconds from a leg that had already ended, on a worker
 * measured to read nine rounds before its first write — not a short engagement, a
 * structurally impossible one, and it paid real money to find that out. MONEY still
 * folds on every path (the `left` line below): the signed budget is the chain's
 * ceiling, and a raise is a spec edit somebody signs. */
const RESUME_WALL_MS = WALL_MS === null || !dead ? WALL_MS
  : (FRESH_ENGAGEMENT ? WALL_MS : Math.max(0, WALL_MS - dead.restart.priorWallMs));

/** does the named registry HOLD a quarantined green row for this runid under this
 * workflow name? The door-preview's half of 2B: `quarantined` on the door record says
 * the credit is held, and THIS says whether there is a row to release — the same two
 * facts the run's own readout ANDs (`doorHere.quarantined && REGISTRY_ROW.minted`),
 * recovered here by lookup because a preview is a separate invocation. Read-only, $0,
 * fail-safe: no registry, an unreadable one, or no matching row all read as "nothing
 * to release", never as a promise.
 * @param {string|null} registryDir @param {string} name @param {string} runid */
function heldRowFor(registryDir, name, runid) {
  if (registryDir === null || registryDir === '') return false;
  return loadRegistry(registryDir).bridges.some((b) => b.name === name
    && (Array.isArray(b.history) ? b.history : []).some((h) => h.runid === runid && h.outcome === 'green' && h.quarantined === true));
}

// ── THE REVIEW DOOR's screen (module 8). Its OWN preview, deliberately not folded
// into the resume banner below: a door is answered about a run that is OVER, so
// none of that banner's arithmetic (what is left to resume with, which step it
// re-enters, whether the plan is doomed) is a true sentence here. What a person
// needs is the evidence, the three doors, and what each one costs.
if (doorSpineFile !== null && arg('approve') !== specHash) {
  console.log('U — REVIEW DOOR, answering a run that has already ended');
  console.log(`  spec     jobs/${target.spec}  $${spec.budgetUsd}  wall ${WALL_LABEL}`);
  console.log(`  run      ${DOOR}  ${doorPrior?.spendComplete === false ? '≥' : ''}$${(doorPrior?.spentUsd ?? 0).toFixed(4)} spent  ·  ${doorSpineFile}`);
  console.log(`  patient  ${WORKDIR} @ ${SEED.slice(0, 12)}`);
  console.log('');
  for (const l of reviewDoorPackage({
    door: doorRecord,
    diff: readDiff(Array.isArray(doorRecord?.changed?.paths) ? doorRecord.changed.paths : []),
  })) console.log(l);
  console.log(`\n  hash     ${specHash}`);
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  // THE PREVIEW MAKES THE SAME PROMISE THE RUN'S OWN READOUT DOES (2B), read the
  // same way: `quarantined` says the credit is HELD; whether there is anything to
  // RELEASE is answered by the registry, not the class. The run's readout answers
  // it off the row it just wrote; a preview is a separate invocation, so it asks
  // the named registry whether a held green row for this runid actually exists —
  // and the printed commands carry the registry forward, because an accept aimed
  // at no registry is the `no-row-for-run` refusal one hop later.
  const previewHeld = doorRecord?.quarantined === true && heldRowFor(arg('registry'), arg('workflow') ?? spec.job, DOOR);
  const previewRegistry = arg('registry') !== null ? ` --registry ${arg('registry')} --workflow ${arg('workflow') ?? spec.job}` : '';
  const doorInvoke = (/** @type {string} */ tail) => `  node scripts/run-u.mjs --job ${jobKey} --door ${DOOR}${tail}${previewRegistry} --approve ${specHash}`;
  console.log('');
  if (RULING === null) {
    for (const l of runDoorLines({
      rerun: doorInvoke(' --decide rerun --text "<what you want done differently>"').trim(),
      accept: doorInvoke(' --decide accept').trim(),
      pause: doorInvoke(' --decide pause').trim(),
      ttlDays: PAUSE_TTL_MS / 86_400_000,
      held: previewHeld,
    })) console.log(l);
    if (doorRecord?.quarantined === true && !previewHeld) {
      console.log('  (this run\'s credit is HELD and the named registry holds no green row for it'
        + `${arg('registry') === null ? ' — no --registry was named' : ''}, so an accept records a disposition and releases nothing)`);
    }
  } else {
    console.log(`  decision ${RULING.decision}${RULING.decision === 'rerun' ? ' — and these words become the requirement the fresh engagement plans against:' : ''}`);
    if (RULING.text !== null) for (const l of String(RULING.text).split('\n')) console.log(`           ${l}`);
    console.log(`\nTo approve and answer:\n${doorInvoke(` --decide ${RULING.decision}${RULING.text === null ? '' : ` --text ${JSON.stringify(RULING.text)}`}`)}`);
    if (RULING.decision === 'rerun') {
      console.log('\nA rerun COMMISSIONS WORK — launch it under a sleep inhibitor (a suspend freezes every guard, F72):');
      console.log('  systemd-inhibit --what=idle:sleep --why="bareloop u run" env <the command above>');
    }
  }
  process.exit(arg('approve') === null ? 0 : 1);
}

if (arg('approve') !== specHash) {
  console.log(dead ? 'U — RESUME, continuing a halted run, REAL dollars' : 'U — user-mode e2e, ONE run, REAL dollars');
  console.log(`  spec     jobs/${target.spec}  $${spec.budgetUsd}  wall ${WALL_LABEL}  strikeLimit=${STRIKE_LIMIT} (step ladder + close-fix progress rule)`);
  console.log(`  patient  ${WORKDIR} @ ${SEED.slice(0, 12)}`);
  console.log(`  shim     ${READ_SHIM_LABEL}`);
  console.log(`  goal     "${spec.goal}"`);
  // F87 — the goal must state everything the close will judge, and nothing derives
  // one from the other or checks them against each other. So the only defence is
  // that the person signing reads both halves AT ONCE: this gate printed the goal
  // and never the stages, and run-author printed the stages and never the goal.
  // Names and kinds only; the params and notes are the authoring surface's reading
  // (`scripts/author-readout.mjs`), and this one is about what the dollars below buy.
  // Through `closeStagesOf` — THE ONE STAGING (src/plan.js), the same derivation the
  // watchdog's stage count below already reads for the same reason. Gated on
  // `spec.closeDecl` this printed the stages for exactly ONE of the eleven shipped
  // specs: the other ten declare a command `close[]`, so the signer read the goal,
  // then the hash, and never the stages that judge it — the F87 half-reading this
  // block exists to end, reproduced by the block itself.
  // A command stage carries no `kind` (that is the DECLARATION's vocabulary), and it
  // is not a `command-exit` either — these stages gate on an exit code AND a judged
  // floor — so it renders as `command` rather than borrowing a kind name it has not
  // got. The spec here is read raw off disk and is not validateJob'd until runJob,
  // so a stage is rendered defensively: a malformed entry must not throw the gate.
  const stages = closeStagesOf(spec) ?? [];
  if (stages.length) {
    console.log(`  judged   ${stages.length} close stage(s) — this run is green only when EVERY one of them is, so the goal above has to name what they measure:`);
    for (const s of stages) console.log(`           ${s?.name ?? '(unnamed)'}  [${s?.kind ?? 'command'}]`);
  }
  if (dead) {
    const rs = dead.restart;
    console.log(`  spine    ${deadSpineFile}  → stopped on ${dead.endOutcome ?? 'a halt'}`);
    // D4a — SAY when the gate opened on a derivation rather than on the recorded name.
    // The operator is looking at a spine that says `step-red`; without this line the
    // resume reads as the gate having quietly stopped refusing.
    if (dead.wallDerivedHalt) {
      console.log('           recorded step-red RE-READ as wall-halt off this run\'s own wall-bounded record — the wall was crossed before it ended');
    }
    // the fold line says which of the two counters folds, per case: on an ordinary
    // resume BOTH do (unchanged), and on a decide-time rerun the money still does
    // while the wall does not (F103, spelled out in the `clock` line below).
    console.log(`  spent    ${dead.spendComplete ? '' : '≥'}$${rs.priorSpentUsd.toFixed(4)} and ${(rs.priorWallMs / 60000).toFixed(1)}min before the halt — ${FRESH_ENGAGEMENT ? 'the MONEY is FOLDED IN, so this spends the REMAINDER; the wall is not (below)' : 'FOLDED IN, so this restarts on the REMAINDER'}`);
    // F102 — SAY THAT THE ANSWER SURVIVED. Without this line the operator cannot
    // tell a resume that will act on their words from one that will ask again, and
    // that is the difference this whole rung exists for.
    if (HELD) {
      console.log(`  held     "${HELD.decision}"${HELD.text === null ? '' : ' — your own words, still the gap:'} answered ${HELD.receivedAt ?? 'at an unrecorded time'} and never paid for`);
      if (HELD.text !== null) for (const l of String(HELD.text).split('\n')) console.log(`           ${l}`);
      console.log('           this resume APPLIES it — you are not asked again (F102)');
    }
    // F103 — and say which clock this leg gets, because a rerun's is not the
    // remainder. The two counters are both printed rather than one number meaning
    // both: chain so far, and what this engagement may spend.
    if (FRESH_ENGAGEMENT && WALL_MS !== null) {
      console.log(`  clock    FRESH ENGAGEMENT — a rerun is new work you commissioned, so it opens on the full signed ${WALL_MS / 60000}min rather than on what the corrected leg left (F103)`);
      console.log(`           chain so far ${(rs.priorWallMs / 60000).toFixed(1)}min — reported, never a bound on work you have just asked for`);
    }
    console.log(`  left     $${(spec.budgetUsd - rs.priorSpentUsd).toFixed(4)} of $${spec.budgetUsd}${WALL_MS === null ? '' : ` and ${(/** @type {number} */ (RESUME_WALL_MS) / 60000).toFixed(1)}min of ${WALL_MS / 60000}min`}`);
    // WHERE it picks up. Without this line "resume" covers two runs that cost very
    // different amounts — one that re-scouts and re-drafts from nothing, and one that
    // re-enters at the close — and the hash being signed authorizes the dollars either way.
    // …through `resumeAtLines` (scripts/u-readout.mjs), because a PAUSE is a phase this
    // line did not have: it stops after the plan's steps, at the close's human stage, and
    // the step arithmetic used to walk off the end of the plan (`at step 2 of 1
    // "(unknown)"`). The rule the helper holds is that a step count may never exceed the
    // plan, and that the phase is said in words.
    for (const l of resumeAtLines({ seed: rs.seed, paused: dead.endOutcome === HITL_PAUSE })) console.log(l);
    // WHAT IT INHERITS as a trend baseline. Without this line the resumed run's
    // halt readout can name a direction the leg itself never measured, and a reader
    // has no way to tell that the number came from the leg before it.
    const gs = dead.restart.grades ?? [];
    // grouped PER STAGE and rendered `stage a → b`, the same spelling src/trend.js's
    // own readout uses — a second way of writing one series is a second way of reading
    // it, and the accuracy law is that a series belongs to one stage
    const byStage = new Map();
    for (const g of gs) {
      const k = g.stage ?? '(unstaged)';
      if (!byStage.has(k)) byStage.set(k, []);
      byStage.get(k).push(g.value);
    }
    if (gs.length) console.log(`  trend    ${gs.length} close grade(s) inherited as baselines (${[...byStage].map(([k, vs]) => `${k} ${vs.join(' → ')}`).join('; ')}) — the halt readout spans BOTH legs`);
    else console.log('  trend    no close grade to inherit — this leg\'s readout is judged on its own evidence');
    // WHAT IT INHERITS AS A BOUND. The line above is a readout the leg carries; this is
    // an allowance it does NOT get. A resumed leg that opens with both replans spent
    // can only exhaust the plan it reloads — it cannot redraw it — and that changes
    // what the dollars being signed here can buy. Stated only when there is something
    // to state: a "0 replans spent" line on every cold-ish resume is noise that trains
    // the eye to skip the line that matters.
    if (rs.replans > 0) {
      console.log(`  replans  ${rs.replans} already spent by this run — the ceiling is the RUN's (PRD v1.12), so this leg inherits it rather than a fresh one`
        + (rs.replanGrantUsed ? '; the arbiter\'s one extra is spent too' : '; the arbiter\'s one extra is still unearned'));
    }
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
    // F97 — the DOOMED SHAPE, which is the warning the line above cannot give. That
    // one fires when the ALLOWANCE is gone; this one fires when the allowance is fine
    // and the leg still cannot get anywhere: `u-msn0uccv` re-entered the exact plan
    // whose action was the diagnosed defect, with the replan ledger already spent, and
    // step-redded for $0.82 with $0.60 and 9.8 minutes still on the clock. WARNING
    // ONLY — a mechanical gap (a named wall, a count) converts on re-entry every time,
    // and only the operator can tell which kind of gap this is.
    if (doomedResume(rs)) {
      console.log('  ⚠ SAME PLAN, NO REPLANS — this resume re-enters the plan that already failed, and cannot redraw it:');
      console.log('            a resume does not re-draft (the spine says scout-skipped {reason:"resumed"}); the plan reloads byte-for-byte,');
      console.log('            and the replan ceiling shown above is spent, so the one channel that could replace it is gone.');
      console.log('            Fine if the gap is MECHANICAL (a named wall, a count) — doomed by construction if the PLAN is the defect: F97 paid $0.82 to find that out.');
    }
    if (dead.specHash && dead.specHash !== specHash) {
      console.log(`  NOTE     the halted run was signed under ${dead.specHash.slice(0, 12)}… and this spec hashes to ${specHash.slice(0, 12)}…`);
      console.log('           that is what a TOP-UP looks like: budgetUsd is in the hash, so raising it is a spec edit you sign below. The reloaded plan is re-validated against THIS spec and refused by name if it no longer fits.');
    }
  }
  // ── THE REVIEW (N4, ruling 2 + 2026-08-12 §5.2). This is the screen the whole
  // class exists for: the person is deciding, and they decide HERE, before any
  // signature. Never a bare "approve?" — the package is the close's own ask, every
  // mechanical stage's result, what the run changed and the lines it changed.
  if (PAUSED) {
    console.log('');
    // if the record that says WHAT a person was asked is gone: refusing would
    // strand real work, so say it, and let the operator decide with the spine
    // in front of them.
    printPauseEvidence(pauseRecord, [
      'HUMAN REVIEW — this run paused for a person, but its `hitl-pause` record is not on the spine, so there is',
      'no evidence package to show. Read the spine and the patient yourself before answering; nothing here can',
      `stand in for it: ${deadSpineFile}`,
    ]);
  }
  console.log(`  hash     ${specHash}`);
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  // WHICH DOOR. A pause with no ruling yet is offered all three, rerun first
  // (2026-08-12 §4 — the ~40% rubber-stamp datum: the lean is toward the answer that
  // costs a cycle, never toward the one that mints a green nobody read). A pause WITH
  // a ruling is shown the ruling back — including the words that will BE the gap —
  // and one invocation to sign.
  const invoke = (/** @type {string} */ tail) => `  ANTHROPIC_API_KEY=... node scripts/run-u.mjs --job ${jobKey}${dead ? ` --resume ${RESUME}` : ''}${SHIM_TAIL}${tail} --approve ${specHash}`;
  /** the door the operator has already picked, as flags — hoisted out of the else
   * below so the inhibitor line at the bottom can print the WHOLE command rather
   * than a shape the operator has to assemble. Empty on an ordinary run and on the
   * pause that has not been ruled on yet (there the three doors are the answer). */
  const decisionTail = RULING === null ? ''
    : ` --decide ${RULING.decision}${RULING.text === null ? '' : ` --text ${JSON.stringify(RULING.text)}`}`;
  if (PAUSED && RULING === null) {
    console.log('');
    for (const l of doorLines({
      rerun: invoke(' --decide rerun --text "<what you want done differently>"').trim(),
      accept: invoke(' --decide accept').trim(),
      pause: invoke(' --decide pause').trim(),
    })) console.log(l);
  } else {
    if (RULING !== null) {
      console.log(`\n  decision ${RULING.decision}${RULING.decision === 'rerun' ? ' — and these words become the gap the fix worker converts from:' : ''}`);
      if (RULING.text !== null) for (const l of String(RULING.text).split('\n')) console.log(`           ${l}`);
    }
    console.log(`\nTo approve and run:\n${invoke(decisionTail)}`);
  }
  // THE INHIBITOR, printed rather than remembered (F72). A suspend freezes
  // EVERYTHING: the outside watchdog is a poller, so it cannot observe — let alone
  // kill — a run whose machine is asleep, and since hamr's 2026-08-15 ruling the
  // run's own wall does not count those minutes either (src/clock.js is monotonic
  // now). So a suspended run is simply unwatched for as long as it sleeps. This is
  // the moment the operator can still do something about it, and run-reuse.mjs has
  // printed the same line here since F72 was minted; the U runner carried it only as
  // a comment, which is a rule nobody reads at the moment they launch.
  console.log('\nLaunch under a sleep inhibitor — a suspend freezes every guard, including the outside watchdog (F72):');
  console.log(PAUSED && RULING === null
    // a pause with no ruling is choosing between three doors above; prefixing one of
    // them would quietly recommend it, and the lean this surface was built with runs
    // the other way (rerun first, never the rubber stamp)
    ? '  systemd-inhibit --what=idle:sleep --why="bareloop u run" env <the door you picked, above>'
    // `env` before the assignment on purpose: systemd-inhibit execs a COMMAND, and a
    // bare `VAR=value` prefix is shell syntax it would try to run as one. The key
    // still rides an env assignment and never argv (it must never reach a cmdline).
    : `  systemd-inhibit --what=idle:sleep --why="bareloop u run" env \\\n  ${invoke(decisionTail).trim()}`);
  process.exit(arg('approve') === null ? 0 : 1);
}

// ── THE REVIEW DOOR, ANSWERED (module 8). Past the approval gate, so the signer
// proof is the same one every other decision rides: the spec hash they approved.
//
// The rulebook is the LIBRARY's (`answerReviewDoor`) and nothing is re-decided
// here: it validates the door, re-proves the tree for an `accept`, records the
// disposition and releases a held judged green. This prints what it did.
//
// `accept` and `pause` LAUNCH NOTHING and exit. `rerun` falls through into the run
// below as a FRESH ENGAGEMENT (§3.4): its own clock, and what REMAINS of the signed
// budget — money folds on every path, time does not.
/** @type {{text: string, fromRunid: string, receivedAt: string}|null} */
let DOOR_RERUN = null;
if (doorSpineFile !== null) {
  if (RULING === null) {
    console.error('NO DECISION — this run is standing at its review door and no decision was given.');
    console.error('Answer it with one of: --decide rerun --text "<your words>" · --decide accept · --decide pause');
    console.error('(the same command without --approve prints the evidence package — that is the screen this decision is made on)');
    process.exit(2);
  }
  const answeredAt = new Date().toISOString();
  const ans = await answerReviewDoor({
    job: spec,
    workdir: wd,
    events: doorEvents ?? [],
    decision: RULING.decision,
    text: RULING.text,
    closeTimeoutMs: CLOSE_TIMEOUT_MS,
    at: answeredAt,
    // THE REGISTRY IS OPTIONAL AND NEVER CONJURED. This runner keeps standalone
    // bridge FILES, not a registry, so a release has nothing to write unless the
    // operator names one. Absent, the answer is recorded on the run's own spine and
    // the readout SAYS the credit was not released — never a silent no-op.
    registryDir: arg('registry'),
    name: arg('workflow') ?? spec.job,
    runid: DOOR,
    // the decision goes onto the answered run's OWN append-only log: the record of
    // what a person decided about a run belongs beside the record of the run
    emit: makeSpine(doorSpineFile, { startSeq: doorEvents?.at(-1)?.seq ?? 0 }),
  });
  if (!ans.ok) {
    console.error(`\nDOOR REFUSED (${RULING.decision}) — nothing was recorded and nothing was released.`);
    for (const r of ans.reds) console.error(`  ${r.code}:${r.path} — ${r.detail}`);
    if (ans.mechanical?.stages?.length) {
      console.error('  the mechanical re-run, stage by stage:');
      for (const s of ans.mechanical.stages) console.error(`    ${s.name}  ${s.verdict}`);
    }
    process.exit(2);
  }
  if (RULING.decision !== 'rerun') {
    console.log(`\n${RULING.decision === 'accept' ? 'ACCEPTED' : 'PAUSED'} — the verdict this run minted (${doorRecord.outcome}) is UNTOUCHED; what you answered is what happens to the work.`);
    if (RULING.decision === 'accept') {
      console.log(`  proved   ${ans.mechanical?.ran ?? 0} mechanical stage(s) re-ran on the tree as it stands, and passed — an accept is not a rubber stamp`);
      console.log(`  credit   ${ans.released ? 'RELEASED — this workflow is now eligible for reuse' : (arg('registry') === null ? 'not released: no --registry was named, so there is no entry to release (the answer is on the spine)' : 'nothing was held — a green-class run was never quarantined')}`);
      if (ans.note) console.log(`  note     ${ans.note}`);
    } else {
      console.log(`  costs    nothing, in any state — no work, no money, no allowance moved`);
      console.log(`  keeps    ${PAUSE_TTL_MS / 86_400_000} days from the door on the record; after that it expires on its own, which is all "cancel" ever meant`);
      console.log(`  reopen   node scripts/run-u.mjs --job ${jobKey} --door ${DOOR} --approve ${specHash}`);
    }
    process.exit(0);
  }
  DOOR_RERUN = { text: /** @type {string} */ (RULING.text), fromRunid: /** @type {string} */ (DOOR), receivedAt: answeredAt };
  console.log(`\nRERUN — a FRESH ENGAGEMENT against the same signed spec. The previous run's verdict (${doorRecord.outcome}) is untouched.`);
  console.log(`  clock    its own: the full signed wall (${WALL_LABEL}) — a person does not decide on the run's clock (F103)`);
  console.log(`  money    what REMAINS of the signed $${spec.budgetUsd}: ${doorPrior?.spendComplete === false ? '≥' : ''}$${(doorPrior?.spentUsd ?? 0).toFixed(4)} is already spent and folds in (a signature for $${spec.budgetUsd} never authorises more)`);
  console.log('  gap      your words, carried to the PLANNER as a requirement on top of the goal');
}

// ── THE PAUSE DOOR (2026-08-17) — answered HERE, and it launches nothing.
//
// hamr's ruling replaced cancel with a pause that can resume, and the honest way to
// keep a checkpoint is to leave it alone. This runner writes one spine file per LEG,
// and a leg that returns before drafting emits no `plan-accepted` and no `step-end` —
// which is exactly what `readStepCheckpoint` reads. So launching a run to say "not
// now" would mint a NEW runid whose own checkpoint is empty, and an operator who
// later resumed that runid would re-draft and re-pay for every step the paused leg
// already finished. The checkpoint that matters is the one already on disk.
//
// So the decision is recorded to the operator, in words, against the runid they
// resume — and nothing is spent, nothing is signed away, and no allowance moves. The
// library keeps its own half (`runPlan` mints a `hitl-pause` with `humanDecision`
// when an adopter drives the door directly); this is the runner's, and the two agree
// on the one fact that matters: the run stays paused and stays resumable.
//
// IT SITS ABOVE THE WALL GATE, and that placement is a ruling (v1.73 addendum 2,
// ruling 5): *the pause door is ALLOWANCE-FREE in every state, including below the
// wall-exhausted gate*. Pause does no work and spends no money, so there is nothing
// for an allowance to pay for, and charging one would be the door billing a person
// for declining to decide. A raise-and-re-sign is what changes what a RERUN can buy;
// it was never what a pause costs. `accept` and `rerun` still meet the wall below —
// they commission work, and work meets the clock.
if (PAUSED && RULING?.decision === 'pause') {
  console.log(`\nPAUSED BY YOU — nothing was run and nothing was spent. The checkpoint stands exactly as it was: the work is on the run's own branch, the plan and the money are where the paused leg left them.`);
  console.log(`  keeps    ${PAUSE_TTL_MS / 86_400_000} days from the pause on the record — after that the checkpoint expires on its own, and nothing has to be decided today to let that happen`);
  console.log('  resume   the SAME runid, whenever you want, with the door you pick then:');
  console.log(`           node scripts/run-u.mjs --job ${jobKey} --resume ${RESUME}${SHIM_TAIL} --decide accept --approve ${specHash}`);
  console.log(`           node scripts/run-u.mjs --job ${jobKey} --resume ${RESUME}${SHIM_TAIL} --decide rerun --text "<what you want done differently>" --approve ${specHash}`);
  console.log(`  read     the same command with no --decide re-prints the evidence package you just looked at`);
  process.exit(0);
}

// W-2, on the launch side: "when time is up, keep the grade we already have and stop".
// A resume whose wall remainder is zero or negative has no time to start anything in,
// and launching it buys a scout and a precheck's worth of nothing before the clock
// halts it. The preview above already warns; this REFUSES, because the warning is
// advisory and this is the wall itself. It also closes the guard's half of the same
// hole: `--wall-ms 0` used to reach u-watchdog, which defaulted it to null and armed
// no deadline at all while this banner still claimed a wall.
if (dead && RESUME_WALL_MS !== null && RESUME_WALL_MS <= 0) {
  console.error(`WALL ALREADY EXHAUSTED — the halted run burned ${(dead.restart.priorWallMs / 60000).toFixed(1)}min of the signed ${/** @type {number} */ (WALL_MS) / 60000}min, so this resume starts with no time at all.`);
  console.error('Nothing here refills it (a run may never widen its own cap). The lever is yours:');
  console.error(`  - RAISE maxWallMs in jobs/${target.spec} — that is a spec edit, so the hash changes and you sign the new one with --approve;`);
  console.error('  - or revise the goal/spec, or abandon the run and keep the verdict it already minted.');
  // NAMED, because it is a real and non-obvious consequence rather than an oversight:
  // a PAUSED run whose wall is gone cannot be ACCEPTED — an accept re-runs every
  // mechanical stage against the tree as it stands (OPEN-3), which is work, and work
  // meets the clock. The wall is governance and this runner does not get to decide
  // that some decisions are free of it.
  //
  // The one door that IS free of it is `pause`, answered above and never reaching
  // here (v1.73 ruling 5). That is not this script relaxing a governance gate: a pause
  // runs nothing and spends nothing, so there is no allowance for it to be charged
  // against, and the checkpoint it keeps is the one already on disk.
  if (PAUSED) {
    console.error('  NOTE: this run is waiting on a DECISION and its wall is gone, so accept and rerun cannot be applied until the wall is.');
    console.error(`        --decide pause is still open and always is: it costs nothing in any state, and the checkpoint keeps for ${PAUSE_TTL_MS / 86_400_000} days.`);
  }
  process.exit(2);
}

// A PAUSE is answered, or it is not resumed. The lean-rerun rule (2026-08-12 §4) is
// about which door a prompt LEADS with — it is never an action taken for the
// operator, so there is no default here to fall through to. Resuming a pause with no
// ruling would re-run the close and pause again at the same stage, buying a precheck
// to ask the same question twice.
if (PAUSED && RULING === null) {
  console.error('NO DECISION — this resume continues a run that is waiting on a person, and no decision was given.');
  console.error('Answer it with one of: --decide rerun --text "<your words>" · --decide accept · --decide pause');
  console.error('(run the same command without --approve to read the evidence package first — that is the screen this decision is made on)');
  process.exit(2);
}


const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)'); process.exit(2); }

// `wd`/`spineDir` are derived once, above the resume reader that needs them; only the
// directory's CREATION belongs here, after the preview/approval gates have exited.
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
  // run's edits is measuring the wrong thing. COLD MEANS COLD (P design record): the
  // isolate verbs (stash/remember) persist in .litectx across runs, so an uncleaned
  // store would leak run N's memory into run N+1's "cold" baseline and quietly poison
  // every contrast (the reuse rung's OFF arm above all). The store is a derived,
  // self-healing cache by litectx's own contract; the re-index it costs is ~65s under
  // yield. When the reuse rung lands, KEEPING the store becomes an explicit
  // ledger-attributed choice — never a leak.
  //
  // The mechanism lives in `scripts/u-patient.mjs` so a battery driver rehearsing a
  // cold row runs THIS reset rather than a second spelling of it.
  const cold = coldReset(wd, SEED);
  console.log(`patient reset — clean at ${cold.head}, store ${cold.storeRemoved ? 'removed (cold)' : 'was already absent (cold)'}`);
}

const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];
const provider = new AnthropicProvider({ apiKey, model: MODEL });
// P: the per-step model-tier factory. The TIER menu a PLAN may name is signed in the
// plan schema (STEP_MODELS — sonnet-only since the 2026-08-06 haiku attribution probe);
// the tier->model mapping is the RUNNER's territory, here, and keeps haiku for the
// operator's own --model knob. haiku takes no output_config.effort (provider-gated,
// battery rule) - nothing to gate yet since neither tier sets effort params.
const TIER_MODELS = DEFAULT_TIER_MODELS;
/** @type {Record<string, any>} */
const tierCache = {};
const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] === MODEL ? provider : new AnthropicProvider({ apiKey, model: TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] }));
/** SOFTGREEN — the JUDGED stage's own provider, and it is not the worker's. The tier
 * is PINNED (`JUDGE_MODEL`), never a step knob and never agent-selectable: §4.2's
 * safety argument is worth exactly as much as the tier its injection evidence was
 * measured on. Built UNCONDITIONALLY and deliberately so — construction costs nothing
 * and makes no call, `runPlan` reads it only when a stage is `judged-floor`, and the
 * alternative (deriving "does this close judge?" here) is a second reading of the
 * declaration that can drift from the one the runner actually executes. Absent, a
 * judged stage instrument-STOPS as a wiring gap, which is what every live softgreen
 * run would have done: run-author wired this seam and this runner never did. */
const judgeProvider = new AnthropicProvider({ apiKey, model: JUDGE_MODEL });

const started = Date.now();
console.log(`\n== U run ${runid} ==  $${spec.budgetUsd} · ${WALL_LABEL} · ${MODEL}`);
// the arm is named on the run's own stdout: a battery row whose arm is only in the
// driver's plan is a row nobody can audit from its own log.
console.log(`   ${READ_SHIM_LABEL}`);

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
// THE COUNT COMES FROM `closeStagesOf`, the runner's own derivation (src/plan.js),
// because the guard and the thing it guards must read the SAME number. Reading
// `spec.close` alone counted an AUTHORED close (`closeDecl`) as one stage — a
// six-stage declaration would have armed both windows at a sixth of the silence a
// legal close may take, and the outside guard would SIGKILL a live verdict
// mid-close. That is F70's shape exactly: the instrument built to guard a failure
// mode carrying that failure mode. A legacy object-form close (the locked verdict
// classes, job.js) is still ONE stage — `stageClose` wraps it — and the floor
// below is live rather than decorative: this spec is read raw off disk and is not
// validateJob'd until runJob, so `closeStagesOf` can return null (a spec naming no
// close at all) or an empty list, and a 0 or NaN here would disarm both windows
// silently.
const closeStages = closeStagesOf(spec)?.length || 1;
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
    approvals, workdir: wd, provider, providerFor, judgeProvider, emit: makeSpine(spineFile),
    shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, strikeLimit: STRIKE_LIMIT, closeTimeoutMs: CLOSE_TIMEOUT_MS,
    readShim: READ_SHIM,
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
      // and the dead leg's own close GRADES, so this leg's halt readouts judge the
      // whole chain rather than the leg. A leg that re-grades an unchanged tree is
      // flat on its own evidence; the RUN — which is what the top-up decision is
      // about — may have been converging when the allowance ran out.
      ...(dead.restart.grades?.length ? { resumeGrades: dead.restart.grades } : {}),
      // and the REPLAN ledger the chain has spent. The line above feeds a readout; this
      // one feeds a BOUND — `replanned`/`varianceGrantUsed` are locals in `runPlan`, so
      // an unforwarded ledger hands this leg a fresh allowance of one PRD v1.12 makes the
      // RUN's, once per kill. It rides onto this leg's `job-start` as `priorReplans` too,
      // which is what lets a resume OF a resume fold once instead of restarting the
      // ceiling at whichever window it happens to read.
      ...(dead.restart.replans > 0
        ? { resumeReplans: { count: dead.restart.replans, grantUsed: dead.restart.replanGrantUsed } }
        : {}),
      // and WHERE the dead leg's work is sitting (PRD v1.57 §3). The branch name is
      // derived from the SIGNED spec, so it is identical on every leg: without this the
      // restart collides with its own predecessor's branch and the collision walk hands
      // it a fresh `-2` standing beside the work it came back to continue.
      ...(dead.restart.branch ? { resumeBranch: dead.restart.branch } : {}),
    } : {}),
    // N4 — the SIGNER's answer, normalised at the library's own seam above and
    // carried in on the leg that resumes the pause. It is spent ONCE, on this leg's
    // close readings: `accept` greens the human stage after the mechanical stages
    // re-run on the tree as it stands (OPEN-3), `rerun` reds it with these words as
    // the gap, and `pause` never gets this far (it is answered above, launching nothing).
    // Absent on every ordinary run — refused-but-unwired would pause forever.
    // …and NOT on the review-door path (module 8), where the same `--decide rerun`
    // means something else entirely: a `humanRuling` answers a close's human STAGE
    // and is refused for a close that has none, which is every green-class job. The
    // door's rerun travels as `doorRerun` below instead. One flag, two questions —
    // the runner picks by which run is being answered, never by the flag's spelling.
    ...(RULING === null || DOOR !== null ? {} : { humanRuling: RULING }),
    // F102 — and the answer the CHECKPOINT holds, when the leg before this one died
    // holding it. Same seam, same semantics, one difference the spine records: the
    // decision came from a record rather than from a person on this invocation. The
    // two are never both set (the resolver refused above), so this can never be a
    // silent override of words somebody just typed.
    ...(HELD === null ? {} : { heldRuling: HELD }),
    // MODULE 8 — does this run END at a review door? Soft-green opens one unasked
    // (the library's class default); `--review-door` is the green-class opt-in; and a
    // leg that IS a rerun taken at a door opens the next one by construction — the
    // person is working through the door, and a rerun that ended silently would be
    // the one leg in the chain they could not answer.
    ...(REVIEW_DOOR_ON || DOOR_RERUN ? { reviewDoor: true } : {}),
    // …and the signer's words, when this leg is that rerun. The money the answered
    // run spent folds in (the signed budget is the chain's ceiling); the WALL does
    // not (F103 — a rerun that inherits a dead leg's clock is structurally doomed).
    ...(DOOR_RERUN === null ? {} : {
      doorRerun: DOOR_RERUN,
      priorSpentUsd: doorPrior?.spentUsd ?? 0,
      priorSpendComplete: doorPrior?.spendComplete !== false,
    }),
  });
} finally {
  // the guard outlives the run only by accident, never by design
  try { watchdog.kill('SIGKILL'); } catch { /* already gone */ }
  clearInterval(lagTimer);
}
const legMs = Date.now() - started;

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
// FOLDED, exactly like the money line above it: on a resume the cap governs both legs
// together, and a leg-only wall next to a folded spend is two framings on one cap with
// no label to tell them apart (F83). The leg stays on the line beside it.
console.log(`wall      ${wallLine({ legMs, priorWallMs: dead ? dead.restart.priorWallMs : 0, wallLabel: WALL_LABEL })}`);
const legRounds = events.filter((e) => e.type === 'worker-round' && e.kind === 'turn').length;
console.log(`rounds    ${legRounds}`);
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
  console.log(`  resume  node scripts/run-u.mjs --job ${jobKey} --resume ${runid}${SHIM_TAIL} --approve <the NEW hash after you edit budgetUsd>`);
  console.log('          (the top-up is yours to sign — nothing in the run may widen its own budget)');
}
// A STALL is a checkpoint too (hamr's go, 2026-08-13). Its own escalation prints one
// line above and says *"retry the run"*, and until this line the only retry on offer
// was a COLD one that re-drafts the plan and re-pays for every step already finished.
// Unlike the money halt above, nothing here needs re-signing: no allowance moved, so
// the hash already approved is the hash that resumes.
if (outcome === 'step-stalled') {
  console.log('\nSTALL HALT — the model stopped producing rounds and reissuing the call did not recover it. The tree, the plan and the steps already finished STAND.');
  console.log(`  resume  node scripts/run-u.mjs --job ${jobKey} --resume ${runid}${SHIM_TAIL} --approve ${specHash}`);
  console.log('          (no spec edit, so the hash is unchanged — this re-enters at the stalled step and re-pays for none of the ones before it)');
  console.log('          (if the allowance is what actually ran out underneath the stall, that preview says so and refuses — it is read there, not asserted here)');
}
// ── N4 §1.4/§5.2 — THE PAUSE, at the terminal the person is actually standing at.
// The run stopped decision-ready with the clock stopped (ruling 1) and everything
// it did stands until an answer comes back. This renders the SAME evidence package
// the resume preview renders, from the SAME record and the SAME function: one
// assembly of one run's facts, two screens.
//
// A decision moves no allowance, so nothing here needs re-signing — the hash that
// bought this run is the hash that answers it, exactly like the stall readout above.
if (outcome === HITL_PAUSE) {
  const pause = events.filter((e) => e.type === HITL_PAUSE).at(-1) ?? null;
  console.log('');
  printPauseEvidence(pause, [
    'HUMAN REVIEW — the run paused for a person but wrote no `hitl-pause` record; read the spine and the patient',
    'yourself before answering. Nothing here can stand in for the evidence it did not write.',
  ]);
  console.log('  clock    STOPPED — the wall does not run while a person is reading (W-2), and this leg\'s elapsed is what folds into the resume');
  console.log('');
  const answer = (/** @type {string} */ tail) => `node scripts/run-u.mjs --job ${jobKey} --resume ${runid}${SHIM_TAIL}${tail} --approve ${specHash}`;
  for (const l of doorLines({
    rerun: answer(' --decide rerun --text "<what you want done differently>"'),
    accept: answer(' --decide accept'),
    pause: answer(' --decide pause'),
  })) console.log(l);
  console.log(`  (the same command without --approve re-prints this package — the checkpoint keeps for ${PAUSE_TTL_MS / 86_400_000} days)`);
}
// ── THE REGISTRY ROW (2B), minted BEFORE the door is rendered because the door's own
// text reads off it. A bridge FILE is not a registry ROW, and the review door answers
// rows: with none, `--door --decide accept` reached `recordDoor`, found no green row for
// this runid and refused `no-row-for-run` — so the door could describe a held learning
// credit it had no way to release.
//
// STORAGE ONLY. Nothing here selects, promotes or reuses a bridge (that rung is parked);
// the row is written, and exactly one thing reads it back — the door. Every rule lives in
// the library seam, which is where the reuse runner's greens go too, so there is ONE
// spelling of what a green writes: no `--registry` is no row, an already-green run mints
// nothing (accept confirms a verdict, it never mints one), a green with no executed plan
// mints nothing, and a class whose credit is not held — green, today — mints nothing here,
// which is what this runner has always done. The row is born HELD because `greenParts`
// reads the SIGNED class off the record, never because a line here set a flag.
//
// A SPINE LEAK BLOCKS IT, exactly as it blocks the bridge file below and for the same
// reason: a spine carrying a secret must never graduate into an artifact that outlives
// the run, and a registry row outlives it harder than a file does.
const REGISTRY_ROW = leaks.length
  ? { minted: false, reason: 'spine-leak', write: null }
  : writeRunGreenRow({
    registryDir: arg('registry'),
    job: spec,
    name: arg('workflow'),
    outcome,
    plan,
    record: {
      runid,
      patient: wd,
      at: new Date().toISOString(),
      costUsd: je?.spentUsd ?? null,
      // F44/F6 — completeness travels WITH the spend, and an absent job-end is
      // unknown-and-incomplete rather than a floor that reads as exact
      spendComplete: je?.spentUsd != null && je.spendComplete !== false,
      // FOLDED across a resume, like every other money and time number this readout
      // prints: the row records what the RUN cost, never what this leg cost
      wallMs: legMs + (dead ? dead.restart.priorWallMs : 0),
      // the ROUND count CANNOT fold — a resume leg writes a fresh spine and the halted
      // leg's restart record declares money and wall but never rounds — so on a resume
      // this is a FLOOR, and it says so the way the money above does (F6: a floor that
      // reads as exact is dishonest; report the floor WITH its completeness)
      rounds: legRounds,
      roundsComplete: !dead,
      specHash,
    },
  });
if (REGISTRY_ROW.minted) {
  console.log(`\nREGISTRY   ${REGISTRY_ROW.write.name} — ${REGISTRY_ROW.write.action} (${REGISTRY_ROW.write.file})`);
  console.log('  HELD: this green\'s learning credit is quarantined until you release it at the door below');
} else if (REGISTRY_ROW.write !== null) {
  // a REFUSED write is said out loud rather than swallowed — the door below is about to
  // offer a disposition this run has no row to record
  console.log(`\nREGISTRY   NOT written — ${REGISTRY_ROW.write.reds.map((r) => `${r.code}:${r.path}`).join(', ')}`);
} else if (arg('registry') !== null) {
  // the operator NAMED a registry and no row was even attempted — silence here would
  // leave them guessing whether the flag was read at all. One line, the reason as-is
  // (green-predates-run / not-green / no-plan-executed / credit-not-held / spine-leak);
  // no --registry stays silent, because nothing was asked for.
  console.log(`\nREGISTRY   no row — ${REGISTRY_ROW.reason}`);
}

// ── THE REVIEW DOOR, where the person is actually standing (module 8). The run
// ENDED and its verdict is minted — this readout offers the three doors over it and
// changes nothing about the outcome printed above. Read off the run's own record
// (never off a flag), so a green that opened no door prints exactly what it always did.
const doorHere = events.findLast((e) => e.type === 'review-door') ?? null;
if (doorHere) {
  console.log('');
  for (const l of reviewDoorPackage({
    door: doorHere,
    diff: readDiff(Array.isArray(doorHere.changed?.paths) ? doorHere.changed.paths : []),
  })) console.log(l);
  console.log('');
  // the door is answered in a SEPARATE invocation, so the registry this run wrote its row
  // against has to travel in the printed command — an accept aimed at no registry (or at
  // a different one) is the `no-row-for-run` refusal all over again, one hop later.
  const doorRegistry = REGISTRY_ROW.minted ? ` --registry ${arg('registry')} --workflow ${REGISTRY_ROW.write.name}` : '';
  const answerDoor = (/** @type {string} */ tail) => `node scripts/run-u.mjs --job ${jobKey} --door ${runid}${tail}${doorRegistry} --approve ${specHash}`;
  // THE PROMISE READS OFF THE ROW, not off the class. `quarantined` on the door record
  // says this run's credit is HELD; whether there is anything to RELEASE is a second
  // question, and the honest answer is "only if a row was minted". Without `--registry`
  // there is none, and a door that promised a release it cannot perform is the defect
  // 2B closed — so the two are ANDed rather than the class alone being trusted.
  for (const l of runDoorLines({
    rerun: answerDoor(' --decide rerun --text "<what you want done differently>"'),
    accept: answerDoor(' --decide accept'),
    pause: answerDoor(' --decide pause'),
    ttlDays: PAUSE_TTL_MS / 86_400_000,
    held: doorHere.quarantined === true && REGISTRY_ROW.minted,
  })) console.log(l);
  if (doorHere.quarantined === true && !REGISTRY_ROW.minted) {
    console.log('  (this run\'s credit is HELD and no registry row was written, so an accept records a disposition '
      + 'and releases nothing — name --registry/--workflow on the RUN to give the door something to release)');
  }
  console.log(`  (the same command with no --decide re-prints this package — the door keeps for ${PAUSE_TTL_MS / 86_400_000} days)`);
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
