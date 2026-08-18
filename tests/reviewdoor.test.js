// Softgreen module 8 — THE REVIEW DOOR at the end of a run (PRD v1.71 §3).
//
// The pause machinery is re-homed: it stops being a stage INSIDE the close and
// becomes the door at the END of a run, green and softgreen alike. What is pinned
// here is the law first, because everything else is negotiable and this is not —
// hamr, verbatim: *"it's important not to change the loop self verdict"*. The close
// mints the verdict; the door records a DISPOSITION. A green stays green in the
// ledger, forever, whatever the person then does with it.
//
// The rest is the three doors at run level: `accept` re-proves the tree with the
// close's own MECHANICAL stages before it is honoured (a checkpoint lives 60 days
// and nothing freezes a tree), releases a softgreen run's quarantined credit and
// records the report card; `rerun` is a fresh engagement carrying the signer's words
// as the gap; `pause` costs nothing in any state and expires under the same TTL.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { REVIEW_DOOR, REVIEW_DOOR_CLASSES, DOOR_OPEN_OUTCOMES, doorOpens, mechanicalStages } from '../src/kinds.js';
import { answerReviewDoor, doorRecordOf, doorAgeGate } from '../src/reviewdoor.js';
import { PAUSE_TTL_MS } from '../src/reuse.js';
import { mintBridge, appendGreen, loadBridge, saveBridge } from '../src/bridges.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

const WORDS = 'the fix works but reads like a stub — give it the real implementation';

function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'review-door-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exitCode = 0; }
else { console.log('FAILED src/fix.js — missing or has no ok marker'); process.exitCode = 1; }\n`);
  const seed = initPatientRepo(dir);
  const spineDir = mkdtempSync(join(tmpdir(), 'review-door-spine-'));
  t.after(() => rmSync(spineDir, { recursive: true, force: true }));
  return { dir, seed, spine: join(spineDir, 'spine.jsonl'), spineDir };
}

const guards = (/** @type {string} */ verdictType) => classGuards({ verdictType, lang: 'js' })
  .map((g) => ({
    name: g.name,
    kind: g.kind,
    params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
  }));

/** a REAL spec, mechanical all the way through — the class is the only variable */
const SPEC = (/** @type {string} */ verdictType = 'green') => {
  const g = guards(verdictType);
  return {
    schema: 'job-v1',
    job: 'review-door',
    description: 'a job whose green is offered to a person afterwards',
    provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 },
    budgetUsd: 1.5,
    maxWallMs: 30 * 60_000,
    writeScope: ['src/**'],
    goal: 'Create src/fix.js with an ok marker.',
    verdictType,
    closeDecl: {
      genre: GENRE,
      lang: 'js',
      stages: [
        g[0],
        { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } },
        g[1],
      ],
    },
    tools: ['read', 'write', 'edit'],
    escalation: { mode: 'decision-ready' },
  };
};

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
const forbiddenProvider = () => ({ async generate() { throw new Error('a round was bought on a path that must buy none'); } });

/** a cold run that greens, with the door open or shut */
async function greenRun(t, { verdictType = 'green', reviewDoor = null, doorRerun = null, provider } = {}) {
  const p = makePatient(t);
  const job = SPEC(verdictType);
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, [], 'the spec must validate before it is signed');
  const clock = { t: Date.parse('2026-08-19T09:00:00.000Z'), stepMs: 500 };
  const prov = provider ?? scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },
    { text: PLAN },
    tcall('t1', join(p.dir, 'src', 'fix.js'), '// ok\n'),
    { text: 'wrote src/fix.js' },
  ]);
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: p.dir, provider: prov, emit: virtualSpine(p.spine, clock),
    ...(reviewDoor === null ? {} : { reviewDoor }),
    ...(doorRerun === null ? {} : { doorRerun }),
  });
  return { ...p, job, outcome, provider: prov, events: readEvents(p.spine) };
}

// ══ THE GATE — which runs open a door at all ═══════════════════════════════════

test('the door is ALWAYS ON for soft-green and OPT-IN for green — the class set is a constant, not a threshold', () => {
  assert.deepEqual([...REVIEW_DOOR_CLASSES], ['soft-green']);
  assert.deepEqual([...DOOR_OPEN_OUTCOMES], ['green', 'already-green']);
  assert.equal(doorOpens({ verdictType: 'soft-green' }), true, 'a judged green is held until a person speaks — the door is not optional');
  assert.equal(doorOpens({ verdictType: 'green' }), false, 'a green-class run is unchanged unless the operator asks for the door');
  assert.equal(doorOpens({}), false, 'no class named is the green class');
  assert.equal(doorOpens({ verdictType: 'green' }, true), true, 'and the operator can ask (one flag)');
  assert.equal(doorOpens({ verdictType: 'soft-green' }, false), false, 'and can shut it — an explicit choice, never a silent default');
});

test('the door re-proves MECHANICAL stages only — a judged floor and a person are never re-run by an accept', () => {
  const stages = [
    { name: 'changed', kind: 'files-changed' },
    { name: 'verdict', kind: 'command-exit' },
    { name: 'reads-well', kind: 'judged-floor' },
    { name: 'signer', kind: 'human-confirms' },
  ];
  assert.deepEqual(mechanicalStages(stages).map((s) => s.name), ['changed', 'verdict']);
  assert.deepEqual(mechanicalStages(null), []);
});

// ══ THE LAW — the door never changes the loop's own verdict ════════════════════

test('THE LAW: a green run with the door open still returns green, and the ledger records green', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  assert.equal(r.outcome, 'green', 'the door is a disposition — it may never touch the verdict');
  const je = r.events.findLast((e) => e.type === 'job-end');
  assert.equal(je.outcome, 'green');
  const door = doorRecordOf(r.events);
  assert.equal(door.outcome, 'green');
  assert.deepEqual(door.options, ['accept', 'rerun', 'pause']);
  assert.equal(door.decisionReady, true);
  assert.match(door.meaning, /not a verdict/);
  assert.ok(Array.isArray(door.stages) && door.stages.length >= 3, 'the evidence package carries every stage the close ran');
  assert.deepEqual(door.changed.paths, ['src/fix.js'], 'and which files the run moved');
});

test('THE LAW, the other way: a green-class run with NO flag ends exactly as it always did', async (t) => {
  const r = await greenRun(t);
  assert.equal(r.outcome, 'green');
  assert.equal(doorRecordOf(r.events), null, 'no door, no record — the opt-in default is pinned here');
});

test('a SOFT-GREEN run opens the door with no flag at all, and its verdict is still green', async (t) => {
  const r = await greenRun(t, { verdictType: 'soft-green' });
  assert.equal(r.outcome, 'green');
  const door = doorRecordOf(r.events);
  assert.equal(door.verdictType, 'soft-green');
  assert.equal(door.quarantined, true, 'the credit is held until the signer accepts (module 6)');
});

test('the FIX LOOP\'s green reaches the same door — a door may not grade how the verdict was arrived at', async (t) => {
  const p = makePatient(t);
  const job = SPEC('green');
  const clock = { t: Date.parse('2026-08-19T09:00:00.000Z'), stepMs: 500 };
  // a plan whose exit is FORM only, so the step passes on a tree the close still reds:
  // the outer close opens the fix loop, and the fix worker is what greens it
  const formOnly = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-fix',
      action: 'Create src/fix.js.',
      tools: ['write'], rounds: 6, target: 'src/fix.js',
      exit: [{ type: 'tree-changed', scope: 'src/**' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },
    { text: formOnly },
    tcall('t1', join(p.dir, 'src', 'fix.js'), '// not yet\n'),
    { text: 'wrote src/fix.js' },
    tcall('t2', join(p.dir, 'src', 'fix.js'), '// ok\n'),
    { text: 'fixed src/fix.js' },
  ]);
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: p.dir, provider, emit: virtualSpine(p.spine, clock), reviewDoor: true,
  });
  const events = readEvents(p.spine);
  assert.equal(outcome, 'green');
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop is what this test is about — without it the site is untested');
  assert.equal(doorRecordOf(events).outcome, 'green');
});

test('an ALREADY-GREEN run opens the door too, and says which verdict it is offering', async (t) => {
  const p = makePatient(t);
  const job = SPEC('green');
  writeFileSync(join(p.dir, 'src', 'fix.js'), '// ok\n');
  const clock = { t: Date.parse('2026-08-19T09:00:00.000Z'), stepMs: 500 };
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: p.dir, provider: forbiddenProvider(), emit: virtualSpine(p.spine, clock), reviewDoor: true,
  });
  assert.equal(outcome, 'already-green', 'the DISTINCT terminal is untouched — an already-green mints no learning credit');
  assert.equal(doorRecordOf(readEvents(p.spine)).outcome, 'already-green');
});

// ══ ACCEPT — it re-proves the tree before it is honoured ═══════════════════════

/** the door answer, wired the way the runner wires it */
const answer = (r, over = {}) => answerReviewDoor({
  job: r.job, workdir: r.dir, events: r.events, closeTimeoutMs: 120_000,
  at: '2026-08-19T12:00:00.000Z', ...over,
});

test('ACCEPT re-runs the close\'s mechanical stages on the tree as it stands, and is honoured when they pass', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  const a = await answer(r, { decision: 'accept' });
  assert.equal(a.ok, true, JSON.stringify(a.reds));
  assert.equal(a.next, 'accepted');
  assert.equal(a.mechanical.ran, 3, 'every mechanical stage re-ran — an accept is not a rubber stamp');
  assert.equal(a.mechanical.verdict, 'satisfied');
});

test('ACCEPT is REFUSED when the tree changed under the signer, and the refusal names the stage', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  // somebody moved the merchandise: the file is still there (so the run's OWN
  // change survives) and no longer satisfies the close
  writeFileSync(join(r.dir, 'src', 'fix.js'), '// not what you read\n');
  const a = await answer(r, { decision: 'accept' });
  assert.equal(a.ok, false);
  assert.equal(a.reds[0].code, 'door-accept-red');
  assert.equal(a.mechanical.stage, 'verdict', 'the stage that reds is named, so the person knows what changed');
  assert.equal(a.released, false);
  assert.equal(a.doorRecorded, false, 'a refused accept records nothing: the disposition never happened');
});

test('ACCEPT on an ALREADY-GREEN run mints nothing and releases nothing — slice 1\'s rule, from the other side', async (t) => {
  const p = makePatient(t);
  const job = SPEC('green');
  writeFileSync(join(p.dir, 'src', 'fix.js'), '// ok\n');
  const clock = { t: Date.parse('2026-08-19T09:00:00.000Z'), stepMs: 500 };
  await runJob(job, { approvals: approve(job), workdir: p.dir, provider: forbiddenProvider(), emit: virtualSpine(p.spine, clock), reviewDoor: true });
  const registryDir = mkdtempSync(join(tmpdir(), 'review-door-reg-'));
  t.after(() => rmSync(registryDir, { recursive: true, force: true }));
  const a = await answerReviewDoor({
    job, workdir: p.dir, events: readEvents(p.spine), closeTimeoutMs: 120_000, decision: 'accept',
    registryDir, name: 'review-door', runid: 'ms1', at: 'a',
  });
  assert.equal(a.ok, true, JSON.stringify(a.reds));
  assert.equal(a.released, false);
  assert.equal(a.doorRecorded, false);
  assert.match(a.note, /already-green/, 'and it SAYS why nothing moved rather than leaving it to be inferred');
});

// ══ THE REGISTRY HALF — quarantine, and the report card ═══════════════════════

/** a registry holding one entry whose only green is this run's */
function seedRegistry(t, { verdictType, runid = 'ms1' }) {
  const dir = mkdtempSync(join(tmpdir(), 'review-door-reg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const plan = { schema: 'plan-v1', steps: [{ id: 'write-fix', action: 'a', tools: ['write'], rounds: 6, target: 'src/fix.js', exit: [{ type: 'tree-changed', scope: 'src/**' }] }] };
  const row = {
    runid, patient: 'review-door', at: '2026-08-19T10:00:00.000Z', verdictType,
    costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 3, plan,
  };
  const b = mintBridge({
    name: 'review-door',
    goal: 'Create src/fix.js with an ok marker.',
    specHash: 'signed-hash',
    closeStageNames: ['changed-from-seed', 'verdict', 'no-suppressions'],
    toolsUsed: ['read', 'write'],
  }, row);
  assert.equal(b.ok, true, JSON.stringify(b.reds));
  assert.equal(saveBridge(dir, b.bridge).ok, true);
  return dir;
}

test('a SOFTGREEN accept RELEASES the run\'s learning credit and records the report card', async (t) => {
  const r = await greenRun(t, { verdictType: 'soft-green' });
  const registryDir = seedRegistry(t, { verdictType: 'soft-green' });
  const before = loadBridge(join(registryDir, 'review-door.json'));
  assert.equal(before.bridge.versions[0].quarantined, true, 'held before the person speaks');
  const a = await answer(r, { decision: 'accept', registryDir, name: 'review-door', runid: 'ms1' });
  assert.equal(a.ok, true, JSON.stringify(a.reds));
  assert.equal(a.released, true, 'accept is what releases the credit (PRD v1.71 §3)');
  const after = loadBridge(join(registryDir, 'review-door.json'));
  assert.equal(after.bridge.versions[0].quarantined, false);
  assert.deepEqual(after.bridge.history[0].doors, [{ decision: 'accept', at: '2026-08-19T12:00:00.000Z' }]);
});

test('a GREEN-class accept releases NOTHING — there was never a hold — but the door is still recorded', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  const registryDir = seedRegistry(t, { verdictType: 'green' });
  const a = await answer(r, { decision: 'accept', registryDir, name: 'review-door', runid: 'ms1' });
  assert.equal(a.ok, true, JSON.stringify(a.reds));
  assert.equal(a.released, false);
  const after = loadBridge(join(registryDir, 'review-door.json'));
  assert.equal('quarantined' in after.bridge.versions[0], false, 'REGRESSION: a green-class row is unflagged, exactly as before');
  assert.deepEqual(after.bridge.history[0].doors, [{ decision: 'accept', at: '2026-08-19T12:00:00.000Z' }]);
});

test('every door is a datum: rerun and pause record the card too, and neither releases anything', async (t) => {
  for (const decision of ['rerun', 'pause']) {
    const r = await greenRun(t, { verdictType: 'soft-green' });
    const registryDir = seedRegistry(t, { verdictType: 'soft-green' });
    const a = await answer(r, { decision, ...(decision === 'rerun' ? { text: WORDS } : {}), registryDir, name: 'review-door', runid: 'ms1' });
    assert.equal(a.ok, true, JSON.stringify(a.reds));
    assert.equal(a.released, false, `${decision} releases nothing`);
    const after = loadBridge(join(registryDir, 'review-door.json'));
    assert.equal(after.bridge.versions[0].quarantined, true, 'the hold survives every door but accept');
    assert.deepEqual(after.bridge.history[0].doors, [{ decision, at: '2026-08-19T12:00:00.000Z' }]);
  }
});

// ══ RERUN — a fresh engagement, the signer's words as the gap ══════════════════

test('RERUN carries the signer\'s words back as a directive, and re-proves nothing itself', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  const a = await answer(r, { decision: 'rerun', text: WORDS });
  assert.equal(a.ok, true, JSON.stringify(a.reds));
  assert.equal(a.next, 'rerun');
  assert.equal(a.text, WORDS);
  assert.equal(a.mechanical, null, 'a rerun proves nothing about the old tree — the NEW run\'s close is what judges');
});

test('RERUN with empty words is REFUSED at the library seam — the words ARE the gap', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  for (const text of ['', '   \n ']) {
    const a = await answer(r, { decision: 'rerun', text });
    assert.equal(a.ok, false);
    assert.equal(a.reds[0].code, 'hitl-decision-red');
  }
  const four = await answer(r, { decision: 'approve' });
  assert.equal(four.ok, false, 'and there is no fourth door');
  assert.match(four.reds[0].detail, /accept \| rerun \| pause/);
});

test('a DOOR RERUN re-enters the run: the already-green shortcut is refused, and the words reach the drafter', async (t) => {
  const p = makePatient(t);
  const job = SPEC('green');
  writeFileSync(join(p.dir, 'src', 'fix.js'), '// ok\n'); // the tree the signer looked at, and did not like
  const clock = { t: Date.parse('2026-08-19T13:00:00.000Z'), stepMs: 500 };
  const provider = scriptedProvider([
    { text: 'src/ holds mod.js and fix.js.' },
    { text: PLAN },
    tcall('t1', join(p.dir, 'src', 'fix.js'), '// ok — the real implementation\n'),
    { text: 'rewrote src/fix.js' },
  ]);
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: p.dir, provider, emit: virtualSpine(p.spine, clock), reviewDoor: true,
    doorRerun: { text: WORDS, fromRunid: 'ms1', receivedAt: '2026-08-19T12:00:00.000Z' },
  });
  assert.equal(outcome, 'green', 'the rerun is a fresh engagement against the same signed spec');
  const events = readEvents(p.spine);
  const dr = events.find((e) => e.type === 'door-rerun');
  assert.equal(dr.fromRunid, 'ms1');
  assert.equal(dr.text, WORDS);
  assert.ok(events.some((e) => e.type === 'door-rerun-open'), 'the already-green shortcut was bypassed, and the record says so');
  assert.equal(events.some((e) => e.type === 'job-end' && e.outcome === 'already-green'), false);
  assert.ok(provider.calls.some((c) => c.includes(WORDS)), 'the signer\'s words reach the PLANNER — a rerun is new authoring');
});

test('a door\'s rerun is NOT a close-stage answer: the same words handed as a humanRuling are refused', async (t) => {
  // ONE FLAG, TWO QUESTIONS, and this is why the runner must pick by which run is
  // being answered. `humanRuling` answers a close's human STAGE and is refused for a
  // close that has none — which is every green-class job, i.e. exactly the class the
  // review door exists to serve. The door's rerun travels as `doorRerun` instead.
  const p = makePatient(t);
  const job = SPEC('green');
  const clock = { t: Date.parse('2026-08-19T13:00:00.000Z'), stepMs: 500 };
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: p.dir, provider: forbiddenProvider(), emit: virtualSpine(p.spine, clock),
    humanRuling: { decision: 'rerun', text: WORDS },
  });
  assert.equal(outcome, 'hitl-decision-red', 'and it says so honestly rather than silently ignoring the words');
});

test('a DOOR RERUN with no words is refused before anything is bought', async (t) => {
  const p = makePatient(t);
  const job = SPEC('green');
  const clock = { t: Date.parse('2026-08-19T13:00:00.000Z'), stepMs: 500 };
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: p.dir, provider: forbiddenProvider(), emit: virtualSpine(p.spine, clock),
    doorRerun: { text: '  ', fromRunid: 'ms1' },
  });
  assert.equal(outcome, 'hitl-decision-red');
});

// ══ PAUSE — allowance-free, and the TTL is the cancel case ════════════════════

test('PAUSE runs nothing, spends nothing and keeps the door open — with the TTL named', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  const a = await answer(r, { decision: 'pause' });
  assert.equal(a.ok, true, JSON.stringify(a.reds));
  assert.equal(a.next, 'paused');
  assert.equal(a.mechanical, null, 'a pause commissions nothing, so nothing is re-run');
  assert.equal(a.ttlMs, PAUSE_TTL_MS);
  assert.deepEqual(a.options, ['accept', 'rerun', 'pause'], 'the same three doors are open the next time somebody looks');
});

test('the TTL is the cancel case: a door older than the TTL refuses every decision, naming the age', async (t) => {
  const r = await greenRun(t, { reviewDoor: true });
  const old = Date.parse('2026-08-19T09:00:00.000Z') + PAUSE_TTL_MS + 86_400_000;
  for (const decision of ['accept', 'rerun', 'pause']) {
    const a = await answer(r, { decision, ...(decision === 'rerun' ? { text: WORDS } : {}), now: () => old });
    assert.equal(a.ok, false, `${decision} past the TTL`);
    assert.equal(a.reds[0].code, 'door-expired');
  }
  const gate = doorAgeGate(doorRecordOf(r.events), { now: () => old });
  assert.equal(gate.ok, false);
  assert.match(gate.detail, /60/);
});

test('a run that opened NO door cannot be answered — there is nothing to answer', async (t) => {
  const r = await greenRun(t);
  const a = await answer(r, { decision: 'accept' });
  assert.equal(a.ok, false);
  assert.equal(a.reds[0].code, 'no-door');
});

// ══ M7 REGRESSION — the held decision still travels through the close ═════════

test('M7 REGRESSION: a hitl close still resolves its own human stage, door or no door', async (t) => {
  const p = makePatient(t);
  const g = guards('hitl');
  const job = {
    ...SPEC('hitl'),
    verdictType: 'hitl',
    closeDecl: {
      genre: GENRE,
      lang: 'js',
      stages: [
        g[0],
        { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } },
        g[1],
        { name: 'signer-reviews', kind: 'human-confirms', params: { ask: 'Would you ship this?' } },
      ],
    },
  };
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);
  const clock = { t: Date.parse('2026-08-19T09:00:00.000Z'), stepMs: 500 };
  const provider = scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },
    { text: PLAN },
    tcall('t1', join(p.dir, 'src', 'fix.js'), '// ok\n'),
    { text: 'wrote src/fix.js' },
  ]);
  const paused = await runJob(job, { approvals: approve(job), workdir: p.dir, provider, emit: virtualSpine(p.spine, clock) });
  assert.equal(paused, 'hitl-pause', 'the close\'s own human stage is untouched by the run-level door');

  // …and the held answer still greens it, with the run-level door open on top
  const spine2 = join(p.spineDir, 'spine2.jsonl');
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: p.dir, provider: forbiddenProvider(), emit: virtualSpine(spine2, clock),
    heldRuling: { decision: 'accept', text: null, receivedAt: '2026-08-19T11:00:00.000Z' },
    reviewDoor: true,
  });
  assert.equal(outcome, 'already-green', 'the mechanical stages re-ran and the signer\'s accept greened the human stage');
  const ev2 = readEvents(spine2);
  assert.equal(ev2.find((e) => e.type === 'human-decision').source, 'checkpoint', 'M7: the ask is never re-rendered');
  assert.equal(doorRecordOf(ev2).outcome, 'already-green', 'and the run-level door opens on top of it, changing nothing');
});
