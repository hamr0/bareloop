// N4 slice 1 — the hitl SURFACE at the terminal (2026-08-12 addendum §1/§2/§5.2).
//
// The library half is done and tested (tests/hitl.test.js, tests/hitl-run.test.js).
// What these cover is the RUNNER: the three doors as flags, the evidence package a
// person actually reads, the 60-day TTL gate, and the clock hazard §1.6 named.
//
// Same two instruments tests/resume-u.test.js uses, for the same reasons: the REAL
// script driven through its PREVIEW path (everything before a key is read and before
// a dollar is committed), and pure helpers in `scripts/u-readout.mjs` for the
// arithmetic and the rendering the preview cannot reach without a paid run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { jobSpecHash } from '../src/job.js';
import { PAUSE_TTL_MS } from '../src/reuse.js';
import { deathAtOf, evidencePackage, resumeAtLines } from '../scripts/u-readout.mjs';

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;
const SPEC = JSON.parse(readFileSync(new URL('../jobs/bareagent-u-types.json', import.meta.url), 'utf8'));
const DAY = 86_400_000;

const base = mkdtempSync(join(tmpdir(), 'hitl-u-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;

/** a spine file, written the way the runner reads one */
function spineFile(events) {
  const f = join(base, `u-hitl-${n += 1}.jsonl`);
  writeFileSync(f, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return f;
}

/** the shape a real PAUSED U run leaves. The stage rows and the `changed` block are
 * copied from what `src/planrun.js`'s `emitHitlPause` actually writes (pinned by
 * tests/hitl-run.test.js against the real machinery), so this fixture cannot drift
 * into describing a record the library does not emit. */
const pausedSpine = ({ at = '2026-08-04T10:20:00.000Z', job = SPEC.job, changed = { paths: ['src/fix.js'] } } = {}) => [
  { type: 'job-start', job, specHash: 'old-hash-0000', budgetUsd: SPEC.budgetUsd, shape: 'plan', goal: SPEC.goal, ts: '2026-08-04T10:00:00.000Z', seq: 1 },
  { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: '2026-08-04T10:02:00.000Z', seq: 2 },
  { type: 'worker-round', kind: 'turn', costUsd: SPEC.budgetUsd * 0.25, ts: '2026-08-04T10:05:00.000Z', seq: 3 },
  { type: 'step-end', step: 'fix-types', outcome: 'green', ts: '2026-08-04T10:10:00.000Z', seq: 20 },
  {
    type: 'hitl-pause',
    stage: 'signer-reviews',
    ask: 'Does this fix read like something you would ship?',
    decisionReady: true,
    stages: [
      { name: 'changed-from-seed', verdict: 'satisfied', exitCode: 0 },
      { name: 'typecheck-clean', verdict: 'satisfied', exitCode: 0, value: 0, baseline: 63 },
      { name: 'no-suppressions', verdict: 'satisfied', exitCode: 0, notes: 'scanned 4 added lines' },
      { name: 'signer-reviews', verdict: 'human-pause' },
    ],
    changed,
    decision: 'The close reached its human stage and is waiting on you: Does this fix read like something you would ship?',
    options: ['accept', 'rerun', 'pause'],
    meaning: 'not a verdict — the run is paused, the clock is stopped, and the last thing it did stands until you answer',
    ts: at,
    seq: 40,
  },
  { type: 'job-end', outcome: 'hitl-pause', spentUsd: SPEC.budgetUsd * 0.25, spendComplete: true, ts: at, seq: 41 },
];

/** the preview: no --approve, so nothing reads a key and nothing touches a patient */
const preview = (args, job = 'bareagent-types') => {
  const r = spawnSync(process.execPath, [RUNNER, '--job', job, ...args], {
    encoding: 'utf8', timeout: 240_000, env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === null) {
    throw new Error(`run-u.mjs never exited (${r.error?.code ?? r.signal ?? 'no error, no signal'}) — the runner rendered NO verdict. Output so far:\n${out.slice(0, 400)}`);
  }
  return { code: r.status, out };
};

// ══ §1.6 THE CLOCK — the one real bug in the handoff ═══════════════════════════
//
// `deathAt` is an estimate of when a run DIED, and the watchdog's kill record is
// better evidence than the last spine event for exactly that case. A pause is the
// opposite case: the run did not die, it ENDED ITSELF and dated its own stop. Billing
// from a later record makes the human's deciding time part of the run's wall —
// measured in the POC at 45 simulated days, which put `RESUME_WALL_MS` at 0 and
// doomed the resumed leg before it opened.

test('§1.6 deathAt: a run that landed its OWN terminal dated its own stop — the watchdog record is not preferred over it', () => {
  const ev = pausedSpine();
  const pausedAt = Date.parse('2026-08-04T10:20:00.000Z');
  assert.equal(deathAtOf({ watchdogAt: new Date(pausedAt + 45 * DAY).toISOString(), events: ev }), null,
    'null hands readResume back its own default — the last event, which IS the pause');
  assert.equal(deathAtOf({ watchdogAt: undefined, events: ev }), null);
});

test('§1.6 deathAt CONTROL: a run that left NO terminal really was killed, and the watchdog record still wins', () => {
  // the case the preference order was written for and must keep: a SIGKILL mid-round
  // leaves the last spine event minutes (or hours) before the process actually stopped
  const killed = pausedSpine().filter((e) => e.type !== 'job-end' && e.type !== 'hitl-pause');
  const at = '2026-08-04T11:30:00.000Z';
  assert.equal(deathAtOf({ watchdogAt: at, events: killed }), Date.parse(at),
    'no job-end means nothing on the spine knows when it stopped — the kill record is the only witness there is');
});

test('§1.6 deathAt: an unreadable or absent watchdog stamp is never invented into a number', () => {
  const killed = pausedSpine().filter((e) => e.type !== 'job-end' && e.type !== 'hitl-pause');
  for (const bad of [undefined, null, '', 'soon', NaN, {}, []]) {
    assert.equal(deathAtOf({ watchdogAt: /** @type {any} */ (bad), events: killed }), null,
      `a ${JSON.stringify(bad)} stamp falls back to the spine's own last event, never to a NaN that would poison the fold`);
  }
});

test('§1.6 deathAt: garbage in the events list is read as "no terminal", not as a crash', () => {
  assert.equal(deathAtOf({ watchdogAt: '2026-08-04T11:30:00.000Z', events: /** @type {any} */ (null) }), Date.parse('2026-08-04T11:30:00.000Z'));
  assert.equal(deathAtOf({ watchdogAt: '2026-08-04T11:30:00.000Z', events: [null, 7, 'x'] }), Date.parse('2026-08-04T11:30:00.000Z'));
});

test('§1.6 E2E: a stale watchdog report beside a PAUSED spine does not bill the deciding time to the wall', () => {
  // The whole hazard, through the real script. The fixture pauses 20 minutes into the
  // run; the report is dated 45 days later, which is what a stale one looks like. With
  // the report preferred, the fold is 45 days and the wall refusal fires; with the
  // pause preferred, the leg opens with almost the whole signed wall.
  const f = spineFile(pausedSpine());
  writeFileSync(`${f}.watchdog.json`, `${JSON.stringify({
    watchdog: 'u-watchdog', reason: 'deadline', killed: true, pid: 0x7ffffffe, spine: f,
    at: new Date(Date.parse('2026-08-04T10:20:00.000Z') + 45 * DAY).toISOString(),
  })}\n`);
  const { code, out } = preview(['--resume', f]);
  assert.equal(code, 0, 'a stale report is not a refusal');
  assert.match(out, /spent .*20\.0min before the halt/, 'the fold is the paused leg\'s OWN elapsed — 10:00 to 10:20');
  assert.doesNotMatch(out, /NOTHING LEFT/, 'and the wall is not burnt: 45 days of a person reading is not run time');
});

// ══ §2 THE 60-DAY TTL ══════════════════════════════════════════════════════════

test('§2 TTL: a checkpoint older than the pause TTL is REFUSED, naming the age and the TTL', () => {
  const old = new Date(Date.now() - (PAUSE_TTL_MS + 3 * DAY)).toISOString();
  const { code, out } = preview(['--resume', spineFile(pausedSpine({ at: old }))]);
  assert.equal(code, 2, 'an expired checkpoint is an operator stop, not a readout');
  assert.match(out, /CHECKPOINT EXPIRED/);
  assert.match(out, /63 days ago and the pause TTL is 60 days/, 'both numbers, so the operator can see which of the two it hit');
  assert.match(out, /Start a fresh run/);
});

test('§2 TTL CONTROL: a checkpoint inside the TTL resumes exactly as it always did', () => {
  const fresh = new Date(Date.now() - 59 * DAY).toISOString();
  const { code, out } = preview(['--resume', spineFile(pausedSpine({ at: fresh }))]);
  assert.equal(code, 0);
  assert.doesNotMatch(out, /CHECKPOINT EXPIRED/);
  assert.match(out, /RESUME/);
});

test('§2 TTL: the gate is the LIBRARY\'s, and it applies to the PAUSE only', () => {
  // `checkpointAgeGate` returns `applies:false` for every other terminal on purpose:
  // ageing out a cap-halt would be a governance change nobody ruled. Driven through
  // the script so the runner cannot have widened it on the way past.
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /checkpointAgeGate\(/, 'the runner calls the library gate rather than re-deriving 60 days');
  assert.doesNotMatch(src, /60 \* 24 \* 60|5184000000/, 'and the number itself is nowhere in the script');

  const ancient = new Date(Date.now() - 900 * DAY).toISOString();
  const capHalt = pausedSpine({ at: ancient })
    .filter((e) => e.type !== 'hitl-pause')
    .map((e) => (e.type === 'job-end' ? { ...e, outcome: 'cap-halt' } : e));
  const { code, out } = preview(['--resume', spineFile(capHalt)]);
  assert.equal(code, 0, 'a two-and-a-half-year-old cap-halt is still resumable — the TTL is about a person deciding');
  assert.doesNotMatch(out, /CHECKPOINT EXPIRED/);
});

// ══ §1 THE THREE DOORS ═════════════════════════════════════════════════════════

test('§1 no --decide on a paused run: the evidence package and the three doors, led by RERUN', () => {
  const { code, out } = preview(['--resume', spineFile(pausedSpine())]);
  assert.equal(code, 0, 'the preview is a readout — it does not decide, and it never decides FOR anyone');

  // ruling 2 — never a bare "approve?"
  assert.match(out, /HUMAN REVIEW/);
  assert.match(out, /Does this fix read like something you would ship\?/, 'the close\'s own ask');
  assert.match(out, /changed-from-seed +satisfied/, 'every mechanical stage\'s own result');
  assert.match(out, /typecheck-clean +satisfied .*63 → 0/, 'with its measurement, where it made one');
  assert.match(out, /no-suppressions +satisfied/);
  assert.match(out, /signer-reviews +human-pause/, 'and the stage that is waiting, named as waiting rather than as a verdict');
  assert.match(out, /src\/fix\.js/, 'what this run changed');

  // 2026-08-12 §4 — the ~40% rubber-stamp datum: rerun LEADS, accept never defaults
  const rerunAt = out.indexOf('--decide rerun');
  const acceptAt = out.indexOf('--decide accept');
  assert.ok(rerunAt > 0 && acceptAt > 0, 'both doors are offered');
  assert.ok(rerunAt < acceptAt, 'rerun is the door the prompt leads with (2026-08-12 §4)');
  assert.match(out, /--decide pause/);
  assert.match(out, /no decision is taken for you/i, 'the lean is a FRAMING, never an action');
});

test('§1 REFUSED: the fourth door does not exist, and the refusal names the three that do', () => {
  const { code, out } = preview(['--resume', spineFile(pausedSpine()), '--decide', 'maybe']);
  assert.equal(code, 2);
  assert.match(out, /not one of the three doors \(accept \| rerun \| pause\)/, 'the LIBRARY\'s own refusal, surfaced');
  assert.match(out, /no fourth/);
});

test('§1 REFUSED: a rerun with no text — the human IS the gap author, and an empty gap says nothing', () => {
  for (const args of [['--decide', 'rerun'], ['--decide', 'rerun', '--text', '   \n  ']]) {
    const { code, out } = preview(['--resume', spineFile(pausedSpine()), ...args]);
    assert.equal(code, 2, JSON.stringify(args));
    assert.match(out, /needs TEXT/);
    assert.match(out, /re-runs the worker as though nothing had been said/, 'the reason, in the library\'s words');
    assert.doesNotMatch(out, /hash/i, 'and it refuses BEFORE offering a signature — nothing is spendable from here');
  }
});

test('§1 REFUSED: --text on a door that has no text is not silently dropped', () => {
  for (const d of ['accept', 'pause']) {
    const { code, out } = preview(['--resume', spineFile(pausedSpine()), '--decide', d, '--text', 'but also fix the docs']);
    assert.equal(code, 2, d);
    assert.match(out, /only a "rerun" carries text/);
  }
});

test('§1 REFUSED: a decision with nothing to answer — no --resume, and a resume that is not a pause', () => {
  const bare = preview(['--decide', 'accept']);
  assert.equal(bare.code, 2);
  assert.match(bare.out, /--decide answers a PAUSED run/);

  const capHalt = pausedSpine().filter((e) => e.type !== 'hitl-pause')
    .map((e) => (e.type === 'job-end' ? { ...e, outcome: 'cap-halt' } : e));
  const wrong = preview(['--resume', spineFile(capHalt), '--decide', 'accept']);
  assert.equal(wrong.code, 2);
  assert.match(wrong.out, /stopped on cap-halt, not at a human stage/);
});

test('§1 the chosen door is stated in the preview and rides the SAME --approve gate (ruling 4)', () => {
  const { code, out } = preview(['--resume', spineFile(pausedSpine()), '--decide', 'rerun', '--text', 'the summary buries the risk section']);
  assert.equal(code, 0);
  assert.match(out, /decision rerun/);
  assert.match(out, /the summary buries the risk section/, 'the words that will BE the gap, shown back before they are signed');
  assert.match(out, new RegExp(`--decide rerun[\\s\\S]*--approve ${jobSpecHash(SPEC)}`),
    'the invocation carries both: the only signer proof this repo has is the spec hash, and the decision rides it');
});

test('§1 REFUSED at launch: a signed paused resume with NO decision does not proceed', () => {
  // The lean-rerun rule says the DEFAULT is which door the prompt leads with — never an
  // action taken for the operator. So past the signature, a pause with no `--decide` is
  // a refusal, not a re-run of the close that would only pause again.
  const { code, out } = preview(['--resume', spineFile(pausedSpine()), '--approve', jobSpecHash(SPEC)]);
  assert.equal(code, 2);
  assert.match(out, /NO DECISION/);
  assert.match(out, /--decide/);
  assert.doesNotMatch(out, /ANTHROPIC_API_KEY not set/, 'it stops above the key: nothing about this needs a secret');
});

test('§1 tripwire: the runner HANDS the ruling to runJob, and builds it through the LIBRARY seam', () => {
  // The decision SEMANTICS live in src/kinds.js (`normalizeHumanRuling`): three doors,
  // no fourth, a rerun's text required. A script that re-spelled any of those would be
  // a second rulebook for the one thing the signer is signing.
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /import \{[^}]*\bnormalizeHumanRuling\b/, 'the shape check is the library\'s');
  assert.match(src, /humanRuling:\s*RULING/, 'and the normalised ruling reaches runJob — refused-but-unwired would pause forever');
  assert.doesNotMatch(src, /\['accept', 'rerun', 'pause'\]/, 'the door list is never re-spelled here');
});

// ══ the evidence package, as a pure rendering ══════════════════════════════════

test('ruling 2: the package renders the ask, every stage, the changed set and the doors', () => {
  const pause = pausedSpine().find((e) => e.type === 'hitl-pause');
  const lines = evidencePackage({ pause, diff: null }).join('\n');
  assert.match(lines, /Does this fix read like something you would ship\?/);
  assert.match(lines, /changed-from-seed +satisfied/);
  assert.match(lines, /63 → 0/, 'a measured stage shows its baseline and its value, which is the before/after a number can state');
  assert.match(lines, /scanned 4 added lines/, 'and a stage that announced something says it (F28 — the announcement is the trim\'s honesty)');
  assert.match(lines, /src\/fix\.js/);
});

test('ruling 2: a package with NOTHING to show says so rather than rendering an empty screen', () => {
  const lines = evidencePackage({ pause: { stage: 'signer-reviews', stages: [], changed: {} }, diff: null }).join('\n');
  assert.match(lines, /no stage results on the checkpoint/i);
  assert.match(lines, /no changed files recorded/i);
  assert.doesNotMatch(lines, /undefined|null/, 'an absence is written as prose, never as a rendered null');
});

test('F28/F6: the package announces a trimmed change list and reports an unreadable one as UNKNOWN', () => {
  const trimmed = evidencePackage({
    pause: { stage: 's', stages: [], changed: { paths: ['a.js', 'b.js'], more: 40 } },
    diff: null,
  }).join('\n');
  assert.match(trimmed, /40 more/, 'the trim is announced, never silent');

  const blind = evidencePackage({
    pause: { stage: 's', stages: [], changed: { paths: [], unreadable: 'INSTRUMENT: the seed commit does not exist' } },
    diff: null,
  }).join('\n');
  assert.match(blind, /UNKNOWN/);
  assert.match(blind, /seed commit does not exist/, 'and the reason travels with it');
  assert.doesNotMatch(blind, /nothing changed/i, 'an unreadable set is never rendered as a clean tree (F6)');
});

test('ruling 2: the line-level diff is rendered when it is there, and its ABSENCE is named when it is not', () => {
  const pause = pausedSpine().find((e) => e.type === 'hitl-pause');
  const withDiff = evidencePackage({
    pause,
    diff: { lines: ['diff --git a/src/fix.js b/src/fix.js', '+const x = 1;'], truncated: 12, untracked: ['new.js'], unavailable: null },
  }).join('\n');
  assert.match(withDiff, /\+const x = 1;/, 'the actual lines, which is what "never a bare approve?" means');
  assert.match(withDiff, /12 more diff line/, 'a capped diff announces its cap');
  assert.match(withDiff, /new\.js/, 'and an untracked file has no diff at all, so it is named separately rather than missed');

  const without = evidencePackage({ pause, diff: { lines: [], truncated: 0, untracked: [], unavailable: 'the patient is not readable from here' } }).join('\n');
  assert.match(without, /line-level diff UNAVAILABLE/);
  assert.match(without, /not readable from here/);
});

// ══ THE PROVING JOB'S ROW — a runner half with no signer half yet ══════════════
//
// `litectx-maintainer` is N4's hitl proving job (hamr's ruling, 2026-08-13) and its
// spec is authored LIVE, through the interview and run-author, and signed by hamr.
// So the table row exists before the spec does, and the runner has to say which of
// the two halves is missing rather than dying on a `readFileSync` stack.
//
// The assertion below reads the FILESYSTEM to decide which world it is in, and
// asserts the whole of the behaviour in either: before the spec is authored, a
// refusal that names it; after, an ordinary preview. What holds in BOTH — and is the
// thing the fix is actually about — is that no ENOENT ever reaches the operator.

test('the proving job refuses BY NAME while its spec is unauthored, and never crashes either way', () => {
  const specPath = new URL('../jobs/litectx-maintainer.json', import.meta.url).pathname;
  const { code, out } = preview([], 'litectx-maintainer');
  assert.doesNotMatch(out, /ENOENT|no such file or directory/, 'the runner answers; the filesystem does not answer for it');
  assert.doesNotMatch(out, /^\s+at .*run-u\.mjs/m, 'and it never answers with a stack trace');
  if (existsSync(specPath)) {
    assert.equal(code, 0, 'once the spec is authored and on disk, this is an ordinary preview');
    assert.match(out, /hash {5}[0-9a-f]{64}/, 'with a hash to approve');
  } else {
    assert.equal(code, 2, 'an unauthored job is an operator stop, not a run');
    assert.match(out, /there is no spec at .*litectx-maintainer\.json/);
    assert.match(out, /run-interview\.mjs and scripts\/run-author\.mjs/, 'and it names where a spec comes from');
    assert.match(out, /no hash to approve/);
  }
});

test('the row carries the runner\'s half only — a patient COPY, its own seed, and its own spine', () => {
  const src = readFileSync(RUNNER, 'utf8');
  const row = src.slice(src.indexOf("'litectx-maintainer': {"));
  assert.match(row.slice(0, 300), /workdir: '\/home\/hamr\/PycharmProjects\/bareloop-patients\/litectx-maintainer'/,
    'a patient is ALWAYS a separate copy — the copy is the blast radius');
  assert.match(row.slice(0, 300), /spine: 'litectx-maintainer-bareloop'/);
  assert.match(row.slice(0, 300), /seed: '[0-9a-f]{40}'/, 'and a real 40-char seed, which is what the cold reset resets to');
});

// ══ WHERE THE RESUME PICKS UP — the phase a pause actually stops in ════════════
//
// The preview's "at" line says what the dollars being signed will buy. It knew two
// phases, `steps` and `close`, and a PAUSE is neither: it happens AFTER the plan's
// steps, at the close's human stage, so the step arithmetic ran off the end of the
// plan and printed `at step 2 of 1 "(unknown)"` — a step count that exceeds the plan
// and a step id nobody drafted. A person reading that cannot tell what they are
// paying for, which is the one job this line has.

test('#9 the pause is a PHASE, not a step past the end of the plan', () => {
  const seed = { phase: 'steps', plan: { steps: [{ id: 'fix-types' }] }, completedSteps: [{ id: 'fix-types' }] };
  const lines = resumeAtLines({ seed, paused: true }).join('\n');
  assert.match(lines, /the human review/, 'the phase is named in plain words');
  assert.match(lines, /all 1 step\(s\) finished/, 'and how much of the plan is behind it');
  assert.doesNotMatch(lines, /step 2 of 1/, 'never a step count that exceeds the plan');
  assert.doesNotMatch(lines, /\(unknown\)/, 'and never a step id nobody drafted');
});

test('#9 a pause that never got a plan says THAT, rather than borrowing the cold-start line', () => {
  // the other pause site (src/planrun.js's close PRECHECK): every mechanical stage
  // already passed on the untouched tree, so the run asked its person before drafting
  // anything. "nothing paid is re-payable" is true and "the beginning" is not the phase.
  const lines = resumeAtLines({ seed: null, paused: true }).join('\n');
  assert.match(lines, /the human review/);
  assert.match(lines, /no plan was ever accepted/i);
  assert.doesNotMatch(lines, /step \d+ of/, 'there is no step to name');
});

test('#9 CONTROL: the two phases the line already knew are unchanged', () => {
  const steps = resumeAtLines({
    seed: { phase: 'steps', plan: { steps: [{ id: 'a' }, { id: 'b' }] }, completedSteps: [{ id: 'a' }] },
    paused: false,
  }).join('\n');
  assert.match(steps, /at {7}step 2 of 2 "b" — 1 already finished and SKIPPED, not re-paid/);
  assert.match(steps, /the plan is reloaded/);

  const close = resumeAtLines({
    seed: { phase: 'close', plan: { steps: [{ id: 'a' }] }, completedSteps: [{ id: 'a' }] },
    paused: false,
  }).join('\n');
  assert.match(close, /at {7}the close and its fix loop — all 1 step\(s\) are done and are SKIPPED; the close re-runs for no tokens/);

  const cold = resumeAtLines({ seed: null, paused: false }).join('\n');
  assert.match(cold, /at {7}the beginning — it halted before a plan was accepted/);
  assert.doesNotMatch(cold, /the plan is reloaded/, 'there is no plan to reload');
});

test('#9 a non-paused halt with every step finished does not walk off the end either', () => {
  // the same arithmetic, one terminal over: a kill between the last step and the close
  // leaves `phase:'steps'` with the plan exhausted, and the old line read `step 3 of 2`.
  const lines = resumeAtLines({
    seed: { phase: 'steps', plan: { steps: [{ id: 'a' }, { id: 'b' }] }, completedSteps: [{ id: 'a' }, { id: 'b' }] },
    paused: false,
  }).join('\n');
  assert.match(lines, /all 2 step\(s\) finished/);
  assert.doesNotMatch(lines, /step 3 of 2/);
  assert.doesNotMatch(lines, /\(unknown\)/);
});

test('#9 E2E: the real preview of a paused checkpoint names the review, not a step past the plan', () => {
  const { code, out } = preview(['--resume', spineFile(pausedSpine())]);
  assert.equal(code, 0);
  assert.doesNotMatch(out, /step 2 of 1/, 'the bug, through the real script');
  assert.match(out, /at {7}the human review — all 1 step\(s\) finished/);
});

// ══ the END-OF-RUN readouts — where a person first meets the pause ══════════════
//
// Past the approval gate, past a real patient and a real `runJob`, so no preview can
// drive them (the same reason the stall and money-halt readouts in tests/resume-u.js
// are pinned in source). What is pinned is what they must not stop doing.

test('§5.2 the PAUSE readout shows the package and the doors where the person is standing', () => {
  const src = readFileSync(RUNNER, 'utf8');
  const at = src.indexOf('if (outcome === HITL_PAUSE) {');
  assert.ok(at > 0, 'the pause readout exists');
  const end = src.indexOf('\n}', at);
  assert.ok(end > at);
  const block = src.slice(at, end);
  assert.match(block, /printPauseEvidence\(/, 'the same package the preview renders — never a second assembly of one run\'s facts');
  assert.match(src, /const printPauseEvidence = [\s\S]*?evidencePackage\(\{ pause, diff: readDiff\(paths\) \}\)/,
    'and the shared renderer is the one that assembles it, for both screens');
  assert.match(block, /doorLines\(/, 'and the three doors, in the one order that is a rule');
  assert.match(block, /--resume \$\{runid\}/, 'with the actual resume invocation, not the idea of one');
  assert.match(block, /--approve \$\{specHash\}/, 'and the hash ALREADY signed: a decision moves no allowance, so nothing here needs re-signing');
  assert.doesNotMatch(block, /\bdie\(|process\.exit/, 'a readout never changes the run\'s own exit');
});

test('§1 the PAUSE door launches NOTHING and keeps the checkpoint the operator already has', () => {
  // The door that used to end the run now keeps it. The hazard this shape avoids is
  // measured, not stylistic: this runner writes one spine per LEG, and a leg that
  // returns before drafting emits no `plan-accepted` and no `step-end` — which is all
  // `readStepCheckpoint` reads. A launched "not now" would therefore mint a runid whose
  // checkpoint is empty, and resuming THAT one re-drafts and re-pays for finished work.
  const src = readFileSync(RUNNER, 'utf8');
  const at = src.indexOf("if (PAUSED && RULING?.decision === 'pause') {");
  assert.ok(at > 0, 'the pause door is answered in the runner');
  const end = src.indexOf('\n}', at);
  const block = src.slice(at, end);
  assert.match(block, /PAUSED BY YOU/);
  assert.match(block, /nothing was run and nothing was spent/, 'a pause costs nothing — that is the whole of it');
  assert.match(block, /--resume \$\{RESUME\}/, 'and it points at the SAME runid: the checkpoint that matters is the one already on disk');
  assert.match(block, /process\.exit\(0\)/, 'it exits before the key, the spine and the launch — nothing downstream runs');
  assert.ok(at < src.indexOf('const apiKey = process.env.ANTHROPIC_API_KEY'), 'above the key: nothing about saying "not now" needs a secret');
});

test('§1 the pause door is REACHABLE and silent about money: a signed `--decide pause` exits 0 having launched nothing', () => {
  const { code, out } = preview(['--resume', spineFile(pausedSpine()), '--decide', 'pause', '--approve', jobSpecHash(SPEC)]);
  assert.equal(code, 0, out);
  assert.match(out, /PAUSED BY YOU/);
  assert.match(out, /60 days/, 'the TTL is the library\'s number, stated rather than implied');
  assert.doesNotMatch(out, /ANTHROPIC_API_KEY not set/, 'it never reaches the key');
  assert.doesNotMatch(out, /outcome +hitl-pause/, 'and it never launched a run: there is no leg to report');
});

test('§1 a pause writes NO bridge: the artifact is minted by a green, and a pause is not one', () => {
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /if \(outcome === 'green' && plan && !leaks\.length\)/,
    'the bridge gate still reads the GREEN terminal only — a checkpoint that graduated a reusable plan would mint learning credit no close ever rendered');
});

test('§1/W-2 a paused run whose WALL is gone refuses, and NAMES that the decision is stuck behind it', () => {
  // The interaction worth stating out loud rather than discovering in a live run: a
  // pause keeps the clock stopped (ruling 1), but a run that had already burnt its
  // wall when it paused cannot be answered at all — not even with an `accept`, which
  // buys no worker round. The wall is governance and the runner does not get to rule
  // that some decisions are free of it; the lever is a signed spec edit.
  const wallMin = SPEC.maxWallMs / 60_000;
  const t = (/** @type {number} */ m) => new Date(Date.parse('2026-08-04T10:00:00.000Z') + m * 60_000).toISOString();
  const burnt = pausedSpine({ at: t(wallMin + 5) });
  const { code, out } = preview(['--resume', spineFile(burnt), '--decide', 'accept', '--approve', jobSpecHash(SPEC)]);
  assert.equal(code, 2);
  assert.match(out, /WALL ALREADY EXHAUSTED/);
  assert.match(out, /waiting on a DECISION and its wall is gone/, 'the consequence is named, not left to be discovered');
  assert.match(out, /RAISE maxWallMs/, 'and the lever is the same signed spec edit every other wall stop names');
  assert.doesNotMatch(out, /ANTHROPIC_API_KEY not set/, 'still above the key');
});
