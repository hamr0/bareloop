// Shared fixtures for the planrun.test.js family (tests/planrun-*.test.js), split out of
// the former single planrun.test.js so node --test runs the topic files in parallel.
// Moved verbatim; each helper is exported once and imported by the files that use it.
// Not a test file by name (no .test., no test- prefix), so node's glob skips it.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';
import { signCloseScripts } from '../src/close-integrity.js';

export const tcall = (id, name, args) => ({ id, name, arguments: args });


/**
 * A real patient: close greens iff tests/test_x.mjs exists and contains "ok";
 * the clean-run check greens on the same condition (a cheap in-run mirror of
 * the close's wall — the F46 shape). Both are real spawned scripts.
 */
export function makePatient(t, { closeGreen = false, git = true } = {}) {
  const wd = mkdtempSync(join(tmpdir(), 'planrun-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  // A real repository, because the WORK BRANCH hard rule (PRD v1.57 §3) makes one a
  // precondition of running a job at all. `git: false` is the arm that proves the
  // refusal, and it is the ONLY caller that gets a patient without one.
  if (git) initPatientRepo(wd);
  mkdirSync(join(wd, 'tests'));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('suite: 1 passed'); process.exit(0); }
console.log('FAILED tests/test_x.mjs — file missing or has no ok assertion'); process.exit(1);\n`;
  writeFileSync(join(wd, 'close.mjs'), closeGreen ? 'process.exit(0)\n' : probe);
  writeFileSync(join(wd, 'check.mjs'), probe);
  return wd;
}


// PRD item 27/M2: `signCloseScripts` fills close[].sha256 from the REAL
// bytes on disk at `wd` — most fixtures in this file actually spawn their
// close through a real runPlan, so a dummy value would red close-tampered
// before the scenario under test ever runs. Stages naming no real file at
// `wd` (a deliberately-broken cmd, a declared close) pass through
// unsigned — validateJob then reds `missing-required` honestly for those,
// exactly as it would for a real unsigned job.
export const JOB = (wd, over = {}) => signCloseScripts({
  schema: 'job-v1',
  job: 'plan-patient',
  description: 'write the missing test through an agent-authored plan',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs with an ok assertion so the suite greens.',
  verdictType: 'green',
  // The staged close (PRD v1.28): the inspection is a list of named stages and
  // the agent's ruler menu DERIVES from it. `clean-run` is a stage of the close,
  // not a copy carved beside it — which is the whole point: the ruler and the
  // real inspection cannot drift apart.
  close: [
    { name: 'clean-run', cmd: 'node check.mjs', expect: 0, gapKeep: '^FAILED' },
    { name: 'verdict', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' },
  ],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
}, wd).spec;


export const PLAN = (wd, steps) => JSON.stringify({
  schema: 'plan-v1',
  steps: steps ?? [{
    id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
    tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  }],
});


/** collect spine events in memory (the pure-listener contract) */
export const collector = () => {
  /** @type {any[]} */
  const events = [];
  return { events, emit: (type, data = {}) => { const e = { type, ...data }; events.push(e); return e; } };
};


export async function go(wd, provider, { job = JOB(wd), capRuns = 3, layerRoot = false, scoutRounds, now, providerFor, bridge, resumeSeed, resumeBranch, scout } = {}) {
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns, layerRoot, remainingUsd: () => 1.5, ...(scoutRounds ? { scoutRounds } : {}), ...(now ? { now } : {}), ...(providerFor ? { providerFor } : {}), ...(bridge ? { bridge } : {}), ...(resumeSeed ? { resumeSeed } : {}), ...(resumeBranch ? { resumeBranch } : {}), ...(scout !== undefined ? { scout } : {}) });
  return { outcome, events };
}


// ── F85: the meter REPORTS progress; it does not decide on it.
//
// u-msh70zla is the whole reason this section exists. One wide step was
// CONVERGING — its close counted 24 → 15 → 14 strict errors across three
// attempts, and the step ladder recorded `wrote: true, strikes: 0` every time —
// when the money meter fired at a 0.618 share. The stop was CORRECT (the step
// really was eating the run), but everything the stop then SAID about it was
// false: the replan reason was the fixed string "with its exits unmoved", and
// the materials handed to the replanner said only "step 1 of 1 did not finish".
// Believing nothing had been achieved, the replanner decomposed and re-targeted
// a file that was already at zero errors; that step wrote nothing twice, struck
// out, and killed the run with $1.09 and 7 minutes unspent.
//
// hamr's ruling: *"meter is right but missing a piece … it should give heads up
// on money/time + progress for llm to judge"*. So the trigger is untouched and
// the READOUT gains the run's measured trajectory — from the ONE trend
// instrument the money halt already reads, never a second one.

/** `n` TODO markers — the thing the counting patient's close counts. */
export const todos = (n, pad = '') => `export const x = 1;\n${`// TODO${pad}\n`.repeat(n)}`;


// PRD item 27/M2: signCloseScripts auto-fills sha256 from the real count.mjs
// (or whatever `over.close` names) already written at `wd`.
export const COUNT_JOB = (wd, over = {}) => signCloseScripts({
  schema: 'job-v1',
  job: 'count-patient',
  description: 'shrink the strict-error count through an agent-authored plan',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Remove the TODO markers from src/mod.mjs so the typecheck stage greens.',
  verdictType: 'green',
  close: [{ name: 'typecheck', cmd: 'node count.mjs', expect: 0, gapKeep: '^red' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
}, wd).spec;


/**
 * Drive a counting-patient run with a wallet the RUN'S OWN progress drains: after
 * the Nth judged exit the balance drops to `to`. Deterministic, and it cannot
 * silently retarget if the number of wallet reads changes (the F37 class).
 */
export async function countRun(wd, script, drains, { job, start = 1.5, over = {}, onJudged } = {}) {
  job = job ?? COUNT_JOB(wd);
  const provider = scriptedProvider(script);
  const jv = validateJob(job);
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const { events, emit } = collector();
  let judged = 0;
  let balance = start;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data) => {
    // `onJudged` is the CLOCK's seam, the wallet's mirror: a test that needs the wall
    // to pass at a precise point in the run drives it off the same counted event the
    // drains do (never a provider-call index, which silently retargets the moment the
    // number of calls changes — the F37 class). Absent by default, so every existing
    // caller renders byte-identically.
    if (type === 'exit-eval') { judged += 1; if (drains[judged] !== undefined) balance = drains[judged]; onJudged?.(judged); }
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit: emit2, capRuns: 3, remainingUsd: () => balance, ...over });
  return { outcome, events, provider };
}


// ── F64: the wall clock's own stop must never be filed as a transport casualty.
// A provider-red is a CASUALTY by doctrine — never evidence, retry, and it carries
// the F44 spendComplete:false floor. So a run that correctly ran out of the
// operator's TIME must not ride out under the label reserved for a dead socket.

/** a fake clock the test drives: the provider advances it on the call it chooses */
export const fakeClock = (startMs = 1_000_000) => {
  const state = { ms: startMs };
  return { now: () => state.ms, advance: (by) => { state.ms += by; } };
};


// ── casualty routing across EVERY provider-consuming phase ──────────────────
//
// Doctrine: an API truncation is TRANSPORT class — retry, never capability
// evidence, never interpreter-red/config-red (the `truncated:` leg at
// src/planrun.js:735-743). And a casualty is a casualty wherever the provider is
// consumed: the plan flow calls out from five places (scout, plan drafter, step
// worker, replan drafter, close-fix worker) and each must file the same event
// under the same name, or the readout's casualty count is phase-shaped.
//
// Prior coverage was ONE cell of that grid: a mid-STEP transport THROW (the
// F11/F44 test above). Truncation reaches the router by the OTHER seam — a
// RETURNED `r.error`, not a throw — and the drafting/replan/fix phases had no
// casualty coverage at all.

/**
 * A scripted provider whose Nth call onward (0-based) dies instead of answering.
 * Same wrap idiom as the F11/F44 mid-step test, factored because four phases
 * need it at four different call positions.
 * @param {any[]} script @param {number} n @param {() => Error} [thrower]
 */
export const dyingAt = (script, n, thrower = () => Object.assign(new Error('ECONNRESET mid-call'), { category: 'provider-red', lib: 'bare-agent' })) => {
  const base = scriptedProvider(script);
  let i = 0;
  return {
    calls: base.calls,
    toolsOffered: base.toolsOffered,
    /** @param {any} messages @param {any} tools */
    async generate(messages, tools) {
      if (i++ >= n) throw thrower();
      return base.generate(messages, tools);
    },
  };
};


/** the fix-loop fixture: a close STRICTER than the check, so every step greens on
 * its own exits and the outer close still reds — the one shape that opens the
 * close-fix loop. @param {string} wd */
export const strictCloseOverCheck = (wd) => writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('ok') && t.includes('import')) process.exit(0);
console.log('FAILED close: the test never imports the module'); process.exit(1);\n`);


// ── W-2: the wall, read BETWEEN close-fix iterations. Nothing used to read the
// clock between the last step and the outer close, and the fix loop re-ran the FULL
// staged close every iteration with no wall read at all. Past the deadline each fix
// worker is stopped on its first round by the metered clock check — it writes
// nothing — so every post-wall iteration was zero work plus a full re-grade of an
// UNCHANGED tree, minting the verdict already on the record, capRuns times over (60
// minutes each on the shipped four-stage spec). hamr's ruling: keep the grade we
// already have and stop, then ask the human for more time or a different goal.

/** the events emitted from the `fix-loop` marker onward — the close-fix loop's own
 * record, separated from the step loop's (which emits the same event types). */
export const afterFixLoop = (events) => {
  const i = events.findIndex((e) => e.type === 'fix-loop');
  assert.ok(i >= 0, 'the fix loop opened — every assertion below is about what happened inside it');
  return events.slice(i);
};


/** A close that COUNTS what is still missing — the numeric shape every shipped
 * u-close has, and the one the trend instrument is built to read. Still stricter
 * than the `clean-run` check (which greens on "ok"), so the fix loop opens.
 * Declared HERE rather than beside its §4 users because the wall halt reads the
 * same instrument they do — one close shape, two sites, never two spellings.
 * @param {string} wd @param {string[]} markers */
export const countingClose = (wd, markers = ['import', 'DONE']) => writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
const missing = ${JSON.stringify(markers)}.filter((k) => !t.includes(k));
if (missing.length === 0) process.exit(0);
console.log(\`FAILED red: \${missing.length} requirement(s) missing\`); process.exit(1);\n`);


/** the step's own iterations — the close precheck and the fix loop emit the same
 * event type, so the window has to be cut at the step boundaries */
export const stepIterations = (events) => {
  const a = events.findIndex((e) => e.type === 'step-start');
  const b = events.findIndex((e) => e.type === 'step-end');
  assert.ok(a >= 0, 'a step opened');
  return events.slice(a, b === -1 ? undefined : b).filter((e) => e.type === 'iteration-start');
};
