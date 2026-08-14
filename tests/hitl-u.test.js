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
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deathAtOf } from '../scripts/u-readout.mjs';

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
    options: ['accept', 'rerun', 'cancel'],
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
