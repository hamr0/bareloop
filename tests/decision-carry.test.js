// Softgreen module 7 — F102 (the answer survives the crash) and F103 (the rerun
// buys its own clock), through the shipped entry (`runJob`) against a real patient
// with a real declared close.
//
// F102's incident, in one sentence: the signer took the rerun door and typed his
// words, the leg stopped before a single round was bought, and the resume asked him
// the byte-identical question again — because the decision lived only in the
// in-flight process. What is pinned here is the two halves of the cure: the halt
// RECORDS the decision (it is on the spine, so it is in the checkpoint), and a leg
// carrying one re-enters the FIX LOOP with it rather than re-rendering the ask.
//
// F103's incident: the rerun door opened onto 87 seconds, because the wall folds
// across legs and a person does not decide on the run's clock. What is pinned here
// is the SPLIT: the chain view still totals every leg (the halt readout's job), and
// the ENGAGEMENT view is what bounds this one. Money is deliberately NOT symmetric
// — the signed budget stays the chain's ceiling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { readResume } from '../src/reuse.js';
import { resolveHumanRuling } from '../src/kinds.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

/** the runner's own resumable list, the twin of scripts/run-u.mjs's */
const RESUMABLE = ['cap-halt', 'wall-halt', 'step-stalled', 'hitl-pause'];
const WORDS = 'the new d.ts leans on `any` for every query result — give them real types';

function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'decision-carry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exitCode = 0; }
else { console.log('FAILED src/fix.js — missing or has no ok marker'); process.exitCode = 1; }\n`);
  const seed = initPatientRepo(dir);
  const spineDir = mkdtempSync(join(tmpdir(), 'decision-carry-spine-'));
  t.after(() => rmSync(spineDir, { recursive: true, force: true }));
  return { dir, seed, spine: join(spineDir, 'spine.jsonl') };
}

const guards = (/** @type {string[]} */ allowPrefixes) => classGuards({ verdictType: 'hitl', lang: 'js' })
  .map((g) => ({
    name: g.name,
    kind: g.kind,
    params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes } : {}) },
  }));

const SPEC = () => ({
  schema: 'job-v1',
  job: 'decision-carry',
  description: 'a job whose done needs a person to say so',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  maxWallMs: 30 * 60_000,
  writeScope: ['src/**'],
  goal: 'Create src/fix.js with an ok marker, then have the signer review it.',
  verdictType: 'hitl',
  closeDecl: {
    genre: GENRE,
    lang: 'js',
    stages: [
      guards(['src/'])[0],
      { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } },
      guards(['src/'])[1],
      { name: 'signer-reviews', kind: 'human-confirms', params: { ask: 'Does this fix read like something you would ship?' } },
    ],
  },
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
const forbiddenProvider = () => {
  const state = { calls: 0 };
  return { state, async generate() { state.calls += 1; throw new Error('a worker round was bought on a path that must buy none'); } };
};

/** LEG 1 — run cold to the human stage and pause */
async function pauseLeg(t) {
  const { dir, seed, spine } = makePatient(t);
  const job = SPEC();
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, [], 'the spec must validate before it is signed');
  const clock = { t: Date.parse('2026-08-18T09:00:00.000Z'), stepMs: 500 };
  const provider = scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },
    { text: PLAN },
    tcall('t1', join(dir, 'src', 'fix.js'), '// ok\n'),
    { text: 'wrote src/fix.js' },
  ]);
  const outcome = await runJob(job, { approvals: approve(job), workdir: dir, provider, emit: virtualSpine(spine, clock) });
  assert.equal(outcome, 'hitl-pause', 'leg 1 must reach the human stage');
  return { dir, seed, spine, job, events: readEvents(spine) };
}

/** resume a leg exactly as the runner does, with whatever folds/rulings the case needs */
async function resume(leg, { humanRuling = null, heldRuling = null, provider, spentUsd = null, wallMs = null, capRuns = 3 } = {}) {
  const events = readEvents(leg.spine);
  const d = readResume(events, { direct: true, resumableOutcomes: RESUMABLE });
  const clock = { t: Date.parse(events.at(-1).ts) + 60_000, stepMs: 500 };
  const outcome = await runJob(leg.job, {
    approvals: approve(leg.job), workdir: leg.dir, provider, capRuns,
    emit: virtualSpine(leg.spine, clock, events.at(-1).seq),
    ...(humanRuling === null ? {} : { humanRuling }),
    ...(heldRuling === null ? {} : { heldRuling }),
    priorSpentUsd: spentUsd ?? d.restart.priorSpentUsd,
    priorSpendComplete: d.restart.priorSpendComplete,
    priorWallMs: wallMs ?? d.restart.priorWallMs,
    resumeSeed: d.restart.seed,
    resumeGrades: d.restart.grades,
    resumeBranch: d.restart.branch,
  });
  return { outcome, checkpoint: d, events: readEvents(leg.spine).slice(events.length) };
}

/** the F102 shape, reproduced: the person takes the rerun door and the leg stops
 * before one round is ever bought for their words.
 *
 * The stop is the one the programme actually keeps meeting — an outside kill (a
 * watchdog, a harness, a SIGKILL) — and it is modelled the way this repo has always
 * modelled it: a killed process leaves exactly a PREFIX of its own log. The leg is
 * real, the decision record is real, and what is cut is the tail a dead process
 * never wrote. */
async function strandedRerun(t, { wallMs = null } = {}) {
  const leg = await pauseLeg(t);
  const fp = forbiddenProvider();
  const r = await resume(leg, {
    humanRuling: { decision: 'rerun', text: WORDS }, provider: fp, ...(wallMs === null ? {} : { wallMs }),
  });
  const all = readEvents(leg.spine);
  const at = all.findLastIndex((e) => e.type === 'human-decision');
  assert.ok(at > 0, 'the leg recorded what it was handed before it died');
  writeFileSync(leg.spine, `${all.slice(0, at + 1).map((e) => JSON.stringify(e)).join('\n')}\n`);
  return { leg, r, fp, decisionRecord: all[at], legEvents: r.events };
}

// ── F102 half 1: THE HALT RECORDS THE DECISION ──────────────────────────────

test('F102 — a decision received and never paid for is ON THE SPINE, and the checkpoint surfaces it', async (t) => {
  const { leg, r } = await strandedRerun(t);
  assert.equal(r.events.some((e) => e.type === 'worker-round'), false,
    'the leg died before a single round was bought for the words');

  const got = r.events.find((e) => e.type === 'human-decision');
  assert.ok(got, 'the leg RECORDS what it was handed — the field F102 says was missing');
  assert.equal(got.decision, 'rerun');
  assert.equal(got.text, WORDS, 'verbatim: the words ARE the gap');
  assert.equal(got.source, 'operator', 'this leg was answered by a person, not by a checkpoint');
  assert.equal(r.events.some((e) => e.type === 'human-decision-spent'), false,
    'nothing bought it, so nothing spent it');

  // and the CHECKPOINT — the artifact a resume reads — carries it
  const d = readResume(readEvents(leg.spine), { direct: true, resumableOutcomes: RESUMABLE });
  assert.ok(d.restart, 'a killed leg is a checkpoint');
  assert.equal(d.restart.pendingDecision.decision, 'rerun');
  assert.equal(d.restart.pendingDecision.text, WORDS);
  assert.equal(d.restart.pendingDecision.source, 'operator');
  assert.equal(d.restart.pendingDecision.receivedAt, got.ts, 'when the run learned it, off the record itself');
});

test('F102 — a decision the run PAID FOR is spent, and no checkpoint re-offers it', async (t) => {
  const leg = await pauseLeg(t);
  const p = scriptedProvider([
    tcall('f1', join(leg.dir, 'src', 'fix.js'), '// ok\n// the signer\'s note, addressed\n'),
    { text: 'addressed it' },
  ]);
  const r = await resume(leg, { humanRuling: { decision: 'rerun', text: WORDS }, provider: p });
  const spent = r.events.find((e) => e.type === 'human-decision-spent');
  assert.ok(spent, 'a round was bought for the words: the decision is spent');
  assert.equal(spent.decision, 'rerun');
  assert.equal(spent.reason, 'fix-round', 'spent by the work it commissioned, never merely by the loop opening');
  const d = readResume(readEvents(leg.spine), { direct: true, resumableOutcomes: RESUMABLE });
  assert.equal(d.restart === null || d.restart.pendingDecision === null, true,
    'the next leg must not re-apply words a worker already holds');
});

test('F102 — an ACCEPT that greened is spent; a pause records its own spending', async (t) => {
  const leg = await pauseLeg(t);
  const fp = forbiddenProvider();
  const r = await resume(leg, { humanRuling: { decision: 'accept' }, provider: fp });
  assert.equal(r.outcome, 'already-green');
  assert.deepEqual(
    r.events.filter((e) => e.type === 'human-decision-spent').map((e) => [e.decision, e.reason]),
    [['accept', 'accepted']],
  );

  const leg2 = await pauseLeg(t);
  const r2 = await resume(leg2, { humanRuling: { decision: 'pause' }, provider: forbiddenProvider() });
  assert.equal(r2.outcome, 'hitl-pause');
  assert.deepEqual(
    r2.events.filter((e) => e.type === 'human-decision-spent').map((e) => [e.decision, e.reason]),
    [['pause', 'paused']],
    'a pause is answered in full the moment it is honoured — it never becomes a held decision nobody can undo',
  );
  const d = readResume(readEvents(leg2.spine), { direct: true, resumableOutcomes: RESUMABLE });
  assert.equal(d.restart.pendingDecision, null, 'so the same three doors are open next time');
});

// ── F102 half 2: THE RESUME RE-ENTERS THE FIX LOOP, NEVER THE ASK ───────────

test('F102 — a resume carrying a HELD rerun converts it, and never re-renders the ask', async (t) => {
  const { leg, r } = await strandedRerun(t);
  const held = readResume(readEvents(leg.spine), { direct: true, resumableOutcomes: RESUMABLE }).restart.pendingDecision;
  assert.ok(held);

  const p = scriptedProvider([
    tcall('f1', join(leg.dir, 'src', 'fix.js'), '// ok\n// the signer\'s note, addressed\n'),
    { text: 'addressed it' },
  ]);
  // the signer types NOTHING this time — that is the whole finding
  const r2 = await resume(leg, { heldRuling: held, provider: p });

  // the human stage RENDERED the held answer instead of pausing on it — the one
  // record that tells "applied" from "asked again" apart at the source
  const pre = r2.events.find((e) => e.type === 'close-precheck');
  assert.deepEqual(pre.stages.at(-1), { ...pre.stages.at(-1), name: 'signer-reviews', verdict: 'needs_revision' },
    'the human stage RENDERED the held answer (a red carrying their words) — `human-pause` there would be the ask, put a second time');
  const fixAt = r2.events.findIndex((e) => e.type === 'fix-loop');
  assert.ok(fixAt >= 0, 'the held words opened the fix loop');
  assert.equal(r2.events.slice(0, fixAt).some((e) => e.type === 'hitl-pause'), false,
    'F102: the byte-identical question is NOT asked again');
  assert.ok((p.calls[0] ?? '').includes(WORDS), 'and the worker holds the person\'s own words');

  const got = r2.events.find((e) => e.type === 'human-decision');
  assert.equal(got.source, 'checkpoint', 'honest provenance: this leg was answered by a record, not by a person');
  assert.equal(got.receivedAt, held.receivedAt, 'and it still says when the person actually said it');
  assert.notEqual(got.ts, got.receivedAt, 'the two stamps are different facts and are not collapsed');
  assert.ok(r2.events.some((e) => e.type === 'human-decision-spent'), 'this leg paid for it');
  // unchanged by the carry: the person is asked again once the tree is machine-clean
  assert.equal(r2.outcome, 'hitl-pause');
});

test('F102 — a HELD accept and a HELD pause are honoured through the same seam, buying nothing', async (t) => {
  const leg = await pauseLeg(t);
  const heldAccept = { decision: 'accept', text: null, receivedAt: '2026-08-18T08:00:00.000Z', source: 'checkpoint' };
  const fp = forbiddenProvider();
  const r = await resume(leg, { heldRuling: heldAccept, provider: fp });
  assert.equal(r.outcome, 'already-green', 'the held accept greens on FRESH evidence, exactly as a fresh one does');
  assert.equal(fp.state.calls, 0);
  assert.equal(r.events.find((e) => e.type === 'human-decision').source, 'checkpoint');

  const leg2 = await pauseLeg(t);
  const fp2 = forbiddenProvider();
  const r2 = await resume(leg2, {
    heldRuling: { decision: 'pause', text: null, receivedAt: '2026-08-18T08:00:00.000Z', source: 'checkpoint' },
    provider: fp2,
  });
  assert.equal(r2.outcome, 'hitl-pause', 'a held pause REMAINS paused');
  assert.equal(fp2.state.calls, 0);
  assert.equal(r2.events.findLast((e) => e.type === 'hitl-pause').humanDecision, 'pause');
});

test('F102 — a FRESH answer over a HELD one is refused by name: two answers to one question is ambiguity', async (t) => {
  const leg = await pauseLeg(t);
  const fp = forbiddenProvider();
  const r = await resume(leg, {
    humanRuling: { decision: 'accept' },
    heldRuling: { decision: 'rerun', text: WORDS, receivedAt: '2026-08-18T08:00:00.000Z', source: 'checkpoint' },
    provider: fp,
  });
  assert.equal(r.outcome, 'hitl-decision-red', 'refused, and refused BEFORE anything costs anything');
  assert.equal(fp.state.calls, 0);
  const esc = r.events.find((e) => e.type === 'escalation');
  assert.match(esc.detail, /rerun/, 'the HELD decision is named — the operator has to know what they are overriding');
  assert.equal(r.events.some((e) => e.type === 'human-decision'), false, 'nothing was received: an ambiguity is not an answer');

  // and the resolver says the same thing on its own, for any adopter that asks first
  const res = resolveHumanRuling({ decision: 'accept' }, { decision: 'rerun', text: WORDS });
  assert.equal(res.ok, false);
  assert.match(String(res.why), /rerun/);
});

// ── F103: THE RERUN BUYS ITS OWN CLOCK ──────────────────────────────────────

test('F103 — a decide-time rerun does NOT inherit the dead leg\'s wall: two counters, side by side', async (t) => {
  const leg = await pauseLeg(t);
  // the F103 shape, in its own arithmetic: every minute of the signed wall already
  // burnt by the leg the person is deciding ABOUT
  const burnt = leg.job.maxWallMs + 90_000;
  const p = scriptedProvider([
    tcall('f1', join(leg.dir, 'src', 'fix.js'), '// ok\n// addressed\n'),
    { text: 'addressed it' },
  ]);
  const r = await resume(leg, { humanRuling: { decision: 'rerun', text: WORDS }, provider: p, wallMs: burnt });

  assert.notEqual(r.outcome, 'wall-halt', 'F103: an engagement commissioned by a person does not open onto 87 seconds');
  assert.ok(p.calls.length > 0, 'and it actually bought the round the person asked for');

  const eng = r.events.find((e) => e.type === 'engagement');
  assert.equal(eng.kind, 'rerun');
  assert.equal(eng.chainWallMs, burnt, 'the CHAIN view still totals every leg — that is the halt readout\'s number');
  assert.equal(eng.engagementPriorWallMs, 0, 'the ENGAGEMENT view is what bounds THIS leg, and it starts at zero');
  assert.equal(eng.wallCapMs, leg.job.maxWallMs, 'the cap is the signed one, never rewritten');

  // the run's own clock agrees, and says both numbers
  const wc = r.events.find((e) => e.type === 'wall-clock');
  assert.equal(wc.chainWallMs, burnt);
  assert.ok(wc.remainingMs > 0, 'the engagement has real time in it');

  // and the FOLD it declares is engagement-scoped, so the next resume of THIS leg
  // inherits this engagement's minutes rather than the dead one's all over again
  const start = r.events.find((e) => e.type === 'job-start');
  assert.equal(start.priorWallMs, undefined, 'no wall folds into a fresh engagement');
  assert.equal(start.chainWallMs, burnt, 'but the chain total is declared, never lost');
});

test('F103 — an ordinary resume still FOLDS the wall: W-2 is untouched where it was designed for', async (t) => {
  const leg = await pauseLeg(t);
  const burnt = leg.job.maxWallMs + 90_000;
  const fp = forbiddenProvider();
  // no ruling at all: this is the same engagement continuing, and it must still stop
  const r = await resume(leg, { provider: fp, wallMs: burnt });
  const eng = r.events.find((e) => e.type === 'engagement');
  assert.equal(eng.kind, 'resume');
  assert.equal(eng.engagementPriorWallMs, burnt, 'the fold is exactly what it always was');
  const wc = r.events.find((e) => e.type === 'wall-clock');
  assert.equal(wc.remainingMs, 0, 'the wall is gone, as the signed cap says it is');
  assert.equal(fp.state.calls, 0);

  // an ACCEPT is not a fresh engagement either — it commissions no work
  const leg2 = await pauseLeg(t);
  const r2 = await resume(leg2, { humanRuling: { decision: 'accept' }, provider: forbiddenProvider(), wallMs: burnt });
  assert.equal(r2.events.find((e) => e.type === 'engagement').kind, 'resume');
  assert.equal(r2.events.find((e) => e.type === 'engagement').engagementPriorWallMs, burnt);
});

test('F103 — the resolver reads BOTH doors: a review door\'s rerun is a fresh engagement too', () => {
  // the door's rerun is deliberately NOT a ruling (it answers a finished RUN, not a
  // close's human stage), so it arrives in its own slot — and "is this a fresh
  // engagement" still gets exactly one spelling.
  const door = { text: WORDS, fromRunid: 'ms1' };
  assert.equal(resolveHumanRuling(null, null, door).fresh, true, 'the door alone opens a fresh engagement');
  assert.equal(resolveHumanRuling(null, null).fresh, false, 'and a cold leg is not one');
  assert.equal(resolveHumanRuling(null, null, door).ruling, null, 'the door is never read AS a ruling');

  // PRECEDENCE, stated: the two are OR'd, never merged. A leg handed both is fresh —
  // freshness is the fail-safe direction (a fresh clock costs nothing; inheriting a
  // dead leg's wall is the structurally impossible engagement F103 measured).
  assert.equal(resolveHumanRuling({ decision: 'accept' }, null, door).fresh, true,
    'a door rerun makes the leg fresh whatever the close\'s own ruling says');
  assert.equal(resolveHumanRuling({ decision: 'accept' }, null, door).ruling.decision, 'accept',
    'and the ruling itself is untouched — one reading is shared, the two answers are not');
  // the ambiguity refusal is unchanged: the door is not a third answer to that question
  assert.equal(resolveHumanRuling({ decision: 'accept' }, { decision: 'rerun', text: WORDS }, door).ok, false);
});

test('F103 — the MONEY ceiling is the CHAIN\'s: a rerun spends the remaining signed budget, never a refill', async (t) => {
  const leg = await pauseLeg(t);
  const p = scriptedProvider([
    tcall('f1', join(leg.dir, 'src', 'fix.js'), '// ok\n// addressed\n'),
    { text: 'addressed it' },
  ]);
  // the whole signed budget already spent by the chain — and the person takes the
  // rerun door anyway. A signature for $1.5 never silently authorizes $3.
  const r = await resume(leg, {
    humanRuling: { decision: 'rerun', text: WORDS },
    provider: p, spentUsd: leg.job.budgetUsd, wallMs: 0,
  });
  assert.equal(r.outcome, 'cap-halt', 'the fresh clock buys no fresh wallet');
  const end = r.events.find((e) => e.type === 'job-end');
  assert.ok(end.spentUsd > leg.job.budgetUsd, 'the chain total is what the ledger reports, over the ceiling and honest about it');
  assert.equal(end.engagementSpentUsd, end.spentUsd - leg.job.budgetUsd,
    'the second counter, side by side: what THIS engagement spent, derived from the signed number');
  assert.ok(end.engagementSpentUsd < leg.job.budgetUsd,
    'a rerun over a drained chain buys the gate\'s own overshoot and stops — never a second budget');
  const eng = r.events.find((e) => e.type === 'engagement');
  assert.equal(eng.chainSpentUsd, leg.job.budgetUsd);
  assert.equal(eng.budgetUsd, leg.job.budgetUsd, 'the ceiling quoted is the signed one');
});

test('F103/F102 — a rerun leg that halts again hands the NEXT leg one engagement\'s wall, not the chain\'s', async (t) => {
  // the rerun leg opens its own engagement on a chain that had already burnt the
  // whole signed wall — and is killed holding the words
  const { leg } = await strandedRerun(t, { wallMs: SPEC().maxWallMs + 90_000 });
  const d = readResume(readEvents(leg.spine), { direct: true, resumableOutcomes: RESUMABLE });
  assert.ok(d.restart.priorWallMs < leg.job.maxWallMs,
    'the next leg inherits THIS engagement\'s minutes — the dead one\'s are chain history, not a bound');
  assert.equal(d.restart.pendingDecision.decision, 'rerun', 'and the words are still held: nothing bought them');
});

// ── the pinning test v1.73 ruling 5 asks for ────────────────────────────────

test('ruling 5 — PAUSE is allowance-free on a wall-exhausted checkpoint: hitl-pause, $0, nothing consumed', async (t) => {
  const leg = await pauseLeg(t);
  const fp = forbiddenProvider();
  const before = leg.events.find((e) => e.type === 'job-end').spentUsd;
  const r = await resume(leg, {
    humanRuling: { decision: 'pause' }, provider: fp,
    wallMs: leg.job.maxWallMs + 600_000, // long past the signed wall
  });
  assert.equal(r.outcome, 'hitl-pause', 'the door is the same door whatever the clock says');
  assert.equal(fp.state.calls, 0);
  const end = r.events.find((e) => e.type === 'job-end');
  assert.equal(end.spentUsd, before, 'a pause costs nothing — in any state');
  assert.equal(end.engagementSpentUsd, 0);
  assert.equal(r.events.some((e) => e.type === 'wall-clock'), false,
    'it is answered ABOVE the clock: a raise-and-re-sign changes what a rerun can BUY, never what a pause COSTS');
  // …and the checkpoint is still answerable, with every door open
  const d = readResume(readEvents(leg.spine), { direct: true, resumableOutcomes: RESUMABLE });
  assert.equal(d.endOutcome, 'hitl-pause');
  assert.equal(d.restart.pendingDecision, null, 'no allowance was consumed and none is held over the person');
});
