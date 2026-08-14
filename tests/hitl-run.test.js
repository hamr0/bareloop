// N4 slice 1 — the hitl PAUSE, the CANCEL terminal, and THE RETURN, through the
// shipped entry (`runJob`), against a real patient with a real declared close.
//
// tests/hitl.test.js pins the admission and the kind; this file pins what the
// POC (poc/n4-hitl-return.md) proved with two labelled shims, now that the shims
// are code: the run pauses decision-ready at the human stage, the signer's three
// answers each land where the frozen record says they do, and the leg that comes
// back genuinely CONTINUES — same gap seam, folded wallet, unbilled clock.
//
// The riskiest assumption was never the pause; it was the RETURN. So every
// resume here is a real second `runJob` reading a real `readResume` checkpoint
// off the paused leg's own spine, with simulated days in between.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runJob } from '../src/run.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { readResume } from '../src/reuse.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

const DAYS_45 = 45 * 24 * 60 * 60_000;
/** the runner's own resumable list, with the pause on it (scripts/run-u.mjs's twin) */
const RESUMABLE = ['cap-halt', 'wall-halt', 'step-stalled', 'hitl-pause'];

/** a patient whose mechanical work stage greens once src/fix.js carries the marker */
function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hitl-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exitCode = 0; }
else { console.log('FAILED src/fix.js — missing or has no ok marker'); process.exitCode = 1; }\n`);
  const seed = initPatientRepo(dir);
  const spineDir = mkdtempSync(join(tmpdir(), 'hitl-run-spine-'));
  t.after(() => rmSync(spineDir, { recursive: true, force: true }));
  return { dir, seed, spine: join(spineDir, 'spine.jsonl') };
}

const guards = (/** @type {string[]} */ allowPrefixes) => classGuards({ verdictType: 'hitl', lang: 'js' })
  .map((g) => ({
    name: g.name,
    kind: g.kind,
    params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes } : {}) },
  }));

/** mechanical first, human LAST — the composition law, as a real declaration */
const DECL = () => ({
  genre: GENRE,
  lang: 'js',
  stages: [
    guards(['src/'])[0],
    { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } },
    guards(['src/'])[1],
    { name: 'signer-reviews', kind: 'human-confirms', params: { ask: 'Does this fix read like something you would ship?' } },
  ],
});

const hitlJob = () => ({
  schema: 'job-v1',
  job: 'hitl-through-runjob',
  description: 'a job whose done needs a person to say so',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Create src/fix.js with an ok marker, then have the signer review it.',
  verdictType: 'hitl',
  closeDecl: DECL(),
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});

const approve = (/** @type {any} */ job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];

const PLAN = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-fix',
    action: 'Create src/fix.js containing the ok marker.',
    tools: ['write'], rounds: 6, target: 'src/fix.js',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }],
  }],
});

const tcall = (/** @type {string} */ id, /** @type {string} */ path, /** @type {string} */ content) => ({
  toolCalls: [{ id, name: 'shell_write', arguments: { path, content } }],
});

/** a spine on an INJECTABLE clock: the deciding days pass for $0 and no waiting */
function virtualSpine(/** @type {string} */ file, /** @type {any} */ clock, startSeq = 0) {
  let seq = startSeq;
  return (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    const { type: _t, seq: _s, ts: _ts, ...payload } = data ?? {};
    const ev = { type, ...payload, seq: ++seq, ts: new Date(clock.t).toISOString() };
    clock.t += clock.stepMs;
    appendFileSync(file, `${JSON.stringify(ev)}\n`);
    return ev;
  };
}
const readEvents = (/** @type {string} */ f) => readFileSync(f, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
/** a provider that must never be called — accept and cancel buy no worker round */
const forbiddenProvider = () => {
  const state = { calls: 0 };
  return { state, async generate() { state.calls += 1; throw new Error('a worker round was bought on a path that must buy none'); } };
};

/** LEG 1: run cold to the human stage and pause. Returns the spine and the checkpoint. */
async function pauseLeg(t) {
  const { dir, seed, spine } = makePatient(t);
  const job = hitlJob();
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, [], 'the hitl spec must validate before it is signed');
  const clock = { t: Date.parse('2026-08-13T09:00:00.000Z'), stepMs: 500 };
  const provider = scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },
    { text: PLAN },
    tcall('t1', join(dir, 'src', 'fix.js'), '// ok\n'),
    { text: 'wrote src/fix.js' },
  ]);
  const outcome = await runJob(job, { approvals: approve(job), workdir: dir, provider, emit: virtualSpine(spine, clock) });
  return { dir, seed, spine, job, outcome, events: readEvents(spine) };
}

/** resume the paused leg with the signer's answer, exactly as a runner would */
async function resume(leg, { humanRuling, provider, at = null, capRuns = 3 }) {
  const events = readEvents(leg.spine);
  const d = readResume(events, { direct: true, resumableOutcomes: RESUMABLE });
  const clock = { t: (at ?? Date.parse(events.at(-1).ts) + DAYS_45), stepMs: 500 };
  const outcome = await runJob(leg.job, {
    approvals: approve(leg.job), workdir: leg.dir, provider, capRuns,
    emit: virtualSpine(leg.spine, clock, events.at(-1).seq),
    humanRuling,
    priorSpentUsd: d.restart.priorSpentUsd,
    priorSpendComplete: d.restart.priorSpendComplete,
    priorWallMs: d.restart.priorWallMs,
    resumeSeed: d.restart.seed,
    resumeGrades: d.restart.grades,
    resumeBranch: d.restart.branch,
  });
  return { outcome, checkpoint: d, events: readEvents(leg.spine).slice(events.length) };
}

// ── §1.3/§1.4 THE PAUSE ─────────────────────────────────────────────────────

test('§1.4 — the run PAUSES at the human stage: a decision-ready terminal, never a verdict', async (t) => {
  const leg = await pauseLeg(t);
  const escalations = leg.events.filter((e) => e.type === 'escalation');
  assert.equal(leg.outcome, 'hitl-pause', JSON.stringify(escalations));

  const pause = leg.events.find((e) => e.type === 'hitl-pause');
  assert.ok(pause, 'the checkpoint is on the spine');
  assert.equal(pause.stage, 'signer-reviews');
  assert.equal(pause.decisionReady, true);
  assert.equal(pause.ask, 'Does this fix read like something you would ship?');
  assert.deepEqual(pause.options, ['accept', 'rerun', 'cancel'], 'three doors, and no fourth');

  // RULING 2 — the evidence package: every mechanical stage's own result, never
  // a bare "approve?", plus what this run actually changed
  assert.deepEqual(pause.stages.map((/** @type {any} */ s) => [s.name, s.verdict]), [
    ['changed-from-seed', 'satisfied'],
    ['verdict', 'satisfied'],
    ['no-suppressions', 'satisfied'],
    ['signer-reviews', 'human-pause'],
  ]);
  assert.deepEqual(pause.changed.paths, ['src/fix.js'], 'the before/after half: what this run changed');

  // the outer close said the same thing, in the close's own vocabulary
  const post = leg.events.find((e) => e.type === 'outer-close');
  assert.equal(post.verdict, 'human-pause');
  assert.equal(post.gap, undefined, 'nobody has said anything yet, so there is no gap');
  // …and it never became a fix loop
  assert.equal(leg.events.some((e) => e.type === 'fix-loop'), false, 'a pause is not a red: no fix worker is bought');
});

test('§1.7 — a pause is a CLEAN exit: the human stage buys no worker round, and job-end says the spend is exact', async (t) => {
  const leg = await pauseLeg(t);
  const end = leg.events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'hitl-pause');
  assert.equal(end.spendComplete, true, 'a person deciding is not an unpriced death (F44 floors only the two casualties)');
  assert.ok(end.spentUsd > 0, 'the work that got here is on the one ledger');
  const closeAt = leg.events.findIndex((e) => e.type === 'outer-close');
  assert.equal(leg.events.slice(closeAt).some((e) => e.type === 'worker-round'), false,
    'nothing was bought after the close — a human stage costs $0 and spawns nothing');
  assert.equal(leg.events.some((e) => e.type === 'plan-executed'), true, 'the plan DID run: the checkpoint is on the spine');
});

test('§1.6 — the pause reads as a CHECKPOINT through the shipped reader, with no library change beyond the name', async (t) => {
  const leg = await pauseLeg(t);
  const d = readResume(leg.events, { direct: true, resumableOutcomes: RESUMABLE });
  assert.notEqual(d.restart, null, 'resumableOutcomes alone makes the pause resumable');
  assert.equal(d.ended, false, 'deliberately NOT ended — there is something left to continue');
  assert.equal(d.endOutcome, 'hitl-pause', 'and the recorded terminal is still named honestly');
  assert.equal(d.restart.seed.phase, 'close', 'the resumed leg re-enters at the close, not at a step');
  assert.deepEqual(d.restart.seed.completedSteps.map((/** @type {any} */ c) => c.id), ['write-fix']);
  assert.equal(d.restart.branch, 'bareloop-hitl-through-runjob', 'the work branch is carried forward');
  assert.equal(d.restart.priorSpendComplete, true);

  // W-2 — the CLOCK. A clean pause leaves the pause record as the last event, so
  // the human's deciding time never enters the fold.
  const startedAt = Date.parse(leg.events.find((e) => e.type === 'job-start').ts);
  const pausedAt = Date.parse(leg.events.at(-1).ts);
  assert.equal(d.restart.priorWallMs, pausedAt - startedAt, 'exactly the paused leg\'s own elapsed');
  assert.ok(d.restart.priorWallMs < 60_000, 'seconds, not the days a person took to answer');

  // …and the hazard §1.6 names, MEASURED: a stale watchdog `at` post-dating the
  // pause bills the deciding time to the wall. The library is not where this is
  // fixed (deathAt is the runner's own preference order) — it is pinned here so
  // the runner task inherits a measured statement rather than a worry.
  const hazard = readResume(leg.events, { direct: true, resumableOutcomes: RESUMABLE, deathAt: pausedAt + DAYS_45 });
  assert.equal(hazard.restart.priorWallMs, (pausedAt - startedAt) + DAYS_45,
    'a stale watchdog report would bill 45 days of deciding to the run — the runner must prefer the pause record');
});

// ── the three doors ─────────────────────────────────────────────────────────

test('§1.4 accept — green on FRESH evidence (OPEN-3), and not one worker round bought', async (t) => {
  const leg = await pauseLeg(t);
  const fp = forbiddenProvider();
  const r = await resume(leg, { humanRuling: { decision: 'accept' }, provider: fp });

  assert.equal(fp.state.calls, 0, 'accept buys NO worker round');
  assert.equal(r.events.some((e) => e.type === 'worker-round'), false);
  // OPEN-3, and it needed no new machinery: the resumed leg's close PRECHECK
  // re-runs every mechanical stage against the tree as it stands TODAY, then the
  // human stage renders the signer's own accept.
  const pre = r.events.find((e) => e.type === 'close-precheck');
  assert.deepEqual(pre.stages.map((/** @type {any} */ s) => [s.name, s.verdict]), [
    ['changed-from-seed', 'satisfied'],
    ['verdict', 'satisfied'],
    ['no-suppressions', 'satisfied'],
    ['signer-reviews', 'satisfied'],
  ]);
  // THE POC's naming finding, kept: the terminal is `already-green`, because the
  // close was satisfied before this leg did anything.
  assert.equal(r.outcome, 'already-green');
  const end = r.events.find((e) => e.type === 'job-end');
  assert.equal(end.spendComplete, true);
  assert.equal(end.spentUsd, leg.events.find((e) => e.type === 'job-end').spentUsd,
    'the spend is exactly what the paused leg had already spent');
});

test('§1.4 accept — OPEN-3\'s control: a tree that CHANGED during the pause does not mint anything', async (t) => {
  const leg = await pauseLeg(t);
  rmSync(join(leg.dir, 'src', 'fix.js'), { force: true }); // 45 days is long enough for a human to break it
  const p = scriptedProvider([{ text: 'the fix worker writes nothing' }]);
  const r = await resume(leg, { humanRuling: { decision: 'accept' }, provider: p, capRuns: 1 });
  assert.equal(['green', 'already-green'].includes(r.outcome), false, JSON.stringify(r.outcome));
  // the deletion put the tree back AT the seed, so the FIRST mechanical guard is
  // what refuses — on fresh evidence, before the person's answer is ever reached
  assert.equal(r.events.find((e) => e.type === 'close-precheck').stage, 'changed-from-seed');
});

test('§1.4 cancel — terminal: no gap, no fix loop, no worker round, and the spend stays exact', async (t) => {
  const leg = await pauseLeg(t);
  const fp = forbiddenProvider();
  const r = await resume(leg, { humanRuling: { decision: 'cancel' }, provider: fp });
  assert.equal(r.outcome, 'hitl-cancel');
  const rec = r.events.find((e) => e.type === 'hitl-cancel');
  assert.equal(rec.gap, null, 'explicitly null: cancel is terminal, and there is nothing for a worker to convert');
  assert.equal(rec.decisionReady, true);
  assert.equal(r.events.some((e) => e.type === 'fix-loop'), false);
  assert.equal(fp.state.calls, 0);
  assert.equal(r.events.find((e) => e.type === 'job-end').spendComplete, true);
  // and it is TERMINAL: the reader must not offer it back as a checkpoint
  const after = readResume(readEvents(leg.spine), { direct: true, resumableOutcomes: RESUMABLE });
  assert.equal(after.endOutcome, 'hitl-cancel');
});

// ── §1.5 THE RETURN ─────────────────────────────────────────────────────────

test('§1.5 rerun — the human\'s text IS the gap, through the same seam post.gap uses, and the run CONTINUES', async (t) => {
  const leg = await pauseLeg(t);
  const p = scriptedProvider([
    tcall('f1', join(leg.dir, 'src', 'fix.js'), '// ok\n// and the edge case the signer asked about\n'),
    { text: 'addressed the signer\'s note' },
  ]);
  const r = await resume(leg, {
    humanRuling: { decision: 'rerun', text: 'it never handles the empty-input case — say what happens there' },
    provider: p,
  });

  const ask = p.calls[0] ?? '';
  assert.ok(r.events.some((e) => e.type === 'fix-loop'), 'the human red opened the fix loop');
  assert.ok(ask.includes("The verification's output on the tree as it stands (not an attempt of yours):"),
    'the SAME seam post.gap uses — no new channel (ruling 3 is literal)');
  assert.ok(ask.includes('it never handles the empty-input case'), 'carrying the human\'s own words');
  assert.ok(ask.includes('close stage "signer-reviews" failed:'), 'under the close\'s own stage header');

  // the run genuinely CONTINUES: the wallet folds, and no step is re-bought
  assert.equal(r.events.some((e) => e.type === 'step-start'), false, 're-entered at the close, never at a step');
  assert.equal(r.events.find((e) => e.type === 'step-skipped')?.step, 'write-fix');
  assert.equal(r.events.find((e) => e.type === 'job-start').priorSpentUsd,
    leg.events.find((e) => e.type === 'job-end').spentUsd, 'the leg declares the fold it inherited');

  // …and when the mechanical stages pass again, the ruling is SPENT and the run
  // pauses for a SECOND review rather than converting the same words forever
  assert.equal(r.outcome, 'hitl-pause');
  assert.equal(r.events.filter((e) => e.type === 'hitl-pause').length, 1);
  const end = r.events.find((e) => e.type === 'job-end');
  assert.ok(end.spentUsd > leg.events.find((e) => e.type === 'job-end').spentUsd, 'the wallet continued from the paused leg');
  assert.equal(end.spendComplete, true);
});

test('§1.5 rerun — a fix that leaves a MECHANICAL stage red keeps converting: first-red-wins shields the person', async (t) => {
  const leg = await pauseLeg(t);
  const p = scriptedProvider([
    // NOTE: the marker is the literal `ok`, so the red content must not contain
    // it as a substring — "broken" does, which is exactly the fixture trap that
    // makes a should-differ arm green (audited, then fixed).
    tcall('f1', join(leg.dir, 'src', 'fix.js'), '// regressed\n'),   // the work stage goes red
    { text: 'attempt 1' },
    tcall('f2', join(leg.dir, 'src', 'fix.js'), '// ok again\n'),
    { text: 'attempt 2' },
  ]);
  const r = await resume(leg, {
    humanRuling: { decision: 'rerun', text: 'tighten it up' },
    provider: p,
  });
  // the worker is asked more than once, and the SECOND wall it is shown is the
  // command stage's own output — never the human's sentence again
  assert.ok(p.calls.length >= 2, 'the loop iterated on the MECHANICAL red rather than stopping');
  assert.ok(p.calls.some((/** @type {string} */ a) => a.includes('FAILED src/fix.js')),
    `the command stage's wall reached the worker: ${JSON.stringify(p.calls.map((/** @type {string} */ a) => a.slice(0, 120)))}`);
  assert.equal(r.outcome, 'hitl-pause', 'and once the machine is happy again, the person is asked once more');
});

test('§1.3 — a PAUSE is never GRADED by the fix governor: a non-verdict must not mint a strike that ends the run as a cap-halt', async (t) => {
  // The hole a surviving mutant found. This close's output carries no comparable
  // NUMBER, so the governor is blind and its bound is the iteration COUNT — which
  // makes a pause recorded as a reading one extra tick, on a loop that has
  // already spent its ticks converting a mechanical red.
  //
  // The arithmetic, so the arm is not accidental: the trend opens SEEDED with the
  // grade the loop started on, and the blind rule strikes at
  // `uncomparableRun - 1 >= capRuns`. Seed + one red iteration is 2 readings, so
  // at capRuns 2 the loop is alive (2-1 < 2) to reach the pause — and the pause's
  // own tick would be the 3rd, which strikes (3-1 >= 2) and reports a cap-halt
  // for a run that in fact reached the person.
  const leg = await pauseLeg(t);
  const p = scriptedProvider([
    tcall('f1', join(leg.dir, 'src', 'fix.js'), '// nope\n'), { text: 'attempt 1' },
    tcall('f2', join(leg.dir, 'src', 'fix.js'), '// ok now\n'), { text: 'attempt 2' },
  ]);
  const r = await resume(leg, {
    humanRuling: { decision: 'rerun', text: 'it is not right yet' },
    provider: p,
    capRuns: 2,
  });
  assert.equal(r.outcome, 'hitl-pause',
    `the run reached the person; a graded pause would have struck the loop out first: ${JSON.stringify(r.events.filter((e) => e.type === 'escalation').map((e) => e.category))}`);
  const ladders = r.events.filter((e) => e.type === 'ladder');
  assert.equal(ladders.at(-1).paused, true, 'the last reading says what it is — waiting on a person, not a grade');
  assert.equal(ladders.at(-1).strikes, undefined, 'and it mints no strike at all');
});

test('§1.5 — a rerun with no text never reaches a worker: the run refuses the decision instead', async (t) => {
  const leg = await pauseLeg(t);
  const fp = forbiddenProvider();
  const r = await resume(leg, { humanRuling: { decision: 'rerun', text: '   \n' }, provider: fp });
  assert.equal(r.outcome, 'hitl-decision-red');
  assert.equal(fp.state.calls, 0, 'nothing is spent on a decision the run cannot act on');
  const esc = r.events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'hitl-decision-red');
  assert.match(esc.detail, /text/i);
  assert.equal(r.events.find((e) => e.type === 'job-end').spendComplete, true);
});

test('§1.5 — a decision handed to a job with no human stage is refused, not silently ignored', async (t) => {
  const { dir, spine } = makePatient(t);
  const job = hitlJob();
  job.closeDecl = { ...DECL(), stages: DECL().stages.slice(0, 3) };  // mechanical only
  const fp = forbiddenProvider();
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: dir, provider: fp,
    emit: virtualSpine(spine, { t: Date.now(), stepMs: 500 }),
    humanRuling: { decision: 'accept' },
  });
  assert.equal(outcome, 'hitl-decision-red');
  assert.equal(fp.state.calls, 0);
  assert.match(readEvents(spine).find((e) => e.type === 'escalation').detail, /no human-confirms stage/i);
});

test('§1.4 — nothing in a run may consume the ruling twice: a cold run with no decision never pauses early', async (t) => {
  // the CONTROL for the pause branch at the precheck: on a cold run the
  // mechanical stages are red at seed, so first-red-wins never reaches the person
  const leg = await pauseLeg(t);
  const pre = leg.events.find((e) => e.type === 'close-precheck');
  assert.equal(pre.stage, 'changed-from-seed', 'the seed read stopped at the first mechanical stage');
  assert.equal(pre.verdict, 'needs_revision');
  assert.equal(leg.events.filter((e) => e.type === 'hitl-pause').length, 1, 'exactly one pause, at the end of the run');
});
