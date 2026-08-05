// PRD v1.46 §3 — `--resume` on the U runner, as the operator actually meets it.
//
// These drive the REAL script through its PREVIEW path (no `--approve`), which is
// everything before a key is read and before a dollar is committed: the spine is
// parsed, the halt is classified, the fold is arithmetic'd and every refusal gate
// fires. The preview is also the thing hamr signs against, so what it prints is
// behaviour under test, not decoration.
//
// The preview path is the ONLY path these may take. Past the approval gate the script
// resolves a real patient repository from its own JOBS table and (on a cold launch)
// hard-resets it — so a test that supplied a matching hash would reset an operator's
// tree. The gate sits before that by construction, and one test below pins the
// ordering in source so a future edit cannot quietly move the reset above it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
// the runner's OWN hash function: the launch-path tests below sign with the real
// signature rather than a literal, so a spec edit cannot leave them approving a
// version that no longer exists
import { jobSpecHash } from '../src/job.js';

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;
const SPEC = JSON.parse(readFileSync(new URL('../jobs/bareagent-u-types.json', import.meta.url), 'utf8'));

const base = mkdtempSync(join(tmpdir(), 'resume-u-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;

/** a halted DIRECT spine, written to a real file the way the runner reads one */
function spineFile(events) {
  const f = join(base, `u-fixture-${n += 1}.jsonl`);
  writeFileSync(f, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return f;
}

/** the shape a real halted U run leaves: job-start, a plan, a finished step, rounds,
 * and the terminal it stopped on. Only the fields the reader reads are spelled. */
const haltedSpine = ({ outcome = 'cap-halt', job = SPEC.job, rounds = [0.9, 1.1], steps = ['fix-types'] } = {}) => [
  { type: 'job-start', job, specHash: 'old-hash-0000', budgetUsd: SPEC.budgetUsd, shape: 'plan', goal: SPEC.goal, ts: '2026-08-04T10:00:00.000Z', seq: 1 },
  { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: steps.map((id) => ({ id })) }, ts: '2026-08-04T10:02:00.000Z', seq: 2 },
  ...rounds.map((c, i) => ({ type: 'worker-round', kind: 'turn', costUsd: c, ts: '2026-08-04T10:05:00.000Z', seq: 3 + i })),
  ...steps.map((id, i) => ({ type: 'step-end', step: id, outcome: 'green', ts: '2026-08-04T10:10:00.000Z', seq: 20 + i })),
  { type: 'outer-close', verdict: 'needs_revision', stage: 'no-suppressions', ts: '2026-08-04T10:12:00.000Z', seq: 40 },
  { type: 'job-end', outcome, spentUsd: rounds.reduce((a, b) => a + b, 0), spendComplete: true, ts: '2026-08-04T10:20:00.000Z', seq: 41 },
];

/**
 * Run the preview (no --approve): it must never reach the API key or the patient.
 *
 * The bound is generous ON PURPOSE. This spawns a real script that imports bare-agent
 * and litectx, and the whole file does it a dozen-plus times — under a loaded full
 * suite that startup is nowhere near its solo cost. A 30s bound flaked exactly once
 * here, at 30.5s, and the flake is worse than the wait: the timeout kill leaves
 * `status: null`, which a bare `assert.equal(code, 0)` reports as "null !== 0" — an
 * environment stall wearing the costume of a wrong exit code.
 *
 * So a non-exit is DIAGNOSED rather than compared: a killed process rendered no
 * verdict about the runner, and saying so is the same rule the close's own
 * `noExit` guard follows.
 */
const preview = (args) => {
  const r = spawnSync(process.execPath, [RUNNER, '--job', 'bareagent-types', ...args], {
    encoding: 'utf8', timeout: 240_000, env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === null) {
    throw new Error(`run-u.mjs never exited (${r.error?.code ?? r.signal ?? 'no error, no signal'}) — the runner rendered NO verdict, so nothing here is a reading of its behaviour. Output so far:\n${out.slice(0, 400)}`);
  }
  return { code: r.status, out };
};

test('§3 the resume PREVIEW states what is inherited: the fold, the remainder, and where it picks up', () => {
  const f = spineFile(haltedSpine());
  const { code, out } = preview(['--resume', f]);
  assert.equal(code, 0, 'a preview with no --approve is a readout, not a refusal');
  assert.match(out, /RESUME/, 'it says plainly that this is a continuation, not a fresh run');
  assert.match(out, /\$2\.0000 and .* before the halt — FOLDED IN/, 'the halted run\'s own priced rounds, summed');
  assert.match(out, /left     \$6\.0000 of \$8/, 'so what it may still spend is the REMAINDER of the signed budget');
  assert.match(out, /at       the close and its fix loop/, 'every step finished, so it re-enters at the close');
  assert.match(out, /no re-scout, no re-draft/);
  assert.match(out, /NOT reset to the seed/, 'the patient keeps the work the halted run paid for');
});

test('§3 the resume PREVIEW names the TREND baselines it inherits — a readout that spans two legs must say where the earlier one came from', () => {
  // Rendered against the real script, because that is where a readout defect lives:
  // the grades cross the seam as counts, and the operator's only sight of them is
  // this line. Without it a resumed run can name a direction its own leg never
  // measured, with nothing on screen to say the number came from the leg before.
  const ev = haltedSpine();
  const withGrades = ev.flatMap((e) => (e.type !== 'outer-close' ? [e] : [
    { ...e, gap: 'close stage "no-suppressions" failed:\nBAREAGENT red: 12 suppression(s) added' },
    { type: 'fix-loop', gapBytes: 80, ts: '2026-08-04T10:13:00.000Z', seq: 40.1 },
    { type: 'ladder', governor: 'close-trend', stage: 'no-suppressions', value: 5, iteration: 1, ts: '2026-08-04T10:15:00.000Z', seq: 40.2 },
  ]));
  const { code, out } = preview(['--resume', spineFile(withGrades)]);
  assert.equal(code, 0);
  assert.match(out, /trend    2 close grade\(s\) inherited as baselines/, 'how many, and that they are BASELINES rather than this leg\'s own evidence');
  assert.match(out, /no-suppressions 12 → 5/, 'and the series itself, so the operator can check the instrument rather than trust it');
  assert.match(out, /spans BOTH legs/);
  assert.doesNotMatch(out, /suppression\(s\) added/, 'counts and stage names only — no close bytes reach the operator\'s screen, or the spine behind it');
});

test('§3 tripwire: the runner still HANDS the inherited grades to runJob, not just prints them', () => {
  // The preview line and the wiring are two different things, and the preview passing
  // proves only the first. A `resumeGrades` that is rendered and never forwarded is the
  // silently-ignored-parameter class F50 named — the readout would keep promising a
  // chain reading the run never receives, and no behaviour test can see it from here
  // (the script cannot be imported: it is top-level and it spends money past the gate).
  // Loose on purpose: the two semantic pieces only, so reformatting cannot red this.
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /resumeGrades:\s*dead\.restart\.grades/,
    'the dead leg\'s grades must reach runJob — printed-but-unwired is a readout that lies about what the run is doing');
  assert.match(src, /grades\?\.length\s*\?/,
    'and only when there ARE grades: an empty array is the cold path, and the cold path must stay byte-identical');
});

test('§3 the preview says so when there is NOTHING to inherit — silence would read as "no seam here"', () => {
  // the stock fixture's outer-close carries no gap at all, so no grade is readable
  const { code, out } = preview(['--resume', spineFile(haltedSpine())]);
  assert.equal(code, 0);
  assert.match(out, /trend    no close grade to inherit — this leg's readout is judged on its own evidence/,
    'an absence is stated, never rounded up to a baseline (F6) and never left blank');
});

test('§3 the preview NAMES the hash change a top-up causes rather than hiding it — budgetUsd is in the signature', () => {
  const { out } = preview(['--resume', spineFile(haltedSpine())]);
  assert.match(out, /old-hash-000/, 'the hash the halted run was signed under');
  assert.match(out, /that is what a TOP-UP looks like/i);
  assert.match(out, /re-validated against THIS spec/, 'and the reloaded plan is re-gated, never grandfathered');
});

test('§3 REFUSED: a run that GREENED has nothing to resume', () => {
  const { code, out } = preview(['--resume', spineFile(haltedSpine({ outcome: 'green' }))]);
  assert.equal(code, 2);
  assert.match(out, /already GREENED/);
});

test('§3 REFUSED: a run that reached a real VERDICT is not a halt — only a governance stop leaves work to continue', () => {
  for (const outcome of ['escalated', 'step-red', 'plan-red', 'provider-red']) {
    const { code, out } = preview(['--resume', spineFile(haltedSpine({ outcome }))]);
    assert.equal(code, 2, `${outcome} must not be resumable`);
    assert.match(out, /reached its own terminal/, `${outcome}: the refusal names why`);
    assert.match(out, /cap-halt \/ wall-halt/, 'and names what IS resumable');
  }
});

test('§3 REFUSED: a WALL halt IS resumable — the W-2 symmetry, not an exception', () => {
  const { code, out } = preview(['--resume', spineFile(haltedSpine({ outcome: 'wall-halt' }))]);
  assert.equal(code, 0);
  assert.match(out, /RESUME/);
});

test('§3 REFUSED: another job\'s spine — a resume continues ONE job, never substitutes a plan across jobs', () => {
  const { code, out } = preview(['--resume', spineFile(haltedSpine({ job: 'some-other-job' }))]);
  assert.equal(code, 2);
  assert.match(out, /is job "some-other-job"/);
});

test('§3 REFUSED: a spine that is not a run at all, and one that does not exist', () => {
  const empty = spineFile([{ type: 'runner-start', pid: 1 }]);
  assert.equal(preview(['--resume', empty]).code, 2);
  assert.match(preview(['--resume', empty]).out, /carries no job-start/);
  const missing = preview(['--resume', join(base, 'nope.jsonl')]);
  assert.equal(missing.code, 2);
  assert.match(missing.out, /no spine at/);
});

test('§3 a kill mid-append leaves a truncated LAST line, and that is the shape resume tolerates — anywhere else is a corrupt log', () => {
  const events = haltedSpine();
  const good = join(base, `u-trunc-${n += 1}.jsonl`);
  writeFileSync(good, `${events.map((e) => JSON.stringify(e)).join('\n')}\n{"type":"worker-ro`);
  const okRun = preview(['--resume', good]);
  assert.equal(okRun.code, 0, 'the expected kill shape is continued, not refused');
  assert.match(okRun.out, /ignoring a truncated final line/, 'and the tolerance is ANNOUNCED, never silent');

  const bad = join(base, `u-corrupt-${n += 1}.jsonl`);
  const broken = events.map((e) => JSON.stringify(e));
  broken.splice(2, 0, '{"type":"worker-ro');
  writeFileSync(bad, `${broken.join('\n')}\n`);
  const badRun = preview(['--resume', bad]);
  assert.equal(badRun.code, 2);
  assert.match(badRun.out, /corrupt at line/);
});

test('§3 CONTROL: without --resume the runner is byte-for-byte the cold launch it always was', () => {
  const { code, out } = preview([]);
  assert.equal(code, 0);
  assert.doesNotMatch(out, /RESUME/);
  assert.match(out, /user-mode e2e, ONE run/);
});

test('§3 ORDERING (source tripwire): the resume read and the approval gate both sit ABOVE the patient reset', () => {
  // A preview must never touch a patient. That is guaranteed by ORDER, so the order
  // is what is pinned: if a future edit moves the reset up, every test in this file
  // starts hard-resetting an operator's real repository instead of failing.
  const src = readFileSync(RUNNER, 'utf8');
  const readAt = src.indexOf('readResume(deadEvents');
  const gateAt = src.indexOf("if (arg('approve') !== specHash)");
  const resetAt = src.indexOf("git(['reset', '--hard', SEED])");
  assert.ok(readAt > 0 && gateAt > 0 && resetAt > 0, 'all three sites still exist');
  assert.ok(readAt < gateAt, 'the spine is read BEFORE the gate — the operator signs knowing what will be inherited');
  assert.ok(gateAt < resetAt, 'and nothing touches the patient before the signature');
  // and the reset is SKIPPED on a resume rather than merely reordered
  assert.match(src, /if \(dead\) \{[\s\S]*resumeTreeGate\(/, 'a resume goes through the tree GATE, not the reset');
});

test('§3 a resume whose allowance is ALREADY SPENT says so plainly — the commonest resume there will ever be is exactly this one', () => {
  // The shape read off the real halted run (u-msew1uy5, which overspent its budget by
  // $0.13): the remainder is NEGATIVE by construction. A minus sign in a number column
  // is not a warning, and signing the hash unchanged buys an immediate re-halt for a
  // close precheck's worth of nothing. (Rounds track the SIGNED budget — $8 since the
  // 2026-08-04 "go 8/45" top-up — overspent by the same $0.13.)
  const { code, out } = preview(['--resume', spineFile(haltedSpine({ rounds: [5.0, 3.13] }))]);
  assert.equal(code, 0);
  assert.match(out, /NOTHING LEFT/);
  assert.match(out, /budgetUsd \$8 is already spent \(over by \$0\.1300\)/);
  assert.match(out, /RAISE the number\(s\)/);
  assert.match(out, /that is a spec edit, so the hash below changes and you sign the new one/);
});

// ── W-2 on the LAUNCH side: a wall remainder of nothing is a refusal ────────────
// The preview's warning above covers the money arm; the WALL arm of the same block
// had never been driven, and past it the runner used to launch anyway and hand the
// outside guard `--wall-ms 0` — which u-watchdog defaulted to null, arming no
// deadline at all while this banner still claimed a wall. Doctrine: past the wall
// nothing new starts, and the stop is decision-ready with the lever named.

/** a halted spine whose OWN clock spans `minutes` — the fold `readResume` computes is
 * death-minus-start, so this is the only way to drive the wall arm */
const longSpine = (minutes) => {
  const t = (/** @type {number} */ m) => new Date(Date.parse('2026-08-04T10:00:00.000Z') + m * 60_000).toISOString();
  return [
    { type: 'job-start', job: SPEC.job, specHash: 'old-hash-0000', budgetUsd: SPEC.budgetUsd, shape: 'plan', goal: SPEC.goal, ts: t(0), seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: t(1), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.5, ts: t(2), seq: 3 },
    { type: 'step-end', step: 'fix-types', outcome: 'green', ts: t(minutes - 1), seq: 20 },
    { type: 'job-end', outcome: 'wall-halt', spentUsd: 0.5, spendComplete: true, ts: t(minutes), seq: 41 },
  ];
};

test('§3 the WALL arm of the exhausted-allowance warning fires on its own, on the time axis', () => {
  const { code, out } = preview(['--resume', spineFile(longSpine(50))]);
  assert.equal(code, 0);
  assert.match(out, /NOTHING LEFT/);
  assert.match(out, /maxWallMs 45min is already burnt/, 'the TIME lever, named on its own — the money is untouched here');
  assert.doesNotMatch(out, /budgetUsd .* is already spent/, 'and the money arm does not fire: $0.50 of $8 is not the problem');
});

test('§3 a resume with NO WALL LEFT is REFUSED at launch, before the key and before the patient', () => {
  // Driven with the REAL signature, which is what makes this the launch path and not
  // another preview: past the gate the runner must stop on its own wall rather than
  // buy a scout and a precheck for a clock that has already run out. The key is empty
  // in this environment, so a runner that did NOT refuse would fall through to the
  // API-key check — a different exit-2 with a different message, which is exactly what
  // the second assertion separates.
  const { code, out } = preview(['--resume', spineFile(longSpine(50)), '--approve', jobSpecHash(SPEC)]);
  assert.equal(code, 2, 'an operator-owned stop, on this file\'s convention (0 preview / 2 operator error)');
  assert.match(out, /WALL ALREADY EXHAUSTED/);
  assert.doesNotMatch(out, /ANTHROPIC_API_KEY not set/, 'it stops ABOVE the key read — nothing about this needs a secret');
  assert.match(out, /RAISE maxWallMs/, 'and it names the lever, which is a spec edit and therefore a new signature');
});

test('§3 CONTROL: a resume with wall left is NOT refused — it goes on to the ordinary launch path', () => {
  // The should-differ half. Same signature, same code path, one changed number: 20
  // minutes burnt of 45 leaves 25, and the runner must walk straight past the wall
  // refusal into the key check it always did.
  const { code, out } = preview(['--resume', spineFile(longSpine(20)), '--approve', jobSpecHash(SPEC)]);
  assert.equal(code, 2);
  assert.doesNotMatch(out, /WALL ALREADY EXHAUSTED/);
  assert.match(out, /ANTHROPIC_API_KEY not set/, 'the next gate down is where a healthy resume lands');
});

test('§3 CONTROL: a resume with allowance still on the table does NOT cry wolf', () => {
  const { out } = preview(['--resume', spineFile(haltedSpine({ rounds: [0.5] }))]);
  assert.doesNotMatch(out, /NOTHING LEFT/);
  assert.match(out, /left     \$7\.5000 of \$8/);
});

// ══ F83's small unfixed item: the END banner framed wall and money differently ═
//
// The preview above is the only path these tests can drive — the end-of-run banner
// sits past the approval gate, past a real patient reset and past a real `runJob`, so
// no test in this file has ever read it. Its wall line was the leg's own stopwatch
// (`Date.now() - started`) printed against the FULL signed cap, one line under a money
// line printing `job-end`'s FOLDED total against the same signed cap. Measured on
// u-msf70nei: `wall 12.8min of 45min` for a leg that resumed onto 24.9 already-burnt
// minutes — the enforcement was right (the clock folded them, the watchdog armed on
// the 20.1min remainder), the READING was not.
//
// The arithmetic is now one exported function, which is what makes it testable at all.
import { wallLine } from '../scripts/u-readout.mjs';

test('§3 banner: on a RESUMED leg the wall reads FOLDED against the signed cap — and still shows the leg, so neither number goes blind', () => {
  // the real u-msf70nei numbers: 24.9min inherited, 12.8min bought in this leg
  const line = wallLine({ legMs: 12.8 * 60_000, priorWallMs: 24.9 * 60_000, wallLabel: '45min' });
  assert.equal(line, '37.7min of 45min (this leg 12.8min)',
    'the total governs the cap (it is what the clock enforces), and the leg stays visible beside it');
});

test('§3 banner CONTROL: a NON-resumed run renders exactly as it always did — no fold, no parenthetical', () => {
  assert.equal(wallLine({ legMs: 12.8 * 60_000, priorWallMs: 0, wallLabel: '45min' }), '12.8min of 45min');
  assert.equal(wallLine({ legMs: 12.8 * 60_000, wallLabel: '45min' }), '12.8min of 45min',
    'a cold run passes no fold at all, and an absent fold is a real zero');
  assert.equal(
    wallLine({ legMs: 90_000, wallLabel: 'UNBOUNDED (spec sets no maxWallMs — deliberate operator choice; no outside deadline)' }),
    '1.5min of UNBOUNDED (spec sets no maxWallMs — deliberate operator choice; no outside deadline)',
    'the unbounded label is passed through untouched — a run with no cap still reports the time it took',
  );
});

test('§3 banner: a garbage fold contributes ZERO — the readout can never claim MORE wall than the leg actually took', () => {
  // the belt every sibling fold site carries (clock.js `prior`, readResume's four):
  // a NaN would print `NaNmin` and a negative would under-report the run
  for (const bad of [-60_000, NaN, Infinity, null, undefined, 'soon']) {
    assert.equal(wallLine({ legMs: 60_000, priorWallMs: /** @type {any} */ (bad), wallLabel: '45min' }), '1.0min of 45min',
      `a ${String(bad)} fold is 0, never a rendered NaN and never a subtraction`);
  }
});

test('§3 banner: the runner prints the folded line through THIS function — a second arithmetic in the script is how the two numbers disagreed in the first place', () => {
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /wall {6}\$\{wallLine\(/, 'the banner calls the shared helper');
  assert.doesNotMatch(src, /\$\{elapsedMin\}min of/, 'and the old leg-only spelling is gone, not merely shadowed');
});
