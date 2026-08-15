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
import { closeStagesOf } from '../src/plan.js';
import { makeSpine } from '../src/spine.js';
import { scanSecrets, redactSecrets } from '../src/validate.js';
// the three doors' SEMANTICS live in the library; this script surfaces them
import { normalizeHumanRuling } from '../src/kinds.js';
// --resume reads the halted run's own spine back through the SAME reader the reuse
// path uses (never a second one) and keeps its patient the way it left it.
import { readResume, resumeTreeGate, checkpointAgeGate, CHECKPOINT_OUTCOMES, PAUSE_TTL_MS } from '../src/reuse.js';
// the banner's wall arithmetic, extracted so it is reachable by a test (F83): the
// end-of-run readout sits past the approval gate, so nothing could ever drive it here
import { wallLine, doomedResume, deathAtOf, evidencePackage, doorLines, resumeAtLines } from './u-readout.mjs';

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
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };

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
if (DECIDE !== null && RESUME === null) {
  die('--decide answers a PAUSED run, and there is no --resume here. A decision is an answer to a checkpoint that '
    + 'already exists — there is nothing for it to rule on at the start of a fresh run.');
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
  // A decision answers a PAUSE. Every other checkpoint here stopped on an allowance,
  // and nothing about it is waiting on a person — handing one a ruling would let an
  // `accept` mint a green over evidence nobody was ever shown. The library refuses a
  // ruling for a close with no human stage; this is the other half of the same
  // question, and only the runner can ask it (it is about WHICH checkpoint is being
  // answered, not about the close's shape).
  if (RULING !== null && dead.endOutcome !== 'hitl-pause') {
    die(`--decide ${RULING.decision}: that run stopped on ${dead.endOutcome ?? 'an unrecorded terminal'}, not at a human stage. `
      + 'A decision answers a pause — the run has to have asked you something before you can answer it. Resume it without a decision.');
  }
  pauseRecord = deadEvents.filter((/** @type {any} */ e) => e?.type === 'hitl-pause').at(-1) ?? null;
}
/** is this resume the one a PERSON has to answer? Read off the recorded terminal,
 * never off the presence of a `--decide` — the whole point is that the flag is
 * absent on the first visit. */
const PAUSED = !!dead && dead.endOutcome === 'hitl-pause';

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
/** the restart runs on the REMAINDER of the signed wall, never a fresh allotment —
 * "a budget ceiling folds in prior spend so re-invoking cannot silently widen it",
 * in a time coat. Both the run's own clock and the outside watchdog read this one. */
const RESUME_WALL_MS = WALL_MS === null || !dead ? WALL_MS : Math.max(0, WALL_MS - dead.restart.priorWallMs);

if (arg('approve') !== specHash) {
  console.log(dead ? 'U — RESUME, continuing a halted run, REAL dollars' : 'U — user-mode e2e, ONE run, REAL dollars');
  console.log(`  spec     jobs/${target.spec}  $${spec.budgetUsd}  wall ${WALL_LABEL}  strikeLimit=${STRIKE_LIMIT} (step ladder + close-fix progress rule)`);
  console.log(`  patient  ${WORKDIR} @ ${SEED.slice(0, 12)}`);
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
    console.log(`  spent    ${dead.spendComplete ? '' : '≥'}$${rs.priorSpentUsd.toFixed(4)} and ${(rs.priorWallMs / 60000).toFixed(1)}min before the halt — FOLDED IN, so this restarts on the REMAINDER`);
    console.log(`  left     $${(spec.budgetUsd - rs.priorSpentUsd).toFixed(4)} of $${spec.budgetUsd}${WALL_MS === null ? '' : ` and ${(/** @type {number} */ (RESUME_WALL_MS) / 60000).toFixed(1)}min of ${WALL_MS / 60000}min`}`);
    // WHERE it picks up. Without this line "resume" covers two runs that cost very
    // different amounts — one that re-scouts and re-drafts from nothing, and one that
    // re-enters at the close — and the hash being signed authorizes the dollars either way.
    // …through `resumeAtLines` (scripts/u-readout.mjs), because a PAUSE is a phase this
    // line did not have: it stops after the plan's steps, at the close's human stage, and
    // the step arithmetic used to walk off the end of the plan (`at step 2 of 1
    // "(unknown)"`). The rule the helper holds is that a step count may never exceed the
    // plan, and that the phase is said in words.
    for (const l of resumeAtLines({ seed: rs.seed, paused: dead.endOutcome === 'hitl-pause' })) console.log(l);
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
    if (!pauseRecord) {
      // the terminal says a person was asked and the record that says WHAT is gone.
      // Refusing would strand real work; rendering a bare "approve?" is the exact
      // thing ruling 2 forbids. So: say it, and let the operator decide with the
      // spine in front of them.
      console.log('HUMAN REVIEW — this run paused for a person, but its `hitl-pause` record is not on the spine, so there is');
      console.log('no evidence package to show. Read the spine and the patient yourself before answering; nothing here can');
      console.log(`stand in for it: ${deadSpineFile}`);
    } else {
      const paths = Array.isArray(pauseRecord.changed?.paths) ? pauseRecord.changed.paths : [];
      for (const l of evidencePackage({ pause: pauseRecord, diff: readDiff(paths) })) console.log(l);
    }
  }
  console.log(`  hash     ${specHash}`);
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  // WHICH DOOR. A pause with no ruling yet is offered all three, rerun first
  // (2026-08-12 §4 — the ~40% rubber-stamp datum: the lean is toward the answer that
  // costs a cycle, never toward the one that mints a green nobody read). A pause WITH
  // a ruling is shown the ruling back — including the words that will BE the gap —
  // and one invocation to sign.
  const invoke = (/** @type {string} */ tail) => `  ANTHROPIC_API_KEY=... node scripts/run-u.mjs --job ${jobKey}${dead ? ` --resume ${RESUME}` : ''}${tail} --approve ${specHash}`;
  if (PAUSED && RULING === null) {
    console.log('');
    for (const l of doorLines({
      rerun: invoke(' --decide rerun --text "<what you want done differently>"').trim(),
      accept: invoke(' --decide accept').trim(),
      cancel: invoke(' --decide cancel').trim(),
    })) console.log(l);
  } else {
    if (RULING !== null) {
      console.log(`\n  decision ${RULING.decision}${RULING.decision === 'rerun' ? ' — and these words become the gap the fix worker converts from:' : ''}`);
      if (RULING.text !== null) for (const l of String(RULING.text).split('\n')) console.log(`           ${l}`);
    }
    const tail = RULING === null ? ''
      : ` --decide ${RULING.decision}${RULING.text === null ? '' : ` --text ${JSON.stringify(RULING.text)}`}`;
    console.log(`\nTo approve and run:\n${invoke(tail)}`);
  }
  process.exit(arg('approve') === null ? 0 : 1);
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
  // a PAUSED run whose wall is gone cannot be answered either — not even with an
  // `accept`, which buys no worker round at all. The wall is governance and this
  // runner does not get to decide that some decisions are free of it; changing that
  // is an arbiter call, and it belongs to hamr rather than to this script.
  if (PAUSED) {
    console.error('  NOTE: this run is waiting on a DECISION and its wall is gone, so the decision cannot be applied until the wall is.');
    console.error('        Even --decide accept (which buys no worker round) goes through this gate: the allowance is the arbiter\'s, not the runner\'s.');
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
  console.error('Answer it with one of: --decide rerun --text "<your words>" · --decide accept · --decide cancel');
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
// P: the per-step model-tier factory. The TIER menu a PLAN may name is signed in the
// plan schema (STEP_MODELS — sonnet-only since the 2026-08-06 haiku attribution probe);
// the tier->model mapping is the RUNNER's territory, here, and keeps haiku for the
// operator's own --model knob. haiku takes no output_config.effort (provider-gated,
// battery rule) - nothing to gate yet since neither tier sets effort params.
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
    // the gap, and `cancel` never gets this far (it is terminal before any work).
    // Absent on every ordinary run — refused-but-unwired would pause forever.
    ...(RULING === null ? {} : { humanRuling: RULING }),
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
// A STALL is a checkpoint too (hamr's go, 2026-08-13). Its own escalation prints one
// line above and says *"retry the run"*, and until this line the only retry on offer
// was a COLD one that re-drafts the plan and re-pays for every step already finished.
// Unlike the money halt above, nothing here needs re-signing: no allowance moved, so
// the hash already approved is the hash that resumes.
if (outcome === 'step-stalled') {
  console.log('\nSTALL HALT — the model stopped producing rounds and reissuing the call did not recover it. The tree, the plan and the steps already finished STAND.');
  console.log(`  resume  node scripts/run-u.mjs --job ${jobKey} --resume ${runid} --approve ${specHash}`);
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
if (outcome === 'hitl-pause') {
  const pause = events.filter((e) => e.type === 'hitl-pause').at(-1) ?? null;
  console.log('');
  if (!pause) {
    console.log('HUMAN REVIEW — the run paused for a person but wrote no `hitl-pause` record; read the spine and the patient');
    console.log('yourself before answering. Nothing here can stand in for the evidence it did not write.');
  } else {
    const paths = Array.isArray(pause.changed?.paths) ? pause.changed.paths : [];
    for (const l of evidencePackage({ pause, diff: readDiff(paths) })) console.log(l);
  }
  console.log('  clock    STOPPED — the wall does not run while a person is reading (W-2), and this leg\'s elapsed is what folds into the resume');
  console.log('');
  const answer = (/** @type {string} */ tail) => `node scripts/run-u.mjs --job ${jobKey} --resume ${runid}${tail} --approve ${specHash}`;
  for (const l of doorLines({
    rerun: answer(' --decide rerun --text "<what you want done differently>"'),
    accept: answer(' --decide accept'),
    cancel: answer(' --decide cancel'),
  })) console.log(l);
  console.log(`  (the same command without --approve re-prints this package — the checkpoint keeps for ${PAUSE_TTL_MS / 86_400_000} days)`);
}
// ── the third door, and it is the one that ends things. No gap, no continuation,
// no worker round: the signer decided the job was not worth another pass. The
// spend line above is the honest report — a cancel costs whatever the run had
// already spent before it asked, and nothing after.
if (outcome === 'hitl-cancel') {
  console.log('\nCANCELLED — the signer closed the run at its human stage. TERMINAL: no gap, no continuation, and no worker round bought by the decision.');
  console.log('  the work stays on the run\'s own branch exactly as it was left — read it, keep it, or throw it away yourself');
  console.log('  a fresh run is a fresh run (the same hash) — revising the goal or the spec changes the hash and needs a new signature');
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
