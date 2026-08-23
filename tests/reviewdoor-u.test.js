// Softgreen module 8 — the REVIEW DOOR's SURFACE (the runner's half).
//
// The library half is tested against real runs in tests/reviewdoor.test.js. What
// these cover is `scripts/run-u.mjs`: the door as a flag, the evidence a person
// actually reads at the end of a run, which door the screen leads with, and every
// refusal that has to land BEFORE a hash is signed for a decision.
//
// Same instrument the hitl surface uses (tests/hitl-u.test.js): the REAL script,
// driven through its PREVIEW path — everything before a key is read and before a
// dollar is committed — plus the pure renderers from scripts/u-readout.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { jobSpecHash } from '../src/job.js';
import { PAUSE_TTL_MS, writeGreenRow } from '../src/reuse.js';
import { makeRegistry } from '../src/bridges.js';
import { reviewDoorPackage, runDoorLines } from '../scripts/u-readout.mjs';

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;
const SPEC = JSON.parse(readFileSync(new URL('../jobs/bareagent-u-types.json', import.meta.url), 'utf8'));
const HASH = jobSpecHash(SPEC);

const base = mkdtempSync(join(tmpdir(), 'reviewdoor-u-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;

/** the shape a run that ENDED AT ITS DOOR leaves. The record's fields are the ones
 * `emitReviewDoor` (src/planrun.js) actually writes, pinned against the real
 * machinery by tests/reviewdoor.test.js — so this fixture cannot drift into
 * describing a record the library does not emit. */
const doorSpine = ({ at = new Date().toISOString(), verdictType = 'green', quarantined = false, outcome = 'green', door = true, end = true } = {}) => [
  { type: 'job-start', job: SPEC.job, specHash: HASH, budgetUsd: SPEC.budgetUsd, goal: SPEC.goal, ts: at, seq: 1 },
  { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: at, seq: 2 },
  { type: 'outer-close', verdict: 'satisfied', stage: 'typecheck-clean', ts: at, seq: 3 },
  ...(door ? [{
    type: 'review-door',
    outcome,
    verdictType,
    quarantined,
    stages: [
      { name: 'changed-from-seed', verdict: 'satisfied', exitCode: 0 },
      { name: 'typecheck-clean', verdict: 'satisfied', exitCode: 0, value: 0, baseline: 63 },
      { name: 'no-suppressions', verdict: 'satisfied', exitCode: 0 },
    ],
    mechanical: ['changed-from-seed', 'typecheck-clean', 'no-suppressions'],
    changed: { paths: ['src/fix.ts'] },
    decisionReady: true,
    decision: `The close minted ${outcome} and it STANDS. What happens to the work is yours: accept it, rerun it with your own words as the gap, or pause and come back.`,
    options: ['accept', 'rerun', 'pause'],
    meaning: 'not a verdict — the verdict is already minted and nothing an answer does can change it; this records a disposition',
    ts: at,
    seq: 4,
  }] : []),
  ...(end ? [{ type: 'job-end', outcome, spentUsd: SPEC.budgetUsd * 0.4, spendComplete: true, ts: at, seq: 5 }] : []),
];

function spineFile(events) {
  const f = join(base, `u-door-${n += 1}.jsonl`);
  writeFileSync(f, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return f;
}

/** the preview: no --approve, so nothing reads a key and nothing touches a patient */
const preview = (args, job = 'bareagent-types') => {
  const r = spawnSync(process.execPath, [RUNNER, '--job', job, ...args], {
    encoding: 'utf8', timeout: 240_000, env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === null) throw new Error(`run-u.mjs never exited (${r.error?.code ?? r.signal ?? 'no error'}):\n${out.slice(0, 400)}`);
  return { code: r.status, out };
};

// ══ the screen a person decides on ═════════════════════════════════════════════

test('the door screen shows the verdict that STANDS, the evidence, and the three doors led by RERUN', () => {
  const f = spineFile(doorSpine());
  const { code, out } = preview(['--door', f]);
  assert.equal(code, 0, out);
  assert.match(out, /REVIEW DOOR/);
  assert.match(out, /minted green and it STANDS/, 'the law, said in words: nothing here changes the verdict');
  assert.match(out, /typecheck-clean/, 'every stage the machine judged');
  assert.match(out, /src\/fix\.ts/, 'and what the run moved');
  // the ORDER of the door list itself, keyed on the list's own gutter so the prose
  // above it (which names all three) cannot decide the assertion
  assert.ok(out.indexOf('\n  rerun   ') < out.indexOf('\n  accept  '), 'RERUN leads — the ~40% rubber-stamp datum is a design input');
  assert.match(out, /--door .*--decide accept --approve/, 'each door costs an exact command nobody has to reconstruct');
  assert.match(out, new RegExp(`${PAUSE_TTL_MS / 86_400_000} days`), 'and the TTL is named — that expiry is all "cancel" ever meant');
});

test('a HELD judged green says so on the screen — and the accept door only promises a release the registry can perform (2B, at the preview)', () => {
  const f = spineFile(doorSpine({ verdictType: 'soft-green', quarantined: true }));
  // NO registry named: HELD is said, but the accept door must not promise a release
  // it has no row to perform — the exact defect 2B closed at the run's own readout,
  // and the preview is the same promise one invocation later. The screen says why.
  const bare = preview(['--door', f]);
  assert.equal(bare.code, 0, bare.out);
  assert.match(bare.out, /held\s+this green was rendered by the judged floor/);
  assert.doesNotMatch(bare.out, /accept\s+releases this run's learning credit/);
  assert.match(bare.out, /releases nothing/, 'the missing row is said in words, never silently dropped');

  // a registry HOLDING this run's green row: the promise is true, printed, and the
  // registry travels in every printed command (an accept aimed at no registry is the
  // `no-row-for-run` refusal one hop later). The row's runid is what the decide path
  // will look up — `runid: DOOR` — which here is the spine path itself.
  const dir = join(base, `door-reg-${n}`);
  makeRegistry(dir);
  const w = writeGreenRow({
    registryDir: dir,
    bridge: null,
    meta: { name: 'bareagent-u-types', goal: 'g', specHash: HASH, closeStageNames: ['a'], toolsUsed: ['read'] },
    record: {
      runid: f, patient: '/tmp/patient', at: new Date().toISOString(), costUsd: 1.2, spendComplete: true,
      wallMs: 60_000, rounds: 3, specHash: HASH, outcome: 'green', plan: { schema: 'plan-v1', steps: [] }, verdictType: 'soft-green',
    },
  });
  assert.equal(w.action, 'mint', JSON.stringify(w));
  const held = preview(['--door', f, '--registry', dir, '--workflow', 'bareagent-u-types']);
  assert.equal(held.code, 0, held.out);
  assert.match(held.out, /accept\s+releases this run's learning credit/);
  assert.match(held.out, /--decide accept --registry .*--workflow bareagent-u-types --approve/, 'the registry rides the printed command');
});

test('the chosen door is echoed back before it is signed — including the words that become the requirement', () => {
  const f = spineFile(doorSpine());
  const { code, out } = preview(['--door', f, '--decide', 'rerun', '--text', 'the types are any-shaped']);
  assert.equal(code, 0, out);
  assert.match(out, /decision rerun/);
  assert.match(out, /the types are any-shaped/);
  assert.match(out, /To approve and answer:/);
  assert.match(out, /systemd-inhibit/, 'a rerun commissions work, so the inhibitor line is printed (F72)');
});

test('a door whose run left NO job-end reads as a FLOOR, never as complete at $0 (F6)', () => {
  // the crash between the door record and the job-end, and every legacy spine that
  // predates the field: the FIGURE is unknown, so the completeness that would
  // certify it cannot be true either. Rendering $0.0000 exact here would tell a
  // signer a rerun has the whole signed budget left.
  const f = spineFile(doorSpine({ end: false }));
  const { code, out } = preview(['--door', f]);
  assert.equal(code, 0, out);
  assert.match(out, /≥\$0\.0000 spent/, 'an absent job-end is an unknown floor, not an exact zero');
});

// ══ every refusal that must land before a signature ════════════════════════════

test('REFUSED: a run that opened NO door has nothing to answer, and the refusal says how one is opened', () => {
  const f = spineFile(doorSpine({ door: false }));
  const { code, out } = preview(['--door', f, '--decide', 'accept']);
  assert.equal(code, 2);
  assert.match(out, /opened no review door/);
  assert.match(out, /--review-door/, 'and names the flag that would have opened one');
});

test('REFUSED: the fourth door does not exist at the review door either', () => {
  const f = spineFile(doorSpine());
  const { code, out } = preview(['--door', f, '--decide', 'cancel']);
  assert.equal(code, 2);
  assert.match(out, /accept \| rerun \| pause/);
});

test('REFUSED: a rerun with no words — the person IS the gap author', () => {
  const f = spineFile(doorSpine());
  const { code, out } = preview(['--door', f, '--decide', 'rerun']);
  assert.equal(code, 2);
  assert.match(out, /rerun/i);
});

test('REFUSED: --door and --resume are two different runs in two different states', () => {
  const f = spineFile(doorSpine());
  const { code, out } = preview(['--door', f, '--resume', f]);
  assert.equal(code, 2);
  assert.match(out, /--door answers the review door of a run that FINISHED/);
});

test('REFUSED: a decision with nothing at all to answer', () => {
  const { code, out } = preview(['--decide', 'accept']);
  assert.equal(code, 2);
  assert.match(out, /--resume.*--door|--door.*--resume/s);
});

test('REFUSED: a door older than the TTL expires on its own — and that IS the cancel case', () => {
  const old = new Date(Date.now() - PAUSE_TTL_MS - 86_400_000).toISOString();
  const f = spineFile(doorSpine({ at: old }));
  const { code, out } = preview(['--door', f, '--decide', 'accept']);
  assert.equal(code, 2);
  assert.match(out, /DOOR EXPIRED/);
  assert.match(out, /stands/, 'the verdict the run minted is untouched by the expiry');
});

test('REFUSED: a door on another job\'s spine — a decision is answered against the spec that was signed for it', () => {
  const f = spineFile(doorSpine().map((e) => (e.type === 'job-start' ? { ...e, job: 'some-other-job' } : e)));
  const { code, out } = preview(['--door', f, '--decide', 'accept']);
  assert.equal(code, 2);
  assert.match(out, /is job "some-other-job"/);
});

// ══ tripwires: one rulebook, one door list, and the flag actually reaches runJob ══

test('tripwire: the runner ANSWERS through the library seam and never re-spells the doors', () => {
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /import \{[^}]*\banswerReviewDoor\b/s, 'the door\'s rulebook is the library\'s');
  assert.match(src, /reviewDoor: true/, 'and the opt-in flag reaches runJob — a flag that is parsed and dropped opens nothing');
  assert.match(src, /doorRerun: DOOR_RERUN/, 'as do the signer\'s words on a rerun');
  // ONE FLAG, TWO QUESTIONS. `--decide rerun` at a PAUSE answers a close's human
  // stage (`humanRuling`); at a DOOR it commissions a fresh engagement
  // (`doorRerun`). Handing a door's ruling to `humanRuling` would reach a
  // green-class close with no human stage and come back `hitl-decision-red` — the
  // rerun door would be structurally unusable on exactly the class it was built for.
  assert.match(src, /RULING === null \|\| DOOR !== null \? \{\} : \{ humanRuling: RULING \}/, 'a door\'s ruling never travels as a close-stage answer');
  assert.doesNotMatch(src, /\['accept', 'rerun', 'pause'\]/, 'the door list is never re-spelled here');
});

test('tripwire: the JUDGE SEAM reaches runJob — a judged stage with no provider instrument-STOPS', () => {
  // softgreen's whole point is a close that JUDGES, and the judged stage's provider
  // is not the worker's: it is pinned to JUDGE_MODEL, never agent-selectable, and
  // absent it the stage stops as a wiring gap rather than grading on whatever model
  // was lying around. `run-author.mjs` wired it; this runner — the one that actually
  // runs the job — did not, so every live softgreen run would have died at its own
  // judged stage. A parsed-and-dropped seam is a flag that opens nothing.
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /import \{[^}]*\bJUDGE_MODEL\b/s, 'the tier is the library\'s constant, never a spelling here');
  assert.match(src, /judgeProvider/, 'the judge provider must be built');
  assert.match(src, /new AnthropicProvider\(\{ apiKey, model: JUDGE_MODEL \}\)/, 'and PINNED to the judged tier');
  assert.match(src, /judgeProvider,/, 'and it must reach runJob — a provider built and dropped grades nothing');
  // the key rides the same way every other secret does here: out of the environment,
  // never argv, never printed
  assert.doesNotMatch(src, /apiKey: ['"]/, 'a literal key must never appear in this runner');
});

test('tripwire: a rerun buys its OWN clock and folds the answered run\'s money (F103)', () => {
  const src = readFileSync(RUNNER, 'utf8');
  const call = src.slice(src.indexOf('DOOR_RERUN === null ? {} : {'), src.indexOf('DOOR_RERUN === null ? {} : {') + 400);
  assert.match(call, /priorSpentUsd: doorPrior\?\.spentUsd/, 'money folds — a signature for $X never authorises more');
  assert.doesNotMatch(call, /priorWallMs/, 'and the WALL does not: a rerun that inherits a dead leg\'s clock is structurally doomed');
});

// ══ the renderers, as pure functions ══════════════════════════════════════════

test('the package never borrows the pause screen\'s sentence — the machine rendered every stage, and the run is over', () => {
  const door = doorSpine().find((e) => e.type === 'review-door');
  const lines = reviewDoorPackage({ door, diff: null }).join('\n');
  assert.doesNotMatch(lines, /waiting on you/);
  assert.doesNotMatch(lines, /the close declared no question/, 'a door asks no question of its own — it offers three answers');
  assert.match(lines, /STANDS/);
  assert.match(lines, /changed-from-seed/);
});

test('the three doors at the review door say what each one actually costs', () => {
  const lines = runDoorLines({ rerun: 'R', accept: 'A', pause: 'P', ttlDays: 60, held: true }).join('\n');
  assert.match(lines, /no fourth/);
  assert.match(lines, /FRESH engagement/);
  assert.match(lines, /mechanical.*stages re-run first/i, 'an accept is not a rubber stamp, and the screen says so');
  assert.match(lines, /Nothing runs and nothing is spent/);
  const free = runDoorLines({ rerun: 'R', accept: 'A', pause: 'P', ttlDays: 60, held: false }).join('\n');
  assert.match(free, /accept\s+confirms it/, 'a green-class run was never held, and the screen does not pretend otherwise');
});
